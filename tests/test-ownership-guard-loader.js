'use strict';

// Actual Windows addon and Darwin static-loader source with explicit FS/API models. No real addon,
// OS signature enforcement, Mac host or package acceptance is exercised here.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { desktopErrorCode, DESKTOP_ERROR_CODES } = require('../plugins/data-secure/server/core/desktop-error-contract');

const source = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/core/native-ownership-guard.js'), 'utf8');
const PRIVATE = 'PRIVATE_VENDOR_SENTINEL /Users/Confidential Customer/Secret.app/Contents/Frameworks/private.node';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const dto = fields => Object.assign(Object.create(null), fields);
const nativeError = (code, message = PRIVATE) => Object.assign(new Error(message), {
  code, path: PRIVATE, syscall: 'dlopen', vendor_detail: PRIVATE, cause: { message: PRIVATE }
});
function thrown(callback) {
  try { callback(); }
  catch (error) { return error; }
  assert.fail('expected loader refusal');
}
function sanitized(error, expected) {
  assert.equal(error?.code, expected);
  assert.equal(error.message, expected);
  assert.equal(error.cause, undefined);
  assert.equal(error.path, undefined);
  assert.equal(error.vendor_detail, undefined);
  const evidence = JSON.stringify(error, Object.getOwnPropertyNames(error));
  for (const fragment of ['PRIVATE_VENDOR_SENTINEL', 'Confidential Customer', 'private.node'])
    assert.ok(!evidence.includes(fragment), 'fixed error must not carry vendor message, stack, path or cause');
}

class InjectedLoader {
  constructor(options = {}) {
    this.options = options;
    this.platform = options.platform || 'win32'; this.arch = options.arch || 'x64';
    this.path = this.platform === 'win32' ? path.win32 : path.posix;
    this.filename = this.platform === 'win32' ? 'C:\\private-runtime\\ownership-guard.node' : '/private-runtime/ownership-guard.node';
    this.root = this.platform === 'win32' ? 'C:\\isolated\\private' : '/isolated/private';
    this.events = []; this.closed = 0; this.nativeRoots = 0;
    // Only the tiny header consumed by binaryTarget is modeled, not a runnable binary.
    this.bytes = Buffer.alloc(128);
    if (this.platform === 'win32') {
      this.bytes.writeUInt16LE(0x5a4d); this.bytes.writeUInt32LE(64, 60);
      this.bytes.write('PE\0\0', 64, 'ascii'); this.bytes.writeUInt16LE(0x8664, 68); this.bytes.writeUInt16LE(0x2000, 86);
    } else {
      this.bytes.writeUInt32LE(0xfeedfacf); this.bytes.writeUInt32LE(this.arch === 'arm64' ? 0x0100000c : 0x01000007, 4);
      this.bytes.writeUInt32LE(8, 12);
    }
    this.identity = Object.freeze({ identity: 'one-held-model-file' });
    this.stat = { size: BigInt(this.bytes.length), nlink: 1n, isFile: () => true, isSymbolicLink: () => false };
    this.nativeRoot = Object.freeze({ root: 'opaque-model-root' });
    this.nativeGuard = Object.freeze({ guard: 'opaque-model-guard' });
    const api = dto({ abi: 1,
      createRoot: real => { this.nativeRoots++; assert.equal(real, this.root); return this.nativeRoot; },
      tryAcquire: root => { assert.equal(root, this.nativeRoot); return this.nativeGuard; },
      assertHeld: guard => { assert.equal(guard, this.nativeGuard); return true; },
      release: guard => { assert.equal(guard, this.nativeGuard); return true; },
      closeRoot: root => { assert.equal(root, this.nativeRoot); return true; }
    });
    const binding = {
      bindDirectory: name => { this.step('bind'); return Object.freeze({ real: name }); },
      assertDirectory: () => { this.step('directory'); },
      fileIdentity: () => this.identity,
      sameFile: (stat, identity) => stat === this.stat && identity === this.identity,
      readHeldBytes: (fd, size) => { this.step('read'); assert.equal(fd, 71); assert.equal(size, this.bytes.length); return Buffer.from(this.bytes); }
    };
    const io = {
      constants: { O_RDONLY: 0, O_NOFOLLOW: 0x100, O_NONBLOCK: 0x200 },
      lstatSync: filename => { this.step('lstat'); assert.equal(filename, this.filename); return this.stat; },
      openSync: filename => { this.step('open'); assert.equal(filename, this.filename); return 71; },
      fstatSync: fd => { this.step('fstat'); assert.equal(fd, 71); return this.stat; },
      closeSync: fd => {
        assert.equal(fd, 71); this.closed++; this.events.push('close');
        if (options.closeError) throw options.closeError;
      }
    };
    const context = vm.createContext({ module: { exports: {} },
      process: { platform: this.platform, arch: this.arch, versions: { napi: '10' },
        dlopen: (module, filename) => { this.step('dlopen'); assert.equal(filename, this.filename); module.exports = api; } },
      require: name => {
        if (name === 'node:fs') return io;
        if (name === 'node:path') return this.path;
        if (name === 'node:crypto' || name === 'node:util') return require(name);
        assert.equal(name, './bound-file-io'); return binding;
      }
    });
    vm.runInContext(source, context, { filename: 'ownership-guard-loader-model.cjs', timeout: 500 });
    this.api = context.module.exports;
  }
  step(name) { this.events.push(name); if (this.options.failAt === name) throw this.options.error; }
  artifact() {
    return dto({ schema: 'datasecure-native-ownership-guard/1', abi: 1, napi: 8,
      target: this.platform === 'win32' ? 'windows-x64' : `macos-${this.arch}`,
      path: this.filename, sha256: hash(this.bytes) });
  }
  create(artifact = this.artifact()) { return this.api.createOwnershipGuard(dto({ root: this.root, verifiedArtifact: artifact })); }
}

test('injected loader reaches fixed headers, validated exports and returned guard capabilities', () => {
  for (const [platform, arch] of [['win32', 'x64']]) {
    const f = new InjectedLoader({ platform, arch }), factory = f.create();
    assert.equal(f.closed, 1); assert.equal(f.nativeRoots, 1);
    assert.equal(f.events.filter(event => event === 'dlopen').length, 1);
    const guard = factory.tryAcquire(); assert.ok(Object.isFrozen(factory) && Object.isFrozen(guard));
    assert.equal(guard.assertHeld(), true); assert.equal(guard.release(), true); assert.equal(factory.close(), true);
  }
});

test('EACCES and EPERM have fixed access codes without original native or filesystem details', () => {
  for (const code of ['EACCES', 'EPERM']) for (const failAt of ['lstat', 'open', 'fstat', 'read', 'dlopen']) {
    const f = new InjectedLoader({ failAt, error: nativeError(code) });
    sanitized(thrown(() => f.create()), 'OWNERSHIP_GUARD_ACCESS_DENIED');
    assert.equal(f.closed, ['lstat', 'open'].includes(failAt) ? 0 : 1);
    assert.equal(f.nativeRoots, 0);
  }
});

test('Windows addon signature refusal remains one safe fixed code', () => {
  for (const detail of ['Library Validation', 'code signature invalid', 'have different Team IDs', 'TEAM IDENTIFIER mismatch']) {
    const f = new InjectedLoader({ failAt: 'dlopen', error: nativeError('ERR_DLOPEN_FAILED', PRIVATE + ': ' + detail) });
    sanitized(thrown(() => f.create()), 'OWNERSHIP_GUARD_SIGNATURE_REFUSED');
    assert.equal(f.closed, 1); assert.equal(f.nativeRoots, 0);
  }
});

test('other dlopen failures remain native-load failures with no vendor strings', () => {
  for (const message of [PRIVATE + ': image not found', PRIVATE + ': incompatible architecture', undefined, 42]) {
    const error = nativeError('ERR_DLOPEN_FAILED'); error.message = message;
    const f = new InjectedLoader({ failAt: 'dlopen', error });
    sanitized(thrown(() => f.create()), 'OWNERSHIP_GUARD_NATIVE_LOAD_FAILED');
    assert.equal(f.closed, 1); assert.equal(f.nativeRoots, 0);
  }
});

test('bounded addon classification does not copy long vendor data or inspect beyond its limit', () => {
  for (const [message, code] of [
    ['code signature ' + PRIVATE + 'x'.repeat(9000), 'OWNERSHIP_GUARD_SIGNATURE_REFUSED'],
    [PRIVATE + 'x'.repeat(9000) + ' code signature', 'OWNERSHIP_GUARD_NATIVE_LOAD_FAILED']
  ]) {
    const f = new InjectedLoader({ failAt: 'dlopen', error: nativeError('ERR_DLOPEN_FAILED', message) });
    sanitized(thrown(() => f.create()), code); assert.equal(f.closed, 1);
  }
});

test('unknown/falsy loading failures are unavailable rather than exposing thrown values', () => {
  for (const error of [undefined, null, false, 0, PRIVATE, nativeError('EIO')]) {
    const f = new InjectedLoader({ failAt: 'read', error });
    sanitized(thrown(() => f.create()), 'OWNERSHIP_GUARD_UNAVAILABLE'); assert.equal(f.closed, 1);
  }
});

test('integrity and architecture failures retain their closed code and never call dlopen', () => {
  const badPin = new InjectedLoader(), artifact = badPin.artifact(); artifact.sha256 = '0'.repeat(64);
  sanitized(thrown(() => badPin.create(artifact)), 'OWNERSHIP_GUARD_INTEGRITY_FAILED');
  assert.equal(badPin.closed, 1); assert.ok(!badPin.events.includes('dlopen'));
  const wrongCpu = new InjectedLoader(); wrongCpu.bytes.writeUInt16LE(0xaa64, 68);
  sanitized(thrown(() => wrongCpu.create()), 'OWNERSHIP_GUARD_INTEGRITY_FAILED');
  assert.equal(wrongCpu.closed, 1); assert.ok(!wrongCpu.events.includes('dlopen'));
});

test('new loader diagnostics map only to fixed closed desktop codes', () => {
  for (const [internal, desktop] of [
    ['OWNERSHIP_GUARD_ACCESS_DENIED', 'STANDALONE_OWNERSHIP_RUNTIME_DENIED'],
    ['OWNERSHIP_GUARD_SIGNATURE_REFUSED', 'STANDALONE_OWNERSHIP_SIGNATURE_REFUSED'],
    ['OWNERSHIP_GUARD_NATIVE_LOAD_FAILED', 'STANDALONE_OWNERSHIP_RUNTIME_LOAD_FAILED']
  ]) {
    assert.equal(desktopErrorCode(internal), desktop); assert.ok(DESKTOP_ERROR_CODES.includes(desktop));
    assert.equal(desktopErrorCode(desktop), desktop);
  }
  assert.equal(desktopErrorCode(PRIVATE), 'STANDALONE_OPERATION_FAILED');
});

test('changed control root becomes a fixed ownership refusal before protected callbacks', () => {
  const f = new InjectedLoader(), factory = f.create();
  f.options.failAt = 'directory'; f.options.error = nativeError('BOUND_FILE_CHANGED');
  sanitized(thrown(() => factory.tryAcquire()), 'OWNERSHIP_GUARD_UNSAFE');
});

test('read-descriptor close failure must also remain inside the fixed error vocabulary', () => {
  for (const loadError of [null, nativeError('ERR_DLOPEN_FAILED', PRIVATE + ': code signature invalid')]) {
    const f = new InjectedLoader({ ...(loadError ? { failAt: 'dlopen', error: loadError } : {}), closeError: nativeError('EIO') });
    const error = thrown(() => f.create());
    assert.equal(error.code, loadError ? 'OWNERSHIP_GUARD_SIGNATURE_REFUSED' : 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED');
    assert.match(error?.code || '', /^OWNERSHIP_GUARD_/u, 'finally must not bypass the loader error boundary');
    sanitized(error, error.code); assert.equal(f.closed, 1);
    assert.equal(f.nativeRoots, 0, 'no processing authority may be exposed after uncertain read-FD close');
  }
});


// Exact future Darwin modules, explicit RAM IO/linked-binding models. These
// prove no C/NAPI lifetime, codesign, Fork/Worker Environment or Mac execution.
const STATIC_NAME = 'datasecure_ownership_guard';
const STATIC_LAYOUT = Object.freeze({ name: STATIC_NAME, abi: 1, napi: 8, node: '22.23.2' });
const staticFile = path.join(__dirname, '../plugins/data-secure/server/core/macos-static-ownership-guard.js');
const evidenceFile = path.join(__dirname, '../plugins/data-secure/server/core/macos-static-runtime-evidence.js');
const staticSource = fs.readFileSync(staticFile, 'utf8');
const evidenceSource = fs.readFileSync(evidenceFile, 'utf8');
function sourceModule(text, name, processModel, dependencies) {
  const module = { exports: {} };
  const context = vm.createContext({ module, Buffer, process: processModel,
    __dirname: '/isolated/DataSecure.app/Contents/Resources/server/core',
    require(id) {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      if (['node:path', 'node:crypto', 'node:util'].includes(id)) return id === 'node:path' ? path.posix : require(id);
      throw Error('UNEXPECTED_STATIC_MODEL_DEPENDENCY:' + id);
    }
  });
  vm.runInContext(text, context, { filename: name, timeout: 1000 }); return module.exports;
}
class StaticLoader {
  constructor(options = {}) {
    this.options = options; this.events = []; this.nativeRoots = 0; this.dlopenCalls = 0;
    this.arch = options.arch || 'arm64'; this.root = '/isolated/private';
    this.core = '/isolated/DataSecure.app/Contents/MacOS/datasecure-core';
    this.bytes = Buffer.alloc(96, 17); this.pin = hash(this.bytes);
    this.identity = Object.freeze({ modelIdentity: 1 });
    this.stat = { size: 96n, nlink: 1n, isFile: () => true, isSymbolicLink: () => false };
    this.rootHandle = Object.freeze({}), this.guardHandle = Object.freeze({});
    this.native = dto({ abi: 1,
      createRoot: root => { assert.equal(root, this.root); this.nativeRoots++; return this.rootHandle; },
      tryAcquire: root => { assert.equal(root, this.rootHandle); return this.guardHandle; },
      assertHeld: guard => { assert.equal(guard, this.guardHandle); return true; },
      release: guard => { assert.equal(guard, this.guardHandle); return true; },
      closeRoot: root => { assert.equal(root, this.rootHandle); return true; }
    });
    options.mutateApi?.(this.native);
    this.process = { platform: 'darwin', arch: this.arch, versions: { node: '22.23.2', napi: '10' },
      execPath: options.execPath || this.core,
      dlopen: () => { this.dlopenCalls++; assert.fail('Darwin may never dlopen an ownership addon'); },
      _linkedBinding: name => {
        this.events.push('linked'); assert.equal(name, STATIC_NAME);
        if (Object.hasOwn(options, 'linkedError')) throw options.linkedError;
        return this.native;
      }
    };
    if (options.missingLinkedFunction) delete this.process._linkedBinding;
    if (options.nodeVersion) this.process.versions.node = options.nodeVersion;
    if (options.napi) this.process.versions.napi = options.napi;
    this.binding = {
      bindDirectory: name => { this.events.push('bind'); return { real: name }; },
      assertDirectory: directory => {
        if (directory.real === this.root && options.rootChanged) throw nativeError('BOUND_FILE_CHANGED');
        this.events.push('directory');
      },
      fileIdentity: () => this.identity,
      sameFile: (stat, identity) => stat === this.stat && identity === this.identity,
      hashBoundFile: (file, settings) => {
        this.events.push('hash'); assert.equal(file, this.core); assert.equal(settings.minimum, 64);
        assert.equal(settings.maximum, 128 * 1024 * 1024); assert.equal(settings.checkCtime, true);
        if (options.hashError) throw options.hashError;
        return options.badHash ? '0'.repeat(64) : this.pin;
      }
    };
    const io = { realpathSync: file => file,
      lstatSync: (file, settings) => { assert.equal(file, this.core); assert.equal(settings.bigint, true);
        if (options.statError) throw options.statError;
        return this.stat;
      } };
    const layout = { STATIC_OWNERSHIP_BUILTIN: STATIC_LAYOUT, bundleContext: () => options.noBundle ? null :
      { core: this.core, contents: '/isolated/DataSecure.app/Contents', target: 'macos-' + this.arch } };
    this.static = sourceModule(staticSource, 'actual-static-loader-model.cjs', this.process,
      { 'node:fs': io, './bound-file-io': this.binding, '../standalone/macos-bundle-layout': layout });
    this.wrapper = sourceModule(source, 'actual-native-wrapper-darwin-model.cjs', this.process,
      { 'node:fs': io, './bound-file-io': this.binding, './macos-static-ownership-guard': this.static });
  }
  artifact() { return dto({ schema: 'datasecure-static-ownership-core/1', abi: 1, napi: 8,
    target: 'macos-' + this.arch, core_sha256: this.pin }); }
  create(value = this.artifact()) { return this.wrapper.createOwnershipGuard(dto({ root: this.root, verifiedArtifact: value })); }
}
test('Darwin wrapper uses actual fixed linked binding for both Core architectures and never dlopen', () => {
  for (const arch of ['arm64', 'x64']) {
    const f = new StaticLoader({ arch }), factory = f.create(), guard = factory.tryAcquire();
    assert.equal(guard.assertHeld(), true); assert.equal(guard.release(), true); assert.equal(factory.close(), true);
    assert.equal(f.nativeRoots, 1); assert.equal(f.dlopenCalls, 0);
    assert.deepEqual(f.events.filter(event => ['hash', 'linked'].includes(event)), ['hash', 'linked']);
  }
});
test('Darwin rejects addon DTOs, invalid static descriptors and unsupported Node/NAPI before native roots', () => {
  const addon = new InjectedLoader().artifact();
  for (const value of [addon, { ...new StaticLoader().artifact(), path: '/untrusted/addon.node' },
    { ...new StaticLoader().artifact(), target: 'macos-x64' }, { ...new StaticLoader().artifact(), core_sha256: 'A'.repeat(64) }]) {
    const f = new StaticLoader(); sanitized(thrown(() => f.create(value)), 'OWNERSHIP_GUARD_INVALID');
    assert.equal(f.nativeRoots, 0); assert.equal(f.dlopenCalls, 0);
  }
  for (const options of [{ nodeVersion: '22.23.1' }, { napi: '7' }]) {
    const f = new StaticLoader(options); sanitized(thrown(() => f.create()), 'OWNERSHIP_GUARD_INVALID'); assert.equal(f.nativeRoots, 0);
  }
});
test('Darwin missing bundle/Core pin/builtin, hash mismatch and filesystem refusal never fall back to addon', () => {
  for (const [options, code] of [[{ noBundle: true }, 'OWNERSHIP_GUARD_UNAVAILABLE'],
    [{ execPath: '/isolated/DataSecure.app/Contents/MacOS/datasecure-conversion-node' }, 'OWNERSHIP_GUARD_INTEGRITY_FAILED'],
    [{ badHash: true }, 'OWNERSHIP_GUARD_INTEGRITY_FAILED'],
    [{ missingLinkedFunction: true }, 'OWNERSHIP_GUARD_UNAVAILABLE'],
    [{ linkedError: nativeError('ERR_INVALID_MODULE', 'No such binding was linked: ' + STATIC_NAME) }, 'OWNERSHIP_GUARD_UNAVAILABLE'],
    [{ hashError: nativeError('EACCES') }, 'OWNERSHIP_GUARD_ACCESS_DENIED']]) {
    const f = new StaticLoader(options); sanitized(thrown(() => f.create()), code);
    assert.equal(f.nativeRoots, 0); assert.equal(f.dlopenCalls, 0);
  }
});
test('Darwin native export shape is exact data, not getters, proxies or an ABI claim alone', () => {
  let traps = 0;
  for (const mutateApi of [api => { api.abi = 2; }, api => { api.extra = () => {}; },
    api => { Object.defineProperty(api, 'createRoot', { get() { traps++; return () => {}; } }); }]) {
    const f = new StaticLoader({ mutateApi }); sanitized(thrown(() => f.create()), 'OWNERSHIP_GUARD_INTEGRITY_FAILED');
    assert.equal(f.nativeRoots, 0);
  }
  assert.equal(traps, 0);
});
test('Darwin static loader reuses only unchanged bound Core identity and rehashes a replacement', () => {
  const f = new StaticLoader(); f.static.loadStaticOwnershipGuard(f.artifact()); f.static.loadStaticOwnershipGuard(f.artifact());
  assert.equal(f.events.filter(event => event === 'hash').length, 1);
  f.identity = Object.freeze({ modelIdentity: 2 });
  f.static.loadStaticOwnershipGuard(f.artifact());
  assert.equal(f.events.filter(event => event === 'hash').length, 2);
});
test('Darwin root rebinding is refused by the actual returned guard before protected callbacks', () => {
  const f = new StaticLoader(), factory = f.create(); f.options.rootChanged = true;
  sanitized(thrown(() => factory.tryAcquire()), 'OWNERSHIP_GUARD_UNSAFE'); assert.equal(f.dlopenCalls, 0);
});
test('official-parser role permits only the exact missing-name condition in the Node22 source model', () => {
  const missing = nativeError('ERR_INVALID_MODULE', 'No such binding was linked: ' + STATIC_NAME);
  const f = new StaticLoader({ linkedError: missing });
  assert.doesNotThrow(() => f.static.assertParserCore('PARSER_ISOLATION_FAILED'));
  const present = new StaticLoader();
  sanitized(thrown(() => present.static.assertParserCore('PARSER_ISOLATION_FAILED')), 'PARSER_ISOLATION_FAILED');
  const unknown = new StaticLoader({ linkedError: nativeError('EIO') });
  sanitized(thrown(() => unknown.static.assertParserCore('PARSER_ISOLATION_FAILED')), 'PARSER_ISOLATION_FAILED');
});
// Regression for the independently reproduced consumer defect: Node22 uses
// ERR_INVALID_MODULE for BOTH absence and a PRESENT module without entry point.
// The product must distinguish those results, not weaken this expectation.
test('parser role must refuse PRESENT linked module with missing entry point, not certify absence', () => {
  const broken = new StaticLoader({ linkedError: nativeError('ERR_INVALID_MODULE', 'Linked binding has no declared entry point.') });
  sanitized(thrown(() => broken.static.assertParserCore('PARSER_ISOLATION_FAILED')), 'PARSER_ISOLATION_FAILED');
});

test('parser role rejects forged missing-name evidence without evaluating getters or Proxies', () => {
  let traps = 0;
  const missing = 'No such binding was linked: ' + STATIC_NAME;
  const inherited = Object.create({ code: 'ERR_INVALID_MODULE', message: missing });
  const getter = { code: 'ERR_INVALID_MODULE', get message() { traps++; return missing; } };
  const proxy = new Proxy({}, { get() { traps++; return missing; }, getOwnPropertyDescriptor() { traps++; return undefined; } });
  for (const linkedError of [inherited, getter, proxy, nativeError('ERR_INVALID_MODULE', missing + ' trailing')]) {
    const f = new StaticLoader({ linkedError });
    sanitized(thrown(() => f.static.assertParserCore('PARSER_ISOLATION_FAILED')), 'PARSER_ISOLATION_FAILED');
  }
  assert.equal(traps, 0);
});

const canonical = value => JSON.stringify(value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))]))
  : Array.isArray(value) ? value.map(v => JSON.parse(canonical(v))) : value);
function runtimeEvidenceFixture(options = {}) {
  const arch = options.arch || 'arm64', target = 'macos-' + arch;
  const core = Buffer.alloc(96, 5), converter = Buffer.alloc(80, 7), pin = hash(core);
  const artifact = { schema: 'datasecure-macos-static-core-artifact/1', role: 'mutating-core', target,
    core: { bytes: core.length, sha256: pin } };
  const artifactPin = hash(Buffer.from(canonical(artifact)));
  const evidence = { schema: 'datasecure-standalone-macos-runtime-evidence/2', target, node_version: '22.23.2',
    core: { role: 'mutating-core', bytes: core.length, sha256: pin, artifact_sha256: artifactPin,
      static_binding: { name: STATIC_NAME, abi: 1, napi: 8 } },
    converter: { role: 'official-converter', archive_sha256: 'a'.repeat(64), bytes: converter.length,
      sha256: hash(converter), license_sha256: 'b'.repeat(64) } };
  const env = { DATASECURE_MACOS_STATIC_CORE_SHA256: pin, DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256: artifactPin };
  const context = { target, contents: '/isolated/DataSecure.app/Contents', core: '/isolated/DataSecure.app/Contents/MacOS/datasecure-core' };
  options.mutate?.({ env, evidence, artifact, context });
  const calls = [], processModel = { platform: 'darwin', arch, env, execPath: options.execPath || context.core };
  const api = sourceModule(evidenceSource, 'actual-runtime-evidence-model.cjs', processModel, {
    'node:fs': { realpathSync: file => file },
    './bound-file-io': {
      readBoundFile(file, settings) {
        calls.push('read'); assert.equal(settings.checkCtime, true); assert.equal(settings.maximum, 128 * 1024);
        assert.equal(settings.minimum, 1); if (options.readError) throw options.readError;
        assert.ok(['RUNTIME-EVIDENCE.json', 'MACOS-CORE-ARTIFACT.json'].includes(path.posix.basename(file)));
        return Buffer.from(JSON.stringify(file.endsWith('RUNTIME-EVIDENCE.json') ? evidence : artifact));
      },
      hashBoundFile(file, settings) { calls.push('hash'); assert.equal(file, context.core); assert.equal(settings.checkCtime, true);
        return options.badCoreHash ? '0'.repeat(64) : pin; }
    },
    '../standalone/macos-bundle-layout': { STATIC_OWNERSHIP_BUILTIN: STATIC_LAYOUT, bundleContext: () => options.noBundle ? null : context },
    './macos-static-ownership-guard': { loadStaticOwnershipGuard(value) {
      calls.push('linked-role'); assert.equal(value.core_sha256, pin); assert.equal(value.target, target);
      if (options.guardFailure) throw nativeError('OWNERSHIP_GUARD_UNAVAILABLE');
    } }
  });
  return { verify: () => api.verify(options.target || target), calls, target, artifactPin };
}
test('actual runtime-evidence module accepts fixed Core role plus independently supplied artifact pin for both targets', () => {
  for (const arch of ['arm64', 'x64']) {
    const f = runtimeEvidenceFixture({ arch }), result = JSON.parse(JSON.stringify(f.verify()));
    assert.deepEqual(result, { checked: true, target: f.target, role: 'mutating-core', artifact_sha256: f.artifactPin });
    assert.deepEqual(f.calls, ['linked-role', 'read', 'read', 'hash']);
  }
});
test('runtime-evidence missing/wrong pins, roles, target, fields and bound Core bytes are closed refusals', () => {
  for (const options of [
    { mutate: ({ env }) => { delete env.DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256; } },
    { mutate: ({ env }) => { env.DATASECURE_MACOS_STATIC_CORE_SHA256 = 'A'.repeat(64); } },
    { mutate: ({ artifact }) => { artifact.core.sha256 = '0'.repeat(64); } },
    { mutate: ({ evidence }) => { evidence.core.role = 'official-converter'; } },
    { mutate: ({ evidence }) => { evidence.converter.role = 'mutating-core'; } },
    { mutate: ({ evidence }) => { evidence.converter.sha256 = evidence.core.sha256; } },
    { mutate: ({ evidence }) => { evidence.core.static_binding.name = 'untrusted_binding'; } },
    { mutate: ({ evidence }) => { evidence.core.bytes = 63; } },
    { mutate: ({ evidence }) => { evidence.core.extra = 1; } },
    { target: 'macos-x64' }, { badCoreHash: true }, { noBundle: true }, { guardFailure: true },
    { execPath: '/isolated/official-converter' }, { readError: nativeError('EACCES') }
  ]) {
    const f = runtimeEvidenceFixture(options); sanitized(thrown(f.verify), 'RUNTIME_INTEGRITY_FAILED');
  }
});
