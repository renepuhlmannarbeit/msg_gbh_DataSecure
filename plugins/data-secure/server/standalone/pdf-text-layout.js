'use strict';

const { isContactLine } = require('./ocr-quality');

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

// A gutter (even with staggered baselines) cannot distinguish a data table from
// prose columns. TextContent does not carry an independently proven row/column
// owner model here. Preserve every item in the original draw order until such
// a model exists; never turn Name/Account record pairs into unrelated columns.
function nativeColumnOrder(items) { return items; }

// TextContent and glyph.unicode share the same untrusted ToUnicode mapping.
// Their agreement cannot prove that native text matches the visible glyph.
// Keep the actual OCR raster wholly unchanged; only exact, geometrically bound
// comparisons AFTER independent OCR may remove duplicate transcript words.
async function renderPdfOcrLayer({ page, canvas, viewport, annotationMode }) {
  await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: 'white', annotationMode }).promise;
}

function paintedTextGeometryAvailable(operators, ops, { strictMarkedContent = false } = {}) {
  if (!Array.isArray(operators?.fnArray) || !Array.isArray(operators?.argsArray)) return false;
  const textPaint = new Set(['showText', 'showSpacedText', 'nextLineShowText', 'nextLineSetSpacingShowText'].map(key => ops[key]).filter(Number.isInteger));
  const obscuringPaint = new Set(['paintImageXObject', 'paintInlineImageXObject', 'paintImageXObjectRepeat',
    'paintInlineImageXObjectGroup', 'paintImageMaskXObject', 'paintImageMaskXObjectGroup', 'paintImageMaskXObjectRepeat',
    'fill', 'eoFill', 'fillStroke', 'eoFillStroke', 'closeFillStroke', 'closeEOFillStroke', 'shadingFill',
    'constructPath', 'rawFillPath', 'paintSolidColorImageMask', 'stroke', 'closeStroke'].map(key => ops[key]).filter(Number.isInteger));
  const complex = new Set(['paintFormXObjectBegin', 'beginGroup', 'clip', 'eoClip',
    ...(strictMarkedContent ? ['beginMarkedContent', 'beginMarkedContentProps'] : [])].map(key => ops[key]).filter(Number.isInteger));
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

// A multiword run's bounding box includes inter-word whitespace and is not a
// collection of proven word boxes. Never suppress an equal graphic word in it.
function nativeSingleTokenRegions(items, styles, viewport) {
  return nativeTextRegions(items, styles, viewport).filter(region => !/\s/u.test(region.text));
}

function nativePaintedPhraseRegions(items, styles, viewport, paintedPhraseIndices, retainedText, paintedWords) {
  // Passing one item at a time prevents geometry merging across otherwise
  // adjacent text runs. Item indices come only from the final-pixel probe.
  return Array.from(paintedPhraseIndices).flatMap(index => nativeTextRegions([items[index]], styles, viewport)
    .map(region => paintedWords ? { ...region, words: paintedWords.get(index) } : region))
    .filter(region => retainedText.includes(region.text));
}

// Two independent readings can identify one occurrence when they agree on a
// complete positively painted run, its order and its tightly coincident box.
// This never matches a lone OCR token inside a multiword geometric envelope.
function coincidentPhraseCoverage(data, phrases, matchedRegions) {
  const byFirstWord = new Map();
  for (const phrase of phrases) {
    if (!validBox(phrase) || typeof phrase.text !== 'string' || phrase.text.length > 240) continue;
    const tokens = phrase.text.normalize('NFC').trim().split(/\s+/u);
    if (tokens.length < 2 || tokens.length > 24) continue;
    const bucket = byFirstWord.get(tokens[0]);
    const entry = { phrase, tokens };
    if (bucket) bucket.push(entry);
    else byFirstWord.set(tokens[0], [entry]);
  }
  const coverage = new Map();
  if (!byFirstWord.size) return coverage;
  // Review crops bind to the full unfiltered OCR transcript. Filtering a
  // separate line on a contact-bearing page would also invalidate that proof.
  if (data.text.split(/\r\n|\r|\n/u).some(isContactLine)) return coverage;
  const pageTokens = data.text.match(/\S+/gu) || [];
  if (pageTokens.length > 20000) return coverage;
  const matches = [], regionUses = new Map(), wordUses = new Uint32Array(pageTokens.length);
  let seen = 0, comparisons = 0;
  for (const block of data.blocks) {
    if (!Array.isArray(block?.paragraphs)) return coverage;
    for (const paragraph of block.paragraphs) {
      if (!Array.isArray(paragraph?.lines)) return coverage;
      for (const line of paragraph.lines) {
        if (!Array.isArray(line?.words) || typeof line.text !== 'string' || !line.words.length ||
            seen + line.words.length > pageTokens.length) return coverage;
        const lineTokens = line.text.match(/\S+/gu) || [];
        if (line.words.length !== lineTokens.length || line.words.some((word, index) =>
          word?.text !== lineTokens[index] || word.text !== pageTokens[seen + index] || !validBox(word.bbox))) return coverage;
        const lineStart = seen;
        seen += line.words.length;
        const tokens = lineTokens.map(token => token.normalize('NFC'));
        for (let offset = 0; offset < tokens.length; offset++) {
          for (const entry of byFirstWord.get(tokens[offset]) || []) {
            if (++comparisons > 100000) return coverage;
            const { phrase, tokens: expected } = entry;
            if (offset + expected.length > tokens.length ||
                expected.some((token, index) => token !== tokens[offset + index])) continue;
            const words = line.words.slice(offset, offset + expected.length);
            if (words.some((word, index) => index && word.bbox.x0 < words[index - 1].bbox.x1)) continue;
            if (Object.hasOwn(phrase, 'words') && (phrase.words?.length !== words.length ||
                words.some(({ bbox }, index) => {
                  const paint = phrase.words[index];
                  return !validBox(paint) || bbox.x0 < paint.x0 - 1 || bbox.y0 < paint.y0 - 1 ||
                    bbox.x1 > paint.x1 + 1 || bbox.y1 > paint.y1 + 1;
                }))) continue;
            const x0 = words[0].bbox.x0, x1 = words.at(-1).bbox.x1;
            const y0 = Math.min(...words.map(word => word.bbox.y0));
            const y1 = Math.max(...words.map(word => word.bbox.y1));
            const height = phrase.y1 - phrase.y0;
            const slop = Math.min(5, height * 0.2);
            const commonHeight = Math.min(y1, phrase.y1) - Math.max(y0, phrase.y0);
            if (Math.abs(x0 - phrase.x0) > slop || Math.abs(x1 - phrase.x1) > slop ||
                commonHeight < (y1 - y0) * 0.95 || commonHeight < height * 0.45) continue;
            matches.push({ line, entry, offset, start: lineStart + offset, length: expected.length });
            regionUses.set(entry, (regionUses.get(entry) || 0) + 1);
            for (let index = 0; index < expected.length; index++) wordUses[lineStart + offset + index]++;
          }
        }
      }
    }
  }
  if (seen !== pageTokens.length) return coverage;
  for (const match of matches) {
    if (regionUses.get(match.entry) !== 1 || wordUses.subarray(match.start, match.start + match.length).some(count => count !== 1)) continue;
    matchedRegions?.add(match.entry.phrase);
    let selected = coverage.get(match.line);
    if (!selected) coverage.set(match.line, selected = new Set());
    for (let index = 0; index < match.length; index++) selected.add(match.offset + index);
  }
  return coverage;
}

function coincidentNativePhraseCandidates(data, items, styles, viewport, retainedText, alreadyProven) {
  if (!Array.isArray(data.blocks) || items.length > 10000) return [];
  const regions = new Map();
  for (let index = 0; index < items.length; index++) {
    if (alreadyProven?.has(index) || !/\S\s+\S/u.test(items[index]?.str || '')) continue;
    for (const region of nativePaintedPhraseRegions(items, styles, viewport, [index], retainedText)) regions.set(region, index);
  }
  const matches = new Set();
  coincidentPhraseCoverage(data, regions.keys(), matches);
  // One extra probe per page. Prefer prominent text in its upper quarter.
  // OCR reading order can put a small banner ahead of the main heading.
  // Rank only after testing occurrence ownership against every candidate.
  return [...matches].filter(region => region.y0 < viewport.height / 4)
    .sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0) || a.y0 - b.y0 || a.x0 - b.x0)
    .map(region => regions.get(region));
}

// Geometry AND exact text evidence: overlapping, different raster text must
// survive, including OCR errors and text covering an older native text layer.
// If the OCR layout is absent/invalid or the comparison budget is exceeded, keep
// all OCR. Never perform fuzzy word corrections or infer a graphic's meaning.
function uncoveredOcrText(data, regions, { singleTokenOnly = false, phrases = [], artifactWords } = {}) {
  if (!Array.isArray(data.blocks) || (!regions.length && !phrases.length && !artifactWords?.size)) return data.text;
  const phraseCoverage = coincidentPhraseCoverage(data, phrases);
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
        const phraseWords = phraseCoverage.get(line);
        for (const [index, word] of line.words.entries()) {
          if (++wordsSeen > 20000 || typeof word.text !== 'string' || !validBox(word.bbox)) return data.text;
          let covered = phraseWords?.has(index) === true || artifactWords?.get(line)?.has(index) === true;
          for (const region of covered ? [] : regions) {
            if (++comparisons > 2000000) return data.text;
            if (singleTokenOnly && (typeof region.text !== 'string' || /\s/u.test(region.text))) continue;
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
        if (!changed) output.push((phraseCoverage.size || artifactWords?.size) && !/[\r\n]$/u.test(line.text) ? `${line.text}\n` : line.text);
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

module.exports = Object.freeze({ ...require('./pdf-structure-layout'), nativeTextSeparator, nativeColumnOrder, renderPdfOcrLayer,
  paintedTextGeometryAvailable, nativeTextRegions, nativeSingleTokenRegions, nativePaintedPhraseRegions,
  coincidentNativePhraseCandidates, uncoveredOcrText });
