'use strict';

// An event sink for already namespace-/MC-selected DrawingML. No regex part
// discovery, relationships, external loads or caller-provided verification.
// Keep physical continuation text too; a merge is never permission to drop it.
function createDrawingTableCollector(isDrawing, error) {
  const presentation = new Set(['http://schemas.openxmlformats.org/presentationml/2006/main',
    'http://purl.oclc.org/ooxml/presentationml/main']);
  const tables = []; let current = null, row = null, cell = null, paragraph = null, textBody = null;
  let cells = 0;
  const boolean = value => value === undefined || value === '0' || value === 'false' ? false :
    value === '1' || value === 'true' ? true : (() => { throw error(); })();
  const span = value => {
    if (value === undefined) return 1;
    if (!/^\+?[0-9]+$/u.test(value)) throw error();
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1 || number > 1024) throw error(true);
    return number;
  };
  function start(node) {
    if (!isDrawing(node.namespaceURI)) return;
    if (node.localName === 'tbl') {
      if (current) throw error();
      if(node.parent && (!isDrawing(node.parent.namespaceURI) || node.parent.localName !== 'graphicData' ||
          node.parent.attributes.get('{}uri') !== 'http://schemas.openxmlformats.org/drawingml/2006/table' ||
          !isDrawing(node.parent.parent?.namespaceURI) || node.parent.parent.localName !== 'graphic' ||
          !presentation.has(node.parent.parent.parent?.namespaceURI) || node.parent.parent.parent.localName !== 'graphicFrame')) throw error();
      current = { node, columns: 0, rows: [], firstRow: false }; return;
    }
    if (!current) return;
    const attribute = name => node.attributes.get(`{}${name}`);
    if (node.localName === 'tblPr' && node.parent === current.node) current.firstRow = boolean(attribute('firstRow'));
    if (node.localName === 'gridCol' && node.parent?.localName === 'tblGrid' && node.parent.parent === current.node) {
      if (++current.columns > 1024) throw error(true);
    }
    if (node.localName === 'tr') {
      if (row || node.parent !== current.node) throw error();
      if (current.rows.length >= 10000) throw error(true);
      row = { node, number: current.rows.length + 1, header: !current.rows.length && current.firstRow, cells: [] };
    }
    if (node.localName === 'tc') {
      if (!row || cell || node.parent !== row.node) throw error();
      if (++cells > 200000 || row.cells.length >= 1024) throw error(true);
      cell = { node, column: row.cells.length, span: span(attribute('gridSpan')), rowSpan: span(attribute('rowSpan')),
        horizontal: boolean(attribute('hMerge')), vertical: boolean(attribute('vMerge')), text: '', continuationOf: null };
    }
    if(cell && node.localName === 'txBody') {
      if(textBody || node.parent !== cell.node)throw error();
      textBody=node;
    }
    if (cell && node.localName === 'p') {
      if (paragraph || !textBody || node.parent !== textBody) throw error();
      if (cell.text) cell.text += '\n';
      paragraph = node;
    }
    if (cell && node.localName === 'br') cell.text += '\n';
  }
  function text(value, node) {
    if (cell && isDrawing(node.namespaceURI) && node.localName === 't') {
      if(!paragraph || !isDrawing(node.parent?.namespaceURI) || !['r','fld'].includes(node.parent.localName) ||
          node.parent.parent !== paragraph)throw error();
      cell.text += value;
    }
  }
  function end(node) {
    if (paragraph === node) paragraph = null;
    if(textBody === node)textBody = null;
    if (cell?.node === node) { row.cells.push(cell); cell = null; }
    if (row?.node === node) { current.rows.push(row); row = null; }
    if (current?.node !== node) return;
    const columns = current.columns || Math.max(0, ...current.rows.map(value => value.cells.length));
    if (columns * current.rows.length > 200000) throw error(true);
    const occupied = new Map();
    for (let r = 0; r < current.rows.length; r++) {
      const sourceRow = current.rows[r];
      if (sourceRow.cells.length !== columns) throw error();
      for (const value of sourceRow.cells) {
        const c = value.column, owner = occupied.get(r * columns + c);
        if (value.horizontal || value.vertical) {
          if (!owner || value.horizontal !== (owner.column !== c) || value.vertical !== (owner.row !== r) ||
              r + value.rowSpan > current.rows.length || r + value.rowSpan > owner.row + owner.rowSpan) throw error();
          value.continuationOf = owner.row + 1;
          if (c + value.span > owner.column + owner.span) throw error();
        } else {
          if (owner || c + value.span > columns || r + value.rowSpan > current.rows.length) throw error();
          const origin = { row: r, column: c, span: value.span, rowSpan: value.rowSpan };
          for (let y = r; y < r + value.rowSpan; y++) for (let x = c; x < c + value.span; x++) {
            const key = y * columns + x;
            if (occupied.has(key)) throw error();
            occupied.set(key, origin);
          }
        }
      }
    }
    tables.push({ rows: current.rows, columns }); current = null;
  }
  // Formula text is rendered by the separately bounded OMML reader. It can
  // enter this cell only through its actual currently open paragraph owner;
  // no detached formula, source callback or generic append is accepted.
  function appendMath(value, owner, result) {
    if (!paragraph || !cell) throw error();
    if (owner.localName !== 'oMath') throw error();
    let parent = owner.parent;
    const skip = value => { while(value?.namespaceURI === 'http://schemas.openxmlformats.org/markup-compatibility/2006' && ['AlternateContent','Choice','Fallback'].includes(value.localName))value=value.parent;return value; };
    parent=skip(parent);
    if(parent?.namespaceURI!=='http://schemas.microsoft.com/office/drawing/2010/main'||parent.localName!=='m')throw error();
    parent=skip(parent.parent);
    if (parent !== paragraph) throw error();
    cell.mathSpans ||= [];
    cell.mathSpans.push({ start: cell.text.length, end: cell.text.length + value.length, result });
    cell.text += value;
  }
  return { start, text, end, appendMath, inTable: () => current !== null, tables };
}

module.exports = { createDrawingTableCollector };
