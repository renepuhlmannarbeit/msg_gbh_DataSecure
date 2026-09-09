'use strict';

const { SafeError } = require('../runtime');
const {
  buildReviewDraft,
  validateReviewResult,
  applyManualRedactions,
  reviewTextLocally
} = require('../companion/text-review');

function localReviewError(code, message) {
  const error = new SafeError(message);
  error.code = code;
  return error;
}

function ambiguityRedaction(input, ambiguity, validateOnly = false) {
  if (ambiguity?.type !== 'person_prose_ambiguous') {
    return { start: ambiguity.anonymized_start, end: ambiguity.anonymized_end };
  }
  if (typeof input.replacementForAmbiguity !== 'function') {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Das stabile Personenpseudonym konnte nicht lokal gebunden werden. Es wurde nichts freigegeben.');
  }
  const replacement = validateOnly ? '[PERSON_000]' : input.replacementForAmbiguity(ambiguity);
  return { start: ambiguity.anonymized_start, end: ambiguity.anonymized_end, replacement };
}

async function reviewSingleBatchTextLocally(input, state, item, deps = {}) {
  // Raw-derived draft data stays in memory and reaches only the native review
  // helper over stdin. It is never returned through MCP or stored in a journal.
  if ((input.ambiguities || []).length === 0) return { text: input.anonymized_text };
  if (state.items.length > 1 && item.review_resumed !== true && deps.deferAmbiguousReview !== false) {
    throw localReviewError('LOCAL_REVIEW_DEFERRED', 'Die lokale Zertifikatsentscheidung wird nach der Stapelanalyse gemeinsam vorgelegt. Die Datei bleibt bis dahin lokal gesperrt.');
  }
  const platform = deps.platform || process.platform;
  if (!['win32', 'darwin', 'linux'].includes(platform)) {
    throw localReviewError('LOCAL_REVIEW_REQUIRED', 'Mehrdeutige Personen- oder Organisationsnamen benötigen auf diesem Gerät eine lokale Entscheidung; es wurde nichts freigegeben.');
  }
  const draft = buildReviewDraft(input.original_text, input.anonymized_text, input.profile, input.ambiguities, {
    batchIndex: state.items.indexOf(item) + 1,
    batchTotal: state.items.length,
    allowDefer: true
  });
  const reviewer = deps.reviewTextLocally || reviewTextLocally;
  const rawDecision = await reviewer(draft, {
    platform,
    ...(deps.reviewOptions || {})
  });
  const decision = validateReviewResult(rawDecision, draft);
  if (decision.action === 'deferred') {
    throw localReviewError('LOCAL_REVIEW_DEFERRED', 'Die lokale Mehrdeutigkeitsentscheidung wurde vertagt. Die Datei bleibt lokal gesperrt und kann später ausdrücklich fortgesetzt werden.');
  }
  if (decision.action !== 'reviewed') {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Mehrdeutigkeitsentscheidung wurde abgebrochen. Es wurde nichts freigegeben.');
  }
  const ambiguityById = new Map(input.ambiguities.map((candidate) => [candidate.ambiguity_id, candidate]));
  const ambiguityRedactions = decision.decisions
    .filter((candidate) => candidate.decision === 'redact')
    .map((candidate) => {
      const ambiguity = ambiguityById.get(candidate.ambiguity_id);
      return ambiguityRedaction(input, ambiguity);
    });
  return { text: applyManualRedactions(input.anonymized_text, [...decision.redactions, ...ambiguityRedactions]) };
}

function reviewedBatchText(input, decisions, options = {}) {
  if (!Array.isArray(decisions)) {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung ist für diese Datei nicht vollständig. Es wurde nichts freigegeben.');
  }
  const ambiguityById = new Map((input.ambiguities || []).map((candidate) => [candidate.ambiguity_id, candidate]));
  const reviewedDraft = options.reviewedDraft;
  const reviewedById = new Map((reviewedDraft?.ambiguities || []).map((candidate) => [candidate.ambiguity_id, candidate]));
  const activeDecisions = [];
  for (const decision of decisions) {
    if (ambiguityById.has(decision.ambiguity_id)) {
      activeDecisions.push(decision);
      continue;
    }
    if (!reviewedDraft) {
      throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung ist ungültig. Es wurde nichts freigegeben.');
    }
    // A prior document in this same reviewed batch can establish the exact
    // person identity. The replay then replaces it before ambiguity discovery.
    // Accept that vanished decision only when the immutable reviewed draft is
    // the same source, it was explicitly redacted, and the freshly generated
    // text contains the registry's exact bound marker but no raw spelling.
    const prior = reviewedById.get(decision.ambiguity_id);
    if (!prior || decision.decision !== 'redact' || prior.type !== 'person_prose_ambiguous' ||
        prior.replacement_kind !== 'PERSON' || reviewedDraft.original_text !== input.original_text ||
        typeof options.resolvedPersonReplacement !== 'function') {
      throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung ist für diese Datei nicht vollständig. Es wurde nichts freigegeben.');
    }
    const raw = reviewedDraft.original_text.slice(prior.original_start, prior.original_end);
    const replacement = options.resolvedPersonReplacement(raw);
    if (typeof replacement !== 'string' || !replacement || !input.anonymized_text.includes(replacement) ||
        input.anonymized_text.includes(raw)) {
      throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung konnte nicht sicher mit dem bereits gebundenen Personenpseudonym bestätigt werden.');
    }
  }
  if (activeDecisions.length !== ambiguityById.size) {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung ist für diese Datei nicht vollständig. Es wurde nichts freigegeben.');
  }
  const redactions = activeDecisions.map((candidate) => {
    const ambiguity = ambiguityById.get(candidate.ambiguity_id);
    if (!ambiguity || candidate.decision !== 'redact') {
      if (!ambiguity || candidate.decision !== 'keep') {
        throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung ist ungültig. Es wurde nichts freigegeben.');
      }
      return null;
    }
    return ambiguityRedaction(input, ambiguity, options.validateOnly === true);
  }).filter(Boolean);
  return { text: applyManualRedactions(input.anonymized_text, redactions) };
}

module.exports = { localReviewError, reviewSingleBatchTextLocally, reviewedBatchText };
