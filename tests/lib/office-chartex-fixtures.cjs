'use strict';
const {zipStore}=require('./zip');
const {opcControlEntries}=require('./opc');
const CX='http://schemas.microsoft.com/office/drawing/2014/chartex',CR='http://schemas.microsoft.com/office/2014/relationships/chartEx';
const A='http://schemas.openxmlformats.org/drawingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',PR='http://schemas.openxmlformats.org/package/2006/relationships';
const P='http://schemas.openxmlformats.org/presentationml/2006/main',W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',S='http://schemas.openxmlformats.org/spreadsheetml/2006/main',X='http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const TYPE='application/vnd.ms-office.chartex+xml';
const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const pt=(index,value)=>`<cx:pt idx="${index}">${esc(value)}</cx:pt>`;
const dim=(type='cat',values=[[0,'North'],[1,'South']],{numeric=false,name,format,count=2,extra='',levels}={})=>`<cx:${numeric?'numDim':'strDim'} type="${type}">${extra}${levels??`<cx:lvl ptCount="${count}"${name===undefined?'':` name="${esc(name)}"`}${format===undefined?'':` formatCode="${esc(format)}"`}>${values.map(([idx,value])=>pt(idx,value)).join('')}</cx:lvl>`}</cx:${numeric?'numDim':'strDim'}>`;
const tx=value=>`<cx:tx><cx:txData><cx:v>${esc(value)}</cx:v></cx:txData></cx:tx>`;
const series=(id=17,{layout='waterfall',axisIds=[],extra='',title='Sales',attributes=''}={})=>`<cx:series layoutId="${layout}" ${attributes}>${tx(title)}<cx:dataId val="${id}"/>${extra}${axisIds.map(value=>`<cx:axisId>${value}</cx:axisId>`).join('')}</cx:series>`;
const axis=(id=1,title='Name',kind='cat')=>`<cx:axis id="${id}"><cx:${kind}Scaling/><cx:title>${tx(title)}</cx:title></cx:axis>`;
function chart({dimensions=dim()+dim('val',[[1,'200'],[0,'100']],{numeric:true}),data,seriesXml=series(),axes='',extra='',title='Revenue'}={}){
 return `<cx:chartSpace xmlns:cx="${CX}" xmlns:a="${A}"><cx:chartData>${data??`<cx:data id="17">${dimensions}</cx:data>`}</cx:chartData><cx:chart><cx:title>${tx(title)}</cx:title><cx:plotArea><cx:plotAreaRegion>${seriesXml}</cx:plotAreaRegion>${axes}</cx:plotArea></cx:chart>${extra}</cx:chartSpace>`;
}
function source(extension,xml=chart(),{chartsheet=false,extra=[],frameXml,ownerExtra='',relationType=CR,targetMode='',contentType=TYPE,orphan=false}={}){
 const family={'.docx':'word','.pptx':'ppt','.xlsx':'xl'}[extension],part=`${family}/charts/chartEx1.xml`;
 const ns=`xmlns:cx="${CX}" xmlns:a="${A}" xmlns:r="${R}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:u="urn:unknown"`;
 const graphic=`<a:graphic><a:graphicData uri="${CX}"><cx:chart r:id="cx1"/></a:graphicData></a:graphic>`;
 const frame=frameXml??(orphan?'':extension==='.docx'?`<w:p><w:r><w:drawing><wp:inline>${graphic}</wp:inline></w:drawing></w:r></w:p>`:`<${extension==='.pptx'?'p':'xdr'}:graphicFrame>${graphic}</${extension==='.pptx'?'p':'xdr'}:graphicFrame>`);
 const rel=(target)=>`<Relationship Id="cx1" Type="${relationType}" Target="${target}"${targetMode?` TargetMode="${targetMode}"`:''}/>`;
 const overrides=[{part,contentType}],entries=[];
 if(extension==='.pptx')entries.push(['ppt/presentation.xml',`<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s1"/></p:sldIdLst></p:presentation>`],['ppt/_rels/presentation.xml.rels',`<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`],['ppt/slides/slide1.xml',`<p:sld xmlns:p="${P}" ${ns}><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>FHIR_SOURCE</a:t></a:r></a:p></p:txBody></p:sp>${frame}${ownerExtra}</p:spTree></p:cSld></p:sld>`],['ppt/slides/_rels/slide1.xml.rels',`<Relationships xmlns="${PR}">${rel('../charts/chartEx1.xml')}</Relationships>`]);
 if(extension==='.docx')entries.push(['word/document.xml',`<w:document xmlns:w="${W}" xmlns:wp="${WP}" ${ns}><w:body><w:p><w:r><w:t>FHIR_SOURCE</w:t></w:r></w:p>${frame}${ownerExtra}</w:body></w:document>`],['word/_rels/document.xml.rels',`<Relationships xmlns="${PR}">${rel('charts/chartEx1.xml')}</Relationships>`]);
 if(extension==='.xlsx'){
  const kind=chartsheet?'chartsheet':'worksheet',sheet=`xl/${chartsheet?'chartsheets':'worksheets'}/sheet1.xml`;
  overrides.push({part:sheet,contentType:`application/vnd.openxmlformats-officedocument.spreadsheetml.${kind}+xml`},{part:'xl/drawings/drawing1.xml',contentType:'application/vnd.openxmlformats-officedocument.drawing+xml'});
  entries.push(['xl/workbook.xml',`<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="FHIR_SOURCE" sheetId="1" r:id="s1"/></sheets></workbook>`],['xl/_rels/workbook.xml.rels',`<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/${kind}" Target="${sheet.slice(3)}"/></Relationships>`],
   [sheet,`<${kind} xmlns="${S}" xmlns:r="${R}">${chartsheet?'':'<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>FHIR_CELL</t></is></c></row></sheetData>'}<drawing r:id="d1"/></${kind}>`],[sheet.replace(/\/([^/]+)$/u,'/_rels/$1.rels'),`<Relationships xmlns="${PR}"><Relationship Id="d1" Type="${R}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`],['xl/drawings/drawing1.xml',`<xdr:wsDr xmlns:xdr="${X}" ${ns}><xdr:absoluteAnchor>${frame}${ownerExtra}</xdr:absoluteAnchor></xdr:wsDr>`],['xl/drawings/_rels/drawing1.xml.rels',`<Relationships xmlns="${PR}">${rel('../charts/chartEx1.xml')}</Relationships>`]);
 }
 return zipStore([...new Map([...opcControlEntries(extension.slice(1),{additionalOverrides:overrides}),...entries,[part,xml],...extra])]);
}
module.exports={CX,CR,TYPE,A,R,PR,P,W,WP,S,X,esc,pt,dim,tx,series,axis,chart,source};
