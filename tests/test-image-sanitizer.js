'use strict';

// Image codec and redaction tests. The codecs are the reason the product can
// promise metadata-free output: everything is decoded to raw RGBA and written
// back from scratch, so no ancillary chunk can survive. These tests pin both
// that property and the pixel-level redaction.

const path = require('path');
const zlib = require('zlib');
const { createSuite } = require('./helpers');
const { crc32 } = require('./lib/zip');
const { bmp32 } = require('./lib/conversion-counterexamples');

const runtime = path.join(__dirname, '..', 'plugins', 'data-secure', 'server');
const {
  ImageSafetyError,
  decodePng,
  encodePng,
  decodeBmp,
  encodeBmp,
  stripJpegMetadata,
  flattenWords,
  entityRects,
  normalizeMime,
  extForMime,
  redactEditable
} = require(path.join(runtime, 'image-sanitizer.js'));

const { test, done, assert } = createSuite('Image sanitizer');

function solidRgba(width, height, [r, g, b, a] = [255, 255, 255, 255]) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = a;
  }
  return { width, height, rgba };
}

function pixelAt(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2], img.rgba[i + 3]];
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

test('PNG round trip preserves every pixel', () => {
  const src = solidRgba(9, 5, [10, 20, 30, 255]);
  src.rgba[0] = 200;
  src.rgba[(4 * 9 + 8) * 4 + 1] = 111;
  const back = decodePng(encodePng(src));
  assert.strictEqual(back.width, 9);
  assert.strictEqual(back.height, 5);
  assert.ok(back.rgba.equals(src.rgba), 'pixel data must survive the round trip');
});

test('PNG encoding drops ancillary chunks', () => {
  const original = encodePng(solidRgba(4, 4));
  // Splice a tEXt chunk carrying a fake author into the source image.
  const text = Buffer.from('Author\0Erika Beispiel', 'latin1');
  const type = Buffer.from('tEXt', 'ascii');
  const chunk = Buffer.alloc(12 + text.length);
  chunk.writeUInt32BE(text.length, 0);
  type.copy(chunk, 4);
  text.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([type, text])), 8 + text.length);
  const tampered = Buffer.concat([original.subarray(0, 33), chunk, original.subarray(33)]);

  const cleaned = encodePng(decodePng(tampered));
  assert.ok(tampered.includes('Erika Beispiel'), 'precondition: metadata is present before cleaning');
  assert.ok(!cleaned.includes('Erika Beispiel'), 'metadata must not survive re-encoding');
  assert.ok(!cleaned.includes('tEXt'), 'no tEXt chunk may be written');
});

test('PNG rejects decompressed data beyond the declared scanlines', () => {
  const original = encodePng(solidRgba(1, 1));
  const idat = original.indexOf(Buffer.from('IDAT', 'ascii')) - 4;
  const oldLength = original.readUInt32BE(idat);
  const raw = Buffer.concat([Buffer.from([0, 255, 255, 255, 255]), Buffer.alloc(4096, 0x41)]);
  const compressed = zlib.deflateSync(raw);
  const chunk = Buffer.alloc(12 + compressed.length);
  chunk.writeUInt32BE(compressed.length, 0);
  chunk.write('IDAT', 4, 'ascii');
  compressed.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([Buffer.from('IDAT'), compressed])), 8 + compressed.length);
  const malformed = Buffer.concat([
    original.subarray(0, idat),
    chunk,
    original.subarray(idat + 12 + oldLength)
  ]);
  assert.throws(() => decodePng(malformed), (e) => e instanceof ImageSafetyError);
});

test('PNG rejects a chunk whose declared length exceeds the file', () => {
  const bad = Buffer.from(encodePng(solidRgba(1, 1)));
  const idat = bad.indexOf(Buffer.from('IDAT', 'ascii')) - 4;
  bad.writeUInt32BE(0x7fffffff, idat);
  assert.throws(() => decodePng(bad), (e) => e instanceof ImageSafetyError);
});

test('PNG greyscale and truecolour inputs are normalised to RGBA', () => {
  // colorType 0, 8 bit, one row of two grey pixels.
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const raw = Buffer.from([0x00, 0x40, 0xc0]);
  const idat = zlib.deflateSync(raw);

  const chunk = (type, data) => {
    const t = Buffer.from(type, 'ascii');
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    t.copy(out, 4);
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length);
    return out;
  };
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);

  const img = decodePng(png);
  assert.deepStrictEqual(pixelAt(img, 0, 0), [0x40, 0x40, 0x40, 255]);
  assert.deepStrictEqual(pixelAt(img, 1, 0), [0xc0, 0xc0, 0xc0, 255]);
});

// Fixture writer only: never use the product RGBA encoder to manufacture a
// tRNS input (it cannot express that PNG colour model).
function transparencyChunk(type, data) {
  const kind = Buffer.from(type), out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length); kind.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([kind, data])), data.length + 8);
  return out;
}
function transparencyFixture(colorType, transparent, placement = 'before', filter = 0) {
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  const rows = [Buffer.from(Array(channels).fill(0).concat(Array(channels).fill(255))),
    Buffer.from(Array(channels).fill(127).concat(Array(channels).fill(0)))];
  const header = Buffer.alloc(13); header.writeUInt32BE(2); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = colorType;
  const prediction = (a, b, c) => {
    const p = a + b - c, distances = [Math.abs(p-a), Math.abs(p-b), Math.abs(p-c)];
    return [a,b,c][distances.indexOf(Math.min(...distances))];
  };
  const raw = Buffer.concat(rows.map((row, y) => Buffer.from([filter, ...row.map((value, x) => {
    const a = row[x-channels] || 0, b = rows[y-1]?.[x] || 0, c = rows[y-1]?.[x-channels] || 0;
    return (value - [0, a, b, Math.floor((a+b)/2), prediction(a,b,c)][filter]) & 255;
  })])));
  const image = transparencyChunk('IDAT', zlib.deflateSync(raw));
  const trns = transparent === null ? [] : [transparencyChunk('tRNS', transparent)];
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), transparencyChunk('IHDR', header),
    ...(placement === 'before' ? trns : []), image, ...(placement === 'after' ? trns : []),
    ...(placement === 'duplicate' ? trns.concat(trns) : []), transparencyChunk('IEND', Buffer.alloc(0))]);
}

test('PNG tRNS has exact alpha and unchanged pixel coordinates for gray/RGB and every scanline filter', () => {
  for (const type of [0,2]) for (const filter of [0,1,2,3,4]) {
    const bytes = transparencyFixture(type, Buffer.alloc(type === 0 ? 2 : 6), 'before', filter);
    const before = Buffer.from(bytes), decoded = decodePng(bytes);
    assert.deepEqual([decoded.width, decoded.height], [2,2]);
    assert.deepEqual([...decoded.rgba], [0,0,0,0, 255,255,255,255, 127,127,127,255, 0,0,0,0]);
    assert.deepEqual(decodePng(encodePng(decoded)).rgba, decoded.rgba);
    assert.deepEqual(bytes, before);
    const opaque = decodePng(transparencyFixture(type, null, 'before', filter));
    assert.deepEqual([...opaque.rgba].filter((_value, index) => index % 4 === 3), [255,255,255,255]);
  }
  // PNG 3 specifies masking unused high sample bits for an 8-bit image.
  assert.equal(decodePng(transparencyFixture(0, Buffer.from([1,0]))).rgba[3], 0);
  for (const type of [4,6]) {
    const rgba = decodePng(transparencyFixture(type, null)).rgba;
    assert.deepEqual([...rgba].filter((_value, index) => index % 4 === 3), [0,255,127,0]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(4); header.writeUInt32BE(1,4); header[8] = 8; header[9] = 2;
  const almost = Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), transparencyChunk('IHDR',header),
    transparencyChunk('tRNS',Buffer.from([0,1,0,2,0,3])),
    transparencyChunk('IDAT',zlib.deflateSync(Buffer.from([0, 1,2,3, 1,2,4, 1,3,3, 0,2,3]))), transparencyChunk('IEND',Buffer.alloc(0))]);
  assert.deepEqual([...decodePng(almost).rgba], [1,2,3,0, 1,2,4,255, 1,3,3,255, 0,2,3,255], 'all three key samples must match exactly');
});

test('independent fixed PNG samples flatten to white instead of exposing transparent black as OCR contrast', () => {
  // Independently decoded by System.Drawing.Bitmap: pixel alpha [0,255].
  const samples = ['iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAAAAADRSSBWAAAAAnRSTlMAAHaTzTgAAAALSURBVHicY2D4DwABAgEAQr68aAAAAABJRU5ErkJggg==',
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAABnRSTlMAAAAAAABupgeRAAAAD0lEQVR4nGNgYGD4//8/AAYBAv4CsjmuAAAAAElFTkSuQmCC'];
  for (const encoded of samples) {
    const decoded = decodePng(Buffer.from(encoded, 'base64'));
    assert.deepEqual([...decoded.rgba], [0,0,0,0,255,255,255,255]);
    const white = [...decoded.rgba].map((value, i, rgba) => i%4 === 3 ? 255 : Math.round((value*rgba[i-i%4+3]+255*(255-rgba[i-i%4+3]))/255));
    assert.deepEqual(white, Array(8).fill(255));
  }
});

test('PNG malformed tRNS fails before pixels: length, duplicate, position, alpha colour type and CRC', () => {
  for (const bytes of [transparencyFixture(0, Buffer.alloc(1)), transparencyFixture(2, Buffer.alloc(2)),
    transparencyFixture(0, Buffer.alloc(2), 'duplicate'), transparencyFixture(0, Buffer.alloc(2), 'after'),
    transparencyFixture(4, Buffer.alloc(2)), transparencyFixture(6, Buffer.alloc(6))]) {
    assert.throws(() => decodePng(bytes), error => error instanceof ImageSafetyError);
  }
  const crc = transparencyFixture(2, Buffer.alloc(6)); crc[crc.indexOf(Buffer.from('tRNS')) + 4] ^= 1;
  assert.throws(() => decodePng(crc), error => error instanceof ImageSafetyError);
});

test('a non PNG buffer is refused', () => {
  assert.throws(() => decodePng(Buffer.alloc(40)), (e) => e instanceof ImageSafetyError);
});

test('an interlaced or high bit depth PNG is refused instead of half decoded', () => {
  const good = encodePng(solidRgba(4, 4));
  const interlaced = Buffer.from(good);
  interlaced[8 + 8 + 12] = 1; // IHDR interlace byte
  assert.throws(() => decodePng(interlaced), (e) => e instanceof ImageSafetyError);
});

// Standalone-only: the old synchronous sanitizer remains deliberately narrow.
// A complete bounded preflight, not its thrown error, authorizes native PNG.
const staticPng = require('../plugins/data-secure/server/standalone/png-raster-decoder');
const pngVariants = require('./lib/png-static-variants.cjs');
test('static PNG preflight admits exact low-depth, indexed, 16-bit and Adam7 scanlines', () => {
  for (const [color, depths] of [[0,[1,2,4,8,16]],[2,[8,16]],[3,[1,2,4,8]],[4,[8,16]],[6,[8,16]]]) {
    for (const depth of depths) for (const interlace of [0,1]) for (const filter of [0,1,2,3,4]) {
      const bytes = pngVariants.checker(depth,color,interlace,filter), before = Buffer.from(bytes);
      const plan = staticPng.inspectStaticPng(bytes);
      assert.deepEqual([plan.width,plan.height,plan.depth,plan.color,plan.interlace],[9,7,depth,color,interlace]);
      assert.equal(plan.ownSubset,depth===8&&interlace===0&&color!==3);
      assert.deepEqual(bytes,before); plan.nativeBytes.fill(0);
    }
  }
});
test('static PNG CRC/order/type/palette/scanline negatives never become unsupported-feature dispatch', () => {
  const good=pngVariants.checker(2), entries=pngVariants.chunks(good), get=name=>entries.find(item=>item[0]===name)[1];
  const mutate=fn=>pngVariants.assemble(fn(entries.map(([name,data])=>[name,Buffer.from(data)])));
  const raw=zlib.inflateSync(get('IDAT'));
  const badFilter=Buffer.from(raw);badFilter[0]=5;
  const badPalette=Buffer.from(raw);badPalette[1]=0xff;
  const badHeader=Buffer.from(get('IHDR'));badHeader[8]=16;
  const badReserved=Buffer.from(good);badReserved[14]=0x68;badReserved.writeUInt32BE(crc32(badReserved.subarray(12,29)),29);
  const badCrc=Buffer.from(good);badCrc[29]^=1;
  const badHighType=Buffer.from(good);badHighType[12]|=128;badHighType.writeUInt32BE(crc32(badHighType.subarray(12,29)),29);
  const badLength=Buffer.from(good);badLength.writeUInt32BE(0x7fffffff,8);
  const badDimension=Buffer.from(get('IHDR'));badDimension.writeUInt32BE(30000001,0);badDimension.writeUInt32BE(1,4);
  const cases=[badCrc,badReserved,badHighType,badLength,Buffer.concat([good,Buffer.from('x')]),good.subarray(0,-1),
    mutate(x=>[x[0],x[0],...x.slice(1)]), mutate(x=>x.filter(i=>i[0]!=='PLTE')),
    mutate(x=>x.map(i=>i[0]==='IHDR'?['IHDR',badHeader]:i)),
    mutate(x=>x.map(i=>i[0]==='PLTE'?['PLTE',Buffer.alloc(15)]:i)),
    mutate(x=>[x[0],['tRNS',Buffer.from([0])],...x.slice(1)]),
    mutate(x=>[...x.slice(0,-1),['tRNS',Buffer.from([0])],x.at(-1)]),
    mutate(x=>[x[0],x[1],['IDAT',get('IDAT').subarray(0,2)],['tEXt',Buffer.from('A\0B')],['IDAT',get('IDAT').subarray(2)],x.at(-1)]),
    ...[badFilter,badPalette,raw.subarray(0,-1),Buffer.concat([raw,Buffer.from([0])])].map(value=>
      mutate(x=>x.map(i=>i[0]==='IDAT'?['IDAT',zlib.deflateSync(value)]:i))),
    mutate(x=>x.map(i=>i[0]==='IDAT'?['IDAT',Buffer.concat([i[1],Buffer.from([0])])]:i)),
    mutate(x=>[...x.slice(0,-1),['IEND',Buffer.from([0])]])];
  for(const bytes of cases)assert.throws(()=>staticPng.inspectStaticPng(bytes),e=>e instanceof staticPng.PngRasterError&&e.code==='CONVERSION_IMAGE_INVALID');
  assert.throws(()=>staticPng.inspectStaticPng(mutate(x=>x.map(i=>i[0]==='IHDR'?['IHDR',badDimension]:i))),{code:'CONVERSION_PIXEL_LIMIT'});
});
test('static PNG explicitly refuses APNG and unknown critical/ancillary features', () => {
  const entries=pngVariants.chunks(pngVariants.checker(1));
  for(const [extra,feature]of [[['acTL',Buffer.from([0,0,0,1,0,0,0,0])],'APNG'],[['ABCD',Buffer.alloc(0)],'UNKNOWN_CRITICAL'],[['abCd',Buffer.alloc(0)],'UNKNOWN_ANCILLARY']]){
    const bytes=pngVariants.assemble([entries[0],extra,...entries.slice(1)]);
    assert.throws(()=>staticPng.inspectStaticPng(bytes),e=>e instanceof staticPng.PngUnsupportedFeatureError&&e.feature===feature);
  }
  for(const value of ['https://example.invalid/x.png','C:/private.png','<svg/>',new Uint8Array([1,2])])
    assert.throws(()=>staticPng.inspectStaticPng(value),{code:'CONVERSION_IMAGE_INVALID'});
});

// ---------------------------------------------------------------------------
// BMP
// ---------------------------------------------------------------------------

test('BMP round trip preserves colour channels', () => {
  const src = solidRgba(6, 3, [1, 2, 3, 255]);
  src.rgba[0] = 250;
  src.rgba[1] = 128;
  src.rgba[2] = 7;
  const back = decodeBmp(encodeBmp(src));
  assert.strictEqual(back.width, 6);
  assert.strictEqual(back.height, 3);
  assert.deepStrictEqual(pixelAt(back, 0, 0), [250, 128, 7, 255]);
});

test('a compressed or paletted BMP is refused', () => {
  const bmp = encodeBmp(solidRgba(4, 4));
  bmp.writeUInt16LE(8, 28); // 8 bit per pixel
  assert.throws(() => decodeBmp(bmp), (e) => e instanceof ImageSafetyError);
});
test('independently generated 32-bit BI_RGB pixels ignore the unused high byte in either row order', () => {
  const source = { width: 2, height: 2, rgba: Buffer.from([0, 0, 0, 255, 250, 128, 7, 255, 20, 30, 40, 255, 255, 255, 255, 255]) };
  for (const topDown of [false, true]) for (const unused of [0, 1, 128, 255]) {
    const bytes = bmp32(source, { topDown, unused }), before = Buffer.from(bytes);
    assert.deepStrictEqual(decodeBmp(bytes).rgba, source.rgba);
    assert.deepStrictEqual(bytes, before);
  }
});
test('BMP alpha masks and inconsistent header extents are explicitly refused', () => {
  for (const [offset, value, size] of [[30, 3, 4], [14, 108, 4], [10, 40, 4], [26, 2, 2]]) {
    const bytes = bmp32(solidRgba(4, 4));
    if (size === 2) bytes.writeUInt16LE(value, offset); else bytes.writeUInt32LE(value, offset);
    assert.throws(() => decodeBmp(bytes), error => error instanceof ImageSafetyError);
  }
});

test('a truncated BMP is refused', () => {
  const bmp = encodeBmp(solidRgba(8, 8));
  assert.throws(() => decodeBmp(bmp.subarray(0, 60)), (e) => e instanceof ImageSafetyError);
});

// ---------------------------------------------------------------------------
// JPEG metadata
// ---------------------------------------------------------------------------

test('JPEG EXIF and comment segments are stripped', () => {
  const exifPayload = Buffer.from('Exif\0\0GPS 53.5511 9.9937 Erika', 'latin1');
  const exif = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    (() => {
      const b = Buffer.alloc(2);
      b.writeUInt16BE(exifPayload.length + 2, 0);
      return b;
    })(),
    exifPayload
  ]);
  const comment = Buffer.concat([Buffer.from([0xff, 0xfe, 0x00, 0x0a]), Buffer.from('geheim!!', 'latin1')]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00]);
  const scan = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0xff, 0xd9]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), exif, comment, sof, scan]);

  const cleaned = stripJpegMetadata(jpeg);
  assert.ok(jpeg.includes('GPS 53.5511'), 'precondition: EXIF present');
  assert.ok(!cleaned.includes('GPS 53.5511'), 'EXIF must be removed');
  assert.ok(!cleaned.includes('geheim!!'), 'JPEG comment must be removed');
  assert.ok(cleaned.length < jpeg.length, 'stripped image must be smaller');
  assert.deepStrictEqual([...cleaned.subarray(0, 2)], [0xff, 0xd8], 'SOI marker must be kept');
});

// ---------------------------------------------------------------------------
// OCR mapping and redaction
// ---------------------------------------------------------------------------

test('flattenWords builds a text offset index from a flat word list', () => {
  const flat = flattenWords({
    words: [
      { text: 'Max', bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } },
      { text: 'Mustermann', bbox: { x0: 12, y0: 0, x1: 60, y1: 10 } }
    ]
  });
  assert.strictEqual(flat.text, 'Max Mustermann');
  assert.strictEqual(flat.words[0].start, 0);
  assert.strictEqual(flat.words[0].end, 3);
  assert.strictEqual(flat.words[1].start, 4);
});

test('flattenWords understands the nested block structure too', () => {
  const flat = flattenWords({
    blocks: [
      {
        paragraphs: [
          { lines: [{ words: [{ text: 'Hallo', bbox: { x0: 1, y0: 1, x1: 5, y1: 5 } }] }] }
        ]
      }
    ]
  });
  assert.strictEqual(flat.text, 'Hallo');
});

test('entityRects maps character spans back to word rectangles', () => {
  const flat = flattenWords({
    words: [
      { text: 'Kunde', bbox: { x0: 0, y0: 0, x1: 20, y1: 10 } },
      { text: 'Max', bbox: { x0: 22, y0: 0, x1: 40, y1: 10 } },
      { text: 'Mustermann', bbox: { x0: 42, y0: 0, x1: 90, y1: 10 } }
    ]
  });
  const rects = entityRects([{ start: 6, end: 20 }], flat.words);
  assert.strictEqual(rects.length, 2, 'both name words must be covered');
  assert.strictEqual(rects[0].x0, 22);
});

test('entityRects ignores spans without finite offsets', () => {
  const flat = flattenWords({ words: [{ text: 'A', bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } }] });
  assert.deepStrictEqual(entityRects([{ start: NaN, end: 3 }], flat.words), []);
});

test('compatibility identifiers map to exactly their original OCR words after UTF-16 and compatibility prefixes', () => {
  const pii = require(path.join(runtime, 'pii-engine.js'));
  const { professionalText, identifierCases } = require('./lib/identifier-compatibility');
  for (const { type, label, value } of identifierCases) {
    const flat = flattenWords({ words: [
      { text: professionalText, bbox: { x0: 0, y0: 0, x1: 30, y1: 10 } },
      { text: label || 'Kontakt:', bbox: { x0: 32, y0: 0, x1: 50, y1: 10 } },
      { text: value, bbox: { x0: 52, y0: 0, x1: 90, y1: 10 } },
      { text: '. fachlicher nachsatz', bbox: { x0: 92, y0: 0, x1: 140, y1: 10 } }
    ] });
    const spans = pii.sensitiveSpans(flat.text, 'general').filter((span) => span.type === type);
    assert.ok(spans.some((span) => span.text === value));
    for (const span of spans) assert.strictEqual(flat.text.slice(span.start, span.end), span.text);
    assert.deepStrictEqual(entityRects(spans, flat.words), [flat.words[2].bbox], type);
    assert.strictEqual(flat.words[0].text, professionalText);
    assert.ok(pii.verifyRedactedText(flat.text).some((hit) => hit.type === type && hit.text === value));
  }
});

test('redaction blackens the requested rectangle and leaves the rest intact', () => {
  const src = solidRgba(20, 10, [255, 255, 255, 255]);
  const png = encodePng(src);
  const out = decodePng(redactEditable(png, 'image/png', [{ x0: 5, y0: 2, x1: 9, y1: 6 }]));
  assert.deepStrictEqual(pixelAt(out, 7, 4), [0, 0, 0, 255], 'centre of the rect must be black');
  assert.deepStrictEqual(pixelAt(out, 19, 9), [255, 255, 255, 255], 'far corner must be untouched');
});

test('redaction pads the rectangle so anti-aliased glyph edges are covered', () => {
  const src = solidRgba(20, 10);
  const out = decodePng(redactEditable(encodePng(src), 'image/png', [{ x0: 8, y0: 4, x1: 10, y1: 6 }]));
  assert.deepStrictEqual(pixelAt(out, 5, 4), [0, 0, 0, 255], 'padding must extend beyond the glyph box');
});

test('redaction clamps rectangles to the image bounds', () => {
  const src = solidRgba(6, 6);
  const out = decodePng(
    redactEditable(encodePng(src), 'image/png', [{ x0: -50, y0: -50, x1: 500, y1: 500 }])
  );
  assert.deepStrictEqual(pixelAt(out, 0, 0), [0, 0, 0, 255]);
  assert.deepStrictEqual(pixelAt(out, 5, 5), [0, 0, 0, 255]);
});

test('an unredactable format is refused rather than passed through', () => {
  assert.throws(
    () => redactEditable(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg', [{ x0: 0, y0: 0, x1: 1, y1: 1 }]),
    (e) => e instanceof ImageSafetyError
  );
});

// ---------------------------------------------------------------------------
// Mime handling
// ---------------------------------------------------------------------------

test('mime types are normalised from the attachment extension', () => {
  assert.strictEqual(normalizeMime({ mimeType: 'image/jpg' }), 'image/jpeg');
  assert.strictEqual(normalizeMime({ extension: 'BMP' }), 'image/bmp');
  assert.strictEqual(normalizeMime({ extension: 'emf' }), '');
  assert.strictEqual(extForMime('image/png'), 'png');
  assert.strictEqual(extForMime('application/pdf'), 'bin');
});

done();
