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
const retainedGuiInput = Buffer.from('\ud83d\ude00 Anfang\r\nZielwort MASKIERZIEL Nachfeld \ud83e\uddea\nName: Anna Berger\rUnternehmen: Nordstern GmbH\r\nFachwert: FHIR REST 31415\n');
const {protectedHeaderRanges, uncoveredFieldSpans, isWithinProtectedHeader} = require('../plugins/data-secure/server/privacy/field-value-coverage');
const splitLabelPrefixes = ['Name \r(1):', 'Name (1)\r (2):', 'Company\rName:', 'Full\rName:',
  'Last\rmodified\rby:', 'Zuletzt\rgeändert\rvon:', 'Name \r\\(1\\):', '> 1. Name (1)\r (2)\\:'];

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

for (const eol of ['\n', '\r\n', '\r']) test(`closed fields retain captions and raw UTF16 ranges across ${JSON.stringify(eol)}`, () => {
  const source = `😀 FHIR REST${eol}> 1. > Name\\: Qvx${eol}- [ ] Unternehmen\\= Qvy`;
  const headers = protectedHeaderRanges(source, 'content-person-fields/1');
  assert.deepEqual(headers.map(row => source.slice(row.start, row.end)), ['Name\\:', 'Unternehmen\\=']);
  assert.ok(headers[0].end < headers[1].start, 'protected ranges remain sorted and distinct');
  assert.deepEqual(uncoveredFieldSpans(source, 'content-person-fields/1').map(row => row.text), ['Qvx', 'Qvy']);
  assert.ok(headers.every(row => isWithinProtectedHeader(headers, row)));
  const canonical = canonicalizeRenderedText(source, 'content-person-fields/1');
  const result = anonymize(canonical, 'general', options);
  assert.ok(result.text.includes('Name\\:')); assert.ok(result.text.includes('Unternehmen\\='));
  assert.doesNotMatch(result.text, /Qvx|Qvy/u);
  assert.deepEqual(result.dictionary, [], 'closed labels are metadata, not invented identities');
  assert.equal(replayTransformTrace(result.transform_trace), result.text);
  assert.ok(scanResidual(canonical, 'general', [], options).some(row => row.type === 'SENSITIVE_FIELD'),
    'independent final gate reports the raw strong fields, without a per-field result-count contract');
  assert.deepEqual(scanResidual(result.text, 'general', [], {...options, originalSourceText: canonical}), []);
});

test('bare CR after ordinary preceding text finds the actual field, without protecting a duplicate value as a header', () => {
  const source = '😀 FHIR REST\rName: Name\rName: Qvx / Qvy';
  const headers = protectedHeaderRanges(source, 'content-person-fields/1');
  assert.deepEqual(headers.map(row => source.slice(row.start, row.end)), ['Name:', 'Name:']);
  const originalValue = source.indexOf('Name', headers[0].end);
  assert.equal(isWithinProtectedHeader(headers, {start: originalValue, end: originalValue + 4}), false);
  const actual = anonymize(source, 'general', options);
  assert.ok(actual.text.startsWith('😀 FHIR REST\rName:'));
  assert.equal(actual.text.split('Name:').length - 1, 2);
  assert.doesNotMatch(actual.text, /Qvx|Qvy/u);
});

for (const continuation of ['Qvx\rQvy', 'Qvx /\rQvy', 'Qvx\r' + 'Qvy '.repeat(100),
  'Qvx\rFreier Satz Name: Qvy', '[PERSON_DENISEKOCH]\rQvy']) {
  test(`unproven CR continuation remains in its actual strong field: ${continuation.length}`, () => {
    const source = `Name: ${continuation}\rUnternehmen: Qvz\nFachtext: FHIR REST`;
    const fields = uncoveredFieldSpans(source, 'content-person-fields/1', source);
    assert.equal(fields.length, 2);
    assert.equal(fields[0].text, continuation.trim());
    assert.equal(fields[1].text, 'Qvz');
    const actual = anonymize(source, 'general', options);
    assert.doesNotMatch(actual.text, /Qvx|Qvy|Qvz|DENISEKOCH/u);
    assert.match(actual.text, /Unternehmen:/u); assert.match(actual.text, /Fachtext: FHIR REST/u);
    assert.deepEqual(scanResidual(actual.text, 'general', [], {...options, originalSourceText: source}), []);
    const entities = initialEntities({markdown: actual.text, transform_trace: actual.transform_trace});
    const target = entities.find(row => /Qvx|DENISEKOCH/u.test(row.original)); assert.ok(target);
    const kept = applyEntityDecisions(actual.text, entities, [{entity_id: target.entity_id, decision: 'keep'}], Buffer.alloc(32, 13));
    const binding = bindStandaloneDocumentKeeps(kept.markdown, [], kept.entities.filter(row => row.decision === 'keep').map(({start, end}) => ({start, end})));
    assert.ok(scanResidual(kept.markdown, 'general', [], {...options, originalSourceText: source, reviewedPersonCandidates: binding})
      .some(row => row.type === 'SENSITIVE_FIELD'));
  });
}

test('many unknown CR segments are scanned once as segments and retain the preceding field scope', () => {
  const unknown = 'Qvx\r'.repeat(12000);
  const source = `😀\rName: ${unknown}Unternehmen: Qvy`;
  const headers = protectedHeaderRanges(source, 'content-person-fields/1');
  assert.deepEqual(headers.map(row => source.slice(row.start, row.end)), ['Name:', 'Unternehmen:']);
  const fields = uncoveredFieldSpans(source, 'content-person-fields/1');
  assert.equal(fields.length, 2);
  assert.equal(fields[0].text, unknown.trim());
  assert.equal(source.slice(fields[1].start, fields[1].end), 'Qvy');
});

test('closed CR fields do not waive direct contacts or credentials', () => {
  const source = 'Name: Qvx\rUnternehmen: Qvy\nE-Mail: test@example-01.de\nTelefon: +49 30 5551000\nPasswort: synthetic-test-secret-4711';
  const actual = anonymize(source, 'general', options);
  assert.doesNotMatch(actual.text, /Qvx|Qvy|test@example|5551000|synthetic-test-secret/u);
  assert.match(actual.text, /Name:/u); assert.match(actual.text, /Unternehmen:/u);
  assert.deepEqual(scanResidual(actual.text, 'general', actual.dictionary, {...options, originalSourceText: source}), []);
});

for (const prefix of splitLabelPrefixes) test(`complete existing split label retains its owner after another value ${JSON.stringify(prefix)}`, () => {
  const source = `😀\rName: Qza\r${prefix} Qvx / Qvy\nFachtext: FHIR REST`;
  const headers = protectedHeaderRanges(source, 'content-person-fields/1');
  assert.equal(headers.length, 2);
  assert.ok(headers[0].end < headers[1].start && headers[1].end === source.indexOf(' Qvx'));
  assert.deepEqual(uncoveredFieldSpans(source, 'content-person-fields/1', source).map(row => row.text), ['Qza', 'Qvx / Qvy']);
  const actual = anonymize(source, 'general', options);
  assert.doesNotMatch(actual.text, /Qza|Qvx|Qvy/u);
  assert.match(actual.text, /Fachtext: FHIR REST/u);
  assert.ok(actual.text.includes(source.slice(headers[1].start, headers[1].end)), 'complete raw source caption remains unchanged');
  assert.equal(replayTransformTrace(actual.transform_trace), actual.text);
  assert.ok(scanResidual(source, 'general', [], {...options, originalSourceText: source}).some(row => row.type === 'SENSITIVE_FIELD'));
  assert.deepEqual(scanResidual(actual.text, 'general', [], {...options, originalSourceText: source}), []);
});

for (const uncertain of ['Name\r(unknown): Qvx / Qvy', 'Freier Satz Name\r(1): Qvx / Qvy']) {
  test(`unproven split caption cannot release a previous field ${JSON.stringify(uncertain)}`, () => {
    const source = `Name: Qza\r${uncertain}`;
    assert.equal(protectedHeaderRanges(source, 'content-person-fields/1').length, 1);
    assert.deepEqual(uncoveredFieldSpans(source, 'content-person-fields/1', source).map(row => row.text), [`Qza\r${uncertain}`]);
    const actual = anonymize(source, 'general', options);
    assert.doesNotMatch(actual.text, /Qza|Qvx|Qvy/u);
    assert.ok(scanResidual(source, 'general', [], options).some(row => row.type === 'SENSITIVE_FIELD'));
    assert.deepEqual(scanResidual(actual.text, 'general', [], {...options, originalSourceText: source}), []);
  });
}

test('many unknown CR parts before a late separator retain one source-bound value', () => {
  const source = 'Name: Qza\r' + 'unbekannt\r'.repeat(12000) + '(1): Qvx / Qvy';
  assert.equal(protectedHeaderRanges(source, 'content-person-fields/1').length, 1);
  const fields = uncoveredFieldSpans(source, 'content-person-fields/1', source);
  assert.equal(fields.length, 1); assert.equal(fields[0].text, source.slice(6));
  assert.ok(scanResidual(source, 'general', [], options).some(row => row.type === 'SENSITIVE_FIELD'));
});

test('many separators without CR do not repeatedly scan the remaining source line', () => {
  const source = 'Name: ' + 'Qvx:'.repeat(8000);
  assert.equal(protectedHeaderRanges(source, 'content-person-fields/1').length, 1);
  assert.equal(uncoveredFieldSpans(source, 'content-person-fields/1', source)[0].text, source.slice(6));
  assert.ok(scanResidual(source, 'general', [], options).some(row => row.type === 'SENSITIVE_FIELD'));
});

for (const label of ['Dienstliche Telefonnummer', 'Weitere Angaben Geburtsdatum']) test(`qualified field retains value ownership without a whole-caption metadata waiver ${label}`, () => {
  const source = `Name: Qza\r${label}: Qvx / Qvy\nFachtext: FHIR REST`;
  assert.deepEqual(uncoveredFieldSpans(source, 'content-person-fields/1', source).map(row => row.text), ['Qza', 'Qvx / Qvy']);
  const actual = anonymize(source, 'general', options);
  assert.ok(actual.text.includes(label + ':')); assert.doesNotMatch(actual.text, /Qza|Qvx|Qvy/u);
  assert.equal(replayTransformTrace(actual.transform_trace), actual.text);
  assert.equal(scanResidual(actual.text, 'general', [], {...options, originalSourceText: source})
    .some(row => ['SENSITIVE_FIELD', 'RESIDUAL_ENTITY', 'EMAIL'].includes(row.type)), false,
  'this raw direct-engine probe does not claim an unresolved name-shaped qualifier was reviewed');
  const qualifier = source.indexOf(label);
  assert.equal(isWithinProtectedHeader(protectedHeaderRanges(source, 'content-person-fields/1'),
    {start: qualifier, end: qualifier + label.length}), false, 'field ownership does not exempt arbitrary qualifier text');
});

test('long valid source label whitespace and ordinals are not shortened by comparison bounds', () => {
  const prefix = 'Full' + '\r\u2003'.repeat(4096) + 'Name' + ' (123)'.repeat(1000);
  const source = 'Name: Qza\r' + prefix + ': Qvx / Qvy';
  assert.deepEqual(uncoveredFieldSpans(source, 'content-person-fields/1', source).map(row => row.text), ['Qza', 'Qvx / Qvy']);
  const headers = protectedHeaderRanges(source, 'content-person-fields/1');
  assert.equal(headers.length, 2); assert.equal(source.slice(headers[1].start, headers[1].end), prefix + ':');
});

for (const role of ['range', 'independent-final']) test(`actual ${role} reader bounds failed policy whitespace corridors without releasing their values`, () => {
  const fs = require('node:fs'), vm = require('node:vm'), {createRequire} = require('node:module');
  const file = require.resolve(role === 'range' ? '../plugins/data-secure/server/privacy/field-value-coverage' : '../plugins/data-secure/server/privacy/engine');
  const source = fs.readFileSync(file, 'utf8'), context = vm.createContext({module: {exports: {}}, require: createRequire(file)});
  if (role === 'range') vm.runInContext(source + '\nmodule.exports.__read=proseFieldRanges;', context, {timeout: 1000});
  else {
    const start = source.indexOf('    const proseValues = '), end = source.indexOf('    for (const value of proseValues(rendered', start);
    assert.ok(start >= 0 && end > start);
    vm.runInContext("const personFieldPolicy='content-person-fields/1'; const {personFieldPattern}=require('../core/person-field-policy'); const {markdownTableCells}=require('./entities'); const {isProtectedFieldHeader}=require('./field-value-coverage');\n" +
      source.slice(start, end) + '\nmodule.exports.__read=proseValues;', context, {timeout: 1000});
  }
  for (const whitespace of [' '.repeat(128), ' '.repeat(512), ' '.repeat(1024), ' '.repeat(2048),
    '\t'.repeat(2048), '\u00a0'.repeat(2048), '\u2003'.repeat(2048), '\r'.repeat(2048)]) {
    context.input = 'Name: Qza\rTelefon' + whitespace + 'X: Qvx / Qvy';
    const value = vm.runInContext("module.exports.__read(input,'content-person-fields/1')", context, {timeout: 300});
    assert.equal(value.length, 1);
    if (role === 'range') { assert.equal(value[0].valueStart, 5); assert.equal(value[0].end, context.input.length); }
    else assert.equal(value[0], context.input.slice(5));
  }
  if (role === 'independent-final') {
    context.input = 'Referenz: Anna Berger\nName: Qza\rAnna Berger Geburtsdatum: Qvx\nName: Qzb\rAnna Berger Telefonnummer: Qvy';
    context.scopes = [];
    vm.runInContext('module.exports.__read(input,null,scopes)', context, {timeout: 300});
    assert.equal(context.scopes.length, 2);
    assert.deepEqual(context.scopes.map(scope => context.input.slice(scope.start, scope.end)),
      ['Anna Berger Geburtsdatum', 'Anna Berger Telefonnummer']);
    assert.ok(context.scopes.every(scope => scope.start > context.input.indexOf('\n')),
      'same-valued ordinary text outside the actual caption is not an adopted qualifier scope');
  }
});

test('a comparison-only person hypothesis without a raw caption match cannot become an absence proof', () => {
  const source = canonicalizeRenderedText('Name: Qza\rAnna\u2028Berger Geburtsdatum: Qvx', 'content-person-fields/1');
  assert.ok(source.includes('\u2028'));
  const findings = scanResidual(source, 'general', [], {...options, originalSourceText: source, includePersonCandidateSpans: true});
  const unbound = findings.find(row => row.type === 'PERSON_CANDIDATE' && row.text === 'Anna\u2028Berger');
  assert.ok(unbound, 'the unmatched normalized qualifier remains source-bound without deleting the proven technical suffix');
  assert.equal(source.slice(unbound.start, unbound.end), unbound.text);
  assert.equal(source.slice(unbound.end).trimStart().startsWith('Geburtsdatum:'), true);
});

(async () => {
  const [{fromMarkdown}, {parseFragment}] = await Promise.all([
    import('../native/markdown/pilot/node_modules/mdast-util-from-markdown/index.js'),
    import('../native/markdown/pilot/node_modules/parse5/dist/index.js')]);
  const neutralTable = value => `| Inhalt | Fachtext |\n| --- | --- |\n| ${value} | FHIR REST 31415 |`;
  const inlineQualifierCases = [
    ['original-dob', neutralTable('Anna Berger Geburtsdatum: Qvx / Qvy'), 'Geburtsdatum', 'FHIR REST 31415'],
    ['original-phone', neutralTable('Anna Berger Telefonnummer: Qvx / Qvy'), 'Telefonnummer', 'FHIR REST 31415'],
    ['original-escaped-colon', neutralTable('Anna Berger Geburtsdatum\\: Qvx / Qvy'), 'Geburtsdatum', 'FHIR REST 31415'],
    ['original-unbound', neutralTable('Anna\u2028Berger Geburtsdatum: Qvx / Qvy'), 'Geburtsdatum', 'FHIR REST 31415'],
    ['producer-prefix-escaped-pipe', neutralTable('Formel: "A\\|B" 😀<br>Gespeicherter Wert: Anna Berger Geburtsdatum\\: Qvx / Qvy'), 'Geburtsdatum', 'FHIR REST 31415'],
    ['repeated-independent-cells', '| Inhalt | Inhalt | Fachtext |\n| --- | --- | --- |\n| Anna Berger Geburtsdatum: Qvx / Qvy | Anna Berger Telefonnummer: Qvx / Qvy | HTTP/2 31415 |', 'Geburtsdatum', 'HTTP/2 31415'],
    ['table-internal-cr', neutralTable('Anna Berger Geburtsdatum: Qvx\rUnternehmen: Qvy'), 'Geburtsdatum', 'FHIR REST 31415'],
    ['no-outer-pipes', 'Inhalt | Fachtext\n--- | ---\nAnna Berger Geburtsdatum: Qvx / Qvy | HTTP/2 31415', 'Geburtsdatum', 'HTTP/2 31415'],
    ['existing-header-unbound', '| Anna\u2028Berger Geburtsdatum | Fachtext |\n| --- | --- |\n| Qvx / Qvy | HTTP/2 31415 |', 'Geburtsdatum', 'HTTP/2 31415'],
    ['existing-prose-unbound', 'Anna\u2028Berger Geburtsdatum: Qvx / Qvy\nFachtext: HTTP/2 31415', 'Geburtsdatum', 'HTTP/2 31415'],
    ['original-producer-emoji-qualifier', neutralTable('Formel: "A\\|B"<br>Gespeicherter Wert: 😀 Anna Berger Geburtsdatum\\: Qvx / Qvy'), 'Geburtsdatum', 'FHIR REST 31415'],
    ['emoji-inline', neutralTable('😀 Anna Berger Geburtsdatum: Qvx / Qvy'), 'Geburtsdatum', 'FHIR REST 31415'],
    ['emoji-zwj-prose', '👩🏽‍💻 Anna Berger Geburtsdatum: Qvx / Qvy\nFachtext: HTTP/2 31415', 'Geburtsdatum', 'HTTP/2 31415'],
    ['emoji-flag-header', '| 🇩🇪 Anna Berger Geburtsdatum | Fachtext |\n| --- | --- |\n| Qvx / Qvy | HTTP/2 31415 |', 'Geburtsdatum', 'HTTP/2 31415'],
    ['emoji-keycap-inline', neutralTable('1️⃣ Anna Berger Geburtsdatum: Qvx / Qvy'), 'Geburtsdatum', 'FHIR REST 31415'],
    ['emoji-vs-prose', '❤️ Anna Berger Geburtsdatum: Qvx / Qvy\nFachtext: HTTP/2 31415', 'Geburtsdatum', 'HTTP/2 31415'],
    ['emoji-repeated-prefix', neutralTable('😀\t🇩🇪 Anna Berger Geburtsdatum: Qvx / Qvy'), 'Geburtsdatum', 'FHIR REST 31415'],
    ['emoji-header-no-raw-match', '| 👩🏽‍💻 Anna\u2028Berger Geburtsdatum | Fachtext |\n| --- | --- |\n| Qvx / Qvy | HTTP/2 31415 |', 'Geburtsdatum', 'HTTP/2 31415']
  ];
  for (const [id, raw, label, fact] of inlineQualifierCases) for (const markdownOutput of ['content-v1', 'notes-v1']) for (const profile of ['general', 'personnel_profile']) {
    await testAsync(`actual inline qualifier source/publication/trace/Keep ${id}/${markdownOutput}/${profile}`, async () => {
      const bytes = Buffer.from(raw), before = sha(bytes), actualOptions = {...contentOptions, markdownOutput};
      const source = await extractSourceForPrivacy(bytes, '.md', {contentOptions: actualOptions, convertBuffer: async input => {
        const extracted = extractMarkdownBuffer(input, '.md', {});
        const markdown = markdownOutput === 'content-v1' ? require('../plugins/data-secure/server/standalone/markdown-image-content')
          .markdownImageContent(extracted.markdown, {fromMarkdown, parseFragment}).markdown : extracted.markdown;
        return createMarkdownExtraction({source_type: 'md', markdown, coverage: extracted.coverage, content_options: actualOptions});
      }});
      const prepared = prepareTextPrivacyReview({text: source.markdown, profile, productChannel: 'standalone',
        consumerOptions: {productChannel: 'standalone', contentOptions: actualOptions}, captureTrace: true,
        registry: require('../plugins/data-secure/server/privacy/entities').makeRegistry()});
      const reviewed = await resolveTextPrivacyReview(prepared, null, {reviewPolicy: 'automatic-conservative'});
      const final = finalizeTextPrivacyReview(prepared, reviewed, {prefix: '', suffix: ''});
      assert.doesNotMatch(final.markdown, /Anna[\s\S]*Berger|Qvx|Qvy/u);
      assert.ok(final.markdown.includes(label), 'actual proven technical suffix retains its field duty');
      assert.ok(final.markdown.includes(fact));
      assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
      const proof = {markdown: final.markdown, profile, content_options: actualOptions, source_extraction: source.sourceExtraction,
        dictionary: final.dictionary, strong_person_anchor: final.strong_person_anchor, reviewed_person_candidates: final.reviewed_person_candidates};
      assert.ok(verifyAnonymizedPublication(proof));
      const entities = initialEntities({markdown: final.markdown, transform_trace: final.transform_trace});
      const targets = entities.filter(row => /Qvx/u.test(row.original)); assert.ok(targets.length);
      for (const target of targets) {
        const kept = applyEntityDecisions(final.markdown, entities, [{entity_id: target.entity_id, decision: 'keep'}], Buffer.alloc(32, 47));
        const binding = bindStandaloneDocumentKeeps(kept.markdown, [], kept.entities.filter(row => row.decision === 'keep').map(({start, end}) => ({start, end})));
        assert.throws(() => verifyAnonymizedPublication({...proof, markdown: kept.markdown, reviewed_person_candidates: binding}),
          {code: 'STANDALONE_PUBLICATION_INVALID'});
      }
      assert.equal(sha(bytes), before);
    });
  }
  for (const scope of ['prose', 'header', 'inline']) for (const markdownOutput of ['content-v1', 'notes-v1']) for (const profile of ['general', 'personnel_profile']) {
    await testAsync(`emoji-qualified weak guided Keep preserves actual field duty ${scope}/${markdownOutput}/${profile}`, async () => {
      const caption = '👩🏽‍💻 Weitere Angaben Geburtsdatum';
      const raw = scope === 'prose' ? caption + ': Qvx / Qvy\nFachtext: HTTP/2 31415' : scope === 'header' ?
        `| ${caption} | Fachtext |\n| --- | --- |\n| Qvx / Qvy | HTTP/2 31415 |` :
        `| Inhalt | Fachtext |\n| --- | --- |\n| ${caption}: Qvx / Qvy | HTTP/2 31415 |`;
      const bytes = Buffer.from(raw), before = sha(bytes), actualOptions = {...contentOptions, markdownOutput};
      const source = await extractSourceForPrivacy(bytes, '.md', {contentOptions: actualOptions, convertBuffer: async input => {
        const x = extractMarkdownBuffer(input, '.md', {});
        const markdown = markdownOutput === 'content-v1' ? require('../plugins/data-secure/server/standalone/markdown-image-content')
          .markdownImageContent(x.markdown, {fromMarkdown, parseFragment}).markdown : x.markdown;
        return createMarkdownExtraction({source_type: 'md', markdown, coverage: x.coverage, content_options: actualOptions});
      }});
      const prepared = prepareTextPrivacyReview({text: source.markdown, profile, productChannel: 'standalone',
        consumerOptions: {productChannel: 'standalone', contentOptions: actualOptions}, captureTrace: true,
        registry: require('../plugins/data-secure/server/privacy/entities').makeRegistry()});
      assert.ok(prepared.ambiguities.some(row => prepared.draft.original_text.slice(row.original_start, row.original_end) === 'Weitere Angaben'));
      const reviewed = await resolveTextPrivacyReview(prepared, async draft =>
        require('../plugins/data-secure/server/gateway/batch-review-policy').reviewedBatchText(draft, draft.ambiguities.map(row => ({
          ambiguity_id: row.ambiguity_id,
          decision: draft.original_text.slice(row.original_start, row.original_end) === 'Weitere Angaben' ? 'keep' : 'redact'
        }))));
      const final = finalizeTextPrivacyReview(prepared, reviewed, {prefix: '', suffix: ''});
      // Existing privacy canonicalization removes format controls (including
      // ZWJ); this test checks Keep on that actual basis, not a new promise
      // to retain raw source emoji shaping controls in privacy output.
      assert.ok(final.markdown.includes(canonicalizeRenderedText(caption, 'content-person-fields/1')));
      assert.match(final.markdown, /HTTP\/2 31415/u);
      assert.doesNotMatch(final.markdown, /Qvx|Qvy/u);
      assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
      const proof = {markdown: final.markdown, profile, content_options: actualOptions, source_extraction: source.sourceExtraction,
        dictionary: final.dictionary, strong_person_anchor: final.strong_person_anchor, reviewed_person_candidates: final.reviewed_person_candidates};
      assert.ok(verifyAnonymizedPublication(proof));
      const entities = initialEntities({markdown: final.markdown, transform_trace: final.transform_trace}), target = entities.find(row => /Qvx/u.test(row.original));
      assert.ok(target);
      const kept = applyEntityDecisions(final.markdown, entities, [{entity_id: target.entity_id, decision: 'keep'}], Buffer.alloc(32, 53));
      const binding = bindStandaloneDocumentKeeps(kept.markdown, [], kept.entities.filter(row => row.decision === 'keep').map(({start, end}) => ({start, end})));
      assert.throws(() => verifyAnonymizedPublication({...proof, markdown: kept.markdown, reviewed_person_candidates: binding}),
        {code: 'STANDALONE_PUBLICATION_INVALID'});
      assert.equal(sha(bytes), before);
    });
  }
  const qualifiedCases = [];
  for (const ending of ['\n', '\r']) {
    for (const label of ['Dienstliche Telefonnummer', 'Weitere Angaben Geburtsdatum'])
      qualifiedCases.push({id: 'benign-' + label + JSON.stringify(ending), extension: '.txt', label,
        raw: 'Name: Qza' + ending + label + ': Qvx / Qvy\nFachtext: FHIR REST'});
    qualifiedCases.push({id: 'known-person-' + JSON.stringify(ending), extension: '.txt',
      raw: '😀 sachlich\nName: Anna Berger' + ending + 'Anna Berger Geburtsdatum: Qvx / Qvy\nFachtext: FHIR REST'});
    qualifiedCases.push({id: 'unseeded-person-' + JSON.stringify(ending), extension: '.txt',
      raw: '😀 sachlich\nName: Qza' + ending + 'Anna Berger Geburtsdatum: Qvx / Qvy\nFachtext: FHIR REST'});
    qualifiedCases.push({id: 'email-' + JSON.stringify(ending), extension: '.txt',
      raw: 'Name: Qza' + ending + 'anna@example.invalid Geburtsdatum: Qvx / Qvy\nFachtext: FHIR REST'});
  }
  qualifiedCases.push({id: 'known-person-real-table', extension: '.md',
    fact: 'HTTP/2 31415', raw: 'Name: Anna Berger\n\n| Anna Berger Geburtsdatum | Fachtext |\n| --- | --- |\n| Qvx / Qvy | HTTP/2 31415 |'});
  qualifiedCases.push({id: 'email-real-table', extension: '.md',
    fact: 'HTTP/2 31415', raw: 'Name: Qza\n\n| anna@example.invalid Geburtsdatum | Fachtext |\n| --- | --- |\n| Qvx / Qvy | HTTP/2 31415 |'});
  for (const item of qualifiedCases) for (const markdownOutput of ['content-v1', 'notes-v1']) for (const profile of ['general', 'personnel_profile']) {
    await testAsync(`actual qualified caption/PII/trace/publication/Keep ${item.id}/${markdownOutput}/${profile}`, async () => {
      const bytes = Buffer.from(item.raw), before = sha(bytes), actualOptions = {...contentOptions, markdownOutput};
      const source = await extractSourceForPrivacy(bytes, item.extension, {contentOptions: actualOptions, convertBuffer: async input => {
        const extraction = extractMarkdownBuffer(input, item.extension, item.extension === '.md' ? {} : {markdownOutput});
        const markdown = item.extension === '.md' && markdownOutput === 'content-v1' ?
          require('../plugins/data-secure/server/standalone/markdown-image-content').markdownImageContent(extraction.markdown, {fromMarkdown, parseFragment}).markdown : extraction.markdown;
        return createMarkdownExtraction({source_type: item.extension.slice(1), markdown, coverage: extraction.coverage, content_options: actualOptions});
      }});
      const prepared = prepareTextPrivacyReview({text: source.markdown, profile, productChannel: 'standalone',
        consumerOptions: {productChannel: 'standalone', contentOptions: actualOptions}, captureTrace: true,
        registry: require('../plugins/data-secure/server/privacy/entities').makeRegistry()});
      const reviewed = await resolveTextPrivacyReview(prepared, null, {reviewPolicy: 'automatic-conservative'});
      const final = finalizeTextPrivacyReview(prepared, reviewed, {prefix: '', suffix: ''});
      assert.doesNotMatch(final.markdown, /Qza|Qvx|Qvy|Anna Berger|anna@example\.invalid/u);
      assert.ok(final.markdown.includes(item.fact || 'FHIR REST'));
      if (item.label === 'Dienstliche Telefonnummer') assert.ok(final.markdown.includes(item.label + ':'), 'unambiguous qualified caption remains readable');
      if (item.label === 'Weitere Angaben Geburtsdatum') {
        assert.match(final.markdown, /Geburtsdatum:/u);
        assert.doesNotMatch(final.markdown, /Weitere Angaben/u, 'normal automatic-conservative review masks its unresolved qualifier without masking the technical label');
      }
      const ranges = protectedHeaderRanges(source.markdown, 'content-person-fields/1');
      for (const token of ['Anna Berger', 'anna@example.invalid']) for (const occurrence of source.markdown.matchAll(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'gu')))
        assert.equal(isWithinProtectedHeader(ranges, {start: occurrence.index, end: occurrence.index + token.length}), false);
      assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
      const proof = {markdown: final.markdown, profile, content_options: actualOptions, source_extraction: source.sourceExtraction,
        dictionary: final.dictionary, strong_person_anchor: final.strong_person_anchor, reviewed_person_candidates: final.reviewed_person_candidates};
      assert.ok(verifyAnonymizedPublication(proof));
      const entities = initialEntities({markdown: final.markdown, transform_trace: final.transform_trace});
      const target = entities.find(row => /Qvx/u.test(row.original)); assert.ok(target);
      const kept = applyEntityDecisions(final.markdown, entities, [{entity_id: target.entity_id, decision: 'keep'}], Buffer.alloc(32, 31));
      const keep = bindStandaloneDocumentKeeps(kept.markdown, [], kept.entities.filter(row => row.decision === 'keep').map(({start, end}) => ({start, end})));
      assert.throws(() => verifyAnonymizedPublication({...proof, markdown: kept.markdown, reviewed_person_candidates: keep}), {code: 'STANDALONE_PUBLICATION_INVALID'});
      if (item.id.startsWith('known-person-')) {
        const anchored = entities.find(row => row.original === 'Anna Berger'); assert.ok(anchored);
        const restored = applyEntityDecisions(final.markdown, entities, [{entity_id: anchored.entity_id, decision: 'keep'}], Buffer.alloc(32, 39));
        const binding = bindStandaloneDocumentKeeps(restored.markdown, [], restored.entities.filter(row => row.decision === 'keep').map(({start, end}) => ({start, end})));
        assert.throws(() => verifyAnonymizedPublication({...proof, markdown: restored.markdown, reviewed_person_candidates: binding}), {code: 'STANDALONE_PUBLICATION_INVALID'});
      }
      assert.equal(sha(bytes), before);
    });
  }
  for (const ending of ['\n', '\r']) for (const markdownOutput of ['content-v1', 'notes-v1']) for (const profile of ['general', 'personnel_profile']) {
    await testAsync(`actual guided harmless qualifier Keep is occurrence-bound ${JSON.stringify(ending)}/${markdownOutput}/${profile}`, async () => {
      const bytes = Buffer.from('Name: Qza' + ending + 'Weitere Angaben Geburtsdatum: Qvx / Qvy\nFachtext: FHIR REST');
      const actualOptions = {...contentOptions, markdownOutput};
      const source = await extractSourceForPrivacy(bytes, '.txt', {contentOptions: actualOptions, convertBuffer: async input => {
        const x = extractMarkdownBuffer(input, '.txt', {markdownOutput});
        return createMarkdownExtraction({source_type: 'txt', markdown: x.markdown, coverage: x.coverage, content_options: actualOptions});
      }});
      const prepared = prepareTextPrivacyReview({text: source.markdown, profile, productChannel: 'standalone',
        consumerOptions: {productChannel: 'standalone', contentOptions: actualOptions}, captureTrace: true,
        registry: require('../plugins/data-secure/server/privacy/entities').makeRegistry()});
      assert.ok(prepared.ambiguities.some(row => prepared.draft.original_text.slice(row.original_start, row.original_end) === 'Weitere Angaben'));
      const reviewed = await resolveTextPrivacyReview(prepared, async draft =>
        require('../plugins/data-secure/server/gateway/batch-review-policy').reviewedBatchText(draft, draft.ambiguities.map(row => ({
          ambiguity_id: row.ambiguity_id,
          decision: draft.original_text.slice(row.original_start, row.original_end) === 'Weitere Angaben' ? 'keep' : 'redact'
        }))));
      const final = finalizeTextPrivacyReview(prepared, reviewed, {prefix: '', suffix: ''});
      assert.ok(final.markdown.includes('Weitere Angaben Geburtsdatum:'));
      assert.doesNotMatch(final.markdown, /Qza|Qvx|Qvy/u);
      assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
      const proof = {markdown: final.markdown, profile, content_options: actualOptions, source_extraction: source.sourceExtraction,
        dictionary: final.dictionary, strong_person_anchor: final.strong_person_anchor, reviewed_person_candidates: final.reviewed_person_candidates};
      assert.ok(verifyAnonymizedPublication(proof));
      const entities = initialEntities({markdown: final.markdown, transform_trace: final.transform_trace}), target = entities.find(row => /Qvx/u.test(row.original));
      assert.ok(target);
      const kept = applyEntityDecisions(final.markdown, entities, [{entity_id: target.entity_id, decision: 'keep'}], Buffer.alloc(32, 37));
      const keep = bindStandaloneDocumentKeeps(kept.markdown, [], kept.entities.filter(row => row.decision === 'keep').map(({start, end}) => ({start, end})));
      assert.throws(() => verifyAnonymizedPublication({...proof, markdown: kept.markdown, reviewed_person_candidates: keep}), {code: 'STANDALONE_PUBLICATION_INVALID'});
    });
  }
  for (const prefix of splitLabelPrefixes.filter(value => value.includes('\\'))) {
    await testAsync(`literal TXT escapes gain no invented caption exemption inside an earlier strong field ${JSON.stringify(prefix)}`, async () => {
      const bytes = Buffer.from('Name: Qza\r' + prefix + ' Qvx / Qvy\nFachtext: FHIR REST'), before = sha(bytes);
      const source = await extractSourceForPrivacy(bytes, '.txt', {contentOptions, convertBuffer: async input => {
        const extracted = extractMarkdownBuffer(input, '.txt', {markdownOutput: 'content-v1'});
        return createMarkdownExtraction({source_type: 'txt', markdown: extracted.markdown, coverage: extracted.coverage, content_options: contentOptions});
      }});
      assert.ok(source.markdown.includes('\\\\'), 'TXT source backslashes remain literal in the Markdown projection');
      assert.equal(protectedHeaderRanges(source.markdown, 'content-person-fields/1').length, 1);
      const actual = anonymize(source.markdown, 'general', options);
      assert.doesNotMatch(actual.text, /Qza|Qvx|Qvy/u);
      assert.match(actual.text, /Fachtext: FHIR REST/u);
      assert.equal(replayTransformTrace(actual.transform_trace), actual.text);
      assert.deepEqual(scanResidual(actual.text, 'general', [], {...options, originalSourceText: source.markdown}), []);
      assert.equal(sha(bytes), before);
    });
  }
  for (const prefix of splitLabelPrefixes) for (const markdownOutput of ['content-v1', 'notes-v1']) for (const profile of ['general', 'personnel_profile']) {
    await testAsync(`actual split-label SourcePrivacy/trace/publication/Keep ${JSON.stringify(prefix)}/${markdownOutput}/${profile}`, async () => {
      const bytes = Buffer.from(prefix + ' Qvx / Qvy\nFachtext: FHIR REST'), before = sha(bytes), actualOptions = {...contentOptions, markdownOutput};
      assert.ok(scanResidual(bytes.toString(), profile, [], {productChannel: 'standalone', contentOptions: actualOptions})
        .some(row => row.type === 'SENSITIVE_FIELD'), 'independent raw whole-field gate needs no identity dictionary');
      // Escapes in an authored MD source are markup. A TXT backslash is a
      // literal source character and its content projection must escape it;
      // do not accidentally demand a second global unescape of literal TXT.
      const extension = prefix.includes('\\') ? '.md' : '.txt';
      const source = await extractSourceForPrivacy(bytes, extension, {contentOptions: actualOptions, convertBuffer: async input => {
        const extracted = extractMarkdownBuffer(input, extension, extension === '.md' ? {} : {markdownOutput});
        const markdown = extension === '.md' && markdownOutput === 'content-v1' ?
          require('../plugins/data-secure/server/standalone/markdown-image-content').markdownImageContent(extracted.markdown, {fromMarkdown, parseFragment}).markdown : extracted.markdown;
        return createMarkdownExtraction({source_type: extension.slice(1), markdown, coverage: extracted.coverage, content_options: actualOptions});
      }});
      const prepared = prepareTextPrivacyReview({text: source.markdown, profile, productChannel: 'standalone',
        consumerOptions: {productChannel: 'standalone', contentOptions: actualOptions}, captureTrace: true,
        registry: require('../plugins/data-secure/server/privacy/entities').makeRegistry()});
      const reviewed = await resolveTextPrivacyReview(prepared, null, {reviewPolicy: 'automatic-conservative'});
      const final = finalizeTextPrivacyReview(prepared, reviewed, {prefix: '', suffix: ''});
      assert.doesNotMatch(final.markdown, /Qvx|Qvy/u); assert.match(final.markdown, /Fachtext: FHIR REST/u);
      for (const range of protectedHeaderRanges(source.markdown, 'content-person-fields/1'))
        assert.ok(final.markdown.includes(source.markdown.slice(range.start, range.end)));
      assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
      const proof = {markdown: final.markdown, profile, content_options: actualOptions, source_extraction: source.sourceExtraction,
        dictionary: final.dictionary, strong_person_anchor: final.strong_person_anchor, reviewed_person_candidates: final.reviewed_person_candidates};
      assert.ok(verifyAnonymizedPublication(proof));
      const entities = initialEntities({markdown: final.markdown, transform_trace: final.transform_trace});
      const target = entities.find(row => /Qvx/u.test(row.original)); assert.ok(target);
      const kept = applyEntityDecisions(final.markdown, entities, [{entity_id: target.entity_id, decision: 'keep'}], Buffer.alloc(32, 23));
      const keep = bindStandaloneDocumentKeeps(kept.markdown, [], kept.entities.filter(row => row.decision === 'keep').map(({start, end}) => ({start, end})));
      assert.throws(() => verifyAnonymizedPublication({...proof, markdown: kept.markdown, reviewed_person_candidates: keep}), {code: 'STANDALONE_PUBLICATION_INVALID'});
      assert.equal(sha(bytes), before);
    });
  }
  for (const markdownOutput of ['content-v1', 'notes-v1']) for (const profile of ['general', 'personnel_profile']) {
    for (const [caseName, input] of [['retained-121-byte', retainedGuiInput], ...['\n', '\r\n', '\r'].map(eol =>
      [JSON.stringify(eol), Buffer.from(retainedGuiInput.toString('utf8').replace(/\r\n|\r|\n/gu, eol))])]) {
    await testAsync(`retained GUI field captions through actual publication ${caseName}/${markdownOutput}/${profile}`, async () => {
      assert.equal(retainedGuiInput.length, 121);
      assert.equal(sha(retainedGuiInput), 'dc9b5248f98aaebce7c709f9ca9f16a049ec248b8a130c1b8dfa63d6345d821d');
      const bytes = Buffer.from(input), actualOptions = {...contentOptions, markdownOutput};
      const source = await extractSourceForPrivacy(bytes, '.txt', {contentOptions: actualOptions, convertBuffer: async input => {
        const extracted = extractMarkdownBuffer(input, '.txt', {markdownOutput});
        return createMarkdownExtraction({source_type: 'txt', markdown: extracted.markdown, coverage: extracted.coverage, content_options: actualOptions});
      }});
      const prepared = prepareTextPrivacyReview({text: source.markdown, profile, productChannel: 'standalone',
        consumerOptions: {productChannel: 'standalone', contentOptions: actualOptions}, captureTrace: true,
        registry: require('../plugins/data-secure/server/privacy/entities').makeRegistry()});
      const reviewed = await resolveTextPrivacyReview(prepared, null, {reviewPolicy: 'automatic-conservative'});
      const final = finalizeTextPrivacyReview(prepared, reviewed, {prefix: '', suffix: ''});
      assert.match(final.markdown, /Name:/u); assert.match(final.markdown, /[\r\n]Unternehmen:/u);
      assert.doesNotMatch(final.markdown, /Anna Berger|Nordstern/u);
      assert.match(final.markdown, /MASKIERZIEL/u);
      if (caseName === JSON.stringify('\r')) {
        // A bare CR before an unknown label is not evidence that the preceding
        // strong field ended. Preserve this intentional conservative boundary.
        assert.doesNotMatch(final.markdown, /FHIR REST 31415/u);
        assert.match(source.markdown, /FHIR REST 31415/u);
      } else assert.match(final.markdown, /FHIR REST 31415/u);
      assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
      assert.ok(final.transform_trace.steps.every(step => step.edits.every(edit => edit.original !== 'Unternehmen:')));
      const proof = {markdown: final.markdown, profile, content_options: actualOptions, source_extraction: source.sourceExtraction,
        dictionary: final.dictionary, strong_person_anchor: final.strong_person_anchor, reviewed_person_candidates: final.reviewed_person_candidates};
      assert.ok(verifyAnonymizedPublication(proof));
      const entities = initialEntities({markdown: final.markdown, transform_trace: final.transform_trace});
      const target = entities.find(row => row.original === 'Anna Berger'); assert.ok(target);
      const kept = applyEntityDecisions(final.markdown, entities, [{entity_id: target.entity_id, decision: 'keep'}], Buffer.alloc(32, 17));
      const keep = bindStandaloneDocumentKeeps(kept.markdown, [], kept.entities.filter(row => row.decision === 'keep').map(({start, end}) => ({start, end})));
      assert.throws(() => verifyAnonymizedPublication({...proof, markdown: kept.markdown, reviewed_person_candidates: keep}), {code: 'STANDALONE_PUBLICATION_INVALID'});
      assert.deepEqual(bytes, input);
    });
    }
  }
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
