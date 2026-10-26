'use strict';

const { isContactLine } = require('./ocr-quality');
const { diaeresisCandidate } = require('./ocr-diaeresis-evidence');

// Optional positional evidence for a conflicting, already obtained crop reading.
// No OCR, lexical repair, confidence decision or approval is performed here.
const MIN_STABLE_VALUES = 32;
const CHANGES = Object.freeze({ a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' });
const MAX_OWNERS = 20000, MAX_UNITS = 240, MAX_WORDS = 18, MAX_CHANGES = 16;
const MAX_WORD_PIXELS = 32768, MAX_GLYPH_PIXELS = 4096;

function value(object, key) {
  if (!object || typeof object !== 'object') throw new Error('OCR_WORD_METADATA');
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error('OCR_WORD_METADATA');
  return descriptor.value;
}

function list(array, maximum) {
  if (!Array.isArray(array) || array.length > maximum) throw new Error('OCR_WORD_METADATA');
  const result = [];
  for (let index = 0; index < array.length; index++) result.push(value(array, String(index)));
  return result;
}

function box(object, width, height) {
  const result = {};
  for (const key of ['x0', 'y0', 'x1', 'y1']) result[key] = value(object, key);
  return Object.values(result).every(Number.isSafeInteger) && result.x0 >= 0 && result.y0 >= 0 &&
    result.x1 <= width && result.y1 <= height && result.x0 < result.x1 && result.y0 < result.y1 ? result : null;
}

const within = (outer, inner) => outer.x0 <= inner.x0 && outer.y0 <= inner.y0 &&
  outer.x1 >= inner.x1 && outer.y1 >= inner.y1;
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const scalar = text => typeof text === 'string' && text.length >= 1 && text.length <= 2 &&
  Array.from(text).length === 1 && !(text.codePointAt(0) >= 0xd800 && text.codePointAt(0) <= 0xdfff);
const latinWord = text => /^[A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u00ff]+$/u.test(text);

function snapshotPage(pageLines, wanted, width, height) {
  const lines = list(pageLines, MAX_OWNERS), owners = new WeakSet(), words = [], lineBoxes = [];
  let selected = null, wordCount = 0, symbolCount = 0;
  const own = object => {
    if (!object || typeof object !== 'object' || owners.has(object)) throw new Error('OCR_WORD_OWNER');
    owners.add(object);
  };
  for (const line of lines) {
    own(line);
    const lineBox = box(value(line, 'bbox'), width, height), text = value(line, 'text');
    const lineWords = list(value(line, 'words'), MAX_OWNERS);
    if (!lineBox || typeof text !== 'string' || !lineWords.length || wordCount + lineWords.length > MAX_OWNERS) return null;
    wordCount += lineWords.length;
    const snapshot = { source: line, text, bbox: lineBox, words: [] };
    lineBoxes.push({ source: line, bbox: lineBox });
    for (const word of lineWords) {
      own(word);
      const wordBox = box(value(word, 'bbox'), width, height), wordText = value(word, 'text');
      const wordSymbols = list(value(word, 'symbols'), MAX_OWNERS);
      if (!wordBox || !within(lineBox, wordBox) || typeof wordText !== 'string' || !wordText || /\s/u.test(wordText) ||
          !wordSymbols.length || symbolCount + wordSymbols.length > MAX_OWNERS) return null;
      symbolCount += wordSymbols.length;
      const symbols = [];
      for (const symbol of wordSymbols) {
        own(symbol);
        const symbolBox = box(value(symbol, 'bbox'), width, height), symbolText = value(symbol, 'text');
        if (!symbolBox || !within(wordBox, symbolBox) || !scalar(symbolText)) return null;
        symbols.push({ text: symbolText, bbox: symbolBox });
      }
      if (symbols.map(symbol => symbol.text).join('') !== wordText) return null;
      const copy = { text: wordText, bbox: wordBox, symbols };
      snapshot.words.push(copy); words.push(copy);
    }
    if (line === wanted) selected = snapshot;
  }
  return selected ? { selected, words, lineBoxes } : null;
}

function inkRuns(columnMin, threshold, maximum) {
  const runs = [];
  let start = null;
  for (let x = 0; x < columnMin.length; x++) {
    const ink = columnMin[x] < threshold;
    if (ink && start === null) {
      if (runs.length === maximum) return null; // Never allocate unbounded noise runs.
      start = x;
    }
    if (!ink && start !== null) { runs.push({ x0: start, x1: x }); start = null; }
  }
  if (start !== null) runs.push({ x0: start, x1: columnMin.length });
  return runs;
}

function wordCells(columnMin, height, count, wordBox) {
  // Every integer intensity is considered once. This deliberately requires 32
  // consecutive values (span 31), not three phase-dependent sparse samples.
  // It is a bounded contrast heuristic, not proof of physical letter identity.
  const window = new Array(MIN_STABLE_VALUES).fill(null), common = [];
  let found = false;
  for (let threshold = 1; threshold <= 255; threshold++) {
    const runs = inkRuns(columnMin, threshold, count);
    window[(threshold - 1) % MIN_STABLE_VALUES] = runs?.length === count
      ? runs.slice(0, -1).map((run, index) => ({ x0: run.x1, x1: runs[index + 1].x0 })) : null;
    if (threshold < MIN_STABLE_VALUES || window.some(row => row === null)) continue;
    const gaps = [];
    for (let index = 0; index < count - 1; index++) {
      const x0 = Math.max(...window.map(row => row[index].x0));
      const x1 = Math.min(...window.map(row => row[index].x1));
      if (x1 <= x0) break;
      gaps.push({ x0, x1 });
    }
    if (gaps.length !== count - 1) continue;
    for (let index = 0; index < count - 1; index++) {
      const previous = found ? common[index] : gaps[index];
      common[index] = { x0: Math.max(previous.x0, gaps[index].x0), x1: Math.min(previous.x1, gaps[index].x1) };
      if (common[index].x1 <= common[index].x0) return null;
    }
    found = true; // All admissible windows contribute; no convenient window wins.
  }
  if (!found) return null;
  const cuts = [0, ...common.map(gap => Math.floor((gap.x0 + gap.x1) / 2)), columnMin.length];
  const cells = [];
  for (let index = 0; index < count; index++) {
    const cellWidth = cuts[index + 1] - cuts[index];
    if (cellWidth < 1 || cellWidth > 128 || height > 128 || cellWidth * height > MAX_GLYPH_PIXELS) return null;
    cells.push({ x0: wordBox.x0 + cuts[index], y0: wordBox.y0,
      x1: wordBox.x0 + cuts[index + 1], y1: wordBox.y1 });
  }
  return cells;
}

/**
 * Return an already supplied same-length diaeresis candidate, or null.
 * pageLines must contain the actual line exactly once and complete known page
 * word/symbol ownership. Only complete Latin-1-letter words are re-segmented. The
 * original line, geometry, scores and caller-owned images are never mutated.
 * readPixels receives one frozen ORIGINAL word bbox per changed word, after
 * complete metadata/ownership/area preflight. This local area cap does not reset
 * the caller's shared 32768-pixel budget across the earlier primary-box attempt
 * and this fallback; the same budgeted callback must be used for both attempts.
 * Returned text is uncertain positional evidence, never an OCR/approval verdict.
 */
function wordDiaeresisCandidate(input) {
  const scratch = [];
  try {
    const line = value(input, 'line'), reading = value(input, 'reading');
    const width = value(input, 'width'), height = value(input, 'height');
    const contact = value(input, 'contact'), direction = value(input, 'direction');
    const pageLines = value(input, 'pageLines'), readPixels = value(input, 'readPixels');
    if (contact !== false || direction !== 'ltr' || typeof readPixels !== 'function' || typeof reading !== 'string' ||
        !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
        width > 32768 || height > 32768 || width * height > 30000000) return null;
    const text = value(line, 'text');
    if (typeof text !== 'string' || text.length > MAX_UNITS + 4) return null;
    const original = text.replace(/(?:\r?\n){1,2}$/u, '');
    if (!original || original.length > MAX_UNITS || original.length !== reading.length || /[\r\n]/u.test(original) ||
        isContactLine(original) || isContactLine(reading)) return null;
    let changes = 0;
    for (let offset = 0; offset < original.length; offset++) {
      if (original[offset] === reading[offset]) continue;
      if (!Object.hasOwn(CHANGES, original[offset]) || CHANGES[original[offset]] !== reading[offset]) return null;
      changes++;
    }
    if (!changes || changes > MAX_CHANGES) return null;
    const page = snapshotPage(pageLines, line, width, height);
    if (!page || page.selected.words.length > MAX_WORDS ||
        page.selected.words.map(word => word.text).join(' ') !== original ||
        page.selected.words.reduce((sum, word) => sum + word.symbols.length, 0) > MAX_UNITS) return null;
    const requested = [];
    let offset = 0, pixels = 0;
    for (const word of page.selected.words) {
      const candidate = reading.slice(offset, offset + word.text.length);
      offset += word.text.length + 1;
      if (candidate === word.text) continue;
      if (!latinWord(word.text) || !latinWord(candidate) || word.symbols.some(symbol => symbol.text.length !== 1)) return null;
      const wordWidth = word.bbox.x1 - word.bbox.x0, wordHeight = word.bbox.y1 - word.bbox.y0;
      const area = wordWidth * wordHeight;
      pixels += area;
      if (wordHeight > 128 || wordWidth > word.text.length * 128 || area > word.text.length * MAX_GLYPH_PIXELS ||
          pixels > MAX_WORD_PIXELS || page.words.some(other => other !== word && overlaps(other.bbox, word.bbox)) ||
          page.lineBoxes.some(other => other.source !== line && overlaps(other.bbox, word.bbox))) return null;
      requested.push({ word, candidate });
    }
    if (!requested.length) return null;
    const images = new Map(), replacements = new Map();
    for (const { word } of requested) {
      const wordWidth = word.bbox.x1 - word.bbox.x0, wordHeight = word.bbox.y1 - word.bbox.y0;
      const image = readPixels(Object.freeze({ ...word.bbox }));
      // The callback may return native ImageData accessors; it is the caller's
      // local raster reader. Snapshot its bytes once and never clear that input.
      if (!image) return null;
      const imageWidth = image.width, imageHeight = image.height, imageData = image.data;
      if (imageWidth !== wordWidth || imageHeight !== wordHeight ||
          !(imageData instanceof Uint8ClampedArray || imageData instanceof Uint8Array) ||
          imageData.length !== wordWidth * wordHeight * 4) return null;
      const rgba = new Uint8ClampedArray(imageData), columnMin = new Uint8Array(wordWidth).fill(255);
      scratch.push(rgba, columnMin);
      for (let index = 0; index < wordWidth * wordHeight; index++) {
        const at = index * 4, alpha = rgba[at + 3];
        const luminance = Math.round((299 * rgba[at] + 587 * rgba[at + 1] + 114 * rgba[at + 2]) / 1000);
        const gray = Math.round((luminance * alpha + 255 * (255 - alpha)) / 255), x = index % wordWidth;
        columnMin[x] = Math.min(columnMin[x], gray);
      }
      const cells = wordCells(columnMin, wordHeight, word.text.length, word.bbox);
      if (!cells) return null;
      images.set(word, { width: wordWidth, height: wordHeight, data: rgba });
      replacements.set(word, cells.map((bbox, index) => ({ text: word.text[index], bbox })));
    }
    const carrier = { text: original, bbox: page.selected.bbox,
      words: page.selected.words.map(word => ({ text: word.text, bbox: word.bbox,
        symbols: replacements.get(word) || word.symbols })) };
    return diaeresisCandidate({ line: carrier, reading, width, height, contact: false, readPixels: cell => {
      const owner = requested.find(({ word }) => within(word.bbox, cell));
      if (!owner) throw new Error('OCR_WORD_CELL_OWNER');
      const source = images.get(owner.word), cellWidth = cell.x1 - cell.x0, cellHeight = cell.y1 - cell.y0;
      const data = new Uint8ClampedArray(cellWidth * cellHeight * 4); scratch.push(data);
      for (let y = 0; y < cellHeight; y++) {
        const begin = ((cell.y0 - owner.word.bbox.y0 + y) * source.width + cell.x0 - owner.word.bbox.x0) * 4;
        data.set(source.data.subarray(begin, begin + cellWidth * 4), y * cellWidth * 4);
      }
      return { width: cellWidth, height: cellHeight, data };
    } });
  } catch {
    return null; // Optional evidence failure retains the original OCR surface.
  } finally {
    for (const bytes of scratch) bytes.fill(0);
  }
}

module.exports = Object.freeze({ wordDiaeresisCandidate });
