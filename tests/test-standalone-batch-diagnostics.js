'use strict';

// Real application/sidecar wiring in RAM with explicitly injected storage,
// launcher and log sinks. No files, user profiles, native process or Mac claim.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { desktopErrorCode, DESKTOP_ERROR_CODES } = require('../plugins/data-secure/server/core/desktop-error-contract');
const { WORKFLOW_ERROR_CODES } = require('../plugins/data-secure/server/gateway/diagnostic-causes');
const { REASON_CODES } = require('../plugins/data-secure/server/core/document-result-grade');
const repository = path.resolve(__dirname, '..');
const applicationFile = path.join(repository, 'plugins/data-secure/server/standalone/application-service.js');
const sidecarFile = path.join(repository, 'plugins/data-secure/server/standalone/desktop-sidecar.js');
const phases = ['item_epoch_release', 'registry_finalize', 'local_delivery_verify', 'executor_lease_release', 'processing', 'result_export_prepare', 'result_export_claim', 'result_export_plan', 'result_export_copy', 'result_export_claim_release'];
const plain = value => JSON.parse(JSON.stringify(value));
function applicationFixture(options = {}) {
  const platform = options.platform || 'win32';
  const directory = { dev: 1, ino: 2, isDirectory: () => true, isSymbolicLink: () => false };
  const io = { mkdirSync() {}, lstatSync: () => directory, statSync: () => directory,
    realpathSync: Object.assign(value => value, { native: value => value }) };
  const recorded = [], emitted = [], launches = [];
  const reviewBroker = options.reviewBroker || Object.freeze({ marker: 'unchanged-review-broker' });
  const result = Object.freeze({ ok: true, marker: 'unchanged-launch-result' });
  const recorder = record => { recorded.push(record); if (options.recorderThrows) throw Error('PRIVATE recorder'); return 17; };
  const context = vm.createContext({ module: { exports: {} }, process: { platform, env: {} },
    require(name) {
      if (name === 'node:fs') return io;
      if (name === 'node:path' || name === 'node:crypto' || name === 'node:util') return require(name);
      if (name === 'node:os') return { homedir: () => '/isolated/home' };
      if (name === '../core/desktop-error-contract') return { desktopErrorCode, DESKTOP_ERROR_CODES };
      if (name === '../gateway/diagnostic-causes') return { WORKFLOW_ERROR_CODES };
      if (name === '../core/document-result-grade') return { REASON_CODES };
      if (name === './run-history') return { createRunHistory: () => ({}) };
      if (name === './review-broker') return { createReviewBroker: () => reviewBroker };
      if (name === '../gateway/standalone-document-review-store') return { createDocumentReviewStore: () => ({}) };
      if (name === '../gateway/workflow-diagnostics') return { recordWorkflowEvent: recorder };
      if (name === '../gateway/batch-executor') return options.batchExecutor || {
        startLocalIntakeExecutor(queue, profile, executorOptions) { launches.push({ queue, profile, options: executorOptions }); return result; },
        startLocalBatchExecutor(token, executorOptions) { launches.push({ token, options: executorOptions }); return result; },
        startLocalReviewExecutor(token, executorOptions) { launches.push({ token, options: executorOptions }); return result; }
      };
      // Only dependency construction is exercised; none of these services runs.
      return {};
    }
  });
  vm.runInContext(fs.readFileSync(applicationFile, 'utf8'), context, { filename: applicationFile, timeout: 1000 });
  const deps = context.module.exports.defaultDependencies({
    dataRoot: platform === 'win32' ? 'C:\\isolated\\private' : '/isolated/private', fs: io,
    startupDiagnostic(event, fields) {
      emitted.push([event, plain(fields)]);
      if (options.sinkThrows) throw Error('PRIVATE diagnostic sink');
      options.sink?.(event, fields);
    }
  });
  return { deps, recorded, emitted, launches, result, reviewBroker };
}
function sidecarFixture(options = {}) {
  const lines = [];
  let sink;
  class Service { constructor(value) { sink = value.startupDiagnostic; } }
  class Channel {}
  class Decoder { constructor() { this.buffer = Buffer.alloc(0); } }
  const context = vm.createContext({ Buffer, Date, console,
    process: { env: { DATASECURE_STANDALONE_DIAGNOSTIC_DIR: '/isolated/diagnostics',
      DATASECURE_STANDALONE_DIAGNOSTIC_SESSION: 'a'.repeat(32) },
      stdin: { on() {}, pause() {} }, stdout: { on() {}, write() { return true; } },
      exit() { throw Error('unexpected sidecar exit'); } },
    setTimeout, clearTimeout,
    require(name) {
      if (name === 'node:path' || name === 'node:os') return require(name);
      if (name === '../core/safe-diagnostic-log') return { createBestEffortDiagnosticLog: () => ({ append(line) {
        if (options.sinkThrows) throw Error('PRIVATE writer'); lines.push(line); return !options.sinkFalse;
      } }) };
      if (name === './application-service') return { StandaloneApplicationService: Service };
      if (name === './desktop-ipc') return { FrameDecoder: Decoder, MAX_FRAME_BYTES: 1048576, validatePrivateMessage: () => true };
      if (name === './native-export-channel') return { NativeExportChannel: Channel };
      if (name === '../gateway/diagnostic-causes') return { WORKFLOW_ERROR_CODES };
      if (name === '../core/document-result-grade') return { REASON_CODES };
      assert.equal(name, '../core/desktop-error-contract'); return { desktopErrorCode, DESKTOP_ERROR_CODES };
    }
  });
  vm.runInContext(fs.readFileSync(sidecarFile, 'utf8'), context, { filename: sidecarFile, timeout: 1000 });
  return { sink, rows: () => lines.map(line => JSON.parse(line)).filter(row => row.event === 'batch_worker_failed') };
}
function launch(fixture, kind, options = {}) {
  const queue = [{ name: 'PRIVATE-source.txt' }], signal = {};
  const supplied = { requireIpcAcknowledgement: true, signal, ...options };
  const output = kind === 'intake' ? fixture.deps.startLocalIntakeExecutor(queue, 'general', supplied)
    : kind === 'review' ? fixture.deps.startLocalReviewExecutor('PRIVATE-token', supplied)
    : fixture.deps.startLocalBatchExecutor('PRIVATE-token', supplied);
  assert.equal(output, fixture.result);
  const call = fixture.launches.at(-1);
  assert.equal(call.options.signal, signal);
  assert.equal(call.options.requireIpcAcknowledgement, true);
  if (kind === 'intake') { assert.equal(call.queue, queue); assert.equal(call.profile, 'general'); }
  else assert.equal(call.token, 'PRIVATE-token');
  if (kind === 'review') assert.equal(call.options.appReview, fixture.reviewBroker);
  assert.equal(supplied.recordWorkflowEvent, options.recordWorkflowEvent, 'never mutate caller options');
  return call.options.recordWorkflowEvent;
}
test('all three actual application callsites preserve options and mirror every fixed stage on Windows/Mac', () => {
  for (const platform of ['win32', 'darwin']) for (const kind of ['intake', 'batch', 'review']) {
    const f = applicationFixture({ platform }), record = launch(f, kind);
    for (const phase of phases) {
      const input = { event: 'batch_worker_failed', outcome: 'stopped', phase, error_code: 'OWNERSHIP_GUARD_BUSY',
        message: 'PRIVATE', stack: '/PRIVATE/path', batch_id: 'PRIVATE', run_id: 'PRIVATE' };
      assert.equal(record(input), 17); assert.equal(f.recorded.at(-1), input);
      assert.deepEqual(f.emitted.at(-1), ['batch_worker_failed', { outcome: 'failed', phase,
        error_code: 'STANDALONE_OWNERSHIP_CONTROL_BUSY' }]);
    }
    assert.equal(f.emitted.length, phases.length); assert.equal(f.recorded.length, phases.length);
  }
});
test('custom workflow recorder is preserved and either diagnostic sink may fail without changing batch behavior', () => {
  const f = applicationFixture({ sinkThrows: true });
  const custom = [], record = launch(f, 'intake', { recordWorkflowEvent(value) { custom.push(value); return 29; } });
  const input = { event: 'batch_worker_failed', outcome: 'stopped', phase: 'registry_finalize', error_code: 'DOCUMENT_REVIEW_CONFLICT' };
  assert.equal(record(input), 29); assert.equal(custom[0], input); assert.equal(f.recorded.length, 0);
  const broken = applicationFixture({ recorderThrows: true }), mirror = launch(broken, 'batch');
  assert.equal(mirror(input), false); assert.equal(broken.emitted.length, 1, 'second sink still receives evidence');
  assert.equal(broken.emitted[0][1].error_code, 'DOCUMENT_REVIEW_CONFLICT');
  const sidecar = sidecarFixture({ sinkThrows: true });
  assert.doesNotThrow(() => sidecar.sink('batch_worker_failed', { phase: 'processing', error_code: 'STANDALONE_OPERATION_FAILED' }));
  const refused = sidecarFixture({ sinkFalse: true });
  assert.doesNotThrow(() => refused.sink('batch_worker_failed', { phase: 'processing', error_code: 'STANDALONE_OPERATION_FAILED' }));
});
test('successful/unrelated lifecycle events are not relabeled as batch failures', () => {
  const f = applicationFixture(), record = launch(f, 'batch');
  for (const input of [{ event: 'intake_terminal_state', outcome: 'stopped', phase: 'processing' },
    { event: 'batch_worker_failed', outcome: 'ok', phase: 'processing' },
    { event: 'batch_worker_failed', outcome: 'progress', phase: 'processing' },
    { event: 'intake_worker_spawned', outcome: 'ok' }]) assert.equal(record(input), 17);
  assert.equal(f.recorded.length, 4); assert.deepEqual(f.emitted, []);
});
test('mirror rejects getters/proxies and normalizes unknown phase/code without copying payload or identifiers', () => {
  const f = applicationFixture(), record = launch(f, 'batch');
  let traps = 0;
  const accessor = { get event() { traps++; throw Error('PRIVATE'); }, outcome: 'stopped' };
  const proxy = new Proxy({}, { getOwnPropertyDescriptor() { traps++; throw Error('PRIVATE'); } });
  assert.equal(record(accessor), 17); assert.equal(record(proxy), 17); assert.equal(traps, 0);
  record({ event: 'batch_worker_failed', outcome: 'stopped', phase: '/PRIVATE/path', error_code: 'STANDALONE_PRIVATE_PERSON',
    message: 'PRIVATE', stack: 'PRIVATE', path: 'PRIVATE', document_id: 'PRIVATE' });
  assert.deepEqual(f.emitted, [['batch_worker_failed', { outcome: 'failed', phase: 'processing', error_code: 'STANDALONE_OPERATION_FAILED' }]]);
});
test('actual application-to-sidecar bridge writes only schema/time/component and fixed failure code/stage', () => {
  const sidecar = sidecarFixture(), f = applicationFixture({ sink: sidecar.sink }), record = launch(f, 'intake');
  for (const phase of phases) record({ event: 'batch_worker_failed', outcome: 'stopped', phase,
    error_code: 'OWNERSHIP_GUARD_UNSAFE', run_id: 'PRIVATE', message: 'PRIVATE', path: 'PRIVATE', stack: 'PRIVATE',
    session_id: 'b'.repeat(32), request_id: 'c'.repeat(32), batch_id: 'd'.repeat(64), document_id: 'e'.repeat(32) });
  const rows = sidecar.rows(); assert.equal(rows.length, phases.length);
  for (const [index, row] of rows.entries()) {
    assert.deepEqual(Object.keys(row).sort(), ['schema', 'time_ms', 'component', 'event', 'outcome', 'phase', 'error_code'].sort());
    assert.equal(row.schema, 'datasecure-standalone-interaction/1'); assert.equal(row.component, 'sidecar');
    assert.equal(row.event, 'batch_worker_failed'); assert.equal(row.outcome, 'failed'); assert.equal(row.phase, phases[index]);
    assert.equal(row.error_code, 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE'); assert.ok(Number.isSafeInteger(row.time_ms));
    assert.ok(!JSON.stringify(row).includes('PRIVATE'));
  }
});
test('sidecar reprojects its diagnostic hook independently, including malicious direct extras', () => {
  const f = sidecarFixture();
  f.sink('batch_worker_failed', { outcome: 'PRIVATE', phase: '/PRIVATE/vendor', error_code: 'PRIVATE',
    action: 'PRIVATE', elapsed_ms: 1, completed_count: 1, total_count: 1, journal_count: 1, export_count: 1,
    message: 'PRIVATE', path: 'PRIVATE', stack: 'PRIVATE', batch_id: 'PRIVATE', session_id: 'PRIVATE' });
  const [row] = f.rows();
  assert.equal(row.phase, 'processing'); assert.equal(row.outcome, 'failed'); assert.equal(row.error_code, 'STANDALONE_OPERATION_FAILED');
  assert.deepEqual(Object.keys(row).sort(), ['schema', 'time_ms', 'component', 'event', 'outcome', 'phase', 'error_code'].sort());
  assert.ok(!JSON.stringify(row).includes('PRIVATE'));
});
test('error classification is fixed before transport, never a vendor string or caller-supplied class', () => {
  const sidecar = sidecarFixture(), f = applicationFixture({ sink: sidecar.sink }), record = launch(f, 'batch');
  for (const [internal, expected] of [
    ['OWNERSHIP_GUARD_BUSY', 'STANDALONE_OWNERSHIP_CONTROL_BUSY'],
    ['OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED'],
    ['OWNERSHIP_GUARD_ACCESS_DENIED', 'STANDALONE_OWNERSHIP_RUNTIME_DENIED'],
    ['OWNERSHIP_GUARD_UNSAFE', 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE'],
    ['DOCUMENT_REVIEW_CONFLICT', 'DOCUMENT_REVIEW_CONFLICT'],
    ['STANDALONE_OWNERSHIP_CONTROL_BUSY', 'STANDALONE_OWNERSHIP_CONTROL_BUSY'],
    ['INTERNAL_FAILURE', 'INTERNAL_FAILURE'],
    ['BATCH_PRIVATE_VENDOR', 'STANDALONE_OPERATION_FAILED'],
    ['/PRIVATE/vendor', 'STANDALONE_OPERATION_FAILED']
  ]) {
    record({ event: 'batch_worker_failed', outcome: 'stopped', phase: 'processing', error_code: internal,
      classification: 'PRIVATE caller class' });
    assert.equal(sidecar.rows().at(-1).error_code, expected);
    assert.ok(!Object.hasOwn(sidecar.rows().at(-1), 'classification'));
  }
});
test('all and only inherited Workflow/Desktop/document catalogue causes survive the complete bridge', () => {
  const sidecar = sidecarFixture(), f = applicationFixture({ sink: sidecar.sink }), record = launch(f, 'intake');
  const catalogue = new Set([...WORKFLOW_ERROR_CODES, ...DESKTOP_ERROR_CODES, ...REASON_CODES]);
  assert.ok(catalogue.has('RESIDUAL_PII')); assert.ok(catalogue.has('IMAGE_OCR_REQUIRED'));
  for (const code of catalogue) {
    record({ event: 'batch_worker_failed', outcome: 'stopped', phase: 'local_delivery_verify', error_code: code });
    const mapped = desktopErrorCode(code);
    assert.equal(sidecar.rows().at(-1).error_code, mapped !== 'STANDALONE_OPERATION_FAILED' ? mapped : code, code);
  }
  for (const code of ['IMAGES_REMOVED_BY_REQUEST', 'VISUAL_ASSETS_WITHHELD_LOCALLY', 'COMPLETE', 'RESIDUAL_PRIVATE',
    'STANDALONE_PRIVATE_PERSON', 'BATCH_PRIVATE_VENDOR', 'CONVERSION_PRIVATE', 'SOURCE_PRIVATE']) {
    assert.ok(!catalogue.has(code));
    record({ event: 'batch_worker_failed', outcome: 'stopped', phase: 'processing', error_code: code });
    assert.equal(sidecar.rows().at(-1).error_code, 'STANDALONE_OPERATION_FAILED');
  }
});

// Exact production Executor body; only launcher, kernel lease and UI/IO sinks
// are explicit RAM models. JSON rehydration models the IPC receiver's realm.
function reviewExecutorFixture(platform) {
  const { EventEmitter } = require('node:events');
  const child = new EventEmitter(), sends = [], timers = new Set(), brokerCalls = [];
  child.pid = 4242; child.exitCode = null; child.signalCode = null;
  child.send = (message, callback) => { sends.push(plain(message)); callback?.(null); };
  let kills = 0, releases = 0, launches = 0, stopped = false;
  child.kill = () => { kills++; return true; }; child.unref = () => {};
  const proof = Object.freeze({ ok: true, batch_total: 3, released: 2, stopped: 0,
    deferred_review: 1, batch_phase: 'awaiting_local_review' });
  const broker = {
    beginAttempt(token) { brokerCalls.push(['attempt', token]); return 'own-attempt'; },
    begin(value, token) { assert.equal(value, child); brokerCalls.push(['begin', token]); },
    receive(value, message) { assert.equal(value, child); brokerCalls.push(['receive', plain(message)]); return true; },
    release(value) { assert.equal(value, child); brokerCalls.push(['release']); },
    failed() { brokerCalls.push(['failed']); }, startFailed() { brokerCalls.push(['startFailed']); }
  };
  const context = vm.createContext({ Buffer, process: { platform, pid: 1234,
    env: { DATASECURE_PRODUCT_CHANNEL: 'standalone' } },
    setTimeout(callback, delay) { const timer = { callback, delay, unref() {} }; timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); }
  });
  const execute = (file, dependency) => {
    const module = { exports: {} };
    const factory = vm.runInContext('(function(module, require) {\n' + fs.readFileSync(file, 'utf8') + '\n})',
      context, { filename: file, timeout: 1000 });
    factory(module, dependency); return module.exports;
  };
  const diagnostic = execute(path.join(repository, 'plugins/data-secure/server/gateway/batch-execution-diagnostic.js'), id => {
    if (id === 'node:util') return require(id);
    if (id === './diagnostic-causes') return { WORKFLOW_ERROR_CODES };
    if (id === '../core/ownership-diagnostics') return require('../plugins/data-secure/server/core/ownership-diagnostics');
    throw Error('Unexpected diagnostic dependency: ' + id);
  });
  const batch = {
    claimLocalBatchExecutor(token, pid) { assert.equal(token, 'a'.repeat(64)); assert.equal(pid, child.pid); return proof; },
    releaseClaimedLocalBatchExecutor(value) { assert.equal(value, proof); releases++; return true; }
  };
  const api = execute(path.join(repository, 'plugins/data-secure/server/gateway/batch-executor.js'), id => {
    if (['crypto', 'node:util'].includes(id)) return require(id);
    if (id === '../background-role-launcher') return { launchBackgroundRole(role, options) {
      assert.equal(role, 'review'); assert.equal(options.env.DATASECURE_PRODUCT_CHANNEL, 'standalone'); launches++; return child;
    } };
    if (id === '../runtime') return { SafeError: Error };
    if (id === './batch') return batch;
    if (id === '../companion/completion-summary') return {
      showBatchStateNoticeConfirmed() { assert.fail('no completion UI from a diagnostic'); },
      showLocalIntakeNoticeConfirmed() { assert.fail('no failure UI from a diagnostic'); }
    };
    if (id === './workflow-diagnostics') return { newRunId: () => '12345678',
      recordWorkflowEvent() { assert.fail('application must provide the mirror recorder'); } };
    if (id === './batch-execution-diagnostic') return diagnostic;
    if (id === './batch-queue-envelope') return { PURPOSE_ERROR_CODES: [] };
    if (id === '../core/content-options') return require('../plugins/data-secure/server/core/content-options');
    if (id === '../core/processing-mode') return require('../plugins/data-secure/server/core/processing-mode');
    if (['./batch-intake-reservation', './content-start-boundary', '../core/standalone-review-policy', '../resource-limits'].includes(id)) return {};
    if (id === '../core/result-naming-mode') return { MODES: {} };
    throw Error('Unexpected executor dependency: ' + id);
  });
  return { api, broker, brokerCalls, sends,
    emit(message) {
      context.wire = JSON.stringify(message);
      const decoded = vm.runInContext('JSON.parse(wire)', context, { timeout: 1000 });
      child.emit('message', decoded);
    },
    snapshot: () => ({ kills, releases, launches, timers: timers.size }),
    stop() { if (!stopped) { stopped = true; child.exitCode = 0; child.emit('exit', 0); }
      assert.equal(api.localReviewActive(), false); assert.equal(timers.size, 0); }
  };
}
test('actual Review Executor diagnostics cross Application and Sidecar on Windows/Darwin without settling ACK or UI', async () => {
  for (const platform of ['win32', 'darwin']) {
    const executor = reviewExecutorFixture(platform), sidecar = sidecarFixture();
    const f = applicationFixture({ platform, batchExecutor: executor.api, reviewBroker: executor.broker, sink: sidecar.sink });
    const signal = { addEventListener() {}, removeEventListener() {} };
    const options = Object.freeze({ signal, requireIpcAcknowledgement: true, ipcAckTimeoutMs: 1000 });
    let acknowledged = false;
    try {
      const response = f.deps.startLocalReviewExecutor('a'.repeat(64), options);
      assert.equal(response.local_review_started, true); assert.equal(response.raw_content_sent_to_claude, false);
      response.ipcAcknowledgement.then(() => { acknowledged = true; }, () => {});
      assert.deepEqual(executor.sends, [{ type: 'start-local-review', batch_token: 'a'.repeat(64), ui: 'standalone-app' }]);
      for (const phase of phases) executor.emit({ type: 'local-batch-diagnostic', phase, error_code: 'RESULT_EXPORT_SOURCE_INVALID' });
      for (const message of [
        { type: 'local-batch-diagnostic', phase: 'result_export_plan', error_code: 'RESULT_EXPORT_SOURCE_INVALID', ack: true },
        { type: 'local-batch-diagnostic', phase: 'PRIVATE', error_code: 'RESULT_EXPORT_SOURCE_INVALID' },
        { type: 'local-batch-diagnostic', phase: 'result_export_plan', error_code: 'PRIVATE' }
      ]) executor.emit(message);
      await Promise.resolve(); assert.equal(acknowledged, false);
      assert.deepEqual(executor.snapshot(), { kills: 0, releases: 0, launches: 1, timers: 1 });
      assert.deepEqual(executor.brokerCalls.map(call => call[0]), ['attempt', 'begin']);
      assert.equal(sidecar.rows().length, phases.length);
      assert.deepEqual(sidecar.rows().map(row => row.phase), phases);
      for (const row of sidecar.rows()) {
        assert.equal(row.error_code, 'RESULT_EXPORT_SOURCE_INVALID');
        assert.deepEqual(Object.keys(row).sort(), ['schema', 'time_ms', 'component', 'event', 'outcome', 'phase', 'error_code'].sort());
        assert.ok(!JSON.stringify(row).includes('PRIVATE'));
      }
      const events = f.recorded.filter(row => row.event === 'batch_worker_failed');
      assert.equal(events.length, phases.length); assert.equal(events[0].run_id, '12345678');
      executor.emit({ type: 'local-review-accepted' }); await response.ipcAcknowledgement; await Promise.resolve();
      assert.equal(acknowledged, true); assert.equal(executor.snapshot().timers, 0);
      executor.emit({ type: 'standalone-review-draft', synthetic: true });
      assert.equal(executor.brokerCalls.filter(call => call[0] === 'receive').length, 1);
      assert.equal(Object.hasOwn(options, 'recordWorkflowEvent'), false, 'caller options stay unchanged');
    } finally { executor.stop(); }
    assert.equal(executor.snapshot().releases, 1, 'only confirmed synthetic exit releases the same claim proof');
  }
});
test('actual Review diagnostic path preserves custom recorder, primary/cleanup order and best-effort failures', async () => {
  for (const platform of ['win32', 'darwin']) for (const failure of ['none', 'recorder', 'application', 'sidecar-throw', 'sidecar-false']) {
    const executor = reviewExecutorFixture(platform), custom = [];
    const sidecar = sidecarFixture({ sinkThrows: failure === 'sidecar-throw', sinkFalse: failure === 'sidecar-false' });
    const f = applicationFixture({ platform, batchExecutor: executor.api, reviewBroker: executor.broker,
      sinkThrows: failure === 'application', sink: sidecar.sink });
    const recordWorkflowEvent = record => { custom.push(record); if (failure === 'recorder') throw Error('PRIVATE recorder'); return 29; };
    const options = Object.freeze({ requireIpcAcknowledgement: true, recordWorkflowEvent });
    let acknowledged = false;
    try {
      const response = f.deps.startLocalReviewExecutor('a'.repeat(64), options);
      response.ipcAcknowledgement.then(() => { acknowledged = true; }, () => {});
      executor.emit({ type: 'local-batch-diagnostic', phase: 'result_export_plan', error_code: 'RESULT_EXPORT_SOURCE_INVALID' });
      executor.emit({ type: 'local-batch-diagnostic', phase: 'result_export_claim_release', error_code: 'OWNERSHIP_GUARD_BUSY' });
      await Promise.resolve(); assert.equal(acknowledged, false);
      // Wire accepts catalogued mapped codes only, not raw native names.
      executor.emit({ type: 'local-batch-diagnostic', phase: 'result_export_claim_release', error_code: 'STANDALONE_OWNERSHIP_CONTROL_BUSY' });
      const observed = custom.filter(row => row.event === 'batch_worker_failed');
      assert.deepEqual(observed.map(row => [row.phase, row.error_code]), [
        ['result_export_plan', 'RESULT_EXPORT_SOURCE_INVALID'], ['result_export_claim_release', 'STANDALONE_OWNERSHIP_CONTROL_BUSY']
      ]);
      assert.equal(f.recorded.length, 0, 'custom workflow recorder remains the selected recorder');
      assert.deepEqual(f.emitted.map(row => [row[1].phase, row[1].error_code]), observed.map(row => [row.phase, row.error_code]));
      assert.equal(sidecar.rows().length, ['application', 'sidecar-throw'].includes(failure) ? 0 : 2);
      assert.deepEqual(executor.snapshot(), { kills: 0, releases: 0, launches: 1, timers: 1 });
      assert.deepEqual(executor.brokerCalls.map(call => call[0]), ['attempt', 'begin']);
      executor.emit({ type: 'local-review-accepted' }); await response.ipcAcknowledgement;
      assert.equal(options.recordWorkflowEvent, recordWorkflowEvent);
    } finally { executor.stop(); }
    assert.equal(executor.snapshot().releases, 1);
  }
});


test('review wrapper preserves omitted/null spread options and does not mutate an existing options object', () => {
  for (const platform of ['win32', 'darwin']) for (const supplied of [undefined, null, Object.freeze({ marker: 'kept-own-option' })]) {
    const f = applicationFixture({ platform });
    assert.equal(f.deps.startLocalReviewExecutor('PRIVATE-token', supplied), f.result);
    const call = f.launches.at(-1);
    assert.equal(call.options.appReview, f.reviewBroker);
    assert.equal(typeof call.options.recordWorkflowEvent, 'function');
    if (supplied) {
      assert.equal(call.options.marker, supplied.marker);
      assert.equal(Object.hasOwn(supplied, 'recordWorkflowEvent'), false);
      assert.equal(Object.hasOwn(supplied, 'appReview'), false);
    }
  }
});
