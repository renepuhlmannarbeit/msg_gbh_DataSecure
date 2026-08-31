'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Raw-content network boundary');
const root = path.join(__dirname, '..');
const deny = path.join(root, 'plugins', 'data-secure', 'server', 'network-deny.cjs');
const probe = path.join(__dirname, 'helpers', 'network-probe.js');

function run(extra = []) {
  const result = childProcess.spawnSync(process.execPath, [
    ...extra, `--require=${deny}`, probe
  ], { encoding: 'utf8', env: {}, windowsHide: true, timeout: 10_000 });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.deepStrictEqual(JSON.parse(result.stdout), { active: true, failures: [] });
}

test('preload denies DNS resolvers, HTTP(S), TCP/TLS, UDP, HTTP/2, fetch, WebSocket and listeners', () => {
  run();
});

test('parser permission process keeps the network deny preload active', () => {
  run(['--permission', `--allow-fs-read=${root}`]);
});

test('parser and fixed background roles launch the packaged guard before private code', () => {
  const runtime = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'runtime.js'), 'utf8');
  const supervisor = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'companion', 'supervisor.js'), 'utf8');
  const batchExecutor = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'gateway', 'batch-executor.js'), 'utf8');
  const launcher = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'background-role-launcher.js'), 'utf8');
  for (const source of [runtime, launcher]) {
    assert.match(source, /network-deny\.cjs/u);
    assert.match(source, /--require=/u);
  }
  assert.match(supervisor, /launchBackgroundRole\('companion'/u);
  assert.equal((batchExecutor.match(/launchBackgroundRole\('batch'/gu) || []).length, 2);
  assert.equal((batchExecutor.match(/launchBackgroundRole\('review'/gu) || []).length, 1);
  // A new direct spawn/fork here would bypass the single guarded role starter.
  assert.doesNotMatch(batchExecutor, /\bforkProcess\s*\(|\bfork\s*\(|\bspawn\s*\(/u);
  const bootstrap = fs.readFileSync(path.join(root, 'native', 'sea', 'bootstrap.cjs'), 'utf8');
  assert.ok(bootstrap.indexOf("localRequire('./network-deny.cjs')") < bootstrap.indexOf('localRequire(selected)'));
  assert.match(bootstrap, /__DATASECURE_NETWORK_DENY_ACTIVE__/u);
});

test('the persistent batch worker strips proxy, Node and cloud credential controls', () => {
  const { batchWorkerEnvironment } = require('../plugins/data-secure/server/gateway/batch-executor');
  const clean = batchWorkerEnvironment({
    SystemRoot: 'C:\\Windows',
    LOCALAPPDATA: 'C:\\Local',
    EU_PRIVACY_ROOT: 'C:\\Privacy',
    HTTPS_PROXY: 'https://proxy.invalid',
    NODE_OPTIONS: '--inspect=0.0.0.0:9229',
    AWS_SECRET_ACCESS_KEY: 'secret',
    OPENAI_API_KEY: 'secret'
  });
  assert.deepStrictEqual({ ...clean }, {
    SystemRoot: 'C:\\Windows',
    LOCALAPPDATA: 'C:\\Local',
    EU_PRIVACY_ROOT: 'C:\\Privacy'
  });
});

done();
