'use strict';

const crypto = require('node:crypto');
const { normalizeText } = require('../privacy/base');

const SCHEMA = 'datasecure-standalone-review-choices/1';
const MAX_CHOICES = 10000;
const ENTITY_TYPES = new Set(['person_prose_ambiguous', 'person_residual_ambiguous']);
const DECISIONS = new Set(['keep', 'redact', 'redact_organization']);
const DIGEST_RE = /^[A-Za-z0-9_-]{43}$/u;

function invalid() {
  const error = new Error('Die laufgebundene lokale Prüfentscheidung konnte nicht sicher bestätigt werden. Es wurde nichts freigegeben.');
  error.code = 'BATCH_REVIEW_DECISION_BINDING_INVALID';
  return error;
}

function withKey(state, action) {
  if (state?.product_channel !== 'standalone' || !/^[a-f0-9]{64}$/u.test(String(state.token || '')) ||
      !DIGEST_RE.test(String(state.pseudonym_seed || '')) ||
      !/^[a-z0-9][a-z0-9._/-]{0,63}$/u.test(String(state.pseudonym_contract_version || '')) ||
      !/^[a-z0-9][a-z0-9._/-]{0,63}$/u.test(String(state.pseudonym_ruleset_version || '')) ||
      (Object.hasOwn(state, 'core_policy_fingerprint') && !/^[a-f0-9]{64}$/u.test(state.core_policy_fingerprint))) throw invalid();
  const key = Buffer.from(state.pseudonym_seed, 'base64url');
  try {
    if (key.length !== 32 || key.toString('base64url') !== state.pseudonym_seed) throw invalid();
    const domain = `${SCHEMA}\u0000${state.product_channel}\u0000${state.token}\u0000${state.pseudonym_contract_version}\u0000${state.pseudonym_ruleset_version}\u0000${state.core_policy_fingerprint || ''}\u0000`;
    const digest = (purpose, value) => crypto.createHmac('sha256', key).update(domain + purpose + '\u0000', 'utf8')
      .update(value, 'utf8').digest('base64url');
    return action(digest);
  } finally { key.fill(0); }
}

function readEntries(state, digest) {
  if (!Object.hasOwn(state, 'standalone_review_choices')) return new Map();
  const record = state.standalone_review_choices;
  if (!record || Object.keys(record).sort().join(',') !== 'authentication,entries,schema' ||
      record.schema !== SCHEMA || !Array.isArray(record.entries) || record.entries.length > MAX_CHOICES ||
      !DIGEST_RE.test(String(record.authentication || ''))) throw invalid();
  const entries = new Map();
  let previous = '';
  for (const pair of record.entries) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !DIGEST_RE.test(pair[0]) ||
        !DECISIONS.has(pair[1]) || pair[0] <= previous) throw invalid();
    previous = pair[0];
    entries.set(pair[0], pair[1]);
  }
  const expected = Buffer.from(digest('authentication', JSON.stringify(record.entries)), 'base64url');
  const actual = Buffer.from(record.authentication, 'base64url');
  if (actual.length !== expected.length || actual.toString('base64url') !== record.authentication ||
      !crypto.timingSafeEqual(actual, expected)) throw invalid();
  return entries;
}

// The journal contains only keyed, run-specific digests, choices and an
// authenticator. Neither spellings nor source/output offsets are persisted.
function validStandaloneReviewChoices(state) {
  if (!Object.hasOwn(state || {}, 'standalone_review_choices')) return true;
  try { return withKey(state, (digest) => { readEntries(state, digest); return true; }); }
  catch { return false; }
}

function candidateKey(draft, candidate, digest) {
  if (!ENTITY_TYPES.has(candidate?.type)) return null;
  if (typeof draft.original_text !== 'string' || typeof draft.anonymized_text !== 'string' ||
      !Number.isSafeInteger(candidate.original_start) || !Number.isSafeInteger(candidate.original_end) ||
      !Number.isSafeInteger(candidate.anonymized_start) || !Number.isSafeInteger(candidate.anonymized_end) ||
      candidate.original_start < 0 || candidate.original_end <= candidate.original_start || candidate.original_end > draft.original_text.length ||
      candidate.anonymized_start < 0 || candidate.anonymized_end <= candidate.anonymized_start || candidate.anonymized_end > draft.anonymized_text.length) throw invalid();
  const canonical = (text) => normalizeText(text).replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-DE');
  const value = canonical(draft.original_text.slice(candidate.original_start, candidate.original_end));
  if (!value || value !== canonical(draft.anonymized_text.slice(candidate.anonymized_start, candidate.anonymized_end))) throw invalid();
  // Prose and residual hypotheses share one exact spelling family. No fuzzy
  // aliases, legal suffix stripping, or issuer/certificate exceptions.
  return digest('entity-name', value);
}

function prepareStandaloneReviewChoices(state, drafts) {
  return withKey(state, (digest) => {
    const entries = readEntries(state, digest);
    const documents = [];
    const openDrafts = [];
    const openIndices = [];
    for (let index = 0; index < drafts.length; index++) {
      const draft = drafts[index];
      if (!Array.isArray(draft?.ambiguities)) throw invalid();
      const known = new Map();
      const seen = new Set();
      const open = [];
      for (const candidate of draft.ambiguities) {
        const id = candidate?.ambiguity_id;
        if (typeof id !== 'string' || !id || seen.has(id)) throw invalid();
        seen.add(id);
        const key = candidateKey(draft, candidate, digest);
        const choice = key && entries.get(key);
        if (choice) {
          if (choice === 'redact_organization' && draft.allowOrganizationReview !== true) throw invalid();
          known.set(id, choice);
        } else open.push(candidate);
      }
      documents.push({ draft, known, open });
      if (open.length) {
        openIndices.push(index);
        openDrafts.push({ ...draft, ambiguities: open });
      }
    }
    return { documents, openDrafts, openIndices };
  });
}

function mergeStandaloneReviewChoices(plan, outcome) {
  if (outcome?.action !== 'reviewed') return outcome;
  if (!Array.isArray(outcome.documents) || outcome.documents.length !== plan.openIndices.length) throw invalid();
  const choices = plan.documents.map((entry) => new Map(entry.known));
  const seenDocuments = new Set();
  for (const document of outcome.documents) {
    const index = document?.document_index;
    if (!document || Object.keys(document).sort().join(',') !== 'decisions,document_index' ||
        !Number.isSafeInteger(index) || index < 1 || index > plan.openIndices.length ||
        seenDocuments.has(index) || !Array.isArray(document.decisions)) throw invalid();
    seenDocuments.add(index);
    const targetIndex = plan.openIndices[index - 1];
    const target = plan.documents[targetIndex];
    const expected = new Set(target.open.map((candidate) => candidate.ambiguity_id));
    for (const choice of document.decisions) {
      if (!choice || Object.keys(choice).sort().join(',') !== 'ambiguity_id,decision' ||
          !expected.delete(choice.ambiguity_id) || !DECISIONS.has(choice.decision) ||
          (choice.decision === 'redact_organization' && target.draft.allowOrganizationReview !== true)) throw invalid();
      choices[targetIndex].set(choice.ambiguity_id, choice.decision);
    }
    if (expected.size) throw invalid();
  }
  return { action: 'reviewed', documents: plan.documents.map((entry, index) => ({
    document_index: index + 1,
    decisions: entry.draft.ambiguities.map((candidate) => ({ ambiguity_id: candidate.ambiguity_id,
      decision: choices[index].get(candidate.ambiguity_id) }))
  })) };
}

// Invoked only after the complete group has passed publication's exact
// document/occurrence binding. A failed UI/Undo/defer never reaches this point.
function rememberStandaloneReviewChoices(state, drafts, reviewedDocuments) {
  return withKey(state, (digest) => {
    const entries = readEntries(state, digest);
    if (!Array.isArray(drafts) || !Array.isArray(reviewedDocuments) || reviewedDocuments.length !== drafts.length) throw invalid();
    const documentIndices = new Set();
    for (const document of reviewedDocuments) {
      if (!document || Object.keys(document).sort().join(',') !== 'decisions,document_index' ||
          !Number.isSafeInteger(document.document_index) || document.document_index < 1 || document.document_index > drafts.length ||
          documentIndices.has(document.document_index)) throw invalid();
      documentIndices.add(document.document_index);
      const draft = drafts[document.document_index - 1];
      if (!draft || !Array.isArray(draft.ambiguities) || !Array.isArray(document.decisions) ||
          document.decisions.length !== draft.ambiguities.length) throw invalid();
      const byId = new Map(draft.ambiguities.map((candidate) => [candidate.ambiguity_id, candidate]));
      const decisionIds = new Set();
      if (byId.size !== draft.ambiguities.length) throw invalid();
      for (const choice of document.decisions) {
        const candidate = byId.get(choice?.ambiguity_id);
        if (!candidate || !choice || Object.keys(choice).sort().join(',') !== 'ambiguity_id,decision' ||
            decisionIds.has(choice.ambiguity_id) || !DECISIONS.has(choice.decision)) throw invalid();
        decisionIds.add(choice.ambiguity_id);
        const key = candidateKey(draft, candidate, digest);
        if (!key) continue;
        if (choice.decision === 'redact_organization' && draft.allowOrganizationReview !== true) throw invalid();
        const previous = entries.get(key);
        if (previous && previous !== choice.decision) throw invalid();
        entries.set(key, choice.decision);
        if (entries.size > MAX_CHOICES) throw invalid();
      }
    }
    const sorted = [...entries].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    const snapshot = { schema: SCHEMA, entries: sorted,
      authentication: digest('authentication', JSON.stringify(sorted)) };
    state.standalone_review_choices = snapshot;
    return snapshot;
  });
}

module.exports = { SCHEMA, MAX_CHOICES, validStandaloneReviewChoices,
  prepareStandaloneReviewChoices, mergeStandaloneReviewChoices, rememberStandaloneReviewChoices };
