'use strict';

function horizontal(item) {
  return Array.isArray(item?.transform) && item.transform.length === 6 && item.transform.every(Number.isFinite) &&
    item.transform[0] > 0 && item.transform[3] > 0 && Math.abs(item.transform[1]) < 0.001 &&
    Math.abs(item.transform[2]) < 0.001 && Number.isFinite(item.width) && item.width > 0;
}

// Keep PDF draw order and exact characters. Only insert a missing boundary when
// two ordinary horizontal runs demonstrably occupy different lines or move back
// across the page (e.g. a page number drawn after its right-hand footer).
function nativeTextSeparator(previous, item) {
  if (!horizontal(previous) || !horizontal(item)) return '';
  const height = Math.max(previous.transform[3], item.transform[3]);
  if (Math.abs(item.transform[5] - previous.transform[5]) > height * 0.75 ||
      item.transform[4] < previous.transform[4] - height * 0.25) return '\n';
  return item.transform[4] - previous.transform[4] - previous.width > height * 0.25 ? ' ' : '';
}

function paintedTextGeometryAvailable(operators, ops) {
  if (!Array.isArray(operators?.fnArray) || !Array.isArray(operators?.argsArray)) return false;
  const textPaint = new Set(['showText', 'showSpacedText', 'nextLineShowText', 'nextLineSetSpacingShowText'].map(key => ops[key]).filter(Number.isInteger));
  const obscuringPaint = new Set(['paintImageXObject', 'paintInlineImageXObject', 'paintImageXObjectRepeat',
    'paintInlineImageXObjectGroup', 'paintImageMaskXObject', 'paintImageMaskXObjectGroup', 'paintImageMaskXObjectRepeat',
    'fill', 'eoFill', 'fillStroke', 'eoFillStroke', 'closeFillStroke', 'closeEOFillStroke', 'shadingFill',
    'constructPath', 'rawFillPath', 'paintSolidColorImageMask', 'stroke', 'closeStroke'].map(key => ops[key]).filter(Number.isInteger));
  const complex = new Set(['paintFormXObjectBegin', 'beginGroup', 'clip', 'eoClip'].map(key => ops[key]).filter(Number.isInteger));
  let textSeen = false;
  for (let index = 0; index < operators.fnArray.length; index++) {
    const operation = operators.fnArray[index], args = operators.argsArray[index];
    // TextContent has no paint-order provenance. A later raster/fill may cover
    // its text, and forms/clipping cannot be aligned safely here. Retain OCR.
    if (complex.has(operation) || (textSeen && obscuringPaint.has(operation))) return false;
    if (textPaint.has(operation)) textSeen = true;
    // Invisible OCR layers and clipping/transparent text are not evidence that
    // an overlapping raster word duplicates visible native text. Keep OCR.
    if (operation === ops.setTextRenderingMode && (!Array.isArray(args) || ![0, 1, 2].includes(args[0]))) return false;
    if (operation === ops.setGState) {
      const states = args?.[0];
      if (!Array.isArray(states)) return false;
      if (states.some(state => !Array.isArray(state) || state.length !== 2 || typeof state[0] !== 'string')) return false;
      if (states.some(state => Array.isArray(state) &&
          ((['ca', 'CA'].includes(state[0]) && state[1] !== 1) ||
           (state[0] === 'BM' && !['source-over', 'Normal'].includes(state[1]))))) return false;
    }
  }
  return true;
}

function nativeTextRegions(items, styles, viewport) {
  if (typeof viewport?.convertToViewportPoint !== 'function') return [];
  const regions = [];
  let previous;
  for (const item of items) {
    if (typeof item.str !== 'string' || !item.str.trim()) continue;
    if (/[\p{Co}\uFFFD]/u.test(item.str) || !horizontal(item)) { previous = undefined; continue; }
    const style = styles?.[item.fontName];
    if (style?.vertical || !Number.isFinite(style?.ascent) || !Number.isFinite(style?.descent) ||
        style.ascent < 0.5 || style.ascent > 1.5 || style.descent < -0.5 || style.descent > 0) { previous = undefined; continue; }
    const [, , , size, x, baseline] = item.transform;
    const points = [...viewport.convertToViewportPoint(x, baseline + size * style.descent),
      ...viewport.convertToViewportPoint(x + item.width, baseline + size * style.ascent)];
    if (!Array.isArray(points) || points.length !== 4 || !points.every(Number.isFinite)) { previous = undefined; continue; }
    const region = { x0: Math.min(points[0], points[2]), y0: Math.min(points[1], points[3]),
      x1: Math.max(points[0], points[2]), y1: Math.max(points[1], points[3]), text: item.str };
    // A single word can be split between native font runs (often its period).
    // Merge only contiguous runs on the same baseline with near-equal font size;
    // never bridge spaces/columns, rotated runs or undecodable glyphs.
    const baselinePoint = viewport.convertToViewportPoint(x, baseline);
    if (previous && Math.abs(baselinePoint[1] - previous.baselineY) <= 1 &&
        Math.abs(baselinePoint[0] - previous.baselineX) > 0 &&
        Math.abs(size - previous.size) <= Math.max(size, previous.size) * 0.1 &&
        region.x0 >= previous.region.x0 && Math.abs(region.x0 - previous.region.x1) <= 1) {
      previous.region.x1 = Math.max(previous.region.x1, region.x1);
      previous.region.y0 = Math.min(previous.region.y0, region.y0);
      previous.region.y1 = Math.max(previous.region.y1, region.y1);
      previous.region.text += item.str;
    } else regions.push(region);
    previous = { region: regions.at(-1), size, baselineY: baselinePoint[1], baselineX: baselinePoint[0] };
    // Unknown/exceptionally complex geometry must retain OCR, not guess coverage.
    if (regions.length > 10000) return [];
  }
  return regions;
}

function validBox(box) {
  return box && ['x0', 'y0', 'x1', 'y1'].every(key => Number.isFinite(box[key])) && box.x1 > box.x0 && box.y1 > box.y0;
}

// Geometry AND exact token evidence: overlapping, different raster text must
// survive, including OCR errors and text covering an older native text layer.
// If the OCR layout is absent/invalid or the comparison budget is exceeded, keep
// all OCR. Never perform fuzzy word corrections or infer a graphic's meaning.
function uncoveredOcrText(data, regions) {
  if (!Array.isArray(data.blocks) || !regions.length) return data.text;
  let comparisons = 0, wordsSeen = 0, omitted = false;
  const output = [];
  for (const block of data.blocks) {
    if (!Array.isArray(block.paragraphs)) return data.text;
    for (const paragraph of block.paragraphs) {
      if (!Array.isArray(paragraph.lines)) return data.text;
      for (const line of paragraph.lines) {
        if (!Array.isArray(line.words) || typeof line.text !== 'string' || !line.words.length) return data.text;
        const segments = [], kept = [];
        let changed = false;
        for (const word of line.words) {
          if (++wordsSeen > 20000 || typeof word.text !== 'string' || !validBox(word.bbox)) return data.text;
          let covered = false;
          for (const region of regions) {
            if (++comparisons > 2000000) return data.text;
            // One raster pixel permits antialiasing rounding, not nearby words.
            if (word.bbox.x0 >= region.x0 - 1 && word.bbox.y0 >= region.y0 - 1 &&
                word.bbox.x1 <= region.x1 + 1 && word.bbox.y1 <= region.y1 + 1 &&
                typeof region.text === 'string' && region.text.normalize('NFC').split(/\s+/u)
                  .includes(word.text.normalize('NFC').trim())) { covered = true; break; }
          }
          if (covered) {
            changed = omitted = true;
            if (kept.length) { segments.push(kept.join(' ')); kept.length = 0; }
          } else kept.push(word.text);
        }
        if (!changed) output.push(line.text);
        else {
          if (kept.length) segments.push(kept.join(' '));
          // Do not join separate image text fragments across an omitted run.
          if (segments.length) output.push(`${segments.join('\n')}\n`);
        }
      }
    }
  }
  return omitted ? output.join('') : data.text;
}

module.exports = Object.freeze({ nativeTextSeparator, paintedTextGeometryAvailable, nativeTextRegions, uncoveredOcrText });
