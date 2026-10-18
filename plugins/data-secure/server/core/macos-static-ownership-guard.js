'use strict';

// MAC-CERT-03 draft: fixed linked binding, never a macOS addon fallback.
// The descriptor's digest must come from Rust's independently verified final
// custom-Core build evidence. It is not a sibling hash or a renderer/envpath.
const fs = require('node:fs');
const path = require('node:path');
const { types } = require('node:util');
const { bindDirectory, assertDirectory, fileIdentity, sameFile, hashBoundFile } = require('./bound-file-io');
const { bundleContext, STATIC_OWNERSHIP_BUILTIN } = require('../standalone/macos-bundle-layout');
const KEYS = ['abi', 'assertHeld', 'closeRoot', 'createRoot', 'release', 'tryAcquire'];
const fail = code => Object.assign(new Error(code), { code });
let cached;

function linked() {
  if (typeof process._linkedBinding !== 'function') throw fail('OWNERSHIP_GUARD_UNAVAILABLE');
  return process._linkedBinding(STATIC_OWNERSHIP_BUILTIN.name);
}

function descriptor(value) {
  const keys = ['schema', 'abi', 'napi', 'target', 'core_sha256'];
  if (!value || typeof value !== 'object' || types.isProxy(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== keys.length) throw fail('OWNERSHIP_GUARD_INVALID');
  const result = Object.create(null);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) throw fail('OWNERSHIP_GUARD_INVALID');
    result[key] = d.value;
  }
  if (process.platform !== 'darwin' || !['x64', 'arm64'].includes(process.arch) ||
      process.versions.node !== '22.23.2' || !Number.isInteger(Number(process.versions.napi)) || Number(process.versions.napi) < 8 ||
      result.schema !== 'datasecure-static-ownership-core/1' || result.abi !== 1 ||
      result.napi !== 8 || result.target !== `macos-${process.arch}` ||
      typeof result.core_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(result.core_sha256)) throw fail('OWNERSHIP_GUARD_INVALID');
  return result;
}

function loadStaticOwnershipGuard(supplied) {
  const selected = descriptor(supplied);
  try {
    const bundle = bundleContext(path.resolve(__dirname, '..'));
    if (!bundle) throw fail('OWNERSHIP_GUARD_UNAVAILABLE');
    const expectedFile = bundle.core;
    // Bind the fixed bundle role even when the OS exposes a canonical alias.
    // hashBoundFile rejects a symlink at the actual expected file namespace.
    if (fs.realpathSync(process.execPath) !== fs.realpathSync(expectedFile))
      throw fail('OWNERSHIP_GUARD_INTEGRITY_FAILED');
    const directory = cached?.path === expectedFile ? cached.directory : bindDirectory(path.dirname(expectedFile));
    assertDirectory(directory);
    const before = fs.lstatSync(expectedFile, { bigint: true });
    const identity = fileIdentity(before, true);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n ||
        before.size < 64n || before.size > 128n * 1024n * 1024n)
      throw fail('OWNERSHIP_GUARD_INTEGRITY_FAILED');
    let api;
    if (cached?.path === expectedFile && cached.sha256 === selected.core_sha256 && sameFile(before, cached.identity)) {
      api = cached.api;
    } else {
      // Stream the held FD: do not allocate a Core-sized Buffer. The shared
      // boundary checks identity/ctime and all parent bindings before/after.
      if (hashBoundFile(expectedFile, { directory, minimum: 64, maximum: 128 * 1024 * 1024, checkCtime: true }) !== selected.core_sha256)
        throw fail('OWNERSHIP_GUARD_INTEGRITY_FAILED');
      try { api = linked(); }
      catch { throw fail('OWNERSHIP_GUARD_UNAVAILABLE'); }
      if (!api || typeof api !== 'object' || types.isProxy(api) ||
          Reflect.ownKeys(api).sort().join(',') !== KEYS.join(','))
        throw fail('OWNERSHIP_GUARD_INTEGRITY_FAILED');
      for (const key of KEYS) {
        const d = Object.getOwnPropertyDescriptor(api, key);
        if (!d || !Object.hasOwn(d, 'value') ||
            (key === 'abi' ? d.value !== 1 : typeof d.value !== 'function'))
          throw fail('OWNERSHIP_GUARD_INTEGRITY_FAILED');
      }
      Object.freeze(api);
    }
    if (!sameFile(fs.lstatSync(expectedFile, { bigint: true }), identity))
      throw fail('OWNERSHIP_GUARD_INTEGRITY_FAILED');
    assertDirectory(directory);
    cached = { path: expectedFile, sha256: selected.core_sha256, identity, directory, api };
    return api;
  } catch (error) {
    if (/^OWNERSHIP_GUARD_/u.test(String(error?.code || ''))) throw error;
    if (['EACCES', 'EPERM'].includes(error?.code)) throw fail('OWNERSHIP_GUARD_ACCESS_DENIED');
    throw fail('OWNERSHIP_GUARD_INTEGRITY_FAILED');
  }
}

// Negative role proof for the OFFICIAL converter/legacy parser. This does not
// approve an executable; its independent official-Node inventory still does.
// Presence is sufficient to refuse even if the child lost every capability env.
function assertParserCore(code) {
  if (process.platform !== 'darwin') return;
  try { linked(); }
  catch (error) {
    // Node uses ERR_INVALID_MODULE for both a missing name and a PRESENT linked
    // module without an entry point. Only its exact, own missing-name result
    // proves absence. Never invoke an accessor or inspect a Proxy as evidence.
    if (error && typeof error === 'object' && !types.isProxy(error) &&
        Object.getOwnPropertyDescriptor(error, 'code')?.value === 'ERR_INVALID_MODULE' &&
        Object.getOwnPropertyDescriptor(error, 'message')?.value ===
          `No such binding was linked: ${STATIC_OWNERSHIP_BUILTIN.name}`) return;
    throw fail(code);
  }
  throw fail(code);
}

module.exports = Object.freeze({ loadStaticOwnershipGuard, assertParserCore });
