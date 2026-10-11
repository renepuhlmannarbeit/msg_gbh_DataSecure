'use strict';

// Real local filesystem, immutable snapshots and package-byte reconciliation.
// Fault injection is limited to specific persistence boundaries; it is not
// evidence of native Tauri/WebView or full privacy-detector correctness.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const { createPrivateWorkStore } = require('../plugins/data-secure/server/gateway/private-work-store');
const { bindDirectory } = require('../plugins/data-secure/server/core/bound-file-io');
const { execFileSync } = require('node:child_process');
const { validatePrivateMessage } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const { test, assert, done } = createSuite('Standalone document review / selected AI export');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-document-review-'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
let n = 0;
function fixture(v2 = false, traced = false, rejected = null) {
  const batchId = (++n).toString(16).padStart(64, '0'), dir = path.join(root, String(n));
  const output = path.join(dir, 'packages'), results = path.join(dir, 'results'), data = path.join(dir, 'private');
  for (const folder of [output, results, data]) fs.mkdirSync(folder, { recursive: true });
  const original = 'Name: Anna Beispiel\nAnna Beispiel hat 42 Projekte.\nE-Mail: anna@example.invalid';
  const items = [1, 2].map(index => ({ id: index.toString(16).padStart(32, '0'), name: `nested/Quelle-${index}.pdf`,
    sha256: sha(traced ? original : 'original'), status: 'released' }));
  if (rejected) items.push(rejected);
  const state = { product_channel: 'standalone', processing_mode: 'markdown-and-anonymize', token: batchId, items,
    ...(v2 ? { standalone_document_review: true } : {}) };
  const create = () => createDocumentReviewStore({ dataRoot: data, outputRoot: () => output, resultRoot: () => results, expectedDocuments: () => items });
  const captured = traced ? require('../plugins/data-secure/server/pii-engine').anonymize(original, 'general', { captureTransformPlan: true }) : null;
  const store = create(), text = captured?.text || '# Inhalt\n[PERSON_001] hat 42 Projekte.\n';
  for (const item of items.filter(row => row !== rejected)) {
    const packageId = `ds_${item.id}`, packageDir = path.join(output, packageId); fs.mkdirSync(packageDir);
    store.capture(state, item, { package_id: packageId, original_text: captured ? original : 'Anna Beispiel hat 42 Projekte.', markdown: text,
      ...(captured ? { transform_trace: captured.transform_trace, verification_context: {
        profile: 'general', dictionary: captured.dictionary, strong_person_anchor: captured.strongPersonAnchor === true,
        ruleset: require('../plugins/data-secure/server/privacy/policy').PRIVACY_RULESET_VERSION,
        credential_policy: require('../plugins/data-secure/server/privacy/policy').CREDENTIAL_CONTEXT_POLICY_VERSION,
        publication_frame: { prefix: '', suffix: '' }, reviewed_ranges: [] } } : {}) });
    fs.writeFileSync(path.join(packageDir, `${packageId}.md`), text);
    fs.writeFileSync(path.join(packageDir, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/3', package_id: packageId,
      document: `${packageId}.md`, verification: { text_residual_pii: 'passed' }, document_sha256: sha(text) }));
  }
  const row = index => store.list(batchId).documents.find(value => value.document_id === items[index].id);
  const decision = (index, action, ranges = [], op = crypto.randomBytes(16).toString('hex')) => {
    const value = row(index); return store.decide(batchId, value.document_id, { action, ranges, revision: value.revision,
      output_sha256: value.output_sha256, operation_id: op });
  };
  const selection = index => { const { document_id, revision, output_sha256 } = row(index); return [{ document_id, revision, output_sha256 }]; };
  return { batchId, dir, output, results, data, items, state, store, text, row, decision, selection, create };
}
function throwsCode(action, code) { assert.throws(action, error => error.code === code); }
function faultOnce(predicate, action) {
  const original = fs.linkSync; let failed = false;
  fs.linkSync = function(from, to) { if (!failed && predicate(to)) { failed = true; throw Object.assign(Error('injected'), { code: 'EIO' }); }
    return original.apply(this, arguments); };
  try { action(); assert.equal(failed, true); } finally { fs.linkSync = original; }
}

const rejectedInput = () => ({ id: '9'.repeat(32), name: 'nested/defekt.docx', status: 'stopped',
  checkpoint: 'source_preflight_stopped', error_code: 'SOURCE_CONTAINER_CORRUPT', local_mapping_exported: true,
  document_result: { schema: 'datasecure-document-result/1', grade: 'not-processed', omissions: [], reason_code: 'SOURCE_CONTAINER_CORRUPT' } });
test('mixed intake durably keeps rejected filenames and reasons without turning them into document authority', () => {
  const f = fixture(true, false, rejectedInput()), listed = f.store.list(f.batchId);
  assert.equal(listed.documents.length, 2); assert.deepEqual(listed.unavailable, []);
  assert.deepEqual(listed.not_processed_documents, [{ document_id: '9'.repeat(32), name: 'nested/defekt.docx', reason_code: 'SOURCE_CONTAINER_CORRUPT' }]);
  const fresh = createDocumentReviewStore({ dataRoot: f.data, outputRoot: () => f.output, resultRoot: () => f.results, expectedDocuments: () => [] });
  assert.deepEqual(fresh.list(f.batchId).not_processed_documents, listed.not_processed_documents, 'retained after processing journal expiry');
  assert.deepEqual(fresh.list(f.batchId).unclassified_documents, []);
  throwsCode(() => fresh.chunk(f.batchId, '9'.repeat(32), 0, 0), 'DOCUMENT_REVIEW_MISSING');
  assert.equal(fresh.historySummary(f.batchId).reviewable_count, 2);
  assert.equal(fresh.historySummary(f.batchId).approved_count, 0);
});
test('a durable manifest is identical before and after a rejected input completes its local mapping boundary', () => {
  const rejected = { ...rejectedInput(), status: 'preflight_mapping_pending', checkpoint: 'source_preflight_rejected', local_mapping_exported: false };
  const f = fixture(true, false, rejected), manifest = path.join(f.data, 'document-reviews', f.batchId, 'manifest.json');
  const before = fs.readFileSync(manifest);
  Object.assign(rejected, { status: 'stopped', checkpoint: 'source_preflight_stopped', local_mapping_exported: true });
  f.store.capture(f.state, f.items[0], { package_id: `ds_${f.items[0].id}`, original_text: 'Anna Beispiel hat 42 Projekte.', markdown: f.text });
  assert.ok(fs.readFileSync(manifest).equals(before));
  assert.equal(f.create().list(f.batchId).not_processed_documents[0].reason_code, 'SOURCE_CONTAINER_CORRUPT');
});
test('missing hashes, invalid rejection pairs and duplicate rejected identities fail closed rather than silently disappearing', () => {
  for (const change of [{ status: 'pending' }, { checkpoint: 'processing' }, { sha256: sha('fake') }, { work_name: 'fake.txt' },
    { package_id: 'ds_fake' }, { error_code: 'INTERNAL_FAILURE' }, { id: '1'.padStart(32, '0') },
    { document_result: { schema: 'datasecure-document-result/1', grade: 'complete', omissions: [], reason_code: null } }])
    throwsCode(() => fixture(true, false, { ...rejectedInput(), ...change }), 'DOCUMENT_REVIEW_INVALID');
});
test('all-rejected intake retains only named reasons and purpose, never approvable documents or export authority', () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const batchId = (++n).toString(16).padStart(64, '0'), data = path.join(root, `rejected-${n}`); fs.mkdirSync(data);
    const item = rejectedInput(), state = { token: batchId, product_channel: 'standalone', standalone_document_review: true,
      processing_mode: mode, items: [item] };
    const create = () => createDocumentReviewStore({ dataRoot: data, expectedDocuments: () => [] });
    const store = create(); assert.equal(store.captureRun(state).ok, true);
    const listed = create().list(batchId);
    assert.equal(listed.processing_mode, mode); assert.deepEqual(listed.documents, []);
    assert.deepEqual(listed.unavailable, []); assert.deepEqual(listed.unclassified_documents, []);
    assert.equal(listed.not_processed_documents[0].name, item.name);
    assert.equal(create().historySummary(batchId).not_processed_count, 1);
    assert.deepEqual(fs.readdirSync(path.join(data, 'document-reviews', batchId)), ['manifest.json']);
    throwsCode(() => store.chunk(batchId, item.id, 0, 0), 'DOCUMENT_REVIEW_MISSING');
    throwsCode(() => store.exportApproved(batchId, 'a'.repeat(32), []), 'AI_EXPORT_INVALID');
    throwsCode(() => store.captureRun({ ...state, product_channel: 'plugin' }), 'DOCUMENT_REVIEW_INVALID');
  }
});

test('on-demand history counts authoritative current approvals separately from historical exports and pending confirmations', () => {
  const f = fixture(true);
  assert.deepEqual(f.store.historySummary(f.batchId), { ok: true, local_ui_only: true, external_disclosure: false,
    available: true, processing_mode: 'markdown-and-anonymize', reviewable_count: 2, approved_count: 0,
    unavailable_count: 0, unclassified_source_count: 0, recorded_export_count: 0, current_exported_count: 0, pending_export_count: 0,
    pending_incomplete_count: 0, pending_confirmation_count: 0, last_recorded_export: null });
  f.decision(0, 'approve');
  const selection = f.selection(0), operation = crypto.randomBytes(16).toString('hex');
  f.store.exportApproved(f.batchId, operation, selection);
  assert.equal(f.create().historySummary(f.batchId).current_exported_count, 1);
  f.decision(0, 'revoke');
  const current = f.create().historySummary(f.batchId);
  assert.equal(current.approved_count, 0); assert.equal(current.recorded_export_count, 1);
  assert.equal(current.current_exported_count, 0, 'a historical copy cannot export the revoked revision');
  assert.equal(current.pending_incomplete_count, 0); assert.equal(current.pending_confirmation_count, 1);
  assert.equal(current.last_recorded_export.document_count, 1);
  assert.match(current.last_recorded_export.recorded_at, /^\d{4}-/u);
  assert.doesNotMatch(JSON.stringify(current), /Anna|Quelle|PERSON|document_id|output_sha256|root|local_path/u);
  f.store.exportApproved(f.batchId, operation, selection, true);
  assert.equal(f.store.historySummary(f.batchId).pending_confirmation_count, 0);
  assert.equal(f.store.historySummary(f.batchId).recorded_export_count, 1, 'ACK does not remove historical completion');
});

test('current export coverage joins exact completed selections without duplicate or stale revision credit', () => {
  const f = fixture(true);
  f.decision(0, 'approve'); f.decision(1, 'approve');
  const one = f.selection(0), two = f.selection(1);
  f.store.exportApproved(f.batchId, '1'.repeat(32), one);
  f.store.exportApproved(f.batchId, '2'.repeat(32), one);
  let summary = f.create().historySummary(f.batchId);
  assert.equal(summary.recorded_export_count, 2); assert.equal(summary.current_exported_count, 1);
  f.store.exportApproved(f.batchId, '3'.repeat(32), two);
  summary = f.create().historySummary(f.batchId);
  assert.equal(summary.current_exported_count, 2);
  f.decision(1, 'redact', [{ start: f.text.indexOf('42'), end: f.text.indexOf('42') + 2 }]);
  f.decision(1, 'approve');
  assert.equal(f.create().historySummary(f.batchId).current_exported_count, 1, 'new approved bytes are not covered by the former copy');
  f.store.exportApproved(f.batchId, '4'.repeat(32), f.selection(1));
  assert.equal(f.create().historySummary(f.batchId).current_exported_count, 2);
});

test('legacy absence is unknown, missing v2 documents stay separate and a corrupt journal never reports zero approvals', () => {
  const legacy = fixture();
  assert.deepEqual(legacy.store.historySummary(legacy.batchId), { ok: true, local_ui_only: true, external_disclosure: false, available: false });
  const f = fixture(true);
  const extra = { id: '8'.repeat(32), name: 'missing.docx', status: 'released' }; f.items.push(extra);
  assert.equal(f.store.historySummary(f.batchId).unavailable_count, 1);
  assert.equal(f.store.historySummary(f.batchId).reviewable_count, 2);
  f.decision(0, 'approve');
  const commit = path.join(f.data, 'document-reviews', f.batchId, 'commit-000001.json');
  fs.renameSync(commit, `${commit}.fixture-saved`);
  throwsCode(() => f.store.historySummary(f.batchId), 'DOCUMENT_REVIEW_INVALID');
  const message = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(16),
    action: 'get_document_review_history_summary', batch_id: f.batchId };
  assert.equal(validatePrivateMessage(message), message);
  for (const extra of [{ local_path: f.results }, { approve: true }, { document_id: f.items[0].id }])
    assert.throws(() => validatePrivateMessage({ ...message, ...extra }), 'summary accepts a run ID only');
});
test('actual package bytes, private original and metadata survive a fresh store', () => {
  const f = fixture(), row = f.row(0); assert.equal(row.approved, false);
  const chunk = f.create().chunk(f.batchId, row.document_id, 0, 0);
  assert.match(chunk.original_text, /Anna Beispiel/u); assert.doesNotMatch(chunk.markdown, /Anna Beispiel/u);
  assert.equal(chunk.markdown, f.text); assert.equal(chunk.external_disclosure, false);
});

test('expired processing journals cannot hide missing bodies or turn unproven input membership into published results', () => {
  const f = fixture(true); f.store.recordPublication(f.batchId, f.items[0].id); f.store.recordPublication(f.batchId, f.items[1].id);
  f.decision(0, 'approve');
  const reviewRoot = path.join(f.data, 'document-reviews', f.batchId);
  fs.renameSync(path.join(reviewRoot, f.items[1].id), path.join(f.dir, 'saved-document-fixture'));
  const fresh = createDocumentReviewStore({ dataRoot: f.data, outputRoot: () => f.output, resultRoot: () => f.results, expectedDocuments: () => [] });
  let summary = fresh.historySummary(f.batchId);
  assert.equal(summary.approved_count, 1); assert.equal(summary.reviewable_count, 1);
  assert.equal(summary.unavailable_count, 1); assert.equal(summary.unclassified_source_count, 0);
  assert.equal(fresh.list(f.batchId).unavailable[0].name, f.items[1].name);
  assert.equal(fs.existsSync(path.join(reviewRoot, f.items[1].id)), false, 'reading missing state cannot recreate a body directory');
  // Simulate a pre-index engineering run, not a published source by assertion.
  const membership = path.join(reviewRoot, `published-${f.items[1].id}.json`);
  fs.renameSync(membership, path.join(f.dir, 'saved-membership-fixture.json'));
  summary = fresh.historySummary(f.batchId);
  assert.equal(summary.unavailable_count, 0); assert.equal(summary.unclassified_source_count, 1);
  assert.equal(fresh.list(f.batchId).unclassified_documents[0].name, f.items[1].name);
  const knownStopped = createDocumentReviewStore({ dataRoot: f.data, outputRoot: () => f.output,
    expectedDocuments: () => [{ ...f.items[1], status: 'stopped' }] });
  assert.equal(knownStopped.historySummary(f.batchId).unclassified_source_count, 0, 'a known failed input is not an unproven publication');
  const retained = path.join(reviewRoot, `published-${f.items[0].id}.json`);
  const bad = JSON.parse(fs.readFileSync(retained, 'utf8')); bad.name = 'foreign.pdf'; fs.writeFileSync(retained, JSON.stringify(bad));
  throwsCode(() => fresh.historySummary(f.batchId), 'DOCUMENT_REVIEW_INVALID');
});
test('multilingual text above 8 MiB remains within the existing character budget', () => {
  const f = fixture(), item = { id: '7'.repeat(32), name: 'mehrsprachig.txt', sha256: sha('source'), status: 'released' };
  const text = '名'.repeat(3 * 1024 * 1024);
  f.items.push(item);
  const packageId = `ds_${item.id}`, packageDir = path.join(f.output, packageId); fs.mkdirSync(packageDir);
  f.store.capture(f.state, item, { package_id: packageId, original_text: text, markdown: text });
  fs.writeFileSync(path.join(packageDir, `${packageId}.md`), text);
  fs.writeFileSync(path.join(packageDir, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/3', package_id: packageId,
    document: `${packageId}.md`, verification: { text_residual_pii: 'passed' }, document_sha256: sha(text) }));
  const row = f.create().list(f.batchId).documents.find(value => value.document_id === item.id);
  assert.equal(row.output_sha256, sha(text));
  assert.equal(f.create().chunk(f.batchId, item.id, 0, 0).markdown, text.slice(0, 32768));
});

test('native JSON chunks never split a Unicode surrogate pair and reconstruct both different texts exactly', () => {
  const f = fixture(), item = { id: '6'.repeat(32), name: 'unicode.txt', sha256: sha('source'), status: 'released' };
  const original = 'a'.repeat(32767) + '😀' + 'q'.repeat(32766) + '🌍' + 'Z';
  const markdown = 'x'.repeat(32766) + '🌍' + 'y'.repeat(32767) + '😀' + 'Ende';
  f.items.push(item); const packageId = `ds_${item.id}`, dir = path.join(f.output, packageId); fs.mkdirSync(dir);
  f.store.capture(f.state, item, { package_id: packageId, original_text: original, markdown });
  fs.writeFileSync(path.join(dir, `${packageId}.md`), markdown);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/3', package_id: packageId,
    document: `${packageId}.md`, verification: { text_residual_pii: 'passed' }, document_sha256: sha(markdown) }));
  const row = f.store.list(f.batchId).documents.find(value => value.document_id === item.id), parts = [];
  for (let index = 0; index < row.chunks; index++) {
    const part = f.store.chunk(f.batchId, item.id, 0, index);
    assert.equal(part.original_text.isWellFormed(), true); assert.equal(part.markdown.isWellFormed(), true);
    parts.push(JSON.parse(JSON.stringify(part)));
  }
  assert.equal(parts.map(part => part.original_text).join(''), original);
  assert.equal(parts.map(part => part.markdown).join(''), markdown);
});

test('a snapshot without verified publication grants neither content access nor export', () => {
  const f = fixture(), item = { id: '9'.repeat(32), name: 'not-published.docx', sha256: sha('x'), status: 'released' };
  f.items.push(item); f.store.capture(f.state, item, { package_id: `ds_${item.id}`, original_text: 'private', markdown: 'candidate' });
  assert.equal(f.store.list(f.batchId).documents.length, 2);
  assert.equal(f.store.list(f.batchId).unavailable[0].name, 'not-published.docx');
  assert.throws(() => f.store.chunk(f.batchId, item.id, 0, 0));
});
test('expected released documents missing a snapshot are named rather than silently omitted', () => {
  const f = fixture(); f.items.push({ id: '8'.repeat(32), name: 'after-review.docx', status: 'released' });
  assert.deepEqual(f.store.list(f.batchId).unavailable, [{ document_id: '8'.repeat(32), name: 'after-review.docx', reason_code: 'DOCUMENT_REVIEW_MISSING' }]);
});
test('only explicitly approved selected revisions export, with no private extras or source names', () => {
  const f = fixture(); throwsCode(() => f.store.exportApproved(f.batchId, 'a'.repeat(32), f.selection(0)), 'DOCUMENT_REVIEW_UNAPPROVED');
  f.decision(0, 'approve'); const result = f.store.exportApproved(f.batchId, 'a'.repeat(32), f.selection(0));
  const target = path.join(f.results, 'DataSecure-KI-Export', result.folder_name);
  assert.deepEqual(fs.readdirSync(target), ['Dokument_01.md']); assert.equal(fs.readFileSync(path.join(target, 'Dokument_01.md'), 'utf8'), f.text);
  assert.equal(f.row(1).approved, false); assert.equal(result.exported_count, 1);
});
test('mask and restore both revoke approval, stale text cannot be approved, and source cannot be inserted', () => {
  const f = fixture(); const approved = f.decision(0, 'approve');
  const masked = f.decision(0, 'redact', [{ start: 9, end: 21 }]); assert.equal(masked.approved, false);
  const chunk = f.store.chunk(f.batchId, masked.document_id, masked.revision, 0); assert.match(chunk.markdown, /MANUAL_REDACTION/u);
  throwsCode(() => f.store.decide(f.batchId, approved.document_id, { action: 'approve', revision: approved.revision,
    output_sha256: approved.output_sha256, ranges: [], operation_id: 'b'.repeat(32) }), 'DOCUMENT_REVIEW_STALE');
  f.decision(0, 'approve'); const restored = f.decision(0, 'restore_base'); assert.equal(restored.approved, false);
  assert.equal(f.store.chunk(f.batchId, restored.document_id, restored.revision, 0).markdown, f.text);
  throwsCode(() => f.decision(0, 'insert_source'), 'DOCUMENT_REVIEW_INVALID');
});

test('current identity reference and immutable export reference follow actual typed revisions without private export extras', () => {
  const f = fixture(true, true), current = f.store.resolveIdentityOverview(f.batchId);
  assert.equal(current.external_disclosure, false); assert.equal(current.target_kind, 'file');
  const before = fs.readFileSync(current.local_path, 'utf8'); assert.match(before, /Anna Beispiel/u);
  assert.equal(f.row(0).approved, false, 'opening does not approve');
  f.decision(0, 'approve'); const op = 'a'.repeat(32), selected = f.selection(0);
  const exported = f.store.exportApproved(f.batchId, op, selected);
  const frozen = f.create().resolveIdentityOverview(f.batchId, op), bytes = fs.readFileSync(frozen.local_path, 'utf8');
  assert.match(bytes, /Quelle-1\.pdf/u); assert.doesNotMatch(bytes, /Quelle-2\.pdf/u);
  const row = f.row(0), entity = f.store.entities(f.batchId, row.document_id, row.revision, 0).entities.find(value => value.kind === 'PERSON');
  f.store.decide(f.batchId, row.document_id, { action: 'entities', ranges: [], revision: row.revision, output_sha256: row.output_sha256,
    operation_id: 'b'.repeat(32), entity_decisions: [{ entity_id: entity.entity_id, decision: 'organization' }] });
  const edited = f.create().resolveIdentityOverview(f.batchId);
  assert.notEqual(edited.local_path, current.local_path); assert.match(fs.readFileSync(edited.local_path, 'utf8'), /UNTERNEHMEN_[A-Z2-7]{52}/u);
  assert.equal(f.row(0).approved, false); assert.equal(f.create().resolveIdentityOverview(f.batchId, op).local_path, frozen.local_path);
  assert.equal(fs.readFileSync(frozen.local_path, 'utf8'), bytes);
  assert.deepEqual(fs.readdirSync(path.join(f.results, 'DataSecure-KI-Export', exported.folder_name)), ['Dokument_01.md']);
  assert.equal(f.create().list(f.batchId).export_receipts[0].identity_overview_available, true);
});

test('identity selection compares values rather than JSON object key order across native IPC', () => {
  const f = fixture(true, true);
  f.decision(0, 'approve'); f.decision(1, 'approve');
  // serde_json maps cross the real Tauri boundary in lexicographic key order.
  // This is the same closed selection, not a different document revision.
  const selected = [...f.selection(1), ...f.selection(0)].map(row => ({
    document_id: row.document_id, output_sha256: row.output_sha256, revision: row.revision }));
  const op = 'b'.repeat(32), result = f.store.exportApproved(f.batchId, op, selected);
  assert.equal(result.exported_count, 2);
  assert.equal(f.create().resolveIdentityOverview(f.batchId, op).ok, true);
  assert.deepEqual(fs.readdirSync(path.join(f.results, 'DataSecure-KI-Export', result.folder_name)), ['Dokument_01.md', 'Dokument_02.md']);
});

test('identity persistence fails before export intent and target creation, and a completed copy survives missing human reference data', () => {
  const f = fixture(true, true); f.decision(0, 'approve'); const op = 'c'.repeat(32), selected = f.selection(0);
  faultOnce(target => target.endsWith('.txt'), () => throwsCode(() => f.store.exportApproved(f.batchId, op, selected), 'STANDALONE_IDENTITY_PUBLICATION_FAILED'));
  const run = path.join(f.data, 'document-reviews', f.batchId);
  assert.equal(fs.existsSync(path.join(run, `export-${op}.json`)), false);
  assert.equal(fs.existsSync(path.join(f.results, 'DataSecure-KI-Export')), false);
  const result = f.create().exportApproved(f.batchId, op, selected), reference = f.create().resolveIdentityOverview(f.batchId, op);
  fs.unlinkSync(reference.local_path);
  assert.equal(f.create().list(f.batchId).export_receipts.length, 1);
  throwsCode(() => f.create().resolveIdentityOverview(f.batchId, op), 'STANDALONE_IDENTITY_MAPPING_MISSING');
  assert.deepEqual(f.create().exportApproved(f.batchId, op, selected, true), result);
  assert.equal(f.create().list(f.batchId).pending_exports.length, 0);
  assert.equal(f.create().resolveExport(f.batchId, op).target_kind, 'directory');
});

test('historical identity opening never silently rebuilds missing or altered snapshots from current text', () => {
  const f = fixture(true, true); f.decision(0, 'approve'); const op = 'd'.repeat(32);
  f.store.exportApproved(f.batchId, op, f.selection(0));
  const reference = f.create().resolveIdentityOverview(f.batchId, op);
  fs.writeFileSync(reference.local_path, 'wrong revision');
  throwsCode(() => f.create().resolveIdentityOverview(f.batchId, op), 'STANDALONE_IDENTITY_MAPPING_INVALID');
  assert.equal(fs.readFileSync(reference.local_path, 'utf8'), 'wrong revision');
  assert.equal(f.create().list(f.batchId).export_receipts.length, 1);
});

test('changing human reference text and its separate digest cannot forge an export-bound identity', () => {
  const f = fixture(true, true); f.decision(0, 'approve'); const op = '5'.repeat(32);
  f.store.exportApproved(f.batchId, op, f.selection(0));
  const reference = f.create().resolveIdentityOverview(f.batchId, op);
  const binding = path.basename(reference.local_path).slice('DataSecure-Identitaeten-'.length, -4);
  const recordFile = path.join(path.dirname(reference.local_path), `identity-${binding}.json`);
  const record = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
  const forged = fs.readFileSync(reference.local_path, 'utf8').replace(/Anna Beispiel/gu, 'Bernd Fremdwert');
  fs.writeFileSync(reference.local_path, forged); record.text_sha256 = sha(forged);
  fs.writeFileSync(recordFile, JSON.stringify(record));
  throwsCode(() => f.create().resolveIdentityOverview(f.batchId, op), 'STANDALONE_IDENTITY_MAPPING_INVALID');
  assert.equal(fs.readFileSync(reference.local_path, 'utf8'), forged, 'never repair evidence by overwriting');
  assert.equal(f.create().list(f.batchId).export_receipts.length, 1);
});
test('same decision acknowledgement is idempotent, altered operation is rejected', () => {
  const f = fixture(), value = f.row(0), request = { action: 'approve', ranges: [], revision: value.revision, output_sha256: value.output_sha256, operation_id: 'c'.repeat(32) };
  const a = f.store.decide(f.batchId, value.document_id, request), b = f.create().decide(f.batchId, value.document_id, request);
  assert.deepEqual(a, b); throwsCode(() => f.store.decide(f.batchId, value.document_id, { ...request, action: 'revoke' }), 'DOCUMENT_REVIEW_CONFLICT');
});
test('completed export lost acknowledgement reconciles after later revocation, without copying again', () => {
  const f = fixture(); f.decision(0, 'approve'); const selected = f.selection(0), op = 'd'.repeat(32);
  const a = f.store.exportApproved(f.batchId, op, selected); f.decision(0, 'revoke');
  assert.deepEqual(f.create().exportApproved(f.batchId, op, selected), a);
  throwsCode(() => f.store.exportApproved(f.batchId, 'e'.repeat(32), selected), 'DOCUMENT_REVIEW_STALE');
  assert.equal(fs.readdirSync(path.join(f.results, 'DataSecure-KI-Export')).length, 1);
});

test('unconfirmed export is discoverable and explicitly acknowledged in a fresh process after later revocation', () => {
  const f = fixture(); f.decision(0, 'approve'); const selected = f.selection(0), operationId = '5'.repeat(32);
  const result = f.store.exportApproved(f.batchId, operationId, selected); f.decision(0, 'revoke');
  const script = `const {createDocumentReviewStore}=require(process.argv[1]); const f=JSON.parse(process.argv[2]);
    const s=createDocumentReviewStore({dataRoot:f.data,outputRoot:()=>f.output,resultRoot:()=>f.results,expectedDocuments:()=>f.items});
    const before=s.list(f.batchId); const receipt=s.exportApproved(f.batchId,f.operationId,f.selected,true);
    process.stdout.write(JSON.stringify({before,receipt,after:s.list(f.batchId)}));`;
  const response = JSON.parse(execFileSync(process.execPath, ['-e', script,
    require.resolve('../plugins/data-secure/server/gateway/standalone-document-review-store'), JSON.stringify({
      data: f.data, output: f.output, results: f.results, items: f.items, batchId: f.batchId, operationId, selected })], { encoding: 'utf8' }));
  assert.equal(response.before.pending_exports.length, 1);
  assert.deepEqual(response.before.pending_exports[0].selection, selected);
  assert.equal(response.before.pending_exports[0].operation_id, operationId);
  assert.equal(response.before.pending_exports[0].status, 'completed');
  assert.equal(response.before.pending_exports[0].processing_mode, 'markdown-and-anonymize');
  assert.match(response.before.pending_exports[0].digest, /^[a-f0-9]{64}$/u);
  assert.deepEqual(response.receipt, result); assert.deepEqual(response.after.pending_exports, []);
  assert.equal(response.before.export_receipts[0].folder_name, result.folder_name);
  assert.deepEqual(response.after.export_receipts, response.before.export_receipts);
  assert.equal(fs.readdirSync(path.join(f.results, 'DataSecure-KI-Export')).length, 1);
  assert.equal(response.after.documents.find(row => row.document_id === selected[0].document_id).approved, false);
});

test('opening a completed export resolves only its recorded purpose and destination without acknowledging or copying', () => {
  const f = fixture(); f.decision(0, 'approve'); const op = '7'.repeat(32), selection = f.selection(0);
  const result = f.store.exportApproved(f.batchId, op, selection);
  const before = f.store.list(f.batchId).pending_exports;
  f.decision(0, 'revoke');
  const fresh = createDocumentReviewStore({ dataRoot: f.data, outputRoot: () => f.output,
    resultRoot: () => { throw Error('opening may not use the new default destination'); } });
  assert.deepEqual(fresh.resolveExport(f.batchId, op), { ok: true, local_path: path.join(f.results, 'DataSecure-KI-Export', result.folder_name),
    target_kind: 'directory', external_disclosure: false });
  assert.deepEqual(f.store.list(f.batchId).pending_exports, before);
  assert.equal(fs.readdirSync(path.join(f.results, 'DataSecure-KI-Export')).length, 1);
});

test('opening refuses incomplete, changed, extra-file and replaced export destinations without repairing them', () => {
  const incomplete = fixture(); incomplete.decision(0, 'approve'); const op = '7'.repeat(32);
  faultOnce(target => target.endsWith('Dokument_01.md'), () => throwsCode(() => incomplete.store.exportApproved(incomplete.batchId, op, incomplete.selection(0)), 'AI_EXPORT_INCOMPLETE'));
  throwsCode(() => incomplete.create().resolveExport(incomplete.batchId, op), 'AI_EXPORT_INCOMPLETE');
  assert.deepEqual(fs.readdirSync(path.join(incomplete.results, 'DataSecure-KI-Export', `Export-${op}`)), []);
  for (const alter of ['bytes', 'extra', 'replacement', 'missing']) {
    const f = fixture(); f.decision(0, 'approve'); f.store.exportApproved(f.batchId, op, f.selection(0));
    const target = path.join(f.results, 'DataSecure-KI-Export', `Export-${op}`);
    if (alter === 'bytes') fs.writeFileSync(path.join(target, 'Dokument_01.md'), 'changed');
    if (alter === 'extra') fs.writeFileSync(path.join(target, 'private.txt'), 'foreign');
    if (['replacement', 'missing'].includes(alter)) fs.renameSync(target, `${target}-saved`);
    if (alter === 'replacement') { fs.mkdirSync(target); fs.writeFileSync(path.join(target, 'Dokument_01.md'), f.text); }
    throwsCode(() => f.create().resolveExport(f.batchId, op), 'AI_EXPORT_CONFLICT');
    assert.equal(fs.existsSync(target), alter !== 'missing');
    assert.equal(fs.existsSync(path.join(f.data, 'document-reviews', f.batchId, `export-${op}-acknowledged.json`)), false);
  }
});

test('opening export transport accepts identifiers only and rejects caller-selected paths or copying payloads', () => {
  const request = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(16), action: 'resolve_document_export',
    batch_id: 'b'.repeat(64), operation_id: 'c'.repeat(32) };
  assert.deepEqual(validatePrivateMessage(request), request);
  for (const fields of [{ local_path: root }, { selection: [] }, { acknowledge: true }, { operation_id: '../foreign' }])
    assert.throws(() => validatePrivateMessage({ ...request, ...fields }));
});

test('identity opening transport accepts only run ID and optional exact export ID', () => {
  const request = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(16), action: 'resolve_document_identity_overview', batch_id: 'b'.repeat(64) };
  assert.deepEqual(validatePrivateMessage(request), request);
  assert.equal(validatePrivateMessage({ ...request, operation_id: 'c'.repeat(32) }).operation_id, 'c'.repeat(32));
  for (const extra of [{ local_path: root }, { markdown: 'original' }, { operation_id: null }, { operation_id: '../secret' }, { selection: [] }])
    assert.throws(() => validatePrivateMessage({ ...request, ...extra }));
});

test('pending export selection projection is bounded to the next operation while the total count remains explicit', () => {
  const f = fixture(); f.decision(0, 'approve'); const selected = f.selection(0);
  for (const op of ['8'.repeat(32), '9'.repeat(32)]) {
    faultOnce(target => target.endsWith('Dokument_01.md'), () => throwsCode(() => f.store.exportApproved(f.batchId, op, selected), 'AI_EXPORT_INCOMPLETE'));
  }
  const state = f.create().list(f.batchId); assert.equal(state.pending_exports.length, 1);
  assert.equal(state.pending_export_count, 2); assert.equal(state.export_receipts.length, 0);
});

test('acknowledging an incomplete export never starts copying or loses its pending receipt', () => {
  const f = fixture(); f.decision(0, 'approve'); const op = '7'.repeat(32), selected = f.selection(0);
  faultOnce(target => target.endsWith('Dokument_01.md'), () => throwsCode(() => f.store.exportApproved(f.batchId, op, selected), 'AI_EXPORT_INCOMPLETE'));
  throwsCode(() => f.create().exportApproved(f.batchId, op, selected, true), 'AI_EXPORT_INCOMPLETE');
  const pending = f.store.list(f.batchId).pending_exports;
  assert.deepEqual(pending[0].selection, selected); assert.equal(pending[0].status, 'incomplete');
  assert.deepEqual(fs.readdirSync(path.join(f.results, 'DataSecure-KI-Export', `Export-${op}`)), []);
});
test('abandonment is durable, idempotent and preserves partially written output without allowing retries', () => {
  const f = fixture(); f.decision(0, 'approve'); f.decision(1, 'approve');
  const op = '4'.repeat(32), selection = [...f.selection(0), ...f.selection(1)];
  faultOnce(target => target.endsWith('Dokument_02.md'), () => throwsCode(() => f.store.exportApproved(f.batchId, op, selection), 'AI_EXPORT_INCOMPLETE'));
  const pending = f.store.list(f.batchId).pending_exports[0];
  throwsCode(() => f.store.abandonExport(f.batchId, op, '0'.repeat(64)), 'AI_EXPORT_CONFLICT');
  const result = f.store.abandonExport(f.batchId, op, pending.digest);
  assert.deepEqual(f.create().abandonExport(f.batchId, op, pending.digest), result);
  assert.equal(f.create().list(f.batchId).pending_export_count, 0);
  throwsCode(() => f.create().exportApproved(f.batchId, op, selection), 'AI_EXPORT_ABANDONED');
  throwsCode(() => f.create().exportApproved(f.batchId, op, selection, true), 'AI_EXPORT_ABANDONED');
  const folder = path.join(f.results, 'DataSecure-KI-Export', `Export-${op}`);
  assert.deepEqual(fs.readdirSync(folder), ['Dokument_01.md']);
  assert.equal(fs.readFileSync(path.join(folder, 'Dokument_01.md'), 'utf8'), f.text);
  assert.equal(f.row(0).approved, true); assert.equal(f.row(1).approved, true);
});

test('completed exports cannot be abandoned; failed abandon persistence leaves the intent discoverable', () => {
  const f = fixture(); f.decision(0, 'approve'); const op = '3'.repeat(32), selection = f.selection(0);
  faultOnce(target => target.endsWith('Dokument_01.md'), () => throwsCode(() => f.store.exportApproved(f.batchId, op, selection), 'AI_EXPORT_INCOMPLETE'));
  const pending = f.store.list(f.batchId).pending_exports[0];
  faultOnce(target => target.endsWith('-abandoned.json'), () => assert.throws(() => f.store.abandonExport(f.batchId, op, pending.digest)));
  assert.equal(f.store.list(f.batchId).pending_export_count, 1);
  f.store.exportApproved(f.batchId, op, selection);
  throwsCode(() => f.store.abandonExport(f.batchId, op, pending.digest), 'AI_EXPORT_ALREADY_COMPLETE');
  assert.equal(f.store.exportApproved(f.batchId, op, selection, true).ok, true);
});

test('failed intent persistence creates no visible directory and retry succeeds', () => {
  const f = fixture(); f.decision(0, 'approve'); const op = 'f'.repeat(32), selected = f.selection(0);
  faultOnce(target => target.endsWith(`export-${op}.json`), () => assert.throws(() => f.store.exportApproved(f.batchId, op, selected)));
  assert.equal(fs.existsSync(path.join(f.results, 'DataSecure-KI-Export')), false);
  assert.equal(f.store.exportApproved(f.batchId, op, selected).exported_count, 1);
});
test('failed ownership persistence leaves an unbound empty folder untouched and retries in a new folder', () => {
  const f = fixture(); f.decision(0, 'approve'); const op = '1'.repeat(32), selected = f.selection(0);
  faultOnce(target => target.endsWith(`export-${op}-1-owner.json`), () => assert.throws(() => f.store.exportApproved(f.batchId, op, selected)));
  const original = path.join(f.results, 'DataSecure-KI-Export', `Export-${op}`);
  assert.deepEqual(fs.readdirSync(original), []);
  const response = f.create().exportApproved(f.batchId, op, selected); assert.equal(response.folder_name, `Export-${op}-2`);
  assert.deepEqual(fs.readdirSync(original), []);
});
test('failed document write retries the owned operation and validates actual output bytes', () => {
  const f = fixture(); f.decision(0, 'approve'); const op = '2'.repeat(32), selected = f.selection(0);
  faultOnce(target => target.endsWith('Dokument_01.md'), () => throwsCode(() => f.store.exportApproved(f.batchId, op, selected), 'AI_EXPORT_INCOMPLETE'));
  const a = f.create().exportApproved(f.batchId, op, selected); assert.equal(a.folder_name, `Export-${op}`);
  fs.appendFileSync(path.join(f.results, 'DataSecure-KI-Export', a.folder_name, 'Dokument_01.md'), 'changed');
  throwsCode(() => f.store.exportApproved(f.batchId, op, selected), 'AI_EXPORT_CONFLICT');
});
test('failed completion acknowledgement reconciles written files without duplicating the export', () => {
  const f = fixture(); f.decision(0, 'approve'); const op = '3'.repeat(32), selected = f.selection(0);
  faultOnce(target => target.endsWith(`export-${op}-complete.json`), () => assert.throws(() => f.store.exportApproved(f.batchId, op, selected)));
  assert.equal(f.create().exportApproved(f.batchId, op, selected).folder_name, `Export-${op}`);
});
test('saved target identity rejects replacement at initial store binding', () => {
  const f = fixture(), target = path.join(f.results, 'target'); fs.mkdirSync(target); const expected = bindDirectory(target).chain[0].identity;
  createPrivateWorkStore({ privateRoot: target, expectedRootIdentity: expected }).ensureReady();
  fs.renameSync(target, `${target}-old`); fs.mkdirSync(target);
  throwsCode(() => createPrivateWorkStore({ privateRoot: target, expectedRootIdentity: expected }), 'PRIVATE_ARTIFACT_ROOT_INVALID');
});
test('export operation IDs cannot be reused for a different selection', () => {
  const f = fixture(); f.decision(0, 'approve'); f.decision(1, 'approve'); const op = '4'.repeat(32);
  f.store.exportApproved(f.batchId, op, f.selection(0));
  throwsCode(() => f.store.exportApproved(f.batchId, op, f.selection(1)), 'AI_EXPORT_CONFLICT');
});
test('private IPC refuses arbitrary paths, inserted text and malformed revision selections', () => {
  const message = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(16), batch_id: 'b'.repeat(64),
    action: 'export_approved_documents', operation_id: 'a'.repeat(32), selection: [{ document_id: 'c'.repeat(32), revision: 1, output_sha256: 'd'.repeat(64) }] };
  assert.equal(validatePrivateMessage(message), message);
  assert.equal(validatePrivateMessage({ ...message, acknowledge: true }).acknowledge, true);
  for (const extra of [{ path: root }, { selection: [{ ...message.selection[0], markdown: 'secret' }] }, { selection: [null] }])
    assert.throws(() => validatePrivateMessage({ ...message, ...extra }));
  for (const acknowledge of [false, 'true', 1, null]) assert.throws(() => validatePrivateMessage({ ...message, acknowledge }));
});
test('plain Markdown corrections persist, revoke approval and never use the KI namespace', () => {
  const f = fixture(), item = { id: '5'.repeat(32), name: 'scan.pdf', sha256: sha('source'), status: 'released' };
  const id = `dm_${item.id}`, markdown = 'E-Mail: anqa@example.invalid\n';
  const { createMarkdownArtifact, validateMarkdownArtifact } = require('../plugins/data-secure/server/standalone/markdown-artifact');
  const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
  const artifact = createMarkdownArtifact(createMarkdownExtraction({ source_type: 'pdf', markdown, coverage: { status: 'complete', reason_codes: [] } }), id);
  const folder = path.join(f.output, id); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(artifact.manifest));
  fs.writeFileSync(path.join(folder, `${id}.md`), artifact.markdown);
  const create = () => createDocumentReviewStore({ dataRoot: f.data, resultRoot: () => f.results, expectedDocuments: () => [item],
    readMarkdownArtifact(artifactId) { const manifest = JSON.parse(fs.readFileSync(path.join(f.output, artifactId, 'manifest.json')));
      const text = fs.readFileSync(path.join(f.output, artifactId, `${artifactId}.md`), 'utf8'); validateMarkdownArtifact(manifest, text); return { manifest, markdown: text }; } });
  const store = create(); store.capture({ ...f.state, processing_mode: 'markdown-only' }, item, { package_id: id, original_text: markdown, markdown });
  let row = store.list(f.batchId).documents.find(row => row.document_id === item.id);
  const decide = (action, ranges = []) => { const result = create().decide(f.batchId, item.id, { action, ranges, revision: row.revision,
    output_sha256: row.output_sha256, operation_id: crypto.randomBytes(16).toString('hex') }); row = result; };
  decide('approve'); decide('correct', [{ start: 8, end: 12, replacement: 'anna' }]);
  assert.equal(row.approved, false); assert.equal(row.processing_mode, 'markdown-only');
  assert.match(create().chunk(f.batchId, item.id, row.revision, 0).markdown, /anna@example/u);
  assert.equal(fs.readFileSync(path.join(folder, `${id}.md`), 'utf8'), markdown);
  decide('approve'); const result = create().exportApproved(f.batchId, '6'.repeat(32), [{ document_id: item.id, revision: row.revision, output_sha256: row.output_sha256 }]);
  assert.equal(result.anonymized, false); assert.equal(result.processing_mode, 'markdown-only');
  assert.match(fs.readFileSync(path.join(f.results, 'DataSecure-Markdown-Korrektur', result.folder_name, 'Dokument_01.md'), 'utf8'), /anna@example/u);
  assert.equal(fs.existsSync(path.join(f.results, 'DataSecure-KI-Export')), false);
  throwsCode(() => create().resolveIdentityOverview(f.batchId, '6'.repeat(32)), 'STANDALONE_IDENTITY_MAPPING_MISSING');
  assert.equal(create().list(f.batchId).export_receipts[0].identity_overview_available, false);
  const anon = f.row(0); throwsCode(() => f.store.decide(f.batchId, anon.document_id, { action: 'correct', ranges: [{ start: 0, end: 0, replacement: 'Anna Beispiel' }],
    revision: anon.revision, output_sha256: anon.output_sha256, operation_id: '7'.repeat(32) }), 'DOCUMENT_REVIEW_INVALID');
});
done();
