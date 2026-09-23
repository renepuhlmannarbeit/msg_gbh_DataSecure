import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readCentralModes } from './lib/zip.mjs';
import { verifyMacNativeContract } from './lib/macos-native-contract.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const targets = JSON.parse(fs.readFileSync(path.join(root, 'apps', 'datasecure-standalone',
  'desktop-targets.json'), 'utf8'));

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const productTarget = argument('--target');
const target = targets.targets.find((candidate) => candidate.product_target === productTarget);
if (!target || !['macos-x64', 'macos-arm64'].includes(productTarget)) {
  throw new Error('STANDALONE_MACOS_TARGET_INVALID');
}
const archive = path.resolve(root, argument('--archive') || path.join('dist', target.package_filename));
const bytes = fs.readFileSync(archive);
const entries = readZip(bytes, { maxEntries: 15000, maxUncompressed: 768 * 1024 * 1024 });
const modes = readCentralModes(bytes);
const prefix = `DataSecure-Standalone-${version}-${productTarget}/`;
const relative = new Map();
for (const [name, value] of entries) {
  assert.ok(name.startsWith(prefix), 'STANDALONE_ZIP_ROOT_INVALID');
  const item = name.slice(prefix.length);
  assert.ok(item && !relative.has(item), 'STANDALONE_ZIP_DUPLICATE');
  assert.ok(!/(^|\/)(?:\.claude-plugin|skills|ocr-runtime|status-app)(?:\/|$)/iu.test(item));
  assert.ok(!/(^|\/)(?:mcp-server\.js|\.mcp\.json)$/iu.test(item));
  assert.ok(!/Claude|Cowork/iu.test(item));
  relative.set(item, value);
}

const app = 'DataSecure Standalone.app';
const executables = [
  `${app}/Contents/MacOS/datasecure-standalone`,
  `${app}/Contents/MacOS/datasecure-core`,
  `${app}/Contents/Resources/server/standalone/conversion-runtime/node`,
  `${app}/Contents/Resources/server/native/${productTarget}/datasecure-sandbox`
];
for (const required of [
  `${app}/Contents/Info.plist`, `${app}/Contents/Resources/server/standalone/desktop-sidecar.js`,
  `${app}/Contents/Resources/server/network-deny.cjs`,
  `${app}/Contents/Resources/server/standalone/conversion-worker.js`,
  `${app}/Contents/Resources/server/standalone/conversion-worker-child.js`,
  `${app}/Contents/Resources/server/standalone/conversion-runtime/RUNTIME.json`,
  `${app}/Contents/Resources/server/standalone/conversion-runtime/THIRD_PARTY_NOTICES.txt`,
  `${app}/Contents/Resources/server/native/${productTarget}/datasecure-sandbox.sha256`,
  ...executables, 'STANDALONE-MANIFEST.json', 'RUNTIME-EVIDENCE.json',
  'RUST-LICENSE-INVENTORY.json', 'SBOM.spdx.json', 'SHA256SUMS', 'LICENSE',
  'LICENSE.node.txt', 'THIRD_PARTY_NOTICES.md', 'MACOS-START.md'
]) assert.ok(relative.has(required), `STANDALONE_ZIP_REQUIRED:${required}`);

const manifest = JSON.parse(relative.get('STANDALONE-MANIFEST.json'));
assert.equal(manifest.schema, 'datasecure-standalone-package/1');
assert.equal(manifest.version, version);
assert.equal(manifest.target, productTarget);
assert.equal(manifest.rust_target, target.rust_target);
assert.equal(manifest.minimum_system_version, '13.5');
assert.equal(manifest.signing, 'adhoc');
assert.equal(manifest.requires_node_install, false);
assert.equal(manifest.requires_rust_install, false);
assert.equal(manifest.requires_network, false);
assert.equal(manifest.requires_webview2, false);
for (const file of manifest.files) {
  const value = relative.get(file.path);
  assert.ok(value, `STANDALONE_MANIFEST_MISSING:${file.path}`);
  assert.equal(value.length, file.bytes);
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), file.sha256);
  assert.equal(file.executable, executables.includes(file.path));
}

const rustLicenses = JSON.parse(relative.get('RUST-LICENSE-INVENTORY.json'));
assert.equal(rustLicenses.schema, 'datasecure-rust-license-inventory/1');
assert.ok(rustLicenses.components.length > 0);
assert.ok(rustLicenses.components.every((item) => item.name && item.version &&
  item.license && item.license !== 'NOASSERTION'));
const sbom = JSON.parse(relative.get('SBOM.spdx.json'));
for (const component of rustLicenses.components) {
  assert.ok(sbom.packages.some((item) => item.name === component.name &&
    item.versionInfo === component.version && item.licenseDeclared === component.license &&
    item.licenseConcluded === component.license));
}
const sums = relative.get('SHA256SUMS').toString('utf8').trim().split(/\r?\n/u);
for (const line of sums) {
  const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
  assert.ok(match, 'STANDALONE_SHA256SUMS_INVALID');
  assert.equal(crypto.createHash('sha256').update(relative.get(match[2])).digest('hex'), match[1]);
}
for (const executable of executables) {
  assert.equal(modes.get(`${prefix}${executable}`), 0o100755);
  const value = relative.get(executable);
  assert.deepEqual([...value.subarray(0, 4)], [0xcf, 0xfa, 0xed, 0xfe]);
}
const native = verifyMacNativeContract(relative, { target: productTarget,
  minimumVersion: manifest.minimum_system_version });
const conversion = JSON.parse(relative.get(`${app}/Contents/Resources/server/standalone/conversion-runtime/RUNTIME.json`));
assert.equal(conversion.schema, 'datasecure-conversion-runtime/1');
assert.equal(conversion.target, productTarget);
for (const file of conversion.files) {
  const value = relative.get(`${app}/Contents/Resources/server/standalone/conversion-runtime/${file.path}`);
  assert.ok(value, 'CONVERSION_PACKAGE_RESOURCE_MISSING');
  assert.equal(value.length, file.bytes);
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), file.sha256);
}
const checksum = fs.readFileSync(`${archive}.sha256`, 'utf8').trim();
assert.equal(checksum, `${crypto.createHash('sha256').update(bytes).digest('hex')}  ${path.basename(archive)}`);
process.stdout.write(`${JSON.stringify({ ok: true, archive, target: productTarget,
  entries: relative.size, bytes: bytes.length, native_binaries: native.map(({ path, minimumVersion }) =>
    ({ path, minimum_version: minimumVersion })) })}\n`);
