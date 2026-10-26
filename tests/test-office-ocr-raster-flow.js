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
const source = fs.readFileSync(require.resolve('../plugins/data-secure/server/standalone/conversion-worker-child'), 'utf8');
const start = source.indexOf('async function recognize('), end = source.indexOf('\nfunction hasRasterContrast(', start);
assert.ok(start >= 0 && end > start);
const facts = { kind: 'png', width: 1600, height: 900, primaryWidth: 1600, primaryHeight: 900, initialScale: 1, downsampled: false };
const data = (text, scale = 1) => ({ text, blocks: [{ paragraphs: [{ lines: Array.from({ length: 10 }, (_, row) => ({
  text: 'Geometrische Testzeile', bbox: { x0: 10 * scale, y0: (10 + row * 30) * scale, x1: 360 * scale, y1: (20 + row * 30) * scale },
  words: Array.from({ length: 6 }, (_, col) => ({ text: 'Wort', confidence: 20,
    bbox: { x0: (10 + col * 50) * scale, y0: (10 + row * 30) * scale, x1: (40 + col * 50) * scale, y1: (20 + row * 30) * scale } }))
})) }] }] });
function harness(readings, base = 1_440_000) {
  const canvases = [], calls = [], modes = [];
  const makeCanvas = (width, height) => {
    const canvas = { width, height, toBuffer: () => Buffer.from('synthetic'),
      getContext: () => ({ fillRect() {}, drawImage() {}, set fillStyle(value) {} }) };
    canvases.push(canvas); return canvas;
  };
  const ledger = work.createOfficeOcrWorkLedger([{ assetId: 0, basePixels: base, bounded: true }]);
  const ocr = { async recognize() { calls.push(true); const value = readings.shift(); if (value instanceof Error) throw value; return { data: value }; },
    async setParameters(value) { modes.push(value); } };
  // Production helper and its own freshly assembled geometry share a realm.
  // A foreign-realm record must remain rejected by the closed pure contract.
  const dependencies = {
    Buffer, MAX_MARKDOWN_CHARS: 2_000_000, errors: new Set(['CONVERSION_POLICY_FAILED']),
    fail: code => { throw Object.assign(new Error(code), { code }); }, canvasApi: () => ({ createCanvas: makeCanvas }),
    conversionTimings: createConversionTimings(), refineOcr, contactQuality, cleanExtractedSymbolText,
    assessExtraOfficeOcrRaster: work.assessExtraOfficeOcrRaster,
    uncoveredOcrText: value => value.text
  };
  const recognize = vm.runInThisContext(`(function({${Object.keys(dependencies).join(',')}}){return (${source.slice(start, end)});})`)(dependencies);
  const original = makeCanvas(1600, 900);
  return { canvases, calls, modes, ledger, run: (options = { ledger, assetId: 0, facts }, regions = []) => recognize(original, ocr, regions, false, options) };
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
