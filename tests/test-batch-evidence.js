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
  LEGACY_SCHEMA,
  OLDEST_LEGACY_SCHEMA
} = require('../plugins/data-secure/server/gateway/batch-evidence');
const {
  releasedDocumentResult,
  notProcessedDocumentResult
} = require('../plugins/data-secure/server/gateway/document-result-grade');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch evidence durable store');

function batchState(status = 'released', schema = 'datasecure-batch/2') {
  const packageId = `ds_${'a'.repeat(32)}`;
  const result = status === 'released'
    ? releasedDocumentResult({ parserWarnings: [], visualResults: [], unreviewedVisualCount: 0, imagesRemovedByExplicitRequest: 0 })
    : notProcessedDocumentResult('SOURCE_TEXT_INVALID');
  return {
    schema,
    created_at: '2026-08-26T10:00:00.000Z',
    profile: 'general',
    remove_images: false,
    items: [{
      status,
      ...(schema === 'datasecure-batch/2' ? { document_result: result } : {}),
      ...(status === 'released' ? { package_id: packageId } : { error_code: 'SOURCE_TEXT_INVALID' })
    }]
  };
}

function resultOptions(state) {
  return {
    publishedPackageRecord(packageId) {
      const item = state.items.find((candidate) => candidate.package_id === packageId);
      return item ? { state: 'verified', document_result: item.document_result } : { state: 'missing', document_result: null };
    }
  };
}

function makeEvidence(state, timestamp, receiptId) {
  return evidenceRecord(state, timestamp, receiptId, resultOptions(state));
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
    const state = batchState();
    const record = makeEvidence(state, '2026-08-26T11:00:00.000Z', '1'.repeat(32));
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

test('v1 and v2 migration preserve every legacy record without inventing grades', () => {
  const dir = sandbox('evidence-legacy');
  try {
    const target = path.join(dir, 'evidence.json');
    const legacyV2 = makeEvidence(batchState('released', 'datasecure-batch/1'), '2026-08-26T10:30:00.000Z', '2'.repeat(32));
    delete legacyV2.grade_counts;
    delete legacyV2.omission_counts;
    legacyV2.schema = LEGACY_SCHEMA;
    fs.writeFileSync(target, `${JSON.stringify({ schema: LEGACY_SCHEMA, records: [legacyV2] })}\n`, 'utf8');
    const nextState = batchState('stopped');
    const next = makeEvidence(nextState, '2026-08-26T11:00:00.000Z', '3'.repeat(32));
    assert.strictEqual(appendEvidenceRecord(next, { target, platform: 'win32' }), true);
    const migrated = readEvidence(target);
    assert.strictEqual(migrated.schema, SCHEMA);
    assert.deepStrictEqual(migrated.records[0], legacyV2);
    assert.deepStrictEqual(migrated.records[1], next);

    const oldestTarget = path.join(dir, 'oldest.json');
    const oldest = structuredClone(legacyV2);
    delete oldest.receipt_id;
    oldest.schema = OLDEST_LEGACY_SCHEMA;
    fs.writeFileSync(oldestTarget, `${JSON.stringify({ schema: OLDEST_LEGACY_SCHEMA, records: [oldest] })}\n`, 'utf8');
    assert.deepStrictEqual(readEvidence(oldestTarget).records, [oldest]);

    const contradictoryTarget = path.join(dir, 'contradictory.json');
    const contradictory = { ...legacyV2, outcome: 'incomplete' };
    fs.writeFileSync(contradictoryTarget, `${JSON.stringify({ schema: LEGACY_SCHEMA, records: [contradictory] })}\n`, 'utf8');
    assert.throws(() => readEvidence(contradictoryTarget), /ungültiges Format/);
  } finally { cleanup(dir); }
});

test('zero writes and rename failures retain the previous authoritative file and clean temps', () => {
  const dir = sandbox('evidence-atomic');
  try {
    const target = path.join(dir, 'evidence.json');
    const originalState = batchState();
    const original = makeEvidence(originalState, '2026-08-26T10:30:00.000Z', '4'.repeat(32));
    appendEvidenceRecord(original, { target, platform: 'win32' });
    const before = fs.readFileSync(target, 'utf8');
    const nextState = batchState('stopped');
    const next = makeEvidence(nextState, '2026-08-26T11:00:00.000Z', '5'.repeat(32));

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
    const state = batchState();
    const record = makeEvidence(state, '2026-08-26T11:00:00.000Z', '6'.repeat(32));
    assert.throws(() => appendEvidenceRecord(record, { target, platform: 'win32' }), /ungültiges Format/);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), '{damaged');
  } finally { cleanup(dir); }
});

test('the metadata-only outbox creates, lists and removes only the exact receipt', () => {
  const dir = sandbox('evidence-outbox');
  try {
    const state = batchState();
    const record = makeEvidence(state, '2026-08-26T11:00:00.000Z', '7'.repeat(32));
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

test('v2 terminal evidence aggregates all three grades and only the two allowed omissions', () => {
  const complete = releasedDocumentResult({
    parserWarnings: [], visualResults: [], unreviewedVisualCount: 0, imagesRemovedByExplicitRequest: 0
  });
  const omissions = releasedDocumentResult({
    parserWarnings: [],
    visualResults: [{ status: 'removed' }, { status: 'review_required' }],
    unreviewedVisualCount: 0,
    imagesRemovedByExplicitRequest: 1
  });
  const stopped = notProcessedDocumentResult('SOURCE_ENCRYPTED_UNSUPPORTED');
  const state = {
    schema: 'datasecure-batch/2', created_at: '2026-08-26T10:00:00.000Z', profile: 'auto', remove_images: false,
    items: [
      { status: 'released', package_id: `ds_${'a'.repeat(32)}`, document_result: complete },
      { status: 'released', package_id: `ds_${'b'.repeat(32)}`, document_result: omissions },
      { status: 'stopped', error_code: 'SOURCE_ENCRYPTED_UNSUPPORTED', document_result: stopped }
    ]
  };
  const record = makeEvidence(state, '2026-08-26T11:00:00.000Z', '9'.repeat(32));
  assert.deepStrictEqual(record.grade_counts, {
    complete: 1, usable_with_omissions: 1, not_processed: 1, unavailable: 0
  });
  assert.deepStrictEqual(record.omission_counts, {
    images_removed_by_request: 1, visual_assets_withheld_locally: 1
  });
  assert.deepStrictEqual(record.error_codes, ['SOURCE_ENCRYPTED_UNSUPPORTED']);
  assert.doesNotMatch(JSON.stringify(record), /package_id|batch_token|sha256|original_name|path/iu);
});

test('package mismatches, missing v2 grades and content-shaped reason codes fail closed', () => {
  const state = batchState();
  assert.throws(
    () => evidenceRecord(state, '2026-08-26T11:00:00.000Z', 'a'.repeat(32), {
      publishedPackageRecord: () => ({ state: 'verified', document_result: releasedDocumentResult({
        parserWarnings: [], visualResults: [{ status: 'review_required' }], unreviewedVisualCount: 0,
        imagesRemovedByExplicitRequest: 0
      }) })
    }),
    /stimmt nicht mit dem veröffentlichten Paket überein/
  );
  const missing = batchState();
  delete missing.items[0].document_result;
  assert.throws(() => makeEvidence(missing, '2026-08-26T11:00:00.000Z', 'b'.repeat(32)), /ungültigen Ergebnisgrad/);
  assert.throws(() => notProcessedDocumentResult('ALICE_MUSTERMANN'), /Ungültiger Dokumentergebnisgrad/);
});

done();
