'use strict';

const { batchReviewReady } = require('./batch-next-action');

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
    if (items.length > 0 && batchReviewReady(progress)) {
      return { ready: true, items };
    }

    let message = 'Für diesen Stapel gibt es keine vertagten lokalen Entscheidungen.';
    if (progress.batch_phase === 'invalid_local_state') {
      message = 'Der lokale Stapelstatus ist unvollständig oder ungültig. Die lokale Prüfung bleibt gesperrt; bitte den Status prüfen.';
    } else if (progress.remaining !== 0 || progress.processing !== 0) {
      message = 'Der Stapel analysiert noch weitere Dateien. Die gemeinsame lokale Prüfung startet erst danach.';
    } else if (progress.delivery_pending !== 0) {
      message = 'Ein bereits geprüftes Ergebnis muss zuerst sicher bereitgestellt werden. Die lokale Fortsetzung übernimmt diesen Schritt; eine KI-Auswertung ist dafür nicht erforderlich.';
    } else if (progress.retryable !== 0) {
      message = 'Eine technische Unterbrechung muss zuerst ausdrücklich fortgesetzt werden.';
    } else if (progress.mapping_pending !== 0) {
      message = 'Die lokale Zuordnungsübersicht muss zuerst vollständig nachgetragen werden.';
    }
    return { ready: false, items, message };
  }

  return { markDeferredReview, deferredReviewPlan };
}

module.exports = { createBatchReviewState };
