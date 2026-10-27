'use strict';
const assert=require('node:assert/strict');
const {readXml}=require('../plugins/data-secure/server/xml-reader');
const {createOfficeImageGeometry}=require('../plugins/data-secure/server/office-image-geometry');
const {createMarkdownExtraction}=require('../plugins/data-secure/server/standalone/markdown-contract');
const {appendOfficeOcr,officeOcrCheckpoint}=require('../plugins/data-secure/server/standalone/office-image-ocr');
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
const families=['http://schemas.openxmlformats.org/presentationml/2006/main','http://schemas.openxmlformats.org/drawingml/2006/picture','http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'];
function geometry(ns,attributes='',crop='',group=false,foreign=false){const reader=createOfficeImageGeometry(),blips=[];
 const xml=`<p:root xmlns:p="${ns}" xmlns:a="${A}" xmlns:evil="urn:foreign">${group?'<p:grpSp>':''}<p:pic><p:blipFill><a:blip/>${crop?`<${foreign?'evil':'a'}:srcRect ${crop}/>`:''}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm ${attributes}><a:off x="1" y="2"/><a:ext cx="9" cy="8"/></a:xfrm><a:prstGeom prst="rect"/></p:spPr></p:pic>${group?'</p:grpSp>':''}</p:root>`;
 readXml(xml,{decode:value=>value,error:()=>new Error('xml'),start(node){reader.start(node);if(node.localName==='blip')blips.push(node);}});return reader.forBlip(blips[0]);}
let count=0;function test(name,fn){fn();console.log(`PASS ${++count} ${name}`);}
test('Word, Excel and PowerPoint bind only the actual picture occurrence, retaining crop/rotation/flip metadata',()=>{
 for(const ns of families){const g=geometry(ns,'rot="5400000" flipH="1"','l="12000" t="1000" r="2000" b="3000"');
 assert.deepEqual(g,{scope:'asset',crop:{left:12000,top:1000,right:2000,bottom:3000},rotation:90,flipH:true,flipV:false,grouped:false,compositionUnmodeled:false});assert.ok(Object.isFrozen(g)&&Object.isFrozen(g.crop));}});
test('nonfinite/invalid source metadata and composed groups never become rendering authority',()=>{
 for(const a of ['rot="Infinity"','rot="21600001"','flipH="yes"'])assert.equal(geometry(families[0],a).compositionUnmodeled,true);
 assert.equal(geometry(families[0],'','l="80000" r="50000"').compositionUnmodeled,true);
 assert.equal(geometry(families[0],'','',true).grouped,true);
 assert.equal(geometry(families[0],'','l="10000"',false,true).crop,null);
});
test('full-asset OCR is labeled honestly, original native text and exact contact offsets survive',()=>{
 const contentOptions={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:true,imageOcr:true};
 const extraction=createMarkdownExtraction({source_type:'pptx',markdown:'Native Suchtexte',coverage:{status:'complete',reason_codes:[]}});
 const result=createMarkdownExtraction({source_type:'pptx',markdown:'E-Mail: mail@example.invalid',content_options:contentOptions,coverage:{status:'incomplete',reason_codes:['OCR_CONTACT_VALUES_UNVERIFIED']},
 ocr_contacts:[{start:8,end:28,page:1,line:1,kind:'email'}]});
 const occurrence={after:extraction.markdown.length,kind:'slide',index:1,ordinal:1,result:0,sourceGeometry:geometry(families[0],'rot="5400000"','l="10000"',true)};
 const out=appendOfficeOcr(extraction,[result],contentOptions,[occurrence]);assert.match(out.markdown,/Native Suchtexte/u);assert.match(out.markdown,/Ganze Quellgrafik verarbeitet; OCR-Inhalt ungeprüft\./u);assert.doesNotMatch(out.markdown,/Quellgrafik vollständig gelesen/u);assert.match(out.markdown,/Quellausschnitt/u);assert.match(out.markdown,/gedreht oder gespiegelt/u);assert.match(out.markdown,/Gruppierung/u);
 assert.equal(out.markdown.slice(out.ocr_contacts[0].start,out.ocr_contacts[0].end),'mail@example.invalid');
 const unit=officeOcrCheckpoint(extraction,result,contentOptions,[occurrence],{chars:0,contacts:0,bytes:0,pixels:0,units:0});
 assert.equal(unit.markdown.slice(unit.ocr_contacts[0].start,unit.ocr_contacts[0].end),'mail@example.invalid');
 const later=officeOcrCheckpoint(extraction,result,contentOptions,[{...occurrence,ordinal:2,index:2}],
   {chars:unit.markdown.length,contacts:unit.ocr_contacts.length,bytes:0,pixels:0,units:1});
 assert.match(later.markdown,/Folie 2 · Grafik 2/u,'a recovered unit retains its document-global picture number');
 assert.equal(later.ocr_contacts[0].page,2);
});
console.log(`${count} passive Office geometry groups passed; no composed-page rendering claim`);
