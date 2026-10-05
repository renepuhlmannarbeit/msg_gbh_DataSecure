'use strict';

// No keyring, journal files, dialogs or real timeout windows. The final probe
// uses a separate Node process solely to verify real ENOENT event ordering.
// EventEmitter deliberately preserves Node's fatal unhandled `error` behavior.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createSuite } = require('./helpers');

const assert = require('node:assert');
const { createReviewBroker } = require('../plugins/data-secure/server/standalone/review-broker');
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
  const noticeOptions = [];
  const claims = [];
  const releases = [];
  const timers = new Set();
  let owner = null;
  let randomCounter = 0;
  let journalReadable = true;
  let terminalNotice = null;
  const progress = {
    ok: true, complete: false, batch_phase: 'awaiting_local_review',
    batch_total: 1, completed: 0, released: 0, stopped: 0, deferred_review: 1,
    remaining: 0, retryable: 0, delivery_pending: 0, mapping_pending: 0, processing: 0,
    result_grade_counts: { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: 1 },
    result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
    result_grades_verified: false
  };
  const batch = {
    readBatchProcessingMode() { return 'markdown-and-anonymize'; },
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
    },
    reserveTerminalNotice(token, presenter) {
      if (terminalNotice) return { ok: false, state: terminalNotice.state };
      terminalNotice = { state: 'reserved', token, presenter, reservation_id: 'e'.repeat(32) };
      return { ok: true, state: 'reserved', reservation_id: terminalNotice.reservation_id };
    },
    markTerminalNoticePresented(token, presenter, reservationId) {
      if (terminalNotice?.token !== token || terminalNotice?.presenter !== presenter ||
          terminalNotice?.reservation_id !== reservationId) return false;
      terminalNotice = { state: 'presented', token, presenter };
      return true;
    },
    releaseTerminalNoticeReservation(token, presenter, reservationId) {
      if (terminalNotice?.token !== token || terminalNotice?.presenter !== presenter ||
          terminalNotice?.reservation_id !== reservationId) return false;
      terminalNotice = null;
      return true;
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
      if (name === '../resource-limits') return require('../plugins/data-secure/server/resource-limits');
      if (name === '../core/processing-mode') return require('../plugins/data-secure/server/core/processing-mode');
      if (name === '../core/result-naming-mode') return require('../plugins/data-secure/server/core/result-naming-mode');
      if (name === './batch') return batch;
      if (name === './workflow-diagnostics') return { recordWorkflowEvent: event => records.push(event) };
      if (name === './batch-intake-reservation') return {
        RESERVATION_ID_RE: /^[a-f0-9]{64}$/,
        reserveIntake: () => ({ reservation_id: 'd'.repeat(64) }),
        delegateIntake: () => true,
        releaseIntake: () => true
      };
      if (name === './batch-queue-envelope') {
        return require('../plugins/data-secure/server/gateway/batch-queue-envelope');
      }
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
        showBatchStateNotice: state => notices.push({ type: 'state', state }),
        showLocalIntakeNoticeConfirmed: stage => { notices.push({ type: 'failure', stage }); return true; },
        showBatchStateNoticeConfirmed: (state, options) => { notices.push({ type: 'state', state }); noticeOptions.push(options); return true; }
      };
      throw new Error(`Unexpected dependency: ${name}`);
    }
  }, { filename, timeout: 1000 });
  const api = module.exports;
  return {
    api, records, notices, noticeOptions, claims, releases, launched,
    owner: () => owner,
    queue: child => children.push(child),
    loseJournal() { journalReadable = false; },
    start(options = {}) {
      if (role === 'batch') return api.startLocalBatchExecutor(TOKEN, options);
      if (role === 'review') return api.startLocalReviewExecutor(TOKEN, options);
      return api.startLocalIntakeExecutor([
        { name: 'customer-secret.docx', full: path.resolve(__dirname, 'private-fixture', 'customer-secret.docx'), sourceBytes: 16 }
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

function initialCases(test) {
test('an invalid private intake queue is rejected before a child is launched', () => {
  const f = fixture('intake', fakeChild());
  assert.throws(() => f.api.startLocalIntakeExecutor([
    { sourcePath: path.resolve(__dirname, 'wrong-shape.txt'), sourceBytes: 12 }
  ]), (error) => error instanceof SafeError && error.code === 'LOCAL_QUEUE_SCHEMA_INVALID');
  assert.strictEqual(f.launched.length, 0);
});

test('Standalone intake sends exactly one validated result-name choice to the worker', () => {
  for (const outputNamingMode of ['neutral', 'source-with-suffix']) {
    const child = fakeChild();
    const f = fixture('intake', child);
    assert.strictEqual(f.start({ env: { DATASECURE_PRODUCT_CHANNEL: 'standalone' }, outputNamingMode }).ok, true);
    assert.strictEqual(child.messages[0].output_naming_mode, outputNamingMode);
    assert.strictEqual(child.messages[0].processing_mode, undefined);
  }
});

for (const role of ['batch', 'intake', 'review']) {
  test(`${role}: the native parent presenter receives only its own private batch binding`, () => {
    const child = fakeChild();
    const f = fixture(role, child);
    assert.strictEqual(f.start().ok, true);
    const batchToken = child.messages[0].batch_token;
    child.callbacks[0](null);
    child.emit('message', { type: `local-${role}-accepted` });
    child.emit('message', {
      type: `local-${role}-state`, complete: true, batch_phase: 'complete', batch_total: 1, released: 1, stopped: 0,
      result_grade_counts: { complete: 1, usable_with_omissions: 0, not_processed: 0, unavailable: 0 },
      result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
      result_grades_verified: true, result_exported_count: 1, result_export_pending_count: 0, result_output_available: true
    });
    assert.strictEqual(f.noticeOptions.length, 1);
    assert.strictEqual(f.noticeOptions[0].batchToken, batchToken);
    assert.strictEqual(Object.keys(f.noticeOptions[0]).join(','), 'batchToken');
    assert.doesNotMatch(JSON.stringify(f.notices), /batchToken|batch_token|[a-f0-9]{64}/u);
    assert.doesNotMatch(JSON.stringify(f.records), /batchToken|batch_token|[a-f0-9]{64}/u);
    child.exit(0);
    f.drain();
  });
}

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
    'phase', 'released_count', 'stopped_count', 'run_id']);
  // DS-071: every event carries a short random run id (one per start).
  for (const event of f.records) assert.match(String(event.run_id), /^[a-f0-9]{8}$/u, 'the run id is a short random nonce');
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
  // The ENOENT subprocess is a probe, not an unfinalized empty test suite.
  const { test, testAsync, done } = createSuite('Batch executor startup boundary');
  initialCases(test);
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
  // Review rc90: a continuation whose completion window could not be shown left
  // no trace at all, unlike the intake path. The presentation failure must be
  // recorded content-free so a missing dialog after a resume is diagnosable.
  test('batch: a failing completion window is recorded as completion_notice_failed', () => {
    const child = fakeChild();
    const f = fixture('batch', child);
    const options = {
      claimTerminalNotice: () => true,
      showBatchStateNotice: () => { throw new Error('C:\\Users\\someone\\WindowsPowerShell missing'); }
    };
    const started = f.api.startLocalBatchExecutor(TOKEN, options);
    assert.strictEqual(started.ok, true);
    child.callbacks[0](null);
    child.emit('message', {
      type: 'local-batch-state', complete: true, batch_phase: 'complete', batch_total: 1, released: 1, stopped: 0,
      result_grade_counts: { complete: 1, usable_with_omissions: 0, not_processed: 0, unavailable: 0 },
      result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
      result_grades_verified: true
    });
    const events = f.records.map(record => record.event);
    assert.ok(events.includes('completion_notice_started'), 'the attempt is recorded');
    assert.ok(events.includes('completion_notice_failed'), 'the failed presentation is recorded');
    assert.ok(!events.includes('completion_notice_dispatched'));
    const failed = f.records.find(record => record.event === 'completion_notice_failed');
    assert.strictEqual(failed.error_code, 'LOCAL_NOTICE_FAILED');
    // DS-071: one start, one run id on every event, and the worker receives it.
    const runIds = new Set(f.records.map(record => record.run_id));
    assert.strictEqual(runIds.size, 1, 'every event of one run carries the same run id');
    assert.match([...runIds][0], /^[a-f0-9]{8}$/u);
    assert.doesNotMatch(JSON.stringify(f.records), /Users|PowerShell|[a-f0-9]{64}/u, 'the trace stays content-free');
    child.exit(0);
    f.drain();
    assert.strictEqual(f.records.filter(record => record.event === 'completion_notice_started').length, 1, 'exit finalization does not retry the window');
  });

  test('batch: the exit fallback notice records its presentation outcome as well', () => {
    const child = fakeChild();
    const f = fixture('batch', child);
    const options = { claimTerminalNotice: () => true, showLocalIntakeNotice: () => { throw new Error('boom'); } };
    assert.strictEqual(f.api.startLocalBatchExecutor(TOKEN, options).ok, true);
    child.callbacks[0](null);
    // Without a readable journal the exit fallback presents the generic notice.
    f.loseJournal();
    child.exit(0);
    f.drain();
    const events = f.records.map(record => record.event);
    assert.ok(events.includes('completion_notice_started') && events.includes('completion_notice_failed'),
      `fallback presentation outcome recorded, got ${JSON.stringify(events)}`);
  });

  test('batch: Standalone delegates terminal state to its own window without a Cowork dialog', () => {
    const child = fakeChild();
    const f = fixture('batch', child);
    let shown = 0;
    const options = {
      env: { ...process.env, DATASECURE_PRODUCT_CHANNEL: 'standalone' },
      showBatchStateNotice: () => { shown++; return true; }
    };
    assert.strictEqual(f.api.startLocalBatchExecutor(TOKEN, options).ok, true);
    child.callbacks[0](null);
    child.emit('message', {
      type: 'local-batch-state', complete: true, batch_phase: 'complete', batch_total: 1, released: 1, stopped: 0,
      result_grade_counts: { complete: 1, usable_with_omissions: 0, not_processed: 0, unavailable: 0 },
      result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
      result_grades_verified: true
    });
    assert.strictEqual(shown, 0);
    assert.strictEqual(child.messages.filter(message => message?.type === 'local-terminal-notice-claimed').length, 0,
      'sidecar receipt is not renderer visibility');
    assert.ok(f.records.some(event => event.event === 'completion_notice_delegated_to_product_ui'));
    const generation = f.api.pendingStandaloneTerminalNoticeGeneration();
    assert.ok(Number.isSafeInteger(generation) && generation > 0);
    assert.strictEqual(f.api.pendingStandaloneTerminalNoticeGeneration(TOKEN), generation);
    assert.strictEqual(f.api.pendingStandaloneTerminalNoticeGeneration('b'.repeat(64)), null,
      'a different observed history run cannot advertise this terminal notice');
    assert.strictEqual(f.api.acknowledgeStandaloneTerminalNotice(generation, 'b'.repeat(64)), false,
      'even the correct generation cannot acknowledge another run');
    assert.strictEqual(child.messages.filter(message => message?.type === 'local-terminal-notice-claimed').length, 0);
    assert.strictEqual(f.api.acknowledgeStandaloneTerminalNotice(generation - 1), false,
      'a delayed acknowledgement cannot claim the current notice');
    assert.strictEqual(f.api.acknowledgeStandaloneTerminalNotice(generation), true);
    assert.strictEqual(child.messages.filter(message => message?.type === 'local-terminal-notice-claimed').length, 1);
    assert.ok(f.records.some(event => event.event === 'completion_notice_rendered_by_product_ui'));
    assert.strictEqual(f.api.acknowledgeStandaloneTerminalNotice(generation), false, 'render ACK is single use');
    child.exit(0);
    f.drain();
  });

  await testAsync('batch: asynchronous parent presenter failure releases reservation and never acknowledges worker', async () => {
    const child = fakeChild();
    const f = fixture('batch', child);
    const calls = [];
    const options = {
      reserveTerminalNotice: () => ({ ok: true, state: 'reserved', reservation_id: 'f'.repeat(32) }),
      markTerminalNoticePresented: () => { calls.push('marked'); return true; },
      releaseTerminalNoticeReservation: () => { calls.push('released'); return true; },
      showBatchStateNotice: async () => { throw privateError(); }
    };
    assert.strictEqual(f.api.startLocalBatchExecutor(TOKEN, options).ok, true);
    child.callbacks[0](null);
    child.emit('message', {
      type: 'local-batch-state', complete: true, batch_phase: 'complete', batch_total: 1, released: 1, stopped: 0,
      result_grade_counts: { complete: 1, usable_with_omissions: 0, not_processed: 0, unavailable: 0 },
      result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 }, result_grades_verified: true
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepStrictEqual(calls, ['released']);
    assert.strictEqual(child.messages.filter(message => message?.type === 'local-terminal-notice-claimed').length, 0);
    assert.ok(f.records.some(event => event.error_code === 'LOCAL_NOTICE_FAILED'));
    assert.doesNotMatch(JSON.stringify(f.records), /PRIVATE|customer-secret|[a-f0-9]{64}/u);
    child.exit(0);
    f.drain();
  });

  await testAsync('batch: parent acknowledges only after visible confirmation and durable presented transition', async () => {
    const child = fakeChild();
    const f = fixture('batch', child);
    const order = [];
    let confirmSpawn;
    const options = {
      reserveTerminalNotice: () => ({ ok: true, state: 'reserved', reservation_id: '9'.repeat(32) }),
      markTerminalNoticePresented: () => { order.push('presented'); return true; },
      releaseTerminalNoticeReservation: () => { order.push('released'); return true; },
      showBatchStateNotice: () => new Promise(resolve => { order.push('spawn-started'); confirmSpawn = () => { order.push('spawn-confirmed'); resolve(true); }; })
    };
    assert.strictEqual(f.api.startLocalBatchExecutor(TOKEN, options).ok, true);
    child.callbacks[0](null);
    child.emit('message', {
      type: 'local-batch-state', complete: true, batch_phase: 'complete', batch_total: 1, released: 1, stopped: 0,
      result_grade_counts: { complete: 1, usable_with_omissions: 0, not_processed: 0, unavailable: 0 },
      result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 }, result_grades_verified: true
    });
    assert.deepStrictEqual(order, ['spawn-started']);
    assert.strictEqual(child.messages.filter(message => message?.type === 'local-terminal-notice-claimed').length, 0);
    confirmSpawn();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepStrictEqual(order, ['spawn-started', 'spawn-confirmed', 'presented']);
    assert.strictEqual(child.messages.filter(message => message?.type === 'local-terminal-notice-claimed').length, 1);
    child.exit(0);
    f.drain();
  });

  for (const role of ['batch', 'intake']) {
    test(`${role}: a deliberate automatic-review pause suppresses the parent's exit fallback notice`, () => {
      const child = fakeChild();
      const f = fixture(role, child);
      const started = role === 'batch' ? f.api.startLocalBatchExecutor(TOKEN, {}) : f.start({});
      assert.strictEqual(started.ok, true);
      child.callbacks[0](null);
      child.emit('message', { type: 'local-review-paused' });
      child.exit(0);
      f.drain();
      assert.strictEqual(f.notices.length, 0, 'the user already chose Later/close in the local review');
      assert.ok(!f.records.some(event => event.event === 'completion_notice_started'));
    });

    test(`${role}: the parent claims the terminal notice durably and acknowledges the worker before presenting`, () => {
      const child = fakeChild();
      const f = fixture(role, child);
      const claims = [];
      const options = { claimTerminalNotice: (token, presenter) => { claims.push({ token, presenter }); return true; } };
      const started = role === 'batch' ? f.api.startLocalBatchExecutor(TOKEN, options) : f.start(options);
      assert.strictEqual(started.ok, true);
      child.callbacks[0](null);
      child.emit('message', {
        type: role === 'intake' ? 'local-intake-state' : 'local-batch-state',
        complete: true, batch_phase: 'complete', batch_total: 1, released: 1, stopped: 0,
        result_grade_counts: { complete: 1, usable_with_omissions: 0, not_processed: 0, unavailable: 0 },
        result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
        result_grades_verified: true
      });
      assert.strictEqual(claims.length, 1);
      assert.strictEqual(claims[0].presenter, 'parent');
      assert.match(claims[0].token, /^[a-f0-9]{64}$/u, 'the claim addresses the batch journal by its opaque token');
      if (role === 'batch') assert.strictEqual(claims[0].token, TOKEN);
      assert.strictEqual(f.notices.length, 1);
      const acknowledgements = child.messages.filter(message => message?.type === 'local-terminal-notice-claimed');
      assert.strictEqual(acknowledgements.length, 1, 'exactly one acknowledgement releases the waiting worker');
      assert.doesNotMatch(JSON.stringify(acknowledgements), /[a-f0-9]{64}/u, 'the acknowledgement carries no token');
      child.exit(0);
      f.drain();
      assert.strictEqual(f.notices.length, 1, 'exit finalization never repeats a presented notice');
      assert.strictEqual(claims.length, 1);
    });

    test(`${role}: a notice already claimed by the worker is never presented a second time by the parent`, () => {
      const child = fakeChild();
      const f = fixture(role, child);
      const options = { claimTerminalNotice: () => false };
      const started = role === 'batch' ? f.api.startLocalBatchExecutor(TOKEN, options) : f.start(options);
      assert.strictEqual(started.ok, true);
      child.callbacks[0](null);
      child.emit('message', {
        type: role === 'intake' ? 'local-intake-state' : 'local-batch-state',
        complete: true, batch_phase: 'complete', batch_total: 1, released: 1, stopped: 0,
        result_grade_counts: { complete: 1, usable_with_omissions: 0, not_processed: 0, unavailable: 0 },
        result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
        result_grades_verified: true
      });
      child.exit(0);
      f.drain();
      assert.strictEqual(f.notices.length, 0, 'the worker already presented this batch');
      assert.strictEqual(child.messages.filter(message => message?.type === 'local-terminal-notice-claimed').length, 0);
      if (role === 'intake') {
        assert.ok(f.records.some(event => event.event === 'intake_terminal_state'), 'the parent still records the observed terminal state');
      }
      assert.doesNotMatch(JSON.stringify(f.records), /PRIVATE|customer-secret|[a-f0-9]{64}/);
    });

    test(`${role}: a throwing acknowledgement channel never blocks the parent presentation`, () => {
      const child = fakeChild();
      const f = fixture(role, child);
      const started = role === 'batch' ? f.api.startLocalBatchExecutor(TOKEN, {}) : f.start({});
      assert.strictEqual(started.ok, true);
      child.callbacks[0](null);
      // The worker may already be gone when the parent acknowledges; Node then
      // throws from send(). The private error text must neither escape nor
      // suppress the single local presentation.
      child.send = () => { throw privateError(); };
      assert.doesNotThrow(() => child.emit('message', {
        type: role === 'intake' ? 'local-intake-state' : 'local-batch-state',
        complete: true, batch_phase: 'complete', batch_total: 1, released: 1, stopped: 0,
        result_grade_counts: { complete: 1, usable_with_omissions: 0, not_processed: 0, unavailable: 0 },
        result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
        result_grades_verified: true
      }));
      assert.strictEqual(f.notices.length, 1, 'the parent presents once despite a dead acknowledgement channel');
      child.exit(0);
      f.drain();
      assert.strictEqual(f.notices.length, 1);
      assert.doesNotMatch(JSON.stringify(f.records), /PRIVATE|customer-secret|[a-f0-9]{64}/);
    });
  }

  for (const role of ['batch', 'review']) {
    const acceptedType = role === 'batch' ? 'local-batch-accepted' : 'local-review-accepted';
    await testAsync(`${role}: a flushed send callback alone cannot confirm worker receipt`, async () => {
      const child = fakeChild();
      const f = fixture(role, child);
      const started = f.start({ requireIpcAcknowledgement: true, ipcAckTimeoutMs: 10 });
      child.callbacks[0](null);
      let settled = false;
      started.ipcAcknowledgement.finally(() => { settled = true; }).catch(() => {});
      await new Promise(resolve => setImmediate(resolve));
      assert.strictEqual(settled, false);
      f.drain();
      await assert.rejects(started.ipcAcknowledgement, { code: 'LOCAL_IPC_ACK_TIMEOUT' });
      assert.strictEqual(child.kills, 1);
      assert.ok(f.records.some(event => event.error_code === 'LOCAL_IPC_ACK_TIMEOUT'));
      assertRetainedWhileAlive(f, child, role);
      child.exit(1);
      f.drain();
    });

    await testAsync(`${role}: only the exact content-free worker acceptance confirms the start`, async () => {
      const child = fakeChild();
      const f = fixture(role, child);
      const started = f.start({ requireIpcAcknowledgement: true, ipcAckTimeoutMs: 10 });
      child.callbacks[0](null);
      child.emit('message', { type: acceptedType, private: PRIVATE_DETAIL });
      let settled = false;
      started.ipcAcknowledgement.then(() => { settled = true; });
      await new Promise(resolve => setImmediate(resolve));
      assert.strictEqual(settled, false, 'an acceptance with additional fields is ignored');
      child.emit('message', { type: acceptedType });
      await started.ipcAcknowledgement;
      f.drain();
      assert.strictEqual(child.kills, 0);
      assert.ok(f.active());
      assert.doesNotMatch(JSON.stringify(f.records), /PRIVATE|customer-secret|[a-f0-9]{64}/u);
      child.exit(0);
      f.drain();
    });

    await testAsync(`${role}: worker exit before acceptance rejects immediately and releases only after exit`, async () => {
      const child = fakeChild();
      const f = fixture(role, child);
      const started = f.start({ requireIpcAcknowledgement: true, ipcAckTimeoutMs: 30000 });
      child.callbacks[0](null);
      child.exit(1);
      await assert.rejects(started.ipcAcknowledgement, { code: role === 'review' ? 'LOCAL_REVIEW_WORKER_EXITED' : 'LOCAL_WORKER_EXITED' });
      f.drain();
      assert.strictEqual(f.active(), false);
      assert.ok(f.releases.every(release => !release.alive));
    });
  }

  await testAsync('intake: missing IPC acknowledgement times out and late callbacks cannot revive the handoff', async () => {
    const child = fakeChild();
    const f = fixture('intake', child);
    const started = f.start({ ipcAckTimeoutMs: 10 });
    assert.strictEqual(started.ok, true);
    f.drain();
    await assert.rejects(started.ipcAcknowledgement, { code: 'LOCAL_IPC_ACK_TIMEOUT' });
    assert.strictEqual(child.kills, 1, 'the owned worker is stopped after the bounded acknowledgement timeout');
    assert.doesNotThrow(() => child.callbacks[0](null), 'a late callback is inert');
    assert.strictEqual(child.unrefs, 0, 'a late callback cannot detach a timed-out worker');
    assert.ok(f.records.some(event => event.error_code === 'LOCAL_IPC_ACK_TIMEOUT'));
    assertRetainedWhileAlive(f, child, 'intake');
    assertEndedAndRetry(f, child, 'intake');
  });
  await testAsync('intake: a flushed send callback alone never confirms the handoff', async () => {
    const child = fakeChild();
    const f = fixture('intake', child);
    const started = f.start({ ipcAckTimeoutMs: 10 });
    child.callbacks[0](null); // the message left the parent process
    let settled = null;
    started.ipcAcknowledgement.then(() => { settled = 'resolved'; }, () => { settled = 'rejected'; });
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(settled, null, 'Node\'s send callback is not a worker acknowledgement');
    assert.strictEqual(child.unrefs, 1, 'dispatch still detaches the owned worker');
    f.drain(); // the bounded acknowledgement timer fires
    await assert.rejects(started.ipcAcknowledgement, { code: 'LOCAL_IPC_ACK_TIMEOUT' });
    assert.strictEqual(child.kills, 1, 'a worker that never acknowledges is stopped');
    assert.ok(f.records.some(event => event.error_code === 'LOCAL_IPC_ACK_TIMEOUT'));
    assertRetainedWhileAlive(f, child, 'intake');
    assertEndedAndRetry(f, child, 'intake');
  });
  await testAsync('intake: the worker acceptance envelope confirms the handoff and later timers or duplicates are inert', async () => {
    const child = fakeChild();
    const f = fixture('intake', child);
    const started = f.start({ ipcAckTimeoutMs: 10 });
    child.callbacks[0](null);
    child.emit('message', { type: 'local-intake-accepted' });
    await started.ipcAcknowledgement;
    f.drain();
    assert.strictEqual(child.kills, 0, 'an acknowledged worker is never stopped by the bounded timer');
    assert.strictEqual(f.active(), true, 'the acknowledged intake keeps its pending slot');
    assert.doesNotThrow(() => child.emit('message', { type: 'local-intake-accepted' }), 'a duplicate acceptance is inert');
    assert.doesNotThrow(() => child.emit('message', { type: 'local-intake-accepted', batch_token: TOKEN }), 'unexpected fields are ignored');
    assert.ok(!f.records.some(event => event.error_code === 'LOCAL_IPC_ACK_TIMEOUT'));
    assert.ok(!f.records.some(event => event.outcome === 'stopped'), 'an acknowledged handoff records no failure');
    assert.doesNotMatch(JSON.stringify(f.records), /PRIVATE|customer-secret|batch_token|[a-f0-9]{64}/);
    child.exit(0);
    f.drain();
    assert.strictEqual(f.active(), false);
  });
  await testAsync('intake: an acceptance envelope with extra fields never confirms the handoff', async () => {
    const child = fakeChild();
    const f = fixture('intake', child);
    const started = f.start({ ipcAckTimeoutMs: 10 });
    child.callbacks[0](null);
    child.emit('message', { type: 'local-intake-accepted', batch_token: TOKEN });
    let settled = false;
    started.ipcAcknowledgement.finally(() => { settled = true; }).catch(() => {});
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(settled, false, 'only the exact one-field worker envelope is accepted');
    child.emit('message', { type: 'local-intake-accepted' });
    await started.ipcAcknowledgement;
    assert.strictEqual(child.kills, 0);
    child.exit(0);
    f.drain();
  });
  await testAsync('intake: a worker that exits before acknowledging rejects the handoff immediately', async () => {
    const child = fakeChild();
    const f = fixture('intake', child);
    const started = f.start({ ipcAckTimeoutMs: 30000 });
    child.callbacks[0](null);
    child.exit(1);
    await assert.rejects(started.ipcAcknowledgement, { code: 'LOCAL_WORKER_EXITED' });
    f.drain();
    assert.strictEqual(f.active(), false, 'a confirmed exit clears the pending intake');
    assert.strictEqual(child.kills, 0, 'an exited worker is not signalled');
    assert.doesNotThrow(() => child.emit('message', { type: 'local-intake-accepted' }), 'a late acceptance cannot revive the handoff');
    assertBoundedDiagnostics(f);
  });
  await testAsync('intake: cancellation while waiting for IPC fails the acknowledgement without a second start', async () => {
    const child = fakeChild();
    const f = fixture('intake', child);
    const controller = new AbortController();
    const started = f.start({ ipcAckTimeoutMs: 30000, signal: controller.signal });
    controller.abort();
    await assert.rejects(started.ipcAcknowledgement, { code: 'LOCAL_IPC_ACK_CANCELLED' });
    assert.strictEqual(child.kills, 1);
    assert.ok(f.records.some(event => event.error_code === 'LOCAL_IPC_ACK_CANCELLED'));
    assert.doesNotThrow(() => child.callbacks[0](null));
    child.exit(1);
    f.drain();
    assert.strictEqual(f.active(), false);
  });
  for (const role of roles) {
    for (const preAborted of [false, true]) await testAsync(`${role}: ${preAborted ? 'pre-abort' : 'abort'} has a typed ACK cause and retains ownership until exit`, async () => {
      const child = fakeChild();
      const f = fixture(role, child);
      const controller = new AbortController();
      if (preAborted) controller.abort();
      let started;
      if (preAborted) {
        // Existing start refusal stays synchronous; the typed failure is still
        // recorded, and no live worker's lease is released by an abort signal.
        assert.throws(() => f.start({ requireIpcAcknowledgement: true, signal: controller.signal }), SafeError);
      } else {
        started = f.start({ requireIpcAcknowledgement: true, signal: controller.signal });
        controller.abort();
        await assert.rejects(started.ipcAcknowledgement, { code: 'LOCAL_IPC_ACK_CANCELLED' });
      }
      assert.strictEqual(child.kills, 1);
      assert.ok(f.records.some(event => event.error_code === 'LOCAL_IPC_ACK_CANCELLED'));
      assertRetainedWhileAlive(f, child, role);
      child.exit(1);
      f.drain();
      assert.strictEqual(f.active(), false);
      assert.ok(f.releases.every(release => !release.alive));
    });

    for (const channel of ['callback', 'error-event']) await testAsync(`${role}: a native ${channel} error cannot masquerade as an ACK timeout or cancel`, async () => {
      const child = fakeChild();
      const f = fixture(role, child);
      const started = f.start({ requireIpcAcknowledgement: true });
      const native = Object.assign(new Error(`timeout cancel ${PRIVATE_DETAIL}`), { code: 'EPERM' });
      if (channel === 'callback') child.callbacks[0](native); else child.emit('error', native);
      await assert.rejects(started.ipcAcknowledgement, error => {
        assert.strictEqual(error.code, 'LOCAL_IPC_FAILED');
        assert.doesNotMatch(error.message, /PRIVATE|timeout|cancel|customer/u);
        return true;
      });
      assertRetainedWhileAlive(f, child, role);
      f.drain();
      assert.ok(!f.records.some(event => event.error_code === 'LOCAL_IPC_ACK_TIMEOUT'));
      child.emit('message', { type: role === 'intake' ? 'local-intake-accepted' : role === 'review' ? 'local-review-accepted' : 'local-batch-accepted' });
      await assert.rejects(started.ipcAcknowledgement, { code: 'LOCAL_IPC_FAILED' });
      assert.strictEqual(child.kills, 1);
      child.exit(1);
      f.drain();
      assert.strictEqual(f.active(), false);
      assertBoundedDiagnostics(f);
    });
  }
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
  for (const [nativeCode, expected] of [['ENOENT', 'LOCAL_REVIEW_START_MISSING'],
    ['EACCES', 'LOCAL_REVIEW_START_DENIED'], ['EPERM', 'LOCAL_REVIEW_START_DENIED'],
    ['ENOEXEC', 'LOCAL_REVIEW_START_ARCHITECTURE'], ['EFTYPE', 'LOCAL_REVIEW_START_ARCHITECTURE']]) {
    test(`Standalone review binds a synchronous ${nativeCode} launch failure before any draft`, () => {
      const broker = createReviewBroker();
      const f = fixture('review', Object.assign(privateError(), { code: nativeCode }));
      assert.throws(() => f.start({ appReview: broker }), (error) => error instanceof SafeError && error.code === expected);
      assert.deepStrictEqual(broker.session(), { ready: false, batch_id: TOKEN,
        phase: 'failed', worker_active: false, error_code: expected });
      assert.strictEqual(broker.boundBatchId(), TOKEN);
      assert.doesNotMatch(JSON.stringify(broker.session()), /PRIVATE|customer|C:\\/u);
      assert.strictEqual(f.claims.length, 0);
      f.drain();
    });
  }
  await testAsync('Standalone review retains its lease until exit after asynchronous denied launch', async () => {
    const broker = createReviewBroker();
    const child = fakeChild();
    const f = fixture('review', child);
    const started = f.start({ appReview: broker, requireIpcAcknowledgement: true });
    child.emit('error', Object.assign(privateError(), { code: 'EPERM' }));
    await assert.rejects(started.ipcAcknowledgement, { code: 'LOCAL_REVIEW_START_DENIED' });
    assert.strictEqual(broker.session().worker_active, true);
    assert.strictEqual(broker.session().error_code, 'LOCAL_REVIEW_START_DENIED');
    assertRetainedWhileAlive(f, child, 'review');
    child.exit(1);
    f.drain();
    assert.strictEqual(broker.session().worker_active, false);
    assert.strictEqual(broker.session().error_code, 'LOCAL_REVIEW_START_DENIED');
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
    const broker = role === 'review' ? createReviewBroker() : undefined;
    assertSafeStartFailure(() => f.start(broker ? { appReview: broker } : {}));
    await closed;
    assert.strictEqual(exited, false, 'failed spawn emits error/close, not exit');
    f.drain();
    assert.strictEqual(f.active(), false);
    assert.strictEqual(f.claims.length, 0);
    assert.strictEqual(f.releases.length, 0);
    assertBoundedDiagnostics(f);
    if (broker) assert.deepStrictEqual(broker.session(), { ready: false, batch_id: TOKEN,
      phase: 'failed', worker_active: false, error_code: 'LOCAL_REVIEW_START_MISSING' });
  }
  console.log('ENOENT probe: batch, intake, review passed');
}

(process.argv.includes('--enoent-probe') ? realNoPidProbe() : main())
  .catch(error => { console.error(error); process.exitCode = 1; });
