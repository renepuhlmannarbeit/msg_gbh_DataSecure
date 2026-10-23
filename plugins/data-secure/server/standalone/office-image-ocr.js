'use strict';

// Internal worker helper: input is parseOoxml's relationship-checked attachment
// list or the Markdown AST/HTML mapper's canonical embedded-raster list.
// No ZIP traversal, source paths, remote image URLs or external reads.
const { RESOURCE_LIMITS } = require('../resource-limits');
const { MAX_IMAGE_BYTES, MAX_PIXELS } = require('../images/common');
const { createMarkdownExtraction, MAX_MARKDOWN_CHARS } = require('./markdown-contract');
const TYPES = Object.freeze({ png: ['png', 'image/png'], jpg: ['jpeg', 'image/jpeg'],
  jpeg: ['jpeg', 'image/jpeg'], bmp: ['bmp', 'image/bmp'] });
const VISUAL_TYPES=Object.freeze({svg:'image/svg+xml',gif:'image/gif',tif:'image/tiff',tiff:'image/tiff',webp:'image/webp',emf:'image/x-emf',wmf:'image/x-wmf'});
// Sequential document work, not a simultaneously live allocation. Reserve up
// to four peak-sized OCR rasters across a complete document; the supervisor's
// unchanged 300s/1GiB envelope is still the hard execution boundary.
const MAX_OFFICE_OCR_PIXELS=MAX_PIXELS*4;
const fail = code => { throw Object.assign(new Error(code), { code }); };

function imageSize(bytes, type) {
  let width, height;
  if (type === 'png') {
    if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(8) !== 13) fail('CONVERSION_IMAGE_INVALID');
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (type === 'bmp') {
    if (bytes.length < 54 || bytes.toString('ascii', 0, 2) !== 'BM' || bytes.readUInt32LE(14) < 40) fail('CONVERSION_IMAGE_INVALID');
    width = bytes.readInt32LE(18); height = Math.abs(bytes.readInt32LE(22));
  } else {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) fail('CONVERSION_IMAGE_INVALID');
    let cursor = 2;
    while (cursor < bytes.length) {
      if (bytes[cursor++] !== 0xff) fail('CONVERSION_IMAGE_INVALID');
      while (bytes[cursor] === 0xff) cursor++;
      const marker = bytes[cursor++];
      if (marker === 0xda || marker === 0xd9 || marker === undefined) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (cursor + 2 > bytes.length) fail('CONVERSION_IMAGE_INVALID');
      const length = bytes.readUInt16BE(cursor);
      if (length < 2 || cursor + length > bytes.length) fail('CONVERSION_IMAGE_INVALID');
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8) fail('CONVERSION_IMAGE_INVALID');
        height = bytes.readUInt16BE(cursor + 3); width = bytes.readUInt16BE(cursor + 5); break;
      }
      cursor += length;
    }
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) fail('CONVERSION_IMAGE_INVALID');
  if (width * height > MAX_PIXELS) fail('CONVERSION_PIXEL_LIMIT');
  return { width, height };
}

function prepareOfficeImagePlan(attachments) {
  if (!Array.isArray(attachments)) fail('CONVERSION_INPUT_INVALID');
  if (attachments.length > RESOURCE_LIMITS.MAX_VISUAL_ASSETS) fail('INPUT_FORMAT_LIMIT');
  let totalBytes = 0, totalPixels = 0;
  const sources = new Set(), plan = [];
  try {
    for (const attachment of attachments) {
      const pair = Object.hasOwn(TYPES, attachment?.extension || '') ? TYPES[attachment.extension] : null;
      if (!pair || attachment.type !== 'image' || attachment.mimeType !== pair[1]) fail('OFFICE_IMAGE_OCR_UNAVAILABLE');
      if (typeof attachment.source_part !== 'string' || !attachment.source_part || sources.has(attachment.source_part) ||
          typeof attachment.data !== 'string' || !attachment.data || attachment.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
          !/^[A-Za-z0-9+/]+={0,2}$/u.test(attachment.data)) fail('CONVERSION_IMAGE_INVALID');
      const bytes = Buffer.from(attachment.data, 'base64');
      if (bytes.toString('base64') !== attachment.data || !bytes.length || bytes.length > MAX_IMAGE_BYTES) {
        bytes.fill(0); fail('CONVERSION_IMAGE_INVALID');
      }
      totalBytes += bytes.length;
      if (totalBytes > RESOURCE_LIMITS.MAX_ASSET_BYTES) { bytes.fill(0); fail('INPUT_FORMAT_LIMIT'); }
      let size;
      try { size = imageSize(bytes, pair[0]); } catch (error) { bytes.fill(0); throw error; }
      totalPixels += size.width * size.height;
      if (totalPixels > MAX_PIXELS) { bytes.fill(0); fail('CONVERSION_PIXEL_LIMIT'); }
      sources.add(attachment.source_part);
      plan.push({ type: pair[0], bytes, width: size.width, height: size.height,
        // Private image ordinal is the review locator; no source/media filename
        // is emitted into the Markdown. Actual page/slide placement is not guessed.
        ordinal: plan.length + 1 });
    }
    return plan;
  } catch (error) { for (const item of plan) item.bytes.fill(0); throw error; }
}

// Standalone /2 only. The strict planner above remains the Markdown/legacy
// boundary. These bytes have already been authorized by the Office reader;
// an unsupported picture does not revoke the other document text.
function preparePartialOfficeImagePlan(attachments) {
  if (!Array.isArray(attachments)) fail('CONVERSION_INPUT_INVALID');
  const plan = [], sources = new Set();
  const formats = { emf: 'EMF', wmf: 'WMF', svg: 'SVG', gif: 'GIF', tif: 'TIFF', tiff: 'TIFF', webp: 'WEBP' };
  let totalBytes = 0;
  // Fair aggregate OCR work, separate from the unchanged per-decoder peak.
  // Each asset is downsampled only after safe decoding. Source/peak/OS/walltime
  // limits remain unchanged. Tiny decorative rasters cannot reserve the same
  // work as a full-page text graphic and force needless text downsampling.
  try {
    for (const [index, attachment] of attachments.entries()) {
      const ordinal = index + 1;
      if (index >= RESOURCE_LIMITS.MAX_VISUAL_ASSETS) {
        plan.push({ ordinal, reason: 'IMAGE_PROCESSING_LIMIT' }); break;
      }
      if (typeof attachment?.source_part !== 'string' || !attachment.source_part ||
          sources.has(attachment.source_part)) fail('CONVERSION_INPUT_INVALID');
      sources.add(attachment.source_part);
      const pair = Object.hasOwn(TYPES, attachment.extension || '') ? TYPES[attachment.extension] : null;
      const visual=Object.hasOwn(VISUAL_TYPES,attachment.extension||'')&&attachment.mimeType===VISUAL_TYPES[attachment.extension];
      if ((!pair&&!visual) || attachment.type !== 'image' || (pair&&attachment.mimeType !== pair[1])) {
        const format = Object.hasOwn(formats, attachment.extension || '') ? formats[attachment.extension] : 'OTHER';
        plan.push({ ordinal, reason: `OFFICE_IMAGE_FORMAT_${format}_UNSUPPORTED` }); continue;
      }
      let bytes;
      try {
        if (typeof attachment.data !== 'string' || !attachment.data ||
            attachment.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
            !/^[A-Za-z0-9+/]+={0,2}$/u.test(attachment.data)) fail('CONVERSION_IMAGE_INVALID');
        bytes = Buffer.from(attachment.data, 'base64');
        if (bytes.toString('base64') !== attachment.data || !bytes.length) fail('CONVERSION_IMAGE_INVALID');
        if (bytes.length > MAX_IMAGE_BYTES || totalBytes + bytes.length > RESOURCE_LIMITS.MAX_ASSET_BYTES) fail('INPUT_FORMAT_LIMIT');
        totalBytes += bytes.length;
        const size = pair?imageSize(bytes, pair[0]):{};
        plan.push({ type: pair?pair[0]:attachment.extension, visual:!pair, bytes, ...size, ordinal,
          occurrences:attachment.occurrences });
        bytes = undefined;
      } catch (cause) {
        if (!['CONVERSION_IMAGE_INVALID', 'CONVERSION_PIXEL_LIMIT', 'INPUT_FORMAT_LIMIT'].includes(cause?.code)) throw cause;
        plan.push({ ordinal, reason: cause.code === 'CONVERSION_IMAGE_INVALID' ? 'IMAGE_CONTENT_DAMAGED' : 'IMAGE_PROCESSING_LIMIT' });
      } finally { bytes?.fill(0); }
    }
    let pending=plan.filter(item=>!item.reason),remaining=MAX_OFFICE_OCR_PIXELS;
    while(pending.length){
      const share=Math.max(1,Math.floor(remaining/pending.length));
      const small=pending.filter(item=>(item.width*item.height||MAX_PIXELS)<=share);
      if(!small.length){for(const item of pending)item.ocrPixels=Math.min(MAX_PIXELS,share);break;}
      const done=new Set(small);
      for(const item of small){item.ocrPixels=Math.min(MAX_PIXELS,item.width*item.height||MAX_PIXELS);remaining-=item.ocrPixels;}
      pending=pending.filter(item=>!done.has(item));
    }
    return plan;
  } catch (cause) { for (const item of plan) item.bytes?.fill(0); throw cause; }
}

function appendOfficeOcr(extraction, recognized, contentOptions, placements) {
  if(placements!==undefined)return appendPlacedOfficeOcr(extraction,recognized,contentOptions,placements);
  let markdown = extraction.markdown;
  const contacts = [], reasons = new Set(extraction.coverage.reason_codes);
  for (const [index, result] of recognized.entries()) {
    for (const code of result.coverage.reason_codes) reasons.add(code);
    if (!result.markdown) continue;
    const offset = markdown.length + (markdown ? 2 : 0);
    if (offset + result.markdown.length > MAX_MARKDOWN_CHARS) fail('TEXT_TOO_LARGE');
    markdown += `${markdown ? '\n\n' : ''}${result.markdown}`;
    contacts.push(...(result.ocr_contacts || []).map(contact => ({ ...contact,
      page: index + 1, start: contact.start + offset, end: contact.end + offset })));
  }
  if (!markdown.trim()) fail('CONVERSION_OCR_TEXT_EMPTY');
  // OCR_TEXT_EMPTY describes an unusable document, not a decorative image.
  // Missing visual semantics and OCR accuracy remain explicitly incomplete.
  reasons.delete('OCR_TEXT_EMPTY');
  return createMarkdownExtraction({ source_type: extraction.source_type, markdown, content_options: contentOptions,
    ...(contacts.length ? { ocr_contacts: contacts } : {}),
    coverage: { status: reasons.size ? 'incomplete' : 'complete', reason_codes: [...reasons].sort() } });
}

function appendPlacedOfficeOcr(extraction,recognized,contentOptions,placements) {
  if(!Array.isArray(placements)||placements.length>1000||extraction.ocr_contacts?.length)fail('CONVERSION_INPUT_INVALID');
  const reasons=new Set(extraction.coverage.reason_codes),contacts=[];
  for(const result of recognized)for(const code of result.coverage.reason_codes)reasons.add(code);
  let markdown='',cursor=0;
  const ordered=placements.map((value,index)=>({...value,order:index})).sort((a,b)=>a.after-b.after||a.order-b.order);
  for(const item of ordered) {
    if(!Number.isSafeInteger(item.after)||item.after<cursor||item.after>extraction.markdown.length||
       !Number.isSafeInteger(item.result)||!recognized[item.result]||!Number.isSafeInteger(item.ordinal)||item.ordinal<1||
       !['slide','notes','sheet','document'].includes(item.kind)||!Number.isSafeInteger(item.index)||item.index<1)fail('CONVERSION_INPUT_INVALID');
    markdown+=extraction.markdown.slice(cursor,item.after);cursor=item.after;
    const result=recognized[item.result];if(!result.markdown)continue;
    const label={slide:'Folie',notes:'Notizen zur Folie',sheet:'Arbeitsblatt',document:'Dokumentabschnitt'}[item.kind];
    const prefix=officeOcrLabel(item,label);
    const added=prefix.length+result.markdown.length+2;
    if(markdown.length+added+extraction.markdown.length-cursor>MAX_MARKDOWN_CHARS) {reasons.add('TEXT_LIMIT_PARTIAL');continue;}
    const cropBytes=c=>c.image?(c.image.png_base64.length/4*3-(c.image.png_base64.endsWith('==')?2:c.image.png_base64.endsWith('=')?1:0)):0;
    const imageBytes=contacts.reduce((sum,c)=>sum+cropBytes(c),0)+(result.ocr_contacts||[]).reduce((sum,c)=>sum+cropBytes(c),0);
    const imagePixels=contacts.reduce((sum,c)=>sum+(c.image?c.image.width*c.image.height:0),0)+(result.ocr_contacts||[]).reduce((sum,c)=>sum+(c.image?c.image.width*c.image.height:0),0);
    const limits=require('../core/ocr-contact-image');
    if(contacts.length+(result.ocr_contacts?.length||0)>5000||imageBytes>limits.MAX_TOTAL_IMAGE_BYTES||imagePixels>limits.MAX_TOTAL_IMAGE_PIXELS) {
      reasons.add('IMAGE_PROCESSING_LIMIT');continue;
    }
    const offset=markdown.length+prefix.length;markdown+=prefix+result.markdown+'\n\n';
    contacts.push(...(result.ocr_contacts||[]).map(contact=>({...contact,page:item.ordinal,start:offset+contact.start,end:offset+contact.end})));
  }
  markdown+=extraction.markdown.slice(cursor);
  if(!markdown.trim())fail('CONVERSION_OCR_TEXT_EMPTY');
  reasons.delete('OCR_TEXT_EMPTY');
  if(!contacts.length)reasons.delete('OCR_CONTACT_VALUES_UNVERIFIED');
  return createMarkdownExtraction({source_type:extraction.source_type,markdown,content_options:contentOptions,
    ...(contacts.length?{ocr_contacts:contacts}:{}),coverage:{status:reasons.size?'incomplete':'complete',reason_codes:[...reasons].sort()}});
}

function officeOcrLabel(item,label){
  if(item.parts!==undefined&&(!Number.isSafeInteger(item.parts)||item.parts<2||item.parts>150||!Number.isSafeInteger(item.part)||item.part<1||item.part>item.parts))fail('CONVERSION_INPUT_INVALID');
  return `\n\n### Bildtext · ${label} ${item.index} · Grafik ${item.ordinal}${item.parts?` · Teil ${item.part} von ${item.parts}`:''}\n\n`;
}

// Checkpoints are concatenated by the parent, so their budget must count every
// occurrence and duplicated review crop, not just each distinct decoded asset.
// Omit a whole occurrence before emitting it; never weaken the IPC accumulator.
function officeOcrCheckpoint(extraction,result,contentOptions,occurrences,budget) {
  const limits=require('../core/ocr-contact-image'),accepted=[],reasons=new Set(result.coverage.reason_codes);
  for(const [index,occurrence] of occurrences.entries()){
    if(!result.markdown)break;
    const ordinal=index+1,label={slide:'Folie',notes:'Notizen zur Folie',sheet:'Arbeitsblatt',document:'Dokumentabschnitt'}[occurrence.kind];
    if(!label||!Number.isSafeInteger(occurrence.index)||occurrence.index<1)fail('CONVERSION_INPUT_INVALID');
    const chars=officeOcrLabel({...occurrence,ordinal},label).length+result.markdown.length+2;
    const contacts=result.ocr_contacts||[],bytes=contacts.reduce((sum,c)=>sum+(c.image?Buffer.byteLength(c.image.png_base64,'base64'):0),0);
    const pixels=contacts.reduce((sum,c)=>sum+(c.image?c.image.width*c.image.height:0),0);
    const separator=accepted.length||budget.units?2:0;
    if(budget.chars+chars+separator>MAX_MARKDOWN_CHARS){reasons.add('TEXT_LIMIT_PARTIAL');continue;}
    if(budget.contacts+contacts.length>5000||budget.bytes+bytes>limits.MAX_TOTAL_IMAGE_BYTES||budget.pixels+pixels>limits.MAX_TOTAL_IMAGE_PIXELS){reasons.add('IMAGE_PROCESSING_LIMIT');continue;}
    budget.chars+=chars+separator;budget.contacts+=contacts.length;budget.bytes+=bytes;budget.pixels+=pixels;
    accepted.push({...occurrence,after:0,result:0,ordinal});
  }
  const coverage={status:'incomplete',reason_codes:[...reasons].sort()};
  if(!accepted.length){coverage.reason_codes=coverage.reason_codes.filter(code=>code!=='OCR_CONTACT_VALUES_UNVERIFIED');return createMarkdownExtraction({source_type:extraction.source_type,markdown:'',content_options:contentOptions,coverage});}
  budget.units++;
  return appendPlacedOfficeOcr({...extraction,markdown:'',coverage},[result],contentOptions,accepted);
}

module.exports = Object.freeze({ imageSize, prepareOfficeImagePlan, preparePartialOfficeImagePlan, appendOfficeOcr, officeOcrCheckpoint, MAX_OFFICE_OCR_PIXELS });
