import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const zip = path.join(root, 'dist', `DataSecure-Standalone-${version}-windows-x64.zip`);
const extraction = fs.mkdtempSync(path.join(root, '.tmp-standalone-package-'));
const install = path.join(extraction, 'Leerzeichen ünicode');
const data = path.join(extraction, 'Daten');

function safeRemove() {
  const resolved = path.resolve(extraction);
  if (path.dirname(resolved) !== root || !path.basename(resolved).startsWith('.tmp-standalone-package-')) {
    throw new Error('STANDALONE_SMOKE_CLEANUP_UNSAFE');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function frame(value) {
  const payload = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length);
  return Buffer.concat([header, payload]);
}

function response(child, stderr) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timeout = setTimeout(() => reject(new Error(`STANDALONE_SMOKE_TIMEOUT:${stderr.value.slice(0, 500)}`)), 45000);
    child.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4 || buffer.length < 4 + buffer.readUInt32BE(0)) return;
      clearTimeout(timeout);
      resolve(JSON.parse(buffer.subarray(4, 4 + buffer.readUInt32BE(0))));
    });
    child.once('error', reject);
    child.once('exit', (code) => { if (code && buffer.length < 4) reject(new Error(`STANDALONE_SMOKE_EXIT:${code}`)); });
  });
}

let child;
let childClosed = false;
try {
  fs.mkdirSync(install, { recursive: true });
  const entries = readZip(fs.readFileSync(zip), { maxEntries: 500, maxUncompressed: 256 * 1024 * 1024 });
  const prefix = `DataSecure-Standalone-${version}-windows-x64/`;
  for (const [name, bytes] of entries) {
    assert.ok(name.startsWith(prefix));
    const relative = name.slice(prefix.length);
    assert.ok(relative && !relative.split('/').includes('..') && !path.isAbsolute(relative));
    const destination = path.join(install, ...relative.split('/'));
    assert.equal(path.relative(install, destination).startsWith('..'), false);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { flag: 'wx' });
  }
  fs.mkdirSync(data, { recursive: true });
  const runtime = path.join(install, 'datasecure-core-x86_64-pc-windows-msvc.exe');
  const sidecar = path.join(install, 'server', 'standalone', 'desktop-sidecar.js');
  const deny = path.join(install, 'server', 'network-deny.cjs');
  child = childProcess.spawn(runtime, [`--require=${deny}`, sidecar], {
    cwd: path.dirname(sidecar), windowsHide: true, shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec,
      USERPROFILE: data, LOCALAPPDATA: path.join(data, 'Local'), PATH: '' }
  });
  const stderr = { value: '' };
  child.stderr.on('data', (chunk) => { stderr.value += chunk.toString('utf8'); });
  child.stdin.write(frame({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(16), action: 'get_public_state' }));
  const status = await response(child, stderr);
  assert.equal(status.schema, 'datasecure-standalone-private-response/1');
  assert.equal(status.request_id, 'a'.repeat(16));
  assert.equal(status.ok, true);
  assert.equal(status.result.product_channel, 'standalone');
  child.stdin.write(frame({ schema: 'datasecure-standalone-private-ipc/1', request_id: 'b'.repeat(16), action: 'shutdown' }));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('STANDALONE_SMOKE_SHUTDOWN_TIMEOUT')); }, 10000);
    child.once('close', (code) => {
      childClosed = true;
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`STANDALONE_SMOKE_SHUTDOWN:${code}`));
    });
  });
  process.stdout.write('STANDALONE PACKAGE ISOLATED SIDECAR SMOKE PASS\n');
} finally {
  if (child && !childClosed && child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => child.once('close', () => { childClosed = true; resolve(); }));
  }
  safeRemove();
}
