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
