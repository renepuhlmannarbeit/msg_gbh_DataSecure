'use strict';

const assert = require('node:assert/strict');
const layout = require('../plugins/data-secure/server/standalone/pdf-text-layout');
const { nativeColumnOrder, renderPdfOcrLayer, uncoveredOcrText } = layout;
const item = (str, x, y, width = 50) => ({ str, dir: 'ltr', fontName: 'F', width, transform: [10, 0, 0, 10, x, y] });
const viewport = { scale: 2, convertToViewportPoint: (x, y) => [x * 2, 600 - y * 2] };
let count = 0;
function test(name, run) { run(); console.log(`PASS ${++count} ${name}`); }

test('native Unicode agreement no longer exports a pre-OCR paint exclusion capability', () => {
  assert.equal(Object.hasOwn(layout, 'nativeOcrPaintFilter'), false);
});
const data = text => ({ text: text + '\n', blocks: [{ paragraphs: [{ lines: [{ text: text + '\n',
  words: [{ text, bbox: { x0: 10, y0: 10, x1: 100, y1: 30 } }] }] }] }] });
const region = text => ({ text, x0: 8, y0: 8, x1: 102, y1: 32 });
test('only independently OCR-read exact text inside a proven word region is deduplicated', () => {
  assert.equal(uncoveredOcrText(data('Anna'), [region('Anna')], { singleTokenOnly: true }), '');
});
test('different, casefolded or misread raster words survive overlapping native geometry', () => {
  for (const text of ['ABC', 'xyz', 'XÝZ', 'ÄÖÜß']) {
    const source = data(text);
    assert.equal(uncoveredOcrText(source, [region('XYZ')], { singleTokenOnly: true }), source.text);
  }
});
test('missing word geometry or a multiword bounding rectangle cannot grant suppression', () => {
  const source = data('Alpha');
  assert.equal(uncoveredOcrText(source, [region('Alpha Beta')], { singleTokenOnly: true }), source.text);
  assert.equal(uncoveredOcrText({ text: 'Alpha', blocks: null }, [region('Alpha')], { singleTokenOnly: true }), 'Alpha');
});
function positionedLine(words, x = 10, y = 10) {
  const values = words.map((text, index) => ({ text,
    bbox: { x0: x + index * 35, y0: y, x1: x + index * 35 + 25, y1: y + 10 } }));
  return { text: words.join(' ') + '\n', words: values };
}
const positionedPage = (...lines) => ({ text: lines.map(line => line.text).join(''), blocks: [{ paragraphs: [{ lines }] }] });
const samePlace = text => ({ text, x0: 9, y0: 8, x1: 71, y1: 24 });
test('an exact positioned native phrase removes only the duplicate words from a mixed OCR line', () => {
  const source = positionedPage(positionedLine(['Alpha', 'Beta', 'new', 'label']), positionedLine(['Alpha', 'Beta'], 400));
  assert.equal(uncoveredOcrText(source, [], { phrases: [samePlace('Alpha Beta')] }), 'new label\nAlpha Beta\n');
});
test('coincident geometry cannot hide a different OCR value or a scan without native evidence', () => {
  const source = positionedPage(positionedLine(['Alpha', 'Beta']));
  for (const phrases of [[], [samePlace('Alpha Wrong')], [samePlace('alpha Beta')], [samePlace('Beta Alpha')]]) {
    assert.equal(uncoveredOcrText(source, [], { phrases }), source.text);
  }
});
test('phrase filtering also retains other lines on a page with OCR review contacts', () => {
  const source = positionedPage(positionedLine(['Alpha', 'Beta']), positionedLine(['E-Mail:', 'review@example.invalid'], 10, 55));
  assert.equal(uncoveredOcrText(source, [], { phrases: [samePlace('Alpha Beta')] }), source.text);
});
test('phrase evidence requires tight width, position, ownership and a trustworthy complete OCR layout', () => {
  const phrase = samePlace('Alpha Beta');
  const source = positionedPage(positionedLine(['Alpha', 'Beta']));
  for (const phrases of [[{...phrase, x1: 95}], [{...phrase, y0: 13}], [phrase, {...phrase}],
    [samePlace('Alpha')]]) assert.equal(uncoveredOcrText(source, [], { phrases }), source.text);
  const twoOwners = positionedPage(positionedLine(['Alpha', 'Beta']), positionedLine(['Alpha', 'Beta']));
  assert.equal(uncoveredOcrText(twoOwners, [], { phrases: [phrase] }), twoOwners.text);
  assert.equal(uncoveredOcrText({ ...source, text: source.text + 'unmodelled glyph\n' }, [], { phrases: [phrase] }),
    source.text + 'unmodelled glyph\n');
});
test('focused phrase proof requires a positive pixel box at the position of every OCR word', () => {
  const source = positionedPage(positionedLine(['Alpha', 'Beta']));
  const words = source.blocks[0].paragraphs[0].lines[0].words.map(word => word.bbox);
  const phrase = samePlace('Alpha Beta');
  assert.equal(uncoveredOcrText(source, [], { phrases: [{ ...phrase, words }] }), '');
  for (const evidence of [undefined, [words[0]], [words[0], { ...words[1], x1: 64 }], words.slice().reverse()]) {
    assert.equal(uncoveredOcrText(source, [], { phrases: [{ ...phrase, words: evidence }] }), source.text);
  }
});
test('focused PDF probing prefers a prominent heading over an earlier small banner', () => {
  const makeItem = (str, baseline, size) => ({ ...item(str, 9, baseline, 62), transform: [size, 0, 0, size, 9, baseline] });
  const pageViewport = { height: 300, convertToViewportPoint: (x, y) => [x, 300 - y] };
  const items = [makeItem('Small Banner', 280, 12), makeItem('Main Heading', 240, 32), makeItem('Other Text', 140, 12)];
  const heading = positionedLine(['Main', 'Heading'], 10, 40);
  heading.words.forEach(word => { word.bbox.y1 = 62; });
  const source = positionedPage(positionedLine(['Small', 'Banner'], 10, 11), heading, positionedLine(['Other', 'Text'], 10, 151));
  assert.deepEqual(layout.coincidentNativePhraseCandidates(source, items, { F: { ascent: 0.8, descent: -0.2 } },
    pageViewport, source.text), [1, 0]);
});
test('aligned columns retain every item and whitespace in original row order', () => {
  const sources = [];
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    sources.push(item(`${column}:${row}`, 10 + column * 100, 250 - row * 25), { str: '', hasEOL: true });
  }
  const actual = nativeColumnOrder(sources, viewport);
  assert.strictEqual(actual, sources, 'aligned prose/table ambiguity does not authorize a reorder');
  assert.equal(actual.length, sources.length);
  assert.deepEqual(new Set(actual), new Set(sources));
});
test('aligned labels and values are not guessed into pairs from a gutter alone', () => {
  const source = [item('Eingang', 10, 250), item('Block', 110, 250), item('Reihe', 210, 250), item('Platz', 310, 250),
    item('E3', 10, 220), item('014', 110, 220), item('4', 210, 220), item('20', 310, 220)];
  assert.strictEqual(nativeColumnOrder(source, viewport), source);
});
test('name/account rows retain their actual record binding including slight baseline offsets', () => {
  for (const offset of [0, 2, 5]) {
    const source = [item('Name', 10, 250), item('Account', 180, 250 + offset),
      item('Anna', 10, 225), item('111', 180, 225 + offset), item('Bob', 10, 200), item('222', 180, 200 + offset)];
    assert.strictEqual(nativeColumnOrder(source, viewport), source);
  }
});
test('staggered gutters without structural ownership are still ambiguous and preserve draw order', () => {
  const source = [item('LEFT1', 10, 250), item('RIGHT1', 200, 237),
    item('LEFT2', 10, 225), item('RIGHT2', 200, 212), item('LEFT3', 10, 200), item('RIGHT3', 200, 187)];
  const actual = nativeColumnOrder(source, viewport);
  assert.strictEqual(actual, source);
  assert.deepEqual(new Set(actual), new Set(source));
});
test('large item collections retain exact source order without layout expansion', () => {
  const source = Array.from({ length: 10001 }, () => item('A', 10, 100));
  assert.strictEqual(nativeColumnOrder(source, viewport), source);
});
test('full-width headings and one-line wide spacing do not authorize column guessing', () => {
  const oneLine = [item('A', 10, 100), item('B', 200, 100)];
  assert.strictEqual(nativeColumnOrder(oneLine, viewport), oneLine);
  const heading = [item('Full width', 0, 280, 400), item('A', 10, 250), item('B', 200, 250), item('C', 10, 220), item('D', 200, 220)];
  assert.strictEqual(nativeColumnOrder(heading, viewport), heading);
});
test('rotated/RTL/malformed layout preserves complete source draw order', () => {
  for (const source of [[item('A', 10, 250), { ...item('B', 100, 250), dir: 'rtl' }, item('C', 10, 220), item('D', 100, 220)],
    [item('A', 10, 250), { type: 'beginMarkedContent' }, item('C', 10, 220), item('D', 100, 220)]]) {
    assert.strictEqual(nativeColumnOrder(source, viewport), source);
  }
});

(async () => {
  let observerWrites = 0, renders = 0;
  const canvas = { getContext: () => ({}) };
  await renderPdfOcrLayer({ page: { render: options => { renders++; assert.equal(options.background, 'white'); return { promise: Promise.resolve() }; } },
    canvas, viewport, textItems: [item('XYZ', 10, 100)], setTextPaintObserver: () => { observerWrites++; }, annotationMode: 0 });
  assert.equal(renders, 1); assert.equal(observerWrites, 0);
  console.log(`PASS ${++count} one unchanged render only without installing a paint observer`);
  await assert.rejects(renderPdfOcrLayer({ page: { render: () => { throw new Error('RENDER_FAILED'); } }, canvas, viewport,
    textItems: [], setTextPaintObserver: () => { observerWrites++; }, annotationMode: 0 }), /RENDER_FAILED/);
  assert.equal(observerWrites, 0);
  console.log(`PASS ${++count} render failure preserves original error without creating observer state`);
  console.log(`passed ${count} PDF native/OCR layout cases`);
})().catch(error => { console.error(error); process.exitCode = 1; });
