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

function ambiguityRedaction(input, ambiguity, validateOnly = false, decision = 'redact') {
  const organization = decision === 'redact_organization';
  if (organization && (!(input.allowOrganizationReview === true || input.allow_organization_review === true) ||
      !['person_prose_ambiguous', 'person_residual_ambiguous'].includes(ambiguity?.type))) {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die Unternehmensentscheidung ist für diese Fundstelle nicht verfügbar.');
  }
  if (!['person_prose_ambiguous', 'person_residual_ambiguous'].includes(ambiguity?.type)) {
    return { start: ambiguity.anonymized_start, end: ambiguity.anonymized_end };
  }
  if (typeof input.replacementForAmbiguity !== 'function') {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Das stabile Personenpseudonym konnte nicht lokal gebunden werden. Es wurde nichts freigegeben.');
  }
  const kind = organization ? 'ORG' : 'PERSON';
  const replacement = validateOnly ? organization ? '[UNTERNEHMEN_000]' : '[PERSON_000]'
    : input.replacementForAmbiguity(ambiguity, kind);
  if (!(organization ? /^\[(?:UNTERNEHMEN|ORGANISATION)_(?:[0-9]{3,5}|[A-Z2-7]{10,52})\]$/u
    : /^\[PERSON_(?:[0-9]{3,5}|[A-Z2-7]{10,52})\]$/u).test(replacement)) {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Das Entitätspseudonym konnte nicht mit dem gewählten Typ gebunden werden.');
  }
  return { start: ambiguity.anonymized_start, end: ambiguity.anonymized_end, replacement };
}

async function reviewSingleBatchTextLocally(input, state, item, deps = {}) {
  // Raw-derived draft data stays in memory and reaches only the native review
  // helper over stdin. It is never returned through MCP or stored in a journal.
  if ((input.ambiguities || []).length === 0) return { text: input.anonymized_text };
  // Standalone always enters the explicit app-owned review, including a
  // one-file run. Reviewed replay uses reviewedBatchText, not this native route.
  // Cowork retains its existing direct single-document dialog behavior.
  if (state.product_channel === 'standalone') {
    throw localReviewError('LOCAL_REVIEW_DEFERRED', 'Die Datei benötigt eine lokale Entscheidung in der Anwendung. Wähle für diesen Lauf „Jetzt prüfen“ oder setze ihn später im Verlauf fort. Bis dahin bleibt die Datei lokal gesperrt.');
  }
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
  const redactions = [...decision.redactions, ...ambiguityRedactions];
  const text = applyManualRedactions(input.anonymized_text, redactions);
  input.confirmPersonReview?.(decision.decisions, redactions, text);
  return { text };
}

function reviewedBatchText(input, decisions, options = {}) {
  if (!Array.isArray(decisions)) {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung ist für diese Datei nicht vollständig. Es wurde nichts freigegeben.');
  }
  const ambiguityById = new Map((input.ambiguities || []).map((candidate) => [candidate.ambiguity_id, candidate]));
  const reviewedDraft = options.reviewedDraft;
  if (reviewedDraft && reviewedDraft.original_text !== input.original_text) {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung gehört zu einer anderen Quellfassung. Es wurde nichts freigegeben.');
  }
  const reviewedById = new Map((reviewedDraft?.ambiguities || []).map((candidate) => [candidate.ambiguity_id, candidate]));
  const activeDecisions = [];
  const activeIds = new Set();
  for (const decision of decisions) {
    const prior = reviewedById.get(decision.ambiguity_id);
    // Earlier publications can resolve a candidate and renumber the remaining
    // ones. A Standalone replay is bound to the immutable source occurrence,
    // never to a mutable display ordinal. No fuzzy text or nearest match.
    const current = reviewedDraft && input.allowOrganizationReview === true && prior
      ? (input.ambiguities || []).find(candidate => candidate.type === prior.type &&
          candidate.replacement_kind === prior.replacement_kind &&
          candidate.original_start === prior.original_start && candidate.original_end === prior.original_end)
      : ambiguityById.get(decision.ambiguity_id);
    if (current) {
      if (reviewedDraft) {
        if (!prior || prior.type !== current.type || prior.original_start !== current.original_start ||
            prior.original_end !== current.original_end) {
          throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung gehört zu einer anderen Fundstelle. Es wurde nichts freigegeben.');
        }
      }
      if (activeIds.has(current.ambiguity_id)) {
        throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung enthält eine doppelte Fundstelle. Es wurde nichts freigegeben.');
      }
      activeIds.add(current.ambiguity_id);
      activeDecisions.push({ ...decision, ambiguity_id: current.ambiguity_id });
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
    const organization = decision.decision === 'redact_organization' && input.allowOrganizationReview === true;
    const resolver = organization ? options.resolvedOrganizationReplacement : options.resolvedPersonReplacement;
    if (!prior || !(decision.decision === 'redact' || organization) || !['person_prose_ambiguous', 'person_residual_ambiguous'].includes(prior.type) ||
        prior.replacement_kind !== 'PERSON' || reviewedDraft.original_text !== input.original_text ||
        typeof resolver !== 'function') {
      throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung ist für diese Datei nicht vollständig. Es wurde nichts freigegeben.');
    }
    const raw = reviewedDraft.original_text.slice(prior.original_start, prior.original_end);
    const replacement = resolver(raw);
    const marker = organization ? /^\[(?:UNTERNEHMEN|ORGANISATION)_(?:[0-9]{3,5}|[A-Z2-7]{10,52})\]$/u
      : /^\[PERSON_(?:[0-9]{3,5}|[A-Z2-7]{10,52})\]$/u;
    if (typeof replacement !== 'string' || !marker.test(replacement) || !input.anonymized_text.includes(replacement) ||
        input.anonymized_text.includes(raw)) {
      throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung konnte nicht sicher mit dem bereits gebundenen Personenpseudonym bestätigt werden.');
    }
  }
  if (activeDecisions.length !== ambiguityById.size) {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung ist für diese Datei nicht vollständig. Es wurde nichts freigegeben.');
  }
  const redactions = activeDecisions.map((candidate) => {
    const ambiguity = ambiguityById.get(candidate.ambiguity_id);
    if (!ambiguity || !['redact', 'redact_organization'].includes(candidate.decision)) {
      if (!ambiguity || candidate.decision !== 'keep') {
        throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung ist ungültig. Es wurde nichts freigegeben.');
      }
      return null;
    }
    return ambiguityRedaction(input, ambiguity, options.validateOnly === true, candidate.decision);
  }).filter(Boolean);
  const text = applyManualRedactions(input.anonymized_text, redactions, {
    allowOrganizationReview: input.allowOrganizationReview === true || input.allow_organization_review === true
  });
  if (options.validateOnly !== true) input.confirmPersonReview?.(activeDecisions, redactions, text);
  return { text };
}

module.exports = { localReviewError, reviewSingleBatchTextLocally, reviewedBatchText };
