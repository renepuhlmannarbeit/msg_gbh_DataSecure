'use strict';
const {createSuite}=require('./helpers');
const {readXml}=require('../plugins/data-secure/server/xml-reader');
const {readOfficeMath,createOfficeMathCollector,MATH_NAMESPACES,LIMITS}=require('../plugins/data-secure/server/office-math');
const {anonymize,scanResidual}=require('../plugins/data-secure/server/privacy/engine');
const {canonicalizeRenderedText}=require('../plugins/data-secure/server/privacy/base');
const {replayTransformTrace}=require('../plugins/data-secure/server/privacy/transform-plan');
const {initialEntities,applyEntityDecisions}=require('../plugins/data-secure/server/gateway/standalone-entity-review');
const {prepareTextPrivacyReview,resolveTextPrivacyReview,finalizeTextPrivacyReview}=require('../plugins/data-secure/server/gateway/privacy-text-operation');
const {test,testAsync,assert,done}=createSuite('Closed Office Math projection');
const M=MATH_NAMESPACES[0],MC='http://schemas.openxmlformats.org/markup-compatibility/2006',W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const x=s=>s.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/"/gu,'&quot;');
const run=s=>`<m:r><m:t xml:space="preserve">${x(s)}</m:t></m:r>`;
const arg=(tag,s)=>`<m:${tag}>${run(s)}</m:${tag}>`;
const formula=(body,ns=M)=>`<m:oMath xmlns:m="${ns}" xmlns:w="${W}" xmlns:mc="${MC}">${body}</m:oMath>`;
const read=body=>readOfficeMath(formula(body));
const compact=r=>r.rawText.replace(/\n/gu,'');
const frac=(a,b)=>`<m:f>${arg('num',a)}${arg('den',b)}</m:f>`;
const invalid=body=>assert.throws(()=>read(body),e=>e.code==='OFFICE_MATH_INVALID'&&e.message==='OFFICE_MATH_INVALID');
const options={productChannel:'standalone',contentOptions:{schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false},captureTransformPlan:true};

test('actual numerator/denominator source leaves retain separate roles, never ab concatenation',()=>{
 const r=read(frac('NumeratorX','DenominatorY'));assert.equal(compact(r),'Bruch (Zähler: (NumeratorX); Nenner: (DenominatorY))');
 assert.ok(r.rawText.includes('\nNumeratorX\n'));assert.ok(r.rawText.includes('\nDenominatorY\n'));
 assert.equal(r.complete,true);assert.deepEqual(r.reasons,[]);assert.ok(Object.isFrozen(r));
 for(const s of ['NumeratorX','DenominatorY'])assert.equal(r.rawText.split(s).length-1,1);
});
for(const type of ['bar','lin','skw','noBar'])test(`fraction subtype ${type} retains both operands`,()=>{
 const r=read(`<m:f><m:fPr><m:type m:val="${type}"/></m:fPr>${arg('num','A')}${arg('den','B')}</m:f>`);
 assert.ok(compact(r).includes('Zähler: (A)'));assert.ok(compact(r).includes('Nenner: (B)'));assert.equal(r.complete,true);
 if(type==='noBar')assert.ok(r.rawText.startsWith('Bruch ohne Bruchstrich'));
});
for(const [kind,slots] of [['sSub',['e','sub']],['sSup',['e','sup']],['sSubSup',['e','sub','sup']],['sPre',['sub','sup','e']]])test(`${kind} binds original script roles`,()=>{
 const r=read(`<m:${kind}>${slots.map(s=>arg(s,s==='e'?'SOURCEBASE':s==='sub'?'SOURCELOW':'SOURCEHIGH')).join('')}</m:${kind}>`);
 for(const s of slots)assert.equal(r.rawText.split(s==='e'?'SOURCEBASE':s==='sub'?'SOURCELOW':'SOURCEHIGH').length-1,1);
 assert.equal(r.complete,true);
});
test('fraction used as exponent base is explicitly grouped',()=>{
 const r=read(`<m:sSup><m:e>${frac('x-c','v')}</m:e>${arg('sup','2')}</m:sSup>`);
 assert.equal(compact(r),'Index (Basis: (Bruch (Zähler: (x-c); Nenner: (v))); hoch: (2))');
});
for(const prop of ['', '<m:degHide/>','<m:degHide m:val="0"/>','<m:degHide m:val="1"/>'])test(`radical degree presence/default ${prop}`,()=>{
 const r=read(`<m:rad><m:radPr>${prop}</m:radPr>${arg('deg','3')}${arg('e','x+1')}</m:rad>`);
 assert.ok(compact(r).includes('Radikand: (x+1)'));assert.ok(compact(r).includes(': (3)'));assert.equal(r.complete,true);
 assert.equal(r.rawText.includes('ausgeblendet'),prop.includes('Hide')&&!prop.includes('"0"'));
});
test('empty hidden square-root degree is a valid actual argument, not a fabricated numeral',()=>{
 const r=read(`<m:rad><m:radPr><m:degHide/></m:radPr><m:deg/>${arg('e','x')}</m:rad>`);assert.equal(r.complete,true);assert.ok(!r.rawText.includes('(2)'));
});
for(const glyph of [undefined,'∑','∫','∏','⨀'])test(`n-ary actual operator ${glyph}`,()=>{
 const p=glyph===undefined?'':`<m:naryPr><m:chr m:val="${glyph}"/><m:limLoc m:val="undOvr"/></m:naryPr>`;
 const r=read(`<m:nary>${p}${arg('sub','i=1')}${arg('sup','n')}${arg('e','xᵢ')}</m:nary>`);
 assert.ok(r.rawText.includes(glyph||'∫'));assert.ok(compact(r).includes('Untergrenze: (i=1)'));assert.ok(compact(r).includes('Obergrenze: (n)'));assert.equal(r.complete,true);
});
for(const kind of ['limLow','limUpp'])test(`${kind} keeps a real lower/upper limit association`,()=>{
 const r=read(`<m:${kind}>${arg('e','lim')}${arg('lim','x→0')}</m:${kind}>`);assert.ok(compact(r).includes('Limit: (x→0)'));assert.equal(r.complete,true);
});
test('delimiter defaults, two arguments and empty explicit delimiter do not lose source text',()=>{
 const a=read(`<m:d>${arg('e','LEFT')}${arg('e','RIGHT')}</m:d>`);assert.equal(compact(a),'Klammerung ((LEFT|RIGHT))');
 const b=read(`<m:d><m:dPr><m:begChr/><m:endChr m:val="]"/><m:sepChr m:val=";"/></m:dPr>${arg('e','LEFT')}${arg('e','RIGHT')}</m:d>`);
 assert.equal(compact(b),'Klammerung (LEFT;RIGHT])');assert.equal(b.complete,true);
});
test('function names remain visible plain text instead of guessed macros',()=>{
 const r=read(`<m:func>${arg('fName','log')}${arg('e','x')}</m:func>`);assert.equal(compact(r),'Funktion (Name: (log); Argument: (x))');assert.equal(r.complete,true);
 assert.doesNotMatch(r.text,/\\text|\$\$|\\log/u);
});
for(const kind of ['acc','bar','groupChr'])test(`${kind} retains its actual base text and symbol`,()=>{
 const props=kind==='acc'?'<m:chr m:val="→"/>':kind==='bar'?'<m:pos m:val="top"/>':'<m:chr m:val="→"/><m:pos m:val="top"/><m:vertJc m:val="bot"/>';
 const r=read(`<m:${kind}><m:${kind}Pr>${props}</m:${kind}Pr>${arg('e','VECTOR')}</m:${kind}>`);
 if(kind!=='bar')assert.ok(r.rawText.includes('→'));assert.ok(r.rawText.includes('VECTOR'));assert.equal(r.complete,true);
});
test('matrix cell positions and equation-array rows remain explicit, bounded and single-occurrence',()=>{
 const r=read(`<m:m><m:mr>${arg('e','CELL_A')}${arg('e','CELL_B')}</m:mr><m:mr>${arg('e','CELL_C')}${arg('e','CELL_D')}</m:mr></m:m>`);
 assert.equal(r.complete,true);assert.ok(compact(r).includes('Zeile 2: (Spalte 1: (CELL_C); Spalte 2: (CELL_D))'));
 for(const s of ['CELL_A','CELL_B','CELL_C','CELL_D'])assert.equal(r.rawText.split(s).length-1,1);
 const q=read(`<m:eqArr>${arg('e','a=b')}${arg('e','c=d')}</m:eqArr>`);assert.equal(q.complete,true);assert.equal(compact(q),'Gleichungsfolge (Zeile 1: (a=b); Zeile 2: (c=d))');
});
test('ragged matrix keeps exact source coordinates but is explicitly incomplete',()=>{
 const r=read(`<m:m><m:mr>${arg('e','A')}${arg('e','B')}</m:mr><m:mr>${arg('e','C')}</m:mr></m:m>`);assert.equal(r.complete,false);assert.ok(r.reasons.includes('OFFICE_MATH_UNSUPPORTED'));assert.ok(compact(r).includes('Zeile 2: (Spalte 1: (C))'));
});
test('paragraph math zones preserve their order and no text node appears twice',()=>{
 const r=readOfficeMath(`<m:oMathPara xmlns:m="${M}"><m:oMath>${run('FIRST')}</m:oMath><m:oMath>${run('SECOND')}</m:oMath></m:oMathPara>`);
 assert.equal(r.rawText,'FIRST\nSECOND');assert.equal(r.complete,true);
});
test('both expanded namespaces and arbitrary prefixes give the same mathematical model',()=>{
 for(const ns of MATH_NAMESPACES){const xml=formula(frac('äöüß','∑≤∞😀'),ns).replace(/(?<=<\/?|xmlns:)m:/gu,'q:');
  // Prefix changes apply to names, never to URI text.
  const alias=xml.replace(/xmlns:m=/u,'xmlns:q=');const r=readOfficeMath(alias);assert.ok(r.rawText.includes('äöüß'));assert.ok(r.rawText.includes('∑≤∞😀'));assert.equal(r.complete,true);
 }
});
test('XML entity and Markdown escaping preserve literal source exactly once',()=>{
 const s='Ä Ö Ü ß 😀 e\u0301 <script>x</script> &lt; \\input{file} [Anna] _x_ $math$ | `code`';const r=read(run(s));
 assert.equal(r.rawText,s);assert.ok(!r.text.includes('<script>'));assert.ok(r.text.includes('&lt;script&gt;'));assert.ok(r.text.includes('\\$math\\$'));assert.equal(r.complete,true);
});
test('math run formatting and actual Word text/breaks are not a hidden text channel',()=>{
 const r=read(`<m:r><m:rPr><m:nor/></m:rPr><w:rPr><w:b/></w:rPr><w:t>Anna Berger</w:t><w:br/><m:t>FHIR</m:t></m:r>`);
 assert.equal(r.rawText,'Anna Berger\nFHIR');assert.equal(r.complete,true);
});
test('unknown Math and foreign structures retain visible text once with incomplete coverage',()=>{
 for(const body of [`<m:future>${run('SOURCE_PERSON Anna Berger')}</m:future>`,`<f:future xmlns:f="urn:foreign"><f:t>SOURCE_PERSON Anna Berger</f:t></f:future>`]){
  const r=read(body);assert.equal(r.complete,false);assert.equal(r.rawText.split('SOURCE_PERSON Anna Berger').length-1,1);assert.deepEqual(r.reasons,['OFFICE_MATH_UNSUPPORTED']);
 }
});
test('one understood MC branch is used; unchosen source does not duplicate or flag',()=>{
 const c=`<mc:AlternateContent><mc:Choice Requires="m">${run('CHOSEN')}</mc:Choice><mc:Fallback><m:future>${run('NOT_CHOSEN')}</m:future></mc:Fallback></mc:AlternateContent>`;
 const r=read(c);assert.equal(r.rawText,'CHOSEN');assert.equal(r.complete,true);
 const f=read(c.replace('Requires="m"','Requires="future"').replace('<mc:Choice','<mc:Choice xmlns:future="urn:future"'));assert.equal(f.complete,false);assert.ok(f.rawText.includes('NOT_CHOSEN'));assert.ok(!f.rawText.replace('NOT_CHOSEN','').includes('CHOSEN'));
});
test('selected MC wrappers are transparent only for actual argument/run parent ownership',()=>{
 const choose=body=>`<mc:AlternateContent><mc:Choice Requires="m">${body}</mc:Choice><mc:Fallback><m:future>${run('UNSELECTED')}</m:future></mc:Fallback></mc:AlternateContent>`;
 const r=read(`<m:f>${choose(arg('num','REAL_NUM'))}${arg('den','REAL_DEN')}</m:f>`);
 assert.equal(r.complete,true);assert.ok(r.rawText.includes('REAL_NUM'));assert.ok(r.rawText.includes('REAL_DEN'));assert.ok(!r.rawText.includes('UNSELECTED'));
 const leaf=read(`<m:r>${choose('<m:t>REAL_LEAF</m:t>')}</m:r>`);assert.equal(leaf.complete,true);assert.equal(leaf.rawText,'REAL_LEAF');
});
test('collector uses actual source node and owner identities with no accidental prose extraction',()=>{
 const c=createOfficeMathCollector(),answers=[],nodes=[],source=`<w:p xmlns:w="${W}" xmlns:m="${M}"><w:r><w:t>BEFORE</w:t></w:r><m:oMath>${run('FORMULA')}</m:oMath><w:r><w:t>AFTER</w:t></w:r></w:p>`;
 readXml(source,{decode:s=>s,error:()=>Error('XML'),start(n){nodes.push(n);c.start(n);},text:c.text,end(n){const r=c.end(n);if(r)answers.push(r);}});
 assert.deepEqual(answers.map(r=>r.rawText),['FORMULA']);assert.equal(c.owns(nodes.find(n=>n.localName==='oMath')),true);assert.equal(c.owns(nodes.find(n=>n.localName==='p')),false);
});
for(const body of [
 `<m:f>${arg('num','SOURCE_SECRET')}</m:f>`, `<m:f>${arg('den','D')}${arg('num','N')}</m:f>`,
 `<m:f>${arg('num','A')}${arg('num','B')}${arg('den','C')}</m:f>`, `<m:rad>${arg('e','X')}</m:rad>`,
 '<m:t>SOURCE_SECRET</m:t>', '<m:num/>', `<m:mr>${arg('e','X')}</m:mr>`,
 `<m:r><m:t><m:r/></m:t></m:r>`, `<m:rPr>${run('SOURCE_SECRET')}</m:rPr>`,
 `<m:rad><m:radPr><m:degHide m:val="maybe"/></m:radPr><m:deg/>${arg('e','X')}</m:rad>`,
 `<mc:AlternateContent><mc:Fallback>${run('X')}</mc:Fallback></mc:AlternateContent>`,
 `<m:d><m:dPr><m:begChr m:val="NOT_ONE_CHARACTER"/></m:dPr>${arg('e','X')}</m:d>`
])test(`damaged/unsafe owner or cardinality ${body.slice(0,45)}`,()=>invalid(body));
test('DTD/entity/invalid Unicode/missing namespaces and arbitrary source types fail closed',()=>{
 for(const s of ['<!DOCTYPE m:oMath [<!ENTITY x SYSTEM "file:///private">]>'+formula(run('X')),formula('<m:r><m:t>&undefined;</m:t></m:r>'),formula(run('X')+'\ud800'),'<m:oMath/>','<oMath xmlns="urn:foreign"/>'])assert.throws(()=>readOfficeMath(s),{code:'OFFICE_MATH_INVALID'});
 for(const s of [null,{},new Uint8Array([1,2])])assert.throws(()=>readOfficeMath(s),{code:'OFFICE_MATH_INVALID'});
 assert.throws(()=>readOfficeMath(Buffer.from([0xff,0xfe,0,0])),{code:'OFFICE_MATH_INVALID'});
});
test('fixed budgets reject depth/node/text/byte and row expansion without changing global limits',()=>{
 const deep='<m:box><m:e>'.repeat(33)+run('X')+'</m:e></m:box>'.repeat(33);assert.throws(()=>read(deep),{code:'OFFICE_MATH_LIMIT'});
 assert.throws(()=>read(run('x'.repeat(LIMITS.text+1))),{code:'OFFICE_MATH_LIMIT'});
 assert.throws(()=>readOfficeMath(' '.repeat(LIMITS.bytes+1)),{code:'OFFICE_MATH_LIMIT'});
 assert.throws(()=>read(run('x').repeat(Math.ceil(LIMITS.nodes/2))),{code:'OFFICE_MATH_LIMIT'});
 assert.throws(()=>read('<m:m>'+`<m:mr>${arg('e','X')}</m:mr>`.repeat(257)+'</m:m>'),{code:'OFFICE_MATH_LIMIT'});
 assert.throws(()=>read(run('&'.repeat(Math.floor(LIMITS.output/5)+1))),{code:'OFFICE_MATH_LIMIT'});
});
test('property extensions and unmodelled border/phantom visibility never claim complete math coverage',()=>{
 for(const body of [`<m:acc><m:accPr><m:future m:val="unknown"/></m:accPr>${arg('e','SOURCE')}</m:acc>`,
 `<m:borderBox><m:borderBoxPr><m:strikeH m:val="1"/></m:borderBoxPr>${arg('e','SOURCE')}</m:borderBox>`,
 `<m:phant><m:phantPr><m:show m:val="1"/></m:phantPr>${arg('e','SOURCE')}</m:phant>`]){
  const r=read(body);assert.equal(r.complete,false);assert.equal(r.rawText.split('SOURCE').length-1,1);
 }
});
for(const profile of ['general','personnel'])testAsync(`visible source text -> actual privacy/trace/Keep check ${profile}`,async()=>{
 const r=read(frac('Name: Anna Berger','Kontakt: anna.berger@example.invalid')+run(' FHIR REST äöüß 😀'));
 const source=canonicalizeRenderedText(r.text,'content-person-fields/1');assert.match(source,/Anna Berger/u);assert.match(source,/anna\.berger@example\.invalid/u);
 const actual=anonymize(source,profile,options);assert.doesNotMatch(actual.text,/Anna Berger|anna\.berger@example\.invalid/u);assert.match(actual.text,/FHIR REST äöüß 😀/u);assert.equal(replayTransformTrace(actual.transform_trace),actual.text);assert.deepEqual(scanResidual(actual.text,profile,actual.dictionary,options),[]);
 const prepared=prepareTextPrivacyReview({text:source,profile,productChannel:'standalone',consumerOptions:options,captureTrace:true});
 const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'});const final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
 assert.doesNotMatch(final.markdown,/Anna Berger|anna\.berger@example\.invalid/u);assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
 const entities=initialEntities({markdown:final.markdown,transform_trace:final.transform_trace});assert.ok(entities.length>0);
 const target=entities.find(e=>e.original.includes('Anna'));assert.ok(target);
 const kept=applyEntityDecisions(final.markdown,entities,[{entity_id:target.entity_id,decision:'keep'}],Buffer.alloc(32,3));
 assert.ok(kept.markdown.includes('Anna'));assert.ok(scanResidual(kept.markdown,profile,final.dictionary,{...options,originalSourceText:source}).length>0);
});
for(const type of ['docx','pptx'])for(const table of [false,true])testAsync(`actual ${type} ${table?'generic table cell':'paragraph'} content projection retains explicit source field duty`,async()=>{
 const {zipStore}=require('./lib/zip'),{opcControlEntries}=require('./lib/opc');
 const payload=formula(frac('Name: Anna Berger','2'));
 let entries;
 if(type==='docx'){
  const p=`<w:p>${payload}</w:p>`,body=table?`<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Inhalt</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc>${p}</w:tc></w:tr></w:tbl>`:p;
  entries=[...opcControlEntries(type),['word/document.xml',`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`]];
 }else{
  const A='http://schemas.openxmlformats.org/drawingml/2006/main',P='http://schemas.openxmlformats.org/presentationml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',slide='ppt/slides/slide1.xml';
  const p=`<a:p><a14:m>${payload}</a14:m></a:p>`,body=table?`<p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid><a:gridCol/></a:tblGrid><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Inhalt</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody>${p}</a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`:`<p:sp><p:txBody>${p}</p:txBody></p:sp>`;
  entries=[...opcControlEntries(type,{additionalOverrides:[{part:slide,contentType:'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'}]}),
   ['ppt/presentation.xml',`<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s"/></p:sldIdLst></p:presentation>`],
   ['ppt/_rels/presentation.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="s" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`],
   [slide,`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main"><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`]];
 }
 const bytes=zipStore(entries),before=Buffer.from(bytes),extracted=require('../plugins/data-secure/server/standalone/markdown-extractor').extractMarkdownBuffer(bytes,`.${type}`,{markdownOutput:'content-v1',partialExtraction:true});
 assert.equal(extracted.markdown.split('Anna Berger').length-1,1);
 const transformed=await require('../plugins/data-secure/server/gateway/compliance').anonymizeMarkdown(extracted.markdown,'general',options);
 assert.doesNotMatch(transformed.text,/Anna Berger/u);assert.match(transformed.text,/Bruch/u);assert.deepEqual(bytes,before);
});
done();
