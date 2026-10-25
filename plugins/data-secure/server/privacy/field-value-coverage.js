'use strict';

// Explicit source fields are stronger evidence than name-shaped vocabulary.
// A slash, long value or escaped cell paragraph must not make an otherwise
// unrecognised remainder releasable. This supplies no identities/allowlists:
// ordinary entity detection runs first; only uncovered field fragments are
// conservatively masked afterwards, with real edits in the existing trace.
const { isResolvedSensitiveTableHeader, effectiveTableFieldLabel, tableHeadersAt, normalizeSensitiveLabel,
  DATE_OF_BIRTH_LABEL_RE, PHONE_LABEL_RE, DE_TAX_LABEL_RE, ID_LABEL_HEADER_RE, CREDENTIAL_LABEL_HEADER_RE,
  STRUCTURED_LABEL_VALUE_PATTERN, structuredLabelRole, structuredLabelSeparators } = require('./base');
const { placeholderSpans, sourceVariableTokens } = require('./spans');
const { CONTENT_PERSON_FIELD_POLICY, personFieldPattern } = require('../core/person-field-policy');
const ORGANIZATION_FIELD = /^(?:Firma|Unternehmen|Organisation|Organization|Company(?:\s+Name)?|Employer|Arbeitgeber)$/iu;
const GENERIC_FIELD = 'Geschützter Tabellenwert';
// Candidate discovery uses the actual existing closed policy grammar, not a
// separate word/length allowlist. The full raw prefix is still revalidated.
const unanchor = pattern => pattern.replace(/^\^/u, '').replace(/\$$/u, '');
const PROSE_LITERAL_LABEL_PATTERN = [personFieldPattern(CONTENT_PERSON_FIELD_POLICY),
  ...[DATE_OF_BIRTH_LABEL_RE, PHONE_LABEL_RE, DE_TAX_LABEL_RE, ID_LABEL_HEADER_RE,
    CREDENTIAL_LABEL_HEADER_RE, ORGANIZATION_FIELD].map(pattern => unanchor(pattern.source)), GENERIC_FIELD].join('|');
const PROSE_LABEL_PATTERN = PROSE_LITERAL_LABEL_PATTERN + '|' + STRUCTURED_LABEL_VALUE_PATTERN;
const PROSE_LABEL_END = new RegExp('(?:' + PROSE_LABEL_PATTERN + ')$', 'giu');
const EXACT_HEADER_METADATA = new RegExp('^(?:' + PROSE_LITERAL_LABEL_PATTERN + ')$', 'iu');
const proseUnescape = value => value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/gu, '$1');
const isExactHeaderMetadata = value => {
  const label = effectiveTableFieldLabel(value).replace(/\s+/gu, ' '), role = structuredLabelRole(label);
  return role ? role.wholeMetadata : EXACT_HEADER_METADATA.test(label);
};

function rawLabelPoints(raw, points) {
  const result = new Map(); let at = 0, logical = 0;
  for (const point of [...new Set(points)].sort((a,b) => a-b)) {
    while (logical < point && at < raw.length) {
      at += raw[at] === '\\' && /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/u.test(raw[at+1] || '') ? 2 : 1;
      logical++;
    }
    if (logical === point) result.set(point, at);
  }
  return result;
}
function rawStructuredSeparators(raw) {
  if (!raw.includes('(')) return new Set();
  const positions = structuredLabelSeparators(proseUnescape(raw)), points = rawLabelPoints(raw, [...positions].map(point => point+1));
  return new Set([...positions].map(point => points.get(point+1)-1));
}
function metadataRanges(raw, separator = false) {
  const logical = separator ? proseUnescape(raw).slice(0,-1) : proseUnescape(raw);
  const role = structuredLabelRole(logical);
  if (role) {
    if (logical.slice(0,role.start).trim() !== '') return [];
    const points = rawLabelPoints(raw, role.staticSpans.flatMap(span => [span.start,span.end]));
    return role.staticSpans.filter(span => points.has(span.start)&&points.has(span.end)&&
      proseUnescape(raw.slice(points.get(span.start),points.get(span.end))) === logical.slice(span.start,span.end))
      .map(span => ({start:points.get(span.start),end:points.get(span.end)}));
  }
  // A normalizer-created role is not a raw offset map or a metadata proof.
  if (structuredLabelRole(effectiveTableFieldLabel(logical))) return [];
  return isExactHeaderMetadata(logical) ? [{start:0,end:raw.length}] : [];
}

// Comparison only: one whitespace corridor must not become ambiguous work in
// the legacy suffix predicates. Keep source-owner points, not repaired text.
function compactProseComparison(value, owners) {
  const entries = [...owners], mapped = new Map(); let next = 0, removed = 0;
  const comparison = value.replace(/\s+/gu, (space, start) => {
    while (next < entries.length && entries[next][0] <= start) {
      const [point, owner] = entries[next++]; mapped.set(point - removed, owner);
    }
    while (next < entries.length && entries[next][0] < start + space.length) {
      const [, owner] = entries[next++]; mapped.set(start - removed + 1, owner);
    }
    removed += space.length - 1;
    return ' ';
  });
  while (next < entries.length) {
    const [point, owner] = entries[next++]; mapped.set(point - removed, owner);
  }
  return {comparison, owners: mapped};
}

function isProtectedFieldHeader(value, policy) {
  const label = effectiveTableFieldLabel(value);
  return policy === CONTENT_PERSON_FIELD_POLICY && (isResolvedSensitiveTableHeader(label, policy) ||
    ORGANIZATION_FIELD.test(label) || label === GENERIC_FIELD || structuredLabelRole(label)?.protectsValue === true);
}

// Only a closed source-line prefix is a prose field, never an arbitrary
// occurrence of "Name:" inside a sentence. Consume Markdown containers
// without changing UTF-16 coordinates; their nesting is source structure,
// not an identity claim. The native document/text budget bounds this loop.
function proseFieldStart(line, policy, ignored = rawStructuredSeparators(line), base = 0) {
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
    if (ignored.has(base+cursor)) continue;
    const label = line.slice(labelStart, cursor + 1)
      .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/gu, '$1').slice(0, -1);
    if (isProtectedFieldHeader(label.trim(), policy)) return { labelStart, valueStart: cursor + 1 };
    return null;
  }
  return null;
}

// A retained bare CR can introduce another actual closed prose field. Keep
// unknown continuations in the preceding field instead of treating every CR
// as permission to release a new value. Positions remain raw UTF-16 offsets;
// no character or line ending is rewritten. Actual table rows use their
// original cell scope and must never acquire these prose boundaries.
function proseFieldRanges(line, policy, allowBareCr = true) {
  const ignored = rawStructuredSeparators(line);
  if (!allowBareCr) {
    const field = proseFieldStart(line, policy, ignored);
    return field ? [{ ...field, end: line.length }] : [];
  }
  const fields = []; let groupStart = 0;
  for (const delimiter of line.matchAll(/[:=]/gu)) {
    const separator = delimiter.index;
    if (ignored.has(separator)) continue;
    let field = groupStart === 0 ? proseFieldStart(line.slice(0, separator + 1), policy, ignored) : null;
    let fieldStart = 0;
    if (!field) {
      const group = line.slice(groupStart, separator);
      const eligible = new Map(), pieces = []; let partStart = groupStart, comparisonLength = 0;
      // Each separator-delimited group and each CR part is compared once.
      // Never copy the whole remaining line again for every candidate CR.
      while (partStart <= separator) {
        const relativeCr = group.indexOf('\r', partStart - groupStart);
        const end = relativeCr < 0 ? separator : groupStart + relativeCr;
        const raw = line.slice(partStart, end), last = end === separator;
        const comparison = normalizeSensitiveLabel(last ? proseUnescape(raw + delimiter[0]).slice(0, -1) : proseUnescape(raw));
        if (partStart === 0 || line[partStart - 1] === '\r') {
          // Only an actual source part start may own a field; a matching word
          // inside ordinary prose never becomes a synthetic field boundary.
          let cursor = 0;
          while (cursor < raw.length) {
            cursor += /^[ \t]*/u.exec(raw.slice(cursor))[0].length;
            const marker = /^(?:>[ \t]*|(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|#{1,6}[ \t]+)/u.exec(raw.slice(cursor));
            if (!marker) break;
            cursor += marker[0].length;
          }
          const prefix = normalizeSensitiveLabel(proseUnescape(raw.slice(0, cursor)));
          eligible.set(comparisonLength + prefix.length, partStart);
        }
        pieces.push(comparison); comparisonLength += comparison.length;
        if (last) break;
        pieces.push('\r'); comparisonLength++; partStart = end + 1;
      }
      const compact = compactProseComparison(pieces.join(''), eligible);
      const comparison = compact.comparison, points = [...compact.owners.keys()]; let end = comparison.length;
      while (end > 0 && /\s/u.test(comparison[end - 1])) end--;
      // Same backwards ordinal grammar as effectiveTableFieldLabel. Removing
      // it once avoids retrying ever-longer suffixes at every CR boundary.
      while (comparison[end - 1] === ')') {
        let at = end - 2;
        while (at >= 0 && comparison.charCodeAt(at) >= 48 && comparison.charCodeAt(at) <= 57) at--;
        if (at === end - 2 || comparison[at] !== '(' || at < 1 || !/\s/u.test(comparison[at - 1])) break;
        end = at;
        while (end > 0 && /\s/u.test(comparison[end - 1])) end--;
      }
      const base = comparison.slice(0, end); PROSE_LABEL_END.lastIndex = 0;
      for (let match; (match = PROSE_LABEL_END.exec(base)); PROSE_LABEL_END.lastIndex = match.index + 1) {
        // Existing telephone/date predicates accept qualified suffix labels.
        // Their raw part owns the value, but arbitrary qualifier text must not
        // borrow a global header exemption from a suffix word inside it.
        let low = 0, high = points.length - 1, found = -1;
        while (low <= high) {
          const middle = (low + high) >>> 1;
          if (points[middle] <= match.index) { found = middle; low = middle + 1; } else high = middle - 1;
        }
        if (found < 0) continue;
        const start = compact.owners.get(points[found]);
        const candidate = proseFieldStart(line.slice(start, separator + 1), policy, ignored, start);
        if (candidate) { field = {labelStart: start + candidate.labelStart, valueStart: separator + 1}; fieldStart = start; break; }
      }
    }
    if (field) {
      if (fields.length) fields[fields.length - 1].end = fieldStart - 1;
      fields.push({...field, end: line.length});
    }
    groupStart = separator + 1;
  }
  return fields;
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
    const line = lines[index], headers = cellRanges(line), separator = cellRanges(lines[index + 1] || '');
    const inlineHeader = line.includes('|') && (lines[index + 1] || '').includes('|') &&
      headers.length === separator.length && separator.every(range =>
        /^:?-{3,}:?$/u.test(lines[index + 1].slice(range.start, range.end).trim()));
    const table = tableHeadersAt(text, offset, policy);
    for (const field of !inlineHeader && !table ? proseFieldRanges(line, policy) : []) {
      // A suffix predicate can own a field's value without declaring every
      // preceding qualifier privacy-free. Only the complete semantic label
      // receives metadata exemption; qualifiers retain ordinary PII checks.
      const raw = line.slice(field.labelStart, field.valueStart);
      for (const span of metadataRanges(raw,true)) result.push({start:offset+field.labelStart+span.start,end:offset+field.labelStart+span.end});
    }
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
      if(isProtectedFieldHeader(proseUnescape(raw),policy)) for (const span of metadataRanges(raw))
        result.push({start:offset+range.start+span.start,end:offset+range.start+span.end});
    }
    offset += line.length + 1;
  }
  result.sort((a,b) => a.start-b.start||a.end-b.end);
  const merged = [];
  for (const span of result) {
    const last = merged[merged.length-1];
    if (last && span.start <= last.end) last.end = Math.max(last.end,span.end);
    else merged.push(span);
  }
  return merged;
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
  function appendCalleeRemainders(raw, base) {
    const logical = proseUnescape(raw), role = structuredLabelRole(logical);
    const slots = role?.slots.filter(slot => slot.kind === 'callee') || [];
    if (!slots.length) return;
    const points = rawLabelPoints(raw, slots.flatMap(slot => [slot.start, slot.end]));
    for (const slot of slots) {
      const start = points.get(slot.start), end = points.get(slot.end);
      if (start === undefined || end === undefined || proseUnescape(raw.slice(start,end)) !== logical.slice(slot.start,slot.end))
        throw Object.assign(new Error('Die Feldstruktur erlaubt keine sichere Zuordnung des angesprochenen Werts.'), {code:'RESIDUAL_PII'});
      // A proven named-callee slot carries a complete protection duty, not a
      // new person identity. Ordinary name detection can cover only a part;
      // cover its remaining source text generically. Parenthetical annotation
      // slots deliberately retain the ordinary person/review model instead.
      const fragment=raw.slice(start,end), before=result.length;
      appendUncovered(fragment, 0, base + start);
      if (result.length>before) {
        // A real entity replacement may include retained title text as well
        // as its opaque pseudonym. Never cut that generated entity into an
        // invented reversible source fragment. The complete proven slot is
        // the conservative generic replacement boundary whenever raw remains.
        result.splice(before,result.length-before,{start:base+start,end:base+end,type:'SENSITIVE_FIELD',
          text:fragment,priority:100,replacement:'[FIELD_REDACTED]'});
      }
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
        if (inlineHeader) appendCalleeRemainders(fragment, offset + cell.start);
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
          const ignored = rawStructuredSeparators(fragment);
          for (const separator of fragment.matchAll(/[:=]/gu)) {
            if (ignored.has(separator.index)) continue;
            const label = fragment.slice(labelStart, separator.index + 1)
              .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/gu, '$1').slice(0, -1);
            if (isProtectedFieldHeader(label.trim(), policy)) {
              appendCalleeRemainders(fragment.slice(labelStart,separator.index), offset + cell.start + labelStart);
              valueStart = separator.index + 1; found = true; break;
            }
            labelStart = separator.index + 1;
          }
          if (!found) continue;
        }
        appendUncovered(fragment, valueStart, offset + cell.start);
      }
    } else {
      for (const field of proseFieldRanges(line, policy)) {
        appendCalleeRemainders(line.slice(field.labelStart, field.valueStart - 1), offset + field.labelStart);
        appendUncovered(line.slice(field.labelStart, field.end), field.valueStart - field.labelStart,
          offset + field.labelStart);
      }
    }
    offset += line.length + 1;
  }
  return result;
}

module.exports = { isProtectedFieldHeader, uncoveredFieldSpans, protectedHeaderRanges, isWithinProtectedHeader };
