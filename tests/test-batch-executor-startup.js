'use strict';

// No keyring, journal files, dialogs or real timeout windows. The final probe
// uses a separate Node process solely to verify real ENOENT event ordering.
// EventEmitter deliberately preserves Node's fatal unhandled `error` behavior.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createSuite } = require('./helpers');

const { test, testAsync, assert, done } = createSuite('Batch executor startup boundary');
const filename = path.join(__dirname, '../plugins/data-secure/server/gateway/batch-executor.js');
const source = fs.readFileSync(filename, 'utf8');
const TOKEN = 'a'.repeat(64);
const PRIVATE_DETAIL = 'PRIVATE-SOURCE-CONTENT C:\\private\\customer-secret.docx';
const roles = ['batch', 'intake', 'review'];
class SafeError extends Error {}

function privateError() {
  return Object.assign(new Error(PRIVATE_DETAIL), { code: 'PRIVATE_ERROR_CODE' });
}

function fakeChild(pid = 4321, options = {}) {
  const child = new EventEmitter();
  Object.assign(child, {
    pid, alive: Number.isSafeInteger(pid) && pid > 0,
    exitCode: null, signalCode: null, killed: false,
    kills: 0, unrefs: 0, messages: [], callbacks: [],
    send(message, callback) {
      child.messages.push(message);
      if (options.sendThrows) throw privateError();
      child.callbacks.push(callback);
      return true;
    },
    kill() {
      child.kills++;
      if (options.killThrows) throw privateError();
      // A successful signal is NOT evidence that the child has stopped.
      child.killed = true;
      return true;
    },
    unref() { child.unrefs++; },
    exit(code = 1) {
      child.alive = false;
      child.exitCode = code;
      child.emit('exit', code, null);
    }
  });
  return child;
}

function fixture(role, firstChild) {
  const children = [firstChild];
  const launched = [];
  const records = [];
  const notices = [];
  const claims = [];
  const releases = [];
  const timers = new Set();
  let owner = null;
  let randomCounter = 0;
  let journalReadable = true;
  const progress = {
    ok: true, complete: false, batch_phase: 'awaiting_local_review',
    batch_total: 1, released: 0, stopped: 0, deferred_review: 1,
    result_grade_counts: { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: 1 },
    result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
    result_grades_verified: false
  };
  const batch = {
    claimLocalBatchExecutor(token, pid) {
      claims.push({ token, pid });
      if (owner && launched.some(child => child.pid === owner.pid && child.alive)) {
        throw new SafeError('Ein lokaler Stapel wird bereits verarbeitet.');
      }
      owner = { token, pid };
      return { ...progress };
    },
    releaseLocalBatchExecutor(token, pid) {
      releases.push({ token, pid, alive: launched.some(child => child.pid === pid && child.alive) });
      if (owner?.token !== token || owner?.pid !== pid) return false;
      owner = null;
      return true;
    },
    readBatchProgress() {
      if (!journalReadable) throw privateError();
      return { ...progress };
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    process: { env: {} },
    setTimeout(callback) {
      const timer = { callback, unref() {} };
      timers.add(timer);
      return timer;
    },
    clearTimeout(timer) { timers.delete(timer); },
    require(name) {
      if (name === 'crypto') return { randomBytes: size => Buffer.alloc(size, ++randomCounter) };
      if (name === '../runtime') return { SafeError };
      if (name === './batch') return batch;
      if (name === './workflow-diagnostics') return { recordWorkflowEvent: event => records.push(event) };
      if (name === './batch-intake-reservation') return {
        RESERVATION_ID_RE: /^[a-f0-9]{64}$/,
        reserveIntake: () => ({ reservation_id: 'd'.repeat(64) }),
        delegateIntake: () => true,
        releaseIntake: () => true
      };
      if (name === '../background-role-launcher') return {
        launchBackgroundRole(launchRole) {
          assert.strictEqual(launchRole, role === 'review' ? 'review' : 'batch');
          const child = children.shift();
          assert.ok(child, 'a child must be explicitly queued before launch');
          if (child instanceof Error) throw child;
          launched.push(child);
          return child;
        }
      };
      if (name === '../companion/completion-summary') return {
        validateSummary(summary) {
          return {
            gradeCounts: summary.result_grade_counts,
            omissionCounts: summary.result_omission_counts,
            gradesVerified: summary.result_grades_verified === true
          };
        },
        showLocalIntakeNotice: stage => notices.push({ type: 'failure', stage }),
        showBatchStateNotice: state => notices.push({ type: 'state', state })
      };
      throw new Error(`Unexpected dependency: ${name}`);
    }
  }, { filename, timeout: 1000 });
  const api = module.exports;
  return {
    api, records, notices, claims, releases, launched,
    owner: () => owner,
    queue: child => children.push(child),
    loseJournal() { journalReadable = false; },
    start(options = {}) {
      if (role === 'batch') return api.startLocalBatchExecutor(TOKEN);
      if (role === 'review') return api.startLocalReviewExecutor(TOKEN);
      return api.startLocalIntakeExecutor([
        { name: 'customer-secret.docx', full: PRIVATE_DETAIL, sourceBytes: 16 }
      ], 'auto', options);
    },
    active() {
      return role === 'intake' ? api.localIntakeActive() :
        role === 'review' ? api.localReviewActive() : Boolean(owner);
    },
    drain() {
      let count = 0;
      while (timers.size) {
        assert.ok(++count <= 10, 'exit finalization must settle within bounded callbacks');
        const timer = timers.values().next().value;
        timers.delete(timer);
        timer.callback();
      }
    }
  };
}

function assertSafeStartFailure(start) {
  assert.throws(start, error => {
    assert.ok(error instanceof SafeError);
    assert.match(error.message, /nicht sicher gestartet/);
    assert.doesNotMatch(error.message, /PRIVATE|customer-secret|[a-f0-9]{64}/);
    return true;
  });
}

function assertBoundedDiagnostics(f) {
  assert.ok(f.records.some(event => event.outcome === 'stopped' && /^LOCAL_[A-Z_]+$/.test(event.error_code)),
    'failure must produce a bounded local error diagnosis');
  const keys = new Set(['event', 'outcome', 'error_code', 'item_count', 'exit_code',
    'phase', 'released_count', 'stopped_count']);
  for (const event of f.records) {
    assert.ok(Object.keys(event).every(key => keys.has(key)), 'diagnostics must remain content-free');
    for (const value of Object.values(event)) {
      assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
      if (typeof value === 'string') assert.ok(value.length <= 80);
    }
  }
  assert.doesNotMatch(JSON.stringify(f.records), /PRIVATE|customer-secret|batch_token|[a-f0-9]{64}/);
  assert.doesNotMatch(JSON.stringify(f.notices), /PRIVATE|customer-secret|batch_token|[a-f0-9]{64}/);
}

function assertRetainedWhileAlive(f, child, role) {
  assert.strictEqual(f.records.filter(event => /_worker_exited$/.test(event.event)).length, 0,
    'diagnostics cannot claim an exit while the process may still be alive');
  assert.strictEqual(child.alive, true, 'the fake signal never confirms termination');
  assert.ok(f.active(), `${role} must remain owned/pending while its child may still work`);
  assert.strictEqual(f.releases.length, 0, 'a possibly live lease must not even be released temporarily');
  if (role !== 'intake') assert.strictEqual(f.owner().pid, child.pid);
}

function assertEndedAndRetry(f, child, role) {
  child.exit(1);
  f.drain();
  assert.strictEqual(f.records.filter(event => /_worker_exited$/.test(event.event)).length, 1,
    'exactly one exit diagnosis follows the actual OS exit');
  if (role !== 'batch') assert.strictEqual(f.active(), false, 'confirmed exit clears local pending state');
  assert.ok(f.releases.every(release => !release.alive), 'lease cleanup only follows confirmed termination');
  assert.ok(f.notices.length <= 1, 'one failed child cannot create duplicate notices');
  const retry = fakeChild(child.pid ? child.pid + 1 : 5432);
  f.queue(retry);
  assert.strictEqual(f.start().ok, true, 'retry must be possible after confirmed termination');
  retry.callbacks[0](null);
  retry.exit(0);
  f.drain();
}

async function main() {
  for (const role of roles) {
    test(`${role}: synchronous launcher exception records only a bounded start failure`, () => {
      const f = fixture(role, privateError());
      assertSafeStartFailure(() => f.start());
      assertBoundedDiagnostics(f);
      assert.strictEqual(f.active(), false);
      assert.strictEqual(f.records.length, 1);
      assert.strictEqual(f.records[0].error_code, 'LOCAL_WORKER_SPAWN_FAILED');
      assert.doesNotMatch(f.records[0].event, /_worker_exited$/);
    });
    await testAsync(`${role}: no-PID spawn failure absorbs later error without an exit and permits retry`, async () => {
      const child = fakeChild(null);
      delete child.pid;
      const f = fixture(role, child);
      assertSafeStartFailure(() => f.start());
      await new Promise(resolve => setImmediate(resolve));
      assert.doesNotThrow(() => child.emit('error', privateError()));
      assert.doesNotThrow(() => child.emit('error', privateError()), 'error listener must not be one-shot');
      f.drain();
      assert.strictEqual(f.active(), false);
      assert.strictEqual(f.claims.length, 0);
      assert.strictEqual(f.releases.length, 0);
      assert.strictEqual(f.records.filter(event => /_worker_exited$/.test(event.event)).length, 0,
        'a never-started child cannot be reported as exited');
      assertBoundedDiagnostics(f);
      const retry = fakeChild(5432);
      f.queue(retry);
      assert.strictEqual(f.start().ok, true, 'a never-started child must not leave pending state');
      retry.callbacks[0](null);
      retry.exit(0);
      f.drain();
    });

    test(`${role}: PID-bearing error is handled and ownership survives until actual exit`, () => {
      const child = fakeChild();
      const f = fixture(role, child);
      assert.strictEqual(f.start().ok, true);
      assert.doesNotThrow(() => child.emit('error', privateError()));
      assert.doesNotThrow(() => child.emit('error', privateError()));
      assertBoundedDiagnostics(f);
      assertRetainedWhileAlive(f, child, role);
      assertEndedAndRetry(f, child, role);
    });

    test(`${role}: asynchronous send failure cannot release ownership merely because kill succeeds`, () => {
      const child = fakeChild();
      const f = fixture(role, child);
      assert.strictEqual(f.start().ok, true);
      assert.doesNotThrow(() => child.callbacks[0](privateError()));
      assertBoundedDiagnostics(f);
      assertRetainedWhileAlive(f, child, role);
      assertEndedAndRetry(f, child, role);
    });

    test(`${role}: synchronous send throw and failed kill retain ownership and sanitize the error`, () => {
      const child = fakeChild(4321, { sendThrows: true, killThrows: true });
      const f = fixture(role, child);
      assertSafeStartFailure(() => f.start());
      assert.doesNotThrow(() => child.emit('error', privateError()), 'the catch path must retain its error listener');
      assertBoundedDiagnostics(f);
      assertRetainedWhileAlive(f, child, role);
      assertEndedAndRetry(f, child, role);
    });

    test(`${role}: stale send callback after exit neither kills nor clears a subsequent retry`, () => {
      const child = fakeChild();
      const f = fixture(role, child);
      assert.strictEqual(f.start().ok, true);
      child.exit(1);
      f.drain();
      const oldNoticeCount = f.notices.length;
      const oldKillCount = child.kills;
      const oldReleaseCount = f.releases.length;
      const retry = fakeChild(5432);
      f.queue(retry);
      assert.strictEqual(f.start().ok, true);
      assert.doesNotThrow(() => child.callbacks[0](privateError()));
      assert.doesNotThrow(() => child.emit('error', privateError()));
      f.drain();
      assert.strictEqual(child.kills, oldKillCount, 'a stale callback must not signal an exited/reused PID');
      assert.strictEqual(f.releases.length, oldReleaseCount, 'stale callbacks must not repeat cleanup');
      assert.strictEqual(f.notices.length, oldNoticeCount, 'stale callbacks must not repeat notices');
      assert.strictEqual(f.active(), true, 'the second start must retain its pending state');
      if (role !== 'intake') assert.strictEqual(f.owner().pid, retry.pid);
      retry.callbacks[0](null);
      retry.exit(0);
      f.drain();
      assert.ok(f.releases.every(release => !release.alive));
      assertBoundedDiagnostics(f);
    });

    test(`${role}: error after successful IPC preserves one terminal notice through exit finalization`, () => {
      const child = fakeChild();
      const f = fixture(role, child);
      assert.strictEqual(f.start().ok, true);
      child.callbacks[0](null);
      if (role !== 'review') {
        child.emit('message', {
          type: role === 'intake' ? 'local-intake-state' : 'local-batch-state',
          complete: true, batch_phase: 'complete', batch_total: 1, released: 1, stopped: 0,
          result_grade_counts: { complete: 1, usable_with_omissions: 0, not_processed: 0, unavailable: 0 },
          result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
          result_grades_verified: true
        });
        assert.strictEqual(f.notices.length, 1);
        assert.strictEqual(f.notices[0].type, 'state');
      }
      f.loseJournal();
      assert.doesNotThrow(() => child.emit('error', privateError()));
      assertRetainedWhileAlive(f, child, role);
      child.exit(1);
      f.drain();
      assert.strictEqual(f.notices.length, role === 'review' ? 0 : 1);
      if (role !== 'batch') assert.strictEqual(f.active(), false);
      assertBoundedDiagnostics(f);
    });
  }
  await testAsync('intake: missing IPC acknowledgement times out and late callbacks cannot revive the handoff', async () => {
    const child = fakeChild();
    const f = fixture('intake', child);
    const started = f.start({ ipcAckTimeoutMs: 10 });
    assert.strictEqual(started.ok, true);
    f.drain();
    await assert.rejects(started.ipcAcknowledgement, /timeout/iu);
    assert.strictEqual(child.kills, 1, 'the owned worker is stopped after the bounded acknowledgement timeout');
    assert.doesNotThrow(() => child.callbacks[0](null), 'a late callback is inert');
    assert.strictEqual(child.unrefs, 0, 'a late callback cannot detach a timed-out worker');
    assert.ok(f.records.some(event => event.error_code === 'LOCAL_IPC_ACK_TIMEOUT'));
    assertRetainedWhileAlive(f, child, 'intake');
    assertEndedAndRetry(f, child, 'intake');
  });
  await testAsync('intake: cancellation while waiting for IPC fails the acknowledgement without a second start', async () => {
    const child = fakeChild();
    const f = fixture('intake', child);
    const controller = new AbortController();
    const started = f.start({ ipcAckTimeoutMs: 30000, signal: controller.signal });
    controller.abort();
    await assert.rejects(started.ipcAcknowledgement, /cancelled/iu);
    assert.strictEqual(child.kills, 1);
    assert.ok(f.records.some(event => event.error_code === 'LOCAL_IPC_ACK_CANCELLED'));
    assert.doesNotThrow(() => child.callbacks[0](null));
    child.exit(1);
    f.drain();
    assert.strictEqual(f.active(), false);
  });
  test('real ENOENT children for all three starts cannot crash an isolated parent process', () => {
    const { spawnSync } = require('node:child_process');
    const result = spawnSync(process.execPath, [__filename, '--enoent-probe'], {
      encoding: 'utf8', timeout: 10000, windowsHide: true,
      env: { ...process.env, NODE_OPTIONS: '' }
    });
    assert.ifError(result.error);
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /ENOENT probe: batch, intake, review passed/);
  });
  done();
}

async function realNoPidProbe() {
  const { spawn } = require('node:child_process');
  const missingExecutable = `${process.execPath}.batch-startup-probe-does-not-exist`;
  assert.strictEqual(fs.existsSync(missingExecutable), false);
  for (const role of roles) {
    const child = spawn(missingExecutable, [], {
      windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    });
    // Do not install a test-side error listener: production must own it before
    // Node emits ENOENT on the next tick. A regression exits this probe nonzero.
    const closed = new Promise(resolve => child.once('close', resolve));
    let exited = false;
    child.once('exit', () => { exited = true; });
    const f = fixture(role, child);
    assert.strictEqual(child.pid, undefined);
    assertSafeStartFailure(() => f.start());
    await closed;
    assert.strictEqual(exited, false, 'failed spawn emits error/close, not exit');
    f.drain();
    assert.strictEqual(f.active(), false);
    assert.strictEqual(f.claims.length, 0);
    assert.strictEqual(f.releases.length, 0);
    assertBoundedDiagnostics(f);
  }
  console.log('ENOENT probe: batch, intake, review passed');
}

(process.argv.includes('--enoent-probe') ? realNoPidProbe() : main())
  .catch(error => { console.error(error); process.exitCode = 1; });
