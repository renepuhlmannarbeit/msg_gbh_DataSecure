// Explicit Darwin artifact gate. Not an addon-test alias or a source-suite PASS.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';
import { performance } from 'node:perf_hooks';
import { loadMacStaticCore, assertMacCoreBundle, verifyMacBundleSeal } from '../scripts/lib/macos-core-artifact.mjs';
import { standaloneBuildFingerprint, assertStandaloneBuildFingerprint, assertStandaloneSourceUnchanged,
  assertStandaloneRuntimeSource } from '../scripts/lib/standalone-build-fingerprint.mjs';
import bound from '../plugins/data-secure/server/core/bound-file-io.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '..');
const SHA = /^[a-f0-9]{64}$/u;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const failure = code => Object.assign(Error(code), { code });
const codes = new Set(['MAC_NATIVE_ARGUMENT_INVALID', 'MAC_NATIVE_HOST_REQUIRED', 'MAC_NATIVE_APP_CHANGED',
  'MAC_NATIVE_PROTOCOL_INVALID', 'MAC_NATIVE_PARTICIPANT_FAILED', 'MAC_NATIVE_DEADLINE', 'MAC_NATIVE_PROCESS_UNCONFIRMED',
  'MAC_NATIVE_FIXTURE_CHANGED', 'MAC_NATIVE_NO_HELD_CAPABILITY', 'MAC_NATIVE_GATE_FAILED',
  'MAC_NATIVE_TIMER_FAILED', 'MAC_NATIVE_STREAM_FAILED', 'MAC_NATIVE_KILL_FAILED', 'MAC_NATIVE_DETACH_FAILED',
  'OWNERSHIP_GUARD_INVALID', 'OWNERSHIP_GUARD_UNAVAILABLE', 'OWNERSHIP_GUARD_UNSAFE', 'OWNERSHIP_GUARD_BUSY',
  'OWNERSHIP_GUARD_CLOSED', 'OWNERSHIP_GUARD_INTERNAL', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED',
  'OWNERSHIP_GUARD_INTEGRITY_FAILED', 'OWNERSHIP_GUARD_ACCESS_DENIED', 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN',
  'RUNTIME_INTEGRITY_FAILED']);
const fixedCode = error => {
  if (!error || typeof error !== 'object' || types.isProxy(error)) return 'MAC_NATIVE_GATE_FAILED';
  const value = Object.getOwnPropertyDescriptor(error, 'code')?.value;
  return codes.has(value) ? value : 'MAC_NATIVE_GATE_FAILED';
};
export function parseNativeMacArgs(args, host = process) {
  if (host.platform !== 'darwin' || !['arm64', 'x64'].includes(host.arch)) throw failure('MAC_NATIVE_HOST_REQUIRED');
  if (!Array.isArray(args) || args.length !== 4 || args[0] !== '--app' || args[2] !== '--target' ||
      typeof args[1] !== 'string' || /[\0\r\n]/u.test(args[1]) || !path.posix.isAbsolute(args[1]) ||
      path.posix.resolve(args[1]) !== args[1] || path.posix.basename(args[1]) !== 'DataSecure Standalone.app' ||
      args[3] !== `macos-${host.arch}`) throw failure('MAC_NATIVE_ARGUMENT_INVALID');
  return Object.freeze({ app: args[1], target: args[3] });
}
const production = Object.freeze({ loadMacStaticCore, assertMacCoreBundle, verifyMacBundleSeal,
  standaloneBuildFingerprint, assertStandaloneBuildFingerprint, assertStandaloneSourceUnchanged,
  assertStandaloneRuntimeSource, bound });
// Explicit services seam is for source-model tests only, never CLI/env input.
export function preflightNativeMacGate(options, services = production, root = repository) {
  const binding = services.bound.bindDirectory(options.app);
  if (binding.real !== options.app) throw failure('MAC_NATIVE_ARGUMENT_INVALID');
  const source = services.standaloneBuildFingerprint(root);
  const build = services.loadMacStaticCore(root, options.target); // approved_artifacts + full provenance required.
  if (!SHA.test(build.artifactSha256) || !SHA.test(build.artifact?.core?.sha256) ||
      build.artifact.target !== options.target || build.artifact.role !== 'mutating-core') throw failure('MAC_NATIVE_APP_CHANGED');
  const core = path.posix.join(options.app, 'Contents/MacOS/datasecure-core');
  const server = path.posix.join(options.app, 'Contents/Resources/server');
  function unchanged() {
    services.bound.assertDirectory(binding);
    services.assertStandaloneSourceUnchanged(root, source.fingerprint);
    services.assertMacCoreBundle(options.app, build);
    services.assertStandaloneBuildFingerprint(services.bound.readBoundFile(
      path.posix.join(options.app, 'Contents/MacOS/datasecure-standalone'),
      { minimum: 1024, maximum: 64 * 1024 * 1024, checkCtime: true }), source.fingerprint);
    services.assertStandaloneRuntimeSource(server, source);
    services.bound.assertDirectory(binding);
  }
  unchanged();
  services.verifyMacBundleSeal(options.app, build); // read-only codesign inspection, never signing.
  unchanged();
  return { core, server, build, source, unchanged };
}
export function cleanNativeMacEnvironment({ home, temporary, coreSha256, artifactSha256 }) {
  if (![home, temporary].every(value => typeof value === 'string' && path.posix.isAbsolute(value) &&
      path.posix.normalize(value) === value && !/[\0\r\n]/u.test(value)) ||
      !SHA.test(coreSha256) || !SHA.test(artifactSha256)) throw failure('MAC_NATIVE_ARGUMENT_INVALID');
  return Object.freeze({ HOME: home, TMPDIR: temporary, TMP: temporary, TEMP: temporary,
    PATH: '', LANG: 'C', LC_ALL: 'C', DATASECURE_PRODUCT_CHANNEL: 'standalone',
    DATASECURE_NATIVE_EXPORT_CHANNEL: '1', DATASECURE_MACOS_STATIC_CORE_SHA256: coreSha256,
    DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256: artifactSha256 });
}
export function readNativeMacReceipt(message, seq) {
  if (!message || typeof message !== 'object' || types.isProxy(message)) throw failure('MAC_NATIVE_PROTOCOL_INVALID');
  const own = Object.getOwnPropertyDescriptors(message), keys = Reflect.ownKeys(own);
  if (keys.length !== 3 || !['seq', 'ok', 'value'].every(key => Object.hasOwn(own, key) &&
      Object.hasOwn(own[key], 'value')) || own.seq.value !== seq || typeof own.ok.value !== 'boolean')
    throw failure('MAC_NATIVE_PROTOCOL_INVALID');
  if (!own.ok.value) {
    const value = own.value.value;
    if (typeof value !== 'string' || !codes.has(value)) throw failure('MAC_NATIVE_PROTOCOL_INVALID');
    throw failure(value);
  }
  return own.value.value;
}

function participant(core, helper, options, env, deadline) {
  const child = fork(helper, [JSON.stringify(options)], { execPath: core,
    execArgv: ['--require', path.join(options.server, 'network-deny.cjs')], cwd: options.scope,
    env: { ...env }, shell: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], serialization: 'json' });
  let sequence = 0, pending = null, exited = false, closed = false, disconnected = false, exitCode, signal;
  let stdoutClosed = false, stderrClosed = false, outputBytes = 0, shutdownAck = false, shutdownRequested = false;
  let firstFailure = null, timerCleanupFailed = false, detachFailed = false, detached = false;
  const closedWaiters = new Set(), timers = new Set(), killAttempts = [];
  const latch = code => { if (firstFailure === null) firstFailure = code; };
  function cancelTimer(timer) {
    if (timer === undefined) return;
    timers.delete(timer);
    try { clearTimeout(timer); }
    catch {
      timerCleanupFailed = true; latch('MAC_NATIVE_TIMER_FAILED');
      try { timer?.unref?.(); } catch { detachFailed = true; latch('MAC_NATIVE_DETACH_FAILED'); }
    }
  }
  function rejectPending(error) {
    if (!pending) return;
    const current = pending; pending = null; cancelTimer(current.timer); current.reject(error);
  }
  function fault(code) { latch(code); rejectPending(failure(firstFailure)); }
  function timerFor(action, milliseconds) {
    try {
      let timer;
      timer = setTimeout(() => {
        timers.delete(timer);
        try { action(); } catch { fault('MAC_NATIVE_TIMER_FAILED'); }
      }, milliseconds);
      timers.add(timer); return timer;
    } catch { fault('MAC_NATIVE_TIMER_FAILED'); return undefined; }
  }
  const confirmed = () => exited && closed && disconnected && stdoutClosed && stderrClosed;
  function receipt() {
    return Object.freeze({ pid: child.pid, shutdown_ack: shutdownAck, exited, closed, disconnected,
      stdout_closed: stdoutClosed, stderr_closed: stderrClosed,
      normal: exited && exitCode === 0 && signal === null, confirmed: confirmed(), output_bytes: outputBytes,
      failed: firstFailure !== null, error_code: firstFailure,
      timer_cleanup_failed: timerCleanupFailed, detach_attempted: detached, detach_failed: detachFailed,
      kill_attempts: Object.freeze(killAttempts.map(value => Object.freeze({ ...value }))) });
  }
  child.on('error', () => fault('MAC_NATIVE_PARTICIPANT_FAILED'));
  child.on('disconnect', () => {
    disconnected = true;
    if (!shutdownRequested || pending) fault('MAC_NATIVE_PARTICIPANT_FAILED');
  });
  child.on('exit', (code, value) => {
    exited = true; exitCode = code; signal = value;
    if (!shutdownRequested || code !== 0 || value !== null || pending) fault('MAC_NATIVE_PARTICIPANT_FAILED');
  });
  child.on('close', (code, value) => {
    closed = true;
    if (!exited || code !== exitCode || value !== signal) fault('MAC_NATIVE_PROCESS_UNCONFIRMED');
    for (const notify of [...closedWaiters]) notify();
  });
  for (const [stream, mark] of [[child.stdout, () => { stdoutClosed = true; }], [child.stderr, () => { stderrClosed = true; }]]) {
    // Keep guarded error listeners for late pipe failures, including detach.
    stream.on('error', () => fault('MAC_NATIVE_STREAM_FAILED'));
    stream.on('close', mark);
    stream.on('data', bytes => {
      if (!Buffer.isBuffer(bytes) || outputBytes + bytes.length > 65536) {
        outputBytes = 65537; fault('MAC_NATIVE_PROTOCOL_INVALID');
      } else outputBytes += bytes.length;
    });
  }
  child.on('message', message => {
    if (!pending) { fault('MAC_NATIVE_PROTOCOL_INVALID'); return; }
    const current = pending; pending = null; cancelTimer(current.timer);
    if (firstFailure) { current.reject(failure(firstFailure)); return; }
    try {
      const value = readNativeMacReceipt(message, current.seq);
      if (current.operation === 'shutdown') {
        assert.deepEqual(value, { stopped: true }); shutdownAck = true;
      }
      current.resolve(value);
    } catch (error) {
      // Expected negative capability replies remain request outcomes, not a
      // fabricated process failure. Invalid framing is permanently latched.
      if (fixedCode(error) === 'MAC_NATIVE_PROTOCOL_INVALID' || current.operation === 'shutdown')
        latch('MAC_NATIVE_PROTOCOL_INVALID');
      current.reject(firstFailure ? failure(firstFailure) : error);
    }
  });
  async function request(operation) {
    if (firstFailure) throw failure(firstFailure);
    if (pending || closed || !child.connected) { fault('MAC_NATIVE_PROTOCOL_INVALID'); throw failure(firstFailure); }
    const remaining = Math.min(5000, deadline - performance.now());
    if (remaining <= 0) { fault('MAC_NATIVE_DEADLINE'); throw failure(firstFailure); }
    const seq = ++sequence;
    return new Promise((resolve, reject) => {
      const current = { seq, operation, resolve, reject, timer: undefined }; pending = current;
      current.timer = timerFor(() => fault('MAC_NATIVE_DEADLINE'), remaining);
      if (firstFailure) { rejectPending(failure(firstFailure)); return; }
      if (operation === 'shutdown') shutdownRequested = true;
      try { child.send({ seq, operation }, error => { if (error) fault('MAC_NATIVE_PARTICIPANT_FAILED'); }); }
      catch { fault('MAC_NATIVE_PARTICIPANT_FAILED'); }
    });
  }
  function waitClose(milliseconds) {
    if (closed) return Promise.resolve();
    return new Promise(resolve => {
      let timer;
      const done = () => { closedWaiters.delete(done); cancelTimer(timer); resolve(); };
      closedWaiters.add(done); timer = timerFor(done, milliseconds);
      if (timer === undefined) done();
    });
  }
  function signalOwn(value) {
    if (closed || exited || killAttempts.some(attempt => attempt.signal === value)) return;
    let result;
    try { result = child.kill(value) === true ? 'sent' : 'refused'; }
    catch { result = 'threw'; }
    killAttempts.push({ signal: value, result });
    if (result !== 'sent') fault('MAC_NATIVE_KILL_FAILED');
  }
  function detachUnconfirmed() {
    detached = true;
    // No numeric PID/group fallback and no invented Close/reaping. Keep the
    // safety error listeners while dropping only our own referenced resources.
    const attempt = action => { try { action(); } catch { detachFailed = true; latch('MAC_NATIVE_DETACH_FAILED'); } };
    for (const stream of [child.stdin, child.stdout, child.stderr]) if (stream) {
      if (stream === child.stdin) attempt(() => stream.on('error', () => fault('MAC_NATIVE_STREAM_FAILED')));
      attempt(() => stream.destroy());
      attempt(() => stream.unref?.());
    }
    attempt(() => child.channel?.unref()); attempt(() => child.unref());
  }
  async function stop() {
    try {
      if (pending) fault('MAC_NATIVE_PARTICIPANT_FAILED');
      if (!firstFailure && !closed && child.connected) {
        try { await request('shutdown'); } catch (error) { latch(fixedCode(error)); }
      }
      await waitClose(1000);
      if (!closed) { signalOwn('SIGTERM'); await waitClose(1000); }
      if (!closed) { signalOwn('SIGKILL'); await waitClose(2000); }
    } catch { fault('MAC_NATIVE_PARTICIPANT_FAILED'); }
    finally {
      if (!confirmed()) { fault('MAC_NATIVE_PROCESS_UNCONFIRMED'); detachUnconfirmed(); }
      for (const timer of [...timers]) cancelTimer(timer);
    }
    return receipt();
  }
  return { child, request, stop, receipt };
}
const identity = stat => [String(stat.dev), String(stat.ino), String(stat.birthtimeNs)];
function createFixture() {
  const parent = fs.realpathSync.native(os.tmpdir());
  const scope = fs.mkdtempSync(path.join(parent, 'datasecure-macos-static-native-'));
  const directories = ['home', 'temporary', 'root'].map(name => path.join(scope, name));
  const bindings = new Map();
  function register(dir) {
    const stat = fs.lstatSync(dir, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077n) !== 0n ||
        stat.uid !== BigInt(process.geteuid()) || fs.realpathSync.native(dir) !== dir) throw failure('MAC_NATIVE_FIXTURE_CHANGED');
    bindings.set(dir, identity(stat));
  }
  register(scope);
  for (const dir of directories) { fs.mkdirSync(dir, { mode: 0o700 }); register(dir); }
  let anchorIdentity, cleanupStatus = 'preserved';
  function unchangedAnchor() {
    const file = path.join(directories[2], 'ownership-control.lock'), stat = fs.lstatSync(file, { bigint: true });
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size === 0n && stat.nlink === 1n &&
      (stat.mode & 0o077n) === 0n && stat.uid === BigInt(process.geteuid()));
    if (anchorIdentity) assert.deepEqual(identity(stat), anchorIdentity); else anchorIdentity = identity(stat);
  }
  function cleanup() {
    assert.equal(path.dirname(scope), parent); assert.match(path.basename(scope), /^datasecure-macos-static-native-/u);
    for (const [dir, initial] of bindings) {
      const stat = fs.lstatSync(dir, { bigint: true }); assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
      assert.deepEqual(identity(stat), initial); assert.equal(fs.realpathSync.native(dir), dir);
    }
    assert.deepEqual(fs.readdirSync(scope).sort(), ['home', 'root', 'temporary']);
    assert.deepEqual(fs.readdirSync(directories[0]), []); assert.deepEqual(fs.readdirSync(directories[1]), []);
    assert.deepEqual(fs.readdirSync(directories[2]), ['ownership-control.lock']); unchangedAnchor();
    // Only enumerated own leaves; no recursive traversal, unknown file deletion,
    // ACL repair, old-data cleanup or cleanup while a participant might live.
    cleanupStatus = 'cleanup_incomplete'; // a failed destructive attempt is not an intact-preservation proof.
    fs.unlinkSync(path.join(directories[2], 'ownership-control.lock'));
    for (const dir of directories) fs.rmdirSync(dir);
    fs.rmdirSync(scope);
    cleanupStatus = 'removed';
  }
  return { scope, home: directories[0], temporary: directories[1], root: directories[2], unchangedAnchor, cleanup, status: () => cleanupStatus };
}

export async function runNativeMacGate(options) {
  // Host gate also applies to programmatic callers, before preflight/fixture IO.
  parseNativeMacArgs(['--app', options.app, '--target', options.target]);
  const checked = preflightNativeMacGate(options), helper = path.join(here, 'helpers/mac-static-core-participant.cjs');
  const aclHelper = path.join(here, 'helpers/native-macos-ownership-acl-fixture.cjs');
  const helperDigest = () => digest(Buffer.from(JSON.stringify([helper, aclHelper].map(file =>
    digest(bound.readBoundFile(file, { minimum: 1, maximum: 128 * 1024, checkCtime: true }))))));
  const helperPin = helperDigest();
  const fixture = createFixture(), peers = [], receipts = [];
  const deadline = performance.now() + 30000;
  let failed = false, primary, phase = 'process_start', complete = false, cleanupConfirmed = false;
  try {
    const environment = cleanNativeMacEnvironment({ ...fixture, coreSha256: checked.build.artifact.core.sha256,
      artifactSha256: checked.build.artifactSha256 });
    for (let n = 0; n < 2; n++) {
      checked.unchanged();
      assert.equal(helperDigest(), helperPin);
      peers.push(participant(checked.core, helper, { app: options.app, server: checked.server, root: fixture.root,
        scope: fixture.scope, target: options.target, core_sha256: checked.build.artifact.core.sha256,
        artifact_sha256: checked.build.artifactSha256 }, environment, deadline));
    }
    const [a, b] = peers;
    assert.ok(Number.isSafeInteger(a.child.pid) && Number.isSafeInteger(b.child.pid) && a.child.pid !== b.child.pid &&
      a.child.pid !== process.pid && b.child.pid !== process.pid);
    for (const peer of peers) assert.deepEqual(await peer.request('identity'),
      { node: 'v22.23.2', target: options.target, builtin: true, clean_env: true });
    phase = 'process_contention';
    assert.deepEqual(await a.request('hold'), { acquired: true }); fixture.unchangedAnchor();
    assert.deepEqual(await b.request('admit'), { busy: true, callbacks: 0 });
    phase = 'worker_contention';
    assert.deepEqual(await a.request('worker_busy'), { builtin: true, busy: true, callbacks: 0, exited: true, normal: true });
    phase = 'capability_release';
    assert.deepEqual(await a.request('release'), { released: true, root_closed: true });
    assert.deepEqual(await b.request('admit'), { busy: false, callbacks: 1, reentrant: true });
    assert.deepEqual(await b.request('hold'), { acquired: true });
    assert.deepEqual(await a.request('admit'), { busy: true, callbacks: 0 });
    assert.deepEqual(await b.request('release'), { released: true, root_closed: true });
    await assert.rejects(a.request('release'), { code: 'MAC_NATIVE_NO_HELD_CAPABILITY' });
    assert.deepEqual(await a.request('admit'), { busy: false, callbacks: 1, reentrant: true });
    phase = 'worker_admission';
    assert.deepEqual(await a.request('worker_free'), { builtin: true, busy: false, callbacks: 1, reentrant: true, exited: true, normal: true });
    phase = 'acl_presence_and_roles';
    assert.deepEqual(await a.request('acl_matrix'), { cases: 6, empty_private_acl: true, benign_home_ancestor: true,
      additional_mutation_grants_refused: true, private_aces_refused: true, fixture_cleanup_confirmed: true });
    fixture.unchangedAnchor(); checked.unchanged();
    assert.equal(helperDigest(), helperPin);
    complete = true;
  } catch (error) { failed = true; primary = error; }
  finally {
    for (const peer of peers) {
      try { await peer.stop(); }
      catch { if (!failed) { failed = true; primary = failure('MAC_NATIVE_PARTICIPANT_FAILED'); } }
    }
    // Take live final snapshots only AFTER every awaited stop. A late error in
    // an earlier peer must not hide behind its previously returned receipt.
    receipts.push(...peers.map(peer => peer.receipt()));
    const participantFailure = receipts.find(value => value.failed);
    if (!failed && participantFailure) { failed = true; primary = failure(participantFailure.error_code); }
    if (peers.length !== 2 || !receipts.every(value => value.confirmed && value.normal && value.shutdown_ack)) {
      if (!failed) { failed = true; primary = failure('MAC_NATIVE_PROCESS_UNCONFIRMED'); }
    }
    if (!failed && complete) {
      try { checked.unchanged(); fixture.cleanup(); assert.equal(fixture.status(), 'removed'); cleanupConfirmed = true; }
      catch (error) { failed = true; primary = error; }
    }
  }
  const result = { schema: 'datasecure-macos-static-core-native-gate/1', target: options.target,
    native_status: failed ? 'FAILED' : 'PASS', phase, error_code: failed ? fixedCode(primary) : null,
    core_sha256: checked.build.artifact.core.sha256, artifact_sha256: checked.build.artifactSha256,
    source_fingerprint: checked.source.fingerprint, helper_sha256: helperPin, process_receipts: receipts,
    fixture_cleanup_confirmed: cleanupConfirmed, fixture_status: fixture.status(),
    fixture_preserved: fixture.status() === 'preserved',
    coverage: { two_core_processes: complete, normal_fork_ipc: complete, worker_builtin_environment: complete,
      process_and_worker_contention: complete, synchronous_root_admission_release: complete,
      acl_presence_and_role_matrix: complete,
      epoch: 'NOT_RUN', pause: 'NOT_RUN', lease: 'NOT_RUN', adversarial_acl_matrix: complete ? 'PARTIAL' : 'NOT_RUN', gui: 'NOT_RUN' } };
  if (failed) { const error = failure(fixedCode(primary)); error.report = result; throw error; }
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runNativeMacGate(parseNativeMacArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(JSON.stringify(error.report || { schema: 'datasecure-macos-static-core-native-gate/1',
    native_status: 'NOT_PASSED', error_code: fixedCode(error) })); process.exitCode = 1;
    // The own CLI must not hang if even detaching our handles failed. This
    // bounded failing exit never certifies the child or removes its fixture.
    if (error.report?.process_receipts?.some(value => !value.confirmed && value.detach_failed)) {
      try { const timer = setTimeout(() => process.exit(1), 1000); timer.unref(); }
      catch { process.exit(1); }
    }
  }
}
