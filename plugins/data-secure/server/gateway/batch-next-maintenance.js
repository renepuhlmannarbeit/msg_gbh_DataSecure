'use strict';

function createBatchNextMaintenance(options = {}) {
  const reconcilePublishedItems = options.reconcilePublishedItems;
  const reconcilePendingMappings = options.reconcilePendingMappings;
  const markInterruptedItemsRetryable = options.markInterruptedItemsRetryable;
  const retryReleasedWorkCopyCleanup = options.retryReleasedWorkCopyCleanup;
  const writeState = options.writeState;

  function maintainBeforeNext(state, deps = {}) {
    // Preserve the existing crash-recovery order and its intentional
    // short-circuit: a newly adopted package is durably journalled before its
    // mapping can be reconciled by a later invocation.
    if (reconcilePublishedItems(state) || reconcilePendingMappings(state)) {
      writeState(state);
    }
    // Interrupted processing may become explicitly resumable only after all
    // verifiable publications and mappings have been handled first.
    if (markInterruptedItemsRetryable(state) > 0) {
      writeState(state);
    }
    // Private byte cleanup is last and receives caller dependencies only at
    // this narrow boundary. Published state is never downgraded by cleanup.
    if (retryReleasedWorkCopyCleanup(state, deps).changed) {
      writeState(state);
    }
  }

  return { maintainBeforeNext };
}

module.exports = { createBatchNextMaintenance };
