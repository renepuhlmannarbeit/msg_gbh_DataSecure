// Headless, package-bound native loader probe. No Tauri/WebView/desktop input.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { loadOwnershipGuardBuild, assertOwnershipGuardMarker } from '../../scripts/lib/ownership-guard-artifact.mjs';
import { standaloneBuildFingerprint, assertStandaloneBuildFingerprint, assertStandaloneSourceUnchanged,
  assertStandaloneRuntimeSource } from '../../scripts/lib/standalone-build-fingerprint.mjs';
import { probeOwnershipLoad, runOwnershipLoadCommand } from '../helpers/ownership-load-lifecycle.mjs';
import { windowsPackageRoots } from '../../scripts/lib/standalone-windows-layout.mjs';
import bound from '../../plugins/data-secure/server/core/bound-file-io.js';
const require = createRequire(import.meta.url);
const { encodeFrame } = require('../../plugins/data-secure/server/standalone/desktop-ipc.js');
const { DESKTOP_ERROR_CODES } = require('../../plugins/data-secure/server/core/desktop-error-contract.js');
const safeCodes = new Set(DESKTOP_ERROR_CODES), args = process.argv.slice(2);
assert.equal(process.platform, 'win32'); assert.equal(process.arch, 'x64');
assert.deepEqual([args[0], args.length], ['--package', 2]);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const installation = path.resolve(args[1]), installationBinding = bound.bindDirectory(installation);
const manifest = JSON.parse(bound.readBoundFile(path.join(installation, 'STANDALONE-MANIFEST.json'), { maximum: 2 * 1024 * 1024 }));
assert.equal(manifest.target, 'windows-x64');
assert.ok(windowsPackageRoots(manifest.version).includes(path.basename(installation)), 'STANDALONE_PACKAGE_ROOT_INVALID');
const source = standaloneBuildFingerprint(repository), build = loadOwnershipGuardBuild(repository, 'windows-x64');
const server = path.join(installation, 'server');
function assertPackageSource() {
  bound.assertDirectory(installationBinding);
  assertStandaloneSourceUnchanged(repository, source.fingerprint);
  const current = JSON.parse(bound.readBoundFile(path.join(installation, 'STANDALONE-MANIFEST.json'),
    { maximum: 2 * 1024 * 1024, checkCtime: true }));
  assert.equal(current.target, 'windows-x64'); assert.equal(current.version, manifest.version);
  assert.equal(current.source_fingerprint, source.fingerprint);
  const desktop = bound.readBoundFile(path.join(installation, 'DataSecure Standalone.exe'),
    { minimum: 1024, maximum: 64 * 1024 * 1024, checkCtime: true });
  assertStandaloneBuildFingerprint(desktop, source.fingerprint); assertOwnershipGuardMarker(desktop, build.artifact.sha256);
  assert.ok(bound.readBoundFile(path.join(server, 'native/windows-x64/ownership-guard.node'),
    { minimum: 64, maximum: 4 * 1024 * 1024, checkCtime: true }).equals(build.bytes));
  assertStandaloneRuntimeSource(server, source);
  bound.assertDirectory(installationBinding);
}
assertPackageSource();
const parent = fs.realpathSync.native(os.tmpdir()), fixture = fs.mkdtempSync(path.join(parent, 'datasecure-windows-ownership-load-'));
const initial = fs.lstatSync(fixture, { bigint: true });
const system = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
let child, ended = false, complete = false;
function assertProcessResult(result) {
  ended = result.closed;
  if (!result.ok) {
    console.error(JSON.stringify({ schema: 'datasecure-windows-ownership-load/1', ready: result.ready, shutdown: result.shutdown,
      error_code: result.ready_error_code || result.error_code, exit_code: result.exit_code, signal: result.signal,
      deadline_exceeded: result.deadline_exceeded, timer_failed: result.timer_failed, kill_status: result.kill_status,
      process_end: result.closed ? 'confirmed' : 'unconfirmed', fixture_preserved: !result.fixture_cleanup_allowed }));
    throw Error(result.closed ? 'WINDOWS_OWNERSHIP_CORE_LOAD_FAILED' : 'WINDOWS_OWNERSHIP_PROCESS_NOT_REAPED');
  }
}
async function setupCommand(file, parameters) {
  child = spawn(path.join(system, file), parameters, { windowsHide: true, shell: false,
    env: { SystemRoot: path.dirname(system), WINDIR: path.dirname(system), PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  ended = false;
  const result = await runOwnershipLoadCommand(child); assertProcessResult(result);
  return result.stdout.toString('utf8');
}
try {
  // Restrict only this new empty synthetic fixture, never an installed profile.
  const account = await setupCommand('whoami.exe', ['/user', '/fo', 'csv', '/nh']);
  const sid = account.match(/"(S-1-[0-9-]+)"/u)?.[1]; assert.ok(sid);
  await setupCommand('icacls.exe', [fixture, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`]);
  const profile = path.join(fixture, 'profile'), temporary = path.join(fixture, 'temp'), diagnostics = path.join(fixture, 'diagnostics');
  for (const directory of [profile, temporary, diagnostics]) fs.mkdirSync(directory);
  const environment = { SystemRoot: path.dirname(system), WINDIR: path.dirname(system), PATH: '',
    HOME: profile, USERPROFILE: profile, LOCALAPPDATA: path.join(profile, 'AppData/Local'),
    APPDATA: path.join(profile, 'AppData/Roaming'), TMP: temporary, TEMP: temporary,
    DATASECURE_PRODUCT_CHANNEL: 'standalone', DATASECURE_NATIVE_EXPORT_CHANNEL: '1', DATASECURE_BUNDLED_RUNTIME_REQUIRED: '1',
    DATASECURE_OWNERSHIP_GUARD_SHA256: build.artifact.sha256, DATASECURE_DOCUMENT_CONTROL_OWNER_PID: String(process.pid),
    DATASECURE_DOCUMENT_CONTROL_GENERATION: '8'.repeat(32), DATASECURE_STANDALONE_DIAGNOSTIC_DIR: diagnostics,
    DATASECURE_STANDALONE_DOCUMENTS_DIR: path.join(profile, 'Documents') };
  // This loader probe bypasses Tauri deliberately. Its hardened synthetic
  // parent/leaf is not evidence of the native first-provisioning implementation.
  environment.DATASECURE_STANDALONE_NAMESPACE_ROOT = path.join(environment.LOCALAPPDATA, 'SecureDataMsg-Standalone');
  fs.mkdirSync(environment.DATASECURE_STANDALONE_NAMESPACE_ROOT, { recursive: true });
  child = spawn(path.join(installation, 'datasecure-core-x86_64-pc-windows-msvc.exe'),
    ['--require=../network-deny.cjs', 'desktop-sidecar.js'], { cwd: path.join(server, 'standalone'),
      env: environment, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  ended = false;
  assertProcessResult(await probeOwnershipLoad(child, { encodeFrame, safeCodes }));
  const files = fs.readdirSync(diagnostics).filter(name => /^sidecar-interactions(?:\.[a-z0-9.]+)?\.jsonl$/u.test(name));
  assert.ok(files.length > 0 && files.length <= 24);
  const records = files.flatMap(name => bound.readBoundFile(path.join(diagnostics, name), { maximum: 256 * 1024 })
    .toString('utf8').trim().split('\n').map(line => JSON.parse(line)));
  assert.ok(records.some(record => record.event === 'ownership_control_check_finished' && record.outcome === 'ready'));
  assertPackageSource();
  const helper = path.join(repository, 'tests/helpers/native-initial-results-fixture.cjs');
  const helperDigest = () => crypto.createHash('sha256').update(bound.readBoundFile(helper,
    { minimum: 1, maximum: 128 * 1024, checkCtime: true })).digest('hex');
  const helperPin = helperDigest();
  child = spawn(path.join(installation, 'datasecure-core-x86_64-pc-windows-msvc.exe'),
    ['--require', path.join(server, 'network-deny.cjs'), helper, '--server', server, '--scope', fixture],
    { cwd: fixture, env: environment, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  ended = false;
  const initialResult = await runOwnershipLoadCommand(child); assertProcessResult(initialResult);
  const initialProof = JSON.parse(initialResult.stdout.toString('utf8'));
  assert.deepEqual(initialProof, { schema: 'datasecure-native-initial-results/1', target: 'windows-x64', native_output_guard: true,
    refused_guard_mkdirs: 0, refused_guard_attempt_absent: true, created_directories: 2, written_documents: 2,
    read_only_reopen_under_output_lock: true, reopen_mkdirs: 0, exact_visible_markdown_inventory: true,
    lock_only_in_output_container: true, original_inputs_unchanged: true, fixture_cleanup_confirmed: true });
  assert.equal(helperDigest(), helperPin); assertPackageSource(); complete = true;
  console.log(JSON.stringify({ schema: 'datasecure-windows-ownership-load/1', ready: true, shutdown: true,
    guard_sha256: build.artifact.sha256, source_fingerprint: source.fingerprint, gui: 'NOT_RUN', fresh_profile_without_result_directory: true,
    initial_result_output_guard: initialProof, initial_results_helper_sha256: helperPin }));
} finally {
  // The helper has bounded its reap attempt and detached unresolved handles.
  // Never remove a fixture that may still be used by an unconfirmed process.
  if (child && !ended) throw Error('WINDOWS_OWNERSHIP_PROCESS_NOT_REAPED');
  if (complete) {
  const current = fs.lstatSync(fixture, { bigint: true });
  assert.ok(current.isDirectory() && !current.isSymbolicLink() && current.dev === initial.dev && current.ino === initial.ino);
  assert.equal(path.dirname(fixture), parent); assert.match(path.basename(fixture), /^datasecure-windows-ownership-load-/u);
  let count = 0;
  const inspect = name => {
    assert.ok(++count < 4096); const entry = fs.lstatSync(name);
    assert.ok(!entry.isSymbolicLink() && (entry.isFile() || entry.isDirectory()));
    if (entry.isDirectory()) for (const childName of fs.readdirSync(name)) inspect(path.join(name, childName));
  };
  inspect(fixture); fs.rmSync(fixture, { recursive: true });
  }
}
