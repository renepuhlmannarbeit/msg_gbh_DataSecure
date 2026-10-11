'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { createBatchActiveLock } = require('../plugins/data-secure/server/gateway/batch-active-lock');
const { withDocumentControl } = require('../plugins/data-secure/server/gateway/standalone-document-control');
const { execFileSync } = require('node:child_process');
const temporary = fs.realpathSync.native(os.tmpdir());
const root = fs.mkdtempSync(path.join(temporary, 'datasecure-document-control-'));
const token = 'a'.repeat(64), lockPath = path.join(root, 'control.lock');
const gate = () => createBatchActiveLock({ lockPath: () => lockPath });
const code = expected => error => error?.code === expected;

test('synchronous document actions retain their existing return type and release once', () => {
  const value = { ok: true };
  assert.equal(withDocumentControl(gate(), token, () => value), value);
  assert.equal(fs.existsSync(lockPath), false);
});
test('a deferred native operation excludes another controller until it actually settles', async () => {
  let finish;
  const action = new Promise(resolve => { finish = resolve; });
  const pending = withDocumentControl(gate(), token, () => action);
  assert.equal(gate().readActiveLock().token, token);
  assert.throws(() => withDocumentControl(gate(), 'b'.repeat(64), () => 'foreign'), code('STANDALONE_BUSY'));
  await Promise.resolve();
  assert.throws(() => withDocumentControl(gate(), token, () => 'reentrant'), code('STANDALONE_BUSY'));
  finish('durable result'); assert.equal(await pending, 'durable result');
  assert.equal(fs.existsSync(lockPath), false);
  assert.equal(withDocumentControl(gate(), 'b'.repeat(64), () => 'next'), 'next');
});
test('asynchronous failure preserves its cause and releases real filesystem ownership', async () => {
  let reject;
  const original = Object.assign(new Error('synthetic native refusal'), { code: 'AI_EXPORT_CONFLICT' });
  const pending = withDocumentControl(gate(), token, () => new Promise((resolve, fail) => { reject = fail; }));
  reject(original);
  await assert.rejects(pending, error => error === original);
  assert.equal(fs.existsSync(lockPath), false);
});
test('thenables and a throwing then getter cannot release too early or leak ownership', async () => {
  let finish;
  const pending = withDocumentControl(gate(), token, () => ({ then(resolve) { finish = resolve; } }));
  await Promise.resolve();
  assert.equal(fs.existsSync(lockPath), true);
  finish('thenable'); assert.equal(await pending, 'thenable');
  const original = new Error('synthetic getter refusal');
  assert.throws(() => withDocumentControl(gate(), token, () => ({ get then() { throw original; } })), error => error === original);
  assert.equal(fs.existsSync(lockPath), false);
});
test('release failure is fail-closed after success and never masks a primary failure', async () => {
  for (const throwing of [false, true]) {
    let releases = 0;
    const controlled = { acquireActiveLock() {}, releaseActiveLock() { releases++; if (throwing) throw new Error('synthetic cleanup failure'); return false; } };
    assert.throws(() => withDocumentControl(controlled, token, () => 'done'), code('DOCUMENT_REVIEW_INVALID'));
    assert.equal(releases, 1);
    releases = 0;
    await assert.rejects(withDocumentControl(controlled, token, () => Promise.resolve('done')), code('DOCUMENT_REVIEW_INVALID'));
    assert.equal(releases, 1);
    for (const primary of [undefined, new Error('synthetic primary failure')]) {
      releases = 0;
      try { await withDocumentControl(controlled, token, () => Promise.reject(primary)); assert.fail('must reject'); }
      catch (error) { assert.equal(error, primary); }
      assert.equal(releases, 1);
    }
  }
});
test('synchronous failures and failed acquisition do not force-remove another owner', () => {
  const primary = new Error('synthetic primary failure');
  assert.throws(() => withDocumentControl(gate(), token, () => { throw primary; }), error => error === primary);
  assert.equal(fs.existsSync(lockPath), false);
  const held = gate(); held.acquireActiveLock('b'.repeat(64)); const before = fs.readFileSync(lockPath);
  assert.throws(() => withDocumentControl(gate(), token, () => assert.fail('must not run')), code('STANDALONE_BUSY'));
  assert.ok(fs.readFileSync(lockPath).equals(before)); assert.equal(held.releaseActiveLock('b'.repeat(64)), true);
});

test('death of a sidecar cannot steal document ownership from its still-live desktop', () => {
  const modulePath = require.resolve('../plugins/data-secure/server/gateway/batch-active-lock');
  execFileSync(process.execPath, ['-e', `const {createBatchActiveLock}=require(process.argv[1]);
    createBatchActiveLock({lockPath:()=>process.argv[2],process:{pid:Number(process.argv[3]),kill:process.kill.bind(process)}}).acquireActiveLock(process.argv[4]);`,
    modulePath, lockPath, String(process.pid), token], { windowsHide: true });
  assert.equal(gate().readActiveLock().pid, process.pid, 'the exited helper never owned the native capability');
  assert.throws(() => withDocumentControl(gate(), token, () => assert.fail('must not revoke while desktop lives')), code('STANDALONE_BUSY'));
  assert.equal(gate().releaseActiveLock(token), true, 'only settled owning desktop operation may release');
});

test('delegated generations prevent an old same-PID controller from releasing its successor', () => {
  const old = createBatchActiveLock({ lockPath: () => lockPath, ownerGeneration: '1'.repeat(32) });
  const next = createBatchActiveLock({ lockPath: () => lockPath, ownerGeneration: '2'.repeat(32) });
  old.acquireActiveLock(token);
  assert.equal(next.releaseActiveLock(token), false);
  assert.equal(next.retireDelegatedOwner(['3'.repeat(32)]), false);
  assert.equal(next.retireDelegatedOwner(['1'.repeat(32)]), true);
  next.acquireActiveLock(token);
  assert.equal(old.releaseActiveLock(token), false, 'PID and token are not sufficient after replacement');
  assert.throws(() => old.retireDelegatedOwner(['1'.repeat(32)]), /DOCUMENT_CONTROL_GENERATION_INVALID/u);
  assert.equal(next.releaseActiveLock(token), true);
});
test('delegated retirement never removes legacy or foreign-owner locks', () => {
  const next = createBatchActiveLock({ lockPath: () => lockPath, ownerGeneration: '2'.repeat(32) });
  const legacy = gate(); legacy.acquireActiveLock(token);
  const before = fs.readFileSync(lockPath);
  assert.equal(next.retireDelegatedOwner(['1'.repeat(32)]), false);
  assert.ok(fs.readFileSync(lockPath).equals(before)); assert.equal(legacy.releaseActiveLock(token), true);
  const foreign = createBatchActiveLock({ lockPath: () => lockPath, ownerGeneration: '1'.repeat(32),
    process: { pid: process.pid + 1, kill: process.kill.bind(process) } });
  foreign.acquireActiveLock(token);
  assert.equal(next.retireDelegatedOwner(['1'.repeat(32)]), false);
  assert.equal(foreign.releaseActiveLock(token), true);
});
test('retirement authority is closed and cannot include its own live generation', () => {
  const next = createBatchActiveLock({ lockPath: () => lockPath, ownerGeneration: '2'.repeat(32) });
  for (const invalid of [null, ['2'.repeat(32)], ['1'.repeat(32), '1'.repeat(32)], ['../control.lock']])
    assert.throws(() => next.retireDelegatedOwner(invalid), /DOCUMENT_CONTROL_GENERATION_INVALID/u);
});

after(() => {
  const resolved = fs.realpathSync(root), stat = fs.lstatSync(resolved);
  if (path.dirname(resolved) !== temporary || !path.basename(resolved).startsWith('datasecure-document-control-') ||
      !stat.isDirectory() || stat.isSymbolicLink()) throw Error('TEST_CLEANUP_TARGET_INVALID');
  const entries = fs.readdirSync(resolved);
  if (entries.length) throw Error('TEST_CLEANUP_UNEXPECTED_FILES');
  fs.rmdirSync(resolved);
});
