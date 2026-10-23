'use strict';
// Causal independent-review countercases, exercised through real parsers and
// the unchanged framed checkpoint accumulator. No user documents or mocks.
const assert=require('node:assert/strict');
const {zipStore}=require('./lib/zip'),{opcControlEntries}=require('./lib/opc');
const {parseOoxml}=require('../plugins/data-secure/server/ooxml');
const {extractOfficeMarkdownAndMedia}=require('../plugins/data-secure/server/standalone/markdown-extractor');
const {encodePng}=require('../plugins/data-secure/server/images/png');
const {createMarkdownExtraction}=require('../plugins/data-secure/server/standalone/markdown-contract');
const {appendOfficeOcr,officeOcrCheckpoint}=require('../plugins/data-secure/server/standalone/office-image-ocr');
const {createCheckpointEmitter}=require('../plugins/data-secure/server/standalone/conversion-checkpoints');
const A='http://schemas.openxmlformats.org/drawingml/2006/main',D='http://schemas.openxmlformats.org/drawingml/2006/diagram';
const P='http://schemas.openxmlformats.org/presentationml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR='http://schemas.openxmlformats.org/package/2006/relationships';
const rel=(id,type,target)=>`<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`;
const rels=body=>`<Relationships xmlns="${PR}">${body}</Relationships>`;
const text=value=>`<p:sp><p:txBody><a:p><a:r><a:t>${value}</a:t></a:r></a:p></p:txBody></p:sp>`;
const model=value=>`<d:dataModel xmlns:d="${D}" xmlns:a="${A}"><d:ptLst><d:pt modelId="1"><d:t><a:p><a:r><a:t>${value}</a:t></a:r></a:p></d:t></d:pt></d:ptLst><d:cxnLst/></d:dataModel>`;
function ppt(body,extra=[],edges=''){
 return zipStore([...new Map([...opcControlEntries('pptx'),
 ['ppt/presentation.xml',`<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s"/></p:sldIdLst></p:presentation>`],
 ['ppt/_rels/presentation.xml.rels',rels(rel('s','slide','slides/slide1.xml'))],
 ['ppt/slides/slide1.xml',`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:d="${D}" xmlns:r="${R}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:f="urn:not-supported"><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`],
 ['ppt/slides/_rels/slide1.xml.rels',rels(edges)],...extra])]);
}
async function run(){
 const smart=ppt('<p:graphicFrame><a:graphic><a:graphicData><d:relIds r:dm="d"/></a:graphicData></a:graphic></p:graphicFrame>',
 [['ppt/diagrams/data1.xml',model('SMARTART_ONLY_CONTEXT')]],rel('d','diagramData','../diagrams/data1.xml'));
 for(const partialExtraction of [false,true])assert.match(parseOoxml(smart,'.pptx',undefined,{preserveText:true,contentMode:true,partialExtraction}).markdown.replace(/\\_/gu,'_'),/SMARTART_ONLY_CONTEXT/u);
 const mc=ppt(text('VISIBLE_TITLE')+'<mc:AlternateContent><mc:Choice Requires="f"><d:relIds r:dm="hidden"/></mc:Choice><mc:Fallback><d:relIds r:dm="visible"/></mc:Fallback></mc:AlternateContent>',
 [['ppt/diagrams/data1.xml',model('UNSELECTED_SMARTART')],['ppt/diagrams/data2.xml',model('SELECTED_FALLBACK')]],
 rel('hidden','diagramData','../diagrams/data1.xml')+rel('visible','diagramData','../diagrams/data2.xml'));
 const selected=parseOoxml(mc,'.pptx',undefined,{preserveText:true,contentMode:true,partialExtraction:true});
 assert.doesNotMatch(selected.markdown.replace(/\\_/gu,'_'),/UNSELECTED_SMARTART/u);assert.match(selected.markdown.replace(/\\_/gu,'_'),/SELECTED_FALLBACK/u);
 const png=encodePng({width:1,height:1,rgba:Buffer.from([0,0,0,255])});
 const svg=ppt(text('TITLE')+'<p:pic><a:blip r:embed="png"><a:extLst><a:ext uri="svg"><s:svgBlip xmlns:s="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="svg"/></a:ext></a:extLst></a:blip></p:pic>',
 [['ppt/media/fallback.png',png],['ppt/media/vector.svg','<svg xmlns="http://www.w3.org/2000/svg"><text>TEXT</text></svg>']],
 rel('png','image','../media/fallback.png')+rel('svg','image','../media/vector.svg'));
 assert.deepEqual(extractOfficeMarkdownAndMedia(svg,'.pptx',{markdownOutput:'content-v1',partialExtraction:true}).attachments.map(item=>item.source_part),['ppt/media/fallback.png']);
 const inherited=ppt(text('TITLE'),[
 ['ppt/_rels/presentation.xml.rels',rels(rel('s','slide','slides/slide1.xml')+rel('m','slideMaster','slideMasters/slideMaster1.xml'))],
 ['ppt/slideLayouts/slideLayout1.xml',`<p:sldLayout xmlns:p="${P}" xmlns:q="${P}" xmlns:a="${A}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:f="urn:not-supported"><p:cSld><p:spTree><q:sp><q:txBody><a:p><a:r><a:t>REAL INHERITED FOOTER</a:t></a:r></a:p></q:txBody></q:sp><p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>REAL INHERITED TABLE</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame><mc:AlternateContent><mc:Choice Requires="f">${text('UNSELECTED_LAYOUT_TEXT')}</mc:Choice><mc:Fallback>${text('SELECTED_LAYOUT_TEXT')}</mc:Fallback></mc:AlternateContent></p:spTree></p:cSld></p:sldLayout>`],
 ['ppt/slideLayouts/_rels/slideLayout1.xml.rels',rels(rel('master','slideMaster','../slideMasters/slideMaster1.xml'))],
 ['ppt/slideMasters/slideMaster1.xml',`<p:sldMaster xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree/></p:cSld></p:sldMaster>`]
 ],rel('layout','slideLayout','../slideLayouts/slideLayout1.xml'));
 const inheritedOutput=parseOoxml(inherited,'.pptx',undefined,{preserveText:true,contentMode:true,partialExtraction:true}).markdown;
 assert.match(inheritedOutput,/REAL INHERITED FOOTER/u);assert.match(inheritedOutput,/REAL INHERITED TABLE/u);
 assert.match(inheritedOutput,/SELECTED_LAYOUT_TEXT/u);assert.doesNotMatch(inheritedOutput,/UNSELECTED_LAYOUT_TEXT/u);
 const options={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:true,imageOcr:true};
 const base=createMarkdownExtraction({source_type:'pptx',markdown:'NATIVE',coverage:{status:'complete',reason_codes:[]},content_options:options});
 const count=1000,md=Array.from({length:count},()=> 'a@example.invalid').join('\n'),contacts=[];
 let start=0;for(let i=0;i<count;i++){contacts.push({start,end:start+17,page:1,line:i+1,kind:'email'});start+=18;}
 const ocr=createMarkdownExtraction({source_type:'pptx',markdown:md,ocr_contacts:contacts,coverage:{status:'incomplete',reason_codes:['OCR_CONTACT_VALUES_UNVERIFIED','OCR_NOT_VERIFIED']},content_options:options});
 const placements=Array.from({length:6},(_,i)=>({after:base.markdown.length,result:Math.floor(i/2),ordinal:i+1,kind:'slide',index:i+1}));
 const final=appendOfficeOcr(base,[ocr,ocr,ocr],options,placements);
 const emit=createCheckpointEmitter({type:'pptx',contentOptions:options,write:async()=>true});
 await emit(base,0);
 const budget={chars:base.markdown.length,contacts:0,bytes:0,pixels:0,units:1};
 for(let i=0;i<3;i++)await emit(officeOcrCheckpoint(base,ocr,options,placements.slice(i*2,i*2+2),budget),i+1);
 assert.equal(budget.contacts,5000);assert.equal(final.ocr_contacts.length,5000);assert.ok(final.coverage.reason_codes.includes('IMAGE_PROCESSING_LIMIT'));
 process.stdout.write('PASS 6 Office projection countercases (including real aggregate checkpoint)\n');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
