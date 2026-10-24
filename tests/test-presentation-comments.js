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
let passed=0;function test(name,fn){fn();console.log(`PASS ${++passed} ${name}`);}
test('actual slide -> comment -> authors/MIME graph preserves Unicode, replies and distinct identities',()=>{const entries=fixture(),before=Buffer.concat([...entries.values()]);const result=readPresentationComments(entries,{slidePart:'ppt/slides/slide1.xml'});
 assert.equal(result.comments.length,2);assert.equal(result.comments[0].text,'Name: Max Mustermann\nHTTP/2');assert.equal(result.comments[1].text,'Antwort & ÄÖÜß\nHTTP/2');assert.equal(result.comments[1].parentId,C.toLowerCase());assert.equal(result.comments[0].author.name,'Anna Berger');assert.deepEqual(Buffer.concat([...entries.values()]),before);assert.ok(Object.isFrozen(result.comments[0]));});
test('orphan metadata cannot become comment text',()=>{const e=fixture();e.delete('ppt/slides/_rels/slide1.xml.rels');assert.deepEqual(readPresentationComments(e,{slidePart:'ppt/slides/slide1.xml'}).comments,[]);});
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
 for(const profile of ['general','personnel_profile'])for(const weak of [false,true]){
  const entries=fixture();if(weak)entries.set('ppt/comments/modernComment_a_b.xml',Buffer.from(entries.get('ppt/comments/modernComment_a_b.xml').toString().replace('Max Mustermann','Qvx / Qvy')));
  const source=zipStore([...entries]),base=extractMarkdownBuffer(source,'.pptx',{markdownOutput:'content-v1',partialExtraction:true});
  const contentOptions={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false};
  const extracted=await extractSourceForPrivacy(source,'.pptx',{contentOptions,convertBuffer:async()=>createMarkdownExtraction({source_type:'pptx',markdown:base.markdown,coverage:base.coverage,content_options:contentOptions})});
  const prepared=prepareTextPrivacyReview({text:extracted.markdown,profile,productChannel:'standalone',consumerOptions:{productChannel:'standalone',contentOptions},registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
  const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'}),final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
  assert.doesNotMatch(final.markdown,/Anna Berger|Max Mustermann|anna@example|Qvx|Qvy/u);assert.match(final.markdown,/HTTP\/2/u);assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
  assert.ok(verifyAnonymizedPublication({markdown:final.markdown,profile,content_options:contentOptions,source_extraction:extracted.sourceExtraction,dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates}));
  console.log(`PASS ${++passed} real OPC comment -> source/author privacy/trace/publication ${profile}/weak=${weak}`);
 }
 console.log(`${passed} modern presentation comment groups passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
