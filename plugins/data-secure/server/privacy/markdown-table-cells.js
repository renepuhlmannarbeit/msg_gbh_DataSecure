'use strict';

// Raw UTF-16 row geometry only. Semantic header, field, credential, review
// and restoration authority stays in each independent consumer.
// Value-only readers stream cells without retaining another range object per
// cell. Callbacks are fixed internal consumers; any failure propagates.
function scanTableCells(line, visit) {
  let firstVisible = 0, visibleEnd = line.length;
  while (firstVisible < visibleEnd && /\s/u.test(line[firstVisible])) firstVisible++;
  while (visibleEnd > firstVisible && /\s/u.test(line[visibleEnd - 1])) visibleEnd--;
  const bounds = { firstVisible, visibleEnd };
  let start = 0, escaped = false, leadingPipe = false, trailingPipe = false, separators = 0, count = 0;
  const emit = end => { count++; visit?.(start, end, bounds); };
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (escaped) { escaped = false; continue; }
    if (line.charCodeAt(index) === 0x5c) { escaped = true; continue; }
    if (character !== '|') continue;
    separators++;
    if (index === firstVisible) leadingPipe = true;
    else emit(index);
    trailingPipe = index === visibleEnd - 1;
    start = index + 1;
  }
  if (firstVisible < visibleEnd && !trailingPipe) emit(line.length);
  return { ...bounds, leadingPipe, trailingPipe, separators, count };
}

function tableCellRanges(line) {
  const ranges = [];
  scanTableCells(line, (start, end) => ranges.push({ start, end }));
  return ranges;
}

function unescapeMarkdownPunctuation(value) {
  return value.replace(/\\([\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e])/gu, '$1');
}

module.exports = Object.freeze({ scanTableCells, tableCellRanges, unescapeMarkdownPunctuation });
