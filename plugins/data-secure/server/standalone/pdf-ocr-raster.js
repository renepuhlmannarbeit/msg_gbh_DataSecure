'use strict';

const { crc32, deflateSync } = require('node:zlib');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_FAST_PIXELS = 2_500_000;

function chunk(type, data = Buffer.alloc(0)) {
  const bytes = Buffer.allocUnsafe(data.length + 12);
  bytes.writeUInt32BE(data.length, 0);
  bytes.write(type, 4, 'ascii');
  data.copy(bytes, 8);
  bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4);
  return bytes;
}

// Internal PNG transport for the same opaque sRGB PDF page/crop. No source
// media or color conversion takes this route. Filter zero and lower zlib
// effort affect only compressed bytes, not the image or OCR parameters.
function pdfOcrRaster(canvas) {
  const { width, height } = canvas;
  if (width * height > MAX_FAST_PIXELS || typeof crc32 !== 'function') return canvas.toBuffer('image/png');
  const rgba = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  for (let index = 3; index < rgba.length; index += 4) {
    if (rgba[index] !== 255) return canvas.toBuffer('image/png');
  }
  const stride = width * 4;
  const source = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row++) {
    source.copy(scanlines, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header),
    chunk('sBIT', Buffer.from([8, 8, 8, 8])), chunk('sRGB', Buffer.from([0])),
    chunk('IDAT', deflateSync(scanlines, { level: 1 })), chunk('IEND')]);
}

module.exports = Object.freeze({ pdfOcrRaster });
