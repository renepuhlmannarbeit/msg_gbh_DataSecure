'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');
const { test, testAsync, assert, done } = createSuite('Markdown batch, store and export');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-markdown-batch-'));
process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'data');
process.env.EU_PRIVACY_ROOT = path.join(root, 'private');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(root, 'visible');
fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT);
const { SafeError } = require('../plugins/data-secure/server/runtime');
const { safeRemovePrivateTree } = require('../plugins/data-secure/server/gateway/common');
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const store = require('../plugins/data-secure/server/standalone/markdown-store');
const { createBatchItemProcessor } = require('../plugins/data-secure/server/gateway/batch-item-processor');
const { createBatchReconciliation } = require('../plugins/data-secure/server/gateway/batch-reconciliation');
const { createBatchDelivery } = require('../plugins/data-secure/server/gateway/batch-delivery');
const { createBatchResultAccess } = require('../plugins/data-secure/server/gateway/batch-results');
const { exportCompletedState, visibleExportDirectory, visibleExportStatus, replayPendingResultExports,
  recordPath, validRecord, MARKDOWN_SCHEMA } = require('../plugins/data-secure/server/gateway/result-export');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
let serial = 0;
const nextId = () => (++serial).toString(16).padStart(32, '0');
const sourceText = 'Name: Max Mustermann\r\nUnternehmen: Nordstern GmbH\r\nIBAN: DE89 3704 0044 0532 0130 00\r\n';
function extraction(text = sourceText, incomplete = false) {
  return createMarkdownExtraction({ source_type: 'txt', markdown: text, coverage: incomplete
    ? { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED'] }
    : { status: 'complete', reason_codes: [] } });
}
function stateFor(items) {
  return { schema: 'datasecure-batch/5', product_channel: 'standalone', processing_mode: 'markdown-only',
    token: crypto.randomBytes(32).toString('hex'), created_at: '2026-09-06T08:00:00.000Z', items, io_summary: {} };
}
function processorFixture(text = sourceText, extension = '.txt') {
  const item = { id: nextId(), name: `synthetic${extension}`, source_label: `Kunde/synthetic${extension}`, status: 'pending' };
  const state = stateFor([item]);
  const original = path.join(root, `original-${item.id}${extension}`);
  fs.writeFileSync(original, text, { flag: 'wx' });
  const sourceBytes = fs.readFileSync(original);
  const entry = { name: item.name, private_bytes: Buffer.from(sourceBytes), expected_sha256: digest(sourceBytes) };
  const writes = [];
  const faults = { failWrite: 0 };
  const prohibited = () => { throw new Error('Privacy operation invoked for conversion'); };
  const processor = createBatchItemProcessor({ SafeError,
    writeState(value) {
      writes.push(structuredClone(value));
      if (writes.length === faults.failWrite) throw new Error('synthetic journal write failure');
    },
    anonymizeNext: prohibited, packageIdForItem: prohibited, reviewSingleBatchTextLocally: prohibited,
    incrementPrivateIoSummary: prohibited, ensureMappingOutbox: prohibited, markMappingPending: prohibited,
    commitPendingMapping: prohibited, appendMapping() {}, invalidateUnpublishedBatchCopies() {},
    cleanupTerminalWorkCopy(_state, value) { delete value.work_copy_cleanup_pending; },
    createPhaseRecorder: () => ({ mark() {}, snapshot: () => ({}) }),
    publicProgress: () => ({}), writeTerminalEvidence: () => true,
    retryableCodes: new Set(['REQUEST_CANCELLED', 'PROCESSING_INTERRUPTED', 'PARSER_TIMEOUT'])
  });
  return { processor, state, item, entry, writes, faults, original, sourceBytes };
}
function deliveryFor(state) {
  return createBatchDelivery({ SafeError, active: new Set(), acquireActiveLock() {}, releaseActiveLock() { return true; },
    readState: () => state, writeState() {}, assertLocalExecutorAccess() {},
    regularPublishedPackage: () => false,
    issueReadCapability() { throw new Error('No privacy capability for Markdown'); },
    publicProgress: () => ({}), writeTerminalEvidence: () => true });
}
async function run() {
  await testAsync('real store preserves names, companies, IBAN and bytes with independent dm identity', async () => {
    const id = `dm_${nextId()}`;
    const identity = await store.publishMarkdownArtifact(extraction(), id);
    assert.strictEqual(store.readMarkdownArtifact(id).markdown, sourceText);
    assert.strictEqual(store.verifyMarkdownItem(identity), true);
    assert.deepStrictEqual(Object.keys(identity).sort(), ['artifact_bytes', 'artifact_id', 'artifact_sha256', 'extraction_grade', 'reason_codes']);
    assert.strictEqual(store.verifyMarkdownItem({ ...identity, artifact_sha256: '0'.repeat(64) }), false);
    await assert.rejects(() => store.publishMarkdownArtifact(extraction('different'), id));
    assert.strictEqual(store.readMarkdownArtifact(id).markdown, sourceText);
  });
  await testAsync('incomplete OCR conversion is saved with explicit warnings, never labeled anonymized', async () => {
    const id = `dm_${nextId()}`;
    const identity = await store.publishMarkdownArtifact(extraction(sourceText, true), id);
    assert.strictEqual(identity.extraction_grade, 'incomplete');
    const state = stateFor([{ ...identity, status: 'released', source_label: 'scan.pdf' }]);
    assert.deepStrictEqual(exportCompletedState(state), { exported: 1, pending: 0, available: true });
    const run = visibleExportDirectory(state.token);
    assert.strictEqual(path.basename(path.dirname(run)), 'DataSecure-Markdown');
    assert.strictEqual(fs.readFileSync(path.join(run, 'Dokument-001-konvertiert.md'), 'utf8'), sourceText);
    const mapping = fs.readFileSync(path.join(run, 'DataSecure-Zuordnung.csv'), 'utf8');
    assert.match(mapping, /Nicht anonymisiert/);
    assert.match(mapping, /OCR-Texterkennung nicht fachlich geprüft/);
    assert.doesNotMatch(mapping, /Text vollständig extrahiert|Anonymisiertes Ergebnis/);
    assert.strictEqual(fs.existsSync(path.join(process.env.EU_PRIVACY_RESULT_ROOT, 'DataSecure-Output')), false);
  });
  await testAsync('artifact storage preserves an intentional Unicode BOM and rejects tampered text', async () => {
    const id = `dm_${nextId()}`;
    const text = '\ufeff' + sourceText;
    const identity = await store.publishMarkdownArtifact(extraction(text), id);
    assert.strictEqual(store.readMarkdownArtifact(id).markdown, text);
    const document = path.join(store.artifactRoot(), id, `${id}.md`);
    const bytes = fs.readFileSync(document); bytes[bytes.length - 1] ^= 1;
    fs.writeFileSync(document, bytes);
    assert.strictEqual(store.verifyMarkdownItem(identity), false);
  });
  await testAsync('real TXT conversion crosses processing/publication/delivery without privacy hooks', async () => {
    const f = processorFixture();
    const result = await f.processor.processSingleBatchItem(f.state, f.item, f.entry, { convertBuffer: extractMarkdownBuffer });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(f.item.status, 'delivery_pending');
    assert.ok(store.verifyMarkdownItem(f.item));
    assert.strictEqual(f.writes.some((value) => value.items[0].status === 'delivery_pending'), true);
    for (const key of ['package_id', 'package_identity', 'document_result', 'analysis_acknowledged', 'pseudonym_seed']) assert.ok(!Object.hasOwn(f.item, key));
    assert.strictEqual(f.entry.private_bytes.every((byte) => byte === 0), true);
    assert.deepStrictEqual(fs.readFileSync(f.original), f.sourceBytes);
    const delivery = deliveryFor(f.state);
    const pending = delivery.deliveryResult(f.state, f.item);
    assert.strictEqual(pending.anonymized, false);
    assert.ok(!Object.hasOwn(pending, 'read_capability'));
    delivery.finalizePublishedPackageLocally(f.state.token, f.item.artifact_id);
    assert.strictEqual(f.item.status, 'released');
    assert.ok(!Object.hasOwn(f.item, 'analysis_acknowledged'));
  });
  await testAsync('crash after committed artifact recovers the exact identity without reconversion', async () => {
    const f = processorFixture();
    f.faults.failWrite = 2;
    const result = await f.processor.processSingleBatchItem(f.state, f.item, f.entry, { convertBuffer: extractMarkdownBuffer });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(f.item.status, 'processing');
    const expected = f.item.artifact_id;
    assert.strictEqual(expected, `dm_${f.item.id}`);
    assert.ok(!Object.hasOwn(f.item, 'artifact_sha256'));
    assert.strictEqual(createBatchReconciliation().reconcilePublishedItems(f.state), true);
    assert.strictEqual(f.item.status, 'delivery_pending');
    assert.strictEqual(f.item.artifact_id, expected);
    assert.ok(store.verifyMarkdownItem(f.item));
    assert.strictEqual(createBatchReconciliation().reconcilePublishedItems(f.state), false);
  });
  await testAsync('artifact readers reject hard-linked document aliases and wrong journal identities', async () => {
    const identity = await store.publishMarkdownArtifact(extraction(), `dm_${nextId()}`);
    const document = path.join(store.artifactRoot(), identity.artifact_id, `${identity.artifact_id}.md`);
    const alias = path.join(root, `alias-${nextId()}.md`);
    fs.linkSync(document, alias);
    try { assert.strictEqual(store.verifyMarkdownItem(identity), false); }
    finally { fs.unlinkSync(alias); }
    assert.strictEqual(store.verifyMarkdownItem({ ...identity, id: nextId() }), false);
    assert.strictEqual(store.verifyMarkdownItem({ ...identity, document_result: {} }), false);
    assert.strictEqual(store.verifyMarkdownItem(identity), true);
  });
  await testAsync('mixed unfinished batch cannot freeze or export only its already-converted subset', async () => {
    const identity = await store.publishMarkdownArtifact(extraction(), `dm_${nextId()}`);
    const state = stateFor([{ ...identity, status: 'released', source_label: 'ready.txt' }, { status: 'pending' }]);
    assert.deepStrictEqual(exportCompletedState(state), { exported: 0, pending: 1, available: false });
    assert.strictEqual(fs.existsSync(recordPath(state.token)), false);
  });
  await testAsync('pending mapping replays in the Markdown destination without rewriting any output', async () => {
    const identity = await store.publishMarkdownArtifact(extraction('unchanged', true), `dm_${nextId()}`);
    const state = stateFor([{ ...identity, status: 'released', source_label: 'scan.pdf' }]);
    const previous = fs.linkSync;
    fs.linkSync = function(from, to, ...rest) {
      if (String(to).endsWith('DataSecure-Zuordnung.csv')) throw Object.assign(new Error('synthetic'), { code: 'EIO' });
      return previous.call(fs, from, to, ...rest);
    };
    try { assert.deepStrictEqual(exportCompletedState(state), { exported: 1, pending: 0, available: false }); }
    finally { fs.linkSync = previous; }
    assert.strictEqual(visibleExportDirectory(state.token), '');
    const record = JSON.parse(fs.readFileSync(recordPath(state.token), 'utf8'));
    const document = path.join(process.env.EU_PRIVACY_RESULT_ROOT, 'DataSecure-Markdown', record.run_directory, 'Dokument-001-konvertiert.md');
    const before = fs.statSync(document);
    const replay = replayPendingResultExports();
    assert.strictEqual(replay.failures, 0);
    assert.strictEqual(replay.exported, 0);
    assert.ok(visibleExportDirectory(state.token));
    assert.strictEqual(fs.statSync(document).ino, before.ino);
    assert.strictEqual(fs.statSync(document).mtimeMs, before.mtimeMs);
  });
  await testAsync('a legacy, plugin-owned or pseudonym-bearing mode cannot reach conversion hooks', async () => {
    for (const change of [{ schema: 'datasecure-batch/4' }, { product_channel: 'plugin' }, { pseudonym_seed: 'secret' }]) {
      const f = processorFixture(); Object.assign(f.state, change);
      await assert.rejects(() => f.processor.processSingleBatchItem(f.state, f.item, f.entry, { convertBuffer: extractMarkdownBuffer }));
      assert.strictEqual(f.item.status, 'pending');
      assert.strictEqual(f.writes.length, 0);
    }
  });
  await testAsync('a publication callback failure retains an artifact for recovery, while precommit failure leaves none', async () => {
    const id = `dm_${nextId()}`;
    await assert.rejects(() => store.publishMarkdownArtifact(extraction(), id, { afterPublish() { throw new Error('synthetic'); } }),
      (error) => error.code === 'BATCH_PUBLICATION_UNCONFIRMED');
    assert.strictEqual(store.readMarkdownArtifact(id).markdown, sourceText);
    const beforeId = `dm_${nextId()}`;
    await assert.rejects(() => store.publishMarkdownArtifact(extraction(), beforeId, { beforePublish() { throw new Error('synthetic'); } }));
    assert.strictEqual(fs.existsSync(path.join(store.artifactRoot(), beforeId)), false);
    assert.strictEqual(fs.readdirSync(store.artifactRoot()).some((name) => name.startsWith('.pending-')), false);
  });
  await testAsync('CSV input content remains present and malformed CSV is stopped, not privacy-reviewed', async () => {
    const good = processorFixture('Name,Firma\nMax Mustermann,Nordstern GmbH\n', '.csv');
    assert.strictEqual((await good.processor.processSingleBatchItem(good.state, good.item, good.entry, { convertBuffer: extractMarkdownBuffer })).ok, true);
    assert.match(store.readMarkdownArtifact(good.item.artifact_id).markdown, /Max&#32;Mustermann/);
    const bad = processorFixture('Name,Wert\n"unterminiert', '.csv');
    const result = await bad.processor.processSingleBatchItem(bad.state, bad.item, bad.entry, { convertBuffer: extractMarkdownBuffer });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(bad.item.status, 'stopped');
    assert.ok(!Object.hasOwn(bad.item, 'artifact_id'));
    assert.deepStrictEqual(fs.readFileSync(bad.original), bad.sourceBytes);
  });
  await testAsync('source digest mismatch and cancellation never publish', async () => {
    const f = processorFixture(); f.entry.private_bytes[0] ^= 1;
    const result = await f.processor.processSingleBatchItem(f.state, f.item, f.entry, { convertBuffer: extractMarkdownBuffer });
    assert.strictEqual(result.ok, false);
    assert.ok(!Object.hasOwn(f.item, 'artifact_id'));
    const aborted = processorFixture(); const controller = new AbortController(); controller.abort();
    const cancelled = await aborted.processor.processSingleBatchItem(aborted.state, aborted.item, aborted.entry,
      { signal: controller.signal, convertBuffer: extractMarkdownBuffer });
    assert.strictEqual(cancelled.ok, false);
    assert.strictEqual(aborted.item.status, 'retryable');
    assert.ok(!Object.hasOwn(aborted.item, 'artifact_id'));
  });
  await testAsync('run export is idempotent and binds the exact Markdown destination and mapping', async () => {
    const identity = await store.publishMarkdownArtifact(extraction(), `dm_${nextId()}`);
    const state = stateFor([{ ...identity, status: 'released', source_label: '=danger.txt' }]);
    assert.strictEqual(exportCompletedState(state).available, true);
    const target = visibleExportDirectory(state.token);
    const names = fs.readdirSync(target);
    assert.strictEqual(names.length, 2);
    assert.strictEqual(exportCompletedState(state).available, true);
    assert.strictEqual(visibleExportDirectory(state.token), target);
    assert.deepStrictEqual(fs.readdirSync(target), names);
    const record = JSON.parse(fs.readFileSync(recordPath(state.token), 'utf8'));
    assert.strictEqual(record.schema, MARKDOWN_SCHEMA);
    assert.strictEqual(validRecord(record), true);
    assert.strictEqual(validRecord({ ...record, product_channel: 'plugin' }), false);
    assert.strictEqual(validRecord({ ...record, processing_mode: 'markdown-and-anonymize' }), false);
    assert.match(fs.readFileSync(path.join(target, 'DataSecure-Zuordnung.csv'), 'utf8'), /'=danger.txt/);
    assert.deepStrictEqual(visibleExportStatus(state.token, 1), { exported: 1, pending: 0, available: true });
    const replay = replayPendingResultExports();
    assert.strictEqual(replay.exported, 0);
  });
  await testAsync('partial export retry never duplicates documents or rematerializes a user-deleted result', async () => {
    const a = await store.publishMarkdownArtifact(extraction('first'), `dm_${nextId()}`);
    const b = await store.publishMarkdownArtifact(extraction('second'), `dm_${nextId()}`);
    const state = stateFor([a, b].map((identity, index) => ({ ...identity, status: 'released', source_label: `source${index}.txt` })));
    const previous = fs.linkSync;
    fs.linkSync = function(from, to, ...rest) {
      if (String(to).endsWith('Dokument-002-konvertiert.md')) throw Object.assign(new Error('synthetic'), { code: 'EIO' });
      return previous.call(fs, from, to, ...rest);
    };
    try { assert.deepStrictEqual(exportCompletedState(state), { exported: 1, pending: 1, available: false }); }
    finally { fs.linkSync = previous; }
    const record = JSON.parse(fs.readFileSync(recordPath(state.token), 'utf8'));
    const run = path.join(process.env.EU_PRIVACY_RESULT_ROOT, 'DataSecure-Markdown', record.run_directory);
    fs.unlinkSync(path.join(run, 'Dokument-001-konvertiert.md'));
    assert.deepStrictEqual(exportCompletedState(state), { exported: 2, pending: 0, available: true });
    assert.strictEqual(fs.existsSync(path.join(run, 'Dokument-001-konvertiert.md')), false);
    assert.strictEqual(fs.readFileSync(path.join(run, 'Dokument-002-konvertiert.md'), 'utf8'), 'second');
  });
  test('all-stopped conversion has its own exact run CSV instead of a previous batch', () => {
    const state = stateFor([{ status: 'stopped', source_label: 'broken.csv', error_code: 'PARSE_FAILED' }]);
    assert.deepStrictEqual(exportCompletedState(state), { exported: 0, pending: 0, available: true });
    const directory = visibleExportDirectory(state.token);
    assert.ok(directory);
    assert.deepStrictEqual(fs.readdirSync(directory), ['DataSecure-Zuordnung.csv']);
    const csv = fs.readFileSync(path.join(directory, 'DataSecure-Zuordnung.csv'), 'utf8');
    assert.match(csv, /broken.csv/); assert.match(csv, /Nicht konvertiert/);
  });
  test('all plugin listing, handoff and acknowledgement paths reject a conversion journal', () => {
    const state = stateFor([]);
    const access = createBatchResultAccess({ SafeError, readState: () => state });
    assert.throws(() => access.listBatchResults(state.token));
    state.product_channel = 'plugin';
    assert.throws(() => access.listBatchResults(state.token));
    state.product_channel = 'standalone';
    assert.throws(() => deliveryFor(state).acknowledgeDeliveredPackage(state.token, `dm_${'1'.repeat(32)}`));
    assert.throws(() => deliveryFor(state).acknowledgeDeliveredPackages(state.token, [`dm_${'1'.repeat(32)}`]));
  });
}
run().finally(() => {
  // Only this freshly allocated root; no cleanup retry or link traversal.
  safeRemovePrivateTree(path.dirname(root), path.basename(root));
  done();
});
