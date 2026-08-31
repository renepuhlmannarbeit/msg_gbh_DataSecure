'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const childProcess = require('child_process');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Parser worker pre-import boundary');
const workerPath = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'parser-worker.js');
const workerSource = fs.readFileSync(workerPath, 'utf8');
const networkDeny = path.join(path.dirname(workerPath), 'network-deny.cjs');
const markerName = '__DATASECURE_NETWORK_DENY_ACTIVE__';
const scopes = ['fs.write', 'child', 'worker', 'addon', 'inspector', 'wasi'];
const failedResponse = { schema: 'data-secure-parser-result/1', ok: false, error: 'parse_failed' };
const activeMarker = { value: true, writable: false, configurable: false };

function runWorker({ permission = { has: () => false }, marker = activeMarker,
  fd = '0', extension = '.TXT', env = {} } = {}) {
  const events = [];
  let output = '';
  const fakeProcess = {
    argv: ['node', workerPath, extension, fd], permission, env,
    stdout: { write(text) { output += text; } }
  };
  const sandbox = {
    process: fakeProcess,
    require(name) {
      events.push(`require:${name}`);
      if (name === 'fs') return { readFileSync(sourceFd) {
        events.push(`read:${sourceFd}`);
        return Buffer.from('PARSER_BOUNDARY_CANARY');
      } };
      assert.strictEqual(name, './document-parser');
      return { parseDocumentBuffer(bytes, ext) {
        events.push(`parse:${ext}`);
        assert.strictEqual(bytes.toString('utf8'), 'PARSER_BOUNDARY_CANARY');
        return { markdown: 'parsed-canary' };
      } };
    }
  };
  if (marker !== null) Object.defineProperty(sandbox, markerName, marker);
  vm.runInNewContext(workerSource, sandbox, { timeout: 1000 });
  return { events, response: JSON.parse(output), exitCode: fakeProcess.exitCode };
}

function assertRejectedBeforeImport(options) {
  const result = runWorker(options);
  assert.deepStrictEqual(result.events, [], 'No module import or document read is allowed before the boundary');
  assert.deepStrictEqual(result.response, failedResponse);
  assert.strictEqual(result.exitCode, 2);
}

test('missing, malformed and throwing permission APIs fail before module import or input read', () => {
  for (const permission of [null, {}, { has: true }, { has() { throw new Error('unavailable'); } }]) {
    assertRejectedBeforeImport({ permission });
  }
  for (const value of [true, undefined, null, 0, 'false']) {
    assertRejectedBeforeImport({ permission: { has: () => value } });
  }
});

test('every forbidden permission individually blocks parser import and input read', () => {
  for (const forbidden of scopes) {
    assertRejectedBeforeImport({ permission: { has: (scope) => scope === forbidden } });
  }
});

test('missing, false, mutable and accessor network markers do not prove a loaded guard', () => {
  for (const marker of [null, { value: false }, { value: 'true' },
    { value: true, writable: true }, { value: true, configurable: true },
    { get() { throw new Error('marker getter must not be executed'); } }]) {
    assertRejectedBeforeImport({ marker });
  }
  assertRejectedBeforeImport({ marker: null, env: {
    DATASECURE_SELF_CONTAINED_RUNTIME: '1', DATASECURE_NETWORK_DENY_ACTIVE: '1',
    __DATASECURE_NETWORK_DENY_ACTIVE__: 'true'
  } });
});

test('a complete boundary preserves fd 0/fd 3 and extension normalization', () => {
  for (const fd of ['0', '3']) {
    const checked = [];
    const result = runWorker({ fd, permission: { has(scope) { checked.push(scope); return false; } } });
    assert.deepStrictEqual(checked, scopes);
    assert.deepStrictEqual(result.events, ['require:fs', 'require:./document-parser', `read:${fd}`, 'parse:.txt']);
    assert.strictEqual(result.exitCode, undefined);
    assert.deepStrictEqual(result.response, {
      schema: 'data-secure-parser-result/1', ok: true, result: { markdown: 'parsed-canary' }
    });
  }
});

test('invalid descriptors still fail before parser import and never become file paths', () => {
  for (const fd of ['1', '2', '4', '-1', 'NaN', 'private-document.txt']) {
    assertRejectedBeforeImport({ fd });
  }
});

function spawnWorker({ permission = true, guard = true, extraFlags = [] } = {}) {
  const flags = ['--no-warnings', '--disable-proto=throw', '--max-old-space-size=384'];
  if (permission) flags.push('--permission', `--allow-fs-read=${path.dirname(workerPath)}`);
  if (guard) flags.push(`--require=${networkDeny}`);
  const result = childProcess.spawnSync(process.execPath, [...flags, ...extraFlags, workerPath, '.txt', '0'], {
    input: Buffer.from('PARSER_BOUNDARY_CANARY'), encoding: 'utf8',
    env: {}, shell: false, windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024
  });
  assert.ifError(result.error);
  assert.strictEqual(result.signal, null);
  assert.strictEqual(result.stderr, '');
  return { status: result.status, response: JSON.parse(result.stdout) };
}

test('real Node worker parses stdin with the actual immutable network guard and permission model', () => {
  const result = spawnWorker();
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.response.schema, 'data-secure-parser-result/1');
  assert.strictEqual(result.response.ok, true);
  assert.ok(result.response.result.markdown.includes('PARSER_BOUNDARY_CANARY'));
  assert.deepStrictEqual(result.response.result.warnings, []);
});

test('real Node worker refuses absent permission or network preload', () => {
  for (const options of [{ permission: false }, { guard: false }]) {
    const result = spawnWorker(options);
    assert.strictEqual(result.status, 2);
    assert.deepStrictEqual(result.response, failedResponse);
  }
});

test('real Node worker refuses every available permissive flag, including native addons', () => {
  const flags = ['--allow-fs-write=*', '--allow-child-process', '--allow-worker', '--allow-addons', '--allow-wasi'];
  // Node 22 denies inspector under --permission without an allow flag; newer
  // Node versions expose --allow-inspector, which must also be rejected.
  if (process.allowedNodeEnvironmentFlags.has('--allow-inspector')) flags.push('--allow-inspector');
  for (const flag of flags) {
    const result = spawnWorker({ extraFlags: [flag] });
    assert.strictEqual(result.status, 2, flag);
    assert.deepStrictEqual(result.response, failedResponse, flag);
  }
});

done();
