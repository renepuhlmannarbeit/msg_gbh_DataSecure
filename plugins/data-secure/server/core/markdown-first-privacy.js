'use strict';

const { createSourceExtraction } = require('./source-extraction-contract');
const { RESOURCE_LIMITS } = require('../resource-limits');

const WIDE_EXTENSIONS = new Set(['.xlsx', '.pptx', '.pdf', '.png', '.jpg', '.jpeg', '.bmp']);
const STANDALONE_EXTENSIONS = new Set(['.docx', ...WIDE_EXTENSIONS]);
// Cowork deliberately starts with the Office formats already handled by the
// shipped isolated parser. PDF/OCR needs a separately packaged and proven
// runtime and therefore remains outside this release boundary.
const COWORK_EXTENSIONS = new Set(['.xlsx', '.pptx']);
const SOURCE_TYPE_BY_EXTENSION = Object.freeze({
  '.docx': 'docx', '.xlsx': 'xlsx', '.pptx': 'pptx', '.pdf': 'pdf', '.png': 'png',
  '.jpg': 'jpeg', '.jpeg': 'jpeg', '.bmp': 'bmp'
});
const EXPLICIT_SENSITIVE_HEADER = /^(?:Name|Vorname|Nachname|Person|Mitarbeiter(?:in)?|Teilnehmer(?:in)?|Ansprechpartner(?:in)?|Zuständige?|Verantwortliche?|Bearbeiter(?:in)?|Sachbearbeiter(?:in)?|Betreuer(?:in)?|Autor(?:in)?|Verfasser(?:in)?|Empfänger(?:in)?|Absender(?:in)?|Unterzeichner(?:in)?|Gesprächspartner(?:in)?|Kontakt|Arbeitgeber|Kunde|Unternehmen|Firma|Organisation|E-?Mail|Telefon|IBAN|Anschrift|Adresse|Geburtsdatum)$/iu;

function markdownCells(line) {
  const source = String(line || '').trim();
  if (!source.startsWith('|') || !source.endsWith('|')) return null;
  const cells = [];
  let value = '';
  let escaped = false;
  for (const character of source.slice(1, -1)) {
    if (escaped) {
      value += character;
      escaped = false;
    } else if (character === '\\') {
      value += character;
      escaped = true;
    } else if (character === '|') {
      cells.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells;
}

function promoteExplicitSensitiveTableHeaders(markdown) {
  const sourceLines = String(markdown || '').split('\n');
  // The direct OOXML parser separates rendered table rows with one empty
  // Markdown line. Compact only blanks between two table rows so the privacy
  // table grammar sees the same structure as the Standalone converter while
  // all non-table whitespace remains untouched.
  const lines = sourceLines.filter((line, index) => !(line.trim() === '' &&
    markdownCells(sourceLines[index - 1]) && markdownCells(sourceLines[index + 1])));
  for (let index = 0; index + 2 < lines.length; index++) {
    const generated = markdownCells(lines[index]);
    const separator = markdownCells(lines[index + 1]);
    const sourceHeader = markdownCells(lines[index + 2]);
    if (!generated || !separator || !sourceHeader || generated.length !== separator.length ||
      generated.length !== sourceHeader.length) continue;
    if (!generated.every((value, column) => value === `Spalte ${column + 1}`) ||
      !separator.every((value) => /^:?-{3,}:?$/u.test(value))) continue;
    if (!sourceHeader.some((value) => EXPLICIT_SENSITIVE_HEADER.test(value))) continue;
    lines[index] = lines[index + 2];
    lines.splice(index + 2, 1);
  }
  return lines.join('\n');
}

function extensionsForChannel(productChannel) {
  return productChannel === 'standalone' ? STANDALONE_EXTENSIONS
    : productChannel === 'plugin' ? COWORK_EXTENSIONS : new Set();
}

function isWidePrivacyExtension(extension) {
  return WIDE_EXTENSIONS.has(String(extension || '').toLowerCase());
}

function isMarkdownFirstPrivacyExtension(extension, productChannel = 'standalone') {
  return extensionsForChannel(productChannel).has(String(extension || '').toLowerCase());
}

function coverageFailure(ErrorType = Error) {
  const failure = new ErrorType('Die Quelle lieferte keinen verwertbaren Markdown-Inhalt für die Anonymisierung.');
  failure.code = 'PARSER_COVERAGE_UNVERIFIED';
  return failure;
}

function directParserCoverage(parsed) {
  const reasons = new Set(['SOURCE_COVERAGE_UNVERIFIED']);
  if ((parsed.attachments || []).length > 0 || (parsed.unreviewedVisualCount || 0) > 0) {
    reasons.add('VISUAL_CONTENT_NOT_EXTRACTED');
  }
  return { status: 'incomplete', reason_codes: [...reasons].sort() };
}

async function extractSourceForPrivacy(bytes, extension, options = {}) {
  const ErrorType = options.ErrorType || Error;
  const productChannel = options.productChannel || 'standalone';
  const normalizedExtension = String(extension || '').toLowerCase();
  if (!Buffer.isBuffer(bytes) || !isMarkdownFirstPrivacyExtension(normalizedExtension, productChannel)) {
    const failure = new ErrorType('Die lokale Privacy-Extraktion erhielt eine ungültige oder nicht freigegebene Quelle.');
    failure.code = 'FORMAT_COVERAGE_UNVERIFIED';
    throw failure;
  }

  let extraction;
  let coverage;
  if (productChannel === 'standalone') {
    const convert = options.convertBuffer || require('../standalone/conversion-worker').convertBuffer;
    extraction = await convert(bytes, normalizedExtension, {
      signal: options.signal,
      ...(normalizedExtension === '.docx' ? { omitDocxHeaderFooter: true } : {}),
      ...(['.pdf', '.pptx'].includes(normalizedExtension) ? { passiveObjects: true } : {}),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
    });
    const { validateMarkdownExtraction } = require('../standalone/markdown-contract');
    validateMarkdownExtraction(extraction);
    coverage = extraction.coverage;
  } else {
    const convert = options.convertDocument;
    if (typeof convert !== 'function') {
      const failure = new ErrorType('Der isolierte lokale Office-Parser ist nicht verfügbar.');
      failure.code = 'PARSER_ISOLATION_FAILED';
      throw failure;
    }
    extraction = await convert(normalizedExtension, {
      signal: options.signal,
      inputBuffer: bytes,
      sourceName: `source${normalizedExtension}`,
      ...(normalizedExtension === '.docx' ? { omitDocxHeaderFooter: true } : {})
    });
    coverage = directParserCoverage(extraction);
  }

  const expectedType = SOURCE_TYPE_BY_EXTENSION[normalizedExtension];
  const actualType = extraction.source_type || extraction.sourceType || expectedType;
  if (actualType !== expectedType) {
    const failure = new ErrorType('Die lokale Privacy-Extraktion meldete einen widersprüchlichen Quelltyp.');
    failure.code = 'FORMAT_COVERAGE_UNVERIFIED';
    throw failure;
  }
  const privacyMarkdown = ['docx', 'xlsx', 'pptx'].includes(expectedType)
    ? promoteExplicitSensitiveTableHeaders(extraction.markdown) : extraction.markdown;
  const neutral = createSourceExtraction({ source_type: expectedType,
    markdown: privacyMarkdown, coverage }, RESOURCE_LIMITS.MAX_TEXT_CHARS);
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
    sourceExtractionCoverage: neutral.coverage,
    ...(productChannel === 'standalone' && extraction.ocr_contacts ? { ocrContacts: extraction.ocr_contacts } : {})
  });
}

module.exports = Object.freeze({
  WIDE_EXTENSIONS,
  STANDALONE_EXTENSIONS,
  COWORK_EXTENSIONS,
  isWidePrivacyExtension,
  isMarkdownFirstPrivacyExtension,
  extractSourceForPrivacy,
  promoteExplicitSensitiveTableHeaders
});
