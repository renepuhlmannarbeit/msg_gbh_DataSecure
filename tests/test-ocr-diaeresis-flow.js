'use strict';
// Real refiner plus real pixel predicate; OCR replies and raster glyphs are
// synthetic. This does not assert recognition accuracy or native desktop UAT.
const assert = require('node:assert/strict');
const { refineOcr } = require('../plugins/data-secure/server/standalone/ocr-refinement');

function fixture(texts = ['A Test']) {
  const lines = texts.map((text, row) => {
    let x = 0;
    const words = text.split(' ').map(text => {
      const start = x;
      const symbols = Array.from(text, text => {
        const bbox = { x0: x, y0: row * 40, x1: x + 24, y1: row * 40 + 30 };
        x += 26; return { text, bbox, confidence: 17 };
      });
      const bbox = { x0: start, y0: row * 40, x1: x - 2, y1: row * 40 + 30 };
      x += 2; return { text, bbox, symbols, confidence: 21 };
    });
    return { text: text + '\n', bbox: { x0: 0, y0: row * 40, x1: x - 4, y1: row * 40 + 30 }, words };
  });
  const text = lines.map(line => line.text).join('');
  return { text, confidence: 19, blocks: [{ text, paragraphs: [{ text, lines }] }] };
}
const lines = data => data.blocks[0].paragraphs[0].lines;
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function glyph(kind = 'dots') {
  const width = 24, height = 30, data = new Uint8ClampedArray(width * height * 4); data.fill(255);
  const ink = (x0, y0, x1, y1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = (y * width + x) * 4; data[p] = data[p + 1] = data[p + 2] = 0;
    }
  };
  ink(5, 11, 19, 28);
  if (kind === 'dots') { ink(7, 5, 10, 8); ink(14, 5, 17, 8); }
  if (kind === 'circumflex') ink(7, 5, 17, 8);
  return { width, height, data };
}
async function run(data, readings, { kind = 'dots', pixelFailure = false, options } = {}) {
  const pixels = [], crops = [], parameters = [], boxes = [];
  const canvas = { width: 1600, height: 200, getContext: () => ({ getImageData(x, y, width, height) {
    boxes.push({ x, y, width, height });
    if (pixelFailure) throw new Error('optional pixel read unavailable');
    assert.equal(width, 24); assert.equal(height, 30);
    const image = glyph(kind); pixels.push(image); return image;
  } }) };
  const createCanvas = (width, height) => {
    const crop = { width, height, getContext: () => ({ fillRect() {}, drawImage() {} }), toBuffer: () => Buffer.alloc(1) };
    crops.push(crop); return crop;
  };
  const queue = [...readings];
  const ocr = { async setParameters(value) { parameters.push(value); }, async recognize() {
    assert.ok(queue.length, 'no extra recognition'); return { data: { text: queue.shift() } };
  } };
  const before = JSON.stringify(data), result = await refineOcr(data, canvas, ocr, createCanvas, options);
  assert.equal(JSON.stringify(data), before, 'original metadata remains immutable');
  assert.equal(queue.length, 0);
  assert.ok(pixels.every(image => image.data.every(value => value === 0)), 'fresh private pixel buffers cleared');
  assert.ok(crops.every(crop => crop.width === 1 && crop.height === 1));
  if (readings.length) assert.deepEqual(parameters, [{ tessedit_pageseg_mode: '7' }, { tessedit_pageseg_mode: '6' }]);
  return { result, pixels, boxes };
}
let count = 0;
async function test(name, fn) { await fn(); console.log(`PASS ${++count} ${name}`); }
(async () => {
  await test('exact glyph-bound correction updates all text surfaces with original boxes and scores', async () => {
    const data = freeze(fixture()), { result, boxes } = await run(data, ['Ä Test\n']);
    assert.equal(result.text, 'Ä Test\n'); assert.equal(result.blocks[0].text, result.text);
    assert.equal(result.blocks[0].paragraphs[0].text, result.text);
    const line = lines(result)[0], original = lines(data)[0];
    assert.equal(line.text, result.text); assert.equal(line.reading_disagreement, true);
    assert.equal(line.words[0].text, 'Ä'); assert.equal(line.words[0].symbols[0].text, 'Ä');
    assert.equal(line.words[0].bbox, original.words[0].bbox);
    assert.equal(line.words[0].symbols[0].bbox, original.words[0].symbols[0].bbox);
    assert.equal(line.words[0].confidence, 21); assert.equal(line.words[0].symbols[0].confidence, 17);
    assert.equal(line.bbox, original.bbox); assert.equal(line.words[1], original.words[1]);
    assert.deepEqual(boxes, [{ x: 0, y: 0, width: 24, height: 30 }]);
    assert.equal(result.text.length, data.text.length);
  });
  await test('repeated identical lines remain bound to their own occurrence', async () => {
    const data = freeze(fixture(['A Test', 'A Test'])), { result } = await run(data, ['A Test\n', 'Ä Test\n']);
    assert.equal(result.text, 'A Test\nÄ Test\n');
    assert.equal(lines(result)[0], lines(data)[0]); assert.equal(lines(result)[1].words[0].text, 'Ä');
  });
  await test('two separate accepted line edits preserve exact positions in all aggregates', async () => {
    const data = freeze(fixture(['A Test', 'U Test'])), { result } = await run(data, ['Ä Test\n', 'Ü Test\n']);
    assert.equal(result.text, 'Ä Test\nÜ Test\n');
    assert.equal(result.blocks[0].text, result.text); assert.equal(result.blocks[0].paragraphs[0].text, result.text);
  });
  await test('supplementary Unicode, existing German characters and digits retain their exact UTF16 offsets', async () => {
    const data = freeze(fixture(['😀 A Straße 6'])), { result } = await run(data, ['😀 Ä Straße 6\n']);
    assert.equal(result.text, '😀 Ä Straße 6\n'); assert.equal(result.text.length, data.text.length);
    assert.equal(lines(result)[0].words[0], lines(data)[0].words[0]);
    assert.equal(lines(result)[0].words[2], lines(data)[0].words[2]);
    assert.equal(lines(result)[0].words[3], lines(data)[0].words[3]);
    assert.equal(lines(result)[0].words[1].symbols[0].text, 'Ä');
  });
  for (const [name, mutate] of [
    ['missing block text', data => { delete data.blocks[0].text; }],
    ['missing paragraph text', data => { delete data.blocks[0].paragraphs[0].text; }],
    ['different paragraph content', data => { data.blocks[0].paragraphs[0].text = 'Other text\n'; }],
    ['substring in root', data => { data.text = 'Prefix ' + data.text; }],
    ['substring in block', data => { data.blocks[0].text = 'Prefix ' + data.blocks[0].text; }],
    ['substring in paragraph', data => { data.blocks[0].paragraphs[0].text = 'Prefix ' + data.blocks[0].paragraphs[0].text; }],
    ['missing symbols', data => { delete lines(data)[0].words[0].symbols; }],
    ['shared line owner', data => { lines(data).push(lines(data)[0]); data.text += data.text; data.blocks[0].text = data.text; data.blocks[0].paragraphs[0].text = data.text; }]
  ]) await test(`inconsistent optional metadata refuses ${name}`, async () => {
    const data = fixture(); mutate(data); const { result, boxes } = await run(freeze(data),
      name === 'shared line owner' ? ['Ä Test\n', 'Ä Test\n'] : ['Ä Test\n']);
    assert.equal(result.text, data.text); assert.equal(boxes.length, 0);
    assert.equal(lines(result)[0].reading_disagreement, true);
  });
  for (const kind of ['ascii', 'circumflex']) await test(`no adoption for original ${kind} pixels`, async () => {
    const data = freeze(fixture()), { result } = await run(data, ['Ä Test\n'], { kind });
    assert.equal(result.text, data.text); assert.equal(lines(result)[0].words, lines(data)[0].words);
    assert.equal(lines(result)[0].reading_disagreement, true);
  });
  for (const surface of ['root', 'block', 'paragraph']) await test(`unrepresented duplicate in ${surface} cannot borrow the later glyph occurrence`, async () => {
    const data = fixture(), line = lines(data)[0];
    for (const word of line.words) {
      word.bbox.y0 += 40; word.bbox.y1 += 40;
      for (const symbol of word.symbols) { symbol.bbox.y0 += 40; symbol.bbox.y1 += 40; }
    }
    line.bbox.y0 += 40; line.bbox.y1 += 40;
    const owner = surface === 'root' ? data : surface === 'block' ? data.blocks[0] : data.blocks[0].paragraphs[0];
    owner.text += owner.text;
    const { result, boxes } = await run(freeze(data), ['Ä Test\n']);
    assert.equal(result.text, data.text); assert.equal(boxes.length, 0);
  });
  await test('a mismatch after the selected line refuses adoption of the earlier line', async () => {
    const data = fixture(['A Test', 'B Test']); data.text = 'A Test\nUnrepresented tail\n';
    const { result, boxes } = await run(freeze(data), ['Ä Test\n']);
    assert.equal(result.text, data.text); assert.equal(boxes.length, 0);
  });
  await test('known glyphs in another line cannot own the same original pixels', async () => {
    const data = fixture(['A Test', 'B Test']);
    for (const word of lines(data)[1].words) {
      word.bbox.y0 -= 40; word.bbox.y1 -= 40;
      for (const symbol of word.symbols) { symbol.bbox.y0 -= 40; symbol.bbox.y1 -= 40; }
    }
    lines(data)[1].bbox.y0 -= 40; lines(data)[1].bbox.y1 -= 40;
    const { result, boxes } = await run(freeze(data), ['Ä Test\n', 'B Test\n']);
    assert.equal(result.text, data.text); assert.equal(boxes.length, 0);
  });
  await test('edge-touching neighbouring glyph boxes remain disjoint', async () => {
    const data = fixture(['A Test', 'B Test']);
    for (const word of lines(data)[1].words) {
      word.bbox.y0 -= 10; word.bbox.y1 -= 10;
      for (const symbol of word.symbols) { symbol.bbox.y0 -= 10; symbol.bbox.y1 -= 10; }
    }
    lines(data)[1].bbox.y0 -= 10; lines(data)[1].bbox.y1 -= 10;
    const { result, boxes } = await run(freeze(data), ['Ä Test\n', 'B Test\n']);
    assert.equal(result.text, 'Ä Test\nB Test\n'); assert.equal(boxes.length, 1);
  });
  await test('an incomplete or over-budget global glyph pool cannot supply local authority', async () => {
    for (const overflow of [false, true]) {
      const data = fixture(['A Test', 'B Test']);
      if (overflow) lines(data)[1].words[0].symbols = Array(20001).fill(lines(data)[1].words[0].symbols[0]);
      else delete lines(data)[1].words[0].symbols;
      const { result, boxes } = await run(freeze(data), ['Ä Test\n', 'B Test\n']);
      assert.equal(result.text, data.text); assert.equal(boxes.length, 0);
    }
  });
  await test('optional pixel failure retains primary and restores OCR mode', async () => {
    const data = freeze(fixture()), { result } = await run(data, ['Ä Test\n'], { pixelFailure: true });
    assert.equal(result.text, data.text); assert.equal(lines(result)[0].reading_disagreement, true);
  });
  await test('a changed digit refuses the complete candidate before any pixel read', async () => {
    const data = freeze(fixture(['A Wert 6'])), { result, boxes } = await run(data, ['Ä Wert 8\n']);
    assert.equal(result.text, data.text); assert.equal(boxes.length, 0);
  });
  await test('contacts cannot receive text changing authority even with matching crop spellings', async () => {
    const data = freeze(fixture(['A qa12@quality.example.invalid']));
    const { result, boxes } = await run(data, ['qä12@quality.example.invalid\n', 'qä12@quality.example.invalid\n']);
    assert.equal(result.text, data.text); assert.equal(boxes.length, 0);
    assert.equal(lines(result)[0].contact_disagreement, true);
  });
  await test('Office contact-only mode does not reactivate ordinary crop work', async () => {
    const data = freeze(fixture()), { result, boxes } = await run(data, [], { options: { contactOnly: true } });
    assert.equal(result, data); assert.equal(boxes.length, 0);
  });
  await test('two record separators do not change primary line structure', async () => {
    const data = fixture(); lines(data)[0].text += '\n'; data.text += '\n'; data.blocks[0].text += '\n';
    data.blocks[0].paragraphs[0].text += '\n';
    const { result } = await run(freeze(data), ['Ä Test\n\n']);
    assert.equal(result.text, 'Ä Test\n\n'); assert.equal(lines(result)[0].text, result.text);
  });
  console.log(`OCR diaeresis actual refiner flow: ${count} passed, 0 failed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
