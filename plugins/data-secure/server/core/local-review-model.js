'use strict';

const { SafeError } = require('../runtime');
const pii = require('../pii-engine');
const { RESOURCE_LIMITS: LIMITS } = require('../resource-limits');
const { normalizeText } = require('../privacy/base');

const REVIEW_SCHEMA = 'data-secure-text-review/3';
const BATCH_REVIEW_SCHEMA = 'data-secure-batch-review/3';
const MAX_REVIEW_CHARS = LIMITS.MAX_TEXT_CHARS;
const MAX_DARWIN_REVIEW_FINDINGS = 1000;
const MAX_MANUAL_REDACTIONS = 10_000;

function reviewSizeError() {
  const error = new SafeError('Die lokale Prüfgruppe ist zu groß. Kleinere Gruppen sind erforderlich; bereits geprüfte Ergebnisse bleiben erhalten.');
  error.code = 'LOCAL_REVIEW_TOO_LARGE';
  return error;
}

function reviewDocumentLabel(index, count) {
  return count === 1 ? '' : `\n\n===== Dokument ${index + 1} von ${count} =====\n\n`;
}

function batchReviewProgress(documentCount, findingCount, progress = {}) {
  const integers = {
    batch_total: progress.batchTotal ?? documentCount,
    automatically_completed_count: progress.automaticallyCompleted ?? 0,
    safely_stopped_count: progress.safelyStopped ?? 0,
    other_pending_count: progress.otherPending ?? 0,
    previously_reviewed_count: progress.previouslyReviewed ?? 0,
    review_pending_count: progress.reviewPendingTotal ?? documentCount
  };
  if (!Number.isSafeInteger(documentCount) || documentCount < 1 ||
      !Number.isSafeInteger(findingCount) || findingCount < 1 ||
      Object.values(integers).some((value) => !Number.isSafeInteger(value) || value < 0) ||
      integers.batch_total < 1 || integers.batch_total > LIMITS.MAX_BATCH_FILES ||
      integers.review_pending_count < documentCount ||
      integers.automatically_completed_count + integers.safely_stopped_count + integers.other_pending_count +
        integers.previously_reviewed_count + integers.review_pending_count !== integers.batch_total) {
    throw new SafeError('Der lokale Stapelreview-Fortschritt ist ungültig.');
  }
  return {
    ...integers,
    review_document_count: documentCount,
    review_finding_count: findingCount
  };
}

function batchReviewSummary(draft) {
  const review = draft?.batch_review;
  if (!review) return '';
  const parts = [
    `Automatisch abgeschlossen: ${review.automatically_completed_count}.`,
    `Bereits lokal geprüft: ${review.previously_reviewed_count}.`,
    `Jetzt zu prüfen: ${review.review_finding_count} Stellen in ${review.review_document_count} Dateien.`,
    `Danach noch offen: ${Math.max(0, review.review_pending_count - review.review_document_count)} Dateien.`
  ];
  if (review.safely_stopped_count > 0) parts.push(`Sicher gestoppt: ${review.safely_stopped_count}.`);
  if (review.other_pending_count > 0) parts.push(`Weitere lokale Schritte offen: ${review.other_pending_count}.`);
  return parts.join(' ');
}

function exactContextLine(text, start, end) {
  const source = String(text || '');
  const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndAt = source.indexOf('\n', end);
  const lineEnd = lineEndAt < 0 ? source.length : lineEndAt;
  // This is a deliberately narrow equivalence proof: grouping is permitted
  // only when the complete local source line is identical after the same
  // Unicode/whitespace normalization. It is never a fuzzy issuer match.
  return normalizeText(source.slice(lineStart, lineEnd)).replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-DE');
}

function decisionGroups(ambiguities, originalText, allowOrganizationReview = false) {
  const candidatesByContext = new Map();
  for (const candidate of ambiguities) {
    const source = String(originalText || '');
    const identity = normalizeText(source.slice(candidate.original_start, candidate.original_end))
      .replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-DE');
    const context = exactContextLine(source, candidate.original_start, candidate.original_end);
    // A potential person's exact normalized spelling is the decision unit:
    // allowing the same spelling to be kept in one document and redacted in
    // another would contradict the batch-wide identity contract. Credential
    // issuers remain groupable only under the stricter full-context proof.
    // One visible choice may cover identical, still occurrence-bound person
    // hypotheses. The privacy binding below still checks every exact span;
    // this does not create a global allowlist for later runs.
    const person = ['person_prose_ambiguous', 'person_residual_ambiguous'].includes(candidate.type);
    const basis = person ? identity : context;
    if (!basis) continue;
    const family = person && allowOrganizationReview ? 'entity_name' : candidate.type;
    const key = `${family}\u0000${basis}`;
    const ids = candidatesByContext.get(key) || [];
    ids.push(candidate.ambiguity_id);
    candidatesByContext.set(key, ids);
  }
  let group = 0;
  return [...candidatesByContext.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => ({
      group_id: `same_decision:v1:${String(++group).padStart(6, '0')}`,
      candidate_ids: ids
    }));
}

function groupForCandidate(draft, ambiguityId) {
  const groups = draft?.decision_groups;
  if (!Array.isArray(groups)) return null;
  const matches = groups.filter((group) => group && Array.isArray(group.candidate_ids) && group.candidate_ids.includes(ambiguityId));
  if (matches.length !== 1) return null;
  const group = matches[0];
  if (!/^same_decision:v1:[0-9]{6}$/u.test(String(group.group_id || '')) ||
    group.candidate_ids.length < 2 || new Set(group.candidate_ids).size !== group.candidate_ids.length) return null;
  return group;
}

function buildReviewDraft(originalText, anonymizedText, profile, ambiguities = [], progress = {}) {
  // sensitiveSpans uses the engine's normalised coordinate space. Displaying
  // that same local-only representation keeps highlights correct for NFC,
  // soft-hyphen and zero-width inputs instead of applying shifted offsets.
  const original = normalizeText(originalText);
  const anonymized = String(anonymizedText || '');
  const locators = pii.sensitiveSpans(original, profile).map((span, index) => ({
    locator_id: `text:v1:${String(index + 1).padStart(6, '0')}`,
    medium: 'extracted_text',
    start: span.start,
    end: span.end,
    type: span.type
  }));
  const safeAmbiguities = (ambiguities || []).map((item) => {
    const credential = item?.type === 'credential_issuer_ambiguous';
    const person = ['person_prose_ambiguous', 'person_residual_ambiguous'].includes(item?.type);
    const keys = credential
      ? ['ambiguity_id', 'anonymized_end', 'anonymized_start', 'original_end', 'original_start', 'type']
      : ['ambiguity_id', 'anonymized_end', 'anonymized_start', 'original_end', 'original_start', 'replacement_kind', 'type'];
    if (!item || Object.keys(item).sort().join(',') !== keys.sort().join(',') ||
      !(credential ? /^credential:v2:[0-9]{6}$/u : item?.type === 'person_residual_ambiguous'
        ? /^person-residual:v1:[0-9]{6}$/u : /^person:v1:[0-9]{6}$/u).test(String(item.ambiguity_id || '')) ||
      (!credential && (!person || item.replacement_kind !== 'PERSON')) ||
      !Number.isSafeInteger(item.original_start) || !Number.isSafeInteger(item.original_end) ||
      !Number.isSafeInteger(item.anonymized_start) || !Number.isSafeInteger(item.anonymized_end) ||
      item.original_start < 0 || item.original_end <= item.original_start || item.original_end > original.length ||
      item.anonymized_start < 0 || item.anonymized_end <= item.anonymized_start || item.anonymized_end > anonymized.length) {
      throw new SafeError('Ein lokaler Mehrdeutigkeits-Hinweis ist ungültig.');
    }
    return { ...item };
  });
  const batchIndex = progress.batchIndex ?? 1;
  const batchTotal = progress.batchTotal ?? 1;
  const allowDefer = progress.allowDefer === true;
  if (!Number.isSafeInteger(batchIndex) || !Number.isSafeInteger(batchTotal) ||
    batchIndex < 1 || batchTotal < 1 || batchTotal > LIMITS.MAX_BATCH_FILES || batchIndex > batchTotal) {
    throw new SafeError('Der lokale Dateifortschritt ist ungültig.');
  }
  return {
    schema: REVIEW_SCHEMA,
    original_text: original,
    anonymized_text: anonymized,
    locators,
    ambiguities: safeAmbiguities,
    // Local-only decision metadata is part of every review draft. This makes
    // repeated person spellings one decision unit even inside a single file;
    // the aggregate batch facade merely adds progress and document mapping.
    decision_groups: decisionGroups(safeAmbiguities, original, progress.allowOrganizationReview === true),
    ...(progress.allowOrganizationReview === true ? { allow_organization_review: true } : {}),
    batch_index: batchIndex,
    batch_total: batchTotal,
    allow_defer: allowDefer
  };
}

// A batch review is intentionally an in-memory adapter around the established
// single-text review schema. The journal stores neither this draft nor its
// `entries` map: callers recreate it from sealed source copies for the one
// local UI process. Anonymous "Dokument N" separators remain the default;
// Standalone alone can attach validated private source labels for its review
// window. Neither labels nor source text enter an eventual MCP response.
function buildBatchReviewDraft(documents, progress = {}) {
  if (!Array.isArray(documents) || documents.length < 1 || documents.length > LIMITS.MAX_BATCH_FILES) {
    throw new SafeError('Der lokale Stapelreview enthält keine zulässige Anzahl von Dokumenten.');
  }
  // Bound before normalization, span detection and joined copies are allocated.
  for (const field of ['original_text', 'anonymized_text']) {
    let length = 0;
    for (let index = 0; index < documents.length; index++) {
      length += String(documents[index]?.[field] || '').length + reviewDocumentLabel(index, documents.length).length;
      if (length > MAX_REVIEW_CHARS) throw reviewSizeError();
    }
  }
  const originals = [];
  const anonymized = [];
  const ambiguities = [];
  const entries = [];
  let originalOffset = 0;
  let anonymizedOffset = 0;
  let globalCandidate = 0;

  for (let index = 0; index < documents.length; index++) {
    const document = documents[index];
    if (!document || typeof document !== 'object') {
      throw new SafeError('Ein lokaler Stapelreview enthält einen ungültigen Dokumententwurf.');
    }
    const individual = buildReviewDraft(
      document.original_text,
      document.anonymized_text,
      document.profile || 'general',
      document.ambiguities || [],
      { batchIndex: index + 1, batchTotal: documents.length,
        allowOrganizationReview: document.allowOrganizationReview === true || document.allow_organization_review === true }
    );
    const label = reviewDocumentLabel(index, documents.length);
    originals.push(label, individual.original_text);
    anonymized.push(label, individual.anonymized_text);
    originalOffset += label.length;
    anonymizedOffset += label.length;
    const candidateIds = new Map();
    for (const candidate of individual.ambiguities) {
      const kind = candidate.type === 'person_prose_ambiguous' ? 'person:v1'
        : candidate.type === 'person_residual_ambiguous' ? 'person-residual:v1' : 'credential:v2';
      const globalId = `${kind}:${String(++globalCandidate).padStart(6, '0')}`;
      candidateIds.set(globalId, candidate.ambiguity_id);
      ambiguities.push({
        ambiguity_id: globalId,
        type: candidate.type,
        ...(candidate.replacement_kind ? { replacement_kind: candidate.replacement_kind } : {}),
        original_start: originalOffset + candidate.original_start,
        original_end: originalOffset + candidate.original_end,
        anonymized_start: anonymizedOffset + candidate.anonymized_start,
        anonymized_end: anonymizedOffset + candidate.anonymized_end
      });
    }
    entries.push({ document_index: index + 1, candidate_ids: candidateIds });
    originalOffset += individual.original_text.length;
    anonymizedOffset += individual.anonymized_text.length;
  }
  if (ambiguities.length === 0) {
    throw new SafeError('Der lokale Stapelreview enthält keine offenen Zuordnungen.');
  }
  const originalText = originals.join('');
  const anonymizedText = anonymized.join('');
  if (originalText.length > MAX_REVIEW_CHARS || anonymizedText.length > MAX_REVIEW_CHARS) {
    throw reviewSizeError();
  }
  const draft = buildReviewDraft(originalText, anonymizedText, 'general', ambiguities, {
    batchIndex: 1,
    batchTotal: 1,
    allowDefer: progress.allowDefer === true,
    // Only the app-owned Standalone adapter opts in. Native Cowork review
    // drafts and their existing two-choice payload remain unchanged.
    allowOrganizationReview: documents.every((document) =>
      document.allowOrganizationReview === true || document.allow_organization_review === true)
  });
  draft.batch_review = {
    schema: BATCH_REVIEW_SCHEMA,
    document_count: documents.length,
    display: 'anonymous_document_sequence',
    ...batchReviewProgress(documents.length, draft.ambiguities.length, progress),
    // Candidate IDs are opaque local handles. The raw context used to prove
    // equality remains only in the already displayed local draft and is never
    // copied into this metadata, a journal, MCP response or diagnostic.
    decision_groups: draft.decision_groups
  };
  if (draft.allow_organization_review === true) draft.batch_review.documents = entries.map(entry => ({
    document_index: entry.document_index, candidate_ids: [...entry.candidate_ids.keys()]
  }));
  if (Object.hasOwn(progress, 'privateSourceLabels')) {
    const labels = progress.privateSourceLabels;
    if (draft.allow_organization_review !== true || !Array.isArray(labels) || labels.length !== entries.length ||
        labels.some(label => typeof label !== 'string' || !label || label.length > 2048 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(label)))
      throw new SafeError('Ungültige private Standalone-Dokumentzuordnung.');
    draft.batch_review.documents.forEach((entry, index) => { entry.source_label = labels[index]; });
  }
  return { draft, entries };
}

// Convert a validated aggregate answer back to per-document decisions without
// carrying raw text, locators or document names beyond this call boundary.
// Range redactions deliberately remain unavailable in the first batch UI:
// ranges crossing a synthetic document separator could otherwise be mapped to
// the wrong output. Credential decisions remain fully actionable.
function resolveBatchReviewResult(bundle, value) {
  if (!bundle || !bundle.draft || !Array.isArray(bundle.entries)) {
    throw new SafeError('Der lokale Stapelreview-Zustand ist ungültig.');
  }
  const decision = validateReviewResult(value, bundle.draft);
  if (decision.action !== 'reviewed') return { action: decision.action, documents: [] };
  if (decision.redactions.length !== 0) {
    throw new SafeError('Freie Bereichsanonymisierungen sind im gemeinsamen Stapelreview noch nicht verfügbar.');
  }
  const byGlobalId = new Map();
  for (const entry of bundle.entries) {
    if (!entry || !Number.isSafeInteger(entry.document_index) || !(entry.candidate_ids instanceof Map)) {
      throw new SafeError('Der lokale Stapelreview-Zustand ist ungültig.');
    }
    for (const [globalId, localId] of entry.candidate_ids) {
      if (byGlobalId.has(globalId)) throw new SafeError('Der lokale Stapelreview enthält doppelte Fundstellen.');
      byGlobalId.set(globalId, { document_index: entry.document_index, ambiguity_id: localId });
    }
  }
  const grouped = new Map(bundle.entries.map((entry) => [entry.document_index, []]));
  for (const item of decision.decisions) {
    const target = byGlobalId.get(item.ambiguity_id);
    if (!target) throw new SafeError('Die lokale Stapelentscheidung enthält eine unbekannte Fundstelle.');
    grouped.get(target.document_index).push({ ambiguity_id: target.ambiguity_id, decision: item.decision });
  }
  return {
    action: 'reviewed',
    documents: [...grouped.entries()].map(([document_index, decisions]) => ({ document_index, decisions }))
  };
}

async function coordinateBatchReview(documents, options, reviewer) {
  if (typeof reviewer !== 'function') throw new SafeError('Die lokale Stapelprüfung ist nicht verfügbar.');
  const bundle = buildBatchReviewDraft(documents, {
    allowDefer: options.allowDefer === true,
    ...(options.batchSummary || {}),
    ...(options.privateSourceLabels ? { privateSourceLabels: options.privateSourceLabels } : {})
  });
  const answer = await reviewer(bundle.draft, options);
  return resolveBatchReviewResult(bundle, answer);
}

// The caller owns the lifetime of this promise. In particular it must not put
// `bundle`, `draft` or this result into a journal: all three are local review
// material. Keeping the coordinator here makes the one-UI-call invariant easy
// to test independently from later batch publication mechanics.
function validateReviewResult(value, draft = null) {
  if (draft?.ocr_contact_review === true) return require('../core/ocr-contact-review').validateContactAnswer(value, draft);
  if (!value || !['reviewed', 'skipped', 'cancelled', 'deferred'].includes(value.action)) {
    throw new SafeError('Die lokale Textprüfung lieferte kein gültiges Ergebnis.');
  }
  if (value.action === 'deferred') {
    if (Object.keys(value).sort().join(',') !== 'action') throw new SafeError('Die lokale Vertagung enthält nicht erlaubte Felder.');
    return { action: 'deferred' };
  }
  if (value.action === 'reviewed') {
    if (!Array.isArray(value.redactions) || value.redactions.length > MAX_MANUAL_REDACTIONS) {
      throw new SafeError('Die lokalen Anonymisierungsaktionen sind ungültig oder zu zahlreich.');
    }
    const reviewKeys = Object.keys(value).sort().join(',');
    const noAmbiguities = !draft || (draft.ambiguities || []).length === 0;
    if (reviewKeys !== 'action,decisions,redactions' && !(noAmbiguities && reviewKeys === 'action,redactions')) {
      throw new SafeError('Die lokale Textprüfung enthält nicht erlaubte Felder.');
    }
    const suppliedDecisions = value.decisions === undefined && noAmbiguities ? [] : value.decisions;
    if (!Array.isArray(suppliedDecisions)) throw new SafeError('Die lokalen Zuordnungsentscheidungen fehlen.');
    const decisions = suppliedDecisions.map((item) => {
      if (!item || Object.keys(item).sort().join(',') !== 'ambiguity_id,decision' ||
        !(['keep', 'redact'].includes(item.decision) ||
          (draft?.allow_organization_review === true && item.decision === 'redact_organization'))) {
        throw new SafeError('Eine lokale Zuordnungsentscheidung ist ungültig.');
      }
      return { ambiguity_id: String(item.ambiguity_id), decision: item.decision };
    });
    if (draft) {
      const expected = (draft.ambiguities || []).map((item) => item.ambiguity_id).sort();
      const actual = decisions.map((item) => item.ambiguity_id).sort();
      if (new Set(actual).size !== actual.length || actual.length !== expected.length ||
          actual.some((id, index) => id !== expected[index])) {
        throw new SafeError('Nicht alle mehrdeutigen Stellen wurden lokal entschieden.');
      }
      const byId = new Map((draft.ambiguities || []).map((item) => [item.ambiguity_id, item]));
      const personChoices = new Map();
      for (const choice of decisions) {
        const candidate = byId.get(choice.ambiguity_id);
        if (choice.decision === 'redact_organization' &&
            !['person_prose_ambiguous', 'person_residual_ambiguous'].includes(candidate?.type)) {
          throw new SafeError('Diese Fundstelle erlaubt keine Unternehmensentscheidung.');
        }
        if (!['person_prose_ambiguous', 'person_residual_ambiguous'].includes(candidate?.type)) continue;
        const identity = normalizeText(draft.original_text.slice(candidate.original_start, candidate.original_end))
          .replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-DE');
        const family = draft.allow_organization_review === true ? 'entity_name' : candidate.type;
        const decisionKey = `${family}:${identity}`;
        const previous = personChoices.get(decisionKey);
        if (previous && previous !== choice.decision) {
          throw new SafeError('Gleiche mögliche Personennamen müssen im lokalen Stapel einheitlich entschieden werden.');
        }
        personChoices.set(decisionKey, choice.decision);
      }
    }
    return {
      action: 'reviewed',
      decisions,
      redactions: value.redactions.map((range) => {
        if (
          !range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) ||
          Object.keys(range).sort().join(',') !== 'end,start'
        ) throw new SafeError('Eine lokale Anonymisierungsauswahl ist ungültig.');
        return { start: range.start, end: range.end };
      })
    };
  }
  if (Object.keys(value).join(',') !== 'action') throw new SafeError('Die lokale Textprüfung enthält nicht erlaubte Felder.');
  return { action: value.action };
}

function applyManualRedactions(text, ranges, options = {}) {
  const source = String(text || '');
  const sorted = [...(ranges || [])].sort((a, b) => a.start - b.start || a.end - b.end);
  let previousEnd = 0;
  for (const range of sorted) {
    if (
      !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) ||
      range.start < previousEnd || range.start < 0 || range.end <= range.start || range.end > source.length ||
      (range.replacement !== undefined &&
        !/^\[(?:MANUAL_REDACTION|PERSON_(?:[0-9]{3,5}|[A-Z2-7]{10,52}))\]$/u.test(range.replacement) &&
        !(options.allowOrganizationReview === true &&
          /^\[(?:UNTERNEHMEN|ORGANISATION)_(?:[0-9]{3,5}|[A-Z2-7]{10,52})\]$/u.test(range.replacement)))
    ) throw new SafeError('Eine lokale Anonymisierungsauswahl liegt außerhalb des geprüften Textes.');
    previousEnd = range.end;
  }
  let result = source;
  for (const range of sorted.reverse()) {
    result = result.slice(0, range.start) + (range.replacement || '[MANUAL_REDACTION]') + result.slice(range.end);
  }
  if (result.length > MAX_REVIEW_CHARS) throw new SafeError('Die lokal anonymisierte Fassung ist zu groß.');
  return result;
}


module.exports = Object.freeze({
  REVIEW_SCHEMA, BATCH_REVIEW_SCHEMA, MAX_REVIEW_CHARS, MAX_DARWIN_REVIEW_FINDINGS,
  reviewSizeError, buildReviewDraft, buildBatchReviewDraft, batchReviewProgress,
  batchReviewSummary, groupForCandidate, resolveBatchReviewResult, coordinateBatchReview,
  validateReviewResult, applyManualRedactions
});
