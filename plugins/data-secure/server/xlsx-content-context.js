'use strict';

// Passive, package-bound context only. This is not ZIP admission, a formula
// engine, an image decoder, a Markdown escaper, or a privacy/coverage waiver.
const path = require('path');
const { TextDecoder } = require('util');
const { readXml, assertXmlCharacters } = require('./xml-reader');
const MAIN = Object.freeze(['http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'http://purl.oclc.org/ooxml/spreadsheetml/main']);
const REL = Object.freeze(['http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships']);
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const RD = 'http://schemas.microsoft.com/office/spreadsheetml/2017/richdata';
const RR = 'http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel';
const MSREL = 'http://schemas.microsoft.com/office/2017/06/relationships/';
const RICH_REL = 'http://schemas.microsoft.com/office/2022/10/relationships/richValueRel';
const RICH_EXT = '{3E2802C4-A4D2-4D8B-9148-E3BE6C30E623}';
const MIME = Object.freeze({
  workbook: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  worksheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',
  comments: 'application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml',
  table: 'application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml',
  pivotTable: 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml',
  pivotCacheDefinition: 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml',
  sheetMetadata: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml',
  richData: 'application/vnd.ms-excel.rdRichValue+xml',
  richStructure: 'application/vnd.ms-excel.rdRichValueStructure+xml',
  richRels: 'application/vnd.ms-excel.richvaluerel+xml'
});
const LIMITS = Object.freeze({ xmlChars: 8000000, nodes: 1000000, records: 200000, outputChars: 8000000, parts: 20000 });
function unsafe(limit = false) { return Object.assign(new Error(limit ? 'XLSX-Kontext überschreitet die sichere Verarbeitungsgrenze.' : 'XLSX-Kontext ist nicht eindeutig an die Quelle gebunden.'), { code: limit ? 'XLSX_STRUCTURE_LIMIT' : 'XLSX_STRUCTURE_UNSAFE' }); }
const attr = (n, k, ns = '') => n.attributes.get(`{${ns}}${k}`);
const is = (n, k, ns) => Boolean(n && n.localName === k && (Array.isArray(ns) ? ns.includes(n.namespaceURI) : n.namespaceURI === ns));
const children = (n, k, ns = n.namespaceURI) => n.children.filter(x => typeof x !== 'string' && is(x, k, ns));
function one(n, k, ns = n.namespaceURI, required = false) { const a = children(n, k, ns); if (a.length > 1 || (required && !a.length)) throw unsafe(); return a[0] || null; }
function uint(value, maximum = 2147483647) { if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) throw unsafe(); return Number(value); }
function bool(value, fallback = false) { if (value === undefined) return fallback; if (!['0', '1', 'false', 'true'].includes(value)) throw unsafe(); return ['1', 'true'].includes(value); }
function decodeXml(s) {
  let bad = false;
  const value = s.replace(/&([^;]*);|&/gu, (whole, key) => {
    if (key && Object.hasOwn({ amp: 1, lt: 1, gt: 1, quot: 1, apos: 1 }, key)) return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[key];
    if (key && /^(?:#[0-9]+|#x[0-9a-fA-F]+)$/u.test(key)) { const cp = Number.parseInt(key.slice(key[1] === 'x' ? 2 : 1), key[1] === 'x' ? 16 : 10); if (cp <= 0x10ffff) return String.fromCodePoint(cp); }
    bad = true; return whole;
  });
  if (bad) throw unsafe(); assertXmlCharacters(value, unsafe); return value;
}
function xstring(value) { const result = value.replace(/_x([0-9a-fA-F]{4})_/gu, (_, v) => String.fromCharCode(Number.parseInt(v, 16))); assertXmlCharacters(result, unsafe); return result; }
function leaf(n) { if (n.children.some(x => typeof x !== 'string')) throw unsafe(); return n.children.join(''); }
function ref(value, rangeAllowed = true) {
  const m = typeof value === 'string' && /^([A-Z]{1,3})([1-9][0-9]*)(?::([A-Z]{1,3})([1-9][0-9]*))?$/u.exec(value);
  if (!m || (!rangeAllowed && m[3])) throw unsafe();
  const col = s => [...s].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
  const first = { column: col(m[1]), row: uint(m[2], 1048576) }, last = { column: col(m[3] || m[1]), row: uint(m[4] || m[2], 1048576) };
  if (first.column > last.column || first.row > last.row || last.column > 16384) throw unsafe();
  return { reference: value, first, last };
}
function letters(column) { let s = ''; while (column) { column--; s = String.fromCharCode(65 + column % 26) + s; column = Math.floor(column / 26); } return s; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const v of Object.values(value)) freeze(v); Object.freeze(value); } return value; }
function target(owner, raw) {
  if (typeof raw !== 'string' || !raw || /[\\?#\0]/u.test(raw) || /^(?:\/|[A-Za-z]:|[a-z][a-z0-9+.-]*:)/iu.test(raw)) throw unsafe();
  const result = path.posix.dirname(owner).split('/');
  for (const segment of raw.split('/')) {
    let decoded; try { decoded = decodeURIComponent(segment); } catch { throw unsafe(); }
    if (!decoded || decoded === '.' || /[\\/?#\0]/u.test(decoded) || (decoded === '..' && segment !== '..')) throw unsafe();
    if (decoded === '..') { if (result.length <= 1) throw unsafe(); result.pop(); } else result.push(decoded);
  }
  const part = result.join('/'); if (!part.startsWith('xl/')) throw unsafe(); return part;
}

// One synchronous private parse owns this session. Only small package controls
// (CT/workbook/relationships) are shared, never all worksheet/comment ASTs.
// The owning parser MUST invalidate after its own entries quarantine; public
// one-shot helpers below never reuse a session across mutable input calls.
function createXlsxContextSession(entries) {
  if (!(entries instanceof Map) || entries.size > LIMITS.parts) throw unsafe();
  const shared = { trees: new Map(), relationships: new Map(), owners: new Map(), nodes: 0, types: null, workbook: null };
  const invalidate = () => {
    shared.trees.clear(); shared.relationships.clear(); shared.owners.clear();
    shared.nodes = 0; shared.types = null; shared.workbook = null;
  };
  return Object.freeze({
    readTableContext: options => readXlsxContext(entries, options, true, shared),
    readSheetContext: options => readXlsxContext(entries, options, false, shared),
    invalidate
  });
}

function readXlsxContext(entries, { sheetPart, workbookPart = 'xl/workbook.xml' } = {}, tableOnly, shared) {
  if (entries.size > LIMITS.parts || typeof sheetPart !== 'string' || !/^xl\/worksheets\/[^/]+\.xml$/u.test(sheetPart) || workbookPart !== 'xl/workbook.xml') throw unsafe();
  const trees = new Map(), consumed = new Set(), notices = [], noticeKeys = new Set(), result = { sourcePart: sheetPart, comments: [], tables: [], pivots: [], richValues: [] };
  // Count shared live control nodes plus this read's transient payload nodes.
  // This preserves the finite AST peak instead of retaining every sheet tree.
  let nodeCount = shared.nodes, output = 0, recordCount = 0, ownerIndexParts = Object.freeze([]);
  const notice = (code, part, cell) => { const key = JSON.stringify([code, part, cell]); if (!noticeKeys.has(key)) { noticeKeys.add(key); notices.push({ code, part, ...(cell ? { cell } : {}) }); } };
  const text = value => { if (typeof value !== 'string') throw unsafe(); output += value.length; if (output > LIMITS.outputChars) throw unsafe(true); return value; };
  const record = () => { if (++recordCount > LIMITS.records) throw unsafe(true); };
  function tree(part) {
    if (trees.has(part)) return trees.get(part);
    consumed.add(part);
    const control = part === '[Content_Types].xml' || part === workbookPart || part.endsWith('.rels');
    if (control && shared.trees.has(part)) return shared.trees.get(part);
    const data = entries.get(part); if (typeof data !== 'string' && !Buffer.isBuffer(data)) throw unsafe();
    let xml; try { xml = typeof data === 'string' ? data : new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { throw unsafe(); }
    if (xml.length > LIMITS.xmlChars) throw unsafe(true);
    let root, nodes = 0;
    readXml(xml, { decode: decodeXml, error: unsafe, start(n) { if (++nodeCount > LIMITS.nodes) throw unsafe(true); nodes++; n.children = []; if (n.parent) n.parent.children.push(n); else root = n; }, text(t, n) { n.children.push(t); } });
    if (control) { shared.trees.set(part, root); shared.nodes += nodes; }
    else trees.set(part, root);
    return root;
  }
  consumed.add('[Content_Types].xml');
  if (!shared.types) {
    const types = tree('[Content_Types].xml'); if (!is(types, 'Types', CT)) throw unsafe();
    const overrides = new Map(), defaults = new Map();
    for (const n of types.children.filter(x => typeof x !== 'string')) {
      if (!is(n, 'Override', CT) && !is(n, 'Default', CT)) throw unsafe();
      const override = n.localName === 'Override', key = attr(n, override ? 'PartName' : 'Extension'), value = attr(n, 'ContentType'), map = override ? overrides : defaults;
      if (!key || !value || map.has(key)) throw unsafe(); map.set(key, value);
    }
    shared.types = { overrides, defaults };
  }
  const { overrides, defaults } = shared.types;
  const contentType = part => overrides.get('/' + part) || defaults.get(part.slice(part.lastIndexOf('.') + 1));
  function rels(owner) {
    const p = path.posix.join(path.posix.dirname(owner), '_rels', path.posix.basename(owner) + '.rels');
    if (entries.has(p)) consumed.add(p);
    if (shared.relationships.has(owner)) return shared.relationships.get(owner);
    const map = new Map();
    if (entries.has(p)) {
      const root = tree(p); if (!is(root, 'Relationships', PKG)) throw unsafe();
      for (const n of root.children.filter(x => typeof x !== 'string')) {
        if (!is(n, 'Relationship', PKG)) throw unsafe();
        const id = attr(n, 'Id'), type = attr(n, 'Type'); if (!id || !type || !attr(n, 'Target') || map.has(id)) throw unsafe();
        map.set(id, { id, type, target: attr(n, 'Target'), mode: attr(n, 'TargetMode') });
      }
    }
    shared.relationships.set(owner, map); return map;
  }
  const matchesType = (r, type) => type.includes('://') ? r.type === type : REL.some(ns => r.type === ns + '/' + type);
  function bound(owner, relation, expectedMime) {
    if (!relation || (relation.mode !== undefined && relation.mode !== 'Internal')) throw unsafe();
    // Microsoft documents these two RichValue MIME subtypes in mixed case;
    // the actual Office-compatible writer spells the same registered subtype
    // in lower case. Only these closed equivalents are admitted here.
    const part = target(owner, relation.target), actualMime = contentType(part);
    const richMime = [MIME.richData, MIME.richStructure].includes(expectedMime) && actualMime === expectedMime.toLowerCase();
    if (!entries.has(part) || (expectedMime && actualMime !== expectedMime && !richMime)) throw unsafe(); return part;
  }
  function role(owner, type, mime, required = false) {
    const a = [...rels(owner).values()].filter(r => matchesType(r, type)); if (a.length > 1 || (required && !a.length)) throw unsafe();
    return a.length ? bound(owner, a[0], mime) : null;
  }
  function rid(n) { const ids = REL.map(ns => attr(n, 'id', ns)).filter(v => v !== undefined); if (ids.length !== 1 || !ids[0]) throw unsafe(); return ids[0]; }
  function numberedChildren(parent, container, child, required = false) {
    const c = one(parent, container, parent.namespaceURI, required); if (!c) return [];
    const a = children(c, child); if (attr(c, 'count') !== undefined && uint(attr(c, 'count'), LIMITS.records) !== a.length) throw unsafe();
    if (c.children.some(n => typeof n !== 'string' && !is(n, child, c.namespaceURI))) notice('XLSX_CONTEXT_EXTENSION_UNMODELED', sheetPart);
    return a;
  }
  function root(part, name) { const n = tree(part); if (!is(n, name, MAIN)) throw unsafe(); return n; }
  if (![MIME.workbook, 'application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml'].includes(contentType(workbookPart))) throw unsafe();
  consumed.add(workbookPart);
  const wbRels = rels(workbookPart);
  if (!shared.workbook) {
    const wb = root(workbookPart, 'workbook'), sheets = one(wb, 'sheets', wb.namespaceURI, true), byPart = new Map(), owners = [];
    for (const s of children(sheets, 'sheet')) {
      const edge = wbRels.get(rid(s)); if (!edge || !matchesType(edge, 'worksheet')) continue;
      const part = bound(workbookPart, edge, MIME.worksheet);
      byPart.set(part, (byPart.get(part) || 0) + 1); owners.push(part);
    }
    shared.workbook = { wb, byPart, owners };
  }
  const { wb, byPart, owners } = shared.workbook;
  if (byPart.get(sheetPart) !== 1 || !entries.has(sheetPart)) throw unsafe();
  const sheet = root(sheetPart, 'worksheet'), sheetRels = rels(sheetPart);
  function exclusiveSheetOwner(part, kind) {
    if (!shared.owners.has(tableOnly)) {
      const sheetOwners = new Map(), indexParts = new Set(); let edges = 0;
      for (const owner of owners) {
        for (const r of rels(owner).values()) {
          const roleName = (tableOnly?['table']:['comments', 'table', 'pivotTable']).find(k => matchesType(r, k)); if (!roleName) continue;
          if (++edges > LIMITS.records) throw unsafe(true);
          const owned = bound(owner, r, MIME[roleName]), key = JSON.stringify([roleName, owned]);
          if (!sheetOwners.has(key)) sheetOwners.set(key, []); sheetOwners.get(key).push(owner);
        }
        const relationPart = path.posix.join(path.posix.dirname(owner), '_rels', path.posix.basename(owner) + '.rels');
        if (entries.has(relationPart)) indexParts.add(relationPart);
      }
      shared.owners.set(tableOnly, { sheetOwners, parts: Object.freeze([...indexParts]) });
    }
    const index = shared.owners.get(tableOnly);
    ownerIndexParts = index.parts;
    const boundOwners = index.sheetOwners.get(JSON.stringify([kind, part]));
    if (!boundOwners || boundOwners.length !== 1 || boundOwners[0] !== sheetPart) throw unsafe();
  }

  // Comments can legitimately annotate an otherwise empty cell: the real
  // comment ref is authority, not presence of a nonempty sheet-data value.
  const commentPart = tableOnly?null:role(sheetPart, 'comments', MIME.comments);
  if (commentPart) {
    exclusiveSheetOwner(commentPart, 'comments');
    const c = root(commentPart, 'comments'), authors = one(c, 'authors', c.namespaceURI, true), list = one(c, 'commentList', c.namespaceURI, true), used = new Set();
    const names = children(authors, 'author').map(n => xstring(leaf(n)));
    for (const n of children(list, 'comment')) {
      record(); const cell = ref(attr(n, 'ref'), false).reference, authorId = uint(attr(n, 'authorId'));
      if (used.has(cell) || authorId >= names.length) throw unsafe(); used.add(cell);
      const body = one(n, 'text', n.namespaceURI, true), chunks = [];
      for (const piece of body.children.filter(x => typeof x !== 'string')) {
        if (is(piece, 't', n.namespaceURI)) chunks.push(leaf(piece));
        else if (is(piece, 'r', n.namespaceURI)) { for (const t of children(piece, 't')) chunks.push(leaf(t)); if (piece.children.some(x => typeof x !== 'string' && !['rPr', 't'].some(k => is(x, k, n.namespaceURI)))) notice('XLSX_COMMENT_TEXT_UNMODELED', commentPart, cell); }
        else notice('XLSX_COMMENT_TEXT_UNMODELED', commentPart, cell);
      }
      result.comments.push({ part: commentPart, cell, authorId, author: text(names[authorId]), text: text(xstring(chunks.join(''))) });
    }
    if (list.children.some(n => typeof n !== 'string' && !is(n, 'comment', c.namespaceURI))) notice('XLSX_COMMENT_TEXT_UNMODELED', commentPart);
  }

  const tableIds = new Set(), tableParts = new Set();
  for (const n of numberedChildren(sheet, 'tableParts', 'tablePart')) {
    const id = rid(n), r = sheetRels.get(id); if (tableIds.has(id) || !r || !matchesType(r, 'table')) throw unsafe(); tableIds.add(id);
    const part = bound(sheetPart, r, MIME.table); if (tableParts.has(part)) throw unsafe(); tableParts.add(part);
    exclusiveSheetOwner(part, 'table');
    const t = root(part, 'table'), range = ref(attr(t, 'ref')), columns = numberedChildren(t, 'tableColumns', 'tableColumn', true), seen = new Set();
    if (columns.length !== range.last.column - range.first.column + 1) throw unsafe();
    const headerRowCount = attr(t, 'headerRowCount') === undefined ? 1 : uint(attr(t, 'headerRowCount'), 1048576), totalsRowCount = attr(t, 'totalsRowCount') === undefined ? 0 : uint(attr(t, 'totalsRowCount'), 1048576);
    if (headerRowCount + totalsRowCount > range.last.row - range.first.row + 1) throw unsafe();
    const table = { part, id: uint(attr(t, 'id')), name: text(xstring(attr(t, 'name') ?? attr(t, 'displayName') ?? '')), displayName: text(xstring(attr(t, 'displayName') ?? '')), reference: range.reference, headerRowCount, totalsRowCount, columns: [], filters: [] };
    if (!table.id || !table.displayName) throw unsafe();
    for (let index = 0; index < columns.length; index++) {
      record(); const c = columns[index], columnId = uint(attr(c, 'id')); if (!columnId || seen.has(columnId) || attr(c, 'name') === undefined) throw unsafe(); seen.add(columnId);
      const calculated = one(c, 'calculatedColumnFormula'), totals = one(c, 'totalsRowFormula');
      table.columns.push({ id: columnId, column: range.first.column + index, name: text(xstring(attr(c, 'name'))), ...(attr(c, 'totalsRowLabel') !== undefined ? { totalsRowLabel: text(xstring(attr(c, 'totalsRowLabel'))) } : {}), ...(attr(c, 'totalsRowFunction') !== undefined ? { totalsRowFunction: text(attr(c, 'totalsRowFunction')) } : {}), ...(calculated ? { calculatedColumnFormula: text(leaf(calculated)) } : {}), ...(totals ? { totalsRowFormula: text(leaf(totals)) } : {}) });
    }
    const filter = one(t, 'autoFilter');
    if (filter) { const fref = ref(attr(filter, 'ref')); if (fref.first.column < range.first.column || fref.last.column > range.last.column || fref.first.row < range.first.row || fref.last.row > range.last.row) throw unsafe(); const seenFilters = new Set();
      for (const c of children(filter, 'filterColumn')) { const index = uint(attr(c, 'colId'), columns.length - 1); if (seenFilters.has(index)) throw unsafe(); seenFilters.add(index); table.filters.push({ column: range.first.column + index, kinds: c.children.filter(x => typeof x !== 'string').map(x => x.namespaceURI === c.namespaceURI && ['filters', 'customFilters', 'dynamicFilter', 'colorFilter', 'iconFilter', 'top10'].includes(x.localName) ? x.localName : 'unmodeled') }); }
      if (table.filters.length) notice('XLSX_TABLE_FILTER_CRITERIA_NOT_EVALUATED', part);
    }
    if (one(t, 'extLst') || one(t, 'sortState')) notice('XLSX_CONTEXT_EXTENSION_UNMODELED', part);
    result.tables.push(table);
  }
  for (const r of sheetRels.values()) if (matchesType(r, 'table') && !tableParts.has(bound(sheetPart, r, MIME.table))) notice('XLSX_UNSELECTED_TABLE_PART', sheetPart);

  // PivotTables are implicitly reached from the actual sheet relationship,
  // not by guessed filenames or by dumping all caches in the workbook.
  const cacheById = new Map(), pivotRelationships = tableOnly?[]:[...sheetRels.values()].filter(r => matchesType(r, 'pivotTable'));
  if (pivotRelationships.length) for (const n of numberedChildren(wb, 'pivotCaches', 'pivotCache')) { const id = uint(attr(n, 'cacheId')); if (cacheById.has(id)) throw unsafe(); cacheById.set(id, wbRels.get(rid(n))); }
  const pivotParts = new Set();
  for (const r of pivotRelationships) {
    const part = bound(sheetPart, r, MIME.pivotTable); if (pivotParts.has(part)) throw unsafe(); pivotParts.add(part); record();
    exclusiveSheetOwner(part, 'pivotTable');
    const p = root(part, 'pivotTableDefinition'), cacheId = uint(attr(p, 'cacheId')), cachePart = role(part, 'pivotCacheDefinition', MIME.pivotCacheDefinition, true);
    const workbookCache = cacheById.get(cacheId); if (!workbookCache || !matchesType(workbookCache, 'pivotCacheDefinition') || bound(workbookPart, workbookCache, MIME.pivotCacheDefinition) !== cachePart) throw unsafe();
    const cache = root(cachePart, 'pivotCacheDefinition'), defs = numberedChildren(cache, 'cacheFields', 'cacheField', true), fields = numberedChildren(p, 'pivotFields', 'pivotField', true);
    if (defs.length !== fields.length) throw unsafe();
    const loc = one(p, 'location', p.namespaceURI, true), range = ref(attr(loc, 'ref')), location = {};
    for (const key of ['firstHeaderRow', 'firstDataRow', 'firstDataCol', 'rowPageCount', 'colPageCount']) if (attr(loc, key) !== undefined) location[key] = uint(attr(loc, key), key.toLowerCase().includes('col') ? 16384 : 1048576);
    for (const key of ['firstHeaderRow', 'firstDataRow']) if (location[key] !== undefined && location[key] > range.last.row - range.first.row) throw unsafe();
    if (location.firstDataCol !== undefined && location.firstDataCol > range.last.column - range.first.column) throw unsafe();
    const pivot = { part, name: text(xstring(attr(p, 'name') || '')), cacheId, cachePart, reference: range.reference, location, fields: [], axes: { rows: [], columns: [], pages: [], data: [] }, rowGrandTotals: bool(attr(p, 'rowGrandTotals'), true), columnGrandTotals: bool(attr(p, 'colGrandTotals'), true) }, used = new Set();
    const indexOf = value => { const index = uint(value, defs.length - 1); used.add(index); return index; };
    for (const [container, destination] of [['rowFields', 'rows'], ['colFields', 'columns']]) for (const field of numberedChildren(p, container, 'field')) { const value = attr(field, 'x'); pivot.axes[destination].push(value === '-2' ? 'data-axis' : indexOf(value)); }
    for (const field of numberedChildren(p, 'pageFields', 'pageField')) pivot.axes.pages.push(indexOf(attr(field, 'fld')));
    for (const field of numberedChildren(p, 'dataFields', 'dataField')) pivot.axes.data.push({ field: indexOf(attr(field, 'fld')), ...(attr(field, 'name') !== undefined ? { name: text(xstring(attr(field, 'name'))) } : {}), ...(attr(field, 'subtotal') !== undefined ? { subtotal: text(attr(field, 'subtotal')) } : {}) });
    for (const index of used) { record(); if (attr(defs[index], 'name') === undefined) throw unsafe(); pivot.fields.push({ index, name: text(xstring(attr(defs[index], 'name'))), ...(attr(fields[index], 'name') !== undefined ? { caption: text(xstring(attr(fields[index], 'name'))) } : {}), ...(attr(fields[index], 'axis') !== undefined ? { axis: text(attr(fields[index], 'axis')) } : {}) }); }
    const src = one(cache, 'cacheSource', cache.namespaceURI, true), worksheet = one(src, 'worksheetSource');
    if (attr(src, 'type') === 'worksheet' && worksheet && !REL.some(ns => attr(worksheet, 'id', ns) !== undefined)) {
      pivot.source = { type: 'worksheet', ...(attr(worksheet, 'sheet') !== undefined ? { sheet: text(xstring(attr(worksheet, 'sheet'))) } : {}), ...(attr(worksheet, 'name') !== undefined ? { name: text(xstring(attr(worksheet, 'name'))) } : {}), ...(attr(worksheet, 'ref') !== undefined ? { reference: ref(attr(worksheet, 'ref')).reference } : {}) };
    } else { pivot.source = { type: 'unresolved' }; notice('XLSX_PIVOT_SOURCE_NOT_RESOLVED', part); }
    if (one(p, 'filters') || one(p, 'extLst') || pivot.axes.pages.length || fields.some(f => bool(attr(f, 'multipleItemSelectionAllowed')) || children(f, 'items').some(c => children(c, 'item').some(i => bool(attr(i, 'h')))))) notice('XLSX_PIVOT_FILTER_SELECTION_NOT_EXPANDED', part);
    notice('XLSX_PIVOT_CACHE_VALUES_NOT_REPLAYED', part); result.pivots.push(pivot);
  }

  // Known Office/XlsxWriter local-image model: vm is one-based into
  // valueMetadata; rc.t is one-based into metadataTypes; rc.v, rvb.i, rv.s
  // and _rvRel are independently zero-based. Never try both indices.
  const metadataCells = [], data = tableOnly?null:one(sheet, 'sheetData'); let previousRow = 0;
  if (data) for (const row of children(data, 'row')) {
    const number = attr(row, 'r') === undefined ? previousRow + 1 : uint(attr(row, 'r'), 1048576); if (number <= previousRow) throw unsafe(); previousRow = number; let column = 0;
    for (const cell of children(row, 'c')) { const cellRef = attr(cell, 'r') || letters(column + 1) + number, position = ref(cellRef, false); if (position.first.row !== number || position.first.column <= column) throw unsafe(); column = position.first.column;
      if (attr(cell, 'vm') !== undefined) { record(); metadataCells.push({ cell: cellRef, vm: uint(attr(cell, 'vm')), formula: Boolean(one(cell, 'f')) }); }
    }
  }
  if (metadataCells.length) {
    const metadataPart = role(workbookPart, 'sheetMetadata', MIME.sheetMetadata), dataPart = role(workbookPart, MSREL + 'rdRichValue', MIME.richData), structurePart = role(workbookPart, MSREL + 'rdRichValueStructure', MIME.richStructure), relationshipPart = role(workbookPart, RICH_REL, MIME.richRels);
    let typesList = [], blocks = [], futures = [], values = [], structures = [], imageRefs = [];
    if (metadataPart && dataPart && structurePart && relationshipPart) {
      const md = root(metadataPart, 'metadata'); typesList = numberedChildren(md, 'metadataTypes', 'metadataType', true); blocks = numberedChildren(md, 'valueMetadata', 'bk', true);
      const typeNames = typesList.map(t => attr(t, 'name')); if (typeNames.some(n => !n) || new Set(typeNames).size !== typeNames.length) throw unsafe();
      futures = children(md, 'futureMetadata').filter(n => attr(n, 'name') === 'XLRICHVALUE'); if (futures.length > 1) throw unsafe();
      const vr = tree(dataPart), sr = tree(structurePart), rr = tree(relationshipPart); if (!is(vr, 'rvData', RD) || !is(sr, 'rvStructures', RD) || !is(rr, 'richValueRels', RR)) throw unsafe();
      values = children(vr, 'rv', RD); structures = children(sr, 's', RD); imageRefs = children(rr, 'rel', RR);
      if (uint(attr(vr, 'count'), LIMITS.records) !== values.length || uint(attr(sr, 'count'), LIMITS.records) !== structures.length) throw unsafe();
    }
    for (const m of metadataCells) {
      const unresolved = () => { result.richValues.push({ cell: m.cell, metadataIndex: m.vm, status: 'unresolved', ...(metadataPart ? { metadataPart } : {}) }); notice('XLSX_RICH_VALUE_BINDING_UNRESOLVED', sheetPart, m.cell); };
      if (!metadataPart || !dataPart || !structurePart || !relationshipPart || m.vm === 0 || m.formula || !futures.length) { unresolved(); continue; }
      const block = blocks[m.vm - 1]; if (!block) throw unsafe();
      const records = children(block, 'rc'); if (records.length !== 1 || block.children.some(n => typeof n !== 'string' && !is(n, 'rc', block.namespaceURI))) { unresolved(); continue; }
      const metaType = typesList[uint(attr(records[0], 't')) - 1]; if (!metaType) throw unsafe();
      if (attr(metaType, 'name') !== 'XLRICHVALUE' || bool(attr(metaType, 'cellMeta'))) { unresolved(); continue; }
      const future = futures[0], fb = children(future, 'bk'); if (uint(attr(future, 'count'), LIMITS.records) !== fb.length) throw unsafe();
      const futureBlock = fb[uint(attr(records[0], 'v'))]; if (!futureBlock) throw unsafe();
      const extList = one(futureBlock, 'extLst', future.namespaceURI, true), exts = children(extList, 'ext').filter(n => (attr(n, 'uri') || '').toUpperCase() === RICH_EXT);
      if (exts.length !== 1) { unresolved(); continue; }
      const blockRef = one(exts[0], 'rvb', RD, true), richIndex = uint(attr(blockRef, 'i')), value = values[richIndex]; if (!value) throw unsafe();
      const structureIndex = uint(attr(value, 's')), structure = structures[structureIndex]; if (!structure) throw unsafe();
      if (attr(structure, 't') !== '_localImage') { unresolved(); continue; }
      const keys = children(structure, 'k', RD), vals = children(value, 'v', RD), names = new Set(); let imageIndex, altText = '', origin = null, unsupported = false;
      if (vals.length > keys.length || !vals.length) throw unsafe();
      for (let i = 0; i < keys.length; i++) {
        const name = attr(keys[i], 'n'), type = attr(keys[i], 't') || 'd'; if (!name || names.has(name)) throw unsafe(); names.add(name);
        if (i >= vals.length) { if (name === '_rvRel:LocalImageIdentifier') throw unsafe(); continue; }
        const v = leaf(vals[i]);
        if (name === '_rvRel:LocalImageIdentifier' && type === 'i') imageIndex = uint(v);
        else if (name === 'Text' && type === 's') altText = text(xstring(v));
        else if (name === 'CalcOrigin' && type === 'i') origin = uint(v, 9);
        else unsupported = true;
      }
      if (imageIndex === undefined) throw unsafe();
      if (unsupported || one(value, 'fb', RD) || origin === 1 || origin === 2) { unresolved(); continue; }
      const imageRef = imageRefs[imageIndex]; if (!imageRef) throw unsafe(); const imageRel = rels(relationshipPart).get(rid(imageRef)); if (!imageRel || !matchesType(imageRel, 'image')) throw unsafe();
      const mediaPart = bound(relationshipPart, imageRel), mediaContentType = contentType(mediaPart);
      if (!mediaPart.startsWith('xl/media/') || typeof mediaContentType !== 'string' || !/^image\/[a-z0-9.+-]+$/u.test(mediaContentType) || !Buffer.isBuffer(entries.get(mediaPart)) || !entries.get(mediaPart).length) throw unsafe();
      // No media bytes are decoded/executed here. Admission/real decoders own
      // MIME sniffing, resource bounds and typed unsupported-format handling.
      consumed.add(mediaPart); result.richValues.push({ cell: m.cell, status: 'local-image', metadataIndex: m.vm, richValueIndex: richIndex, structureIndex, relationshipIndex: imageIndex, metadataPart, dataPart, structurePart, relationshipPart, mediaPart, mediaContentType, altText, decorative: origin === 6 });
    }
  }
  // Shared owner-index inputs are one frozen array, not an S-entry copy in
  // each of S sheet models. These descriptive paths confer no read capability.
  return freeze({ ...result, notices, consumedParts: [...consumed], ownerIndexParts });
}

function readXlsxSheetContext(entries, options) { return createXlsxContextSession(entries).readSheetContext(options); }
function readXlsxTableContext(entries, options) { return createXlsxContextSession(entries).readTableContext(options); }
module.exports = Object.freeze({ readXlsxSheetContext, readXlsxTableContext, createXlsxContextSession, LIMITS, MIME });
