'use strict';

const {
  GRADES,
  OMISSION_CODES,
  validateDocumentResult,
  positiveDocumentResult,
  sameDocumentResult
} = require('./document-result-grade');

const GRADE_COUNT_KEYS = Object.freeze(['complete', 'usable_with_omissions', 'not_processed', 'unavailable']);
const OMISSION_COUNT_KEYS = Object.freeze(['images_removed_by_request', 'visual_assets_withheld_locally']);
const GRADE_LABELS = Object.freeze({
  [GRADES.COMPLETE]: 'Vollständig verarbeitet',
  [GRADES.USABLE_WITH_OMISSIONS]: 'Verwendbar mit Auslassungen'
});
const OMISSION_PROJECTION = Object.freeze({
  [OMISSION_CODES.IMAGES_REMOVED_BY_REQUEST]: Object.freeze({ key: 'images_removed_by_request', label: 'Bilder auf Wunsch entfernt' }),
  [OMISSION_CODES.VISUAL_ASSETS_WITHHELD_LOCALLY]: Object.freeze({ key: 'visual_assets_withheld_locally', label: 'Grafiken ausschließlich lokal zurückgehalten' })
});

function emptyGradeCounts(total = 0) {
  return { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: total };
}

function emptyOmissionCounts() {
  return { images_removed_by_request: 0, visual_assets_withheld_locally: 0 };
}

function unavailableProjection(total, verified = false) {
  return { grade_counts: emptyGradeCounts(total), omission_counts: emptyOmissionCounts(), grades_verified: verified };
}

function positivePackageMatches(item, verifyPositive) {
  if (typeof verifyPositive !== 'function') return false;
  try {
    const record = verifyPositive(item);
    return record?.state === 'verified' && record.document_result &&
      sameDocumentResult(item.document_result, record.document_result);
  } catch {
    return false;
  }
}

// Pure result projection. Filesystem/export verification is supplied by a
// product adapter and is never imported into the shared policy core.
function projectBatchResults(state, options = {}) {
  const items = Array.isArray(state?.items) ? state.items : [];
  if (items.length === 0) return unavailableProjection(0, false);
  if (state.schema === 'datasecure-batch/5') {
    if (state.processing_mode !== 'markdown-only' || state.product_channel !== 'standalone') return unavailableProjection(items.length);
    const visibleCommit = options.visibleMarkdownCommit === true;
    const counts = emptyGradeCounts();
    for (const item of items) {
      if (item.status === 'released') {
        if (!visibleCommit && (typeof options.verifyMarkdown !== 'function' || options.verifyMarkdown(item) !== true)) {
          return unavailableProjection(items.length);
        }
        counts[item.extraction_grade === 'complete' ? 'complete' : 'usable_with_omissions']++;
      } else if (item.status === 'stopped' && item.local_mapping_exported !== false) {
        try {
          validateDocumentResult(item.document_result);
          if (item.document_result.grade !== GRADES.NOT_PROCESSED || item.document_result.reason_code !== item.error_code) return unavailableProjection(items.length);
        } catch { return unavailableProjection(items.length); }
        counts.not_processed++;
      } else counts.unavailable++;
    }
    return { grade_counts: counts, omission_counts: emptyOmissionCounts(), grades_verified: counts.unavailable === 0 };
  }
  if (state.schema === 'datasecure-batch/1') return unavailableProjection(items.length, false);
  if (!['datasecure-batch/2', 'datasecure-batch/3', 'datasecure-batch/4'].includes(state.schema)) {
    return unavailableProjection(items.length, false);
  }

  const gradeCounts = emptyGradeCounts(0);
  const omissionCounts = emptyOmissionCounts();
  for (const item of items) {
    try {
      if (item.status === 'released') {
        positiveDocumentResult(item.document_result);
        if (!positivePackageMatches(item, options.verifyPositive)) return unavailableProjection(items.length, false);
        const key = item.document_result.grade === GRADES.COMPLETE ? 'complete' : 'usable_with_omissions';
        gradeCounts[key]++;
        for (const omission of item.document_result.omissions) {
          const projection = OMISSION_PROJECTION[omission.code];
          if (!projection) return unavailableProjection(items.length, false);
          omissionCounts[projection.key] += omission.count;
          if (!Number.isSafeInteger(omissionCounts[projection.key])) return unavailableProjection(items.length, false);
        }
        continue;
      }
      if (item.status === 'stopped' && item.local_mapping_exported !== false) {
        validateDocumentResult(item.document_result);
        if (item.document_result.grade !== GRADES.NOT_PROCESSED || item.document_result.reason_code !== item.error_code) {
          return unavailableProjection(items.length, false);
        }
        gradeCounts.not_processed++;
        continue;
      }
      gradeCounts.unavailable++;
    } catch {
      return unavailableProjection(items.length, false);
    }
  }
  const sum = GRADE_COUNT_KEYS.reduce((total, key) => total + gradeCounts[key], 0);
  if (sum !== items.length) return unavailableProjection(items.length, false);
  return { grade_counts: gradeCounts, omission_counts: omissionCounts, grades_verified: true };
}

function publicPositiveDocumentResult(value) {
  positiveDocumentResult(value);
  return {
    grade: value.grade,
    label: GRADE_LABELS[value.grade],
    omissions: value.omissions.map((entry) => ({
      code: entry.code,
      label: OMISSION_PROJECTION[entry.code].label,
      count: entry.count
    }))
  };
}

module.exports = Object.freeze({
  GRADE_COUNT_KEYS,
  OMISSION_COUNT_KEYS,
  emptyGradeCounts,
  emptyOmissionCounts,
  projectBatchResults,
  publicPositiveDocumentResult
});
