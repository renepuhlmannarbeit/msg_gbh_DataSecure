'use strict';

// Shared text-only privacy operation. Extraction and publication are adapters;
// neither a review draft nor this transient state is publication authority.
const { SafeError } = require('../runtime');
const pii = require('../pii-engine');
const { anonymizeMarkdown } = require('./compliance');
const { personFieldContextForConsumer } = require('../core/person-field-policy');
const { credentialIssuerAmbiguities } = require('../privacy/credentials');
const { personProseCandidateSpans, personProseAmbiguities } = require('../privacy/person-ambiguities');
const { residualPersonAmbiguities, createPersonReviewBinding, reviewedPersonRanges } = require('../privacy/residual-person-review');
const { canonicalizeRenderedText } = require('../privacy/base');
const { createTransformTrace, applyEdits } = require('../privacy/transform-plan');
const { PRIVACY_RULESET_VERSION, CREDENTIAL_CONTEXT_POLICY_VERSION } = require('../privacy/policy');
const { LIMITS } = require('./common');
const operations = new WeakMap();
const invalid = () => new SafeError('Die lokale Textprüfung lieferte keine freigabefähige Fassung.');

function reservePersonReviewCandidates(text, registry, allowOrganizationReview = false, profile = 'general', consumerOptions = {}, ocrLineReview = false) {
  const fieldContext = personFieldContextForConsumer(consumerOptions);
  if (Object.hasOwn(fieldContext.consumerOptions, 'contentOptions') && !allowOrganizationReview)
    throw Object.assign(new SafeError('Der Inhaltsvertrag ist für diesen Produktweg nicht erlaubt.'), { code: 'CONTENT_OPTIONS_FORBIDDEN' });
  const original = canonicalizeRenderedText(text, fieldContext.policy);
  const reservations = personProseCandidateSpans(original, { ...fieldContext.consumerOptions,
    productChannel: allowOrganizationReview ? 'standalone' : 'cowork', profile, ocrLineReview })
    .filter(span => !registry?.lookup?.('PERSON', span.value) && !(allowOrganizationReview && registry?.lookup?.('ORG', span.value)))
    .map((span, index) => ({ ...span, token: `[PERSON_REVIEW_${String(index + 1).padStart(6, '0')}]` }));
  const ordered = [...reservations].sort((a, b) => a.start - b.start);
  if (ordered.some((span, index) => original.slice(span.start, span.end) !== span.value ||
      index > 0 && ordered[index - 1].end > span.start) || reservations.some(span => original.includes(span.token)))
    throw Object.assign(new SafeError('Die lokalen Personenhinweise konnten nicht eindeutig rekonstruiert werden.'), { code: 'AMBIGUITY_REVIEW_REQUIRED' });
  let masked = original;
  for (const span of [...reservations].sort((a, b) => b.start - a.start))
    masked = masked.slice(0, span.start) + span.token + masked.slice(span.end);
  return { original, masked,
    mask_edits: ordered.map(span => ({ start: span.start, end: span.end, original: span.value, replacement: span.token, kind: 'RESERVATION' })),
    restore(value, applied) {
      const before = String(value || ''), edits = [];
      for (const span of reservations) {
        const first = before.indexOf(span.token);
        if (first < 0 || before.indexOf(span.token, first + span.token.length) >= 0)
          throw Object.assign(new SafeError('Ein lokaler Personenhinweis konnte nach der Datenschutzprüfung nicht sicher rekonstruiert werden.'), { code: 'AMBIGUITY_REVIEW_REQUIRED' });
        edits.push({ start: first, end: first + span.token.length, original: span.token, replacement: span.value, kind: 'RESERVATION_RESTORE' });
      }
      edits.sort((a, b) => a.start - b.start);
      const restored = applyEdits(before, edits);
      if (applied) applied(before, restored, edits);
      return restored;
    }
  };
}

function prepareTextPrivacyReview({ text, profile, productChannel, consumerOptions = {}, registry, captureTrace = false,
  technicalReviewRequired = false, ocrLineReview = false }) {
  const fieldContext = personFieldContextForConsumer(consumerOptions), fieldOptions = fieldContext.consumerOptions;
  const personReview = reservePersonReviewCandidates(text, registry, productChannel === 'standalone', profile, fieldOptions, ocrLineReview);
  const transform = captureTrace ? createTransformTrace(personReview.original) : null;
  if (transform) transform.append('reserve', personReview.original, personReview.masked, personReview.mask_edits);
  const anon = anonymizeMarkdown(personReview.masked, profile, { ...fieldOptions, registry, deferPersonReview: true,
    ...(transform ? { captureTransformPlan: true } : {}) });
  if (transform) transform.appendTrace('anonymization', anon.transform_trace);
  anon.text = personReview.restore(anon.text, transform ?
    (before, after, edits) => transform.append('restore-reservation', before, after, edits) : undefined);
  const organizationAmbiguities = ['personnel_profile', 'applicant'].includes(profile)
    ? credentialIssuerAmbiguities(personReview.original, anon.text) : [];
  const proseAmbiguities = personProseAmbiguities(personReview.original, anon.text, { ...fieldOptions, productChannel, profile, ocrLineReview });
  const personAmbiguities = [...proseAmbiguities, ...residualPersonAmbiguities(personReview.original, anon.text,
    pii.scanResidual(anon.text, profile, anon.dictionary, { ...fieldOptions, strongPersonAnchor: anon.strongPersonAnchor,
      includePersonCandidateSpans: true, originalSourceText: personReview.original })
      .filter(finding => finding.type !== 'PERSON_CANDIDATE' || !proseAmbiguities.some(candidate =>
        finding.start >= candidate.anonymized_start && finding.end <= candidate.anonymized_end)), { productChannel })];
  const ambiguities = [...organizationAmbiguities, ...personAmbiguities];
  const binding = createPersonReviewBinding(anon.text, ambiguities, { productChannel, allowOrganizationReview: productChannel === 'standalone' });
  const draft = Object.freeze({ original_text: personReview.original, anonymized_text: anon.text, profile,
    detected_identifiers: anon.entityCount, ambiguities,
    ...(productChannel === 'standalone' ? { allowOrganizationReview: true } : {}),
    confirmPersonReview(decisions, redactions, resultText) {
      binding.confirm(decisions, redactions, resultText);
      if (transform) transform.append('human-review', anon.text, resultText,
        [...redactions].sort((a, b) => a.start - b.start || a.end - b.end).map(edit => ({ start: edit.start, end: edit.end,
          original: anon.text.slice(edit.start, edit.end), replacement: edit.replacement || '[MANUAL_REDACTION]',
          kind: /^\[PERSON_/u.test(edit.replacement || '') ? 'PERSON' :
            /^\[(?:UNTERNEHMEN|ORGANISATION)_/u.test(edit.replacement || '') ? 'ORGANIZATION' : 'MANUAL_REDACTION' })));
    },
    replacementForAmbiguity(candidate, kind = 'PERSON') {
      if (!['person_prose_ambiguous', 'person_residual_ambiguous'].includes(candidate?.type) || candidate.replacement_kind !== 'PERSON')
        throw new SafeError('Die lokale Mehrdeutigkeitsentscheidung ist ungültig.');
      if (kind !== 'PERSON' && !(kind === 'ORG' && productChannel === 'standalone'))
        throw new SafeError('Der gewählte Entitätstyp ist für diesen Produktweg nicht erlaubt.');
      return registry.assign(kind, personReview.original.slice(candidate.original_start, candidate.original_end));
    }, technical_review_required: technicalReviewRequired });
  const value = Object.freeze({ draft, profile, entityCount: anon.entityCount, passes: anon.passes,
    reidentificationRisk: anon.reidentificationRisk, organizationAmbiguities, personAmbiguities, ambiguities });
  operations.set(value, { anon, personReview, transform, binding, fieldContext, fieldOptions, profile, resolved: false });
  return value;
}

async function resolveTextPrivacyReview(value, reviewText, { checkAbort = () => {} } = {}) {
  const state = operations.get(value);
  if (!state || state.resolved) throw invalid();
  if (value.ambiguities.length && !reviewText)
    throw Object.assign(new SafeError('Mehrdeutige Personen- oder Organisationsnamen benötigen eine lokale Entscheidung vor der Freigabe.'), { code: 'AMBIGUITY_REVIEW_REQUIRED' });
  let text = state.anon.text;
  if (reviewText) {
    const result = await reviewText(value.draft); checkAbort();
    if (!result || typeof result.text !== 'string') throw invalid();
    if (result.text.length > LIMITS.MAX_TEXT_CHARS) throw new SafeError('Die lokal bearbeitete Fassung ist zu groß.');
    text = result.text;
  }
  state.resolved = true; state.reviewedText = text;
  return text;
}

function finalizeTextPrivacyReview(value, reviewedText, { prefix, suffix }) {
  const state = operations.get(value);
  if (!state || !state.resolved || state.reviewedText !== reviewedText || typeof prefix !== 'string' || typeof suffix !== 'string') throw invalid();
  const { anon, personReview, transform, binding, fieldContext, fieldOptions, profile } = state;
  const reviewedPersonCandidates = binding.forPublication(prefix, reviewedText, suffix), markdown = prefix + reviewedText + suffix;
  const residual = pii.scanResidual(markdown, profile, anon.dictionary, { ...fieldOptions,
    strongPersonAnchor: anon.strongPersonAnchor, originalSourceText: personReview.original, reviewedPersonCandidates });
  if (residual.length) throw Object.assign(new SafeError(`Finale Markdown-Datei hat den Residual-Gate nicht bestanden (${[...new Set(residual.map(x => x.type))].sort().join(', ')}).`), { code: 'RESIDUAL_PII' });
  if (transform) transform.append('publication-frame', reviewedText, markdown, [
    ...(prefix ? [{ start: 0, end: 0, original: '', replacement: prefix, kind: 'TECHNICAL' }] : []),
    ...(suffix ? [{ start: reviewedText.length, end: reviewedText.length, original: '', replacement: suffix, kind: 'TECHNICAL' }] : [])]);
  const context = { profile, dictionary: anon.dictionary,
    ...(Object.hasOwn(fieldOptions, 'contentOptions') ? { person_field_policy: fieldContext.policy } : {}),
    strong_person_anchor: anon.strongPersonAnchor === true, ruleset: PRIVACY_RULESET_VERSION, credential_policy: CREDENTIAL_CONTEXT_POLICY_VERSION,
    publication_frame: { prefix, suffix },
    reviewed_ranges: reviewedPersonRanges(reviewedPersonCandidates, canonicalizeRenderedText(markdown, fieldContext.policy)).map(range => ({
      start: range.start + prefix.length - canonicalizeRenderedText(prefix, fieldContext.policy).length,
      end: range.end + prefix.length - canonicalizeRenderedText(prefix, fieldContext.policy).length })) };
  return Object.freeze({ markdown, original_text: personReview.original, dictionary: anon.dictionary,
    strong_person_anchor: anon.strongPersonAnchor === true, reviewed_person_candidates: reviewedPersonCandidates,
    transform_trace: transform ? transform.finish(markdown) : null, verification_context: context });
}

module.exports = Object.freeze({ reservePersonReviewCandidates, prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview });
