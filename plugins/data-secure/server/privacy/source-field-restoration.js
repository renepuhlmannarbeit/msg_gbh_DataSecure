'use strict';

// Derived only from the immutable canonical input and actual private edits.
// This module supplies no identity, Keep waiver or persisted coverage flag.
const crypto = require('node:crypto');
const base = require('./base');
const { CONTENT_PERSON_FIELD_POLICY, personFieldPattern } = require('../core/person-field-policy');
const { RESOURCE_LIMITS } = require('../resource-limits');
const { applyEdits } = require('./transform-plan');
const { placeholderSpans, sourceVariableTokens } = require('./spans');
// Sharing a pure closed lexical predicate is not sharing redactor coverage.
const { isProtectedFieldHeader } = require('./field-value-coverage');
const { normalizeSensitiveLabel, DATE_OF_BIRTH_LABEL_RE, PHONE_LABEL_RE, DE_TAX_LABEL_RE, ID_LABEL_HEADER_RE,
  CREDENTIAL_LABEL_HEADER_RE, STRUCTURED_LABEL_VALUE_PATTERN, structuredLabelRole, structuredLabelSeparators } = base;
const ORGANIZATION_FIELD = /^(?:Firma|Unternehmen|Organisation|Organization|Company(?:\s+Name)?|Employer|Arbeitgeber)$/iu;
const unanchor = pattern => pattern.replace(/^\^/u, '').replace(/\$$/u, '');
const PROSE_LABEL_PATTERN = [personFieldPattern(CONTENT_PERSON_FIELD_POLICY), ...[DATE_OF_BIRTH_LABEL_RE, PHONE_LABEL_RE, DE_TAX_LABEL_RE,
  ID_LABEL_HEADER_RE, CREDENTIAL_LABEL_HEADER_RE, ORGANIZATION_FIELD].map(pattern => unanchor(pattern.source)),
  'Geschützter Tabellenwert', STRUCTURED_LABEL_VALUE_PATTERN].join('|');
const PROSE_LABEL_END = new RegExp('(?:' + PROSE_LABEL_PATTERN + ')$', 'giu');
const proseUnescape = value => value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/gu, '$1');
const fail = code => Object.assign(new Error(code), { code });
const invalid = () => fail('DOCUMENT_REVIEW_INVALID');
const states = new WeakMap();
const indexes = new WeakMap();
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function rawLabelPoints(raw, points) {
  const mapped = new Map();
  let at = 0, logical = 0;
  for (const point of [...new Set(points)].sort((a, b) => a - b)) {
    while (logical < point && at < raw.length) {
      at += raw[at] === '\\' && /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/u.test(raw[at + 1] || '') ? 2 : 1;
      logical++;
    }
    if (logical === point) mapped.set(point, at);
  }
  return mapped;
}
function rawStructuredSeparators(raw) {
  if (!raw.includes('(')) return new Set();
  const positions = structuredLabelSeparators(proseUnescape(raw));
  const points = rawLabelPoints(raw, [...positions].map(point => point + 1));
  return new Set([...positions].map(point => points.get(point + 1) - 1));
}
// Independent structural source-reader. It emits complete raw owner ranges,
// never the redactor's unmatched/replacement spans or inferred detector kind.
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


function sourceIntervals(source, policy = CONTENT_PERSON_FIELD_POLICY) {
  if (typeof source !== 'string' || !source.isWellFormed() || source.length > RESOURCE_LIMITS.MAX_TEXT_CHARS) throw invalid();
  if (policy !== CONTENT_PERSON_FIELD_POLICY) return [];
  try { base.assertPersonFieldStructure(source, policy); }
  catch (error) {
    if (error?.code === 'RESIDUAL_PII') throw fail('DOCUMENT_REVIEW_RESIDUAL_PII');
    throw error;
  }
  const result = [], lines = source.split('\n');
  let offset = 0;
  const add = (start, end) => { if (end > start) result.push({ start, end }); };
  const callees = (raw, position) => {
    const logical = proseUnescape(raw), role = structuredLabelRole(logical);
    const slots = role?.slots.filter(slot => slot.kind === 'callee') || [];
    const mapped = rawLabelPoints(raw, slots.flatMap(slot => [slot.start, slot.end]));
    for (const slot of slots) {
      const from = mapped.get(slot.start), to = mapped.get(slot.end);
      if (from === undefined || to === undefined || proseUnescape(raw.slice(from, to)) !== logical.slice(slot.start, slot.end)) throw invalid();
      add(position + from, position + to);
    }
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], cells = cellRanges(line), separatorLine = lines[index + 1] || '';
    const separator = cellRanges(separatorLine);
    const header = line.includes('|') && separatorLine.includes('|') && cells.length === separator.length &&
      separator.every(cell => /^:?-{3,}:?$/u.test(separatorLine.slice(cell.start, cell.end).trim()));
    const table = base.tableHeadersAt(source, offset, policy);
    if (header || table) {
      if (table && cells.length !== table.headers.length) throw invalid();
      for (let column = 0; column < cells.length; column++) {
        const cell = cells[column], raw = line.slice(cell.start, cell.end), position = offset + cell.start;
        if (header) callees(raw, position);
        if (!header && isProtectedFieldHeader(table.headers[column], policy)) add(position, offset + cell.end);
        // Actual inline fields remain inside this original cell, including CR.
        let from = 0;
        const ignored = rawStructuredSeparators(raw);
        for (const delimiter of raw.matchAll(/[:=]/gu)) {
          if (ignored.has(delimiter.index)) continue;
          const logical = proseUnescape(raw.slice(from, delimiter.index + 1)).slice(0, -1);
          if (isProtectedFieldHeader(logical.trim(), policy)) {
            callees(raw.slice(from, delimiter.index), position + from);
            add(position + delimiter.index + 1, offset + cell.end);
            break;
          }
          from = delimiter.index + 1;
        }
      }
      if (header) {
        // A resolved source header can span up to the existing three rows. Map
        // the actual joined callee back through those raw cells, never through
        // equal names in another column or a normalized offset guess.
        const following = base.tableHeadersAt(source, offset + line.length + separatorLine.length + 2, policy);
        if (following) for (let column = 0; column < cells.length; column++) {
          if (!structuredLabelRole(following.headers[column])?.slots.some(slot => slot.kind === 'callee')) continue;
          const chunks = [];
          let position = offset;
          for (let row = index; row >= Math.max(0, index - 2); row--) {
            const ranges = cellRanges(lines[row]);
            if (!lines[row].includes('|') || ranges.length !== cells.length) break;
            const raw = lines[row].slice(ranges[column].start, ranges[column].end);
            chunks.unshift({ raw, logical: proseUnescape(raw), position: position + ranges[column].start });
            if (row > 0) position -= lines[row - 1].length + 1;
          }
          let joined = '';
          for (const chunk of chunks) {
            chunk.start = joined.length;
            joined += chunk.logical;
            chunk.end = joined.length;
            joined += ' ';
          }
          const role = structuredLabelRole(joined);
          if (role) {
            for (const slot of role.slots.filter(slot => slot.kind === 'callee')) for (const chunk of chunks) {
              const from = Math.max(slot.start, chunk.start) - chunk.start, to = Math.min(slot.end, chunk.end) - chunk.start;
              if (to <= from) continue;
              const map = rawLabelPoints(chunk.raw, [from, to]);
              if (!map.has(from) || !map.has(to)) throw invalid();
              add(chunk.position + map.get(from), chunk.position + map.get(to));
            }
          } else {
            // Unbound sensitive-header restoration is never an absence proof.
            for (const chunk of chunks) add(chunk.position, chunk.position + chunk.raw.length);
          }
        }
      }
    } else for (const field of proseFieldRanges(line, policy)) {
      callees(line.slice(field.labelStart, field.valueStart - 1), offset + field.labelStart);
      add(offset + field.valueStart, offset + field.end);
    }
    offset += line.length + 1;
  }
  result.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const range of result) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  // Fixed vocabulary has no variable source payload. Never subtract imported
  // variable tokens, or re-run opaque recognition on later fragment remnants.
  const imported = sourceVariableTokens(source), fixed = placeholderSpans(source).filter(span => !imported.has(span.text));
  const ranges = [];
  let next = 0;
  for (const range of merged) {
    let at = range.start;
    while (next < fixed.length && fixed[next].end <= at) next++;
    let index = next;
    while (index < fixed.length && fixed[index].start < range.end) {
      const token = fixed[index++];
      if (token.start > at) ranges.push({ start: at, end: Math.min(token.start, range.end) });
      at = Math.max(at, token.end);
    }
    if (at < range.end) ranges.push({ start: at, end: range.end });
  }
  return ranges;
}
function state(source, text, ranges, fragments) {
  const token = Object.freeze({});
  states.set(token, { source, text, ranges, fragments });
  return token;
}
function createSourceIndex(source, policy) {
  const ranges = sourceIntervals(source, policy), token = Object.freeze({});
  indexes.set(token, { sourceHash: digest(source), policy, ranges });
  return token;
}
function createRestoration(source, text, policy, index = null) {
  if (typeof source !== 'string' || typeof text !== 'string' || !text.isWellFormed() ||
      text.length > RESOURCE_LIMITS.MAX_TEXT_CHARS) throw invalid();
  const model = indexes.get(index || createSourceIndex(source, policy));
  if (!model || model.policy !== policy || model.sourceHash !== digest(source)) throw invalid();
  return state(source, text, model.ranges, []);
}
function checkedState(token, text) {
  const data = states.get(token);
  if (!data || data.text !== text) throw invalid();
  return data;
}
function deltaBefore(edits, point) {
  let low = 0, high = edits.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (edits[middle].end <= point) low = middle + 1;
    else high = middle;
  }
  return low;
}
function advanceRestoration(token, before, after, edits, keeps = []) {
  const data = checkedState(token, before);
  if (applyEdits(before, edits) !== after || after.length > RESOURCE_LIMITS.MAX_TEXT_CHARS || !Array.isArray(keeps)) throw invalid();
  const deltas = [0], outputStarts = new Map();
  for (const edit of edits) {
    outputStarts.set(edit, edit.start + deltas.at(-1));
    deltas.push(deltas.at(-1) + edit.replacement.length - (edit.end - edit.start));
  }
  const outputStart = edit => {
    if (!outputStarts.has(edit)) throw invalid();
    return outputStarts.get(edit);
  };
  const fragments = [];
  const carry = (fragment, start, end, delta) => {
    if (end > start) fragments.push({ start: start + delta, end: end + delta,
      sourceStart: fragment.sourceStart + start - fragment.start, sourceEnd: fragment.sourceStart + end - fragment.start });
  };
  for (const fragment of data.fragments) {
    if (before.slice(fragment.start, fragment.end) !== data.source.slice(fragment.sourceStart, fragment.sourceEnd)) throw invalid();
    let at = fragment.start, index = deltaBefore(edits, at);
    while (index < edits.length && edits[index].start < fragment.end) {
      const edit = edits[index];
      carry(fragment, at, Math.min(edit.start, fragment.end), deltas[index]);
      at = Math.max(at, edit.end);
      index++;
    }
    if (at < fragment.end) carry(fragment, at, fragment.end, deltas[deltaBefore(edits, at)]);
  }
  for (const keep of keeps) {
    const { edit, sourceStart, sourceEnd, original } = keep;
    if (!Number.isSafeInteger(sourceStart) || !Number.isSafeInteger(sourceEnd) || sourceStart < 0 ||
        sourceEnd <= sourceStart || sourceEnd > data.source.length ||
        data.source.slice(sourceStart, sourceEnd) !== original || edit.replacement !== original) throw invalid();
    const start = outputStart(edit);
    let low = 0, high = data.ranges.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (data.ranges[middle].end <= sourceStart) low = middle + 1;
      else high = middle;
    }
    for (let index = low; index < data.ranges.length && data.ranges[index].start < sourceEnd; index++) {
      const from = Math.max(sourceStart, data.ranges[index].start), to = Math.min(sourceEnd, data.ranges[index].end);
      fragments.push({ start: start + from - sourceStart, end: start + to - sourceStart, sourceStart: from, sourceEnd: to });
    }
  }
  fragments.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const fragment of fragments) {
    if (fragment.start < 0 || fragment.end > after.length || fragment.end <= fragment.start ||
        after.slice(fragment.start, fragment.end) !== data.source.slice(fragment.sourceStart, fragment.sourceEnd)) throw invalid();
    const last = merged.at(-1);
    if (last && fragment.start < last.end) throw invalid();
    if (last && last.end === fragment.start && last.sourceEnd === fragment.sourceStart) {
      last.end = fragment.end;
      last.sourceEnd = fragment.sourceEnd;
    } else merged.push(fragment);
  }
  // Every fragment contains at least one actual current UTF16 unit. This bound
  // follows the unchanged text budget, not an added disclosure-producing cutoff.
  if (merged.length > after.length || merged.length > RESOURCE_LIMITS.MAX_TEXT_CHARS) throw fail('DOCUMENT_REVIEW_LIMIT');
  return state(data.source, after, data.ranges, merged);
}
function assertRestoration(token, text) {
  const data = checkedState(token, text);
  for (const fragment of data.fragments) {
    const raw = text.slice(fragment.start, fragment.end);
    if (raw !== data.source.slice(fragment.sourceStart, fragment.sourceEnd)) throw invalid();
    if (/[\p{L}\p{M}\p{N}\p{S}]/u.test(raw)) throw fail('DOCUMENT_REVIEW_RESIDUAL_PII');
  }
  return true;
}
module.exports = { sourceIntervals, createSourceIndex, createRestoration, advanceRestoration, assertRestoration };
