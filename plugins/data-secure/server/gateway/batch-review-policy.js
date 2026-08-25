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

async function reviewSingleBatchTextLocally(input, state, item, deps = {}) {
  // Raw-derived draft data stays in memory and reaches only the native review
  // helper over stdin. It is never returned through MCP or stored in a journal.
  if ((input.ambiguities || []).length === 0) return { text: input.anonymized_text };
  if (state.items.length > 1 && item.review_resumed !== true && deps.deferAmbiguousReview !== false) {
    throw localReviewError('LOCAL_REVIEW_DEFERRED', 'Die lokale Zertifikatsentscheidung wird nach der Stapelanalyse gemeinsam vorgelegt. Die Datei bleibt bis dahin lokal gesperrt.');
  }
  const platform = deps.platform || process.platform;
  if (!['win32', 'darwin', 'linux'].includes(platform)) {
    throw localReviewError('LOCAL_REVIEW_REQUIRED', 'Mehrdeutige Organisationen benötigen auf diesem Gerät eine lokale Entscheidung; es wurde nichts freigegeben.');
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
    throw localReviewError('LOCAL_REVIEW_DEFERRED', 'Die lokale Zertifikatsentscheidung wurde vertagt. Die Datei bleibt lokal gesperrt und kann später ausdrücklich fortgesetzt werden.');
  }
  if (decision.action !== 'reviewed') {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Entscheidung zu einer Zertifizierungsorganisation wurde abgebrochen. Es wurde nichts freigegeben.');
  }
  const ambiguityById = new Map(input.ambiguities.map((candidate) => [candidate.ambiguity_id, candidate]));
  const ambiguityRedactions = decision.decisions
    .filter((candidate) => candidate.decision === 'redact')
    .map((candidate) => {
      const ambiguity = ambiguityById.get(candidate.ambiguity_id);
      return { start: ambiguity.anonymized_start, end: ambiguity.anonymized_end };
    });
  return { text: applyManualRedactions(input.anonymized_text, [...decision.redactions, ...ambiguityRedactions]) };
}

function reviewedBatchText(input, decisions) {
  if (!Array.isArray(decisions)) {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung ist für diese Datei nicht vollständig. Es wurde nichts freigegeben.');
  }
  const ambiguityById = new Map((input.ambiguities || []).map((candidate) => [candidate.ambiguity_id, candidate]));
  if (decisions.length !== ambiguityById.size) {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung ist für diese Datei nicht vollständig. Es wurde nichts freigegeben.');
  }
  const redactions = decisions.map((candidate) => {
    const ambiguity = ambiguityById.get(candidate.ambiguity_id);
    if (!ambiguity || candidate.decision !== 'redact') {
      if (!ambiguity || candidate.decision !== 'keep') {
        throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung ist ungültig. Es wurde nichts freigegeben.');
      }
      return null;
    }
    return { start: ambiguity.anonymized_start, end: ambiguity.anonymized_end };
  }).filter(Boolean);
  return { text: applyManualRedactions(input.anonymized_text, redactions) };
}

module.exports = { localReviewError, reviewSingleBatchTextLocally, reviewedBatchText };
