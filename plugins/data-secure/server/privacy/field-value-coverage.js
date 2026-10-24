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

// Only a closed source-line prefix is a prose field, never an arbitrary
// occurrence of "Name:" inside a sentence. Consume Markdown containers
// without changing UTF-16 coordinates; their nesting is source structure,
// not an identity claim. The native document/text budget bounds this loop.
function proseFieldStart(line, policy) {
  if (policy !== CONTENT_PERSON_FIELD_POLICY) return null;
  let cursor = 0;
  while (cursor < line.length) {
    const whitespace = /^[ \t]*/u.exec(line.slice(cursor))[0].length;
    cursor += whitespace;
    const marker = /^(?:>[ \t]*|(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|#{1,6}[ \t]+)/u.exec(line.slice(cursor));
    if (!marker) break;
    cursor += marker[0].length;
  }
  const labelStart = cursor;
  for (; cursor < line.length; cursor++) {
    if (line[cursor] !== ':' && line[cursor] !== '=') continue;
    const label = line.slice(labelStart, cursor + 1)
      .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/gu, '$1').slice(0, -1);
    if (isProtectedFieldHeader(label.trim(), policy)) return { labelStart, valueStart: cursor + 1 };
    return null;
  }
  return null;
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
  for(let index = 0; index < lines.length; index++) {
    const field = proseFieldStart(lines[index], policy);
    if (field) result.push({ start: offset + field.labelStart, end: offset + field.valueStart });
    const line = lines[index], headers = cellRanges(line), separator = cellRanges(lines[index + 1] || '');
    if(index + 2 >= lines.length || !line.includes('|') || !headers.length || headers.length !== separator.length ||
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
  const result = [], lines = text.split('\n'); let offset = 0;
  function appendUncovered(fragment, valueStart, base) {
    const opaque = placeholderSpans(fragment).filter(span => span.start >= valueStart && !imported.has(span.text));
    let cursor = valueStart;
    for (const boundary of [...opaque, { start: fragment.length, end: fragment.length }]) {
      const gap = fragment.slice(cursor, boundary.start);
      // Punctuation between real pseudonyms is not another field value.
      if (/[\p{L}\p{M}\p{N}\p{S}]/u.test(gap)) {
        const leading = gap.length - gap.trimStart().length, end = gap.trimEnd().length;
        result.push({ start: base + cursor + leading, end: base + cursor + end,
          type: 'SENSITIVE_FIELD', text: gap.trim(), priority: 100, replacement: '[FIELD_REDACTED]' });
      }
      cursor = boundary.end;
    }
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const table = tableHeadersAt(text, offset, policy);
    const cells = cellRanges(line), separator = cellRanges(lines[index + 1] || '');
    // A header can itself contain authored label/value data. Only an actual
    // matching GFM separator establishes this scope; a pure label stays text.
    const inlineHeader = line.includes('|') && (lines[index + 1] || '').includes('|') &&
      cells.length === separator.length && separator.every(range =>
        /^:?-{3,}:?$/u.test(lines[index + 1].slice(range.start, range.end).trim()));
    if (table || inlineHeader) {
      if (inlineHeader || cells.length === table.headers.length) for (let column = 0; column < cells.length; column++) {
        const cell = cells[column], fragment = line.slice(cell.start, cell.end);
        let valueStart = 0;
        if (inlineHeader || !isProtectedFieldHeader(table.headers[column], policy)) {
          // A real data cell may carry its own closed sensitive field label,
          // even under a positional header. A CR inside its value must not
          // defeat protection merely by splitting name-shaped vocabulary.
          // Stay inside this exact cell; do not grant identity authority,
          // invent a neighbouring value, or normalize source line endings.
          // Decode only GFM punctuation escapes in this actual label prefix,
          // including an escaped separator. No source/output repair and no
          // local length cutoff that would waive a known long/ordinal label.
          // A cached formula value has an explicit producer prefix such as
          // "Formel: … Gespeicherter Wert: Name: …". Inspect each successive
          // label segment, not only the first colon, in linear source order.
          let labelStart = 0, found = false;
          for (const separator of fragment.matchAll(/[:=]/gu)) {
            const label = fragment.slice(labelStart, separator.index + 1)
              .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/gu, '$1').slice(0, -1);
            if (isProtectedFieldHeader(label.trim(), policy)) {
              valueStart = separator.index + 1; found = true; break;
            }
            labelStart = separator.index + 1;
          }
          if (!found) continue;
        }
        appendUncovered(fragment, valueStart, offset + cell.start);
      }
    } else {
      const field = proseFieldStart(line, policy);
      if (field) appendUncovered(line, field.valueStart, offset);
    }
    offset += line.length + 1;
  }
  return result;
}

module.exports = { isProtectedFieldHeader, uncoveredFieldSpans, protectedHeaderRanges, isWithinProtectedHeader };
