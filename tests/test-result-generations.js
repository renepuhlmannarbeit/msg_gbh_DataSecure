'use strict';
// Real content-bound initial publication, immutable review replay and actual
// BigInt filesystem identities. Native callbacks below are an explicit model,
// NOT evidence of the Rust broker, packaged OS UI or a native Mac transaction.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const vm = require('node:vm');
const { createSuite } = require('./helpers');
const { testAsync, test, assert, done } = createSuite('Standalone direct results / immutable correction generations');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-results-generations-'));
const data = path.join(root, 'private'); fs.mkdirSync(data, { mode: 0o700 });
process.env.EU_PRIVACY_DATA_ROOT = data;
process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const exporter = require('../plugins/data-secure/server/gateway/result-export');
const { bindDirectory, assertDirectory } = require('../plugins/data-secure/server/core/bound-file-io');
const { createPublicResultMetadataInspector, MAX_METADATA_BYTES, MAX_METADATA_TOTAL_BYTES } =
  require('../plugins/data-secure/server/core/public-result-metadata');
// Execute the ACTUAL helper source in an isolated synthetic Darwin context.
// Its IO and bound-file imports remain real Node filesystem implementations.
// These cases exercise the branch algorithm, not macOS APIs/O_NOFOLLOW,
// Finder, the native Rust transaction, or a real Darwin-process admission.
function metadataSourceModel(platform = 'darwin') {
  const file = require.resolve('../plugins/data-secure/server/core/public-result-metadata');
  const model = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module: model, process: Object.freeze({ platform }),
    require(specifier) {
      if (specifier === 'node:fs') return fs;
      if (specifier === 'node:path') return path;
      if (specifier === './bound-file-io') return require('../plugins/data-secure/server/core/bound-file-io');
      throw Error('unexpected metadata source-model import');
    } }, { filename: file, timeout: 1000 });
  return model.exports;
}
const createModelMetadataInspector = metadataSourceModel().createPublicResultMetadataInspector;
const { validatePrivateMessage } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const content = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };
let serial = 0;

// This builder deliberately invokes the real initial exporter, not a fabricated
// initialResultPublication dependency. It is also the fixture contract used by
// the separate real Node->Rust pipe test (which has its own native callback).
async function fixture({ mode = 'markdown-only', count = 2, legacy = false, separateFolders = false, sourceFolders = null,
  legacyLayout = false, legacyCompanions = false, deferInitial = false } = {}) {
  const batchId = (++serial).toString(16).padStart(64, '0'), results = path.join(root, `results-${serial}`);
  fs.mkdirSync(results); process.env.EU_PRIVACY_RESULT_ROOT = results;
  const state = { schema: 'datasecure-batch/7', token: batchId, product_channel: 'standalone', processing_mode: mode,
    standalone_document_review: true, content_options: content, profile: 'general', output_naming_mode: 'neutral',
    created_at: new Date(Date.UTC(2026, 9, 20, 0, 0, serial)).toISOString(), items: [] };
  const operations = new Map(), calls = [], controls = {}, original = 'Name: Anna Beispiel\nAnna Beispiel hat 42 Projekte.\nE-Mail: anna@example.invalid';
  const nativeIdentity = { volume: '1', object: '2', created_ns: '3' };
  const binding = { schema: 'datasecure-native-export-binding/1', root: results, private_name: `native-export-${'a'.repeat(32)}`,
    root_identity: nativeIdentity, data_root_identity: nativeIdentity, private_identity: nativeIdentity,
    anonymize_identity: nativeIdentity, markdown_identity: nativeIdentity };
  const target = op => path.join(results, mode === 'markdown-only' ? 'DataSecure-Markdown-Korrektur' : 'DataSecure-KI-Export', `Ergebnisse-${op.operation_id}`);
  async function nativeExport(op, command, body) {
    assert.equal(op.publication_role, 'results'); assert.equal(op.batch_id, batchId);
    if (controls.activeOperation && controls.activeOperation !== op.operation_id) throw Error('MULTIPLE_NATIVE_OPS_IN_ONE_REQUEST');
    controls.activeOperation = op.operation_id;
    calls.push({ command, operation_id: op.operation_id, publication_role: op.publication_role });
    let record = operations.get(op.operation_id);
    if (record) assert.equal(JSON.stringify(op), record.operation, 'stable native intent');
    else {
      if (command === 'reconcile') return 'unprepared';
      record = { operation: JSON.stringify(op), bodies: payloadFiles(op).map(() => Buffer.alloc(0)), status: 'unprepared' };
      operations.set(op.operation_id, record);
    }
    if (command === 'write_body') {
      assert.equal(body.offset, record.bodies[body.index].length);
      record.bodies[body.index] = Buffer.concat([record.bodies[body.index], Buffer.from(body.hex, 'hex')]);
      if (body.final_chunk) {
        assert.equal(sha(record.bodies[body.index]), Buffer.from(payloadFiles(op)[body.index].sha256).toString('hex'));
        assert.equal(record.bodies[body.index].length, payloadFiles(op)[body.index].bytes);
        record.status = 'prepared'; return 'staged';
      }
      return 'receiving';
    }
    if (command === 'publish') {
      if (controls.beforePublish) { const hook = controls.beforePublish; delete controls.beforePublish; hook(); }
      if (!record.directory) {
        fs.mkdirSync(target(op), { recursive: true });
        if (op.confidential) fs.mkdirSync(path.join(target(op), 'Vertraulich'));
        for (const [index, file] of payloadFiles(op).entries()) fs.writeFileSync(path.join(target(op), file.name), record.bodies[index], { flag: 'wx' });
        record.directory = bindDirectory(target(op)); record.status = 'completed';
      }
      if (controls.losePublish) { controls.losePublish = false; throw Object.assign(Error('lost native publish reply'), { code: 'STANDALONE_IPC_TIMEOUT' }); }
    }
    if (command === 'acknowledge') {
      assertDirectory(record.directory); record.status = 'acknowledged';
      if (controls.afterAck) { const hook = controls.afterAck; delete controls.afterAck; hook(target(op)); }
    }
    if (command === 'reconcile' && record.directory) {
      if (controls.beforeReconcile) { const hook = controls.beforeReconcile; delete controls.beforeReconcile; hook(target(op)); }
      assertDirectory(record.directory); // model native committed stage identity, never readopt
      if (!controls.readOnlyResults) for (const [index, file] of payloadFiles(op).entries()) assert.equal(sha(fs.readFileSync(path.join(target(op), file.name))), sha(record.bodies[index]));
    }
    return record.status;
  }
  const options = { dataRoot: data, controlOwnerPid: process.pid, resultRoot: () => results, nativeBinding: () => binding, nativeExport };
  const store = createDocumentReviewStore(options);
  for (let index = 0; index < count; index++) {
    const id = (serial * 100 + index + 1).toString(16).padStart(32, '0');
    const sourceLabel = `${sourceFolders?.[index] || (separateFolders ? `folder-${index + 1}` : 'nested')}/Quelle-${index + 1}.txt`;
    const item = { id, name: sourceLabel, source_label: sourceLabel,
      sha256: sha(original), status: 'released' };
    state.items.push(item);
  }
  for (const [index, item] of state.items.entries()) {
    const id = `${mode === 'markdown-only' ? 'dm' : 'ds'}_${item.id}`;
    if (mode === 'markdown-only') {
      const text = `# Dokument ${index + 1}\nAnna Beispiel hat 42 Projekte.\n`;
      const extraction = require('../plugins/data-secure/server/standalone/markdown-contract').createMarkdownExtraction(
        { source_type: 'txt', markdown: text, coverage: { status: 'complete', reason_codes: [] }, content_options: content });
      Object.assign(item, await require('../plugins/data-secure/server/standalone/markdown-store').publishMarkdownArtifact(extraction, id, { contentOptions: content }));
      store.capture(state, item, { package_id: id, original_text: text, markdown: text, content_options: content, source_type: 'txt' });
    } else {
      const captured = require('../plugins/data-secure/server/pii-engine').anonymize(original, 'general',
        { captureTransformPlan: true, productChannel: 'standalone', contentOptions: content });
      const pub = require('../plugins/data-secure/server/standalone/anonymized-artifact'), coverage = { status: 'complete', reason_codes: [] };
      const proof = pub.verifyAnonymizedPublication({ markdown: captured.text, profile: 'general', content_options: content,
        source_extraction: require('../plugins/data-secure/server/core/source-extraction-contract').createSourceExtraction(
          { source_type: 'txt', content_options: content, coverage, markdown: original }, 8_000_000),
        dictionary: captured.dictionary, strong_person_anchor: captured.strongPersonAnchor === true, reviewed_person_candidates: null });
      const artifact = pub.createAnonymizedArtifact({ package_id: id, content_options: content, source_type: 'txt', profile: 'general',
        operation_id: crypto.randomUUID(), created_at: new Date().toISOString(), coverage, markdown: captured.text, verification_proof: proof });
      const folder = path.join(require('../plugins/data-secure/server/standalone/anonymized-store').anonymizedArtifactRoots().output, id);
      fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, `${id}.md`), artifact.markdown);
      fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(artifact.manifest));
      item.package_id = id; item.document_result = artifact.manifest.document_result;
      store.capture(state, item, { package_id: id, original_text: original, markdown: captured.text, content_options: content,
        source_type: 'txt', publication_binding: artifact.expectation, transform_trace: captured.transform_trace, verification_context: {
          profile: 'general', dictionary: captured.dictionary, strong_person_anchor: captured.strongPersonAnchor === true,
          ruleset: require('../plugins/data-secure/server/privacy/policy').PRIVACY_RULESET_VERSION,
          credential_policy: require('../plugins/data-secure/server/privacy/policy').CREDENTIAL_CONTEXT_POLICY_VERSION,
          person_field_policy: require('../plugins/data-secure/server/core/person-field-policy').CONTENT_PERSON_FIELD_POLICY,
          publication_frame: { prefix: '', suffix: '' }, reviewed_ranges: [] } });
    }
  }
  assert.ok(!deferInitial || legacyCompanions, 'only the explicit historical initial fixture may defer publication');
  if (legacyLayout && mode === 'markdown-and-anonymize') {
    // Original companion-free /1 intent BEFORE the first real writer call.
    // Such historical files may legitimately use the Vertraulich source folder.
    const stamp = new Date(state.created_at).toISOString().replace(/[-:]/gu, '').replace('T', '-').slice(0, 15);
    const record = { schema: exporter.CONTENT_ANONYMIZED_SCHEMA, run_directory: `Lauf-${stamp}-${state.token.slice(-8)}`,
      items: state.items.map((item, index) => ({ package_id: item.package_id,
        file: `${path.posix.dirname(item.source_label)}/Dokument-${String(index + 1).padStart(3, '0')}-anonymisiert.md`,
        sha256: store.publicationExpectation(state.token, item.id).document_sha256, source_label: item.source_label })),
      complete: false, destination_id: '', product_channel: state.product_channel, processing_mode: state.processing_mode,
      content_options: state.content_options, batch_id: state.token, result_layout: exporter.RESULT_LAYOUT };
    assert.equal(exporter.validRecord(record), true);
    fs.writeFileSync(exporter.recordPath(state.token), JSON.stringify(record), { flag: 'wx', mode: 0o600 });
  }
  const historical = legacyCompanions ? prepareLegacyInitialPlan(state, store) : null;
  const initial = deferInitial ? null : exporter.exportCompletedState(state);
  if (initial) {
    assert.equal(initial.available, true, JSON.stringify(initial));
    assert.equal(initial.exported, count);
  }
  const bound = deferInitial ? null : exporter.initialResultPublication(batchId);
  if (bound) assert.equal(bound.result_layout, legacyCompanions ? 'datasecure-visible-markdown/2' :
    mode === 'markdown-and-anonymize' && !legacyLayout ? exporter.CONFIDENTIAL_RESULT_LAYOUT : exporter.RESULT_LAYOUT);
  if (legacy) {
    // Simulate a historical frozen plan. No new reader may silently add the
    // new layout to it or adopt its old Number identities as new authority.
    const outbox = path.join(data, 'result-export-state', `re_${sha(batchId).slice(0, 32)}.json`);
    const value = JSON.parse(fs.readFileSync(outbox)); delete value.result_layout;
    fs.writeFileSync(outbox, JSON.stringify(value));
  }
  const row = index => store.list(batchId).documents.find(value => value.document_id === state.items[index].id);
  const edit = (index = 0) => {
    const value = row(index), text = store.chunk(batchId, value.document_id, value.revision, 0).markdown;
    const start = text.indexOf('42');
    return store.decide(batchId, value.document_id, { action: mode === 'markdown-only' ? 'correct' : 'redact',
      ranges: [{ start, end: start + 2, ...(mode === 'markdown-only' ? { replacement: '43' } : {}) }],
      revision: value.revision, output_sha256: value.output_sha256, operation_id: crypto.randomBytes(16).toString('hex') });
  };
  const publish = async (candidate = store) => { controls.activeOperation = null; return candidate.publishResults(batchId); };
  const resolve = async () => { controls.activeOperation = null; controls.readOnlyResults = true;
    try { return await store.resolveResultsGeneration(batchId); } finally { controls.readOnlyResults = false; } };
  return { batchId, results, state, store, row, edit, publish, resolve, bound, historical, controls, calls, operations, options,
    reload: () => createDocumentReviewStore(options), target: result => target({ operation_id: result.result_publication.generation_id }) };
}
function prepareLegacyInitialPlan(state, store) {
  // Explicit historical fixture, not product migration or a fake readiness
  // dependency. Real capture/verification prepares the original semantic TXT
  // and CSV. Serialize the former exact two-role /1 companion plan and /2
  // incomplete outbox BEFORE invoking the real initial writer for the first
  // time; it must create its own progress anchors, leaves and /2 proof.
  assert.equal(state.processing_mode, 'markdown-and-anonymize');
  const items = state.items.map((item, index) => {
    const parent = path.posix.dirname(item.source_label), leaf = `Dokument-${String(index + 1).padStart(3, '0')}-anonymisiert.md`;
    return { package_id: item.package_id, file: parent === '.' ? leaf : `${parent}/${leaf}`,
      sha256: store.publicationExpectation(state.token, item.id).document_sha256, source_label: item.source_label };
  });
  const selection = items.map(item => ({ document_id: item.package_id.slice(3), revision: 0, output_sha256: item.sha256 }));
  const files = items.map(item => ({ name: item.file, sha256: item.sha256 }));
  const prepared = store.prepareResultCompanions(state.token, selection, files);
  const directory = path.join(data, 'document-reviews', state.token);
  const currentPlanFile = path.join(directory, `companions-${prepared.binding_sha256}.json`);
  const current = JSON.parse(fs.readFileSync(currentPlanFile));
  assert.equal(current.schema, 'datasecure-result-companions/2');
  assert.deepEqual(Object.keys(current.confidential).sort(), ['filename_mapping', 'identities', 'workbook']);
  const { workbook, ...confidential } = current.confidential;
  const plan = { ...current, schema: 'datasecure-result-companions/1', confidential }, binding = sha(JSON.stringify(plan));
  const planFile = path.join(directory, `companions-${binding}.json`), privateFiles = [];
  for (const [role, extension] of [['filename_mapping', 'csv'], ['identities', 'txt']]) {
    const previous = path.join(directory, `companions-${prepared.binding_sha256}-${role}.${extension}`);
    const bytes = fs.readFileSync(previous), target = path.join(directory, `companions-${binding}-${role}.${extension}`);
    assert.equal(bytes.length, confidential[role].bytes); assert.equal(sha(bytes), Buffer.from(confidential[role].sha256).toString('hex'));
    fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 }); privateFiles.push(target);
    fs.unlinkSync(previous);
  }
  fs.writeFileSync(planFile, JSON.stringify(plan), { flag: 'wx', mode: 0o600 });
  fs.unlinkSync(path.join(directory, `companions-${prepared.binding_sha256}-workbook.xlsx`)); fs.unlinkSync(currentPlanFile);
  const stamp = new Date(state.created_at).toISOString().replace(/[-:]/gu, '').replace('T', '-').slice(0, 15);
  const record = { schema: exporter.CONTENT_ANONYMIZED_SCHEMA, run_directory: `Lauf-${stamp}-${state.token.slice(-8)}`,
    items, complete: false, destination_id: '', product_channel: state.product_channel, processing_mode: state.processing_mode,
    content_options: state.content_options, batch_id: state.token, result_layout: 'datasecure-visible-markdown/2',
    confidential_binding_sha256: binding, confidential };
  assert.equal(exporter.validRecord(record), true, 'the historical outbox must satisfy the real closed reader');
  const outbox = exporter.recordPath(state.token); fs.writeFileSync(outbox, JSON.stringify(record), { flag: 'wx', mode: 0o600 });
  return { outbox, planFile, privateFiles, binding, directory,
    publicDirectory: path.join(process.env.EU_PRIVACY_RESULT_ROOT, 'DataSecure-Output', record.run_directory) };
}
function fileSnapshot(files) {
  const { readBoundFileRecord } = require('../plugins/data-secure/server/core/bound-file-io');
  return files.map(file => ({ file, ...readBoundFileRecord(file, { maximum: 32 * 1024 * 1024, checkCtime: true }) }));
}
function assertFileSnapshot(snapshot) {
  for (const before of snapshot) {
    const [after] = fileSnapshot([before.file]);
    assert.deepEqual(after.identity, before.identity, 'historical file object/time/size binding is unchanged');
    assert.deepEqual(after.bytes, before.bytes, 'historical file bytes are unchanged');
  }
}
function assertLegacyInitialProof(f) {
  const proof = exporter.initialResultPublication(f.batchId), record = JSON.parse(fs.readFileSync(f.historical.outbox));
  assert.equal(proof.schema, 'datasecure-initial-results/2'); assert.equal(proof.result_layout, 'datasecure-visible-markdown/2');
  assert.equal(record.result_layout, proof.result_layout); assert.equal(record.confidential_binding_sha256, f.historical.binding);
  assert.equal(proof.confidential_binding_sha256, f.historical.binding);
  assert.deepEqual(Object.keys(proof.confidential).sort(), ['filename_mapping', 'identities']);
  assert.deepEqual(proof.confidential_files.map(file => file.name),
    ['Vertraulich/Dateizuordnung.csv', 'Vertraulich/Personen-Pseudonym-Zuordnung.txt']);
  assert.deepEqual(fs.readdirSync(path.join(proof.directory.path, 'Vertraulich')).sort(),
    ['Dateizuordnung.csv', 'Personen-Pseudonym-Zuordnung.txt']);
  assert.equal(fs.readdirSync(f.historical.directory).some(name => name.endsWith('-workbook.xlsx')), false,
    'the historical fixture has no new workbook body to accidentally consume');
  return proof;
}
function payloadFiles(op) {
  return [...op.files, ...(op.confidential ? require('../plugins/data-secure/server/standalone/result-companions').confidentialFiles(op.confidential)
    .map(({ key, name }) => ({ name, ...op.confidential[key] })) : [])];
}
const rejects = (action, code) => assert.rejects(action, error => !code || error.code === code);
function sameByteSwap(folder) {
  const old = path.join(root, `retired-${serial}-${crypto.randomBytes(6).toString('hex')}`);
  assert.ok(path.relative(folder, old).startsWith('..' + path.sep), 'retire outside the complete checked result tree');
  fs.renameSync(folder, old); fs.mkdirSync(folder);
  const copy = (source, destination) => {
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (entry.isDirectory()) { fs.mkdirSync(path.join(destination, entry.name)); copy(path.join(source, entry.name), path.join(destination, entry.name)); }
      else fs.copyFileSync(path.join(source, entry.name), path.join(destination, entry.name));
    }
  };
  copy(old, folder);
}
function putMetadata(folder, bytes = Buffer.from('opaque Finder metadata; not a document')) {
  const filename = path.join(folder, '.DS_Store');
  fs.writeFileSync(filename, bytes, { flag: 'wx', mode: 0o600 });
  return filename;
}
function metadataFolders(initial) {
  return [...new Set([initial.directory.path,
    ...initial.files.map(file => path.dirname(path.join(initial.directory.path, file.name)))])];
}
function addResultTamper(folder, files, kind) {
  const named = path.join(folder, '.DS_Store');
  if (kind === 'directory') fs.mkdirSync(named);
  else if (kind === 'hardlink') {
    const source = path.join(root, `metadata-hardlink-source-${serial}`);
    fs.writeFileSync(source, 'synthetic metadata'); fs.linkSync(source, named);
  } else if (kind === 'symlink') {
    const source = path.join(root, `metadata-symlink-source-${serial}`);
    fs.writeFileSync(source, 'synthetic metadata'); fs.symlinkSync(source, named, 'file');
  } else putMetadata(folder, kind === 'oversize' ? Buffer.alloc(MAX_METADATA_BYTES + 1) : undefined);
  if (kind === 'unknown-dot') fs.writeFileSync(path.join(folder, '.private'), 'private');
  if (kind === 'csv') fs.writeFileSync(path.join(folder, 'private.csv'), 'private');
  if (kind === 'md-tamper') fs.appendFileSync(path.join(folder, files[0]), '\nchanged');
}
function symlinksAuthorized() {
  const source = path.join(root, 'metadata-symlink-capability-source');
  const link = path.join(root, 'metadata-symlink-capability-link');
  fs.writeFileSync(source, 'synthetic');
  try { fs.symlinkSync(source, link, 'file'); }
  catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code)) throw error;
    console.log('  NOT_RUN metadata symlink countercases: OS permission unavailable; no rights changed');
    return false;
  }
  fs.unlinkSync(link); return true;
}
function metadataScope(label) {
  const directory = fs.mkdtempSync(path.join(root, `${label}-`));
  return { directory, filename: putMetadata(directory) };
}
function assertGenerationReceiptInventory(receiptBytes, mode, count, folder) {
  const receipt = JSON.parse(receiptBytes), anonymize = mode === 'markdown-and-anonymize';
  const expected = Array.from({ length: count }, (_, index) => anonymize
    ? `Dokument_${String(index + 1).padStart(2, '0')}.md` : `Quelle-${index + 1}.md`);
  if (anonymize) expected.push('Vertraulich/Dateizuordnung.csv', 'Vertraulich/Pseudonym-Zuordnung.txt', 'Vertraulich/Pseudonym-Zuordnung.xlsx');
  assert.equal(receipt.schema, `datasecure-results-generation-complete/${anonymize ? 3 : 1}`);
  assert.deepEqual(receipt.files.map(file => file.name).sort(), expected.sort(), 'receipt has exactly the MD and required companion roles, never OS metadata');
  for (const file of receipt.files) assert.equal(file.sha256, sha(fs.readFileSync(path.join(folder, file.name))));
  if (anonymize) assert.equal(receipt.confidential_directory.path, path.join(folder, 'Vertraulich'));
  else assert.equal(Object.hasOwn(receipt, 'confidential_directory'), false);
}
function historicalUnsafeKeep(f, index) {
  // Test-owned pre-fix committed journal, never a decision accepted by the
  // repaired service. Replay its exact bytes through the real current reader.
  const row = f.row(index), run = path.join(data, 'document-reviews', f.batchId);
  const group = f.store.entities(f.batchId, row.document_id, row.revision, 0).entities.find(value => value.kind === 'PERSON');
  assert.ok(group);
  const request = { action: 'entities', ranges: [], revision: row.revision, output_sha256: row.output_sha256,
    operation_id: crypto.randomBytes(16).toString('hex'), entity_decisions: [{ entity_id: group.entity_id, decision: 'keep' }] };
  const snapshot = JSON.parse(fs.readFileSync(path.join(run, row.document_id, 'base.json')));
  const entity = require('../plugins/data-secure/server/gateway/standalone-entity-review');
  let entities = entity.initialEntities(snapshot);
  const records = fs.readdirSync(run).filter(name => /^decision-[0-9]{6}\.json$/u.test(name)).sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(run, name))));
  for (const record of records) {
    const event = record.targets.find(target => target.document_id === row.document_id)?.event;
    if (!event) continue;
    if (['approve', 'revoke'].includes(event.action)) continue;
    assert.equal(event.action, 'redact', 'fixture only seeds after the preceding real mask');
    entities = entity.relocate(entities, event.ranges.map(range => ({ ...range, replacement: '[MANUAL_REDACTION]' })), true);
  }
  const current = f.store.chunk(f.batchId, row.document_id, row.revision, 0).markdown;
  const key = Buffer.from(JSON.parse(fs.readFileSync(path.join(run, 'entity-key.json'))).key, 'hex');
  const next = entity.applyEntityDecisions(current, entities, request.entity_decisions, key);
  const event = { schema: 'datasecure-document-revision/1', revision: row.revision + 1, parent_sha256: row.output_sha256,
    output_sha256: sha(next.markdown), approved: false, action: 'entities', ranges: [],
    operation_id: request.operation_id, request_sha256: sha(JSON.stringify(request)), entity_decisions: request.entity_decisions };
  const record = { schema: 'datasecure-run-decision/1', batch_id: f.batchId, sequence: records.length + 1,
    parent_sha256: records.at(-1)?.event_sha256 || sha(`datasecure-run-decisions/1:${f.batchId}`),
    origin_document_id: row.document_id, operation_id: request.operation_id, request_sha256: event.request_sha256,
    scope: 'document', targets: [{ document_id: row.document_id, event }] };
  record.event_sha256 = sha(JSON.stringify(record));
  if (!fs.existsSync(path.join(run, 'journal-format.json'))) fs.writeFileSync(path.join(run, 'journal-format.json'), JSON.stringify({
    schema: 'datasecure-run-decision-commit/2', batch_id: f.batchId }), { flag: 'wx', mode: 0o600 });
  const sequence = String(record.sequence).padStart(6, '0');
  fs.writeFileSync(path.join(run, `commit-${sequence}.json`), JSON.stringify({ schema: 'datasecure-run-commit-proof/1',
    batch_id: f.batchId, sequence: record.sequence, event_sha256: record.event_sha256, record }), { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(run, `decision-${sequence}.json`), JSON.stringify(record), { flag: 'wx', mode: 0o600 });
  return { documentId: row.document_id, request };
}
function repairRequest(f, index, action, binding) {
  const row = f.row(index), request = { action, ranges: [], revision: row.revision, output_sha256: row.output_sha256,
    operation_id: crypto.randomBytes(16).toString('hex'), ...(binding ? { repair_binding: binding } : {}) };
  if (action === 'entities') {
    const group = f.store.entities(f.batchId, row.document_id, row.revision, 0).entities.find(value => value.kind === 'PERSON');
    request.entity_decisions = [{ entity_id: group.entity_id, decision: 'default' }];
  } else if (action === 'redact') {
    const text = f.store.chunk(f.batchId, row.document_id, row.revision, 0).markdown, start = text.indexOf('Anna Beispiel');
    assert.ok(start >= 0); request.ranges = [{ start, end: start + 'Anna Beispiel'.length }];
  }
  return { row, request };
}
function historicalNewerCorrection(f, index) {
  // Retain the old obsolete-intent counteroracle without asking the repaired
  // service to authorize a newer decision while a native intent is pending.
  const row = f.row(index), run = path.join(data, 'document-reviews', f.batchId);
  const text = f.store.chunk(f.batchId, row.document_id, row.revision, 0).markdown, start = text.indexOf('42');
  assert.ok(start >= 0);
  const request = { action: 'correct', ranges: [{ start, end: start + 2, replacement: '43' }], revision: row.revision,
    output_sha256: row.output_sha256, operation_id: crypto.randomBytes(16).toString('hex') };
  const records = fs.readdirSync(run).filter(name => /^decision-[0-9]{6}\.json$/u.test(name)).sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(run, name))));
  const event = { schema: 'datasecure-document-revision/1', revision: row.revision + 1, parent_sha256: row.output_sha256,
    output_sha256: sha(text.slice(0, start) + '43' + text.slice(start + 2)), approved: false, action: 'correct', ranges: request.ranges,
    operation_id: request.operation_id, request_sha256: sha(JSON.stringify(request)) };
  const record = { schema: 'datasecure-run-decision/1', batch_id: f.batchId, sequence: records.length + 1,
    parent_sha256: records.at(-1).event_sha256, origin_document_id: row.document_id,
    operation_id: request.operation_id, request_sha256: event.request_sha256, scope: 'document', targets: [{ document_id: row.document_id, event }] };
  record.event_sha256 = sha(JSON.stringify(record));
  const sequence = String(record.sequence).padStart(6, '0');
  fs.writeFileSync(path.join(run, `commit-${sequence}.json`), JSON.stringify({ schema: 'datasecure-run-commit-proof/1',
    batch_id: f.batchId, sequence: record.sequence, event_sha256: record.event_sha256, record }), { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(run, `decision-${sequence}.json`), JSON.stringify(record), { flag: 'wx', mode: 0o600 });
}
async function run() {
  for (const action of ['entities', 'redact', 'restore_base']) await testAsync(`historical unsafe private result: explicit ${action} repairs without publishing unsafe bytes`, async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize', count: 1 });
    f.edit(); const previous = await f.publish(), priorFiles = fileSnapshot(fs.readdirSync(f.target(previous), { recursive: true })
      .map(name => path.join(f.target(previous), name)).filter(file => fs.statSync(file).isFile()));
    const historical = historicalUnsafeKeep(f, 0), listing = f.store.list(f.batchId), publication = listing.result_publication;
    assert.equal(publication.state, 'repair_required'); assert.match(publication.repair_binding, /^[a-f0-9]{64}$/u);
    assert.deepEqual(Object.keys(publication).sort(), ['count', 'current_revision', 'generation_id', 'repair_binding', 'state']);
    assert.equal(publication.generation_id, previous.result_publication.generation_id);
    const calls = f.calls.length; await rejects(() => f.publish(), 'DOCUMENT_REVIEW_RESIDUAL_PII');
    assert.equal(f.calls.length, calls); assert.equal(f.store.decide(f.batchId, historical.documentId, historical.request).ok, true, 'old exact ACK remains idempotent');
    const input = repairRequest(f, 0, action, publication.repair_binding);
    assert.throws(() => f.store.decide(f.batchId, input.row.document_id, { ...input.request, repair_binding: '0'.repeat(64) }), { code: 'DOCUMENT_REVIEW_STALE' });
    const missing = { ...input.request }; delete missing.repair_binding;
    assert.throws(() => f.store.decide(f.batchId, input.row.document_id, missing), { code: 'DOCUMENT_REVIEW_STALE' });
    assert.equal(f.store.decide(f.batchId, input.row.document_id, input.request).ok, true);
    assert.equal(f.calls.length, calls, 'repair is private only');
    assert.equal(f.store.list(f.batchId).result_publication.state, 'pending');
    const next = await f.publish(); assert.equal(next.result_publication.state, 'current');
    assertFileSnapshot(priorFiles);
    const stale = repairRequest(f, 0, 'restore_base', publication.repair_binding);
    assert.throws(() => f.store.decide(f.batchId, stale.row.document_id, stale.request), { code: 'DOCUMENT_REVIEW_STALE' });
  });
  await testAsync('two historical unsafe documents are repaired separately with fresh full-vector bindings', async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize' }); historicalUnsafeKeep(f, 0); historicalUnsafeKeep(f, 1);
    const first = f.store.list(f.batchId).result_publication, input = repairRequest(f, 0, 'entities', first.repair_binding);
    f.store.decide(f.batchId, input.row.document_id, input.request);
    const second = f.store.list(f.batchId).result_publication; assert.equal(second.state, 'repair_required');
    assert.notEqual(second.repair_binding, first.repair_binding);
    const stale = repairRequest(f, 1, 'entities', first.repair_binding);
    assert.throws(() => f.store.decide(f.batchId, stale.row.document_id, stale.request), { code: 'DOCUMENT_REVIEW_STALE' });
    const next = repairRequest(f, 1, 'entities', second.repair_binding); f.store.decide(f.batchId, next.row.document_id, next.request);
    assert.equal((await f.publish()).result_publication.state, 'current'); assert.equal(f.operations.size, 1);
  });
  await testAsync('an unfinished native intent never grants private repair, even for a historical residual vector', async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize', count: 1 }); f.edit(); f.controls.losePublish = true;
    await rejects(() => f.publish(), 'STANDALONE_IPC_TIMEOUT'); historicalUnsafeKeep(f, 0);
    const publication = f.store.list(f.batchId).result_publication; assert.equal(publication.state, 'pending');
    assert.equal(Object.hasOwn(publication, 'repair_binding'), false);
    const input = repairRequest(f, 0, 'restore_base');
    assert.throws(() => f.store.decide(f.batchId, input.row.document_id, input.request), { code: 'RESULT_PUBLICATION_PENDING' });
    const operations = f.operations.size; await rejects(() => f.publish(), 'DOCUMENT_REVIEW_RESIDUAL_PII');
    assert.equal(f.operations.size, operations);
  });
  await testAsync('an outstanding legacy export confirmation never grants private repair', async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize', count: 1 }), row = f.row(0);
    f.store.decide(f.batchId, row.document_id, { action: 'approve', ranges: [], revision: row.revision,
      output_sha256: row.output_sha256, operation_id: crypto.randomBytes(16).toString('hex') });
    const selected = f.row(0), selection = [{ document_id: selected.document_id, revision: selected.revision, output_sha256: selected.output_sha256 }];
    let nativeAttempts = 0;
    const interrupted = createDocumentReviewStore({ ...f.options, nativeExport() {
      nativeAttempts++; throw Object.assign(Error('test-owned legacy native refusal'), { code: 'SYNTHETIC_NATIVE_STOP' });
    } });
    await rejects(() => interrupted.exportApproved(f.batchId, crypto.randomBytes(16).toString('hex'), selection), 'SYNTHETIC_NATIVE_STOP');
    assert.equal(nativeAttempts, 1, 'the real legacy writer persisted its intent before the explicit negative native model');
    historicalUnsafeKeep(f, 0);
    const listing = f.store.list(f.batchId); assert.equal(listing.pending_export_count, 1);
    assert.equal(listing.result_publication.state, 'pending'); assert.equal(Object.hasOwn(listing.result_publication, 'repair_binding'), false);
    const input = repairRequest(f, 0, 'restore_base');
    assert.throws(() => f.store.decide(f.batchId, input.row.document_id, input.request), { code: 'RESULT_PUBLICATION_PENDING' });
    assert.equal(f.calls.length, 0);
  });
  await testAsync('a previously observed initial contract cannot disappear into the legacy decision path', async () => {
    const f = await fixture(), row = f.row(0); let reads = 0;
    const store = createDocumentReviewStore({ ...f.options, initialResultPublication: () => ++reads === 1 ? f.bound : null });
    assert.throws(() => store.decide(f.batchId, row.document_id, { action: 'restore_base', ranges: [], revision: row.revision,
      output_sha256: row.output_sha256, operation_id: crypto.randomBytes(16).toString('hex') }), { code: 'RESULT_PUBLICATION_CONFLICT' });
    assert.equal(reads, 2); assert.equal(f.row(0).revision, 0); assert.equal(f.calls.length, 0);
    assert.equal(fs.existsSync(path.join(data, 'document-reviews', f.batchId, 'commit-000001.json')), false);
  });
  for (const role of ['initial-binding', 'initial-outbox', 'journal']) await testAsync(`repair retains the original ${role} object through the final decision assertion`, async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize', count: 1 }); historicalUnsafeKeep(f, 0);
    const publication = f.store.list(f.batchId).result_publication, input = repairRequest(f, 0, 'entities', publication.repair_binding);
    const run = path.join(data, 'document-reviews', f.batchId), target = role === 'initial-binding'
      ? path.join(data, 'result-publication-bindings', `${f.batchId}.json`) : role === 'initial-outbox'
        ? path.join(data, 'result-export-state', `re_${sha(f.batchId).slice(0, 32)}.json`) : path.join(run, 'decision-000001.json');
    const before = fs.readFileSync(target), engine = require('../plugins/data-secure/server/pii-engine'), scan = engine.scanResidual;
    let calls = 0, replaced = false;
    engine.scanResidual = function(...args) {
      if (++calls === 2) { fs.renameSync(target, target + '.test-owned-original'); fs.writeFileSync(target, before, { flag: 'wx', mode: 0o600 }); replaced = true; }
      return scan.apply(this, args);
    };
    try { assert.throws(() => f.store.decide(f.batchId, input.row.document_id, input.request)); }
    finally { engine.scanResidual = scan; }
    assert.equal(replaced, true); assert.equal(fs.existsSync(path.join(run, 'commit-000002.json')), false);
    assert.equal(f.calls.length, 0);
  });
  await testAsync('actual recovery reader retains only digest/identity metadata, not private payload buffers', async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize', count: 1 }); historicalUnsafeKeep(f, 0);
    let observations = 0;
    class ObservedMap extends Map {
      set(key, value) {
        if (typeof key === 'string' && value?.identity && value?.directory && Object.hasOwn(value, 'sha256')) {
          assert.deepEqual(Object.keys(value).sort(), ['directory', 'identity', 'sha256', 'size']);
          assert.equal(Buffer.isBuffer(value), false); assert.equal(Object.hasOwn(value, 'bytes'), false);
          assert.match(value.sha256, /^[a-f0-9]{64}$/u); assert.ok(Number.isSafeInteger(value.size)); observations++;
        }
        return super.set(key, value);
      }
    }
    const filename = require.resolve('../plugins/data-secure/server/gateway/standalone-document-review-store');
    const model = { exports: {} }, localRequire = require('node:module').createRequire(filename);
    new Function('require', 'module', 'exports', 'Map', fs.readFileSync(filename, 'utf8'))(localRequire, model, model.exports, ObservedMap);
    const store = model.exports.createDocumentReviewStore(f.options);
    assert.equal(store.list(f.batchId).result_publication.state, 'repair_required');
    assert.ok(observations > 5, 'the actual reader observed multiple held private originals without retaining their bodies');
  });
  for (const code of ['DOCUMENT_REVIEW_POLICY_CHANGED', 'EIO', 'OWNERSHIP_GUARD_BUSY']) await testAsync(`repair projection never downgrades ${code} to a residual repair grant`, async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize', count: 1 }); historicalUnsafeKeep(f, 0);
    const engine = require('../plugins/data-secure/server/pii-engine'), scan = engine.scanResidual;
    engine.scanResidual = () => { throw Object.assign(Error('synthetic classified boundary failure'), { code }); };
    try { assert.equal(f.store.list(f.batchId).result_publication.state, 'conflict'); }
    finally { engine.scanResidual = scan; }
  });
  test('private IPC repair digest is closed, action-limited and never an approval/export field', () => {
    const make = (action, binding = 'f'.repeat(64)) => ({ schema: 'datasecure-standalone-private-ipc/1', request_id: '1'.repeat(16),
      action: 'decide_document_review', batch_id: 'a'.repeat(64), document_id: 'b'.repeat(32), decision: {
        action, revision: 1, output_sha256: 'c'.repeat(64), ranges: action === 'redact' ? [{ start: 0, end: 1 }] : [],
        operation_id: 'd'.repeat(32), repair_binding: binding,
        ...(action === 'entities' ? { entity_decisions: [{ entity_id: 'entity_000001', decision: 'default' }] } : {}) } });
    for (const action of ['entities', 'redact', 'restore_base']) assert.equal(validatePrivateMessage(make(action)).action, 'decide_document_review');
    for (const action of ['approve', 'revoke', 'correct']) assert.throws(() => validatePrivateMessage(make(action)));
    for (const bad of ['', 'A'.repeat(64), 'f'.repeat(63), 1, null]) assert.throws(() => validatePrivateMessage(make('restore_base', bad)));
    let coerced = false;
    assert.throws(() => validatePrivateMessage(make('restore_base', { toString() { coerced = true; return 'f'.repeat(64); } })));
    assert.equal(coerced, false, 'a non-string repair field is rejected without running a stringifier');
    const extra = make('restore_base'); extra.decision.extra = true; assert.throws(() => validatePrivateMessage(extra));
  });
  if (process.platform === 'darwin') {
  for (const mode of ['markdown-only', 'markdown-and-anonymize'])
  await testAsync(`Darwin process / ${mode}: opaque metadata survives initial/gen opening but is never copied, counted or receipted`, async () => {
    const f = await fixture({ mode });
    const bindingFile = path.join(data, 'result-publication-bindings', `${f.batchId}.json`);
    const initialBinding = fs.readFileSync(bindingFile);
    const metadata = metadataFolders(f.bound).map(folder => putMetadata(folder));
    assert.equal((await f.resolve()).local_path, f.bound.directory.path); assert.equal(f.calls.length, 0);
    assert.equal(exporter.initialResultPublication(f.batchId).files.length, 2);
    assert.ok(fs.readFileSync(bindingFile).equals(initialBinding), 'metadata never changes the immutable binding');
    // OS metadata may change content and even object between separate opens.
    fs.writeFileSync(metadata[0], Buffer.from('new opaque content'));
    assert.equal((await f.resolve()).local_path, f.bound.directory.path);
    fs.renameSync(metadata[0], path.join(root, `retired-metadata-${serial}`)); putMetadata(f.bound.directory.path);
    assert.equal((await f.resolve()).local_path, f.bound.directory.path);
    f.edit(); const first = await f.publish(), firstFolder = f.target(first);
    assert.equal(first.result_publication.count, 2); assert.equal(fs.existsSync(path.join(firstFolder, '.DS_Store')), false);
    assert.ok([...f.operations.values()].every(record => JSON.parse(record.operation).files.every(file => file.name.endsWith('.md'))));
    const receipt = path.join(data, 'document-reviews', f.batchId, `results-generation-${first.result_publication.generation_id}-complete.json`);
    const receiptBytes = fs.readFileSync(receipt); putMetadata(firstFolder);
    assert.equal((await f.resolve()).local_path, firstFolder);
    assert.equal(f.store.list(f.batchId).result_publication.state, 'current');
    assert.equal(f.store.list(f.batchId).result_publication.count, 2);
    assert.ok(fs.readFileSync(receipt).equals(receiptBytes), 'OS metadata cannot be added to an existing private receipt');
    assertGenerationReceiptInventory(receiptBytes, mode, 2, firstFolder);
    f.edit(1); const next = await f.publish(), nextFolder = f.target(next);
    assert.notEqual(next.result_publication.generation_id, first.result_publication.generation_id);
    assert.equal(next.result_publication.count, 2); assert.equal(fs.existsSync(path.join(nextFolder, '.DS_Store')), false);
    assert.equal((await f.resolve()).local_path, nextFolder);
    assert.equal(fs.existsSync(path.join(firstFolder, '.DS_Store')), true, 'no metadata deletion or repair');
    assert.ok(f.store.list(f.batchId).documents.every(row => !row.approved));
  });
  await testAsync('Darwin process: one complete recursive initial inventory shares the inclusive 8-MiB metadata budget', async () => {
    const f = await fixture({ count: 8, separateFolders: true }), folders = metadataFolders(f.bound);
    assert.equal(folders.length, 9, 'root plus eight promised source subfolders');
    assert.equal(MAX_METADATA_TOTAL_BYTES, 8 * MAX_METADATA_BYTES);
    for (const folder of folders.slice(0, 8)) putMetadata(folder, Buffer.alloc(MAX_METADATA_BYTES));
    assert.equal((await f.resolve()).local_path, f.bound.directory.path, 'exactly 8 MiB remains valid');
    putMetadata(folders[8], Buffer.from('x'));
    assert.throws(() => exporter.initialResultPublication(f.batchId), { code: 'RESULT_EXPORT_CONFLICT' }, 'strict publication inspector retains its budget');
    assert.equal((await f.resolve()).local_path, f.bound.directory.path, 'completed folder opening does not inventory user files');
  });
  } else {
    console.log(`  NOT_RUN real Darwin metadata initial/generation/budget cases: actual host ${process.platform}; no Mac API or O_NOFOLLOW PASS`);
    for (const phase of ['initial', 'generation'])
    await testAsync(`${process.platform} actual process: completed ${phase} ignores user-added metadata without repair or import`, async () => {
      const f = await fixture(); let folder, files;
      if (phase === 'generation') {
        f.edit(); const result = await f.publish(); folder = f.target(result);
        files = JSON.parse(f.operations.get(result.result_publication.generation_id).operation).files.map(file => file.name);
      } else { folder = f.bound.directory.path; files = f.bound.files.map(file => file.name); }
      const originalBytes = files.map(name => fs.readFileSync(path.join(folder, name)));
      const metadata = putMetadata(folder), metadataBytes = fs.readFileSync(metadata);
      const metadataIdentity = fs.lstatSync(metadata, { bigint: true });
      const names = fs.readdirSync(folder).sort(), operations = f.operations.size, calls = f.calls.length;
      assert.equal((await f.resolve()).local_path, folder);
      assert.equal(f.operations.size, operations, 'folder opening cannot publish or repair');
      assert.deepEqual(fs.readdirSync(folder).sort(), names); assert.deepEqual(fs.readFileSync(metadata), metadataBytes);
      const after = fs.lstatSync(metadata, { bigint: true });
      for (const key of ['dev', 'ino', 'birthtimeNs', 'size', 'mtimeNs', 'ctimeNs', 'nlink']) assert.equal(after[key], metadataIdentity[key]);
      for (const [index, name] of files.entries()) assert.deepEqual(fs.readFileSync(path.join(folder, name)), originalBytes[index]);
    });
  }
  test('actual host gate cannot be enabled by a caller-supplied Darwin directory descriptor', () => {
    if (process.platform === 'darwin') {
      const inspect = metadataSourceModel('win32').createPublicResultMetadataInspector();
      assert.equal(inspect({ platform: 'darwin' }, '.DS_Store'), false, 'source-model Windows gate remains closed');
      return;
    }
    let touches = 0;
    const fake = { platform: 'darwin', get io() { touches++; throw Error('unexpected IO'); },
      get path() { touches++; throw Error('unexpected path'); } };
    assert.equal(createPublicResultMetadataInspector()(fake, '.DS_Store'), false);
    assert.equal(touches, 0, 'real non-Darwin module denies the exception before touching a descriptor');
  });
  test('SOURCE-MODEL Darwin-branch algorithm shares the bounded metadata budget across real directories', () => {
    const directory = fs.mkdtempSync(path.join(root, 'metadata-budget-model-'));
    const inspect = createModelMetadataInspector();
    assert.equal(MAX_METADATA_TOTAL_BYTES, 8 * MAX_METADATA_BYTES);
    for (let index = 0; index < 9; index++) {
      const child = path.join(directory, String(index)); fs.mkdirSync(child);
      putMetadata(child, Buffer.alloc(index < 8 ? MAX_METADATA_BYTES : 1));
      if (index < 8) assert.equal(inspect(bindDirectory(child), '.DS_Store'), true);
      else assert.throws(() => inspect(bindDirectory(child), '.DS_Store'), { code: 'PUBLIC_RESULT_METADATA_UNSAFE' });
    }
  });
  const metadataTampers = ['oversize', 'directory', 'hardlink', 'unknown-dot', 'csv', 'md-tamper'];
  if (symlinksAuthorized()) metadataTampers.push('symlink');
  for (const phase of ['initial', 'generation']) for (const kind of metadataTampers)
  await testAsync(`${phase}: strict pre-completion inventory still refuses ${kind}`, async () => {
    const f = await fixture(); let folder, files;
    if (phase === 'generation') {
      f.edit(); f.controls.afterAck = target => {
        folder = target; const op = JSON.parse([...f.operations.values()].at(-1).operation);
        addResultTamper(folder, op.files.map(file => file.name), kind);
      };
      await rejects(() => f.publish());
      assert.equal(fs.readdirSync(path.join(data, 'document-reviews', f.batchId)).some(name => /^results-generation-.*-complete\.json$/u.test(name)), false);
    } else {
      folder = f.bound.directory.path; files = f.bound.files.map(file => file.name);
      addResultTamper(folder, files, kind);
      assert.throws(() => exporter.initialResultPublication(f.batchId), 'the unchanged strict initial inspector still refuses this payload');
      assert.equal((await f.resolve()).local_path, folder);
    }
  });
  test('SOURCE-MODEL Darwin-branch algorithm never reads/parses/hashes opaque metadata', () => {
    const f = metadataScope('opaque'), io = Object.create(fs);
    let reads = 0, opens = 0, closes = 0;
    io.openSync = (...args) => { opens++; return fs.openSync(...args); };
    io.closeSync = fd => { closes++; return fs.closeSync(fd); };
    for (const method of ['readSync', 'readFileSync', 'readvSync']) io[method] = () => { reads++; throw Error('metadata must remain opaque'); };
    const inspect = createModelMetadataInspector(), directory = bindDirectory(f.directory, { io });
    assert.equal(inspect(directory, '.DS_Store'), true); assert.equal(reads, 0); assert.equal(opens, 1); assert.equal(closes, 1);
    assert.equal(inspect(directory, '.private'), false); assert.equal(opens, 1, 'unknown names are not an exception');
    fs.writeFileSync(f.filename, 'different content and size');
    assert.equal(createModelMetadataInspector()(directory, '.DS_Store'), true);
  });
  for (const fault of ['close', 'parent-swap', 'leaf-swap', 'missing-after-lstat'])
  test(`SOURCE-MODEL Darwin-branch descriptor algorithm refuses ${fault} without retry or repair`, () => {
    const f = metadataScope(fault), io = Object.create(fs); let opens = 0, closes = 0, swaps = 0;
    io.openSync = (...args) => {
      opens++;
      if (fault === 'leaf-swap') {
        fs.renameSync(f.filename, path.join(root, `${path.basename(f.directory)}-retired`)); putMetadata(f.directory);
      }
      if (fault === 'missing-after-lstat') fs.unlinkSync(f.filename);
      if (fault === 'parent-swap') {
        // Node's ordinary Windows read handle can prevent a directory rename.
        // Replace before opening, then move the SAME leaf into the new parent:
        // fstat identity alone is deliberately insufficient to catch this race.
        const retired = f.directory + '-retired';
        fs.renameSync(f.directory, retired); fs.mkdirSync(f.directory);
        fs.renameSync(path.join(retired, '.DS_Store'), f.filename); swaps++;
      }
      return fs.openSync(...args);
    };
    io.closeSync = fd => { closes++; fs.closeSync(fd); if (fault === 'close') throw Error('synthetic close failure'); };
    const directory = bindDirectory(f.directory, { io });
    assert.throws(() => createModelMetadataInspector()(directory, '.DS_Store'), { code: 'PUBLIC_RESULT_METADATA_UNSAFE' });
    assert.equal(opens, 1, 'no general retry'); assert.equal(closes, fault === 'missing-after-lstat' ? 0 : 1, 'consume each descriptor once');
    if (fault === 'parent-swap') assert.equal(swaps, 1, 'the real parent replacement must have occurred');
  });
  test('publication request is closed and cannot carry renderer selection, authority or paths', () => {
    const message = { schema: 'datasecure-standalone-private-ipc/1', request_id: '1'.repeat(16), action: 'publish_result_documents', batch_id: 'a'.repeat(64) };
    assert.equal(validatePrivateMessage(message).action, message.action);
    for (const extra of [{ selection: [] }, { approved: true }, { acknowledge: true }, { operation_id: 'b'.repeat(32) }, { root: root }, { publication_role: 'results' }])
      assert.throws(() => validatePrivateMessage({ ...message, ...extra }));
    const { desktopErrorCode } = require('../plugins/data-secure/server/core/desktop-error-contract');
    for (const code of ['RESULT_PUBLICATION_CONFLICT', 'RESULT_PUBLICATION_PENDING', 'RESULT_PUBLICATION_LEGACY', 'RESULT_DIRECTORY_UNAVAILABLE']) assert.equal(desktopErrorCode(code), code);
  });
  await testAsync('current and historical service openers await the selected generation and keep legacy adapters compatible', async () => {
    const { StandaloneApplicationService } = require('../plugins/data-secure/server/standalone/application-service');
    const batchId = 'a'.repeat(64), selected = { ok: true, local_path: '/bound/current-generation', target_kind: 'directory', external_disclosure: false };
    let generationReads = 0, oldReads = 0, observed = 0;
    const service = { observedBatchId: batchId, observeCurrentRun() { observed++; },
      deps: { documentReviews: { async resolveResultsGeneration(id) { assert.equal(id, batchId); generationReads++; return selected; } },
        runHistory: { resolveResults() { oldReads++; return { local_path: '/initial' }; } } },
      resolveHistoryResults: StandaloneApplicationService.prototype.resolveHistoryResults };
    assert.equal(await StandaloneApplicationService.prototype.resolveCurrentResults.call(service), selected);
    assert.equal(generationReads, 1); assert.equal(observed, 1); assert.equal(oldReads, 0);
    delete service.deps.documentReviews;
    assert.equal((await service.resolveHistoryResults(batchId)).local_path, '/initial'); assert.equal(oldReads, 1);
    let privateLedgerReads = 0;
    service.deps.runHistory.resolveLedger = id => { assert.equal(id, batchId); privateLedgerReads++; return { local_path: '/private/mapping.csv' }; };
    assert.equal(StandaloneApplicationService.prototype.resolveLedger.call(service).local_path, '/private/mapping.csv');
    assert.equal(privateLedgerReads, 1);
  });
  await testAsync('real initial Markdown publication is ready without selection/approval and contains only Markdown', async () => {
    const f = await fixture(); assert.equal(f.row(0).approved, false);
    assert.deepEqual(f.store.list(f.batchId).result_publication, { state: 'initial', generation_id: null, count: 2, current_revision: 0 });
    const all = fs.readdirSync(f.bound.directory.path, { recursive: true }).filter(name => fs.statSync(path.join(f.bound.directory.path, name)).isFile());
    assert.equal(all.length, 2); assert.ok(all.every(name => name.endsWith('.md')));
    assert.equal((await f.resolve()).local_path, f.bound.directory.path);
    assert.equal(f.calls.length, 0, 'initial/list never invoke correction publication');
    f.edit(); const result = await f.publish();
    assertGenerationReceiptInventory(fs.readFileSync(path.join(data, 'document-reviews', f.batchId,
      `results-generation-${result.result_publication.generation_id}-complete.json`)), 'markdown-only', 2, f.target(result));
  });
  for (const sourceFolder of ['Vertraulich', 'vertraulich', 'VERTRAULICH']) for (const mode of ['markdown-only', 'markdown-and-anonymize'])
  await testAsync(`companion-free initial ${mode} keeps legitimate ${sourceFolder} source folders readable`, async () => {
    const f = await fixture({ mode, legacyLayout: mode === 'markdown-and-anonymize', sourceFolders: [sourceFolder, sourceFolder] });
    assert.equal(f.bound.schema, 'datasecure-initial-results/1');
    assert.ok(f.bound.files.every(file => file.name.startsWith(sourceFolder + '/')));
    assert.equal((await f.resolve()).local_path, f.bound.directory.path);
    assert.equal(f.store.list(f.batchId).result_publication.state, 'initial');
  });
  for (const legacyCompanions of [true, false]) await testAsync(`companion-bearing initial /${legacyCompanions ? 2 : 3} never admits a reserved MD namespace collision`, async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize', legacyCompanions });
    const file = path.join(data, 'result-publication-bindings', `${f.batchId}.json`), proof = JSON.parse(fs.readFileSync(file));
    const outbox = exporter.recordPath(f.batchId), record = JSON.parse(fs.readFileSync(outbox));
    const oldName = proof.files[0].name; proof.files[0].name = 'vErTrAuLiCh/Quelle.md';
    record.items.find(item => item.file === oldName).file = proof.files[0].name;
    fs.writeFileSync(file, JSON.stringify(proof)); fs.writeFileSync(outbox, JSON.stringify(record));
    await rejects(() => f.resolve(), 'RESULT_PUBLICATION_CONFLICT'); assert.equal(f.calls.length, 0);
  });
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) for (const partial of [true, false])
  await testAsync(`${mode}: validated incomplete initial publication (partial=${partial}) stays pending without readable authority`, async () => {
    const f = await fixture({ mode }), outbox = path.join(data, 'result-export-state', `re_${sha(f.batchId).slice(0, 32)}.json`);
    const original = fs.readFileSync(outbox), record = JSON.parse(original);
    const binding = path.join(data, 'result-publication-bindings', `${f.batchId}.json`);
    fs.renameSync(binding, binding + '.held');
    record.complete = false;
    if (partial) delete record.items[0].exported;
    fs.writeFileSync(outbox, JSON.stringify(record));
    const before = fs.readFileSync(outbox), files = fs.readdirSync(f.bound.directory.path).sort();
    assert.throws(() => exporter.initialResultPublication(f.batchId), { code: 'RESULT_EXPORT_PENDING' });
    assert.deepEqual(f.store.list(f.batchId).result_publication,
      { state: 'pending', generation_id: null, count: 2, current_revision: 0 });
    await rejects(() => f.resolve(), 'RESULT_PUBLICATION_PENDING');
    await rejects(() => f.publish(), 'RESULT_PUBLICATION_PENDING');
    assert.equal(f.calls.length, 0); assert.deepEqual(fs.readFileSync(outbox), before);
    assert.deepEqual(fs.readdirSync(f.bound.directory.path).sort(), files);
    assert.equal(fs.existsSync(binding), false, 'pending read/publish cannot fabricate the not-yet-committed binding');
    fs.renameSync(binding + '.held', binding);
    fs.writeFileSync(outbox, original);
    assert.equal((await f.resolve()).local_path, f.bound.directory.path, 'only the completed worker proof grants readiness');
  });
  for (const mutation of ['schema', 'batch', 'completed-missing-flag'])
  await testAsync(`an unsafe initial plan (${mutation}) cannot borrow a pending classification`, async () => {
    const f = await fixture(), outbox = path.join(data, 'result-export-state', `re_${sha(f.batchId).slice(0, 32)}.json`);
    const record = JSON.parse(fs.readFileSync(outbox));
    if (mutation === 'completed-missing-flag') delete record.items[0].exported;
    else { record.complete = false; record[mutation === 'batch' ? 'batch_id' : 'schema'] = mutation === 'batch' ? 'f'.repeat(64) : 'unknown'; }
    fs.writeFileSync(outbox, JSON.stringify(record));
    assert.equal(f.store.list(f.batchId).result_publication.state, 'conflict');
    await rejects(() => f.resolve(), 'RESULT_PUBLICATION_CONFLICT'); assert.equal(f.calls.length, 0);
  });
  await testAsync('a completed initial plan with a lost private binding is conflict, not retryable pending', async () => {
    const f = await fixture(), binding = path.join(data, 'result-publication-bindings', `${f.batchId}.json`);
    fs.renameSync(binding, binding + '.held');
    assert.equal(f.store.list(f.batchId).result_publication.state, 'conflict');
    await rejects(() => f.resolve(), 'RESULT_PUBLICATION_CONFLICT');
    await rejects(() => f.publish(), 'RESULT_PUBLICATION_CONFLICT');
    assert.equal(fs.existsSync(binding), false); assert.equal(f.calls.length, 0);
  });
  for (const mutation of ['extra-file', 'missing-file', 'same-hash-leaf-replacement']) await testAsync(`confirmed initial opener permits ${mutation} without publication or repair`, async () => {
    const f = await fixture(), leaf = path.join(f.bound.directory.path, f.bound.files[0].name);
    if (mutation === 'extra-file') fs.writeFileSync(path.join(f.bound.directory.path, 'private.csv'), 'private');
    else {
      const retired = path.join(root, `retired-leaf-${serial}.md`); fs.renameSync(leaf, retired);
      if (mutation === 'same-hash-leaf-replacement') fs.copyFileSync(retired, leaf);
    }
    assert.throws(() => exporter.initialResultPublication(f.batchId), 'strict initial verification is unchanged');
    assert.equal((await f.resolve()).local_path, f.bound.directory.path); assert.equal(f.calls.length, 0);
  });
  await testAsync('real anonymization commits all three confidential files before ready, corrections bind their actual new names', async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize' });
    const visible = fs.readdirSync(f.bound.directory.path, { recursive: true }).filter(name => fs.statSync(path.join(f.bound.directory.path, name)).isFile())
      .map(name => name.split(path.sep).join('/')).sort();
    assert.deepEqual(visible, [...f.bound.files.map(file => file.name),
      'Vertraulich/Dateizuordnung.csv', 'Vertraulich/Pseudonym-Zuordnung.txt', 'Vertraulich/Pseudonym-Zuordnung.xlsx'].sort());
    const csv = fs.readFileSync(path.join(f.bound.directory.path, 'Vertraulich/Dateizuordnung.csv'), 'utf8');
    const identities = fs.readFileSync(path.join(f.bound.directory.path, 'Vertraulich/Pseudonym-Zuordnung.txt'), 'utf8');
    for (const file of f.bound.files) assert.ok(csv.includes(file.name));
    assert.match(identities, /Anna Beispiel/u); assert.match(identities, /PERSON/u);
    const mapping = exporter.privateResultLedger(f.batchId);
    assert.ok(mapping.startsWith(path.join(data, 'result-publication-bindings') + path.sep));
    assert.match(fs.readFileSync(mapping, 'utf8'), /Quelle-1/u); assert.equal(f.row(0).approved, false);
    f.edit(); const result = await f.publish();
    assert.equal(result.result_publication.count, 2); assert.equal(f.row(0).approved, false);
    assert.deepEqual(fs.readdirSync(f.target(result)).sort(), ['Dokument_01.md', 'Dokument_02.md', 'Vertraulich']);
    assertGenerationReceiptInventory(fs.readFileSync(path.join(data, 'document-reviews', f.batchId,
      `results-generation-${result.result_publication.generation_id}-complete.json`)), 'markdown-and-anonymize', 2, f.target(result));
    const nextCsv = fs.readFileSync(path.join(f.target(result), 'Vertraulich/Dateizuordnung.csv'), 'utf8');
    assert.match(nextCsv, /Dokument_01\.md/u); assert.doesNotMatch(nextCsv, /Dokument-001-anonymisiert/u);
    assert.equal(fs.readFileSync(path.join(f.bound.directory.path, 'Vertraulich/Dateizuordnung.csv'), 'utf8'), csv);
  });
  await testAsync('source Vertraulich roots cannot collide with confidential output namespace, including case variants', async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize', count: 3,
      sourceFolders: ['Vertraulich', 'vertraulich', 'Vertraulich (Quelle)'] });
    assert.ok(f.bound.files.every(file => file.name.split('/')[0].toLowerCase() !== 'vertraulich'));
    assert.equal(f.bound.files[0].name.split('/')[0], 'Vertraulich (Quelle 2)');
    assert.equal(f.bound.files[1].name.split('/')[0], 'Vertraulich (Quelle 2)');
    assert.deepEqual(fs.readdirSync(path.join(f.bound.directory.path, 'Vertraulich')).sort(),
      ['Dateizuordnung.csv', 'Pseudonym-Zuordnung.txt', 'Pseudonym-Zuordnung.xlsx']);
    assert.equal((await f.resolve()).local_path, f.bound.directory.path);
  });
  await testAsync('old /1 anonymization stays immutable; an explicit later correction gains version-bound companions', async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize', legacyLayout: true });
    assert.equal(fs.existsSync(path.join(f.bound.directory.path, 'Vertraulich')), false);
    const before = fs.readdirSync(f.bound.directory.path, { recursive: true }).sort();
    assert.equal((await f.resolve()).local_path, f.bound.directory.path);
    assert.deepEqual(fs.readdirSync(f.bound.directory.path, { recursive: true }).sort(), before);
    f.edit(); const result = await f.publish();
    assert.deepEqual(fs.readdirSync(path.join(f.target(result), 'Vertraulich')).sort(),
      ['Dateizuordnung.csv', 'Pseudonym-Zuordnung.txt', 'Pseudonym-Zuordnung.xlsx']);
    assert.equal(fs.existsSync(path.join(f.bound.directory.path, 'Vertraulich')), false);
  });
  await testAsync('historical initial /2: real first writer commits exactly two old companions; completed reads/no-op never upgrade', async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize', legacyCompanions: true });
    const proof = assertLegacyInitialProof(f), bindingFile = path.join(data, 'result-publication-bindings', `${f.batchId}.json`);
    const publicFiles = [...proof.files, ...proof.confidential_files].map(file => path.join(proof.directory.path, file.name));
    const snapshot = fileSnapshot([f.historical.outbox, bindingFile, f.historical.planFile,
      ...f.historical.privateFiles, ...publicFiles]);
    const inventory = fs.readdirSync(proof.directory.path, { recursive: true }).sort();
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal(exporter.exportCompletedState(f.state).available, true, 'completed real worker export is an immutable no-op');
      assert.equal(f.reload().list(f.batchId).result_publication.state, 'initial');
      assert.equal((await f.resolve()).local_path, proof.directory.path);
      assertLegacyInitialProof(f); assertFileSnapshot(snapshot);
      assert.deepEqual(fs.readdirSync(proof.directory.path, { recursive: true }).sort(), inventory);
      assert.equal(f.calls.length, 0, 'initial reads/completed worker no-op never invoke a correction transaction');
    }
  });
  await testAsync('historical initial /2: partial MD publication resumes old two-body plan, then a real edit publishes only a new /3 generation', async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize', legacyCompanions: true, deferInitial: true });
    const historicalBodies = fileSnapshot([f.historical.planFile, ...f.historical.privateFiles]);
    const blocked = f.historical.privateFiles.find(file => file.endsWith('-identities.txt'));
    const originalOpen = fs.openSync; let injected = 0, incomplete;
    fs.openSync = function (file, ...args) {
      if (file === blocked && !injected) { injected++; throw Object.assign(Error('synthetic private body unavailable'), { code: 'EIO' }); }
      return originalOpen.call(this, file, ...args);
    };
    try { incomplete = exporter.exportCompletedState(f.state); }
    finally { fs.openSync = originalOpen; }
    assert.equal(injected, 1, 'failure occurs in the actual legacy companion reader after all MD copies');
    assert.deepEqual(incomplete, { exported: 2, pending: 0, available: false });
    const pending = JSON.parse(fs.readFileSync(f.historical.outbox));
    assert.equal(pending.complete, false); assert.ok(pending.items.every(item => item.exported === true));
    assert.equal(pending.result_layout, 'datasecure-visible-markdown/2');
    assert.equal(pending.confidential_binding_sha256, f.historical.binding);
    assert.deepEqual(Object.keys(pending.confidential).sort(), ['filename_mapping', 'identities']);
    const bindingFile = path.join(data, 'result-publication-bindings', `${f.batchId}.json`);
    assert.equal(fs.existsSync(bindingFile), false); assert.equal(fs.existsSync(path.join(f.historical.publicDirectory, 'Vertraulich')), false);
    const markdownBeforeResume = fileSnapshot(pending.items.map(item => path.join(f.historical.publicDirectory, item.file)));
    assert.throws(() => exporter.initialResultPublication(f.batchId), { code: 'RESULT_EXPORT_PENDING' });
    assert.equal(f.store.list(f.batchId).result_publication.state, 'pending');
    await rejects(() => f.resolve(), 'RESULT_PUBLICATION_PENDING'); assert.equal(f.calls.length, 0);
    assert.deepEqual(exporter.exportCompletedState(f.state), { exported: 2, pending: 0, available: true });
    const proof = assertLegacyInitialProof(f); assertFileSnapshot(markdownBeforeResume); assertFileSnapshot(historicalBodies);
    const oldFiles = fileSnapshot([f.historical.outbox, bindingFile, ...historicalBodies.map(item => item.file),
      ...proof.files.map(file => path.join(proof.directory.path, file.name)),
      ...proof.confidential_files.map(file => path.join(proof.directory.path, file.name))]);
    const oldInventory = fs.readdirSync(proof.directory.path, { recursive: true }).sort();
    f.edit(); const result = await f.publish(), folder = f.target(result);
    assert.equal(result.result_publication.state, 'current'); assert.equal(result.result_publication.current_revision, 1);
    const op = JSON.parse(f.operations.get(result.result_publication.generation_id).operation);
    assert.equal(op.publication_role, 'results'); assert.equal(op.batch_id, f.batchId);
    assert.equal(Object.hasOwn(op, 'schema'), false, 'native callback receives the actual closed DTO, not an invented schema');
    assert.deepEqual(Object.keys(op.confidential).sort(), ['filename_mapping', 'identities', 'workbook']);
    assert.deepEqual(fs.readdirSync(path.join(folder, 'Vertraulich')).sort(),
      ['Dateizuordnung.csv', 'Pseudonym-Zuordnung.txt', 'Pseudonym-Zuordnung.xlsx']);
    const savedGeneration = JSON.parse(fs.readFileSync(path.join(data, 'document-reviews', f.batchId,
      `results-generation-${result.result_publication.generation_id}.json`)));
    assert.equal(savedGeneration.schema, 'datasecure-results-generation/3');
    assertGenerationReceiptInventory(fs.readFileSync(path.join(data, 'document-reviews', f.batchId,
      `results-generation-${result.result_publication.generation_id}-complete.json`)), 'markdown-and-anonymize', 2, folder);
    assert.equal(fs.readFileSync(path.join(folder, 'Vertraulich/Pseudonym-Zuordnung.xlsx')).readUInt32LE(0), 0x04034b50);
    assert.match(fs.readFileSync(path.join(folder, 'Dokument_01.md'), 'utf8'), /\[MANUAL_REDACTION\] Projekte/u);
    assertFileSnapshot(oldFiles); assert.deepEqual(fs.readdirSync(proof.directory.path, { recursive: true }).sort(), oldInventory);
    assert.equal(fs.existsSync(path.join(proof.directory.path, 'Vertraulich/Pseudonym-Zuordnung.txt')), false);
    assert.equal(fs.existsSync(path.join(proof.directory.path, 'Vertraulich/Pseudonym-Zuordnung.xlsx')), false);
    assert.equal((await f.resolve()).local_path, folder); assert.equal(f.row(0).approved, false);
  });
  for (const phase of ['initial', 'generation']) for (const mutation of ['missing', 'changed', 'same-bytes-swap', 'directory-swap', 'extra'])
  await testAsync(`completed confidential ${phase} ${mutation}: open without recreating, importing or adopting files`, async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize' });
    let folder = f.bound.directory.path;
    if (phase === 'generation') { f.edit(); folder = f.target(await f.publish()); }
    const confidential = path.join(folder, 'Vertraulich'), leaf = path.join(confidential, 'Dateizuordnung.csv');
    const originalInventory = fs.readdirSync(folder, { recursive: true }).sort();
    const originalBytes = originalInventory.filter(name => fs.statSync(path.join(folder, name)).isFile())
      .map(name => ({ name, bytes: fs.readFileSync(path.join(folder, name)) }));
    const retired = path.join(root, `retired-mapping-${serial}.csv`);
    if (mutation === 'missing') fs.renameSync(leaf, retired);
    if (mutation === 'changed') fs.appendFileSync(leaf, 'changed');
    if (mutation === 'same-bytes-swap') { fs.renameSync(leaf, retired); fs.copyFileSync(retired, leaf); }
    if (mutation === 'directory-swap') sameByteSwap(confidential);
    if (mutation === 'extra') fs.writeFileSync(path.join(confidential, 'extra.txt'), 'private');
    const before = fs.readdirSync(folder, { recursive: true }).sort(), calls = f.calls.length;
    if (['same-bytes-swap', 'directory-swap'].includes(mutation)) {
      assert.deepEqual(before, originalInventory, 'same-byte oracle has no foreign-name confounder');
      for (const file of originalBytes) assert.deepEqual(fs.readFileSync(path.join(folder, file.name)), file.bytes);
    }
    assert.equal((await f.resolve()).local_path, folder);
    f.edit(1); const next = await f.publish();
    assert.notEqual(f.target(next), folder);
    assert.deepEqual(fs.readdirSync(folder, { recursive: true }).sort(), before);
    assertGenerationReceiptInventory(fs.readFileSync(path.join(data, 'document-reviews', f.batchId,
      `results-generation-${next.result_publication.generation_id}-complete.json`)), 'markdown-and-anonymize', 2, f.target(next));
  });
  await testAsync('real new-layout identity opener returns explicit private scope without publication or a false warning', async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize' });
    const ledger = require('../plugins/data-secure/server/standalone/identity-ledger');
    for (const item of f.state.items) ledger.capture(f.batchId, item.id, item.package_id,
      [{ pseudonym: '[PERSON_001]', original: 'Anna Beispiel' }]);
    const privateDocument = ledger.materialize(f.state);
    assert.equal(privateDocument.complete, true);
    const history = require('../plugins/data-secure/server/standalone/run-history').createRunHistory({
      readStates: () => [f.state], readState: id => id === f.batchId ? f.state : null,
      readExports: exporter.readStandaloneExportHistory, readExport: exporter.readStandaloneExportHistoryEntry,
      recoverableStates: () => [], liveExecutor: () => false
    });
    const before = fs.readdirSync(f.bound.directory.path, { recursive: true }).sort();
    const target = history.resolveIdentityMapping(f.batchId);
    assert.deepEqual(target, { ok: true, target_kind: 'file', local_path: privateDocument.local_path,
      external_disclosure: false, publication_available: false, identity_mapping_scope: 'private' });
    assert.equal(Object.keys(target).length, 6); assert.equal(Object.hasOwn(target, 'identity_mapping_warning'), false);
    assert.ok(target.local_path.startsWith(path.join(data, 'identity-ledgers') + path.sep));
    assert.match(fs.readFileSync(target.local_path, 'utf8'), /\[PERSON_001\] = Anna Beispiel/u);
    assert.deepEqual(fs.readdirSync(f.bound.directory.path, { recursive: true }).sort(), before);
    assert.equal(fs.existsSync(path.join(f.bound.directory.path, 'VERTRAULICH-NICHT-HOCHLADEN')), false);
    assert.equal(f.calls.length, 0);
  });
  await testAsync('saved correction publishes full current vector, no approval, once and preserves original generation', async () => {
    const f = await fixture(), initialBytes = f.bound.files.map(file => fs.readFileSync(path.join(f.bound.directory.path, file.name)));
    f.edit(); assert.equal(f.store.list(f.batchId).result_publication.state, 'pending');
    await rejects(() => f.resolve(), 'RESULT_PUBLICATION_PENDING');
    const result = await f.publish(); assert.equal(result.ok, true); assert.equal(result.batch_id, f.batchId);
    assert.equal(result.local_ui_only, true); assert.equal(result.external_disclosure, false);
    assert.equal(result.result_publication.state, 'current'); assert.equal(result.result_publication.count, 2);
    assert.ok(!JSON.stringify(result).includes(f.results)); assert.ok(!JSON.stringify(result).includes('identity'));
    assert.ok(f.store.list(f.batchId).documents.every(row => !row.approved));
    const target = f.target(result); assert.equal(fs.readdirSync(target).length, 2);
    assert.match(fs.readFileSync(path.join(target, 'Quelle-1.md'), 'utf8'), /43 Projekte/u);
    for (const [index, file] of f.bound.files.entries()) assert.ok(fs.readFileSync(path.join(f.bound.directory.path, file.name)).equals(initialBytes[index]));
    assert.deepEqual(await f.publish(f.reload()), result, 'same vector reuses one operation after restart');
    assert.equal(f.operations.size, 1); assert.equal(f.calls.filter(row => row.command === 'publish').length, 1);
    assert.equal((await f.resolve()).local_path, target);
    assert.equal(f.calls.at(-1).command, 'reconcile', 'opener inspects, never writes or acknowledges');
  });
  await testAsync('second edit creates a new whole generation and preserves old bytes, opener follows only current', async () => {
    const f = await fixture(); f.edit(); const first = await f.publish(), firstTarget = f.target(first);
    const firstBytes = fs.readFileSync(path.join(firstTarget, 'Quelle-1.md'));
    f.edit(1); await rejects(() => f.resolve(), 'RESULT_PUBLICATION_PENDING');
    const second = await f.publish(); assert.notEqual(first.result_publication.generation_id, second.result_publication.generation_id);
    assert.ok(fs.readFileSync(path.join(firstTarget, 'Quelle-1.md')).equals(firstBytes));
    assert.equal((await f.resolve()).local_path, f.target(second)); assert.equal(f.operations.size, 2);
  });
  for (const phase of ['initial', 'generation']) await testAsync(`completed ${phase}: timestamps, edits, deleted leaves and Office extras require no public-leaf IO`, async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize' });
    let folder = f.bound.directory.path;
    if (phase === 'generation') { f.edit(); folder = f.target(await f.publish()); }
    const files = fs.readdirSync(folder, { recursive: true }).filter(name => fs.statSync(path.join(folder, name)).isFile());
    const hashes = files.map(name => sha(fs.readFileSync(path.join(folder, name))));
    for (const name of files) fs.utimesSync(path.join(folder, name), new Date(0), new Date(0));
    assert.deepEqual(files.map(name => sha(fs.readFileSync(path.join(folder, name)))), hashes, 'timestamp-only change leaves all bytes equal');
    fs.writeFileSync(path.join(folder, 'Vertraulich', '~$Pseudonym-Zuordnung.xlsx'), 'user Office lock');
    fs.appendFileSync(path.join(folder, files[0]), 'MANUAL USER EDIT');
    fs.unlinkSync(path.join(folder, files.at(-1)));
    const inventory = fs.readdirSync(folder, { recursive: true }).sort(), calls = f.calls.length;
    const originals = new Map(), observed = [];
    for (const name of ['openSync', 'readFileSync', 'readdirSync', 'lstatSync', 'statSync']) {
      originals.set(name, fs[name]); fs[name] = function (file, ...args) {
        const target = typeof file === 'string' ? path.resolve(file) : '';
        if (target.startsWith(folder + path.sep) || name === 'readdirSync' && target === folder) {
          observed.push([name, target]); throw Error('PUBLIC_LEAF_IO_AFTER_COMPLETION');
        }
        return originals.get(name).call(this, file, ...args);
      };
    }
    try {
      assert.equal((await f.resolve()).local_path, folder);
      assert.equal(f.store.list(f.batchId).result_publication.state, phase === 'initial' ? 'initial' : 'current');
      if (phase === 'generation') assert.equal((await f.publish()).result_publication.state, 'current');
    } finally { for (const [name, original] of originals) fs[name] = original; }
    assert.deepEqual(observed, []);
    assert.equal(f.calls.length - calls, phase === 'initial' ? 0 : 1, 'only latest-generation read-only native inspection, no ACK or no-op publication');
    assert.deepEqual(fs.readdirSync(folder, { recursive: true }).sort(), inventory);
    f.edit(1); const next = await f.publish();
    assert.notEqual(f.target(next), folder);
    assert.equal(fs.existsSync(path.join(f.target(next), 'Vertraulich', '~$Pseudonym-Zuordnung.xlsx')), false);
    assert.ok(fs.readdirSync(f.target(next), { recursive: true }).filter(name => name.endsWith('.md')).every(name =>
      !fs.readFileSync(path.join(f.target(next), name), 'utf8').includes('MANUAL USER EDIT')));
  });
  for (const field of ['files-missing', 'files-extra', 'name', 'digest', 'identity-number', 'identity-extra', 'identity-missing', 'directory-chain'])
  await testAsync(`completed private receipt ${field} remains a conflict before any public authority`, async () => {
    const f = await fixture(); f.edit(); const result = await f.publish(), id = result.result_publication.generation_id;
    const file = path.join(data, 'document-reviews', f.batchId, `results-generation-${id}-complete.json`), receipt = JSON.parse(fs.readFileSync(file));
    if (field === 'files-missing') receipt.files.pop();
    if (field === 'files-extra') receipt.files.push(receipt.files[0]);
    if (field === 'name') receipt.files[0].name = 'foreign.md';
    if (field === 'digest') receipt.files[0].sha256 = '0'.repeat(64);
    if (field === 'identity-number') receipt.files[0].identity.ino = 1;
    if (field === 'identity-extra') receipt.files[0].identity.extra = true;
    if (field === 'identity-missing') delete receipt.files[0].identity.ctime;
    if (field === 'directory-chain') receipt.directory.chain.push(receipt.directory.chain.at(-1));
    fs.writeFileSync(file, JSON.stringify(receipt)); const calls = f.calls.length;
    assert.equal(f.store.list(f.batchId).result_publication.state, 'conflict');
    await rejects(() => f.resolve(), 'RESULT_PUBLICATION_CONFLICT');
    await rejects(() => f.publish(), 'RESULT_PUBLICATION_CONFLICT'); assert.equal(f.calls.length, calls);
  });
  for (const phase of ['initial', 'generation']) await testAsync(`completed ${phase}: unreadable original directory is unavailable, not a content conflict`, async () => {
    const f = await fixture(); let folder = f.bound.directory.path;
    if (phase === 'generation') { f.edit(); folder = f.target(await f.publish()); }
    const access = fs.accessSync; fs.accessSync = function (file, ...args) {
      if (file === folder) throw Object.assign(Error('synthetic directory access refusal'), { code: 'EACCES' });
      return access.call(this, file, ...args);
    };
    try { await rejects(() => f.resolve(), 'RESULT_DIRECTORY_UNAVAILABLE');
      assert.equal(f.store.list(f.batchId).result_publication.state, 'unavailable'); }
    finally { fs.accessSync = access; }
    assert.equal((await f.resolve()).local_path, folder);
  });
  for (const mutation of ['missing', 'same-bytes-replacement']) await testAsync(`initial directory ${mutation} cannot be reconstructed by a correction`, async () => {
    const f = await fixture(); f.edit(); const folder = f.bound.directory.path;
    if (mutation === 'missing') fs.renameSync(folder, folder + '-missing');
    else sameByteSwap(folder);
    await rejects(() => f.publish(), 'RESULT_DIRECTORY_UNAVAILABLE'); assert.equal(f.calls.length, 0); assert.equal(fs.existsSync(path.join(f.results, 'DataSecure-Markdown-Korrektur')), false);
    await rejects(() => f.resolve(), 'RESULT_DIRECTORY_UNAVAILABLE');
    assert.equal(f.store.list(f.batchId).result_publication.state, 'unavailable');
  });
  await testAsync('lost publish response stays pending/read-only then same-op retry repairs receipt without new generation', async () => {
    const f = await fixture(); f.edit(); f.controls.losePublish = true;
    await rejects(() => f.publish(), 'STANDALONE_IPC_TIMEOUT');
    const calls = f.calls.length; assert.equal(f.store.list(f.batchId).result_publication.state, 'pending');
    await rejects(() => f.resolve(), 'RESULT_PUBLICATION_PENDING'); assert.equal(f.calls.length, calls);
    const result = await f.publish(f.reload()); assert.equal(result.result_publication.state, 'current');
    assert.equal(f.operations.size, 1); assert.equal(f.calls.filter(row => row.command === 'publish').length, 1);
  });
  await testAsync('lost-ACK retry also refuses a deleted confirmed predecessor instead of recreating it', async () => {
    const f = await fixture(); f.edit(); f.controls.losePublish = true;
    await rejects(() => f.publish(), 'STANDALONE_IPC_TIMEOUT');
    fs.renameSync(f.bound.directory.path, f.bound.directory.path + '-deleted'); const count = f.calls.length;
    await rejects(() => f.publish()); assert.equal(f.calls.length, count);
  });
  await testAsync('pending obsolete intent cannot silently publish a changed newer vector', async () => {
    const f = await fixture(); f.edit(); f.controls.losePublish = true;
    await rejects(() => f.publish(), 'STANDALONE_IPC_TIMEOUT');
    assert.throws(() => f.edit(1), { code: 'RESULT_PUBLICATION_PENDING' });
    assert.equal(f.operations.size, 1, 'new decisions cannot obsolete an unacknowledged native intent');
    historicalNewerCorrection(f, 1);
    await rejects(() => f.publish(), 'RESULT_PUBLICATION_CONFLICT');
    assert.equal(f.operations.size, 1, 'an actual historical obsolete vector still cannot redirect the pending native intent');
  });
  for (const timing of ['afterAck', 'beforeReconcile']) await testAsync(`equal-byte output swap ${timing} cannot acquire a completion receipt`, async () => {
    const f = await fixture(); f.edit(); f.controls[timing] = sameByteSwap;
    await rejects(() => f.publish());
    const files = fs.readdirSync(path.join(data, 'document-reviews', f.batchId));
    assert.equal(files.some(name => /^results-generation-.*-complete\.json$/u.test(name)), false);
  });
  await testAsync('changed prior generation remains user-owned while a new correction comes only from private revisions', async () => {
    const f = await fixture(); f.edit(); const first = await f.publish(); f.edit(1);
    fs.appendFileSync(path.join(f.target(first), 'Quelle-1.md'), 'changed');
    assert.equal(f.store.list(f.batchId).result_publication.state, 'pending');
    const next = await f.publish(); assert.equal(f.operations.size, 2);
    assert.match(fs.readFileSync(path.join(f.target(first), 'Quelle-1.md'), 'utf8'), /changed$/u);
    assert.doesNotMatch(fs.readFileSync(path.join(f.target(next), 'Quelle-1.md'), 'utf8'), /changed/u);
  });
  for (const tamper of ['root', 'initial_binding_sha256', 'operation_id']) await testAsync(`rehashing a private ${tamper} change cannot redirect or rebind a saved generation`, async () => {
    const f = await fixture(); f.edit(); const result = await f.publish();
    const id = result.result_publication.generation_id, filename = path.join(data, 'document-reviews', f.batchId, `results-generation-${id}.json`);
    const op = JSON.parse(fs.readFileSync(filename));
    if (tamper === 'root') { op.root = path.join(root, 'redirected-results'); op.binding.root = op.root; }
    else if (tamper === 'operation_id') op.operation_id = 'b'.repeat(32);
    else op.initial_binding_sha256 = 'c'.repeat(64);
    const { request_sha256, ...bound } = op; op.request_sha256 = sha(JSON.stringify(bound));
    fs.writeFileSync(filename, JSON.stringify(op));
    const calls = f.calls.length; assert.equal(f.store.list(f.batchId).result_publication.state, 'conflict');
    await rejects(() => f.publish(), 'RESULT_PUBLICATION_CONFLICT'); await rejects(() => f.resolve(), 'RESULT_PUBLICATION_CONFLICT');
    assert.equal(f.calls.length, calls);
  });
  await testAsync('run result root stays fixed after a different result setting or binding', async () => {
    const f = await fixture(); f.edit(); const other = path.join(root, 'other-results'); fs.mkdirSync(other);
    const store = createDocumentReviewStore({ ...f.options, nativeBinding: () => null, resultRoot: () => other,
      prepareNativeBinding: async () => { throw Error('wrong root must be refused before provisioning'); } });
    await rejects(() => store.publishResults(f.batchId), 'RESULT_PUBLICATION_CONFLICT'); assert.equal(f.calls.length, 0);
    const store2 = createDocumentReviewStore({ ...f.options, nativeBinding: () => ({ ...f.options.nativeBinding(), root: other }) });
    await rejects(() => store2.publishResults(f.batchId), 'RESULT_PUBLICATION_CONFLICT'); assert.equal(f.calls.length, 0);
  });
  await testAsync('legacy layout is not adopted into new publication authority or changed by list', async () => {
    const f = await fixture({ legacy: true }); f.edit(); const outbox = path.join(data, 'result-export-state', `re_${sha(f.batchId).slice(0, 32)}.json`);
    const before = fs.readFileSync(outbox); assert.equal(f.store.list(f.batchId).result_publication, undefined);
    assert.equal(await f.resolve(), null, 'legacy uses initial resolver, not absent new generation metadata');
    await rejects(() => f.publish(), 'RESULT_PUBLICATION_LEGACY'); assert.ok(fs.readFileSync(outbox).equals(before));
    assert.equal(f.calls.length, 0);
    const input = repairRequest(f, 0, 'restore_base', 'f'.repeat(64));
    assert.throws(() => f.store.decide(f.batchId, input.row.document_id, input.request), { code: 'DOCUMENT_REVIEW_STALE' });
  });
  await done();
}
run().catch(error => { console.error(error); process.exitCode = 1; return done(); });
