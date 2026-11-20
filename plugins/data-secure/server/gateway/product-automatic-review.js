'use strict';

const { MODES } = require('../core/processing-mode');
const { continueIntoLocalReview } = require('./automatic-local-review');

function continueBatchReviewForProduct(token, progress, processingMode, options = {}) {
  if (processingMode === MODES.MARKDOWN) return { progress, attempted: false };
  return continueIntoLocalReview(token, progress, options);
}

module.exports = Object.freeze({ continueBatchReviewForProduct });
