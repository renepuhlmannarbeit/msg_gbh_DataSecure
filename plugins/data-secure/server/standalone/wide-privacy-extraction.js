'use strict';

const { validateMarkdownExtraction } = require('./markdown-contract');
const { createSourceExtraction } = require('../core/source-extraction-contract');
const { RESOURCE_LIMITS } = require('../resource-limits');

const WIDE_EXTENSIONS = new Set(['.xlsx', '.pptx', '.pdf', '.png', '.jpg', '.jpeg', '.bmp']);
const SOURCE_TYPE_BY_EXTENSION = Object.freeze({
  '.xlsx': 'xlsx', '.pptx': 'pptx', '.pdf': 'pdf', '.png': 'png',
  '.jpg': 'jpeg', '.jpeg': 'jpeg', '.bmp': 'bmp'
});

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
  const normalizedExtension = String(extension || '').toLowerCase();
  if (!Buffer.isBuffer(bytes) || !isWidePrivacyExtension(normalizedExtension)) {
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
