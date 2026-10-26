import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import Module, { createRequire } from 'node:module';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.DISABLE_SYSTEM_FONTS_LOAD = '1';
const api = require('../native/ocr/pilot/node_modules/@napi-rs/canvas');
const { decodePng } = require('../plugins/data-secure/server/images/png');
const { inspectOfficeVisual, decodeOfficeVisual, graphicsDecoderContract } = require('../plugins/data-secure/server/standalone/office-visual-decoder');
const font = fs.readFileSync(path.join(root, 'native/pdfjs/pilot/node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'));
let peerRequests = 0;
const originalLoad = Module._load;
let emf;
try {
  Module._load = function (name, ...args) {
    if (name.includes('@napi-rs/canvas')) { peerRequests++; throw new Error('CANVAS_PEER_MUST_NOT_LOAD'); }
    return originalLoad.call(this, name, ...args);
  };
  emf = require('../native/graphics/pilot/node_modules/emf-converter/dist/browser.js');
} finally { Module._load = originalLoad; }
const loads = [];
const options = { canvasApi: api, fontBuffers: [font], async loadBundledModule(id) {
  loads.push(id); assert.equal(id, 'emf-converter/dist/browser.js'); return emf;
} };
let passed = 0;
async function test(name, run) { await run(); console.log(`PASS ${++passed} ${name}`); }
const collect = async (bytes, format, extra = {}) => {
  const output = []; for await (const unit of decodeOfficeVisual(bytes, format, { ...options, ...extra })) output.push(unit); return output;
};
const rgba = unit => decodePng(unit.png).rgba;
const at = (unit, x, y) => [...rgba(unit).subarray((y * unit.width + x) * 4, (y * unit.width + x + 1) * 4)];
const svg = body => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40">${body}</svg>`);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function gif(frames, width = 2, height = 2) {
  const header = Buffer.alloc(13); header.write('GIF89a'); header.writeUInt16LE(width, 6); header.writeUInt16LE(height, 8); header[10] = 0x81; header[11] = 3;
  const chunks = [header, Buffer.from([255, 0, 0, 0, 0, 255, 0, 255, 0, 255, 255, 255])];
  for (const frame of frames) {
    chunks.push(Buffer.from([0x21, 0xf9, 4, ((frame.disposal || 0) << 2) | (frame.transparent === undefined ? 0 : 1), 0, 0, frame.transparent || 0, 0]));
    const descriptor = Buffer.alloc(10); descriptor[0] = 0x2c; descriptor.writeUInt16LE(frame.left || 0, 1); descriptor.writeUInt16LE(frame.top || 0, 3);
    descriptor.writeUInt16LE(frame.width || width, 5); descriptor.writeUInt16LE(frame.height || height, 7); descriptor[9] = frame.interlaced ? 64 : 0;
    chunks.push(descriptor);
    const codes = frame.codes || frame.pixels.flatMap(pixel => [4, pixel]).concat(5), data = Buffer.alloc(Math.ceil(codes.length * 3 / 8));
    for (let i = 0; i < codes.length; i++) for (let b = 0; b < 3; b++) data[(i * 3 + b) >> 3] |= ((codes[i] >> b) & 1) << ((i * 3 + b) & 7);
    chunks.push(Buffer.from([2, data.length]), data, Buffer.from([0]));
  }
  return Buffer.concat([...chunks, Buffer.from([0x3b])]);
}
function tiff(pages, little = true) {
  const count = 15, ifdSize = 2 + count * 12 + 4, firstData = 8 + pages.length * ifdSize;
  const pixelChunks = pages.map(page => page.encodedData ?? (page.compression === 8 ? zlib.deflateSync(page.data) : page.data));
  const bytes = Buffer.alloc(firstData + pixelChunks.reduce((sum, chunk, index) => sum + chunk.length + (pages[index].palette?.length || 0) * 2, 0));
  bytes.write(little ? 'II' : 'MM');
  const u16 = (value, offset) => little ? bytes.writeUInt16LE(value, offset) : bytes.writeUInt16BE(value, offset);
  const u32 = (value, offset) => little ? bytes.writeUInt32LE(value, offset) : bytes.writeUInt32BE(value, offset);
  u16(42, 2); u32(8, 4); let pixelOffset = firstData;
  for (const [index, page] of pages.entries()) {
    const offset = 8 + index * ifdSize; u16(count, offset);
    const tags = [[256, 4, page.width], [257, 4, page.height], [258, 3, page.bits || 8], [259, 3, page.compression || 1],
      [262, 3, page.photo ?? 1], [273, 4, pixelOffset], [274, 3, page.orientation || 1], [277, 3, page.samples || 1],
      [278, 4, page.height], [279, 4, pixelChunks[index].length], [284, 3, 1], [317, 3, page.predictor || 1], [338, 3, page.alpha || 0],
      [320, 3, pixelOffset + pixelChunks[index].length, page.palette?.length || 0], [266, page.fillOrderType ?? 3, page.fillOrder ?? 1]];
    for (const [n, [tag, type, value, length = 1]] of tags.entries()) {
      const entry = offset + 2 + n * 12; u16(tag, entry); u16(type, entry + 2); u32(length, entry + 4);
      if (type === 3 && length === 1) u16(value, entry + 8); else u32(value, entry + 8);
    }
    u32(index + 1 < pages.length ? offset + ifdSize : 0, offset + 2 + count * 12);
    pixelChunks[index].copy(bytes, pixelOffset); pixelOffset += pixelChunks[index].length;
    for (const channel of page.palette || []) { u16(channel, pixelOffset); pixelOffset += 2; }
  }
  return bytes;
}
function emfRecord(type, size, configure) { const bytes = Buffer.alloc(size); bytes.writeUInt32LE(type); bytes.writeUInt32LE(size, 4); configure?.(bytes); return bytes; }
function basicEmf(text = false, extra = []) {
  const records = text ? [emfRecord(84, 84, value => {
    value.writeUInt32LE(1, 24); value.writeFloatLE(1, 28); value.writeFloatLE(1, 32); value.writeInt32LE(2, 36); value.writeInt32LE(20, 40);
    value.writeUInt32LE(3, 44); value.writeUInt32LE(76, 48); value.write('ABC', 76, 'utf16le');
  })] : [emfRecord(39, 24, value => { value.writeUInt32LE(1, 8); value.writeUInt32LE(0xff, 16); }),
    emfRecord(37, 12, value => value.writeUInt32LE(1, 8)),
    emfRecord(43, 24, value => { value.writeInt32LE(2, 8); value.writeInt32LE(2, 12); value.writeInt32LE(16, 16); value.writeInt32LE(16, 20); })];
  const width = text ? 100 : 20, height = text ? 30 : 20, end = emfRecord(14, 20), header = emfRecord(1, 88);
  header.writeInt32LE(width - 1, 16); header.writeInt32LE(height - 1, 20); header.writeUInt32LE(0x464d4520, 40); header.writeUInt32LE(0x10000, 44);
  header.writeUInt32LE(88 + records.concat(extra, [end]).reduce((sum, value) => sum + value.length, 0), 48);
  header.writeUInt32LE(records.length + extra.length + 2, 52); header.writeUInt16LE(2, 56);
  return Buffer.concat([header, ...records, ...extra, end]);
}
function pdyEmf({ text = 'A', advances = [7], recordSize = 84, dxOffset = 80 } = {}) {
  const original = basicEmf(true), header = Buffer.from(original.subarray(0, 88)), end = original.subarray(original.length - 20);
  const record = emfRecord(84, recordSize, value => {
    value.writeUInt32LE(1, 24); value.writeFloatLE(1, 28); value.writeFloatLE(1, 32);
    value.writeInt32LE(2, 36); value.writeInt32LE(20, 40); value.writeUInt32LE(text.length, 44);
    value.writeUInt32LE(76, 48); value.writeUInt32LE(0x2000, 52); value.writeUInt32LE(dxOffset, 72);
    value.write(text, 76, 'utf16le'); advances.forEach((advance, index) => value.writeInt32LE(advance, dxOffset + index * 4));
  });
  header.writeUInt32LE(88 + recordSize + 20, 48); header.writeUInt32LE(3, 52);
  return Buffer.concat([header, record, end]);
}
function basicWmf(extra = []) {
  const record = (type, words) => { const value = Buffer.alloc(6 + words.length * 2); value.writeUInt32LE(value.length / 2); value.writeUInt16LE(type, 4); words.forEach((word, index) => value.writeUInt16LE(word, 6 + index * 2)); return value; };
  const records = [record(0x02fc, [0, 0xff, 0, 0]), record(0x012d, [0]), record(0x041b, [16, 16, 2, 2]), ...extra, record(0, [])];
  const header = Buffer.alloc(40); header.writeUInt32LE(0x9ac6cdd7); header.writeInt16LE(20, 10); header.writeInt16LE(20, 12); header.writeUInt16LE(96, 14);
  let checksum = 0; for (let i = 0; i < 20; i += 2) checksum ^= header.readUInt16LE(i); header.writeUInt16LE(checksum, 20);
  header.writeUInt16LE(1, 22); header.writeUInt16LE(9, 24); header.writeUInt16LE(0x300, 26);
  header.writeUInt32LE(9 + records.reduce((sum, value) => sum + value.length / 2, 0), 28); header.writeUInt16LE(1, 32); header.writeUInt32LE(7, 34);
  return Buffer.concat([header, ...records]);
}

await test('contract has one fixed browser module, existing Canvas1.0.7 and no runtime WASM', () => {
  assert.deepEqual(graphicsDecoderContract.module_ids, ['emf-converter/dist/browser.js']);
  assert.deepEqual(graphicsDecoderContract.wasm_ids, []); assert.equal(graphicsDecoderContract.canvas_version, '1.0.7');
  assert.equal(peerRequests, 0);
});
await test('actual approved Canvas SVG raster matches exact filled shape pixels', async () => {
  const source = svg('<rect x="5" y="5" width="20" height="20" fill="#ff0000"/>'), before = sha(source);
  const [unit] = await collect(source, 'svg'); assert.equal(unit.width, 100); assert.equal(unit.height, 40);
  assert.deepEqual(at(unit, 10, 10), [255, 0, 0, 255]); assert.deepEqual(at(unit, 90, 30), [255, 255, 255, 255]);
  assert.equal(sha(source), before);
});
await test('fractional viewBox-only extents bind a complete integer raster viewport', async () => {
  const source = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 19.5 9.5"><rect x="10" y="20" width="19.5" height="9.5" fill="red"/></svg>');
  const [unit] = await collect(source, 'svg'); assert.equal(unit.width, 20); assert.equal(unit.height, 10);
  assert.deepEqual(at(unit, 10, 5), [255, 0, 0, 255]);
  assert.throws(() => inspectOfficeVisual(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 19.5 9.5" width="100%" height="100%"/>'), 'svg'), { code: 'VISUAL_FEATURE_UNSUPPORTED' });
});
await test('static class, element and id styles respect specificity, source order and inline priority', async () => {
  const source = svg(`<style>rect {fill:red}.paint {fill:blue} #first {fill:lime}
    .paint {fill:yellow} rect.paint#second {fill:purple}</style>
    <rect id="first" class="paint" x="0" width="20" height="20" fill="black"/>
    <rect id="second" class="paint" x="25" width="20" height="20" style="fill:blue;fill:red"/>
    <rect class="paint" x="50" width="20" height="20"/><rect x="75" width="20" height="20"/>`);
  const before = sha(source), inspected = inspectOfficeVisual(source, 'svg');
  assert.ok(!inspected.source.includes('<style'));
  const [unit] = await collect(source, 'svg');
  assert.deepEqual(at(unit, 10, 10), [0, 255, 0, 255]);
  assert.deepEqual(at(unit, 30, 10), [255, 0, 0, 255]);
  assert.deepEqual(at(unit, 60, 10), [255, 255, 0, 255]);
  assert.deepEqual(at(unit, 85, 10), [255, 0, 0, 255]); assert.equal(sha(source), before);
});
await test('selector-list specificity and later style elements use document-wide order', async () => {
  const [unit] = await collect(svg(`<rect id="first" class="paint" width="20" height="20"/>
    <rect class="paint" x="25" width="20" height="20"/>
    <style>#first,rect {fill:lime}.paint {fill:red}</style>
    <style type="text/css" media="all">.paint{fill:blue}</style>`), 'svg');
  assert.deepEqual(at(unit, 10, 10), [0, 255, 0, 255]); assert.deepEqual(at(unit, 30, 10), [0, 0, 255, 255]);
});
await test('static styles preserve inheritance, currentColor, explicit child paint and group compositing', async () => {
  const [unit] = await collect(svg(`<style>.paint{color:blue;fill:currentColor}.half{opacity:0.5}</style>
    <g class="paint"><rect width="20" height="20"/><rect x="25" width="20" height="20" fill="red"/></g>
    <g class="half" fill="black"><rect x="50" width="20" height="20"/><rect x="55" width="15" height="20"/></g>`), 'svg');
  assert.deepEqual(at(unit, 10, 10), [0, 0, 255, 255]); assert.deepEqual(at(unit, 30, 10), [255, 0, 0, 255]);
  assert.equal(at(unit, 60, 10)[0], at(unit, 52, 10)[0]); assert.ok(at(unit, 60, 10)[0] >= 126 && at(unit, 60, 10)[0] <= 128);
});
await test('explicit inherit beats a presentation attribute; unimplemented defaulting values refuse', async () => {
  const [unit] = await collect(svg(`<style>.inherit{FILL:INHERIT}</style>
    <g fill="blue"><rect class="inherit" fill="red" width="20" height="20"/></g>`), 'svg');
  assert.deepEqual(at(unit, 10, 10), [0, 0, 255, 255]);
  for (const value of ['initial', 'unset', 'revert', 'revert-layer']) {
    assert.throws(() => inspectOfficeVisual(svg(`<style>.a{fill:${value}}</style>`), 'svg'), { code: 'VISUAL_FEATURE_UNSUPPORTED' });
  }
});
await test('explicit opacity inheritance is an honest refusal before Canvas, numeric groups remain composited', async () => {
  let calls = 0; const fake = { ...api, loadImage() { calls++; throw new Error('MUST_NOT_RENDER'); } };
  for (const body of [
    '<style>.half{opacity:0.5}.copy{opacity:inherit}</style><g class="half"><rect class="copy" width="20" height="20"/></g>',
    '<g opacity="0.5"><rect opacity="inherit" width="20" height="20"/></g>',
    '<g opacity="0.5"><rect style="opacity:INHERIT;opacity:not-a-value" width="20" height="20"/></g>',
    '<g><rect style="op&#97;city&#x3a;inherit" width="20" height="20"/></g>'
  ]) await assert.rejects(collect(svg(body), 'svg', { canvasApi: fake }), { code: 'VISUAL_FEATURE_UNSUPPORTED' });
  assert.equal(calls, 0);
  const [numeric] = await collect(svg('<style>.half{opacity:0.5}.copy{opacity:0.5}</style><g class="half"><rect class="copy" width="20" height="20"/></g>'), 'svg');
  assert.deepEqual(at(numeric, 10, 10), [191, 191, 191, 255]);
  const [overridden] = await collect(svg('<g opacity="0.5"><rect opacity="inherit" style="opacity:0.5" width="20" height="20"/></g>'), 'svg');
  assert.deepEqual(at(overridden, 10, 10), [191, 191, 191, 255]);
});
await test('visible overrides inside hidden containers refuse instead of silently losing content', async () => {
  let calls = 0; const fake = { ...api, loadImage() { calls++; throw new Error('MUST_NOT_RENDER'); } };
  for (const body of [
    '<style>.hidden{visibility:hidden}.show{visibility:visible}</style><g class="hidden"><rect class="show" width="20" height="20"/></g>',
    '<g visibility="hidden"><rect visibility="visible" width="20" height="20"/></g>',
    '<g style="v&#105;sibility&#x3a;hidden"><rect style="v&#105;sibility&#x3a;visible" width="20" height="20"/></g>',
    '<g style="visibility:collapse"><g><rect style="visibility:visible;visibility:invalid" width="20" height="20"/></g></g>',
    '<defs><g id="shape"><rect visibility="visible" width="20" height="20"/></g></defs><g visibility="hidden"><use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#shape"/></g>',
    '<defs><g id="shape"><rect width="20" height="20"/></g></defs><g visibility="hidden"><use visibility="visible" href="#shape"/></g>'
  ]) await assert.rejects(collect(svg(body), 'svg', { canvasApi: fake }), { code: 'VISUAL_FEATURE_UNSUPPORTED' });
  assert.equal(calls, 0);
  const [safe] = await collect(svg('<style>.hidden{visibility:hidden}.show{visibility:visible}</style><g class="hidden"><rect width="20" height="20"/></g><g class="show"><rect x="25" width="20" height="20" fill="blue"/></g>'), 'svg');
  assert.deepEqual(at(safe, 10, 10), [255, 255, 255, 255]); assert.deepEqual(at(safe, 30, 10), [0, 0, 255, 255]);
  const [display] = await collect(svg('<style>.hidden{display:none}.show{display:inline}</style><g class="hidden"><rect class="show" width="20" height="20"/></g>'), 'svg');
  assert.deepEqual(at(display, 10, 10), [255, 255, 255, 255]);
});
await test('supported visibility inheritance and quoted unrelated declarations retain exact pixels', async () => {
  const [unit] = await collect(svg('<g visibility="visible"><rect visibility="hidden" style="visibility:inherit" width="20" height="20" fill="blue"/></g><g visibility="hidden"><rect style="visibility:inherit" x="25" width="20" height="20" fill="red"/></g><rect x="50" width="20" height="20" fill="lime" style="font-family:\'opacity:inherit;visibility:visible\'"/>'), 'svg');
  assert.deepEqual(at(unit, 10, 10), [0, 0, 255, 255]);
  assert.deepEqual(at(unit, 30, 10), [255, 255, 255, 255]);
  assert.deepEqual(at(unit, 60, 10), [0, 255, 0, 255]);
});
await test('the closed paint value grammar renders alpha, percentages, keyword case and visibility', async () => {
  const [unit] = await collect(svg(`<style>.a{fill:RGBA(255,0,0,0.5)}.b{fill:rgb(0%,100%,0%)}
    .c{color:BLUE;fill:CURRENTCOLOR;fill-opacity:0.5}.d{fill:red;display:NONE}</style>
    <rect class="a" width="20" height="20"/><rect class="b" x="25" width="20" height="20"/>
    <rect class="c" x="50" width="20" height="20"/><rect class="d" x="75" width="20" height="20"/>`), 'svg');
  const red = at(unit, 10, 10), blue = at(unit, 60, 10);
  assert.equal(red[0], 255); assert.ok(red[1] >= 126 && red[1] <= 128); assert.equal(red[1], red[2]);
  assert.deepEqual(at(unit, 30, 10), [0, 255, 0, 255]);
  assert.equal(blue[2], 255); assert.ok(blue[0] >= 126 && blue[0] <= 128); assert.equal(blue[0], blue[1]);
  assert.deepEqual(at(unit, 85, 10), [255, 255, 255, 255]);
});
await test('class rules remain local on use instances and retain namespaced references', async () => {
  const [unit] = await collect(svg(`<style>.red{fill:red}.blue{fill:blue}</style><defs>
    <g id="shape"><rect width="15" height="15"/></g></defs>
    <use class="red" xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#shape"/><use class="blue" x="25" xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#shape"/>`), 'svg');
  assert.deepEqual(at(unit, 5, 5), [255, 0, 0, 255]); assert.deepEqual(at(unit, 30, 5), [0, 0, 255, 255]);
});
await test('CDATA, safe comments, mixed XML entities and duplicate CSS declarations have exact paint', async () => {
  const [unit] = await collect(svg(`<style><![CDATA[/* closed paint sheet */ .paint {fill:red;fill:#00ff00;stroke:rgb(0,0,255);stroke-width:2}]]></style>
    <rect class="p&#97;int" x="4" y="4" width="20" height="20"/>`), 'svg');
  assert.deepEqual(at(unit, 10, 10), [0, 255, 0, 255]); assert.deepEqual(at(unit, 4, 10), [0, 0, 255, 255]);
});
await test('static paint sheets retain bundled-only font binding and German glyph coverage', async () => {
  const [unit] = await collect(svg('<style>.ink{fill:blue}</style><text class="ink" x="2" y="25" font-family="PrivateFont" font-size="20">ÄÖÜß</text>'), 'svg');
  assert.ok(rgba(unit).some((value, index) => index % 4 === 0 && value < 200));
  assert.deepEqual(unit.warning_codes, ['VISUAL_BUNDLED_FONT_SUBSTITUTION']);
  await assert.rejects(collect(svg('<style>.ink{fill:blue}</style><text class="ink">李明</text>'), 'svg'), { code: 'VISUAL_FONT_UNAVAILABLE' });
});
await test('unknown or unsafe stylesheet models never reach native Canvas', async () => {
  let calls = 0; const fake = { ...api, loadImage() { calls++; throw new Error('MUST_NOT_RENDER'); } };
  const bodies = ['<style>@import "https://example.invalid/x";</style>',
    '<style>.a {fill:url(#gradient)}</style>', '<style>.a {fill:u\\72l(#a)}</style>',
    '<style>.a{fill:red!important}</style>', '<style>.a{--paint:red;fill:var(--paint)}</style>',
    '<style>.a{filter:blur(2px)}</style>', '<style>.a{font-family:PrivateFont}</style>',
    '<style>.a{animation:flash 1s}</style>', '<style>.a:hover{fill:red}</style>',
    '<style>g rect{fill:red}</style>', '<style>[class=a]{fill:red}</style>',
    '<style>.a{fill:revert}</style>', '<style media="screen">.a{fill:red}</style>',
    '<style title="alternate">.a{fill:red}</style>', '<style onload="anything">.a{fill:red}</style>',
    '<style><g/></style>', '<style>.a{fill:red</style>', '<style>.a{fill:red}garbage</style>',
    '<style>.a{fill:#00000000}</style>', '<style>.a{stroke-width:NaN}</style>',
    '<style>.a{fill:rgb(0%,0,0)}</style>', '<style>.a{fill:red}/*not closed</style>', '<style>.a{stroke-dasharray:1, ,2}</style>',
    '<style>.a{fill:red}</style><rect class="a" style="font:20px PrivateFont"/>'];
  for (const body of bodies) await assert.rejects(collect(svg(body), 'svg', { canvasApi: fake }), error => error.code?.startsWith('VISUAL_'));
  assert.equal(calls, 0);
});
await test('static CSS never suppresses existing XML, reference, path or active-content gates', () => {
  for (const body of ['<style>.a{fill:red}</style><script/>', '<style>.a{fill:red}</style><use href="#absent"/>',
    '<style>.a{fill:red}</style><rect id="same"/><rect id="same"/>', '<style>.a{fill:red}</style><path d="Mbad"/>',
    '<style>.a{fill:red}</style><g onclick="anything"/>', '<style>.a{fill:red}</style><foreignObject/>']) {
    assert.throws(() => inspectOfficeVisual(svg(body), 'svg'), error => error.code?.startsWith('VISUAL_'));
  }
});
await test('static stylesheet byte, rule, selector, declaration and evaluation budgets are explicit refusals', () => {
  const refused = body => assert.throws(() => inspectOfficeVisual(svg(body), 'svg'), { code: 'VISUAL_PROCESSING_LIMIT' });
  refused(`<style>/*${' '.repeat(262144)}*/</style>`);
  refused(`<style>${'.a{fill:red}'.repeat(1025)}</style>`);
  refused(`<style>${Array.from({ length: 4097 }, (_, i) => `.a${i}`).join(',')}{fill:red}</style>`);
  refused(`<style>.a{${'fill:red;'.repeat(8193)}}</style>`);
  refused(`<style>${'.a'.repeat(17)}{fill:red}</style>`);
  refused(`<style>${Array.from({ length: 1001 }, (_, i) => `.a${i}`).join(',')}{fill:red}</style>${'<rect/>'.repeat(1000)}`);
  refused(`<style/>${'<![CDATA[a]]>'.repeat(40000)}`);
  refused(`<style>*{stroke-dasharray:${Array(128).fill('1000000').join(' ')}}</style>${'<rect/>'.repeat(4200)}`);
});
await test('bundled-only German glyphs render and source font overrides cannot select a private font', async () => {
  const [unit] = await collect(svg('<text x="2" y="25" style="font:20px PrivateUserFont">ÄÖÜß</text>'), 'svg');
  assert.ok(rgba(unit).some((value, index) => index % 4 !== 3 && value < 200));
  assert.deepEqual(unit.warning_codes, ['VISUAL_BUNDLED_FONT_SUBSTITUTION']);
  assert.equal(api.GlobalFonts.has('DataSecureOffice'), true);
});
await test('missing, broken or incapable fonts are typed refusals instead of empty text success', async () => {
  await assert.rejects(collect(svg('<text>ABC</text>'), 'svg', { fontBuffers: [] }), { code: 'VISUAL_FONT_UNAVAILABLE' });
  await assert.rejects(collect(svg('<text>李明</text>'), 'svg'), { code: 'VISUAL_FONT_UNAVAILABLE' });
  await assert.rejects(collect(svg('<text>ABC</text>'), 'svg', { fontBuffers: [Buffer.from('bad-font')] }), { code: 'VISUAL_DECODER_POLICY' });
});
await test('external refs, CSS obfuscation, DTD, scripts, image, filter and foreignObject never reach Canvas', async () => {
  let calls = 0; const fake = { ...api, loadImage() { calls++; throw new Error('MUST_NOT_RENDER'); } };
  for (const body of ['<use href="file:///private/font.svg"/>', '<use href="https://example.invalid/x.svg"/>',
    '<path style="fill:url(https://example.invalid/x)"/>', '<path style="fill:u\\72l(#a)"/>',
    '<text style="font-family:Private!important">ABC</text>', '<script/>', '<image href="data:image/png;base64,AAAA"/>',
    '<filter/>', '<foreignObject/>']) await assert.rejects(collect(svg(body), 'svg', { canvasApi: fake }), error => error.code?.startsWith('VISUAL_'));
  await assert.rejects(collect(Buffer.from('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///private">]><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'), 'svg', { canvasApi: fake }));
  assert.equal(calls, 0);
});
await test('internal refs are bounded; missing, cyclic and exponentially expanded references refuse', () => {
  assert.throws(() => inspectOfficeVisual(svg('<use href="#missing"/>'), 'svg'), { code: 'VISUAL_CONTENT_DAMAGED' });
  assert.throws(() => inspectOfficeVisual(svg('<defs><g id="a"><use href="#a"/></g></defs><use href="#a"/>'), 'svg'), { code: 'VISUAL_FEATURE_UNSUPPORTED' });
  const defs = ['<g id="n0"><rect width="1" height="1"/></g>'];
  for (let i = 1; i < 16; i++) defs.push(`<g id="n${i}"><use href="#n${i - 1}"/><use href="#n${i - 1}"/></g>`);
  assert.throws(() => inspectOfficeVisual(svg(`<defs>${defs.join('')}</defs><use href="#n15"/>`), 'svg'), { code: 'VISUAL_PROCESSING_LIMIT' });
});
await test('SVG decoder and output dimensions are checked before enormous allocations', async () => {
  await assert.rejects(collect(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="999999" height="999999"/>'), 'svg'), { code: 'VISUAL_PROCESSING_LIMIT' });
  for (const limit of [0, NaN, -1, 30000001]) await assert.rejects(collect(svg('<rect/>'), 'svg', { maxOutputPixels: limit }), { code: 'VISUAL_DECODER_POLICY' });
  const [unit] = await collect(svg('<rect width="100" height="40" fill="red"/>'), 'svg', { maxOutputPixels: 400 });
  assert.ok(unit.width * unit.height <= 400); assert.ok(unit.warning_codes.includes('VISUAL_RASTER_DOWNSAMPLED'));
});
await test('all GIF frames are decoded and disposal3 restores the exact preceding patch', async () => {
  const bytes = gif([{ pixels: [0, 0, 0, 0] }, { pixels: [1], width: 1, height: 1, disposal: 3 }, { pixels: [2], left: 1, width: 1, height: 1 }]);
  const units = await collect(bytes, 'gif'); assert.equal(units.length, 3); assert.deepEqual(units.map(unit => [unit.index, unit.total]), [[1, 3], [2, 3], [3, 3]]);
  assert.deepEqual(at(units[1], 0, 0), [0, 0, 255, 255]); assert.deepEqual(at(units[2], 0, 0), [255, 0, 0, 255]);
  assert.deepEqual(at(units[2], 1, 0), [0, 255, 0, 255]);
});
await test('GIF disposal2 restores background and transparent patches do not invent black pixels', async () => {
  const units = await collect(gif([{ pixels: [0, 0, 0, 0] }, { pixels: [1], width: 1, height: 1, disposal: 2 },
    { pixels: [3], left: 1, width: 1, height: 1, transparent: 3 }]), 'gif');
  assert.deepEqual(at(units[2], 0, 0), [255, 255, 255, 255]); assert.deepEqual(at(units[2], 1, 0), [255, 0, 0, 255]);
});
await test('interlaced GIF rows are expanded in actual interlace order', async () => {
  const [unit] = await collect(gif([{ pixels: [0, 2, 1, 3], interlaced: true }], 1, 4), 'gif');
  assert.deepEqual([0, 1, 2, 3].map(y => at(unit, 0, y)), [[255, 0, 0, 255], [0, 0, 255, 255], [0, 255, 0, 255], [255, 255, 255, 255]]);
});
await test('real existing Canvas GIF encoder exercises dictionary growth and repeated frames', async () => {
  const encoder = new api.GifEncoder(32, 32, { repeat: 1 });
  try {
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let i = 0; i < pixels.length; i += 4) { pixels[i] = (i / 4) & 255; pixels[i + 1] = (i / 128) & 255; pixels[i + 3] = 255; }
    encoder.addFrame(pixels, 32, 32); encoder.addFrame(pixels, 32, 32);
    const units = await collect(encoder.finish(), 'gif'); assert.equal(units.length, 2);
    assert.deepEqual(rgba(units[0]), rgba(units[1]));
  } finally { encoder.dispose(); }
});
await test('truncated GIF LZW and absent EOI fail rather than zero-padding false decoded content', async () => {
  for (const codes of [[4, 0, 5], [4, 0, 4, 0, 4, 0, 4, 0], [7, 5]]) {
    await assert.rejects(collect(gif([{ pixels: [], codes }]), 'gif'), { code: 'VISUAL_CONTENT_DAMAGED' });
  }
});
await test('multi-frame budget is fairly divided and every unit remains explicitly addressed', async () => {
  const units = await collect(gif([{ pixels: [0, 0, 0, 0] }, { pixels: [1, 1, 1, 1] }]), 'gif', { maxOutputPixels: 2 });
  assert.equal(units.length, 2); assert.equal(units.reduce((sum, unit) => sum + unit.width * unit.height, 0), 2);
  assert.ok(units.every(unit => unit.warning_codes.includes('VISUAL_RASTER_DOWNSAMPLED')));
});
await test('TIFF little and big endian strip pages preserve exact grayscale pixels', async () => {
  for (const little of [true, false]) {
    const [unit] = await collect(tiff([{ width: 2, height: 2, data: Buffer.from([0, 85, 170, 255]) }], little), 'tiff');
    assert.deepEqual(at(unit, 0, 0), [0, 0, 0, 255]); assert.deepEqual(at(unit, 1, 1), [255, 255, 255, 255]);
  }
});
await test('TIFF bilevel white-is-zero and PackBits each preserve exact source values', async () => {
  const [bits] = await collect(tiff([{ width: 8, height: 1, bits: 1, photo: 0, data: Buffer.from([0x80]) }]), 'tiff');
  assert.deepEqual(at(bits, 0, 0), [0, 0, 0, 255]); assert.deepEqual(at(bits, 1, 0), [255, 255, 255, 255]);
  const [packed] = await collect(tiff([{ width: 2, height: 1, compression: 32773, data: Buffer.from([1, 20, 40]) }]), 'tiff');
  assert.deepEqual(at(packed, 1, 0), [40, 40, 40, 255]);
});
await test('TIFF FillOrder2 reads low-bit-first bilevel columns without silently mirroring groups', async () => {
  for (const little of [true, false]) {
    const source = tiff([{ width: 8, height: 1, bits: 1, photo: 0, fillOrder: 2, data: Buffer.from([1]) }], little), before = sha(source);
    const [unit] = await collect(source, 'tiff');
    assert.deepEqual(Array.from({ length: 8 }, (_, x) => at(unit, x, 0)[0]), [0, 255, 255, 255, 255, 255, 255, 255]);
    assert.deepEqual(unit.warning_codes, []); assert.equal(sha(source), before);
  }
  const [padded] = await collect(tiff([{ width: 9, height: 2, bits: 1, photo: 0, fillOrder: 2,
    data: Buffer.from([1, 1, 2, 0]) }]), 'tiff');
  assert.deepEqual([at(padded, 0, 0)[0], at(padded, 8, 0)[0], at(padded, 0, 1)[0], at(padded, 1, 1)[0]], [0, 0, 255, 0]);
  const [palette] = await collect(tiff([{ width: 2, height: 1, bits: 1, photo: 3, fillOrder: 2, data: Buffer.from([1]),
    palette: [65535, 0, 0, 0, 0, 65535] }]), 'tiff');
  assert.deepEqual(at(palette, 0, 0), [0, 0, 255, 255]); assert.deepEqual(at(palette, 1, 0), [255, 0, 0, 255]);
});
await test('unimplemented TIFF FillOrder sample models are typed page omissions, invalid tag types are never ignored', async () => {
  // FillOrder2 on compressed streams is not inferred from post-decode bytes;
  // TIFF6 warns that these combinations may be ambiguous outside CCITT.
  for (const page of [{ bits: 8 }, { bits: 1, compression: 8 }, { bits: 1, compression: 32773 }]) {
    const units = await collect(tiff([{ width: 1, height: 1, fillOrder: 2, data: Buffer.from([42]), ...page },
      { width: 1, height: 1, data: Buffer.from([77]) }]), 'tiff');
    assert.deepEqual(units[0], { index: 1, total: 2, omission_code: 'VISUAL_FEATURE_UNSUPPORTED' });
    assert.deepEqual(at(units[1], 0, 0), [77, 77, 77, 255]);
  }
  for (const fillOrderType of [1, 2, 4, 5]) assert.throws(() => inspectOfficeVisual(tiff([
    { width: 1, height: 1, fillOrder: 2, fillOrderType, data: Buffer.from([1]) }]), 'tiff'), { code: 'VISUAL_FEATURE_UNSUPPORTED' });
});
await test('TIFF bounded Deflate and horizontal predictor recover exact pixels', async () => {
  const [unit] = await collect(tiff([{ width: 3, height: 1, compression: 8, predictor: 2, data: Buffer.from([10, 20, 30]) }]), 'tiff');
  assert.deepEqual([0, 1, 2].map(x => at(unit, x, 0)[0]), [10, 30, 60]);
  await assert.rejects(collect(tiff([{ width: 1, height: 1, compression: 8, data: Buffer.alloc(100000, 42) }]), 'tiff'), { code: 'VISUAL_PROCESSING_LIMIT' });
});
await test('many TIFF pages are sequential and share one bounded output allocation fairly', async () => {
  const units = await collect(tiff(Array.from({ length: 10 }, (_, i) => ({ width: 4, height: 4, data: Buffer.alloc(16, i * 20) }))), 'tiff', { maxOutputPixels: 40 });
  assert.equal(units.length, 10); assert.deepEqual(units.map(unit => unit.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(units.reduce((sum, unit) => sum + unit.width * unit.height, 0), 40);
  assert.deepEqual(units.map(unit => at(unit, 0, 0)[0]), [0, 20, 40, 60, 80, 100, 120, 140, 160, 180]);
});
await test('unsupported TIFF page emits a typed omission while later independent page survives', async () => {
  // LZW5 is supported in RC176; JPEG-in-TIFF7 remains an explicit unsupported page.
  const units = await collect(tiff([{ width: 1, height: 1, compression: 7, data: Buffer.from([42]) }, { width: 1, height: 1, data: Buffer.from([77]) }]), 'tiff');
  assert.deepEqual(units[0], { index: 1, total: 2, omission_code: 'VISUAL_FEATURE_UNSUPPORTED' });
  assert.deepEqual(at(units[1], 0, 0), [77, 77, 77, 255]);
});
await test('damaged TIFF pixel streams omit only that addressed page and preserve earlier and later independent pages', async () => {
  for (const damagedPage of [
    { compression: 8, encodedData: Buffer.from([1, 2, 3]), data: Buffer.from([42]) },
    { compression: 32773, data: Buffer.from([1, 42]) },
    { compression: 1, data: Buffer.from([1, 2]) }
  ]) {
    const source = tiff([{ width: 1, height: 1, data: Buffer.from([33]) },
      { width: 1, height: 1, ...damagedPage }, { width: 1, height: 1, data: Buffer.from([77]) }]), before = sha(source);
    const units = await collect(source, 'tiff'); assert.equal(units.length, 3);
    assert.equal(units[0].index, 1); assert.deepEqual(at(units[0], 0, 0), [33, 33, 33, 255]);
    assert.deepEqual(units[1], { index: 2, total: 3, omission_code: 'VISUAL_CONTENT_DAMAGED' });
    assert.equal(units[2].index, 3); assert.deepEqual(at(units[2], 0, 0), [77, 77, 77, 255]); assert.equal(sha(source), before);
  }
  // Exact two-page shape of the independently demonstrated original countercase.
  const original = await collect(tiff([{ width: 1, height: 1, compression: 8, encodedData: Buffer.from([1, 2, 3]), data: Buffer.from([42]) },
    { width: 1, height: 1, data: Buffer.from([77]) }]), 'tiff');
  assert.deepEqual(original[0], { index: 1, total: 2, omission_code: 'VISUAL_CONTENT_DAMAGED' });
  assert.deepEqual(at(original[1], 0, 0), [77, 77, 77, 255]);
});
await test('TIFF page-local recovery never catches policy, resource, cancellation or raster backend failures', async () => {
  const source = tiff([{ width: 1, height: 1, data: Buffer.from([42]) }, { width: 1, height: 1, data: Buffer.from([77]) }]);
  for (const code of ['VISUAL_DECODER_POLICY', 'VISUAL_PROCESSING_LIMIT', 'REQUEST_CANCELLED', 'REQUEST_TIMEOUT', 'VISUAL_CONTENT_DAMAGED']) {
    let attempts = 0;
    await assert.rejects(collect(source, 'tiff', { canvasApi: { ...api, createCanvas() {
      attempts++; throw Object.assign(new Error(code), { code });
    } } }), { code });
    assert.equal(attempts, 1);
  }
});
await test('TIFF offset cycles and out-of-file strips fail in preflight without a native decoder', () => {
  const cycle = tiff([{ width: 1, height: 1, data: Buffer.from([1]) }]); cycle.writeUInt32LE(8, 8 + 2 + cycle.readUInt16LE(8) * 12);
  assert.throws(() => inspectOfficeVisual(cycle, 'tiff'), { code: 'VISUAL_CONTENT_DAMAGED' });
  const out = tiff([{ width: 1, height: 1, data: Buffer.from([1]) }]); out.writeUInt32LE(0xffffffff, 8 + 2 + 5 * 12 + 8);
  assert.throws(() => inspectOfficeVisual(out, 'tiff'), { code: 'VISUAL_CONTENT_DAMAGED' });
});
await test('global TIFF structure damage remains hard before any otherwise valid page is yielded', async () => {
  const source = tiff([{ width: 1, height: 1, data: Buffer.from([33]) }, { width: 1, height: 1, data: Buffer.from([77]) }]);
  const second = source.readUInt32LE(8 + 2 + source.readUInt16LE(8) * 12);
  source.writeUInt32LE(0xffffffff, second + 2 + 5 * 12 + 8);
  let yielded = 0;
  await assert.rejects(async () => { for await (const unit of decodeOfficeVisual(source, 'tiff', options)) { assert.ok(unit); yielded++; } },
    { code: 'VISUAL_CONTENT_DAMAGED' });
  assert.equal(yielded, 0);
});
await test('actual existing Canvas static WebP path keeps dimensions and pixels', async () => {
  const canvas = api.createCanvas(4, 4);
  try {
    const context = canvas.getContext('2d'); context.fillStyle = '#ff0000'; context.fillRect(0, 0, 4, 4);
    const source = canvas.toBuffer('image/webp', 100), [unit] = await collect(source, 'webp');
    assert.equal(unit.width, 4); assert.equal(unit.height, 4); assert.ok(at(unit, 2, 2)[0] > 240);
  } finally { canvas.width = 1; canvas.height = 1; }
});
await test('animated WebP is explicit unsupported before native decode, not first-frame success', () => {
  const bytes = Buffer.alloc(30); bytes.write('RIFF'); bytes.writeUInt32LE(22, 4); bytes.write('WEBPVP8X', 8); bytes.writeUInt32LE(10, 16); bytes[20] = 2;
  assert.throws(() => inspectOfficeVisual(bytes, 'webp'), { code: 'VISUAL_ANIMATION_UNSUPPORTED' });
});
await test('actual browser-only EMF and WMF SVG conversion renders shape without Canvas peer import', async () => {
  for (const [source, format] of [[basicEmf(), 'emf'], [basicWmf(), 'wmf']]) {
    const before = sha(source), [unit] = await collect(source, format); assert.deepEqual(at(unit, 10, 10), [255, 0, 0, 255]); assert.equal(sha(source), before);
  }
  assert.equal(peerRequests, 0); assert.ok(loads.every(value => value === 'emf-converter/dist/browser.js'));
});
await test('actual metafile text uses the exact bundled font and remains explicit substituted typography', async () => {
  const [unit] = await collect(basicEmf(true), 'emf');
  assert.ok(rgba(unit).some((value, index) => index % 4 !== 3 && value < 200));
  assert.ok(unit.warning_codes.includes('VISUAL_BUNDLED_FONT_SUBSTITUTION'));
});
await test('EMF ETO_PDY requires complete aligned X/Y advances before permissive replay', async () => {
  // Original countercase: the one X advance fit, but the mandatory Y advance did not.
  const short = pdyEmf(), before = sha(short), loadsBefore = loads.length;
  assert.throws(() => inspectOfficeVisual(short, 'emf'), { code: 'VISUAL_CONTENT_DAMAGED' });
  await assert.rejects(collect(short, 'emf'), { code: 'VISUAL_CONTENT_DAMAGED' });
  assert.equal(loads.length, loadsBefore); assert.equal(sha(short), before);
  const unaligned = pdyEmf({ advances: [7, 0], recordSize: 92, dxOffset: 81 });
  assert.throws(() => inspectOfficeVisual(unaligned, 'emf'), { code: 'VISUAL_CONTENT_DAMAGED' });
  const correct = pdyEmf({ text: 'AB', advances: [7, -4, 10, 0], recordSize: 96 });
  const correctBefore = sha(correct); assert.equal(inspectOfficeVisual(correct, 'emf').hasText, true);
  const projected = await emf.convertMetafileToSvg(correct.buffer.slice(correct.byteOffset, correct.byteOffset + correct.byteLength),
    { maxWidth: 100, maxHeight: 30, dpiScale: 1, maxRecords: 10001, exactRasterOps: false, includeSize: true });
  assert.match(projected, /<text x="2" y="20"[^>]*>A<\/text>/u);
  assert.match(projected, /<text x="9" y="16"[^>]*>B<\/text>/u); // Both original X and Y advances survive the actual browser replay.
  const rendered = await collect(correct, 'emf'); assert.equal(rendered.length, 1);
  assert.ok(rgba(rendered[0]).some((value, index) => index % 4 !== 3 && value < 200)); assert.equal(sha(correct), correctBefore);
});
await test('unknown metafile records, EMF+ and bad text offsets refuse before upstream import', async () => {
  const extra = emfRecord(0xffff, 8), plus = emfRecord(70, 16, value => { value.writeUInt32LE(4, 8); value.writeUInt32LE(0x2b464d45, 12); });
  await assert.rejects(collect(basicEmf(false, [extra]), 'emf'), { code: 'VISUAL_METAFILE_RECORD_UNSUPPORTED' });
  await assert.rejects(collect(basicEmf(false, [plus]), 'emf'), { code: 'VISUAL_EMF_PLUS_UNSUPPORTED' });
  const bad = basicEmf(true); bad.writeUInt32LE(0xfffffffe, 88 + 48);
  assert.throws(() => inspectOfficeVisual(bad, 'emf'), { code: 'VISUAL_CONTENT_DAMAGED' });
});
await test('no adapter call performs JS filesystem/network reads after fixed modules/fonts are supplied', async () => {
  const saved = new Map(), oldFetch = globalThis.fetch;
  const block = () => { throw new Error('UNAUTHORIZED_IO'); };
  try {
    for (const key of ['readFileSync', 'openSync', 'readdirSync', 'statSync']) { saved.set(key, fs[key]); fs[key] = block; }
    globalThis.fetch = block;
    const [unit] = await collect(svg('<rect width="20" height="20" fill="blue"/>'), 'svg'); assert.deepEqual(at(unit, 2, 2), [0, 0, 255, 255]);
    const [metafile] = await collect(basicEmf(), 'emf'); assert.deepEqual(at(metafile, 10, 10), [255, 0, 0, 255]);
  } finally { for (const [key, value] of saved) fs[key] = value; globalThis.fetch = oldFetch; }
});
await test('SVG malformed path, point and transform grammar refuses before rasterization', async () => {
  for (const body of ['<path d="L1 2"/>', '<path d="M0 0L1"/>', '<path d="M0 0A1 1 0 2 0 10 10"/>',
    '<path d="M0 0L1e999 0"/>', '<polyline points="1 2 3"/>', '<g transform="translate(NaN 0)"/>',
    '<g transform="matrix(1 0 0 1 0)"/>', '<g transform="unknown(1)"/>', '<g transform="scale(1e99)"/>']) {
    await assert.rejects(collect(svg(body), 'svg'), error => error.code?.startsWith('VISUAL_'));
  }
  const [unit] = await collect(svg('<g transform="translate(5 5) scale(2)"><path d="M0 0L5 0 5 5 0 5Z" fill="red"/></g>'), 'svg');
  assert.deepEqual(at(unit, 10, 10), [255, 0, 0, 255]);
  assert.throws(() => inspectOfficeVisual(svg(`<path d="M0 0${'L0 0'.repeat(33334)}"/>`), 'svg'), { code: 'VISUAL_PROCESSING_LIMIT' });
});
await test('GIF and TIFF unit limits, unsupported plaintext and truncated input stay bounded', () => {
  const frame = { width: 1, height: 1, pixels: [0] };
  assert.throws(() => inspectOfficeVisual(gif(Array.from({ length: 151 }, () => frame), 1, 1), 'gif'), { code: 'VISUAL_PROCESSING_LIMIT' });
  assert.throws(() => inspectOfficeVisual(tiff(Array.from({ length: 151 }, () => ({ width: 1, height: 1, data: Buffer.from([1]) }))), 'tiff'), { code: 'VISUAL_PROCESSING_LIMIT' });
  const plain = gif([frame], 1, 1); plain[25] = 0x21; plain[26] = 1;
  assert.throws(() => inspectOfficeVisual(plain, 'gif'), { code: 'VISUAL_FEATURE_UNSUPPORTED' });
  for (const format of ['svg', 'gif', 'tiff', 'emf', 'wmf', 'webp']) assert.throws(() => inspectOfficeVisual(Buffer.from([1]), format), error => error.code?.startsWith('VISUAL_'));
});
await test('TIFF RGB and explicit straight/premultiplied alpha preserve exact composited colors', async () => {
  const [rgb] = await collect(tiff([{ width: 1, height: 1, photo: 2, samples: 3, data: Buffer.from([20, 40, 60]) }]), 'tiff');
  assert.deepEqual(at(rgb, 0, 0), [20, 40, 60, 255]);
  const [gray] = await collect(tiff([{ width: 1, height: 1, samples: 2, alpha: 2, data: Buffer.from([0, 128]) }]), 'tiff');
  assert.deepEqual(at(gray, 0, 0), [127, 127, 127, 255]);
  const [rgbaUnit] = await collect(tiff([{ width: 1, height: 1, photo: 2, samples: 4, alpha: 1, data: Buffer.from([128, 0, 0, 128]) }]), 'tiff');
  assert.deepEqual(at(rgbaUnit, 0, 0), [255, 127, 127, 255]);
  const [palette] = await collect(tiff([{ width: 2, height: 1, bits: 1, photo: 3, data: Buffer.from([0x40]),
    palette: [65535, 0, 0, 0, 0, 65535] }]), 'tiff');
  assert.deepEqual(at(palette, 0, 0), [255, 0, 0, 255]); assert.deepEqual(at(palette, 1, 0), [0, 0, 255, 255]);
});
await test('static WebP downsampling preserves full image field instead of cropping to upper left', async () => {
  const canvas = api.createCanvas(20, 10);
  try {
    const context = canvas.getContext('2d'); context.fillStyle = 'red'; context.fillRect(0, 0, 10, 10); context.fillStyle = 'blue'; context.fillRect(10, 0, 10, 10);
    const [unit] = await collect(canvas.toBuffer('image/webp', 100), 'webp', { maxOutputPixels: 50 });
    assert.equal(unit.width, 10); assert.equal(unit.height, 5); assert.ok(at(unit, 1, 2)[0] > 200); assert.ok(at(unit, 8, 2)[2] > 200);
    assert.deepEqual(unit.warning_codes, ['VISUAL_RASTER_DOWNSAMPLED']);
  } finally { canvas.width = 1; canvas.height = 1; }
});
await test('metafile handle, matrix, Unicode and checksum errors reject before permissive replay', () => {
  const handle = basicEmf(); handle.writeUInt32LE(99, 88 + 24 + 8);
  const matrix = basicEmf(false, [emfRecord(35, 32, value => value.writeFloatLE(Infinity, 8))]);
  const unicode = basicEmf(true); unicode.writeUInt16LE(0xd800, 88 + 76);
  for (const source of [handle, matrix, unicode]) assert.throws(() => inspectOfficeVisual(source, 'emf'), error => error.code?.startsWith('VISUAL_'));
  const checksum = basicWmf(); checksum[20] ^= 1;
  assert.throws(() => inspectOfficeVisual(checksum, 'wmf'), { code: 'VISUAL_CONTENT_DAMAGED' });
});
await test('early generator return preserves input bytes and backend diagnostics stay typed', async () => {
  const source = gif([{ pixels: [0, 0, 0, 0] }, { pixels: [1, 1, 1, 1] }]), before = sha(source);
  const iterator = decodeOfficeVisual(source, 'gif', options);
  assert.equal((await iterator.next()).value.index, 1); await iterator.return();
  assert.equal(sha(source), before); assert.equal((await collect(source, 'gif')).length, 2);
  await assert.rejects(collect(svg('<rect/>'), 'svg', { canvasApi: { ...api, loadImage() { throw new Error('PRIVATE_NATIVE_DIAGNOSTIC'); } } }), error =>
    error.code === 'VISUAL_CONTENT_DAMAGED' && error.message === 'VISUAL_CONTENT_DAMAGED');
});

// Bind the actual integration functions as well as the standalone adapter.
// VM DTOs cross the host validator only through structuredClone; the product's
// exact plain-data/prototype checks are never relaxed for this test harness.
const workerSource = fs.readFileSync(path.join(root, 'plugins/data-secure/server/standalone/conversion-worker-child.js'), 'utf8');
const workerSlice = (startText, endText) => {
  const start = workerSource.indexOf(startText), end = workerSource.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, 'exact production integration functions must exist');
  return workerSource.slice(start, end);
};
const imageHelpers = require('../plugins/data-secure/server/standalone/office-image-ocr');
const { createOfficeOcrWorkLedger } = require('../plugins/data-secure/server/core/office-ocr-work-plan');
const markdownContract = require('../plugins/data-secure/server/standalone/markdown-contract');
const { MAX_PIXELS, MAX_IMAGE_BYTES } = require('../plugins/data-secure/server/images/common');
const { ERROR_CODES } = require('../plugins/data-secure/server/core/conversion-worker-contract');
const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: true };
const integrationFail = code => { throw Object.assign(new Error(code), { code }); };
const makeExtraction = value => markdownContract.createMarkdownExtraction(structuredClone(value));
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { extractOfficeMarkdownAndMedia } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const imageSource = zipStore([...opcControlEntries('docx'),
  ['word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>FHIR</w:t></w:r></w:p><w:p><w:r><w:drawing><a:blip r:embed="image"/></w:drawing></w:r></w:p></w:body></w:document>'],
  ['word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="image" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/synthetic.wmf"/></Relationships>'],
  ['word/media/synthetic.wmf', basicWmf()]]);
const graphicsContract = fs.readFileSync(path.join(root, 'native/graphics/pilot/runtime-contract.json'));
const graphicsMetadata = fs.readFileSync(path.join(root, 'native/graphics/pilot/node_modules/emf-converter/package.json'));
const graphicsModule = fs.readFileSync(path.join(root, 'native/graphics/pilot/node_modules/emf-converter/dist/browser.js'));

async function integrationPolicyCase(change) {
  let moduleLoads = 0; const snapshots = [], fontReads = [];
  const fields = {
    Buffer, crypto, path, root: 'SYNTHETIC-BUNDLED-RUNTIME', fail: integrationFail, decodeOfficeVisual, canvasApi: () => api,
    extractOfficeMarkdownAndMedia, preparePartialOfficeImagePlan: imageHelpers.preparePartialOfficeImagePlan,
    appendOfficeOcr: imageHelpers.appendOfficeOcr, officeOcrCheckpoint: imageHelpers.officeOcrCheckpoint,
    officeVisualOmission: require('../plugins/data-secure/server/standalone/office-visual-omission').officeVisualOmission,
    conversionTimings: require('../plugins/data-secure/server/standalone/conversion-timings').createConversionTimings(),
    createOfficeOcrWorkLedger: assets => createOfficeOcrWorkLedger(structuredClone(assets)),
    MAX_MARKDOWN_CHARS: markdownContract.MAX_MARKDOWN_CHARS, createMarkdownExtraction: makeExtraction,
    imageMarkdown: async () => makeExtraction({ source_type: 'png', markdown: 'GRAPHIC CONTEXT', content_options: contentOptions,
      coverage: { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED'] } }),
    localRequire() { moduleLoads++; if (change === 'missing-loader') throw Object.assign(new Error('PRIVATE_MISSING_MODULE'), { code: 'MODULE_NOT_FOUND' }); return change === 'wrong-api' ? {} : emf; },
    fs: { readFileSync(file, encoding) {
      const name = file.replaceAll('\\', '/'); let bytes;
      if (name.endsWith('/office-graphics-contract.json')) bytes = graphicsContract;
      else if (name.endsWith('/LiberationSans-Regular.ttf')) { bytes = Buffer.from(font); fontReads.push(bytes); }
      else if (name.endsWith('/emf-converter/package.json')) {
        if (change === 'missing-package') throw Object.assign(new Error('PRIVATE_MISSING_PATH'), { code: 'ENOENT' });
        bytes = change === 'wrong-version' ? Buffer.from('{"name":"emf-converter","version":"0.0.0"}')
          : change === 'changed-package' ? Buffer.concat([graphicsMetadata, Buffer.from('\n')]) : graphicsMetadata;
      } else if (name.endsWith('/emf-converter/dist/browser.js')) {
        if (change === 'missing-module') throw Object.assign(new Error('PRIVATE_MISSING_PATH'), { code: 'ENOENT' });
        bytes = change === 'changed-module' ? Buffer.concat([graphicsModule, Buffer.from('\n')]) : graphicsModule;
      } else throw new Error('UNEXPECTED_RUNTIME_READ');
      return encoding === 'utf8' ? bytes.toString('utf8') : bytes;
    } }
  };
  const operation = vm.runInNewContext(`(function(){${workerSlice('function imageOmission(', 'async function markdownRasterImages(')};return officeImageMarkdown;})()`, fields);
  try {
    const result = await operation(imageSource, 'docx', { markdownOutput: 'content-v1', partialExtraction: true }, contentOptions,
      async (value, index) => { markdownContract.validateMarkdownExtractionForOptions(value, contentOptions); snapshots.push({ value, index }); });
    return { result, snapshots, moduleLoads };
  } finally { for (const bytes of fontReads) assert.ok(bytes.every(value => value === 0), 'owned font copy cleared even on loader failure'); }
}

await test('actual Office integration preserves runtime policy failures instead of publishing damaged-image success', async () => {
  assert.equal(process.version, 'v22.23.2', 'Run the source integration proof on pinned Node22');
  const before = sha(imageSource);
  for (const change of ['wrong-version', 'changed-package', 'missing-package', 'changed-module', 'missing-module', 'missing-loader', 'wrong-api']) {
    await assert.rejects(integrationPolicyCase(change), error => error.code === 'CONVERSION_POLICY_FAILED' &&
      !/PRIVATE_|MODULE_NOT_FOUND|ENOENT/u.test(error.message), change);
  }
  assert.equal(sha(imageSource), before);
  const good = await integrationPolicyCase('none');
  assert.equal(good.moduleLoads, 1); assert.ok(good.result.markdown.includes('FHIR'));
  assert.ok(good.result.markdown.includes('GRAPHIC CONTEXT'));
  assert.equal(good.snapshots.length, 2, 'real native and image checkpoint flow is exercised');
});

await test('missing graphics injection remains a typed policy failure; arbitrary backend details stay content-free', async () => {
  await assert.rejects(collect(basicWmf(), 'wmf', { loadBundledModule: undefined }), { code: 'VISUAL_DECODER_POLICY' });
  await assert.rejects(collect(basicWmf(), 'wmf', { loadBundledModule() { throw Object.assign(new Error('PRIVATE_VENDOR_DETAILS'), { code: 'VENDOR_UNKNOWN' }); } }),
    error => error.code === 'VISUAL_CONTENT_DAMAGED' && error.message === 'VISUAL_CONTENT_DAMAGED');
});

function rasterOperation(observed, created) {
  const canvasApi = { ...api, createCanvas(width, height) {
    const canvas = api.createCanvas(width, height); created.push(canvas);
    const context = canvas.getContext('2d'), draw = context.drawImage.bind(context);
    context.drawImage = (...args) => {
      const field = { source_width: args[0].width, source_height: args[0].height, arguments: args.slice(1), width: canvas.width, height: canvas.height };
      draw(...args); const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      try { field.first = [...pixels.subarray(0, 4)]; field.last = [...pixels.subarray(-4)]; }
      finally { pixels.fill(0); }
      observed.push(field);
    };
    return canvas;
  } };
  return vm.runInNewContext(`(function(){${workerSlice('function dimensions(', 'function checkedModels(')}${workerSlice('function hasRasterContrast(', 'function imageOmission(')};return imageMarkdown;})()`, {
    Buffer, Uint8ClampedArray, fail: integrationFail, canvasApi: () => canvasApi, errors: new Set(ERROR_CODES), MAX_IMAGE_BYTES, MAX_PIXELS,
    conversionTimings: require('../plugins/data-secure/server/standalone/conversion-timings').createConversionTimings(),
    sourceCropBlocks: require('../plugins/data-secure/server/standalone/ocr-crop-geometry').sourceCropBlocks,
    decodePng, decodeRasterPng: require('../plugins/data-secure/server/standalone/png-raster-decoder').decodeRasterPng,
    decodeBmp: require('../plugins/data-secure/server/images/bmp').decodeBmp, createMarkdownExtraction: makeExtraction,
    ...require('../plugins/data-secure/server/standalone/readable-markdown'), ...require('../plugins/data-secure/server/standalone/ocr-quality'),
    recognize: async () => ({ text: 'FHIR', omitted: false, quality: require('../plugins/data-secure/server/standalone/ocr-quality').contactQuality(null, 'FHIR'), wordData: [], cropText: 'FHIR' })
  });
}
function stripSource(width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4 + (i < width * height / 2 ? 0 : 2)] = 255; rgba[i * 4 + 3] = 255;
  }
  try { return require('../plugins/data-secure/server/images/png').encodePng({ width, height, rgba }); }
  finally { rgba.fill(0); }
}

await test('real Canvas strip downsample respects original 800k share and preserves full field in both orientations', async () => {
  for (const [width, height, share] of [[1000000, 1, 800000], [1, 1000000, 800000], [1000000, 1, 3], [1, 1000000, 3],
    [31, 1, 2], [1, 31, 2], [31, 1, 1], [1, 31, 1]]) {
    const bytes = stripSource(width, height), before = sha(bytes), observed = [], created = [];
    try {
      const result = await rasterOperation(observed, created)(bytes, 'png', 'content-v1', contentOptions,
        { ocr: {}, ocrPixels: share, cropBudget: { bytes: 0, pixels: 0 } });
      assert.equal(observed.length, 1); const field = observed[0];
      assert.ok(field.width * field.height <= share, `${width}x${height}: ${field.width * field.height} > ${share}`);
      assert.equal(field.source_width, width); assert.equal(field.source_height, height);
      assert.deepEqual(field.arguments, [0, 0, field.width, field.height], 'five-argument drawImage scales the whole source, not a crop');
      if (share >= 2) { assert.ok(field.first[0] > 200 && field.first[2] < 30); assert.ok(field.last[2] > 200 && field.last[0] < 30); }
      assert.ok(result.coverage.reason_codes.includes('IMAGE_DOWNSAMPLED'), 'successful reduced-resolution OCR is disclosed as downsampled');
      assert.ok(!result.coverage.reason_codes.includes('IMAGE_PROCESSING_LIMIT'), 'successful downsampling is not reported as omitted image content');
      assert.equal(sha(bytes), before);
      assert.ok(created.every(canvas => canvas.width === 1 && canvas.height === 1), 'all owned raster dimensions released');
    } finally { bytes.fill(0); for (const canvas of created) { canvas.width = 1; canvas.height = 1; } }
  }
});

await test('invalid private OCR shares fail hard instead of disabling downsampling', async () => {
  const bytes = stripSource(8, 1);
  try {
    for (const share of [0, -1, NaN, 1.5, MAX_PIXELS + 1]) {
      const observed = [], created = [];
      await assert.rejects(rasterOperation(observed, created)(bytes, 'png', 'content-v1', contentOptions,
        { ocr: {}, ocrPixels: share, cropBudget: { bytes: 0, pixels: 0 } }), { code: 'CONVERSION_POLICY_FAILED' });
      assert.equal(observed.length, 0); assert.ok(created.every(canvas => canvas.width === 1 && canvas.height === 1));
    }
  } finally { bytes.fill(0); }
});

// Native PNG execution belongs to this explicit native gate, never source CI.
const runtime = path.join(root, 'plugins/data-secure/server');
const staticPng = require('../plugins/data-secure/server/standalone/png-raster-decoder');
const pngVariants = require('./lib/png-static-variants.cjs');
const { encodePng, decodeBmp } = require('../plugins/data-secure/server/image-sanitizer');
const pilotRequire = createRequire(path.join(root, 'native/ocr/pilot/package.json'));
function solidRgba(width, height, color = [255, 255, 255, 255]) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set(color, i * 4);
  return { width, height, rgba };
}
await test('real existing Canvas decodes validated static PNG variants with exact whole-image pixel positions', async () => {
  const prior=process.env.DISABLE_SYSTEM_FONTS_LOAD;process.env.DISABLE_SYSTEM_FONTS_LOAD='1';
  assert.equal(pilotRequire('@napi-rs/canvas/package.json').version,'1.0.7');
  const created=[],seen=[];
  const wrapped={loadImage:async bytes=>{assert.ok(Buffer.isBuffer(bytes));seen.push(Buffer.from(bytes));return api.loadImage(bytes);},
    createCanvas:(w,h)=>{const c=api.createCanvas(w,h);created.push(c);return c;}};
  try{
    for(const [color,depths]of [[0,[1,2,4,16]],[2,[16]],[3,[1,2,4,8]],[4,[16]],[6,[16]]])for(const depth of depths)for(const interlace of [0,1]){
      const bytes=pngVariants.checker(depth,color,interlace,4),before=Buffer.from(bytes);
      const image=await staticPng.decodeRasterPng(bytes,wrapped);assert.deepEqual([image.width,image.height],[9,7]);
      for(let y=0;y<7;y++)for(let x=0;x<9;x++){
        const expected=color===3?((x+y)%2?[0,0,255,255]:[255,0,0,255]):
          [...Array(3)].map((_,c)=>[0,4].includes(color)?(x+y)%2*255:(x+y+c)%2*255).concat(255);
        assert.deepEqual([...image.rgba.subarray((y*9+x)*4,(y*9+x+1)*4)],expected,`${color}/${depth}/${interlace} @ ${x},${y}`);
      }
      assert.deepEqual(bytes,before);image.rgba.fill(0);
    }
    const metadata=pngVariants.chunks(pngVariants.checker(1));metadata.splice(1,0,['tEXt',Buffer.from('Author\0PRIVATE_PNG_METADATA')]);
    await staticPng.decodeRasterPng(pngVariants.assemble(metadata),wrapped);
    assert.ok(seen.every(bytes=>!bytes.includes('PRIVATE_PNG_METADATA')&&!bytes.includes('tEXt')),'native input is private critical pixel chunks only');
    for(const depth of [1,2,4]) {
      const gray=pngVariants.png({width:2,height:1,depth,color:0,samples:[0,2**depth-1],alpha:[1,0]});
      const before=Buffer.from(gray),decoded=await staticPng.decodeRasterPng(gray,wrapped);
      assert.deepEqual([...decoded.rgba].filter((_value,index)=>index%4===3),[0,255],'ignored high tRNS sample bits cannot erase transparency');
      assert.deepEqual(gray,before);
    }
    const own=encodePng(solidRgba(2,2));let calls=0;
    const decoded=await staticPng.decodeRasterPng(own,{loadImage:()=>{calls++;throw Error('must not run');}});
    assert.equal(calls,0);assert.deepEqual(decoded.rgba,solidRgba(2,2).rgba);
    const apng=pngVariants.chunks(pngVariants.checker(1));apng.splice(1,0,['acTL',Buffer.from([0,0,0,1,0,0,0,0])]);
    const badCrc=Buffer.from(pngVariants.checker(1));badCrc[29]^=1;
    const badDeflate=pngVariants.chunks(pngVariants.checker(1));
    badDeflate.find(item=>item[0]==='IDAT')[1]=zlib.deflateSync(Buffer.alloc(100000));
    for(const bytes of [pngVariants.assemble(apng),Buffer.from('damaged PNG'),badCrc,pngVariants.assemble(badDeflate)]){
      await assert.rejects(staticPng.decodeRasterPng(bytes,{loadImage:()=>{calls++;throw Error('must not run');}}));
    }
    assert.equal(calls,0,'unsupported APNG and damaged bytes never reach native decode');
    await assert.rejects(staticPng.decodeRasterPng(pngVariants.checker(1),{}),{code:'CONVERSION_POLICY_FAILED'});
    await assert.rejects(staticPng.decodeRasterPng(pngVariants.checker(1),{...wrapped,loadImage:async()=>({width:10,height:7})}),{code:'CONVERSION_IMAGE_INVALID'});
    assert.ok(created.every(c=>c.width===1&&c.height===1),'owned native canvases released');
  }finally{for(const c of created){c.width=1;c.height=1;}for(const bytes of seen)bytes.fill(0);
    if(prior===undefined)delete process.env.DISABLE_SYSTEM_FONTS_LOAD;else process.env.DISABLE_SYSTEM_FONTS_LOAD=prior;}
});
await test('actual worker raster slice consumes validated PNG fallback and composites indexed alpha against white', async () => {
  const fs=require('node:fs'),vm=require('node:vm');
  const workerFile=path.join(runtime,'standalone/conversion-worker-child.js'),source=fs.readFileSync(workerFile,'utf8');
  const slice=(a,b)=>{const from=source.indexOf(a),to=source.indexOf(b,from);assert.ok(from>=0&&to>from);return source.slice(from,to);};
  const prior=process.env.DISABLE_SYSTEM_FONTS_LOAD;process.env.DISABLE_SYSTEM_FONTS_LOAD='1';
  const created=[],seen=[];
  const wrapped={...api,createCanvas:(width,height)=>{const c=api.createCanvas(width,height);created.push(c);return c;}};
  const options={schema:'datasecure-content-options/1',markdownOutput:'content-v1',scanOcr:true,imageOcr:true};
  const quality=require('../plugins/data-secure/server/standalone/ocr-quality');
  const operation=vm.runInNewContext(`(function(){${slice('function dimensions(','function checkedModels(')}${slice('function hasRasterContrast(','function imageOmission(')};return imageMarkdown;})()`,{
    Buffer,Uint8ClampedArray,fail:code=>{throw Object.assign(new Error(code),{code});},
    canvasApi:()=>wrapped,errors:new Set(require('../plugins/data-secure/server/core/conversion-worker-contract').ERROR_CODES),
    conversionTimings:require('../plugins/data-secure/server/standalone/conversion-timings').createConversionTimings(),
    sourceCropBlocks:require('../plugins/data-secure/server/standalone/ocr-crop-geometry').sourceCropBlocks,
    MAX_IMAGE_BYTES:require('../plugins/data-secure/server/images/common').MAX_IMAGE_BYTES,
    MAX_PIXELS:require('../plugins/data-secure/server/images/common').MAX_PIXELS,
    decodePng,decodeRasterPng:staticPng.decodeRasterPng,decodeBmp,
    // VM globals have another Object.prototype; preserve the production DTO
    // validation by the same explicit clone bridge as other source-slice tests.
    createMarkdownExtraction:value=>require('../plugins/data-secure/server/standalone/markdown-contract').createMarkdownExtraction(structuredClone(value)),
    ...require('../plugins/data-secure/server/standalone/readable-markdown'),...quality,
    recognize:async canvas=>{seen.push([...canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data]);
      return{text:'PNG_RASTER_BOUND',omitted:false,quality:quality.contactQuality(null,'PNG_RASTER_BOUND'),wordData:[],cropText:'PNG_RASTER_BOUND'};}
  });
  try{
    const bytes=pngVariants.png({width:2,height:1,depth:1,color:3,samples:[0,1],palette:[[0,0,0],[0,0,0]],alpha:[0,255]});
    const before=Buffer.from(bytes),result=await operation(bytes,'png','content-v1',options,{ocr:{},cropBudget:{bytes:0,pixels:0}});
    assert.equal(result.markdown,'PNG_RASTER_BOUND');
    assert.deepEqual(seen,[[255,255,255,255,0,0,0,255]]);
    assert.deepEqual(bytes,before);
    await assert.rejects(operation(bytes,'png','content-v1',{...options,imageOcr:false},{ocr:{}}),{code:'IMAGE_OCR_REQUIRED'});
    assert.equal(seen.length,1,'OCR consent remains required before decode');
    assert.ok(created.every(c=>c.width===1&&c.height===1));
  }finally{for(const c of created){c.width=1;c.height=1;}if(prior===undefined)delete process.env.DISABLE_SYSTEM_FONTS_LOAD;else process.env.DISABLE_SYSTEM_FONTS_LOAD=prior;}
});

console.log(`passed ${passed} bounded Office visual decoder groups; no desktop/native-target UAT claim`);
