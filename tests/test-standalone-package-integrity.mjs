import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { verifyStandaloneInventory, verifyConversionInventory, verifyArchiveChecksum } from '../scripts/lib/standalone-package-integrity.mjs';
import { removePackageSmokeScope } from './helpers/standalone-package-scope.mjs';
import { readContract, sha256, verifyTargetEvidence, readRegular } from '../scripts/lib/bundled-runtime.mjs';
import { SOURCE_INPUT_FILES, SOURCE_MARKER_PREFIX, SOURCE_MARKER_SUFFIX } from '../scripts/lib/standalone-build-fingerprint.mjs';
import { WINDOWS_PACKAGE_ROOT } from '../scripts/lib/standalone-windows-layout.mjs';
import { createWindowsPackageStage, writeWindowsStageBytes, writeWindowsPackageChecksum,
  verifyWindowsPackageBindings } from '../scripts/lib/standalone-windows-package.mjs';

const require = createRequire(import.meta.url);
const { zipStore } = require('./lib/zip.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let passed = 0;
function test(name, run) { run(); passed++; process.stdout.write(`✓ ${name}\n`); }
function record(name, value) { return { path: name, bytes: value.length, sha256: digest(value), executable: false }; }
function fixture() {
  const entries = new Map([['server/worker.js', Buffer.from('real payload')], ['LICENSE', Buffer.from('license')]]);
  const manifest = { files: [...entries].map(([name, value]) => record(name, value)) };
  entries.set('STANDALONE-MANIFEST.json', Buffer.from(JSON.stringify(manifest)));
  entries.set('SHA256SUMS', Buffer.from([...entries].map(([name, value]) => `${digest(value)}  ${name}`).join('\n') + '\n'));
  return { entries, manifest };
}
test('valid complete inventory uses explicit metadata exceptions, not self-hashes', () => {
  const { entries, manifest } = fixture(); verifyStandaloneInventory(entries, manifest);
});

test('fully reinventoried host-only replay and automatic-review modules remain forbidden in Windows and Mac payloads', () => {
  const withExtra = name => {
    const { entries, manifest } = fixture();
    entries.delete('STANDALONE-MANIFEST.json'); entries.delete('SHA256SUMS');
    entries.set(name, Buffer.from('synthetic adapter payload'));
    manifest.files = [...entries].map(([file, bytes]) => record(file, bytes));
    entries.set('STANDALONE-MANIFEST.json', Buffer.from(JSON.stringify(manifest)));
    entries.set('SHA256SUMS', Buffer.from([...entries].map(([file, bytes]) => `${digest(bytes)}  ${file}`).join('\n') + '\n'));
    return { entries, manifest };
  };
  for (const prefix of ['server/gateway/', 'DataSecure Standalone.app/Contents/Resources/server/gateway/']) {
    for (const leaf of ['result-export-replay.js', 'result-export-replay-worker.js', 'RESULT-EXPORT-REPLAY-WORKER.JS']) {
      const { entries, manifest } = withExtra(prefix + leaf);
      assert.throws(() => verifyStandaloneInventory(entries, manifest), /STANDALONE_COWORK_REPLAY_FORBIDDEN/u);
    }
    for (const leaf of ['automatic-local-review.js', 'AUTOMATIC-LOCAL-REVIEW.JS']) {
      const { entries, manifest } = withExtra(prefix + leaf);
      assert.throws(() => verifyStandaloneInventory(entries, manifest), /STANDALONE_COWORK_REVIEW_FORBIDDEN/u);
    }
    // The synchronous shared export core remains a supported runtime module.
    const { entries, manifest } = withExtra(prefix + 'result-export.js');
    verifyStandaloneInventory(entries, manifest);
  }
});

test('fully reinventoried Windows and both Mac inventories retain neutral diagnostics but reject MCP export code', () => {
  const neutral = fs.readFileSync(path.join(root, 'plugins/data-secure/server/gateway/diagnostics.js'));
  const targets = [
    { target: 'windows-x64', prefix: 'server/gateway/' },
    { target: 'macos-arm64', prefix: 'DataSecure Standalone.app/Contents/Resources/server/gateway/' },
    { target: 'macos-x64', prefix: 'DataSecure Standalone.app/Contents/Resources/server/gateway/' }
  ];
  const withSource = (target, name, bytes) => {
    const { entries, manifest } = fixture();
    entries.delete('STANDALONE-MANIFEST.json'); entries.delete('SHA256SUMS');
    entries.set(name, bytes); manifest.target = target;
    manifest.files = [...entries].map(([file, value]) => record(file, value));
    entries.set('STANDALONE-MANIFEST.json', Buffer.from(JSON.stringify(manifest)));
    entries.set('SHA256SUMS', Buffer.from([...entries]
      .map(([file, value]) => `${digest(value)}  ${file}`).join('\n') + '\n'));
    return { entries, manifest };
  };
  for (const { target, prefix } of targets) {
    const allowed = withSource(target, prefix + 'diagnostics.js', neutral);
    verifyStandaloneInventory(allowed.entries, allowed.manifest);
    for (const leaf of ['mcp-diagnostic-export.js', 'MCP-DIAGNOSTIC-EXPORT.JS']) {
      const forbidden = withSource(target, prefix + leaf, Buffer.from('module.exports = {};'));
      assert.throws(() => verifyStandaloneInventory(forbidden.entries, forbidden.manifest),
        /STANDALONE_COWORK_DIAGNOSTIC_FORBIDDEN/u, target + ':' + leaf);
    }
    for (const snippet of [
      'function digestArtifact() {}',
      'function diagnosticExportPath() {}',
      'function exportDiagnosticPackage() {}',
      "const legacySchema = 'data-secure-diagnostic-export/1';"
    ]) {
      const forbidden = withSource(target, prefix + 'diagnostics.js',
        Buffer.concat([neutral, Buffer.from('\n' + snippet + '\n')]));
      assert.throws(() => verifyStandaloneInventory(forbidden.entries, forbidden.manifest),
        /STANDALONE_COWORK_DIAGNOSTIC_FORBIDDEN/u, target + ':' + snippet);
    }
  }
});

test('a changed unlisted runtime file cannot pass even with a valid checksums file', () => {
  const { entries, manifest } = fixture();
  entries.set('server/worker.js', Buffer.from('tampered runtime')); manifest.files.shift();
  entries.set('STANDALONE-MANIFEST.json', Buffer.from(JSON.stringify(manifest)));
  entries.set('SHA256SUMS', Buffer.from([...entries].filter(([name]) => name !== 'SHA256SUMS')
    .map(([name, value]) => `${digest(value)}  ${name}`).join('\n') + '\n'));
  assert.throws(() => verifyStandaloneInventory(entries, manifest), /STANDALONE_MANIFEST_COVERAGE/u);
});
test('missing/duplicate/self-referenced manifest and checksum records are rejected', () => {
  for (const mutation of [
    ({ manifest }) => manifest.files.push(manifest.files[0]),
    ({ entries, manifest }) => manifest.files.push(record('STANDALONE-MANIFEST.json', entries.get('STANDALONE-MANIFEST.json'))),
    ({ manifest }) => manifest.files[0].path = '../server/worker.js',
    ({ entries }) => entries.set('SHA256SUMS', Buffer.from('')),
    ({ entries }) => entries.set('SHA256SUMS', Buffer.from(`${digest(entries.get('LICENSE'))}  LICENSE\n`)),
    ({ entries }) => entries.set('SHA256SUMS', Buffer.concat([entries.get('SHA256SUMS'), entries.get('SHA256SUMS')])),
    ({ entries }) => entries.set('SHA256SUMS', Buffer.from(`${digest(Buffer.from(''))}  SHA256SUMS\n`)),
    ({ entries }) => entries.set('server/extra.js', Buffer.from('unlisted')),
    ({ entries }) => entries.set('SHA256SUMS', Buffer.from(`${digest(Buffer.from(''))}  missing.js\n`))
  ]) {
    const value = fixture(); mutation(value);
    assert.throws(() => verifyStandaloneInventory(value.entries, value.manifest));
  }
});
test('conversion inventory must completely cover payload, except its two generated summaries', () => {
  const files = new Map([['runtime/node', Buffer.from('node')], ['runtime/RUNTIME.json', Buffer.from('{}')],
    ['runtime/THIRD_PARTY_NOTICES.txt', Buffer.from('licenses')]]);
  const manifest = { files: [record('node', files.get('runtime/node'))] };
  verifyConversionInventory(files, 'runtime/', manifest);
  files.set('runtime/extra.node', Buffer.from('hidden native code'));
  assert.throws(() => verifyConversionInventory(files, 'runtime/', manifest), /CONVERSION_MANIFEST_COVERAGE/u);
  files.delete('runtime/extra.node'); manifest.files.push(manifest.files[0]);
  assert.throws(() => verifyConversionInventory(files, 'runtime/', manifest), /CONVERSION_MANIFEST_DUPLICATE/u);
});
test('external archive checksum rejects changed bytes and a checksum for a different filename', () => {
  const bytes = Buffer.from('zip');
  verifyArchiveChecksum(bytes, 'candidate.zip', `${digest(bytes)}  candidate.zip\n`);
  assert.throws(() => verifyArchiveChecksum(Buffer.from('changed'), 'candidate.zip', `${digest(bytes)}  candidate.zip`));
  assert.throws(() => verifyArchiveChecksum(bytes, 'candidate.zip', `${digest(bytes)}  other.zip`));
});
test('syntax files require their pinned contract even after inventory hashes are recomputed', () => {
  const make = (contract = true) => {
    const files = new Map([['runtime/RUNTIME.json', Buffer.from('{}')], ['runtime/THIRD_PARTY_NOTICES.txt', Buffer.from('license')]]);
    const packages = [{ name: 'mdast-util-from-markdown', version: '2.0.2', license: 'MIT' },
      { name: 'parse5', version: '7.3.0', license: 'MIT' }, { name: 'entities', version: '6.0.1', license: 'BSD-2-Clause' }];
    for (const item of packages) files.set(`runtime/node_modules/${item.name}/package.json`,
      Buffer.from(JSON.stringify({ name: item.name, version: item.version,
        ...(item.name === 'parse5' ? { dependencies: { entities: '^6.0.0' } } : {}) })));
    const manifest = { packages, files: [...files].filter(([name]) => name.includes('node_modules'))
      .map(([name, value]) => record(name.slice('runtime/'.length), value)),
      ...(contract ? { syntax_reader_contract: 'datasecure-markdown-syntax/1' } : {}) };
    return { files, manifest };
  };
  let value = make(); verifyConversionInventory(value.files, 'runtime/', value.manifest);
  value = make(false); assert.throws(() => verifyConversionInventory(value.files, 'runtime/', value.manifest), /CONVERSION_SYNTAX_CONTRACT_INVALID/u);
  value = make(); value.manifest.packages.push({ ...value.manifest.packages[0] });
  assert.throws(() => verifyConversionInventory(value.files, 'runtime/', value.manifest), /CONVERSION_SYNTAX_PACKAGE_DUPLICATE/u);
  value = make(); value.files.delete('runtime/node_modules/entities/package.json');
  value.manifest.files = value.manifest.files.filter(item => !item.path.includes('/entities/'));
  assert.throws(() => verifyConversionInventory(value.files, 'runtime/', value.manifest), /CONVERSION_SYNTAX_DEPENDENCY_MISSING/u);
  value = make(); value.manifest.packages[0].version = '999.0.0';
  assert.throws(() => verifyConversionInventory(value.files, 'runtime/', value.manifest), /CONVERSION_SYNTAX_PIN_MISSING/u);
});
test('all three production verifiers invoke the common complete-inventory and external-checksum checks', () => {
  for (const file of ['verify-standalone-package.mjs', 'verify-standalone-macos-package.mjs', 'verify-standalone-linux-package.mjs']) {
    const source = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
    assert.match(source, /verifyStandaloneInventory\(relative, manifest\)/u);
    assert.match(source, /verifyArchiveChecksum\(bytes, archive,/u);
  }
});
test('actual Linux package verifier CLI rejects missing manifest records and a wrong external checksum', () => {
  // This tests verification on any host, NOT AppImage execution or Linux GUI.
  const scope = fs.mkdtempSync(path.join(root, '.tmp-standalone-package-'));
  try {
    const name = `DataSecure-Standalone-${version}-linux-x64-glibc`;
    const archive = path.join(scope, `${name}.zip`);
    const payload = new Map([
      ['DataSecure Standalone.AppImage', Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1])],
      ['RUNTIME-EVIDENCE.json', Buffer.from('{}')],
      ['RUST-LICENSE-INVENTORY.json', Buffer.from(JSON.stringify({ schema: 'datasecure-rust-license-inventory/1',
        components: [{ name: 'synthetic-crate', version: '1', license: 'MIT' }] }))],
      ['SBOM.spdx.json', Buffer.from(JSON.stringify({ packages: [{ name: 'synthetic-crate', versionInfo: '1', licenseDeclared: 'MIT' }] }))],
      ...['LICENSE', 'LICENSE.node.txt', 'THIRD_PARTY_NOTICES.md', 'LINUX-START.md'].map(file => [file, Buffer.from('synthetic verifier fixture')])
    ]);
    const manifest = { schema: 'datasecure-standalone-package/1', version, target: 'linux-x64-glibc',
      rust_target: 'x86_64-unknown-linux-gnu', distribution_format: 'appimage-in-zip', minimum_glibc_version: '2.35',
      signing: 'unsigned', requires_node_install: false, requires_rust_install: false, requires_network: false,
      files: [...payload].map(([file, bytes]) => ({ ...record(file, bytes), executable: file.endsWith('.AppImage') })) };
    function build(wrongChecksum = false) {
      const entries = new Map(payload);
      entries.set('STANDALONE-MANIFEST.json', Buffer.from(JSON.stringify(manifest)));
      entries.set('SHA256SUMS', Buffer.from([...entries].map(([file, bytes]) => `${digest(bytes)}  ${file}`).join('\n') + '\n'));
      // zipStore has no executable modes: set the AppImage central record to
      // the real package mode so the production verifier reaches inventories.
      const zip = zipStore([...entries].map(([file, bytes]) => [`${name}/${file}`, bytes]));
      for (let offset = 0; offset < zip.length - 46; offset++) if (zip.readUInt32LE(offset) === 0x02014b50) {
        const length = zip.readUInt16LE(offset + 28);
        const file = zip.toString('utf8', offset + 46, offset + 46 + length);
        zip.writeUInt32LE(((file.endsWith('.AppImage') ? 0o100755 : 0o100644) * 0x10000) >>> 0, offset + 38);
      }
      fs.writeFileSync(archive, zip);
      fs.writeFileSync(`${archive}.sha256`, `${wrongChecksum ? '0'.repeat(64) : digest(zip)}  ${path.basename(archive)}\n`);
    }
    const run = () => spawnSync(process.execPath, ['scripts/verify-standalone-linux-package.mjs', '--archive', archive],
      { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 5000 });
    build(); let result = run(); assert.equal(result.status, 0, result.stderr);
    build(true); result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /STANDALONE_ARCHIVE_CHECKSUM_INVALID/u);
    manifest.files.pop(); build(); result = run();
    assert.notEqual(result.status, 0); assert.match(result.stderr, /STANDALONE_MANIFEST_COVERAGE/u);
  } finally { removePackageSmokeScope(root, scope); }
});

function windowsBindingFixture() {
  const contract = readContract(root), target = contract.targets.find(item => item.id === 'windows-x64');
  const core = Buffer.alloc(1024); core.write('MZ'); core.writeUInt32LE(128, 0x3c);
  core.write('PE\0\0', 128); core.writeUInt16LE(0x8664, 132);
  const license = Buffer.from('Synthetic license, not an official runtime provenance claim.\n'.repeat(4));
  const evidence = { schema: 'datasecure-bundled-runtime-target/v1', target: target.id,
    node_version: contract.node_version, archive: target.archive, archive_sha256: target.archive_sha256,
    bytes: core.length, sha256: sha256(core), license_bytes: license.length, license_sha256: sha256(license),
    runtime_probe: { version: contract.node_version, platform: target.os, arch: target.arch } };
  const { schema, ...record } = evidence;
  const aggregate = { schema: 'datasecure-standalone-runtime-evidence/1', targets: [record] };
  const manifest = { schema: 'datasecure-standalone-package/1', version, target: 'windows-x64',
    source_fingerprint: 'a'.repeat(64), files: [] };
  const marker = fingerprint => Buffer.from('synthetic desktop ' + SOURCE_MARKER_PREFIX + fingerprint + SOURCE_MARKER_SUFFIX);
  const entries = new Map([['DataSecure Standalone.exe', marker(manifest.source_fingerprint)],
    ['datasecure-core-x86_64-pc-windows-msvc.exe', core], ['LICENSE.node.txt', license]]);
  const refresh = () => {
    entries.delete('STANDALONE-MANIFEST.json'); entries.delete('SHA256SUMS');
    entries.set('RUNTIME-EVIDENCE.json', Buffer.from(JSON.stringify(aggregate)));
    manifest.files = [...entries].map(([name, bytes]) => ({ ...recordEntry(name, bytes), executable: name.endsWith('.exe') }));
    entries.set('STANDALONE-MANIFEST.json', Buffer.from(JSON.stringify(manifest)));
    entries.set('SHA256SUMS', Buffer.from([...entries].map(([name, bytes]) => digest(bytes) + '  ' + name).join('\n') + '\n'));
    verifyStandaloneInventory(entries, manifest);
  };
  refresh();
  return { entries, manifest, contract, aggregate, evidence, core, license, marker, refresh };
}
function recordEntry(name, bytes) { return { path: name, bytes: bytes.length, sha256: digest(bytes) }; }

test('Windows runtime aggregate binds archived Core/license and archived desktop fingerprint without mutable source reads', () => {
  const f = windowsBindingFixture(), read = fs.readFileSync;
  // The inspected object is synthetic. This proves metadata consistency only.
  fs.readFileSync = () => { throw new Error('MUTABLE_CHECKOUT_READ_NOT_ALLOWED'); };
  try { verifyWindowsPackageBindings(f.entries, f.manifest, f.contract); }
  finally { fs.readFileSync = read; }
});

test('fully reinventoried Windows runtime metadata rejects schema, role, field, hash and architecture mismatches', () => {
  const mutations = [
    f => f.aggregate.schema = 'unknown',
    f => f.aggregate.extra = true,
    f => f.aggregate.targets = [],
    f => f.aggregate.targets.push(f.aggregate.targets[0]),
    f => delete f.aggregate.targets[0].sha256,
    f => f.aggregate.targets[0].extra = true,
    f => f.aggregate.targets[0].target = 'macos-arm64',
    f => f.aggregate.targets[0].archive = 'different.zip',
    f => f.aggregate.targets[0].archive_sha256 = '0'.repeat(64),
    f => f.aggregate.targets[0].node_version = '0.0.0',
    f => f.aggregate.targets[0].bytes++,
    f => f.aggregate.targets[0].sha256 = '0'.repeat(64),
    f => f.aggregate.targets[0].license_bytes++,
    f => f.aggregate.targets[0].license_sha256 = '0'.repeat(64),
    f => f.aggregate.targets[0].runtime_probe.arch = 'arm64',
    f => f.aggregate.targets[0].runtime_probe.platform = 'darwin',
    f => f.aggregate.targets[0].runtime_probe.extra = true,
    f => f.entries.set('LICENSE.node.txt', Buffer.from('changed delivered license')),
    f => {
      const changed = Buffer.from(f.core); changed[1000] ^= 1;
      f.entries.set('datasecure-core-x86_64-pc-windows-msvc.exe', changed);
    },
    f => {
      const changed = Buffer.from(f.core); changed.writeUInt16LE(0xaa64, 132);
      f.entries.set('datasecure-core-x86_64-pc-windows-msvc.exe', changed);
      // Even a matching payload digest does not admit another architecture.
      f.aggregate.targets[0].sha256 = sha256(changed);
    }
  ];
  for (const mutate of mutations) {
    const f = windowsBindingFixture(); mutate(f); f.refresh();
    assert.throws(() => verifyWindowsPackageBindings(f.entries, f.manifest, f.contract));
  }
  const f = windowsBindingFixture();
  f.entries.set('RUNTIME-EVIDENCE.json', Buffer.from('{}'));
  // Rebuild metadata without replacing this deliberately malformed aggregate.
  f.manifest.files = [...f.entries].filter(([name]) => !['SHA256SUMS','STANDALONE-MANIFEST.json'].includes(name))
    .map(([name, bytes]) => ({ ...recordEntry(name, bytes), executable: name.endsWith('.exe') }));
  f.entries.set('STANDALONE-MANIFEST.json', Buffer.from(JSON.stringify(f.manifest)));
  f.entries.set('SHA256SUMS', Buffer.from([...f.entries].filter(([name]) => name !== 'SHA256SUMS')
    .map(([name, bytes]) => digest(bytes) + '  ' + name).join('\n') + '\n'));
  verifyStandaloneInventory(f.entries, f.manifest);
  assert.throws(() => verifyWindowsPackageBindings(f.entries, f.manifest, f.contract), /STANDALONE_RUNTIME_EVIDENCE_INVALID/u);
});

test('fully reinventoried archived desktop/source-marker mismatches cannot be repaired by checksum regeneration', () => {
  const mutations = [
    f => delete f.manifest.source_fingerprint,
    f => f.manifest.source_fingerprint = 5,
    f => f.manifest.source_fingerprint = 'A'.repeat(64),
    f => f.manifest.source_fingerprint = 'a'.repeat(63),
    f => f.manifest.source_fingerprint = 'b'.repeat(64),
    f => f.entries.set('DataSecure Standalone.exe', Buffer.from('no source marker')),
    f => f.entries.set('DataSecure Standalone.exe', f.marker('g'.repeat(64))),
    f => f.entries.set('DataSecure Standalone.exe', Buffer.concat([f.marker('a'.repeat(64)), f.marker('b'.repeat(64))]))
  ];
  for (const mutate of mutations) {
    const f = windowsBindingFixture(); mutate(f); f.refresh();
    assert.throws(() => verifyWindowsPackageBindings(f.entries, f.manifest, f.contract), /STANDALONE_DESKTOP_SOURCE_/u);
  }
});

function withWindowsStageFixture(run) {
  const scope = fs.mkdtempSync(path.join(root, '.tmp-standalone-package-'));
  try { run(scope); } finally { removePackageSmokeScope(root, scope); }
}
const syntheticWindowsName = 'DataSecure-Standalone-3.2.0-synthetic-windows-x64';

test('Windows stage writes the actual verified held Core/license Buffers after their source paths change', () => {
  withWindowsStageFixture(scope => {
    const f = windowsBindingFixture(), coreFile = path.join(scope, 'core'), licenseFile = path.join(scope, 'license');
    fs.writeFileSync(coreFile, f.core); fs.writeFileSync(licenseFile, f.license);
    const heldCore = readRegular(coreFile, 128 * 1024 * 1024), heldLicense = readRegular(licenseFile, 2 * 1024 * 1024);
    verifyTargetEvidence(f.evidence, heldCore, heldLicense, f.contract.targets[0], f.contract);
    fs.writeFileSync(coreFile, Buffer.from('changed source B')); fs.writeFileSync(licenseFile, Buffer.from('changed license B'));
    const layout = createWindowsPackageStage(scope, syntheticWindowsName, WINDOWS_PACKAGE_ROOT);
    writeWindowsStageBytes(layout.stage, 'datasecure-core-x86_64-pc-windows-msvc.exe', heldCore, 0o700);
    writeWindowsStageBytes(layout.stage, 'LICENSE.node.txt', heldLicense);
    assert.ok(fs.readFileSync(path.join(layout.stage, 'datasecure-core-x86_64-pc-windows-msvc.exe')).equals(heldCore));
    assert.ok(fs.readFileSync(path.join(layout.stage, 'LICENSE.node.txt')).equals(heldLicense));
    writeWindowsPackageChecksum(layout.output, Buffer.from('synthetic archive bytes'));
    assert.equal(fs.readFileSync(layout.output + '.sha256', 'utf8'),
      sha256(Buffer.from('synthetic archive bytes')) + '  ' + path.basename(layout.output) + '\n');
    assert.throws(() => writeWindowsStageBytes(layout.stage, 'LICENSE.node.txt', heldLicense), error => error.code === 'EEXIST');
    assert.throws(() => writeWindowsStageBytes(layout.stage, '../outside', heldLicense), /STANDALONE_STAGE_UNSAFE/u);
    const target = path.join(layout.stage, 'changed.txt'), write = fs.writeFileSync;
    fs.writeFileSync = function(file, bytes, options) {
      write.call(this, file, bytes, options);
      if (file === target) write.call(this, file, Buffer.alloc(bytes.length, 120));
    };
    try { assert.throws(() => writeWindowsStageBytes(layout.stage, 'changed.txt', Buffer.from('verified bytes')),
      /STANDALONE_STAGE_BYTES_CHANGED/u); }
    finally { fs.writeFileSync = write; }
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(path.join(layout.stage, 'datasecure-core-x86_64-pc-windows-msvc.exe')).mode & 0o777, 0o700);
      assert.equal(fs.statSync(path.join(layout.stage, 'LICENSE.node.txt')).mode & 0o777, 0o600);
    }
  });
});

test('new default stages preserve the old fixed stage and ZIP/checksum occupants', () => {
  withWindowsStageFixture(scope => {
    const old = path.join(scope, 'dist', 'standalone-package-stage');
    fs.mkdirSync(old, { recursive: true }); fs.writeFileSync(path.join(old, 'sentinel'), 'old stage');
    const first = createWindowsPackageStage(scope, syntheticWindowsName, WINDOWS_PACKAGE_ROOT);
    const second = createWindowsPackageStage(scope, syntheticWindowsName, WINDOWS_PACKAGE_ROOT);
    assert.notEqual(first.stageParent, second.stageParent);
    assert.equal(path.basename(first.stage), WINDOWS_PACKAGE_ROOT);
    assert.equal(path.basename(second.stage), WINDOWS_PACKAGE_ROOT);
    assert.equal(fs.readFileSync(path.join(old, 'sentinel'), 'utf8'), 'old stage');
    fs.writeFileSync(first.output, 'old archive');
    assert.throws(() => createWindowsPackageStage(scope, syntheticWindowsName, WINDOWS_PACKAGE_ROOT), error => error.code === 'EEXIST');
    assert.equal(fs.readFileSync(first.output, 'utf8'), 'old archive');
    // A separate name exercises an old orphan checksum without removing the ZIP.
    const name = syntheticWindowsName + '-checksum', checksum = path.join(scope, 'dist', name + '.zip.sha256');
    fs.writeFileSync(checksum, 'old checksum');
    assert.throws(() => createWindowsPackageStage(scope, name, WINDOWS_PACKAGE_ROOT), error => error.code === 'EEXIST');
    assert.equal(fs.readFileSync(checksum, 'utf8'), 'old checksum');
    const original = fs.readFileSync(checksum), newArchive = checksum.slice(0, -7);
    fs.writeFileSync(newArchive, 'new zip completed before checksum collision');
    assert.throws(() => writeWindowsPackageChecksum(newArchive, Buffer.from('new zip')), error => error.code === 'EEXIST');
    assert.ok(fs.readFileSync(checksum).equals(original));
    assert.equal(fs.readFileSync(newArchive, 'utf8'), 'new zip completed before checksum collision');
  });
});

test('engineering stage admission is exclusive and a redirected dist is refused before stage mutation (IO model)', () => {
  withWindowsStageFixture(scope => {
    const dist = path.join(scope, 'dist'); fs.mkdirSync(dist);
    const engineering = path.join(dist, 'engineering-existing'); fs.mkdirSync(engineering);
    fs.writeFileSync(path.join(engineering, 'sentinel'), 'saved');
    assert.throws(() => createWindowsPackageStage(scope, syntheticWindowsName, WINDOWS_PACKAGE_ROOT, 'engineering-existing'),
      error => error.code === 'EEXIST');
    const before = fs.readdirSync(dist).sort(), lstat = fs.lstatSync;
    fs.lstatSync = function(file, ...args) {
      const stat = lstat.call(this, file, ...args);
      return file === dist ? Object.assign(Object.create(stat), { isSymbolicLink: () => true }) : stat;
    };
    try { assert.throws(() => createWindowsPackageStage(scope, syntheticWindowsName, WINDOWS_PACKAGE_ROOT), /BOUND_FILE_UNSAFE/u); }
    finally { fs.lstatSync = lstat; }
    assert.deepEqual(fs.readdirSync(dist).sort(), before);
    assert.equal(fs.readFileSync(path.join(engineering, 'sentinel'), 'utf8'), 'saved');
  });
});

test('Windows builder/verifier wire the shared package boundaries and fingerprint their implementation', () => {
  const build = fs.readFileSync(path.join(root, 'scripts/build-standalone-package.mjs'), 'utf8');
  const verify = fs.readFileSync(path.join(root, 'scripts/verify-standalone-package.mjs'), 'utf8');
  for (const file of ['scripts/lib/zip.mjs', 'scripts/verify-standalone-package.mjs',
    'scripts/lib/standalone-windows-package.mjs']) assert.ok(SOURCE_INPUT_FILES.includes(file), file);
  assert.match(build, /createWindowsPackageStage\(root, packageName, folderName,/u);
  assert.match(build, /writeWindowsStageBytes\(stage, `datasecure-core-\$\{rustTarget\}\.exe`, runtimeBytes, 0o700\)/u);
  assert.match(build, /writeWindowsStageBytes\(stage, 'LICENSE\.node\.txt', licenseBytes\)/u);
  assert.doesNotMatch(build, /copyFile\(runtime(?:License)?,|rmSync\(|safeResetStage/u);
  assert.match(build, /writeZip\(output, archiveFiles, \{ createOnly: true \}\)/u);
  assert.match(build, /writeWindowsPackageChecksum\(output, zipBytes\)/u);
  assert.match(verify, /verifyWindowsPackageBindings\(relative, manifest, readContract\(root\)\)/u);
});

process.stdout.write(`\n${passed} package integrity groups passed (no native GUI claim).\n`);
