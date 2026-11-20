'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');
const { test, testAsync, assert, done } = createSuite('Markdown batch, store and export');
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-markdown-batch-')));
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
const extractWithWorkerInterface = (bytes, extension) => extractMarkdownBuffer(bytes, extension);
function extraction(text = sourceText, incomplete = false) {
  return createMarkdownExtraction({ source_type: 'txt', markdown: text, coverage: incomplete
    ? { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED'] }
    : { status: 'complete', reason_codes: [] } });
}
function stateFor(items) {
  return { schema: 'datasecure-batch/5', product_channel: 'standalone', processing_mode: 'markdown-only',
    token: crypto.randomBytes(32).toString('hex'), created_at: '2026-09-06T08:00:00.000Z', items, io_summary: {} };
}
function processorFixture(text = sourceText, extension = '.txt', createProcessor = createBatchItemProcessor) {
  const item = { id: nextId(), name: `synthetic${extension}`, source_label: `Kunde/synthetic${extension}`, status: 'pending' };
  const state = stateFor([item]);
  const original = path.join(root, `original-${item.id}${extension}`);
  fs.writeFileSync(original, text, { flag: 'wx' });
  const sourceBytes = fs.readFileSync(original);
  const entry = { name: item.name, private_bytes: Buffer.from(sourceBytes), expected_sha256: digest(sourceBytes) };
  const writes = [];
  const faults = { failWrite: 0 };
  const prohibited = () => { throw new Error('Privacy operation invoked for conversion'); };
  const processor = createProcessor({ SafeError,
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
// Execute the actual module with one explicit fault at its existing imported
// boundary. This models failures; it does not claim native guard execution.
function withDependencies(file, overrides, expose = '') {
  const { createRequire } = require('node:module'), vm = require('node:vm');
  const source = require.resolve(file), local = createRequire(source), loaded = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){${fs.readFileSync(source, 'utf8')}\n${expose}\n})`, { filename: source })(
    request => Object.hasOwn(overrides, request) ? overrides[request] : local(request),
    loaded, loaded.exports, source, path.dirname(source));
  return loaded.exports;
}
// Fault only the selected, genuinely opened payload FD. The real close is
// completed before injecting its secondary error, so this test leaves no FD
// behind and does not claim a native double-I/O failure or disk exhaustion.
function payloadCloseFault(select, phase, primary) {
  const observed = { openCalls: 0, opened: 0, writes: 0, syncs: 0,
    primaryThrows: 0, closeCalls: 0, closed: false };
  const closeError = Object.assign(new Error('synthetic payload close'), { code: 'EIO' });
  let descriptor = null;
  const io = { ...fs,
    openSync(file, ...args) {
      if (!select(file)) return fs.openSync(file, ...args);
      observed.openCalls++;
      if (phase === 'open') { observed.primaryThrows++; throw primary; }
      assert.equal(descriptor, null, 'only one selected payload FD may be live');
      descriptor = fs.openSync(file, ...args); observed.opened++;
      return descriptor;
    },
    writeSync(fd, ...args) {
      if (fd === descriptor) {
        observed.writes++;
        if (phase === 'write') { observed.primaryThrows++; throw primary; }
      }
      return fs.writeSync(fd, ...args);
    },
    fsyncSync(fd) {
      if (fd === descriptor) {
        observed.syncs++;
        if (phase === 'fsync') { observed.primaryThrows++; throw primary; }
      }
      return fs.fsyncSync(fd);
    },
    closeSync(fd) {
      if (fd !== descriptor) return fs.closeSync(fd);
      observed.closeCalls++; descriptor = null;
      fs.closeSync(fd); observed.closed = true;
      throw closeError;
    }
  };
  return { io, observed, closeError };
}
function deliveryFor(state) {
  return createBatchDelivery({ SafeError, active: new Set(), acquireActiveLock() {}, releaseActiveLock() { return true; },
    readState: () => state, writeState() {}, assertLocalExecutorAccess() {},
    regularPublishedPackage: () => false,
    issueReadCapability() { throw new Error('No privacy capability for Markdown'); },
    publicProgress: () => ({}), writeTerminalEvidence: () => true });
}
async function run() {
  await testAsync('large valid Unicode export plan remains readable through its real History reader', async () => {
    // Long relative labels are metadata only here: this is not a native
    // long-path publication claim. No result root exists or is created.
    const savedRoot = process.env.EU_PRIVACY_RESULT_ROOT;
    const savedDataRoot = process.env.EU_PRIVACY_DATA_ROOT;
    const unavailableRoot = path.join(root, 'not-created-for-large-plan');
    process.env.EU_PRIVACY_RESULT_ROOT = unavailableRoot;
    process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'isolated-large-plan-data');
    try {
      const items = [];
      for (let index = 0; index < 200; index++) {
        const artifact = await store.publishMarkdownArtifact(extraction('bounded synthetic text'), `dm_${nextId()}`);
        const label = [...Array.from({ length: 13 }, () => '界'.repeat(72)),
          `${'界'.repeat(65)}${String(index).padStart(3, '0')}.txt`].join('/');
        assert.strictEqual(label.length, 1021);
        items.push({ ...artifact, status: 'released', source_label: label });
      }
      const state = stateFor(items);
      const result = exportCompletedState(state);
      assert.strictEqual(result.available, false);
      assert.strictEqual(result.pending, 200);
      const bytes = fs.readFileSync(recordPath(state.token));
      assert.ok(bytes.length > 1024 * 1024);
      assert.strictEqual(validRecord(JSON.parse(bytes)), true);
      const history = require('../plugins/data-secure/server/gateway/result-export')
        .readStandaloneExportHistoryEntry(state.token);
      assert.strictEqual(history.pending_count, 200);
      assert.strictEqual(history.summary.processing_mode, 'markdown-only');
      // Read-only observer bodies use the same cap; this exposes no product
      // API and grants no publication/ownership capability to the test.
      require('../plugins/data-secure/server/gateway/standalone-history-store').recordStandaloneState(state);
      const capture = withDependencies('../plugins/data-secure/server/gateway/standalone-history-store', {},
        'module.exports.captureForTest = exportCaptureSnapshot;').captureForTest();
      assert.strictEqual(capture.record_count, 1);
      const pin = withDependencies('../plugins/data-secure/server/gateway/standalone-history-visibility', {},
        'module.exports.snapshotForTest = snapshot;').snapshotForTest(state.token);
      assert.strictEqual(typeof pin.exported, 'string');
      assert.deepStrictEqual(fs.readFileSync(recordPath(state.token)), bytes);
      assert.strictEqual(fs.existsSync(unavailableRoot), false);
    } finally {
      process.env.EU_PRIVACY_RESULT_ROOT = savedRoot;
      process.env.EU_PRIVACY_DATA_ROOT = savedDataRoot;
    }
  });
  await testAsync('plan byte boundary reserves progress and refuses before the actual writer or destination IO', async () => {
    const { MAX_RESULT_EXPORT_RECORD_BYTES: maximum, serializeResultExportRecord: serialize } =
      require('../plugins/data-secure/server/core/result-export-record');
    // A deliberately padded future record tests the budget, not schema or
    // permission admission. The real 200-item producer is exercised above.
    const value = { complete: false, destination_id: '', items: [{}], padding: '' };
    const overhead = Buffer.byteLength(JSON.stringify(value));
    value.padding = 'x'.repeat(maximum - overhead - 80); // 64 destination + 16 flag bytes
    const text = serialize(value);
    assert.strictEqual(Buffer.byteLength(text) + 80, maximum);
    const future = { ...value, complete: true, destination_id: 'a'.repeat(64), items: [{ exported: true }] };
    assert.ok(Buffer.byteLength(serialize(future)) <= maximum);
    let writes = 0;
    const actual = withDependencies('../plugins/data-secure/server/gateway/result-export', {
      './review-meta-io': { writeFileAtomically(_target, payload) { writes++; assert.strictEqual(payload, text); } }
    }, 'module.exports.writeRecordForTest = writeRecord;');
    actual.writeRecordForTest('not-opened-by-intercepted-writer', value);
    assert.strictEqual(writes, 1);
    value.padding += 'x';
    assert.throws(() => actual.writeRecordForTest('never-opened', value), { code: 'RESULT_EXPORT_STATE_UNSAFE' });
    assert.strictEqual(writes, 1);
    assert.throws(() => actual._test.activeDestination(value), { code: 'RESULT_EXPORT_STATE_UNSAFE' });
    // UTF-8 bytes, not code units: one CJK replacement grows by two bytes.
    value.padding = value.padding.slice(0, -2) + '界';
    assert.throws(() => serialize(value), { code: 'RESULT_EXPORT_STATE_UNSAFE' });
    assert.strictEqual(value.items[0].exported, undefined);
    assert.strictEqual(value.destination_id, '');
  });
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
  await testAsync('incomplete OCR conversion keeps its source basename and explicit artifact warnings without a mapping', async () => {
    const id = `dm_${nextId()}`;
    const identity = await store.publishMarkdownArtifact(extraction(sourceText, true), id);
    assert.strictEqual(identity.extraction_grade, 'incomplete');
    const state = stateFor([{ ...identity, status: 'released', source_label: 'scan.pdf' }]);
    assert.deepStrictEqual(exportCompletedState(state), { exported: 1, pending: 0, available: true });
    const run = visibleExportDirectory(state.token);
    assert.strictEqual(path.basename(path.dirname(run)), 'DataSecure-Markdown');
    assert.strictEqual(fs.readFileSync(path.join(run, 'scan.md'), 'utf8'), sourceText);
    assert.strictEqual(fs.existsSync(path.join(run, 'DataSecure-Zuordnung.csv')), false);
    const record = JSON.parse(fs.readFileSync(recordPath(state.token), 'utf8'));
    assert.deepStrictEqual(record.items[0].reason_codes,
      ['OCR_NOT_VERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED']);
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
    const result = await f.processor.processSingleBatchItem(f.state, f.item, f.entry, { convertBuffer: extractWithWorkerInterface });
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
  await testAsync('Markdown-only preserves compatibility identifiers and telephone suffixes through real conversion, store and export', async () => {
    const { originalDocument } = require('./lib/identifier-compatibility');
    const f = processorFixture(originalDocument);
    const result = await f.processor.processSingleBatchItem(f.state, f.item, f.entry, { convertBuffer: extractWithWorkerInterface });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.anonymized, false);
    assert.strictEqual(store.readMarkdownArtifact(f.item.artifact_id).markdown, originalDocument);
    deliveryFor(f.state).finalizePublishedPackageLocally(f.state.token, f.item.artifact_id);
    assert.strictEqual(f.item.status, 'released');
    assert.strictEqual(exportCompletedState(f.state).available, true);
    const run = visibleExportDirectory(f.state.token);
    assert.strictEqual(path.basename(path.dirname(run)), 'DataSecure-Markdown');
    assert.deepStrictEqual(fs.readFileSync(path.join(run, 'Kunde', 'synthetic.md')), Buffer.from(originalDocument));
    assert.deepStrictEqual(fs.readFileSync(f.original), f.sourceBytes);
  });
  await testAsync('crash after committed artifact recovers the exact identity without reconversion', async () => {
    const f = processorFixture();
    f.faults.failWrite = 2;
    const result = await f.processor.processSingleBatchItem(f.state, f.item, f.entry, { convertBuffer: extractWithWorkerInterface });
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
  await testAsync('pure conversion completion is independent of mapping publication and replay does not rewrite output', async () => {
    const identity = await store.publishMarkdownArtifact(extraction('unchanged', true), `dm_${nextId()}`);
    const state = stateFor([{ ...identity, status: 'released', source_label: 'scan.pdf' }]);
    const previous = fs.linkSync;
    fs.linkSync = function(from, to, ...rest) {
      if (String(to).endsWith('DataSecure-Zuordnung.csv')) throw Object.assign(new Error('synthetic'), { code: 'EIO' });
      return previous.call(fs, from, to, ...rest);
    };
    try { assert.deepStrictEqual(exportCompletedState(state), { exported: 1, pending: 0, available: true }); }
    finally { fs.linkSync = previous; }
    assert.ok(visibleExportDirectory(state.token));
    const record = JSON.parse(fs.readFileSync(recordPath(state.token), 'utf8'));
    const document = path.join(process.env.EU_PRIVACY_RESULT_ROOT, 'DataSecure-Markdown', record.run_directory, 'scan.md');
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
      await assert.rejects(() => f.processor.processSingleBatchItem(f.state, f.item, f.entry, { convertBuffer: extractWithWorkerInterface }));
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
  await testAsync('postcommit causes stay private and only ownership refusals bypass ordinary batch recovery', async () => {
    const policy = require('../plugins/data-secure/server/gateway/prepublication-error');
    for (const code of ['BATCH_OWNERSHIP_CHANGED', 'OWNERSHIP_GUARD_BUSY', 'OWNERSHIP_GUARD_UNSAFE',
      'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'EIO', 'STANDALONE_BUSY']) {
      const original = Object.assign(new Error('synthetic private callback text'), { code });
      const id = `dm_${nextId()}`; let envelope;
      await assert.rejects(store.publishMarkdownArtifact(extraction(), id, { afterPublish() { throw original; } }), error => {
        envelope = error; return error.code === 'BATCH_PUBLICATION_UNCONFIRMED';
      });
      assert.strictEqual(store.publicationFailureCause(envelope), original);
      assert.equal(Object.hasOwn(envelope, 'cause'), false);
      assert.equal(JSON.stringify(envelope).includes(original.message), false);
      assert.equal(store.readMarkdownArtifact(id).markdown, sourceText);
      let receipts = 0;
      const processor = withDependencies('../plugins/data-secure/server/gateway/batch-item-processor', {
        './prepublication-error': { ...policy,
          retryDocumentControl: action => policy.retryDocumentControl(action, { attempts: 2, delayMs: 0 }) },
        './standalone-document-review-store': { createDocumentReviewStore: () => ({
          capture() {}, recordPublication() { receipts++; throw original; }
        }) }
      }).createBatchItemProcessor;
      const f = processorFixture(sourceText, '.txt', processor); f.state.standalone_document_review = true;
      const action = () => f.processor.processSingleBatchItem(f.state, f.item, f.entry, { convertBuffer: extractWithWorkerInterface });
      if (policy.isOwnershipControlFailure(original)) {
        await assert.rejects(action, error => error === original);
        assert.equal(f.writes.length, 1, 'no recovery journal write after ownership refusal');
        assert.equal(f.writes[0].items[0].checkpoint, 'processing_started');
        assert.equal(f.item.work_copy_cleanup_pending, undefined);
      } else {
        const result = await action();
        assert.equal(result.error, 'BATCH_PUBLICATION_UNCONFIRMED');
        assert.equal(f.writes.length, 2, 'ordinary failure retains its durable recovery checkpoint');
        assert.equal(f.writes[1].items[0].checkpoint, 'package_published');
        assert.equal(JSON.stringify(result).includes(original.message), false);
      }
      assert.equal(receipts, code === 'STANDALONE_BUSY' ? 2 : 1);
      assert.equal(store.readMarkdownArtifact(`dm_${f.item.id}`).markdown, sourceText);
      assert.deepEqual(fs.readFileSync(f.original), f.sourceBytes);
    }
    for (const value of [undefined, null, 1, 'ordinary', {}, new Error('unrelated')])
      assert.strictEqual(store.publicationFailureCause(value), value);
    for (const cause of [undefined, null, false, 0, '', Object.freeze(Object.assign(new Error('frozen private text'), { code: 'EIO' }))]) {
      const id = `dm_${nextId()}`; let envelope;
      await assert.rejects(store.publishMarkdownArtifact(extraction(), id, { afterPublish() { throw cause; } }), error => {
        envelope = error; return error.code === 'BATCH_PUBLICATION_UNCONFIRMED';
      });
      assert.strictEqual(store.publicationFailureCause(envelope), cause, 'even a falsy cause has an exact private binding');
      assert.equal(Object.hasOwn(envelope, 'cause'), false);
      assert.equal(store.readMarkdownArtifact(id).markdown, sourceText);
    }
    const imitation = Object.assign(new Error('BATCH_PUBLICATION_UNCONFIRMED'), { code: 'BATCH_PUBLICATION_UNCONFIRMED' });
    assert.strictEqual(store.publicationFailureCause(imitation), imitation, 'a matching public code never forges a private binding');
  });
  await testAsync('payload write/fsync errors survive close failure; close-only and hard cleanup stay failures', async () => {
    const common = require('../plugins/data-secure/server/gateway/common');
    const { createMarkdownArtifact } = require('../plugins/data-secure/server/standalone/markdown-artifact');
    const ownership = ['BATCH_OWNERSHIP_CHANGED', 'OWNERSHIP_GUARD_BUSY',
      'OWNERSHIP_GUARD_UNSAFE', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED'];
    const primaryCases = [Object.assign(new Error('synthetic full payload'), { code: 'ENOSPC' }),
      Object.freeze(Object.assign(new Error('synthetic fsync failure'), { code: 'EIO' })),
      undefined, null, false, 0, '',
      ...ownership.map(code => Object.assign(new Error('synthetic control priority'), { code }))];
    async function exercise(kind, phase, primary, cleanupError = null) {
      // Use the existing real extraction/artifact constructors, not a fake
      // manifest or a guessed payload filename.
      const value = extraction(), before = JSON.stringify(value), id = `dm_${nextId()}`;
      const manifest = createMarkdownArtifact(value, id).manifest;
      const name = kind === 'document' ? manifest.document : 'manifest.json';
      const artifactRoot = store.artifactRoot(), pendingPrefix = `.pending-${id}-`;
      const fault = payloadCloseFault(file => typeof file === 'string' &&
        path.dirname(path.dirname(file)) === artifactRoot &&
        path.basename(path.dirname(file)).startsWith(pendingPrefix) &&
        path.basename(file) === name, phase, primary);
      let beforePublish = 0, afterPublish = 0, cleanupCalls = 0;
      const isolated = withDependencies('../plugins/data-secure/server/standalone/markdown-store', {
        fs: fault.io,
        ...(cleanupError ? { '../gateway/common': { ...common,
          safeRemovePrivateTree() { cleanupCalls++; throw cleanupError; } } } : {})
      });
      let rejected = false, actual;
      try { await isolated.publishMarkdownArtifact(value, id, {
        beforePublish() { beforePublish++; }, afterPublish() { afterPublish++; }
      }); } catch (error) { rejected = true; actual = error; }
      const expectedPrimary = phase === 'close' ? fault.closeError : primary;
      const expected = cleanupError && !ownership.includes(primary?.code) ? cleanupError : expectedPrimary;
      assert.equal(rejected, true, `${kind}/${phase}: a falsy exception still rejects`);
      assert.ok(Object.is(actual, expected), `${kind}/${phase}: preserve exact first-error identity`);
      assert.equal(fault.observed.openCalls, 1);
      assert.equal(fault.observed.opened, phase === 'open' ? 0 : 1);
      assert.equal(fault.observed.primaryThrows, phase === 'close' ? 0 : 1);
      assert.equal(fault.observed.closeCalls, phase === 'open' ? 0 : 1);
      assert.equal(fault.observed.closed, phase !== 'open');
      assert.equal(fault.observed.writes > 0, phase !== 'open');
      assert.equal(fault.observed.syncs, phase === 'fsync' || phase === 'close' ? 1 : 0);
      assert.equal(beforePublish, 0); assert.equal(afterPublish, 0);
      assert.equal(cleanupCalls, cleanupError ? 1 : 0);
      assert.equal(fs.existsSync(path.join(artifactRoot, id)), false, 'no failed write grants a target');
      assert.equal(JSON.stringify(value), before, 'the caller extraction remains unchanged');
      if (!cleanupError)
        assert.equal(fs.readdirSync(artifactRoot).some(entry => entry.startsWith(pendingPrefix)), false);
    }
    for (const kind of ['document', 'manifest']) {
      for (const phase of ['write', 'fsync']) for (const primary of primaryCases)
        await exercise(kind, phase, primary);
      await exercise(kind, 'close');
      await exercise(kind, 'open', Object.assign(new Error('synthetic open refusal'), { code: 'EACCES' }));
    }
    for (const primary of [primaryCases[0], undefined, primaryCases[7]]) {
      const cleanup = Object.assign(new Error('synthetic uncertain cleanup'), { code: 'PRIVACY_STORAGE_UNSAFE' });
      await exercise('document', 'write', primary, cleanup);
    }
  });
  await testAsync('precommit cleanup preserves an ownership primary but a hard cleanup still dominates other failures', async () => {
    const common = require('../plugins/data-secure/server/gateway/common');
    for (const code of ['OWNERSHIP_GUARD_BUSY', 'OWNERSHIP_GUARD_UNSAFE', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED',
      'BATCH_OWNERSHIP_CHANGED', 'STANDALONE_BUSY', 'LOCAL_REVIEW_DEFERRED', 'LOCAL_CAPACITY_INSUFFICIENT', 'LOCAL_CAPACITY_RACE', 'EIO']) {
      const primary = Object.assign(new Error('synthetic primary'), { code });
      const cleanup = Object.assign(new Error('synthetic hard cleanup'), { code: 'PRIVACY_STORAGE_UNSAFE' });
      let calls = 0;
      const isolated = withDependencies('../plugins/data-secure/server/standalone/markdown-store', {
        '../gateway/common': { ...common, safeRemovePrivateTree() { calls++; throw cleanup; } }
      });
      const id = `dm_${nextId()}`;
      await assert.rejects(isolated.publishMarkdownArtifact(extraction(), id, { beforePublish() { throw primary; } }),
        error => error === (code.startsWith('OWNERSHIP_GUARD_') || code === 'BATCH_OWNERSHIP_CHANGED' ? primary : cleanup));
      assert.equal(calls, 1);
      assert.equal(fs.existsSync(path.join(store.artifactRoot(), id)), false);
    }
  });
  await testAsync('CSV input content remains present and malformed CSV is stopped, not privacy-reviewed', async () => {
    const good = processorFixture('Name,Firma\nMax Mustermann,Nordstern GmbH\n', '.csv');
    assert.strictEqual((await good.processor.processSingleBatchItem(good.state, good.item, good.entry, { convertBuffer: extractWithWorkerInterface })).ok, true);
    assert.match(store.readMarkdownArtifact(good.item.artifact_id).markdown, /Max&#32;Mustermann/);
    const bad = processorFixture('Name,Wert\n"unterminiert', '.csv');
    const result = await bad.processor.processSingleBatchItem(bad.state, bad.item, bad.entry, { convertBuffer: extractWithWorkerInterface });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(bad.item.status, 'stopped');
    assert.ok(!Object.hasOwn(bad.item, 'artifact_id'));
    assert.deepStrictEqual(fs.readFileSync(bad.original), bad.sourceBytes);
  });
  await testAsync('source digest mismatch and cancellation never publish', async () => {
    const f = processorFixture(); f.entry.private_bytes[0] ^= 1;
    const result = await f.processor.processSingleBatchItem(f.state, f.item, f.entry, { convertBuffer: extractWithWorkerInterface });
    assert.strictEqual(result.ok, false);
    assert.ok(!Object.hasOwn(f.item, 'artifact_id'));
    const aborted = processorFixture(); const controller = new AbortController(); controller.abort();
    const cancelled = await aborted.processor.processSingleBatchItem(aborted.state, aborted.item, aborted.entry,
      { signal: controller.signal, convertBuffer: extractWithWorkerInterface });
    assert.strictEqual(cancelled.ok, false);
    assert.strictEqual(aborted.item.status, 'retryable');
    assert.ok(!Object.hasOwn(aborted.item, 'artifact_id'));
  });
  await testAsync('run export is idempotent and binds the exact Markdown destination without a redundant mapping', async () => {
    const identity = await store.publishMarkdownArtifact(extraction(), `dm_${nextId()}`);
    const state = stateFor([{ ...identity, status: 'released', source_label: '=danger.txt' }]);
    assert.strictEqual(exportCompletedState(state).available, true);
    const target = visibleExportDirectory(state.token);
    const names = fs.readdirSync(target);
    assert.deepStrictEqual(names, ['=danger.md']);
    assert.strictEqual(exportCompletedState(state).available, true);
    assert.strictEqual(visibleExportDirectory(state.token), target);
    assert.deepStrictEqual(fs.readdirSync(target), names);
    const record = JSON.parse(fs.readFileSync(recordPath(state.token), 'utf8'));
    assert.strictEqual(record.schema, MARKDOWN_SCHEMA);
    assert.strictEqual(validRecord(record), true);
    assert.strictEqual(validRecord({ ...record, product_channel: 'plugin' }), false);
    assert.strictEqual(validRecord({ ...record, processing_mode: 'markdown-and-anonymize' }), false);
    assert.strictEqual(fs.existsSync(path.join(target, 'DataSecure-Zuordnung.csv')), false);
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
      if (String(to).endsWith('source1.md')) throw Object.assign(new Error('synthetic'), { code: 'EIO' });
      return previous.call(fs, from, to, ...rest);
    };
    try { assert.deepStrictEqual(exportCompletedState(state), { exported: 1, pending: 1, available: false }); }
    finally { fs.linkSync = previous; }
    const record = JSON.parse(fs.readFileSync(recordPath(state.token), 'utf8'));
    const run = path.join(process.env.EU_PRIVACY_RESULT_ROOT, 'DataSecure-Markdown', record.run_directory);
    fs.unlinkSync(path.join(run, 'source0.md'));
    assert.deepStrictEqual(exportCompletedState(state), { exported: 2, pending: 0, available: true });
    assert.strictEqual(fs.existsSync(path.join(run, 'source0.md')), false);
    assert.strictEqual(fs.readFileSync(path.join(run, 'source1.md'), 'utf8'), 'second');
  });
  test('all-stopped conversion exposes neither an empty run nor an invented mapping', () => {
    const state = stateFor([{ status: 'stopped', source_label: 'broken.csv', error_code: 'PARSE_FAILED' }]);
    assert.deepStrictEqual(exportCompletedState(state), { exported: 0, pending: 0, available: false });
    assert.strictEqual(visibleExportDirectory(state.token), '');
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
