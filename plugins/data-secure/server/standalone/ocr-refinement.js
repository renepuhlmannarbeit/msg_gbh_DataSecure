'use strict';

// Geometric re-segmentation, not lexical repair. No names, contact values,
// reference expectations, dictionaries or customer paths are retained here.
// The supervisor's existing deadline/owned process covers every extra pass.
const { isContactLine } = require('./ocr-quality');
const MAX_PASSES = 32;
const MAX_TOTAL_PIXELS = 2_000_000;
const MAX_CROP_PIXELS = 200_000;
const MIN_WORD_CONFIDENCE = 95;
const normalize = text => text.replace(/\s+/gu, ' ').trim();

function validBox(box, width, height) {
  return box && ['x0', 'y0', 'x1', 'y1'].every(key => Number.isSafeInteger(box[key])) &&
    box.x0 >= 0 && box.y0 >= 0 && box.x1 <= width && box.y1 <= height &&
    box.x1 > box.x0 && box.y1 > box.y0;
}

function refinementPlan(data, width, height) {
  if (typeof data?.text !== 'string' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1) return [];
  const plan = [];
  let cursor = 0, passes = 0, pixels = 0;
  for (const block of Array.isArray(data.blocks) ? data.blocks : []) {
    for (const paragraph of Array.isArray(block?.paragraphs) ? block.paragraphs : []) {
      for (const line of Array.isArray(paragraph?.lines) ? paragraph.lines : []) {
        if (typeof line?.text !== 'string') continue;
        const literal = line.text.trim();
        if (!literal || /[\r\n]/u.test(literal)) continue;
        const start = data.text.indexOf(literal, cursor);
        if (start < 0) continue;
        cursor = start + literal.length; // repeated text stays occurrence-bound
        const words = Array.isArray(line.words) ? line.words : [];
        if (!validBox(line.bbox, width, height) || line.bbox.y1 - line.bbox.y0 > 80 ||
            words.length < 2 || words.length > 18 || literal.length > 240) continue;
        const contact = isContactLine(literal);
        const email = contact ? words.filter(word => typeof word?.text === 'string' &&
          /^[^\s@]+@[^\s@]+$/u.test(word.text) && validBox(word.bbox, width, height)) : [];
        let box, target, offset, margins;
        if (contact) {
          // Never join/split a malformed address or guess a telephone layout.
          // Exactly one email word can be re-segmented independently of its
          // neighbouring label. Other contact lines retain the page reading.
          if (email.length !== 1) continue;
          offset = literal.indexOf(email[0].text);
          if (offset < 0 || offset !== literal.lastIndexOf(email[0].text)) continue;
          box = email[0].bbox; target = email[0].text; margins = [8, 12];
          if (words.some(word => word !== email[0] && validBox(word?.bbox, width, height) &&
            word.bbox.x0 < box.x1 && box.x0 < word.bbox.x1 && word.bbox.y0 < box.y1 && box.y0 < word.bbox.y1)) continue;
        } else {
          const scores = words.map(word => word?.confidence);
          if (scores.some(score => !Number.isFinite(score) || score < 0 || score > 100) ||
              Math.min(...scores) >= MIN_WORD_CONFIDENCE) continue;
          box = line.bbox; target = literal; offset = 0; margins = [12];
        }
        const costs = margins.map(margin => (box.x1 - box.x0 + margin * 2) * (box.y1 - box.y0 + margin * 2));
        if (costs.some(cost => cost > MAX_CROP_PIXELS) || passes + margins.length > MAX_PASSES ||
            pixels + costs.reduce((sum, cost) => sum + cost, 0) > MAX_TOTAL_PIXELS) continue;
        passes += margins.length; pixels += costs.reduce((sum, cost) => sum + cost, 0);
        plan.push({ line, start, literal, box, target, offset, margins, contact });
      }
    }
  }
  return plan;
}

function refinedValue(entry, readings) {
  const values = readings.map(value => typeof value === 'string' ? value.trim() : '');
  if (entry.contact) {
    // Even two matching crops can BOTH be wrong. Retain the page surface;
    // expose conflicting readings as a warning, never select a new contact
    // based on repeatability, confidence or a reference expectation.
    return values.length === 2 && values.every(value => value === entry.target) ? entry.target : null;
  }
  if (values.length !== 1 || !values[0] || /[\r\n]/u.test(values[0]) || values[0].length > 240 ||
      normalize(values[0]).split(' ').length !== normalize(entry.target).split(' ').length) return null;
  return values[0];
}

async function refineOcr(data, canvas, ocr, createCanvas) {
  const plan = refinementPlan(data, canvas.width, canvas.height);
  if (!plan.length) return data;
  const patches = [], lineChanges = new Map();
  try {
    await ocr.setParameters({ tessedit_pageseg_mode: '7' }); // Tesseract SINGLE_LINE
    for (const entry of plan) {
      const readings = [];
      for (const margin of entry.margins) {
        const width = entry.box.x1 - entry.box.x0, height = entry.box.y1 - entry.box.y0;
        const crop = createCanvas(width + margin * 2, height + margin * 2);
        try {
          const context = crop.getContext('2d');
          context.fillStyle = 'white'; context.fillRect(0, 0, crop.width, crop.height);
          context.drawImage(canvas, entry.box.x0, entry.box.y0, width, height, margin, margin, width, height);
          const result = await ocr.recognize(crop.toBuffer('image/png'), {}, { text: true, blocks: false });
          if (typeof result?.data?.text !== 'string') throw Object.assign(new Error('CONVERSION_OCR_FAILED'), { code: 'CONVERSION_OCR_FAILED' });
          readings.push(result.data.text);
        } finally { crop.width = 1; crop.height = 1; }
      }
      const replacement = refinedValue(entry, readings);
      const conflict = entry.contact && replacement === null;
      const literal = entry.contact || replacement === null ? entry.literal : entry.literal.slice(0, entry.offset) + replacement +
        entry.literal.slice(entry.offset + entry.target.length);
      if (literal !== entry.literal) patches.push({ start: entry.start, end: entry.start + entry.literal.length, value: literal });
      // Re-segmented words have no comparable page confidences. Do not reuse
      // an old high score as if it measured a new spelling.
      if (literal !== entry.literal || conflict) lineChanges.set(entry.line,
        { ...entry.line, text: literal, words: literal === entry.literal ? entry.line.words : [], contact_disagreement: conflict });
    }
  } finally { await ocr.setParameters({ tessedit_pageseg_mode: '6' }); } // restore SINGLE_BLOCK for next page
  let text = data.text;
  for (const patch of patches.sort((a, b) => b.start - a.start)) text = text.slice(0, patch.start) + patch.value + text.slice(patch.end);
  return { ...data, text, blocks: data.blocks.map(block => ({ ...block, paragraphs: (block.paragraphs || []).map(paragraph =>
    ({ ...paragraph, lines: (paragraph.lines || []).map(line => lineChanges.get(line) || line) })) })) };
}

module.exports = Object.freeze({ validBox, refinementPlan, refinedValue, refineOcr });
