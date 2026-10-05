import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readCentralModes } from './lib/zip.mjs';
import { verifyStandaloneInventory, verifyArchiveChecksum } from './lib/standalone-package-integrity.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const target = 'linux-x64-glibc';
const archiveIndex = process.argv.indexOf('--archive');
const archiveArgument = archiveIndex >= 0 ? process.argv[archiveIndex + 1] : null;
if (archiveIndex >= 0 && !archiveArgument) throw new Error('STANDALONE_LINUX_ARCHIVE_REQUIRED');
const archive = path.resolve(root, archiveArgument || `dist/DataSecure-Standalone-${version}-${target}.zip`);
const bytes = fs.readFileSync(archive);
const entries = readZip(bytes, { maxEntries: 100, maxUncompressed: 768 * 1024 * 1024 });
const modes = readCentralModes(bytes);
const prefix = `DataSecure-Standalone-${version}-${target}/`;
const relative = new Map();
for (const [name, value] of entries) {
  assert.ok(name.startsWith(prefix), 'STANDALONE_ZIP_ROOT_INVALID');
  const item = name.slice(prefix.length);
  assert.ok(item && !relative.has(item), 'STANDALONE_ZIP_DUPLICATE');
  assert.ok(!/(^|\/)(?:\.claude-plugin|skills|mcp-server\.js|\.mcp\.json)(?:\/|$)/iu.test(item));
  assert.ok(!/Claude|Cowork/iu.test(item));
  relative.set(item, value);
}
const appImage = 'DataSecure Standalone.AppImage';
for (const required of [appImage, 'STANDALONE-MANIFEST.json', 'RUNTIME-EVIDENCE.json',
  'RUST-LICENSE-INVENTORY.json', 'SBOM.spdx.json', 'SHA256SUMS', 'LICENSE',
  'LICENSE.node.txt', 'THIRD_PARTY_NOTICES.md', 'LINUX-START.md']) {
  assert.ok(relative.has(required), `STANDALONE_ZIP_REQUIRED:${required}`);
}
assert.equal(modes.get(`${prefix}${appImage}`), 0o100755);
assert.deepEqual([...relative.get(appImage).subarray(0, 4)], [0x7f, 0x45, 0x4c, 0x46]);
const manifest = JSON.parse(relative.get('STANDALONE-MANIFEST.json'));
assert.equal(manifest.schema, 'datasecure-standalone-package/1');
assert.equal(manifest.version, version);
assert.equal(manifest.target, target);
assert.equal(manifest.rust_target, 'x86_64-unknown-linux-gnu');
assert.equal(manifest.distribution_format, 'appimage-in-zip');
assert.equal(manifest.minimum_glibc_version, '2.35');
assert.equal(manifest.signing, 'unsigned');
assert.equal(manifest.requires_node_install, false);
assert.equal(manifest.requires_rust_install, false);
assert.equal(manifest.requires_network, false);
verifyStandaloneInventory(relative, manifest);
for (const file of manifest.files) {
  const value = relative.get(file.path);
  assert.ok(value, `STANDALONE_MANIFEST_MISSING:${file.path}`);
  assert.equal(value.length, file.bytes);
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), file.sha256);
  assert.equal(file.executable, file.path === appImage);
}
const rustLicenses = JSON.parse(relative.get('RUST-LICENSE-INVENTORY.json'));
assert.equal(rustLicenses.schema, 'datasecure-rust-license-inventory/1');
assert.ok(rustLicenses.components.length > 0);
assert.ok(rustLicenses.components.every((item) => item.name && item.version &&
  item.license && item.license !== 'NOASSERTION'));
const sbom = JSON.parse(relative.get('SBOM.spdx.json'));
for (const component of rustLicenses.components) {
  assert.ok(sbom.packages.some((item) => item.name === component.name &&
    item.versionInfo === component.version && item.licenseDeclared === component.license));
}
const checksum = fs.readFileSync(`${archive}.sha256`, 'utf8').trim();
verifyArchiveChecksum(bytes, archive, checksum);
process.stdout.write(`${JSON.stringify({ ok: true, archive, target, entries: relative.size, bytes: bytes.length })}\n`);
