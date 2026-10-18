'use strict';

// Explicit RAM control-flow countermodels, not a native C, parser, publisher or
// product-worker/runner execution. Actual proposed helper/orchestrator execute.
const { createSuite } = require('./helpers');
const { createBatchProcessingAdmission, BACKOFF_MS } = require('../plugins/data-secure/server/gateway/batch-processing-admission');
const { createBatchProcessingOrchestrator } = require('../plugins/data-secure/server/gateway/batch-processing-orchestrator');
const { testAsync, test, assert, done } = createSuite('Processing pre-action admission');
class SafeError extends Error {}
const token = 'e'.repeat(64), root = process.platform === 'win32' ? 'C:\\synthetic-root' : '/synthetic-root';
const error = code => Object.assign(Error(code), { code });
async function caught(promise) { try { await promise; return { rejected: false }; } catch (reason) { return { rejected: true, reason }; } }

function fixture(options = {}) {
  const active = new Set(), epoch = Object.freeze({}), delays = [];
  const state = { schema: 'datasecure-batch/4', token, items: [1, 2, 3].map(() => ({ status: 'pending', checkpoint: 'sealed' })) };
  const calls = { attempts: 0, callbacks: 0, claims: 0, reads: 0, maintenance: 0, documents: 0, releases: 0 };
  let held = false, logical = false, clock = 0;
  function control(value, action) {
    assert.equal(value, root);
    const guard = { assertHeld() { assert.equal(held, true); return true; } };
    if (held) return action(guard);
    calls.attempts++;
    if (options.before) options.before(calls.attempts);
    if (calls.attempts <= (options.busy || 0)) throw error('OWNERSHIP_GUARD_BUSY');
    held = true; calls.callbacks++;
    try { return action(guard); }
    finally { held = false; if (options.closeError) throw options.closeError; }
  }
  function acquire(value) {
    return control(root, () => {
      assert.equal(value, token); calls.claims++;
      if (options.claimResult !== undefined) return options.claimResult;
      logical = true;
      if (options.claimError) throw options.claimError;
      return true;
    });
  }
  const admission = createBatchProcessingAdmission({ dataRoot: () => root, withOwnershipControl: control,
    acquireActiveLock: acquire, monotonicNow: () => clock,
    async delay(ms) {
      assert.equal(held, false, 'no native capability over await');
      assert.equal(logical, false, 'no logical acquisition before admission');
      assert.equal(active.has(token), true, 'one in-process lifecycle spans admission wait');
      delays.push(ms); clock += ms + (options.overshoot || 0);
      if (options.onDelay) await options.onDelay();
      await Promise.resolve();
    } });
  const deps = { SafeError, active, acquireActiveLock: acquire, acquireProcessingOwner: admission,
    captureOwnedEpoch() { assert.equal(logical, true); return epoch; },
    releaseOwnedEpoch(proof) { assert.equal(proof, epoch); assert.equal(active.has(token), true);
      calls.releases++; logical = false; return true; },
    releaseActiveLock() { assert.fail('no token/PID fallback with a captured epoch'); },
    readState() { calls.reads++; if (options.readError) throw options.readError; return state; },
    assertLocalExecutorAccess() {}, maintainBeforeNext() { calls.maintenance++; },
    exactPendingEntry() { return { synthetic: true }; },
    async processSingleBatchItem() { calls.documents++; assert.equal(held, false);
      if (options.documentError) throw options.documentError;
      state.items[0].status = 'processing'; return { ok: true }; },
    publicProgress: () => ({ remaining: 3 }), writeState() {},
    invalidateUnpublishedBatchCopies() { assert.fail('admission cannot invalidate a document'); }
  };
  const run = createBatchProcessingOrchestrator(deps).processBatchNext;
  return { run: () => run(token), runToken: run, deps, admission, calls, delays, state, active, logical: () => logical };
}

testAsync('transient real-boundary model Busy waits before one claim/action, never repeats work', async () => {
  const value = fixture({ busy: 3 });
  assert.deepEqual(await value.run(), { ok: true });
  assert.deepEqual(value.delays, [10, 25, 50]);
  assert.deepEqual(value.calls, { attempts: 4, callbacks: 1, claims: 1, reads: 1, maintenance: 1, documents: 1, releases: 1 });
  assert.equal(value.active.size, 0);
});

testAsync('normal success stays synchronous through admission and reaches document immediately', async () => {
  const value = fixture();
  const pending = value.run();
  assert.equal(value.calls.documents, 1, 'no newly introduced await on ordinary successful admission');
  await pending;
  assert.deepEqual(value.delays, []); assert.equal(value.calls.claims, 1); assert.equal(value.calls.releases, 1);
});

testAsync('persistent kernel Busy preserves all sealed pending items and releases no unacquired owner', async () => {
  const value = fixture({ busy: 100 }); const before = JSON.stringify(value.state);
  const outcome = await caught(value.run());
  assert.equal(outcome.reason.code, 'OWNERSHIP_GUARD_BUSY');
  assert.deepEqual(value.delays, [...BACKOFF_MS]);
  assert.deepEqual(value.calls, { attempts: 11, callbacks: 0, claims: 0, reads: 0, maintenance: 0, documents: 0, releases: 0 });
  assert.equal(JSON.stringify(value.state), before); assert.equal(value.active.size, 0);
});

testAsync('a late timer cannot authorize a new attempt beyond the monotone deadline', async () => {
  const value = fixture({ busy: 100, overshoot: 6000 });
  assert.equal((await caught(value.run())).reason.code, 'OWNERSHIP_GUARD_BUSY');
  assert.deepEqual(value.delays, [10]); assert.equal(value.calls.attempts, 1); assert.equal(value.calls.claims, 0);
  assert.equal(value.active.size, 0);
});

for (const code of ['STANDALONE_OWNERSHIP_CONTROL_BUSY', 'BATCH_ACTIVE_LOCK_BUSY',
  'OWNERSHIP_GUARD_UNSAFE', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'EIO']) testAsync(`${code} is not a raw pre-callback kernel Busy`, async () => {
  const primary = error(code), value = fixture({ before() { throw primary; } });
  assert.equal((await caught(value.run())).reason, primary);
  assert.equal(value.calls.attempts, 1); assert.equal(value.calls.claims, 0);
  assert.deepEqual(value.delays, []); assert.equal(value.active.size, 0);
});

testAsync('Busy after logical publication is uncertain, not another admission attempt', async () => {
  const primary = error('OWNERSHIP_GUARD_BUSY'), value = fixture({ claimError: primary });
  assert.equal((await caught(value.run())).reason, primary);
  assert.equal(value.calls.attempts, 1); assert.equal(value.calls.claims, 1);
  assert.equal(value.calls.documents, 0); assert.equal(value.calls.releases, 0);
  assert.equal(value.logical(), true, 'do not force-delete an unconfirmed publication');
  assert.deepEqual(value.delays, []); assert.equal(value.active.size, 0);
});

for (const code of ['OWNERSHIP_GUARD_BUSY', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED']) testAsync(`post-callback ${code} never replays or reports ownership`, async () => {
  const primary = error(code), value = fixture({ closeError: primary });
  assert.equal((await caught(value.run())).reason, primary);
  assert.equal(value.calls.claims, 1); assert.equal(value.calls.reads, 0); assert.equal(value.calls.releases, 0);
  assert.deepEqual(value.delays, []); assert.equal(value.active.size, 0);
});

testAsync('false acquire is never action or release authority', async () => {
  const value = fixture({ claimResult: false });
  assert.equal((await caught(value.run())).reason.code, 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED');
  assert.equal(value.calls.reads, 0); assert.equal(value.calls.releases, 0); assert.deepEqual(value.delays, []);
});

testAsync('thenable acquire cannot cross the guarded admission boundary', async () => {
  const value = fixture({ claimResult: Promise.resolve(true) });
  assert.equal((await caught(value.run())).reason.code, 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
  assert.equal(value.calls.reads, 0); assert.equal(value.calls.releases, 0); assert.deepEqual(value.delays, []);
});

for (const stage of ['read', 'document']) testAsync(`Busy in ${stage} after admission is not a whole-operation retry`, async () => {
  const primary = error('OWNERSHIP_GUARD_BUSY'), value = fixture(stage === 'read' ? { readError: primary } : { documentError: primary });
  assert.equal((await caught(value.run())).reason, primary);
  assert.equal(value.calls.claims, 1); assert.equal(value.calls.releases, 1);
  assert.equal(value.calls.documents, stage === 'read' ? 0 : 1); assert.deepEqual(value.delays, []);
});

testAsync('a duplicate in-process call during the wait cannot enter or steal the owner', async () => {
  let value, checked = 0;
  value = fixture({ busy: 1, async onDelay() {
    const outcome = await caught(value.run()); assert.equal(outcome.rejected, true);
    assert.match(outcome.reason.message, /bereits eine Verarbeitung/u); checked++;
    assert.equal(value.calls.attempts, 1);
  } });
  await value.run(); assert.equal(checked, 1); assert.equal(value.calls.documents, 1); assert.equal(value.active.size, 0);
});

test('async admission dependencies are rejected before any operation', () => {
  for (const field of ['dataRoot', 'withOwnershipControl', 'acquireActiveLock', 'monotonicNow']) {
    const deps = { dataRoot: () => root, withOwnershipControl() {}, acquireActiveLock() {}, monotonicNow: () => 0 };
    deps[field] = async function () {};
    assert.throws(() => createBatchProcessingAdmission(deps), reason => reason.code === 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
  }
});
test('actual one-shot ActiveLock publisher never sleeps/retries an in-guard link Busy', () => {
  const path = require('node:path'), nativeFs = require('node:fs');
  const { createBatchActiveLock } = require('../plugins/data-secure/server/gateway/batch-active-lock');
  const target = path.join(root, 'active-processing.json'), files = new Map(), fds = new Map();
  let nextFd = 100, nextIno = 10n, held = false, links = 0, sleeps = 0;
  const missing = () => { throw error('ENOENT'); };
  const stat = (node, directory = false) => ({ dev: 1n, ino: node?.ino || 2n, birthtimeNs: 1n,
    size: BigInt(node?.bytes.length || 0), nlink: 1n,
    isFile: () => !directory, isDirectory: () => directory, isSymbolicLink: () => false });
  const io = { constants: nativeFs.constants,
    realpathSync: value => path.resolve(value),
    lstatSync(value) {
      if (files.has(value)) return stat(files.get(value));
      if (value === target || value.startsWith(target + '.prepared-')) return missing();
      return stat(null, true);
    },
    openSync(value, flags) {
      if (flags & nativeFs.constants.O_CREAT) {
        if (files.has(value)) throw error('EEXIST');
        files.set(value, { ino: nextIno++, bytes: Buffer.alloc(0) });
      }
      if (!files.has(value)) return missing();
      fds.set(++nextFd, files.get(value)); return nextFd;
    },
    fstatSync: fd => stat(fds.get(fd)),
    writeSync(fd, bytes, offset, length) { fds.get(fd).bytes = Buffer.from(bytes.subarray(offset, offset + length)); return length; },
    fsyncSync() {},
    closeSync(fd) { fds.delete(fd); },
    linkSync() { assert.equal(held, true); links++; throw error('EBUSY'); }
  };
  function control(_root, action) {
    if (held) return action({ assertHeld() { assert.equal(held, true); } });
    held = true;
    try { return action({ assertHeld() { assert.equal(held, true); } }); }
    finally { held = false; }
  }
  const owner = createBatchActiveLock({ fs: io, lockPath: () => target,
    process: { pid: process.pid, kill() {} }, withOwnershipControl: control,
    retryDelay() { sleeps++; assert.fail('no held publication/unlink wait'); } });
  const admit = createBatchProcessingAdmission({ dataRoot: () => root, withOwnershipControl: control,
    acquireActiveLock: owner.acquireActiveLockOnce, delay() { assert.fail('link Busy is not a kernel-acquire retry'); } });
  assert.throws(() => admit(token));
  assert.equal(links, 1); assert.equal(sleeps, 0); assert.equal(held, false);
  assert.equal(files.has(target), false); assert.equal(fds.size, 0);
  assert.equal(files.size, 1, 'uncommitted complete own temp remains conservative');
});
module.exports = done();
