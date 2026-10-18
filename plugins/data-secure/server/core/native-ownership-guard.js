'use strict';

// Internal bootstrap dependency, not renderer/MCP input. The caller must obtain
// the digest/path from the already verified immutable runtime/package evidence.
// There is intentionally no environment lookup, sibling checksum, auto-build,
// JavaScript lock fallback or default unverified native-module search path.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { types } = require('node:util');
const { bindDirectory, assertDirectory, fileIdentity, sameFile, readHeldBytes } = require('./bound-file-io');
const SCHEMA = 'datasecure-native-ownership-guard/1';
const NATIVE_KEYS = ['abi', 'assertHeld', 'closeRoot', 'createRoot', 'release', 'tryAcquire'];
const loaded = new Map();
const fail = code => Object.assign(new Error(code), { code });
function dataObject(value, keys) {
  if (!value || typeof value !== 'object' || types.isProxy(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw fail('OWNERSHIP_GUARD_INVALID');
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || names.some(key => typeof key !== 'string' || !keys.includes(key)))
    throw fail('OWNERSHIP_GUARD_INVALID');
  const result = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw fail('OWNERSHIP_GUARD_INVALID');
    result[key] = descriptor.value;
  }
  return result;
}
function target() {
  if (process.platform === 'win32' && process.arch === 'x64') return 'windows-x64';
  if (process.platform === 'darwin' && ['x64', 'arm64'].includes(process.arch)) return `macos-${process.arch}`;
  throw fail('OWNERSHIP_GUARD_UNAVAILABLE');
}
function binaryTarget(bytes, selected) {
  if (bytes.length < 64) throw fail('OWNERSHIP_GUARD_INTEGRITY_FAILED');
  if (selected === 'windows-x64') {
    const pe = bytes.readUInt32LE(0x3c);
    if (bytes.readUInt16LE(0) !== 0x5a4d || pe > bytes.length - 24 ||
        bytes.toString('ascii', pe, pe + 4) !== 'PE\0\0' || bytes.readUInt16LE(pe + 4) !== 0x8664 ||
        (bytes.readUInt16LE(pe + 22) & 0x2000) === 0) throw fail('OWNERSHIP_GUARD_INTEGRITY_FAILED');
  } else if (bytes.readUInt32LE(0) !== 0xfeedfacf || bytes.readUInt32LE(4) !==
      (selected === 'macos-arm64' ? 0x0100000c : 0x01000007) || bytes.readUInt32LE(12) !== 8) {
    throw fail('OWNERSHIP_GUARD_INTEGRITY_FAILED');
  }
}
function nativeModule(supplied) {
  // macOS never reaches process.dlopen or accepts the Windows addon descriptor.
  if (process.platform === 'darwin')
    return require('./macos-static-ownership-guard').loadStaticOwnershipGuard(supplied);
  const artifact = dataObject(supplied, ['schema', 'abi', 'napi', 'target', 'path', 'sha256']);
  const selected = target();
  if (artifact.schema !== SCHEMA || artifact.abi !== 1 || artifact.napi !== 8 || artifact.target !== selected ||
      typeof artifact.path !== 'string' || !path.isAbsolute(artifact.path) || path.resolve(artifact.path) !== artifact.path ||
      path.extname(artifact.path) !== '.node' || !/^[a-f0-9]{64}$/u.test(artifact.sha256) ||
      !Number.isInteger(Number(process.versions.napi)) || Number(process.versions.napi) < 8)
    throw fail('OWNERSHIP_GUARD_INVALID');
  let fd, loadingFailed = false;
  try {
    const directory = bindDirectory(path.dirname(artifact.path)); assertDirectory(directory);
    const before = fs.lstatSync(artifact.path, { bigint: true });
    const identity = fileIdentity(before, true), size = Number(before.size);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || size < 64 || size > 4 * 1024 * 1024)
      throw fail('OWNERSHIP_GUARD_INTEGRITY_FAILED');
    fd = fs.openSync(artifact.path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
    if (!sameFile(fs.fstatSync(fd, { bigint: true }), identity)) throw fail('OWNERSHIP_GUARD_INTEGRITY_FAILED');
    const bytes = readHeldBytes(fd, size), sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== artifact.sha256) throw fail('OWNERSHIP_GUARD_INTEGRITY_FAILED');
    binaryTarget(bytes, selected); assertDirectory(directory);
    const key = `${artifact.path}\0${sha256}`;
    let api = loaded.get(key);
    if (!api) {
      const module = { exports: {} };
      process.dlopen(module, artifact.path);
      api = module.exports;
      if (!api || Reflect.ownKeys(api).sort().join(',') !== NATIVE_KEYS.join(',') || api.abi !== 1 ||
          NATIVE_KEYS.filter(key => key !== 'abi').some(key => {
            const d = Object.getOwnPropertyDescriptor(api, key);
            return !d || !Object.hasOwn(d, 'value') || typeof d.value !== 'function';
          })) throw fail('OWNERSHIP_GUARD_INTEGRITY_FAILED');
      Object.freeze(api);
    }
    // A digest is not a hostile-same-user dlopen sandbox. Bootstrap must pin a
    // verified immutable artifact namespace; these checks also catch accidental
    // swaps/drift before this wrapper exposes any processing authority.
    if (!sameFile(fs.fstatSync(fd, { bigint: true }), identity) ||
        !sameFile(fs.lstatSync(artifact.path, { bigint: true }), identity) ||
        crypto.createHash('sha256').update(readHeldBytes(fd, size)).digest('hex') !== sha256)
      throw fail('OWNERSHIP_GUARD_INTEGRITY_FAILED');
    assertDirectory(directory); loaded.set(key, api); return api;
  } catch (error) {
    loadingFailed = true;
    if (/^OWNERSHIP_GUARD_/u.test(String(error?.code || ''))) throw error;
    if (['EACCES', 'EPERM'].includes(error?.code)) throw fail('OWNERSHIP_GUARD_ACCESS_DENIED');
    if (error?.code === 'ERR_DLOPEN_FAILED') {
      // Classification only: dyld/vendor strings can contain private absolute
      // paths. Never forward the original message or stack into diagnostics.
      const detail = typeof error.message === 'string' ? error.message.slice(0, 8192).toLowerCase() : '';
      if (/library validation|code signature|team id|team identifier/u.test(detail))
        throw fail('OWNERSHIP_GUARD_SIGNATURE_REFUSED');
      throw fail('OWNERSHIP_GUARD_NATIVE_LOAD_FAILED');
    }
    throw fail('OWNERSHIP_GUARD_UNAVAILABLE');
  } finally {
    if (fd !== undefined) {
      const closing = fd; fd = undefined;
      try { fs.closeSync(closing); }
      catch {
        // Consume once; an uncertain close must not expose a successful load
        // or leak raw OS data, nor erase an already classified primary cause.
        if (!loadingFailed) throw fail('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED');
      }
    }
  }
}
function createOwnershipGuard(supplied) {
  const options = dataObject(supplied, ['verifiedArtifact', 'root']);
  if (typeof options.root !== 'string' || !path.isAbsolute(options.root) || path.resolve(options.root) !== options.root)
    throw fail('OWNERSHIP_GUARD_INVALID');
  const api = nativeModule(options.verifiedArtifact);
  let directory;
  try { directory = bindDirectory(options.root); }
  catch { throw fail('OWNERSHIP_GUARD_UNSAFE'); }
  const assertRoot = () => {
    try { assertDirectory(directory); }
    catch { throw fail('OWNERSHIP_GUARD_UNSAFE'); }
  };
  assertRoot();
  const nativeRoot = api.createRoot(directory.real);
  try { assertRoot(); }
  catch (error) { api.closeRoot(nativeRoot); throw error; }
  return Object.freeze({
    tryAcquire() {
      assertRoot();
      const nativeGuard = api.tryAcquire(nativeRoot);
      if (nativeGuard === null) return null;
      try { assertRoot(); api.assertHeld(nativeGuard); }
      catch (error) { try { api.release(nativeGuard); } catch {} throw error; }
      // Keep this returned capability strongly reachable for the entire critical
      // section. No DTO, PID, token or serialized object can recreate it.
      return Object.freeze({
        assertHeld() { assertRoot(); return api.assertHeld(nativeGuard); },
        release() { return api.release(nativeGuard); }
      });
    },
    close() { return api.closeRoot(nativeRoot); }
  });
}
module.exports = Object.freeze({ SCHEMA, createOwnershipGuard });
