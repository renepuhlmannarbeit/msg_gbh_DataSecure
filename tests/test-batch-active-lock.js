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

function lockValue(token, pid) {
  return { schema: 'datasecure-active-batch/1', token, pid, created_at: '2026-08-25T10:00:00.000Z' };
}

function writeLock(target, token, pid) {
  fs.writeFileSync(target, `${JSON.stringify(lockValue(token, pid))}\n`, 'utf8');
}

function ioWithSwap(target, replacement, swapOnOpen) {
  let opens = 0;
  return {
    ...fs,
    constants: fs.constants,
    openSync(name, flags, mode) {
      if (name === target && ++opens === swapOnOpen) {
        fs.unlinkSync(target);
        writeLock(target, replacement.token, replacement.pid);
      }
      return fs.openSync(name, flags, mode);
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

try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* best effort */ }
done();
