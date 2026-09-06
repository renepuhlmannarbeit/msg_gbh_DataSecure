'use strict';

const { createBatchReviewState } = require('../plugins/data-secure/server/gateway/batch-review-state');
const { createBatchProgress } = require('../plugins/data-secure/server/gateway/batch-progress');
const { batchNextAction } = require('../plugins/data-secure/server/gateway/batch-next-action');
const { createBatchJournalStore } = require('../plugins/data-secure/server/gateway/batch-journal-store');
const { continueIntoLocalReview } = require('../plugins/data-secure/server/gateway/automatic-local-review');
const { notProcessedDocumentResult } = require('../plugins/data-secure/server/gateway/document-result-grade');
const path = require('node:path');
const batchFacade = require('../plugins/data-secure/server/gateway/batch');
const { createSuite } = require('./helpers');

const { test, testAsync, done, assert } = createSuite('Batch review state boundary');
const reviewState = createBatchReviewState({ deferredReviewStatus: 'deferred_review' });

function progress(overrides = {}) {
  const counts = { remaining: 0, retryable: 0, delivery_pending: 0, mapping_pending: 0, processing: 0,
    deferred_review: 1, released: 0, stopped: 0, ...overrides };
  return { batch_total: ['released', 'stopped', 'deferred_review', 'remaining', 'retryable',
    'delivery_pending', 'mapping_pending', 'processing'].reduce((sum, key) => sum + counts[key], 0),
  completed: counts.released + counts.stopped, ...counts };
}

test('marking changes only the exact supplied item references', () => {
  const selected = { status: 'pending', checkpoint: 'queued', untouched: true };
  const published = { status: 'released', checkpoint: 'released', package_id: 'opaque' };
  const other = { status: 'pending', checkpoint: 'queued' };
  const state = { items: [selected, published, other], metadata: 'unchanged' };
  const publishedBefore = structuredClone(published);
  const otherBefore = structuredClone(other);

  reviewState.markDeferredReview(state, [selected], 'LOCAL_REVIEW_DEFERRED');
  assert.deepStrictEqual(selected, {
    status: 'deferred_review',
    checkpoint: 'awaiting_local_review',
    error_code: 'LOCAL_REVIEW_DEFERRED',
    untouched: true
  });
  assert.deepStrictEqual(published, publishedBefore);
  assert.deepStrictEqual(other, otherBefore);
  assert.strictEqual(state.items[0], selected);
});

test('marking is idempotent and a later code changes only the error code', () => {
  const item = { status: 'pending', checkpoint: 'queued', retained: 1 };
  const state = { items: [item] };
  reviewState.markDeferredReview(state, [item], 'FIRST');
  const first = structuredClone(item);
  reviewState.markDeferredReview(state, [item], 'FIRST');
  assert.deepStrictEqual(item, first);
  reviewState.markDeferredReview(state, [item], 'SECOND');
  assert.deepStrictEqual(item, { ...first, error_code: 'SECOND' });
  reviewState.markDeferredReview(state, [], 'IGNORED');
  assert.deepStrictEqual(item, { ...first, error_code: 'SECOND' });
});

test('review readiness follows the exact truth table', () => {
  const deferred = { status: 'deferred_review' };
  const base = { items: [deferred, { status: 'released' }] };
  assert.strictEqual(reviewState.deferredReviewPlan(base, progress({ batch_total: 2, completed: 1, released: 1 })).ready, true);

  for (const [state, value] of [
    [{ items: [{ status: 'released' }] }, progress()],
    [base, progress({ remaining: 1 })],
    [base, progress({ retryable: 1 })],
    [base, progress({ delivery_pending: 1 })],
    [base, progress({ mapping_pending: 1 })],
    [base, progress({ processing: 1 })]
  ]) {
    assert.strictEqual(reviewState.deferredReviewPlan(state, value).ready, false);
  }

  const mixed = { items: [deferred, ...Array.from({ length: 5 }, () => ({ status: 'released' })),
    ...Array.from({ length: 2 }, () => ({ status: 'stopped' }))] };
  assert.strictEqual(reviewState.deferredReviewPlan(mixed, progress({ batch_total: 8, completed: 7, released: 5, stopped: 2 })).ready, true);
});

test('real progress, worker selection and review planning agree for every mixed state', () => {
  const { publicProgress } = createBatchProgress({
    deliveryPendingStatus: 'delivery_pending', deferredReviewStatus: 'deferred_review',
    mappingPendingStatus: 'mapping_pending', liveLocalExecutor: () => false,
    publishedPackageRecord: () => null
  });
  for (const other of ['pending', 'retryable', 'processing', 'delivery_pending', 'mapping_pending',
    'preflight_mapping_pending', 'stopped', 'released']) {
    const state = { items: [{ status: 'deferred_review' }, { status: other }] };
    const ready = ['stopped', 'released'].includes(other);
    const value = publicProgress(state);
    assert.strictEqual(reviewState.deferredReviewPlan(state, value).ready, ready, other);
    assert.strictEqual(batchNextAction(value), ready ? 'review' : 'batch', other);
    assert.strictEqual(value.batch_phase === 'awaiting_local_review', ready, other);
  }
  const state = { items: [{ status: 'deferred_review' }, { status: 'stopped', local_mapping_exported: false }] };
  const value = publicProgress(state);
  assert.strictEqual(value.mapping_pending, 1);
  assert.strictEqual(batchNextAction(value), 'batch');
  assert.strictEqual(reviewState.deferredReviewPlan(state, value).ready, false);
  assert.strictEqual(batchNextAction(publicProgress({ items: [{ status: 'stopped' }] })), 'none');
});

test('missing or untrusted counters never establish review readiness', () => {
  const state = { items: [{ status: 'deferred_review' }] };
  for (const field of ['remaining', 'retryable', 'delivery_pending', 'mapping_pending', 'processing', 'deferred_review', 'batch_total', 'completed']) {
    for (const invalid of [undefined, null, '0', -1, NaN]) {
      const value = progress({ [field]: invalid });
      assert.strictEqual(reviewState.deferredReviewPlan(state, value).ready, false, field);
      assert.strictEqual(batchNextAction(value), 'batch', field);
    }
  }
  for (const value of [progress({ batch_total: 2 }), progress({ completed: 1 }), progress({ batch_total: 0 })]) {
    assert.strictEqual(reviewState.deferredReviewPlan(state, value).ready, false);
    assert.strictEqual(batchNextAction(value), 'batch');
  }
});

testAsync('accepted journals with unaccounted positions never become review-ready or complete', async () => {
  const token = 'a'.repeat(64);
  const target = path.join(__dirname, 'synthetic-read-only-journal.json');
  const { publicProgress } = createBatchProgress({
    deliveryPendingStatus: 'delivery_pending', deferredReviewStatus: 'deferred_review',
    mappingPendingStatus: 'mapping_pending', liveLocalExecutor: () => false, publishedPackageRecord: () => null
  });
  for (const items of [[{ status: 'deferred_review' }, { status: 'unknown_checkpoint' }],
    [{ status: 'unknown_checkpoint' }], [{ status: 'deferred_review' }, {}],
    [{ status: 'stopped', error_code: 'SOURCE_CONTAINER_CORRUPT', document_result: notProcessedDocumentResult('SOURCE_CONTAINER_CORRUPT') },
      { status: 'unknown_checkpoint' }]]) {
    const bytes = Buffer.from(JSON.stringify({ schema: 'datasecure-batch/4', product_channel: 'standalone', token,
      created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(), items }));
    // Exercise the actual current journal reader; only disk handles and file
    // identity are synthetic. No journal-shape validation is replaced.
    const stat = { dev: 1n, ino: 2n, nlink: 1n, size: BigInt(bytes.length), mtimeNs: 1n,
      isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false };
    const parent = { ...stat, ino: 1n, isDirectory: () => true, isFile: () => false };
    const io = { constants: { O_RDONLY: 0 }, lstatSync: value => value === target ? stat : parent,
      openSync: () => 1, fstatSync: () => stat, readFileSync: () => bytes, closeSync() {} };
    const state = createBatchJournalStore({ io, batchPath: () => target }).readStateForMaintenance(token);
    const value = publicProgress(state);
    assert.strictEqual(value.batch_total, items.length);
    const completed = items.filter(item => item.status === 'stopped').length;
    assert.strictEqual(value.completed, completed);
    assert.strictEqual(value.completion_percent, Math.floor(completed * 100 / items.length));
    assert.strictEqual(value.complete, false);
    assert.strictEqual(value.batch_phase, 'invalid_local_state');
    assert.strictEqual(batchNextAction(value), 'batch');
    const plan = reviewState.deferredReviewPlan(state, value);
    assert.strictEqual(plan.ready, false);
    assert.strictEqual(plan.message, 'Der lokale Stapelstatus ist unvollständig oder ungültig. Die lokale Prüfung bleibt gesperrt; bitte den Status prüfen.');
    let claims = 0;
    const automatic = await continueIntoLocalReview(token, value, {
      claimLocalBatchExecutor() { claims++; throw new Error('UNEXPECTED_REVIEW'); }
    });
    assert.strictEqual(automatic.attempted, false);
    assert.strictEqual(claims, 0);
  }
});

test('not-ready messages retain their fixed priority without interpolation', () => {
  const deferred = { status: 'deferred_review', name: 'PII-FILENAME' };
  const state = { items: [deferred], token: 'PII-TOKEN' };
  const cases = [
    [progress({ remaining: 1, delivery_pending: 1, retryable: 1 }), 'Der Stapel analysiert noch weitere Dateien. Die gemeinsame lokale Prüfung startet erst danach.'],
    [progress({ delivery_pending: 1, retryable: 1 }), 'Ein bereits geprüftes Ergebnis muss zuerst sicher bereitgestellt werden. Die lokale Fortsetzung übernimmt diesen Schritt; eine KI-Auswertung ist dafür nicht erforderlich.'],
    [progress({ retryable: 1 }), 'Eine technische Unterbrechung muss zuerst ausdrücklich fortgesetzt werden.'],
    [progress(), null]
  ];
  for (const [value, expected] of cases) {
    const plan = expected === null
      ? reviewState.deferredReviewPlan({ items: [] }, value)
      : reviewState.deferredReviewPlan(state, value);
    assert.strictEqual(plan.message, expected || 'Für diesen Stapel gibt es keine vertagten lokalen Entscheidungen.');
    assert.doesNotMatch(plan.message, /PII-FILENAME|PII-TOKEN/u);
  }
});

test('planning is pure, preserves references and keeps the public facade', () => {
  const first = { status: 'deferred_review', order: 1 };
  const second = { status: 'released', order: 2 };
  const third = { status: 'deferred_review', order: 3 };
  const state = { items: [first, second, third], extra: { stable: true } };
  const value = progress({ batch_total: 3, completed: 1, released: 1, deferred_review: 2 });
  const stateBefore = structuredClone(state);
  const progressBefore = structuredClone(value);
  const plan = reviewState.deferredReviewPlan(state, value);
  assert.deepStrictEqual(plan.items, [first, third]);
  assert.strictEqual(plan.items[0], first);
  assert.strictEqual(plan.items[1], third);
  assert.deepStrictEqual(state, stateBefore);
  assert.deepStrictEqual(value, progressBefore);
  assert.strictEqual(typeof batchFacade.reviewDeferredBatch, 'function');
});

done();
