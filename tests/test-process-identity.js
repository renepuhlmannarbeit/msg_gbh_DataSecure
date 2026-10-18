'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createSuite } = require('./helpers');
const { processInstanceIdentity, requireProcessInstanceIdentity, ERROR_CODES, processInstanceState, _test } = require('../plugins/data-secure/server/gateway/process-identity');

const { test, assert, done } = createSuite('Process instance identity');

test('Linux identity binds boot identity and process start ticks, not PID alone', () => {
  const files = new Map([
    ['/proc/42/stat', '42 (worker name) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 987654 20\n'],
    ['/proc/sys/kernel/random/boot_id', '12345678-1234-1234-1234-123456789abc\n']
  ]);
  const io = { readFileSync(name) { return files.get(name); } };
  const first = _test.linuxBirth(42, io);
  files.set('/proc/42/stat', '42 (worker name) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 987655 20\n');
  const second = _test.linuxBirth(42, io);
  assert.match(first, /^[a-f0-9]{64}$/u);
  assert.notStrictEqual(first, second);
});

test('Windows and macOS adapters accept only bounded exact start metadata', () => {
  const win = _test.windowsBirth(42, (executable, arguments_, options) => {
    assert.ok(executable.endsWith('datasecure-sandbox.exe'));
    assert.deepEqual(arguments_, ['--process-birth', '42']);
    assert.equal(options.timeout, 2000);
    assert.equal(options.maxBuffer, 128);
    assert.deepEqual(options.env, {});
    return { status: 0, stdout: '638999999999999999' };
  }, () => true);
  const mac = _test.macosBirth(42, (file, args, options) => {
    assert.equal(file, '/bin/ps'); assert.deepEqual(args, ['-p', '42', '-o', 'lstart=']);
    assert.equal(options.shell, false); assert.equal(options.timeout, 2000); assert.equal(options.maxBuffer, 256);
    assert.deepEqual(options.env, { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' });
    return { status: 0, stdout: 'Fri Sep  5 12:34:56 2026\n' };
  });
  assert.match(win, /^[a-f0-9]{64}$/u);
  assert.match(mac, /^[a-f0-9]{64}$/u);
  assert.throws(() => _test.windowsBirth(42, () => ({ status: 0, stdout: 'ticks\nprivate' }), () => true),
    { code: 'PROCESS_IDENTITY_OUTPUT_INVALID' });
  assert.throws(() => _test.windowsBirth(42, () => ({ status: 0, stdout: '638999999999999999' }),
    () => { throw new Error('unverified'); }), /unverified/u);
  assert.throws(() => _test.macosBirth(42, () => ({ status: 0, stdout: '/private/path' })),
    { code: 'PROCESS_IDENTITY_OUTPUT_INVALID' });
});

test('claims keep closed OS failure causes on both adapters; observers remain unknown and never log content', () => {
  for (const platform of ['darwin', 'win32']) for (const [result, code] of [
    [{ status: null, error: { code: 'EACCES', message: '/PRIVATE/blocked' } }, 'PROCESS_IDENTITY_ACCESS_DENIED'],
    [{ status: null, error: { code: 'EPERM' } }, 'PROCESS_IDENTITY_ACCESS_DENIED'],
    [{ status: null, error: { code: 'ENOENT' } }, 'PROCESS_IDENTITY_TOOL_MISSING'],
    [{ status: null, error: { code: 'ETIMEDOUT' } }, 'PROCESS_IDENTITY_TIMEOUT'],
    [{ status: null, error: { code: 'ENOBUFS' } }, 'PROCESS_IDENTITY_OUTPUT_INVALID'],
    [{ status: 0, stdout: '/PRIVATE/customer', stderr: '/PRIVATE/vendor' }, 'PROCESS_IDENTITY_OUTPUT_INVALID'],
    [{ status: 1, stderr: 'operation not permitted /PRIVATE' }, 'PROCESS_IDENTITY_PROBE_FAILED'],
    [{ status: null, signal: 'SIGTRAP' }, 'PROCESS_IDENTITY_PROBE_FAILED'],
    [{ status: 0, error: { code: 'VENDOR_PRIVATE' }, stdout: 'Fri Sep  5 12:34:56 2026' }, 'PROCESS_IDENTITY_PROBE_FAILED']
  ]) {
    const options = { platform, processAlive: () => true, verifyArtifact: () => true, spawnSync: () => result };
    assert.throws(() => requireProcessInstanceIdentity(4242, options), error => {
      assert.equal(error.code, code); assert.ok(ERROR_CODES.includes(error.code));
      assert.equal(error.message, code); assert.doesNotMatch(error.stack, /\/PRIVATE/u); return true;
    });
    assert.equal(processInstanceIdentity(4242, options), null);
    assert.equal(processInstanceState(4242, 'a'.repeat(64), { processAlive: () => true,
      processInstanceIdentity: pid => processInstanceIdentity(pid, options) }), 'unknown');
  }
});

test('thrown OS errors are classified without reading arbitrary error messages or code getters', () => {
  let reads = 0;
  const privateError = { get code() { reads++; return 'EACCES'; }, get message() { reads++; return '/PRIVATE'; } };
  const base = { platform: 'darwin', processAlive: () => true };
  assert.throws(() => requireProcessInstanceIdentity(4242, { ...base, spawnSync: () => { throw privateError; } }),
    { code: 'PROCESS_IDENTITY_PROBE_FAILED' });
  assert.equal(reads, 0);
  assert.throws(() => requireProcessInstanceIdentity(4242, { ...base,
    spawnSync: () => { throw Object.assign(Error('/PRIVATE'), { code: 'EACCES' }); } }),
  { code: 'PROCESS_IDENTITY_ACCESS_DENIED' });
});

test('failed probes never poison the own-process success cache or invent a fallback identity', () => {
  let calls = 0;
  const options = { platform: 'darwin', currentPid: 4243, processAlive: () => true, spawnSync: () => {
    calls++; return calls === 1 ? { status: null, error: { code: 'ETIMEDOUT' } } :
      { status: 0, stdout: 'Fri Sep  5 12:34:56 2026\n' };
  } };
  assert.equal(processInstanceIdentity(4243, options), null);
  const identity = requireProcessInstanceIdentity(4243, options);
  assert.match(identity, /^[a-f0-9]{64}$/u);
  assert.equal(requireProcessInstanceIdentity(4243, options), identity); assert.equal(calls, 2);
  assert.throws(() => requireProcessInstanceIdentity(0, options), { code: 'PROCESS_IDENTITY_UNAVAILABLE' });
});

test('Windows reads the real current process birth identity within the bounded host allowance', () => {
  if (process.platform !== 'win32') return;
  let probe = null;
  const direct = _test.windowsBirth(process.pid, (file, args, options) => {
    const result = childProcess.spawnSync(file, args, options);
    probe = {
      status: Number.isInteger(result.status) ? result.status : 'null',
      signal: result.signal || 'none',
      error: ['ETIMEDOUT', 'ENOBUFS', 'ENOENT'].includes(result.error?.code) ? result.error.code : 'none',
      stdoutLength: result.stdout?.length || 0,
      stderrLength: result.stderr?.length || 0
    };
    return result;
  });
  assert.ok(direct, `WINDOWS_BIRTH_PROBE:${JSON.stringify(probe)}`);
  const actual = processInstanceIdentity(process.pid);
  assert.match(actual, /^[a-f0-9]{64}$/u);
  assert.strictEqual(processInstanceIdentity(process.pid), actual);
});

if (process.platform === 'darwin') test('native macOS reads the current process birth through the actual system ps', () => {
  const actual = requireProcessInstanceIdentity(process.pid);
  assert.match(actual, /^[a-f0-9]{64}$/u);
  assert.equal(processInstanceIdentity(process.pid), actual);
  assert.equal(processInstanceState(process.pid, actual), 'same');
});

test('identity state distinguishes death and PID reuse while observer failure stays unknown', () => {
  const expected = 'a'.repeat(64);
  const base = { processAlive: () => true };
  assert.strictEqual(processInstanceState(42, expected, { ...base, processInstanceIdentity: () => expected }), 'same');
  assert.strictEqual(processInstanceState(42, expected, { ...base, processInstanceIdentity: () => 'b'.repeat(64) }), 'different');
  assert.strictEqual(processInstanceState(42, expected, { ...base, processInstanceIdentity: () => null }), 'unknown');
  assert.strictEqual(processInstanceState(42, expected, { processAlive: () => false }), 'dead');
  assert.strictEqual(processInstanceState(42, undefined, base), 'unknown');
});

test('unsupported platforms and dead processes never invent an identity', () => {
  assert.strictEqual(processInstanceIdentity(42, { platform: 'plan9', processAlive: () => true }), null);
  assert.strictEqual(processInstanceIdentity(42, { platform: 'linux', processAlive: () => false }), null);
});

test('every fixed process-probe refusal survives Desktop, Workflow and Sidecar diagnostic projection', () => {
  const { desktopErrorCode } = require('../plugins/data-secure/server/core/desktop-error-contract');
  const { diagnosticCode, readBatchExecutionDiagnostic } = require('../plugins/data-secure/server/gateway/batch-execution-diagnostic');
  const workspace = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/frontend/workspace.js'), 'utf8');
  for (const code of ERROR_CODES) {
    assert.equal(desktopErrorCode(code), code); assert.equal(diagnosticCode(Object.assign(Error('/PRIVATE'), { code })), code);
    assert.equal(readBatchExecutionDiagnostic({ type: 'local-batch-diagnostic', phase: 'processing', error_code: code }).error_code, code);
    assert.ok(workspace.includes(code + ": '"), code + ' has a fixed in-app explanation');
  }
});

done();
