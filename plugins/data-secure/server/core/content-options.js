'use strict';

const CONTENT_OPTIONS_SCHEMA = 'datasecure-content-options/1';
const CONTENT_BATCH_SCHEMA = 'datasecure-batch/7';
const FIELDS = Object.freeze(['schema', 'markdownOutput', 'scanOcr', 'imageOcr']);
const fail = code => { throw Object.assign(new Error(code), { code }); };

// No defaults or coercions at a trust boundary. In particular null/undefined
// supplied explicitly cannot be interpreted as an absent legacy contract.
function validateContentOptions(value) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('CONTENT_OPTIONS_INVALID');
    const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
    if (keys.length !== FIELDS.length || keys.some(key => typeof key !== 'string' || !FIELDS.includes(key) ||
        !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) fail('CONTENT_OPTIONS_INVALID');
    const { schema, markdownOutput, scanOcr, imageOcr } = Object.fromEntries(FIELDS.map(key => [key, descriptors[key].value]));
    if (schema !== CONTENT_OPTIONS_SCHEMA || !['content-v1', 'notes-v1'].includes(markdownOutput) ||
        typeof scanOcr !== 'boolean' || typeof imageOcr !== 'boolean') {
      fail('CONTENT_OPTIONS_INVALID');
    }
    // Canonical, own, immutable copy in fixed order; never keep caller-owned
    // references or feed object getters into a durable binding/digest.
    return Object.freeze({ schema: CONTENT_OPTIONS_SCHEMA, markdownOutput, scanOcr, imageOcr });
  } catch { fail('CONTENT_OPTIONS_INVALID'); }
}

function optionalContentOptions(owner, field, productChannel) {
  let descriptor;
  try {
    if (!owner || typeof owner !== 'object' || Array.isArray(owner) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(owner))) fail('CONTENT_OPTIONS_INVALID');
    descriptor = Object.getOwnPropertyDescriptor(owner, field);
  }
  catch { fail('CONTENT_OPTIONS_INVALID'); }
  if (!descriptor) return undefined;
  if (productChannel !== 'standalone') fail('CONTENT_OPTIONS_FORBIDDEN');
  if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail('CONTENT_OPTIONS_INVALID');
  return validateContentOptions(descriptor.value);
}

function serializeContentOptions(value) { return JSON.stringify(validateContentOptions(value)); }

// Transitional operation boundary, not an enabled feature. Persisting the new
// contract must never confirm its use while any extractor still ignores it.
// Remove the readiness denial only with the complete consumer/transport slice.
function assertLegacyContentOperation(owner, field, productChannel, operation) {
  if (!['contentOptions', 'content_options'].includes(field) || !['start', 'resume'].includes(operation))
    fail('CONTENT_OPTIONS_INVALID');
  const alias = field === 'contentOptions' ? 'content_options' : 'contentOptions';
  // Missing fields retain the historical caller's own validation (including
  // trusted VM/test contexts). Strict plain-object checks apply when a new
  // contract is actually present; inherited options are not an absent field.
  if (!owner || !['object', 'function'].includes(typeof owner)) return;
  try {
    if (Object.hasOwn(owner, alias)) fail('CONTENT_OPTIONS_INVALID');
    if (!Object.hasOwn(owner, field)) {
      if (field in owner || alias in owner) fail('CONTENT_OPTIONS_INVALID');
      return;
    }
  } catch { fail('CONTENT_OPTIONS_INVALID'); }
  const value = optionalContentOptions(owner, field, productChannel);
  if (value !== undefined) fail(operation === 'start' ? 'CONTENT_OPTIONS_NOT_READY' : 'CONTENT_OPTIONS_FORBIDDEN');
}

// The new Standalone intake is purpose-specific. Legacy start, plugin and
// resume messages still cannot accept caller options; resume reconstructs
// the contract exclusively from the independently bound run.
function assertStandaloneContentStart(owner, field, productChannel) {
  if (!['contentOptions', 'content_options'].includes(field)) fail('CONTENT_OPTIONS_INVALID');
  const alias = field === 'contentOptions' ? 'content_options' : 'contentOptions';
  try {
    if (!owner || typeof owner !== 'object' || Array.isArray(owner)) fail('CONTENT_OPTIONS_INVALID');
    if (alias in owner || field in owner && !Object.hasOwn(owner, field)) fail('CONTENT_OPTIONS_INVALID');
    if (!Object.hasOwn(owner, field)) return undefined;
  } catch { fail('CONTENT_OPTIONS_INVALID'); }
  const value = optionalContentOptions(owner, field, productChannel);
  const modeField = field === 'contentOptions' ? 'processingMode' : 'processing_mode';
  const reviewField = field === 'contentOptions' ? 'documentReview' : 'document_review';
  const ownValue = name => {
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(owner, name); }
    catch { fail('CONTENT_OPTIONS_INVALID'); }
    if (descriptor && (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable)) fail('CONTENT_OPTIONS_INVALID');
    return descriptor?.value;
  };
  if (!['markdown-only', 'markdown-and-anonymize'].includes(ownValue(modeField))) fail('CONTENT_OPTIONS_NOT_READY');
  if (ownValue(reviewField) !== true) fail('DOCUMENT_REVIEW_INVALID');
  return value;
}

// Retained for existing direct callers of the previously Raw-only decoder.
const assertMarkdownContentStart = assertStandaloneContentStart;

function contentOptionsForBatch(state) {
  // Stored options are never defaulted on resume. Old schema identities may
  // not smuggle the new contract into readers with historical semantics.
  if (!state || typeof state !== 'object' || Array.isArray(state)) fail('CONTENT_OPTIONS_INVALID');
  if (Object.hasOwn(state, 'contentOptions')) fail('CONTENT_OPTIONS_INVALID');
  if (state.schema !== CONTENT_BATCH_SCHEMA) {
    if (Object.hasOwn(state, 'content_options')) fail('CONTENT_OPTIONS_INVALID');
    return undefined;
  }
  const value = optionalContentOptions(state, 'content_options', state.product_channel);
  if (value === undefined) fail('CONTENT_OPTIONS_INVALID');
  return value;
}

// Internal converter consumers may receive a full contract, but never a
// spelling alias, inherited field or an explicit undefined legacy substitute.
function contentOptionsForConsumer(owner, productChannel) {
  try {
    if (!owner || !['object', 'function'].includes(typeof owner)) fail('CONTENT_OPTIONS_INVALID');
    if ('content_options' in owner) fail('CONTENT_OPTIONS_INVALID');
    if (!('contentOptions' in owner)) return undefined;
    if (!Object.hasOwn(owner, 'contentOptions')) fail('CONTENT_OPTIONS_INVALID');
  } catch { fail('CONTENT_OPTIONS_INVALID'); }
  return optionalContentOptions(owner, 'contentOptions', productChannel);
}

module.exports = Object.freeze({ CONTENT_OPTIONS_SCHEMA, CONTENT_BATCH_SCHEMA, validateContentOptions,
  optionalContentOptions, serializeContentOptions, contentOptionsForBatch, contentOptionsForConsumer,
  assertLegacyContentOperation, assertStandaloneContentStart, assertMarkdownContentStart });
