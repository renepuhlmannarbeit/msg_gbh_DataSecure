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

function access(journal, published, grant = {
  read_capability: 'c'.repeat(43), read_capability_expires_at: 'later'
}) {
  let issued = 0;
  let fullChecks = 0;
  let identityChecks = 0;
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
    publishedPackageRecord: () => { fullChecks++; return published; },
    publishedPackageIdentityRecord: () => { identityChecks++; return published; },
    sameDocumentResult: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    issueReadCapability: () => {
      issued++;
      return grant;
    }
  });
  return { api, issued: () => issued, fullChecks: () => fullChecks, identityChecks: () => identityChecks };
}

test('modern identity-bound listing avoids the synchronous full hash before asynchronous handoff verification', () => {
  const journal = state('datasecure-batch/4', complete);
  journal.product_channel = 'plugin';
  journal.items[0].package_identity = { manifest: {}, document: {} };
  const fixture = access(journal, { state: 'verified', document_result: complete });
  assert.strictEqual(fixture.api.listBatchResults(token).results.length, 1);
  assert.strictEqual(fixture.identityChecks(), 1, 'the durable identity is checked once');
  assert.strictEqual(fixture.fullChecks(), 0, 'listing must not synchronously hash the Markdown');
  assert.strictEqual(fixture.issued(), 1);
});

test('legacy or unbound listing retains the synchronous full integrity verifier', () => {
  const fixture = access(state('datasecure-batch/2', complete), { state: 'verified', document_result: complete });
  assert.strictEqual(fixture.api.listBatchResults(token).results.length, 1);
  assert.strictEqual(fixture.fullChecks(), 1);
  assert.strictEqual(fixture.identityChecks(), 0);
});

test('matching V2 journal and verified V3 package issue exactly one capability', () => {
  const fixture = access(state('datasecure-batch/2', complete), { state: 'verified', document_result: complete });
  const results = fixture.api.listBatchResults(token).results;
  assert.strictEqual(results.length, 1);
  assert.deepStrictEqual(results[0].document_result, { grade: 'complete', label: 'Vollständig verarbeitet', omissions: [] });
  assert.strictEqual(fixture.issued(), 1);
});

test('Cowork result listing keeps source extraction and Markdown privacy status separate', () => {
  const journal = state('datasecure-batch/4', complete);
  journal.product_channel = 'plugin';
  journal.items[0].package_identity = { manifest: {}, document: {} };
  const coverage = { status: 'incomplete', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] };
  const fixture = access(journal, { state: 'verified', document_result: complete }, {
    read_capability: 'c'.repeat(43), read_capability_expires_at: 'later',
    privacy_scope: 'extracted-markdown-only', source_extraction_coverage: coverage
  });
  const [result] = fixture.api.listBatchResults(token).results;
  assert.deepStrictEqual(result.document_result,
    { grade: 'complete', label: 'Vollständig verarbeitet', omissions: [] });
  assert.strictEqual(result.privacy_scope, 'extracted-markdown-only');
  assert.deepStrictEqual(result.source_extraction_coverage, coverage);
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

test('result paging does not advertise an empty page containing only stopped or acknowledged items', () => {
  const journal = state('datasecure-batch/2', complete);
  journal.items = Array.from({ length: 5 }, () => ({
    status: 'released', package_id: packageId, analysis_acknowledged: false, document_result: complete
  }));
  journal.items.push({ status: 'stopped' });
  journal.items.push({ status: 'released', package_id: packageId, analysis_acknowledged: true, document_result: complete });
  const fixture = access(journal, { state: 'verified', document_result: complete });
  const page = fixture.api.listBatchResults(token, { limit: 5 });
  assert.strictEqual(page.results.length, 5);
  assert.strictEqual(page.next_cursor, null);
  assert.strictEqual(fixture.issued(), 5);
});

test('pre-channel v4 plugin journals remain readable after the Standalone split', () => {
  const journal = state('datasecure-batch/4', complete);
  const fixture = access(journal, { state: 'verified', document_result: complete });
  assert.strictEqual(fixture.api.listBatchResults(token).results.length, 1);
  assert.strictEqual(fixture.issued(), 1);
});

test('Standalone batches are never readable or discoverable through the Claude handoff facade', () => {
  const journal = state('datasecure-batch/4', complete);
  journal.product_channel = 'standalone';
  const fixture = access(journal, { state: 'verified', document_result: complete });
  assert.throws(() => fixture.api.listBatchResults(token), /gehört nicht zum Claude-Plugin/u);
  assert.strictEqual(fixture.issued(), 0);

  const api = createBatchResultAccess({
    SafeError: Error,
    fs: { readdirSync: () => [{ isFile: () => true, name: `${token}.json` }] },
    tokenPattern: /^[a-f0-9]{64}$/u,
    batchRoot: () => '.',
    readStateForMaintenance: () => journal,
    publicProgress: () => ({ complete: true }),
    liveLocalExecutor: () => false,
    publishedPackageRecord: () => ({ state: 'verified', document_result: complete }),
    sameDocumentResult: () => true,
    issueReadCapability: () => { throw new Error('must not issue'); }
  });
  assert.deepStrictEqual(api.completedLocalOnlyCandidates(), []);
});

done();
