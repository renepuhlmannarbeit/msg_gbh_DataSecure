'use strict';

const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchDiscard } = require('../plugins/data-secure/server/gateway/batch-discard');
const batchFacade = require('../plugins/data-secure/server/gateway/batch');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch discard boundary');
const maintenanceToken = 'f'.repeat(64);

function fixture(options = {}) {
  const events = [];
  const states = options.states || [];
  let scanCalls = 0;
  const discard = createBatchDiscard({
    SafeError,
    randomBytes(size) {
      assert.strictEqual(size, 32);
      events.push('random');
      return Buffer.from(maintenanceToken, 'hex');
    },
    acquireActiveLock(token) {
      events.push(`acquire:${token}`);
      if (options.failAcquire) throw new Error('ACQUIRE_FAILED');
    },
    releaseActiveLock(token) {
      events.push(`release:${token}`);
      if (options.failRelease) throw new Error('RELEASE_FAILED');
    },
    recoverableBatchStates(callOptions) {
      scanCalls++;
      events.push('scan');
      assert.deepStrictEqual(callOptions, { ignoreActiveLock: true, includeActiveExecutors: true });
      if (options.failScan) throw new Error('SCAN_FAILED');
      return states;
    },
    liveLocalExecutor(state) {
      events.push(`live:${state.token}`);
      return state.live === true;
    },
    safeRemoveWorkDirectory(token) {
      events.push(`work:${token}`);
      if (options.failWork === token) throw new Error('WORK_FAILED');
    },
    batchPath(token) {
      events.push(`path:${token}`);
      return `journal:${token}`;
    },
    io: {
      unlinkSync(value) {
        events.push(`unlink:${value}`);
        if (options.failUnlink === value) throw new Error('UNLINK_FAILED');
      }
    }
  }).discardIncompleteBatches;
  return { discard, events, scanCalls: () => scanCalls };
}

test('empty discard is an exact content-free success under one maintenance lock', () => {
  const value = fixture();
  assert.deepStrictEqual(value.discard(), {
    ok: true,
    discarded_batches: 0,
    raw_content_sent_to_claude: false
  });
  assert.deepStrictEqual(value.events, [
    'random', `acquire:${maintenanceToken}`, 'scan', `release:${maintenanceToken}`
  ]);
});

test('each sealed work directory is removed before its exact journal', () => {
  const value = fixture({ states: [{ token: 'a' }, { token: 'b' }] });
  assert.strictEqual(value.discard().discarded_batches, 2);
  assert.deepStrictEqual(value.events, [
    'random', `acquire:${maintenanceToken}`, 'scan', 'live:a', 'live:b',
    'work:a', 'path:a', 'unlink:journal:a',
    'work:b', 'path:b', 'unlink:journal:b',
    `release:${maintenanceToken}`
  ]);
});

test('one live local executor blocks every deletion', () => {
  const value = fixture({ states: [{ token: 'a' }, { token: 'b', live: true }] });
  assert.throws(() => value.discard(), /noch verarbeitet/);
  assert.strictEqual(value.events.some((event) => event.startsWith('work:')), false);
  assert.strictEqual(value.events.some((event) => event.startsWith('unlink:')), false);
  assert.strictEqual(value.events.at(-1), `release:${maintenanceToken}`);
});

test('lock acquisition failure performs no scan, deletion or release', () => {
  const value = fixture({ failAcquire: true, states: [{ token: 'a' }] });
  assert.throws(() => value.discard(), /ACQUIRE_FAILED/);
  assert.strictEqual(value.scanCalls(), 0);
  assert.deepStrictEqual(value.events, ['random', `acquire:${maintenanceToken}`]);
});

test('scan and work cleanup failures release the lock and preserve journals', () => {
  const scan = fixture({ failScan: true });
  assert.throws(() => scan.discard(), /SCAN_FAILED/);
  assert.strictEqual(scan.events.at(-1), `release:${maintenanceToken}`);

  const work = fixture({ states: [{ token: 'a' }], failWork: 'a' });
  assert.throws(() => work.discard(), /WORK_FAILED/);
  assert.strictEqual(work.events.some((event) => event.startsWith('unlink:')), false);
  assert.strictEqual(work.events.at(-1), `release:${maintenanceToken}`);
});

test('journal unlink failure is visible after work cleanup and retry remains bounded', () => {
  const first = fixture({ states: [{ token: 'a' }], failUnlink: 'journal:a' });
  assert.throws(() => first.discard(), /UNLINK_FAILED/);
  assert.ok(first.events.indexOf('work:a') < first.events.indexOf('unlink:journal:a'));
  assert.strictEqual(first.events.at(-1), `release:${maintenanceToken}`);

  const retry = fixture({ states: [{ token: 'a' }] });
  assert.strictEqual(retry.discard().discarded_batches, 1);
  assert.deepStrictEqual(retry.events.filter((event) => event.startsWith('work:') || event.startsWith('unlink:')),
    ['work:a', 'unlink:journal:a']);
});

test('partial multi-batch failure preserves the existing non-atomic contract', () => {
  const value = fixture({ states: [{ token: 'a' }, { token: 'b' }], failWork: 'b' });
  assert.throws(() => value.discard(), /WORK_FAILED/);
  assert.ok(value.events.includes('unlink:journal:a'));
  assert.strictEqual(value.events.includes('unlink:journal:b'), false);
});

test('lock release failure remains visible and the public facade is unchanged', () => {
  const value = fixture({ failRelease: true });
  assert.throws(() => value.discard(), /RELEASE_FAILED/);
  assert.strictEqual(typeof batchFacade.discardIncompleteBatches, 'function');
});

done();
