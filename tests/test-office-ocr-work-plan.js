'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { OFFICE_OCR_WORK_LIMITS: L, assessExtraOfficeOcrRaster: assess,
  createOfficeOcrWorkLedger: ledger } = require('../plugins/data-secure/server/core/office-ocr-work-plan');
let passed = 0;
function test(name, run) { run(); passed++; process.stdout.write(`PASS ${name}\n`); }
const facts = () => ({ kind: 'png', width: 2000, height: 1000,
  primaryWidth: 2000, primaryHeight: 1000, initialScale: 1, downsampled: false });
const geometry = (bands = 12, words = 8, height = 10) => Array.from({ length: bands }, (_, row) => ({
  box: { x0: 0, y0: row * 30, x1: 1900, y1: row * 30 + height },
  words: Array.from({ length: words }, (_, column) => ({ x0: column * 50, y0: row * 30,
    x1: column * 50 + 40, y1: row * 30 + height }))
}));
const plan = () => assess(facts(), geometry());
const bases = (other = 108_000_000) => [{ assetId: 0, basePixels: 2_000_000, bounded: true },
  { assetId: 1, basePixels: other, bounded: true }];

test('dense synthetic fine geometry proposes exactly one 2x raster and its full cost', () => {
  const value = plan();
  assert.equal(value.eligible, true); assert.equal(value.targetWidth, 4000); assert.equal(value.targetHeight, 2000);
  assert.equal(value.workPixels, 8_000_000); assert.equal(value.liveCanvasPixels, 10_000_000);
  assert.deepEqual(value.geometry, { validWords: 96, fineWords: 96, textBands: 12, medianWordHeight: 10 });
  assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.geometry));
});
test('the exact minimum fine-word and band threshold can qualify', () => assert.equal(assess(facts(), geometry(8, 6, 18)).eligible, true));
test('sparse photo-like geometry is not a candidate', () => assert.equal(assess(facts(), geometry(2, 2)).eligible, false));
test('coarse text alone does not qualify', () => assert.equal(assess(facts(), geometry(12, 8, 26)).eligible, false));
test('one long noisy line cannot mint multiple text bands', () => {
  const line = { box: { x0: 0, y0: 0, x1: 2000, y1: 10 }, words: Array.from({ length: 96 }, (_, x) =>
    ({ x0: x * 20, y0: 0, x1: x * 20 + 10, y1: 10 })) };
  assert.equal(assess(facts(), [line]).reason, 'TOO_FEW_TEXT_BANDS');
});
test('identical copied boxes cannot mint word density or bands', () => {
  const one = geometry(1, 8)[0]; assert.equal(assess(facts(), Array(100).fill(one)).eligible, false);
});
test('nearby overlapping line centers are not independent text bands', () => {
  const lines = geometry(8, 6);
  for (const [i, line] of lines.entries()) { line.box.y0 = i * 2; line.box.y1 = i * 2 + 10;
    for (const word of line.words) { word.y0 = i * 2; word.y1 = i * 2 + 10; } }
  assert.equal(assess(facts(), lines).reason, 'TOO_FEW_TEXT_BANDS');
});
test('nonfinite, negative, outside and zero-area boxes are never evidence', () => {
  for (const change of [w => { w.x0 = NaN; }, w => { w.y0 = -1; }, w => { w.x1 = 2001; },
    w => { w.y1 = w.y0; }, w => { w.x0 = 0.5; }]) {
    const lines = geometry(); for (const line of lines) for (const word of line.words) change(word);
    assert.equal(assess(facts(), lines).eligible, false);
  }
});
test('valid words outside their claimed line cannot inflate evidence', () => {
  const lines = geometry(); for (const line of lines) line.box.x1 = 1;
  assert.equal(assess(facts(), lines).eligible, false);
});
test('coarse majority cannot qualify by a minority of small words', () => {
  const lines = geometry(10, 8); lines.push(...geometry(12, 8, 26).map(line => ({
    box: { ...line.box, y0: line.box.y0 + 400, y1: line.box.y1 + 400 },
    words: line.words.map(w => ({ ...w, y0: w.y0 + 400, y1: w.y1 + 400 })) })));
  assert.equal(assess(facts(), lines).eligible, false);
});
test('raw geometry arrays are finite and bounded', () => {
  assert.equal(assess(facts(), Array(2001).fill({})).reason, 'GEOMETRY_LIMIT');
  const lines = geometry(); lines[0].words = Array(5001).fill({});
  assert.equal(assess(facts(), lines).reason, 'GEOMETRY_LIMIT');
  assert.equal(assess(facts(), Array(1000).fill(geometry(1, 6)[0])).reason, 'GEOMETRY_LIMIT');
});
test('already enlarged, downsampled and mismatched primary rasters cannot recurse', () => {
  for (const patch of [{ initialScale: 2 }, { downsampled: true }, { primaryWidth: 1999 }])
    assert.equal(assess({ ...facts(), ...patch }, geometry()).reason, 'NOT_NATIVE_BITMAP_PRIMARY');
});
test('unsupported raster roles and text/confidence extras cannot grant a candidate', () => {
  for (const patch of [{ kind: 'svg' }, { confidence: 100 }, { text: 'synthetic' }, { initialScale: 3 }])
    assert.equal(assess({ ...facts(), ...patch }, geometry()).reason, 'INPUT_INVALID');
});
test('geometry resembling text in a photo is still only a work candidate', () => assert.equal(plan().reason, 'DENSE_FINE_PRIMARY_GEOMETRY'));
test('the combined held primary and target canvas cap is inclusive', () => {
  const edge = { ...facts(), width: 3000, height: 2000, primaryWidth: 3000, primaryHeight: 2000 };
  assert.equal(assess(edge, geometry()).liveCanvasPixels, L.MAX_LIVE_PIXELS);
  assert.equal(assess({ ...edge, width: 3001, primaryWidth: 3001 }, geometry()).reason, 'PEAK_LIMIT');
});
test('huge, noninteger and invalid source dimensions are declined before target allocation', () => {
  for (const n of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER])
    assert.equal(assess({ ...facts(), width: n, primaryWidth: n }, geometry()).eligible, false);
});
test('closed plain data inputs reject accessors without invoking them', () => {
  let reads = 0; const f = facts(); Object.defineProperty(f, 'width', { enumerable: true, get() { reads++; return 2000; } });
  assert.equal(assess(f, geometry()).eligible, false);
  const lines = geometry(); Object.defineProperty(lines, '0', { enumerable: true, get() { reads++; return {}; } });
  assert.equal(assess(facts(), lines).eligible, false); assert.equal(reads, 0);
});
test('symbols, inherited records, sparse arrays and hostile descriptor failures do not escape', () => {
  const f = facts(); f[Symbol('extra')] = true; assert.equal(assess(f, geometry()).eligible, false);
  assert.equal(assess(Object.create(facts()), geometry()).eligible, false);
  assert.equal(assess(facts(), new Array(12)).eligible, false);
  assert.doesNotThrow(() => assert.equal(assess(new Proxy({}, { getPrototypeOf() { throw Error('synthetic'); } }), geometry()).eligible, false));
});

test('the full second pass is charged, never only the area difference', () => {
  const value = ledger(bases()), result = value.reserveUpscale(0, plan());
  assert.deepEqual(result, { admitted: true, chargedPixels: 8_000_000 });
  assert.equal(value.snapshot().baseReservedPixels, 110_000_000);
  assert.equal(value.snapshot().optionalPixels, 8_000_000); assert.equal(value.snapshot().remainingPixels, 2_000_000);
});
test('later native and assigned small2x obligations stay reserved', () => {
  const value = ledger(bases(117_000_000)); assert.equal(value.reserveUpscale(0, plan()).reason, 'NO_EXTRA_BUDGET');
  assert.equal(value.snapshot().baseReservedPixels, 119_000_000); assert.equal(value.snapshot().optionalPixels, 0);
});
test('a successful reservation remains spent after secondary failure and cannot repeat', () => {
  const value = ledger(bases()); value.reserveUpscale(0, plan());
  assert.equal(value.reserveUpscale(0, plan()).reason, 'UPSCALE_ALREADY_RESERVED');
  assert.equal(value.snapshot().optionalPixels, 8_000_000);
});
test('forged, copied or negative assessments cannot undercharge the ledger', () => {
  const value = ledger(bases()), real = plan();
  for (const fake of [{ ...real, workPixels: 1 }, { ...real }, { eligible: true }, assess(facts(), [])])
    assert.equal(value.reserveUpscale(0, fake).reason, 'ASSESSMENT_INVALID');
  assert.equal(value.snapshot().optionalPixels, 0); assert.equal(value.reserveUpscale(0, real).admitted, true);
});
test('unknown assets and missing source-area obligations cannot borrow another asset base', () => {
  const value = ledger([{ assetId: 0, basePixels: 1_000_000, bounded: true }]);
  assert.equal(value.reserveUpscale(1, plan()).reason, 'ASSET_UNKNOWN');
  assert.equal(value.reserveUpscale(0, plan()).reason, 'BASE_ASSET_MISMATCH');
});
test('multiple eligible assets cannot oversubscribe the same remainder', () => {
  const value = ledger(bases()); assert.equal(value.reserveUpscale(0, plan()).admitted, true);
  assert.equal(value.reserveUpscale(1, plan()).reason, 'NO_EXTRA_BUDGET');
  assert.equal(value.snapshot().baseReservedPixels + value.snapshot().optionalPixels, 118_000_000);
});
test('unknown multiframe upper bounds disable only optional work', () => {
  const value = ledger([{ assetId: 0, basePixels: 2_000_000, bounded: true }, { assetId: 1, basePixels: null, bounded: false }]);
  assert.equal(value.snapshot().reason, 'BASE_UNBOUNDED');
  assert.equal(value.reserveUpscale(0, plan()).reason, 'BASE_UNBOUNDED');
  assert.equal(value.reserveCrops(0, [100]).reason, 'BASE_UNBOUNDED'); assert.equal(value.snapshot().optionalPixels, 0);
});
test('known aggregate frame work and skipped assets retain their closed obligations', () => {
  const value = ledger([{ assetId: 0, basePixels: 120_000_000, bounded: true }, { assetId: 1, basePixels: 0, bounded: true }]);
  assert.equal(value.snapshot().available, true); assert.equal(value.reserveUpscale(0, plan()).reason, 'NO_EXTRA_BUDGET');
  assert.equal(value.reserveUpscale(1, plan()).reason, 'BASE_ASSET_MISMATCH');
});
for (const [name, input] of [
  ['duplicate ids', [{ assetId: 0, basePixels: 1, bounded: true }, { assetId: 0, basePixels: 1, bounded: true }]],
  ['invalid bound', [{ assetId: 0, basePixels: NaN, bounded: true }]],
  ['unknown bound with guessed pixels', [{ assetId: 0, basePixels: 1, bounded: false }]],
  ['oversized asset list', Array(151).fill({})], ['extra fields', [{ assetId: 0, basePixels: 1, bounded: true, ready: true }]]
]) test(`invalid base plan (${name}) declines optional work without throwing`, () => {
  const value = ledger(input); assert.equal(value.snapshot().reason, 'BASE_INVALID');
  assert.equal(value.reserveUpscale(0, plan()).admitted, false);
});
test('base work exceeding 120MP is never presented as spare budget', () => {
  const value = ledger(bases(120_000_000)); assert.equal(value.snapshot().reason, 'BASE_LIMIT');
  assert.equal(value.snapshot().remainingPixels, 0);
});
test('constructor snapshots inputs; later caller mutation cannot lower the reservation', () => {
  const input = bases(), value = ledger(input); input[1].basePixels = 0; input.length = 0;
  assert.equal(value.snapshot().baseReservedPixels, 110_000_000);
});
test('all optional crop costs are reserved atomically or none', () => {
  const value = ledger(bases()); value.reserveUpscale(0, plan());
  assert.equal(value.reserveCrops(0, [200_000, 200_001]).reason, 'CROP_PLAN_INVALID');
  assert.equal(value.snapshot().optionalPixels, 8_000_000);
  assert.equal(value.reserveCrops(0, Array(10).fill(200_000)).chargedPixels, 2_000_000);
  assert.equal(value.snapshot().remainingPixels, 0);
});
test('crop work cannot be hidden beyond the established count and per-call area caps', () => {
  const value = ledger(bases());
  assert.equal(value.reserveCrops(0, Array(33).fill(1)).reason, 'CROP_PLAN_INVALID');
  assert.equal(value.reserveCrops(0, Array(11).fill(200_000)).reason, 'CROP_PLAN_LIMIT');
  assert.equal(value.snapshot().optionalPixels, 0);
});
test('earlier optional crop work reduces the actual extra-raster remainder', () => {
  const value = ledger(bases(110_000_000)); value.reserveCrops(1, Array(10).fill(200_000));
  assert.equal(value.reserveUpscale(0, plan()).reason, 'NO_EXTRA_BUDGET');
  assert.equal(value.snapshot().optionalPixels, 2_000_000);
});
test('after exactly fitting earlier crop work a full extra raster can still be admitted', () => {
  const value = ledger(bases()); value.reserveCrops(1, Array(10).fill(200_000));
  assert.equal(value.reserveUpscale(0, plan()).admitted, true); assert.equal(value.snapshot().remainingPixels, 0);
});
test('later crop plans never receive a partial reservation after extra admission', () => {
  const value = ledger(bases()); value.reserveUpscale(0, plan()); value.reserveCrops(0, Array(10).fill(200_000));
  assert.equal(value.reserveCrops(1, [1]).reason, 'NO_EXTRA_BUDGET'); assert.equal(value.snapshot().cropAssets, 1);
});
test('a failed crop batch stays charged and cannot be repeated or split later', () => {
  const value = ledger(bases()); value.reserveCrops(0, [100]);
  assert.equal(value.reserveCrops(0, [100]).reason, 'CROPS_ALREADY_RESERVED'); assert.equal(value.snapshot().optionalPixels, 100);
});
test('an empty crop plan is a closed zero-cost single plan', () => {
  const value = ledger(bases()); assert.deepEqual(value.reserveCrops(0, []), { admitted: true, chargedPixels: 0 });
  assert.equal(value.reserveCrops(0, [1]).reason, 'CROPS_ALREADY_RESERVED');
});
test('crop arrays cannot use getters or nonfinite costs to create partial spending', () => {
  let reads = 0; const input = [1]; Object.defineProperty(input, '0', { enumerable: true, get() { reads++; return 1; } });
  const value = ledger(bases()); assert.equal(value.reserveCrops(0, input).reason, 'CROP_PLAN_INVALID'); assert.equal(reads, 0);
  for (const n of [0, -1, NaN, Infinity, 0.5]) assert.equal(value.reserveCrops(0, [n]).admitted, false);
  assert.equal(value.snapshot().optionalPixels, 0);
});
test('closed work cannot reserve new area or refund existing commitments', () => {
  const value = ledger(bases()); value.reserveUpscale(0, plan()); const first = value.close();
  assert.equal(value.reserveUpscale(1, plan()).reason, 'CLOSED'); assert.equal(value.reserveCrops(0, [1]).reason, 'CLOSED');
  assert.deepEqual(value.close(), first); assert.equal(first.optionalPixels, 8_000_000); assert.ok(Object.isFrozen(first));
});
test('the helper executes without loading IO, native dependencies or a clock', () => {
  const filename = path.resolve(__dirname, '../plugins/data-secure/server/core/office-ocr-work-plan.js');
  let loads = 0; const context = vm.createContext({ module: { exports: {} }, require() { loads++; throw Error('not pure'); },
    process: undefined, Buffer: undefined, Date: undefined, performance: undefined });
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const result = vm.runInContext(`(() => {
    const h=module.exports,l=h.createOfficeOcrWorkLedger([{assetId:0,basePixels:1,bounded:true}]);
    return JSON.stringify({keys:Object.keys(h).sort(),base:l.snapshot().baseReservedPixels});
  })()`, context);
  assert.deepEqual(JSON.parse(result), { keys: ['OFFICE_OCR_WORK_LIMITS', 'assessExtraOfficeOcrRaster', 'createOfficeOcrWorkLedger'], base: 1 });
  assert.equal(loads, 0);
});
process.stdout.write(`${passed} Office OCR work-plan cases PASS\n`);
