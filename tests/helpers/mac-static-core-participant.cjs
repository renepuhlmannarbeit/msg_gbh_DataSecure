'use strict';
// Test helper OUTSIDE the sealed app. All ownership/runtime modules below are
// required from the unchanged app server, never from the checkout or an addon.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { Worker, isMainThread, workerData, parentPort } = require('node:worker_threads');
const { types } = require('node:util');
const fail = code => Object.assign(Error(code), { code });
const allowed = new Set(['MAC_NATIVE_ARGUMENT_INVALID', 'MAC_NATIVE_NO_HELD_CAPABILITY',
  'MAC_NATIVE_PARTICIPANT_FAILED', 'MAC_NATIVE_DEADLINE', 'MAC_NATIVE_PROCESS_UNCONFIRMED',
  'OWNERSHIP_GUARD_INVALID', 'OWNERSHIP_GUARD_UNAVAILABLE', 'OWNERSHIP_GUARD_UNSAFE', 'OWNERSHIP_GUARD_BUSY',
  'OWNERSHIP_GUARD_CLOSED', 'OWNERSHIP_GUARD_INTERNAL', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED',
  'OWNERSHIP_GUARD_INTEGRITY_FAILED', 'OWNERSHIP_GUARD_ACCESS_DENIED', 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN',
  'RUNTIME_INTEGRITY_FAILED']);
const codeOf = error => {
  if (!error || typeof error !== 'object' || types.isProxy(error)) return 'MAC_NATIVE_PARTICIPANT_FAILED';
  const code = Object.getOwnPropertyDescriptor(error, 'code')?.value;
  return allowed.has(code) ? code : 'MAC_NATIVE_PARTICIPANT_FAILED';
};
let held = null, worker = null;
const options = isMainThread ? JSON.parse(process.argv[2] || 'null') : workerData;
if (process.platform !== 'darwin' || process.version !== 'v22.23.2' || !['arm64', 'x64'].includes(process.arch) ||
    !options || Reflect.ownKeys(options).sort().join(',') !==
      ['app', 'artifact_sha256', 'core_sha256', 'root', 'scope', 'server', 'target'].sort().join(',') ||
    options.target !== `macos-${process.arch}` ||
    ![options.app, options.root, options.scope, options.server].every(value => typeof value === 'string' &&
      path.isAbsolute(value) && path.normalize(value) === value && !/[\0\r\n]/u.test(value)) ||
    path.basename(options.app) !== 'DataSecure Standalone.app' ||
    options.server !== path.join(options.app, 'Contents/Resources/server') ||
    options.root !== path.join(options.scope, 'root') ||
    !/^datasecure-macos-static-native-/u.test(path.basename(options.scope)) ||
    fs.realpathSync.native(process.execPath) !== fs.realpathSync.native(path.join(options.app, 'Contents/MacOS/datasecure-core')) ||
    process.env.DATASECURE_NATIVE_EXPORT_CHANNEL !== '1' ||
    !/^[a-f0-9]{64}$/u.test(options.core_sha256) || !/^[a-f0-9]{64}$/u.test(options.artifact_sha256) ||
    process.env.DATASECURE_MACOS_STATIC_CORE_SHA256 !== options.core_sha256 ||
    process.env.DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256 !== options.artifact_sha256 ||
    Object.keys(process.env).some(key => /^(?:NODE_|DYLD_|LD_|EU_PRIVACY_|DATASECURE_OWNERSHIP_GUARD_)/u.test(key)) ||
    globalThis.__DATASECURE_NETWORK_DENY_ACTIVE__ !== true ||
    JSON.stringify(process.execArgv) !== JSON.stringify(['--require', path.join(options.server, 'network-deny.cjs')]))
  throw fail('MAC_NATIVE_ARGUMENT_INVALID');

// Full real runtime evidence + pinned fixed linked binding in EACH Environment.
const control = require(path.join(options.server, 'core/ownership-control.js'));
const { createOwnershipGuard } = require(path.join(options.server, 'core/native-ownership-guard.js'));
const staticGuard = require(path.join(options.server, 'core/macos-static-ownership-guard.js'));
const descriptor = Object.freeze({ schema: 'datasecure-static-ownership-core/1', abi: 1, napi: 8,
  target: options.target, core_sha256: options.core_sha256 });
control.assertNativeOwnershipRuntime();
assert.equal(staticGuard.loadStaticOwnershipGuard(descriptor).abi, 1);
// Direct call separately proves that a worker Environment actually has the
// exact linked registration, not merely an inherited parent JS cache/result.
assert.equal(process._linkedBinding('datasecure_ownership_guard').abi, 1);
function newFactory() { return createOwnershipGuard({ root: options.root, verifiedArtifact: descriptor }); }
function admission() {
  let callbacks = 0, reentrant = false;
  try {
    const result = control.withOwnershipControl(options.root, guard => {
      callbacks++; assert.equal(guard.assertHeld(), true);
      return control.withOwnershipControl(options.root, inner => {
        reentrant = inner === guard; assert.equal(inner.assertHeld(), true); return true;
      });
    });
    assert.equal(result, true); assert.equal(callbacks, 1); assert.equal(reentrant, true);
    return { busy: false, callbacks, reentrant };
  } catch (error) {
    if (codeOf(error) !== 'OWNERSHIP_GUARD_BUSY' || callbacks !== 0) throw error;
    return { busy: true, callbacks: 0 };
  }
}
function releaseHeld() {
  if (!held) throw fail('MAC_NATIVE_NO_HELD_CAPABILITY');
  const value = held; held = null; // consume this exact capability, never retry/adopt a PID.
  let failed = false, primary;
  try { assert.equal(value.guard.assertHeld(), true); assert.equal(value.guard.release(), true); }
  catch (error) { failed = true; primary = error; }
  finally {
    try { assert.equal(value.factory.close(), true); }
    catch (error) { if (!failed) { failed = true; primary = error; } }
  }
  if (failed) throw primary;
  return { released: true, root_closed: true };
}
async function workerProbe(expectBusy) {
  if (worker) throw fail('MAC_NATIVE_PARTICIPANT_FAILED');
  const active = new Worker(__filename, { workerData: options, env: { ...process.env },
    execArgv: ['--require', path.join(options.server, 'network-deny.cjs')], stdout: true, stderr: true });
  worker = active;
  let result, received = false, failed = false, output = 0, ended = false;
  const done = new Promise(resolve => {
    active.on('message', message => { if (received) failed = true; received = true; result = message; });
    active.on('error', () => { failed = true; });
    active.on('exit', code => { ended = true; if (code !== 0) failed = true; resolve(); });
    for (const stream of [active.stdout, active.stderr]) stream.on('data', bytes => { output += bytes.length; if (output > 65536) failed = true; });
  });
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(resolve, 5000); });
  await Promise.race([done, timeout]); clearTimeout(timer);
  if (!ended) {
    failed = true;
    // Do not call this a normal worker exit. The own process watchdog is the
    // final hard bound if termination itself cannot be confirmed.
    let terminationTimer;
    await Promise.race([active.terminate().catch(() => {}),
      new Promise(resolve => { terminationTimer = setTimeout(resolve, 2000); })]);
    clearTimeout(terminationTimer);
  }
  if (!ended) throw fail('MAC_NATIVE_PROCESS_UNCONFIRMED');
  worker = null;
  if (failed || !received || !result || result.builtin !== true || result.busy !== expectBusy)
    throw fail('MAC_NATIVE_PARTICIPANT_FAILED');
  assert.deepEqual(result, expectBusy ? { builtin: true, busy: true, callbacks: 0 } :
    { builtin: true, busy: false, callbacks: 1, reentrant: true });
  return { ...result, exited: true, normal: true };
}
if (!isMainThread) {
  parentPort.postMessage({ builtin: true, ...admission() });
  parentPort.close();
} else {
  if (typeof process.send !== 'function') throw fail('MAC_NATIVE_ARGUMENT_INVALID');
  let handling = false, stopping = false;
  function emergency() {
    if (stopping) return;
    stopping = true;
    try { if (held) releaseHeld(); } catch {}
    // Own bounded test process only. Exit confirms OS handle reclamation to
    // the parent; failure/forced exit always preserves the whole fixture.
    process.exit(2);
  }
  const watchdog = setTimeout(emergency, 35000);
  process.on('disconnect', () => { if (!stopping) emergency(); });
  process.on('message', async message => {
    if (handling || stopping || !message || Object.keys(message).sort().join(',') !== 'operation,seq' ||
        !Number.isSafeInteger(message.seq) || message.seq <= 0 || typeof message.operation !== 'string') return emergency();
    handling = true;
    let result, failed = false;
    try {
      switch (message.operation) {
        case 'identity': result = { node: process.version, target: options.target, builtin: true, clean_env: true }; break;
        case 'hold': {
          if (held) throw fail('MAC_NATIVE_PARTICIPANT_FAILED');
          const factory = newFactory(); let guard;
          try {
            guard = factory.tryAcquire();
            if (!guard) throw fail('OWNERSHIP_GUARD_BUSY');
            assert.equal(guard.assertHeld(), true); held = { factory, guard }; result = { acquired: true };
          } finally { if (!held) { if (guard) assert.equal(guard.release(), true); assert.equal(factory.close(), true); } }
          break;
        }
        case 'release': result = releaseHeld(); break;
        case 'admit': result = admission(); break;
        case 'worker_busy': result = await workerProbe(true); break;
        case 'worker_free': result = await workerProbe(false); break;
        case 'shutdown':
          if (worker || held) throw fail('MAC_NATIVE_PARTICIPANT_FAILED');
          result = { stopped: true }; stopping = true; clearTimeout(watchdog); break;
        default: throw fail('MAC_NATIVE_ARGUMENT_INVALID');
      }
    } catch (error) { failed = true; result = codeOf(error); }
    const shutdown = stopping && !failed;
    process.send({ seq: message.seq, ok: !failed, value: result }, error => {
      if (error) return emergency();
      handling = false;
      if (shutdown) { process.disconnect(); process.exitCode = 0; }
    });
  });
}
