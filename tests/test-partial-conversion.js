'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const contract = require('../plugins/data-secure/server/standalone/markdown-contract');
const neutral = require('../plugins/data-secure/server/core/source-extraction-contract');
const { preparePartialOfficeImagePlan, prepareOfficeImagePlan, appendOfficeOcr } = require('../plugins/data-secure/server/standalone/office-image-ocr');
const { encodePng } = require('../plugins/data-secure/server/images/png');
const readable = require('../plugins/data-secure/server/standalone/readable-markdown');
const { pdfOcrAction } = require('../plugins/data-secure/server/core/content-ocr-plan');
const { nativeTextSeparator,nativeColumnOrder,renderPdfOcrLayer } = require('../plugins/data-secure/server/standalone/pdf-text-layout');
const visuals = require('../plugins/data-secure/server/standalone/markdown-visuals');
const metadata = require('../plugins/data-secure/server/core/private-document-metadata');
const { contactSpans } = require('../plugins/data-secure/server/core/ocr-contact-review');
const { contactQuality } = require('../plugins/data-secure/server/standalone/ocr-quality');
const { MAX_UNITS } = require('../plugins/data-secure/server/standalone/conversion-checkpoints');
const errors = new Set(require('../plugins/data-secure/server/core/conversion-worker-contract').ERROR_CODES);
const options = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: true };
const off = { ...options, scanOcr: false, imageOcr: false };
const fail = code => { throw Object.assign(new Error(code), { code }); };
let passed = 0;
async function check(name, fn) { await fn(); passed++; process.stdout.write(`PASS ${name}\n`); }
const tiny = encodePng({ width: 1, height: 1, rgba: Buffer.from([255,255,255,255]) });
const attachment = (extension, data, index = 0) => ({ type: 'image', extension,
  mimeType: ({png:'image/png',emf:'image/x-emf',wmf:'image/x-wmf',svg:'image/svg+xml',gif:'image/gif',tif:'image/tiff',tiff:'image/tiff',webp:'image/webp'})[extension]||'image/unsupported',
  source_part: `word/media/image${index}.${extension}`, data: data.toString('base64') });

async function main() {
  await check('closed partial vocabulary is shared, bounded and never authorizes complete coverage', () => {
    assert.deepEqual(contract.COVERAGE_REASON_CODES, neutral.COVERAGE_REASON_CODES);
    assert.equal(contract.COVERAGE_REASON_CODES.length, 27);
    assert.equal(new Set(contract.COVERAGE_REASON_CODES).size, 27);
    assert.ok(contract.COVERAGE_REASON_CODES.every((code, index, codes) => index === 0 || codes[index - 1] < code),
      'both closed vocabularies must be strictly ascending, not merely equal as unsorted lists');
    for (const code of contract.COVERAGE_REASON_CODES.filter(code => code !== 'OCR_CONTACT_VALUES_UNVERIFIED')) {
      const input = { source_type: 'pptx', markdown: 'Ä Ö Ü ß 中文 §', content_options: options,
        coverage: { status: 'incomplete', reason_codes: [code] } };
      assert.equal(contract.createMarkdownExtraction(input).markdown, input.markdown);
      assert.throws(() => contract.createMarkdownExtraction({ ...input, coverage: { ...input.coverage, status: 'complete' } }));
    }
  });
  await check('Office visual families are planned without decoder execution; unknown formats retain explicit omissions', () => {
    for (const ext of ['emf','wmf','svg','gif','tiff','tif','webp','other']) {
      const rows = [attachment('png', tiny), attachment(ext, Buffer.from('not executable'), 1), attachment('png', tiny, 2)];
      const plan = preparePartialOfficeImagePlan(rows);
      assert.deepEqual(plan.map(item => item.ordinal), [1,2,3]);
      if(ext==='other'){assert.match(plan[1].reason,/^OFFICE_IMAGE_FORMAT_OTHER_UNSUPPORTED$/u);assert.equal(plan[1].bytes,undefined);}
      else {assert.equal(plan[1].reason,undefined);assert.equal(plan[1].visual,true);assert.ok(plan[1].bytes.equals(Buffer.from('not executable')));}
      assert.throws(() => prepareOfficeImagePlan(rows), { code: 'OFFICE_IMAGE_OCR_UNAVAILABLE' });
      for (const item of plan) item.bytes?.fill(0);
    }
  });
  await check('damaged and over-budget images preserve subsequent bounded raster and original ordinals', () => {
    const large = Buffer.from(tiny); large.writeUInt32BE(4000,16); large.writeUInt32BE(10000,20);
    const plan = preparePartialOfficeImagePlan([attachment('png',Buffer.from('bad')), attachment('png',large,1), attachment('png',tiny,2)]);
    assert.equal(plan[0].reason,'IMAGE_CONTENT_DAMAGED'); assert.equal(plan[1].reason,'IMAGE_PROCESSING_LIMIT');
    assert.equal(plan[2].ordinal,3); assert.ok(plan[2].bytes.equals(tiny)); plan[2].bytes.fill(0);
    assert.throws(() => preparePartialOfficeImagePlan([attachment('png',tiny),attachment('png',tiny)]), { code:'CONVERSION_INPUT_INVALID' });
  });
  await check('omission placeholders preserve OCR provenance and exact non-ASCII offsets', () => {
    const native = contract.createMarkdownExtraction({ source_type:'docx', markdown:'Ä😀 native',
      coverage:{status:'complete',reason_codes:[]} });
    const empty = contract.createMarkdownExtraction({source_type:'docx',markdown:'',content_options:options,
      coverage:{status:'incomplete',reason_codes:['OFFICE_IMAGE_FORMAT_EMF_UNSUPPORTED']} });
    const contact = { kind:'email',page:1,line:1,start:0,end:17 };
    // Use the real contact span builder, not a guessed shape or absolute index.
    const text = 'a@example.invalid';
    const spans = contactSpans(text,contactQuality(null,text));
    assert.ok(spans.length);
    const image = contract.createMarkdownExtraction({source_type:'docx',markdown:text,content_options:options,
      ocr_contacts:spans,coverage:{status:'incomplete',reason_codes:['OCR_CONTACT_VALUES_UNVERIFIED','OCR_NOT_VERIFIED']} });
    const result = appendOfficeOcr(native,[empty,image],options);
    assert.equal(result.ocr_contacts[0].page,2);
    assert.equal(result.markdown.slice(result.ocr_contacts[0].start,result.ocr_contacts[0].end),text);
    assert.ok(result.coverage.reason_codes.includes('OFFICE_IMAGE_FORMAT_EMF_UNSUPPORTED'));
    assert.throws(() => appendOfficeOcr({ ...native,markdown:'' },[empty],options), {code:'CONVERSION_OCR_TEXT_EMPTY'});
    assert.equal(contact.page,1);
  });

  // Execute the actual production function with deterministic PDF.js boundaries.
  // This is a causal source test, not a native PDF.js / Mac execution claim.
  const source = fs.readFileSync(path.join(__dirname,'../plugins/data-secure/server/standalone/conversion-worker-child.js'),'utf8');
  const start = source.indexOf('async function pdfMarkdown('), end = source.indexOf('\nasync function main()',start);
  assert.ok(start > 0 && end > start);
  const importExpression = "await import(pathToFileURL(path.join(pdfRoot, 'legacy', 'build', 'pdf.datasecure.mjs')).href)";
  const functionSource = source.slice(start,end); assert.equal(functionSource.split(importExpression).length,2);
  const omissionStart = source.indexOf('function imageOmission('), omissionEnd = source.indexOf('\nfunction visualOmission(',omissionStart);
  assert.ok(omissionEnd>omissionStart,'closed helper slice, not an adjacent declaration');
  await check('actual Office worker refuses an empty no-media native unit instead of returning a generated or empty success',async()=> {
    const officeStart = source.indexOf('async function officeImageMarkdown('), officeEnd = source.indexOf('\nasync function markdownRasterImages(',officeStart);
    assert.ok(officeStart > 0 && officeEnd > officeStart);
    for (const [markdown,reasons,expected] of [
      ['', ['TEXT_LIMIT_PARTIAL'],'TEXT_TOO_LARGE'],
      ['', [],'CONVERSION_OCR_TEXT_EMPTY'],
      ['Behaltener Text äöüß', ['TEXT_LIMIT_PARTIAL'],null]
    ]) {
      const frames=[],extraction=contract.createMarkdownExtraction({source_type:'pptx',markdown,
        coverage:{status:reasons.length?'incomplete':'complete',reason_codes:reasons}});
      const context={fail,extractOfficeMarkdownAndMedia:()=>({extraction,attachments:[]}),preparePartialOfficeImagePlan,
        createMarkdownExtraction:input=>contract.createMarkdownExtraction(JSON.parse(JSON.stringify(input)))};
      const operation=vm.runInNewContext(`(${source.slice(officeStart,officeEnd)})`,context);
      const result=operation(Buffer.from('owned synthetic source'),'pptx',{},options,
        async(value,index)=>{contract.validateMarkdownExtractionForOptions(value,options);frames.push({value,index});});
      if(expected)await assert.rejects(result,{code:expected});
      else assert.equal((await result).markdown,markdown);
      assert.equal(frames.length,1);assert.equal(frames[0].value.markdown,markdown);
    }
  });
  function page(text, overrides = {}) {
    return { getTextContent:async()=>({items:text ? [{str:text,hasEOL:true}] : [],styles:{}}),
      getOperatorList:async()=>({fnArray:[]}),getViewport:()=>({width:400,height:300}),cleanup(){},...overrides };
  }
  async function run(pages, contentOptions = options, extra = {}) {
    const frames = []; let destroyed = 0;
    const document = { numPages:pages.length,getPermissions:async()=>null,hasJSActions:async()=>false,
      getFieldObjects:async()=>null,getAttachments:async()=>null,getOutline:async()=>null,
      getMetadata:async()=>({metadata:null,info:{}}),getPage:async number=> {
        const value = pages[number-1]; if (value instanceof Error) throw value; return value;
      },...extra.document };
    const context = { path,root:'isolated-local-runtime',errors,fail,MAX_UNITS,...contract,...readable,...visuals,...metadata,
      createMarkdownExtraction:input=>contract.createMarkdownExtraction(JSON.parse(JSON.stringify(input))),
      validatePrivateDocumentMetadata:input=>metadata.validatePrivateDocumentMetadata(JSON.parse(JSON.stringify(input))),
      populated:value=>Boolean(value && (typeof value !== 'object' || Object.keys(value).length)),
      pdfOcrAction:(opts,facts)=>pdfOcrAction(opts,JSON.parse(JSON.stringify(facts))),nativeTextSeparator,nativeColumnOrder,renderPdfOcrLayer,contactQuality,contactSpans,
      mockModule:{ OPS:{paintImageXObject:1},AnnotationMode:{DISABLE:0},getDocument:()=>({promise:Promise.resolve(document),destroy:async()=>{destroyed++;}}) },
      dimensions(){},canvasApi:()=>({createCanvas:()=>({getContext:()=>({})})}),
      classifyPdfTextVisibility:async()=>({wordRegions:[]}),paintedTextGeometryAvailable:()=>false,
      nativeTextRegions:()=>[],nativeSingleTokenRegions:()=>[],createOcr:async()=>({terminate:async()=>{},setParameters:async value=>assert.ok(['3','6'].includes(value.tessedit_pageseg_mode))}),
      recognize:async()=>fail('CONVERSION_OCR_FAILED'),attachContactCrops:spans=>spans,Uint8Array,Set,Boolean,
      ...extra.context };
    context.imageOmission = vm.runInNewContext(`(${source.slice(omissionStart,omissionEnd)})`,context);
    const operation = vm.runInNewContext(`(${functionSource.replace(importExpression,'mockModule')})`,context);
    try { return { result:await operation(Buffer.from('%PDF-test'),true,'content-v1',contentOptions,
      async(result,index)=>{ contract.validateMarkdownExtractionForOptions(result,contentOptions); frames.push({result,index}); }),frames }; }
    finally { assert.equal(destroyed,1); }
  }
  await check('PDF raster failure keeps the fully validated search text and proceeds to next page',async()=> {
    const output = await run([page('Erster Ä ß',{getOperatorList:async()=>{throw new Error('damaged image');}}),page('Zweiter')]);
    assert.match(output.result.markdown,/Erster Ä ß/u); assert.match(output.result.markdown,/Zweiter/u);
    assert.ok(output.result.coverage.reason_codes.includes('PDF_IMAGE_NOT_READ'));
    assert.deepEqual(output.frames.map(row=>row.index),[0,0,1,1]);
  });
  await check('PDF failed page is omitted whole; no unvalidated string prefix escapes',async()=> {
    const output = await run([page('Sicher'),page('',{getTextContent:async()=>({items:[{str:'UNTRUSTED PREFIX'},{str:42}]})}),page('Danach')]);
    assert.match(output.result.markdown,/Sicher/u); assert.match(output.result.markdown,/Danach/u);
    assert.doesNotMatch(output.result.markdown,/UNTRUSTED|Seite 2/u);
    assert.ok(output.result.coverage.reason_codes.includes('PDF_PAGE_NOT_READ'));
  });
  await check('PDF getPage failure preserves other independent pages and empty pages do not fake results',async()=> {
    const output = await run([page('Sicher'),new Error('bad page')]);
    assert.match(output.result.markdown,/Sicher/u); assert.ok(output.result.coverage.reason_codes.includes('PDF_PAGE_NOT_READ'));
    await assert.rejects(run([page('')],off),{code:'PDF_TEXT_UNAVAILABLE_BY_POLICY'});
  });
  await check('PDF model/policy and explicit OCR scope failures stay hard despite native text',async()=> {
    await assert.rejects(run([page('native',{getOperatorList:async()=>fail('CONVERSION_POLICY_FAILED')})]),{code:'CONVERSION_POLICY_FAILED'});
    await assert.rejects(run([page('native',{getOperatorList:async()=>({fnArray:[1]})})],{...options,scanOcr:false}),{code:'PDF_OCR_SCOPE_REQUIRED'});
    await assert.rejects(run([page('native',{getOperatorList:async()=>{throw new Error('broken');}})],null),{code:'PDF_EXTRACTION_FAILED'});
  });
  await check('PDF OCR failure keeps native text without inventing contact verification',async()=> {
    const output = await run([page('Kontakt nativ',{getOperatorList:async()=>({fnArray:[1]}),render:()=>({promise:Promise.resolve()})})]);
    assert.match(output.result.markdown,/Kontakt nativ/u); assert.ok(output.result.coverage.reason_codes.includes('IMAGE_OCR_FAILED'));
    assert.equal(output.result.ocr_contacts,undefined);
  });
  await check('PDF page header cannot discard earlier validated pages at the unchanged text limit',async()=> {
    const output = await run([page('a'.repeat(7_999_980)),page('abc')],off);
    assert.equal(output.result.markdown,output.frames[0].result.markdown);
    assert.ok(output.result.markdown.length > 7_999_980 && output.result.markdown.length <= 8_000_000);
    assert.doesNotMatch(output.result.markdown,/abc/u);
    assert.ok(output.result.coverage.reason_codes.includes('TEXT_LIMIT_PARTIAL'));
    assert.equal(output.frames.at(-1).index,1); assert.equal(output.frames.at(-1).result.markdown,'');
  });
  await check('actual model and component initializers normalize missing/corrupt runtime data to hard codes',async()=> {
    const modelStart = source.indexOf('function checkedModels('), modelEnd = source.indexOf('\nasync function createOcr()',modelStart);
    const ocrStart = modelEnd + 1, ocrEnd = source.indexOf('\nasync function recognize(',ocrStart);
    const modelSource = source.slice(modelStart,modelEnd), ocrSource = source.slice(ocrStart,ocrEnd);
    for (const readFileSync of [()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'});},()=>'{invalid JSON}']) {
      const context = {fs:{readFileSync},root:'owned-runtime',path,fail};
      const checkedModels = vm.runInNewContext(`(${modelSource})`,context);
      assert.throws(checkedModels,{code:'CONVERSION_MODEL_INVALID'});
      await assert.rejects(run([page('native',{getOperatorList:async()=>({fnArray:[1]}),render:()=>({promise:Promise.resolve()})})],options,
        {context:{createOcr:vm.runInNewContext(`(${ocrSource})`,{...context,checkedModels})}}),{code:'CONVERSION_MODEL_INVALID'});
    }
    const missingComponent = vm.runInNewContext(`(${ocrSource})`,{checkedModels(){},fail,
      localRequire(){throw Object.assign(new Error('missing'),{code:'MODULE_NOT_FOUND'});} });
    await assert.rejects(missingComponent(),{code:'CONVERSION_POLICY_FAILED'});
  });
  await check('PDF producer stops before unit 10001 without invalidating 10000 completed pages',async()=> {
    assert.equal(MAX_UNITS,10000);
    let requested = 0;
    const one = page('bounded');
    const output = await run(Array.from({length:MAX_UNITS+1},()=>one),off,
      {document:{getPage:async()=>{requested++;return one;}}});
    assert.equal(requested,MAX_UNITS); assert.equal(output.frames.at(-1).index,MAX_UNITS-1);
    assert.ok(output.result.coverage.reason_codes.includes('CONVERSION_RESOURCE_LIMIT_PARTIAL'));
    assert.match(output.result.markdown,/Seite 10000/u); assert.doesNotMatch(output.result.markdown,/Seite 10001/u);
  });
  process.stdout.write(`${passed} partial source groups passed; no native desktop claimed\n`);
}
main().catch(error=>{process.stderr.write(`${error.stack}\n`);process.exitCode=1;});
