'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
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
const { createPrivateWorkStore } = require('../plugins/data-secure/server/gateway/private-work-store');
const { test, done, assert } = createSuite('Batch snapshot module');

const privateWorkStore = createPrivateWorkStore({ privateRoot: base });

// DS-070: every copy is bound to the preflight hash; the fixture payload is
// 'snapshot payload' unless a test states another expectation.
const PAYLOAD_SHA256 = crypto.createHash('sha256').update('snapshot payload').digest('hex');
function plainDeps(overrides = {}, objectId = crypto.randomBytes(8).toString('hex')) {
  return {
    fs,
    hasReparseComponent: () => false,
    privateWorkStore,
    binding: { purpose: 'batch-snapshot', objectId },
    expectedSha256: PAYLOAD_SHA256,
    ...overrides
  };
}

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

test('an all-stopped admission needs no source staging capacity probe', () => {
  let calls = 0;
  assert.deepStrictEqual(assertStagingCapacity([], () => { calls++; throw new Error('must not run'); }), {
    inputBytes: 0, required: 0, available: null
  });
  assert.strictEqual(calls, 0);
});

test('snapshot copy completes correctly across positive partial reads and persists an exact plaintext private copy', () => {
  const { source, expected } = sourceFixture('partial.txt');
  const destination = path.join(base, 'partial.copy');
  const io = ioWith({
    readSync(fd, buffer, offset, length, position) {
      return fs.readSync(fd, buffer, offset, Math.min(3, length), position);
    }
  });
  const copied = copySnapshotFile(source, destination, expected, plainDeps({ fs: io }, 'partial'));
  assert.strictEqual(copied.size, expected.size);
  assert.deepStrictEqual(fs.readFileSync(destination), fs.readFileSync(source));
  assert.deepStrictEqual(privateWorkStore.readFile(destination, {
    purpose: 'batch-snapshot', objectId: 'partial'
  }), fs.readFileSync(source));
});

test('snapshot copy is cryptographically bound to the preflight bytes', () => {
  const { source, expected } = sourceFixture('bound-digest.txt');
  const destination = path.join(base, 'bound-digest.copy');
  const digest = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  const copied = copySnapshotFile(source, destination, expected, plainDeps({ expectedSha256: digest }, 'bound'));
  assert.strictEqual(copied.sha256, digest);

  const rejected = path.join(base, 'bound-digest-rejected.copy');
  assert.throws(() => copySnapshotFile(source, rejected, expected,
    plainDeps({ expectedSha256: '0'.repeat(64) }, 'bound-rejected')),
  /zwischen Prüfung und lokaler Übernahme verändert/i);
  assert.strictEqual(fs.existsSync(rejected), false);
  assert.strictEqual(fs.readFileSync(source, 'utf8'), 'snapshot payload');
});

test('read, write and close failures remove the exact private copy', () => {
  for (const mode of ['short-read', 'write-error', 'close-error']) {
    const { source, expected } = sourceFixture(`${mode}.txt`);
    const destination = path.join(base, `${mode}.copy`);
    let reads = 0;
    const io = ioWith({
      readSync(fd, buffer, offset, length, position) {
        reads++;
        if (mode === 'short-read' && reads > 1) return 0;
        const bounded = mode === 'short-read' ? Math.min(3, length) : length;
        return fs.readSync(fd, buffer, offset, bounded, position);
      },
      closeSync(fd) {
        fs.closeSync(fd);
        if (mode === 'close-error') throw new Error('close failed');
      }
    });
    let failure;
    const selectedCrypto = mode === 'write-error'
      ? { writeFile() { throw new Error('write failed'); } }
      : privateWorkStore;
    try {
      copySnapshotFile(source, destination, expected, plainDeps({ fs: io, privateWorkStore: selectedCrypto }, mode));
    }
    catch (error) { failure = error; }
    assert.ok(failure, mode);
    if (mode === 'short-read') assert.match(failure.message, /unvollständig/i, mode);
    assert.strictEqual(fs.existsSync(destination), false, mode);
    assert.strictEqual(fs.readFileSync(source, 'utf8'), 'snapshot payload', mode);
  }
});

test('a destination collision combined with source-close failure never deletes the existing file', () => {
  const { source, expected } = sourceFixture('collision-source.txt');
  const destination = path.join(base, 'existing.copy');
  fs.writeFileSync(destination, 'existing data');
  const io = ioWith({ closeSync(fd) { fs.closeSync(fd); throw new Error('close failed'); } });
  assert.throws(() => copySnapshotFile(source, destination, expected, plainDeps({ fs: io })));
  assert.strictEqual(fs.readFileSync(destination, 'utf8'), 'existing data');
  assert.strictEqual(fs.readFileSync(source, 'utf8'), 'snapshot payload');
});

function driftingInput(source, field) {
  let inputFd;
  let inputStats = 0;
  return ioWith({
    openSync(target, flags, mode) {
      const fd = fs.openSync(target, flags, mode);
      if (target === source) inputFd = fd;
      return fd;
    },
    fstatSync(fd) {
      const stat = fs.fstatSync(fd);
      if (fd === inputFd && ++inputStats > 1) stat[field] += 1;
      return stat;
    }
  });
}

test('an in-place modification-time change during copying invalidates and removes the snapshot', () => {
  const { source, expected } = sourceFixture('mtime.txt');
  const destination = path.join(base, 'mtime.copy');
  assert.throws(
    () => copySnapshotFile(source, destination, expected, plainDeps({ fs: driftingInput(source, 'mtimeMs') }, 'mtime')),
    /verändert/i
  );
  assert.strictEqual(fs.existsSync(destination), false);
  assert.strictEqual(fs.readFileSync(source, 'utf8'), 'snapshot payload');
});

test('DS-070: a change-time drift without any byte change is tolerated during copying', () => {
  // Windows real-time scanners alter NTFS ctime of freshly written files; the
  // content stays bound by size, mtime, inode and the preflight SHA-256.
  const { source, expected } = sourceFixture('ctime.txt');
  const destination = path.join(base, 'ctime.copy');
  const copied = copySnapshotFile(source, destination, expected, plainDeps({ fs: driftingInput(source, 'ctimeMs') }, 'ctime'));
  assert.strictEqual(copied.sha256, PAYLOAD_SHA256);
  assert.deepStrictEqual(fs.readFileSync(destination), fs.readFileSync(source));
  const drifted = { ...expected, ctimeMs: expected.ctimeMs + 5000, isFile: () => true, isSymbolicLink: () => false };
  const again = path.join(base, 'ctime-drifted.copy');
  assert.strictEqual(copySnapshotFile(source, again, drifted, plainDeps({}, 'ctime-drifted')).sha256, PAYLOAD_SHA256,
    'a stale ctime in the expected identity is equally irrelevant');
});

test('DS-070: a same-size content swap with a restored modification time is stopped by the preflight hash', () => {
  const { source, expected } = sourceFixture('swap.txt');
  const destination = path.join(base, 'swap.copy');
  const swapped = Buffer.from('SNAPSHOT PAYLOAD', 'utf8');
  assert.strictEqual(swapped.length, expected.size);
  fs.writeFileSync(source, swapped);
  fs.utimesSync(source, expected.atime, expected.mtime);
  // Whatever identity the file now presents, it is exactly what the copy sees:
  // only the preflight hash can tell the swapped bytes apart.
  const presented = fs.lstatSync(source);
  assert.strictEqual(presented.size, expected.size);
  assert.throws(() => copySnapshotFile(source, destination, presented, plainDeps({}, 'swap')),
    /zwischen Prüfung und lokaler Übernahme verändert/i);
  assert.strictEqual(fs.existsSync(destination), false);
});

test('DS-070: a copy without a preflight hash fails closed before any byte is copied', () => {
  const { source, expected } = sourceFixture('nohash.txt');
  const destination = path.join(base, 'nohash.copy');
  for (const expectedSha256 of [undefined, '', 'abc', 'Z'.repeat(64)]) {
    assert.throws(() => copySnapshotFile(source, destination, expected, plainDeps({ expectedSha256 }, 'nohash')),
      /Integritätsbindung/i);
  }
  assert.strictEqual(fs.existsSync(destination), false);
});

test('pending entry binding verifies the snapshot digest and returns in-memory bytes', () => {
  const plaintext = Buffer.alloc(123, 0x61);
  const digest = crypto.createHash('sha256').update(plaintext).digest('hex');
  const calls = [];
  const state = { schema: 'datasecure-batch/2', token: 'a'.repeat(64) };
  const item = {
    name: 'Quelle.docx',
    work_name: `001_${'b'.repeat(24)}.docx`,
    size: 123,
    id: 'f'.repeat(32),
    sha256: digest
  };
  const result = exactPendingEntry(state, item, {
    path: { join(left, right) { calls.push(`join:${left}:${right}`); return `${left}/${right}`; } },
    workPath(value) { calls.push(`work:${value}`); return `work-${value}`; },
    regularFileStat(target) { calls.push(`stat:${target}`); return { size: 999, marker: 'plain' }; },
    privateWorkStore: {
      readFile(target) {
        calls.push(`read:${target}`);
        return Buffer.from(plaintext);
      }
    }
  });
  assert.deepStrictEqual(result, {
    name: 'Quelle.docx',
    private_bytes: plaintext,
    expected_sha256: digest,
    private_artifact_plain: true
  });
  assert.deepStrictEqual(calls, [
    `work:${state.token}`,
    `join:work-${state.token}:${item.work_name}`,
    `stat:work-${state.token}/${item.work_name}`,
    `read:work-${state.token}/${item.work_name}`
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
      { schema: 'datasecure-batch/2', token: 'a'.repeat(64) },
      { work_name: workName, size: 1 },
      { workPath: () => 'work', regularFileStat: () => { statCalls++; return { size: 1 }; } }
    ), /Arbeitskopie ist ungültig/);
  }
  assert.strictEqual(statCalls, 0);
});

test('pending entry binding preserves regular-file errors and rejects snapshot byte changes', () => {
  const item = { id: 'f'.repeat(32), name: 'Quelle.txt', work_name: `001_${'d'.repeat(24)}.workcopy`, size: 10, sha256: 'e'.repeat(64) };
  const regularError = new Error('REGULAR_FILE_REJECTED');
  assert.throws(() => exactPendingEntry(
    { schema: 'datasecure-batch/2', token: 'a'.repeat(64) }, item,
    { workPath: () => 'work', regularFileStat: () => { throw regularError; }, privateWorkStore: { readFile() {} } }
  ), /REGULAR_FILE_REJECTED/);
  assert.throws(() => exactPendingEntry(
    { schema: 'datasecure-batch/2', token: 'a'.repeat(64) }, item,
    {
      workPath: () => 'work', regularFileStat: () => ({ size: 99 }),
      privateWorkStore: { readFile: () => Buffer.alloc(10, 0x61) }
    }
  ), /wurde verändert/);
});

try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* best effort */ }
done();
