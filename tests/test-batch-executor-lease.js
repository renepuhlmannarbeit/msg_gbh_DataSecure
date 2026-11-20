'use strict';

const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchExecutorLease } = require('../plugins/data-secure/server/gateway/batch-executor-lease');
const batch = require('../plugins/data-secure/server/gateway/batch');
const { createSuite } = require('./helpers');
const { loadIdentityPlatform } = require('./lib/process-identity-platform.cjs');

const { test, done, assert } = createSuite('Local batch executor lease');
const token = 'a'.repeat(64);
const fixedTime = '2026-08-25T12:00:00.000Z';
const birth = (pid) => String(pid).padStart(64, '0');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixture(options = {}) {
  let persisted = clone(options.state || { token, remaining: 1 });
  const events = [];
  const identityReads = [];
  const releaseResults = [...(options.releaseResults || [true])];
  const alive = new Set(options.alive || []);
  const identity = (pid) => Object.prototype.hasOwnProperty.call(options.identities || {}, pid)
    ? options.identities[pid] : birth(pid);
  const liveLocalExecutor = options.liveLocalExecutor || ((state) => Number.isSafeInteger(state?.local_executor_pid) &&
    alive.has(state.local_executor_pid) && (state.local_executor_birth_id === undefined ||
      state.local_executor_birth_id === identity(state.local_executor_pid)));
  const lease = (options.createLease || createBatchExecutorLease)({
    SafeError,
    processAlive(pid) { events.push(`alive:${pid}`); return alive.has(pid); },
    liveLocalExecutor,
    acquireActiveLock(value) {
      events.push(`acquire:${value}`);
      if (options.acquireError) throw options.acquireError;
    },
    releaseActiveLock(value) { events.push(`release:${value}`); if (options.releaseError) throw options.releaseError; return releaseResults.shift() ?? true; },
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
    currentPid: () => options.currentPid ?? 222,
    processInstanceIdentity(pid) {
      identityReads.push(pid);
      return alive.has(pid) ? identity(pid) : null;
    },
    ...(options.requireProcessInstanceIdentity ? { requireProcessInstanceIdentity: options.requireProcessInstanceIdentity } : {}),
    ...(options.otherLiveExecutor ? { otherLiveExecutor(value) { events.push(`other:${value}`); return options.otherLiveExecutor(value); } } : {})
  });
  return { lease, events, identityReads, liveLocalExecutor, state: () => clone(persisted),
    mutateState(action) { action(persisted); } };
}

// The actual ActiveLock observer supplies public progress too. No copied
// hash-equality algorithm decides the expected Darwin result in these cases.
function platformFixture(platform, options = {}) {
  const alive = new Set(options.alive || []);
  const identity = pid => Object.hasOwn(options.identities || {}, pid) ? options.identities[pid] : birth(pid);
  const activeModule = loadIdentityPlatform('batch-active-lock.js', platform,
    pid => alive.has(pid) ? identity(pid) : null);
  const observer = activeModule.createBatchActiveLock({ process: { pid: options.currentPid ?? 222, kill(pid, signal) {
    assert.equal(signal, 0);
    if (!alive.has(pid)) throw Object.assign(new Error('synthetic dead process'), { code: 'ESRCH' });
  } } });
  return fixture({ ...options,
    createLease: loadIdentityPlatform('batch-executor-lease.js', platform).createBatchExecutorLease,
    liveLocalExecutor: observer.liveLocalExecutor });
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
  assert.strictEqual(free.state().local_executor_birth_id, birth(222));
});

test('invalid or conclusively dead candidate PID fails before taking the global lock', () => {
  for (const pid of [0, -1, 1.5, '12', 222]) {
    const { lease, events } = fixture();
    assert.throws(() => lease.claimLocalBatchExecutor(token, pid), /nicht sicher gestartet/i);
    assert.deepStrictEqual(events, Number.isSafeInteger(pid) && pid > 0 ? [`alive:${pid}`] : []);
  }
});

test('a failed required birth probe preserves its fixed cause before any lock or journal write', () => {
  const error = Object.assign(Error('PROCESS_IDENTITY_ACCESS_DENIED'), { code: 'PROCESS_IDENTITY_ACCESS_DENIED' });
  let calls = 0;
  const f = fixture({ alive: [222], requireProcessInstanceIdentity: pid => {
    assert.equal(pid, 222); calls++; throw error;
  } });
  assert.throws(() => f.lease.claimLocalBatchExecutor(token, 222), actual => actual === error);
  assert.equal(calls, 1); assert.deepEqual(f.events, ['alive:222']);
  assert.deepEqual(f.state(), { token, remaining: 1 });
  const unavailable = fixture({ alive: [222], identities: { 222: null } });
  assert.throws(() => unavailable.lease.claimLocalBatchExecutor(token, 222), { code: 'PROCESS_IDENTITY_UNAVAILABLE' });
});

test('a stale marker is durably replaced and the public response exposes no lease fields', () => {
  const { lease, events, state } = fixture({
    state: { token, remaining: 1, local_executor_pid: 111, local_executor_started_at: 'old' },
    alive: [222]
  });
  const result = lease.claimLocalBatchExecutor(token, 222);
  assert.deepStrictEqual(events, [`alive:222`, `acquire:${token}`, `read:${token}`, 'alive:111', 'write', `release:${token}`]);
  assert.strictEqual(state().local_executor_pid, 222);
  assert.strictEqual(state().local_executor_started_at, fixedTime);
  assert.strictEqual(state().local_executor_birth_id, birth(222));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.local_processing_active, true);
  assert.doesNotMatch(JSON.stringify(result), /local_executor|started_at|batch_token|pid/u);
});

test('Windows and Linux retain conclusive reused-live-PID recovery', () => {
  const previousBirth = 'a'.repeat(64);
  const currentBirth = 'b'.repeat(64);
  for (const platform of ['win32', 'linux']) {
    const { lease, state } = platformFixture(platform, {
      state: { token, remaining: 1, local_executor_pid: 111,
        local_executor_started_at: '2026-08-25T11:00:00.000Z', local_executor_birth_id: previousBirth },
      alive: [111, 222], identities: { 111: currentBirth, 222: birth(222) }
    });
    const result = lease.claimLocalBatchExecutor(token, 222);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(state().local_executor_pid, 222);
    assert.strictEqual(state().local_executor_birth_id, birth(222));
    assert.equal(result.local_processing_active, true);
  }
});

test('an unavailable identity provider blocks a new lease and cannot authorize release', () => {
  const blocked = fixture({ alive: [222], identities: { 222: null } });
  assert.throws(() => blocked.lease.claimLocalBatchExecutor(token, 222), /nicht sicher gestartet/i);

  const state = { token, remaining: 1, local_executor_pid: 222,
    local_executor_started_at: fixedTime, local_executor_birth_id: birth(222) };
  const release = fixture({ state, alive: [222], identities: { 222: null } });
  assert.strictEqual(release.lease.releaseLocalBatchExecutor(token, 222), false);
  assert.deepStrictEqual(release.state(), state);
});

test('a concurrent live owner blocks duplicate and foreign claims without rewriting its marker', () => {
  for (const candidate of [111, 222]) {
    const original = { token, remaining: 1, local_executor_pid: 111, local_executor_started_at: 'original',
      local_executor_birth_id: birth(111) };
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
    state: { token, remaining: 1, local_executor_pid: 111, local_executor_started_at: 'live',
      local_executor_birth_id: birth(111) },
    alive: [111]
  });
  owner.lease.assertLocalExecutorAccess(owner.state(), 111);
  assert.deepStrictEqual(owner.events, ['alive:111']);
  assert.throws(() => owner.lease.assertLocalExecutorAccess(owner.state(), 222), /bereits vollständig lokal verarbeitet/i);
  assert.deepStrictEqual(owner.events, ['alive:111', 'alive:111']);
});

test('journal failures never report a claim, release or stale cleanup as successful', () => {
  const writeError = new Error('journal unavailable');
  const claiming = fixture({ alive: [222], writeError });
  assert.throws(() => claiming.lease.claimLocalBatchExecutor(token, 222), /journal unavailable/);
  assert.strictEqual(claiming.events.at(-1), `release:${token}`);
  assert.strictEqual(claiming.state().local_executor_pid, undefined);

  const releasing = fixture({
    state: { token, remaining: 1, local_executor_pid: 222, local_executor_started_at: fixedTime,
      local_executor_birth_id: birth(222) },
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
    state: { token, remaining: 1, local_executor_pid: 222, local_executor_started_at: fixedTime,
      local_executor_birth_id: birth(222) },
    alive: [222], releaseResults: [false]
  });
  assert.strictEqual(releasing.lease.releaseLocalBatchExecutor(token, 222), false);
  assert.strictEqual(releasing.state().local_executor_pid, undefined, 'the durable release is retained');
});

test('native release errors preserve a primary claim failure and never escape nonthrowing cleanup', () => {
  const releaseError = Object.assign(new Error('OWNERSHIP_GUARD_BUSY'), { code: 'OWNERSHIP_GUARD_BUSY' });
  const primary = new Error('primary journal failure');
  const failed = fixture({ alive: [222], readError: primary, releaseError });
  assert.throws(() => failed.lease.claimLocalBatchExecutor(token, 222), error => error === primary);
  const claimed = fixture({ alive: [222], releaseError });
  assert.throws(() => claimed.lease.claimLocalBatchExecutor(token, 222), error => error === releaseError);
  const releasing = fixture({ state: { token, remaining: 1, local_executor_pid: 222,
    local_executor_birth_id: birth(222) }, alive: [222], releaseError });
  assert.strictEqual(releasing.lease.releaseLocalBatchExecutor(token, 222), false);
  assert.strictEqual(releasing.state().local_executor_pid, undefined, 'retain the actual durable lease change, not a success ACK');
});

test('release requires the exact PID and lock failures leave the journal untouched', () => {
  const original = { token, remaining: 1, local_executor_pid: 222, local_executor_started_at: fixedTime,
    local_executor_birth_id: birth(222) };
  const mismatch = fixture({ state: original, alive: [222] });
  assert.strictEqual(mismatch.lease.releaseLocalBatchExecutor(token, 333), false);
  assert.deepStrictEqual(mismatch.state(), original);
  assert.ok(!mismatch.events.includes('write'));
  assert.deepStrictEqual(mismatch.events, [], 'a foreign legacy PID has no cleanup authority');

  const blocked = fixture({ state: original, acquireError: new Error('lock unavailable') });
  assert.strictEqual(blocked.lease.releaseLocalBatchExecutor(token, 222), false);
  assert.deepStrictEqual(blocked.state(), original);
  assert.deepStrictEqual(blocked.events, [`acquire:${token}`]);

  const released = fixture({ state: original, alive: [222] });
  assert.strictEqual(released.lease.releaseLocalBatchExecutor(token, 222), true);
  assert.strictEqual(released.state().local_executor_pid, undefined);
  assert.strictEqual(released.state().local_executor_started_at, undefined);
  assert.strictEqual(released.state().local_executor_birth_id, undefined);
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
  assert.strictEqual(typeof batch.releaseClaimedLocalBatchExecutor, 'function');
  assert.strictEqual(typeof batch.runLocalBatchExecutor, 'function');
});

test('a living Darwin hash mismatch cannot authorize lease clearing or a replacement claim', () => {
  const original = { token, remaining: 1, local_executor_pid: 111,
    local_executor_birth_id: 'a'.repeat(64), local_executor_started_at: fixedTime, local_executor_lease_id: '1'.repeat(32) };
  const make = () => platformFixture('darwin', { state: original, alive: [111, 222],
    identities: { 111: 'b'.repeat(64), 222: birth(222) } });
  const claimant = make();
  assert.throws(() => claimant.lease.claimLocalBatchExecutor(token, 222), /bereits vollständig lokal verarbeitet/iu);
  assert.deepEqual(claimant.state(), original); assert.ok(!claimant.events.includes('write'));
  const accessor = make();
  assert.throws(() => accessor.lease.assertLocalExecutorAccess(accessor.state(), 222), /bereits vollständig lokal verarbeitet/iu);
  assert.deepEqual(accessor.state(), original); assert.ok(!accessor.events.includes('write'));
});

test('Darwin live mismatch remains blocking for the same PID without granting self-release', () => {
  const original = { token, remaining: 1, local_executor_pid: 222,
    local_executor_birth_id: 'a'.repeat(64), local_executor_started_at: fixedTime, local_executor_lease_id: '2'.repeat(32) };
  const value = platformFixture('darwin', { state: original, alive: [222], identities: { 222: 'b'.repeat(64) } });
  assert.throws(() => value.lease.assertLocalExecutorAccess(value.state(), 222), /bereits vollständig lokal verarbeitet/iu);
  assert.equal(value.lease.releaseLocalBatchExecutor(token, 222), false);
  assert.deepEqual(value.state(), original); assert.ok(!value.events.includes('write'));
});

test('another actual Darwin observer with a live mismatch blocks a cross-journal contender', () => {
  const otherOriginal = { token: 'b'.repeat(64), remaining: 1, local_executor_pid: 111,
    local_executor_birth_id: 'a'.repeat(64), local_executor_started_at: fixedTime };
  const other = platformFixture('darwin', { state: otherOriginal, alive: [111], identities: { 111: 'b'.repeat(64) } });
  const contender = platformFixture('darwin', { alive: [222],
    otherLiveExecutor: () => other.liveLocalExecutor(other.state()) });
  assert.throws(() => contender.lease.claimLocalBatchExecutor(token, 222), /anderer lokaler DataSecure-Stapel/iu);
  assert.deepEqual(contender.state(), { token, remaining: 1 }); assert.ok(!contender.events.includes('write'));
  assert.deepEqual(other.state(), otherOriginal); assert.ok(!other.events.includes('write'));
});

test('Darwin same/dead/unobservable controls preserve exact access and candidate admission', () => {
  const original = { token, remaining: 1, local_executor_pid: 111,
    local_executor_birth_id: 'a'.repeat(64), local_executor_started_at: fixedTime };
  const dead = platformFixture('darwin', { state: original, alive: [222] });
  assert.equal(dead.lease.claimLocalBatchExecutor(token, 222).ok, true);
  assert.equal(dead.state().local_executor_pid, 222);
  const same = platformFixture('darwin', { state: { ...original, local_executor_birth_id: birth(111) }, alive: [111] });
  same.lease.assertLocalExecutorAccess(same.state(), 111);
  assert.ok(!same.events.includes('write'));
  const unavailable = platformFixture('darwin', { state: original, alive: [111, 222], identities: { 111: null } });
  assert.throws(() => unavailable.lease.claimLocalBatchExecutor(token, 222), /bereits vollständig lokal verarbeitet/iu);
  assert.deepEqual(unavailable.state(), original); assert.ok(!unavailable.events.includes('write'));
  const noCandidate = platformFixture('darwin', { alive: [222], identities: { 222: null } });
  assert.throws(() => noCandidate.lease.claimLocalBatchExecutor(token, 222), { code: 'PROCESS_IDENTITY_UNAVAILABLE' });
  assert.deepEqual(noCandidate.events, ['alive:222']);
});

test('Darwin original claim capability releases its exact epoch without a fresh mismatching probe', () => {
  const identities = { 222: 'a'.repeat(64) };
  const value = platformFixture('darwin', { alive: [222], identities });
  const proof = value.lease.claimLocalBatchExecutor(token, 222), committed = value.state();
  assert.equal(proof.ok, true);
  assert.equal(value.lease.releaseClaimedLocalBatchExecutor(JSON.parse(JSON.stringify(proof))), false);
  identities[222] = 'b'.repeat(64);
  assert.equal(value.lease.releaseLocalBatchExecutor(token, 222), false);
  assert.deepEqual(value.state(), committed);
  const probes = value.identityReads.length;
  assert.equal(value.lease.releaseClaimedLocalBatchExecutor(proof), true);
  assert.equal(value.identityReads.length, probes, 'the parent uses its original capability, not another birth observation');
  assert.equal(value.state().local_executor_pid, undefined);
  assert.equal(value.lease.releaseClaimedLocalBatchExecutor(proof), false);
});

test('Darwin capability never adopts changed birth, PID or lease ID tuples', () => {
  for (const [key, changed] of [['local_executor_birth_id', 'f'.repeat(64)],
    ['local_executor_pid', 333], ['local_executor_lease_id', 'f'.repeat(32)]]) {
    const value = platformFixture('darwin', { alive: [222] });
    const proof = value.lease.claimLocalBatchExecutor(token, 222);
    value.mutateState(state => { state[key] = changed; });
    const before = value.state(), writes = value.events.filter(event => event === 'write').length;
    assert.equal(value.lease.releaseClaimedLocalBatchExecutor(proof), false);
    assert.deepEqual(value.state(), before);
    assert.equal(value.events.filter(event => event === 'write').length, writes);
  }
});

done();
