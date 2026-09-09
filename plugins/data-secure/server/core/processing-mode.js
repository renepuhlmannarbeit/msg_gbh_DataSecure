'use strict';

// Processing purpose is distinct from MCP delivery mode (local_only/analysis).
// A converter is not a privacy-gate bypass: its durable v5 lifecycle belongs
// exclusively to Standalone and never publishes a Claude read capability.
const MODES = Object.freeze({
  ANONYMIZE: 'markdown-and-anonymize',
  MARKDOWN: 'markdown-only'
});

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

function validateProcessingMode(value, productChannel) {
  if (!['plugin', 'standalone'].includes(productChannel)) fail('PRODUCT_CHANNEL_INVALID');
  if (value !== MODES.ANONYMIZE && value !== MODES.MARKDOWN) fail('PROCESSING_MODE_INVALID');
  if (productChannel !== 'standalone' && value === MODES.MARKDOWN) fail('PROCESSING_MODE_FORBIDDEN');
  return value;
}

function assertRunnableProcessingMode(value, productChannel) {
  validateProcessingMode(value, productChannel);
  return value;
}

// A purpose-bearing journal must have a distinct schema: old readers of /4
// otherwise ignore new top-level fields and could resume it as anonymization.
function processingModeForBatch(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) fail('PROCESSING_MODE_INVALID');
  const channel = state.product_channel === undefined ? 'plugin' : state.product_channel;
  if (['datasecure-batch/1', 'datasecure-batch/2', 'datasecure-batch/3', 'datasecure-batch/4'].includes(state.schema)) {
    if (Object.hasOwn(state, 'processing_mode') && state.processing_mode !== MODES.ANONYMIZE) {
      fail('PROCESSING_MODE_INVALID');
    }
    return validateProcessingMode(MODES.ANONYMIZE, channel);
  }
  if (state.schema === 'datasecure-batch/6') {
    if (channel !== 'standalone' || state.product_channel !== 'standalone' ||
        (Object.hasOwn(state, 'processing_mode') && state.processing_mode !== MODES.ANONYMIZE)) {
      fail('PROCESSING_MODE_INVALID');
    }
    return validateProcessingMode(MODES.ANONYMIZE, channel);
  }
  if (state.schema !== 'datasecure-batch/5' || state.processing_mode !== MODES.MARKDOWN ||
      !Object.hasOwn(state, 'schema') || !Object.hasOwn(state, 'processing_mode') || !Object.hasOwn(state, 'product_channel') ||
      Object.keys(state).some((key) => key.startsWith('pseudonym_')) ||
      Object.hasOwn(state, 'core_policy_fingerprint') ||
      Object.hasOwn(state, 'read_capability') || Object.hasOwn(state, 'package_id') ||
      Object.hasOwn(state, 'package_identity') || state.remove_images === true) fail('PROCESSING_MODE_INVALID');
  return validateProcessingMode(state.processing_mode, channel);
}

module.exports = Object.freeze({ MODES, validateProcessingMode, assertRunnableProcessingMode, processingModeForBatch });
