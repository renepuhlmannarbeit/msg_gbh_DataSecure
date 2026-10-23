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

function bindWordTableGrids(root, error) {
  const pending = [root];
  let gridSlots = 0;
  while (pending.length) {
    const node = pending.pop();
    if (typeof node === 'string') continue;
    for (const child of node.children) if (typeof child !== 'string') pending.push(child);
    if (node.type !== 'tbl') continue;
    if (node.children.length > MAX_WORD_TABLE_ROWS) throw error(true);
    let columns = node.gridColumns || 0;
    let complex = false;
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
      for (const cell of row.children) {
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
    node.grid = { columns, complex, rows };
  }
}

module.exports = { wordGridNumber, bindWordTableGrids, MAX_WORD_TABLE_COLUMNS };
