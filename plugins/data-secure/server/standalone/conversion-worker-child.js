'use strict';

const { createConversionTimings, serializeConversionTimings } = require('./conversion-timings');
const conversionTimings = createConversionTimings();
const runtimeInitialized = conversionTimings.begin('runtime_init');

// One owned process per source. OCR uses worker_threads inside this process;
// there are no detached children, source paths, network reads or raw temp files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { extractMarkdownBuffer, extractOfficeMarkdownAndMedia } = require('./markdown-extractor');
const { prepareOfficeImagePlan, preparePartialOfficeImagePlan, appendOfficeOcr, officeOcrCheckpoint } = require('./office-image-ocr');
const {decodeOfficeVisual}=require('./office-visual-decoder');
const { officeVisualOmission } = require('./office-visual-omission');
const { createCheckpointEmitter, MAX_UNITS } = require('./conversion-checkpoints');
const { markdownImageContent, extractMarkdownImageMedia } = require('./markdown-image-content');
const { createMarkdownExtraction, MAX_MARKDOWN_CHARS } = require('./markdown-contract');
const { unreadableSymbolRun, cleanExtractedSymbolText } = require('./markdown-visuals');
const { contactQuality } = require('./ocr-quality');
const { readableText, readableNotice } = require('./readable-markdown');
const { refineOcr } = require('./ocr-refinement');
const { assessExtraOfficeOcrRaster, createOfficeOcrWorkLedger } = require('../core/office-ocr-work-plan');
const { contactSpans } = require('../core/ocr-contact-review');
const { attachContactCrops } = require('./ocr-contact-crops');
const { sourceCropBlocks } = require('./ocr-crop-geometry');
const { nativeTextSeparator, nativeColumnOrder, taggedPdfTextLayout, renderPdfOcrLayer, paintedTextGeometryAvailable, nativeTextRegions, nativeSingleTokenRegions, uncoveredOcrText } = require('./pdf-text-layout');
const { projectTaggedPdf } = require('./pdf-structure-projection');
const { classifyPdfTextVisibility } = require('./pdf-text-visibility');
const { renderPdfNativeWordEvidence } = require('./pdf-ocr-native-words');
const { SOURCE_TYPES, ERROR_CODES, MAX_INPUT_BYTES } = require('../core/conversion-worker-contract');
const { decodeRasterPng } = require('./png-raster-decoder');
const { decodeBmp } = require('../images/bmp');
const { MAX_PIXELS, MAX_IMAGE_BYTES } = require('../images/common');
const { validateContentOptions, serializeContentOptions } = require('../core/content-options');
const { pdfOcrAction } = require('../core/content-ocr-plan');
const { pdfOcrLayoutMode } = require('./pdf-ocr-layout-mode');
const { PDF_KEYS, selectOptionalPrivatePdfMetadata } = require('../core/private-document-metadata');
const { createPassivePdfContent } = require('./pdf-passive-content');
const root = path.join(__dirname, 'conversion-runtime');
const localRequire = createRequire(path.join(root, 'package.json'));
const fail = code => { throw Object.assign(new Error(code), { code }); };
const errors = new Set(ERROR_CODES);
let requestedContentOptions;
// Vendor console messages must not contaminate the framed response or logs.
for (const method of ['log', 'info', 'warn', 'error', 'debug']) console[method] = () => {};
runtimeInitialized();

function canvasApi() {
  try {
    if (localRequire('@napi-rs/canvas/package.json').version !== '1.0.7') fail('CONVERSION_POLICY_FAILED');
    return localRequire('@napi-rs/canvas');
  } catch { fail('CONVERSION_POLICY_FAILED'); }
}
function dimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    fail('CONVERSION_PIXEL_LIMIT');
  }
}
function checkedModels() {
  const measured = conversionTimings.begin('model_check');
  try {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'models.lock.json'), 'utf8'));
  for (const language of ['deu', 'eng']) {
    const expected = lock.models?.[language];
    if (expected?.file !== `${language}.traineddata` || !/^[a-f0-9]{64}$/u.test(expected.sha256)) fail('CONVERSION_MODEL_INVALID');
    const model = fs.readFileSync(path.join(root, 'models', expected.file));
    if (model.length !== expected.bytes || crypto.createHash('sha256').update(model).digest('hex') !== expected.sha256) fail('CONVERSION_MODEL_INVALID');
  }
  } catch { fail('CONVERSION_MODEL_INVALID'); } finally { measured(); }
}

async function createOcr() {
  const measured = conversionTimings.begin('ocr_init');
  try {
  checkedModels();
  try {
  if (localRequire('tesseract.js/package.json').version !== '7.0.0') fail('CONVERSION_POLICY_FAILED');
  const { createWorker, OEM } = localRequire('tesseract.js');
  process.stderr.write('CONVERSION_OCR_STARTING\n');
  const worker = await createWorker(['deu', 'eng'], OEM.LSTM_ONLY, {
    langPath: path.join(root, 'models'), cacheMethod: 'none', gzip: false, logging: false,
    logger() {}, errorHandler() {}
  });
  process.stderr.write('CONVERSION_OCR_READY\n');
  return worker;
  } catch { fail('CONVERSION_POLICY_FAILED'); }
  } finally { measured(); }
}

async function recognize(canvas, ocr, nativeRegions = [], singleTokenOnly = false, officeWork) {
  // Keep word confidence local to this isolated worker. A high whole-page
  // confidence does not establish that a contact value was read correctly.
  let result, enlarged, selectedCanvas = canvas, rasterDisagreement = false;
  const read = async raster => {
    let value;
    try { value = await conversionTimings.measureAsync('ocr', () => ocr.recognize(raster.toBuffer('image/png'), {}, { text: true, blocks: true })); }
    catch (cause) { if (cause?.code !== undefined) throw cause; fail('CONVERSION_OCR_FAILED'); }
    if (typeof value?.data?.text !== 'string') fail('CONVERSION_OCR_FAILED');
    if (value.data.text.length > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
    return value;
  };
  try {
    result = await read(canvas);
    if (officeWork?.facts.kind && !nativeRegions.length) {
      // These geometry-only records come from this exact primary OCR/raster.
      // The model never receives filenames, expected words or confidence scores.
      const lines = [];
      let words = 0, overflow = !Array.isArray(result.data.blocks);
      outer: for (const block of Array.isArray(result.data.blocks) ? result.data.blocks : []) {
        if (!Array.isArray(block?.paragraphs)) { overflow = true; break; }
        for (const paragraph of block.paragraphs) {
          if (!Array.isArray(paragraph?.lines)) { overflow = true; break outer; }
          for (const line of paragraph.lines) {
            if (!Array.isArray(line?.words) || lines.length >= 2000 || words + line.words.length > 5000) { overflow = true; break outer; }
            const box = value => value && ({ x0: value.x0, y0: value.y0, x1: value.x1, y1: value.y1 });
            words += line.words.length;
            lines.push({ box: box(line.bbox), words: line.words.map(word => box(word?.bbox)) });
          }
        }
      }
      const candidate = !overflow && assessExtraOfficeOcrRaster(officeWork.facts, lines);
      if (candidate?.eligible && officeWork.ledger.reserveUpscale(officeWork.assetId, candidate).admitted === true) {
        enlarged = canvasApi().createCanvas(candidate.targetWidth, candidate.targetHeight);
        const context = enlarged.getContext('2d');
        context.fillStyle = 'white'; context.fillRect(0, 0, enlarged.width, enlarged.height);
        context.drawImage(canvas, 0, 0, enlarged.width, enlarged.height);
        const additional = await read(enlarged);
        rasterDisagreement = additional.data.text !== result.data.text;
        // The predetermined geometric policy selects the larger raster, never a
        // score/expected value. An empty second reading cannot erase usable text.
        if (additional.data.text.trim()) { result = additional; selectedCanvas = enlarged; }
      }
    }
    const data = nativeRegions.length ? result.data : await conversionTimings.measureAsync('refinement', () =>
      refineOcr(result.data, selectedCanvas, ocr, canvasApi().createCanvas, officeWork ? { contactOnly: true } : undefined));
    if (data.text.length > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
    const recognized = cleanExtractedSymbolText(nativeRegions.length ? uncoveredOcrText(data, nativeRegions, { singleTokenOnly }) : data.text);
    const readingDisagreement = rasterDisagreement || (Array.isArray(data.blocks) && data.blocks.some(block =>
      Array.isArray(block?.paragraphs) && block.paragraphs.some(paragraph =>
        Array.isArray(paragraph?.lines) && paragraph.lines.some(line => line?.reading_disagreement === true))));
    return { ...recognized, quality: contactQuality(data, recognized.text), wordData: data.blocks,
      readingDisagreement, rasterWidth: selectedCanvas.width, rasterHeight: selectedCanvas.height,
      cropText: nativeRegions.length ? null : data.text };
  } finally { if (enlarged) { enlarged.width = 1; enlarged.height = 1; } }
}

function hasRasterContrast(canvas) {
  const context = canvas.getContext('2d');
  const maximumPixelsPerRead = 1_048_576;
  const tileWidth = Math.min(canvas.width, maximumPixelsPerRead);
  const tileHeight = Math.min(canvas.height, Math.floor(maximumPixelsPerRead / tileWidth));
  let first;
  // Exact pixel fact, not a confidence/size heuristic: a uniformly colored
  // raster has no contrasting visible glyphs. Bounded reads also cover very
  // thin images without materializing a second whole-image RGBA buffer.
  for (let y = 0; y < canvas.height; y += tileHeight) {
    for (let x = 0; x < canvas.width; x += tileWidth) {
      const pixels = context.getImageData(x, y, Math.min(tileWidth, canvas.width - x),
        Math.min(tileHeight, canvas.height - y));
      try {
        const rgba = pixels.data;
        first ||= [rgba[0], rgba[1], rgba[2], rgba[3]];
        for (let index = 0; index < rgba.length; index += 4) {
          if (rgba[index] !== first[0] || rgba[index + 1] !== first[1] ||
              rgba[index + 2] !== first[2] || rgba[index + 3] !== first[3]) return true;
        }
      } finally { pixels.data.fill(0); }
    }
  }
  return false;
}

async function imageMarkdown(bytes, type, markdownOutput, contentOptions, ownedOfficeSession) {
  if (contentOptions && !contentOptions.imageOcr) fail('IMAGE_OCR_REQUIRED');
  if (bytes.length > MAX_IMAGE_BYTES) fail('INPUT_FORMAT_LIMIT');
  const { createCanvas, ImageData, loadImage } = canvasApi();
  let canvas;
  const decoded = conversionTimings.begin('image_decode');
  try {
    if (type === 'jpeg') {
      // Buffer-only API: no URL, file name or SVG input can reach loadImage.
      if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) fail('CONVERSION_IMAGE_INVALID');
      const image = await loadImage(bytes);
      dimensions(image.width, image.height);
      canvas = createCanvas(image.width, image.height);
      const context = canvas.getContext('2d');
      context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
    } else {
      const decoded = type === 'png' ? await decodeRasterPng(bytes, { createCanvas, loadImage }) : decodeBmp(bytes);
      dimensions(decoded.width, decoded.height);
      canvas = createCanvas(decoded.width, decoded.height);
      // Composite transparency against white before OCR (not black text loss).
      const rgba = Uint8ClampedArray.from(decoded.rgba);
      for (let i = 0; i < rgba.length; i += 4) {
        const alpha = rgba[i + 3];
        for (let channel = 0; channel < 3; channel++) rgba[i + channel] = Math.round((rgba[i + channel] * alpha + 255 * (255 - alpha)) / 255);
        rgba[i + 3] = 255;
      }
      canvas.getContext('2d').putImageData(new ImageData(rgba, decoded.width, decoded.height), 0, 0);
    }
  } catch (cause) { if (cause?.code !== undefined) throw cause; fail('CONVERSION_IMAGE_INVALID'); }
  finally { decoded(); }
  let downsampled=false, sourceCanvas;
  let ocr;
  try {
    const share=ownedOfficeSession?.ocrPixels;
    if(ownedOfficeSession?.ocrScale===2){
      const width=canvas.width*2,height=canvas.height*2;
      dimensions(width,height);
      if(!Number.isSafeInteger(share)||width*height>share)fail('CONVERSION_POLICY_FAILED');
      const enlarged=createCanvas(width,height);
      try{const context=enlarged.getContext('2d');context.fillStyle='white';context.fillRect(0,0,width,height);
        context.drawImage(canvas,0,0,width,height);}
      catch(cause){enlarged.width=1;enlarged.height=1;throw cause;}
      sourceCanvas=canvas;canvas=enlarged;
    }
    if(share!==undefined){
      if(!Number.isSafeInteger(share)||share<1||share>MAX_PIXELS)fail('CONVERSION_POLICY_FAILED');
      if(canvas.width*canvas.height>share){
        const scale=Math.sqrt(share/(canvas.width*canvas.height));
        let width=Math.max(1,Math.floor(canvas.width*scale)),height=Math.max(1,Math.floor(canvas.height*scale));
        // Clamping the short axis to one can undo the area bound. Correct the
        // long axis before allocation, keeping the complete image field of view.
        if(width*height>share){
          if(width>height)width=Math.max(1,Math.floor(share/height));
          else height=Math.max(1,Math.floor(share/width));
        }
        if(width*height>share||width>canvas.width||height>canvas.height)fail('CONVERSION_POLICY_FAILED');
        const smaller=createCanvas(width,height);
        try{
          const context=smaller.getContext('2d');context.fillStyle='white';context.fillRect(0,0,smaller.width,smaller.height);
          context.drawImage(canvas,0,0,smaller.width,smaller.height);
        }catch(cause){smaller.width=1;smaller.height=1;throw cause;}
        canvas.width=1;canvas.height=1;canvas=smaller;downsampled=true;
      }
    }
    let recognized;
    if (hasRasterContrast(canvas)) {
      ocr = ownedOfficeSession?.ocr || await createOcr();
      if (ownedOfficeSession) ownedOfficeSession.ocr = ocr;
      const officeWork = ownedOfficeSession?.workLedger ? {
        ledger: ownedOfficeSession.workLedger, assetId: ownedOfficeSession.assetId,
        facts: { kind: ownedOfficeSession.rasterKind, width: (sourceCanvas || canvas).width, height: (sourceCanvas || canvas).height,
          primaryWidth: canvas.width, primaryHeight: canvas.height, initialScale: ownedOfficeSession.ocrScale || 1, downsampled }
      } : undefined;
      if (officeWork) await ocr.setParameters({ tessedit_pageseg_mode: '6' });
      recognized = await recognize(canvas, ocr, [], false, officeWork);
    } else recognized = { text: '', omitted: false, quality: contactQuality(null, ''), wordData: [], cropText: '' };
    const text = recognized.text;
    if (contentOptions && !text.trim() && !ownedOfficeSession) fail('CONVERSION_OCR_TEXT_EMPTY');
    const reasons = ['OCR_NOT_VERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED'];
    if (recognized.readingDisagreement && text.trim()) reasons.push('OCR_READING_DISAGREEMENT');
    if(downsampled)reasons.push('IMAGE_DOWNSAMPLED');
    if (recognized.quality.contact_lines.length) reasons.push('OCR_CONTACT_VALUES_UNVERIFIED');
    if (!text.trim()) reasons.push('OCR_TEXT_EMPTY');
    const cropCanvas=sourceCanvas||canvas;
    const rasterWidth = recognized.rasterWidth || canvas.width, rasterHeight = recognized.rasterHeight || canvas.height;
    const cropBlocks=rasterWidth!==cropCanvas.width||rasterHeight!==cropCanvas.height
      ?sourceCropBlocks(recognized.wordData,rasterWidth,rasterHeight,cropCanvas.width,cropCanvas.height):recognized.wordData;
    const contacts = recognized.quality.contact_lines.length ? attachContactCrops(
      contactSpans(text, recognized.quality), text, cropBlocks, cropCanvas,
      ownedOfficeSession?.cropBudget || { bytes: 0 }, recognized.cropText) : [];
    const rendered = readableText(text, contacts);
    const notices = markdownOutput === 'content-v1' ? '' : readableNotice({ image: true, symbols: recognized.omitted, ocr: Boolean(text.trim()), contacts: contacts.length > 0,
      disagreement: recognized.quality.disagreement_lines.length > 0,
      lowConfidence: recognized.quality.low_confidence_lines.length > 0,
      unscored: recognized.quality.unscored_contact_lines.length > 0 });
    return createMarkdownExtraction({ source_type: type, markdown: `${rendered.markdown}${text && notices ? '\n\n' : ''}${notices}`,
      ...(contentOptions ? { content_options: contentOptions } : {}),
      ...(contacts.length ? { ocr_contacts: rendered.contacts } : {}),
      coverage: { status: 'incomplete', reason_codes: reasons.sort() } });
  } finally {
    try { if (ocr && !ownedOfficeSession) await ocr.terminate(); }
    finally {
      try { if (canvas) { canvas.width = 1; canvas.height = 1; } }
      finally { if (sourceCanvas) { sourceCanvas.width = 1; sourceCanvas.height = 1; } }
    }
  }
}

function imageOmission(cause) {
  if(cause?.code==='VISUAL_CONTENT_DAMAGED')return 'IMAGE_CONTENT_DAMAGED';
  if(cause?.code==='VISUAL_PROCESSING_LIMIT')return 'IMAGE_PROCESSING_LIMIT';
  if (['CONVERSION_IMAGE_INVALID'].includes(cause?.code)) return 'IMAGE_CONTENT_DAMAGED';
  if (['CONVERSION_PIXEL_LIMIT', 'INPUT_FORMAT_LIMIT', 'OCR_REVIEW_PAYLOAD_LIMIT'].includes(cause?.code)) return 'IMAGE_PROCESSING_LIMIT';
  if (cause?.code === 'CONVERSION_OCR_FAILED') return 'IMAGE_OCR_FAILED';
  if (cause?.code === 'TEXT_TOO_LARGE') return 'TEXT_LIMIT_PARTIAL';
  // Never reinterpret model, source, policy or isolation failures as pictures.
  return null;
}

function visualOmission(cause,type){
  return officeVisualOmission(cause?.code,type)||imageOmission(cause);
}
async function* officeRasters(item){
  if(!item.visual){yield{png:item.bytes,type:item.type,index:1,total:1,warning_codes:[]};return;}
  let font;
  let contract;
  try{contract=JSON.parse(fs.readFileSync(path.join(root,'office-graphics-contract.json'),'utf8'));
    if(contract.schema!=='datasecure-office-graphics/1'||contract.entry!=='dist/browser.js')fail('CONVERSION_POLICY_FAILED');
    font=fs.readFileSync(path.join(root,'node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'));
    if(crypto.createHash('sha256').update(font).digest('hex')!==contract.font.sha256)fail('CONVERSION_POLICY_FAILED');
  }catch{fail('CONVERSION_POLICY_FAILED');}
  try{
    const decoder=decodeOfficeVisual(item.bytes,item.type,{canvasApi:canvasApi(),fontBuffers:[font],maxOutputPixels:item.ocrPixels,
      loadBundledModule:id=>{
        try{
        if(id!=='emf-converter/dist/browser.js')fail('VISUAL_DECODER_POLICY');
        const metadata=JSON.parse(fs.readFileSync(path.join(root,'node_modules/emf-converter/package.json'),'utf8'));
        if(metadata.name!=='emf-converter'||metadata.version!=='4.18.1')fail('VISUAL_DECODER_POLICY');
        for(const file of ['package.json','dist/browser.js'])if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'node_modules/emf-converter',...file.split('/')))).digest('hex')!==contract.files[file])fail('VISUAL_DECODER_POLICY');
        return localRequire(path.join(root,'node_modules/emf-converter/dist/browser.js'));
        // The visual adapter preserves this closed policy vocabulary. A host
        // CONVERSION_* error here would be mistaken for damaged source content.
        }catch{fail('VISUAL_DECODER_POLICY');}
      }});
    // Time only each decoder advance, never the downstream OCR while a frame
    // is yielded. Forward generator return/throw so its cleanup stays owned.
    yield* { [Symbol.asyncIterator](){return this;},
      next(...args){return conversionTimings.measureAsync('image_decode',()=>decoder.next(...args));},
      return(...args){return decoder.return(...args);},throw(...args){return decoder.throw(...args);} };
  }finally{font.fill(0);}
}

async function officeImageMarkdown(bytes, type, extractionOptions, contentOptions, checkpoint) {
  // One parser supplies both text and its authorized attachment list. Do not
  // re-open ZIP media separately or read Relationship targets from disk/URLs.
  const { extraction, attachments } = conversionTimings.measure('native_extract', () => extractOfficeMarkdownAndMedia(bytes, `.${type}`, extractionOptions));
  const native = createMarkdownExtraction({ source_type: type, markdown: extraction.markdown,
    coverage: extraction.coverage, content_options: contentOptions });
  await checkpoint(native, 0);
  const plan = conversionTimings.measure('structure_ops', () => preparePartialOfficeImagePlan(attachments));
  if (!plan.length) {
    if (!extraction.markdown.trim()) fail(extraction.coverage.reason_codes.includes('TEXT_LIMIT_PARTIAL')
      ? 'TEXT_TOO_LARGE' : 'CONVERSION_EXTRACTION_FAILED');
    return native;
  }
  // Full-field OCR work remains separate from the unchanged, bounded contact
  // verification crops. Unknown frame counts cannot create spare raster work.
  const workLedger = createOfficeOcrWorkLedger(plan.filter(item => item.ordinal <= 150).map(item => {
    const bounded = Boolean(item.reason || (Number.isSafeInteger(item.width) && Number.isSafeInteger(item.height)));
    return { assetId: item.ordinal - 1, basePixels: !bounded ? null : item.reason ? 0 : item.ocrPixels, bounded };
  }));
  const session = { ocr: null, cropBudget: { bytes: 0, pixels: 0 }, workLedger };
  try {
    // imageMarkdown starts the shared session only after its image decoder has
    // accepted the first raster; metadata-only preflight is not decode proof.
    const recognized = [],placements=[],cache=new Map();
    const checkpointBudget={chars:extraction.markdown.length,contacts:0,bytes:0,pixels:0,units:extraction.markdown?1:0};
    let retainedChars=extraction.markdown.length,frameCount=0;
    for (const item of plan) {
      let results, omission = item.reason;
      if (!omission) {
        try {
          session.ocrPixels=item.ocrPixels;
          session.ocrScale=item.ocrScale||1;
          session.assetId=item.ordinal-1;
          session.rasterKind=item.visual?null:item.type;
          const key=item.type+':'+crypto.createHash('sha256').update(item.bytes).digest('hex');
          results=cache.get(key);
          if(!results){
            results=[];
            for await(const raster of officeRasters(item)){
              if(++frameCount>150){results.push({omission:'IMAGE_PROCESSING_LIMIT'});break;}
              if(raster.omission_code){results.push({omission:visualOmission({code:raster.omission_code},item.type)||'IMAGE_CONTENT_DAMAGED'});continue;}
              let result;
              try{result=await imageMarkdown(raster.png,raster.type||'png','content-v1',contentOptions,session);}
              finally{if(raster.png!==item.bytes)raster.png.fill(0);}
              if(retainedChars+result.markdown.length>MAX_MARKDOWN_CHARS){results.push({omission:'TEXT_LIMIT_PARTIAL'});continue;}
              retainedChars+=result.markdown.length;
              if(raster.warning_codes?.length)result={...result,coverage:{status:'incomplete',reason_codes:[...new Set([...result.coverage.reason_codes,
                ...(raster.warning_codes.includes('VISUAL_RASTER_DOWNSAMPLED')?['IMAGE_DOWNSAMPLED']:[]),
                ...(raster.warning_codes.some(code=>code!=='VISUAL_RASTER_DOWNSAMPLED')?['SOURCE_COVERAGE_UNVERIFIED']:[])])].sort()}};
              results.push({result,index:raster.index,total:raster.total});
            }
            cache.set(key,results);
          }
        }
        catch (cause) { omission = visualOmission(cause,item.type); if (!omission) throw cause; }
        finally {item.bytes?.fill(0);}
      }
      if(omission)(results||=[]).push({omission});
      for(const frame of results||[]){
      let result=frame.result;omission=frame.omission;
      if (omission) result = createMarkdownExtraction({ source_type: type, markdown: '', content_options: contentOptions,
        coverage: { status: 'incomplete', reason_codes: [omission] } });
      else {
        result = createMarkdownExtraction({ source_type: type, markdown: result.markdown, content_options: contentOptions,
          coverage: { status: 'incomplete', reason_codes: result.coverage.reason_codes.filter(code => code !== 'OCR_TEXT_EMPTY') },
          ...(result.ocr_contacts?.length ? { ocr_contacts: result.ocr_contacts.map(contact => ({ ...contact, page: item.ordinal })) } : {}) });
      }
      recognized.push(result);
      let occurrences=item.occurrences?.length?item.occurrences:[{after:extraction.markdown.length,kind:'document',index:1}];
      if(frame.total>1)occurrences=occurrences.map(value=>({...value,part:frame.index,parts:frame.total}));
      if(occurrences.length>1000-placements.length){
        occurrences=occurrences.slice(0,1000-placements.length);
        result={...result,coverage:{status:'incomplete',reason_codes:[...new Set([...result.coverage.reason_codes,'IMAGE_PROCESSING_LIMIT'])].sort()}};
        recognized[recognized.length-1]=result;
      }
      const checkpointOccurrences=[];
      for(const occurrence of occurrences){
        const placed={...occurrence,result:recognized.length-1,ordinal:placements.length+1};
        placements.push(placed);checkpointOccurrences.push(placed);
      }
      // An interrupted unit still identifies its real owner rather than claiming
      // a global image ordinal is a source page/slide.
      const unit=officeOcrCheckpoint(extraction,result,contentOptions,checkpointOccurrences,checkpointBudget);
      await checkpoint(unit, recognized.length);
      }
    }
    // Recognition is cached per asset; publication is per actual occurrence.
    return appendOfficeOcr(extraction, recognized, contentOptions,placements);
  } finally {
    workLedger.close();
    try { if (session.ocr) await session.ocr.terminate(); }
    finally { for (const item of plan) item.bytes?.fill(0); }
  }
}

async function markdownRasterImages(transformed, contentOptions) {
  // Planning every embedded raster before the first decoder/OCR call makes a
  // later external/unsupported reference an all-or-nothing policy failure.
  const plan = prepareOfficeImagePlan(transformed.media);
  const session = { ocr: null, cropBudget: { bytes: 0, pixels: 0 } }, recognized = [];
  try {
    let outputChars = transformed.markdown.length, contactCount = 0;
    for (const item of plan) {
      const result = await imageMarkdown(item.bytes, item.type, 'content-v1', contentOptions, session);
      outputChars += result.markdown.length + 4;
      contactCount += result.ocr_contacts?.length || 0;
      if (outputChars > MAX_MARKDOWN_CHARS || contactCount > 5000) fail('TEXT_TOO_LARGE');
      recognized.push(result);
    }
    // Keep source table/list/quote/code structure intact instead of injecting
    // multiline OCR into an inline image/table cell. Append raster transcripts
    // in actual image-node order, with private ordinal/crop provenance and
    // explicit incomplete visual/layout coverage, just like Office media OCR.
    const extraction = createMarkdownExtraction({ source_type: 'md', markdown: transformed.markdown, content_options: contentOptions,
      coverage: transformed.imageNodesRemoved ? { status: 'incomplete', reason_codes: ['VISUAL_CONTENT_NOT_EXTRACTED'] }
        : { status: 'complete', reason_codes: [] } });
    return appendOfficeOcr(extraction, recognized, contentOptions);
  } finally {
    try { if (session.ocr) await session.ocr.terminate(); }
    finally { for (const item of plan) item.bytes.fill(0); }
  }
}

function populated(value) {
  if (!value) return false;
  if (value instanceof Map || value instanceof Set) return value.size > 0;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'object' ? Object.keys(value).length > 0 : true;
}

function additionalOcrText(nativeText, ocrText) {
  // Comparison only: the native text and every retained OCR line keep their
  // original spelling/whitespace. Rendering a text layer with its underlying
  // scan must not silently append the same page a second time.
  const comparable = value => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
  const native = comparable(nativeText);
  if (native === comparable(ocrText)) return '';
  const nativeLines = new Set(nativeText.split(/\r\n|\r|\n/u).map(comparable).filter(Boolean));
  const paddedNative = ` ${native} `;
  return (ocrText.match(/[^\r\n]*(?:\r\n|\r|\n|$)/gu) || []).filter(line => {
    const value = comparable(line);
    return !value || (!nativeLines.has(value) && !paddedNative.includes(` ${value} `));
  }).join('');
}

async function pdfMarkdown(bytes, passiveObjects = false, markdownOutput, contentOptions, checkpoint) {
  if (bytes.length > 25 * 1024 * 1024) fail('INPUT_FORMAT_LIMIT');
  const pdfRoot = path.join(root, 'node_modules', 'pdfjs-dist');
  const { getDocument, OPS, AnnotationMode, setDataSecureTextPaintObserver } = await conversionTimings.measureAsync('runtime_init', () => import(pathToFileURL(path.join(pdfRoot, 'legacy', 'build', 'pdf.datasecure.mjs')).href));
  // Actual painted operators, not merely image resources declared in the PDF.
  // These are the image operations of the bundled PDF.js display API.
  const imageOperations = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject,
    OPS.paintInlineImageXObjectGroup, OPS.paintImageXObjectRepeat, OPS.paintImageMaskXObject,
    OPS.paintImageMaskXObjectGroup, OPS.paintImageMaskXObjectRepeat, OPS.paintSolidColorImageMask]);
  // A PDF may paint letters as vector outlines, with no image XObject and no
  // TextContent entry. This is a need-for-raster fact, never a scan role claim.
  const graphicOperations = new Set(['constructPath', 'rawFillPath', 'fill', 'eoFill', 'stroke', 'closeStroke',
    'fillStroke', 'eoFillStroke', 'closeFillStroke', 'closeEOFillStroke', 'shadingFill'].map(key => OPS[key]).filter(Number.isInteger));
  const resource = directory => `${path.join(pdfRoot, directory).replaceAll('\\', '/')}/`;
  const task = getDocument({ data: Uint8Array.from(bytes), isEvalSupported: false, stopAtErrors: true,
    disableAutoFetch: true, disableStream: true, disableRange: true, useWorkerFetch: false,
    useSystemFonts: false, enableXfa: false, verbosity: 0, cMapUrl: resource('cmaps'), cMapPacked: true,
    standardFontDataUrl: resource('standard_fonts'), iccUrl: resource('iccs'), wasmUrl: resource('wasm') });
  let ocr;
  let extractionFailed = false;
  try {
    const document = await conversionTimings.measureAsync('native_extract', () => task.promise);
    if (await document.getPermissions() !== null) fail('SOURCE_ENCRYPTED_UNSUPPORTED');
    // Never execute forms, JavaScript or attachments. Markdown-only and
    // Standalone Markdown-first privacy may omit them with incomplete source
    // coverage; the privacy gate still inspects all extracted Markdown.
    if (document.isPureXfa) fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
    const optionalReasons = new Set();
    async function passiveRead(operation, fallback) {
      try { return await operation(); }
      catch (cause) {
        if (!contentOptions || !passiveObjects || cause?.code !== undefined) throw cause;
        optionalReasons.add('DOCUMENT_PARTS_DAMAGED'); return fallback;
      }
    }
    const currentPassive = Boolean(contentOptions && passiveObjects);
    const earlyMetadata = currentPassive ? await passiveRead(() => document.getMetadata(), null) : undefined;
    // PDF.js may substitute XFA dataset values inside getFieldObjects even
    // with enableXfa:false, and hasJSActions itself consults those fields.
    // Only the pinned API's explicit no-XFA fact admits the new passive read.
    const omittedPassive = currentPassive && earlyMetadata?.info?.IsXFAPresent !== false;
    const hasActions = omittedPassive ? false : await passiveRead(() => document.hasJSActions(), false);
    const fieldObjects = omittedPassive || hasActions && !currentPassive ? null
      : await passiveRead(() => document.getFieldObjects(), null);
    const hasDocumentObjects = omittedPassive || hasActions || populated(fieldObjects) ||
      populated(await passiveRead(() => document.getAttachments(), null));
    if (hasDocumentObjects && !passiveObjects) fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
    const passiveContent = currentPassive && !omittedPassive ? createPassivePdfContent({ fieldObjects }) : null;
    const outline = await passiveRead(() => document.getOutline(), null);
    const metadata = currentPassive ? earlyMetadata : await passiveRead(() => document.getMetadata(), null);
    const metadataKeys = PDF_KEYS;
    if (((Array.isArray(outline) && outline.length > 0) || metadata?.metadata !== null) && !passiveObjects) {
      fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
    }
    const metadataLines = [];
    const metadataEntries = [];
    for (const key of metadataKeys) {
      const value = metadata?.info?.[key];
      if (value === undefined || value === '') continue;
      if (!['string', 'number', 'boolean'].includes(typeof value)) {
        if (passiveObjects) continue;
        fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
      }
      if (contentOptions) metadataEntries.push({ key, value: String(value) });
      else metadataLines.push(`${key}: ${String(value)}`);
    }
    let privateMetadata;
    if (metadataEntries.length) {
      try {
        const selected = selectOptionalPrivatePdfMetadata({ schema: 'datasecure-private-document-metadata/1', source_type: 'pdf', entries: metadataEntries });
        privateMetadata = selected.metadata;
        if (selected.omitted_entries) optionalReasons.add('TEXT_LIMIT_PARTIAL');
        for (const entry of privateMetadata?.entries || []) metadataLines.push(`${entry.key}: ${entry.value}`);
      }
      catch { fail('CONVERSION_METADATA_LIMIT'); }
    }
    const sections = [];
    const reasons = new Set(['SOURCE_COVERAGE_UNVERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED', ...optionalReasons]);
    const contacts = [];
    const cropBudget = { bytes: 0 };
    const documentNotice = { image: false, symbols: false, ocr: false, contacts: false,
      disagreement: false, lowConfidence: false, unscored: false };
    let total = sections.reduce((sum, section, index) => sum + section.length + (index ? 2 : 0), 0);
    let meaningfulText = false;
    // Explicit document-wide work cap. Exhaustion retains uncertain text; it
    // never guesses at missing letters or extends the existing worker deadline.
    const visibilityBudget = { remainingPixels: 32_000_000, remainingProbes: 128 };
    if (total > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
    function pageUnit(number, markdown, pageContacts = []) {
      const codes = new Set(reasons);
      codes.delete('OCR_CONTACT_VALUES_UNVERIFIED'); codes.delete('OCR_TEXT_EMPTY');
      if (pageContacts.length) codes.add('OCR_CONTACT_VALUES_UNVERIFIED');
      return createMarkdownExtraction({ source_type: 'pdf', markdown, content_options: contentOptions,
        ...(pageContacts.length ? { ocr_contacts: pageContacts } : {}),
        ...(number === 1 && privateMetadata ? { private_document_metadata: privateMetadata } : {}),
        coverage: { status: 'incomplete', reason_codes: [...codes].sort() } });
    }
    for (let number = 1; number <= document.numPages; number++) {
      if (contentOptions && number > MAX_UNITS) {
        // Producer budget, not a forged-unit/policy failure. Keep the already
        // completed pages and label the terminal result explicitly partial.
        reasons.add('CONVERSION_RESOURCE_LIMIT_PARTIAL'); break;
      }
      let page, canvas, nativeUnit, finalUnit, passivePage;
      let readingOptionalStructure = false;
      try {
        page = await conversionTimings.measureAsync('native_extract', () => document.getPage(number));
        if (page.isPureXfa) fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
        if (!passiveObjects && (populated(await page.getJSActions()) ||
            (await page.getAnnotations({ intent: 'display' })).length > 0)) fail('PDF_OBJECT_COVERAGE_UNVERIFIED');
        if (passiveContent) {
          passivePage = passiveContent.readPage({ pageNumber: number,
            annotations: await passiveRead(() => page.getAnnotations({ intent: 'display' }), []) });
          for (const code of passivePage.reason_codes) reasons.add(code);
        }
        const content = await conversionTimings.measureAsync('native_extract', () => page.getTextContent({ disableNormalization: true, ...(contentOptions ? { includeMarkedContent:true } : {}) }));
        const hasRawNativeText = content.items.some(item => typeof item.str === 'string' && Boolean(item.str.trim()));
        let text = '';
        let omittedSymbols = false;
        let previousTextItem;
        // Preserve existing search/accessibility text regardless of whether
        // its glyphs paint. Rendering cannot establish that such text has no
        // semantic counterpart in a raster OR vector graphic. User policy:
        // keep search text; paint evidence grants only OCR-deduplication rights.
        for (const item of contentOptions ? nativeColumnOrder(content.items, page.getViewport({ scale: 1 })) : content.items) {
          // PDF.js may emit marked-content boundaries; these contain no text.
          if (!Object.hasOwn(item, 'str')) continue;
          if (typeof item.str !== 'string') fail('PDF_EXTRACTION_FAILED');
          if (item.str.trim() && !text.endsWith('\n')) {
            const separator = nativeTextSeparator(previousTextItem, item);
            if (separator === '\n' || (separator && !/\s/u.test(text.slice(-1)) && !/^\s/u.test(item.str))) text += separator;
          }
          if (unreadableSymbolRun(item.str)) {
            // Private font glyphs cannot be reconstructed from a code point.
            // Preserve a boundary and try local raster OCR below; do not emit
            // cryptic glyphs or silently concatenate their neighbouring words.
            omittedSymbols = true;
            text += item.hasEOL ? '\n' : ' ';
          } else {
            const cleaned = cleanExtractedSymbolText(item.str);
            omittedSymbols ||= cleaned.omitted;
            text += cleaned.text + (item.hasEOL ? '\n' : '');
          }
          if (item.hasEOL) previousTextItem = undefined;
          else if (item.str.trim()) previousTextItem = item;
          if (text.length + total > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
        }
        const nativeText = text;
        const hasNativeText = Boolean(nativeText.trim());
        function nativeCandidate(bodyMarkdown) {
          if (passivePage?.markdown && total + bodyMarkdown.length + passivePage.markdown.length + 4 > MAX_MARKDOWN_CHARS) {
            // Optional whole annotation units cannot discard an independently
            // readable native page at the unchanged combined text budget.
            reasons.add('TEXT_LIMIT_PARTIAL'); passivePage = { markdown: '', meaningful: false };
          }
          const nativeParts = [bodyMarkdown,
            passivePage?.markdown && (hasNativeText || passivePage.meaningful) ? passivePage.markdown : ''].filter(Boolean);
          const candidate = pageUnit(number, nativeParts.join('\n\n'));
          if (total + candidate.markdown.length + (sections.length && candidate.markdown ? 2 : 0) > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
          return candidate;
        }
        if (contentOptions) {
          // Secure the fully validated neutral page BEFORE any optional model
          // lookup/projection, as well as before later raster/decoder work.
          nativeUnit = nativeCandidate(hasNativeText ? `## Seite ${number}\n\n${readableText(nativeText).markdown}` : '');
          await checkpoint(nativeUnit, number - 1);
        }
        // Keep original native items/text for visibility and OCR deduplication.
        // Tags may change only the Markdown projection. The one permitted unit
        // UPDATE is still emitted by the final/catch path, never an extra third
        // version solely because a tagged projection was successfully read.
        let taggedProjection;
        if (contentOptions) {
          readingOptionalStructure = true;
          let structureTree;
          try { structureTree = await conversionTimings.measureAsync('structure_ops', () => page.getStructTree()); }
          catch (cause) {
            if (!['FormatError','InvalidPDFException'].includes(cause?.name) || cause?.code !== undefined) throw cause;
            reasons.add('SOURCE_COVERAGE_UNVERIFIED');
          }
          const tagged = conversionTimings.measure('structure_ops', () => taggedPdfTextLayout({ items:content.items, structureTree, pageNumber:number, pageRef:page.ref }));
          if (tagged.applied) taggedProjection = conversionTimings.measure('structure_ops', () => projectTaggedPdf(tagged));
          else if (structureTree) reasons.add('SOURCE_COVERAGE_UNVERIFIED');
          omittedSymbols ||= taggedProjection?.omittedSymbols === true;
          if (hasNativeText && taggedProjection) nativeUnit = nativeCandidate(`## Seite ${number}\n\n${taggedProjection.markdown}`);
          readingOptionalStructure = false;
        }
        // Excluded/unconfirmed XFA values must not re-enable appearance
        // operators solely because no passive field reader was admitted.
        // Match the already-disabled raster policy; parsing is not execution.
        const operators = await conversionTimings.measureAsync('structure_ops', () => page.getOperatorList(currentPassive ? { annotationMode: AnnotationMode.DISABLE } : undefined));
        const hasPaintedImage = operators?.fnArray.some(operation => imageOperations.has(operation));
        const hasNonTextGraphicPaint = operators?.fnArray.some(operation => graphicOperations.has(operation));
        let additional = '';
        let retainedContacts = [];
        let retainedOcr = false;
        const plan = contentOptions ? pdfOcrAction(contentOptions, { hasNativeText: hasNativeText || Boolean(passivePage?.meaningful), hasPaintedImage: Boolean(hasPaintedImage),
          hasNonTextGraphicPaint: Boolean(hasNonTextGraphicPaint), omittedSymbols }) : null;
        if (plan?.action === 'scope-required') fail('PDF_OCR_SCOPE_REQUIRED');
        for (const code of plan?.reason_codes || []) reasons.add(code);
        if (plan ? plan.action === 'page' : (!hasNativeText || hasPaintedImage || omittedSymbols)) {
          const viewport = page.getViewport({ scale: 2 });
          const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height);
          dimensions(width, height);
          // Only an already selected OCR operation may spend raster-probe
          // work. No extra visibility rendering for ordinary PDF text reads.
          canvas = canvasApi().createCanvas(width, height);
          const directRegions = contentOptions && hasNativeText ? await conversionTimings.measureAsync('paint_probe', () => renderPdfNativeWordEvidence({ page, canvas, viewport,
            annotationMode: AnnotationMode.DISABLE, textItems: content.items, styles: content.styles,
            operators, ops: OPS, setTextPaintObserver: setDataSecureTextPaintObserver })) : null;
          if (contentOptions && !hasNativeText) await conversionTimings.measureAsync('pdf_raster', () => renderPdfOcrLayer({ page, canvas, viewport, annotationMode: AnnotationMode.DISABLE }));
          if (!contentOptions) await conversionTimings.measureAsync('pdf_raster', () => page.render({ canvasContext: canvas.getContext('2d'), viewport, background: 'white',
            annotationMode: AnnotationMode.DISABLE }).promise);
          const paintAnalysis = hasNativeText && directRegions === null ? await conversionTimings.measureAsync('paint_probe', () => classifyPdfTextVisibility({ page, textItems: content.items,
            viewport: page.getViewport({ scale: 1 }), createCanvas: canvasApi().createCanvas,
            setTextPaintObserver: setDataSecureTextPaintObserver, annotationMode: AnnotationMode.DISABLE,
            budget: visibilityBudget })) : { wordRegions: [] };
          ocr ??= await createOcr(); // One session per document, never across customers.
          const legacyRegions = hasNativeText && directRegions === null && paintedTextGeometryAvailable(operators, OPS, { strictMarkedContent: Boolean(contentOptions) })
            ? (contentOptions ? nativeSingleTokenRegions : nativeTextRegions)(content.items, content.styles, viewport) : [];
          // These extra per-word regions come from actual glyph positions and
          // final pixel differences, never a proportional split of a line box.
          // Visibility uses scale1; OCR uses scale2 of the same page viewport.
          const provenRegions = hasNativeText ? paintAnalysis.wordRegions.map(region => ({ text: region.text,
            x0: region.x0 * 2, y0: region.y0 * 2, x1: region.x1 * 2, y1: region.y1 * 2 })) : [];
          // The OCR raster retains every original paint operation. Remove a
          // transcript word only AFTER OCR supplies exact text and bounded
          // geometry; a different visible glyph/ToUnicode value must survive.
          const regions = [...(directRegions || []), ...provenRegions, ...legacyRegions];
          let recognized;
          if (contentOptions) {
            // AUTO's page-layout classifier can discard large vector-outline
            // lettering as a graphic despite explicit whole-page OCR consent.
            // Use the existing SINGLE_BLOCK reading, without altering pixels,
            // removing native/search text or inventing column semantics. Exact
            // geometry/text dedup still runs only after independent recognition.
            try { await ocr.setParameters({ tessedit_pageseg_mode: markdownOutput === 'content-v1' ? pdfOcrLayoutMode({ hasRawNativeText,
              hasPaintedImage: Boolean(hasPaintedImage), hasNonTextGraphicPaint: Boolean(hasNonTextGraphicPaint) }) : '6' }); }
            catch (cause) { if (errors.has(cause?.code) && !imageOmission(cause)) throw cause; fail('CONVERSION_POLICY_FAILED'); }
            let recognitionFailed = false, recognitionError;
            try { recognized = await recognize(canvas, ocr, regions, true); }
            catch (cause) { recognitionFailed = true; recognitionError = cause; }
            try { await ocr.setParameters({ tessedit_pageseg_mode: '6' }); }
            catch (cause) {
              // A failed reset leaves this document's OCR session uncertain. It
              // must not turn a hard recognition failure into an optional page.
              if (recognitionFailed && errors.has(recognitionError?.code) && !imageOmission(recognitionError)) throw recognitionError;
              if (errors.has(cause?.code) && !imageOmission(cause)) throw cause;
              fail('CONVERSION_POLICY_FAILED');
            }
            if (recognitionFailed) throw recognitionError;
          } else recognized = await recognize(canvas, ocr, regions, false);
          omittedSymbols ||= recognized.omitted;
          // New contracts require visible geometric/exact duplication evidence.
          // No lexical/casefold suppression of equal text elsewhere on the page.
          if (hasNativeText) additional = contentOptions ? recognized.text : additionalOcrText(nativeText, recognized.text);
          else text = recognized.text;
          reasons.add('OCR_NOT_VERIFIED');
          // Only retained OCR text carries a warning. Native text suppressed
          // by the geometry mask is not falsely reported as an uncertain scan.
          const retained = hasNativeText ? additional : text;
          if (recognized.readingDisagreement && retained.trim()) reasons.add('OCR_READING_DISAGREEMENT');
          retainedOcr = Boolean(retained.trim());
          const quality = retained === recognized.text ? recognized.quality : contactQuality({ blocks: recognized.wordData }, retained);
          documentNotice.disagreement ||= quality.disagreement_lines.length > 0;
          documentNotice.lowConfidence ||= quality.low_confidence_lines.length > 0;
          documentNotice.unscored ||= quality.unscored_contact_lines.length > 0;
          if (quality.contact_lines.length) {
            reasons.add('OCR_CONTACT_VALUES_UNVERIFIED');
            retainedContacts = attachContactCrops(contactSpans(retained, quality, number),
              retained, recognized.wordData, canvas, cropBudget, recognized.cropText);
          }
          if (!recognized.text.trim() && !hasNativeText) reasons.add('OCR_TEXT_EMPTY');
        }
        if (!contentOptions) meaningfulText ||= Boolean(text.trim() || additional.trim());
        const main = hasNativeText && taggedProjection ? { markdown:taggedProjection.markdown, contacts:[] }
          : readableText(text, hasNativeText ? [] : retainedContacts);
        let section = `## Seite ${number}\n\n${main.markdown}`;
        let renderedContacts = main.contacts;
        let contactOffset = `## Seite ${number}\n\n`.length;
        if (additional.trim()) {
          const supplement = readableText(additional, retainedContacts);
          contactOffset = section.length + 2;
          section += `\n\n${supplement.markdown}`;
          renderedContacts = supplement.contacts;
        }
        const localContacts = renderedContacts.map(item => ({ ...item, start: contactOffset + item.start, end: contactOffset + item.end }));
        if (passivePage?.markdown) section += `\n\n${passivePage.markdown}`;
        if (contacts.length + localContacts.length > 5000) fail('TEXT_TOO_LARGE');
        documentNotice.image ||= Boolean(hasPaintedImage);
        documentNotice.symbols ||= omittedSymbols;
        documentNotice.ocr ||= retainedOcr;
        documentNotice.contacts ||= retainedContacts.length > 0;
        if (total + section.length + (sections.length ? 2 : 0) > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
        if (contentOptions) {
          finalUnit = pageUnit(number, text.trim() || additional.trim() || passivePage?.meaningful ? section : '', localContacts);
          await checkpoint(finalUnit, number - 1);
        } else finalUnit = { markdown: section, ocr_contacts: localContacts };
      } catch (cause) {
        // Only a component/extraction failure is local. Requests requiring a
        // different OCR scope and policy/model/source failures remain hard.
        // A generic optional parser/transport failure can retain secured text,
        // but coded errors, cancellation/resource and unknown exception kinds
        // must not acquire successful-model or generic-partial authority here.
        if (readingOptionalStructure && (cause?.code !== undefined ||
            !['Error','UnknownErrorException'].includes(cause?.name))) throw cause;
        const omission = imageOmission(cause);
        const uncodedParserFailure = cause?.code === undefined &&
          ['Error', 'UnknownErrorException'].includes(cause?.name);
        if (!contentOptions || (!uncodedParserFailure && !omission && cause?.code !== 'PDF_EXTRACTION_FAILED')) throw cause;
        reasons.add(readingOptionalStructure ? 'DOCUMENT_PARTS_DAMAGED' : nativeUnit ? 'PDF_IMAGE_NOT_READ' : 'PDF_PAGE_NOT_READ');
        if (omission) reasons.add(omission);
        finalUnit = pageUnit(number, nativeUnit?.markdown || (passivePage?.meaningful ? passivePage.markdown : ''));
        await checkpoint(finalUnit, number - 1);
      } finally {
        if (canvas) { canvas.width = 1; canvas.height = 1; }
        page?.cleanup();
      }
      if (finalUnit?.markdown) {
        const offset = total + (sections.length ? 2 : 0);
        contacts.push(...(finalUnit.ocr_contacts || []).map(item => ({ ...item, start: offset + item.start, end: offset + item.end })));
        total = offset + finalUnit.markdown.length;
        sections.push(finalUnit.markdown);
        meaningfulText = true;
      }
    }
    if (passiveContent) {
      const extra = passiveContent.finalize();
      for (const code of extra.reason_codes) reasons.add(code);
      if (extra.meaningful) {
        if (total + extra.markdown.length + (sections.length ? 2 : 0) <= MAX_MARKDOWN_CHARS) {
          total += extra.markdown.length + (sections.length ? 2 : 0);
          sections.push(extra.markdown); meaningfulText = true;
        } else reasons.add('TEXT_LIMIT_PARTIAL');
      }
    }
    if (omittedPassive && meaningfulText) {
      const notice = '> PDF-Hinweis: Interaktive PDF-Felder und Anmerkungen wurden nicht übernommen, weil XFA-Inhalte vorhanden sind oder deren Abwesenheit nicht bestätigt ist. Unabhängig gelesener Seiteninhalt bleibt erhalten.';
      if (total + notice.length + (sections.length ? 2 : 0) <= MAX_MARKDOWN_CHARS) {
        total += notice.length + (sections.length ? 2 : 0); sections.push(notice);
      } else reasons.add('TEXT_LIMIT_PARTIAL');
    }
    // Metadata and a single concise notice do not interrupt the page prose.
    // They are retained, not silently removed, and receive no invented values.
    if (contentOptions && !meaningfulText) fail(!contentOptions.scanOcr && !contentOptions.imageOcr
      ? 'PDF_TEXT_UNAVAILABLE_BY_POLICY' : 'CONVERSION_OCR_TEXT_EMPTY');
    if (metadataLines.length && (!contentOptions || markdownOutput === 'notes-v1')) sections.push(`## Dokumentinformationen\n\n${readableText(metadataLines.join('\n')).markdown}`);
    const notice = markdownOutput === 'content-v1' ? '' : readableNotice(documentNotice);
    if (notice) sections.push(notice);
    if (contentOptions) {
      reasons.delete('OCR_TEXT_EMPTY'); reasons.delete('OCR_CONTACT_VALUES_UNVERIFIED');
      if (contacts.length) reasons.add('OCR_CONTACT_VALUES_UNVERIFIED');
    }
    return createMarkdownExtraction({ source_type: 'pdf', markdown: sections.join('\n\n'),
      ...(contentOptions ? { content_options: contentOptions } : {}),
      ...(privateMetadata ? { private_document_metadata: privateMetadata } : {}),
      ...(contacts.length ? { ocr_contacts: contacts } : {}),
      coverage: { status: 'incomplete', reason_codes: [...reasons].sort() } });
  } catch (cause) {
    extractionFailed = true;
    if (cause?.name === 'PasswordException') fail('SOURCE_ENCRYPTED_UNSUPPORTED');
    if (errors.has(cause?.code)) throw cause;
    fail('PDF_EXTRACTION_FAILED');
  } finally {
    let cleanupError;
    try { if (ocr) await ocr.terminate(); }
    catch (error) { cleanupError = error; }
    try { await task.destroy(); } // Outer supervisor owns a bounded exit even during teardown.
    catch (error) { cleanupError ||= error; }
    if (!extractionFailed && cleanupError) throw cleanupError;
  }
}

async function main() {
  if (process.platform === 'darwin')
    require('../core/macos-static-ownership-guard').assertParserCore('CONVERSION_POLICY_FAILED');
  if (globalThis.__DATASECURE_NETWORK_DENY_ACTIVE__ !== true || !process.permission || process.permission.has('fs.write') ||
      process.env.DISABLE_SYSTEM_FONTS_LOAD !== '1') fail('CONVERSION_POLICY_FAILED');
  const type = process.argv[2];
  const expectedBytes = Number(process.argv[3]);
  const policies = process.argv.slice(4);
  if (process.argv.length > 7 || !Object.values(SOURCE_TYPES).includes(type) ||
      !/^[1-9][0-9]*$/u.test(process.argv[3]) || !Number.isSafeInteger(expectedBytes) || expectedBytes > MAX_INPUT_BYTES) fail('CONVERSION_INPUT_INVALID');
  if (new Set(policies).size !== policies.length || policies.some(policy =>
    !((policy === 'omit-docx-header-footer' && type === 'docx') ||
      (policy === 'passive-document-objects' && ['pdf', 'pptx'].includes(type)) ||
      ['markdown-output-content-v1', 'markdown-output-notes-v1'].includes(policy) || policy.startsWith('content-options-v1:')))) {
    fail('CONVERSION_INPUT_INVALID');
  }
  const outputPolicies = policies.filter(policy => policy.startsWith('markdown-output-'));
  const contentPolicies = policies.filter(policy => policy.startsWith('content-options-v1:'));
  if (outputPolicies.length > 1 || contentPolicies.length > 1 || (outputPolicies.length && contentPolicies.length)) fail('CONVERSION_INPUT_INVALID');
  if (contentPolicies.length) {
    try {
      const encoded = contentPolicies[0].slice('content-options-v1:'.length);
      if (encoded.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(encoded)) fail('CONVERSION_INPUT_INVALID');
      const bytes = Buffer.from(encoded, 'base64url');
      const options = validateContentOptions(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
      if (Buffer.from(serializeContentOptions(options)).toString('base64url') !== encoded) fail('CONVERSION_INPUT_INVALID');
      requestedContentOptions = options;
    } catch { fail('CONVERSION_INPUT_INVALID'); }
  }
  const contentOptions = requestedContentOptions;
  const markdownOutput = contentOptions?.markdownOutput || outputPolicies[0]?.slice('markdown-output-'.length);
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) fail('INPUT_FILE_LIMIT');
    chunks.push(chunk);
  }
  if (size !== expectedBytes) fail('CONVERSION_INPUT_INCOMPLETE');
  const bytes = Buffer.concat(chunks);
  const checkpoint = contentOptions && ['docx', 'xlsx', 'pptx', 'pdf'].includes(type)
    ? createCheckpointEmitter({ type, contentOptions }) : async () => {};
  if (type === 'pdf') return pdfMarkdown(bytes, policies.includes('passive-document-objects'), markdownOutput, contentOptions, checkpoint);
  if (['png', 'bmp', 'jpeg'].includes(type)) return imageMarkdown(bytes, type, markdownOutput, contentOptions);
  const extractionOptions = {
    ...(contentOptions && ['docx', 'xlsx', 'pptx'].includes(type) ? { partialExtraction: true } : {}),
    ...(policies.includes('omit-docx-header-footer') ? { omitDocxHeaderFooter: true } : {}),
    ...(markdownOutput && type !== 'md' ? { markdownOutput } : {})
  };
  if (contentOptions?.imageOcr && ['docx', 'xlsx', 'pptx'].includes(type)) {
    return officeImageMarkdown(bytes, type, extractionOptions, contentOptions, checkpoint);
  }
  const result = conversionTimings.measure('native_extract', () => extractMarkdownBuffer(bytes, `.${type}`, extractionOptions));
  if (contentOptions && ['docx', 'xlsx', 'pptx'].includes(type) && !result.markdown.trim()) {
    fail('CONVERSION_EXTRACTION_FAILED');
  }
  if (type !== 'md' || (markdownOutput !== 'content-v1' && !contentOptions?.imageOcr)) return contentOptions
    ? createMarkdownExtraction({ source_type: result.source_type, markdown: result.markdown, coverage: result.coverage, content_options: contentOptions }) : result;
  for (const [name, version] of [['mdast-util-from-markdown', '2.0.2'], ['parse5', '7.3.0']]) {
    if (JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version !== version) fail('CONVERSION_POLICY_FAILED');
  }
  const { fromMarkdown } = await import(pathToFileURL(path.join(root, 'node_modules', 'mdast-util-from-markdown', 'index.js')).href);
  const { parseFragment } = await import(pathToFileURL(path.join(root, 'node_modules', 'parse5', 'dist', 'index.js')).href);
  if (contentOptions?.imageOcr) {
    const transformed = extractMarkdownImageMedia(result.markdown, { fromMarkdown, parseFragment });
    return markdownRasterImages(transformed, contentOptions);
  }
  const transformed = markdownImageContent(result.markdown, { fromMarkdown, parseFragment });
  if (markdownOutput !== 'content-v1') return createMarkdownExtraction({ source_type: type, markdown: result.markdown,
    coverage: result.coverage, content_options: contentOptions });
  return createMarkdownExtraction({ source_type: type, markdown: transformed.markdown,
    ...(contentOptions ? { content_options: contentOptions } : {}),
    coverage: transformed.imageNodesRemoved ? { status: 'incomplete', reason_codes: ['VISUAL_CONTENT_NOT_EXTRACTED'] } : result.coverage });
}

process.stdout.on('error', () => process.exit(2));
process.stderr.on('error', () => {}); // a diagnostic pipe cannot replace the result
function exitWithTimings(exitCode) {
  let line;
  try { line = serializeConversionTimings(conversionTimings.finish(process.argv[2], exitCode === 0 ? 'ok' : 'error')); } catch {}
  if (!line) { process.exit(exitCode); return; }
  try { process.stderr.write(line, () => process.exit(exitCode)); } catch { process.exit(exitCode); }
}
main().then(result => process.stdout.write(JSON.stringify({ schema: requestedContentOptions ? 'datasecure-conversion-response/2' : 'datasecure-conversion-response/1', ok: true, result }), () => exitWithTimings(0)),
  cause => process.stdout.write(JSON.stringify({ schema: requestedContentOptions ? 'datasecure-conversion-response/2' : 'datasecure-conversion-response/1', ok: false,
    error_code: errors.has(cause?.code) ? cause.code : 'CONVERSION_EXTRACTION_FAILED' }), () => exitWithTimings(2)));
