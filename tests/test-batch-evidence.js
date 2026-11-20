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
const { CONTENT_OPTIONS_SCHEMA } = require('../plugins/data-secure/server/core/content-options');

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
      ...(schema !== 'datasecure-batch/1' ? { document_result: result } : {}),
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

test('v6 Standalone anonymization produces evidence without losing its snapshot identity', () => {
  const state = {
    ...batchState('released', 'datasecure-batch/6'),
    product_channel: 'standalone',
    output_naming_mode: 'neutral'
  };
  const record = makeEvidence(state, '2026-08-26T11:30:00.000Z', '6'.repeat(32));
  assert.strictEqual(record.batch_snapshot_schema, 'datasecure-batch/6');
  assert.deepStrictEqual(record.grade_counts, {
    complete: 1, usable_with_omissions: 0, not_processed: 0, unavailable: 0
  });
});

test('direct evidence entry points enforce the validated purpose for every new content lifecycle shape', () => {
  const content = { schema: CONTENT_OPTIONS_SCHEMA, markdownOutput: 'content-v1', scanOcr: true, imageOcr: false };
  const dated = '2026-10-14T00:00:00.000Z';
  for (const statuses of [['stopped'], ['pending'], ['released'], ['stopped', 'pending'], ['released', 'stopped']]) {
    const source = { ...batchState('stopped', 'datasecure-batch/7'), product_channel: 'standalone',
      processing_mode: 'markdown-only', standalone_document_review: true, content_options: content,
      items: statuses.map(status => batchState(status).items[0]) };
    let reads = 0;
    for (const produce of [evidenceRecord, require('../plugins/data-secure/server/gateway/batch-evidence').appendBatchEvidence]) {
      assert.throws(() => produce(source, dated, '7'.repeat(32), { publishedPackageRecord() { reads++; throw Error('must not aggregate'); } }),
        error => error.code === 'PROCESSING_MODE_FORBIDDEN');
    }
    assert.equal(reads, 0, 'direct producer checks before any result verification or evidence I/O');
    const opaqueItems = { ...source };
    Object.defineProperty(opaqueItems, 'items', { enumerable: true, get() { reads++; throw Error('must not inspect items'); } });
    for (const produce of [evidenceRecord, require('../plugins/data-secure/server/gateway/batch-evidence').appendBatchEvidence])
      assert.throws(() => produce(opaqueItems, dated, '7'.repeat(32)), error => error.code === 'PROCESSING_MODE_FORBIDDEN');
    assert.equal(reads, 0, 'the guard runs even before source-derived item getters');
  }
  const anonymized = { ...batchState('stopped', 'datasecure-batch/7'), product_channel: 'standalone',
    processing_mode: 'markdown-and-anonymize', standalone_document_review: true, content_options: content, output_naming_mode: 'neutral' };
  assert.equal(makeEvidence(anonymized, dated, '8'.repeat(32)).grade_counts.not_processed, 1);
  const positive = { ...anonymized, items: batchState('released').items };
  assert.equal(makeEvidence(positive, dated, '9'.repeat(32)).grade_counts.complete, 1);
  for (const changed of [{ ...anonymized, processing_mode: 'unknown' }, { ...anonymized, content_options: null },
    { ...anonymized, product_channel: 'plugin' }]) {
    let reads = 0;
    assert.throws(() => evidenceRecord(changed, dated, 'a'.repeat(32), { publishedPackageRecord() { reads++; } }));
    assert.equal(reads, 0);
  }
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

test('zero writes and rename failures retain the authoritative file and preserve unbound failed temps', () => {
  const dir = sandbox('evidence-atomic');
  try {
    const target = path.join(dir, 'evidence.json');
    const originalState = batchState();
    const original = makeEvidence(originalState, '2026-08-26T10:30:00.000Z', '4'.repeat(32));
    appendEvidenceRecord(original, { target, platform: 'win32' });
    const before = fs.readFileSync(target, 'utf8');
    const nextState = batchState('stopped');
    const next = makeEvidence(nextState, '2026-08-26T11:00:00.000Z', '5'.repeat(32));

    const zeroWrite = Object.create(fs), zeroRandom = Buffer.alloc(6, 0x86);
    const zeroTemp = target + '.tmp_' + zeroRandom.toString('hex');
    zeroWrite.writeSync = () => 0;
    assert.throws(() => appendEvidenceRecord(next, { target, fs: zeroWrite, platform: 'win32',
      randomBytes: length => { assert.strictEqual(length, 6); return zeroRandom; } }), /nicht sicher aktualisiert/);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), before);
    assert.strictEqual(fs.existsSync(zeroTemp), true, 'failed private temp is preserved without delete authority');
    assert.deepStrictEqual(fs.readFileSync(zeroTemp), Buffer.alloc(0));
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['evidence.json', path.basename(zeroTemp)].sort());

    const renameFailure = Object.create(fs), renameRandom = Buffer.alloc(6, 0x87);
    const renameTemp = target + '.tmp_' + renameRandom.toString('hex');
    renameFailure.renameSync = () => { throw new Error('RENAME_FAILED'); };
    assert.throws(() => appendEvidenceRecord(next, { target, fs: renameFailure, platform: 'win32',
      randomBytes: length => { assert.strictEqual(length, 6); return renameRandom; } }), /nicht sicher aktualisiert/);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), before);
    assert.strictEqual(fs.existsSync(renameTemp), true);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(renameTemp, 'utf8')), { schema: SCHEMA, records: [original, next] });
    assert.deepStrictEqual(fs.readFileSync(zeroTemp), Buffer.alloc(0));
    assert.deepStrictEqual(fs.readdirSync(dir).sort(),
      ['evidence.json', path.basename(zeroTemp), path.basename(renameTemp)].sort());
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

test('terminal evidence accepts the full 200-file product batch', () => {
  const state = {
    schema: 'datasecure-batch/2', created_at: '2026-09-07T10:00:00.000Z', profile: 'general', remove_images: false,
    items: Array.from({ length: 200 }, () => ({
      status: 'stopped', error_code: 'SOURCE_TEXT_INVALID',
      document_result: notProcessedDocumentResult('SOURCE_TEXT_INVALID')
    }))
  };
  const record = makeEvidence(state, '2026-09-07T11:00:00.000Z', 'f'.repeat(32));
  assert.strictEqual(record.counts.total, 200);
  assert.strictEqual(record.counts.stopped, 200);
  assert.strictEqual(record.grade_counts.not_processed, 200);
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

// These countercases call the real existing evidence/outbox APIs. Successful
// files, bytes, opens and renames use fs; only the stated fault is injected.
function evidence8687Fixture(kind, label) {
  const dir = sandbox('evidence-writer-' + kind + '-' + label);
  const previous = makeEvidence(batchState('stopped'), '2026-08-26T10:00:00.000Z', '1'.repeat(32));
  const record = makeEvidence(batchState('stopped'), '2026-08-26T11:00:00.000Z', '2'.repeat(32));
  const target = kind === 'append' ? path.join(dir, 'evidence.json')
    : path.join(dir, 'batch_evidence_pending_' + record.receipt_id + '.json');
  const priorTarget = kind === 'append' ? target
    : path.join(dir, 'batch_evidence_pending_' + previous.receipt_id + '.json');
  if (kind === 'append') appendEvidenceRecord(previous, { target, platform: 'win32' });
  else createPendingEvidence(previous, { auditDir: dir, platform: 'win32' });
  const before = fs.readFileSync(priorTarget), random = Buffer.alloc(6, 0x86);
  const temporary = target + '.tmp_' + random.toString('hex');
  const expected = kind === 'append' ? { schema: SCHEMA, records: [previous, record] } : record;
  return { kind, dir, target, priorTarget, before, previous, record, expected, temporary,
    payload: Buffer.from(JSON.stringify(expected, null, 2) + '\n', 'utf8'),
    foreign: Buffer.from('SYNTHETIC-FOREIGN-TEMP-8687'),
    run(io = fs, extra = {}) {
      const options = { ...extra, fs: io, platform: extra.platform || 'win32',
        randomBytes: length => { assert.strictEqual(length, 6); return random; } };
      return kind === 'append' ? appendEvidenceRecord(record, { ...options, target })
        : createPendingEvidence(record, { ...options, auditDir: dir });
    },
    unchanged() {
      assert.deepStrictEqual(fs.readFileSync(priorTarget), before);
      if (kind === 'pending') assert.strictEqual(fs.existsSync(target), false);
    },
    committed() {
      assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), expected);
      if (kind === 'pending') assert.deepStrictEqual(fs.readFileSync(priorTarget), before);
    }
  };
}
function evidence8687Refusal(action, kind) {
  let threw = false, caught;
  try { action(); } catch (error) { threw = true; caught = error; }
  assert.strictEqual(threw, true, 'falsy fault values must still refuse the public operation');
  assert.ok(caught instanceof require('../plugins/data-secure/server/runtime').SafeError);
  assert.strictEqual(caught.message, kind === 'append'
    ? 'Der lokale Batch-Nachweis konnte nicht sicher aktualisiert werden.'
    : 'Der lokale ausstehende Batch-Nachweis konnte nicht sicher gespeichert werden.');
  assert.strictEqual(caught.code, undefined);
  assert.strictEqual(Object.hasOwn(caught, 'cause'), false);
  return caught;
}
// Logical FD0 maps to real, exclusively owned test handles. Reuse is explicit,
// not an OS-FD-exhaustion/reuse experiment; process stdin is never closed.
function evidence8687ZeroFd(f, mode, primary) {
  const io = Object.create(fs), witness = path.join(f.dir, 'unrelated-fd-witness');
  const witnessBytes = Buffer.from('UNRELATED-OPEN-FD-8687');
  fs.writeFileSync(witness, witnessBytes, { flag: 'wx', mode: 0o600 });
  let held = false, actual, phase = 'writer', witnessFd;
  const counts = { opens: 0, writes: 0, closes: 0, renames: 0, unlinks: 0 };
  io.openSync = (candidate, ...args) => {
    const fd = fs.openSync(candidate, ...args);
    if (candidate !== f.temporary) return fd;
    counts.opens++; actual = fd; held = true; return 0;
  };
  io.writeSync = (fd, buffer, offset, length, position) => {
    if (fd !== 0 || !held) return fs.writeSync(fd, buffer, offset, length, position);
    counts.writes++;
    if (mode === 'write-close') throw primary;
    return fs.writeSync(actual, buffer, offset, Math.min(length, 7), position);
  };
  io.fsyncSync = fd => fs.fsyncSync(fd === 0 && held ? actual : fd);
  io.closeSync = fd => {
    if (fd !== 0 || !held) return fs.closeSync(fd);
    counts.closes++;
    fs.closeSync(actual); held = false;
    if (phase === 'writer' && mode === 'reuse-close') {
      witnessFd = fs.openSync(witness, 'r');
      actual = witnessFd; held = true; phase = 'witness';
      throw primary; // A second close(0) would close this other real handle.
    }
    if (phase === 'writer' && mode === 'write-close') throw Error('SECONDARY_CLOSE_8687');
  };
  io.renameSync = (...args) => { counts.renames++; return fs.renameSync(...args); };
  io.unlinkSync = (...args) => { counts.unlinks++; return fs.unlinkSync(...args); };
  return { io, counts, witnessFd: () => witnessFd,
    checkWitness() {
      assert.ok(held && phase === 'witness', 'unrelated descriptor lifetime must remain owned and open');
      const bytes = Buffer.alloc(witnessBytes.length);
      assert.strictEqual(fs.readSync(witnessFd, bytes, 0, bytes.length, 0), bytes.length);
      assert.deepStrictEqual(bytes, witnessBytes);
    },
    closeOwned() { if (held) { fs.closeSync(actual); held = false; } }
  };
}
for (const kind of ['append', 'pending']) {
  test('writer86 ' + kind + ' preserves a real exclusive-open collision without any unlink or close', () => {
    const f = evidence8687Fixture(kind, 'collision'), io = Object.create(fs);
    let opens = 0, closes = 0, writes = 0, renames = 0, unlinks = 0, collision;
    io.openSync = (candidate, flags, ...args) => {
      if (candidate !== f.temporary) return fs.openSync(candidate, flags, ...args);
      opens++; assert.ok(flags & fs.constants.O_CREAT); assert.ok(flags & fs.constants.O_EXCL);
      fs.writeFileSync(candidate, f.foreign, { flag: 'wx', mode: 0o600 });
      try { return fs.openSync(candidate, flags, ...args); }
      catch (error) { collision = error; throw error; } // Actual EEXIST.
    };
    io.writeSync = (...args) => { writes++; return fs.writeSync(...args); };
    io.closeSync = (...args) => { closes++; return fs.closeSync(...args); };
    io.renameSync = (...args) => { renames++; return fs.renameSync(...args); };
    io.unlinkSync = (...args) => { unlinks++; return fs.unlinkSync(...args); };
    try {
      // append's read of its already-authoritative target has its own real FD.
      const readClose = kind === 'append' ? 1 : 0;
      evidence8687Refusal(() => f.run(io), kind);
      assert.strictEqual(collision.code, 'EEXIST');
      assert.strictEqual(opens, 1); assert.strictEqual(writes, 0);
      assert.strictEqual(closes, readClose); assert.strictEqual(renames, 0); assert.strictEqual(unlinks, 0);
      assert.strictEqual(fs.existsSync(f.temporary), true);
      assert.deepStrictEqual(fs.readFileSync(f.temporary), f.foreign); f.unchanged();
    } finally { cleanup(f.dir); }
  });
  test('writer86 ' + kind + ' preserves a replaced temp after a real namespace move and modeled rename refusal', () => {
    const f = evidence8687Fixture(kind, 'replaced'), io = Object.create(fs);
    const preserved = path.join(f.dir, 'preserved-producer-temp');
    let renames = 0, unlinks = 0;
    io.renameSync = (from, to) => {
      renames++; assert.strictEqual(from, f.temporary); assert.strictEqual(to, f.target);
      fs.renameSync(from, preserved); // Writer FD has really closed already.
      fs.writeFileSync(from, f.foreign, { flag: 'wx', mode: 0o600 });
      throw Object.assign(Error('MODELED_RENAME_8687'), { code: 'EIO' });
    };
    io.unlinkSync = (...args) => { unlinks++; return fs.unlinkSync(...args); };
    try {
      evidence8687Refusal(() => f.run(io), kind);
      assert.strictEqual(renames, 1); assert.strictEqual(unlinks, 0);
      assert.strictEqual(fs.existsSync(f.temporary), true);
      assert.deepStrictEqual(fs.readFileSync(f.temporary), f.foreign);
      assert.deepStrictEqual(fs.readFileSync(preserved), f.payload); f.unchanged();
    } finally { cleanup(f.dir); }
  });
  test('writer86 ' + kind + ' retains real committed bytes and foreign old-temp name after modeled parent sync failure', () => {
    const f = evidence8687Fixture(kind, 'parent-sync'), io = Object.create(fs);
    const handleFile = path.join(f.dir, 'modeled-parent-handle');
    fs.writeFileSync(handleFile, 'PARENT-SYNC-HANDLE-8687', { flag: 'wx', mode: 0o600 });
    let writerFd, parentFd, writerHeld = false, parentHeld = false;
    let fileSyncs = 0, parentSyncs = 0, writerCloses = 0, parentCloses = 0, renames = 0, unlinks = 0;
    io.openSync = (candidate, flags, ...args) => {
      // Explicit POSIX helper model backed by an owned regular-file FD:
      // this is not native directory-fsync acceptance on Windows.
      if (candidate === f.dir) {
        assert.strictEqual(flags, fs.constants.O_RDONLY);
        parentFd = fs.openSync(handleFile, 'r+'); parentHeld = true; return parentFd;
      }
      const fd = fs.openSync(candidate, flags, ...args);
      if (candidate === f.temporary) { writerFd = fd; writerHeld = true; }
      return fd;
    };
    io.fsyncSync = fd => {
      fs.fsyncSync(fd);
      if (parentHeld && fd === parentFd) {
        parentSyncs++;
        fs.writeFileSync(f.temporary, f.foreign, { flag: 'wx', mode: 0o600 });
        throw Object.assign(Error('MODELED_PARENT_SYNC_8687'), { code: 'EIO' });
      }
      if (writerHeld && fd === writerFd) fileSyncs++;
    };
    io.closeSync = fd => {
      fs.closeSync(fd);
      if (writerHeld && fd === writerFd) { writerCloses++; writerHeld = false; }
      else if (parentHeld && fd === parentFd) { parentCloses++; parentHeld = false; }
    };
    io.renameSync = (...args) => { renames++; return fs.renameSync(...args); };
    io.unlinkSync = (...args) => { unlinks++; return fs.unlinkSync(...args); };
    try {
      evidence8687Refusal(() => f.run(io, { platform: 'linux' }), kind);
      assert.strictEqual(fileSyncs, 1); assert.strictEqual(parentSyncs, 1);
      assert.strictEqual(writerCloses, 1); assert.strictEqual(parentCloses, 1);
      assert.strictEqual(renames, 1); assert.strictEqual(unlinks, 0);
      f.committed();
      assert.strictEqual(fs.existsSync(f.temporary), true);
      assert.deepStrictEqual(fs.readFileSync(f.temporary), f.foreign);
      assert.strictEqual(f.run(), false, 'actual committed receipt remains idempotent after lost sync acknowledgement');
      f.committed();
    } finally {
      if (writerHeld) fs.closeSync(writerFd);
      if (parentHeld) fs.closeSync(parentFd);
      cleanup(f.dir);
    }
  });
  test('writer87 ' + kind + ' consumes a logical FD0 close before Error or falsy refusal and never closes its reused witness', () => {
    const failures = [Object.freeze(Object.assign(Error('PRIVATE_CLOSE_8687'), { code: 'EIO' })), null, undefined, false, 0, ''];
    for (let index = 0; index < failures.length; index++) {
      const f = evidence8687Fixture(kind, 'close-' + index), h = evidence8687ZeroFd(f, 'reuse-close', failures[index]);
      try {
        evidence8687Refusal(() => f.run(h.io), kind);
        assert.strictEqual(h.counts.opens, 1); assert.strictEqual(h.counts.closes, 1);
        assert.strictEqual(h.counts.renames, 0); assert.strictEqual(h.counts.unlinks, 0);
        h.checkWitness(); f.unchanged();
        assert.strictEqual(fs.existsSync(f.temporary), true);
        assert.deepStrictEqual(fs.readFileSync(f.temporary), f.payload);
      } finally { h.closeOwned(); cleanup(f.dir); }
    }
  });
  test('writer87 ' + kind + ' keeps FD0 short-write success and primary-write plus secondary-close refusal separate', () => {
    for (const mode of ['short', 'write-close']) {
      const f = evidence8687Fixture(kind, mode);
      const h = evidence8687ZeroFd(f, mode, Object.freeze(Error('PRIMARY_WRITE_8687')));
      try {
        if (mode === 'short') {
          assert.strictEqual(f.run(h.io), true); f.committed();
          assert.ok(h.counts.writes > 1); assert.strictEqual(h.counts.renames, 1);
          assert.strictEqual(fs.existsSync(f.temporary), false, 'the real successful rename consumes its temp');
        } else {
          evidence8687Refusal(() => f.run(h.io), kind); f.unchanged();
          assert.strictEqual(h.counts.writes, 1); assert.strictEqual(h.counts.renames, 0);
          assert.strictEqual(fs.existsSync(f.temporary), true);
          assert.deepStrictEqual(fs.readFileSync(f.temporary), Buffer.alloc(0));
        }
        assert.strictEqual(h.counts.opens, 1); assert.strictEqual(h.counts.closes, 1);
        assert.strictEqual(h.counts.unlinks, 0);
      } finally { h.closeOwned(); cleanup(f.dir); }
    }
  });
}

done();
