'use strict';

const { coordinateBatchReview } = require('../core/local-review-model');

function reviewTextLocally() {
  throw new Error('STANDALONE_REVIEWER_REQUIRED');
}

function reviewBatchTextLocally(documents, options = {}) {
  return coordinateBatchReview(documents, options, options.reviewTextLocally || reviewTextLocally);
}

module.exports = Object.freeze({ reviewTextLocally, reviewBatchTextLocally });
