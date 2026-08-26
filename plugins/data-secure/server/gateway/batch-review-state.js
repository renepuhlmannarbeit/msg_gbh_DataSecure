'use strict';

function createBatchReviewState(options = {}) {
  const deferredReviewStatus = options.deferredReviewStatus || 'deferred_review';

  function markDeferredReview(_state, items, code) {
    for (const item of items) {
      item.status = deferredReviewStatus;
      item.checkpoint = 'awaiting_local_review';
      item.error_code = code;
    }
  }

  function deferredReviewPlan(state, progress) {
    const items = state.items.filter((item) => item.status === deferredReviewStatus);
    if (items.length > 0 && progress.remaining === 0 &&
        progress.retryable === 0 && progress.delivery_pending === 0) {
      return { ready: true, items };
    }

    let message = 'Für diesen Stapel gibt es keine vertagten lokalen Entscheidungen.';
    if (progress.remaining !== 0) {
      message = 'Der Stapel analysiert noch weitere Dateien. Die gemeinsame lokale Prüfung startet erst danach.';
    } else if (progress.delivery_pending !== 0) {
      message = 'Ein bereits freigegebenes Paket muss zuerst gelesen und bestätigt werden.';
    } else if (progress.retryable !== 0) {
      message = 'Eine technische Unterbrechung muss zuerst ausdrücklich fortgesetzt werden.';
    }
    return { ready: false, items, message };
  }

  return { markDeferredReview, deferredReviewPlan };
}

module.exports = { createBatchReviewState };
