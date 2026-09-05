'use strict';

const path = require('path');
const { normalizeText } = require('./privacy/base');
const { parseOoxml } = require('./ooxml');
const { createContentGraph } = require('./content-graph');

const FORBIDDEN_TEXT_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const CSV_DELIMITERS = Object.freeze([',', ';', '\t']);

function decodeUtf8Source(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('parser input must be a buffer');
  let text;
  try {
    // WHATWG decoding removes an optional UTF-8 BOM. fatal prevents replacement
    // characters from silently changing identifiers or coverage positions.
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buffer);
  } catch {
    throw new Error('TEXT_ENCODING_INVALID');
  }
  if (FORBIDDEN_TEXT_CONTROLS.test(text)) throw new Error('TEXT_CONTROL_INVALID');
  return text;
}

function parseCsvRows(source, delimiter, options = {}) {
  if (!CSV_DELIMITERS.includes(delimiter)) throw new Error('CSV_DELIMITER_INVALID');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let quoteClosed = false;
  let touched = false;
  const commitField = () => { row.push(field); field = ''; quoteClosed = false; };
  const commitRow = () => {
    commitField();
    if (touched || options.preserveRecords === true) rows.push(row);
    row = [];
    touched = false;
  };

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          quoteClosed = true;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (quoteClosed) {
      if (char === delimiter) {
        commitField();
        touched = true;
      } else if (char === '\n' || (char === '\r' && options.preserveRecords === true)) {
        commitRow();
        if (char === '\r' && source[index + 1] === '\n') index++;
      } else {
        throw new Error('CSV_QUOTE_INVALID');
      }
      continue;
    }
    if (char === '"') {
      if (field.length !== 0) throw new Error('CSV_QUOTE_INVALID');
      quoted = true;
      touched = true;
    } else if (char === delimiter) {
      commitField();
      touched = true;
    } else if (char === '\n' || (char === '\r' && options.preserveRecords === true)) {
      commitRow();
      if (char === '\r' && source[index + 1] === '\n') index++;
    } else {
      field += char;
      touched = true;
    }
  }
  if (quoted) throw new Error('CSV_QUOTE_INVALID');
  if (touched || row.length > 0 || field.length > 0 || quoteClosed) commitRow();
  return rows;
}

function parseCsvDialect(source, options = {}) {
  const candidates = [];
  for (const delimiter of CSV_DELIMITERS) {
    let rows;
    try { rows = parseCsvRows(source, delimiter, options); } catch { continue; }
    const widths = rows.filter((row) => options.preserveRecords !== true || row.length !== 1 || row[0] !== '')
      .map((row) => row.length).filter((width) => width > 0);
    const maxWidth = widths.reduce((maximum, width) => Math.max(maximum, width), 0);
    const consistent = maxWidth > 1 && widths.length > 0 && widths.every((width) => width === maxWidth);
    candidates.push({ delimiter, maxWidth, consistent });
  }
  const viable = candidates.filter((candidate) => candidate.consistent);
  if (!viable.length) return { delimiter: ',', rows: parseCsvRows(source, ',', options) }; // RFC-4180-compatible one-column data.
  viable.sort((left, right) => right.maxWidth - left.maxWidth);
  if (viable.length > 1 && viable[0].maxWidth === viable[1].maxWidth) {
    throw new Error('CSV_DELIMITER_AMBIGUOUS');
  }
  return { delimiter: viable[0].delimiter, rows: parseCsvRows(source, viable[0].delimiter, options) };
}

function csvDelimiter(source) {
  return parseCsvDialect(source).delimiter;
}

function csvMarkdownCell(value) {
  // Markdown, not CSV/XLSX, is the only output. Formula-looking source remains
  // literal text; this serializer never evaluates it or produces a spreadsheet.
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/\\/gu, '\\\\')
    .replace(/\|/gu, '\\|')
    .replace(/\n/gu, '<br>');
}

function csvToMarkdown(source) {
  const normalizedSource = normalizeText(String(source || '')).replace(/\r\n?/gu, '\n');
  const { rows } = parseCsvDialect(normalizedSource);
  if (!rows.length) throw new Error('CSV_EMPTY');
  const width = rows[0].length;
  if (width < 1 || rows.some((row) => row.length !== width)) throw new Error('CSV_ROW_WIDTH_INVALID');
  const seen = new Map();
  const headers = rows[0].map((header, index) => {
    const base = String(header).trim() || `Spalte ${index + 1}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
  const table = [
    `| ${headers.map(csvMarkdownCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.slice(1).map((row) => `| ${row.map(csvMarkdownCell).join(' | ')} |`)
  ];
  return `# Tabelleninhalt\n\n${table.join('\n')}`;
}

function normalized(result, ext) {
  const { sections = [], ...rest } = result;
  const clean = (text) => normalizeText(text).replace(/\r\n?/gu, '\n');
  const value = { ...rest, markdown: clean(rest.markdown) };
  const normalizedSections = sections.map((section) => ({ ...section, markdown: clean(section.markdown) }));
  return {
    ...value,
    content_graph: createContentGraph(value.markdown, value.attachments, ext, normalizedSections)
  };
}

function parseDocumentBuffer(buffer, ext) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('parser input must be a buffer');
  if (['.docx', '.xlsx', '.pptx'].includes(ext)) return normalized(parseOoxml(buffer, ext), ext);
if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
    return normalized({ markdown: decodeUtf8Source(buffer), attachments: [], warnings: [] }, ext);
  }
  if (ext === '.csv') {
    return normalized({ markdown: csvToMarkdown(decodeUtf8Source(buffer)), attachments: [], warnings: [] }, ext);
  }
  if (['.png', '.jpg', '.jpeg', '.bmp'].includes(ext)) {
    const mimeType = ext === '.png' ? 'image/png' : ext === '.bmp' ? 'image/bmp' : 'image/jpeg';
    return normalized({
      markdown: '# Bildinhalt\n\n> Der fachliche Bildtext wird lokal per OCR extrahiert und durch dieselbe Datenschutzprüfung verarbeitet.',
      attachments: [{
        type: 'image', mimeType, data: buffer.toString('base64'),
        name: `local-image${ext}`, extension: ext.slice(1), source_part: 'standalone-image'
      }],
      warnings: [],
      requiresExplicitProfile: true
    }, ext);
  }
  throw new Error('unsupported_format');
}

module.exports = {
  FORBIDDEN_TEXT_CONTROLS,
  CSV_DELIMITERS,
  decodeUtf8Source,
  parseCsvRows,
  parseCsvDialect,
  csvDelimiter,
  csvMarkdownCell,
  csvToMarkdown,
  parseDocumentBuffer
};
