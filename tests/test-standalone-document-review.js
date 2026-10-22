'use strict';

// Real local filesystem, immutable snapshots and package-byte reconciliation.
// Fault injection is limited to specific persistence boundaries; it is not
// evidence of native Tauri/WebView or full privacy-detector correctness.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { createDocumentReviewStore, CHUNK } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const { StandaloneApplicationService, defaultDependencies } = require('../plugins/data-secure/server/standalone/application-service');
const { createPrivateWorkStore } = require('../plugins/data-secure/server/gateway/private-work-store');
const { bindDirectory } = require('../plugins/data-secure/server/core/bound-file-io');
const { execFileSync } = require('node:child_process');
const { validatePrivateMessage } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const { test, testAsync, assert, done } = createSuite('Standalone document review / selected AI export');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-document-review-'));
process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'artifact-private-data');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
test('document review only calls a run complete with matching durable result and failure counts', () => {
  const id = 'a'.repeat(64), data = { processing_mode: 'markdown-and-anonymize', documents: [{ document_id: '1'.repeat(32) }],
    unavailable: [], not_processed_documents: [{ document_id: '2'.repeat(32) }], unclassified_documents: [] };
  const entry = { status: 'results_available', processing_mode: data.processing_mode,
    selected_count: 2, result_count: 1, failed_count: 1 };
  const service = { deps: { documentReviews: { list: () => data }, runHistory: { find: batchId => {
    assert.equal(batchId, id); return entry;
  } } } };
  const read = () => StandaloneApplicationService.prototype.documentReviews.call(service, id);
  assert.equal(read().processing_complete, true);
  for (const change of [{ status: 'export_pending' }, { selected_count: 3 }, { result_count: 2 },
    { failed_count: 0 }, { processing_mode: 'markdown-only' }]) {
    Object.assign(entry, change);
    assert.equal(read().processing_complete, false, JSON.stringify(change));
    Object.assign(entry, { status: 'results_available', processing_mode: data.processing_mode,
      selected_count: 2, result_count: 1, failed_count: 1 });
  }
  data.unclassified_documents = [{ document_id: '3'.repeat(32) }];
  assert.equal(read().processing_complete, false);
  assert.equal(Object.hasOwn(data, 'processing_complete'), false, 'stored review data is not mutated');
});
test('anonymization classifies OCR-off omissions only from matching bound run settings and stopped source', () => {
  const id = 'b'.repeat(64), documentId = '4'.repeat(32);
  const data = { processing_mode: 'markdown-and-anonymize', documents: [], unavailable: [], unclassified_documents: [],
    not_processed_documents: [{ document_id: documentId, name: 'scan.png', reason_code: 'IMAGE_OCR_REQUIRED' }] };
  const state = { schema: 'datasecure-batch/7', product_channel: 'standalone', processing_mode: data.processing_mode, token: id,
    content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false },
    items: [{ id: documentId, source_label: 'scan.png', status: 'stopped', local_mapping_exported: true,
      error_code: 'IMAGE_OCR_REQUIRED' }] };
  const service = { deps: { documentReviews: { list: () => data }, readStates: () => [state],
    runHistory: { find: () => ({ status: 'completed_without_results', processing_mode: data.processing_mode,
      selected_count: 1, result_count: 0, failed_count: 1 }) } } };
  const read = () => StandaloneApplicationService.prototype.documentReviews.call(service, id);
  assert.equal(read().not_processed_documents[0].classification, 'ocr_omission');
  state.content_options.scanOcr = true;
  assert.equal(read().not_processed_documents[0].classification, 'error');
  state.content_options.scanOcr = false; state.items[0].source_label = 'different.png';
  assert.equal(read().not_processed_documents[0].classification, 'error');
  assert.equal(Object.hasOwn(data.not_processed_documents[0], 'classification'), false);
});
test('anonymization labels a bound privacy stop without inventing a reviewable document', () => {
  const id = 'c'.repeat(64), documentId = '5'.repeat(32);
  const data = { processing_mode: 'markdown-and-anonymize', documents: [], unavailable: [], unclassified_documents: [],
    not_processed_documents: [{ document_id: documentId, name: 'long.txt', reason_code: 'AMBIGUITY_REVIEW_REQUIRED' }] };
  const state = { product_channel: 'standalone', processing_mode: data.processing_mode, token: id,
    items: [{ id: documentId, source_label: 'long.txt', status: 'stopped', local_mapping_exported: true,
      error_code: 'AMBIGUITY_REVIEW_REQUIRED' }] };
  const service = { deps: { documentReviews: { list: () => data }, readStates: () => [state],
    runHistory: { find: () => ({ status: 'completed_without_results', processing_mode: data.processing_mode,
      selected_count: 1, result_count: 0, failed_count: 1 }) } } };
  const read = () => StandaloneApplicationService.prototype.documentReviews.call(service, id);
  assert.equal(read().not_processed_documents[0].classification, 'privacy_stop');
  state.items[0].source_label = 'other.txt';
  assert.equal(read().not_processed_documents[0].classification, 'error');
  assert.equal(data.not_processed_documents[0].classification, undefined);
});
let n = 0;
function fixture(v2 = false, traced = false, rejected = null, fields = null) {
  const batchId = (++n).toString(16).padStart(64, '0'), dir = path.join(root, String(n));
  const output = path.join(dir, 'packages'), results = path.join(dir, 'results'), data = path.join(dir, 'private');
  for (const folder of [output, results, data]) fs.mkdirSync(folder, { recursive: true });
  const original = fields?.original || 'Name: Anna Beispiel\nAnna Beispiel hat 42 Projekte.\nE-Mail: anna@example.invalid';
  const originalFor = index => fields?.originals?.[index] ?? original;
  const items = Array.from({ length: fields?.documentCount || 2 }, (_unused, offset) => offset + 1).map(index => ({ id: (fields?.contentOptions ? n * 100 + index : index).toString(16).padStart(32, '0'), name: `nested/Quelle-${index}.pdf`,
    sha256: sha(traced ? originalFor(index - 1) : 'original'), status: 'released' }));
  if (rejected) items.push(rejected);
  const state = { product_channel: 'standalone', processing_mode: 'markdown-and-anonymize', token: batchId, items,
    ...(fields?.reviewPolicy ? { standalone_review_policy: fields.reviewPolicy } : {}),
    ...(v2 ? { standalone_document_review: true } : {}),
    ...(fields?.contentOptions ? { schema: 'datasecure-batch/7', content_options: fields.contentOptions } : {}) };
  const create = () => createDocumentReviewStore({ dataRoot: data, outputRoot: () => output, resultRoot: () => results, expectedDocuments: () => items });
  const capture = source => traced ? require('../plugins/data-secure/server/pii-engine').anonymize(source, 'general', { captureTransformPlan: true,
    ...(fields?.contentOptions && !fields.legacyRedactor ? { productChannel: 'standalone', contentOptions: fields.contentOptions } : {}) }) : null;
  const captured = capture(originalFor(0));
  const store = create(), text = captured?.text || '# Inhalt\n[PERSON_001] hat 42 Projekte.\n';
  for (const [index, item] of items.filter(row => row !== rejected).entries()) {
    const documentOriginal = originalFor(index), documentCapture = documentOriginal === originalFor(0) ? captured : capture(documentOriginal);
    const documentText = documentCapture?.text || text;
    const packageId = `ds_${item.id}`, packageDir = path.join(output, packageId); fs.mkdirSync(packageDir);
    let boundArtifact;
    if (fields?.contentOptions) {
      const { createSourceExtraction } = require('../plugins/data-secure/server/core/source-extraction-contract');
      const pub = require('../plugins/data-secure/server/standalone/anonymized-artifact');
      const coverage = { status: 'complete', reason_codes: [] };
      const proof = pub.verifyAnonymizedPublication({ markdown: documentText, profile: 'general', content_options: fields.contentOptions,
        source_extraction: createSourceExtraction({ source_type: 'pdf', content_options: fields.contentOptions, coverage, markdown: documentOriginal }, 8_000_000),
        dictionary: documentCapture.dictionary, strong_person_anchor: documentCapture.strongPersonAnchor === true, reviewed_person_candidates: null });
      boundArtifact = pub.createAnonymizedArtifact({ package_id: packageId, content_options: fields.contentOptions, source_type: 'pdf', profile: 'general',
        operation_id: crypto.randomUUID(), created_at: new Date().toISOString(), coverage, markdown: documentText, verification_proof: proof });
      const target = path.join(require('../plugins/data-secure/server/standalone/anonymized-store').anonymizedArtifactRoots().output, packageId);
      fs.mkdirSync(target); fs.writeFileSync(path.join(target, `${packageId}.md`), documentText);
      fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(boundArtifact.manifest));
    }
    store.capture(state, item, { package_id: packageId, original_text: documentCapture ? documentOriginal : 'Anna Beispiel hat 42 Projekte.', markdown: documentText,
      ...(fields?.contentOptions ? { content_options: fields.contentOptions, source_type: 'pdf', publication_binding: boundArtifact.expectation } : {}),
      ...(documentCapture ? { transform_trace: documentCapture.transform_trace, verification_context: {
        profile: 'general', dictionary: documentCapture.dictionary, strong_person_anchor: documentCapture.strongPersonAnchor === true,
        ruleset: require('../plugins/data-secure/server/privacy/policy').PRIVACY_RULESET_VERSION,
        credential_policy: require('../plugins/data-secure/server/privacy/policy').CREDENTIAL_CONTEXT_POLICY_VERSION,
        ...(fields && Object.hasOwn(fields, 'policyMarker') ? { person_field_policy: fields.policyMarker } : {}),
        publication_frame: { prefix: '', suffix: '' }, reviewed_ranges: [] } } : {}) });
    fs.writeFileSync(path.join(packageDir, `${packageId}.md`), documentText);
    fs.writeFileSync(path.join(packageDir, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/3', package_id: packageId,
      document: `${packageId}.md`, verification: { text_residual_pii: 'passed' }, document_sha256: sha(documentText) }));
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
const entityFields = extra => ({ contentOptions: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false },
  policyMarker: require('../plugins/data-secure/server/core/person-field-policy').CONTENT_PERSON_FIELD_POLICY, ...extra });
function entityRequest(f, index, decision, scope = 'document', operationId = crypto.randomBytes(16).toString('hex')) {
  const row = f.row(index), group = f.store.entities(f.batchId, row.document_id, row.revision, 0).entities.find(value => value.kind === 'PERSON');
  assert.ok(group);
  return { documentId: row.document_id, request: { action: 'entities', ranges: [], revision: row.revision,
    output_sha256: row.output_sha256, operation_id: operationId,
    entity_decisions: [{ entity_id: group.entity_id, decision }], ...(scope === 'run' ? { scope } : {}) } };
}
function persistentDecisionPins(f) {
  const rows = [];
  for (const [role, folder] of [['review', path.join(f.data, 'document-reviews', f.batchId)], ['packages', f.output], ['results', f.results]]) {
    const walk = target => {
      for (const name of fs.readdirSync(target).sort()) {
        const file = path.join(target, name), stat = fs.lstatSync(file);
        assert.equal(stat.isSymbolicLink(), false);
        if (stat.isDirectory()) walk(file);
        else rows.push([role, path.relative(folder, file), sha(fs.readFileSync(file))]);
      }
    };
    walk(folder);
  }
  return rows;
}
function assertCandidateBlocked(f, input, blocked) {
  const before = persistentDecisionPins(f), result = f.store.decide(f.batchId, input.documentId, input.request);
  assert.deepEqual(result, { ok: false, reason_code: 'DOCUMENT_ENTITY_RUN_CONFLICT', blocked_files: blocked,
    local_ui_only: true, external_disclosure: false });
  assert.deepEqual(persistentDecisionPins(f), before, 'no decision, revision, rule, package or result mutation');
  assert.ok(f.create().list(f.batchId).documents.every(row => row.revision === 0 && !row.approved));
  return result;
}
function seedHistoricalEntityKeep(f, index) {
  // Test-owned pre-fix legacy revision, not a new decision authorized by the
  // current service. Existing unsafe revisions and their exact ACK stay intact.
  const input = entityRequest(f, index, 'keep'), run = path.join(f.data, 'document-reviews', f.batchId);
  const snapshot = JSON.parse(fs.readFileSync(path.join(run, input.documentId, 'base.json')));
  const key = Buffer.from(JSON.parse(fs.readFileSync(path.join(run, 'entity-key.json'))).key, 'hex');
  const entity = require('../plugins/data-secure/server/gateway/standalone-entity-review');
  const next = entity.applyEntityDecisions(snapshot.markdown, entity.initialEntities(snapshot), input.request.entity_decisions, key);
  const event = { schema: 'datasecure-document-revision/1', revision: 1, parent_sha256: input.request.output_sha256,
    output_sha256: sha(next.markdown), approved: false, action: 'entities', ranges: [],
    operation_id: input.request.operation_id, request_sha256: sha(JSON.stringify(input.request)), entity_decisions: input.request.entity_decisions };
  fs.writeFileSync(path.join(run, input.documentId, 'revision-000001.json'), JSON.stringify(event), { flag: 'wx' });
  return input;
}

test('single-document entity Keep refuses the actual residual gate before any durable decision', () => {
  const f = fixture(true, true, null, entityFields()), input = entityRequest(f, 0, 'keep');
  assertCandidateBlocked(f, input, [{ name: f.items[0].name, reason_code: 'DOCUMENT_REVIEW_RESIDUAL_PII' }]);
});
test('run-wide entity Keep checks a later unsafe candidate before committing the safe origin', () => {
  const f = fixture(true, true, null, entityFields({ originals: ['Anna Beispiel\nProjekt erledigt.', 'Name: Anna Beispiel\nBericht 42.'] }));
  const input = entityRequest(f, 0, 'keep', 'run');
  assertCandidateBlocked(f, input, [{ name: f.items[1].name, reason_code: 'DOCUMENT_REVIEW_RESIDUAL_PII' }]);
});
test('all refused entity candidates are named and a policy mismatch grants no decision', () => {
  const f = fixture(true, true, null, entityFields()), input = entityRequest(f, 0, 'keep', 'run');
  assertCandidateBlocked(f, input, f.items.map(row => ({ name: row.name, reason_code: 'DOCUMENT_REVIEW_RESIDUAL_PII' })));
  const changed = fixture(true, true, null, entityFields({ original: 'Anna Beispiel\nProjekt erledigt.', policyMarker: 'legacy-person-fields/1' }));
  assertCandidateBlocked(changed, entityRequest(changed, 0, 'default'),
    [{ name: changed.items[0].name, reason_code: 'DOCUMENT_REVIEW_POLICY_CHANGED' }]);
});
test('valid entity Keep, person, organization and default remain available for single and run scope', () => {
  for (const scope of ['document', 'run']) for (const treatment of ['keep', 'person', 'organization', 'default']) {
    const f = fixture(true, true, null, entityFields({ original: 'Anna Beispiel\nProjekt erledigt.' })), input = entityRequest(f, 0, treatment, scope);
    const result = f.store.decide(f.batchId, input.documentId, input.request);
    assert.equal(result.ok, true); assert.equal(result.affected_count, scope === 'run' ? 2 : 1);
    const rows = f.create().list(f.batchId).documents;
    for (const [index, row] of rows.entries()) {
      assert.equal(row.revision, scope === 'run' || index === 0 ? 1 : 0);
      if (!row.revision) continue;
      const text = f.store.chunk(f.batchId, row.document_id, row.revision, 0).markdown;
      if (treatment === 'keep') assert.match(text, /Anna Beispiel/u);
      else if (treatment === 'default') assert.equal(text, f.text);
      else assert.match(text, treatment === 'person' ? /\[PERSON_[A-Z2-7]{52}\]/u : /\[UNTERNEHMEN_[A-Z2-7]{52}\]/u);
      assert.equal(f.decision(index, 'approve').approved, true);
    }
  }
});
test('snapshot, ACL and I/O failures are hard errors, not safely inspected entity conflicts', () => {
  for (const code of ['EACCES', 'EPERM', 'EIO', 'BROKEN_SNAPSHOT']) {
    const f = fixture(true, true, null, entityFields({ originals: ['Anna Beispiel\nProjekt erledigt.', 'Name: Anna Beispiel\nBericht 42.'] }));
    const input = entityRequest(f, 0, 'keep', 'run'), target = path.join(f.data, 'document-reviews', f.batchId, f.items[1].id, 'base.json');
    if (code === 'BROKEN_SNAPSHOT') fs.writeFileSync(target, '{broken');
    const before = persistentDecisionPins(f), open = fs.openSync; let faulted = false;
    fs.openSync = function(file, ...args) {
      if (code !== 'BROKEN_SNAPSHOT' && typeof file === 'string' && path.resolve(file) === target) {
        faulted = true; throw Object.assign(Error('test-owned read failure'), { code });
      }
      return open.call(this, file, ...args);
    };
    try { assert.throws(() => f.store.decide(f.batchId, input.documentId, input.request), error =>
      error.code !== 'DOCUMENT_ENTITY_RUN_CONFLICT' && error.code !== 'DOCUMENT_REVIEW_RESIDUAL_PII', code); }
    finally { fs.openSync = open; }
    assert.equal(faulted, code !== 'BROKEN_SNAPSHOT');
    assert.deepEqual(persistentDecisionPins(f), before, 'hard boundary failure cannot commit earlier safe targets');
  }
});
test('historical unsafe entity revision stays immutable and its exact acknowledgement remains idempotent', () => {
  const f = fixture(true, true, null, entityFields()), input = seedHistoricalEntityKeep(f, 0), before = persistentDecisionPins(f);
  const ack = f.store.decide(f.batchId, input.documentId, input.request);
  assert.equal(ack.ok, true); assert.equal(ack.revision, 1);
  assert.deepEqual(persistentDecisionPins(f), before, 'no rollback, new decision or publication on historical ACK');
  throwsCode(() => f.decision(0, 'approve'), 'DOCUMENT_REVIEW_RESIDUAL_PII');
});

test('Fastweg auto-approves only its verified published basis and never reapproves an edited or revoked revision', () => {
  const fields = { contentOptions: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false },
    policyMarker: require('../plugins/data-secure/server/core/person-field-policy').CONTENT_PERSON_FIELD_POLICY,
    reviewPolicy: 'automatic-conservative' };
  const f = fixture(true, true, null, fields), listed = f.store.list(f.batchId);
  assert.equal(listed.review_policy, fields.reviewPolicy);
  assert.ok(listed.documents.every(row => row.approved && row.revision === 0 && row.approval_basis === 'automatic'));
  assert.equal(f.store.historySummary(f.batchId).automatically_approved_count, 2);
  assert.deepEqual(f.create().list(f.batchId).documents, listed.documents, 'restart reconstructs exact published basis, no extra approval event');
  assert.equal(fs.existsSync(path.join(f.results, 'DataSecure-KI-Export')), false, 'automatic approval is not export');
  f.decision(0, 'revoke');
  assert.equal(f.create().list(f.batchId).documents[0].approved, false);
  assert.equal(f.row(0).approval_basis, null);
  f.decision(1, 'redact', [{ start: f.text.indexOf('42'), end: f.text.indexOf('42') + 2 }]);
  assert.equal(f.create().list(f.batchId).documents[1].approved, false);
  f.decision(1, 'restore_base');
  assert.equal(f.row(1).approved, false, 'restored text is a new revision, never an automatic basis');
  f.decision(1, 'approve');
  assert.equal(f.row(1).approval_basis, 'manual');
  assert.equal(f.store.historySummary(f.batchId).automatically_approved_count, 0);
  const g = fixture(true, true, null, fields), manifest = path.join(g.data, 'document-reviews', g.batchId, 'manifest.json');
  const saved = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  assert.equal(saved.schema, 'datasecure-document-run/4');
  delete saved.review_policy; fs.writeFileSync(manifest, JSON.stringify(saved));
  throwsCode(() => g.create().list(g.batchId), 'STANDALONE_REVIEW_POLICY_INVALID');
});

test('private document approval reconstructs bound field policy and never accepts a self-selected marker', () => {
  // New fixtures use a real residual proof and closed /4 artifact in the
  // private pool. Their direct file creation is not a Tauri/start-flow test.
  const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false };
  const policyMarker = require('../plugins/data-secure/server/core/person-field-policy').CONTENT_PERSON_FIELD_POLICY;
  for (const change of [{}, { policyMarker: 'legacy-person-fields/1' }, { policyMarker: 'unknown' }]) {
    const f = fixture(true, true, null, { original: 'First Name: Qvx', contentOptions, ...change });
    throwsCode(() => f.decision(0, 'approve'), 'DOCUMENT_REVIEW_POLICY_CHANGED');
    assert.equal(f.create().list(f.batchId).documents[0].approved, false);
  }
  const explicit = fixture(true, true, null, { original: '| First Name |\n| --- |\n| Qvx |', contentOptions, policyMarker });
  seedHistoricalEntityKeep(explicit, 0);
  throwsCode(() => explicit.decision(0, 'approve'), 'DOCUMENT_REVIEW_RESIDUAL_PII');
  const valid = fixture(true, true, null, { original: 'Vollständiger Name: Qvx', contentOptions, policyMarker });
  valid.decision(0, 'approve'); assert.equal(valid.create().list(valid.batchId).documents[0].approved, true);
  const legacy = fixture(true, true, null, { policyMarker });
  throwsCode(() => legacy.decision(0, 'approve'), 'DOCUMENT_REVIEW_POLICY_CHANGED');
});

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

test('legacy review chunk count covers the canonical original actually displayed', () => {
  const f = fixture(), item = { id: '7'.repeat(32), name: 'canonical.txt', sha256: sha('source'), status: 'released' };
  const canonical = 'q'.repeat(CHUNK + 17), markdown = canonical;
  const trace = require('../plugins/data-secure/server/privacy/transform-plan').createTransformTrace(canonical).finish(markdown);
  f.items.push(item);
  const packageId = `ds_${item.id}`, dir = path.join(f.output, packageId); fs.mkdirSync(dir);
  f.store.capture(f.state, item, { package_id: packageId, original_text: 'short extraction preview', markdown,
    transform_trace: trace });
  fs.writeFileSync(path.join(dir, `${packageId}.md`), markdown);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/3', package_id: packageId,
    document: `${packageId}.md`, verification: { text_residual_pii: 'passed' }, document_sha256: sha(markdown) }));
  const row = f.store.list(f.batchId).documents.find(value => value.document_id === item.id);
  assert.equal(row.chunks, 2);
  const parts = Array.from({ length: row.chunks }, (_unused, index) => f.store.chunk(f.batchId, item.id, 0, index));
  assert.equal(parts.map(part => part.original_text).join(''), canonical);
  assert.equal(parts.map(part => part.markdown).join(''), markdown);
  throwsCode(() => f.store.chunk(f.batchId, item.id, 0, 2), 'DOCUMENT_REVIEW_INVALID');
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

const batchSelection = f => f.store.list(f.batchId).documents.map(({ document_id, revision, output_sha256 }) =>
  ({ document_id, revision, output_sha256 }));
const batchRequest = (f, action = 'approve', operationId = crypto.randomBytes(16).toString('hex')) =>
  ({ action, operation_id: operationId, selection: batchSelection(f) });

test('a selected approval or revocation has one durable commit and an exact retry creates no second revision', () => {
  const f = fixture(true, false, null, { documentCount: 3 }), request = batchRequest(f);
  const approved = f.store.decideBatch(f.batchId, request), run = path.join(f.data, 'document-reviews', f.batchId);
  assert.deepEqual(Object.keys(approved).sort(), ['affected_count', 'documents', 'external_disclosure', 'local_ui_only', 'ok', 'operation_id']);
  assert.equal(approved.affected_count, 3); assert.equal(approved.operation_id, request.operation_id);
  assert.ok(approved.documents.every(row => row.approved && row.revision === 1));
  assert.deepEqual(fs.readdirSync(run).filter(file => /^commit-/u.test(file)), ['commit-000001.json']);
  assert.deepEqual(fs.readdirSync(run).filter(file => /^decision-/u.test(file)), ['decision-000001.json']);
  const proof = JSON.parse(fs.readFileSync(path.join(run, 'commit-000001.json')));
  assert.equal(proof.record.schema, 'datasecure-run-decision/2');
  assert.equal(proof.record.scope, 'selection'); assert.equal(proof.record.targets.length, 3);
  // Property order is not an operation change; selection order is bound.
  const retry = { selection: request.selection.map(row => ({ revision: row.revision,
    output_sha256: row.output_sha256, document_id: row.document_id })), operation_id: request.operation_id, action: request.action };
  assert.deepEqual(f.create().decideBatch(f.batchId, retry), approved);
  assert.deepEqual(f.create().list(f.batchId).documents, approved.documents);
  throwsCode(() => f.store.decideBatch(f.batchId, { ...request, action: 'revoke' }), 'DOCUMENT_REVIEW_CONFLICT');
  throwsCode(() => f.store.decideBatch(f.batchId, { ...request, selection: [...request.selection].reverse() }), 'DOCUMENT_REVIEW_CONFLICT');
  const revoked = f.store.decideBatch(f.batchId, batchRequest(f, 'revoke'));
  assert.ok(revoked.documents.every(row => !row.approved && row.revision === 2));
  assert.equal(fs.readdirSync(run).filter(file => /^commit-/u.test(file)).length, 2);
  throwsCode(() => f.create().decideBatch(f.batchId, request), 'DOCUMENT_REVIEW_STALE');
});

test('a selected decision validates all revisions and hashes before committing any approval', () => {
  for (const changed of [{ revision: 1 }, { output_sha256: 'a'.repeat(64) }]) {
    const f = fixture(true), request = batchRequest(f);
    Object.assign(request.selection.at(-1), changed);
    throwsCode(() => f.store.decideBatch(f.batchId, request), 'DOCUMENT_REVIEW_STALE');
    assert.ok(f.create().list(f.batchId).documents.every(row => !row.approved && row.revision === 0));
    assert.equal(fs.readdirSync(path.join(f.data, 'document-reviews', f.batchId)).filter(file => /^commit-/u.test(file)).length, 0);
  }
  const f = fixture(true), request = batchRequest(f);
  request.selection.at(-1).document_id = 'f'.repeat(32);
  assert.throws(() => f.store.decideBatch(f.batchId, request));
  assert.ok(f.create().list(f.batchId).documents.every(row => !row.approved && row.revision === 0));
});

test('the maximum 200-document approval reads one journal and commits one complete selection', () => {
  const f = fixture(true, false, null, { documentCount: 200 }), request = batchRequest(f);
  const run = path.join(f.data, 'document-reviews', f.batchId), originalList = fs.readdirSync;
  let journalLists = 0, approved;
  fs.readdirSync = function(target, ...args) { if (path.resolve(target) === run) journalLists++; return originalList.call(this, target, ...args); };
  try { approved = f.store.decideBatch(f.batchId, request); }
  finally { fs.readdirSync = originalList; }
  assert.equal(journalLists, 2, 'one journal validation scans decision and proof files once each');
  assert.equal(approved.affected_count, 200);
  assert.ok(approved.documents.every(row => row.approved && row.revision === 1));
  assert.equal(fs.readdirSync(run).filter(file => /^commit-/u.test(file)).length, 1);
  assert.deepEqual(f.create().list(f.batchId).documents, approved.documents);
});

test('selected approval preserves purpose-bound residual and policy checks without a partial grant', () => {
  const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false };
  const policyMarker = require('../plugins/data-secure/server/core/person-field-policy').CONTENT_PERSON_FIELD_POLICY;
  const safe = fixture(true, true, null, { original: 'Vollständiger Name: Qvx', contentOptions, policyMarker });
  const beforePreview = safe.store.list(safe.batchId).documents;
  assert.equal(safe.store.previewExport(safe.batchId, 'a'.repeat(32), beforePreview.map(({ document_id, revision, output_sha256 }) =>
    ({ document_id, revision, output_sha256 }))).files.length, 2);
  assert.deepEqual(safe.store.list(safe.batchId).documents, beforePreview, 'preview grants no approval/revision');
  assert.ok(safe.store.decideBatch(safe.batchId, batchRequest(safe)).documents.every(row => row.approved && row.revision === 1));
  const f = fixture(true, true, null, { original: 'Vollständiger Name: Qvx', contentOptions, policyMarker });
  seedHistoricalEntityKeep(f, 1);
  throwsCode(() => f.store.decideBatch(f.batchId, batchRequest(f)), 'DOCUMENT_REVIEW_RESIDUAL_PII');
  throwsCode(() => f.store.previewExport(f.batchId, 'b'.repeat(32), batchRequest(f).selection), 'DOCUMENT_REVIEW_RESIDUAL_PII');
  const after = f.create().list(f.batchId).documents;
  assert.equal(after[0].revision, 0); assert.ok(after.every(value => !value.approved));
  // A revocation is still possible for an unsafe candidate; no new export grant.
  assert.ok(f.store.decideBatch(f.batchId, batchRequest(f, 'revoke')).documents.every(value => !value.approved));
  const legacyPolicy = fixture(true, true, null, { contentOptions });
  throwsCode(() => legacyPolicy.store.decideBatch(legacyPolicy.batchId, batchRequest(legacyPolicy)), 'DOCUMENT_REVIEW_POLICY_CHANGED');
  assert.ok(legacyPolicy.create().list(legacyPolicy.batchId).documents.every(value => !value.approved && value.revision === 0));
});

test('selected decisions enforce a closed approve/revoke request with at most 200 unique bound documents', () => {
  const f = fixture(true), original = batchRequest(f), malformed = [
    null, [], { ...original, action: 'redact' }, { ...original, ranges: [] }, { ...original, operation_id: 'bad' },
    { ...original, selection: [] }, { ...original, selection: [original.selection[0], original.selection[0]] },
    { ...original, selection: Array.from({ length: 201 }, (_, index) => ({ ...original.selection[0], document_id: (index + 1).toString(16).padStart(32, '0') })) },
    { ...original, selection: [{ ...original.selection[0], extra: true }] },
    { ...original, selection: [{ ...original.selection[0], revision: -1 }] },
    { ...original, selection: [{ ...original.selection[0], output_sha256: null }] }
  ];
  for (const request of malformed) throwsCode(() => f.store.decideBatch(f.batchId, request), 'DOCUMENT_REVIEW_INVALID');
  assert.ok(f.create().list(f.batchId).documents.every(row => row.revision === 0 && !row.approved));
  const single = f.selection(0)[0], operationId = '8'.repeat(32);
  f.store.decide(f.batchId, single.document_id, { action: 'approve', ranges: [], operation_id: operationId,
    revision: single.revision, output_sha256: single.output_sha256 });
  throwsCode(() => f.store.decideBatch(f.batchId, { ...original, operation_id: operationId }), 'DOCUMENT_REVIEW_CONFLICT');
});

test('a missing selected-decision projection recovers the complete atomic commit after acknowledgement loss', () => {
  for (const action of ['approve', 'revoke']) {
    const f = fixture(true), run = path.join(f.data, 'document-reviews', f.batchId);
    if (action === 'revoke') f.store.decideBatch(f.batchId, batchRequest(f));
    const request = batchRequest(f, action), sequence = action === 'approve' ? 1 : 2, suffix = String(sequence).padStart(6, '0');
    faultOnce(target => target.endsWith(`decision-${suffix}.json`), () => assert.throws(() => f.store.decideBatch(f.batchId, request)));
    assert.equal(fs.existsSync(path.join(run, `commit-${suffix}.json`)), true);
    assert.equal(fs.existsSync(path.join(run, `decision-${suffix}.json`)), false);
    const result = f.create().decideBatch(f.batchId, request);
    assert.ok(result.documents.every(row => row.approved === (action === 'approve') && row.revision === sequence));
    assert.equal(fs.existsSync(path.join(run, `decision-${suffix}.json`)), true);
    assert.equal(fs.readdirSync(run).filter(file => /^commit-/u.test(file)).length, sequence);
  }
});

test('a failed selected-decision commit publishes no document approval and can be retried exactly', () => {
  const f = fixture(true), request = batchRequest(f);
  faultOnce(target => target.endsWith('commit-000001.json'), () => assert.throws(() => f.store.decideBatch(f.batchId, request)));
  assert.ok(f.create().list(f.batchId).documents.every(row => !row.approved && row.revision === 0));
  assert.ok(f.create().decideBatch(f.batchId, request).documents.every(row => row.approved && row.revision === 1));
});

test('a rehashed batch journal cannot change the selection binding or smuggle edits into an approval', () => {
  for (const change of [record => { record.targets[0].event.revision += 1; },
    record => { record.targets[0].event.action = 'redact'; record.targets[0].event.approved = false; },
    record => { record.targets[0].event.ranges = [{ start: 0, end: 1 }]; },
    record => { record.targets[0].event.output_sha256 = 'f'.repeat(64); },
    record => { record.targets[1].event.action = 'revoke'; record.targets[1].event.approved = false; }]) {
    const f = fixture(true), request = batchRequest(f);
    f.store.decideBatch(f.batchId, request);
    const run = path.join(f.data, 'document-reviews', f.batchId), proofPath = path.join(run, 'commit-000001.json');
    const proof = JSON.parse(fs.readFileSync(proofPath)), record = proof.record;
    change(record); const { event_sha256: _old, ...body } = record;
    record.event_sha256 = sha(JSON.stringify(body)); proof.event_sha256 = record.event_sha256;
    fs.writeFileSync(proofPath, JSON.stringify(proof)); fs.writeFileSync(path.join(run, 'decision-000001.json'), JSON.stringify(record));
    throwsCode(() => f.create().list(f.batchId), 'DOCUMENT_REVIEW_INVALID');
  }
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
  const { readableText } = require('../plugins/data-secure/server/standalone/readable-markdown');
  const id = `dm_${item.id}`, markdown = '## Seite 1\n\n' + readableText('Name: Anna Beispiel\nE-Mail: anqa@example.invalid\nFHIR < SDK').markdown;
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
  assert.equal(row.text_modified, false);
  const unapprovedSelection = [{ document_id: row.document_id, revision: row.revision, output_sha256: row.output_sha256 }];
  assert.deepEqual(create().previewExport(f.batchId, '9'.repeat(32), unapprovedSelection).files,
    [{ name: 'scan.md', sha256: row.output_sha256 }], 'raw preview is read-only before copy consent');
  assert.equal(create().list(f.batchId).documents[0].approved, false, 'preview does not approve');
  throwsCode(() => create().exportApproved(f.batchId, '9'.repeat(32), unapprovedSelection), 'DOCUMENT_REVIEW_UNAPPROVED');
  const anonSelection = f.selection(0);
  assert.deepEqual(f.store.previewExport(f.batchId, '9'.repeat(32), anonSelection).files,
    [{ name: 'Dokument_01.md', sha256: anonSelection[0].output_sha256 }], 'anonymized preview validates candidate without approval');
  assert.equal(f.store.list(f.batchId).documents.find(value => value.document_id === anonSelection[0].document_id).approved, false);
  throwsCode(() => f.store.exportApproved(f.batchId, '9'.repeat(32), anonSelection), 'DOCUMENT_REVIEW_UNAPPROVED');
  assert.equal(fs.existsSync(path.join(f.results, 'DataSecure-Markdown-Korrektur')), false, 'neither preview nor refused copy creates output');
  const decide = (action, ranges = []) => { const result = create().decide(f.batchId, item.id, { action, ranges, revision: row.revision,
    output_sha256: row.output_sha256, operation_id: crypto.randomBytes(16).toString('hex') }); row = result; };
  const originalApproval = store.list(f.batchId).documents.find(row => row.document_id === item.id);
  decide('approve');
  assert.equal(row.text_modified, false, 'copy consent alone is not a text correction');
  const approvedSelection = [{ document_id: item.id, revision: row.revision, output_sha256: row.output_sha256 }];
  const correctionStart = markdown.indexOf('anqa@');
  decide('correct', [{ start: correctionStart, end: correctionStart + 4, replacement: 'anna' }]);
  assert.equal(row.text_modified, true, 'the changed current text is marked after durable replay');
  assert.equal(create().list(f.batchId).documents.find(value => value.document_id === item.id).text_modified, true,
    'restart retains the correction state');
  assert.equal(row.approved, false); assert.equal(row.processing_mode, 'markdown-only');
  throwsCode(() => create().decide(f.batchId, item.id, { action: 'redact', ranges: [{ start: 0, end: 4 }],
    revision: row.revision, output_sha256: row.output_sha256, operation_id: 'f'.repeat(32) }), 'DOCUMENT_REVIEW_INVALID');
  assert.match(create().chunk(f.batchId, item.id, row.revision, 0).markdown, /anna@example/u);
  assert.match(create().chunk(f.batchId, item.id, row.revision, 0).markdown, /Name: Anna Beispiel/u);
  assert.match(create().chunk(f.batchId, item.id, row.revision, 0).markdown, /FHIR &lt; SDK/u);
  assert.ok(row.revision > originalApproval.revision);
  throwsCode(() => create().exportApproved(f.batchId, '8'.repeat(32), approvedSelection), 'DOCUMENT_REVIEW_STALE');
  assert.equal(fs.readFileSync(path.join(folder, `${id}.md`), 'utf8'), markdown);
  decide('approve'); const selection = [{ document_id: item.id, revision: row.revision, output_sha256: row.output_sha256 }];
  assert.equal(row.text_modified, true, 'copy consent does not clear the saved correction marker');
  const preview = create().previewExport(f.batchId, '6'.repeat(32), selection);
  assert.deepEqual(preview.files, [{ name: 'scan.md', sha256: row.output_sha256 }]);
  assert.equal(fs.existsSync(path.join(f.data, 'document-reviews', f.batchId, 'export-' + '6'.repeat(32) + '.json')), false, 'preview creates no intent');
  const result = create().exportApproved(f.batchId, '6'.repeat(32), selection);
  assert.equal(result.anonymized, false); assert.equal(result.processing_mode, 'markdown-only');
  assert.match(fs.readFileSync(path.join(f.results, 'DataSecure-Markdown-Korrektur', result.folder_name, 'scan.md'), 'utf8'), /anna@example/u);
  assert.equal(fs.existsSync(path.join(f.results, 'DataSecure-KI-Export')), false);
  throwsCode(() => create().resolveIdentityOverview(f.batchId, '6'.repeat(32)), 'STANDALONE_IDENTITY_MAPPING_MISSING');
  assert.equal(create().list(f.batchId).export_receipts[0].identity_overview_available, false);
  // A persisted old raw plan must keep its neutral names when actually copied
  // by the new exporter; do not merely test a digest reader in isolation.
  const legacyId = '4'.repeat(32), legacyFiles = [{ name: 'Dokument_01.md', sha256: row.output_sha256 }];
  const legacyDigest = sha(JSON.stringify({ schema: 'datasecure-document-export/4', batch_id: f.batchId, operation_id: legacyId,
    processing_mode: 'markdown-only', selection, identity_binding_sha256: null }));
  fs.writeFileSync(path.join(f.data, 'document-reviews', f.batchId, `export-${legacyId}.json`), JSON.stringify({
    schema: 'datasecure-document-export/4', batch_id: f.batchId, operation_id: legacyId, request_sha256: legacyDigest,
    processing_mode: 'markdown-only', identity_binding_sha256: null, root: f.results,
    root_identity: bindDirectory(f.results).chain[0].identity, files: legacyFiles, selection }));
  assert.deepEqual(create().previewExport(f.batchId, legacyId, selection).files, legacyFiles);
  const legacyCopy = create().exportApproved(f.batchId, legacyId, selection);
  assert.match(fs.readFileSync(path.join(f.results, 'DataSecure-Markdown-Korrektur', legacyCopy.folder_name, 'Dokument_01.md'), 'utf8'), /anna@example/u);
  const anon = f.row(0);
  const opPath = path.join(f.data, 'document-reviews', f.batchId, 'export-' + '6'.repeat(32) + '.json');
  decide('restore_base');
  assert.equal(row.text_modified, false, 'restoring the generated baseline clears the current correction marker');
  assert.equal(create().list(f.batchId).documents.find(value => value.document_id === item.id).text_modified, false);
  const restored = create().list(f.batchId).documents.find(value => value.document_id === item.id);
  const rawSelection = [{ document_id: restored.document_id, revision: restored.revision, output_sha256: restored.output_sha256 }];
  const rawApproved = create().decideBatch(f.batchId, { action: 'approve', operation_id: '2'.repeat(32), selection: rawSelection });
  assert.equal(rawApproved.documents[0].processing_mode, 'markdown-only');
  assert.equal(rawApproved.documents[0].approved, true); assert.equal(rawApproved.documents[0].text_modified, false);
  const mixedSelection = [f.selection(0)[0], { document_id: item.id, revision: rawApproved.documents[0].revision,
    output_sha256: rawApproved.documents[0].output_sha256 }];
  throwsCode(() => create().decideBatch(f.batchId, { action: 'approve', operation_id: '3'.repeat(32), selection: mixedSelection }), 'DOCUMENT_REVIEW_INVALID');
  assert.equal(f.row(0).revision, 0, 'mixed-purpose selection cannot partially approve the first document');
  assert.equal(fs.readFileSync(path.join(folder, `${id}.md`), 'utf8'), markdown, 'the originally generated file is unchanged');
  const op = JSON.parse(fs.readFileSync(opPath));
  assert.equal(op.schema, 'datasecure-document-export/6');
  op.files[0].name = 'renamed.md'; fs.writeFileSync(opPath, JSON.stringify(op));
  throwsCode(() => create().previewExport(f.batchId, '6'.repeat(32), selection), 'AI_EXPORT_INVALID');
  throwsCode(() => f.store.decide(f.batchId, anon.document_id, { action: 'correct', ranges: [{ start: 0, end: 0, replacement: 'Anna Beispiel' }],
    revision: anon.revision, output_sha256: anon.output_sha256, operation_id: '7'.repeat(32) }), 'DOCUMENT_REVIEW_INVALID');
});

test('source spelling, collisions and native-safe leaf policy are shared and do not silently sanitize', () => {
  const { safeMarkdownOutputNames, validMarkdownInventory } = require('../plugins/data-secure/server/core/markdown-output-names');
  const items = ['a.pdf', 'a.docx', 'a (2).pdf', 'é.pdf', 'e\u0301.pdf', '🧪 Bericht.pdf'].map(source_label => ({ source_label }));
  assert.deepEqual(safeMarkdownOutputNames(items), ['a.md', 'a (2).md', 'a (2) (2).md', 'é.md', 'e\u0301 (2).md', '🧪 Bericht.md']);
  for (const source_label of ['CON.pdf', 'LPT1.pdf', 'COM¹.pdf', 'a:b.pdf', 'a?.pdf', '🧪'.repeat(64) + '.pdf']) {
    assert.throws(() => safeMarkdownOutputNames([{ source_label }]), error => error.code === 'DOCUMENT_EXPORT_NAME_INVALID' && error.failed_files[0].name === source_label);
  }
  for (const names of [['../a.md'], ['a.md', 'A.md'], ['é.md', 'e\u0301.md'], ['a.txt'], ['a\u200b.md']]) assert.equal(validMarkdownInventory(names), false);
});
test('packaged standalone service wires the bound run states used to classify review omissions', () => {
  const priorRoot = process.env.EU_PRIVACY_DATA_ROOT;
  const priorWorkspace = process.env.EU_PRIVACY_ROOT;
  const priorChannel = process.env.DATASECURE_PRODUCT_CHANNEL;
  try {
    const deps = defaultDependencies({ dataRoot: path.join(root, 'wired-review-dependencies') });
    assert.equal(typeof deps.readStates, 'function');
  } finally {
    for (const [key, value] of [['EU_PRIVACY_DATA_ROOT', priorRoot], ['EU_PRIVACY_ROOT', priorWorkspace],
      ['DATASECURE_PRODUCT_CHANNEL', priorChannel]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
test('export preview validates a multi-document decision chain once, not once per file', () => {
  const f = fixture();
  f.decision(0, 'approve'); f.decision(1, 'approve');
  const selection = f.store.list(f.batchId).documents.map(({ document_id, revision, output_sha256 }) =>
    ({ document_id, revision, output_sha256 }));
  const originalList = fs.readdirSync, run = path.join(f.data, 'document-reviews', f.batchId);
  let journalListings = 0;
  fs.readdirSync = function(folder) {
    if (folder === run) journalListings++;
    return originalList.apply(this, arguments);
  };
  try {
    const preview = f.store.previewExport(f.batchId, 'e'.repeat(32), selection);
    assert.equal(preview.files.length, 2);
  } finally { fs.readdirSync = originalList; }
  assert.equal(journalListings, 2, 'decision and commit lists must be enumerated once for the selected set');
});
test('anonymized export reuses one validated journal for file plan, identity overview and body copy', () => {
  const f = fixture(false, false, null, { documentCount: 5 });
  for (let index = 0; index < f.items.length; index++) f.decision(index, 'approve');
  const selection = f.store.list(f.batchId).documents.map(({ document_id, revision, output_sha256 }) =>
    ({ document_id, revision, output_sha256 }));
  const originalList = fs.readdirSync, run = path.join(f.data, 'document-reviews', f.batchId);
  let journalListings = 0;
  fs.readdirSync = function(folder) {
    if (folder === run && /\bat journal \(/u.test(new Error().stack || '')) journalListings++;
    return originalList.apply(this, arguments);
  };
  try {
    const result = f.store.exportApproved(f.batchId, 'd'.repeat(32), selection);
    assert.equal(result.exported_count, selection.length);
  } finally { fs.readdirSync = originalList; }
  assert.equal(journalListings, 2, 'the complete export validates decision and commit lists once');
});
test('new export combines planning, residual checks and identity capture but rereads every source before copy', () => {
  const f = fixture(true, true, null, { documentCount: 5,
    contentOptions: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false },
    policyMarker: require('../plugins/data-secure/server/core/person-field-policy').CONTENT_PERSON_FIELD_POLICY });
  const request = batchRequest(f), approved = f.store.decideBatch(f.batchId, request);
  const selection = approved.documents.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 }));
  const open = fs.openSync, engine = require('../plugins/data-secure/server/pii-engine'), residual = engine.scanResidual;
  let sources = 0, residuals = 0;
  fs.openSync = function(file, ...args) {
    if (typeof file === 'string' && file.endsWith(`${path.sep}base.json`)) sources++;
    return open.call(this, file, ...args);
  };
  engine.scanResidual = function(...args) { residuals++; return residual.apply(this, args); };
  let result;
  try { result = f.store.exportApproved(f.batchId, 'e'.repeat(32), selection); }
  finally { fs.openSync = open; engine.scanResidual = residual; }
  assert.equal(sources, selection.length * 2, 'one preparation pass and an independent fresh copy pass');
  assert.equal(residuals, selection.length, 'every candidate retains its residual gate');
  const target = path.join(f.results, 'DataSecure-KI-Export', result.folder_name);
  assert.ok(fs.readdirSync(target).every(name => fs.readFileSync(path.join(target, name), 'utf8') === f.text));
  const reference = f.store.resolveIdentityOverview(f.batchId, 'e'.repeat(32));
  assert.ok(fs.readFileSync(reference.local_path, 'utf8').includes('Anna Beispiel'), 'the reference retains the same traced identities');
  assert.equal(f.store.exportApproved(f.batchId, 'e'.repeat(32), selection, true).exported_count, selection.length);
});
test('source corruption after combined preparation is still rejected before a completed copy receipt', () => {
  const f = fixture(true, true, null, { documentCount: 3,
    contentOptions: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false },
    policyMarker: require('../plugins/data-secure/server/core/person-field-policy').CONTENT_PERSON_FIELD_POLICY });
  const approved = f.store.decideBatch(f.batchId, batchRequest(f));
  const selection = approved.documents.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 }));
  const link = fs.linkSync, operation = '9'.repeat(32); let changed = false;
  fs.linkSync = function(from, to, ...args) {
    if (!changed && to.endsWith(`export-${operation}-1-owner.json`)) {
      changed = true; const id = `ds_${f.items[2].id}`;
      const output = require('../plugins/data-secure/server/standalone/anonymized-store').anonymizedArtifactRoots().output;
      fs.writeFileSync(path.join(output, id, `${id}.md`), 'synthetic changed package');
    }
    return link.call(this, from, to, ...args);
  };
  try { throwsCode(() => f.store.exportApproved(f.batchId, operation, selection), 'DOCUMENT_REVIEW_INVALID'); }
  finally { fs.linkSync = link; }
  assert.equal(changed, true);
  assert.equal(fs.existsSync(path.join(f.data, 'document-reviews', f.batchId, `export-${operation}-complete.json`)), false);
});
test('automatic basis approval is freshly reverified for copy without a duplicate preparation residual scan', () => {
  const f = fixture(true, true, null, { documentCount: 2, reviewPolicy: 'automatic-conservative',
    contentOptions: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false },
    policyMarker: require('../plugins/data-secure/server/core/person-field-policy').CONTENT_PERSON_FIELD_POLICY });
  const selection = f.store.list(f.batchId).documents.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 }));
  const engine = require('../plugins/data-secure/server/pii-engine'), residual = engine.scanResidual; let checks = 0;
  engine.scanResidual = function(...args) { checks++; return residual.apply(this, args); };
  try { assert.equal(f.store.exportApproved(f.batchId, '6'.repeat(32), selection).exported_count, selection.length); }
  finally { engine.scanResidual = residual; }
  assert.equal(checks, selection.length * 2, 'each fresh current() verifies the automatic basis, in preparation and before copying');
});
test('membership read fast path still rejects changed source bindings instead of repairing or trusting them', () => {
  const f = fixture(true), approved = f.store.decideBatch(f.batchId, batchRequest(f));
  const selection = approved.documents.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 }));
  const receipt = path.join(f.data, 'document-reviews', f.batchId, `published-${selection[0].document_id}.json`);
  const changed = { ...JSON.parse(fs.readFileSync(receipt)), source_sha256: 'f'.repeat(64) };
  fs.writeFileSync(receipt, JSON.stringify(changed));
  throwsCode(() => f.store.previewExport(f.batchId, '5'.repeat(32), selection), 'DOCUMENT_REVIEW_CONFLICT');
  assert.deepEqual(JSON.parse(fs.readFileSync(receipt)), changed, 'a conflicting existing receipt is never overwritten');
});
if (process.env.DATASECURE_PREVIEW_STRESS === '1') test('synthetic 132-document preview stays below the former desktop deadline', () => {
  const f = fixture(false, false, null, { documentCount: 132 });
  for (const row of f.store.list(f.batchId).documents) f.store.decide(f.batchId, row.document_id,
    { action: 'approve', ranges: [], revision: row.revision, output_sha256: row.output_sha256,
      operation_id: crypto.randomBytes(16).toString('hex') });
  const selection = f.store.list(f.batchId).documents.map(({ document_id, revision, output_sha256 }) =>
    ({ document_id, revision, output_sha256 }));
  const start = performance.now();
  const plan = f.store.previewExport(f.batchId, 'f'.repeat(32), selection);
  const elapsed = performance.now() - start;
  assert.equal(plan.files.length, 132);
  assert.ok(elapsed < 30_000, `synthetic 132-document preview took ${Math.round(elapsed)} ms`);
});
testAsync('native preparation streams independently revalidated bodies with a single preparation pass', async () => {
  const f = fixture(true, false, null, { documentCount: 3 }), approved = f.store.decideBatch(f.batchId, batchRequest(f));
  const selection = approved.documents.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 }));
  const identity = { volume: '1', object: '1', created_ns: '1' }, bodies = new Map();
  const binding = { schema: 'datasecure-native-export-binding/1', root: f.results, private_name: `native-export-${'1'.repeat(32)}`,
    root_identity: identity, data_root_identity: identity, private_identity: identity, anonymize_identity: identity, markdown_identity: identity };
  let complete = false, ackStatus = 'acknowledged'; const nativeCommands = [];
  const native = createDocumentReviewStore({ dataRoot: f.data, outputRoot: () => f.output, nativeBinding: () => binding,
    nativeExport: async (op, command, body) => {
      nativeCommands.push(command);
      if (command === 'write_body') {
        const previous = bodies.get(body.index) || Buffer.alloc(0); assert.equal(previous.length, body.offset);
        const bytes = Buffer.concat([previous, Buffer.from(body.hex, 'hex')]); bodies.set(body.index, bytes);
        if (body.final_chunk) { assert.equal(bytes.toString(), f.text); assert.equal(sha(bytes), Buffer.from(op.files[body.index].sha256).toString('hex')); }
        return body.final_chunk ? 'staged' : 'receiving';
      }
      if (command === 'publish') { complete = true; return 'completed'; }
      if (command === 'reconcile') return complete ? 'completed' : 'unprepared';
      if (command === 'acknowledge') return ackStatus;
      throw Error('UNEXPECTED_NATIVE_COMMAND');
    } });
  const open = fs.openSync; let sources = 0;
  fs.openSync = function(file, ...args) { if (typeof file === 'string' && file.endsWith(`${path.sep}base.json`)) sources++;
    return open.call(this, file, ...args); };
  let result;
  try { result = await native.exportApproved(f.batchId, '8'.repeat(32), selection); }
  finally { fs.openSync = open; }
  assert.equal(sources, selection.length * 2); assert.equal(bodies.size, selection.length);
  f.decision(0, 'revoke');
  ackStatus = 'prepared';
  await assert.rejects(native.exportApproved(f.batchId, '8'.repeat(32), selection, true), { code: 'AI_EXPORT_INCOMPLETE' });
  assert.equal(fs.existsSync(path.join(f.data, 'document-reviews', f.batchId, `export-${'8'.repeat(32)}-acknowledged.json`)), false,
    'a non-ACK status cannot become a saved receipt acknowledgement');
  ackStatus = 'acknowledged'; nativeCommands.length = 0;
  assert.deepEqual(await native.exportApproved(f.batchId, '8'.repeat(32), selection, true), result,
    'the lost-ACK path still reconciles only the existing completed copy after revocation');
  assert.deepEqual(nativeCommands, ['acknowledge'], 'native ACK already revalidates the complete copy, without a preceding duplicate reconcile');
  await assert.rejects(native.exportApproved(f.batchId, '7'.repeat(32), selection), { code: 'DOCUMENT_REVIEW_STALE' });
});
done();
