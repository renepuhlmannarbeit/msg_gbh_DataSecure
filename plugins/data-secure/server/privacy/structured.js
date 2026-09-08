'use strict';

const {
  EMAIL_RE,
  CONTACT_URI_RE,
  PHONE_RE,
  PHONE_LABEL_RE,
  PHONE_LABEL_WINDOW,
  FRENCH_PHONE_RE,
  IBAN_RE,
  BIC_RE,
  BIC_LABEL_RE,
  IP_RE,
  IPV6_RE,
  POSTAL_ADDRESS_RE,
  STREET_ADDRESS_RE,
  DATE_OF_BIRTH_RE,
  DATE_OF_BIRTH_LABEL_RE,
  VEHICLE_PLATE_RE,
  VEHICLE_PLATE_LABEL_RE,
  DE_TAX_RE,
  DE_TAX_LABEL_RE,
  DE_SV_RE,
  CREDIT_RE,
  LABELED_ID_RE,
  ID_LABEL_HEADER_RE,
  TABLE_ID_CELL_RE,
  CREDENTIAL_FIELD_RE,
  CREDENTIAL_LABEL_HEADER_RE,
  tableHeadersAt,
  identifierDetectionText,
  hashShort,
  luhnValid,
  hasLabelBefore,
  plausibleCalendarDate,
  tableHeaderAt,
  sameLineHasIban
} = require('./base');
const { placeholderSpans, applySpans } = require('./spans');
const { ibanBoundaryEnd } = require('./iban-boundary');
const FOLLOWING_EMAIL_RE = new RegExp(EMAIL_RE.source, EMAIL_RE.flags.replace('g', 'y'));
// Five digits followed by a unit are far more likely to be a quantity than a
// German postcode and city. Keep this semantic exclusion beside the detector
// so the postal regex remains line-local and the gate shares the same rule.
const POSTAL_QUANTITY_RE = /^\d{5}[ \t]+(?:Euro|EUR|Stück|Stueck|Punkte|Stunden|Tage|Monate|Jahre|Prozent|Einwohner|Exemplare|Teile|kg|km|qm|m²|Liter)(?:[ \t]|$)/iu;
const MONTH_YEAR_STREET_FALSE_POSITIVE_RE = /^Im[ \t]+(?:Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)[ \t]+\d{4}$/iu;

// A Markdown converter may preserve URI punctuation with a preceding
// backslash. Keep it inside the redacted URI token instead of stopping before
// the escaped address.
const ADDRESS_URI_CHARACTER_RE = /[\p{L}\p{N}%+._~:/?&=@\\\-]/u;
const PHONE_PARAMETER_CHARACTER_RE = /[\p{L}\p{N}%+._~:/?&=@;,#\-]/u;
function uriTokenEnd(text, start, characters = ADDRESS_URI_CHARACTER_RE) {
  let end = start;
  while (end < text.length) {
    const character = String.fromCodePoint(text.codePointAt(end));
    if (!characters.test(character)) break;
    end += character.length;
  }
  return end;
}

// Scan once in source coordinates; never decode/evaluate a URI or allocate a
// transformed payload. Only ASCII percent triplets relevant to the telephone
// grammar are interpreted. Unknown encoded payloads retain conservative whole-
// token redaction instead of creating an encoding bypass by trimming them.
function contactUriEnd(text, match) {
  const start = match.index + match[0].length;
  const scheme = match[1].toLowerCase();
  // Callto also names users (including 123alice / 123.alice). It is not a
  // telephone-only scheme and must retain its complete address token.
  if (!['tel', 'sms'].includes(scheme)) return uriTokenEnd(text, start);
  let cursor = start, end = start, digits = false, parentheses = 0, previous = '';
  while (cursor < text.length) {
    let character = text[cursor], next = cursor + 1;
    if (character === '%' && /^[a-f0-9]{2}$/iu.test(text.slice(cursor + 1, cursor + 3))) {
      character = String.fromCharCode(Number.parseInt(text.slice(cursor + 1, cursor + 3), 16));
      next = cursor + 3;
    }
    if (/[0-9]/u.test(character)) { digits = true; end = next; }
    else if (character === '+' && (!digits || (scheme === 'sms' && previous === ','))) { /* dial prefix */ }
    else if (character === '(') { parentheses++; }
    else if (character === ')' && parentheses > 0) { parentheses--; if (digits) end = next; }
    else if (/[.\/\- \t]/u.test(character) || (scheme === 'sms' && character === ',')) { /* internal separator */ }
    else if (digits && (character === ';' || character === '?')) {
      return Math.max(next, uriTokenEnd(text, next, PHONE_PARAMETER_CHARACTER_RE));
    } else if (text[cursor] === '%') {
      return Math.max(end, uriTokenEnd(text, cursor));
    } else break;
    previous = character;
    cursor = next;
  }
  // Non-numeric legacy payloads keep their former conservative token boundary.
  // A recognized number ends at its last digit
  // (or its own closing parenthesis), never at trailing punctuation/prose.
  return digits ? end : uriTokenEnd(text, start);
}

// One declarative table drives both the redactor and the residual gate. The
// previous split between scanStructured() and replaceStructured() meant the
// gate reported identifier classes the redactor never removed (the bare
// 11-digit tax id, and every phone shape without a label), so those documents
// could never pass the gate no matter how often they were processed.
const DETECTORS = [
  {
    type: 'CREDENTIAL',
    re: CREDENTIAL_FIELD_RE,
    placeholder: '[CREDENTIAL_REDACTED]',
    priority: 96,
    valueGroup: 2,
    accept: (_value, text, start) => !isSetextHeadingLine(text, start)
  },
  {
    type: 'CONTACT_URI',
    re: CONTACT_URI_RE,
    matchEnd: contactUriEnd,
    identifierView: true,
    placeholder: '[CONTACT_REDACTED]',
    priority: 91
  },
  {
    type: 'EMAIL',
    re: EMAIL_RE,
    identifierView: true,
    placeholder: '[EMAIL_REDACTED]',
    priority: 90
  },
  {
    type: 'IBAN',
    re: IBAN_RE,
    boundaryEnd: ibanBoundaryEnd,
    identifierView: true,
    placeholder: '[BANK_DATA_REDACTED]',
    priority: 88
  },
  {
    type: 'CREDIT_CARD',
    re: CREDIT_RE,
    placeholder: '[BANK_DATA_REDACTED]',
    priority: 87,
    accept: (value) => luhnValid(value)
  },
  {
    type: 'BIC',
    re: BIC_RE,
    identifierView: true,
    placeholder: '[BANK_DATA_REDACTED]',
    priority: 86,
    accept: (value, text, index) =>
      hasLabelBefore(text, index, BIC_LABEL_RE) || sameLineHasIban(text, index)
  },
  {
    type: 'DE_SOCIAL_SECURITY',
    re: DE_SV_RE,
    placeholder: '[ID_REDACTED]',
    priority: 84
  },
  {
    type: 'DE_TAX_ID',
    re: DE_TAX_RE,
    placeholder: '[ID_REDACTED]',
    priority: 83,
    accept: (value, text, index) => hasLabelBefore(text, index, DE_TAX_LABEL_RE)
  },
  {
    type: 'REFERENCE_ID',
    re: LABELED_ID_RE,
    placeholder: '[ID_REDACTED]',
    priority: 82,
    valueGroup: 3,
    trimValue: true
  },
  {
    // The same reference labels as a Markdown table header: every bare
    // identifier cell below "| Personalnummer |" belongs to that label.
    type: 'REFERENCE_ID',
    re: TABLE_ID_CELL_RE,
    placeholder: '[ID_REDACTED]',
    priority: 82,
    accept: (value, text, index) => {
      const header = tableHeaderAt(text, index);
      return header !== null && ID_LABEL_HEADER_RE.test(header);
    }
  },
  {
    type: 'DATE_OF_BIRTH',
    re: DATE_OF_BIRTH_RE,
    placeholder: '[DATE_REDACTED]',
    priority: 81,
    accept: (value, text, index) => hasLabelBefore(text, index, DATE_OF_BIRTH_LABEL_RE)
  },
  {
    type: 'VEHICLE_PLATE',
    re: VEHICLE_PLATE_RE,
    placeholder: '[ID_REDACTED]',
    priority: 81,
    accept: (value, text, index) => hasLabelBefore(text, index, VEHICLE_PLATE_LABEL_RE)
  },
  {
    type: 'PHONE',
    re: PHONE_RE,
    identifierView: true,
    placeholder: '[PHONE_REDACTED]',
    priority: 80,
    accept: (value, text, index) =>
      !plausibleCalendarDate(value.trim()) &&
      (value.trim().startsWith('+') || hasLabelBefore(text, index, PHONE_LABEL_RE, PHONE_LABEL_WINDOW))
  },
  {
    type: 'PHONE',
    re: FRENCH_PHONE_RE,
    identifierView: true,
    placeholder: '[PHONE_REDACTED]',
    priority: 80,
    accept: (value, text, index) =>
      !plausibleCalendarDate(value.trim()) &&
      (value.trim().startsWith('+') || hasLabelBefore(text, index, PHONE_LABEL_RE, PHONE_LABEL_WINDOW))
  },
  {
    type: 'IP',
    re: IP_RE,
    placeholder: '[IP_REDACTED]',
    priority: 78
  },
  {
    type: 'IPV6',
    re: IPV6_RE,
    placeholder: '[IP_REDACTED]',
    priority: 78
  },
  {
    type: 'STREET_ADDRESS',
    re: STREET_ADDRESS_RE,
    placeholder: '[LOCATION_REDACTED]',
    priority: 77,
    accept: (value) => !MONTH_YEAR_STREET_FALSE_POSITIVE_RE.test(value)
  },
  {
    type: 'POSTAL_ADDRESS',
    re: POSTAL_ADDRESS_RE,
    placeholder: '[LOCATION_REDACTED]',
    priority: 76,
    accept: (value) => !POSTAL_QUANTITY_RE.test(value)
  }
];

// Return GFM cells together with exact source coordinates. Unlike a raw pipe
// regex this understands optional outer pipes and escaped `\|` characters, so
// replacing a secret cannot corrupt the table that carried it.
function markdownCellsWithOffsets(line, lineStart) {
  const first = line.search(/\S/u);
  if (first < 0) return null;
  let last = line.length;
  while (last > first && /\s/u.test(line[last - 1])) last--;
  let bodyStart = first;
  let bodyEnd = last;
  if (line[bodyStart] === '|') bodyStart++;
  if (bodyEnd > bodyStart && line[bodyEnd - 1] === '|') bodyEnd--;
  if (!line.slice(bodyStart, bodyEnd).includes('|')) return null;
  const cells = [];
  let cellStart = bodyStart;
  let escaped = false;
  const pushCell = (end) => {
    let start = cellStart;
    while (start < end && /[ \t]/u.test(line[start])) start++;
    while (end > start && /[ \t]/u.test(line[end - 1])) end--;
    cells.push({ value: line.slice(start, end), start: lineStart + start, end: lineStart + end });
  };
  for (let index = bodyStart; index < bodyEnd; index++) {
    const character = line[index];
    if (escaped) escaped = false;
    else if (character === '\\') escaped = true;
    else if (character === '|') {
      pushCell(index);
      cellStart = index + 1;
    }
  }
  pushCell(bodyEnd);
  return cells.length >= 2 ? cells : null;
}

function findCredentialTableSpans(text) {
  const src = String(text || '');
  const lines = src.split(/\r?\n/u);
  const starts = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + (src.slice(offset + line.length, offset + line.length + 2) === '\r\n' ? 2 : 1);
  }
  const spans = [];
  for (let row = 0; row + 2 < lines.length; row++) {
    const headers = markdownCellsWithOffsets(lines[row], starts[row]);
    const separator = markdownCellsWithOffsets(lines[row + 1], starts[row + 1]);
    if (!headers || !separator || headers.length !== separator.length ||
        !separator.every((cell) => /^:?-{3,}:?$/u.test(cell.value))) continue;
    row += 2;
    while (row < lines.length) {
      const cells = markdownCellsWithOffsets(lines[row], starts[row]);
      if (!cells || cells.length !== headers.length) {
        row--;
        break;
      }
      const resolved = tableHeadersAt(src, starts[row]);
      for (let column = 0; column < cells.length; column++) {
        const cell = cells[column];
        const header = resolved?.headers[column] ?? null;
        if (header === null || !CREDENTIAL_LABEL_HEADER_RE.test(header)) continue;
        if (!cell.value || placeholderSpans(cell.value).length) continue;
        spans.push({
          type: 'CREDENTIAL',
          start: cell.start,
          end: cell.end,
          text: src.slice(cell.start, cell.end),
          replacement: '[CREDENTIAL_REDACTED]',
          priority: 96
        });
      }
      row++;
    }
  }
  return spans;
}

function isSetextHeadingLine(text, index) {
  const src = String(text || '');
  const lineEnd = src.indexOf('\n', index);
  if (lineEnd < 0) return false;
  const nextEnd = src.indexOf('\n', lineEnd + 1);
  const nextLine = src.slice(lineEnd + 1, nextEnd < 0 ? src.length : nextEnd).replace(/\r$/u, '');
  return /^[ \t]*(?:={3,}|-{3,})[ \t]*$/u.test(nextLine);
}

function credentialIntervals(spans) {
  return spans.filter((span) => span.type === 'CREDENTIAL')
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

function overlapsCredential(intervals, span) {
  let low = 0;
  let high = intervals.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (intervals[middle].start < span.end) low = middle + 1;
    else high = middle;
  }
  return low > 0 && intervals[low - 1].end > span.start;
}

function safeStructuredSpans(spans) {
  const intervals = credentialIntervals(spans);
  return spans.filter((span) => span.type === 'CREDENTIAL' || !overlapsCredential(intervals, span));
}

// ASCII dot and hyphen can belong both to an IBAN grouping and to an email
// local part. After a known fixed-length IBAN the email detector may therefore
// start at the IBAN's final digit group ("... 00-anna@example.de"). Keep the
// complete bank span and move only that overlapping email to the independently
// valid address after the separator. Sorted cursors keep the reconciliation
// linear in the number of candidate spans.
function reconcileIbanEmailOverlaps(spans, identifierView, source) {
  const banks = spans.filter((span) => span.type === 'IBAN')
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const emails = spans.filter((span) => span.type === 'EMAIL')
    .sort((left, right) => left.start - right.start || left.end - right.end);
  let bankIndex = 0;
  for (const email of emails) {
    while (bankIndex < banks.length && banks[bankIndex].end <= email.start) bankIndex++;
    for (let index = bankIndex; index < banks.length && banks[index].start < email.end; index++) {
      const bank = banks[index];
      if (!(email.start < bank.end && bank.end < email.end)) continue;
      if (!/[.-]/u.test(identifierView[bank.end] || '')) continue;
      const correctedStart = bank.end + 1;
      FOLLOWING_EMAIL_RE.lastIndex = correctedStart;
      const corrected = FOLLOWING_EMAIL_RE.exec(identifierView);
      if (!corrected || corrected.index !== correctedStart || correctedStart + corrected[0].length !== email.end) continue;
      email.start = correctedStart;
      email.text = source.slice(email.start, email.end);
      break;
    }
  }
}

// A labelled reference number stops at the last space-separated group that
// still contains a digit, so "Kundennummer: 4711 und weitere" yields "4711".
function trimReferenceValue(value) {
  const groups = String(value).split(' ');
  while (groups.length && !/\d/.test(groups[groups.length - 1])) groups.pop();
  const trimmed = groups.join(' ');
  if (trimmed.length < 3 || !/\d/.test(trimmed)) return null;
  return trimmed;
}

function findStructuredSpans(text) {
  const src = String(text || '');
  const identifierView = identifierDetectionText(src);
  const reserved = placeholderSpans(src);
  const spans = findCredentialTableSpans(src);

  for (const det of DETECTORS) {
    const view = det.identifierView ? identifierView : src;
    det.re.lastIndex = 0;
    let m;
    while ((m = det.re.exec(view))) {
      if (m[0].length === 0) {
        det.re.lastIndex++;
        continue;
      }

      let value = m[0];
      let start = m.index;

      if (det.matchEnd) {
        const end = det.matchEnd(view, m);
        if (end <= m.index + m[0].length) continue;
        value = view.slice(start, end);
        det.re.lastIndex = end;
      }

      if (det.boundaryEnd) {
        const end = det.boundaryEnd(view, m);
        value = view.slice(start, end);
        det.re.lastIndex = end;
      }

      if (det.valueGroup) {
        const raw = m[det.valueGroup];
        if (!raw) continue;
        start = m.index + m.slice(1, det.valueGroup).reduce((n, g) => n + (g || '').length, 0);
        value = raw;
      }
      if (det.trimValue) {
        const trimmed = trimReferenceValue(value);
        if (!trimmed) continue;
        value = trimmed;
      }

      const end = start + value.length;
      // Never re-detect inside an already inserted placeholder.
      if (reserved.some((r) => start < r.end && r.start < end)) continue;
      if (det.accept && !det.accept(value, view, start)) continue;

      spans.push({
        type: det.type,
        start,
        end,
        text: src.slice(start, end),
        replacement: det.placeholder,
        priority: det.priority
      });
    }
  }

  reconcileIbanEmailOverlaps(spans, identifierView, src);

  // A telephone URI can end inside an email's local part, for example
  // tel:03012345678.anna@example.de. The higher-priority URI would discard
  // that entire EMAIL candidate; some profiles then redact only its domain
  // as a URL, hiding the partial address from the residual gate. Preserve the
  // whole already-detected email in this contact span, without consuming an
  // unrecognized prose tail or changing any global overlap/priority rule.
  // Both detectors emit source-ordered, non-overlapping spans: one monotonic
  // email cursor keeps this targeted coverage check linear.
  const emails = spans.filter((span) => span.type === 'EMAIL');
  let emailIndex = 0;
  for (const contact of spans) {
    if (contact.type !== 'CONTACT_URI') continue;
    while (emailIndex < emails.length && emails[emailIndex].end <= contact.end) emailIndex++;
    const email = emails[emailIndex];
    if (email && email.start >= contact.start && email.start < contact.end) {
      contact.end = email.end;
      contact.text = src.slice(contact.start, contact.end);
    }
  }

  return spans;
}

function scanStructured(text) {
  return safeStructuredSpans(findStructuredSpans(text)).map((s) => ({
    type: s.type,
    // A short PIN or password hash is reversible by enumeration. Credential
    // scanners expose only class and coordinates; the raw span stays inside
    // the replacement operation and is never part of a finding/diagnostic.
    text: s.type === 'CREDENTIAL' ? '' : s.text,
    start: s.start,
    end: s.end
  }));
}

function replaceStructured(text, findings) {
  const src = String(text || '');
  const spans = findStructuredSpans(src);
  for (const s of safeStructuredSpans(spans)) {
    findings.push(s.type === 'CREDENTIAL' ? { type: s.type } : { type: s.type, value_hash: hashShort(s.text) });
  }
  return applySpans(src, spans);
}

module.exports = { DETECTORS, findStructuredSpans, scanStructured, replaceStructured, trimReferenceValue };
