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
import { standaloneProjectionContract } from '../scripts/lib/standalone-runtime-projection.mjs';
import { sha256 } from '../scripts/lib/bundled-runtime.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = fs.realpathSync.native(os.tmpdir());
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
const marker = fingerprint => Buffer.from(`${SOURCE_MARKER_PREFIX}${fingerprint}${SOURCE_MARKER_SUFFIX}`);

function builderFixture() {
  const scope = fixture();
  for (const relative of [
    'scripts/build-standalone-package.mjs', 'scripts/build-standalone-macos-package.mjs',
    'scripts/lib/standalone-build-fingerprint.mjs', 'scripts/lib/standalone-runtime-projection.mjs',
    'scripts/lib/standalone-conversion-runtime.mjs', 'scripts/lib/bundled-runtime.mjs',
    'scripts/lib/zip.mjs', 'scripts/lib/cargo-license-inventory.mjs', 'scripts/lib/standalone-font-license.mjs',
    'plugins/data-secure/server/core/bound-file-io.js', 'plugins/data-secure/server/zip-reader.js',
    'native/runtime/runtime-contract.json', 'apps/datasecure-standalone/desktop-targets.json',
    'apps/datasecure-standalone/frontend/fonts/InterVariable.woff2',
    'apps/datasecure-standalone/frontend/fonts/LICENSE-Inter.txt'
  ]) write(scope, relative, fs.readFileSync(path.join(repository, ...relative.split('/'))));
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
    fs.writeFileSync(source, `#[path = ${JSON.stringify(nativeSource)}]\nmod source_fingerprint;\nfn main() { source_fingerprint::retain(); }\n`);
    const candidates = ['rustc', path.join(os.homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'rustc.exe' : 'rustc')];
    const compiler = candidates.find(candidate => spawnSync(candidate, ['--version'], { windowsHide: true, encoding: 'utf8' }).status === 0);
    assert.ok(compiler, 'this native build contract requires the Rust compiler');
    const result = spawnSync(compiler, ['--edition=2021', '-D', 'warnings', '-C', 'opt-level=s', '-C', 'lto', '-C', 'strip=symbols', '-o', binary, source],
      { env: { ...process.env, DATASECURE_SOURCE_FINGERPRINT: fingerprint }, encoding: 'utf8', windowsHide: true, timeout: 60000 });
    assert.equal(result.status, 0, `${result.error || ''}\n${result.stderr}`);
    assertStandaloneBuildFingerprint(fs.readFileSync(binary), fingerprint);
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
      env: { ...process.env, CARGO_MANIFEST_DIR: path.join(repository, 'apps/datasecure-standalone/tauri-contract') } });
    assert.equal(observed.status, 0, `${observed.error || ''}\n${observed.stderr}`);
    assert.ok(observed.stdout.includes(cargoFingerprintDirectives(repository)));
  } finally { cleanup(scope); }
});
