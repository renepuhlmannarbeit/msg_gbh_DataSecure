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
// Same actual source, with observers around the real reader/serializer only.
function observedStack83(probe={}) {
 const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
 const xmlApi=require('../plugins/data-secure/server/xml-reader');
 const metrics={modelReads:0,modelXmlChars:0,formattedCalls:0,formattedChars:0};
 const fileD=require.resolve('../plugins/data-secure/server/office-diagrams');
 const d=new Module(fileD,module);d.filename=fileD;d.paths=Module._nodeModulePaths(path.dirname(fileD));
 d.require=function(request){
  if(request==='./xml-reader')return {...xmlApi,readXml(source,options){
   if(source.includes('<d:dataModel')){
    metrics.modelReads++;metrics.modelXmlChars+=source.length;
    if(probe.throwOn&&source.includes(probe.throwOn))throw probe.thrown;
   }
   return xmlApi.readXml(source,options);
  }};
  return Module.prototype.require.call(this,request);
 };
 d._compile(fs.readFileSync(fileD,'utf8'),fileD);
 const file=require.resolve('../plugins/data-secure/server/ooxml'),m=new Module(file,module);
 m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 m.__smartArtProbe83={beforeAugment:probe.beforeAugment,onText(value){
  if(typeof value==='string'&&value.startsWith('BUDGET83')){
   metrics.formattedCalls++;metrics.formattedChars+=value.length;
  }
 }};
 m.require=function(request){return request==='./office-diagrams'?d.exports:Module.prototype.require.call(this,request);};
 let source=fs.readFileSync(file,'utf8');
 const anchor='function extractionText(value, inCell = false, literalGfm = false) {';
 assert.equal(source.split(anchor).length,2,'one real serializer observation anchor');
 source=source.replace(anchor,anchor+'\n  module.__smartArtProbe83.onText(value);');
 const augment=/result=augmentDiagramText\(result,entries,options(?:,diagramSession)?\);/gu;
 assert.equal([...source.matchAll(augment)].length,1,'one real augmentation observation anchor');
 source=source.replace(augment,'module.__smartArtProbe83.beforeAugment?.(entries);$&');
 m._compile(source,file);return {api:m.exports,metrics};
}
const opts83={preserveText:true,contentMode:true,literalMarkup:true,partialExtraction:true};
function parts83(payloads,refs=payloads.map((_,index)=>index),heading='OWNER83') {
 const slide='ppt/slides/slide1.xml';
 const entries=new Map(opcControlEntries('pptx',{additionalOverrides:[
  {part:slide,contentType:'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'}
 ]}).map(([name,value])=>[name,Buffer.from(value)]));
 entries.set('ppt/presentation.xml',Buffer.from(`<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s"/></p:sldIdLst></p:presentation>`));
 entries.set('ppt/_rels/presentation.xml.rels',Buffer.from(rels(rel('s','slide','slides/slide1.xml'))));
 const frames=refs.map(index=>`<p:graphicFrame><a:graphic><a:graphicData uri="${D}"><d:relIds r:dm="d${index}"/></a:graphicData></a:graphic></p:graphicFrame>`).join('');
 const native=heading?`<p:sp><p:txBody><a:p><a:r><a:t>${heading}</a:t></a:r></a:p></p:txBody></p:sp>`:'';
 entries.set(slide,Buffer.from(`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:d="${D}" xmlns:r="${R}"><p:cSld><p:spTree>${native}${frames}</p:spTree></p:cSld></p:sld>`));
 entries.set('ppt/slides/_rels/slide1.xml.rels',Buffer.from(rels(payloads.map((_,index)=>rel('d'+index,'diagramData',`../diagrams/data${index+1}.xml`)).join(''))));
 payloads.forEach((bytes,index)=>entries.set(`ppt/diagrams/data${index+1}.xml`,Buffer.from(bytes)));
 return entries;
}
const single83=text=>model(pt('a',text));
const bad83=model(pt('a','BAD83A')+pt('b','BAD83B'),edge('a','b')+edge('b','a'));
function packed83(entries){return zipStore([...entries]);}
function read83(stack,entries){return stack.api.parseOoxml(packed83(entries),'.pptx',undefined,opts83);}
// First new case gives this suite an independent causal82/83 Before result.
test('83 source-work guard precedes full repeated expansion',()=>{
 const text='BUDGET83RAW'+ 'x'.repeat(449980),stack=observedStack83();
 const entries=parts83([single83(text)],Array(20).fill(0)),bytes=packed83(entries),before=Buffer.from(bytes);
 const out=stack.api.parseOoxml(bytes,'.pptx',undefined,opts83);
 assert.ok(stack.metrics.modelReads<=18,'guard must stop actual expansion');
 assert.ok(stack.metrics.formattedChars<=8000000);assert.ok(stack.metrics.formattedCalls<20);
 assert.match(out.markdown,/OWNER83/u);assert.ok(out.warnings.includes('TEXT_LIMIT_PARTIAL'));assert.deepEqual(bytes,before);
});
for(const refs of [[0,1,2],[1,2,0],[2,0,1]])for(const heading of ['OWNER83',''])
 test('82 valid siblings / diagram-only anchor '+refs.join('-')+'/'+Boolean(heading),()=>{
  const entries=parts83([single83('GOOD83FIRST'),bad83,single83('GOOD83LAST')],refs,heading);
  const bytes=packed83(entries),before=Buffer.from(bytes);
  const actual=extractMarkdownBuffer(bytes,'.pptx',{markdownOutput:'content-v1',partialExtraction:true});
  for(const value of ['GOOD83FIRST','GOOD83LAST'])assert.equal(actual.markdown.split(value).length-1,1,value);
  assert.doesNotMatch(actual.markdown,/BAD83[AB]/u);assert.equal(actual.coverage.status,'incomplete');
  assert.ok(actual.coverage.reason_codes.includes('SOURCE_COVERAGE_UNVERIFIED'));
  assert.match(actual.markdown,/# Folie 1/u);
  const retained=refs.filter(index=>index!==1).map(index=>index===0?'GOOD83FIRST':'GOOD83LAST');
  assert.ok(actual.markdown.indexOf(retained[0])<actual.markdown.indexOf(retained[1]));
  assert.deepEqual(bytes,before);
 });
test('82 separate equal values and repeated actual placements retain all occurrences',()=>{
 const actual=extractMarkdownBuffer(packed83(parts83([single83('SAME83'),single83('SAME83')],[0,1,0])),'.pptx',{markdownOutput:'content-v1',partialExtraction:true});
 assert.equal(actual.markdown.split('SAME83').length-1,3);
});
test('82 an unsupported native edge vocabulary does not erase the other bound model',()=>{
 const unsupported=model(pt('a','UNSUPPORTED83')+pt('b','UNSUPPORTED83_B'),edge('a','b').replace('parOf','unknownRelationship'));
 const actual=extractMarkdownBuffer(packed83(parts83([single83('GOOD83'),unsupported])),'.pptx',{markdownOutput:'content-v1',partialExtraction:true});
 assert.equal(actual.markdown.split('GOOD83').length-1,1);assert.doesNotMatch(actual.markdown,/UNSUPPORTED83/u);
 assert.equal(actual.coverage.status,'incomplete');
});
for(const [kind,target,mode] of [['image','../diagrams/data2.xml',''],['diagramData','../diagrams/%64ata2.xml',''],
 ['diagramData','https://example.invalid/data2.xml','External']])
 test('82 optional payload handling never upgrades wrong control '+kind+'/'+target,()=>{
  const entries=parts83([single83('MUST_NOT_AUTHORIZE83'),single83('SECOND83')]);
  entries.set('ppt/slides/_rels/slide1.xml.rels',Buffer.from(rels(
   rel('d0','diagramData','../diagrams/data1.xml')+rel('d1',kind,target,mode))));
  assert.throws(()=>ownerDiagrams(entries,'ppt/slides/slide1.xml',decode),{code:'PPTX_STRUCTURE_UNSAFE'});
 });
test('83 presence and augmentation reuse one admitted owner result',()=>{
 const stack=observedStack83(),out=read83(stack,parts83([single83('BUDGET83small')],[0,0,0]));
 assert.equal(out.markdown.split('BUDGET83small').length-1,3);
 assert.equal(stack.metrics.modelReads,3,'one parse per real placement, not two owner passes');
 assert.equal(stack.metrics.formattedCalls,3);
});
test('83 exact escaping allowance precedes formatting the rejected whole model',()=>{
 const text='BUDGET83ESC'+ '['.repeat(299980),stack=observedStack83();
 const out=read83(stack,parts83([single83(text)],Array(20).fill(0)));
 assert.ok(stack.metrics.modelReads<=14);assert.ok(stack.metrics.formattedCalls<=13);
 assert.equal(out.markdown.split('BUDGET83ESC').length-1,stack.metrics.formattedCalls);
 assert.ok(out.warnings.includes('TEXT_LIMIT_PARTIAL'));
});
test('83 XML-work guard precedes decode while final source text stays tiny',()=>{
 const bytes=single83('BUDGET83TINY').toString().replace('</d:dataModel>','<!--'+'x'.repeat(1800000)+'--></d:dataModel>');
 const stack=observedStack83(),out=read83(stack,parts83([Buffer.from(bytes)],Array(40).fill(0)));
 assert.ok(stack.metrics.modelXmlChars<=64*1024*1024,'source work, not final output size');
 assert.ok(stack.metrics.modelReads<40);assert.ok(out.warnings.includes('TEXT_LIMIT_PARTIAL'));
 assert.match(out.markdown,/BUDGET83TINY/u);assert.ok(out.markdown.length<100000);
});
test('83 literal serializer remains exact for whitespace, metacharacters and Unicode',()=>{
 const raw='BUDGET83 ÄÖÜß 😀\n  A  B  \nC\tD&#13;E &amp; &lt; &gt; \\ ` * _ [ ] { } ( ) # + . ! | ~\u2028  F  \u2029G';
 const stack=observedStack83(),out=read83(stack,parts83([single83(raw)]));
 assert.match(out.markdown,/ÄÖÜß 😀/u);assert.ok(out.markdown.includes('&#13;'));assert.ok(out.markdown.includes('&#9;'));
 assert.ok(out.markdown.includes('&amp;'));assert.ok(out.markdown.includes('  \n'));assert.ok(out.markdown.includes('\\~'));
 assert.equal(stack.metrics.formattedCalls,1,'length admission must not call actual escaping');
});
for(const thrown of [undefined,null,false,0,'',Object.assign(new Error('unrelated'),{code:'PPTX_STRUCTURE_UNSAFE'})])
 test('82 exact unexpected failure identity '+String(thrown),()=>{
  const stack=observedStack83({throwOn:'SENTINEL83',thrown});let caught=false,actual;
  try{read83(stack,parts83([single83('SENTINEL83')]));}catch(error){caught=true;actual=error;}
  assert.equal(caught,true);assert.equal(actual,thrown);
 });
for(const part of ['ppt/slides/slide1.xml','ppt/slides/_rels/slide1.xml.rels','ppt/diagrams/data1.xml'])
 test('83 cache refuses a controlled in-place change in '+part,()=>{
  const stack=observedStack83({beforeAugment(entries){
   const bytes=entries.get(part),needle=part.endsWith('.rels')?'data1.xml':part.includes('/diagrams/')?'BOUND83A':'OWNER83';
   const offset=bytes.indexOf(needle);assert.ok(offset>=0);bytes[offset]=bytes[offset]===65?66:65;
  }});
  assert.throws(()=>read83(stack,parts83([single83('BOUND83A')])),{code:'CONVERSION_POLICY_FAILED'});
 });
// Admitted parent -> embedded XLSX, not an unsupported embedded PPTX.
function childWorkbook83(text,count) {
 const X='http://schemas.openxmlformats.org/spreadsheetml/2006/main',XD='http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
 const additionalOverrides=[
  {part:'xl/worksheets/sheet1.xml',contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'},
  {part:'xl/drawings/drawing1.xml',contentType:'application/vnd.openxmlformats-officedocument.drawing+xml'}
 ];
 return new Map([...opcControlEntries('xlsx',{additionalOverrides}),
  ['xl/workbook.xml',`<workbook xmlns="${X}" xmlns:r="${R}"><sheets><sheet name="Child83" sheetId="1" r:id="s"/></sheets></workbook>`],
  ['xl/_rels/workbook.xml.rels',rels(rel('s','worksheet','worksheets/sheet1.xml'))],
  ['xl/worksheets/sheet1.xml',`<worksheet xmlns="${X}" xmlns:r="${R}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>CHILD83CELL</t></is></c></row></sheetData><drawing r:id="dr"/></worksheet>`],
  ['xl/worksheets/_rels/sheet1.xml.rels',rels(rel('dr','drawing','../drawings/drawing1.xml'))],
  ['xl/drawings/drawing1.xml',`<xdr:wsDr xmlns:xdr="${XD}" xmlns:a="${A}" xmlns:d="${D}" xmlns:r="${R}">`+
   Array(count).fill(`<xdr:twoCellAnchor><xdr:graphicFrame><a:graphic><a:graphicData uri="${D}"><d:relIds r:dm="data"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`).join('')+'</xdr:wsDr>'],
  ['xl/drawings/_rels/drawing1.xml.rels',rels(rel('data','diagramData','../diagrams/data1.xml'))],
  ['xl/diagrams/data1.xml',single83(text)]
 ].map(([name,value])=>[name,Buffer.from(value)]));
}
test('83 root and actually admitted embedded XLSX share pre-format debt',()=>{
 const parent=parts83([single83('BUDGET83PARENT'+ 'x'.repeat(599970))],Array(7).fill(0));
 const child=childWorkbook83('BUDGET83CHILD'+ 'y'.repeat(599970),7);
 const types='[Content_Types].xml',edgePath='ppt/slides/_rels/slide1.xml.rels';
 parent.set(types,Buffer.from(parent.get(types).toString().replace('</Types>',
  '<Override PartName="/ppt/embeddings/child83.xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/></Types>')));
 parent.set(edgePath,Buffer.from(parent.get(edgePath).toString().replace('</Relationships>',
  rel('nested83','package','../embeddings/child83.xlsx')+'</Relationships>')));
 parent.set('ppt/embeddings/child83.xlsx',packed83(child));
 const stack=observedStack83(),bytes=packed83(parent),before=Buffer.from(bytes);
 const actual=stack.api.parseOoxml(bytes,'.pptx',undefined,opts83);
 assert.match(actual.markdown,/BUDGET83PARENT/u);assert.match(actual.markdown,/CHILD83CELL/u);
 assert.match(actual.markdown,/BUDGET83CHILD/u);
 assert.equal(stack.metrics.formattedCalls,13,'fresh nested debt would format14 before late clipping');
 assert.ok(stack.metrics.formattedChars<=8000000);assert.ok(actual.warnings.includes('TEXT_LIMIT_PARTIAL'));assert.deepEqual(bytes,before);
});
test('82 separate owners cannot borrow a shared target through the wrong edge',()=>{
 const entries=parts83([single83('SHARED83')]),slide='ppt/slides/slide2.xml';
 entries.set('ppt/presentation.xml',Buffer.from(entries.get('ppt/presentation.xml').toString().replace('</p:sldIdLst>','<p:sldId id="257" r:id="s2"/></p:sldIdLst>')));
 entries.set('ppt/_rels/presentation.xml.rels',Buffer.from(entries.get('ppt/_rels/presentation.xml.rels').toString().replace('</Relationships>',rel('s2','slide','slides/slide2.xml')+'</Relationships>')));
 entries.set('[Content_Types].xml',Buffer.from(entries.get('[Content_Types].xml').toString().replace('</Types>',
  '<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>')));
 entries.set(slide,Buffer.from(entries.get('ppt/slides/slide1.xml').toString().replace('OWNER83','SECOND83')));
 entries.set('ppt/slides/_rels/slide2.xml.rels',Buffer.from(rels(rel('d0','image','../diagrams/data1.xml'))));
 const out=read83(observedStack83(),entries);
 assert.equal(out.markdown.split('SHARED83').length-1,1);assert.match(out.markdown,/SECOND83/u);
 assert.ok(out.warnings.some(value=>value.includes('SmartArt')));
});
test('82 all failed diagram-only models cannot create source from their labels',()=>{
 const out=read83(observedStack83(),parts83([bad83],[0],''));
 assert.equal(out.markdown.trim(),'');assert.equal(out.sections.length,0);
 assert.ok(out.warnings.some(value=>value.includes('SmartArt')));
});
test('82 an unchosen MC graph contributes no model work or fallback duplication',()=>{
 const entries=parts83([single83('CHOSEN83'),bad83]);
 const part='ppt/slides/slide1.xml';
 const source=entries.get(part).toString().replace('<p:spTree>','<p:spTree xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:f="urn:future">');
 const begin=source.indexOf('<p:graphicFrame>'),end=source.lastIndexOf('</p:graphicFrame>')+'</p:graphicFrame>'.length;
 const selected='<p:graphicFrame><a:graphic><a:graphicData><d:relIds r:dm="d0"/></a:graphicData></a:graphic></p:graphicFrame>';
 const omitted=selected.replace('d0','d1');
 entries.set(part,Buffer.from(source.slice(0,begin)+'<mc:AlternateContent><mc:Choice Requires="f">'+omitted+
  '</mc:Choice><mc:Fallback>'+selected+'</mc:Fallback></mc:AlternateContent>'+source.slice(end)));
 const stack=observedStack83(),out=read83(stack,entries);
 assert.equal(out.markdown.split('CHOSEN83').length-1,1);assert.doesNotMatch(out.markdown,/BAD83[AB]/u);
 assert.equal(stack.metrics.modelReads,1);
});
test('83 the same part spelling in a separate entries Map never reuses another package cache',()=>{
 const stack=observedStack83(),context={depth:0,budget:{documents:0,archiveBytes:0,expandedBytes:0}};
 const a=stack.api.parseOoxml(packed83(parts83([single83('PACKAGE83A')])) ,'.pptx',context,opts83);
 const b=stack.api.parseOoxml(packed83(parts83([single83('PACKAGE83B')])) ,'.pptx',context,opts83);
 assert.match(a.markdown,/PACKAGE83A/u);assert.doesNotMatch(a.markdown,/PACKAGE83B/u);
 assert.match(b.markdown,/PACKAGE83B/u);assert.doesNotMatch(b.markdown,/PACKAGE83A/u);
});
// Additional private-capability negatives use existing public functions. Their
// new optional in-process capability arguments never originate in source/IPC.
for(const token of [null,{},Object.freeze({}),JSON.parse('{}')])
 test('83 unknown diagram work tokens are refused rather than refreshing debt',()=>{
  assert.throws(()=>diagramModel(single83('CAP83'),decode,token),{code:'CONVERSION_POLICY_FAILED'});
 });
test('83 direct engineering PPTX parser rejects a forged session token',()=>{
 const stack=observedStack83(),entries=parts83([single83('CAP83')]);
 assert.throws(()=>stack.api.parsePptx(entries,opts83,undefined,{}),{code:'CONVERSION_POLICY_FAILED'});
});
process.stdout.write(`${passed} Office diagram/content cases PASS\n`);
