'use strict';

// A Word cell occupies logical grid columns, not its physical <w:tc> ordinal.
// Keep these bounds separate from XML/node limits: a tiny span declaration or
// wide sparse table must not amplify into unbounded rendered padding.
const MAX_WORD_TABLE_COLUMNS = 1024;
const MAX_WORD_TABLE_ROWS = 10000;
const MAX_WORD_TABLE_GRID_SLOTS = 200000;

function wordGridNumber(value, allowZero, error) {
  if (typeof value !== 'string' || !/^\+?[0-9]+$/u.test(value.trim())) throw error();
  const number = Number(value.trim());
  if (!Number.isSafeInteger(number) || number > MAX_WORD_TABLE_COLUMNS) throw error(true);
  if (!allowZero && number === 0) throw error();
  return number;
}

// hMerge is a sequence of physical cells, each of which still consumes its
// own gridSpan. Build a parser-local logical view instead of overwriting the
// first span or dropping continuation payloads. The original tree and every
// source node remain intact; only the view's children join the actual members
// in source order. Nested tables therefore retain their own independent grid.
function horizontalWordCells(row, error) {
  const groups = [];
  let group = null;
  for (const cell of row.children) {
    if (cell.horizontalMerge === 'continue') {
      if (!group) throw error();
      group.push(cell);
    } else {
      group = cell.horizontalMerge === 'restart' ? [cell] : null;
      groups.push(group || [cell]);
    }
  }
  return groups.map(members => {
    if (members.length === 1) return members[0];
    const verticalMerge = members[0].verticalMerge;
    // A horizontal owner covers the complete union. A 2D continuation can
    // only inherit that exact rectangle: differing vertical states inside a
    // single horizontal group do not prove a common owner. Never promote the
    // anchor's vMerge to physical members which omitted or restarted it.
    if (members.some(cell => cell.verticalMerge !== verticalMerge)) throw error();
    return { type: 'tc', boxes: members[0].boxes,
      children: members.flatMap(cell => cell.children),
      gridSpan: members.reduce((sum, cell) => sum + (cell.gridSpan || 1), 0),
      verticalMerge, horizontalMerge: 'restart', sourceCells: members };
  });
}

function bindWordTableGrids(root, error) {
  const pending = [root];
  const textPresence = new WeakMap();
  function hasText(node) {
    if (typeof node === 'string') return /\S/u.test(node);
    if (!textPresence.has(node)) textPresence.set(node, node.children.some(hasText));
    return textPresence.get(node);
  }
  let gridSlots = 0;
  while (pending.length) {
    const node = pending.pop();
    if (typeof node === 'string') continue;
    for (const child of node.children) if (typeof child !== 'string') pending.push(child);
    if (node.type !== 'tbl') continue;
    if (node.children.length > MAX_WORD_TABLE_ROWS) throw error(true);
    let columns = node.gridColumns || 0;
    let complex = false;
    let horizontalSplitContent = false;
    let previousMerges = new Map();
    const rows = [];
    for (let rowIndex = 0; rowIndex < node.children.length; rowIndex++) {
      const row = node.children[rowIndex];
      let column = row.gridBefore || 0;
      // Word has special recovery rules for an offset larger than its declared
      // grid. Do not invent a conflicting label/value position for malformed
      // input; leave that case to the caller's truthful partial/failure path.
      if (node.gridColumns && (column > node.gridColumns || (row.gridAfter || 0) > node.gridColumns)) throw error();
      const cells = [];
      const merges = new Map();
      complex ||= column > 0 || (row.gridAfter || 0) > 0;
      for (const cell of horizontalWordCells(row, error)) {
        const span = cell.gridSpan || 1;
        const end = column + span;
        if (end > MAX_WORD_TABLE_COLUMNS) throw error(true);
        const positioned = { cell, column, span, continuationOf: null };
        if (cell.verticalMerge === 'continue') {
          const previous = previousMerges.get(column);
          // ISO/IEC 29500: continuation must cover exactly the same grid
          // columns in the immediately preceding row, not a nearby owner.
          if (!previous || previous.span !== span) throw error();
          positioned.continuationOf = previous.row;
          merges.set(column, previous);
        } else if (cell.verticalMerge === 'restart') {
          merges.set(column, { span, row: rowIndex });
        }
        complex ||= span !== 1 || Boolean(cell.verticalMerge);
        // A merged header split over physical payloads must use the explicit
        // field-aware projection, not an inferred GFM header such as Na<br>me.
        horizontalSplitContent ||= Boolean(cell.sourceCells && cell.sourceCells.filter(hasText).length > 1);
        cells.push(positioned);
        column = end;
      }
      column += row.gridAfter || 0;
      if (column > MAX_WORD_TABLE_COLUMNS) throw error(true);
      columns = Math.max(columns, column);
      rows.push({ row, cells });
      // Omitted/noncontinuing cells close the old merge. Never search past
      // another row or into another table (including nested tables).
      previousMerges = merges;
    }
    gridSlots += columns * rows.length;
    if (gridSlots > MAX_WORD_TABLE_GRID_SLOTS) throw error(true);
    node.grid = { columns, complex, horizontalSplitContent, rows };
  }
}

module.exports = { wordGridNumber, bindWordTableGrids, MAX_WORD_TABLE_COLUMNS };
