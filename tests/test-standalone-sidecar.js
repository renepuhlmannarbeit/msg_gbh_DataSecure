'use strict';

const assert = require('node:assert');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { encodeFrame } = require('../plugins/data-secure/server/standalone/desktop-ipc');

function response(child) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    const timer = setTimeout(() => reject(new Error(`sidecar response timeout: ${stderr}`)), 60000);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`sidecar exited ${code}: ${stderr}`)); });
    child.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const length = buffer.readUInt32BE(0);
      if (buffer.length < length + 4) return;
      clearTimeout(timer);
      try { resolve(JSON.parse(buffer.subarray(4, length + 4).toString('utf8'))); }
      catch (error) { reject(error); }
    });
  });
}

function send(child, action, id) {
  const wait = response(child);
  child.stdin.write(encodeFrame({
    schema: 'datasecure-standalone-private-ipc/1', request_id: id, action
  }));
  return wait;
}

(async () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'datasecure-standalone-ipc-'));
  const child = childProcess.spawn(process.execPath,
    [path.join(__dirname, '../plugins/data-secure/server/standalone/desktop-sidecar.js')], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: { ...process.env, LOCALAPPDATA: root, DATASECURE_PRODUCT_CHANNEL: 'standalone' }
    });
  try {
    const status = await send(child, 'get_public_state', 'a'.repeat(16));
    assert.strictEqual(status.schema, 'datasecure-standalone-private-response/1');
    assert.strictEqual(status.ok, true);
    assert.strictEqual(status.result.product_channel, 'standalone');
    assert.strictEqual(status.result.external_disclosure, false);
    assert.doesNotMatch(JSON.stringify(status), /source_path|raw_content|mapping/u);
    const stopped = await send(child, 'shutdown', 'b'.repeat(16));
    assert.strictEqual(stopped.ok, true);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('sidecar did not stop')), 5000);
      child.once('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`sidecar exit ${code}`)); });
    });
    process.stdout.write('✓ standalone sidecar exchanges bounded content-free frames\n');
  } finally {
    if (child.exitCode === null) child.kill();
    const stat = fs.lstatSync(root);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
    fs.rmSync(root, { recursive: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
