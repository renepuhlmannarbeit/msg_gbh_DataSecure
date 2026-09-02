'use strict';

const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchExecutorLease } = require('../plugins/data-secure/server/gateway/batch-executor-lease');
const batch = require('../plugins/data-secure/server/gateway/batch');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Local batch executor lease');
const token = 'a'.repeat(64);
const fixedTime = '2026-08-25T12:00:00.000Z';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixture(options = {}) {
  let persisted = clone(options.state || { token, remaining: 1 });
  const events = [];
  const releaseResults = [...(options.releaseResults || [true])];
  const alive = new Set(options.alive || []);
  const liveLocalExecutor = (state) => Number.isSafeInteger(state?.local_executor_pid) &&
    alive.has(state.local_executor_pid);
  const lease = createBatchExecutorLease({
    SafeError,
    processAlive(pid) { events.push(`alive:${pid}`); return alive.has(pid); },
    liveLocalExecutor,
    acquireActiveLock(value) {
      events.push(`acquire:${value}`);
      if (options.acquireError) throw options.acquireError;
    },
    releaseActiveLock(value) { events.push(`release:${value}`); return releaseResults.shift() ?? true; },
    readState(value) {
      events.push(`read:${value}`);
      if (options.readError) throw options.readError;
      return clone(persisted);
    },
    writeState(state) {
      events.push('write');
      if (options.writeError) throw options.writeError;
      persisted = clone(state);
    },
    publicProgress(state) {
      return {
        complete: state.complete === true,
        remaining: Number(state.remaining ?? 1),
        delivery_pending: Number(state.delivery_pending || 0),
        mapping_pending: Number(state.mapping_pending || 0),
        deferred_review: Number(state.deferred_review || 0),
        retryable: Number(state.retryable || 0),
        local_processing_active: liveLocalExecutor(state)
      };
    },
    nowIso: () => fixedTime,
    ...(options.otherLiveExecutor ? { otherLiveExecutor(value) { events.push(`other:${value}`); return options.otherLiveExecutor(value); } } : {})
  });
  return { lease, events, state: () => clone(persisted) };
}

test('a live executor on any other journal blocks the claim without touching this journal', () => {
  const original = { token, remaining: 1 };
  const { lease, events, state } = fixture({ state: original, alive: [222], otherLiveExecutor: () => true });
  assert.throws(() => lease.claimLocalBatchExecutor(token, 222), /anderer lokaler DataSecure-Stapel/iu);
  assert.deepStrictEqual(state(), original);
  assert.ok(!events.includes('write'));
  assert.deepStrictEqual(events, [`alive:222`, `acquire:${token}`, `read:${token}`, `other:${token}`, `release:${token}`]);

  const free = fixture({ state: original, alive: [222], otherLiveExecutor: () => false });
  assert.strictEqual(free.lease.claimLocalBatchExecutor(token, 222).ok, true);
  assert.strictEqual(free.state().local_executor_pid, 222);
});

test('invalid or conclusively dead candidate PID fails before taking the global lock', () => {
  for (const pid of [0, -1, 1.5, '12', 222]) {
    const { lease, events } = fixture();
    assert.throws(() => lease.claimLocalBatchExecutor(token, pid), /nicht sicher gestartet/i);
    assert.deepStrictEqual(events, Number.isSafeInteger(pid) && pid > 0 ? [`alive:${pid}`] : []);
  }
});

test('a stale marker is durably replaced and the public response exposes no lease fields', () => {
  const { lease, events, state } = fixture({
    state: { token, remaining: 1, local_executor_pid: 111, local_executor_started_at: 'old' },
    alive: [222]
  });
  const result = lease.claimLocalBatchExecutor(token, 222);
  assert.deepStrictEqual(events, [`alive:222`, `acquire:${token}`, `read:${token}`, 'write', `release:${token}`]);
  assert.strictEqual(state().local_executor_pid, 222);
  assert.strictEqual(state().local_executor_started_at, fixedTime);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.local_processing_active, true);
  assert.doesNotMatch(JSON.stringify(result), /local_executor|started_at|batch_token|pid/u);
});

test('a concurrent live owner blocks duplicate and foreign claims without rewriting its marker', () => {
  for (const candidate of [111, 222]) {
    const original = { token, remaining: 1, local_executor_pid: 111, local_executor_started_at: 'original' };
    const { lease, events, state } = fixture({ state: original, alive: [111, 222] });
    assert.throws(() => lease.claimLocalBatchExecutor(token, candidate), /bereits vollständig lokal verarbeitet/i);
    assert.deepStrictEqual(state(), original);
    assert.ok(!events.includes('write'));
    assert.strictEqual(events.at(-1), `release:${token}`);
  }
});

test('access cleans a stale marker durably, accepts its live owner and rejects another PID', () => {
  const stale = fixture({
    state: { token, remaining: 1, local_executor_pid: 111, local_executor_started_at: 'old' }
  });
  const staleState = stale.state();
  stale.lease.assertLocalExecutorAccess(staleState, 222);
  assert.strictEqual(stale.events.includes('write'), true);
  assert.strictEqual(stale.state().local_executor_pid, undefined);

  const owner = fixture({
    state: { token, remaining: 1, local_executor_pid: 111, local_executor_started_at: 'live' },
    alive: [111]
  });
  owner.lease.assertLocalExecutorAccess(owner.state(), 111);
  assert.deepStrictEqual(owner.events, []);
  assert.throws(() => owner.lease.assertLocalExecutorAccess(owner.state(), 222), /bereits vollständig lokal verarbeitet/i);
  assert.deepStrictEqual(owner.events, []);
});

test('journal failures never report a claim, release or stale cleanup as successful', () => {
  const writeError = new Error('journal unavailable');
  const claiming = fixture({ alive: [222], writeError });
  assert.throws(() => claiming.lease.claimLocalBatchExecutor(token, 222), /journal unavailable/);
  assert.strictEqual(claiming.events.at(-1), `release:${token}`);
  assert.strictEqual(claiming.state().local_executor_pid, undefined);

  const releasing = fixture({
    state: { token, remaining: 1, local_executor_pid: 222, local_executor_started_at: fixedTime },
    alive: [222], writeError
  });
  assert.strictEqual(releasing.lease.releaseLocalBatchExecutor(token, 222), false);
  assert.strictEqual(releasing.events.at(-1), `release:${token}`);
  assert.strictEqual(releasing.state().local_executor_pid, 222);

  const cleanup = fixture({
    state: { token, remaining: 1, local_executor_pid: 111, local_executor_started_at: 'old' },
    writeError
  });
  assert.throws(() => cleanup.lease.assertLocalExecutorAccess(cleanup.state(), 222), /journal unavailable/);
  assert.strictEqual(cleanup.state().local_executor_pid, 111);
});

test('a failed global-lock release never reports a successful lease transition', () => {
  const claiming = fixture({ alive: [222], releaseResults: [false] });
  assert.throws(
    () => claiming.lease.claimLocalBatchExecutor(token, 222),
    /Stapelsperre konnte nicht sicher freigegeben/u
  );
  assert.strictEqual(claiming.state().local_executor_pid, 222, 'the durable lease remains recoverable');

  const releasing = fixture({
    state: { token, remaining: 1, local_executor_pid: 222, local_executor_started_at: fixedTime },
    alive: [222], releaseResults: [false]
  });
  assert.strictEqual(releasing.lease.releaseLocalBatchExecutor(token, 222), false);
  assert.strictEqual(releasing.state().local_executor_pid, undefined, 'the durable release is retained');
});

test('release requires the exact PID and lock failures leave the journal untouched', () => {
  const original = { token, remaining: 1, local_executor_pid: 222, local_executor_started_at: fixedTime };
  const mismatch = fixture({ state: original, alive: [222] });
  assert.strictEqual(mismatch.lease.releaseLocalBatchExecutor(token, 333), false);
  assert.deepStrictEqual(mismatch.state(), original);
  assert.ok(!mismatch.events.includes('write'));
  assert.strictEqual(mismatch.events.at(-1), `release:${token}`);

  const blocked = fixture({ state: original, acquireError: new Error('lock unavailable') });
  assert.strictEqual(blocked.lease.releaseLocalBatchExecutor(token, 222), false);
  assert.deepStrictEqual(blocked.state(), original);
  assert.deepStrictEqual(blocked.events, [`acquire:${token}`]);

  const released = fixture({ state: original, alive: [222] });
  assert.strictEqual(released.lease.releaseLocalBatchExecutor(token, 222), true);
  assert.strictEqual(released.state().local_executor_pid, undefined);
  assert.strictEqual(released.state().local_executor_started_at, undefined);
});

test('a terminal non-runnable state preserves the established no-write contract', () => {
  const original = { token, complete: true, remaining: 0, local_executor_pid: 111, local_executor_started_at: 'stale' };
  const { lease, events, state } = fixture({ state: original, alive: [222] });
  const result = lease.claimLocalBatchExecutor(token, 222);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'batch_not_runnable');
  assert.deepStrictEqual(state(), original);
  assert.ok(!events.includes('write'));
  assert.strictEqual(events.at(-1), `release:${token}`);
});

test('the batch composition root keeps the public executor facade', () => {
  assert.strictEqual(typeof batch.claimLocalBatchExecutor, 'function');
  assert.strictEqual(typeof batch.releaseLocalBatchExecutor, 'function');
  assert.strictEqual(typeof batch.runLocalBatchExecutor, 'function');
});

done();
