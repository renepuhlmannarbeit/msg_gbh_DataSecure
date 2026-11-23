'use strict';

// RC178 review R-002. A phone number the document itself establishes (label
// or international form) must be replaced at every further occurrence, also
// in another spelling. Unrelated unlabelled numbers keep requiring a label.
const { createSuite } = require('./helpers');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } =
  require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { makeRegistry } = require('../plugins/data-secure/server/privacy/entities');
const { findStructuredSpans } = require('../plugins/data-secure/server/privacy/structured');
const { testAsync, test, assert, done } = createSuite('Repeated phone numbers');
const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: true };

async function release(text) {
  const operation = prepareTextPrivacyReview({ text, profile: 'general', productChannel: 'standalone',
    consumerOptions: { productChannel: 'standalone', contentOptions }, registry: makeRegistry(), captureTrace: false });
  const resolved = await resolveTextPrivacyReview(operation, undefined, { reviewPolicy: 'automatic-conservative' });
  return finalizeTextPrivacyReview(operation, resolved, { prefix: '', suffix: '' }).markdown;
}
const body = (markdown) => markdown.split('\n\n').slice(1).join('\n\n');

async function main() {
  await testAsync('a detected phone number is replaced at every further occurrence and spelling', async () => {
    for (const [text, expected] of [
      ['Telefon: 030 1234567\n\nRückruf unter 030 1234567.', 'Rückruf unter [PHONE_REDACTED].'],
      ['Telefon: 030 1234567\n\nDie Nummer 030/1234567 oder 0301234567.', 'Die Nummer [PHONE_REDACTED] oder [PHONE_REDACTED].'],
      ['Telefon: +49 30 1234567\n\nNational 030 1234567.', 'National [PHONE_REDACTED].'],
      ['Telefon: 030 1234567\n\nInternational 0049 30 1234567.', 'International [PHONE_REDACTED].']
    ]) {
      const markdown = await release(text);
      assert.equal(body(markdown), expected, text);
      assert.doesNotMatch(markdown, /1234567/u, text);
    }
  });

  test('unlabelled numbers without a detected counterpart keep requiring their own label', () => {
    const phones = (text) => findStructuredSpans(text).filter((span) => span.type === 'PHONE').map((span) => span.text);
    assert.deepEqual(phones('Rufen Sie 0171-2345678 an.'), []);
    // Same subscriber digits without the trunk zero, a different number and a
    // calendar date are not the detected identifier.
    assert.deepEqual(phones('Telefon: 030 1234567\n\nBetrag 1234567, Nummer 030 1234568, am 03.01.2023.'), ['030 1234567']);
    assert.deepEqual(phones('Telefon: +49 30 1234567\n\nWert 301234567.'), ['+49 30 1234567']);
    assert.deepEqual(phones('Tel.: 12345\n\nPosten 12345.'), ['12345']);
  });


  done();
}

main().catch((error) => { console.error(error); process.exit(1); });
