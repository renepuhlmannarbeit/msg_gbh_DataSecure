'use strict';
const assert=require('node:assert/strict');
const {zipStore}=require('./lib/zip');
const {opcControlEntries}=require('./lib/opc');
const {diagramModel,ownerDiagrams}=require('../plugins/data-secure/server/office-diagrams');
const {extractMarkdownBuffer}=require('../plugins/data-secure/server/standalone/markdown-extractor');
const D='http://schemas.openxmlformats.org/drawingml/2006/diagram';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
const P='http://schemas.openxmlformats.org/presentationml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR='http://schemas.openxmlformats.org/package/2006/relationships';
const decode=x=>x.replace(/&amp;/gu,'&').replace(/&lt;/gu,'<').replace(/&gt;/gu,'>');
const pt=(id,text)=>`<d:pt modelId="${id}"><d:t><a:p><a:r><a:t>${text}</a:t></a:r></a:p></d:t></d:pt>`;
const edge=(src,dst,order=0)=>`<d:cxn type="parOf" srcId="${src}" destId="${dst}" srcOrd="${order}"/>`;
const model=(points,edges='')=>Buffer.from(`<d:dataModel xmlns:d="${D}" xmlns:a="${A}"><d:ptLst>${points}</d:ptLst><d:cxnLst>${edges}</d:cxnLst></d:dataModel>`);
const rels=xml=>`<Relationships xmlns="${PR}">${xml}</Relationships>`;
const rel=(id,kind,target,mode='')=>`<Relationship Id="${id}" Type="${R}/${kind}" Target="${target}"${mode?` TargetMode="${mode}"`:''}/>`;
function fixture({diagram=model(pt('root','')+pt('child','Änne &amp; Büro'),edge('root','child')),orphan=false}={}){
 return zipStore([...opcControlEntries('pptx'),
 ['ppt/presentation.xml',`<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s"/></p:sldIdLst></p:presentation>`],
 ['ppt/_rels/presentation.xml.rels',rels(rel('s','slide','slides/slide1.xml'))],
 ['ppt/slides/slide1.xml',`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:d="${D}" xmlns:r="${R}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Sichtbarer Titel</a:t></a:r></a:p><a:p/><a:p/><a:p/></p:txBody></p:sp>${orphan?'':'<p:graphicFrame><a:graphic><a:graphicData><d:relIds r:dm="diagram"/></a:graphicData></a:graphic></p:graphicFrame>'}</p:spTree></p:cSld></p:sld>`],
 ['ppt/slides/_rels/slide1.xml.rels',rels(rel('diagram','diagramData','../diagrams/data1.xml'))],
 ['ppt/diagrams/data1.xml',diagram],
 ['ppt/diagrams/drawing1.xml',`<d:dummy xmlns:d="${D}">SECOND REPRESENTATION NOT TEXT</d:dummy>`],
 ['docProps/core.xml','<cp:coreProperties xmlns:cp="urn:test" xmlns:dc="urn:dc"><dc:creator>TECHNICAL AUTHOR ONLY</dc:creator></cp:coreProperties>']]);
}
let passed=0;
function test(name,fn){fn();passed++;process.stdout.write(`PASS ${name}\n`);}
test('graph hierarchy and source order are native, not OCR',()=>{
 const rows=diagramModel(model(pt('r','Leitung')+pt('b','Büro')+pt('a','Änne'),edge('r','b',1)+edge('r','a',0)),decode);
 assert.deepEqual(rows,[{text:'Leitung',depth:0},{text:'Änne',depth:1},{text:'Büro',depth:1}]);
});
for(const [name,bytes] of [
 ['cycle',model(pt('a','A')+pt('b','B'),edge('a','b')+edge('b','a'))],
 ['dangling',model(pt('a','A'),edge('a','missing'))],
 ['duplicate ID',model(pt('a','A')+pt('a','B'))],
 ['multiple parents',model(pt('a','A')+pt('b','B')+pt('c','C'),edge('a','c')+edge('b','c'))],
 ['wrong namespace',Buffer.from('<d:dataModel xmlns:d="urn:fake"/>')],
 ['DTD',Buffer.from(`<!DOCTYPE x SYSTEM "file:///private"><d:dataModel xmlns:d="${D}"/>`)]
 ,['model MC alternative graph',Buffer.from(`<d:dataModel xmlns:d="${D}" xmlns:a="${A}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><d:ptLst><mc:AlternateContent><mc:Choice Requires="unknown">${pt('a','UNSELECTED')}</mc:Choice><mc:Fallback>${pt('b','SELECTED')}</mc:Fallback></mc:AlternateContent></d:ptLst></d:dataModel>`)]
])test(`refuses ${name}`,()=>assert.throws(()=>diagramModel(bytes,decode),{code:'PPTX_STRUCTURE_UNSAFE'}));
test('actual internal relation only, no orphan scrape',()=>{
 const source=fixture();const md=extractMarkdownBuffer(source,'.pptx',{markdownOutput:'content-v1',partialExtraction:true}).markdown;
 assert.match(md,/Sichtbarer Titel/u);assert.match(md,/SmartArt/u);assert.match(md,/Änne &amp; Büro/u);
 assert.doesNotMatch(md,/SECOND REPRESENTATION|TECHNICAL AUTHOR/u);
 assert.equal((md.match(/Änne/gu)||[]).length,1);assert.ok(!/\n(?:[ \t]*\n){4}/u.test(md));
 const orphan=extractMarkdownBuffer(fixture({orphan:true}),'.pptx',{markdownOutput:'content-v1',partialExtraction:true});
 assert.doesNotMatch(orphan.markdown,/Änne/u);
});
for(const [name,target,mode,kind] of [
 ['external','https://example.invalid/data1.xml','External','diagramData'],
 ['cross-package','../../word/diagrams/data1.xml','','diagramData'],
 ['wrong kind','../diagrams/data1.xml','','image'],
 ['encoded traversal','../diagrams/%64ata1.xml','','diagramData']
])test(`diagram owner refuses ${name}`,()=>{
 const entries=new Map([
 ['ppt/slides/slide1.xml',Buffer.from(`<p:sld xmlns:p="${P}" xmlns:d="${D}" xmlns:r="${R}"><d:relIds r:dm="x"/></p:sld>`)],
 ['ppt/slides/_rels/slide1.xml.rels',Buffer.from(rels(rel('x',kind,target,mode)))],
 ['ppt/diagrams/data1.xml',model(pt('a','A'))]
 ]);assert.throws(()=>ownerDiagrams(entries,'ppt/slides/slide1.xml',decode),{code:'PPTX_STRUCTURE_UNSAFE'});
});
test('literal TXT is unchanged by Office content cleanup',()=>{
 const text='ÄÖÜ ß jzfjgfhdy\n\n\n\n\n';
 const md=extractMarkdownBuffer(Buffer.from(text),'.txt',{markdownOutput:'content-v1'}).markdown;
 assert.match(md,/jzfjgfhdy/u);assert.ok(md.endsWith('\n\n\n\n\n'));
});
process.stdout.write(`${passed} Office diagram/content cases PASS\n`);
