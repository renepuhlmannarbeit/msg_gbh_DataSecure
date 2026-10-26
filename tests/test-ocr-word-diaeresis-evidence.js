'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createSuite } = require('./helpers');
const file = path.resolve(__dirname, '../plugins/data-secure/server/standalone/ocr-word-diaeresis-evidence.js');
const { wordDiaeresisCandidate } = require(file);
const actualGlyph = require('../plugins/data-secure/server/standalone/ocr-diaeresis-evidence');
const { test, done, assert } = createSuite('Bounded whole-word OCR diaeresis positions');

// Synthetic component topology, not font rendering or an OCR reference answer.
function surface(text, cellWidth, height, dotGray = 0) {
  const width = Array.from(text).length * cellWidth;
  const data = new Uint8ClampedArray(width * height * 4); data.fill(255);
  const rectangle = (x0, y0, x1, y1, gray = 0) => {
    for (let y = y0; y < y1 && y < height; y++) for (let x = x0; x < x1 && x < width; x++) {
      const at = (y * width + x) * 4; data[at] = gray; data[at + 1] = gray; data[at + 2] = gray;
    }
  };
  for (let index = 0; index < Array.from(text).length; index++) {
    const x = index * cellWidth;
    rectangle(x + 4, 10, x + 7, 28); rectangle(x + 17, 10, x + 20, 28);
    rectangle(x + 4, 25, x + 20, 28);
    rectangle(x + 7, 4, x + 10, 7, dotGray); rectangle(x + 14, 4, x + 17, 7, dotGray);
  }
  return { width, height, data };
}

function fixture(text = 'A', reading = 'Ä', options = {}) {
  const cellWidth = options.cellWidth || 24, height = options.height || 30, images = [], reads = [];
  let cursor = 0;
  const words = text.split(' ').map(wordText => {
    const x0 = cursor, characters = Array.from(wordText);
    const symbols = characters.map((character, index) => ({ text: character,
      bbox: { x0: Math.max(x0, cursor + index * cellWidth - (options.overlap ? 5 : 0)), y0: 0,
        x1: cursor + (index + 1) * cellWidth, y1: height }, confidence: 97 }));
    cursor += characters.length * cellWidth;
    const word = { text: wordText, bbox: { x0, y0: 0, x1: cursor, y1: height }, symbols, confidence: 17 };
    images.push({ bbox: { ...word.bbox }, image: surface(wordText, cellWidth, height, options.dotGray || 0) });
    cursor += 8; return word;
  });
  const line = { text, bbox: { x0: 0, y0: 0, x1: cursor - 8, y1: height }, words, confidence: 23 };
  const input = { line, reading, width: cursor, height, direction: 'ltr', contact: false, pageLines: [line],
    readPixels: box => { assert.ok(Object.isFrozen(box)); reads.push(box);
      const item = images.find(item => JSON.stringify(item.bbox) === JSON.stringify(box));
      assert.ok(item, 'only complete bound original word ROIs are requested'); return item.image; } };
  return { input, images, reads };
}

const freeze = object => {
  if (object && typeof object === 'object') { Object.values(object).forEach(freeze); Object.freeze(object); }
  return object;
};
function observedModule({ bypassGlyph = false, maximumPushes } = {}) {
  const allocated = [], carriers = [], module = { exports: {} }, localRequire = createRequire(file);
  const track = Constructor => new Proxy(Constructor, { construct(target, args) {
    const result = Reflect.construct(target, args); allocated.push(result); return result;
  } });
  const context = vm.createContext({ module, exports: module.exports,
    require: name => name === './ocr-diaeresis-evidence' ? { diaeresisCandidate: input => {
      carriers.push(input.line); return bypassGlyph ? input.reading : actualGlyph.diaeresisCandidate(input);
    } } : localRequire(name), Uint8Array: track(Uint8Array), Uint8ClampedArray: track(Uint8ClampedArray) });
  if (maximumPushes !== undefined) {
    context.maximumPushes = maximumPushes;
    vm.runInContext(`globalThis.pushCount=0;globalThis.pushOverflow=false;
      const originalPush=Array.prototype.push;
      Array.prototype.push=function(...items){pushCount+=items.length;
        if(pushCount>maximumPushes){pushOverflow=true;throw new Error('test allocation cap');}
        return Reflect.apply(originalPush,this,items);};`, context);
  }
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return { candidate: module.exports.wordDiaeresisCandidate, allocated, carriers,
    pushStats: () => ({ count: context.pushCount, overflow: context.pushOverflow }) };
}
function refusedBeforePixels(input, mutate) {
  const made = fixture(input[0], input[1]); if (mutate) mutate(made);
  assert.equal(wordDiaeresisCandidate(made.input), null); assert.equal(made.reads.length, 0);
}
function foreignLine(bbox) {
  return { text: 'B', bbox: { ...bbox }, words: [{ text: 'B', bbox: { ...bbox },
    symbols: [{ text: 'B', bbox: { ...bbox } }] }] };
}
function pixelsFromGray(width, height, gray) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < gray.length; index++) { const at = index * 4;
    data[at] = gray[index]; data[at + 1] = gray[index]; data[at + 2] = gray[index]; data[at + 3] = 255; }
  return { width, height, data };
}

for (const [before, after] of [['a', 'ä'], ['o', 'ö'], ['u', 'ü'], ['A', 'Ä'], ['O', 'Ö'], ['U', 'Ü']]) {
  test(`same supplied ${before} candidate, original word pixels and immutable input`, () => {
    const f = fixture(before, after), saved = JSON.stringify(f.input.line), bytes = Array.from(f.images[0].image.data);
    freeze(f.input.line); freeze(f.input.pageLines);
    assert.equal(wordDiaeresisCandidate(f.input), after); assert.equal(f.reads.length, 1);
    assert.equal(JSON.stringify(f.input.line), saved); assert.deepEqual(Array.from(f.images[0].image.data), bytes);
  });
}
test('complete word segmentation replaces all temporary symbol boxes rather than mixing old overlap', () => {
  const f = fixture('Abu', 'Äbü', { overlap: true }), observed = observedModule();
  const before = JSON.stringify(f.input.line);
  assert.equal(observed.candidate(f.input), 'Äbü'); assert.equal(f.reads.length, 1);
  const symbols = observed.carriers[0].words[0].symbols;
  assert.equal(symbols.length, 3);
  for (let index = 1; index < symbols.length; index++) assert.equal(symbols[index - 1].bbox.x1, symbols[index].bbox.x0);
  assert.equal(JSON.stringify(f.input.line), before);
});
test('unchanged supplementary symbols, German ß and Latin-1 accents preserve exact UTF16 positions', () => {
  for (const [before, after] of [['😀 A Straße', '😀 Ä Straße'], ['Auß', 'Äuß'], ['ÉAu', 'ÉÄu']]) {
    const f = fixture(before, after); assert.equal(wordDiaeresisCandidate(f.input), after);
  }
});
test('up to two trailing OCR record separators do not change the supplied line surface', () => {
  const f = fixture('A', 'Ä'); f.input.line.text = 'A\r\n\r\n';
  assert.equal(wordDiaeresisCandidate(f.input), 'Ä'); assert.equal(f.input.line.text, 'A\r\n\r\n');
});
test('all changed words must pass; a later failed glyph cannot return a partial line', () => {
  const f = fixture('A U', 'Ä Ü'); f.images[1].image.data.fill(255);
  assert.equal(wordDiaeresisCandidate(f.input), null); assert.equal(f.reads.length, 2);
});
test('shared primary-plus-fallback budget is caller-owned and never retried or reset', () => {
  const f = fixture('U', 'Ü', { cellWidth: 64, height: 64 }); let consumed = 32768 - 4096 + 1, calls = 0;
  f.input.readPixels = box => { calls++; const cost = (box.x1 - box.x0) * (box.y1 - box.y0);
    if (consumed + cost > 32768) throw new Error('shared budget'); consumed += cost; return f.images[0].image; };
  assert.equal(wordDiaeresisCandidate(f.input), null); assert.equal(calls, 1); assert.equal(consumed, 28673);
});
test('exact cumulative 32768 word/glyph pixels are allowed; the next word refuses before every read', () => {
  for (const count of [8, 9]) {
    const f = fixture(Array(count).fill('U').join(' '), Array(count).fill('Ü').join(' '), { cellWidth: 64, height: 64 });
    assert.equal(wordDiaeresisCandidate(f.input), count === 8 ? f.input.reading : null);
    assert.equal(f.reads.length, count === 8 ? 8 : 0);
  }
});
test('exact glyph dimensions/area permit 128×32, known impossible dimensions refuse before reads', () => {
  const valid = fixture('U', 'Ü', { cellWidth: 128, height: 32 }); assert.equal(wordDiaeresisCandidate(valid.input), 'Ü');
  for (const [cellWidth, height] of [[129, 32], [128, 33], [24, 129]]) {
    const f = fixture('U', 'Ü', { cellWidth, height }); assert.equal(wordDiaeresisCandidate(f.input), null); assert.equal(f.reads.length, 0);
  }
});
for (const [before, after] of [['A', 'A'], ['Aa', 'Äb'], ['A O', 'Ä  O'], ['A O', 'Ä\tO'], ['A', 'Ä\n'],
  ['A', 'Â'], ['A', 'À'], ['Ä', 'A'], ['A ß', 'Ä ss'], ['A', '[MASKIERT]'], ['A', '*'], ['a42', 'ä43'],
  ['Aé', 'Äe\u0301'], ['😀a', '😀ä'], ['Aλ', 'Äλ'], ['AĀ', 'ÄĀ'], ['A×', 'Ä×'], ['A÷', 'Ä÷'], ['Aﬀ', 'Äﬀ']]) {
  test(`closed line / Latin-1 changed-word gate refuses ${JSON.stringify([before, after])}`, () => refusedBeforePixels([before, after]));
}
for (const mutate of [f => { f.input.direction = 'rtl'; }, f => { f.input.direction = 'LTR'; },
  f => { delete f.input.direction; }, f => { f.input.contact = true; }, f => { delete f.input.contact; },
  f => { f.input.pageLines = []; }, f => { f.input.pageLines = [{ ...f.input.line }]; },
  f => { f.input.pageLines.push(f.input.line); }, f => { f.input.line.words.push(f.input.line.words[0]); },
  f => { f.input.line.words[0].symbols.push(f.input.line.words[0].symbols[0]); },
  f => { f.input.line.text = 'A\n\n\n'; }, f => { f.input.line.text = ' A'; },
  f => { f.input.line.words[0].symbols[0].text = 'B'; }]) {
  test(`owner/alignment preflight refuses ${mutate.toString()}`, () => refusedBeforePixels(['A', 'Ä'], mutate));
}
test('contact syntax refuses even when the caller explicitly supplies contact:false', () => {
  for (const [before, after] of [['Kontakt: A', 'Kontakt: Ä'], ['a@example.invalid', 'ä@example.invalid'], ['A +49 123 456789', 'Ä +49 123 456789']]) refusedBeforePixels([before, after]);
});
test('metadata and array-index accessors are not evaluated as optional positional evidence', () => {
  for (const key of ['text', 'bbox', 'words']) {
    const f = fixture(); let evaluated = false;
    Object.defineProperty(f.input.line, key, { get() { evaluated = true; throw new Error('getter'); } });
    assert.equal(wordDiaeresisCandidate(f.input), null); assert.equal(evaluated, false); assert.equal(f.reads.length, 0);
  }
  const f = fixture(); let evaluated = false;
  Object.defineProperty(f.input.pageLines, '0', { get() { evaluated = true; return f.input.line; } });
  assert.equal(wordDiaeresisCandidate(f.input), null); assert.equal(evaluated, false); assert.equal(f.reads.length, 0);
});
test('global foreign line/word/symbol geometry is checked before borrowing a word raster', () => {
  for (const kind of ['line overlap', 'word overlap', 'symbol outside word', 'word outside line', 'line outside raster', 'invalid symbol']) {
    const f = fixture(); f.input.width += 30; f.input.height += 30;
    const other = foreignLine({ x0: 26, y0: 31, x1: 27, y1: 32 });
    if (kind === 'line overlap') other.bbox = { x0: 0, y0: 0, x1: 27, y1: 32 };
    if (kind === 'word overlap') { const word = f.input.line.words[0]; other.bbox = { ...word.bbox }; other.words[0].bbox = { ...word.bbox }; other.words[0].symbols[0].bbox = { ...word.bbox }; }
    if (kind === 'symbol outside word') other.words[0].symbols[0].bbox.x1++;
    if (kind === 'word outside line') other.words[0].bbox.x1++;
    if (kind === 'line outside raster') other.bbox.x1 = f.input.width + 1;
    if (kind === 'invalid symbol') other.words[0].symbols[0].bbox.y0 = NaN;
    f.input.pageLines.push(other); assert.equal(wordDiaeresisCandidate(f.input), null, kind); assert.equal(f.reads.length, 0, kind);
  }
});
test('foreign geometry touching only a word edge remains disjoint', () => {
  const f = fixture(); f.input.width += 1;
  f.input.pageLines.push(foreignLine({ x0: 24, y0: 0, x1: 25, y1: 1 }));
  assert.equal(wordDiaeresisCandidate(f.input), 'Ä');
});
test('duplicate word and symbol owners across distinct lines refuse', () => {
  for (const type of ['word', 'symbol']) {
    const f = fixture(); f.input.height += 2;
    const other = foreignLine({ x0: 0, y0: 30, x1: 1, y1: 31 });
    if (type === 'word') other.words[0] = f.input.line.words[0];
    else other.words[0].symbols[0] = f.input.line.words[0].symbols[0];
    f.input.pageLines.push(other); assert.equal(wordDiaeresisCandidate(f.input), null); assert.equal(f.reads.length, 0);
  }
});
test('exact 20000 global owners are bounded; 20001 lines refuse before reads', () => {
  const f = fixture('U', 'Ü', { cellWidth: 64, height: 64 }); f.input.height = 20063;
  for (let i = 0; i < 19999; i++) f.input.pageLines.push(foreignLine({ x0: 0, y0: 64 + i, x1: 1, y1: 65 + i }));
  assert.equal(wordDiaeresisCandidate(f.input), 'Ü'); assert.equal(f.reads.length, 1);
  f.input.pageLines.push(foreignLine({ x0: 1, y0: 64, x1: 2, y1: 65 }));
  assert.equal(wordDiaeresisCandidate(f.input), null); assert.equal(f.reads.length, 1);
});
test('global word and symbol counts have independent exact 20000 boundaries', () => {
  for (const kind of ['words', 'symbols']) {
    const f = fixture(); f.input.width = 20001; f.input.height = 31;
    const other = { text: '', bbox: { x0: 0, y0: 30, x1: 20000, y1: 31 }, words: [] };
    if (kind === 'words') for (let i = 0; i < 19999; i++) other.words.push(foreignLine({ x0: i, y0: 30, x1: i + 1, y1: 31 }).words[0]);
    else { const word = { text: 'B'.repeat(19999), bbox: { ...other.bbox }, symbols: [] };
      for (let i = 0; i < 19999; i++) word.symbols.push({ text: 'B', bbox: { x0: i, y0: 30, x1: i + 1, y1: 31 } }); other.words.push(word); }
    other.text = other.words.map(w => w.text).join(' '); f.input.pageLines.push(other);
    assert.equal(wordDiaeresisCandidate(f.input), 'Ä', kind); assert.equal(f.reads.length, 1);
    if (kind === 'words') other.words.push(foreignLine({ x0: 19999, y0: 30, x1: 20000, y1: 31 }).words[0]);
    else { other.words[0].text += 'B'; other.words[0].symbols.push({ text: 'B', bbox: { x0: 19999, y0: 30, x1: 20000, y1: 31 } }); }
    assert.equal(wordDiaeresisCandidate(f.input), null, kind); assert.equal(f.reads.length, 1);
  }
});
test('raster extent and finite integer bounds are closed without whole-raster allocation', () => {
  const f = fixture(); f.input.width = 1000; f.input.height = 30000; assert.equal(wordDiaeresisCandidate(f.input), 'Ä');
  for (const [width, height] of [[1001, 30000], [32769, 30], [Infinity, 30], [24.5, 30], [0, 30]]) {
    const g = fixture(); g.input.width = width; g.input.height = height;
    assert.equal(wordDiaeresisCandidate(g.input), null); assert.equal(g.reads.length, 0);
  }
});
test('word count, line units and changed count preflight preserve old glyph caps', () => {
  for (const [text, reading] of [[Array(19).fill('A').join(' '), Array(19).fill('Ä').join(' ')],
    ['A'.repeat(241), 'Ä'.repeat(241)], ['A'.repeat(17), 'Ä'.repeat(17)]]) refusedBeforePixels([text, reading]);
});
test('malformed, throwing and truncated caller image results retain originals', () => {
  for (const image of [null, { width: 24, height: 30, data: new Uint8Array(1) },
    { width: 25, height: 30, data: new Uint8Array(24 * 30 * 4) }, { width: 24, height: 30, data: [] }]) {
    const f = fixture(); f.input.readPixels = () => image; assert.equal(wordDiaeresisCandidate(f.input), null);
  }
  const f = fixture(); f.input.readPixels = () => { throw new Error('unavailable'); }; assert.equal(wordDiaeresisCandidate(f.input), null);
});
test('local ImageData accessors are read once and their borrowed original bytes survive', () => {
  const f = fixture(); const original = f.images[0].image; const calls = { width: 0, height: 0, data: 0 };
  f.input.readPixels = () => Object.fromEntries([]); const image = {};
  for (const key of Object.keys(calls)) Object.defineProperty(image, key, { get() { calls[key]++; return original[key]; } });
  f.input.readPixels = () => image;
  assert.equal(wordDiaeresisCandidate(f.input), 'Ä'); assert.deepEqual(calls, { width: 1, height: 1, data: 1 });
  assert.ok(original.data.some(v => v !== 0));
});
test('three adjacent existing glyph thresholds remain necessary after stable word segmentation', () => {
  for (const [dotGray, expected] of [[200, 'Ä'], [210, null], [230, null]]) {
    const f = fixture('A', 'Ä', { dotGray }); assert.equal(wordDiaeresisCandidate(f.input), expected);
  }
});
test('too few and too many ink runs refuse before the unchanged glyph predicate', () => {
  for (const mode of ['fewer', 'more']) {
    const f = fixture('Ab', 'Äb'), image = f.images[0].image;
    for (let y = 0; y < image.height; y++) for (let x = mode === 'fewer' ? 20 : 24; x < (mode === 'fewer' ? 28 : 25); x++) {
      const at = (y * image.width + x) * 4; image.data[at] = 0; image.data[at + 1] = 0; image.data[at + 2] = 0;
    }
    const observed = observedModule({ bypassGlyph: true }); assert.equal(observed.candidate(f.input), null); assert.equal(observed.carriers.length, 0);
  }
});
test('all admissible threshold groups must share separators; equal N everywhere is insufficient', () => {
  const f = fixture('abcdefghi', 'äbcdefghi'), image = f.images[0].image, gray = new Uint8Array(image.width * image.height).fill(255);
  for (let i = 0; i < 9; i++) for (let y = 3; y < 25; y++) for (let x = 12 + i * 10; x < 14 + i * 10; x++) gray[y * image.width + x] = 0;
  for (let y = 3; y < 25; y++) { for (let x = 2; x < 4; x++) gray[y * image.width + x] = 150;
    for (let x = 14; x < 22; x++) gray[y * image.width + x] = 150; }
  f.images[0].image = pixelsFromGray(image.width, image.height, gray);
  const observed = observedModule({ bypassGlyph: true }); assert.equal(observed.candidate(f.input), null); assert.equal(observed.carriers.length, 0);
});
test('an extra isolated pixel refuses the actual unchanged three-component glyph predicate', () => {
  const f = fixture(), image = f.images[0].image, at = (1 * image.width + 4) * 4;
  image.data[at] = 0; image.data[at + 1] = 0; image.data[at + 2] = 0;
  assert.equal(wordDiaeresisCandidate(f.input), null);
});
test('explicit limitation: compensating merged and split bodies can preserve N and candidate evidence', () => {
  const f = fixture('Abc', 'Äbc'), image = f.images[0].image; image.data.fill(255);
  const rect = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const at = (y * image.width + x) * 4; image.data[at] = 0; image.data[at + 1] = 0; image.data[at + 2] = 0;
  } };
  // Two originally separate synthetic bodies joined at their baseline; another
  // body is split into two islands. Three stable x-runs are not letter truth.
  rect(4, 10, 16, 28); rect(19, 10, 31, 28); rect(15, 25, 20, 28);
  rect(11, 4, 14, 7); rect(22, 4, 25, 7); rect(45, 10, 52, 28); rect(60, 10, 67, 28);
  assert.equal(wordDiaeresisCandidate(f.input), 'Äbc', 'bounded uncertain evidence, never physical-letter proof or verified authority');
});
test('all own word, gray and cell scratch is cleared on success and later read failure', () => {
  for (const fail of [false, true]) {
    const f = fixture(fail ? 'A U' : 'A', fail ? 'Ä Ü' : 'Ä'); const original = f.input.readPixels;
    let calls = 0; f.input.readPixels = box => { if (fail && ++calls === 2) throw new Error('closed'); return original(box); };
    const bytes = f.images.map(item => Array.from(item.image.data)), observed = observedModule();
    assert.equal(observed.candidate(f.input), fail ? null : 'Ä'); assert.ok(observed.allocated.length >= 2);
    for (const scratch of observed.allocated) assert.ok(scratch.every(byte => byte === 0));
    assert.deepEqual(f.images.map(item => Array.from(item.image.data)), bytes);
  }
});

function paint(image, x0, y0, x1, y1, gray) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const at = (y * image.width + x) * 4;
    image.data[at] = gray; image.data[at + 1] = gray; image.data[at + 2] = gray;
  }
}
function contrastInterval(first, last, reading = 'Äbc') {
  const f = fixture(reading.endsWith('ü') ? 'Abu' : 'Abc', reading), image = f.images[0].image;
  // Below first, the unchanged/changed first body has two x-runs. Above last,
  // the two suffix bodies join. Only [first,last] has exactly three runs.
  paint(image, 7, 25, 17, 28, first - 1);
  paint(image, 44, 0, 52, image.height, last);
  return f;
}
test('a complete shifted 32-value interval 90..121 is accepted without phase-specific samples', () => {
  const f = contrastInterval(90, 121), observed = observedModule();
  const before = Array.from(f.images[0].image.data);
  assert.equal(observed.candidate(f.input), 'Äbc'); assert.equal(f.reads.length, 1);
  assert.equal(observed.carriers.length, 1); assert.deepEqual(Array.from(f.images[0].image.data), before);
});
test('31 consecutive intensity values refuse before glyph evidence even with a good supplied reading', () => {
  for (const [first, last] of [[91, 121], [90, 120]]) {
    const f = contrastInterval(first, last), observed = observedModule({ bypassGlyph: true });
    assert.equal(observed.candidate(f.input), null); assert.equal(observed.carriers.length, 0);
  }
});
test('32 matching but nonconsecutive values cannot be pooled into an admissible window', () => {
  const f = contrastInterval(90, 121), image = f.images[0].image;
  paint(image, 0, 0, 1, image.height, 105);
  paint(image, 1, 0, 4, image.height, 137);
  const observed = observedModule({ bypassGlyph: true });
  assert.equal(observed.candidate(f.input), null); assert.equal(observed.carriers.length, 0);
});
test('legal integer intensity edges 1..32 and 224..255 are included, with 225..255 refused', () => {
  const lower = contrastInterval(1, 32); assert.equal(wordDiaeresisCandidate(lower.input), 'Äbc');
  const upper = contrastInterval(224, 255, 'Abü'); assert.equal(wordDiaeresisCandidate(upper.input), 'Abü');
  const short = contrastInterval(225, 255, 'Abü'), observed = observedModule({ bypassGlyph: true });
  assert.equal(observed.candidate(short.input), null); assert.equal(observed.carriers.length, 0);
});
test('white intensity255 is never promoted to ink by an illegal threshold256', () => {
  const f = fixture(); f.images[0].image.data.fill(255);
  const observed = observedModule({ bypassGlyph: true });
  assert.equal(observed.candidate(f.input), null); assert.equal(observed.carriers.length, 0);
});
test('high-frequency 32768-bound word noise is capped at N runs per level before output allocation', () => {
  const text = 'A'.repeat(240), f = fixture(text, 'Ä' + text.slice(1), { cellWidth: 128, height: 1 });
  const image = f.images[0].image;
  assert.equal(image.width * image.height, 30720);
  for (let x = 0; x < image.width; x += 2) paint(image, x, 0, x + 1, 1, 0);
  // Uncapped code would append 15,360 runs ×255 levels. The production cap
  // keeps this bounded by N=240 per level, plus small metadata bookkeeping.
  const observed = observedModule({ bypassGlyph: true, maximumPushes: 100000 });
  assert.equal(observed.candidate(f.input), null); assert.equal(observed.carriers.length, 0);
  assert.equal(observed.pushStats().overflow, false); assert.ok(observed.pushStats().count < 100000);
  for (const scratch of observed.allocated) assert.ok(scratch.every(byte => byte === 0));
});

done();
