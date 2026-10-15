'use strict';

// Stored outside the immutable /4 two-file pool. This exact replay record is
// private persistence, not publication or processing authority.
const crypto = require('node:crypto');
const path = require('node:path');
const { types } = require('node:util');
const { RESOURCE_LIMITS } = require('../resource-limits');
const { validateAnonymizedArtifactForExpectation, verifyAnonymizedPublication, createAnonymizedArtifact } = require('../standalone/anonymized-artifact');
const { createSourceExtraction } = require('../core/source-extraction-contract');
const { canonicalizeRenderedText } = require('../privacy/base');
const { personFieldPolicyForContentOptions } = require('../core/person-field-policy');
const { sanitizeReceipt, sourceSizeClass } = require('./audit');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const SCHEMA = 'datasecure-prepared-publication/1';
const invalid = () => Object.assign(Error('DOCUMENT_REVIEW_CONFLICT'), { code: 'DOCUMENT_REVIEW_CONFLICT' });
function guardPreparedGraph(value, depth = 0, seen = new Set()) {
  if (['function', 'symbol', 'bigint'].includes(typeof value)) throw invalid();
  if (!value || typeof value !== 'object') return;
  if (types.isProxy(value) || depth > 16 || seen.has(value)) throw invalid();
  const array = Array.isArray(value), proto = Object.getPrototypeOf(value), keys = Reflect.ownKeys(value);
  if (array ? proto !== Array.prototype : ![Object.prototype, null].includes(proto)) throw invalid();
  if (keys.length > (array ? RESOURCE_LIMITS.MAX_TEXT_CHARS + 1 : 64) || keys.some(key => typeof key !== 'string')) throw invalid();
  seen.add(value);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(d, 'value') || (!d.enumerable && !(array && key === 'length')) ||
        array && key !== 'length' && !/^(?:0|[1-9][0-9]*)$/u.test(key)) throw invalid();
    guardPreparedGraph(d.value, depth + 1, seen);
  }
  if (array && (!Number.isSafeInteger(value.length) || keys.length !== value.length + 1)) throw invalid();
  seen.delete(value);
}
const exact = (value, keys) => value && !Array.isArray(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function sourceContext(snapshot) {
  return { schema: 'datasecure-prepared-source-context/1', source_extraction_schema: 'datasecure-source-extraction/2',
    original_text_sha256: hash(snapshot.original_text), privacy_input_sha256: hash(snapshot.transform_trace.canonical_input) };
}
function reconstructPrepared(snapshot, manifestJson, receipt, candidateInputs) {
  try {
    guardPreparedGraph(snapshot); guardPreparedGraph(receipt);
    if (typeof manifestJson !== 'string' || Buffer.byteLength(manifestJson) > 16384 ||
        snapshot.schema !== 'datasecure-document-review/2' || snapshot.processing_mode !== 'markdown-and-anonymize' ||
        snapshot.transform_trace?.complete !== true ||
        require('../privacy/transform-plan').replayTransformTrace(snapshot.transform_trace) !== snapshot.markdown) throw invalid();
    const policy = personFieldPolicyForContentOptions(snapshot.content_options);
    if (canonicalizeRenderedText(snapshot.original_text, policy) !== snapshot.transform_trace.canonical_input) throw invalid();
    const manifest = JSON.parse(manifestJson);
    validateAnonymizedArtifactForExpectation(manifest, snapshot.markdown, snapshot.publication_binding, Buffer.from(manifestJson, 'utf8'));
    // Use the existing document-review frame/Keep coordinate reconstruction,
    // never raw caller ranges or a new regex exemption.
    const fields = candidateInputs(snapshot);
    const extraction = createSourceExtraction({ source_type: snapshot.source_type, markdown: snapshot.transform_trace.canonical_input,
      coverage: manifest.source_extraction_coverage, content_options: snapshot.content_options }, RESOURCE_LIMITS.MAX_TEXT_CHARS);
    const proof = verifyAnonymizedPublication({ markdown: snapshot.markdown, profile: fields.profile,
      content_options: snapshot.content_options, source_extraction: extraction, dictionary: fields.dictionary,
      strong_person_anchor: fields.strongPersonAnchor, reviewed_person_candidates: fields.reviewedPersonCandidates });
    const input = Object.freeze({ package_id: snapshot.package_id, content_options: snapshot.content_options, source_type: snapshot.source_type,
      profile: manifest.profile, operation_id: manifest.operation_id, created_at: manifest.created_at, coverage: manifest.source_extraction_coverage,
      markdown: snapshot.markdown, verification_proof: proof });
    const artifact = createAnonymizedArtifact(input);
    if (JSON.stringify(artifact.manifest) !== manifestJson || JSON.stringify(artifact.expectation) !== JSON.stringify(snapshot.publication_binding)) throw invalid();
    const clean = sanitizeReceipt(receipt);
    if (JSON.stringify(clean) !== JSON.stringify(receipt) || clean.operation_id !== manifest.operation_id || clean.timestamp !== manifest.created_at ||
        clean.gateway_version !== manifest.gateway_version || clean.privacy_ruleset !== manifest.privacy_ruleset ||
        clean.credential_context_policy !== manifest.credential_context_policy || clean.profile !== manifest.profile ||
        clean.source_extension !== path.posix.extname(snapshot.name).toLowerCase() || clean.result !== 'released' || clean.residual_pii_verification !== 'passed' ||
        JSON.stringify(clean.document_result) !== JSON.stringify(manifest.document_result) ||
        [clean.visual_assets_total, clean.visual_assets_included, clean.visual_assets_review_required, clean.visual_redactions].some(value => value !== 0)) throw invalid();
    return { publication_input: input, artifact, audit_receipt: clean };
  } catch { throw invalid(); }
}
function makePreparedRecord(snapshot, prepared, context, candidateInputs) {
  guardPreparedGraph(prepared);
  if (!exact(prepared, ['manifest_json', 'audit_receipt', 'registry_commit'])) throw invalid();
  const replay = reconstructPrepared(snapshot, prepared.manifest_json, prepared.audit_receipt, candidateInputs);
  if (context.operation_id !== replay.artifact.manifest.operation_id || context.created_at !== replay.artifact.manifest.created_at ||
      context.profile !== 'auto' && context.profile !== replay.artifact.manifest.profile ||
      prepared.audit_receipt.source_size_class !== sourceSizeClass(context.source_bytes)) throw invalid();
  context.assertPreparedRegistryCommit(prepared.registry_commit, snapshot.publication_binding.manifest_sha256);
  return { schema: SCHEMA, batch_id: snapshot.batch_id, document_id: snapshot.document_id, source_sha256: snapshot.source_sha256,
    basis_sha256: hash(JSON.stringify(snapshot)), publication_binding: snapshot.publication_binding, source_context: sourceContext(snapshot),
    manifest_json: prepared.manifest_json, audit_receipt: replay.audit_receipt, registry_commit: prepared.registry_commit };
}
function replayPreparedRecord(snapshot, record, context, candidateInputs) {
  guardPreparedGraph(record);
  if (!exact(record, ['schema', 'batch_id', 'document_id', 'source_sha256', 'basis_sha256', 'publication_binding', 'source_context',
    'manifest_json', 'audit_receipt', 'registry_commit']) || record.schema !== SCHEMA) throw invalid();
  const canonical = makePreparedRecord(snapshot, { manifest_json: record.manifest_json, audit_receipt: record.audit_receipt,
    registry_commit: record.registry_commit }, context, candidateInputs);
  if (JSON.stringify(canonical) !== JSON.stringify(record)) throw invalid();
  return Object.freeze({ snapshot, ...reconstructPrepared(snapshot, record.manifest_json, record.audit_receipt, candidateInputs) });
}
module.exports = Object.freeze({ guardPreparedGraph, makePreparedRecord, replayPreparedRecord });
