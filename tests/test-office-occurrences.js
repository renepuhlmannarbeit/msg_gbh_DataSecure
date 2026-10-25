'use strict';
const assert=require('node:assert/strict');
const {zipStore}=require('./lib/zip');
const {opcControlEntries}=require('./lib/opc');
const {encodePng}=require('../plugins/data-secure/server/images/png');
const {extractOfficeMarkdownAndMedia}=require('../plugins/data-secure/server/standalone/markdown-extractor');
const {appendOfficeOcr,preparePartialOfficeImagePlan}=require('../plugins/data-secure/server/standalone/office-image-ocr');
const {createMarkdownExtraction}=require('../plugins/data-secure/server/standalone/markdown-contract');
const {createContentOptions}=require('../plugins/data-secure/server/core/content-options');
const P='http://schemas.openxmlformats.org/presentationml/2006/main',A='http://schemas.openxmlformats.org/drawingml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',PR='http://schemas.openxmlformats.org/package/2006/relationships';
const relation=(id,kind,target)=>`<Relationship Id="${id}" Type="${R}/${kind}" Target="${target}"/>`;
const relations=xml=>`<Relationships xmlns="${PR}">${xml}</Relationships>`;
const image=encodePng({width:2,height:1,rgba:Buffer.from([255,255,255,255,0,0,0,255])});
const entries=[...opcControlEntries('pptx'),
 ['ppt/presentation.xml',`<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="258" r:id="b"/><p:sldId id="257" r:id="a"/></p:sldIdLst></p:presentation>`],
 ['ppt/_rels/presentation.xml.rels',relations(relation('a','slide','slides/slide7.xml')+relation('b','slide','slides/slide2.xml'))],
 ['ppt/media/image.png',image]];
for(const [number,text] of [[2,'FIRST'],[7,'SECOND']]) entries.push(
 [`ppt/slides/slide${number}.xml`,`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp><p:pic><a:blip r:embed="img"/></p:pic></p:spTree></p:cSld></p:sld>`],
 [`ppt/slides/_rels/slide${number}.xml.rels`,relations(relation('img','image','../media/image.png'))]);
const source=zipStore(entries);
let passed=0;const test=(name,fn)=>{fn();passed++;console.log(`PASS ${name}`);};
test('same asset belongs to both actual slide occurrences, in presentation order',()=>{
 const {extraction,attachments}=extractOfficeMarkdownAndMedia(source,'.pptx',{markdownOutput:'content-v1',partialExtraction:true});
 assert.equal(attachments.length,1);assert.equal(attachments[0].occurrences.length,2);
 const [one,two]=attachments[0].occurrences;
 assert.equal(one.index,1);assert.equal(two.index,2);assert.equal(one.section_part,'ppt/slides/slide2.xml');
 assert.equal(two.section_part,'ppt/slides/slide7.xml');assert.ok(one.after<two.after);
 assert.equal(extraction.markdown.slice(0,one.after).includes('FIRST'),true);
});
test('placement preserves native prefix and shifts Unicode/contact offsets exactly',()=>{
 const {extraction,attachments}=extractOfficeMarkdownAndMedia(source,'.pptx',{markdownOutput:'content-v1',partialExtraction:true});
 const options={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:true,imageOcr:true};
 const imageText='Änne 😀 mail@example.invalid';const start=imageText.indexOf('mail');
 const recognized=createMarkdownExtraction({source_type:'pptx',markdown:imageText,content_options:options,
   coverage:{status:'incomplete',reason_codes:['OCR_CONTACT_VALUES_UNVERIFIED','OCR_NOT_VERIFIED']},
   ocr_contacts:[{start,end:imageText.length,page:1,line:1,kind:'email'}]});
 const placements=attachments[0].occurrences.map((o,i)=>({...o,result:0,ordinal:i+1}));
 const result=appendOfficeOcr(extraction,[recognized],options,placements);
 assert.ok(result.markdown.indexOf('FIRST')<result.markdown.indexOf('Änne'));
 assert.ok(result.markdown.lastIndexOf('Änne')>result.markdown.indexOf('SECOND'));
 assert.equal(result.ocr_contacts.length,2);
 for(const c of result.ocr_contacts)assert.equal(result.markdown.slice(c.start,c.end),'mail@example.invalid');
 assert.match(result.markdown,/Bildtext · Folie 1/u);assert.match(result.markdown,/Bildtext · Folie 2/u);
});
test('fair OCR budget does not discard later images because earlier dimensions used it up',()=>{
 // Header-only images are a planner oracle, not decoder/GUI evidence.
 const header=Buffer.from(image);header.writeUInt32BE(5000,16);header.writeUInt32BE(5000,20);
 const attachments=[1,2,3].map(i=>({type:'image',mimeType:'image/png',extension:'png',source_part:`part${i}`,data:header.toString('base64')}));
 const plan=preparePartialOfficeImagePlan(attachments);
 assert.equal(plan.length,3);assert.ok(plan.every(p=>!p.reason));
 assert.equal(plan.reduce((sum,p)=>sum+p.ocrPixels,0),75_000_000);
 assert.ok(plan.every(p=>p.ocrPixels<=30_000_000));
 for(const p of plan)p.bytes.fill(0);
});
test('known tiny vector sizes do not reserve full-page work and downsample an unrelated bitmap',()=>{
 const header=Buffer.from(image);header.writeUInt32BE(7000,16);header.writeUInt32BE(4000,20);
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M1 1L19 19"/></svg>');
 const attachments=[{type:'image',mimeType:'image/png',extension:'png',source_part:'large',data:header.toString('base64')},
  ...Array.from({length:30},(_,i)=>({type:'image',mimeType:'image/svg+xml',extension:'svg',source_part:`vector${i}`,data:svg.toString('base64')}))];
 const plan=preparePartialOfficeImagePlan(attachments);
 assert.equal(plan[0].ocrPixels,28_000_000);assert.ok(plan.every(item=>!item.reason));
 assert.ok(plan.slice(1).every(item=>item.width===20&&item.height===20&&item.ocrPixels===400));
 for(const item of plan)item.bytes?.fill(0);
});
test('small raster enlargement spends only spare work and never reduces another source allocation',()=>{
 const tiny={type:'image',mimeType:'image/png',extension:'png',source_part:'tiny',data:image.toString('base64')};
 const plan=preparePartialOfficeImagePlan([tiny]);assert.equal(plan[0].ocrScale,2);assert.equal(plan[0].ocrPixels,8);
 plan[0].bytes.fill(0);
 const large=Buffer.from(image);large.writeUInt32BE(5000,16);large.writeUInt32BE(5000,20);
 const full=preparePartialOfficeImagePlan([tiny,...Array.from({length:5},(_,i)=>({...tiny,source_part:`big${i}`,data:large.toString('base64')}))]);
 assert.equal(full[0].ocrScale,undefined);assert.equal(full[0].ocrPixels,2);
 assert.ok(full.reduce((sum,item)=>sum+item.ocrPixels,0)<=120_000_000);
 for(const item of full)item.bytes?.fill(0);
});
test('placement rejects offset and label injection instead of guessing',()=>{
 const options={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:true,imageOcr:true};
 const base=createMarkdownExtraction({source_type:'pptx',markdown:'BASE',coverage:{status:'complete',reason_codes:[]}});
 const value=createMarkdownExtraction({source_type:'pptx',markdown:'TEXT',content_options:options,coverage:{status:'complete',reason_codes:[]}});
 assert.throws(()=>appendOfficeOcr(base,[value],options,[{after:9,result:0,ordinal:1,kind:'slide',index:1}]),{code:'CONVERSION_INPUT_INVALID'});
 assert.throws(()=>appendOfficeOcr(base,[value],options,[{after:4,result:0,ordinal:1,kind:'file:///private',index:1}]),{code:'CONVERSION_INPUT_INVALID'});
});
console.log(`${passed} Office occurrence/resource cases PASS`);
