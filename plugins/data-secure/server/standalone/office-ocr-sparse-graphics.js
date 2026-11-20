'use strict';

const { OFFICE_OCR_WORK_LIMITS } = require('../core/office-ocr-work-plan');
const { validBox } = require('./ocr-refinement');

function boundedLines(data, maxLines, maxWords) {
  if (!Array.isArray(data.blocks) || data.blocks.length > maxLines) return null;
  const lines = [];
  let words = 0, paragraphs = 0;
  for (const block of data.blocks) {
    if (!Array.isArray(block?.paragraphs) || (paragraphs += block.paragraphs.length) > maxLines) return null;
    for (const paragraph of block.paragraphs) {
      if (!Array.isArray(paragraph?.lines) || paragraph.lines.length > maxLines - lines.length) return null;
      for (const line of paragraph.lines) {
        if (!Array.isArray(line?.words) || (words += line.words.length) > maxWords) return null;
        lines.push(line);
      }
    }
  }
  return lines;
}

// A second reading is confined to small, wide, mostly white graphics where
// saturated strokes could obscure the segmentation of dark, scattered text.
// The original color raster always supplies the primary transcript and crops.
function diagramRaster(source, createCanvas, reserve) {
  const { width, height } = source;
  const area = width * height;
  if (width < 256 || height < 160 || width < height * 1.6 ||
      area > OFFICE_OCR_WORK_LIMITS.MAX_DIAGRAM_SOURCE_PIXELS) return null;
  const pixels = source.getContext('2d').getImageData(0, 0, width, height);
  let filtered, enlarged;
  try {
    let colored = 0, light = 0, dark = 0;
    const rgba = pixels.data;
    for (let index = 0; index < rgba.length; index += 4) {
      const low = Math.min(rgba[index], rgba[index + 1], rgba[index + 2]);
      const high = Math.max(rgba[index], rgba[index + 1], rgba[index + 2]);
      if (high - low > 40) {
        colored++;
        rgba[index] = rgba[index + 1] = rgba[index + 2] = 255;
      } else if (low >= 235) light++;
      else if (high <= 150) dark++;
    }
    if (colored < area * 0.02 || colored > area * 0.20 || light < area * 0.70 ||
        dark < area * 0.001 || dark > area * 0.08 || !reserve(width, height)) return null;
    filtered = createCanvas(width, height);
    filtered.getContext('2d').putImageData(pixels, 0, 0);
    enlarged = createCanvas(width * 2, height * 2);
    enlarged.getContext('2d').drawImage(filtered, 0, 0, enlarged.width, enlarged.height);
    return enlarged;
  } catch (cause) {
    if (enlarged) { enlarged.width = 1; enlarged.height = 1; }
    throw cause;
  } finally {
    if (filtered) { filtered.width = 1; filtered.height = 1; }
    pixels.data.fill(0);
  }
}

const textKey = value => value.normalize('NFC').trim().replace(/[ \t]+/gu, ' ');

function samePosition(a, b) {
  const width = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const height = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return width > 0 && height > 0 && width * height >=
    Math.max((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0)) * 0.6;
}

function mergeReading(primary, primaryLines, supplement, raster, target) {
  if (supplement.text.length > 4000) return primary;
  const sourceLines = boundedLines(supplement, 160, 400);
  if (!sourceLines) return primary;
  const exactLines = new Set(supplement.text.split(/\r\n|\r|\n/u).map(line => line.trim()));
  const scale = target.width / raster.width;
  const project = bbox => ({ x0: Math.floor(bbox.x0 * scale), y0: Math.floor(bbox.y0 * scale),
    x1: Math.ceil(bbox.x1 * scale), y1: Math.ceil(bbox.y1 * scale) });
  const primaryKeys = new Set(primary.text.split(/\r\n|\r|\n/u).map(textKey));
  const known = primaryLines.filter(line => typeof line.text === 'string' &&
    validBox(line.bbox, target.width, target.height) && primaryKeys.has(textKey(line.text)))
    .map(line => ({ key: textKey(line.text), bbox: line.bbox }));
  const lines = [];
  for (const line of sourceLines) {
    if (typeof line.text !== 'string' || !line.words.length || !validBox(line.bbox, raster.width, raster.height) ||
        !line.words.every(word => typeof word?.text === 'string' && validBox(word.bbox, raster.width, raster.height))) continue;
    const text = line.text.trim();
    if (!exactLines.has(text) || !/[\p{L}\p{N}].*[\p{L}\p{N}]/u.test(text)) continue;
    const key = textKey(text), bbox = project(line.bbox);
    if (known.some(previous => previous.key === key && samePosition(previous.bbox, bbox))) continue;
    lines.push({ text, bbox, words: line.words.map(word => ({
      text: word.text, confidence: word.confidence, bbox: project(word.bbox)
    })) });
    known.push({ key, bbox });
  }
  if (!lines.length) return primary;
  const text = lines.map(line => line.text).join('\n') + '\n';
  const separator = !primary.text || /[\r\n]$/u.test(primary.text) ? '' : '\n';
  return { ...primary, text: primary.text + separator + text, blocks: [
    ...primary.blocks, { text, paragraphs: [{ text, lines }] }
  ] };
}

async function readSparseOfficeGraphic(primary, target, officeWork, ocr, read, createCanvas) {
  const { sourceCanvas, facts, ledger, assetId } = officeWork;
  if (!sourceCanvas || !['png', 'jpeg', 'bmp'].includes(facts.kind) || facts.downsampled || ![1, 2].includes(facts.initialScale) ||
      sourceCanvas.width !== facts.width || sourceCanvas.height !== facts.height ||
      target.width !== sourceCanvas.width * facts.initialScale || target.height !== sourceCanvas.height * facts.initialScale ||
      primary.text.length > 260) return primary;
  const primaryLines = boundedLines(primary, 32, 45);
  if (!primaryLines) return primary;
  const raster = diagramRaster(sourceCanvas, createCanvas,
    (width, height) => ledger.reserveDiagram(assetId, width, height).admitted === true);
  if (!raster) return primary;
  try {
    let reading, hardFailure = false;
    try {
      await ocr.setParameters({ tessedit_pageseg_mode: '11' }); // Sparse text.
      reading = await read(raster);
    } catch (cause) {
      if (!['CONVERSION_OCR_FAILED', 'TEXT_TOO_LARGE'].includes(cause?.code)) {
        hardFailure = true;
        throw cause;
      }
    } finally {
      try { await ocr.setParameters({ tessedit_pageseg_mode: '6' }); }
      catch (cause) {
        if (!hardFailure) throw Object.assign(new Error('CONVERSION_POLICY_FAILED', { cause }), { code: 'CONVERSION_POLICY_FAILED' });
      }
    }
    return reading ? mergeReading(primary, primaryLines, reading.data, raster, target) : primary;
  } finally {
    raster.width = 1; raster.height = 1;
  }
}

module.exports = Object.freeze({ readSparseOfficeGraphic });
