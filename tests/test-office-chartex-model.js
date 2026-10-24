'use strict';
const {createSuite}=require('./helpers');
const {test,testAsync,assert,done}=createSuite('Source-bound Office chartEx caches');
const {readOfficeChartEx,renderOfficeChartEx}=require('../plugins/data-secure/server/office-chartex-model');
const {xmlDecode,parseOoxml}=require('../plugins/data-secure/server/ooxml');
const {extractMarkdownBuffer}=require('../plugins/data-secure/server/standalone/markdown-extractor');
const {validateOpcControls}=require('../plugins/data-secure/server/gateway/opc-source-validator');
const F=require('./lib/office-chartex-fixtures.cjs');
const {chart,dim,pt,series,axis,source}=F;
const fail=limit=>Object.assign(new Error('Synthetic chartEx failure'),{code:limit?'PPTX_STRUCTURE_LIMIT':'PPTX_STRUCTURE_UNSAFE'});
const model=xml=>readOfficeChartEx(xml,xmlDecode,fail),render=xml=>renderOfficeChartEx(model(xml),String,fail);
const extract=(bytes,extension,mode='content-v1')=>extractMarkdownBuffer(bytes,extension,{markdownOutput:mode,partialExtraction:true});
const controls=(bytes,extension,partial=true)=>{const entries=require('../plugins/data-secure/server/zip-reader').readZip(bytes);return validateOpcControls({declaredType:extension.slice(1),entries:new Set(entries.keys()),controlParts:Object.fromEntries([...entries].filter(([name])=>name==='[Content_Types].xml'||name.endsWith('.rels')).map(([name,data])=>[name,data.toString('utf8')])),partialExtraction:partial,passivePresentation:extension==='.pptx'});};
test('chartEx uses its own data-ID, direct point text and explicit shuffled indices',()=>{
 const result=render(chart());assert.match(result.markdown,/\| 0 \| North \| 100 \|/u);assert.match(result.markdown,/\| 1 \| South \| 200 \|/u);assert.ok(result.hasSource);assert.match(result.markdown,/keine Formeln/u);
});
for(const layout of ['boxWhisker','clusteredColumn','funnel','paretoLine','regionMap','sunburst','treemap','waterfall'])test(`${layout} caches reach Word body, placed slide, worksheet/chartsheet and both output modes`,()=>{
 for(const extension of ['.docx','.pptx','.xlsx'])for(const chartsheet of extension==='.xlsx'?[false,true]:[false]){
  const bytes=source(extension,chart({seriesXml:series(17,{layout})}),{chartsheet}),original=Buffer.from(bytes);assert.equal(controls(bytes,extension).controls_verified,true);
  for(const mode of ['content-v1','notes-v1']){const result=extract(bytes,extension,mode);assert.match(require('markdown-it')().render(result.markdown),/FHIR_SOURCE/u);for(const value of ['North','South','100','200',layout])assert.ok(result.markdown.includes(value));assert.notEqual(result.coverage.status,'complete');}
  assert.deepEqual(bytes,original);
 }
});
test('series bind exact data IDs and retain source series order, never dictionary order',()=>{
 const result=render(chart({data:`<cx:data id="99">${dim('cat',[[0,'WRONG']],{count:1})}</cx:data><cx:data id="17">${dim()}</cx:data>`,seriesXml:series(17)+series(99,{title:'Second'})}));
 assert.ok(result.markdown.indexOf('North')<result.markdown.indexOf('WRONG'));assert.match(result.markdown,/Daten-ID 99/u);
});
test('orphan data is not a series cache and a missing data ID cannot borrow it',()=>{
 const result=render(chart({data:`<cx:data id="99">${dim('cat',[[0,'ORPHAN_SECRET']],{count:1})}</cx:data>`,seriesXml:series(17)}));assert.doesNotMatch(result.markdown,/ORPHAN_SECRET/u);assert.ok(result.issues.includes('DATA_BINDING_MISSING'));assert.ok(result.issues.includes('UNBOUND_DATA'));
});
test('shared field duty follows the exact data-object/dimension, not equal text or adjacent IDs',()=>{
 const data=`<cx:data id="17">${dim('cat',[[0,'Qvx / Qvy']],{count:1})+dim('val',[[0,'100']],{numeric:true,count:1})}</cx:data><cx:data id="88">${dim('cat',[[0,'Qvx / Qvy']],{count:1})+dim('val',[[0,'100']],{numeric:true,count:1})}</cx:data>`;
 const options={data,seriesXml:series(17,{axisIds:[1]})+series(88,{axisIds:[2]}),axes:axis(1,'Name')+axis(2,'Region')};
 const independent=render(chart(options));assert.match(independent.markdown.split('Daten-ID 88')[1],/\| Punktindex \| Region \| Wert \|/u);assert.ok(!independent.issues.includes('SHARED_FIELD_BINDING'));
 const shared=render(chart({...options,seriesXml:series(17,{axisIds:[2]})+series(17,{axisIds:[1]})}));assert.ok(shared.issues.includes('SHARED_FIELD_BINDING'));assert.match(shared.markdown,/\| Punktindex \| Geschützter Tabellenwert \| Wert \|/u);assert.match(shared.markdown,/\| 0 \| Qvx \/ Qvy \| 100 \|/u);
});
test('multilevel caches preserve level/index/name and do not forward-fill missing parents',()=>{
 const dimensions=dim('cat',[],{levels:`<cx:lvl ptCount="2" name="Leaf">${pt(1,'B')+pt(0,'A')}</cx:lvl><cx:lvl ptCount="2" name="Parent">${pt(0,'P')}</cx:lvl>`})+dim('val',[[1,'2'],[0,'1']],{numeric:true});
 const result=render(chart({dimensions}));assert.match(result.markdown,/\| 0 \| A \| P \| 1 \|/u);assert.match(result.markdown,/\| 1 \| B \|  \| 2 \|/u);assert.ok(result.issues.includes('CACHE_GAPS'));
});
test('all schema dimension roles remain distinct, with literal Unicode and no implicit scaling',()=>{
 const dimensions=dim('cat',[[0,'ÄÖÜß 中文 😀']],{count:1})+dim('colorStr',[[0,'Blue']],{count:1})+dim('entityId',[[0,'Berlin']],{count:1})+['val','x','y','size','colorVal'].map((type,i)=>dim(type,[[0,String(i+1)]],{numeric:true,count:1,format:'0%'})).join('');
 const result=render(chart({dimensions}));assert.match(result.markdown,/ÄÖÜß 中文 😀 \| Blue \| Berlin \| 1 \| 2 \| 3 \| 4 \| 5/u);assert.match(result.markdown,/Rohwerte unverändert/u);assert.doesNotMatch(result.markdown,/100%/u);
});
test('UINT32 sparse indices do not allocate to ptCount or turn a missing point into zero',()=>{
 const result=render(chart({dimensions:dim('cat',[[4294967294,'LAST']],{count:4294967295})+dim('val',[[0,'50']],{numeric:true,count:4294967295})}));assert.match(result.markdown,/\| 4294967294 \| LAST \|  \|/u);assert.match(result.markdown,/\| 0 \|  \| 50 \|/u);assert.ok(result.markdown.length<5000);
});
test('source formula and name formula stay unevaluated; no external data resolver is used',()=>{
 const result=render(chart({dimensions:dim('cat',[[0,'Only cache']],{count:1,extra:'<cx:f dir="col">[remote.xlsx]Data!A1</cx:f><cx:nf>Data!A2</cx:nf>'})}).replace('<cx:chartData>','<cx:chartData><cx:externalData/>'));assert.match(result.markdown,/Only cache/u);assert.match(result.markdown,/nicht ausgewertet/u);assert.ok(result.issues.includes('EXTERNAL_DATA'));
});
test('externalData, geography and unknown layout have explicit omissions without discarding valid caches',()=>{
 const xml=chart({seriesXml:series(17,{layout:'future',extra:'<cx:layoutPr><cx:geography><cx:geoCache>PRIVATE_GEO</cx:geoCache></cx:geography></cx:layoutPr>'})}).replace('<cx:chartData>','<cx:chartData><cx:externalData/>');const result=render(xml);
 assert.match(result.markdown,/North/u);assert.doesNotMatch(result.markdown,/PRIVATE_GEO/u);for(const issue of ['EXTERNAL_DATA','GEOGRAPHY_NOT_RENDERED','LAYOUT_UNMODELED','CONTENT_UNMODELED'])assert.ok(result.issues.includes(issue));
});
test('binning, quartile and subtotal parameters are retained without computing derived values',()=>{
 const result=render(chart({seriesXml:series(17,{attributes:'ownerIdx="0" hidden="true"',extra:'<cx:layoutPr><cx:binning intervalClosed="r" underflow="auto"><cx:binCount>4</cx:binCount></cx:binning><cx:statistics quartileMethod="exclusive"/><cx:subtotals><cx:idx val="1"/></cx:subtotals></cx:layoutPr>'})}));for(const value of ['exclusive','binCount','Subtotal','ausgeblendet','Serienbesitzerindex'])assert.ok(result.markdown.includes(value));assert.match(result.markdown,/North/u);
});
for(const [name,mutate,code='PPTX_STRUCTURE_UNSAFE']of [
 ['duplicate-data',xml=>xml.replace('</cx:chartData>','<cx:data id="17"/></cx:chartData>')],
 ['duplicate-point',xml=>xml.replace('</cx:lvl>',pt(0,'duplicate')+'</cx:lvl>')],
 ['point-outside-count',xml=>xml.replace('idx="0"','idx="2"')],
 ['negative-point',xml=>xml.replace('idx="0"','idx="-1"')],
 ['missing-count',xml=>xml.replace('ptCount="2"','')],
 ['nested-point',xml=>xml.replace('>North</cx:pt>','><cx:v>North</cx:v></cx:pt>')],
 ['duplicate-dataId',xml=>xml.replace('<cx:dataId val="17"/>','<cx:dataId val="17"/><cx:dataId val="17"/>')],
 ['duplicate-chart',xml=>xml.replace('</cx:chartSpace>','<cx:chart/></cx:chartSpace>')],
 ['invalid-axis-id',xml=>xml.replace('</cx:series>','<cx:axisId>-1</cx:axisId></cx:series>')],
 ['foreign-root',xml=>xml.replaceAll(F.CX,'urn:foreign')],
 ['DTD',xml=>'<!DOCTYPE x [<!ENTITY y SYSTEM "file:///private">]>'+xml],
 ['invalid-codepoint',xml=>xml.replace('North','&#0;'),'OOXML_XML_CHARACTER_INVALID'],
 ['invalid-numeric-lexical',xml=>xml.replace('>100</cx:pt>','>100junk</cx:pt>')]
])test(`typed atomic refusal: ${name}`,()=>assert.throws(()=>model(mutate(chart())),{code}));
test('xsd:string cache preserves literal Excel-looking escapes; valid XML entity is decoded once',()=>{
 const result=render(chart({dimensions:dim('cat',[[0,'_x0041_ / _x0000_ / &amp;']],{count:1})}));assert.match(result.markdown,/_x0041_ \/ _x0000_ \/ &amp;/u);assert.doesNotMatch(result.markdown,/\0/u);
});
test('explicit empty string, finite exponent and nonfinite xsd:double remain distinguishable',()=>{
 const result=render(chart({dimensions:dim('cat',[[0,''],[1,'B']],{count:2})+dim('val',[[0,'1.25E+2'],[1,'NaN']],{numeric:true})}));assert.match(result.markdown,/\| 0 \|  \| 1\.25E\+2 \|/u);assert.ok(result.issues.includes('NONFINITE_VALUE'));assert.doesNotMatch(result.markdown,/Fehlender Cachepunkt/u);
});
test('missing formula-only cache is not fabricated, repeated dimension roles do not overwrite',()=>{
 const result=render(chart({dimensions:dim('cat',[],{levels:'',extra:'<cx:f>Data!A1</cx:f>'})+dim('val',[[0,'1']],{numeric:true,count:1})+dim('val',[[0,'2']],{numeric:true,count:1})}));assert.match(result.markdown,/\| 0 \| 1 \| 2 \|/u);assert.ok(result.issues.includes('CACHE_MISSING'));
});
test('cyclic/out-of-range owning-series indices are disclosed without joining other data',()=>{
 for(const owner of [0,10]){const result=render(chart({seriesXml:series(17,{attributes:`ownerIdx="${owner}"`})}));assert.ok(result.issues.includes('SERIES_OWNER_UNRESOLVED'));assert.match(result.markdown,/North/u);}
});
test('new same-namespace dashboards/features are not claimed as modeled',()=>{
 const result=render(chart({extra:'<cx:dashboard/>'}).replace('<cx:chartSpace ','<cx:chartSpace featureList="future" '));assert.ok(result.issues.includes('FEATURE_UNMODELED'));assert.match(result.markdown,/North/u);
});
test('unknown required version and absent title cache are explicitly incomplete',()=>{
 assert.ok(render(chart().replace('<cx:chartSpace ','<cx:chartSpace version="99.0" ')).issues.includes('FEATURE_UNMODELED'));
 assert.ok(!render(chart().replace('<cx:chartSpace ','<cx:chartSpace version="0.0" ')).issues.includes('FEATURE_UNMODELED'));
 assert.ok(render(chart().replace('<cx:v>Revenue</cx:v>','<cx:f>Data!A1</cx:f>')).issues.includes('TEXT_CACHE_MISSING'));
 assert.ok(!render(chart({title:''})).issues.includes('TEXT_CACHE_MISSING'));
});
test('wide repeated long headers are bounded BEFORE join, with an unchanged small-header control',()=>{
 const dimensions=Array.from({length:64},()=>dim('val',[],{numeric:true,levels:('<cx:lvl ptCount="1">'+pt(0,'1')+'</cx:lvl>').repeat(64)})).join('');
 const make=label=>chart({dimensions,seriesXml:series(17,{axisIds:[1]}),axes:axis(1,label,'val')});
 assert.throws(()=>render(make('A'.repeat(131073))),{code:'PPTX_STRUCTURE_LIMIT'});
 const control=render(make('Metric'));assert.equal(control.markdown.split('\n').find(line=>line.startsWith('| 0 |')).match(/\b1\b/gu).length,4096);
});
test('generated aggregation/series labels alone do not become source content',()=>{
 const result=render(chart({title:'',dimensions:dim('cat',[],{count:0}),seriesXml:series(17,{title:'',extra:'<cx:layoutPr><cx:aggregation/></cx:layoutPr>'})}));assert.equal(result.hasSource,false);
});
test('invalid reached cache is an honest partial omission, not a prefix or document-wide abort',()=>{
 for(const extension of ['.docx','.pptx','.xlsx']){const bytes=source(extension,chart().replace('idx="0"','idx="-1"'));const result=extract(bytes,extension);assert.match(require('markdown-it')().render(result.markdown),/FHIR_SOURCE/u);assert.doesNotMatch(result.markdown,/Revenue|North/u);assert.ok(result.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));}
});
test('wide extension scanning avoids argument limits and observes late unmodeled values',()=>{
 const xml=chart({extra:'<cx:extLst>'+Array.from({length:150000},(_,i)=>`<cx:ext uri="urn:${i}">${i===149999?'<cx:v>LATE_PRIVATE</cx:v>':''}</cx:ext>`).join('')+'</cx:extLst>'});const result=render(xml);assert.match(result.markdown,/North/u);assert.doesNotMatch(result.markdown,/LATE_PRIVATE/u);assert.ok(result.issues.includes('CONTENT_UNMODELED'));
});
test('node budget stays hard and typed',()=>assert.throws(()=>model(chart({extra:'<cx:extLst>'+'<cx:ext/>'.repeat(200001)+'</cx:extLst>'})),{code:'PPTX_STRUCTURE_LIMIT'}));
for(const extension of ['.docx','.pptx','.xlsx']){
 test(`${extension} SDK extendedCharts/chartN.xml and conventional charts/chartN.xml are bound by role/type`,()=>{
  const {readZip}=require('../plugins/data-secure/server/zip-reader'),{zipStore}=require('./lib/zip');
  for(const replacement of ['extendedCharts/chart1.xml','charts/chart1.xml']){
   const entries=[...readZip(source(extension))].map(([name,bytes])=>[name.replace('charts/chartEx1.xml',replacement),name.endsWith('.xml')||name.endsWith('.rels')?bytes.toString('utf8').replaceAll('charts/chartEx1.xml',replacement):bytes]);
   const bytes=zipStore(entries);assert.equal(controls(bytes,extension).controls_verified,true);assert.match(extract(bytes,extension).markdown,/North/u);
  }
 });
 const graphic=`<a:graphic><a:graphicData uri="${F.CX}"><cx:chart r:id="cx1"/></a:graphicData></a:graphic>`;
 const frame=extension==='.docx'?`<w:p><w:r><w:drawing><wp:anchor>${graphic}</wp:anchor></w:drawing></w:r></w:p>`:`<${extension==='.pptx'?'p':'xdr'}:graphicFrame>${graphic}</${extension==='.pptx'?'p':'xdr'}:graphicFrame>`;
 test(`${extension} selected chartEx MC choice agrees with the actual body scope, no fallback duplication`,()=>{
  const choice=`<mc:AlternateContent><mc:Choice Requires="cx">${frame}</mc:Choice><mc:Fallback>${frame.replace('cx1','unused')}</mc:Fallback></mc:AlternateContent>`;
  for(const mode of ['content-v1','notes-v1']){const result=extract(source(extension,chart(),{frameXml:choice}),extension,mode);assert.equal((result.markdown.match(/Daten-ID 17/gu)||[]).length,1);assert.match(result.markdown,/North/u);}
 });
 test(`${extension} exact Office cx1 frame marker selects the base chartEx payload without accepting arbitrary versions`,()=>{
  const choice=`<mc:AlternateContent xmlns:cx1="http://schemas.microsoft.com/office/drawing/2015/9/8/chartex"><mc:Choice Requires="cx1">${frame}</mc:Choice><mc:Fallback/></mc:AlternateContent>`;
  for(const mode of ['content-v1','notes-v1']){assert.match(extract(source(extension,chart(),{frameXml:choice}),extension,mode).markdown,/North/u);
   assert.doesNotMatch(extract(source(extension,chart(),{frameXml:choice.replace('2015/9/8','2027/9/8')}),extension,mode).markdown,/North/u);}
 });
 if(extension!=='.docx')test(`${extension} already-understood a14 choice retains chartEx cache rather than unrelated fallback`,()=>{
  const choice=`<mc:AlternateContent xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main"><mc:Choice Requires="a14">${frame}</mc:Choice><mc:Fallback>${frame.replace('cx1','missing')}</mc:Fallback></mc:AlternateContent>`;
  for(const mode of ['content-v1','notes-v1'])assert.match(extract(source(extension,chart(),{frameXml:choice}),extension,mode).markdown,/North/u);
 });
 test(`${extension} bound internal styles and opaque workbook do not trigger calculation or an unselected sheet dump`,()=>{
  const {readZip}=require('../plugins/data-secure/server/zip-reader'),{zipStore}=require('./lib/zip'),family={'.docx':'word','.pptx':'ppt','.xlsx':'xl'}[extension];
  const base=[...readZip(source(extension))],typeXml=base.find(([name])=>name==='[Content_Types].xml')[1].toString('utf8').replace('</Types>',`<Override PartName="/${family}/charts/style1.xml" ContentType="application/vnd.ms-office.chartstyle+xml"/><Override PartName="/${family}/charts/colors1.xml" ContentType="application/vnd.ms-office.chartcolorstyle+xml"/><Override PartName="/${family}/embeddings/cache.xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/></Types>`);
  const entries=[...new Map([...base,['[Content_Types].xml',typeXml],[`${family}/charts/_rels/chartEx1.xml.rels`,`<Relationships xmlns="${F.PR}"><Relationship Id="style" Type="http://schemas.microsoft.com/office/2011/relationships/chartStyle" Target="style1.xml"/><Relationship Id="colors" Type="http://schemas.microsoft.com/office/2011/relationships/chartColorStyle" Target="colors1.xml"/><Relationship Id="cache" Type="${F.R}/package" Target="../embeddings/cache.xlsx"/></Relationships>`],[`${family}/charts/style1.xml`,'<style xmlns="urn:inert"/>'],[`${family}/charts/colors1.xml`,'<colors xmlns="urn:inert"/>'],[`${family}/embeddings/cache.xlsx`,Buffer.from('OPAQUE_UNSELECTED_WORKBOOK_PRIVATE')]])];
  const bytes=zipStore(entries);assert.equal(controls(bytes,extension).controls_verified,true);const result=extract(bytes,extension);assert.match(result.markdown,/North/u);assert.doesNotMatch(result.markdown,/OPAQUE_UNSELECTED|Eingebettetes Dokument/u);assert.notEqual(result.coverage.status,'complete');
   for(const basename of ['chartEx1','chart1']){
    const named=entries.map(([name,value])=>[name.replaceAll('chartEx1',basename),/\.(?:xml|rels)$/u.test(name)?value.toString('utf8').replaceAll('chartEx1',basename):value]);
    const current=zipStore(named);assert.equal(controls(current,extension).controls_verified,true);
    assert.throws(()=>controls(current,extension,false));
    assert.throws(()=>controls(zipStore(named.map(([name,value])=>[name,typeof value==='string'?value.replace('relationships/chartStyle','relationships/chartstyle'):value])),extension));
   }
  const rel=`${family}/charts/_rels/chartEx1.xml.rels`,xml=entries.find(([name])=>name===rel)[1];
  assert.throws(()=>controls(zipStore([...new Map([...entries,[rel,xml.replace('cache.xlsx','cache.xlsm')],[`${family}/embeddings/cache.xlsm`,Buffer.from('not admitted')]])]),extension));
  assert.throws(()=>controls(zipStore([...new Map([...entries,[rel,xml.replace('relationships/package','relationships/oleObject')]])]),extension));
   const wrongOwner=entries.filter(([name])=>name!==rel);wrongOwner.push([`${family}/custom/_rels/notChart.xml.rels`,xml],[`${family}/custom/notChart.xml`,'<notChartEx/>']);assert.throws(()=>controls(zipStore(wrongOwner),extension));
 });
 test(`${extension} unselected unknown choice cannot authorize a chartEx reference`,()=>{
  const choice=`<mc:AlternateContent><mc:Choice Requires="u">${frame}</mc:Choice><mc:Fallback/></mc:AlternateContent>`;
  const result=extract(source(extension,chart(),{frameXml:choice}),extension);assert.doesNotMatch(result.markdown,/North|Revenue/u);
 });
 test(`${extension} foreign owner wrapper and namespace rebinding cannot authorize chartEx`,()=>{
  for(const frameXml of [`<u:wrapper>${frame}</u:wrapper>`,frame.replace('uri="'+F.CX+'"','uri="urn:foreign"'),frame.replace('<cx:chart ','<cx:chart xmlns:cx="urn:foreign" ')])assert.doesNotMatch(extract(source(extension,chart(),{frameXml}),extension).markdown,/North|Revenue/u);
 });
 test(`${extension} repeated real occurrences preserve both owners instead of deduplicating a chart file`,()=>{
  const result=extract(source(extension,chart(),{frameXml:frame+frame}),extension);assert.equal((result.markdown.match(/Daten-ID 17/gu)||[]).length,2);
 });
 test(`${extension} OPC exact chartEx role/content type/owner; no external or generic Microsoft allowlist`,()=>{
  assert.equal(controls(source(extension),extension).controls_verified,true);
  for(const options of [{targetMode:'External'},{targetMode:'internal'},{contentType:'application/xml'},{relationType:F.CR.toLowerCase()},{relationType:F.CR+'/extra'}])assert.throws(()=>controls(source(extension,chart(),options),extension));
 });
 test(`${extension} unreferenced orphan chartEx part is not emitted`,()=>{const result=extract(source(extension,chart({title:'ORPHAN_TITLE'}),{orphan:true}),extension);assert.match(require('markdown-it')().render(result.markdown),/FHIR_SOURCE/u);assert.doesNotMatch(result.markdown,/ORPHAN(?:\\)?_TITLE|North/u);});
}
const {createMarkdownExtraction}=require('../plugins/data-secure/server/standalone/markdown-contract');
const {extractSourceForPrivacy}=require('../plugins/data-secure/server/core/markdown-first-privacy');
const {prepareTextPrivacyReview,resolveTextPrivacyReview,finalizeTextPrivacyReview}=require('../plugins/data-secure/server/gateway/privacy-text-operation');
const {verifyAnonymizedPublication}=require('../plugins/data-secure/server/standalone/anonymized-artifact');
const {replayTransformTrace}=require('../plugins/data-secure/server/privacy/transform-plan');
const {initialEntities,applyEntityDecisions}=require('../plugins/data-secure/server/gateway/standalone-entity-review');
const {bindStandaloneDocumentKeeps}=require('../plugins/data-secure/server/privacy/residual-person-review');
for(const extension of ['.docx','.pptx','.xlsx'])for(const profile of ['general','personnel_profile'])for(const mode of ['content-v1','notes-v1'])for(const field of ['level','axis','axis-unresolved','shared-axis'])testAsync(`${extension}/${profile}/${mode}/${field} real chartEx→Privacy→Residual→Trace→Keep`,async()=>{
 const axisCase=field!=='level';
 const xml=chart({dimensions:dim('cat',[[0,'Qvx / Qvy'],[1,'Anna\rBerger']],{name:field==='level'?'Name':undefined})+dim('val',[[1,'200'],[0,'100']],{numeric:true}),seriesXml:series(17,{axisIds:axisCase?[1]:[]})+(field==='shared-axis'?series(17,{axisIds:[2]}):''),axes:(axisCase?axis().replace(field==='axis-unresolved'?'<cx:catScaling/>':'NEVER',''):'')+(field==='shared-axis'?axis(2,'Region'):'')});
 const input=source(extension,xml,{chartsheet:true}),before=Buffer.from(input),contentOptions={schema:'datasecure-content-options/1',markdownOutput:mode,scanOcr:false,imageOcr:false},consumerOptions={productChannel:'standalone',contentOptions};
 const sourceText=await extractSourceForPrivacy(input,extension,{contentOptions,convertBuffer:async bytes=>{const actual=extract(bytes,extension,mode);return createMarkdownExtraction({source_type:extension.slice(1),markdown:actual.markdown,coverage:actual.coverage,content_options:contentOptions});}});
 const prepared=prepareTextPrivacyReview({text:sourceText.markdown,profile,productChannel:'standalone',consumerOptions,registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
 const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'}),final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
 assert.doesNotMatch(final.markdown,/Qvx|Qvy|Anna|Berger/u);if(field!=='axis-unresolved'){assert.match(final.markdown,/\| 0 \|[^\n]*\| 100 \|/u);assert.match(final.markdown,/\| 1 \|[^\n]*\| 200 \|/u);}else assert.match(final.markdown,/FIELD_REDACTED/u);assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
 const proof={markdown:final.markdown,profile,content_options:contentOptions,source_extraction:sourceText.sourceExtraction,dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates};assert.ok(verifyAnonymizedPublication(proof));
 const entities=initialEntities({markdown:final.markdown,transform_trace:final.transform_trace}),targets=entities.filter(entity=>entity.original.includes('Qvx'));assert.ok(targets.length);
 for(const target of targets){const kept=applyEntityDecisions(final.markdown,entities,[{entity_id:target.entity_id,decision:'keep'}],Buffer.alloc(32,7)),keepProof=bindStandaloneDocumentKeeps(kept.markdown,[],kept.entities.filter(entity=>entity.decision==='keep').map(({start,end})=>({start,end})));
  assert.throws(()=>verifyAnonymizedPublication({...proof,markdown:kept.markdown,reviewed_person_candidates:keepProof}),{code:'STANDALONE_PUBLICATION_INVALID'});}
 assert.deepEqual(input,before);
});
done();
