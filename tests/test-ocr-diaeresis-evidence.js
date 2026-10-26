'use strict';

const { createSuite } = require('./helpers');
const { diaeresisCandidate } = require('../plugins/data-secure/server/standalone/ocr-diaeresis-evidence');
const { test, done, assert } = createSuite('Bounded OCR diaeresis candidate evidence');

function raster(kind = 'diaeresis-U', width = 24, height = 30, dotGray = 0) {
  const data = new Uint8ClampedArray(width * height * 4); data.fill(255);
  function pixel(x, y, gray = 0) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = (y * width + x) * 4;
    data[offset] = gray; data[offset + 1] = gray; data[offset + 2] = gray;
  }
  function rectangle(x0, y0, x1, y1, gray = 0) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pixel(x, y, gray);
  }
  function stroke(points) {
    for (let index = 1; index < points.length; index++) {
      const [x0, y0] = points[index - 1], [x1, y1] = points[index];
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let step = 0; step <= steps; step++) {
        const x = Math.round(x0 + (x1 - x0) * step / steps), y = Math.round(y0 + (y1 - y0) * step / steps);
        rectangle(x - 1, y - 1, x + 1, y + 1);
      }
    }
  }
  if (kind.endsWith('A')) { stroke([[5, 27], [11, 11], [17, 27]]); stroke([[8, 21], [15, 21]]); }
  else if (kind.endsWith('U')) stroke([[5, 11], [5, 25], [8, 27], [14, 27], [17, 25], [17, 11]]);
  else {
    for (let y = 10; y <= 28; y++) for (let x = 4; x <= 19; x++) {
      const radius = ((x - 11.5) / 7.5) ** 2 + ((y - 19) / 9) ** 2;
      if (radius <= 1 && radius >= 0.45) pixel(x, y);
    }
  }
  if (kind.startsWith('diaeresis') || kind.startsWith('noise-mimic')) {
    rectangle(7, 5, 9, 7, dotGray); rectangle(14, 5, 16, 7, dotGray);
  }
  if (kind.startsWith('circumflex')) stroke([[7, 7], [12, 3], [17, 7]]);
  if (kind.startsWith('quoted')) { rectangle(6, 2, 7, 7); rectangle(16, 2, 17, 7); }
  if (kind.startsWith('noise-three')) { rectangle(7, 5, 9, 7); rectangle(14, 5, 16, 7); pixel(1, 1); }
  if (kind.startsWith('adjacent')) rectangle(21, 5, 22, 6);
  return { width, height, data };
}

function fixture(text = 'A O U', glyphWidth = 24, glyphHeight = 30) {
  let cursor = 0;
  const words = text.split(' ').map(word => {
    const start = cursor;
    const symbols = Array.from(word, symbol => {
      const bbox = { x0: cursor, y0: 0, x1: cursor + glyphWidth, y1: glyphHeight };
      cursor += glyphWidth + 2;
      return { text: symbol, bbox, confidence: 23 };
    });
    const bbox = { x0: start, y0: 0, x1: cursor - 2, y1: glyphHeight }; cursor += 2;
    return { text: word, bbox, symbols, confidence: 21 };
  });
  return { line: { text, bbox: { x0: 0, y0: 0, x1: cursor - 4, y1: glyphHeight }, words },
    width: cursor, height: glyphHeight, contact: false,
    readPixels: () => raster('diaeresis-U', glyphWidth, glyphHeight) };
}
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

for (const [before, after] of [['a', 'ä'], ['o', 'ö'], ['u', 'ü'], ['A', 'Ä'], ['O', 'Ö'], ['U', 'Ü']]) {
  test(`one exact ${before} to diaeresis candidate with its original owned pixels`, () => {
    const input = fixture(before); input.reading = after; input.readPixels = () => raster(`diaeresis-${before.toUpperCase()}`);
    assert.equal(diaeresisCandidate(input), after);
  });
}
test('all six allowed changes can occur together; one unsupported glyph refuses the entire line', () => {
  const input = fixture('a o u A O U'); input.reading = 'ä ö ü Ä Ö Ü';
  assert.equal(diaeresisCandidate(input), input.reading);
  let calls = 0; input.readPixels = () => raster(++calls === 2 ? 'ascii-U' : 'diaeresis-U');
  assert.equal(diaeresisCandidate(input), null); assert.equal(calls, 2);
});
for (const kind of ['ascii-A', 'ascii-O', 'ascii-U', 'circumflex-O', 'quoted-A', 'adjacent-O', 'noise-three-U']) {
  test(`pixel evidence refuses ${kind}`, () => {
    const input = fixture('O'); input.reading = 'Ö'; input.readPixels = () => raster(kind);
    assert.equal(diaeresisCandidate(input), null);
  });
}
test('explicit limitation: two identical noise dots cannot be distinguished from an intended diaeresis', () => {
  const intended = raster('diaeresis-U'), noise = raster('noise-mimic-U');
  assert.deepEqual(noise.data, intended.data);
  const input = fixture('U'); input.reading = 'Ü'; input.readPixels = () => noise;
  assert.equal(diaeresisCandidate(input), 'Ü', 'candidate evidence is not a semantic or safety approval');
});
test('three adjacent fixed thresholds are necessary, not one or two successful thresholds', () => {
  const input = fixture('U'); input.reading = 'Ü';
  input.readPixels = () => raster('diaeresis-U', 24, 30, 230); assert.equal(diaeresisCandidate(input), null);
  input.readPixels = () => raster('diaeresis-U', 24, 30, 210); assert.equal(diaeresisCandidate(input), null);
  input.readPixels = () => raster('diaeresis-U', 24, 30, 200); assert.equal(diaeresisCandidate(input), 'Ü');
});
for (const [before, after] of [['A O', 'A O'], ['A 6', 'Ä 8'], ['A:O', 'Ä;O'], ['A O', 'Ä  O'],
  ['A O', 'ÄO'], ['A O', 'Ä\tO'], ['Ax O', 'ÄX O'], ['A O', 'Â O'], ['Ä O', 'A O'],
  ['A I U', 'Ä l U'], ['A O', 'Ä O\n'], ['A ß', 'Ä ss'], ['A e\u0301', 'Ä é']]) {
  test(`whole-line exact UTF16 change gate refuses ${JSON.stringify([before, after])}`, () => {
    const input = fixture(before); input.reading = after;
    input.readPixels = () => { throw new Error('must be refused before pixel reads'); };
    assert.equal(diaeresisCandidate(input), null);
  });
}
test('the exact OCR record separator is allowed but no trimming or word-boundary normalization occurs', () => {
  const input = fixture('A O'); input.reading = 'Ä O';
  for (const suffix of ['\n', '\r\n', '\n\n', '\r\n\r\n']) {
    input.line.text = `A O${suffix}`; assert.equal(diaeresisCandidate(input), 'Ä O');
  }
  for (const text of [' A O', 'A O ', 'A  O', 'A\tO', 'A O\n\n\n', 'A O\r']) {
    input.line.text = text; assert.equal(diaeresisCandidate(input), null);
  }
});
test('contact status and actual contact syntax both forbid a candidate', () => {
  const input = fixture('A'); input.reading = 'Ä';
  for (const contact of [undefined, null, true, 0, 'false']) {
    input.contact = contact; assert.equal(diaeresisCandidate(input), null);
  }
  for (const text of ['Kontakt: A', 'A@invalid.example', 'Telefon: A', '+49 30 123456 A']) {
    const contact = fixture(text); contact.reading = text.replace('A', 'Ä');
    assert.equal(diaeresisCandidate(contact), null);
  }
});
test('supplementary Unicode before a changed symbol is mapped by exact UTF16 position', () => {
  const input = fixture('😀A ß'); input.reading = '😀Ä ß';
  let selected; input.readPixels = value => { selected = value; return raster(); };
  assert.equal(diaeresisCandidate(input), '😀Ä ß'); assert.deepEqual(selected, input.line.words[0].symbols[1].bbox);
});
test('missing, non-scalar, malformed and reordered word/symbol metadata refuse the whole line', () => {
  const original = fixture('AU O');
  const changes = [
    value => { value.line.words = null; }, value => { value.line.words[0].symbols = {}; },
    value => { value.line.words[0].symbols[0].text = 'AA'; },
    value => { value.line.words[0].symbols[0].text = '\ud800'; },
    value => { value.line.words[0].symbols.reverse(); },
    value => { value.line.words[0].text = 'UA'; }, value => { value.line.words.reverse(); },
    value => { value.line.words[0].symbols[1] = null; }, value => { value.line.words[0].text = 'A\tU'; }
  ];
  for (const change of changes) {
    const input = { ...original, line: clone(original.line), reading: 'ÄU O' }; change(input);
    let called = false; input.readPixels = () => { called = true; return raster(); };
    assert.equal(diaeresisCandidate(input), null); assert.equal(called, false);
  }
});
test('every box must be integer, within its original word/line/raster, with no enlarged target box', () => {
  const original = fixture('A U');
  const changes = [
    value => { value.line.words[0].symbols[0].bbox.x0 = 0.5; },
    value => { value.line.words[0].symbols[0].bbox.x1++; },
    value => { value.line.words[0].bbox.x0 = -1; },
    value => { value.line.words[1].bbox.x1 = value.width + 1; },
    value => { value.line.bbox.y1 = value.height + 1; },
    value => { value.line.words[0].symbols[0].bbox.x1 = 0; },
    value => { value.line.words[0].symbols[0].bbox.y1 = Infinity; },
    value => { value.line.bbox.x1 = 3; }
  ];
  for (const change of changes) {
    const input = { ...original, line: clone(original.line), reading: 'Ä U' }; change(input);
    assert.equal(diaeresisCandidate(input), null);
  }
});
test('target ownership refuses overlaps with symbols in the same or a different word', () => {
  for (const text of ['AU', 'A U']) {
    const input = fixture(text); input.reading = text.replace('A', 'Ä');
    const neighbour = text.includes(' ') ? input.line.words[1].symbols[0] : input.line.words[0].symbols[1];
    neighbour.bbox.x0 = input.line.words[0].symbols[0].bbox.x1 - 1;
    if (text.includes(' ')) input.line.words[1].bbox.x0 = neighbour.bbox.x0;
    assert.equal(diaeresisCandidate(input), null);
  }
  const touching = fixture('AU'); touching.reading = 'ÄU';
  touching.line.words[0].symbols[1].bbox.x0 = touching.line.words[0].symbols[0].bbox.x1;
  assert.equal(diaeresisCandidate(touching), 'ÄU', 'touching edges do not own the same pixel');
});
test('only original frozen boxes reach a one-argument pixel callback; input and pixels remain immutable', () => {
  const input = fixture('A O'), patch = raster(), beforePixels = patch.data.slice(), before = JSON.stringify(input.line);
  freeze(input.line); input.reading = 'Ä O';
  input.readPixels = function (value) {
    assert.equal(arguments.length, 1); assert.deepEqual(value, input.line.words[0].symbols[0].bbox);
    assert.equal(Object.isFrozen(value), true); assert.notEqual(value, input.line.words[0].symbols[0].bbox); return patch;
  };
  assert.equal(diaeresisCandidate(input), 'Ä O');
  assert.equal(JSON.stringify(input.line), before); assert.deepEqual(patch.data, beforePixels);
});
test('unavailable, throwing, asynchronous or incorrectly sized RGBA pixels retain the primary value', () => {
  const input = fixture('U'); input.reading = 'Ü';
  const badImages = [null, {}, { ...raster(), width: 25 }, { ...raster(), height: 29 },
    { ...raster(), data: [] }, { ...raster(), data: new Uint8ClampedArray(4) },
    { ...raster(), data: new Uint16Array(24 * 30 * 4) }, Promise.resolve(raster())];
  for (const image of badImages) { input.readPixels = () => image; assert.equal(diaeresisCandidate(input), null); }
  input.readPixels = () => { throw new Error('unavailable'); }; assert.equal(diaeresisCandidate(input), null);
  assert.equal(diaeresisCandidate(), null); assert.equal(diaeresisCandidate(null), null);
});
test('alpha is composited onto white; invisible black RGB never becomes evidence', () => {
  const input = fixture('U'); input.reading = 'Ü';
  const transparent = raster();
  for (let index = 3; index < transparent.data.length; index += 4) transparent.data[index] = 0;
  input.readPixels = () => transparent; assert.equal(diaeresisCandidate(input), null);
  const visible = raster();
  for (let index = 3; index < visible.data.length; index += 4) visible.data[index] = 100;
  input.readPixels = () => visible; assert.equal(diaeresisCandidate(input), 'Ü');
});
test('glyph-side, area and raster bounds are preflight refusals without callback allocation', () => {
  for (const [width, height] of [[129, 30], [24, 129], [128, 33]]) {
    const input = fixture('U', width, height); input.reading = 'Ü'; let calls = 0;
    input.readPixels = () => { calls++; return raster('diaeresis-U', width, height); };
    assert.equal(diaeresisCandidate(input), null); assert.equal(calls, 0);
  }
  for (const [width, height] of [[0, 30], [Infinity, 30], [32769, 30], [6000, 6000], [24.5, 30]]) {
    const input = fixture('U'); input.reading = 'Ü'; input.width = width; input.height = height;
    assert.equal(diaeresisCandidate(input), null);
  }
});
test('the cumulative glyph pixel budget is checked before reading; its exact boundary remains usable', () => {
  for (const count of [8, 9]) {
    const input = fixture(Array(count).fill('U').join(' '), 64, 64); input.reading = Array(count).fill('Ü').join(' ');
    let calls = 0; input.readPixels = () => { calls++; return raster('diaeresis-U', 64, 64); };
    assert.equal(diaeresisCandidate(input), count === 8 ? input.reading : null);
    assert.equal(calls, count === 8 ? 8 : 0, '32768 pixels accepted; 36864 refused before any callback');
  }
});
test('word, line/symbol and changed-symbol counts are explicitly bounded before pixel work', () => {
  for (const text of [Array(19).fill('A').join(' '), 'A'.repeat(241), Array(17).fill('A').join(' ')]) {
    const input = fixture(text); input.reading = text.replaceAll('A', 'Ä'); let called = false;
    input.readPixels = () => { called = true; return raster(); };
    assert.equal(diaeresisCandidate(input), null); assert.equal(called, false);
  }
});

done();
