'use strict';

// RC178 review R-024, found in the native Windows run. "im Zeitraum 2019-2024"
// has the shape of a street with a house-number range and was replaced as a
// location. A closed list of temporal nouns followed by a year is a period;
// every other "Am/Im <Word> <number>" keeps the address interpretation.
const { createSuite } = require('./helpers');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } =
  require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { makeRegistry } = require('../plugins/data-secure/server/privacy/entities');
const { testAsync, assert, done } = createSuite('Time periods are not addresses');
const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: true };

async function release(text, registry = makeRegistry()) {
  const operation = prepareTextPrivacyReview({ text, profile: 'general', productChannel: 'standalone',
    consumerOptions: { productChannel: 'standalone', contentOptions }, registry, captureTrace: false });
  const resolved = await resolveTextPrivacyReview(operation, undefined, { reviewPolicy: 'automatic-conservative' });
  return finalizeTextPrivacyReview(operation, resolved, { prefix: '', suffix: '' }).markdown;
}

async function main() {
  await testAsync('time periods are not addresses, real street forms still are', async () => {
    for (const sentence of [
      'Ansprechpartner im Zeitraum 2019-2024 war das Team.',
      'Ansprechpartner im Zeitraum 2019‑2024 war das Team.',
      'Im Jahr 2023 und am Jahresende 2024 sowie im Sommer 2019.',
      'Im Geschäftsjahr 2021–22 wuchs der Umsatz.'
    ]) assert.equal(await release(sentence), sentence, sentence);
    assert.equal(await release('Wohnhaft Am Hang 12 und Im Winkel 3-5.'), 'Wohnhaft [LOCATION_REDACTED] und [LOCATION_REDACTED].');
    assert.equal(await release('Anschrift: Am Sommerberg 2019.'), 'Anschrift: [LOCATION_REDACTED].');
    assert.equal(await release('Im Zeitraum 12 wohnt niemand.'), '[LOCATION_REDACTED] wohnt niemand.');
    assert.equal(await release('Wohnhaft Zeitraumstraße 12.'), 'Wohnhaft [LOCATION_REDACTED].');
  });

  done();
}

main().catch((error) => { console.error(error); process.exit(1); });
