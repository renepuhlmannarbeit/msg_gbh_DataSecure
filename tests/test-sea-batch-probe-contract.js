'use strict';

// Cheap, fail-closed contracts only. No SEA binary, worker, GUI, keyring or
// production credential store is ever invoked by this suite. These tests are
// not evidence of a successful native document batch or operating-system crash.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createSuite } = require('./helpers');

const { test, testAsync, done, assert } = createSuite('SEA batch acceptance probe (negative VM contracts only)');
const moduleFile = path.join(__dirname, '../plugins/data-secure/server/sea-batch-probe.js');
const source = fs.readFileSync(moduleFile, 'utf8');
const flag = '--datasecure-batch-acceptance-probe';
const executable = path.join(os.tmpdir(), 'synthetic-sea-contract', 'datasecure-mcp.exe');

function fixture(options = {}) {
  const state = { imports: [], output: '', errors: '', sent: [], writes: [], timers: new Set() };
  // Even a regressed scope check may not alter real filesystem state. Only
  // this test file creates/removes its own explicitly tracked temp fixtures.
  const guardedFs = { ...fs };
  for (const method of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'mkdtempSync',
    'renameSync', 'unlinkSync', 'rmSync', 'rmdirSync', 'symlinkSync', 'linkSync',
    'chmodSync', 'chownSync', 'copyFileSync', 'cpSync', 'truncateSync']) {
    guardedFs[method] = (...args) => { state.writes.push({ method, target: args[0] }); throw new Error('PROBE_WRITE_CAPTURED'); };
  }
  guardedFs.openSync = (file, flags, ...args) => {
    const writeMask = fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT |
      fs.constants.O_TRUNC | fs.constants.O_APPEND;
    if (flags !== 'r' && !(Number.isInteger(flags) && (flags & writeMask) === 0)) {
      state.writes.push({ method: 'openSync', target: file }); throw new Error('PROBE_WRITE_CAPTURED');
    }
    return fs.openSync(file, flags, ...args);
  };
  const processStub = Object.assign(new EventEmitter(), {
    platform: 'win32', arch: 'x64', execPath: executable,
    argv: [executable, executable, flag], env: { ...(options.env || {}) },
    connected: true, channel: {},
    send(frame, callback) { state.sent.push(frame); callback?.(); },
    stdout: { write(value) { state.output += value; } },
    stderr: { write(value) { state.errors += value; } },
    exit() { throw new Error('UNEXPECTED_PROCESS_EXIT'); },
    ...(options.process || {})
  });
  const module = { exports: {} };
  const sandbox = {
    module, exports: module.exports, __dirname: path.dirname(moduleFile),
    process: processStub, Buffer, URL, setImmediate, clearImmediate,
    setTimeout(callback, milliseconds, ...args) {
      if (options.clock) return options.clock.setTimeout(callback, milliseconds, ...args);
      const timer = setTimeout(() => { state.timers.delete(timer); callback(...args); }, milliseconds);
      state.timers.add(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (options.clock) return options.clock.clearTimeout(timer);
      state.timers.delete(timer); clearTimeout(timer);
    },
    require(name) {
      if (name === 'node:sea') return { isSea: () => options.sea !== false };
      if (name === 'node:fs' || name === 'fs') return guardedFs;
      if (['node:os', 'node:path', 'node:crypto', 'node:util', 'node:assert',
        'os', 'path', 'crypto', 'util', 'assert'].includes(name)) return require(name);
      state.imports.push(name);
      throw new Error('PRODUCT_IMPORT_FORBIDDEN_IN_NEGATIVE_TEST');
    }
  };
  // Private functions are exposed inside this VM only. Product exports and
  // runtime source stay unchanged; no injected code enters a native process.
  vm.runInNewContext(`${source}\nglobalThis.__lifecycleForTest = { observeWorker, waitForStart, validateScope };`,
    sandbox, { filename: moduleFile, timeout: 1000 });
  return {
    api: module.exports, lifecycle: sandbox.__lifecycleForTest, process: processStub, state,
    dispose() {
      for (const timer of state.timers) clearTimeout(timer);
      state.timers.clear();
      options.clock?.clear();
    }
  };
}

async function refused(options = {}, frame) {
  const value = fixture(options);
  let watchdog;
  try {
    const operation = Promise.resolve().then(() => value.api.runSeaBatchProbe());
    if (arguments.length > 1) queueMicrotask(() => value.process.emit('message', frame));
    await assert.rejects(Promise.race([
      operation,
      new Promise((resolve, reject) => { watchdog = setTimeout(() => reject(new Error('TEST_PROBE_DID_NOT_REJECT')), 1000); })
    ]), (error) => {
      assert.match(error?.message || '', /^SEA_BATCH_[A-Z_]+$/u, 'rejection must expose only a fixed probe code');
      if (options.expectedError) assert.strictEqual(error.message, options.expectedError);
      return true;
    });
    assert.deepStrictEqual(value.state.imports, options.expectedImports || [], 'reject before any worker, gateway or keyring import');
    assert.deepStrictEqual(value.state.writes, [], 'reject before creating fixtures, credentials or other output');
    assert.strictEqual(value.state.output, '');
    assert.strictEqual(value.state.errors, '');
    assert.deepStrictEqual(value.state.sent, [], 'invalid start must send no private data or positive result');
  } finally {
    clearTimeout(watchdog);
    value.dispose();
  }
}

test('fixed internal entry has no host-process, script or credential-test escape hatch', () => {
  assert.match(source, /runSeaBatchProbe/u);
  assert.match(source, /--datasecure-batch-acceptance-probe/u);
  assert.doesNotMatch(source, /private-artifact-test-runtime|installBatchPrivateArtifactCrypto|DATASECURE_TEST_CRASH_AT/u);
  assert.doesNotMatch(source, /\b(?:eval|execSync|execFileSync|spawnSync)\s*\(/u);
  assert.doesNotMatch(source, /\b(?:convertDocument|spawn|execPath|launcherPath)\s*:\s*(?:async\b|\([^)]*\)\s*=>|function\b)/u);
  assert.doesNotMatch(source, /console\.(?:log|error)|process\.(?:stdout|stderr)\.write/u,
    'only the enclosing fixed bootstrap may serialize a bounded report');
});

async function withScope(operation, scenario = 'positive') {
  assert.ok(['positive', 'disconnect', 'worker-resume'].includes(scenario));
  const tempBase = fs.realpathSync(os.tmpdir());
  const base = fs.mkdtempSync(path.join(tempBase, 'datasecure-sea-batch-'));
  const root = path.join(base, `case-${scenario}`);
  fs.mkdirSync(root);
  const marker = path.join(root, 'acceptance-scope.json');
  const entries = [];
  const env = { LOCALAPPDATA: path.join(root, 'localapp'), EU_PRIVACY_ROOT: path.join(root, 'privacy') };
  const frame = { type: 'start-sea-batch-acceptance', scenario, root,
    isolated_test_account_acknowledged: true };
  const scope = {
    root, marker, env, frame,
    file(name, text) {
      assert.ok(['acceptance-scope.json', 'unexpected.txt'].includes(name));
      const target = path.join(root, name);
      fs.writeFileSync(target, text, { flag: 'wx', mode: 0o600 });
      entries.push({ target, type: 'file' });
      return target;
    },
    markerDirectory() {
      fs.mkdirSync(marker);
      entries.push({ target: marker, type: 'directory' });
    }
  };
  try { await operation(scope); }
  finally {
    // No recursive removal, glob or process-environment-derived cleanup target.
    // These exact paths were created above; the sandbox denies probe mutation.
    assert.strictEqual(path.dirname(base), tempBase);
    assert.match(path.basename(base), /^datasecure-sea-batch-[A-Za-z0-9]+$/u);
    for (const { target, type } of entries.reverse()) {
      assert.strictEqual(path.dirname(target), root);
      const stat = fs.lstatSync(target);
      assert.strictEqual(stat.isSymbolicLink(), false);
      if (type === 'file') { assert.strictEqual(stat.isFile(), true); fs.unlinkSync(target); }
      else { assert.strictEqual(stat.isDirectory(), true); fs.rmdirSync(target); }
    }
    for (const directory of [root, base]) {
      const stat = fs.lstatSync(directory);
      assert.strictEqual(stat.isSymbolicLink(), false);
      assert.strictEqual(stat.isDirectory(), true);
      fs.rmdirSync(directory);
    }
  }
}

function fakeClock() {
  let now = 0;
  let serial = 0;
  const timers = new Map();
  return {
    setTimeout(callback, milliseconds, ...args) {
      const id = ++serial;
      timers.set(id, { due: now + milliseconds, run: () => callback(...args) });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    clear() { timers.clear(); },
    get pending() { return timers.size; },
    tick(milliseconds) {
      const end = now + milliseconds;
      let iterations = 0;
      for (;;) {
        const next = [...timers.entries()].filter(([, timer]) => timer.due <= end)
          .sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
        if (!next) break;
        assert.ok(++iterations < 100, 'virtual timers must not busy-loop');
        const [id, timer] = next;
        timers.delete(id);
        now = timer.due;
        timer.run();
      }
      now = end;
    }
  };
}

function workerFixture(overrides = {}) {
  const child = Object.assign(new EventEmitter(), {
    pid: 12345, connected: true, exitCode: null, signalCode: null, kills: 0,
    kill() { this.kills++; return true; }, ...overrides
  });
  child.exitNow = (code = 0, signal = null) => {
    child.exitCode = code;
    child.signalCode = signal;
    child.emit('exit', code, signal);
  };
  child.disconnectNow = () => { child.connected = false; child.emit('disconnect'); };
  return child;
}

async function pending(promise) {
  let settled = false;
  promise.then(() => { settled = true; }, () => { settled = true; });
  for (let index = 0; index < 4; index++) await Promise.resolve();
  assert.strictEqual(settled, false, 'an error, disconnect or kill request is not an OS-exit proof');
}

async function bounded(promise) {
  let watchdog;
  try {
    return await Promise.race([promise, new Promise((resolve, reject) => {
      watchdog = setTimeout(() => reject(new Error('TEST_LIFECYCLE_DID_NOT_SETTLE')), 1000);
    })]);
  } finally { clearTimeout(watchdog); }
}

async function lifecycleTest(operation) {
  const clock = fakeClock();
  const value = fixture({ clock });
  try { await operation(value.lifecycle, clock, value); }
  finally {
    assert.deepStrictEqual(value.state.imports, []);
    assert.deepStrictEqual(value.state.writes, []);
    assert.strictEqual(value.state.output, '');
    assert.strictEqual(value.state.errors, '');
    value.dispose();
  }
}

async function main() {
  const invalidContexts = [
    ['not a native SEA', { sea: false }],
    ['macOS is not falsely proved by Windows probe', { process: { platform: 'darwin' } }],
    ['Linux is not falsely proved by Windows probe', { process: { platform: 'linux' } }],
    ['arm64 is not the fixed Windows x64 target', { process: { arch: 'arm64' } }],
    ['missing live IPC channel', { process: { channel: null } }],
    ['disconnected IPC', { process: { connected: false } }],
    ['nonboolean IPC connected', { process: { connected: 'true' } }],
    ['missing IPC sender', { process: { send: undefined } }],
    ['unexpected argument', { process: { argv: [executable, executable, flag, 'private-source.txt'] } }],
    ['different fixed flag', { process: { argv: [executable, executable, '--eval=private'] } }],
    ['different argv entry', { process: { argv: [executable, 'private-script.js', flag] } }]
  ];
  for (const [name, options] of invalidContexts) {
    await testAsync(`${name}: rejected before product imports`, () => refused(options));
  }

  const validFrame = {
    type: 'start-sea-batch-acceptance', scenario: 'positive',
    root: path.join(os.tmpdir(), 'datasecure-sea-batch-contract', 'case-positive'),
    isolated_test_account_acknowledged: true
  };
  const invalidFrames = [
    ['null', null], ['array', []], ['wrong start type', { ...validFrame, type: 'start-local-intake' }],
    ['unknown scenario', { ...validFrame, scenario: 'run-anything' }],
    ['source argument injection', { ...validFrame, source: 'private-source.docx' }],
    ['missing explicit account acknowledgement', { ...validFrame, isolated_test_account_acknowledged: undefined }],
    ['false account acknowledgement', { ...validFrame, isolated_test_account_acknowledged: false }],
    ['string account acknowledgement', { ...validFrame, isolated_test_account_acknowledged: 'true' }],
    ['relative root', { ...validFrame, root: 'case-positive' }]
  ];
  for (const [name, frame] of invalidFrames) {
    await testAsync(`${name}: invalid frame cannot reach the keyring`, () => refused({}, frame));
  }

  await testAsync('real fresh temp scope without marker stops before filesystem mutation or product import', () =>
    withScope(({ env, frame }) => refused({ env }, frame)));
  await testAsync('malformed scope JSON stays local and is never forwarded as diagnostics', () =>
    withScope(({ file, env, frame }) => {
      file('acceptance-scope.json', '{"private-marker-canary":');
      return refused({ env }, frame);
    }));
  await testAsync('a directory masquerading as the required scope file stops before product import', () =>
    withScope(({ markerDirectory, env, frame }) => {
      markerDirectory();
      return refused({ env }, frame);
    }));
  await testAsync('a reused, occupied scope without a valid marker cannot start an acceptance run', () =>
    withScope(({ file, env, frame }) => {
      file('acceptance-scope.json', '{}');
      file('unexpected.txt', 'synthetic scope canary');
      return refused({ env }, frame);
    }));
  await testAsync('missing privacy environment cannot redirect a probe to the real product store', () =>
    withScope(({ frame }) => refused({}, frame)));
  await testAsync('environment pointing outside the exact scope is refused before product import', () =>
    withScope(({ env, frame, root }) => refused({ env: {
      ...env, LOCALAPPDATA: path.dirname(root), EU_PRIVACY_ROOT: path.dirname(root)
    } }, frame)));
  await testAsync('a scenario/root-name mismatch is refused before product import', () =>
    withScope(({ env, frame }) => refused({ env }, { ...frame, scenario: 'disconnect' })));

  await testAsync('valid worker-resume scope still requires immutable network deny before worker or keyring import', () =>
    withScope(({ file, env, frame }) => {
      file('acceptance-scope.json', JSON.stringify({ schema: 'datasecure-sea-batch-scope/v1',
        scenario: 'worker-resume', isolated_test_account_acknowledged: true }));
      const validated = fixture({ env });
      try { validated.lifecycle.validateScope(frame); }
      finally { validated.dispose(); }
      return refused({ env, expectedError: 'SEA_BATCH_PROBE_FAILED', expectedImports: ['./network-deny.cjs'] }, frame);
    }, 'worker-resume'));

  await testAsync('asynchronous error without a PID settles as never started and is never killed', () =>
    lifecycleTest(async ({ observeWorker }, clock) => {
      const child = workerFixture({ pid: undefined });
      const observed = observeWorker(child);
      child.emit('error', new Error('synthetic native path must not escape'));
      const result = await bounded(observed.completion);
      assert.strictEqual(result.neverStarted, true);
      assert.strictEqual(result.errored, true);
      assert.strictEqual(result.code, null);
      assert.strictEqual(result.signal, null);
      assert.strictEqual(observed.cleanupSafe, true);
      child.emit('error', new Error('late duplicate error is still consumed'));
      await bounded(observed.stop());
      assert.strictEqual(child.kills, 0);
      assert.strictEqual(clock.pending, 0);
    }));
  await testAsync('error with a PID retains ownership until actual exit and disconnect', () =>
    lifecycleTest(async ({ observeWorker }) => {
      const child = workerFixture();
      const observed = observeWorker(child);
      child.emit('error', new Error('synthetic IPC error'));
      await pending(observed.completion);
      assert.strictEqual(observed.cleanupSafe, false);
      const stopping = observed.stop();
      assert.strictEqual(child.kills, 1);
      child.disconnectNow();
      await pending(stopping);
      assert.strictEqual(observed.cleanupSafe, false);
      child.exitNow(null, 'SIGTERM');
      await bounded(stopping);
      const result = await bounded(observed.completion);
      assert.strictEqual(result.errored, true);
      assert.strictEqual(result.neverStarted, false);
      assert.strictEqual(result.signal, 'SIGTERM');
      assert.strictEqual(observed.cleanupSafe, true);
    }));
  await testAsync('disconnect alone never permits cleanup or implies worker completion', () =>
    lifecycleTest(async ({ observeWorker }) => {
      const child = workerFixture();
      const observed = observeWorker(child);
      child.disconnectNow();
      await pending(observed.completion);
      assert.strictEqual(observed.cleanupSafe, false);
      child.exitNow();
      assert.strictEqual((await bounded(observed.completion)).code, 0);
      assert.strictEqual(observed.cleanupSafe, true);
      assert.strictEqual(child.kills, 0);
    }));
  for (const order of [['exit', 'disconnect'], ['disconnect', 'exit']]) {
    await testAsync(`${order.join(' then ')} settles only after both observed events`, () =>
      lifecycleTest(async ({ observeWorker }, clock) => {
        const child = workerFixture();
        const observed = observeWorker(child);
        child[`${order[0]}Now`]();
        await pending(observed.completion);
        assert.strictEqual(observed.cleanupSafe, false);
        child[`${order[1]}Now`]();
        const result = await bounded(observed.completion);
        assert.strictEqual(result.code, 0);
        assert.strictEqual(result.errored, false);
        assert.strictEqual(result.neverStarted, false);
        await bounded(observed.stop());
        assert.strictEqual(child.kills, 0);
        assert.strictEqual(clock.pending, 0);
      }));
  }
  await testAsync('concurrent or repeated stop requests kill the owned worker at most once', () =>
    lifecycleTest(async ({ observeWorker }, clock) => {
      const child = workerFixture();
      const observed = observeWorker(child);
      const first = observed.stop();
      const second = observed.stop();
      assert.strictEqual(child.kills, 1);
      assert.strictEqual(observed.cleanupSafe, false);
      child.exitNow(null, 'SIGTERM');
      child.disconnectNow();
      await bounded(Promise.all([first, second]));
      await bounded(observed.stop());
      assert.strictEqual(child.kills, 1);
      assert.strictEqual(clock.pending, 0);
    }));
  for (const terminal of [{ exitCode: 0 }, { signalCode: 'SIGTERM' }]) {
    await testAsync(`already populated ${Object.keys(terminal)[0]} prevents a stale PID kill`, () =>
      lifecycleTest(async ({ observeWorker }) => {
        const child = workerFixture(terminal);
        const observed = observeWorker(child);
        const stopping = observed.stop();
        assert.strictEqual(child.kills, 0);
        await pending(stopping);
        assert.strictEqual(observed.cleanupSafe, false);
        child.exitNow(terminal.exitCode ?? null, terminal.signalCode ?? null);
        child.disconnectNow();
        await bounded(stopping);
        assert.strictEqual(child.kills, 0);
        assert.strictEqual(observed.cleanupSafe, true);
      }));
  }
  await testAsync('missing actual exit produces cleanup-pending at exactly the virtual five-second deadline', () =>
    lifecycleTest(async ({ observeWorker }, clock) => {
      const child = workerFixture();
      const observed = observeWorker(child);
      child.disconnectNow();
      const stopping = observed.stop();
      const rejection = assert.rejects(bounded(stopping), /SEA_BATCH_CLEANUP_PENDING/u);
      assert.strictEqual(child.kills, 1);
      clock.tick(4999);
      await pending(stopping);
      assert.strictEqual(observed.cleanupSafe, false);
      clock.tick(1);
      await rejection;
      assert.strictEqual(observed.cleanupSafe, false);
      assert.strictEqual(clock.pending, 0);
      child.exitNow(null, 'SIGTERM');
      await bounded(observed.completion);
      assert.strictEqual(observed.cleanupSafe, true);
      await bounded(observed.stop());
      assert.strictEqual(child.kills, 1);
    }));
  await testAsync('a throwing kill does not invent cleanup success or repeatedly target the same PID', () =>
    lifecycleTest(async ({ observeWorker }, clock) => {
      const child = workerFixture({ kill() { this.kills++; throw new Error('synthetic kill refused'); } });
      const observed = observeWorker(child);
      const stopping = observed.stop();
      const rejection = assert.rejects(bounded(stopping), /SEA_BATCH_CLEANUP_PENDING/u);
      clock.tick(5000);
      await rejection;
      assert.strictEqual(child.kills, 1);
      assert.strictEqual(observed.cleanupSafe, false);
      child.exitNow(); child.disconnectNow();
      await bounded(observed.stop());
      assert.strictEqual(child.kills, 1);
    }));
  await testAsync('disconnect during the start wait rejects promptly and removes all wait listeners', () =>
    lifecycleTest(async ({ waitForStart }, clock, value) => {
      const waiting = waitForStart();
      const rejection = assert.rejects(bounded(waiting), /SEA_BATCH_START_INVALID/u);
      assert.strictEqual(clock.pending, 1);
      value.process.emit('disconnect');
      await rejection;
      assert.strictEqual(clock.pending, 0);
      assert.strictEqual(value.process.listenerCount('message'), 0);
      assert.strictEqual(value.process.listenerCount('disconnect'), 0);
      value.process.emit('message', { secret: 'must not revive the settled wait' });
    }));
  await testAsync('missing start frame expires after virtual thirty seconds without any imports', () =>
    lifecycleTest(async ({ waitForStart }, clock, value) => {
      const waiting = waitForStart();
      const rejection = assert.rejects(bounded(waiting), /SEA_BATCH_START_TIMEOUT/u);
      clock.tick(29999);
      await pending(waiting);
      clock.tick(1);
      await rejection;
      assert.strictEqual(clock.pending, 0);
      assert.strictEqual(value.process.listenerCount('message'), 0);
      assert.strictEqual(value.process.listenerCount('disconnect'), 0);
    }));
  done();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
