'use strict';

// Bounded pure projection + unchanged real source/privacy/publication chain.
// Native Office/UI coverage and the Main OOXML owner integration are separate.
const {createSuite}=require('./helpers');
const {readOfficeMath,isOfficeMathResult,officeMathSourceScopes,LIMITS}=require('../plugins/data-secure/server/office-math');
const {mathMarkdown,mathParagraphMarkdown,MAX_OUTPUT_CHARS}=require('../plugins/data-secure/server/office-math-projection');
const {literalTableCell}=require('../plugins/data-secure/server/core/markdown-literal-content');
const {extractSourceForPrivacy}=require('../plugins/data-secure/server/core/markdown-first-privacy');
const {createMarkdownExtraction}=require('../plugins/data-secure/server/standalone/markdown-contract');
const {prepareTextPrivacyReview,resolveTextPrivacyReview,finalizeTextPrivacyReview}=require('../plugins/data-secure/server/gateway/privacy-text-operation');
const {verifyAnonymizedPublication}=require('../plugins/data-secure/server/standalone/anonymized-artifact');
const {initialEntities,applyEntityDecisions}=require('../plugins/data-secure/server/gateway/standalone-entity-review');
const {scanResidual}=require('../plugins/data-secure/server/privacy/engine');
const {replayTransformTrace}=require('../plugins/data-secure/server/privacy/transform-plan');
const {makeRegistry}=require('../plugins/data-secure/server/privacy/entities');
const {zipStore}=require('./lib/zip');
const {opcControlEntries}=require('./lib/opc');
const {test,testAsync,assert,done}=createSuite('OfficeMath reader-owned source projection');
const M='http://schemas.openxmlformats.org/officeDocument/2006/math';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
const MC='http://schemas.openxmlformats.org/markup-compatibility/2006';
const xml=value=>value.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/"/gu,'&quot;').replace(/\r/gu,'&#13;');
const run=value=>`<m:r><m:t xml:space="preserve">${xml(value)}</m:t></m:r>`;
const root=body=>`<m:oMath xmlns:m="${M}" xmlns:w="${W}" xmlns:a="${A}" xmlns:mc="${MC}">${body}</m:oMath>`;
const read=body=>readOfficeMath(root(body));
const arg=(key,value)=>`<m:${key}>${run(value)}</m:${key}>`;
const fraction=value=>`<m:f>${arg('num',value)}${arg('den','FHIR REST 123')}</m:f>`;
// The production literal-cell serializer. Prose uses the same hard linebreak
// convention as the fixed Office caller, not a source-provided callback.
const escapeText=(value,inCell)=>inCell?literalTableCell(value):literalTableCell(value).replace(/<br>/gu,'  \n');
const project=body=>mathMarkdown(read(body),escapeText);
const contentOptions={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false};
const once=(text,value)=>assert.equal(text.split(value).length-1,1,value);

test('adjacent source runs/formatting coalesce without changing legacy text/rawText',()=>{
 const result=read(run('Name: ')+`<m:r><m:rPr><m:sty m:val="b"/></m:rPr><m:t>Qvx / Qvy</m:t></m:r>`);
 assert.equal(result.rawText,'Name: Qvx / Qvy');assert.equal(result.text,'Name: Qvx / Qvy');
 assert.deepEqual(result.segments,[{kind:'source',text:'Name: Qvx / Qvy'}]);
 assert.ok(isOfficeMathResult(result));assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.segments));
 assert.ok(result.segments.every(Object.isFrozen));assert.throws(()=>{result.segments[0].text='forged';});
 once(mathMarkdown(result,escapeText),'Qvx / Qvy');
});
test('actual source breaks/CR stay in the same argument; historical Word tab projection is unchanged',()=>{
 const result=read(`<m:r><w:t>Name:</w:t><w:br/><w:t>Qvx&#13;Qvy</w:t><w:tab/><w:t>Qvz</w:t></m:r>`);
 assert.deepEqual(result.segments,[{kind:'source',text:'Name:\nQvx\rQvy Qvz'}]);
 assert.match(mathMarkdown(result,escapeText),/Name:<br>Qvx&#13;Qvy Qvz/u);
 const literalTab=read(run('Name: Qvx\tQvy'));
 assert.equal(literalTab.segments[0].text,'Name: Qvx\tQvy');assert.match(mathMarkdown(literalTab,escapeText),/Qvx&#9;Qvy/u);
});
test('generated roles separate sibling arguments without duplicating source or inventing headers',()=>{
 const result=read(fraction('Name: Qvx / Qvy')),markdown=mathMarkdown(result,escapeText);
 assert.deepEqual(result.segments.filter(s=>s.kind==='source').map(s=>s.text),['Name: Qvx / Qvy','FHIR REST 123']);
 assert.equal(result.segments.map(s=>s.text).join(''),result.rawText);
 once(markdown,'Name: Qvx / Qvy');once(markdown,'FHIR REST 123');
 assert.equal(markdown.split('| Inhalt |').length-1,2);assert.doesNotMatch(markdown,/\| (?:Name|Person|Geschützter Tabellenwert) \|/u);
 assert.match(markdown,/Zähler/u);assert.match(markdown,/Nenner/u);assert.doesNotMatch(markdown,/\0/u);
});
test('foreign/unknown wrappers and model.extras keep source provenance distinct from generated labels',()=>{
 for(const body of [`<m:future>${run('Name: Qvx / Qvy')}</m:future>`,`<f:future xmlns:f="urn:future">${run('Name: Qvx / Qvy')}</f:future>`,
 `<m:f>${arg('num','1')}${arg('den','2')}${run('Name: Qvx / Qvy')}</m:f>`]){
  const result=read(body),markdown=mathMarkdown(result,escapeText);assert.equal(result.complete,false);
  assert.ok(result.segments.some(s=>s.kind==='source'&&s.text==='Name: Qvx / Qvy'));
  once(markdown,'Name: Qvx / Qvy');assert.match(markdown,/\| Inhalt \|/u);
 }
});
test('only genuine operands separate source fragments; warning and format wrappers do not',()=>{
 for(const wrapper of [value=>`<m:future>${value}</m:future>`,value=>`<f:future xmlns:f="urn:future">${value}</f:future>`]){
  const result=read(run('Name: ')+wrapper(run('Qvx / '))+run('Qvy')),markdown=mathMarkdown(result,escapeText);
  assert.equal(markdown.split('| Inhalt |').length-1,1);once(markdown,'Name: Qvx / Qvy');
  const context=officeMathSourceScopes(result);assert.ok(Object.isFrozen(context));assert.ok(Object.isFrozen(context.groups));
  assert.ok(Object.isFrozen(context.scopes));assert.ok(Object.isFrozen(context.parents));
  assert.throws(()=>{context.parents[0]=99;});
 }
});
test('selected MC source runs remain contiguous and unselected source has no segment',()=>{
 const result=read(`<mc:AlternateContent><mc:Choice Requires="m">${run('Name: ')}${run('Qvx / Qvy')}</mc:Choice><mc:Fallback>${run('UNSELECTED')}</mc:Fallback></mc:AlternateContent>`);
 assert.deepEqual(result.segments,[{kind:'source',text:'Name: Qvx / Qvy'}]);assert.equal(result.complete,true);
});
for(const ns of [A,'http://purl.oclc.org/ooxml/drawingml/main'])test(`real DrawingML rPr is metadata only: ${ns}`,()=>{
 const result=read(`<m:r><a:rPr xmlns:a="${ns}" lang="de-DE"><a:latin typeface="Cambria Math"/></a:rPr><m:t>Name: Qvx</m:t></m:r>`);
 assert.equal(result.complete,true);assert.equal(result.rawText,'Name: Qvx');assert.deepEqual(result.segments,[{kind:'source',text:'Name: Qvx'}]);
 assert.doesNotMatch(mathMarkdown(result,escapeText),/Nicht unterstützter/u);
});
test('real text cannot disappear in DrawingML properties and a false namespace stays unsupported',()=>{
 for(const payload of ['<a:t>SOURCE_SECRET</a:t>','<m:t>SOURCE_SECRET</m:t>','SOURCE_SECRET'])
  assert.throws(()=>read(`<m:r><a:rPr>${payload}</a:rPr><m:t>CONTROL</m:t></m:r>`),{code:'OFFICE_MATH_INVALID'});
 const result=read('<m:r><a:rPr xmlns:a="urn:foreign"/><m:t>CONTROL</m:t></m:r>');assert.equal(result.complete,false);
});
test('XML cannot smuggle private segment markers and none reaches any public string',()=>{
 for(const payload of ['\0s\0','&#0;s&#0;','&#x0;e&#x0;'])assert.throws(()=>read(`<m:r><m:t>${payload}</m:t></m:r>`),{code:'OFFICE_MATH_INVALID'});
 const result=read(run('[PERSON_001] & < > \\ \u00e4\u00f6\u00fc\u00df 😀'));
 assert.doesNotMatch(JSON.stringify(result),/\\u0000/u);assert.equal(result.segments.map(s=>s.text).join(''),result.rawText);
});
test('marker bookkeeping neither consumes valid output allowance nor relaxes the real output guard',()=>{
 const accepted=read(run('&'.repeat(Math.floor(LIMITS.output/5))));
 assert.ok(accepted.text.length<=LIMITS.output);assert.equal(accepted.segments[0].text.length,Math.floor(LIMITS.output/5));
 assert.throws(()=>read(run('&'.repeat(Math.floor(LIMITS.output/5)+1))),{code:'OFFICE_MATH_LIMIT'});
});
test('paragraph projection binds exact duplicate spans after UTF16 surrogate pairs',()=>{
 const first=read(fraction('Name: Qvx / Qvy')),second=read(run('TECHNICAL FHIR'));
 const raw='😀 BEFORE '+first.rawText+' BETWEEN '+second.rawText+' AFTER',start='😀 BEFORE '.length,next=start+first.rawText.length+' BETWEEN '.length;
 const rendered=mathParagraphMarkdown(raw,[{start,end:start+first.rawText.length,result:first},{start:next,end:next+second.rawText.length,result:second}],escapeText);
 for(const value of ['😀 BEFORE','Qvx / Qvy','BETWEEN','TECHNICAL FHIR','AFTER'])once(rendered,value);
 assert.match(rendered,/😀 BEFORE[\s\S]*Qvx \/ Qvy[\s\S]*BETWEEN[\s\S]*TECHNICAL FHIR[\s\S]*AFTER/u);
});
test('zero-length formulas do not create phantom source cells',()=>{
 const empty=read('');assert.deepEqual(empty.segments,[]);assert.equal(mathMarkdown(empty,escapeText),'');
 assert.equal(mathParagraphMarkdown('CONTROL',[{start:0,end:0,result:empty}],escapeText),'CONTROL');
});
test('forged/serialized result and invalid/nonordered paragraph provenance fail closed',()=>{
 const result=read(run('X')),span={start:0,end:1,result};
 for(const forged of [null,{},Object.freeze({...result}),JSON.parse(JSON.stringify(result)),new Proxy(result,{})])
  assert.throws(()=>mathMarkdown(forged,escapeText),{code:'OFFICE_MATH_PROJECTION_INVALID'});
 for(const spans of [[{...span,start:-1}],[{...span,end:2}],[{...span,end:0}],[{...span,start:0.1}],[{...span,extra:true}],
   [{start:1,end:2,result},{...span}],Array(1),new Proxy([span],{}),[{...span,result:JSON.parse(JSON.stringify(result))}]])
  assert.throws(()=>mathParagraphMarkdown('XX',spans,escapeText),{code:'OFFICE_MATH_PROJECTION_INVALID'});
 assert.throws(()=>mathParagraphMarkdown('Y',[span],escapeText),{code:'OFFICE_MATH_PROJECTION_INVALID'});
});
test('getters/proxies/foreign prototypes/custom array keys are not invoked or silently accepted',()=>{
 let calls=0;const result=read(run('X')),span={start:0,end:1,result};
 const getter={start:0,end:1,get result(){calls++;return result;}},array=[span];
 Object.defineProperty(array,'0',{get(){calls++;return span;}});
 const custom=[span];custom.extra=true;
 for(const spans of [[getter],array,custom,[Object.assign(Object.create(null),span)]])
  assert.throws(()=>mathParagraphMarkdown('X',spans,escapeText),{code:'OFFICE_MATH_PROJECTION_INVALID'});
 assert.throws(()=>mathParagraphMarkdown({get length(){calls++;return 1;}},[],escapeText),{code:'OFFICE_MATH_PROJECTION_INVALID'});
 assert.equal(calls,0);
});
test('Unicode, output/scope budgets, callback shape and fixed caller error mapping remain strict',()=>{
 const result=read(run('X'));
 assert.throws(()=>mathParagraphMarkdown('\ud800',[],escapeText),{code:'OFFICE_MATH_PROJECTION_INVALID'});
 assert.throws(()=>mathParagraphMarkdown('\0',[],escapeText),{code:'OFFICE_MATH_PROJECTION_INVALID'});
 assert.throws(()=>mathParagraphMarkdown('X',Array(100001),escapeText),{code:'OFFICE_MATH_PROJECTION_LIMIT'});
 assert.throws(()=>mathMarkdown(result,()=>null),{code:'OFFICE_MATH_PROJECTION_INVALID'});
 assert.throws(()=>mathMarkdown(result,()=> 'x'.repeat(MAX_OUTPUT_CHARS)),{code:'OFFICE_MATH_PROJECTION_LIMIT'});
 const errorFactory=limit=>Object.assign(new Error('fixed'),{code:limit?'DOCX_STRUCTURE_LIMIT':'DOCX_STRUCTURE_UNSAFE'});
 assert.throws(()=>mathMarkdown({},escapeText,errorFactory),{code:'DOCX_STRUCTURE_UNSAFE'});
 assert.throws(()=>mathMarkdown(result,()=> 'x'.repeat(MAX_OUTPUT_CHARS),errorFactory),{code:'DOCX_STRUCTURE_LIMIT'});
 assert.throws(()=>mathParagraphMarkdown('XX',[{start:0,end:1,result},{start:1,end:2,result:read(run('X'))}],()=> 'x'.repeat(4000000)),{code:'OFFICE_MATH_PROJECTION_LIMIT'});
});

const cases=[
 ['modelled fraction',fraction('Name: Qvx / Qvy')],
 ['unknown Math wrapper',`<m:f><m:num><m:future>${run('Name: Qvx / Qvy')}</m:future></m:num>${arg('den','FHIR REST 123')}</m:f>`],
 ['foreign wrapper',`<m:f><m:num><f:future xmlns:f="urn:future">${run('Name: Qvx / Qvy')}</f:future></m:num>${arg('den','FHIR REST 123')}</m:f>`],
 ['model extras',`<m:f>${arg('num','FHIR REST 123')}${arg('den','2')}${run('Name: Qvx / Qvy')}</m:f>`],
 ['unknown split scope',run('Name: ')+`<m:future>${run('Qvx / ')}</m:future>`+run('Qvy')],
 ['foreign split scope',run('Name: ')+`<f:future xmlns:f="urn:future">${run('Qvx / ')}</f:future>`+run('Qvy')],
 ['nested Name scope protects children, not outer denominator',`<m:f><m:num>${run('Name: ')}<m:f>${arg('num','Qvx')}${arg('den','Qvy')}</m:f></m:num>${arg('den','FHIR REST 123')}</m:f>`],
 ['actual source metadata before nested Name scope',`<m:f><m:num>${run('Formel: Gespeicherter Wert: Full Name (1): ')}<m:f>${arg('num','Qvx')}${arg('den','Qvy')}</m:f></m:num>${arg('den','FHIR REST 123')}</m:f>`],
 ['late Name scope cannot mask previous child operands',`<m:f><m:num><m:f>${arg('num','FHIR REST 123')}${arg('den','2')}</m:f>${run('Name: Qvx / Qvy')}</m:num>${arg('den','OTHER FACT')}</m:f>`],
 ['root Name owns a following whole formula',run('Name: ')+`<m:f>${arg('num','Qvx')}${arg('den','Qvy')}</m:f>`],
 ['genuine paragraph Name owns whole formula',`<m:f>${arg('num','Qvx')}${arg('den','Qvy')}</m:f>`,'Name: '],
 ['later genuine paragraph Name does not own earlier technical math',`<m:f>${arg('num','Qvx')}${arg('den','Qvy')}</m:f>`,'Name: ',true],
 ['genuine Name prose tail preserves earlier technical math',run('FHIR REST 123'),'',false,' Name: Qvx / Qvy'],
 ['split source runs',run('Name: ')+run('Qvx / ')+run('Qvy')],
 ['source CR field',fraction('Name: Qvx\rQvy')],
 ['source newline field',fraction('Name:\nQvx / Qvy')],
 ['qualified source label',fraction('Full Name (1) (2): Qvx / Qvy')],
 ['escaped source pipe',fraction('Name: Qvx|Qvy')],
 ['literal source pseudonym cannot gain a new exemption',fraction('Name: [PERSON_001] Qvx / Qvy')]
];
for(const profile of ['general','personnel_profile'])for(const [name,body,prefix='',late=false,tail='']of cases)testAsync(`${profile}: ${name} -> actual privacy/replay/publication/Keep refusal`,async()=>{
 const xmlSource=root(body),result=readOfficeMath(xmlSource),first=late?read(run('FHIR REST 123')):null;
 const leading=first?first.rawText+' ':'',end=leading.length+prefix.length+result.rawText.length,raw=leading+prefix+result.rawText+tail;
 const spans=[...(first?[{start:0,end:first.rawText.length,result:first}]:[]),{start:leading.length+prefix.length,end,result}];
 const markdown=prefix||tail?mathParagraphMarkdown(raw,spans,escapeText):mathMarkdown(result,escapeText);
 const bytes=zipStore([...opcControlEntries('docx'),['word/document.xml',`<w:document xmlns:w="${W}"><w:body><w:p>${late?root(run('FHIR REST 123')):''}${prefix?`<w:r><w:t>${xml((late?' ':'')+prefix)}</w:t></w:r>`:''}${xmlSource}${tail?`<w:r><w:t>${xml(tail)}</w:t></w:r>`:''}</w:p></w:body></w:document>`]]),before=Buffer.from(bytes);
 // The separately integrated Main parser will call these same pure functions.
 // This test intentionally supplies that fixed projection as the converter;
 // it is not a claim that the unmodified Main parser already stores spans.
 const source=await extractSourceForPrivacy(bytes,'.docx',{contentOptions,convertBuffer:async()=>createMarkdownExtraction({source_type:'docx',markdown,
   coverage:{status:'incomplete',reason_codes:['SOURCE_COVERAGE_UNVERIFIED']},content_options:contentOptions})});
 const prepared=prepareTextPrivacyReview({text:source.markdown,profile,productChannel:'standalone',consumerOptions:{productChannel:'standalone',contentOptions},registry:makeRegistry(),captureTrace:true});
 const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'}),final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
 assert.doesNotMatch(final.markdown,/Qvx|Qvy/u);if(markdown.includes('FHIR REST 123'))assert.match(final.markdown,/FHIR REST 123/u);
 assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
 assert.deepEqual(scanResidual(final.markdown,profile,final.dictionary,{productChannel:'standalone',contentOptions,originalSourceText:source.markdown}),[]);
 const proof={markdown:final.markdown,profile,content_options:contentOptions,source_extraction:source.sourceExtraction,dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates};
 assert.ok(verifyAnonymizedPublication(proof));
 const entities=initialEntities({markdown:final.markdown,transform_trace:final.transform_trace}),target=entities.find(value=>value.original.includes('Qvx'));
 assert.ok(target);const kept=applyEntityDecisions(final.markdown,entities,[{entity_id:target.entity_id,decision:'keep'}],Buffer.alloc(32,9));
 assert.ok(kept.markdown.includes('Qvx'));assert.ok(scanResidual(kept.markdown,profile,final.dictionary,{productChannel:'standalone',contentOptions,originalSourceText:source.markdown}).length>0);
 assert.throws(()=>verifyAnonymizedPublication({...proof,markdown:kept.markdown}),{code:'STANDALONE_PUBLICATION_INVALID'});
 assert.deepEqual(bytes,before);
});
test('technical-only source operands receive neutral cells, not sensitive headers or fake identities',()=>{
 const markdown=project(`<m:func><m:fName>${run('sin')}</m:fName><m:e>${run('FHIR REST HL7 123')}</m:e></m:func>`);
 const transformed=require('../plugins/data-secure/server/privacy/engine').anonymize(markdown,'general',{productChannel:'standalone',contentOptions,captureTransformPlan:true});
 assert.match(transformed.text,/sin/u);assert.match(transformed.text,/FHIR REST HL7 123/u);assert.deepEqual(transformed.dictionary,[]);
 assert.doesNotMatch(markdown,/\| (?:Name|Person|Geschützter Tabellenwert) \|/u);
});
done();
