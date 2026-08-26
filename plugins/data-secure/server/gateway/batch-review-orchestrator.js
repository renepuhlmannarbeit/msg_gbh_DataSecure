'use strict';

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
      const drafts = [];
      try {
        lifecycle({ event: 'review_reconstruction_started', outcome: 'progress', item_count: items.length });
        for (const item of items) drafts.push(await captureDeferredReviewInput(state, item, deps));
        lifecycle({ event: 'review_reconstruction_finished', outcome: 'ok', item_count: items.length });
      } catch (error) {
        lifecycle({ event: 'review_reconstruction_failed', outcome: 'stopped', item_count: items.length,
          error_code: 'LOCAL_REVIEW_FAILED' });
        markDeferredReview(state, items, error?.code || 'BATCH_REVIEW_RECONSTRUCTION_FAILED');
        writeState(state);
        return {
          ok: false,
          error: error?.code || 'BATCH_REVIEW_RECONSTRUCTION_FAILED',
          message: error instanceof SafeError ? error.message : 'Die lokale Stapelprüfung wurde sicher gestoppt. Es wurde nichts freigegeben.',
          ...publicProgress(state), raw_content_sent_to_claude: false
        };
      }

      let outcome;
      try {
        lifecycle({ event: 'review_ui_started', outcome: 'progress', item_count: items.length });
        outcome = await runBatchReviewLocally(drafts, {
          platform: deps.platform || currentPlatform(),
          allowDefer: true,
          reviewTextLocally: deps.reviewTextLocally || reviewTextLocally,
          ...(deps.reviewOptions || {})
        });
        lifecycle({ event: 'review_ui_finished', outcome: outcome.action === 'reviewed' ? 'ok' : 'stopped',
          item_count: items.length, error_code: outcome.action === 'reviewed' ? 'NONE' : 'LOCAL_REVIEW_CANCELLED' });
      } catch (error) {
        lifecycle({ event: 'review_ui_failed', outcome: 'stopped', item_count: items.length,
          error_code: error?.code === 'LOCAL_REVIEW_TIMEOUT' ? 'LOCAL_REVIEW_TIMEOUT' : 'LOCAL_REVIEW_FAILED' });
        markDeferredReview(state, items, 'LOCAL_REVIEW_CANCELLED');
        writeState(state);
        return { ok: false, error: 'LOCAL_REVIEW_CANCELLED', message: 'Die lokale Stapelentscheidung wurde abgebrochen. Es wurde nichts freigegeben.', ...publicProgress(state), raw_content_sent_to_claude: false };
      }
      if (outcome.action !== 'reviewed') {
        const code = outcome.action === 'deferred' ? 'LOCAL_REVIEW_DEFERRED' : 'LOCAL_REVIEW_CANCELLED';
        markDeferredReview(state, items, code);
        writeState(state);
        return { ok: false, error: code, message: 'Die lokale Stapelentscheidung wurde nicht abgeschlossen. Alle offenen Dateien bleiben lokal gesperrt.', ...publicProgress(state), raw_content_sent_to_claude: false };
      }

      let publication;
      try {
        publication = await publishReviewedBatch(state, items, drafts, outcome.documents, deps);
      } catch (error) {
        if (error?.code !== 'BATCH_REVIEW_DECISION_BINDING_INVALID') throw error;
        return { ok: false, error: error.code, message: error.message, ...publicProgress(state), raw_content_sent_to_claude: false };
      }
      const { packages, locallyReleased, failed } = publication;
      return {
        ok: packages.length > 0 || locallyReleased > 0,
        ...(deps.localFinalize === true ? { locally_released: locallyReleased } : { packages }),
        reviewed_documents: items.length,
        failed_documents: failed,
        ...publicProgress(state),
        ...(deps.localFinalize === true ? { local_evidence_exported: writeTerminalEvidence(state) } : {}),
        raw_content_sent_to_claude: false
      };
    } finally {
      active.delete(token);
      releaseActiveLock(token);
    }
  }

  return { reviewDeferredBatch };
}

module.exports = { createBatchReviewOrchestrator };
