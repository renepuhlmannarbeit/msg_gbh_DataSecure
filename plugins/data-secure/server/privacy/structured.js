'use strict';

const {
  EMAIL_RE,
  PHONE_RE,
  PHONE_LABEL_RE,
  IBAN_RE,
  BIC_RE,
  BIC_LABEL_RE,
  IP_RE,
  POSTAL_ADDRESS_RE,
  DE_TAX_RE,
  DE_TAX_LABEL_RE,
  DE_SV_RE,
  CREDIT_RE,
  LABELED_ID_RE,
  hashShort,
  luhnValid,
  hasLabelBefore,
  sameLineHasIban
} = require('./base');
const { placeholderSpans, applySpans } = require('./spans');

// One declarative table drives both the redactor and the residual gate. The
// previous split between scanStructured() and replaceStructured() meant the
// gate reported identifier classes the redactor never removed (the bare
// 11-digit tax id, and every phone shape without a label), so those documents
// could never pass the gate no matter how often they were processed.
const DETECTORS = [
  {
    type: 'EMAIL',
    re: EMAIL_RE,
    placeholder: '[EMAIL_REDACTED]',
    priority: 90
  },
  {
    type: 'IBAN',
    re: IBAN_RE,
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
    type: 'PHONE',
    re: PHONE_RE,
    placeholder: '[PHONE_REDACTED]',
    priority: 80,
    accept: (value, text, index) =>
      value.trim().startsWith('+') || hasLabelBefore(text, index, PHONE_LABEL_RE)
  },
  {
    type: 'IP',
    re: IP_RE,
    placeholder: '[IP_REDACTED]',
    priority: 78
  },
  {
    type: 'POSTAL_ADDRESS',
    re: POSTAL_ADDRESS_RE,
    placeholder: '[LOCATION_REDACTED]',
    priority: 76
  }
];

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
  const reserved = placeholderSpans(src);
  const spans = [];

  for (const det of DETECTORS) {
    det.re.lastIndex = 0;
    let m;
    while ((m = det.re.exec(src))) {
      if (m[0].length === 0) {
        det.re.lastIndex++;
        continue;
      }

      let value = m[0];
      let start = m.index;

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
      if (det.accept && !det.accept(value, src, start)) continue;

      spans.push({
        type: det.type,
        start,
        end,
        text: value,
        replacement: det.placeholder,
        priority: det.priority
      });
    }
  }

  return spans;
}

function scanStructured(text) {
  return findStructuredSpans(text).map((s) => ({
    type: s.type,
    text: s.text,
    start: s.start,
    end: s.end
  }));
}

function replaceStructured(text, findings) {
  const src = String(text || '');
  const spans = findStructuredSpans(src);
  for (const s of spans) findings.push({ type: s.type, value_hash: hashShort(s.text) });
  return applySpans(src, spans);
}

module.exports = { DETECTORS, findStructuredSpans, scanStructured, replaceStructured, trimReferenceValue };
