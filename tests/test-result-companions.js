'use strict';
// Actual private persistence, production replay/overview and real filesystem.
// The native callback below is an explicit model, NOT Rust/GUI/macOS evidence.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { test, testAsync, assert, done } = createSuite('Results / fixed confidential companions');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-result-companions-'));
const data = path.join(root, 'private'); fs.mkdirSync(data, { mode: 0o700 });
process.env.EU_PRIVACY_DATA_ROOT = data; process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone'; delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
const companions = require('../plugins/data-secure/server/standalone/result-companions');
const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const { bindDirectory, assertDirectory, readBoundFileRecord } = require('../plugins/data-secure/server/core/bound-file-io');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const code = (action, expected = 'RESULT_COMPANIONS_INVALID') => assert.throws(action, error => error.code === expected);
const content = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };
let serial = 0;
function fixture(count = 2) {
  const batchId = (++serial).toString(16).padStart(64, '0'), output = path.join(root, `result-${serial}`);
  fs.mkdirSync(output);
  const state = { schema: 'datasecure-batch/7', token: batchId, product_channel: 'standalone',
    processing_mode: 'markdown-and-anonymize', standalone_document_review: true, content_options: content,
    profile: 'general', output_naming_mode: 'neutral', items: [] };
  const identity = { volume: '1', object: '2', created_ns: '3' };
  const binding = { schema: 'datasecure-native-export-binding/1', root: output,
    private_name: `native-export-${'a'.repeat(32)}`, root_identity: identity, data_root_identity: identity,
    private_identity: identity, anonymize_identity: identity, markdown_identity: identity };
  const controls = {}, calls = [], operations = new Map(); let initial;
  const target = op => path.join(output, 'DataSecure-KI-Export', `Ergebnisse-${op.operation_id}`);
  const payload = op => [...op.files, ...(op.confidential ? companions.confidentialFiles(op.confidential)
    .map(({ key, name }) => ({ name, ...op.confidential[key] })) : [])];
  async function nativeExport(op, command, body) {
    assert.equal(op.publication_role, 'results'); assert.equal(op.batch_id, batchId);
    if (controls.activeOperation && controls.activeOperation !== op.operation_id) throw Error('MULTIPLE_NATIVE_OPS');
    controls.activeOperation = op.operation_id; calls.push({ command, operation_id: op.operation_id, body: body && clone(body) });
    let record = operations.get(op.operation_id);
    if (!record) {
      if (command === 'reconcile') return 'unprepared';
      record = { operation: JSON.stringify(op), files: payload(op), bodies: payload(op).map(() => Buffer.alloc(0)), status: 'unprepared' };
      operations.set(op.operation_id, record);
    }
    assert.equal(JSON.stringify(op), record.operation, 'native intent never changes across chunks');
    if (command === 'write_body') {
      assert.equal(body.offset, record.bodies[body.index].length);
      record.bodies[body.index] = Buffer.concat([record.bodies[body.index], Buffer.from(body.hex, 'hex')]);
      if (!body.final_chunk) return 'receiving';
      assert.equal(record.bodies[body.index].length, record.files[body.index].bytes);
      assert.equal(hash(record.bodies[body.index]), Buffer.from(record.files[body.index].sha256).toString('hex'));
      record.status = 'prepared'; return 'staged';
    }
    if (command === 'publish' && !record.directory) {
      fs.mkdirSync(target(op), { recursive: true });
      for (const [index, file] of record.files.entries()) {
        fs.mkdirSync(path.dirname(path.join(target(op), file.name)), { recursive: true });
        fs.writeFileSync(path.join(target(op), file.name), record.bodies[index], { flag: 'wx', mode: 0o600 });
      }
      record.directory = bindDirectory(target(op)); record.status = 'completed';
      if (controls.losePublish) { delete controls.losePublish; throw Object.assign(Error('lost reply'), { code: 'STANDALONE_IPC_TIMEOUT' }); }
    }
    if (record.directory && ['acknowledge', 'reconcile'].includes(command)) {
      assertDirectory(record.directory);
      if (controls.beforeReconcile && command === 'reconcile') {
        const callback = controls.beforeReconcile; delete controls.beforeReconcile; callback(target(op));
      }
      for (const [index, file] of record.files.entries()) assert.equal(hash(fs.readFileSync(path.join(target(op), file.name))), hash(record.bodies[index]));
    }
    if (command === 'acknowledge') record.status = 'acknowledged';
    return record.status;
  }
  const options = { dataRoot: data, resultRoot: () => output, nativeBinding: () => binding, nativeExport,
    initialResultPublication: () => initial };
  const store = createDocumentReviewStore(options);
  const original = 'Name: Anna Beispiel\nAnna Beispiel hat 42 Projekte.\nE-Mail: anna@example.invalid';
  for (let index = 0; index < count; index++) state.items.push({ id: (serial * 100 + index + 1).toString(16).padStart(32, '0'),
    name: `${index ? 'nested' : '=Formel'}/Quelle-${index + 1}.txt`, sha256: hash(original), status: 'released' });
  for (const item of state.items) {
    const packageId = `ds_${item.id}`;
    const captured = require('../plugins/data-secure/server/pii-engine').anonymize(original, 'general',
      { captureTransformPlan: true, productChannel: 'standalone', contentOptions: content });
    const artifactApi = require('../plugins/data-secure/server/standalone/anonymized-artifact');
    const coverage = { status: 'complete', reason_codes: [] };
    const proof = artifactApi.verifyAnonymizedPublication({ markdown: captured.text, profile: 'general', content_options: content,
      source_extraction: require('../plugins/data-secure/server/core/source-extraction-contract').createSourceExtraction(
        { source_type: 'txt', content_options: content, coverage, markdown: original }, 8_000_000),
      dictionary: captured.dictionary, strong_person_anchor: captured.strongPersonAnchor === true, reviewed_person_candidates: null });
    const artifact = artifactApi.createAnonymizedArtifact({ package_id: packageId, content_options: content, source_type: 'txt', profile: 'general',
      operation_id: crypto.randomUUID(), created_at: new Date().toISOString(), coverage, markdown: captured.text, verification_proof: proof });
    const folder = path.join(require('../plugins/data-secure/server/standalone/anonymized-store').anonymizedArtifactRoots().output, packageId);
    fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, `${packageId}.md`), artifact.markdown);
    fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(artifact.manifest));
    item.package_id = packageId; item.document_result = artifact.manifest.document_result;
    store.capture(state, item, { package_id: packageId, original_text: original, markdown: captured.text, content_options: content,
      source_type: 'txt', publication_binding: artifact.expectation, transform_trace: captured.transform_trace, verification_context: {
        profile: 'general', dictionary: captured.dictionary, strong_person_anchor: captured.strongPersonAnchor === true,
        ruleset: require('../plugins/data-secure/server/privacy/policy').PRIVACY_RULESET_VERSION,
        credential_policy: require('../plugins/data-secure/server/privacy/policy').CREDENTIAL_CONTEXT_POLICY_VERSION,
        person_field_policy: require('../plugins/data-secure/server/core/person-field-policy').CONTENT_PERSON_FIELD_POLICY,
        publication_frame: { prefix: '', suffix: '' }, reviewed_ranges: [] } });
  }
  const selection = () => store.list(batchId).documents.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 }))
    .sort((a, b) => a.document_id.localeCompare(b.document_id));
  const files = () => selection().map((row, index) => ({ name: `nested/Initial-${index + 1}.md`, sha256: row.output_sha256 }));
  const vector = selection();
  initial = { schema: 'datasecure-initial-results/1', binding_sha256: hash(batchId), root: output,
    processing_mode: state.processing_mode, files: vector.map((row, index) => ({ document_id: row.document_id, file: `Initial-${index + 1}.md` })) };
  const edit = () => {
    const row = selection()[0], text = store.chunk(batchId, row.document_id, row.revision, 0).markdown, start = text.indexOf('42');
    return store.decide(batchId, row.document_id, { action: 'redact', revision: row.revision, output_sha256: row.output_sha256,
      operation_id: crypto.randomBytes(16).toString('hex'), ranges: [{ start, end: start + 2 }] });
  };
  const publish = async (candidate = store) => { controls.activeOperation = null; return candidate.publishResults(batchId); };
  const resolve = async (candidate = store) => { controls.activeOperation = null; return candidate.resolveResultsGeneration(batchId); };
  const planFile = bindingHash => path.join(data, 'document-reviews', batchId, `companions-${bindingHash}.json`);
  function seedLegacy(complete = false, version = 1) {
    assert.ok([1, 2].includes(version));
    const chosen = selection(), legacyFiles = chosen.map((row, index) => ({ name: `Dokument_${String(index + 1).padStart(2, '0')}.md`, sha256: row.output_sha256 }));
    let companion = null;
    if (version === 2) {
      // Construct the frozen RC167 shape explicitly; the production reader
      // must accept it without deriving an XLSX or renaming its TXT.
      const modern = store.prepareResultCompanions(batchId, chosen, legacyFiles);
      const currentPlan = JSON.parse(fs.readFileSync(planFile(modern.binding_sha256)));
      const bodies = store.readResultCompanions(batchId, modern.binding_sha256, chosen, legacyFiles);
      const oldPlan = { ...currentPlan, schema: 'datasecure-result-companions/1',
        confidential: companions.confidentialDescriptor(bodies.filename_mapping, bodies.identities) };
      const bindingHash = hash(JSON.stringify(oldPlan));
      fs.writeFileSync(planFile(bindingHash), JSON.stringify(oldPlan), { flag: 'wx', mode: 0o600 });
      for (const [role, extension] of [['filename_mapping', 'csv'], ['identities', 'txt']])
        fs.writeFileSync(planFile(bindingHash).replace('.json', `-${role}.${extension}`), bodies[role], { flag: 'wx', mode: 0o600 });
      companion = { binding_sha256: bindingHash, confidential: oldPlan.confidential };
    }
    const opId = hash(JSON.stringify({ schema: `datasecure-results-vector/${version}`, batch_id: batchId,
      processing_mode: state.processing_mode, initial_binding_sha256: initial.binding_sha256, selection: chosen,
      ...(companion ? { companion_binding_sha256: companion.binding_sha256, confidential: companion.confidential } : {}) })).slice(0, 32);
    const bodies = chosen.map(row => Buffer.from(store.chunk(batchId, row.document_id, row.revision, 0).markdown));
    const op = { schema: `datasecure-results-generation/${version}`, batch_id: batchId, operation_id: opId,
      publication_role: 'results', processing_mode: state.processing_mode, selection: chosen, initial_binding_sha256: initial.binding_sha256,
      root: output, binding, files: chosen.map((row, index) => ({ name: `Dokument_${String(index + 1).padStart(2, '0')}.md`,
        bytes: bodies[index].length, sha256: [...Buffer.from(row.output_sha256, 'hex')] })), sequence: 1, parent_generation_id: null,
      ...(companion ? { companion_binding_sha256: companion.binding_sha256, confidential: companion.confidential } : {}) };
    op.request_sha256 = hash(JSON.stringify(op));
    const run = path.join(data, 'document-reviews', batchId);
    fs.writeFileSync(path.join(run, `results-generation-${opId}.json`), JSON.stringify(op), { flag: 'wx', mode: 0o600 });
    if (complete) {
      fs.mkdirSync(target(op), { recursive: true });
      if (companion) {
        fs.mkdirSync(path.join(target(op), 'Vertraulich'));
        const extra = store.readResultCompanions(batchId, companion.binding_sha256, chosen, legacyFiles);
        bodies.push(extra.filename_mapping, extra.identities);
      }
      const allFiles = payload(op);
      allFiles.forEach((file, index) => fs.writeFileSync(path.join(target(op), file.name), bodies[index], { flag: 'wx' }));
      const dir = bindDirectory(target(op));
      const directory = { path: dir.path, real: dir.real, chain: dir.chain, platform: dir.platform };
      const proofFiles = allFiles.map(file => { const read = readBoundFileRecord(path.join(target(op), file.name), { maximum: 100000, checkCtime: true });
        return { name: file.name, sha256: hash(read.bytes), identity: read.identity }; });
      const confidential = companion ? bindDirectory(path.join(target(op), 'Vertraulich')) : null;
      fs.writeFileSync(path.join(run, `results-generation-${opId}-complete.json`), JSON.stringify({
        schema: `datasecure-results-generation-complete/${version}`, batch_id: batchId, generation_id: opId,
        request_sha256: op.request_sha256, acknowledged: true, directory, files: proofFiles,
        ...(confidential ? { confidential_directory: { path: confidential.path, real: confidential.real, chain: confidential.chain, platform: confidential.platform } } : {}) }), { flag: 'wx', mode: 0o600 });
      const nativeOperation = { batch_id: batchId, operation_id: opId, processing_mode: state.processing_mode,
        request_sha256: op.request_sha256, publication_role: 'results', binding, files: op.files,
        ...(companion ? { confidential: companion.confidential } : {}) };
      operations.set(opId, { operation: JSON.stringify(nativeOperation), files: allFiles, bodies, directory: dir, status: 'acknowledged' });
    }
    return op;
  }
  return { batchId, store, options, output, selection, files, state, edit, publish, resolve, calls, operations, controls, target, planFile, seedLegacy };
}

test('fixed descriptor has exactly two roles, byte caps and no caller-selected paths', () => {
  const value = companions.confidentialDescriptor(Buffer.from('csv'), Buffer.from('txt'));
  assert.equal(companions.validConfidentialDescriptor(value), true);
  for (const change of [v => { v.extra = v.identities; }, v => { v.identities.name = '../x'; },
    v => { v.filename_mapping.bytes = 0; }, v => { v.filename_mapping.bytes = companions.MAX_MAPPING_BYTES + 1; },
    v => { v.identities.bytes = companions.MAX_IDENTITY_BYTES + 1; }, v => { v.identities.sha256[0] = 256; },
    v => { v.identities.sha256 = '0'.repeat(64); }]) {
    const candidate = clone(value); change(candidate); assert.equal(companions.validConfidentialDescriptor(candidate), false);
  }
  assert.equal(companions.FILENAME_MAPPING_PATH, 'Vertraulich/Dateizuordnung.csv');
  assert.equal(companions.LEGACY_IDENTITIES_PATH, 'Vertraulich/Personen-Pseudonym-Zuordnung.txt');
  assert.equal(companions.IDENTITIES_PATH, 'Vertraulich/Pseudonym-Zuordnung.txt');
  assert.equal(companions.confidentialFiles(value)[1].name, companions.LEGACY_IDENTITIES_PATH);
});

test('new descriptor has exactly three closed roles, fixed names and no null or downgrade', () => {
  const value = companions.confidentialDescriptor(Buffer.from('csv'), Buffer.from('txt'), Buffer.from('xlsx'));
  assert.equal(companions.confidentialVersion(value), 3);
  assert.equal(companions.validConfidentialDescriptor(value, 2), false);
  assert.equal(companions.validConfidentialDescriptor(value, 3), true);
  assert.deepEqual(companions.confidentialFiles(value).map(file => file.name),
    ['Vertraulich/Dateizuordnung.csv', 'Vertraulich/Pseudonym-Zuordnung.txt', 'Vertraulich/Pseudonym-Zuordnung.xlsx']);
  assert.equal(companions.confidentialBytes(value), 10);
  for (const change of [v => { v.workbook = null; }, v => { v.workbook.path = '../foreign'; },
    v => { v.workbook.bytes = 0; }, v => { v.workbook.bytes = companions.MAX_WORKBOOK_BYTES + 1; }]) {
    const candidate = clone(value); change(candidate); assert.equal(companions.validConfidentialDescriptor(candidate), false);
  }
});
test('CSV preserves exact NFC/NFD paths, quotes/formula-protects and maps actual output names', () => {
  const bytes = companions.buildFilenameMapping(['=SUM(1)', "'-Original", 'cafe\u0301/Quelle.txt'],
    ['Dokument_01.md', 'nested/Dokument_02.md', 'café/Initial.md'].map(name => ({ name, sha256: 'a'.repeat(64) })));
  assert.equal(bytes.subarray(0, 3).toString('hex'), 'efbbbf');
  assert.match(bytes.toString(), /"'=SUM\(1\)";"Dokument_01.md"/u);
  assert.match(bytes.toString(), /"''-Original"/u); assert.match(bytes.toString(), /cafe\u0301\/Quelle/u);
  const nfd = 'cafe\u0301/Initial.md';
  const exact = companions.buildFilenameMapping(['café/Quelle.txt'], [{ name: nfd, sha256: 'b'.repeat(64) }]);
  assert.ok(exact.includes(Buffer.from(nfd))); assert.equal(exact.includes(Buffer.from(nfd.normalize('NFC'))), false);
});
test('initial relative-path compatibility does not adopt the confidential namespace or traversal', () => {
  for (const name of ['mac/folder: name /Result.md', 'CON/Result.md', 'folder./Result.md'])
    assert.equal(companions.validResultCompanionFiles([{ name, sha256: 'a'.repeat(64) }]), true);
  for (const name of ['../Result.md', '/Result.md', 'x//Result.md', 'C:/Result.md', 'x\\Result.md', 'VERTRAULICH/Result.md',
    'Vertraulich/Dateizuordnung.csv', 'x/Result.md\u0000'])
    assert.equal(companions.validResultCompanionFiles([{ name, sha256: 'a'.repeat(64) }]), false);
});
test('prepare persists exact revision/body/name/semantic binding and read only returns matching buffers', () => {
  const f = fixture(), selection = f.selection(), files = f.files();
  const plan = f.store.prepareResultCompanions(f.batchId, selection, files), before = fs.readFileSync(f.planFile(plan.binding_sha256));
  assert.deepEqual(Object.keys(plan), ['binding_sha256', 'confidential']);
  const loaded = f.store.readResultCompanions(f.batchId, plan.binding_sha256, selection, files);
  assert.equal(Buffer.isBuffer(loaded.filename_mapping), true); assert.equal(Buffer.isBuffer(loaded.identities), true);
  assert.equal(Buffer.isBuffer(loaded.workbook), true); assert.equal(loaded.workbook.subarray(0, 2).toString(), 'PK');
  assert.equal(loaded.confidential.workbook.bytes, loaded.workbook.length);
  assert.equal(Buffer.from(loaded.confidential.workbook.sha256).toString('hex'), hash(loaded.workbook));
  assert.match(loaded.filename_mapping.toString(), /nested\/Initial-1.md/u);
  assert.match(loaded.identities.toString(), /Anna Beispiel|keine Identitäten erfunden/u);
  assert.match(loaded.identities.toString(), /Datei: "nested\/Initial-1.md"/u);
  assert.doesNotMatch(loaded.identities.toString(), /anna@example|42 Projekte/u);
  assert.equal(loaded.confidential.identities.bytes, loaded.identities.length);
  assert.equal(Buffer.from(loaded.confidential.identities.sha256).toString('hex'), hash(loaded.identities));
  assert.ok(fs.readFileSync(f.planFile(plan.binding_sha256)).equals(before));
  assert.deepEqual(f.store.prepareResultCompanions(f.batchId, selection, files), plan, 'idempotent same plan');
});
test('closed inputs reject wrong hash, selection order, duplicate names, extras and wrong batch', () => {
  const f = fixture(), selection = f.selection(), files = f.files(), plan = f.store.prepareResultCompanions(f.batchId, selection, files);
  code(() => f.store.prepareResultCompanions(f.batchId, selection, files.map(row => ({ ...row, bytes: 0 }))));
  code(() => f.store.prepareResultCompanions(f.batchId, selection, files.map(row => ({ ...row, sha256: 'e'.repeat(64) }))));
  code(() => f.store.readResultCompanions(f.batchId, plan.binding_sha256, [...selection].reverse(), files));
  code(() => f.store.readResultCompanions(f.batchId, plan.binding_sha256, selection, files.map(() => files[0])));
  const other = fixture(); code(() => other.store.readResultCompanions(other.batchId, plan.binding_sha256, selection, files));
});
test('missing private companion is refused by read without materializing or repairing it', () => {
  const f = fixture(), selection = f.selection(), files = f.files(), plan = f.store.prepareResultCompanions(f.batchId, selection, files);
  const file = f.planFile(plan.binding_sha256).replace('.json', '-identities.txt'); fs.unlinkSync(file);
  const parent = path.dirname(file), before = fs.readdirSync(parent).sort();
  code(() => f.store.readResultCompanions(f.batchId, plan.binding_sha256, selection, files));
  assert.equal(fs.existsSync(file), false); assert.deepEqual(fs.readdirSync(parent).sort(), before);
});

test('bound XLSX reads require neither serializer nor compression and never repair a missing workbook', () => {
  const f = fixture(), selection = f.selection(), files = f.files(), plan = f.store.prepareResultCompanions(f.batchId, selection, files);
  const filename = f.planFile(plan.binding_sha256).replace('.json', '-workbook.xlsx');
  const expected = fs.readFileSync(filename), compression = require('node:zlib'), original = compression.deflateRawSync;
  compression.deflateRawSync = () => { throw Error('READER_MUST_NOT_COMPRESS'); };
  try {
    assert.ok(f.store.readResultCompanions(f.batchId, plan.binding_sha256, selection, files).workbook.equals(expected));
    fs.unlinkSync(filename);
    code(() => f.store.readResultCompanions(f.batchId, plan.binding_sha256, selection, files));
    assert.equal(fs.existsSync(filename), false);
  } finally { compression.deflateRawSync = original; }
});
test('private plan, CSV, TXT, XLSX and semantic-record tampering all fail closed', () => {
  for (const role of ['plan', 'filename_mapping', 'identities', 'workbook', 'semantic']) {
    const f = fixture(), selection = f.selection(), files = f.files(), plan = f.store.prepareResultCompanions(f.batchId, selection, files);
    const file = role === 'plan' ? f.planFile(plan.binding_sha256) : role === 'semantic'
      ? path.join(path.dirname(f.planFile(plan.binding_sha256)), `identity-${JSON.parse(fs.readFileSync(f.planFile(plan.binding_sha256))).identity_binding_sha256}.json`)
      : f.planFile(plan.binding_sha256).replace('.json', `-${role}.${role === 'filename_mapping' ? 'csv' : role === 'workbook' ? 'xlsx' : 'txt'}`);
    fs.appendFileSync(file, role === 'plan' || role === 'semantic' ? '\n{}' : 'changed');
    code(() => f.store.readResultCompanions(f.batchId, plan.binding_sha256, selection, files));
  }
});
test('new actual filename plan changes binding while old immutable plan remains readable', () => {
  const f = fixture(), selection = f.selection(), files = f.files(), first = f.store.prepareResultCompanions(f.batchId, selection, files);
  const renamed = files.map((file, index) => ({ ...file, name: `Dokument_${String(index + 1).padStart(2, '0')}.md` }));
  const second = f.store.prepareResultCompanions(f.batchId, selection, renamed);
  assert.notEqual(first.binding_sha256, second.binding_sha256);
  const next = f.store.readResultCompanions(f.batchId, second.binding_sha256, selection, renamed);
  assert.match(next.filename_mapping.toString(), /Dokument_01.md/u); assert.doesNotMatch(next.filename_mapping.toString(), /Initial-/u);
  assert.ok(f.store.readResultCompanions(f.batchId, first.binding_sha256, selection, files).filename_mapping.length);
});
test('stale revisions cannot prepare new companions, but historical bound copies remain readable', () => {
  const f = fixture(), selection = f.selection(), files = f.files(), plan = f.store.prepareResultCompanions(f.batchId, selection, files);
  f.edit(); code(() => f.store.prepareResultCompanions(f.batchId, selection, files), 'DOCUMENT_REVIEW_STALE');
  assert.ok(f.store.readResultCompanions(f.batchId, plan.binding_sha256, selection, files).identities.length);
  const next = f.store.prepareResultCompanions(f.batchId, f.selection(), f.files());
  assert.notEqual(next.binding_sha256, plan.binding_sha256);
});
test('hardlinked private companion is not accepted as immutable private evidence', () => {
  const f = fixture(), selection = f.selection(), files = f.files(), plan = f.store.prepareResultCompanions(f.batchId, selection, files);
  const file = f.planFile(plan.binding_sha256).replace('.json', '-identities.txt'); fs.linkSync(file, path.join(root, `linked-${serial}.txt`));
  code(() => f.store.readResultCompanions(f.batchId, plan.binding_sha256, selection, files));
});
async function run() {
  await testAsync('v3 generation publishes three complete companions after MD bodies without fake approval', async () => {
    const f = fixture(); f.edit(); const result = await f.publish(), id = result.result_publication.generation_id;
    const privateOp = JSON.parse(fs.readFileSync(path.join(data, 'document-reviews', f.batchId, `results-generation-${id}.json`)));
    assert.equal(privateOp.schema, 'datasecure-results-generation/3'); assert.equal(privateOp.files.length, 2);
    assert.equal(companions.validConfidentialDescriptor(privateOp.confidential), true);
    const target = f.target(privateOp); assert.equal(fs.readdirSync(target).length, 3);
    assert.deepEqual(fs.readdirSync(path.join(target, 'Vertraulich')).sort(), ['Dateizuordnung.csv', 'Pseudonym-Zuordnung.txt', 'Pseudonym-Zuordnung.xlsx']);
    assert.match(fs.readFileSync(path.join(target, companions.FILENAME_MAPPING_PATH), 'utf8'), /Dokument_01.md/u);
    assert.deepEqual(f.calls.filter(call => call.command === 'write_body' && call.body.final_chunk).map(call => call.body.index), [0, 1, 2, 3, 4]);
    assert.equal(f.store.list(f.batchId).documents[0].approved, false, 'publication never creates an approval');
    const receipt = JSON.parse(fs.readFileSync(path.join(data, 'document-reviews', f.batchId, `results-generation-${id}-complete.json`)));
    assert.equal(receipt.schema, 'datasecure-results-generation-complete/3'); assert.equal(receipt.files.length, 5);
    assert.equal(receipt.confidential_directory.path, path.join(target, 'Vertraulich'));
    assert.equal((await f.resolve()).local_path, target);
  });
  await testAsync('lost publication reply resumes identical v3 operation, not a second generation', async () => {
    const f = fixture(); f.edit(); f.controls.losePublish = true;
    await assert.rejects(() => f.publish(), error => error.code === 'STANDALONE_IPC_TIMEOUT');
    const result = await f.publish(createDocumentReviewStore(f.options));
    assert.equal(f.operations.size, 1); assert.equal(result.result_publication.state, 'current');
  });
  await testAsync('unfinished legacy v1 resumes original MD-only intent, never silently gains companions', async () => {
    const f = fixture(); f.edit(); const legacy = f.seedLegacy(), before = fs.readFileSync(path.join(data, 'document-reviews', f.batchId,
      `results-generation-${legacy.operation_id}.json`));
    const result = await f.publish(); assert.equal(result.result_publication.generation_id, legacy.operation_id);
    assert.equal([...f.operations.values()][0].files.length, 2);
    assert.equal(fs.existsSync(path.join(f.target(legacy), 'Vertraulich')), false);
    assert.ok(fs.readFileSync(path.join(data, 'document-reviews', f.batchId, `results-generation-${legacy.operation_id}.json`)).equals(before));
    assert.equal(fs.readdirSync(path.join(data, 'document-reviews', f.batchId)).some(name => name.startsWith('companions-')), false);
  });
  await testAsync('confirmed legacy v1 remains unchanged on no-op, actual new save creates separate v3 generation', async () => {
    const f = fixture(); f.edit(); const legacy = f.seedLegacy(true), before = fs.readdirSync(f.target(legacy));
    assert.equal((await f.resolve()).local_path, f.target(legacy));
    assert.equal(fs.existsSync(path.join(f.target(legacy), 'Vertraulich')), false);
    assert.equal((await f.publish()).result_publication.generation_id, legacy.operation_id);
    const row = f.selection()[0];
    f.store.decide(f.batchId, row.document_id, { action: 'restore_base', revision: row.revision,
      output_sha256: row.output_sha256, operation_id: crypto.randomBytes(16).toString('hex'), ranges: [] });
    const result = await f.publish(); assert.notEqual(result.result_publication.generation_id, legacy.operation_id);
    assert.deepEqual(fs.readdirSync(f.target(legacy)), before);
    assert.equal(fs.existsSync(path.join(f.target({ operation_id: result.result_publication.generation_id }), companions.FILENAME_MAPPING_PATH)), true);
  });
  await testAsync('unfinished RC167 v2 resumes exact old operation and old TXT path without XLSX', async () => {
    const f = fixture(); f.edit(); const legacy = f.seedLegacy(false, 2);
    const operationPath = path.join(data, 'document-reviews', f.batchId, `results-generation-${legacy.operation_id}.json`);
    const before = fs.readFileSync(operationPath);
    const result = await f.publish(createDocumentReviewStore(f.options));
    assert.equal(result.result_publication.generation_id, legacy.operation_id);
    assert.equal(f.operations.size, 1); assert.ok(fs.readFileSync(operationPath).equals(before));
    assert.deepEqual(fs.readdirSync(path.join(f.target(legacy), 'Vertraulich')).sort(),
      ['Dateizuordnung.csv', 'Personen-Pseudonym-Zuordnung.txt']);
    assert.equal((await f.resolve()).local_path, f.target(legacy));
  });
  await testAsync('confirmed RC167 v2 stays byte-bound on read/no-op; only a new save creates XLSX generation', async () => {
    const f = fixture(); f.edit(); const legacy = f.seedLegacy(true, 2);
    const oldFolder = path.join(f.target(legacy), 'Vertraulich');
    const old = fs.readdirSync(oldFolder).map(name => [name, hash(fs.readFileSync(path.join(oldFolder, name)))]);
    assert.equal((await f.resolve(createDocumentReviewStore(f.options))).local_path, f.target(legacy));
    assert.equal((await f.publish()).result_publication.generation_id, legacy.operation_id);
    const row = f.selection()[0];
    f.store.decide(f.batchId, row.document_id, { action: 'restore_base', revision: row.revision,
      output_sha256: row.output_sha256, operation_id: crypto.randomBytes(16).toString('hex'), ranges: [] });
    const next = await f.publish(); assert.notEqual(next.result_publication.generation_id, legacy.operation_id);
    assert.deepEqual(fs.readdirSync(oldFolder).map(name => [name, hash(fs.readFileSync(path.join(oldFolder, name)))]), old);
    assert.equal(fs.existsSync(path.join(f.target({ operation_id: next.result_publication.generation_id }), companions.WORKBOOK_PATH)), true);
  });
  await testAsync('deleted/changed confidential file or foreign sibling prevents opening without repair', async () => {
    for (const mode of ['deleted', 'changed', 'foreign']) {
      const f = fixture(); f.edit(); const result = await f.publish();
      const folder = f.target({ operation_id: result.result_publication.generation_id });
      const file = path.join(folder, companions.IDENTITIES_PATH);
      if (mode === 'deleted') fs.unlinkSync(file);
      else if (mode === 'changed') fs.appendFileSync(file, 'changed');
      else fs.writeFileSync(path.join(folder, 'Vertraulich', 'foreign.csv'), 'not ours');
      const before = fs.readdirSync(path.dirname(file)).sort();
      await assert.rejects(() => f.resolve(), error => error.code === 'RESULT_PUBLICATION_CONFLICT');
      assert.deepEqual(fs.readdirSync(path.dirname(file)).sort(), before);
      if (mode === 'deleted') assert.equal(fs.existsSync(file), false);
    }
  });
  await testAsync('equal bytes in a replaced confidential directory do not gain receipt authority', async () => {
    const f = fixture(); f.edit(); const result = await f.publish();
    const folder = path.join(f.target({ operation_id: result.result_publication.generation_id }), 'Vertraulich');
    const previous = path.join(f.output, 'old-confidential'); fs.renameSync(folder, previous); fs.mkdirSync(folder);
    for (const name of fs.readdirSync(previous)) fs.renameSync(path.join(previous, name), path.join(folder, name));
    await assert.rejects(() => f.resolve(), error => error.code === 'RESULT_PUBLICATION_CONFLICT');
  });
  await done();
}
run().catch(error => { console.error(error); process.exitCode = 1; return done(); });
