'use strict';

const { isContactLine } = require('./ocr-quality');

// This is bounded geometric candidate evidence, not a language/correctness
// verdict. Two identically placed noise dots are indistinguishable from an
// intentional diaeresis. Callers must retain reading_disagreement even when
// adopting a candidate, and must keep their existing OCR/pass/pixel budgets.
const THRESHOLDS = Object.freeze([160, 176, 192, 208, 224, 240]);
const CHANGES = Object.freeze({ a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' });
const MAX_LINE_UNITS = 240;
const MAX_WORDS = 18;
const MAX_SYMBOLS = 240;
const MAX_CHANGES = 16;
const MAX_GLYPH_SIDE = 128;
const MAX_GLYPH_PIXELS = 4096;
const MAX_TOTAL_PIXELS = 32768;
const MAX_RASTER_SIDE = 32768;
const MAX_RASTER_PIXELS = 30000000;

function box(value, width, height) {
  return value && ['x0', 'y0', 'x1', 'y1'].every(key => Number.isSafeInteger(value[key])) &&
    value.x0 >= 0 && value.y0 >= 0 && value.x1 <= width && value.y1 <= height &&
    value.x0 < value.x1 && value.y0 < value.y1;
}

const within = (outer, inner) => outer.x0 <= inner.x0 && outer.y0 <= inner.y0 &&
  outer.x1 >= inner.x1 && outer.y1 >= inner.y1;
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const scalar = text => typeof text === 'string' && text.length >= 1 && text.length <= 2 && Array.from(text).length === 1 &&
  !(text.codePointAt(0) >= 0xd800 && text.codePointAt(0) <= 0xdfff);

function components(gray, width, height, threshold) {
  const seen = new Uint8Array(gray.length), stack = new Uint16Array(gray.length), result = [];
  for (let index = 0; index < gray.length; index++) {
    if (seen[index] || gray[index] >= threshold) continue;
    if (result.length === 3) return null;
    let length = 1;
    stack[0] = index; seen[index] = 1;
    const part = { area: 0, x0: width, y0: height, x1: 0, y1: 0 };
    while (length) {
      const position = stack[--length], x = position % width, y = Math.floor(position / width);
      part.area++; part.x0 = Math.min(part.x0, x); part.y0 = Math.min(part.y0, y);
      part.x1 = Math.max(part.x1, x + 1); part.y1 = Math.max(part.y1, y + 1);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbour = ny * width + nx;
          if (!seen[neighbour] && gray[neighbour] < threshold) {
            seen[neighbour] = 1; stack[length++] = neighbour;
          }
        }
      }
    }
    result.push(part);
  }
  return result.length === 3 ? result.sort((a, b) => b.area - a.area) : null;
}

function twoDots(gray, width, height, threshold) {
  const parts = components(gray, width, height, threshold);
  if (!parts) return false;
  const body = parts[0], dots = parts.slice(1).sort((a, b) => a.x0 - b.x0);
  const bw = body.x1 - body.x0, bh = body.y1 - body.y0;
  if (bw < 4 || bh < 6 || body.area < 0.6 * parts.reduce((sum, part) => sum + part.area, 0)) return false;
  for (const dot of dots) {
    const dw = dot.x1 - dot.x0, dh = dot.y1 - dot.y0;
    if (dot.area < 2 || dot.area > 0.2 * body.area || dw / dh < 0.5 || dw / dh > 2 ||
        dw > 0.45 * bw || dh > 0.4 * bh || dot.y1 >= body.y0 || body.y0 - dot.y1 > 0.6 * bh ||
        dot.x0 < body.x0 || dot.x1 > body.x1) return false;
  }
  const left = dots[0], right = dots[1];
  const dx = (right.x0 + right.x1 - left.x0 - left.x1) / 2;
  const dy = Math.abs(right.y0 + right.y1 - left.y0 - left.y1) / 2;
  const ratio = left.area / right.area;
  return dy <= Math.max(1, 0.1 * bh) && dx >= 0.2 * bw && dx <= 0.85 * bw && ratio >= 0.5 && ratio <= 2;
}

function pixelEvidence(image, width, height) {
  if (!image || image.width !== width || image.height !== height ||
      !(image.data instanceof Uint8ClampedArray || image.data instanceof Uint8Array) ||
      image.data.length !== width * height * 4) return false;
  const gray = new Uint8Array(width * height);
  for (let index = 0; index < gray.length; index++) {
    const offset = index * 4, alpha = image.data[offset + 3];
    const luminance = Math.round((299 * image.data[offset] + 587 * image.data[offset + 1] +
      114 * image.data[offset + 2]) / 1000);
    // Hidden RGB in transparent pixels is not ink. Project the actual RGBA
    // surface onto white, matching the original white OCR raster background.
    gray[index] = Math.round((luminance * alpha + 255 * (255 - alpha)) / 255);
  }
  let consecutive = 0;
  for (const threshold of THRESHOLDS) {
    consecutive = twoDots(gray, width, height, threshold) ? consecutive + 1 : 0;
    if (consecutive === 3) return true;
  }
  return false;
}

/**
 * Return the supplied candidate text or null; never mutate input metadata or
 * pixel data. `reading` is an already extracted single crop line, without a
 * record separator. The original OCR line may have up to two terminal LF
 * (or CRLF) record separators; no other trimming, Unicode normalization or
 * spacing change occurs. Exact word/symbol reconstruction is still required.
 * `contact` must be explicitly false, and recognized contact syntax is refused.
 * `readPixels` is synchronous and receives only a frozen copy of the exact
 * original symbol bbox. It must return matching { width, height, data: RGBA }.
 * At most 16 glyphs, 4096 pixels/glyph, 128 pixels/side and 32768 total pixels
 * are read after all line/word/symbol and budget preflight checks succeed.
 */
function diaeresisCandidate(input) {
  try {
    const { line, reading, width, height, contact, readPixels } = input || {};
    if (contact !== false || typeof readPixels !== 'function' || typeof reading !== 'string' ||
        typeof line?.text !== 'string' || line.text.length > MAX_LINE_UNITS + 4 ||
        !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
        width < 1 || height < 1 || width > MAX_RASTER_SIDE || height > MAX_RASTER_SIDE ||
        width * height > MAX_RASTER_PIXELS || !box(line.bbox, width, height)) return null;
    const original = line.text.replace(/(?:\r?\n){1,2}$/u, '');
    if (!original || original.length > MAX_LINE_UNITS || original.length !== reading.length ||
        /[\r\n]/u.test(original) || isContactLine(original)) return null;
    const changed = [];
    for (let offset = 0; offset < original.length; offset++) {
      if (original[offset] === reading[offset]) continue;
      if (!Object.hasOwn(CHANGES, original[offset]) || CHANGES[original[offset]] !== reading[offset]) return null;
      changed.push(offset);
    }
    if (!changed.length || changed.length > MAX_CHANGES || !Array.isArray(line.words) ||
        !line.words.length || line.words.length > MAX_WORDS) return null;
    const symbols = [], byOffset = new Map(), texts = [];
    let offset = 0;
    for (const word of line.words) {
      if (typeof word?.text !== 'string' || !word.text || word.text.length > MAX_LINE_UNITS || /\s/u.test(word.text) ||
          !box(word.bbox, width, height) || !within(line.bbox, word.bbox) ||
          !Array.isArray(word.symbols) || !word.symbols.length ||
          symbols.length + word.symbols.length > MAX_SYMBOLS) return null;
      let text = '';
      for (const symbol of word.symbols) {
        if (!scalar(symbol?.text) || !box(symbol.bbox, width, height) || !within(word.bbox, symbol.bbox)) return null;
        const symbolBox = Object.freeze({ x0: symbol.bbox.x0, y0: symbol.bbox.y0,
          x1: symbol.bbox.x1, y1: symbol.bbox.y1 });
        byOffset.set(offset + text.length, symbolBox); symbols.push(symbolBox); text += symbol.text;
      }
      if (text !== word.text) return null;
      texts.push(text); offset += text.length + 1;
    }
    if (texts.join(' ') !== original) return null;
    const requested = [];
    let totalPixels = 0;
    for (const position of changed) {
      const symbolBox = byOffset.get(position);
      if (!symbolBox || symbols.some(other => other !== symbolBox && overlaps(symbolBox, other))) return null;
      const glyphWidth = symbolBox.x1 - symbolBox.x0, glyphHeight = symbolBox.y1 - symbolBox.y0;
      const pixels = glyphWidth * glyphHeight;
      totalPixels += pixels;
      if (glyphWidth > MAX_GLYPH_SIDE || glyphHeight > MAX_GLYPH_SIDE || pixels > MAX_GLYPH_PIXELS ||
          totalPixels > MAX_TOTAL_PIXELS) return null;
      requested.push({ box: symbolBox, width: glyphWidth, height: glyphHeight });
    }
    for (const glyph of requested) {
      if (!pixelEvidence(readPixels(glyph.box), glyph.width, glyph.height)) return null;
    }
    return reading;
  } catch {
    // Absent/malformed metadata, callback failures and unavailable pixels have
    // no text-changing authority. The caller retains its primary value.
    return null;
  }
}

module.exports = Object.freeze({ diaeresisCandidate });
