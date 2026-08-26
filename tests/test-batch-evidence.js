'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  appendEvidenceRecord,
  createPendingEvidence,
  listPendingEvidence,
  removePendingEvidence,
  evidenceRecord,
  readEvidence,
  SCHEMA,
  LEGACY_SCHEMA
} = require('../plugins/data-secure/server/gateway/batch-evidence');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch evidence durable store');

function batchState(status = 'released', schema = 'datasecure-batch/2') {
  return {
    schema,
    created_at: '2026-08-26T10:00:00.000Z',
    profile: 'general',
    remove_images: false,
    items: [{ status }]
  };
}

function sandbox(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `datasecure-${name}-`));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('receipt ids make append idempotent and conflicting reuse fails closed', () => {
  const dir = sandbox('evidence-id');
  try {
    const target = path.join(dir, 'evidence.json');
    const record = evidenceRecord(batchState(), '2026-08-26T11:00:00.000Z', '1'.repeat(32));
    assert.strictEqual(record.batch_snapshot_schema, 'datasecure-batch/2');
    assert.strictEqual(appendEvidenceRecord(record, { target, platform: 'win32' }), true);
    const first = fs.readFileSync(target, 'utf8');
    assert.strictEqual(appendEvidenceRecord(record, { target, platform: 'win32' }), false);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), first);
    const conflict = { ...record, profile: 'contract' };
    assert.throws(() => appendEvidenceRecord(conflict, { target, platform: 'win32' }), /widersprüchlichen Beleg/);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), first);
  } finally { cleanup(dir); }
});

test('v1 migration preserves every legacy record unchanged beside new v2 receipts', () => {
  const dir = sandbox('evidence-legacy');
  try {
    const target = path.join(dir, 'evidence.json');
    const legacy = evidenceRecord(batchState('released', 'datasecure-batch/1'), '2026-08-26T10:30:00.000Z', '2'.repeat(32));
    delete legacy.receipt_id;
    legacy.schema = LEGACY_SCHEMA;
    fs.writeFileSync(target, `${JSON.stringify({ schema: LEGACY_SCHEMA, records: [legacy] })}\n`, 'utf8');
    const next = evidenceRecord(batchState('stopped'), '2026-08-26T11:00:00.000Z', '3'.repeat(32));
    assert.strictEqual(appendEvidenceRecord(next, { target, platform: 'win32' }), true);
    const migrated = readEvidence(target);
    assert.strictEqual(migrated.schema, SCHEMA);
    assert.deepStrictEqual(migrated.records[0], legacy);
    assert.deepStrictEqual(migrated.records[1], next);
  } finally { cleanup(dir); }
});

test('zero writes and rename failures retain the previous authoritative file and clean temps', () => {
  const dir = sandbox('evidence-atomic');
  try {
    const target = path.join(dir, 'evidence.json');
    const original = evidenceRecord(batchState(), '2026-08-26T10:30:00.000Z', '4'.repeat(32));
    appendEvidenceRecord(original, { target, platform: 'win32' });
    const before = fs.readFileSync(target, 'utf8');
    const next = evidenceRecord(batchState('stopped'), '2026-08-26T11:00:00.000Z', '5'.repeat(32));

    const zeroWrite = Object.create(fs);
    zeroWrite.writeSync = () => 0;
    assert.throws(() => appendEvidenceRecord(next, { target, fs: zeroWrite, platform: 'win32' }), /nicht sicher aktualisiert/);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), before);
    assert.deepStrictEqual(fs.readdirSync(dir), ['evidence.json']);

    const renameFailure = Object.create(fs);
    renameFailure.renameSync = () => { throw new Error('RENAME_FAILED'); };
    assert.throws(() => appendEvidenceRecord(next, { target, fs: renameFailure, platform: 'win32' }), /nicht sicher aktualisiert/);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), before);
    assert.deepStrictEqual(fs.readdirSync(dir), ['evidence.json']);
  } finally { cleanup(dir); }
});

test('damaged evidence is never truncated or replaced during repair', () => {
  const dir = sandbox('evidence-damaged');
  try {
    const target = path.join(dir, 'evidence.json');
    fs.writeFileSync(target, '{damaged', 'utf8');
    const record = evidenceRecord(batchState(), '2026-08-26T11:00:00.000Z', '6'.repeat(32));
    assert.throws(() => appendEvidenceRecord(record, { target, platform: 'win32' }), /ungültiges Format/);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), '{damaged');
  } finally { cleanup(dir); }
});

test('the metadata-only outbox creates, lists and removes only the exact receipt', () => {
  const dir = sandbox('evidence-outbox');
  try {
    const record = evidenceRecord(batchState(), '2026-08-26T11:00:00.000Z', '7'.repeat(32));
    const options = { auditDir: dir, platform: 'win32' };
    assert.strictEqual(createPendingEvidence(record, options), true);
    assert.strictEqual(createPendingEvidence(record, options), false);
    assert.deepStrictEqual(listPendingEvidence(options), [record]);
    assert.strictEqual(removePendingEvidence(record, options), true);
    assert.strictEqual(removePendingEvidence(record, options), false);
    assert.deepStrictEqual(fs.readdirSync(dir), []);
    fs.mkdirSync(path.join(dir, `batch_evidence_pending_${'8'.repeat(32)}.json`));
    assert.throws(() => listPendingEvidence(options), /unsicher/);
  } finally { cleanup(dir); }
});

done();
