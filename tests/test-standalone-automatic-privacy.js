'use strict';

// Real privacy engine, saved source, run anchor, prepared commit and package.
// The OCR converter is injected to exercise the exact coordinate contract;
// this is not evidence of native OCR recognition on Windows or macOS.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const scope = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-automatic-privacy-'));
for (const [variable, name] of [['EU_PRIVACY_DATA_ROOT', 'data'], ['EU_PRIVACY_ROOT', 'workspace'], ['EU_PRIVACY_RESULT_ROOT', 'results']]) {
  process.env[variable] = path.join(scope, name); fs.mkdirSync(process.env[variable]);
}
process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
const { createSuite } = require('./helpers');
const { test, testAsync, assert, done } = createSuite('Standalone conservative automatic privacy');
const kernel = require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { conservativelyReviewedBatchText, reviewSingleBatchTextLocally, reviewedBatchText } = require('../plugins/data-secure/server/gateway/batch-review-policy');
const { automaticallyRedactOcrContacts, checkedContentHooks, extractBoundContentInput } = require('../plugins/data-secure/server/gateway/bound-content-input');
const { makeRegistry } = require('../plugins/data-secure/server/privacy/entities');
const { replayTransformTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const batch = require('../plugins/data-secure/server/gateway/batch');
const { createPrivateWorkStore } = require('../plugins/data-secure/server/gateway/private-work-store');
const { copySnapshotFile, exactPendingEntry } = require('../plugins/data-secure/server/gateway/batch-snapshot');
const { createBatchPseudonymState, withBatchPseudonymRegistry } = require('../plugins/data-secure/server/batch-pseudonym-context');
const { createPrivateIoSummary } = require('../plugins/data-secure/server/gateway/performance');
const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const { createContentOperationAuthority } = require('../plugins/data-secure/server/gateway/content-operation-authority');
const { createBatchActiveLock } = require('../plugins/data-secure/server/gateway/batch-active-lock');
const options = Object.freeze({ schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: true });
const prepare = (text, extra = {}) => kernel.prepareTextPrivacyReview({ text, profile: 'general', productChannel: 'standalone',
  consumerOptions: { productChannel: 'standalone', contentOptions: options }, registry: makeRegistry(), captureTrace: true, ...extra });
const finalize = async (operation, reviewPolicy = 'automatic-conservative', reviewText) => kernel.finalizeTextPrivacyReview(operation,
  await kernel.resolveTextPrivacyReview(operation, reviewText, { reviewPolicy }), { prefix: '', suffix: '' });
const code = expected => error => error.code === expected;

function fixture(kind = 'publication', extension = 'txt', text = 'CAPGEMINI INVENT\nName: Anna Beispiel\nE-Mail: anna@example.invalid\n') {
  const token = crypto.randomBytes(32).toString('hex'), id = crypto.randomBytes(16).toString('hex'), bytes = Buffer.from(text);
  const source = path.join(scope, `source-${id}.${extension}`); fs.writeFileSync(source, bytes);
  const item = { id, name: `synthetic-source.${extension}`, size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    work_name: `001_${crypto.randomBytes(12).toString('hex')}.${extension}`, private_artifact_plain: true,
    status: kind === 'capture' ? 'deferred_review' : 'processing',
    checkpoint: kind === 'capture' ? 'awaiting_local_review' : 'processing_started' };
  const state = { schema: 'datasecure-batch/7', token, product_channel: 'standalone', processing_mode: 'markdown-and-anonymize',
    standalone_document_review: true, standalone_review_policy: 'automatic-conservative', content_options: options,
    profile: 'general', remove_images: false, output_naming_mode: 'neutral', created_at: new Date().toISOString(),
    expires_at: '2099-01-01T00:00:00.000Z', io_summary: createPrivateIoSummary(),
    ...createBatchPseudonymState({ productChannel: 'standalone' }), items: [item] };
  const work = batch._test.workPath(token); fs.mkdirSync(work, { mode: 0o700 });
  const store = createPrivateWorkStore({ privateRoot: batch._test.batchRoot() });
  copySnapshotFile(source, path.join(work, item.work_name), fs.statSync(source), { privateWorkStore: store, expectedSha256: item.sha256 });
  batch._test.writeState(state); const review = createDocumentReviewStore(); review.captureRun(state);
  const lock = createBatchActiveLock({ lockPath: () => path.join(work, 'test-owner.lock') }); lock.acquireActiveLock(token);
  const authority = createContentOperationAuthority({ active: new Set([token]), readStateForMaintenance: batch._test.readStateForMaintenance,
    writeState: batch._test.writeState, captureOwnedEpoch: lock.captureOwnedEpoch, assertOwnedEpoch: lock.assertOwnedEpoch, documentReview: review,
    exactPendingEntry: (saved, member) => exactPendingEntry(saved, member, { privateWorkStore: store, workPath: () => work }) });
  const context = authority.consume(authority.issue(token, id, kind));
  return { state, item, source, bytes, review, context, release() { context.dispose(); lock.releaseActiveLock(token); } };
}

test('automatic OCR masks complete validated corridors without correcting or approving their spelling', () => {
  const original = 'E-Mail: anna (at) private.invalid\nTelefon: +49 30 5551002';
  const email = original.indexOf('anna'), phone = original.indexOf('+49');
  const masked = automaticallyRedactOcrContacts({ original_text: original, source_type: 'png', contacts: [
    { start: email, end: original.indexOf('\n'), page: 1, line: 1, kind: 'email' },
    { start: phone, end: original.length, page: 1, line: 2, kind: 'phone' }
  ] });
  assert.equal(masked.text, 'E-Mail: [EMAIL_REDACTED]\nTelefon: [PHONE_REDACTED]');
  assert.equal(masked.source_redaction.original_text, original);
  assert.ok(Object.isFrozen(masked.source_redaction.edits));
  for (const contacts of [[{ start: email, end: original.length + 1, page: 1, line: 1, kind: 'email' }],
    [{ start: email, end: original.length, page: 1, line: 1, kind: 'email' }],
    [{ start: email, end: email + 5, page: 1, line: 1, kind: 'email' }, { start: email + 2, end: email + 8, page: 1, line: 1, kind: 'email' }]])
    assert.throws(() => automaticallyRedactOcrContacts({ original_text: original, source_type: 'png', contacts }), code('OCR_CONTACT_REVIEW_INVALID'));
});

test('repeated literal OCR contacts retain exact ordered corridors and marker collisions fail closed', () => {
  const quote = String.fromCharCode(96), value = 'same@example.invalid';
  const original = `E-Mail: ${quote}${value}${quote}\nE-Mail: ${quote}${value}${quote}`;
  const first = original.indexOf(value), second = original.indexOf(value, first + value.length);
  const contacts = [first, second].map((start, index) => ({ start, end: start + value.length, page: 1, line: index + 1, kind: 'email' }));
  const masked = automaticallyRedactOcrContacts({ original_text: original, source_type: 'png', contacts });
  assert.equal(masked.text, 'E-Mail: [EMAIL_REDACTED]\nE-Mail: [EMAIL_REDACTED]');
  assert.equal(masked.source_redaction.edits.length, 2);
  assert.notEqual(masked.source_redaction.edits[1].start, second, 'canonical source offsets account for removed literal wrappers');
  assert.throws(() => automaticallyRedactOcrContacts({ original_text: `${original}\nDataSecureOcrBoundary900000End`,
    source_type: 'png', contacts }), code('OCR_CONTACT_REVIEW_INVALID'));
});

async function main() {
  if (process.argv.includes('--real-ocr')) await testAsync('actual packaged OCR outputs publish through the saved automatic source context', async () => {
    const { writeStandaloneRuntime } = await import('../scripts/lib/standalone-runtime-projection.mjs');
    const { writeConversionRuntime } = await import('../scripts/lib/standalone-conversion-runtime.mjs');
    const { packagedOcrFixtures } = await import('./helpers/standalone-packaged-ocr-review.mjs');
    const repo = path.resolve(__dirname, '..'), packagedServer = path.join(scope, 'packaged-server');
    const target = process.platform === 'win32' ? `windows-${process.arch}` : process.platform === 'darwin' ? `macos-${process.arch}` : 'linux-x64-glibc';
    writeStandaloneRuntime(path.join(repo, 'plugins/data-secure/server'), packagedServer, target);
    writeConversionRuntime(repo, path.join(packagedServer, 'standalone/conversion-runtime'), target);
    const actualConverter = require(path.join(packagedServer, 'standalone/conversion-worker'));
    for (const [name, bytes] of packagedOcrFixtures()) {
      const f = fixture('publication', 'png', bytes);
      try {
        await withBatchPseudonymRegistry(batch._test.readStateForMaintenance(f.state.token), registry =>
          require('../plugins/data-secure/server/gateway/content-publication-operation').publishPersistedContent(f.context, {
            pseudonymRegistry: registry, convertBuffer: actualConverter.convertBuffer,
            reviewText() { throw Error('real OCR must not invoke human review'); },
            afterPublish() { f.review.recordPublication(f.state.token, f.item.id); }
          }));
        const base = JSON.parse(fs.readFileSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', f.state.token, f.item.id, 'base.json')));
        assert.equal(replayTransformTrace(base.transform_trace), base.markdown);
        assert.doesNotMatch(base.markdown, /Mustermann|@|987654321/u, name);
        assert.match(base.original_text, /Mustermann/u, name);
        assert.equal(base.transform_trace.steps[0].phase, 'automatic-ocr-redaction');
        const row = f.review.list(f.state.token).documents[0];
        assert.equal(row.approved, true); assert.equal(row.approval_basis, 'automatic');
        assert.deepEqual(fs.readFileSync(f.source), bytes);
      } finally { f.release(); }
    }
  });
  await testAsync('automatic review uses exact existing ambiguities and records no human confirmation', async () => {
    const operation = prepare('CAPGEMINI INVENT\nName: Anna Beispiel\nService Level\n');
    assert.ok(operation.ambiguities.length);
    let humanCalls = 0;
    const final = await finalize(operation, 'automatic-conservative', () => { humanCalls++; throw Error('must not ask user'); });
    assert.equal(humanCalls, 0); assert.doesNotMatch(final.markdown, /CAPGEMINI INVENT|Anna Beispiel|Service Level/u);
    assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
    assert.ok(final.transform_trace.steps.some(step => step.phase === 'automatic-review'));
    assert.ok(final.transform_trace.steps.every(step => step.phase !== 'human-review'));
  });
  await testAsync('guided review still defers and keeps explicit human trace provenance', async () => {
    const state = { schema: 'datasecure-batch/7', product_channel: 'standalone', items: [{}] };
    await assert.rejects(reviewSingleBatchTextLocally(prepare('CAPGEMINI INVENT').draft, state, state.items[0]), code('LOCAL_REVIEW_DEFERRED'));
    const operation = prepare('CAPGEMINI INVENT');
    const final = await finalize(operation, 'manual', draft => reviewedBatchText(draft,
      draft.ambiguities.map(candidate => ({ ambiguity_id: candidate.ambiguity_id, decision: 'keep' }))));
    assert.match(final.markdown, /CAPGEMINI INVENT/u);
    assert.ok(final.transform_trace.steps.some(step => step.phase === 'human-review'));
    assert.ok(final.transform_trace.steps.every(step => step.phase !== 'automatic-review'));
  });
  await testAsync('the saved automatic batch policy resolves ambiguity before the Standalone defer branch', async () => {
    const operation = prepare('CAPGEMINI INVENT');
    const state = { schema: 'datasecure-batch/7', product_channel: 'standalone', processing_mode: 'markdown-and-anonymize',
      standalone_document_review: true, standalone_review_policy: 'automatic-conservative', content_options: options, items: [{}] };
    const text = await kernel.resolveTextPrivacyReview(operation, input => reviewSingleBatchTextLocally(input, state, state.items[0], {
      reviewTextLocally() { throw Error('must not open native review'); }
    }));
    const final = kernel.finalizeTextPrivacyReview(operation, text, { prefix: '', suffix: '' });
    assert.doesNotMatch(final.markdown, /CAPGEMINI INVENT/u);
    assert.ok(final.transform_trace.steps.some(step => step.phase === 'automatic-review'));
  });
  await testAsync('OCR source and actual edits remain replayable through the final privacy gate', async () => {
    const original = 'Name: Anna Beispiel\r\nE-Mail: anna (at) private.invalid\r\nTelefon: +49 30 5551002';
    const start = original.indexOf('anna (at)'), phone = original.indexOf('+49');
    const masked = automaticallyRedactOcrContacts({ original_text: original, source_type: 'png', contacts: [
      { start, end: original.indexOf('\r', start), page: 1, line: 2, kind: 'email' },
      { start: phone, end: original.length, page: 1, line: 3, kind: 'phone' }
    ] });
    const final = await finalize(prepare(masked.text, { sourceRedaction: masked.source_redaction }));
    assert.equal(final.original_text, original); assert.equal(final.transform_trace.canonical_input, original);
    assert.equal(final.transform_trace.steps[0].phase, 'automatic-ocr-redaction');
    assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
    assert.doesNotMatch(final.markdown, /Anna Beispiel|private.invalid|5551002/u);
    assert.throws(() => prepare(masked.text + 'changed', { sourceRedaction: masked.source_redaction }));
  });
  await testAsync('automatic review cannot invent a missing bound person replacement or waive the terminal gate', async () => {
    const operation = prepare('CAPGEMINI INVENT');
    const draft = { ...operation.draft }; delete draft.replacementForAmbiguity;
    assert.throws(() => conservativelyReviewedBatchText(draft), code('LOCAL_REVIEW_CANCELLED'));
    const final = await finalize(operation);
    assert.throws(() => kernel.finalizeTextPrivacyReview(operation, final.markdown + '\nsecret@example.invalid', { prefix: '', suffix: '' }));
    await assert.rejects(finalize(prepare('Text'), 'made-up-policy'));
  });
  await testAsync('persisted automatic context publishes, keeps original source and never invokes a human reviewer', async () => {
    const f = fixture();
    try {
      assert.equal(f.context.review_policy, 'automatic-conservative');
      const result = await withBatchPseudonymRegistry(batch._test.readStateForMaintenance(f.state.token), registry =>
        require('../plugins/data-secure/server/gateway/content-publication-operation').publishPersistedContent(f.context, {
          pseudonymRegistry: registry, reviewText() { throw Error('automatic context reached manual reviewer'); },
          async convertBuffer(bytes, extension, settings) {
            const raw = require('../plugins/data-secure/server/standalone/markdown-extractor').extractMarkdownBuffer(bytes, extension,
              { markdownOutput: settings.contentOptions.markdownOutput });
            return require('../plugins/data-secure/server/standalone/markdown-contract').createMarkdownExtraction({
              source_type: raw.source_type, markdown: raw.markdown, coverage: raw.coverage, content_options: settings.contentOptions });
          },
          afterPublish() { f.review.recordPublication(f.state.token, f.item.id); }
        }));
      assert.equal(result.ok, true);
      const base = JSON.parse(fs.readFileSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', f.state.token, f.item.id, 'base.json')));
      assert.doesNotMatch(base.markdown, /CAPGEMINI INVENT|Anna Beispiel|anna@example.invalid/u);
      assert.equal(replayTransformTrace(base.transform_trace), base.markdown);
      assert.equal(base.review_policy, 'automatic-conservative');
      const rows = f.review.list(f.state.token).documents;
      assert.equal(rows[0].approved, true); assert.equal(rows[0].approval_basis, 'automatic');
      assert.deepEqual(fs.readFileSync(f.source), f.bytes);
      assert.deepEqual(fs.readdirSync(process.env.EU_PRIVACY_RESULT_ROOT), [], 'privacy publication never exports a public copy');
    } finally { f.release(); }
  });
  await testAsync('a real failed content extraction records its fixed boundary without leaking the exception payload', async () => {
    const f = fixture();
    try {
      await assert.rejects(withBatchPseudonymRegistry(batch._test.readStateForMaintenance(f.state.token), registry =>
        require('../plugins/data-secure/server/gateway/content-publication-operation').publishPersistedContent(f.context, {
          pseudonymRegistry: registry, convertBuffer() { throw Error('PRIVATE_CONTENT_AND_PATH_SENTINEL'); }
        })));
      const events = require('../plugins/data-secure/server/gateway/workflow-diagnostics')._test.readWorkflowEvents();
      assert.ok(events.some(row => row.event === 'content_operation_failed' && row.phase === 'content_extract' &&
        row.outcome === 'stopped' && row.error_code === 'INTERNAL_FAILURE'));
      assert.doesNotMatch(JSON.stringify(events), /PRIVATE_CONTENT_AND_PATH_SENTINEL|anna@example/u);
      assert.equal(f.review.list(f.state.token).documents.length, 0);
    } finally { f.release(); }
  });
  await testAsync('bound automatic OCR bypasses review-store hooks and retains only genuine coverage limitations', async () => {
    const f = fixture('capture', 'png', 'opaque synthetic bitmap fixture');
    try {
      const original = 'E-Mail: anna (at) private.invalid\nSachlicher Inhalt.';
      await withBatchPseudonymRegistry(batch._test.readStateForMaintenance(f.state.token), async registry => {
        const result = await extractBoundContentInput(f.context, checkedContentHooks({ pseudonymRegistry: registry, captureOcrInput: true,
          onOcrSourceCaptured() { throw Error('automatic mode must not create a review draft'); },
          prepareOcrContacts() { throw Error('automatic mode must not read or create contact answers'); },
          async convertBuffer() { return require('../plugins/data-secure/server/standalone/markdown-contract').createMarkdownExtraction({
            source_type: 'png', content_options: options, markdown: original,
            coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED', 'OCR_NOT_VERIFIED'] },
            ocr_contacts: [{ start: original.indexOf('anna'), end: original.indexOf('\n'), page: 1, line: 1, kind: 'email' }]
          }); }
        }, 'capture'));
        assert.equal(result.kind, 'source'); assert.equal(result.source_redaction.original_text, original);
        assert.equal(result.extraction.markdown, 'E-Mail: [EMAIL_REDACTED]\nSachlicher Inhalt.');
        assert.deepEqual(result.extraction.coverage, { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED'] });
      });
      assert.deepEqual(fs.readFileSync(f.source), f.bytes);
    } finally { f.release(); }
  });
  await testAsync('automatic OCR publication preserves raw provenance and receives only a verified automatic approval', async () => {
    const f = fixture('publication', 'png', 'opaque synthetic bitmap fixture');
    const quote = String.fromCharCode(96);
    const original = `Name: Anna Beispiel\nE-Mail: ${quote}anna (at) private.invalid${quote}\nTelefon: ${quote}+49 (040) 987654321${quote}\nSachlicher Inhalt.`;
    try {
      await withBatchPseudonymRegistry(batch._test.readStateForMaintenance(f.state.token), registry =>
        require('../plugins/data-secure/server/gateway/content-publication-operation').publishPersistedContent(f.context, {
          pseudonymRegistry: registry, prepareOcrContacts() { throw Error('no contact confirmation'); },
          reviewText() { throw Error('no human decision'); },
          async convertBuffer() { return require('../plugins/data-secure/server/standalone/markdown-contract').createMarkdownExtraction({
            source_type: 'png', content_options: options, markdown: original,
            coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED', 'OCR_NOT_VERIFIED'] },
            ocr_contacts: [{ start: original.indexOf('anna (at)'), end: original.indexOf(quote, original.indexOf('anna (at)')),
              page: 1, line: 2, kind: 'email' }, { start: original.indexOf('+49'), end: original.indexOf(quote, original.indexOf('+49')),
              page: 1, line: 3, kind: 'phone' }]
          }); },
          afterPublish() { f.review.recordPublication(f.state.token, f.item.id); }
        }));
      const base = JSON.parse(fs.readFileSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', f.state.token, f.item.id, 'base.json')));
      assert.equal(base.original_text, original);
      assert.equal(base.transform_trace.canonical_input, require('../plugins/data-secure/server/privacy/base')
        .canonicalizeRenderedText(original, require('../plugins/data-secure/server/core/person-field-policy').CONTENT_PERSON_FIELD_POLICY));
      assert.equal(base.transform_trace.steps[0].phase, 'automatic-ocr-redaction');
      assert.equal(replayTransformTrace(base.transform_trace), base.markdown);
      assert.doesNotMatch(base.markdown, /Anna Beispiel|anna \(at\)|private.invalid|987654321/u);
      assert.match(base.markdown, /\[EMAIL_REDACTED\]/u); assert.match(base.markdown, /\[PHONE_REDACTED\]/u);
      const row = f.review.list(f.state.token).documents[0];
      assert.equal(row.approved, true); assert.equal(row.approval_basis, 'automatic');
      assert.deepEqual(fs.readFileSync(f.source), f.bytes);
      assert.deepEqual(fs.readdirSync(process.env.EU_PRIVACY_RESULT_ROOT), []);
    } finally { f.release(); }
  });
  await done();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
