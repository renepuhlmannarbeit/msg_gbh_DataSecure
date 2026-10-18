'use strict';

// Native Standalone ownership transitions only. Cowork/source adapters retain
// their separate legacy protocol; missing native configuration is NEVER a
// reason to silently select that protocol in a real native desktop process.
const path = require('node:path');
const { createOwnershipGuard } = require('./native-ownership-guard');
const { bundleContext } = require('../standalone/macos-bundle-layout');
let verifiedArtifact = null;
let releaseUnconfirmed = false;
const active = new Map();
const failure = code => Object.assign(new Error(code), { code });

function configureOwnershipControl(artifact) {
  if (verifiedArtifact || active.size) throw failure('OWNERSHIP_GUARD_ALREADY_CONFIGURED');
  // No getters/proxies are copied into the trusted input. Full descriptor,
  // target, byte hash and native-format validation remains in the loader.
  const { types } = require('node:util');
  const keys = process.platform === 'darwin'
    ? ['schema', 'abi', 'napi', 'target', 'core_sha256']
    : ['schema', 'abi', 'napi', 'target', 'path', 'sha256'];
  if (!artifact || typeof artifact !== 'object' || types.isProxy(artifact) || Reflect.ownKeys(artifact).length !== keys.length ||
      keys.some(key => !Object.hasOwn(Object.getOwnPropertyDescriptor(artifact, key) || {}, 'value')))
    throw failure('OWNERSHIP_GUARD_INVALID');
  verifiedArtifact = Object.freeze(Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(artifact, key).value])));
}

function nativeArtifact() {
  if (verifiedArtifact) return verifiedArtifact;
  if (process.platform === 'darwin') {
    const coreSha256 = process.env.DATASECURE_MACOS_STATIC_CORE_SHA256;
    if (!['x64', 'arm64'].includes(process.arch) || !/^[a-f0-9]{64}$/u.test(coreSha256 || ''))
      throw failure('OWNERSHIP_GUARD_UNAVAILABLE');
    configureOwnershipControl({ schema: 'datasecure-static-ownership-core/1', abi: 1,
      napi: 8, target: `macos-${process.arch}`, core_sha256: coreSha256 });
    return verifiedArtifact;
  }
  const target = process.platform === 'win32' && process.arch === 'x64' ? 'windows-x64' :
    process.platform === 'darwin' && ['x64', 'arm64'].includes(process.arch) ? `macos-${process.arch}` : null;
  const sha256 = process.env.DATASECURE_OWNERSHIP_GUARD_SHA256;
  if (!target || !/^[a-f0-9]{64}$/u.test(sha256 || '')) throw failure('OWNERSHIP_GUARD_UNAVAILABLE');
  // Rust clears the host environment and supplies its compile-time digest.
  // The path is fixed by the product layout, never supplied by the renderer.
  const server = path.resolve(__dirname, '..'), bundle = bundleContext(server);
  const artifactPath = bundle ? path.join(bundle.contents, 'Frameworks', 'datasecure-ownership-guard.node') :
    path.join(server, 'native', target, 'ownership-guard.node');
  configureOwnershipControl({ schema: 'datasecure-native-ownership-guard/1', abi: 1, napi: 8,
    target, path: artifactPath, sha256 });
  return verifiedArtifact;
}

function withOwnershipControl(root, callback) {
  if (typeof callback !== 'function' || callback.constructor?.name === 'AsyncFunction') throw failure('OWNERSHIP_GUARD_INVALID');
  if (process.env.DATASECURE_NATIVE_EXPORT_CHANNEL !== '1' || !['win32', 'darwin'].includes(process.platform)) {
    // Explicit legacy adapter/other-target contract, not an error fallback.
    // This change ships only Windows/macOS native protection. Linux is not
    // silently declared covered by a primitive that was never built for it.
    return callback(Object.freeze({ assertHeld: () => true }));
  }
  if (releaseUnconfirmed) throw failure('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED');
  if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) !== root) throw failure('OWNERSHIP_GUARD_INVALID');
  const key = process.platform === 'win32' ? root.toLowerCase() : root;
  const reentrant = active.get(key);
  if (reentrant) {
    reentrant.assertHeld();
    const value = callback(reentrant);
    if (value && typeof value.then === 'function') throw failure('OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
    reentrant.assertHeld(); return value;
  }
  const factory = createOwnershipGuard({ root, verifiedArtifact: nativeArtifact() });
  let guard, result, thrown, failed = false;
  try {
    guard = factory.tryAcquire();
    if (!guard) throw failure('OWNERSHIP_GUARD_BUSY');
    active.set(key, guard); guard.assertHeld();
    result = callback(guard);
    if (result && typeof result.then === 'function') throw failure('OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
    guard.assertHeld();
  } catch (error) { thrown = error; failed = true; }
  finally {
    active.delete(key);
    try { if (guard && guard.release() !== true) throw failure('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED'); }
    catch (error) { releaseUnconfirmed = true; if (!failed) { thrown = error; failed = true; } }
    try { if (factory.close() !== true) throw failure('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED'); }
    catch (error) { releaseUnconfirmed = true; if (!failed) { thrown = error; failed = true; } }
  }
  if (failed) throw thrown;
  return result;
}

// Validate each mutations-capable Darwin Environment before its first module
// side effect/ACK. The loaded image must be the fixed pinned custom-Core role.
function assertNativeOwnershipRuntime() {
  if (process.platform !== 'darwin' || process.env.DATASECURE_NATIVE_EXPORT_CHANNEL !== '1') return;
  if (!/^[a-f0-9]{64}$/u.test(process.env.DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256 || ''))
    throw failure('OWNERSHIP_GUARD_UNAVAILABLE');
  require('./macos-static-ownership-guard').loadStaticOwnershipGuard(nativeArtifact());
  try { require('./macos-static-runtime-evidence').verify(`macos-${process.arch}`); }
  catch { throw failure('OWNERSHIP_GUARD_INTEGRITY_FAILED'); }
}

module.exports = Object.freeze({ withOwnershipControl, configureOwnershipControl, assertNativeOwnershipRuntime });
