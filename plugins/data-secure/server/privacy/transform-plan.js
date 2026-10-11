'use strict';

// Private opt-in provenance, never a public detector result. Only explicit
// operations that were really applied may enter this stream; no diff guesses.
const crypto = require('node:crypto');
const SCHEMA = 'datasecure-private-transform-trace/1';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const invalid = () => Object.assign(Error('TRANSFORM_TRACE_INVALID'), { code: 'TRANSFORM_TRACE_INVALID' });
function applyEdits(input, edits) {
  if (typeof input !== 'string' || !input.isWellFormed() || !Array.isArray(edits) || edits.length > 50000) throw invalid();
  let result = '', cursor = 0;
  for (const edit of edits) {
    if (!edit || !Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end) || edit.start < cursor ||
        edit.end < edit.start || edit.end > input.length || edit.original !== input.slice(edit.start, edit.end) ||
        typeof edit.replacement !== 'string' || !edit.replacement.isWellFormed() ||
        (edit.identity !== undefined && (typeof edit.identity !== 'string' || !edit.identity.length || !edit.identity.isWellFormed())) ||
        (edit.identity_key !== undefined && (!['PERSON', 'PERSON_ALIAS'].includes(edit.kind) ||
          typeof edit.identity_key !== 'string' || !/^registry:PERSON:\[PERSON_[A-Z0-9_]{3,100}\]$/u.test(edit.identity_key))) ||
        !/^[A-Z][A-Z0-9_]{0,63}$/u.test(edit.kind || '') ||
        /[\uDC00-\uDFFF]/u.test(input[edit.start] || '') || /[\uDC00-\uDFFF]/u.test(input[edit.end] || '')) throw invalid();
    result += input.slice(cursor, edit.start) + edit.replacement; cursor = edit.end;
  }
  return result + input.slice(cursor);
}
function replayTransformTrace(trace) {
  if (trace?.schema !== SCHEMA || trace.complete !== true || typeof trace.canonical_input !== 'string' ||
      trace.input_hash !== hash(trace.canonical_input) || !Array.isArray(trace.steps) || trace.steps.length > 64) throw invalid();
  let current = trace.canonical_input;
  for (const step of trace.steps) {
    if (!step || !/^[a-z0-9:/_-]{1,100}$/u.test(step.phase || '') || step.input_hash !== hash(current)) throw invalid();
    current = applyEdits(current, step.edits);
    if (step.output_hash !== hash(current)) throw invalid();
  }
  if (trace.output_hash !== hash(current)) throw invalid();
  return current;
}
function createTransformTrace(input) {
  const trace = { schema: SCHEMA, complete: true, canonical_input: input, input_hash: hash(input), output_hash: hash(input), steps: [] };
  let current = input;
  function invalidate() { trace.complete = false; trace.reason_code = 'TRANSFORM_TRACE_INCOMPLETE'; }
  function append(phase, before, after, edits) {
    if (!trace.complete) return;
    try {
      if (before !== current || applyEdits(before, edits) !== after || trace.steps.length >= 64) throw invalid();
      trace.steps.push({ phase, input_hash: hash(before), output_hash: hash(after), edits: structuredClone(edits) });
      current = after; trace.output_hash = hash(after);
    } catch { invalidate(); }
  }
  return Object.freeze({ append,
    appendTrace(prefix, child) {
      if (!trace.complete) return;
      try {
        if (replayTransformTrace(child) === undefined || child.canonical_input !== current) throw invalid();
        let before = current;
        for (const step of child.steps) {
          const after = applyEdits(before, step.edits); append(`${prefix}/${step.phase}`, before, after, step.edits); before = after;
        }
      } catch { invalidate(); }
    },
    finish(expected) {
      if (current !== expected) invalidate();
      if (trace.complete) { try { if (replayTransformTrace(trace) !== expected) invalidate(); } catch { invalidate(); } }
      return structuredClone(trace);
    }
  });
}
// Compose source coordinates through each real transformation. Generated text
// cannot be split or guessed back into source characters. Such a trace remains
// valid for replay, but is deliberately unavailable for reversible entities.
function entityPlanFromTrace(trace) {
  const output = replayTransformTrace(trace), source = trace.canonical_input;
  let pieces = source ? [{ text: source, start: 0, end: source.length }] : [];
  const technical = new Set(['NORMALIZATION', 'RESERVATION', 'RESERVATION_RESTORE', 'TECHNICAL']);
  let serial = 0;
  function boundary(offset) {
    let cursor = 0;
    for (let index = 0; index < pieces.length; index++) {
      const part = pieces[index], next = cursor + part.text.length;
      if (offset === cursor) return index;
      if (offset < next) {
        if (part.entity || part.end - part.start !== part.text.length || source.slice(part.start, part.end) !== part.text) throw invalid();
        const cut = offset - cursor;
        pieces.splice(index, 1, { text: part.text.slice(0, cut), start: part.start, end: part.start + cut },
          { text: part.text.slice(cut), start: part.start + cut, end: part.end });
        return index + 1;
      }
      cursor = next;
    }
    if (offset === cursor) return pieces.length;
    throw invalid();
  }
  for (const step of trace.steps) {
    for (const edit of [...step.edits].reverse()) {
      const first = boundary(edit.start), last = boundary(edit.end), removed = pieces.slice(first, last);
      if (removed.map(part => part.text).join('') !== edit.original) throw invalid();
      const sourceStart = removed[0]?.start ?? null, sourceEnd = removed.at(-1)?.end ?? null;
      const contiguous = removed.length > 0 && sourceStart !== null && sourceEnd !== null &&
        removed.every((part, index) => part.start !== null && part.end !== null && (!index || part.start === removed[index - 1].end));
      const entity = technical.has(edit.kind) ? null : (() => {
        if (!contiguous || sourceEnd <= sourceStart || !edit.replacement) throw invalid();
        return { occurrence_id: `occ_${String(++serial).padStart(6, '0')}`, kind: edit.kind,
          source_start: sourceStart, source_end: sourceEnd, original: source.slice(sourceStart, sourceEnd), replacement: edit.replacement };
      })();
      if (entity && edit.identity !== undefined) entity.identity = edit.identity;
      if (entity && edit.identity_key !== undefined) entity.identity_key = edit.identity_key;
      const replacement = edit.replacement ? [{ text: edit.replacement,
        start: contiguous ? sourceStart : null, end: contiguous ? sourceEnd : null, ...(entity ? { entity } : {}) }] : [];
      pieces.splice(first, last - first, ...replacement);
    }
  }
  if (pieces.map(part => part.text).join('') !== output) throw invalid();
  const occurrences = [], groups = new Map(); let cursor = 0;
  for (const part of pieces) {
    if (part.entity) {
      const group = part.entity.identity_key || `${part.entity.kind}\0${(part.entity.identity || part.entity.original).normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-DE')}`;
      if (!groups.has(group)) groups.set(group, `entity_${String(groups.size + 1).padStart(6, '0')}`);
      occurrences.push({ ...part.entity, entity_id: groups.get(group), output_start: cursor, output_end: cursor + part.text.length });
    }
    cursor += part.text.length;
  }
  return { schema: 'datasecure-private-entity-plan/1', input_hash: trace.input_hash,
    output_hash: trace.output_hash, occurrences };
}
module.exports = { createTransformTrace, replayTransformTrace, applyEdits, entityPlanFromTrace };
