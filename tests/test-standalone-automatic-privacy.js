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

function fixture(kind = 'publication', extension = 'txt', text = 'CAPGEMINI INVENT\nName: Anna Beispiel\nE-Mail: anna@example.invalid\n', contentOptions = options) {
  const token = crypto.randomBytes(32).toString('hex'), id = crypto.randomBytes(16).toString('hex'), bytes = Buffer.from(text);
  const source = path.join(scope, `source-${id}.${extension}`); fs.writeFileSync(source, bytes);
  const item = { id, name: `synthetic-source.${extension}`, size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    work_name: `001_${crypto.randomBytes(12).toString('hex')}.${extension}`, private_artifact_plain: true,
    status: kind === 'capture' ? 'deferred_review' : 'processing',
    checkpoint: kind === 'capture' ? 'awaiting_local_review' : 'processing_started' };
  const state = { schema: 'datasecure-batch/7', token, product_channel: 'standalone', processing_mode: 'markdown-and-anonymize',
    standalone_document_review: true, standalone_review_policy: 'automatic-conservative', content_options: contentOptions,
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

const textOptions = Object.freeze({ ...options, imageOcr: false });
let markdownReaders;
async function realTextConverter(bytes, extension, settings) {
  // Exactly the direct TXT / content-v1 Markdown branches in the conversion
  // worker, with its real pinned readers. No manufactured extraction or PII
  // result, native-loader substitution, or disabled ownership guard is used.
  assert.ok(['.txt', '.md'].includes(extension));
  assert.deepEqual(settings.contentOptions, textOptions);
  const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
  const raw = extractMarkdownBuffer(bytes, extension, extension === '.md' ? {} : { markdownOutput: 'content-v1' });
  let markdown = raw.markdown;
  if (extension === '.md') {
    if (!markdownReaders) {
      const { pathToFileURL } = require('node:url');
      const root = path.resolve(__dirname, '../native/markdown/pilot/node_modules');
      for (const [name, version] of [['mdast-util-from-markdown', '2.0.2'], ['parse5', '7.3.0']])
        assert.equal(JSON.parse(fs.readFileSync(path.join(root, name, 'package.json'))).version, version);
      const { fromMarkdown } = await import(pathToFileURL(path.join(root, 'mdast-util-from-markdown/index.js')).href);
      const { parseFragment } = await import(pathToFileURL(path.join(root, 'parse5/dist/index.js')).href);
      markdownReaders = { fromMarkdown, parseFragment };
    }
    const transformed = require('../plugins/data-secure/server/standalone/markdown-image-content').markdownImageContent(markdown, markdownReaders);
    assert.equal(transformed.imageNodesRemoved, false, 'these fixtures contain no omitted images');
    markdown = transformed.markdown;
  }
  return require('../plugins/data-secure/server/standalone/markdown-contract').createMarkdownExtraction({
    source_type: raw.source_type, markdown, coverage: raw.coverage, content_options: settings.contentOptions });
}
function publishTextFixture(f) {
  return withBatchPseudonymRegistry(batch._test.readStateForMaintenance(f.state.token), registry =>
    require('../plugins/data-secure/server/gateway/content-publication-operation').publishPersistedContent(f.context, {
      pseudonymRegistry: registry, convertBuffer: realTextConverter,
      reviewText() { throw Error('automatic text must not invoke a human reviewer'); },
      afterPublish() { f.review.recordPublication(f.state.token, f.item.id); }
    }));
}
function exportTextFixture(f, row) {
  const operation = crypto.randomBytes(16).toString('hex');
  const selection = [{ document_id: row.document_id, revision: row.revision, output_sha256: row.output_sha256 }];
  const preview = f.review.previewExport(f.state.token, operation, selection);
  assert.equal(preview.ok, true);
  const exported = f.review.exportApproved(f.state.token, operation, selection);
  assert.equal(exported.ok, true); assert.equal(exported.exported_count, 1);
  const reference = f.review.resolveExport(f.state.token, operation);
  assert.equal(reference.target_kind, 'directory');
  assert.deepEqual(fs.readdirSync(reference.local_path), ['Dokument_01.md']);
  return fs.readFileSync(path.join(reference.local_path, 'Dokument_01.md'), 'utf8');
}
async function assertUnsafeTextStopped(extension, text) {
  const f = fixture('publication', extension, text, textOptions);
  try {
    let stopped;
    try { await publishTextFixture(f); } catch (error) { stopped = error; }
    // Exercise review and actual file export even in the pre-fix red phase:
    // a test which stops at a direct engine assertion would miss this bypass.
    const listed = f.review.list(f.state.token), row = listed.documents[0];
    let exported;
    if (row?.approved) exported = exportTextFixture(f, row);
    assert.deepEqual(fs.readFileSync(f.source), f.bytes);
    assert.ok(stopped, `unsafe text must stop before publication (approved=${row?.approved === true}, exported=${exported !== undefined})`);
    assert.equal(stopped.code, 'RESIDUAL_PII', 'fixed content-free policy failure, not an unrelated extraction/ownership fault');
    assert.deepEqual(listed.documents, []);
    assert.equal(exported, undefined);
    const pool = require('../plugins/data-secure/server/standalone/anonymized-store').anonymizedArtifactRoots().output;
    assert.equal(fs.existsSync(path.join(pool, f.context.package_id)), false, 'no unsafe private package may be published');
  } finally { f.release(); }
}
async function assertTextExportsExactly(extension, source, expected) {
  const f = fixture('publication', extension, source, textOptions);
  try {
    assert.equal((await publishTextFixture(f)).ok, true);
    const base = JSON.parse(fs.readFileSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', f.state.token, f.item.id, 'base.json')));
    assert.equal(base.markdown, expected); assert.equal(replayTransformTrace(base.transform_trace), expected);
    const row = f.review.list(f.state.token).documents[0];
    assert.equal(row.approved, true); assert.equal(row.approval_basis, 'automatic');
    assert.equal(exportTextFixture(f, row), expected, 'verify actual selected-export bytes, not only an in-memory draft');
    assert.deepEqual(fs.readFileSync(f.source), f.bytes);
  } finally { f.release(); }
}

function historicalUnsafeTextFixture() {
  // Frozen output was produced by the real pre-fix engine, publication proof,
  // artifact constructor and transform trace (Node 22.23.2). Restore that saved
  // state instead of rerunning a now-fixed anonymizer to construct the test.
  // No verifier is mocked and no fresh WeakMap publication proof is invented.
  const saved = structuredClone(require('./lib/standalone-unsafe-canonical-pre-fix.json'));
  const policy = require('../plugins/data-secure/server/privacy/policy');
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(saved.manifest)).digest('hex'), saved.expectation.manifest_sha256,
    'the frozen pre-fix package really has the recorded byte binding');
  // Rebind ONLY public compatibility markers and their manifest checksum to
  // the running version. This synthetic same-ruleset variant must exercise
  // today's text gate, not pass just because de-business/4 became /5. The old
  // unsafe bytes, source, trace, dictionary and claimed verification stay exact;
  // no current anonymizer/verifier is used to regenerate or bless that claim.
  saved.manifest.privacy_ruleset = saved.verification_context.ruleset = policy.PRIVACY_RULESET_VERSION;
  saved.manifest.credential_context_policy = saved.verification_context.credential_policy = policy.CREDENTIAL_CONTEXT_POLICY_VERSION;
  saved.manifest.gateway_version = require('../plugins/data-secure/server/version').VERSION;
  saved.expectation.manifest_sha256 = crypto.createHash('sha256').update(JSON.stringify(saved.manifest)).digest('hex');
  const token = crypto.randomBytes(32).toString('hex'), id = saved.manifest.package_id.slice(3);
  const privateRoot = path.join(scope, 'historical-unsafe-private'), resultRoot = path.join(scope, 'historical-unsafe-results');
  fs.mkdirSync(privateRoot); fs.mkdirSync(resultRoot);
  const item = { id, name: 'synthetic-historical.txt', sha256: saved.manifest.document_sha256, status: 'released' };
  const state = { schema: 'datasecure-batch/7', token, product_channel: 'standalone', processing_mode: 'markdown-and-anonymize',
    standalone_document_review: true, standalone_review_policy: 'automatic-conservative', content_options: saved.manifest.content_options, items: [item] };
  const create = () => createDocumentReviewStore({ dataRoot: privateRoot, resultRoot: () => resultRoot, expectedDocuments: () => [item] });
  const review = create(), manifestBytes = Buffer.from(JSON.stringify(saved.manifest));
  assert.equal(crypto.createHash('sha256').update(manifestBytes).digest('hex'), saved.expectation.manifest_sha256);
  assert.equal(replayTransformTrace(saved.transform_trace), saved.markdown);
  const pool = require('../plugins/data-secure/server/standalone/anonymized-store').anonymizedArtifactRoots().output;
  const artifact = path.join(pool, saved.manifest.package_id); fs.mkdirSync(artifact);
  fs.writeFileSync(path.join(artifact, saved.manifest.document), saved.markdown);
  fs.writeFileSync(path.join(artifact, 'manifest.json'), manifestBytes);
  review.capture(state, item, { package_id: saved.manifest.package_id, content_options: state.content_options, source_type: 'txt',
    publication_binding: saved.expectation, original_text: saved.markdown, markdown: saved.markdown,
    transform_trace: saved.transform_trace, verification_context: saved.verification_context });
  review.recordPublication(token, id);
  // Structural/package integrity still succeeds. Only fresh text safety may
  // refuse the old automatic approval; a stale version/hash is not the oracle.
  assert.equal(require('../plugins/data-secure/server/standalone/anonymized-store')
    .readAnonymizedArtifact(saved.manifest.package_id, saved.expectation).markdown, saved.markdown);
  const immutablePins = () => {
    const rows = [];
    for (const [role, root] of [['private', privateRoot], ['artifact', artifact]]) {
      const visit = folder => {
        for (const name of fs.readdirSync(folder).sort()) {
          const file = path.join(folder, name), stat = fs.lstatSync(file);
          assert.equal(stat.isSymbolicLink(), false);
          if (stat.isDirectory()) visit(file);
          else {
            assert.equal(stat.isFile(), true);
            const bytes = fs.readFileSync(file);
            rows.push([role + '/' + path.relative(root, file).split(path.sep).join('/'), bytes.length,
              crypto.createHash('sha256').update(bytes).digest('hex')]);
          }
        }
      };
      visit(root);
    }
    return rows;
  };
  return { token, item, create, resultRoot, markdown: saved.markdown, immutablePins,
    basisPath: path.join(privateRoot, 'document-reviews', token, id, 'base.json'),
    selection: [{ document_id: id, revision: 0, output_sha256: saved.manifest.document_sha256 }] };
}

function legacyTraceFreeTextFixture(text) {
  // Valid legacy /1 review basis plus a real /3 package, without a trace or
  // self-selected policy context. Current approval must still apply the text
  // boundary; absence of provenance cannot exempt already saved characters.
  const token = crypto.randomBytes(32).toString('hex'), id = crypto.randomBytes(16).toString('hex');
  const dir = fs.mkdtempSync(path.join(scope, 'legacy-text-'));
  const privateRoot = path.join(dir, 'private'), outputRoot = path.join(dir, 'packages'), resultRoot = path.join(dir, 'results');
  for (const folder of [privateRoot, outputRoot, resultRoot]) fs.mkdirSync(folder);
  const digest = crypto.createHash('sha256').update(text).digest('hex'), packageId = `ds_${id}`;
  const item = { id, name: 'synthetic-legacy.txt', sha256: digest, status: 'released' };
  const state = { token, product_channel: 'standalone', processing_mode: 'markdown-and-anonymize', standalone_document_review: true, items: [item] };
  const create = () => createDocumentReviewStore({ dataRoot: privateRoot, outputRoot: () => outputRoot,
    resultRoot: () => resultRoot, expectedDocuments: () => [item] });
  const review = create(), target = path.join(outputRoot, packageId); fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, `${packageId}.md`), text);
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/3', package_id: packageId,
    document: `${packageId}.md`, verification: { text_residual_pii: 'passed' }, document_sha256: digest }));
  review.capture(state, item, { package_id: packageId, original_text: text, markdown: text });
  review.recordPublication(token, id);
  return { token, id, create, resultRoot };
}

function cleanupSyntheticScope() {
  const temporaryRoot = fs.realpathSync.native(os.tmpdir());
  assert.equal(path.dirname(scope), temporaryRoot);
  assert.match(path.basename(scope), /^datasecure-automatic-privacy-[A-Za-z0-9]+$/u);
  assert.equal(fs.realpathSync.native(scope), scope);
  const entries = [];
  function inspect(target) {
    const relative = path.relative(scope, target);
    assert.ok(target === scope || relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    const stat = fs.lstatSync(target);
    assert.equal(stat.isSymbolicLink(), false, 'never traverse/remove a linked test fixture');
    assert.ok(stat.isDirectory() || stat.isFile());
    if (stat.isDirectory()) for (const name of fs.readdirSync(target)) inspect(path.join(target, name));
    entries.push({ target, directory: stat.isDirectory() });
  }
  inspect(scope);
  for (const entry of entries) {
    if (entry.directory) fs.rmdirSync(entry.target);
    else fs.unlinkSync(entry.target);
  }
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
  await testAsync('fullwidth identifiers cannot survive guided or automatic publication gates', async () => {
    const { identifierCases, professionalText } = require('./lib/identifier-compatibility');
    for (const policy of ['manual', 'automatic-conservative']) {
      const raw = [professionalText, ...identifierCases.map(({label,value}) => label + value)].join('\n');
      const final = await finalize(prepare(raw), policy);
      assert.equal(final.markdown, [professionalText, ...identifierCases.map(({label,replacement}) => label + replacement)].join('\n'));
      assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
      assert.equal(final.transform_trace.canonical_input, raw);
    }
  });
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
  await testAsync('postcommit callback diagnostics preserve the fixed acknowledgement boundary and real code', async () => {
    const f = fixture();
    const refusal = Object.assign(Error('PRIVATE_CALLBACK_DIAGNOSTIC_SENTINEL'), { code: 'BATCH_OWNERSHIP_CHANGED' });
    try {
      await assert.rejects(withBatchPseudonymRegistry(batch._test.readStateForMaintenance(f.state.token), registry =>
        require('../plugins/data-secure/server/gateway/content-publication-operation').publishPersistedContent(f.context, {
          pseudonymRegistry: registry,
          async convertBuffer(bytes, extension, settings) {
            const raw = require('../plugins/data-secure/server/standalone/markdown-extractor').extractMarkdownBuffer(bytes, extension,
              { markdownOutput: settings.contentOptions.markdownOutput });
            return require('../plugins/data-secure/server/standalone/markdown-contract').createMarkdownExtraction({
              source_type: raw.source_type, markdown: raw.markdown, coverage: raw.coverage, content_options: settings.contentOptions });
          },
          afterPublish() { throw refusal; }
        })), error => error === refusal);
      const events = require('../plugins/data-secure/server/gateway/workflow-diagnostics')._test.readWorkflowEvents();
      assert.ok(events.some(row => row.event === 'content_operation_failed' && row.phase === 'content_ack' &&
        row.outcome === 'stopped' && row.error_code === 'BATCH_OWNERSHIP_CHANGED'));
      assert.doesNotMatch(JSON.stringify(events), /PRIVATE_CALLBACK_DIAGNOSTIC_SENTINEL|anna@example/u);
      assert.deepEqual(fs.readFileSync(f.source), f.bytes);
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
  for (const extension of ['txt', 'md']) {
    for (const [label, separator] of [['C1-80', '\u0080'], ['C1-NEL', '\u0085'], ['C1-9f', '\u009f'], ['replacement-character', '\ufffd']])
      await testAsync(`${extension} raw ${label} cannot split card groups into an automatically approved export`, () =>
        assertUnsafeTextStopped(extension, ['4111', '1111', '1111', '1111'].join(separator)));
    for (const [label, separator] of [['C0', '\u0001'], ['DEL', '\u007f']])
      await testAsync(`${extension} preserves the existing raw ${label} source rejection`, async () => {
        const f = fixture('publication', extension, ['4111', '1111', '1111', '1111'].join(separator), textOptions);
        try {
          await assert.rejects(publishTextFixture(f), code('TEXT_CONTROL_INVALID'));
          assert.deepEqual(f.review.list(f.state.token).documents, []);
          assert.deepEqual(fs.readFileSync(f.source), f.bytes);
        } finally { f.release(); }
      });
    await testAsync(`${extension} ordinary card-group spaces still redact before actual selected export`, () =>
      assertTextExportsExactly(extension, '4111 1111 1111 1111', '[BANK_DATA_REDACTED]'));
  }
  for (const [label, reference] of [['numeric-C0-null', '&#0;'], ['numeric-C0', '&#31;'], ['numeric-DEL', '&#127;'],
    ['numeric-C1', '&#133;'], ['hex-C1', '&#x85;'], ['numeric-replacement-character', '&#xfffd;']])
    await testAsync(`active Markdown ${label} cannot publish or export split card groups`, () =>
      assertUnsafeTextStopped('md', ['4111', '1111', '1111', '1111'].join(reference)));
  // Isolated ASCII explanations are literal content; a full Luhn-valid card
  // corridor is a different safety case, even inside a code/escape wrapper.
  const literalReferences = '&#0; / &#133; / &#xfffd;';
  const escapedReferences = '\\&#0; / \\&#133; / \\&#xfffd;';
  await testAsync('TXT numeric-looking reference spellings remain genuine escaped literal bytes through export', () =>
    assertTextExportsExactly('txt', literalReferences, escapedReferences));
  await testAsync('explicitly escaped Markdown numeric references remain literal through repeated gates and export', () =>
    assertTextExportsExactly('md', escapedReferences, escapedReferences));
  await testAsync('inline-code ASCII numeric references are literal, not decoded unsafe controls', () =>
    assertTextExportsExactly('md', '`' + literalReferences + '`', escapedReferences));
  await testAsync('fenced-code ASCII numeric references are preserved exactly, not decoded unsafe controls', () => {
    const fenced = '```text\n' + literalReferences + '\n```';
    return assertTextExportsExactly('md', fenced, fenced);
  });
  await testAsync('valid TAB CR and LF remain releasable Markdown content', () =>
    assertTextExportsExactly('md', 'Sachlicher\tInhalt\r\nFortsetzung', 'Sachlicher\tInhalt\r\nFortsetzung'));
  await testAsync('an actual replacement character inside code has no literal-ASCII exemption', () =>
    assertUnsafeTextStopped('md', '`4111\ufffd1111\ufffd1111\ufffd1111`'));
  const cardReferences = '4111&#133;1111&#133;1111&#133;1111';
  await testAsync('TXT escaping cannot hide a complete numeric-reference card corridor from the safety probe', () =>
    assertUnsafeTextStopped('txt', cardReferences));
  await testAsync('explicit Markdown escaping cannot hide a complete numeric-reference card corridor', () =>
    assertUnsafeTextStopped('md', cardReferences.replace(/&/gu, '\\&')));
  await testAsync('inline code cannot exempt a complete numeric-reference card corridor', () =>
    assertUnsafeTextStopped('md', '`' + cardReferences + '`'));
  await testAsync('fenced code cannot exempt a complete numeric-reference card corridor', () =>
    assertUnsafeTextStopped('md', '```text\n' + cardReferences + '\n```'));
  await testAsync('a saved pre-fix U+FFFD publication stays privately readable without automatic approval or new publication authority', () => {
    const f = historicalUnsafeTextFixture(), current = f.create();
    const before = f.immutablePins();
    assert.equal(JSON.parse(fs.readFileSync(f.basisPath)).review_policy, 'automatic-conservative');
    // Read, preview, explicit approval and export are independent fresh
    // operations. Readability must not grant authority or rewrite the old
    // unsafe artifact, immutable basis, trace or claimed historical proof.
    const listed = current.list(f.token), attempt = action => {
      try { return { result: action() }; } catch (error) { return { error }; }
    };
    const chunk = attempt(() => f.create().chunk(f.token, f.item.id, 0, 0));
    const preview = attempt(() => f.create().previewExport(f.token, 'd'.repeat(32), f.selection));
    const approved = attempt(() => f.create().decide(f.token, f.item.id, { action: 'approve', ranges: [],
      revision: 0, output_sha256: f.selection[0].output_sha256, operation_id: 'b'.repeat(32) }));
    const exported = attempt(() => f.create().exportApproved(f.token, 'c'.repeat(32), f.selection));
    assert.deepEqual({ reviewable: listed.documents.length, unavailable: listed.unavailable.map(row => row.reason_code),
      preview_error: preview.error?.code || null, approval_error: approved.error?.code || null, export_error: exported.error?.code || null },
    { reviewable: 1, unavailable: [], preview_error: 'DOCUMENT_REVIEW_RESIDUAL_PII',
      approval_error: 'DOCUMENT_REVIEW_RESIDUAL_PII', export_error: 'DOCUMENT_REVIEW_UNAPPROVED' });
    const row = listed.documents[0];
    assert.equal(row.document_id, f.item.id); assert.equal(row.revision, 0);
    assert.equal(row.output_sha256, f.selection[0].output_sha256);
    assert.equal(row.approved, false); assert.equal(row.approval_basis, null);
    assert.equal(chunk.error, undefined); assert.equal(chunk.result.markdown, f.markdown);
    assert.match(chunk.result.markdown, /\ufffd/u);
    for (const result of [preview, approved, exported]) assert.equal(Object.hasOwn(result, 'result'), false);
    assert.deepEqual(f.create().list(f.token).documents, listed.documents, 'all private revisions and approval fields remain unchanged');
    assert.deepEqual(f.immutablePins(), before, 'no old evidence mutation or added decision/commit/export record');
    assert.deepEqual(fs.readdirSync(f.resultRoot), [], 'unsafe old approval may not create a new public export');
  });
  for (const [label, text] of [['replacement', '4111\ufffd1111\ufffd1111\ufffd1111'], ['raw-C1', '4111\u00851111\u00851111\u00851111'],
    ['C1-in-comment', '<!--\u0085-->Sachlicher Inhalt'], ['replacement-in-comment', '<!--\ufffd-->Sachlicher Inhalt'],
    ['C1-in-attribute', '<span title="\u0085">Sachlicher Inhalt</span>'],
    ['replacement-in-attribute', '<span title="\ufffd">Sachlicher Inhalt</span>']])
    await testAsync(`trace-free legacy ${label} text cannot obtain a current approval or export`, () => {
      const f = legacyTraceFreeTextFixture(text), current = f.create(), row = current.list(f.token).documents[0];
      assert.equal(row.approved, false);
      assert.throws(() => current.decide(f.token, f.id, { action: 'approve', ranges: [], revision: row.revision,
        output_sha256: row.output_sha256, operation_id: crypto.randomBytes(16).toString('hex') }), code('DOCUMENT_REVIEW_RESIDUAL_PII'));
      assert.equal(f.create().list(f.token).documents[0].approved, false);
      const selected = [{ document_id: row.document_id, revision: row.revision, output_sha256: row.output_sha256 }];
      assert.throws(() => f.create().exportApproved(f.token, crypto.randomBytes(16).toString('hex'), selected), code('DOCUMENT_REVIEW_UNAPPROVED'));
      assert.deepEqual(fs.readdirSync(f.resultRoot), []);
    });
  await done(cleanupSyntheticScope);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
