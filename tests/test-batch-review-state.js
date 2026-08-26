'use strict';

const { createBatchReviewState } = require('../plugins/data-secure/server/gateway/batch-review-state');
const batchFacade = require('../plugins/data-secure/server/gateway/batch');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch review state boundary');
const reviewState = createBatchReviewState({ deferredReviewStatus: 'deferred_review' });

function progress(overrides = {}) {
  return { remaining: 0, retryable: 0, delivery_pending: 0, mapping_pending: 0, released: 0, stopped: 0, ...overrides };
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
  assert.strictEqual(reviewState.deferredReviewPlan(base, progress()).ready, true);

  for (const [state, value] of [
    [{ items: [{ status: 'released' }] }, progress()],
    [base, progress({ remaining: 1 })],
    [base, progress({ retryable: 1 })],
    [base, progress({ delivery_pending: 1 })]
  ]) {
    assert.strictEqual(reviewState.deferredReviewPlan(state, value).ready, false);
  }

  assert.strictEqual(reviewState.deferredReviewPlan(base, progress({ mapping_pending: 9, released: 5, stopped: 2 })).ready, true);
});

test('not-ready messages retain their fixed priority without interpolation', () => {
  const deferred = { status: 'deferred_review', name: 'PII-FILENAME' };
  const state = { items: [deferred], token: 'PII-TOKEN' };
  const cases = [
    [progress({ remaining: 1, delivery_pending: 1, retryable: 1 }), 'Der Stapel analysiert noch weitere Dateien. Die gemeinsame lokale Prüfung startet erst danach.'],
    [progress({ delivery_pending: 1, retryable: 1 }), 'Ein bereits freigegebenes Paket muss zuerst gelesen und bestätigt werden.'],
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
  const value = progress();
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
