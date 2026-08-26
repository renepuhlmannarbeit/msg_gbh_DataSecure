'use strict';

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
  const deliveryPendingStatus = options.deliveryPendingStatus || 'delivery_pending';

  async function processBatchNext(token, deps = {}) {
    if (active.has(token)) {
      throw new SafeError('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
    }
    acquireActiveLock(token);
    active.add(token);
    try {
      const state = readState(token);
      assertLocalExecutorAccess(state, deps.executorPid);
      if (state.invalidated === true) {
        throw new SafeError('Der bestätigte Dateistapel wurde verändert und ist nicht mehr verwendbar.');
      }

      maintainBeforeNext(state, deps);

      const pendingDelivery = state.items.find(
        (candidate) => candidate.status === deliveryPendingStatus
      );
      if (pendingDelivery) return await deliveryResult(state, pendingDelivery);

      const item = state.items.find((candidate) => candidate.status === 'pending');
      if (!item) {
        return {
          ok: true,
          ...publicProgress(state),
          raw_content_sent_to_claude: false
        };
      }

      let entry;
      try {
        entry = exactPendingEntry(state, item);
      } catch (error) {
        invalidateUnpublishedBatchCopies(state, deps);
        writeState(state);
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
      return await processSingleBatchItem(state, item, entry, deps);
    } finally {
      active.delete(token);
      releaseActiveLock(token);
    }
  }

  return { processBatchNext };
}

module.exports = { createBatchProcessingOrchestrator };
