'use strict';

// Optional PDF.js 6.2.108 structure authority. No text/Alt/ActualText is invented
// or removed here. Unknown/incomplete models keep the exact old item array.
const Base = require('../privacy/base');
const { isProtectedFieldHeader } = require('../privacy/field-value-coverage');
const { CONTENT_PERSON_FIELD_POLICY } = require('../core/person-field-policy');
const MAX_ITEMS = 100000, MAX_GROUPS = 20000, MAX_NODES = 20000, MAX_DEPTH = 64;
const MAX_TEXT = 8 * 1024 * 1024, MAX_BLOCKS = 5000, MAX_COMPARISONS = 2000000, MAX_LINES = 100000;
const UNAVAILABLE = 'PDF_TAGGED_ORDER_UNAVAILABLE', UNVERIFIED = 'PDF_TAGGED_ORDER_UNVERIFIED';
const CONTAINERS = new Set(['Root', 'Document', 'Part', 'Art', 'Sect', 'Div', 'NonStruct']);
const PARAGRAPHS = new Set(['P', 'H', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'Caption', 'Note', 'BlockQuote', 'Quote']);
const INLINE = new Set(['Span', 'Link', 'Code', 'Em', 'Strong', 'Sub', 'Reference', 'BibEntry']);
class Unverified extends Error {}
const check = ok => { if (!ok) throw new Unverified(); };
function record(value) {
  check(value && typeof value === 'object' && !Array.isArray(value));
  const proto = Object.getPrototypeOf(value); check(proto === null || proto === Object.prototype);
  const entries = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(entries);
  check(keys.length <= 24 && keys.every(key => typeof key === 'string'));
  for (const key of keys) check(Object.hasOwn(entries[key], 'value') && entries[key].enumerable);
  return Object.fromEntries(keys.map(key => [key, entries[key].value]));
}
function array(value, maximum) {
  check(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype);
  const entries = Object.getOwnPropertyDescriptors(value), length = entries.length?.value;
  check(Number.isInteger(length) && length >= 0 && length <= maximum && Reflect.ownKeys(entries).length === length + 1);
  const result = [];
  for (let i = 0; i < length; i++) { const d = entries[i]; check(d && Object.hasOwn(d, 'value') && d.enumerable); result.push(d.value); }
  return result;
}
function separator(previous, item) {
  if (!previous || !item) return '';
  const a = previous.transform, b = item.transform, height = Math.max(a[3], b[3]);
  if (Math.abs(b[5] - a[5]) > height * 0.75 || b[4] < a[4] - height * 0.25) return '\n';
  return b[4] - a[4] - previous.width > height * 0.25 ? ' ' : '';
}
function union(boxes) {
  check(boxes.length > 0);
  const result = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const box of boxes) { result.x0 = Math.min(result.x0, box.x0); result.y0 = Math.min(result.y0, box.y0);
    result.x1 = Math.max(result.x1, box.x1); result.y1 = Math.max(result.y1, box.y1); }
  return Object.freeze(result);
}
function closedLabel(value) {
  const label = Base.effectiveTableFieldLabel(value);
  return isProtectedFieldHeader(label, CONTENT_PERSON_FIELD_POLICY) ||
    [Base.ID_LABEL_HEADER_RE, Base.CREDENTIAL_LABEL_HEADER_RE, Base.PHONE_LABEL_RE,
      Base.BIC_LABEL_RE, Base.DATE_OF_BIRTH_LABEL_RE, Base.VEHICLE_PLATE_LABEL_RE,
      Base.DE_TAX_LABEL_RE].some(re => re.test(label));
}
function resultFallback(items, reason) {
  return Object.freeze({ applied: false, items, blocks: Object.freeze([]), reason_codes: Object.freeze([reason]) });
}

function taggedPdfTextLayout(input) {
  let original;
  try {
    const options = record(input); original = options.items;
    const items = array(original, MAX_ITEMS), ref = record(options.pageRef);
    check(Number.isInteger(options.pageNumber) && options.pageNumber > 0 && options.pageNumber <= 0x7fffffff);
    check(Number.isInteger(ref.num) && ref.num > 0 && ref.num <= 0x7fffffff && Number.isInteger(ref.gen) && ref.gen >= 0 && ref.gen <= 65535);
    if (options.structureTree == null) return resultFallback(original, UNAVAILABLE);
    const prefix = `p${ref.num}R${ref.gen === 0 ? '' : ref.gen}_mc`;
    function boundId(id) {
      if (typeof id !== 'string' || !id.startsWith(prefix)) return false;
      const suffix = id.slice(prefix.length);
      return /^(?:0|[1-9]\d{0,9})$/u.test(suffix) && Number(suffix) <= 0x7fffffff;
    }
    const groups = new Map(), textData = new Map(), textItems = [], objectSeen = new WeakSet();
    let active = null, depth = 0, characters = 0;
    for (let index = 0; index < items.length; index++) {
      const item = items[index]; check(item && typeof item === 'object' && !objectSeen.has(item)); objectSeen.add(item);
      const data = record(item);
      if (Object.hasOwn(data, 'str')) {
        check(active && typeof data.str === 'string' && typeof data.hasEOL === 'boolean');
        characters += data.str.length; check(characters <= MAX_TEXT);
        const transform = array(data.transform, 6); check(transform.length === 6 && transform.every(Number.isFinite));
        check(transform.every(value => Math.abs(value) <= 1e7) && Number.isFinite(data.width) && data.width >= 0 && data.width <= 1e7);
        if (data.str.trim()) {
          check(data.dir === 'ltr' && transform[0] > 0 && transform[3] > 0 && Math.abs(transform[1]) < 0.001 && Math.abs(transform[2]) < 0.001 && data.width > 0);
          active.boxes.push({ x0: transform[4], y0: transform[5], x1: transform[4] + data.width, y1: transform[5] + transform[3] });
        }
        const snapshot = { str: data.str, hasEOL: data.hasEOL, width: data.width, transform };
        textData.set(item, snapshot); active.textItems.push(item); textItems.push(item);
      } else if (data.type === 'beginMarkedContentProps' || data.type === 'beginMarkedContent') {
        if (!active) {
          check(data.type === 'beginMarkedContentProps' && boundId(data.id) && !groups.has(data.id));
          check(groups.size < MAX_GROUPS);
          active = { id: data.id, start: index, textItems: [], boxes: [] }; depth = 1;
        } else {
          // Nested MCIDs make ownership ambiguous; plain format wrappers do not.
          check((data.type === 'beginMarkedContent' || data.id == null) && ++depth <= MAX_DEPTH);
        }
      } else if (data.type === 'endMarkedContent') {
        check(active && depth > 0);
        if (--depth === 0) {
          check(active.textItems.length > 0 && active.boxes.length > 0);
          active.end = index; active.items = Object.freeze(items.slice(active.start, index + 1));
          active.bounds = union(active.boxes); delete active.boxes;
          groups.set(active.id, active); active = null;
        }
      } else check(false);
    }
    check(!active && depth === 0 && groups.size > 0 && textItems.length > 0);
    const treeSeen = new WeakSet(), used = new Set(); let nodes = 0;
    function node(value, level) { check(level <= MAX_DEPTH && !treeSeen.has(value)); treeSeen.add(value); check(++nodes <= MAX_NODES); return record(value); }
    function children(data) { return array(data.children, MAX_NODES); }
    function contentIds(value, level, paragraphAllowed = false) {
      const data = node(value, level);
      if (data.type !== undefined) {
        check(data.type === 'content' && boundId(data.id) && groups.has(data.id) && !used.has(data.id));
        used.add(data.id); return [data.id];
      }
      check(INLINE.has(data.role) || (paragraphAllowed && PARAGRAPHS.has(data.role)));
      const out = []; for (const child of children(data)) out.push(...contentIds(child, level + 1, paragraphAllowed));
      check(out.length > 0 && out.length <= MAX_GROUPS); return out;
    }
    function blockFromIds(ids) {
      const list = ids.map(id => groups.get(id));
      for (let i = 1; i < list.length; i++) check(list[i - 1].end < list[i].start);
      return { ids: Object.freeze(ids), items: Object.freeze(list.flatMap(g => g.items)),
        textItems: Object.freeze(list.flatMap(g => g.textItems)), bounds: union(list.map(g => g.bounds)) };
    }
    const blocks = [], tableItems = new Set(), tableCellForItem = new Map();
    function table(value, level) {
      const rows = [];
      function rowsOf(raw, currentLevel, section = null) {
        const data = node(raw, currentLevel);
        if (['THead', 'TBody', 'TFoot'].includes(data.role)) { check(section === null); for (const child of children(data)) rowsOf(child, currentLevel + 1, data.role); return; }
        check(data.role === 'TR' && rows.length < 200);
        const cells = [];
        for (const rawCell of children(data)) {
          const cell = node(rawCell, currentLevel + 1); check(['TH', 'TD'].includes(cell.role) && cells.length < 64);
          const ids = []; for (const child of children(cell)) ids.push(...contentIds(child, currentLevel + 2, true));
          check(ids.length > 0);
          const model = blockFromIds(ids);
          const cellModel = Object.freeze({ role: cell.role, row: rows.length + 1, column: cells.length + 1, ...model });
          for (const item of model.textItems) { tableItems.add(item); tableCellForItem.set(item, cellModel); }
          cells.push(cellModel);
        }
        check(cells.length > 0); rows.push(Object.freeze({ section, cells: Object.freeze(cells), bounds: union(cells.map(c => c.bounds)) }));
      }
      // The Table node was already validated by walk; descendants only here.
      const data = record(value); for (const child of children(data)) rowsOf(child, level + 1);
      check(rows.length >= 2 && rows.length * rows[0].cells.length <= 5000);
      const columns = rows[0].cells.length, firstHeaderCells = rows[0].cells.every(c => c.role === 'TH');
      check(rows.every((r, index) => r.cells.length === columns && r.cells.every(c => c.role === (index === 0 && firstHeaderCells ? 'TH' : 'TD'))));
      // PDF.js does not serialize Scope/Headers/RowSpan/ColSpan. An initial TH
      // row alone therefore does not prove column-header authority. Require a
      // real single-row THead; otherwise expose cells/roles/coordinates only.
      check(rows.slice(1).every(r => r.section !== 'THead'));
      const header = firstHeaderCells && rows[0].section === 'THead';
      if (rows[0].section === 'THead') check(header);
      for (let row = 0; row < rows.length; row++) {
        const cells = rows[row].cells;
        if (row) check(rows[row].bounds.y1 <= rows[row - 1].bounds.y0 + 0.1);
        for (let col = 0; col < columns; col++) {
          const box = cells[col].bounds;
          if (col) check(cells[col - 1].bounds.x1 < box.x0 - 0.1);
          // Stable, real left anchors and no span across the next column.
          check(Math.abs(box.x0 - rows[0].cells[col].bounds.x0) <= 2);
          if (col + 1 < columns) check(box.x1 < rows[0].cells[col + 1].bounds.x0 - 0.1);
        }
      }
      return Object.freeze({ kind: 'table', role: 'Table', headerRow: header ? 1 : null,
        rows: Object.freeze(rows), bounds: union(rows.map(r => r.bounds)),
        items: Object.freeze(rows.flatMap(r => r.cells.flatMap(c => c.items))),
        textItems: Object.freeze(rows.flatMap(r => r.cells.flatMap(c => c.textItems))) });
    }
    function walk(value, level = 0) {
      const data = node(value, level); check(typeof data.role === 'string');
      if (level === 0) check(data.role === 'Root');
      if (CONTAINERS.has(data.role)) { for (const child of children(data)) walk(child, level + 1); return; }
      check(blocks.length < MAX_BLOCKS);
      if (data.role === 'Table') { blocks.push(table(value, level)); return; }
      check(PARAGRAPHS.has(data.role));
      const ids = []; for (const child of children(data)) ids.push(...contentIds(child, level + 1));
      check(ids.length > 0); blocks.push(Object.freeze({ kind: 'paragraph', role: data.role, ...blockFromIds(ids) }));
    }
    walk(options.structureTree);
    check(used.size === groups.size && blocks.length > 0);
    const ordered = blocks.flatMap(block => block.items);
    check(ordered.length === items.length && new Set(ordered).size === items.length);
    // A complete permutation is not proof that newly inserted Markdown
    // paragraphs/cells preserve a native inline value. Track the ACTUAL
    // projection unit, not its text or a guessed person/name-shaped token.
    const projectionOwner = new Map(tableCellForItem);
    for (const block of blocks) if (block.kind === 'paragraph')
      for (const item of block.textItems) projectionOwner.set(item, block);
    function oneProjectionOwner(sequence) {
      let owner;
      for (const item of sequence) {
        check(projectionOwner.has(item));
        if (owner === undefined) owner = projectionOwner.get(item);
        else check(projectionOwner.get(item) === owner);
      }
    }
    // Geometry corroborates owner separation; it never creates reading order.
    let comparisons = 0;
    for (let left = 0; left < blocks.length; left++) for (let right = left + 1; right < blocks.length; right++) {
      check(++comparisons <= MAX_COMPARISONS);
      const a = blocks[left].bounds, b = blocks[right].bounds;
      check(Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) <= 0.1 || Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) <= 0.1);
    }
    const candidate = ordered.filter(item => textData.has(item) && textData.get(item).str.trim()), position = new Map(candidate.map((item, index) => [item, index]));
    const meaningful = textItems.filter(item => textData.get(item).str.trim());
    function consecutive(sequence) {
      const list = [...new Set(sequence)].filter(item => !tableItems.has(item));
      for (let i = 1; i < list.length; i++) check(position.get(list[i]) === position.get(list[i - 1]) + 1);
    }
    // Do not split an already adjacent native inline value by moving a tagged
    // paragraph through it. Wide gutters alone do not authorize table columns.
    for (let i = 1; i < meaningful.length; i++) {
      const a = textData.get(meaningful[i - 1]), b = textData.get(meaningful[i]), height = Math.max(a.transform[3], b.transform[3]);
      if (!a.hasEOL && separator(a, b) !== '\n' && b.transform[4] - a.transform[4] - a.width <= height * 4) {
        const sequence = [meaningful[i - 1], meaningful[i]];
        consecutive(sequence); oneProjectionOwner(sequence);
      }
    }
    // Preserve actual native field scopes across MCIDs/paragraph tags. This
    // only refuses unsafe reorderings; it does not mask or invent field labels.
    const lines = [{ text: '', items: [] }]; let previous;
    function add(value, item) {
      // Do not allocate an unbounded split array for one newline-heavy run.
      let start = 0;
      function part(end) { const fragment = value.slice(start, end), line = lines.at(-1); line.text += fragment; if (item && fragment.trim()) line.items.push(item); }
      for (let index = 0; index < value.length; index++) {
        if (value[index] !== '\r' && value[index] !== '\n') continue;
        part(index); if (value[index] === '\r' && value[index + 1] === '\n') index++;
        check(lines.length < MAX_LINES); lines.push({ text: '', items: [] }); start = index + 1;
      }
      part(value.length);
    }
    for (const item of textItems) { const data = textData.get(item); if (data.str.trim()) add(separator(previous, data), null); add(data.str, item); if (data.hasEOL) { add('\n', null); previous = undefined; } else if (data.str.trim()) previous = data; }
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index], trimmed = line.text.trim(), explicit = /[:=：＝]/u.test(trimmed), bare = trimmed && closedLabel(trimmed);
      if (!explicit && !bare) continue;
      const scope = [...line.items];
      if (bare || /[:=：＝]\s*$/u.test(trimmed)) { let next = index + 1; while (next < lines.length && !lines[next].text.trim()) next++; if (next < lines.length) scope.push(...lines[next].items); }
      // Generated table boundaries must not turn a real native inline
      // label/value into unrelated header/data cells. Keep the old path for
      // this ambiguous case instead of trusting tags over source field text.
      if (explicit) {
        const cells = new Set(scope.map(item => tableCellForItem.get(item)).filter(Boolean));
        check(cells.size <= 1 && !(cells.size && scope.some(item => !tableItems.has(item))));
      }
      consecutive(scope);
      // A source label/value corridor outside a proved table cannot acquire
      // a new P boundary just because its objects remain adjacent. Real table
      // cell roles are already checked above: a bare TH label is not proof
      // that the next authored header cell is its value. Mixed table/prose
      // corridors still require one actual owner rather than dropping either.
      if (!scope.every(item => tableItems.has(item))) oneProjectionOwner(scope);
    }
    return Object.freeze({ applied: true, pageNumber: options.pageNumber, pageObjectId: prefix.slice(0, -3),
      items: Object.freeze(ordered), blocks: Object.freeze(blocks), reason_codes: Object.freeze([]) });
  } catch (error) {
    // Optional model failures have no authority over normal source/Unicode/
    // budget/PII failure handling in the unchanged native text caller.
    return resultFallback(original, UNVERIFIED);
  }
}

module.exports = Object.freeze({ taggedPdfTextLayout });
