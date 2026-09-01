'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-intake-reservation-'));
process.env.LOCALAPPDATA = path.join(base, 'localapp');
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');

const { batchRoot } = require('../plugins/data-secure/server/gateway/batch-private-store');
const { createBatchIntakeReservation } = require('../plugins/data-secure/server/gateway/batch-intake-reservation');
const { test, testAsync, assert, done } = createSuite('Batch intake reservation');

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
  return new Promise((resolve, reject) => {
    child.once('message', resolve);
    child.once('error', reject);
  });
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
  await testAsync('two real processes sharing one privacy root admit exactly one intake', async () => {
    const helper = path.join(__dirname, 'lib', 'intake-reservation-worker.js');
    const options = { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, NODE_OPTIONS: '' } };
    const first = fork(helper, [], options);
    const second = fork(helper, [], options);
    const firstResult = childResult(first);
    const secondResult = childResult(second);
    first.send({ type: 'acquire', hold: true });
    second.send({ type: 'acquire', hold: true });
    const results = await Promise.all([firstResult, secondResult]);
    assert.strictEqual(results.filter((entry) => entry.type === 'acquired').length, 1);
    assert.strictEqual(results.filter((entry) => entry.type === 'blocked').length, 1);
    const winner = results[0].type === 'acquired' ? first : second;
    const loser = winner === first ? second : first;
    winner.send({ type: 'release' });
    await Promise.all([
      new Promise((resolve) => winner.once('exit', resolve)),
      loser.exitCode === null ? new Promise((resolve) => loser.once('exit', resolve)) : Promise.resolve()
    ]);
    assert.strictEqual(fs.existsSync(path.join(batchRoot(), 'intake-reservation.json')), false);
  });

  await testAsync('a crashed owner is recovered by the next real process without manual cleanup', async () => {
    const helper = path.join(__dirname, 'lib', 'intake-reservation-worker.js');
    const options = { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, NODE_OPTIONS: '' } };
    const crashed = fork(helper, [], options);
    const acquired = childResult(crashed);
    crashed.send({ type: 'acquire', abandon: true });
    assert.strictEqual((await acquired).type, 'acquired');
    await new Promise((resolve) => crashed.once('exit', resolve));
    const recovery = fork(helper, [], options);
    const recovered = childResult(recovery);
    recovery.send({ type: 'acquire' });
    assert.strictEqual((await recovered).type, 'acquired');
    await new Promise((resolve) => recovery.once('exit', resolve));
    assert.strictEqual(fs.existsSync(path.join(batchRoot(), 'intake-reservation.json')), false);
  });

  resetReservationFiles();
  fs.rmSync(base, { recursive: true, force: true });
  done();
}

main().catch((error) => {
  resetReservationFiles();
  try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  console.error(error);
  process.exitCode = 1;
});
