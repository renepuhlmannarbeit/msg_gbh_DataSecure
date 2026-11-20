'use strict';

const { createSuite } = require('./helpers');
const { testAsync, test, assert, done } = createSuite('CSV record and field ownership');
const { csvTableWidth } = require('../plugins/data-secure/server/core/csv-table-shape');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { extractSourceForPrivacy } = require('../plugins/data-secure/server/core/markdown-first-privacy');
const { isFieldHeaderMetadata } = require('../plugins/data-secure/server/privacy/field-value-coverage');
const pii = require('../plugins/data-secure/server/privacy/engine');
const { makeRegistry } = require('../plugins/data-secure/server/privacy/entities');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } = require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { reviewedBatchText } = require('../plugins/data-secure/server/gateway/batch-review-policy');
const { replayTransformTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const contentOptions = Object.freeze({ schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false });
const consumerOptions = { productChannel: 'standalone', contentOptions };
async function projection(text) {
  const bytes = Buffer.from(text), original = Buffer.from(bytes);
  const result = await extractSourceForPrivacy(bytes, '.csv', { ...consumerOptions,
    async convertBuffer(value, extension) {
      const actual = extractMarkdownBuffer(value, extension, { markdownOutput: 'content-v1' });
      return createMarkdownExtraction({ source_type: actual.source_type, markdown: actual.markdown,
        coverage: actual.coverage, content_options: contentOptions });
    } });
  assert.ok(bytes.equals(original)); return result.markdown;
}

test('both projections share exact shape rules and preserve owned records', () => {
  const rows = [[''], ['Name', 'Firma'], [''], ['Anna Berger', 'Beispiel GmbH']];
  const before = JSON.stringify(rows); assert.equal(csvTableWidth(rows), 2); assert.equal(JSON.stringify(rows), before);
  assert.throws(() => csvTableWidth([]), /CSV_EMPTY/u);
  for (const invalid of [[[]], [['a', 'b'], ['x']], [['a', 'b'], [' ', 'x', 'y']], [[1]]])
    assert.throws(() => csvTableWidth(invalid), /CSV_ROW_WIDTH_INVALID/u);
});

test('only whole closed metadata roles may be hoisted, never a private qualifier', () => {
  for (const value of ['Name', 'Firma', 'Telefon', 'Name (1)']) assert.equal(isFieldHeaderMetadata(value, 'content-person-fields/1'), true, value);
  for (const value of ['Anna Berger', 'Fachtext', 'Name: Anna Berger', 'Telefon (Anna Berger)', 'Phone (anna@example.invalid)'])
    assert.equal(isFieldHeaderMetadata(value, 'content-person-fields/1'), false, value);
});

for (const csv of ['Anna Berger,Beispiel GmbH', 'Anna Berger,Beispiel GmbH\nMurat Kaya,Andere AG',
  'Anna Berger,Name\nMurat Kaya,Qvx', 'Name,Anna Berger\nQvx,Murat Kaya']) testAsync(`first-record people remain data ${JSON.stringify(csv)}`, async () => {
  const markdown = await projection(csv), transformed = pii.anonymize(markdown, 'general', consumerOptions);
  const findings = pii.scanResidual(transformed.text, 'general', transformed.dictionary,
    { ...consumerOptions, includePersonCandidateSpans: true });
  assert.ok(findings.some(row => row.type === 'PERSON_CANDIDATE' && row.text === 'Anna Berger' &&
    Number.isSafeInteger(row.start) && transformed.text.slice(row.start, row.end) === 'Anna Berger'));
  const value = prepareTextPrivacyReview({ text: markdown, profile: 'general', productChannel: 'standalone',
    consumerOptions, registry: makeRegistry(), captureTrace: true });
  const reviewed = await resolveTextPrivacyReview(value, undefined, { reviewPolicy: 'automatic-conservative' });
  const final = finalizeTextPrivacyReview(value, reviewed, { prefix: '', suffix: '' });
  assert.doesNotMatch(final.markdown, /Anna Berger|Murat Kaya|Qvx/u);
  assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
});

for (const ending of ['\n', '\r', '\r\n']) testAsync(`leading empty records preserve field duties ${JSON.stringify(ending)}`, async () => {
  const markdown = await projection(ending + 'Name,Firma' + ending + 'Qvx,Qvy');
  assert.match(markdown, /^\| Name \| Firma \|/u);
  const actual = pii.anonymize(markdown, 'general', consumerOptions);
  assert.doesNotMatch(actual.text, /Qvx|Qvy/u);
  assert.deepEqual(pii.scanResidual(actual.text, 'general', actual.dictionary, consumerOptions), []);
});

testAsync('empty and quoted-empty records are retained without asserting physical line provenance', async () => {
  assert.equal(await projection('\n\n'), '| Spalte&#32;1 |\n| --- |\n|  |\n|  |');
  assert.equal(await projection('""\nName,Firma\nQvx,Qvy'), '| Name | Firma |\n| --- | --- |\n|  |  |\n| Qvx | Qvy |');
  const blankHeader = await projection(',\nName,Firma\nQvx,Qvy');
  assert.equal((blankHeader.match(/^\|  \|  \|$/gmu) || []).length, 1);
  assert.doesNotMatch(pii.anonymize(blankHeader, 'general', consumerOptions).text, /Qvx|Qvy/u);
});

testAsync('quoted line endings and literal professional values survive the private projection', async () => {
  const raw = 'Name,Fachtext\r\nQvx,"ÄÖÜß 😀 00123 =1+1 | <x> & \\ ~\r\nzweite\rDritte\nVierte"';
  const markdown = await projection(raw), html = new (require('markdown-it'))({ html: true }).render(markdown);
  const text = require('entities').decodeHTML(html.replace(/<br\s*\/?>/giu, '\n').replace(/<[^>]*>/gu, ''));
  for (const word of ['Fachtext', 'ÄÖÜß 😀 00123 =1+1 | <x> & \\ ~', 'zweite\rDritte\nVierte']) assert.ok(text.includes(word), word);
  const actual = pii.anonymize(markdown, 'general', consumerOptions); assert.doesNotMatch(actual.text, /Qvx/u);
  assert.match(actual.text, /FHIR|Fachtext/u);
});

testAsync('a neutral-column Keep never waives the explicit protected neighbour', async () => {
  const markdown = await projection('Anna Berger,Name\nMurat Kaya,Qvx');
  const value = prepareTextPrivacyReview({ text: markdown, profile: 'general', productChannel: 'standalone',
    consumerOptions, registry: makeRegistry(), captureTrace: true });
  const reviewed = await resolveTextPrivacyReview(value, input => reviewedBatchText(input,
    input.ambiguities.map(row => ({ ambiguity_id: row.ambiguity_id, decision: 'keep' }))));
  const final = finalizeTextPrivacyReview(value, reviewed, { prefix: '', suffix: '' });
  assert.match(final.markdown, /Anna Berger/u); assert.doesNotMatch(final.markdown, /Qvx/u);
  assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
});

for (const header of ['Telefon (Anna Berger)', 'Phone (anna@example.invalid)'])
  testAsync(`private header qualifiers retain their own column duty ${header}`, async () => {
    const markdown = await projection(`${header},Fachtext\nQvx,Projektstatus`);
    assert.match(markdown, /^\| Geschützter&#32;Tabellenwert \| Spalte&#32;2 \|/u);
    const value = prepareTextPrivacyReview({ text: markdown, profile: 'general', productChannel: 'standalone',
      consumerOptions, registry: makeRegistry(), captureTrace: true });
    const reviewed = await resolveTextPrivacyReview(value, input => reviewedBatchText(input,
      input.ambiguities.map(row => ({ ambiguity_id: row.ambiguity_id, decision: 'keep' }))));
    const final = finalizeTextPrivacyReview(value, reviewed, { prefix: '', suffix: '' });
    assert.doesNotMatch(final.markdown, /Qvx|Anna|Berger|anna@example/u);
    assert.match(final.markdown, /Projektstatus/u);
    assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
  });

for (const [header, records] of [['Telefon (privat)', ['030 12345678', '040 87654321']],
  ['Geburtsdatum (privat)', ['23.04.1980', '12.05.1990']]])
  testAsync(`qualified single-column fields retain every value duty ${header}`, async () => {
    const markdown = await projection([header, ...records].join('\n'));
    assert.match(markdown, /^\| Geschützter&#32;Tabellenwert \|/u);
    const value = prepareTextPrivacyReview({ text: markdown, profile: 'general', productChannel: 'standalone',
      consumerOptions, registry: makeRegistry(), captureTrace: true });
    const reviewed = await resolveTextPrivacyReview(value, undefined, { reviewPolicy: 'automatic-conservative' });
    const final = finalizeTextPrivacyReview(value, reviewed, { prefix: '', suffix: '' });
    const visible = require('../plugins/data-secure/server/privacy/base').canonicalizeRenderedText(final.markdown, 'content-person-fields/1');
    for (const record of records) assert.ok(!visible.includes(record), record);
    assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
  });

done();
