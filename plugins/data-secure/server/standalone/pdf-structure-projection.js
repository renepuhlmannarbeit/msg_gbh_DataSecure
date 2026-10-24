'use strict';

// Caller owns the same-page, complete MCID model. This is not a wire grant.
// All text still enters the normal Markdown/source/privacy/publication gates.
const { nativeTextSeparator } = require('./pdf-text-layout');
const { unreadableSymbolRun, cleanExtractedSymbolText } = require('./markdown-visuals');
const { readableText } = require('./readable-markdown');
const { renderTableCells } = require('../office-table-projection');
const { MAX_MARKDOWN_CHARS } = require('./markdown-contract');
const limit = () => { throw Object.assign(new Error('TEXT_TOO_LARGE'), { code: 'TEXT_TOO_LARGE' }); };
function projectTaggedPdf(layout) {
  if (!layout?.applied) return null;
  let symbols = false, characters = 0;
  function plain(items) {
    let text = '', previous;
    for (const item of items) {
      if (!Object.hasOwn(item, 'str')) continue;
      if (item.str.trim() && !text.endsWith('\n')) {
        const separator = nativeTextSeparator(previous, item);
        if (separator === '\n' || (separator && !/\s/u.test(text.slice(-1)) && !/^\s/u.test(item.str))) text += separator;
      }
      if (unreadableSymbolRun(item.str)) { symbols = true; text += item.hasEOL ? '\n' : ' '; }
      else { const cleaned = cleanExtractedSymbolText(item.str); symbols ||= cleaned.omitted; text += cleaned.text + (item.hasEOL ? '\n' : ''); }
      if (item.hasEOL) previous = undefined; else if (item.str.trim()) previous = item;
      if (text.length > MAX_MARKDOWN_CHARS) limit();
    }
    return text;
  }
  const cellText = text => readableText(text).markdown.replace(/(?:  )?(?:\r\n|\r|\n)/gu, '<br>');
  const sections = [];
  for (const block of layout.blocks) {
    let markdown;
    if (block.kind === 'paragraph') markdown = readableText(plain(block.items)).markdown;
    else {
      const rows = block.rows.map((row, index) => ({ number:index+1, header:block.headerRow===index+1,
        cells:row.cells.map((cell, column) => ({ column, span:1, continuationOf:null, text:plain(cell.items).trimEnd() })) }));
      if (block.headerRow === 1) {
        const lines = rows.map(row => '| ' + row.cells.map(cell => cellText(cell.text)).join(' | ') + ' |');
        lines.splice(1, 0, '| ' + rows[0].cells.map(() => '---').join(' | ') + ' |'); markdown = lines.join('\n');
      } else {
        // Actual TR/cell ownership plus the shared closed-label projection,
        // never a generated first-row header or a guessed column from X/Y.
        markdown = renderTableCells(rows, { escapeCell:cellText });
      }
    }
    characters += markdown.length + (sections.length ? 2 : 0);
    if (characters > MAX_MARKDOWN_CHARS) limit(); sections.push(markdown);
  }
  return Object.freeze({ markdown:sections.join('\n\n'), omittedSymbols:symbols });
}
module.exports = Object.freeze({ projectTaggedPdf });
