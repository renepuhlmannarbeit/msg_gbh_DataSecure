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

function structureError(limit = false) {
  const error = new Error(limit ? 'XLSX-Struktur überschreitet die sichere Verarbeitungsgrenze.'
    : 'XLSX-Struktur ist nicht eindeutig lesbar; Verarbeitung wird blockiert.');
  error.code = limit ? 'XLSX_STRUCTURE_LIMIT' : 'XLSX_STRUCTURE_UNSAFE';
  return error;
}
const attr = (node, name, namespace = '') => node.attributes.get(`{${namespace}}${name}`);

function commentXstring(value) {
  // Only the schema-typed modern-comment ST_Xstring fields use this Office
  // layer, after XML decoding and before Markdown/privacy. One replacement
  // pass preserves _x005F_xHHHH_ as a literal _xHHHH_, never a second escape.
  const decoded = value.replace(/_x([0-9a-fA-F]{4})_/gu,
    (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  // Escapes must not bypass the existing source-character policy (including
  // C0/C1, unpaired UTF-16 surrogates and XML noncharacters).
  assertXmlCharacters(decoded, structureError);
  return decoded;
}

function createXlsxReader(decode, options = {}) {
  // Namespace-free fixtures belong to the legacy development parser only.
  // The standalone preservation path always resolves canonical namespaces.
  const main = (node, localName) => Boolean(node && node.localName === localName &&
    (MAIN_NS.has(node.namespaceURI) || (!options.preserveText && node.namespaceURI === '')));
  const parse = (xml, events = {}) => readXml(xml, { decode, error: structureError, ...events });
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
  function sharedStrings(xml) {
    const result = [];
    let item = null, chunks = [], chars = 0;
    const root = parse(xml, {
      start(node) { if (main(node, 'si') && main(node.parent, 'sst')) { item = node; chunks = []; } },
      text(value, node) {
        if (item && richText(node, item)) {
          chars += value.length; if (chars > 8000000) throw structureError(true);
          chunks.push(value);
        }
      },
      end(node) { if (node === item) { if (result.length >= 200000) throw structureError(true); result.push(chunks.join('')); item = null; } }
    });
    expect(root, 'sst');
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
      result.set(id, commentXstring(name));
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
        ref: comment.ref, author: comment.author, text: commentXstring(chunks.join('')) }); comment = null; } }
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
    const rows = [], rowRecords = [], columnStyles = [];
    let row = null, cell = null, field = null, previousRow = 0, cellCount = 0, chars = 0, formulaCells = 0,
      missingFormulaCaches = 0, unsupportedNumberFormats = 0;
    function rowNumber(value) {
      if (!/^[1-9][0-9]*$/u.test(value) || Number(value) > 1048576) throw structureError();
      return Number(value);
    }
    const root = parse(xml, {
      start(node) {
        if (options.contentMode && main(node, 'col') && main(node.parent, 'cols') && main(node.parent.parent, 'worksheet')) {
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
          cell = { node, index, type: attr(node, 't'), style: style === undefined ? (row.style ?? columnStyles[index] ?? 0) : Number(style),
            value: null, formula: null, inline: [], fields: new Set() };
        } else if (cell && node.parent === cell.node && (main(node, 'v') || main(node, 'f') || main(node, 'is'))) {
          if (cell.fields.has(node.localName)) throw structureError();
          cell.fields.add(node.localName);
          if (main(node, 'is')) cell.inlineNode = node;
          else field = { node, chunks: [] };
        }
      },
      text(value, node) {
        if (field && node === field.node) { field.chunks.push(value); chars += value.length; }
        else if (cell?.inlineNode && richText(node, cell.inlineNode)) { cell.inline.push(value); chars += value.length; }
        if (chars > 8000000) throw structureError(true);
      },
      end(node) {
        if (field?.node === node) {
          cell[main(node, 'f') ? 'formula' : 'value'] = field.chunks.join(''); field = null;
        }
        if (cell?.node === node) {
          let value = cell.value ?? '';
          if (cell.type === 's' && cell.value !== null) {
            if (!/^[0-9]+$/u.test(value) || !Object.hasOwn(shared, Number(value))) {
              const error = new Error('XLSX-Zeichenkettenverweis ist ungültig.'); error.code = 'XLSX_SHARED_STRING_INVALID'; throw error;
            }
            value = shared[Number(value)];
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
    return { rows, rowRecords, formulaCells, missingFormulaCaches, unsupportedNumberFormats };
  }
  return { validate: parse, workbook, workbookProperties, styles, relationships, sharedStrings, worksheet, modernPersons, threadedComments };
}

module.exports = Object.freeze({ createXlsxReader });
