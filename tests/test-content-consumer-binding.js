'use strict';

// Real private artifact/capture files. Converter injection exercises consumer
// trust boundaries; it is not evidence of OCR/native GUI execution.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { test, testAsync, assert, done } = createSuite('Stored content consumer binding');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-content-consumer-'));
const data = path.join(root, 'data'); fs.mkdirSync(data);
process.env.EU_PRIVACY_DATA_ROOT = data; process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(root, 'visible'); fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT);
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { createMarkdownArtifact, validateMarkdownArtifactForOptions } = require('../plugins/data-secure/server/standalone/markdown-artifact');
const { publishMarkdownArtifact, readMarkdownArtifact, verifyMarkdownItem } = require('../plugins/data-secure/server/standalone/markdown-store');
const { convertNext } = require('../plugins/data-secure/server/standalone/convert-next');
const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const { bindContentDependencies } = require('../plugins/data-secure/server/gateway/content-consumer-dependencies');
const { createBatchContactReview } = require('../plugins/data-secure/server/gateway/batch-contact-review');
const { createBatchReconciliation } = require('../plugins/data-secure/server/gateway/batch-reconciliation');
const exportsAdapter = require('../plugins/data-secure/server/gateway/result-export');
const content = (overrides = {}) => ({ schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false, ...overrides });
const privateMetadata = () => ({ schema: 'datasecure-private-document-metadata/1', source_type: 'pdf', entries: [{ key: 'Author', value: 'PRIVATE_METADATA_SENTINEL_7BC29' }] });
const extraction = (options = content(), extra = {}) => createMarkdownExtraction({ source_type: 'pdf', markdown: 'Visible Anna Beispiel Ä €',
  coverage: { status: 'complete', reason_codes: [] }, ...(options ? { content_options: options } : {}), ...extra });
let serial = 0;
const id = () => `dm_${(++serial).toString(16).padStart(32, '0')}`;
const failure = code => error => error.code === code;
function entry() {
  const bytes = Buffer.from('synthetic source');
  return { name: 'Quelle.pdf', private_bytes: bytes, expected_sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
function fixture(mode = 'markdown-only') {
  const artifactId = id(), documentId = artifactId.slice(3), token = (++serial).toString(16).padStart(64, '0');
  const item = { id: documentId, name: 'Quelle.pdf', source_label: 'Ordner/Quelle.pdf', sha256: 'b'.repeat(64), status: 'pending' };
  const state = { schema: 'datasecure-batch/7', token, product_channel: 'standalone', processing_mode: mode,
    standalone_document_review: true, content_options: content(), items: [item] };
  const results = path.join(root, `results-${serial}`); fs.mkdirSync(results);
  const create = () => createDocumentReviewStore({ dataRoot: data, resultRoot: () => results });
  const value = { package_id: `${mode === 'markdown-only' ? 'dm' : 'ds'}_${documentId}`, original_text: 'Visible Anna Beispiel Ä €',
    markdown: 'Visible Anna Beispiel Ä €', source_type: 'pdf', content_options: content(), private_document_metadata: privateMetadata() };
  // This case checks capture binding only, not release. No artifact exists.
  if (mode === 'markdown-and-anonymize') Object.assign(value, { verification_context: { profile: 'general' }, publication_binding: {
    schema: 'datasecure-anonymized-artifact-expectation/1', package_id: value.package_id, content_options: content(), source_type: 'pdf',
    profile: 'general', document_sha256: crypto.createHash('sha256').update(value.markdown).digest('hex'), manifest_sha256: 'c'.repeat(64) } });
  return { artifactId, documentId, token, item, state, create, value, results,
    base: path.join(data, 'document-reviews', token, documentId, 'base.json') };
}

test('stored options override runtime aliases without evaluating their getters; legacy retains no overrides', () => {
  const f = fixture(); let invoked = 0;
  const deps = { service() {}, scanOcr: false, imageOcr: true, markdownOutput: 'notes-v1', content_options: content({ imageOcr: true }) };
  Object.defineProperty(deps, 'contentOptions', { enumerable: true, get() { invoked++; throw new Error('must not execute'); } });
  const bound = bindContentDependencies(f.state, deps);
  assert.deepEqual(bound.contentOptions, content()); assert.equal(invoked, 0); assert.equal(bound.service, deps.service);
  for (const field of ['content_options', 'scanOcr', 'imageOcr', 'markdownOutput']) assert.equal(Object.hasOwn(bound, field), false);
  const legacy = { ...f.state, schema: 'datasecure-batch/5' }; delete legacy.content_options;
  assert.equal(Object.hasOwn(bindContentDependencies(legacy, deps), 'contentOptions'), false); assert.equal(invoked, 0);
});

testAsync('both contact reconstruction routes bind every runtime option before their first claim', async () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) for (const legacy of [false, true])
    for (const field of ['contentOptions', 'content_options', 'markdownOutput', 'scanOcr', 'imageOcr']) {
      const f = fixture(mode), state = legacy ? { ...f.state, schema: mode === 'markdown-only' ? 'datasecure-batch/5' : 'datasecure-batch/6' } : f.state;
      if (legacy) delete state.content_options;
      let getterCalls = 0, converterCalls = 0, claims = 0;
      const check = dependencies => {
        converterCalls++;
        if (legacy) assert.equal(Object.hasOwn(dependencies, 'contentOptions'), false);
        else assert.deepEqual(dependencies.contentOptions, content());
        for (const alias of ['content_options', 'markdownOutput', 'scanOcr', 'imageOcr']) assert.equal(Object.hasOwn(dependencies, alias), false);
      };
      const review = createBatchContactReview({ exactPendingEntry: () => ({}), contactStore: { read: () => null },
        convertNext: async (_profile, deps) => { check(deps); return null; },
        captureDeferredReviewInput: async (_state, _item, deps) => { check(deps); return { ocr_contact_input: null }; },
        claimStandaloneDocument(_state, action) { claims++; action(); return true; } });
      const deps = {}; Object.defineProperty(deps, field, { enumerable: true, get() { getterCalls++; throw new Error('option getter'); } });
      await review(state, [f.item], deps); assert.equal(getterCalls, 0); assert.equal(converterCalls, 1); assert.ok(claims > 0);
      await assert.rejects(review({ ...f.state, content_options: null }, [f.item], deps), failure('CONTENT_OPTIONS_INVALID'));
      assert.equal(getterCalls, 0); assert.equal(converterCalls, 1, 'invalid stored options stop before a new claim/capture');
    }
});

test('artifact v2 requires the caller contract and excludes private container metadata', () => {
  const source = extraction(content(), { private_document_metadata: privateMetadata() }), artifact = createMarkdownArtifact(source, id(), content());
  assert.equal(artifact.manifest.schema, 'datasecure-markdown-artifact/2');
  assert.deepEqual(artifact.manifest.content_options, content());
  assert.ok(!JSON.stringify(artifact).includes('PRIVATE_METADATA_SENTINEL'));
  assert.equal(validateMarkdownArtifactForOptions(artifact.manifest, artifact.markdown, content()), artifact.manifest);
  assert.throws(() => createMarkdownArtifact(source, id()), failure('MARKDOWN_EXTRACTION_INVALID'));
  for (const changed of [content({ markdownOutput: 'notes-v1' }), content({ scanOcr: false }), content({ imageOcr: true })])
    assert.throws(() => validateMarkdownArtifactForOptions(artifact.manifest, artifact.markdown, changed), failure('MARKDOWN_ARTIFACT_INVALID'));
  assert.throws(() => validateMarkdownArtifactForOptions(artifact.manifest, artifact.markdown), failure('MARKDOWN_ARTIFACT_INVALID'));
  assert.throws(() => validateMarkdownArtifactForOptions({ ...artifact.manifest, private_document_metadata: privateMetadata() }, artifact.markdown, content()), failure('MARKDOWN_ARTIFACT_INVALID'));
});

test('manifest schema accessors and proxies fail before executing caller code', () => {
  const artifact = createMarkdownArtifact(extraction(), id(), content()); let reads = 0;
  for (const getter of [() => { reads++; return 'datasecure-markdown-artifact/2'; }, () => { reads++; throw new Error('unbounded caller error'); }]) {
    const manifest = { ...artifact.manifest }; Object.defineProperty(manifest, 'schema', { enumerable: true, get: getter });
    assert.throws(() => validateMarkdownArtifactForOptions(manifest, artifact.markdown, content()), failure('MARKDOWN_ARTIFACT_INVALID'));
  }
  const proxy = new Proxy(artifact.manifest, { get() { reads++; throw new Error('get trap'); },
    ownKeys() { reads++; throw new Error('keys trap'); }, getPrototypeOf() { reads++; throw new Error('prototype trap'); },
    getOwnPropertyDescriptor() { reads++; throw new Error('descriptor trap'); } });
  assert.throws(() => validateMarkdownArtifactForOptions(proxy, artifact.markdown, content()), failure('MARKDOWN_ARTIFACT_INVALID'));
  assert.equal(reads, 0);
});

testAsync('published artifact restart/lost-ACK verification binds options, not only identical bytes', async () => {
  const artifactId = id(); let published;
  await assert.rejects(publishMarkdownArtifact(extraction(), artifactId, { contentOptions: content(), afterPublish(value) { published = value; throw new Error('lost ACK'); } }), failure('BATCH_PUBLICATION_UNCONFIRMED'));
  assert.equal(verifyMarkdownItem(published, content()), true);
  assert.equal(readMarkdownArtifact(artifactId, content()).manifest.schema, 'datasecure-markdown-artifact/2');
  assert.equal(verifyMarkdownItem(published), false);
  for (const changed of [content({ markdownOutput: 'notes-v1' }), content({ scanOcr: false }), content({ imageOcr: true })]) {
    assert.equal(verifyMarkdownItem(published, changed), false);
    assert.throws(() => readMarkdownArtifact(artifactId, changed), failure('MARKDOWN_ARTIFACT_INVALID'));
  }
  assert.ok(!JSON.stringify(published).includes('private_document_metadata'));
});

testAsync('raw conversion checks schema/echo/type before any contact or document capture', async () => {
  for (const bad of [extraction(null), extraction(content({ imageOcr: true })), extraction(content(), { source_type: 'txt' })]) {
    let captures = 0;
    await assert.rejects(convertNext('auto', { inputQueue: [entry()], contentOptions: content(), artifactId: id(),
      convertBuffer: async () => bad, captureOcrInput() { captures++; }, persistStandaloneDocumentReview() { captures++; } }), failure('MARKDOWN_EXTRACTION_INVALID'));
    assert.equal(captures, 0);
  }
  await assert.rejects(convertNext('auto', { inputQueue: [entry()], artifactId: id(), convertBuffer: async () => extraction() }), failure('MARKDOWN_EXTRACTION_INVALID'));
});

testAsync('raw OCR correction keeps v2/options/private metadata and only notes profile adds the owned notice', async () => {
  for (const markdownOutput of ['content-v1', 'notes-v1']) {
    const options = content({ markdownOutput }), artifactId = id(); let captured, forwarded;
    const text = 'E-Mail: wrong@example.invalid';
    const source = extraction(options, { markdown: text, private_document_metadata: privateMetadata(),
      coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED', 'OCR_NOT_VERIFIED'] },
      ocr_contacts: [{ start: 8, end: text.length, page: 1, line: 1, kind: 'email' }] });
    await convertNext('auto', { inputQueue: [entry()], contentOptions: options, artifactId, ocrContactReview: true,
      convertBuffer: async (_bytes, _ext, opts) => { forwarded = opts.contentOptions; return source; },
      prepareOcrContacts: async () => 'E-Mail: correct@example.invalid', persistStandaloneDocumentReview(value) { captured = value; } });
    assert.deepEqual(forwarded, options); assert.deepEqual(captured.content_options, options);
    assert.deepEqual(captured.private_document_metadata, privateMetadata());
    assert.equal(captured.source_type, 'pdf'); assert.equal(captured.original_text, text);
    const artifact = readMarkdownArtifact(artifactId, options);
    assert.equal(artifact.markdown.includes('OCR-Kontaktwerte'), markdownOutput === 'notes-v1');
    assert.ok(!JSON.stringify(artifact).includes('PRIVATE_METADATA_SENTINEL'));
    assert.deepEqual(artifact.manifest.reason_codes, ['OCR_NOT_VERIFIED']);
  }
});

testAsync('confirmation resolves a contact-only incomplete extraction without inventing other uncertainty', async () => {
  const options = content({ imageOcr: true }), artifactId = id(), text = 'E-Mail: qa@example.invalid';
  const source = extraction(options, { markdown: text,
    coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED'] },
    ocr_contacts: [{ start: 8, end: text.length, page: 1, line: 1, kind: 'email' }] });
  await convertNext('auto', { inputQueue: [entry()], contentOptions: options, artifactId, ocrContactReview: true,
    convertBuffer: async () => source, prepareOcrContacts: async () => text });
  const artifact = readMarkdownArtifact(artifactId, options);
  assert.equal(artifact.markdown, text);
  assert.deepEqual(artifact.manifest.reason_codes, []);
  assert.equal(artifact.manifest.extraction_grade, 'complete');
});

testAsync('explicitly skipped unanswered contacts retain original text and warnings, never a confirmation notice', async () => {
  for (const markdownOutput of ['content-v1', 'notes-v1']) {
    const options = content({ markdownOutput }), artifactId = id(), text = 'E-Mail: unchecked@example.invalid';
    const source = extraction(options, { markdown: text,
      coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED', 'OCR_NOT_VERIFIED'] },
      ocr_contacts: [{ start: 8, end: text.length, page: 1, line: 1, kind: 'email' }] });
    await convertNext('auto', { inputQueue: [entry()], contentOptions: options, artifactId,
      ocrContactReview: true, ocrContactReviewSkipped: true,
      convertBuffer: async () => source, prepareOcrContacts: async () => null });
    const artifact = readMarkdownArtifact(artifactId, options);
    assert.equal(artifact.markdown, text);
    assert.deepEqual(artifact.manifest.reason_codes, ['OCR_CONTACT_VALUES_UNVERIFIED', 'OCR_NOT_VERIFIED']);
    assert.equal(artifact.manifest.extraction_grade, 'incomplete');
  }
  const options = content(), artifactId = id(), text = 'E-Mail: unchecked@example.invalid';
  await assert.rejects(convertNext('auto', { inputQueue: [entry()], contentOptions: options, artifactId,
    ocrContactReview: true, convertBuffer: async () => extraction(options, { markdown: text,
      coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED', 'OCR_NOT_VERIFIED'] },
      ocr_contacts: [{ start: 8, end: text.length, page: 1, line: 1, kind: 'email' }] }),
    prepareOcrContacts: async () => null }), failure('MARKDOWN_EXTRACTION_INVALID'));
});

test('private base capture requires a matching converter echo for both purposes', () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const f = fixture(mode); f.create().captureRun(f.state);
    for (const update of [{ content_options: undefined }, { content_options: null }, { content_options: content({ scanOcr: false }) }, { source_type: 'txt' }]) {
      assert.throws(() => f.create().capture(f.state, f.item, { ...f.value, ...update }));
      assert.equal(fs.existsSync(f.base), false);
    }
    f.create().capture(f.state, f.item, f.value);
    const base = JSON.parse(fs.readFileSync(f.base));
    assert.deepEqual(base.content_options, content()); assert.deepEqual(base.private_document_metadata, privateMetadata());
    assert.equal(base.source_type, 'pdf');
  }
});

testAsync('private metadata survives publication and fresh-store read without leaking through list/chunk', async () => {
  const f = fixture(); f.create().captureRun(f.state); f.create().capture(f.state, f.item, f.value);
  await publishMarkdownArtifact(extraction(content(), { private_document_metadata: privateMetadata() }), f.artifactId, { contentOptions: content() });
  f.create().recordPublication(f.token, f.documentId);
  const reopened = f.create();
  assert.ok(!JSON.stringify(reopened.list(f.token)).includes('PRIVATE_METADATA_SENTINEL'));
  assert.ok(!JSON.stringify(reopened.chunk(f.token, f.documentId, 0, 0)).includes('PRIVATE_METADATA_SENTINEL'));
  assert.equal(JSON.parse(fs.readFileSync(f.base)).private_document_metadata.entries[0].value, privateMetadata().entries[0].value);
  const base = JSON.parse(fs.readFileSync(f.base)); base.private_document_metadata.extra = 'unbound'; fs.writeFileSync(f.base, JSON.stringify(base));
  assert.throws(() => reopened.chunk(f.token, f.documentId, 0, 0));
});

test('document snapshot rejects unclosed new metadata and legacy option adoption', () => {
  const f = fixture();
  for (const value of [{ ...f.value, extra: 'hidden' }, { ...f.value, private_document_metadata: null },
    { ...f.value, private_document_metadata: { ...privateMetadata(), source_type: 'docx' } }]) assert.throws(() => f.create().capture(f.state, f.item, value));
  const legacy = { ...f.state, schema: 'datasecure-batch/5' }; delete legacy.content_options;
  assert.throws(() => f.create().capture(legacy, f.item, f.value));
});

testAsync('final correction/export binds the options, keeps the original name and exact approved bytes', async () => {
  const f = fixture(); f.create().captureRun(f.state); f.create().capture(f.state, f.item, f.value);
  await publishMarkdownArtifact(extraction(), f.artifactId, { contentOptions: content() });
  f.create().recordPublication(f.token, f.documentId);
  const store = f.create(), decision = action => {
    const row = store.list(f.token).documents[0];
    return store.decide(f.token, f.documentId, { ...action, revision: row.revision, output_sha256: row.output_sha256, operation_id: crypto.randomBytes(16).toString('hex') });
  };
  decision({ action: 'approve', ranges: [] });
  const row = store.list(f.token).documents[0], selection = [{ document_id: row.document_id, revision: row.revision, output_sha256: row.output_sha256 }];
  const operation = crypto.randomBytes(16).toString('hex');
  const result = store.exportApproved(f.token, operation, selection);
  const file = path.join(f.results, 'DataSecure-Markdown-Korrektur', result.folder_name, 'Quelle.md');
  assert.equal(fs.readFileSync(file, 'utf8'), f.value.markdown);
  const opFile = path.join(data, 'document-reviews', f.token, `export-${operation}.json`), saved = JSON.parse(fs.readFileSync(opFile));
  assert.equal(saved.schema, 'datasecure-document-export/7'); assert.match(saved.content_options_sha256, /^[a-f0-9]{64}$/u);
  assert.ok(!JSON.stringify(saved).includes('PRIVATE_METADATA_SENTINEL'));
  assert.equal(store.exportApproved(f.token, operation, selection).folder_name, result.folder_name, 'lost ACK is reconciled, not copied twice');
  for (const update of [{ content_options_sha256: '0'.repeat(64) }, { schema: 'datasecure-document-export/6' }, { private_document_metadata: privateMetadata() }]) {
    fs.writeFileSync(opFile, JSON.stringify({ ...saved, ...update }));
    assert.throws(() => f.create().exportApproved(f.token, operation, selection), failure('AI_EXPORT_INVALID'));
  }
  fs.writeFileSync(opFile, JSON.stringify(saved));
  decision({ action: 'revoke', ranges: [] });
  assert.equal(store.list(f.token).documents[0].approved, false);
  assert.equal(store.exportApproved(f.token, operation, selection).folder_name, result.folder_name, 'historical copy is not current approval');
});

testAsync('raw journal recovery and ordinary result export also verify the stored contract', async () => {
  const f = fixture(); f.create().captureRun(f.state);
  const identity = await publishMarkdownArtifact(extraction(), f.artifactId, { contentOptions: content() });
  f.item.status = 'processing';
  const reconcile = createBatchReconciliation();
  assert.equal(reconcile.publishedMarkdownArtifactRecord(f.artifactId).state, 'unsafe');
  assert.equal(reconcile.reconcilePublishedItems(f.state), true); assert.equal(f.item.artifact_sha256, identity.artifact_sha256);
  f.item.status = 'released'; f.state.created_at = '2026-10-14T00:00:00.000Z';
  const result = exportsAdapter.exportCompletedState(f.state);
  assert.equal(result.exported, 1); assert.equal(result.pending, 0);
  const record = JSON.parse(fs.readFileSync(exportsAdapter.recordPath(f.token)));
  assert.equal(record.schema, 'datasecure-result-export/5'); assert.deepEqual(record.content_options, content());
  assert.equal(exportsAdapter.completedMarkdownExportMatches(f.state), true);
  assert.equal(exportsAdapter.completedMarkdownExportMatches({ ...f.state, content_options: content({ imageOcr: true }) }), false);
  const run = exportsAdapter.visibleExportDirectory(f.token);
  assert.equal(fs.readFileSync(path.join(run, 'Ordner', 'Quelle.md'), 'utf8'), f.value.markdown);
  assert.equal(fs.existsSync(path.join(run, 'DataSecure-Zuordnung.csv')), false);
  assert.ok(!JSON.stringify(record).includes('PRIVATE_METADATA_SENTINEL'));
  const recordFile = exportsAdapter.recordPath(f.token);
  for (const schema of ['datasecure-result-export/4', 'datasecure-result-export/3']) {
    const changed = { ...record, schema, complete: false }; delete changed.content_options; delete changed.batch_id;
    if (schema.endsWith('/3')) changed.items = changed.items.map((row, index) => ({ ...row, file: `Dokument-${String(index + 1).padStart(3, '0')}-konvertiert.md` }));
    fs.writeFileSync(recordFile, JSON.stringify(changed));
    const replay = exportsAdapter.replayPendingResultExports();
    assert.ok(replay.failures > 0, 'generic replay rejects a legacy disguise even when every position was copied');
    assert.equal(JSON.parse(fs.readFileSync(recordFile)).complete, false);
    const downgraded = { ...f.state, schema: 'datasecure-batch/5' }; delete downgraded.content_options;
    assert.equal(exportsAdapter.completedMarkdownExportMatches(downgraded), false);
    assert.equal(exportsAdapter.visibleExportStatus(f.token, 1).available, false);
  }
  fs.writeFileSync(recordFile, JSON.stringify(record));
  const ownerDirectory = path.join(data, 'document-reviews', f.token), moved = path.join(root, `missing-run-${f.token}`);
  assert.ok(ownerDirectory.startsWith(data + path.sep) && moved.startsWith(root + path.sep));
  fs.renameSync(ownerDirectory, moved); // one exact mkdtemp-owned synthetic directory
  try {
    const disguise = { ...record, schema: 'datasecure-result-export/4', complete: false }; delete disguise.content_options; delete disguise.batch_id;
    fs.writeFileSync(recordFile, JSON.stringify(disguise));
    assert.ok(exportsAdapter.replayPendingResultExports().failures > 0, 'a removed run directory cannot prove legacy ownership');
    assert.equal(JSON.parse(fs.readFileSync(recordFile)).complete, false);
    assert.equal(exportsAdapter.visibleExportStatus(f.token, 1).available, false);
  } finally { fs.renameSync(moved, ownerDirectory); fs.writeFileSync(recordFile, JSON.stringify(record)); }
});

done(() => fs.rmSync(root, { recursive: true, force: true })); // only the mkdtemp-owned synthetic tree
