'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');
const { createPrivateWorkStore } = require('../plugins/data-secure/server/gateway/private-work-store');
const { migrateLegacyBatchState } = require('../plugins/data-secure/server/gateway/batch-private-artifact-migration');
const { exactPendingEntry } = require('../plugins/data-secure/server/gateway/batch-snapshot');
const { createBatchJournalStore } = require('../plugins/data-secure/server/gateway/batch-journal-store');
const { createBatchRecovery } = require('../plugins/data-secure/server/gateway/batch-recovery');
const { releasedDocumentResult, notProcessedDocumentResult } = require('../plugins/data-secure/server/gateway/document-result-grade');

const { test, done, assert } = createSuite('Plain batch compatibility and legacy preservation');

function fixture(schema = 'datasecure-batch/2', workName = '001_aaaaaaaaaaaaaaaaaaaaaaaa.txt') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-batch-plain-'));
  const work = path.join(root, 'work');
  fs.mkdirSync(work, { mode: 0o700 });
  const bytes = Buffer.from('Kunde: Synthetische Person 4711', 'utf8');
  const item = {
    id: '0123456789abcdef0123456789abcdef', name: 'synthetic.txt', size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'), work_name: workName,
    status: 'pending', checkpoint: 'sealed'
  };
  const state = { schema, token: 'a'.repeat(64), expires_at: '2020-01-01T00:00:00.000Z', profile: 'general', items: [item] };
  const store = createPrivateWorkStore({ privateRoot: root });
  return {
    root, work, bytes, state, store,
    deps(writeState = () => {}) { return { privateWorkStore: store, workPath: () => work, writeState }; },
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); }
  };
}

test('v2 plaintext upgrades the journal only; bytes, inode and original work name remain unchanged', () => {
  const h = fixture();
  try {
    const target = path.join(h.work, h.state.items[0].work_name);
    fs.writeFileSync(target, h.bytes, { mode: 0o600 });
    const before = fs.statSync(target);
    const writes = [];
    const itemReference = h.state.items[0];
    migrateLegacyBatchState(h.state, h.deps((state) => writes.push(JSON.parse(JSON.stringify(state)))));
    assert.strictEqual(h.state.schema, 'datasecure-batch/4');
    assert.strictEqual(h.state.items[0], itemReference);
    assert.strictEqual(h.state.items[0].private_artifact_plain, true);
    assert.ok(!Object.hasOwn(h.state.items[0], 'private_artifact_encrypted'));
    assert.strictEqual(writes.length, 1);
    assert.strictEqual(fs.statSync(target).ino, before.ino);
    assert.deepStrictEqual(fs.readFileSync(target), h.bytes);
    const result = exactPendingEntry(h.state, h.state.items[0], h.deps());
    assert.deepStrictEqual(result.private_bytes, h.bytes);
    assert.strictEqual(result.private_artifact_plain, true);
    result.private_bytes.fill(0);
  } finally { h.cleanup(); }
});

test('failed v2 journal publication preserves the authoritative state and private bytes', () => {
  const h = fixture();
  try {
    const target = path.join(h.work, h.state.items[0].work_name);
    fs.writeFileSync(target, h.bytes);
    assert.throws(() => migrateLegacyBatchState(h.state, h.deps(() => { throw new Error('journal-failed'); })), /journal-failed/u);
    assert.strictEqual(h.state.schema, 'datasecure-batch/2');
    assert.deepStrictEqual(fs.readFileSync(target), h.bytes);
    assert.deepStrictEqual(fs.readdirSync(h.work), [path.basename(target)]);
  } finally { h.cleanup(); }
});

test('v3 and unknown legacy versions stop without reading, changing or deleting work', () => {
  for (const schema of ['datasecure-batch/3', 'datasecure-batch/1', 'datasecure-batch/99']) {
    const h = fixture(schema);
    try {
      const target = path.join(h.work, h.state.items[0].work_name);
      fs.writeFileSync(target, h.bytes);
      const before = JSON.stringify(h.state);
      assert.throws(() => migrateLegacyBatchState(h.state, {
        ...h.deps(() => { throw new Error('must not write'); }),
        privateWorkStore: { readFile() { throw new Error('must not read'); } }
      }), (e) => e.code === 'PRIVATE_ARTIFACT_LEGACY_ENCRYPTED_UNSUPPORTED');
      assert.strictEqual(JSON.stringify(h.state), before);
      assert.deepStrictEqual(fs.readFileSync(target), h.bytes);
    } finally { h.cleanup(); }
  }
});

test('encrypted extension and encrypted marker cannot be adopted as plaintext v2 or v4', () => {
  for (const schema of ['datasecure-batch/2', 'datasecure-batch/4']) {
    for (const kind of ['extension', 'marker', 'cleanup-marker']) {
      const h = fixture(schema, kind === 'extension' ? '001_aaaaaaaaaaaaaaaaaaaaaaaa.dsart' : undefined);
      try {
        if (schema.endsWith('/4')) h.state.items[0].private_artifact_plain = true;
        if (kind === 'marker') h.state.items[0].private_artifact_encrypted = true;
        if (kind === 'cleanup-marker') h.state.items[0].legacy_work_name = '001_bbbbbbbbbbbbbbbbbbbbbbbb.txt';
        const target = path.join(h.work, h.state.items[0].work_name);
        fs.writeFileSync(target, h.bytes);
        assert.throws(() => migrateLegacyBatchState(h.state, h.deps()), (e) => e.code === 'PRIVATE_ARTIFACT_LEGACY_ENCRYPTED_UNSUPPORTED');
        assert.deepStrictEqual(fs.readFileSync(target), h.bytes);
      } finally { h.cleanup(); }
    }
  }
});

test('encrypted envelope bytes under plaintext filename are rejected without deleting or rewriting', () => {
  const h = fixture();
  try {
    const target = path.join(h.work, h.state.items[0].work_name);
    const envelope = Buffer.from('DSARTF01synthetic-legacy-envelope');
    fs.writeFileSync(target, envelope);
    h.state.items[0].size = envelope.length;
    h.state.items[0].sha256 = crypto.createHash('sha256').update(envelope).digest('hex');
    assert.throws(() => migrateLegacyBatchState(h.state, h.deps()));
    assert.strictEqual(h.state.schema, 'datasecure-batch/2');
    assert.deepStrictEqual(fs.readFileSync(target), envelope);
  } finally { h.cleanup(); }
});

test('expired v3 journals remain intact in normal reads, maintenance and write attempts', () => {
  const h = fixture('datasecure-batch/3');
  try {
    h.state.items[0].private_artifact_encrypted = true;
    const target = path.join(h.root, 'batch.json');
    const before = JSON.stringify(h.state);
    fs.writeFileSync(target, before);
    let removes = 0;
    const journal = createBatchJournalStore({ batchPath: () => target, safeRemoveWorkDirectory() { removes++; } });
    for (const action of [
      () => journal.readState(h.state.token),
      () => journal.readStateForMaintenance(h.state.token),
      () => journal.writeState(h.state)
    ]) assert.throws(action, (e) => e.code === 'PRIVATE_ARTIFACT_LEGACY_ENCRYPTED_UNSUPPORTED');
    assert.strictEqual(removes, 0);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), before);
  } finally { h.cleanup(); }
});

test('v4 plaintext marker validation applies before terminal status shortcuts', () => {
  const h = fixture('datasecure-batch/4');
  try {
    const target = path.join(h.root, 'batch.json');
    const journal = createBatchJournalStore({ batchPath: () => target });
    for (const status of ['pending', 'released', 'mapping_pending', 'delivery_pending', 'stopped']) {
      h.state.items[0].status = status;
      delete h.state.items[0].document_result;
      delete h.state.items[0].package_id;
      if (['released', 'mapping_pending', 'delivery_pending'].includes(status)) {
        h.state.items[0].package_id = 'ds_' + 'b'.repeat(32);
        h.state.items[0].document_result = releasedDocumentResult({ parserWarnings: [], visualResults: [] });
      }
      if (status === 'stopped') {
        h.state.items[0].error_code = 'SOURCE_READ_FAILED';
        h.state.items[0].document_result = notProcessedDocumentResult('SOURCE_READ_FAILED');
      }
      h.state.expires_at = '2099-01-01T00:00:00.000Z';
      delete h.state.items[0].private_artifact_plain;
      fs.writeFileSync(target, JSON.stringify(h.state));
      assert.throws(() => journal.readStateForMaintenance(h.state.token));
      h.state.items[0].private_artifact_plain = true;
      fs.writeFileSync(target, JSON.stringify(h.state));
      assert.strictEqual(journal.readStateForMaintenance(h.state.token).items[0].status, status);
    }
  } finally { h.cleanup(); }
});

test('renamed cipher envelopes survive expiry reads and the actual maintenance cleanup path', () => {
  for (const schema of ['datasecure-batch/2', 'datasecure-batch/4']) {
    const h = fixture(schema, '001_aaaaaaaaaaaaaaaaaaaaaaaa.workcopy');
    try {
      const item = h.state.items[0];
      if (schema.endsWith('/4')) item.private_artifact_plain = true;
      const envelope = Buffer.from('DSARTF01synthetic-legacy-encrypted-data');
      item.size = envelope.length;
      item.sha256 = crypto.createHash('sha256').update(envelope).digest('hex');
      const source = path.join(h.work, item.work_name);
      const target = path.join(h.root, h.state.token + '.json');
      fs.writeFileSync(source, envelope);
      fs.writeFileSync(target, JSON.stringify(h.state));
      const before = fs.readFileSync(target);
      let removes = 0;
      let bytesRead = 0;
      const journal = createBatchJournalStore({
        batchPath: () => target, workPath: () => h.work,
        io: { ...fs, constants: fs.constants, readSync(fd, bytes, offset, length, position) {
          assert.ok(position + length <= 8, 'header reads must stay bounded');
          const read = fs.readSync(fd, bytes, offset, Math.min(2, length), position);
          bytesRead += read;
          return read;
        } },
        safeRemoveWorkDirectory() { removes++; }
      });
      assert.throws(() => journal.readState(h.state.token), (e) => e.code === 'PRIVATE_ARTIFACT_LEGACY_ENCRYPTED_UNSUPPORTED');
      assert.strictEqual(bytesRead, 8);
      assert.throws(() => journal.readStateForMaintenance(h.state.token), (e) => e.code === 'PRIVATE_ARTIFACT_LEGACY_ENCRYPTED_UNSUPPORTED');
      const recovery = createBatchRecovery({
        batchRoot: () => h.root, batchPath: () => target,
        readStateForMaintenance: journal.readStateForMaintenance,
        safeRemoveWorkDirectory() { removes++; },
        acquireActiveLock() {}, releaseActiveLock() {}, liveLocalExecutor: () => false
      });
      const result = recovery.cleanupExpiredBatchSnapshots();
      assert.strictEqual(result.removed, 0);
      assert.strictEqual(result.failures, 1);
      assert.strictEqual(removes, 0);
      assert.deepStrictEqual(fs.readFileSync(target), before);
      assert.deepStrictEqual(fs.readFileSync(source), envelope);
    } finally { h.cleanup(); }
  }
});

test('ordinary snapshot expiry keeps cleanup and active reads avoid any header sweep', () => {
  const h = fixture('datasecure-batch/4', '001_aaaaaaaaaaaaaaaaaaaaaaaa.workcopy');
  try {
    h.state.items[0].private_artifact_plain = true;
    const source = path.join(h.work, h.state.items[0].work_name);
    const target = path.join(h.root, h.state.token + '.json');
    fs.writeFileSync(source, Buffer.alloc(2 * 1024 * 1024, 0x61));
    let bytesRead = 0;
    let removes = 0;
    const journal = createBatchJournalStore({
      batchPath: () => target, workPath: () => h.work,
      safeRemoveWorkDirectory() { removes++; },
      io: { ...fs, constants: fs.constants, readSync(fd, bytes, offset, length, position) {
        assert.ok(position + length <= 8);
        const read = fs.readSync(fd, bytes, offset, length, position);
        bytesRead += read;
        return read;
      } }
    });
    h.state.expires_at = '2099-01-01T00:00:00.000Z';
    fs.writeFileSync(target, JSON.stringify(h.state));
    journal.readState(h.state.token);
    assert.strictEqual(bytesRead, 0);
    journal.readStateForMaintenance(h.state.token);
    assert.strictEqual(bytesRead, 8);
    h.state.expires_at = '2020-01-01T00:00:00.000Z';
    fs.writeFileSync(target, JSON.stringify(h.state));
    assert.throws(() => journal.readState(h.state.token), /abgelaufen/u);
    assert.strictEqual(bytesRead, 16);
    assert.strictEqual(removes, 1);
    assert.strictEqual(fs.existsSync(target), false);
  } finally { h.cleanup(); }
});

done();
