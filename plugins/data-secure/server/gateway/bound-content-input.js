'use strict';

// One content entrance for capture and publication. Caller options, source
// buffers and package identities never replace the stored operation context.
const path = require('node:path');
const { types } = require('node:util');
const { SafeError } = require('../runtime');
const { RESOURCE_LIMITS } = require('../resource-limits');
const { contentAbortChecker } = require('./content-consumer-dependencies');
const invalid = () => Object.assign(new SafeError('Der interne Inhaltsanschluss ist ungültig.'), { code: 'CONTENT_OPTIONS_BINDING_INVALID' });
const CAPTURE = ['pseudonymRegistry', 'abortSignal', 'convertBuffer', 'timeoutMs', 'prepareOcrContacts', 'captureOcrInput', 'onOcrSourceCaptured'];
const PUBLICATION = ['pseudonymRegistry', 'abortSignal', 'convertBuffer', 'timeoutMs', 'prepareOcrContacts', 'reviewText',
  'persistStandaloneIdentitySnapshot', 'beforePublish', 'afterPublish', 'onClaimed', 'onExtracted', 'onDetected'];
function automaticallyRedactOcrContacts(input) {
  require('../core/ocr-contact-review').validateContacts(input.contacts, input.original_text, input.source_type);
  const unmappable = () => Object.assign(new SafeError('OCR-Kontaktbereiche konnten nicht eindeutig auf die lokale Textfassung abgebildet werden.'),
    { code: 'OCR_CONTACT_REVIEW_INVALID' });
  // Apply the entire validated corridor, including broken OCR spellings.
  // This is actual redaction, never a forged confirm_contact answer.
  const rawEdits = input.contacts.map(contact => {
    const kind = contact.kind === 'email' ? 'EMAIL' : contact.kind === 'phone' ? 'PHONE' : 'CONTACT';
    return { start: contact.start, end: contact.end,
      original: input.original_text.slice(contact.start, contact.end), replacement: `[${kind}_REDACTED]`, kind };
  });
  const { applyEdits } = require('../privacy/transform-plan');
  const { canonicalizeRenderedText } = require('../privacy/base');
  const { CONTENT_PERSON_FIELD_POLICY: policy } = require('../core/person-field-policy');
  const canonical = canonicalizeRenderedText(input.original_text, policy);
  // Real OCR puts contact values inside literal Markdown code spans. Masking
  // within those wrappers would turn generated placeholders into escaped
  // source literals and break the independently checked prepared replay.
  // Map the exact validated corridors through rendering before redaction.
  // Plain markers avoid Markdown punctuation and are never detector input.
  const reserved = /DataSecureOcrBoundary9[0-9]{5}End/gu;
  if (input.original_text.match(reserved) || canonical.match(reserved)) throw unmappable();
  const markers = rawEdits.map((_edit, index) => `DataSecureOcrBoundary${String(900000 + index)}End`);
  const protectedText = applyEdits(input.original_text, rawEdits.map((edit, index) => ({ ...edit, replacement: markers[index] })));
  const normalized = canonicalizeRenderedText(protectedText, policy), locations = [...normalized.matchAll(reserved)];
  if (locations.length !== markers.length || locations.some((match, index) => match[0] !== markers[index])) throw unmappable();
  let reconstructed = '', cursor = 0;
  const edits = rawEdits.map((edit, index) => {
    const location = locations[index];
    reconstructed += normalized.slice(cursor, location.index);
    const original = canonicalizeRenderedText(edit.original, policy), start = reconstructed.length;
    if (!original) throw unmappable();
    reconstructed += original; cursor = location.index + location[0].length;
    return Object.freeze({ start, end: reconstructed.length, original, replacement: edit.replacement, kind: edit.kind });
  });
  reconstructed += normalized.slice(cursor);
  // Whole-source equality proves the mapping, including repeated contacts.
  // Context-dependent markup that cannot be reconstructed is never guessed.
  if (reconstructed !== canonical) throw unmappable();
  const text = applyEdits(canonical, edits);
  if (text.length > RESOURCE_LIMITS.MAX_TEXT_CHARS) throw invalid();
  return Object.freeze({ text, source_redaction: Object.freeze({ schema: 'datasecure-automatic-ocr-redaction/1',
    original_text: input.original_text, edits: Object.freeze(edits) }) });
}
function checkedContentHooks(value, kind) {
  if (!['capture', 'publication'].includes(kind) || !value || typeof value !== 'object' || types.isProxy(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalid();
  const allowed = kind === 'capture' ? CAPTURE : PUBLICATION, descriptors = Object.getOwnPropertyDescriptors(value), hooks = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    const d = descriptors[key];
    if (typeof key !== 'string' || !allowed.includes(key) || !d.enumerable || !Object.hasOwn(d, 'value')) throw invalid();
    hooks[key] = d.value;
  }
  for (const key of allowed.filter(key => !['pseudonymRegistry', 'abortSignal', 'timeoutMs', 'captureOcrInput'].includes(key)))
    if (hooks[key] !== undefined && (typeof hooks[key] !== 'function' || types.isProxy(hooks[key]))) throw invalid();
  if (!hooks.pseudonymRegistry || types.isProxy(hooks.pseudonymRegistry) ||
      hooks.captureOcrInput !== undefined && typeof hooks.captureOcrInput !== 'boolean' ||
      hooks.timeoutMs !== undefined && (!Number.isSafeInteger(hooks.timeoutMs) || hooks.timeoutMs < 1 || hooks.timeoutMs > 300000)) throw invalid();
  const aborted = contentAbortChecker(hooks.abortSignal); aborted();
  return Object.freeze({ ...hooks, checkAbort() {
    if (aborted()) throw Object.assign(new SafeError('Die lokale Verarbeitung wurde auf Anforderung sicher abgebrochen.'), { code: 'REQUEST_CANCELLED' });
  } });
}
async function extractBoundContentInput(context, hooks) {
  require('./content-operation-authority').assertContentOperationContext(context);
  const check = () => { context.revalidate(); hooks.checkAbort(); };
  check();
  const source = context.takeSourceBytes();
  if (hooks.onClaimed) { await hooks.onClaimed(); check(); }
  const { extractSourceForPrivacy, validatePrivacyExtractionForOptions } = require('../core/markdown-first-privacy');
  const converted = validatePrivacyExtractionForOptions(await extractSourceForPrivacy(source, path.extname(context.source_name).toLowerCase(), {
    contentOptions: context.content_options, productChannel: 'standalone', signal: hooks.abortSignal,
    convertBuffer: hooks.convertBuffer, ...(hooks.timeoutMs === undefined ? {} : { timeoutMs: hooks.timeoutMs }), ErrorType: SafeError
  }), context.content_options, context.source_type);
  check();
  if (hooks.onExtracted) { await hooks.onExtracted(converted); check(); }
  let extraction = converted.sourceExtraction, sourceRedaction;
  if (converted.ocrContacts?.length) {
    const input = Object.freeze({ original_text: extraction.markdown, contacts: converted.ocrContacts, source_type: context.source_type });
    let corrected;
    if (context.review_policy === 'automatic-conservative') {
      const masked = automaticallyRedactOcrContacts(input);
      corrected = masked.text; sourceRedaction = masked.source_redaction;
    } else {
      if (hooks.onOcrSourceCaptured) { await hooks.onOcrSourceCaptured(input); check(); }
      corrected = hooks.prepareOcrContacts ? await hooks.prepareOcrContacts(input) : null;
    }
    check();
    if (corrected === null && hooks.captureOcrInput === true) return Object.freeze({ kind: 'ocr-contact', ocr_contact_input: input });
    if (corrected === null) throw Object.assign(new SafeError('OCR-Kontaktwerte benötigen eine lokale Bestätigung vor der Anonymisierung.'), { code: 'LOCAL_REVIEW_DEFERRED' });
    const reasons = extraction.coverage.reason_codes.filter(code => code !== 'OCR_CONTACT_VALUES_UNVERIFIED');
    extraction = require('../core/source-extraction-contract').createSourceExtraction({ source_type: context.source_type,
      markdown: corrected, content_options: context.content_options,
      coverage: { status: reasons.length ? 'incomplete' : 'complete', reason_codes: reasons } }, RESOURCE_LIMITS.MAX_TEXT_CHARS);
  }
  return Object.freeze({ kind: 'source', extraction,
    ...(sourceRedaction ? { source_redaction: sourceRedaction } : {}),
    ...(converted.privateDocumentMetadata ? { private_document_metadata: converted.privateDocumentMetadata } : {}) });
}
// An internal producer builds this small graph from already checked services.
// The operation decoder still enforces the closed graph at the other end.
function publicationHooksFromServices(value) {
  if (!value || types.isProxy(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value), hooks = {};
  for (const key of PUBLICATION) {
    const d = descriptors[key]; if (!d) continue;
    if (!d.enumerable || !Object.hasOwn(d, 'value')) throw invalid();
    if (d.value !== undefined) hooks[key] = d.value;
  }
  return hooks;
}
module.exports = Object.freeze({ checkedContentHooks, extractBoundContentInput, publicationHooksFromServices, automaticallyRedactOcrContacts });
