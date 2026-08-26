'use strict';

const { createSuite } = require('./helpers');
const {
  GRADES,
  OMISSION_CODES,
  validateDocumentResult,
  releasedDocumentResult,
  notProcessedDocumentResult,
  validateManifestDocumentResult
} = require('../plugins/data-secure/server/gateway/document-result-grade');

const { test, done, assert } = createSuite('DS-045 document result grades');

function manifest(overrides = {}) {
  const assets = overrides.assets || [];
  const removed = assets.filter((asset) => asset.status === 'removed').length;
  const base = {
    schema: 'eu-privacy-package/3',
    parser_warnings: [],
    assets,
    pdf_unextractable_visual_objects: 0,
    images_removed_by_explicit_request: removed,
    visual_assets_withheld_at_release: assets.filter((asset) => asset.status === 'review_required').length
  };
  const value = { ...base, ...overrides };
  value.document_result = overrides.document_result || releasedDocumentResult({
    parserWarnings: value.parser_warnings,
    visualResults: value.assets,
    unreviewedVisualCount: value.pdf_unextractable_visual_objects,
    imagesRemovedByExplicitRequest: value.images_removed_by_explicit_request
  });
  return value;
}

test('a fully covered released document has exactly the complete grade', () => {
  const result = releasedDocumentResult({
    parserWarnings: [], visualResults: [{ status: 'included' }],
    unreviewedVisualCount: 0, imagesRemovedByExplicitRequest: 0
  });
  assert.deepStrictEqual(result, {
    schema: 'datasecure-document-result/1', grade: GRADES.COMPLETE, omissions: [], reason_code: null
  });
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.omissions));
});

test('only explicitly removed or locally withheld visuals create the middle grade', () => {
  const result = releasedDocumentResult({
    parserWarnings: [],
    visualResults: [{ status: 'review_required' }, { status: 'removed' }, { status: 'included' }],
    unreviewedVisualCount: 0,
    imagesRemovedByExplicitRequest: 1
  });
  assert.strictEqual(result.grade, GRADES.USABLE_WITH_OMISSIONS);
  assert.deepStrictEqual(result.omissions, [
    { code: OMISSION_CODES.IMAGES_REMOVED_BY_REQUEST, count: 1 },
    { code: OMISSION_CODES.VISUAL_ASSETS_WITHHELD_LOCALLY, count: 1 }
  ]);
});

test('parser uncertainty, unreviewed visuals and contradictory removal counts fail closed', () => {
  const base = { parserWarnings: [], visualResults: [], unreviewedVisualCount: 0, imagesRemovedByExplicitRequest: 0 };
  for (const changed of [
    { parserWarnings: ['unknown'] },
    { unreviewedVisualCount: 1 },
    { visualResults: [{ status: 'removed' }], imagesRemovedByExplicitRequest: 0 },
    { visualResults: [{ status: 'unknown' }] }
  ]) assert.throws(() => releasedDocumentResult({ ...base, ...changed }), /klassifizierbar|Ungültiger/);
});

test('not-processed requires one fixed reason and never carries omissions', () => {
  assert.deepStrictEqual(notProcessedDocumentResult('SOURCE_ENCRYPTED_UNSUPPORTED'), {
    schema: 'datasecure-document-result/1', grade: GRADES.NOT_PROCESSED,
    omissions: [], reason_code: 'SOURCE_ENCRYPTED_UNSUPPORTED'
  });
  for (const reason of ['', '../secret', 'freie Ursache']) {
    assert.throws(() => notProcessedDocumentResult(reason), /Ungültiger/);
  }
});

test('unknown grades, omissions, duplicate codes and inconsistent combinations are rejected', () => {
  const base = { schema: 'datasecure-document-result/1', grade: GRADES.COMPLETE, omissions: [], reason_code: null };
  validateDocumentResult(base);
  for (const changed of [
    { grade: 'released' },
    { grade: GRADES.USABLE_WITH_OMISSIONS },
    { omissions: [{ code: 'UNKNOWN', count: 1 }], grade: GRADES.USABLE_WITH_OMISSIONS },
    { omissions: [
      { code: OMISSION_CODES.IMAGES_REMOVED_BY_REQUEST, count: 1 },
      { code: OMISSION_CODES.IMAGES_REMOVED_BY_REQUEST, count: 1 }
    ], grade: GRADES.USABLE_WITH_OMISSIONS },
    { reason_code: 'SOURCE_READ_FAILED' }
  ]) assert.throws(() => validateDocumentResult({ ...base, ...changed }), /Ungültiger/);
});

test('manifest validation binds the stored grade to the exact allowlisted signals', () => {
  const value = manifest({ assets: [{ status: 'review_required' }] });
  assert.strictEqual(validateManifestDocumentResult(value).grade, GRADES.USABLE_WITH_OMISSIONS);
  assert.throws(() => validateManifestDocumentResult({ ...value, parser_warnings: ['unsafe'] }), /klassifizierbar/);
  assert.throws(() => validateManifestDocumentResult({
    ...value,
    document_result: { ...value.document_result, grade: GRADES.COMPLETE, omissions: [] }
  }), /Ungültiger/);
  assert.throws(() => validateManifestDocumentResult({ ...value, schema: 'eu-privacy-package/2' }), /Ungültiger/);
});

done();
