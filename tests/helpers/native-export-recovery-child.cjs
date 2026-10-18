'use strict';
// Test-only Node store + private NativeExportChannel process. The campaign
// parent owns the Rust ChildProcess too; no test ever discovers/kills a PID.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { NativeExportChannel } = require('../../plugins/data-secure/server/standalone/native-export-channel');
const { createDocumentReviewStore } = require('../../plugins/data-secure/server/gateway/standalone-document-review-store');
const artifact = require('../../plugins/data-secure/server/standalone/markdown-artifact');
const { createMarkdownExtraction } = require('../../plugins/data-secure/server/standalone/markdown-contract');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const [root, mode, cut, start] = process.argv.slice(2);
const data = path.join(root, 'private'), packages = path.join(root, 'packages');
let binding, outer, session, sequence = 0, descriptor;
const send = value => new Promise((resolve, reject) => process.send(value, error => error ? reject(error) : resolve()));
const channel = new NativeExportChannel({ write: frame => { process.send({ type: 'frame', frame, outer }); } });
const context = (action, fields = {}) => {
  outer = { schema: 'datasecure-standalone-private-ipc/1', request_id: (++sequence).toString(16).padStart(16, '0'), action, ...fields };
  session = channel.publication(outer);
};
const store = createDocumentReviewStore({ dataRoot: data, outputRoot: () => packages, controlOwnerPid: process.pid,
  nativeBinding: () => binding,
  nativeExport: (operation, command, body) => session.send('export_documents', { operation, command, ...(body ? { body } : {}) }),
  readMarkdownArtifact(packageId) {
    const manifest = JSON.parse(fs.readFileSync(path.join(packages, packageId, 'manifest.json')));
    const markdown = fs.readFileSync(path.join(packages, packageId, `${packageId}.md`), 'utf8');
    artifact.validateMarkdownArtifact(manifest, markdown); return { manifest, markdown };
  } });
async function exported(acknowledge) {
  context('export_approved_documents', { batch_id: descriptor.batchId, operation_id: descriptor.operationId,
    selection: descriptor.selection, acknowledge });
  return store.exportApproved(descriptor.batchId, descriptor.operationId, descriptor.selection, acknowledge);
}
function snapshot() {
  const listed = store.list(descriptor.batchId);
  return { summary: store.historySummary(descriptor.batchId), pending_exports: listed.pending_exports,
    documents: listed.documents.map(({ document_id, revision, output_sha256, approved }) => ({ document_id, revision, output_sha256, approved })) };
}
async function create() {
  context('configure_results', { source_paths: [path.join(root, 'public')], native_export_binding: true });
  binding = await channel.configureExportRoot(outer);
  const batchId = crypto.randomBytes(32).toString('hex'), operationId = crypto.randomBytes(16).toString('hex');
  const expected = [];
  const sources = [0, 1].map(index => `# Bericht ${index + 1}\nName: Anna Beispiel\nArbeitgeber: Muster GmbH\n\nKeine Zahlung erfolgt. Betrag: ${42 + index},50 EUR. 🙂\n`);
  const items = sources.map((raw, index) => ({ id: (index + 1).toString(16).padStart(32, '0'),
    name: `nested/Quelle-${index + 1}.pdf`, sha256: sha(raw), status: 'released' }));
  for (let index = 0; index < 2; index++) {
    const item = items[index], documentId = item.id, raw = sources[index];
    const actual = mode === 'markdown-and-anonymize' ? require('../../plugins/data-secure/server/pii-engine')
      .anonymize(raw, 'general', { captureTransformPlan: true }) : null;
    const text = actual?.text ?? raw;
    const packageId = `${actual ? 'ds' : 'dm'}_${documentId}`, directory = path.join(packages, packageId);
    fs.mkdirSync(directory);
    const policy = require('../../plugins/data-secure/server/privacy/policy');
    store.capture({ token: batchId, product_channel: 'standalone', standalone_document_review: true, processing_mode: mode, items }, item,
      { package_id: packageId, original_text: raw, markdown: text, ...(actual ? { transform_trace: actual.transform_trace,
        verification_context: { profile: 'general', dictionary: actual.dictionary, strong_person_anchor: actual.strongPersonAnchor === true,
          ruleset: policy.PRIVACY_RULESET_VERSION, credential_policy: policy.CREDENTIAL_CONTEXT_POLICY_VERSION,
          publication_frame: actual.publication_frame || { prefix: '', suffix: '' }, reviewed_ranges: actual.reviewed_ranges || [] } } : {}) });
    fs.writeFileSync(path.join(directory, `${packageId}.md`), text);
    const manifest = actual ? { schema: 'eu-privacy-package/3', package_id: packageId, document: `${packageId}.md`,
      verification: { text_residual_pii: 'passed' }, document_sha256: sha(text) } : artifact.createMarkdownArtifact(
      createMarkdownExtraction({ source_type: 'pdf', markdown: text, coverage: { status: 'complete', reason_codes: [] } }), packageId).manifest;
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    const row = store.list(batchId).documents.find(value => value.document_id === documentId);
    store.decide(batchId, documentId, { action: 'approve', operation_id: crypto.randomBytes(16).toString('hex'),
      revision: row.revision, output_sha256: row.output_sha256, ranges: [] });
    expected.push({ document_id: documentId, name: actual ? `Dokument_0${index + 1}.md` : `Quelle-${index + 1}.md`, text });
  }
  const selection = store.list(batchId).documents.map(({ document_id, revision, output_sha256 }) => ({ document_id, output_sha256, revision }));
  descriptor = { batchId, operationId, selection, binding, expected, mode };
  fs.writeFileSync(path.join(root, 'fixture.json'), JSON.stringify(descriptor));
  await send({ type: 'fixture', descriptor });
  await exported(false);
  if (cut === 'after_ack') await exported(true);
  throw Error('Requested crash checkpoint was not reached');
}
async function receive(message) {
  if (message.type === 'reply') { channel.accept(message.reply); return; }
  if (message.type === 'command') {
    let value;
    try {
      if (message.command === 'ack') value = await exported(true);
      else if (message.command === 'resume') value = await exported(false);
      else throw Error('Unknown test command');
      await send({ type: 'result', id: message.id, ok: true, value, snapshot: snapshot() });
    } catch (error) { await send({ type: 'result', id: message.id, ok: false, error_code: error.code || error.message, snapshot: snapshot() }); }
  }
  if (message.type === 'stop') { process.disconnect(); }
}
process.on('message', message => { receive(message).catch(error => { process.send({ type: 'worker_error', error: error.stack }); process.exitCode = 1; process.disconnect(); }); });
process.on('disconnect', () => channel.abort('STANDALONE_CLOSING'));
(async () => {
  if (start === 'create') await create();
  else {
    descriptor = JSON.parse(fs.readFileSync(path.join(root, 'fixture.json'))); binding = descriptor.binding;
    await send({ type: 'reopened', snapshot: snapshot() });
  }
})().catch(error => { process.send({ type: 'worker_error', error: error.stack }); process.exitCode = 1; process.disconnect(); });
