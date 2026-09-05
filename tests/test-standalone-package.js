'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

test('standalone package build uses pinned runtime and a closed resource projection', () => {
  const prepare = fs.readFileSync(path.join(root, 'scripts', 'prepare-standalone-runtime.mjs'), 'utf8');
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-standalone-package.mjs'), 'utf8');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'apps', 'datasecure-standalone', 'tauri-contract', 'tauri.conf.json')));
  assert.doesNotMatch(prepare, /process\.execPath/u);
  assert.match(prepare, /verifyTargetEvidence/u);
  assert.equal(config.bundle.resources['generated-runtime/server'], 'server');
  assert.doesNotMatch(JSON.stringify(config.bundle.resources), /plugins\/data-secure\/server/u);
  assert.match(build, /engineering_pilot/u);
  assert.match(build, /requires_webview2: true/u);
  assert.match(build, /writeStandaloneRuntime/u);
  assert.match(build, /productTarget/u);
  assert.doesNotMatch(build, /copyTree\([^\n]*generated-runtime/u);
  const projection = fs.readFileSync(path.join(root, 'scripts', 'lib', 'standalone-runtime-projection.mjs'), 'utf8');
  assert.match(projection, /native\/windows-x64\/datasecure-sandbox\.exe/u);
  assert.match(projection, /native\/windows-x64\/datasecure-sandbox\.sha256/u);
  const toolchain = fs.readFileSync(path.join(root, 'apps', 'datasecure-standalone',
    'tauri-contract', 'rust-toolchain.toml'), 'utf8');
  assert.match(toolchain, /channel\s*=\s*"1\.98\.1"/u);
  assert.match(toolchain, /components\s*=\s*\["clippy", "rustfmt"\]/u);
  const cargoConfig = fs.readFileSync(path.join(root, 'apps', 'datasecure-standalone',
    'tauri-contract', '.cargo', 'config.toml'), 'utf8');
  assert.match(cargoConfig, /target\.x86_64-pc-windows-msvc/u);
  assert.match(cargoConfig, /link-arg=\/Brepro/u,
    'the Windows desktop linker must emit a reproducible PE image');
});

test('release runtime lookup cannot fall back to the developer checkout', () => {
  const source = fs.readFileSync(path.join(root, 'apps', 'datasecure-standalone', 'tauri-contract', 'src', 'main.rs'), 'utf8');
  assert.match(source, /if cfg!\(debug_assertions\)/u);
  const releaseCandidates = source.slice(source.indexOf('fn runtime_paths'), source.indexOf('fn spawn_sidecar'));
  assert.match(releaseCandidates, /resource\.join\(target\)/u);
  assert.match(source, /\.arg\("--require=\.\.\/network-deny\.cjs"\)/u);
  assert.match(source, /\.current_dir\(child_process_path\(script_directory\)\)/u);
});

test('PKG-04 evidence writer supports Windows PowerShell 5.1 without a BOM', () => {
  const releaseGate = fs.readFileSync(path.join(root, 'scripts', 'run-pkg-04.ps1'), 'utf8');
  assert.doesNotMatch(releaseGate, /Set-Content[^\r\n]*utf8NoBOM/u);
  assert.match(releaseGate, /System\.Text\.UTF8Encoding\(\$false\)/u);
  assert.match(releaseGate, /System\.IO\.File\]::WriteAllText/u);
  assert.match(releaseGate, /Write-JsonUtf8NoBom \$receiptPath \$receipt 8/u);
  assert.match(releaseGate, /Write-JsonUtf8NoBom \$bindingPath \$binding 5/u);
});

test('package smoke uses a private environment and refuses links before cleanup', async () => {
  const { isolatedSidecarEnvironment, removePackageSmokeScope } = await import('./helpers/standalone-package-scope.mjs');
  const directory = fs.mkdtempSync(path.join(root, '.tmp-standalone-package-'));
  let linked = false;
  const link = path.join(directory, 'link');
  try {
    const environment = isolatedSidecarEnvironment(root, directory, {
      SystemRoot: 'C:\\Windows', ComSpec: 'C:\\Windows\\System32\\cmd.exe',
      HOME: 'do-not-use', TEMP: 'do-not-use', EU_PRIVACY_ROOT: 'do-not-use', NODE_OPTIONS: 'do-not-use'
    });
    assert.equal(environment.PATH, '');
    assert.equal(environment.EU_PRIVACY_ROOT, undefined);
    assert.equal(environment.NODE_OPTIONS, undefined);
    for (const key of ['USERPROFILE', 'HOME', 'LOCALAPPDATA', 'APPDATA', 'TEMP', 'TMP', 'TMPDIR',
      'XDG_DATA_HOME', 'DATASECURE_STANDALONE_DOCUMENTS_DIR', 'DATASECURE_STANDALONE_DIAGNOSTIC_DIR']) {
      assert.ok(environment[key].startsWith(directory + path.sep));
      assert.equal(fs.lstatSync(environment[key]).isDirectory(), true);
    }
    assert.throws(() => removePackageSmokeScope(root, root), /STANDALONE_SMOKE_CLEANUP_UNSAFE/u);
    const synthetic = path.join(directory, 'synthetic');
    fs.mkdirSync(synthetic);
    const sentinel = path.join(synthetic, 'source.txt');
    fs.writeFileSync(sentinel, 'synthetic untouched fixture');
    fs.symlinkSync(synthetic, link, process.platform === 'win32' ? 'junction' : 'dir');
    linked = true;
    assert.throws(() => removePackageSmokeScope(root, directory), /STANDALONE_SMOKE_CLEANUP_UNSAFE/u);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'synthetic untouched fixture');
    assert.equal(fs.existsSync(environment.LOCALAPPDATA), true, 'a rejected tree is not partially removed');
  } finally {
    if (linked) {
      assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
      fs.unlinkSync(link);
    }
    removePackageSmokeScope(root, directory);
  }
  assert.equal(fs.existsSync(directory), false);
});

test('package smoke exercises a real failed CSV after success and resolves its own mapping', () => {
  const smoke = fs.readFileSync(path.join(root, 'tests', 'test-standalone-package-smoke.mjs'), 'utf8');
  assert.match(smoke, /env: environment/u);
  assert.match(smoke, /isolatedSidecarEnvironment\(root, extraction\)/u);
  assert.match(smoke, /removePackageSmokeScope\(root, extraction\)/u);
  assert.match(smoke, /failedSourceName = 'synthetisch-offenes-zitat\.csv'/u);
  assert.match(smoke, /assert\.notEqual\(failedRun, exactRun\)/u);
  assert.match(smoke, /failedTerminal\.ledger_available, true/u);
  assert.match(smoke, /local_path: failedMapping/u);
  assert.match(smoke, /fs\.readFileSync\(failedSource\), failedOriginal/u);
  const { parseDocumentBuffer } = require('../plugins/data-secure/server/document-parser');
  assert.throws(() => parseDocumentBuffer(Buffer.from('Name,Wert\nBeispiel,"nicht abgeschlossen\n'), '.csv'), /CSV_QUOTE_INVALID/u);
});
