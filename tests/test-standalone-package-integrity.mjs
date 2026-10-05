import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { verifyStandaloneInventory, verifyConversionInventory, verifyArchiveChecksum } from '../scripts/lib/standalone-package-integrity.mjs';
import { removePackageSmokeScope } from './helpers/standalone-package-scope.mjs';

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
process.stdout.write(`\n${passed} package integrity groups passed (no native GUI claim).\n`);
