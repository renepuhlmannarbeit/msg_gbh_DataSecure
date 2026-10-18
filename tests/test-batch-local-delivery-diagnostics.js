'use strict';
// Caller-based RAM regression: actual Runner -> actual Delivery -> actual
// Markdown store/validator -> actual closed diagnostic sender/reader. Journal,
// lock and artifact IO seams are explicit models; no native/GUI/crash claim.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const diagnostic = require('../plugins/data-secure/server/gateway/batch-execution-diagnostic');
const modes = require('../plugins/data-secure/server/core/processing-mode');
const content = require('../plugins/data-secure/server/core/content-options');
const artifact = require('../plugins/data-secure/server/standalone/markdown-artifact');
const grade = require('../plugins/data-secure/server/gateway/document-result-grade');
const prepublication = require('../plugins/data-secure/server/gateway/prepublication-error');
const { createBatchProgress } = require('../plugins/data-secure/server/gateway/batch-progress');
const fixed = code => Object.assign(Error('PRIVATE /path/person'), { code });
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
class SafeError extends Error {}
function evaluate(relative, dependencies) {
  const filename = path.join(root, relative), module = { exports: {} };
  // The pure validators and supplied values share the host realm, just as
  // JSON.parse and validators share one realm in the real CommonJS process.
  const context = vm.createContext({ module, JSON, Buffer, TextDecoder, process, setTimeout, clearTimeout,
    require(id) {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      if (id.startsWith('node:') || ['path', 'crypto'].includes(id)) return require(id);
      throw Error('UNEXPECTED_RAM_DEPENDENCY:' + id);
    }
  });
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename, timeout: 1000 });
  return module.exports;
}
function fixture(options = {}) {
  const events = [], frames = [], calls = [];
  const token = 'e'.repeat(64), targetId = '2'.repeat(32), pid = process.pid;
  const extraction = { schema: 'datasecure-markdown-extraction/1', processing_mode: 'markdown-only',
    anonymized: false, source_type: 'txt', markdown: 'Synthetischer Test.', coverage: { status: 'complete', reason_codes: [] } };
  const artifacts = new Map(['1'.repeat(32), targetId].map(id => {
    const value = artifact.createMarkdownArtifact(extraction, 'dm_' + id);
    return [value.manifest.artifact_id, value];
  }));
  const metadata = id => {
    const m = artifacts.get('dm_' + id).manifest;
    return { artifact_id: m.artifact_id, artifact_sha256: m.document_sha256, artifact_bytes: m.document_bytes,
      extraction_grade: m.extraction_grade, reason_codes: [...m.reason_codes] };
  };
  const oldItem = { id: '1'.repeat(32), ...metadata('1'.repeat(32)), status: 'released', checkpoint: 'released_locally' };
  let state = { schema: 'datasecure-batch/5', processing_mode: 'markdown-only', product_channel: 'standalone', token,
    local_executor_pid: pid, io_summary: {}, items: [oldItem, { id: targetId, status: 'pending', checkpoint: 'sealed',
      work_name: '002_' + '2'.repeat(24) + '.txt' },
    ...(options.unstarted ? [{ id: '3'.repeat(32), status: 'pending', checkpoint: 'sealed' }] : [])] };
  const originalOld = JSON.stringify(oldItem);
  let held = false;
  const record = (phase, error) => diagnostic.recordBatchExecutionFailure(phase, error, {
    recordWorkflowEvent(event) { if (options.badSink) throw Error('PRIVATE'); events.push(plain(event)); },
    send(frame) { if (options.badSink) throw Error('PRIVATE'); frames.push(frame); }
  });
  const progress = current => {
    const counts = status => current.items.filter(item => item.status === status).length;
    const remaining = counts('pending'), delivery_pending = counts('delivery_pending'), released = counts('released');
    return { completed: released, released, remaining, delivery_pending, mapping_pending: 0, stopped: 0,
      complete: remaining === 0 && delivery_pending === 0 };
  };
  const realProgress = createBatchProgress({ deliveryPendingStatus: 'delivery_pending',
    deferredReviewStatus: 'deferred_review', mappingPendingStatus: 'mapping_pending',
    liveLocalExecutor: current => current.local_executor_pid === pid,
    observePauseRequested(current) {
      calls.push('progress-pause-observer'); assert.equal(held, true);
      assert.equal(current.items[1].status, 'released', 'the durable delivery commit precedes this observation');
      if (Object.hasOwn(options, 'observeError')) throw options.observeError;
      return false;
    }
  });
  const store = evaluate('plugins/data-secure/server/standalone/markdown-store.js', {
    fs: {}, '../runtime': { dataRoot: () => '/ram/private' },
    '../gateway/common': { ensurePrivateDirectory: (base, leaf) => path.join(base, leaf), assertPrivateDirectory() {} },
    '../gateway/batch-journal-io': {}, './markdown-artifact': artifact,
    '../core/content-options': content, './markdown-contract': require('../plugins/data-secure/server/standalone/markdown-contract'),
    '../core/bound-file-io': { bindDirectory: directory => ({ path: directory }), assertDirectory() {},
      readBoundFile(file) {
        calls.push('artifact-read');
        if (Object.hasOwn(options, 'artifactReadError')) throw options.artifactReadError;
        const item = artifacts.get(path.basename(path.dirname(file))); assert.ok(item);
        return Buffer.from(path.basename(file) === 'manifest.json' ? JSON.stringify(item.manifest) : item.markdown);
      }
    }
  });
  const delivery = evaluate('plugins/data-secure/server/gateway/batch-delivery.js', {
    fs: {}, '../runtime': { SafeError }, './batch-private-store': { workPath: () => '/ram/work' },
    './batch-lock-release': {}, '../standalone/markdown-store': store, '../core/processing-mode': modes,
    '../core/content-options': content, './standalone-anonymized-batch': {}, './batch-execution-diagnostic': diagnostic
  }).createBatchDelivery({
    SafeError, active: new Set(), io: { existsSync: () => false },
    withSynchronousActiveLock(batchToken, action) {
      calls.push('gate-acquire'); assert.equal(batchToken, token);
      if (Object.hasOwn(options, 'acquireError')) throw options.acquireError;
      held = true;
      try {
        const value = action(); assert.ok(!value || typeof value.then !== 'function', 'actual delivery callback stays synchronous');
        if (Object.hasOwn(options, 'gateReleaseError')) throw options.gateReleaseError;
        return value;
      } finally { held = false; calls.push('gate-release'); }
    },
    readState(batchToken) {
      calls.push('delivery-read'); assert.equal(held, true); assert.equal(batchToken, token);
      if (Object.hasOwn(options, 'readError')) throw options.readError;
      return structuredClone(state);
    },
    assertLocalExecutorAccess(current, executorPid) {
      calls.push('delivery-access'); assert.equal(held, true); assert.equal(executorPid, pid);
      assert.equal(current.local_executor_pid, pid);
      if (Object.hasOwn(options, 'accessError')) throw options.accessError;
    },
    writeState(current) {
      calls.push('delivery-commit'); assert.equal(held, true);
      if (options.commitBeforeThrow || !Object.hasOwn(options, 'commitError')) state = structuredClone(current);
      if (Object.hasOwn(options, 'commitError')) throw options.commitError;
    },
    publicProgress(current) {
      calls.push('delivery-progress'); assert.equal(held, true);
      if (Object.hasOwn(options, 'progressError')) throw options.progressError;
      if (options.realProgress) return realProgress.publicProgress(current);
      return progress(current);
    },
    writeTerminalEvidence() {
      calls.push('delivery-evidence'); assert.equal(held, true);
      if (Object.hasOwn(options, 'evidenceError')) throw options.evidenceError;
      return true;
    },
    recordBatchFailure(phase, error) {
      assert.equal(held, false, 'delivery observation must be outside enter() lifecycle'); record(phase, error);
    }
  });
  const runner = evaluate('plugins/data-secure/server/gateway/batch-executor-runner.js', {
    '../runtime': { SafeError }, './document-result-grade': grade, './batch-execution-diagnostic': diagnostic,
    './mapping': { appendMapping() { throw Error('UNEXPECTED_MAPPING'); }, STOPPED: 'stopped' },
    './prepublication-error': prepublication, '../core/processing-mode': modes
  }).createBatchExecutorRunner({ SafeError, currentPid: () => pid, readState: () => structuredClone(state),
    liveLocalExecutor: current => current.local_executor_pid === pid, publicProgress: progress,
    writeState() { throw Error('UNEXPECTED_STABILIZATION'); }, incrementPrivateIoSummary: () => false,
    async processBatchNext(batchToken, deps) {
      calls.push('process'); assert.equal(batchToken, token); assert.equal(deps.executorPid, pid); assert.equal(deps.preparedRun, undefined);
      const current = state.items.find(item => item.id === targetId); assert.equal(current.status, 'pending');
      Object.assign(current, metadata(targetId), { status: 'delivery_pending', checkpoint: 'package_published' });
      return { ...progress(state), artifact_id: options.wrongId ? 'dm_' + '4'.repeat(32) : current.artifact_id };
    },
    finalizePublishedPackageLocally: delivery.finalizePublishedPackageLocally,
    pauseRequested: current => options.stopAfterDelivery && current.items[1].status === 'released',
    releaseLocalBatchExecutor(batchToken, executorPid) {
      calls.push('lease-release'); assert.equal(batchToken, token); assert.equal(executorPid, pid);
      delete state.local_executor_pid;
      if (Object.hasOwn(options, 'leaseError')) throw options.leaseError;
      return true;
    }, recordBatchFailure: record
  });
  async function run() {
    let caught, failed = false, result;
    try { result = await runner.runLocalBatchExecutor(token, { executorPid: pid }); }
    catch (error) { caught = error; failed = true; }
    assert.equal(held, false); assert.equal(JSON.stringify(state.items[0]), originalOld);
    assert.equal(calls.filter(call => call === 'process').length, 1, 'no processing replay');
    assert.equal(calls.filter(call => call === 'gate-acquire').length, 1, 'no delivery replay');
    assert.equal(calls.filter(call => call === 'lease-release').length, 1);
    if (options.unstarted) assert.equal(state.items[2].status, 'pending');
    assert.equal(events.length, frames.length);
    for (const [index, frame] of frames.entries()) {
      assert.deepEqual(plain(diagnostic.readBatchExecutionDiagnostic(frame)), events[index]);
      assert.ok(!JSON.stringify(frame).includes('PRIVATE'));
    }
    return { failed, caught, result, state, events: events.map(event => [event.phase, event.error_code]), calls };
  }
  return { run };
}

function initialProgressFixture(options = {}) {
  const token = 'f'.repeat(64), pid = process.pid, calls = [], events = [], frames = [];
  const state = { schema: 'datasecure-batch/5', processing_mode: 'markdown-only', product_channel: 'standalone', token,
    local_executor_pid: options.foreignLease ? pid + 1 : pid, items: [
      { id: '1'.repeat(32), status: 'released', artifact_id: 'already-released' },
      { id: '2'.repeat(32), status: 'pending', checkpoint: 'sealed' },
      { id: '3'.repeat(32), status: 'processing', artifact_id: 'already-published' },
      { id: '4'.repeat(32), status: 'processing', checkpoint: 'processing_started' }
    ] };
  const before = JSON.stringify(state.items);
  const action = name => () => { calls.push(name); assert.fail('initial progress cannot enter document work: ' + name); };
  const runner = evaluate('plugins/data-secure/server/gateway/batch-executor-runner.js', {
    '../runtime': { SafeError }, './document-result-grade': grade, './batch-execution-diagnostic': diagnostic,
    './mapping': { appendMapping: action('mapping'), STOPPED: 'stopped' },
    './prepublication-error': prepublication, '../core/processing-mode': modes
  }).createBatchExecutorRunner({ SafeError, currentPid: () => pid,
    readState(batchToken) { calls.push('read'); assert.equal(batchToken, token); return state; },
    liveLocalExecutor() { calls.push('live'); return options.invalidLease !== true; },
    publicProgress() { calls.push('initial-progress'); throw options.error; },
    writeState: action('write'), prepareProcessingRun: action('prepare'),
    incrementPrivateIoSummary: action('maintenance'), processBatchNext: action('process'),
    finalizePublishedPackageLocally: action('finalize'), writeTerminalEvidence: action('evidence'),
    appendMapping: action('mapping'), cleanupTerminalWorkCopy: action('cleanup'), pauseRequested: action('pause'),
    retryableCodes: new Set(['CONVERSION_TIMEOUT']),
    releaseLocalBatchExecutor(batchToken, executorPid) {
      calls.push('lease-release'); assert.equal(batchToken, token); assert.equal(executorPid, pid);
      if (Object.hasOwn(options, 'releaseError')) throw options.releaseError;
      return options.releaseResult !== false;
    },
    recordBatchFailure(phase, error) {
      diagnostic.recordBatchExecutionFailure(phase, error, {
        recordWorkflowEvent(event) { events.push(plain(event)); }, send(frame) { frames.push(frame); }
      });
    }
  });
  return { calls, events, frames, async run() {
    let failed = false, caught;
    try { await runner.runLocalBatchExecutor(token, { executorPid: pid }); }
    catch (error) { failed = true; caught = error; }
    assert.equal(JSON.stringify(state.items), before, 'initial progress never stabilizes pending or published work');
    for (const [index, frame] of frames.entries()) {
      assert.deepEqual(plain(diagnostic.readBatchExecutionDiagnostic(frame)), events[index]);
      assert.ok(!JSON.stringify(frame).includes('PRIVATE'));
    }
    return { failed, caught };
  } };
}

test('actual initial Runner progress faults diagnose and release the validated lease once without document actions', async () => {
  for (const error of [fixed('OWNERSHIP_GUARD_BUSY'), Error('PRIVATE unknown progress'), undefined, fixed('CONVERSION_TIMEOUT')]) {
    for (const release of [{}, { releaseError: fixed('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED') }, { releaseResult: false }]) {
      const value = initialProgressFixture({ error, ...release }), result = await value.run();
      assert.equal(result.failed, true); assert.equal(result.caught, error, 'preserve the exact primary, including throw undefined');
      assert.deepEqual(value.calls, ['read', 'live', 'initial-progress', 'lease-release']);
      assert.deepEqual(value.events[0], { event: 'batch_worker_failed', outcome: 'stopped', phase: 'processing',
        error_code: diagnostic.diagnosticCode(error) });
      assert.equal(value.events.length, Object.keys(release).length ? 2 : 1);
      if (Object.keys(release).length) assert.deepEqual(value.events[1], { event: 'batch_worker_failed', outcome: 'stopped',
        phase: 'executor_lease_release', error_code: 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED' });
    }
  }
});

test('actual initial Runner admission rejects foreign and invalid leases before progress, diagnosis or release', async () => {
  for (const lease of [{ foreignLease: true }, { invalidLease: true }]) {
    const value = initialProgressFixture({ error: fixed('OWNERSHIP_GUARD_BUSY'), ...lease }), result = await value.run();
    assert.equal(result.failed, true); assert.match(result.caught.message, /keine gültige Ausführungsberechtigung/u);
    assert.deepEqual(value.calls, ['read', 'live']); assert.deepEqual(value.events, []); assert.deepEqual(value.frames, []);
  }
});

test('actual Runner forwards artifact ID/current PID into actual synchronous Markdown finalizer', async () => {
  const value = await fixture().run(); assert.equal(value.failed, false); assert.equal(value.result.complete, true);
  assert.equal(value.state.items[1].status, 'released'); assert.deepEqual(value.events, []);
});
test('actual acquisition Busy survives the closed catalogue without entering the action', async () => {
  const error = fixed('BATCH_ACTIVE_LOCK_BUSY'), value = await fixture({ acquireError: error, unstarted: true }).run();
  assert.equal(value.caught, error); assert.equal(value.calls.includes('delivery-read'), false);
  assert.deepEqual(value.events.slice(0, 2), [['local_delivery_verify', 'BATCH_LOCAL_DELIVERY_ACQUIRE_FAILED'],
    ['local_delivery_verify', 'BATCH_ACTIVE_LOCK_BUSY']]);
});
test('raw Native Busy remains mapped and never retries the finalizer', async () => {
  const error = fixed('OWNERSHIP_GUARD_BUSY'), value = await fixture({ acquireError: error, unstarted: true }).run();
  assert.equal(value.caught, error);
  assert.equal(value.events[1][1], 'STANDALONE_OWNERSHIP_CONTROL_BUSY');
});
test('read and access boundaries retain the first original coded cause', async () => {
  for (const [option, step] of [['readError', 'STATE'], ['accessError', 'ACCESS']]) {
    const error = fixed('EACCES'), value = await fixture({ [option]: error, unstarted: true }).run();
    assert.equal(value.caught, error); assert.equal(value.state.items[1].status, 'delivery_pending');
    assert.deepEqual(value.events.slice(0, 2), [['local_delivery_verify', 'BATCH_LOCAL_DELIVERY_' + step + '_FAILED'],
      ['local_delivery_verify', 'EACCES']]);
  }
});
test('missing exact pending item is distinguished without changing its original refusal', async () => {
  const value = await fixture({ wrongId: true, unstarted: true }).run(); assert.equal(value.failed, true);
  assert.equal(Object.hasOwn(value.caught, 'code'), false);
  assert.deepEqual(value.events.slice(0, 2), [['local_delivery_verify', 'BATCH_LOCAL_DELIVERY_MATCH_FAILED'],
    ['local_delivery_verify', 'INTERNAL_FAILURE']]);
});
test('actual boolean Markdown verifier still rejects a read error; diagnostic does not invent its lost cause', async () => {
  const value = await fixture({ artifactReadError: fixed('EACCES'), unstarted: true }).run(); assert.equal(value.failed, true);
  assert.equal(value.state.items[1].status, 'delivery_pending');
  assert.deepEqual(value.events.slice(0, 2), [['local_delivery_verify', 'BATCH_LOCAL_DELIVERY_VERIFY_FAILED'],
    ['local_delivery_verify', 'INTERNAL_FAILURE']]);
});
test('commit may already be authoritative when its postcondition throws; no rollback or replay', async () => {
  const error = Error('BATCH_JOURNAL_PUBLICATION_UNCERTAIN');
  const value = await fixture({ commitError: error, commitBeforeThrow: true, unstarted: true }).run();
  assert.equal(value.caught, error); assert.equal(value.state.items[1].status, 'released');
  assert.deepEqual(value.events.slice(0, 2), [['local_delivery_verify', 'BATCH_LOCAL_DELIVERY_COMMIT_FAILED'],
    ['local_delivery_verify', 'BATCH_JOURNAL_PUBLICATION_UNCERTAIN']]);
});
test('postcommit progress failure can match released-plus-pending evidence without proving the historical cause', async () => {
  const error = fixed('STANDALONE_PAUSE_CONTROL_BUSY');
  const value = await fixture({ progressError: error, unstarted: true }).run();
  assert.equal(value.caught, error); assert.equal(value.state.items[1].status, 'released');
  assert.deepEqual(value.events.slice(0, 2), [['local_delivery_verify', 'BATCH_LOCAL_DELIVERY_PROGRESS_FAILED'],
    ['local_delivery_verify', 'STANDALONE_PAUSE_CONTROL_BUSY']]);
});

test('actual postcommit progress uses only the observer and stops at the authoritative next-file pause', async () => {
  const value = await fixture({ realProgress: true, stopAfterDelivery: true, unstarted: true }).run();
  assert.equal(value.failed, false); assert.equal(value.state.items[1].status, 'released');
  assert.equal(value.state.items[2].status, 'pending');
  assert.equal(value.calls.filter(call => call === 'progress-pause-observer').length, 1);
  assert.ok(value.calls.indexOf('delivery-commit') < value.calls.indexOf('progress-pause-observer'));
  assert.deepEqual(value.events, []);
});

test('actual postcommit observer errors preserve committed work without replay or success', async () => {
  for (const code of ['OWNERSHIP_GUARD_BUSY', 'STANDALONE_PAUSE_CONTROL_INVALID']) {
    const error = fixed(code), value = await fixture({ realProgress: true, observeError: error, unstarted: true }).run();
    assert.equal(value.failed, true); assert.equal(value.caught, error);
    assert.equal(value.state.items[1].status, 'released'); assert.equal(value.state.items[2].status, 'pending');
    assert.equal(value.calls.filter(call => call === 'progress-pause-observer').length, 1);
    assert.equal(value.events[0][1], 'BATCH_LOCAL_DELIVERY_PROGRESS_FAILED');
    assert.equal(value.events[1][1], diagnostic.diagnosticCode(error));
  }
});
test('evidence failure and gate close failure have distinct steps and preserve original errors', async () => {
  for (const [option, step] of [['evidenceError', 'EVIDENCE'], ['gateReleaseError', 'RELEASE']]) {
    const error = fixed('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED');
    const value = await fixture({ [option]: error, unstarted: true }).run();
    assert.equal(value.caught, error); assert.equal(value.state.items[1].status, 'released');
    assert.deepEqual(value.events.slice(0, 2), [['local_delivery_verify', 'BATCH_LOCAL_DELIVERY_' + step + '_FAILED'],
      ['local_delivery_verify', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED']]);
  }
});
test('throw undefined survives actual Runner finally even when executor release also throws', async () => {
  const value = await fixture({ progressError: undefined, leaseError: fixed('OWNERSHIP_GUARD_BUSY'), unstarted: true }).run();
  assert.equal(value.failed, true); assert.equal(value.caught, undefined);
  assert.deepEqual(value.events.slice(0, 2), [['local_delivery_verify', 'BATCH_LOCAL_DELIVERY_PROGRESS_FAILED'],
    ['local_delivery_verify', 'INTERNAL_FAILURE']]);
  assert.deepEqual(value.events.at(-1), ['executor_lease_release', 'STANDALONE_OWNERSHIP_CONTROL_BUSY']);
});
test('exact journal messages qualify but getters, proxies, inheritance and prefix payloads do not', async () => {
  let traps = 0;
  for (const error of [Object.defineProperty({}, 'message', { get() { traps++; throw Error('PRIVATE'); } }),
    new Proxy({}, { getOwnPropertyDescriptor() { traps++; throw Error('PRIVATE'); } }),
    Object.create({ message: 'BATCH_JOURNAL_TARGET_UNSAFE' }), Error('BATCH_JOURNAL_TARGET_UNSAFE:/PRIVATE'), fixed('EACCES_PRIVATE')]) {
    const value = await fixture({ commitError: error, unstarted: true }).run(); assert.equal(value.caught, error);
    assert.equal(value.events[1][1], 'INTERNAL_FAILURE');
  }
  assert.equal(traps, 0);
});
test('broken diagnostic sinks never replace original failure or same-call lease cleanup', async () => {
  const error = fixed('EIO'), value = await fixture({ commitError: error, badSink: true, unstarted: true }).run();
  assert.equal(value.caught, error); assert.deepEqual(value.events, []);
});
