'use strict';
const {createSuite}=require('./helpers');
const {readXml}=require('../plugins/data-secure/server/xml-reader');
const {WORD_NAMESPACES,LIMITS,readWordNumbering,createWordNumberingSession,
  readWordCommentMetadata,createWordStoryContext}=require('../plugins/data-secure/server/word-content-context');
const {anonymize,scanResidual}=require('../plugins/data-secure/server/privacy/engine');
const {canonicalizeRenderedText}=require('../plugins/data-secure/server/privacy/base');
const {replayTransformTrace}=require('../plugins/data-secure/server/privacy/transform-plan');
const {initialEntities,applyEntityDecisions}=require('../plugins/data-secure/server/gateway/standalone-entity-review');
const {prepareTextPrivacyReview,resolveTextPrivacyReview,finalizeTextPrivacyReview}=require('../plugins/data-secure/server/gateway/privacy-text-operation');
const {test,testAsync,assert,done}=createSuite('Stored Word fields, list context and comment anchors');
const W=WORD_NAMESPACES[0],S=WORD_NAMESPACES[1],MC='http://schemas.openxmlformats.org/markup-compatibility/2006';
const esc=s=>String(s).replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/"/gu,'&quot;');
const wrap=(name,body,ns=W)=>`<w:${name} xmlns:w="${ns}" xmlns:mc="${MC}">${body}</w:${name}>`;
const run=t=>`<w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para=t=>`<w:p>${run(t)}</w:p>`;
const char=t=>`<w:r><w:fldChar w:fldCharType="${t}"/></w:r>`;
const code=t=>`<w:r><w:instrText>${esc(t)}</w:instrText></w:r>`;
const field=(t,instruction='DDE AUTO forbidden')=>char('begin')+code(instruction)+char('separate')+run(t)+char('end');
const simple=(t,instruction='INCLUDETEXT forbidden')=>`<w:fldSimple w:instr="${esc(instruction)}">${run(t)}</w:fldSimple>`;
const decode=s=>s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/gu,(_,k)=>k[0]==='#'?String.fromCodePoint(parseInt(k.slice(k[1]==='x'?2:1),k[1]==='x'?16:10)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[k]);
function story(body,{view='final',comments,ns=W}={}) {
  const context=createWordStoryContext({revisionView:view,...(comments?{comments}:{} )}),texts=[],nodes=[];
  readXml(wrap('document',`<w:body>${body}</w:body>`,ns),{decode,error:()=>Object.assign(Error('XML'),{code:'DOCX_STRUCTURE_UNSAFE'}),
    start(n){nodes.push(n);context.start(n);},text(t,n){if(context.textAllowed(n))texts.push({text:t,node:n});},end(n){context.end(n);}});
  return {text:texts.map(x=>x.text).join(''),texts,nodes,report:context.finish()};
}
const badStory=b=>assert.throws(()=>story(b),e=>e.code==='DOCX_STRUCTURE_UNSAFE');
const level=(i,{start=1,fmt='decimal',text=`%${i+1}.`,extra=''}={})=>`<w:lvl w:ilvl="${i}"><w:start w:val="${start}"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${esc(text)}"/>${extra}</w:lvl>`;
const abstract=(body,id=0,extra='')=>`<w:abstractNum w:abstractNumId="${id}">${body}${extra}</w:abstractNum>`;
const num=(id=1,abs=0,extra='')=>`<w:num w:numId="${id}"><w:abstractNumId w:val="${abs}"/>${extra}</w:num>`;
const model=(body,styles)=>readWordNumbering(wrap('numbering',body),styles&&wrap('styles',styles));
const session=(body,styles)=>createWordNumberingSession(model(body,styles));
const style=(id,body,type='paragraph')=>`<w:style w:type="${type}" w:styleId="${id}">${body}</w:style>`;
const pr=(n,ilvl='')=>`<w:pPr><w:numPr><w:numId w:val="${n}"/>${ilvl===''?'':`<w:ilvl w:val="${ilvl}"/>`}</w:numPr></w:pPr>`;

test('simple fields retain only the stored visible result at its original position without evaluating instructions',()=>{
  for(const instruction of ['AUTHOR','DDE AUTO server topic','INCLUDETEXT "file:///secret"','INCLUDEPICTURE "https://example.invalid/x"','MACROBUTTON anything']) {
    const r=story(`<w:p>${run('Before ')}${simple('Name: Anna Berger',instruction)}${run(' After FHIR')}</w:p>`);
    assert.equal(r.text,'Before Name: Anna Berger After FHIR');assert.equal(r.report.fieldCount,1);
    assert.deepEqual(r.report.notices,['WORD_FIELD_STORED_RESULT']);assert.equal(r.report.complete,true);
    assert.ok(!r.text.includes(instruction));
  }
});
test('nested complex instruction/results never expose a nested instruction result or concatenate code with values',()=>{
  const r=story(`<w:p>${char('begin')}${code('IF ')}${field('HIDDEN_NESTED_CODE_RESULT')}${code(' rest')}${char('separate')}${run('Saved ')}${field('visible nested')}${char('end')}${run(' tail')}</w:p>`);
  assert.equal(r.text,'Saved visible nested tail');assert.equal(r.report.fieldCount,3);
});
test('a complex field without separator has no stored result; subsequent real prose remains visible',()=>{
  const r=story(`<w:p>${char('begin')}${code('DATE')}${run('NOT_A_RESULT')}${char('end')}${run('REAL')}</w:p>`);
  assert.equal(r.text,'REAL');
});
test('complex fields may cross actual paragraphs, not table-cell/story/simple-field ownership',()=>{
  assert.equal(story(`<w:p>${char('begin')}${code('TOC')}${char('separate')}${run('A')}</w:p><w:p>${run('B')}${char('end')}</w:p>`).text,'AB');
  badStory(`<w:tbl><w:tr><w:tc><w:p>${char('begin')}${char('separate')}${run('A')}</w:p></w:tc><w:tc><w:p>${run('B')}${char('end')}</w:p></w:tc></w:tr></w:tbl>`);
  badStory(`<w:p><w:fldSimple w:instr="X">${char('begin')}${char('separate')}${run('A')}</w:fldSimple>${char('end')}</w:p>`);
});
for(const bad of [char('end'),char('separate'),char('begin')+char('separate')+char('separate'),char('begin')+run('UNCLOSED'),
  '<w:fldChar w:fldCharType="begin"/>','<w:r><w:fldChar w:fldCharType="start"/></w:r>','<w:fldSimple>'+run('NO_INSTRUCTION')+'</w:fldSimple>']) {
  test('damaged field controls stay typed and atomic: '+bad.slice(0,55),()=>badStory(`<w:p>${bad}</w:p>`));
}
test('final and original revision views are explicit, mutually exclusive and do not mix stored values',()=>{
  const b=`<w:p>${run('Start ')}<w:del w:id="1"><w:r><w:delText>Old</w:delText></w:r></w:del><w:ins w:id="2">${run('New')}</w:ins><w:moveFrom>${run('MovedOld')}</w:moveFrom><w:moveTo>${run('MovedNew')}</w:moveTo>${run(' End')}</w:p>`;
  assert.equal(story(b).text,'Start NewMovedNew End');assert.equal(story(b,{view:'original'}).text,'Start OldMovedOld End');
  assert.throws(()=>createWordStoryContext({}),e=>e.code==='DOCX_STRUCTURE_UNSAFE');
  assert.throws(()=>createWordStoryContext({revisionView:'both'}),e=>e.code==='DOCX_STRUCTURE_UNSAFE');
});
test('hidden revisions cannot alter selected-view field state, old formatting never becomes body text',()=>{
  const b=`<w:p><w:pPr><w:pPrChange><w:pPr><w:pStyle w:val="Name"/></w:pPr></w:pPrChange></w:pPr><w:del>${char('begin')}${code('evil')}${run('OLD')}</w:del>${field('NEW')}${run(' Technical')}</w:p>`;
  const r=story(b);assert.equal(r.text,'NEW Technical');assert.ok(r.report.notices.includes('WORD_REVISION_METADATA_NOT_PROJECTED'));
});
test('original text view does not claim restoration of unmodelled previous paragraph/table properties',()=>{
  const b=`<w:p><w:pPr><w:pPrChange><w:pPr><w:pStyle w:val="Historical"/></w:pPr></w:pPrChange></w:pPr>${run('Saved current prose')}</w:p>`;
  const r=story(b,{view:'original'});assert.equal(r.report.complete,false);assert.deepEqual(r.report.reasons,['WORD_REVISION_PROPERTIES_UNMODELED']);
  assert.equal(story(b).report.complete,true);
});
test('unmodeled table/revision-range changes retain a hard typed boundary instead of mixing owners',()=>{
  for(const tag of ['cellIns','cellDel','cellMerge','moveFromRangeStart','customXmlMoveToRangeEnd'])badStory(`<w:p><w:${tag}/>${run('X')}</w:p>`);
});
test('canonical alias/Strict source, CDATA, entity single decoding and international characters remain literal',()=>{
  const r=story(`<w:p>${simple('Ä Ö Ü ß 中文 العربية 😀 &amp;')}<w:r><w:t><![CDATA[ <literal> ]]></w:t></w:r></w:p>`,{ns:S});
  assert.equal(r.text,'Ä Ö Ü ß 中文 العربية 😀 &amp; <literal> ');
  assert.throws(()=>readWordNumbering(wrap('numbering','<!DOCTYPE x>')),e=>e.code==='DOCX_STRUCTURE_UNSAFE');
  for(const text of ['&#0;','&#xD800;','\ud800'])assert.throws(()=>readWordCommentMetadata(wrap('comments',`<w:comment w:id="0" w:author="${text}"/>`)),e=>e.code==='DOCX_STRUCTURE_UNSAFE');
});
test('definition/collector accessors and proxies do not become executable caller contracts',()=>{
  let calls=0;assert.throws(()=>createWordStoryContext({get revisionView(){calls++;return 'final';}}));
  assert.throws(()=>createWordStoryContext(new Proxy({}, {ownKeys(){calls++;return [];}})));assert.equal(calls,0);
  assert.throws(()=>createWordNumberingSession({}));assert.throws(()=>createWordStoryContext({revisionView:'final',comments:{}}));
  assert.throws(()=>readWordNumbering({get length(){calls++;return 0;}}));
  const c=createWordStoryContext({revisionView:'final'});
  assert.throws(()=>c.start({namespaceURI:W,localName:'document',parent:null,get attributes(){calls++;return new Map();}}));
  assert.equal(calls,0);
});
test('field and story limits are fixed and content-free, not increased to accommodate an input',()=>{
  assert.throws(()=>readWordNumbering(' '.repeat(LIMITS.xml+1)),e=>e.code==='DOCX_STRUCTURE_LIMIT'&&e.message==='DOCX_STRUCTURE_LIMIT');
  assert.throws(()=>story('<w:p>'+char('begin').repeat(LIMITS.depth+1)+'</w:p>'),e=>e.code==='DOCX_STRUCTURE_LIMIT');
  badStory(`<w:p xmlns:mc="${MC}"><mc:AlternateContent><mc:Fallback>${run('RAW_UNSELECTED_MC')}</mc:Fallback></mc:AlternateContent></w:p>`);
});

test('decimal multilevel counters retain the exact template, source level and a previous-level restart',()=>{
  const n=session(abstract(level(0)+level(1,{start:3,text:'%1.%2)'}))+num());
  assert.equal(n.next({numId:'1',ilvl:0}).prefix,'1.\t');assert.equal(n.next({numId:'1',ilvl:1}).prefix,'1.3)\t');
  assert.equal(n.next({numId:'1',ilvl:1}).prefix,'1.4)\t');assert.equal(n.next({numId:'1',ilvl:0}).prefix,'2.\t');
  const r=n.next({numId:'1',ilvl:1});assert.equal(r.prefix,'2.3)\t');assert.equal(r.binding.start,3);assert.equal(r.binding.restartAfterLevel,0);
});
test('separate num instances and start overrides keep independent counters and restart values',()=>{
  const n=session(abstract(level(0)+level(1))+num()+num(2,0,'<w:lvlOverride w:ilvl="0"><w:startOverride w:val="7"/></w:lvlOverride>'));
  assert.equal(n.next({numId:'1'}).prefix,'1.\t');assert.equal(n.next({numId:'2'}).prefix,'7.\t');
  assert.equal(n.next({numId:'1'}).prefix,'2.\t');assert.equal(n.next({numId:'2'}).prefix,'8.\t');
});
test('a complete level override uses its actual format/template and explicit startOverride wins',()=>{
  const n=session(abstract(level(0))+num(1,0,`<w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/>${level(0,{start:9,fmt:'upperRoman',text:'(%1)',extra:'<w:suff w:val="space"/>'})}</w:lvlOverride>`));
  assert.equal(n.next({numId:'1'}).prefix,'(V) ');assert.equal(n.next({numId:'1'}).prefix,'(VI) ');
});
test('never-restart and an explicit earlier restart level are not ordinary hierarchical resets',()=>{
  const n=session(abstract(level(0)+level(1,{extra:'<w:lvlRestart w:val="0"/>'})+level(2,{fmt:'lowerLetter',extra:'<w:lvlRestart w:val="1"/>'}))+num());
  n.next({numId:'1',ilvl:0});assert.equal(n.next({numId:'1',ilvl:1}).prefix,'1.\t');assert.equal(n.next({numId:'1',ilvl:2}).prefix,'a.\t');
  assert.equal(n.next({numId:'1',ilvl:1}).prefix,'2.\t');assert.equal(n.next({numId:'1',ilvl:2}).prefix,'b.\t');
  n.next({numId:'1',ilvl:0});assert.equal(n.next({numId:'1',ilvl:1}).prefix,'3.\t');assert.equal(n.next({numId:'1',ilvl:2}).prefix,'a.\t');
});
for(const [fmt,start,expected]of [['upperLetter',26,'Z.\t'],['lowerLetter',27,'aa.\t'],['lowerRoman',14,'xiv.\t'],['decimalZero',3,'03.\t'],['decimal',-2,'-2.\t'],['none',1,'.\t']]) {
  test('bounded number format '+fmt+'/'+start,()=>assert.equal(session(abstract(level(0,{start,fmt}))+num()).next({numId:'1'}).prefix,expected));
}
test('bullet literal, null text, suffix and legal decimal references remain explicit',()=>{
  assert.equal(session(abstract(level(0,{fmt:'bullet',text:'•',extra:'<w:suff w:val="nothing"/>'}))+num()).next({numId:'1'}).prefix,'•');
  const n=session(abstract(level(0,{fmt:'upperRoman'})+level(1,{text:'%1.%2',extra:'<w:isLgl/>'}))+num());
  n.next({numId:'1',ilvl:0});assert.equal(n.next({numId:'1',ilvl:1}).prefix,'1.1\t');
  assert.equal(session(abstract('<w:lvl w:ilvl="0"><w:lvlText w:null="1"/><w:suff w:val="nothing"/></w:lvl>')+num()).next({numId:'1'}).prefix,'');
});
test('paragraph style inheritance binds the real abstract pStyle and ignores a style numPr ilvl',()=>{
  const ss=style('Base',pr(1,7))+style('Derived','<w:basedOn w:val="Base"/>');
  const n=session(abstract(level(0)+level(1,{extra:'<w:pStyle w:val="Base"/>'}))+num(),ss);
  const r=n.next({pStyle:'Derived'});assert.equal(r.prefix,'1.\t');assert.equal(r.binding.ilvl,1);assert.deepEqual(r.binding.styleChain,['Derived','Base']);
  assert.equal(n.next({pStyle:'Derived',numId:'0'}).prefix,'');assert.equal(n.next({pStyle:'Derived',numId:'1',ilvl:0}).binding.ilvl,0);
});
test('numbering-style indirection resolves the actual num instance without borrowing a similarly named style',()=>{
  const ss=style('NumStyle',pr(2),'numbering');
  const n=session(abstract('',0,'<w:numStyleLink w:val="NumStyle"/>')+abstract(level(0,{start:4}),1)+num(1,0)+num(2,1),ss);
  const r=n.next({numId:'1'});assert.equal(r.prefix,'4.\t');assert.deepEqual(r.binding.numberingStyleChain,['NumStyle']);
});
test('unseen ancestor, unsupported format and ambiguous style binding never fabricate a list number',()=>{
  const n=session(abstract(level(0)+level(1,{text:'%1.%2'}))+num());assert.equal(n.next({numId:'1',ilvl:1}).complete,false);
  n.next({numId:'1',ilvl:0});assert.equal(n.next({numId:'1',ilvl:1}).complete,false,'an uncertain earlier item poisons continuity');
  for(const fmt of ['chineseCounting','ordinalText','picture']) {
    const r=session(abstract(level(0,{fmt}))+num()).next({numId:'1'});assert.equal(r.complete,false);assert.equal(r.prefix,'');assert.deepEqual(r.reasons,['WORD_NUMBERING_UNMODELED']);
  }
  const ss=style('S',pr(1));const amb=session(abstract(level(0,{extra:'<w:pStyle w:val="S"/>'})+level(1,{extra:'<w:pStyle w:val="S"/>'}))+num(),ss);
  assert.equal(amb.next({pStyle:'S'}).complete,false);
});
test('missing models stay explicit, while ordinary known styles and numId zero do not become guessed lists',()=>{
  const n=createWordNumberingSession(readWordNumbering(undefined,wrap('styles',style('Normal',''))));
  assert.equal(n.next({pStyle:'Normal'}).complete,true);assert.equal(n.next({pStyle:'Unknown'}).complete,false);
  assert.equal(n.next({numId:'1'}).complete,false);assert.equal(n.next({numId:'0'}).binding.removed,true);assert.equal(n.next({ilvl:0}).complete,false);
});
test('duplicate IDs, duplicate/mismatched levels, style cycles and binding cycles fail typed instead of looping',()=>{
  for(const b of [abstract(level(0))+abstract(level(0))+num(),abstract(level(0)+level(0))+num(),
    abstract(level(0))+num()+num(),abstract(level(0))+num(1,0,`<w:lvlOverride w:ilvl="0">${level(1)}</w:lvlOverride>`)])assert.throws(()=>session(b),e=>e.code==='DOCX_STRUCTURE_UNSAFE');
  const n=session(abstract(level(0))+num(),style('A','<w:basedOn w:val="B"/>')+style('B','<w:basedOn w:val="A"/>'));
  assert.throws(()=>n.next({pStyle:'A'}),e=>e.code==='DOCX_STRUCTURE_UNSAFE');
  const linked=session(abstract('',0,'<w:numStyleLink w:val="Loop"/>')+num(),style('Loop',pr(1),'numbering'));
  assert.throws(()=>linked.next({numId:'1'}),e=>e.code==='DOCX_STRUCTURE_UNSAFE');
});
test('definition MC selects only one real fallback; foreign numbering names never acquire canonical roles',()=>{
  const alt=`<mc:AlternateContent xmlns:f="urn:foreign"><mc:Choice Requires="f">${abstract(level(0,{start:99}))}</mc:Choice><mc:Fallback>${abstract(level(0,{start:3}))}</mc:Fallback></mc:AlternateContent>`;
  assert.equal(session(alt+num()).next({numId:'1'}).prefix,'3.\t');
  assert.throws(()=>readWordNumbering('<w:numbering xmlns:w="urn:foreign"/>'),e=>e.code==='DOCX_STRUCTURE_UNSAFE');
  const strict=wrap('numbering',abstract(level(0))+num(),S);assert.equal(createWordNumberingSession(readWordNumbering(strict)).next({numId:'+01'}).prefix,'1.\t');
});
test('counter overflow, huge IDs and output expansion remain bounded before a false prefix is returned',()=>{
  const n=session(abstract(level(0,{start:LIMITS.counter}))+num());assert.equal(n.next({numId:'1'}).complete,true);
  assert.throws(()=>n.next({numId:'1'}),e=>e.code==='DOCX_STRUCTURE_LIMIT');
  assert.throws(()=>session(abstract(level(0))+num('99999999999999999999999')),e=>e.code==='DOCX_STRUCTURE_LIMIT');
  assert.throws(()=>session(abstract(level(0,{text:'x'.repeat(LIMITS.prefix+1)}))+num()),e=>e.code==='DOCX_STRUCTURE_LIMIT');
});

const comments=(body)=>readWordCommentMetadata(wrap('comments',body));
const comment=(id,author,text)=>`<w:comment w:id="${id}" w:author="${esc(author)}" w:initials="AB" w:date="2026-10-24T00:00:00Z">${para(text)}</w:comment>`;
test('a ranged comment has one actual source range/ref and exact source author, not text-based association',()=>{
  const c=comments(comment('00','Anna Berger','COMMENT')+comment(1,'Other','ORPHAN'));
  const r=story(`<w:p><w:commentRangeStart w:id="+0"/>${run('A😀B')}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>`,{comments:c});
  assert.equal(r.text,'A😀B');assert.equal(r.report.comments.length,1);const b=r.report.comments[0];
  assert.equal(b.id,'0');assert.equal(b.definition.author,'Anna Berger');assert.ok(r.nodes.includes(b.referenceNode));
  assert.ok(r.nodes.includes(b.startNode));assert.ok(b.startIndex<b.endIndex&&b.endIndex<b.referenceIndex);assert.ok(!r.text.includes('COMMENT'));
});
test('point comments and equal content in distinct real comments remain distinct without duplicated source words',()=>{
  const c=comments(comment(1,'Änne','same')+comment(2,'Öz','same'));
  const r=story(`<w:p>${run('same')}<w:r><w:commentReference w:id="1"/></w:r>${run('same')}<w:r><w:commentReference w:id="2"/></w:r></w:p>`,{comments:c});
  assert.equal(r.text,'samesame');assert.deepEqual(r.report.comments.map(x=>x.id),['1','2']);assert.equal(r.report.comments[0].startNode,null);
});
test('duplicate/missing/reordered/cross-view comment anchors cannot borrow another comment definition',()=>{
  assert.throws(()=>comments(comment('0','A','X')+comment('+00','B','Y')),e=>e.code==='DOCX_STRUCTURE_UNSAFE');
  const c=comments(comment(0,'A','X'));
  for(const b of ['<w:r><w:commentReference w:id="1"/></w:r>',
    '<w:commentRangeStart w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>',
    '<w:commentRangeEnd w:id="0"/><w:commentRangeStart w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>',
    '<w:r><w:commentReference w:id="0"/><w:commentReference w:id="0"/></w:r>'])assert.throws(()=>story(`<w:p>${b}</w:p>`,{comments:c}),e=>e.code==='DOCX_STRUCTURE_UNSAFE');
  const r=story(`<w:p><w:del><w:r><w:commentReference w:id="0"/></w:r></w:del>${run('NEW')}</w:p>`,{comments:c});assert.deepEqual(r.report.comments,[]);
});
test('comment author is original literal metadata, no dates/initials or arbitrary payload becomes a fake identity',()=>{
  const c=comments(comment(0,'Anna &amp; Berger | 😀','Source body'));
  const r=story('<w:p><w:r><w:commentReference w:id="0"/></w:r></w:p>',{comments:c});assert.equal(r.report.comments[0].definition.author,'Anna &amp; Berger | 😀');
  assert.throws(()=>readWordCommentMetadata('<w:comments xmlns:w="urn:foreign"/>'),e=>e.code==='DOCX_STRUCTURE_UNSAFE');
});
test('missing comment author is an explicit fixed notice, never a guessed person or source string diagnostic',()=>{
  const c=comments('<w:comment w:id="0">'+para('Only body')+'</w:comment>');
  const r=story('<w:p><w:r><w:commentReference w:id="0"/></w:r></w:p>',{comments:c});
  assert.equal(r.report.comments[0].definition.author,null);assert.deepEqual(r.report.notices,['WORD_COMMENT_AUTHOR_UNAVAILABLE']);
});
for(const profile of ['general','personnel_profile'])test('actual stored result and author enter ordinary cell privacy, trace and unsafe Keep refusal '+profile,()=>{
  const c=comments(comment(0,'Anna Berger','NOT_DUPLICATED'));
  const r=story(`<w:p>${field('Name: Qvx / Qvy')}<w:r><w:commentReference w:id="0"/></w:r></w:p>`,{comments:c});
  const md='😀\n\n| Inhalt | Fachtext |\n| --- | --- |\n| '+r.text+' | HTTP/2 |\n\n| Autor |\n| --- |\n| '+r.report.comments[0].definition.author+' |';
  const source=canonicalizeRenderedText(md,'content-person-fields/1'),options={productChannel:'standalone',contentOptions:{schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false},captureTransformPlan:true};
  const out=anonymize(source,profile,options);assert.doesNotMatch(out.text,/Qvx|Qvy|Anna|Berger/u);assert.ok(out.text.includes('HTTP/2'));assert.equal(replayTransformTrace(out.transform_trace),out.text);
  assert.deepEqual(scanResidual(out.text,profile,out.dictionary,options),[]);
  assert.ok(scanResidual(source,profile,[],options).length>0);
  const entities=initialEntities({transform_trace:out.transform_trace,markdown:out.text});
  const mask=entities.find(x=>x.kind==='SENSITIVE_FIELD')||entities[0];assert.ok(mask);
  const kept=applyEntityDecisions(out.text,entities,[{entity_id:mask.entity_id,decision:'keep'}],Buffer.alloc(32,7));
  assert.ok(scanResidual(kept.markdown,profile,[],options).length>0);
});
test('unresolved numbering never smuggles foreign subtree properties or a legacy style-link conflict into a prefix',()=>{
  assert.throws(()=>session(abstract(level(0))+'<w:num w:numId="1"><w:abstractNumId w:val="0"><w:ilvl w:val="1"/></w:abstractNumId></w:num>'),e=>e.code==='DOCX_STRUCTURE_UNSAFE');
  const linked=session(abstract(level(0,{text:'IGNORED_LITERAL'}),0,'<w:numStyleLink w:val="N"/>')+abstract(level(0),1)+num(1,0)+num(2,1),style('N',pr(2),'numbering'));
  assert.equal(linked.next({numId:'1'}).complete,false);
});
test('the helper does not join adjacent real cell values or flatten table/Math ownership into an alternate text authority',()=>{
  const r=story(`<w:tbl><w:tr><w:tc><w:p>${simple('Name')}</w:p></w:tc><w:tc><w:p>${field('Qvx / Qvy')}</w:p></w:tc><w:tc>${para('FHIR REST')}</w:tc></w:tr></w:tbl>`);
  const cells=new Map();for(const item of r.texts){let p=item.node;while(p&&!isTc(p))p=p.parent;if(!cells.has(p))cells.set(p,[]);cells.get(p).push(item.text);}
  assert.deepEqual([...cells.values()].map(a=>a.join('')),['Name','Qvx / Qvy','FHIR REST']);
  function isTc(n){return WORD_NAMESPACES.includes(n.namespaceURI)&&n.localName==='tc';}
});
(async()=>{
  for(const profile of ['general','personnel_profile'])await testAsync('stored Unicode field result completes the actual prepare/review/finalize trace path '+profile,async()=>{
    const r=story(`<w:p>${simple('Name: Qvx / Qvy 😀')}</w:p>`);
    const source=canonicalizeRenderedText('| Inhalt | Fachtext |\n| --- | --- |\n| '+r.text+' | HTTP/2 |','content-person-fields/1');
    const options={productChannel:'standalone',contentOptions:{schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false}};
    const prepared=prepareTextPrivacyReview({text:source,profile,productChannel:'standalone',consumerOptions:options,captureTrace:true});
    const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'});
    const final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
    assert.doesNotMatch(final.markdown,/Qvx|Qvy/u);assert.ok(final.markdown.includes('HTTP/2'));
    assert.equal(replayTransformTrace(final.transform_trace),final.markdown);assert.deepEqual(scanResidual(final.markdown,profile,final.dictionary,options),[]);
  });
  done();
})().catch(error=>{console.error(error);process.exitCode=1;});
