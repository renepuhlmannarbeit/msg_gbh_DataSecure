// Pure process/clock models and synthetic package-binding fixtures only. These
// are not Windows native loader, hardened macOS, signature or M2 evidence.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { probeOwnershipLoad, runOwnershipLoadCommand } from './helpers/ownership-load-lifecycle.mjs';
import { WINDOWS_PACKAGE_ROOT, windowsPackageRoots } from '../scripts/lib/standalone-windows-layout.mjs';
import { SOURCE_MARKER_PREFIX, SOURCE_MARKER_SUFFIX, assertStandaloneBuildFingerprint,
  assertStandaloneRuntimeSource } from '../scripts/lib/standalone-build-fingerprint.mjs';
import { OWNERSHIP_MARKER_PREFIX, OWNERSHIP_MARKER_SUFFIX,
  assertOwnershipGuardMarker } from '../scripts/lib/ownership-guard-artifact.mjs';
import { CORE_MARKER_PREFIX, CORE_MARKER_SUFFIX, PROVENANCE_MARKER_PREFIX, PROVENANCE_MARKER_SUFFIX,
  assertMacCoreBundle, canonicalBytes, validateMacCoreArtifact } from '../scripts/lib/macos-core-artifact.mjs';
import bound from '../plugins/data-secure/server/core/bound-file-io.js';

const require = createRequire(import.meta.url);
const { encodeFrame } = require('../plugins/data-secure/server/standalone/desktop-ipc.js');
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const request = '9'.repeat(16);
// Core output uses length-prefixed JSON; encodeFrame validates *requests* and
// remains the real encoder passed to the helper for its shutdown request.
const outputFrame = value => {
  const payload = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length); return Buffer.concat([header, payload]);
};
const ready = () => outputFrame({ schema: 'datasecure-standalone-ready/1', ok: true });
const ack = () => outputFrame({ request_id: request, ok: true });
const options = { timeout: 2000 };

class Clock {
  now = 0; calls = 0; pending = new Set(); failSet = new Set(); failClear = false;
  setTimeout = (callback, delay) => {
    if (this.failSet.has(++this.calls)) throw Error('private timer failure');
    const timer = { at: this.now + delay, callback, referenced: true, unref() { this.referenced = false; } };
    this.pending.add(timer); return timer;
  };
  clearTimeout = timer => {
    if (this.failClear) throw Error('private clear failure');
    this.pending.delete(timer);
  };
  advance(milliseconds) {
    const until = this.now + milliseconds;
    let steps = 0;
    while (true) {
      assert.ok(++steps < 100);
      const timer = [...this.pending].filter(item => item.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!timer) break;
      this.pending.delete(timer); this.now = timer.at; timer.callback();
    }
    this.now = until;
  }
}
class Pipe extends EventEmitter {
  writes = []; destroys = 0; unrefs = 0; writeError = null; throwWrite = false; throwDestroy = false; throwUnref = false;
  write(bytes, callback) {
    if (this.throwWrite) throw Error('private stdin failure');
    this.writes.push(bytes); callback?.(this.writeError); return true;
  }
  destroy() { ++this.destroys; if (this.throwDestroy) throw Error('private destroy failure'); }
  unref() { ++this.unrefs; if (this.throwUnref) throw Error('private unref failure'); }
}
class Child extends EventEmitter {
  stdin = new Pipe(); stdout = new Pipe(); stderr = new Pipe();
  kills = []; unrefs = 0; exitCode = null; signalCode = null;
  killAction = () => true;
  kill(signal) { this.kills.push(signal); return this.killAction(); }
  unref() { ++this.unrefs; }
}
function model({ clock = new Clock(), child = new Child(), command = false } = {}) {
  let result;
  const promise = (command ? runOwnershipLoadCommand : probeOwnershipLoad)(child,
    { timers: clock, encodeFrame, safeCodes: new Set(['OWNERSHIP_CONTROL_BUSY']) }).then(value => { result = value; return value; });
  return { clock, child, promise, result: () => result };
}
function complete(child) { child.stdout.emit('data', Buffer.concat([ready(), ack()])); }
function assertUnconfirmed(result, child) {
  assert.equal(result.ok, false); assert.equal(result.closed, false);
  assert.equal(result.fixture_cleanup_allowed, false);
  for (const stream of [child.stdin, child.stdout, child.stderr]) {
    assert.equal(stream.destroys, 1); assert.equal(stream.unrefs, 1);
  }
  assert.equal(child.unrefs, 1);
  assert.ok(!JSON.stringify(result).includes('private'));
}

test('normal fragmented ready/ACK requires close and keeps stdin open for the ACK', options, async () => {
  const m = model(), frame = ready();
  m.child.stdout.emit('data', frame.subarray(0, 3)); m.child.stdout.emit('data', frame.subarray(3));
  assert.equal(m.child.stdin.writes.length, 1);
  const write = m.child.stdin.writes[0];
  assert.deepEqual(JSON.parse(write.subarray(4)), { schema: 'datasecure-standalone-private-ipc/1', action: 'shutdown', request_id: request });
  m.child.stdout.emit('data', ack());
  m.child.exitCode = 0; m.child.emit('exit', 0, null);
  await Promise.resolve(); assert.equal(m.result(), undefined);
  m.child.emit('close', 0, null);
  const result = await m.promise;
  assert.equal(result.ok, true); assert.equal(result.closed, true); assert.equal(result.fixture_cleanup_allowed, true);
  assert.equal(m.clock.pending.size, 0); assert.deepEqual(m.child.kills, []); assert.equal(m.child.unrefs, 0);
});

for (const failure of ['kill-false', 'kill-throws', 'kill-error-event', 'no-close']) {
  test(`deadline then bounded reap: ${failure}`, options, async () => {
    const m = model();
    m.child.killAction = () => {
      if (failure === 'kill-throws') throw Error('private native kill failure');
      if (failure === 'kill-error-event') m.child.emit('error', Error('private native error'));
      return failure !== 'kill-false';
    };
    m.clock.advance(20000); await Promise.resolve(); assert.equal(m.result(), undefined);
    m.clock.advance(1999); await Promise.resolve(); assert.equal(m.result(), undefined);
    m.clock.advance(1); const result = await m.promise;
    assertUnconfirmed(result, m.child); assert.equal(result.deadline_exceeded, true);
    assert.equal(result.kill_status, failure === 'kill-false' ? 'refused' : failure === 'kill-throws' ? 'error' : 'sent');
    assert.deepEqual(m.child.kills, ['SIGKILL']); assert.equal(m.clock.pending.size, 0);
    // Even late errors and close cannot throw, kill twice, or turn this PASS.
    m.child.emit('error', Error('private late error')); m.child.stdin.emit('error', Error('private late EPIPE'));
    m.child.emit('close', 0, null); m.clock.advance(60000);
    assert.equal(result.ok, false); assert.deepEqual(m.child.kills, ['SIGKILL']);
  });
}

test('exit without close is not success and does not signal an exited/reused PID', options, async () => {
  const m = model(); complete(m.child);
  m.child.exitCode = 0; m.child.emit('exit', 0, null);
  m.clock.advance(22000); const result = await m.promise;
  assertUnconfirmed(result, m.child); assert.equal(result.exited, true);
  assert.equal(result.kill_status, 'already_exited'); assert.deepEqual(m.child.kills, []);
});
test('exitCode observed without exit event also prevents signalling the PID', options, async () => {
  const m = model(); m.child.exitCode = 0;
  m.clock.advance(22000); assertUnconfirmed(await m.promise, m.child); assert.deepEqual(m.child.kills, []);
});
test('close after forced termination confirms cleanup but can never claim success', options, async () => {
  const m = model(); complete(m.child); m.clock.advance(20000);
  m.child.emit('close', 0, null); const result = await m.promise;
  assert.equal(result.ok, false); assert.equal(result.closed, true); assert.equal(result.fixture_cleanup_allowed, true);
  assert.equal(result.deadline_exceeded, true); assert.equal(m.clock.pending.size, 0);
});
test('synchronous close during kill clears reap timer and still fails closed', options, async () => {
  const m = model(); m.child.killAction = () => { m.child.emit('close', null, 'SIGKILL'); return true; };
  m.clock.advance(20000); const result = await m.promise;
  assert.equal(result.ok, false); assert.equal(result.closed, true); assert.equal(m.clock.pending.size, 0);
});

for (const error of ['write-callback-EPIPE', 'stdin-EPIPE', 'stdout-error', 'stderr-error', 'write-throws', 'process-error']) {
  test(`stream/process failure has a bounded reap and no unhandled error: ${error}`, options, async () => {
    const m = model();
    if (error === 'write-callback-EPIPE') m.child.stdin.writeError = Error('private EPIPE');
    if (error === 'write-throws') m.child.stdin.throwWrite = true;
    if (error.startsWith('write-')) m.child.stdout.emit('data', ready());
    else (error === 'process-error' ? m.child : m.child[error.split('-')[0]]).emit('error', Error('private native error'));
    m.clock.advance(2000); const result = await m.promise;
    assertUnconfirmed(result, m.child); assert.deepEqual(m.child.kills, ['SIGKILL']);
    for (const emitter of [m.child, m.child.stdin, m.child.stdout, m.child.stderr])
      assert.doesNotThrow(() => emitter.emit('error', Error('private repeated error')));
  });
}
test('EPIPE followed by an apparently normal close is not a successful probe', options, async () => {
  const m = model(); complete(m.child); m.child.stdin.emit('error', Error('private EPIPE'));
  m.child.emit('close', 0, null); const result = await m.promise;
  assert.equal(result.ok, false); assert.equal(result.fixture_cleanup_allowed, true);
});

for (const failures of [[1], [2], [1, 2]]) {
  test(`timer creation failure (${failures.join(',')}) cannot hang or claim PASS`, options, async () => {
    const clock = new Clock(); clock.failSet = new Set(failures);
    const m = model({ clock }); clock.advance(22000);
    const result = await m.promise;
    assertUnconfirmed(result, m.child); assert.equal(result.timer_failed, true); assert.deepEqual(m.child.kills, ['SIGKILL']);
    assert.equal(clock.pending.size, 0);
  });
}
test('clearTimeout failure is contained and the stale callback cannot kill after close', options, async () => {
  const m = model(); m.clock.failClear = true; complete(m.child); m.child.emit('close', 0, null);
  const result = await m.promise;
  assert.equal(result.ok, false); assert.equal(result.timer_failed, true);
  assert.ok([...m.clock.pending].every(timer => !timer.referenced));
  m.clock.advance(22000); assert.deepEqual(m.child.kills, []);
});
test('destroy/unref exceptions do not escape the timer callback', options, async () => {
  const m = model();
  for (const stream of [m.child.stdin, m.child.stdout, m.child.stderr]) stream.throwDestroy = stream.throwUnref = true;
  m.child.unref = () => { ++m.child.unrefs; throw Error('private unref error'); };
  assert.doesNotThrow(() => m.clock.advance(22000)); assertUnconfirmed(await m.promise, m.child);
});
test('unknown ready error is reduced to a fixed code, with no vendor/path text', options, async () => {
  const m = model(); m.child.stdout.emit('data', outputFrame({ schema: 'datasecure-standalone-ready/1', ok: false, error_code: 'private /vendor/path' }));
  m.child.emit('close', 1, null); const result = await m.promise;
  assert.equal(result.ready_error_code, 'STANDALONE_OPERATION_FAILED'); assert.ok(!JSON.stringify(result).includes('private'));
});
for (const malformed of ['missing-ACK', 'trailing-partial-frame', 'duplicate-ACK', 'oversize']) {
  test(`protocol is not relaxed by shared lifecycle: ${malformed}`, options, async () => {
    const m = model(); m.child.stdout.emit('data', ready());
    if (malformed !== 'missing-ACK') m.child.stdout.emit('data', ack());
    if (malformed === 'trailing-partial-frame') m.child.stdout.emit('data', Buffer.from([0]));
    if (malformed === 'duplicate-ACK') m.child.stdout.emit('data', ack());
    if (malformed === 'oversize') m.child.stdout.emit('data', Buffer.alloc(1024 * 1024 + 5));
    m.child.emit('close', 0, null); assert.equal((await m.promise).ok, false);
  });
}
test('Windows setup commands share the bounded reap contract, not execFileSync', options, async () => {
  const normal = model({ command: true }); normal.child.stdout.emit('data', Buffer.from('synthetic SID output'));
  normal.child.emit('close', 0, null); const result = await normal.promise;
  assert.equal(result.ok, true); assert.equal(result.stdout.toString(), 'synthetic SID output');
  const refused = model({ command: true }); refused.child.killAction = () => false;
  refused.clock.advance(6999); await Promise.resolve(); assert.equal(refused.result(), undefined);
  refused.clock.advance(1); assertUnconfirmed(await refused.promise, refused.child);
});

function packageFixture(platform) {
  const parent = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'datasecure-ownership-load-model-'));
  const initial = fs.lstatSync(root, { bigint: true }), inventory = [];
  const put = (relative, bytes) => {
    const file = path.join(root, relative), directories = [];
    for (let dir = path.dirname(file); dir !== root && !fs.existsSync(dir); dir = path.dirname(dir)) directories.unshift(dir);
    for (const dir of directories) { fs.mkdirSync(dir); inventory.push([dir, fs.lstatSync(dir, { bigint: true })]); }
    fs.writeFileSync(file, bytes); inventory.push([file, fs.lstatSync(file, { bigint: true })]); return file;
  };
  const installation = platform === 'macos' ? path.join(root, 'DataSecure Standalone.app') : root;
  const prefix = platform === 'macos' ? 'DataSecure Standalone.app/' : '';
  const source = { fingerprint: 'a'.repeat(64), files: [] };
  let macPolicy;
  const build = platform === 'macos' ? (() => {
    // Explicit build-input model only: these bytes are NOT Mach-O, signed,
    // provisioned or approved by the repository. The real pure JSON approval
    // validator and bundle byte/marker checks still run against this fixture.
    const bytes = Buffer.alloc(64, 7), hash = value => crypto.createHash('sha256').update(value).digest('hex');
    const upstream = { archive: 'node-v22.23.2.tar.xz', sha256: 'bbe768df8d5815d7fa76124052985332452e0a4742d39f32027550d1aab8f6fb' };
    const staticBinding = { name: 'datasecure_ownership_guard', abi: 1, napi: 8 };
    const artifact = { schema: 'datasecure-macos-static-core-artifact/1', role: 'mutating-core', target: 'macos-x64',
      rust_target: 'x86_64-apple-darwin', node_version: '22.23.2', upstream, static_binding: staticBinding,
      inputs: { guard_c_sha256: 'c'.repeat(64), adapter_cc_sha256: 'd'.repeat(64), adapter_h_sha256: 'e'.repeat(64), transform_sha256: 'f'.repeat(64) },
      build: { provenance_file: 'BUILD-PROVENANCE.json', provenance_sha256: '1'.repeat(64) },
      core: { file: 'datasecure-core', bytes: bytes.length, sha256: hash(bytes), unsigned_sha256: '2'.repeat(64) },
      converter: { archive_sha256: '3'.repeat(64), bytes: 64, sha256: '4'.repeat(64), license_sha256: '5'.repeat(64) },
      license: { file: 'LICENSE.node.txt', bytes: 1, sha256: '6'.repeat(64) },
      signing: { identity: '-', hardened_runtime: true, entitlements: { 'com.apple.security.cs.allow-jit': true } } };
    const artifactSha256 = hash(canonicalBytes(artifact));
    macPolicy = { schema: 'datasecure-macos-static-core-policy/1', node_version: '22.23.2', maximum_core_bytes: 128 * 1024 * 1024,
      upstream, guard_source_sha256: artifact.inputs.guard_c_sha256, static_binding: staticBinding,
      approved_artifacts: [{ target: artifact.target, artifact_sha256: artifactSha256 }] };
    return { artifact, artifactSha256, bytes };
  })() : { artifact: { sha256: 'b'.repeat(64) }, bytes: Buffer.alloc(64, 7) };
  const runtimeBytes = Buffer.from('synthetic projected runtime\n');
  const runtimeRelative = platform === 'macos' ? `${prefix}Contents/Resources/server` : 'server';
  const runtime = put(`${runtimeRelative}/standalone/desktop-sidecar.js`, runtimeBytes);
  source.files.push({ path: 'plugins/data-secure/server/standalone/desktop-sidecar.js', bytes: runtimeBytes.length,
    sha256: crypto.createHash('sha256').update(runtimeBytes).digest('hex') });
  const desktop = put(platform === 'macos' ? `${prefix}Contents/MacOS/datasecure-standalone` : 'DataSecure Standalone.exe', Buffer.concat([
    Buffer.alloc(1024), Buffer.from(SOURCE_MARKER_PREFIX + source.fingerprint + SOURCE_MARKER_SUFFIX),
    ...(platform === 'macos' ? [Buffer.from(CORE_MARKER_PREFIX + build.artifact.core.sha256 + CORE_MARKER_SUFFIX),
      Buffer.from(PROVENANCE_MARKER_PREFIX + build.artifactSha256 + PROVENANCE_MARKER_SUFFIX)]
      : [Buffer.from(OWNERSHIP_MARKER_PREFIX + build.artifact.sha256 + OWNERSHIP_MARKER_SUFFIX)]) ]));
  // The shared tampering assertion calls this payload `guard`; on macOS it is
  // now the static Core executable, never an external addon or official Node.
  const guard = put(platform === 'macos' ? `${prefix}Contents/MacOS/datasecure-core` : 'server/native/windows-x64/ownership-guard.node', build.bytes);
  const manifest = { version: 'synthetic', target: 'windows-x64', source_fingerprint: source.fingerprint };
  const manifestPath = platform === 'windows' ? put('STANDALONE-MANIFEST.json', JSON.stringify(manifest)) : null;
  let sourceChanged = false, sourceChecks = 0;
  const gate = fs.readFileSync(path.join(repository, `tests/manual/standalone-${platform}-ownership-load.mjs`), 'utf8');
  // Execute the actual gate's entire binding function against real synthetic
  // files and real source/Core/artifact marker and projection validators.
  // Repository fingerprint recomputation is injected: this is not a full repo.
  const bindingBody = gate.slice(gate.indexOf('function assertPackageSource() {'), gate.indexOf('\n}\nassertPackageSource();') + 2);
  assert.ok(bindingBody.startsWith('function assertPackageSource() {') && bindingBody.endsWith('\n}'));
  const binding = bound.bindDirectory(installation);
  const check = new Function('bound', 'path', 'assert', 'assertStandaloneSourceUnchanged', 'assertStandaloneBuildFingerprint',
    'assertOwnershipGuardMarker', 'assertMacCoreBundle', 'assertStandaloneRuntimeSource', 'repository', 'source', 'build', 'server', 'app', 'appBinding',
    'installation', 'installationBinding', 'manifest', `${bindingBody}\nreturn assertPackageSource;`)(bound, path, assert,
    (actualRepository, fingerprint) => {
      ++sourceChecks; assert.equal(actualRepository, repository); assert.equal(fingerprint, source.fingerprint);
      if (sourceChanged) throw Error('STANDALONE_SOURCE_CHANGED');
    }, assertStandaloneBuildFingerprint, assertOwnershipGuardMarker, assertMacCoreBundle, assertStandaloneRuntimeSource,
    repository, source, build, path.join(root, runtimeRelative), installation, binding, root, binding, manifest);
  return { root, installation, source, build, runtime, desktop, guard, manifestPath, manifest, gate, check,
    loadMacStaticCore(actualRepository, target) {
      assert.equal(platform, 'macos'); assert.equal(actualRepository, repository); assert.equal(target, build.artifact.target);
      assert.equal(validateMacCoreArtifact(build.artifact, macPolicy, target), build.artifactSha256);
      return build;
    },
    revokeCoreApproval() { assert.equal(platform, 'macos'); macPolicy.approved_artifacts = []; },
    changeSource: () => { sourceChanged = true; }, sourceChecks: () => sourceChecks,
    cleanup() {
      // Delete only this fully enumerated synthetic inventory, never recursively
      // traverse a replacement directory or an unexpected child.
      const now = fs.lstatSync(root, { bigint: true });
      assert.ok(now.isDirectory() && !now.isSymbolicLink() && now.dev === initial.dev && now.ino === initial.ino);
      assert.equal(path.dirname(root), parent); assert.match(path.basename(root), /^datasecure-ownership-load-model-/u);
      for (const [file, identity] of inventory.reverse()) {
        const actual = fs.lstatSync(file, { bigint: true });
        assert.ok(!actual.isSymbolicLink() && actual.dev === identity.dev && actual.ino === identity.ino);
        if (actual.isDirectory()) { assert.equal(fs.readdirSync(file).length, 0); fs.rmdirSync(file); }
        else { assert.ok(actual.isFile()); fs.unlinkSync(file); }
      }
      assert.equal(fs.readdirSync(root).length, 0); fs.rmdirSync(root);
    } };
}

for (const platform of ['windows', 'macos']) {
  test(`${platform}: actual gate rechecks common UI marker, ${platform === 'macos' ? 'static Core/artifact markers' : 'guard'}, projection and source before PASS`, options, () => {
    const fixture = packageFixture(platform);
    try {
      assert.doesNotThrow(fixture.check); assert.equal(fixture.sourceChecks(), 1);
      const body = fixture.gate;
      assert.equal((body.match(/^assertPackageSource\(\);$/gmu) || []).length, 1);
      assert.equal((body.match(/^  assertPackageSource\(\);$/gmu) || []).length, 1);
      assert.ok(body.indexOf('assertPackageSource();') < body.indexOf('fs.mkdtempSync'));
      const finalCheck = body.lastIndexOf('assertPackageSource();');
      assert.ok(finalCheck > body.indexOf('await probeOwnershipLoad(') && finalCheck < body.indexOf('  console.log('));
      const desktop = fs.readFileSync(fixture.desktop);
      fs.writeFileSync(fixture.desktop, Buffer.from(desktop.toString('latin1').replace(fixture.source.fingerprint, 'c'.repeat(64)), 'latin1'));
      assert.throws(fixture.check, /STANDALONE_DESKTOP_SOURCE_MISMATCH/u);
      fs.writeFileSync(fixture.desktop, desktop);
      const runtime = fs.readFileSync(fixture.runtime);
      fs.writeFileSync(fixture.runtime, Buffer.alloc(runtime.length, 42));
      assert.throws(fixture.check, /STANDALONE_RUNTIME_SOURCE_MISMATCH/u);
      fs.writeFileSync(fixture.runtime, runtime);
      fs.writeFileSync(fixture.guard, Buffer.alloc(64, 8)); assert.throws(fixture.check);
      fs.writeFileSync(fixture.guard, fixture.build.bytes);
      if (fixture.manifestPath) {
        fs.writeFileSync(fixture.manifestPath, JSON.stringify({ ...fixture.manifest, source_fingerprint: 'd'.repeat(64) }));
        assert.throws(fixture.check);
        fs.writeFileSync(fixture.manifestPath, JSON.stringify(fixture.manifest));
      }
      assert.doesNotThrow(fixture.check);
      fixture.changeSource(); assert.throws(fixture.check, /STANDALONE_SOURCE_CHANGED/u);
    } finally { fixture.cleanup(); }
  });
  test(`${platform}: gate preserves unresolved fixture and reports no success`, options, () => {
    const body = fs.readFileSync(path.join(repository, `tests/manual/standalone-${platform}-ownership-load.mjs`), 'utf8');
    const cleanup = body.slice(body.indexOf('} finally {'));
    assert.ok(cleanup.indexOf('if (child && !ended) throw Error(') < cleanup.indexOf('fs.rmSync('));
    assert.match(body, platform === 'windows' ? /fixture_preserved: true/u : /fixture_preserved: !result\.fixture_cleanup_allowed/u);
    assert.match(body, /process_end: result\.closed \? 'confirmed' : 'unconfirmed'/u);
    assert.ok(body.indexOf('if (!result.ok)') < body.indexOf('  console.log('));
    assert.doesNotMatch(body, /execFileSync|\.stdin\.end\(|\.kill\(/u);
  });
}

async function executeGateModel(platform, flow) {
  const fixture = packageFixture(platform), clock = new Clock(), created = [], reports = [], successes = [], children = [];
  if (flow === 'unapproved-core') fixture.revokeCoreApproval();
  let gateFixture, gateIdentity, removalRequested = false, fingerprintChecks = 0;
  const modelFs = { ...fs,
    mkdtempSync(prefix) {
      assert.match(prefix, new RegExp(`datasecure-${platform}-ownership-load-$`, 'u'));
      gateFixture = fs.mkdtempSync(prefix); gateIdentity = fs.lstatSync(gateFixture, { bigint: true }); return gateFixture;
    },
    mkdirSync(directory, permissions) {
      if (permissions?.recursive === true) {
        // The real Windows loader gate now passes the fixed native namespace
        // explicitly. Model its isolated setup exactly; do not erase that
        // preparation or grant arbitrary recursive writes to this harness.
        assert.equal(platform, 'windows');
        assert.deepEqual(permissions, { recursive: true });
        const components = ['profile/AppData', 'profile/AppData/Local',
          'profile/AppData/Local/SecureDataMsg-Standalone'];
        assert.equal(directory, path.join(gateFixture, components.at(-1)));
        for (const relative of components) {
          const next = path.join(gateFixture, relative);
          fs.mkdirSync(next); created.push([next, fs.lstatSync(next, { bigint: true })]);
        }
        return path.join(gateFixture, components[0]);
      }
      assert.equal(path.dirname(directory), gateFixture);
      fs.mkdirSync(directory, permissions); created.push([directory, fs.lstatSync(directory, { bigint: true })]);
    },
    rmSync(directory, configuration) {
      assert.equal(directory, gateFixture); assert.deepEqual(configuration, { recursive: true });
      removalRequested = true; // Model the gate's decision; cleanup below is enumerated, not recursive.
    } };
  const modelPath = { ...path, basename(file) {
    // The binding fixture has a random containment root rather than a native
    // install name. This sole path assertion is modelled, not a package claim.
    if (file === fixture.root) return platform === 'macos' ? 'DataSecure Standalone.app' : WINDOWS_PACKAGE_ROOT;
    return path.basename(file);
  } };
  function spawnModel(executable, parameters, configuration) {
    const child = new Child(); children.push(child);
    const name = path.basename(executable), setup = ['whoami.exe', 'icacls.exe'].includes(name);
    const initialProbe = platform === 'windows' && parameters[0] === '--require';
    assert.equal(configuration.shell, false);
    if (setup) {
      assert.equal(platform, 'windows'); assert.deepEqual(configuration.stdio, ['ignore', 'pipe', 'pipe']);
      child.stdin = null;
    } else if (initialProbe) {
      assert.deepEqual(parameters, ['--require', path.join(fixture.root, 'server/network-deny.cjs'),
        path.join(repository, 'tests/helpers/native-initial-results-fixture.cjs'), '--server', path.join(fixture.root, 'server'), '--scope', gateFixture]);
      assert.equal(configuration.cwd, gateFixture); assert.deepEqual(configuration.stdio, ['ignore', 'pipe', 'pipe']);
      assert.equal(configuration.env.DATASECURE_NATIVE_EXPORT_CHANNEL, '1');
      assert.equal(configuration.env.DATASECURE_OWNERSHIP_GUARD_SHA256, fixture.build.artifact.sha256);
      child.stdin = null; child.killAction = () => false;
    } else {
      assert.deepEqual(parameters, ['--require=../network-deny.cjs', 'desktop-sidecar.js']);
      assert.equal(configuration.cwd, path.join(fixture.installation, platform === 'macos' ? 'Contents/Resources/server/standalone' : 'server/standalone'));
      if (platform === 'macos') {
        assert.equal(executable, path.join(fixture.installation, 'Contents/MacOS/datasecure-core'));
        assert.equal(configuration.env.DATASECURE_MACOS_STATIC_CORE_SHA256, fixture.build.artifact.core.sha256);
        assert.equal(configuration.env.DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256, fixture.build.artifactSha256);
        assert.equal(configuration.env.DATASECURE_OWNERSHIP_GUARD_SHA256, undefined);
        assert.equal(configuration.env.DATASECURE_OWNERSHIP_GUARD_PATH, undefined);
      }
      if (platform === 'windows') {
        assert.equal(configuration.env.DATASECURE_STANDALONE_NAMESPACE_ROOT,
          path.join(gateFixture, 'profile/AppData/Local/SecureDataMsg-Standalone'));
        assert.ok(fs.statSync(configuration.env.DATASECURE_STANDALONE_NAMESPACE_ROOT).isDirectory());
      }
      child.killAction = () => false;
    }
    queueMicrotask(() => {
      if (setup) {
        if (name === 'whoami.exe') child.stdout.emit('data', Buffer.from('"synthetic account","S-1-5-21-123"\n'));
        child.emit('close', 0, null); return;
      }
      if (initialProbe) {
        // Explicit command receipt MODEL, not execution of the shared helper,
        // its real product writer or a native capability.
        if (flow === 'initial-output-command-failure') {
          child.stderr.emit('data', Buffer.from(JSON.stringify({ schema: 'datasecure-native-initial-results/1', native_status: 'FAILED',
            phase: 'initial_result_output_guard', error_code: 'RESULT_ROOT_UNSAFE', fixture_preserved: true })));
          child.exitCode = 1; child.emit('exit', 1, null); child.emit('close', 1, null); return;
        }
        child.stdout.emit('data', Buffer.from(JSON.stringify({ schema: 'datasecure-native-initial-results/1',
          target: 'windows-x64', native_output_guard: flow !== 'initial-output-fallback', refused_guard_mkdirs: 0,
          ...(flow === 'initial-output-missing-precondition' ? {} : {
            initial_output_admission: flow === 'initial-output-wrong-precondition' ? 'NATIVE_ACK' : 'TEST_OWNED_PRECONDITION',
            tauri_native_provisioning: 'NOT_RUN' }),
          refused_guard_attempt_absent: true, created_directories: 2, written_documents: 2,
          read_only_reopen_under_output_lock: true, reopen_mkdirs: 0, exact_visible_markdown_inventory: true,
          lock_only_in_output_container: true, original_inputs_unchanged: true, fixture_cleanup_confirmed: true })));
        child.exitCode = 0; child.emit('exit', 0, null); child.emit('close', 0, null); return;
      }
      if (flow === 'unconfirmed') { clock.advance(22000); return; }
      const diagnostic = path.join(configuration.env.DATASECURE_STANDALONE_DIAGNOSTIC_DIR, 'sidecar-interactions.jsonl');
      fs.writeFileSync(diagnostic, JSON.stringify({ event: 'ownership_control_check_finished', outcome: 'ready' }) + '\n');
      created.push([diagnostic, fs.lstatSync(diagnostic, { bigint: true })]);
      complete(child);
      if (flow === 'stale-projection') fs.writeFileSync(fixture.runtime, 'changed synthetic projected runtime\n');
      if (flow === 'stale-core') fs.writeFileSync(fixture.guard, Buffer.alloc(fixture.build.bytes.length, 8));
      if (flow === 'stale-core-marker' || flow === 'stale-artifact-marker') {
        const expected = flow === 'stale-core-marker' ? fixture.build.artifact.core.sha256 : fixture.build.artifactSha256;
        const bytes = fs.readFileSync(fixture.desktop);
        fs.writeFileSync(fixture.desktop, Buffer.from(bytes.toString('latin1').replace(expected, '0'.repeat(64)), 'latin1'));
      }
      child.exitCode = 0; child.emit('exit', 0, null); child.emit('close', 0, null);
    });
    return child;
  }
  const names = ['assert', 'fs', 'os', 'path', 'spawn', 'fileURLToPath', 'createRequire', 'loadOwnershipGuardBuild',
    'assertOwnershipGuardMarker', 'loadMacStaticCore', 'assertMacCoreBundle', 'standaloneBuildFingerprint', 'assertStandaloneBuildFingerprint',
    'assertStandaloneSourceUnchanged', 'assertStandaloneRuntimeSource', 'probeOwnershipLoad', 'runOwnershipLoadCommand',
    'windowsPackageRoots', 'bound', 'crypto', 'process', 'console'];
  const values = [assert, modelFs, os, modelPath, spawnModel,
    () => path.join(repository, `tests/manual/standalone-${platform}-ownership-load.mjs`),
    () => specifier => specifier.endsWith('desktop-ipc.js') ? { encodeFrame } : { DESKTOP_ERROR_CODES: ['STANDALONE_OPERATION_FAILED'] },
    () => fixture.build, assertOwnershipGuardMarker, fixture.loadMacStaticCore, assertMacCoreBundle,
    () => fixture.source, assertStandaloneBuildFingerprint,
    (root, fingerprint) => { ++fingerprintChecks; assert.equal(root, repository); assert.equal(fingerprint, fixture.source.fingerprint); },
    assertStandaloneRuntimeSource,
    (child, configuration) => probeOwnershipLoad(child, { ...configuration, timers: clock }),
    child => runOwnershipLoadCommand(child, { timers: clock }), windowsPackageRoots, bound, crypto,
    { platform: platform === 'macos' ? 'darwin' : 'win32', arch: 'x64', pid: 12345, env: {},
      argv: platform === 'macos' ? ['node', 'model', '--app', fixture.installation, '--target', 'macos-x64'] : ['node', 'model', '--package', fixture.root] },
    { error: report => reports.push(JSON.parse(report)), log: report => successes.push(JSON.parse(report)) }];
  // Execute the complete unchanged gate body, with imports bound to explicitly
  // modelled OS/process/build inputs. No compiler, shell, native child or GUI.
  const body = fixture.gate.replace(/^import[\s\S]*?;\r?\n/gmu, '').replaceAll('import.meta.url', '"model-entry"');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let error;
  try {
    try { await new AsyncFunction(...names, body)(...values); } catch (caught) { error = caught; }
    if (flow === 'unapproved-core') {
      assert.match(error?.message || '', /STANDALONE_MACOS_STATIC_CORE_INVALID/u);
      assert.equal(gateFixture, undefined); assert.equal(children.length, 0); assert.equal(fingerprintChecks, 0);
      assert.equal(removalRequested, false); assert.equal(successes.length, 0); assert.equal(reports.length, 0);
    } else if (flow === 'unconfirmed') {
      assert.match(error?.message || '', /OWNERSHIP_PROCESS_NOT_REAPED/u);
      assert.equal(removalRequested, false); assert.equal(fs.existsSync(gateFixture), true);
      assert.equal(successes.length, 0); assert.equal(reports.length, 1);
      assert.equal(reports[0].process_end, 'unconfirmed'); assert.equal(reports[0].fixture_preserved, true);
      assert.equal(reports[0].kill_status, 'refused'); assert.equal(children.at(-1).unrefs, 1);
    } else if (['stale-projection', 'stale-core', 'stale-core-marker', 'stale-artifact-marker'].includes(flow)) {
      assert.match(error?.message || '', flow === 'stale-projection' ? /STANDALONE_RUNTIME_SOURCE_MISMATCH/u : /STANDALONE_MACOS_STATIC_CORE_INVALID/u);
      assert.equal(successes.length, 0); assert.equal(removalRequested, platform !== 'windows'); assert.equal(fingerprintChecks, 2);
    } else if (flow.startsWith('initial-output-')) {
      assert.ok(error); assert.equal(successes.length, 0); assert.equal(removalRequested, false);
      assert.equal(children.length, 4); assert.equal(fingerprintChecks, 2);
      if (flow === 'initial-output-command-failure') {
        assert.equal(error.message, 'WINDOWS_INITIAL_RESULT_OUTPUT_GUARD_FAILED'); assert.equal(reports.length, 1);
        assert.equal(reports[0].phase, 'initial_result_output_guard'); assert.equal(reports[0].error_code, 'RESULT_ROOT_UNSAFE');
        assert.equal(reports[0].ready, true); assert.equal(reports[0].shutdown, true); assert.equal(reports[0].fixture_preserved, true);
        assert.equal(fs.existsSync(gateFixture), true);
      }
    } else {
      assert.equal(error, undefined); assert.equal(successes.length, 1); assert.equal(reports.length, 0);
      assert.equal(successes[0].source_fingerprint, fixture.source.fingerprint);
      if (platform === 'macos') {
        assert.equal(successes[0].core_sha256, fixture.build.artifact.core.sha256);
        assert.equal(successes[0].artifact_sha256, fixture.build.artifactSha256);
        assert.equal(successes[0].gui, 'NOT_RUN'); assert.equal(successes[0].m2, 'NOT_RUN');
      }
      if (platform === 'windows') {
        assert.equal(successes[0].initial_result_output_guard.native_output_guard, true);
        assert.equal(successes[0].initial_result_output_guard.initial_output_admission, 'TEST_OWNED_PRECONDITION');
        assert.equal(successes[0].initial_result_output_guard.tauri_native_provisioning, 'NOT_RUN');
        assert.match(successes[0].initial_results_helper_sha256, /^[a-f0-9]{64}$/u); assert.equal(children.length, 4);
      }
      assert.equal(removalRequested, true); assert.equal(fingerprintChecks, platform === 'windows' ? 3 : 2);
    }
    assert.equal(clock.pending.size, 0);
  } finally {
    // An unconfirmed *model* has no native process. We may remove its synthetic
    // fixture after asserting the production gate did not request removal.
    if (gateFixture) {
      assert.equal(path.dirname(gateFixture), fs.realpathSync.native(os.tmpdir()));
      assert.match(path.basename(gateFixture), new RegExp(`^datasecure-${platform}-ownership-load-`, 'u'));
      const root = fs.lstatSync(gateFixture, { bigint: true });
      assert.ok(root.isDirectory() && !root.isSymbolicLink() && root.dev === gateIdentity.dev && root.ino === gateIdentity.ino);
      for (const [file, identity] of created.reverse()) {
        const current = fs.lstatSync(file, { bigint: true });
        assert.ok(!current.isSymbolicLink() && current.dev === identity.dev && current.ino === identity.ino);
        if (current.isDirectory()) { assert.equal(fs.readdirSync(file).length, 0); fs.rmdirSync(file); }
        else { assert.ok(current.isFile()); fs.unlinkSync(file); }
      }
      assert.equal(fs.readdirSync(gateFixture).length, 0); fs.rmdirSync(gateFixture);
    }
    fixture.cleanup();
  }
}
for (const platform of ['windows', 'macos']) for (const flow of ['unconfirmed', 'normal-close', 'stale-projection'])
  test(`${platform}: complete gate model ${flow}`, options, () => executeGateModel(platform, flow));
for (const flow of ['unapproved-core', 'stale-core', 'stale-core-marker', 'stale-artifact-marker'])
  test(`macos: complete static-Core model rejects ${flow} before success`, options, () => executeGateModel('macos', flow));
for (const flow of ['initial-output-fallback', 'initial-output-missing-precondition', 'initial-output-wrong-precondition', 'initial-output-command-failure'])
  test(`windows: complete gate rejects ${flow} and preserves its fixture`, options, () => executeGateModel('windows', flow));

for (const fault of ['none', 'missing-receipt', 'wrong-digest', 'wrong-identity', 'settings-changed'])
  test(`Windows test-owned precondition actual receipt reader: ${fault}`, options, () => {
    // Execute the actual test-helper setup, real BigInt/stat and unchanged
    // production receipt reader. ONLY the setting-writer boundary is modelled;
    // this is not Tauri provisioning, native admission or a C-guard proof.
    const parent = fs.realpathSync.native(os.tmpdir()), root = fs.mkdtempSync(path.join(parent, 'datasecure-ownership-load-model-'));
    const original = fs.lstatSync(root, { bigint: true }), result = path.join(root, 'results');
    const privateRoot = path.join(root, 'private'), settingsDirectory = path.join(privateRoot, 'settings');
    for (const named of [result, privateRoot, settingsDirectory]) fs.mkdirSync(named);
    const setting = path.join(settingsDirectory, 'result-root.json'), server = path.join(root, 'unchanged-package-server');
    const receiptModule = { exports: {} };
    const receiptSource = fs.readFileSync(path.join(repository, 'plugins/data-secure/server/gateway/initial-output-binding.js'), 'utf8');
    new Function('require', 'module', 'exports', receiptSource)(specifier => {
      if (specifier === '../runtime') return { dataRoot: () => privateRoot };
      if (specifier === '../core/bound-file-io') return bound;
      if (specifier === '../core/native-directory-identity') return require('../plugins/data-secure/server/core/native-directory-identity.js');
      return require(specifier);
    }, receiptModule, receiptModule.exports);
    const receipts = receiptModule.exports, receiptPath = receipts.receiptPath(result), writes = [];
    let settingsBytes;
    const config = { configPath: () => setting, saveConfiguredResultRoot(selected) {
      assert.equal(selected, result); settingsBytes = Buffer.from(JSON.stringify({ schema: 'explicit-setting-writer-model/1', root: selected }));
      fs.writeFileSync(setting, settingsBytes, { flag: 'wx' });
    } };
    const modelFs = { ...fs, writeFileSync(named, bytes, configuration) {
      writes.push(named); assert.equal(named, receiptPath); assert.equal(configuration.flag, 'wx');
      if (fault === 'missing-receipt') return;
      const value = JSON.parse(bytes);
      if (fault === 'wrong-digest') value.setting_sha256 = 'f'.repeat(64);
      if (fault === 'wrong-identity') value.binding.output_identity.ino = String(BigInt(value.binding.output_identity.ino) + 1n);
      fs.writeFileSync(named, JSON.stringify(value), configuration);
      if (fault === 'settings-changed') fs.writeFileSync(setting, Buffer.from('changed model settings'));
    } };
    const helper = fs.readFileSync(path.join(repository, 'tests/helpers/native-initial-results-fixture.cjs'), 'utf8');
    const start = helper.indexOf('function prepareWindowsFixtureResultRoot('), end = helper.indexOf('\nfunction runNativeInitialResults(');
    assert.ok(start >= 0 && end > start);
    const prepare = new Function('assert', 'fs', 'path', 'digest', 'require', `${helper.slice(start, end)}\nreturn prepareWindowsFixtureResultRoot;`)(
      assert, modelFs, path, bytes => crypto.createHash('sha256').update(bytes).digest('hex'), specifier => {
        if (specifier === path.join(server, 'core/bound-file-io.js')) return bound;
        if (specifier === path.join(server, 'gateway/result-folder-config.js')) return config;
        if (specifier === path.join(server, 'gateway/initial-output-binding.js')) return receipts;
        assert.fail('unexpected test-helper import');
      });
    try {
      if (fault === 'none') {
        assert.deepEqual(prepare(server, result), { initial_output_admission: 'TEST_OWNED_PRECONDITION', tauri_native_provisioning: 'NOT_RUN' });
        const receipt = receipts.readReceipt(result, { required: true });
        assert.equal(receipt.setting_sha256, crypto.createHash('sha256').update(settingsBytes).digest('hex'));
        assert.deepEqual(fs.readFileSync(setting), settingsBytes); assert.equal(writes.length, 1);
      } else assert.throws(() => prepare(server, result));
    } finally {
      // Synchronous owned model only; enumerate and revalidate every entry.
      assert.equal(path.dirname(root), parent); assert.match(path.basename(root), /^datasecure-ownership-load-model-/u);
      const current = fs.lstatSync(root, { bigint: true });
      assert.ok(current.isDirectory() && !current.isSymbolicLink() && current.dev === original.dev && current.ino === original.ino);
      const entries = [];
      const inspect = named => {
        assert.ok(entries.length < 32); const stat = fs.lstatSync(named, { bigint: true });
        assert.ok(!stat.isSymbolicLink() && (stat.isFile() || stat.isDirectory()));
        assert.ok(stat.isDirectory() || stat.nlink === 1n); entries.push({ named, stat });
        if (stat.isDirectory()) for (const child of fs.readdirSync(named)) inspect(path.join(named, child));
      };
      inspect(root);
      for (const { named, stat } of entries.reverse()) {
        const now = fs.lstatSync(named, { bigint: true });
        assert.ok(!now.isSymbolicLink() && now.dev === stat.dev && now.ino === stat.ino && now.isDirectory() === stat.isDirectory());
        if (stat.isDirectory()) { assert.deepEqual(fs.readdirSync(named), []); fs.rmdirSync(named); }
        else fs.unlinkSync(named);
      }
    }
  });

test('new source/model regression is registered exactly once in the product runner', options, () => {
  const suite = require('./run-product-suite.js');
  assert.equal(suite.baseFiles.filter(file => file === 'tests/test-ownership-load-lifecycle.mjs').length, 1);
});
