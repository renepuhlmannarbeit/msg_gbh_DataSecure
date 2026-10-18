'use strict';

if (process.argv.includes('--begin-failure-child')) {
  // Actual worker and IPC ordering, with only beginBatch deliberately failing
  // before its first write. No native UI, private user data or fake journal.
  require('../plugins/data-secure/server/gateway/workflow-diagnostics').recordWorkflowEvent = () => true;
  require('../plugins/data-secure/server/gateway/batch-intake-reservation').releaseIntake = () => true;
  require('../plugins/data-secure/server/gateway/batch').beginBatch = () => {
    throw Object.assign(Error('PRIVATE synthetic beginBatch refusal'), { code: 'EPERM' });
  };
  require('../plugins/data-secure/server/gateway/batch-worker');
} else {

// Real required Service -> Executor -> private callbacks -> public projection.
// Child IPC, journal observations and source admission IO are explicit seams;
// this does not claim a native Mac/Windows GUI or real journal persistence.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { StandaloneApplicationService } = require('../plugins/data-secure/server/standalone/application-service');
const executor = require('../plugins/data-secure/server/gateway/batch-executor');
const { batchQueueFromSelection } = require('../plugins/data-secure/server/companion/file-picker');
const { createSuite } = require('./helpers');
const SOURCE = path.resolve(__dirname, 'PRIVATE-synthetic-source.txt');
const tick = () => new Promise(resolve => setImmediate(resolve));

function createFixture({ launchWorker, beforeReturn } = {}) {
  const children = [], starts = [], events = [], releases = [];
  let journal = null, historyCalls = 0, osDialogs = 0;
  const unavailable = () => { historyCalls++; throw Object.assign(Error('missing journal'), { code: 'STANDALONE_HISTORY_MISSING' }); };
  const live = () => ({ engine_ready: true, local_intake_pending: executor.localIntakeActive(),
    batch_processing_active: journal?.latest.processing === true });
  const service = new StandaloneApplicationService({ dependencies: {
    initializeProduct: () => ({ ready: true }),
    lightweightStatus: live,
    publicStatusSnapshot(selectedBatchId) {
      const observed = journal && (journal.latest.processing === true || selectedBatchId === journal.token);
      return { current: live(), latest: observed ? journal.latest : null,
        observed_batch_id: observed ? journal.token : null, observed_is_active: journal?.latest.processing === true,
        observed_recoverable: false };
    },
    readConfiguredResultRoot: () => path.resolve(__dirname, 'synthetic-results'),
    reserveIntake() {
      if (executor.localIntakeActive()) throw Object.assign(Error('busy'), { code: 'STANDALONE_BUSY' });
      return { reservation_id: 'd'.repeat(64) };
    }, releaseIntake: () => true,
    validateSelectedPathAsync: async sourcePath => ({ sourcePath, sourceType: 'txt', sourceBytes: 16 }),
    pickSourcesAsync: async () => [{ sourcePath: SOURCE, sourceType: 'txt', sourceBytes: 16 }],
    batchQueueFromSelection,
    recordSupportTrace: () => {},
    startLocalIntakeExecutor(queue, profile, options) {
      const child = launchWorker ? launchWorker() : new EventEmitter();
      if (!launchWorker) Object.assign(child, { pid: 55000 + children.length, alive: true, exitCode: null, signalCode: null,
        sent: [], kills: 0,
        send(message, callback) { child.sent.push(message); callback?.(null); }, unref() {},
        kill() { child.kills++; return true; },
        exit() { if (!child.alive) return; child.alive = false; child.exitCode = 1; child.emit('exit', 1, null); }
      });
      children.push(child);
      const started = executor.startLocalIntakeExecutor(queue, profile, {
        ...options, env: { DATASECURE_PRODUCT_CHANNEL: 'standalone' },
        forkProcess: () => child, delegateIntake: () => true, releaseIntake: () => true,
        showLocalIntakeNotice() { osDialogs++; throw Error('no external dialog'); },
        recordWorkflowEvent: event => events.push(event), scheduleExitFinalization: callback => callback()
      });
      starts.push({ child, options, token: started.batch_token });
      beforeReturn?.(options, started, child);
      return started;
    },
    acknowledgeStandaloneTerminalNotice: executor.acknowledgeStandaloneTerminalNotice,
    pendingStandaloneTerminalNoticeGeneration: executor.pendingStandaloneTerminalNoticeGeneration,
    clearStandaloneIntakeFailureNotice: (...args) => { releases.push(args); return executor.clearStandaloneIntakeFailureNotice(...args); },
    runHistory: { find: unavailable, resolveResults: unavailable, resolveLedger: unavailable, failures: unavailable,
      history() { historyCalls++; return { entries: [] }; } }
  } });
  return { service, children, starts, events, releases,
    get osDialogs() { return osDialogs; }, get historyCalls() { return historyCalls; },
    async admit() { return service.admitSelectedSources([SOURCE]); },
    async start() {
      if (!service.admittedQueue) await this.admit();
      const promise = service.startAdmittedBatch({ processingMode: 'markdown-only' });
      const started = starts.at(-1); started.child.emit('message', { type: 'local-intake-accepted' });
      const response = await promise; return { ...started, response };
    },
    fail(started = starts.at(-1)) {
      started.child.emit('message', { type: 'local-intake-stopped', stage: 'before_checkpoint', error_code: 'PRIVATE_VENDOR_FAILURE' });
      return service.status({ localUi: true });
    },
    checkpoint(started = starts.at(-1)) { started.child.emit('message', { type: 'local-intake-checkpoint-created' }); },
    observeJournal(started = starts.at(-1)) {
      journal = { token: started.token, latest: { processing: true, complete: false, processing_mode: 'markdown-only',
        selected_count: 1, completed_count: 0, result_count: 0, failed_count: 0, review_count: 0, resumable: false } };
    },
    close() {
      service.cancelAdmission();
      for (const child of children) child.exit();
      service.cancelAdmission();
      assert.equal(executor.localIntakeActive(), false);
      assert.equal(osDialogs, 0);
    }
  };
}

function assertNoJournalAuthority(state) {
  assert.equal(state.state, 'start_failed'); assert.equal(state.batch_id, undefined);
  for (const key of ['batch_complete', 'results_available', 'review_required', 'resumable']) assert.equal(state[key], false, key);
  for (const key of ['selected_count', 'completed_count', 'failed_count', 'result_count', 'resumable_count', 'export_pending_count']) assert.equal(state[key], 0, key);
  assert.deepEqual(Object.keys(state.intake_failure).sort(), ['error_code', 'intake_id', 'worker_active']);
  assert.equal(state.intake_failure.error_code, 'STANDALONE_START_FAILED');
  assert.ok(!JSON.stringify(state).includes('PRIVATE'));
}

async function main() {
  const { testAsync, done } = createSuite('Standalone journal-independent intake failure receipt');
  const oldSetTimeout = global.setTimeout, oldClearTimeout = global.clearTimeout;
  const noticeTimers = new Set();
  global.setTimeout = (callback, milliseconds, ...args) => {
    if (milliseconds !== 2500) return oldSetTimeout(callback, milliseconds, ...args);
    const timer = { callback, unref() {} }; noticeTimers.add(timer); return timer;
  };
  global.clearTimeout = timer => { if (!noticeTimers.delete(timer)) oldClearTimeout(timer); };
  const expireNotices = () => { for (const timer of [...noticeTimers]) { noticeTimers.delete(timer); timer.callback(); } };
  try {
    await testAsync('accepted intake before checkpoint stays visible after child exit and notice timeout; rendered ACK grants no history/output rights', async () => {
      const f = createFixture();
      try {
        const started = await f.start(), state = f.fail(started), generation = state.presentation_generation;
        assertNoJournalAuthority(state); assert.equal(state.intake_failure.intake_id, started.response.batch_id);
        assert.equal(state.intake_failure.worker_active, true); assert.equal(state.preparing, true);
        assert.equal(f.service.status().intake_failure.intake_id, undefined, 'non-UI status never returns the private intake token');
        assert.equal(f.service.acknowledgeTerminalPresented(generation + 1).acknowledged, false);
        expireNotices(); assert.equal(executor.pendingStandaloneTerminalNoticeGeneration(started.token), null);
        started.child.exit(); await tick();
        const after = f.service.status({ localUi: true }); assertNoJournalAuthority(after);
        assert.equal(after.intake_failure.worker_active, false); assert.equal(after.presentation_generation, generation);
        assert.equal(f.service.acknowledgeTerminalPresented(generation).acknowledged, true);
        assert.equal(f.service.acknowledgeTerminalPresented(generation).acknowledged, false);
        const rendered = f.service.status({ localUi: true }); assertNoJournalAuthority(rendered);
        assert.equal(rendered.presentation_generation, undefined);
        assert.equal(f.historyCalls, 0); assert.equal(f.starts.length, 1);
        assert.throws(() => f.service.resolveResults(), { code: 'STANDALONE_HISTORY_MISSING' });
        await assert.rejects(f.service.continueCurrentBatch(), { code: 'STANDALONE_HISTORY_MISSING' });
        assert.equal(f.starts.length, 1, 'receipt cannot restart or resume anything');
      } finally { f.close(); }
    });
    await testAsync('real worker accepts IPC then beginBatch throws before any journal; actual Service retains the failure after real process exit', async () => {
      const { fork } = require('node:child_process');
      let child, closed, exitCode;
      const f = createFixture({ launchWorker() {
        child = fork(__filename, ['--begin-failure-child'], { windowsHide: true,
          execArgv: [`--require=${path.resolve(__dirname, '../plugins/data-secure/server/network-deny.cjs')}`],
          env: { SystemRoot: process.env.SystemRoot || '', TEMP: process.env.TEMP || '', TMP: process.env.TMP || '',
            DATASECURE_PRODUCT_CHANNEL: 'standalone' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        child.alive = true;
        child.once('exit', code => { child.alive = false; exitCode = code; });
        closed = new Promise(resolve => child.once('close', resolve));
        child.exit = () => { if (child.exitCode === null && child.signalCode === null) child.kill(); };
        return child;
      } });
      let deadline;
      const bounded = promise => Promise.race([promise, new Promise((_, reject) => {
        deadline = setTimeout(() => reject(Error('bounded real intake failure probe timed out')), 10000);
      })]);
      try {
        await f.admit();
        const result = await bounded(f.service.startAdmittedBatch({ processingMode: 'markdown-only' }));
        clearTimeout(deadline);
        assert.equal(result.event, 'batch_accepted');
        await bounded(closed); clearTimeout(deadline);
        assert.equal(exitCode, 1); assert.equal(executor.localIntakeActive(), false);
        const state = f.service.status({ localUi: true }); assertNoJournalAuthority(state);
        assert.equal(state.intake_failure.intake_id, result.batch_id); assert.equal(state.intake_failure.worker_active, false);
        assert.ok(!f.events.some(event => event.event === 'intake_checkpoint_created'));
        expireNotices(); assert.equal(f.service.status({ localUi: true }).presentation_generation, state.presentation_generation);
        assert.equal(f.service.acknowledgeTerminalPresented(state.presentation_generation).acknowledged, true);
        assert.equal(f.historyCalls, 0); assert.equal(f.osDialogs, 0);
      } finally {
        clearTimeout(deadline); child?.exit();
        if (closed) { await bounded(closed); clearTimeout(deadline); }
        f.close();
      }
    });
    await testAsync('busy failed child remains conservative: a new start cannot replace its receipt before confirmed exit', async () => {
      const f = createFixture();
      try {
        const started = await f.start(), state = f.fail(started);
        f.service.admittedQueue = [{ name: 'synthetic.txt', full: SOURCE, sourceBytes: 16 }];
        await assert.rejects(f.service.startAdmittedBatch({ processingMode: 'markdown-only' }), { code: 'STANDALONE_BUSY' });
        assert.equal(f.starts.length, 1); assert.equal(f.service.status({ localUi: true }).presentation_generation, state.presentation_generation);
      } finally { f.close(); }
    });
    await testAsync('new selection/new attempt invalidates old callbacks and ACKs without erasing the new receipt', async () => {
      const f = createFixture();
      try {
        const first = await f.start(), old = f.fail(first); first.child.exit();
        await f.admit();
        assert.equal(first.options.onIntakeFailure(first.token, old.presentation_generation), false);
        assert.equal(f.service.status({ localUi: true }).intake_failure, undefined);
        assert.equal(f.service.acknowledgeTerminalPresented(old.presentation_generation).acknowledged, false);
        const next = await f.start(); assert.notEqual(next.token, first.token);
        first.options.onIntakeCheckpoint(first.token);
        assert.equal(first.options.onIntakeFailure(first.token, old.presentation_generation + 100), false);
        const current = f.fail(next); assertNoJournalAuthority(current);
        assert.equal(current.intake_failure.intake_id, next.token);
        assert.equal(f.service.acknowledgeTerminalPresented(old.presentation_generation).acknowledged, false);
        assert.equal(f.service.status({ localUi: true }).presentation_generation, current.presentation_generation);
      } finally { f.close(); }
    });
    await testAsync('late acceptance after cancellation cannot bind or revive a superseded attempt', async () => {
      const f = createFixture();
      try {
        await f.admit();
        const pending = f.service.startAdmittedBatch({ processingMode: 'markdown-only' });
        const old = f.starts.at(-1); f.service.cancelAdmission();
        old.child.emit('message', { type: 'local-intake-accepted' });
        const response = await pending; assert.equal(response.batch_id, old.token);
        assert.equal(f.service.observedBatchId, null);
        f.fail(old); old.child.exit(); await tick();
        assert.equal(f.service.status({ localUi: true }).state, 'ready');
        assert.equal(f.service.status({ localUi: true }).presentation_generation, undefined);
      } finally { f.close(); }
    });
    for (const checkpointEnvelope of [false, true]) await testAsync(
      `real checkpoint ${checkpointEnvelope ? 'callback' : 'exact public observation'} permanently overrides the early receipt`, async () => {
        const f = createFixture();
        try {
          const started = await f.start(), failed = f.fail(started);
          if (checkpointEnvelope) f.checkpoint(started);
          f.observeJournal(started);
          const state = f.service.status({ localUi: true });
          assert.equal(state.state, 'processing'); assert.equal(state.intake_failure, undefined); assert.equal(state.batch_id, started.token);
          assert.equal(f.service.acknowledgeTerminalPresented(failed.presentation_generation).acknowledged, false);
          assert.equal(started.options.onIntakeFailure(started.token, failed.presentation_generation + 100), false);
          assert.equal(f.service.status({ localUi: true }).intake_failure, undefined);
        } finally { f.close(); }
      });
    await testAsync('malformed, foreign and duplicate callbacks cannot refresh or re-arm the rendered receipt', async () => {
      const f = createFixture();
      try {
        const started = await f.start();
        for (const [token, generation] of [[started.token, 0], [started.token, NaN], [started.token, '1'], ['f'.repeat(64), 1], [{}, 1]])
          assert.equal(started.options.onIntakeFailure(token, generation), false);
        assert.equal(f.service.status({ localUi: true }).intake_failure, undefined);
        const state = f.fail(started); assertNoJournalAuthority(state);
        assert.equal(f.service.acknowledgeTerminalPresented(state.presentation_generation).acknowledged, true);
        assert.equal(started.options.onIntakeFailure(started.token, state.presentation_generation), true);
        assert.equal(started.options.onIntakeFailure(started.token, state.presentation_generation + 1), false);
        assert.equal(f.service.status({ localUi: true }).presentation_generation, undefined);
        assert.equal(f.service.status({ localUi: true }).state, 'start_failed');
      } finally { f.close(); }
    });
    await testAsync('callbacks before return are held behind the actual returned token binding, never a foreign checkpoint claim', async () => {
      const f = createFixture({ beforeReturn(options) {
        options.onIntakeCheckpoint('f'.repeat(64));
      } });
      try {
        const started = await f.start(), state = f.fail(started);
        assertNoJournalAuthority(state); assert.equal(state.intake_failure.intake_id, started.token);
      } finally { f.close(); }
    });
    await testAsync('an older journal notice cannot suppress a successor intake receipt or borrow its local render ACK', async () => {
      const f = createFixture();
      try {
        const old = await f.start(); f.checkpoint(old);
        old.child.emit('message', { type: 'local-intake-state', complete: true, batch_phase: 'complete',
          batch_total: 1, released: 0, stopped: 1,
          result_grade_counts: { complete: 0, usable_with_omissions: 0, not_processed: 1, unavailable: 0 },
          result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 }, result_grades_verified: true });
        const oldGeneration = executor.pendingStandaloneTerminalNoticeGeneration(old.token);
        assert.ok(Number.isSafeInteger(oldGeneration)); old.child.exit();
        await f.admit(); const next = await f.start(), state = f.fail(next);
        assertNoJournalAuthority(state); assert.notEqual(state.presentation_generation, oldGeneration);
        assert.equal(f.service.acknowledgeTerminalPresented(state.presentation_generation).acknowledged, true);
        assert.equal(executor.pendingStandaloneTerminalNoticeGeneration(old.token), oldGeneration);
        assert.equal(old.child.sent.filter(message => message.type === 'local-terminal-notice-claimed').length, 0);
        assert.equal(next.child.sent.filter(message => message.type === 'local-terminal-notice-claimed').length, 0);
      } finally { f.close(); expireNotices(); }
    });
    await testAsync('the legacy direct Standalone intake uses the same attempt-bound receipt rather than an external dialog', async () => {
      const f = createFixture();
      try {
        const pending = f.service.anonymize();
        await tick(); const started = f.starts.at(-1); assert.ok(started);
        started.child.emit('message', { type: 'local-intake-accepted' });
        const result = await pending; assert.equal(result.operation_accepted, true);
        assertNoJournalAuthority(f.fail(started));
      } finally { f.close(); }
    });
  } finally {
    expireNotices(); global.setTimeout = oldSetTimeout; global.clearTimeout = oldClearTimeout;
    await done();
  }
}

module.exports = { createFixture };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
}
