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

// Only for decoded PDF/OCR text, BEFORE contact spans and immutable Markdown
// are created. Never run this over a user's literal TXT/Markdown/code file or
// over an already published result. A boundary replaces non-text controls so
// two identifiers cannot silently become one word. NEL, tabs and line endings
// remain, as do all letters, combining marks, format controls and symbols.
// Private-use/replacement characters inside meaningful text are ambiguous:
// retain them rather than inventing a spelling (or deleting a person's name).
function cleanExtractedSymbolText(text) {
  let controlsOmitted = false;
  const bounded = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u0084\u0086-\u009F\p{Noncharacter_Code_Point}]/gu, () => {
    controlsOmitted = true;
    return ' ';
  });
  const result = cleanOcrSymbolLines(bounded);
  return { text: result.text, omitted: controlsOmitted || result.omitted };
}

const SYMBOL_NOTICE = '> Grafikhinweis: Nicht lesbare Symbolzeichen wurden ausgelassen. Ihre Bedeutung wurde nicht als Text rekonstruiert.';
const IMAGE_NOTICE = '> Grafikhinweis: Die Grafik selbst ist nicht im Markdown enthalten. Lokal erkannter Bildtext ist übernommen, kann aber unvollständig sein. Bildinhalt und visuelle Anordnung werden nicht automatisch beschrieben.';

function visualNotices({ image = false, symbols = false } = {}) {
  return [image ? IMAGE_NOTICE : '', symbols ? SYMBOL_NOTICE : ''].filter(Boolean).join('\n\n');
}

module.exports = Object.freeze({ unreadableSymbolRun, cleanOcrSymbolLines, cleanExtractedSymbolText, visualNotices });
