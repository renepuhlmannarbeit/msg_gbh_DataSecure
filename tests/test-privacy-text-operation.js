'use strict';

// The shared operation uses the actual privacy engine and review policy; no
// detector fixture or saved `passed` flag can stand in for its final gate.
const { createSuite } = require('./helpers');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } =
  require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { makeRegistry } = require('../plugins/data-secure/server/privacy/entities');
const { replayTransformTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const { reviewedBatchText } = require('../plugins/data-secure/server/gateway/batch-review-policy');
const { testAsync, assert, done } = createSuite('Shared text privacy operation');
const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false };
const prepare = (text, extra = {}) => prepareTextPrivacyReview({ text, profile: 'general', productChannel: 'standalone',
  consumerOptions: { productChannel: 'standalone', contentOptions }, registry: makeRegistry(), captureTrace: true, ...extra });
const review = decision => input => reviewedBatchText(input,
  input.ambiguities.map(candidate => ({ ambiguity_id: candidate.ambiguity_id, decision })));

async function main() {
  await testAsync('actual engine, review and frame produce one exact replayable trace for both policies', async () => {
    for (const consumerOptions of [{}, { productChannel: 'standalone', contentOptions }]) {
      const value = prepare('Name: Anna Beispiel\nE-Mail: anna@example.invalid\nBetrag: 42 EUR', { consumerOptions });
      const text = await resolveTextPrivacyReview(value, review('keep'));
      const final = finalizeTextPrivacyReview(value, text, { prefix: '> Lokaler Hinweis\n\n', suffix: '' });
      assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
      assert.doesNotMatch(final.markdown, /Anna Beispiel|anna@example\.invalid/u);
      assert.match(final.markdown, /42 EUR/u);
      assert.equal(final.verification_context.publication_frame.prefix, '> Lokaler Hinweis\n\n');
      assert.equal(Object.hasOwn(final.verification_context, 'person_field_policy'), Object.hasOwn(consumerOptions, 'contentOptions'));
    }
  });
  await testAsync('one occurrence can be typed as person or company using the same actual draft and registry', async () => {
    for (const [decision, marker] of [['redact', /\[PERSON_\d+\]/u], ['redact_organization', /\[(?:UNTERNEHMEN|ORGANISATION)_\d+\]/u]]) {
      const value = prepare('CAPGEMINI INVENT\nTechnischer Sachinhalt.');
      assert.ok(value.draft.ambiguities.some(candidate => candidate.replacement_kind === 'PERSON'));
      const text = await resolveTextPrivacyReview(value, review(decision));
      const final = finalizeTextPrivacyReview(value, text, { prefix: '', suffix: '' });
      assert.match(final.markdown, marker); assert.doesNotMatch(final.markdown, /CAPGEMINI INVENT/u);
      assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
    }
  });
  await testAsync('keep confirmation cannot exempt newly inserted contact data or a different draft', async () => {
    const value = prepare('Service Level bleibt ein technischer Begriff.');
    const text = await resolveTextPrivacyReview(value, review('keep'));
    assert.throws(() => finalizeTextPrivacyReview(value, text + '\nE-Mail: unsafe@example.invalid', { prefix: '', suffix: '' }));
    assert.throws(() => finalizeTextPrivacyReview({ ...value }, text, { prefix: '', suffix: '' }));
  });
  await done();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
