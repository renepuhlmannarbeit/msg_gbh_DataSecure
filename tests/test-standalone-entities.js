'use strict';
// Actual private store/files and actual privacy verifier. The synthetic
// false-positive trace explicitly models a real applied replacement; it is
// not evidence that today's detector makes that particular classification.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Standalone reversible actual entities');
const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const { createTransformTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const policy = require('../plugins/data-secure/server/privacy/policy');
const pii = require('../plugins/data-secure/server/pii-engine');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-entities-')), hash = text => crypto.createHash('sha256').update(text).digest('hex');
let serial = 0;
function fixture(raw = '😀 Name: Anna Beispiel\nAnna Beispiel hat 42 Projekte.\nE-Mail: anna@example.invalid', synthetic) {
  const dir = path.join(root, String(++serial)), output = path.join(dir, 'packages'), results = path.join(dir, 'results'), data = path.join(dir, 'private');
  for (const folder of [output, results, data]) fs.mkdirSync(folder, { recursive: true });
  const batchId = crypto.randomBytes(32).toString('hex'), item = { id: crypto.randomBytes(16).toString('hex'), name: 'nested/Quelle.txt', sha256: hash(raw), status: 'released' };
  const result = synthetic || pii.anonymize(raw, 'general', { captureTransformPlan: true }), id = `ds_${item.id}`, folder = path.join(output, id); fs.mkdirSync(folder);
  const create = () => createDocumentReviewStore({ dataRoot: data, outputRoot: () => output, resultRoot: () => results, expectedDocuments: () => [item] });
  create().capture({ product_channel: 'standalone', processing_mode: 'markdown-and-anonymize', token: batchId }, item,
    { package_id: id, original_text: raw, markdown: result.text, transform_trace: result.transform_trace,
      verification_context: { profile: 'general', dictionary: result.dictionary, strong_person_anchor: result.strongPersonAnchor === true,
        ruleset: policy.PRIVACY_RULESET_VERSION, credential_policy: policy.CREDENTIAL_CONTEXT_POLICY_VERSION,
        publication_frame: result.publication_frame || { prefix: '', suffix: '' }, reviewed_ranges: result.reviewed_ranges || [] } });
  fs.writeFileSync(path.join(folder, `${id}.md`), result.text);
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/3', package_id: id, document: `${id}.md`,
    document_sha256: hash(result.text), verification: { text_residual_pii: 'passed' } }));
  const row = () => create().list(batchId).documents[0];
  const values = () => create().entities(batchId, item.id, row().revision, 0).entities;
  const decide = (action, entities = [], ranges = [], operation = crypto.randomBytes(16).toString('hex')) => {
    const value = row(), request = { action, ranges, revision: value.revision, output_sha256: value.output_sha256, operation_id: operation,
      ...(action === 'entities' ? { entity_decisions: entities } : {}) };
    return { request, response: create().decide(batchId, item.id, request) };
  };
  return { batchId, item, result, folder, data, output, results, create, row, values, decide,
    markdown: () => create().chunk(batchId, item.id, row().revision, 0).markdown };
}
function persistentPins(f) {
  const rows = [];
  for (const [role, folder] of [['private', f.data], ['packages', f.output], ['results', f.results]]) {
    const walk = target => {
      const stat = fs.lstatSync(target, { bigint: true }); assert.equal(stat.isSymbolicLink(), false);
      rows.push([role, path.relative(folder, target), stat.isDirectory() ? 'directory' : 'file',
        String(stat.dev), String(stat.ino), String(stat.mode), ...(stat.isFile() ? [hash(fs.readFileSync(target))] : [])]);
      if (stat.isDirectory()) for (const name of fs.readdirSync(target).sort()) walk(path.join(target, name));
    };
    walk(folder);
  }
  return rows;
}
function fixtureEntityKey(f) {
  // This older single-document fixture has no run manifest, so entities()
  // does not initialize the key. Supply the same closed test-owned initial
  // key before observing a decision's nonmutation, never a decision or ACK.
  const file = path.join(f.data, 'document-reviews', f.batchId, 'entity-key.json');
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ schema: 'datasecure-document-entity-key/1',
    key: crypto.randomBytes(32).toString('hex') }), { flag: 'wx', mode: 0o600 });
  const value = JSON.parse(fs.readFileSync(file));
  assert.equal(value.schema, 'datasecure-document-entity-key/1'); assert.match(value.key, /^[a-f0-9]{64}$/u);
  return Buffer.from(value.key, 'hex');
}
function seedHistoricalKeep(f, entityId) {
  // Explicitly test-owned pre-fix private revision. The current service never
  // authorizes this Keep: the actual replay/approval/export readers inspect it.
  const row = f.row(); assert.equal(row.revision, 0);
  const run = path.join(f.data, 'document-reviews', f.batchId), snapshot = JSON.parse(fs.readFileSync(path.join(run, f.item.id, 'base.json')));
  const key = fixtureEntityKey(f);
  const entity = require('../plugins/data-secure/server/gateway/standalone-entity-review');
  const request = { action: 'entities', ranges: [], revision: 0, output_sha256: row.output_sha256,
    operation_id: crypto.randomBytes(16).toString('hex'), entity_decisions: [{ entity_id: entityId, decision: 'keep' }] };
  const next = entity.applyEntityDecisions(snapshot.markdown, entity.initialEntities(snapshot), request.entity_decisions, key);
  const event = { schema: 'datasecure-document-revision/1', revision: 1, parent_sha256: row.output_sha256,
    output_sha256: hash(next.markdown), approved: false, action: 'entities', ranges: [],
    operation_id: request.operation_id, request_sha256: hash(JSON.stringify(request)), entity_decisions: request.entity_decisions };
  fs.writeFileSync(path.join(run, f.item.id, 'revision-000001.json'), JSON.stringify(event), { flag: 'wx', mode: 0o600 });
  return request;
}
test('actual repeated source spans group once and source/output offsets match exact text', () => {
  const f = fixture(), rows = f.values(), person = rows.find(row => row.kind === 'PERSON');
  assert.equal(f.row().entity_review_available, true); assert.equal(person.count, 2);
  assert.equal(person.original, 'Anna Beispiel'); assert.equal(f.markdown().slice(person.output_start, person.output_end), person.replacement);
  assert.ok(rows.some(row => row.kind === 'EMAIL'));
});
test('typed changes are durable, idempotent and invalidate approval without touching the package', () => {
  const f = fixture(), person = f.values().find(row => row.kind === 'PERSON'); f.decide('approve');
  const { request, response } = f.decide('entities', [{ entity_id: person.entity_id, decision: 'organization' }]);
  assert.equal(response.approved, false); assert.equal(f.create().decide(f.batchId, f.item.id, request).revision, response.revision);
  const value = f.values().find(row => row.entity_id === person.entity_id);
  assert.match(value.replacement, /^\[UNTERNEHMEN_[A-Z2-7]{52}\]$/u); assert.equal(value.count, 2);
  assert.equal(f.markdown().split(value.replacement).length, 3); f.decide('approve');
  assert.equal(fs.readFileSync(path.join(f.folder, `ds_${f.item.id}.md`), 'utf8'), f.result.text);
});
test('unsafe Keep is refused before any private revision, package or result mutation', () => {
  for (const kind of ['PERSON', 'EMAIL']) {
    const f = fixture(), entity = f.values().find(row => row.kind === kind);
    assert.ok(entity); fixtureEntityKey(f);
    const row = f.row(), entities = f.values(), markdown = f.markdown(), before = persistentPins(f);
    const { request, response } = f.decide('entities', [{ entity_id: entity.entity_id, decision: 'keep' }]);
    assert.deepEqual(response, { ok: false, reason_code: 'DOCUMENT_ENTITY_RUN_CONFLICT',
      blocked_files: [{ name: f.item.name, reason_code: 'DOCUMENT_REVIEW_RESIDUAL_PII' }], local_ui_only: true, external_disclosure: false });
    assert.deepEqual(f.create().decide(f.batchId, f.item.id, request), response, 'a refused operation grants no historical success ACK');
    assert.deepEqual(f.row(), row); assert.deepEqual(f.values(), entities); assert.equal(f.markdown(), markdown);
    assert.equal(f.row().revision, 0); assert.equal(f.row().approved, false);
    assert.throws(() => f.create().exportApproved(f.batchId, 'a'.repeat(32), [{ document_id: f.item.id,
      revision: row.revision, output_sha256: row.output_sha256 }]), error => error.code === 'DOCUMENT_REVIEW_UNAPPROVED');
    assert.deepEqual(persistentPins(f), before, 'all private/package/result objects and bytes remain unchanged');
    assert.equal(f.decide('approve').response.approved, true, 'the unchanged safe basis still passes its real approval gate');
  }
});
test('historical unsafe Keep cannot acquire a new approval, preview or export', () => {
  for (const kind of ['PERSON', 'EMAIL']) {
    const f = fixture(), entity = f.values().find(row => row.kind === kind);
    assert.ok(entity); const request = seedHistoricalKeep(f, entity.entity_id), row = f.row(), before = persistentPins(f);
    assert.equal(row.revision, 1); assert.equal(row.approved, false);
    assert.ok(f.markdown().includes(entity.original), 'the historical fixture actually contains the kept personal value');
    assert.equal(f.create().decide(f.batchId, f.item.id, request).revision, 1, 'only the exact historical ACK remains idempotent');
    assert.throws(() => f.decide('approve'), error => error.code === 'DOCUMENT_REVIEW_RESIDUAL_PII');
    const selection = [{ document_id: f.item.id, revision: row.revision, output_sha256: row.output_sha256 }];
    assert.throws(() => f.create().previewExport(f.batchId, 'b'.repeat(32), selection), error => error.code === 'DOCUMENT_REVIEW_RESIDUAL_PII');
    assert.throws(() => f.create().exportApproved(f.batchId, 'a'.repeat(32), [{ document_id: f.item.id,
      revision: row.revision, output_sha256: row.output_sha256 }]), error => error.code === 'DOCUMENT_REVIEW_UNAPPROVED');
    assert.deepEqual(f.row(), row); assert.deepEqual(persistentPins(f), before, 'historical refusal never rewrites or publishes the unsafe revision');
  }
});
test('an exact false-positive Keep is local to its occurrence, never a global allowlist', () => {
  const raw = 'Vertrag: Service Level ist vereinbart.', start = raw.indexOf('Service Level'), end = start + 13;
  const text = raw.slice(0, start) + '[PERSON_001]' + raw.slice(end), trace = createTransformTrace(raw);
  trace.append('entities', raw, text, [{ start, end, original: 'Service Level', replacement: '[PERSON_001]', kind: 'PERSON' }]);
  const f = fixture(raw, { text, dictionary: [{ type: 'PERSON', value: 'Service Level' }], transform_trace: trace.finish(text) });
  f.decide('entities', [{ entity_id: f.values()[0].entity_id, decision: 'keep' }]); f.decide('approve');
  assert.match(f.markdown(), /Service Level/u); assert.equal(f.row().approved, true);
  assert.ok(pii.scanResidual(raw, 'general', [{ type: 'PERSON', value: 'Service Level' }]).length > 0, 'a separate call has no waiver');
});
test('the actual compliance comment and rendered frame do not prevent unchanged or edited approval', () => {
  const raw = 'Vertrag: Service Level ist vereinbart.', start = raw.indexOf('Service Level'), end = start + 13;
  const body = raw.slice(0, start) + '[PERSON_001]' + raw.slice(end), trace = createTransformTrace(raw);
  trace.append('entities', raw, body, [{ start, end, original: 'Service Level', replacement: '[PERSON_001]', kind: 'PERSON' }]);
  const prefix = require('../plugins/data-secure/server/gateway/compliance').complianceHeader('general', { ext: '.txt', productChannel: 'standalone', passes: 1,
    entityCount: 1, included: 0, review: 0, removed: 0, reidentificationRisk: 'context_dependent' });
  trace.append('publication-frame', body, prefix + body, [{ start: 0, end: 0, original: '', replacement: prefix, kind: 'TECHNICAL' }]);
  const f = fixture(raw, { text: prefix + body, dictionary: [{ type: 'PERSON', value: 'Service Level' }],
    transform_trace: trace.finish(prefix + body), publication_frame: { prefix, suffix: '' } });
  f.decide('approve'); assert.equal(f.row().approved, true);
  f.decide('entities', [{ entity_id: f.values()[0].entity_id, decision: 'keep' }]); f.decide('approve');
  assert.equal(f.row().approved, true); assert.match(f.markdown(), /Service Level/u);
});
test('additional masking never resurrects an overlapping entity; restore explicitly resets to the safe base', () => {
  const f = fixture(), entity = f.values().find(row => row.kind === 'PERSON');
  f.decide('redact', [], [{ start: entity.output_start, end: entity.output_end }]);
  assert.equal(f.values().find(row => row.entity_id === entity.entity_id).disabled, true);
  assert.throws(() => f.decide('entities', [{ entity_id: entity.entity_id, decision: 'keep' }]), error => error.code === 'DOCUMENT_ENTITY_INVALID');
  f.decide('restore_base'); assert.equal(f.markdown(), f.result.text); assert.equal(f.values().find(row => row.entity_id === entity.entity_id).disabled, false);
});
test('wrong revisions, unknown entity IDs and free replacements cannot enter the journal', () => {
  const f = fixture(), value = f.row(), request = { action: 'entities', revision: value.revision, output_sha256: value.output_sha256,
    ranges: [], operation_id: 'b'.repeat(32), entity_decisions: [{ entity_id: 'entity_999999', decision: 'keep' }] };
  assert.throws(() => f.create().decide(f.batchId, f.item.id, request), error => error.code === 'DOCUMENT_ENTITY_INVALID');
  assert.throws(() => f.create().decide(f.batchId, f.item.id, { ...request, revision: 9 }), error => error.code === 'DOCUMENT_REVIEW_STALE');
  request.entity_decisions[0].replacement = 'arbitrary text'; assert.throws(() => f.create().decide(f.batchId, f.item.id, request));
  assert.equal(f.row().revision, 0);
});
test('private IPC exposes closed entity IDs and choices, not paths, values or offsets', () => {
  const validate = require('../plugins/data-secure/server/standalone/desktop-ipc').validatePrivateMessage;
  const message = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'c'.repeat(16), action: 'get_document_entities',
    batch_id: 'd'.repeat(64), document_id: 'e'.repeat(32), revision: 0, page: 0 };
  assert.equal(validate(message), message);
  for (const extra of [{ path: 'C:/secret' }, { original: 'Anna Beispiel' }, { page: -1 }, { page: 0.5 }]) assert.throws(() => validate({ ...message, ...extra }));
});
done();
