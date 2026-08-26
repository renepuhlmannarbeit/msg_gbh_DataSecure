'use strict';

const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchReviewOrchestrator } = require('../plugins/data-secure/server/gateway/batch-review-orchestrator');
const batchFacade = require('../plugins/data-secure/server/gateway/batch');
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
  const items = [{ status: 'deferred_review', id: 1 }, { status: 'deferred_review', id: 2 }];
  const state = { items, invalidated: false };
  const drafts = [{ local: 1 }, { local: 2 }];
  const progress = { remaining: 0, retryable: 0, delivery_pending: 0, released: 0 };
  let writes = 0;
  const orchestrator = createBatchReviewOrchestrator({
    SafeError,
    active,
    acquireActiveLock(value) { events.push(`acquire:${value}`); if (options.acquireError) throw options.acquireError; },
    releaseActiveLock(value) { events.push(`release:${value}`); if (options.releaseError) throw options.releaseError; },
    readState(value) { events.push(`read:${value}`); if (options.readError) throw options.readError; return state; },
    assertLocalExecutorAccess(value, pid) { events.push(`lease:${pid}`); assert.strictEqual(value, state); if (options.leaseError) throw options.leaseError; },
    reconcilePublishedItems() { events.push('reconcile:published'); return options.publishedReconciled === true; },
    reconcilePendingMappings() { events.push('reconcile:mapping'); return options.mappingReconciled === true; },
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
      if (options.uiError) throw options.uiError;
      return options.outcome || { action: 'reviewed', documents: [{ document_index: 1 }, { document_index: 2 }] };
    },
    reviewTextLocally() {},
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
  return { orchestrator, token, active, events, lifecycle, items, state, drafts, progress, deps, writes: () => writes };
}

async function main() {
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
      { uiError: codedError('LOCAL_REVIEW_TIMEOUT'), expected: 'LOCAL_REVIEW_CANCELLED' }
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

  await testAsync('release failure propagates after the shared active guard is cleared', async () => {
    const releaseError = new Error('release failed');
    const value = fixture({ releaseError });
    await assert.rejects(
      value.orchestrator.reviewDeferredBatch(value.token, value.deps),
      (error) => error === releaseError
    );
    assert.strictEqual(value.active.size, 0);
    assert.strictEqual(value.events.at(-1), 'release:token');
    assert.strictEqual(value.events.filter((event) => event === 'publish').length, 1);
  });

  done();
}

main();
