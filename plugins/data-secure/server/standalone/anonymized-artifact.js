'use strict';

// Native construction/verification boundary, not a privacy detector or a
// capability grant. Expected bytes/options come from an independent private
// document basis; a package may never supply its own expected contract.
const crypto = require('node:crypto');
const { types } = require('node:util');
const { validateContentOptions, serializeContentOptions } = require('../core/content-options');
const { validateCoverage, SOURCE_TYPES, validateSourceExtractionForOptions } = require('../core/source-extraction-contract');
const { validateMarkdownText, MAX_MARKDOWN_CHARS } = require('./markdown-contract');
const { CONTENT_PERSON_FIELD_POLICY } = require('../core/person-field-policy');
const { PRIVACY_RULESET_VERSION, CREDENTIAL_CONTEXT_POLICY_VERSION } = require('../privacy/policy');
const { VERSION } = require('../version');

const SCHEMA = 'eu-privacy-package/4';
const EXPECTATION_SCHEMA = 'datasecure-anonymized-artifact-expectation/1';
const PACKAGE_ID_RE = /^ds_[a-f0-9]{32}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const PROFILES = new Set(['general', 'contract', 'customer', 'applicant', 'personnel_profile']);
const EXPECTED_KEYS = ['schema', 'package_id', 'content_options', 'source_type', 'profile', 'document_sha256', 'manifest_sha256'];
const INPUT_KEYS = ['package_id', 'content_options', 'source_type', 'profile', 'operation_id', 'created_at', 'coverage', 'markdown', 'verification_proof'];
const MANIFEST_KEYS = ['schema', 'package_id', 'product_channel', 'processing_mode', 'anonymized', 'content_options',
  'source_type', 'privacy_scope', 'source_extraction_coverage', 'profile', 'operation_id', 'created_at',
  'gateway_version', 'privacy_ruleset', 'credential_context_policy', 'person_field_policy',
  'document', 'document_sha256', 'document_bytes', 'verification', 'document_result'];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const invalid = () => Object.assign(new Error('STANDALONE_PUBLICATION_INVALID'), { code: 'STANDALONE_PUBLICATION_INVALID' });
const verifiedProofs = new WeakMap();

function guardGraph(value, depth = 0, seen = new Set()) {
  if (['function', 'symbol', 'bigint'].includes(typeof value)) throw invalid();
  if (!value || typeof value !== 'object') return;
  if (types.isProxy(value) || depth > 6 || seen.has(value)) throw invalid();
  const proto = Object.getPrototypeOf(value), array = Array.isArray(value);
  if (array ? proto !== Array.prototype : ![Object.prototype, null].includes(proto)) throw invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length > 64 || keys.some(key => typeof key !== 'string')) throw invalid();
  seen.add(value);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(descriptor, 'value') || (!descriptor.enumerable && !(array && key === 'length')))
      throw invalid();
    if (array && key !== 'length' && !/^(?:0|[1-9][0-9]*)$/u.test(key)) throw invalid();
    guardGraph(descriptor.value, depth + 1, seen);
  }
  if (array && (keys.length !== value.length + 1 || !Number.isSafeInteger(value.length))) throw invalid();
  seen.delete(value);
}
function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function checked(operation) {
  try { return operation(); } catch { throw invalid(); }
}
function coverageCopy(value) {
  validateCoverage(value);
  return Object.freeze({ status: value.status, reason_codes: Object.freeze([...value.reason_codes]) });
}
function verifyAnonymizedPublication(input) {
  return checked(() => {
    // Dictionary capacity follows the shared text budget, not a hidden number
    // of contacts. Read only own data descriptors before invoking the engine.
    if (!input || types.isProxy(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw invalid();
    const keys = ['markdown', 'profile', 'content_options', 'source_extraction', 'dictionary', 'strong_person_anchor', 'reviewed_person_candidates'];
    if (!exact(input, keys)) throw invalid();
    const values = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw invalid();
      values[key] = descriptor.value;
    }
    guardGraph(values.content_options); guardGraph(values.source_extraction); guardGraph(values.reviewed_person_candidates);
    const options = validateContentOptions(values.content_options);
    validateSourceExtractionForOptions(values.source_extraction, MAX_MARKDOWN_CHARS, options);
    validateMarkdownText(values.markdown);
    if (!PROFILES.has(values.profile) || typeof values.strong_person_anchor !== 'boolean' ||
        !Array.isArray(values.dictionary) || types.isProxy(values.dictionary) || Object.getPrototypeOf(values.dictionary) !== Array.prototype)
      throw invalid();
    const length = Object.getOwnPropertyDescriptor(values.dictionary, 'length').value;
    if (!Number.isSafeInteger(length) || length > MAX_MARKDOWN_CHARS || Reflect.ownKeys(values.dictionary).length !== length + 1) throw invalid();
    const dictionary = []; let total = 0;
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(values.dictionary, String(index));
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw invalid();
      const row = descriptor.value; guardGraph(row);
      if (!exact(row, ['value', 'type']) || typeof row.value !== 'string' ||
          !['PERSON', 'PERSON_ALIAS', 'ORGANIZATION', 'PROJECT', 'LOCATION'].includes(row.type)) throw invalid();
      total += row.value.length;
      if (total > MAX_MARKDOWN_CHARS * 3) throw invalid();
      dictionary.push({ value: row.value, type: row.type });
    }
    const residual = require('../pii-engine').scanResidual(values.markdown, values.profile, dictionary, {
      productChannel: 'standalone', contentOptions: options, strongPersonAnchor: values.strong_person_anchor,
      originalSourceText: values.source_extraction.markdown, reviewedPersonCandidates: values.reviewed_person_candidates });
    if (residual.length) throw invalid();
    const proof = Object.freeze({});
    verifiedProofs.set(proof, { document_sha256: digest(Buffer.from(values.markdown, 'utf8')), profile: values.profile,
      content_options: options, source_type: values.source_extraction.source_type,
      coverage: JSON.stringify(coverageCopy(values.source_extraction.coverage)) });
    return proof;
  });
}
function identity(value) {
  if (typeof value.package_id !== 'string' || !PACKAGE_ID_RE.test(value.package_id) || !SOURCE_TYPES.includes(value.source_type) ||
      !PROFILES.has(value.profile)) throw invalid();
}
function validateExpectation(value) {
  return checked(() => {
    guardGraph(value);
    if (!exact(value, EXPECTED_KEYS) || value.schema !== EXPECTATION_SCHEMA ||
        typeof value.document_sha256 !== 'string' || typeof value.manifest_sha256 !== 'string' ||
        !SHA.test(value.document_sha256) || !SHA.test(value.manifest_sha256)) throw invalid();
    identity(value);
    return Object.freeze({ schema: EXPECTATION_SCHEMA, package_id: value.package_id,
      content_options: validateContentOptions(value.content_options), source_type: value.source_type,
      profile: value.profile, document_sha256: value.document_sha256, manifest_sha256: value.manifest_sha256 });
  });
}
function validateAnonymizedArtifact(manifest, markdown) {
  return checked(() => {
    guardGraph(manifest);
    if (!exact(manifest, MANIFEST_KEYS) || manifest.schema !== SCHEMA || manifest.product_channel !== 'standalone' ||
        manifest.processing_mode !== 'markdown-and-anonymize' || manifest.anonymized !== true ||
        manifest.privacy_scope !== 'extracted-markdown-only' || manifest.gateway_version !== VERSION ||
        manifest.privacy_ruleset !== PRIVACY_RULESET_VERSION || manifest.credential_context_policy !== CREDENTIAL_CONTEXT_POLICY_VERSION ||
        manifest.person_field_policy !== CONTENT_PERSON_FIELD_POLICY || manifest.document !== `${manifest.package_id}.md` ||
        typeof manifest.document_sha256 !== 'string' || !SHA.test(manifest.document_sha256) || !Number.isSafeInteger(manifest.document_bytes) || manifest.document_bytes < 1 ||
        manifest.document_bytes > MAX_MARKDOWN_CHARS * 4 || typeof manifest.operation_id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(manifest.operation_id) ||
        typeof manifest.created_at !== 'string' || new Date(manifest.created_at).toISOString() !== manifest.created_at) throw invalid();
    identity(manifest);
    validateContentOptions(manifest.content_options);
    validateCoverage(manifest.source_extraction_coverage);
    // This Markdown-only publication contains no asset or parser-warning
    // claims. Source omissions remain in their separate extraction coverage.
    if (!exact(manifest.verification, ['text_residual_pii', 'residual_gate_checked_dictionary_literals']) ||
        manifest.verification.text_residual_pii !== 'passed' || manifest.verification.residual_gate_checked_dictionary_literals !== true ||
        !exact(manifest.document_result, ['schema', 'grade', 'omissions', 'reason_code']) ||
        manifest.document_result.schema !== 'datasecure-document-result/1' || manifest.document_result.grade !== 'complete' ||
        !Array.isArray(manifest.document_result.omissions) || manifest.document_result.omissions.length !== 0 ||
        manifest.document_result.reason_code !== null) throw invalid();
    validateMarkdownText(markdown);
    if (!markdown.trim()) throw invalid();
    const bytes = Buffer.from(markdown, 'utf8');
    if (bytes.length !== manifest.document_bytes || digest(bytes) !== manifest.document_sha256) throw invalid();
    return manifest;
  });
}
function validateAnonymizedArtifactForExpectation(manifest, markdown, expected, manifestBytes) {
  return checked(() => {
    const context = validateExpectation(expected);
    validateAnonymizedArtifact(manifest, markdown);
    if (types.isProxy(manifestBytes) || !Buffer.isBuffer(manifestBytes) || digest(manifestBytes) !== context.manifest_sha256 ||
        manifest.package_id !== context.package_id || manifest.profile !== context.profile || manifest.source_type !== context.source_type ||
        manifest.document_sha256 !== context.document_sha256 ||
        serializeContentOptions(manifest.content_options) !== serializeContentOptions(context.content_options)) throw invalid();
    return manifest;
  });
}
function createAnonymizedArtifact(input) {
  return checked(() => {
    guardGraph(input);
    if (!exact(input, INPUT_KEYS)) throw invalid();
    identity(input); validateMarkdownText(input.markdown); validateCoverage(input.coverage);
    const proof = verifiedProofs.get(input.verification_proof);
    if (!proof || proof.profile !== input.profile || proof.source_type !== input.source_type ||
        proof.document_sha256 !== digest(Buffer.from(input.markdown, 'utf8')) || proof.coverage !== JSON.stringify(coverageCopy(input.coverage)) ||
        serializeContentOptions(proof.content_options) !== serializeContentOptions(input.content_options)) throw invalid();
    const manifest = Object.freeze({ schema: SCHEMA, package_id: input.package_id, product_channel: 'standalone',
      processing_mode: 'markdown-and-anonymize', anonymized: true,
      content_options: validateContentOptions(input.content_options), source_type: input.source_type,
      privacy_scope: 'extracted-markdown-only', source_extraction_coverage: coverageCopy(input.coverage), profile: input.profile,
      operation_id: input.operation_id, created_at: input.created_at, gateway_version: VERSION,
      privacy_ruleset: PRIVACY_RULESET_VERSION, credential_context_policy: CREDENTIAL_CONTEXT_POLICY_VERSION,
      person_field_policy: CONTENT_PERSON_FIELD_POLICY, document: `${input.package_id}.md`,
      document_sha256: digest(Buffer.from(input.markdown, 'utf8')), document_bytes: Buffer.byteLength(input.markdown, 'utf8'),
      verification: Object.freeze({ text_residual_pii: 'passed', residual_gate_checked_dictionary_literals: true }),
      document_result: Object.freeze({ schema: 'datasecure-document-result/1', grade: 'complete', omissions: Object.freeze([]), reason_code: null }) });
    validateAnonymizedArtifact(manifest, input.markdown);
    const expectation = validateExpectation({ schema: EXPECTATION_SCHEMA, package_id: manifest.package_id,
      content_options: manifest.content_options, source_type: manifest.source_type, profile: manifest.profile,
      document_sha256: manifest.document_sha256, manifest_sha256: digest(Buffer.from(JSON.stringify(manifest), 'utf8')) });
    return Object.freeze({ manifest, markdown: input.markdown, expectation });
  });
}

module.exports = Object.freeze({ SCHEMA, EXPECTATION_SCHEMA, PACKAGE_ID_RE, createAnonymizedArtifact,
  verifyAnonymizedPublication, validateAnonymizedArtifact, validateExpectation, validateAnonymizedArtifactForExpectation });
