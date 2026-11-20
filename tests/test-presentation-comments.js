'use strict';
const assert=require('node:assert/strict');
const {readPresentationComments}=require('../plugins/data-secure/server/presentation-comments');
const {zipStore}=require('./lib/zip'),{opcControlEntries}=require('./lib/opc');
const {extractMarkdownBuffer}=require('../plugins/data-secure/server/standalone/markdown-extractor');
const NS='http://schemas.microsoft.com/office/powerpoint/2018/8/main',D='http://schemas.openxmlformats.org/drawingml/2006/main',P='http://schemas.openxmlformats.org/presentationml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A='{12345678-1234-1234-1234-123456789012}',C='{22345678-1234-1234-1234-123456789012}',C2='{32345678-1234-1234-1234-123456789012}';
const rel=(kind,target)=>`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.microsoft.com/office/2018/10/relationships/${kind}" Target="${target}"/></Relationships>`;
const body=text=>`<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${text}</a:t></a:r><a:br/><a:r><a:t>HTTP/2</a:t></a:r></a:p></p:txBody>`;
function fixture(reply=true){return new Map([
 ...opcControlEntries('pptx',{additionalOverrides:[{part:'ppt/slides/slide1.xml',contentType:'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'},
 {part:'ppt/authors.xml',contentType:'application/vnd.ms-powerpoint.authors+xml'},{part:'ppt/comments/modernComment_a_b.xml',contentType:'application/vnd.ms-powerpoint.comments+xml'}]}),
 ['ppt/presentation.xml',`<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="slide1"/></p:sldIdLst></p:presentation>`],
 ['ppt/_rels/presentation.xml.rels',rel('authors','authors.xml').replace('</Relationships>',`<Relationship Id="slide1" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`)],
 ['ppt/slides/slide1.xml',`<p:sld xmlns:p="${P}" xmlns:a="${D}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Gebundene Folie</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`],
 ['ppt/slides/_rels/slide1.xml.rels',rel('comments','../comments/modernComment_a_b.xml')],
 ['ppt/authors.xml',`<p:authorLst xmlns:p="${NS}"><p:author id="${A}" name="Anna Berger" initials="AB" userId="anna@example.invalid" providerId="AD"/></p:authorLst>`],
 ['ppt/comments/modernComment_a_b.xml',`<p:cmLst xmlns:p="${NS}" xmlns:a="${D}"><p:cm id="${C}" authorId="${A}" created="2026-10-24T10:00:00Z"><p:unknownAnchor/>${reply?`<p:replyLst><p:reply id="${C2}" authorId="${A}" created="2026-10-24T11:00:00Z">${body('Antwort &amp; ÄÖÜß')}</p:reply></p:replyLst>`:''}${body('Name: Max Mustermann')}</p:cm></p:cmLst>`]
 ].map(([key,value])=>[key,Buffer.isBuffer(value)?value:Buffer.from(value)]));}
function namedFixture(name,reply=true){
 const entries=fixture(reply),before='ppt/comments/modernComment_a_b.xml',after=`ppt/comments/${name}`;
 if(before===after)return entries;
 entries.set(after,entries.get(before));entries.delete(before);
 for(const part of ['[Content_Types].xml','ppt/slides/_rels/slide1.xml.rels'])
  entries.set(part,Buffer.from(entries.get(part).toString().replaceAll('modernComment_a_b.xml',name)));
 return entries;
}
//65 fixtures are real in-memory OPC parts. Fixed constants keep block A
// executable against the old reader; no new export is read while constructing it.
const expectedWorkLimits65=Object.freeze({xmlBytes:64*1024*1024,expandedUnits:8000000,
 commentOverhead:1024,paragraphOverhead:128});
const slidePart65='ppt/slides/slide1.xml',commentPart65='ppt/comments/modernComment_a_b.xml';
const paragraphText65='x\nHTTP/2',initials65='AB',userId65='anna@example.invalid';
const guid65=(prefix,index)=>`{${prefix}-1234-1234-1234-${index.toString(16).padStart(12,'0')}}`;
function sourceSnapshot65(entries){return [...entries].map(([name,value])=>[name,Buffer.from(value)]);}
function sameSource65(entries,before){
 assert.deepEqual([...entries.keys()],before.map(([name])=>name));
 for(const [name,value]of before)assert.deepEqual(entries.get(name),value,name);
}
function replaceSource65(entries,part,needle,replacement){
 const source=entries.get(part).toString('utf8');assert.equal(source.split(needle).length,2,part+' fixture anchor');
 entries.set(part,Buffer.from(source.replace(needle,replacement)));
}
function commentsFixture65({count=1,authorLength=8,titlePadding=0,replies=false,distinctAuthors=false,
 unusedAuthorLength=null,prefix='',idOffset=0}={}){
 assert.ok(Number.isSafeInteger(count)&&count>=1&&count<=64);
 assert.ok(Number.isSafeInteger(authorLength)&&authorLength>=0&&authorLength<=125000);
 assert.ok(Number.isSafeInteger(titlePadding)&&titlePadding>=0&&titlePadding<=64);
 assert.ok(/^[A-Z0-9]*$/u.test(prefix));
 const entries=fixture(false),authorName='A'.repeat(authorLength);
 const authorIds=distinctAuthors?Array.from({length:count},(_,index)=>guid65('12345678',index+1)):[A];
 const authors=authorIds.map(id=>`<p:author id="${id}" name="${authorName}" initials="${initials65}" userId="${userId65}" providerId="AD"/>`);
 if(unusedAuthorLength!==null){
  assert.ok(Number.isSafeInteger(unusedAuthorLength)&&unusedAuthorLength>=0&&unusedAuthorLength<=1048576);
  authors.push(`<p:author id="${guid65('12345678',100000)}" name="${'U'.repeat(unusedAuthorLength)}"/>`);
 }
 entries.set('ppt/authors.xml',Buffer.from(`<p:authorLst xmlns:p="${NS}">${authors.join('')}</p:authorLst>`));
 const record=(index,tag,children='')=>{
  const title=index===0?'T'.repeat(titlePadding):'',text=prefix?prefix+index:'x';
  return `<p:${tag} id="${guid65('22345678',idOffset+index+1)}" authorId="${authorIds[distinctAuthors?index:0]}" created="2026-10-24T10:00:00Z" title="${title}">${body(text)}${children}</p:${tag}>`;
 };
 const records=replies?record(0,'cm',count>1?'<p:replyLst>'+
  Array.from({length:count-1},(_,index)=>record(index+1,'reply')).join('')+'</p:replyLst>':''):
  Array.from({length:count},(_,index)=>record(index,'cm')).join('');
 entries.set(commentPart65,Buffer.from(`<p:cmLst xmlns:p="${NS}" xmlns:a="${D}">${records}</p:cmLst>`));
 return entries;
}
function boundaryFixture65(oneOver=0,replies=false,distinctAuthors=false){
 assert.ok(oneOver===0||oneOver===1);
 const count=64,limits=expectedWorkLimits65;
 const fixed=count*(limits.commentOverhead+limits.paragraphOverhead+
  initials65.length+userId65.length+paragraphText65.length);
 const authorLength=Math.floor((limits.expandedUnits-fixed)/count);
 const titlePadding=limits.expandedUnits-fixed-count*authorLength+oneOver;
 const entries=commentsFixture65({count,authorLength,titlePadding,replies,distinctAuthors});
 assert.equal(fixed+count*authorLength+titlePadding,limits.expandedUnits+oneOver);
 return entries;
}
function workApi65(){
 const api=require('../plugins/data-secure/server/presentation-comments');
 assert.equal(typeof api.createPresentationCommentBudget,'function');
 assert.deepEqual(api.PRESENTATION_COMMENT_WORK_LIMITS,expectedWorkLimits65);
 assert.ok(Object.isFrozen(api.PRESENTATION_COMMENT_WORK_LIMITS));
 return api;
}
function xmlCost65(entries){
 return ['ppt/slides/_rels/slide1.xml.rels','ppt/_rels/presentation.xml.rels','[Content_Types].xml',
  'ppt/authors.xml',commentPart65].reduce((total,part)=>total+entries.get(part).length,0);
}
function twoSlides65(){
 const entries=commentsFixture65({count:40,authorLength:100000,prefix:'FIRSTCOMMENT'});
 const second=commentsFixture65({count:40,authorLength:100000,prefix:'SECONDCOMMENT',idOffset:1000});
 replaceSource65(entries,'ppt/presentation.xml','</p:sldIdLst>','<p:sldId id="257" r:id="slide2"/></p:sldIdLst>');
 replaceSource65(entries,'ppt/_rels/presentation.xml.rels','</Relationships>',
  `<Relationship Id="slide2" Type="${R}/slide" Target="slides/slide2.xml"/></Relationships>`);
 replaceSource65(entries,'[Content_Types].xml','</Types>',
  '<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'+
  '<Override PartName="/ppt/comments/modernComment_c_d.xml" ContentType="application/vnd.ms-powerpoint.comments+xml"/></Types>');
 entries.set('ppt/slides/slide2.xml',Buffer.from(entries.get(slidePart65).toString().replace('Gebundene Folie','SECOND SLIDE SOURCE')));
 entries.set('ppt/slides/_rels/slide2.xml.rels',Buffer.from(rel('comments','../comments/modernComment_c_d.xml')));
 entries.set('ppt/comments/modernComment_c_d.xml',Buffer.from(second.get(commentPart65)));
 return entries;
}
function embeddedPresentations65(){
 const parent=fixture(false),children=[];
 for(const [index,label]of ['CHILDONE','CHILDTWO'].entries()){
  const child=commentsFixture65({count:40,authorLength:100000,prefix:label+'COMMENT',idOffset:1000*index});
  replaceSource65(child,slidePart65,'Gebundene Folie',label+' SLIDE SOURCE');
  const zip=zipStore([...child]);children.push({entries:child,zip,label});
  const part=`ppt/embeddings/child${index+1}.pptx`;
  parent.set(part,zip);
  replaceSource65(parent,'[Content_Types].xml','</Types>',
   `<Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation"/></Types>`);
  replaceSource65(parent,'ppt/slides/_rels/slide1.xml.rels','</Relationships>',
   `<Relationship Id="embedded${index+1}" Type="${R}/package" Target="../embeddings/child${index+1}.pptx"/></Relationships>`);
 }
 return {parent,children};
}
// The strict Standalone parent intentionally rejects embedded .pptx.
// This separate legacy-only family keeps output tiny and varies XML work,
// so a final8M-output cutoff cannot pretend to prove the shared graph budget.
const legacySlideCount65=40;
function legacyCommentPart65(index){
 return index===1?commentPart65:`ppt/comments/modernComment_${index.toString(16)}_${(index+64).toString(16)}.xml`;
}
function legacyChild65(label,unusedAuthorLength){
 const entries=commentsFixture65({count:1,authorLength:8,unusedAuthorLength,prefix:label+'COMMENT1'});
 const originalSlide=entries.get(slidePart65).toString('utf8');
 replaceSource65(entries,slidePart65,'Gebundene Folie',label+'SLIDE1');
 for(let index=2;index<=legacySlideCount65;index++){
  const slide=`ppt/slides/slide${index}.xml`,comments=legacyCommentPart65(index);
  replaceSource65(entries,'ppt/presentation.xml','</p:sldIdLst>',
   `<p:sldId id="${255+index}" r:id="slide${index}"/></p:sldIdLst>`);
  replaceSource65(entries,'ppt/_rels/presentation.xml.rels','</Relationships>',
   `<Relationship Id="slide${index}" Type="${R}/slide" Target="slides/slide${index}.xml"/></Relationships>`);
  replaceSource65(entries,'[Content_Types].xml','</Types>',
   `<Override PartName="/${slide}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`+
   `<Override PartName="/${comments}" ContentType="application/vnd.ms-powerpoint.comments+xml"/></Types>`);
  entries.set(slide,Buffer.from(originalSlide.replace('Gebundene Folie',label+'SLIDE'+index)));
  entries.set(`ppt/slides/_rels/slide${index}.xml.rels`,Buffer.from(rel('comments','../comments/'+comments.split('/').at(-1))));
  const payload=commentsFixture65({count:1,authorLength:8,prefix:label+'COMMENT'+index,idOffset:1000*index});
  entries.set(comments,Buffer.from(payload.get(commentPart65)));
 }
 return entries;
}
function legacyXmlWork65(entries){
 let bytes=0;
 for(let index=1;index<=legacySlideCount65;index++){
  for(const part of [`ppt/slides/_rels/slide${index}.xml.rels`,'ppt/_rels/presentation.xml.rels',
   '[Content_Types].xml','ppt/authors.xml',legacyCommentPart65(index)]){
   assert.ok(Buffer.isBuffer(entries.get(part)),part);
   bytes+=entries.get(part).length;
  }
 }
 return bytes;
}
function legacyEmbeddedGraph65(unusedAuthorLength){
 const parent=fixture(false),children=[];
 for(const [index,label]of ['CHILDONE','CHILDTWO'].entries()){
  const entries=legacyChild65(label,unusedAuthorLength),zip=zipStore([...entries]);
  children.push({entries,zip,label});
  const part=`ppt/embeddings/child${index+1}.pptx`;parent.set(part,zip);
  replaceSource65(parent,'[Content_Types].xml','</Types>',
   `<Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation"/></Types>`);
  replaceSource65(parent,'ppt/slides/_rels/slide1.xml.rels','</Relationships>',
   `<Relationship Id="embedded${index+1}" Type="${R}/package" Target="../embeddings/child${index+1}.pptx"/></Relationships>`);
 }
 return {parent,children};
}
function assertLegacyChild65(markdown,label){
 for(let index=1;index<=legacySlideCount65;index++){
  assert.match(markdown,new RegExp(label+'SLIDE'+index+'(?![0-9])','u'));
  assert.match(markdown,new RegExp(label+'COMMENT'+index+'0(?![0-9])','u'));
 }
}
let passed=0;function test(name,fn){fn();console.log(`PASS ${++passed} ${name}`);}
test('actual slide -> comment -> authors/MIME graph preserves Unicode, replies and distinct identities',()=>{const entries=fixture(),before=Buffer.concat([...entries.values()]);const result=readPresentationComments(entries,{slidePart:'ppt/slides/slide1.xml'});
 assert.equal(result.comments.length,2);assert.equal(result.comments[0].text,'Name: Max Mustermann\nHTTP/2');assert.equal(result.comments[1].text,'Antwort & ÄÖÜß\nHTTP/2');assert.equal(result.comments[1].parentId,C.toLowerCase());assert.equal(result.comments[0].author.name,'Anna Berger');assert.deepEqual(Buffer.concat([...entries.values()]),before);assert.ok(Object.isFrozen(result.comments[0]));});
// Block A: old-API countercase. It must reach the valid reader and fail on
// the old implementation's missing expanded budget, not on a missing new export.
test('65 A: exact8M valid comment source is admitted, one extra source unit is a limit',()=>{
 const exact=boundaryFixture65(),over=boundaryFixture65(1),before=sourceSnapshot65(exact),overBefore=sourceSnapshot65(over);
 const accepted=readPresentationComments(exact,{slidePart:slidePart65});
 assert.equal(accepted.comments.length,64);
 assert.equal(accepted.comments[0].author.name.length,123818);
 assert.equal(accepted.comments[63].text,paragraphText65);
 sameSource65(exact,before);
 assert.throws(()=>readPresentationComments(over,{slidePart:slidePart65}),{code:'PPTX_STRUCTURE_LIMIT'});
 sameSource65(over,overBefore);
});

// Block B: new opaque API and actual root-document wiring. Only these bodies
// require the new exports, and they execute after block A's old-API assertion.
test('65 B: shared expanded boundary, no reset/refund and independent fresh tokens',()=>{
 const api=workApi65(),exact=boundaryFixture65(),before=sourceSnapshot65(exact),token=api.createPresentationCommentBudget();
 assert.ok(Object.isFrozen(token));
 assert.equal(readPresentationComments(exact,{slidePart:slidePart65},token).comments.length,64);
 const small=commentsFixture65();
 for(let attempt=0;attempt<2;attempt++)assert.throws(()=>readPresentationComments(small,{slidePart:slidePart65},token),{code:'PPTX_STRUCTURE_LIMIT'});
 assert.equal(readPresentationComments(small,{slidePart:slidePart65},api.createPresentationCommentBudget()).comments.length,1);
 assert.equal(readPresentationComments(exact,{slidePart:slidePart65},api.createPresentationCommentBudget()).comments.length,64);
 sameSource65(exact,before);
});
test('65 B: every reply and distinct author reference is charged without merging identities',()=>{
 const api=workApi65();
 for(const [replies,distinctAuthors]of [[true,false],[false,true]]){
  const exact=boundaryFixture65(0,replies,distinctAuthors),over=boundaryFixture65(1,replies,distinctAuthors);
  const before=sourceSnapshot65(exact);
  const result=readPresentationComments(exact,{slidePart:slidePart65},api.createPresentationCommentBudget());
  assert.equal(result.comments.length,64);
  if(replies)for(const reply of result.comments.slice(1))assert.equal(reply.parentId,result.comments[0].id);
  if(distinctAuthors){
   assert.equal(result.comments[0].author.name,result.comments[1].author.name);
   assert.notStrictEqual(result.comments[0].author,result.comments[1].author);
  }
  assert.throws(()=>readPresentationComments(over,{slidePart:slidePart65},api.createPresentationCommentBudget()),{code:'PPTX_STRUCTURE_LIMIT'});
  sameSource65(exact,before);
 }
});
test('65 B: unknown or serialized budget tokens are policy errors, never fresh budgets',()=>{
 const api=workApi65(),entries=fixture(false),before=sourceSnapshot65(entries);
 let getters=0;
 const proxy=new Proxy({}, {get(){getters++;throw new Error('budget getter must not run');}});
 const token=api.createPresentationCommentBudget();
 for(const invalid of [null,false,0,'',{},Object.freeze({}),JSON.parse(JSON.stringify(token)),proxy])
  assert.throws(()=>readPresentationComments(entries,{slidePart:slidePart65},invalid),{code:'CONVERSION_POLICY_FAILED'});
 assert.equal(getters,0);sameSource65(entries,before);
});
test('65 B: exact64MiB repeated XML, one-byte-over and exhausted no-edge behavior',()=>{
 const api=workApi65(),perRead=1024*1024;
 const base=commentsFixture65({unusedAuthorLength:0});
 const unusedLength=perRead-xmlCost65(base);
 assert.ok(unusedLength>0&&unusedLength<1048576);
 const entries=commentsFixture65({unusedAuthorLength:unusedLength}),before=sourceSnapshot65(entries);
 assert.equal(xmlCost65(entries),perRead);
 const repeats=api.PRESENTATION_COMMENT_WORK_LIMITS.xmlBytes/perRead;assert.equal(repeats,64);
 const token=api.createPresentationCommentBudget();
 for(let index=0;index<repeats;index++)assert.equal(readPresentationComments(entries,{slidePart:slidePart65},token).comments.length,1);
 assert.throws(()=>readPresentationComments(entries,{slidePart:slidePart65},token),{code:'PPTX_STRUCTURE_LIMIT'});
 const noEdge=fixture(false);noEdge.delete('ppt/slides/_rels/slide1.xml.rels');
 assert.deepEqual(readPresentationComments(noEdge,{slidePart:slidePart65},token).comments,[]);
 const oneByteOver=new Map([...entries].map(([name,value])=>[name,Buffer.from(value)]));
 oneByteOver.set(commentPart65,Buffer.concat([oneByteOver.get(commentPart65),Buffer.from(' ')]));
 assert.equal(xmlCost65(oneByteOver),perRead+1);
 // Valid source independent of work debt: trailing XML whitespace is legal.
 assert.equal(readPresentationComments(oneByteOver,{slidePart:slidePart65},api.createPresentationCommentBudget()).comments.length,1);
 const almost=api.createPresentationCommentBudget();
 for(let index=0;index<repeats-1;index++)assert.equal(readPresentationComments(entries,{slidePart:slidePart65},almost).comments.length,1);
 assert.throws(()=>readPresentationComments(oneByteOver,{slidePart:slidePart65},almost),{code:'PPTX_STRUCTURE_LIMIT'});
 sameSource65(entries,before);
});
test('65 B: real two-slide OPC keeps both slides while shared debt quarantines only later comments',()=>{
 const api=workApi65(),entries=twoSlides65(),before=sourceSnapshot65(entries);
 for(const [slidePart,prefix]of [[slidePart65,'FIRSTCOMMENT'],['ppt/slides/slide2.xml','SECONDCOMMENT']]){
  const standalone=readPresentationComments(entries,{slidePart},api.createPresentationCommentBudget());
  assert.equal(standalone.comments.length,40);assert.ok(standalone.comments[0].text.startsWith(prefix+'0'));
 }
 const source=zipStore([...entries]),sourceBefore=Buffer.from(source);
 const out=extractMarkdownBuffer(source,'.pptx',{markdownOutput:'content-v1',partialExtraction:true});
 assert.match(out.markdown,/Gebundene Folie/u);assert.match(out.markdown,/SECOND SLIDE SOURCE/u);
 assert.match(out.markdown,/FIRSTCOMMENT0/u);assert.doesNotMatch(out.markdown,/SECONDCOMMENT/u);
 assert.ok(out.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
 assert.ok(!out.coverage.reason_codes.includes('TEXT_LIMIT_PARTIAL'),'the comment-work gate precedes final text dropping');
 assert.deepEqual(source,sourceBefore);sameSource65(entries,before);
 // The exported direct engineering parser owns one default budget for its
 // whole call, but has no owned partial-state Map to authorize quarantine.
 const {parsePptx}=require('../plugins/data-secure/server/ooxml');
 assert.throws(()=>parsePptx(entries,{contentMode:true,preserveText:true,literalMarkup:true}),{code:'PPTX_STRUCTURE_LIMIT'});
 sameSource65(entries,before);
});
test('65 B: strict Standalone still refuses the original embedded PPTX parent before comments',()=>{
 workApi65();
 const {parseOoxml}=require('../plugins/data-secure/server/ooxml');
 const {parent,children}=embeddedPresentations65(),before=sourceSnapshot65(parent);
 // Keep the original independent child positives. The parent refusal is
 // the actual unchanged Standalone format policy, not a comment-budget PASS.
 for(const child of children){
  const childBefore=Buffer.from(child.zip);
  const standalone=extractMarkdownBuffer(child.zip,'.pptx',{markdownOutput:'content-v1',partialExtraction:true});
  assert.ok(standalone.markdown.includes(child.label+' SLIDE SOURCE'));
  assert.ok(standalone.markdown.includes(child.label+'COMMENT0'));
  assert.ok(!standalone.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
  assert.deepEqual(child.zip,childBefore);
 }
 const source=zipStore([...parent]),sourceBefore=Buffer.from(source);
 assert.throws(()=>parseOoxml(source,'.pptx',undefined,
  {contentMode:true,preserveText:true,literalMarkup:true,partialExtraction:true}),
  {code:'SOURCE_ACTIVE_CONTENT_UNSUPPORTED'});
 assert.throws(()=>extractMarkdownBuffer(source,'.pptx',{markdownOutput:'content-v1',partialExtraction:true}),
  {code:'MARKDOWN_EXTRACTION_FAILED'});
 assert.deepEqual(source,sourceBefore);sameSource65(parent,before);
});

test('65 B: legacy embedded graph shares XML-work debt with small output; no Standalone claim',()=>{
 const api=workApi65(),{parseOoxml}=require('../plugins/data-secure/server/ooxml');
 // Deliberately only the actual legacy parser entrance. No copied internal
 // state/partial-state DTO, runtime bypass, test hook or altered product gate.
 const options=Object.freeze({contentMode:true,preserveText:true,literalMarkup:true,partialExtraction:false});
 const refused=/Eingebettetes OOXML-Dokument konnte nicht vollständig geprüft werden/u;
 const readLegacy=source=>parseOoxml(source,'.pptx',undefined,options);
 const small=legacyEmbeddedGraph65(64),smallBefore=sourceSnapshot65(small.parent);
 assert.ok(xmlCost65(small.parent)+small.children.reduce((sum,child)=>sum+legacyXmlWork65(child.entries),0)<
  api.PRESENTATION_COMMENT_WORK_LIMITS.xmlBytes);
 const smallSource=zipStore([...small.parent]),smallSourceBefore=Buffer.from(smallSource);
 const control=readLegacy(smallSource);
 for(const child of small.children)assertLegacyChild65(control.markdown,child.label);
 assert.ok(!control.warnings.some(value=>refused.test(value)));
 assert.ok(control.markdown.length<1000000,'small reference graph remains far below output limits');
 assert.deepEqual(smallSource,smallSourceBefore);sameSource65(small.parent,smallBefore);

 const large=legacyEmbeddedGraph65(1024*1024),largeBefore=sourceSnapshot65(large.parent);
 const limit=api.PRESENTATION_COMMENT_WORK_LIMITS.xmlBytes;
 const costs=large.children.map(child=>legacyXmlWork65(child.entries));
 assert.ok(costs.every(cost=>cost<limit),'each child XML-work budget fits independently');
 assert.ok(xmlCost65(large.parent)+costs.reduce((sum,cost)=>sum+cost,0)>limit,
  'the combined graph crosses the actual XML-work ceiling');
 assert.ok(large.children.reduce((sum,child)=>sum+child.zip.length,0)<8*1024*1024,
  'no embedded archive-byte exhaustion');
 assert.ok(large.children.reduce((sum,child)=>sum+[...child.entries.values()].reduce((n,b)=>n+b.length,0),0)<8*1024*1024,
  'no embedded expanded-byte exhaustion');
 for(const child of large.children){
  const childBefore=sourceSnapshot65(child.entries),zipBefore=Buffer.from(child.zip);
  const isolated=readLegacy(child.zip);
  assertLegacyChild65(isolated.markdown,child.label);
  assert.ok(!isolated.warnings.some(value=>refused.test(value)));
  assert.ok(isolated.markdown.length<1000000,'large unused author is not repeated into output');
  assert.deepEqual(child.zip,zipBefore);sameSource65(child.entries,childBefore);
 }
 const source=zipStore([...large.parent]),sourceBefore=Buffer.from(source),composed=readLegacy(source);
 assert.match(composed.markdown,/Gebundene Folie/u);
 assertLegacyChild65(composed.markdown,'CHILDONE');
 // Nonpartial legacy catches a failed child as a whole; it does not have
 // Standalone partial-state authority to keep that child's earlier slides.
 assert.doesNotMatch(composed.markdown,/CHILDTWO(?:SLIDE|COMMENT)/u);
 assert.equal(composed.warnings.filter(value=>refused.test(value)).length,1);
 assert.ok(composed.markdown.length<1000000,'final8M text budget cannot explain this refusal');
 assert.ok(!composed.warnings.includes('TEXT_LIMIT_PARTIAL'));
 assert.deepEqual(source,sourceBefore);sameSource65(large.parent,largeBefore);
 // Even this small-output graph is not newly admitted by strict Standalone.
 assert.throws(()=>parseOoxml(source,'.pptx',undefined,{...options,partialExtraction:true}),
  {code:'SOURCE_ACTIVE_CONTENT_UNSUPPORTED'});
 assert.deepEqual(source,sourceBefore);sameSource65(large.parent,largeBefore);
});
test('65 B: ordinary author protection and malformed-comment rules remain unchanged',()=>{
 const api=workApi65(),entries=fixture(false),before=sourceSnapshot65(entries);
 const result=readPresentationComments(entries,{slidePart:slidePart65},api.createPresentationCommentBudget());
 assert.equal(result.comments[0].author.name,'Anna Berger');
 const source=zipStore([...entries]),sourceBefore=Buffer.from(source);
 const extracted=extractMarkdownBuffer(source,'.pptx',{markdownOutput:'content-v1',partialExtraction:true});
 assert.match(extracted.markdown,/\| Geschützter Tabellenwert \|\n\| --- \|\n\| Anna Berger \|/u);
 const malformed=fixture(false);
 replaceSource65(malformed,commentPart65,`authorId="${A}"`,`authorId="${C2}"`);
 assert.throws(()=>readPresentationComments(malformed,{slidePart:slidePart65},api.createPresentationCommentBudget()),{code:'PPTX_STRUCTURE_UNSAFE'});
 assert.deepEqual(source,sourceBefore);sameSource65(entries,before);
 // The existing async actual privacy/trace/publication/Keep matrix below
 // remains verbatim and still runs on the same normal source factories.
});
test('orphan metadata cannot become comment text',()=>{const e=fixture();e.delete('ppt/slides/_rels/slide1.xml.rels');assert.deepEqual(readPresentationComments(e,{slidePart:'ppt/slides/slide1.xml'}).comments,[]);});
test('upper/mixed-case hex names retain exact relationship, MIME and Unicode comment binding',()=>{
 for(const name of ['modernComment_7ABCDEF0_1B2C3D4E.xml','modernComment_7AbCdEf0_1b2C3d4E.xml']){
  const e=namedFixture(name),snapshot=Buffer.concat([...e.values()]);
  const out=readPresentationComments(e,{slidePart:'ppt/slides/slide1.xml'});
  assert.equal(out.comments.length,2);assert.equal(out.comments[0].source_part,`ppt/comments/${name}`);
  assert.equal(out.comments[1].text,'Antwort & ÄÖÜß\nHTTP/2');
  const result=extractMarkdownBuffer(zipStore([...e]),'.pptx',{markdownOutput:'content-v1',partialExtraction:true});
  assert.equal(result.markdown.split('Max Mustermann').length-1,1);
  assert.ok(!result.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
  assert.deepEqual(Buffer.concat([...e.values()]),snapshot);
 }
});
test('uppercase support never case-folds an absent entry or MIME override and never admits nonhex names',()=>{
 const name='modernComment_7ABCDEF0_1B2C3D4E.xml';
 for(const modify of [
  e=>{const part=`ppt/comments/${name}`;e.set(part.toLowerCase(),e.get(part));e.delete(part);},
  e=>e.set('[Content_Types].xml',Buffer.from(e.get('[Content_Types].xml').toString().replace(name,name.toLowerCase()))),
  e=>e.set('[Content_Types].xml',Buffer.from(e.get('[Content_Types].xml').toString().replace('application/vnd.ms-powerpoint.comments+xml','text/plain')))
 ]){const e=namedFixture(name);modify(e);assert.throws(()=>readPresentationComments(e,{slidePart:'ppt/slides/slide1.xml'}),{code:'PPTX_STRUCTURE_UNSAFE'});}
 for(const invalid of ['modernComment_ABC_G1.xml','modernComment_ABC_DEF.XML','ModernComment_ABC_DEF.xml'])
  assert.throws(()=>readPresentationComments(namedFixture(invalid),{slidePart:'ppt/slides/slide1.xml'}),{code:'PPTX_STRUCTURE_UNSAFE'});
});
test('external, wrong-role, duplicate-edge and MIME mismatch stay closed',()=>{for(const modify of [
 e=>e.set('ppt/slides/_rels/slide1.xml.rels',Buffer.from(rel('comments','https://bad.invalid/x'))),
 e=>e.set('ppt/_rels/presentation.xml.rels',Buffer.from(rel('comments','authors.xml'))),
 e=>e.set('ppt/slides/_rels/slide1.xml.rels',Buffer.from(rel('comments','../comments/modernComment_a_b.xml').replace('</Relationships>',`<Relationship Id="r2" Type="http://schemas.microsoft.com/office/2018/10/relationships/comments" Target="../comments/modernComment_a_b.xml"/></Relationships>`))),
 e=>e.set('[Content_Types].xml',Buffer.from(e.get('[Content_Types].xml').toString().replace('application/vnd.ms-powerpoint.comments+xml','text/plain')))]){const e=fixture();modify(e);assert.throws(()=>readPresentationComments(e,{slidePart:'ppt/slides/slide1.xml'}),{code:'PPTX_STRUCTURE_UNSAFE'});}});
test('duplicate/missing author, duplicate comment and foreign text never get display repair',()=>{for(const modify of [
 x=>x.replace(`authorId="${A}"`,`authorId="${C2}"`),x=>x.replace(`id="${C2}"`,`id="${C}"`),x=>x.replace('Name: Max Mustermann','<evil>secret</evil>'),
 x=>x.replace('<p:cmLst','<p:cmLst').replace('Name: Max Mustermann','&#x0;')]){const e=fixture();e.set('ppt/comments/modernComment_a_b.xml',Buffer.from(modify(e.get('ppt/comments/modernComment_a_b.xml').toString())));assert.throws(()=>readPresentationComments(e,{slidePart:'ppt/slides/slide1.xml'}));}});
test('real OPC -> default content Markdown includes slide and comment bodies exactly once',()=>{const e=fixture(),zip=zipStore([...e]),result=extractMarkdownBuffer(zip,'.pptx',{markdownOutput:'content-v1',partialExtraction:true});
 assert.match(result.markdown,/Gebundene Folie/u);assert.equal(result.markdown.split('Max Mustermann').length-1,1);assert.match(result.markdown,/Anna Berger/u);assert.match(result.markdown,/Antwort &amp; ÄÖÜß/u);assert.ok(result.coverage.reason_codes.includes('SOURCE_COVERAGE_UNVERIFIED'));});
test('comment body never traverses MC alternatives, foreign wrappers or nested paragraph owners',()=>{
 for(const wrapper of ['<evil:box xmlns:evil="urn:foreign">$</evil:box>',
 '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="p">$</mc:Choice><mc:Fallback>$</mc:Fallback></mc:AlternateContent>',
 '<a:p>$</a:p>']){
  const e=fixture(false),part='ppt/comments/modernComment_a_b.xml',xml=e.get(part).toString(),paragraph=/<a:p>[\s\S]*?<\/a:p>/u.exec(xml)[0];
  e.set(part,Buffer.from(xml.replace(paragraph,wrapper.replaceAll('$',paragraph))));
  assert.throws(()=>readPresentationComments(e,{slidePart:'ppt/slides/slide1.xml'}),{code:'PPTX_STRUCTURE_UNSAFE'});
  const out=extractMarkdownBuffer(zipStore([...e]),'.pptx',{markdownOutput:'content-v1',partialExtraction:true});assert.match(out.markdown,/Gebundene Folie/u);assert.doesNotMatch(out.markdown,/Max Mustermann/u);
 }
});
(async()=>{
 const {prepareTextPrivacyReview,resolveTextPrivacyReview,finalizeTextPrivacyReview}=require('../plugins/data-secure/server/gateway/privacy-text-operation');
 const {extractSourceForPrivacy}=require('../plugins/data-secure/server/core/markdown-first-privacy');
 const {createMarkdownExtraction}=require('../plugins/data-secure/server/standalone/markdown-contract');
 const {replayTransformTrace}=require('../plugins/data-secure/server/privacy/transform-plan');
 const {verifyAnonymizedPublication}=require('../plugins/data-secure/server/standalone/anonymized-artifact');
 const {initialEntities,applyEntityDecisions}=require('../plugins/data-secure/server/gateway/standalone-entity-review');
 const {bindStandaloneDocumentKeeps}=require('../plugins/data-secure/server/privacy/residual-person-review');
 for(const profile of ['general','personnel_profile'])for(const weak of [false,true])for(const name of ['modernComment_a_b.xml','modernComment_7ABCDEF0_1B2C3D4E.xml','modernComment_7AbCdEf0_1b2C3d4E.xml']){
  const entries=namedFixture(name),part=`ppt/comments/${name}`;if(weak)entries.set(part,Buffer.from(entries.get(part).toString().replace('Max Mustermann','Qvx / Qvy')));
  const source=zipStore([...entries]),base=extractMarkdownBuffer(source,'.pptx',{markdownOutput:'content-v1',partialExtraction:true});
  const contentOptions={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false};
  const extracted=await extractSourceForPrivacy(source,'.pptx',{contentOptions,convertBuffer:async()=>createMarkdownExtraction({source_type:'pptx',markdown:base.markdown,coverage:base.coverage,content_options:contentOptions})});
  const prepared=prepareTextPrivacyReview({text:extracted.markdown,profile,productChannel:'standalone',consumerOptions:{productChannel:'standalone',contentOptions},registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
  const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'}),final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
  assert.doesNotMatch(final.markdown,/Anna Berger|Max Mustermann|anna@example|Qvx|Qvy/u);assert.match(final.markdown,/HTTP\/2/u);assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
  const proof={markdown:final.markdown,profile,content_options:contentOptions,source_extraction:extracted.sourceExtraction,dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates};
  assert.ok(verifyAnonymizedPublication(proof));
  const entities=initialEntities({markdown:final.markdown,transform_trace:final.transform_trace});
  const target=entities.find(entity=>(weak?/Qvx/u:/Max Mustermann/u).test(entity.original));assert.ok(target);
  const kept=applyEntityDecisions(final.markdown,entities,[{entity_id:target.entity_id,decision:'keep'}],Buffer.alloc(32,23));
  const keep=bindStandaloneDocumentKeeps(kept.markdown,[],kept.entities.filter(entity=>entity.decision==='keep').map(({start,end})=>({start,end})));
  assert.throws(()=>verifyAnonymizedPublication({...proof,markdown:kept.markdown,reviewed_person_candidates:keep}),{code:'STANDALONE_PUBLICATION_INVALID'});
  console.log(`PASS ${++passed} real OPC comment -> source/author privacy/trace/publication ${profile}/weak=${weak}/${name}`);
 }
 console.log(`${passed} modern presentation comment groups passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
