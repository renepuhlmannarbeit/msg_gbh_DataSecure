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
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length, 1);
assert.equal([...`${html}<SCRIPT>throw new Error('counterexample')</SCRIPT>`.matchAll(/<script>([\s\S]*?)<\/script>/gi)].length, 2);
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
if (process.argv.includes('--archives') || process.argv.includes('--engineering-archives') || process.argv.includes('--archive')) {
  const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
  const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
  const names = ['status-card.html', 'artifact.json', 'bundled-dependencies.json', 'THIRD_PARTY_NOTICES.md'];
  const archives = [];
  for (let index = 0; index < process.argv.length; index++) {
    if (process.argv[index] !== '--archive') continue;
    const value = process.argv[++index];
    if (!value) throw new Error('STATUS_ARCHIVE_ARGUMENT_MISSING');
    archives.push(value.replaceAll('\\', '/').split('/').at(-1));
  }
  if (!archives.length && process.argv.includes('--archives')) {
    const host = process.platform === 'win32' && process.arch === 'x64' ? 'windows-x64'
      : process.platform === 'darwin' && process.arch === 'x64' ? 'macos-x64'
        : process.platform === 'darwin' && process.arch === 'arm64' ? 'macos-arm64' : null;
    if (!host) throw new Error('STATUS_ARCHIVE_HOST_UNSUPPORTED');
    archives.push(`DataSecure-Privacy-Preflight-${host}-v${pkg.version}.zip`);
  }
  if (process.argv.includes('--engineering-archives')) {
    archives.push(`DataSecure-Privacy-Gateway-v${pkg.version}.mcpb`);
  }
  for (const archive of archives) {
    const entries = readZip(fs.readFileSync(new URL(`dist/${archive}`, root)));
    for (const name of names) assert.ok(entries.get(`server/status-app/${name}`)?.equals(fs.readFileSync(new URL(name, directory))));
  }
  const sbom = JSON.parse(fs.readFileSync(new URL(`dist/DataSecure-Privacy-Preflight-v${pkg.version}.spdx.json`, root), 'utf8'));
  for (const item of inventory.dependencies) assert.ok(sbom.packages.some(p => p.name === item.name && p.versionInfo === item.version));
  for (const name of names) assert.ok(sbom.files.some(file => file.fileName.endsWith(`/status-app/${name}`)));
  console.log(`Status artifact: ${archives.length} archive(s) and SPDX component inventory PASS`);
}
