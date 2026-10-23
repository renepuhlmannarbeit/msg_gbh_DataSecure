'use strict';
// Independent synthetic PNG sample/Adam7/filter writer; no product encoder.
const zlib = require('node:zlib');
const { crc32 } = require('./zip');
const signature = Buffer.from('89504e470d0a1a0a', 'hex');
function chunk(name, bytes) {
  const type = Buffer.from(name), output = Buffer.alloc(bytes.length + 12);
  output.writeUInt32BE(bytes.length); type.copy(output, 4); bytes.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([type, bytes])), 8 + bytes.length); return output;
}
function chunks(bytes) {
  const result = []; let cursor = 8;
  while (cursor < bytes.length) {
    const size = bytes.readUInt32BE(cursor), name = bytes.toString('ascii', cursor + 4, cursor + 8);
    result.push([name, Buffer.from(bytes.subarray(cursor + 8, cursor + 8 + size))]); cursor += size + 12;
  }
  return result;
}
function assemble(entries) { return Buffer.concat([signature, ...entries.map(([name, bytes]) => chunk(name, bytes))]); }
function png({ width = 9, height = 7, depth = 8, color = 3, interlace = 0, filter = 0, palette, alpha, samples }) {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color], maximum = 2 ** depth - 1;
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = depth; header[9] = color; header[12] = interlace;
  const rows = [];
  for (const [x0, y0, dx, dy] of interlace ? [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]] : [[0,0,1,1]]) {
    if (x0 >= width || y0 >= height) continue;
    let previous;
    for (let y = y0; y < height; y += dy) {
      const values = [];
      for (let x = x0; x < width; x += dx) for (let c = 0; c < channels; c++) values.push(samples[(y * width + x) * channels + c]);
      const row = Buffer.alloc(Math.ceil(values.length * depth / 8));
      for (const [i, value] of values.entries()) {
        if (!Number.isInteger(value) || value < 0 || value > maximum) throw Error('BAD_SYNTHETIC_SAMPLE');
        if (depth === 16) row.writeUInt16BE(value, i * 2);
        else if (depth === 8) row[i] = value;
        else row[(i * depth) >>> 3] |= value << (8 - depth - i * depth % 8);
      }
      const filtered = Buffer.alloc(row.length + 1), step = Math.max(1, Math.ceil(channels * depth / 8)); filtered[0] = filter;
      for (let i = 0; i < row.length; i++) {
        const a = i >= step ? row[i - step] : 0, b = previous?.[i] || 0, c = i >= step ? previous?.[i - step] || 0 : 0;
        const p = a + b - c, distances = [Math.abs(p-a), Math.abs(p-b), Math.abs(p-c)];
        const predictor = [0,a,b,Math.floor((a+b)/2),[a,b,c][distances.indexOf(Math.min(...distances))]][filter];
        filtered[i + 1] = (row[i] - predictor) & 255;
      }
      rows.push(filtered); previous = row;
    }
  }
  return assemble([['IHDR', header], ...(palette ? [['PLTE', Buffer.from(palette.flat())]] : []),
    ...(alpha ? [['tRNS', Buffer.from(alpha)]] : []), ['IDAT', zlib.deflateSync(Buffer.concat(rows))], ['IEND', Buffer.alloc(0)]]);
}
function checker(depth, color = 3, interlace = 0, filter = 0) {
  const width = 9, height = 7, channels = { 0:1,2:3,3:1,4:2,6:4 }[color], maximum = 2 ** depth - 1;
  const samples = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < channels; c++) {
    samples.push(color === 3 ? (x + y) % 2 : [4,6].includes(color) && c === channels - 1 ? maximum : (x + y + c) % 2 * maximum);
  }
  return png({ width, height, depth, color, interlace, filter, samples,
    ...(color === 3 ? { palette: [[255,0,0],[0,0,255]] } : {}) });
}
module.exports = { chunk, chunks, assemble, png, checker };
