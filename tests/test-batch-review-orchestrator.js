'use strict';

const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchReviewOrchestrator } = require('../plugins/data-secure/server/gateway/batch-review-orchestrator');
const { createBatchContactReview } = require('../plugins/data-secure/server/gateway/batch-contact-review');
const batchFacade = require('../plugins/data-secure/server/gateway/batch');
const { reviewBatchTextLocally } = require('../plugins/data-secure/server/companion/text-review');
const { createBatchPseudonymState } = require('../plugins/data-secure/server/batch-pseudonym-context');
const { MAX_STANDALONE_REVIEW_FINDINGS } = require('../plugins/data-secure/server/gateway/standalone-review-budget');
const { documentStabilizationBlocked } = require('../plugins/data-secure/server/gateway/batch-execution-diagnostic');
const { createSuite } = require('./helpers');

const { test, testAsync, done, assert } = createSuite('Batch review orchestration boundary');

function codedError(code, message = code) {
  const error = new SafeError(message);
  error.code = code;
  return error;
}

function fixture(options = {}) {
  const token = 'token';
  const active = options.active || new Set();
  const events = [];
  const lifecycle = [];
  const releaseDiagnostics = [];
  const items = [{ status: 'deferred_review', id: 1 }, { status: 'deferred_review', id: 2 }];
  const state = { schema: 'datasecure-batch/4', items, invalidated: false };
  const drafts = [{ local: 1 }, { local: 2 }];
  const progress = { remaining: 0, retryable: 0, delivery_pending: 0, released: 0 };
  let writes = 0;
  const orchestrator = createBatchReviewOrchestrator({
    SafeError,
    active,
    acquireActiveLock(value) { events.push(`acquire:${value}`); if (options.acquireError) throw options.acquireError; },
    releaseActiveLock(value) {
      events.push(`release:${value}`);
      if (options.releaseError) throw options.releaseError;
      return options.refuseRelease !== true;
    },
    ...(options.epoch ? {
      captureOwnedEpoch(value) { events.push('epoch:capture'); assert.equal(value, token); return options.epoch; },
      releaseOwnedEpoch(value) {
        events.push('release:epoch');
        assert.strictEqual(value, options.epoch);
        return options.releaseEpoch ? options.releaseEpoch(value) : true;
      },
      releaseDelay: options.releaseDelay,
      recordBatchFailure(phase, error) {
        releaseDiagnostics.push({ phase, error_code: error.code });
        options.recordBatchFailure?.(phase, error);
      }
    } : {}),
    readState(value) { events.push(`read:${value}`); if (options.readError) throw options.readError; return state; },
    assertLocalExecutorAccess(value, pid) { events.push(`lease:${pid}`); assert.strictEqual(value, state); if (options.leaseError) throw options.leaseError; },
    reconcilePublishedItems() { events.push('reconcile:published'); if (options.publishedError) throw options.publishedError; return options.publishedReconciled === true; },
    reconcilePendingMappings() { events.push('reconcile:mapping'); if (options.mappingError) throw options.mappingError; return options.mappingReconciled === true; },
    writeState() { writes++; events.push('write'); if (options.writeErrorCall === writes) throw new Error('write failed'); },
    markInterruptedItemsRetryable() { events.push('recover:interrupted'); return options.interrupted || 0; },
    publicProgress() { events.push('progress'); return { ...progress }; },
    deferredReviewPlan(_state, value) {
      events.push('plan');
      assert.deepStrictEqual(value, progress);
      return options.notReady ? { ready: false, items: [], message: 'fixed not ready' } : { ready: true, items, message: null };
    },
    async captureDeferredReviewInput(_state, item) {
      const index = items.indexOf(item);
      events.push(`capture:${index + 1}`);
      if (options.captureErrorAt === index + 1) throw options.captureError || codedError('CAPTURE_FAILED', 'fixed capture');
      return drafts[index];
    },
    markDeferredReview(_state, selected, code) {
      events.push(`defer:${code}`);
      for (const item of selected) { item.status = 'deferred_review'; item.error_code = code; }
    },
    async runBatchReviewLocally(value, callOptions) {
      events.push('ui');
      assert.deepStrictEqual(value, drafts);
      assert.strictEqual(callOptions.allowDefer, true);
      assert.deepStrictEqual(callOptions.batchSummary, {
        batchTotal: 2,
        automaticallyCompleted: 0,
        safelyStopped: 0,
        otherPending: 0,
        previouslyReviewed: 0,
        reviewPendingTotal: 2
      });
      if (options.uiError) throw options.uiError;
      return options.outcome || { action: 'reviewed', documents: [{ document_index: 1 }, { document_index: 2 }] };
    },
    reviewTextLocally() {},
    ...(options.reviewContacts ? { reviewContacts: options.reviewContacts } : {}),
    async publishReviewedBatch(valueState, valueItems, valueDrafts, documents, deps) {
      events.push('publish');
      assert.strictEqual(valueState, state);
      assert.strictEqual(valueItems, items);
      assert.deepStrictEqual(valueDrafts, drafts);
      assert.strictEqual(valueDrafts[0], drafts[0]);
      assert.strictEqual(valueDrafts[1], drafts[1]);
      assert.strictEqual(documents, (options.outcome || {}).documents || documents);
      assert.strictEqual(deps.marker, 'caller');
      if (options.publicationError) throw options.publicationError;
      return options.publication || { packages: [{ opaque: true }], locallyReleased: 0, failed: 0 };
    },
    writeTerminalEvidence(value) { events.push('evidence'); assert.strictEqual(value, state); return options.evidence ?? true; },
    currentPlatform: () => 'test-platform'
  });
  const deps = { executorPid: 77, marker: 'caller', onReviewLifecycle(event) { lifecycle.push(event); } };
  return { orchestrator, token, active, events, lifecycle, releaseDiagnostics, items, state, drafts, progress, deps, writes: () => writes };
}

testAsync('review entry removes runtime option getters before contact reconstruction in both purposes and legacy', async () => {
  const content = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false };
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) for (const legacy of [false, true])
    for (const field of ['contentOptions', 'content_options', 'markdownOutput', 'scanOcr', 'imageOcr']) {
      let reads = 0, captures = 0;
      const f = fixture({ reviewContacts: async (_state, _items, deps) => {
        captures++;
        if (legacy) assert.equal(Object.hasOwn(deps, 'contentOptions'), false);
        else assert.deepEqual(deps.contentOptions, content);
        for (const alias of ['content_options', 'markdownOutput', 'scanOcr', 'imageOcr']) assert.equal(Object.hasOwn(deps, alias), false);
        throw codedError('LOCAL_REVIEW_DEFERRED');
      } });
      Object.assign(f.state, { schema: legacy ? mode === 'markdown-only' ? 'datasecure-batch/5' : 'datasecure-batch/6' : 'datasecure-batch/7',
        product_channel: 'standalone', processing_mode: mode, standalone_document_review: true, ...(legacy ? {} : { content_options: content }) });
      Object.defineProperty(f.deps, field, { enumerable: true, get() { reads++; throw new Error('OPTION_GETTER_EXECUTED'); } });
      assert.equal((await f.orchestrator.reviewDeferredBatch(f.token, f.deps)).error, 'LOCAL_REVIEW_DEFERRED');
      assert.equal(reads, 0); assert.equal(captures, 1);
    }
});

function findingFixture(counts, platform = 'darwin', standalone = false) {
  const items = counts.map((count, id) => ({ id: standalone ? id.toString(16).padStart(32, '0') : id,
    sha256: 'a'.repeat(64), count, source_label: `synthetic-${id}.txt`, status: 'deferred_review' }));
  const state = { schema: 'datasecure-batch/4', items, ...(standalone ? { token: 'd'.repeat(64), product_channel: 'standalone',
    ...createBatchPseudonymState({ productChannel: 'standalone' }) } : {}) };
  const active = new Set();
  const captured = [];
  const groups = [];
  const orchestrator = createBatchReviewOrchestrator({
    SafeError, active, acquireActiveLock() {}, releaseActiveLock() { return true; },
    readState: () => state, assertLocalExecutorAccess() {}, reconcilePublishedItems: () => false,
    reconcilePendingMappings: () => false, writeState() {}, markInterruptedItemsRetryable: () => 0,
    publicProgress: () => ({}), deferredReviewPlan: () => ({ ready: true, items }),
    currentPlatform: () => platform,
    captureDeferredReviewInput: async (_state, item) => {
      captured.push(items.indexOf(item));
      const text = 'Acme\n'.repeat(item.count);
      return { original_text: text, anonymized_text: text, ...(standalone ? { allowOrganizationReview: true } : {}), ambiguities: Array.from({ length: item.count }, (_, index) => ({
        ambiguity_id: `credential:v2:${String(index + 1).padStart(6, '0')}`,
        type: 'credential_issuer_ambiguous', original_start: index * 5, original_end: index * 5 + 4,
        anonymized_start: index * 5, anonymized_end: index * 5 + 4
      })) };
    },
    runBatchReviewLocally: reviewBatchTextLocally,
    reviewTextLocally: (draft, options) => {
      assert.strictEqual(options.platform, platform);
      groups.push({ findings: draft.ambiguities.length, progress: draft.batch_review });
      return { action: 'reviewed', redactions: [], decisions: draft.ambiguities.map((item) => ({
        ambiguity_id: item.ambiguity_id, decision: 'keep'
      })) };
    },
    publishReviewedBatch: async (_state, selected, drafts, documents) => {
      assert.deepStrictEqual(documents.map((document) => document.decisions.length), selected.map((item) => item.count));
      assert.strictEqual(drafts.length, selected.length);
      selected.forEach((item) => { item.status = 'released'; });
      return { packages: [], locallyReleased: selected.length, failed: 0 };
    },
    markDeferredReview: (_state, selected, code) => {
      for (const item of selected) { item.status = 'deferred_review'; item.error_code = code; }
    },
    writeTerminalEvidence: () => true
  });
  return { orchestrator, active, items, captured, groups };
}

function standaloneChoiceFixture(options = {}) {
  const count = MAX_STANDALONE_REVIEW_FINDINGS / 2 + 500;
  const token = 'c'.repeat(64);
  const state = { schema: 'datasecure-batch/4', ...(options.state || { token, product_channel: 'standalone',
    ...createBatchPseudonymState({ productChannel: 'standalone' }),
    items: [{ id: 0, status: 'deferred_review' }, { id: 1, status: 'deferred_review' }] }) };
  const captured = [];
  const uiGroups = [];
  const publications = [];
  const writes = [];
  const valueAt = (id, index) => options.mixedLater && id === 1 && index === count - 1 ? 'Andere Angabe' : 'Erika Beispiel';
  const createDraft = (item) => {
    if (options.resolvedCarry && publications.length > 0) {
      return { original_text: 'Erika Beispiel', anonymized_text: '[PERSON_001]',
        allowOrganizationReview: true, ambiguities: [] };
    }
    let text = '';
    const ambiguities = [];
    for (let index = 0; index < count; index++) {
      const value = valueAt(item.id, index);
      const start = text.length;
      text += value + '\n';
      ambiguities.push({ ambiguity_id: `${item.id === 0 ? 'person' : 'person-residual'}:v1:${String(index + 1).padStart(6, '0')}`,
        type: item.id === 0 ? 'person_prose_ambiguous' : 'person_residual_ambiguous', replacement_kind: 'PERSON',
        original_start: start, original_end: start + value.length,
        anonymized_start: start, anonymized_end: start + value.length });
    }
    return { original_text: text, anonymized_text: text, allowOrganizationReview: true, ambiguities };
  };
  const orchestrator = createBatchReviewOrchestrator({
    SafeError, active: new Set(), acquireActiveLock() {}, releaseActiveLock: () => true,
    readState: () => state, assertLocalExecutorAccess() {}, reconcilePublishedItems: () => false,
    reconcilePendingMappings: () => false, markInterruptedItemsRetryable: () => 0,
    writeState(value) { writes.push(JSON.stringify(value)); },
    publicProgress: () => ({ batch_total: state.items.length,
      released: state.items.filter((item) => item.status === 'released').length, stopped: 0 }),
    deferredReviewPlan: () => ({ ready: true, items: state.items.filter((item) => item.status === 'deferred_review') }),
    markDeferredReview(_state, items, code) { items.forEach((item) => { item.status = 'deferred_review'; item.error_code = code; }); },
    captureDeferredReviewInput: async (_state, item) => { captured.push(item.id); return createDraft(item); },
    runBatchReviewLocally: async (drafts, callOptions) => {
      uiGroups.push(drafts.map((item) => item.ambiguities.length));
      assert.strictEqual(callOptions.allowOrganizationReview, true);
      if (options.deferSecond && uiGroups.length === 2) return { action: 'deferred', documents: [] };
      return { action: 'reviewed', documents: drafts.map((draft, index) => ({ document_index: index + 1,
        decisions: draft.ambiguities.map((candidate) => ({ ambiguity_id: candidate.ambiguity_id,
          decision: options.choice || 'keep' })) })) };
    },
    publishReviewedBatch: async (_state, items, drafts, documents, deps) => {
      // Production performs its complete validation before invoking this hook.
      await deps.onReviewDecisionsBound(drafts, documents);
      publications.push(documents);
      items.forEach((item) => { item.status = 'released'; });
      return { packages: [], locallyReleased: items.length, failed: 0 };
    },
    writeTerminalEvidence: () => true, currentPlatform: () => 'darwin'
  });
  return { state, captured, uiGroups, publications, writes, count,
    run: () => orchestrator.reviewDeferredBatch(token, { localFinalize: true }) };
}

async function main() {
  for (const stage of ['contacts', 'capture', 'ui']) {
    await testAsync(`${stage} preserves fixed control refusals without deferring, writing or replaying review work`, async () => {
      for (const code of ['STANDALONE_BUSY', 'OWNERSHIP_GUARD_BUSY', 'OWNERSHIP_GUARD_UNSAFE',
        'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE', 'BATCH_OWNERSHIP_CHANGED',
        'STANDALONE_PAUSE_CONTROL_BUSY', 'STANDALONE_PAUSE_CONTROL_INVALID']) {
        const failure = codedError(code);
        let contacts = 0;
        const value = fixture(stage === 'contacts' ? { reviewContacts: async () => { contacts++; throw failure; } }
          : stage === 'capture' ? { captureErrorAt: 1, captureError: failure } : { uiError: failure });
        if (stage === 'contacts') value.state.product_channel = 'standalone';
        const before = JSON.stringify(value.state);
        await assert.rejects(value.orchestrator.reviewDeferredBatch(value.token, value.deps), error => error === failure);
        assert.equal(JSON.stringify(value.state), before, code);
        assert.equal(value.writes(), 0); assert.ok(!value.events.some(event => event.startsWith('defer:')));
        assert.equal(value.events.filter(event => event === 'publish').length, 0);
        assert.equal(value.events.filter(event => event === 'ui').length, stage === 'ui' ? 1 : 0);
        assert.equal(value.events.filter(event => event.startsWith('capture:')).length,
          stage === 'contacts' ? 0 : stage === 'capture' ? 1 : 2);
        assert.equal(contacts, stage === 'contacts' ? 1 : 0);
        assert.ok(!value.lifecycle.some(event => event.event.endsWith('_failed')));
        assert.equal(value.active.size, 0); assert.equal(value.events.at(-1), 'release:token');
      }
    });
  }
  for (const boundary of ['before-ocr', 'after-answers']) {
    await testAsync(`actual contact-review ${boundary} pause refusal preserves the journal and any already confirmed answers`, async () => {
      for (const code of ['STANDALONE_PAUSE_CONTROL_BUSY', 'STANDALONE_PAUSE_CONTROL_INVALID']) {
        const failure = codedError(code), answers = [];
        let claims = 0, captures = 0, prompts = 0, contactJournalWrites = 0;
        const original = 'E-Mail: contact@example.invalid';
        const input = { source_type: 'png', original_text: original,
          contacts: [{ start: 8, end: original.length, page: 1, line: 1, kind: 'email' }] };
        // Actual grouping, draft validation and per-source answer resolution;
        // only extraction/storage and the failing synchronous claim are seams.
        const reviewContacts = createBatchContactReview({
          captureDeferredReviewInput: async () => { captures++; return { ocr_contact_input: input }; },
          convertNext() { assert.fail('this is an anonymization contact review'); },
          exactPendingEntry() { assert.fail('content capture supplies this private input'); },
          contactStore: { write(_state, item, value, answer) { answers.push({ item, input: value, answer }); } },
          writeState() { contactJournalWrites++; },
          claimStandaloneDocument(_state, action) {
            claims++;
            if (boundary === 'before-ocr' || claims === 4) throw failure;
            action(); return true;
          }
        });
        const value = fixture({ reviewContacts });
        Object.assign(value.state, { schema: 'datasecure-batch/6', product_channel: 'standalone', processing_mode: 'markdown-and-anonymize' });
        value.items.forEach((item, index) => { item.source_label = `synthetic-contact-${index + 1}.png`; });
        const before = JSON.stringify(value.state);
        await assert.rejects(value.orchestrator.reviewDeferredBatch(value.token, { ...value.deps,
          reviewTextLocally: async draft => {
            prompts++;
            return { action: 'reviewed', redactions: [], decisions: draft.ambiguities.map(candidate => ({
              ambiguity_id: candidate.ambiguity_id, decision: 'confirm_contact' })) };
          }
        }), error => error === failure);
        assert.equal(JSON.stringify(value.state), before);
        assert.equal(value.writes(), 0); assert.equal(contactJournalWrites, 0);
        assert.equal(claims, boundary === 'before-ocr' ? 1 : 4);
        assert.equal(captures, boundary === 'before-ocr' ? 0 : 2);
        assert.equal(prompts, boundary === 'before-ocr' ? 0 : 1);
        assert.equal(answers.length, boundary === 'before-ocr' ? 0 : 2);
        for (const [index, confirmed] of answers.entries()) {
          assert.strictEqual(confirmed.item, value.items[index]); assert.strictEqual(confirmed.input, input);
          assert.deepEqual(confirmed.answer, { action: 'reviewed', redactions: [],
            decisions: [{ ambiguity_id: 'ocr-contact:v1:000001', decision: 'confirm_contact' }] });
        }
        assert.ok(!value.events.some(event => event.startsWith('defer:') || event === 'ui' || event === 'publish'));
        assert.equal(value.active.size, 0); assert.equal(value.events.at(-1), 'release:token');
      }
    });
  }
  await testAsync('a near-match Busy code remains an ordinary review error, not control admission', async () => {
    for (const code of ['STANDALONE_BUSY_EXTRA', 'STANDALONE_PAUSE_CONTROL_BUSY_EXTRA', 'STANDALONE_PAUSE_CONTROL_INVALID_EXTRA']) {
      const value = fixture({ uiError: codedError(code) });
      const result = await value.orchestrator.reviewDeferredBatch(value.token, value.deps);
      assert.equal(result.error, 'LOCAL_REVIEW_FAILED');
      assert.equal(value.writes(), 1);
      assert.ok(value.items.every(item => item.error_code === 'LOCAL_REVIEW_FAILED'));
    }
  });
  await testAsync('review keeps its active lifecycle through all four Busy waits and releases only the identical epoch', async () => {
    const epoch = Object.freeze({}), delays = [];
    let releases = 0, value, settled = false, kernelHeld = false;
    value = fixture({ epoch,
      releaseEpoch(actual) {
        assert.strictEqual(actual, epoch); assert.equal(value.active.has(value.token), true);
        kernelHeld = true;
        try { if (++releases <= 4) throw codedError('OWNERSHIP_GUARD_BUSY'); return true; }
        finally { kernelHeld = false; }
      },
      releaseDelay(milliseconds) {
        assert.equal(kernelHeld, false, 'the synchronous release attempt ended before waiting');
        assert.equal(value.active.has(value.token), true);
        return new Promise(resolve => delays.push({ milliseconds, resolve }));
      }
    });
    const running = value.orchestrator.reviewDeferredBatch(value.token, value.deps);
    running.then(() => { settled = true; }, () => { settled = true; });
    for (let index = 0; index < 4; index++) {
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(delays.length, index + 1); assert.equal(releases, index + 1);
      assert.equal(settled, false); assert.equal(value.active.has(value.token), true);
      await assert.rejects(value.orchestrator.reviewDeferredBatch(value.token, value.deps), /bereits/u);
      assert.equal(value.events.filter(event => event === 'acquire:token').length, 1, 'never reacquire or replay');
      delays[index].resolve();
    }
    assert.equal((await running).ok, true);
    assert.deepEqual(delays.map(delay => delay.milliseconds), [10, 25, 50, 100]);
    assert.equal(releases, 5); assert.equal(value.active.size, 0);
    assert.equal(value.events.filter(event => event.startsWith('capture:')).length, 2);
    assert.equal(value.events.filter(event => event === 'ui').length, 1);
    assert.equal(value.events.filter(event => event === 'publish').length, 1);
    assert.equal(value.events.filter(event => event === 'epoch:capture').length, 1);
    assert.ok(!value.events.includes('release:token')); assert.deepEqual(value.releaseDiagnostics, []);
  });
  await testAsync('a primary reconciliation Busy is preserved after a transient epoch-release Busy without document writes', async () => {
    const primary = codedError('STANDALONE_BUSY'), epoch = Object.freeze({}), delays = [];
    let releases = 0, value;
    value = fixture({ epoch, publishedError: primary,
      releaseEpoch() { assert.equal(value.active.has(value.token), true); if (++releases === 1) throw codedError('OWNERSHIP_GUARD_BUSY'); return true; },
      releaseDelay: async milliseconds => { assert.equal(value.active.has(value.token), true); delays.push(milliseconds); }
    });
    await assert.rejects(value.orchestrator.reviewDeferredBatch(value.token, value.deps), error => error === primary);
    assert.deepEqual(delays, [10]); assert.equal(releases, 2); assert.equal(value.writes(), 0);
    assert.equal(value.events.filter(event => event === 'reconcile:published').length, 1);
    assert.ok(!value.events.some(event => event.startsWith('capture:') || event === 'ui' || event === 'publish'));
    assert.equal(value.active.size, 0); assert.deepEqual(value.releaseDiagnostics, []);
    assert.equal(documentStabilizationBlocked(primary), false);
  });
  await testAsync('persistent Busy, false, close, unsafe and non-Busy epoch release never report successful review', async () => {
    for (const [mode, expected, attempts] of [
      ['OWNERSHIP_GUARD_BUSY', 'STANDALONE_OWNERSHIP_CONTROL_BUSY', 5],
      ['false', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED', 1],
      ['OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED', 1],
      ['OWNERSHIP_GUARD_UNSAFE', 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE', 1],
      ['EIO', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED', 1]
    ]) {
      const delays = [], epoch = Object.freeze({}); let releases = 0, value;
      value = fixture({ epoch,
        releaseEpoch() {
          releases++; assert.equal(value.active.has(value.token), true);
          if (mode === 'false') return false;
          throw codedError(mode, 'PRIVATE_RELEASE_MESSAGE_MUST_NOT_ESCAPE');
        },
        releaseDelay: async milliseconds => { assert.equal(value.active.has(value.token), true); delays.push(milliseconds); }
      });
      await assert.rejects(value.orchestrator.reviewDeferredBatch(value.token, value.deps), error => error.code === expected);
      assert.equal(releases, attempts); assert.deepEqual(delays, attempts === 5 ? [10, 25, 50, 100] : []);
      assert.equal(value.events.filter(event => event === 'acquire:token').length, 1);
      assert.equal(value.events.filter(event => event === 'publish').length, 1);
      assert.deepEqual(value.releaseDiagnostics, [{ phase: 'item_epoch_release', error_code: expected }]);
      assert.equal(value.active.size, 0);
    }
  });
  await testAsync('exhausted epoch release keeps the exact primary and closed secondary evidence even if the observer throws', async () => {
    for (const mode of ['OWNERSHIP_GUARD_BUSY', 'false', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'EIO']) {
      const primary = codedError('STANDALONE_BUSY'), epoch = Object.freeze({}), delays = [];
      let releases = 0, value;
      value = fixture({ epoch, publishedError: primary,
        releaseEpoch() { releases++; assert.equal(value.active.has(value.token), true); if (mode === 'false') return false; throw codedError(mode); },
        releaseDelay: async milliseconds => { assert.equal(value.active.has(value.token), true); delays.push(milliseconds); },
        recordBatchFailure() { assert.equal(value.active.has(value.token), true); throw new Error('observer failure'); }
      });
      await assert.rejects(value.orchestrator.reviewDeferredBatch(value.token, value.deps), error => error === primary);
      assert.equal(releases, mode === 'OWNERSHIP_GUARD_BUSY' ? 5 : 1);
      assert.deepEqual(delays, mode === 'OWNERSHIP_GUARD_BUSY' ? [10, 25, 50, 100] : []);
      assert.equal(value.writes(), 0); assert.equal(value.active.size, 0);
      assert.equal(documentStabilizationBlocked(primary), true);
      assert.deepEqual(value.releaseDiagnostics, [{ phase: 'item_epoch_release',
        error_code: mode === 'OWNERSHIP_GUARD_BUSY' ? 'STANDALONE_OWNERSHIP_CONTROL_BUSY' : 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED' }]);
    }
  });
  await testAsync('early contact cancellation preserves empty delivery shape and releases the exact owned lock', async () => {
    for (const localFinalize of [false, true]) {
      const value = fixture({ reviewContacts: async () => { throw codedError('LOCAL_REVIEW_CANCELLED'); } });
      value.state.product_channel = 'standalone';
      const result = await value.orchestrator.reviewDeferredBatch(value.token, { ...value.deps, localFinalize });
      assert.equal(result.ok, false); assert.equal(result.error, 'LOCAL_REVIEW_CANCELLED');
      assert.equal(result.reviewed_documents, 0); assert.equal(result.failed_documents, 0);
      assert.equal(result.raw_content_sent_to_claude, false);
      if (localFinalize) { assert.equal(result.locally_released, 0); assert.ok(!Object.hasOwn(result, 'packages')); }
      else assert.deepEqual(result.packages, []);
      assert.ok(!value.events.some(event => event.startsWith('capture:') || event === 'ui' || event === 'publish'));
      assert.equal(value.active.size, 0); assert.equal(value.events.at(-1), 'release:token');
      assert.ok(value.items.every(item => item.status === 'deferred_review'));
    }
  });
  await testAsync('Standalone reuses an exact keep across phase families and freshly reconstructs its carried document', async () => {
    const value = standaloneChoiceFixture();
    const result = await value.run();
    assert.strictEqual(result.locally_released, 2);
    assert.deepStrictEqual(value.captured, [0, 1, 1]);
    assert.deepStrictEqual(value.uiGroups, [[value.count]]);
    assert.deepStrictEqual(value.publications.map((group) => group[0].decisions.length), [value.count, value.count]);
    assert.ok(value.publications[1][0].decisions.every((choice) => choice.decision === 'keep'));
    assert.strictEqual(value.state.standalone_review_choices.entries.length, 1);
    assert.doesNotMatch(value.writes.join('\n'), /Erika|Beispiel/iu);
  });

  await testAsync('Standalone handles a carried source whose prior decision already removed every ambiguity', async () => {
    const value = standaloneChoiceFixture({ resolvedCarry: true, choice: 'redact_organization' });
    const result = await value.run();
    assert.strictEqual(result.locally_released, 2);
    assert.deepStrictEqual(value.captured, [0, 1, 1]);
    assert.deepStrictEqual(value.uiGroups, [[value.count]]);
    assert.deepStrictEqual(value.publications[1][0].decisions, []);
    assert.strictEqual(value.state.standalone_review_choices.entries[0][1], 'redact_organization');
  });

  await testAsync('Standalone retains only submitted decisions across defer/restart and asks only the later unknown name', async () => {
    const value = standaloneChoiceFixture({ mixedLater: true, deferSecond: true });
    const paused = await value.run();
    assert.strictEqual(paused.error, 'LOCAL_REVIEW_DEFERRED');
    assert.deepStrictEqual(value.uiGroups, [[value.count], [1]]);
    assert.strictEqual(value.state.standalone_review_choices.entries.length, 1);
    assert.strictEqual(value.state.items[0].status, 'released');
    const resumed = standaloneChoiceFixture({ mixedLater: true, state: JSON.parse(JSON.stringify(value.state)) });
    assert.strictEqual((await resumed.run()).locally_released, 1);
    assert.deepStrictEqual(resumed.uiGroups, [[1]]);
    assert.strictEqual(resumed.publications[0][0].decisions.length, resumed.count);
    assert.strictEqual(resumed.state.standalone_review_choices.entries.length, 2);
  });
  for (const [counts, expectedGroups] of [[[600, 600], [600, 600]], [[600, 400, 1], [1000, 1]]]) {
    await testAsync(`macOS splits ${counts.join('+')} findings and publishes every document exactly once`, async () => {
      const value = findingFixture(counts);
      const result = await value.orchestrator.reviewDeferredBatch('synthetic', { localFinalize: true });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.locally_released, counts.length);
      assert.strictEqual(result.reviewed_documents, counts.length);
      assert.deepStrictEqual(value.groups.map((group) => group.findings), expectedGroups);
      assert.deepStrictEqual(value.captured, counts.map((_, index) => index), 'carried drafts are not reconstructed twice');
      assert.ok(value.items.every((item) => item.status === 'released'));
      assert.strictEqual(value.groups[1].progress.previously_reviewed_count, counts.length - 1);
      assert.strictEqual(value.groups[1].progress.review_pending_count, 1);
      assert.strictEqual(value.active.size, 0);
    });
  }

  await testAsync('Windows keeps its existing combined review above the macOS finding limit', async () => {
    const value = findingFixture([600, 600], 'win32');
    const result = await value.orchestrator.reviewDeferredBatch('synthetic', { localFinalize: true });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.locally_released, 2);
    assert.deepStrictEqual(value.groups.map((group) => group.findings), [1200]);
    assert.strictEqual(value.active.size, 0);
  });

  for (const platform of ['win32', 'darwin', 'linux']) {
    await testAsync(`Standalone ${platform} shares the app budget and accepts a single document above the native macOS limit`, async () => {
      const single = findingFixture([1001], platform, true);
      assert.strictEqual((await single.orchestrator.reviewDeferredBatch('synthetic', { localFinalize: true })).ok, true);
      assert.deepStrictEqual(single.groups.map((group) => group.findings), [1001]);
      const grouped = findingFixture([3000, 3000], platform, true);
      const result = await grouped.orchestrator.reviewDeferredBatch('synthetic', { localFinalize: true });
      assert.strictEqual(result.locally_released, 2);
      assert.deepStrictEqual(grouped.groups.map((group) => group.findings), [3000, 3000]);
      assert.deepStrictEqual(grouped.captured, [0, 1, 1], 'app groups rebind carried spans after publication');
      const oversized = findingFixture([MAX_STANDALONE_REVIEW_FINDINGS + 1], platform, true);
      const limited = await oversized.orchestrator.reviewDeferredBatch('synthetic', { localFinalize: true });
      assert.strictEqual(limited.error, 'LOCAL_REVIEW_TOO_LARGE');
      assert.match(limited.message, /5\.000 Fundstellen/u);
      assert.match(limited.message, /kleinere Quelldateien/u);
      assert.strictEqual(limited.locally_released, 0);
      assert.deepStrictEqual(oversized.groups, []);
    });
  }

  await testAsync('a single oversized macOS document reports a technical size error without UI or silent deferral', async () => {
    const value = findingFixture([1001]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await value.orchestrator.reviewDeferredBatch('synthetic', { localFinalize: true });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error, 'LOCAL_REVIEW_TOO_LARGE');
      assert.strictEqual(result.reviewed_documents, 0);
      assert.strictEqual(result.locally_released, 0);
      assert.match(result.message, /zu groß/u);
      assert.strictEqual(value.items[0].error_code, 'LOCAL_REVIEW_TOO_LARGE');
      assert.deepStrictEqual(value.groups, []);
      assert.strictEqual(value.active.size, 0);
    }
    assert.deepStrictEqual(value.captured, [0, 0], 'one capture per explicit attempt, no retry loop');
  });

  await testAsync('a later oversized macOS document preserves already published groups', async () => {
    const value = findingFixture([600, 600, 1001]);
    const result = await value.orchestrator.reviewDeferredBatch('synthetic', { localFinalize: true });
    assert.strictEqual(result.error, 'LOCAL_REVIEW_TOO_LARGE');
    assert.strictEqual(result.reviewed_documents, 1);
    assert.strictEqual(result.locally_released, 1);
    assert.strictEqual(value.items[0].status, 'released');
    assert.deepStrictEqual(value.items.slice(1).map((item) => item.error_code), ['LOCAL_REVIEW_TOO_LARGE', 'LOCAL_REVIEW_TOO_LARGE']);
    assert.deepStrictEqual(value.groups.map((group) => group.findings), [600]);
    assert.strictEqual(value.active.size, 0);
  });

  await testAsync('an already aborted review never captures, opens UI or publishes', async () => {
    const value = fixture();
    const controller = new AbortController();
    controller.abort();
    const result = await value.orchestrator.reviewDeferredBatch(value.token, { ...value.deps, abortSignal: controller.signal });
    assert.strictEqual(result.error, 'LOCAL_REVIEW_CANCELLED');
    assert.ok(!value.events.some((event) => event === 'ui' || event === 'publish' || event.startsWith('capture:')));
    assert.strictEqual(value.active.size, 0);
  });

  for (const failure of ['abort-with-carry', 'abort-after-capture', 'abort-after-ui', 'capture', 'binding']) {
    await testAsync(`later group ${failure} preserves earlier publication and stops further work`, async () => {
      const items = [0, 1, 2].map((id) => ({ id, size: failure === 'abort-with-carry' ? 100 : 4_000_000, status: 'deferred_review' }));
      const text = 'x'.repeat(4_000_000);
      const active = new Set();
      const controller = new AbortController();
      const sequence = [];
      const value = createBatchReviewOrchestrator({
        SafeError, active, acquireActiveLock() {}, releaseActiveLock() { return true; },
        readState: () => ({ schema: 'datasecure-batch/4', items }), assertLocalExecutorAccess() {}, reconcilePublishedItems: () => false,
        reconcilePendingMappings: () => false, writeState() {}, markInterruptedItemsRetryable: () => 0,
        publicProgress: () => ({}), deferredReviewPlan: () => ({ ready: true, items }),
        captureDeferredReviewInput: async (_state, item) => {
          sequence.push(`capture:${item.id}`);
          if (item.id === 1 && failure === 'capture') throw codedError('CAPTURE_FAILED', 'Es wurde nichts freigegeben.');
          if (item.id === 1 && failure === 'abort-after-capture') controller.abort();
          return { original_text: text, anonymized_text: text, id: item.id };
        },
        runBatchReviewLocally: async (drafts) => {
          sequence.push(`ui:${drafts[0].id}`);
          if (drafts[0].id === 1 && failure === 'abort-after-ui') controller.abort();
          return { action: 'reviewed', documents: [] };
        },
        publishReviewedBatch: async (_state, selected) => {
          sequence.push(`publish:${selected[0].id}`);
          if (selected[0].id === 1 && failure === 'binding') throw codedError('BATCH_REVIEW_DECISION_BINDING_INVALID', 'Es wurde nichts freigegeben.');
          selected[0].status = 'released';
          if (failure === 'abort-with-carry') controller.abort();
          return { packages: [], locallyReleased: 1, failed: 0 };
        },
        markDeferredReview: (_state, selected, code) => { for (const item of selected) { item.status = 'deferred_review'; item.error_code = code; } },
        writeTerminalEvidence: () => true
      });
      const result = await value.reviewDeferredBatch('synthetic', { localFinalize: true, abortSignal: controller.signal });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.locally_released, 1);
      assert.strictEqual(result.reviewed_documents, 1);
      assert.strictEqual(items[0].status, 'released');
      assert.match(result.message, /bereits geprüfte Ergebnisse bleiben erhalten/iu);
      assert.doesNotMatch(result.message, /nichts freigegeben/iu);
      assert.ok(!sequence.includes('capture:2'));
      if (failure.startsWith('abort')) {
        assert.strictEqual(result.error, 'LOCAL_REVIEW_CANCELLED');
        assert.ok(!sequence.includes('publish:1'));
        if (failure !== 'abort-after-ui') assert.ok(!sequence.includes('ui:1'));
      }
      assert.strictEqual(active.size, 0);
    });
  }

  for (const useSourceEstimate of [true, false]) {
    await testAsync(`large reviews publish bounded groups without reconstructing the whole batch (source estimate ${useSourceEstimate})`, async () => {
      const items = Array.from({ length: 3 }, (_, id) => ({ id, size: useSourceEstimate ? 4_000_000 : 100, status: 'deferred_review' }));
      const state = { schema: 'datasecure-batch/4', items };
      const sequence = [];
      const active = new Set();
      const text = 'x'.repeat(4_000_000);
      const orchestrator = createBatchReviewOrchestrator({
        SafeError, active, acquireActiveLock() {}, releaseActiveLock() { return true; },
        readState: () => state, assertLocalExecutorAccess() {}, reconcilePublishedItems: () => false,
        reconcilePendingMappings: () => false, writeState() {}, markInterruptedItemsRetryable: () => 0,
        publicProgress: () => ({}), deferredReviewPlan: () => ({ ready: true, items }),
        captureDeferredReviewInput: async (_state, item) => {
          sequence.push(`capture:${item.id}`);
          return { original_text: text, anonymized_text: text, id: item.id };
        },
        runBatchReviewLocally: async (drafts) => {
          assert.strictEqual(drafts.length, 1);
          sequence.push(`review:${drafts[0].id}`);
          return { action: 'reviewed', documents: [{ document_index: 1, decisions: [] }] };
        },
        publishReviewedBatch: async (_state, selected, drafts, decisions) => {
          assert.strictEqual(selected[0].id, drafts[0].id);
          assert.strictEqual(decisions[0].document_index, 1);
          sequence.push(`publish:${selected[0].id}`);
          selected[0].status = 'released';
          return { packages: [], locallyReleased: 1, failed: 0 };
        },
        markDeferredReview() { throw new Error('unexpected deferral'); }, writeTerminalEvidence: () => true
      });
      const result = await orchestrator.reviewDeferredBatch('synthetic', { localFinalize: true, platform: 'darwin' });
      assert.strictEqual(result.locally_released, 3);
      assert.strictEqual(result.reviewed_documents, 3);
      assert.strictEqual(result.local_evidence_exported, true);
      assert.ok(sequence.indexOf('publish:0') < sequence.indexOf('capture:2'));
      if (useSourceEstimate) assert.ok(sequence.indexOf('publish:0') < sequence.indexOf('capture:1'));
      assert.strictEqual(sequence.filter((event) => event.startsWith('capture:')).length, 3, 'carried draft is not reconstructed twice');
      assert.strictEqual(active.size, 0);
    });
  }

  await testAsync('cancel in a later group preserves published groups and does not capture more files', async () => {
    const items = [0, 1, 2].map((id) => ({ id, size: 4_000_000, status: 'deferred_review' }));
    const text = 'x'.repeat(4_000_000);
    let uiCalls = 0;
    let captures = 0;
    const value = createBatchReviewOrchestrator({
      SafeError, active: new Set(), acquireActiveLock() {}, releaseActiveLock() { return true; },
      readState: () => ({ schema: 'datasecure-batch/4', items }), assertLocalExecutorAccess() {}, reconcilePublishedItems: () => false,
      reconcilePendingMappings: () => false, writeState() {}, markInterruptedItemsRetryable: () => 0,
      publicProgress: () => ({}), deferredReviewPlan: () => ({ ready: true, items }),
      captureDeferredReviewInput: async () => { captures++; return { original_text: text, anonymized_text: text }; },
      runBatchReviewLocally: async () => ++uiCalls === 1 ? { action: 'reviewed', documents: [] } : { action: 'cancelled' },
      publishReviewedBatch: async (_state, selected) => { selected[0].status = 'released'; return { packages: [], locallyReleased: 1, failed: 0 }; },
      markDeferredReview: (_state, selected, code) => { for (const item of selected) { item.status = 'deferred_review'; item.error_code = code; } },
      writeTerminalEvidence: () => true
    });
    const result = await value.reviewDeferredBatch('synthetic', { localFinalize: true });
    assert.strictEqual(result.error, 'LOCAL_REVIEW_CANCELLED');
    assert.strictEqual(result.locally_released, 1);
    assert.strictEqual(result.reviewed_documents, 1);
    assert.strictEqual(items[0].status, 'released');
    assert.strictEqual(items[2].error_code, 'LOCAL_REVIEW_CANCELLED');
    assert.strictEqual(captures, 2);
    assert.strictEqual(uiCalls, 2);
  });

  await testAsync('not-ready exits after reconciliation without capture, UI or publication', async () => {
    const value = fixture({ notReady: true, publishedReconciled: true });
    const result = await value.orchestrator.reviewDeferredBatch(value.token, value.deps);
    assert.strictEqual(result.error, 'batch_review_not_ready');
    assert.strictEqual(result.message, 'fixed not ready');
    assert.ok(value.events.includes('write'));
    assert.ok(!value.events.some((event) => event === 'ui' || event === 'publish' || event.startsWith('capture:')));
    assert.deepStrictEqual(value.events.slice(-1), ['release:token']);
    assert.strictEqual(value.active.size, 0);
  });

  await testAsync('capture failure defers every planned item and never opens the UI', async () => {
    const value = fixture({ captureErrorAt: 2 });
    const result = await value.orchestrator.reviewDeferredBatch(value.token, value.deps);
    assert.strictEqual(result.error, 'CAPTURE_FAILED');
    assert.deepStrictEqual(value.items.map((item) => item.error_code), ['CAPTURE_FAILED', 'CAPTURE_FAILED']);
    assert.ok(!value.events.includes('ui'));
    assert.ok(!value.events.includes('publish'));
    assert.deepStrictEqual(value.lifecycle.map((event) => event.event), [
      'review_reconstruction_started', 'review_reconstruction_failed'
    ]);
    assert.strictEqual(value.active.size, 0);
  });

  await testAsync('defer, cancel and UI errors keep all items local without publication', async () => {
    for (const options of [
      { outcome: { action: 'deferred', documents: [] }, expected: 'LOCAL_REVIEW_DEFERRED' },
      { outcome: { action: 'cancelled', documents: [] }, expected: 'LOCAL_REVIEW_CANCELLED' },
      { uiError: codedError('LOCAL_REVIEW_TIMEOUT'), expected: 'LOCAL_REVIEW_TIMEOUT' },
      { uiError: codedError('LOCAL_REVIEW_TOO_LARGE'), expected: 'LOCAL_REVIEW_TOO_LARGE' },
      { uiError: new Error('failure'), expected: 'LOCAL_REVIEW_FAILED' }
    ]) {
      const value = fixture(options);
      const result = await value.orchestrator.reviewDeferredBatch(value.token, value.deps);
      assert.strictEqual(result.error, options.expected);
      assert.ok(!value.events.includes('publish'));
      assert.strictEqual(value.events.filter((event) => event === 'ui').length, 1);
      assert.strictEqual(value.active.size, 0);
    }
  });

  await testAsync('remote success preserves package response and exact references', async () => {
    const value = fixture();
    const result = await value.orchestrator.reviewDeferredBatch(value.token, value.deps);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.packages, [{ opaque: true }]);
    assert.strictEqual(result.reviewed_documents, 2);
    assert.strictEqual(result.failed_documents, 0);
    assert.ok(!value.events.includes('evidence'));
    assert.deepStrictEqual(value.lifecycle.map((event) => event.event), [
      'review_reconstruction_started', 'review_reconstruction_finished', 'review_ui_started', 'review_ui_finished'
    ]);
  });

  await testAsync('local finalization writes evidence only after publication', async () => {
    const value = fixture({ publication: { packages: [], locallyReleased: 2, failed: 0 } });
    const result = await value.orchestrator.reviewDeferredBatch(value.token, { ...value.deps, localFinalize: true });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.locally_released, 2);
    assert.strictEqual(result.local_evidence_exported, true);
    assert.ok(value.events.indexOf('evidence') > value.events.indexOf('publish'));
    assert.ok(!Object.hasOwn(result, 'packages'));
  });

  await testAsync('only binding errors are translated while other publication failures propagate', async () => {
    const binding = fixture({ publicationError: codedError('BATCH_REVIEW_DECISION_BINDING_INVALID', 'fixed binding') });
    const result = await binding.orchestrator.reviewDeferredBatch(binding.token, binding.deps);
    assert.strictEqual(result.error, 'BATCH_REVIEW_DECISION_BINDING_INVALID');
    assert.strictEqual(binding.active.size, 0);

    const failure = new Error('publication failed');
    const other = fixture({ publicationError: failure });
    await assert.rejects(other.orchestrator.reviewDeferredBatch(other.token, other.deps), (error) => error === failure);
    assert.strictEqual(other.active.size, 0);
    assert.strictEqual(other.events.at(-1), 'release:token');
  });

  await testAsync('shared active guard and acquire failure never release an unowned lock', async () => {
    const guarded = fixture({ active: new Set(['token']) });
    await assert.rejects(guarded.orchestrator.reviewDeferredBatch(guarded.token, guarded.deps), /bereits/u);
    assert.deepStrictEqual(guarded.events, []);

    const acquireError = new Error('lock failed');
    const failed = fixture({ acquireError });
    await assert.rejects(failed.orchestrator.reviewDeferredBatch(failed.token, failed.deps), (error) => error === acquireError);
    assert.deepStrictEqual(failed.events, ['acquire:token']);
    assert.strictEqual(failed.active.size, 0);
    assert.strictEqual(typeof batchFacade.reviewDeferredBatch, 'function');
    assert.strictEqual(typeof batchFacade.processBatchNext, 'function');
  });

  await testAsync('legacy release failure propagates with the shared active guard cleared after its attempt', async () => {
    const value = fixture({ refuseRelease: true });
    await assert.rejects(
      value.orchestrator.reviewDeferredBatch(value.token, value.deps),
      (error) => error instanceof SafeError && /nicht sicher freigegeben/u.test(error.message)
    );
    assert.strictEqual(value.active.size, 0);
    assert.strictEqual(value.events.at(-1), 'release:token');
    assert.strictEqual(value.events.filter((event) => event === 'publish').length, 1);
  });

  done();
}

main();
