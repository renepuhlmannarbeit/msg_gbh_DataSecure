'use strict';

const { createSuite } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { readOfficeChart, renderOfficeChart, officeChartReferences } = require('../plugins/data-secure/server/office-chart-model');
const { xmlDecode, parseOoxml } = require('../plugins/data-secure/server/ooxml');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { createXlsxReader } = require('../plugins/data-secure/server/xlsx-structure');
const { validateOpcControls } = require('../plugins/data-secure/server/gateway/opc-source-validator');
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { extractSourceForPrivacy } = require('../plugins/data-secure/server/core/markdown-first-privacy');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } = require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { verifyAnonymizedPublication } = require('../plugins/data-secure/server/standalone/anonymized-artifact');
const { replayTransformTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const { initialEntities, applyEntityDecisions } = require('../plugins/data-secure/server/gateway/standalone-entity-review');
const { bindStandaloneDocumentKeeps } = require('../plugins/data-secure/server/privacy/residual-person-review');
const { test, testAsync, done, assert } = createSuite('Source-bound indexed Office chart caches and chartsheets');
const C='http://schemas.openxmlformats.org/drawingml/2006/chart',A='http://schemas.openxmlformats.org/drawingml/2006/main',P='http://schemas.openxmlformats.org/presentationml/2006/main',S='http://schemas.openxmlformats.org/spreadsheetml/2006/main',X='http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',PR='http://schemas.openxmlformats.org/package/2006/relationships';
const CHART_TYPE='application/vnd.openxmlformats-officedocument.drawingml.chart+xml',DRAWING_TYPE='application/vnd.openxmlformats-officedocument.drawing+xml',SHEET_TYPE='application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',CHARTSHEET_TYPE='application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const fail=limit=>Object.assign(new Error('Synthetic chart error'),{code:limit?'PPTX_STRUCTURE_LIMIT':'PPTX_STRUCTURE_UNSAFE'});
const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const point=(index,value)=>`<c:pt idx="${index}"><c:v>${esc(value)}</c:v></c:pt>`;
const ref=(kind,points,{count=2,format}={})=>`<c:${kind}><c:f>Data!$A$1:$A$2</c:f><c:${kind==='strRef'?'strCache':'numCache'}>${format?`<c:formatCode>${esc(format)}</c:formatCode>`:''}<c:ptCount val="${count}"/>${points}</c:${kind==='strRef'?'strCache':'numCache'}></c:${kind}>`;
const rich=value=>`<c:tx><c:rich><a:p><a:r><a:t>${esc(value)}</a:t></a:r></a:p></c:rich></c:tx>`;
function chart({cat=ref('strRef',point(0,'North')+point(1,'South')),val=ref('numRef',point(1,'200')+point(0,'100')),type='barChart',title='Revenue',series='Sales',axis,extra='',seriesXml}={}){
 return `<c:chartSpace xmlns:c="${C}" xmlns:a="${A}"><c:chart><c:title>${rich(title)}</c:title><c:plotArea><c:${type}>`+
  (seriesXml??`<c:ser><c:idx val="3"/><c:order val="0"/><c:tx><c:v>${esc(series)}</c:v></c:tx><c:cat>${cat}</c:cat><c:val>${val}</c:val></c:ser>`)+
  `${axis?'<c:axId val="17"/>':''}</c:${type}>${axis?`<c:catAx><c:axId val="17"/><c:title>${rich(axis)}</c:title></c:catAx>`:''}</c:plotArea></c:chart>${extra}</c:chartSpace>`;
}
const model=xml=>readOfficeChart(xml,xmlDecode,fail);
const render=xml=>renderOfficeChart(model(xml),value=>String(value).replaceAll('|','\\|').replaceAll('\r','&#13;').replaceAll('\n','<br>'),fail);
function frame(id='c1',family='ppt'){
 const ns=family==='ppt'?'p':'xdr';
 return `<${ns}:graphicFrame><a:graphic><a:graphicData uri="${C}"><c:chart r:id="${id}"/></a:graphicData></a:graphic></${ns}:graphicFrame>`;
}
function pptSource(chartXml=chart(),{repeat=1,slides=1,orphan=false,extra=[],wrongOwner=false,chartType=CHART_TYPE}={}){
 const entries=[...opcControlEntries('pptx',{additionalOverrides:[{part:'ppt/charts/chart1.xml',contentType:chartType}]}),
  ['ppt/presentation.xml',`<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst>${Array.from({length:slides},(_,i)=>`<p:sldId id="${256+i}" r:id="s${i+1}"/>`).join('')}</p:sldIdLst></p:presentation>`],
  ['ppt/_rels/presentation.xml.rels',`<Relationships xmlns="${PR}">${Array.from({length:slides},(_,i)=>`<Relationship Id="s${i+1}" Type="${R}/slide" Target="slides/slide${i+1}.xml"/>`).join('')}</Relationships>`],
  ['ppt/charts/chart1.xml',chartXml]];
 for(let i=1;i<=slides;i++)entries.push(
  [`ppt/slides/slide${i}.xml`,`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:c="${C}" xmlns:r="${R}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>FHIR_SLIDE_${i}</a:t></a:r></a:p></p:txBody></p:sp>${orphan?'':wrongOwner?`<u:wrapper xmlns:u="urn:foreign">${frame()}</u:wrapper>`:frame().repeat(repeat)}</p:spTree></p:cSld></p:sld>`],
  [`ppt/slides/_rels/slide${i}.xml.rels`,`<Relationships xmlns="${PR}"><Relationship Id="c1" Type="${R}/chart" Target="../charts/chart1.xml"/></Relationships>`]);
 return zipStore([...new Map([...entries,...extra])]);
}
function xlsxSource(chartXml=chart(),{chartsheet=false,extra=[],sheetType,partName,drawRef=true}={}){
 const part=partName||`xl/${chartsheet?'chartsheets':'worksheets'}/sheet1.xml`,kind=chartsheet?'chartsheet':'worksheet';
 return zipStore([...new Map([...opcControlEntries('xlsx',{additionalOverrides:[
  {part,contentType:sheetType||(chartsheet?CHARTSHEET_TYPE:SHEET_TYPE)},
  {part:'xl/drawings/drawing1.xml',contentType:DRAWING_TYPE},{part:'xl/charts/chart1.xml',contentType:CHART_TYPE}]}),
  ['xl/workbook.xml',`<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Original sheet" sheetId="1" r:id="s1"/></sheets></workbook>`],
  ['xl/_rels/workbook.xml.rels',`<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/${kind}" Target="${part.slice(3)}"/></Relationships>`],
  [part,`<${kind} xmlns="${S}" xmlns:r="${R}">${chartsheet?'':'<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>FHIR_WORKSHEET</t></is></c></row></sheetData>'}${drawRef?'<drawing r:id="d1"/>':''}</${kind}>`],
  [part.replace(/\/([^/]+)$/u,'/_rels/$1.rels'),`<Relationships xmlns="${PR}"><Relationship Id="d1" Type="${R}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`],
  ['xl/drawings/drawing1.xml',`<xdr:wsDr xmlns:xdr="${X}" xmlns:a="${A}" xmlns:c="${C}" xmlns:r="${R}"><xdr:absoluteAnchor>${frame('c1','xl')}</xdr:absoluteAnchor></xdr:wsDr>`],
  ['xl/drawings/_rels/drawing1.xml.rels',`<Relationships xmlns="${PR}"><Relationship Id="c1" Type="${R}/chart" Target="../charts/chart1.xml"/></Relationships>`],
  ['xl/charts/chart1.xml',chartXml],...extra])]);
}
const wordDrawing=(id='c1',anchor='inline')=>`<w:p><w:r><w:drawing><wp:${anchor}><a:graphic><a:graphicData uri="${C}"><c:chart r:id="${id}"/></a:graphicData></a:graphic></wp:${anchor}></w:drawing></w:r></w:p>`;
function wordSource(chartXml=chart(),{body=wordDrawing(),extra=[],chartType=CHART_TYPE,chartRole='chart',header=false,notes=false}={}){
 const namespace=`xmlns:w="${W}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:c="${C}" xmlns:r="${R}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:u="urn:unknown"`;
 const extras=[];
 if(header)extras.push(['word/header1.xml',`<w:hdr ${namespace}>${wordDrawing()}</w:hdr>`],['word/_rels/header1.xml.rels',`<Relationships xmlns="${PR}"><Relationship Id="c1" Type="${R}/chart" Target="charts/chart1.xml"/></Relationships>`]);
 if(notes)extras.push(['word/footnotes.xml',`<w:footnotes ${namespace}><w:footnote w:id="1">${wordDrawing()}</w:footnote><w:footnote w:id="2">${wordDrawing('ORPHAN')}</w:footnote></w:footnotes>`],['word/_rels/footnotes.xml.rels',`<Relationships xmlns="${PR}"><Relationship Id="c1" Type="${R}/chart" Target="charts/chart1.xml"/><Relationship Id="ORPHAN" Type="${R}/chart" Target="charts/chart2.xml"/></Relationships>`],['word/charts/chart2.xml',chart({title:'ORPHAN_SECRET'})]);
 return zipStore([...new Map([...opcControlEntries('docx',{additionalOverrides:[{part:'word/charts/chart1.xml',contentType:chartType},
  ...(header?[{part:'word/header1.xml',contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml'}]:[]),
  ...(notes?[{part:'word/footnotes.xml',contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml'},{part:'word/charts/chart2.xml',contentType:CHART_TYPE}]:[])]}),
  ['word/document.xml',`<w:document ${namespace}><w:body><w:p><w:r><w:t>FHIR_WORD</w:t></w:r></w:p>${body}${notes?'<w:p><w:r><w:footnoteReference w:id="1"/></w:r></w:p>':''}${header?'<w:sectPr><w:headerReference w:type="default" r:id="h1"/></w:sectPr>':''}</w:body></w:document>`],
  ['word/_rels/document.xml.rels',`<Relationships xmlns="${PR}"><Relationship Id="c1" Type="${R}/${chartRole}" Target="charts/chart1.xml"/>${header?`<Relationship Id="h1" Type="${R}/header" Target="header1.xml"/>`:''}${notes?`<Relationship Id="n1" Type="${R}/footnotes" Target="footnotes.xml"/>`:''}</Relationships>`],
  ['word/charts/chart1.xml',chartXml],...extras,...extra])]);
}
const extract=(buffer,extension='.pptx',markdownOutput='content-v1')=>extractMarkdownBuffer(buffer,extension,{markdownOutput,partialExtraction:true});
function xyChart({type='scatterChart',xLabel='Name',yLabel='Messwert',x='Qvx / Qvy',y='50',size='8',ambiguous=false,reversed=false}={}){
 const axis=(id,cross,position,label)=>`<c:valAx><c:axId val="${id}"/>${ambiguous?'':`<c:axPos val="${position}"/>`}<c:title>${rich(label)}</c:title><c:crossAx val="${cross}"/></c:valAx>`;
 const axes=[axis(17,18,'b',xLabel),axis(18,17,'l',yLabel)];if(reversed)axes.reverse();
 return `<c:chartSpace xmlns:c="${C}" xmlns:a="${A}"><c:chart><c:plotArea><c:${type}><c:ser><c:idx val="0"/><c:order val="0"/><c:xVal>${ref('strRef',point(0,x),{count:1})}</c:xVal><c:yVal>${ref('numRef',point(0,y),{count:1})}</c:yVal>${type==='bubbleChart'?`<c:bubbleSize>${ref('numRef',point(0,size),{count:1})}</c:bubbleSize>`:''}</c:ser><c:axId val="${reversed?18:17}"/><c:axId val="${reversed?17:18}"/></c:${type}>${axes.join('')}</c:plotArea></c:chart></c:chartSpace>`;
}

const wideExtensions = (count, lateValue = false) => '<c:extLst>' + Array.from({length:count},(_,index) =>
 `<c:ext uri="urn:wide:${index}">${lateValue && index === count - 1 ? '<c:v>UNMODELED_PRIVATE_VALUE</c:v>' : ''}</c:ext>`).join('') + '</c:extLst>';
test('wide bounded extension lists avoid argument-vector limits and still scan unknown values',()=>{
 const value=model(chart({extra:wideExtensions(150000,true)}));
 assert.ok(value.issues.has('CONTENT_UNMODELED'));
 const rendered=renderOfficeChart(value,value=>String(value),fail);
 for(const text of ['Revenue','North','South','100','200'])assert.ok(rendered.markdown.includes(text));
 assert.doesNotMatch(rendered.markdown,/UNMODELED_PRIVATE_VALUE/u);
 assert.equal(rendered.hasSource,true);
});
test('wide reached charts retain actual caches in Word, PowerPoint and chartsheets in both output modes',()=>{
 const xml=chart({extra:wideExtensions(150000,true)});
 for(const [extension,build,owner]of [['.pptx',value=>pptSource(value),'FHIR_SLIDE_1'],
  ['.docx',value=>wordSource(value),'FHIR_WORD'],['.xlsx',value=>xlsxSource(value,{chartsheet:true}),'Original sheet']]){
  const bytes=build(xml),before=Buffer.from(bytes);
  for(const mode of ['content-v1','notes-v1']){
   const result=extract(bytes,extension,mode);assert.ok(require('markdown-it')().render(result.markdown).includes(owner));
   for(const text of ['Revenue','North','South','100','200'])assert.ok(result.markdown.includes(text));
   assert.doesNotMatch(result.markdown,/UNMODELED_PRIVATE_VALUE/u);
   assert.equal(result.coverage.status,'incomplete');
   assert.ok(result.coverage.reason_codes.includes('SOURCE_COVERAGE_UNVERIFIED'));
  }
  assert.deepEqual(bytes,before);
 }
});
test('the declared chart node limit remains typed and partial mode retains independent owner text',()=>{
 const xml=chart({extra:wideExtensions(200001)});
 assert.throws(()=>model(xml),{code:'PPTX_STRUCTURE_LIMIT'});
 for(const [extension,build,owner]of [['.pptx',value=>pptSource(value),'FHIR_SLIDE_1'],
  ['.docx',value=>wordSource(value),'FHIR_WORD'],['.xlsx',value=>xlsxSource(value),'FHIR_WORKSHEET']]){
  const bytes=build(xml),before=Buffer.from(bytes);
  for(const mode of ['content-v1','notes-v1']){
   const result=extract(bytes,extension,mode);assert.ok(require('markdown-it')().render(result.markdown).includes(owner));
   assert.doesNotMatch(result.markdown,/Revenue|North|South/u);
   assert.equal(result.coverage.status,'incomplete');
   assert.ok(result.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
  }
  assert.deepEqual(bytes,before);
 }
});
test('explicit point indices bind shuffled cache values, never XML order',()=>{
 const m=model(chart()); assert.equal(m.groups[0].series[0].channels.get('val').levels[0].get(0),'100');
 const result=render(chart());assert.match(result.markdown,/\| 0 \| North \| 100 \|/u);assert.match(result.markdown,/\| 1 \| South \| 200 \|/u);
 assert.match(result.markdown,/nicht neu berechnet/u);assert.equal(result.hasSource,true);
});
test('cache gaps remain missing instead of zero or positional zip',()=>{
 const result=render(chart({cat:ref('strRef',point(0,'North')+point(7,'South'),{count:8}),val:ref('numRef',point(7,200)+point(2,100),{count:8})}));
 assert.match(result.markdown,/\| 0 \| North \|  \|/u);
 assert.match(result.markdown,/\| 2 \|  \| 100 \|/u);
 assert.match(result.markdown,/Hinweis: Fehlender gespeicherter Cachepunkt · Datenkanal val · Ebene 1 · Punktindex 0\./u);
 assert.match(result.markdown,/Hinweis: Fehlender gespeicherter Cachepunkt · Datenkanal cat · Ebene 1 · Punktindex 2\./u);
 assert.match(result.markdown,/\| 7 \| South \| 200 \|/u);assert.ok(result.issues.includes('CACHE_GAPS'));
});
test('very high sparse indices and ptCount do not allocate to the maximum',()=>{
 const result=render(chart({cat:ref('strRef',point(4294967294,'LAST'),{count:4294967295}),val:ref('numRef',point(4294967294,1),{count:4294967295})}));
 assert.match(result.markdown,/\| 4294967294 \| LAST \| 1 \|/u);assert.ok(result.markdown.length<3000);
});
test('multilevel category points keep exact level/index without guessed forward fill',()=>{
 const cat='<c:multiLvlStrRef><c:f>Data!$A$1:$B$2</c:f><c:multiLvlStrCache><c:ptCount val="2"/><c:lvl>'+point(1,'Leaf B')+point(0,'Leaf A')+'</c:lvl><c:lvl>'+point(0,'Parent')+'</c:lvl></c:multiLvlStrCache></c:multiLvlStrRef>';
 const result=render(chart({cat}));assert.match(result.markdown,/\| 0 \| Leaf A \| Parent \| 100 \|/u);
 assert.match(result.markdown,/\| 1 \| Leaf B \|  \| 200 \|/u);assert.match(result.markdown,/nicht auf andere Indizes übertragen/u);
 assert.match(result.markdown,/Datenkanal cat · Ebene 2 · Punktindex 1\./u);
});
for(const type of ['scatterChart','bubbleChart'])test(`${type} binds X/Y/size by exact index`,()=>{
 const ser='<c:ser><c:idx val="1"/><c:order val="0"/><c:xVal>'+ref('numRef',point(1,20)+point(0,10))+'</c:xVal><c:yVal>'+ref('numRef',point(0,100)+point(1,200))+'</c:yVal>'+(type==='bubbleChart'?'<c:bubbleSize>'+ref('numRef',point(1,8)+point(0,4))+'</c:bubbleSize>':'')+'</c:ser>';
 const result=render(chart({type,seriesXml:ser}));assert.match(result.markdown,type==='bubbleChart'?/\| 0 \| 10 \| 100 \| 4 \|/u:/\| 0 \| 10 \| 100 \|/u);
});
test('literal caches, source formatting and Unicode are modelled without formulas',()=>{
 const result=render(chart({cat:'<c:strLit><c:ptCount val="1"/>'+point(0,'ÄÖÜß 中文 😀')+'</c:strLit>',val:'<c:numLit><c:formatCode>0.0%</c:formatCode><c:ptCount val="1"/>'+point(0,'0.125')+'</c:numLit>'}));
 assert.match(result.markdown,/ÄÖÜß 中文 😀 \| 12\.5%/u);
});
test('chart numeric caches use their own exact 1904 date system and format code',()=>{
 const original=chart({val:ref('numRef',point(0,'1'),{count:1,format:'yyyy-mm-dd'})});
 assert.match(render(original).markdown,/1900-01-01/u);
 assert.match(render(original.replace('<c:chart>','<c:date1904 val="1"/><c:chart>')).markdown,/1904-01-02/u);
});
test('missing cache is disclosed and never replaced by formula calculation',()=>{
 const result=render(chart({val:'<c:numRef><c:f>WEBSERVICE("https://invalid.test")</c:f></c:numRef>'}));
 assert.ok(result.issues.includes('CACHE_MISSING'));assert.match(result.markdown,/North \|  \|/u);assert.match(result.markdown,/nicht ausgewertet/u);
});
test('unmodelled chart keeps its title but never fabricates a flat raw-value row',()=>{
 const result=render(chart({type:'unknownChart'}));assert.match(result.markdown,/Revenue/u);assert.doesNotMatch(result.markdown,/North|South|100|200/u);assert.ok(result.issues.includes('CHART_UNMODELED'));
});
for(const [name,change] of [
 ['duplicate point',xml=>xml.replace(point(1,'200'),point(0,'200'))],
 ['out of declared count',xml=>xml.replace('idx="1"','idx="2"')],
 ['negative index',xml=>xml.replace('idx="1"','idx="-1"')],
 ['overflow index',xml=>xml.replace('idx="1"','idx="4294967296"')],
 ['hidden v child',xml=>xml.replace('<c:v>North</c:v>','<c:v>N<u:secret xmlns:u="urn:foreign">SECRET</u:secret>orth</c:v>')],
 ['invalid Xstring control',xml=>xml.replace('North','North_x0000_')],
 ['wrong root',xml=>xml.replaceAll('c:chartSpace','c:notChart')]
])test(`invalid model stays atomic: ${name}`,()=>assert.throws(()=>model(change(chart())),e=>e.code==='PPTX_STRUCTURE_UNSAFE'));
test('classic charts use expanded names including Strict aliases',()=>{
 const strict=chart().replaceAll(C,'http://purl.oclc.org/ooxml/drawingml/chart').replaceAll(A,'http://purl.oclc.org/ooxml/drawingml/main').replaceAll('c:','z:').replace('xmlns:c=','xmlns:z=');
 assert.match(render(strict).markdown,/North \| 100/u);
});
test('owner references are selected/namespace/graphicFrame bound and preserve real occurrences',()=>{
 const original=`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:c="${C}" xmlns:r="${R}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:u="urn:unknown"><p:cSld><p:spTree>`+frame()+frame()+'<mc:AlternateContent><mc:Choice Requires="u">'+frame('IGNORE')+'</mc:Choice><mc:Fallback>'+frame('FALLBACK')+'</mc:Fallback></mc:AlternateContent><u:wrapper>'+frame('FOREIGN')+'</u:wrapper></p:spTree></p:cSld></p:sld>';
 assert.deepEqual(officeChartReferences(original,'ppt',xmlDecode,fail),['c1','c1','FALLBACK']);
});
test('compatibility markup cannot manufacture the actual chart-part root',()=>{
 const wrapped='<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Fallback>'+chart()+'</mc:Fallback></mc:AlternateContent>';
 assert.throws(()=>model(wrapped),{code:'PPTX_STRUCTURE_UNSAFE'});
});
test('chart discovery streams ordinary Word owners without imposing chart AST limits on unrelated prose',()=>{
 const original=`<w:document xmlns:w="${W}"><w:body>${'<w:p/>'.repeat(200001)}</w:body></w:document>`;
 assert.deepEqual(officeChartReferences(original,'word',xmlDecode,fail,{understoodNamespaces:new Set()}),[]);
});
for(const extension of ['.pptx','.xlsx'])test(`${extension} actual reached OPC chart sections preserve semantic binding and source bytes`,()=>{
 const input=extension==='.pptx'?pptSource():xlsxSource(),before=Buffer.from(input);
 const result=extract(input,extension);assert.match(result.markdown,/North \| 100/u);assert.match(result.markdown,/South \| 200/u);assert.deepEqual(input,before);
 assert.equal(result.coverage.status,'incomplete');assert.match(result.markdown,extension==='.pptx'?/Besitzer: Folie 1/u:/Besitzer: Arbeitsblatt: Original sheet/u);
});
test('same chart used twice per slide and on two slides remains four real owner occurrences',()=>{
 const result=extract(pptSource(chart(),{repeat:2,slides:2}));
 assert.equal((result.markdown.match(/North \| 100/gu)||[]).length,4);
 const second=result.markdown.indexOf('# Folie 2');assert.ok(second>result.markdown.indexOf('North'));
 assert.match(result.markdown.slice(second),/Besitzer: Folie 2/u);
});
for(const options of [{orphan:true},{wrongOwner:true},{chartType:'application/xml'}])test(`orphan/untyped chart is not swept into output: ${JSON.stringify(options)}`,()=>{
 const result=extract(pptSource(chart(),options));assert.match(result.markdown,/FHIR/u);assert.doesNotMatch(result.markdown,/North|South|Revenue/u);
});
test('XLSX drawing relationship without an actual drawing reference is not enough',()=>{
 const result=extract(xlsxSource(chart(),{drawRef:false}),'.xlsx');assert.match(result.markdown,/FHIR/u);assert.doesNotMatch(result.markdown,/North|South|Revenue/u);
});
test('real chartsheet uses workbook order/name and never the worksheet cell parser',()=>{
 for(const markdownOutput of ['content-v1','notes-v1']){
  const result=extract(xlsxSource(chart(),{chartsheet:true}),'.xlsx',markdownOutput);assert.match(result.markdown,/# Diagrammblatt: Original sheet/u);assert.match(result.markdown,/North \| 100/u);assert.match(result.markdown,/Besitzer: Diagrammblatt: Original sheet/u);
 }
 const reader=createXlsxReader(xmlDecode,{preserveText:true});assert.deepEqual(reader.sheetDrawings(`<chartsheet xmlns="${S}" xmlns:r="${R}"><drawing r:id="d1"/></chartsheet>`,'chartsheet').ids,['d1']);
 assert.throws(()=>reader.worksheet(`<chartsheet xmlns="${S}"/>`,[]));
});
test('mixed worksheet/chartsheet output follows actual workbook order rather than filenames',()=>{
 const {readZip}=require('../plugins/data-secure/server/zip-reader'),entries=readZip(xlsxSource(chart(),{chartsheet:true}));
 const workbook=entries.get('xl/workbook.xml').toString('utf8').replace('<sheets>','<sheets><sheet name="BEFORE_CONTROL" sheetId="2" r:id="s2"/>');
 entries.set('xl/workbook.xml',Buffer.from(workbook));
 entries.set('xl/_rels/workbook.xml.rels',Buffer.from(entries.get('xl/_rels/workbook.xml.rels').toString('utf8').replace('</Relationships>',`<Relationship Id="s2" Type="${R}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`)));
 entries.set('xl/worksheets/sheet2.xml',Buffer.from(`<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>FHIR_BEFORE</t></is></c></row></sheetData></worksheet>`));
 entries.set('[Content_Types].xml',Buffer.from(entries.get('[Content_Types].xml').toString('utf8').replace('</Types>',`<Override PartName="/xl/worksheets/sheet2.xml" ContentType="${SHEET_TYPE}"/></Types>`)));
 const result=extract(zipStore([...entries]),'.xlsx');assert.ok(result.markdown.indexOf('BEFORE')<result.markdown.indexOf('# Diagrammblatt'));assert.ok(result.markdown.indexOf('# Diagrammblatt')<result.markdown.indexOf('North'));
});
for(const change of [{sheetType:SHEET_TYPE},{partName:'xl/worksheets/sheet1.xml'}])test(`chartsheet exact control role rejects ${JSON.stringify(change)}`,()=>{
 const source=xlsxSource(chart(),{chartsheet:true,...change});
 assert.throws(()=>parseOoxml(source,'.xlsx',undefined,{preserveText:true,partialExtraction:true}),{code:'SOURCE_TYPE_MISMATCH'});
 assert.throws(()=>extract(source,'.xlsx'));
});
test('external chart edge is quarantined, not fetched or treated as local data',()=>{
 const input=pptSource(chart(),{extra:[['ppt/slides/_rels/slide1.xml.rels',`<Relationships xmlns="${PR}"><Relationship Id="c1" Type="${R}/chart" Target="https://invalid.test/chart.xml" TargetMode="External"/></Relationships>`]]});
 const result=extract(input);assert.match(result.markdown,/FHIR/u);assert.doesNotMatch(result.markdown,/North|Revenue/u);assert.ok(result.coverage.reason_codes.includes('EXTERNAL_CONTENT_NOT_READ'));
});

for(const anchor of ['inline','anchor'])test(`Word authentic ${anchor} chart owner binds data, not loose chart references`,()=>{
 const input=wordSource(chart(),{body:wordDrawing('c1',anchor)}),before=Buffer.from(input),result=extract(input,'.docx');
 assert.match(result.markdown,/North \| 100/u);assert.match(result.markdown,/Besitzer: Word-Haupttext/u);assert.deepEqual(input,before);
});
for(const settings of [{body:''},{body:`<u:wrapper>${wordDrawing()}</u:wrapper>`},{chartType:'application/xml'},{chartRole:'image'}])test(`Word charts require actual owner, exact role/content-type: ${JSON.stringify(settings)}`,()=>{
 const result=extract(wordSource(chart(),settings),'.docx');assert.match(result.markdown,/FHIR/u);assert.doesNotMatch(result.markdown,/Revenue|North|South/u);
});
test('Word chart MC scope matches actual selected Word branches and rejects direct MC payload',()=>{
 const body='<mc:AlternateContent><mc:Choice Requires="u">'+wordDrawing('IGNORE')+'</mc:Choice><mc:Fallback>'+wordDrawing()+'</mc:Fallback></mc:AlternateContent>';
 const result=extract(wordSource(chart(),{body}),'.docx');assert.equal((result.markdown.match(/North \| 100/gu)||[]).length,1);
 const invalid=wordSource(chart(),{body:body.replace('<mc:Fallback>',wordDrawing('DIRECT')+'<mc:Fallback>')});assert.throws(()=>extract(invalid,'.docx'));
});
test('foreign Word root remains incomplete without acquiring chart authority or a new stop',()=>{
 const original=`<w:document xmlns:w="urn:foreign" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:c="${C}" xmlns:r="${R}"><w:body>${wordDrawing()}</w:body></w:document>`;
 const result=extract(wordSource(chart(),{extra:[['word/document.xml',original]]}),'.docx');assert.doesNotMatch(result.markdown,/Revenue|North|South/u);assert.equal(result.coverage.status,'incomplete');
});
test('Word chart scope cannot reinterpret ignored paragraph properties as a visible story',()=>{
 const drawing=wordDrawing().replace('<w:p>','<w:p><w:pPr>').replace('</w:p>','</w:pPr></w:p>');
 const source=`<w:document xmlns:w="${W}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:c="${C}" xmlns:r="${R}"><w:body>${drawing}</w:body></w:document>`;
 assert.deepEqual(officeChartReferences(source,'word',xmlDecode,fail,{understoodNamespaces:new Set()}),[]);
});
test('Word retained referenced header/footnote charts exclude orphan stories and intentional header omission',()=>{
 const input=wordSource(chart(),{body:'',header:true,notes:true}),result=extract(input,'.docx');
 assert.equal((result.markdown.match(/North \| 100/gu)||[]).length,2);assert.doesNotMatch(result.markdown,/ORPHAN_SECRET/u);
 assert.match(result.markdown,/Besitzer: Word-Kopfzeile/u);assert.match(result.markdown,/Besitzer: Word-Fußnoten/u);
 const raw=parseOoxml(input,'.docx',undefined,{preserveText:true,contentMode:true,partialExtraction:true,omitDocxHeaderFooter:true});
 assert.equal((raw.markdown.match(/North \| 100/gu)||[]).length,1);assert.doesNotMatch(raw.markdown,/Besitzer: Word-Kopfzeile/u);
});
test('sparse multilevel cross-product uses actual points only, preserves source field labels',()=>{
 const levels=Array.from({length:64},(_,level)=>'<c:lvl>'+Array.from({length:50},(_,index)=>point(level*50+index,`TOKEN_${level}_${index}`)).join('')+'</c:lvl>').join('');
 const cat=`<c:multiLvlStrRef><c:multiLvlStrCache><c:ptCount val="3200"/>${levels}</c:multiLvlStrCache></c:multiLvlStrRef>`;
 const result=render(chart({cat,axis:'Name',val:ref('numRef',point(0,100),{count:3200})}));
 assert.equal((result.markdown.match(/TOKEN_/gu)||[]).length,3200);assert.ok(result.markdown.length<150000);assert.match(result.markdown,/\| Punktindex \| Name \|/u);assert.doesNotMatch(result.markdown,/Kein gespeicherter Punkt/u);
});
test('series order/IDs and combo groups remain independent, never paired by nearby title',()=>{
 const original=chart(),one=/<c:ser>[\s\S]*?<\/c:ser>/u.exec(original)[0];
 const ser2=one.replace('val="3"','val="8"').replace('val="0"','val="2"').replace('Sales','Second');
 const ser1=one.replace('val="3"','val="7"').replace('val="0"','val="1"').replace('Sales','First');
 const input=original.replace(one,ser2+ser1),m=model(input);assert.deepEqual(m.groups[0].series.map(s=>s.index),[7,8]);
 const combo=input.replace('</c:barChart>','</c:barChart><c:lineChart>'+one+'</c:lineChart>');assert.equal(model(combo).groups.length,2);
 assert.throws(()=>model(original.replace(one,one+one)),{code:'PPTX_STRUCTURE_UNSAFE'});
});
test('unmodelled numeric format keeps raw source and discloses its format, without calculation',()=>{
 const result=render(chart({val:ref('numRef',point(0,'123'),{count:1,format:'q~unsupported'})}));
 assert.match(result.markdown,/123/u);assert.match(result.markdown,/q~unsupported/u);assert.ok(result.issues.includes('NUMBER_FORMAT_UNMODELED'));
});
test('model bounds reject excessive levels, series, points, text and duplicate axes atomically',()=>{
 const cat='<c:multiLvlStrRef><c:multiLvlStrCache><c:ptCount val="1"/>'+('<c:lvl>'+point(0,'X')+'</c:lvl>').repeat(65)+'</c:multiLvlStrCache></c:multiLvlStrRef>';
 assert.throws(()=>model(chart({cat})),{code:'PPTX_STRUCTURE_LIMIT'});
 const series=Array.from({length:4097},(_,i)=>`<c:ser><c:idx val="${i}"/><c:order val="${i}"/></c:ser>`).join('');
 assert.throws(()=>model(chart({seriesXml:series})),{code:'PPTX_STRUCTURE_LIMIT'});
 const points=Array.from({length:100001},(_,i)=>point(i,'X')).join('');
 assert.throws(()=>model(chart({cat:ref('strRef',points,{count:100001})})),{code:'PPTX_STRUCTURE_LIMIT'});
 assert.throws(()=>model(chart({title:'X'.repeat(8000001)})),{code:'PPTX_STRUCTURE_LIMIT'});
 const duplicate=chart({axis:'Name'}).replace('</c:plotArea>','<c:valAx><c:axId val="17"/></c:valAx></c:plotArea>');
 assert.throws(()=>model(duplicate),{code:'PPTX_STRUCTURE_UNSAFE'});
});
test('damaged bound chart is an atomic omission while independent native source remains',()=>{
 const bad=chart().replace(point(1,'200'),point(0,'200')),result=extract(pptSource(bad));
 assert.match(result.markdown,/FHIR/u);assert.doesNotMatch(result.markdown,/North|Revenue/u);assert.ok(result.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
});
test('chartsheet edges reject wrong namespace, owner, mode, duplicate target and external binding',()=>{
 const source=xlsxSource(chart(),{chartsheet:true}),{readZip}=require('../plugins/data-secure/server/zip-reader');
 const entries=readZip(source),rel='xl/_rels/workbook.xml.rels',original=entries.get(rel).toString('utf8');
 const reject=changed=>assert.throws(()=>parseOoxml(zipStore([...new Map([...entries,...changed])]),'.xlsx',undefined,{preserveText:true,partialExtraction:true}));
 reject([[rel,original.replace(`${R}/chartsheet`,'urn:foreign/chartsheet')]]);
 reject([[rel,original.replace('Target="chartsheets','TargetMode="external" Target="chartsheets')]]);
 reject([[rel,original.replace('</Relationships>',`<Relationship Id="s2" Type="${R}/chartsheet" Target="chartsheets/sheet1.xml"/></Relationships>`)]]);
 reject([[rel,original.replace('Target="chartsheets/sheet1.xml"','TargetMode="External" Target="https://invalid.test/sheet1.xml"')]]);
 reject([['xl/chartsheets/_rels/sheet1.xml.rels',`<Relationships xmlns="${PR}"><Relationship Id="wrong" Type="${R}/chartsheet" Target="sheet1.xml"/></Relationships>`]]);
});
test('scatter/bubble value-axis roles require actual IDs, orientation and reciprocal crossing, never XML order',()=>{
 for(const type of ['scatterChart','bubbleChart'])for(const reversed of [false,true]){
  const result=render(xyChart({type,reversed}));assert.match(result.markdown,/\| Punktindex \| Name \| Messwert(?: \| Blasengröße)? \|/u);assert.match(result.markdown,/Qvx \/ Qvy/u);
 }
 const uncertain=render(xyChart({type:'bubbleChart',ambiguous:true,size:'Qrz'}));assert.match(uncertain.markdown,/\| Geschützter Tabellenwert \| Geschützter Tabellenwert \| Geschützter Tabellenwert \|/u);assert.ok(uncertain.issues.includes('AXIS_ROLE_UNRESOLVED'));
 const orphan=xyChart({xLabel:'Preis'}).replace('</c:plotArea>','<c:valAx><c:axId val="99"/><c:axPos val="b"/><c:title>'+rich('Name')+'</c:title></c:valAx></c:plotArea>');
 assert.match(render(orphan).markdown,/\| Punktindex \| Preis \| Messwert \|/u);assert.doesNotMatch(render(orphan).markdown,/\| Punktindex \| Name/u);
});

test('missing/ambiguous actual axis references are partial without borrowing unbound title roles',()=>{
 const missing=xyChart({xLabel:'Preis'}).replace('<c:axId val="18"/></c:scatterChart>','<c:axId val="99"/></c:scatterChart>');
 assert.ok(render(missing).issues.includes('AXIS_ROLE_UNRESOLVED'));
 assert.ok(render(chart()).issues.includes('AXIS_ROLE_UNRESOLVED'));
 assert.ok(render(xyChart({ambiguous:true})).issues.includes('AXIS_ROLE_UNRESOLVED'));
 const pie=chart({type:'pieChart'});assert.ok(!render(pie).issues.includes('AXIS_ROLE_UNRESOLVED'));
});

const sparseCategory=()=>chart({axis:'Name',cat:ref('strRef',point(0,'Qvx'),{count:2}),val:ref('numRef',point(0,50)+point(1,75),{count:2})});
const sparseXY=()=>xyChart({x:'Qvx'}).replace(`<c:xVal>${ref('strRef',point(0,'Qvx'),{count:1})}</c:xVal>`,`<c:xVal>${ref('strRef',point(0,'Qvx'),{count:2})}</c:xVal>`).replace(`<c:yVal>${ref('numRef',point(0,'50'),{count:1})}</c:yVal>`,`<c:yVal>${ref('numRef',point(0,50)+point(1,75),{count:2})}</c:yVal>`);
for(const [name,xml,kind]of [['category',sparseCategory(),'cat'],['xy',sparseXY(),'xVal']])for(const extension of ['.pptx','.xlsx','.docx'])for(const profile of ['general','personnel_profile'])testAsync(`${name}/${extension}/${profile} sparse absent field stays empty without invented identity mapping`,async()=>{
 const input=extension==='.pptx'?pptSource(xml):extension==='.docx'?wordSource(xml):xlsxSource(xml,{chartsheet:true}),before=Buffer.from(input);
 const contentOptions={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false},consumerOptions={productChannel:'standalone',contentOptions};
 const source=await extractSourceForPrivacy(input,extension,{contentOptions,convertBuffer:async bytes=>{const actual=extract(bytes,extension);return createMarkdownExtraction({source_type:extension.slice(1),markdown:actual.markdown,coverage:actual.coverage,content_options:contentOptions});}});
 assert.match(source.markdown,/\| 1 \|  \| 75 \|/u);assert.ok(source.markdown.includes(`Datenkanal ${kind} · Ebene 1 · Punktindex 1.`));
 const prepared=prepareTextPrivacyReview({text:source.markdown,profile,productChannel:'standalone',consumerOptions,registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
 const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'}),final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
 assert.match(final.markdown,/\| 1 \|  \| 75 \|/u);assert.doesNotMatch(final.markdown,/Qvx|Kein gespeicherter Punkt/u);
 assert.ok(final.dictionary.every(item=>!/gespeicherter|Cachepunkt|Datenkanal|Punktindex/u.test(item.value)));
 const entities=initialEntities({markdown:final.markdown,transform_trace:final.transform_trace});assert.deepEqual(entities.filter(entity=>entity.kind==='PERSON').map(entity=>entity.original),['Qvx']);
 assert.equal(replayTransformTrace(final.transform_trace),final.markdown);assert.deepEqual(input,before);
 const proof={markdown:final.markdown,profile,content_options:contentOptions,source_extraction:source.sourceExtraction,dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates};assert.ok(verifyAnonymizedPublication(proof));
 const target=entities.find(entity=>entity.original==='Qvx'),kept=applyEntityDecisions(final.markdown,entities,[{entity_id:target.entity_id,decision:'keep'}],Buffer.alloc(32,29));
 const keepProof=bindStandaloneDocumentKeeps(kept.markdown,[],kept.entities.filter(entity=>entity.decision==='keep').map(({start,end})=>({start,end})));
 assert.throws(()=>verifyAnonymizedPublication({...proof,markdown:kept.markdown,reviewed_person_candidates:keepProof}),{code:'STANDALONE_PUBLICATION_INVALID'});
});

testAsync('notes-v1 sparse XY source has no synthetic PERSON mapping for its absent point',async()=>{
 const input=pptSource(sparseXY()),profile='general',contentOptions={schema:'datasecure-content-options/1',markdownOutput:'notes-v1',scanOcr:false,imageOcr:false},consumerOptions={productChannel:'standalone',contentOptions};
 const source=await extractSourceForPrivacy(input,'.pptx',{contentOptions,convertBuffer:async bytes=>{const actual=extract(bytes,'.pptx','notes-v1');return createMarkdownExtraction({source_type:'pptx',markdown:actual.markdown,coverage:actual.coverage,content_options:contentOptions});}});
 const prepared=prepareTextPrivacyReview({text:source.markdown,profile,productChannel:'standalone',consumerOptions,registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
 const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'}),final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
 assert.match(final.markdown,/\| 1 \|  \| 75 \|/u);assert.doesNotMatch(final.markdown,/Qvx|Kein gespeicherter Punkt/u);assert.deepEqual(initialEntities({markdown:final.markdown,transform_trace:final.transform_trace}).filter(entity=>entity.kind==='PERSON').map(entity=>entity.original),['Qvx']);
 assert.equal(replayTransformTrace(final.transform_trace),final.markdown);assert.ok(verifyAnonymizedPublication({markdown:final.markdown,profile,content_options:contentOptions,source_extraction:source.sourceExtraction,dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates}));
});

for(const [name,xml,secret,generic]of [
 ['scatter-x',xyChart(),/Qvx|Qvy/u,false],
 ['scatter-y',xyChart({xLabel:'Preis',yLabel:'Name',x:'1234',y:'Qvx / Qvy',reversed:true}),/Qvx|Qvy/u,false],
 ['bubble-x',xyChart({type:'bubbleChart'}),/Qvx|Qvy/u,false],
 ['bubble-ambiguous-size',xyChart({type:'bubbleChart',ambiguous:true,size:'Qrz / Qrs'}),/Qvx|Qvy|Qrz|Qrs/u,true],
 ['scatter-personnel-id',xyChart({xLabel:'Personalnummer',x:'1234'}),/1234/u,false],
 ['category-personnel-id',chart({axis:'Personalnummer',cat:ref('numRef',point(0,'1234'),{count:1}),val:ref('numRef',point(0,50),{count:1})}),/1234/u,false]
])for(const extension of ['.pptx','.xlsx','.docx'])for(const profile of ['general','personnel_profile'])testAsync(`${name}/${extension}/${profile} real source-field repair through full publication and Keep`,async()=>{
 const input=extension==='.pptx'?pptSource(xml):extension==='.docx'?wordSource(xml):xlsxSource(xml,{chartsheet:true}),before=Buffer.from(input);
 const contentOptions={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false},consumerOptions={productChannel:'standalone',contentOptions};
 const source=await extractSourceForPrivacy(input,extension,{contentOptions,convertBuffer:async bytes=>{const actual=extract(bytes,extension);return createMarkdownExtraction({source_type:extension.slice(1),markdown:actual.markdown,coverage:actual.coverage,content_options:contentOptions});}});
 assert.match(source.markdown,/Gespeicherte Datenpunkte dieser Serie:\n\n\| Punktindex/u);
 const prepared=prepareTextPrivacyReview({text:source.markdown,profile,productChannel:'standalone',consumerOptions,registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
 const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'}),final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
 assert.doesNotMatch(final.markdown,secret);assert.match(final.markdown,extension==='.xlsx'?/Original sheet/u:/FHIR/u);assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
 if(!generic)assert.match(final.markdown,name==='scatter-y'?/\| 0 \| 1234 \|/u:/\| 50(?: \||$)/u);
 if(generic)assert.match(final.markdown,/FIELD_REDACTED/u);
 const proof={markdown:final.markdown,profile,content_options:contentOptions,source_extraction:source.sourceExtraction,dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates};
 assert.ok(verifyAnonymizedPublication(proof));
 const entities=initialEntities({markdown:final.markdown,transform_trace:final.transform_trace}),target=entities.find(entity=>secret.test(entity.original));assert.ok(target);
 const kept=applyEntityDecisions(final.markdown,entities,[{entity_id:target.entity_id,decision:'keep'}],Buffer.alloc(32,17));
 const keepProof=bindStandaloneDocumentKeeps(kept.markdown,[],kept.entities.filter(entity=>entity.decision==='keep').map(({start,end})=>({start,end})));
 assert.throws(()=>verifyAnonymizedPublication({...proof,markdown:kept.markdown,reviewed_person_candidates:keepProof}),{code:'STANDALONE_PUBLICATION_INVALID'});assert.deepEqual(input,before);
});

testAsync('notes-v1 actual XY chart source retains the same protected axis role through publication',async()=>{
 const input=pptSource(xyChart()),contentOptions={schema:'datasecure-content-options/1',markdownOutput:'notes-v1',scanOcr:false,imageOcr:false},consumerOptions={productChannel:'standalone',contentOptions};
 const source=await extractSourceForPrivacy(input,'.pptx',{contentOptions,convertBuffer:async bytes=>{const actual=extract(bytes,'.pptx','notes-v1');return createMarkdownExtraction({source_type:'pptx',markdown:actual.markdown,coverage:actual.coverage,content_options:contentOptions});}});
 const prepared=prepareTextPrivacyReview({text:source.markdown,profile:'general',productChannel:'standalone',consumerOptions,registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
 const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'}),final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
 assert.doesNotMatch(final.markdown,/Qvx|Qvy/u);assert.match(final.markdown,/\| 50 \|/u);assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
 assert.ok(verifyAnonymizedPublication({markdown:final.markdown,profile:'general',content_options:contentOptions,source_extraction:source.sourceExtraction,dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates}));
});

for(const multilevel of [false,true])for(const extension of ['.pptx','.xlsx','.docx'])for(const profile of ['general','personnel_profile'])testAsync(`${extension}/${profile}/${multilevel?'multilevel':'single'} actual indexed chart→Privacy→Residual→Keep→Trace`,async()=>{
 const cat=multilevel?'<c:multiLvlStrRef><c:multiLvlStrCache><c:ptCount val="2"/><c:lvl>'+point(1,'Anna_x000D_Berger')+point(0,'Qvx')+'</c:lvl><c:lvl>'+point(1,'Murat_x000D_Kaya')+'</c:lvl></c:multiLvlStrCache></c:multiLvlStrRef>':ref('strRef',point(1,'Anna_x000D_Berger')+point(0,'Qvx'));
 const xml=chart({axis:'Name',cat,val:ref('numRef',point(1,200)+point(0,100))});
 const input=extension==='.pptx'?pptSource(xml):extension==='.docx'?wordSource(xml):xlsxSource(xml,{chartsheet:true}),before=Buffer.from(input);
 const contentOptions={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false},consumerOptions={productChannel:'standalone',contentOptions};
 const source=await extractSourceForPrivacy(input,extension,{contentOptions,convertBuffer:async bytes=>{
  assert.deepEqual(bytes,before);const actual=extract(bytes,extension);return createMarkdownExtraction({source_type:extension.slice(1),markdown:actual.markdown,coverage:actual.coverage,content_options:contentOptions});
 }});
 const prepared=prepareTextPrivacyReview({text:source.markdown,profile,productChannel:'standalone',consumerOptions,registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
 const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'}),final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
 assert.doesNotMatch(final.markdown,/Qvx|Anna|Berger|Murat|Kaya/u);assert.match(final.markdown,/100|200/u);assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
 const proof={markdown:final.markdown,profile,content_options:contentOptions,source_extraction:source.sourceExtraction,dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates};
 assert.ok(verifyAnonymizedPublication(proof));
 const entities=initialEntities({markdown:final.markdown,transform_trace:final.transform_trace}),target=entities.find(entity=>entity.original.includes('Qvx'));assert.ok(target);
 const kept=applyEntityDecisions(final.markdown,entities,[{entity_id:target.entity_id,decision:'keep'}],Buffer.alloc(32,9));
 const keepProof=bindStandaloneDocumentKeeps(kept.markdown,[],kept.entities.filter(entity=>entity.decision==='keep').map(({start,end})=>({start,end})));
 assert.throws(()=>verifyAnonymizedPublication({...proof,markdown:kept.markdown,reviewed_person_candidates:keepProof}),{code:'STANDALONE_PUBLICATION_INVALID'});assert.deepEqual(input,before);
});

done();
