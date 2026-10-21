'use strict';

const SOURCE_EXTRACTION_SCHEMA = 'datasecure-source-extraction/1';
const CONTENT_SOURCE_EXTRACTION_SCHEMA = 'datasecure-source-extraction/2';
const { validateContentOptions, serializeContentOptions } = require('./content-options');
const SOURCE_TYPES = Object.freeze(['txt', 'md', 'csv', 'docx', 'xlsx', 'pptx', 'pdf', 'png', 'jpeg', 'bmp']);
const COVERAGE_REASON_CODES = Object.freeze([
  'CONVERSION_RESOURCE_LIMIT_PARTIAL',
  'CONVERSION_TIMEOUT_PARTIAL',
  'DOCUMENT_PARTS_DAMAGED',
  'EXTERNAL_CONTENT_NOT_READ',
  'IMAGE_CONTENT_DAMAGED',
  'IMAGE_OCR_FAILED',
  'IMAGE_PROCESSING_LIMIT',
  'OFFICE_IMAGE_FORMAT_EMF_UNSUPPORTED',
  'OFFICE_IMAGE_FORMAT_GIF_UNSUPPORTED',
  'OFFICE_IMAGE_FORMAT_OTHER_UNSUPPORTED',
  'OFFICE_IMAGE_FORMAT_SVG_UNSUPPORTED',
  'OFFICE_IMAGE_FORMAT_TIFF_UNSUPPORTED',
  'OFFICE_IMAGE_FORMAT_WEBP_UNSUPPORTED',
  'OFFICE_IMAGE_FORMAT_WMF_UNSUPPORTED',
  'PDF_IMAGE_NOT_READ',
  'PDF_PAGE_NOT_READ',
  'TEXT_LIMIT_PARTIAL',
  'DOCX_HEADER_FOOTER_EXCLUDED_BY_POLICY',
  'IMAGE_OCR_DISABLED_BY_POLICY',
  'OCR_CONTACT_VALUES_UNVERIFIED',
  'OCR_NOT_VERIFIED',
  'OCR_TEXT_EMPTY',
  'PDF_OCR_SCOPE_UNVERIFIED',
  'SCAN_OCR_DISABLED_BY_POLICY',
  'SOURCE_COVERAGE_UNVERIFIED',
  'VISUAL_CONTENT_NOT_EXTRACTED'
]);
const SOURCE_VALUES = new Set(SOURCE_TYPES);
const REASON_VALUES = new Set(COVERAGE_REASON_CODES);
const ownFailures = new WeakMap();

class SourceExtractionError extends Error {
  constructor(code = 'SOURCE_EXTRACTION_INVALID') {
    super('Der lokale Extraktionsvertrag ist ungültig.');
    this.name = 'SourceExtractionError';
    this.code = code;
  }
}

function failure(code = 'SOURCE_EXTRACTION_INVALID') {
  const error = new SourceExtractionError(code);
  ownFailures.set(error, code);
  return error;
}

function normalized(operation) {
  try { return operation(); }
  catch (error) {
    // Foreign reflection exceptions may themselves be proxies. Identity lookup
    // inspects no caller property or prototype. Only our own checked length
    // failure retains TEXT_TOO_LARGE; never expose a foreign message/code.
    throw failure(ownFailures.get(error) === 'TEXT_TOO_LARGE' ? 'TEXT_TOO_LARGE' : 'SOURCE_EXTRACTION_INVALID');
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

function validateText(markdown, maximumChars) {
  if (typeof markdown !== 'string') throw failure();
  if (markdown.length > maximumChars) throw failure('TEXT_TOO_LARGE');
  for (let index = 0; index < markdown.length; index++) {
    const unit = markdown.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = markdown.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw failure();
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw failure();
  }
}

function checkedCoverage(coverage) {
  if (!exactKeys(coverage, ['status', 'reason_codes']) ||
      !['complete', 'incomplete'].includes(coverage.status) || !Array.isArray(coverage.reason_codes) ||
      coverage.reason_codes.length > COVERAGE_REASON_CODES.length) throw new SourceExtractionError();
  for (let index = 0; index < coverage.reason_codes.length; index++) {
    const code = coverage.reason_codes[index];
    if (!REASON_VALUES.has(code) || (index > 0 && coverage.reason_codes[index - 1] >= code)) {
      throw new SourceExtractionError();
    }
  }
  if ((coverage.status === 'complete') !== (coverage.reason_codes.length === 0)) throw new SourceExtractionError();
  return coverage;
}

function checkedSourceExtraction(value, maximumChars) {
  const current = Object.hasOwn(value || {}, 'content_options');
  if (!Number.isSafeInteger(maximumChars) || maximumChars < 1 ||
      !exactKeys(value, ['schema', 'source_type', 'markdown', 'coverage', ...(current ? ['content_options'] : [])]) ||
      value.schema !== (current ? CONTENT_SOURCE_EXTRACTION_SCHEMA : SOURCE_EXTRACTION_SCHEMA) || !SOURCE_VALUES.has(value.source_type)) {
    throw new SourceExtractionError();
  }
  if (current) {
    try { validateContentOptions(value.content_options); } catch { throw new SourceExtractionError(); }
  }
  validateText(value.markdown, maximumChars);
  validateCoverage(value.coverage);
  return value;
}

function checkedSourceExtractionForOptions(value, maximumChars, expected) {
  validateSourceExtraction(value, maximumChars);
  if (expected === undefined) {
    if (value.schema !== SOURCE_EXTRACTION_SCHEMA) throw new SourceExtractionError();
  } else {
    try {
      if (value.schema !== CONTENT_SOURCE_EXTRACTION_SCHEMA ||
          serializeContentOptions(value.content_options) !== serializeContentOptions(expected)) throw new SourceExtractionError();
    } catch { throw new SourceExtractionError(); }
  }
  return value;
}

function checkedCreateSourceExtraction(input, maximumChars) {
  const current = Object.hasOwn(input || {}, 'content_options');
  if (!exactKeys(input, ['source_type', 'markdown', 'coverage', ...(current ? ['content_options'] : [])])) throw new SourceExtractionError();
  const value = {
    schema: current ? CONTENT_SOURCE_EXTRACTION_SCHEMA : SOURCE_EXTRACTION_SCHEMA,
    source_type: input.source_type,
    markdown: input.markdown,
    coverage: input.coverage,
    ...(current ? { content_options: validateContentOptions(input.content_options) } : {})
  };
  validateSourceExtraction(value, maximumChars);
  value.coverage = Object.freeze({ status: value.coverage.status,
    reason_codes: Object.freeze([...value.coverage.reason_codes]) });
  return Object.freeze(value);
}

// Pure record validators are not native proxy-detection boundaries. Product
// adapters guard foreign object graphs before calling these browser-safe
// operations; direct reflection failures nevertheless stay fixed and opaque.
function validateCoverage(coverage) { return normalized(() => checkedCoverage(coverage)); }
function validateSourceExtraction(value, maximumChars) { return normalized(() => checkedSourceExtraction(value, maximumChars)); }
function validateSourceExtractionForOptions(value, maximumChars, expected) {
  return normalized(() => checkedSourceExtractionForOptions(value, maximumChars, expected));
}
function createSourceExtraction(input, maximumChars) { return normalized(() => checkedCreateSourceExtraction(input, maximumChars)); }

module.exports = Object.freeze({ SOURCE_EXTRACTION_SCHEMA, CONTENT_SOURCE_EXTRACTION_SCHEMA, SOURCE_TYPES, COVERAGE_REASON_CODES,
  SourceExtractionError, exactKeys, validateCoverage, validateSourceExtraction, validateSourceExtractionForOptions, createSourceExtraction });
