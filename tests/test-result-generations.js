'use strict';
// Real content-bound initial publication, immutable review replay and actual
// BigInt filesystem identities. Native callbacks below are an explicit model,
// NOT evidence of the Rust broker, packaged OS UI or a native Mac transaction.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
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
const { validatePrivateMessage } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const content = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };
let serial = 0;

// This builder deliberately invokes the real initial exporter, not a fabricated
// initialResultPublication dependency. It is also the fixture contract used by
// the separate real Node->Rust pipe test (which has its own native callback).
async function fixture({ mode = 'markdown-only', count = 2, legacy = false } = {}) {
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
      record = { operation: JSON.stringify(op), bodies: op.files.map(() => Buffer.alloc(0)), status: 'unprepared' };
      operations.set(op.operation_id, record);
    }
    if (command === 'write_body') {
      assert.equal(body.offset, record.bodies[body.index].length);
      record.bodies[body.index] = Buffer.concat([record.bodies[body.index], Buffer.from(body.hex, 'hex')]);
      if (body.final_chunk) {
        assert.equal(sha(record.bodies[body.index]), Buffer.from(op.files[body.index].sha256).toString('hex'));
        assert.equal(record.bodies[body.index].length, op.files[body.index].bytes);
        record.status = 'prepared'; return 'staged';
      }
      return 'receiving';
    }
    if (command === 'publish') {
      if (controls.beforePublish) { const hook = controls.beforePublish; delete controls.beforePublish; hook(); }
      if (!record.directory) {
        fs.mkdirSync(target(op), { recursive: true });
        for (const [index, file] of op.files.entries()) fs.writeFileSync(path.join(target(op), file.name), record.bodies[index], { flag: 'wx' });
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
      for (const [index, file] of op.files.entries()) assert.equal(sha(fs.readFileSync(path.join(target(op), file.name))), sha(record.bodies[index]));
    }
    return record.status;
  }
  const options = { dataRoot: data, controlOwnerPid: process.pid, resultRoot: () => results, nativeBinding: () => binding, nativeExport };
  const store = createDocumentReviewStore(options);
  for (let index = 0; index < count; index++) {
    const id = (serial * 100 + index + 1).toString(16).padStart(32, '0');
    const item = { id, name: `nested/Quelle-${index + 1}.txt`, source_label: `nested/Quelle-${index + 1}.txt`,
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
  const initial = exporter.exportCompletedState(state);
  assert.equal(initial.available, true, JSON.stringify(initial));
  assert.equal(initial.exported, count);
  const bound = exporter.initialResultPublication(batchId);
  assert.equal(bound.result_layout, exporter.RESULT_LAYOUT);
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
  const resolve = async () => { controls.activeOperation = null; return store.resolveResultsGeneration(batchId); };
  return { batchId, results, state, store, row, edit, publish, resolve, bound, controls, calls, operations, options,
    reload: () => createDocumentReviewStore(options), target: result => target({ operation_id: result.result_publication.generation_id }) };
}
const rejects = (action, code) => assert.rejects(action, error => !code || error.code === code);
function sameByteSwap(folder) {
  const old = folder + '-replaced'; fs.renameSync(folder, old); fs.mkdirSync(folder);
  const copy = (source, destination) => {
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (entry.isDirectory()) { fs.mkdirSync(path.join(destination, entry.name)); copy(path.join(source, entry.name), path.join(destination, entry.name)); }
      else fs.copyFileSync(path.join(source, entry.name), path.join(destination, entry.name));
    }
  };
  copy(old, folder);
}
async function run() {
  test('publication request is closed and cannot carry renderer selection, authority or paths', () => {
    const message = { schema: 'datasecure-standalone-private-ipc/1', request_id: '1'.repeat(16), action: 'publish_result_documents', batch_id: 'a'.repeat(64) };
    assert.equal(validatePrivateMessage(message).action, message.action);
    for (const extra of [{ selection: [] }, { approved: true }, { acknowledge: true }, { operation_id: 'b'.repeat(32) }, { root: root }, { publication_role: 'results' }])
      assert.throws(() => validatePrivateMessage({ ...message, ...extra }));
    const { desktopErrorCode } = require('../plugins/data-secure/server/core/desktop-error-contract');
    for (const code of ['RESULT_PUBLICATION_CONFLICT', 'RESULT_PUBLICATION_PENDING', 'RESULT_PUBLICATION_LEGACY']) assert.equal(desktopErrorCode(code), code);
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
  for (const mutation of ['extra-file', 'missing-file', 'same-hash-leaf-replacement']) await testAsync(`initial opener revalidates ${mutation} without publication or fallback`, async () => {
    const f = await fixture(), leaf = path.join(f.bound.directory.path, f.bound.files[0].name);
    if (mutation === 'extra-file') fs.writeFileSync(path.join(f.bound.directory.path, 'private.csv'), 'private');
    else {
      const retired = path.join(root, `retired-leaf-${serial}.md`); fs.renameSync(leaf, retired);
      if (mutation === 'same-hash-leaf-replacement') fs.copyFileSync(retired, leaf);
    }
    await rejects(() => f.resolve(), 'RESULT_PUBLICATION_CONFLICT'); assert.equal(f.calls.length, 0);
  });
  await testAsync('real anonymization initial layout keeps confidential mapping private and opener resolves it', async () => {
    const f = await fixture({ mode: 'markdown-and-anonymize' });
    const visible = fs.readdirSync(f.bound.directory.path, { recursive: true }).filter(name => fs.statSync(path.join(f.bound.directory.path, name)).isFile())
      .map(name => name.split(path.sep).join('/')).sort();
    assert.deepEqual(visible, f.bound.files.map(file => file.name).sort());
    const mapping = exporter.privateResultLedger(f.batchId);
    assert.ok(mapping.startsWith(path.join(data, 'result-publication-bindings') + path.sep));
    assert.match(fs.readFileSync(mapping, 'utf8'), /Quelle-1/u); assert.equal(f.row(0).approved, false);
    f.edit(); const result = await f.publish();
    assert.equal(result.result_publication.count, 2); assert.equal(f.row(0).approved, false);
    assert.deepEqual(fs.readdirSync(f.target(result)), ['Dokument_01.md', 'Dokument_02.md']);
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
  for (const mutation of ['missing', 'bytes', 'same-bytes-replacement']) await testAsync(`initial ${mutation} cannot be reconstructed by a correction`, async () => {
    const f = await fixture(); f.edit(); const folder = f.bound.directory.path;
    if (mutation === 'missing') fs.renameSync(folder, folder + '-missing');
    else if (mutation === 'bytes') fs.appendFileSync(path.join(folder, f.bound.files[0].name), 'changed');
    else sameByteSwap(folder);
    await rejects(() => f.publish()); assert.equal(f.calls.length, 0); assert.equal(fs.existsSync(path.join(f.results, 'DataSecure-Markdown-Korrektur')), false);
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
    await rejects(() => f.publish(), 'STANDALONE_IPC_TIMEOUT'); f.edit(1);
    await rejects(() => f.publish(), 'RESULT_PUBLICATION_CONFLICT'); assert.equal(f.operations.size, 1);
  });
  for (const timing of ['afterAck', 'beforeReconcile']) await testAsync(`equal-byte output swap ${timing} cannot acquire a completion receipt`, async () => {
    const f = await fixture(); f.edit(); f.controls[timing] = sameByteSwap;
    await rejects(() => f.publish());
    const files = fs.readdirSync(path.join(data, 'document-reviews', f.batchId));
    assert.equal(files.some(name => /^results-generation-.*-complete\.json$/u.test(name)), false);
  });
  await testAsync('changed prior generation refuses new publication and history honestly reports conflict', async () => {
    const f = await fixture(); f.edit(); const first = await f.publish(); f.edit(1);
    fs.appendFileSync(path.join(f.target(first), 'Quelle-1.md'), 'changed');
    assert.equal(f.store.list(f.batchId).result_publication.state, 'conflict'); const count = f.calls.length;
    await rejects(() => f.publish()); assert.equal(f.calls.length, count); assert.equal(f.operations.size, 1);
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
  });
  await done();
}
run().catch(error => { console.error(error); process.exitCode = 1; return done(); });
