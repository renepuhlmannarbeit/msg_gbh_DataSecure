'use strict';

const { types } = require('node:util');
const { CONTENT_BATCH_SCHEMA, validateContentOptions, contentOptionsForBatch } = require('./content-options');
const invalid = () => { throw Object.assign(Error('STANDALONE_REVIEW_POLICY_INVALID'), { code: 'STANDALONE_REVIEW_POLICY_INVALID' }); };

// Absence belongs to the guided workflow. There is deliberately no coercion,
// plugin equivalent or caller-selected way to waive the publication checks.
function validateReviewPolicy(value, options = {}) {
  try {
    const { productChannel, processingMode, documentReview, contentOptions } = options;
    if (value !== 'automatic-conservative' || productChannel !== 'standalone' ||
        processingMode !== 'markdown-and-anonymize' || documentReview !== true || types.isProxy(contentOptions)) invalid();
    validateContentOptions(contentOptions);
    return value;
  } catch { invalid(); }
}

function reviewPolicyForBatch(state) {
  try {
    if (!state || typeof state !== 'object' || Array.isArray(state) || types.isProxy(state)) invalid();
    if ('reviewPolicy' in state || 'review_policy' in state ||
        'standalone_review_policy' in state && !Object.hasOwn(state, 'standalone_review_policy')) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(state, 'standalone_review_policy');
    if (!descriptor) return undefined;
    if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable || state.schema !== CONTENT_BATCH_SCHEMA) invalid();
    return validateReviewPolicy(descriptor.value, { productChannel: state.product_channel,
      processingMode: state.processing_mode, documentReview: state.standalone_document_review,
      contentOptions: contentOptionsForBatch(state) });
  } catch { invalid(); }
}

module.exports = Object.freeze({ validateReviewPolicy, reviewPolicyForBatch });
