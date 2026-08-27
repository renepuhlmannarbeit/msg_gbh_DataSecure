'use strict';

const { createSuite } = require('./helpers');
const {
  projectBatchResults,
  publicPositiveDocumentResult
} = require('../plugins/data-secure/server/gateway/batch-result-projection');
const {
  releasedDocumentResult,
  notProcessedDocumentResult,
  OMISSION_CODES
} = require('../plugins/data-secure/server/gateway/document-result-grade');

const { test, done, assert } = createSuite('Batch result projection');
const complete = releasedDocumentResult({ parserWarnings: [], visualResults: [] });
const omitted = releasedDocumentResult({
  parserWarnings: [],
  visualResults: [{ status: 'removed' }, { status: 'review_required' }],
  imagesRemovedByExplicitRequest: 1,
  visualAssetsWithheldAtRelease: 1
});
const stopped = notProcessedDocumentResult('RESIDUAL_PII');

function verified(item) {
  return { state: 'verified', document_result: item.document_result };
}

test('a mixed terminal V2 batch projects the three exact grades and two allowed omissions', () => {
  const projected = projectBatchResults({
    schema: 'datasecure-batch/2',
    items: [
      { status: 'released', package_id: `ds_${'a'.repeat(32)}`, document_result: complete },
      { status: 'released', package_id: `ds_${'b'.repeat(32)}`, document_result: omitted },
      { status: 'stopped', local_mapping_exported: true, error_code: 'RESIDUAL_PII', document_result: stopped }
    ]
  }, { verifyPositive: verified });
  assert.deepStrictEqual(projected, {
    grade_counts: { complete: 1, usable_with_omissions: 1, not_processed: 1, unavailable: 0 },
    omission_counts: { images_removed_by_request: 1, visual_assets_withheld_locally: 1 },
    grades_verified: true
  });
});

test('open checkpoints and legacy batches never receive an invented grade', () => {
  const open = projectBatchResults({
    schema: 'datasecure-batch/2',
    items: [
      { status: 'mapping_pending', document_result: complete },
      { status: 'delivery_pending', document_result: omitted },
      { status: 'preflight_mapping_pending', document_result: stopped },
      { status: 'pending' }
    ]
  }, { verifyPositive: verified });
  assert.deepStrictEqual(open.grade_counts, { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: 4 });
  const legacy = projectBatchResults({ schema: 'datasecure-batch/1', items: [{ status: 'released' }, { status: 'stopped' }] });
  assert.deepStrictEqual(legacy.grade_counts, { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: 2 });
  assert.strictEqual(legacy.grades_verified, false);
});

test('a package mismatch or invalid stopped reason fails closed for the entire projection', () => {
  const mismatch = projectBatchResults({
    schema: 'datasecure-batch/2',
    items: [{ status: 'released', package_id: `ds_${'a'.repeat(32)}`, document_result: complete }]
  }, { verifyPositive: () => ({ state: 'verified', document_result: omitted }) });
  assert.deepStrictEqual(mismatch.grade_counts, { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: 1 });
  assert.strictEqual(mismatch.grades_verified, false);

  const reasonMismatch = projectBatchResults({
    schema: 'datasecure-batch/2',
    items: [{ status: 'stopped', local_mapping_exported: true, error_code: 'PARSE_FAILED', document_result: stopped }]
  });
  assert.deepStrictEqual(reasonMismatch.grade_counts, { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: 1 });
});

test('the Cowork document projection is positive, localized and contains no reason or identifier', () => {
  const value = publicPositiveDocumentResult(omitted);
  assert.deepStrictEqual(value, {
    grade: 'usable-with-omissions',
    label: 'Verwendbar mit Auslassungen',
    omissions: [
      { code: OMISSION_CODES.IMAGES_REMOVED_BY_REQUEST, label: 'Bilder auf Wunsch entfernt', count: 1 },
      { code: OMISSION_CODES.VISUAL_ASSETS_WITHHELD_LOCALLY, label: 'Grafiken ausschließlich lokal zurückgehalten', count: 1 }
    ]
  });
  assert.doesNotMatch(JSON.stringify(value), /reason|package|token|path|filename|RESIDUAL_PII/iu);
  assert.throws(() => publicPositiveDocumentResult(stopped), /Ungültiger/);
});

done();
