'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { createSuite } = require('./helpers');

const { testAsync, assert, done } = createSuite('Batch worker queue rejection');

// Test-local ownership only. No product policy or shared lifecycle API changes.
const owned = [];
let failed = false, primary, blocked = false;
const remember = value => { if (!failed) { failed = true; primary = value; } };
async function closeWithin(promise) {
  let timer;
  try {
    await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('QRF_CHILD_CLOSE_TIMEOUT')), 1000);
    })]);
  } finally { clearTimeout(timer); }
}

async function refusalCase(name, { prefix, worker, options, request, verify, removeTree = false,
  timeout = 'worker rejection timeout' }) {
  if (blocked) throw primary;
  await testAsync(name, async () => {
    let root, record, timer, caseFailed = false, casePrimary, wake;
    const fault = new Promise(resolve => { wake = resolve; });
    const fail = value => {
      if (!caseFailed) { caseFailed = true; casePrimary = value; remember(value); wake(); }
    };
    try {
      root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
      timer = setTimeout(() => fail(Error(timeout)), 10000);
      const child = fork(worker, [], options(root));
      let close, exit, spawn;
      record = { child, closed: false, spawned: false,
        close: new Promise(resolve => { close = resolve; }),
        exit: new Promise(resolve => { exit = resolve; }),
        spawn: new Promise(resolve => { spawn = resolve; }) };
      owned.push(record);
      // These observers precede pipe/setup/send access, including null stdio
      // on a returned failed-spawn handle. Error does not fulfill close.
      child.on('error', fail);
      child.once('close', (code, signal) => {
        record.closed = true; record.end = { code, signal }; close();
      });
      child.once('exit', code => { record.exitCode = code; exit(); });
      child.once('spawn', () => { record.spawned = true; spawn(); });
      record.stop = child.kill.bind(child);
      const messages = [];
      let stdout = '', stderr = '';
      child.on('message', message => messages.push(message));
      for (const [pipe, append] of [[child.stdout, chunk => { stdout += chunk; }],
        [child.stderr, chunk => { stderr += chunk; }]]) {
        if (pipe) {
          pipe.on('error', fail);
          pipe.on('data', chunk => { try { append(chunk); } catch (value) { fail(value); } });
        }
      }
      await Promise.race([record.spawn, record.close, fault]);
      if (caseFailed) throw casePrimary;
      assert.ok(record.spawned, 'QRF_SPAWN_NOT_OBSERVED');
      // Missing pipes after successful spawn are a contract error. Before spawn,
      // await the actual error instead of manufacturing a null-stdio TypeError.
      if (removeTree) assert.ok(child.stdout && child.stderr, 'QRF_PIPE_CONTRACT');
      assert.ok(typeof child.send === 'function' && child.connected, 'QRF_IPC_CONTRACT');
      let sent;
      const send = new Promise(resolve => { sent = resolve; });
      child.send(request(root), cause => {
        if (cause !== null && cause !== undefined) fail(cause);
        sent();
      });
      await Promise.race([Promise.all([record.exit, record.close, send]), fault]);
      if (caseFailed) throw casePrimary;
      assert.equal(record.end.code, record.exitCode);
      assert.equal(record.end.signal, null);
      verify({ root, messages, stdout, stderr, exitCode: record.exitCode });
    } catch (value) { fail(value); }
    finally {
      clearTimeout(timer);
      for (const signal of ['SIGTERM', 'SIGKILL']) {
        if (!record || record.closed) break;
        try { if (!record.stop(signal)) fail(Error('QRF_STOP_NOT_SENT')); }
        catch (value) { fail(value); }
        try { await closeWithin(record.close); } catch (value) { fail(value); }
      }
      if (record && !record.closed) {
        blocked = true;
        fail(Error('QRF_CHILD_CLOSE_UNCONFIRMED'));
      }
      // Failed evidence is retained even after a later direct close. A close
      // or successful stop request never grants a general writer-join claim.
      if (!caseFailed && !failed && root !== undefined && (!record || record.closed)) {
        try {
          if (removeTree) fs.rmSync(root, { recursive: true, force: true });
          else if (fs.readdirSync(root).length === 0) fs.rmdirSync(root);
        } catch (value) { fail(value); }
      }
    }
    if (caseFailed) throw casePrimary;
  });
  // testAsync records rather than rethrows. Unknown-child verdict is sticky,
  // so no later fixture may be launched after its finite cleanup failed.
  if (blocked) throw primary;
}

async function main() {
  try {
    await require('./lib/batch-worker-queue-lifecycle-cases.cjs')(__filename);
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
  ]) await refusalCase(scenario.name, {
    prefix: 'datasecure-worker-review-reject-',
    worker: path.join(__dirname, '../plugins/data-secure/server/gateway/batch-worker.js'),
    options: root => ({ stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
      env: { ...process.env, EU_PRIVACY_ROOT: path.join(root, 'workspace'), EU_PRIVACY_DATA_ROOT: path.join(root, 'data'),
        LOCALAPPDATA: path.join(root, 'localapp'), DATASECURE_PRODUCT_CHANNEL: scenario.channel } }),
    request: root => ({ type: 'start-local-intake', batch_token: 'a'.repeat(64), intake_reservation_id: 'b'.repeat(64),
      processing_mode: 'markdown-and-anonymize', document_review: scenario.flag,
      queue: [{ full: path.join(root, 'private.txt'), name: 'private.txt', sourceBytes: 12 }], ...scenario.extra }),
    verify({ root, messages, exitCode }) {
      assert.equal(exitCode, 2);
      assert.deepEqual(messages, [{ type: scenario.extra?.type === 'start-local-batch' ? 'local-batch-rejected' : 'local-intake-rejected',
        error_code: scenario.error || 'DOCUMENT_REVIEW_INVALID' }]);
      assert.ok(!fs.existsSync(path.join(root, 'workspace')), 'Invalid review opt-in must not reach source intake');
      // No actual source or durable batch was created. Preserve unexpected files.
    }
  });
  for (const [field, value, error] of [['content_options', {
    schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false
  }, 'CONTENT_OPTIONS_FORBIDDEN'], ['content_options', null, 'CONTENT_OPTIONS_INVALID'],
    ['contentOptions', {}, 'CONTENT_OPTIONS_INVALID']])
    await refusalCase(`actual review worker rejects ${field}/${error} without ACK or journal`, {
      prefix: 'datasecure-review-content-reject-',
      worker: path.join(__dirname, '../plugins/data-secure/server/gateway/review-worker.js'),
      timeout: 'review worker rejection timeout',
      options: root => ({ stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
        env: { ...process.env, EU_PRIVACY_ROOT: path.join(root, 'workspace'), EU_PRIVACY_DATA_ROOT: path.join(root, 'data'),
          LOCALAPPDATA: path.join(root, 'localapp'), DATASECURE_PRODUCT_CHANNEL: 'standalone' } }),
      request: () => ({ type: 'start-local-review', batch_token: 'a'.repeat(64), [field]: value }),
      verify({ root, messages, exitCode }) {
        assert.equal(exitCode, 2);
        assert.deepEqual(messages, [{ type: 'local-review-rejected', error_code: error }]);
        assert.ok(!fs.existsSync(path.join(root, 'workspace')));
      }
    });
  await refusalCase('the detached worker rejects a malformed queue before its acceptance envelope', {
    prefix: 'datasecure-worker-envelope-', removeTree: true,
    worker: path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'gateway', 'batch-worker.js'),
    options: root => ({ stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
      env: { ...process.env, EU_PRIVACY_ROOT: path.join(root, 'workspace'), LOCALAPPDATA: path.join(root, 'localapp') } }),
    request: root => ({
      type: 'start-local-intake', batch_token: 'a'.repeat(64), intake_reservation_id: 'b'.repeat(64),
      profile: 'auto', queue: [{ sourcePath: path.join(root, 'private.txt'), sourceBytes: 12 }]
    }),
    verify({ messages, stdout, stderr, exitCode }) {
      assert.strictEqual(exitCode, 2);
      assert.deepStrictEqual(messages, [{ type: 'local-intake-rejected', error_code: 'LOCAL_QUEUE_SCHEMA_INVALID' }]);
      assert.ok(!messages.some((message) => message.type === 'local-intake-accepted'));
      assert.strictEqual(stdout, '');
      assert.strictEqual(stderr, '');
    }
  });
  } catch (value) { remember(value); }
  finally {
    try { await done(); } catch (value) { remember(value); }
  }
  if (failed) throw primary;
}

const completed = main();
completed.catch(error => {
  // Known case teardown attempts and suite reporting finished first. Force only
  // this standalone TEST CLI red; parent end is never a child/writer join.
  try { console.error(error); } catch {}
  try { fs.writeSync(2, 'QRF_TEST_CLI_FAILURE; evidence=RETAINED; own_teardown=ATTEMPTED; direct_child_close=' +
    (owned.length === 0 ? 'NONE_RETURNED' : owned.some(record => !record.closed) ? 'UNCONFIRMED' : 'OBSERVED') + '; writer_join=NOT_CLAIMED\n'); } catch {}
  process.exit(1);
});
