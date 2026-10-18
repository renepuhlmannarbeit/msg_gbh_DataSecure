// Native macOS build-host gate, no WebView/Finder/UI interaction. In particular,
// a source model cannot prove that hardened dyld will admit our signed addon.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadMacStaticCore, assertMacCoreBundle } from '../../scripts/lib/macos-core-artifact.mjs';
import { standaloneBuildFingerprint, assertStandaloneBuildFingerprint, assertStandaloneSourceUnchanged,
  assertStandaloneRuntimeSource } from '../../scripts/lib/standalone-build-fingerprint.mjs';
import { probeOwnershipLoad } from '../helpers/ownership-load-lifecycle.mjs';
import bound from '../../plugins/data-secure/server/core/bound-file-io.js';
const require = createRequire(import.meta.url);
const { encodeFrame } = require('../../plugins/data-secure/server/standalone/desktop-ipc.js');
const { DESKTOP_ERROR_CODES } = require('../../plugins/data-secure/server/core/desktop-error-contract.js');
const safeCodes = new Set(DESKTOP_ERROR_CODES);
const args = process.argv.slice(2);
assert.equal(process.platform, 'darwin', 'MACOS_OWNERSHIP_NATIVE_HOST_REQUIRED');
assert.deepEqual([args[0], args[2], args.length], ['--app', '--target', 4]);
assert.equal(args[3], `macos-${process.arch}`);
const app = path.resolve(args[1]); assert.equal(path.basename(app), 'DataSecure Standalone.app');
const appBinding = bound.bindDirectory(app);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = standaloneBuildFingerprint(repository), build = loadMacStaticCore(repository, args[3]);
const server = path.join(app, 'Contents/Resources/server');
function assertPackageSource() {
  bound.assertDirectory(appBinding);
  assertStandaloneSourceUnchanged(repository, source.fingerprint);
  const desktop = bound.readBoundFile(path.join(app, 'Contents/MacOS/datasecure-standalone'),
    { minimum: 1024, maximum: 64 * 1024 * 1024, checkCtime: true });
  assertStandaloneBuildFingerprint(desktop, source.fingerprint);
  assertMacCoreBundle(app, build);
  assertStandaloneRuntimeSource(server, source);
  bound.assertDirectory(appBinding);
}
assertPackageSource();
const parent = fs.realpathSync.native(os.tmpdir());
const fixture = fs.mkdtempSync(path.join(parent, 'datasecure-macos-ownership-load-'));
const initial = fs.lstatSync(fixture, { bigint: true });
const home = path.join(fixture, 'home'), temp = path.join(fixture, 'temp'), diagnostics = path.join(fixture, 'diagnostics');
const environment = { HOME: home, TMPDIR: temp, TMP: temp, TEMP: temp, PATH: '', LANG: 'en_US.UTF-8',
  DATASECURE_PRODUCT_CHANNEL: 'standalone', DATASECURE_NATIVE_EXPORT_CHANNEL: '1',
  DATASECURE_BUNDLED_RUNTIME_REQUIRED: '1',
  DATASECURE_MACOS_STATIC_CORE_SHA256: build.artifact.core.sha256,
  DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256: build.artifactSha256,
  DATASECURE_DOCUMENT_CONTROL_OWNER_PID: String(process.pid), DATASECURE_DOCUMENT_CONTROL_GENERATION: '8'.repeat(32),
  DATASECURE_STANDALONE_DIAGNOSTIC_DIR: diagnostics,
  DATASECURE_STANDALONE_DOCUMENTS_DIR: path.join(home, 'Documents') };
let child, ended = false;
try {
  for (const dir of [home, temp, diagnostics]) fs.mkdirSync(dir, { mode: 0o700 });
  child = spawn(path.join(app, 'Contents/MacOS/datasecure-core'), ['--require=../network-deny.cjs', 'desktop-sidecar.js'],
    { cwd: path.join(server, 'standalone'), env: environment, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  const result = await probeOwnershipLoad(child, { encodeFrame, safeCodes });
  ended = result.closed;
  if (!result.ok) {
    console.error(JSON.stringify({ schema: 'datasecure-macos-ownership-load/1', ready: result.ready, shutdown: result.shutdown,
      error_code: result.ready_error_code || result.error_code, exit_code: result.exit_code, signal: result.signal,
      deadline_exceeded: result.deadline_exceeded, timer_failed: result.timer_failed, kill_status: result.kill_status,
      process_end: result.closed ? 'confirmed' : 'unconfirmed', fixture_preserved: !result.fixture_cleanup_allowed }));
    throw Error(result.closed ? 'MACOS_OWNERSHIP_HARDENED_LOAD_FAILED' : 'MACOS_OWNERSHIP_PROCESS_NOT_REAPED');
  }
  const diagnosticFiles = fs.readdirSync(diagnostics).filter(name => /^sidecar-interactions(?:\.[a-z0-9.]+)?\.jsonl$/u.test(name));
  assert.ok(diagnosticFiles.length > 0 && diagnosticFiles.length <= 24);
  const records = diagnosticFiles.flatMap(name => bound.readBoundFile(path.join(diagnostics, name), { maximum: 256 * 1024 })
    .toString('utf8').trim().split('\n').map(line => JSON.parse(line)));
  assert.ok(records.some(record => record.event === 'ownership_control_check_finished' && record.outcome === 'ready'));
  assertPackageSource();
  console.log(JSON.stringify({ schema: 'datasecure-macos-ownership-load/1', ready: true, shutdown: true,
    core_sha256: build.artifact.core.sha256, artifact_sha256: build.artifactSha256, source_fingerprint: source.fingerprint, gui: 'NOT_RUN', m2: 'NOT_RUN',
    fresh_profile_without_result_directory: true }));
} finally {
  // Preserve the owned fixture if process termination is uncertain. Never
  // change Gatekeeper, entitlements, ACLs or an installed application here.
  if (child && !ended) throw Error('MACOS_OWNERSHIP_PROCESS_NOT_REAPED');
  const now = fs.lstatSync(fixture, { bigint: true });
  assert.ok(now.isDirectory() && !now.isSymbolicLink() && now.dev === initial.dev && now.ino === initial.ino);
  assert.equal(path.dirname(fixture), parent); assert.match(path.basename(fixture), /^datasecure-macos-ownership-load-/u);
  let count = 0;
  const inspect = name => {
    assert.ok(++count < 1000);
    const entry = fs.lstatSync(name); assert.ok(!entry.isSymbolicLink() && (entry.isFile() || entry.isDirectory()));
    if (entry.isDirectory()) for (const childName of fs.readdirSync(name)) inspect(path.join(name, childName));
  };
  inspect(fixture); fs.rmSync(fixture, { recursive: true });
}
