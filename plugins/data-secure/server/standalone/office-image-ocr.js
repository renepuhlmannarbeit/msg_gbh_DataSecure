'use strict';

// Internal worker helper: input is parseOoxml's relationship-checked attachment
// list or the Markdown AST/HTML mapper's canonical embedded-raster list.
// No ZIP traversal, source paths, remote image URLs or external reads.
const { RESOURCE_LIMITS } = require('../resource-limits');
const { MAX_IMAGE_BYTES, MAX_PIXELS } = require('../images/common');
const { createMarkdownExtraction, MAX_MARKDOWN_CHARS } = require('./markdown-contract');
const TYPES = Object.freeze({ png: ['png', 'image/png'], jpg: ['jpeg', 'image/jpeg'],
  jpeg: ['jpeg', 'image/jpeg'], bmp: ['bmp', 'image/bmp'] });
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

function appendOfficeOcr(extraction, recognized, contentOptions) {
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

module.exports = Object.freeze({ imageSize, prepareOfficeImagePlan, appendOfficeOcr });
