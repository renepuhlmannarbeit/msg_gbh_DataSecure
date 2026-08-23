'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-batch-'));
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
process.env.LOCALAPPDATA = path.join(base, 'localapp');
const { roots, privacyRoot, storageStatus } = require('../plugins/data-secure/server/gateway/common');
const { beginBatch, processBatchNext, reviewDeferredBatch, resumeBatch, continueMostRecentBatch, recoverableBatchStatus, localCleanupStatus, acknowledgeDeliveredPackage, recoverBatches, cleanupExpiredBatchSnapshots, _test } = require('../plugins/data-secure/server/gateway/batch');
const { csvField } = require('../plugins/data-secure/server/gateway/mapping');
const { evidencePath, SCHEMA, validateEvidenceRecord } = require('../plugins/data-secure/server/gateway/batch-evidence');
const { zipStore } = require('./lib/zip');

const { testAsync, done, assert } = createSuite('Server-bound batch session');

function resetInput() {
  const input = roots().input;
  for (const entry of fs.readdirSync(input)) fs.rmSync(path.join(input, entry), { recursive: true, force: true });
  return input;
}

function add(name, text) {
  const target = path.join(roots().input, name);
  fs.writeFileSync(target, text, 'utf8');
  return target;
}

function ordered(name, text, index) {
  const target = add(name, text);
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index));
  fs.utimesSync(target, timestamp, timestamp);
  return target;
}

const deps = {
  convertDocument: async (source) => ({
    markdown: fs.readFileSync(source, 'utf8'),
    attachments: [], warnings: [], unreviewedVisualCount: 0, requiresExplicitProfile: false
  })
};

async function processAndAcknowledge(token, options = deps) {
  const result = await processBatchNext(token, options);
  if (!result.ok || typeof result.package_id !== 'string') return result;
  const acknowledgement = acknowledgeDeliveredPackage(token, result.package_id);
  return { ...result, ...acknowledgement, package_id: result.package_id, read_capability: result.read_capability };
}

async function main() {
  await testAsync('count mismatch cannot create a batch token', async () => {
    resetInput(); add('one.txt', 'Kunde: Max Mustermann');
    const result = beginBatch({ expectedCount: 2, profile: 'customer' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'input_count_changed');
    assert.ok(!result.batch_token);
  });

  await testAsync('batch boundaries accept 100 files but reject 101 files and more than 500 MB before hashing', async () => {
    resetInput();
    for (let index = 1; index <= 100; index++) add(`${index}.txt`, `Dokument ${index}`);
    const accepted = beginBatch({ expectedCount: 100, profile: 'general' });
    assert.strictEqual(accepted.ok, true);
    assert.throws(() => beginBatch({ expectedCount: 101, profile: 'general' }), /1 und 100/);

    resetInput();
    const firstLarge = add('first-large.txt', 'x');
    const secondLarge = add('second-large.txt', 'x');
    fs.truncateSync(firstLarge, 300 * 1024 * 1024);
    fs.truncateSync(secondLarge, 300 * 1024 * 1024);
    assert.throws(() => beginBatch({ expectedCount: 2, profile: 'general' }), /größer als 500 MB/);
  });

  await testAsync('insufficient free local storage refuses the whole batch before copying a source', async () => {
    resetInput();
    const source = add('capacity.txt', 'Kunde: Max Mustermann');
    assert.throws(() => beginBatch({
      expectedCount: 1,
      profile: 'customer',
      statfs: () => ({ bavail: 1, bsize: 1 })
    }), /nicht genug lokaler Speicher/i);
    assert.strictEqual(fs.readFileSync(source, 'utf8'), 'Kunde: Max Mustermann');
  });

  await testAsync('untrustworthy filesystem capacity metadata fails closed before a private snapshot', async () => {
    resetInput();
    const source = add('capacity-metadata.txt', 'Kunde: Max Mustermann');
    const before = fs.readdirSync(_test.batchRoot()).filter((name) => /\.(?:work|json)$/u.test(name)).sort();
    for (const statfs of [
      () => undefined,
      () => ({ bavail: Number.NaN, bsize: 4096 }),
      () => ({ bavail: -1, bsize: -(128 * 1024 * 1024) }),
      () => ({ bavail: 1000, bsize: 0 }),
      () => ({ bavail: Number.MAX_SAFE_INTEGER, bsize: 2 })
    ]) {
      assert.throws(() => beginBatch({ expectedCount: 1, profile: 'customer', statfs }), /freie lokale Speicher.*nicht sicher/i);
      assert.strictEqual(fs.readFileSync(source, 'utf8'), 'Kunde: Max Mustermann');
      assert.deepStrictEqual(fs.readdirSync(_test.batchRoot()).filter((name) => /\.(?:work|json)$/u.test(name)).sort(), before);
    }
  });

  await testAsync('unsafe DOCX directory metadata is refused before a private batch copy is created', async () => {
    resetInput();
    const existingWorkDirectories = fs.readdirSync(_test.batchRoot()).filter((name) => name.endsWith('.work')).sort();
    const source = path.join(roots().input, 'unsafe-container.docx');
    const archive = Buffer.from(zipStore([['word/document.xml', '<w:document/>']]));
    const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    assert.ok(central >= 0);
    archive.writeUInt32LE(301 * 1024 * 1024, central + 24);
    fs.writeFileSync(source, archive);
    assert.throws(() => beginBatch({ expectedCount: 1, profile: 'general' }), /Office-Container/i);
    assert.strictEqual(fs.readFileSync(source).equals(archive), true);
    assert.deepStrictEqual(fs.readdirSync(_test.batchRoot()).filter((name) => name.endsWith('.work')).sort(), existingWorkDirectories);
  });

  await testAsync('local mapping CSV neutralizes spreadsheet formulas', async () => {
    assert.strictEqual(csvField('=HYPERLINK("https://example.invalid")'), `"'=HYPERLINK(""https://example.invalid"")"`);
    assert.strictEqual(csvField('normal.txt'), '"normal.txt"');
  });

  await testAsync('terminal batch evidence is local, aggregate-only and free of document identifiers', async () => {
    resetInput();
    try { fs.unlinkSync(evidencePath()); } catch { /* test starts without a receipt */ }
    add('Alice-Example-Internal-Document.txt', 'Kunde: Alice Example');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const result = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(result.complete, true);
    const encoded = fs.readFileSync(evidencePath(), 'utf8');
    const receipt = JSON.parse(encoded);
    assert.strictEqual(receipt.schema, SCHEMA);
    assert.strictEqual(receipt.records.length, 1);
    assert.deepStrictEqual(receipt.records[0].counts, { total: 1, released: 1, stopped: 0, retryable: 0, pending: 0 });
    assert.strictEqual(receipt.records[0].raw_content_sent_to_claude, false);
    assert.doesNotMatch(encoded, /Alice|Example|Document|\.txt|package_id|batch_token|sha256|path/i);
    assert.throws(() => validateEvidenceRecord({ ...receipt.records[0], original_name: 'Alice Example' }), /ungültiges Format/);
    assert.throws(() => validateEvidenceRecord({ ...receipt.records[0], counts: { ...receipt.records[0].counts, total: 2 } }), /ungültiges Format/);
  });

  await testAsync('a damaged local evidence receipt does not retract an otherwise released package', async () => {
    resetInput();
    fs.writeFileSync(evidencePath(), '{not-json', 'utf8');
    add('receipt-repair.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const result = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.complete, true);
    assert.strictEqual(result.local_evidence_exported, false);
    assert.match(result.read_capability, /^[A-Za-z0-9_-]{43}$/);
    fs.unlinkSync(evidencePath());
  });

  await testAsync('a terminally stopped batch receives the same aggregate-only evidence receipt', async () => {
    resetInput();
    try { fs.unlinkSync(evidencePath()); } catch { /* test starts without a receipt */ }
    add('terminal-stop.xlsx', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const result = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.complete, true);
    assert.strictEqual(result.local_evidence_exported, true);
    const record = JSON.parse(fs.readFileSync(evidencePath(), 'utf8')).records[0];
    assert.strictEqual(record.outcome, 'complete_with_stopped_documents');
    assert.deepStrictEqual(record.counts, { total: 1, released: 0, stopped: 1, retryable: 0, pending: 0 });
    assert.deepStrictEqual(record.error_codes, ['FORMAT_COVERAGE_UNVERIFIED']);
    assert.doesNotMatch(JSON.stringify(record), /terminal-stop|Mustermann|\.xlsx/i);
  });

  await testAsync('a failed mapping write rolls back the newly published package', async () => {
    resetInput();
    add('mapping-failure.txt', 'Kunde: Max Mustermann');
    fs.writeFileSync(path.join(roots().exports, 'DataSecure-Mapping.csv'), 'corrupt local mapping', 'utf8');
    const before = fs.readdirSync(roots().output).sort();
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const result = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'LOCAL_MAPPING_EXPORT_FAILED');
    assert.deepStrictEqual(fs.readdirSync(roots().output).sort(), before);
    fs.unlinkSync(path.join(roots().exports, 'DataSecure-Mapping.csv'));
  });

  await testAsync('a private-copy cleanup failure never retracts an already published result', async () => {
    resetInput();
    add('cleanup-pending.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const result = await processBatchNext(begun.batch_token, {
      ...deps,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.delivery_pending, 1);
    acknowledgeDeliveredPackage(begun.batch_token, result.package_id, {
      unlinkWorkCopy: () => { throw new Error('synthetic locked work copy'); }
    });
    const state = _test.readState(begun.batch_token);
    assert.strictEqual(state.items[0].status, 'released');
    assert.strictEqual(state.items[0].work_copy_cleanup_pending, true);
    assert.ok(fs.existsSync(path.join(_test.workPath(begun.batch_token), state.items[0].work_name)));
    const cleanup = localCleanupStatus();
    assert.strictEqual(cleanup.private_work_copy_cleanup_pending, 1);
    assert.doesNotMatch(JSON.stringify(cleanup), /cleanup-pending|Mustermann|\.txt|batch_token/i);
    const retried = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(retried.complete, true);
    const cleaned = _test.readState(begun.batch_token);
    assert.strictEqual(cleaned.items[0].work_copy_cleanup_pending, undefined);
    assert.strictEqual(localCleanupStatus().private_work_copy_cleanup_pending, 0);
    assert.ok(!fs.existsSync(path.join(_test.workPath(begun.batch_token), cleaned.items[0].work_name)));
  });

  await testAsync('an unacknowledged package is redelivered without processing its source twice', async () => {
    resetInput();
    add('handoff.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const first = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.delivery_pending, 1);
    const stateBefore = _test.readState(begun.batch_token);
    const second = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(second.package_id, first.package_id);
    assert.strictEqual(second.delivery_pending, 1);
    assert.strictEqual(fs.readdirSync(roots().output).filter((name) => name === first.package_id).length, 1);
    acknowledgeDeliveredPackage(begun.batch_token, second.package_id);
    const stateAfter = _test.readState(begun.batch_token);
    assert.strictEqual(stateBefore.items[0].id, stateAfter.items[0].id);
    assert.strictEqual(stateAfter.items[0].status, 'released');
    assert.strictEqual(stateAfter.items[0].package_id, first.package_id);
  });

  await testAsync('crash recovery adopts a verified published package and writes no duplicate mapping row', async () => {
    resetInput();
    const mapping = path.join(roots().exports, 'DataSecure-Mapping.csv');
    try { fs.unlinkSync(mapping); } catch { /* isolated mapping ledger */ }
    add('recover-published.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const published = await processBatchNext(begun.batch_token, deps);
    const stateFile = path.join(_test.batchRoot(), `${begun.batch_token}.json`);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    // Simulate termination just after the output rename: the output exists,
    // but the batch journal still says processing and has no package id.
    state.items[0].status = 'processing';
    delete state.items[0].package_id;
    fs.writeFileSync(stateFile, JSON.stringify(state));
    const recovered = recoverBatches();
    assert.strictEqual(recovered.recovered, 1);
    const redelivered = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(redelivered.package_id, published.package_id);
    assert.strictEqual(redelivered.delivery_pending, 1);
    const ledger = fs.readFileSync(mapping, 'utf8');
    assert.strictEqual(ledger.split(`\"${published.package_id}\"`).length - 1, 1);
    acknowledgeDeliveredPackage(begun.batch_token, redelivered.package_id);
  });

  await testAsync('default storage uses local application data and known sync roots are refused', async () => {
    const configured = process.env.EU_PRIVACY_ROOT;
    delete process.env.EU_PRIVACY_ROOT;
    assert.ok(privacyRoot().startsWith(path.resolve(process.env.LOCALAPPDATA)));
    assert.strictEqual(storageStatus().mode, 'local_app_data');
    process.env.EU_PRIVACY_ROOT = path.join(base, 'OneDrive - Example', 'Privacy');
    assert.strictEqual(storageStatus().safe, false);
    assert.throws(() => beginBatch({ expectedCount: 1 }), /nicht freigegeben/i);
    process.env.EU_PRIVACY_ROOT = configured;
  });

  await testAsync('only one local batch can process at a time and a dead owner lock is recoverable', async () => {
    resetInput(); add('confirmed.txt', 'Kunde: Max Mustermann');
    const first = beginBatch({ expectedCount: 1, profile: 'customer' });
    const second = beginBatch({ expectedCount: 1, profile: 'customer' });
    assert.strictEqual(_test.acquireActiveLock(first.batch_token), true);
    await assert.rejects(() => processBatchNext(second.batch_token, deps), /anderer lokaler DataSecure-Stapel/i);
    _test.releaseActiveLock(first.batch_token);

    fs.writeFileSync(_test.activeLockPath(), JSON.stringify({
      schema: 'datasecure-active-batch/1', token: first.batch_token, pid: 99999999, created_at: new Date().toISOString()
    }));
    assert.strictEqual(_test.acquireActiveLock(second.batch_token), true);
    _test.releaseActiveLock(second.batch_token);
  });

  await testAsync('a malformed active lock remains fail-closed instead of being recovered as dead', async () => {
    resetInput(); add('lock-check.txt', 'Kunde: Max Mustermann');
    const batch = beginBatch({ expectedCount: 1, profile: 'customer' });
    const lock = _test.activeLockPath();
    fs.writeFileSync(lock, JSON.stringify({
      schema: 'datasecure-active-batch/1', token: batch.batch_token, created_at: new Date().toISOString()
    }));
    assert.strictEqual(_test.validActiveLock(JSON.parse(fs.readFileSync(lock, 'utf8'))), false);
    assert.throws(() => _test.acquireActiveLock(batch.batch_token), /anderer lokaler DataSecure-Stapel/i);
    assert.strictEqual(fs.existsSync(lock), true, 'a malformed lock must not be deleted during recovery');
    fs.unlinkSync(lock);
  });

  await testAsync('only an explicit resume retries an interrupted item and preserves completed work', async () => {
    resetInput();
    add('first.txt', 'Kunde: Max Mustermann');
    add('second.txt', 'Kunde: Erika Musterfrau');
    const begun = beginBatch({ expectedCount: 2, profile: 'customer' });
    const interrupted = await processBatchNext(begun.batch_token, {
      convertDocument: async () => {
        const error = new Error('interrupted');
        error.code = 'REQUEST_CANCELLED';
        throw error;
      }
    });
    assert.strictEqual(_test.readState(begun.batch_token).items[0].checkpoint, 'retryable');
    assert.strictEqual(interrupted.retryable, 1);
    assert.strictEqual(interrupted.completed, 0);
    assert.strictEqual(interrupted.completion_percent, 0);
    assert.strictEqual(interrupted.remaining, 1);
    assert.strictEqual(interrupted.batch_phase, 'ready_for_next_document');
    assert.strictEqual(interrupted.next_position, 2);
    const released = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(released.released, 1);
    assert.strictEqual(released.completed, 1);
    assert.strictEqual(released.completion_percent, 50);
    assert.strictEqual(released.awaiting_resume, true);
    assert.strictEqual(released.batch_phase, 'awaiting_explicit_resume');
    assert.strictEqual(released.next_position, null);
    const resumed = resumeBatch(begun.batch_token);
    assert.strictEqual(resumed.ok, true);
    assert.strictEqual(resumed.resumed, 1);
    assert.strictEqual(_test.readState(begun.batch_token).items[0].checkpoint, 'resumed');
    const completed = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(completed.released, 2);
    assert.strictEqual(completed.complete, true);
    assert.strictEqual(completed.completion_percent, 100);
    assert.strictEqual(completed.batch_phase, 'complete');
  });

  await testAsync('a new chat can explicitly continue the latest incomplete batch without a remembered token', async () => {
    resetInput();
    add('continue-later.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const interrupted = await processBatchNext(begun.batch_token, {
      convertDocument: async () => {
        const error = new Error('interrupted');
        error.code = 'REQUEST_CANCELLED';
        throw error;
      }
    });
    assert.strictEqual(interrupted.awaiting_resume, true);
    assert.ok(recoverableBatchStatus().recoverable_batches >= 1);
    const continued = continueMostRecentBatch();
    assert.strictEqual(continued.ok, true);
    assert.strictEqual(continued.batch_token, begun.batch_token);
    assert.strictEqual(continued.retryable, 0);
    assert.strictEqual(continued.remaining, 1);
    assert.doesNotMatch(JSON.stringify(continued), /continue-later|Mustermann|\.txt/i);
    assert.strictEqual((await processAndAcknowledge(continued.batch_token, deps)).complete, true);
  });

  await testAsync('the central batch requests a local decision for an ambiguous credential issuer and releases only the reviewed text', async () => {
    resetInput();
    add('profile.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer');
    const begun = beginBatch({ expectedCount: 1, profile: 'personnel_profile' });
    let draftSeen;
    const result = await processBatchNext(begun.batch_token, {
      ...deps,
      platform: 'linux',
      reviewTextLocally: (draft, options) => {
        draftSeen = { draft, options };
        return {
          action: 'reviewed', redactions: [],
          decisions: draft.ambiguities.map((item) => ({ ambiguity_id: item.ambiguity_id, decision: 'keep' }))
        };
      }
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(draftSeen.options.platform, 'linux');
    assert.ok(draftSeen.draft.ambiguities.length > 0);
    assert.doesNotMatch(JSON.stringify(_test.readState(begun.batch_token)), /Microsoft|Azure|Cloud Engineer/u);
    const released = fs.readFileSync(path.join(roots().output, result.package_id, `${result.package_id}.md`), 'utf8');
    assert.match(released, /Microsoft Azure Administrator Associate/u);
    assert.strictEqual(acknowledgeDeliveredPackage(begun.batch_token, result.package_id).complete, true);
  });

  await testAsync('cancelling the central credential decision is terminal and does not make the raw draft durable', async () => {
    resetInput();
    add('cancelled-profile.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer');
    const begun = beginBatch({ expectedCount: 1, profile: 'personnel_profile' });
    const result = await processBatchNext(begun.batch_token, {
      ...deps,
      platform: 'darwin',
      reviewTextLocally: () => ({ action: 'cancelled' })
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'LOCAL_REVIEW_CANCELLED');
    assert.strictEqual(result.stopped, 1);
    const state = _test.readState(begun.batch_token);
    assert.strictEqual(state.items[0].status, 'stopped');
    assert.doesNotMatch(JSON.stringify(state), /Microsoft|Azure|Cloud Engineer/u);
  });

  await testAsync('a deferred credential decision keeps its source local, lets the batch continue, and needs the shared local review', async () => {
    resetInput();
    ordered('deferred-profile.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer', 1);
    ordered('clear.txt', 'Kunde: Max Mustermann\nTicket: weiter', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'personnel_profile' });
    let firstPassReviewCalls = 0;
    const deferred = await processBatchNext(begun.batch_token, { ...deps, platform: 'linux', reviewTextLocally: () => { firstPassReviewCalls++; return { action: 'reviewed' }; } });
    assert.strictEqual(deferred.error, 'LOCAL_REVIEW_DEFERRED');
    assert.strictEqual(firstPassReviewCalls, 0);
    assert.strictEqual(deferred.deferred_review, 1);
    assert.strictEqual(deferred.remaining, 1);
    assert.strictEqual(deferred.next_position, 2);
    assert.doesNotMatch(JSON.stringify(_test.readState(begun.batch_token)), /Microsoft|Azure|Cloud Engineer/u);
    const clear = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(clear.ok, true);
    acknowledgeDeliveredPackage(begun.batch_token, clear.package_id);
    const waiting = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(waiting.awaiting_resume, true);
    assert.strictEqual(waiting.batch_phase, 'awaiting_local_review');
    assert.strictEqual(resumeBatch(begun.batch_token).error, 'batch_review_required');
    const deferredItem = _test.readState(begun.batch_token).items.find((item) => item.status === 'deferred_review');
    assert.doesNotMatch(JSON.stringify(deferredItem), /Microsoft|Azure|Cloud Engineer/u);
    const reviewed = await reviewDeferredBatch(begun.batch_token, { ...deps, platform: 'linux', reviewTextLocally: (draft) => ({ action: 'reviewed', redactions: [], decisions: draft.ambiguities.map((item) => ({ ambiguity_id: item.ambiguity_id, decision: 'keep' })) }) });
    assert.strictEqual(reviewed.ok, true, JSON.stringify(reviewed));
  });

  await testAsync('one local batch review publishes all decided deferred positions without journaling drafts', async () => {
    resetInput();
    ordered('first-profile.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer', 1);
    ordered('second-profile.txt', 'Microsoft Azure Administrator Associate\nRolle: Scrum Master', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'personnel_profile' });
    const first = await processBatchNext(begun.batch_token, deps);
    const second = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(first.error, 'LOCAL_REVIEW_DEFERRED');
    assert.strictEqual(second.error, 'LOCAL_REVIEW_DEFERRED');
    assert.strictEqual((await processBatchNext(begun.batch_token, deps)).awaiting_resume, true);
    let calls = 0;
    const reviewed = await reviewDeferredBatch(begun.batch_token, {
      ...deps,
      platform: 'linux',
      reviewTextLocally: (draft) => {
        calls++;
        assert.strictEqual(draft.batch_review.document_count, 2);
        return { action: 'reviewed', redactions: [], decisions: draft.ambiguities.map((candidate) => ({ ambiguity_id: candidate.ambiguity_id, decision: 'keep' })) };
      }
    });
    assert.strictEqual(calls, 1);
    assert.strictEqual(reviewed.ok, true, JSON.stringify(reviewed));
    assert.strictEqual(reviewed.packages.length, 2);
    assert.strictEqual(reviewed.delivery_pending, 2);
    assert.doesNotMatch(JSON.stringify(_test.readState(begun.batch_token)), /Microsoft|Azure|Cloud Engineer|Scrum Master/u);
    const released = reviewed.packages.map((entry) => fs.readFileSync(path.join(roots().output, entry.package_id, `${entry.package_id}.md`), 'utf8')).join('\n');
    assert.match(released, /Microsoft Azure Administrator Associate/u);
    assert.match(released, /Microsoft Azure Administrator Associate/u);
    for (const entry of reviewed.packages) acknowledgeDeliveredPackage(begun.batch_token, entry.package_id);
    const complete = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(complete.complete, true);
  });

  await testAsync('a shared local review explains why it cannot start before analysis completes', async () => {
    resetInput();
    ordered('not-ready-first.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer', 1);
    ordered('not-ready-second.txt', 'Kunde: Max Mustermann\nTicket: weiter', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'personnel_profile' });
    const result = await reviewDeferredBatch(begun.batch_token, deps);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'batch_review_not_ready');
    assert.match(result.message, /analysiert noch weitere Dateien/u);
    assert.doesNotMatch(JSON.stringify(result), /not-ready|Mustermann|Azure|Cloud Engineer/u);
  });

  await testAsync('deferring the shared local batch review publishes nothing and keeps every item deferred', async () => {
    resetInput();
    ordered('defer-first.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer', 1);
    ordered('defer-second.txt', 'Microsoft Azure Administrator Associate\nRolle: Testmanager', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'personnel_profile' });
    await processBatchNext(begun.batch_token, deps);
    await processBatchNext(begun.batch_token, deps);
    const outputsBefore = fs.readdirSync(roots().output).sort();
    const review = await reviewDeferredBatch(begun.batch_token, {
      ...deps,
      platform: 'linux',
      reviewTextLocally: () => ({ action: 'deferred' })
    });
    assert.strictEqual(review.ok, false);
    assert.strictEqual(review.error, 'LOCAL_REVIEW_DEFERRED');
    assert.strictEqual(review.deferred_review, 2);
    assert.strictEqual(review.delivery_pending, 0);
    assert.deepStrictEqual(fs.readdirSync(roots().output).sort(), outputsBefore);
    const state = _test.readState(begun.batch_token);
    assert.ok(state.items.every((item) => item.status === 'deferred_review'));
    assert.doesNotMatch(JSON.stringify(state), /Microsoft|Azure|Cloud Engineer|Testmanager/u);
  });

  await testAsync('cancelling the shared local batch review publishes nothing and keeps every item deferred', async () => {
    resetInput();
    ordered('cancel-first.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer', 1);
    ordered('cancel-second.txt', 'Microsoft Azure Administrator Associate\nRolle: Testmanager', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'personnel_profile' });
    await processBatchNext(begun.batch_token, deps);
    await processBatchNext(begun.batch_token, deps);
    const outputsBefore = fs.readdirSync(roots().output).sort();
    const review = await reviewDeferredBatch(begun.batch_token, {
      ...deps,
      platform: 'linux',
      reviewTextLocally: () => ({ action: 'cancelled' })
    });
    assert.strictEqual(review.ok, false);
    assert.strictEqual(review.error, 'LOCAL_REVIEW_CANCELLED');
    assert.strictEqual(review.deferred_review, 2);
    assert.strictEqual(review.stopped, 0);
    assert.deepStrictEqual(fs.readdirSync(roots().output).sort(), outputsBefore);
    assert.ok(_test.readState(begun.batch_token).items.every((item) => item.status === 'deferred_review'));
  });

  await testAsync('a partial batch-review publication still hands off its earlier atomic package', async () => {
    resetInput();
    ordered('partial-first.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer', 1);
    ordered('partial-second.txt', 'Microsoft Azure Administrator Associate\nRolle: Testmanager', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'personnel_profile' });
    await processBatchNext(begun.batch_token, deps);
    await processBatchNext(begun.batch_token, deps);
    let calls = 0;
    const partial = await reviewDeferredBatch(begun.batch_token, {
      ...deps,
      convertDocument: async (source) => {
        calls++;
        if (calls === 4) {
          const error = new Error('parser unavailable');
          error.code = 'PARSER_START_FAILED';
          throw error;
        }
        return { markdown: fs.readFileSync(source, 'utf8'), attachments: [], warnings: [], unreviewedVisualCount: 0, requiresExplicitProfile: false };
      },
      platform: 'linux',
      reviewTextLocally: (draft) => ({ action: 'reviewed', redactions: [], decisions: draft.ambiguities.map((item) => ({ ambiguity_id: item.ambiguity_id, decision: 'keep' })) })
    });
    assert.strictEqual(partial.ok, true);
    assert.strictEqual(partial.packages.length, 1);
    assert.strictEqual(partial.failed_documents, 1);
    assert.strictEqual(partial.delivery_pending, 1);
    assert.strictEqual(partial.retryable, 1);
    assert.match(partial.packages[0].read_capability, /^[A-Za-z0-9_-]{43}$/);
    const state = _test.readState(begun.batch_token);
    assert.strictEqual(state.items.filter((item) => item.status === 'delivery_pending').length, 1);
    assert.strictEqual(state.items.filter((item) => item.status === 'retryable').length, 1);
    assert.doesNotMatch(JSON.stringify(state), /Microsoft|Azure|Cloud Engineer|Testmanager/u);
  });

  await testAsync('a new-chat continuation preserves deferred review for the shared local review path', async () => {
    resetInput();
    ordered('continue-review.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer', 1);
    ordered('continue-clear.txt', 'Kunde: Max Mustermann\nTicket: Weiter', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'personnel_profile' });
    await processBatchNext(begun.batch_token, deps);
    const clear = await processBatchNext(begun.batch_token, deps);
    acknowledgeDeliveredPackage(begun.batch_token, clear.package_id);
    const continued = continueMostRecentBatch();
    assert.strictEqual(continued.ok, true);
    assert.strictEqual(continued.batch_token, begun.batch_token);
    assert.strictEqual(continued.batch_phase, 'awaiting_local_review');
    assert.strictEqual(continued.deferred_review, 1);
    const item = _test.readState(begun.batch_token).items.find((candidate) => candidate.status === 'deferred_review');
    assert.strictEqual(item.checkpoint, 'awaiting_local_review');
    assert.doesNotMatch(JSON.stringify(item), /Microsoft|Azure|Cloud Engineer/u);
  });

  await testAsync('the server owns progress and never retries a stopped item', async () => {
    resetInput();
    add('blocked.xlsx', 'Name,Mail\nMax Mustermann,max@example.de');
    add('first.txt', 'Kunde: Max Mustermann\nE-Mail: max@example.de\nTicket: Eins');
    add('second.txt', 'Kunde: Erika Musterfrau\nE-Mail: erika@example.de\nTicket: Zwei');
    const begun = beginBatch({ expectedCount: 3, profile: 'customer' });
    const stopped = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(stopped.ok, false);
    assert.strictEqual(stopped.stopped, 1);
    assert.strictEqual(stopped.completion_percent, 33);
    assert.strictEqual(stopped.local_mapping_exported, true);
    assert.strictEqual(stopped.remaining, 2);
    const first = await processAndAcknowledge(begun.batch_token, deps);
    const second = await processAndAcknowledge(begun.batch_token, deps);
    assert.ok(first.ok && second.ok);
    assert.strictEqual(second.complete, true);
    assert.strictEqual(second.released, 2);
    assert.strictEqual(second.stopped, 1);
    assert.match(first.read_capability, /^[A-Za-z0-9_-]{43}$/);
    assert.deepStrictEqual(fs.readdirSync(roots().input).sort(), ['blocked.xlsx', 'first.txt', 'second.txt']);
    const mapping = fs.readFileSync(path.join(roots().exports, 'DataSecure-Mapping.csv'), 'utf8');
    assert.match(mapping, /Originaldatei;Anonymisiertes Ergebnis;Status;Hinweis/);
    assert.match(mapping, /"first\.txt"/);
    assert.match(mapping, /"second\.txt"/);
    assert.match(mapping, /"blocked\.xlsx";"";"sicher gestoppt"/);
    assert.doesNotMatch(JSON.stringify(first), /first\.txt/);
    const state = _test.readState(begun.batch_token);
    assert.strictEqual(fs.existsSync(path.join(_test.workPath(begun.batch_token), state.items.find((item) => item.name === 'first.txt').work_name)), false);
  });

  await testAsync('an in-flight item is never reported as a completed batch', async () => {
    const progress = _test.publicProgress({
      token: 'a'.repeat(64),
      items: [{ status: 'released' }, { status: 'processing' }, { status: 'pending' }]
    });
    assert.strictEqual(progress.processing, 1);
    assert.strictEqual(progress.complete, false);
    assert.strictEqual(progress.completion_percent, 33);
    assert.strictEqual(progress.batch_phase, 'processing_local_document');
    assert.strictEqual(progress.next_position, 2);
    assert.strictEqual(progress.attempted, 2);
  });

  await testAsync('a terminal stop remains recorded locally when no result package exists', async () => {
    resetInput();
    add('unreadable.xlsx', 'Name,Mail\nMax Mustermann,max@example.de');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const result = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.local_mapping_exported, true);
    const mapping = fs.readFileSync(path.join(roots().exports, 'DataSecure-Mapping.csv'), 'utf8');
    assert.match(mapping, /"unreadable\.xlsx";"";"sicher gestoppt"/);
    assert.doesNotMatch(JSON.stringify(result), /unreadable\.xlsx/);
  });

  await testAsync('changes to originals after snapshot do not alter the sealed batch', async () => {
    resetInput();
    const original = add('confirmed.txt', 'Kunde: Max Mustermann');
    add('other.txt', 'Kunde: Erika Musterfrau');
    const begun = beginBatch({ expectedCount: 2, profile: 'customer' });
    fs.writeFileSync(original, 'ausgetauschter Inhalt', 'utf8');
    const result = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.released, 1);
    assert.strictEqual((await processAndAcknowledge(begun.batch_token, deps)).complete, true);
    assert.strictEqual(fs.readFileSync(original, 'utf8'), 'ausgetauschter Inhalt');
  });

  await testAsync('added originals after snapshot do not alter the sealed batch', async () => {
    resetInput();
    add('confirmed.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    add('added.txt', 'Kunde: Erika Musterfrau');
    const result = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.released, 1);
    assert.strictEqual(result.complete, true);
  });

  await testAsync('startup recovery retains an interrupted item as explicitly retryable', async () => {
    resetInput(); add('resume.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const file = path.join(_test.batchRoot(), `${begun.batch_token}.json`);
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    state.items[0].status = 'processing';
    state.items[0].checkpoint = 'package_verified';
    fs.writeFileSync(file, JSON.stringify(state));
    const recovered = recoverBatches();
    assert.strictEqual(recovered.recovered, 1);
    assert.strictEqual(_test.readState(begun.batch_token).items[0].checkpoint, 'retryable');
    const result = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(result.awaiting_resume, true);
    assert.strictEqual(result.retryable, 1);
    assert.strictEqual(fs.existsSync(path.join(roots().input, 'resume.txt')), true);
    assert.strictEqual(resumeBatch(begun.batch_token).resumed, 1);
    assert.strictEqual((await processAndAcknowledge(begun.batch_token, deps)).complete, true);
  });

  await testAsync('startup recovery never lets a substituted journal remove another batch work copy', async () => {
    resetInput();
    add('first.txt', 'Kunde: Max Mustermann');
    add('second.txt', 'Kunde: Erika Musterfrau');
    const first = beginBatch({ expectedCount: 2, profile: 'customer' });
    // Use a second sealed session so a forged state token could otherwise
    // target a real, different private directory during expiry cleanup.
    resetInput();
    add('third.txt', 'Kunde: Anna Muster');
    const second = beginBatch({ expectedCount: 1, profile: 'customer' });
    const firstStateFile = path.join(_test.batchRoot(), `${first.batch_token}.json`);
    const forged = JSON.parse(fs.readFileSync(firstStateFile, 'utf8'));
    forged.token = second.batch_token;
    forged.expires_at = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(firstStateFile, JSON.stringify(forged));

    const outcome = recoverBatches();
    assert.deepStrictEqual(outcome, { recovered: 0, removed: 0, failures: 1, skipped_active: false });
    assert.strictEqual(fs.existsSync(firstStateFile), true);
    assert.strictEqual(fs.existsSync(_test.workPath(first.batch_token)), true);
    assert.strictEqual(fs.existsSync(_test.workPath(second.batch_token)), true);
    // The forged state is intentionally not recoverable. Remove this test-only
    // malformed fixture so later maintenance tests observe their own state.
    fs.unlinkSync(firstStateFile);
    fs.rmSync(_test.workPath(first.batch_token), { recursive: true, force: false, maxRetries: 0 });
  });

  await testAsync('startup recovery and periodic expiry cleanup yield to a live batch owner', async () => {
    resetInput();
    add('live-owner.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const stateFile = path.join(_test.batchRoot(), `${begun.batch_token}.json`);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    state.items[0].status = 'processing';
    state.expires_at = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(stateFile, JSON.stringify(state));
    const maintenanceToken = 'a'.repeat(64);
    assert.strictEqual(_test.acquireActiveLock(maintenanceToken), true);
    try {
      assert.strictEqual(recoverableBatchStatus().batch_processing_active, true);
      assert.deepStrictEqual(recoverBatches(), { recovered: 0, removed: 0, failures: 0, skipped_active: true });
      assert.deepStrictEqual(cleanupExpiredBatchSnapshots(), { removed: 0, failures: 0, skipped_active: true });
      assert.strictEqual(fs.existsSync(stateFile), true);
      assert.strictEqual(_test.readStateForMaintenance(begun.batch_token).items[0].status, 'processing');
    } finally {
      _test.releaseActiveLock(maintenanceToken);
    }
    assert.strictEqual(recoverableBatchStatus().batch_processing_active, false);
    const cleaned = cleanupExpiredBatchSnapshots();
    assert.deepStrictEqual(cleaned, { removed: 1, failures: 0, skipped_active: false });
    assert.strictEqual(fs.existsSync(stateFile), false);
    assert.strictEqual(fs.existsSync(_test.workPath(begun.batch_token)), false);
  });

  await testAsync('an owner that dies after a skipped recovery is resumed only by explicit continuation', async () => {
    resetInput();
    add('late-crash.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const stateFile = path.join(_test.batchRoot(), `${begun.batch_token}.json`);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    state.items[0].status = 'processing';
    state.items[0].checkpoint = 'processing_started';
    fs.writeFileSync(stateFile, JSON.stringify(state));
    const liveToken = 'b'.repeat(64);
    assert.strictEqual(_test.acquireActiveLock(liveToken), true);
    try {
      assert.strictEqual(recoverBatches().skipped_active, true);
    } finally {
      _test.releaseActiveLock(liveToken);
    }
    const continued = continueMostRecentBatch();
    assert.strictEqual(continued.ok, true);
    assert.strictEqual(continued.batch_token, begun.batch_token);
    assert.strictEqual(continued.remaining, 1);
    assert.strictEqual(_test.readState(begun.batch_token).items[0].checkpoint, 'resumed');
    const released = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(released.complete, true);
    assert.strictEqual(released.released, 1);
  });

  await testAsync('private processing checkpoints remain local and contain no source identifiers', async () => {
    resetInput(); add('checkpoint-name.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const result = await processBatchNext(begun.batch_token, {
      ...deps,
      beforePublish: async () => {
        const state = _test.readState(begun.batch_token);
        assert.strictEqual(state.items[0].checkpoint, 'package_verified');
      }
    });
    const state = _test.readState(begun.batch_token);
    assert.strictEqual(state.items[0].checkpoint, 'delivery_pending');
    assert.doesNotMatch(JSON.stringify(result), /checkpoint-name|Mustermann/i);
  });

  await testAsync('expired batch snapshots remove only their private working copies', async () => {
    resetInput();
    const cleanupBefore = localCleanupStatus();
    const original = add('retained-original.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const stateFile = path.join(_test.batchRoot(), `${begun.batch_token}.json`);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    state.expires_at = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(stateFile, JSON.stringify(state));
    assert.strictEqual(localCleanupStatus().private_work_copy_cleanup_pending, cleanupBefore.private_work_copy_cleanup_pending);
    assert.strictEqual(localCleanupStatus().expired_batch_cleanup_pending, cleanupBefore.expired_batch_cleanup_pending + 1);
    const outcome = recoverBatches();
    assert.strictEqual(outcome.removed, 1);
    assert.strictEqual(fs.existsSync(stateFile), false);
    assert.strictEqual(fs.existsSync(_test.workPath(begun.batch_token)), false);
    assert.strictEqual(fs.readFileSync(original, 'utf8'), 'Kunde: Max Mustermann');
    assert.strictEqual(localCleanupStatus().private_work_copy_cleanup_pending, cleanupBefore.private_work_copy_cleanup_pending);
    assert.strictEqual(localCleanupStatus().expired_batch_cleanup_pending, cleanupBefore.expired_batch_cleanup_pending);
  });

  await testAsync('a real 100-file session handles stops at positions 1, 50 and 100 exactly once', async () => {
    resetInput();
    for (let index = 1; index <= 100; index++) {
      const blocked = [1, 50, 100].includes(index);
      ordered(
        `${String(index).padStart(2, '0')}-${blocked ? 'blocked.xlsx' : 'safe.txt'}`,
        blocked ? 'Name,Mail\nMax Mustermann,max@example.de' : `Kunde: Person ${index}\nTicket: Test ${index}`,
        index
      );
    }
    const begun = beginBatch({ expectedCount: 100, profile: 'customer' });
    const results = [];
    for (let index = 0; index < 100; index++) results.push(await processAndAcknowledge(begun.batch_token, deps));
    assert.strictEqual(results.filter((result) => result.ok).length, 97);
    assert.strictEqual(results.filter((result) => !result.ok).length, 3);
    const final = results.at(-1);
    assert.strictEqual(final.complete, true);
    assert.strictEqual(final.released, 97);
    assert.strictEqual(final.stopped, 3);
    assert.strictEqual(fs.readdirSync(roots().input).length, 100);
  });

  done();
}

main().catch((error) => { console.error(error); process.exit(1); });
