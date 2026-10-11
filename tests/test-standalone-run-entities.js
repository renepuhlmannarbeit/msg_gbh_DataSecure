'use strict';
// Actual engine, private files and reopened projection. Faults are injected
// solely at the common journal commit, not claimed as native GUI evidence.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Standalone atomic run entity decisions');
const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const pii = require('../plugins/data-secure/server/pii-engine'), policy = require('../plugins/data-secure/server/privacy/policy');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-run-entities-')); let serial = 0;
function fixture(texts = ['Name: Anna Beispiel\n42 Projekte.', 'Name: Anna Beispiel\n17 Projekte.', 'Name: Bernd Mustermann\n31 Projekte.'], count = texts.length, registry) {
  const folder = path.join(root, String(++serial)), data = path.join(folder, 'data'), output = path.join(folder, 'output'), results = path.join(folder, 'results');
  for (const dir of [data, output, results]) fs.mkdirSync(dir, { recursive: true });
  const batchId = crypto.randomBytes(32).toString('hex'), items = texts.map((text, index) => ({ id: String(index + 1).repeat(32),
    name: `Unterordner/Quelle-${index + 1}.txt`, sha256: sha(text), status: 'released' }));
  const state = { product_channel: 'standalone', standalone_document_review: true, processing_mode: 'markdown-and-anonymize', token: batchId, items };
  const create = () => createDocumentReviewStore({ dataRoot: data, outputRoot: () => output, resultRoot: () => results, expectedDocuments: () => items });
  function capture(index, override) {
    const item = items[index], raw = texts[index], result = pii.anonymize(raw, 'general', { captureTransformPlan: true, ...(registry ? { registry } : {}) }), id = `ds_${item.id}`;
    create().capture(state, override || item, { package_id: `ds_${(override || item).id}`, original_text: raw, markdown: result.text,
      transform_trace: result.transform_trace, verification_context: { profile: 'general', dictionary: result.dictionary,
        strong_person_anchor: result.strongPersonAnchor === true, ruleset: policy.PRIVACY_RULESET_VERSION,
        credential_policy: policy.CREDENTIAL_CONTEXT_POLICY_VERSION, reviewed_ranges: [] } });
    fs.mkdirSync(path.join(output, id));
    fs.writeFileSync(path.join(output, id, `${id}.md`), result.text);
    fs.writeFileSync(path.join(output, id, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/3', package_id: id,
      document: `${id}.md`, document_sha256: sha(result.text), verification: { text_residual_pii: 'passed' } }));
  }
  for (let index = 0; index < count; index++) capture(index);
  const row = index => create().list(batchId).documents.find(row => row.document_id === items[index].id);
  const entities = index => create().entities(batchId, items[index].id, row(index).revision, 0).entities;
  const request = (index, action, extra = {}) => ({ action, ranges: [], revision: row(index).revision,
    output_sha256: row(index).output_sha256, operation_id: crypto.randomBytes(16).toString('hex'), ...extra });
  const runRequest = (index, decision) => request(index, 'entities', { scope: 'run', entity_decisions:
    [{ entity_id: entities(index).find(row => row.kind === 'PERSON').entity_id, decision }] });
  const decide = (index, request) => create().decide(batchId, items[index].id, request);
  const text = index => create().chunk(batchId, items[index].id, row(index).revision, 0).markdown;
  return { batchId, items, state, data, output, results, create, capture, row, entities, request, runRequest, decide, text,
    journal: () => path.join(data, 'document-reviews', batchId) };
}
test('same exact person changes atomically across documents, not an unrelated local PERSON_001', () => {
  const f = fixture(); f.decide(0, f.request(0, 'approve')); f.decide(1, f.request(1, 'approve'));
  const request = f.runRequest(0, 'organization'), result = f.decide(0, request);
  assert.equal(result.affected_count, 2); assert.equal(result.scope, 'run');
  assert.equal(f.row(0).approved, false); assert.equal(f.row(1).approved, false); assert.equal(f.row(2).revision, 0);
  const a = f.entities(0)[0].replacement, b = f.entities(1)[0].replacement;
  assert.equal(a, b); assert.match(a, /^\[UNTERNEHMEN_[A-Z2-7]{52}\]$/u);
  assert.equal(f.text(2), 'Name: [PERSON_001]\n31 Projekte.');
  assert.deepEqual(f.decide(0, request), result, 'lost ACK replays the same common operation after reopening');
  for (const item of f.items) assert.equal(fs.readFileSync(path.join(f.output, `ds_${item.id}`, `ds_${item.id}.md`), 'utf8').includes('UNTERNEHMEN_'), false);
});
test('a commit failure before linking changes no document; a lost response after linking changes all', () => {
  for (const after of [false, true]) {
    const f = fixture(), request = f.runRequest(0, 'organization'), link = fs.linkSync; let injected = false;
    fs.linkSync = function(from, to) { if (!injected && /commit-000001\.json$/u.test(to)) {
      injected = true; if (after) link.apply(this, arguments); throw Object.assign(Error('fault'), { code: 'EIO' });
    } return link.apply(this, arguments); };
    try { assert.throws(() => f.decide(0, request)); assert.equal(injected, true); } finally { fs.linkSync = link; }
    assert.equal(f.row(0).revision, after ? 1 : 0); assert.equal(f.row(1).revision, after ? 1 : 0); assert.equal(f.row(2).revision, 0);
    assert.equal(f.decide(0, request).affected_count, 2);
  }
});
test('later captured members inherit the rule, but a foreign document or changed manifest cannot join', () => {
  const f = fixture(['Name: Anna Beispiel', 'Name: Anna Beispiel'], 1);
  assert.equal(f.decide(0, f.runRequest(0, 'organization')).affected_count, 1); f.capture(1);
  assert.equal(f.row(1).revision, 1); assert.equal(f.entities(0)[0].replacement, f.entities(1)[0].replacement);
  assert.equal(f.row(1).approved, false);
  assert.throws(() => f.capture(0, { ...f.items[0], id: 'a'.repeat(32) }), error => error.code === 'DOCUMENT_REVIEW_INVALID');
  f.state.items = [...f.items, { id: 'b'.repeat(32), sha256: sha('foreign'), name: 'foreign.txt' }];
  assert.throws(() => f.capture(0), error => error.code === 'DOCUMENT_REVIEW_CONFLICT');
});
test('a masked matching document aborts the run action with its filename and no partial decision', () => {
  const f = fixture(), e = f.entities(1)[0];
  f.decide(1, f.request(1, 'redact', { ranges: [{ start: e.output_start, end: e.output_end }] }));
  const response = f.decide(0, f.runRequest(0, 'organization'));
  assert.equal(response.ok, false); assert.equal(response.reason_code, 'DOCUMENT_ENTITY_RUN_CONFLICT');
  assert.equal(response.blocked_files[0].name, 'Unterordner/Quelle-2.txt');
  assert.equal(f.row(0).revision, 0); assert.equal(f.row(1).revision, 1); assert.equal(f.row(2).revision, 0);
});
test('run Keep never grants an exemption for explicit personal fields or direct contact details', () => {
  const f = fixture(); f.decide(0, f.runRequest(0, 'keep'));
  for (const index of [0, 1]) assert.throws(() => f.decide(index, f.request(index, 'approve')), error => error.code === 'DOCUMENT_REVIEW_RESIDUAL_PII');
  assert.equal(f.row(0).approved, false); assert.equal(f.row(1).approved, false);
});
test('exact NFC/case/whitespace identities match, different accents and surnames do not', () => {
  const f = fixture(['Name: Anna Beispiel', 'Name: ANNA   BEISPIEL', 'Name: Anna Béispiel']);
  assert.equal(f.decide(0, f.runRequest(0, 'organization')).affected_count, 2); assert.equal(f.row(2).revision, 0);
  const single = fixture(['Name: Beispiel']);
  assert.throws(() => single.decide(0, single.runRequest(0, 'organization')), error => error.code === 'DOCUMENT_ENTITY_RUN_UNAVAILABLE');
});

test('a proven local surname/slug follows its full identity across the run, but an ambiguous later surname does not', () => {
  const { createBatchPseudonymRegistry, READABLE_CONTRACT_VERSION } = require('../plugins/data-secure/server/batch-pseudonym-registry');
  const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 1), { contractVersion: READABLE_CONTRACT_VERSION });
  try {
    const f = fixture(['Name: Anna Beispiel\nAnna-Beispiel schrieb.\nFrau Beispiel antwortet.',
      'Name: Anna Beispiel\nName: Bernd Beispiel\nFrau Beispiel antwortet.'], 2, registry);
    const ambiguous = f.entities(1).find(row => /UNKLAR/u.test(row.replacement));
    assert.ok(ambiguous); assert.equal(ambiguous.run_eligible, false);
    assert.equal(f.entities(0).find(row => row.original === 'Anna Beispiel').run_eligible, true);
    assert.equal(f.decide(0, f.runRequest(0, 'organization')).affected_count, 2);
    const first = f.entities(0).find(row => row.original === 'Anna Beispiel');
    assert.equal((f.text(0).match(/\[UNTERNEHMEN_[A-Z2-7]{52}\]/gu) || []).length, 3);
    assert.equal(f.entities(1).find(row => row.original === 'Anna Beispiel').replacement, first.replacement);
    assert.equal(f.entities(1).find(row => row.entity_id === ambiguous.entity_id).replacement, ambiguous.replacement);
    assert.ok(f.text(1).includes(ambiguous.replacement));
  } finally { registry.dispose(); }
});
test('completed exports stay immutable and reconcilable; their old selections cannot start another export', () => {
  const f = fixture(); f.decide(0, f.request(0, 'approve'));
  const { document_id, revision, output_sha256 } = f.row(0), selection = [{ document_id, revision, output_sha256 }], operation = 'a'.repeat(32);
  const before = f.create().exportApproved(f.batchId, operation, selection);
  f.decide(1, f.runRequest(1, 'organization'));
  assert.deepEqual(f.create().exportApproved(f.batchId, operation, selection, true), before);
  assert.throws(() => f.create().exportApproved(f.batchId, 'b'.repeat(32), selection), error => error.code === 'DOCUMENT_REVIEW_STALE');
  assert.equal(f.row(0).approved, false);
});

test('a recomputed hash cannot legitimize a malformed, foreign or unbound journal event', () => {
  const f = fixture(); f.decide(0, f.runRequest(0, 'organization'));
  const file = path.join(f.journal(), 'decision-000001.json'), original = fs.readFileSync(file, 'utf8');
  const mutations = [
    record => { record.extra_authority = true; },
    record => { record.targets[0].document_id = 'f'.repeat(32); },
    record => { record.targets[0].event.operation_id = 'f'.repeat(32); },
    record => { record.targets[0].event.schema = undefined; },
    record => { record.targets[0].event.extra_text = 'raw'; },
    record => { record.targets[0].event.revision = 1001; },
    record => { record.rules = [null]; },
    record => { record.targets = [null]; }
  ];
  for (const mutate of mutations) {
    const record = JSON.parse(original); mutate(record); delete record.event_sha256;
    record.event_sha256 = sha(JSON.stringify(record)); fs.writeFileSync(file, JSON.stringify(record));
    assert.throws(() => f.create().list(f.batchId), error => ['DOCUMENT_REVIEW_INVALID', 'DOCUMENT_ENTITY_INVALID'].includes(error.code));
  }
  fs.writeFileSync(file, 'null');
  assert.throws(() => f.create().list(f.batchId), error => error.code === 'DOCUMENT_REVIEW_INVALID');
  fs.writeFileSync(file, original); assert.equal(f.row(0).revision, 1);
});
test('a hidden or missing final revision never revives a revoked approval', () => {
  const f = fixture(); f.decide(0, f.request(0, 'approve')); f.decide(0, f.request(0, 'revoke'));
  const readdir = fs.readdirSync, target = path.resolve(f.journal());
  fs.readdirSync = function(folder) { const values = readdir.apply(this, arguments);
    return path.resolve(String(folder)) === target ? values.filter(name => name !== 'decision-000002.json') : values; };
  try { assert.throws(() => f.create().list(f.batchId), error => error.code === 'DOCUMENT_REVIEW_INVALID'); }
  finally { fs.readdirSync = readdir; }
  const missing = path.join(f.journal(), 'decision-000002.json'), bytes = fs.readFileSync(missing);
  // Exact synthetic file removal simulates loss, not user data cleanup.
  fs.unlinkSync(missing);
  assert.equal(f.row(0).approved, false); assert.equal(f.row(0).revision, 2);
  assert.deepEqual(fs.readFileSync(missing), bytes, 'only the independently committed exact record is recovered');
  const { document_id, revision, output_sha256 } = f.row(0);
  assert.throws(() => f.create().exportApproved(f.batchId, 'e'.repeat(32), [{ document_id, revision, output_sha256 }]),
    error => error.code === 'DOCUMENT_REVIEW_UNAPPROVED');
});
test('loss of commit evidence or a conflicting mirror fails closed; no automatic legacy approval migration', () => {
  const f = fixture(); f.decide(0, f.request(0, 'approve'));
  const readdir = fs.readdirSync, target = path.resolve(f.journal());
  fs.readdirSync = function(folder) { const values = readdir.apply(this, arguments);
    return path.resolve(String(folder)) === target ? values.filter(name => name !== 'commit-000001.json') : values; };
  try { assert.throws(() => f.create().list(f.batchId), error => error.code === 'DOCUMENT_REVIEW_INVALID'); }
  finally { fs.readdirSync = readdir; }
  const exists = fs.existsSync;
  fs.existsSync = function(file) { return path.basename(String(file)) === 'journal-format.json' ? false : exists.apply(this, arguments); };
  try { assert.throws(() => f.create().list(f.batchId), error => error.code === 'DOCUMENT_REVIEW_POLICY_CHANGED'); }
  finally { fs.existsSync = exists; }
});
done();
