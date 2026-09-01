'use strict';

// Production result discovery, progress/evidence projection, paging and handoff
// are composed here. Only package IO and the durable journal are in-memory fakes.
const { createSuite } = require('./helpers');
const { createBatchResultAccess } = require('../plugins/data-secure/server/gateway/batch-results');
const { createBatchProgress } = require('../plugins/data-secure/server/gateway/batch-progress');
const { createLocalOnlyHandoff } = require('../plugins/data-secure/server/gateway/local-only-handoff');
const { evidenceRecord } = require('../plugins/data-secure/server/gateway/batch-evidence');
const { releasedDocumentResult, notProcessedDocumentResult, sameDocumentResult } = require('../plugins/data-secure/server/gateway/document-result-grade');
const { SafeError } = require('../plugins/data-secure/server/runtime');
const { testAsync, assert, done } = createSuite('Integrated local handoff resume');

const complete = releasedDocumentResult({ parserWarnings: [], visualResults: [] });
const omitted = releasedDocumentResult({
  parserWarnings: [], visualResults: [{ status: 'removed' }, { status: 'review_required' }],
  imagesRemovedByExplicitRequest: 1, visualAssetsWithheldAtRelease: 1
});

function fixture(count, { schema = 'datasecure-batch/4', mixed = false } = {}) {
  const token = 'a'.repeat(64);
  const journal = {
    schema, token, profile: 'general', remove_images: false,
    created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    items: Array.from({ length: count }, (_, index) => ({
      id: (index + 1).toString(16).padStart(32, '0'),
      package_id: `ds_${(index + 1).toString(16).padStart(32, '0')}`,
      status: 'released', analysis_acknowledged: false,
      ...(schema === 'datasecure-batch/1' ? {} : { document_result: mixed && index % 2 === 0 ? omitted : complete })
    }))
  };
  const released = journal.items.slice();
  if (mixed) journal.items.splice(2, 0, {
    status: 'stopped', error_code: 'SOURCE_ENCRYPTED_UNSUPPORTED', local_mapping_exported: true,
    document_result: notProcessedDocumentResult('SOURCE_ENCRYPTED_UNSUPPORTED')
  });
  const packages = new Map(released.map(item => [item.package_id, {
    state: 'verified', document_result: item.document_result ?? null
  }]));
  const reads = [];
  let packageChecks = 0;
  const publishedPackageRecord = id => { packageChecks++; return packages.get(id); };
  const { publicProgress } = createBatchProgress({
    deliveryPendingStatus: 'delivery_pending', deferredReviewStatus: 'deferred_review', mappingPendingStatus: 'mapping_pending',
    liveLocalExecutor: () => false, publishedPackageRecord: item => packages.get(item.package_id)
  });
  const api = createBatchResultAccess({
    SafeError, fs: { readdirSync: () => [{ name: `${token}.json`, isFile: () => true }] },
    tokenPattern: /^[a-f0-9]{64}$/u, batchRoot: () => 'synthetic',
    readState: id => { assert.strictEqual(id, token); return journal; },
    readStateForMaintenance: id => { assert.strictEqual(id, token); return journal; },
    publicProgress, liveLocalExecutor: () => false, publishedPackageRecord, sameDocumentResult,
    issueReadCapability: () => ({ read_capability: 'c'.repeat(43), read_capability_expires_at: journal.expires_at })
  });
  let clock = 0;
  const makeHandoff = () => createLocalOnlyHandoff({
    now: () => clock,
    completedLocalOnlyCandidates: api.completedLocalOnlyCandidates, listBatchResults: api.listBatchResults,
    pickCompletedBatch: () => assert.fail('a single batch must not open a dialog'),
    readOutputs: entries => ({ documents: entries.map(entry => {
      const item = released.find(value => value.package_id === entry.package_id);
      assert.ok(item && !item.analysis_acknowledged, 'never reread an acknowledged result');
      reads.push(item.package_id);
      const text = `Result ${released.indexOf(item) + 1}`;
      return { package_id: item.package_id, text, next_offset: text.length, has_more: false };
    }) }),
    acknowledgeDeliveredPackages: (id, ids) => {
      assert.strictEqual(id, token);
      for (const packageId of ids) {
        const item = released.find(value => value.package_id === packageId);
        assert.strictEqual(item.analysis_acknowledged, false, 'acknowledge each result only once');
        item.analysis_acknowledged = true;
      }
    }
  });
  return {
    journal, released, packages, api, reads, publicProgress, makeHandoff,
    expire: () => { clock += 16 * 60 * 1000; }, packageChecks: () => packageChecks,
    exportEvidence() {
      const record = evidenceRecord(journal, journal.completed_at, 'b'.repeat(32), { publishedPackageRecord });
      journal.terminal_evidence = { schema: 'datasecure-batch-terminal-evidence/2', status: 'exported', receipt_id: record.receipt_id, record };
    }
  };
}

async function main() {
  for (const count of [1, 6, 11, 100]) for (const interruption of ['cancel', 'expiry', 'restart']) {
    await testAsync(`${count} results: ${interruption} resumes only unacknowledged results`, async () => {
      const f = fixture(count);
      f.exportEvidence();
      const evidenceBefore = JSON.stringify(f.journal.terminal_evidence);
      let handoff = f.makeHandoff();
      assert.strictEqual((await handoff.start()).documents.length, Math.min(5, count));
      if (count > 5) handoff.next(); // commits page one, but not page two
      const acknowledged = count > 5 ? 5 : 0;
      if (interruption === 'cancel') handoff.cancel();
      if (interruption === 'expiry') {
        f.expire();
        assert.strictEqual(handoff.next().error, 'local_handoff_expired');
      }
      if (interruption === 'restart') {
        // Drop all process-local state; only the fake persisted journal survives.
        handoff.cancel();
        handoff = f.makeHandoff();
      }
      assert.strictEqual(f.released.filter(item => item.analysis_acknowledged).length, acknowledged);
      const checksBefore = f.packageChecks();
      const [candidate] = f.api.completedLocalOnlyCandidates();
      assert.strictEqual(f.packageChecks() - checksBefore, count - acknowledged, 'projection adds no second package hash pass');
      assert.strictEqual(candidate.released, count - acknowledged);
      assert.deepStrictEqual(candidate.grade_counts, { complete: count - acknowledged, usable_with_omissions: 0, not_processed: 0, unavailable: 0 });
      const restartReads = f.reads.length;
      let page = await handoff.start();
      assert.strictEqual(page.batch_result_summary.grade_counts.complete, count - acknowledged);
      for (let calls = 0; page.more && calls < 25; calls++) page = handoff.next();
      assert.strictEqual(page.more, false, 'bounded paging must finish');
      handoff.next(); // commit the terminal page
      assert.deepStrictEqual(f.reads.slice(restartReads), f.released.slice(acknowledged).map(item => item.package_id));
      assert.ok(f.released.every(item => item.analysis_acknowledged));
      assert.deepStrictEqual(f.api.completedLocalOnlyCandidates(), []);
      assert.strictEqual(f.publicProgress(f.journal).result_grade_counts.complete, count, 'full-batch overview remains unchanged');
      assert.strictEqual(JSON.stringify(f.journal.terminal_evidence), evidenceBefore, 'terminal evidence is not rewritten');
    });
  }

  for (const schema of ['datasecure-batch/2', 'datasecure-batch/4']) await testAsync(`${schema}: mixed grades retain stopped count and only remaining omissions`, async () => {
    const f = fixture(7, { schema, mixed: true });
    f.exportEvidence();
    const before = f.publicProgress(f.journal);
    const handoff = f.makeHandoff();
    await handoff.start();
    handoff.next();
    handoff.cancel();
    const checksBefore = f.packageChecks();
    const [candidate] = f.api.completedLocalOnlyCandidates();
    assert.strictEqual(f.packageChecks() - checksBefore, schema === 'datasecure-batch/2' ? 0 : 2, 'reuse already-verified grades without extra package reads');
    assert.strictEqual(candidate.released, 2);
    assert.strictEqual(candidate.stopped, 1);
    assert.deepStrictEqual(candidate.grade_counts, { complete: 1, usable_with_omissions: 1, not_processed: 1, unavailable: 0 });
    assert.deepStrictEqual(candidate.omission_counts, { images_removed_by_request: 1, visual_assets_withheld_locally: 1 });
    const result = await handoff.start();
    assert.strictEqual(result.documents.length, 2);
    assert.strictEqual(result.batch_result_summary.grades_verified, true);
    handoff.next();
    assert.deepStrictEqual(f.publicProgress(f.journal).result_grade_counts, before.result_grade_counts);
    assert.deepStrictEqual(f.publicProgress(f.journal).result_omission_counts, before.result_omission_counts);
  });

  await testAsync('legacy grade-free batch resumes without inventing verified grades', async () => {
    const f = fixture(6, { schema: 'datasecure-batch/1' });
    const handoff = f.makeHandoff();
    await handoff.start();
    handoff.next();
    handoff.cancel();
    const page = await handoff.start();
    assert.strictEqual(page.documents.length, 1);
    assert.strictEqual(page.documents[0].document_result, null);
    assert.deepStrictEqual(page.batch_result_summary.grade_counts, { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: 1 });
    assert.strictEqual(page.batch_result_summary.grades_verified, false);
    handoff.next();
  });

  for (const schema of ['datasecure-batch/2', 'datasecure-batch/4']) await testAsync(`${schema}: invalid full-batch evidence is never promoted by remainder projection`, async () => {
    const f = fixture(6, { schema });
    f.exportEvidence();
    f.released.slice(0, 5).forEach(item => { item.analysis_acknowledged = true; });
    // Still valid as an evidence record, but no longer matches the full journal.
    f.journal.terminal_evidence.record.grade_counts.complete--;
    f.journal.terminal_evidence.record.grade_counts.usable_with_omissions++;
    f.journal.terminal_evidence.record.omission_counts.images_removed_by_request = 1;
    assert.strictEqual(f.publicProgress(f.journal).result_grades_verified, false);
    const candidates = f.api.completedLocalOnlyCandidates();
    if (schema === 'datasecure-batch/2') assert.deepStrictEqual(candidates, []);
    else {
      assert.strictEqual(candidates[0].grades_verified, false);
      assert.deepStrictEqual(candidates[0].grade_counts, { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: 1 });
      assert.deepStrictEqual(candidates[0].omission_counts, { images_removed_by_request: 0, visual_assets_withheld_locally: 0 });
    }
  });

  await testAsync('mismatched remaining package is never exposed as a candidate', async () => {
    const f = fixture(6);
    f.released.slice(0, 5).forEach(item => { item.analysis_acknowledged = true; });
    f.packages.set(f.released[5].package_id, { state: 'verified', document_result: omitted });
    assert.deepStrictEqual(f.api.completedLocalOnlyCandidates(), []);
    assert.strictEqual((await f.makeHandoff().start()).error, 'no_completed_local_batch');
    assert.strictEqual(f.reads.length, 0);
  });

  for (const schema of ['datasecure-batch/2', 'datasecure-batch/4']) await testAsync(`${schema}: damaged acknowledged package cannot produce verified remainder grades`, async () => {
    const f = fixture(6, { schema });
    f.exportEvidence();
    f.released.slice(0, 5).forEach(item => { item.analysis_acknowledged = true; });
    f.packages.set(f.released[0].package_id, { state: 'unsafe', document_result: null });
    assert.strictEqual(f.publicProgress(f.journal).result_grades_verified, false);
    const candidates = f.api.completedLocalOnlyCandidates();
    if (schema === 'datasecure-batch/2') assert.deepStrictEqual(candidates, []);
    else {
      // V4 preserves its existing per-package fallback, but never claims the
      // damaged full batch has verified grades just because the remainder does.
      assert.strictEqual(candidates[0].grades_verified, false);
      const handoff = f.makeHandoff();
      const page = await handoff.start();
      assert.strictEqual(page.documents.length, 1);
      assert.strictEqual(page.batch_result_summary.grades_verified, false);
      assert.strictEqual(page.batch_result_summary.grade_counts.unavailable, 1);
      handoff.next();
    }
  });
  done();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
