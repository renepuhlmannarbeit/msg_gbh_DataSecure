'use strict';

// RC178 review R-001. A known person in the genitive ("Müllers Auto") must not
// reach the released Markdown. The cases run through the actual shared text
// privacy operation with the automatic policy; the residual gate is checked
// separately because it must not share the redactor's blind spot.
const { createSuite } = require('./helpers');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } =
  require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { makeRegistry } = require('../plugins/data-secure/server/privacy/entities');
const pii = require('../plugins/data-secure/server/pii-engine');
const { testAsync, test, assert, done } = createSuite('Inflected known person names');
const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: true };

async function release(text) {
  const operation = prepareTextPrivacyReview({ text, profile: 'general', productChannel: 'standalone',
    consumerOptions: { productChannel: 'standalone', contentOptions }, registry: makeRegistry(), captureTrace: false });
  const resolved = await resolveTextPrivacyReview(operation, undefined, { reviewPolicy: 'automatic-conservative' });
  return finalizeTextPrivacyReview(operation, resolved, { prefix: '', suffix: '' }).markdown;
}
const body = (markdown) => markdown.split('\n\n').slice(1).join('\n\n');

async function main() {
  await testAsync('genitive forms of a known person are replaced in the released Markdown', async () => {
    for (const [sentence, expected] of [
      ['Das ist Hans Müllers Auto.', 'Das ist [PERSON_001] Auto.'],
      ['Wir sprachen mit Müllers Kollegen.', 'Wir sprachen mit [PERSON_001] Kollegen.'],
      ['Müllers haben angerufen.', '[PERSON_001] haben angerufen.'],
      ["Das ist Müller's Auto.", 'Das ist [PERSON_001] Auto.'],
      ['Das ist Müller’s Auto.', 'Das ist [PERSON_001] Auto.'],
      ['MÜLLERS Akte liegt vor.', '[PERSON_001] Akte liegt vor.']
    ]) {
      const markdown = await release(`Name: Hans Müller\n\n${sentence}`);
      assert.equal(body(markdown), expected, sentence);
      assert.doesNotMatch(markdown, /Müller|Hans/iu, sentence);
    }
  });

  await testAsync('words that only begin with the name and other entity types stay unchanged', async () => {
    for (const sentence of ['Die Müllerstraße ist gesperrt.', 'Die Müllersche Buchhandlung öffnet.']) {
      assert.equal(body(await release(`Name: Hans Müller\n\n${sentence}`)), sentence);
    }
    // A name ending in a sibilant takes no genitive s; its apostrophe stays.
    assert.equal(body(await release('Name: Klaus Hans\n\nDas ist Klaus Hans’ Buch.')), 'Das ist [PERSON_001]’ Buch.');
  });

  test('the residual gate reports an inflected known person, but not an inflected organisation', () => {
    const person = pii.scanResidual('Das ist Müllers Auto.', 'general', [{ value: 'Müller', type: 'PERSON_ALIAS' }]);
    assert.ok(person.some((finding) => finding.type === 'RESIDUAL_ENTITY'), 'person genitive must be a residual finding');
    const organisation = pii.scanResidual('Die Nordwinds Zahlen.', 'general', [{ value: 'Nordwind', type: 'ORGANIZATION' }]);
    assert.ok(!organisation.some((finding) => finding.type === 'RESIDUAL_ENTITY'));
    const untyped = pii.scanResidual('Das ist Müllers Auto.', 'general', ['Müller']);
    assert.ok(!untyped.some((finding) => finding.type === 'RESIDUAL_ENTITY'), 'untyped legacy values keep the exact boundary');
  });
  done();
}

main().catch((error) => { console.error(error); process.exit(1); });
