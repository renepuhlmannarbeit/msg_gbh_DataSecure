'use strict';
const { assertAnonymizationBatch } = require('../core/processing-mode');
const { bindContentDependencies } = require('./content-consumer-dependencies');
const { contentOptionsForBatch } = require('../core/content-options');
const { types } = require('node:util');

function createBatchReviewCapture(options = {}) {
  const anonymizeNext = options.anonymizeNext;
  const exactPendingEntry = options.exactPendingEntry;
  const packageIdForItem = options.packageIdForItem;
  const localReviewError = options.localReviewError;
  const withBatchPseudonymRegistry = options.withBatchPseudonymRegistry ||
    (async (_state, action) => action(undefined));
  const contactStore = options.contactStore;

  async function captureContentReview(state, item, deps) {
    if (!deps || types.isProxy(deps)) throw localReviewError('CONTENT_OPTIONS_BINDING_INVALID', 'Der interne Prüfanschluss ist ungültig.');
    const descriptors = Object.getOwnPropertyDescriptors(deps), selected = {};
    for (const key of ['abortSignal', 'convertBuffer', 'timeoutMs', 'captureOcrInput']) {
      const descriptor = descriptors[key];
      if (!descriptor) continue;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw localReviewError('CONTENT_OPTIONS_BINDING_INVALID', 'Der interne Prüfanschluss ist ungültig.');
      selected[key] = descriptor.value;
    }
    const observer = name => {
      const descriptor = descriptors[name];
      if (!descriptor) return undefined;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') ||
          typeof descriptor.value !== 'function' || types.isProxy(descriptor.value))
        throw localReviewError('CONTENT_OPTIONS_BINDING_INVALID', 'Der interne Prüfanschluss ist ungültig.');
      return descriptor.value;
    };
    const onOcrSourceCaptured = observer('onOcrSourceCaptured'), onReviewSourceCaptured = observer('onReviewSourceCaptured');
    const result = await withBatchPseudonymRegistry(state, pseudonymRegistry => options.captureStandaloneReview(state.token, item.id, {
      ...selected, pseudonymRegistry,
      prepareOcrContacts: input => contactStore ? contactStore.read(state, item, input) : null,
      ...(onOcrSourceCaptured ? { onOcrSourceCaptured: input => onOcrSourceCaptured(Object.freeze({
        sourceLabel: item.source_label, originalText: input.original_text })) } : {})
    }));
    if (result?.kind === 'ocr-contact' && result.ocr_contact_input) return { ocr_contact_input: result.ocr_contact_input };
    const captured = result?.kind === 'privacy' ? result.draft : null;
    if (!captured || !Array.isArray(captured.ambiguities) || typeof captured.original_text !== 'string' || typeof captured.anonymized_text !== 'string')
      throw localReviewError('BATCH_REVIEW_RECONSTRUCTION_FAILED', 'Die lokale Prüfung konnte nicht sicher rekonstruiert werden.');
    onReviewSourceCaptured?.(Object.freeze({ sourceLabel: item.source_label, originalText: captured.original_text }));
    return captured;
  }

  async function captureDeferredReviewInput(state, item, deps = {}) {
    assertAnonymizationBatch(state);
    if (contentOptionsForBatch(state) && options.captureStandaloneReview) return captureContentReview(state, item, deps);
    const entry = exactPendingEntry(state, item);
    let captured;
    let captureStoppedPipeline = false;
    try {
      const operation = contentOptionsForBatch(state) && options.captureStandaloneReview ?
        (_profile, hooks) => options.captureStandaloneReview(state.token, item.id, hooks) : anonymizeNext;
      await withBatchPseudonymRegistry(state, (pseudonymRegistry) => operation(state.profile, {
        ...bindContentDependencies(state, deps),
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
              if (deps.captureOcrInput === true) {
                captured = { ocr_contact_input: input };
                throw localReviewError('BATCH_REVIEW_CAPTURED', 'Lokaler OCR-Entwurf erfasst.');
              }
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
    if (captureStoppedPipeline && captured?.ocr_contact_input) return captured;
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
