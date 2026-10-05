'use strict';

// A private-use/replacement glyph has no interoperable textual meaning without
// its original font. Omit only an entire undecodable symbol run, never letters,
// digits, mathematical symbols, arrows, checkboxes or a mixed text run. This is
// not a language/gibberish detector and must not guess what a graphic depicts.
function unreadableSymbolRun(value) {
  return typeof value === 'string' && /[\p{Co}\uFFFD]/u.test(value) &&
    /^[\p{Co}\uFFFD\p{Z}\p{P}\t\r\n]+$/u.test(value);
}

function cleanOcrSymbolLines(text) {
  let omitted = false;
  const cleaned = (text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/gu) || []).map(line => {
    if (!unreadableSymbolRun(line)) return line;
    omitted = true;
    // Keep the original record boundary, not an invented link between words.
    return /(?:\r\n|\r|\n)$/u.exec(line)?.[0] || '';
  }).join('');
  return { text: cleaned, omitted };
}

const SYMBOL_NOTICE = '> Grafikhinweis: Nicht lesbare Symbolzeichen wurden ausgelassen. Ihre Bedeutung wurde nicht als Text rekonstruiert.';
const IMAGE_NOTICE = '> Grafikhinweis: Die Grafik selbst ist nicht im Markdown enthalten. Lokal erkannter Bildtext ist übernommen, kann aber unvollständig sein. Bildinhalt und visuelle Anordnung werden nicht automatisch beschrieben.';

function visualNotices({ image = false, symbols = false } = {}) {
  return [image ? IMAGE_NOTICE : '', symbols ? SYMBOL_NOTICE : ''].filter(Boolean).join('\n\n');
}

module.exports = Object.freeze({ unreadableSymbolRun, cleanOcrSymbolLines, visualNotices });
