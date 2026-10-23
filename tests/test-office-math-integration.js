'use strict';

// Real synthetic OPC -> normal content Markdown, with the same privacy entry
// used for documents. No Office installation, source-user files or GUI claim.
const { createSuite } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { parseOoxml } = require('../plugins/data-secure/server/ooxml');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const { test, testAsync, assert, done } = createSuite('OfficeMath actual paragraph/table integration');
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const M='http://schemas.openxmlformats.org/officeDocument/2006/math';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
const P='http://schemas.openxmlformats.org/presentationml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MC='http://schemas.openxmlformats.org/markup-compatibility/2006';
const r=value=>`<m:r><m:t>${value}</m:t></m:r>`;
const math=value=>`<m:oMath xmlns:m="${M}">${value}</m:oMath>`;
const fraction=math(`<m:f><m:num>${r('Name: Anna Berger')}</m:num><m:den>${r('2')}</m:den></m:f>`);
const wtext=value=>`<w:r><w:t>${value}</w:t></w:r>`;
const opts={preserveText:true,contentMode:true,literalMarkup:true};
function doc(body, prefix='w', namespace=W){
  return zipStore([...opcControlEntries('docx'),['word/document.xml',
    `<w:document xmlns:w="${namespace}" xmlns:mc="${MC}" xmlns:m="${M}"><w:body>${body}</w:body></w:document>`.replaceAll('w:',`${prefix}:`).replaceAll('xmlns:w=',`xmlns:${prefix}=`)]]);
}
function ppt(body){
  const slide='ppt/slides/slide1.xml';
  return zipStore([...opcControlEntries('pptx',{additionalOverrides:[{part:slide,contentType:'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'}]}),
    ['ppt/presentation.xml',`<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="s" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`],
    [slide,`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" xmlns:mc="${MC}"><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`]]);
}
const shape=body=>`<p:sp><p:txBody><a:p>${body}</a:p></p:txBody></p:sp>`;
const atext=value=>`<a:r><a:t>${value}</a:t></a:r>`;
function extract(bytes,type){return extractMarkdownBuffer(bytes,`.${type}`,{markdownOutput:'content-v1',partialExtraction:true});}
function once(text,needle){assert.equal(text.split(needle).length-1,1,needle);}
test('Word formula keeps actual inline order and each source name once',()=>{
  const bytes=doc(`<w:p>${wtext('BEFORE ')}${fraction}${wtext(' AFTER')}</w:p>`), before=Buffer.from(bytes);
  const out=extract(bytes,'docx');
  assert.match(out.markdown,/BEFORE[\s\S]*Bruch[\s\S]*Anna Berger[\s\S]*Nenner[\s\S]*2[\s\S]*AFTER/u);
  once(out.markdown,'Anna Berger'); assert.deepEqual(bytes,before);
  assert.doesNotMatch(out.markdown,/```|\$\$|\\text\{/u);
});
test('Word prefix aliases and strict namespaces retain the same formula role',()=>{
  for(const [prefix,namespace] of [['x',W],['w','http://purl.oclc.org/ooxml/wordprocessingml/main']]){
    const out=extract(doc(`<w:p>${fraction}</w:p>`,prefix,namespace),'docx');once(out.markdown,'Anna Berger');assert.match(out.markdown,/Zähler/u);
  }
});
test('Word table formula remains in its actual cell rather than appended prose',()=>{
  const out=extract(doc(`<w:tbl><w:tr><w:tc><w:p>${wtext('Name')}</w:p></w:tc><w:tc><w:p>${fraction}</w:p></w:tc></w:tr></w:tbl>`),'docx');
  assert.match(out.markdown,/Zeile 1 · Spalte 2 · Formel/u);once(out.markdown,'Anna Berger');
});
test('Word selected MC formula does not duplicate fallback or unselected data',()=>{
  const body=`<w:p><mc:AlternateContent><mc:Choice Requires="m">${fraction}</mc:Choice><mc:Fallback>${wtext('FALLBACK')}</mc:Fallback></mc:AlternateContent></w:p>`;
  const bytes=doc(body),out=extract(bytes,'docx');once(out.markdown,'Anna Berger');assert.doesNotMatch(out.markdown,/FALLBACK/u);
  const legacy=parseOoxml(bytes,'.docx');assert.match(legacy.markdown,/FALLBACK/u);assert.doesNotMatch(legacy.markdown,/Anna Berger/u);
});
test('Word standalone math text and false namespace spelling gain no authority',()=>{
  const skipped=parseOoxml(doc('<w:p><m:t>SECRET</m:t></w:p>'),'.docx',undefined,opts);
  assert.doesNotMatch(skipped.markdown,/SECRET/u);assert.ok(skipped.warnings.length);
  const falseMath=math(r('SECRET')).replaceAll(M,'urn:not-math');
  assert.throws(()=>parseOoxml(doc(`<w:p>${falseMath}</w:p>`),'.docx',undefined,opts));
});
test('Word formula in paragraph properties is not a content owner',()=>{
  assert.throws(()=>parseOoxml(doc(`<w:p><w:pPr>${fraction}</w:pPr>${wtext('CONTROL')}</w:p>`),'.docx',undefined,opts));
});
test('legacy notes reader does not acquire new formula execution/approval',()=>{
  const out=parseOoxml(doc(`<w:p>${fraction}${wtext('CONTROL')}</w:p>`),'.docx');
  assert.doesNotMatch(out.markdown,/Anna Berger/u);assert.ok(out.warnings.length);
});
test('PPTX a14 formula keeps surrounding actual shape paragraph',()=>{
  const out=extract(ppt(shape(atext('BEFORE ')+`<a14:m>${fraction}</a14:m>`+atext(' AFTER'))),'pptx');
  assert.match(out.markdown,/BEFORE[\s\S]*Bruch[\s\S]*Anna Berger[\s\S]*AFTER/u);once(out.markdown,'Anna Berger');
});
test('PPTX selected a14 choice emits formula without fallback duplicate',()=>{
  const body=`<mc:AlternateContent><mc:Choice Requires="a14"><a14:m>${fraction}</a14:m></mc:Choice><mc:Fallback>${atext('NO_FALLBACK')}</mc:Fallback></mc:AlternateContent>`;
  const out=extract(ppt(shape(body)),'pptx');once(out.markdown,'Anna Berger');assert.doesNotMatch(out.markdown,/NO.FALLBACK/u);
});
test('PPTX table formula is stored in the original cell',()=>{
  const out=extract(ppt(`<p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid><a:gridCol/></a:tblGrid><a:tr><a:tc><a:txBody><a:p><a14:m>${fraction}</a14:m></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`),'pptx');
  assert.match(out.markdown,/Zeile 1 · Spalte 1 · Formel/u);once(out.markdown,'Anna Berger');
});
test('PPTX detached math cannot steal an unrelated open paragraph',()=>{
  assert.throws(()=>parseOoxml(ppt(shape(atext('CONTROL')+`<p:extLst>${fraction}</p:extLst>`)),'.pptx',undefined,opts));
});
testAsync('real Office formula text reaches the normal privacy entry',async()=>{
  for(const [type,bytes] of [['docx',doc(`<w:p>${fraction}</w:p>`)],['pptx',ppt(shape(`<a14:m>${fraction}</a14:m>`))]]){
    const out=extract(bytes,type);
    const transformed=await anonymizeMarkdown(out.markdown,'general',{productChannel:'standalone',contentOptions:{schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false}});
    assert.doesNotMatch(transformed.text,/Anna Berger/u);
    assert.match(transformed.text,/Bruch/u);
  }
});
testAsync('generic formula cell keeps actual argument fields separate from factual sibling text',async()=>{
  const value=math(`<m:f><m:num>${r('Name: Anna Berger')}</m:num><m:den>${r('FHIR REST 123')}</m:den></m:f>`);
  const source=doc(`<w:tbl><w:tr><w:tc><w:p>${wtext('Inhalt')}</w:p></w:tc></w:tr><w:tr><w:tc><w:p>${value}</w:p></w:tc></w:tr></w:tbl>`);
  const extracted=extract(source,'docx'),transformed=anonymizeMarkdown(extracted.markdown,'general',{productChannel:'standalone',contentOptions:{schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false}});
  assert.doesNotMatch(transformed.text,/Anna Berger/u);assert.match(transformed.text,/FHIR REST 123/u);
});
testAsync('an actual sensitive Word header still owns a formula cell with an unknown raw name',async()=>{
  const source=doc(`<w:tbl><w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:p>${wtext('Name')}</w:p></w:tc></w:tr><w:tr><w:tc><w:p>${math(r('Qvx'))}</w:p></w:tc></w:tr></w:tbl>`);
  const extracted=extract(source,'docx'),transformed=anonymizeMarkdown(extracted.markdown,'general',{productChannel:'standalone',contentOptions:{schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false}});
  assert.doesNotMatch(transformed.text,/Qvx/u);
});
testAsync('an unmodelled safe formula wrapper cannot hide an actual Name field',async()=>{
  for(const table of [false,true]){
    const payload=math(`<m:future>${r('Name: Qvx / Qvy')}</m:future>`),p=`<w:p>${payload}</w:p>`;
    const body=table?`<w:tbl><w:tr><w:tc><w:p>${wtext('Inhalt')}</w:p></w:tc></w:tr><w:tr><w:tc>${p}</w:tc></w:tr></w:tbl>`:p;
    const extracted=extract(doc(body),'docx');assert.equal(extracted.coverage.status,'incomplete');
    const transformed=anonymizeMarkdown(extracted.markdown,'general',{productChannel:'standalone',contentOptions:{schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false}});
    assert.doesNotMatch(transformed.text,/Qvx|Qvy/u);
  }
});
test('Word vMerge continuation with a real formula remains readable and bound',()=>{
  const row=(property,value)=>`<w:tr><w:tc><w:tcPr><w:vMerge${property?' w:val="restart"':''}/></w:tcPr><w:p>${value}</w:p></w:tc></w:tr>`;
  const out=extract(doc(`<w:tbl><w:tblGrid><w:gridCol/></w:tblGrid>${row(true,wtext('ANCHOR'))}${row(false,math(r('FORMULA_X')))}</w:tbl>`),'docx');
  once(out.markdown,'ANCHOR');once(out.markdown,'FORMULA');assert.match(out.markdown,/verbunden mit Zeile 1/u);
});
test('PowerPoint math admits actual DrawingML run formatting without empty warning artifacts',()=>{
  const value=math(`<m:r><a:rPr lang="de-DE"/><m:t>FORMULA</m:t></m:r>`);
  const out=extract(ppt(shape(`<a14:m>${value}</a14:m>`)),'pptx');
  once(out.markdown,'FORMULA');assert.doesNotMatch(out.markdown,/Nicht unterstützter Formelinhalt/u);
});
test('PowerPoint a14 wrapper requires one direct math root, not nesting or oMathPara',()=>{
  for(const payload of [`<a14:m><a14:m>${fraction}</a14:m></a14:m>`,
    `<a14:m><m:oMathPara xmlns:m="${M}">${fraction}</m:oMathPara></a14:m>`,
    `<a14:m>${fraction}${fraction}</a14:m>`])
    assert.throws(()=>parseOoxml(ppt(shape(payload)),'.pptx',undefined,opts));
});
testAsync('supported and extra formula arguments keep full actual field values protected in both profiles',async()=>{
  const values=[math(`<m:f><m:num>${r('Name: Qvx / Qvy')}</m:num><m:den>${r('FHIR REST 123')}</m:den></m:f>`),
    math(`<m:f><m:num>${r('1')}</m:num><m:den>${r('2')}</m:den>${r('Name: Qvx / Qvy')}</m:f>`)];
  for(const profile of ['general','personnel_profile'])for(const value of values)for(const type of ['docx','pptx']){
    const bytes=type==='docx'?doc(`<w:p>${value}</w:p>`):ppt(shape(`<a14:m>${value}</a14:m>`));
    const out=extract(bytes,type),transformed=anonymizeMarkdown(out.markdown,profile,{productChannel:'standalone',contentOptions:{schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false}});
    assert.doesNotMatch(transformed.text,/Qvx|Qvy/u);if(value===values[0])assert.match(transformed.text,/FHIR REST 123/u);
  }
});
testAsync('an actual paragraph field before a formula owns its full value, not unrelated argument fields',async()=>{
  for(const type of ['docx','pptx'])for(const table of [false,true]){
    const formula=math(`<m:f><m:num>${r('Qvx / Qvy')}</m:num><m:den>${r('Qvz')}</m:den></m:f>`);
    const word=`<w:p>${wtext('Name: ')}${formula}</w:p>`;
    const drawing=`${atext('Name: ')}<a14:m>${formula}</a14:m>`;
    const source=type==='docx'?doc(table?`<w:tbl><w:tr><w:tc>${word}</w:tc></w:tr></w:tbl>`:word):
      ppt(table?`<p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid><a:gridCol/></a:tblGrid><a:tr><a:tc><a:txBody><a:p>${drawing}</a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`:shape(drawing));
    const extracted=extract(source,type),transformed=anonymizeMarkdown(extracted.markdown,'general',{productChannel:'standalone',contentOptions:{schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false}});
    assert.doesNotMatch(transformed.text,/Qvx|Qvy|Qvz/u);
  }
});
done();
