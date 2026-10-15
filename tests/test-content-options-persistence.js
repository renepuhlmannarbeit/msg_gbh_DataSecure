'use strict';

// Real private files and fresh store instances, not a cached WeakMap or a
// simulated resume. This does not stand in for native GUI/package acceptance.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { CONTENT_OPTIONS_SCHEMA } = require('../plugins/data-secure/server/core/content-options');
const { createBatchJournalStore } = require('../plugins/data-secure/server/gateway/batch-journal-store');
const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const { createBatchPseudonymState } = require('../plugins/data-secure/server/batch-pseudonym-context');
const { createBatchIntakeIntent } = require('../plugins/data-secure/server/gateway/batch-intake-intent');
const { createContactStore } = require('../plugins/data-secure/server/gateway/ocr-contact-store');
const { createPrivateWorkStore } = require('../plugins/data-secure/server/gateway/private-work-store');
const { buildContactDraft } = require('../plugins/data-secure/server/core/ocr-contact-review');
const { contactSpans } = require('../plugins/data-secure/server/core/ocr-contact-review');
const { contactQuality } = require('../plugins/data-secure/server/standalone/ocr-quality');
const { createBatchRetentionProtection } = require('../plugins/data-secure/server/gateway/batch-retention-protection');
const { test, assert, done } = createSuite('Durable content options / restart binding');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-content-binding-'));
let number = 0;
const defaults = () => ({ schema: CONTENT_OPTIONS_SCHEMA, markdownOutput: 'content-v1', scanOcr: true, imageOcr: false });
function fixture(mode, content = defaults(), rejected = false) {
  const token = (++number).toString(16).padStart(64, '0'), data = path.join(root, String(number)); fs.mkdirSync(data);
  const target = path.join(data, `${token}.json`);
  const item = { id: 'a'.repeat(32), name: 'Quelle.txt', source_label: 'Ordner/Quelle.txt',
    ...(rejected ? { status: 'stopped', checkpoint: 'source_preflight_stopped', local_mapping_exported: true,
      error_code: 'SOURCE_TEXT_INVALID', document_result: { schema: 'datasecure-document-result/1', grade: 'not-processed',
        omissions: [], reason_code: 'SOURCE_TEXT_INVALID' } } :
      { status: 'pending', checkpoint: 'sealed', work_name: `001_${'b'.repeat(24)}.workcopy`, private_artifact_plain: true,
        sha256: crypto.createHash('sha256').update('same source').digest('hex') }) };
  const state = { schema: 'datasecure-batch/7', token, product_channel: 'standalone', processing_mode: mode,
    standalone_document_review: true, content_options: content, expires_at: '2099-01-01T00:00:00.000Z', items: [item],
    ...(mode === 'markdown-and-anonymize' ? { ...createBatchPseudonymState({ productChannel: 'standalone' }), output_naming_mode: 'neutral' } : {}) };
  const create = () => createBatchJournalStore({ batchPath: () => target, documentReviewDataRoot: data,
    productChannel: 'standalone', nowMs: () => 0 });
  const review = () => createDocumentReviewStore({ dataRoot: data });
  return { state, item, data, target, create, review, manifest: path.join(data, 'document-reviews', token, 'manifest.json') };
}
const code = (action, expected) => assert.throws(action, error => error.code === expected);

test('both purposes bind all eight option combinations before any resumable checkpoint', () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) for (const markdownOutput of ['content-v1', 'notes-v1'])
    for (const scanOcr of [false, true]) for (const imageOcr of [false, true]) {
      const f = fixture(mode, { schema: CONTENT_OPTIONS_SCHEMA, markdownOutput, scanOcr, imageOcr });
      f.create().writeState(f.state);
      code(() => f.create().readState(f.state.token), 'CONTENT_OPTIONS_BINDING_MISSING');
      f.review().captureRun(f.state);
      const restored = f.create().readState(f.state.token), manifest = JSON.parse(fs.readFileSync(f.manifest));
      assert.equal(manifest.schema, 'datasecure-document-run/3'); assert.deepEqual(manifest.preflight_rejections, []);
      assert.deepEqual(restored.content_options, f.state.content_options); assert.deepEqual(manifest.content_options, f.state.content_options);
      f.create().writeState({ ...restored, revision: 2 });
      assert.equal(f.create().readStateForMaintenance(f.state.token).revision, 2);
      const before = fs.readFileSync(f.manifest); f.review().captureRun(restored);
      assert.ok(fs.readFileSync(f.manifest).equals(before), 'recovery capture never rewrites the immutable contract');
    }
});

test('an OCR-contact opt-out survives restart only for the original raw opt-in', () => {
  const f = fixture('markdown-only');
  f.state.ocr_contact_review = true;
  f.state.ocr_review_seed = Buffer.alloc(32, 19).toString('base64url');
  f.item.status = 'deferred_review';
  f.create().writeState(f.state); f.review().captureRun(f.state);
  const resumed = f.create().readState(f.state.token);
  resumed.ocr_contact_review_skipped = true;
  f.create().writeState(resumed);
  assert.equal(f.create().readState(f.state.token).ocr_contact_review_skipped, true);
  const altered = { ...resumed, ocr_contact_review: false };
  assert.throws(() => f.create().writeState(altered));
});

test('same-text valid option changes are refused after a fresh process/store read and before publication', () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) for (const [field, value] of
    [['markdownOutput', 'notes-v1'], ['scanOcr', false], ['imageOcr', true]]) {
      const f = fixture(mode); f.create().writeState(f.state); f.review().captureRun(f.state);
      const changed = { ...f.state, content_options: { ...f.state.content_options, [field]: value } };
      // Simulate a journal edited while the application was not running. A
      // brand-new store has no purpose WeakMap populated from old memory.
      fs.writeFileSync(f.target, JSON.stringify(changed));
      const before = fs.readFileSync(f.target);
      code(() => f.create().readState(f.state.token), 'CONTENT_OPTIONS_BINDING_INVALID');
      code(() => f.create().readStateForMaintenance(f.state.token), 'CONTENT_OPTIONS_BINDING_INVALID');
      code(() => f.create().writeState(changed), 'CONTENT_OPTIONS_BINDING_INVALID');
      assert.ok(fs.readFileSync(f.target).equals(before));
    }
});

test('downgrading the journal and deleting its options/review flag cannot evade the independent run anchor', () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const f = fixture(mode); f.create().writeState(f.state); f.review().captureRun(f.state);
    const changed = { ...f.state, schema: `datasecure-batch/${mode === 'markdown-only' ? 5 : 6}` };
    delete changed.content_options; delete changed.standalone_document_review;
    fs.writeFileSync(f.target, JSON.stringify(changed));
    code(() => f.create().readState(f.state.token), 'CONTENT_OPTIONS_BINDING_INVALID');
    code(() => f.create().writeState(changed), 'CONTENT_OPTIONS_BINDING_INVALID');
    assert.equal(fs.existsSync(f.manifest), true);
  }
});

test('manifest-only changes and a missing durable anchor fail closed, including maintenance', () => {
  const f = fixture('markdown-only'); f.create().writeState(f.state); f.review().captureRun(f.state);
  const manifest = JSON.parse(fs.readFileSync(f.manifest)); manifest.content_options.imageOcr = true;
  fs.writeFileSync(f.manifest, JSON.stringify(manifest));
  code(() => f.create().readState(f.state.token), 'CONTENT_OPTIONS_BINDING_INVALID');
  fs.unlinkSync(f.manifest); // exact synthetic artifact, test-owned temporary root
  code(() => f.create().readState(f.state.token), 'CONTENT_OPTIONS_BINDING_MISSING');
  code(() => f.create().readStateForMaintenance(f.state.token), 'CONTENT_OPTIONS_BINDING_MISSING');
});

test('all-rejected input has the same mandatory option anchor without false document authority', () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const f = fixture(mode, defaults(), true); f.create().writeState(f.state); f.review().captureRun(f.state);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.manifest)).documents, []);
    assert.equal(f.review().list(f.state.token).documents.length, 0);
    assert.equal(f.review().list(f.state.token).not_processed_documents[0].name, 'Ordner/Quelle.txt');
    assert.equal(f.create().readState(f.state.token).items[0].status, 'stopped');
  }
});

test('in-place changes and manifest downgrade fail while key-order-only changes remain equivalent', () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const f = fixture(mode); const store = f.create(); store.writeState(f.state); f.review().captureRun(f.state);
    const restored = store.readState(f.state.token); restored.content_options.imageOcr = true;
    code(() => store.writeState(restored), 'BATCH_PROCESSING_MODE_CHANGED');
    restored.content_options = Object.fromEntries(Object.entries(defaults()).reverse());
    store.writeState(restored); assert.deepEqual(f.create().readState(f.state.token).content_options, defaults());
    const manifest = JSON.parse(fs.readFileSync(f.manifest)); manifest.schema = 'datasecure-document-run/1';
    delete manifest.content_options; delete manifest.preflight_rejections; fs.writeFileSync(f.manifest, JSON.stringify(manifest));
    code(() => f.create().readState(f.state.token), 'CONTENT_OPTIONS_BINDING_INVALID');
  }
});

test('retention remains blocked after valid journal downgrades and cannot delete protected raw results', () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const f = fixture(mode); f.create().writeState(f.state); f.review().captureRun(f.state);
    const protection = () => createBatchRetentionProtection({ batchRoot: () => f.data, documentReviewDataRoot: f.data });
    if (mode === 'markdown-only') assert.ok(protection().openBatchPackageProtection().ids.has(`dm_${f.item.id}`));
    const changed = { ...f.state, schema: mode === 'markdown-only' ? 'datasecure-batch/5' : 'datasecure-batch/6' };
    delete changed.content_options; delete changed.standalone_document_review; fs.writeFileSync(f.target, JSON.stringify(changed));
    assert.equal(protection().openBatchPackageProtection().complete, false);
    changed.schema = 'datasecure-batch/4'; changed.product_channel = 'plugin';
    delete changed.processing_mode; delete changed.output_naming_mode; fs.writeFileSync(f.target, JSON.stringify(changed));
    assert.equal(protection().openBatchPackageProtection().complete, false, 'channel spoofing is not permission for cleanup');
  }
});

test('new intake intent is closed and validates content options before touching private work', () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const f = fixture(mode), work = path.join(f.data, 'work'); fs.mkdirSync(work);
    const make = () => createBatchIntakeIntent({ batchPath: () => f.target, workPath: () => work });
    const intent = make().create(f.state.token, f.state.expires_at, undefined,
      { productChannel: 'standalone', processingMode: mode, contentOptions: defaults() });
    assert.equal(intent.schema, 'datasecure-intake/3'); assert.deepEqual(make().read(f.state.token).content_options, defaults());
    const target = make().intentPath(f.state.token), changed = { ...intent, content_options: null };
    fs.writeFileSync(target, JSON.stringify(changed)); assert.throws(() => make().read(f.state.token));
    changed.schema = 'datasecure-intake/1'; fs.writeFileSync(target, JSON.stringify(changed));
    assert.throws(() => make().read(f.state.token), /BATCH_INTAKE_INTENT_INVALID/u);
  }
  let reads = 0;
  const intent = createBatchIntakeIntent({ io: { lstatSync() { reads++; throw new Error('I/O forbidden'); } } });
  code(() => intent.create('a'.repeat(64), '2099-01-01', undefined,
    { productChannel: 'standalone', processingMode: 'markdown-only', contentOptions: null }), 'CONTENT_OPTIONS_INVALID');
  code(() => intent.create('a'.repeat(64), '2099-01-01', undefined,
    { productChannel: 'plugin', processingMode: 'markdown-and-anonymize', contentOptions: defaults() }), 'CONTENT_OPTIONS_FORBIDDEN');
  assert.equal(reads, 0);
});

test('OCR correction HMAC binds every option even if the extraction and visible correction are unchanged', () => {
  const original_text = 'E-Mail: test@example.invalid';
  const source = { original_text, source_type: 'png', contacts: contactSpans(original_text, contactQuality({}, original_text)) };
  const answer = { action: 'reviewed', redactions: [], decisions: buildContactDraft(source).ambiguities
    .map(row => ({ ambiguity_id: row.ambiguity_id, decision: 'confirm_contact' })) };
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const f = fixture(mode);
    if (mode === 'markdown-only') Object.assign(f.state, { ocr_contact_review: true, ocr_review_seed: crypto.randomBytes(32).toString('base64url') });
    const input = { ...source, ...(mode === 'markdown-only' ? { processing_mode: mode } : {}) }, make = () => createContactStore({ privateWorkStore:
      createPrivateWorkStore({ privateRoot: f.data }), workPath: () => f.data });
    assert.equal(make().write(f.state, f.item, input, answer), original_text);
    assert.equal(make().read(f.state, f.item, input), original_text);
    for (const [field, value] of [['markdownOutput', 'notes-v1'], ['scanOcr', false], ['imageOcr', true]])
      code(() => make().read({ ...f.state, content_options: { ...defaults(), [field]: value } }, f.item, input), 'OCR_CONTACT_REVIEW_INVALID');
    const target = path.join(f.data, f.item.work_name.replace(/\.[a-z0-9]+$/u, '') + '.ocrreview');
    const record = JSON.parse(fs.readFileSync(target)); assert.equal(record.schema, 'datasecure-ocr-contact-correction/3');
    assert.deepEqual(record.binding.content_options, defaults());
    record.schema = 'datasecure-ocr-contact-correction/2'; fs.writeFileSync(target, JSON.stringify(record));
    code(() => make().read(f.state, f.item, input), 'OCR_CONTACT_REVIEW_INVALID');
  }
});

test('captured base binds the same options and cannot be downgraded or retagged after capture', () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const f = fixture(mode); f.review().captureRun(f.state);
    const value = { package_id: `${mode === 'markdown-only' ? 'dm' : 'ds'}_${f.item.id}`, original_text: 'same source', markdown: 'same output',
      content_options: defaults(), source_type: 'txt' };
    if (mode === 'markdown-and-anonymize') Object.assign(value, { verification_context: { profile: 'general' }, publication_binding: {
      schema: 'datasecure-anonymized-artifact-expectation/1', package_id: value.package_id, content_options: defaults(), source_type: 'txt',
      profile: 'general', document_sha256: crypto.createHash('sha256').update(value.markdown).digest('hex'), manifest_sha256: 'b'.repeat(64) } });
    f.review().capture(f.state, f.item, value);
    const target = path.join(f.data, 'document-reviews', f.state.token, f.item.id, 'base.json');
    const base = JSON.parse(fs.readFileSync(target));
    assert.equal(base.schema, 'datasecure-document-review/2'); assert.deepEqual(base.content_options, defaults());
    code(() => f.review().capture({ ...f.state, content_options: { ...defaults(), imageOcr: true } }, f.item, value), 'CONTENT_OPTIONS_BINDING_INVALID');
    const changed = { ...base, content_options: { ...defaults(), scanOcr: false } };
    fs.writeFileSync(target, JSON.stringify(changed));
    code(() => f.review().chunk(f.state.token, f.item.id, 0, 0), 'CONTENT_OPTIONS_BINDING_INVALID');
    delete changed.content_options; changed.schema = 'datasecure-document-review/1';
    fs.writeFileSync(target, JSON.stringify(changed));
    code(() => f.review().chunk(f.state.token, f.item.id, 0, 0), 'CONTENT_OPTIONS_BINDING_INVALID');
  }
});

done();
fs.rmSync(root, { recursive: true, force: true }); // only the mkdtemp-owned fixture tree
