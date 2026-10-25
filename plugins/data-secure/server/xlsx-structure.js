'use strict';

const { readXml, assertXmlCharacters } = require('./xml-reader');
const { BUILTIN, formatXlsxNumber } = require('./xlsx-number-format');
const MAIN_NS = new Set(['http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  'http://purl.oclc.org/ooxml/spreadsheetml/main']);
const REL_NS = ['http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  'http://purl.oclc.org/ooxml/officeDocument/relationships'];
const PACKAGE_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const COMMENTS_NS = 'http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments';
const GUID = /^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/iu;
const MAX_MERGE_RANGES = 200000;
const MAX_SHEET_COLUMNS = 16384;
const MAX_SHEET_ROWS = 1048576;

function structureError(limit = false) {
  const error = new Error(limit ? 'XLSX-Struktur überschreitet die sichere Verarbeitungsgrenze.'
    : 'XLSX-Struktur ist nicht eindeutig lesbar; Verarbeitung wird blockiert.');
  error.code = limit ? 'XLSX_STRUCTURE_LIMIT' : 'XLSX_STRUCTURE_UNSAFE';
  return error;
}
const attr = (node, name, namespace = '') => node.attributes.get(`{${namespace}}${name}`);

function worksheetMergeRange(reference) {
  // Only actual worksheet A1 refs, never sheet names, unions, formulas or
  // caller-authored Markdown coordinates. All model coordinates are 1-based.
  if (typeof reference !== 'string' || reference.length > 21) throw structureError();
  const match = /^([A-Z]{1,3})([1-9][0-9]*)(?::([A-Z]{1,3})([1-9][0-9]*))?$/u.exec(reference);
  if (!match) throw structureError();
  const column = letters => [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
  const start = { row: Number(match[2]), column: column(match[1]) };
  const end = { row: Number(match[4] ?? match[2]), column: column(match[3] ?? match[1]) };
  if (start.row > end.row || start.column > end.column || end.row > MAX_SHEET_ROWS ||
      end.column > MAX_SHEET_COLUMNS) throw structureError();
  return Object.freeze({ reference, start: Object.freeze(start), end: Object.freeze(end),
    anchor: Object.freeze({ reference: `${match[1]}${match[2]}`, row: start.row, column: start.column }) });
}

function disjointMergeRanges(ranges) {
  // Sweep rows with an end-row heap and a fixed 16,384-column segment tree.
  // Work is O(n log n + n log columns), independent of merged rectangle area;
  // even an entire-sheet merge never creates rows, cells or copied text.
  ranges.sort((left, right) => left.start.row - right.start.row || left.start.column - right.start.column ||
    left.end.row - right.end.row || left.end.column - right.end.column);
  if (ranges.length < 2) return Object.freeze(ranges);
  const maximum = new Int32Array(MAX_SHEET_COLUMNS * 4), lazy = new Int32Array(MAX_SHEET_COLUMNS * 4), active = [];
  function change(first, last, delta, node = 1, low = 1, high = MAX_SHEET_COLUMNS) {
    if (first <= low && high <= last) { maximum[node] += delta; lazy[node] += delta; return; }
    const middle = (low + high) >>> 1;
    if (first <= middle) change(first, last, delta, node * 2, low, middle);
    if (last > middle) change(first, last, delta, node * 2 + 1, middle + 1, high);
    maximum[node] = lazy[node] + Math.max(maximum[node * 2], maximum[node * 2 + 1]);
  }
  function occupied(first, last, node = 1, low = 1, high = MAX_SHEET_COLUMNS, inherited = 0) {
    if (first <= low && high <= last) return inherited + maximum[node] > 0;
    const middle = (low + high) >>> 1, count = inherited + lazy[node];
    return (first <= middle && occupied(first, last, node * 2, low, middle, count)) ||
      (last > middle && occupied(first, last, node * 2 + 1, middle + 1, high, count));
  }
  function insert(value) {
    let index = active.length; active.push(value);
    while (index) {
      const parent = (index - 1) >>> 1;
      if (active[parent].end.row <= value.end.row) break;
      active[index] = active[parent]; index = parent;
    }
    active[index] = value;
  }
  function remove() {
    const result = active[0], tail = active.pop();
    if (active.length) {
      let index = 0;
      while (index * 2 + 1 < active.length) {
        let child = index * 2 + 1;
        if (child + 1 < active.length && active[child + 1].end.row < active[child].end.row) child++;
        if (active[child].end.row >= tail.end.row) break;
        active[index] = active[child]; index = child;
      }
      active[index] = tail;
    }
    return result;
  }
  for (const range of ranges) {
    while (active.length && active[0].end.row < range.start.row) {
      const expired = remove(); change(expired.start.column, expired.end.column, -1);
    }
    if (occupied(range.start.column, range.end.column)) throw structureError();
    change(range.start.column, range.end.column, 1); insert(range);
  }
  return Object.freeze(ranges);
}

function schemaXstring(value, projectControl) {
  // Only actual schema-typed SpreadsheetML text/modern-comment fields use
  // this Office layer, after complete XML text assembly and before Markdown/
  // privacy. One pass preserves _x005F_xHHHH_ as literal _xHHHH_, never a
  // second escape. Cell x:v also has this schema type, but its decoded value
  // must still pass the separate cell-type interpretation. Formulas and
  // arbitrary input do not use this Office layer.
  const decoded = value.replace(/_x([0-9a-fA-F]{4})_/gu, (_, hex) => {
    const code = Number.parseInt(hex, 16);
    // ST_Xstring can carry escaped XML-inexpressible controls. This is a
    // typed cell-text projection, never permission for a raw XML control or
    // an invalid scalar. Visible boundaries avoid inventing a joined word.
    if (projectControl && ((code < 0x20 && ![9, 10, 13].includes(code)) ||
        (code >= 0x7f && code <= 0x9f))) return projectControl(code);
    return String.fromCharCode(code);
  });
  // Any explicitly projected typed controls are now safe visible text. All
  // remaining invalid characters (including unpaired UTF-16/noncharacters)
  // still fail; raw XML was validated independently before reaching here.
  assertXmlCharacters(decoded, structureError);
  return decoded;
}

function createXlsxReader(decode, options = {}) {
  // Namespace-free fixtures belong to the legacy development parser only.
  // The standalone preservation path always resolves canonical namespaces.
  const main = (node, localName) => Boolean(node && node.localName === localName &&
    (MAIN_NS.has(node.namespaceURI) || (!options.preserveText && node.namespaceURI === '')));
  const parse = (xml, events = {}) => readXml(xml, { decode, error: structureError, ...events });
  const sharedStringProjections = new WeakMap();
  const cellProjectionEnabled = options.contentMode === true && options.preserveText === true;
  const newProjection = () => ({ count: 0, codes: new Set() });
  function cellText(value, projection) {
    const rendered = schemaXstring(value, cellProjectionEnabled ? code => {
      projection.count++;
      const hex = code.toString(16).toUpperCase().padStart(4, '0');
      projection.codes.add(hex);
      return ` ⟦U+${hex}⟧ `;
    } : undefined);
    if (rendered.length > 8000000) throw structureError(true);
    return rendered;
  }
  function mergeProjection(target, source) {
    if (!source) return;
    target.count += source.count;
    for (const code of source.codes) target.codes.add(code);
  }
  function freezeProjection(projection) {
    return Object.freeze({ count: projection.count, codes: Object.freeze([...projection.codes].sort()) });
  }
  function expect(root, localName) { if (!main(root, localName)) throw structureError(); }
  function workbook(xml) {
    const sheets = [];
    const root = parse(xml, { start(node) {
      if (!main(node, 'sheet') || !main(node.parent, 'sheets') || !main(node.parent.parent, 'workbook')) return;
      const ids = REL_NS.map(namespace => attr(node, 'id', namespace)).filter(value => value !== undefined);
      if (!options.preserveText && !ids.length) ids.push(attr(node, 'id', 'r'));
      if (ids.length > 1) throw structureError();
      sheets.push({ name: attr(node, 'name') ?? 'Sheet', rid: ids[0] });
    } });
    expect(root, 'workbook');
    return sheets;
  }
  function relationships(xml) {
    const values = [];
    const root = parse(xml, { start(node) {
      if (node.localName === 'Relationship' && node.parent?.localName === 'Relationships' &&
          (node.namespaceURI === PACKAGE_NS || (!options.preserveText && node.namespaceURI === ''))) {
        values.push({ id: attr(node, 'Id'), type: attr(node, 'Type'), target: attr(node, 'Target') || '',
          external: attr(node, 'TargetMode') === 'External' });
      }
    } });
    if (root.localName !== 'Relationships' || (root.namespaceURI !== PACKAGE_NS && (options.preserveText || root.namespaceURI !== ''))) throw structureError();
    return values;
  }
  function richText(node, owner) {
    return main(node, 't') && (node.parent === owner || (main(node.parent, 'r') && node.parent.parent === owner));
  }
  function sheetDrawings(xml, kind = 'worksheet') {
    if (!['worksheet', 'chartsheet'].includes(kind)) throw structureError();
    const ids = []; let owner, issues = 0;
    const root = parse(xml, { start(node) {
      if (!node.parent) owner = node;
      if (!main(node, 'drawing')) return;
      if (node.parent !== owner || node.namespaceURI !== owner.namespaceURI) { issues++; return; }
      const values = REL_NS.map(namespace => attr(node, 'id', namespace)).filter(value => value !== undefined);
      if (values.length !== 1 || !values[0] || ids.length) throw structureError();
      ids.push(values[0]);
    } });
    expect(root, kind);
    return { ids, issues };
  }
  function sharedStrings(xml) {
    const result = [];
    const projections = new Map();
    let item = null, chunks = [], chars = 0, projectedChars = 0, currentText = null, projection = null;
    const root = parse(xml, {
      start(node) {
        // x:t is a simple ST_Xstring leaf; nested elements must not hide
        // source text or join a false escape around an unmodelled child.
        if (currentText) throw structureError();
        if (main(node, 'si') && main(node.parent, 'sst')) { item = node; chunks = []; projection = newProjection(); }
        else if (item && richText(node, item)) currentText = { node, chunks: [] };
      },
      text(value, node) {
        if (currentText?.node === node) {
          chars += value.length; if (chars > 8000000) throw structureError(true);
          currentText.chunks.push(value);
        }
      },
      end(node) {
        if (currentText?.node === node) {
          const value = currentText.chunks.join('');
          // Each separate rich-text x:t has its own typed value. Joining runs
          // before decoding would manufacture escapes across field boundaries.
          const rendered = MAIN_NS.has(node.namespaceURI) ? cellText(value, projection) : value;
          projectedChars += rendered.length;
          if (projectedChars > 8000000) throw structureError(true);
          chunks.push(rendered);
          currentText = null;
        }
        if (node === item) {
          if (result.length >= 200000) throw structureError(true);
          if (projection.count) projections.set(result.length, freezeProjection(projection));
          result.push(chunks.join('')); item = null; projection = null;
        }
      }
    });
    expect(root, 'sst');
    if (projections.size) sharedStringProjections.set(result, projections);
    return result;
  }
  function workbookProperties(xml) {
    let date1904 = false, seen = false;
    const root = parse(xml, { start(node) {
      if (!main(node, 'workbookPr') || !main(node.parent, 'workbook')) return;
      if (seen) throw structureError(); seen = true;
      const value = attr(node, 'date1904');
      if (value !== undefined && !['0', '1', 'true', 'false'].includes(value)) throw structureError();
      date1904 = value === '1' || value === 'true';
    } });
    expect(root, 'workbook'); return { date1904 };
  }
  function styles(xml) {
    const formats = new Map(BUILTIN), cellXfs = [], baseXfs = [];
    const uint = value => { if (!/^[0-9]+$/u.test(value) || Number(value) > 65535) throw structureError(); return Number(value); };
    const customIds = new Set();
    const root = parse(xml, { start(node) {
      if (main(node, 'numFmt') && main(node.parent, 'numFmts') && main(node.parent.parent, 'styleSheet')) {
        const id = uint(attr(node, 'numFmtId') || ''), code = attr(node, 'formatCode');
        if (customIds.has(id) || code === undefined) throw structureError();
        if (customIds.size >= 4096 || code.length > 512) throw structureError(true);
        // Built-in IDs have language-dependent definitions; an explicit source
        // code is authoritative, not an assumed host UI language.
        formats.set(id, code); customIds.add(id);
      }
      if (main(node, 'xf') && (main(node.parent, 'cellXfs') || main(node.parent, 'cellStyleXfs')) &&
          main(node.parent.parent, 'styleSheet')) {
        const list = main(node.parent, 'cellXfs') ? cellXfs : baseXfs;
        if (list.length >= 65536) throw structureError(true);
        const apply = attr(node, 'applyNumberFormat');
        if (apply !== undefined && !['0', '1', 'true', 'false'].includes(apply)) throw structureError();
        list.push({ numberFormatId: attr(node, 'numFmtId') === undefined ? undefined : uint(attr(node, 'numFmtId')),
          base: attr(node, 'xfId') === undefined ? undefined : uint(attr(node, 'xfId')),
          apply: apply !== '0' && apply !== 'false' });
      }
    } });
    expect(root, 'styleSheet');
    return cellXfs.map(xf => {
      if (xf.base !== undefined && !baseXfs[xf.base]) throw structureError();
      const id = xf.apply ? (xf.numberFormatId ?? baseXfs[xf.base]?.numberFormatId ?? 0)
        : (baseXfs[xf.base]?.numberFormatId ?? 0);
      return formats.get(id) ?? `NumFmtId ${id}`;
    });
  }
  function modernPersons(xml) {
    if (Buffer.byteLength(xml, 'utf8') > 2 * 1024 * 1024) throw structureError(true);
    const result = new Map();
    const root = parse(xml, { start(node) {
      if (node.namespaceURI !== COMMENTS_NS || node.localName !== 'person' ||
          node.parent?.namespaceURI !== COMMENTS_NS || node.parent.localName !== 'personList') return;
      const id = attr(node, 'id')?.toUpperCase(), name = attr(node, 'displayName');
      if (!GUID.test(id || '') || name === undefined || result.has(id)) throw structureError();
      if (result.size >= 10000 || name.length > 4096) throw structureError(true);
      result.set(id, schemaXstring(name));
    } });
    if (root.namespaceURI !== COMMENTS_NS || root.localName !== 'personList') throw structureError();
    return result;
  }
  function threadedComments(xml, persons) {
    if (Buffer.byteLength(xml, 'utf8') > 2 * 1024 * 1024 || !(persons instanceof Map)) throw structureError(true);
    const result = [], ids = new Set(); let comment = null, chunks = [], chars = 0;
    const root = parse(xml, {
      start(node) {
        if (node.namespaceURI === COMMENTS_NS && node.localName === 'threadedComment' &&
            node.parent?.namespaceURI === COMMENTS_NS && node.parent.localName === 'ThreadedComments') {
          const id = attr(node, 'id')?.toUpperCase(), personId = attr(node, 'personId')?.toUpperCase(),
            ref = attr(node, 'ref'), parentId = attr(node, 'parentId')?.toUpperCase();
          let validRef = ref === undefined;
          if (ref !== undefined) {
            const match = /^([A-Z]{1,3})([1-9][0-9]*)$/u.exec(ref); let column = 0;
            if (match) for (const letter of match[1]) column = column * 26 + letter.charCodeAt(0) - 64;
            validRef = Boolean(match && column <= 16384 && Number(match[2]) <= 1048576);
          }
          if (!GUID.test(id || '') || (parentId !== undefined && !GUID.test(parentId)) || ids.has(id) || !persons.has(personId) || !validRef) throw structureError();
          if (result.length >= 10000) throw structureError(true);
          ids.add(id); comment = { node, id, parentId, ref, author: persons.get(personId) }; chunks = [];
        }
      },
      text(value, node) {
        if (comment && node.namespaceURI === COMMENTS_NS && node.localName === 'text' && node.parent === comment.node) {
          chars += value.length; if (chars > 1000000) throw structureError(true); chunks.push(value);
        }
      },
      end(node) { if (comment?.node === node) { result.push({ id: comment.id, parentId: comment.parentId,
        ref: comment.ref, author: comment.author, text: schemaXstring(chunks.join('')) }); comment = null; } }
    });
    if (root.namespaceURI !== COMMENTS_NS || root.localName !== 'ThreadedComments') throw structureError();
    const byId = new Map(result.map(value => [value.id, value]));
    // Replies may precede their root in the XML. Resolve only after a complete
    // parse; never substitute an unrelated cell or accept a cyclic thread.
    for (const value of result) {
      let current = value, depth = 0; const seen = new Set();
      while (current.parentId) {
        if (++depth > 64 || seen.has(current.id)) throw structureError(); seen.add(current.id);
        const parent = byId.get(current.parentId); if (!parent) throw structureError();
        if (current.ref && parent.ref && current.ref !== parent.ref) throw structureError();
        current = parent;
      }
      if (!current.ref) throw structureError();
      if (value.ref && value.ref !== current.ref) throw structureError(); value.ref = current.ref;
    }
    return result;
  }
  function worksheet(xml, shared, formatting = {}) {
    const rows = [], rowRecords = [], columnStyles = [], mergeRanges = [];
    const controlCharacterProjections = [], sharedProjections = sharedStringProjections.get(shared);
    let row = null, cell = null, field = null, previousRow = 0, cellCount = 0, chars = 0, formulaCells = 0,
      missingFormulaCaches = 0, unsupportedNumberFormats = 0, mergeContainer = null, mergeNode = null,
      mergeCount, seenMerges = false, worksheetRoot = null;
    function rowNumber(value) {
      if (!/^[1-9][0-9]*$/u.test(value) || Number(value) > 1048576) throw structureError();
      return Number(value);
    }
    const root = parse(xml, {
      start(node) {
        // Both x:v (ST_Xstring) and x:f (formula text) are simple leaves.
        // Never hide child payloads or manufacture a value around a child.
        if (field || cell?.inlineText) throw structureError();
        if(!node.parent){
          if(!main(node,'worksheet'))throw structureError();
          worksheetRoot=node;
        }
        if (mergeNode || (mergeContainer && node.parent === mergeContainer && !main(node, 'mergeCell'))) throw structureError();
        if (node.localName === 'mergeCells' && node.parent === worksheetRoot) {
          if (!main(node, 'mergeCells') || node.namespaceURI !== worksheetRoot.namespaceURI || seenMerges) throw structureError();
          seenMerges = true; mergeContainer = node;
          const count = attr(node, 'count');
          if (count !== undefined) {
            if (!/^[0-9]+$/u.test(count)) throw structureError();
            if (Number(count) > MAX_MERGE_RANGES) throw structureError(true);
            mergeCount = Number(count);
          }
        } else if (main(node, 'mergeCell') && node.namespaceURI === worksheetRoot.namespaceURI && node.parent === mergeContainer) {
          if (mergeRanges.length >= MAX_MERGE_RANGES) throw structureError(true);
          mergeRanges.push(worksheetMergeRange(attr(node, 'ref'))); mergeNode = node;
        } else if (main(node, 'mergeCells') || main(node, 'mergeCell')) throw structureError();
        else if (options.contentMode && main(node, 'col') && main(node.parent, 'cols') && main(node.parent.parent, 'worksheet')) {
          const first = attr(node, 'min'), last = attr(node, 'max'), style = attr(node, 'style');
          if (style !== undefined) {
            if (!/^[1-9][0-9]*$/u.test(first || '') || !/^[1-9][0-9]*$/u.test(last || '') ||
                !/^[0-9]+$/u.test(style) || Number(first) > Number(last) || Number(last) > 16384 || Number(style) > 65535) throw structureError();
            for (let i = Number(first) - 1; i < Number(last); i++) {
              if (columnStyles[i] !== undefined) throw structureError(); columnStyles[i] = Number(style);
            }
          }
        } else if (main(node, 'row') && main(node.parent, 'sheetData') && main(node.parent.parent, 'worksheet')) {
          const explicit = attr(node, 'r');
          const style = attr(node, 's'), custom = attr(node, 'customFormat');
          if (options.contentMode && style !== undefined && (!/^[0-9]+$/u.test(style) || Number(style) > 65535)) throw structureError();
          if (options.contentMode && custom !== undefined && !['0', '1', 'true', 'false'].includes(custom)) throw structureError();
          row = { node, number: explicit === undefined ? previousRow + 1 : rowNumber(explicit), explicit: explicit !== undefined,
            style: style !== undefined && (custom === '1' || custom === 'true') ? Number(style) : undefined,
            values: [], columns: new Set(), next: 0 };
        } else if (row && main(node, 'c') && node.parent === row.node) {
          if (++cellCount > 200000) throw structureError(true);
          let index = row.next;
          const ref = attr(node, 'r');
          if (ref !== undefined) {
            const match = /^([A-Z]{1,3})([1-9][0-9]*)$/u.exec(ref);
            if (!match) throw structureError();
            index = 0; for (const letter of match[1]) index = index * 26 + letter.charCodeAt(0) - 64;
            index--;
            const number = rowNumber(match[2]);
            if (!row.explicit && !row.columns.size) row.number = number;
            if (number !== row.number) throw structureError();
          }
          if (index >= 16384) throw structureError(true);
          if (row.columns.has(index)) throw structureError();
          row.columns.add(index); row.next = index + 1;
          const style = attr(node, 's');
          if (options.contentMode && style !== undefined && (!/^[0-9]+$/u.test(style) || Number(style) > 65535)) throw structureError();
          cell = { node, index, type: attr(node, 't'), projection: newProjection(), style: style === undefined ? (row.style ?? columnStyles[index] ?? 0) : Number(style),
            value: null, formula: null, inline: [], fields: new Set() };
        } else if (cell && node.parent === cell.node && (main(node, 'v') || main(node, 'f') || main(node, 'is'))) {
          if (cell.fields.has(node.localName)) throw structureError();
          cell.fields.add(node.localName);
          if (main(node, 'is')) cell.inlineNode = node;
          else field = { node, chunks: [] };
        } else if (cell?.inlineNode && richText(node, cell.inlineNode)) cell.inlineText = { node, chunks: [] };
      },
      text(value, node) {
        if ((node === mergeNode || node === mergeContainer) && /[^ \t\r\n]/u.test(value)) throw structureError();
        if (field && node === field.node) { field.chunks.push(value); chars += value.length; }
        else if (cell?.inlineText?.node === node) { cell.inlineText.chunks.push(value); chars += value.length; }
        if (chars > 8000000) throw structureError(true);
      },
      end(node) {
        if (cell?.inlineText?.node === node) {
          const value = cell.inlineText.chunks.join('');
          cell.inline.push(MAIN_NS.has(node.namespaceURI) ? cellText(value, cell.projection) : value);
          cell.inlineText = null;
        }
        if (node === mergeNode) mergeNode = null;
        if (node === mergeContainer) {
          if (!mergeRanges.length || (mergeCount !== undefined && mergeCount !== mergeRanges.length)) throw structureError();
          mergeContainer = null;
        }
        if (field?.node === node) {
          const value = field.chunks.join(''), formula = main(node, 'f');
          cell[formula ? 'formula' : 'value'] = !formula && MAIN_NS.has(node.namespaceURI)
            ? cell.type === 'str' ? cellText(value, cell.projection) : schemaXstring(value) : value;
          field = null;
        }
        if (cell?.node === node) {
          let value = cell.value ?? '';
          if (MAIN_NS.has(node.namespaceURI) && cell.value !== null) {
            // ST_Xstring is the wire representation, not authority to turn
            // arbitrary decoded text into a Boolean/number/shared index.
            // Shared-string bounds remain checked by their own guard below;
            // number formatting still owns representability and precision.
            if (cell.type === 'b' && !['0', '1', 'true', 'false'].includes(value)) throw structureError();
            if ((cell.type === undefined || cell.type === 'n') && value !== '' &&
                !/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[Ee][+-]?[0-9]+)?$/u.test(value)) throw structureError();
          }
          if (cell.type === 's' && cell.value !== null) {
            if (!/^[0-9]+$/u.test(value) || !Object.hasOwn(shared, Number(value))) {
              const error = new Error('XLSX-Zeichenkettenverweis ist ungültig.'); error.code = 'XLSX_SHARED_STRING_INVALID'; throw error;
            }
            value = shared[Number(value)];
            mergeProjection(cell.projection, sharedProjections?.get(Number(cell.value)));
          } else if (cell.type === 'inlineStr') value = cell.inline.join('');
          if (options.contentMode && options.preserveText && formatting.styles && !['s', 'inlineStr', 'str', 'b', 'e', 'd'].includes(cell.type) && value !== '') {
            const code = formatting.styles[cell.style];
            if (code === undefined && (cell.style !== 0 || formatting.styles.length)) throw structureError();
            const formatted = formatXlsxNumber(value, code, { date1904: formatting.date1904 });
            value = formatted.text; if (formatted.unsupported) unsupportedNumberFormats++;
          }
          if (cell.formula !== null) {
            formulaCells++;
            if (cell.value === null) missingFormulaCaches++;
            if (options.contentMode && options.preserveText) value = `Formel: ${cell.formula || '(gemeinsame/Array-Formel)'}\n` +
              (cell.value === null ? 'Gespeicherter Wert fehlt; nicht berechnet.' : `Gespeicherter Wert: ${value} (nicht neu berechnet)`);
            else if (options.preserveText && cell.formula) value = `Formel: ${cell.formula}\nGespeicherter Wert: ${value}`;
          }
          row.values[cell.index] = value;
          if (cell.projection.count) {
            let column = cell.index + 1, letters = '';
            while (column) { column--; letters = String.fromCharCode(65 + column % 26) + letters; column = Math.floor(column / 26); }
            controlCharacterProjections.push(Object.freeze({ reference: `${letters}${row.number}`,
              row: row.number, column: cell.index + 1, ...freezeProjection(cell.projection) }));
          }
          cell = null;
        }
        if (row?.node === node) {
          if (row.number <= previousRow || row.number > 1048576) throw structureError();
          previousRow = row.number;
          if (row.values.some(value => value !== '')) rowRecords.push({ number: row.number, values: row.values });
          if (options.preserveText) rows[row.number - 1] = row.values;
          else if (row.values.some(value => value.trim())) rows.push(row.values);
          row = null;
        }
      }
    });
    expect(root, 'worksheet');
    return { rows, rowRecords, formulaCells, missingFormulaCaches, unsupportedNumberFormats,
      ...(controlCharacterProjections.length ? { controlCharacterProjections: Object.freeze(controlCharacterProjections) } : {}),
      mergeRanges: disjointMergeRanges(mergeRanges) };
  }
  return { validate: parse, workbook, workbookProperties, styles, relationships, sharedStrings, worksheet, sheetDrawings, modernPersons, threadedComments };
}

module.exports = Object.freeze({ createXlsxReader });
