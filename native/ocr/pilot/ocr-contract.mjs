const LIMITS = Object.freeze({
  maxInputBytes: 25 * 1024 * 1024,
  maxPixels: 30_000_000,
  maxTextChars: 5_000_000,
  maxWords: 100_000,
  maxWordChars: 1_000,
  lowConfidenceBelow: 70
});

const ERROR_CODES = Object.freeze([
  'OCR_INPUT_INVALID',
  'OCR_INPUT_LIMIT',
  'OCR_MODEL_UNAVAILABLE',
  'OCR_MODEL_INTEGRITY_FAILED',
  'OCR_BACKEND_UNAVAILABLE',
  'OCR_TIMEOUT',
  'OCR_RESOURCE_LIMIT',
  'OCR_OUTPUT_LIMIT',
  'OCR_RESULT_INVALID',
  'OCR_NETWORK_POLICY_FAILED',
  'OCR_CANCELLED'
]);

class OcrContractError extends Error {
  constructor(code) {
    if (!ERROR_CODES.includes(code)) throw new TypeError('UNKNOWN_OCR_ERROR_CODE');
    super(code);
    this.name = 'OcrContractError';
    this.code = code;
  }
}

function fail(code = 'OCR_RESULT_INVALID') {
  throw new OcrContractError(code);
}

function normalizedText(value, maxChars) {
  if (typeof value !== 'string' || value.length > maxChars || value.includes('\0')) fail();
  const text = value.replace(/\r\n?/gu, '\n').normalize('NFKC');
  if (text.length > maxChars) fail();
  return text;
}

function confidence(value) {
  if (!Number.isFinite(value) || value < 0 || value > 100) fail();
  return Math.round(value);
}

function bbox(value, width, height) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const raw = [value.x0, value.y0, value.x1, value.y1];
  if (!raw.every(Number.isFinite)) fail();
  const result = {
    x0: Math.floor(value.x0),
    y0: Math.floor(value.y0),
    x1: Math.ceil(value.x1),
    y1: Math.ceil(value.y1)
  };
  if (result.x0 < 0 || result.y0 < 0 || result.x1 <= result.x0 || result.y1 <= result.y0 ||
      result.x1 > width || result.y1 > height) fail();
  return result;
}

function normalizeOcrResult(page, options) {
  if (!page || typeof page !== 'object' || Array.isArray(page) ||
      !options || typeof options !== 'object') fail();
  const width = options.width;
  const height = options.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width * height > LIMITS.maxPixels) fail('OCR_INPUT_LIMIT');
  if (!Array.isArray(options.languages) || options.languages.length < 1) fail();
  const languages = [...new Set(options.languages)].sort();
  if (languages.some((item) => item !== 'deu' && item !== 'eng')) fail();
  if (!Array.isArray(page.blocks)) fail();

  const words = [];
  let lineIndex = 0;
  for (const block of page.blocks) {
    if (!Array.isArray(block?.paragraphs)) fail();
    for (const paragraph of block.paragraphs) {
      if (!Array.isArray(paragraph?.lines)) fail();
      for (const line of paragraph.lines) {
        if (!Array.isArray(line?.words)) fail();
        for (const source of line.words) {
          const text = normalizedText(source?.text, LIMITS.maxWordChars).trim();
          if (!text) continue;
          if (words.length >= LIMITS.maxWords) fail('OCR_OUTPUT_LIMIT');
          words.push({
            index: words.length,
            line_index: lineIndex,
            text,
            confidence: confidence(source.confidence),
            bbox: bbox(source.bbox, width, height)
          });
        }
        lineIndex += 1;
      }
    }
  }

  const text = normalizedText(page.text, LIMITS.maxTextChars);
  if (text.trim() && words.length === 0) fail();
  const reasons = ['NON_TEXTUAL_MEANING_UNVERIFIED'];
  if (words.length === 0) reasons.push('OCR_EMPTY');
  if (words.some((word) => word.confidence < LIMITS.lowConfidenceBelow)) {
    reasons.push('OCR_LOW_CONFIDENCE_PRESENT');
  }
  return {
    schema: 'data-secure-ocr-result/v1',
    status: words.length ? 'recognized' : 'empty',
    languages,
    image: { width, height },
    text,
    confidence: confidence(page.confidence),
    words,
    quality: {
      requires_visual_review: true,
      reasons
    }
  };
}

export { ERROR_CODES, LIMITS, OcrContractError, normalizeOcrResult };
