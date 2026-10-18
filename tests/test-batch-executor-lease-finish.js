'use strict';

// Deterministic control-flow models, NOT a native Windows/macOS exclusion proof.
// The actual proposed helper, existing lease factory and actual runner execute;
// only the kernel/logical guard, journal and document work are explicit seams.
const { createSuite } = require('./helpers');
const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchExecutorLease } = require('../plugins/data-secure/server/gateway/batch-executor-lease');
const { createBatchExecutorRunner } = require('../plugins/data-secure/server/gateway/batch-executor-runner');
const { createBatchExecutorLeaseFinish, LEASE_FINISH_BACKOFF_MS, LEASE_FINISH_MAX_WAIT_MS } = require('../plugins/data-secure/server/gateway/batch-executor-lease-finish');
const { test, testAsync, done, assert } = createSuite('Executor lease + finish transaction');
const token = 'e'.repeat(64), pid = 4242, birth = 'synthetic-birth-4242';
const root = process.platform === 'win32' ? 'C:\\synthetic-private-root' : '/synthetic-private-root';
const error = code => Object.assign(new Error(code), { code });
const clone = value => structuredClone(value);

function fixture(options = {}) {
  let state = { token, schema: 'datasecure-batch/4', product_channel: 'standalone',
    local_executor_pid: pid, local_executor_birth_id: birth, local_executor_started_at: '2026-10-18T05:27:00Z',
    zero_day_work: options.zeroDay === true, io_summary: {},
    items: [1, 2, 3].map(n => ({ id: String(n), status: 'released', package_id: `package-${n}` })) };
  const published = clone(state.items), events = [], delays = [], diagnoses = [];
  let held = false, logical = false, acquireCalls = 0, nativeEntries = 0, logicalCalls = 0;
  let releaseCalls = 0, finishCalls = 0, writes = 0, contenderRequested = false, contenderOwns = false;
  let clock = 0;
  const guard = Object.freeze({ assertHeld() { assert.equal(held, true, 'kernel guard must still be held'); } });
  function withOwnershipControl(value, action) {
    assert.equal(value, root);
    if (held) { events.push('reentrant'); return action(guard); }
    acquireCalls++;
    clock += options.acquireCostMs || 0;
    if (options.beforeAcquire) options.beforeAcquire(acquireCalls);
    if (contenderOwns) throw error('OWNERSHIP_GUARD_BUSY');
    held = true; nativeEntries++; events.push('kernel-enter');
    try { return action(guard); }
    finally {
      assert.equal(logical, false, 'each logical transaction ends before outer kernel release');
      held = false; events.push('kernel-exit');
      if (contenderRequested) contenderOwns = true;
      if (options.closeError) throw options.closeError;
    }
  }
  function transaction(value, action) {
    assert.equal(value, token);
    return withOwnershipControl(root, () => {
      assert.equal(logical, false, 'logical transactions must be sequential, not nested');
      logical = true; logicalCalls++; events.push('logical-enter');
      try { return action(); }
      finally { logical = false; events.push('logical-exit'); }
    });
  }
  const lease = createBatchExecutorLease({
    SafeError, currentPid: () => pid, processAlive: candidate => candidate === pid,
    processInstanceIdentity: candidate => candidate === pid ? birth : 'different-birth',
    liveLocalExecutor: value => value.local_executor_pid === pid,
    withSynchronousActiveLock: transaction,
    readState(value) { assert.equal(value, token); return clone(state); },
    writeState(value) {
      guard.assertHeld(); state = clone(value); writes++;
      if (options.contenderAfterCommit && state.local_executor_pid === undefined) contenderRequested = true;
    },
    publicProgress: () => ({ complete: false, remaining: 1, delivery_pending: 0, mapping_pending: 0 })
  });
  function release(value, candidate) {
    releaseCalls++; guard.assertHeld();
    if (options.release) return options.release(value, candidate);
    return lease.releaseLocalBatchExecutor(value, candidate);
  }
  function finish(value) {
    finishCalls++; guard.assertHeld();
    if (options.finishError) throw options.finishError;
    if (options.finishResult) return options.finishResult();
    return transaction(value, () => {
      assert.equal(state.local_executor_pid, undefined);
      assert.deepEqual(state.items, published, 'already published work is not replayed/changed');
      if (!state.zero_day_work) return null;
      state.zero_day_work_ended = true; state.zero_day_work_cleaned = true; writes++;
      return clone(state);
    });
  }
  const helperDeps = {
    dataRoot: () => root, withOwnershipControl, releaseLocalBatchExecutor: release,
    finishZeroDayOperation: finish,
    monotonicNow: () => clock,
    async delay(milliseconds) {
      assert.equal(held, false, 'never wait with a held kernel guard');
      assert.equal(logical, false, 'never wait with a logical acquisition');
      delays.push(milliseconds); clock += milliseconds + (options.delayOvershootMs || 0); await Promise.resolve();
      if (options.delayError) throw options.delayError;
    }
  };
  return { lease, helperDeps, release, finish, withOwnershipControl, events, delays, diagnoses,
    run: createBatchExecutorLeaseFinish(helperDeps),
    state: () => clone(state), mutate: fn => fn(state), held: () => held,
    counts: () => ({ acquireCalls, nativeEntries, logicalCalls, releaseCalls, finishCalls, writes }),
    published };
}

async function caught(promise) {
  try { await promise; return { rejected: false }; }
  catch (reason) { return { rejected: true, reason }; }
}

test('backoff contract is closed and immutable', () => {
  assert.deepEqual(LEASE_FINISH_BACKOFF_MS, [10, 25, 50, 100, 200, 400, 800, 1000, 1000, 1000]);
  assert.equal(LEASE_FINISH_BACKOFF_MS.reduce((sum, ms) => sum + ms, 0), 4585);
  assert.equal(LEASE_FINISH_MAX_WAIT_MS, 5000);
  assert.equal(Object.isFrozen(LEASE_FINISH_BACKOFF_MS), true);
});

test('old two-root-acquisition composition reproduces the post-release Busy', () => {
  const value = fixture({ contenderAfterCommit: true });
  assert.equal(value.lease.releaseLocalBatchExecutor(token, pid), true);
  assert.equal(value.state().local_executor_pid, undefined);
  assert.throws(() => value.withOwnershipControl(root, () => value.finish(token)),
    reason => reason.code === 'OWNERSHIP_GUARD_BUSY');
  assert.equal(value.counts().finishCalls, 0);
});

for (const zeroDay of [false, true]) testAsync(`one kernel capability closes that gap; zero-day=${zeroDay}`, async () => {
  const value = fixture({ zeroDay, contenderAfterCommit: true });
  assert.equal(await value.run(token, pid), true);
  assert.deepEqual(value.counts(), { acquireCalls: 1, nativeEntries: 1, logicalCalls: 2,
    releaseCalls: 1, finishCalls: 1, writes: zeroDay ? 2 : 1 });
  assert.deepEqual(value.delays, []);
  assert.deepEqual(value.state().items, value.published);
  assert.equal(value.state().local_executor_pid, undefined);
  assert.equal(value.state().zero_day_work_cleaned, zeroDay ? true : undefined);
  assert.equal(value.held(), false);
});

testAsync('four pre-callback kernel Busy results allow exactly four outside-guard waits', async () => {
  const value = fixture({ beforeAcquire(n) { if (n <= 4) throw error('OWNERSHIP_GUARD_BUSY'); } });
  assert.equal(await value.run(token, pid), true);
  assert.deepEqual(value.delays, [10, 25, 50, 100]);
  assert.deepEqual(value.counts(), { acquireCalls: 5, nativeEntries: 1, logicalCalls: 2,
    releaseCalls: 1, finishCalls: 1, writes: 1 });
});

testAsync('persistent pre-callback Busy never touches the lease or finalizer', async () => {
  const busy = error('OWNERSHIP_GUARD_BUSY');
  const value = fixture({ beforeAcquire() { throw busy; } });
  const original = value.state();
  assert.equal((await caught(value.run(token, pid))).reason, busy);
  assert.deepEqual(value.delays, [...LEASE_FINISH_BACKOFF_MS]);
  assert.equal(value.counts().acquireCalls, 11);
  assert.equal(value.counts().releaseCalls, 0);
  assert.equal(value.counts().finishCalls, 0);
  assert.deepEqual(value.state(), original);
});

testAsync('a late timer never starts a fresh acquisition after the monotone deadline', async () => {
  const busy = error('OWNERSHIP_GUARD_BUSY');
  const value = fixture({ beforeAcquire() { throw busy; }, delayOvershootMs: 6000 });
  assert.equal((await caught(value.run(token, pid))).reason, busy);
  assert.deepEqual(value.delays, [10]);
  assert.equal(value.counts().acquireCalls, 1);
  assert.equal(value.counts().releaseCalls, 0);
});

testAsync('the final wait is clamped to remaining deadline budget', async () => {
  const busy = error('OWNERSHIP_GUARD_BUSY');
  const value = fixture({ beforeAcquire() { throw busy; }, acquireCostMs: 4995 });
  assert.equal((await caught(value.run(token, pid))).reason, busy);
  assert.deepEqual(value.delays, [5]);
  assert.equal(value.counts().acquireCalls, 1);
  assert.equal(value.counts().releaseCalls, 0);
});

testAsync('Busy followed by poisoned close state stops at the first hard refusal', async () => {
  const close = error('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED');
  const value = fixture({ beforeAcquire(n) { throw n === 1 ? error('OWNERSHIP_GUARD_BUSY') : close; } });
  assert.equal((await caught(value.run(token, pid))).reason, close);
  assert.deepEqual(value.delays, [10]);
  assert.equal(value.counts().acquireCalls, 2);
  assert.equal(value.counts().releaseCalls, 0);
});

for (const code of ['STANDALONE_OWNERSHIP_CONTROL_BUSY', 'OWNERSHIP_GUARD_UNSAFE',
  'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'BATCH_ACTIVE_LOCK_BUSY', 'EIO'])
  testAsync(`pre-callback ${code} is not the exact kernel-acquire Busy`, async () => {
    const primary = error(code), value = fixture({ beforeAcquire() { throw primary; } });
    assert.equal((await caught(value.run(token, pid))).reason, primary);
    assert.deepEqual(value.delays, []);
    assert.equal(value.counts().acquireCalls, 1);
    assert.equal(value.counts().releaseCalls, 0);
  });

testAsync('a Busy from inside the entered finalizer is never replayed', async () => {
  const primary = error('OWNERSHIP_GUARD_BUSY'), value = fixture({ finishError: primary });
  assert.equal((await caught(value.run(token, pid))).reason, primary);
  assert.equal(value.state().local_executor_pid, undefined, 'retain the actual durable release');
  assert.equal(value.counts().releaseCalls, 1);
  assert.equal(value.counts().finishCalls, 1);
  assert.deepEqual(value.delays, []);
});

for (const code of ['OWNERSHIP_GUARD_BUSY', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'EIO'])
  testAsync(`a post-callback ${code} is unsuccessful and never replays either step`, async () => {
    const primary = error(code), value = fixture({ closeError: primary });
    assert.equal((await caught(value.run(token, pid))).reason, primary);
    assert.equal(value.counts().releaseCalls, 1);
    assert.equal(value.counts().finishCalls, 1);
    assert.deepEqual(value.delays, []);
  });

testAsync('false release is not success and does not authorize finalization', async () => {
  const value = fixture({ release: () => false });
  assert.equal(await value.run(token, pid), false);
  assert.equal(value.counts().finishCalls, 0);
  assert.equal(value.counts().writes, 0);
  assert.deepEqual(value.delays, []);
});

testAsync('wrong PID, changed birth identity and missing lease cannot authorize cleanup', async () => {
  for (const mode of ['pid', 'birth', 'missing']) {
    const value = fixture();
    if (mode === 'birth') value.mutate(state => { state.local_executor_birth_id = 'different-birth'; });
    if (mode === 'missing') value.mutate(state => { delete state.local_executor_pid; });
    const original = value.state();
    assert.equal(await value.run(token, mode === 'pid' ? pid + 1 : pid), false);
    assert.equal(value.counts().finishCalls, 0);
    assert.equal(value.counts().writes, 0);
    assert.deepEqual(value.state(), original);
    assert.deepEqual(value.delays, []);
  }
});

testAsync('a failed wait propagates without acquiring or replaying work', async () => {
  const primary = error('WAIT_FAILED');
  const value = fixture({ beforeAcquire() { throw error('OWNERSHIP_GUARD_BUSY'); }, delayError: primary });
  assert.equal((await caught(value.run(token, pid))).reason, primary);
  assert.deepEqual(value.delays, [10]);
  assert.equal(value.counts().acquireCalls, 1);
  assert.equal(value.counts().releaseCalls, 0);
});

testAsync('Busy thrown by root resolution is not misclassified as kernel acquisition', async () => {
  const value = fixture(), primary = error('OWNERSHIP_GUARD_BUSY');
  const run = createBatchExecutorLeaseFinish({ ...value.helperDeps, dataRoot() { throw primary; } });
  assert.equal((await caught(run(token, pid))).reason, primary);
  assert.deepEqual(value.delays, []);
  assert.equal(value.counts().acquireCalls, 0);
});

test('async step and outer-wrapper functions are refused before invocation', () => {
  const value = fixture();
  for (const key of ['dataRoot', 'withOwnershipControl', 'releaseLocalBatchExecutor', 'finishZeroDayOperation']) {
    assert.throws(() => createBatchExecutorLeaseFinish({ ...value.helperDeps, [key]: async function () {} }),
      reason => reason.code === 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
  }
  assert.equal(value.counts().acquireCalls, 0);
});

testAsync('thenable release/finalizer values cannot escape the synchronous boundary', async () => {
  for (const options of [{ release: () => Promise.resolve(true) }, { finishResult: () => Promise.resolve(null) }]) {
    const value = fixture(options);
    const outcome = await caught(value.run(token, pid));
    assert.equal(outcome.rejected, true);
    assert.equal(outcome.reason.code, 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
    assert.deepEqual(value.delays, []);
    assert.equal(value.counts().releaseCalls, 1);
    assert.equal(value.counts().finishCalls, options.release ? 0 : 1);
  }
});

function runnerFixture(options = {}) {
  const value = fixture(options);
  let finalReads = 0, releaseSettled = false;
  if (options.pending) value.mutate(state => { state.items[0].status = 'pending'; });
  const run = createBatchExecutorRunner({
    SafeError, currentPid: () => pid,
    readState() {
      const state = value.state();
      if (state.local_executor_pid === undefined) { finalReads++; assert.equal(releaseSettled, true); }
      return state;
    },
    writeState() { throw error('UNEXPECTED_RUNNER_WRITE'); },
    liveLocalExecutor: state => state.local_executor_pid === pid,
    publicProgress(state) { return { complete: !state.items.some(item => item.status === 'pending'),
      remaining: state.items.filter(item => item.status === 'pending').length,
      completed: state.items.filter(item => item.status === 'released').length,
      delivery_pending: 0, mapping_pending: 0 }; },
    prepareProcessingRun() {
      if (Object.hasOwn(options, 'primary')) throw options.primary;
      return {};
    },
    incrementPrivateIoSummary: () => false,
    processBatchNext() { throw error('UNEXPECTED_DOCUMENT_REPLAY'); },
    finalizePublishedPackageLocally() { throw error('UNEXPECTED_PUBLICATION_REPLAY'); },
    async releaseLocalBatchExecutor(t, p) {
      try { return await value.run(t, p); }
      finally { releaseSettled = true; }
    },
    recordBatchFailure(phase, reason) { value.diagnoses.push({ phase, reason }); }
  }).runLocalBatchExecutor;
  return { ...value, runRunner: () => run(token), finalReads: () => finalReads };
}

testAsync('the actual runner awaits completion before reading final progress', async () => {
  const value = runnerFixture({ beforeAcquire(n) { if (n === 1) throw error('OWNERSHIP_GUARD_BUSY'); } });
  const result = await value.runRunner();
  assert.equal(result.complete, true);
  assert.equal(result.completed, 3);
  assert.equal(value.finalReads(), 1);
  assert.deepEqual(value.diagnoses, []);
  assert.deepEqual(value.delays, [10]);
  assert.equal(value.counts().releaseCalls, 1);
  assert.equal(value.counts().finishCalls, 1);
});

testAsync('false release remains an unconfirmed runner failure, not an export grant', async () => {
  const value = runnerFixture({ release: () => false });
  const outcome = await caught(value.runRunner());
  assert.equal(outcome.reason.code, 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED');
  assert.equal(value.finalReads(), 0);
  assert.equal(value.diagnoses.at(-1).phase, 'executor_lease_release');
  assert.equal(value.counts().finishCalls, 0);
});

testAsync('persistent pre-acquire Busy preserves pending sources and existing released work', async () => {
  const primary = error('OWNERSHIP_GUARD_BUSY');
  const value = runnerFixture({ pending: true, primary, beforeAcquire() { throw primary; } });
  const original = value.state();
  assert.equal((await caught(value.runRunner())).reason, primary);
  assert.deepEqual(value.state(), original);
  assert.equal(value.finalReads(), 0);
  assert.equal(value.counts().writes, 0);
  assert.equal(value.counts().releaseCalls, 0);
  assert.deepEqual(value.diagnoses.map(event => event.phase), ['processing', 'executor_lease_release']);
});

for (const primary of [undefined, null, false, 0, ''])
  testAsync(`runner preserves a falsy primary (${String(primary)}) over secondary close failure`, async () => {
    const secondary = error('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED');
    const value = runnerFixture({ primary, closeError: secondary });
    const outcome = await caught(value.runRunner());
    assert.equal(outcome.rejected, true);
    assert.strictEqual(outcome.reason, primary);
    assert.equal(value.diagnoses[0].reason, primary);
    assert.equal(value.diagnoses.at(-1).reason, secondary);
    assert.equal(value.counts().releaseCalls, 1);
    assert.equal(value.counts().finishCalls, 1);
    assert.deepEqual(value.delays, []);
    assert.equal(value.finalReads(), 0);
  });

test('actual batch composition passes the internal async finish helper only to the runner', () => {
  // Evaluate the actual composition source with only the two factories observed.
  // This does not invoke any batch, native guard, document or user-root operation.
  const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
  const filename = require.resolve('../plugins/data-secure/server/gateway/batch');
  const localRequire = Module.createRequire(filename), compiled = new Module(filename, module);
  compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  let helperDeps, runnerDeps;
  const sentinel = async function internalReleaseAndFinish() { throw error('NOT_A_TEST_OPERATION'); };
  compiled.require = id => {
    if (id === './batch-executor-lease-finish') return { createBatchExecutorLeaseFinish(deps) { helperDeps = deps; return sentinel; } };
    if (id === './batch-executor-runner') return { createBatchExecutorRunner(deps) { runnerDeps = deps; return { runLocalBatchExecutor() {} }; } };
    return localRequire(id);
  };
  compiled._compile(fs.readFileSync(filename, 'utf8'), filename);
  assert.equal(runnerDeps.releaseLocalBatchExecutor, sentinel);
  assert.equal(helperDeps.releaseLocalBatchExecutor, compiled.exports.releaseLocalBatchExecutor);
  assert.notEqual(compiled.exports.releaseLocalBatchExecutor, sentinel, 'public/parent cleanup keeps its synchronous facade');
  assert.equal(helperDeps.dataRoot, localRequire('../runtime').dataRoot);
  assert.equal(helperDeps.withOwnershipControl, localRequire('../core/ownership-control').withOwnershipControl);
  assert.equal(helperDeps.finishZeroDayOperation.name, 'finishZeroDayOperation');
});

module.exports = done();
