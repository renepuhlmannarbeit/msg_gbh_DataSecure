import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readCentralModes } from './lib/zip.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const archive = process.argv[2] || path.join(root, 'dist', `DataSecure-Standalone-${version}-windows-x64.zip`);
const bytes = fs.readFileSync(archive);
const entries = readZip(bytes, { maxEntries: 500, maxUncompressed: 256 * 1024 * 1024 });
const modes = readCentralModes(bytes);
const prefix = `DataSecure-Standalone-${version}-windows-x64/`;
const relative = new Map();
for (const [name, value] of entries) {
  assert.ok(name.startsWith(prefix), 'STANDALONE_ZIP_ROOT_INVALID');
  const item = name.slice(prefix.length);
  assert.ok(item && !relative.has(item), 'STANDALONE_ZIP_DUPLICATE');
  assert.ok(!/(^|\/)(?:\.claude-plugin|skills|ocr-runtime|status-app|node_modules)(?:\/|$)/iu.test(item));
  assert.ok(!/(^|\/)(?:mcp-server\.js|\.mcp\.json)$/iu.test(item));
  assert.ok(!/Claude|Cowork/iu.test(item));
  relative.set(item, value);
}
for (const required of ['DataSecure Standalone.exe', 'datasecure-core-x86_64-pc-windows-msvc.exe',
  'server/standalone/desktop-sidecar.js', 'server/network-deny.cjs', 'RUNTIME-EVIDENCE.json',
  'STANDALONE-MANIFEST.json', 'SBOM.spdx.json', 'SHA256SUMS', 'LICENSE', 'LICENSE.node.txt',
  'THIRD_PARTY_NOTICES.md', 'START-WINDOWS.md']) assert.ok(relative.has(required), `STANDALONE_ZIP_REQUIRED:${required}`);

const manifest = JSON.parse(relative.get('STANDALONE-MANIFEST.json'));
assert.equal(manifest.schema, 'datasecure-standalone-package/1');
assert.equal(manifest.version, version);
assert.equal(manifest.target, 'windows-x64');
assert.equal(manifest.requires_node_install, false);
assert.equal(manifest.requires_rust_install, false);
for (const file of manifest.files) {
  const value = relative.get(file.path);
  assert.ok(value, `STANDALONE_MANIFEST_MISSING:${file.path}`);
  assert.equal(value.length, file.bytes);
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), file.sha256);
}
const sums = relative.get('SHA256SUMS').toString('utf8').trim().split(/\r?\n/u);
for (const line of sums) {
  const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
  assert.ok(match, 'STANDALONE_SHA256SUMS_INVALID');
  assert.equal(crypto.createHash('sha256').update(relative.get(match[2])).digest('hex'), match[1]);
}
for (const executable of ['DataSecure Standalone.exe', 'datasecure-core-x86_64-pc-windows-msvc.exe']) {
  assert.equal(modes.get(`${prefix}${executable}`), 0o100755);
  assert.equal(relative.get(executable)[0], 0x4d);
  assert.equal(relative.get(executable)[1], 0x5a);
}
process.stdout.write(`${JSON.stringify({ ok: true, archive, entries: relative.size, bytes: bytes.length })}\n`);
