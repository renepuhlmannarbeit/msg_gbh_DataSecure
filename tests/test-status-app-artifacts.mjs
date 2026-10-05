import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { writeBoundArtifact } from '../scripts/lib/bound-artifact-writer.mjs';
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
const fixture = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'datasecure-bound-build-'));
try {
  const output = path.join(fixture, 'artifact.html');
  const foreign = path.join(fixture, 'foreign.txt');
  writeBoundArtifact(output, 'old artifact bytes');
  writeBoundArtifact(output, 'new');
  assert.equal(fs.readFileSync(output, 'utf8'), 'new', 'successful rewrite truncates only the bound original');
  fs.writeFileSync(foreign, 'FOREIGN MUST SURVIVE');
  const link = path.join(fixture, 'hardlink.html');
  fs.linkSync(foreign, link);
  assert.throws(() => writeBoundArtifact(link, 'unsafe'), { code: 'BUILD_ARTIFACT_UNSAFE' });
  assert.equal(fs.readFileSync(foreign, 'utf8'), 'FOREIGN MUST SURVIVE');
  let swapped = false;
  const racingIo = Object.create(fs);
  racingIo.openSync = (target, ...args) => {
    if (target === output) {
      fs.renameSync(output, path.join(fixture, 'original.html'));
      fs.copyFileSync(foreign, output);
      swapped = true;
    }
    return fs.openSync(target, ...args);
  };
  assert.throws(() => writeBoundArtifact(output, 'unsafe', { io: racingIo }), { code: 'BUILD_ARTIFACT_UNSAFE' });
  assert.equal(swapped, true);
  assert.equal(fs.readFileSync(output, 'utf8'), 'FOREIGN MUST SURVIVE', 'raced foreign leaf must not be truncated');
  assert.equal(fs.readFileSync(path.join(fixture, 'original.html'), 'utf8'), 'new');
  const shortIo = Object.create(fs);
  shortIo.writeSync = (fd, bytes, offset, length, position) => fs.writeSync(fd, bytes, offset, Math.min(length, 2), position);
  writeBoundArtifact(path.join(fixture, 'short.html'), 'short writes still complete', { io: shortIo });
  assert.equal(fs.readFileSync(path.join(fixture, 'short.html'), 'utf8'), 'short writes still complete');
  let actualFd, closed = 0;
  const zeroIo = Object.create(fs);
  zeroIo.openSync = (...args) => { actualFd = fs.openSync(...args); return 0; };
  for (const method of ['fstatSync', 'ftruncateSync', 'writeSync', 'fsyncSync']) zeroIo[method] = (fd, ...args) => {
    assert.equal(fd, 0); return fs[method](actualFd, ...args);
  };
  zeroIo.closeSync = fd => { assert.equal(fd, 0); closed++; fs.closeSync(actualFd); };
  writeBoundArtifact(path.join(fixture, 'zero.html'), 'descriptor zero', { io: zeroIo });
  assert.equal(closed, 1);
  assert.equal(fs.readFileSync(path.join(fixture, 'zero.html'), 'utf8'), 'descriptor zero');
  const linkedDirectory = path.join(fixture, 'redirect');
  fs.symlinkSync(fixture, linkedDirectory, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    assert.throws(() => writeBoundArtifact(path.join(linkedDirectory, 'foreign.txt'), 'unsafe'), { code: 'BUILD_ARTIFACT_UNSAFE' });
    assert.equal(fs.readFileSync(foreign, 'utf8'), 'FOREIGN MUST SURVIVE');
  } finally { fs.unlinkSync(linkedDirectory); }
  console.log('Status artifact writer: bound rewrite, hardlink/swap/ancestor rejection, short writes and FD 0 PASS');
} finally {
  assert.equal(path.dirname(fixture), fs.realpathSync(os.tmpdir()));
  assert.ok(fs.lstatSync(fixture).isDirectory() && !fs.lstatSync(fixture).isSymbolicLink());
  for (const name of fs.readdirSync(fixture)) {
    const leaf = path.join(fixture, name);
    assert.ok(fs.lstatSync(leaf).isFile() && !fs.lstatSync(leaf).isSymbolicLink());
    fs.unlinkSync(leaf);
  }
  fs.rmdirSync(fixture);
}
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
