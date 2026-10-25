'use strict';

const { createSuite } = require('./helpers');
const { anonymize, scanResidual } = require('../plugins/data-secure/server/privacy/engine');
const { canonicalizeRenderedText } = require('../plugins/data-secure/server/privacy/base');
const { replayTransformTrace, entityPlanFromTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const { applyEntityDecisions, initialEntities } = require('../plugins/data-secure/server/gateway/standalone-entity-review');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } = require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { test, testAsync, assert, done } = createSuite('Complete explicit table field coverage');
const options = { productChannel: 'standalone', contentOptions: { schema: 'datasecure-content-options/1',
  markdownOutput: 'content-v1', scanOcr: false, imageOcr: false }, captureTransformPlan: true };
const cell = (label, value) => `| ${label} |\n| --- |\n| ${value} |`;

for (const value of ['Qvx', 'Qvx / Qvy', 'Qvx<br>Qvy', 'Qvx '.repeat(30), '😀Qvx\\|Qvy',
  'Anna Berger / Qvx', 'Qvx &amp; Qvy', 'Qvx\\_Qvy', 'Qvx\u0308Qvy']) {
  test(`full field value and actual trace: ${JSON.stringify(value).slice(0, 65)}`, () => {
    const source = canonicalizeRenderedText(cell('Name', value) + '\n\n' + cell('Fachtext', 'FHIR'), 'content-person-fields/1');
    const actual = anonymize(source, 'general', options);
    assert.doesNotMatch(actual.text, /Qvx|Qvy|Anna|Berger/u);
    assert.match(actual.text, /FHIR/u);
    assert.equal(replayTransformTrace(actual.transform_trace), actual.text);
    const plan = entityPlanFromTrace(actual.transform_trace);
    assert.ok(plan.occurrences.length > 0);
    assert.deepEqual(scanResidual(actual.text, 'general', actual.dictionary, options), []);
    assert.ok(scanResidual(source, 'general', [], options).some(row => row.type === 'SENSITIVE_FIELD'));
  });
}

test('only actual protected column values, no global technical-vocabulary mask', () => {
  const source = '| Name | Fachtext |\n| --- | --- |\n| Qvx / Qvy | FHIR REST HL7 |';
  const actual = anonymize(source, 'general', options);
  assert.match(actual.text, /FHIR REST HL7/u);
  assert.match(actual.text, /FIELD_REDACTED/u);
  assert.equal(actual.dictionary.length, 0, 'fallback does not invent a person identity');
});

test('separate duplicate values retain distinct UTF16 coordinates after a surrogate pair', () => {
  const source = '😀\n\n' + cell('Geschützter Tabellenwert', 'Qvx / Qvy') + '\n\n' + cell('Geschützter Tabellenwert', 'Qvx / Qvy');
  const actual = anonymize(source, 'general', options), plan = entityPlanFromTrace(actual.transform_trace);
  const fields = plan.occurrences.filter(row => row.kind === 'SENSITIVE_FIELD');
  assert.equal(fields.length, 2);
  assert.notEqual(fields[0].source_start, fields[1].source_start);
  for (const field of fields) assert.equal(source.slice(field.source_start, field.source_end), field.original);
});

test('Keep cannot restore a protected long or delimited source value', () => {
  const source = cell('Name', 'Qvx / Qvy'), actual = anonymize(source, 'general', options);
  const entities = initialEntities({ transform_trace: actual.transform_trace, markdown: actual.text });
  const kept = applyEntityDecisions(actual.text, entities, [{ entity_id: entities[0].entity_id, decision: 'keep' }], Buffer.alloc(32, 7));
  assert.equal(kept.markdown, source);
  assert.ok(scanResidual(kept.markdown, 'general', [], options).some(row => row.type === 'SENSITIVE_FIELD'));
});

test('generic uncertain field does not create PERSON/ORGANIZATION identity', () => {
  const actual = anonymize(cell('Geschützter Tabellenwert', 'Qvx / Qvy'), 'general', options);
  assert.match(actual.text, /FIELD_REDACTED/u);
  assert.deepEqual(actual.dictionary, []);
  assert.ok(entityPlanFromTrace(actual.transform_trace).occurrences.every(row => row.kind === 'SENSITIVE_FIELD'));
});

test('legacy product policy remains unchanged by the content-only fallback', () => {
  const source = cell('Name', 'Qvx / Qvy');
  assert.equal(anonymize(source).text, source);
});

for (const label of ['Name', 'Unternehmen', 'Full Name']) for (const value of ['Qvx\rQvy', 'Qvx&#13;Qvy', 'Qvx<br>Qvy', 'Qvx / Qvy']) {
  test(`explicit inline cell field ${label}/${JSON.stringify(value)} retains protection, replay and Keep refusal`, () => {
    const original = '😀\n\n| Inhalt | Fachtext |\n| --- | --- |\n' + `| ${label}: ${value} | FHIR REST HL7 |`;
    const source = canonicalizeRenderedText(original, 'content-person-fields/1');
    const actual = anonymize(source, 'general', options);
    assert.doesNotMatch(actual.text, /Qvx|Qvy/u);
    assert.match(actual.text, /FHIR REST HL7/u);
    assert.equal(replayTransformTrace(actual.transform_trace), actual.text);
    assert.deepEqual(scanResidual(actual.text, 'general', actual.dictionary, options), []);
    assert.ok(scanResidual(source, 'general', [], options).some(row => row.type === 'SENSITIVE_FIELD'));
    if (source.includes('\r')) assert.deepEqual(actual.dictionary, [], 'uncertain CR-delimited values gain no invented identity');
    const entities = initialEntities({ transform_trace: actual.transform_trace, markdown: actual.text });
    const target = entities.find(row => row.original.includes('Qvx'));
    assert.ok(target);
    const kept = applyEntityDecisions(actual.text, entities, [{ entity_id: target.entity_id, decision: 'keep' }], Buffer.alloc(32, 9));
    assert.ok(scanResidual(kept.markdown, 'general', [], { ...options, originalSourceText: source }).some(row => row.type === 'SENSITIVE_FIELD'));
  });
}
test('inline field duty stays inside the actual source cell and does not reclassify technical labels or prose', () => {
  const source = '| Inhalt | Nachbar |\n| --- | --- |\n| Name: Qvx\rQvy | Fachtext: FHIR |\n' +
    '| Dateiname: FHIR.md | Technologie: HL7 |\n\nFreier Satz Name: Qvx / Qvy';
  const actual = anonymize(source, 'general', options);
  assert.match(actual.text, /Fachtext: FHIR/u);
  assert.match(actual.text, /Dateiname: FHIR\.md/u);
  assert.match(actual.text, /Technologie: HL7/u);
  assert.match(actual.text, /Freier Satz Name: Qvx \/ Qvy/u);
  assert.equal(anonymize('| Inhalt |\n| --- |\n| Name: Qvx\rQvy |').text,
    '| Inhalt |\n| --- |\n| Name: Qvx\rQvy |', 'historical product policy stays separate');
});

for (const inline of [false, true]) test(`bare CR followed by a known label stays inside the real ${inline ? 'inline' : 'column'} table value`, () => {
  const source = inline ? '| Inhalt | Fachtext |\n| --- | --- |\n| Name: Qvx\rUnternehmen: Qvy | FHIR REST HL7 |' :
    '| Name | Fachtext |\n| --- | --- |\n| Qvx\rUnternehmen: Qvy | FHIR REST HL7 |';
  const actual = anonymize(source, 'general', options);
  assert.doesNotMatch(actual.text, /Qvx|Qvy|Unternehmen:/u);
  assert.match(actual.text, /FHIR REST HL7/u);
  assert.equal(replayTransformTrace(actual.transform_trace), actual.text);
  const {protectedHeaderRanges, isWithinProtectedHeader} = require('../plugins/data-secure/server/privacy/field-value-coverage');
  const label = source.indexOf('Unternehmen:');
  assert.equal(isWithinProtectedHeader(protectedHeaderRanges(source, 'content-person-fields/1'),
    {start: label, end: label + 'Unternehmen:'.length}), false, 'a table value is not a second prose-header exemption');
  const target = initialEntities({markdown: actual.text, transform_trace: actual.transform_trace}).find(row => row.original.includes('Qvx'));
  assert.ok(target);
  const kept = applyEntityDecisions(actual.text, initialEntities({markdown: actual.text, transform_trace: actual.transform_trace}),
    [{entity_id: target.entity_id, decision: 'keep'}], Buffer.alloc(32, 14));
  assert.ok(scanResidual(kept.markdown, 'general', [], {...options, originalSourceText: source}).some(row => row.type === 'SENSITIVE_FIELD'));
  assert.equal(anonymize(source).text, source, 'the content-only change does not broaden legacy policy');
});
for (const label of ['Name \r(1)', 'Company\rName']) test(`old complete inline table-label grammar remains protected ${JSON.stringify(label)}`, () => {
  const source = `| Inhalt | Fachtext |\n| --- | --- |\n| ${label}: Qvx / Qvy | FHIR REST HL7 |`;
  const actual = anonymize(source, 'general', options);
  assert.doesNotMatch(actual.text, /Qvx|Qvy/u); assert.match(actual.text, /FHIR REST HL7/u);
  assert.equal(replayTransformTrace(actual.transform_trace), actual.text);
  assert.ok(scanResidual(source, 'general', [], options).some(row => row.type === 'SENSITIVE_FIELD'));
  assert.deepEqual(scanResidual(actual.text, 'general', [], {...options, originalSourceText: source}), []);
  const entities = initialEntities({markdown: actual.text, transform_trace: actual.transform_trace});
  const target = entities.find(row => row.original.includes('Qvx')); assert.ok(target);
  const kept = applyEntityDecisions(actual.text, entities, [{entity_id: target.entity_id, decision: 'keep'}], Buffer.alloc(32, 25));
  assert.ok(scanResidual(kept.markdown, 'general', [], {...options, originalSourceText: source}).some(row => row.type === 'SENSITIVE_FIELD'));
});
for (const qualifier of ['Anna Berger', 'anna@example.invalid']) test(`actual table header field ownership cannot exempt its private qualifier ${qualifier}`, () => {
  const source = 'Name: Anna Berger\n\n' + `| ${qualifier} Geburtsdatum | Fachtext |\n| --- | --- |\n| Qvx / Qvy | FHIR REST |`;
  const {protectedHeaderRanges, isWithinProtectedHeader} = require('../plugins/data-secure/server/privacy/field-value-coverage');
  const start = source.indexOf(qualifier, source.indexOf('|'));
  assert.equal(isWithinProtectedHeader(protectedHeaderRanges(source, 'content-person-fields/1'),
    {start, end: start + qualifier.length}), false);
  const actual = anonymize(source, 'general', options);
  assert.doesNotMatch(actual.text, /Anna Berger|anna@example\.invalid|Qvx|Qvy/u);
  assert.match(actual.text, /Geburtsdatum/u); assert.match(actual.text, /FHIR REST/u);
  assert.equal(replayTransformTrace(actual.transform_trace), actual.text);
  assert.equal(scanResidual(actual.text, 'general', actual.dictionary, {...options, originalSourceText: source})
    .some(row => ['SENSITIVE_FIELD', 'RESIDUAL_ENTITY', 'EMAIL'].includes(row.type)), false,
  'this direct-engine control asserts the private field/qualifier duties, not unattended review of unrelated weak prose');
});
for (const label of ['Name' + ' '.repeat(161), 'Name' + ' (1)'.repeat(42), 'Name\\']) for (const header of [false, true]) {
  test(`closed inline ${header ? 'header' : 'data'} label has no silent local length/escape exemption: ${label.length}`, () => {
    const cell = `${label}: Qvx / Qvy`;
    const source = header ? `| ${cell} | Fachtext |\n| --- | --- |\n| sachlich | FHIR REST HL7 |` :
      `| Inhalt | Fachtext |\n| --- | --- |\n| ${cell} | FHIR REST HL7 |`;
    const basis = canonicalizeRenderedText(source, 'content-person-fields/1');
    const actual = anonymize(basis, 'general', options);
    assert.doesNotMatch(actual.text, /Qvx|Qvy/u); assert.match(actual.text, /FHIR REST HL7/u);
    assert.equal(replayTransformTrace(actual.transform_trace), actual.text);
    assert.deepEqual(scanResidual(actual.text, 'general', [], options), []);
    assert.ok(scanResidual(source, 'general', [], options).some(row => row.type === 'SENSITIVE_FIELD'));
    const entities = initialEntities({ markdown: actual.text, transform_trace: actual.transform_trace });
    const target = entities.find(row => row.original.includes('Qvx')); assert.ok(target);
    const kept = applyEntityDecisions(actual.text, entities, [{ entity_id: target.entity_id, decision: 'keep' }], Buffer.alloc(32, 5));
    assert.ok(scanResidual(kept.markdown, 'general', [], { ...options, originalSourceText: source }).some(row => row.type === 'SENSITIVE_FIELD'));
  });
}
test('inline header payload is protected even without data rows, while pure semantic headers stay unchanged', () => {
  const input = '| Name: Qvx / Qvy | Fachtext |\n| --- | --- |';
  assert.doesNotMatch(anonymize(input, 'general', options).text, /Qvx|Qvy/u);
  assert.ok(scanResidual(input, 'general', [], options).some(row => row.type === 'SENSITIVE_FIELD'));
  assert.equal(anonymize('| Name | Fachtext |\n| --- | --- |', 'general', options).text,
    '| Name | Fachtext |\n| --- | --- |');
});
for (const value of ['Name: Qvx\rQvy', 'Name' + ' '.repeat(161) + ': Qvx\rQvy', 'Name\\: Qvx / Qvy', 'Name: [PERSON_DENISEKOCH]']) {
  test(`nested stored-value field remains protected inside its actual formula cell: ${value.length}`, () => {
    const source = '| Inhalt | Fachtext |\n| --- | --- |\n| Formel: "cached source only"<br>Gespeicherter Wert: ' +
      value + ' (nicht neu berechnet) | FHIR REST HL7 |';
    const basis = canonicalizeRenderedText(source, 'content-person-fields/1'), actual = anonymize(basis, 'general', options);
    assert.doesNotMatch(actual.text, /Qvx|Qvy|DENISEKOCH/u);
    assert.match(actual.text, /Formel: "cached source only"/u); assert.match(actual.text, /FHIR REST HL7/u);
    assert.equal(replayTransformTrace(actual.transform_trace), actual.text);
    assert.deepEqual(scanResidual(actual.text, 'general', [], { ...options, originalSourceText: source }), []);
    assert.ok(scanResidual(source, 'general', [], { ...options, originalSourceText: source }).some(row => row.type === 'SENSITIVE_FIELD'));
  });
}

for(const suffix of ['', ' (1)', ' (1) (2)', ' (1) (2) (3)'])for(const rawLabel of ['Name','Vorname','Nachname','Person','Ansprechpartner','Autor','Verfasser','Empfänger','Absender','Unterzeichner','Full Name']) {
  const label=rawLabel+suffix;
  test(`source value equal to ${label} cannot remove field ownership`, () => {
    const source = cell(label,rawLabel) + '\n\n' + cell(label,'Qvx / Qvy');
    const actual = anonymize(source,'general',options);
    assert.doesNotMatch(actual.text,/Qvx|Qvy/u);
    assert.ok(actual.text.startsWith(`| ${label} |`));
    assert.deepEqual(scanResidual(actual.text,'general',actual.dictionary,options),[]);
    const plan=entityPlanFromTrace(actual.transform_trace);
    assert.ok(plan.occurrences.some(row=>row.original==='Qvx / Qvy'));
    assert.ok(plan.occurrences.every(row=>!(row.original===label && row.source_start===2)));
  });
}
for(const slashes of [0,1,2,3,4])for(const spacing of ['', ' '])test(`outer delimiter escape parity ${slashes}/${JSON.stringify(spacing)}`,()=>{
  // Odd slash counts escape the last pipe; that pipe is value content, not
  // an outer delimiter. Both valid one-column forms must still cover Qvx.
  const source=`|Name|\n|---|\n|Qvx${'\\'.repeat(slashes)}${spacing}|`;
  const actual=anonymize(source,'general',options);
  assert.doesNotMatch(actual.text,/Qvx/u);
  assert.deepEqual(scanResidual(actual.text,'general',actual.dictionary,options),[]);
});
test('effective header semantics are idempotent and retain nonordinal source suffixes',()=>{
  const {effectiveTableFieldLabel}=require('../plugins/data-secure/server/privacy/base');
  for(const label of ['Name','Name (1)','Full Name'+ ' (123)'.repeat(1000),'Telefon - privat (2) (3)', 'Name (person)', 'Name (1) X', 'Name (1)(2)']){
    assert.equal(effectiveTableFieldLabel(effectiveTableFieldLabel(label)),effectiveTableFieldLabel(label));
  }
  assert.equal(effectiveTableFieldLabel('Name (person)'),'Name (person)');
  assert.equal(effectiveTableFieldLabel('Name (1) X'),'Name (1) X');
  assert.equal(effectiveTableFieldLabel('Name (1) (2)','legacy-person-fields/1'),'Name (1)');
});

test('independent inline qualifier reader retains exact repeated raw cell owners and escaped producer prefixes', () => {
  const fs = require('node:fs'), vm = require('node:vm'), {createRequire} = require('node:module');
  const file = require.resolve('../plugins/data-secure/server/privacy/engine'), source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('    const proseValues = '), end = source.indexOf('    for (const value of proseValues(rendered', start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({module: {exports: {}}, require: createRequire(file)});
  vm.runInContext("const personFieldPolicy='content-person-fields/1'; const {personFieldPattern}=require('../core/person-field-policy'); const {markdownTableCells}=require('./entities'); const {isProtectedFieldHeader}=require('./field-value-coverage');\n" +
    source.slice(start, end) + '\nmodule.exports.read=proseValues;', context, {timeout: 1000});
  const read = value => { const scopes = []; context.value = value; context.scopes = scopes;
    const values = vm.runInContext('module.exports.read(value,null,scopes)', context, {timeout: 300}); return {scopes, values}; };
  const table = value => `| Inhalt | Fachtext |\n| --- | --- |\n| ${value} | HTTP/2 31415 |`;
  const repeated = table('Anna Berger Geburtsdatum: [FIELD_REDACTED]') + '\n\n' + table('Anna Berger Geburtsdatum: [FIELD_REDACTED]');
  const actual = read('😀 gewöhnlicher Vorlauf\n' + repeated);
  assert.equal(actual.scopes.length, 2);
  assert.notEqual(actual.scopes[0].start, actual.scopes[1].start);
  assert.ok(actual.scopes.every(scope => ('😀 gewöhnlicher Vorlauf\n' + repeated).slice(scope.start, scope.end) === 'Anna Berger Geburtsdatum'));
  const producer = table('Formel: "A\\|B"<br>Gespeicherter Wert: 😀 Anna Berger Geburtsdatum\\: [FIELD_REDACTED]');
  const owned = read(producer).scopes;
  assert.equal(owned.length, 1);
  assert.equal(producer.slice(owned[0].start, owned[0].end), '😀 Anna Berger Geburtsdatum\\');
  assert.equal(owned[0].comparison, '😀 Anna Berger');
  for (const raw of ['Anna\u2028Berger Geburtsdatum', 'Anna\u2028Berger Geburtsdatum (1) (2)']) {
    const value = table(raw + ': [FIELD_REDACTED]'), scoped = read(value).scopes;
    assert.equal(scoped.length, 1);
    assert.equal(value.slice(scoped[0].start, scoped[0].fallbackEnd), 'Anna\u2028Berger');
    assert.equal(value.slice(scoped[0].fallbackEnd).trimStart().startsWith('Geburtsdatum'), true);
  }
  const oneCell = table('Anna Berger Geburtsdatum: [FIELD_REDACTED]\rBirte Faber Telefonnummer: [FIELD_REDACTED]');
  assert.equal(read(oneCell).scopes.length, 1, 'CR inside the one true cell is not another qualifier owner');
  assert.equal(read('| Inhalt | Inhalt |\n| --- | --- |\n| Anna Berger | Geburtsdatum: [FIELD_REDACTED] |').scopes.length, 0,
    'no name-to-label relationship is invented across neighboring cells');
  assert.equal(read(table('Dokumentation: HTTP/2 31415')).scopes.length, 0);
  const corridor = table('x:'.repeat(2048) + 'Anna Berger Geburtsdatum: [FIELD_REDACTED]');
  assert.equal(read(corridor).scopes.length, 1, 'producer separator progress remains bounded');
});

test('unbound inline suffix or mismatched raw cell owner cannot erase the field authority', () => {
  const source = '| Inhalt | Fachtext |\n| --- | --- |\n| Anna\u2028Berger Geburts datum: [FIELD_REDACTED] | HTTP/2 31415 |';
  const findings = scanResidual(source, 'general', [], {...options, includePersonCandidateSpans: true});
  assert.ok(findings.some(row => row.type === 'SENSITIVE_FIELD'), 'unproved normalized suffix must refuse, not mask away the whole field label');
  const mismatched = '| Inhalt |\n| --- |\n| Anna Berger Geburtsdatum: [FIELD_REDACTED] \\|';
  assert.ok(scanResidual(mismatched, 'general', [], options).some(row => row.type === 'SENSITIVE_FIELD'));
  assert.ok(scanResidual('| Inhalt | Fachtext |\n| --- | --- |\n| Anna Berger Geburtsdatum: [FIELD_REDACTED]\rUnternehmen: Qvx | HTTP/2 31415 |',
    'general', [], options).some(row => row.type === 'SENSITIVE_FIELD'), 'a later actual cell continuation is still part of its protected value');
  const email = '| Inhalt | Fachtext |\n| --- | --- |\n| anna@example.invalid Geburtsdatum: [FIELD_REDACTED] | HTTP/2 31415 |';
  assert.ok(scanResidual(email, 'general', [], options).some(row => row.type === 'EMAIL'));
  const credential = '| Inhalt | Fachtext |\n| --- | --- |\n| Anna Berger Geburtsdatum: [FIELD_REDACTED] | HTTP/2 31415 |\n\nPasswort: synthetic-test-secret-4711';
  assert.ok(scanResidual(credential, 'general', [], options).some(row => row.type === 'CREDENTIAL'),
    'qualifier ownership grants no exemption to an actual independently supported credential field');
});

test('RGI-only qualifier discovery binds real supplementary-character occurrences without adopting outside text', () => {
  const table = prefix => `| Inhalt | Fachtext |\n| --- | --- |\n| ${prefix}Anna Berger Geburtsdatum: [FIELD_REDACTED] | HTTP/2 31415 |`;
  const input = '😀 Anna Berger\n\n' + table('👩🏽‍💻 ') + '\n\n' + table('🇩🇪 ') + '\n\n😀 Anna Berger';
  const basis = canonicalizeRenderedText(input, 'content-person-fields/1');
  const actual = scanResidual(basis, 'general', [], {...options, includePersonCandidateSpans: true});
  const candidates = actual.filter(row => row.type === 'PERSON_CANDIDATE' && row.text === 'Anna Berger');
  const occurrences = [...basis.matchAll(/Anna Berger/gu)].map(match => match.index);
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map(row => row.start), occurrences.slice(1, 3));
  for (const row of candidates) assert.equal(basis.slice(row.start, row.end), row.text);
  const unbound = '| Inhalt | Fachtext |\n| --- | --- |\n| 👩🏽‍💻 Anna\u2028Berger Geburtsdatum: [FIELD_REDACTED] | HTTP/2 31415 |';
  const unboundBasis = canonicalizeRenderedText(unbound, 'content-person-fields/1');
  const findings = scanResidual(unboundBasis, 'general', [], {...options, includePersonCandidateSpans: true});
  const raw = findings.find(row => row.type === 'PERSON_CANDIDATE' && row.text ===
    canonicalizeRenderedText('👩🏽‍💻 Anna\u2028Berger', 'content-person-fields/1'));
  assert.ok(raw); assert.equal(unboundBasis.slice(raw.start, raw.end), raw.text);
  assert.equal(unboundBasis.slice(raw.end).trimStart().startsWith('Geburtsdatum:'), true);
});

test('qualifier decoration view accepts actual RGI clusters but never trims arbitrary punctuation, words or bare numbers', () => {
  const table = prefix => `| Inhalt | Fachtext |\n| --- | --- |\n| ${prefix}Anna Berger Geburtsdatum: [FIELD_REDACTED] | HTTP/2 31415 |`;
  for (const prefix of ['😀 ', '👩🏽‍💻 ', '🇩🇪 ', '1️⃣ ', '❤️ ', '😀\t🇩🇪 ', '😀 '.repeat(4096)]) {
    const basis = canonicalizeRenderedText(table(prefix), 'content-person-fields/1');
    const actual = scanResidual(basis, 'general', [], {...options, includePersonCandidateSpans: true});
    const found = actual.filter(row => row.type === 'PERSON_CANDIDATE' && row.text === 'Anna Berger');
    assert.equal(found.length, 1, 'complete RGI prefix exposes the existing weak hypothesis once');
    assert.equal(basis.slice(found[0].start, found[0].end), 'Anna Berger');
  }
  for (const prefix of ['1 ', '§ ', '— ', '() ']) {
    assert.equal(scanResidual(table(prefix), 'general', [], {...options, includePersonCandidateSpans: true})
      .filter(row => row.type === 'PERSON_CANDIDATE').length, 0, 'no arbitrary prefix stripping invents a name view');
  }
  const technical = '| Inhalt | Fachtext |\n| --- | --- |\n| 😀 FHIR REST 31415 Geburtsdatum: [FIELD_REDACTED] | HTTP/2 31415 |';
  assert.equal(scanResidual(technical, 'general', [], {...options, includePersonCandidateSpans: true})
    .filter(row => row.type === 'PERSON_CANDIDATE').length, 0, 'words/numbers are never removed to manufacture a person hypothesis');
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require.resolve('../plugins/data-secure/server/privacy/engine'), 'utf8');
  const expression = /const leadingQualifierEmoji = ([^\r\n]+);/u.exec(source); assert.ok(expression);
  const actualRecognizer = vm.runInNewContext(expression[1]);
  assert.equal(actualRecognizer.exec('😀\u200dAnna Berger')[0], '😀', 'the added recognizer itself never consumes an unsupported standalone joiner');
  for (const prefix of ['1 ', '§ ', '— ', '() ', 'FHIR REST 31415']) assert.equal(actualRecognizer.exec(prefix), null);
});

(async () => {
  const {fromMarkdown}=await import('../native/markdown/pilot/node_modules/mdast-util-from-markdown/index.js');
  const {parseFragment}=await import('../native/markdown/pilot/node_modules/parse5/dist/index.js');
  for(const markdownOutput of ['content-v1','notes-v1'])for(const profile of ['general','personnel_profile'])
    for(const label of ['Name','Unternehmen','Geschützter Tabellenwert'])
      for(const marker of ['[PERSON_DENISEKOCH]','&#91;PERSON_DENISEKOCH&#93;','\\[PERSON\\_DENISEKOCH\\]'])await testAsync(
      `${markdownOutput}/${profile}/${label}/${marker}: imported variable source tokens cannot become field Keep approvals`,async()=>{
        const contentOptions={...options.contentOptions,markdownOutput},consumerOptions={productChannel:'standalone',contentOptions};
        const source=cell(label,marker)+'\n\n'+cell('Fachtext','FHIR'),bytes=Buffer.from(source),before=Buffer.from(bytes);
        const {extractSourceForPrivacy}=require('../plugins/data-secure/server/core/markdown-first-privacy');
        const {extractMarkdownBuffer}=require('../plugins/data-secure/server/standalone/markdown-extractor');
        const {createMarkdownExtraction}=require('../plugins/data-secure/server/standalone/markdown-contract');
        const {verifyAnonymizedPublication}=require('../plugins/data-secure/server/standalone/anonymized-artifact');
        const extracted=await extractSourceForPrivacy(bytes,'.md',{contentOptions,convertBuffer:async input=>{
          // The owned synchronous extractor deliberately refuses content-v1
          // MD. Use its real notes basis plus the actual pinned content parser,
          // as the source worker does; never waive that admission guard.
          const actual=extractMarkdownBuffer(input,'.md',{});
          const markdown=markdownOutput==='content-v1'?require('../plugins/data-secure/server/standalone/markdown-image-content')
            .markdownImageContent(actual.markdown,{fromMarkdown,parseFragment}).markdown:actual.markdown;
          return createMarkdownExtraction({source_type:'md',markdown,coverage:actual.coverage,content_options:contentOptions});
        }});
        const prepared=prepareTextPrivacyReview({text:extracted.markdown,profile,productChannel:'standalone',consumerOptions,
          registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
        assert.equal(prepared.ambiguities.length,0,'strong source field is safely masked, not a weak-prose review');
        const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'});
        const final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
        assert.doesNotMatch(final.markdown,/DENISEKOCH/u);assert.match(final.markdown,/FIELD_REDACTED/u);
        assert.match(final.markdown,/FHIR/u);assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
        const proofInput={markdown:final.markdown,profile,content_options:contentOptions,source_extraction:extracted.sourceExtraction,
          dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates};
        assert.ok(verifyAnonymizedPublication(proofInput));
        const entities=initialEntities({markdown:final.markdown,transform_trace:final.transform_trace});
        const target=entities.find(row=>row.original.includes('DENISEKOCH'));assert.ok(target);
        const kept=applyEntityDecisions(final.markdown,entities,[{entity_id:target.entity_id,decision:'keep'}],Buffer.alloc(32,8));
        const keepProof=require('../plugins/data-secure/server/privacy/residual-person-review').bindStandaloneDocumentKeeps(kept.markdown,[],
          kept.entities.filter(row=>row.decision==='keep').map(({start,end})=>({start,end})));
        assert.ok(scanResidual(kept.markdown,profile,final.dictionary,{...consumerOptions,
          originalSourceText:source,reviewedPersonCandidates:keepProof}).some(row=>row.type==='SENSITIVE_FIELD'));
        assert.throws(()=>verifyAnonymizedPublication({...proofInput,markdown:kept.markdown,reviewed_person_candidates:keepProof}),
          {code:'STANDALONE_PUBLICATION_INVALID'});
        assert.deepEqual(bytes,before);
        // Newly created variable labels and fixed masks remain legitimate;
        // only actual imported variable payloads retain the strong source duty.
        assert.deepEqual(scanResidual(cell(label,'[PERSON_009] [FIELD_REDACTED]'),profile,[],{
          ...consumerOptions,originalSourceText:source}),[]);
      });
  await testAsync('actual prepare/review/finalize retains multiline input and replay', async () => {
    const source = cell('Name', 'Qvx<br>Qvy') + '\n\n' + cell('Fachtext', 'FHIR');
    const prepared = prepareTextPrivacyReview({ text: source, profile: 'general', productChannel: 'standalone',
      consumerOptions: options, captureTrace: true });
    const reviewed = await resolveTextPrivacyReview(prepared, null, { reviewPolicy: 'automatic-conservative' });
    const final = finalizeTextPrivacyReview(prepared, reviewed, { prefix: '', suffix: '' });
    assert.doesNotMatch(final.markdown, /Qvx|Qvy/u);
    assert.match(final.markdown, /FHIR/u);
    assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
    assert.ok(entityPlanFromTrace(final.transform_trace).occurrences.length > 0);
  });
  await testAsync('actual review/finalize does not accept header collision leak',async()=>{
    const source=cell('Name','Name')+'\n\n'+cell('Name','Qvx / Qvy');
    const prepared=prepareTextPrivacyReview({text:source,profile:'general',productChannel:'standalone',consumerOptions:options,captureTrace:true});
    const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'});
    const final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
    assert.doesNotMatch(final.markdown,/Qvx|Qvy/u);
    assert.match(final.markdown,/FIELD_REDACTED/u);
    assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
  });
  done();
})().catch(error => { console.error(error); process.exitCode = 1; });
