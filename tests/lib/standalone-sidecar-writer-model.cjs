'use strict';

// ENGINEERING_MODEL / NOT_PRODUCT_ACCEPTANCE. Fake EventEmitter children only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const observer = require('./standalone-sidecar-writer-observer.cjs');
assert.equal(process.argv.length, 2);
const repoRoot = path.resolve(__dirname, '../..');
// Same ignored destination here and after byte-for-byte adoption under tests/lib.
// Never write into __dirname when it is a canonical test-input directory.
const evidenceBase = path.join(repoRoot, 'dist', 'engineering-sidecar-writer-model', 'model-runs');
fs.mkdirSync(evidenceBase, { recursive: true });
const evidence = fs.mkdtempSync(path.join(evidenceBase, 'run-'));
const base = path.join(evidence, 'synthetic-scopes');
assert.equal(fs.existsSync(base), false, 'create-only model evidence; use a fresh implementation directory');
fs.mkdirSync(base);
let nextPid = 800000, passed = 0;
const results = [], scopes = [];
const owned = target => { const relative = path.relative(base, target); assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative)); return target; };
function world(options = {}) {
  const root = owned(path.join(base, `datasecure-standalone-ipc-${crypto.randomBytes(8).toString('hex')}`));
  fs.mkdirSync(root); const caseRoot = path.join(root, 'content-format-workflow'); fs.mkdirSync(caseRoot); scopes.push(root);
  const living = new Set(), sleeps = [], events = [];
  let now = 0, advance, sleepHook;
  const clock = { now: () => now, async sleep(ms) { sleeps.push(ms); now += advance === undefined ? ms : advance; sleepHook?.(); } };
  const api = observer.makeObserver({ fixtureBase: base, clock, alive: value => living.has(value), ...options });
  const scope = api.createScope(caseRoot), hosts = [];
  function host() {
    const generation = api.planHost(scope), child = new EventEmitter(); child.pid = ++nextPid;
    api.attachHost(generation, child); child.emit('spawn');
    const view = new EventEmitter(); view.pid = child.pid;
    const server = path.join(root, 'packaged-server'); view.argv = ['node', path.join(server, 'standalone', 'desktop-sidecar.js')];
    const calls = [], cp = { fork(file, args, opts) { const result = new EventEmitter(); result.pid = ++nextPid;
      result.kill = () => { throw new Error('PID/child kill must not be invoked by observer'); };
      calls.push({ file, args, options: opts, child: result }); return result; } };
    observer.installObserver(generation.environment, view, cp, options.observerIO || fs);
    function worker(role = 'batch') {
      const file = path.join(server, 'gateway', `${role}-worker.js`), args = [];
      const options = { detached: true, execArgv: ['--require=network-deny.cjs'], execPath: 'unchanged-executable',
        cwd: 'unchanged-cwd', stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'json', env: { HOME: 'unchanged-home' } };
      const original = JSON.stringify(options), childWorker = cp.fork(file, args, options), call = calls.at(-1);
      assert.equal(JSON.stringify(options), original); assert.equal(call.file, file); assert.equal(call.args, args);
      for (const key of ['detached', 'execPath', 'cwd', 'stdio', 'serialization']) assert.deepEqual(call.options[key], options[key]);
      assert.equal(call.options.env.HOME, 'unchanged-home');
      assert.equal(call.options.execArgv[0], options.execArgv[0]); assert.equal(call.options.execArgv.length, 2);
      living.add(childWorker.pid); childWorker.emit('spawn');
      const workerView = new EventEmitter(); workerView.pid = childWorker.pid; workerView.argv = ['node', file];
      observer.installObserver(call.options.env, workerView, {}, options.observerIO || fs);
      const id = call.options.env.DATASECURE_TEST_WRITER_WORKER;
      return { child: childWorker, view: workerView, id, role, pid: childWorker.pid,
        exit(code = 0) { workerView.emit('exit', code); childWorker.emit('exit', code, null); living.delete(childWorker.pid); },
        close(code = 0, signal = null) { childWorker.emit('close', code, signal); events.push(`worker-close:${id}`); },
        end() { this.exit(); this.close(); } };
    }
    const value = { generation, child, view, calls, cp, worker,
      close() { view.emit('exit', 0); child.emit('exit', 0, null); child.emit('close', 0, null); events.push('host-close'); } };
    hosts.push(value); return value;
  }
  return { api, scope, root, caseRoot, living, sleeps, events, hosts, host,
    leap(ms) { advance = ms; }, afterSleep(fn) { sleepHook = fn; }, time: () => now,
    names: () => fs.readdirSync(scope.directory),
    record(type, h, w) { return path.join(scope.directory, `${type}-${h.generation.id}${w ? `-${w.id}` : ''}.json`); } };
}
async function test(name, fn) {
  try { await fn(); passed++; results.push({ name, result: 'PASS' }); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { results.push({ name, result: 'FAIL', message: error.message }); throw error; }
}
function code(expected) { return error => error.code === expected; }
async function rejectDrain(w, h, expected = 'WRITER_PROBE_DEADLINE') {
  w.leap(22000); await assert.rejects(w.api.drain(w.scope, h.child), code(expected));
}
async function main() {
  await test('primary and all teardown errors retain exact objects; never remove', async () => {
    const a = new Error('primary'), b = new Error('close'), c = new Error('writer'); let checks = 0, removed = 0, kept = 0;
    await assert.rejects(observer.collectTeardown({ primary: a, checks: [() => { checks++; throw b; }, () => { checks++; throw c; }],
      remove: () => removed++, preserve: () => kept++ }), error => error instanceof AggregateError && error.cause === a &&
        error.errors.length === 3 && error.errors[0] === a && error.errors[1] === b && error.errors[2] === c);
    assert.equal(checks, 2); assert.equal(removed, 0); assert.equal(kept, 1);
  });
  await test('scenario error alone survives identity and forbids even successful removal', async () => {
    const a = new Error('primary'); let removed = 0;
    await assert.rejects(observer.collectTeardown({ primary: a, checks: [async () => {}], remove: () => removed++, preserve() {} }), error => error === a);
    assert.equal(removed, 0);
  });
  await test('caught undefined/null/false remain scenario failures and cannot authorize deletion', async () => {
    for (const original of [undefined, null, false]) {
      let caught = false, caughtValue, removed = 0, kept = 0;
      try { throw original; } catch (primary) {
        try { await observer.collectTeardown({ primary, checks: [], remove: () => removed++, preserve: () => kept++ }); }
        catch (value) { caught = true; caughtValue = value; }
      }
      assert.equal(caught, true); assert.equal(caughtValue, original); assert.equal(removed, 0); assert.equal(kept, 1);
    }
    let removed = 0, kept = 0; const secondary = new Error('secondary');
    await assert.rejects(observer.collectTeardown({ primary: undefined, checks: [() => { throw secondary; }],
      remove: () => removed++, preserve: () => kept++ }), error => error instanceof AggregateError &&
        Object.hasOwn(error, 'cause') && error.cause === undefined && error.errors.length === 2 &&
        error.errors[0] === undefined && error.errors[1] === secondary);
    assert.equal(removed, 0); assert.equal(kept, 1);
  });
  await test('teardown-only failure forbids removal and remains the original error', async () => {
    const b = new Error('teardown'); let removed = 0;
    await assert.rejects(observer.collectTeardown({ checks: [() => { throw b; }], remove: () => removed++, preserve() {} }), error => error === b);
    assert.equal(removed, 0);
  });
  await test('one failed removal is reported without any retry', async () => {
    const b = new Error('remove'); let calls = 0, kept = 0;
    await assert.rejects(observer.collectTeardown({ checks: [], remove() { calls++; throw b; }, preserve() { kept++; } }), error => error === b);
    assert.equal(calls, 1); assert.equal(kept, 1);
  });
  await test('only a clean teardown calls removal exactly once', async () => {
    let calls = 0; await observer.collectTeardown({ checks: [async () => {}], remove: () => calls++, preserve() { assert.fail(); } }); assert.equal(calls, 1);
  });
  await test('real emitter close, not message/disconnect/exit, publishes close evidence', async () => {
    const w = world(), h = w.host(), child = h.worker();
    child.child.emit('message', { type: 'terminal' }); child.child.emit('disconnect'); child.exit();
    assert.equal(fs.existsSync(w.record('exit', h, child)), true); assert.equal(fs.existsSync(w.record('close', h, child)), false);
    await rejectDrain(w, h); child.close();
    assert.equal(fs.existsSync(w.record('close', h, child)), true);
  });
  await test('fork spawnError then close preserves primary error and later product listeners', async () => {
    const w = world(), h = w.host(), primary = new Error('actual spawn error'), delivered = [];
    const file = path.join(w.root, 'packaged-server/gateway/batch-worker.js');
    const child = h.cp.fork(file, [], { execArgv: ['--require=network-deny.cjs'], env: {} });
    child.once('error', error => delivered.push(error));
    child.once('close', (status, signal) => delivered.push({ status, signal }));
    assert.doesNotThrow(() => child.emit('error', primary));
    assert.doesNotThrow(() => child.emit('close', -2, null));
    assert.equal(delivered[0], primary); assert.deepEqual(delivered[1], { status: -2, signal: null });
    assert.equal(w.names().filter(name => name.startsWith('error-')).length, 1);
    assert.equal(w.names().filter(name => name.startsWith('close-')).length, 0);
    await assert.rejects(w.api.drain(w.scope, h.child), code('WRITER_PROBE_WORKER_ERROR'));
    assert.equal(w.sleeps.length, 0);
  });
  await test('observer receipt IO failure cannot replace the product spawnError or skip its close listener', async () => {
    const observerIO = { ...fs, openSync(file, flags, mode) {
      if (path.basename(file).startsWith('error-')) throw new Error('synthetic observer IO failure');
      return fs.openSync(file, flags, mode);
    } };
    const w = world({ observerIO }), h = w.host(), original = new Error('product spawnError'), delivered = [];
    const child = h.cp.fork(path.join(w.root, 'packaged-server/gateway/batch-worker.js'), [], { execArgv: [], env: {} });
    child.once('error', error => delivered.push(error)); child.once('close', () => delivered.push('product close'));
    assert.doesNotThrow(() => child.emit('error', original)); assert.doesNotThrow(() => child.emit('close', -2, null));
    assert.deepEqual(delivered, [original, 'product close']);
    h.close(); const seal = JSON.parse(fs.readFileSync(path.join(w.scope.directory, `seal-${h.generation.id}.json`)));
    assert.equal(seal.observer_failed, true); assert.equal(w.names().filter(name => name.startsWith('close-')).length, 0);
    assert.throws(() => w.api.assertAllClosed(w.scope));
  });
  await test('both roles and multiple generations require all unique worker close receipts', async () => {
    const w = world(), h1 = w.host(), a = h1.worker('batch'), b = h1.worker('review'); a.end(); b.end();
    assert.notEqual(a.id, b.id); await w.api.drain(w.scope, h1.child); h1.close(); w.api.assertClosedGeneration(w.scope, h1.child);
    const h2 = w.host(), c = h2.worker('batch'); c.end(); await w.api.drain(w.scope, h2.child); h2.close();
    assert.deepEqual({ ...w.api.assertAllClosed(w.scope), readBytes: 0 }, { hosts: 2, workers: 3, readBytes: 0 });
    assert.equal(w.names().filter(name => name.startsWith('close-')).length, 3);
  });
  await test('one missing close among multiple workers blocks every-generation proof', async () => {
    const w = world(), h = w.host(), a = h.worker(), b = h.worker('review'); a.end(); b.exit();
    await rejectDrain(w, h); assert.equal(w.names().filter(name => name.startsWith('close-')).length, 1);
    h.close(); assert.throws(() => w.api.assertAllClosed(w.scope));
  });
  await test('parent closed then independent worker exit remains exit, never close', async () => {
    const w = world(), h = w.host(), a = h.worker(); h.close(); a.exit();
    assert.equal(fs.existsSync(w.record('exit', h, a)), true); assert.equal(fs.existsSync(w.record('close', h, a)), false);
    await assert.rejects(w.api.drain(w.scope, h.child), code('WRITER_PROBE_HOST_CLOSED_BEFORE_DRAIN'));
    assert.throws(() => w.api.assertAllClosed(w.scope));
  });
  await test('original child close remains proof when another process reuses its numeric pid', async () => {
    const w = world(), h = w.host(), a = h.worker(); a.exit(); a.close(); w.living.add(a.pid);
    await w.api.drain(w.scope, h.child); h.close();
    assert.equal(w.api.assertAllClosed(w.scope).workers, 1);
  });
  await test('all workers share one original deadline even when late metadata arrives', async () => {
    const w = world(), h = w.host(), a = h.worker(), b = h.worker(); a.end();
    w.leap(22000); await assert.rejects(w.api.drain(w.scope, h.child), code('WRITER_PROBE_DEADLINE'));
    b.end(); assert.equal(w.time(), 22000); assert.equal(w.sleeps.length, 1);
  });
  await test('successful writer completion arriving at the deadline is not accepted', async () => {
    const w = world(), h = w.host(), child = h.worker(); w.leap(22000); w.afterSleep(() => child.end());
    await assert.rejects(w.api.drain(w.scope, h.child), code('WRITER_PROBE_DEADLINE'));
    assert.equal(w.time(), 22000); assert.equal(w.sleeps.length, 1);
  });
  await test('original child close is used without querying an unrelated late pid', async () => {
    const e = Object.assign(new Error('uncertain synthetic liveness'), { code: 'EPERM' });
    const w = world({ alive() { throw e; } }), h = w.host(); h.worker().end();
    await w.api.drain(w.scope, h.child); h.close();
    assert.equal(w.api.assertAllClosed(w.scope).workers, 1);
  });
  await test('drain precedes shutdown/hostclose/restart and seals exact census', async () => {
    const w = world(), h = w.host(), a = h.worker(); a.end(); await w.api.drain(w.scope, h.child); w.events.push('drain');
    w.events.push('shutdown'); h.close(); w.api.assertClosedGeneration(w.scope, h.child); w.events.push('verified');
    w.host(); w.events.push('restart');
    assert.deepEqual(w.events, [`worker-close:${a.id}`, 'drain', 'shutdown', 'host-close', 'verified', 'restart']);
  });
  await test('late additional worker after drain cannot disappear from final census', async () => {
    const w = world(), h = w.host(), a = h.worker(); a.end(); await w.api.drain(w.scope, h.child);
    h.worker('review').end(); h.close(); assert.throws(() => w.api.assertAllClosed(w.scope), code('WRITER_PROBE_CENSUS'));
  });
  await test('host exit seal alone is not the parent-observed host close', async () => {
    const w = world(), h = w.host(); h.worker().end(); await w.api.drain(w.scope, h.child);
    h.view.emit('exit', 0); h.child.emit('exit', 0, null); assert.throws(() => w.api.assertAllClosed(w.scope), code('WRITER_PROBE_HOST_NOT_CLOSED'));
  });
  await test('unattached planned generation cannot be silently skipped', async () => {
    const w = world(), h = w.host(); h.worker().end(); await w.api.drain(w.scope, h.child); h.close();
    w.api.planHost(w.scope); assert.throws(() => w.api.assertAllClosed(w.scope), code('WRITER_PROBE_HOST_NOT_CLOSED'));
  });
  await test('eight restart generations preserve all sixteen batch/review writer identities', async () => {
    const w = world(); const ids = [];
    for (let i = 0; i < 8; i++) {
      const h = w.host(); for (const role of ['batch', 'review']) { const child = h.worker(role); ids.push(child.id); child.end(); }
      await w.api.drain(w.scope, h.child); h.close(); w.api.assertClosedGeneration(w.scope, h.child);
    }
    const proof = w.api.assertAllClosed(w.scope); assert.equal(proof.hosts, 8); assert.equal(proof.workers, 16);
    assert.equal(new Set(ids).size, 16); assert.equal(w.names().filter(name => name.startsWith('close-')).length, 16);
  });
  await test('host-generation cap cannot be enlarged or silently truncated', async () => {
    const w = world({ limits: { hosts: 2 } }); w.host(); w.host();
    assert.throws(() => w.api.planHost(w.scope), code('WRITER_PROBE_HOST_BUDGET'));
    assert.throws(() => world({ limits: { hosts: 33 } }), code('WRITER_PROBE_LIMITS'));
  });
  await test('empty observer cannot vacuously permit cleanup', async () => {
    const w = world(), h = w.host(); await w.api.drain(w.scope, h.child); h.close();
    assert.throws(() => w.api.assertAllClosed(w.scope), code('WRITER_PROBE_EMPTY'));
  });
  await test('non-role fork is forwarded unchanged and creates no false writer record', async () => {
    const w = world(), h = w.host(), args = ['same'], options = { marker: 'same' };
    h.cp.fork(path.join(w.root, 'not-a-role.js'), args, options);
    assert.equal(h.calls.at(-1).args, args); assert.equal(h.calls.at(-1).options, options);
    assert.equal(w.names().filter(name => name.startsWith('intent-')).length, 0);
  });
  await test('unexpected metadata name is a hard error, not ignored or polled', async () => {
    const w = world(), h = w.host(); h.worker().end(); fs.writeFileSync(path.join(w.scope.directory, 'unknown.json'), '{}', { flag: 'wx' });
    await assert.rejects(w.api.drain(w.scope, h.child), code('WRITER_PROBE_NAME')); assert.equal(w.sleeps.length, 0);
  });
  await test('hardlinked receipt is refused by actual bound-file IO', async () => {
    const w = world(), h = w.host(), a = h.worker(); a.end();
    fs.linkSync(w.record('close', h, a), owned(path.join(w.root, 'synthetic-hardlink')));
    await assert.rejects(w.api.drain(w.scope, h.child), code('BOUND_FILE_UNSAFE')); assert.equal(w.sleeps.length, 0);
  });
  await test('original directory replacement is rejected, never rebound', async () => {
    const w = world(), h = w.host(); h.worker().end();
    const retired = owned(`${w.scope.directory}-retired`); owned(w.scope.directory); fs.renameSync(w.scope.directory, retired); fs.mkdirSync(w.scope.directory);
    await assert.rejects(w.api.drain(w.scope, h.child), code('BOUND_FILE_CHANGED'));
  });
  await test('replacement junction/symlink stays refused and is retained as synthetic evidence', async () => {
    const w = world(), h = w.host(); h.worker().end();
    const retired = owned(`${w.scope.directory}-retired`); fs.renameSync(owned(w.scope.directory), retired);
    fs.symlinkSync(retired, owned(w.scope.directory), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(w.api.drain(w.scope, h.child), code('BOUND_FILE_CHANGED'));
  });
  await test('read work budget fails without a sleep or descriptor leak', async () => {
    const w = world({ limits: { readBytes: 1 } }), h = w.host(); h.worker().end();
    await assert.rejects(w.api.drain(w.scope, h.child)); assert.equal(w.sleeps.length, 0);
  });
  await test('held descriptor close failure is never polled or accepted', async () => {
    const reads = new Set(); let failClose = false;
    const io = { ...fs, openSync(file, flags, mode) { const fd = fs.openSync(file, flags, mode); if (!(flags & fs.constants.O_WRONLY)) reads.add(fd); return fd; },
      closeSync(fd) { const read = reads.delete(fd); fs.closeSync(fd); if (read && failClose) throw new Error('synthetic close failure'); } };
    const w = world({ io }), h = w.host(); h.worker().end(); failClose = true;
    await assert.rejects(w.api.drain(w.scope, h.child), code('BOUND_FILE_CLOSE_FAILED'));
    assert.equal(reads.size, 0); assert.equal(w.sleeps.length, 0);
  });
  await test('record replacement after observed drain cannot regain authority', async () => {
    const w = world(), h = w.host(), a = h.worker(); a.end(); await w.api.drain(w.scope, h.child);
    const file = w.record('close', h, a), saved = fs.readFileSync(file);
    fs.renameSync(owned(file), owned(path.join(w.root, 'retired-close.json'))); fs.writeFileSync(file, saved, { flag: 'wx' }); h.close();
    assert.throws(() => w.api.assertAllClosed(w.scope), code('WRITER_PROBE_RECORD_CHANGED'));
  });
}
main().then(() => {
  const report = { classification: 'ENGINEERING_MODEL/NOT_PRODUCT_ACCEPTANCE', native_acceptance: 'NOT_RUN', real_workers_started: 0,
    passed, failed: 0, scopes_retained: scopes, cases: results };
  report.module_sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'standalone-sidecar-writer-observer.cjs'))).digest('hex');
  report.model_sha256 = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
  report.node_version = process.version;
  report.source_bindings = Object.fromEntries(['tests/test-standalone-sidecar.js', 'plugins/data-secure/server/core/bound-file-io.js',
    'plugins/data-secure/server/background-role-launcher.js', 'plugins/data-secure/server/standalone/desktop-sidecar.js']
    .map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, name))).digest('hex')]));
  fs.writeFileSync(path.join(evidence, 'RESULT.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  process.stdout.write(`ENGINEERING_MODEL PASS ${passed}; real_workers=0; scopes retained at ${evidence}\n`);
}, error => {
  fs.writeFileSync(path.join(evidence, 'FAILURE.json'), JSON.stringify({ classification: 'ENGINEERING_MODEL/NOT_PRODUCT_ACCEPTANCE',
    passed, failed: 1, error: { code: error.code, message: error.message, stack: error.stack }, cases: results, scopes_retained: scopes }, null, 2), { flag: 'wx' });
  console.error(error); process.exitCode = 1;
});
