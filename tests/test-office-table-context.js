'use strict';

// Actual synthetic OPC sources and the unchanged privacy/residual chain. No
// native Office application, user source, renderer mock or word heuristic.
const { createSuite } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { parseOoxml } = require('../plugins/data-secure/server/ooxml');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { createMarkdownExtraction, COVERAGE_REASON_CODES } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { extractSourceForPrivacy } = require('../plugins/data-secure/server/core/markdown-first-privacy');
const neutral = require('../plugins/data-secure/server/core/source-extraction-contract');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } = require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { verifyAnonymizedPublication } = require('../plugins/data-secure/server/standalone/anonymized-artifact');
const { initialEntities, applyEntityDecisions } = require('../plugins/data-secure/server/gateway/standalone-entity-review');
const { replayTransformTrace, entityPlanFromTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const { test, testAsync, assert, done } = createSuite('Office parser-bound table context refusal');
const marker = 'OFFICE_TABLE_CONTEXT_UNVERIFIED';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const contract = markdownOutput => ({ schema: 'datasecure-content-options/1', markdownOutput, scanOcr: false, imageOcr: false });
const relation = (id, type, target) => `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`;
const relationships = body => `<Relationships xmlns="${PR}">${body}</Relationships>`;
const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const column = n => { let label = ''; while (n) { label = String.fromCharCode(65 + (n - 1) % 26) + label; n = Math.floor((n - 1) / 26); } return label; };
function xlsx(wide) {
  const rows = wide ? Array.from({ length: 450 }, (_, i) => {
    const row = i + 1;
    return `<row r="${row}">${row === 1 ? '<c r="A1" t="inlineStr"><is><t>Name</t></is></c>'
      : `${row === 2 ? '<c r="A2" t="inlineStr"><is><t>Qvx</t></is></c>' : ''}<c r="${column(row)}${row}"><v>${row}</v></c>`}</row>`;
  }).join('') : '<row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Qvx</t></is></c></row>';
  return zipStore([...opcControlEntries('xlsx', { additionalOverrides: [{ part: 'xl/worksheets/sheet1.xml',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml' }] }),
    ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Synthetic" sheetId="1" r:id="s"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', relationships(relation('s', 'worksheet', 'worksheets/sheet1.xml'))],
    ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${S}"><sheetData>${rows}</sheetData></worksheet>`]]);
}
const text = (value,placeholder=false) => `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Text"/><p:cNvSpPr/><p:nvPr>${placeholder?'<p:ph type="body"/>':''}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t xml:space="preserve">${xml(value)}</a:t></a:r></a:p></p:txBody></p:sp>`;
const table = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="Synthetic"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="1000000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid><a:gridCol w="1000000"/></a:tblGrid>' +
  ['Name', 'Qvx'].map(value => `<a:tr h="300000"><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${value}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr>`).join('') + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
const group = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
function pptx({ owner = 'slide', unselected = false, reached = true, prose = '', placeholder = false } = {}) {
  const declaration = `xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}" xmlns:mc="${MC}" xmlns:unknown="urn:unsupported"`;
  const inherited = unselected ? `<mc:AlternateContent><mc:Choice Requires="unknown">${table}</mc:Choice><mc:Fallback>${text('SAFEFALLBACK')}</mc:Fallback></mc:AlternateContent>` : table;
  const parts = [...opcControlEntries('pptx'),
    ['ppt/presentation.xml', `<p:presentation ${declaration}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="m"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="s"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', relationships(relation('s', 'slide', 'slides/slide1.xml') + relation('m', 'slideMaster', 'slideMasters/slideMaster1.xml'))],
    ['ppt/slides/slide1.xml', `<p:sld ${declaration}><p:cSld><p:spTree>${group}${text('FHIR')}${owner === 'slide' ? table : ''}</p:spTree></p:cSld></p:sld>`],
    ['ppt/slides/_rels/slide1.xml.rels', relationships(reached ? relation('l', 'slideLayout', '../slideLayouts/slideLayout1.xml') : '')],
    ['ppt/slideLayouts/slideLayout1.xml', `<p:sldLayout ${declaration}><p:cSld><p:spTree>${group}${owner === 'layout' ? inherited : ''}${prose ? text(prose,placeholder) : ''}</p:spTree></p:cSld></p:sldLayout>`],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', relationships(relation('m', 'slideMaster', '../slideMasters/slideMaster1.xml'))],
    ['ppt/slideMasters/slideMaster1.xml', `<p:sldMaster ${declaration}><p:cSld><p:spTree>${group}${owner === 'master' ? inherited : ''}</p:spTree></p:cSld></p:sldMaster>`]];
  return zipStore(parts);
}
async function boundPrivacy(bytes, extension, markdownOutput, beforePrivacy) {
  const before = Buffer.from(bytes), options = contract(markdownOutput);
  const result = await extractSourceForPrivacy(bytes, extension, { contentOptions: options, convertBuffer: async input => {
    assert.deepEqual(input, before);
    const actual = extractMarkdownBuffer(input, extension, { markdownOutput, partialExtraction: true });
    return createMarkdownExtraction({ source_type: extension.slice(1), markdown: actual.markdown,
      coverage: actual.coverage, content_options: options });
  } });
  assert.deepEqual(bytes, before); beforePrivacy?.();
  return anonymizeMarkdown(result.markdown, 'general', { productChannel: 'standalone', contentOptions: options });
}

test('closed reason vocabularies agree and include the nonblocking normalization notice', () => {
  assert.deepEqual(COVERAGE_REASON_CODES, neutral.COVERAGE_REASON_CODES);
  assert.equal(COVERAGE_REASON_CODES.length, 31); assert.equal(new Set(COVERAGE_REASON_CODES).size, 31);
  assert.ok(COVERAGE_REASON_CODES.includes('OCR_READING_DISAGREEMENT'));
  assert.ok(COVERAGE_REASON_CODES.includes('IMAGE_DOWNSAMPLED'));
  assert.ok(COVERAGE_REASON_CODES.includes('XLSX_CONTROL_CHARACTERS_PROJECTED'));
  assert.ok(COVERAGE_REASON_CODES.includes('OFFICE_TABLE_LAYOUT_NORMALIZED'));
  assert.ok(COVERAGE_REASON_CODES.includes(marker));
  assert.ok(!COVERAGE_REASON_CODES.includes('DOCX_TABLE_CONTEXT_UNVERIFIED'));
  assert.ok(COVERAGE_REASON_CODES.every((value, i, values) => !i || values[i - 1] < value));
  for (const create of [createMarkdownExtraction, value => neutral.createSourceExtraction(value, 8000000)]) {
    assert.throws(() => create({ source_type: 'docx', markdown: 'FHIR', coverage: { status: 'incomplete', reason_codes: ['DOCX_TABLE_CONTEXT_UNVERIFIED'] } }));
  }
});

testAsync('original 450x450 XLSX countercase is now bounded and protected without a layout refusal', async () => {
  const bytes = xlsx(true), before = Buffer.from(bytes);
  const converted = extractMarkdownBuffer(bytes, '.xlsx', { markdownOutput: 'content-v1', partialExtraction: true });
  assert.ok(!converted.coverage.reason_codes.includes(marker)); assert.match(converted.markdown, /Zelle A1/u);
  assert.ok(converted.coverage.reason_codes.includes('OFFICE_TABLE_LAYOUT_NORMALIZED'));
  assert.match(converted.markdown, /Zelle A2/u); assert.match(converted.markdown, /Zeile 450/u);
  assert.equal(converted.markdown.split('Qvx').length-1,1);
  assert.ok(converted.markdown.length < 80000, 'source-cell sections, no N*N expansion');
  let calls = 0;
  const result=await boundPrivacy(bytes, '.xlsx', 'content-v1', () => calls++);
  assert.doesNotMatch(result.text,/Qvx/u);assert.match(result.text,/PERSON_|FIELD_REDACTED/u);
  assert.equal(calls, 1); assert.deepEqual(bytes, before);
});

for (const profile of ['content-v1', 'notes-v1']) {
  testAsync(`${profile}: ordinary compact XLSX and real-slide table controls still mask the short Name value`, async () => {
    for (const [bytes, extension] of [[xlsx(false), '.xlsx'], [pptx(), '.pptx']]) {
      const converted = extractMarkdownBuffer(bytes, extension, { markdownOutput: profile, partialExtraction: true });
      assert.ok(!converted.coverage.reason_codes.includes(marker));
      const result = await boundPrivacy(bytes, extension, profile);
      assert.ok(!result.text.includes('Qvx')); assert.ok(result.text.includes('[PERSON_')); assert.equal(result.passes, 1);
    }
  });
  for (const owner of ['layout', 'master']) {
    testAsync(`${profile}: reached active inherited ${owner} table is retained but cannot authorize anonymization`, async () => {
      const bytes = pptx({ owner }), before = Buffer.from(bytes);
      const converted = extractMarkdownBuffer(bytes, '.pptx', { markdownOutput: profile, partialExtraction: true });
      assert.equal(converted.coverage.reason_codes.includes(marker),profile==='notes-v1');
      if(profile==='notes-v1')assert.equal(converted.markdown.split('Name').length - 1, 1);
      else assert.equal((converted.markdown.match(/\| --- \|\n\| Name \|/gu)||[]).length,1,'original header value occurs once');
      assert.equal(converted.markdown.split('Qvx').length - 1, 1);
      assert.ok(converted.markdown.includes('FHIR'));
      let calls = 0;
      if(profile==='notes-v1'){
        await assert.rejects(boundPrivacy(bytes, '.pptx', profile, () => calls++), { code: 'PARSER_COVERAGE_UNVERIFIED' });
        assert.equal(calls, 0);
      }else{
        const actual=await boundPrivacy(bytes,'.pptx',profile,()=>calls++);
        assert.doesNotMatch(actual.text,/Qvx/u);assert.match(actual.text,/FHIR/u);assert.equal(calls,1);
      }
      assert.deepEqual(bytes, before);
    });
    testAsync(`${profile}: unselected MC ${owner} table contributes neither a context flag nor text`, async () => {
      const bytes = pptx({ owner, unselected: true });
      const converted = extractMarkdownBuffer(bytes, '.pptx', { markdownOutput: profile, partialExtraction: true });
      assert.ok(!converted.coverage.reason_codes.includes(marker)); assert.ok(!converted.markdown.includes('Qvx'));
      assert.ok(!converted.markdown.includes('Name')); assert.ok(converted.markdown.includes('SAFEFALLBACK'));
      const result = await boundPrivacy(bytes, '.pptx', profile); assert.ok(result.text.includes('SAFEFALLBACK'));
    });
  }
  test(`${profile}: orphan/unreached inherited table is not marked or swept into the source`, () => {
    const converted = extractMarkdownBuffer(pptx({ owner: 'layout', reached: false }), '.pptx', { markdownOutput: profile, partialExtraction: true });
    assert.ok(!converted.coverage.reason_codes.includes(marker)); assert.ok(!converted.markdown.includes('Qvx'));
  });
}

test('notes inherited text retains source-bearing spaces, tabs, CR/LF and editor-prompt text', () => {
  const value = '  Äß\tEINS\r\nZWEI  ';
  const source = pptx({ owner: 'none', prose: value });
  const parsed = parseOoxml(source, '.pptx', undefined, { preserveText: true });
  assert.ok(parsed.markdown.includes('  Äß\tEINS\r\nZWEI  '));
  const prompt = pptx({ owner: 'none', prose: 'Second level', placeholder: true });
  assert.ok(extractMarkdownBuffer(prompt, '.pptx', { markdownOutput: 'notes-v1' }).markdown.includes('Second level'));
  assert.ok(!extractMarkdownBuffer(prompt, '.pptx', { markdownOutput: 'content-v1' }).markdown.includes('Second level'));
});

test('parser-owned context is fresh per call and cannot be set by a literal source marker or caller object', () => {
  const supplied = { unverified: true }, options = { preserveText: true, contentMode: true, officeTableContext: supplied };
  assert.ok(parseOoxml(xlsx(true), '.xlsx', undefined, options).warnings.includes('OFFICE_TABLE_LAYOUT_NORMALIZED'));
  assert.ok(!parseOoxml(xlsx(false), '.xlsx', undefined, options).warnings.includes(marker));
  assert.deepEqual(supplied, { unverified: true });
  const literal = extractMarkdownBuffer(pptx({ owner: 'none', prose: marker }), '.pptx', { markdownOutput: 'content-v1' });
  assert.ok(!literal.coverage.reason_codes.includes(marker));
});

function complexWord(rows) {
  const { reviewDocx,paragraph }=require('./lib/docx-review-fixtures');
  return reviewDocx('<w:tbl><w:tblGrid>'+ '<w:gridCol/>'.repeat(4)+'</w:tblGrid>'+rows.map((values,index)=>
    '<w:tr>'+(index===0?'<w:trPr><w:tblHeader/></w:trPr>':'')+values.map((value,column)=>'<w:tc>'+ (column===2?
      `<w:tcPr><w:gridSpan w:val="2"/><w:vMerge w:val="${index?'continue':'restart'}"/></w:tcPr>`:'')+paragraph(value)+'</w:tc>').join('')+'</w:tr>').join('')+'</w:tbl>');
}
function nonanchorXlsx(){
  return zipStore([...opcControlEntries('xlsx', { additionalOverrides: [{ part: 'xl/worksheets/sheet1.xml',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml' }] }),
    ['xl/workbook.xml',`<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Synthetic" sheetId="1" r:id="s"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',relationships(relation('s','worksheet','worksheets/sheet1.xml'))],
    ['xl/worksheets/sheet1.xml',`<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Fachtext</t></is></c><c r="B1" t="inlineStr"><is><t>Name</t></is></c></row><row r="2"><c r="B2" t="inlineStr"><is><t>Qvx</t></is></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>`]]);
}
for(const profile of ['general','personnel_profile'])for(const [label,bytes,extension,secret] of [
  ['unmarked header transition',complexWord([['Name','Name','Fachtext'],['Qvx','Rtz','FHIR'],['Company','Status','Kommentar'],['Ryx','Tzx','Java']]),'.docx','Tzx'],
  ['repeated same-row sensitive key',complexWord([['Name','Fachtext','Status'],['Qvx','FHIR','Open'],['Name','Rtz','Rust']]),'.docx','Rtz'],
  ['real text-bearing XLSX nonanchor',nonanchorXlsx(),'.xlsx','Qvx']
])testAsync(`${profile}: ${label} reaches real publication verification without releasing short values`,async()=>{
  const original=Buffer.from(bytes),contentOptions=contract('content-v1');
  const source=await extractSourceForPrivacy(bytes,extension,{contentOptions,convertBuffer:async input=>{
    const actual=extractMarkdownBuffer(input,extension,{markdownOutput:'content-v1',partialExtraction:true});
    assert.ok(!actual.coverage.reason_codes.includes(marker));
    return createMarkdownExtraction({source_type:extension.slice(1),markdown:actual.markdown,coverage:actual.coverage,content_options:contentOptions});
  }});
  const prepared=prepareTextPrivacyReview({text:source.markdown,profile,productChannel:'standalone',
    consumerOptions:{productChannel:'standalone',contentOptions},registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
  const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'});
  const final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
  assert.ok(!final.markdown.includes(secret),secret);
  assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
  assert.ok(entityPlanFromTrace(final.transform_trace).occurrences.length>0);
  const proofInput={markdown:final.markdown,profile,content_options:contentOptions,source_extraction:source.sourceExtraction,
    dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates};
  assert.ok(verifyAnonymizedPublication(proofInput));
  const entities=initialEntities({markdown:final.markdown,transform_trace:final.transform_trace});
  const target=entities.find(row=>row.original.includes(secret));assert.ok(target);
  const kept=applyEntityDecisions(final.markdown,entities,[{entity_id:target.entity_id,decision:'keep'}],Buffer.alloc(32,9));
  assert.throws(()=>verifyAnonymizedPublication({...proofInput,markdown:kept.markdown}),{code:'STANDALONE_PUBLICATION_INVALID'});
  assert.deepEqual(bytes,original);
});

done();
