'use strict';

// In-memory extraction used by the isolated Standalone conversion worker.
// No PII normalization, anonymization, OCR, AI, filesystem writes or external
// calls happen in this direct-format module. PDF/OCR belongs to its worker.
const { decodeUtf8Source, parseCsvDialect } = require('../document-parser');
const { parseOoxml } = require('../ooxml');
const { RESOURCE_LIMITS } = require('../resource-limits');
const { createMarkdownExtraction, MAX_MARKDOWN_CHARS } = require('./markdown-contract');
const { visualNotices } = require('./markdown-visuals');

const SOURCE_TYPES = new Map([
  ['.txt', 'txt'], ['.md', 'md'], ['.markdown', 'md'], ['.csv', 'csv'],
  ['.docx', 'docx'], ['.xlsx', 'xlsx'], ['.pptx', 'pptx']
]);
const SAFE_FAILURE_CODES = new Set([
  'TEXT_ENCODING_INVALID', 'TEXT_CONTROL_INVALID', 'CSV_EMPTY', 'CSV_QUOTE_INVALID',
  'CSV_DELIMITER_AMBIGUOUS', 'CSV_ROW_WIDTH_INVALID', 'TEXT_TOO_LARGE',
  'DOCX_STRUCTURE_UNSAFE', 'DOCX_STRUCTURE_LIMIT', 'OOXML_XML_CHARACTER_INVALID',
  'OOXML_ENCODING_INVALID', 'XLSX_STRUCTURE_UNSAFE', 'XLSX_STRUCTURE_LIMIT', 'XLSX_SHARED_STRING_INVALID',
  'PPTX_STRUCTURE_UNSAFE', 'PPTX_STRUCTURE_LIMIT'
]);

class MarkdownExtractionError extends Error {
  constructor(code) {
    // Never promote parser errors, paths, XML fragments or source text into a
    // diagnostic. The caller can log this fixed code, not source-bearing data.
    super('Die lokale Markdown-Extraktion konnte nicht vollständig ausgeführt werden.');
    this.name = 'MarkdownExtractionError';
    this.code = code;
  }
}

function literalTableCell(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\`*_[\]{}()#+.!|])/g, '\\$1')
    .replace(/ /g, '&#32;').replace(/\t/g, '&#9;').replace(/\r/g, '&#13;').replace(/\n/g, '<br>');
}

function extractCsv(source) {
  const { rows } = parseCsvDialect(source, { preserveRecords: true });
  if (!rows.length) throw new MarkdownExtractionError('CSV_EMPTY');
  const width = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  if (rows.some((row) => row.length !== width && !(row.length === 1 && row[0] === ''))) {
    throw new MarkdownExtractionError('CSV_ROW_WIDTH_INVALID');
  }
  const lines = [];
  let chars = 0;
  function append(line) {
    chars += line.length + 1;
    if (chars > MAX_MARKDOWN_CHARS) throw new MarkdownExtractionError('TEXT_TOO_LARGE');
    lines.push(line);
  }
  // No source row is guessed to be a header. Empty/duplicate header-like
  // values, leading zeroes, formula-looking text and blank records are data.
  append('| Zeile | ' + Array.from({ length: width }, (_, index) => `Spalte ${index + 1}`).join(' | ') + ' |');
  append('| --- | ' + Array.from({ length: width }, () => '---').join(' | ') + ' |');
  for (let index = 0; index < rows.length; index++) {
    append(`| ${index + 1} | ` + Array.from({ length: width }, (_, column) => literalTableCell(rows[index][column] ?? '')).join(' | ') + ' |');
  }
  return lines.join('\n');
}

function extractMarkdownBuffer(buffer, extension, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some((key) => key !== 'omitDocxHeaderFooter') ||
      (options.omitDocxHeaderFooter !== undefined && typeof options.omitDocxHeaderFooter !== 'boolean')) {
    throw new MarkdownExtractionError('CONVERSION_INPUT_INVALID');
  }
  const source_type = SOURCE_TYPES.get(typeof extension === 'string' ? extension.toLowerCase() : '');
  if (!source_type) throw new MarkdownExtractionError('MARKDOWN_FORMAT_UNSUPPORTED');
  if (options.omitDocxHeaderFooter === true && source_type !== 'docx') {
    throw new MarkdownExtractionError('CONVERSION_INPUT_INVALID');
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new MarkdownExtractionError('INPUT_FILE_LIMIT');
  const maximumBytes = source_type === 'csv' ? RESOURCE_LIMITS.MAX_CSV_SOURCE_BYTES
    : ['txt', 'md'].includes(source_type) ? RESOURCE_LIMITS.MAX_TEXT_SOURCE_BYTES : RESOURCE_LIMITS.MAX_DOCX_SOURCE_BYTES;
  if (buffer.length > maximumBytes) throw new MarkdownExtractionError('INPUT_FORMAT_LIMIT');
  try {
    let markdown;
    const reasons = new Set();
    if (source_type === 'txt' || source_type === 'md') {
      // UTF-8 BOM is encoding metadata. Otherwise keep source Unicode,
      // whitespace, line endings and punctuation exactly as decoded.
      markdown = decodeUtf8Source(buffer);
    } else if (source_type === 'csv') {
      markdown = extractCsv(decodeUtf8Source(buffer));
    } else {
      const parsed = parseOoxml(buffer, `.${source_type}`, undefined, {
        preserveText: true,
        ...(options.omitDocxHeaderFooter === true ? { omitDocxHeaderFooter: true } : {})
      });
      markdown = parsed.markdown;
      if (options.omitDocxHeaderFooter === true) reasons.add('DOCX_HEADER_FOOTER_EXCLUDED_BY_POLICY');
      if (parsed.warnings.length || source_type === 'xlsx' || source_type === 'pptx') reasons.add('SOURCE_COVERAGE_UNVERIFIED');
      if (parsed.attachments.length) {
        reasons.add('VISUAL_CONTENT_NOT_EXTRACTED');
        // The .md file is useful on its own when passed to an AI: explain the
        // omission without embedding image bytes, XML or source filenames, and
        // never invent an image title/description. Retain all extracted prose,
        // table cells, chart data and text-box text above this fixed notice.
        markdown += `${markdown ? '\n\n' : ''}${visualNotices({ image: true })}`;
      }
    }
    const reason_codes = [...reasons].sort();
    return createMarkdownExtraction({ source_type, markdown,
      coverage: { status: reason_codes.length ? 'incomplete' : 'complete', reason_codes } });
  } catch (error) {
    if (error instanceof MarkdownExtractionError) throw error;
    const code = error?.code || error?.message;
    throw new MarkdownExtractionError(SAFE_FAILURE_CODES.has(code) ? code : 'MARKDOWN_EXTRACTION_FAILED');
  }
}

module.exports = Object.freeze({ extractMarkdownBuffer, MarkdownExtractionError });
