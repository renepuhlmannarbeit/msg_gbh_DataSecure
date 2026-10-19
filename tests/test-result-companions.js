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
  const payload = op => [...op.files, ...(op.confidential ? Object.entries(companions.PATHS)
    .map(([role, name]) => ({ name, ...op.confidential[role] })) : [])];
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
  function seedLegacy(complete = false) {
    const chosen = selection(), opId = hash(JSON.stringify({ schema: 'datasecure-results-vector/1', batch_id: batchId,
      processing_mode: state.processing_mode, initial_binding_sha256: initial.binding_sha256, selection: chosen })).slice(0, 32);
    const bodies = chosen.map(row => Buffer.from(store.chunk(batchId, row.document_id, row.revision, 0).markdown));
    const op = { schema: 'datasecure-results-generation/1', batch_id: batchId, operation_id: opId,
      publication_role: 'results', processing_mode: state.processing_mode, selection: chosen, initial_binding_sha256: initial.binding_sha256,
      root: output, binding, files: chosen.map((row, index) => ({ name: `Dokument_${String(index + 1).padStart(2, '0')}.md`,
        bytes: bodies[index].length, sha256: [...Buffer.from(row.output_sha256, 'hex')] })), sequence: 1, parent_generation_id: null };
    op.request_sha256 = hash(JSON.stringify(op));
    const run = path.join(data, 'document-reviews', batchId);
    fs.writeFileSync(path.join(run, `results-generation-${opId}.json`), JSON.stringify(op), { flag: 'wx', mode: 0o600 });
    if (complete) {
      fs.mkdirSync(target(op), { recursive: true });
      op.files.forEach((file, index) => fs.writeFileSync(path.join(target(op), file.name), bodies[index], { flag: 'wx' }));
      const dir = bindDirectory(target(op));
      const directory = { path: dir.path, real: dir.real, chain: dir.chain, platform: dir.platform };
      const proofFiles = op.files.map(file => { const read = readBoundFileRecord(path.join(target(op), file.name), { maximum: 100000, checkCtime: true });
        return { name: file.name, sha256: hash(read.bytes), identity: read.identity }; });
      fs.writeFileSync(path.join(run, `results-generation-${opId}-complete.json`), JSON.stringify({
        schema: 'datasecure-results-generation-complete/1', batch_id: batchId, generation_id: opId,
        request_sha256: op.request_sha256, acknowledged: true, directory, files: proofFiles }), { flag: 'wx', mode: 0o600 });
      const nativeOperation = { batch_id: batchId, operation_id: opId, processing_mode: state.processing_mode,
        request_sha256: op.request_sha256, publication_role: 'results', binding, files: op.files };
      operations.set(opId, { operation: JSON.stringify(nativeOperation), files: op.files, bodies, directory: dir, status: 'acknowledged' });
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
  assert.equal(companions.IDENTITIES_PATH, 'Vertraulich/Personen-Pseudonym-Zuordnung.txt');
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
test('private plan, CSV, TXT and semantic-record tampering all fail closed', () => {
  for (const role of ['plan', 'filename_mapping', 'identities', 'semantic']) {
    const f = fixture(), selection = f.selection(), files = f.files(), plan = f.store.prepareResultCompanions(f.batchId, selection, files);
    const file = role === 'plan' ? f.planFile(plan.binding_sha256) : role === 'semantic'
      ? path.join(path.dirname(f.planFile(plan.binding_sha256)), `identity-${JSON.parse(fs.readFileSync(f.planFile(plan.binding_sha256))).identity_binding_sha256}.json`)
      : f.planFile(plan.binding_sha256).replace('.json', `-${role}.${role === 'filename_mapping' ? 'csv' : 'txt'}`);
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
  await testAsync('v2 generation publishes two complete companions after MD bodies without fake approval', async () => {
    const f = fixture(); f.edit(); const result = await f.publish(), id = result.result_publication.generation_id;
    const privateOp = JSON.parse(fs.readFileSync(path.join(data, 'document-reviews', f.batchId, `results-generation-${id}.json`)));
    assert.equal(privateOp.schema, 'datasecure-results-generation/2'); assert.equal(privateOp.files.length, 2);
    assert.equal(companions.validConfidentialDescriptor(privateOp.confidential), true);
    const target = f.target(privateOp); assert.equal(fs.readdirSync(target).length, 3);
    assert.deepEqual(fs.readdirSync(path.join(target, 'Vertraulich')).sort(), ['Dateizuordnung.csv', 'Personen-Pseudonym-Zuordnung.txt']);
    assert.match(fs.readFileSync(path.join(target, companions.FILENAME_MAPPING_PATH), 'utf8'), /Dokument_01.md/u);
    assert.deepEqual(f.calls.filter(call => call.command === 'write_body' && call.body.final_chunk).map(call => call.body.index), [0, 1, 2, 3]);
    assert.equal(f.store.list(f.batchId).documents[0].approved, false, 'publication never creates an approval');
    const receipt = JSON.parse(fs.readFileSync(path.join(data, 'document-reviews', f.batchId, `results-generation-${id}-complete.json`)));
    assert.equal(receipt.schema, 'datasecure-results-generation-complete/2'); assert.equal(receipt.files.length, 4);
    assert.equal(receipt.confidential_directory.path, path.join(target, 'Vertraulich'));
    assert.equal((await f.resolve()).local_path, target);
  });
  await testAsync('lost publication reply resumes identical v2 operation, not a second generation', async () => {
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
  await testAsync('confirmed legacy v1 is read-only, explicit new save creates separate v2 generation', async () => {
    const f = fixture(); f.edit(); const legacy = f.seedLegacy(true), before = fs.readdirSync(f.target(legacy));
    assert.equal((await f.resolve()).local_path, f.target(legacy));
    assert.equal(fs.existsSync(path.join(f.target(legacy), 'Vertraulich')), false);
    const result = await f.publish(); assert.notEqual(result.result_publication.generation_id, legacy.operation_id);
    assert.deepEqual(fs.readdirSync(f.target(legacy)), before);
    assert.equal(fs.existsSync(path.join(f.target({ operation_id: result.result_publication.generation_id }), companions.FILENAME_MAPPING_PATH)), true);
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
