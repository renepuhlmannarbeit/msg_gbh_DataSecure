'use strict';

const { EMAIL_RE, IBAN_RE } = require('./base');

// Boundary hints, deliberately not an IBAN validity check. A bad checksum or
// an unsupported/malformed country layout must still retain the broad detector.
// DE: Bundesbank https://www.bundesbank.de/en/tasks/payment-systems/services/iban-rules
// AT/BE/DE: SWIFT IBAN Registry, release 102 (June 2026), pp. 11, 14, 24:
// https://www.swift.com/swift-resource/9606/download
// These three BBANs are exclusively numeric. Alphanumeric BBANs and the rest
// of the registry remain on the existing conservative detection path.
const NUMERIC_IBAN_LENGTHS = Object.freeze({ AT: 20, BE: 16, DE: 22 });
const SPACE_RE = /[ \t\u00a0\u202f\u2007]/u;
// Separate sticky instances must not change the enclosing detector's lastIndex.
const NEXT_EMAIL_RE = new RegExp(EMAIL_RE.source, EMAIL_RE.flags.replace('g', 'y'));
const NEXT_IBAN_RE = new RegExp(IBAN_RE.source, IBAN_RE.flags.replace('g', 'y'));
// Only an entire, separate prose-shaped line tail qualifies. A lone word,
// four-character print groups, uppercase codes, digits, mixed-case tokens,
// punctuation inside a token and unfinished/long tails remain ambiguous.
const PROSE_TAIL_RE = /^[ \t\u00a0\u202f\u2007]+[a-zäöüß]{5,}(?:[ \t\u00a0\u202f\u2007]+[A-ZÄÖÜ]?[a-zäöüß]{2,})+[.!?]?[ \t\u00a0\u202f\u2007]*$/u;

function identifierStartsAt(text, start) {
  for (const detector of [NEXT_EMAIL_RE, NEXT_IBAN_RE]) {
    detector.lastIndex = start;
    if (detector.test(text)) return true;
  }
  return false;
}

// This is independent of country-specific prose/length hints. An existing
// broad match must never consume the beginning of a separate email or IBAN,
// including after intervening print groups and for alphanumeric BBAN countries.
function separateIdentifierBoundary(text, start, originalEnd) {
  for (let cursor = start + 4; cursor < originalEnd; cursor++) {
    if (!SPACE_RE.test(text[cursor])) continue;
    const boundary = cursor;
    while (SPACE_RE.test(text[cursor] || '')) cursor++;
    if (cursor < originalEnd && identifierStartsAt(text, cursor)) return boundary;
  }
  return null;
}

function ibanBoundaryEnd(text, match) {
  const originalEnd = match.index + match[0].length;
  const separateEnd = separateIdentifierBoundary(text, match.index, originalEnd);
  if (separateEnd !== null) return separateEnd;
  const length = NUMERIC_IBAN_LENGTHS[match[0].slice(0, 2).toUpperCase()];
  if (!length) return originalEnd;

  // Work on the caller's offset-preserving identifier view. Do not normalize
  // the source, inspect a checksum or truncate merely at a country's length.
  let cursor = match.index + 2;
  for (let count = 2; count < length; count++) {
    if (count >= 4 && SPACE_RE.test(text[cursor] || '')) cursor++;
    if (!/[0-9]/u.test(text[cursor] || '')) return originalEnd;
    cursor++;
  }
  if (cursor > originalEnd || !SPACE_RE.test(text[cursor] || '')) return originalEnd;

  let next = cursor;
  while (SPACE_RE.test(text[next] || '')) next++;
  if (identifierStartsAt(text, next)) return cursor;

  // A numeric continuation is NOT evidence for a shorter IBAN. Keep it in the
  // bank span, including an entire long telephone-shaped suffix which the
  // broad detector's 34-character cap otherwise leaves partly in clear text.
  // Do not reinterpret that ambiguous suffix as a validated bank/phone number.
  if (/[0-9]/u.test(text[next] || '')) {
    let end = cursor, componentStart = true;
    for (let scan = next; scan < text.length; scan++) {
      const character = text[scan];
      // Inspect each separate component BEFORE consuming its first digit.
      // Math.max(originalEnd, end) is only safe when no subsequent identifier
      // exists: the original greedy match may already overlap that identifier.
      if (componentStart && !SPACE_RE.test(character)) {
        if (identifierStartsAt(text, scan)) return end;
        componentStart = false;
      }
      if (/[0-9]/u.test(character)) end = scan + 1;
      else if (!/[ \t\u00a0\u202f\u2007().\/\-\u2010\u2011\u2012\u2013\u2212]/u.test(character)) break;
      // Dot and ASCII hyphen can belong to an email's local part; its complete
      // token was already checked at the component start. Do not repeatedly
      // rescan that token from each punctuation character.
      else if (SPACE_RE.test(character) || /[()\/\u2010\u2011\u2012\u2013\u2212]/u.test(character)) componentStart = true;
    }
    return Math.max(originalEnd, end);
  }

  // Bound the lookahead and require the complete line, not just the word the
  // greedy 34-character detector happened to include. In particular do not
  // trim a numeric or code continuation simply because prose appears later.
  const tail = text.slice(cursor, cursor + 257).split(/[\r\n]/u, 1)[0];
  if (tail.length > 256 || !PROSE_TAIL_RE.test(tail)) return originalEnd;
  return cursor;
}

module.exports = { ibanBoundaryEnd };
