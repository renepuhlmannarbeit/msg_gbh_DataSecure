'use strict';

const { validateMarkdownExtraction } = require('./markdown-contract');
const { createSourceExtraction } = require('../core/source-extraction-contract');
const { RESOURCE_LIMITS } = require('../resource-limits');

const WIDE_EXTENSIONS = new Set(['.xlsx', '.pptx', '.pdf', '.png', '.jpg', '.jpeg', '.bmp']);
// Standalone anonymizes a neutral Markdown representation. DOCX belongs to
// that same product flow even though it is also a directly supported Cowork
// format. Keeping this decision at the product adapter boundary preserves the
// stricter Cowork DOCX contract while allowing Standalone to report incomplete
// source coverage separately from complete Markdown anonymization.
const MARKDOWN_FIRST_PRIVACY_EXTENSIONS = new Set(['.docx', ...WIDE_EXTENSIONS]);
const SOURCE_TYPE_BY_EXTENSION = Object.freeze({
  '.docx': 'docx', '.xlsx': 'xlsx', '.pptx': 'pptx', '.pdf': 'pdf', '.png': 'png',
  '.jpg': 'jpeg', '.jpeg': 'jpeg', '.bmp': 'bmp'
});

function isWidePrivacyExtension(extension) {
  return WIDE_EXTENSIONS.has(String(extension || '').toLowerCase());
}

function isMarkdownFirstPrivacyExtension(extension) {
  return MARKDOWN_FIRST_PRIVACY_EXTENSIONS.has(String(extension || '').toLowerCase());
}

function coverageFailure(ErrorType = Error) {
  const failure = new ErrorType('Die Quelle lieferte keinen verwertbaren Markdown-Inhalt für die Anonymisierung.');
  failure.code = 'PARSER_COVERAGE_UNVERIFIED';
  return failure;
}

async function extractWideSourceForPrivacy(bytes, extension, options = {}) {
  const ErrorType = options.ErrorType || Error;
  const normalizedExtension = String(extension || '').toLowerCase();
  if (!Buffer.isBuffer(bytes) || !isMarkdownFirstPrivacyExtension(normalizedExtension)) {
    const failure = new ErrorType('Die breite lokale Privacy-Extraktion erhielt eine ungültige Quelle.');
    failure.code = 'FORMAT_COVERAGE_UNVERIFIED';
    throw failure;
  }
  const convert = options.convertBuffer || require('./conversion-worker').convertBuffer;
  const extraction = await convert(bytes, normalizedExtension, {
    signal: options.signal,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
  });
  validateMarkdownExtraction(extraction);
  if (extraction.source_type !== SOURCE_TYPE_BY_EXTENSION[normalizedExtension]) {
    const failure = new ErrorType('Die breite lokale Privacy-Extraktion meldete einen widersprüchlichen Quelltyp.');
    failure.code = 'FORMAT_COVERAGE_UNVERIFIED';
    throw failure;
  }
  const neutral = createSourceExtraction({ source_type: extraction.source_type,
    markdown: extraction.markdown, coverage: extraction.coverage }, RESOURCE_LIMITS.MAX_TEXT_CHARS);
  // DS-087 deliberately anonymizes the converter's Markdown representation,
  // not the original container. Coverage reasons therefore remain relevant to
  // the visible scope notice, but they must not reject useful extracted text.
  // Empty OCR has no privacy input and remains fail-closed.
  if (!neutral.markdown.trim() || neutral.coverage.reason_codes.includes('OCR_TEXT_EMPTY')) {
    throw coverageFailure(ErrorType);
  }
  return Object.freeze({
    markdown: neutral.markdown,
    warnings: Object.freeze([]),
    attachments: Object.freeze([]),
    unreviewedVisualCount: 0,
    requiresExplicitProfile: false,
    sourceType: neutral.source_type,
    sourceExtractionCoverage: neutral.coverage
  });
}

module.exports = Object.freeze({
  WIDE_EXTENSIONS,
  MARKDOWN_FIRST_PRIVACY_EXTENSIONS,
  isWidePrivacyExtension,
  isMarkdownFirstPrivacyExtension,
  extractWideSourceForPrivacy
});
