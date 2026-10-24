'use strict';

const crypto = require('node:crypto');
const {createSuite} = require('./helpers');
const {anonymize, scanResidual} = require('../plugins/data-secure/server/privacy/engine');
const {canonicalizeRenderedText} = require('../plugins/data-secure/server/privacy/base');
const {replayTransformTrace, entityPlanFromTrace} = require('../plugins/data-secure/server/privacy/transform-plan');
const {initialEntities, applyEntityDecisions} = require('../plugins/data-secure/server/gateway/standalone-entity-review');
const {bindStandaloneDocumentKeeps} = require('../plugins/data-secure/server/privacy/residual-person-review');
const {prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview} = require('../plugins/data-secure/server/gateway/privacy-text-operation');
const {extractSourceForPrivacy} = require('../plugins/data-secure/server/core/markdown-first-privacy');
const {extractMarkdownBuffer} = require('../plugins/data-secure/server/standalone/markdown-extractor');
const {createMarkdownExtraction} = require('../plugins/data-secure/server/standalone/markdown-contract');
const {verifyAnonymizedPublication} = require('../plugins/data-secure/server/standalone/anonymized-artifact');
const {test, testAsync, assert, done} = createSuite('Closed explicit prose field coverage');
const contentOptions = {schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false};
const options = {productChannel: 'standalone', contentOptions, captureTransformPlan: true};
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

for (const prefix of ['Name:', 'Unternehmen=', 'Name\\:', '> Name:', '- [ ] Name:', '> 1. > Name:', '## Name:', 'Name (1) (2):']) {
  test(`closed source prefix ${prefix} protects arbitrary values, not a guessed identity`, () => {
    const source = canonicalizeRenderedText(`${prefix} Qvx / Qvy\nProtokoll: HTTP/2 FHIR REST HL7`, 'content-person-fields/1');
    const result = anonymize(source, 'general', options);
    assert.doesNotMatch(result.text, /Qvx|Qvy/u);
    assert.match(result.text, /Protokoll: HTTP\/2 FHIR REST HL7/u);
    assert.deepEqual(result.dictionary, []);
    assert.equal(replayTransformTrace(result.transform_trace), result.text);
    assert.ok(entityPlanFromTrace(result.transform_trace).occurrences.every(row => row.kind === 'SENSITIVE_FIELD'));
    assert.deepEqual(scanResidual(result.text, 'general', [], {...options, originalSourceText: source}), []);
    assert.ok(scanResidual(source, 'general', [], options).some(row => row.type === 'SENSITIVE_FIELD'));
  });
}

test('ordinary inline prose and unrelated technical labels do not create a new closed field', () => {
  const source = 'Freier Satz Name: Qvx / Qvy\nDateiname: FHIR.md\nTechnologie: HTTP/2 FHIR REST HL7';
  assert.equal(anonymize(source, 'general', options).text, source);
  assert.deepEqual(scanResidual(source, 'general', [], options), []);
});
test('historical product grammar is not silently broadened', () => {
  const source = 'Name: Qvx / Qvy\nProtokoll: HTTP/2 FHIR REST HL7';
  assert.equal(anonymize(source).text, source);
});
test('same-line factual-looking suffix cannot waive an actual field, next line remains independent', () => {
  const source = 'Name: Qvx / Qvy HTTP/2\nProtokoll: FHIR REST HL7';
  const result = anonymize(source, 'general', options);
  assert.doesNotMatch(result.text, /Qvx|Qvy|HTTP\/2/u);
  assert.match(result.text, /Protokoll: FHIR REST HL7/u);
});
test('duplicate Unicode values keep distinct exact UTF16 spans, no source trimming or first-match guessing', () => {
  const source = canonicalizeRenderedText('😀\nName: Qvx\u0308 / Qvy\nName: Qvx\u0308 / Qvy', 'content-person-fields/1');
  const result = anonymize(source, 'general', options), plan = entityPlanFromTrace(result.transform_trace);
  const fields = plan.occurrences.filter(row => row.kind === 'SENSITIVE_FIELD');
  assert.equal(fields.length, 2);
  assert.notEqual(fields[0].source_start, fields[1].source_start);
  for (const row of fields) assert.equal(source.slice(row.source_start, row.source_end), row.original);
  assert.equal(replayTransformTrace(result.transform_trace), result.text);
});
test('actual GFM rows without outer pipes do not turn neighboring factual cells into prose values', () => {
  const source = 'Inhalt | Fachtext\n--- | ---\nName: Qvx / Qvy | HTTP/2 FHIR REST HL7';
  const result = anonymize(source, 'general', options);
  assert.doesNotMatch(result.text, /Qvx|Qvy/u);
  assert.match(result.text, /HTTP\/2 FHIR REST HL7/u);
  assert.deepEqual(scanResidual(result.text, 'general', [], {...options, originalSourceText: source}), []);
});
test('last-line labels, empty values and arbitrary empty input are not invalid table lookups', () => {
  for (const source of ['', 'Name:', 'Name:\n', 'Name: [FIELD_REDACTED]']) {
    const result = anonymize(source, 'general', options);
    assert.deepEqual(scanResidual(result.text, 'general', [], options), []);
  }
});
test('a field value equal to its source label cannot replace the label and destroy its scope', () => {
  const source = 'Name: Name\nName: Qvx / Qvy', result = anonymize(source, 'general', options);
  assert.equal(result.text.split('Name:').length - 1, 2);
  assert.doesNotMatch(result.text, /Qvx|Qvy/u);
  assert.ok(scanResidual(source, 'general', [], options).some(row => row.type === 'SENSITIVE_FIELD'));
});
test('many real Markdown quote containers remain iterative and retain the next factual line', () => {
  const source = '>'.repeat(12000) + ' Name: Qvx / Qvy\nProtokoll: HTTP/2 FHIR REST HL7';
  const result = anonymize(source, 'general', options);
  assert.doesNotMatch(result.text, /Qvx|Qvy/u);
  assert.match(result.text, /Protokoll: HTTP\/2 FHIR REST HL7/u);
  assert.deepEqual(scanResidual(result.text, 'general', [], options), []);
});

(async () => {
  for (const markdownOutput of ['content-v1', 'notes-v1']) for (const profile of ['general', 'personnel_profile']) {
    for (const value of ['Qvx / Qvy', '[PERSON_DENISEKOCH]', 'Qvx\r\nProtokoll: HTTP/2 FHIR REST HL7']) {
      await testAsync(`actual source/trace/publication/Keep ${markdownOutput}/${profile}/${JSON.stringify(value)}`, async () => {
        const actualOptions = {...contentOptions, markdownOutput};
        const bytes = Buffer.from(`Name: ${value}\nFachtext: FHIR REST HL7`), before = sha(bytes);
        const source = await extractSourceForPrivacy(bytes, '.txt', {contentOptions: actualOptions, convertBuffer: async input => {
          const extracted = extractMarkdownBuffer(input, '.txt', {markdownOutput});
          return createMarkdownExtraction({source_type: 'txt', markdown: extracted.markdown, coverage: extracted.coverage, content_options: actualOptions});
        }});
        const prepared = prepareTextPrivacyReview({text: source.markdown, profile, productChannel: 'standalone',
          consumerOptions: {productChannel: 'standalone', contentOptions: actualOptions}, captureTrace: true,
          registry: require('../plugins/data-secure/server/privacy/entities').makeRegistry()});
        const reviewed = await resolveTextPrivacyReview(prepared, null, {reviewPolicy: 'automatic-conservative'});
        const final = finalizeTextPrivacyReview(prepared, reviewed, {prefix: '', suffix: ''});
        assert.doesNotMatch(final.markdown, /Qvx|Qvy|DENISEKOCH/u);
        assert.match(final.markdown, /FHIR REST HL7/u);
        assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
        const proof = {markdown: final.markdown, profile, content_options: actualOptions, source_extraction: source.sourceExtraction,
          dictionary: final.dictionary, strong_person_anchor: final.strong_person_anchor, reviewed_person_candidates: final.reviewed_person_candidates};
        assert.ok(verifyAnonymizedPublication(proof));
        const entities = initialEntities({markdown: final.markdown, transform_trace: final.transform_trace});
        const target = entities.find(row => /Qvx|DENISEKOCH/u.test(row.original)); assert.ok(target);
        const kept = applyEntityDecisions(final.markdown, entities, [{entity_id: target.entity_id, decision: 'keep'}], Buffer.alloc(32, 19));
        const keep = bindStandaloneDocumentKeeps(kept.markdown, [], kept.entities.filter(row => row.decision === 'keep').map(({start, end}) => ({start, end})));
        assert.throws(() => verifyAnonymizedPublication({...proof, markdown: kept.markdown, reviewed_person_candidates: keep}), {code: 'STANDALONE_PUBLICATION_INVALID'});
        assert.equal(sha(bytes), before);
      });
    }
  }
  done();
})().catch(error => { console.error(error); process.exitCode = 1; });
