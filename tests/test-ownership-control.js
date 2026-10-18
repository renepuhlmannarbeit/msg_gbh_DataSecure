'use strict';

// Host-independent source/control tests with an explicitly injected native API.
// These prove neither NAPI lifetime nor Windows/macOS filesystem exclusion.
// Real native/process coverage belongs to test-native-ownership-guard.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { desktopErrorCode } = require('../plugins/data-secure/server/core/desktop-error-contract');

const repository = path.resolve(__dirname, '..');
const controlFile = path.join(repository, 'plugins/data-secure/server/core/ownership-control.js');
const source = fs.readFileSync(controlFile, 'utf8');
const PIN = '7'.repeat(64);
const ARTIFACT_PIN = '6'.repeat(64);
const failure = code => Object.assign(new Error(code), { code });
const root = 'C:\\isolated\\private';
const artifact = () => ({ schema: 'datasecure-native-ownership-guard/1', abi: 1, napi: 8,
  target: 'windows-x64', path: 'C:\\isolated\\runtime\\ownership-guard.node', sha256: PIN });
function capture(callback) {
  try { return { threw: false, value: callback() }; }
  catch (value) { return { threw: true, value }; }
}
function fixture(options = {}) {
  const platform = options.platform || 'win32', arch = options.arch || 'x64';
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const env = { ...(options.env || { DATASECURE_NATIVE_EXPORT_CHANNEL: '1' }) };
  const events = [], inputs = [], runtimeInputs = [];
  let assertions = 0;
  const guard = Object.freeze({
    assertHeld() {
      events.push('assert'); assertions++;
      if (assertions === options.assertFailureAt) throw failure('OWNERSHIP_GUARD_UNSAFE');
      return true;
    },
    release() {
      events.push('release');
      if (options.releaseThrow) throw options.releaseError;
      return options.releaseFalse ? false : true;
    }
  });
  const createOwnershipGuard = input => {
    events.push('create'); inputs.push(input);
    if (options.createFailure) throw failure('OWNERSHIP_GUARD_UNAVAILABLE');
    return {
      tryAcquire() { events.push('acquire'); return options.busy ? null : guard; },
      close() {
        events.push('close');
        if (options.closeThrow) throw options.closeError;
        return options.closeFalse ? false : true;
      }
    };
  };
  const context = vm.createContext({
    module: { exports: {} }, process: { platform, arch, env },
    __dirname: platform === 'win32' ? 'C:\\isolated\\server\\core' : '/isolated/server/core',
    require(name) {
      if (name === 'node:path') return pathApi;
      if (name === 'node:util') return require(name);
      if (name === './native-ownership-guard') return { createOwnershipGuard };
      if (name === './macos-static-ownership-guard') return { loadStaticOwnershipGuard(input) {
        events.push('runtime-load'); runtimeInputs.push(input);
        if (options.runtimeLoadFailure) throw failure('OWNERSHIP_GUARD_UNAVAILABLE');
        return Object.freeze({});
      } };
      if (name === './macos-static-runtime-evidence') return { verify(target) {
        events.push('runtime-evidence'); assert.equal(target, `macos-${arch}`);
        if (options.evidenceFailure) throw Error('PRIVATE evidence');
        return { checked: true, target };
      } };
      assert.equal(name, '../standalone/macos-bundle-layout');
      return { bundleContext: () => options.bundle || null };
    }
  });
  vm.runInContext(source, context, { filename: controlFile, timeout: 500 });
  return { api: context.module.exports, events, inputs, runtimeInputs, guard, env, context };
}
function configured(options) {
  const value = fixture(options); value.api.configureOwnershipControl(artifact()); return value;
}

test('native control rejects invalid roots before entering or creating authority', () => {
  for (const value of [undefined, null, 3, {}, '', 'relative', 'C:relative', root + '\\..\\private', root + '\\']) {
    const f = configured(); let calls = 0;
    assert.throws(() => f.api.withOwnershipControl(value, () => calls++), { code: 'OWNERSHIP_GUARD_INVALID' });
    assert.equal(calls, 0); assert.deepEqual(f.events, []);
  }
  for (const callback of [undefined, null, 3, {}, Symbol('not a callback')]) {
    const f = configured();
    assert.throws(() => f.api.withOwnershipControl(root, callback), { code: 'OWNERSHIP_GUARD_INVALID' });
    assert.deepEqual(f.events, []);
  }
});

test('native control requires a valid compile-time pin and does not fall back after loader failure', () => {
  for (const pin of [undefined, '', '0', 'A'.repeat(64), PIN + '\n', 'g'.repeat(64)]) {
    const f = fixture({ env: { DATASECURE_NATIVE_EXPORT_CHANNEL: '1', DATASECURE_OWNERSHIP_GUARD_SHA256: pin } });
    let calls = 0;
    assert.throws(() => f.api.withOwnershipControl(root, () => calls++), { code: 'OWNERSHIP_GUARD_UNAVAILABLE' });
    assert.equal(calls, 0); assert.deepEqual(f.events, []);
  }
  const f = configured({ createFailure: true }); let calls = 0;
  assert.throws(() => f.api.withOwnershipControl(root, () => calls++), { code: 'OWNERSHIP_GUARD_UNAVAILABLE' });
  assert.equal(calls, 0); assert.deepEqual(f.events, ['create']);
});

test('artifact configuration rejects DTO traps and takes one immutable data copy', () => {
  let traps = 0;
  const accessor = artifact(); Object.defineProperty(accessor, 'sha256', { enumerable: true, get() { traps++; return PIN; } });
  const proxy = new Proxy(artifact(), { ownKeys() { traps++; return []; } });
  for (const value of [undefined, null, 7, [], {}, accessor, proxy, { ...artifact(), extra: 1 }])
    assert.throws(() => fixture().api.configureOwnershipControl(value), { code: 'OWNERSHIP_GUARD_INVALID' });
  assert.equal(traps, 0);
  const supplied = artifact(), f = fixture(); f.api.configureOwnershipControl(supplied);
  supplied.sha256 = '0'.repeat(64); supplied.path = 'C:\\different.node';
  f.api.withOwnershipControl(root, () => 1);
  assert.equal(f.inputs[0].verifiedArtifact.sha256, PIN);
  assert.equal(f.inputs[0].verifiedArtifact.path, artifact().path);
  assert.ok(Object.isFrozen(f.inputs[0].verifiedArtifact));
  assert.throws(() => f.api.configureOwnershipControl(artifact()), { code: 'OWNERSHIP_GUARD_ALREADY_CONFIGURED' });
});

test('source model keeps the fixed Windows addon path and pin unchanged', () => {
  const f = fixture({ env: { DATASECURE_NATIVE_EXPORT_CHANNEL: '1', DATASECURE_OWNERSHIP_GUARD_SHA256: PIN,
    DATASECURE_OWNERSHIP_GUARD_PATH: '/untrusted/override.node' } });
  f.api.withOwnershipControl(root, () => 1);
  assert.equal(f.inputs[0].verifiedArtifact.path, 'C:\\isolated\\server\\native\\windows-x64\\ownership-guard.node');
  assert.equal(f.inputs[0].verifiedArtifact.sha256, PIN);
  assert.equal(f.inputs[0].verifiedArtifact.target, 'windows-x64');
  const unsupported = fixture({ arch: 'arm64', env: { DATASECURE_NATIVE_EXPORT_CHANNEL: '1', DATASECURE_OWNERSHIP_GUARD_SHA256: PIN } });
  assert.throws(() => unsupported.api.withOwnershipControl(root, () => 1), { code: 'OWNERSHIP_GUARD_UNAVAILABLE' });
});

test('Darwin uses only the pinned static-Core descriptor, without any addon path or addon digest', () => {
  for (const arch of ['x64', 'arm64']) {
    const f = fixture({ platform: 'darwin', arch, env: { DATASECURE_NATIVE_EXPORT_CHANNEL: '1',
      DATASECURE_MACOS_STATIC_CORE_SHA256: PIN, DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256: ARTIFACT_PIN,
      DATASECURE_OWNERSHIP_GUARD_SHA256: '0'.repeat(64), DATASECURE_OWNERSHIP_GUARD_PATH: '/untrusted/override.node' } });
    assert.equal(f.api.withOwnershipControl('/isolated/private', () => 17), 17);
    assert.deepEqual(JSON.parse(JSON.stringify(f.inputs[0].verifiedArtifact)), {
      schema: 'datasecure-static-ownership-core/1', abi: 1, napi: 8, target: `macos-${arch}`, core_sha256: PIN
    });
    assert.equal(Object.hasOwn(f.inputs[0].verifiedArtifact, 'path'), false);
    assert.equal(Object.hasOwn(f.inputs[0].verifiedArtifact, 'sha256'), false);
  }
});

test('Darwin legacy addon pins cannot satisfy a missing or invalid static-Core pin', () => {
  for (const pin of [undefined, '', '0', 'A'.repeat(64), PIN + '\\n']) {
    const f = fixture({ platform: 'darwin', env: { DATASECURE_NATIVE_EXPORT_CHANNEL: '1',
      DATASECURE_MACOS_STATIC_CORE_SHA256: pin, DATASECURE_OWNERSHIP_GUARD_SHA256: PIN } });
    assert.throws(() => f.api.withOwnershipControl('/isolated/private', () => assert.fail('no callback')),
      { code: 'OWNERSHIP_GUARD_UNAVAILABLE' });
    assert.deepEqual(f.events, []);
  }
});

test('Darwin trusted configuration copies only the five static-Core descriptor fields', () => {
  const descriptor = { schema: 'datasecure-static-ownership-core/1', abi: 1, napi: 8, target: 'macos-arm64', core_sha256: PIN };
  const f = fixture({ platform: 'darwin', arch: 'arm64' }); f.api.configureOwnershipControl(descriptor);
  descriptor.core_sha256 = '0'.repeat(64);
  f.api.withOwnershipControl('/isolated/private', () => 1);
  assert.equal(f.inputs[0].verifiedArtifact.core_sha256, PIN);
  assert.ok(Object.isFrozen(f.inputs[0].verifiedArtifact));
  for (const value of [artifact(), { ...descriptor, path: '/untrusted/addon.node' }])
    assert.throws(() => fixture({ platform: 'darwin' }).api.configureOwnershipControl(value), { code: 'OWNERSHIP_GUARD_INVALID' });
});

test('actual Darwin preflight requires independent artifact pin and checks the actual static/evidence dependencies', () => {
  for (const arch of ['x64', 'arm64']) {
    const env = { DATASECURE_NATIVE_EXPORT_CHANNEL: '1', DATASECURE_MACOS_STATIC_CORE_SHA256: PIN,
      DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256: ARTIFACT_PIN };
    const f = fixture({ platform: 'darwin', arch, env });
    assert.equal(f.api.assertNativeOwnershipRuntime(), undefined);
    assert.deepEqual(f.events, ['runtime-load', 'runtime-evidence']);
    assert.equal(f.runtimeInputs[0].core_sha256, PIN); assert.deepEqual(f.inputs, []);
    const invalid = fixture({ platform: 'darwin', arch, env: { ...env, DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256: '' } });
    assert.throws(() => invalid.api.assertNativeOwnershipRuntime(), { code: 'OWNERSHIP_GUARD_UNAVAILABLE' });
    assert.deepEqual(invalid.events, []);
    const loadFailure = fixture({ platform: 'darwin', arch, env, runtimeLoadFailure: true });
    assert.throws(() => loadFailure.api.assertNativeOwnershipRuntime(), { code: 'OWNERSHIP_GUARD_UNAVAILABLE' });
    assert.deepEqual(loadFailure.events, ['runtime-load']);
    const evidenceFailure = fixture({ platform: 'darwin', arch, env, evidenceFailure: true });
    assert.throws(() => evidenceFailure.api.assertNativeOwnershipRuntime(), { code: 'OWNERSHIP_GUARD_INTEGRITY_FAILED' });
    assert.deepEqual(evidenceFailure.events, ['runtime-load', 'runtime-evidence']);
  }
});

test('legacy/source and other-target contracts are explicit, not native-error fallbacks', () => {
  for (const options of [{ env: {} }, { platform: 'linux', env: { DATASECURE_NATIVE_EXPORT_CHANNEL: '1' } }]) {
    const f = fixture(options);
    assert.equal(f.api.withOwnershipControl('/legacy', guard => {
      assert.ok(Object.isFrozen(guard)); return guard.assertHeld();
    }), true);
    assert.deepEqual(f.events, []);
  }
});

test('busy native guard closes its factory without callback or foreign release', () => {
  const f = configured({ busy: true }); let calls = 0;
  assert.throws(() => f.api.withOwnershipControl(root, () => calls++), { code: 'OWNERSHIP_GUARD_BUSY' });
  assert.equal(calls, 0); assert.deepEqual(f.events, ['create', 'acquire', 'close']);
});

test('reentry shares one guard including Windows case aliases and releases once', () => {
  const f = configured();
  assert.equal(f.api.withOwnershipControl(root, outer => f.api.withOwnershipControl(root.toUpperCase(), inner => {
    assert.equal(inner, outer); assert.equal(inner, f.guard); return 17;
  })), 17);
  assert.deepEqual(f.events, ['create', 'acquire', 'assert', 'assert', 'assert', 'assert', 'release', 'close']);
  assert.equal(f.api.withOwnershipControl(root, () => 23), 23, 'active entry must be retired');
  assert.equal(f.events.filter(event => event === 'create').length, 2);
});

test('callback throws preserve every JavaScript value including undefined and still release', () => {
  for (const thrown of [undefined, null, false, 0, '', failure('CALLBACK_FAILURE')]) {
    for (const nested of [false, true]) {
      const f = configured();
      const result = capture(() => f.api.withOwnershipControl(root, () => {
        const raise = () => { throw thrown; };
        return nested ? f.api.withOwnershipControl(root, raise) : raise();
      }));
      assert.equal(result.threw, true); assert.equal(result.value, thrown);
      assert.deepEqual(f.events.slice(-2), ['release', 'close']);
      assert.equal(f.events.filter(event => event === 'release').length, 1);
      assert.equal(f.api.withOwnershipControl(root, () => 'retry'), 'retry');
    }
  }
});

test('pre/post callback ownership assertion failures always retire acquired authority', () => {
  for (const assertFailureAt of [1, 2]) {
    const f = configured({ assertFailureAt }); let calls = 0;
    assert.throws(() => f.api.withOwnershipControl(root, () => calls++), { code: 'OWNERSHIP_GUARD_UNSAFE' });
    assert.equal(calls, assertFailureAt - 1);
    assert.deepEqual(f.events.slice(-2), ['release', 'close']);
  }
});

test('async functions are refused before acquire; returned promises/thenables cannot succeed', () => {
  const f = configured();
  assert.throws(() => f.api.withOwnershipControl(root, async () => 1), { code: 'OWNERSHIP_GUARD_INVALID' });
  assert.deepEqual(f.events, []);
  for (const nested of [false, true]) for (const result of [Promise.resolve(1), { then() {} }]) {
    const current = configured();
    assert.throws(() => current.api.withOwnershipControl(root, () => nested
      ? current.api.withOwnershipControl(root, () => result) : result), { code: 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN' });
    assert.deepEqual(current.events.slice(-2), ['release', 'close']);
  }
  const current = configured(), thrown = failure('THEN_GETTER_FAILURE');
  assert.throws(() => current.api.withOwnershipControl(root, () => ({ get then() { throw thrown; } })), error => error === thrown);
  assert.deepEqual(current.events.slice(-2), ['release', 'close']);
});

test('uncertain release or close poisons every later root without more native calls', () => {
  for (const options of [
    { releaseFalse: true }, { closeFalse: true },
    { releaseThrow: true, releaseError: failure('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED') },
    { closeThrow: true, closeError: failure('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED') }
  ]) {
    const f = configured(options);
    assert.throws(() => f.api.withOwnershipControl(root, () => 1), { code: 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED' });
    assert.deepEqual(f.events.slice(-2), ['release', 'close']);
    const before = f.events.length;
    for (const other of [root, 'C:\\isolated\\another'])
      assert.throws(() => f.api.withOwnershipControl(other, () => assert.fail('poisoned callback')), { code: 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED' });
    assert.equal(f.events.length, before);
  }
});

test('throw undefined remains primary even when release also fails, and poisoning persists', () => {
  const normal = configured();
  assert.deepEqual(capture(() => normal.api.withOwnershipControl(root, () => undefined)), { threw: false, value: undefined });
  for (const releaseError of [undefined, failure('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED')]) {
    const f = configured({ releaseThrow: true, releaseError });
    const result = capture(() => f.api.withOwnershipControl(root, () => { throw undefined; }));
    assert.equal(result.threw, true); assert.equal(result.value, undefined);
    assert.deepEqual(f.events.slice(-2), ['release', 'close']);
    assert.throws(() => f.api.withOwnershipControl(root, () => 1), { code: 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED' });
  }
  const releaseOnly = configured({ releaseThrow: true, releaseError: undefined });
  assert.deepEqual(capture(() => releaseOnly.api.withOwnershipControl(root, () => 1)), { threw: true, value: undefined });
  assert.throws(() => releaseOnly.api.withOwnershipControl(root, () => 1), { code: 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED' });
});

test('actual worker allowlist source retains native obligation/pin but excludes startup overrides', () => {
  const file = path.join(repository, 'plugins/data-secure/server/gateway/batch-executor.js');
  const worker = fs.readFileSync(file, 'utf8'), start = worker.indexOf('const WORKER_ENV_KEYS =');
  const end = worker.indexOf('// The intake worker', start);
  assert.ok(start > 0 && end > start);
  const context = vm.createContext({ process: { platform: 'win32', env: {} } });
  vm.runInContext(worker.slice(start, end), context, { filename: file, timeout: 500 });
  const environment = vm.runInContext('batchWorkerEnvironment', context)({
    DATASECURE_NATIVE_EXPORT_CHANNEL: '1', DATASECURE_OWNERSHIP_GUARD_SHA256: PIN,
    NODE_OPTIONS: '--require=/private/override', NODE_PATH: '/private', PRIVATE_SECRET: 'secret',
    DATASECURE_OWNERSHIP_GUARD_PATH: '/private/override.node'
  });
  assert.deepEqual(Object.keys(environment).sort(), ['DATASECURE_NATIVE_EXPORT_CHANNEL', 'DATASECURE_OWNERSHIP_GUARD_SHA256']);
  assert.equal(environment.DATASECURE_NATIVE_EXPORT_CHANNEL, '1');
  assert.equal(environment.DATASECURE_OWNERSHIP_GUARD_SHA256, PIN);
  const darwin = vm.createContext({ process: { platform: 'darwin', env: {} } });
  vm.runInContext(worker.slice(start, end), darwin, { filename: file, timeout: 500 });
  const forward = vm.runInContext('batchWorkerEnvironment', darwin);
  const supplied = { DATASECURE_NATIVE_EXPORT_CHANNEL: '1', DATASECURE_MACOS_STATIC_CORE_SHA256: PIN,
    DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256: ARTIFACT_PIN,
    DATASECURE_MACOS_STATIC_CORE_PATH: '/untrusted/core', NODE_OPTIONS: '--require=/untrusted' };
  const forwarded = forward(supplied);
  assert.deepEqual(Object.keys(forwarded).sort(), ['DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256',
    'DATASECURE_MACOS_STATIC_CORE_SHA256', 'DATASECURE_NATIVE_EXPORT_CHANNEL']);
  assert.equal(forwarded.DATASECURE_MACOS_STATIC_CORE_SHA256, PIN);
  assert.equal(forwarded.DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256, ARTIFACT_PIN);
  const sourceAdapter = forward({ ...supplied, DATASECURE_NATIVE_EXPORT_CHANNEL: '0' });
  assert.equal(Object.hasOwn(sourceAdapter, 'DATASECURE_MACOS_STATIC_CORE_SHA256'), false);
  assert.equal(Object.hasOwn(sourceAdapter, 'DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256'), false);
});

test('missing native pin fails in actual startup prefix before the first history dependency', () => {
  const file = path.join(repository, 'plugins/data-secure/server/standalone/application-service.js');
  const application = fs.readFileSync(file, 'utf8');
  const namespaceStart = application.indexOf('function assertNativeStandaloneNamespace(');
  const start = application.indexOf('function defaultDependencies(options = {}) {');
  const boundary = application.indexOf("  const { createRunHistory } = require('./run-history');", start);
  assert.ok(namespaceStart > 0 && start > namespaceStart && boundary > start);
  for (const platform of ['win32']) for (const diagnosticsThrow of [false, true]) {
    const f = fixture({ platform }), events = [], imports = [], writes = [];
    const selectedRoot = platform === 'win32' ? root : '/isolated/private';
    const directory = { dev: 7, ino: 42, isDirectory: () => true, isSymbolicLink: () => false };
    const io = { mkdirSync(value) { writes.push(value); }, lstatSync: () => directory, statSync: () => directory,
      realpathSync: Object.assign(value => value, { native: value => value }) };
    // Execute both real namespace functions and their actual defaultDependency
    // call. Replacing activateStandaloneNamespace with a stub would delete the
    // very guard boundary this regression is meant to exercise after refactors.
    const context = vm.createContext({ process: { platform, env: { DATASECURE_NATIVE_EXPORT_CHANNEL: '1' } },
      path, fs: io, PRODUCT_CHANNEL: 'standalone',
      fixedFailure: (code, message) => Object.assign(new Error(message), { code }),
      require(name) {
        imports.push(name);
        if (name === '../core/ownership-control') return f.api;
        assert.equal(name, '../core/desktop-error-contract'); return { desktopErrorCode };
      }
    });
    vm.runInContext(application.slice(namespaceStart, boundary) + "\nthrow new Error('HISTORY_BOUNDARY_REACHED');\n}",
      context, { filename: file, timeout: 500 });
    const initialize = vm.runInContext('defaultDependencies', context);
    assert.throws(() => initialize({ dataRoot: selectedRoot, startupDiagnostic(event, fields) {
      events.push([event, fields]); if (diagnosticsThrow) throw Error('optional diagnostic failed');
    } }), { code: 'STANDALONE_OWNERSHIP_RUNTIME_INVALID' });
    assert.deepEqual(imports, ['../core/ownership-control', '../core/desktop-error-contract']);
    assert.deepEqual(events.map(event => event[0]), ['ownership_control_check_started', 'ownership_control_check_failed']);
    assert.equal(events[1][1].error_code, 'STANDALONE_OWNERSHIP_RUNTIME_INVALID');
    assert.deepEqual(f.events, []);
    assert.deepEqual(writes, platform === 'win32' ? [] : [selectedRoot], 'native refusal precedes every workspace write');
  }
});

test('Darwin startup refuses missing static attestation before mkdir, diagnostics and history dependencies', () => {
  const file = path.join(repository, 'plugins/data-secure/server/standalone/application-service.js');
  const application = fs.readFileSync(file, 'utf8'), start = application.indexOf('function assertNativeStandaloneNamespace(');
  const boundary = application.indexOf("  const { createRunHistory } = require('./run-history');", start);
  assert.ok(start > 0 && boundary > start);
  for (const env of [{ DATASECURE_NATIVE_EXPORT_CHANNEL: '1' },
    { DATASECURE_NATIVE_EXPORT_CHANNEL: '1', DATASECURE_MACOS_STATIC_CORE_SHA256: PIN }]) {
    const f = fixture({ platform: 'darwin', env }), writes = [], imports = [], diagnostics = [];
    const context = vm.createContext({ process: { platform: 'darwin', env }, path,
      fs: { mkdirSync(value) { writes.push(value); } }, PRODUCT_CHANNEL: 'standalone',
      fixedFailure: (code, message) => Object.assign(Error(message), { code }),
      require(name) { imports.push(name);
        if (name === '../core/ownership-control') return f.api;
        assert.equal(name, '../core/desktop-error-contract'); return { desktopErrorCode };
      }
    });
    vm.runInContext(application.slice(start, boundary) + "\nthrow Error('HISTORY_BOUNDARY_REACHED');\n}",
      context, { filename: file, timeout: 500 });
    assert.throws(() => vm.runInContext('defaultDependencies', context)({ dataRoot: '/isolated/private',
      startupDiagnostic: (...args) => diagnostics.push(args) }), { code: 'STANDALONE_OWNERSHIP_RUNTIME_INVALID' });
    assert.deepEqual(writes, []); assert.deepEqual(diagnostics, []);
    assert.deepEqual(imports, ['../core/ownership-control', '../core/desktop-error-contract']);
    assert.deepEqual(f.events, []);
  }
});

test('actual runner registers provenance once and puts its VM flag before the script', () => {
  const file = path.join(repository, 'tests/run-product-suite.js');
  const runner = fs.readFileSync(file, 'utf8'), calls = [];
  const context = vm.createContext({ module: { exports: {} }, console,
    process: { execPath: '/model/node', platform: 'win32', argv: [], env: {},
      cwd: () => '/model/repository', exit: () => assert.fail('model runner must not exit') },
    require(name) {
      if (name === 'child_process') return { spawnSync(...args) { calls.push(args); return { status: 0 }; } };
      if (name === 'node:fs' || name === 'node:os') return {};
      assert.fail('unexpected runner dependency: ' + name);
    }
  });
  vm.runInContext(runner, context, { filename: file, timeout: 500 });
  const api = context.module.exports, probe = 'tests/test-macos-core-artifact-provenance.mjs';
  for (const profile of ['ci', 'headless', 'full']) {
    const plan = api.executionPlan(profile, profile === 'full' ? ['--allow-native-ui'] : [], 'win32');
    assert.equal(plan.headlessFiles.filter(value => value === probe).length, 1);
  }
  assert.equal(api.executionPlan('native-ui', ['--allow-native-ui'], 'win32').headlessFiles.length, 0);
  assert.equal(api.duplicateEntries().length, 0);
  const run = vm.runInContext('run', context);
  run(probe, ['script-argument']); run('tests/test-ownership-control.js', ['script-argument']);
  assert.deepEqual(Array.from(calls[0][1]), ['--experimental-vm-modules', probe, 'script-argument']);
  assert.deepEqual(Array.from(calls[1][1]), ['tests/test-ownership-control.js', 'script-argument']);
  assert.equal(calls[0][2].shell, false); assert.equal(calls[1][2].shell, false);
});
