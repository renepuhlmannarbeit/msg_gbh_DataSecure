'use strict';

// Actual private publication, held-file reads, process death and public-reader
// exclusion. Source extraction is a synthetic /2 receipt here: native format
// extraction and Tauri acceptance are separate gates, not simulated by this file.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { fork, spawnSync } = require('node:child_process');
const worker = process.argv[2] === '--worker';
const root = worker ? process.argv[3] : fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-private-publication-'));
for (const [key, name] of [['EU_PRIVACY_DATA_ROOT', 'data'], ['EU_PRIVACY_ROOT', 'legacy']]) process.env[key] = path.join(root, name);
const { createSuite } = require('./helpers');
const { createSourceExtraction, SOURCE_TYPES } = require('../plugins/data-secure/server/core/source-extraction-contract');
const { RESOURCE_LIMITS } = require('../plugins/data-secure/server/resource-limits');
const pii = require('../plugins/data-secure/server/pii-engine');
const artifact = require('../plugins/data-secure/server/standalone/anonymized-artifact');
const store = require('../plugins/data-secure/server/standalone/anonymized-store');
const publicStore = require('../plugins/data-secure/server/gateway/package-store');
const { roots, safeRemovePrivateTree } = require('../plugins/data-secure/server/gateway/common');
const { test, testAsync, assert, done } = createSuite('Private Standalone anonymized publication');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let serial = 0;
const options = (markdownOutput = 'content-v1', scanOcr = true, imageOcr = false) =>
  ({ schema: 'datasecure-content-options/1', markdownOutput, scanOcr, imageOcr });
const failure = action => assert.throws(action, error => error.code === 'STANDALONE_PUBLICATION_INVALID');
function fixture(source_type = 'txt', content_options = options(), profile = 'general', coverage = { status: 'complete', reason_codes: [] }) {
  const raw = 'Name: Amina Lindenfels\nE-Mail: amina.lindenfels@example.invalid\nFachtext: Java, Tabellen und Cloud. 🚀\n';
  const source_extraction = createSourceExtraction({ source_type, content_options, coverage, markdown: raw }, RESOURCE_LIMITS.MAX_TEXT_CHARS);
  const result = pii.anonymize(raw, profile, { productChannel: 'standalone', contentOptions: content_options, captureTransformPlan: true });
  const proofInput = { markdown: result.text, profile, content_options, source_extraction, dictionary: result.dictionary,
    strong_person_anchor: result.strongPersonAnchor === true, reviewed_person_candidates: null };
  const input = { package_id: `ds_${(++serial).toString(16).padStart(32, '0')}`, content_options, source_type, profile,
    operation_id: crypto.randomUUID(), created_at: new Date().toISOString(), coverage, markdown: result.text,
    verification_proof: artifact.verifyAnonymizedPublication(proofInput) };
  const created = artifact.createAnonymizedArtifact(input);
  return { input, created, proofInput, trace: result.transform_trace, expectation: created.expectation };
}
function folder(f) { return path.join(store.anonymizedArtifactRoots().output, f.input.package_id); }
function freshRead(f) {
  const script = "const s=require('./plugins/data-secure/server/standalone/anonymized-store');const e=JSON.parse(process.argv[1]);const a=s.readAnonymizedArtifact(e.package_id,e);process.stdout.write(JSON.stringify({hash:a.manifest.document_sha256,text:a.markdown}));";
  const read = spawnSync(process.execPath, ['-e', script, JSON.stringify(f.expectation)], { cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_OPTIONS: '' }, windowsHide: true, encoding: 'utf8', timeout: 10000 });
  assert.equal(read.status, 0, read.stderr); assert.equal(read.error, undefined);
  return JSON.parse(read.stdout);
}
function batchFixture(f, status = 'processing', reviewPolicy) {
  const id = f.input.package_id.slice(3);
  const item = { id, name: `synthetic-source.${f.input.source_type}`, sha256: hash(f.proofInput.source_extraction.markdown), status };
  const state = { schema: 'datasecure-batch/7', token: id.padStart(64, '0'), profile: f.input.profile, product_channel: 'standalone',
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(),
    processing_mode: 'markdown-and-anonymize', standalone_document_review: true, content_options: f.input.content_options, items: [item],
    ...(reviewPolicy ? { standalone_review_policy: reviewPolicy } : {}) };
  const review = require('../plugins/data-secure/server/gateway/standalone-document-review-store').createDocumentReviewStore();
  review.captureRun(state);
  const policy = require('../plugins/data-secure/server/privacy/policy');
  function capture(details) {
    review.capture(state, item, { package_id: details.package_id, original_text: f.proofInput.source_extraction.markdown, markdown: f.input.markdown,
      content_options: f.input.content_options, source_type: f.input.source_type, publication_binding: details.publication_binding,
      transform_trace: f.trace, verification_context: { profile: f.input.profile, dictionary: f.proofInput.dictionary,
        strong_person_anchor: f.proofInput.strong_person_anchor, ruleset: policy.PRIVACY_RULESET_VERSION, credential_policy: policy.CREDENTIAL_CONTEXT_POLICY_VERSION,
        person_field_policy: f.created.manifest.person_field_policy, publication_frame: { prefix: '', suffix: '' }, reviewed_ranges: [] } });
  }
  return { state, item, review, capture };
}

async function workerMain() {
  const phase = process.argv[4], f = fixture();
  await store.publishAnonymizedArtifact(f.input, { beforePublish: async () => {
    await new Promise((resolve, reject) => process.send({ expectation: f.expectation }, error => error ? reject(error) : resolve()));
    if (phase === 'before') await new Promise(() => { setInterval(() => {}, 1000); });
  }, publishPackage(from, to) { fs.renameSync(from, to); process.exit(79); } });
}
async function crashAt(phase) {
  const privateRoot = fs.mkdtempSync(path.join(root, 'crash-'));
  const child = fork(__filename, ['--worker', privateRoot, phase], { windowsHide: true,
    env: { ...process.env, NODE_OPTIONS: '' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let expectation, timedOut = false, stderr = '';
  child.stderr.on('data', bytes => { stderr += bytes.toString().slice(0, 1000); });
  child.on('message', value => { expectation = value.expectation; if (phase === 'before') child.kill('SIGKILL'); });
  const exited = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 15000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); resolve(code); });
  });
  assert.equal(timedOut, false); assert.equal(stderr, ''); assert.ok(expectation);
  if (phase === 'after') assert.equal(exited, 79);
  const environment = { ...process.env, NODE_OPTIONS: '', EU_PRIVACY_DATA_ROOT: path.join(privateRoot, 'data'), EU_PRIVACY_ROOT: path.join(privateRoot, 'legacy') };
  const script = "const s=require('./plugins/data-secure/server/standalone/anonymized-store');const e=JSON.parse(process.argv[1]);const before=s.inspectAnonymizedStaging();const recovered=s.recoverAnonymizedStages();let read=false;try{s.readAnonymizedArtifact(e.package_id,e);read=true;}catch{}process.stdout.write(JSON.stringify({before,recovered,after:s.inspectAnonymizedStaging(),read}));";
  const result = spawnSync(process.execPath, ['-e', script, JSON.stringify(expectation)], { cwd: path.resolve(__dirname, '..'), env: environment,
    windowsHide: true, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr); const actual = JSON.parse(result.stdout);
  assert.equal(actual.before.pending, 1); assert.equal(actual.recovered.removed, 1);
  assert.equal(actual.recovered.failures, 0); assert.equal(actual.after.pending, 0); assert.equal(actual.read, phase === 'after');
}

async function main() {
  test('construction requires an actual residual proof, bound to exact bytes, profile, source coverage and every option', () => {
    const f = fixture();
    for (const value of [undefined, null, {}, JSON.parse(JSON.stringify(f.input.verification_proof))])
      failure(() => artifact.createAnonymizedArtifact({ ...f.input, verification_proof: value }));
    for (const change of [{ markdown: f.input.markdown + ' changed' }, { source_type: 'pdf' }, { profile: 'customer' },
      { coverage: { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED'] } },
      ...['markdownOutput', 'scanOcr', 'imageOcr'].map(key => ({ content_options: { ...f.input.content_options,
        [key]: key === 'markdownOutput' ? 'notes-v1' : !f.input.content_options[key] } }))])
      failure(() => artifact.createAnonymizedArtifact({ ...f.input, ...change }));
    failure(() => artifact.verifyAnonymizedPublication({ ...f.proofInput, markdown: f.proofInput.source_extraction.markdown }));
    assert.equal(f.created.manifest.verification.text_residual_pii, 'passed');
  });
  test('all eight option combinations, all normalized source types and profiles use a closed independent expectation', () => {
    for (const output of ['content-v1', 'notes-v1']) for (const scan of [false, true]) for (const image of [false, true]) {
      const f = fixture('pdf', options(output, scan, image));
      artifact.validateAnonymizedArtifactForExpectation(f.created.manifest, f.input.markdown, f.expectation, Buffer.from(JSON.stringify(f.created.manifest)));
      assert.deepEqual(f.expectation.content_options, options(output, scan, image));
    }
    for (const type of SOURCE_TYPES) assert.equal(fixture(type).created.manifest.source_type, type);
    for (const profile of ['general', 'contract', 'customer', 'applicant', 'personnel_profile']) assert.equal(fixture('md', options(), profile).expectation.profile, profile);
    const incomplete = fixture('pdf', options(), 'general', { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED'] });
    assert.equal(incomplete.created.manifest.document_result.grade, 'complete');
    assert.equal(incomplete.created.manifest.source_extraction_coverage.status, 'incomplete');
  });
  test('the final residual proof does not impose a hidden 10,000-entry dictionary limit', () => {
    const f = fixture();
    const dictionary = [...f.proofInput.dictionary, ...Array.from({ length: 10001 }, (_, index) =>
      ({ value: `synthetic-unused-name-${index}`, type: 'PERSON' }))];
    const proof = artifact.verifyAnonymizedPublication({ ...f.proofInput, dictionary });
    assert.ok(artifact.createAnonymizedArtifact({ ...f.input, verification_proof: proof }));
  });
  test('foreign keys, getters, symbols, proxies and malformed options are refused without executing caller code', () => {
    const f = fixture(); let traps = 0;
    const getter = Object.defineProperty({ ...f.input }, 'markdown', { enumerable: true, get() { traps++; return f.input.markdown; } });
    const proxy = new Proxy(f.input, { ownKeys() { traps++; return []; }, getPrototypeOf() { traps++; return Object.prototype; } });
    for (const input of [getter, proxy, { ...f.input, source_name: 'private.txt' }, { ...f.input, [Symbol('private')]: true },
      { ...f.input, content_options: null }, { ...f.input, content_options: { ...options(), extra: true } }])
      failure(() => artifact.createAnonymizedArtifact(input));
    assert.equal(traps, 0);
    failure(() => artifact.validateExpectation({ ...f.expectation, private_document_metadata: {} }));
  });
  test('primitive identifiers/digests and manifest buffers never invoke coercions or proxy traps', () => {
    const f = fixture(); let calls = 0;
    const executable = { toString() { calls++; return f.input.package_id; } };
    failure(() => artifact.createAnonymizedArtifact({ ...f.input, package_id: executable }));
    for (const key of ['package_id', 'document_sha256', 'manifest_sha256'])
      failure(() => artifact.validateExpectation({ ...f.expectation, [key]: { toString() { calls++; return f.expectation[key]; } } }));
    for (const value of [() => '', Symbol('foreign'), 1n]) failure(() => artifact.createAnonymizedArtifact({ ...f.input, package_id: value }));
    const bytes = new Proxy(Buffer.from(JSON.stringify(f.created.manifest)), { get(target, key) { calls++; return Reflect.get(target, key); },
      getPrototypeOf(target) { calls++; return Reflect.getPrototypeOf(target); } });
    failure(() => artifact.validateAnonymizedArtifactForExpectation(f.created.manifest, f.input.markdown, f.expectation, bytes));
    assert.equal(calls, 0);
  });
  await testAsync('actual publication lives outside public Output and survives a genuinely fresh reader process', async () => {
    const f = fixture('pdf'); let callbacks = 0;
    const details = await store.publishAnonymizedArtifact(f.input, { beforePublish(value) { callbacks++; assert.deepEqual(value.publication_binding, f.expectation); },
      afterPublish(value) { callbacks++; assert.equal(store.readAnonymizedArtifact(value.package_id, f.expectation).markdown, f.input.markdown); } });
    assert.equal(callbacks, 2); assert.deepEqual(details.publication_binding, f.expectation);
    assert.deepEqual(freshRead(f), { hash: f.expectation.document_sha256, text: f.input.markdown });
    assert.deepEqual(fs.readdirSync(folder(f)).sort(), [f.created.manifest.document, 'manifest.json'].sort());
    assert.equal(fs.existsSync(path.join(roots().output, f.input.package_id)), false);
    assert.throws(() => publicStore.issueReadCapability(f.input.package_id));
    assert.throws(() => publicStore.safeResolvePackage(f.input.package_id));
    assert.equal(publicStore.listOutputs().packages.some(row => row.package_id === f.input.package_id), false);
    assert.throws(() => publicStore.openVerifiedMarkdownSnapshot(f.input.package_id));
  });
  await testAsync('missing or changed expected context never adopts even identical output bytes', async () => {
    const f = fixture(); await store.publishAnonymizedArtifact(f.input);
    for (const context of [undefined, null, {}, { ...f.expectation, profile: 'customer' }, { ...f.expectation, source_type: 'pdf' },
      { ...f.expectation, document_sha256: 'a'.repeat(64) }, { ...f.expectation, manifest_sha256: 'a'.repeat(64) },
      ...['markdownOutput', 'scanOcr', 'imageOcr'].map(key => ({ ...f.expectation, content_options: { ...options(),
        [key]: key === 'markdownOutput' ? 'notes-v1' : !options()[key] } }))]) failure(() => store.readAnonymizedArtifact(f.input.package_id, context));
  });
  await testAsync('private publication checks capacity at its actual stage before writing payload or running callbacks', async () => {
    const f = fixture(); let calls = 0, callbacks = 0;
    await assert.rejects(store.publishAnonymizedArtifact(f.input, {
      assertWritableCapacity({ directory, bytes }) {
        calls++;
        assert.ok(directory.startsWith(path.join(store.anonymizedArtifactRoots().root, '.datasecure-staging')));
        assert.deepEqual(fs.readdirSync(directory), []);
        assert.ok(bytes >= Buffer.byteLength(f.input.markdown));
        throw Object.assign(Error('synthetic capacity limit'), { code: 'LOCAL_CAPACITY_INSUFFICIENT' });
      }, beforePublish() { callbacks++; }, afterPublish() { callbacks++; }
    }), error => error.code === 'LOCAL_CAPACITY_INSUFFICIENT');
    assert.equal(calls, 1); assert.equal(callbacks, 0);
    assert.equal(fs.existsSync(folder(f)), false); assert.equal(store.inspectAnonymizedStaging().pending, 0);
  });
  await testAsync('schema downgrade, metadata insertion and a recomputed document hash cannot re-bless a private artifact', async () => {
    const f = fixture(); await store.publishAnonymizedArtifact(f.input);
    const target = folder(f), manifestFile = path.join(target, 'manifest.json'), documentFile = path.join(target, f.created.manifest.document);
    const savedManifest = fs.readFileSync(manifestFile), savedDocument = fs.readFileSync(documentFile);
    for (const change of [{ schema: 'eu-privacy-package/3' }, { private_document_metadata: { title: 'private' } },
      { content_options: undefined }, { processing_mode: 'markdown-only' }, { anonymized: false }, { product_channel: 'cowork' }]) {
      fs.writeFileSync(manifestFile, JSON.stringify({ ...f.created.manifest, ...change }));
      failure(() => store.readAnonymizedArtifact(f.input.package_id, f.expectation));
    }
    const replacement = Buffer.from(f.input.markdown + ' changed'); fs.writeFileSync(documentFile, replacement);
    fs.writeFileSync(manifestFile, JSON.stringify({ ...f.created.manifest, document_sha256: hash(replacement), document_bytes: replacement.length }));
    failure(() => store.readAnonymizedArtifact(f.input.package_id, f.expectation));
    fs.writeFileSync(manifestFile, savedManifest); fs.writeFileSync(documentFile, savedDocument);
    assert.equal(store.readAnonymizedArtifact(f.input.package_id, f.expectation).markdown, f.input.markdown);
    await assert.rejects(store.publishAnonymizedArtifact(f.input), error => error.code === 'STANDALONE_PUBLICATION_INVALID');
  });
  await testAsync('a forged legacy package with the same identity is not read from the private pool', async () => {
    const f = fixture(); const legacy = path.join(roots().output, f.input.package_id); fs.mkdirSync(legacy);
    fs.writeFileSync(path.join(legacy, f.created.manifest.document), f.input.markdown);
    fs.writeFileSync(path.join(legacy, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/2', package_id: f.input.package_id,
      profile: 'general', created_at: f.input.created_at, document: f.created.manifest.document, document_sha256: f.expectation.document_sha256, assets: [] }));
    const grant = publicStore.issueReadCapability(f.input.package_id); assert.ok(grant.read_capability);
    failure(() => store.readAnonymizedArtifact(f.input.package_id, f.expectation));
    await store.publishAnonymizedArtifact(f.input);
    assert.equal(store.readAnonymizedArtifact(f.input.package_id, f.expectation).markdown, f.input.markdown);
    assert.ok(publicStore.readOutput(f.input.package_id, grant.read_capability).text.includes('Java'));
  });
  test('new batch recovery never promotes a public legacy package with the same identity', () => {
    const f = fixture(), id = f.input.package_id.slice(3);
    const item = { id, name: 'synthetic-source.txt', sha256: hash(f.proofInput.source_extraction.markdown), status: 'processing' };
    const state = { schema: 'datasecure-batch/7', token: id.padStart(64, '0'), profile: 'general', product_channel: 'standalone',
      processing_mode: 'markdown-and-anonymize', standalone_document_review: true, content_options: f.input.content_options, items: [item] };
    require('../plugins/data-secure/server/gateway/standalone-document-review-store').createDocumentReviewStore().captureRun(state);
    const legacy = path.join(roots().output, f.input.package_id); fs.mkdirSync(legacy);
    fs.writeFileSync(path.join(legacy, f.created.manifest.document), f.input.markdown);
    fs.writeFileSync(path.join(legacy, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/3', package_id: f.input.package_id,
      document: f.created.manifest.document, document_sha256: f.expectation.document_sha256, document_result: f.created.manifest.document_result,
      parser_warnings: [], assets: [], pdf_unextractable_visual_objects: 0, images_removed_by_explicit_request: 0 }));
    const reconciliation = require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation();
    assert.equal(reconciliation.reconcilePublishedItems(state), false);
    assert.equal(item.status, 'processing');
  });
  test('a changed private Output parent is unsafe, never a missing publication to retry', () => {
    const f = fixture(), id = f.input.package_id.slice(3);
    const item = { id, name: 'synthetic-source.txt', sha256: hash(f.proofInput.source_extraction.markdown), status: 'processing' };
    const state = { schema: 'datasecure-batch/7', token: id.padStart(64, '0'), profile: 'general', product_channel: 'standalone',
      processing_mode: 'markdown-and-anonymize', standalone_document_review: true, content_options: f.input.content_options, items: [item] };
    require('../plugins/data-secure/server/gateway/standalone-document-review-store').createDocumentReviewStore().captureRun(state);
    const output = store.anonymizedArtifactRoots().output, target = path.join(output, f.input.package_id);
    const saved = `${output}-synthetic-saved`, lstat = fs.lstatSync;
    let changed = false;
    try {
      fs.lstatSync = function(file, ...args) {
        if (file === target && !changed) {
          fs.renameSync(output, saved); fs.mkdirSync(output); changed = true;
          throw Object.assign(Error('synthetic missing target'), { code: 'ENOENT' });
        }
        return lstat.call(this, file, ...args);
      };
      const reconciliation = require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation();
      assert.equal(reconciliation.publishedPackageRecord(f.input.package_id, state, item).state, 'unsafe');
      assert.equal(item.status, 'processing');
    } finally {
      fs.lstatSync = lstat;
      if (changed) { fs.rmdirSync(output); fs.renameSync(saved, output); }
    }
  });
  await testAsync('lost rename/callback ACK is adopted from exact private bytes and records publication before mapping', async () => {
    for (const phase of ['rename', 'after']) {
      const f = fixture(), b = batchFixture(f);
      await assert.rejects(store.publishAnonymizedArtifact(f.input, { beforePublish: b.capture,
        ...(phase === 'rename' ? { publishPackage(from, to) { fs.renameSync(from, to); throw Error('synthetic lost ACK'); } } :
          { afterPublish() { throw Error('synthetic callback loss'); } }) }), error => error.code === 'BATCH_PUBLICATION_UNCONFIRMED');
      const receipt = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', b.state.token, b.item.id, 'published.json');
      assert.equal(fs.existsSync(receipt), false);
      const reconciliation = require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation();
      assert.equal(reconciliation.reconcilePublishedItems(b.state), true);
      assert.equal(b.item.status, 'mapping_pending');
      assert.equal(JSON.parse(fs.readFileSync(receipt)).schema, 'datasecure-document-publication/2');
      assert.equal(reconciliation.markInterruptedItemsRetryable(b.state), 0);
      // The bound private mapping is now replayed; no legacy /2 intent is used.
      assert.equal(reconciliation.reconcilePendingMappings(b.state), true);
      assert.equal(b.item.status, 'delivery_pending');
      assert.equal(require('../plugins/data-secure/server/gateway/mapping').readOutboxEntries().some(row => row.package_id === f.input.package_id), false);
    }
  });
  await testAsync('review publication preserves a real rename Lost-ACK before its afterPublish callback', async () => {
    const f = fixture(), b = batchFixture(f, 'deferred_review'); let stoppedMappings = 0;
    const reconciliation = require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation();
    const publication = require('../plugins/data-secure/server/gateway/batch-review-publication').createBatchReviewPublication({
      invalidDecisionError: (code, message) => Object.assign(Error(message), { code }),
      reviewedBatchText: () => ({ text: f.input.markdown }), exactPendingEntry: () => ({}), packageIdForItem: item => `ds_${item.id}`,
      writeState() {}, appendMapping() { stoppedMappings++; }, markMappingPending: reconciliation.markMappingPending,
      anonymizeNext: () => { throw Error('LEGACY_PUBLICATION_MUST_NOT_RUN_FOR_BOUND_CONTENT'); },
      publishStandaloneReviewedItem: async (_token, _itemId, callbacks) => store.publishAnonymizedArtifact(f.input, {
        beforePublish: async details => { b.capture(details); await callbacks.beforePublish(details); },
        afterPublish: callbacks.afterPublish,
        publishPackage(from, to) { fs.renameSync(from, to); throw Error('synthetic rename ACK lost'); }
      }) });
    const result = await publication.publishReviewedBatch(b.state, [b.item], [{ anonymized_text: f.input.markdown, ambiguities: [] }],
      [{ document_index: 1, decisions: [] }]);
    assert.equal(b.item.status, 'processing'); assert.equal(b.item.checkpoint, 'publication_unconfirmed');
    assert.equal(result.recoveryBlocked, true); assert.equal(stoppedMappings, 0);
    assert.equal(reconciliation.reconcilePublishedItems(b.state), true);
    assert.equal(b.item.status, 'mapping_pending'); assert.equal(freshRead(f).text, f.input.markdown);
  });
  await testAsync('private targets without basis/anchor are unsafe; only an anchored absent target is missing', async () => {
    const reconciliation = require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation();
    const f = fixture(), b = batchFixture(f);
    assert.equal(reconciliation.publishedPackageRecord(f.input.package_id, b.state, b.item).state, 'missing');
    await store.publishAnonymizedArtifact(f.input); // deliberately no basis capture
    assert.equal(reconciliation.publishedPackageRecord(f.input.package_id, b.state, b.item).state, 'unsafe');
    const anchor = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', b.state.token, 'manifest.json');
    fs.renameSync(anchor, `${anchor}.synthetic-saved`);
    try { assert.equal(reconciliation.publishedPackageRecord(f.input.package_id, b.state, b.item).state, 'unsafe'); }
    finally { fs.renameSync(`${anchor}.synthetic-saved`, anchor); }
    const absent = fixture(), noAnchor = batchFixture(absent);
    const otherAnchor = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', noAnchor.state.token, 'manifest.json');
    fs.renameSync(otherAnchor, `${otherAnchor}.synthetic-saved`);
    try { assert.equal(reconciliation.publishedPackageRecord(absent.input.package_id, noAnchor.state, noAnchor.item).state, 'unsafe'); }
    finally { fs.renameSync(`${otherAnchor}.synthetic-saved`, otherAnchor); }
  });
  await testAsync('an absent artifact after a durable publication receipt is corruption, never a new retry', async () => {
    const f = fixture(), b = batchFixture(f);
    await store.publishAnonymizedArtifact(f.input, { beforePublish: b.capture });
    b.review.recordPublication(b.state.token, b.item.id);
    const target = folder(f), saved = `${target}-synthetic-saved`;
    fs.renameSync(target, saved);
    try {
      const reconciliation = require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation();
      assert.equal(reconciliation.publishedPackageRecord(f.input.package_id, b.state, b.item).state, 'unsafe');
    } finally { fs.renameSync(saved, target); }
  });
  await testAsync('recovery binds source membership, profile, options and manifest bytes even with a stat identity', async () => {
    const f = fixture('pdf'), b = batchFixture(f);
    await store.publishAnonymizedArtifact(f.input, { beforePublish: b.capture });
    const reconciliation = require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation();
    b.item.package_id = f.input.package_id; b.item.document_result = f.created.manifest.document_result;
    b.item.package_identity = { synthetic_stale_stat_identity: true };
    assert.equal(reconciliation.publishedPackageIdentityRecord(b.item, b.state).state, 'verified');
    for (const mutation of [{ profile: 'customer' }, { content_options: options('notes-v1') },
      { content_options: options('content-v1', false) }, { content_options: options('content-v1', true, true) }])
      assert.equal(reconciliation.publishedPackageRecord(f.input.package_id, { ...b.state, ...mutation }, b.item).state, 'unsafe');
    for (const mutation of [{ name: 'different.pdf' }, { name: 'synthetic-source.txt' }, { sha256: 'a'.repeat(64) }])
      assert.equal(reconciliation.publishedPackageRecord(f.input.package_id, b.state, { ...b.item, ...mutation }).state, 'unsafe');
    const manifest = path.join(folder(f), 'manifest.json'), saved = fs.readFileSync(manifest);
    fs.writeFileSync(manifest, Buffer.concat([saved, Buffer.from(' ')]));
    assert.equal(reconciliation.publishedPackageIdentityRecord(b.item, b.state).state, 'unsafe', 'semantic JSON equality cannot replace expected manifest bytes');
    fs.writeFileSync(manifest, saved);
    assert.equal(reconciliation.publishedPackageRecord(f.input.package_id, b.state, b.item).state, 'verified');
  });
  await testAsync('new delivery remains local, never issues a public capability and rechecks before finalization', async () => {
    const f = fixture(), b = batchFixture(f, 'delivery_pending');
    await store.publishAnonymizedArtifact(f.input, { beforePublish: b.capture });
    Object.assign(b.item, { package_id: f.input.package_id, document_result: f.created.manifest.document_result, work_name: `001_${'a'.repeat(24)}.txt` });
    let writes = 0, grants = 0;
    const reconciliation = require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation();
    const delivery = require('../plugins/data-secure/server/gateway/batch-delivery').createBatchDelivery({ SafeError: Error,
      active: new Set(), acquireActiveLock() {}, releaseActiveLock() { return true; }, readState: () => b.state,
      writeState() { writes++; }, assertLocalExecutorAccess() {}, publicProgress: () => ({}), writeTerminalEvidence() { return true; },
      workPath: () => path.join(root, 'synthetic-work'), regularPublishedPackage: reconciliation.regularPublishedPackage,
      issueReadCapability() { grants++; throw Error('must not issue'); } });
    const result = delivery.deliveryResult(b.state, b.item);
    assert.equal(result.anonymized, true); assert.equal(Object.hasOwn(result, 'read_capability'), false);
    const packageId = b.item.package_id; let coercions = 0;
    b.item.package_id = { toString() { coercions++; return packageId; } };
    assert.throws(() => delivery.deliveryResult(b.state, b.item));
    assert.equal(coercions, 0); b.item.package_id = packageId;
    const document = path.join(folder(f), f.created.manifest.document), saved = fs.readFileSync(document);
    fs.writeFileSync(document, 'synthetic changed result');
    assert.throws(() => delivery.finalizePublishedPackageLocally(b.state.token, f.input.package_id));
    assert.equal(writes, 0); assert.equal(b.item.status, 'delivery_pending');
    fs.writeFileSync(document, saved);
    delivery.finalizePublishedPackageLocally(b.state.token, f.input.package_id);
    assert.equal(b.item.status, 'released'); assert.equal(b.item.checkpoint, 'released_locally'); assert.equal(b.item.analysis_acknowledged, false);
    const committedWrites = writes;
    assert.throws(() => delivery.acknowledgeDeliveredPackage(b.state.token, f.input.package_id));
    assert.throws(() => delivery.acknowledgeDeliveredPackages(b.state.token, [f.input.package_id]));
    assert.equal(writes, committedWrites); assert.equal(grants, 0);
  });
  test('raw Markdown recovery also rejects an exchanged parent rather than retrying from a false absence', () => {
    const output = require('../plugins/data-secure/server/standalone/markdown-store').artifactRoot();
    const id = `dm_${(++serial).toString(16).padStart(32, '0')}`, target = path.join(output, id), saved = `${output}-synthetic-saved`;
    const lstat = fs.lstatSync; let changed = false;
    try {
      fs.lstatSync = function(file, ...args) {
        if (file === target && !changed) {
          fs.renameSync(output, saved); fs.mkdirSync(output); changed = true;
          throw Object.assign(Error('synthetic missing raw target'), { code: 'ENOENT' });
        }
        return lstat.call(this, file, ...args);
      };
      assert.equal(require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation()
        .publishedMarkdownArtifactRecord(id, options()).state, 'unsafe');
    } finally {
      fs.lstatSync = lstat;
      if (changed) { fs.rmdirSync(output); fs.renameSync(saved, output); }
    }
  });
  test('an absent raw result after a known publication is unsafe and never writes an anonymization mapping', () => {
    const id = (++serial).toString(16).padStart(32, '0');
    const item = { id, name: 'synthetic-raw.txt', sha256: 'a'.repeat(64), status: 'processing', checkpoint: 'package_published', artifact_id: `dm_${id}` };
    const state = { schema: 'datasecure-batch/7', token: id.padStart(64, '0'), product_channel: 'standalone',
      processing_mode: 'markdown-only', standalone_document_review: true, content_options: options(), items: [item] };
    require('../plugins/data-secure/server/gateway/standalone-document-review-store').createDocumentReviewStore().captureRun(state);
    let mappings = 0;
    const reconciliation = require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation({ appendMapping() { mappings++; } });
    reconciliation.markInterruptedItemsRetryable(state);
    assert.equal(item.status, 'stopped'); assert.equal(item.error_code, 'RECOVERY_FAILED'); assert.equal(mappings, 0);
  });
  await testAsync('a raw conversion failure persists its named stop without an anonymization mapping', async () => {
    const id = (++serial).toString(16).padStart(32, '0');
    const item = { id, name: 'synthetic-invalid.txt', sha256: 'a'.repeat(64), status: 'pending' };
    const state = { schema: 'datasecure-batch/7', token: id.padStart(64, '0'), profile: 'auto', product_channel: 'standalone',
      processing_mode: 'markdown-only', standalone_document_review: true, content_options: options(), items: [item] };
    let mappings = 0, writes = 0;
    const processor = require('../plugins/data-secure/server/gateway/batch-item-processor').createBatchItemProcessor({ SafeError: Error,
      writeState() { writes++; }, createPhaseRecorder: () => ({ mark() {}, snapshot: () => ({}) }),
      convertNext: async () => { throw Object.assign(Error('synthetic parser rejection'), { code: 'PARSER_COVERAGE_UNVERIFIED' }); },
      appendMapping() { mappings++; }, cleanupTerminalWorkCopy() {}, publicProgress: () => ({}), writeTerminalEvidence: () => true });
    const result = await processor.processSingleBatchItem(state, item, {});
    assert.equal(item.status, 'stopped'); assert.equal(item.error_code, 'PARSER_COVERAGE_UNVERIFIED');
    assert.ok(writes > 0); assert.equal(mappings, 0); assert.equal(result.local_mapping_exported, null);
  });
  await testAsync('terminal evidence rechecks private bytes and does not manufacture a legacy stat identity', async () => {
    const f = fixture(), b = batchFixture(f, 'released');
    await store.publishAnonymizedArtifact(f.input, { beforePublish: b.capture });
    Object.assign(b.item, { package_id: f.input.package_id, document_result: f.created.manifest.document_result });
    const reconciliation = require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation();
    const evidence = require('../plugins/data-secure/server/gateway/batch-terminal-evidence').createBatchTerminalEvidence({
      writeState() {}, publicProgress: () => ({ complete: true }),
      publishedPackageRecord: reconciliation.publishedPackageRecord, publishedPackageIdentityRecord: reconciliation.publishedPackageIdentityRecord,
      capturePackageIdentity() { throw Error('must not read public stat identity'); }, samePackageIdentity() { throw Error('must not compare public stat identity'); } });
    assert.equal(evidence.reconcileTerminalEvidence(b.state), true);
    assert.equal(b.state.terminal_evidence.record.batch_snapshot_schema, 'datasecure-batch/7');
    assert.equal(Object.hasOwn(b.item, 'package_identity'), false);
    const document = path.join(folder(f), f.created.manifest.document); fs.writeFileSync(document, 'synthetic corruption');
    assert.equal(evidence.reconcileTerminalEvidence(b.state), false, 'cached exported marker cannot bless changed private bytes');
  });
  await testAsync('legacy evidence and pending/exported markers cannot downgrade a new bound run', async () => {
    const f = fixture(), b = batchFixture(f, 'released');
    await store.publishAnonymizedArtifact(f.input, { beforePublish: b.capture });
    Object.assign(b.item, { package_id: f.input.package_id, document_result: f.created.manifest.document_result });
    const reconciliation = require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation();
    const evidenceStore = require('../plugins/data-secure/server/gateway/batch-evidence');
    const current = evidenceStore.evidenceRecord(b.state, new Date().toISOString(), 'c'.repeat(32), { publishedPackageRecord: reconciliation.publishedPackageRecord });
    const { grade_counts, omission_counts, ...legacy } = current; legacy.schema = 'datasecure-batch-evidence/2';
    assert.throws(() => evidenceStore.validateAnyEvidenceRecord(legacy));
    let removals = 0;
    const evidence = require('../plugins/data-secure/server/gateway/batch-terminal-evidence').createBatchTerminalEvidence({
      publicProgress: () => ({ complete: true }), removePendingEvidence() { removals++; },
      publishedPackageRecord: () => ({ state: 'unsafe' }), publishedPackageIdentityRecord: () => ({ state: 'unsafe' }) });
    for (const status of ['pending', 'exported']) {
      b.state.terminal_evidence = { schema: 'datasecure-batch-terminal-evidence/1', status, receipt_id: legacy.receipt_id, record: legacy };
      assert.throws(() => evidence.reconcileTerminalEvidence(b.state));
    }
    assert.equal(removals, 0);
  });
  await testAsync('post-callback staged byte/manifest changes stop before the atomic rename', async () => {
    for (const kind of ['document', 'manifest', 'extra']) {
      const f = fixture();
      await assert.rejects(store.publishAnonymizedArtifact(f.input, { beforePublish() {
        const payloadRoot = path.join(store.anonymizedArtifactRoots().root, '.datasecure-staging', 'payloads');
        const pending = fs.readdirSync(payloadRoot); assert.equal(pending.length, 1);
        const stage = path.join(payloadRoot, pending[0]);
        fs.writeFileSync(path.join(stage, kind === 'document' ? f.created.manifest.document : kind === 'manifest' ? 'manifest.json' : 'foreign.txt'),
          kind === 'manifest' ? JSON.stringify({ ...f.created.manifest, created_at: '2026-01-01T00:00:00.000Z' }) : 'tampered');
      } }), error => error.code === 'STANDALONE_PUBLICATION_INVALID');
      assert.equal(fs.existsSync(folder(f)), false); assert.equal(store.inspectAnonymizedStaging().pending, 0);
    }
  });
  await testAsync('rename success followed by a thrown ACK and later callback failure preserve exactly one committed artifact', async () => {
    for (const phase of ['rename', 'after']) {
      const f = fixture();
      const hooks = phase === 'rename' ? { publishPackage(from, to) { fs.renameSync(from, to); throw Error('lost response'); } } :
        { afterPublish() { throw Error('lost callback'); } };
      await assert.rejects(store.publishAnonymizedArtifact(f.input, hooks), error => error.code === 'BATCH_PUBLICATION_UNCONFIRMED');
      assert.equal(freshRead(f).text, f.input.markdown);
      const before = fs.readFileSync(path.join(folder(f), 'manifest.json'));
      store.recoverAnonymizedStages(); assert.deepEqual(fs.readFileSync(path.join(folder(f), 'manifest.json')), before);
    }
  });
  await testAsync('a mutation inside the rename callback is unconfirmed, retained and never adopted on recovery', async () => {
    const f = fixture();
    await assert.rejects(store.publishAnonymizedArtifact(f.input, { publishPackage(from, to) {
      fs.renameSync(from, to); fs.writeFileSync(path.join(to, f.created.manifest.document), 'changed after rename');
    } }), error => error.code === 'BATCH_PUBLICATION_UNCONFIRMED');
    assert.equal(fs.existsSync(folder(f)), true);
    failure(() => store.readAnonymizedArtifact(f.input.package_id, f.expectation));
    store.recoverAnonymizedStages(); failure(() => store.readAnonymizedArtifact(f.input.package_id, f.expectation));
  });
  await testAsync('links, unknown members and invalid UTF-8 do not become a verified artifact', async () => {
    const f = fixture(); await store.publishAnonymizedArtifact(f.input); const target = folder(f);
    const manifest = path.join(target, 'manifest.json'), alias = path.join(root, 'linked-synthetic-manifest.json');
    fs.linkSync(manifest, alias); failure(() => store.readAnonymizedArtifact(f.input.package_id, f.expectation)); fs.unlinkSync(alias);
    const extra = path.join(target, 'unexpected.txt'); fs.writeFileSync(extra, 'synthetic');
    failure(() => store.readAnonymizedArtifact(f.input.package_id, f.expectation)); fs.unlinkSync(extra);
    fs.writeFileSync(path.join(target, f.created.manifest.document), Buffer.from([0x80]));
    failure(() => store.readAnonymizedArtifact(f.input.package_id, f.expectation));
  });
  await testAsync('actual /4 publication joins immutable document capture, final approval, exact export and fresh reconciliation', async () => {
    const f = fixture('pdf'); const data = process.env.EU_PRIVACY_DATA_ROOT;
    const resultRoot = path.join(root, 'approved-results'); fs.mkdirSync(resultRoot);
    const batchId = f.input.package_id.slice(3).padStart(64, '0');
    const item = { id: f.input.package_id.slice(3), name: 'synthetic-source.pdf', sha256: hash(f.proofInput.source_extraction.markdown), status: 'released' };
    const state = { schema: 'datasecure-batch/7', token: batchId, product_channel: 'standalone', processing_mode: 'markdown-and-anonymize',
      standalone_document_review: true, content_options: f.input.content_options, items: [item] };
    const createReview = () => require('../plugins/data-secure/server/gateway/standalone-document-review-store').createDocumentReviewStore({ dataRoot: data,
      resultRoot: () => resultRoot, expectedDocuments: () => [item] });
    const review = createReview();
    const policy = require('../plugins/data-secure/server/privacy/policy');
    await store.publishAnonymizedArtifact(f.input, { beforePublish(details) {
      review.capture(state, item, { package_id: details.package_id, original_text: f.proofInput.source_extraction.markdown, markdown: f.input.markdown,
        content_options: f.input.content_options, source_type: f.input.source_type, publication_binding: details.publication_binding,
        transform_trace: f.trace, verification_context: { profile: f.input.profile, dictionary: f.proofInput.dictionary,
          strong_person_anchor: f.proofInput.strong_person_anchor, ruleset: policy.PRIVACY_RULESET_VERSION, credential_policy: policy.CREDENTIAL_CONTEXT_POLICY_VERSION,
          person_field_policy: f.created.manifest.person_field_policy, publication_frame: { prefix: '', suffix: '' }, reviewed_ranges: [] } });
      assert.deepEqual(createReview().publicationExpectation(batchId, item.id), f.expectation);
      assert.equal(createReview().list(batchId).documents.length, 0, 'pre-publication basis grants no readable document');
    }, afterPublish() { review.recordPublication(batchId, item.id); } });
    const row = createReview().list(batchId).documents[0]; assert.ok(row); assert.equal(row.approved, false);
    review.decide(batchId, item.id, { action: 'approve', ranges: [], revision: row.revision, output_sha256: row.output_sha256, operation_id: 'd'.repeat(32) });
    const approved = createReview().list(batchId).documents[0]; assert.equal(approved.approved, true);
    const selection = [{ document_id: item.id, revision: approved.revision, output_sha256: approved.output_sha256 }];
    const operationId = 'e'.repeat(32);
    const exported = review.exportApproved(batchId, operationId, selection); assert.equal(exported.exported_count, 1);
    review.exportApproved(batchId, operationId, selection, true);
    const resolved = createReview().resolveExport(batchId, operationId);
    const names = fs.readdirSync(resolved.local_path).filter(name => name.endsWith('.md')); assert.equal(names.length, 1);
    assert.equal(fs.readFileSync(path.join(resolved.local_path, names[0]), 'utf8'), f.input.markdown);
    assert.equal(names[0].includes('synthetic-source'), false);
    const receiptPath = path.join(data, 'document-reviews', batchId, item.id, 'published.json');
    const receipt = fs.readFileSync(receiptPath), parsed = JSON.parse(receipt);
    assert.equal(parsed.schema, 'datasecure-document-publication/2'); assert.deepEqual(parsed.publication_binding, f.expectation);
    fs.writeFileSync(receiptPath, JSON.stringify({ schema: 'datasecure-document-publication/1', package_id: f.input.package_id, output_sha256: f.expectation.document_sha256 }));
    assert.equal(createReview().list(batchId).unavailable.length, 1);
    fs.writeFileSync(receiptPath, receipt);
    fs.writeFileSync(path.join(folder(f), 'manifest.json'), JSON.stringify({ ...f.created.manifest, schema: 'eu-privacy-package/3' }));
    assert.equal(createReview().list(batchId).unavailable.length, 1, 'cached receipt must not skip the /4 reader');
  });
  await testAsync('bound source-coverage notices survive history reconstruction without reading document bodies or granting approvals', async () => {
    const f = fixture('pdf', options('content-v1', true, true), 'general',
      { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED'] });
    const b = batchFixture(f);
    await store.publishAnonymizedArtifact(f.input, { beforePublish: b.capture,
      afterPublish() { b.review.recordPublication(b.state.token, b.item.id); } });
    b.item.status = 'released'; b.item.package_id = f.input.package_id;
    const { anonymizationContentNotices } = require('../plugins/data-secure/server/standalone/anonymization-notices');
    const historyStore = require('../plugins/data-secure/server/gateway/standalone-history-store');
    const { createRunHistory } = require('../plugins/data-secure/server/standalone/run-history');
    const { StandaloneApplicationService } = require('../plugins/data-secure/server/standalone/application-service');
    const expected = { content_notice_count: 1, content_notice_breakdown_complete: true,
      content_notices: [{ name: b.item.name, reason_codes: ['OCR_NOT_VERIFIED'] }] };
    const dependencies = (rows = [b.state]) => ({ readStates: () => rows, readExports: () => [],
      recoverableStates: () => [], liveExecutor: () => false });
    const open = fs.openSync; let bodyReads = 0, metadataReads = 0;
    try {
      fs.openSync = function(file, ...args) {
        if (typeof file === 'string' && file.endsWith('.md')) { bodyReads++; throw Error('BODY_READ_FORBIDDEN'); }
        if (typeof file === 'string' && /document-reviews|standalone-anonymized-artifacts/u.test(file)) metadataReads++;
        return open.call(this, file, ...args);
      };
      assert.deepEqual(anonymizationContentNotices(b.state.token, { state: b.state, expectedCount: 1 }), expected);
      const summary = historyStore.recordStandaloneState(b.state);
      assert.equal(summary.content_notice_count, 1); assert.equal(summary.content_notice_breakdown_complete, true);
      const history = createRunHistory(dependencies());
      const beforePoll = metadataReads;
      assert.equal(history.history().entries.find(row => row.batch_id === b.state.token).content_notice_count, 1);
      const service = new StandaloneApplicationService({ dependencies: { runHistory: history,
        publicStatusSnapshot: () => ({ observed_batch_id: b.state.token, current: { engine_ready: true },
          latest: { processing_mode: 'markdown-and-anonymize', result_count: 1, selected_count: 1, completed_count: 1, complete: true } }) } });
      service.observedBatchId = b.state.token;
      const current = service.status({ localUi: true });
      assert.equal(current.warning_count, 1); assert.equal(current.content_notice_count, 1);
      assert.equal(current.content_notice_breakdown_complete, true);
      assert.equal(metadataReads, beforePoll, 'status and history polls must read only compact summaries, not every artifact');
      const details = history.failures(b.state.token);
      assert.equal(details.total, 0); assert.deepEqual(details.content_notices, expected.content_notices);
      assert.equal(details.content_notice_breakdown_complete, true);
      const retained = createRunHistory(dependencies([]));
      const afterRetention = retained.failures(b.state.token);
      assert.deepEqual(afterRetention.content_notices, expected.content_notices);
      assert.equal(afterRetention.content_notice_breakdown_complete, true,
        'immutable publication/membership metadata reconstructs source coverage after journal retirement');
      assert.equal(bodyReads, 0);
    } finally { fs.openSync = open; }
    assert.equal(f.created.manifest.document_result.grade, 'complete', 'extraction notice does not change privacy proof scope');
    assert.equal(b.review.list(b.state.token).documents[0].approved, false, 'a notice projection cannot create approval');
    const documentService = new StandaloneApplicationService({ dependencies: { documentReviews: b.review,
      runHistory: createRunHistory(dependencies()), readStates: () => [b.state] } });
    assert.equal(documentService.documentReviews(b.state.token).content_notice_count, 1);
    assert.equal(documentService.documentReviews(b.state.token).content_notice_breakdown_complete, true);
    const summaryFile = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'standalone-run-history', `${b.state.token}.json`);
    const summaryBefore = fs.readFileSync(summaryFile);
    const newer = { ...JSON.parse(summaryBefore), selected_count: 2, result_count: 2, completed_count: 2 };
    const rename = fs.renameSync; let concurrentCompletion = false;
    try {
      fs.renameSync = function(from, to, ...args) {
        if (to === path.join(path.dirname(summaryFile), `notices-${b.state.token}.json`)) {
          concurrentCompletion = true; fs.writeFileSync(summaryFile, JSON.stringify(newer));
        }
        return rename.call(this, from, to, ...args);
      };
      assert.equal(historyStore.recordStandaloneContentNoticeSummary(b.state.token,
        { content_notice_count: 0, content_notice_breakdown_complete: false }, 1), true);
      assert.equal(concurrentCompletion, true);
      assert.equal(historyStore.readStandaloneSummary(b.state.token).result_count, 2,
        'a late notice observation never rewrites a newer worker completion');
      assert.deepEqual(historyStore.readStandaloneContentNoticeSummary(b.state.token, 2),
        { content_notice_count: 0, content_notice_breakdown_complete: false },
        'an older observation count is not attached to a newer completion');
    } finally { fs.renameSync = rename; fs.writeFileSync(summaryFile, summaryBefore); }
    try {
      const delayedHistory = createRunHistory({ ...dependencies(), readStates() {
        fs.writeFileSync(summaryFile, JSON.stringify(newer));
        return [b.state];
      } });
      delayedHistory.history();
      assert.equal(historyStore.readStandaloneSummary(b.state.token).result_count, 2,
        'history list reads never persist their older in-memory state over a newer completion');
    } finally { fs.writeFileSync(summaryFile, summaryBefore); }
    const publicationFile = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', b.state.token, b.item.id, 'published.json');
    const receipt = JSON.parse(fs.readFileSync(publicationFile));
    fs.writeFileSync(publicationFile, JSON.stringify({ ...receipt, publication_binding: { ...receipt.publication_binding, manifest_sha256: '0'.repeat(64) } }));
    const broken = anonymizationContentNotices(b.state.token, { state: b.state, expectedCount: 1 });
    assert.deepEqual(broken, { content_notice_count: 0, content_notice_breakdown_complete: false, content_notices: [] },
      'changed publication pin is unknown, never proof of notice-free coverage');
    assert.equal(createRunHistory(dependencies()).failures(b.state.token).content_notice_breakdown_complete, false);
    assert.deepEqual(historyStore.readStandaloneContentNoticeSummary(b.state.token, 1),
      { content_notice_count: 1, content_notice_breakdown_complete: false },
      'lost provenance marks the present audit incomplete but retains the historical known minimum');
    fs.writeFileSync(publicationFile, JSON.stringify(receipt));
    const savedSummary = historyStore.readStandaloneSummary(b.state.token);
    const cacheFile = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'standalone-run-history', `notices-${b.state.token}.json`);
    fs.renameSync(cacheFile, `${cacheFile}.inline-migration-test`);
    fs.writeFileSync(summaryFile, JSON.stringify({ ...savedSummary, content_notice_count: 1, content_notice_breakdown_complete: false }));
    const migrated = historyStore.recordStandaloneState(b.state, { reconstructContentNotices: false });
    assert.equal(migrated.content_notice_count, 1);
    assert.deepEqual(historyStore.readStandaloneContentNoticeSummary(b.state.token, 1),
      { content_notice_count: 1, content_notice_breakdown_complete: false },
      'startup/list capture migrates the earlier inline minimum without reading document bodies');
    const { content_notice_count, content_notice_breakdown_complete, ...legacy } = savedSummary;
    assert.equal(historyStore.validSummary(legacy), true);
    fs.writeFileSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'standalone-run-history', `${b.state.token}.json`), JSON.stringify(legacy));
    fs.writeFileSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'standalone-run-history', `notices-${b.state.token}.json`), '{}');
    assert.deepEqual(historyStore.readStandaloneContentNoticeSummary(b.state.token, 1),
      { content_notice_count: 0, content_notice_breakdown_complete: false }, 'missing or corrupt cached basis remains explicitly unknown');
    assert.deepEqual(anonymizationContentNotices('f'.repeat(64), { expectedCount: 1 }),
      { content_notice_count: 0, content_notice_breakdown_complete: false, content_notices: [] });
    const runManifest = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', b.state.token, 'manifest.json');
    const runBytes = fs.readFileSync(runManifest), manifest = JSON.parse(runBytes);
    for (const rejected of [null, {}, [{ document_id: b.item.id, name: b.item.name, reason_code: 'SOURCE_CONTAINER_CORRUPT' }],
      [{ document_id: 'f'.repeat(32), name: 'synthetic.txt', reason_code: 'ARBITRARY_ERROR' }]]) {
      fs.writeFileSync(runManifest, JSON.stringify({ ...manifest, preflight_rejections: rejected }));
      assert.equal(anonymizationContentNotices(b.state.token, { state: b.state, expectedCount: 1 }).content_notice_breakdown_complete, false,
        'malformed or overlapping run membership never becomes a complete coverage projection');
    }
    fs.writeFileSync(runManifest, runBytes);
  });
  await testAsync('notice-free coverage requires matching real publication evidence, not OCR-switch inference', async () => {
    const f = fixture(), b = batchFixture(f, 'processing', 'automatic-conservative');
    await store.publishAnonymizedArtifact(f.input, { beforePublish: b.capture,
      afterPublish() { b.review.recordPublication(b.state.token, b.item.id); } });
    b.item.status = 'released'; b.item.package_id = f.input.package_id;
    const { anonymizationContentNotices } = require('../plugins/data-secure/server/standalone/anonymization-notices');
    assert.deepEqual(anonymizationContentNotices(b.state.token, { state: b.state, expectedCount: 1 }),
      { content_notice_count: 0, content_notice_breakdown_complete: true, content_notices: [] });
    assert.deepEqual(anonymizationContentNotices(b.state.token, { state: { ...b.state, profile: 'auto' }, expectedCount: 1 }),
      { content_notice_count: 0, content_notice_breakdown_complete: true, content_notices: [] },
      'automatic profile selection permits the actual validated publication profile');
    assert.equal(require('../plugins/data-secure/server/gateway/standalone-history-store').recordStandaloneState(b.state).review_policy,
      'automatic-conservative', 'Fastway /4 membership and terminal coverage snapshot retain the immutable policy');
    const { standalone_review_policy, ...changedPolicyState } = b.state;
    assert.equal(anonymizationContentNotices(b.state.token, { state: changedPolicyState, expectedCount: 1 }).content_notice_breakdown_complete, false);
    assert.equal(anonymizationContentNotices(b.state.token, { state: { ...b.state, profile: 'customer' }, expectedCount: 1 })
      .content_notice_breakdown_complete, false);
    assert.equal(anonymizationContentNotices(b.state.token, { state: b.state, expectedCount: 2 })
      .content_notice_breakdown_complete, false);
  });
  await testAsync('actual pre-rename process death cleans only owned staging, never adopting its uncommitted text', () => crashAt('before'));
  await testAsync('actual post-rename process death recovers the ownership receipt and preserves exact committed bytes', () => crashAt('after'));
  await done(() => safeRemovePrivateTree(path.dirname(root), path.basename(root)));
}
if (worker) workerMain().catch(error => { console.error(error); process.exitCode = 1; });
else main().catch(error => { console.error(error); process.exitCode = 1; });
