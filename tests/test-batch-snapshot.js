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
const { createPrivateArtifactCrypto } = require('../plugins/data-secure/server/gateway/private-artifact-crypto');
const { test, done, assert } = createSuite('Batch snapshot module');

const artifactKey = Buffer.alloc(32, 0x51);
const artifactCrypto = createPrivateArtifactCrypto({
  privateRoot: base,
  secretStore: {
    prepareWrite() {
      return { key: Buffer.from(artifactKey), keyId: '1'.repeat(32), generation: 1, commit() {}, abort() {} };
    },
    resolveRead() { return Buffer.from(artifactKey); }
  }
});

function encryptedDeps(overrides = {}, objectId = crypto.randomBytes(8).toString('hex')) {
  return {
    fs,
    hasReparseComponent: () => false,
    artifactCrypto,
    binding: { purpose: 'batch-snapshot', objectId },
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

test('snapshot copy completes correctly across positive partial reads and persists ciphertext only', () => {
  const { source, expected } = sourceFixture('partial.txt');
  const destination = path.join(base, 'partial.copy');
  const io = ioWith({
    readSync(fd, buffer, offset, length, position) {
      return fs.readSync(fd, buffer, offset, Math.min(3, length), position);
    }
  });
  const copied = copySnapshotFile(source, destination, expected, encryptedDeps({ fs: io }, 'partial'));
  assert.strictEqual(copied.size, expected.size);
  assert.notDeepStrictEqual(fs.readFileSync(destination), fs.readFileSync(source));
  assert.deepStrictEqual(artifactCrypto.readEncrypted(destination, {
    purpose: 'batch-snapshot', objectId: 'partial'
  }), fs.readFileSync(source));
});

test('snapshot copy is cryptographically bound to the preflight bytes', () => {
  const { source, expected } = sourceFixture('bound-digest.txt');
  const destination = path.join(base, 'bound-digest.copy');
  const digest = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  const copied = copySnapshotFile(source, destination, expected, encryptedDeps({ expectedSha256: digest }, 'bound'));
  assert.strictEqual(copied.sha256, digest);

  const rejected = path.join(base, 'bound-digest-rejected.copy');
  assert.throws(() => copySnapshotFile(source, rejected, expected,
    encryptedDeps({ expectedSha256: '0'.repeat(64) }, 'bound-rejected')),
  /zwischen Prüfung und lokaler Übernahme verändert/i);
  assert.strictEqual(fs.existsSync(rejected), false);
  assert.strictEqual(fs.readFileSync(source, 'utf8'), 'snapshot payload');
});

test('read, encryption and close failures remove the exact encrypted copy', () => {
  for (const mode of ['short-read', 'encryption-error', 'close-error']) {
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
    const selectedCrypto = mode === 'encryption-error'
      ? { writeEncrypted() { throw new Error('cipher failed'); } }
      : artifactCrypto;
    try {
      copySnapshotFile(source, destination, expected, encryptedDeps({ fs: io, artifactCrypto: selectedCrypto }, mode));
    }
    catch (error) { failure = error; }
    assert.ok(failure, mode);
    if (mode === 'short-read') assert.match(failure.message, /unvollständig/i, mode);
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
    () => copySnapshotFile(source, destination, expected, encryptedDeps({ fs: io }, 'ctime')),
    /verändert/i
  );
  assert.strictEqual(fs.existsSync(destination), false);
  assert.strictEqual(fs.readFileSync(source, 'utf8'), 'snapshot payload');
});

test('pending entry binding authenticates and returns only in-memory plaintext', () => {
  const plaintext = Buffer.alloc(123, 0x61);
  const digest = crypto.createHash('sha256').update(plaintext).digest('hex');
  const calls = [];
  const state = { token: 'a'.repeat(64) };
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
    regularFileStat(target) { calls.push(`stat:${target}`); return { size: 999, marker: 'encrypted' }; },
    artifactCrypto: {
      readEncrypted(target, binding) {
        calls.push(`read:${target}:${binding.objectId}`);
        return Buffer.from(plaintext);
      }
    }
  });
  assert.deepStrictEqual(result, {
    name: 'Quelle.docx',
    private_bytes: plaintext,
    expected_sha256: digest,
    private_artifact_encrypted: true
  });
  assert.deepStrictEqual(calls, [
    `work:${state.token}`,
    `join:work-${state.token}:${item.work_name}`,
    `stat:work-${state.token}/${item.work_name}`,
    `read:work-${state.token}/${item.work_name}:${state.token}:${item.id}`
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

test('pending entry binding preserves regular-file errors and rejects authenticated byte changes', () => {
  const item = { id: 'f'.repeat(32), name: 'Quelle.txt', work_name: `001_${'d'.repeat(24)}.dsart`, size: 10, sha256: 'e'.repeat(64) };
  const regularError = new Error('REGULAR_FILE_REJECTED');
  assert.throws(() => exactPendingEntry(
    { token: 'a'.repeat(64) }, item,
    { workPath: () => 'work', regularFileStat: () => { throw regularError; }, artifactCrypto: { readEncrypted() {} } }
  ), /REGULAR_FILE_REJECTED/);
  assert.throws(() => exactPendingEntry(
    { token: 'a'.repeat(64) }, item,
    {
      workPath: () => 'work', regularFileStat: () => ({ size: 99 }),
      artifactCrypto: { readEncrypted: () => Buffer.alloc(10, 0x61) }
    }
  ), /wurde verändert/);
});

try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* best effort */ }
done();
