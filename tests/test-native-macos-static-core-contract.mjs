// Host-independent SOURCE MODELS, not native macOS results.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { types } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseNativeMacArgs, preflightNativeMacGate, cleanNativeMacEnvironment, readNativeMacReceipt,
  runNativeMacGate } from './test-native-macos-static-core.mjs';
const directory = path.dirname(fileURLToPath(import.meta.url));
const app = '/synthetic/DataSecure Standalone.app';
const pin = 'a'.repeat(64), artifactPin = 'b'.repeat(64);
const fail = code => Object.assign(Error(code), { code });
function capture(callback) { try { return { threw: false, value: callback() }; } catch (value) { return { threw: true, value }; } }
function preflightModel(failAt) {
  const calls = [], checked = name => { calls.push(name); if (failAt === name) throw fail('MODEL_REJECTED'); };
  const build = { artifactSha256: artifactPin, artifact: { role: 'mutating-core', target: 'macos-arm64', core: { sha256: pin } } };
  const services = {
    bound: { bindDirectory(value) { checked('bind'); assert.equal(value, app); return { real: value }; },
      assertDirectory() { checked('directory'); }, readBoundFile(value, options) { checked('desktop');
        assert.equal(value, app + '/Contents/MacOS/datasecure-standalone'); assert.equal(options.checkCtime, true); return Buffer.alloc(1024); } },
    standaloneBuildFingerprint(root) { checked('fingerprint'); assert.equal(root, '/checkout'); return { fingerprint: 'c'.repeat(64) }; },
    loadMacStaticCore(...args) { checked('approved'); assert.deepEqual(args, ['/checkout', 'macos-arm64']); return build; },
    assertMacCoreBundle(value, loaded) { checked('bundle'); assert.equal(value, app); assert.equal(loaded, build); },
    assertStandaloneBuildFingerprint() { checked('marker'); },
    assertStandaloneSourceUnchanged() { checked('source'); },
    assertStandaloneRuntimeSource(value) { checked('runtime'); assert.equal(value, app + '/Contents/Resources/server'); },
    verifyMacBundleSeal(value, loaded) { checked('seal'); assert.equal(value, app); assert.equal(loaded, build); }
  };
  return { calls, build, services, run: () => preflightNativeMacGate({ app, target: 'macos-arm64' }, services, '/checkout') };
}
test('MODEL: explicit app/target for matching native Darwin host, no Windows native PASS', async () => {
  for (const arch of ['arm64', 'x64']) {
    const args = ['--app', app, '--target', 'macos-' + arch];
    assert.deepEqual(parseNativeMacArgs(args, { platform: 'darwin', arch }), { app, target: 'macos-' + arch });
    for (const platform of ['win32', 'linux', 'freebsd'])
      assert.throws(() => parseNativeMacArgs(args, { platform, arch }), { code: 'MAC_NATIVE_HOST_REQUIRED' });
  }
  if (process.platform !== 'darwin') await assert.rejects(runNativeMacGate({ app, target: 'macos-' + process.arch }),
    { code: 'MAC_NATIVE_HOST_REQUIRED' }); // throws before any preflight, child, fixture or C call.
});
test('MODEL: missing/wrong/extra/relative/aliased app and cross-arch arguments are refused', () => {
  for (const args of [[], ['--app', app], ['--app', app, '--target', 'macos-x64'],
    ['--app', 'DataSecure Standalone.app', '--target', 'macos-arm64'],
    ['--app', '/synthetic/../DataSecure Standalone.app', '--target', 'macos-arm64'],
    ['--app', app + '/', '--target', 'macos-arm64'], ['--app', app + '\0', '--target', 'macos-arm64'],
    ['--app', '/synthetic/Other.app', '--target', 'macos-arm64'],
    ['--app', app, '--target', 'macos-arm64', '--skip-integrity']])
    assert.throws(() => parseNativeMacArgs(args, { platform: 'darwin', arch: 'arm64' }), { code: 'MAC_NATIVE_ARGUMENT_INVALID' });
});
test('MODEL: actual preflight calls approved loader, app markers/runtime source and seal before process creation', () => {
  const f = preflightModel(), result = f.run();
  assert.equal(result.core, app + '/Contents/MacOS/datasecure-core');
  assert.equal(result.server, app + '/Contents/Resources/server');
  assert.deepEqual(f.calls, ['bind', 'fingerprint', 'approved', 'directory', 'source', 'bundle', 'desktop', 'marker',
    'runtime', 'directory', 'seal', 'directory', 'source', 'bundle', 'desktop', 'marker', 'runtime', 'directory']);
  result.unchanged(); assert.equal(f.calls.filter(value => value === 'approved').length, 1);
});
test('MODEL: absent approval, changed bundle/source/evidence and invalid roles never reach seal/admission', () => {
  for (const step of ['bind', 'fingerprint', 'approved', 'source', 'bundle', 'desktop', 'marker', 'runtime', 'seal']) {
    const f = preflightModel(step); assert.throws(f.run, { code: 'MODEL_REJECTED' });
    assert.equal(f.calls.at(-1), step);
  }
  for (const mutate of [build => { build.artifactSha256 = ''; }, build => { build.artifact.core.sha256 = 'A'.repeat(64); },
    build => { build.artifact.role = 'official-converter'; }, build => { build.artifact.target = 'macos-x64'; }]) {
    const f = preflightModel(); mutate(f.build); assert.throws(f.run, { code: 'MAC_NATIVE_APP_CHANGED' });
    assert.deepEqual(f.calls, ['bind', 'fingerprint', 'approved']);
  }
});
test('MODEL: clean subprocess/worker environment contains only explicit fixture/pins, never ambient fallback', () => {
  const env = cleanNativeMacEnvironment({ home: '/own/home', temporary: '/own/temp', coreSha256: pin, artifactSha256: artifactPin,
    NODE_OPTIONS: '--require=/foreign', DATASECURE_OWNERSHIP_GUARD_PATH: '/foreign.node' });
  assert.ok(Object.isFrozen(env)); assert.equal(env.DATASECURE_NATIVE_EXPORT_CHANNEL, '1');
  assert.equal(env.DATASECURE_MACOS_STATIC_CORE_SHA256, pin); assert.equal(env.DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256, artifactPin);
  assert.deepEqual(Object.keys(env).sort(), ['HOME', 'TMPDIR', 'TMP', 'TEMP', 'PATH', 'LANG', 'LC_ALL',
    'DATASECURE_PRODUCT_CHANNEL', 'DATASECURE_NATIVE_EXPORT_CHANNEL', 'DATASECURE_MACOS_STATIC_CORE_SHA256',
    'DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256'].sort());
  for (const data of [{ home: 'relative' }, { temporary: '/own/temp/../x' }, { coreSha256: 'A'.repeat(64) }, { artifactSha256: '' }])
    assert.throws(() => cleanNativeMacEnvironment({ home: '/own/home', temporary: '/own/temp',
      coreSha256: pin, artifactSha256: artifactPin, ...data }), { code: 'MAC_NATIVE_ARGUMENT_INVALID' });
});
test('MODEL: receipt sequence, closed errors and own data are mandatory; getters/proxies never run', () => {
  assert.deepEqual(readNativeMacReceipt({ seq: 3, ok: true, value: { released: true } }, 3), { released: true });
  assert.throws(() => readNativeMacReceipt({ seq: 3, ok: false, value: 'OWNERSHIP_GUARD_BUSY' }, 3), { code: 'OWNERSHIP_GUARD_BUSY' });
  let traps = 0;
  const getter = { seq: 3, ok: true }; Object.defineProperty(getter, 'value', { enumerable: true, get() { traps++; return true; } });
  const proxy = new Proxy({}, { ownKeys() { traps++; return []; } });
  for (const value of [null, getter, proxy, { seq: 2, ok: true, value: true }, { seq: 3, ok: true, value: true, extra: 'PRIVATE' },
    { seq: 3, ok: false, value: 'PRIVATE_UNKNOWN_CODE' }, { seq: 3, ok: 'yes', value: true }])
    assert.throws(() => readNativeMacReceipt(value, 3), { code: 'MAC_NATIVE_PROTOCOL_INVALID' });
  assert.equal(traps, 0);
});
function helperFunctions(control, held = null) {
  const helper = fs.readFileSync(path.join(directory, 'helpers/mac-static-core-participant.cjs'), 'utf8');
  new vm.Script(helper, { filename: 'actual-future-helper-syntax.cjs' });
  const first = helper.indexOf('function admission() {'), next = helper.indexOf('async function workerProbe(', first);
  assert.ok(first > 0 && next > first);
  const context = vm.createContext({ assert, control, held, options: { root: '/own/root' }, fail,
    codeOf: value => value?.code || 'MAC_NATIVE_PARTICIPANT_FAILED' });
  vm.runInContext(helper.slice(first, next), context, { timeout: 500 });
  return { admission: vm.runInContext('admission', context), release: vm.runInContext('releaseHeld', context) };
}
test('MODEL: actual helper admission refuses Busy before callback and propagates hard failure, no operation replay', () => {
  for (const code of ['OWNERSHIP_GUARD_BUSY', 'OWNERSHIP_GUARD_UNSAFE', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED']) {
    let calls = 0; const f = helperFunctions({ withOwnershipControl() { calls++; throw fail(code); } });
    if (code === 'OWNERSHIP_GUARD_BUSY') assert.deepEqual(JSON.parse(JSON.stringify(f.admission())), { busy: true, callbacks: 0 });
    else assert.throws(f.admission, { code });
    assert.equal(calls, 1);
  }
});
test('MODEL: actual helper release consumes its capability once; false/undefined/cleanup are never success', () => {
  let releases = 0, closes = 0;
  const held = { guard: { assertHeld: () => true, release() { releases++; return true; } }, factory: { close() { closes++; return true; } } };
  const f = helperFunctions({}, held); assert.deepEqual(JSON.parse(JSON.stringify(f.release())), { released: true, root_closed: true });
  assert.throws(f.release, { code: 'MAC_NATIVE_NO_HELD_CAPABILITY' }); assert.equal(releases, 1); assert.equal(closes, 1);
  for (const result of [false, undefined]) {
    let closed = 0;
    const invalid = helperFunctions({}, { guard: { assertHeld: () => true, release: () => result }, factory: { close() { closed++; return true; } } });
    assert.throws(invalid.release); assert.equal(closed, 1); assert.throws(invalid.release, { code: 'MAC_NATIVE_NO_HELD_CAPABILITY' });
  }
  const primary = helperFunctions({}, { guard: { assertHeld: () => true, release() { throw undefined; } },
    factory: { close() { throw fail('CLEANUP_SECONDARY'); } } });
  assert.deepEqual(capture(primary.release), { threw: true, value: undefined });
});
function aclFixtureModel(mode = 'normal', platform = 'darwin') {
  const source = fs.readFileSync(path.join(directory, 'helpers/native-macos-ownership-acl-fixture.cjs'), 'utf8');
  const scope = '/temporary/datasecure-macos-acl-native-model', entries = new Map(), aclWrites = [], roots = new Set(), guards = new Set();
  let next = 1n, calls = 0, context;
  const plain = stat => ({ ...stat, isDirectory: () => stat.directory, isFile: () => !stat.directory, isSymbolicLink: () => false });
  function add(name, directory = true, mode = 0o700n) {
    assert.ok(!entries.has(name)); entries.set(name, { directory, dev: 1n, ino: next++, birthtimeNs: 1n, uid: 501n,
      mode, nlink: 1n, size: 0n, acl: [] });
  }
  const io = { realpathSync: { native: name => name },
    mkdtempSync(prefix) { calls++; assert.equal(prefix, '/temporary/datasecure-macos-acl-native-'); add(scope); return scope; },
    mkdirSync(name, options) { assert.equal(options.mode, 0o700); assert.ok(entries.has(path.posix.dirname(name))); add(name); },
    lstatSync(name) { assert.ok(entries.has(name)); return plain(entries.get(name)); },
    chmodSync(name, value) { assert.ok(entries.has(name)); entries.get(name).mode = BigInt(value); },
    readdirSync(name) { return vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify([...entries.keys()]
      .filter(value => value !== scope && path.posix.dirname(value) === name).map(value => path.posix.basename(value)))) + ')', context); },
    unlinkSync(name) { assert.ok(name.endsWith('/ownership-control.lock') && entries.has(name)); entries.delete(name); },
    rmdirSync(name) { assert.equal(io.readdirSync(name).length, 0); assert.ok(entries.has(name)); entries.delete(name); } };
  const api = { abi: 1, createRoot(leaf) {
    const parent = entries.get(path.posix.dirname(leaf)), own = entries.get(leaf);
    const denied = mode === 'reject-benign' || own.acl.length !== 0 || parent.acl.some(line => / allow (?:delete_child|add_file)$/u.test(line));
    if (denied && mode !== 'accept-unsafe') throw fail('OWNERSHIP_GUARD_UNSAFE');
    const value = { leaf }; roots.add(value); return value;
  }, tryAcquire(owner) { assert.ok(roots.has(owner)); const value = { owner }; guards.add(value);
    add(owner.leaf + '/ownership-control.lock', false, 0o600n); return value; },
  assertHeld(guard) { assert.ok(guards.has(guard)); return true; },
  release(guard) { assert.ok(guards.delete(guard)); return mode !== 'false-release'; },
  closeRoot(owner) { assert.ok(roots.delete(owner)); return true; } };
  context = vm.createContext({ module: { exports: {} }, process: { platform, arch: 'arm64', version: 'v22.23.2', geteuid: () => 501 },
    console: { log: () => assert.fail('import must not execute native gate') }, require(name) {
      if (name === 'node:assert/strict') return assert;
      if (name === 'node:fs') return io;
      if (name === 'node:os') return { tmpdir: () => '/temporary' };
      if (name === 'node:path') return path.posix;
      if (name === 'node:child_process') return { execFileSync(command, args, options) {
        assert.equal(command, '/bin/chmod'); assert.equal(args[0], '-E'); assert.equal(args.length, 2);
        assert.equal(options.shell, false); assert.equal(options.timeout, 1000);
        assert.ok(entries.has(args[1]) && entries.get(args[1]).directory, 'never alter an existing external directory');
        assert.ok(args[1] === scope || args[1].startsWith(scope + '/'));
        assert.ok(options.input.endsWith('\n')); entries.get(args[1]).acl = options.input.split('\n').filter(Boolean);
        aclWrites.push(args[1]);
      } };
      assert.fail('unexpected fixture dependency');
    } });
  vm.runInContext(source, context, { timeout: 500 });
  return { run: () => context.module.exports.runNativeMacOwnershipAclCases(api), entries, roots, guards, aclWrites,
    get calls() { return calls; } };
}
test('MODEL: actual native ACL fixture exercises six roles and clears only its new bound objects', () => {
  const f = aclFixtureModel(), value = f.run();
  assert.equal(value.cases, 6); assert.equal(value.empty_private_acl, true);
  assert.equal(value.benign_home_ancestor, true); assert.equal(value.additional_mutation_grants_refused, true);
  assert.equal(value.private_aces_refused, true); assert.equal(value.fixture_cleanup_confirmed, true);
  assert.equal(f.roots.size, 0); assert.equal(f.guards.size, 0); assert.equal(f.entries.size, 0);
  assert.ok(f.aclWrites.length > 12);
});
for (const mode of ['reject-benign', 'accept-unsafe', 'false-release'])
  test('MODEL: actual native ACL fixture cannot report PASS for ' + mode, () => {
    const f = aclFixtureModel(mode); assert.throws(f.run); assert.ok(f.entries.size > 0, 'failed fixture remains for diagnosis');
  });
test('MODEL: native ACL fixture refuses a non-Darwin host before any fixture IO', () => {
  const f = aclFixtureModel('normal', 'win32'); assert.throws(f.run); assert.equal(f.calls, 0); assert.equal(f.entries.size, 0);
});

test('MODEL: shared initial-result native fixture rejects nonnative/fallback contexts before any IO or product import', () => {
  const source = fs.readFileSync(path.join(directory, 'helpers/native-initial-results-fixture.cjs'), 'utf8');
  for (const change of [{ platform: 'linux' }, { version: 'v22.23.1' }, { arch: 'ia32' },
    { env: { DATASECURE_NATIVE_EXPORT_CHANNEL: '0' } }, { network: false }, { invalidScope: true }]) {
    let touches = 0;
    const env = change.env || { DATASECURE_NATIVE_EXPORT_CHANNEL: '1' };
    const context = vm.createContext({ module: { exports: {} }, Buffer, console,
      process: { platform: change.platform || 'win32', arch: change.arch || 'x64', version: change.version || 'v22.23.2', env },
      __DATASECURE_NETWORK_DENY_ACTIVE__: change.network !== false,
      require(name) {
        if (name === 'node:assert/strict') return assert;
        if (name === 'node:path') return path.win32;
        if (name === 'node:crypto') return crypto;
        if (name === 'node:fs') return new Proxy({}, { get() { touches++; throw Error('unexpected filesystem access'); } });
        touches++; throw Error('unexpected product import');
      } });
    vm.runInContext(source, context, { timeout: 1000 });
    const options = { server: 'C:\\package\\server', scope: change.invalidScope ? 'C:\\real-user-data' : 'C:\\own\\datasecure-windows-ownership-load-model' };
    assert.throws(() => context.module.exports.runNativeInitialResults(options), { code: 'NATIVE_INITIAL_RESULTS_FAILED' });
    assert.equal(touches, 0);
  }
});

test('MODEL: real runner dispatch is explicit Darwin-only, old Windows artifact plans unchanged', () => {
  const runner = fs.readFileSync(path.join(directory, 'run-product-suite.js'), 'utf8'), spawns = [];
  const context = vm.createContext({ module: { exports: {} }, console: { log() {}, error() {} },
    process: { platform: 'darwin', arch: 'arm64', execPath: '/model/node', argv: ['node', 'runner', 'native-macos-static-core', '--app', app, '--target', 'macos-arm64'],
      env: {}, cwd: () => '/model', exit() { assert.fail('unexpected exit'); } },
    require(id) { if (id === 'child_process') return { spawnSync(...args) { spawns.push(args); return { status: 0 }; } };
      if (id === 'node:fs' || id === 'node:os') return {}; throw Error('unexpected runner import'); }
  });
  vm.runInContext(runner, context, { timeout: 500 }); const suite = context.module.exports;
  const args = ['--app', app, '--target', 'macos-arm64'];
  const plan = suite.macStaticCorePlan(args, 'darwin', 'arm64');
  assert.equal(plan.file, 'tests/test-native-macos-static-core.mjs'); assert.deepEqual(Array.from(plan.args), args);
  for (const host of ['win32', 'linux']) assert.throws(() => suite.macStaticCorePlan(args, host, 'arm64'), { code: 'MACOS_STATIC_CORE_ARGUMENT_INVALID' });
  for (const invalid of [[], args.slice(0, 2), [...args, 'extra'], ['--app', app, '--target', 'macos-x64']])
    assert.throws(() => suite.macStaticCorePlan(invalid, 'darwin', 'arm64'), { code: 'MACOS_STATIC_CORE_ARGUMENT_INVALID' });
  for (const profile of ['ci', 'headless', 'full']) {
    const plan = suite.executionPlan(profile, [], 'darwin'); assert.ok(!plan.headlessFiles.includes('tests/test-native-macos-static-core.mjs'));
    assert.equal(plan.headlessFiles.filter(name => name === 'tests/test-native-macos-static-core-contract.mjs').length, 1);
  }
  const old = ['manifest.json', 'd'.repeat(64)];
  for (const profile of ['native-lease-finish', 'native-processing-admission'])
    assert.deepEqual(Array.from(suite.artifactBoundPlan(profile, old, 'win32').args), old);
  vm.runInContext('main()', context); // only a spawn stub; NOT a runner/native execution.
  assert.equal(spawns.length, 1); assert.deepEqual(Array.from(spawns[0][1]), ['tests/test-native-macos-static-core.mjs', ...args]);
  assert.equal(spawns[0][2].shell, false);
});


// Adversarial models execute the actual complete Parent/Gate bodies below.
// EventEmitter children, timers, preflight and fixture are explicit RAM models;
// no native child, Worker, C API, signal, app or filesystem mutation occurs.
function lifecycleModel(mode = 'normal') {
  const source = fs.readFileSync(path.join(directory, 'test-native-macos-static-core.mjs'), 'utf8');
  const start = source.indexOf('const here ='), end = source.lastIndexOf('\nif (process.argv[1]');
  assert.ok(start > 0 && end > start);
  const children = [], timerRecords = [], forcedExits = [], cliReports = []; let context, cleanups = 0, fixtureStatus = 'preserved';
  const fixedIO = code => Object.assign(Error('PRIVATE_NOT_FOR_REPORT'), { code });
  const later = (action, milliseconds) => {
    if (mode === 'timer-set-throws') throw fixedIO('EIO');
    const timer = { active: true, milliseconds, unrefs: 0, unref() { this.unrefs++; } };
    timerRecords.push(timer);
    if (milliseconds <= 2000) queueMicrotask(() => { if (timer.active) action(); });
    return timer;
  };
  const cancel = timer => {
    if (mode === 'timer-clear-throws') throw fixedIO('EIO');
    timer.active = false;
  };
  class Child extends EventEmitter {
    constructor(index) {
      super(); Object.assign(this, { index, pid: 41001 + index, connected: true, exitCode: null, signalCode: null,
        kills: [], unrefs: 0, destroys: 0, channelUnrefs: 0, admits: 0, releases: 0, operations: [] });
      this.channel = { unref: () => { this.channelUnrefs++; if (mode === 'detach-throws') throw fixedIO('EIO'); } };
      for (const name of ['stdout', 'stderr']) {
        const stream = this[name] = new EventEmitter();
        stream.destroy = () => { this.destroys++; if (mode === 'detach-throws') throw fixedIO('EIO'); };
        stream.unref = () => { this.unrefs++; if (mode === 'detach-throws') throw fixedIO('EIO'); };
      }
    }
    unref() { this.unrefs++; if (mode === 'detach-throws') throw fixedIO('EIO'); }
    kill(signal) { this.kills.push(signal); if (mode === 'kill-throws') throw fixedIO('EPERM'); return false; }
    finish() {
      this.exitCode = 0; this.emit('exit', 0, null);
      if (this.index === 0 && mode === 'late-output') this.stdout.emit('data', Buffer.alloc(65537));
      if (this.index === 0 && mode === 'late-ipc') this.emit('message', { seq: 999, ok: true, value: true });
      this.connected = false; this.emit('disconnect'); this.stdout.emit('close'); this.stderr.emit('close');
      if (mode !== 'exit-without-close') this.emit('close', 0, null);
    }
    send(frame, callback) {
      this.operations.push(frame.operation); let value, ok = true;
      switch (frame.operation) {
        case 'identity': value = { node: 'v22.23.2', target: 'macos-arm64', builtin: true, clean_env: true }; break;
        case 'hold': value = { acquired: true }; break;
        case 'admit': value = ++this.admits === 1 ? { busy: true, callbacks: 0 } : { busy: false, callbacks: 1, reentrant: true }; break;
        case 'worker_busy': value = { builtin: true, busy: true, callbacks: 0, exited: true, normal: true }; break;
        case 'worker_free': value = { builtin: true, busy: false, callbacks: 1, reentrant: true, exited: true, normal: true }; break;
        case 'acl_matrix': value = { cases: 6, empty_private_acl: true, benign_home_ancestor: true,
          additional_mutation_grants_refused: true, private_aces_refused: true, fixture_cleanup_confirmed: true }; break;
        case 'initial_results': value = { schema: 'datasecure-native-initial-results/1', target: 'macos-arm64', native_output_guard: true,
          refused_guard_mkdirs: 0, refused_guard_attempt_absent: true, created_directories: 2, written_documents: 2,
          read_only_reopen_under_output_lock: true, reopen_mkdirs: 0, exact_visible_markdown_inventory: true,
          lock_only_in_output_container: true, original_inputs_unchanged: true, fixture_cleanup_confirmed: true }; break;
        case 'release':
          if (this.index === 0 && ++this.releases === 2) { ok = false; value = 'MAC_NATIVE_NO_HELD_CAPABILITY'; }
          else value = { released: true, root_closed: true };
          break;
        case 'shutdown': value = { stopped: true }; break;
        default: throw Error('unexpected model operation');
      }
      if (frame.operation === 'initial_results' && mode === 'initial-probe-fallback') value.native_output_guard = false;
      if (frame.operation === 'initial_results' && mode === 'initial-probe-mutated-before-refusal') value.refused_guard_mkdirs = 1;
      if (frame.operation === 'initial_results' && mode === 'initial-probe-unconfirmed-close') value.fixture_cleanup_confirmed = false;
      const message = vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify({ seq: frame.seq, ok, value })) + ')', context);
      this.emit('message', message); callback?.(null);
      if (frame.operation === 'shutdown') {
        if (mode === 'late-error-during-b-stop' && this.index === 1)
          children[0].stderr.emit('error', fixedIO('EIO'));
        if (['normal', 'late-output', 'late-ipc', 'late-error-during-b-stop', 'exit-without-close',
          'cleanup-partial', 'cleanup-validation-fails', 'initial-probe-fallback', 'initial-probe-mutated-before-refusal',
          'initial-probe-unconfirmed-close'].includes(mode)) queueMicrotask(() => this.finish());
      }
    }
  }
  const fixture = { scope: '/own/datasecure-macos-static-native-model', home: '/own/home', temporary: '/own/tmp', root: '/own/root',
    unchangedAnchor() {}, status: () => fixtureStatus, cleanup() {
      cleanups++;
      if (mode === 'cleanup-validation-fails') throw fixedIO('EIO');
      if (mode === 'cleanup-partial') { fixtureStatus = 'cleanup_incomplete'; throw fixedIO('EIO'); }
      fixtureStatus = 'removed';
    } };
  const checked = { core: app + '/Contents/MacOS/datasecure-core', server: app + '/Contents/Resources/server',
    build: { artifact: { core: { sha256: pin } }, artifactSha256: artifactPin }, source: { fingerprint: 'c'.repeat(64) }, unchanged() {} };
  const denied = () => assert.fail('native/app/fixture boundary must remain an explicit model');
  context = vm.createContext({ assert, Buffer, path: path.posix, crypto, types, performance: { now: () => 0 }, fs: {}, os: {},
    fileURLToPath: () => '/audit/tests/test-native-macos-static-core.mjs', process: { platform: 'darwin', arch: 'arm64', pid: 31000, argv: [] },
    setTimeout: later, clearTimeout: cancel, bound: { readBoundFile: () => Buffer.from('unchanged synthetic helper') },
    loadMacStaticCore: denied, assertMacCoreBundle: denied, verifyMacBundleSeal: denied, standaloneBuildFingerprint: denied,
    assertStandaloneBuildFingerprint: denied, assertStandaloneSourceUnchanged: denied, assertStandaloneRuntimeSource: denied,
    fork() { const child = new Child(children.length); children.push(child); return child; }, fixture, checked });
  const body = source.slice(start, end).replace(/^export /gmu, '').replaceAll('import.meta.url', "'file:///audit/tests/test-native-macos-static-core.mjs'");
  vm.runInContext(body + '\npreflightNativeMacGate=()=>checked;createFixture=()=>fixture;this.api={participant,runNativeMacGate};',
    context, { timeout: 1000 });
  return { children, timerRecords, forcedExits, cliReports, get cleanups() { return cleanups; },
    peer: () => context.api.participant('/core', '/helper', { server: '/server', scope: '/scope' }, {}, 30000),
    gate: () => context.api.runNativeMacGate({ app, target: 'macos-arm64' }), cli() {
      context.process.argv = ['node', '/audit/tests/test-native-macos-static-core.mjs', '--app', app, '--target', 'macos-arm64'];
      context.process.exit = code => forcedExits.push(code);
      context.console = { log() {}, error: value => cliReports.push(JSON.parse(value)) };
      return vm.runInContext('(async()=>{' + source.slice(end).replaceAll('import.meta.url',
        "'file:///audit/tests/test-native-macos-static-core.mjs'") + '\n})()', context, { timeout: 1000 });
    } };
}
for (const mode of ['late-output', 'late-ipc', 'late-error-during-b-stop'])
  test('MODEL NG-01: full actual Gate refuses ' + mode + ', even after earlier successful receipts', async () => {
    const f = lifecycleModel(mode); let report;
    await assert.rejects(f.gate(), error => { report = error.report; return report.native_status === 'FAILED'; });
    assert.equal(f.cleanups, 0); assert.equal(report.fixture_preserved, true); assert.equal(report.fixture_status, 'preserved');
    assert.equal(report.process_receipts[0].confirmed, true); assert.equal(report.process_receipts[0].normal, true);
    assert.equal(report.process_receipts[0].failed, true);
    assert.equal(report.error_code, mode === 'late-error-during-b-stop' ? 'MAC_NATIVE_STREAM_FAILED' : 'MAC_NATIVE_PROTOCOL_INVALID');
    assert.equal(f.children[0].operations.filter(value => value === 'hold').length, 1, 'no semantic operation replay');
    assert.equal(f.children[0].kills.length, 0, 'no signal after observed Exit');
  });
for (const mode of ['initial-probe-fallback', 'initial-probe-mutated-before-refusal', 'initial-probe-unconfirmed-close'])
  test('MODEL: actual Mac gate refuses ' + mode + ' and preserves its bounded fixture', async () => {
    const f = lifecycleModel(mode); let report;
    await assert.rejects(f.gate(), error => { report = error.report; return report.native_status === 'FAILED'; });
    assert.equal(report.phase, 'initial_result_output_guard'); assert.equal(report.coverage.initial_result_output_guard, false);
    assert.equal(report.fixture_cleanup_confirmed, false); assert.equal(f.cleanups, 0);
    assert.equal(report.process_receipts.every(receipt => receipt.confirmed && receipt.normal && receipt.shutdown_ack), true);
    assert.equal(f.children[0].operations.filter(value => value === 'initial_results').length, 1);
  });
for (const mode of ['never-close', 'kill-throws', 'exit-without-close', 'detach-throws'])
  test('MODEL NG-02: ' + mode + ' is bounded, detached and never called reaped', async () => {
    const f = lifecycleModel(mode), peer = f.peer(), receipt = await peer.stop(), child = f.children[0];
    assert.equal(receipt.confirmed, false); assert.equal(receipt.failed, true); assert.equal(receipt.detach_attempted, true);
    assert.equal(child.destroys, 2); assert.equal(child.channelUnrefs, 1); assert.equal(child.unrefs, 3);
    assert.deepEqual(child.kills, mode === 'exit-without-close' ? [] : ['SIGTERM', 'SIGKILL']);
    assert.equal(receipt.detach_failed, mode === 'detach-throws');
    assert.equal(receipt.error_code, mode === 'exit-without-close' ? 'MAC_NATIVE_PROCESS_UNCONFIRMED' : 'MAC_NATIVE_KILL_FAILED');
    assert.ok(f.timerRecords.filter(timer => timer.milliseconds <= 2000).length <= 3, 'finite close waits');
    assert.equal(receipt.kill_attempts.every(value => ['refused', 'threw'].includes(value.result)), true);
  });
test('MODEL NG-02: stream errors without pending are caught and first cause survives later faults', async () => {
  const f = lifecycleModel('never-close'), peer = f.peer(), child = f.children[0];
  assert.doesNotThrow(() => child.stdout.emit('error', Object.assign(Error('PRIVATE'), { code: 'EIO' })));
  child.emit('message', { unexpected: true });
  const receipt = await peer.stop(); assert.equal(receipt.error_code, 'MAC_NATIVE_STREAM_FAILED');
  assert.equal(receipt.failed, true); assert.equal(receipt.confirmed, false);
  assert.doesNotThrow(() => child.stderr.emit('error', Error('PRIVATE late detach error')));
  assert.equal(peer.receipt().error_code, 'MAC_NATIVE_STREAM_FAILED');
});
for (const mode of ['timer-set-throws', 'timer-clear-throws'])
  test('MODEL NG-02: ' + mode + ' has fixed failure, bounded detach and no success', async () => {
    const f = lifecycleModel(mode), peer = f.peer();
    await assert.rejects(peer.request('identity'), { code: 'MAC_NATIVE_TIMER_FAILED' });
    const receipt = await peer.stop(); assert.equal(receipt.failed, true); assert.equal(receipt.error_code, 'MAC_NATIVE_TIMER_FAILED');
    assert.equal(receipt.confirmed, false); assert.equal(receipt.detach_attempted, true);
    if (mode === 'timer-clear-throws') assert.ok(f.timerRecords.some(timer => timer.unrefs > 0));
  });
test('MODEL NG-01/02: normal full actual Gate still requires complete shutdown and cleans only its removed fixture', async () => {
  const f = lifecycleModel(), result = await f.gate();
  assert.equal(result.native_status, 'PASS'); assert.equal(f.cleanups, 1);
  assert.equal(result.fixture_cleanup_confirmed, true); assert.equal(result.fixture_preserved, false); assert.equal(result.fixture_status, 'removed');
  for (const receipt of result.process_receipts) {
    assert.equal(receipt.failed, false); assert.equal(receipt.error_code, null); assert.equal(receipt.confirmed, true);
    assert.equal(receipt.shutdown_ack, true); assert.equal(receipt.kill_attempts.length, 0); assert.equal(receipt.detach_attempted, false);
  }
});
test('MODEL NG-02: own CLI has a bounded failing exit if even unref/detach throws, without reaping or cleanup', async () => {
  const f = lifecycleModel('detach-throws'); await f.cli();
  assert.deepEqual(f.forcedExits, [1]); assert.equal(f.cliReports.length, 1);
  assert.equal(f.cliReports[0].native_status, 'FAILED'); assert.equal(f.cliReports[0].fixture_preserved, true);
  assert.equal(f.cliReports[0].process_receipts.every(value => !value.confirmed && value.detach_failed), true);
  assert.equal(f.cleanups, 0); assert.ok(f.timerRecords.some(timer => timer.milliseconds === 1000 && timer.unrefs > 0));
});
for (const mode of ['cleanup-partial', 'cleanup-validation-fails'])
  test('MODEL: full Gate distinguishes ' + mode + ' without claiming an intact removed scope', async () => {
    const f = lifecycleModel(mode); let report;
    await assert.rejects(f.gate(), error => { report = error.report; return report.native_status === 'FAILED'; });
    assert.equal(report.fixture_cleanup_confirmed, false);
    assert.equal(report.fixture_status, mode === 'cleanup-partial' ? 'cleanup_incomplete' : 'preserved');
    assert.equal(report.fixture_preserved, mode !== 'cleanup-partial');
  });
test('MODEL: actual cleanup body marks partial removal before the first destructive attempt', () => {
  const source = fs.readFileSync(path.join(directory, 'test-native-macos-static-core.mjs'), 'utf8');
  const start = source.indexOf('const identity ='), end = source.indexOf('export async function runNativeMacGate', start);
  assert.ok(start > 0 && end > start);
  const scope = '/parent/datasecure-macos-static-native-model', entries = new Map(); let next = 1n;
  const add = (name, dir = true) => entries.set(name, { dev: 1n, ino: next++, birthtimeNs: 1n, uid: 77n,
    mode: dir ? 0o40700n : 0o100600n, size: 0n, nlink: 1n, isDirectory: () => dir, isFile: () => !dir, isSymbolicLink: () => false });
  let context;
  const removed = [], io = { realpathSync: { native: value => value }, mkdtempSync() { add(scope); return scope; },
    mkdirSync: name => add(name), lstatSync: name => { assert.ok(entries.has(name)); return entries.get(name); },
    readdirSync: name => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify([...entries.keys()]
      .filter(value => path.posix.dirname(value) === name).map(value => path.posix.basename(value)))) + ')', context),
    unlinkSync(name) { removed.push(name); entries.delete(name); }, rmdirSync(name) {
      if (name === scope + '/root') throw fail('EIO'); removed.push(name); entries.delete(name);
    } };
  context = vm.createContext({ assert, fs: io, os: { tmpdir: () => '/parent' }, path: path.posix,
    process: { geteuid: () => 77 }, failure: fail });
  vm.runInContext(source.slice(start, end) + '\nthis.fixture=createFixture();', context, { timeout: 1000 });
  const f = context.fixture; add(scope + '/root/ownership-control.lock', false);
  assert.equal(f.status(), 'preserved'); assert.throws(f.cleanup, { code: 'EIO' });
  assert.equal(f.status(), 'cleanup_incomplete'); assert.equal(removed.length, 3);
  assert.ok(entries.has(scope) && entries.has(scope + '/root'));
});
