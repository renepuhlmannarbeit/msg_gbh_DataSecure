'use strict';

const { RESOURCE_LIMITS } = require('../resource-limits');
const { MODES } = require('../core/processing-mode');
const { validateContentOptions, serializeContentOptions } = require('../core/content-options');
const { validatePrivateDocumentMetadata } = require('../core/private-document-metadata');

const EXTRACTION_SCHEMA = 'datasecure-markdown-extraction/1';
const CONTENT_EXTRACTION_SCHEMA = 'datasecure-markdown-extraction/2';
const PROCESSING_MODE = MODES.MARKDOWN;
// Vocabulary is a format contract, not a declaration of packaged support.
const SOURCE_TYPES = Object.freeze(['txt', 'md', 'csv', 'docx', 'xlsx', 'pptx', 'pdf', 'png', 'jpeg', 'bmp']);
const COVERAGE_REASON_CODES = Object.freeze([
  'CONVERSION_RESOURCE_LIMIT_PARTIAL',
  'CONVERSION_TIMEOUT_PARTIAL',
  'DOCUMENT_PARTS_DAMAGED',
  'DOCX_HEADER_FOOTER_EXCLUDED_BY_POLICY',
  'EXTERNAL_CONTENT_NOT_READ',
  'IMAGE_CONTENT_DAMAGED',
  'IMAGE_OCR_DISABLED_BY_POLICY',
  'IMAGE_OCR_FAILED',
  'IMAGE_PROCESSING_LIMIT',
  'OCR_CONTACT_VALUES_UNVERIFIED',
  'OCR_NOT_VERIFIED',
  'OCR_TEXT_EMPTY',
  'OFFICE_IMAGE_FORMAT_EMF_UNSUPPORTED',
  'OFFICE_IMAGE_FORMAT_GIF_UNSUPPORTED',
  'OFFICE_IMAGE_FORMAT_OTHER_UNSUPPORTED',
  'OFFICE_IMAGE_FORMAT_SVG_UNSUPPORTED',
  'OFFICE_IMAGE_FORMAT_TIFF_UNSUPPORTED',
  'OFFICE_IMAGE_FORMAT_WEBP_UNSUPPORTED',
  'OFFICE_IMAGE_FORMAT_WMF_UNSUPPORTED',
  'OFFICE_TABLE_CONTEXT_UNVERIFIED',
  'OFFICE_TABLE_LAYOUT_NORMALIZED',
  'PDF_IMAGE_NOT_READ',
  'PDF_OCR_SCOPE_UNVERIFIED',
  'PDF_PAGE_NOT_READ',
  'SCAN_OCR_DISABLED_BY_POLICY',
  'SOURCE_COVERAGE_UNVERIFIED',
  'TEXT_LIMIT_PARTIAL',
  'VISUAL_CONTENT_NOT_EXTRACTED'
]);
const MAX_MARKDOWN_CHARS = RESOURCE_LIMITS.MAX_TEXT_CHARS;
const SOURCE_VALUES = new Set(SOURCE_TYPES);
const REASON_VALUES = new Set(COVERAGE_REASON_CODES);

class MarkdownContractError extends Error {
  constructor(code = 'MARKDOWN_EXTRACTION_INVALID') {
    super('Der lokale Markdown-Vertrag ist ungültig.');
    this.name = 'MarkdownContractError';
    this.code = code;
  }
}

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  return actual.length === keys.length && actual.every((key) => typeof key === 'string' &&
    keys.includes(key) && Object.hasOwn(descriptors[key], 'value') && descriptors[key].enumerable);
}

function validateMarkdownText(markdown) {
  if (typeof markdown !== 'string') throw new MarkdownContractError();
  if (markdown.length > MAX_MARKDOWN_CHARS) throw new MarkdownContractError('TEXT_TOO_LARGE');
  // Buffer.from replaces lone surrogates. Reject them instead of silently
  // altering the promised source-derived text when serialising UTF-8.
  for (let index = 0; index < markdown.length; index++) {
    const unit = markdown.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = markdown.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new MarkdownContractError();
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new MarkdownContractError();
    }
  }
  return markdown;
}

function validateCoverage(coverage) {
  if (!exactKeys(coverage, ['status', 'reason_codes']) ||
      !['complete', 'incomplete'].includes(coverage.status) || !Array.isArray(coverage.reason_codes) ||
      coverage.reason_codes.length > COVERAGE_REASON_CODES.length) throw new MarkdownContractError();
  const codes = coverage.reason_codes;
  for (let index = 0; index < codes.length; index++) {
    if (!REASON_VALUES.has(codes[index]) || (index > 0 && codes[index - 1] >= codes[index])) {
      throw new MarkdownContractError();
    }
  }
  if ((coverage.status === 'complete') !== (codes.length === 0)) throw new MarkdownContractError();
  return coverage;
}

function validateMarkdownExtraction(value) {
  const keys = ['schema', 'processing_mode', 'anonymized', 'source_type', 'markdown', 'coverage'];
  const current = Object.hasOwn(value || {}, 'content_options');
  if (current) keys.push('content_options');
  if (Object.hasOwn(value || {}, 'ocr_contacts')) keys.push('ocr_contacts');
  if (Object.hasOwn(value || {}, 'private_document_metadata')) keys.push('private_document_metadata');
  if (!exactKeys(value, keys) || value.schema !== (current ? CONTENT_EXTRACTION_SCHEMA : EXTRACTION_SCHEMA) || value.processing_mode !== PROCESSING_MODE ||
      value.anonymized !== false || !SOURCE_VALUES.has(value.source_type)) throw new MarkdownContractError();
  if (current) validateContentOptions(value.content_options);
  if (Object.hasOwn(value, 'private_document_metadata')) {
    if (!current || value.source_type !== 'pdf') throw new MarkdownContractError();
    validatePrivateDocumentMetadata(value.private_document_metadata);
  }
  validateMarkdownText(value.markdown);
  validateCoverage(value.coverage);
  const contactWarning = value.coverage.reason_codes.includes('OCR_CONTACT_VALUES_UNVERIFIED');
  const hasContacts = Object.hasOwn(value, 'ocr_contacts');
  if (hasContacts) require('../core/ocr-contact-review').validateContacts(value.ocr_contacts, value.markdown, value.source_type);
  // A warned OCR contact without an exact provenance map must not skip the
  // mandatory confirmation hook during anonymisation.
  if (contactWarning !== (hasContacts && value.ocr_contacts.length > 0)) throw new MarkdownContractError();
  return value;
}

// Callers must check their expected request, not just recognize both schemas.
// Identical Markdown bytes never authorize a different OCR/options contract.
function validateMarkdownExtractionForOptions(value, expected) {
  validateMarkdownExtraction(value);
  if (expected === undefined) {
    if (value.schema !== EXTRACTION_SCHEMA) throw new MarkdownContractError();
  } else if (value.schema !== CONTENT_EXTRACTION_SCHEMA ||
      serializeContentOptions(value.content_options) !== serializeContentOptions(expected)) throw new MarkdownContractError();
  return value;
}

function createMarkdownExtraction(input) {
  const keys = ['source_type', 'markdown', 'coverage'];
  const current = Object.hasOwn(input || {}, 'content_options');
  if (current) keys.push('content_options');
  if (Object.hasOwn(input || {}, 'ocr_contacts')) keys.push('ocr_contacts');
  if (Object.hasOwn(input || {}, 'private_document_metadata')) keys.push('private_document_metadata');
  if (!exactKeys(input, keys)) throw new MarkdownContractError();
  const value = {
    schema: current ? CONTENT_EXTRACTION_SCHEMA : EXTRACTION_SCHEMA,
    processing_mode: PROCESSING_MODE,
    anonymized: false,
    source_type: input.source_type,
    markdown: input.markdown,
    coverage: input.coverage,
    ...(current ? { content_options: validateContentOptions(input.content_options) } : {}),
    ...(Object.hasOwn(input, 'private_document_metadata') ? { private_document_metadata: validatePrivateDocumentMetadata(input.private_document_metadata) } : {}),
    ...(Object.hasOwn(input, 'ocr_contacts') ? { ocr_contacts: input.ocr_contacts } : {})
  };
  validateMarkdownExtraction(value);
  value.coverage = Object.freeze({
    status: value.coverage.status,
    reason_codes: Object.freeze([...value.coverage.reason_codes])
  });
  if (value.ocr_contacts) value.ocr_contacts = Object.freeze(value.ocr_contacts.map(item => Object.freeze({ ...item })));
  return Object.freeze(value);
}

module.exports = Object.freeze({
  EXTRACTION_SCHEMA, CONTENT_EXTRACTION_SCHEMA, PROCESSING_MODE, SOURCE_TYPES, COVERAGE_REASON_CODES, MAX_MARKDOWN_CHARS,
  MarkdownContractError, exactKeys, validateMarkdownText, validateCoverage,
  validateMarkdownExtraction, validateMarkdownExtractionForOptions, createMarkdownExtraction
});
