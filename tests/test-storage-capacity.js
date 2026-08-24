'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const { assertWritableCapacity, normalizePostPreflightWriteError } = require('../plugins/data-secure/server/gateway/storage-capacity');

const { test, done, assert } = createSuite('Write-capacity gate');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-capacity-'));
const parent = path.join(root, 'parent');
const target = path.join(parent, 'target');
fs.mkdirSync(target, { recursive: true, mode: 0o700 });

function stats(blocks, size) { return () => ({ bavail: BigInt(blocks), bsize: BigInt(size) }); }

test('accepts an exact byte boundary without inventing a global output limit', () => {
  const result = assertWritableCapacity({ directory: target, bytes: 4096, metadataBytes: 0, statfs: stats(4, 1024) });
  assert.strictEqual(result.required_bytes, 4096n);
  assert.strictEqual(result.available_bytes, 4096n);
});

test('fails closed when exactly one byte is unavailable', () => {
  assert.throws(
    () => assertWritableCapacity({ directory: target, bytes: 4097, metadataBytes: 0, statfs: stats(4, 1024) }),
    (error) => error.code === 'LOCAL_CAPACITY_INSUFFICIENT'
  );
});

test('fails closed for missing, invalid or unavailable filesystem statistics', () => {
  const cases = [
    () => { throw new Error('statfs'); },
    () => ({}),
    () => ({ bavail: -1n, bsize: 1024n }),
    () => ({ bavail: 1n, bsize: 0n }),
    () => ({ bavail: Number.MAX_SAFE_INTEGER + 1, bsize: 1 })
  ];
  for (const statfs of cases) {
    assert.throws(
      () => assertWritableCapacity({ directory: target, bytes: 1, metadataBytes: 0, statfs }),
      (error) => error.code === 'LOCAL_CAPACITY_UNAVAILABLE'
    );
  }
});

test('uses the actual target directory and never accepts a linked target', () => {
  const outside = path.join(root, 'outside');
  const link = path.join(parent, 'linked');
  fs.mkdirSync(outside, { recursive: true });
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(
    () => assertWritableCapacity({ directory: link, bytes: 1, metadataBytes: 0, statfs: stats(1, 1) }),
    (error) => error.code === 'LOCAL_CAPACITY_UNAVAILABLE'
  );
});

test('normalizes only an actual post-preflight ENOSPC into a retryable capacity race', () => {
  const full = new Error('disk full');
  full.code = 'ENOSPC';
  assert.strictEqual(normalizePostPreflightWriteError(full).code, 'LOCAL_CAPACITY_RACE');
  const denied = new Error('denied');
  denied.code = 'EACCES';
  assert.strictEqual(normalizePostPreflightWriteError(denied), denied);
});

done();
