'use strict';

const path = require('node:path');
const { coordinateBatchReview } = require('../core/local-review-model');

function coworkReview() {
  if (process.env.DATASECURE_PRODUCT_CHANNEL === 'standalone')
    throw new Error('COWORK_REVIEW_UNAVAILABLE_IN_STANDALONE');
  return require(path.join(__dirname, '../companion/text-review.js'));
}

function reviewTextLocally(...args) { return coworkReview().reviewTextLocally(...args); }
function reviewBatchTextLocally(documents, options = {}) {
  return coordinateBatchReview(documents, options, options.reviewTextLocally || reviewTextLocally);
}

module.exports = Object.freeze({ reviewTextLocally, reviewBatchTextLocally });
