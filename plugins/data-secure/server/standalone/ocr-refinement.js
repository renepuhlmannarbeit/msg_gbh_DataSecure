'use strict';

// Geometric re-segmentation, not lexical repair. No names, contact values,
// reference expectations, dictionaries or customer paths are retained here.
// The supervisor's existing deadline/owned process covers every extra pass.
const { isContactLine } = require('./ocr-quality');
const { diaeresisCandidate } = require('./ocr-diaeresis-evidence');
const MAX_PASSES = 32;
const MAX_TOTAL_PIXELS = 2_000_000;
const MAX_CROP_PIXELS = 200_000;
const MIN_WORD_CONFIDENCE = 95;
const spacingKey = text => text.replace(/[ \t]+/gu, ' ').trim();

function validBox(box, width, height) {
  return box && ['x0', 'y0', 'x1', 'y1'].every(key => Number.isSafeInteger(box[key])) &&
    box.x0 >= 0 && box.y0 >= 0 && box.x1 <= width && box.y1 <= height &&
    box.x1 > box.x0 && box.y1 > box.y0;
}

function refinementPlan(data, width, height, options) {
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
        // Office can retain the primary ordinary text without spending crop
        // work on consistency-only reads. Filter before charging the shared
        // pass/pixel cap so skipped ordinary lines cannot consume contact work.
        if (options?.contactOnly === true && !contact) continue;
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
  if (values.length !== 1 || !values[0] || /[\r\n]/u.test(values[0]) || values[0].length > 240) return null;
  // A crop is a second reading, not evidence that a different spelling or
  // value is correct. Even an agreement on word count can change a date or
  // replace a correctly read low-confidence word. Keep the primary bytes,
  // including their spacing; only classify equivalent display spacing here.
  return spacingKey(values[0]) === spacingKey(entry.target) ? entry.target : null;
}

// A same-length glyph correction must also bind the redundant Tesseract text
// surfaces. Missing/inconsistent optional metadata simply keeps the primary
// reading. No global string replacement or ambiguous occurrence is adopted.
function literalOffset(text, lines, wanted) {
  if (typeof text !== 'string' || !Array.isArray(lines) || lines.length > 20000) return null;
  let cursor = 0, selected = null;
  for (const line of lines) {
    if (typeof line?.text !== 'string') return null;
    const literal = line.text.trim();
    if (!literal || /[\r\n]/u.test(literal)) return null;
    const offset = text.indexOf(literal, cursor);
    const end = offset + literal.length;
    if (offset < 0 || !/^[ \t\r\n]*$/u.test(text.slice(cursor, offset)) ||
        (offset !== 0 && !/[\r\n]/u.test(text[offset - 1])) ||
        (end !== text.length && !/[\r\n]/u.test(text[end]))) return null;
    if (line === wanted) {
      if (selected !== null) return null;
      selected = offset;
    }
    cursor = offset + literal.length;
  }
  return /^[ \t\r\n]*$/u.test(text.slice(cursor)) ? selected : null;
}

function glyphBinding(data, entry, width, height) {
  if (data.text.slice(entry.start, entry.start + entry.literal.length) !== entry.literal) return null;
  if (!Array.isArray(data.blocks) || data.blocks.length > 20000) return null;
  const allLines = [], neighbours = [];
  let owner = null, paragraphsSeen = 0, symbolsSeen = 0;
  for (const block of data.blocks) {
    if (!Array.isArray(block?.paragraphs) || paragraphsSeen + block.paragraphs.length > 20000) return null;
    paragraphsSeen += block.paragraphs.length;
    for (const paragraph of block.paragraphs) {
      if (!Array.isArray(paragraph?.lines) || allLines.length + paragraph.lines.length > 20000) return null;
      for (const line of paragraph.lines) {
        allLines.push(line);
        if (!Array.isArray(line?.words)) return null;
        for (const word of line.words) {
          if (!Array.isArray(word?.symbols) || symbolsSeen + word.symbols.length > 20000) return null;
          symbolsSeen += word.symbols.length;
          for (const symbol of word.symbols) {
            if (!validBox(symbol?.bbox, width, height)) return null;
            if (line !== entry.line) neighbours.push(symbol.bbox);
          }
        }
        if (line !== entry.line) continue;
        if (owner) return null; // one metadata object cannot own two occurrences
        owner = { block, paragraph };
      }
    }
  }
  if (!owner || literalOffset(data.text, allLines, entry.line) !== entry.start) return null;
  const paragraphOffset = literalOffset(owner.paragraph.text, owner.paragraph.lines, entry.line);
  const blockOffset = literalOffset(owner.block.text, owner.block.paragraphs.flatMap(paragraph => paragraph.lines), entry.line);
  return paragraphOffset === null || blockOffset === null ? null : { ...owner, paragraphOffset, blockOffset, neighbours };
}

function glyphLine(line, value) {
  const literal = line.text.trim(), offset = line.text.indexOf(literal);
  let wordOffset = 0;
  const words = line.words.map(word => {
    const text = value.slice(wordOffset, wordOffset + word.text.length);
    wordOffset += word.text.length + 1;
    if (text === word.text) return word;
    let symbolOffset = 0;
    const symbols = word.symbols.map(symbol => {
      const part = text.slice(symbolOffset, symbolOffset + symbol.text.length);
      symbolOffset += symbol.text.length;
      return part === symbol.text ? symbol : { ...symbol, text: part };
    });
    return { ...word, text, symbols };
  });
  return { ...line, text: line.text.slice(0, offset) + value + line.text.slice(offset + literal.length),
    words, reading_disagreement: true };
}

function spliceText(text, edits) {
  if (!edits?.length) return text;
  let result = text;
  for (const { offset, value } of [...edits].sort((a, b) => b.offset - a.offset)) {
    result = result.slice(0, offset) + value + result.slice(offset + value.length);
  }
  return result;
}

async function refineOcr(data, canvas, ocr, createCanvas, options) {
  const plan = refinementPlan(data, canvas.width, canvas.height, options);
  if (!plan.length) return data;
  const lineChanges = new Map(), textEdits = new Map();
  const edit = (object, offset, value) => {
    if (!textEdits.has(object)) textEdits.set(object, []);
    textEdits.get(object).push({ offset, value });
  };
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
      if (refinedValue(entry, readings) === null) {
        // A second spelling alone never changes the primary reading. Only a
        // bounded diaeresis candidate with independent original glyph pixels
        // can change these six letters; uncertainty and scores remain intact.
        const binding = !entry.contact && readings.length === 1 ? glyphBinding(data, entry, canvas.width, canvas.height) : null;
        const pixels = [];
        let value = null;
        try {
          if (binding) value = diaeresisCandidate({ line: entry.line,
            reading: readings[0].replace(/(?:\r?\n){1,2}$/u, ''),
            width: canvas.width, height: canvas.height, contact: entry.contact, readPixels: box => {
              // Other lines may contain another known owner of these pixels.
              // Edge-touching boxes are disjoint; an actual overlap refuses
              // this optional correction before reading or borrowing pixels.
              if (binding.neighbours.some(other => other.x0 < box.x1 && box.x0 < other.x1 &&
                  other.y0 < box.y1 && box.y0 < other.y1)) throw new Error('OCR_GLYPH_AMBIGUOUS');
              const image = canvas.getContext('2d').getImageData(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
              pixels.push(image); return image;
            } });
        } finally { for (const image of pixels) image?.data?.fill(0); }
        if (typeof value === 'string' && value.length === entry.literal.length) {
          lineChanges.set(entry.line, glyphLine(entry.line, value));
          edit(data, entry.start, value); edit(binding.block, binding.blockOffset, value);
          edit(binding.paragraph, binding.paragraphOffset, value);
          continue;
        }
        lineChanges.set(entry.line, { ...entry.line, reading_disagreement: true,
          ...(entry.contact ? { contact_disagreement: true } : {}) });
      }
    }
  } finally { await ocr.setParameters({ tessedit_pageseg_mode: '6' }); } // restore SINGLE_BLOCK for next page
  if (!lineChanges.size) return data;
  return { ...data, text: spliceText(data.text, textEdits.get(data)),
    blocks: data.blocks.map(block => !Array.isArray(block?.paragraphs) ? block : ({ ...block,
      text: spliceText(block.text, textEdits.get(block)),
      paragraphs: block.paragraphs.map(paragraph => !Array.isArray(paragraph?.lines) ? paragraph : ({ ...paragraph,
        text: spliceText(paragraph.text, textEdits.get(paragraph)),
        lines: paragraph.lines.map(line => lineChanges.get(line) || line) })) })) };
}

module.exports = Object.freeze({ validBox, refinementPlan, refinedValue, refineOcr });
