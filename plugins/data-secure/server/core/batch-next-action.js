'use strict';

// Both product adapters and the local review planner consume the same complete
// progress projection. Missing counters cannot prove that automatic work ended.
function batchReviewReady(progress) {
  return Number.isSafeInteger(progress?.deferred_review) && progress.deferred_review > 0 &&
    Number.isSafeInteger(progress.batch_total) && progress.batch_total > 0 &&
    Number.isSafeInteger(progress.completed) && progress.completed >= 0 &&
    progress.completed + progress.deferred_review === progress.batch_total &&
    ['remaining', 'retryable', 'delivery_pending', 'mapping_pending', 'processing']
      .every((field) => progress[field] === 0);
}

function batchNextAction(progress) {
  if (progress?.complete === true) return 'none';
  return batchReviewReady(progress) ? 'review' : 'batch';
}

// The explicit support route may also delegate metadata reconciliation to the
// guarded worker. This is NOT proof that a review window can already be shown:
// the worker repairs published/mapping states under the batch lock and then
// applies batchReviewReady again before reconstructing any raw content.
function batchReviewCanPrepare(progress) {
  const counters = ['completed', 'deferred_review', 'delivery_pending', 'mapping_pending', 'processing'];
  return Number.isSafeInteger(progress?.batch_total) && progress.batch_total > 0 &&
    progress.deferred_review > 0 && progress.remaining === 0 && progress.retryable === 0 &&
    progress.local_processing_active !== true && progress.batch_phase !== 'invalid_local_state' &&
    counters.every(field => Number.isSafeInteger(progress[field]) && progress[field] >= 0) &&
    counters.reduce((total, field) => total + progress[field], 0) === progress.batch_total;
}

module.exports = { batchReviewReady, batchReviewCanPrepare, batchNextAction };
