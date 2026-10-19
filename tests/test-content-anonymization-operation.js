'use strict';

// Actual saved journal, run anchor, sealed bytes and production batch entry.
// No intake-readiness bypass, converter stub or injected processing lock.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const scope = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-content-operation-'));
for (const [variable, name] of [['EU_PRIVACY_DATA_ROOT', 'data'], ['EU_PRIVACY_ROOT', 'workspace'], ['EU_PRIVACY_RESULT_ROOT', 'results']]) {
  process.env[variable] = path.join(scope, name); fs.mkdirSync(process.env[variable]);
}
process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
const { createSuite } = require('./helpers');
const { createPrivateWorkStore } = require('../plugins/data-secure/server/gateway/private-work-store');
const { copySnapshotFile } = require('../plugins/data-secure/server/gateway/batch-snapshot');
const { createBatchPseudonymState, withBatchPseudonymRegistry } = require('../plugins/data-secure/server/batch-pseudonym-context');
const { createPrivateIoSummary } = require('../plugins/data-secure/server/gateway/performance');
const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const { migrateLegacyBatchState } = require('../plugins/data-secure/server/gateway/batch-private-artifact-migration');
const { createContentOperationAuthority } = require('../plugins/data-secure/server/gateway/content-operation-authority');
const { createBatchActiveLock } = require('../plugins/data-secure/server/gateway/batch-active-lock');
const { exactPendingEntry } = require('../plugins/data-secure/server/gateway/batch-snapshot');
const batch = require('../plugins/data-secure/server/gateway/batch');
const { createContentAbortController, contentAbortChecker } = require('../plugins/data-secure/server/gateway/content-consumer-dependencies');
const { test, testAsync, assert, done } = createSuite('Stored content anonymization operation');
const options = () => ({ schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false });
function fixture(mode = 'markdown-and-anonymize', text = 'Name: Anna Beispiel\nText und Tabellen bleiben Inhalt.\n', extraTexts = []) {
  const token = crypto.randomBytes(32).toString('hex');
  const sources = [text, ...extraTexts].map((entry, index) => {
    const id = crypto.randomBytes(16).toString('hex'), source = path.join(scope, `source-${id}.txt`);
    const bytes = Buffer.from(entry);
    fs.writeFileSync(source, bytes);
    return { source, bytes, item: { id, name: index ? `synthetic-source-${index + 1}.txt` : 'synthetic-source.txt',
      size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      work_name: `${String(index + 1).padStart(3, '0')}_${crypto.randomBytes(12).toString('hex')}.txt`,
      private_artifact_plain: true, status: 'pending', checkpoint: 'sealed' } };
  });
  const state = { schema: 'datasecure-batch/7', token, product_channel: 'standalone', processing_mode: mode,
    standalone_document_review: true, content_options: options(), profile: 'general', remove_images: false,
    created_at: '2026-10-14T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z', io_summary: createPrivateIoSummary(),
    ...(mode === 'markdown-and-anonymize' ? { ...createBatchPseudonymState({ productChannel: 'standalone' }), output_naming_mode: 'neutral' } : {}),
    items: sources.map(entry => entry.item) };
  const work = batch._test.workPath(token); fs.mkdirSync(work, { mode: 0o700 });
  const store = createPrivateWorkStore({ privateRoot: batch._test.batchRoot() });
  for (const entry of sources) copySnapshotFile(entry.source, path.join(work, entry.item.work_name), fs.statSync(entry.source),
    { privateWorkStore: store, expectedSha256: entry.item.sha256 });
  batch._test.writeState(state); createDocumentReviewStore().captureRun(state);
  return { state, source: sources[0].source, bytes: sources[0].bytes, sources, work, item: state.items[0], store };
}
function authorizedFixture(kind = 'publication', text, extraTexts = []) {
  const f = fixture('markdown-and-anonymize', text, extraTexts);
  for (const item of f.state.items) {
    item.status = kind === 'capture' ? 'deferred_review' : 'processing';
    item.checkpoint = kind === 'capture' ? 'awaiting_local_review' : 'processing_started';
  }
  batch._test.writeState(f.state);
  const active = new Set([f.state.token]), lock = createBatchActiveLock({ lockPath: () => path.join(f.work, 'test-owner.lock') });
  lock.acquireActiveLock(f.state.token);
  const services = { active, readStateForMaintenance: batch._test.readStateForMaintenance, writeState: batch._test.writeState,
    captureOwnedEpoch: lock.captureOwnedEpoch, assertOwnedEpoch: lock.assertOwnedEpoch,
    documentReview: createDocumentReviewStore(), exactPendingEntry: (state, item) => exactPendingEntry(state, item,
      { privateWorkStore: f.store, workPath: () => f.work }) };
  return { ...f, active, lock, services, authority: createContentOperationAuthority(services),
    release() { lock.releaseActiveLock(f.state.token); } };
}

async function preparedFixture(f, frame = { prefix: '', suffix: '' }, decision = 'keep', itemIndex = 0) {
  const context = f.authority.consume(f.authority.issue(f.state.token, f.state.items[itemIndex].id, 'publication'));
  try {
    const state = batch._test.readStateForMaintenance(f.state.token), review = createDocumentReviewStore();
    const bytes = f.sources[itemIndex].bytes;
    return await withBatchPseudonymRegistry(state, async registry => {
      const kernel = require('../plugins/data-secure/server/gateway/privacy-text-operation');
      const operation = kernel.prepareTextPrivacyReview({ text: bytes.toString('utf8'), profile: 'general',
        productChannel: 'standalone', consumerOptions: { productChannel: 'standalone', contentOptions: state.content_options }, registry, captureTrace: true });
      const text = await kernel.resolveTextPrivacyReview(operation, draft => require('../plugins/data-secure/server/gateway/batch-review-policy')
        .reviewedBatchText(draft, draft.ambiguities.map(row => ({ ambiguity_id: row.ambiguity_id, decision }))));
      const finalized = kernel.finalizeTextPrivacyReview(operation, text, frame);
      const artifactModule = require('../plugins/data-secure/server/standalone/anonymized-artifact');
      const extraction = require('../plugins/data-secure/server/core/source-extraction-contract').createSourceExtraction({ source_type: 'txt',
        markdown: finalized.original_text, content_options: state.content_options, coverage: { status: 'complete', reason_codes: [] } },
        require('../plugins/data-secure/server/resource-limits').RESOURCE_LIMITS.MAX_TEXT_CHARS);
      const proof = artifactModule.verifyAnonymizedPublication({ markdown: finalized.markdown, profile: 'general', content_options: state.content_options,
        source_extraction: extraction, dictionary: finalized.dictionary, strong_person_anchor: finalized.strong_person_anchor,
        reviewed_person_candidates: finalized.reviewed_person_candidates });
      const input = { package_id: context.package_id, content_options: state.content_options, source_type: 'txt', profile: 'general',
        operation_id: context.operation_id, created_at: context.created_at, coverage: extraction.coverage, markdown: finalized.markdown, verification_proof: proof };
      const artifact = artifactModule.createAnonymizedArtifact(input);
      const audit = require('../plugins/data-secure/server/gateway/audit');
      const receipt = audit.sanitizeReceipt({ operation_id: context.operation_id, timestamp: context.created_at,
        gateway_version: artifact.manifest.gateway_version, privacy_ruleset: artifact.manifest.privacy_ruleset,
        credential_context_policy: artifact.manifest.credential_context_policy, profile: 'general', source_extension: '.txt', source_bytes: bytes.length,
        result: 'released', document_result: artifact.manifest.document_result, text_entity_count: operation.entityCount, privacy_passes: operation.passes,
        residual_pii_verification: 'passed', reidentification_risk: operation.reidentificationRisk });
      const basis = { package_id: context.package_id, content_options: state.content_options, source_type: 'txt', original_text: finalized.original_text,
        markdown: finalized.markdown, transform_trace: finalized.transform_trace, verification_context: finalized.verification_context,
        publication_binding: artifact.expectation };
      const prepared = { manifest_json: JSON.stringify(artifact.manifest), audit_receipt: receipt,
        registry_commit: context.commitPreparedRegistry(registry, artifact.expectation.manifest_sha256) };
      return { context, state, item: state.items[itemIndex], review, basis, prepared, input, artifact };
    });
  } catch (error) { context.dispose(); throw error; }
}

function freshReplay(f) {
  // Real separate Node process: no inherited ticket, proof, registry object,
  // weak map or acquisition. The journal, Run, source and records are real.
  const script = `const path=require('node:path'),fs=require('node:fs');
    const root=path.resolve('plugins/data-secure/server'),batch=require(root+'/gateway/batch');
    const {createDocumentReviewStore}=require(root+'/gateway/standalone-document-review-store');
    const {createContentOperationAuthority}=require(root+'/gateway/content-operation-authority');
    const {createBatchActiveLock}=require(root+'/gateway/batch-active-lock');
    const {createPrivateWorkStore}=require(root+'/gateway/private-work-store');
    const {exactPendingEntry}=require(root+'/gateway/batch-snapshot');
    const token=process.argv[1],work=process.argv[2],state=batch._test.readStateForMaintenance(token),item=state.items[0];
    const review=createDocumentReviewStore(),lock=createBatchActiveLock({lockPath:()=>path.join(work,'test-owner.lock')});
    lock.acquireActiveLock(token);let context;
    try {const authority=createContentOperationAuthority({active:new Set([token]),readStateForMaintenance:batch._test.readStateForMaintenance,
      writeState:batch._test.writeState,captureOwnedEpoch:lock.captureOwnedEpoch,assertOwnedEpoch:lock.assertOwnedEpoch,documentReview:review,
      exactPendingEntry:(s,i)=>exactPendingEntry(s,i,{privateWorkStore:createPrivateWorkStore({privateRoot:batch._test.batchRoot()}),workPath:()=>work})});
      context=authority.consume(authority.issue(token,item.id,'publication'));
      const replay=review.preparedReplay(state,item,context);
      process.stdout.write(JSON.stringify(replay?{manifest_json:JSON.stringify(require(root+'/standalone/anonymized-artifact').createAnonymizedArtifact(replay.publication_input).manifest),
        markdown:replay.publication_input.markdown,audit:replay.audit_receipt}:null));
    } catch(error) {process.stdout.write(JSON.stringify({error:error.code||'UNKNOWN'}));}
    finally {context?.dispose();lock.releaseActiveLock(token);}`;
  const child = require('node:child_process').spawnSync(process.execPath, ['-e', script, f.state.token, f.work],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  assert.equal(child.status, 0, child.stderr); return JSON.parse(child.stdout);
}

test('current /7 states for both purposes are not legacy migrations and remain byte-equal', () => {
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const f = fixture(mode), before = JSON.stringify(f.state); let writes = 0, reads = 0;
    assert.equal(migrateLegacyBatchState(f.state, { writeState() { writes++; },
      privateWorkStore: { readFile() { reads++; throw Error('unexpected migration read'); } } }), f.state);
    assert.equal(JSON.stringify(f.state), before); assert.equal(writes, 0); assert.equal(reads, 0);
    assert.deepEqual(fs.readFileSync(f.source), f.bytes);
  }
});

test('current /7 refuses encrypted markers and malformed purpose without reading or rewriting bytes', () => {
  for (const change of [state => { state.items[0].private_artifact_encrypted = false; },
    state => { state.items[0].legacy_work_name = state.items[0].work_name; },
    state => { state.items[0].work_name = '001_' + 'a'.repeat(24) + '.dsart'; },
    state => { state.processing_mode = 'unknown'; }, state => { state.content_options.imageOcr = 'false'; }]) {
    const f = fixture(), changed = JSON.parse(JSON.stringify(f.state)); change(changed);
    const before = JSON.stringify(changed); let effects = 0;
    assert.throws(() => migrateLegacyBatchState(changed, { writeState() { effects++; },
      privateWorkStore: { readFile() { effects++; } } }));
    assert.equal(effects, 0); assert.equal(JSON.stringify(changed), before);
    assert.deepEqual(fs.readFileSync(f.source), f.bytes);
  }
});

test('owned source and context are immutable and tickets are process-local, instance-bound and single-use', () => {
  const f = authorizedFixture(); let context;
  try {
    const ticket = f.authority.issue(f.state.token, f.item.id, 'publication');
    assert.deepEqual(Object.keys(ticket), []); assert.ok(Object.isFrozen(ticket));
    const foreign = createContentOperationAuthority(f.services);
    for (const fake of [{}, { ...ticket }, JSON.parse(JSON.stringify(ticket)), new Proxy({}, {}), true])
      assert.throws(() => f.authority.consume(fake), error => error.code === 'CONTENT_OPTIONS_BINDING_INVALID');
    assert.throws(() => foreign.consume(ticket), error => error.code === 'CONTENT_OPTIONS_BINDING_INVALID');
    f.state.profile = 'customer'; f.state.content_options.imageOcr = true; f.item.name = 'caller-mutated.txt';
    context = f.authority.consume(ticket);
    assert.equal(context.profile, 'general'); assert.equal(context.content_options.imageOcr, false);
    assert.equal(context.source_name, 'synthetic-source.txt'); assert.ok(Object.isFrozen(context));
    assert.equal(Object.hasOwn(context, 'pseudonym_seed'), false);
    const owned = context.takeSourceBytes(); assert.deepEqual(owned, f.bytes);
    assert.throws(() => context.takeSourceBytes()); assert.throws(() => f.authority.consume(ticket));
    context.dispose(); assert.ok(owned.every(byte => byte === 0)); assert.throws(() => context.revalidate());
    assert.deepEqual(fs.readFileSync(f.source), f.bytes);
  } finally { context?.dispose(); f.release(); }
});

test('actual journal, run membership and acquisition are rechecked after issuance and before use', () => {
  for (const change of ['journal', 'anchor', 'epoch', 'active', 'source']) {
    const f = authorizedFixture();
    try {
      const ticket = f.authority.issue(f.state.token, f.item.id, 'publication');
      if (change === 'journal') {
        const stored = batch._test.readStateForMaintenance(f.state.token); stored.profile = 'customer'; batch._test.writeState(stored);
      } else if (change === 'anchor') {
        const target = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', f.state.token, 'manifest.json');
        const value = JSON.parse(fs.readFileSync(target)); value.documents[0].name = 'other.txt'; fs.writeFileSync(target, JSON.stringify(value));
      } else if (change === 'epoch') { f.release(); f.lock.acquireActiveLock(f.state.token); }
      else if (change === 'active') f.active.clear();
      else { // Source changes before issuance must not be accepted through a stale queue.
        fs.writeFileSync(path.join(f.work, f.item.work_name), 'changed snapshot');
        assert.throws(() => f.authority.issue(f.state.token, f.item.id, 'publication'));
        // The already issued owned snapshot is still the verified old source.
        const context = f.authority.consume(ticket); assert.deepEqual(context.takeSourceBytes(), f.bytes); context.dispose(); continue;
      }
      assert.throws(() => f.authority.consume(ticket), error => error.code === 'CONTENT_OPTIONS_BINDING_INVALID');
      assert.throws(() => f.authority.consume(ticket));
      assert.deepEqual(fs.readFileSync(f.source), f.bytes);
    } finally { f.release(); }
  }
});

test('scope and durable item phase are bound, while normal checkpoint/registry updates remain possible', () => {
  for (const kind of ['capture', 'publication']) {
    const f = authorizedFixture(kind); let context;
    try {
      assert.throws(() => f.authority.issue(f.state.token, f.item.id, kind === 'capture' ? 'publication' : 'capture'));
      const ticket = f.authority.issue(f.state.token, f.item.id, kind), duplicate = f.authority.issue(f.state.token, f.item.id, kind);
      context = f.authority.consume(ticket); assert.equal(context.kind, kind);
      const operationId = context.operation_id, stored = batch._test.readStateForMaintenance(f.state.token);
      if (kind === 'publication') stored.items[0].checkpoint = 'package_verified';
      const seed = Buffer.from(stored.pseudonym_seed, 'base64url');
      const registry = require('../plugins/data-secure/server/batch-pseudonym-registry').createBatchPseudonymRegistry(seed,
        { contractVersion: stored.pseudonym_contract_version, rulesetVersion: stored.pseudonym_ruleset_version, persistedState: stored.pseudonym_registry_state });
      try { registry.assign('PERSON', 'Anna Beispiel'); stored.pseudonym_registry_state = registry.exportState(); }
      finally { registry.dispose(); seed.fill(0); }
      batch._test.writeState(stored); assert.equal(context.revalidate(), true);
      const second = f.authority.consume(duplicate); assert.equal(second.operation_id, operationId); second.dispose();
      stored.items[0].status = 'stopped'; stored.items[0].checkpoint = 'stopped'; stored.items[0].error_code = 'SOURCE_READ_FAILED';
      stored.items[0].document_result = require('../plugins/data-secure/server/gateway/document-result-grade').notProcessedDocumentResult('SOURCE_READ_FAILED');
      batch._test.writeState(stored); assert.throws(() => context.revalidate());
    } finally { context?.dispose(); f.release(); }
  }
});

test('a changed owned decoder buffer or loss of the active scope revokes a consumed operation', () => {
  for (const change of ['bytes', 'active']) {
    const f = authorizedFixture(); let context;
    try {
      context = f.authority.consume(f.authority.issue(f.state.token, f.item.id, 'publication'));
      const bytes = context.takeSourceBytes();
      if (change === 'bytes') bytes[0] ^= 1; else f.active.clear();
      assert.throws(() => context.revalidate(), error => error.code === 'CONTENT_OPTIONS_BINDING_INVALID');
      assert.ok(bytes.every(byte => byte === 0)); assert.throws(() => context.revalidate());
      assert.deepEqual(fs.readFileSync(f.source), f.bytes);
    } finally { context?.dispose(); f.release(); }
  }
});

async function main() {
  await testAsync('prepared records replay exact manifest, final Markdown and audit in a fresh process without publication authority', async () => {
    const f = authorizedFixture(); let p;
    try {
      p = await preparedFixture(f);
      assert.equal(p.review.preparedReplay(p.state, p.item, p.context), null);
      assert.equal(p.review.capturePrepared(p.state, p.item, p.basis, p.prepared, p.context), p.artifact.expectation.document_sha256);
      assert.equal(p.review.capturePrepared(p.state, p.item, p.basis, p.prepared, p.context), p.artifact.expectation.document_sha256);
      const replay = p.review.preparedReplay(p.state, p.item, p.context);
      assert.deepEqual(replay.audit_receipt, p.prepared.audit_receipt);
      assert.equal(JSON.stringify(replay.artifact.manifest), p.prepared.manifest_json);
      assert.notEqual(replay.publication_input.verification_proof, p.input.verification_proof, 'fresh proof, not stored passed flag');
      assert.equal(fs.existsSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'standalone-anonymized-artifacts')), false);
      p.context.dispose(); f.release();
      const cold = freshReplay(f);
      assert.equal(cold.manifest_json, p.prepared.manifest_json); assert.equal(cold.markdown, p.basis.markdown);
      assert.deepEqual(cold.audit, p.prepared.audit_receipt); assert.deepEqual(fs.readFileSync(f.source), f.bytes);
    } finally { p?.context.dispose(); f.release(); }
  });
  await testAsync('prepared replay preserves confirmed Keep and technical-frame coordinates through the shared final gate', async () => {
    const f = authorizedFixture('publication', 'Service Level bleibt sachlicher Inhalt.\nName: Anna Beispiel\n'); let p;
    try {
      p = await preparedFixture(f, { prefix: '> Lokaler Hinweis\n\n', suffix: '\n' });
      assert.match(p.basis.markdown, /Service Level/u); assert.doesNotMatch(p.basis.markdown, /Anna Beispiel/u);
      p.review.capturePrepared(p.state, p.item, p.basis, p.prepared, p.context);
      assert.equal(p.review.preparedReplay(p.state, p.item, p.context).artifact.markdown, p.basis.markdown);
      const bad = JSON.parse(JSON.stringify(p.basis)); bad.verification_context.reviewed_ranges = [{ start: 0, end: 2 }];
      assert.throws(() => p.review.capturePrepared(p.state, p.item, bad, p.prepared, p.context));
    } finally { p?.context.dispose(); f.release(); }
  });
  await testAsync('registry-only crash is unprepared; either missing prepared component fails closed in a fresh process', async () => {
    for (const crash of ['registry', 'prepared', 'basis']) {
      const f = authorizedFixture(); let p;
      try {
        p = await preparedFixture(f);
        if (crash !== 'registry') {
          const doc = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', f.state.token, f.item.id);
          if (crash === 'basis') p.review.capture(p.state, p.item, p.basis);
          else {
            // Bounded failure injection: interrupt the actual create-only
            // private writer after the prepared commit, before base creation.
            const original = f.services.assertOwnedEpoch;
            const basisPath = path.join(doc, 'base.json');
            const preparedPath = path.join(doc, 'prepared-publication.json');
            f.services.assertOwnedEpoch = epoch => {
              original(epoch);
              if (fs.existsSync(preparedPath) && !fs.existsSync(basisPath)) throw Error('interrupted after durable prepared write');
            };
            assert.throws(() => p.review.capturePrepared(p.state, p.item, p.basis, p.prepared, p.context));
            assert.equal(fs.existsSync(preparedPath), true); assert.equal(fs.existsSync(basisPath), false);
            f.services.assertOwnedEpoch = original;
          }
        }
        p.context.dispose(); f.release();
        const cold = freshReplay(f);
        if (crash === 'registry') assert.equal(cold, null);
        else assert.ok(cold.error, 'partial/corrupt preparation is named, not silently recreated');
      } finally { p?.context.dispose(); f.release(); }
    }
  });
  await testAsync('false preparation authority and foreign graphs are rejected before getters or private record writes', async () => {
    const f = authorizedFixture(); let p;
    try {
      p = await preparedFixture(f); let effects = 0;
      const bad = new Proxy({}, { ownKeys() { effects++; return []; }, get() { effects++; return undefined; } });
      for (const context of [null, {}, { ...p.context }, new Proxy(p.context, {})]) {
        assert.throws(() => p.review.capturePrepared(p.state, p.item, bad, bad, context));
        assert.throws(() => p.review.preparedReplay(p.state, p.item, context));
      }
      assert.equal(effects, 0);
      const accessor = { ...p.basis }; Object.defineProperty(accessor, 'markdown', { enumerable: true, get() { effects++; } });
      assert.throws(() => p.review.capturePrepared(p.state, p.item, accessor, p.prepared, p.context));
      assert.equal(effects, 0);
      assert.equal(fs.existsSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', f.state.token, f.item.id)), false);
    } finally { p?.context.dispose(); f.release(); }
  });
  await testAsync('independent preparation owner prevents false first processing after both files or the whole document folder are lost', async () => {
    for (const loss of ['files', 'folder', 'owner-only']) {
      const f = authorizedFixture(); let p;
      try {
        p = await preparedFixture(f);
        const doc = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', f.state.token, f.item.id);
        const owner = path.join(path.dirname(doc), `prepared-${f.item.id}.json`);
        if (loss === 'owner-only') {
          const original = f.services.assertOwnedEpoch;
          f.services.assertOwnedEpoch = epoch => {
            original(epoch); if (fs.existsSync(owner) && !fs.existsSync(doc)) throw Error('interrupted after owner commit');
          };
          assert.throws(() => p.review.capturePrepared(p.state, p.item, p.basis, p.prepared, p.context));
          assert.equal(fs.existsSync(owner), true); assert.equal(fs.existsSync(doc), false);
          f.services.assertOwnedEpoch = original;
        } else {
          p.review.capturePrepared(p.state, p.item, p.basis, p.prepared, p.context);
          const renameSynthetic = source => {
            const target = source + '.simulated-loss';
            assert.ok(path.resolve(source).startsWith(scope + path.sep) && path.resolve(target).startsWith(scope + path.sep));
            assert.equal(fs.lstatSync(source).isSymbolicLink(), false); assert.equal(fs.existsSync(target), false);
            fs.renameSync(source, target);
          };
          if (loss === 'folder') renameSynthetic(doc);
          else for (const name of ['base.json', 'prepared-publication.json']) renameSynthetic(path.join(doc, name));
        }
        p.context.dispose(); f.release();
        assert.equal(freshReplay(f).error, 'DOCUMENT_REVIEW_CONFLICT');
        assert.deepEqual(fs.readFileSync(f.source), f.bytes);
      } finally { p?.context.dispose(); f.release(); }
    }
  });
  await testAsync('prepared record corruption and policy/frame changes cannot reissue a publication proof', async () => {
    for (const change of [record => { record.audit_receipt.operation_id = crypto.randomUUID(); },
      record => { record.registry_commit.core_policy_fingerprint = '0'.repeat(64); },
      record => { record.source_context.privacy_input_sha256 = '0'.repeat(64); },
      record => { record.manifest_json += ' '; }, record => { record.extra = true; }]) {
      const f = authorizedFixture(); let p;
      try {
        p = await preparedFixture(f); p.review.capturePrepared(p.state, p.item, p.basis, p.prepared, p.context);
        const file = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', f.state.token, f.item.id, 'prepared-publication.json');
        const record = JSON.parse(fs.readFileSync(file)); change(record); fs.writeFileSync(file, JSON.stringify(record));
        assert.throws(() => p.review.preparedReplay(p.state, p.item, p.context));
      } finally { p?.context.dispose(); f.release(); }
    }
  });
  await testAsync('present falsy or malformed owners are conflicts, never evidence of an unprepared document', async () => {
    for (const corrupted of [null, false, 0, '', [], {}, { schema: 'datasecure-prepared-publication-owner/1' }]) {
      const f = authorizedFixture(); let p;
      try {
        p = await preparedFixture(f);
        const owner = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', f.state.token, `prepared-${f.item.id}.json`);
        fs.writeFileSync(owner, JSON.stringify(corrupted));
        assert.throws(() => p.review.preparedReplay(p.state, p.item, p.context), e => e.code === 'DOCUMENT_REVIEW_CONFLICT');
        assert.throws(() => p.review.capturePrepared(p.state, p.item, p.basis, p.prepared, p.context), e => e.code === 'DOCUMENT_REVIEW_CONFLICT');
        p.context.dispose(); f.release(); assert.equal(freshReplay(f).error, 'DOCUMENT_REVIEW_CONFLICT');
      } finally { p?.context.dispose(); f.release(); }
    }
  });
  await testAsync('prepared replay after actual rename and lost confirmation retains exactly two artifact files and one audit operation', async () => {
    const f = authorizedFixture(); let p;
    try {
      p = await preparedFixture(f); p.review.capturePrepared(p.state, p.item, p.basis, p.prepared, p.context);
      const replay = p.review.preparedReplay(p.state, p.item, p.context);
      await assert.rejects(require('../plugins/data-secure/server/standalone/anonymized-store').publishAnonymizedArtifact(replay.publication_input,
        { beforePublish() { p.context.revalidate(); }, afterPublish() { throw Error('lost confirmation after rename'); } }),
        error => error.code === 'BATCH_PUBLICATION_UNCONFIRMED');
      const folder = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'standalone-anonymized-artifacts', 'Output', p.basis.package_id);
      assert.deepEqual(fs.readdirSync(folder).sort(), [p.basis.package_id + '.md', 'manifest.json'].sort());
      assert.equal(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'), p.prepared.manifest_json);
      p.context.dispose(); f.release(); const cold = freshReplay(f);
      assert.equal(cold.manifest_json, p.prepared.manifest_json);
      const audit = require('../plugins/data-secure/server/gateway/audit');
      assert.equal(audit.retainAudit(cold.audit), true); assert.equal(audit.retainAudit(cold.audit), true);
      const files = fs.readdirSync(require('../plugins/data-secure/server/gateway/common').roots().audit)
        .filter(name => name.includes(cold.audit.operation_id));
      assert.equal(files.length, 1); assert.deepEqual(fs.readFileSync(f.source), f.bytes);
    } finally { p?.context.dispose(); f.release(); }
  });
  await testAsync('prepared registry witness is minted only after actual durable readback and survives compatible growth without reassignment', async () => {
    const f = authorizedFixture(); let context, replay;
    try {
      context = f.authority.consume(f.authority.issue(f.state.token, f.item.id, 'publication'));
      const sha = 'a'.repeat(64), durable = batch._test.readStateForMaintenance(f.state.token);
      let witness;
      await withBatchPseudonymRegistry(durable, async registry => {
        registry.assign('PERSON', 'Anna Beispiel');
        witness = context.commitPreparedRegistry(registry, sha);
        assert.deepEqual(context.commitPreparedRegistry(registry, sha), witness, 'exact duplicate commit');
        assert.equal(context.assertPreparedRegistryCommit(witness, sha), true);
        assert.throws(() => context.commitPreparedRegistry(registry, 'b'.repeat(64)));
      });
      const committed = batch._test.readStateForMaintenance(f.state.token);
      const seed = Buffer.from(committed.pseudonym_seed, 'base64url');
      const native = require('../plugins/data-secure/server/batch-pseudonym-registry').createBatchPseudonymRegistry(seed,
        { contractVersion: committed.pseudonym_contract_version, rulesetVersion: committed.pseudonym_ruleset_version,
          persistedState: committed.pseudonym_registry_state });
      try {
        assert.equal(native.lookup('PERSON', 'Anna Beispiel'), '[PERSON_001]');
        assert.equal(native.assign('PERSON', 'Berta Muster'), '[PERSON_002]');
        committed.pseudonym_registry_state = native.exportState(); batch._test.writeState(committed);
      } finally { native.dispose(); seed.fill(0); }
      replay = f.authority.consume(f.authority.issue(f.state.token, f.item.id, 'publication'));
      assert.equal(replay.assertPreparedRegistryCommit(witness, sha), true);
      assert.notEqual(committed.pseudonym_registry_state.known_alias_index.attestation, witness.registry_state.known_alias_index.attestation);
      assert.deepEqual(batch._test.readStateForMaintenance(f.state.token).pseudonym_registry_state, committed.pseudonym_registry_state,
        'replay performs no assignment, rollback or journal write');
      assert.deepEqual(fs.readFileSync(f.source), f.bytes);
    } finally { context?.dispose(); replay?.dispose(); f.release(); }
  });
  await testAsync('missing durable registry readback or lost acquisition cannot mint a prepared witness', async () => {
    for (const lost of ['write', 'epoch']) {
      const f = authorizedFixture(); let context;
      try {
        f.services.writeState = lost === 'write' ? () => {} : state => {
          batch._test.writeState(state); f.release(); f.lock.acquireActiveLock(f.state.token);
        };
        context = f.authority.consume(f.authority.issue(f.state.token, f.item.id, 'publication'));
        await assert.rejects(withBatchPseudonymRegistry(batch._test.readStateForMaintenance(f.state.token), async registry => {
          registry.assign('PERSON', 'Anna Beispiel');
          assert.throws(() => context.commitPreparedRegistry(registry, 'a'.repeat(64)), e => e.code === 'CONTENT_OPTIONS_BINDING_INVALID');
        }), e => e.code === 'DOCUMENT_REVIEW_CONFLICT');
        assert.equal(fs.existsSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', f.state.token, f.item.id)), false);
      } finally { context?.dispose(); f.release(); }
    }
  });
  await testAsync('invalid manifest hashes never write or poison the actual registry commit and invoke no proxy coercion', async () => {
    const f = authorizedFixture(); let context;
    try {
      const originalWrite = f.services.writeState; let writes = 0, effects = 0;
      f.services.writeState = state => { writes++; originalWrite(state); };
      context = f.authority.consume(f.authority.issue(f.state.token, f.item.id, 'publication'));
      await withBatchPseudonymRegistry(batch._test.readStateForMaintenance(f.state.token), async registry => {
        registry.assign('PERSON', 'Anna Beispiel');
        for (const value of ['invalid-sha', 42, null, new Proxy({}, { get() { effects++; throw Error('proxy coercion'); } })]) {
          assert.throws(() => context.commitPreparedRegistry(registry, value));
          assert.throws(() => context.assertPreparedRegistryCommit({}, value));
        }
        assert.equal(writes, 0); assert.equal(effects, 0);
        const witness = context.commitPreparedRegistry(registry, 'a'.repeat(64));
        assert.equal(writes, 1); assert.equal(context.assertPreparedRegistryCommit(witness, 'a'.repeat(64)), true);
      });
    } finally { context?.dispose(); f.release(); }
  });
  await testAsync('ownership snapshot mutation cannot bypass stale detection or roll back a durable label reservation', async () => {
    const f = authorizedFixture(); let context;
    try {
      context = f.authority.consume(f.authority.issue(f.state.token, f.item.id, 'publication'));
      const original = batch._test.readStateForMaintenance(f.state.token);
      let newer;
      await assert.rejects(withBatchPseudonymRegistry(original, async registry => {
        newer = batch._test.readStateForMaintenance(f.state.token);
        const seed = Buffer.from(newer.pseudonym_seed, 'base64url');
        const other = require('../plugins/data-secure/server/batch-pseudonym-registry').createBatchPseudonymRegistry(seed,
          { contractVersion: newer.pseudonym_contract_version, rulesetVersion: newer.pseudonym_ruleset_version });
        let reservation;
        try { other.assign('PERSON', 'Berta Muster'); reservation = other.exportState().labels[0]; }
        finally { other.dispose(); seed.fill(0); }
        newer.pseudonym_registry_state = JSON.parse(JSON.stringify(registry.exportState()));
        newer.pseudonym_registry_state.labels.push(reservation); batch._test.writeState(newer);
        assert.throws(() => context.commitPreparedRegistry(registry, 'a'.repeat(64)));
        const snapshot = require('../plugins/data-secure/server/batch-pseudonym-context').ownedRegistrySnapshot(registry, original);
        assert.throws(() => snapshot.initial.labels.push(reservation), TypeError);
        assert.throws(() => snapshot.initial.bindings.push(['A'.repeat(43), reservation[0]]), TypeError);
        assert.throws(() => context.commitPreparedRegistry(registry, 'a'.repeat(64)));
        assert.deepEqual(batch._test.readStateForMaintenance(f.state.token).pseudonym_registry_state, newer.pseudonym_registry_state);
      }, { persist: batch._test.writeState }), e => e.code === 'DOCUMENT_REVIEW_CONFLICT');
      assert.deepEqual(batch._test.readStateForMaintenance(f.state.token).pseudonym_registry_state, newer.pseudonym_registry_state,
        'the complete finally path cannot overwrite a refused newer reservation');
    } finally { context?.dispose(); f.release(); }
  });
  await testAsync('actual new durable batch scope checks the fresh registry before its final write even without a prepared commit', async () => {
    const f = fixture(); batch._test.acquireActiveLock(f.state.token);
    try {
      let newer;
      await assert.rejects(batch._test.withDurableBatchPseudonymRegistry(batch._test.readStateForMaintenance(f.state.token), async registry => {
        newer = batch._test.readStateForMaintenance(f.state.token);
        const seed = Buffer.from(newer.pseudonym_seed, 'base64url');
        const other = require('../plugins/data-secure/server/batch-pseudonym-registry').createBatchPseudonymRegistry(seed,
          { contractVersion: newer.pseudonym_contract_version, rulesetVersion: newer.pseudonym_ruleset_version });
        try {
          other.assign('PERSON', 'Berta Muster');
          newer.pseudonym_registry_state = JSON.parse(JSON.stringify(registry.exportState()));
          newer.pseudonym_registry_state.labels.push(other.exportState().labels[0]);
        } finally { other.dispose(); seed.fill(0); }
        batch._test.writeState(newer); assert.equal(registry.exportState().labels.length, 0);
      }), e => e.code === 'DOCUMENT_REVIEW_CONFLICT');
      assert.deepEqual(batch._test.readStateForMaintenance(f.state.token).pseudonym_registry_state, newer.pseudonym_registry_state);
    } finally { batch._test.releaseActiveLock(f.state.token); }
  });
  await testAsync('a valid later conflicting alias stops replay rather than restoring the older witness registry', async () => {
    const f = authorizedFixture(); let context;
    try {
      context = f.authority.consume(f.authority.issue(f.state.token, f.item.id, 'publication')); let witness;
      await withBatchPseudonymRegistry(batch._test.readStateForMaintenance(f.state.token), async registry => {
        const first = registry.assign('PERSON', 'Anna Beispiel'); registry.remember('PERSON', 'Beispiel', first);
        witness = context.commitPreparedRegistry(registry, 'a'.repeat(64));
      });
      const current = batch._test.readStateForMaintenance(f.state.token);
      await withBatchPseudonymRegistry(current, async registry => {
        const second = registry.assign('PERSON', 'Berta Beispiel'); registry.remember('PERSON', 'Beispiel', second);
        assert.match(registry.lookup('PERSON', 'Beispiel'), /^\[PERSON_UNKLAR_/u);
      }, { persist: batch._test.writeState });
      const before = JSON.stringify(batch._test.readStateForMaintenance(f.state.token).pseudonym_registry_state);
      assert.throws(() => context.assertPreparedRegistryCommit(witness, 'a'.repeat(64)));
      assert.equal(JSON.stringify(batch._test.readStateForMaintenance(f.state.token).pseudonym_registry_state), before);
    } finally { context?.dispose(); f.release(); }
  });
  await testAsync('prepared witness rejects foreign registries and malformed or conflicting saved state without invoking getters', async () => {
    const f = authorizedFixture(); let context;
    try {
      context = f.authority.consume(f.authority.issue(f.state.token, f.item.id, 'publication'));
      let effects = 0;
      const fake = { get exportState() { effects++; throw Error('foreign getter'); } };
      assert.throws(() => context.commitPreparedRegistry(fake, 'a'.repeat(64))); assert.equal(effects, 0);
      let witness;
      await withBatchPseudonymRegistry(batch._test.readStateForMaintenance(f.state.token), async registry => {
        registry.assign('PERSON', 'Anna Beispiel'); witness = context.commitPreparedRegistry(registry, 'a'.repeat(64));
      });
      for (const change of [row => { row.document_id = 'f'.repeat(32); }, row => { row.manifest_sha256 = 'b'.repeat(64); },
        row => { row.registry_state.bindings.pop(); }, row => { row.registry_state.labels[0][1] = 'A'.repeat(43); },
        row => { row.registry_state.known_alias_index.attestation = 'A'.repeat(43); },
        row => { row.extra = true; }, row => Object.defineProperty(row, 'authentication', { enumerable: true, get() { effects++; } })]) {
        const corrupted = JSON.parse(JSON.stringify(witness)); change(corrupted);
        assert.throws(() => context.assertPreparedRegistryCommit(corrupted, 'a'.repeat(64)));
      }
      assert.throws(() => context.assertPreparedRegistryCommit(new Proxy(witness, { ownKeys() { effects++; return []; } }), 'a'.repeat(64)));
      assert.equal(effects, 0);
      const stored = batch._test.readStateForMaintenance(f.state.token);
      stored.pseudonym_registry_state.known_alias_index.attestation = 'A'.repeat(43); batch._test.writeState(stored);
      assert.throws(() => context.assertPreparedRegistryCommit(witness, 'a'.repeat(64)), e => e.code === 'DOCUMENT_REVIEW_CONFLICT');
    } finally { context?.dispose(); f.release(); }
  });
  await testAsync('post-publication ownership check does not widen pre-publication phase authorization', async () => {
    const f = authorizedFixture(); let context;
    try {
      context = f.authority.consume(f.authority.issue(f.state.token, f.item.id, 'publication'));
      const stored = batch._test.readStateForMaintenance(f.state.token); stored.items[0].checkpoint = 'package_published';
      batch._test.writeState(stored);
      assert.equal(context.assertOwnedEpoch(), true);
      assert.throws(() => context.revalidate());
      assert.throws(() => context.assertOwnedEpoch(), 'a revoked context stays revoked');
    } finally { context?.dispose(); f.release(); }
  });
  await testAsync('foreign tickets are refused by the actual internal orchestrator before any hook reflection', async () => {
    const { anonymizePersistedStandalone } = require('../plugins/data-secure/server/gateway/orchestrator');
    let effects = 0;
    const hooks = new Proxy({}, { get() { effects++; throw Error('foreign hook reached'); }, ownKeys() { effects++; return []; } });
    for (const fake of [{}, true, null, new Proxy({}, {})])
      await assert.rejects(anonymizePersistedStandalone(fake, hooks), error => error.code === 'CONTENT_OPTIONS_BINDING_INVALID');
    assert.equal(effects, 0);
  });
  await testAsync('real prepared content survives exhausted control admission without parser budget use and resumes without extraction', async () => {
    const f = authorizedFixture(); let p, controller;
    try {
      p = await preparedFixture(f);
      p.review.capturePrepared(p.state, p.item, p.basis, p.prepared, p.context);
      const preparedFile = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', f.state.token, f.item.id, 'prepared-publication.json');
      const preparedBytes = fs.readFileSync(preparedFile);
      p.context.dispose(); f.release();
      const queued = batch._test.readStateForMaintenance(f.state.token);
      Object.assign(queued.items[0], { status: 'pending', checkpoint: 'sealed', retry_failure_code: 'PARSER_TIMEOUT', retry_failure_count: 2 });
      batch._test.writeState(queued);
      controller = createBatchActiveLock({ lockPath: () => path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', 'control.lock') });
      controller.acquireActiveLock('f'.repeat(64));
      const pending = await batch.processBatchNext(f.state.token);
      assert.equal(pending.error, 'STANDALONE_BUSY');
      const durable = batch._test.readStateForMaintenance(f.state.token).items[0];
      assert.equal(durable.status, 'retryable'); assert.equal(durable.checkpoint, 'retryable');
      assert.equal(durable.error_code, 'STANDALONE_BUSY'); assert.equal(durable.document_result, undefined);
      assert.equal(durable.retry_failure_code, 'PARSER_TIMEOUT'); assert.equal(durable.retry_failure_count, 2);
      assert.deepEqual(fs.readFileSync(preparedFile), preparedBytes); assert.deepEqual(fs.readFileSync(f.source), f.bytes);
      assert.equal(controller.releaseActiveLock('f'.repeat(64)), true); controller = null;
      batch.resumeBatch(f.state.token);
      // No converter runtime is installed in this suite: reaching a real /4
      // publication therefore proves prepared replay, not a second extraction.
      const resumed = await batch.processBatchNext(f.state.token);
      assert.equal(resumed.package_id, p.basis.package_id); assert.equal(resumed.document_result.grade, 'complete');
      assert.equal(resumed.error, undefined);
      assert.deepEqual(fs.readFileSync(preparedFile), preparedBytes); assert.deepEqual(fs.readFileSync(f.source), f.bytes);
    } finally { if (controller) controller.releaseActiveLock('f'.repeat(64)); p?.context.dispose(); f.release(); }
  });
  await testAsync('real post-rename control exhaustion keeps exact published bytes pending and recovery adopts without parser replay', async () => {
    const f = authorizedFixture(); let p, controller, renames = 0;
    const rename = fs.renameSync;
    try {
      p = await preparedFixture(f); p.review.capturePrepared(p.state, p.item, p.basis, p.prepared, p.context);
      p.context.dispose(); f.release();
      const queued = batch._test.readStateForMaintenance(f.state.token);
      Object.assign(queued.items[0], { status: 'pending', checkpoint: 'sealed', retry_failure_code: 'PARSER_TIMEOUT', retry_failure_count: 2 });
      batch._test.writeState(queued);
      const artifact = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'standalone-anonymized-artifacts', 'Output', p.basis.package_id);
      fs.renameSync = function(from, to) {
        const result = rename.apply(this, arguments);
        if (to === artifact) {
          renames++;
          controller = createBatchActiveLock({ lockPath: () => path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', 'control.lock') });
          controller.acquireActiveLock('e'.repeat(64));
        }
        return result;
      };
      const result = await batch.processBatchNext(f.state.token);
      fs.renameSync = rename;
      assert.equal(result.error, 'BATCH_PUBLICATION_UNCONFIRMED'); assert.equal(renames, 1);
      const durable = batch._test.readStateForMaintenance(f.state.token).items[0];
      assert.equal(durable.status, 'processing'); assert.equal(durable.checkpoint, 'package_published');
      assert.equal(durable.document_result, undefined); assert.equal(durable.retry_failure_code, 'PARSER_TIMEOUT'); assert.equal(durable.retry_failure_count, 2);
      const before = new Map(fs.readdirSync(artifact).map(name => [name, fs.readFileSync(path.join(artifact, name))]));
      assert.deepEqual([...before.keys()].sort(), [p.basis.package_id + '.md', 'manifest.json'].sort());
      assert.equal(controller.releaseActiveLock('e'.repeat(64)), true); controller = null;
      batch.resumeBatch(f.state.token);
      const recovered = batch._test.readStateForMaintenance(f.state.token).items[0];
      assert.ok(['mapping_pending', 'delivery_pending'].includes(recovered.status));
      assert.equal(recovered.package_id, p.basis.package_id); assert.equal(recovered.document_result.grade, 'complete');
      for (const [name, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(artifact, name)), bytes);
      assert.equal(renames, 1); assert.deepEqual(fs.readFileSync(f.source), f.bytes);
    } finally { fs.renameSync = rename; if (controller) controller.releaseActiveLock('e'.repeat(64)); p?.context.dispose(); f.release(); }
  });
  await testAsync('production saved-run entry reports the absent real converter, not a false encryption error', async () => {
    const f = fixture(), copy = path.join(f.work, f.item.work_name);
    const original = fs.readFileSync(f.source), sealed = fs.readFileSync(copy);
    const result = await batch.processBatchNext(f.state.token);
    assert.equal(result.error, 'CONVERSION_RUNTIME_UNAVAILABLE');
    assert.equal(result.raw_content_sent_to_claude, false);
    assert.equal(batch._test.readStateForMaintenance(f.state.token).items[0].error_code, 'CONVERSION_RUNTIME_UNAVAILABLE');
    assert.equal(fs.existsSync(batch._test.activeLockPath()), false, 'the actual batch lock is released');
    assert.deepEqual(fs.readFileSync(f.source), original);
    assert.equal(fs.existsSync(path.join(process.env.EU_PRIVACY_ROOT, 'Output', `ds_${f.item.id}`)), false);
    assert.equal(fs.existsSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'standalone-anonymized-artifacts', 'Output', `ds_${f.item.id}`)), false);
    // A missing native runtime is terminal in this engineering-only saved fixture;
    // it must neither rewrite the original nor route through a legacy parser.
    if (fs.existsSync(copy)) assert.deepEqual(fs.readFileSync(copy), sealed);
  });
  await testAsync('actual deferred-review entry uses a fresh capture acquisition and preserves its source', async () => {
    const f = fixture(); f.item.status = 'deferred_review'; f.item.checkpoint = 'awaiting_local_review';
    f.item.error_code = 'LOCAL_REVIEW_DEFERRED'; batch._test.writeState(f.state);
    // This source-only authority test deliberately has no installed converter
    // runtime. Positive capture uses the real projected runtime in the native
    // converter suite, rather than injecting a response into this operation.
    assert.equal(fs.existsSync(path.join(__dirname, '../plugins/data-secure/server/standalone/conversion-runtime')), false);
    const result = await batch.reviewDeferredBatch(f.state.token, { localFinalize: true });
    assert.equal(result.error, 'CONVERSION_RUNTIME_UNAVAILABLE');
    assert.equal(fs.existsSync(batch._test.activeLockPath()), false);
    assert.equal(batch._test.readStateForMaintenance(f.state.token).items[0].status, 'deferred_review');
    assert.deepEqual(fs.readFileSync(f.source), f.bytes);
    assert.equal(fs.existsSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'standalone-anonymized-artifacts', 'Output', `ds_${f.item.id}`)), false);
  });
  await testAsync('actual content review rejects an own abort getter before contact reconstruction or any getter execution', async () => {
    const f = fixture(); f.item.status = 'deferred_review'; f.item.checkpoint = 'awaiting_local_review';
    f.item.error_code = 'LOCAL_REVIEW_DEFERRED'; batch._test.writeState(f.state);
    const signal = createContentAbortController().signal; let reads = 0, sources = 0;
    Object.defineProperty(signal, 'aborted', { get() { reads++; throw Error('foreign abort getter'); } });
    await assert.rejects(batch.reviewDeferredBatch(f.state.token, { abortSignal: signal,
      onReviewSourceCaptured() { sources++; } }), error => error.code === 'CONTENT_OPTIONS_BINDING_INVALID');
    assert.equal(reads, 0); assert.equal(sources, 0);
    assert.equal(fs.existsSync(batch._test.activeLockPath()), false);
    assert.deepEqual(fs.readFileSync(f.source), f.bytes);
  });
  await testAsync('actual content review rejects proxy and false-brand signals without reflection traps', async () => {
    let traps = 0;
    for (const signal of [null, new Proxy(new AbortController().signal, { get() { traps++; throw Error('signal trap'); },
      getPrototypeOf() { traps++; throw Error('prototype trap'); } }), Object.create(AbortSignal.prototype)]) {
      const f = fixture(); f.item.status = 'deferred_review'; f.item.checkpoint = 'awaiting_local_review';
      f.item.error_code = 'LOCAL_REVIEW_DEFERRED'; batch._test.writeState(f.state);
      await assert.rejects(batch.reviewDeferredBatch(f.state.token, { abortSignal: signal }),
        error => error.code === 'CONTENT_OPTIONS_BINDING_INVALID');
      assert.equal(fs.existsSync(batch._test.activeLockPath()), false); assert.deepEqual(fs.readFileSync(f.source), f.bytes);
    }
    assert.equal(traps, 0);
  });
  await testAsync('intrinsic native cancellation cannot be hidden by an own false data property', async () => {
    const f = fixture(); f.item.status = 'deferred_review'; f.item.checkpoint = 'awaiting_local_review';
    f.item.error_code = 'LOCAL_REVIEW_DEFERRED'; batch._test.writeState(f.state);
    const controller = createContentAbortController(); controller.abort();
    Object.defineProperty(controller.signal, 'aborted', { value: false }); let sources = 0;
    const result = await batch.reviewDeferredBatch(f.state.token, { abortSignal: controller.signal,
      onReviewSourceCaptured() { sources++; } });
    assert.equal(result.error, 'LOCAL_REVIEW_CANCELLED'); assert.equal(sources, 0);
    assert.equal(fs.existsSync(batch._test.activeLockPath()), false); assert.deepEqual(fs.readFileSync(f.source), f.bytes);
  });
  await testAsync('new review rejects service getters before spreads but ignores option-alias getters without reading them', async () => {
    for (const field of ['onReviewSourceCaptured', 'contentOptions', 'content_options', 'scanOcr', 'imageOcr']) {
      const f = fixture(); f.item.status = 'deferred_review'; f.item.checkpoint = 'awaiting_local_review';
      f.item.error_code = 'LOCAL_REVIEW_DEFERRED'; batch._test.writeState(f.state); let reads = 0;
      const dependencies = {}; Object.defineProperty(dependencies, field, { enumerable: true, get() { reads++; throw Error('service getter'); } });
      if (field === 'onReviewSourceCaptured') await assert.rejects(batch.reviewDeferredBatch(f.state.token, dependencies),
        error => error.code === 'CONTENT_OPTIONS_BINDING_INVALID');
      else assert.equal((await batch.reviewDeferredBatch(f.state.token, dependencies)).error, 'CONVERSION_RUNTIME_UNAVAILABLE');
      assert.equal(reads, 0); assert.equal(fs.existsSync(batch._test.activeLockPath()), false); assert.deepEqual(fs.readFileSync(f.source), f.bytes);
    }
  });
  await testAsync('copied Node signal descriptors cannot enter the actual content converter', async () => {
    const f = fixture(); f.item.status = 'deferred_review'; f.item.checkpoint = 'awaiting_local_review';
    f.item.error_code = 'LOCAL_REVIEW_DEFERRED'; batch._test.writeState(f.state);
    const fake = Object.create(AbortSignal.prototype, Object.getOwnPropertyDescriptors(new AbortController().signal));
    let conversions = 0;
    await assert.rejects(batch.reviewDeferredBatch(f.state.token, { abortSignal: fake,
      convertBuffer() { conversions++; throw Object.assign(Error('guard probe converter reached'), { code: 'CONVERSION_RUNTIME_UNAVAILABLE' }); } }),
    error => error.code === 'CONTENT_OPTIONS_BINDING_INVALID');
    assert.equal(conversions, 0); assert.equal(fs.existsSync(batch._test.activeLockPath()), false);
    assert.deepEqual(fs.readFileSync(f.source), f.bytes);
  });
  await testAsync('only minted signal identity survives while ordinary native cancellation remains observable', async () => {
    const controller = createContentAbortController(), check = contentAbortChecker(controller.signal);
    assert.equal(check(), false);
    const clone = Object.create(AbortSignal.prototype, Object.getOwnPropertyDescriptors(controller.signal));
    for (const fake of [clone, new AbortController().signal]) assert.throws(() => contentAbortChecker(fake)(),
      error => error.code === 'CONTENT_OPTIONS_BINDING_INVALID');
    controller.abort(); assert.equal(check(), true);
  });
  await testAsync('private /4 mapping intent is bound to the published run and replays idempotently', async () => {
    const f = authorizedFixture(); let p;
    try {
      p = await preparedFixture(f);
      p.review.capturePrepared(p.state, p.item, p.basis, p.prepared, p.context);
      await require('../plugins/data-secure/server/standalone/anonymized-store').publishAnonymizedArtifact(p.input);
      const stored = batch._test.readStateForMaintenance(f.state.token), item = stored.items[0];
      require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation()
        .markMappingPending(item, p.basis.package_id, p.artifact.manifest.document_result, stored);
      batch._test.writeState(stored);
      const mapping = require('../plugins/data-secure/server/gateway/standalone-anonymized-mapping');
      const intent = mapping.ensurePrivateMappingIntent(stored, item);
      assert.equal(JSON.parse(fs.readFileSync(intent.target, 'utf8')).batch_id, f.state.token);
      assert.equal(JSON.parse(fs.readFileSync(intent.target, 'utf8')).publication_binding.package_id, p.basis.package_id);
      assert.equal(mapping.ensurePrivateMappingIntent(stored, item).target, intent.target);
      assert.equal(mapping.commitPrivateMapping(stored, item), true);
      assert.equal(fs.existsSync(intent.target), false);
      const csv = fs.readFileSync(require('../plugins/data-secure/server/gateway/mapping').mappingPath(), 'utf8');
      assert.equal(csv.split(p.basis.package_id).length - 1, 1);
      assert.equal(mapping.commitPrivateMapping(stored, item), true, 'replay after CSV commit is safe');
      const replayed = fs.readFileSync(require('../plugins/data-secure/server/gateway/mapping').mappingPath(), 'utf8');
      assert.equal(replayed.split(p.basis.package_id).length - 1, 1);
      item.status = 'released'; item.checkpoint = 'released_locally'; delete item.error_code;
      batch._test.writeState(stored);
      const exporter = require('../plugins/data-secure/server/gateway/result-export');
      const configuredRoot = process.env.EU_PRIVACY_RESULT_ROOT;
      try {
        process.env.EU_PRIVACY_RESULT_ROOT = path.join(scope, 'not-configured');
        assert.deepEqual(exporter.exportCompletedState(stored), { exported: 0, pending: 1, available: false });
      } finally { process.env.EU_PRIVACY_RESULT_ROOT = configuredRoot; }
      assert.equal(exporter.replayPendingResultExports().exported, 1, 'cold replay copies only the bound private artifact');
      assert.deepEqual(exporter.exportCompletedState(stored), { exported: 1, pending: 0, available: true });
      const run = exporter.visibleExportDirectory(stored.token);
      assert.ok(run && fs.existsSync(path.join(run, 'Dokument-001-anonymisiert.md')));
      assert.equal(fs.readFileSync(path.join(run, 'Dokument-001-anonymisiert.md'), 'utf8'), p.basis.markdown);
      assert.equal(fs.existsSync(path.join(run, 'DataSecure-Zuordnung.csv')), false, 'new result layout contains reusable Markdown only');
      assert.ok(fs.readFileSync(exporter.privateResultLedger(stored.token), 'utf8').includes(p.basis.package_id) === false);
      assert.equal(JSON.parse(fs.readFileSync(exporter.recordPath(stored.token), 'utf8')).schema,
        exporter.CONTENT_ANONYMIZED_SCHEMA);
      assert.deepEqual(exporter.exportCompletedState(stored), { exported: 1, pending: 0, available: true }, 'final export is not copied again');
      const conflicting = mapping.ensurePrivateMappingIntent(stored, item);
      const changed = JSON.parse(fs.readFileSync(conflicting.target, 'utf8'));
      changed.source_label = 'different-source.txt';
      fs.writeFileSync(conflicting.target, JSON.stringify(changed));
      assert.throws(() => mapping.commitPrivateMapping(stored, item), error => error.code === 'LOCAL_MAPPING_EXPORT_PENDING');
      assert.equal(fs.readFileSync(require('../plugins/data-secure/server/gateway/mapping').mappingPath(), 'utf8')
        .split(p.basis.package_id).length - 1, 1, 'a conflicting private intent cannot add another mapping');
      const privateRoot = require('../plugins/data-secure/server/standalone/anonymized-store').anonymizedArtifactRoots().output;
      const publishedFolder = path.resolve(privateRoot, p.basis.package_id);
      const retiredFolder = path.resolve(scope, 'retired-private-artifact');
      const boundary = `${path.resolve(scope)}${path.sep}`;
      assert.ok(publishedFolder.startsWith(boundary) && retiredFolder.startsWith(boundary));
      assert.ok(fs.lstatSync(publishedFolder).isDirectory() && !fs.existsSync(retiredFolder));
      fs.renameSync(publishedFolder, retiredFolder);
      assert.deepEqual(exporter.exportCompletedState(stored), { exported: 1, pending: 0, available: true },
        'completed export stays complete after private retention removes the source artifact');
      assert.deepEqual(fs.readFileSync(f.source), f.bytes);
    } finally { p?.context.dispose(); f.release(); }
  });
  await testAsync('abandoned visible anonymization export stays incomplete and never replays after restart', async () => {
    const f = authorizedFixture(); let p;
    try {
      p = await preparedFixture(f);
      p.review.capturePrepared(p.state, p.item, p.basis, p.prepared, p.context);
      await require('../plugins/data-secure/server/standalone/anonymized-store').publishAnonymizedArtifact(p.input);
      const stored = batch._test.readStateForMaintenance(f.state.token), item = stored.items[0];
      require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation()
        .markMappingPending(item, p.basis.package_id, p.artifact.manifest.document_result, stored);
      batch._test.writeState(stored);
      const mapping = require('../plugins/data-secure/server/gateway/standalone-anonymized-mapping');
      assert.equal(mapping.commitPrivateMapping(stored, item), true);
      item.status = 'released'; item.checkpoint = 'released_locally'; delete item.error_code;
      batch._test.writeState(stored);
      const exporter = require('../plugins/data-secure/server/gateway/result-export');
      const configuredRoot = process.env.EU_PRIVACY_RESULT_ROOT;
      try {
        process.env.EU_PRIVACY_RESULT_ROOT = path.join(scope, 'not-configured');
        assert.deepEqual(exporter.exportCompletedState(stored), { exported: 0, pending: 1, available: false });
      } finally { process.env.EU_PRIVACY_RESULT_ROOT = configuredRoot; }
      const pendingRecord = exporter.readStandaloneExportHistory().find(row =>
        row.export_id === path.basename(exporter.recordPath(stored.token), '.json'));
      assert.deepEqual([pendingRecord?.exported_count, pendingRecord?.pending_count], [0, 1],
        'the confirmation dialog gets actual per-record counts before the waiver');
      // Earlier fixtures share this synthetic history root; place this run
      // first so the intentional 20-row history cap does not hide it.
      const projectedState = { ...stored, created_at: '2098-01-01T00:00:00.000Z' };
      const createHistory = (exportCompletedBatchResults) =>
        require('../plugins/data-secure/server/standalone/run-history').createRunHistory({
          readStates: () => [projectedState], readExports: exporter.readStandaloneExportHistory,
          recoverableStates: () => [], liveExecutor: () => false, exportCompletedBatchResults });
      const pendingEntry = createHistory().history({ recoverExports: false }).entries.find(row => row.batch_id === stored.token);
      assert.deepEqual([pendingEntry?.status, pendingEntry?.exported_count, pendingEntry?.export_pending_count],
        ['export_pending', 0, 1], 'the pending history action displays the same saved counts');
      const active = { ...stored, local_executor_pid: process.pid };
      assert.throws(() => exporter.abandonPendingResultExport(active), /RESULT_EXPORT_ABANDON_UNAVAILABLE/u);
      assert.deepEqual(exporter.abandonPendingResultExport(stored),
        { abandoned: true, exported: 0, pending: 1, available: false });
      assert.deepEqual(exporter.abandonPendingResultExport(stored),
        { abandoned: true, exported: 0, pending: 1, available: false }, 'lost acknowledgement is idempotent');
      assert.equal(exporter.visibleExportStatus(stored.token, 1).abandoned, true);
      assert.equal(exporter.readStandaloneExportHistory().find(row => row.summary?.selected_count === 1 &&
        row.export_id === path.basename(exporter.recordPath(stored.token), '.json'))?.abandoned, true);
      let recoveryAttempts = 0;
      const history = createHistory(() => { recoveryAttempts++; });
      const entry = history.history({ recoverExports: true, recoverBatchId: stored.token }).entries.find(row => row.batch_id === stored.token);
      assert.equal(entry?.status, 'export_abandoned');
      assert.equal(entry?.results_available, false);
      assert.deepEqual([entry?.exported_count, entry?.export_pending_count], [0, 1]);
      assert.equal(recoveryAttempts, 0, 'history never retries a deliberately abandoned export');
      assert.deepEqual(exporter.replayPendingResultExports(), { exported: 0, pending: 0, failures: 0 });
      assert.deepEqual(exporter.exportCompletedState(stored), { exported: 0, pending: 1, available: false });
      assert.equal(exporter.visibleExportDirectory(stored.token), '');
      const previousRoot = process.env.EU_PRIVACY_RESULT_ROOT;
      const alternateRoot = path.join(scope, 'alternate-results-after-waiver');
      fs.mkdirSync(alternateRoot);
      try {
        process.env.EU_PRIVACY_RESULT_ROOT = alternateRoot;
        assert.deepEqual(exporter.exportCompletedState(stored), { exported: 0, pending: 1, available: false },
          'a changed result folder does not silently restart a waived visible export');
        assert.deepEqual(fs.readdirSync(alternateRoot), [], 'no copy is placed in the changed result folder');
      } finally { process.env.EU_PRIVACY_RESULT_ROOT = previousRoot; }
      const recordTarget = exporter.recordPath(stored.token);
      const alteredPlan = JSON.parse(fs.readFileSync(recordTarget, 'utf8'));
      alteredPlan.destination_id = 'a'.repeat(64);
      fs.writeFileSync(recordTarget, JSON.stringify(alteredPlan));
      assert.ok(exporter.replayPendingResultExports().failures >= 1,
        'a changed export plan cannot bypass the durable waiver');
      assert.deepEqual(exporter.exportCompletedState(stored), { exported: 0, pending: 1, available: false });
      assert.deepEqual(fs.readFileSync(f.source), f.bytes);
    } finally { p?.context.dispose(); f.release(); }
  });
  await testAsync('abandoning a partially copied anonymization export preserves the copy and stops the remaining file', async () => {
    const f = authorizedFixture('publication', 'Name: Anna Beispiel\n', ['Name: Berta Beispiel\n']);
    const prepared = [];
    try {
      const reconciliation = require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation();
      const mapping = require('../plugins/data-secure/server/gateway/standalone-anonymized-mapping');
      for (let index = 0; index < f.state.items.length; index++) {
        const p = await preparedFixture(f, { prefix: '', suffix: '' }, 'keep', index);
        prepared.push(p);
        p.review.capturePrepared(p.state, p.item, p.basis, p.prepared, p.context);
        await require('../plugins/data-secure/server/standalone/anonymized-store').publishAnonymizedArtifact(p.input);
        const stored = batch._test.readStateForMaintenance(f.state.token), item = stored.items[index];
        reconciliation.markMappingPending(item, p.basis.package_id, p.artifact.manifest.document_result, stored);
        batch._test.writeState(stored);
        assert.equal(mapping.commitPrivateMapping(stored, item), true);
        item.status = 'released'; item.checkpoint = 'released_locally'; delete item.error_code;
        batch._test.writeState(stored);
        p.context.dispose();
      }
      const stored = batch._test.readStateForMaintenance(f.state.token);
      const exporter = require('../plugins/data-secure/server/gateway/result-export');
      const configuredRoot = process.env.EU_PRIVACY_RESULT_ROOT;
      try {
        process.env.EU_PRIVACY_RESULT_ROOT = path.join(scope, 'not-configured-partial');
        assert.deepEqual(exporter.exportCompletedState(stored), { exported: 0, pending: 2, available: false });
      } finally { process.env.EU_PRIVACY_RESULT_ROOT = configuredRoot; }
      const record = JSON.parse(fs.readFileSync(exporter.recordPath(stored.token), 'utf8'));
      assert.equal(record.items.length, 2);
      const run = path.join(configuredRoot, 'DataSecure-Output', record.run_directory);
      assert.equal(fs.existsSync(run), false, 'the production writer must create and anchor its own run');
      const copied = path.join(run, ...record.items[0].file.split('/'));
      const conflicting = path.join(run, ...record.items[1].file.split('/'));
      const originalLink = fs.linkSync; let conflicts = 0;
      fs.linkSync = (source, target, ...args) => {
        if (target === conflicting && conflicts++ === 0) {
          assert.equal(fs.existsSync(copied), true, 'first verified leaf precedes the independent second-leaf conflict');
          fs.writeFileSync(conflicting, 'synthetic user-owned conflict', { flag: 'wx' });
        }
        return originalLink(source, target, ...args);
      };
      try { assert.deepEqual(exporter.exportCompletedState(stored), { exported: 1, pending: 1, available: false }); }
      finally { fs.linkSync = originalLink; }
      assert.equal(conflicts, 1, 'one actual second-leaf collision, not adoption of a precreated run');
      const copiedBytes = fs.readFileSync(copied), conflictBytes = fs.readFileSync(conflicting);
      assert.equal(crypto.createHash('sha256').update(copiedBytes).digest('hex'), record.items[0].sha256);
      assert.deepEqual(exporter.abandonPendingResultExport(stored),
        { abandoned: true, exported: 1, pending: 1, available: false });
      assert.deepEqual(exporter.exportCompletedState(stored), { exported: 1, pending: 1, available: false });
      exporter.replayPendingResultExports();
      assert.deepEqual(fs.readFileSync(copied), copiedBytes, 'an existing visible copy is not rewritten');
      assert.deepEqual(fs.readFileSync(conflicting), conflictBytes, 'the blocked user-owned target is untouched');
      assert.equal(exporter.visibleExportStatus(stored.token, 2).abandoned, true);
      for (const source of f.sources) assert.deepEqual(fs.readFileSync(source.source), source.bytes);
    } finally { for (const p of prepared) p.context.dispose(); f.release(); }
  });
  await testAsync('a finished anonymization run can be safely abandoned before its first visible export plan', async () => {
    const f = authorizedFixture(); let p;
    try {
      p = await preparedFixture(f);
      p.review.capturePrepared(p.state, p.item, p.basis, p.prepared, p.context);
      await require('../plugins/data-secure/server/standalone/anonymized-store').publishAnonymizedArtifact(p.input);
      const stored = batch._test.readStateForMaintenance(f.state.token), item = stored.items[0];
      require('../plugins/data-secure/server/gateway/batch-reconciliation').createBatchReconciliation()
        .markMappingPending(item, p.basis.package_id, p.artifact.manifest.document_result, stored);
      batch._test.writeState(stored);
      assert.equal(require('../plugins/data-secure/server/gateway/standalone-anonymized-mapping')
        .commitPrivateMapping(stored, item), true);
      item.status = 'released'; item.checkpoint = 'released_locally'; delete item.error_code;
      batch._test.writeState(stored);
      const exporter = require('../plugins/data-secure/server/gateway/result-export');
      assert.equal(fs.existsSync(exporter.recordPath(stored.token)), false);
      assert.deepEqual(exporter.abandonPendingResultExport(stored),
        { abandoned: true, exported: 0, pending: 1, available: false });
      assert.deepEqual(exporter.abandonPendingResultExport(stored),
        { abandoned: true, exported: 0, pending: 1, available: false }, 'a lost acknowledgement does not create a second plan');
      assert.equal(exporter.visibleExportStatus(stored.token, 1).abandoned, true);
      const savedRecord = fs.readFileSync(exporter.recordPath(stored.token));
      const replay = exporter.replayPendingResultExports();
      assert.equal(replay.exported, 0);
      assert.equal(replay.pending, 0);
      assert.deepEqual(fs.readFileSync(exporter.recordPath(stored.token)), savedRecord,
        'replay cannot change this abandoned plan; older deliberately corrupted fixtures may report separately');
      assert.deepEqual(fs.readFileSync(f.source), f.bytes);
    } finally { p?.context.dispose(); f.release(); }
  });
  await done(() => require('../plugins/data-secure/server/gateway/common').safeRemovePrivateTree(path.dirname(scope), path.basename(scope)));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
