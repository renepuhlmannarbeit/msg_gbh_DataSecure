'use strict';

const { readXml } = require('./xml-reader');
const MAIN_NS = new Set(['http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  'http://purl.oclc.org/ooxml/spreadsheetml/main']);
const REL_NS = ['http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  'http://purl.oclc.org/ooxml/officeDocument/relationships'];
const PACKAGE_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

function structureError(limit = false) {
  const error = new Error(limit ? 'XLSX-Struktur überschreitet die sichere Verarbeitungsgrenze.'
    : 'XLSX-Struktur ist nicht eindeutig lesbar; Verarbeitung wird blockiert.');
  error.code = limit ? 'XLSX_STRUCTURE_LIMIT' : 'XLSX_STRUCTURE_UNSAFE';
  return error;
}
const attr = (node, name, namespace = '') => node.attributes.get(`{${namespace}}${name}`);

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
  function worksheet(xml, shared) {
    const rows = [];
    let row = null, cell = null, field = null, previousRow = 0, cellCount = 0, chars = 0, formulaCells = 0;
    function rowNumber(value) {
      if (!/^[1-9][0-9]*$/u.test(value) || Number(value) > 1048576) throw structureError();
      return Number(value);
    }
    const root = parse(xml, {
      start(node) {
        if (main(node, 'row') && main(node.parent, 'sheetData') && main(node.parent.parent, 'worksheet')) {
          const explicit = attr(node, 'r');
          row = { node, number: explicit === undefined ? previousRow + 1 : rowNumber(explicit), explicit: explicit !== undefined, values: [], columns: new Set(), next: 0 };
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
          cell = { node, index, type: attr(node, 't'), value: null, formula: null, inline: [], fields: new Set() };
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
          if (cell.formula !== null) {
            formulaCells++;
            if (options.preserveText && cell.formula) value = `Formel: ${cell.formula}\nGespeicherter Wert: ${value}`;
          }
          row.values[cell.index] = value;
          cell = null;
        }
        if (row?.node === node) {
          if (row.number <= previousRow || row.number > 1048576) throw structureError();
          previousRow = row.number;
          if (options.preserveText) rows[row.number - 1] = row.values;
          else if (row.values.some(value => value.trim())) rows.push(row.values);
          row = null;
        }
      }
    });
    expect(root, 'worksheet');
    return { rows, formulaCells };
  }
  return { validate: parse, workbook, relationships, sharedStrings, worksheet };
}

module.exports = Object.freeze({ createXlsxReader });
