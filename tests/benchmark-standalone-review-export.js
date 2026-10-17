'use strict';

// Opt-in synthetic backend benchmark, not an OS/WebView or extraction-quality
// acceptance test. Both routes use real stored /4 artifacts and review journals;
// --native measures Node preparation/streaming through a checked test transport,
// not Rust filesystem throughput. No user paths or documents are inspected.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const count = Number(process.argv.find(arg => arg.startsWith('--count='))?.slice(8) || 115);
const native = process.argv.includes('--native');
assert.ok([115, 200].includes(count), 'use --count=115 or --count=200');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-export-benchmark-'));
process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'data');
process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
const { safeRemovePrivateTree } = require('../plugins/data-secure/server/gateway/common');
const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const artifactStore = require('../plugins/data-secure/server/standalone/anonymized-store');
const artifact = require('../plugins/data-secure/server/standalone/anonymized-artifact');
const { createSourceExtraction } = require('../plugins/data-secure/server/core/source-extraction-contract');
const policy = require('../plugins/data-secure/server/privacy/policy');
const { CONTENT_PERSON_FIELD_POLICY } = require('../plugins/data-secure/server/core/person-field-policy');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };
const original = 'Name: Amina Lindenfels\nE-Mail: amina.lindenfels@example.invalid\n' +
  'Technischer Fachtext über Tabellen und Verarbeitung.\n'.repeat(24);
const transformed = require('../plugins/data-secure/server/pii-engine').anonymize(original, 'general', {
  productChannel: 'standalone', contentOptions, captureTransformPlan: true });
const coverage = { status: 'complete', reason_codes: [] };
const extraction = createSourceExtraction({ source_type: 'pdf', content_options: contentOptions, coverage, markdown: original }, 8_000_000);
const items = Array.from({ length: count }, (_, index) => ({ id: (index + 1).toString(16).padStart(32, '0'),
  name: `synthetic/Quelle-${index + 1}.pdf`, sha256: sha(original), status: 'released' }));
const state = { schema: 'datasecure-batch/7', token: 'a'.repeat(64), product_channel: 'standalone',
  processing_mode: 'markdown-and-anonymize', standalone_document_review: true, content_options: contentOptions, items };
const results = path.join(root, 'results'); fs.mkdirSync(results);
const identity = { volume: '1', object: '1', created_ns: '1' };
const binding = { schema: 'datasecure-native-export-binding/1', root: results, private_name: `native-export-${'b'.repeat(32)}`,
  root_identity: identity, data_root_identity: identity, private_identity: identity, anonymize_identity: identity, markdown_identity: identity };
const bodies = new Map(); let published = false;
const review = createDocumentReviewStore({ dataRoot: process.env.EU_PRIVACY_DATA_ROOT, resultRoot: () => results,
  ...(native ? { nativeBinding: () => binding, nativeExport: async (op, command, body) => {
    if (command === 'reconcile') return published ? 'completed' : 'unprepared';
    if (command === 'write_body') {
      const previous = bodies.get(body.index) || Buffer.alloc(0), bytes = Buffer.from(body.hex, 'hex');
      assert.equal(previous.length, body.offset); const combined = Buffer.concat([previous, bytes]); bodies.set(body.index, combined);
      if (body.final_chunk) { assert.equal(combined.length, op.files[body.index].bytes);
        assert.equal(sha(combined), Buffer.from(op.files[body.index].sha256).toString('hex'));
        assert.ok(combined.equals(Buffer.from(transformed.text)), 'transport bytes equal the independent fixture text'); }
      return body.final_chunk ? 'staged' : 'receiving';
    }
    if (command === 'publish') { assert.equal(bodies.size, count); published = true; return 'completed'; }
    if (command === 'acknowledge') return 'acknowledged';
    throw Error('UNEXPECTED_NATIVE_COMMAND');
  } } : {}) });
async function measure(phase, action) {
  const counters = { opens: 0, stats: 0, lists: 0, base_reads: 0, artifact_reads: 0, reads: 0, read_bytes: 0, residual_checks: 0 };
  const engine = require('../plugins/data-secure/server/pii-engine'), residual = engine.scanResidual;
  engine.scanResidual = function(...args) { counters.residual_checks++; return residual.apply(this, args); };
  const saved = Object.fromEntries(['openSync', 'lstatSync', 'fstatSync', 'readdirSync', 'readSync'].map(key => [key, fs[key]]));
  fs.openSync = function(file, ...args) { counters.opens++; if (typeof file === 'string') {
    if (file.endsWith(`${path.sep}base.json`)) counters.base_reads++;
    if (file.includes(`${path.sep}standalone-anonymized-artifacts${path.sep}`)) counters.artifact_reads++;
  } return saved.openSync.call(this, file, ...args); };
  fs.lstatSync = function(...args) { counters.stats++; return saved.lstatSync.apply(this, args); };
  fs.fstatSync = function(...args) { counters.stats++; return saved.fstatSync.apply(this, args); };
  fs.readdirSync = function(...args) { counters.lists++; return saved.readdirSync.apply(this, args); };
  fs.readSync = function(...args) { const bytes = saved.readSync.apply(this, args); counters.reads++; counters.read_bytes += bytes; return bytes; };
  const started = performance.now();
  try { const result = await action(); console.log(JSON.stringify({ count, route: native ? 'native-test-transport' : 'node-filesystem',
    phase, milliseconds: Math.round(performance.now() - started), ...counters })); return result; }
  finally { Object.assign(fs, saved); engine.scanResidual = residual; }
}
async function main() {
  console.log(JSON.stringify({ environment: { node: process.version, platform: process.platform, architecture: process.arch,
    release: os.release() }, workload: { count, source_bytes_each: Buffer.byteLength(original),
    candidate_bytes_each: Buffer.byteLength(transformed.text), artifact_schema: 'eu-privacy-package/4',
    approval: 'single bound 200-or-fewer selection journal', native_transport_is_test_double: native } }));
  for (const item of items) {
    const packageId = `ds_${item.id}`;
    const proof = artifact.verifyAnonymizedPublication({ markdown: transformed.text, profile: 'general', content_options: contentOptions,
      source_extraction: extraction, dictionary: transformed.dictionary, strong_person_anchor: transformed.strongPersonAnchor === true,
      reviewed_person_candidates: null });
    await artifactStore.publishAnonymizedArtifact({ package_id: packageId, content_options: contentOptions, source_type: 'pdf', profile: 'general',
      operation_id: crypto.randomUUID(), created_at: new Date().toISOString(), coverage, markdown: transformed.text, verification_proof: proof }, {
      beforePublish(details) { review.capture(state, item, { package_id: packageId, original_text: original, markdown: transformed.text,
        content_options: contentOptions, source_type: 'pdf', publication_binding: details.publication_binding, transform_trace: transformed.transform_trace,
        verification_context: { profile: 'general', dictionary: transformed.dictionary, strong_person_anchor: transformed.strongPersonAnchor === true,
          ruleset: policy.PRIVACY_RULESET_VERSION, credential_policy: policy.CREDENTIAL_CONTEXT_POLICY_VERSION,
          person_field_policy: CONTENT_PERSON_FIELD_POLICY, publication_frame: { prefix: '', suffix: '' }, reviewed_ranges: [] } }); },
      afterPublish() { review.recordPublication(state.token, item.id); }
    });
  }
  const initial = review.list(state.token).documents.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 }));
  const approved = review.decideBatch(state.token, { action: 'approve', operation_id: 'c'.repeat(32), selection: initial });
  const selection = approved.documents.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 }));
  const id = 'd'.repeat(32);
  const preview = await measure('preview', () => review.previewExport(state.token, id, selection));
  assert.equal(preview.files.length, count);
  const copied = await measure('copy', () => review.exportApproved(state.token, id, selection));
  assert.equal(copied.exported_count, count);
  if (!native) {
    const destination = path.join(results, 'DataSecure-KI-Export', copied.folder_name);
    assert.deepEqual(fs.readdirSync(destination).sort(), preview.files.map(file => file.name).sort());
    for (const file of preview.files) assert.ok(fs.readFileSync(path.join(destination, file.name)).equals(Buffer.from(transformed.text)),
      'stored copy bytes equal the independent fixture text');
  }
  assert.equal((await measure('receipt-ack', () => review.exportApproved(state.token, id, selection, true))).exported_count, count);
}
main().finally(() => safeRemovePrivateTree(path.dirname(root), path.basename(root))).catch(error => { console.error(error); process.exitCode = 1; });
