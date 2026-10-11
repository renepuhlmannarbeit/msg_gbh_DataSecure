'use strict';
// Actual private-filesystem persistence; no converter or native GUI claim.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const { notProcessedDocumentResult } = require('../plugins/data-secure/server/core/document-result-grade');
const { test, assert, done } = createSuite('Standalone retained terminal failure evidence');
const temporaryRoot = fs.realpathSync.native(os.tmpdir());
const root = fs.mkdtempSync(path.join(temporaryRoot, 'datasecure-terminal-failures-'));
let sequence = 0;
function fixture(mode = 'markdown-and-anonymize', mixed = false) {
  const batchId = (++sequence).toString(16).padStart(64, '0'), data = path.join(root, String(sequence));
  fs.mkdirSync(data);
  const item = { id: '1'.repeat(32), sha256: '2'.repeat(64), source_label: 'nested/Quelle mit Namen.pdf', name: 'internal.pdf', status: 'pending' };
  const healthy = { id: '3'.repeat(32), sha256: '4'.repeat(64), name: 'healthy.pdf', status: 'released' };
  const output = path.join(data, 'packages'); fs.mkdirSync(output);
  const state = { token: batchId, product_channel: 'standalone', standalone_document_review: true, processing_mode: mode, items: mixed ? [item, healthy] : [item] };
  const create = () => createDocumentReviewStore({ dataRoot: data, outputRoot: () => output, expectedDocuments: () => [] });
  const store = create(); store.captureRun(state);
  const stop = (reason = 'PARSE_FAILED') => Object.assign(item, { status: 'stopped', error_code: reason, document_result: notProcessedDocumentResult(reason) });
  return { batchId, data, output, healthy, item, state, store, create, stop, failure: path.join(data, 'document-reviews', batchId, `failure-${item.id}.json`) };
}
const code = expected => error => error.code === expected;
test('terminal names and precise causes survive journal expiry in both processing modes', () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const f = fixture(mode), manifest = path.join(f.data, 'document-reviews', f.batchId, 'manifest.json'), before = fs.readFileSync(manifest);
    f.stop(); f.store.captureRun(f.state); f.store.captureRun(f.state);
    assert.ok(fs.readFileSync(manifest).equals(before), 'failure does not rewrite immutable membership');
    const fresh = f.create(), rows = [{ document_id: f.item.id, name: f.item.source_label, reason_code: 'PARSE_FAILED' }];
    assert.deepEqual(fresh.notProcessed(f.batchId), rows);
    assert.deepEqual(fresh.list(f.batchId).not_processed_documents, rows);
    assert.deepEqual(fresh.list(f.batchId).unclassified_documents, []);
    assert.equal(fresh.historySummary(f.batchId).not_processed_count, 1);
    assert.equal(fresh.historySummary(f.batchId).approved_count, 0);
    assert.throws(() => fresh.chunk(f.batchId, f.item.id, 0, 0), code('DOCUMENT_REVIEW_CONFLICT'));
  }
});
test('retryable or incomplete processing is never retained as a terminal failure', () => {
  const f = fixture();
  for (const status of ['pending', 'processing', 'retryable', 'mapping_pending', 'delivery_pending', 'deferred_review']) {
    f.item.status = status; f.store.captureRun(f.state); assert.deepEqual(f.store.notProcessed(f.batchId), []);
    assert.equal(fs.existsSync(f.failure), false);
  }
});
test('invalid grade, conflicting source hash and potential published package refuse failure authority', () => {
  for (const changes of [{ document_result: null }, { error_code: 'INTERNAL_FAILURE' }, { sha256: '3'.repeat(64) }, { package_id: 'ds_possible' }]) {
    const f = fixture(); f.stop(); Object.assign(f.item, changes);
    assert.throws(() => f.store.captureRun(f.state), error => ['DOCUMENT_REVIEW_INVALID', 'DOCUMENT_REVIEW_CONFLICT'].includes(error.code));
    assert.equal(fs.existsSync(f.failure), false);
  }
});
test('an existing terminal reason cannot be silently replaced by a later different failure', () => {
  const f = fixture(); f.stop(); f.store.captureRun(f.state); const before = fs.readFileSync(f.failure);
  f.stop('RESIDUAL_PII'); assert.throws(() => f.store.captureRun(f.state), code('DOCUMENT_REVIEW_CONFLICT'));
  assert.ok(fs.readFileSync(f.failure).equals(before));
});
test('a foreign failure record cannot borrow membership, names, mode or raw error messages', () => {
  for (const changes of [{ batch_id: 'f'.repeat(64) }, { name: '../different.pdf' }, { processing_mode: 'markdown-only' },
    { source_sha256: 'f'.repeat(64) }, { document_id: 'f'.repeat(32) }, { reason_code: 'vendor error with private text' }, { extra: true }]) {
    const f = fixture(); f.stop(); f.store.captureRun(f.state);
    fs.writeFileSync(f.failure, JSON.stringify({ ...JSON.parse(fs.readFileSync(f.failure)), ...changes }));
    assert.throws(() => f.create().notProcessed(f.batchId), code('DOCUMENT_REVIEW_INVALID'));
  }
});
test('a saved draft followed by failed publication does not block healthy documents or become an output', () => {
  const f = fixture('markdown-and-anonymize', true), markdown = '# Synthetic checked content\n';
  for (const item of [f.item, f.healthy]) f.store.capture(f.state, item, { package_id: `ds_${item.id}`,
    original_text: 'Synthetic original', markdown });
  const id = `ds_${f.healthy.id}`, folder = path.join(f.output, id); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, `${id}.md`), markdown);
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/3', package_id: id,
    document: `${id}.md`, verification: { text_residual_pii: 'passed' },
    document_sha256: crypto.createHash('sha256').update(markdown).digest('hex') }));
  f.stop('PUBLISH_FAILED'); f.store.captureRun(f.state);
  const fresh = f.create(), value = fresh.list(f.batchId);
  assert.deepEqual(value.documents.map(row => row.document_id), [f.healthy.id]);
  assert.deepEqual(value.unavailable, []); assert.deepEqual(value.unclassified_documents, []);
  assert.equal(value.not_processed_documents[0].reason_code, 'PUBLISH_FAILED');
  assert.equal(fresh.chunk(f.batchId, f.healthy.id, 0, 0).markdown, markdown);
  assert.equal(fs.existsSync(path.join(f.data, 'document-reviews', f.batchId, f.item.id, 'base.json')), true, 'draft is retained, not deleted or adopted');
  assert.throws(() => fresh.chunk(f.batchId, f.item.id, 0, 0), code('DOCUMENT_REVIEW_CONFLICT'));
});
test('even damaged publication evidence cannot be overwritten by a terminal failure classification', () => {
  const f = fixture(), run = path.join(f.data, 'document-reviews', f.batchId);
  fs.mkdirSync(path.join(run, f.item.id)); fs.writeFileSync(path.join(run, f.item.id, 'published.json'), '{}');
  f.stop('PUBLISH_FAILED'); assert.throws(() => f.store.captureRun(f.state), code('DOCUMENT_REVIEW_CONFLICT'));
  assert.equal(fs.existsSync(f.failure), false);
});
done(() => {
  const resolved = fs.realpathSync(root), stat = fs.lstatSync(resolved);
  if (path.dirname(resolved) !== temporaryRoot || !path.basename(resolved).startsWith('datasecure-terminal-failures-') ||
      !stat.isDirectory() || stat.isSymbolicLink()) throw Error('TEST_CLEANUP_TARGET_INVALID');
  fs.rmSync(resolved, { recursive: true, force: true });
});
