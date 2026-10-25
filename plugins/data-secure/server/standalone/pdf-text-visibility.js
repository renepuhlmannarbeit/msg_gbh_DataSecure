'use strict';

// TextContent has no paint/clip/cover provenance. Never classify merely from
// a word/language heuristic or a raster that may have rounded tiny text away.
const compact = value => typeof value === 'string' ? value.replace(/\s/gu, '') : '';
const MAX_ITEMS = 10000, MAX_RUNS = 4096, MAX_COMPARISONS = 500000, MAX_GLYPHS = 32768;

function bindTextRuns(items, runs, viewport) {
  if (items.length > MAX_ITEMS || runs.length > MAX_RUNS ||
      runs.reduce((count, run) => count + (Array.isArray(run.glyphs) ? run.glyphs.length : 0), 0) > MAX_GLYPHS) return [];
  const bindings = [], used = new Map(), words = runs.map(wordCandidates), compactRuns = runs.map(run => compact(run.text));
  let comparisons = 0;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!compact(item?.str) || !Array.isArray(item.transform) || item.transform.length !== 6 ||
        !item.transform.every(Number.isFinite) || item.dir !== 'ltr' ||
        Math.hypot(item.transform[0], item.transform[1]) === 0 ||
        Math.hypot(item.transform[2], item.transform[3]) === 0) continue;
    const point = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    const compactItem = compact(item.str);
    const matches = [];
    for (let run = 0; run < runs.length; run++) {
      if (++comparisons > MAX_COMPARISONS) return [];
      const candidate = runs[run];
      const wholeMatch = candidate.eligible && compactRuns[run] === compactItem &&
          candidate.fontName === item.fontName &&
          Math.abs(candidate.baseline[0] - point[0]) <= 0.05 &&
          Math.abs(candidate.baseline[1] - point[1]) <= 0.05;
      if (wholeMatch) matches.push({ run, wordIndex: null });
      if (!wholeMatch && candidate.eligible && candidate.fontName === item.fontName && !/\s/u.test(item.str)) {
        for (let wordIndex = 0; wordIndex < words[run].length; wordIndex++) {
          if (++comparisons > MAX_COMPARISONS) return [];
          const word = words[run][wordIndex];
          if (word.text === item.str && Math.abs(word.x0 - point[0]) <= 0.05 &&
              Math.abs(word.baseline - point[1]) <= 0.05) matches.push({ run, wordIndex });
        }
      }
    }
    if (matches.length === 1) {
      const match = matches[0], key = `${match.run}:${match.wordIndex}`;
      bindings.push({ item: index, ...match });
      used.set(key, (used.get(key) || 0) + 1);
    }
  }
  const runBindings = new Map();
  for (const binding of bindings) {
    const value = runBindings.get(binding.run) || { count: 0, whole: false };
    value.count++; value.whole ||= binding.wordIndex === null; runBindings.set(binding.run, value);
  }
  return bindings.filter(binding => used.get(`${binding.run}:${binding.wordIndex}`) === 1 &&
    !(runBindings.get(binding.run).count > 1 && runBindings.get(binding.run).whole));
}

function equalPixels(left, right) {
  return left.byteLength === right.byteLength && Buffer.from(left.buffer, left.byteOffset, left.byteLength)
    .equals(Buffer.from(right.buffer, right.byteOffset, right.byteLength));
}

function explicitlyInvisible(run) {
  return run.contentVisible === false || run.renderMode === 3 ||
    (run.renderMode === 0 && run.fillAlpha === 0) ||
    (run.renderMode === 1 && run.strokeAlpha === 0) ||
    (run.renderMode === 2 && run.fillAlpha === 0 && run.strokeAlpha === 0);
}

function sameRun(left, right, geometry = false) {
  if (!left || !right || ['text', 'fontName', 'eligible', 'geometryEligible', 'glyphCount',
    'renderMode', 'fillAlpha', 'strokeAlpha', 'solidFillColor', 'contentVisible', 'fontSize'].some(key => left[key] !== right[key]) ||
      left.baseline[0] !== right.baseline[0] || left.baseline[1] !== right.baseline[1]) return false;
  if (!geometry) return true;
  const a = left.glyphs || [], b = right.glyphs || [];
  return a.length === b.length && a.every((glyph, index) => ['index', 'text', 'space', 'supported', 'x0', 'x1', 'baseline', 'height']
    .every(key => glyph[key] === b[index][key]));
}

function wordCandidates(run) {
  if (!run.geometryEligible || !Array.isArray(run.glyphs) || run.glyphs.length !== run.glyphCount || run.glyphs.length > 4096) return [];
  const words = []; let current = null;
  const finish = () => { if (current && current.text && !/[\p{Co}\p{Cc}\p{Noncharacter_Code_Point}\uFFFD\s]/u.test(current.text)) words.push(current); current = null; };
  for (const glyph of run.glyphs) {
    if (!glyph.supported || typeof glyph.text !== 'string' || !['x0', 'x1', 'baseline', 'height'].every(key => Number.isFinite(glyph[key])) ||
        glyph.x1 <= glyph.x0 || glyph.height <= 0) return [];
    if (glyph.space || /^\s*$/u.test(glyph.text)) { finish(); continue; }
    if (/\s/u.test(glyph.text)) return [];
    // Actual renderer advances include TJ, kerning and remeasurement. Do not
    // bridge an inter-word gap merely because TextContent combined a line.
    if (current && (Math.abs(glyph.baseline - current.baseline) > 0.1 ||
        glyph.x0 < current.x0 || glyph.x0 - current.x1 > glyph.height * 0.25)) finish();
    if (!current) current = { text: '', indices: [], x0: glyph.x0, x1: glyph.x1, baseline: glyph.baseline, height: glyph.height };
    current.text += glyph.text; current.indices.push(glyph.index); current.x1 = Math.max(current.x1, glyph.x1);
    current.height = Math.max(current.height, glyph.height);
  }
  finish(); return words;
}

function differenceBox(left, right, width, height) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let pixel = 0, offset = 0; offset < left.length; pixel++, offset += 4) {
    if (left[offset] === right[offset] && left[offset + 1] === right[offset + 1] &&
        left[offset + 2] === right[offset + 2] && left[offset + 3] === right[offset + 3]) continue;
    const x = pixel % width, y = Math.floor(pixel / width);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

async function classifyPdfTextVisibility({ page, textItems, viewport, createCanvas,
  setTextPaintObserver, annotationMode, maxPagePixels = 2_000_000,
  maxProbePixels = 128_000_000, maxProbes = 256, budget }) {
  const hiddenIndices = new Set(), visibleIndices = new Set(), wordRegions = [];
  const retained = () => ({ hiddenIndices, visibleIndices, wordRegions, items: textItems.filter((_, index) => !hiddenIndices.has(index)) });
  const invalidate = () => { hiddenIndices.clear(); visibleIndices.clear(); wordRegions.length = 0; return retained(); };
  const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height), area = width * height;
  const hasBudget = () => !budget || (Number.isSafeInteger(budget.remainingProbes) && budget.remainingProbes > 0 &&
    Number.isSafeInteger(budget.remainingPixels) && budget.remainingPixels >= area);
  if (typeof setTextPaintObserver !== 'function' || textItems.length > MAX_ITEMS || !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) || width < 1 || height < 1 || area > maxPagePixels || !hasBudget() ||
      !Number.isSafeInteger(maxProbes) || maxProbes < 1 || !Number.isSafeInteger(maxProbePixels) || maxProbePixels < area) return retained();
  const runs = [], suppressed = new Set(), visibleDeltas = new Map(), hiddenRuns = new Set(), visibleRuns = new Set();
  let ordinal = 0, recording = true, stableEvents = true, geometryLeft = MAX_GLYPHS;
  let replay = [], captureRun = -1, wordMask = null, probes = 0, pixels = 0;
  const canvas = createCanvas(width, height), context = canvas.getContext('2d');
  setTextPaintObserver(event => {
    const index = ordinal++;
    if (index >= MAX_RUNS) { stableEvents = false; return false; }
    let collectGeometry = false;
    if (recording) {
      runs.push(event);
      if (event.geometryEligible && event.glyphCount <= geometryLeft) {
        collectGeometry = true; geometryLeft -= event.glyphCount;
      }
    } else {
      replay.push(event);
      if (!sameRun(runs[index], event)) stableEvents = false;
      collectGeometry = Boolean(runs[index]?.glyphs?.length);
    }
    return { collectGeometry, capturePaint: captureRun === index,
      suppressPaint: stableEvents && suppressed.has(index),
      suppressGlyphs: stableEvents && wordMask?.run === index ? wordMask.indices : undefined };
  });
  async function render() {
    if (!spend()) return null;
    ordinal = 0; stableEvents = true; replay = [];
    context.clearRect(0, 0, width, height);
    await page.render({ canvas, canvasContext: context, viewport, annotationMode }).promise;
    if (!recording && (ordinal !== runs.length || replay.some((event, index) => !sameRun(runs[index], event, true)))) stableEvents = false;
    return context.getImageData(0, 0, width, height).data;
  }
  function canSpend() { return probes < maxProbes && pixels + area <= maxProbePixels && hasBudget(); }
  function spend() {
    if (!canSpend()) return false;
    probes++; pixels += area;
    if (budget) { budget.remainingProbes--; budget.remainingPixels -= area; }
    return true;
  }
  try {
    const first = await render();
    if (!first) return retained();
    const baseline = Uint8ClampedArray.from(first);
    if (!stableEvents) return invalidate();
    recording = false;
    const bindings = bindTextRuns(textItems, runs, viewport);
    if (!bindings.length) return retained();
    const reproduced = await render();
    if (!reproduced || !equalPixels(baseline, reproduced) || !stableEvents) return invalidate();
    for (const binding of bindings) {
      const run = runs[binding.run];
      if (hiddenRuns.has(binding.run)) { hiddenIndices.add(binding.item); continue; }
      if (visibleRuns.has(binding.run)) { visibleIndices.add(binding.item); continue; }
      if (explicitlyInvisible(run)) { hiddenIndices.add(binding.item); hiddenRuns.add(binding.run); suppressed.add(binding.run); continue; }
      if (!canSpend()) break;
      suppressed.add(binding.run);
      const probe = await render();
      if (!stableEvents) return invalidate();
      const delta = differenceBox(baseline, probe, width, height);
      if (delta) {
        suppressed.delete(binding.run); visibleIndices.add(binding.item); visibleRuns.add(binding.run); visibleDeltas.set(binding.run, delta);
      } else {
        suppressed.delete(binding.run);
        // Zero final pixels alone is not proof: tiny/white/near-transparent
        // legitimate text may simply round away. Require a positive actual
        // intermediate paint before accepting an opaque-cover counterfactual.
        if (!canSpend()) continue;
        captureRun = binding.run;
        const evidence = await render(); captureRun = -1;
        if (!stableEvents || !equalPixels(baseline, evidence)) return invalidate();
        if (replay[binding.run].paintEvidence?.sampled && replay[binding.run].paintEvidence.changed) {
          hiddenIndices.add(binding.item); hiddenRuns.add(binding.run); suppressed.add(binding.run);
        }
      }
    }
    const processedWords = new Set();
    for (const binding of bindings) {
      if (!visibleIndices.has(binding.item)) continue;
      const candidates = wordCandidates(runs[binding.run]);
      for (const [wordIndex, word] of candidates.entries()) {
        // TextContent may insert a real word boundary for a numeric TJ gap
        // even though the renderer's Unicode glyphs concatenate. Only the
        // actually retained native token can authorize OCR suppression.
        if (!textItems[binding.item].str.split(/\s+/u).includes(word.text)) continue;
        const key = `${binding.run}:${wordIndex}`;
        if (processedWords.has(key) || (binding.wordIndex !== null && binding.wordIndex !== wordIndex)) continue;
        processedWords.add(key);
        let delta;
        if (candidates.length === 1 && word.indices.length === runs[binding.run].glyphCount) delta = visibleDeltas.get(binding.run);
        else {
          if (!canSpend()) break;
          wordMask = { run: binding.run, indices: word.indices };
          const probe = await render(); wordMask = null;
          if (!stableEvents) return invalidate();
          delta = differenceBox(baseline, probe, width, height);
        }
        if (!delta) continue;
        // Use actual changed pixels, never a proportion of a line's text box.
        // An unexpectedly displaced glyph / paint effect cannot cover OCR.
        const margin = word.height * 0.5;
        if (delta.x0 < word.x0 - margin || delta.x1 > word.x1 + margin ||
            delta.y0 < word.baseline - word.height * 2 || delta.y1 > word.baseline + word.height) continue;
        wordRegions.push({ text: word.text, ...delta });
      }
    }
    return retained();
  } finally {
    setTextPaintObserver(null);
    canvas.width = 1; canvas.height = 1;
  }
}

module.exports = { bindTextRuns, classifyPdfTextVisibility, wordCandidates };
