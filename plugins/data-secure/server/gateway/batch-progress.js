'use strict';

const { projectBatchResults, emptyGradeCounts, emptyOmissionCounts } = require('./batch-result-projection');
const { validateMarker } = require('./batch-terminal-evidence');
const core = require('../core/batch-progress');

function createBatchProgress(deps) {
  const {
    deliveryPendingStatus,
    deferredReviewStatus,
    mappingPendingStatus,
    preflightMappingPendingStatus = 'preflight_mapping_pending',
    liveLocalExecutor = () => false,
    publishedPackageRecord = () => null
  } = deps;

  function publicProgress(state, options = {}) {
    const items = Array.isArray(state?.items) ? state.items : [];
    const progress = core.progressFacts(state, {
      deliveryPendingStatus,
      deferredReviewStatus,
      mappingPendingStatus,
      preflightMappingPendingStatus
    }, liveLocalExecutor(state));

    // Full package hashing is restricted to terminal-evidence creation. Public
    // terminal progress performs only the durable O(n) file-identity binding.
    let durableProjection = null;
    const hasExportedMarker = progress.complete && state.terminal_evidence?.status === 'exported';
    if (hasExportedMarker) {
      try {
        const marker = validateMarker(state.terminal_evidence);
        const record = marker.record;
        const gradeCounts = record.schema === 'datasecure-batch-evidence/3' ? record.grade_counts : null;
        const omissionCounts = record.schema === 'datasecure-batch-evidence/3' ? record.omission_counts : null;
        const stateProjection = gradeCounts
          ? projectBatchResults(state, { verifyPositive: (item) => publishedPackageRecord(item) })
          : null;
        if (record.counts.total === items.length && record.counts.released === progress.released && record.counts.stopped === progress.stopped &&
            gradeCounts && gradeCounts.complete + gradeCounts.usable_with_omissions === progress.released &&
            gradeCounts.not_processed === progress.stopped && gradeCounts.unavailable === 0 &&
            stateProjection?.grades_verified === true &&
            JSON.stringify(stateProjection.grade_counts) === JSON.stringify(gradeCounts) &&
            JSON.stringify(stateProjection.omission_counts) === JSON.stringify(omissionCounts)) {
          durableProjection = { grade_counts: { ...gradeCounts }, omission_counts: { ...omissionCounts }, grades_verified: true };
        }
      } catch { /* a malformed durable marker is never projected */ }
    }
    const projected = progress.complete && options.skipResultProjection !== true
      ? (hasExportedMarker
          ? (durableProjection || { grade_counts: emptyGradeCounts(items.length), omission_counts: emptyOmissionCounts(), grades_verified: false })
          : projectBatchResults(state, { verifyPositive: (item) => publishedPackageRecord(item) }))
      : { grade_counts: emptyGradeCounts(items.length), omission_counts: emptyOmissionCounts(), grades_verified: false };
    return core.finalizeProgress(progress, projected);
  }

  return {
    batchUserStatus: core.batchUserStatus,
    formatRemainingTime: core.formatRemainingTime,
    measuredRemainingSeconds: core.measuredRemainingSeconds,
    publicProgress
  };
}

module.exports = { createBatchProgress };
