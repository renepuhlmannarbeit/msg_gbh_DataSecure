'use strict';

function createBatchSnapshotInvalidation(options = {}) {
  const appendMapping = options.appendMapping;
  const cleanupTerminalWorkCopy = options.cleanupTerminalWorkCopy;
  const deferredReviewStatus = options.deferredReviewStatus || 'deferred_review';
  const mappingStoppedStatus = options.mappingStoppedStatus || 'stopped';

  function invalidateUnpublishedBatchCopies(state, deps = {}, exceptItem = null) {
    state.invalidated = true;
    for (const item of state.items) {
      if (item === exceptItem) continue;
      if (!['pending', 'processing', 'retryable', deferredReviewStatus].includes(item.status)) continue;
      item.status = 'stopped';
      item.checkpoint = 'stopped';
      item.error_code = 'BATCH_SNAPSHOT_CHANGED';
      // Published results retain their own lifecycle. Every not-yet-published
      // sealed copy is no longer trustworthy once one batch source fails its
      // immutable-snapshot boundary.
      try {
        appendMapping(item.name, '', mappingStoppedStatus);
        item.local_mapping_exported = true;
      } catch {
        item.local_mapping_exported = false;
      }
      try {
        cleanupTerminalWorkCopy(state, item, deps);
      } catch {
        item.work_copy_cleanup_pending = true;
      }
    }
  }

  return { invalidateUnpublishedBatchCopies };
}

module.exports = { createBatchSnapshotInvalidation };
