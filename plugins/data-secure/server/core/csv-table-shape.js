'use strict';

// Owned dense string records from parseCsvDialect, never renderer data. Both
// projections keep its empty-record exception and exact authored field values.
function csvTableWidth(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('CSV_EMPTY');
  let width = 0;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length === 0 || row.some(value => typeof value !== 'string'))
      throw new Error('CSV_ROW_WIDTH_INVALID');
    width = Math.max(width, row.length);
  }
  for (const row of rows) if (row.length !== width && !(row.length === 1 && row[0].trim() === ''))
    throw new Error('CSV_ROW_WIDTH_INVALID');
  return width;
}

module.exports = Object.freeze({ csvTableWidth });
