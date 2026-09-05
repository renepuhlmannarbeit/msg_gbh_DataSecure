'use strict';

const { releaseOwnedLock } = require('./batch-lock-release');

const { MAX_REVIEW_CHARS, reviewSizeError } = require('../companion/text-review');

// Covers both per-document separator labels (at most 100 documents).
const REVIEW_LABEL_BUDGET = 64;
function draftCharacters(draft) {
  return Math.max(String(draft?.original_text || '').length, String(draft?.anonymized_text || '').length);
}

function createBatchReviewOrchestrator(options = {}) {
  const SafeError = options.SafeError;
  const active = options.active;
  const acquireActiveLock = options.acquireActiveLock;
  const releaseActiveLock = options.releaseActiveLock;
  const readState = options.readState;
  const assertLocalExecutorAccess = options.assertLocalExecutorAccess;
  const reconcilePublishedItems = options.reconcilePublishedItems;
  const reconcilePendingMappings = options.reconcilePendingMappings;
  const writeState = options.writeState;
  const markInterruptedItemsRetryable = options.markInterruptedItemsRetryable;
  const publicProgress = options.publicProgress;
  const deferredReviewPlan = options.deferredReviewPlan;
  const captureDeferredReviewInput = options.captureDeferredReviewInput;
  const markDeferredReview = options.markDeferredReview;
  const runBatchReviewLocally = options.runBatchReviewLocally;
  const reviewTextLocally = options.reviewTextLocally;
  const publishReviewedBatch = options.publishReviewedBatch;
  const writeTerminalEvidence = options.writeTerminalEvidence;
  const currentPlatform = options.currentPlatform || (() => process.platform);

  async function reviewDeferredBatch(token, deps = {}) {
    if (active.has(token)) throw new SafeError('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
    acquireActiveLock(token);
    active.add(token);
    let primaryError = false;
    try {
      const state = readState(token);
      assertLocalExecutorAccess(state, deps.executorPid);
      if (state.invalidated === true) throw new SafeError('Der bestätigte Dateistapel wurde verändert und ist nicht mehr verwendbar.');
      const publishedReconciled = reconcilePublishedItems(state);
      const mappingReconciled = reconcilePendingMappings(state);
      if (publishedReconciled || mappingReconciled) writeState(state);
      if (markInterruptedItemsRetryable(state) > 0) writeState(state);
      const progress = publicProgress(state);
      const reviewPlan = deferredReviewPlan(state, progress);
      const items = reviewPlan.items;
      if (!reviewPlan.ready) {
        return { ok: false, error: 'batch_review_not_ready', message: reviewPlan.message, ...progress, raw_content_sent_to_claude: false };
      }

      const lifecycle = (event) => {
        try { deps.onReviewLifecycle?.(event); } catch { /* diagnostics cannot change a privacy decision */ }
      };
      let cursor = 0;
      let carry = null;
      let reviewedCount = 0;
      let locallyReleasedCount = 0;
      let failedCount = 0;
      const allPackages = [];
      const batchTotal = Number.isSafeInteger(progress.batch_total) ? progress.batch_total : state.items.length;
      const automaticallyCompleted = Number.isSafeInteger(progress.released) ? progress.released : 0;
      const safelyStopped = Number.isSafeInteger(progress.stopped) ? progress.stopped : 0;
      const otherPending = Math.max(0, batchTotal - automaticallyCompleted - safelyStopped - items.length);
      const deliverySummary = () => ({
        ...(deps.localFinalize === true ? { locally_released: locallyReleasedCount } : { packages: allPackages }),
        reviewed_documents: reviewedCount,
        failed_documents: failedCount,
        ...(deps.localFinalize === true && reviewedCount > 0 ? { local_evidence_exported: writeTerminalEvidence(state) } : {})
      });
      const checkAbort = () => {
        if (!deps.abortSignal?.aborted) return;
        const error = new SafeError('Die lokale Prüfung wurde abgebrochen. Bereits geprüfte Ergebnisse bleiben erhalten.');
        error.code = 'LOCAL_REVIEW_CANCELLED';
        throw error;
      };
      const groupFailureMessage = (error) => {
        if (error?.code === 'LOCAL_REVIEW_TOO_LARGE') return reviewSizeError().message;
        if (error?.code === 'LOCAL_REVIEW_CANCELLED') return 'Die lokale Prüfung wurde abgebrochen. Bereits geprüfte Ergebnisse bleiben erhalten.';
        return reviewedCount > 0
          ? 'Die aktuelle Prüfgruppe wurde sicher gestoppt. Offene Dateien bleiben lokal gesperrt; bereits geprüfte Ergebnisse bleiben erhalten.'
          : error instanceof SafeError ? error.message : 'Die lokale Stapelprüfung wurde sicher gestoppt. Es wurde nichts freigegeben.';
      };
      while (cursor < items.length || carry) {
      const drafts = [];
      const selected = [];
      let budget = 0;
      try {
        checkAbort();
        lifecycle({ event: 'review_reconstruction_started', outcome: 'progress', item_count: items.length });
        while (cursor < items.length || carry) {
          checkAbort();
          const item = carry?.item || items[cursor];
          // Source bytes give a useful early bound for large text files. Office
          // expansion is checked again against the actual reconstructed text.
          if (!carry && drafts.length && budget + Number(item.size || 0) + REVIEW_LABEL_BUDGET > MAX_REVIEW_CHARS) break;
          const draft = carry?.draft || await captureDeferredReviewInput(state, item, deps);
          checkAbort();
          if (!carry) cursor++;
          carry = null;
          const chars = draftCharacters(draft);
          if (chars > MAX_REVIEW_CHARS) throw reviewSizeError();
          const weight = chars + REVIEW_LABEL_BUDGET;
          if (drafts.length && budget + weight > MAX_REVIEW_CHARS) {
            carry = { item, draft };
            break;
          }
          selected.push(item);
          drafts.push(draft);
          budget += weight;
        }
        lifecycle({ event: 'review_reconstruction_finished', outcome: 'ok', item_count: selected.length });
      } catch (error) {
        lifecycle({ event: 'review_reconstruction_failed', outcome: 'stopped', item_count: items.length,
          error_code: ['LOCAL_REVIEW_TOO_LARGE', 'LOCAL_REVIEW_CANCELLED'].includes(error?.code) ? error.code : 'LOCAL_REVIEW_FAILED' });
        markDeferredReview(state, items.slice(reviewedCount), error?.code || 'BATCH_REVIEW_RECONSTRUCTION_FAILED');
        writeState(state);
        return {
          ok: false,
          error: error?.code || 'BATCH_REVIEW_RECONSTRUCTION_FAILED',
          message: groupFailureMessage(error),
          ...publicProgress(state), ...deliverySummary(), raw_content_sent_to_claude: false
        };
      }

      let outcome;
      try {
        checkAbort();
        lifecycle({ event: 'review_ui_started', outcome: 'progress', item_count: selected.length });
        outcome = await runBatchReviewLocally(drafts, {
          platform: deps.platform || currentPlatform(),
          allowDefer: true,
          batchSummary: {
            batchTotal,
            automaticallyCompleted,
            safelyStopped,
            otherPending,
            previouslyReviewed: reviewedCount,
            reviewPendingTotal: items.length - reviewedCount
          },
          reviewTextLocally: deps.reviewTextLocally || reviewTextLocally,
          ...(deps.reviewOptions || {})
        });
        checkAbort();
        lifecycle({ event: 'review_ui_finished', outcome: outcome.action === 'reviewed' ? 'ok' : 'stopped',
          item_count: selected.length, error_code: outcome.action === 'reviewed' ? 'NONE' : 'LOCAL_REVIEW_CANCELLED' });
      } catch (error) {
        const code = ['LOCAL_REVIEW_TOO_LARGE', 'LOCAL_REVIEW_TIMEOUT', 'LOCAL_REVIEW_CANCELLED'].includes(error?.code) ? error.code : 'LOCAL_REVIEW_FAILED';
        lifecycle({ event: 'review_ui_failed', outcome: 'stopped', item_count: selected.length, error_code: code });
        markDeferredReview(state, items.slice(reviewedCount), code);
        writeState(state);
        const message = code === 'LOCAL_REVIEW_TOO_LARGE' ? reviewSizeError().message :
          code === 'LOCAL_REVIEW_CANCELLED' ? groupFailureMessage(error) :
          code === 'LOCAL_REVIEW_TIMEOUT' ? 'Die lokale Prüfgruppe hat nicht rechtzeitig geantwortet. Bereits geprüfte Ergebnisse bleiben erhalten.' :
          'Die lokale Prüfgruppe konnte nicht abgeschlossen werden. Bereits geprüfte Ergebnisse bleiben erhalten.';
        return { ok: false, error: code, message, ...publicProgress(state), ...deliverySummary(), raw_content_sent_to_claude: false };
      }
      if (outcome.action !== 'reviewed') {
        const code = outcome.action === 'deferred' ? 'LOCAL_REVIEW_DEFERRED' : 'LOCAL_REVIEW_CANCELLED';
        markDeferredReview(state, items.slice(reviewedCount), code);
        writeState(state);
        return { ok: false, error: code, message: 'Die lokale Stapelentscheidung wurde nicht abgeschlossen. Offene Dateien bleiben lokal gesperrt; bereits geprüfte Ergebnisse bleiben erhalten.', ...publicProgress(state), ...deliverySummary(), raw_content_sent_to_claude: false };
      }

      let publication;
      try {
        publication = await publishReviewedBatch(state, selected.length === items.length ? items : selected, drafts, outcome.documents, deps);
      } catch (error) {
        if (error?.code !== 'BATCH_REVIEW_DECISION_BINDING_INVALID') throw error;
        return { ok: false, error: error.code, message: groupFailureMessage(error), ...publicProgress(state), ...deliverySummary(), raw_content_sent_to_claude: false };
      }
      const { packages, locallyReleased, failed } = publication;
      allPackages.push(...packages);
      locallyReleasedCount += locallyReleased;
      failedCount += failed;
      reviewedCount += selected.length;
      // Drop all text references before reconstruction of the next group.
      drafts.length = 0;
      }
      return {
        ok: allPackages.length > 0 || locallyReleasedCount > 0,
        ...publicProgress(state),
        ...deliverySummary(),
        raw_content_sent_to_claude: false
      };
    } catch (error) {
      primaryError = true;
      throw error;
    } finally {
      active.delete(token);
      releaseOwnedLock(releaseActiveLock, token, SafeError, primaryError);
    }
  }

  return { reviewDeferredBatch };
}

module.exports = { createBatchReviewOrchestrator };
