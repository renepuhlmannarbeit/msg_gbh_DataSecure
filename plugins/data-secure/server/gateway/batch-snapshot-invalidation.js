'use strict';

const { notProcessedDocumentResult } = require('./document-result-grade');

function createBatchSnapshotInvalidation(options = {}) {
  const appendMapping = options.appendMapping;
  const cleanupTerminalWorkCopy = options.cleanupTerminalWorkCopy;
  const deferredReviewStatus = options.deferredReviewStatus || 'deferred_review';
  const mappingStoppedStatus = options.mappingStoppedStatus || 'stopped';

  function invalidateUnpublishedBatchCopies(state, deps = {}, exceptItem = null) {
    state.invalidated = true;
    const affected = [];
    for (const item of state.items) {
      if (item === exceptItem) continue;
      if (!['pending', 'processing', 'retryable', deferredReviewStatus].includes(item.status)) continue;
      item.status = 'stopped';
      item.checkpoint = 'stopped';
      item.error_code = 'BATCH_SNAPSHOT_CHANGED';
      item.document_result = notProcessedDocumentResult(item.error_code);
      item.local_mapping_exported = false;
      item.work_copy_cleanup_pending = true;
      affected.push(item);
      // Published results retain their own lifecycle. Every not-yet-published
      // sealed copy is no longer trustworthy once one batch source fails its
      // immutable-snapshot boundary.
    }
    // Persist every invalidation decision as one journal transition before
    // creating any external projection or deleting any private work copy.
    if (affected.length > 0) (deps.writeState || options.writeState)(state);
    for (const item of affected) {
      try {
        appendMapping(item.name, '', mappingStoppedStatus, {
          mappingReference: item.id,
          documentResult: item.document_result
        });
        item.local_mapping_exported = true;
        (deps.writeState || options.writeState)(state);
      } catch {
        continue;
      }
      try {
        cleanupTerminalWorkCopy(state, item, deps);
        item.work_copy_cleanup_pending = false;
      } catch {
        item.work_copy_cleanup_pending = true;
      }
      (deps.writeState || options.writeState)(state);
    }
  }

  return { invalidateUnpublishedBatchCopies };
}

module.exports = { createBatchSnapshotInvalidation };
