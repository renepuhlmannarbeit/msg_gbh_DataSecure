'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-active-lock-'));
process.env.LOCALAPPDATA = path.join(base, 'localapp');
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');

const { batchRoot } = require('../plugins/data-secure/server/gateway/batch-private-store');
const { createBatchActiveLock } = require('../plugins/data-secure/server/gateway/batch-active-lock');
const { _test } = require('../plugins/data-secure/server/gateway/batch');
const { test, done, assert } = createSuite('Active batch lock');

const tokenA = 'a'.repeat(64);
const tokenB = 'b'.repeat(64);
const tokenC = 'c'.repeat(64);

function lockValue(token, pid, lockId = token.slice(0, 32)) {
  return { schema: 'datasecure-active-batch/1', token, pid, created_at: '2026-08-25T10:00:00.000Z', lock_id: lockId };
}

function writeLock(target, token, pid, lockId) {
  fs.writeFileSync(target, `${JSON.stringify(lockValue(token, pid, lockId))}\n`, 'utf8');
}

function ioWithSwap(target, replacement, swapOnOpen) {
  let opens = 0;
  return {
    ...fs,
    constants: fs.constants,
    openSync(name, flags, mode) {
      if (name === target && !(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR)) && ++opens === swapOnOpen) {
        fs.unlinkSync(target);
        writeLock(target, replacement.token, replacement.pid, replacement.lockId);
      }
      return fs.openSync(name, flags, mode);
    }
  };
}

function ioWithTimestampDrift(target) {
  let targetStats = 0;
  return {
    ...fs,
    constants: fs.constants,
    fstatSync(descriptor) {
      const stat = fs.fstatSync(descriptor);
      if (++targetStats < 2) return stat;
      return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, {
        mtimeMs: stat.mtimeMs + 10_000,
        ctimeMs: stat.ctimeMs + 20_000
      });
    }
  };
}

function ioWithTransientUnlink(target, code, failures = 1, beforeRetry) {
  let attempts = 0;
  return {
    ...fs,
    constants: fs.constants,
    unlinkSync(name) {
      if (name === target && attempts++ < failures) {
        beforeRetry?.(attempts);
        const error = new Error(code);
        error.code = code;
        throw error;
      }
      return fs.unlinkSync(name);
    }
  };
}

test('module extraction preserves the batch test facade', () => {
  const direct = createBatchActiveLock();
  assert.strictEqual(_test.activeLockPath(), direct.activeLockPath());
  assert.strictEqual(_test.validActiveLock(lockValue(tokenA, 100)), true);
  assert.strictEqual(_test.liveLocalExecutor({ local_executor_pid: process.pid }), true);
});

test('release never deletes a replacement lock from a newer owner', () => {
  fs.mkdirSync(batchRoot(), { recursive: true });
  const target = path.join(batchRoot(), 'active-processing.json');
  writeLock(target, tokenA, 111);
  const lock = createBatchActiveLock({
    fs: ioWithSwap(target, { token: tokenB, pid: 222 }, 2),
    process: { pid: 111, kill() {} }
  });
  assert.strictEqual(lock.releaseActiveLock(tokenA), false);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), lockValue(tokenB, 222));
  fs.unlinkSync(target);
});

test('release accepts timestamp drift for the same immutable lock identity', () => {
  fs.mkdirSync(batchRoot(), { recursive: true });
  const target = path.join(batchRoot(), 'active-processing.json');
  writeLock(target, tokenA, 111);
  const lock = createBatchActiveLock({
    fs: ioWithTimestampDrift(target),
    process: { pid: 111, kill() {} }
  });
  assert.strictEqual(lock.releaseActiveLock(tokenA), true);
  assert.strictEqual(fs.existsSync(target), false);
});

test('release retries bounded transient Windows unlink failures for the same lock only', () => {
  const target = path.join(batchRoot(), 'active-processing.json');
  writeLock(target, tokenA, 111);
  const delays = [];
  const lock = createBatchActiveLock({
    fs: ioWithTransientUnlink(target, 'EPERM', 2),
    process: { pid: 111, kill() {} },
    retryDelay: (milliseconds) => delays.push(milliseconds)
  });
  assert.strictEqual(lock.releaseActiveLock(tokenA), true);
  assert.deepStrictEqual(delays, [10, 20]);
  assert.strictEqual(fs.existsSync(target), false);
});

test('release remains bounded and never removes a replacement during a transient retry', () => {
  const target = path.join(batchRoot(), 'active-processing.json');
  writeLock(target, tokenA, 111);
  const replacementId = 'e'.repeat(32);
  const lock = createBatchActiveLock({
    fs: ioWithTransientUnlink(target, 'EBUSY', 1, () => {
      fs.unlinkSync(target);
      writeLock(target, tokenB, 222, replacementId);
    }),
    process: { pid: 111, kill() {} },
    retryDelay: () => {}
  });
  assert.strictEqual(lock.releaseActiveLock(tokenA), false);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), lockValue(tokenB, 222, replacementId));
  fs.unlinkSync(target);
});

test('release gives up after four transient failures without hanging', () => {
  const target = path.join(batchRoot(), 'active-processing.json');
  writeLock(target, tokenA, 111);
  let delays = 0;
  const lock = createBatchActiveLock({
    fs: ioWithTransientUnlink(target, 'EACCES', 10),
    process: { pid: 111, kill() {} },
    retryDelay: () => { delays += 1; }
  });
  assert.strictEqual(lock.releaseActiveLock(tokenA), false);
  assert.strictEqual(delays, 3);
  assert.strictEqual(fs.existsSync(target), true);
  fs.unlinkSync(target);
});

test('release rejects a replacement with identical owner fields but another lock id', () => {
  const target = path.join(batchRoot(), 'active-processing.json');
  const replacementId = 'f'.repeat(32);
  writeLock(target, tokenA, 111);
  const lock = createBatchActiveLock({
    fs: ioWithSwap(target, { token: tokenA, pid: 111, lockId: replacementId }, 2),
    process: { pid: 111, kill() {} }
  });
  assert.strictEqual(lock.releaseActiveLock(tokenA), false);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), lockValue(tokenA, 111, replacementId));
  fs.unlinkSync(target);
});

test('stale recovery never removes a lock replaced by a live owner', () => {
  const target = path.join(batchRoot(), 'active-processing.json');
  writeLock(target, tokenA, 111);
  const lock = createBatchActiveLock({
    fs: ioWithSwap(target, { token: tokenB, pid: 222 }, 2),
    process: {
      pid: 333,
      kill(pid) {
        if (pid === 111) { const error = new Error('dead'); error.code = 'ESRCH'; throw error; }
      }
    }
  });
  assert.throws(() => lock.acquireActiveLock(tokenC), /nicht sicher bereinigt/i);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), lockValue(tokenB, 222));
  fs.unlinkSync(target);
});

test('EPERM and unknown liveness errors remain blocking while ESRCH proves death', () => {
  const target = path.join(batchRoot(), 'active-processing.json');
  writeLock(target, tokenA, 111);
  for (const code of ['EPERM', 'EACCES']) {
    const lock = createBatchActiveLock({
      process: {
        pid: 333,
        kill() { const error = new Error(code); error.code = code; throw error; }
      }
    });
    assert.throws(() => lock.acquireActiveLock(tokenC), /bereits verarbeitet/i, code);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), lockValue(tokenA, 111), code);
  }
  fs.unlinkSync(target);
});

test('a visible matching-PID lock is not an own acquisition or a transferable epoch', () => {
  const target = path.join(batchRoot(), 'active-processing.json');
  const owner = createBatchActiveLock(), foreign = createBatchActiveLock();
  writeLock(target, tokenA, process.pid);
  try { assert.throws(() => owner.captureOwnedEpoch(tokenA), error => error.code === 'BATCH_OWNERSHIP_CHANGED'); }
  finally { fs.unlinkSync(target); }
  owner.acquireActiveLock(tokenA);
  try {
    const proof = owner.captureOwnedEpoch(tokenA);
    assert.ok(Object.isFrozen(proof)); assert.deepEqual(Object.keys(proof), []);
    assert.equal(owner.assertOwnedEpoch(proof), true);
    for (const fake of [{}, { ...proof }, JSON.parse(JSON.stringify(proof)), new Proxy({}, {})])
      assert.throws(() => owner.assertOwnedEpoch(fake), error => error.code === 'BATCH_OWNERSHIP_CHANGED');
    assert.throws(() => foreign.assertOwnedEpoch(proof), error => error.code === 'BATCH_OWNERSHIP_CHANGED');
    assert.throws(() => foreign.captureOwnedEpoch(tokenA), error => error.code === 'BATCH_OWNERSHIP_CHANGED');
  } finally { owner.releaseActiveLock(tokenA); }
});

test('release/reacquire and byte-identical file replacement revoke an old own epoch', () => {
  const target = path.join(batchRoot(), 'active-processing.json'), preserved = path.join(batchRoot(), 'old-epoch.json');
  const owner = createBatchActiveLock(); owner.acquireActiveLock(tokenA);
  const old = owner.captureOwnedEpoch(tokenA);
  assert.equal(owner.releaseActiveLock(tokenA), true);
  owner.acquireActiveLock(tokenA);
  try {
    assert.throws(() => owner.assertOwnedEpoch(old), error => error.code === 'BATCH_OWNERSHIP_CHANGED');
    const current = owner.captureOwnedEpoch(tokenA), bytes = fs.readFileSync(target);
    fs.renameSync(target, preserved); fs.writeFileSync(target, bytes);
    assert.throws(() => owner.assertOwnedEpoch(current), error => error.code === 'BATCH_OWNERSHIP_CHANGED');
    assert.equal(owner.releaseActiveLock(tokenA), false, 'release must not adopt the replaced pathname');
    assert.deepEqual(fs.readFileSync(target), bytes);
  } finally { if (fs.existsSync(target)) fs.unlinkSync(target); fs.unlinkSync(preserved); }
});

test('the acquisition binds file identity before the first epoch capture, not from a later pathname', () => {
  const target = path.join(batchRoot(), 'active-processing.json'), preserved = path.join(batchRoot(), 'unseen-old-epoch.json');
  const owner = createBatchActiveLock(); owner.acquireActiveLock(tokenA);
  const bytes = fs.readFileSync(target); fs.renameSync(target, preserved); fs.writeFileSync(target, bytes);
  try { assert.throws(() => owner.captureOwnedEpoch(tokenA), error => error.code === 'BATCH_OWNERSHIP_CHANGED'); }
  finally { if (fs.existsSync(target)) fs.unlinkSync(target); fs.unlinkSync(preserved); }
});

test('capture rejects an observed named hardlink even when the earlier FD stat was single-linked', () => {
  const target = path.join(batchRoot(), 'active-processing.json'), alias = path.join(batchRoot(), 'epoch-link.json');
  let inject = false;
  const owner = createBatchActiveLock({ fs: { ...fs, constants: fs.constants,
    lstatSync(name, ...args) {
      if (inject && name === target) { inject = false; fs.linkSync(target, alias); }
      return fs.lstatSync(name, ...args);
    } } });
  owner.acquireActiveLock(tokenA); inject = true;
  try { assert.throws(() => owner.captureOwnedEpoch(tokenA), error => error.code === 'BATCH_OWNERSHIP_CHANGED'); }
  finally { fs.unlinkSync(alias); fs.unlinkSync(target); }
});

test('an old epoch-bound finally cannot release a later acquisition by the same PID and token', () => {
  const target = path.join(batchRoot(), 'active-processing.json'), owner = createBatchActiveLock();
  owner.acquireActiveLock(tokenA); const old = owner.captureOwnedEpoch(tokenA); owner.releaseActiveLock(tokenA);
  owner.acquireActiveLock(tokenA); const current = owner.captureOwnedEpoch(tokenA), bytes = fs.readFileSync(target);
  try {
    assert.equal(owner.releaseOwnedEpoch(old), false); assert.deepEqual(fs.readFileSync(target), bytes);
    assert.equal(owner.assertOwnedEpoch(current), true);
  } finally { owner.releaseActiveLock(tokenA); }
});

try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* best effort */ }
done();
