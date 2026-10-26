'use strict';

const { SafeError } = require('../runtime');
const { RESOURCE_LIMITS: LIMITS } = require('../resource-limits');
const { RESOURCE_LIMITS } = require('../resource-limits');

function exactCountKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validateSummary(summary) {
  const selected = summary?.selected_count;
  const released = summary?.released_count;
  const failed = summary?.failed_count;
  if (![selected, released, failed].every(Number.isSafeInteger) ||
      selected < 1 || selected > LIMITS.MAX_BATCH_FILES || released < 0 || failed < 0 ||
      released + failed !== selected) {
    throw new SafeError('Ungültige lokale Abschlusszusammenfassung.');
  }
  const gradeInput = summary?.result_grade_counts;
  const omissionInput = summary?.result_omission_counts;
  if (gradeInput === undefined && omissionInput === undefined) {
    return {
      selected, released, failed,
      gradeCounts: { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: selected },
      omissionCounts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
      gradesVerified: false
    };
  }
  const gradeCounts = exactCountKeys(gradeInput, ['complete', 'not_processed', 'unavailable', 'usable_with_omissions']) ? gradeInput : null;
  const omissionCounts = exactCountKeys(omissionInput, ['images_removed_by_request', 'visual_assets_withheld_locally']) ? omissionInput : null;
  const maximumOmissions = selected * RESOURCE_LIMITS.MAX_VISUAL_ASSETS;
  if (!gradeCounts || !omissionCounts || !Object.values(gradeCounts).every((value) => Number.isSafeInteger(value) && value >= 0) ||
      !Object.values(omissionCounts).every((value) => Number.isSafeInteger(value) && value >= 0 && value <= maximumOmissions) ||
      gradeCounts.complete + gradeCounts.usable_with_omissions + gradeCounts.not_processed + gradeCounts.unavailable !== selected) {
    throw new SafeError('Ungültige lokale Abschlusszusammenfassung.');
  }
  const gradesVerified = summary.result_grades_verified === true;
  const validCrossProduct = gradesVerified
    ? gradeCounts.unavailable === 0 && gradeCounts.complete + gradeCounts.usable_with_omissions === released && gradeCounts.not_processed === failed
    : gradeCounts.unavailable === selected && gradeCounts.complete === 0 && gradeCounts.usable_with_omissions === 0 && gradeCounts.not_processed === 0 &&
      omissionCounts.images_removed_by_request === 0 && omissionCounts.visual_assets_withheld_locally === 0;
  if (!validCrossProduct) throw new SafeError('Ungültige lokale Abschlusszusammenfassung.');
  return { selected, released, failed, gradeCounts: { ...gradeCounts }, omissionCounts: { ...omissionCounts }, gradesVerified };
}

module.exports = Object.freeze({ validateSummary });
