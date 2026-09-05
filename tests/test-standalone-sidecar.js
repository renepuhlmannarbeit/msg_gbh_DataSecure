'use strict';

const assert = require('node:assert');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { encodeFrame } = require('../plugins/data-secure/server/standalone/desktop-ipc');

function protocolClient(child) {
  let buffer = Buffer.alloc(0);
  let stderr = '';
  const pending = new Map();
  const failAll = (error) => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
    pending.clear();
  };
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
  child.once('exit', (code) => failAll(new Error(`sidecar exited ${code}: ${stderr}`)));
  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32BE(0);
      if (length < 2 || length > 1024 * 1024) return failAll(new Error('sidecar frame invalid'));
      if (buffer.length < length + 4) return;
      let value;
      try { value = JSON.parse(buffer.subarray(4, length + 4).toString('utf8')); }
      catch (error) { return failAll(error); }
      buffer = buffer.subarray(length + 4);
      const waiter = pending.get(value.request_id);
      if (!waiter) return failAll(new Error('unexpected sidecar response'));
      pending.delete(value.request_id);
      clearTimeout(waiter.timer);
      waiter.resolve(value);
    }
  });
  return {
    send(action, id, fields = {}) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`sidecar response timeout: ${stderr}`));
        }, 60000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(encodeFrame({
          schema: 'datasecure-standalone-private-ipc/1', request_id: id, action, ...fields
        }));
      });
    }
  };
}

(async () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'datasecure-standalone-ipc-'));
  const diagnostics = path.join(root, 'diagnostics');
  const sourceDirectory = path.join(root, 'sources');
  const sourceFile = path.join(sourceDirectory, 'profil.txt');
  fs.mkdirSync(sourceDirectory);
  fs.writeFileSync(sourceFile, 'Erika Muster, erika@example.org');
  const child = childProcess.spawn(process.execPath,
    [path.join(__dirname, '../plugins/data-secure/server/standalone/desktop-sidecar.js')], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: { ...process.env, LOCALAPPDATA: root, DATASECURE_PRODUCT_CHANNEL: 'standalone',
        DATASECURE_STANDALONE_DIAGNOSTIC_SESSION: 'a'.repeat(32),
        DATASECURE_STANDALONE_DIAGNOSTIC_DIR: diagnostics }
    });
  let blockedChild;
  try {
    const client = protocolClient(child);
    const status = await client.send('get_public_state', 'a'.repeat(16));
    assert.strictEqual(status.schema, 'datasecure-standalone-private-response/1');
    assert.strictEqual(status.ok, true);
    assert.strictEqual(status.result.product_channel, 'standalone');
    assert.strictEqual(status.result.external_disclosure, false);
    assert.doesNotMatch(JSON.stringify(status), /source_path|raw_content|mapping/u);
    const admitted = await client.send('admit_selected_sources', 'b'.repeat(16), {
      source_kind: 'files', source_paths: [sourceFile]
    });
    assert.strictEqual(admitted.ok, true);
    assert.deepStrictEqual(admitted.result.ui_context.selected_files, ['profil.txt']);
    const context = await client.send('get_ui_context', 'c'.repeat(16));
    assert.strictEqual(context.ok, true);
    assert.deepStrictEqual(context.result.selected_files, ['profil.txt']);
    const cancelled = await client.send('cancel_admission', 'd'.repeat(16));
    assert.strictEqual(cancelled.ok, true);
    const stopped = await client.send('shutdown', 'e'.repeat(16));
    assert.strictEqual(stopped.ok, true);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('sidecar did not stop')), 5000);
      child.once('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`sidecar exit ${code}`)); });
    });

    const blockedBase = path.join(root, 'blocked-root');
    fs.mkdirSync(blockedBase);
    fs.writeFileSync(path.join(blockedBase, 'SecureDataMsg-Standalone'), 'not a directory');
    blockedChild = childProcess.spawn(process.execPath,
      [path.join(__dirname, '../plugins/data-secure/server/standalone/desktop-sidecar.js')], {
        stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
        env: { ...process.env, LOCALAPPDATA: blockedBase, DATASECURE_PRODUCT_CHANNEL: 'standalone',
          DATASECURE_STANDALONE_DIAGNOSTIC_SESSION: 'invalid session',
          DATASECURE_STANDALONE_DIAGNOSTIC_DIR: diagnostics }
      });
    const blockedClient = protocolClient(blockedChild);
    const blocked = await blockedClient.send('get_public_state', 'f'.repeat(16));
    assert.strictEqual(blocked.ok, false);
    assert.strictEqual(blocked.error_code, 'STANDALONE_DATA_ROOT_UNSAFE');
    const blockedStopped = await blockedClient.send('shutdown', '0'.repeat(16));
    assert.strictEqual(blockedStopped.ok, true);
    await new Promise((resolve) => blockedChild.once('exit', resolve));
    const interactionLog = fs.readFileSync(path.join(diagnostics, 'sidecar-interactions.jsonl'), 'utf8');
    const events = interactionLog.trim().split(/\r?\n/u).map((line) => JSON.parse(line));
    assert.ok(events.some((event) => event.event === 'service_initialized'));
    assert.ok(events.some((event) => event.event === 'request_received' && event.action === 'get_public_state'));
    assert.ok(events.some((event) => event.session_id === 'a'.repeat(32)));
    assert.ok(!events.some((event) => event.session_id === 'invalid session'));
    assert.doesNotMatch(interactionLog, /source_paths|source_path|selected_files|raw_content|mapping|request_id/iu);
    process.stdout.write('✓ standalone sidecar exchanges bounded content-free frames\n');
  } finally {
    if (child.exitCode === null) child.kill();
    if (blockedChild?.exitCode === null) blockedChild.kill();
    const stat = fs.lstatSync(root);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
    fs.rmSync(root, { recursive: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
