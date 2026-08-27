'use strict';

const { createSuite } = require('./helpers');
const { createBatchResultAccess } = require('../plugins/data-secure/server/gateway/batch-results');
const { releasedDocumentResult } = require('../plugins/data-secure/server/gateway/document-result-grade');

const { test, done, assert } = createSuite('Batch result package binding');
const token = 'a'.repeat(64);
const packageId = `ds_${'b'.repeat(32)}`;
const complete = releasedDocumentResult({ parserWarnings: [], visualResults: [] });
const omitted = releasedDocumentResult({
  parserWarnings: [], visualResults: [{ status: 'review_required' }], visualAssetsWithheldAtRelease: 1
});

function state(schema, documentResult, includeResult = true) {
  const item = { status: 'released', package_id: packageId, analysis_acknowledged: false };
  if (includeResult) item.document_result = documentResult;
  return {
    schema,
    token,
    items: [item],
    expires_at: new Date(Date.now() + 60_000).toISOString()
  };
}

function access(journal, published) {
  let issued = 0;
  const api = createBatchResultAccess({
    SafeError: Error,
    fs: { readdirSync: () => [] },
    tokenPattern: /^[a-f0-9]{64}$/u,
    batchRoot: () => '.',
    readState: () => journal,
    readStateForMaintenance: () => journal,
    publicProgress: () => ({ remaining: 0, processing: 0, retryable: 0, deferred_review: 0,
      mapping_pending: 0, delivery_pending: 0, stopped: 0, complete: true }),
    liveLocalExecutor: () => false,
    publishedPackageRecord: () => published,
    sameDocumentResult: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    issueReadCapability: () => {
      issued++;
      return { read_capability: 'c'.repeat(43), read_capability_expires_at: 'later' };
    }
  });
  return { api, issued: () => issued };
}

test('matching V2 journal and verified V3 package issue exactly one capability', () => {
  const fixture = access(state('datasecure-batch/2', complete), { state: 'verified', document_result: complete });
  const results = fixture.api.listBatchResults(token).results;
  assert.strictEqual(results.length, 1);
  assert.deepStrictEqual(results[0].document_result, { grade: 'complete', label: 'Vollständig verarbeitet', omissions: [] });
  assert.strictEqual(fixture.issued(), 1);
});

for (const [name, journal, published] of [
  ['journal complete versus package omissions', state('datasecure-batch/2', complete), { state: 'verified', document_result: omitted }],
  ['journal omissions versus package complete', state('datasecure-batch/2', omitted), { state: 'verified', document_result: complete }],
  ['V2 journal grade missing from package', state('datasecure-batch/2', complete), { state: 'verified', document_result: null }],
  ['V2 package grade missing from journal', state('datasecure-batch/2', null, false), { state: 'verified', document_result: complete }]
]) {
  test(`${name} fails before issuing a capability`, () => {
    const fixture = access(journal, published);
    assert.throws(() => fixture.api.listBatchResults(token), /nicht sicher verifiziert/u);
    assert.strictEqual(fixture.issued(), 0);
  });
}

test('legacy V1 journal may read only a verified grade-free V2 package', () => {
  const allowed = access(state('datasecure-batch/1', null, false), { state: 'verified', document_result: null });
  const results = allowed.api.listBatchResults(token).results;
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].document_result, null);
  assert.strictEqual(allowed.issued(), 1);
  const invented = access(state('datasecure-batch/1', null, false), { state: 'verified', document_result: complete });
  assert.throws(() => invented.api.listBatchResults(token), /nicht sicher verifiziert/u);
  assert.strictEqual(invented.issued(), 0);
});

test('Cowork handoff candidates require the identity-bound terminal projection', () => {
  const journal = state('datasecure-batch/2', complete);
  const progress = (verified) => ({
    remaining: 0, processing: 0, retryable: 0, deferred_review: 0,
    mapping_pending: 0, delivery_pending: 0, stopped: 0, complete: true,
    result_grade_counts: verified
      ? { complete: 1, usable_with_omissions: 0, not_processed: 0, unavailable: 0 }
      : { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: 1 },
    result_omission_counts: { images_removed_by_request: 0, visual_assets_withheld_locally: 0 },
    result_grades_verified: verified
  });
  const candidates = (verified) => createBatchResultAccess({
    SafeError: Error,
    fs: { readdirSync: () => [{ isFile: () => true, name: `${token}.json` }] },
    tokenPattern: /^[a-f0-9]{64}$/u,
    batchRoot: () => '.',
    readState: () => journal,
    readStateForMaintenance: () => journal,
    publicProgress: () => progress(verified),
    liveLocalExecutor: () => false,
    publishedPackageRecord: () => ({ state: 'verified', document_result: complete }),
    sameDocumentResult: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    issueReadCapability: () => ({ read_capability: 'c'.repeat(43), read_capability_expires_at: 'later' })
  }).completedLocalOnlyCandidates();
  assert.deepStrictEqual(candidates(false), []);
  assert.strictEqual(candidates(true).length, 1);
  assert.strictEqual(candidates(true)[0].grades_verified, true);
});

done();
