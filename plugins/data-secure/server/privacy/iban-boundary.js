'use strict';

const { EMAIL_RE, IBAN_RE, IBAN_SEPARATOR_CHARS, PHONE_LABEL_PATTERN } = require('./base');

// Boundary hints, deliberately not an IBAN validity check. A bad checksum or
// an unsupported/malformed country layout must still retain the broad detector.
// DE: Bundesbank https://www.bundesbank.de/en/tasks/payment-systems/services/iban-rules
// AT/BE/DE/GB/NL: SWIFT IBAN Registry, release 102 (June 2026):
// https://www.swift.com/swift-resource/9606/download
// Only AT/BE/DE have exclusively numeric BBANs. The known total lengths also
// let GB/NL stop before following prose; all other countries remain on the
// existing conservative detection path.
const IBAN_TOTAL_LENGTHS = Object.freeze({ AT: 20, BE: 16, DE: 22, GB: 22, NL: 18 });
const NUMERIC_IBAN_LENGTHS = Object.freeze({ AT: 20, BE: 16, DE: 22 });
const SPACE_RE = /[ \t\u00a0\u202f\u2007]/u;
const IBAN_SEPARATOR_RE = new RegExp(`[${IBAN_SEPARATOR_CHARS}]`, 'u');
// Separate sticky instances must not change the enclosing detector's lastIndex.
const NEXT_EMAIL_RE = new RegExp(EMAIL_RE.source, EMAIL_RE.flags.replace('g', 'y'));
const NEXT_IBAN_RE = new RegExp(IBAN_RE.source, IBAN_RE.flags.replace('g', 'y'));
const FOLLOWER_LABEL_RE = new RegExp(
  `(?:iban|bic|swift(?:[\\s-]?code)?|bank\\s+identifier\\s+code|${PHONE_LABEL_PATTERN})(?![\\p{L}\\p{N}_])`,
  'iyu'
);
// These form labels are backed by independent redactors/residual gates. They
// are therefore safe boundaries; an arbitrary "Wort:" is not.
const SAFE_FORM_FIELD_LABEL_PATTERN = [
  'e-?mail|mail',
  'name|vor-?[ \\t]*und[ \\t]*nachname',
  'ansprechpartner(?:in)?|kontaktperson|autor(?:in)?|verfasser(?:in)?',
  'empfänger(?:in)?|absender(?:in)?|unterzeichner(?:in)?|gesprächspartner(?:in)?',
  'adresse|anschrift|kundennummer',
  'passwort|kennwort|passphrase|secret|token|api(?:[ \\t-]+)?key',
  'zugangsdaten|zugangscode|pin|benutzername|nutzername|username',
  'login(?:name)?|anmeldename|kontokennung'
].join('|');
const SAFE_FORM_FIELD_LABEL_RE = new RegExp(
  `(?:${SAFE_FORM_FIELD_LABEL_PATTERN})[ \\t\\u00a0\\u202f\\u2007]*:`,
  'iyu'
);
const FORM_FIELD_LABEL_RE = /(?:\p{L}[\p{L}\p{M}\p{N}_-]*)(?:[ \t\u00a0\u202f\u2007]+\p{L}[\p{L}\p{M}\p{N}_-]*){0,3}[ \t\u00a0\u202f\u2007]*:/iyu;
function identifierStartsAt(text, start) {
  for (const detector of [NEXT_EMAIL_RE, NEXT_IBAN_RE]) {
    detector.lastIndex = start;
    if (detector.test(text)) return true;
  }
  return false;
}

function followerLabelStartsAt(text, start) {
  FOLLOWER_LABEL_RE.lastIndex = start;
  if (FOLLOWER_LABEL_RE.test(text)) return true;
  SAFE_FORM_FIELD_LABEL_RE.lastIndex = start;
  return SAFE_FORM_FIELD_LABEL_RE.test(text);
}

function formFieldLabelEnd(text, start) {
  FORM_FIELD_LABEL_RE.lastIndex = start;
  const match = FORM_FIELD_LABEL_RE.exec(text);
  return match ? match.index + match[0].length : null;
}

function numericFormValueEnd(text, start) {
  let cursor = start, end = start;
  while (cursor < text.length) {
    const character = text[cursor];
    if (/[0-9]/u.test(character)) end = cursor + 1;
    else if (!/[+ \t\u00a0\u202f\u2007().\/\-\u2010\u2011\u2012\u2013\u2212]/u.test(character)) break;
    cursor++;
  }
  return end;
}

// Consume exactly one bounded visual grouping token: a whitespace run, or one
// punctuation separator with optional whitespace around it. Return the input
// offset when no separator begins there.
function separatorTokenEnd(text, start) {
  let cursor = start;
  while (SPACE_RE.test(text[cursor] || '')) cursor++;
  if (/[.\/\-\u2010\u2011\u2012\u2013\u2212]/u.test(text[cursor] || '')) {
    cursor++;
    while (SPACE_RE.test(text[cursor] || '')) cursor++;
    return cursor;
  }
  return cursor > start ? cursor : start;
}

// This is independent of country-specific prose/length hints. An existing
// broad match must never consume the beginning of a separate email or IBAN,
// including after intervening print groups and for alphanumeric BBAN countries.
function separateIdentifierBoundary(text, start, originalEnd) {
  for (let cursor = start + 4; cursor < originalEnd; cursor++) {
    if (!IBAN_SEPARATOR_RE.test(text[cursor])) continue;
    const boundary = cursor;
    while (IBAN_SEPARATOR_RE.test(text[cursor] || '')) cursor++;
    if (cursor < originalEnd && identifierStartsAt(text, cursor)) return boundary;
  }
  return null;
}

function separateFollowerLabelBoundary(text, start, originalEnd) {
  for (let cursor = start + 4; cursor < originalEnd; cursor++) {
    if (!IBAN_SEPARATOR_RE.test(text[cursor])) continue;
    const boundary = cursor;
    while (IBAN_SEPARATOR_RE.test(text[cursor] || '')) cursor++;
    if (cursor < originalEnd && followerLabelStartsAt(text, cursor)) return boundary;
  }
  return null;
}

function ibanBoundaryEnd(text, match) {
  const originalEnd = match.index + match[0].length;
  const separateEnd = separateIdentifierBoundary(text, match.index, originalEnd);
  const separateLabelEnd = separateFollowerLabelBoundary(text, match.index, originalEnd);
  const country = match[0].slice(0, 2).toUpperCase();
  const length = IBAN_TOTAL_LENGTHS[country];
  if (!length) return separateEnd ?? originalEnd;
  const numericBban = NUMERIC_IBAN_LENGTHS[country] !== undefined;

  // Work on the caller's offset-preserving identifier view. Do not normalize
  // the source, inspect a checksum or truncate merely at a country's length.
  let cursor = match.index + 2;
  for (let count = 2; count < length; count++) {
    if (count >= 4) cursor = separatorTokenEnd(text, cursor);
    if (!(numericBban ? /[0-9]/u : /[A-Z0-9]/iu).test(text[cursor] || '')) {
      // OCR 0/O substitutions in a numeric country must remain protected, but
      // a later explicit label must not be swallowed with its value.
      if (numericBban && separateLabelEnd !== null) return separateLabelEnd;
      return separateEnd ?? originalEnd;
    }
    cursor++;
  }
  if (cursor > originalEnd) return originalEnd;

  const next = separatorTokenEnd(text, cursor);
  if (next === cursor) return originalEnd;
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
        if (identifierStartsAt(text, scan) || followerLabelStartsAt(text, scan)) return end;
        const labelEnd = formFieldLabelEnd(text, scan);
        if (labelEnd !== null) {
          // Unknown labels are not safe release boundaries. If they introduce
          // a number, retain that value in the conservative bank span rather
          // than exposing it because no other detector owns the label.
          return Math.max(originalEnd, numericFormValueEnd(text, labelEnd));
        }
        componentStart = false;
      }
      if (/[0-9]/u.test(character)) end = scan + 1;
      else if (!/[ \t\u00a0\u202f\u2007().\/\-\u2010\u2011\u2012\u2013\u2212]/u.test(character)) break;
      // Dot and hyphen can belong to an email's local part, but the complete
      // token was already checked before consuming its first digit. Treat each
      // later visual group as a new component so an explicit follower label
      // after a numeric continuation cannot be swallowed by the bank span.
      else componentStart = true;
    }
    return Math.max(originalEnd, end);
  }

  // A known fixed-length IBAN cannot continue after its country length. Once
  // a visible separator follows it, retain the following label, BIC or prose
  // independently of capitalization. A digit continuation remains
  // conservative in the branch above.
  return cursor;
}

module.exports = { ibanBoundaryEnd };
