'use strict';

// Actual product modules; filesystem, epoch and item-operation seams are MODEL
// dependencies. No native-guard, filesystem-race or OS-process claim is made.
const { createSuite } = require('./helpers');
const { SafeError } = require('../plugins/data-secure/server/runtime');
const { releaseOwnedEpochWithBusyRetry } = require('../plugins/data-secure/server/gateway/batch-lock-release');
const { createBatchProcessingOrchestrator } = require('../plugins/data-secure/server/gateway/batch-processing-orchestrator');
const { createBatchExecutorRunner } = require('../plugins/data-secure/server/gateway/batch-executor-runner');
const { createBatchExecutorLease } = require('../plugins/data-secure/server/gateway/batch-executor-lease');
const { progressFacts } = require('../plugins/data-secure/server/core/batch-progress');
const diagnostic = require('../plugins/data-secure/server/gateway/batch-execution-diagnostic');
const { sanitizeWorkflowEvent } = require('../plugins/data-secure/server/gateway/workflow-diagnostics');
const { testAsync, test, done, assert } = createSuite('Epoch release Busy / batch interruption MODEL');
const TOKEN = 'e'.repeat(64), PID = 4242, BIRTH = 'a'.repeat(64);
const fail = code => Object.assign(new Error('PRIVATE/path or document detail'), { code });
function harness(plan, config = {}) {
  let state = { schema: 'datasecure-batch/7', product_channel: 'standalone', processing_mode: 'markdown-and-anonymize',
    token: TOKEN, content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false },
    standalone_document_review: true, output_naming_mode: 'neutral', local_executor_pid: PID, local_executor_birth_id: BIRTH,
    local_executor_started_at: '2026-10-18T00:00:00.000Z', io_summary: {},
    items: ['csv', 'txt', 'png'].map((extension, i) => ({ id: String(i + 1).repeat(32), name: `source.${extension}`, status: 'pending' })) };
  let held = false, nativeHeld = false, calls = 0, processed = 0, finalizations = 0, writes = 0, cleaned = 0, mappings = 0;
  const epoch = Object.freeze({}), active = new Set(), delays = [], records = [], messages = [], order = [];
  function observe(phase, error) {
    diagnostic.recordBatchExecutionFailure(phase, error, {
      recordWorkflowEvent: record => records.push(record), send: message => messages.push(message)
    });
  }
  const readState = () => state, writeState = value => { state = value; writes++; };
  const progress = value => progressFacts(value, { deliveryPendingStatus: 'delivery_pending',
    deferredReviewStatus: 'deferred_review', mappingPendingStatus: 'mapping_pending' }, !!value.local_executor_pid);
  function acquire() { if (held) throw new SafeError('MODEL_EXISTING_LIVE_OWNER'); held = true; return true; }
  function release() { held = false; return true; }
  const impl = createBatchProcessingOrchestrator({
    SafeError, active, acquireActiveLock: acquire, releaseActiveLock: release, readState, writeState, publicProgress: progress,
    captureOwnedEpoch: () => epoch,
    releaseOwnedEpoch(proof) {
      assert.strictEqual(proof, epoch, 'never mint/adopt another acquisition');
      assert.strictEqual(active.has(TOKEN), true, 'active set remains held during synchronous release');
      calls++; nativeHeld = true;
      try {
        const next = plan[Math.min(calls - 1, plan.length - 1)];
        if (next === true) { held = false; return true; }
        if (next === false) return false;
        throw fail(next);
      } finally { nativeHeld = false; }
    },
    releaseDelay: async milliseconds => {
      assert.strictEqual(nativeHeld, false, 'no MODEL kernel guard held over await');
      assert.strictEqual(active.has(TOKEN), true);
      const before = calls;
      delays.push(milliseconds); order.push('delay');
      await assert.rejects(impl.processBatchNext(TOKEN), /bereits eine Verarbeitung/);
      assert.strictEqual(calls, before, 'same-process reentry never reaches another release/acquisition');
    },
    recordBatchFailure: observe, assertLocalExecutorAccess() {}, maintainBeforeNext() {},
    exactPendingEntry() { return {}; }, invalidateUnpublishedBatchCopies() {},
    withBatchPseudonymRegistry: async (_state, action) => {
      const result = await action();
      if (config.registryError) throw config.registryError;
      return result;
    },
    async processSingleBatchItem(current, item) {
      processed++; item.status = 'processing'; item.checkpoint = 'processing_started';
      if (config.sourceError) {
        if (config.alreadyPublished) { item.package_id = 'ds_' + item.id; item.checkpoint = 'package_published'; }
        throw config.sourceError;
      }
      item.status = 'delivery_pending'; item.checkpoint = 'delivery_pending'; item.package_id = 'ds_' + item.id;
      item.document_result = { schema: 'datasecure-document-result/1', grade: 'complete', omissions: [], reason_code: null };
      writeState(current);
      return { ok: true, package_id: item.package_id, ...progress(current) };
    }
  });
  const lease = createBatchExecutorLease({ SafeError, currentPid: () => PID, processAlive: () => true, liveLocalExecutor: () => true,
    processInstanceIdentity: () => BIRTH, acquireActiveLock: acquire, releaseActiveLock: release,
    readState, writeState, publicProgress: progress });
  const runner = createBatchExecutorRunner({ SafeError, currentPid: () => PID, readState, writeState,
    liveLocalExecutor: () => true, publicProgress: progress, prepareProcessingRun: () => ({}),
    incrementPrivateIoSummary: () => false, processBatchNext: impl.processBatchNext,
    finalizePublishedPackageLocally(_token, packageId) {
      finalizations++; order.push('finalize');
      if (config.deliveryError) throw config.deliveryError;
      const item = state.items.find(row => row.package_id === packageId);
      assert.ok(item); item.status = 'released'; writeState(state); return { ok: true, ...progress(state) };
    },
    releaseLocalBatchExecutor: config.releaseLease || lease.releaseLocalBatchExecutor,
    writeTerminalEvidence: () => false, cleanupTerminalWorkCopy: () => { cleaned++; },
    appendMapping: () => { mappings++; }, retryableCodes: new Set(['CONVERSION_TIMEOUT']),
    recordBatchFailure: observe, maxBatchFiles: 100 });
  return { run: () => runner.runLocalBatchExecutor(TOKEN, { executorPid: PID }), state: () => state,
    stats: () => ({ calls, processed, finalizations, writes, cleaned, mappings, held, nativeHeld, active: active.has(TOKEN) }),
    delays, records, messages, order };
}
async function main() {
  for (const code of ['OWNERSHIP_GUARD_BUSY', 'STANDALONE_OWNERSHIP_CONTROL_BUSY']) {
    await testAsync(`one ${code} retries exact epoch and permits normal completion`, async () => {
      const h = harness([code, true]), result = await h.run();
      assert.strictEqual(result.complete, true); assert.strictEqual(h.stats().processed, 3);
      assert.strictEqual(h.stats().finalizations, 3); assert.deepStrictEqual(h.delays, [10]);
      assert.strictEqual(h.stats().active, false); assert.strictEqual(h.stats().held, false);
      assert.strictEqual(h.records.length, 0, 'a recovered ordinary contention is not a failed batch');
    });
  }
  await testAsync('default Busy delay yields to real timers without repeating synchronously', async () => {
    const epoch = Object.freeze({}); let calls = 0, timerFired = false;
    const timer = setTimeout(() => { timerFired = true; }, 0);
    try {
      const released = await releaseOwnedEpochWithBusyRetry(proof => {
        assert.strictEqual(proof, epoch);
        if (++calls === 1) throw fail('OWNERSHIP_GUARD_BUSY');
        assert.strictEqual(timerFired, true); return true;
      }, epoch);
      assert.strictEqual(released, true); assert.strictEqual(calls, 2);
    } finally { clearTimeout(timer); }
  });
  await testAsync('four finite backoffs / fifth success never release in-process exclusion early', async () => {
    const h = harness(['OWNERSHIP_GUARD_BUSY', 'OWNERSHIP_GUARD_BUSY', 'OWNERSHIP_GUARD_BUSY', 'OWNERSHIP_GUARD_BUSY', true]);
    const result = await h.run();
    assert.strictEqual(result.complete, true);
    assert.deepStrictEqual(h.delays, [10, 25, 50, 100]);
    assert.ok(h.order.indexOf('finalize') > h.order.lastIndexOf('delay'));
  });
  await testAsync('persistent Busy preserves pending sources and committed CSV without false success', async () => {
    const h = harness(['OWNERSHIP_GUARD_BUSY']);
    await assert.rejects(h.run(), error => error.code === 'STANDALONE_OWNERSHIP_CONTROL_BUSY');
    assert.deepStrictEqual(h.delays, [10, 25, 50, 100]); assert.strictEqual(h.stats().calls, 5);
    assert.deepStrictEqual(h.state().items.map(item => item.status), ['delivery_pending', 'pending', 'pending']);
    assert.strictEqual(h.stats().processed, 1); assert.strictEqual(h.stats().finalizations, 0);
    assert.strictEqual(h.stats().cleaned + h.stats().mappings, 0);
    assert.strictEqual(h.stats().held, true); assert.strictEqual(h.stats().active, false);
    assert.ok(h.records.some(row => row.phase === 'item_epoch_release' && row.error_code === 'STANDALONE_OWNERSHIP_CONTROL_BUSY'));
  });
  for (const [failure, code] of [[false, 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED'],
    ['OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED'],
    ['OWNERSHIP_GUARD_UNSAFE', 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE'],
    ['EIO', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED']]) {
    await testAsync(`release ${String(failure)} is not retried or interpreted as success`, async () => {
      const h = harness([failure]);
      await assert.rejects(h.run(), error => error.code === code);
      assert.strictEqual(h.stats().calls, 1); assert.deepStrictEqual(h.delays, []);
      assert.deepStrictEqual(h.state().items.map(item => item.status), ['delivery_pending', 'pending', 'pending']);
      assert.strictEqual(h.stats().cleaned + h.stats().mappings, 0); assert.strictEqual(h.stats().active, false);
    });
  }
  await testAsync('active known document failure keeps normal terminal policy but never stops unstarted sources', async () => {
    const primary = fail('RESIDUAL_PII'), h = harness([true], { sourceError: primary });
    await assert.rejects(h.run(), error => error === primary);
    assert.deepStrictEqual(h.state().items.map(item => item.status), ['stopped', 'pending', 'pending']);
    assert.strictEqual(h.state().items[0].error_code, 'RESIDUAL_PII');
    assert.strictEqual(h.stats().cleaned, 1); assert.strictEqual(h.stats().mappings, 1);
  });
  await testAsync('recovered release contention never masks an active primary document error', async () => {
    const primary = fail('RESIDUAL_PII'), h = harness(['OWNERSHIP_GUARD_BUSY', true], { sourceError: primary });
    await assert.rejects(h.run(), error => error === primary);
    assert.deepStrictEqual(h.state().items.map(item => item.status), ['stopped', 'pending', 'pending']);
    assert.strictEqual(h.stats().mappings, 1); assert.deepStrictEqual(h.delays, [10]);
  });
  await testAsync('catalogued active transient uses retry budget, while pending sources stay byte-identical', async () => {
    const primary = fail('CONVERSION_TIMEOUT'), h = harness([true], { sourceError: primary });
    const pending = JSON.stringify(h.state().items.slice(1));
    await assert.rejects(h.run(), error => error === primary);
    assert.strictEqual(h.state().items[0].status, 'retryable');
    assert.strictEqual(h.state().items[0].retry_failure_count, 1);
    assert.strictEqual(JSON.stringify(h.state().items.slice(1)), pending);
  });
  await testAsync('unknown active technical fault is not promoted to a document decision', async () => {
    const primary = new Error('PRIVATE/path'), h = harness([true], { sourceError: primary });
    await assert.rejects(h.run(), error => error === primary);
    assert.deepStrictEqual(h.state().items.map(item => item.status), ['processing', 'pending', 'pending']);
    assert.strictEqual(h.stats().cleaned + h.stats().mappings, 0);
  });
  for (const release of ['OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'OWNERSHIP_GUARD_BUSY', false]) {
    await testAsync(`primary document cause survives secondary ${String(release)} without unauthorized stabilization`, async () => {
      const primary = fail('RESIDUAL_PII'), h = harness([release], { sourceError: primary });
      await assert.rejects(h.run(), error => error === primary);
      assert.deepStrictEqual(h.state().items.map(item => item.status), ['processing', 'pending', 'pending']);
      assert.strictEqual(h.stats().cleaned + h.stats().mappings, 0);
      assert.ok(h.records.some(row => row.phase === 'item_epoch_release'));
      assert.ok(h.records.some(row => row.phase === 'processing' && row.error_code === 'RESIDUAL_PII'));
    });
  }
  await testAsync('published recovery locator is never demoted by a later known document exception', async () => {
    const primary = fail('RESIDUAL_PII'), h = harness([true], { sourceError: primary, alreadyPublished: true });
    await assert.rejects(h.run(), error => error === primary);
    assert.strictEqual(h.state().items[0].checkpoint, 'package_published');
    assert.ok(h.state().items[0].package_id); assert.strictEqual(h.stats().cleaned + h.stats().mappings, 0);
  });
  await testAsync('delivery failure retains its fixed phase and pending sources', async () => {
    const primary = fail('DOCUMENT_REVIEW_CONFLICT'), h = harness([true], { deliveryError: primary });
    await assert.rejects(h.run(), error => error === primary);
    assert.deepStrictEqual(h.state().items.map(item => item.status), ['delivery_pending', 'pending', 'pending']);
    assert.ok(h.records.some(row => row.phase === 'local_delivery_verify' && row.error_code === primary.code));
  });
  await testAsync('unconfirmed lease cleanup is diagnosed without replacing a primary delivery failure', async () => {
    const primary = fail('DOCUMENT_REVIEW_CONFLICT');
    const h = harness([true], { deliveryError: primary, releaseLease: () => false });
    await assert.rejects(h.run(), error => error === primary);
    assert.deepStrictEqual(h.state().items.map(item => item.status), ['delivery_pending', 'pending', 'pending']);
    assert.ok(h.records.some(row => row.phase === 'local_delivery_verify' && row.error_code === primary.code));
    assert.ok(h.records.some(row => row.phase === 'executor_lease_release' &&
      row.error_code === 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED'));
    assert.strictEqual(h.stats().cleaned + h.stats().mappings, 0);
  });
  await testAsync('diagnostic failure cannot hide a close refusal or claim successful release', async () => {
    const epoch = Object.freeze({}); let calls = 0;
    await assert.rejects(releaseOwnedEpochWithBusyRetry(proof => { assert.strictEqual(proof, epoch); calls++; return false; },
      epoch, SafeError, false, { onFailure() { throw Error('sink'); }, delay() { throw Error('must not wait'); } }),
    error => error.code === 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED');
    assert.strictEqual(calls, 1);
  });
  test('fixed code/phase survives workflow serialization; private data, getter and proxy never become evidence', () => {
    let getters = 0; const records = [], sent = [];
    const error = Object.defineProperty({}, 'code', { get() { getters++; return 'RESIDUAL_PII'; } });
    for (const item of [error, new Proxy({}, { get() { getters++; throw Error('proxy'); } }), fail('PRIVATE_PERSON_NAME')])
      diagnostic.recordBatchExecutionFailure('processing', item, { recordWorkflowEvent: row => records.push(row), send: row => sent.push(row) });
    assert.strictEqual(getters, 0); assert.ok(records.every(row => row.error_code === 'INTERNAL_FAILURE'));
    for (const phase of diagnostic.PHASES) {
      const row = { type: 'local-batch-diagnostic', phase, error_code: 'STANDALONE_OWNERSHIP_CONTROL_BUSY' };
      const decoded = diagnostic.readBatchExecutionDiagnostic(row);
      const sanitized = sanitizeWorkflowEvent(decoded);
      assert.strictEqual(sanitized.phase, phase); assert.strictEqual(sanitized.error_code, row.error_code);
      assert.strictEqual(sanitized.event, 'batch_worker_failed');
      assert.strictEqual(diagnostic.readBatchExecutionDiagnostic({ ...row, path: 'PRIVATE/path' }), null);
      assert.strictEqual(diagnostic.readBatchExecutionDiagnostic({ ...row, phase: 'PRIVATE/path' }), null);
      assert.strictEqual(diagnostic.readBatchExecutionDiagnostic({ ...row, error_code: 'PRIVATE_PERSON_NAME' }), null);
    }
    assert.ok(!JSON.stringify({ records, sent }).includes('PRIVATE'));
  });
  await done();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
