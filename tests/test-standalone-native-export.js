'use strict';
// Real Node document approvals + framed native callback + native filesystem
// transaction. The Rust test-only pipe is NOT a native Tauri/GUI package test.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { observeChild, waitForChildCompletion } = require('./lib/native-export-test-lifecycle.cjs');
const testArgs = process.argv.slice(2);
assert.ok(testArgs.length === 0 || testArgs.length === 1 && testArgs[0] === '--first-install-only', 'closed native export test mode');
const firstInstallOnly = testArgs.length === 1;
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
const admissionSnapshots = [], nativeConfigureFailures = [];
let invalidNativeConfigureFailures = 0;
const configureStages = new Set(('nonce guard public_open data_open roots anonymize_bind anonymize_volume markdown_bind markdown_volume private_create private_sync data_sync public_sync root_encoding ' +
  'admission_digest_encoding admission_guard admission_data_open admission_settings_open admission_settings_read admission_settings_digest admission_settings_parse admission_root admission_record admission_native_identity admission_public_open admission_node_identity admission_identity_match admission_settings_binding admission_data_reopen admission_repeat_data_open admission_repeat_settings_binding admission_repeat_settings_read admission_repeat_settings_match').split(' '));
const configureKinds = new Set('NotFound PermissionDenied ConnectionRefused ConnectionReset HostUnreachable NetworkUnreachable ConnectionAborted NotConnected AddrInUse AddrNotAvailable NetworkDown BrokenPipe AlreadyExists WouldBlock NotADirectory IsADirectory DirectoryNotEmpty ReadOnlyFilesystem FilesystemLoop StaleNetworkFileHandle InvalidInput InvalidData TimedOut WriteZero StorageFull NotSeekable QuotaExceeded FileTooLarge ResourceBusy ExecutableFileBusy Deadlock CrossesDevices TooManyLinks InvalidFilename ArgumentListTooLong Interrupted Unsupported UnexpectedEof OutOfMemory InProgress Other Uncategorized'.split(' '));
child.stderr.on('data', bytes => { stderr = `${stderr}${bytes}`.slice(-8192); });
readline.createInterface({ input: child.stderr }).on('line', line => {
  const prefix = 'NATIVE_CONFIGURE_FAILURE:';
  if (!line.startsWith(prefix)) return;
  try {
    const value = JSON.parse(line.slice(prefix.length));
    if (!value || Object.keys(value).sort().join(',') !== 'io_error_kind,raw_os_error,stage' ||
        !configureStages.has(value.stage) || !configureKinds.has(value.io_error_kind) ||
        value.raw_os_error !== null && (!Number.isInteger(value.raw_os_error) || value.raw_os_error < -(2 ** 31) || value.raw_os_error >= 2 ** 31) ||
        nativeConfigureFailures.length >= 64) throw Error('closed diagnostic required');
    nativeConfigureFailures.push(value);
  } catch { invalidNativeConfigureFailures++; }
});
function observeAdmissionSnapshot(snapshot, batchId, operationId) {
  // Test evidence only, beneath this process's create-only synthetic root.
  // These fresh reads never authorize or repair the real native request.
  if (admissionSnapshots.length >= 64) return;
  try {
    const bytes = fs.readFileSync(resultConfig.configPath()), record = JSON.parse(bytes);
    const stat = fs.statSync(snapshot.root, { bigint: true });
    const exact = { dev: String(stat.dev), ino: String(stat.ino), birthtime_ns: String(stat.birthtimeNs) };
    admissionSnapshots.push({ configuration_schema: /^datasecure-result-root\/[1-6]$/u.test(record.schema) ? record.schema : 'unknown',
      admission_kind: ['native', 'node22', 'node22_bigint'].includes(snapshot.admission?.kind) ? snapshot.admission.kind : 'unknown',
      setting_digest_matches: sha(bytes) === snapshot.setting_sha256, root_matches: record.root === snapshot.root,
      exact_identity_matches: ['dev', 'ino', 'birthtime_ns'].every(key => record.exact_identity?.[key] === exact[key]),
      admission_matches_saved: JSON.stringify(snapshot.admission?.identity) === JSON.stringify(snapshot.admission?.kind === 'native' ? record.native_identity :
        snapshot.admission?.kind === 'node22_bigint' ? record.exact_identity : record.identity),
      outer_batch_matches: outer?.batch_id === batchId, outer_operation_matches: outer?.operation_id === operationId });
  } catch { admissionSnapshots.push({ diagnostic_unavailable: true }); }
}
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
const observedChild = observeChild(child);
child.once('exit', () => { channel.abort('STANDALONE_IPC_FAILED'); });
child.once('error', () => { channel.abort('STANDALONE_IPC_FAILED'); });
const deadlineAt = performance.now() + 180000;
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
        observeAdmissionSnapshot(snapshot, batchId, operationId);
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
  if (firstInstallOnly) { console.log('ok first-install-only: complete unchanged first-installation/export/restart/ACK block; remaining full-suite cases intentionally not run'); return; }
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
    const companions = mode === 'markdown-and-anonymize' ? [
      { name: 'Vertraulich/Dateizuordnung.csv', bytes: Buffer.from('\uFEFFOriginaldatei;Anonymisiertes Ergebnis\r\nQuelle.txt;Dokument_01.md\r\n') },
      { name: 'Vertraulich/Personen-Pseudonym-Zuordnung.txt', bytes: Buffer.from('VERTRAULICH\n[PERSON_001] = Anna Beispiel\n') }
    ] : [];
    if (companions.length) operation.confidential = Object.fromEntries(['filename_mapping', 'identities'].map((role, n) =>
      [role, { bytes: companions[n].bytes.length, sha256: [...Buffer.from(sha(companions[n].bytes), 'hex')] }]));
    const send = (command, body) => nativeSession.send('export_documents', { operation, command, ...(body ? { body } : {}) });
    const namespace = mode === 'markdown-only' ? 'DataSecure-Markdown-Korrektur' : 'DataSecure-KI-Export';
    const target = path.join(results, namespace, `Ergebnisse-${operationId}`);
    context('publish_result_documents', { batch_id: batchId });
    assert.equal(await send('write_body', { index: 0, offset: 0, hex: body.toString('hex'), final_chunk: true }), 'staged');
    assert.equal(fs.existsSync(target), false, 'a staged result is never reported as a visible complete generation');
    if (companions.length) {
      await assert.rejects(send('publish'), { code: 'AI_EXPORT_INCOMPLETE' }, 'missing confidential bodies cannot become ready');
      for (const [extra, file] of companions.entries())
        assert.equal(await send('write_body', { index: operation.files.length + extra, offset: 0,
          hex: file.bytes.toString('hex'), final_chunk: true }), 'staged');
    }
    assert.equal(await send('publish'), 'completed');
    assert.deepEqual(fs.readdirSync(target).sort(), [name, ...(companions.length ? ['Vertraulich'] : [])].sort());
    for (const file of companions) assert.deepEqual(fs.readFileSync(path.join(target, file.name)), file.bytes);
    assert.deepEqual(fs.readFileSync(path.join(target, name)), body);
    assert.equal(await send('acknowledge'), 'acknowledged', 'this is a software receipt, not a fabricated human approval');
    const metadata = path.join(target, '.DS_Store');
    fs.writeFileSync(metadata, 'opaque OS display metadata', { flag: 'wx' });
    if (process.platform !== 'darwin') {
      context('resolve_history_results', { batch_id: batchId });
      assert.equal(await send('reconcile'), 'acknowledged', 'confirmed working-folder opening never reads public extras on any host');
      context('publish_result_documents', { batch_id: batchId });
      await assert.rejects(send('reconcile'), { code: 'AI_EXPORT_CONFLICT' }, 'non-Mac extras still refuse a mutating reconciliation');
      assert.equal(fs.readFileSync(metadata, 'utf8'), 'opaque OS display metadata', 'no automatic metadata repair/removal');
      const leaf = fs.lstatSync(metadata); assert.ok(leaf.isFile() && !leaf.isSymbolicLink() && leaf.nlink === 1);
      fs.unlinkSync(metadata); // Only this newly created, exact synthetic leaf.
    }
    context('publish_result_documents', { batch_id: batchId });
    assert.equal(await send('reconcile'), 'acknowledged');
    assert.equal(await send('publish'), 'acknowledged');
    assert.equal(fs.readdirSync(path.dirname(target)).filter(value => value === path.basename(target)).length, 1);
    context('resolve_history_results', { batch_id: batchId });
    assert.equal(await send('reconcile'), 'acknowledged');
    if (process.platform === 'darwin') {
      fs.writeFileSync(metadata, 'changed OS metadata, not anonymized or part of the document plan');
      context('resolve_history_results', { batch_id: batchId });
      assert.equal(await send('reconcile'), 'acknowledged');
    }
    assert.equal(operation.files.length, 1);
    assert.ok(operation.files.every(file => file.name.endsWith('.md')));
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
    const { publication_role: _role, confidential: _confidential, ...legacyOperation } = operation;
    context('export_approved_documents', { batch_id: batchId, operation_id: operationId,
      selection: [{ document_id: '1'.repeat(32), revision: 0, output_sha256: digest }], acknowledge: false });
    await assert.rejects(nativeSession.send('export_documents', { operation: legacyOperation, command: 'reconcile' }), { code: 'AI_EXPORT_CONFLICT' });
    assert.equal(fs.existsSync(path.join(results, namespace, `Export-${operationId}`)), false);
    assert.deepEqual(fs.readFileSync(path.join(target, name)), body);
    if (companions.length) {
      const before = fs.readdirSync(target, { recursive: true }).sort();
      const confidentialDirectory = path.join(target, 'Vertraulich'), old = path.join(root, `retired-confidential-${operationId}`);
      fs.renameSync(confidentialDirectory, old); fs.mkdirSync(confidentialDirectory);
      for (const file of companions) fs.copyFileSync(path.join(old, path.basename(file.name)), path.join(confidentialDirectory, path.basename(file.name)));
      assert.deepEqual(fs.readdirSync(target, { recursive: true }).sort(), before, 'same-byte native oracle has no extra-name confounder');
      assert.deepEqual(fs.readFileSync(path.join(target, name)), body);
      for (const file of companions) assert.deepEqual(fs.readFileSync(path.join(target, file.name)), file.bytes);
      context('resolve_history_results', { batch_id: batchId });
      assert.equal(await send('reconcile'), 'acknowledged', 'public confidential subtree is not opener authority or read as input');
      context('publish_result_documents', { batch_id: batchId });
      await assert.rejects(send('reconcile'), { code: 'AI_EXPORT_CONFLICT' }, 'strict mutating route never adopts a replacement confidential directory');
      assert.equal(fs.existsSync(old), true, 'no automatic cleanup or repair');
    }
    console.log(`ok ${mode}: actual results role, complete generation, software ACK, repeat/readonly reconciliation and closed legacy/role/batch boundaries`);
  }
  for (const [modeIndex, mode] of ['markdown-only', 'markdown-and-anonymize'].entries()) {
    // Full production composition: real content-bound initial publication,
    // private correction journal, current-vector planner AND native Rust pipe.
    const anonymous = mode === 'markdown-and-anonymize', serial = 800 + modeIndex * 10;
    const batchId = String(serial).padStart(64, '0');
    const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };
    const state = { schema: 'datasecure-batch/7', token: batchId, product_channel: 'standalone',
      processing_mode: mode, standalone_document_review: true, content_options: contentOptions,
      ...(anonymous ? { profile: 'general', output_naming_mode: 'neutral' } : {}),
      created_at: '2026-10-19T19:00:00.000Z', items: [1, 2].map(index => ({
        id: (serial + index).toString(16).padStart(32, '0'), name: `nested/Quelle-${index}.txt`,
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
      const text = `# Aktuelles Dokument ${index + 1}\n${anonymous ? 'Name: Anna Beispiel\nAnna Beispiel hat ' : ''}42 Projekte und 42 Aufträge.\n`,
        id = `${anonymous ? 'ds' : 'dm'}_${item.id}`;
      if (anonymous) {
        const captured = require('../plugins/data-secure/server/pii-engine').anonymize(text, 'general',
          { captureTransformPlan: true, productChannel: 'standalone', contentOptions });
        const pub = require('../plugins/data-secure/server/standalone/anonymized-artifact'), coverage = { status: 'complete', reason_codes: [] };
        const proof = pub.verifyAnonymizedPublication({ markdown: captured.text, profile: 'general', content_options: contentOptions,
          source_extraction: require('../plugins/data-secure/server/core/source-extraction-contract').createSourceExtraction(
            { source_type: 'txt', content_options: contentOptions, coverage, markdown: text }, 8_000_000),
          dictionary: captured.dictionary, strong_person_anchor: captured.strongPersonAnchor === true, reviewed_person_candidates: null });
        const artifact = pub.createAnonymizedArtifact({ package_id: id, content_options: contentOptions, source_type: 'txt', profile: 'general',
          operation_id: crypto.randomUUID(), created_at: new Date().toISOString(), coverage, markdown: captured.text, verification_proof: proof });
        const folder = path.join(require('../plugins/data-secure/server/standalone/anonymized-store').anonymizedArtifactRoots().output, id);
        fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, `${id}.md`), artifact.markdown);
        fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(artifact.manifest));
        item.package_id = id; item.document_result = artifact.manifest.document_result;
        store.capture(state, item, { package_id: id, original_text: text, markdown: captured.text, content_options: contentOptions, source_type: 'txt',
          publication_binding: artifact.expectation, transform_trace: captured.transform_trace, verification_context: {
            profile: 'general', dictionary: captured.dictionary, strong_person_anchor: captured.strongPersonAnchor === true,
            ruleset: require('../plugins/data-secure/server/privacy/policy').PRIVACY_RULESET_VERSION,
            credential_policy: require('../plugins/data-secure/server/privacy/policy').CREDENTIAL_CONTEXT_POLICY_VERSION,
            person_field_policy: require('../plugins/data-secure/server/core/person-field-policy').CONTENT_PERSON_FIELD_POLICY,
            publication_frame: { prefix: '', suffix: '' }, reviewed_ranges: [] } });
        continue;
      }
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
    assert.deepEqual(initial.files.map(file => file.name).sort(), anonymous
      ? ['nested/Dokument-001-anonymisiert.md', 'nested/Dokument-002-anonymisiert.md'] : ['nested/Quelle-1.md', 'nested/Quelle-2.md']);
    const initialBytes = initial.files.map(file => fs.readFileSync(path.join(initial.directory.path, file.name)));
    if (process.platform === 'darwin') for (const folder of [initial.directory.path, path.join(initial.directory.path, 'nested')])
      fs.writeFileSync(path.join(folder, '.DS_Store'), 'opaque initial OS metadata', { flag: 'wx' });
    assert.ok(store.list(batchId).documents.every(row => row.approved === false), 'no fabricated initial human approval');
    const edit = replacement => {
      const row = store.list(batchId).documents.find(row => row.document_id === state.items[0].id);
      const text = store.chunk(batchId, row.document_id, row.revision, 0).markdown, start = text.indexOf('42');
      assert.notEqual(start, -1);
      store.decide(batchId, row.document_id, { action: anonymous ? 'redact' : 'correct', revision: row.revision, output_sha256: row.output_sha256,
        operation_id: crypto.randomBytes(16).toString('hex'), ranges: [{ start, end: start + 2, ...(anonymous ? {} : { replacement }) }] });
    };
    const publish = async () => { context('publish_result_documents', { batch_id: batchId }); return store.publishResults(batchId); };
    edit('42 korrigierte');
    const first = await publish(), generation = first.result_publication.generation_id;
    assert.equal(first.result_publication.state, 'current'); assert.equal(first.result_publication.count, 2);
    const namespace = anonymous ? 'DataSecure-KI-Export' : 'DataSecure-Markdown-Korrektur';
    const names = anonymous ? ['Dokument_01.md', 'Dokument_02.md', 'Vertraulich'] : ['Quelle-1.md', 'Quelle-2.md'];
    const directory = path.join(results, namespace, `Ergebnisse-${generation}`);
    assert.deepEqual(fs.readdirSync(directory).sort(), names);
    if (!anonymous) assert.match(fs.readFileSync(path.join(directory, names[0]), 'utf8'), /42 korrigierte Projekte/u);
    if (anonymous) {
      const expected = initialBytes[0].toString('utf8').replace('42 Projekte', '[MANUAL_REDACTION] Projekte');
      assert.notEqual(expected, initialBytes[0].toString('utf8'), 'independent known-range oracle changed a real source span');
      assert.equal(fs.readFileSync(path.join(directory, names[0]), 'utf8'), expected);
      assert.doesNotMatch(expected, /Anna Beispiel/u);
      assert.deepEqual(fs.readdirSync(path.join(directory, 'Vertraulich')).sort(), ['Dateizuordnung.csv', 'Pseudonym-Zuordnung.txt', 'Pseudonym-Zuordnung.xlsx']);
      assert.match(fs.readFileSync(path.join(directory, 'Vertraulich/Dateizuordnung.csv'), 'utf8'), /Dokument_01\.md/u);
      assert.match(fs.readFileSync(path.join(directory, 'Vertraulich/Pseudonym-Zuordnung.txt'), 'utf8'), /Anna Beispiel/u);
      assert.equal(fs.readFileSync(path.join(directory, 'Vertraulich/Pseudonym-Zuordnung.xlsx')).subarray(0, 2).toString(), 'PK');
    }
    assert.deepEqual(fs.readFileSync(path.join(directory, names[1])), initialBytes[1]);
    assert.ok(store.list(batchId).documents.every(row => row.approved === false), 'publication is not human approval');
    if (process.platform === 'darwin') fs.writeFileSync(path.join(directory, '.DS_Store'), 'opaque current OS metadata', { flag: 'wx' });
    assert.equal((await publish()).result_publication.generation_id, generation);
    edit('42 nochmals'); loseNextPublish = true;
    await assert.rejects(publish(), { code: 'STANDALONE_IPC_TIMEOUT' });
    store = createDocumentReviewStore(options);
    const resumed = await publish(); assert.notEqual(resumed.result_publication.generation_id, generation);
    assert.equal((await publish()).result_publication.generation_id, resumed.result_publication.generation_id);
    context('resolve_history_results', { batch_id: batchId });
    const resolved = await store.resolveResultsGeneration(batchId);
    assert.equal(resolved.local_path, path.join(results, namespace, `Ergebnisse-${resumed.result_publication.generation_id}`));
    assert.deepEqual(fs.readdirSync(resolved.local_path).sort(), names, 'OS metadata is never propagated to a new generation');
    if (!anonymous) assert.match(fs.readFileSync(path.join(resolved.local_path, names[0]), 'utf8'), /42 nochmals korrigierte Projekte/u);
    else assert.equal(fs.readFileSync(path.join(resolved.local_path, names[0]), 'utf8'), initialBytes[0].toString('utf8')
      .replace('42 Projekte', '[MANUAL_REDACTION] Projekte').replace('42 Aufträge', '[MANUAL_REDACTION] Aufträge'),
      'both independent explicit masking decisions must occur in the actual native current file');
    for (const [index, file] of initial.files.entries())
      assert.deepEqual(fs.readFileSync(path.join(initial.directory.path, file.name)), initialBytes[index], 'initial files are preserved');
    const corrupt = path.join(resolved.local_path, names[1]);
    fs.writeFileSync(corrupt, '# Manuell geaendert\n');
    fs.writeFileSync(path.join(resolved.local_path, '~$Office.xlsx'), 'public lock marker');
    const count = fs.readdirSync(path.dirname(resolved.local_path)).filter(name => name.startsWith('Ergebnisse-')).length;
    store = createDocumentReviewStore(options);
    context('resolve_history_results', { batch_id: batchId });
    assert.equal((await store.resolveResultsGeneration(batchId)).local_path, resolved.local_path,
      'fresh store and actual native read-only opener permit public working-copy edits');
    assert.equal((await publish()).result_publication.generation_id, resumed.result_publication.generation_id,
      'no-op never reconciles or overwrites completed public bytes');
    assert.equal(fs.readFileSync(corrupt, 'utf8'), '# Manuell geaendert\n');
    assert.equal(fs.readdirSync(path.dirname(resolved.local_path)).filter(name => name.startsWith('Ergebnisse-')).length, count);
    const row = store.list(batchId).documents.find(value => value.document_id === state.items[1].id);
    const privateText = store.chunk(batchId, row.document_id, row.revision, 0).markdown, start = privateText.indexOf('42');
    assert.notEqual(start, -1);
    store.decide(batchId, row.document_id, { action: anonymous ? 'redact' : 'correct', revision: row.revision,
      output_sha256: row.output_sha256, operation_id: crypto.randomBytes(16).toString('hex'),
      ranges: [{ start, end: start + 2, ...(anonymous ? {} : { replacement: '42 privat korrigierte' }) }] });
    const next = await publish();
    assert.notEqual(next.result_publication.generation_id, resumed.result_publication.generation_id);
    const nextFolder = path.join(results, namespace, `Ergebnisse-${next.result_publication.generation_id}`);
    assert.equal(fs.readFileSync(corrupt, 'utf8'), '# Manuell geaendert\n', 'new private correction never overwrites external edits');
    assert.equal(fs.existsSync(path.join(nextFolder, '~$Office.xlsx')), false, 'no foreign public siblings are imported');
    assert.equal(fs.readFileSync(path.join(nextFolder, names[1]), 'utf8'), anonymous
      ? initialBytes[1].toString('utf8').replace('42 Projekte', '[MANUAL_REDACTION] Projekte')
      : privateText.replace('42 Projekte', '42 privat korrigierte Projekte'), 'new bytes come only from the private revision');
    context('resolve_history_results', { batch_id: batchId });
    assert.equal((await store.resolveResultsGeneration(batchId)).local_path, nextFolder);
    console.log(`ok ${mode}: production initial -> correction -> native full-vector generation -> LostReceipt -> fresh store -> readonly working-copy opener; public edits preserved, new private generation never imports them`);
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
  const beforeLarge = new Set(fs.readdirSync(path.join(data, binding.private_name)));
  assert.equal((await exportCall(large, largeOp)).exported_count, 1);
  assert.equal(fs.readFileSync(path.join(results, 'DataSecure-Markdown-Korrektur', `Export-${largeOp}`, 'Quelle.md'), 'utf8'), large.text);
  const privateEntries = fs.readdirSync(path.join(data, binding.private_name));
  assert.ok(privateEntries.every(name => !/^export-.*-body-/u.test(name)), 'body files never collect in the common native journal');
  assert.deepEqual(privateEntries.filter(name => !beforeLarge.has(name)).sort(),
    [`${largeOp}-parents-binding.json`, `${largeOp}-parents-intent.json`, `journal-${largeOp}`, `staging-${largeOp}`].sort(),
    'exact new operation parents only; frame count cannot grow a shared spool, regardless of earlier cases');
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
    child.stdin.end();
    const completion = await waitForChildCompletion(observedChild, deadlineAt);
    clearTimeout(deadline);
    if (!completion.close_confirmed || !completion.exit_confirmed) {
      console.error('Native pipe helper exit/close unconfirmed within original deadline; fixture retained'); process.exitCode = 1;
      // Detach only this harness's own pipes after failure. This is not a
      // successful join, writer-quiescence proof or authority to delete data.
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.unref();
    }
    if (completion.exit_code !== 0 || completion.error_observed) { console.error('Native pipe helper did not exit cleanly', completion, stderr); process.exitCode = 1; }
    if (invalidNativeConfigureFailures !== 0) { console.error('Closed native configure diagnostic rejected'); process.exitCode = 1; }
    fs.writeFileSync(path.join(root, 'NATIVE-ADMISSION-DIAGNOSTIC.json'), JSON.stringify({
      schema: 'datasecure-native-export-test-diagnostics/1', test_mode: firstInstallOnly ? 'first-install-only' : 'full',
      configured_admissions: configuredAdmissions, admission_snapshots: admissionSnapshots,
      native_configure_failures: nativeConfigureFailures, invalid_native_configure_failures: invalidNativeConfigureFailures,
      child_exit_code: completion.exit_code, child_exit_confirmed: completion.exit_confirmed,
      child_close_confirmed: completion.close_confirmed, test_exit_code: process.exitCode || 0
    }, null, 2), { flag: 'wx', mode: 0o600 });
    // Retain these strictly synthetic fault fixtures for inspection; never
    // recursively delete a directory that has been deliberately tampered with.
    console.log(`Synthetic native-export evidence: ${root}`);
  }
})();
