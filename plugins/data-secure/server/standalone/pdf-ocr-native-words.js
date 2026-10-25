'use strict';

const { bindTextRuns, wordCandidates } = require('./pdf-text-visibility');
const { paintedTextGeometryAvailable, renderPdfOcrLayer } = require('./pdf-text-layout');
const MAX_RUNS = 4096, MAX_GLYPHS = 32768;

// This fast path uses the SAME closed paint-order proof as the legacy native
// single-token path. The renderer supplies actual glyph advances for words
// inside a longer TextContent item; no proportional subdivision of a line.
// Forms, clips, alpha/blend changes, marked-content ambiguity or later graphics
// still refuse this path. A region never removes anything until independent
// OCR supplies the exact token inside it. Native/search text is never changed.
async function renderPdfNativeWordEvidence({ page, canvas, viewport, annotationMode,
  textItems, styles, operators, ops, setTextPaintObserver }) {
  const eligible = typeof setTextPaintObserver === 'function' &&
    paintedTextGeometryAvailable(operators, ops, { strictMarkedContent: true });
  if (!eligible) {
    await renderPdfOcrLayer({ page, canvas, viewport, annotationMode });
    return null;
  }
  const runs = [], colors = [];
  let glyphsLeft = MAX_GLYPHS, valid = true;
  setTextPaintObserver(event => {
    if (runs.length >= MAX_RUNS) { valid = false; return false; }
    runs.push(event);
    // A positive opaque, solid foreground only. White/invisible/pattern paint
    // cannot acquire coverage merely from its semantic ToUnicode string.
    // PDF.js may paint into an internal transparent composition canvas even
    // when the page operator list has no group or non-default blend operation.
    // Only the actual local paint context's frozen primitive is a color proof.
    const color = event.solidFillColor;
    colors.push(typeof color === 'string' && /^#[0-9a-f]{6}$/iu.test(color) && color.toLowerCase() !== '#ffffff' &&
      event.contentVisible === true && event.renderMode === 0 && event.fillAlpha === 1);
    const collectGeometry = event.geometryEligible && Number.isSafeInteger(event.glyphCount) &&
      event.glyphCount >= 0 && event.glyphCount <= glyphsLeft;
    if (collectGeometry) glyphsLeft -= event.glyphCount;
    return { collectGeometry };
  });
  try { await renderPdfOcrLayer({ page, canvas, viewport, annotationMode }); }
  finally { setTextPaintObserver(null); }
  if (!valid) return [];
  const regions = [], used = new Set();
  for (const binding of bindTextRuns(textItems, runs, viewport)) {
    const run = runs[binding.run], item = textItems[binding.item], style = styles?.[item.fontName];
    if (!colors[binding.run] || !style || style.vertical || !Number.isFinite(style.ascent) || !Number.isFinite(style.descent) ||
      style.ascent < 0.5 || style.ascent > 1.5 || style.descent < -0.5 || style.descent > 0) continue;
    const words = wordCandidates(run);
    for (const [index, word] of words.entries()) {
      const key = `${binding.run}:${index}`;
      if (used.has(key) || (binding.wordIndex !== null && binding.wordIndex !== index) ||
        !item.str.split(/\s+/u).includes(word.text)) continue;
      used.add(key);
      const box = { text: word.text, x0: word.x0, x1: word.x1,
        y0: word.baseline - word.height * style.ascent, y1: word.baseline - word.height * style.descent };
      if (['x0','x1','y0','y1'].every(key => Number.isFinite(box[key])) && box.x1 > box.x0 && box.y1 > box.y0 &&
        box.x0 >= 0 && box.y0 >= 0 && box.x1 <= viewport.width && box.y1 <= viewport.height) regions.push(box);
    }
  }
  return regions;
}

module.exports = Object.freeze({ renderPdfNativeWordEvidence });
