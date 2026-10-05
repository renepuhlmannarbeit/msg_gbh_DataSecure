'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

test('unpublished candidate builds reject unsafe or existing output before altering saved files', () => {
  const script = path.join(root, 'scripts/build-standalone-package.mjs');
  assert.throws(() => execFileSync(process.execPath, [script, '--engineering-directory', '../release'],
    { stdio: 'pipe' }), /STANDALONE_BUILD_ARGUMENT_INVALID/u);
  const name = `engineering-contract-${randomUUID()}`;
  const directory = path.join(root, 'dist', name);
  fs.mkdirSync(directory);
  const initial = fs.lstatSync(directory);
  const sentinel = path.join(directory, 'preserved.txt');
  fs.writeFileSync(sentinel, 'saved candidate');
  try {
    assert.throws(() => execFileSync(process.execPath, [script, '--engineering-directory', name],
      { stdio: 'pipe' }), /EEXIST/u);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'saved candidate');
    assert.deepEqual(fs.readdirSync(directory), ['preserved.txt']);
  } finally {
    const current = fs.lstatSync(directory);
    assert.ok(current.isDirectory() && !current.isSymbolicLink());
    assert.equal(current.dev, initial.dev); assert.equal(current.ino, initial.ino);
    assert.equal(path.dirname(directory), path.join(root, 'dist'));
    fs.unlinkSync(sentinel); fs.rmdirSync(directory);
  }
});

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

test('macOS package build is deterministic, self-contained and fail-closed', () => {
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-standalone-macos-package.mjs'), 'utf8');
  const verify = fs.readFileSync(path.join(root, 'scripts', 'verify-standalone-macos-package.mjs'), 'utf8');
  for (const source of [build, verify]) {
    assert.match(source, /\['macos-x64', 'macos-arm64'\]/u);
    assert.match(source, /DataSecure Standalone\.app/u);
    assert.match(source, /STANDALONE-MANIFEST\.json/u);
    assert.match(source, /RUNTIME-EVIDENCE\.json/u);
    assert.match(source, /RUST-LICENSE-INVENTORY\.json/u);
    assert.match(source, /SBOM\.spdx\.json/u);
    assert.match(source, /SHA256SUMS/u);
    assert.doesNotMatch(source, /execSync|shell:\s*true|\bcurl\b|\bwget\b/u);
  }
  assert.match(build, /writeZip/u);
  assert.match(build, /path\.join\(runtimeDir, runtimeTarget\.launcher\)/u);
  assert.doesNotMatch(build, /path\.join\(runtimeDir, 'datasecure-node'\)/u);
  assert.match(build, /fs\.lstatSync/u);
  assert.match(build, /isSymbolicLink/u);
  assert.match(build, /STANDALONE_MACOS_SOURCE_CHANGED/u);
  assert.match(build, /requires_node_install: false/u);
  assert.match(build, /requires_rust_install: false/u);
  assert.match(build, /requires_network: false/u);
  assert.match(build, /requires_webview2: false/u);
  assert.match(build, /MACOS-START\.md/u);
  assert.match(verify, /readCentralModes/u);
  assert.match(verify, /0o100755/u);
  assert.match(verify, /\[0xcf, 0xfa, 0xed, 0xfe\]/u);
  assert.match(verify, /verifyConversionInventory\(relative,/u);
  const integrity = fs.readFileSync(path.join(root, 'scripts', 'lib', 'standalone-package-integrity.mjs'), 'utf8');
  assert.match(integrity, /CONVERSION_INVENTORIES_MISSING/u);
  assert.match(integrity, /verifyInventory\(files, manifest\.files,/u);
  assert.match(verify, /`\$\{archive\}\.sha256`/u);
});

test('macOS deployment contract checks every native dependency, including addons', async () => {
  const { inspectMachO, verifyMacNativeContract } = await import('../scripts/lib/macos-native-contract.mjs');
  function binary({ minimum = 0x0d0500, cpu = 0x01000007, library = '/usr/lib/libSystem.B.dylib',
    signed = true, libraryCommand = 0xc } = {}) {
    const name = Buffer.from(`${library}\0`);
    const dylib = Buffer.alloc(Math.ceil((24 + name.length) / 8) * 8);
    dylib.writeUInt32LE(libraryCommand); dylib.writeUInt32LE(dylib.length, 4);
    dylib.writeUInt32LE(24, 8); name.copy(dylib, 24);
    const version = Buffer.alloc(24);
    version.writeUInt32LE(0x32); version.writeUInt32LE(24, 4);
    version.writeUInt32LE(1, 8); version.writeUInt32LE(minimum, 12);
    const signature = Buffer.alloc(signed ? 16 : 0);
    const size = 32 + version.length + dylib.length + signature.length;
    if (signed) {
      signature.writeUInt32LE(0x1d); signature.writeUInt32LE(16, 4);
      signature.writeUInt32LE(size, 8); signature.writeUInt32LE(16, 12);
    }
    const header = Buffer.alloc(32);
    header.writeUInt32LE(0xfeedfacf); header.writeUInt32LE(cpu, 4);
    header.writeUInt32LE(signed ? 3 : 2, 16); header.writeUInt32LE(size - 32, 20);
    return Buffer.concat([header, version, dylib, signature, Buffer.alloc(16)]);
  }
  const contract = { target: 'macos-x64', minimumVersion: '13.5' };
  const check = bytes => verifyMacNativeContract(new Map([['addon.node', bytes]]), contract);
  assert.equal(check(binary())[0].minimumVersion, '13.5.0');
  for (const minimum of [0x0e0000, 0x0f0000]) {
    assert.throws(() => check(binary({ minimum })), /MINIMUM_TOO_HIGH/u);
  }
  assert.throws(() => check(binary({ cpu: 0x0100000c })), /ARCHITECTURE_MISMATCH/u);
  assert.throws(() => check(binary({ signed: false })), /SIGNATURE_MISSING/u);
  for (const library of ['/opt/homebrew/lib/dependency.dylib', '@rpath/dependency.dylib',
    '/usr/lib/../../opt/local/lib/dependency.dylib']) {
    assert.throws(() => check(binary({ library })), /EXTERNAL_LIBRARY/u);
  }
  // LC_ID_DYLIB is the library's identity, not an external load dependency.
  assert.equal(check(binary({ library: '/Users/build/libcanvas.dylib', libraryCommand: 0xd })).length, 1);
  assert.equal(inspectMachO(Buffer.from('resource')), null);
  assert.throws(() => check(Buffer.from('not an addon')), /BINARY_INVALID/u);
  assert.throws(() => inspectMachO(binary().subarray(0, 40)), /COMMANDS_INVALID/u);
  const malformed = binary(); malformed.writeUInt32LE(0, 36);
  assert.throws(() => inspectMachO(malformed), /COMMAND_INVALID/u);
});

test('Linux package build is deterministic, self-contained and fail-closed', () => {
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-standalone-linux-package.mjs'), 'utf8');
  const verify = fs.readFileSync(path.join(root, 'scripts', 'verify-standalone-linux-package.mjs'), 'utf8');
  for (const source of [build, verify]) {
    assert.match(source, /linux-x64-glibc/u);
    assert.match(source, /DataSecure Standalone\.AppImage/u);
    assert.match(source, /STANDALONE-MANIFEST\.json/u);
    assert.match(source, /RUNTIME-EVIDENCE\.json/u);
    assert.match(source, /RUST-LICENSE-INVENTORY\.json/u);
    assert.match(source, /SBOM\.spdx\.json/u);
    assert.match(source, /SHA256SUMS/u);
    assert.doesNotMatch(source, /execSync|shell:\s*true|\bcurl\b|\bwget\b/u);
  }
  assert.match(build, /writeZip/u);
  assert.match(build, /readStandaloneRuntimeContract/u);
  assert.match(build, /verifyTargetEvidence/u);
  assert.match(build, /requires_node_install: false/u);
  assert.match(build, /requires_rust_install: false/u);
  assert.match(build, /requires_network: false/u);
  assert.match(build, /minimum_glibc_version/u);
  assert.match(build, /LINUX-START\.md/u);
  assert.match(verify, /readCentralModes/u);
  assert.match(verify, /0o100755/u);
  assert.match(verify, /\[0x7f, 0x45, 0x4c, 0x46\]/u);
  assert.match(verify, /x86_64-unknown-linux-gnu/u);
  assert.match(verify, /appimage-in-zip/u);
  assert.match(verify, /`\$\{archive\}\.sha256`/u);
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
  const preparation = releaseGate.indexOf("Invoke-Checked 'node.exe' @('scripts/prepare-standalone-runtime.mjs')");
  const rustContracts = releaseGate.indexOf("Invoke-Checked 'npm.cmd' @('run', 'test:standalone')");
  assert.ok(preparation >= 0 && preparation < rustContracts, 'fresh-checkout runtime preparation precedes Rust contracts');
  assert.doesNotMatch(releaseGate, /Set-Content[^\r\n]*utf8NoBOM/u);
  assert.match(releaseGate, /System\.Text\.UTF8Encoding\(\$false\)/u);
  assert.match(releaseGate, /System\.IO\.File\]::WriteAllText/u);
  assert.match(releaseGate, /Write-JsonUtf8NoBom \$receiptPath \$receipt 8/u);
  assert.match(releaseGate, /Write-JsonUtf8NoBom \$bindingPath \$binding 5/u);
  assert.match(releaseGate, /function Get-Sha256File/u);
  assert.match(releaseGate, /System\.Security\.Cryptography\.SHA256\]::Create/u);
  assert.match(releaseGate, /Get-Sha256File \$receiptPath/u);
  assert.match(releaseGate, /datasecure-pkg-04-receipt\/2/u);
  assert.match(releaseGate, /Get-StandaloneWebViewHostFacts/u);
  assert.match(releaseGate, /webview2 = \$webviewHost/u);
  assert.doesNotMatch(releaseGate, /(?:^|[\r\n]\s*)Get-FileHash\b/mu,
    'receipt hashing must not depend on optional PowerShell module auto-loading');
});

test('package smoke uses a private environment and refuses links before cleanup', async () => {
  const smoke = fs.readFileSync(path.join(root, 'tests', 'test-standalone-package-smoke.mjs'), 'utf8');
  assert.match(smoke, /process\.platform === 'darwin'\s*\? path\.join\(environment\.HOME, 'Library', 'Application Support'\) : environment\.LOCALAPPDATA/u,
    'native support-event evidence must use the product data root of the target OS');
  assert.doesNotMatch(smoke, /path\.join\(environment\.LOCALAPPDATA, 'SecureDataMsg-Standalone'/u);
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

test('package smoke exercises a real failed CSV without exposing a false result or mapping', () => {
  const smoke = fs.readFileSync(path.join(root, 'tests', 'test-standalone-package-smoke.mjs'), 'utf8');
  assert.match(smoke, /env: environment/u);
  assert.match(smoke, /isolatedSidecarEnvironment\(root, extraction\)/u);
  assert.match(smoke, /removePackageSmokeScope\(root, extraction\)/u);
  assert.match(smoke, /failedSourceName = 'synthetisch-offenes-zitat\.csv'/u);
  assert.match(smoke, /failedRun, '', 'an all-stopped run does not expose an empty result folder'/u);
  assert.match(smoke, /failedTerminal\.ledger_available, false/u);
  assert.match(smoke, /resolvedFailureMapping\.error_code, 'STANDALONE_RESULTS_MISSING'/u);
  assert.match(smoke, /fs\.readFileSync\(failedSource\), failedOriginal/u);
  const { parseDocumentBuffer } = require('../plugins/data-secure/server/document-parser');
  assert.throws(() => parseDocumentBuffer(Buffer.from('Name,Wert\nBeispiel,"nicht abgeschlossen\n'), '.csv'), /CSV_QUOTE_INVALID/u);
});

test('package smoke binds actual review decisions and real restart to the extracted bundled runtime', async () => {
  const smoke = fs.readFileSync(path.join(root, 'tests', 'test-standalone-package-smoke.mjs'), 'utf8');
  assert.match(smoke, /await runPackagedReviewScenario\(\{ request, sourceDirectory, restart: async/u);
  const restart = smoke.slice(smoke.indexOf('await runPackagedReviewScenario'), smoke.indexOf('const log =',
    smoke.indexOf('await runPackagedReviewScenario')));
  assert.match(restart, /childProcess\.spawn\(childProcessPath\(runtime\)/u);
  assert.match(restart, /action: 'shutdown'/u);
  assert.match(restart, /closePromise/u);
  assert.doesNotMatch(restart, /plugins\/data-secure\/server|process\.execPath/u);
  const scenario = fs.readFileSync(path.join(root, 'tests', 'helpers', 'standalone-packaged-review.mjs'), 'utf8');
  for (const clause of ['originalAmbiguities', 'redact_organization', 'run_complete', 'failure names survive',
    'automatic', 'no Tauri/WebView interaction claim']) assert.ok(scenario.includes(clause), clause);
  assert.doesNotMatch(scenario, /vm\.|require\.cache|worker_factory|review_callback/u);
  const { packagedReviewFixtures } = await import('./helpers/standalone-packaged-review.mjs');
  const fixtures = packagedReviewFixtures();
  assert.equal(fixtures.size, 5);
  assert.equal([...fixtures].filter(([name]) => name.endsWith('.md')).length, 4);
  for (const [name, bytes] of fixtures) if (name.endsWith('.md')) {
    assert.equal(bytes.toString('utf8').match(/SYNTHETISCHER HÄRTETEST|TESTRUN VERIFIZIERER/gu).length, 1500);
  }
});
