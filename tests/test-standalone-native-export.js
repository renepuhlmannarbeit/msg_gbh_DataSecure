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
const child = spawn('cargo', ['test', '--locked', 'native_export_broker::tests::pipe_helper', '--', '--ignored', '--exact', '--nocapture', '--test-threads=1'],
  { cwd: path.resolve(__dirname, '../apps/datasecure-standalone/tauri-contract'), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let stderr = '', outer, binding, seq = 0, nativeSession, loseNextPublish = false, poisonedBody = false;
child.stderr.on('data', bytes => { stderr = `${stderr}${bytes}`.slice(-8192); });
const channel = new NativeExportChannel({ write: frame => {
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
  const store = createDocumentReviewStore({ dataRoot: data, outputRoot: () => packages,
    readMarkdownArtifact(id) {
      const manifest = JSON.parse(fs.readFileSync(path.join(packages, id, 'manifest.json')));
      const markdown = fs.readFileSync(path.join(packages, id, `${id}.md`), 'utf8');
      require('../plugins/data-secure/server/standalone/markdown-artifact').validateMarkdownArtifact(manifest, markdown); return { manifest, markdown };
    },
    controlOwnerPid: process.pid, ...(native ? { nativeBinding: () => binding, nativeExport: async (operation, command, body) => {
      const status = await nativeSession.send('export_documents', { operation, command, ...(body ? { body } : {}) });
      if (loseNextPublish && command === 'publish') { loseNextPublish = false; throw Object.assign(Error('lost receipt'), { code: 'STANDALONE_IPC_TIMEOUT' }); }
      return status;
    } } : { resultRoot: () => nodeRoot }) });
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
  return { store, batchId, documentId, text, selection, decide };
}
async function exportCall(f, operationId, acknowledge = false) {
  // Mirror serde_json's lexicographic map order, not JS fixture insertion order.
  const selection = f.selection.map(({ document_id, revision, output_sha256 }) => ({ document_id, output_sha256, revision }));
  context('export_approved_documents', { batch_id: f.batchId, operation_id: operationId, selection, acknowledge });
  return f.store.exportApproved(f.batchId, operationId, selection, acknowledge);
}
async function run() {
  context('configure_results', { source_paths: [results], native_export_binding: true });
  binding = await channel.configureExportRoot(outer);
  assert.equal(binding.root, results); assert.match(binding.private_name, /^native-export-[a-f0-9]{32}$/u);
  console.log('ok native picker bootstrap creates and returns held parent bindings');
  let i = 0;
  for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
    const f = fixture(mode, ++i), op = crypto.randomBytes(16).toString('hex');
    loseNextPublish = true;
    await assert.rejects(exportCall(f, op), { code: 'STANDALONE_IPC_TIMEOUT' });
    const target = path.join(results, mode === 'markdown-only' ? 'DataSecure-Markdown-Korrektur' : 'DataSecure-KI-Export', `Export-${op}`);
    assert.deepEqual(fs.readdirSync(target), ['Dokument_01.md']);
    assert.equal(fs.readFileSync(path.join(target, 'Dokument_01.md'), 'utf8'), f.text);
    f.decide('revoke'); // lost completion must still reconcile this earlier exact copy
    assert.equal((await exportCall(f, op, true)).exported_count, 1);
    assert.equal(f.store.historySummary(f.batchId).current_exported_count, 0);
    assert.equal(f.store.historySummary(f.batchId).pending_confirmation_count, 0);
    context('resolve_document_export', { batch_id: f.batchId, operation_id: op });
    assert.equal((await f.store.resolveExport(f.batchId, op)).local_path, target);
    context('abandon_document_export', { batch_id: f.batchId, operation_id: op, digest: JSON.parse(fs.readFileSync(path.join(data, 'document-reviews', f.batchId, `export-${op}.json`))).request_sha256 });
    await assert.rejects(f.store.abandonExport(f.batchId, op, outer.digest), { code: 'AI_EXPORT_ALREADY_COMPLETE' });
    fs.writeFileSync(path.join(target, 'extra.txt'), 'not authorized');
    context('resolve_document_export', { batch_id: f.batchId, operation_id: op });
    await assert.rejects(f.store.resolveExport(f.batchId, op), { code: 'AI_EXPORT_CONFLICT' });
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
  assert.equal(fs.readFileSync(path.join(results, 'DataSecure-Markdown-Korrektur', `Export-${largeOp}`, 'Dokument_01.md'), 'utf8'), large.text);
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
