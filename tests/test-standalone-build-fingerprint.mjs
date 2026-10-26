import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  SOURCE_INPUT_FILES, SOURCE_INPUT_TREES, SOURCE_MARKER_PREFIX, SOURCE_MARKER_SUFFIX,
  standaloneBuildFingerprint, assertStandaloneBuildFingerprint, assertStandaloneSourceUnchanged, cargoFingerprintDirectives,
  assertStandaloneRuntimeSource
} from '../scripts/lib/standalone-build-fingerprint.mjs';
import { collectStandaloneRuntime, standaloneProjectionContract } from '../scripts/lib/standalone-runtime-projection.mjs';
import { sha256 } from '../scripts/lib/bundled-runtime.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = fs.realpathSync.native(os.tmpdir());
test('Standalone source projection excludes Cowork-only runtime modules independent of native assets', () => {
  for (const target of [null, 'windows-x64']) {
    const files = new Set(collectStandaloneRuntime(path.join(repository, 'plugins/data-secure/server'), target)
      .map(file => file.relative));
    assert.ok(files.has('standalone/desktop-sidecar.js'));
    assert.ok(files.has('gateway/review-worker.js'));
    assert.ok(files.has('standalone-core-policy-fingerprint.json'));
    assert.ok([...files].every(relative => !relative.startsWith('companion/')),
      `${target || 'common'}: no Cowork companion module may enter the Standalone archive`);
    assert.ok(files.has('local-ui/file-picker.js'));
    assert.ok(files.has('core/local-review-model.js'));
    assert.ok(files.has('gateway/package-files.js'));
    assert.ok(files.has('gateway/review-meta-io.js'));
    for (const relative of ['companion/stdio-server.js', 'companion/ipc-session.js',
      'companion/processor.js', 'companion/job-store.js', 'companion/batch-start-confirmation.js',
      'companion/retention.js', 'companion/completion-summary.js', 'companion/local-confirmation.js',
      'companion/release-verifier.js', 'companion/text-review.js', 'gateway/worker-terminal-presentation.js',
      'gateway/package-store.js', 'gateway/review.js']) {
      assert.equal(files.has(relative), false, `${target}: ${relative} is Cowork-only runtime code`);
    }
  }
});
test('Standalone review adapter accepts only an explicit app reviewer and never loads Cowork code', () => {
  const adapter = path.join(repository, 'plugins/data-secure/server/gateway/local-review-adapter.js');
  const source = `
    const assert = require('node:assert/strict');
    const adapter = require(process.argv[1]);
    const text = 'Microsoft Zertifikat';
    const document = { original_text: text, anonymized_text: text, profile: 'personnel_profile',
      ambiguities: [{ ambiguity_id: 'credential:v2:000001', type: 'credential_issuer_ambiguous',
        original_start: 0, original_end: 9, anonymized_start: 0, anonymized_end: 9 }] };
    (async () => {
      const result = await adapter.reviewBatchTextLocally([document], {
        reviewTextLocally: () => ({ action: 'cancelled' })
      });
      assert.deepEqual(result, { action: 'cancelled', documents: [] });
      await assert.rejects(adapter.reviewBatchTextLocally([document]),
        /COWORK_REVIEW_UNAVAILABLE_IN_STANDALONE/);
      assert.throws(() => adapter.reviewTextLocally(), /COWORK_REVIEW_UNAVAILABLE_IN_STANDALONE/);
      assert.equal(Object.keys(require.cache).some(name => /[\\/]companion[\\/]/u.test(name)), false);
    })().catch(error => { process.stderr.write(String(error.stack || error)); process.exitCode = 1; });`;
  const result = spawnSync(process.execPath, ['-e', source, adapter], {
    cwd: repository, encoding: 'utf8', windowsHide: true, timeout: 10000,
    env: { ...process.env, DATASECURE_PRODUCT_CHANNEL: 'standalone', NODE_OPTIONS: '' }
  });
  assert.equal(result.status, 0, result.stderr);
});
function write(scope, relative, bytes) {
  const target = path.join(scope, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
}
function git(scope, args) {
  return execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false',
    '-c', `core.hooksPath=${path.join(scope, '.git', 'disabled-hooks')}`,
    '-c', 'user.name=Standalone Fingerprint Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
  { cwd: scope, encoding: 'utf8', windowsHide: true, stdio: 'pipe' });
}
function fixture() {
  const scope = fs.mkdtempSync(path.join(temporaryRoot, 'datasecure-build-fingerprint-'));
  for (const relative of SOURCE_INPUT_FILES) write(scope, relative, `fixture: ${relative}\n`);
  write(scope, '.gitattributes', '* text=auto eol=lf\n');
  write(scope, '.gitignore', '**/target/\n**/node_modules/\n**/generated-runtime/\n**/gen/\n');
  for (const relative of SOURCE_INPUT_TREES) write(scope, `${relative}/fixture.txt`, 'shared input\n');
  for (const relative of standaloneProjectionContract.entrypoints)
    write(scope, `plugins/data-secure/server/${relative}`, "'use strict';\nmodule.exports = {};\n");
  write(scope, 'plugins/data-secure/server/standalone/desktop-sidecar.js', "require('../core/fixture');\n");
  write(scope, 'plugins/data-secure/server/core/fixture.js', 'module.exports = 1;\n');
  git(scope, ['init', '--quiet']);
  git(scope, ['add', '.']);
  git(scope, ['commit', '--quiet', '--no-verify', '-m', 'source fixture']);
  return scope;
}
function cleanup(scope) {
  assert.equal(path.dirname(scope), temporaryRoot);
  assert.match(path.basename(scope), /^datasecure-build-fingerprint-/u);
  assert.equal(fs.realpathSync.native(scope), scope);
  const entries = [];
  function inspect(target) {
    const stat = fs.lstatSync(target);
    assert.ok(!stat.isSymbolicLink() && (stat.isDirectory() || stat.isFile()));
    entries.push({ target, stat });
    if (stat.isDirectory()) for (const name of fs.readdirSync(target)) inspect(path.join(target, name));
  }
  inspect(scope);
  for (const { target, stat } of entries.reverse()) {
    const current = fs.lstatSync(target);
    assert.ok(!current.isSymbolicLink());
    assert.equal(current.dev, stat.dev); assert.equal(current.ino, stat.ino);
    if (stat.isDirectory()) fs.rmdirSync(target); else fs.unlinkSync(target);
  }
}
test('packaged Standalone policy identity loads without Cowork sources and refuses neutral-byte drift', () => {
  const scope = fs.mkdtempSync(path.join(temporaryRoot, 'datasecure-build-fingerprint-'));
  try {
    const projected = collectStandaloneRuntime(path.join(repository, 'plugins/data-secure/server'), null);
    for (const file of projected) write(scope, `server/${file.relative}`, file.bytes);
    assert.equal(fs.existsSync(path.join(scope, 'server', 'companion')), false);
    const policy = path.join(scope, 'server', 'core-policy-fingerprint.js');
    const command = 'process.stdout.write(require(process.argv[1]).STANDALONE_POLICY_FINGERPRINT)';
    const options = { cwd: scope, encoding: 'utf8', windowsHide: true, timeout: 10000,
      env: { ...process.env, DATASECURE_PRODUCT_CHANNEL: 'standalone', NODE_OPTIONS: '' } };
    const pristine = spawnSync(process.execPath, ['-e', command, policy], options);
    assert.equal(pristine.status, 0, pristine.stderr);
    assert.match(pristine.stdout, /^[a-f0-9]{64}$/u);
    const member = path.join(scope, 'server', 'privacy', 'policy.js');
    fs.appendFileSync(member, '\n ');
    const changed = spawnSync(process.execPath, ['-e', command, policy], options);
    assert.notEqual(changed.status, 0);
    assert.match(changed.stderr, /STANDALONE_POLICY_RECEIPT_INVALID/u);
  } finally { cleanup(scope); }
});
const marker = fingerprint => Buffer.from(`${SOURCE_MARKER_PREFIX}${fingerprint}${SOURCE_MARKER_SUFFIX}`);

function builderFixture() {
  const scope = fixture();
  for (const relative of [
    'scripts/build-standalone-package.mjs', 'scripts/build-standalone-macos-package.mjs',
    'scripts/lib/standalone-build-fingerprint.mjs', 'scripts/lib/standalone-runtime-projection.mjs',
    'scripts/lib/standalone-conversion-runtime.mjs', 'scripts/lib/pdfjs-text-paint-hook.mjs', 'scripts/lib/bundled-runtime.mjs',
    'scripts/lib/standalone-windows-layout.mjs',
    'scripts/lib/windows-native-contract.mjs', 'native/runtime/standalone-windows-runtime.json',
    'plugins/data-secure/server/standalone/macos-bundle-layout.js',
    'plugins/data-secure/server/standalone/tiff-scan-codecs.js',
    'plugins/data-secure/server/standalone/ccitt-fax-decoder.js',
    'scripts/lib/zip.mjs', 'scripts/lib/cargo-license-inventory.mjs', 'scripts/lib/standalone-font-license.mjs',
    'plugins/data-secure/server/core/bound-file-io.js', 'plugins/data-secure/server/zip-reader.js',
    'native/runtime/runtime-contract.json', 'apps/datasecure-standalone/desktop-targets.json',
    'apps/datasecure-standalone/frontend/fonts/InterVariable.woff2',
    'apps/datasecure-standalone/frontend/fonts/LICENSE-Inter.txt'
  ]) write(scope, relative, fs.readFileSync(path.join(repository, ...relative.split('/'))));
  // This fixture isolates the common-source marker refusal, not target-native
  // addon verification (covered by the separate ownership artifact gate).
  write(scope, 'scripts/lib/ownership-guard-artifact.mjs',
    "export const loadOwnershipGuardBuild=()=>({artifact:{sha256:'a'.repeat(64)}});\n" +
    "export const assertOwnershipGuardMarker=()=>{}; export const writeOwnershipGuardRuntime=()=>{};\n");
  // The Mac builder now checks its independently approved Core and native seal
  // before copying. This fixture isolates the COMMON source-marker refusal;
  // no synthetic native artefact is approved and no native Mac seal is run.
  // If the real marker refusal is lost, the later boundary must fail distinctly.
  write(scope, 'scripts/lib/macos-core-artifact.mjs',
    "export const loadMacStaticCore=()=>({});\n" +
    "export const assertMacCoreBundle=()=>{}; export const verifyMacBundleSeal=()=>{}; export const assertMacCoreMarkers=()=>{};\n" +
    "export const macRuntimeEvidence=()=>{throw Error('UNEXPECTED_COMMON_MARKER_BYPASS')};\n" +
    "export const canonicalBytes=()=>{throw Error('UNEXPECTED_COMMON_MARKER_BYPASS')};\n" +
    "export const verifyMacCorePackage=()=>{throw Error('UNEXPECTED_COMMON_MARKER_BYPASS')};\n");
  write(scope, 'package.json', '{"version":"0.0.0-fixture","private":true}\n');
  const contract = JSON.parse(fs.readFileSync(path.join(scope, 'native/runtime/runtime-contract.json')));
  const target = contract.targets.find(target => target.id === 'windows-x64');
  const runtime = Buffer.alloc(2048); runtime.write('MZ'); runtime.writeUInt32LE(64, 0x3c);
  runtime.write('PE\0\0', 64); runtime.writeUInt16LE(0x8664, 68);
  const license = Buffer.from('fixture node license\n');
  write(scope, 'dist/windows-x64/datasecure-node.exe', runtime);
  write(scope, 'dist/windows-x64/LICENSE.node.txt', license);
  write(scope, 'dist/windows-x64/runtime-evidence.json', JSON.stringify({
    schema: 'datasecure-bundled-runtime-target/v1', target: target.id,
    node_version: contract.node_version, archive: target.archive, archive_sha256: target.archive_sha256,
    bytes: runtime.length, sha256: sha256(runtime), license_bytes: license.length, license_sha256: sha256(license),
    runtime_probe: { version: contract.node_version, platform: target.os, arch: target.arch }
  }));
  return scope;
}

test('actual Git source fixtures share an absolute-path-independent fingerprint and Cargo watches', () => {
  const first = fixture(), second = fixture();
  try {
    const identity = standaloneBuildFingerprint(first);
    assert.equal(git(first, ['status', '--porcelain']).trim(), '');
    assert.equal(standaloneBuildFingerprint(second).fingerprint, identity.fingerprint);
    assert.equal(standaloneBuildFingerprint(first).fingerprint, identity.fingerprint);
    const directives = cargoFingerprintDirectives(first, identity);
    assert.match(directives, /cargo:rerun-if-env-changed=DATASECURE_BUILD_ID/u);
    for (const file of identity.files)
      assert.ok(directives.includes(`cargo:rerun-if-changed=${path.join(first, ...file.path.split('/'))}\n`));
    assert.equal(execFileSync(process.execPath,
      [path.join(repository, 'scripts/lib/standalone-build-fingerprint.mjs'), '--cargo', first],
      { encoding: 'utf8', windowsHide: true }), directives);
    assert.ok(!identity.files.some(file => /(?:^|\/)(?:target|node_modules|generated-runtime|gen)(?:\/|$)/u.test(file.path)));
  } finally { cleanup(first); cleanup(second); }
});

test('changed productive bytes invalidate compiled identity even with an unchanged mtime and Git HEAD', () => {
  const scope = fixture();
  try {
    const head = git(scope, ['rev-parse', 'HEAD']).trim(), initial = standaloneBuildFingerprint(scope).fingerprint;
    const compiled = Buffer.concat([Buffer.from('native fixture\0'), marker(initial)]);
    for (const relative of [
      'apps/datasecure-standalone/frontend/fixture.txt',
      'apps/datasecure-standalone/START-WINDOWS.md', 'apps/datasecure-standalone/MACOS-START.md',
      'apps/datasecure-standalone/tauri-contract/src/fixture.txt',
      'apps/datasecure-standalone/tauri-contract/build.rs',
      'apps/datasecure-standalone/tauri-contract/tauri.macos.conf.json',
      'apps/datasecure-standalone/tauri-contract/Cargo.lock',
      'native/markdown/pilot/package-lock.json', 'native/ocr/pilot/models.lock.json',
      'native/runtime/runtime-contract.json', 'plugins/data-secure/server/core/fixture.js'
    ]) {
      const target = path.join(scope, ...relative.split('/')), before = fs.readFileSync(target), stat = fs.statSync(target);
      const changed = Buffer.from(before); changed[0] = changed[0] === 88 ? 89 : 88;
      fs.writeFileSync(target, changed); fs.utimesSync(target, stat.atime, stat.mtime);
      const next = standaloneBuildFingerprint(scope).fingerprint;
      assert.notEqual(next, initial, relative);
      assert.throws(() => assertStandaloneBuildFingerprint(compiled, next), /STANDALONE_DESKTOP_SOURCE_MISMATCH/u);
      assert.throws(() => assertStandaloneSourceUnchanged(scope, initial), /STANDALONE_SOURCE_CHANGED/u);
      fs.writeFileSync(target, before);
    }
    assert.equal(git(scope, ['rev-parse', 'HEAD']).trim(), head);
    assert.equal(standaloneBuildFingerprint(scope).fingerprint, initial);
    write(scope, 'apps/datasecure-standalone/frontend/new-view.html', '<p>new view</p>');
    assert.match(git(scope, ['status', '--porcelain']), /new-view\.html/u);
    assert.notEqual(standaloneBuildFingerprint(scope).fingerprint, initial, 'untracked productive source is also bound');
  } finally { cleanup(scope); }
});

test('target output, generated schemas, installed dependencies and platform payloads are excluded', () => {
  const scope = fixture();
  try {
    const initial = standaloneBuildFingerprint(scope).fingerprint;
    for (const relative of [
      'apps/datasecure-standalone/tauri-contract/target/release/desktop.exe',
      'apps/datasecure-standalone/tauri-contract/generated-runtime/server/runtime.js',
      'apps/datasecure-standalone/tauri-contract/gen/schemas/desktop-schema.json',
      'native/markdown/pilot/node_modules/parse5/index.js',
      'apps/datasecure-standalone/frontend/.DS_Store',
      'plugins/data-secure/server/native/macos-arm64/datasecure-sandbox',
      'plugins/data-secure/server/native/windows-x64/datasecure-sandbox.exe'
    ]) write(scope, relative, 'target-dependent bytes');
    assert.equal(standaloneBuildFingerprint(scope).fingerprint, initial);
    const required = path.join(scope, 'native/ocr/pilot/models.lock.json');
    fs.unlinkSync(required);
    assert.throws(() => standaloneBuildFingerprint(scope), /ENOENT/u, 'missing input cannot receive a fingerprint');
  } finally { cleanup(scope); }
});

test('missing, malformed, foreign and stale binary markers fail; surrounding signature bytes do not change identity', () => {
  const expected = 'a'.repeat(64), foreign = 'b'.repeat(64);
  assertStandaloneBuildFingerprint(Buffer.concat([Buffer.from('MZ\0'), marker(expected), Buffer.from('signature bytes')]), expected);
  assertStandaloneBuildFingerprint(Buffer.concat([marker(expected), marker(expected)]), expected);
  assert.throws(() => assertStandaloneBuildFingerprint(Buffer.from('old native binary'), expected), /SOURCE_MARKER_MISSING/u);
  assert.throws(() => assertStandaloneBuildFingerprint(marker(foreign), expected), /SOURCE_MISMATCH/u);
  assert.throws(() => assertStandaloneBuildFingerprint(Buffer.concat([marker(expected), marker(foreign)]), expected), /SOURCE_MISMATCH/u);
  assert.throws(() => assertStandaloneBuildFingerprint(Buffer.from(`${SOURCE_MARKER_PREFIX}${expected}:wrong`), expected), /SOURCE_MARKER_INVALID/u);
  const nonAscii = marker(expected); nonAscii[SOURCE_MARKER_PREFIX.length] |= 0x80;
  assert.throws(() => assertStandaloneBuildFingerprint(nonAscii, expected), /SOURCE_MARKER_INVALID/u);
});

test('a current native marker cannot certify missing or stale common runtime resources', () => {
  const scope = fixture();
  try {
    const identity = standaloneBuildFingerprint(scope), prefix = 'plugins/data-secure/server/';
    const runtime = path.join(scope, 'packaged-server');
    for (const file of identity.files.filter(file => file.path.startsWith(prefix)))
      write(scope, `packaged-server/${file.path.slice(prefix.length)}`, fs.readFileSync(path.join(scope, ...file.path.split('/'))));
    assertStandaloneBuildFingerprint(marker(identity.fingerprint), identity.fingerprint);
    assertStandaloneRuntimeSource(runtime, identity);
    const target = path.join(runtime, 'core/fixture.js'), before = fs.readFileSync(target);
    fs.writeFileSync(target, 'old projected module');
    assert.throws(() => assertStandaloneRuntimeSource(runtime, identity), /RUNTIME_SOURCE_MISMATCH/u);
    fs.writeFileSync(target, before);
    fs.unlinkSync(target);
    assert.throws(() => assertStandaloneRuntimeSource(runtime, identity), /RUNTIME_SOURCE_MISMATCH/u);
  } finally { cleanup(scope); }
});

test('both actual package builders reject old or foreign native bytes in real source fixtures', () => {
  const scope = builderFixture();
  try {
    const compiledFingerprint = standaloneBuildFingerprint(scope).fingerprint;
    write(scope, 'apps/datasecure-standalone/frontend/fixture.txt', 'changed after native compilation\n');
    const cases = [
      ['missing', Buffer.alloc(2048), 'STANDALONE_DESKTOP_SOURCE_MARKER_MISSING'],
      ['foreign', Buffer.concat([Buffer.alloc(2048), marker('f'.repeat(64))]), 'STANDALONE_DESKTOP_SOURCE_MISMATCH'],
      ['stale', Buffer.concat([Buffer.alloc(2048), marker(compiledFingerprint)]), 'STANDALONE_DESKTOP_SOURCE_MISMATCH']
    ];
    for (const [label, binary, code] of cases) {
      write(scope, 'apps/datasecure-standalone/tauri-contract/target/release/datasecure-standalone.exe', binary);
      const windows = spawnSync(process.execPath,
        [path.join(scope, 'scripts/build-standalone-package.mjs'), '--engineering-directory', `engineering-fingerprint-${label}`],
        { cwd: scope, encoding: 'utf8', windowsHide: true, timeout: 15000 });
      assert.notEqual(windows.status, 0);
      assert.ok(windows.stderr.includes(code), `${label}: ${windows.error || ''}\n${windows.stderr}`);
      write(scope, 'DataSecure Standalone.app/Contents/MacOS/datasecure-standalone', binary);
      const macos = spawnSync(process.execPath,
        [path.join(scope, 'scripts/build-standalone-macos-package.mjs'), '--target', 'macos-arm64', '--app', 'DataSecure Standalone.app'],
        { cwd: scope, encoding: 'utf8', windowsHide: true, timeout: 15000 });
      assert.notEqual(macos.status, 0);
      assert.ok(macos.stderr.includes(code), `${label}: ${macos.error || ''}\n${macos.stderr}`);
      assert.ok(!fs.readdirSync(path.join(scope, 'dist')).some(name => name.endsWith('.zip')));
    }
  } finally { cleanup(scope); }
});

test('the actual Rust build script hashes current inputs and its marker survives optimized LTO and stripping', () => {
  const scope = fixture();
  try {
    const fingerprint = standaloneBuildFingerprint(scope).fingerprint;
    const nativeSource = path.join(repository, 'apps/datasecure-standalone/tauri-contract/src/source_fingerprint.rs').split(path.sep).join('/');
    const source = path.join(scope, 'marker-main.rs'), binary = path.join(scope, process.platform === 'win32' ? 'marker-main.exe' : 'marker-main');
    fs.writeFileSync(source, `#[path = ${JSON.stringify(nativeSource)}]\nmod source_fingerprint;\nfn main() { source_fingerprint::retain();\n#[cfg(not(target_os="macos"))] assert_eq!(source_fingerprint::ownership_guard_sha256().len(),64);\n#[cfg(target_os="macos")] { assert_eq!(source_fingerprint::macos_static_core_sha256().len(),64); assert_eq!(source_fingerprint::macos_static_core_artifact_sha256().len(),64); }\nassert_eq!(source_fingerprint::diagnostic_build_id(None), &env!("DATASECURE_SOURCE_FINGERPRINT")[..40]); }\n`);
    const candidates = ['rustc', path.join(os.homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'rustc.exe' : 'rustc')];
    const compiler = candidates.find(candidate => spawnSync(candidate, ['--version'], { windowsHide: true, encoding: 'utf8' }).status === 0);
    assert.ok(compiler, 'this native build contract requires the Rust compiler');
    const result = spawnSync(compiler, ['--edition=2021', '-D', 'warnings', '-C', 'opt-level=s', '-C', 'lto', '-C', 'strip=symbols', '-o', binary, source],
      { env: { ...process.env, DATASECURE_SOURCE_FINGERPRINT: fingerprint,
        DATASECURE_OWNERSHIP_GUARD_SHA256: 'a'.repeat(64),
        DATASECURE_MACOS_STATIC_CORE_SHA256: 'b'.repeat(64),
        DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256: 'c'.repeat(64) }, encoding: 'utf8', windowsHide: true, timeout: 60000 });
    assert.equal(result.status, 0, `${result.error || ''}\n${result.stderr}`);
    assertStandaloneBuildFingerprint(fs.readFileSync(binary), fingerprint);
    const markerRun = spawnSync(binary, [], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    assert.equal(markerRun.status, 0, `${markerRun.error || ''}\n${markerRun.stderr}`);
    // Compile the real build script with only Tauri's downstream copy step
    // stubbed. Its Node invocation, root resolution and Cargo directives run.
    const stub = path.join(scope, 'tauri-build-stub.rs'), library = path.join(scope, 'libtauri_build.rlib');
    fs.writeFileSync(stub, 'pub fn build() {}\n');
    const libraryResult = spawnSync(compiler, ['--crate-name', 'tauri_build', '--crate-type', 'rlib', '-o', library, stub],
      { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    assert.equal(libraryResult.status, 0, libraryResult.stderr);
    const buildScript = path.join(scope, process.platform === 'win32' ? 'build-script.exe' : 'build-script');
    const buildResult = spawnSync(compiler, ['--edition=2021', '-D', 'warnings', '--extern', `tauri_build=${library}`,
      '-o', buildScript, path.join(repository, 'apps/datasecure-standalone/tauri-contract/build.rs')],
    { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    assert.equal(buildResult.status, 0, buildResult.stderr);
    const observed = spawnSync(buildScript, [], { encoding: 'utf8', windowsHide: true, timeout: 60000,
      env: { ...process.env, CARGO_MANIFEST_DIR: path.join(repository, 'apps/datasecure-standalone/tauri-contract'),
        TARGET: 'x86_64-unknown-linux-gnu' } });
    assert.equal(observed.status, 0, `${observed.error || ''}\n${observed.stderr}`);
    assert.ok(observed.stdout.includes(cargoFingerprintDirectives(repository)));
    const manifestDirectory = path.join(repository, 'apps/datasecure-standalone/tauri-contract');
    const missingStaticCrt = spawnSync(buildScript, [], { encoding: 'utf8', windowsHide: true, timeout: 60000,
      env: { ...process.env, CARGO_MANIFEST_DIR: manifestDirectory,
        TARGET: 'x86_64-unknown-linux-gnu', CARGO_CFG_TARGET_OS: 'windows', CARGO_CFG_TARGET_FEATURE: 'sse,sse2' } });
    assert.notEqual(missingStaticCrt.status, 0);
    assert.match(missingStaticCrt.stderr, /WINDOWS_NATIVE_STATIC_CRT_REQUIRED/u);
    for (const [target, features] of [['windows', 'crt-static,sse,sse2']]) {
      const accepted = spawnSync(buildScript, [], { encoding: 'utf8', windowsHide: true, timeout: 60000,
        env: { ...process.env, CARGO_MANIFEST_DIR: manifestDirectory,
          // Isolate the OS-specific static-CRT condition from availability of
          // target-native modules; actual native Cargo builds test those pins.
          TARGET: 'x86_64-unknown-linux-gnu', CARGO_CFG_TARGET_OS: target, CARGO_CFG_TARGET_FEATURE: features } });
      assert.equal(accepted.status, 0, `${target}: ${accepted.stderr}`);
    }
    // An artificial macOS target-OS flag with a Linux TARGET must no longer
    // bypass the separate Mac static-Core verifier as the old addon gate did.
    // Actual accepted Mac pins require the separate native target build.
    const mismatchedMacTarget = spawnSync(buildScript, [], { encoding: 'utf8', windowsHide: true, timeout: 60000,
      env: { ...process.env, CARGO_MANIFEST_DIR: manifestDirectory,
        TARGET: 'x86_64-unknown-linux-gnu', CARGO_CFG_TARGET_OS: 'macos', CARGO_CFG_TARGET_FEATURE: 'neon' } });
    assert.notEqual(mismatchedMacTarget.status, 0);
    assert.match(mismatchedMacTarget.stderr, /STANDALONE_MACOS_STATIC_CORE_INVALID/u);
  } finally { cleanup(scope); }
});
