'use strict';

const { normalizeText, canonicalizeRenderedText } = require('./base');
const { preservedTextRanges } = require('./credentials');

// These capabilities live only in the processing call. They are neither a
// persisted allowlist nor a user/MCP parameter, and contain no public fields.
const approvals = new WeakMap();
const TYPE = 'person_residual_ambiguous';

function invalidReview() {
  const error = new Error('Die lokale Personenentscheidung passt nicht unverändert zur geprüften Fundstelle. Es wurde nichts freigegeben.');
  error.code = 'AMBIGUITY_REVIEW_REQUIRED';
  return error;
}

function residualPersonAmbiguities(originalText, anonymizedText, findings) {
  const original = normalizeText(originalText);
  const anonymized = String(anonymizedText);
  if (canonicalizeRenderedText(anonymized) !== anonymized || !Array.isArray(findings) || findings.length > 1000) throw invalidReview();
  const identical = original === anonymized;
  const preserved = identical ? [{ original_start: 0, original_end: original.length, anonymized_start: 0 }]
    : preservedTextRanges(original, anonymized);
  const fragmentProvenance = new Map();
  const completelyPreserved = (retained) => {
    const fragment = original.slice(retained.original_start, retained.original_end);
    if (fragmentProvenance.has(fragment)) return fragmentProvenance.get(fragment);
    if (!fragment.length) return false;
    const copies = preserved.filter((range) => range.original_end - range.original_start === fragment.length &&
      original.slice(range.original_start, range.original_end) === fragment);
    const occurrences = [];
    for (let index = original.indexOf(fragment); index >= 0; index = original.indexOf(fragment, index + 1)) {
      if (occurrences.length >= copies.length) {
        fragmentProvenance.set(fragment, false);
        return false;
      }
      occurrences.push(index);
    }
    const complete = copies.length === occurrences.length && copies.every((range, index) =>
      range.original_start === occurrences[index] &&
      anonymized.slice(range.anonymized_start, range.anonymized_start + fragment.length) === fragment &&
      (!index || (copies[index - 1].original_end <= range.original_start &&
        copies[index - 1].anonymized_start + fragment.length <= range.anonymized_start)));
    fragmentProvenance.set(fragment, complete);
    return complete;
  };
  const candidates = [];
  for (const finding of [...findings].sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (finding?.type !== 'PERSON_CANDIDATE' || !Number.isSafeInteger(finding.start) ||
        !Number.isSafeInteger(finding.end) || finding.start < 0 || finding.end <= finding.start ||
        finding.end > anonymized.length || anonymized.slice(finding.start, finding.end) !== finding.text) throw invalidReview();
    if (candidates.some((item) => item.anonymized_start === finding.start && item.anonymized_end === finding.end)) continue;
    // Do not guess how overlapping name hypotheses should be grouped. The
    // terminal residual gate remains in force when exact alignment is absent.
    if (candidates.some((item) => item.anonymized_start < finding.end && finding.start < item.anonymized_end)) throw invalidReview();
    const retained = preserved.find((range) => finding.start >= range.anonymized_start &&
      finding.end <= range.anonymized_start + range.original_end - range.original_start);
    if (!retained) throw invalidReview();
    // A repeated fragment is locatable only when ALL original occurrences
    // survive as complete, disjoint copies in the same source/output order.
    // A missing/duplicated copy or a merely partial match is not repaired by
    // choosing the first occurrence or guessing an ordinal.
    if (!identical && !completelyPreserved(retained)) throw invalidReview();
    const start = retained.original_start + finding.start - retained.anonymized_start;
    const end = start + finding.end - finding.start;
    if (original.slice(start, end) !== finding.text) throw invalidReview();
    candidates.push({
      ambiguity_id: `person-residual:v1:${String(candidates.length + 1).padStart(6, '0')}`,
      type: TYPE,
      replacement_kind: 'PERSON',
      original_start: start,
      original_end: end,
      anonymized_start: finding.start,
      anonymized_end: finding.end
    });
  }
  return candidates;
}

function createPersonReviewBinding(text, ambiguities) {
  const source = String(text);
  if (!Array.isArray(ambiguities) || ambiguities.length > 1000) throw invalidReview();
  const snapshot = ambiguities.map((item) => Object.freeze({ ...item }));
  const byId = new Map(snapshot.map((item) => [item.ambiguity_id, item]));
  if (byId.size !== snapshot.length) throw invalidReview();
  const required = snapshot.filter((item) => item.type === TYPE);
  for (const item of required) {
    if (!/^person-residual:v1:[0-9]{6}$/u.test(item.ambiguity_id) || item.replacement_kind !== 'PERSON' ||
        !Number.isSafeInteger(item.anonymized_start) || !Number.isSafeInteger(item.anonymized_end) ||
        item.anonymized_start < 0 || item.anonymized_end <= item.anonymized_start || item.anonymized_end > source.length) throw invalidReview();
  }
  let confirmed = null;

  function confirm(decisions, redactions, resultText) {
    if (!required.length) return;
    if (confirmed || !Array.isArray(decisions) || decisions.length !== snapshot.length ||
        !Array.isArray(redactions) || redactions.length > 10000 || typeof resultText !== 'string') throw invalidReview();
    const choices = new Map();
    for (const item of decisions) {
      if (!item || Object.keys(item).sort().join(',') !== 'ambiguity_id,decision' ||
          !byId.has(item.ambiguity_id) || choices.has(item.ambiguity_id) || !['keep', 'redact'].includes(item.decision)) throw invalidReview();
      choices.set(item.ambiguity_id, item.decision);
    }
    const edits = redactions.map((item) => ({ ...item })).sort((a, b) => a.start - b.start || a.end - b.end);
    let cursor = 0, expected = '';
    for (const edit of edits) {
      if (!['end,start', 'end,replacement,start'].includes(Object.keys(edit).sort().join(',')) ||
          !Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end) || edit.start < cursor ||
          edit.end <= edit.start || edit.end > source.length ||
          (edit.replacement !== undefined && !/^\[(?:MANUAL_REDACTION|PERSON_(?:[0-9]{3,5}|[A-Z2-7]{10,52}))\]$/u.test(edit.replacement))) throw invalidReview();
      expected += source.slice(cursor, edit.start) + (edit.replacement || '[MANUAL_REDACTION]');
      cursor = edit.end;
    }
    expected += source.slice(cursor);
    if (expected !== resultText || canonicalizeRenderedText(resultText) !== resultText) throw invalidReview();
    const ranges = [];
    for (const item of required) {
      const start = item.anonymized_start, end = item.anonymized_end;
      const overlaps = edits.filter((edit) => edit.start < end && start < edit.end);
      if (choices.get(item.ambiguity_id) === 'redact') {
        if (overlaps.length !== 1 || overlaps[0].start !== start || overlaps[0].end !== end ||
            !/^\[PERSON_/u.test(overlaps[0].replacement || '')) throw invalidReview();
        continue;
      }
      if (overlaps.length) throw invalidReview();
      const offset = edits.filter((edit) => edit.end <= start).reduce((sum, edit) =>
        sum + (edit.replacement || '[MANUAL_REDACTION]').length - (edit.end - edit.start), 0);
      if (resultText.slice(start + offset, end + offset) !== source.slice(start, end)) throw invalidReview();
      ranges.push(Object.freeze({ start: start + offset, end: end + offset }));
    }
    confirmed = { text: resultText, ranges };
  }

  function forPublication(prefix, body, suffix) {
    if (!required.length) return undefined;
    if (!confirmed || confirmed.text !== body || typeof prefix !== 'string' || typeof suffix !== 'string') throw invalidReview();
    const renderedPrefix = canonicalizeRenderedText(prefix);
    const rendered = canonicalizeRenderedText(prefix + body + suffix);
    if (rendered !== renderedPrefix + body + canonicalizeRenderedText(suffix)) throw invalidReview();
    const token = Object.freeze({});
    approvals.set(token, { text: rendered, ranges: Object.freeze(confirmed.ranges.map((range) => Object.freeze({
      start: range.start + renderedPrefix.length, end: range.end + renderedPrefix.length
    }))) });
    return token;
  }
  return { confirm, forPublication };
}

function reviewedPersonRanges(token, rendered) {
  const approval = token && typeof token === 'object' ? approvals.get(token) : null;
  return approval?.text === rendered ? approval.ranges : [];
}

module.exports = { residualPersonAmbiguities, createPersonReviewBinding, reviewedPersonRanges };
