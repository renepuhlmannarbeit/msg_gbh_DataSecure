'use strict';

const assert = require('node:assert/strict');
const { nativeTextSeparator, paintedTextGeometryAvailable, nativeTextRegions, uncoveredOcrText } = require('../plugins/data-secure/server/standalone/pdf-text-layout');
let passed = 0;
function test(name, fn) { fn(); process.stdout.write(`ok ${++passed} - ${name}\n`); }
const item = (str, x, y, width = 60) => ({ str, fontName: 'font', width, transform: [10, 0, 0, 10, x, y] });
const styles = { font: { ascent: 0.9, descent: -0.2, vertical: false } };
const viewport = { convertToViewportPoint: (x, y) => [x * 2, 600 - y * 2] };
const region = { x0: 10, y0: 10, x1: 200, y1: 30, text: 'native § 392 / §393' };
const word = (text, x0, y0, x1, y1) => ({ text, bbox: { x0, y0, x1, y1 } });
const data = (...lines) => ({ text: lines.map(line => line.text).join(''), blocks: [{ paragraphs: [{ lines }] }] });
const line = (text, ...words) => ({ text, words });

test('position separates footer page number without altering source strings', () => {
  assert.equal(nativeTextSeparator(item('15.09.2026', 64, 29, 49), item('2', 42, 29, 6)), '\n');
  assert.equal(nativeTextSeparator(item('Footer', 119, 29, 303), item('2', 42, 29, 6)), '\n');
});
test('font/run boundaries preserve adjacent words, kerning and superscripts', () => {
  assert.equal(nativeTextSeparator(item('Service ', 10, 100), item('Level', 70, 100)), '');
  assert.equal(nativeTextSeparator(item('x', 10, 100), item('2', 68, 104)), '');
  assert.equal(nativeTextSeparator(item('left', 10, 100), item('right', 90, 100)), ' ');
  assert.equal(nativeTextSeparator(item('first', 10, 100), item('second', 10, 80)), '\n');
});
test('only proven horizontal font geometry supplies OCR coverage', () => {
  assert.deepEqual(nativeTextRegions([item('text', 10, 100)], styles, viewport), [{ x0: 20, y0: 382, x1: 140, y1: 404, text: 'text' }]);
  assert.deepEqual(nativeTextRegions([item('\uE000', 10, 100)], styles, viewport), []);
  assert.deepEqual(nativeTextRegions([item('Name \uE000', 10, 100)], styles, viewport), []);
  assert.deepEqual(nativeTextRegions([item('name', 10, 100)], {}, viewport), []);
  assert.deepEqual(nativeTextRegions([item('name', 10, 100)], { font: { ...styles.font, vertical: true } }, viewport), []);
  const rotated = { ...item('name', 10, 100), transform: [0, 10, -10, 0, 10, 100] };
  assert.deepEqual(nativeTextRegions([rotated], styles, viewport), []);
});
test('invisible, clipped or transparent native layers cannot suppress overlapping image text', () => {
  const ops = { setTextRenderingMode: 38, setGState: 9 };
  assert.equal(paintedTextGeometryAvailable({ fnArray: [38], argsArray: [[0]] }, ops), true);
  for (const mode of [3, 4, 5, 6, 7]) assert.equal(paintedTextGeometryAvailable({ fnArray: [38], argsArray: [[mode]] }, ops), false);
  assert.equal(paintedTextGeometryAvailable({ fnArray: [9], argsArray: [[['ca', 0]]] }, ops), false);
  assert.equal(paintedTextGeometryAvailable({ fnArray: [9], argsArray: [[[['ca', 0]]]] }, ops), false);
  assert.equal(paintedTextGeometryAvailable({ fnArray: [9], argsArray: [[[['ca', 1], ['BM', 'source-over']]]] }, ops), true);
  assert.equal(paintedTextGeometryAvailable({}, ops), false);
});
test('misread glyphs and different overlay text survive native overlap', () => {
  assert.equal(uncoveredOcrText(data(line('S 392 / 5393\n', word('S', 11, 11, 20, 25), word('392', 30, 11, 70, 25), word('5393', 80, 11, 130, 25))), [region]), 'S\n5393\n');
  const overlay = data(line('Name: Anna Beispiel\n', word('Name:', 11, 11, 40, 25), word('Anna', 50, 11, 80, 25), word('Beispiel', 90, 11, 130, 25)));
  assert.equal(uncoveredOcrText(overlay, [region]), overlay.text);
});
test('later image and complex paint order cannot prove native visibility', () => {
  const ops = { showText: 1, paintImageXObject: 2, fill: 3, paintFormXObjectBegin: 4 };
  for (const fnArray of [[1, 2], [1, 3], [4, 1]]) assert.equal(paintedTextGeometryAvailable({ fnArray, argsArray: fnArray.map(() => []) }, ops), false);
  assert.equal(paintedTextGeometryAvailable({ fnArray: [2, 1], argsArray: [[], []] }, ops), true);
});
test('font-split punctuation may cover one word but never bridges graphic text', () => {
  const regions = nativeTextRegions([item('name', 10, 100), { ...item('.', 70, 100, 4), transform: [9.5, 0, 0, 9.5, 70, 100] }], styles, viewport);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].x1, 148);
  assert.equal(uncoveredOcrText(data(line('name.\n', word('name.', 22, 385, 146, 400))), regions), '');
  assert.equal(nativeTextRegions([item('name', 10, 100), item('graphic', 90, 100)], styles, viewport).length, 2);
  assert.equal(nativeTextRegions([item('name', 10, 100), item('\uE000', 70, 100, 0), item('.', 70, 100, 4)], styles, viewport).length, 2);
});
test('image-only names, dates and mathematical punctuation are retained', () => {
  const value = data(line('AOK &) connect\n', word('AOK', 300, 11, 340, 25), word('&)', 350, 11, 365, 25), word('connect', 370, 11, 430, 25)));
  assert.equal(uncoveredOcrText(value, [region]), value.text);
});
test('partial line retains unseen image text without joining across native text', () => {
  const value = data(line('New native facts\n', word('New', 250, 11, 280, 25), word('native', 20, 11, 100, 25), word('facts', 300, 11, 340, 25)));
  assert.equal(uncoveredOcrText(value, [region]), 'New\nfacts\n');
});
test('nearby or partial overlap is insufficient to suppress OCR', () => {
  const value = data(line('new name\n', word('new', 190, 11, 230, 25), word('name', 10, 31, 80, 45)));
  assert.equal(uncoveredOcrText(value, [region]), value.text);
});
test('missing or malformed geometry retains the original OCR safely', () => {
  const value = data(line('new\n', { text: 'new', bbox: { x0: NaN, y0: 10, x1: 20, y1: 20 } }));
  assert.equal(uncoveredOcrText(value, [region]), value.text);
  assert.equal(uncoveredOcrText({ text: 'new\n', blocks: null }, [region]), 'new\n');
  assert.equal(uncoveredOcrText({ text: 'new\n', blocks: [] }, [region]), 'new\n');
});
test('bounded comparison fallback cannot silently drop already filtered words', () => {
  const regions = [region, ...Array.from({ length: 10000 }, () => ({ x0: 1000, y0: 1000, x1: 2000, y1: 2000 }))];
  const words = [word('native', 20, 11, 100, 25), ...Array.from({ length: 201 }, () => word('new', 300, 11, 340, 25))];
  const value = data(line('native new\n', ...words));
  assert.equal(uncoveredOcrText(value, regions), value.text);
});
process.stdout.write(`passed ${passed} standalone PDF text-layout tests\n`);
