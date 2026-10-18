'use strict';

const { releaseOwnedLock, releaseOwnedEpochWithBusyRetry } = require('./batch-lock-release');
const { recordBatchExecutionFailure, blockDocumentStabilization } = require('./batch-execution-diagnostic');
const { isMarkdownBatch } = require('../core/processing-mode');

function createBatchProcessingOrchestrator(options = {}) {
  const SafeError = options.SafeError;
  const active = options.active;
  const acquireActiveLock = options.acquireActiveLock;
  const releaseActiveLock = options.releaseActiveLock;
  const readState = options.readState;
  const assertLocalExecutorAccess = options.assertLocalExecutorAccess;
  const maintainBeforeNext = options.maintainBeforeNext;
  const deliveryResult = options.deliveryResult;
  const publicProgress = options.publicProgress;
  const exactPendingEntry = options.exactPendingEntry;
  const invalidateUnpublishedBatchCopies = options.invalidateUnpublishedBatchCopies;
  const writeState = options.writeState;
  const processSingleBatchItem = options.processSingleBatchItem;
  const writeTerminalEvidence = options.writeTerminalEvidence || (() => undefined);
  const deliveryPendingStatus = options.deliveryPendingStatus || 'delivery_pending';
  const withBatchPseudonymRegistry = options.withBatchPseudonymRegistry ||
    (async (_state, action) => action(undefined));

  async function processBatchNext(token, deps = {}) {
    if (active.has(token)) {
      throw new SafeError('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
    }
    // Reserve in-process exclusion before the first possible admission await.
    active.add(token);
    let acquired = false, primaryError = false, ownedEpoch, primaryFailure;
    try {
      if (typeof options.acquireProcessingOwner === 'function') {
        const admission = options.acquireProcessingOwner(token);
        const confirmed = admission && typeof admission.then === 'function' ? await admission : admission;
        if (confirmed !== true) throw Object.assign(new SafeError('Die lokale Verarbeitungssperre wurde nicht bestätigt.'),
          { code: 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED' });
      } else {
        // Explicit source/legacy contract only; never bypass native admission.
        if (process.env.DATASECURE_NATIVE_EXPORT_CHANNEL === '1' && ['win32', 'darwin'].includes(process.platform))
          throw Object.assign(new SafeError('Die native Verarbeitungssperre ist nicht verfügbar.'), { code: 'OWNERSHIP_GUARD_UNAVAILABLE' });
        acquireActiveLock(token);
      }
      acquired = true;
      if (options.captureOwnedEpoch) ownedEpoch = options.captureOwnedEpoch(token);
      const state = readState(token);
      if (require('../core/content-options').contentOptionsForBatch(state))
        deps = require('./content-consumer-dependencies').bindContentReviewDependencies(state, deps).dependencies;
      assertLocalExecutorAccess(state, deps.executorPid);
      if (state.invalidated === true) {
        throw new SafeError('Der bestätigte Dateistapel wurde verändert und ist nicht mehr verwendbar.');
      }

      maintainBeforeNext(state, deps);

      const pendingDelivery = state.items.find(
        (candidate) => candidate.status === deliveryPendingStatus
      );
      if (pendingDelivery) return await deliveryResult(state, pendingDelivery);

      // Maintenance may have settled mapping debt in this very call. Never
      // fall through to a new source after a durable Standalone pause request.
      if (options.pauseRequested?.(state)) {
        return { ok: true, ...publicProgress(state), raw_content_sent_to_claude: false };
      }

      const item = state.items.find((candidate) => candidate.status === 'pending');
      if (!item) {
        const progress = publicProgress(state);
        return {
          ok: true,
          ...progress,
          ...(progress.complete === true
            ? { local_evidence_exported: writeTerminalEvidence(state) }
            : {}),
          raw_content_sent_to_claude: false
        };
      }

      let entry;
      try {
        entry = exactPendingEntry(state, item);
      } catch (error) {
        if (['PRIVATE_ARTIFACT_LEGACY_ENCRYPTED_UNSUPPORTED', 'LEGACY_ENCRYPTED_ARTIFACT_UNAVAILABLE'].includes(error?.code)) {
          // This is not tampering with a new snapshot. Preserve old envelopes
          // and the journal exactly; there is deliberately no decrypt fallback.
          return {
            ok: false,
            error: 'LEGACY_ENCRYPTED_ARTIFACT_UNAVAILABLE',
            message: 'Der alte verschlüsselte Stapel bleibt unverändert erhalten. Bitte die Originaldateien neu auswählen.',
            raw_content_sent_to_claude: false
          };
        }
        invalidateUnpublishedBatchCopies(state, { ...deps, writeState });
        return {
          ok: false,
          error: 'batch_snapshot_changed',
          message: error instanceof SafeError
            ? error.message
            : 'Der bestätigte Dateistapel wurde verändert.',
          ...publicProgress(state),
          raw_content_sent_to_claude: false
        };
      }

      // Security boundary: keep in-process and filesystem locks until the
      // delegated asynchronous pipeline has resolved or rejected.
      if (isMarkdownBatch(state)) {
        return await processSingleBatchItem(state, item, entry, deps);
      }
      return await withBatchPseudonymRegistry(state, (pseudonymRegistry) =>
        processSingleBatchItem(state, item, entry,
          pseudonymRegistry ? {
            ...deps,
            pseudonymRegistry,
            persistPseudonymContext() {
              state.pseudonym_registry_state = pseudonymRegistry.exportState();
              writeState(state);
            }
          } : deps));
    } catch (error) {
      primaryError = true;
      primaryFailure = error;
      throw error;
    } finally {
      try {
        if (acquired && ownedEpoch) {
          const releaseEpoch = options.releaseOwnedEpoch;
          await releaseOwnedEpochWithBusyRetry(releaseEpoch, ownedEpoch, SafeError, primaryError, {
            delay: options.releaseDelay,
            onFailure: error => {
              if (primaryError) blockDocumentStabilization(primaryFailure);
              (options.recordBatchFailure || recordBatchExecutionFailure)('item_epoch_release', error);
            }
          });
        } else if (acquired) releaseOwnedLock(releaseActiveLock, token, SafeError, primaryError);
      } finally {
        // Keep in-process exclusion through every backoff and release attempt.
        active.delete(token);
      }
    }
  }

  return { processBatchNext };
}

module.exports = { createBatchProcessingOrchestrator };
