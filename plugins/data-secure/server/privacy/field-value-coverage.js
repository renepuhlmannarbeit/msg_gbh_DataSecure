'use strict';

// Explicit source fields are stronger evidence than name-shaped vocabulary.
// A slash, long value or escaped cell paragraph must not make an otherwise
// unrecognised remainder releasable. This supplies no identities/allowlists:
// ordinary entity detection runs first; only uncovered field fragments are
// conservatively masked afterwards, with real edits in the existing trace.
const { isResolvedSensitiveTableHeader, effectiveTableFieldLabel, tableHeadersAt } = require('./base');
const { placeholderSpans, sourceVariableTokens } = require('./spans');
const { CONTENT_PERSON_FIELD_POLICY } = require('../core/person-field-policy');
const ORGANIZATION_FIELD = /^(?:Firma|Unternehmen|Organisation|Organization|Company(?:\s+Name)?|Employer|Arbeitgeber)$/iu;
const GENERIC_FIELD = 'Geschützter Tabellenwert';

function isProtectedFieldHeader(value, policy) {
  const label = effectiveTableFieldLabel(value);
  return policy === CONTENT_PERSON_FIELD_POLICY && (isResolvedSensitiveTableHeader(label, policy) ||
    ORGANIZATION_FIELD.test(label) || label === GENERIC_FIELD);
}

// Exact raw UTF-16 cell boundaries, not .indexOf(value): duplicate values and
// escaped pipes must retain their distinct positions in the actual basis.
function cellRanges(line) {
  const ranges = []; let start = 0, escaped = false, firstPipe = -1, lastPipe = -1;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (escaped) { escaped = false; continue; }
    if (character === '\\') { escaped = true; continue; }
    if (character !== '|') continue;
    if(firstPipe < 0)firstPipe = index;
    lastPipe = index;
    ranges.push({ start, end: index }); start = index + 1;
  }
  ranges.push({ start, end: line.length });
  if (firstPipe === line.length - line.trimStart().length) ranges.shift();
  if (lastPipe === line.trimEnd().length - 1) ranges.pop();
  return ranges;
}

function protectedHeaderRanges(text, policy) {
  if(policy !== CONTENT_PERSON_FIELD_POLICY)return [];
  const lines = text.split('\n'), result = []; let offset = 0;
  for(let index = 0; index + 2 < lines.length; index++) {
    const line = lines[index], headers = cellRanges(line), separator = cellRanges(lines[index + 1]);
    if(!line.includes('|') || !headers.length || headers.length !== separator.length ||
        !separator.every(range => /^:?-{3,}:?$/u.test(lines[index + 1].slice(range.start,range.end).trim()))) {
      offset += line.length + 1; continue;
    }
    const nextRow = tableHeadersAt(text, offset + line.length + lines[index + 1].length + 2, policy);
    if(!nextRow || nextRow.headers.length !== headers.length) { offset += line.length + 1; continue; }
    // Only semantic closed labels in actual GFM header instances. Not a
    // global exemption for a source name equal to a label, nor arbitrary text
    // in a heading. Their DATA occurrences remain normal private identifiers.
    for(const range of headers) {
      const raw = line.slice(range.start,range.end);
      if(isProtectedFieldHeader(raw,policy))result.push({ start: offset + range.start,
        end: offset + range.end });
    }
    offset += line.length + 1;
  }
  return result;
}

function isWithinProtectedHeader(ranges, span) {
  let left = 0, right = ranges.length - 1, found = -1;
  while(left <= right) {
    const middle = (left + right) >>> 1;
    if(ranges[middle].start <= span.start) { found = middle; left = middle + 1; }
    else right = middle - 1;
  }
  return found >= 0 && span.end <= ranges[found].end;
}

function uncoveredFieldSpans(text, policy, sourceText = '') {
  if (policy !== CONTENT_PERSON_FIELD_POLICY) return [];
  // Actual source tokens are not newly generated pseudonyms. In a strong
  // field their variable payload cannot borrow the weak-prose Keep exception.
  const imported = sourceVariableTokens(sourceText);
  const result = []; let offset = 0;
  for (const line of text.split('\n')) {
    const table = tableHeadersAt(text, offset, policy);
    if (table) {
      const cells = cellRanges(line);
      if (cells.length === table.headers.length) for (let column = 0; column < cells.length; column++) {
        if (!isProtectedFieldHeader(table.headers[column], policy)) continue;
        const cell = cells[column], fragment = line.slice(cell.start, cell.end);
        const opaque = placeholderSpans(fragment).filter(span => !imported.has(span.text));
        let cursor = 0;
        for (const boundary of [...opaque, { start: fragment.length, end: fragment.length }]) {
          const gap = fragment.slice(cursor, boundary.start);
          // Harmless punctuation separating real pseudonyms is not a value.
          // Combining marks/symbols are not an exemption for an unknown value.
          if (/[\p{L}\p{M}\p{N}\p{S}]/u.test(gap)) {
            const leading = gap.length - gap.trimStart().length, end = gap.trimEnd().length;
            const start = offset + cell.start + cursor + leading;
            result.push({ start, end: offset + cell.start + cursor + end,
              type: 'SENSITIVE_FIELD', text: gap.trim(), priority: 100,
              replacement: '[FIELD_REDACTED]' });
          }
          cursor = boundary.end;
        }
      }
    }
    offset += line.length + 1;
  }
  return result;
}

module.exports = { isProtectedFieldHeader, uncoveredFieldSpans, protectedHeaderRanges, isWithinProtectedHeader };
