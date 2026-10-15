'use strict';

// Presentation of extracted PDF/image text and explicitly literal TXT only.
// Native Markdown/code sources do not pass through here. No OCR repair,
// guessing, reordering or deletion.
const { validateMarkdownText, MAX_MARKDOWN_CHARS, MarkdownContractError } = require('./markdown-contract');
const { validateContacts } = require('../core/ocr-contact-review');

function readableText(source, contacts = [], literalWhitespace = false) {
  validateMarkdownText(source);
  validateContacts(contacts, source, 'pdf');
  const blockEscapes = new Set();
  const indentation = new Set();
  for (const match of source.matchAll(/(^|\r\n|\r|\n)([ \t]*)([^\r\n]*)/gu)) {
    const start = match.index + match[1].length, bodyStart = start + match[2].length;
    if (literalWhitespace || match[2].includes('\t') || match[2].length >= 4) {
      for (let i = start; i < bodyStart; i++) indentation.add(i);
    }
    if (literalWhitespace) {
      // Preserve material indentation, tabs, repeated and trailing spaces as
      // visible source characters, not CommonMark code/list indentation.
      const line = match[2] + match[3];
      const trailingStart = /[ \t]+$/u.exec(line)?.index ?? line.length;
      for (let offset = 0; offset < line.length; offset++) {
        if (line[offset] === '\t' || (line[offset] === ' ' &&
            (line[offset - 1] === ' ' || offset >= trailingStart))) {
          indentation.add(start + offset);
        }
      }
    }
    const body = match[3];
    if (/^(?:#{1,6}(?:\s|$)|[>]|[-+](?:\s|$))/u.test(body)) blockEscapes.add(bodyStart);
    if (/^(?:[-=_]{3,}|(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})[ \t]*$/u.test(body)) blockEscapes.add(bodyStart);
    const ordered = /^\d{1,9}([.)])(?=\s|$)/u.exec(body);
    if (ordered) blockEscapes.add(bodyStart + ordered[0].length - 1);
  }
  let markdown = '';
  const mapped = [];
  const append = value => {
    if (markdown.length + value.length > MAX_MARKDOWN_CHARS) throw new MarkdownContractError('TEXT_TOO_LARGE');
    markdown += value;
  };
  function prose(from, to) {
    for (let i = from; i < to; i++) {
      const character = source[i];
      if (character === '\r' || character === '\n') {
        // Hard breaks preserve extracted lines without making an entire page
        // a code block. Keep CR/LF variants, blank lines and source whitespace.
        if (i > 0 && !/[\r\n]/u.test(source[i - 1])) append('  ');
        if (character === '\r' && source[i + 1] === '\n' && i + 1 < to) { append('\r\n'); i++; }
        else append(character);
      } else if (indentation.has(i)) append(character === '\t' ? '&#9;' : '&#32;');
      else if (character === '&') append('\\&');
      else if (character === '<') append('&lt;');
      else if (character === '>') append('&gt;');
      else if (/[\\`*\[\]|~]/u.test(character) || blockEscapes.has(i) ||
          (character === '_' && !( /[\p{L}\p{N}]/u.test(source[i - 1] || '') && /[\p{L}\p{N}]/u.test(source[i + 1] || '') ))) {
        append('\\' + character);
      } else append(character);
    }
  }
  let cursor = 0;
  for (const contact of contacts) {
    prose(cursor, contact.start);
    const value = source.slice(contact.start, contact.end);
    // Contact review must show EXACT original OCR characters. For Markdown-
    // significant values use a small inline literal, never escaped fake OCR
    // characters or a page-sized code block. Corrections remain inside it.
    // Always a literal: a later valid correction can introduce punctuation
    // absent from the original OCR value (for example a*b*@example.invalid).
    const literal = true;
    let fence = '', padding = '';
    if (literal) {
      let longest = 0;
      for (const match of value.matchAll(/`+/gu)) longest = Math.max(longest, match[0].length);
      fence = '`'.repeat(longest + 1);
      padding = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
      append(fence + padding);
    }
    const start = markdown.length;
    append(value);
    mapped.push({ ...contact, start, end: markdown.length });
    if (literal) append(padding + fence);
    cursor = contact.end;
  }
  prose(cursor, source.length);
  validateMarkdownText(markdown);
  validateContacts(mapped, markdown, 'pdf');
  return { markdown, contacts: mapped };
}

function literalText(source) {
  return readableText(source, [], true).markdown;
}

function readableNotice({ image = false, symbols = false, ocr = false, contacts = false,
  disagreement = false, lowConfidence = false, unscored = false } = {}) {
  const notes = [];
  if (image) notes.push('Grafiken und ihre visuelle Anordnung sind nicht enthalten.');
  if (ocr) notes.push('Text aus Bildern wurde übernommen; Lesefehler und Auslassungen sind möglich.');
  if (contacts) notes.push('Erkannte Kontaktwerte bitte mit dem Original vergleichen.');
  if (disagreement) notes.push('Die Nachprüfung lieferte abweichende Lesarten.');
  if (lowConfidence) notes.push('Einige Wörter wurden unsicher erkannt.');
  if (unscored) notes.push('Die Erkennungssicherheit ist teilweise unbekannt.');
  if (symbols) notes.push('Nicht lesbare Symbolzeichen wurden ausgelassen.');
  return notes.length ? '> Hinweis: ' + notes.join(' ') : '';
}

module.exports = Object.freeze({ readableText, literalText, readableNotice });
