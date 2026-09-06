'use strict';

const { validateMarkdownExtraction } = require('./markdown-contract');
const { createSourceExtraction } = require('../core/source-extraction-contract');
const { RESOURCE_LIMITS } = require('../resource-limits');

const WIDE_EXTENSIONS = new Set(['.xlsx', '.pptx', '.pdf', '.png', '.jpg', '.jpeg', '.bmp']);

function isWidePrivacyExtension(extension) {
  return WIDE_EXTENSIONS.has(String(extension || '').toLowerCase());
}

function coverageFailure(ErrorType = Error) {
  const failure = new ErrorType('Die Quelle konnte nicht vollständig genug für eine sichere Anonymisierung extrahiert werden.');
  failure.code = 'PARSER_COVERAGE_UNVERIFIED';
  return failure;
}

async function extractWideSourceForPrivacy(bytes, extension, options = {}) {
  const ErrorType = options.ErrorType || Error;
  if (!Buffer.isBuffer(bytes) || !isWidePrivacyExtension(extension)) {
    const failure = new ErrorType('Die breite lokale Privacy-Extraktion erhielt eine ungültige Quelle.');
    failure.code = 'FORMAT_COVERAGE_UNVERIFIED';
    throw failure;
  }
  const convert = options.convertBuffer || require('./conversion-worker').convertBuffer;
  const extraction = await convert(bytes, String(extension).toLowerCase(), {
    signal: options.signal,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
  });
  validateMarkdownExtraction(extraction);
  const neutral = createSourceExtraction({ source_type: extraction.source_type,
    markdown: extraction.markdown, coverage: extraction.coverage }, RESOURCE_LIMITS.MAX_TEXT_CHARS);
  if (neutral.coverage.status !== 'complete' || neutral.coverage.reason_codes.length !== 0) throw coverageFailure(ErrorType);
  return Object.freeze({
    markdown: neutral.markdown,
    warnings: Object.freeze([]),
    attachments: Object.freeze([]),
    unreviewedVisualCount: 0,
    requiresExplicitProfile: false,
    sourceType: neutral.source_type
  });
}

module.exports = Object.freeze({ WIDE_EXTENSIONS, isWidePrivacyExtension, extractWideSourceForPrivacy });
