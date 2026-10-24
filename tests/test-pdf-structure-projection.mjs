import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {taggedPdfTextLayout}=require('../plugins/data-secure/server/standalone/pdf-structure-layout');
const {projectTaggedPdf}=require('../plugins/data-secure/server/standalone/pdf-structure-projection');
const {prepareTextPrivacyReview,resolveTextPrivacyReview,finalizeTextPrivacyReview}=require('../plugins/data-secure/server/gateway/privacy-text-operation');
const {replayTransformTrace}=require('../plugins/data-secure/server/privacy/transform-plan');
const {createMarkdownExtraction}=require('../plugins/data-secure/server/standalone/markdown-contract');
const {extractSourceForPrivacy}=require('../plugins/data-secure/server/core/markdown-first-privacy');
const {verifyAnonymizedPublication}=require('../plugins/data-secure/server/standalone/anonymized-artifact');
const C=id=>({type:'content',id:`p3R_mc${id}`}),P=id=>({role:'P',children:[C(id)]});
const run=(str,x,y)=>({str,dir:'ltr',hasEOL:true,width:Math.max(1,str.length*5),transform:[12,0,0,12,x,y]});
function tagged(values,model){const items=values.flatMap(([text,x,y],id)=>[{type:'beginMarkedContentProps',id:`p3R_mc${id}`},run(text,x,y),{type:'endMarkedContent'}]);
  return taggedPdfTextLayout({items,structureTree:{role:'Root',children:[{role:'Document',children:model}]},pageNumber:1,pageRef:{num:3,gen:0}});}
let count=0;async function test(name,fn){await fn();console.log(`PASS ${++count} ${name}`);}
await test('production projection orders whole paragraphs while escaping source Markdown literally',()=>{
 const model=tagged([['Right',250,200],['# Left | [x](https://bad.invalid)',10,200]], [P(1),P(0)]);
 assert.equal(model.applied,true);const result=projectTaggedPdf(model);assert.ok(result.markdown.indexOf('Left')<result.markdown.indexOf('Right'));
 assert.match(result.markdown,/\\# Left \\\| \\\[x\\\]/u);assert.equal(result.omittedSymbols,false);assert.equal(projectTaggedPdf({applied:false}),null);
});
const table=(header)=>({role:'Table',children:header?[{role:'THead',children:[{role:'TR',children:[{role:'TH',children:[P(0)]},{role:'TH',children:[P(1)]}]}]},
 {role:'TBody',children:[{role:'TR',children:[{role:'TD',children:[P(2)]},{role:'TD',children:[P(3)]}]}]}]:[
 {role:'TR',children:[{role:'TD',children:[P(0)]},{role:'TD',children:[P(1)]}]},
 {role:'TR',children:[{role:'TD',children:[P(2)]},{role:'TD',children:[P(3)]}]}]});
await test('actual THead authority and literal cell escaping retain German, pipes, slashes and multiline',()=>{
 const model=tagged([['Name',10,300],['Fachtext',250,300],['ÄÖÜß | \\ [x]\nweiter',10,250],['HTTP/2',250,250]],[table(true)]);
 assert.equal(model.applied,true);const result=projectTaggedPdf(model);assert.match(result.markdown,/^\| Name/u);assert.match(result.markdown,/ÄÖÜß \\\| \\\\ \\\[x\\\]<br>weiter/u);
 assert.match(result.markdown,/HTTP\/2/u);
});
for(const header of [true,false])for(const profile of ['general','personnel_profile'])await test(`production table projection -> Source/Privacy/Trace/Publication ${header}/${profile}`,async()=>{
 const values=header?[['Name',10,300],['Fachtext',250,300],['Qvx / Qvy',10,250],['HTTP/2',250,250]]:
 [['Name',10,300],['Qvx / Qvy',250,300],['Fachtext',10,250],['HTTP/2',250,250]];
 const layout=tagged(values,[table(header)]);assert.equal(layout.applied,true);const markdown=projectTaggedPdf(layout).markdown;
 const contentOptions={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false};
 const extracted=await extractSourceForPrivacy(Buffer.from('%PDF-synthetic-owned-source'),'.pdf',{contentOptions,convertBuffer:async()=>
 createMarkdownExtraction({source_type:'pdf',markdown,content_options:contentOptions,coverage:{status:'incomplete',reason_codes:['SOURCE_COVERAGE_UNVERIFIED']}})});
 const prepared=prepareTextPrivacyReview({text:extracted.markdown,profile,productChannel:'standalone',consumerOptions:{productChannel:'standalone',contentOptions},registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
 const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'}),final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
 assert.doesNotMatch(final.markdown,/Qvx|Qvy/u);
 if(header)assert.match(final.markdown,/HTTP\/2/u);
 else {
   // With no structural header authority the shared policy conservatively
   // retains a prior Name corridor; it cannot promise factual declassification.
   assert.match(markdown,/HTTP\/2/u);assert.match(final.markdown,/FIELD_REDACTED/u);
 }
 assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
 assert.ok(verifyAnonymizedPublication({markdown:final.markdown,profile,content_options:contentOptions,source_extraction:extracted.sourceExtraction,dictionary:final.dictionary,
 strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates}));
});
console.log(`${count} projection groups passed; no native worker/desktop claim`);
