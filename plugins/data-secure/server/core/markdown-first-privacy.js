'use strict';

const { createSourceExtraction, validateSourceExtractionForOptions, SourceExtractionError, exactKeys } = require('./source-extraction-contract');
const { contentOptionsForConsumer, validateContentOptions } = require('./content-options');
const { isPersonFieldLabel, CONTENT_PERSON_FIELD_POLICY } = require('./person-field-policy');
const { types } = require('node:util');
const { RESOURCE_LIMITS } = require('../resource-limits');

const WIDE_EXTENSIONS = new Set(['.xlsx', '.pptx', '.pdf', '.png', '.jpg', '.jpeg', '.bmp']);
const STANDALONE_EXTENSIONS = new Set(['.docx', ...WIDE_EXTENSIONS]);
const CONTENT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.csv', ...STANDALONE_EXTENSIONS]);
// Cowork deliberately starts with the Office formats already handled by the
// shipped isolated parser. PDF/OCR needs a separately packaged and proven
// runtime and therefore remains outside this release boundary.
const COWORK_EXTENSIONS = new Set(['.xlsx', '.pptx']);
const SOURCE_TYPE_BY_EXTENSION = Object.freeze({
  '.txt': 'txt', '.md': 'md', '.markdown': 'md', '.csv': 'csv',
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

function sensitiveTableHeaderPlan(markdown, literalHeaders) {
  const source = String(markdown || '');
  const sourceLines = source.split('\n');
  // The direct OOXML parser separates rendered table rows with one empty
  // Markdown line. Compact only blanks between two table rows so the privacy
  // table grammar sees the same structure as the Standalone converter while
  // all non-table whitespace remains untouched.
  // Line ordinals, not per-character maps or duplicate line objects, retain
  // exact origin identities while keeping the existing bounded text budget.
  const lines = sourceLines.map((_line, index) => index).filter(index => !(sourceLines[index].trim() === '' &&
    markdownCells(sourceLines[index - 1]) && markdownCells(sourceLines[index + 1])));
  for (let index = 0; index + 2 < lines.length; index++) {
    const generated = markdownCells(sourceLines[lines[index]]);
    const separator = markdownCells(sourceLines[lines[index + 1]]);
    const sourceHeader = markdownCells(sourceLines[lines[index + 2]]);
    if (!generated || !separator || !sourceHeader || generated.length !== separator.length ||
      generated.length !== sourceHeader.length) continue;
    if (!generated.every((value, column) => value === `Spalte ${column + 1}`) ||
      !separator.every((value) => /^:?-{3,}:?$/u.test(value))) continue;
    // Detect only the visible label of our own literal cell serializer. Keep
    // the original header line unchanged; this view is never source output.
    const label = value => literalHeaders ? require('../privacy/base').normalizeText(value.replace(/&#32;|&#9;|&#13;|<br>/gu,
      encoded => ({ '&#32;': ' ', '&#9;': '\t', '&#13;': '\r', '<br>': '\n' })[encoded])).trim() : value;
    if (!sourceHeader.some(value => EXPLICIT_SENSITIVE_HEADER.test(label(value)) ||
        literalHeaders && isPersonFieldLabel(label(value), CONTENT_PERSON_FIELD_POLICY))) continue;
    lines[index] = lines[index + 2];
    lines.splice(index + 2, 1);
  }
  return { source, sourceLines, lines, markdown: lines.map(index => sourceLines[index]).join('\n') };
}

function promoteExplicitSensitiveTableHeaders(markdown, literalHeaders = false) {
  return sensitiveTableHeaderPlan(markdown, literalHeaders).markdown;
}

function remapTableOcrContacts(plan, contacts, sourceType) {
  const { validateContacts } = require('./ocr-contact-review');
  validateContacts(contacts, plan.source, sourceType);
  let lineIndex = 0, sourceStart = 0;
  const located = contacts.map(contact => {
    // Contacts are validated in source order and never cross a line. Retained
    // line ordinals carry exact UTF-16 provenance even when a header is moved.
    // No search by value: identical contacts/images must remain distinct.
    while (lineIndex < plan.sourceLines.length &&
        sourceStart + plan.sourceLines[lineIndex].length <= contact.start) {
      sourceStart += plan.sourceLines[lineIndex].length + 1;
      lineIndex++;
    }
    const line = plan.sourceLines[lineIndex];
    if (line === undefined || contact.start < sourceStart ||
        contact.end > sourceStart + line.length) throw new SourceExtractionError('OCR_CONTACT_REVIEW_INVALID');
    return { contact, lineIndex, sourceStart };
  });
  // Only contact-bearing source lines need a target entry (at most 5,000),
  // independently of the number of unrelated source lines.
  const targetStarts = new Map(located.map(item => [item.lineIndex, undefined]));
  let targetStart = 0;
  for (const index of plan.lines) {
    if (targetStarts.has(index)) targetStarts.set(index, targetStart);
    targetStart += plan.sourceLines[index].length + 1;
  }
  const remapped = located.map(({ contact, lineIndex: originalLine, sourceStart: originalStart }) => {
    const target = targetStarts.get(originalLine);
    if (target === undefined) throw new SourceExtractionError('OCR_CONTACT_REVIEW_INVALID');
    const delta = target - originalStart;
    const mapped = { ...contact, start: contact.start + delta, end: contact.end + delta };
    if (plan.markdown.slice(mapped.start, mapped.end) !== plan.source.slice(contact.start, contact.end)) {
      throw new SourceExtractionError('OCR_CONTACT_REVIEW_INVALID');
    }
    return Object.freeze(mapped);
  }).sort((left, right) => left.start - right.start);
  // Deleted generated lines cannot silently discard an OCR corridor. Moving a
  // real header can reorder corridors; the unchanged strict validator checks
  // the complete output map again, including overlap and private image limits.
  validateContacts(remapped, plan.markdown, sourceType);
  return Object.freeze(remapped);
}

function extensionsForChannel(productChannel) {
  return productChannel === 'standalone' ? STANDALONE_EXTENSIONS
    : productChannel === 'plugin' ? COWORK_EXTENSIONS : new Set();
}

function isWidePrivacyExtension(extension) {
  return WIDE_EXTENSIONS.has(String(extension || '').toLowerCase());
}

function isMarkdownFirstPrivacyExtension(extension, productChannel = 'standalone', contentOptions) {
  if (contentOptions !== undefined) {
    assertDataGraph(contentOptions);
    validateContentOptions(contentOptions);
    if (productChannel !== 'standalone') throw Object.assign(new Error('CONTENT_OPTIONS_FORBIDDEN'), { code: 'CONTENT_OPTIONS_FORBIDDEN' });
  }
  return (contentOptions ? CONTENT_EXTENSIONS : extensionsForChannel(productChannel))
    .has(typeof extension === 'string' ? extension.toLowerCase() : '');
}

// Adapter guard before pure decoders: never execute getters/proxy traps on an
// injected converter response. The finite graph is plain immutable JSON data;
// callbacks/AbortSignal in the options envelope are deliberately not traversed.
function assertDataGraph(value) {
  const pending = [value]; let nodes = 0;
  while (pending.length) {
    const next = pending.pop();
    if (!next || typeof next !== 'object') {
      if (typeof next === 'function' || typeof next === 'symbol' || typeof next === 'bigint') throw new SourceExtractionError();
      continue;
    }
    if (++nodes > 100_000 || types.isProxy(next)) throw new SourceExtractionError();
    const array = Array.isArray(next), prototype = Object.getPrototypeOf(next);
    if (array ? prototype !== Array.prototype : ![Object.prototype, null].includes(prototype)) throw new SourceExtractionError();
    const descriptors = Object.getOwnPropertyDescriptors(next);
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value') ||
          (!descriptor.enumerable && !(array && key === 'length'))) throw new SourceExtractionError();
      if (key !== 'length' || !array) pending.push(descriptor.value);
    }
  }
}

function privacyConsumerOptions(options) {
  if (!options || typeof options !== 'object' || types.isProxy(options) || Array.isArray(options) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(options))) throw new SourceExtractionError();
  const descriptors = Object.getOwnPropertyDescriptors(options);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' ||
      !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) throw new SourceExtractionError();
  if (descriptors.contentOptions) assertDataGraph(descriptors.contentOptions.value);
  if (descriptors.contentOptions && Reflect.ownKeys(descriptors).some(key => ![
    'contentOptions', 'productChannel', 'ErrorType', 'convertBuffer', 'convertDocument', 'signal', 'timeoutMs'
  ].includes(key))) throw new SourceExtractionError();
  const productChannel = descriptors.productChannel ? descriptors.productChannel.value : 'standalone';
  if (!['standalone', 'plugin'].includes(productChannel)) throw new SourceExtractionError();
  return { productChannel, contentOptions: contentOptionsForConsumer(options, productChannel) };
}

function csvPrivacyMarkdown(bytes) {
  if (bytes.length > RESOURCE_LIMITS.MAX_CSV_SOURCE_BYTES) throw Object.assign(new Error('INPUT_FORMAT_LIMIT'), { code: 'INPUT_FORMAT_LIMIT' });
  const { decodeUtf8Source, parseCsvDialect } = require('../document-parser');
  const { literalTableCell } = require('./markdown-literal-content');
  try {
    const { rows } = parseCsvDialect(decodeUtf8Source(bytes), { preserveRecords: true });
    if (!rows.length) throw new Error('CSV_EMPTY');
    const width = rows[0].length;
    if (rows.some(row => row.length !== width && !(row.length === 1 && row[0] === ''))) throw new Error('CSV_ROW_WIDTH_INVALID');
    const lines = []; let chars = 0;
    const append = line => {
      chars += line.length + 1;
      if (chars > RESOURCE_LIMITS.MAX_TEXT_CHARS) throw new Error('TEXT_TOO_LARGE');
      lines.push(line);
    };
    const row = values => '| ' + Array.from({ length: width }, (_, column) => literalTableCell(values[column] ?? '', true)).join(' | ') + ' |';
    // Privacy semantics use the actual first record as header. Never trim,
    // normalize, deduplicate, synthesize labels or discard blank data records.
    append(row(rows[0])); append('| ' + Array.from({ length: width }, () => '---').join(' | ') + ' |');
    for (const values of rows.slice(1)) append(row(values));
    return lines.join('\n');
  } catch (error) {
    const code = new Set(['CSV_EMPTY', 'CSV_ROW_WIDTH_INVALID', 'CSV_QUOTE_INVALID', 'CSV_DELIMITER_AMBIGUOUS',
      'TEXT_TOO_LARGE', 'TEXT_ENCODING_INVALID', 'TEXT_CONTROL_INVALID']).has(error.message) ? error.message : 'SOURCE_EXTRACTION_INVALID';
    throw new SourceExtractionError(code);
  }
}

function immutableData(value) {
  if (!value || typeof value !== 'object') return value;
  const copy = Array.isArray(value) ? value.map(immutableData)
    : Object.fromEntries(Object.entries(value).map(([key, field]) => [key, immutableData(field)]));
  return Object.freeze(copy);
}

function validatePrivacyExtractionForOptions(value, expectedOptions, expectedSourceType) {
  assertDataGraph(value);
  assertDataGraph(expectedOptions);
  const keys = ['markdown', 'warnings', 'attachments', 'unreviewedVisualCount', 'requiresExplicitProfile',
    'sourceType', 'sourceExtractionCoverage', 'sourceExtraction'];
  if (Object.hasOwn(value || {}, 'ocrContacts')) keys.push('ocrContacts');
  if (Object.hasOwn(value || {}, 'privateDocumentMetadata')) keys.push('privateDocumentMetadata');
  if (!expectedOptions || !exactKeys(value, keys) || value.unreviewedVisualCount !== 0 || value.requiresExplicitProfile !== false ||
      !Array.isArray(value.warnings) || value.warnings.length || !Array.isArray(value.attachments) || value.attachments.length) throw new SourceExtractionError();
  const source = validateSourceExtractionForOptions(value.sourceExtraction, RESOURCE_LIMITS.MAX_TEXT_CHARS, expectedOptions);
  if (source.source_type !== expectedSourceType || value.sourceType !== source.source_type || source.markdown !== value.markdown ||
      JSON.stringify(source.coverage) !== JSON.stringify(value.sourceExtractionCoverage)) throw new SourceExtractionError();
  if (Object.hasOwn(value, 'ocrContacts')) require('./ocr-contact-review').validateContacts(value.ocrContacts, source.markdown, source.source_type);
  if (source.coverage.reason_codes.includes('OCR_CONTACT_VALUES_UNVERIFIED') !== Boolean(value.ocrContacts?.length)) throw new SourceExtractionError();
  if (Object.hasOwn(value, 'privateDocumentMetadata')) {
    if (source.source_type !== 'pdf') throw new SourceExtractionError();
    require('./private-document-metadata').validatePrivateDocumentMetadata(value.privateDocumentMetadata);
  }
  return immutableData(value);
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
  const { productChannel, contentOptions } = privacyConsumerOptions(options);
  const ErrorType = options.ErrorType || Error;
  const normalizedExtension = typeof extension === 'string' ? extension.toLowerCase() : '';
  if (!Buffer.isBuffer(bytes) || !isMarkdownFirstPrivacyExtension(normalizedExtension, productChannel, contentOptions)) {
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
      ...(contentOptions ? { contentOptions } : {}),
      ...(normalizedExtension === '.docx' && !contentOptions ? { omitDocxHeaderFooter: true } : {}),
      ...(['.pdf', '.pptx'].includes(normalizedExtension) ? { passiveObjects: true } : {}),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
    });
    assertDataGraph(extraction);
    const { validateMarkdownExtractionForOptions } = require('../standalone/markdown-contract');
    validateMarkdownExtractionForOptions(extraction, contentOptions);
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
  const tablePlan = ['docx', 'xlsx', 'pptx'].includes(expectedType)
    ? sensitiveTableHeaderPlan(extraction.markdown, Boolean(contentOptions)) : null;
  const privacyMarkdown = contentOptions && expectedType === 'csv' ? csvPrivacyMarkdown(bytes)
    : tablePlan ? tablePlan.markdown : extraction.markdown;
  const ocrContacts = productChannel === 'standalone' && extraction.ocr_contacts
    ? tablePlan ? remapTableOcrContacts(tablePlan, extraction.ocr_contacts, expectedType) : extraction.ocr_contacts : undefined;
  const neutral = createSourceExtraction({ source_type: expectedType,
    markdown: privacyMarkdown, coverage, ...(contentOptions ? { content_options: contentOptions } : {}) }, RESOURCE_LIMITS.MAX_TEXT_CHARS);
  if (!neutral.markdown.trim() || neutral.coverage.reason_codes.includes('OCR_TEXT_EMPTY')) {
    throw coverageFailure(ErrorType);
  }
  const result = Object.freeze({
    markdown: neutral.markdown,
    warnings: Object.freeze([]),
    attachments: Object.freeze([]),
    unreviewedVisualCount: 0,
    requiresExplicitProfile: false,
    sourceType: neutral.source_type,
    sourceExtractionCoverage: neutral.coverage,
    ...(contentOptions ? { sourceExtraction: neutral,
      ...(extraction.private_document_metadata ? { privateDocumentMetadata: extraction.private_document_metadata } : {}) } : {}),
    ...(ocrContacts ? { ocrContacts } : {})
  });
  return contentOptions ? validatePrivacyExtractionForOptions(result, contentOptions, expectedType) : result;
}

module.exports = Object.freeze({
  WIDE_EXTENSIONS,
  STANDALONE_EXTENSIONS,
  COWORK_EXTENSIONS,
  isWidePrivacyExtension,
  isMarkdownFirstPrivacyExtension,
  extractSourceForPrivacy,
  validatePrivacyExtractionForOptions,
  promoteExplicitSensitiveTableHeaders
});
