'use strict';
const { createSuite } = require('./helpers');
const { readXlsxSheetContext, LIMITS, MIME } = require('../plugins/data-secure/server/xlsx-content-context');
const { anonymize, scanResidual } = require('../plugins/data-secure/server/privacy/engine');
const { canonicalizeRenderedText } = require('../plugins/data-secure/server/privacy/base');
const { replayTransformTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const { initialEntities, applyEntityDecisions } = require('../plugins/data-secure/server/gateway/standalone-entity-review');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } = require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { test, testAsync, assert, done } = createSuite('Source-bound XLSX comments, table and pivot context');
const X='http://schemas.openxmlformats.org/spreadsheetml/2006/main',S='http://purl.oclc.org/ooxml/spreadsheetml/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',RS='http://purl.oclc.org/ooxml/officeDocument/relationships';
const P='http://schemas.openxmlformats.org/package/2006/relationships',C='http://schemas.openxmlformats.org/package/2006/content-types';
const RD='http://schemas.microsoft.com/office/spreadsheetml/2017/richdata',RR='http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel';
const MS='http://schemas.microsoft.com/office/2017/06/relationships/',MR='http://schemas.microsoft.com/office/2022/10/relationships/richValueRel';
const sheetPart='xl/worksheets/sheet1.xml', wb='xl/workbook.xml', cp='xl/comments1.xml',tp='xl/tables/table1.xml',pp='xl/pivotTables/pivotTable1.xml',pc='xl/pivotCache/pivotCacheDefinition1.xml';
const mp='xl/metadata.xml',dp='xl/richData/rdrichvalue.xml',sp='xl/richData/rdrichvaluestructure.xml',rp='xl/richData/richValueRel.xml';
const esc=s=>String(s).replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/"/gu,'&quot;');
const rel=(id,kind,target,mode='',namespace=R)=>`<Relationship Id="${id}" Type="${kind.includes('://')?kind:namespace+'/'+kind}" Target="${esc(target)}"${mode?' TargetMode="'+mode+'"':''}/>`;
const rels=s=>`<Relationships xmlns="${P}">${s}</Relationships>`;
const xml=(name,body='',attrs='',ns=X)=>`<${name} xmlns="${ns}" xmlns:r="${ns===S?RS:R}"${attrs?' '+attrs:''}>${body}</${name}>`;
const o=(part,type)=>`<Override PartName="/${part}" ContentType="${type}"/>`;
function base({body='',sheetRels='',extra=[],types='',wbBody='',wbRels='',ns=X}={}) {
  return new Map([
    ['[Content_Types].xml',`<Types xmlns="${C}"><Default Extension="png" ContentType="image/png"/>${o(wb,MIME.workbook)+o(sheetPart,MIME.worksheet)+types}</Types>`],
    [wb,xml('workbook',`<sheets><sheet name="Quelle" sheetId="1" r:id="s"/></sheets>${wbBody}`,'',ns)],
    ['xl/_rels/workbook.xml.rels',rels(rel('s','worksheet','worksheets/sheet1.xml','',ns===S?RS:R)+wbRels)],
    [sheetPart,xml('worksheet',body,'',ns)],['xl/worksheets/_rels/sheet1.xml.rels',rels(sheetRels)],...extra
  ]);
}
const read=m=>readXlsxSheetContext(m,{sheetPart});
const mutate=(m,part,fn)=>{m.set(part,fn(m.get(part)));return m;};
const bad=m=>assert.throws(()=>read(m),e=>e.code==='XLSX_STRUCTURE_UNSAFE');
function comments(body='<comment ref="C7" authorId="1"><text><r><rPr><b/></rPr><t>Name: Qvx</t></r><r><t> / Qvy 😀</t></r></text></comment>',authors='<author>Unused secret</author><author>Anna Berger</author>',ns=X) {
  return base({ns,sheetRels:rel('c','comments','../comments1.xml','',ns===S?RS:R),types:o(cp,MIME.comments),extra:[[cp,xml('comments',`<authors>${authors}</authors><commentList>${body}</commentList>`,'',ns)]]});
}
function table({reference='C5:D9',cols='<tableColumn id="8" name="Name"/><tableColumn id="3" name="Preis" totalsRowFunction="sum"/>',attrs='headerRowCount="1" totalsRowCount="1"',extra=''}={}) {
  return base({body:'<tableParts count="1"><tablePart r:id="t"/></tableParts>',sheetRels:rel('t','table','../tables/table1.xml'),types:o(tp,MIME.table),extra:[[tp,xml('table',`<tableColumns count="2">${cols}</tableColumns>${extra}`,`id="1" name="Tabelle" displayName="Tabelle" ref="${reference}" ${attrs}`)]]});
}
function pivot({cacheId='7',axes='<rowFields count="1"><field x="0"/></rowFields><colFields count="1"><field x="-2"/></colFields><pageFields count="1"><pageField fld="1"/></pageFields><dataFields count="1"><dataField fld="2" name="Summe Preis" subtotal="sum"/></dataFields>',cacheSource='<cacheSource type="worksheet"><worksheetSource ref="A1:C10" sheet="Quelle"/></cacheSource>',cacheExtra='',pExtra=''}={}) {
  return base({sheetRels:rel('p','pivotTable','../pivotTables/pivotTable1.xml'),wbBody:'<pivotCaches><pivotCache cacheId="7" r:id="c"/></pivotCaches>',wbRels:rel('c','pivotCacheDefinition','pivotCache/pivotCacheDefinition1.xml'),types:o(pp,MIME.pivotTable)+o(pc,MIME.pivotCacheDefinition),extra:[
    [pp,xml('pivotTableDefinition',`<location ref="E5:G10" firstHeaderRow="0" firstDataRow="1" firstDataCol="1"/><pivotFields count="3"><pivotField axis="axisRow"/><pivotField axis="axisPage"/><pivotField dataField="1"/></pivotFields>${axes}${pExtra}`,`name="Gespeicherte Sicht" cacheId="${cacheId}"`)],
    ['xl/pivotTables/_rels/pivotTable1.xml.rels',rels(rel('c','pivotCacheDefinition','../pivotCache/pivotCacheDefinition1.xml'))],
    [pc,xml('pivotCacheDefinition',`${cacheSource}<cacheFields count="3"><cacheField name="Name"><sharedItems><s v="HIDDEN OLD CACHE PERSON"/></sharedItems></cacheField><cacheField name="Status"/><cacheField name="Preis"/></cacheFields>${cacheExtra}`)],
    ['xl/pivotCache/pivotCacheRecords1.xml',xml('pivotCacheRecords','<r><s v="STALE PRIVATE CACHE"/></r>','count="1"')]
  ]});
}
function rich({cells='<row r="2"><c r="C2" t="e" vm="1"><v>#VALUE!</v></c><c r="D2" t="e" vm="2"><v>#VALUE!</v></c></row>',type='XLRICHVALUE',keys='<k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/><k n="Text" t="s"/>',values='<rv s="0"><v>0</v><v>5</v><v>Name: Qvx / Qvy 😀</v></rv><rv s="0"><v>1</v><v>6</v><v>Second image</v></rv>',metadataExtra=''}={}) {
  return base({body:`<sheetData>${cells}</sheetData>`,types:o(mp,MIME.sheetMetadata)+o(dp,MIME.richData)+o(sp,MIME.richStructure)+o(rp,MIME.richRels),wbRels:rel('m','sheetMetadata','metadata.xml')+rel('d',MS+'rdRichValue','richData/rdrichvalue.xml')+rel('s1',MS+'rdRichValueStructure','richData/rdrichvaluestructure.xml')+rel('r',MR,'richData/richValueRel.xml'),extra:[
    [mp,xml('metadata',`<metadataTypes count="1"><metadataType name="${type}"/></metadataTypes><futureMetadata name="XLRICHVALUE" count="2"><bk><extLst><ext uri="{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}"><r:rvb xmlns:r="${RD}" i="0"/></ext></extLst></bk><bk><extLst><ext uri="{3E2802C4-A4D2-4D8B-9148-E3BE6C30E623}"><r:rvb xmlns:r="${RD}" i="1"/></ext></extLst></bk></futureMetadata><valueMetadata count="2"><bk><rc t="1" v="0"/></bk><bk><rc t="1" v="1"/></bk></valueMetadata>${metadataExtra}`)],
    [dp,xml('rvData',values,'count="2"',RD)],[sp,xml('rvStructures',`<s t="_localImage">${keys}</s>`,'count="1"',RD)],
    [rp,xml('richValueRels','<rel r:id="i2"/><rel r:id="i1"/>','',RR)],
    ['xl/richData/_rels/richValueRel.xml.rels',rels(rel('i1','image','../media/second.png')+rel('i2','image','../media/first.png'))],
    ['xl/media/first.png',Buffer.from('FIRST DISTINCT SYNTHETIC IMAGE')],['xl/media/second.png',Buffer.from('SECOND DISTINCT SYNTHETIC IMAGE')]
  ]});
}

test('empty ordinary sheet has no invented context, and output is deeply immutable',()=>{
  const r=read(base());assert.deepEqual(r.comments,[]);assert.deepEqual(r.tables,[]);assert.deepEqual(r.pivots,[]);assert.deepEqual(r.richValues,[]);assert.deepEqual(r.notices,[]);assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.comments));
});
for(const ns of [X,S])test('classic comments retain actual blank-cell ref, authorId, author, rich text order and Unicode '+ns,()=>{
  const r=read(comments(undefined,undefined,ns));assert.deepEqual(r.comments,[{part:cp,cell:'C7',authorId:1,author:'Anna Berger',text:'Name: Qvx / Qvy 😀'}]);assert.ok(!JSON.stringify(r).includes('Unused secret'));
});
test('classic and threaded roles remain separate; unrelated orphan comments are not swept',()=>{
  const m=comments();m.set('xl/comments99.xml',xml('comments','<authors><author>ORPHAN PRIVATE</author></authors>'));mutate(m,'xl/worksheets/_rels/sheet1.xml.rels',s=>s.replace('</Relationships>',rel('tc','http://schemas.microsoft.com/office/2017/10/relationships/threadedComment','../threadedComments/t.xml')+'</Relationships>'));
  const r=read(m);assert.equal(r.comments.length,1);assert.ok(!JSON.stringify(r).includes('ORPHAN PRIVATE'));assert.ok(!r.consumedParts.includes('xl/comments99.xml'));
});
test('ST_Xstring is decoded once only after rich-run assembly; literal escape and German characters survive',()=>{
  const r=read(comments('<comment ref="A1" authorId="0"><text><r><t>Name: Anna_x0</t></r><r><t>00D_Berger _x005F_x0041_ ÄÖÜäöüß</t></r></text></comment>','<author>Autor_x000A_Zeile</author>'));
  assert.equal(r.comments[0].text,'Name: Anna\rBerger _x0041_ ÄÖÜäöüß');assert.equal(r.comments[0].author,'Autor\nZeile');
});
for(const [label,change] of [
  ['wrong author',m=>mutate(m,cp,s=>s.replace('authorId="1"','authorId="2"'))],
  ['duplicate cell',m=>mutate(m,cp,s=>s.replace('</commentList>','<comment ref="C7" authorId="0"><text><t>x</t></text></comment></commentList>'))],
  ['invalid A1',m=>mutate(m,cp,s=>s.replace('C7','XFE1'))],
  ['range not cell',m=>mutate(m,cp,s=>s.replace('C7','C7:D8'))],
  ['control escape',m=>mutate(m,cp,s=>s.replace('Name: Qvx','_x0000_'))],
  ['unpaired UTF16',m=>mutate(m,cp,s=>s.replace('Name: Qvx','_xD800_'))],
  ['wrong root namespace',m=>mutate(m,cp,s=>s.replaceAll(X,'urn:foreign'))],
  ['wrong MIME',m=>mutate(m,'[Content_Types].xml',s=>s.replace(MIME.comments,'application/xml'))],
  ['external edge',m=>mutate(m,'xl/worksheets/_rels/sheet1.xml.rels',s=>s.replace('Target="../comments1.xml"','Target="https://invalid/secret" TargetMode="External"'))],
  ['duplicate rel id',m=>mutate(m,'xl/worksheets/_rels/sheet1.xml.rels',s=>s.replace('</Relationships>',rel('c','comments','../comments1.xml')+'</Relationships>'))],
  ['foreign bare relation type',m=>mutate(m,'xl/worksheets/_rels/sheet1.xml.rels',s=>s.replace(R+'/comments','comments'))],
  ['encoded traversal',m=>mutate(m,'xl/worksheets/_rels/sheet1.xml.rels',s=>s.replace('../comments1.xml','%2e%2e/comments1.xml'))],
  ['DTD',m=>mutate(m,cp,s=>'<!DOCTYPE comments [<!ENTITY e "SECRET">]>'+s)],
  ['invalid XML UTF8',m=>{m.set(cp,Buffer.from([0xc3,0x28]));return m;}]
])test('invalid reached comment/OPC binding is hard: '+label,()=>{
  const m=change(comments());if(label==='foreign bare relation type'){assert.deepEqual(read(m).comments,[]);return;}bad(m);
});
test('foreign text leaf is not source text and produces a fixed gap code',()=>{
  const r=read(comments('<comment ref="A1" authorId="0"><text><t xmlns="urn:foreign">HIDDEN</t><t>REAL</t></text></comment>','<author>A</author>'));
  assert.equal(r.comments[0].text,'REAL');assert.ok(r.notices.some(n=>n.code==='XLSX_COMMENT_TEXT_UNMODELED'));assert.ok(!JSON.stringify(r.notices).includes('HIDDEN'));
});
test('a classic comment part cannot be resurrected under a second actual worksheet owner',()=>{
  const m=comments();mutate(m,wb,s=>s.replace('</sheets>','<sheet name="Second" sheetId="2" r:id="s2"/></sheets>'));mutate(m,'xl/_rels/workbook.xml.rels',s=>s.replace('</Relationships>',rel('s2','worksheet','worksheets/sheet2.xml')+'</Relationships>'));mutate(m,'[Content_Types].xml',s=>s.replace('</Types>',o('xl/worksheets/sheet2.xml',MIME.worksheet)+'</Types>'));m.set('xl/worksheets/sheet2.xml',xml('worksheet'));m.set('xl/worksheets/_rels/sheet2.xml.rels',rels(rel('c2','comments','../comments1.xml')));bad(m);
});
test('real TablePart ids bind columns to actual non-A1 coordinates and totals without copying worksheet values',()=>{
  const r=read(table());assert.equal(r.tables[0].reference,'C5:D9');assert.deepEqual(r.tables[0].columns.map(c=>[c.id,c.column,c.name]),[[8,3,'Name'],[3,4,'Preis']]);assert.equal(r.tables[0].totalsRowCount,1);assert.equal(r.tables[0].columns[1].totalsRowFunction,'sum');
});
test('table formula text is stored source, never evaluated or followed; empty header/totals roles stay explicit',()=>{
  const r=read(table({attrs:'headerRowCount="0" totalsRowCount="0"',cols:'<tableColumn id="1" name="A"><calculatedColumnFormula>WEBSERVICE("https://invalid")</calculatedColumnFormula></tableColumn><tableColumn id="2" name="B" totalsRowLabel="Name: Qvx"><totalsRowFormula>SUM(D6:D8)</totalsRowFormula></tableColumn>'}));assert.equal(r.tables[0].columns[0].calculatedColumnFormula,'WEBSERVICE("https://invalid")');assert.equal(r.tables[0].columns[1].totalsRowLabel,'Name: Qvx');assert.equal(r.tables[0].headerRowCount,0);
});
test('filter criteria are not replayed as hidden source rows, and sort/extensions are truthfully partial',()=>{
  const r=read(table({extra:'<autoFilter ref="C5:D8"><filterColumn colId="0"><filters><filter val="SECRET FILTERED VALUE"/></filters></filterColumn></autoFilter><sortState ref="C5:D8"/>'}));assert.deepEqual(r.tables[0].filters,[{column:3,kinds:['filters']}]);assert.ok(!JSON.stringify(r).includes('SECRET FILTERED VALUE'));assert.ok(r.notices.some(n=>n.code==='XLSX_TABLE_FILTER_CRITERIA_NOT_EVALUATED'));
});
for(const [label,change] of [
  ['wrong column count',m=>mutate(m,tp,s=>s.replace('count="2"','count="3"'))],
  ['wrong width',m=>mutate(m,tp,s=>s.replace('C5:D9','C5:E9'))],
  ['duplicate column id',m=>mutate(m,tp,s=>s.replace('id="3"','id="8"'))],
  ['wrong real r:id',m=>mutate(m,sheetPart,s=>s.replace('r:id="t"','r:id="missing"'))],
  ['foreign owner slot',m=>mutate(m,sheetPart,s=>s.replace('<tableParts','<tableParts xmlns="urn:foreign"'))],
  ['filter outside table',m=>mutate(m,tp,s=>s.replace('</table>','<autoFilter ref="A1:A9"/></table>'))]
])test('table bounds/owner/count safeguards: '+label,()=>{
  const m=change(table());if(label==='foreign owner slot'){const r=read(m);assert.deepEqual(r.tables,[]);assert.ok(r.notices.some(n=>n.code==='XLSX_UNSELECTED_TABLE_PART'));return;}bad(m);
});
test('pivot uses sheet→definition + matching workbook cacheId→cache and emits used field/axes only',()=>{
  const r=read(pivot()),p=r.pivots[0];assert.equal(p.cacheId,7);assert.equal(p.reference,'E5:G10');assert.deepEqual(p.axes.rows,[0]);assert.deepEqual(p.axes.columns,['data-axis']);assert.deepEqual(p.axes.pages,[1]);assert.deepEqual(p.fields.map(f=>[f.index,f.name]),[[0,'Name'],[1,'Status'],[2,'Preis']]);assert.equal(p.axes.data[0].name,'Summe Preis');assert.ok(!JSON.stringify(r).includes('HIDDEN OLD CACHE PERSON'));assert.ok(!JSON.stringify(r).includes('STALE PRIVATE CACHE'));assert.ok(!r.consumedParts.includes('xl/pivotCache/pivotCacheRecords1.xml'));
});
test('unused cache fields and their shared items are not new source occurrences',()=>{
  const r=read(pivot({axes:'<rowFields count="1"><field x="2"/></rowFields>'}));assert.deepEqual(r.pivots[0].fields.map(f=>f.name),['Preis']);assert.ok(!JSON.stringify(r).includes('Status'));assert.ok(!JSON.stringify(r).includes('HIDDEN OLD'));
});
test('external/OLAP pivot source is not fetched or guessed, but saved display context survives',()=>{
  const r=read(pivot({cacheSource:'<cacheSource type="external" connectionId="4"/>'}));assert.equal(r.pivots[0].source.type,'unresolved');assert.ok(r.notices.some(n=>n.code==='XLSX_PIVOT_SOURCE_NOT_RESOLVED'));assert.equal(r.pivots[0].fields.length,3);
});
test('no selected pivot means no cache-value traversal or newly invented cache context',()=>{
  const m=base({wbBody:'<pivotCaches><pivotCache cacheId="9" r:id="old"/></pivotCaches>',wbRels:rel('old','pivotCacheDefinition','pivotCache/unselected.xml')});
  const r=read(m);assert.deepEqual(r.pivots,[]);assert.ok(!r.consumedParts.includes('xl/pivotCache/unselected.xml'));
});
for(const [label,change] of [
  ['cache id mismatch',m=>mutate(m,pp,s=>s.replace('cacheId="7"','cacheId="8"'))],
  ['cache target mismatch',m=>mutate(m,'xl/pivotTables/_rels/pivotTable1.xml.rels',s=>s.replace('pivotCacheDefinition1.xml','missing.xml'))],
  ['axis index overrun',m=>mutate(m,pp,s=>s.replace('x="0"','x="3"'))],
  ['invalid negative axis',m=>mutate(m,pp,s=>s.replace('x="0"','x="-1"'))],
  ['location offset out of range',m=>mutate(m,pp,s=>s.replace('firstDataRow="1"','firstDataRow="99"'))],
  ['cacheField count mismatch',m=>mutate(m,pc,s=>s.replace('count="3"','count="2"'))]
])test('pivot source/axis safety remains hard: '+label,()=>bad(change(pivot())));
test('two in-cell images follow vm→metadata type→future rvb→rv structure→richValueRel→exact image r:id, not zip order',()=>{
  const r=read(rich());assert.deepEqual(r.richValues.map(x=>[x.cell,x.metadataIndex,x.richValueIndex,x.mediaPart]),[['C2',1,0,'xl/media/first.png'],['D2',2,1,'xl/media/second.png']]);assert.equal(r.richValues[0].altText,'Name: Qvx / Qvy 😀');assert.equal(r.richValues[1].decorative,true);assert.deepEqual(r.notices,[]);
});
test('vm zero never guesses the first image; vm one and two preserve their independent exact mappings',()=>{
  const r=read(rich({cells:'<row r="1"><c r="A1" vm="0"/><c r="B1" vm="1"/><c r="C1" vm="2"/></row>'}));assert.equal(r.richValues[0].status,'unresolved');assert.equal(r.richValues[1].mediaPart,'xl/media/first.png');assert.equal(r.richValues[2].mediaPart,'xl/media/second.png');assert.ok(r.notices.some(n=>n.cell==='A1'&&n.code==='XLSX_RICH_VALUE_BINDING_UNRESOLVED'));
});
test('metadata type index is not fixed1: preceding dynamic-array cellMetadata cannot shift images',()=>{
  const m=rich();mutate(m,mp,s=>s.replace('<metadataTypes count="1">','<metadataTypes count="2"><metadataType name="XLDAPR" cellMeta="1"/>').replaceAll('<rc t="1"','<rc t="2"').replace('</metadata>','<cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata></metadata>'));assert.equal(read(m).richValues[1].mediaPart,'xl/media/second.png');
});
test('registered RichValue MIME case equivalents from actual writer remain closed, never general application/xml',()=>{
  const m=rich();mutate(m,'[Content_Types].xml',s=>s.replace(MIME.richData,MIME.richData.toLowerCase()).replace(MIME.richStructure,MIME.richStructure.toLowerCase()));assert.equal(read(m).richValues[0].mediaPart,'xl/media/first.png');bad(mutate(m,'[Content_Types].xml',s=>s.replace(MIME.richData.toLowerCase(),'application/xml')));
});
test('leading-slash ZIP entry aliases are not a fallback for missing canonical image relationships',()=>{
  const m=rich(),p='xl/richData/_rels/richValueRel.xml.rels';m.set('/'+p,m.get(p));m.delete(p);bad(m);
});
test('unknown RichValues, formulas/provider behavior or missing chain give neutral per-cell gaps, not hidden payload dumps',()=>{
  for(const m of [rich({type:'XLDAPR'}),mutate(rich(),sp,s=>s.replace('_localImage','_providerType')),mutate(rich(),sheetPart,s=>s.replace('<v>#VALUE!</v>','<f>IMAGE("https://invalid")</f><v>#VALUE!</v>'))]) {
    const r=read(m);assert.equal(r.richValues[0].status,'unresolved');assert.ok(!JSON.stringify(r).includes('https://'));assert.ok(!JSON.stringify(r).includes('Qvx'));
  }
  const m=rich();m.delete(dp);bad(m); // A reached dangling OPC edge is not a benign unsupported type.
  const absent=rich();mutate(absent,'xl/_rels/workbook.xml.rels',s=>s.replace(/<Relationship Id="d"[^>]*\/>/u,''));assert.equal(read(absent).richValues[0].status,'unresolved');
});
for(const [label,change] of [
  ['vm index out of bounds',m=>mutate(m,sheetPart,s=>s.replace('vm="1"','vm="3"'))],
  ['wrong future index',m=>mutate(m,mp,s=>s.replace('v="0"','v="2"'))],
  ['wrong rvb index',m=>mutate(m,mp,s=>s.replace('i="0"','i="2"'))],
  ['wrong structure index',m=>mutate(m,dp,s=>s.replace('s="0"','s="1"'))],
  ['duplicate structure keys',m=>mutate(m,sp,s=>s.replace('n="Text"','n="CalcOrigin"'))],
  ['duplicate metadata type names',m=>mutate(m,mp,s=>s.replace('<metadataTypes count="1">','<metadataTypes count="2"><metadataType name="XLRICHVALUE"/>'))],
  ['wrong image rel type',m=>mutate(m,'xl/richData/_rels/richValueRel.xml.rels',s=>s.replaceAll('/image','/hyperlink'))],
  ['external image',m=>mutate(m,'xl/richData/_rels/richValueRel.xml.rels',s=>s.replace('Target="../media/first.png"','Target="https://invalid/x.png" TargetMode="External"'))],
  ['wrong image MIME',m=>mutate(m,'[Content_Types].xml',s=>s.replace('image/png','application/xml'))],
  ['rich data count mismatch',m=>mutate(m,dp,s=>s.replace('count="2"','count="3"'))],
  ['foreign rich root namespace',m=>mutate(m,dp,s=>s.replace(RD,'urn:foreign'))],
  ['alt control escape',m=>mutate(m,dp,s=>s.replace('Name: Qvx','_x0001_'))]
])test('rich-value exact chain remains hard: '+label,()=>bad(change(rich())));
test('row/column inferred coordinates are bound to real source order; far-right and maximum row remain sparse',()=>{
  const r=read(rich({cells:'<row r="1048576"><c r="XFC1048576" vm="1"/><c vm="2"/></row>'}));assert.deepEqual(r.richValues.map(c=>c.cell),['XFC1048576','XFD1048576']);
  bad(rich({cells:'<row r="2"><c r="A1" vm="1"/></row>'}));bad(rich({cells:'<row r="1"><c r="XFD1"/><c vm="1"/></row>'}));
});
test('per-part XML budget, record and malformed controls retain typed handling',()=>{
  const m=comments();m.set(cp,' '.repeat(LIMITS.xmlChars+1));assert.throws(()=>read(m),e=>e.code==='XLSX_STRUCTURE_LIMIT');bad(mutate(comments(),cp,s=>s.replace('<comment ','<comment xml:space="bad" bad="&unknown;" ')));
});
for(const profile of ['general','personnel_profile'])test('real helper author/comment/alt payload remains visible to ordinary privacy, trace and independent Keep check '+profile,()=>{
  const a=read(comments()).comments[0],b=read(rich()).richValues[0];
  // These are test projections of authentic metadata fields, not new helper
  // authority. Main integration must retain the same real source ownership.
  const source=canonicalizeRenderedText(`😀\n\n| Autor |\n| --- |\n| ${a.author} |\n\n| Inhalt | Fachtext |\n| --- | --- |\n| ${a.text} | HTTP/2 |\n\nQuellzelle ${b.cell}\n\n| Inhalt |\n| --- |\n| ${b.altText} |`,'content-person-fields/1');
  const options={productChannel:'standalone',contentOptions:{schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false},captureTransformPlan:true};
  const out=anonymize(source,profile,options);assert.doesNotMatch(out.text,/Qvx|Qvy|Anna|Berger/u);assert.ok(out.text.includes('HTTP/2'));assert.equal(replayTransformTrace(out.transform_trace),out.text);assert.deepEqual(scanResidual(out.text,profile,out.dictionary,options),[]);assert.ok(scanResidual(source,profile,[],options).length);
  const entities=initialEntities({transform_trace:out.transform_trace,markdown:out.text}),mask=entities.find(x=>x.kind==='SENSITIVE_FIELD')||entities[0];assert.ok(mask);const kept=applyEntityDecisions(out.text,entities,[{entity_id:mask.entity_id,decision:'keep'}],Buffer.alloc(32,7));assert.ok(scanResidual(kept.markdown,profile,[],options).length);
});
(async()=>{
  for(const profile of ['general','personnel_profile'])await testAsync('actual prepare/finalize/transform replay on source-bound comment payload '+profile,async()=>{
    const a=read(comments()).comments[0],source=canonicalizeRenderedText(`| Inhalt | Fachtext |\n| --- | --- |\n| ${a.text} | HTTP/2 |`,'content-person-fields/1'),options={productChannel:'standalone',contentOptions:{schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false}};
    const prepared=prepareTextPrivacyReview({text:source,profile,productChannel:'standalone',consumerOptions:options,captureTrace:true});const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'});const final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});assert.doesNotMatch(final.markdown,/Qvx|Qvy/u);assert.ok(final.markdown.includes('HTTP/2'));assert.equal(replayTransformTrace(final.transform_trace),final.markdown);assert.deepEqual(scanResidual(final.markdown,profile,final.dictionary,options),[]);
  });done();
})().catch(error=>{console.error(error);process.exitCode=1;});
