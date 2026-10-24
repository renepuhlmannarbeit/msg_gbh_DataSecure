import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const contract=require('../plugins/data-secure/server/standalone/markdown-contract');
const metadata=require('../plugins/data-secure/server/core/private-document-metadata');
const layout=require('../plugins/data-secure/server/standalone/pdf-text-layout');
const {projectTaggedPdf}=require('../plugins/data-secure/server/standalone/pdf-structure-projection');
const {CheckpointStream,SCHEMA,MAX_UNITS}=require('../plugins/data-secure/server/standalone/conversion-checkpoints');
const {pdfOcrAction}=require('../plugins/data-secure/server/core/content-ocr-plan');
const source=fs.readFileSync(path.join(root,'plugins/data-secure/server/standalone/conversion-worker-child.js'),'utf8');
const start=source.indexOf('async function pdfMarkdown('),end=source.indexOf('\nasync function main()',start);
const expression="await import(pathToFileURL(path.join(pdfRoot, 'legacy', 'build', 'pdf.datasecure.mjs')).href)";
assert.ok(start>0&&end>start);const actual=source.slice(start,end);assert.equal(actual.split(expression).length,2);
const omissionStart=source.indexOf('function imageOmission('),omissionEnd=source.indexOf('\nfunction visualOmission(',omissionStart);assert.ok(omissionStart>0&&omissionEnd>omissionStart);
const errors=new Set(require('../plugins/data-secure/server/core/conversion-worker-contract').ERROR_CODES);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const off={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false};
function page(text,extra={}){return {ref:{num:3,gen:0},getTextContent:async()=>({items:[{str:text,hasEOL:true}],styles:{}}),getStructTree:async()=>null,getAnnotations:async()=>[],
 getOperatorList:async()=>({fnArray:[]}),getViewport:()=>({width:400,height:300}),cleanup(){},...extra};}
async function run(pages,{options=off,context:extra={},beforeLookup,document:docExtra={}}={}){
 const frames=[],accumulator=new CheckpointStream('pdf',options).units;let destroyed=0,lookups=0,cleaned=0;
 const document={numPages:pages.length,getPermissions:async()=>null,hasJSActions:async()=>false,getFieldObjects:async()=>null,getAttachments:async()=>null,getOutline:async()=>null,
  getMetadata:async()=>({metadata:null,info:{IsXFAPresent:false}}),getPage:async number=>{
    const original=pages[number-1],lookup=original.getStructTree;return {...original,cleanup(){cleaned++;original.cleanup();},getStructTree:async()=>{lookups++;beforeLookup?.({frames,number});return lookup();}};
  },...docExtra};
 const context={path,root:'isolated-test-runtime',errors,fail,MAX_UNITS,...contract,...metadata,...layout,projectTaggedPdf,
  // The production argument record is plain in its own realm. Recreate only
  // that carrier in this VM boundary; retain the exact original item objects.
  taggedPdfTextLayout:input=>layout.taggedPdfTextLayout({items:input.items,structureTree:input.structureTree,pageNumber:input.pageNumber,pageRef:input.pageRef}),
  ...require('../plugins/data-secure/server/standalone/readable-markdown'),...require('../plugins/data-secure/server/standalone/markdown-visuals'),
  createPassivePdfContent:require('../plugins/data-secure/server/standalone/pdf-passive-content').createPassivePdfContent,
  createMarkdownExtraction:input=>contract.createMarkdownExtraction(JSON.parse(JSON.stringify(input))),
  selectOptionalPrivatePdfMetadata:input=>metadata.selectOptionalPrivatePdfMetadata(JSON.parse(JSON.stringify(input))),
  populated:value=>Boolean(value&&(typeof value!=='object'||Object.keys(value).length)),
  pdfOcrAction:(opts,facts)=>pdfOcrAction(opts,JSON.parse(JSON.stringify(facts))),
  mockModule:{OPS:{paintImageXObject:1},AnnotationMode:{DISABLE:0},getDocument:()=>({promise:Promise.resolve(document),destroy:async()=>{destroyed++;}})},Uint8Array,Set,Boolean,...extra};
 context.imageOmission=vm.runInNewContext(`(${source.slice(omissionStart,omissionEnd)})`,context);
 const operation=vm.runInNewContext(`(${actual.replace(expression,'mockModule')})`,context);
 let result,error;
 try{result=await operation(Buffer.from('%PDF-owned-function-boundary'),true,options.markdownOutput,options,async(value,index)=>{
   contract.validateMarkdownExtractionForOptions(value,options);accumulator.accept({schema:SCHEMA,sequence:frames.length+1,index,result:value});frames.push({index,result:value});
  });}catch(cause){error=cause;}finally{assert.equal(destroyed,1);assert.equal(cleaned,pages.length===2&&error?1:pages.length);}
 return {result,error,frames,accumulator,lookups};
}
const named=(name,code)=>Object.assign(new Error('synthetic bounded optional failure'),{name,...(code?{code}:{})});
let passed=0;async function test(name,fn){await fn();console.log(`PASS ${++passed} ${name}`);}
await test('fully validated native BASE exists before any optional structure lookup',async()=>{
 const out=await run([page('NATIVE_SENTINEL')],{beforeLookup({frames}){assert.equal(frames.length,1);assert.match(frames[0].result.markdown,/NATIVE_SENTINEL/u);}});
 assert.equal(out.error,undefined);assert.equal(out.frames.length,2);assert.deepEqual(out.accumulator.versions,[2]);
});
for(const name of ['Error','UnknownErrorException'])await test(`${name} optional lookup retains native page and later independent pages`,async()=>{
 const out=await run([page('NATIVE_SENTINEL',{getStructTree:async()=>{throw named(name);}}),page('SECOND_SENTINEL')]);
 assert.equal(out.error,undefined);assert.match(out.result.markdown,/NATIVE_SENTINEL[\s\S]*SECOND_SENTINEL/u);
 assert.ok(out.result.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));assert.ok(!out.result.coverage.reason_codes.includes('PDF_PAGE_NOT_READ'));
 assert.deepEqual(out.frames.map(frame=>frame.index),[0,0,1,1]);assert.deepEqual(out.accumulator.versions,[2,2]);
 assert.equal(out.result.coverage.status,'incomplete');
});
for(const name of ['FormatError','InvalidPDFException'])await test(`${name} known optional model fallback never loses source or fabricates a model`,async()=>{
 let operators=0;const out=await run([page('Native ÄÖÜß',{getStructTree:async()=>{throw named(name);},getOperatorList:async()=>{operators++;return {fnArray:[]};}})]);
 assert.equal(out.error,undefined);assert.match(out.result.markdown,/Native ÄÖÜß/u);assert.equal(operators,1);assert.equal(out.frames.length,2);
});
for(const code of ['CONVERSION_POLICY_FAILED','CONVERSION_MODEL_INVALID','TEXT_TOO_LARGE','CONVERSION_PIXEL_LIMIT'])await test(`optional lookup ${code} remains a hard producer error`,async()=>{
 const out=await run([page('NATIVE_SENTINEL',{getStructTree:async()=>fail(code)})]);
 assert.equal(out.result,undefined);assert.equal(out.error?.code,code);assert.equal(out.frames.length,1);assert.match(out.frames[0].result.markdown,/NATIVE_SENTINEL/u);
});
for(const [name,code]of [['AbortException'],['AbortError'],['RangeError'],['Error','CONVERSION_RESOURCE_LIMIT'],['Error','UNKNOWN_POLICY_FAILURE']])await test(`unknown optional ${name}/${code||'no-code'} is not a successful structure model`,async()=>{
 const out=await run([page('NATIVE_SENTINEL',{getStructTree:async()=>{throw named(name,code);}})]);
 assert.equal(out.result,undefined);assert.equal(out.error?.code,'PDF_EXTRACTION_FAILED');assert.equal(out.frames.length,1);
 assert.match(out.accumulator.recover('CONVERSION_TIMEOUT').markdown,/NATIVE_SENTINEL/u);
});
for(const [name,code,expected]of [['FormatError','CONVERSION_RESOURCE_LIMIT','PDF_EXTRACTION_FAILED'],['InvalidPDFException','CONVERSION_POLICY_FAILED','CONVERSION_POLICY_FAILED']])await test(`known parser name cannot disguise coded ${code}`,async()=>{
 const out=await run([page('NATIVE_SENTINEL',{getStructTree:async()=>{throw named(name,code);}})]);
 assert.equal(out.result,undefined);assert.equal(out.error?.code,expected);assert.equal(out.frames.length,1);
});
const marked=(id,str,x,y)=>[{type:'beginMarkedContentProps',id:`p3R_mc${id}`},{str,dir:'ltr',width:str.length*5,transform:[12,0,0,12,x,y],hasEOL:true},{type:'endMarkedContent'}];
const taggedItems=[...marked(1,'Right',260,300),...marked(0,'Left',20,300)];
const model={role:'Root',children:[{role:'Document',children:[{role:'P',children:[{type:'content',id:'p3R_mc0'}]},{role:'P',children:[{type:'content',id:'p3R_mc1'}]}]}]};
const taggedPage=extra=>page('',{getTextContent:async()=>({items:taggedItems,styles:{}}),getStructTree:async()=>model,...extra});
await test('successful actual tag projection consumes exactly BASE and one UPDATE, not three versions',async()=>{
 const before=JSON.stringify(taggedItems),out=await run([taggedPage()]);assert.equal(out.error,undefined);assert.equal(out.frames.length,2);
 assert.match(out.frames[0].result.markdown,/Right[\s\S]*Left/u);assert.match(out.frames[1].result.markdown,/Left[\s\S]*Right/u);
 assert.equal(out.result.markdown,out.frames[1].result.markdown);assert.deepEqual(out.accumulator.versions,[2]);assert.equal(JSON.stringify(taggedItems),before);
});
await test('later raster/operator failure retains validated tag projection using the one permitted UPDATE',async()=>{
 const out=await run([taggedPage({getOperatorList:async()=>{throw new Error('independent later image failure');}})]);
 assert.equal(out.error,undefined);assert.match(out.result.markdown,/Left[\s\S]*Right/u);assert.ok(out.result.coverage.reason_codes.includes('PDF_IMAGE_NOT_READ'));
 assert.equal(out.frames.length,2);assert.deepEqual(out.accumulator.versions,[2]);
});
await test('neutral BASE and tagged UPDATE retain the same private metadata without exposing it in page Markdown',async()=>{
 const out=await run([taggedPage()],{document:{getMetadata:async()=>({metadata:null,info:{IsXFAPresent:false,Author:'PRIVATE_AUTHOR_SENTINEL'}})}});
 assert.equal(out.error,undefined);assert.equal(out.frames.length,2);assert.deepEqual(out.accumulator.versions,[2]);
 assert.deepEqual(out.frames[0].result.private_document_metadata,out.frames[1].result.private_document_metadata);
 assert.equal(out.frames[0].result.private_document_metadata.entries[0].value,'PRIVATE_AUTHOR_SENTINEL');assert.doesNotMatch(out.result.markdown,/PRIVATE_AUTHOR_SENTINEL/u);
});
await test('ordinary optional projection failure retains only secured neutral native text',async()=>{
 const out=await run([taggedPage()],{context:{projectTaggedPdf(){throw new Error('optional projection failed');}}});
 assert.equal(out.error,undefined);assert.match(out.result.markdown,/Right[\s\S]*Left/u);assert.ok(out.result.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
 assert.equal(out.frames.length,2);assert.deepEqual(out.accumulator.versions,[2]);
});
await test('projection output budget remains hard; private neutral BASE remains available to unchanged supervisor recovery',async()=>{
 const out=await run([taggedPage()],{context:{projectTaggedPdf(){fail('TEXT_TOO_LARGE');}}});
 assert.equal(out.result,undefined);assert.equal(out.error?.code,'TEXT_TOO_LARGE');assert.equal(out.frames.length,1);
 const recovered=out.accumulator.recover('TEXT_TOO_LARGE');assert.match(recovered.markdown,/Right[\s\S]*Left/u);assert.ok(recovered.coverage.reason_codes.includes('TEXT_LIMIT_PARTIAL'));
});
await test('unverified incomplete tags retain native input order, no reordered model or extra version',async()=>{
 const out=await run([taggedPage({getStructTree:async()=>({...model,children:[]})})]);assert.equal(out.error,undefined);
 assert.match(out.result.markdown,/Right[\s\S]*Left/u);assert.equal(out.frames.length,2);assert.deepEqual(out.accumulator.versions,[2]);
});
await test('native inline owner fallback keeps the secured complete field in BASE and final UPDATE without a tag-created paragraph break',async()=>{
 const items=[...marked(0,'Name: Anna',20,200),...marked(1,'Berger',90,200)];
 items[1].width=66.69599999999998;items[4].width=36.012;items[1].hasEOL=false;items[4].hasEOL=false;
 const before=JSON.stringify(items),out=await run([page('',{getTextContent:async()=>({items,styles:{}}),getStructTree:async()=>model})]);
 assert.equal(out.error,undefined);assert.equal(out.frames.length,2);assert.deepEqual(out.accumulator.versions,[2]);
 assert.equal(out.result.markdown,out.frames[0].result.markdown);assert.equal(out.frames[1].result.markdown,out.frames[0].result.markdown);
 assert.match(out.result.markdown,/Name: Anna Berger/u);assert.doesNotMatch(out.result.markdown,/Anna\s*\n\s*\n\s*Berger/u);
 assert.equal(JSON.stringify(items),before);
});
await test('invalid native item cannot acquire a BASE or be rescued by optional tags',async()=>{
 const out=await run([page('',{getTextContent:async()=>({items:[{str:'UNTRUSTED_PREFIX'},{str:42}],styles:{}})}),page('SECOND')]);
 assert.equal(out.error,undefined);assert.doesNotMatch(out.result.markdown,/UNTRUSTED_PREFIX/u);assert.match(out.result.markdown,/SECOND/u);assert.equal(out.lookups,1);
 assert.equal(out.frames[0].result.markdown,'');
});
console.log(`${passed} actual PDF source-function checkpoint groups passed; no native PDF.js/isolated-worker/desktop claim`);
