'use strict';

const { createSuite } = require('./helpers');
const {
  BATCH_REVIEW_SCHEMA,
  buildBatchReviewDraft,
  resolveBatchReviewResult,
  reviewBatchTextLocally
} = require('../plugins/data-secure/server/companion/text-review');

const { test, testAsync, done, assert } = createSuite('Local batch review model');

function ambiguity(id, originalText, anonymizedText, value) {
  return {
    ambiguity_id: id,
    type: 'credential_issuer_ambiguous',
    original_start: originalText.indexOf(value),
    original_end: originalText.indexOf(value) + value.length,
    anonymized_start: anonymizedText.indexOf(value),
    anonymized_end: anonymizedText.indexOf(value) + value.length
  };
}

test('builds one anonymous local draft and maps choices back to the source position', () => {
  const firstOriginal = 'Microsoft Azure Administrator';
  const firstAnonymous = 'Microsoft Azure Administrator';
  const secondOriginal = 'Scrum.org PSM I';
  const secondAnonymous = 'Scrum.org PSM I';
  const bundle = buildBatchReviewDraft([
    { original_text: firstOriginal, anonymized_text: firstAnonymous, profile: 'personnel_profile', ambiguities: [ambiguity('credential:v2:000001', firstOriginal, firstAnonymous, 'Microsoft')] },
    { original_text: secondOriginal, anonymized_text: secondAnonymous, profile: 'personnel_profile', ambiguities: [ambiguity('credential:v2:000001', secondOriginal, secondAnonymous, 'Scrum.org')] }
  ], { allowDefer: true });
  assert.strictEqual(bundle.draft.batch_review.schema, BATCH_REVIEW_SCHEMA);
  assert.strictEqual(bundle.draft.batch_review.document_count, 2);
  assert.strictEqual(bundle.draft.batch_review.display, 'anonymous_document_sequence');
  assert.match(bundle.draft.original_text, /Dokument 1 von 2/);
  assert.match(bundle.draft.original_text, /Dokument 2 von 2/);
  assert.strictEqual(bundle.draft.ambiguities.length, 2);
  assert.notStrictEqual(bundle.draft.ambiguities[0].ambiguity_id, bundle.draft.ambiguities[1].ambiguity_id);
  const result = resolveBatchReviewResult(bundle, {
    action: 'reviewed', redactions: [], decisions: bundle.draft.ambiguities.map((candidate, index) => ({
      ambiguity_id: candidate.ambiguity_id,
      decision: index === 0 ? 'keep' : 'redact'
    }))
  });
  assert.deepStrictEqual(result, {
    action: 'reviewed',
    documents: [
      { document_index: 1, decisions: [{ ambiguity_id: 'credential:v2:000001', decision: 'keep' }] },
      { document_index: 2, decisions: [{ ambiguity_id: 'credential:v2:000001', decision: 'redact' }] }
    ]
  });
});

test('never accepts free ranges or missing decisions for the shared batch review', () => {
  const original = 'Microsoft Zertifikat';
  const bundle = buildBatchReviewDraft([{
    original_text: original, anonymized_text: original, profile: 'personnel_profile',
    ambiguities: [ambiguity('credential:v2:000001', original, original, 'Microsoft')]
  }]);
  const id = bundle.draft.ambiguities[0].ambiguity_id;
  assert.throws(() => resolveBatchReviewResult(bundle, {
    action: 'reviewed', redactions: [{ start: 0, end: 1 }], decisions: [{ ambiguity_id: id, decision: 'keep' }]
  }), /Freie Bereichsanonymisierungen/);
  assert.throws(() => resolveBatchReviewResult(bundle, {
    action: 'reviewed', redactions: [], decisions: []
  }), /Nicht alle mehrdeutigen Organisationen/);
});

test('keeps names and paths out of its local-to-local metadata map', () => {
  const original = 'Microsoft Zertifikat';
  const bundle = buildBatchReviewDraft([{
    original_text: original, anonymized_text: original, profile: 'personnel_profile',
    ambiguities: [ambiguity('credential:v2:000001', original, original, 'Microsoft')],
    name: 'secret-profile.docx', path: 'C:\\very-secret\\secret-profile.docx'
  }]);
  const metadata = JSON.stringify({ batch_review: bundle.draft.batch_review, entries: bundle.entries.map((entry) => ({ document_index: entry.document_index, ids: [...entry.candidate_ids.keys()] })) });
  assert.doesNotMatch(metadata, /secret-profile|very-secret|Microsoft/u);
});

async function main() {
await testAsync('opens exactly one local reviewer call for all documents and keeps deferral bounded', async () => {
  const first = 'Microsoft Zertifikat';
  const second = 'Scrum.org Zertifikat';
  let calls = 0;
  const result = await reviewBatchTextLocally([
    { original_text: first, anonymized_text: first, profile: 'personnel_profile', ambiguities: [ambiguity('credential:v2:000001', first, first, 'Microsoft')] },
    { original_text: second, anonymized_text: second, profile: 'personnel_profile', ambiguities: [ambiguity('credential:v2:000001', second, second, 'Scrum.org')] }
  ], {
    allowDefer: true,
    reviewTextLocally: (draft) => {
      calls++;
      assert.strictEqual(draft.batch_review.document_count, 2);
      assert.strictEqual(draft.allow_defer, true);
      return { action: 'deferred' };
    }
  });
  assert.strictEqual(calls, 1);
  assert.deepStrictEqual(result, { action: 'deferred', documents: [] });
});

done();
}

main();
