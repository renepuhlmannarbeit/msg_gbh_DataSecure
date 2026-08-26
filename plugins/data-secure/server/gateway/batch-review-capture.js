'use strict';

function createBatchReviewCapture(options = {}) {
  const anonymizeNext = options.anonymizeNext;
  const exactPendingEntry = options.exactPendingEntry;
  const packageIdForItem = options.packageIdForItem;
  const localReviewError = options.localReviewError;

  async function captureDeferredReviewInput(state, item, deps = {}) {
    const entry = exactPendingEntry(state, item);
    let captured;
    try {
      await anonymizeNext(state.profile, {
        ...deps,
        inputQueue: [entry],
        copyClaim: true,
        removeImages: state.remove_images,
        packageId: packageIdForItem(item),
        suppressDiagnostic: true,
        reviewText: (input) => {
          captured = input;
          throw localReviewError('BATCH_REVIEW_CAPTURED', 'Lokaler Stapelreview-Entwurf erfasst.');
        }
      });
    } catch (error) {
      if (error?.code !== 'BATCH_REVIEW_CAPTURED') throw error;
    }
    if (!captured || !Array.isArray(captured.ambiguities) || captured.ambiguities.length === 0) {
      throw localReviewError(
        'BATCH_REVIEW_RECONSTRUCTION_FAILED',
        'Die lokale Stapelprüfung konnte die offene Fundstelle nicht unverändert rekonstruieren. Es wurde nichts freigegeben.'
      );
    }
    return captured;
  }

  return { captureDeferredReviewInput };
}

module.exports = { createBatchReviewCapture };
