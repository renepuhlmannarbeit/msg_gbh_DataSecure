'use strict';

const { encodePng } = require('../images/png');
const { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MAX_TOTAL_IMAGE_BYTES, MAX_TOTAL_IMAGE_PIXELS } = require('../core/ocr-contact-image');
const { validBox } = require('./ocr-refinement');

function attachContactCrops(contacts, text, blocks, canvas, budget = { bytes: 0 }, unmodifiedText) {
  // A surviving substring can coincide with another OCR line. Require the
  // complete unfiltered transcript, not merely one unique text match.
  const comparable = value => typeof value === 'string' ? value.replace(/\r\n|\r/gu, '\n').trim() : null;
  if (comparable(unmodifiedText) === null || comparable(text) !== comparable(unmodifiedText)) return contacts;
  const lines = (Array.isArray(blocks) ? blocks : []).flatMap(block =>
    (Array.isArray(block?.paragraphs) ? block.paragraphs : []).flatMap(paragraph =>
      Array.isArray(paragraph?.lines) ? paragraph.lines : []));
  const sourceLines = text.split(/\r\n|\r|\n/u);
  return contacts.map(contact => {
    const literal = sourceLines[contact.line - 1]?.trim();
    const matches = lines.filter(line => typeof line.text === 'string' && line.text.trim() === literal);
    // Repeated/ambiguous geometry is deliberately not guessed. A missing crop
    // gets an explicit UI fallback rather than a plausible but wrong image.
    if (!literal || matches.length !== 1 || !validBox(matches[0].bbox, canvas.width, canvas.height)) return contact;
    const box = matches[0].bbox;
    const x = Math.max(0, box.x0 - 12), y = Math.max(0, box.y0 - 12);
    const width = Math.min(canvas.width, box.x1 + 12) - x;
    const height = Math.min(canvas.height, box.y1 + 12) - y;
    if (width > 4096 || height > 256 || width * height > MAX_IMAGE_PIXELS ||
        (budget.pixels || 0) + width * height > MAX_TOTAL_IMAGE_PIXELS) return contact;
    const pixels = canvas.getContext('2d').getImageData(x, y, width, height);
    const rgba = Buffer.from(pixels.data);
    let bytes;
    try {
      bytes = encodePng({ width, height, rgba });
      if (bytes.length > MAX_IMAGE_BYTES || budget.bytes + bytes.length > MAX_TOTAL_IMAGE_BYTES) return contact;
      budget.bytes += bytes.length;
      budget.pixels = (budget.pixels || 0) + width * height;
      return { ...contact, image: { schema: 'datasecure-ocr-contact-image/1', source_width: canvas.width,
        source_height: canvas.height, x, y, width, height, png_base64: bytes.toString('base64') } };
    } finally { rgba.fill(0); pixels.data.fill(0); bytes?.fill(0); }
  });
}

module.exports = { attachContactCrops };
