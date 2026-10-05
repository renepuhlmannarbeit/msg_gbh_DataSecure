'use strict';

// Real progress, continuation, batch runner, automatic review, review planning,
// review orchestration and visible export. Only source decisions, native review
// UI, journal IO/locks and process launch/ACK are adapted in this boundary test.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
// Hosted Windows TMP may name the same directory through a junction or alias.
// The real export boundary intentionally rejects that path, so put the
// synthetic fixture under its physical root before exercising recovery.
const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-mixed-continuation-')));
process.env.EU_PRIVACY_DATA_ROOT = path.join(base, 'private');
process.env.EU_PRIVACY_ROOT = path.join(base, 'workspace');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(base, 'results');
process.env.LOCALAPPDATA = path.join(base, 'localapp');
fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT);

const { createSuite } = require('./helpers');
const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchProgress } = require('../plugins/data-secure/server/gateway/batch-progress');
const { createBatchContinuation } = require('../plugins/data-secure/server/gateway/batch-continuation');
const { createBatchRecovery } = require('../plugins/data-secure/server/gateway/batch-recovery');
const { createBatchReviewState } = require('../plugins/data-secure/server/gateway/batch-review-state');
const { createBatchReviewOrchestrator } = require('../plugins/data-secure/server/gateway/batch-review-orchestrator');
const { createBatchPseudonymState } = require('../plugins/data-secure/server/batch-pseudonym-context');
const { createBatchExecutorRunner } = require('../plugins/data-secure/server/gateway/batch-executor-runner');
const { continueIntoLocalReview } = require('../plugins/data-secure/server/gateway/automatic-local-review');
const { batchNextAction } = require('../plugins/data-secure/server/gateway/batch-next-action');
const { readConfiguredResultRoot } = require('../plugins/data-secure/server/gateway/result-folder-config');
const { roots } = require('../plugins/data-secure/server/gateway/common');
const exportsApi = require('../plugins/data-secure/server/gateway/result-export');
const { StandaloneApplicationService } = require('../plugins/data-secure/server/standalone/application-service');
const { testAsync, done, assert } = createSuite('Standalone mixed continuation integration');

function fixture(otherStatus, options = {}) {
  assert.equal(readConfiguredResultRoot(), process.env.EU_PRIVACY_RESULT_ROOT,
    'the real result root must accept the canonical synthetic fixture');
  const token = crypto.randomBytes(32).toString('hex');
  let state = {
    schema: 'datasecure-batch/1', product_channel: 'standalone', token, profile: 'general',
    ...createBatchPseudonymState({ productChannel: 'standalone' }),
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(),
    items: ['deferred_review', otherStatus, 'released', 'stopped'].map((status, index) => ({
      id: crypto.randomBytes(16).toString('hex'), name: `synthetic-${index}.txt`, status,
      ...(status === 'stopped' ? { error_code: 'SOURCE_INVALID' } : {})
    }))
  };
  if (otherStatus === 'stopped') state.items[1].local_mapping_exported = false;
  const events = [];
  const starts = [];
  let owner = false;
  let reserved = false;
  let reviewAction = 'cancelled';
  const active = new Set();
  const readState = () => structuredClone(state);
  const writeState = (value) => { state = structuredClone(value); };
  const liveLocalExecutor = value => value.local_executor_pid === process.pid;
  const { publicProgress } = createBatchProgress({
    deliveryPendingStatus: 'delivery_pending', deferredReviewStatus: 'deferred_review',
    mappingPendingStatus: 'mapping_pending', liveLocalExecutor,
    publishedPackageRecord: () => null
  });
  function packageFor(item) {
    if (item.package_id) return;
    const packageId = `ds_${item.id}`;
    const directory = path.join(roots().output, packageId);
    fs.mkdirSync(directory, { recursive: true });
    const bytes = Buffer.from('Synthetisches freigegebenes Ergebnis.');
    const document = `${packageId}.md`;
    fs.writeFileSync(path.join(directory, document), bytes);
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
      schema: 'eu-privacy-package/2', package_id: packageId, profile: 'general', document,
      document_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      assets: [], created_at: state.created_at
    }));
    item.package_id = packageId;
  }
  state.items.filter(item => ['released', 'delivery_pending'].includes(item.status)).forEach(packageFor);
  function markInterruptedItemsRetryable(value) {
    let count = 0;
    for (const item of value.items) {
      if (item.status !== 'processing') continue;
      item.status = 'retryable'; count++;
    }
    return count;
  }
  const shared = {
    SafeError, active, readState, writeState, readStateForMaintenance: readState,
    acquireActiveLock() { assert.equal(owner, false); owner = true; },
    releaseActiveLock() { assert.equal(owner, true); owner = false; return true; },
    assertLocalExecutorAccess() {}, liveLocalExecutor, publicProgress,
    reconcilePublishedItems: () => false, reconcilePendingMappings: () => false,
    reconcilePreflightStoppedMappings: () => false, markInterruptedItemsRetryable,
    recoverableBatchStates: () => publicProgress(state).complete ? [] : [readState()]
  };
  let continuationReads = 0;
  function finishRemaining() {
    for (const item of state.items) {
      if (item.status === 'released') continue;
      item.status = 'stopped'; item.local_mapping_exported = true;
      item.error_code = 'SOURCE_INVALID'; delete item.package_id;
    }
  }
  const continuation = createBatchContinuation({ ...shared,
    readState() {
      if (options.terminalRace && ++continuationReads === 2) finishRemaining();
      return readState();
    }
  });
  const recovery = createBatchRecovery({
    ...shared, io: { readdirSync: () => [{ name: `${token}.json`, isFile: () => true }] },
    batchRoot: () => base, readActiveLock: () => null, processAlive: () => false,
    visibleExportStatus: exportsApi.visibleExportStatus,
    visibleExportDirectory: exportsApi.visibleExportDirectory
  });
  const reviewState = createBatchReviewState();
  const { reviewDeferredBatch } = createBatchReviewOrchestrator({
    ...shared, ...reviewState,
    captureDeferredReviewInput: async () => ({ original_text: 'Erika Beispiel', anonymized_text: 'Erika Beispiel',
      allowOrganizationReview: true, ambiguities: [{ ambiguity_id: 'person:v1:000001', type: 'person_prose_ambiguous',
        replacement_kind: 'PERSON', original_start: 0, original_end: 14, anonymized_start: 0, anonymized_end: 14 }] }),
    async runBatchReviewLocally(drafts) {
      events.push('review');
      assert.equal(batchNextAction(publicProgress(state)), 'review');
      return { action: reviewAction, documents: reviewAction === 'reviewed' ? drafts.map((draft, index) => ({
        document_index: index + 1, decisions: draft.ambiguities.map((candidate) => ({
          ambiguity_id: candidate.ambiguity_id, decision: 'keep' }))
      })) : [] };
    },
    async publishReviewedBatch(value, items, drafts, documents, deps) {
      await deps.onReviewDecisionsBound(drafts, documents);
      for (const item of items) { packageFor(item); item.status = 'released'; }
      writeState(value);
      return { packages: [], locallyReleased: items.length, failed: 0 };
    },
    writeTerminalEvidence(value) {
      assert.equal(publicProgress(value).complete, true);
      events.push('export');
      return exportsApi.exportCompletedState(value).available;
    }
  });
  function claimLocalBatchExecutor() {
    assert.equal(liveLocalExecutor(state), false);
    state.local_executor_pid = process.pid;
    return { ok: true };
  }
  function releaseLocalBatchExecutor() {
    assert.equal(liveLocalExecutor(state), true);
    delete state.local_executor_pid;
    return true;
  }
  const { runLocalBatchExecutor } = createBatchExecutorRunner({
    ...shared, prepareProcessingRun: () => ({}), incrementPrivateIoSummary: () => false,
    releaseLocalBatchExecutor,
    async processBatchNext() {
      const value = readState();
      const mapping = value.items.find(item => ['mapping_pending', 'preflight_mapping_pending'].includes(item.status) ||
        (item.status === 'stopped' && item.local_mapping_exported === false));
      const item = mapping || value.items.find(item => item.status === 'pending');
      assert.ok(item);
      events.push(mapping ? 'mapping' : 'process');
      if (item.status === 'stopped' || item.status === 'preflight_mapping_pending') {
        item.status = 'stopped'; item.local_mapping_exported = true;
      } else { packageFor(item); item.status = 'delivery_pending'; }
      writeState(value);
      return publicProgress(state);
    },
    finalizePublishedPackageLocally(_token, packageId) {
      const item = state.items.find(value => value.package_id === packageId);
      assert.equal(item.status, 'delivery_pending');
      events.push('delivery'); item.status = 'released';
      return publicProgress(state);
    }
  });
  function start(kind, value, options) {
    assert.equal(value, token);
    assert.equal(options.requireIpcAcknowledgement, true);
    let acknowledge; let reject;
    const ipcAcknowledgement = new Promise((resolve, fail) => { acknowledge = resolve; reject = fail; });
    if (options.signal) {
      const abort = () => reject(new Error('ACK_ABORTED'));
      if (options.signal.aborted) abort();
      else options.signal.addEventListener('abort', abort, { once: true });
    }
    starts.push({ kind, acknowledge, reject });
    return { ok: true, [kind === 'review' ? 'local_review_started' : 'local_processing_started']: true, ipcAcknowledgement };
  }
  const service = new StandaloneApplicationService({ dependencies: {
    ...continuation,
    lightweightStatus: () => ({ engine_ready: true, local_intake_pending: false,
      ...recovery.recoverableBatchStatus() }),
    latestProductBatchStatus: recovery.latestProductBatchStatus,
    runHistory: { find(value) { assert.equal(value, token); return { resumable: !publicProgress(state).complete }; } },
    reserveIntake() { assert.equal(reserved, false); reserved = true; return { reservation_id: 'test' }; },
    releaseIntake() { reserved = false; },
    startLocalBatchExecutor: (value, options) => start('batch', value, options),
    startLocalReviewExecutor: (value, options) => start('review', value, options)
  } });
  return {
    token, service, starts, events, progress: () => publicProgress(state), readState, finishRemaining,
    assertIdle() { assert.equal(owner, false); assert.equal(reserved, false); assert.equal(active.size, 0); },
    approveReview() { reviewAction = 'reviewed'; },
    async runWorker(kind) {
      claimLocalBatchExecutor();
      if (kind === 'review') {
        try { return await reviewDeferredBatch(token, { executorPid: process.pid, localFinalize: true }); }
        finally { releaseLocalBatchExecutor(); }
      }
      const processed = await runLocalBatchExecutor(token);
      return (await continueIntoLocalReview(token, processed, {
        claimLocalBatchExecutor, releaseLocalBatchExecutor, reviewDeferredBatch,
        readBatchProgress: () => publicProgress(state)
      })).progress;
    }
  };
}

async function confirmStart(f, invoke, expected) {
  let settled = false;
  const result = invoke().then(value => { settled = true; return value; });
  assert.equal(f.starts.at(-1).kind, expected);
  await Promise.resolve();
  assert.equal(settled, false, 'a selected worker is not an acknowledged start');
  f.starts.at(-1).acknowledge();
  assert.equal((await result).ok, true);
  f.assertIdle();
}

(async () => {
  try {
    for (const entrypoint of ['history', 'current']) {
      await testAsync(`${entrypoint}: a prepared admission or active interaction blocks continuation without mutation`, async () => {
        for (const blocker of ['admission', 'interaction']) {
          const f = fixture('retryable');
          const queue = [{ name: 'synthetic-next.txt' }];
          const context = { selectedFiles: ['synthetic-next.txt'] };
          f.service.selectionContext = context;
          if (blocker === 'admission') f.service.admittedQueue = queue;
          else f.service.interactionActive = true;
          const before = f.readState();
          await assert.rejects(entrypoint === 'history'
            ? f.service.continueHistoryBatch(f.token) : f.service.continueCurrentBatch(),
          error => error.code === 'STANDALONE_BUSY');
          assert.deepStrictEqual(f.readState(), before);
          assert.strictEqual(f.service.selectionContext, context);
          if (blocker === 'admission') assert.strictEqual(f.service.admittedQueue, queue);
          assert.strictEqual(f.starts.length, 0);
          assert.strictEqual(f.service.observedBatchId, null);
          f.assertIdle();
        }
      });

      await testAsync(`${entrypoint}: terminal continuation projects completion without starting or awaiting a worker`, async () => {
        const f = fixture('pending', { terminalRace: entrypoint === 'current' });
        if (entrypoint === 'history') {
          // A terminal snapshot from the same exact run must be handled by
          // both adapters; use real progress, never a partial complete mock.
          const continueCore = f.service.deps.continueStandaloneBatch;
          f.service.deps.continueStandaloneBatch = token => {
            const continued = continueCore(token);
            f.finishRemaining();
            return { ...continued, ...f.progress() };
          };
        }
        const result = await (entrypoint === 'history'
          ? f.service.continueHistoryBatch(f.token) : f.service.continueCurrentBatch());
        assert.deepStrictEqual(result, { ok: true, event: 'batch_already_completed', complete: true,
          selected_count: 4, completed_count: 4, failed_count: 3, external_disclosure: false });
        assert.strictEqual(f.progress().complete, true);
        assert.strictEqual(f.starts.length, 0);
        assert.strictEqual(f.service.observedBatchId, f.token);
        assert.strictEqual(f.service.status().completed_count, 4);
        assert.doesNotMatch(JSON.stringify(result), /batch_token|synthetic-|aaaaaaaa/u);
        f.assertIdle();
      });
    }
    for (const entrypoint of ['history', 'current']) {
      for (const other of ['pending', 'retryable', 'processing', 'delivery_pending', 'mapping_pending',
        'preflight_mapping_pending', 'stopped']) {
        await testAsync(`${entrypoint}: review + ${other} finishes automatic work before review and terminal export`, async () => {
          const f = fixture(other);
          const invoke = () => entrypoint === 'history'
            ? f.service.continueHistoryBatch(f.token) : f.service.continueCurrentBatch();
          assert.equal(f.service.status().review_required, false);
          assert.equal(f.service.status().completed_count, 2);
          assert.equal(f.service.status().failed_count, 1);
          await confirmStart(f, invoke, 'batch');
          await confirmStart(f, invoke, 'batch');
          const paused = await f.runWorker('batch');
          assert.equal(paused.error, 'LOCAL_REVIEW_CANCELLED');
          assert.equal(paused.deferred_review, 1);
          assert.equal(paused.remaining, 0);
          assert.equal(paused.delivery_pending, 0);
          assert.equal(paused.mapping_pending, 0);
          assert.equal(paused.complete, false);
          assert.equal(f.events.at(-1), 'review');
          assert.equal(f.events.includes('export'), false);
          assert.equal(exportsApi.visibleExportDirectory(f.token), '');
          assert.equal(f.service.status().review_required, true);
          assert.equal(f.service.status().completed_count, 3);
          await confirmStart(f, invoke, 'review');
          f.approveReview();
          const completed = await f.runWorker('review');
          assert.equal(completed.complete, true);
          assert.equal(completed.completed, 4);
          assert.equal(f.events.at(-1), 'export');
          const visible = exportsApi.visibleExportStatus(f.token, 4 -
            (['stopped', 'preflight_mapping_pending'].includes(other) ? 2 : 1));
          assert.equal(visible.available, true, 'a review event alone does not prove visible export');
          const status = f.service.status();
          assert.equal(status.completed_count, 4);
          assert.equal(status.failed_count, ['stopped', 'preflight_mapping_pending'].includes(other) ? 2 : 1);
          assert.equal(status.result_count, 4 - status.failed_count);
          assert.equal(status.review_required, false);
          const run = exportsApi.visibleExportDirectory(f.token);
          assert.ok(run);
          assert.equal(fs.existsSync(path.join(run, 'DataSecure-Zuordnung.csv')), true);
          f.assertIdle();
        });
      }
      for (const outcome of ['rejected', 'aborted']) {
        await testAsync(`${entrypoint}: ${outcome} worker ACK retains the exact recoverable mixed batch`, async () => {
          const f = fixture('retryable');
          const controller = new AbortController();
          const result = entrypoint === 'history'
            ? f.service.continueHistoryBatch(f.token, controller.signal)
            : f.service.continueCurrentBatch(controller.signal);
          assert.equal(f.starts.at(-1).kind, 'batch');
          if (outcome === 'aborted') controller.abort();
          else f.starts.at(-1).reject(new Error('ACK_LOST'));
          await assert.rejects(result, error => error.code === 'STANDALONE_START_FAILED');
          assert.equal(f.progress().deferred_review, 1);
          assert.equal(f.progress().remaining, 1);
          assert.deepEqual(f.events, []);
          assert.equal(exportsApi.visibleExportDirectory(f.token), '');
          f.assertIdle();
          await confirmStart(f, () => f.service.continueCurrentBatch(), 'batch');
        });
      }
      for (const code of ['LOCAL_REVIEW_START_MISSING', 'LOCAL_REVIEW_START_DENIED',
        'LOCAL_REVIEW_START_ARCHITECTURE', 'LOCAL_REVIEW_START_FAILED']) {
        await testAsync(`${entrypoint}: a proven ${code} review ACK preserves its safe cause`, async () => {
          const f = fixture('released');
          const result = entrypoint === 'history'
            ? f.service.continueHistoryBatch(f.token) : f.service.continueCurrentBatch();
          assert.equal(f.starts.at(-1).kind, 'review');
          f.starts.at(-1).reject(Object.assign(new Error('untrusted OS detail must not escape'), { code }));
          await assert.rejects(result, error => error.code === code && !error.message.includes('untrusted'));
          assert.equal(f.progress().deferred_review, 1);
          assert.deepEqual(f.events, []);
          assert.equal(exportsApi.visibleExportDirectory(f.token), '');
          f.assertIdle();
        });
      }
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
    await done();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
