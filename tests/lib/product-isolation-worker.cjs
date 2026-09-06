'use strict';

// A process-local adapter over the unmodified projected product modules. The
// parent owns all paths and exchanges only synthetic fixture capabilities.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const server = path.resolve(process.argv[2]);
const channel = process.argv[3];
assert.ok(['plugin', 'standalone'].includes(channel));
assert.strictEqual(process.env.DATASECURE_PRODUCT_CHANNEL, channel);
if (channel === 'standalone') require(path.join(server, 'standalone/application-service')).activateStandaloneNamespace();
const { dataRoot, SafeError, convertDocument } = require(path.join(server, 'runtime'));
const { roots } = require(path.join(server, 'gateway/common'));
const batch = require(path.join(server, 'gateway/batch'));
const packages = require(path.join(server, 'gateway/package-store'));
let own;

async function dispatch(message) {
  if (message.action === 'offline') {
    const childProcess = require('node:child_process');
    const keys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'NODE_USE_ENV_PROXY'];
    const saved = new Map(keys.map(key => [key, process.env[key]]));
    for (const key of keys) process.env[key] = key === 'NODE_USE_ENV_PROXY' ? '1' :
      key === 'NO_PROXY' ? '' : `http://127.0.0.1:${message.targets.proxy}`;
    let stderr = '', launches = 0, launchedPid;
    const expected = 'synthetic offline parser content';
    try {
      const parsed = await convertDocument('synthetic-private-artifact', {
        inputBuffer: Buffer.from(expected), sourceName: 'synthetic.txt',
        spawn(command, args, options) {
          launches++;
          assert.strictEqual(command, path.join(server, 'native/windows-x64/datasecure-sandbox.exe'));
          assert.ok(args.includes(path.join(server, 'parser-worker.js')));
          assert.ok(args.includes('--permission'));
          assert.deepStrictEqual(options.env, {}, 'proxy and parent process settings must not reach the worker');
          const preload = `--require=${path.join(server, 'network-deny.cjs')}`;
          const index = args.indexOf(preload);
          assert.ok(index >= 0, 'real packaged network-deny must run first');
          const instrumented = [...args];
          instrumented.splice(index + 1, 0, `--require=${path.join(server, 'offline-canary.cjs')}`);
          // Only a test receipt is made observable. Native launcher, permission
          // flags, parser, stdin and stdout remain the actual product path.
          const child = childProcess.spawn(command, instrumented, { ...options, stdio: ['pipe', 'pipe', 'pipe'] });
          launchedPid = child.pid;
          child.stderr.on('data', bytes => { stderr += bytes; });
          return child;
        }
      });
      assert.strictEqual(launches, 1);
      assert.ok(launchedPid > 0);
      assert.strictEqual(parsed.markdown.trim(), expected);
      const reports = stderr.split(/\r?\n/u).filter(line => line.startsWith('PACKAGED_NETWORK_CANARY:'));
      assert.strictEqual(reports.length, 1, stderr);
      const report = JSON.parse(reports[0].slice('PACKAGED_NETWORK_CANARY:'.length));
      assert.strictEqual(report.active, true);
      assert.strictEqual(report.proxy_controls_absent, true);
      assert.deepStrictEqual(report.failures, []);
      assert.deepStrictEqual(report.denied, ['dns-lookup', 'dns-lookup-promises', 'dns-resolver',
        'dns-resolver-promises', 'tcp', 'tls', 'http', 'https', 'proxy', 'udp', 'fetch']);
      return { native_parser: true, canaries_denied: report.denied.length, proxy_controls_absent: true };
    } finally {
      for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  }
  if (message.action === 'start') {
    const marker = `synthetic-${channel}-business-content`;
    const source = path.join(process.env.EU_PRIVACY_RESULT_ROOT, 'synthetic.txt');
    const original = `${marker}\nE-Mail: ${channel}@example.invalid`;
    fs.writeFileSync(source, original, { flag: 'wx' });
    const stat = fs.lstatSync(source);
    const begun = batch.beginBatch({ expectedCount: 1, profile: 'general',
      queue: [{ name: 'synthetic.txt', full: source, stat, sourceBytes: stat.size }] });
    const result = await batch.processBatchNext(begun.batch_token);
    assert.strictEqual(result.ok, true, JSON.stringify(result));
    const body = packages.readOutput(result.package_id, result.read_capability, 0, 30000).text;
    assert.ok(body.includes(marker));
    assert.ok(!body.includes(`${channel}@example.invalid`));
    batch.acknowledgeDeliveredPackage(begun.batch_token, result.package_id);
    assert.strictEqual(fs.readFileSync(source, 'utf8'), original);
    assert.strictEqual(fs.lstatSync(source).ino, stat.ino);
    const state = batch._test.readState(begun.batch_token);
    assert.strictEqual(state.product_channel, channel);
    own = { token: begun.batch_token, package_id: result.package_id, read_capability: result.read_capability,
      dataRoot: dataRoot(), workspace: roots().root, output: roots().output,
      journal: path.join(batch._test.batchRoot(), `${begun.batch_token}.json`), marker };
    return own;
  }
  if (message.action === 'cross') {
    const foreign = message.foreign;
    assert.throws(() => batch._test.readState(foreign.token), SafeError);
    assert.throws(() => batch.readBatchProgress(foreign.token), SafeError);
    assert.throws(() => packages.readOutput(foreign.package_id, foreign.read_capability, 0, 30000), SafeError);
    assert.throws(() => packages.readOutput(own.package_id, foreign.read_capability, 0, 30000), SafeError);
    assert.throws(() => packages.readOutput(foreign.package_id, own.read_capability, 0, 30000), SafeError);
    assert.ok(!fs.existsSync(path.join(own.output, foreign.package_id)));
    assert.ok(packages.readOutput(own.package_id, own.read_capability, 0, 30000).text.includes(own.marker));
    assert.deepStrictEqual(fs.readdirSync(batch._test.batchRoot()).filter(name => /^[a-f0-9]{64}\.json$/u.test(name)),
      [`${own.token}.json`]);
    return { isolated: true };
  }
  if (message.action === 'copied-journal') {
    // No package/source access is necessary to reject a foreign product's
    // journal. Both normal and maintenance readers must stop at its purpose.
    const opened = [], originalOpen = fs.openSync;
    fs.openSync = function(file, ...args) { opened.push(path.resolve(file)); return originalOpen.call(this, file, ...args); };
    try {
      assert.throws(() => batch._test.readState(message.token), { code: 'BATCH_PRODUCT_CHANNEL_MISMATCH' });
      assert.throws(() => batch._test.readStateForMaintenance(message.token), { code: 'BATCH_PRODUCT_CHANNEL_MISMATCH' });
    } finally { fs.openSync = originalOpen; }
    assert.strictEqual(opened.length, 2);
    assert.ok(opened.every(file => file === path.join(batch._test.batchRoot(), `${message.token}.json`)),
      'only the copied journal may be opened before rejecting the foreign purpose');
    return { foreign_journal_rejected: true };
  }
  if (message.action === 'stop') {
    process.send({ id: message.id, ok: true }, () => process.disconnect());
    return null;
  }
  throw new Error('ISOLATION_ACTION_INVALID');
}
let chain = Promise.resolve();
process.on('message', message => {
  chain = chain.then(async () => {
    try {
      const result = await dispatch(message);
      if (result !== null) process.send({ id: message.id, ok: true, result });
    } catch (error) {
      process.send({ id: message.id, ok: false, error: String(error.stack) });
    }
  });
});
process.send({ ready: true, channel });
