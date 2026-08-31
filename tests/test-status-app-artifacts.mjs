import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const directory = new URL('plugins/data-secure/server/status-app/', root);
const manifest = JSON.parse(fs.readFileSync(new URL('artifact.json', directory), 'utf8'));
const html = fs.readFileSync(new URL('status-card.html', directory), 'utf8');
assert.equal(Buffer.byteLength(html), manifest.bytes);
assert.equal(crypto.createHash('sha256').update(html).digest('hex'), manifest.sha256);
assert.equal(manifest.release_enabled, false);
assert.ok(manifest.bytes < 768 * 1024);
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1);
new vm.Script(scripts[0][1]);
assert.doesNotMatch(html, /STATUS_APP_SCRIPT|<script\b[^>]*\bsrc\s*=|<link\b|<iframe\b|<img\b/i);
const inventory = JSON.parse(fs.readFileSync(new URL('bundled-dependencies.json', directory), 'utf8'));
const lock = JSON.parse(fs.readFileSync(new URL('package-lock.json', root), 'utf8'));
const notices = fs.readFileSync(new URL('THIRD_PARTY_NOTICES.md', directory), 'utf8');
assert.equal(inventory.schema, 'datasecure-status-app-dependencies/v1');
assert.equal(new Set(inventory.dependencies.map(d => d.name)).size, inventory.dependencies.length);
for (const item of inventory.dependencies) {
  const locked = lock.packages[`node_modules/${item.name}`];
  assert.equal(item.version, locked.version);
  assert.equal(item.integrity, locked.integrity);
  assert.match(item.license_sha256, /^[a-f0-9]{64}$/);
  assert.ok(notices.includes(`## ${item.name} ${item.version}`));
}
assert.ok(notices.includes('licensing transition'));
assert.ok(inventory.dependencies.some(d => d.name === '@modelcontextprotocol/ext-apps' && d.version === '1.7.5'));
assert.ok(!inventory.dependencies.some(d => ['axe-core', 'esbuild'].includes(d.name)));
console.log('Status artifact: hash/size, syntax/offline, exact inventory/licenses PASS');
if (process.argv.includes('--archives')) {
  const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
  const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
  const names = ['status-card.html', 'artifact.json', 'bundled-dependencies.json', 'THIRD_PARTY_NOTICES.md'];
  for (const archive of [`DataSecure-Privacy-Preflight-v${pkg.version}.zip`, `DataSecure-Privacy-Gateway-v${pkg.version}.mcpb`]) {
    const entries = readZip(fs.readFileSync(new URL(`dist/${archive}`, root)));
    for (const name of names) assert.ok(entries.get(`server/status-app/${name}`)?.equals(fs.readFileSync(new URL(name, directory))));
  }
  const sbom = JSON.parse(fs.readFileSync(new URL(`dist/DataSecure-Privacy-Preflight-v${pkg.version}.spdx.json`, root), 'utf8'));
  for (const item of inventory.dependencies) assert.ok(sbom.packages.some(p => p.name === item.name && p.versionInfo === item.version));
  for (const name of names) assert.ok(sbom.files.some(file => file.fileName.endsWith(`/status-app/${name}`)));
  console.log('Status artifact: both archive bytes and SPDX component inventory PASS');
}
