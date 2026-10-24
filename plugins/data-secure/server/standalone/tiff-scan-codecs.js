'use strict';

// Closed, byte-only TIFF strip codecs. The outer TIFF preflight binds every
// offset/row/sample/output allocation before these functions are called.
// No decoder modules, URLs, filesystem, native plug-ins or growing strings.
const { CCITTFaxDecoder } = require('./ccitt-fax-decoder');
const damaged = () => { throw Object.assign(new Error('VISUAL_CONTENT_DAMAGED'), { code: 'VISUAL_CONTENT_DAMAGED' }); };
const MAX_BYTES = 120000000;
function valid(bytes, size) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || !Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) damaged();
}

// TIFF6 early-change, MSB-first LZW, unlike GIF LSB/late-change. Each strip
// starts with Clear and must provide exactly its declared bytes before EOI.
function decodeTiffLzw(bytes, size) {
  valid(bytes, size);
  const out = Buffer.alloc(size), prefix = new Uint16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
  let bit = 0, width = 9, next = 258, previous = -1, first = 0, written = 0;
  const read = () => {
    if (bit + width > bytes.length * 8) damaged();
    let value = 0;
    for (let i = 0; i < width; i++, bit++) value = (value << 1) | ((bytes[bit >>> 3] >>> (7 - (bit & 7))) & 1);
    return value;
  };
  try {
    for (let i = 0; i < 256; i++) suffix[i] = i;
    if (read() !== 256) damaged();
    while (bit < bytes.length * 8) {
      let code = read();
      if (code === 256) { width = 9; next = 258; previous = -1; continue; }
      if (code === 257) {
        if (written !== size || bytes.length * 8 - bit > 7) damaged();
        // TIFF strip padding is not an additional compressed data segment.
        while (bit < bytes.length * 8) { if ((bytes[bit >>> 3] >>> (7 - (bit & 7))) & 1) damaged(); bit++; }
        return out;
      }
      if (code > next || (code === next && previous < 0)) damaged();
      const original = code; let length = 0;
      if (code === next) { stack[length++] = first; code = previous; }
      while (code >= 256) {
        if (code >= next || length >= 4096) damaged();
        stack[length++] = suffix[code]; code = prefix[code];
      }
      first = suffix[code]; stack[length++] = first;
      if (written + length > size) damaged();
      while (length) out[written++] = stack[--length];
      if (previous >= 0 && next < 4096) {
        prefix[next] = previous; suffix[next++] = first;
        if (next === (1 << width) - 1 && width < 12) width++;
      }
      previous = original;
    }
    damaged();
  } catch (error) { out.fill(0); throw error; }
  finally { prefix.fill(0); suffix.fill(0); stack.fill(0); }
}

function decodeTiffFax(bytes, width, rows, { compression, photo, fillOrder, t4 = 0, t6 = 0 }) {
  const rowBytes = Math.ceil(width / 8), size = rowBytes * rows;
  valid(bytes, size);
  if (!Number.isSafeInteger(width) || width < 1 || width > 32768 || !Number.isSafeInteger(rows) || rows < 1 || rows > 32768 ||
      ![2, 3, 4].includes(compression) || ![0, 1].includes(photo) || ![1, 2].includes(fillOrder) ||
      ![0, 1, 4, 5].includes(t4) || t6 !== 0) damaged();
  // Only reverse encoded bit order. The decoded output uses normal MSB-first
  // sample order, regardless of compressed FillOrder.
  let offset = 0;
  const reverse = value => { let result = 0; for (let i = 0; i < 8; i++) { result = (result << 1) | (value & 1); value >>>= 1; } return result; };
  const at = i => fillOrder === 2 ? reverse(bytes[i]) : bytes[i];
  const source = { next: () => offset < bytes.length ? at(offset++) : -1 };
  const output = Buffer.alloc(size);
  let decoder;
  try {
    decoder = new CCITTFaxDecoder(source, { K: compression === 4 ? -1 : compression === 3 && (t4 & 1) ? 1 : 0,
      Columns: width, Rows: rows, EndOfLine: compression === 3, EndOfBlock: false,
      // TIFF's fax codes supply raw sample bits. PhotometricInterpretation is
      // applied exactly once by the outer pixel projector, not twice here.
      EncodedByteAlign: compression === 2, BlackIs1: true,
      TiffFillBits: Boolean(t4 & 4), MaxOperations: Math.min(bytes.length * 8 + 64, width * rows * 8 + rows * 32 + 1024) });
    for (let i = 0; i < size; i++) { const value = decoder.readNextChar(); if (value < 0 || decoder.err) damaged(); output[i] = value; }
    if (decoder.row !== rows || decoder.err || decoder.readNextChar() !== -1) damaged();
    const consumed = offset * 8 - decoder.inputBits, remaining = bytes.length * 8 - consumed;
    if (remaining > 128 || remaining < 0) damaged();
    let tail = '';
    for (let i = consumed; i < bytes.length * 8; i++) tail += String((at(i >>> 3) >>> (7 - (i & 7))) & 1);
    const padding = /^0{0,7}$/u;
    const end = compression === 4 ? /^(?:000000000001){2}0{0,7}$/u : /^(?:0{0,7})(?:0000000000011?){1,7}0{0,7}$/u;
    if (!padding.test(tail) && (compression === 2 || !end.test(tail))) damaged();
    return output;
  } catch (error) { output.fill(0); if (['VISUAL_CONTENT_DAMAGED', 'VISUAL_PROCESSING_LIMIT'].includes(error?.code)) throw error; damaged(); }
  finally { decoder?.codingLine.fill(0); decoder?.refLine.fill(0); }
}

const tiffCcittUpstream = Object.freeze({
  schema: 'datasecure-tiff-ccitt-derivative/1', version: '5.4.449',
  repository: 'https://github.com/mozilla/pdf.js', commit: 'f44e5f0e63237a7cfb3b591b0b011d2abe27b036',
  source: 'src/core/ccitt.js', git_blob: '8a57a5dbe46ed54e7569ce24fc2eac0a02c58cce',
  sha256: '1bc7e5525ae3b8aea115ff90800380212f5e0fababa50595be0f4566de977fea',
  license: 'Apache-2.0', copyright: 'Mozilla Foundation; Glyph & Cog, LLC',
  module: 'standalone/ccitt-fax-decoder.js', changed: true,
});
module.exports = Object.freeze({ decodeTiffLzw, decodeTiffFax, tiffCcittUpstream });
