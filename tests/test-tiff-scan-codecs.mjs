import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
process.env.DISABLE_SYSTEM_FONTS_LOAD = '1';
const canvasApi = require('../native/ocr/pilot/node_modules/@napi-rs/canvas');
const { decodeOfficeVisual, inspectOfficeVisual } = require('../plugins/data-secure/server/standalone/office-visual-decoder');
const { decodeTiffLzw, decodeTiffFax } = require('../plugins/data-secure/server/standalone/tiff-scan-codecs');
const { CCITTFaxDecoder } = require('../plugins/data-secure/server/standalone/ccitt-fax-decoder');
const { decodePng } = require('../plugins/data-secure/server/images/png');
const fixtures = require('./lib/tiff-scan-fixtures');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const decode = async (bytes, extra = {}) => { const result = []; for await (const unit of decodeOfficeVisual(bytes, 'tiff', { canvasApi, ...extra })) result.push(unit); return result; };
const pixels = unit => decodePng(unit.png).rgba;
let count = 0;
async function test(name, fn) { await fn(); console.log(`PASS ${++count} ${name}`); }

// Independent fixture IFD reader, only for these frozen one-strip oracle files.
function stripOf(fixture) {
  const bytes = Buffer.from(fixture.tiff_base64, 'base64'), little = bytes.toString('ascii', 0, 2) === 'II';
  const u16 = p => little ? bytes.readUInt16LE(p) : bytes.readUInt16BE(p), u32 = p => little ? bytes.readUInt32LE(p) : bytes.readUInt32BE(p);
  const offset = u32(4), tags = new Map();
  for (let i = 0; i < u16(offset); i++) { const p = offset + 2 + i * 12, id = u16(p); if (![256,257,258,259,262,273,278,279,292,293].includes(id)) continue;
    assert.equal(u32(p + 4), 1); tags.set(id, u16(p + 2) === 3 ? u16(p + 8) : u32(p + 8)); }
  return { width: tags.get(256), height: tags.get(257), bits: tags.get(258), compression: tags.get(259), photo: tags.get(262),
    encoded: bytes.subarray(tags.get(273), tags.get(273) + tags.get(279)), t4: tags.get(292) || 0, t6: tags.get(293) || 0 };
}
function tiff(pages, little = true) {
  const n = 15, size = 2 + n * 12 + 4, first = 8 + pages.length * size;
  const out = Buffer.alloc(first + pages.reduce((sum, p) => sum + p.encoded.length, 0)); out.write(little ? 'II' : 'MM');
  const w16 = (v, p) => little ? out.writeUInt16LE(v, p) : out.writeUInt16BE(v, p), w32 = (v, p) => little ? out.writeUInt32LE(v, p) : out.writeUInt32BE(v, p);
  w16(42, 2); w32(8, 4); let at = first;
  for (const [i, p] of pages.entries()) {
    const offset = 8 + i * size; w16(n, offset);
    const tags = [[256,4,p.width],[257,4,p.height],[258,3,p.bits ?? 8],[259,3,p.compression ?? 1],[262,3,p.photo ?? 1],
      [273,4,at],[274,3,p.orientation ?? 1],[277,3,1],[278,4,p.height],[279,4,p.encoded.length],[284,3,1],
      [317,3,p.predictor ?? 1],[266,3,p.fillOrder ?? 1],[292,4,p.t4 ?? 0],[293,4,p.t6 ?? 0]];
    for (const [j,[tag,type,value]] of tags.entries()) { const entry = offset + 2 + j * 12; w16(tag,entry); w16(type,entry+2); w32(1,entry+4); (type === 3 ? w16 : w32)(value,entry+8); }
    w32(i + 1 < pages.length ? offset + size : 0, offset + 2 + n * 12); p.encoded.copy(out, at); at += p.encoded.length;
  }
  return out;
}
const reverse = value => Number.parseInt(value.toString(2).padStart(8, '0').split('').reverse().join(''), 2);
function literals(values) { const codes = [256, ...values, 257], out = Buffer.alloc(Math.ceil(codes.length * 9 / 8));
  for (const [i, code] of codes.entries()) for (let j = 0; j < 9; j++) out[(i*9+j)>>>3] |= ((code >>> (8-j)) & 1) << (7-((i*9+j)&7)); return out; }

for (const fixture of fixtures.cases) await test(`independent ${fixtures.pillow}/${fixtures.libtiff} ${fixture.name} exact whole-image pixels`, async () => {
  const bytes = Buffer.from(fixture.tiff_base64, 'base64'), before = sha(bytes), units = await decode(bytes);
  assert.equal(units.length, 1); assert.equal(units[0].omission_code, undefined);
  assert.equal(units[0].width, fixture.width); assert.equal(units[0].height, fixture.height);
  assert.equal(sha(pixels(units[0])), fixture.rgba_sha256); assert.equal(sha(bytes), before);
});

await test('all eight TIFF orientations preserve a nonsquare exact source pattern and swapped dimensions', async () => {
  const expected = [[10,20,30,40,50,60],[20,10,40,30,60,50],[60,50,40,30,20,10],[50,60,30,40,10,20],
    [10,30,50,20,40,60],[50,30,10,60,40,20],[60,40,20,50,30,10],[20,40,60,10,30,50]];
  for (const little of [true, false]) for (let orientation = 1; orientation <= 8; orientation++) {
    const [unit] = await decode(tiff([{width:2,height:3,orientation,encoded:Buffer.from([10,20,30,40,50,60])}], little));
    assert.equal(unit.width, orientation < 5 ? 2 : 3); assert.equal(unit.height, orientation < 5 ? 3 : 2);
    assert.deepEqual([...pixels(unit)].filter((_, i) => i % 4 === 0), expected[orientation-1]);
  }
});

await test('both endian IFD models and reversed CCITT compressed FillOrder retain oracle pixels', async () => {
  for (const fixture of fixtures.cases.filter(x => x.name !== 'tiff_lzw')) for (const little of [true, false]) for (const fillOrder of [1,2]) {
    const page = stripOf(fixture); page.fillOrder = fillOrder;
    if (fillOrder === 2) page.encoded = Buffer.from([...page.encoded].map(reverse));
    const [unit] = await decode(tiff([page], little)); assert.equal(sha(pixels(unit)), fixture.rgba_sha256);
  }
});

await test('LZW strict Clear/EOI and exact byte counts reject prefix success and trailing data', () => {
  assert.deepEqual(decodeTiffLzw(literals([42,77]), 2), Buffer.from([42,77]));
  for (const [bytes, size] of [[Buffer.from([0]),1],[literals([42]),2],[literals([42,77]),1],
    [literals([42]).subarray(0,2),1],[Buffer.concat([literals([42]), Buffer.from([0])]),1]]) {
    assert.throws(() => decodeTiffLzw(bytes,size), {code:'VISUAL_CONTENT_DAMAGED'});
  }
});

await test('LZW horizontal predictor is applied after decompression, never to encoded bytes', async () => {
  const [unit] = await decode(tiff([{width:3,height:1,compression:5,predictor:2,encoded:literals([10,20,30])}]));
  assert.deepEqual([...pixels(unit)].filter((_,i)=>i%4===0),[10,30,60]);
});

await test('damaged LZW and fax strip streams omit only their isolated pages, not later valid content', async () => {
  for (const compression of [2,3,4,5]) {
    const units = await decode(tiff([{width:1,height:1,encoded:Buffer.from([31])},
      {width:73,height:11,bits:compression===5?8:1,compression,photo:compression===5?1:0,encoded:Buffer.from([0])},
      {width:1,height:1,encoded:Buffer.from([79])}]));
    assert.equal(units.length,3); assert.equal(pixels(units[0])[0],31);
    assert.equal(units[1].omission_code,'VISUAL_CONTENT_DAMAGED'); assert.equal(pixels(units[2])[0],79);
  }
});

await test('fax invalid samples/options and TIFF orientation remain honest omissions with no decoder fallback', async () => {
  const good = stripOf(fixtures.cases.find(x=>x.name==='group4'));
  for (const extra of [{t6:2},{t4:2},{bits:8},{orientation:9},{predictor:2},{fillOrder:3}]) {
    const [unit] = await decode(tiff([{...good,...extra}])); assert.equal(unit.omission_code,'VISUAL_FEATURE_UNSUPPORTED');
  }
  assert.throws(()=>decodeTiffFax(Buffer.from([0]),32769,1,{compression:4,photo:0,fillOrder:1}),{code:'VISUAL_CONTENT_DAMAGED'});
});

await test('mixed Group3 requires an independent first row and operation exhaustion stays a hard resource error', () => {
  // EOL then the forbidden 2D first-row tag, not an implicit white reference.
  assert.throws(() => decodeTiffFax(Buffer.from([0,0x10]),8,1,{compression:3,photo:0,fillOrder:1,t4:1}),{code:'VISUAL_CONTENT_DAMAGED'});
  const page=stripOf(fixtures.cases.find(x=>x.name==='group4')); let at=0;
  const decoder=new CCITTFaxDecoder({next:()=>at<page.encoded.length?page.encoded[at++]:-1},
    {Columns:page.width,Rows:page.height,K:-1,EndOfBlock:false,BlackIs1:true,MaxOperations:1});
  assert.throws(()=>{for(let i=0;i<Math.ceil(page.width/8)*page.height;i++)decoder.readNextChar();},{code:'VISUAL_PROCESSING_LIMIT'});
});

await test('independent review regressions reject EOL repair and require Group3 FillBits alignment',()=>{
 for(const [compression,hex,t4]of [[2,'001980',0],[4,'0018',0],[3,'001980',4]])
   assert.throws(()=>decodeTiffFax(Buffer.from(hex,'hex'),8,1,{compression,photo:0,fillOrder:1,t4}),{code:'VISUAL_CONTENT_DAMAGED'});
 for(const [compression,hex,t4]of [[2,'98',0],[4,'80',0],[3,'000198',4]])
   assert.deepEqual(decodeTiffFax(Buffer.from(hex,'hex'),8,1,{compression,photo:0,fillOrder:1,t4}),Buffer.from([0]));
});

await test('rotated multipage output shares the existing finite pixel budget without clipping pages', async () => {
  const source = tiff(Array.from({length:4},(_,i)=>({width:2,height:3,orientation:6,encoded:Buffer.alloc(6,30+i*40)})));
  const units=await decode(source,{maxOutputPixels:16}); assert.equal(units.length,4);
  assert.ok(units.every(x=>x.width*x.height<=4 && x.warning_codes.includes('VISUAL_RASTER_DOWNSAMPLED')));
  assert.deepEqual(units.map(x=>pixels(x)[0]),[30,70,110,150]);
  assert.throws(()=>inspectOfficeVisual(tiff([{width:32768,height:32768,encoded:Buffer.from([0])}]),'tiff'),{code:'VISUAL_PROCESSING_LIMIT'});
});
console.log(`passed ${count} TIFF scan codec groups; real Canvas pixel oracles, no desktop/target-host UAT claim`);
