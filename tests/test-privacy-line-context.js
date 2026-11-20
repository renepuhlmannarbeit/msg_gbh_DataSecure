'use strict';

const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Source-preserving privacy line context');
const pii = require('../plugins/data-secure/server/privacy/engine');
const { lineBoundsAt } = require('../plugins/data-secure/server/privacy/spans');
const { markdownTableColumnValues, collectOrganizations } = require('../plugins/data-secure/server/privacy/entities');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { replayTransformTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const content = { productChannel: 'standalone', contentOptions: { schema: 'datasecure-content-options/1',
  markdownOutput: 'content-v1', scanOcr: false, imageOcr: false }, captureTransformPlan: true };
const endings = ['\r', '\n', '\r\n'];

for (const ending of endings) for (const emoji of ['', '😀 ']) test(`actual TXT/MD context ${JSON.stringify(ending)} emoji=${Boolean(emoji)}`, () => {
  const source = `# Technik${ending}${emoji}Kontakt Anna Berger${ending}Fachinhalt: FHIR`;
  for (const extension of ['.txt', '.md']) {
    const extracted = extractMarkdownBuffer(Buffer.from(source), extension, { markdownOutput: 'notes-v1' });
    assert.equal(extracted.markdown, source);
    for (const options of [{}, content]) {
      const actual = pii.anonymize(extracted.markdown, 'general', options);
      assert.equal(actual.text, source.replace('Anna Berger', '[PERSON_001]'));
      assert.ok(pii.scanResidual(source, 'general', [], options).some(row => row.type === 'PERSON_CANDIDATE'));
      assert.deepEqual(pii.scanResidual(actual.text, 'general', actual.dictionary, options), []);
      if (options === content) assert.equal(replayTransformTrace(actual.transform_trace), actual.text);
    }
    const start = source.indexOf('Anna Berger');
    assert.deepEqual(pii.sensitiveSpans(source, 'general').filter(row => row.type === 'PERSON'),
      [{ type: 'PERSON', start, end: start + 'Anna Berger'.length, text: 'Anna Berger' }]);
  }
});

for (const ending of endings) test(`header discovery retains source endings ${JSON.stringify(ending)}`, () => {
  for (const profile of ['general', 'applicant', 'personnel_profile']) {
    const source = `Anna Berger${ending}Fachinhalt: FHIR`;
    const actual = pii.anonymize(source, profile);
    assert.equal(actual.text, source.replace('Anna Berger', '[PERSON_001]'));
    assert.ok(pii.scanResidual(source, profile).some(row => row.type === 'PERSON_CANDIDATE'));
    assert.deepEqual(pii.scanResidual(actual.text, profile, actual.dictionary), []);
    assert.deepEqual(pii.sensitiveSpans(source, profile).filter(row => row.type === 'PERSON'),
      [{ type: 'PERSON', start: 0, end: 11, text: 'Anna Berger' }]);
  }
});

test('mixed endings, empty lines and source edges preserve exact UTF16 positions', () => {
  for (const source of ['Kontakt Anna Berger', '# Technik\r\n\r😀 Kontakt Anna Berger\n\nFachinhalt: FHIR',
    'Fachinhalt: FHIR\n\r\nKontakt Anna Berger\r', '\rKontakt Anna Berger\r\n']) {
    const start = source.indexOf('Anna Berger'), bounds = lineBoundsAt(source, start);
    assert.equal(source.slice(bounds.from, bounds.to).trim(), source.includes('😀') ? '😀 Kontakt Anna Berger' : 'Kontakt Anna Berger');
    assert.equal(pii.anonymize(source).text, source.replace('Anna Berger', '[PERSON_001]'));
    assert.ok(pii.sensitiveSpans(source).some(row => row.type === 'PERSON' && row.start === start && row.end === start + 11));
  }
});

test('actual structure lines keep the same decisions as their LF controls', () => {
  for (const structure of ['# Kontakt Anna Berger', '- Kontakt Anna Berger', '1. Kontakt Anna Berger',
    '| Kontakt Anna Berger | Fachtext |', '```Kontakt Anna Berger']) {
    const baseline = pii.anonymize(structure + '\nFachinhalt: FHIR').text;
    for (const ending of endings) assert.equal(pii.anonymize(structure + ending + 'Fachinhalt: FHIR').text,
      baseline.replace('\n', ending));
  }
});

test('existing physical table cells retain raw CR ownership and do not create organizations', () => {
  for (const ending of ['\n', '\r\n']) for (const value of ['Qvx\rUnternehmen: Qvy', 'Qvx&#13;Unternehmen: Qvy']) {
    const source = ['| Name | Fachtext |', '| --- | --- |', `| ${value} | FHIR REST HL7 |`].join(ending);
    assert.deepEqual(markdownTableColumnValues(source, /^Name$/u), [value]);
    assert.deepEqual(collectOrganizations(source), []);
    const actual = pii.anonymize(source, 'general', content);
    assert.doesNotMatch(actual.text, /Qvx|Qvy|Unternehmen:/u); assert.match(actual.text, /FHIR REST HL7/u);
    assert.deepEqual(actual.dictionary, []);
    assert.ok(pii.scanResidual(source, 'general', [], content).some(row => row.type === 'SENSITIVE_FIELD'));
    assert.deepEqual(pii.scanResidual(actual.text, 'general', [], content), []);
    assert.equal(replayTransformTrace(actual.transform_trace), actual.text);
  }
});

test('single columns, fragmented headers and optional outer pipes retain whole cells', () => {
  for (const rows of [
    ['| Name |', '| --- |', '| Qvx\rUnternehmen: Qvy |'],
    ['| Full\rName | Fachtext |', '| --- | --- |', '| Qvx / Qvy | FHIR |'],
    ['Name | Fachtext', '--- | ---', 'Qvx\rUnternehmen: Qvy | FHIR'],
    ['| Company | Fachtext |', '| Name | Technologie |', '| --- | --- |', '| Qvx\rQvy | FHIR |']
  ]) {
    const source = rows.join('\n'), actual = pii.anonymize(source, 'general', content);
    assert.doesNotMatch(actual.text, /Qvx|Qvy/u);
    assert.ok(pii.scanResidual(source, 'general', [], content).length > 0);
    assert.deepEqual(pii.scanResidual(actual.text, 'general', [], content), []);
    assert.equal(replayTransformTrace(actual.transform_trace), actual.text);
  }
});

test('ordinary CR prose around a real table is discovered without changing that table', () => {
  const source = '# Technik\rKontakt Anna Berger\n\n| Technologie | Beschreibung |\n| --- | --- |\n| FHIR | REST\\|HL7 |\n\nKontakt Murat Kaya\rFachinhalt: FHIR';
  const actual = pii.anonymize(source);
  assert.doesNotMatch(actual.text, /Anna Berger|Murat Kaya/u);
  assert.match(actual.text, /REST\\\|HL7/u);
  assert.ok(actual.text.includes('\r')); assert.deepEqual(pii.scanResidual(actual.text, 'general', actual.dictionary), []);
});

test('CR prose does not create a table field grammar from a newly split view', () => {
  const source = 'Name | Fachtext\r--- | ---\rQvx | FHIR';
  assert.deepEqual(markdownTableColumnValues(source, /^Name$/u), []);
  assert.deepEqual(collectOrganizations(source), []);
});

done();
