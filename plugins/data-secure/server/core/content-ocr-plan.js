'use strict';

const { validateContentOptions } = require('./content-options');

// Geometry, native text and raster size cannot establish whether a PDF region
// is a document scan or an additional graphic. With selective consent, request
// an explicit local role/mask decision; never OCR first and filter afterwards.
function pdfOcrAction(contentOptions, facts) {
  const options = validateContentOptions(contentOptions);
  const fields = ['hasNativeText', 'hasPaintedImage', 'hasNonTextGraphicPaint', 'omittedSymbols'];
  if (!facts || typeof facts !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(facts))) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(facts), keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key) || !descriptors[key].enumerable ||
      !Object.hasOwn(descriptors[key], 'value') || typeof descriptors[key].value !== 'boolean')) invalid();
  const needsRaster = !descriptors.hasNativeText.value || descriptors.hasPaintedImage.value ||
    descriptors.hasNonTextGraphicPaint.value || descriptors.omittedSymbols.value;
  if (!needsRaster) return Object.freeze({ action: 'none', reason_codes: Object.freeze([]) });
  if (!options.scanOcr && !options.imageOcr) return Object.freeze({ action: 'none',
    reason_codes: Object.freeze(['IMAGE_OCR_DISABLED_BY_POLICY', 'SCAN_OCR_DISABLED_BY_POLICY']) });
  // The explicit union covers all visible scan/image/graphic text; no guessed
  // scan identity is needed. Rendering remains bounded and passive in the worker.
  if (options.scanOcr && options.imageOcr) return Object.freeze({ action: 'page', reason_codes: Object.freeze([]) });
  return Object.freeze({ action: 'scope-required', reason_codes: Object.freeze(['PDF_OCR_SCOPE_UNVERIFIED']) });
}
function invalid() { throw Object.assign(new Error('CONVERSION_INPUT_INVALID'), { code: 'CONVERSION_INPUT_INVALID' }); }
module.exports = Object.freeze({ pdfOcrAction });
