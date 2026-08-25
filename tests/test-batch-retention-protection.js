'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const { createBatchRetentionProtection } = require('../plugins/data-secure/server/gateway/batch-retention-protection');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-batch-retention-'));
process.env.LOCALAPPDATA = path.join(base, 'localapp');
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');

const { _test } = require('../plugins/data-secure/server/gateway/batch');
const { test, done, assert } = createSuite('Batch journal durability and retention protection');

test('writeFully retries short writes until the exact payload is durable', () => {
  const chunks = [];
  let calls = 0;
  const io = {
    writeSync(_fd, bytes, offset, length) {
      calls++;
      const count = Math.min(3, length);
      chunks.push(Buffer.from(bytes.subarray(offset, offset + count)));
      return count;
    }
  };
  const payload = Buffer.from('journal payload', 'utf8');
  assert.strictEqual(_test.writeFully(7, payload, io), payload.length);
  assert.strictEqual(Buffer.concat(chunks).toString('utf8'), payload.toString('utf8'));
  assert.ok(calls > 1, 'the test must exercise a real short-write retry');
});

test('writeFully fails closed when the filesystem makes no progress', () => {
  assert.throws(
    () => _test.writeFully(7, Buffer.from('journal'), { writeSync: () => 0 }),
    /BATCH_JOURNAL_PARTIAL_WRITE/
  );
});

test('POSIX directory metadata is fsynced while Windows uses the portable file-only contract', () => {
  const calls = [];
  const io = {
    constants: { O_RDONLY: 0 },
    openSync(target, flag) { calls.push(['open', target, flag]); return 11; },
    fsyncSync(fd) { calls.push(['fsync', fd]); },
    closeSync(fd) { calls.push(['close', fd]); }
  };
  const target = path.join(base, 'batches', 'state.json');
  assert.strictEqual(_test.syncParentDirectory(target, io, 'linux'), true);
  assert.deepStrictEqual(calls.map((entry) => entry[0]), ['open', 'fsync', 'close']);
  calls.length = 0;
  assert.strictEqual(_test.syncParentDirectory(target, io, 'win32'), false);
  assert.deepStrictEqual(calls, []);
});

function fileEntry(name) {
  return { name, isFile: () => true };
}

test('a complete journal scan returns all delivery and mapping package protections', () => {
  const delivery = 'ds_' + '1'.repeat(32);
  const mapping = 'ds_' + '2'.repeat(32);
  const ignored = 'ds_' + '3'.repeat(32);
  const state = {
    schema: 'datasecure-batch/1',
    items: [
      { status: 'delivery_pending', package_id: delivery },
      { status: 'mapping_pending', package_id: mapping },
      { status: 'released', package_id: ignored }
    ]
  };
  const result = _test.openBatchPackageProtection({
    readdirSync: () => [fileEntry('a.json')],
    readFileSync: () => JSON.stringify(state)
  });
  assert.strictEqual(result.complete, true);
  assert.deepStrictEqual([...result.ids].sort(), [delivery, mapping]);
});

test('one unreadable or malformed journal invalidates the whole automatic cleanup proof', () => {
  const valid = JSON.stringify({
    schema: 'datasecure-batch/1',
    items: [{ status: 'delivery_pending', package_id: 'ds_' + '4'.repeat(32) }]
  });
  for (const broken of ['read-error', 'malformed-json', 'invalid-schema']) {
    const result = _test.openBatchPackageProtection({
      readdirSync: () => [fileEntry('valid.json'), fileEntry(`${broken}.json`)],
      readFileSync(target) {
        if (String(target).endsWith('valid.json')) return valid;
        if (broken === 'read-error') throw new Error('denied');
        if (broken === 'malformed-json') return '{';
        return JSON.stringify({ schema: 'other', items: [] });
      }
    });
    assert.strictEqual(result.complete, false, broken);
  }
});

test('an unreadable journal directory also blocks automatic output deletion', () => {
  const result = _test.openBatchPackageProtection({ readdirSync: () => { throw new Error('denied'); } });
  assert.strictEqual(result.complete, false);
  assert.strictEqual(result.ids.size, 0);
});

test('the extracted reader resolves its root per scan and preserves already collected ids on a later failure', () => {
  let rootCalls = 0;
  const protectedId = 'ds_' + 'a'.repeat(32);
  const { openBatchPackageProtection } = createBatchRetentionProtection({
    batchRoot() { rootCalls++; return `root-${rootCalls}`; },
    path: { join: (dir, name) => `${dir}/${name}` }
  });
  const io = {
    readdirSync: () => [fileEntry('valid.json'), fileEntry('broken.json')],
    readFileSync(target) {
      if (String(target).endsWith('valid.json')) {
        return JSON.stringify({
          schema: 'datasecure-batch/1',
          items: [{ status: 'delivery_pending', package_id: protectedId }]
        });
      }
      throw new Error('denied');
    }
  };
  const first = openBatchPackageProtection(io);
  const second = openBatchPackageProtection(io);
  assert.strictEqual(rootCalls, 2);
  assert.strictEqual(first.complete, false);
  assert.deepStrictEqual([...first.ids], [protectedId]);
  assert.strictEqual(second.complete, false);
  assert.deepStrictEqual([...second.ids], [protectedId]);
});

test('the extracted reader propagates root configuration errors and ignores non-file entries', () => {
  const broken = createBatchRetentionProtection({ batchRoot: () => { throw new Error('ROOT_UNSAFE'); } });
  assert.throws(() => broken.openBatchPackageProtection(), /ROOT_UNSAFE/);

  const reader = createBatchRetentionProtection({ batchRoot: () => 'root' });
  let reads = 0;
  const result = reader.openBatchPackageProtection({
    readdirSync: () => [
      { name: 'directory.json' },
      { name: 'directory-2.json', isFile: () => false },
      fileEntry('note.txt')
    ],
    readFileSync: () => { reads++; return '{}'; }
  });
  assert.deepStrictEqual(result, { ids: new Set(), complete: true });
  assert.strictEqual(reads, 0);
});

try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* best effort */ }
done();
