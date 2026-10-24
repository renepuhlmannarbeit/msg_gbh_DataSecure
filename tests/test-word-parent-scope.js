'use strict';

// Actual in-memory OPC sources, extraction, both privacy profiles and publication
// proof. A cache/object boundary is not an outer paragraph value boundary.
const crypto=require('node:crypto');
const {createSuite}=require('./helpers');
const {zipStore}=require('./lib/zip'),{opcControlEntries}=require('./lib/opc');
const {extractMarkdownBuffer}=require('../plugins/data-secure/server/standalone/markdown-extractor');
const {extractSourceForPrivacy}=require('../plugins/data-secure/server/core/markdown-first-privacy');
const {createMarkdownExtraction}=require('../plugins/data-secure/server/standalone/markdown-contract');
const {prepareTextPrivacyReview,resolveTextPrivacyReview,finalizeTextPrivacyReview}=require('../plugins/data-secure/server/gateway/privacy-text-operation');
const {replayTransformTrace}=require('../plugins/data-secure/server/privacy/transform-plan');
const {verifyAnonymizedPublication}=require('../plugins/data-secure/server/standalone/anonymized-artifact');
const {initialEntities,applyEntityDecisions}=require('../plugins/data-secure/server/gateway/standalone-entity-review');
const {bindStandaloneDocumentKeeps}=require('../plugins/data-secure/server/privacy/residual-person-review');
const {test,testAsync,assert,done}=createSuite('Actual Word parent field-scope preservation');
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',M='http://schemas.openxmlformats.org/officeDocument/2006/math',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',PK='http://schemas.openxmlformats.org/package/2006/relationships';
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const run=s=>`<w:r><w:t xml:space="preserve">${esc(s)}</w:t></w:r>`,p=s=>`<w:p>${run(s)}</w:p>`;
const simple=s=>`<w:fldSimple w:instr="MERGEFIELD UNEXECUTED">${run(s)}</w:fldSimple>`;
const char=s=>`<w:r><w:fldChar w:fldCharType="${s}"/></w:r>`;
const field=s=>char('begin')+`<w:r><w:instrText>INCLUDETEXT file:///NEVER_READ</w:instrText></w:r>`+char('separate')+run(s)+char('end');
function doc(body,parts={}){
 const entries=[...opcControlEntries('docx',{additionalOverrides:Object.keys(parts).map(n=>({part:`word/${n}.xml`,contentType:`application/vnd.openxmlformats-officedocument.wordprocessingml.${n}+xml`}))}),
  ['word/document.xml',`<w:document xmlns:w="${W}" xmlns:m="${M}"><w:body>${body}</w:body></w:document>`],...Object.entries(parts).map(([n,v])=>[`word/${n}.xml`,v])];
 if(Object.keys(parts).length)entries.push(['word/_rels/document.xml.rels',`<Relationships xmlns="${PK}">${Object.keys(parts).map(n=>`<Relationship Id="${n}" Type="${R}/${n}" Target="${n}.xml"/>`).join('')}</Relationships>`]);
 return zipStore(entries);
}
const box=`<w:r><w:drawing xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:txbx><w:txbxContent>${p('Protokoll: HTTP/2 FHIR REST HL7')}</w:txbxContent></wps:txbx></wps:wsp></w:drawing></w:r>`;
const math=value=>`<m:oMath><m:r><m:t>${esc(value)}</m:t></m:r></m:oMath>`;
const commentBody=body=>({comments:`<w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="Anna Berger">${body}</w:comment></w:comments>`});
const commentRef=`<w:p>${run('HTTP/2 FHIR 123')}<w:r><w:commentReference w:id="0"/></w:r></w:p>`;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
test('actual wide cell below existing source limits uses iteration, not VM argument expansion',()=>{
 const input=doc(`<w:tbl><w:tr><w:tc>${'<w:p/>'.repeat(140000)}${p('WIDTH_CONTROL_SENTINEL')}</w:tc></w:tr></w:tbl>`),before=sha(input);
 const output=extractMarkdownBuffer(input,'.docx',{markdownOutput:'content-v1'});
 assert.equal(output.markdown.split('WIDTH\\_CONTROL\\_SENTINEL').length-1,1);assert.equal(sha(input),before);
});
test('wide traversal still refuses the original finite Word structure-node budget with a typed limit',()=>{
 const input=doc(`<w:tbl><w:tr><w:tc>${'<w:p/>'.repeat(200001)}${p('NOT_REACHED')}</w:tc></w:tr></w:tbl>`);
 const {parseOoxml}=require('../plugins/data-secure/server/ooxml');
 assert.throws(()=>parseOoxml(input,'.docx',undefined,{preserveText:true,contentMode:true,literalMarkup:true}),{code:'DOCX_STRUCTURE_LIMIT'});
});
const original=[
 ['one real field with closed Name prefix',doc(`<w:p>${run('Name: ')}${field('Qdx / Qdy')}${run(' HTTP/2 FHIR 123')}</w:p>`),'a6ca3e6c8a542d69268203bb01bbd6ba3240f28dba22b800672dde9bdadeb4fb'],
 ['Name partly ordinary, partly saved',doc(`<w:p>${run('Name: Qdx')}${simple(' / Qdy')}${run(' HTTP/2 FHIR 123')}</w:p>`),'0ccff7e1766dc4ccc944234c0183a272de1886270058eec906fd513b9cec7bca'],
 ['Name over two real simple fields',doc(`<w:p>${run('Name: ')}${simple('Qdx')}${run(' / ')}${simple('Qdy')}${run(' HTTP/2 FHIR 123')}</w:p>`),'39570c8f41767a382be0ad86de22b2a32cd0f19b55d45cfb91d39d5ec2a67794'],
 ['Name over two real complex fields',doc(`<w:p>${run('Name: ')}${field('Qdx')}${run(' / ')}${field('Qdy')}${run(' HTTP/2 FHIR 123')}</w:p>`),'b7d4c928cf75e24799d7adcac9b77e742aa1a1c9964aca450fb01206bc313cc3'],
 ['selected revision with sibling fields',doc(`<w:p><w:ins w:id="8">${run('Name: ')}${simple('Qdx')}${run(' / ')}${simple('Qdy')}</w:ins>${run(' HTTP/2 FHIR 123')}</w:p>`),'decaa00ebf7613c2aa3af6aae8d55de55cc4a8735f6981d279a21d13dc5c71d2'],
 ['outer Name then Math and a technical-looking field',doc(`<w:p>${run('Name: ')}${math('Qdx / Qdy')}${field('TECHNICALFIELD')}${run(' HTTP/2 FHIR 123')}</w:p>`),'6748adbf0d8b2ef43305de7474a77f5f14c0dc0c24fb2a69d20ede9fe0171b0e'],
 ['comment paragraph with independent nested textbox',doc(commentRef,commentBody(`<w:p>${run('Name: Qdx / Qdy')}${box}</w:p>`)),'88397979e5f132a1be05550a9120316902e1bbaaab69b472f5b9731b58063ebc']
];
const cases=original.map(([name,bytes,pin],index)=>({name,bytes,pin,innerFacts:index===6}));
cases.push(
 {name:'ordinary outer Name across inline Math',bytes:doc(`<w:p>${run('Name: Qdx')}${math('1')}${run(' / Qdy')}</w:p>`)},
 {name:'saved Name across inline Math',bytes:doc(`<w:p>${run('Name: ')}${simple('Qdx')}${math('1')}${run(' / Qdy')}</w:p>`)},
 {name:'saved Name resumes after independent textbox owner',bytes:doc(`<w:p>${simple('Name: Qdx')}${box}${run(' / Qdy')}</w:p>`),innerFacts:true},
 {name:'ordinary Name resumes after independent textbox owner',bytes:doc(`<w:p>${run('Name: Qdx')}${box}${run(' / Qdy')}</w:p>`),innerFacts:true},
 {name:'comment outer Name resumes after independent textbox owner',bytes:doc(commentRef,commentBody(`<w:p>${run('Name: Qdx')}${box}${run(' / Qdy')}</w:p>`)),innerFacts:true},
 {name:'selected revision outer Name across nested textbox owner',bytes:doc(`<w:p><w:ins w:id="8">${run('Name: Qdx')}${box}${run(' / Qdy')}</w:ins></w:p>`),innerFacts:true},
 {name:'real table cell owns sibling saved Name fragments',bytes:doc(`<w:tbl><w:tr><w:tc><w:p>${run('Name: ')}${simple('Qdx')}${run(' / ')}${simple('Qdy')}</w:p></w:tc></w:tr></w:tbl>`)},
 {name:'cross-paragraph saved Name retains duty after field end',bytes:doc(`<w:p>${char('begin')}${char('separate')}${run('Name:')}</w:p><w:p>${run('Qdx')}${char('end')}${run(' / Qdy')}</w:p>`)},
 {name:'independent Math Name does not authorize outer prose masking',bytes:doc(`<w:p>${math('Name: Qdx / Qdy')}${run('Protokoll: HTTP/2 FHIR REST HL7')}</w:p>`),innerFacts:true},
 {name:'real separate parent paragraphs keep independent facts',bytes:doc(`<w:p>${run('Name: ')}${simple('Qdx')}${run(' / ')}${simple('Qdy')}</w:p>${p('Protokoll: HTTP/2 FHIR REST HL7')}`),innerFacts:true}
);
const contentOptions={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false};
for(const item of cases)for(const profile of ['general','personnel_profile'])testAsync(item.name+' / '+profile,async()=>{
 const before=sha(item.bytes);if(item.pin)assert.equal(before,item.pin,'unchanged original RED input');
 const source=await extractSourceForPrivacy(item.bytes,'.docx',{contentOptions,convertBuffer:async bytes=>{
  const out=extractMarkdownBuffer(bytes,'.docx',{markdownOutput:'content-v1',partialExtraction:true});
  return createMarkdownExtraction({source_type:out.source_type,markdown:out.markdown,coverage:out.coverage,content_options:contentOptions});
 }});
 for(const value of ['Qdx','Qdy'])assert.equal(source.markdown.split(value).length-1,1,'actual source leaf once: '+value);
 assert.ok(source.markdown.indexOf('Qdx')<source.markdown.indexOf('Qdy'));
 assert.doesNotMatch(source.markdown,/UNEXECUTED|NEVER.READ|MERGEFIELD|INCLUDETEXT/u);
 const prepared=prepareTextPrivacyReview({text:source.markdown,profile,productChannel:'standalone',consumerOptions:{productChannel:'standalone',contentOptions},registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
 const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'}),final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
 assert.doesNotMatch(final.markdown,/Qdx|Qdy|Anna Berger/u);assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
 if(item.innerFacts){assert.equal(source.markdown.split('Protokoll: HTTP/2 FHIR REST HL7').length-1,1);assert.match(final.markdown,/Protokoll: HTTP\/2 FHIR REST HL7/u);}
 if(source.markdown.includes('TECHNICALFIELD'))assert.ok(!final.markdown.includes('TECHNICALFIELD'),'no ordinary same-parent allowlist');
 const proof={markdown:final.markdown,profile,content_options:contentOptions,source_extraction:source.sourceExtraction,dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates};
 assert.ok(verifyAnonymizedPublication(proof));
 const entities=initialEntities({markdown:final.markdown,transform_trace:final.transform_trace});
 for(const value of ['Qdx','Qdy']){
  const target=entities.find(entity=>entity.original.includes(value));assert.ok(target,'actual trace entity for '+value);
  const kept=applyEntityDecisions(final.markdown,entities,[{entity_id:target.entity_id,decision:'keep'}],Buffer.alloc(32,17));
  assert.throws(()=>verifyAnonymizedPublication({...proof,markdown:kept.markdown,reviewed_person_candidates:bindStandaloneDocumentKeeps(kept.markdown,[],kept.entities.filter(entity=>entity.decision==='keep').map(({start,end})=>({start,end})))}),{code:'STANDALONE_PUBLICATION_INVALID'});
 }
 assert.equal(sha(item.bytes),before);
});
done();
