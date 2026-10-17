'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { createSuite } = require('./helpers');

const { testAsync, assert, done } = createSuite('Batch worker queue rejection');

async function main() {
  for (const scenario of [
    { name: 'false review flag', flag: false, channel: 'standalone' },
    { name: 'string review flag', flag: 'true', channel: 'standalone' },
    { name: 'plugin cannot opt into standalone review', flag: true, channel: 'plugin' },
    { name: 'unconnected content is denied before acceptance', flag: true, channel: 'standalone',
      extra: { content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false } }, error: 'CONTENT_OPTIONS_NOT_READY' },
    { name: 'explicit null is not a legacy intake', flag: true, channel: 'standalone',
      extra: { content_options: null }, error: 'CONTENT_OPTIONS_INVALID' },
    { name: 'wrong alias cannot silently start legacy extraction', flag: true, channel: 'standalone',
      extra: { contentOptions: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false } }, error: 'CONTENT_OPTIONS_INVALID' },
    { name: 'resume options are rejected before reading a nonexistent journal', flag: true, channel: 'standalone',
      extra: { type: 'start-local-batch', content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false } }, error: 'CONTENT_OPTIONS_FORBIDDEN' },
    { name: 'plugin cannot carry a standalone content contract', flag: true, channel: 'plugin',
      extra: { content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false } }, error: 'CONTENT_OPTIONS_FORBIDDEN' },
    { name: 'legacy intake cannot silently ignore automatic review policy', flag: true, channel: 'standalone',
      extra: { review_policy: 'automatic-conservative' }, error: 'STANDALONE_REVIEW_POLICY_INVALID' },
    { name: 'explicit null automatic review policy is rejected before intake acceptance', flag: true, channel: 'standalone',
      extra: { type: 'start-local-content-anonymize-intake', review_policy: null,
        content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false } },
      error: 'STANDALONE_REVIEW_POLICY_INVALID' },
    { name: 'Raw content worker cannot acquire automatic anonymization policy', flag: true, channel: 'standalone',
      extra: { type: 'start-local-content-markdown-intake', processing_mode: 'markdown-only', review_policy: 'automatic-conservative',
        content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false } },
      error: 'STANDALONE_REVIEW_POLICY_INVALID' },
    { name: 'resume review policy is rejected before reading a nonexistent journal', flag: true, channel: 'standalone',
      extra: { type: 'start-local-batch', review_policy: 'automatic-conservative' }, error: 'STANDALONE_REVIEW_POLICY_INVALID' }
  ]) await testAsync(scenario.name, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-worker-review-reject-'));
    const worker = path.join(__dirname, '../plugins/data-secure/server/gateway/batch-worker.js');
    const child = fork(worker, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
      env: { ...process.env, EU_PRIVACY_ROOT: path.join(root, 'workspace'), EU_PRIVACY_DATA_ROOT: path.join(root, 'data'),
        LOCALAPPDATA: path.join(root, 'localapp'), DATASECURE_PRODUCT_CHANNEL: scenario.channel } });
    const messages = [];
    child.on('message', message => messages.push(message));
    const exited = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(Error('worker rejection timeout')); }, 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); resolve(code); });
    });
    child.send({ type: 'start-local-intake', batch_token: 'a'.repeat(64), intake_reservation_id: 'b'.repeat(64),
      processing_mode: 'markdown-and-anonymize', document_review: scenario.flag,
      queue: [{ full: path.join(root, 'private.txt'), name: 'private.txt', sourceBytes: 12 }], ...scenario.extra });
    assert.equal(await exited, 2);
    assert.deepEqual(messages, [{ type: scenario.extra?.type === 'start-local-batch' ? 'local-batch-rejected' : 'local-intake-rejected',
      error_code: scenario.error || 'DOCUMENT_REVIEW_INVALID' }]);
    assert.ok(!fs.existsSync(path.join(root, 'workspace')), 'Invalid review opt-in must not reach source intake');
    // No actual source or durable batch was created. Preserve unexpected files.
    if (fs.readdirSync(root).length === 0) fs.rmdirSync(root);
  });
  for (const [field, value, error] of [['content_options', {
    schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false
  }, 'CONTENT_OPTIONS_FORBIDDEN'], ['content_options', null, 'CONTENT_OPTIONS_INVALID'],
    ['contentOptions', {}, 'CONTENT_OPTIONS_INVALID']])
    await testAsync(`actual review worker rejects ${field}/${error} without ACK or journal`, async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-review-content-reject-'));
      const child = fork(path.join(__dirname, '../plugins/data-secure/server/gateway/review-worker.js'), [], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
        env: { ...process.env, EU_PRIVACY_ROOT: path.join(root, 'workspace'), EU_PRIVACY_DATA_ROOT: path.join(root, 'data'),
          LOCALAPPDATA: path.join(root, 'localapp'), DATASECURE_PRODUCT_CHANNEL: 'standalone' }
      });
      const messages = []; child.on('message', message => messages.push(message));
      const exited = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(Error('review worker rejection timeout')); }, 10000);
        child.once('error', cause => { clearTimeout(timer); reject(cause); });
        child.once('exit', code => { clearTimeout(timer); resolve(code); });
      });
      child.send({ type: 'start-local-review', batch_token: 'a'.repeat(64), [field]: value });
      assert.equal(await exited, 2);
      assert.deepEqual(messages, [{ type: 'local-review-rejected', error_code: error }]);
      assert.ok(!fs.existsSync(path.join(root, 'workspace')));
      if (fs.readdirSync(root).length === 0) fs.rmdirSync(root);
    });
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
