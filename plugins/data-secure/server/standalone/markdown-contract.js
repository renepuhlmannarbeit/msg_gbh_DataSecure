'use strict';

const { RESOURCE_LIMITS } = require('../resource-limits');
const { MODES } = require('../core/processing-mode');

const EXTRACTION_SCHEMA = 'datasecure-markdown-extraction/1';
const PROCESSING_MODE = MODES.MARKDOWN;
// Vocabulary is a format contract, not a declaration of packaged support.
const SOURCE_TYPES = Object.freeze(['txt', 'md', 'csv', 'docx', 'xlsx', 'pptx', 'pdf', 'png', 'jpeg', 'bmp']);
const COVERAGE_REASON_CODES = Object.freeze([
  'OCR_NOT_VERIFIED',
  'OCR_TEXT_EMPTY',
  'SOURCE_COVERAGE_UNVERIFIED',
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
  if (!exactKeys(value, ['schema', 'processing_mode', 'anonymized', 'source_type', 'markdown', 'coverage']) ||
      value.schema !== EXTRACTION_SCHEMA || value.processing_mode !== PROCESSING_MODE ||
      value.anonymized !== false || !SOURCE_VALUES.has(value.source_type)) throw new MarkdownContractError();
  validateMarkdownText(value.markdown);
  validateCoverage(value.coverage);
  return value;
}

function createMarkdownExtraction(input) {
  if (!exactKeys(input, ['source_type', 'markdown', 'coverage'])) throw new MarkdownContractError();
  const value = {
    schema: EXTRACTION_SCHEMA,
    processing_mode: PROCESSING_MODE,
    anonymized: false,
    source_type: input.source_type,
    markdown: input.markdown,
    coverage: input.coverage
  };
  validateMarkdownExtraction(value);
  value.coverage = Object.freeze({
    status: value.coverage.status,
    reason_codes: Object.freeze([...value.coverage.reason_codes])
  });
  return Object.freeze(value);
}

module.exports = Object.freeze({
  EXTRACTION_SCHEMA, PROCESSING_MODE, SOURCE_TYPES, COVERAGE_REASON_CODES, MAX_MARKDOWN_CHARS,
  MarkdownContractError, exactKeys, validateMarkdownText, validateCoverage,
  validateMarkdownExtraction, createMarkdownExtraction
});
