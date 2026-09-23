'use strict';

const { createSuite } = require('./helpers');
const { processInstanceIdentity, processInstanceState, _test } = require('../plugins/data-secure/server/gateway/process-identity');

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
  const win = _test.windowsBirth(42, (_executable, _arguments, options) => {
    assert.equal(options.timeout, 8000);
    assert.equal(options.maxBuffer, 4096);
    return { status: 0, stdout: '638999999999999999' };
  }, { SystemRoot: 'C:\\Windows' });
  const mac = _test.macosBirth(42, () => ({ status: 0, stdout: 'Fri Sep  5 12:34:56 2026\n' }));
  assert.match(win, /^[a-f0-9]{64}$/u);
  assert.match(mac, /^[a-f0-9]{64}$/u);
  assert.strictEqual(_test.windowsBirth(42, () => ({ status: 0, stdout: 'ticks\nprivate' })), null);
  assert.strictEqual(_test.macosBirth(42, () => ({ status: 0, stdout: '/private/path' })), null);
});

test('Windows reads the real current process birth identity within the bounded host allowance', () => {
  if (process.platform !== 'win32') return;
  const actual = processInstanceIdentity(process.pid);
  assert.match(actual, /^[a-f0-9]{64}$/u);
  assert.strictEqual(processInstanceIdentity(process.pid), actual);
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

done();
