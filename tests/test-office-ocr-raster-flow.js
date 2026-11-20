'use strict';
// Actual worker-function sequence with synthetic OCR/Canvas carriers. Native
// raster/model accuracy and target-host execution belong to the separate gates.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const work = require('../plugins/data-secure/server/core/office-ocr-work-plan');
const { refineOcr } = require('../plugins/data-secure/server/standalone/ocr-refinement');
const { contactQuality } = require('../plugins/data-secure/server/standalone/ocr-quality');
const { cleanExtractedSymbolText } = require('../plugins/data-secure/server/standalone/markdown-visuals');
const { createConversionTimings } = require('../plugins/data-secure/server/standalone/conversion-timings');
const { readSparseOfficeGraphic } = require('../plugins/data-secure/server/standalone/office-ocr-sparse-graphics');
const source = fs.readFileSync(require.resolve('../plugins/data-secure/server/standalone/conversion-worker-child'), 'utf8');
const readStart = source.indexOf('async function readOcr(');
const start = source.indexOf('async function recognize('), end = source.indexOf('\nfunction hasRasterContrast(', start);
assert.ok(readStart >= 0 && readStart < start && end > start);
const facts = { kind: 'png', width: 1600, height: 900, primaryWidth: 1600, primaryHeight: 900, initialScale: 1, downsampled: false };
const data = (text, scale = 1) => ({ text, blocks: [{ paragraphs: [{ lines: Array.from({ length: 10 }, (_, row) => ({
  text: 'Geometrische Testzeile', bbox: { x0: 10 * scale, y0: (10 + row * 30) * scale, x1: 360 * scale, y1: (20 + row * 30) * scale },
  words: Array.from({ length: 6 }, (_, col) => ({ text: 'Wort', confidence: 20,
    bbox: { x0: (10 + col * 50) * scale, y0: (10 + row * 30) * scale, x1: (40 + col * 50) * scale, y1: (20 + row * 30) * scale } }))
})) }] }] });
function harness(readings, base = 1_440_000, raster) {
  const canvases = [], calls = [], modes = [];
  const makeCanvas = (width, height) => {
    const canvas = { width, height, toBuffer: () => Buffer.from('synthetic'),
      getContext: () => ({ fillRect() {}, drawImage() {}, set fillStyle(value) {} }) };
    canvases.push(canvas); return canvas;
  };
  const diagramCanvases = [];
  const createCanvas = (width, height) => {
    const canvas = makeCanvas(width, height);
    if (raster) {
      canvas.getContext = () => ({
        fillRect() {},
        putImageData(image) { diagramCanvases.push({ color: [...image.data.subarray(0, 4)], dark: image.data[16000] }); },
        drawImage(source) { assert.equal(source.width, raster.width); }
      });
    }
    return canvas;
  };
  const ledger = work.createOfficeOcrWorkLedger([{ assetId: 0, basePixels: base, bounded: true }]);
  const ocr = { async recognize() { calls.push(true); const value = readings.shift(); if (value instanceof Error) throw value; return { data: value }; },
    async setParameters(value) {
      modes.push(value);
      if (raster?.resetError && value.tessedit_pageseg_mode === '6') throw raster.resetError;
    } };
  // Production helper and its own freshly assembled geometry share a realm.
  // A foreign-realm record must remain rejected by the closed pure contract.
  const dependencies = {
    Buffer, MAX_MARKDOWN_CHARS: 2_000_000, errors: new Set(['CONVERSION_POLICY_FAILED']),
    fail: code => { throw Object.assign(new Error(code), { code }); }, canvasApi: () => ({ createCanvas }),
    conversionTimings: createConversionTimings(), refineOcr, contactQuality, cleanExtractedSymbolText,
    assessExtraOfficeOcrRaster: work.assessExtraOfficeOcrRaster, readSparseOfficeGraphic,
    uncoveredOcrText: value => value.text
  };
  const recognize = vm.runInThisContext(`(function({${Object.keys(dependencies).join(',')}}){
    ${source.slice(readStart, end)}
    return recognize;
  })`)(dependencies);
  const original = makeCanvas(raster?.width || 1600, raster?.height || 900);
  if (raster) original.getContext = () => ({ getImageData() { return { data: raster.pixels.slice() }; } });
  return { canvases, calls, modes, ledger, original, diagramCanvases,
    run: (options = { ledger, assetId: 0, facts }, regions = []) => recognize(original, ocr, regions, false, options) };
}

function wordLine(text, x, y, scale = 1) {
  const words = text.split(' ').map((value, index) => ({ text: value, confidence: 90,
    bbox: { x0: (x + 30 * index) * scale, y0: y * scale, x1: (x + 30 * index + 24) * scale, y1: (y + 10) * scale } }));
  return { text, bbox: { ...words[0].bbox, x1: words.at(-1).bbox.x1 }, words };
}

function diagramReading(lines) {
  const text = lines.map(line => line.text).join('\n') + '\n';
  return { text, blocks: [{ text, paragraphs: [{ text, lines }] }] };
}

function diagram(readings, base = 120_000, resetError) {
  const width = 480, height = 250, pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let i = 0; i < 16000; i += 4) { pixels[i] = 100; pixels[i + 1] = 12; pixels[i + 2] = 44; }
  for (let i = 16000; i < 24000; i += 4) pixels[i] = pixels[i + 1] = pixels[i + 2] = 40;
  const h = harness(readings, base, { width, height, pixels, resetError });
  return { ...h, pixels, run: () => h.run({ ledger: h.ledger, assetId: 0, sourceCanvas: h.original,
    facts: { ...facts, width, height, primaryWidth: width, primaryHeight: height } }) };
}
let count = 0;
async function test(name, run) { await run(); console.log(`PASS ${++count} ${name}`); }
(async () => {
  await test('eligible actual first geometry buys exactly one complete larger raster and preserves base reservations', async () => {
    const h = harness([data('Erste Lesung'), data('Zweite Lesung', 2)]), result = await h.run();
    assert.equal(result.text, 'Zweite Lesung'); assert.equal(result.readingDisagreement, true);
    assert.equal(h.calls.length, 2); assert.equal(result.rasterWidth, 3200); assert.equal(result.rasterHeight, 1800);
    assert.equal(h.ledger.snapshot().optionalPixels, 5_760_000); assert.equal(h.ledger.snapshot().baseReservedPixels, 1_440_000);
    assert.equal(h.canvases.length, 2); assert.equal(h.canvases[1].width, 1); assert.equal(h.canvases[0].width, 1600);
  });
  await test('denied ledger result cannot be mistaken for a truthy admission', async () => {
    const h = harness([data('Erhalten')], 119_000_000), result = await h.run();
    assert.equal(result.text, 'Erhalten'); assert.equal(h.calls.length, 1); assert.equal(h.canvases.length, 1);
    assert.equal(h.ledger.snapshot().optionalPixels, 0); assert.equal(result.readingDisagreement, false);
  });
  await test('empty second reading cannot erase usable primary text and retains primary geometry', async () => {
    const h = harness([data('Erhalten'), data('', 2)]), result = await h.run();
    assert.equal(result.text, 'Erhalten'); assert.equal(result.rasterWidth, 1600); assert.equal(result.readingDisagreement, true);
    assert.equal(h.ledger.snapshot().upscaleAssets, 1); assert.equal(h.canvases[1].height, 1);
  });
  await test('agreement remains unverified OCR without inventing a reading conflict', async () => {
    const h = harness([data('ÄÖÜß 🙂'), data('ÄÖÜß 🙂', 2)]), result = await h.run();
    assert.equal(result.text, 'ÄÖÜß 🙂'); assert.equal(result.readingDisagreement, false);
  });
  await test('native PDF regions retain their existing mask and never enter Office scaling/refinement', async () => {
    const h = harness([data('Native Maske')]), result = await h.run(undefined, [{}]);
    assert.equal(result.text, 'Native Maske'); assert.equal(h.calls.length, 1); assert.equal(h.canvases.length, 1);
    assert.equal(result.cropText, null); assert.equal(h.ledger.snapshot().optionalPixels, 0);
  });
  await test('already enlarged small bitmaps receive no recursive enlargement', async () => {
    const h = harness([data('Kleine Grafik')]), result = await h.run({ ledger: h.ledger, assetId: 0,
      facts: { ...facts, width: 800, height: 450, initialScale: 2 } });
    assert.equal(result.text, 'Kleine Grafik'); assert.equal(h.calls.length, 1); assert.equal(h.canvases.length, 1);
  });
  await test('scattered diagram labels supplement the original with exact, position-bound duplicate suppression', async () => {
    const primary = diagramReading([wordLine('Rote Legende', 20, 30), wordLine('Sprint', 80, 60)]);
    const additional = diagramReading([
      wordLine('Sprint', 80, 60, 2), wordLine('Backlog', 80, 75, 2),
      wordLine('Sprint', 205, 150, 2), wordLine('Backlog', 205, 165, 2),
      wordLine('Product', 390, 200, 2), wordLine('Increment', 390, 218, 2)
    ]);
    const h = diagram([primary, additional]), result = await h.run();
    assert.ok(result.text.startsWith(primary.text));
    assert.equal((result.text.match(/^Sprint$/gmu) || []).length, 2);
    assert.match(result.text, /Product\nIncrement/u);
    assert.deepEqual(result.wordData.at(-1).paragraphs[0].lines.at(-1).words[0].bbox,
      { x0: 390, y0: 218, x1: 414, y1: 228 });
    assert.deepEqual(h.diagramCanvases, [{ color: [255, 255, 255, 255], dark: 40 }]);
    assert.deepEqual([...h.pixels.subarray(0, 4)], [100, 12, 44, 255]);
    assert.deepEqual(h.modes, [{ tessedit_pageseg_mode: '11' }, { tessedit_pageseg_mode: '6' }]);
    assert.equal(h.calls.length, 2);
    assert.equal(h.ledger.snapshot().optionalPixels, 600_000);
    assert.ok(h.canvases.slice(1).every(canvas => canvas.width === 1 && canvas.height === 1));
    assert.equal(result.readingDisagreement, true);
  });
  await test('supplemental contacts use the existing line check after the sparse mode is restored', async () => {
    const primary = diagramReading([wordLine('Rote Legende', 20, 30)]);
    const reading = diagramReading([wordLine('E-Mail: qa@example.invalid', 50, 80, 2)]);
    const h = diagram([primary, reading, { text: 'qa@example.invalid' }, { text: 'qa@example.invalid' }]);
    const result = await h.run();
    assert.deepEqual(result.quality.contact_lines, [2]);
    assert.deepEqual(result.quality.disagreement_lines, []);
    assert.deepEqual(h.modes, ['11', '6', '7', '6'].map(tessedit_pageseg_mode => ({ tessedit_pageseg_mode })));
    assert.equal(h.calls.length, 4);
  });
  await test('denied work leaves the primary and never switches OCR mode', async () => {
    const primary = diagramReading([wordLine('Rote Legende', 20, 30)]);
    const h = diagram([primary], 119_999_999), result = await h.run();
    assert.equal(result.text, primary.text);
    assert.equal(h.calls.length, 1); assert.equal(h.modes.length, 0);
    assert.equal(h.canvases.length, 1);
  });
  await test('a raster without the diagram color profile leaves the primary with no extra OCR', async () => {
    const primary = diagramReading([wordLine('Rote Legende', 20, 30)]);
    const h = diagram([primary]);
    h.pixels.fill(255, 0, 16000);
    const result = await h.run();
    assert.equal(result.text, primary.text);
    assert.equal(h.calls.length, 1); assert.equal(h.modes.length, 0);
    assert.equal(h.ledger.snapshot().optionalPixels, 0);
  });
  await test('a failed optional reading restores OCR mode, retains primary and releases both scratch canvases', async () => {
    const primary = diagramReading([wordLine('Rote Legende', 20, 30)]);
    const h = diagram([primary, Object.assign(Error('OCR'), { code: 'CONVERSION_OCR_FAILED' })]);
    const result = await h.run();
    assert.equal(result.text, primary.text);
    assert.deepEqual(h.modes, [{ tessedit_pageseg_mode: '11' }, { tessedit_pageseg_mode: '6' }]);
    assert.ok(h.canvases.slice(1).every(canvas => canvas.width === 1 && canvas.height === 1));
  });
  await test('reset failure is hard and cannot replace an earlier hard failure', async () => {
    const primary = diagramReading([wordLine('Rote Legende', 20, 30)]);
    const resetError = new Error('reset failed');
    const hardError = Object.assign(new Error('hard reading error'), { code: 'CONVERSION_POLICY_FAILED' });
    const goodRead = diagram([primary, primary], 120_000, resetError);
    await assert.rejects(goodRead.run(), { code: 'CONVERSION_POLICY_FAILED', cause: resetError });
    const hardRead = diagram([primary, hardError], 120_000, resetError);
    await assert.rejects(hardRead.run(), error => error === hardError);
    assert.ok([...goodRead.canvases.slice(1), ...hardRead.canvases.slice(1)].every(canvas =>
      canvas.width === 1 && canvas.height === 1));
  });
  await test('Office visual rasters skip ordinary consistency crops without becoming bitmap upscale candidates', async () => {
    const h = harness([data('Geometrische Testzeile')]);
    const result = await h.run({ ledger: h.ledger, assetId: 0, facts: { ...facts, kind: null } });
    assert.equal(result.text, 'Geometrische Testzeile'); assert.equal(h.calls.length, 1);
    assert.equal(result.readingDisagreement, false); assert.equal(h.canvases.length, 1);
    assert.equal(h.ledger.snapshot().optionalPixels, 0);
  });
  await test('non-Office default still performs its bounded consistency reading and retains primary bytes on disagreement', async () => {
    const h = harness([data('Geometrische Testzeile'), { text: 'Abweichende Lesung' }]);
    const result = await h.run(null);
    assert.equal(result.text, 'Geometrische Testzeile'); assert.equal(h.calls.length, 2);
    assert.equal(result.readingDisagreement, true); assert.equal(result.wordData[0].paragraphs[0].lines[0].words.length, 6);
  });
  for (const [label, blocks] of [['null block', [null]], ['non-array blocks', {}], ['null paragraph', [{ paragraphs: [null] }]],
    ['null line', [{ paragraphs: [{ lines: [null] }] }]],
    ['non-array words', [{ paragraphs: [{ lines: [{ text: 'Erhalten', words: {} }] }] }]]]) {
    for (const office of [true, false]) await test(`${label} cannot discard usable text or fabricate geometric evidence (${office ? 'Office' : 'default'})`, async () => {
      const h = harness([{ text: 'Erhalten', blocks }]), result = await h.run(office ? { ledger: h.ledger, assetId: 0, facts } : null);
      assert.equal(result.text, 'Erhalten'); assert.equal(result.readingDisagreement, false);
      assert.equal(h.calls.length, 1); assert.equal(h.canvases.length, 1); assert.equal(h.ledger.snapshot().optionalPixels, 0);
    });
  }
  await test('a selected larger raster still executes both original eligible contact checks', async () => {
    const value = (scale) => {
      const result = data('Geometrie\nE-Mail: qa@example.invalid', scale);
      result.blocks[0].paragraphs[0].lines.push({ text: 'E-Mail: qa@example.invalid',
        bbox: { x0: 10 * scale, y0: 400 * scale, x1: 320 * scale, y1: 412 * scale },
        words: [{ text: 'E-Mail:', confidence: 80, bbox: { x0: 10 * scale, y0: 400 * scale, x1: 70 * scale, y1: 412 * scale } },
          { text: 'qa@example.invalid', confidence: 80, bbox: { x0: 80 * scale, y0: 400 * scale, x1: 320 * scale, y1: 412 * scale } }] });
      return result;
    };
    const h = harness([value(1), value(2), { text: 'qa@example.invalid' }, { text: 'qa@example.invalid' }]);
    const result = await h.run();
    assert.equal(h.calls.length, 4); assert.equal(result.quality.contact_lines.length, 1);
    assert.equal(result.quality.disagreement_lines.length, 0); assert.equal(result.rasterWidth, 3200);
    assert.deepEqual(h.modes, [{ tessedit_pageseg_mode: '7' }, { tessedit_pageseg_mode: '6' }]);
    assert.equal(h.canvases.length, 4); assert.ok(h.canvases.slice(1).every(canvas => canvas.width === 1 && canvas.height === 1));
  });
  await test('policy errors retain their exact identity, consumed reservation and owned canvas cleanup', async () => {
    const failure = Object.assign(new Error('synthetic'), { code: 'CONVERSION_POLICY_FAILED' });
    const h = harness([data('Erste Lesung'), failure]);
    await assert.rejects(h.run(), error => error === failure);
    assert.equal(h.canvases[1].width, 1); assert.equal(h.canvases[1].height, 1);
    assert.equal(h.ledger.snapshot().optionalPixels, 5_760_000);
  });
  await test('malformed OCR is a failure and never a successful quality warning', async () => {
    const h = harness([data('Erste Lesung'), { text: 23 }]);
    await assert.rejects(h.run(), { code: 'CONVERSION_OCR_FAILED' }); assert.equal(h.canvases[1].width, 1);
  });
  console.log(`${count} actual Office OCR flow groups passed; synthetic carriers, no native/desktop claim`);
})().catch(error => { console.error(error); process.exitCode = 1; });
