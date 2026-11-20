'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');
const { createSuite } = require('./helpers');
const { firstFailure, within, ownChild, endTestCliFailure } = require('./helpers/qa-parent-lifecycle.cjs');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-intake-reservation-'));
process.env.LOCALAPPDATA = path.join(base, 'localapp');
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
process.env.EU_PRIVACY_DATA_ROOT = path.join(base, 'product-data');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(base, 'results');

const { batchRoot } = require('../plugins/data-secure/server/gateway/batch-private-store');
const { createBatchIntakeReservation } = require('../plugins/data-secure/server/gateway/batch-intake-reservation');
const suite = createSuite('Batch intake reservation');
const { test, testAsync, assert, done } = suite;
const primary = firstFailure(), children = [];
let childLifetimeUnknown = false;

const idA = 'a'.repeat(64);
const idB = 'b'.repeat(64);

function processApi(pid, alive = new Set()) {
  return {
    pid,
    kill(candidate) {
      if (alive.has(candidate)) return;
      const error = new Error('dead');
      error.code = 'ESRCH';
      throw error;
    }
  };
}

function resetReservationFiles() {
  for (const name of ['intake-reservation.json', 'intake-reservation-delegate.json']) {
    try { fs.unlinkSync(path.join(batchRoot(), name)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function childResult(child) {
  const record = children.find(value => value.child === child);
  assert.ok(record, 'INTAKE_CHILD_NOT_OWNED');
  return within(record.response, 10000, 'INTAKE_MESSAGE_TIMEOUT');
}
function launchReservation(helper, options) {
  const child = fork(helper, [], options);
  let settled = false, resolveResponse, rejectResponse;
  const response = new Promise((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject; });
  response.catch(() => {}); // Keep the rejecting response available even before its caller awaits it.
  const fail = error => { primary.record(error); if (!settled) { settled = true; rejectResponse(error); } };
  const owned = ownChild(child, fail);
  const record = { child, owned, response, held: false, holdingRequest: false, finished: null, release: null };
  children.push(record);
  const started = Promise.race([
    new Promise(resolve => child.once('spawn', resolve)),
    owned.error.then(error => { throw error; }),
    owned.done.then(() => { owned.failure.throwIfFailed(); throw Error('INTAKE_CLOSED_BEFORE_SPAWN'); })
  ]);
  started.catch(() => {});
  child.once('message', value => {
    if (settled) return;
    settled = true; record.held = record.holdingRequest && value?.type === 'acquired';
    resolveResponse(value);
  });
  child.once('close', () => {
    if (!settled) fail(owned.failure.failed ? owned.failure.value : Error('INTAKE_CLOSED_BEFORE_MESSAGE'));
  });
  record.send = async value => {
    try {
      await within(started, 5000, 'INTAKE_STARTUP_TIMEOUT');
      owned.failure.throwIfFailed();
      assert.ok(!owned.closed && child.connected, 'INTAKE_IPC_CLOSED');
      if (value.type === 'acquire') record.holdingRequest = value.hold === true;
      await within(new Promise((resolve, reject) => {
        try { child.send(value, error => { if (error) { fail(error); reject(error); } else resolve(); }); }
        catch (error) { fail(error); reject(error); }
      }), 5000, 'INTAKE_SEND_TIMEOUT');
    } catch (error) { fail(error); throw error; }
  };
  record.waitClosed = async () => {
    const result = await within(owned.done, 10000, 'INTAKE_CLOSE_TIMEOUT');
    owned.failure.throwIfFailed();
    assert.strictEqual(result.code, 0); assert.strictEqual(result.signal, null);
    return result;
  };
  record.release = () => {
    if (!record.releasing) record.releasing = record.send({ type: 'release' });
    return record.releasing;
  };
  record.finish = () => {
    if (!record.finished) record.finished = (async () => {
      if (record.held && !owned.closed) {
        try { await record.release(); } catch (error) { primary.record(error); }
      }
      try { await within(owned.done, 5000, 'INTAKE_FINISH_CLOSE_TIMEOUT'); }
      catch (error) { primary.record(error); }
      try { if (!owned.closed) owned.terminate(); }
      catch (error) { primary.record(error); }
      try { await within(owned.done, 5000, 'INTAKE_FINISH_KILL_TIMEOUT'); }
      catch (error) { primary.record(error); }
      if (owned.failure.failed) primary.record(owned.failure.value);
      if (!owned.closed) childLifetimeUnknown = true;
    })();
    return record.finished;
  };
  return record;
}
async function finishReservations(records) {
  for (const record of records) {
    try { await record.finish(); } catch (error) { primary.record(error); childLifetimeUnknown = true; }
  }
}
function rememberSuiteFailure() {
  const state = suite.failure();
  if (state.failed) primary.record(state.error);
}
async function reservationCase(action) {
  const start = children.length;
  try { await action(); }
  catch (error) { primary.record(error); }
  finally { await finishReservations(children.slice(start)); }
  primary.throwIfFailed();
}


test('one process owns the reservation and explicit release opens the next intake', () => {
  const reservation = createBatchIntakeReservation({ process: processApi(101, new Set([101])), randomId: () => idA });
  assert.deepStrictEqual(reservation.reserveIntake(), { reservation_id: idA });
  assert.strictEqual(reservation.intakeReservationActive(), true);
  const contender = createBatchIntakeReservation({ process: processApi(202, new Set([101, 202])), randomId: () => idB });
  assert.throws(() => contender.reserveIntake(), /bereits aktiv/i);
  assert.strictEqual(reservation.releaseIntake(idA), true);
  assert.deepStrictEqual(contender.reserveIntake(), { reservation_id: idB });
  assert.strictEqual(contender.releaseIntake(idB), true);
});
test('only conclusively dead owner and delegate are recovered; unknown records remain fail-closed', () => {
  const owner = createBatchIntakeReservation({ process: processApi(301, new Set([301, 302])), randomId: () => idA });
  owner.reserveIntake();
  owner.delegateIntake(idA, 302);
  const whileWorkerLives = createBatchIntakeReservation({ process: processApi(303, new Set([302, 303])), randomId: () => idB });
  assert.throws(() => whileWorkerLives.reserveIntake(), /bereits aktiv/i);
  const afterBothDied = createBatchIntakeReservation({ process: processApi(303, new Set([303])), randomId: () => idB });
  assert.deepStrictEqual(afterBothDied.reserveIntake(), { reservation_id: idB });
  assert.strictEqual(afterBothDied.releaseIntake(idB), true);

  fs.writeFileSync(path.join(batchRoot(), 'intake-reservation.json'), '{"schema":"unknown"}\n', 'utf8');
  assert.strictEqual(afterBothDied.intakeReservationActive(), true);
  assert.throws(() => afterBothDied.reserveIntake(), /bereits aktiv/i);
  resetReservationFiles();
});

test('delegated worker can release exactly its own reservation at durable checkpoint', () => {
  const owner = createBatchIntakeReservation({ process: processApi(401, new Set([401, 402])), randomId: () => idA });
  owner.reserveIntake();
  owner.delegateIntake(idA, 402);
  const stranger = createBatchIntakeReservation({ process: processApi(403, new Set([401, 402, 403])) });
  assert.strictEqual(stranger.releaseIntake(idA), false);
  const worker = createBatchIntakeReservation({ process: processApi(402, new Set([401, 402])) });
  assert.strictEqual(worker.releaseIntake(idA), true);
  assert.strictEqual(fs.existsSync(owner.reservationPath()), false);
  assert.strictEqual(fs.existsSync(owner.delegatePath()), false);
});

async function main() {
  try {
    rememberSuiteFailure();
    if (!primary.failed && !childLifetimeUnknown) await testAsync('two real processes sharing one privacy root admit exactly one intake', () => reservationCase(async () => {
      const helper = path.join(__dirname, 'lib', 'intake-reservation-worker.js');
      const options = { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, NODE_OPTIONS: '' } };
      const first = launchReservation(helper, options);
      const second = launchReservation(helper, options);
      const firstResult = childResult(first.child), secondResult = childResult(second.child);
      // Attach both result consumers before either send/startup can fail.
      const resultsReady = Promise.all([firstResult, secondResult]); resultsReady.catch(() => {});
      await Promise.all([first.send({ type: 'acquire', hold: true }), second.send({ type: 'acquire', hold: true })]);
      const results = await resultsReady;
      assert.strictEqual(results.filter(entry => entry.type === 'acquired').length, 1);
      assert.strictEqual(results.filter(entry => entry.type === 'blocked').length, 1);
      const winner = results[0].type === 'acquired' ? first : second;
      const loser = winner === first ? second : first;
      await winner.release();
      await Promise.all([winner.waitClosed(), loser.waitClosed()]);
      assert.strictEqual(fs.existsSync(path.join(batchRoot(), 'intake-reservation.json')), false);
    }));
    rememberSuiteFailure();
    if (!primary.failed && !childLifetimeUnknown) await testAsync('a crashed owner is recovered by the next real process without manual cleanup', () => reservationCase(async () => {
      const helper = path.join(__dirname, 'lib', 'intake-reservation-worker.js');
      const options = { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, NODE_OPTIONS: '' } };
      const crashed = launchReservation(helper, options);
      const acquired = childResult(crashed.child); acquired.catch(() => {});
      await crashed.send({ type: 'acquire', abandon: true });
      assert.strictEqual((await acquired).type, 'acquired');
      await crashed.waitClosed();
      const recovery = launchReservation(helper, options);
      const recovered = childResult(recovery.child); recovered.catch(() => {});
      await recovery.send({ type: 'acquire' });
      assert.strictEqual((await recovered).type, 'acquired');
      await recovery.waitClosed();
      assert.strictEqual(fs.existsSync(path.join(batchRoot(), 'intake-reservation.json')), false);
    }));
  } catch (error) { primary.record(error); }
  finally {
    rememberSuiteFailure();
    await finishReservations(children);
    try { process.stderr.write('INTAKE_SCOPE_RETAINED; writer_join=NOT_CLAIMED; deletion=NOT_ATTEMPTED\n'); }
    catch (error) { primary.record(error); }
    try { await done(() => { if (primary.failed && !suite.failure().failed) throw primary.value; }); }
    catch (error) { primary.record(error); }
    rememberSuiteFailure();
  }
  primary.throwIfFailed();
}

main().catch(error => endTestCliFailure({ failed: true, error, retainedRoots: [base],
  unconfirmedChildren: children.some(record => !record.owned.closed) }));
