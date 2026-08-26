'use strict';

const { SafeError } = require('../runtime');

function createBatchContinuation(options = {}) {
  const ErrorType = options.SafeError || SafeError;
  const active = options.active;
  const acquireActiveLock = options.acquireActiveLock;
  const releaseActiveLock = options.releaseActiveLock;
  const readState = options.readState;
  const writeState = options.writeState;
  const assertLocalExecutorAccess = options.assertLocalExecutorAccess;
  const reconcilePublishedItems = options.reconcilePublishedItems;
  const reconcilePendingMappings = options.reconcilePendingMappings;
  const markInterruptedItemsRetryable = options.markInterruptedItemsRetryable;
  const recoverableBatchStates = options.recoverableBatchStates;
  const publicProgress = options.publicProgress;
  const deferredReviewStatus = options.deferredReviewStatus || 'deferred_review';
  const mappingPendingStatus = options.mappingPendingStatus || 'mapping_pending';

  function resumeBatch(token) {
    if (active.has(token)) throw new ErrorType('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
    acquireActiveLock(token);
    active.add(token);
    try {
      const state = readState(token);
      assertLocalExecutorAccess(state);
      if (state.invalidated === true) {
        throw new ErrorType('Der bestätigte Dateistapel wurde verändert und ist nicht mehr verwendbar.');
      }
      // The caller owns the live global lock at this point. A leftover
      // `processing` state can therefore only be from a previous interrupted
      // owner, never from a concurrent worker. First adopt a verified package,
      // then make any remaining interrupted item eligible for this explicit
      // resume request.
      let changed = reconcilePublishedItems(state);
      if (reconcilePendingMappings(state)) changed = true;
      if (markInterruptedItemsRetryable(state) > 0) changed = true;
      let resumed = 0;
      for (const item of state.items) {
        if (item.status !== 'retryable') continue;
        item.status = 'pending';
        item.checkpoint = 'resumed';
        delete item.error_code;
        resumed++;
      }
      if (!resumed) {
        if (changed) writeState(state);
        return {
          ok: false,
          error: state.items.some((item) => item.status === deferredReviewStatus)
            ? 'batch_review_required'
            : (state.items.some((item) => item.status === mappingPendingStatus)
              ? 'local_mapping_repair_pending'
              : 'no_retryable_documents'),
          ...publicProgress(state),
          raw_content_sent_to_claude: false
        };
      }
      writeState(state);
      return { ok: true, resumed, ...publicProgress(state), raw_content_sent_to_claude: false };
    } finally {
      active.delete(token);
      releaseActiveLock(token);
    }
  }

  function continueMostRecentBatch() {
    const states = recoverableBatchStates().sort((left, right) =>
      Date.parse(right.created_at) - Date.parse(left.created_at)
    );
    if (!states.length) {
      return { ok: false, error: 'no_incomplete_batch', raw_content_sent_to_claude: false };
    }
    const selected = states[0];
    // resumeBatch alone acquires the global owner lock. A live worker stays
    // protected by the recovery scan; a dead one becomes retryable only after
    // this explicit continuation. Deferred review remains on its shared local
    // review path instead of falling back to one-file UI.
    const before = readState(selected.token);
    if (before.items.some((item) => item.status === 'retryable' || item.status === 'processing')) {
      const resumed = resumeBatch(selected.token);
      if (resumed.ok === false) return resumed;
    }
    return {
      ok: true,
      batch_token: selected.token,
      ...publicProgress(readState(selected.token)),
      raw_content_sent_to_claude: false
    };
  }

  return { resumeBatch, continueMostRecentBatch };
}

module.exports = { createBatchContinuation };
