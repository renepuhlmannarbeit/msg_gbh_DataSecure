'use strict';

// Pure, standalone-only OOXML serialization. This module neither opens files
// nor discovers identities: its sole authority is the validated overview.
// Excel limits: https://support.microsoft.com/en-us/excel/excel-specifications-and-limits
// inlineStr: https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.cell
// Xstring: https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/bd0aa042-434a-4ca7-b25f-4e1fd25a954d
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { renderConfidentialOverview, MAX_BYTES: MAX_OVERVIEW_BYTES } = require('./confidential-overview');

const MAX_WORKBOOK_BYTES = 16 * 1024 * 1024;
const MAX_WORKBOOK_EXPANDED_BYTES = 64 * 1024 * 1024;
const MAX_CELL_UNITS = 32767, MAX_CELL_LFS = 253, MAX_SHEET_ROWS = 1048576;
const SS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const TYPES = Object.freeze({ PERSON: 'Person', ORGANIZATION: 'Unternehmen-Organisation', PROJECT: 'Projekt' });
const fail = (code = 'CONFIDENTIAL_WORKBOOK_INVALID') => Object.assign(Error(code), { code });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const lfs = value => (value.match(/\n/gu) || []).length;

// Match TXT's unambiguous JSON-quoted variant list, but leave a sole original
// raw. The count belongs to the whole validated entry, never to each variant.
function mappingOriginals(entry) {
  if (entry.originals.length === 1) return entry.originals[0];
  return entry.originals.map(value => JSON.stringify(value).replace(/[\p{Cf}\u2028\u2029]/gu,
    character => character.split('').map(unit => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''))).join(' / ');
}

// Snapshot plain data, not accessors, toJSON methods, Buffers, prototypes or
// renderer callbacks. This also prevents a changing object from supplying a
// different vector after validation. Proxy side effects are not an authority
// boundary; callers must still supply their private controlled data model.
function dataSnapshot(value) {
  let nodes = 0, bytes = 0;
  function clone(item, depth) {
    if (++nodes > 2000000 || depth > 8) throw fail('CONFIDENTIAL_WORKBOOK_LIMIT');
    if (typeof item === 'string') {
      bytes += Buffer.byteLength(item) + 2;
      if (bytes > MAX_OVERVIEW_BYTES) throw fail('CONFIDENTIAL_WORKBOOK_LIMIT');
      return item;
    }
    if (item === null || typeof item === 'boolean' || typeof item === 'number' && Number.isSafeInteger(item)) return item;
    if (!item || typeof item !== 'object') throw fail();
    const array = Array.isArray(item), proto = Object.getPrototypeOf(item);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw fail();
    const descriptors = Object.getOwnPropertyDescriptors(item), keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value'))) throw fail();
    if (array) {
      const length = descriptors.length.value;
      if (!Number.isSafeInteger(length) || length > 1048576 || keys.length !== length + 1 ||
          keys.some(key => key !== 'length' && (!/^(?:0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length))) throw fail();
      const result = [];
      for (let i = 0; i < length; i++) result.push(clone(descriptors[i].value, depth + 1));
      return result;
    }
    const result = Object.create(null);
    for (const key of keys) {
      if (!descriptors[key].enumerable) throw fail();
      bytes += Buffer.byteLength(key) + 3;
      if (bytes > MAX_OVERVIEW_BYTES) throw fail('CONFIDENTIAL_WORKBOOK_LIMIT');
      result[key] = clone(descriptors[key].value, depth + 1);
    }
    return result;
  }
  return clone(value, 0);
}

function xmlText(value) {
  // Escape literal Xstring syntax before emitting real control escapes. Do not
  // normalize Unicode, prefix apostrophes, or strip formula-looking content.
  // Look ahead rather than consume the token: its final underscore can also
  // begin another literal escape (for example "_x005F_x0000_").
  return value.replace(/_(?=x[0-9a-f]{4}_)/giu, '_x005F_')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\ufffe\uffff]/gu,
      character => `_x${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}_`)
    .replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

function splitLongValue(value) {
  const parts = [];
  let start = 0, units = 0, linefeeds = 0;
  for (let at = 0; at < value.length;) {
    const size = value.codePointAt(at) > 0xffff ? 2 : 1, newline = value[at] === '\n' ? 1 : 0;
    if (units + size > MAX_CELL_UNITS || linefeeds + newline > MAX_CELL_LFS) {
      parts.push(value.slice(start, at)); start = at; units = 0; linefeeds = 0;
    }
    units += size; linefeeds += newline; at += size;
  }
  parts.push(value.slice(start));
  return parts;
}

const CRC_TABLE = Object.freeze(Array.from({ length: 256 }, (_, initial) => {
  let n = initial;
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1;
  return n >>> 0;
}));
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}

function packageBuilder() {
  let expanded = 0, localBytes = 0;
  const locals = [], central = [], names = new Set();
  function appendPart(name, produce) {
    if (names.has(name) || names.size >= 208 || !/^(?:\[Content_Types\]\.xml|[A-Za-z0-9_./]+)$/u.test(name)) throw fail();
    names.add(name);
    const buffers = [], strings = [];
    let pending = 0, size = 0;
    function flush() {
      if (strings.length) { buffers.push(Buffer.from(strings.join(''), 'utf8')); strings.length = 0; pending = 0; }
    }
    const write = text => {
      const bytes = Buffer.byteLength(text);
      expanded += bytes; size += bytes; pending += bytes;
      if (expanded > MAX_WORKBOOK_EXPANDED_BYTES) throw fail('CONFIDENTIAL_WORKBOOK_LIMIT');
      strings.push(text);
      if (pending >= 65536) flush();
    };
    produce(write); flush();
    const raw = Buffer.concat(buffers, size), deflated = zlib.deflateRawSync(raw, { level: 9 });
    const compressed = deflated.length < raw.length ? deflated : raw, method = compressed === raw ? 0 : 8;
    const nameBytes = Buffer.from(name, 'utf8'), crc = crc32(raw);
    if (localBytes + 30 + nameBytes.length + compressed.length > MAX_WORKBOOK_BYTES) throw fail('CONFIDENTIAL_WORKBOOK_LIMIT');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8); local.writeUInt16LE(0x21, 12); // 1980-01-01, no current clock.
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(0x0314, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(method, 10); directory.writeUInt16LE(0x21, 14);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(raw.length, 24);
    directory.writeUInt16LE(nameBytes.length, 28); directory.writeUInt32LE(0o100644 * 65536, 38);
    directory.writeUInt32LE(localBytes, 42);
    locals.push(local, nameBytes, compressed); central.push(directory, nameBytes);
    localBytes += local.length + nameBytes.length + compressed.length;
  }
  return {
    part(name, text) { appendPart(name, write => write(text)); },
    appendPart,
    finish() {
      const directoryBytes = central.reduce((sum, item) => sum + item.length, 0);
      const size = localBytes + directoryBytes + 22;
      if (size > MAX_WORKBOOK_BYTES) throw fail('CONFIDENTIAL_WORKBOOK_LIMIT');
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(names.size, 8); end.writeUInt16LE(names.size, 10);
      end.writeUInt32LE(directoryBytes, 12); end.writeUInt32LE(localBytes, 16);
      return Buffer.concat([...locals, ...central, end], size);
    }
  };
}

function worksheet(write, rows, widths) {
  const columns = widths.length;
  if (![3, 5].includes(columns)) throw fail();
  write(`${XML}<worksheet xmlns="${SS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>`);
  for (let i = 0; i < columns; i++) write(`<col min="${i + 1}" max="${i + 1}" width="${widths[i]}" customWidth="1"/>`);
  write('</cols><sheetData>');
  let rowIndex = 0;
  for (const row of rows) {
    if (++rowIndex > MAX_SHEET_ROWS || row.length !== columns) throw fail('CONFIDENTIAL_WORKBOOK_LIMIT');
    write(`<row r="${rowIndex}">`);
    for (let column = 0; column < columns; column++) {
      const value = row[column];
      if (columns === 5 && column === 3 && rowIndex > 1) {
        if (!Number.isSafeInteger(value) || value < 1) throw fail();
        // Explicit numeric cell + General style, not a formula or text format.
        write(`<c r="D${rowIndex}" s="2" t="n"><v>${value}</v></c>`);
        continue;
      }
      if (typeof value !== 'string' || !value.isWellFormed() || value.length > MAX_CELL_UNITS || lfs(value) > MAX_CELL_LFS) throw fail('CONFIDENTIAL_WORKBOOK_LIMIT');
      write(`<c r="${String.fromCharCode(65 + column)}${rowIndex}" s="${rowIndex === 1 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`);
    }
    write('</row>');
  }
  write('</sheetData></worksheet>');
}

function renderConfidentialWorkbook(input) {
  const overview = dataSnapshot(input);
  renderConfidentialOverview(overview); // Same closed, proven-identity schema as TXT; no marker inference.
  const binding = hash(JSON.stringify(overview)), long = [], references = new Map();
  function registerLongValue(sheet, cell, value) {
    if (value.length <= MAX_CELL_UNITS && lfs(value) <= MAX_CELL_LFS) return;
    const id = `LW${String(long.length + 1).padStart(6, '0')}`;
    const parts = splitLongValue(value), sha256 = hash(value);
    const record = { id, source_sheet: sheet, source_cell: cell, parts: parts.length,
      total_utf16: value.length, sha256 };
    long.push({ binding: record, chunks: parts });
    references.set(`${sheet}:${cell}`, `[LANGWERT ${id}: Langwerte; Teile=${parts.length}; SHA-256=${sha256}]`);
  }
  let mappingRow = 1;
  const documents = overview.documents.map((document, index) => {
    const sheet = `Dokument_${String(index + 1).padStart(3, '0')}`;
    for (const entry of document.entries) {
      if (++mappingRow > MAX_SHEET_ROWS) throw fail('CONFIDENTIAL_WORKBOOK_LIMIT');
      registerLongValue('Zuordnungen', `C${mappingRow}`, mappingOriginals(entry));
    }
    let rows = 0;
    for (const entry of document.entries) for (const original of entry.originals) {
      if (++rows >= MAX_SHEET_ROWS) throw fail('CONFIDENTIAL_WORKBOOK_LIMIT');
      registerLongValue(sheet, `B${rows + 1}`, original);
    }
    return { document, sheet, rows };
  });
  const sheets = ['Zuordnungen', 'Übersicht', ...documents.map(item => item.sheet), ...(long.length ? ['Langwerte'] : [])];
  const zip = packageBuilder();
  zip.part('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.part('_rels/.rels', `${XML}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.part('xl/workbook.xml', `${XML}<workbook xmlns="${SS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((name, index) => `<sheet name="${name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`);
  zip.part('xl/_rels/workbook.xml.rels', `${XML}<Relationships xmlns="${PKG}">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`);
  zip.part('xl/styles.xml', `${XML}<styleSheet xmlns="${SS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);

  function* mappingRows() {
    yield ['Pseudonym', 'Typ', 'Originalwert(e)', 'Vorkommen', 'Datei'];
    let row = 1;
    for (const { document } of documents) for (const entry of document.entries) {
      row++;
      yield [entry.replacement, entry.kind, references.get(`Zuordnungen:C${row}`) || mappingOriginals(entry),
        entry.occurrences, document.name];
    }
  }
  function* overviewRows() {
    yield ['Kontext', 'Wert', 'Hinweis'];
    yield ['VERTRAULICH', 'NICHT AN KI WEITERGEBEN', 'Enthält ursprüngliche Werte. Nur lokal und vertraulich verwenden.'];
    yield ['Geltungsbereich', 'Ausschließlich die genannten Dokumentrevisionen und Hashes', 'Ein gleich aussehender Marker beweist keine Identität über Dateien hinweg.'];
    yield ['Datenquelle', overview.schema, 'Nur belegte eindeutige Zuordnungen; keine aus Markertext erfundenen Identitäten.'];
    yield ['Lauf', overview.batch_id, ''];
    yield ['Standbindung SHA-256', binding, 'SHA-256 des unveränderten Overview-JSON in seiner gebundenen Reihenfolge.'];
    yield ['Zuordnungen', 'Erstes Blatt: eine Zeile je belegter Zuordnung in ihrer Datei, in derselben Reihenfolge wie TXT.', 'Pseudonym und roher Typ PERSON/ORGANIZATION/PROJECT stammen unverändert aus derselben geprüften Entitätenspur. Keine Zusammenführung über Dokumentgrenzen.'];
    yield ['Originalwert(e)', 'Ein Originalwert steht unverändert da; mehrere Varianten sind wie in TXT JSON-gequotet und durch / getrennt.', 'Anführungszeichen und Escapezeichen machen die Varianten verlustfrei unterscheidbar. Keine Normalisierung oder Zahlenkonvertierung der Identitätswerte.'];
    yield ['Vorkommen', 'Echte Excel-Zahl für die ganze Zuordnung, genau wie TXT.', 'Nicht je Originalvariante wiederholen oder vervielfachen. Nur diese Häufigkeit ist numerisch; keine Formeln, Makros oder externen Verknüpfungen.'];
    yield ['Varianten', 'Detailblätter: jede tatsächlich belegte Originalvariante hat eine eigene Zeile.', 'Typ/Basiswert/Endwert bleiben unverändert; diese Detailzeilen sind keine Vorkommenszählung.'];
    yield ['Auslassungen', 'Beibehaltene, maskierte, sonstige und mehrdeutige Werte sind keine eindeutige Zuordnung.', 'Die Anzahlen stehen je Dokument unten. Ausgeschlossene Werte werden nicht erfunden.'];
    yield ['Langwerte', long.length ? `${long.length} Wert(e); vollständige Teile auf Blatt Langwerte` : 'Keine ausgelagerten Werte', 'Referenz bindet Blatt/Zelle, Reihenfolge, UTF-16-Länge und SHA-256 (UTF-8); Teile in angegebener Reihenfolge unverändert zusammenfügen.'];
    for (const { document, sheet, rows } of documents) {
      yield [sheet, document.name, 'Dateikontext; der sichere Blattname enthält keinen Quelldateinamen.'];
      yield [`${sheet} · Dokument-ID`, document.document_id, ''];
      yield [`${sheet} · Revision`, String(document.revision), ''];
      yield [`${sheet} · Markdown SHA-256`, document.output_sha256, 'Gilt ausschließlich für diesen Dokumentstand.'];
      yield [`${sheet} · Entitätenspur`, document.trace_available ? 'vorhanden' : 'nicht verfügbar', document.trace_available ? '' : 'Keine neue Identität aus dem Text herleiten.'];
      yield [`${sheet} · Zuordnungen`, String(document.entries.length), 'Anzahl der Zuordnungszeilen im ersten Blatt für genau diese Datei.'];
      yield [`${sheet} · Originalvarianten`, String(rows), 'Anzahl der Detailzeilen, nicht Anzahl der Vorkommen.'];
      for (const [key, title] of [['kept', 'beibehalten'], ['masked', 'zusätzlich maskiert'], ['not_identity', 'keine Identität'], ['ambiguous', 'mehrdeutig']]) {
        yield [`${sheet} · ausgeschlossen`, String(document.excluded[key]), title];
      }
    }
  }
  zip.appendPart('xl/worksheets/sheet1.xml', write => worksheet(write, mappingRows(), [50, 25, 90, 14, 72]));
  zip.appendPart('xl/worksheets/sheet2.xml', write => worksheet(write, overviewRows(), [37, 85, 105]));
  for (let index = 0; index < documents.length; index++) {
    const { document, sheet } = documents[index];
    function* documentRows() {
      yield ['Typ', 'Basiswert', 'Endwert'];
      let row = 1;
      for (const entry of document.entries) for (const original of entry.originals) {
        row++;
        yield [TYPES[entry.kind], references.get(`${sheet}:B${row}`) || original, entry.replacement];
      }
    }
    zip.appendPart(`xl/worksheets/sheet${index + 3}.xml`, write => worksheet(write, documentRows(), [28, 80, 46]));
  }
  if (long.length) {
    function* longRows() {
      yield ['Referenz / Teil', 'Basiswert-Teil', 'Bindung'];
      for (const item of long) for (let part = 0; part < item.chunks.length; part++) {
        yield [`${item.binding.id}/${part + 1}/${item.binding.parts}`, item.chunks[part], JSON.stringify(item.binding)];
      }
    }
    zip.appendPart(`xl/worksheets/sheet${sheets.length}.xml`, write => worksheet(write, longRows(), [30, 95, 100]));
  }
  return zip.finish();
}

module.exports = Object.freeze({ renderConfidentialWorkbook, MAX_WORKBOOK_BYTES, MAX_WORKBOOK_EXPANDED_BYTES });
