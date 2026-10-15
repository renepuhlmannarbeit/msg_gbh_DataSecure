'use strict';

// Display-only data from an independently bound journal reader. Never change
// item statuses, completion evidence, approval or export authority here.
const { contentOptionsForBatch } = require('../core/content-options');
const PROBLEMS = new Set(['stopped', 'retryable', 'mapping_pending', 'preflight_mapping_pending']);
function rawOptions(state) {
  if (state?.product_channel !== 'standalone' || state.processing_mode !== 'markdown-only') return null;
  try {
    const options = contentOptionsForBatch(state);
    return options?.markdownOutput === 'content-v1' && options.scanOcr === options.imageOcr ? options : null;
  } catch { return null; }
}
function isOcrOmission(state, item) {
  const options = rawOptions(state);
  return Boolean(options && !options.scanOcr && item?.status === 'stopped' &&
    item.local_mapping_exported !== false &&
    ['IMAGE_OCR_REQUIRED', 'PDF_TEXT_UNAVAILABLE_BY_POLICY'].includes(item.error_code));
}
function isAnonymizationOcrOmission(state, item) {
  if (state?.product_channel !== 'standalone' || state.processing_mode !== 'markdown-and-anonymize' ||
      item?.status !== 'stopped' || item.local_mapping_exported === false ||
      !['IMAGE_OCR_REQUIRED', 'PDF_TEXT_UNAVAILABLE_BY_POLICY'].includes(item.error_code)) return false;
  try {
    const options = contentOptionsForBatch(state);
    return options?.markdownOutput === 'content-v1' && options.scanOcr === false && options.imageOcr === false;
  } catch { return false; }
}
function isAnonymizationPrivacyStop(state, item) {
  return state?.product_channel === 'standalone' && state.processing_mode === 'markdown-and-anonymize' &&
    item?.status === 'stopped' && item.local_mapping_exported !== false &&
    ['AMBIGUITY_REVIEW_REQUIRED', 'RESIDUAL_PII'].includes(item.error_code);
}
function hasContentNotice(item) {
  return item.status === 'released' && (item.extraction_grade === 'incomplete' ||
    Array.isArray(item.reason_codes) && item.reason_codes.length > 0);
}
function conversionFeedback(state) {
  const options = rawOptions(state);
  if (!options || !Array.isArray(state.items) || state.items.length < 1 || state.items.length > 200) return null;
  const results = state.items.filter(item => item.status === 'released').length;
  const problems = state.items.filter(item => PROBLEMS.has(item.status));
  const omitted = problems.filter(item => isOcrOmission(state, item)).length;
  const pending = state.items.length - results - problems.length;
  return { schema: 'datasecure-conversion-feedback/1', ocr_enabled: options.scanOcr,
    selected_count: state.items.length, result_count: results, not_converted_count: problems.length,
    ocr_omitted_count: omitted, error_count: problems.length - omitted,
    content_notice_count: state.items.filter(hasContentNotice).length, pending_count: pending,
    complete: pending === 0 && problems.every(item => item.status === 'stopped' && item.local_mapping_exported !== false) };
}
module.exports = { conversionFeedback, isOcrOmission, isAnonymizationOcrOmission,
  isAnonymizationPrivacyStop, hasContentNotice };
