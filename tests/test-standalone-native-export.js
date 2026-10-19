'use strict';
// Real Node document approvals + framed native callback + native filesystem
// transaction. The Rust test-only pipe is NOT a native Tauri/GUI package test.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const assert = require('node:assert/strict');
const { NativeExportChannel } = require('../plugins/data-secure/server/standalone/native-export-channel');
const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-native-store-'));
const data = path.join(root, 'private'), results = path.join(root, 'public'), packages = path.join(root, 'packages');
for (const p of [data, results, packages]) fs.mkdirSync(p, { mode: 0o700 });
process.env.EU_PRIVACY_DATA_ROOT = data;
process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
delete process.env.EU_PRIVACY_RESULT_ROOT;
const resultConfig = require('../plugins/data-secure/server/gateway/result-folder-config');
const child = spawn('cargo', ['test', '--locked', 'native_export_broker::tests::pipe_helper', '--', '--ignored', '--exact', '--nocapture', '--test-threads=1'],
  { cwd: path.resolve(__dirname, '../apps/datasecure-standalone/tauri-contract'), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let stderr = '', outer, binding, seq = 0, nativeSession, loseNextPublish = false, poisonedBody = false, configuredAdmissions = 0, preparationService;
const nativeCommands = [], nativeActions = [];
child.stderr.on('data', bytes => { stderr = `${stderr}${bytes}`.slice(-8192); });
const channel = new NativeExportChannel({ write: frame => {
  if (frame.action) nativeActions.push(frame.action);
  if (frame.command) nativeCommands.push(frame.command);
  if (poisonedBody && frame.command === 'write_body') {
    frame.body.hex = frame.body.hex.replace(/^../u, '00'); poisonedBody = false;
  }
  child.stdin.write(`${JSON.stringify({ data, frame, outer })}\n`);
} });
readline.createInterface({ input: child.stdout }).on('line', line => {
  const marker = line.indexOf('NATIVE:');
  if (marker < 0) return;
  const reply = JSON.parse(line.slice(marker + 7));
  if (reply.harness_error) console.error(reply.harness_error);
  try { channel.accept(reply); } catch (e) { channel.abort(e.code); }
});
const exited = new Promise(resolve => child.once('exit', (code, signal) => { channel.abort('STANDALONE_IPC_FAILED'); resolve({ code, signal }); }));
const deadline = setTimeout(() => { channel.abort('STANDALONE_IPC_FAILED'); child.kill(); }, 180000);
function context(action, extra = {}) {
  outer = { schema: 'datasecure-standalone-private-ipc/1', request_id: (++seq).toString(16).padStart(16, '0'), action, ...extra };
  nativeSession = channel.publication(outer);
}
function fixture(mode, index, extraText = '', raw = null, native = true) {
  const batchId = index.toString(16).padStart(64, '0'), documentId = index.toString(16).padStart(32, '0');
  const actual = raw === null ? null : require('../plugins/data-secure/server/pii-engine').anonymize(raw, 'general', { captureTransformPlan: true });
  const item = { id: documentId, name: 'nested/Quelle.pdf', sha256: sha(raw ?? 'synthetic source'), status: 'released' };
  const text = actual?.text ?? (mode === 'markdown-only' ? '# Quelle\nAnna Beispiel: 42 Projekte.\n' : '# Quelle\n[PERSON_001]: 42 Projekte.\n') + extraText;
  const nodeRoot = path.join(root, 'node-results'); if (!native && !fs.existsSync(nodeRoot)) fs.mkdirSync(nodeRoot);
  const storeOptions = { dataRoot: data, outputRoot: () => packages,
    readMarkdownArtifact(id) {
      const manifest = JSON.parse(fs.readFileSync(path.join(packages, id, 'manifest.json')));
      const markdown = fs.readFileSync(path.join(packages, id, `${id}.md`), 'utf8');
      require('../plugins/data-secure/server/standalone/markdown-artifact').validateMarkdownArtifact(manifest, markdown); return { manifest, markdown };
    },
    controlOwnerPid: process.pid, ...(native ? { nativeBinding: () => binding,
      prepareNativeBinding: (batchId, operationId) => (preparationService
        ? preparationService.prepareConfiguredExportRoot.bind(preparationService)
        : resultConfig.prepareConfiguredNativeExportBinding)(async snapshot => {
        configuredAdmissions++;
        const prepared = await nativeSession.send('prepare_configured_export_root', { ...snapshot, batch_id: batchId, operation_id: operationId });
        binding = prepared;
        return prepared;
      }), nativeExport: async (operation, command, body) => {
      const status = await nativeSession.send('export_documents', { operation, command, ...(body ? { body } : {}) });
      if (loseNextPublish && command === 'publish') { loseNextPublish = false; throw Object.assign(Error('lost receipt'), { code: 'STANDALONE_IPC_TIMEOUT' }); }
      return status;
    } } : { resultRoot: () => nodeRoot }) };
  const store = createDocumentReviewStore(storeOptions);
  const packageId = `${mode === 'markdown-only' ? 'dm' : 'ds'}_${documentId}`, packageDir = path.join(packages, packageId); fs.mkdirSync(packageDir);
  store.capture({ token: batchId, product_channel: 'standalone', standalone_document_review: true, processing_mode: mode, items: [item] }, item,
    { package_id: packageId, original_text: raw ?? 'synthetic source', markdown: text,
      ...(actual ? { transform_trace: actual.transform_trace, verification_context: {
        profile: 'general', dictionary: actual.dictionary, strong_person_anchor: actual.strongPersonAnchor === true,
        ruleset: require('../plugins/data-secure/server/privacy/policy').PRIVACY_RULESET_VERSION,
        credential_policy: require('../plugins/data-secure/server/privacy/policy').CREDENTIAL_CONTEXT_POLICY_VERSION,
        publication_frame: actual.publication_frame || { prefix: '', suffix: '' }, reviewed_ranges: actual.reviewed_ranges || [] } } : {}) });
  fs.writeFileSync(path.join(packageDir, `${packageId}.md`), text);
  const manifest = mode === 'markdown-only' ? require('../plugins/data-secure/server/standalone/markdown-artifact').createMarkdownArtifact(
    require('../plugins/data-secure/server/standalone/markdown-contract').createMarkdownExtraction({ source_type: 'pdf', markdown: text,
      coverage: { status: 'complete', reason_codes: [] } }), packageId).manifest :
    { schema: 'eu-privacy-package/3', package_id: packageId, document: `${packageId}.md`, verification: { text_residual_pii: 'passed' }, document_sha256: sha(text) };
  fs.writeFileSync(path.join(packageDir, 'manifest.json'), JSON.stringify(manifest));
  const row = () => store.list(batchId).documents[0];
  const decide = action => { const r = row(); return store.decide(batchId, documentId, { action, operation_id: crypto.randomBytes(16).toString('hex'),
    revision: r.revision, output_sha256: r.output_sha256, ranges: [] }); };
  decide('approve'); const r = row(), selection = [{ document_id: documentId, revision: r.revision, output_sha256: r.output_sha256 }];
  return { store, reload: () => createDocumentReviewStore(storeOptions), batchId, documentId, text, selection, decide };
}
async function exportCall(f, operationId, acknowledge = false) {
  // Mirror serde_json's lexicographic map order, not JS fixture insertion order.
  const selection = f.selection.map(({ document_id, revision, output_sha256 }) => ({ document_id, output_sha256, revision }));
  context('export_approved_documents', { batch_id: f.batchId, operation_id: operationId, selection, acknowledge });
  return f.store.exportApproved(f.batchId, operationId, selection, acknowledge);
}
async function run() {
  let i = 0;
  // First installation: no picker and no pre-existing destination. Execute the
  // actual application method with real FS/config dependencies, then the real
  // native /2 admission and export pipe before any native folder selection.
  const { StandaloneApplicationService, defaultResultRoot } = require('../plugins/data-secure/server/standalone/application-service');
  const previousDocuments = process.env.DATASECURE_STANDALONE_DOCUMENTS_DIR;
  process.env.DATASECURE_STANDALONE_DOCUMENTS_DIR = path.join(root, 'documents');
  try {
    const serviceOptions = { home: path.join(root, 'synthetic-home'), dependencies: {
      fs, readConfiguredResultRootStatus: resultConfig.readConfiguredResultRootStatus,
      resultOutputDirectory: resultConfig.resultOutputDirectory,
      saveConfiguredResultRoot: resultConfig.saveConfiguredResultRoot,
      lightweightStatus: () => ({ local_intake_pending: false, batch_processing_active: false }),
      prepareConfiguredNativeExportBinding: resultConfig.prepareConfiguredNativeExportBinding
    } };
    const automatic = new StandaloneApplicationService(serviceOptions);
    preparationService = automatic;
    const defaultRoot = defaultResultRoot({ home: serviceOptions.home });
    assert.equal(fs.existsSync(defaultRoot), false);
    assert.equal(automatic.resultRootStatus().status, 'unconfigured');
    assert.equal(automatic.ensureResultRoot(), defaultRoot);
    const savedDefault = fs.readFileSync(resultConfig.configPath());
    const initial = JSON.parse(savedDefault);
    assert.equal(initial.schema, 'datasecure-result-root/5'); assert.equal(initial.root, defaultRoot);
    if (initial.exact_identity) {
      const exact = fs.statSync(defaultRoot, { bigint: true });
      assert.deepEqual(initial.exact_identity, { dev: String(exact.dev), ino: String(exact.ino), birthtime_ns: String(exact.birthtimeNs) });
    }
    assert.equal(Object.hasOwn(initial, 'native_export'), false);
    const f = fixture('markdown-and-anonymize', ++i), op = crypto.randomBytes(16).toString('hex');
    assert.equal((await exportCall(f, op)).exported_count, 1);
    const configured = JSON.parse(fs.readFileSync(resultConfig.configPath()));
    assert.equal(configured.schema, initial.exact_identity ? 'datasecure-result-root/6' : 'datasecure-result-root/4');
    if (initial.exact_identity) assert.deepEqual(configured.exact_identity, initial.exact_identity);
    assert.equal(configured.root, defaultRoot); assert.deepEqual(configured.identity, initial.identity);
    assert.deepEqual(configured.native_export, binding); assert.equal(configuredAdmissions, 1);
    assert.equal(nativeActions.includes('configure_export_root'), false, 'no native folder picker was used');
    assert.equal(fs.readFileSync(path.join(defaultRoot, 'DataSecure-KI-Export', `Export-${op}`, 'Dokument_01.md'), 'utf8'), f.text);
    // A new application object reads the saved root, without making a picker or
    // provisioning another binding. The same export receives only its ACK.
    const restarted = new StandaloneApplicationService(serviceOptions);
    preparationService = restarted; binding = null; f.store = f.reload();
    assert.equal(restarted.ensureResultRoot(), defaultRoot);
    const persisted = fs.readFileSync(resultConfig.configPath());
    assert.equal((await exportCall(f, op, true)).exported_count, 1);
    assert.equal(configuredAdmissions, 1); assert.deepEqual(fs.readFileSync(resultConfig.configPath()), persisted);
    console.log(`ok first installation: actual ensureResultRoot saves ${initial.schema}, native admission upgrades to ${configured.schema} without picker; saved root and ACK survive new service`);
  } finally {
    preparationService = null;
    if (previousDocuments === undefined) delete process.env.DATASECURE_STANDALONE_DOCUMENTS_DIR;
    else process.env.DATASECURE_STANDALONE_DOCUMENTS_DIR = previousDocuments;
  }
  {
    // Force the NEW lossless representation even on APFS with small inode IDs.
    // This is a test settings fixture, not an upgrade/adoption of a legacy /2.
    const exactRoot = path.join(root, 'new-exact-admission'); fs.mkdirSync(exactRoot);
    resultConfig.saveConfiguredResultRoot(exactRoot);
    const saved = JSON.parse(fs.readFileSync(resultConfig.configPath())), stat = fs.statSync(exactRoot, { bigint: true });
    saved.schema = 'datasecure-result-root/5';
    saved.exact_identity = { dev: String(stat.dev), ino: String(stat.ino), birthtime_ns: String(stat.birthtimeNs) };
    fs.writeFileSync(resultConfig.configPath(), JSON.stringify(saved));
    const f = fixture('markdown-only', ++i), operation = crypto.randomBytes(16).toString('hex'); binding = null;
    const before = configuredAdmissions;
    assert.equal((await exportCall(f, operation)).exported_count, 1);
    const completed = JSON.parse(fs.readFileSync(resultConfig.configPath()));
    assert.equal(completed.schema, 'datasecure-result-root/6');
    assert.deepEqual(completed.exact_identity, saved.exact_identity);
    assert.equal(configuredAdmissions, before + 1);
    const bytes = fs.readFileSync(resultConfig.configPath());
    f.store = f.reload(); binding = null;
    assert.equal((await exportCall(f, operation, true)).exported_count, 1);
    assert.deepEqual(fs.readFileSync(resultConfig.configPath()), bytes);
    assert.equal(configuredAdmissions, before + 1);
    console.log('ok real Node BigInt -> native held directory admission /5 -> /6, exact birth/dev/inode retained, fresh store ACK creates no new binding');
  }
  context('configure_results', { source_paths: [results], native_export_binding: true });
  binding = await channel.configureExportRoot(outer);
  assert.equal(binding.root, results); assert.match(binding.private_name, /^native-export-[a-f0-9]{32}$/u);
  console.log('ok native picker bootstrap creates and returns held parent bindings');
  const pickerBinding = binding;
  // Direct-results uses the same real owned pipe/OS publisher but a distinct
  // durable role. No approval or selection is supplied by this new outer DTO.
  // This proves the native boundary, not the separate review-store orchestration.
  for (const [index, mode] of ['markdown-only', 'markdown-and-anonymize'].entries()) {
    const body = Buffer.from(`# Fertiges Ergebnis ${index}\n[PERSON_001]\n`), digest = sha(body);
    const batchId = (900 + index).toString(16).padStart(64, '0'), operationId = crypto.randomBytes(16).toString('hex');
    const name = mode === 'markdown-only' ? 'Quelle.md' : 'Dokument_01.md';
    const operation = { batch_id: batchId, operation_id: operationId, request_sha256: sha(`results:${batchId}:${digest}`),
      processing_mode: mode, publication_role: 'results', binding: pickerBinding,
      files: [{ name, bytes: body.length, sha256: [...Buffer.from(digest, 'hex')] }] };
    const send = (command, body) => nativeSession.send('export_documents', { operation, command, ...(body ? { body } : {}) });
    const namespace = mode === 'markdown-only' ? 'DataSecure-Markdown-Korrektur' : 'DataSecure-KI-Export';
    const target = path.join(results, namespace, `Ergebnisse-${operationId}`);
    context('publish_result_documents', { batch_id: batchId });
    assert.equal(await send('write_body', { index: 0, offset: 0, hex: body.toString('hex'), final_chunk: true }), 'staged');
    assert.equal(fs.existsSync(target), false, 'a staged result is never reported as a visible complete generation');
    assert.equal(await send('publish'), 'completed');
    assert.deepEqual(fs.readdirSync(target), [name]);
    assert.deepEqual(fs.readFileSync(path.join(target, name)), body);
    assert.equal(await send('acknowledge'), 'acknowledged', 'this is a software receipt, not a fabricated human approval');
    context('publish_result_documents', { batch_id: batchId });
    assert.equal(await send('reconcile'), 'acknowledged');
    assert.equal(await send('publish'), 'acknowledged');
    assert.equal(fs.readdirSync(path.dirname(target)).filter(value => value === path.basename(target)).length, 1);
    context('resolve_history_results', { batch_id: batchId });
    assert.equal(await send('reconcile'), 'acknowledged');
    for (const command of ['publish', 'acknowledge', 'abandon']) {
      context('resolve_history_results', { batch_id: batchId });
      await assert.rejects(send(command), { code: 'STANDALONE_IPC_FAILED' }, `history cannot ${command}`);
    }
    context('publish_result_documents', { batch_id: 'f'.repeat(64) });
    await assert.rejects(send('reconcile'), { code: 'STANDALONE_IPC_FAILED' }, 'a different outer batch grants no capability');
    context('publish_result_documents', { batch_id: batchId, selection: [] });
    await assert.rejects(send('reconcile'), { code: 'STANDALONE_IPC_FAILED' }, 'new outer is closed; even a selection field is refused');
    context('resolve_document_export', { batch_id: batchId, operation_id: operationId });
    await assert.rejects(send('reconcile'), { code: 'STANDALONE_IPC_FAILED' }, 'legacy copy opener cannot adopt results role');
    // Reusing the private operation ID under the old role is a real durable
    // intent conflict even though the body and all other fields are identical.
    const { publication_role: _role, ...legacyOperation } = operation;
    context('export_approved_documents', { batch_id: batchId, operation_id: operationId,
      selection: [{ document_id: '1'.repeat(32), revision: 0, output_sha256: digest }], acknowledge: false });
    await assert.rejects(nativeSession.send('export_documents', { operation: legacyOperation, command: 'reconcile' }), { code: 'AI_EXPORT_CONFLICT' });
    assert.equal(fs.existsSync(path.join(results, namespace, `Export-${operationId}`)), false);
    assert.deepEqual(fs.readFileSync(path.join(target, name)), body);
    console.log(`ok ${mode}: actual results role, complete generation, software ACK, repeat/readonly reconciliation and closed legacy/role/batch boundaries`);
  }
  {
    // Full production composition: real content-bound initial publication,
    // private correction journal, current-vector planner AND native Rust pipe.
    const batchId = '800'.padStart(64, '0');
    const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };
    const state = { schema: 'datasecure-batch/7', token: batchId, product_channel: 'standalone',
      processing_mode: 'markdown-only', standalone_document_review: true, content_options: contentOptions,
      created_at: '2026-10-19T19:00:00.000Z', items: [1, 2].map(index => ({
        id: (800 + index).toString(16).padStart(32, '0'), name: `nested/Quelle-${index}.txt`,
        source_label: `nested/Quelle-${index}.txt`, sha256: sha(`source ${index}`), status: 'released' })) };
    const options = { dataRoot: data, controlOwnerPid: process.pid, nativeBinding: () => pickerBinding,
      nativeExport: async (operation, command, body) => {
        const status = await nativeSession.send('export_documents', { operation, command, ...(body ? { body } : {}) });
        if (loseNextPublish && command === 'publish') { loseNextPublish = false;
          throw Object.assign(Error('lost real result receipt'), { code: 'STANDALONE_IPC_TIMEOUT' }); }
        return status;
      } };
    let store = createDocumentReviewStore(options);
    for (const [index, item] of state.items.entries()) {
      const text = `# Aktuelles Dokument ${index + 1}\n42 Projekte.\n`, id = `dm_${item.id}`;
      const extraction = require('../plugins/data-secure/server/standalone/markdown-contract').createMarkdownExtraction({
        source_type: 'txt', markdown: text, coverage: { status: 'complete', reason_codes: [] }, content_options: contentOptions });
      Object.assign(item, await require('../plugins/data-secure/server/standalone/markdown-store').publishMarkdownArtifact(extraction, id, { contentOptions }));
      store.capture(state, item, { package_id: id, original_text: text, markdown: text, content_options: contentOptions, source_type: 'txt' });
    }
    process.env.EU_PRIVACY_RESULT_ROOT = results;
    let initial;
    try {
      const exporter = require('../plugins/data-secure/server/gateway/result-export');
      assert.equal(exporter.exportCompletedState(state).available, true);
      initial = exporter.initialResultPublication(batchId, true);
    } finally { delete process.env.EU_PRIVACY_RESULT_ROOT; }
    assert.deepEqual(initial.files.map(file => file.name).sort(), ['nested/Quelle-1.md', 'nested/Quelle-2.md']);
    const initialBytes = initial.files.map(file => fs.readFileSync(path.join(initial.directory.path, file.name)));
    assert.ok(store.list(batchId).documents.every(row => row.approved === false), 'no fabricated initial human approval');
    const edit = replacement => {
      const row = store.list(batchId).documents.find(row => row.document_id === state.items[0].id);
      const text = store.chunk(batchId, row.document_id, row.revision, 0).markdown, start = text.indexOf('42');
      assert.notEqual(start, -1);
      store.decide(batchId, row.document_id, { action: 'correct', revision: row.revision, output_sha256: row.output_sha256,
        operation_id: crypto.randomBytes(16).toString('hex'), ranges: [{ start, end: start + 2, replacement }] });
    };
    const publish = async () => { context('publish_result_documents', { batch_id: batchId }); return store.publishResults(batchId); };
    edit('42 korrigierte');
    const first = await publish(), generation = first.result_publication.generation_id;
    assert.equal(first.result_publication.state, 'current'); assert.equal(first.result_publication.count, 2);
    const directory = path.join(results, 'DataSecure-Markdown-Korrektur', `Ergebnisse-${generation}`);
    assert.deepEqual(fs.readdirSync(directory).sort(), ['Quelle-1.md', 'Quelle-2.md']);
    assert.match(fs.readFileSync(path.join(directory, 'Quelle-1.md'), 'utf8'), /42 korrigierte Projekte/u);
    assert.deepEqual(fs.readFileSync(path.join(directory, 'Quelle-2.md')), initialBytes[1]);
    assert.ok(store.list(batchId).documents.every(row => row.approved === false), 'publication is not human approval');
    assert.equal((await publish()).result_publication.generation_id, generation);
    edit('42 nochmals'); loseNextPublish = true;
    await assert.rejects(publish(), { code: 'STANDALONE_IPC_TIMEOUT' });
    store = createDocumentReviewStore(options);
    const resumed = await publish(); assert.notEqual(resumed.result_publication.generation_id, generation);
    assert.equal((await publish()).result_publication.generation_id, resumed.result_publication.generation_id);
    context('resolve_history_results', { batch_id: batchId });
    const resolved = await store.resolveResultsGeneration(batchId);
    assert.equal(resolved.local_path, path.join(results, 'DataSecure-Markdown-Korrektur', `Ergebnisse-${resumed.result_publication.generation_id}`));
    assert.match(fs.readFileSync(path.join(resolved.local_path, 'Quelle-1.md'), 'utf8'), /42 nochmals korrigierte Projekte/u);
    for (const [index, file] of initial.files.entries())
      assert.deepEqual(fs.readFileSync(path.join(initial.directory.path, file.name)), initialBytes[index], 'initial files are preserved');
    const corrupt = path.join(resolved.local_path, 'Quelle-2.md');
    fs.writeFileSync(corrupt, '# Manuell geaendert\n');
    const count = fs.readdirSync(path.dirname(resolved.local_path)).filter(name => name.startsWith('Ergebnisse-')).length;
    await assert.rejects(publish(), error => ['RESULT_PUBLICATION_CONFLICT', 'AI_EXPORT_CONFLICT'].includes(error.code));
    assert.equal(fs.readFileSync(corrupt, 'utf8'), '# Manuell geaendert\n');
    assert.equal(fs.readdirSync(path.dirname(resolved.local_path)).filter(name => name.startsWith('Ergebnisse-')).length, count);
    console.log('ok production initial -> correction -> native full-vector generation -> LostReceipt -> fresh store -> readonly opener; no human approval, originals unchanged, manual tamper refused');
  }
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const admissionsBefore = configuredAdmissions;
    const targetRoot = path.join(root, `configured-${++i}`); fs.mkdirSync(targetRoot);
    resultConfig.saveConfiguredResultRoot(targetRoot);
    const original = JSON.parse(fs.readFileSync(resultConfig.configPath()));
    const f = fixture(mode, ++i), op = crypto.randomBytes(16).toString('hex'); binding = null;
    assert.equal((await exportCall(f, op)).exported_count, 1);
    const saved = JSON.parse(fs.readFileSync(resultConfig.configPath()));
    assert.equal(saved.schema, original.exact_identity ? 'datasecure-result-root/6' : 'datasecure-result-root/4'); assert.deepEqual(saved.identity, original.identity);
    if (original.exact_identity) assert.deepEqual(saved.exact_identity, original.exact_identity);
    assert.equal(saved.root, targetRoot); assert.deepEqual(saved.native_export, binding);
    assert.equal(configuredAdmissions, admissionsBefore + 1, 'actual Node22 setting admitted by the native held handle once');
    const name = mode === 'markdown-only' ? 'Quelle.md' : 'Dokument_01.md';
    const namespace = mode === 'markdown-only' ? 'DataSecure-Markdown-Korrektur' : 'DataSecure-KI-Export';
    assert.equal(fs.readFileSync(path.join(targetRoot, namespace, `Export-${op}`, name), 'utf8'), f.text);
    // A changed current preference does not authorize repairing or relocating
    // a previously frozen operation. Only its original binding is reconciled.
    resultConfig.saveConfiguredResultRoot(results); binding = null;
    assert.equal((await exportCall(f, op, true)).exported_count, 1);
    assert.equal(configuredAdmissions, admissionsBefore + 1);
    console.log(`ok ${mode}: real Node22 ${original.schema} admission, native configure, ${saved.schema} save, exact copy and old-operation ACK without picker`);
  }
  binding = pickerBinding;
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const f = fixture(mode, ++i), op = crypto.randomBytes(16).toString('hex');
    loseNextPublish = true;
    await assert.rejects(exportCall(f, op), { code: 'STANDALONE_IPC_TIMEOUT' });
    const target = path.join(results, mode === 'markdown-only' ? 'DataSecure-Markdown-Korrektur' : 'DataSecure-KI-Export', `Export-${op}`);
    const expectedName = mode === 'markdown-only' ? 'Quelle.md' : 'Dokument_01.md';
    assert.deepEqual(fs.readdirSync(target), [expectedName]);
    assert.equal(fs.readFileSync(path.join(target, expectedName), 'utf8'), f.text);
    f.decide('revoke'); // lost completion must still reconcile this earlier exact copy
    const beforeAck = nativeCommands.length;
    assert.equal((await exportCall(f, op, true)).exported_count, 1);
    assert.deepEqual(nativeCommands.slice(beforeAck), ['acknowledge'], 'one native ACK owns the fresh target check, not reconcile plus ACK');
    assert.equal(f.store.historySummary(f.batchId).current_exported_count, 0);
    assert.equal(f.store.historySummary(f.batchId).pending_confirmation_count, 0);
    context('resolve_document_export', { batch_id: f.batchId, operation_id: op });
    assert.equal((await f.store.resolveExport(f.batchId, op)).local_path, target);
    context('abandon_document_export', { batch_id: f.batchId, operation_id: op, digest: JSON.parse(fs.readFileSync(path.join(data, 'document-reviews', f.batchId, `export-${op}.json`))).request_sha256 });
    await assert.rejects(f.store.abandonExport(f.batchId, op, outer.digest), { code: 'AI_EXPORT_ALREADY_COMPLETE' });
    fs.writeFileSync(path.join(target, 'extra.txt'), 'not authorized');
    context('resolve_document_export', { batch_id: f.batchId, operation_id: op });
    await assert.rejects(f.store.resolveExport(f.batchId, op), { code: 'AI_EXPORT_CONFLICT' });
    const beforeTamperedAck = nativeCommands.length;
    await assert.rejects(exportCall(f, op, true), { code: 'AI_EXPORT_CONFLICT' });
    assert.deepEqual(nativeCommands.slice(beforeTamperedAck), ['acknowledge'], 'a corrupt completed copy is never acknowledged or republished');
    if (mode === 'markdown-and-anonymize') {
      const privateRoot = path.join(data, binding.private_name);
      const completedDigest = JSON.parse(fs.readFileSync(path.join(data, 'document-reviews', f.batchId, `export-${op}.json`))).request_sha256;
      fs.unlinkSync(path.join(privateRoot, `${op}-parents-binding.json`));
      context('abandon_document_export', { batch_id: f.batchId, operation_id: op, digest: completedDigest });
      await assert.rejects(f.store.abandonExport(f.batchId, op, completedDigest), { code: 'AI_EXPORT_ALREADY_COMPLETE' });
      assert.equal(fs.existsSync(path.join(privateRoot, `${op}-parents-abandoned.json`)), false,
        'a saved completion must never be relabelled after a damaged native binding');
    }
    console.log(`ok ${mode}: actual bytes, lost receipt, later revocation, ACK, resolve and tamper rejection`);
  }
  const f = fixture('markdown-only', ++i), op = crypto.randomBytes(16).toString('hex');
  poisonedBody = true; await assert.rejects(exportCall(f, op), { code: 'AI_EXPORT_CONFLICT' });
  assert.equal(fs.existsSync(path.join(results, 'DataSecure-Markdown-Korrektur', `Export-${op}`)), false);
  const record = JSON.parse(fs.readFileSync(path.join(data, 'document-reviews', f.batchId, `export-${op}.json`)));
  context('abandon_document_export', { batch_id: f.batchId, operation_id: op, digest: record.request_sha256 });
  assert.equal((await f.store.abandonExport(f.batchId, op, record.request_sha256)).abandoned, true);
  assert.equal(f.store.historySummary(f.batchId).pending_incomplete_count, 0);
  console.log('ok altered private body cannot publish; explicit native abandonment settles the same operation');
  const large = fixture('markdown-only', ++i, '🙂 gültiger Text.\n'.repeat(12000));
  const largeOp = crypto.randomBytes(16).toString('hex');
  assert.equal((await exportCall(large, largeOp)).exported_count, 1);
  assert.equal(fs.readFileSync(path.join(results, 'DataSecure-Markdown-Korrektur', `Export-${largeOp}`, 'Quelle.md'), 'utf8'), large.text);
  const privateEntries = fs.readdirSync(path.join(data, binding.private_name));
  assert.ok(privateEntries.every(name => !/^export-.*-body-/u.test(name)), 'body files never collect in the common native journal');
  assert.ok(privateEntries.length < 40, 'multi-chunk bodies are stored only inside their own operation stage');
  console.log('ok bounded multi-frame Unicode body preserves exact bytes without a shared spool inventory');
  const raw = 'Name: Anna Beispiel\nArbeitgeber: Muster GmbH\n' +
    Array.from({ length: 10001 }, (_, index) => `E-Mail: qa${index}@quality.example.invalid`).join('\n');
  for (const native of [false, true]) {
    const actual = fixture('markdown-and-anonymize', ++i, '', raw, native), operation = crypto.randomBytes(16).toString('hex');
    assert.equal((await exportCall(actual, operation)).exported_count, 1);
    const resolved = await actual.store.resolveExport(actual.batchId, operation);
    assert.deepEqual(fs.readdirSync(resolved.local_path), ['Dokument_01.md']);
    const exported = fs.readFileSync(path.join(resolved.local_path, 'Dokument_01.md'), 'utf8');
    assert.equal(exported, actual.text); assert.doesNotMatch(exported, /Anna Beispiel|Muster GmbH|qa\d+@quality/u);
    for (const reference of [actual.store.resolveIdentityOverview(actual.batchId), actual.store.resolveIdentityOverview(actual.batchId, operation)]) {
      const identities = fs.readFileSync(reference.local_path, 'utf8');
      assert.match(identities, /Anna Beispiel/u); assert.match(identities, /Muster GmbH/u);
      assert.doesNotMatch(identities, /qa\d+@quality/u);
    }
    console.log(`ok ${native ? 'native Rust' : 'Node'}: real 10,001-contact core trace, person/company, approval, exact export and identity reread`);
  }
  const old = path.join(data, binding.private_name), displaced = `${old}-displaced`;
  fs.renameSync(old, displaced); fs.mkdirSync(old);
  const replaced = fixture('markdown-only', ++i), refusedOp = crypto.randomBytes(16).toString('hex');
  await assert.rejects(exportCall(replaced, refusedOp), { code: 'AI_EXPORT_CONFLICT' });
  assert.deepEqual(fs.readdirSync(old), [], 'no private source text is written into a replaced binding');
  assert.equal(fs.existsSync(path.join(results, 'DataSecure-Markdown-Korrektur', `Export-${refusedOp}`)), false);
  console.log('ok replaced private native binding receives no source text or publication');
}
(async () => {
  try { await run(); }
  catch (e) { console.error(e); console.error(stderr); process.exitCode = 1; }
  finally {
    child.stdin.end(); const result = await exited; clearTimeout(deadline);
    if (result.code !== 0) { console.error('Native pipe helper did not exit cleanly', result, stderr); process.exitCode = 1; }
    // Retain these strictly synthetic fault fixtures for inspection; never
    // recursively delete a directory that has been deliberately tampered with.
    console.log(`Synthetic native-export evidence: ${root}`);
  }
})();
