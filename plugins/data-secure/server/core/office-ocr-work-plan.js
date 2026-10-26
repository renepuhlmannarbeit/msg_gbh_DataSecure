'use strict';

// Pure, document-local quality-work planning. Geometry is only a candidate for
// more OCR work, never evidence of correct text, source ownership or approval.
const OFFICE_OCR_WORK_LIMITS = Object.freeze({
  MAX_WORK_PIXELS: 120_000_000, MAX_LIVE_PIXELS: 30_000_000, MAX_ASSETS: 150,
  MAX_LINES: 2000, MAX_WORD_BOXES: 5000, FINE_WORD_HEIGHT: 18,
  MIN_FINE_WORDS: 48, MIN_TEXT_BANDS: 8, MIN_FINE_WORDS_PER_LINE: 3,
  MAX_CROP_PASSES: 32, MAX_CROP_PIXELS: 200_000, MAX_CROP_WORK_PIXELS: 2_000_000
});
const L = OFFICE_OCR_WORK_LIMITS;
const assessed = new WeakMap();
const frozen = value => Object.freeze(value);
const declined = reason => frozen({ eligible: false, reason });
const denied = reason => frozen({ admitted: false, reason });

function record(value, keys) {
  if (!value || typeof value !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(descriptors);
  if (names.length !== keys.length || names.some(key => typeof key !== 'string' || !keys.includes(key) ||
      !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) return null;
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}

function array(value, maximum) {
  if (!Array.isArray(value)) return null;
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximum) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  if (keys.length !== length + 1) return null;
  const result = [];
  for (let index = 0; index < length; index++) {
    const item = descriptors[index];
    if (!item || !item.enumerable || !Object.hasOwn(item, 'value')) return null;
    result.push(item.value);
  }
  return result;
}

function area(width, height, maximum) {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0 &&
    height <= maximum && width <= Math.floor(maximum / height) ? width * height : null;
}

function box(value, width, height) {
  const data = record(value, ['x0', 'y0', 'x1', 'y1']);
  return data && Object.values(data).every(Number.isSafeInteger) &&
    data.x0 >= 0 && data.y0 >= 0 && data.x1 <= width && data.y1 <= height &&
    data.x1 > data.x0 && data.y1 > data.y0 ? data : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function assessExtraOfficeOcrRaster(facts, lines) {
  try {
    const input = record(facts, ['kind', 'width', 'height', 'primaryWidth', 'primaryHeight', 'initialScale', 'downsampled']);
    if (!input || !['png', 'jpeg', 'bmp'].includes(input.kind) ||
        ![1, 2].includes(input.initialScale) || typeof input.downsampled !== 'boolean') return declined('INPUT_INVALID');
    if (input.initialScale !== 1 || input.downsampled || input.width !== input.primaryWidth ||
        input.height !== input.primaryHeight) return declined('NOT_NATIVE_BITMAP_PRIMARY');
    const sourcePixels = area(input.width, input.height, L.MAX_LIVE_PIXELS);
    if (sourcePixels === null) return declined('INPUT_INVALID');
    // Hold the native contact/source canvas while the 2x canvas is in use.
    if (sourcePixels > Math.floor(L.MAX_LIVE_PIXELS / 5)) return declined('PEAK_LIMIT');
    const sourceLines = array(lines, L.MAX_LINES);
    if (!sourceLines) return declined('GEOMETRY_LIMIT');
    const heights = [], fineHeights = [], centers = [], seen = new Set();
    let suppliedWords = 0;
    for (const sourceLine of sourceLines) {
      const line = record(sourceLine, ['box', 'words']);
      if (!line) return declined('INPUT_INVALID');
      const words = array(line.words, L.MAX_WORD_BOXES);
      if (!words || words.length > L.MAX_WORD_BOXES - suppliedWords) return declined('GEOMETRY_LIMIT');
      suppliedWords += words.length;
      const lineBox = box(line.box, input.width, input.height);
      if (!lineBox) continue;
      const fineCenters = [];
      for (const sourceWord of words) {
        const word = box(sourceWord, input.width, input.height);
        // Invalid boxes are not geometric evidence. Their text is never read
        // or removed here; the caller retains the original primary result.
        if (!word || word.x0 < lineBox.x0 || word.x1 > lineBox.x1 ||
            word.y0 < lineBox.y0 || word.y1 > lineBox.y1) continue;
        const key = [word.x0, word.y0, word.x1, word.y1].join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        const height = word.y1 - word.y0;
        heights.push(height);
        if (height <= L.FINE_WORD_HEIGHT) {
          fineHeights.push(height); fineCenters.push((word.y0 + word.y1) / 2);
        }
      }
      if (fineCenters.length >= L.MIN_FINE_WORDS_PER_LINE) centers.push(median(fineCenters));
    }
    if (fineHeights.length < L.MIN_FINE_WORDS || fineHeights.length * 2 < heights.length ||
        median(heights) > L.FINE_WORD_HEIGHT) return declined('NOT_DENSE_FINE_TEXT');
    const spacing = Math.max(1, median(fineHeights) / 2);
    let last = -Infinity, bands = 0;
    for (const center of centers.sort((a, b) => a - b)) {
      if (center - last < spacing) continue;
      bands++; last = center;
    }
    if (bands < L.MIN_TEXT_BANDS) return declined('TOO_FEW_TEXT_BANDS');
    const result = frozen({ eligible: true, reason: 'DENSE_FINE_PRIMARY_GEOMETRY',
      targetWidth: input.width * 2, targetHeight: input.height * 2,
      workPixels: sourcePixels * 4, liveCanvasPixels: sourcePixels * 5,
      geometry: frozen({ validWords: heights.length, fineWords: fineHeights.length,
        textBands: bands, medianWordHeight: median(heights) }) });
    // The ledger accepts only this exact immutable assessment. This binds its
    // cost, not the caller's separate source/permission/reading selection.
    assessed.set(result, frozen({ sourcePixels, workPixels: result.workPixels }));
    return result;
  } catch { return declined('INPUT_INVALID'); }
}

function createOfficeOcrWorkLedger(assets) {
  const bases = new Map(), upscaled = new Set(), crops = new Set();
  let basePixels = 0, optionalPixels = 0, unavailable = null, closed = false;
  try {
    const entries = array(assets, L.MAX_ASSETS);
    if (!entries) unavailable = 'BASE_INVALID';
    else for (const value of entries) {
      const item = record(value, ['assetId', 'basePixels', 'bounded']);
      if (!item || !Number.isSafeInteger(item.assetId) || item.assetId < 0 || item.assetId >= L.MAX_ASSETS ||
          bases.has(item.assetId) || typeof item.bounded !== 'boolean' ||
          (item.bounded ? !Number.isSafeInteger(item.basePixels) || item.basePixels < 0 || item.basePixels > L.MAX_WORK_PIXELS
            : item.basePixels !== null)) { unavailable = 'BASE_INVALID'; break; }
      bases.set(item.assetId, item.basePixels);
      if (!item.bounded) unavailable ||= 'BASE_UNBOUNDED';
      else basePixels += item.basePixels;
    }
    if (basePixels > L.MAX_WORK_PIXELS && !unavailable) unavailable = 'BASE_LIMIT';
  } catch { unavailable = 'BASE_INVALID'; }

  function status(assetId) {
    if (closed) return 'CLOSED';
    if (unavailable) return unavailable;
    if (!Number.isSafeInteger(assetId) || !bases.has(assetId)) return 'ASSET_UNKNOWN';
    return null;
  }
  const enough = pixels => pixels <= L.MAX_WORK_PIXELS - basePixels - optionalPixels;
  function snapshot() {
    return frozen({ available: !closed && unavailable === null, closed,
      reason: closed ? 'CLOSED' : unavailable,
      baseReservedPixels: unavailable ? null : basePixels, optionalPixels,
      remainingPixels: unavailable ? 0 : L.MAX_WORK_PIXELS - basePixels - optionalPixels,
      upscaleAssets: upscaled.size, cropAssets: crops.size });
  }
  return frozen({
    reserveUpscale(assetId, assessment) {
      const reason = status(assetId);
      if (reason) return denied(reason);
      if (upscaled.has(assetId)) return denied('UPSCALE_ALREADY_RESERVED');
      const cost = assessment && typeof assessment === 'object' ? assessed.get(assessment) : null;
      if (!cost) return denied('ASSESSMENT_INVALID');
      if (bases.get(assetId) < cost.sourcePixels) return denied('BASE_ASSET_MISMATCH');
      if (!enough(cost.workPixels)) return denied('NO_EXTRA_BUDGET');
      optionalPixels += cost.workPixels; upscaled.add(assetId);
      return frozen({ admitted: true, chargedPixels: cost.workPixels });
    },
    reserveCrops(assetId, cropPixels) {
      const reason = status(assetId);
      if (reason) return denied(reason);
      if (crops.has(assetId)) return denied('CROPS_ALREADY_RESERVED');
      let costs;
      try { costs = array(cropPixels, L.MAX_CROP_PASSES); } catch { return denied('CROP_PLAN_INVALID'); }
      if (!costs || costs.some(value => !Number.isSafeInteger(value) || value < 1 || value > L.MAX_CROP_PIXELS)) return denied('CROP_PLAN_INVALID');
      const total = costs.reduce((sum, value) => sum + value, 0);
      if (total > L.MAX_CROP_WORK_PIXELS) return denied('CROP_PLAN_LIMIT');
      if (!enough(total)) return denied('NO_EXTRA_BUDGET');
      // Reserve the entire planned optional batch, or none. No refunds and
      // no second batch after a failed crop. Mandatory checks remain the
      // caller's existing responsibility, never permissions from this ledger.
      optionalPixels += total; crops.add(assetId);
      return frozen({ admitted: true, chargedPixels: total });
    },
    close() { closed = true; return snapshot(); },
    snapshot
  });
}

module.exports = frozen({ OFFICE_OCR_WORK_LIMITS, assessExtraOfficeOcrRaster, createOfficeOcrWorkLedger });
