'use strict';

const SOURCE_EXTRACTION_SCHEMA = 'datasecure-source-extraction/1';
const SOURCE_TYPES = Object.freeze(['txt', 'md', 'csv', 'docx', 'xlsx', 'pptx', 'pdf', 'png', 'jpeg', 'bmp']);
const COVERAGE_REASON_CODES = Object.freeze([
  'OCR_NOT_VERIFIED',
  'OCR_TEXT_EMPTY',
  'SOURCE_COVERAGE_UNVERIFIED',
  'VISUAL_CONTENT_NOT_EXTRACTED'
]);
const SOURCE_VALUES = new Set(SOURCE_TYPES);
const REASON_VALUES = new Set(COVERAGE_REASON_CODES);

class SourceExtractionError extends Error {
  constructor(code = 'SOURCE_EXTRACTION_INVALID') {
    super('Der lokale Extraktionsvertrag ist ungültig.');
    this.name = 'SourceExtractionError';
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

function validateText(markdown, maximumChars) {
  if (typeof markdown !== 'string' || markdown.length > maximumChars) {
    throw new SourceExtractionError(markdown?.length > maximumChars ? 'TEXT_TOO_LARGE' : undefined);
  }
  for (let index = 0; index < markdown.length; index++) {
    const unit = markdown.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = markdown.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new SourceExtractionError();
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new SourceExtractionError();
  }
}

function validateCoverage(coverage) {
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

function validateSourceExtraction(value, maximumChars) {
  if (!Number.isSafeInteger(maximumChars) || maximumChars < 1 ||
      !exactKeys(value, ['schema', 'source_type', 'markdown', 'coverage']) ||
      value.schema !== SOURCE_EXTRACTION_SCHEMA || !SOURCE_VALUES.has(value.source_type)) {
    throw new SourceExtractionError();
  }
  validateText(value.markdown, maximumChars);
  validateCoverage(value.coverage);
  return value;
}

function createSourceExtraction(input, maximumChars) {
  if (!exactKeys(input, ['source_type', 'markdown', 'coverage'])) throw new SourceExtractionError();
  const value = {
    schema: SOURCE_EXTRACTION_SCHEMA,
    source_type: input.source_type,
    markdown: input.markdown,
    coverage: input.coverage
  };
  validateSourceExtraction(value, maximumChars);
  value.coverage = Object.freeze({ status: value.coverage.status,
    reason_codes: Object.freeze([...value.coverage.reason_codes]) });
  return Object.freeze(value);
}

module.exports = Object.freeze({ SOURCE_EXTRACTION_SCHEMA, SOURCE_TYPES, COVERAGE_REASON_CODES,
  SourceExtractionError, exactKeys, validateCoverage, validateSourceExtraction, createSourceExtraction });
