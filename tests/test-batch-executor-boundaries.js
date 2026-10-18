'use strict';

// Actual required Executor, presenter and process-identity boundaries. Owned
// children and lease IO are explicit RAM seams: no dialogs, native guard or ps
// invocation is claimed by these cross-platform regression cases.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const path = require('node:path');
const { createSuite } = require('./helpers');
const { createBatchExecutorLease } = require('../plugins/data-secure/server/gateway/batch-executor-lease');
const identity = require('../plugins/data-secure/server/gateway/process-identity');
const { desktopErrorCode } = require('../plugins/data-secure/server/core/desktop-error-contract');
const { createReviewBroker } = require('../plugins/data-secure/server/standalone/review-broker');
const { SafeError } = require('../plugins/data-secure/server/runtime');
const batch = require('../plugins/data-secure/server/gateway/batch');
const completion = require('../plugins/data-secure/server/companion/completion-summary');
const TOKEN = 'a'.repeat(64);
const PRIVATE = 'PRIVATE-SOURCE-CONTENT /private/customer-secret.docx';
const tick = () => new Promise(resolve => setImmediate(resolve));
const { testAsync, done } = createSuite('Batch executor production failure boundaries');

let claim;
const savedBatch = {
  claimLocalBatchExecutor: batch.claimLocalBatchExecutor,
  readBatchProcessingMode: batch.readBatchProcessingMode,
  readBatchProgress: batch.readBatchProgress
};
const savedPresenter = completion.showLocalIntakeNoticeConfirmed;
// These wrappers are captured by the real required Executor, not copied code.
batch.claimLocalBatchExecutor = (...args) => claim(...args);
batch.readBatchProcessingMode = () => 'markdown-and-anonymize';
batch.readBatchProgress = () => { throw Error('no journal read is expected'); };
completion.showLocalIntakeNoticeConfirmed = stage => savedPresenter(stage, { platform: 'darwin' });
const executor = require('../plugins/data-secure/server/gateway/batch-executor');

function childFixture() {
  const child = new EventEmitter();
  Object.assign(child, { pid: 54321, alive: true, exitCode: null, signalCode: null, messages: [], kills: 0,
    send(message, callback) { child.messages.push(message); callback?.(null); },
    kill() { child.kills++; return true; }, unref() {},
    exit() {
      if (!child.alive) return;
      child.alive = false; child.exitCode = 1; child.emit('exit', 1, null);
    }
  });
  return child;
}

function optionsFor(child, channel, records, extra = {}) {
  return { env: { DATASECURE_PRODUCT_CHANNEL: channel },
    forkProcess(file) { assert.match(path.basename(file), /^(?:batch|review)-worker\.js$/u); return child; },
    recordWorkflowEvent: event => records.push(event),
    scheduleExitFinalization: callback => callback(),
    ...extra };
}

function startIntake(child, channel, records, extra = {}) {
  const started = executor.startLocalIntakeExecutor([
    { name: 'synthetic.txt', sourceLabel: 'synthetic.txt', full: path.resolve(__dirname, 'synthetic.txt'), sourceBytes: 16 }
  ], 'auto', optionsFor(child, channel, records, {
    reserveIntake: () => ({ reservation_id: 'd'.repeat(64) }),
    delegateIntake: () => true, releaseIntake: () => true,
    ...extra
  }));
  child.emit('message', { type: 'local-intake-accepted' });
  return started;
}

function stopped(child, stage = 'before_checkpoint') {
  child.emit('message', { type: 'local-intake-stopped', stage, error_code: 'SOURCE_ACCESS_DENIED' });
}

function notices(records, event) { return records.filter(record => record.event === event); }
function acknowledgements(child) { return child.messages.filter(message => message.type === 'local-terminal-notice-claimed'); }

async function main() {
  for (const stage of ['before_checkpoint', 'after_checkpoint']) await testAsync(
    `Standalone ${stage}: actual parent delegates only to in-app UI and does not create a terminal journal`, async () => {
      const child = childFixture(), records = [];
      const oldSpawn = childProcess.spawn;
      let osLaunches = 0, journalClaims = 0;
      childProcess.spawn = () => { osLaunches++; throw Error('unexpected external dialog'); };
      let started;
      try {
        started = startIntake(child, 'standalone', records, {
          reserveTerminalNotice() { journalClaims++; throw Error('Standalone must not arbitrate an OS dialog'); }
        });
        await started.ipcAcknowledgement;
        if (stage === 'after_checkpoint') child.emit('message', { type: 'local-intake-checkpoint-created' });
        stopped(child, stage); stopped(child, stage);
        assert.equal(osLaunches, 0); assert.equal(journalClaims, 0);
        assert.equal(notices(records, 'completion_notice_delegated_to_product_ui').length, 1);
        assert.equal(notices(records, 'completion_notice_dispatched').length, 0);
        const generation = executor.pendingStandaloneTerminalNoticeGeneration(started.batch_token);
        assert.ok(Number.isSafeInteger(generation)); assert.equal(acknowledgements(child).length, 0);
        assert.equal(executor.acknowledgeStandaloneTerminalNotice(generation, 'b'.repeat(64)), false);
        assert.equal(executor.acknowledgeStandaloneTerminalNotice(generation, started.batch_token), true);
        assert.equal(executor.acknowledgeStandaloneTerminalNotice(generation, started.batch_token), false);
        assert.equal(acknowledgements(child).length, 1);
        child.exit(); await tick();
        assert.equal(osLaunches, 0); assert.equal(executor.localIntakeActive(), false);
        assert.equal(notices(records, 'completion_notice_delegated_to_product_ui').length, 1);
      } finally {
        const generation = started && executor.pendingStandaloneTerminalNoticeGeneration(started.batch_token);
        if (generation) executor.acknowledgeStandaloneTerminalNotice(generation, started.batch_token);
        child.exit(); childProcess.spawn = oldSpawn;
      }
    });

  await testAsync('Plugin before checkpoint: delayed confirmation alone permits success and exactly one worker ACK', async () => {
    const child = childFixture(), records = [];
    let confirm, shown = 0, journalClaims = 0;
    try {
      const started = startIntake(child, 'plugin', records, {
        reserveTerminalNotice() { journalClaims++; throw Error('no checkpoint exists'); },
        showLocalIntakeNotice: () => { shown++; return new Promise(resolve => { confirm = resolve; }); }
      });
      await started.ipcAcknowledgement;
      stopped(child); stopped(child);
      assert.equal(shown, 1); assert.equal(journalClaims, 0);
      assert.equal(notices(records, 'completion_notice_dispatched').length, 0);
      assert.equal(acknowledgements(child).length, 0);
      confirm(true); await tick();
      assert.equal(notices(records, 'completion_notice_dispatched').length, 1);
      assert.equal(acknowledgements(child).length, 1);
      child.exit(); await tick();
      assert.equal(shown, 1); assert.equal(acknowledgements(child).length, 1);
    } finally { child.exit(); }
  });

  await testAsync('Plugin before checkpoint: real presenter async EACCES stays handled without success or ACK', async () => {
    const child = childFixture(), records = [];
    const oldSpawn = childProcess.spawn;
    let osLaunches = 0;
    childProcess.spawn = (command, args) => {
      osLaunches++; assert.equal(command, '/usr/bin/osascript'); assert.equal(args[0], '-l');
      const denied = new EventEmitter(); denied.unref = () => {};
      process.nextTick(() => denied.emit('error', Object.assign(Error(PRIVATE), { code: 'EACCES' })));
      return denied;
    };
    try {
      const started = startIntake(child, 'plugin', records); await started.ipcAcknowledgement;
      stopped(child); stopped(child); await tick();
      assert.equal(osLaunches, 1);
      assert.equal(notices(records, 'completion_notice_failed').length, 1);
      assert.equal(notices(records, 'completion_notice_failed')[0].error_code, 'LOCAL_NOTICE_FAILED');
      assert.equal(notices(records, 'completion_notice_dispatched').length, 0);
      assert.equal(acknowledgements(child).length, 0);
      assert.ok(!JSON.stringify(records).includes(PRIVATE));
      child.exit(); await tick(); assert.equal(osLaunches, 1);
    } finally { child.exit(); childProcess.spawn = oldSpawn; }
  });

  for (const confirmed of [false, true]) await testAsync(
    `Plugin before checkpoint: synchronous ${confirmed ? 'confirmation' : 'refusal'} has the same ACK boundary`, async () => {
      const child = childFixture(), records = [];
      try {
        const started = startIntake(child, 'plugin', records, { showLocalIntakeNotice: () => confirmed });
        await started.ipcAcknowledgement; stopped(child); await tick();
        assert.equal(acknowledgements(child).length, confirmed ? 1 : 0);
        assert.equal(notices(records, 'completion_notice_dispatched').length, confirmed ? 1 : 0);
        assert.equal(notices(records, 'completion_notice_failed').length, confirmed ? 0 : 1);
      } finally { child.exit(); }
    });

  for (const confirmed of [false, true]) await testAsync(
    `Plugin after checkpoint: ${confirmed ? 'confirmed' : 'refused'} presenter preserves durable reserve/mark/release ordering`, async () => {
      const child = childFixture(), records = [], order = [];
      let confirm;
      try {
        const started = startIntake(child, 'plugin', records, {
          reserveTerminalNotice() { order.push('reserve'); return { ok: true, reservation_id: 'e'.repeat(32) }; },
          markTerminalNoticePresented() { order.push('mark'); return true; },
          releaseTerminalNoticeReservation() { order.push('release'); return true; },
          showLocalIntakeNotice: () => { order.push('present'); return new Promise(resolve => { confirm = resolve; }); }
        });
        await started.ipcAcknowledgement;
        child.emit('message', { type: 'local-intake-checkpoint-created' }); stopped(child, 'after_checkpoint');
        assert.deepEqual(order, ['reserve', 'present']); assert.equal(acknowledgements(child).length, 0);
        confirm(confirmed); await tick();
        assert.deepEqual(order, ['reserve', 'present', confirmed ? 'mark' : 'release']);
        assert.equal(acknowledgements(child).length, confirmed ? 1 : 0);
        assert.equal(notices(records, 'completion_notice_dispatched').length, confirmed ? 1 : 0);
        assert.equal(notices(records, 'completion_notice_failed').length, confirmed ? 0 : 1);
        child.exit(); await tick(); assert.equal(order.length, 3);
      } finally { child.exit(); }
    });

  await testAsync('Plugin: an after-checkpoint failure still requires the durable arbiter when its earlier checkpoint envelope was lost', async () => {
    const child = childFixture(), records = [];
    let claims = 0, shown = 0;
    try {
      const started = startIntake(child, 'plugin', records, {
        reserveTerminalNotice() { claims++; return { ok: false, state: 'presented' }; },
        showLocalIntakeNotice() { shown++; return true; }
      });
      await started.ipcAcknowledgement;
      stopped(child, 'after_checkpoint');
      child.exit(); await tick();
      assert.equal(claims, 1); assert.equal(shown, 0);
      assert.equal(acknowledgements(child).length, 0);
      assert.equal(notices(records, 'completion_notice_dispatched').length, 0);
    } finally { child.exit(); }
  });

  for (const role of ['batch', 'review']) for (const code of identity.ERROR_CODES) await testAsync(
    `${role}: actual outer start preserves ${code} from the real identity classifier without retry or journal authority`, async () => {
      const child = childFixture(), records = [], startFailures = [];
      let identityCalls = 0, toolCalls = 0, writes = 0, releases = 0;
      const probe = code === 'PROCESS_IDENTITY_ACCESS_DENIED' ? { error: { code: 'EPERM' } } :
        code === 'PROCESS_IDENTITY_TOOL_MISSING' ? { error: { code: 'ENOENT' } } :
        code === 'PROCESS_IDENTITY_TIMEOUT' ? { error: { code: 'ETIMEDOUT' } } :
        code === 'PROCESS_IDENTITY_OUTPUT_INVALID' ? { status: 0, stdout: PRIVATE } : { status: 1 };
      const lease = createBatchExecutorLease({ SafeError,
        processAlive: () => true,
        processInstanceIdentity() { assert.fail('a claim must never fall back to observer/PID-only identity'); },
        requireProcessInstanceIdentity(pid) {
          identityCalls++;
          return identity.requireProcessInstanceIdentity(pid, { platform: 'darwin',
            processAlive: () => code !== 'PROCESS_IDENTITY_UNAVAILABLE',
            spawnSync(command) { toolCalls++; assert.equal(command, '/bin/ps'); return probe; }
          });
        },
        withSynchronousActiveLock() { assert.fail('no transaction before a confirmed process birth'); },
        readState() { assert.fail('no journal read before a confirmed process birth'); },
        writeState() { writes++; }, publicProgress: () => ({})
      });
      claim = (...args) => lease.claimLocalBatchExecutor(...args);
      const broker = createReviewBroker();
      const appReview = { ...broker, startFailed(...args) { startFailures.push(args[1]); return broker.startFailed(...args); } };
      try {
        const options = optionsFor(child, 'standalone', records, {
          claimLocalBatchExecutor: claim, releaseClaimedLocalBatchExecutor() { releases++; }, appReview
        });
        assert.throws(() => role === 'batch' ? executor.startLocalBatchExecutor(TOKEN, options) :
          executor.startLocalReviewExecutor(TOKEN, options), error => {
          assert.ok(error instanceof SafeError); assert.equal(error.code, code);
          assert.equal(desktopErrorCode(error.code), code);
          assert.ok(!error.message.includes(PRIVATE)); return true;
        });
        assert.equal(identityCalls, 1); assert.equal(toolCalls, code === 'PROCESS_IDENTITY_UNAVAILABLE' ? 0 : 1);
        assert.equal(writes, 0); assert.equal(releases, 0); assert.equal(child.kills, 1);
        assert.equal(child.messages.length, 0, 'no queue/draft sent after a refused claim');
        assert.ok(records.some(event => event.event === (role === 'batch' ? 'intake_ipc_failed' : 'review_ipc_failed') && event.error_code === code));
        assert.ok(!JSON.stringify(records).includes(PRIVATE));
        if (role === 'review') {
          assert.deepEqual(startFailures, [code]);
          assert.equal(broker.session().error_code, code, 'persisted Review state retains the fixed cause');
        }
        child.exit(); await tick(); assert.equal(releases, 0);
        if (role === 'review') assert.equal(broker.session().error_code, code, 'later worker exit cannot erase the primary refusal');
        assert.equal(executor.localReviewActive(), false);
      } finally { child.exit(); }
    });

  for (const role of ['batch', 'review']) await testAsync(
    `${role}: foreign vendor/getter/inherited/proxy codes cannot become an identity diagnostic`, async () => {
      let inspected = 0;
      const badErrors = [Object.assign(Error(PRIVATE), { code: 'PROCESS_IDENTITY_ACCESS_DENIED_EXTRA' }),
        Object.defineProperty(Error(PRIVATE), 'code', { get() { inspected++; throw Error(PRIVATE); } }),
        Object.create({ code: 'PROCESS_IDENTITY_ACCESS_DENIED' }),
        new Proxy({}, { get() { inspected++; throw Error(PRIVATE); },
          getOwnPropertyDescriptor() { inspected++; throw Error(PRIVATE); } })];
      for (const bad of badErrors) {
        const child = childFixture(), records = [];
        claim = () => { throw bad; };
        try {
          const options = optionsFor(child, 'standalone', records, {
            claimLocalBatchExecutor: claim, appReview: createReviewBroker()
          });
          assert.throws(() => role === 'batch' ? executor.startLocalBatchExecutor(TOKEN, options) :
            executor.startLocalReviewExecutor(TOKEN, options), error => {
            assert.ok(error instanceof SafeError);
            assert.equal(error.code, role === 'review' ? 'LOCAL_REVIEW_START_FAILED' : undefined);
            assert.ok(!error.message.includes(PRIVATE)); return true;
          });
          assert.ok(!records.some(event => String(event.error_code).startsWith('PROCESS_IDENTITY_')));
          assert.ok(!JSON.stringify(records).includes(PRIVATE));
        } finally { child.exit(); }
      }
      assert.equal(inspected, 0);
    });
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  Object.assign(batch, savedBatch); completion.showLocalIntakeNoticeConfirmed = savedPresenter;
  await done();
});
