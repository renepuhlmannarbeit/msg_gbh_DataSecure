'use strict';

const MODES = Object.freeze({
  NEUTRAL: 'neutral',
  SOURCE: 'source-with-suffix'
});

function fail() {
  throw Object.assign(new Error('RESULT_NAMING_MODE_INVALID'), { code: 'RESULT_NAMING_MODE_INVALID' });
}

function validateResultNamingMode(value, productChannel) {
  if (!['plugin', 'standalone'].includes(productChannel)) fail();
  if (value !== MODES.NEUTRAL && value !== MODES.SOURCE) fail();
  if (productChannel !== 'standalone' && value !== MODES.NEUTRAL) fail();
  return value;
}

function resultNamingModeForBatch(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) fail();
  const channel = state.product_channel || 'plugin';
  if (state.schema === 'datasecure-batch/5' || state.processing_mode === 'markdown-only') {
    if (Object.hasOwn(state, 'output_naming_mode')) fail();
    return MODES.SOURCE;
  }
  if (state.schema === 'datasecure-batch/6') {
    if (channel !== 'standalone' || state.product_channel !== 'standalone' ||
        !Object.hasOwn(state, 'output_naming_mode')) fail();
    return validateResultNamingMode(state.output_naming_mode, channel);
  }
  if (!['datasecure-batch/1', 'datasecure-batch/2', 'datasecure-batch/3', 'datasecure-batch/4'].includes(state.schema) ||
      Object.hasOwn(state, 'output_naming_mode')) fail();
  if (channel === 'plugin') {
    return MODES.NEUTRAL;
  }
  // Standalone journals created before the explicit user choice used source
  // names. Keeping that interpretation makes historical recovery immutable.
  return validateResultNamingMode(MODES.SOURCE, channel);
}

module.exports = Object.freeze({ MODES, validateResultNamingMode, resultNamingModeForBatch });
