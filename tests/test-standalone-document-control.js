'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { createBatchActiveLock, ACTIVE_LOCK_BUSY } = require('../plugins/data-secure/server/gateway/batch-active-lock');
const { withDocumentControl, withSynchronousDocumentControl } = require('../plugins/data-secure/server/gateway/standalone-document-control');
const { execFileSync } = require('node:child_process');
const temporary = fs.realpathSync.native(os.tmpdir());
const root = fs.mkdtempSync(path.join(temporary, 'datasecure-document-control-'));
const token = 'a'.repeat(64), lockPath = path.join(root, 'control.lock');
const gate = () => createBatchActiveLock({ lockPath: () => lockPath });
const code = expected => error => error?.code === expected;
const sourceAdapter = Object.freeze({ sourceAdapter: true });

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
    assert.throws(() => withDocumentControl(controlled, token, () => 'done', sourceAdapter), code('DOCUMENT_REVIEW_INVALID'));
    assert.equal(releases, 1);
    releases = 0;
    await assert.rejects(withDocumentControl(controlled, token, () => Promise.resolve('done'), sourceAdapter), code('DOCUMENT_REVIEW_INVALID'));
    assert.equal(releases, 1);
    for (const primary of [undefined, new Error('synthetic primary failure')]) {
      releases = 0;
      try { await withDocumentControl(controlled, token, () => Promise.reject(primary), sourceAdapter); assert.fail('must reject'); }
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
    modulePath, lockPath, String(process.pid), token], { windowsHide: true, timeout: 10000 });
  assert.equal(gate().readActiveLock().pid, process.pid, 'the exited helper never owned the native capability');
  assert.throws(() => withDocumentControl(gate(), token, () => assert.fail('must not revoke while desktop lives')), code('STANDALONE_BUSY'));
  assert.equal(gate().releaseActiveLock(token), false, 'matching desktop PID cannot mint a lost acquisition capability');
  // This synthetic helper impersonated the desktop PID but deliberately did
  // not transfer any capability. Remove only its exact private test record;
  // production cannot infer authority this way and remains fail-closed.
  const record = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.equal(record.pid, process.pid); assert.equal(record.token, token);
  fs.unlinkSync(lockPath);
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

test('synchronous document control keeps one real owner-record transaction and rejects async admission', () => {
  let held = false, entries = 0, invoked = 0;
  const own = createBatchActiveLock({ lockPath: () => lockPath, withOwnershipControl(_root, action) {
    assert.equal(held, false); entries++; held = true;
    try { return action({ assertHeld() { assert.equal(held, true); } }); }
    finally { held = false; }
  } });
  assert.equal(withSynchronousDocumentControl(own, token, () => {
    assert.equal(held, true); assert.equal(own.readActiveLock().token, token); return 42;
  }), 42);
  assert.equal(entries, 1); assert.equal(held, false); assert.equal(fs.existsSync(lockPath), false);
  assert.throws(() => withSynchronousDocumentControl(own, token, async () => { invoked++; }), code('OWNERSHIP_GUARD_ASYNC_FORBIDDEN'));
  assert.equal(entries, 1); assert.equal(invoked, 0);
  assert.throws(() => withSynchronousDocumentControl(own, token, () => ({ then() {} })), code('OWNERSHIP_GUARD_ASYNC_FORBIDDEN'));
  assert.equal(fs.existsSync(lockPath), false);
  for (const primary of [undefined, Object.assign(Error('action busy, not admission'), { code: 'OWNERSHIP_GUARD_BUSY' })]) {
    let caught = false;
    try { withSynchronousDocumentControl(own, token, () => { throw primary; }); }
    catch (error) { caught = true; assert.equal(error, primary); }
    assert.equal(caught, true); assert.equal(fs.existsSync(lockPath), false);
  }
});

test('only closed admission collisions map to Busy; missing sync wiring and hard refusals remain closed', async () => {
  const hardCodes = ['OWNERSHIP_GUARD_UNSAFE', 'OWNERSHIP_GUARD_UNAVAILABLE', 'OWNERSHIP_GUARD_ACCESS_DENIED',
    'OWNERSHIP_GUARD_SIGNATURE_REFUSED', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED'];
  for (const failure of [undefined, new Error('ordinary I/O failure'), ...hardCodes.map(value => Object.assign(Error(value), { code: value }))]) {
    const failed = { acquireActiveLock() { throw failure; }, withSynchronousActiveLock() { throw failure; } };
    for (const control of [withDocumentControl, withSynchronousDocumentControl]) {
      let caught = false;
      try { control(failed, token, () => assert.fail('failed acquisition cannot run the action'), sourceAdapter); }
      catch (error) { caught = true; assert.equal(error, failure); }
      assert.equal(caught, true);
    }
  }
  for (const value of [ACTIVE_LOCK_BUSY, 'OWNERSHIP_GUARD_BUSY']) {
    assert.equal(typeof value, 'string');
    const collision = Object.assign(Error('fixed collision'), { code: value });
    const failed = { acquireActiveLock() { throw collision; }, withSynchronousActiveLock() { throw collision; } };
    for (const control of [withDocumentControl, withSynchronousDocumentControl])
      assert.throws(() => control(failed, token, () => assert.fail('collision must not enter'), sourceAdapter), code('STANDALONE_BUSY'));
  }
  assert.throws(() => withSynchronousDocumentControl({ acquireActiveLock() { assert.fail('no separated fallback'); } }, token, () => true),
    code('OWNERSHIP_GUARD_UNAVAILABLE'));
  for (const value of hardCodes) {
    const original = Object.assign(Error(value), { code: value });
    const refused = { acquireActiveLock() {}, releaseActiveLock() { throw original; } };
    assert.throws(() => withDocumentControl(refused, token, () => true, sourceAdapter), error => error === original);
    await assert.rejects(withDocumentControl(refused, token, () => Promise.resolve(true), sourceAdapter), error => error === original);
    const primary = new Error('primary stays primary');
    await assert.rejects(withDocumentControl(refused, token, () => Promise.reject(primary), sourceAdapter), error => error === primary);
  }
  const close = Object.assign(Error('fixed native close refusal'), { code: 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED' });
  const closing = createBatchActiveLock({ lockPath: () => lockPath, withOwnershipControl(_root, action) {
    action({ assertHeld() {} }); throw close;
  } });
  assert.throws(() => withSynchronousDocumentControl(closing, token, () => true), error => error === close);
  assert.equal(fs.existsSync(lockPath), false, 'own record was removed before the native close refusal');
});

// Actual owner-record/epoch APIs and filesystem I/O; only kernel admission is
// injected. These tests are not Windows/macOS C-primitive execution evidence.
function epochReleaseFixture() {
  let held = false, releasing = false, captures = 0, refusal, remaining = 0;
  const attempts = [], delays = [];
  const actual = createBatchActiveLock({ lockPath: () => lockPath, withOwnershipControl(_root, action) {
    assert.equal(held, false);
    if (releasing && remaining-- > 0) throw refusal;
    held = true;
    try { return action({ assertHeld() { assert.equal(held, true); } }); }
    finally { held = false; }
  } });
  const controlled = { ...actual,
    captureOwnedEpoch(value) { captures++; return actual.captureOwnedEpoch(value); },
    releaseActiveLock() { assert.fail('document release must use its captured epoch, never a token'); },
    releaseOwnedEpoch(proof) {
      assert.equal(held, false); attempts.push(proof);
      releasing = true;
      try { return actual.releaseOwnedEpoch(proof); }
      finally { releasing = false; }
    }
  };
  return { actual, gate: controlled, attempts, delays, held: () => held, captures: () => captures,
    refuse(error, count) { refusal = error; remaining = count; },
    options: { async delay(milliseconds) {
      assert.equal(held, false, 'backoff cannot retain a kernel guard');
      assert.equal(fs.existsSync(lockPath), true, 'backoff retains logical ownership');
      delays.push(milliseconds); await Promise.resolve();
    } }
  };
}

test('async release retries real owned-file cleanup with the identical pre-action epoch and no action replay', async () => {
  const f = epochReleaseFixture(), busy = Object.assign(Error('kernel busy'), { code: 'OWNERSHIP_GUARD_BUSY' });
  f.refuse(busy, 4); let actions = 0;
  const pending = withDocumentControl(f.gate, token, async () => {
    assert.equal(f.captures(), 1); assert.equal(f.held(), false); actions++;
    assert.equal(fs.existsSync(lockPath), true); return 'completed native operation';
  }, f.options);
  assert.equal(await pending, 'completed native operation');
  assert.equal(actions, 1); assert.equal(f.captures(), 1); assert.equal(f.attempts.length, 5);
  assert.deepEqual(f.delays, [10, 25, 50, 100]);
  assert.ok(f.attempts.every(proof => proof === f.attempts[0]));
  assert.equal(fs.existsSync(lockPath), false);
});

test('thenable rejection retains its primary while exact epoch cleanup retries outside the guard', async () => {
  const f = epochReleaseFixture(), busy = Object.assign(Error('kernel busy'), { code: 'OWNERSHIP_GUARD_BUSY' });
  f.refuse(busy, 2); let actions = 0, assimilations = 0;
  const primary = Object.assign(Error('native publish refused'), { code: 'AI_EXPORT_UNCERTAIN' });
  await assert.rejects(withDocumentControl(f.gate, token, () => {
    actions++; assert.equal(f.captures(), 1);
    return { then(_resolve, reject) { assimilations++; reject(primary); } };
  }, f.options), error => error === primary);
  assert.equal(actions, 1); assert.equal(assimilations, 1); assert.equal(f.attempts.length, 3);
  assert.deepEqual(f.delays, [10, 25]);
  assert.ok(f.attempts.every(proof => proof === f.attempts[0])); assert.equal(fs.existsSync(lockPath), false);
});

test('persistent Busy stops after four asynchronous backoffs and leaves only its exact owned record', async () => {
  for (const primary of [null, undefined, Error('primary stays primary')]) {
    const f = epochReleaseFixture(), busy = Object.assign(Error('persistent kernel busy'), { code: 'OWNERSHIP_GUARD_BUSY' });
    f.refuse(busy, 5); let actions = 0;
    const pending = withDocumentControl(f.gate, token, () => {
      actions++; return primary === null ? Promise.resolve('native publication completed') : Promise.reject(primary);
    }, f.options);
    if (primary === null) await assert.rejects(pending, error => error === busy);
    else { let caught = false; try { await pending; } catch (error) { caught = true; assert.equal(error, primary); } assert.equal(caught, true); }
    assert.equal(actions, 1); assert.equal(f.captures(), 1); assert.equal(f.attempts.length, 5);
    assert.deepEqual(f.delays, [10, 25, 50, 100]);
    assert.ok(f.attempts.every(proof => proof === f.attempts[0]));
    assert.equal(fs.existsSync(lockPath), true);
    // A successful assertion does not grant PID adoption or broad cleanup.
    // Release only the capability this test actually captured and retained.
    assert.equal(f.actual.releaseOwnedEpoch(f.attempts[0]), true);
  }
});

test('false and hard epoch-release errors never retry, preserve hard identity, and never mask a primary', async () => {
  for (const value of [false, 'OWNERSHIP_GUARD_UNSAFE', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED',
    'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED', 'BATCH_OWNERSHIP_CHANGED',
    'STANDALONE_OWNERSHIP_CONTROL_BUSY', ACTIVE_LOCK_BUSY, 'EIO']) {
    for (const hasPrimary of [false, true]) {
      const f = epochReleaseFixture(), refusal = value === false ? false : Object.assign(Error('fixed hard refusal'), { code: value });
      let proof, attempts = 0, actions = 0;
      const controlled = { ...f.gate, releaseOwnedEpoch(epoch) { proof = epoch; attempts++; if (refusal === false) return false; throw refusal; } };
      const primary = new Error('primary stays primary');
      const pending = withDocumentControl(controlled, token, () => {
        actions++; return hasPrimary ? Promise.reject(primary) : Promise.resolve('done');
      }, f.options);
      await assert.rejects(pending, error => hasPrimary ? error === primary :
        refusal === false ? error?.code === 'DOCUMENT_REVIEW_INVALID' : error === refusal);
      assert.equal(actions, 1); assert.equal(attempts, 1); assert.deepEqual(f.delays, []);
      assert.equal(fs.existsSync(lockPath), true);
      assert.equal(f.actual.releaseOwnedEpoch(proof), true);
    }
  }
});

test('a later same-token epoch cannot be released by an earlier asynchronous cleanup retry', async () => {
  const f = epochReleaseFixture(), busy = Object.assign(Error('kernel busy'), { code: 'OWNERSHIP_GUARD_BUSY' });
  f.refuse(busy, 1); let next, replacement;
  const options = { async delay(milliseconds) {
    assert.equal(milliseconds, 10); assert.equal(f.held(), false);
    assert.equal(f.actual.releaseOwnedEpoch(f.attempts[0]), true);
    f.actual.acquireActiveLock(token); next = f.actual.captureOwnedEpoch(token);
    replacement = fs.readFileSync(lockPath); await Promise.resolve();
  } };
  await assert.rejects(withDocumentControl(f.gate, token, () => Promise.resolve('old operation completed'), options), code('DOCUMENT_REVIEW_INVALID'));
  assert.equal(f.captures(), 1); assert.equal(f.attempts.length, 2); assert.equal(f.attempts[0], f.attempts[1]);
  assert.deepEqual(fs.readFileSync(lockPath), replacement);
  assert.equal(f.actual.releaseOwnedEpoch(next), true);
});

test('a failed backoff preserves its exact refusal or primary and cannot retry or remove retained ownership', async () => {
  for (const hasPrimary of [false, true]) {
    const f = epochReleaseFixture(), busy = Object.assign(Error('kernel busy'), { code: 'OWNERSHIP_GUARD_BUSY' });
    const primary = Error('native primary'), delayFailure = Error('timer refused');
    f.refuse(busy, 1); let delays = 0;
    const options = { async delay(milliseconds) {
      assert.equal(milliseconds, 10); assert.equal(f.held(), false); delays++; throw delayFailure;
    } };
    await assert.rejects(withDocumentControl(f.gate, token, () => hasPrimary ? Promise.reject(primary) : Promise.resolve('done'), options),
      error => error === (hasPrimary ? primary : delayFailure));
    assert.equal(delays, 1); assert.equal(f.attempts.length, 1); assert.equal(fs.existsSync(lockPath), true);
    assert.equal(f.actual.releaseOwnedEpoch(f.attempts[0]), true);
  }
});

test('accessor and Proxy release causes cannot mint Busy or replace a primary through code evaluation', async () => {
  let traps = 0;
  const accessor = Object.create(null, { code: { get() { traps++; throw Error('getter must not run'); } } });
  const proxy = new Proxy({}, { get() { traps++; throw Error('proxy must not run'); },
    getOwnPropertyDescriptor() { traps++; throw Error('proxy descriptor must not run'); } });
  for (const refusal of [accessor, proxy]) {
    for (const hasPrimary of [false, true]) {
      const f = epochReleaseFixture(), primary = Error('primary'); let proof, attempts = 0;
      const controlled = { ...f.gate, releaseOwnedEpoch(epoch) { proof = epoch; attempts++; throw refusal; } };
      // assert.rejects itself inspects Proxy rejection reasons in Node 22.
      // Capture directly so this probe measures only the production helper.
      let caught = false;
      try { await withDocumentControl(controlled, token, () => hasPrimary ? Promise.reject(primary) : Promise.resolve('done'), f.options); }
      catch (error) { caught = true; assert.equal(error, hasPrimary ? primary : refusal); }
      assert.equal(caught, true);
      assert.equal(attempts, 1); assert.deepEqual(f.delays, []); assert.equal(fs.existsSync(lockPath), true);
      assert.equal(f.actual.releaseOwnedEpoch(proof), true);
    }
  }
  assert.equal(traps, 0);
});

test('synchronous compatibility never becomes a Promise or sleeps, and still uses only its captured epoch', () => {
  const f = epochReleaseFixture(), value = { ok: true };
  assert.equal(withDocumentControl(f.gate, token, () => value, f.options), value);
  assert.equal(f.captures(), 1); assert.equal(f.attempts.length, 1); assert.deepEqual(f.delays, []);
  assert.equal(fs.existsSync(lockPath), false);
  const busy = Object.assign(Error('kernel busy'), { code: 'OWNERSHIP_GUARD_BUSY' }); f.refuse(busy, 1);
  assert.throws(() => withDocumentControl(f.gate, token, () => value, f.options), error => error === busy);
  assert.deepEqual(f.delays, []); assert.equal(f.actual.releaseOwnedEpoch(f.attempts.at(-1)), true);
});

test('a failed capture prevents the action and cannot fall back to token-based cleanup', () => {
  const original = Object.assign(Error('epoch changed'), { code: 'BATCH_OWNERSHIP_CHANGED' });
  let actions = 0, releases = 0, acquired = 0;
  const controlled = { acquireActiveLock() { acquired++; }, captureOwnedEpoch() { throw original; },
    releaseOwnedEpoch() { releases++; }, releaseActiveLock() { releases++; } };
  assert.throws(() => withDocumentControl(controlled, token, () => { actions++; }), error => error === original);
  assert.equal(acquired, 1); assert.equal(actions, 0); assert.equal(releases, 0);
});

test('missing epoch wiring fails before admission; only explicit nonnative source adapters retain compatibility', async () => {
  const previous = process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
  let acquisitions = 0, actions = 0, releases = 0;
  const legacy = { acquireActiveLock() { acquisitions++; }, releaseActiveLock() { releases++; return true; } };
  try {
    for (const native of ['1', '0']) {
      process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = native;
      assert.throws(() => withDocumentControl(legacy, token, () => { actions++; }), code('OWNERSHIP_GUARD_UNAVAILABLE'));
    }
    process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = '1';
    assert.throws(() => withDocumentControl(legacy, token, () => { actions++; }, { sourceAdapter: true }), code('OWNERSHIP_GUARD_UNAVAILABLE'));
    assert.equal(acquisitions, 0); assert.equal(actions, 0); assert.equal(releases, 0);
    process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = '0';
    assert.equal(withDocumentControl(legacy, token, () => { actions++; return 42; }, { sourceAdapter: true }), 42);
    assert.equal(await withDocumentControl(legacy, token, async () => { actions++; return 43; }, { sourceAdapter: true }), 43);
    assert.equal(acquisitions, 2); assert.equal(actions, 2); assert.equal(releases, 2);
  } finally {
    if (previous === undefined) delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
    else process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = previous;
  }
});

// Product Store + actual owner-record/private-file I/O. Only the kernel guard
// and native callback are explicit lifetime models: this is not OS/NAPI proof.
const ownStoreDirectories = new Set();
function storeFixture(contentBound = false) {
  const crypto = require('node:crypto'), vm = require('node:vm'), { createRequire } = require('node:module');
  const dir = fs.mkdtempSync(path.join(root, 'store-')); ownStoreDirectories.add(dir);
  const data = path.join(dir, 'private'), output = path.join(dir, 'packages'), results = path.join(dir, 'results');
  for (const folder of [data, output, results]) fs.mkdirSync(folder, { mode: 0o700 });
  let held = false, entries = 0, busyAdmissions = 0, refusedAdmissions = 0;
  const controlFile = path.join(data, 'document-reviews', 'control.lock');
  const controlled = (_root, action) => {
    assert.equal(held, false); entries++;
    if (busyAdmissions > 0) { busyAdmissions--; refusedAdmissions++; throw Object.assign(Error('injected kernel Busy'), { code: 'OWNERSHIP_GUARD_BUSY' }); }
    held = true;
    try { return action({ assertHeld() { assert.equal(held, true); } }); }
    finally { held = false; }
  };
  const source = require.resolve('../plugins/data-secure/server/gateway/standalone-document-review-store');
  const localRequire = createRequire(source), loaded = { exports: {} };
  const requireStore = request => request === '../gateway/batch-active-lock'
    ? { createBatchActiveLock: options => createBatchActiveLock({ ...options, withOwnershipControl: controlled }) }
    : localRequire(request);
  vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){${fs.readFileSync(source, 'utf8')}\n})`, { filename: source })(
    requireStore, loaded, loaded.exports, source, path.dirname(source));
  const batchId = crypto.randomBytes(32).toString('hex'), documentId = crypto.randomBytes(16).toString('hex');
  const item = { id: documentId, name: 'Quelle.txt', sha256: crypto.createHash('sha256').update('source').digest('hex'), status: 'released' };
  const state = { token: batchId, product_channel: 'standalone', standalone_document_review: true,
    processing_mode: 'markdown-and-anonymize', items: [item] };
  const text = '# Synthetischer Inhalt\n42 Projekte.\n', packageId = `ds_${documentId}`, folder = path.join(output, packageId);
  let artifact;
  if (contentBound) {
    state.schema = 'datasecure-batch/7';
    state.content_options = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };
    const pub = require('../plugins/data-secure/server/standalone/anonymized-artifact');
    const coverage = { status: 'complete', reason_codes: [] };
    const extraction = require('../plugins/data-secure/server/core/source-extraction-contract').createSourceExtraction({
      source_type: 'txt', content_options: state.content_options, coverage, markdown: text }, 8_000_000);
    const proof = pub.verifyAnonymizedPublication({ markdown: text, profile: 'general', content_options: state.content_options,
      source_extraction: extraction, dictionary: [], strong_person_anchor: false, reviewed_person_candidates: null });
    artifact = pub.createAnonymizedArtifact({ package_id: packageId, content_options: state.content_options,
      source_type: 'txt', profile: 'general', operation_id: crypto.randomUUID(), created_at: new Date().toISOString(),
      coverage, markdown: text, verification_proof: proof });
    const privateArtifact = path.join(data, 'standalone-anonymized-artifacts', 'Output', packageId);
    fs.mkdirSync(privateArtifact, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(privateArtifact, `${packageId}.md`), text);
    fs.writeFileSync(path.join(privateArtifact, 'manifest.json'), JSON.stringify(artifact.manifest));
  }
  const identity = { volume: '1', object: '1', created_ns: '1' };
  const binding = { schema: 'datasecure-native-export-binding/1', root: results, private_name: `native-export-${'b'.repeat(32)}`,
    root_identity: identity, data_root_identity: identity, private_identity: identity, anonymize_identity: identity, markdown_identity: identity };
  let nativeAction = async () => { throw Error('native callback not configured'); };
  const store = loaded.exports.createDocumentReviewStore({ dataRoot: data, outputRoot: () => output, expectedDocuments: () => [item],
    nativeBinding: () => binding, nativeExport: async (...args) => {
      assert.equal(held, false, 'no kernel capability crosses native await');
      assert.equal(fs.existsSync(controlFile), true, 'logical capability remains held');
      return nativeAction(...args);
    } });
  store.capture(state, item, { package_id: packageId, original_text: 'Synthetische Quelle', markdown: text,
    ...(contentBound ? { content_options: state.content_options, source_type: 'txt', publication_binding: artifact.expectation,
      verification_context: { profile: 'general' } } : {}) });
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, `${packageId}.md`), text);
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/3', package_id: packageId,
    document: `${packageId}.md`, verification: { text_residual_pii: 'passed' },
    document_sha256: crypto.createHash('sha256').update(text).digest('hex') }));
  return { store, batchId, documentId, data, dir, controlFile, state, item, artifact,
    held: () => held, entries: () => entries,
    refuseNextAdmission() { busyAdmissions++; }, refusedAdmissions: () => refusedAdmissions,
    native(action) { nativeAction = action; },
    selection() { const row = store.list(batchId).documents[0]; return [{ document_id: row.document_id, revision: row.revision, output_sha256: row.output_sha256 }]; },
    gate: () => createBatchActiveLock({ lockPath: () => controlFile, withOwnershipControl: controlled }) };
}

test('productive recordPublication persists its exact receipt before leaving one synchronous guard', () => {
  const f = storeFixture(), before = f.entries(), link = fs.linkSync;
  let observed = 0;
  const receipt = path.join(f.data, 'document-reviews', f.batchId, f.documentId, 'published.json');
  fs.linkSync = function(from, to) {
    if (to === receipt) { assert.equal(f.held(), true); observed++; }
    return link.apply(this, arguments);
  };
  try { assert.equal(f.store.recordPublication(f.batchId, f.documentId), undefined); }
  finally { fs.linkSync = link; }
  assert.equal(observed, 1); assert.equal(f.entries() - before, 1);
  assert.equal(fs.existsSync(receipt), true); assert.equal(fs.existsSync(f.controlFile), false);
  assert.equal(f.store.list(f.batchId).documents.length, 1);
});

test('content-v1 expectation and exact private publication use one synchronous transaction each, with no cached-proof bypass', () => {
  const f = storeFixture(true), previous = process.env.EU_PRIVACY_DATA_ROOT;
  process.env.EU_PRIVACY_DATA_ROOT = f.data;
  try {
    let before = f.entries();
    assert.deepEqual(f.store.publicationExpectation(f.batchId, f.documentId), f.artifact.expectation);
    assert.equal(f.entries() - before, 1); assert.equal(fs.existsSync(f.controlFile), false);
    before = f.entries();
    f.store.recordPublication(f.batchId, f.documentId);
    assert.equal(f.entries() - before, 1); assert.equal(fs.existsSync(f.controlFile), false);
    const receipt = JSON.parse(fs.readFileSync(path.join(f.data, 'document-reviews', f.batchId, f.documentId, 'published.json'), 'utf8'));
    assert.deepEqual(receipt.publication_binding, f.artifact.expectation);
    assert.equal(fs.existsSync(path.join(f.data, 'document-reviews', f.batchId, `published-${f.documentId}.json`)), true);
    const document = path.join(f.data, 'standalone-anonymized-artifacts', 'Output', `ds_${f.documentId}`, `ds_${f.documentId}.md`);
    const original = fs.readFileSync(document);
    fs.writeFileSync(document, Buffer.concat([original, Buffer.from('changed')]));
    assert.throws(() => f.store.recordPublication(f.batchId, f.documentId), code('DOCUMENT_REVIEW_INVALID'));
    assert.equal(fs.existsSync(f.controlFile), false, 'a rejected body does not leak the synchronous owner');
  } finally {
    if (previous === undefined) delete process.env.EU_PRIVACY_DATA_ROOT;
    else process.env.EU_PRIVACY_DATA_ROOT = previous;
  }
});

test('all three productive native methods retain logical ownership across await without a kernel guard', async () => {
  const f = storeFixture(), operation = 'c'.repeat(32);
  f.store.recordPublication(f.batchId, f.documentId);
  const selected = f.selection();
  f.store.decide(f.batchId, f.documentId, { revision: selected[0].revision, output_sha256: selected[0].output_sha256,
    action: 'approve', ranges: [], operation_id: 'd'.repeat(32) });
  const selection = f.selection(); let finish, received;
  f.native(async (_op, command) => {
    received = command;
    if (command === 'write_body') return new Promise(resolve => { finish = resolve; });
    assert.equal(command, 'publish'); return 'completed';
  });
  let before = f.entries();
  const pending = f.store.exportApproved(f.batchId, operation, selection);
  assert.equal(received, 'write_body'); assert.equal(f.held(), false);
  assert.equal(f.entries() - before, 1, 'only acquisition has entered the kernel model');
  assert.throws(() => withSynchronousDocumentControl(f.gate(), token, () => assert.fail('foreign document action')), code('STANDALONE_BUSY'));
  f.refuseNextAdmission(); finish('staged'); assert.equal((await pending).exported_count, 1);
  assert.equal(fs.existsSync(f.controlFile), false);
  f.native(async (_op, command) => { received = command; return new Promise(resolve => { finish = resolve; }); });
  before = f.entries();
  const resolving = f.store.resolveExport(f.batchId, operation);
  assert.equal(received, 'reconcile'); assert.equal(f.entries() - before, 1); assert.equal(f.held(), false);
  assert.equal(fs.existsSync(f.controlFile), true);
  f.refuseNextAdmission(); finish('completed'); assert.equal((await resolving).ok, true); assert.equal(fs.existsSync(f.controlFile), false);
  const incomplete = 'e'.repeat(32), original = Object.assign(Error('synthetic native refusal'), { code: 'AI_EXPORT_UNCERTAIN' });
  f.native(async () => { throw original; });
  await assert.rejects(f.store.exportApproved(f.batchId, incomplete, selection), error => error === original);
  const op = JSON.parse(fs.readFileSync(path.join(f.data, 'document-reviews', f.batchId, `export-${incomplete}.json`), 'utf8'));
  f.native(async (_op, command) => { received = command; return new Promise(resolve => { finish = resolve; }); });
  before = f.entries();
  const abandoning = f.store.abandonExport(f.batchId, incomplete, op.request_sha256);
  assert.equal(received, 'abandon'); assert.equal(f.entries() - before, 1); assert.equal(f.held(), false);
  assert.equal(fs.existsSync(f.controlFile), true);
  f.refuseNextAdmission(); finish('abandoned'); assert.equal((await abandoning).abandoned, true); assert.equal(fs.existsSync(f.controlFile), false);
  assert.equal(f.refusedAdmissions(), 3, 'all three actual Store methods retry a real default-timer release admission');
});

function removeOwnStoreDirectory(target) {
  if (!ownStoreDirectories.has(target) || path.dirname(target) !== root || !path.basename(target).startsWith('store-'))
    throw Error('TEST_CLEANUP_TARGET_INVALID');
  const files = [], directories = [], queue = [{ file: target, depth: 0 }];
  while (queue.length) {
    const { file, depth } = queue.pop(), stat = fs.lstatSync(file), relative = path.relative(target, file);
    if (depth > 12 || files.length + directories.length > 256 || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`) ||
        stat.isSymbolicLink() || !stat.isFile() && !stat.isDirectory()) throw Error('TEST_CLEANUP_TARGET_INVALID');
    if (stat.isFile()) files.push({ file, stat });
    else {
      directories.push({ file, stat });
      for (const name of fs.readdirSync(file)) queue.push({ file: path.join(file, name), depth: depth + 1 });
    }
  }
  for (const { file, stat } of [...files, ...directories.reverse()]) {
    const current = fs.lstatSync(file);
    if (current.isSymbolicLink() || current.dev !== stat.dev || current.ino !== stat.ino || current.isFile() !== stat.isFile())
      throw Error('TEST_CLEANUP_TARGET_CHANGED');
    if (current.isFile()) fs.unlinkSync(file); else fs.rmdirSync(file);
  }
  ownStoreDirectories.delete(target);
}

after(() => {
  for (const directory of ownStoreDirectories) removeOwnStoreDirectory(directory);
  const resolved = fs.realpathSync(root), stat = fs.lstatSync(resolved);
  if (path.dirname(resolved) !== temporary || !path.basename(resolved).startsWith('datasecure-document-control-') ||
      !stat.isDirectory() || stat.isSymbolicLink()) throw Error('TEST_CLEANUP_TARGET_INVALID');
  const entries = fs.readdirSync(resolved);
  if (entries.length) throw Error('TEST_CLEANUP_UNEXPECTED_FILES');
  fs.rmdirSync(resolved);
});
