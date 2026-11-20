'use strict';

// Deferred review belongs to the explicit application interface.
function continueBatchReviewForProduct(_token, progress) {
  return { progress, attempted: false };
}

module.exports = Object.freeze({ continueBatchReviewForProduct });
