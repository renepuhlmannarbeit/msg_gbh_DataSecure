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

test('shared decisions preserve or redact only the exact ambiguous issuer', () => {
  const input = reviewInput();
  assert.deepStrictEqual(reviewedBatchText(input, [{ ambiguity_id: 'credential:v2:000001', decision: 'keep' }]), { text: input.anonymized_text });
  assert.strictEqual(reviewedBatchText(input, [{ ambiguity_id: 'credential:v2:000001', decision: 'redact' }]).text, '[MANUAL_REDACTION] Zertifikat');
  assert.throws(() => reviewedBatchText(input, []), /nicht vollständig/i);
  assert.throws(() => reviewedBatchText(input, [{ ambiguity_id: 'credential:v2:999999', decision: 'keep' }]), /ungültig/i);
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

  done();
}

main();
