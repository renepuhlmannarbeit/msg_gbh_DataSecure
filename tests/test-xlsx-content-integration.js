'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {readZip}=require('../plugins/data-secure/server/zip-reader'),{zipStore}=require('./lib/zip');
const fixture=require('./lib/xlsx-context-writer-fixture.cjs');
const countercases=require('./lib/rc176-xlsx-field-countercases.cjs');
const {extractMarkdownBuffer,extractOfficeMarkdownAndMedia}=require('../plugins/data-secure/server/standalone/markdown-extractor');
const {appendOfficeOcr,officeOcrCheckpoint}=require('../plugins/data-secure/server/standalone/office-image-ocr');
const {createMarkdownExtraction}=require('../plugins/data-secure/server/standalone/markdown-contract');
const {xlsxContextSections}=require('../plugins/data-secure/server/xlsx-context-projection');
const bytes=Buffer.from(fixture.xlsx_base64,'base64'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const opts={markdownOutput:'content-v1',partialExtraction:true};
const entries=()=>readZip(bytes),set=(e,p,fn)=>e.set(p,Buffer.from(fn(e.get(p).toString('utf8'))));
const extract=e=>extractOfficeMarkdownAndMedia(zipStore([...e]),'.xlsx',opts);
let passed=0;function test(name,fn){fn();console.log(`PASS ${++passed} ${name}`);}

test('genuine file-mode XlsxWriter input and both embedded image bytes remain pinned',()=>{
 assert.equal(fixture.writer_version,'3.2.9');assert.equal(hash(bytes),fixture.xlsx_sha256);
 const e=entries();assert.deepEqual([...e].filter(([p])=>/^xl\/media\//u.test(p)).map(([,b])=>hash(b)),fixture.images_sha256);
});
test('real blank-cell author/text, TablePart columns and distinct vm images reach actual extraction once',()=>{
 const before=hash(bytes),out=extractOfficeMarkdownAndMedia(bytes,'.xlsx',opts),md=out.extraction.markdown;
 assert.match(md,/Zellkommentar · E7 · Autor/u);assert.equal(md.split('Autor: Anna Berger').length-1,1);
 assert.match(md,/Tabellenkontext · G3:H5/u);assert.match(md,/Tabellenspalte 7/u);assert.match(md,/Tabellenspalte 8/u);
 assert.match(md,/HTTP\/2/u);assert.match(md,/FHIR/u);assert.equal(md.split('Name: Qvx / Qvy').length-1,2);
 assert.deepEqual(out.attachments.map(a=>a.occurrences.map(o=>o.cell)),[['C2'],['D2']]);
 assert.deepEqual(out.attachments.map(a=>hash(Buffer.from(a.data,'base64'))),fixture.images_sha256);
 assert.ok(out.extraction.coverage.reason_codes.includes('SOURCE_COVERAGE_UNVERIFIED'));assert.equal(hash(bytes),before);
});
test('only successful actual RichValue graph authorizes local images, never an orphan media sweep',()=>{
 const e=entries();e.set('xl/media/unrelated.png',e.get('xl/media/image1.png'));
 assert.equal(extract(e).attachments.length,2);
 set(e,'xl/richData/rdrichvaluestructure.xml',s=>s.replace('_localImage','_unsupportedProvider'));
 const out=extract(e);assert.equal(out.attachments.length,0);assert.match(out.extraction.markdown,/HTTP\/2/u);
 assert.doesNotMatch(out.extraction.markdown,/Bild-Alternativtext/u);assert.ok(out.extraction.coverage.reason_codes.includes('SOURCE_COVERAGE_UNVERIFIED'));
});
test('formula cells cannot borrow static-image metadata for evaluated IMAGE-like content',()=>{
 const e=entries();set(e,'xl/worksheets/sheet1.xml',s=>s.replace('<c r="C2" t="e" vm="1">','<c r="C2" t="e" vm="1"><f>IMAGE("https://invalid.example/image")</f>'));
 const out=extract(e);assert.equal(out.attachments.length,1);assert.equal(out.attachments[0].occurrences[0].cell,'D2');assert.match(out.extraction.markdown,/HTTP\/2/u);
});
test('original unchanged CalcOrigin10 counterexample no longer authorizes either image from the failed atomic context',()=>{
 const fixture=countercases['COUNTERCASE-CALCORIGIN10.xlsx'],source=Buffer.from(fixture.base64,'base64');assert.equal(hash(source),fixture.sha256);
 const out=extractOfficeMarkdownAndMedia(source,'.xlsx',opts);assert.equal(out.attachments.length,0);assert.match(out.extraction.markdown,/HTTP\/2/u);
 assert.ok(out.extraction.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));assert.equal(hash(source),fixture.sha256);
});
test('wrong rich MIME, wrong owner, duplicate role, external graph and unknown Microsoft role remain rejected',()=>{
 for(const change of [
  e=>set(e,'[Content_Types].xml',s=>s.replace('application/vnd.ms-excel.rdrichvalue+xml','text/plain')),
  e=>{const p='xl/_rels/workbook.xml.rels';const x=e.get(p).toString(),edge=/<Relationship\b[^>]+Type="[^"]+\/rdRichValue"[^>]*\/>/u.exec(x)[0];set(e,p,s=>s.replace(edge,''));set(e,'xl/worksheets/_rels/sheet1.xml.rels',s=>s.replace('</Relationships>',edge+'</Relationships>'));},
  e=>set(e,'xl/_rels/workbook.xml.rels',s=>s.replace('</Relationships>',/<Relationship\b[^>]+Type="[^"]+\/rdRichValue"[^>]*\/>/u.exec(s)[0].replace(/Id="[^"]+"/u,'Id="duplicate"')+'</Relationships>')),
  e=>set(e,'xl/_rels/workbook.xml.rels',s=>s.replace('Target="richData/rdrichvalue.xml"','Target="https://invalid.example/data.xml" TargetMode="External"')),
  e=>set(e,'xl/_rels/workbook.xml.rels',s=>s.replace('/rdRichValue"','/unmodeledRichRole"'))
 ]){const e=entries();change(e);assert.throws(()=>extract(e));}
 // Admission is not silently enabled in the legacy privacy parser.
 const {parseOoxml}=require('../plugins/data-secure/server/ooxml');
 const {validateOpcControls}=require('../plugins/data-secure/server/gateway/opc-source-validator');
 const e=entries();assert.throws(()=>validateOpcControls({declaredType:'xlsx',entries:new Set(e.keys()),controlParts:Object.fromEntries([...e].filter(([p])=>p==='[Content_Types].xml'||p.endsWith('.rels')).map(([p,b])=>[p,b.toString()])),partialExtraction:false}));
 assert.equal(typeof parseOoxml,'function');
});
test('malformed reached context never replays legacy raw comment text or revokes independent sheet values',()=>{
 const e=entries();set(e,'xl/comments1.xml',s=>s.replace('authorId="0"','authorId="99"'));
 const out=extract(e);assert.match(out.extraction.markdown,/HTTP\/2/u);assert.doesNotMatch(out.extraction.markdown,/Anna Berger|Qvx|Qvy/u);
 assert.equal(out.attachments.length,0);assert.ok(out.extraction.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
});
test('real pivot owner/cache binding emits used labels, not old hidden cache records',()=>{
 const e=entries(),X='http://schemas.openxmlformats.org/spreadsheetml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const pp='xl/pivotTables/pivotTable1.xml',pc='xl/pivotCache/pivotCacheDefinition1.xml';
 set(e,'[Content_Types].xml',s=>s.replace('</Types>',`<Override PartName="/${pp}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml"/><Override PartName="/${pc}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml"/></Types>`));
 set(e,'xl/workbook.xml',s=>s.replace('</workbook>','<pivotCaches><pivotCache cacheId="7" r:id="pc"/></pivotCaches></workbook>'));
 set(e,'xl/_rels/workbook.xml.rels',s=>s.replace('</Relationships>',`<Relationship Id="pc" Type="${R}/pivotCacheDefinition" Target="pivotCache/pivotCacheDefinition1.xml"/></Relationships>`));
 set(e,'xl/worksheets/_rels/sheet1.xml.rels',s=>s.replace('</Relationships>',`<Relationship Id="pv" Type="${R}/pivotTable" Target="../pivotTables/pivotTable1.xml"/></Relationships>`));
 e.set(pp,Buffer.from(`<pivotTableDefinition xmlns="${X}" name="Protokollsicht" cacheId="7"><location ref="J3:K6" firstHeaderRow="0" firstDataRow="1" firstDataCol="1"/><pivotFields count="2"><pivotField axis="axisRow"/><pivotField dataField="1"/></pivotFields><rowFields count="1"><field x="0"/></rowFields><dataFields count="1"><dataField fld="1" name="Gesamtpreis" subtotal="sum"/></dataFields></pivotTableDefinition>`));
 e.set('xl/pivotTables/_rels/pivotTable1.xml.rels',Buffer.from(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="c" Type="${R}/pivotCacheDefinition" Target="../pivotCache/pivotCacheDefinition1.xml"/></Relationships>`));
 e.set(pc,Buffer.from(`<pivotCacheDefinition xmlns="${X}"><cacheSource type="worksheet"><worksheetSource ref="G3:H5" sheet="Quelle"/></cacheSource><cacheFields count="2"><cacheField name="Protocol"><sharedItems><s v="HIDDEN OLD PERSON"/></sharedItems></cacheField><cacheField name="Preis"/></cacheFields></pivotCacheDefinition>`));
 e.set('xl/pivotCache/pivotCacheRecords1.xml',Buffer.from(`<pivotCacheRecords xmlns="${X}"><r><s v="STALE CACHE SECRET"/></r></pivotCacheRecords>`));
 const out=extract(e);assert.match(out.extraction.markdown,/Pivotkontext · J3:K6/u);assert.match(out.extraction.markdown,/Gesamtpreis/u);
 assert.doesNotMatch(out.extraction.markdown,/HIDDEN OLD PERSON|STALE CACHE SECRET/u);assert.match(out.extraction.markdown,/HTTP\/2/u);
});
test('cell placement labels and checkpoint budgets preserve actual Unicode contact offsets',()=>{
 const {extraction,attachments}=extractOfficeMarkdownAndMedia(bytes,'.xlsx',opts),o=attachments[0].occurrences[0];
 const contentOptions={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:true,imageOcr:true};
 const text='Änne 😀 test@example.invalid',start=text.indexOf('test');
 const result=createMarkdownExtraction({source_type:'xlsx',markdown:text,content_options:contentOptions,coverage:{status:'incomplete',reason_codes:['OCR_CONTACT_VALUES_UNVERIFIED','OCR_NOT_VERIFIED']},ocr_contacts:[{start,end:text.length,page:1,line:1,kind:'email'}]});
 const out=appendOfficeOcr(extraction,[result],contentOptions,[{...o,ordinal:1,result:0}]);assert.match(out.markdown,/Arbeitsblatt 1 · Zelle C2/u);
 assert.equal(out.markdown.slice(out.ocr_contacts[0].start,out.ocr_contacts[0].end),'test@example.invalid');
 const budget={chars:0,contacts:0,bytes:0,pixels:0,units:0};const cp=officeOcrCheckpoint(extraction,result,contentOptions,[o],budget);assert.equal(budget.chars,cp.markdown.length);
 assert.equal(cp.markdown.slice(cp.ocr_contacts[0].start,cp.ocr_contacts[0].end),'test@example.invalid');
 for(const cell of ['C2\nINJECTION','XFE1','A1048577'])assert.throws(()=>appendOfficeOcr(extraction,[result],contentOptions,[{...o,cell,ordinal:1,result:0}]),{code:'CONVERSION_INPUT_INVALID'});
});
test('generated context and actual escaped values share the same finite projection budget',()=>{
 const model={sourcePart:'xl/worksheets/sheet1.xml',comments:[],tables:[],pivots:[],richValues:[]};
 const table={part:'xl/tables/table1.xml',reference:'A1:B2',headerRowCount:1,totalsRowCount:0,name:'',displayName:'',columns:[],filters:[]};
 const unit=xlsxContextSections({...model,tables:[table]},s=>s)[0].markdown.length+2;
 model.tables=Array.from({length:Math.floor(8000000/unit)+1},()=>table);
 assert.throws(()=>xlsxContextSections(model,s=>s),{code:'XLSX_STRUCTURE_LIMIT'});
});
(async()=>{
 const {extractSourceForPrivacy}=require('../plugins/data-secure/server/core/markdown-first-privacy');
 const {prepareTextPrivacyReview,resolveTextPrivacyReview,finalizeTextPrivacyReview}=require('../plugins/data-secure/server/gateway/privacy-text-operation');
 const {replayTransformTrace}=require('../plugins/data-secure/server/privacy/transform-plan');
 const {verifyAnonymizedPublication}=require('../plugins/data-secure/server/standalone/anonymized-artifact');
 const {initialEntities,applyEntityDecisions}=require('../plugins/data-secure/server/gateway/standalone-entity-review');
 const {bindStandaloneDocumentKeeps}=require('../plugins/data-secure/server/privacy/residual-person-review');
 const contentOptions={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:false,imageOcr:false};
 for(const profile of ['general','personnel_profile']){
  const source=await extractSourceForPrivacy(bytes,'.xlsx',{contentOptions,convertBuffer:async b=>{const out=extractMarkdownBuffer(b,'.xlsx',opts);return createMarkdownExtraction({source_type:out.source_type,markdown:out.markdown,coverage:out.coverage,content_options:contentOptions});}});
  const prepared=prepareTextPrivacyReview({text:source.markdown,profile,productChannel:'standalone',consumerOptions:{productChannel:'standalone',contentOptions},registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
  const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'}),final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
  assert.doesNotMatch(final.markdown,/Anna Berger|Qvx|Qvy/u);assert.match(final.markdown,/HTTP\/2/u);assert.match(final.markdown,/FHIR/u);assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
  const proof={markdown:final.markdown,profile,content_options:contentOptions,source_extraction:source.sourceExtraction,dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates};assert.ok(verifyAnonymizedPublication(proof));
  const entities=initialEntities({markdown:final.markdown,transform_trace:final.transform_trace}),target=entities.find(v=>v.original.includes('Qvx'));assert.ok(target);
  const kept=applyEntityDecisions(final.markdown,entities,[{entity_id:target.entity_id,decision:'keep'}],Buffer.alloc(32,7));
  assert.throws(()=>verifyAnonymizedPublication({...proof,markdown:kept.markdown,reviewed_person_candidates:bindStandaloneDocumentKeeps(kept.markdown,[],kept.entities.filter(e=>e.decision==='keep').map(({start,end})=>({start,end})))}),{code:'STANDALONE_PUBLICATION_INVALID'});
  console.log(`PASS ${++passed} genuine writer XLSX -> source/privacy/trace/publication/Keep ${profile}`);
  for(const damagedComment of [false,true]){
  const fixture=countercases['COUNTERCASE-HIDDEN-NAME-TABLE.xlsx'];let hidden=Buffer.from(fixture.base64,'base64');
  if(damagedComment){const parts=readZip(hidden);set(parts,'xl/comments1.xml',s=>s.replace('authorId="0"','authorId="99"'));hidden=zipStore([...parts]);}
  const expectedHash=damagedComment?'962031bc27b29ac2459f470b618c700d865b83832d51930606a156de98d7a431':fixture.sha256;assert.equal(hash(hidden),expectedHash);
  const hiddenSource=await extractSourceForPrivacy(hidden,'.xlsx',{contentOptions,convertBuffer:async b=>{const out=extractMarkdownBuffer(b,'.xlsx',opts);return createMarkdownExtraction({source_type:out.source_type,markdown:out.markdown,coverage:out.coverage,content_options:contentOptions});}});
  assert.match(hiddenSource.markdown,/Qzx/u);assert.match(hiddenSource.markdown,/Qzy/u);
  const hp=prepareTextPrivacyReview({text:hiddenSource.markdown,profile,productChannel:'standalone',consumerOptions:{productChannel:'standalone',contentOptions},registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
  const hr=await resolveTextPrivacyReview(hp,null,{reviewPolicy:'automatic-conservative'}),hf=finalizeTextPrivacyReview(hp,hr,{prefix:'',suffix:''});
  assert.doesNotMatch(hf.markdown,/Qzx|Qzy/u);assert.match(hf.markdown,/100/u);assert.match(hf.markdown,/200/u);assert.equal(replayTransformTrace(hf.transform_trace),hf.markdown);
  const hproof={markdown:hf.markdown,profile,content_options:contentOptions,source_extraction:hiddenSource.sourceExtraction,dictionary:hf.dictionary,strong_person_anchor:hf.strong_person_anchor,reviewed_person_candidates:hf.reviewed_person_candidates};assert.ok(verifyAnonymizedPublication(hproof));
  const he=initialEntities({markdown:hf.markdown,transform_trace:hf.transform_trace}),ht=he.find(v=>v.original.includes('Qzx'));assert.ok(ht);
  const hk=applyEntityDecisions(hf.markdown,he,[{entity_id:ht.entity_id,decision:'keep'}],Buffer.alloc(32,7));
  assert.throws(()=>verifyAnonymizedPublication({...hproof,markdown:hk.markdown,reviewed_person_candidates:bindStandaloneDocumentKeeps(hk.markdown,[],hk.entities.filter(e=>e.decision==='keep').map(({start,end})=>({start,end})))}),{code:'STANDALONE_PUBLICATION_INVALID'});
  assert.equal(hash(hidden),expectedHash);console.log(`PASS ${++passed} original hidden-header TablePart -> actual cell/privacy/trace/publication/Keep ${profile}/damaged-comment=${damagedComment}`);
  }
 }
 assert.equal(hash(bytes),fixture.xlsx_sha256);console.log(`${passed} XLSX production-context groups passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
