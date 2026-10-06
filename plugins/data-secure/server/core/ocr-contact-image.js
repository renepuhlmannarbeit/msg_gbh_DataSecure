'use strict';

// Private transient pixels only. No URL, path, HTML/SVG, telemetry or output
// artifact can enter this contract. Crops retain source raster resolution.
const crypto = require('node:crypto');
const { exactKeys } = require('./source-extraction-contract');
const { decodePng } = require('../images/png');
const MAX_IMAGE_BYTES = 96 * 1024;
const MAX_IMAGE_PIXELS = 200000;
const MAX_TOTAL_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_IMAGE_PIXELS = 2000000;
const KEYS = ['schema', 'source_width', 'source_height', 'x', 'y', 'width', 'height', 'png_base64'];
const fail = () => { throw Object.assign(new Error('OCR_CONTACT_IMAGE_INVALID'), { code: 'OCR_CONTACT_REVIEW_INVALID' }); };

function validateContactImage(image) {
  if (!exactKeys(image, KEYS) || image.schema !== 'datasecure-ocr-contact-image/1' ||
      !['source_width', 'source_height', 'x', 'y', 'width', 'height'].every(key => Number.isSafeInteger(image[key])) ||
      image.source_width < 1 || image.source_height < 1 || image.source_width * image.source_height > 30000000 ||
      image.x < 0 || image.y < 0 || image.width < 1 || image.height < 1 ||
      image.width > 4096 || image.height > 256 || image.width * image.height > MAX_IMAGE_PIXELS ||
      image.x + image.width > image.source_width || image.y + image.height > image.source_height ||
      typeof image.png_base64 !== 'string' || image.png_base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(image.png_base64)) fail();
  const bytes = Buffer.from(image.png_base64, 'base64');
  try {
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== image.png_base64 ||
        bytes.length < 33 || bytes.readUInt32BE(16) !== image.width || bytes.readUInt32BE(20) !== image.height) fail();
    // Accept only our minimal PNG encoder, not metadata, animation, links or
    // trailing polyglot payloads; verify CRCs and bounded decompression too.
    let offset = 8, header = false, data = false, end = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
      if (length > bytes.length - offset - 12 || end) fail();
      if (type === 'IHDR' && !header && offset === 8 && length === 13) header = true;
      else if (type === 'IDAT' && header && !data) data = true;
      else if (type === 'IEND' && data && length === 0) end = true;
      else fail();
      offset += length + 12;
    }
    if (!end || offset !== bytes.length) fail();
    const decoded = decodePng(bytes);
    if (decoded.width !== image.width || decoded.height !== image.height) fail();
    decoded.rgba.fill(0);
    return bytes.length;
  } catch { fail(); } finally { bytes.fill(0); }
}

function contactImageDigest(image) {
  validateContactImage(image);
  return crypto.createHash('sha256').update(JSON.stringify(image)).digest('hex');
}

module.exports = { validateContactImage, contactImageDigest, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MAX_TOTAL_IMAGE_BYTES, MAX_TOTAL_IMAGE_PIXELS };
