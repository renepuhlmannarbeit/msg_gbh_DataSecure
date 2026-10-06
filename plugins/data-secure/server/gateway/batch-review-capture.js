'use strict';

function createBatchReviewCapture(options = {}) {
  const anonymizeNext = options.anonymizeNext;
  const exactPendingEntry = options.exactPendingEntry;
  const packageIdForItem = options.packageIdForItem;
  const localReviewError = options.localReviewError;
  const withBatchPseudonymRegistry = options.withBatchPseudonymRegistry ||
    (async (_state, action) => action(undefined));
  const contactStore = options.contactStore;

  async function captureDeferredReviewInput(state, item, deps = {}) {
    const entry = exactPendingEntry(state, item);
    let captured;
    let captureStoppedPipeline = false;
    try {
      await withBatchPseudonymRegistry(state, (pseudonymRegistry) => anonymizeNext(state.profile, {
        ...deps,
        productChannel: state.product_channel,
        pseudonymRegistry,
        inputQueue: [entry],
        copyClaim: true,
        removeImages: state.remove_images,
        packageId: packageIdForItem(item),
          suppressDiagnostic: true,
          ...(state.product_channel === 'standalone' && contactStore ? {
            prepareOcrContacts: async (input) => {
              if (typeof deps.onOcrSourceCaptured === 'function') await deps.onOcrSourceCaptured(Object.freeze({
                sourceLabel: item.source_label, originalText: input.original_text }));
              const stored = contactStore.read(state, item, input);
              if (stored !== null) return stored;
              if (typeof deps.reviewTextLocally !== 'function') throw localReviewError(
                'LOCAL_REVIEW_DEFERRED', 'OCR-Kontaktwerte benötigen das lokale Standalone-Prüffenster.');
              const { buildContactDraft, validateContactAnswer } = require('../core/ocr-contact-review');
              const draft = buildContactDraft(input);
              const answer = validateContactAnswer(await deps.reviewTextLocally(draft), draft);
              if (answer.action !== 'reviewed') throw localReviewError('LOCAL_REVIEW_DEFERRED', 'Die OCR-Kontaktprüfung wurde vertagt.');
              return contactStore.write(state, item, input, answer);
            }
          } : {}),
        reviewText: (input) => {
          captured = input;
          throw localReviewError('BATCH_REVIEW_CAPTURED', 'Lokaler Stapelreview-Entwurf erfasst.');
        }
      }));
    } catch (error) {
      if (error?.code !== 'BATCH_REVIEW_CAPTURED') throw error;
      captureStoppedPipeline = true;
    }
    if (!captureStoppedPipeline || !captured ||
        !Array.isArray(captured.ambiguities) ||
        (captured.ambiguities.length === 0 && (state.product_channel !== 'standalone' ||
          typeof captured.original_text !== 'string' || typeof captured.anonymized_text !== 'string'))) {
      throw localReviewError(
        'BATCH_REVIEW_RECONSTRUCTION_FAILED',
        'Die lokale Stapelprüfung konnte die offene Fundstelle nicht unverändert rekonstruieren. Es wurde nichts freigegeben.'
      );
    }
    // Optional internal quality observer: bind the actual privacy extraction
    // to its admitted source, not to a different Markdown-only conversion.
    // Strings are immutable; this neither supplies review choices nor exposes
    // source text through the public API, journal or diagnostics.
    deps.onReviewSourceCaptured?.(Object.freeze({
      sourceLabel: item.source_label, originalText: captured.original_text
    }));
    return captured;
  }

  return { captureDeferredReviewInput };
}

module.exports = { createBatchReviewCapture };
