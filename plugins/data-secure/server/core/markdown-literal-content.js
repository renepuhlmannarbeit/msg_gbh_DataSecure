'use strict';

// Source-type serialization, never image detection or privacy normalization.
// TXT/CSV/Office literal characters are data, not author-created Markdown.
// Callers own their input/output resource limits and source field boundaries.
function literalTableCell(value, everySpace = false, literalGfm = true) {
  let text = String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/([\\`*_[\]{}()#+.!|])/gu, '\\$1');
  if (literalGfm) text = text.replace(/~/gu, '\\~');
  text = everySpace ? text.replace(/ /gu, '&#32;') : text
    .replace(/^ +| +$/gmu, spaces => '&#32;'.repeat(spaces.length))
    .replace(/ {2,}/gu, spaces => ' ' + '&#32;'.repeat(spaces.length - 1));
  return text.replace(/\t/gu, '&#9;').replace(/\r/gu, '&#13;').replace(/\n/gu, '<br>');
}

module.exports = Object.freeze({ literalTableCell });
