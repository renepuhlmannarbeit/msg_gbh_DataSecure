'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-snapshot-'));
process.env.LOCALAPPDATA = path.join(base, 'localapp');
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');

const {
  assertStagingCapacity,
  preflightOoxmlContainers,
  copySnapshotFile,
  exactPendingEntry
} = require('../plugins/data-secure/server/gateway/batch-snapshot');
const { batchRoot, batchPath, workPath } = require('../plugins/data-secure/server/gateway/batch-private-store');
const { _test } = require('../plugins/data-secure/server/gateway/batch');
const { test, done, assert } = createSuite('Batch snapshot module');

function ioWith(overrides = {}) {
  return { ...fs, ...overrides, constants: fs.constants };
}

function sourceFixture(name = 'source.txt') {
  const source = path.join(base, name);
  fs.writeFileSync(source, 'snapshot payload', 'utf8');
  return { source, expected: fs.lstatSync(source) };
}

test('private path helpers stay token-bound and the batch facade keeps its test contract', () => {
  const token = 'a'.repeat(64);
  assert.strictEqual(batchPath(token), path.join(batchRoot(), `${token}.json`));
  assert.strictEqual(workPath(token), path.join(batchRoot(), `${token}.work`));
  assert.throws(() => batchPath('../escape'), /ungültig/i);
  assert.strictEqual(_test.batchRoot(), batchRoot());
  assert.strictEqual(_test.workPath(token), workPath(token));
  assert.strictEqual(_test.assertStagingCapacity, assertStagingCapacity);
  assert.strictEqual(_test.preflightOoxmlContainers, preflightOoxmlContainers);
});

test('snapshot copy completes correctly across positive partial writes', () => {
  const { source, expected } = sourceFixture('partial.txt');
  const destination = path.join(base, 'partial.copy');
  const io = ioWith({
    writeSync(fd, buffer, offset, length) {
      return fs.writeSync(fd, buffer, offset, Math.min(3, length));
    }
  });
  const copied = copySnapshotFile(source, destination, expected, { fs: io, hasReparseComponent: () => false });
  assert.strictEqual(copied.size, expected.size);
  assert.strictEqual(fs.readFileSync(destination, 'utf8'), fs.readFileSync(source, 'utf8'));
});

test('write, read and fsync failures remove the exact partial copy', () => {
  for (const mode of ['zero-write', 'short-read', 'write-error', 'fsync-error']) {
    const { source, expected } = sourceFixture(`${mode}.txt`);
    const destination = path.join(base, `${mode}.copy`);
    let reads = 0;
    const io = ioWith({
      writeSync: mode === 'zero-write' ? () => 0 : (mode === 'write-error' ? () => {
        const error = new Error('capacity race');
        error.code = 'ENOSPC';
        throw error;
      } : fs.writeSync.bind(fs)),
      fsyncSync: mode === 'fsync-error' ? () => {
        const error = new Error('quota race');
        error.code = 'EDQUOT';
        throw error;
      } : fs.fsyncSync.bind(fs),
      readSync(fd, buffer, offset, length, position) {
        reads++;
        if (mode === 'short-read' && reads > 1) return 0;
        const bounded = mode === 'short-read' ? Math.min(3, length) : length;
        return fs.readSync(fd, buffer, offset, bounded, position);
      }
    });
    let failure;
    try { copySnapshotFile(source, destination, expected, { fs: io, hasReparseComponent: () => false }); }
    catch (error) { failure = error; }
    assert.ok(failure, mode);
    if (mode === 'zero-write' || mode === 'short-read') assert.match(failure.message, /unvollständig/i, mode);
    assert.strictEqual(fs.existsSync(destination), false, mode);
    assert.strictEqual(fs.readFileSync(source, 'utf8'), 'snapshot payload', mode);
  }
});

test('an in-place metadata change during copying invalidates and removes the snapshot', () => {
  const { source, expected } = sourceFixture('ctime.txt');
  const destination = path.join(base, 'ctime.copy');
  let inputFd;
  let inputStats = 0;
  const io = ioWith({
    openSync(target, flags, mode) {
      const fd = fs.openSync(target, flags, mode);
      if (target === source) inputFd = fd;
      return fd;
    },
    fstatSync(fd) {
      const stat = fs.fstatSync(fd);
      if (fd === inputFd && ++inputStats > 1) stat.ctimeMs += 1;
      return stat;
    }
  });
  assert.throws(
    () => copySnapshotFile(source, destination, expected, { fs: io, hasReparseComponent: () => false }),
    /verändert/i
  );
  assert.strictEqual(fs.existsSync(destination), false);
  assert.strictEqual(fs.readFileSync(source, 'utf8'), 'snapshot payload');
});

test('pending entry binding returns the exact sealed path, stat and streaming hash contract', () => {
  const stat = { size: 123, marker: 'regular' };
  const calls = [];
  const state = { token: 'a'.repeat(64) };
  const item = {
    name: 'Quelle.docx',
    work_name: `001_${'b'.repeat(24)}.docx`,
    size: 123,
    sha256: 'c'.repeat(64)
  };
  const result = exactPendingEntry(state, item, {
    path: { join(left, right) { calls.push(`join:${left}:${right}`); return `${left}/${right}`; } },
    workPath(value) { calls.push(`work:${value}`); return `work-${value}`; },
    regularFileStat(target) { calls.push(`stat:${target}`); return stat; }
  });
  assert.deepStrictEqual(result, {
    name: 'Quelle.docx',
    full: `work-${state.token}/${item.work_name}`,
    stat,
    expected_sha256: 'c'.repeat(64)
  });
  assert.deepStrictEqual(calls, [
    `work:${state.token}`,
    `join:work-${state.token}:${item.work_name}`,
    `stat:work-${state.token}/${item.work_name}`
  ]);
});

test('pending entry binding rejects every unsafe work name before filesystem access', () => {
  const invalid = [
    '../escape.txt',
    `01_${'a'.repeat(24)}.txt`,
    `001_${'a'.repeat(23)}.txt`,
    `001_${'a'.repeat(24)}.tar.gz`,
    `001_${'a'.repeat(24)}.t-xt`,
    `001_${'a'.repeat(24)}/child.txt`,
    `001_${'a'.repeat(24)}\\child.txt`
  ];
  let statCalls = 0;
  for (const workName of invalid) {
    assert.throws(() => exactPendingEntry(
      { token: 'a'.repeat(64) },
      { work_name: workName, size: 1 },
      { workPath: () => 'work', regularFileStat: () => { statCalls++; return { size: 1 }; } }
    ), /Arbeitskopie ist ungültig/);
  }
  assert.strictEqual(statCalls, 0);
});

test('pending entry binding preserves regular-file errors and rejects a size change', () => {
  const item = { name: 'Quelle.txt', work_name: `001_${'d'.repeat(24)}.txt`, size: 10, sha256: 'e'.repeat(64) };
  const regularError = new Error('REGULAR_FILE_REJECTED');
  assert.throws(() => exactPendingEntry(
    { token: 'a'.repeat(64) }, item,
    { workPath: () => 'work', regularFileStat: () => { throw regularError; } }
  ), /REGULAR_FILE_REJECTED/);
  assert.throws(() => exactPendingEntry(
    { token: 'a'.repeat(64) }, item,
    { workPath: () => 'work', regularFileStat: () => ({ size: 11 }) }
  ), /wurde verändert/);
});

try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* best effort */ }
done();
