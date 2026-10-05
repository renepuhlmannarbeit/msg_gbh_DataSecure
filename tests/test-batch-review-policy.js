'use strict';

const { createSuite } = require('./helpers');
const {
  reviewSingleBatchTextLocally,
  reviewedBatchText
} = require('../plugins/data-secure/server/gateway/batch-review-policy');

const { test, testAsync, done, assert } = createSuite('Batch review policy');

function reviewInput() {
  return {
    original_text: 'Scrum.org Zertifikat',
    anonymized_text: 'Scrum.org Zertifikat',
    profile: 'personnel_profile',
    ambiguities: [{
      ambiguity_id: 'credential:v2:000001',
      type: 'credential_issuer_ambiguous',
      original_start: 0,
      original_end: 9,
      anonymized_start: 0,
      anonymized_end: 9
    }]
  };
}

function personReviewInput() {
  const original = 'Anna Berger koordinierte die Einführung.';
  return {
    original_text: original,
    anonymized_text: original,
    profile: 'personnel_profile',
    ambiguities: [{
      ambiguity_id: 'person:v1:000001',
      type: 'person_prose_ambiguous',
      replacement_kind: 'PERSON',
      original_start: 0,
      original_end: 11,
      anonymized_start: 0,
      anonymized_end: 11
    }],
    replacementForAmbiguity(candidate) {
      assert.strictEqual(original.slice(candidate.original_start, candidate.original_end), 'Anna Berger');
      return '[PERSON_007]';
    }
  };
}

test('shared decisions preserve or redact only the exact ambiguous issuer', () => {
  const input = reviewInput();
  assert.deepStrictEqual(reviewedBatchText(input, [{ ambiguity_id: 'credential:v2:000001', decision: 'keep' }]), { text: input.anonymized_text });
  assert.strictEqual(reviewedBatchText(input, [{ ambiguity_id: 'credential:v2:000001', decision: 'redact' }]).text, '[MANUAL_REDACTION] Zertifikat');
  assert.throws(() => reviewedBatchText(input, []), /nicht vollständig/i);
  assert.throws(() => reviewedBatchText(input, [{ ambiguity_id: 'credential:v2:999999', decision: 'keep' }]), /ungültig/i);
});

test('person decisions are occurrence-bound and use a stable typed pseudonym', () => {
  const input = personReviewInput();
  assert.deepStrictEqual(reviewedBatchText(input, [{ ambiguity_id: 'person:v1:000001', decision: 'keep' }]),
    { text: input.anonymized_text });
  assert.strictEqual(reviewedBatchText(input, [{ ambiguity_id: 'person:v1:000001', decision: 'redact' }]).text,
    '[PERSON_007] koordinierte die Einführung.');
  const missingRegistry = { ...input };
  delete missingRegistry.replacementForAmbiguity;
  assert.throws(() => reviewedBatchText(missingRegistry,
    [{ ambiguity_id: 'person:v1:000001', decision: 'redact' }]), /Personenpseudonym/u);
});

test('company review uses only an explicitly permitted ORG assignment and cannot become a keep exception', () => {
  const input = { ...personReviewInput(), allowOrganizationReview: true,
    replacementForAmbiguity(_candidate, kind) { assert.equal(kind, 'ORG'); return '[UNTERNEHMEN_003]'; } };
  const choices = [{ ambiguity_id: input.ambiguities[0].ambiguity_id, decision: 'redact_organization' }];
  assert.equal(reviewedBatchText(input, choices).text, '[UNTERNEHMEN_003] koordinierte die Einführung.');
  assert.throws(() => reviewedBatchText({ ...input, allowOrganizationReview: false }, choices), /nicht verfügbar/u);
  assert.throws(() => reviewedBatchText({ ...input, replacementForAmbiguity: () => '[PERSON_003]' }, choices), /gewählten Typ/u);
  assert.throws(() => reviewedBatchText({ ...reviewInput(), allowOrganizationReview: true }, [
    { ambiguity_id: 'credential:v2:000001', decision: 'redact_organization' }
  ]), /nicht verfügbar/u);
  const replayed = { ...input, anonymized_text: '[UNTERNEHMEN_003] koordinierte die Einführung.', ambiguities: [] };
  const options = { reviewedDraft: input, resolvedOrganizationReplacement: () => '[UNTERNEHMEN_003]' };
  assert.equal(reviewedBatchText(replayed, choices, options).text, replayed.anonymized_text);
  for (const altered of [ { ...replayed, original_text: replayed.original_text + ' geändert' },
    { ...replayed, anonymized_text: replayed.anonymized_text + ' Anna Berger' } ]) {
    assert.throws(() => reviewedBatchText(altered, choices, options), error => error.code === 'LOCAL_REVIEW_CANCELLED');
  }
});

test('a replayed person decision is accepted only for the exact source, redact choice and bound marker', () => {
  const reviewedDraft = personReviewInput();
  const replayed = {
    ...personReviewInput(),
    anonymized_text: '[PERSON_007] koordinierte die Einführung.',
    ambiguities: []
  };
  const options = { reviewedDraft, resolvedPersonReplacement: () => '[PERSON_007]' };
  assert.deepStrictEqual(reviewedBatchText(replayed,
    [{ ambiguity_id: 'person:v1:000001', decision: 'redact' }], options), { text: replayed.anonymized_text });
  for (const [name, input, decisions, changedOptions] of [
    ['keep decision', replayed, [{ ambiguity_id: 'person:v1:000001', decision: 'keep' }], options],
    ['missing marker', { ...replayed, anonymized_text: 'Die Einführung wurde koordiniert.' },
      [{ ambiguity_id: 'person:v1:000001', decision: 'redact' }], options],
    ['wrong marker binding', replayed, [{ ambiguity_id: 'person:v1:000001', decision: 'redact' }],
      { ...options, resolvedPersonReplacement: () => '[PERSON_008]' }],
    ['changed source', { ...replayed, original_text: `${replayed.original_text} Zusatz` },
      [{ ambiguity_id: 'person:v1:000001', decision: 'redact' }], options],
    ['raw spelling remains', { ...replayed, anonymized_text: `${replayed.anonymized_text} Anna Berger` },
      [{ ambiguity_id: 'person:v1:000001', decision: 'redact' }], options]
  ]) {
    assert.throws(() => reviewedBatchText(input, decisions, changedOptions),
      (error) => error.code === 'LOCAL_REVIEW_CANCELLED', name);
  }
});

async function main() {
  await testAsync('clear text bypasses the local UI while a multi-file ambiguity defers', async () => {
    const clear = await reviewSingleBatchTextLocally({ anonymized_text: 'Technischer Inhalt', ambiguities: [] }, { items: [{}] }, {});
    assert.deepStrictEqual(clear, { text: 'Technischer Inhalt' });
    await assert.rejects(
      reviewSingleBatchTextLocally(reviewInput(), { items: [{}, {}] }, {}),
      (error) => error.code === 'LOCAL_REVIEW_DEFERRED'
    );
  });

  await testAsync('a reviewed single-file decision is applied in memory only', async () => {
    const input = reviewInput();
    const item = {};
    const output = await reviewSingleBatchTextLocally(input, { items: [item] }, item, {
      platform: 'win32',
      reviewTextLocally: (draft) => ({
        action: 'reviewed',
        redactions: [],
        decisions: draft.ambiguities.map((candidate) => ({ ambiguity_id: candidate.ambiguity_id, decision: 'redact' }))
      })
    });
    assert.strictEqual(output.text, '[MANUAL_REDACTION] Zertifikat');
  });

  await testAsync('Standalone defers single and multiple ambiguous files to the app, never the native dialog', async () => {
    for (const platform of ['win32', 'darwin', 'linux']) {
      for (const count of [1, 2]) {
        const item = { review_resumed: true };
        let nativeCalls = 0;
        await assert.rejects(reviewSingleBatchTextLocally(reviewInput(), {
          product_channel: 'standalone', items: [item, ...Array(count - 1).fill({})]
        }, item, { platform, deferAmbiguousReview: false,
          reviewTextLocally() { nativeCalls++; throw new Error('unexpected native dialog'); }
        }), error => error.code === 'LOCAL_REVIEW_DEFERRED');
        assert.strictEqual(nativeCalls, 0);
      }
    }
  });

  done();
}

main();
