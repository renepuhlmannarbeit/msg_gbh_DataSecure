'use strict';

const { sameDocumentResult } = require('./document-result-grade');

function createBatchMappingMaintenance(options = {}) {
  const readOutboxEntries = options.readOutboxEntries;
  const publishedPackageState = options.publishedPackageState;
  const publishedPackageRecord = options.publishedPackageRecord;
  const appendMapping = options.appendMapping;
  const removeMappingOutbox = options.removeMappingOutbox;

  function replayMappingOutbox() {
    let repaired = 0;
    let pending = 0;
    let orphanedRemoved = 0;
    let failures = 0;
    let entries;
    try { entries = readOutboxEntries(); }
    catch { return { repaired, pending, orphaned_removed: orphanedRemoved, failures: 1 }; }
    for (const entry of entries) {
      // Only a conclusively missing package makes its exact intent obsolete.
      // Unsafe or otherwise unverifiable output must remain pending.
      const published = publishedPackageRecord
        ? publishedPackageRecord(entry.package_id)
        : { state: publishedPackageState(entry.package_id), document_result: null };
      const state = published.state;
      if (state === 'missing') {
        try {
          removeMappingOutbox(entry);
          orphanedRemoved++;
        } catch { failures++; }
        continue;
      }
      if (state !== 'verified') {
        pending++;
        continue;
      }
      if (published.document_result && !sameDocumentResult(entry.document_result, published.document_result)) {
        pending++;
        continue;
      }
      if (!published.document_result && Object.hasOwn(entry, 'document_result')) {
        pending++;
        continue;
      }
      try {
        // The durable user mapping must exist before its repair intent is
        // removed. A failure in either operation keeps the replay retryable.
        appendMapping(entry.original_basename, entry.package_id, undefined, {
          documentResult: entry.document_result
        });
        removeMappingOutbox(entry);
        repaired++;
      } catch {
        pending++;
      }
    }
    return { repaired, pending, orphaned_removed: orphanedRemoved, failures };
  }

  return { replayMappingOutbox };
}

module.exports = { createBatchMappingMaintenance };
