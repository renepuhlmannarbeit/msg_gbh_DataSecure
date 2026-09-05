'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { createSuite } = require('./helpers');

const { testAsync, assert, done } = createSuite('Batch worker queue rejection');

async function main() {
  await testAsync('the detached worker rejects a malformed queue before its acceptance envelope', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-worker-envelope-'));
    const worker = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'gateway', 'batch-worker.js');
    const child = fork(worker, [], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
      env: {
        ...process.env,
        EU_PRIVACY_ROOT: path.join(root, 'workspace'),
        LOCALAPPDATA: path.join(root, 'localapp')
      }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const messages = [];
    child.on('message', (message) => messages.push(message));
    const exited = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { try { child.kill(); } catch {} reject(new Error('worker rejection timeout')); }, 10_000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); resolve(code); });
    });
    child.send({
      type: 'start-local-intake', batch_token: 'a'.repeat(64), intake_reservation_id: 'b'.repeat(64),
      profile: 'auto', queue: [{ sourcePath: path.join(root, 'private.txt'), sourceBytes: 12 }]
    });
    assert.strictEqual(await exited, 2);
    assert.deepStrictEqual(messages, [{ type: 'local-intake-rejected', error_code: 'LOCAL_QUEUE_SCHEMA_INVALID' }]);
    assert.ok(!messages.some((message) => message.type === 'local-intake-accepted'));
    assert.strictEqual(stdout, '');
    assert.strictEqual(stderr, '');
    fs.rmSync(root, { recursive: true, force: true });
  });
  done();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
