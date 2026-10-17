'use strict';

// The production read-one adapters, real held files and original-folder
// bindings, not an injected array pretending to be the private journal store.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-history-target-'));
process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'private');
process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(root, 'results');
process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
const batch = require('../plugins/data-secure/server/gateway/batch');
const exporter = require('../plugins/data-secure/server/gateway/result-export');
const store = require('../plugins/data-secure/server/gateway/standalone-history-store');
const { roots, safeRemovePrivateTree } = require('../plugins/data-secure/server/gateway/common');
const { createBatchPseudonymState } = require('../plugins/data-secure/server/batch-pseudonym-context');
const { createRunHistory } = require('../plugins/data-secure/server/standalone/run-history');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const data = process.env.EU_PRIVACY_DATA_ROOT, now = Date.now();
const targetId = 'a'.repeat(64), foreign = new Set(), foreignExports = new Set();
let recoveryAttempts = 0;
const deps = {
  readStates: batch.readStandaloneHistoryStates, readState: batch.readStandaloneHistoryState,
  readExports: exporter.readStandaloneExportHistory, readExport: exporter.readStandaloneExportHistoryEntry,
  recoverableStates: batch.standaloneRecoverableStates, liveExecutor: batch._test.liveLocalExecutor,
  exportCompletedBatchResults: () => { recoveryAttempts++; throw Error('NO_REPLAY_FROM_DISPLAY'); }
};
const history = createRunHistory(deps);
function writeState(token, items, createdOffset = 0) {
  const state = { schema: 'datasecure-batch/1', token, product_channel: 'standalone', profile: 'general',
    created_at: new Date(now + createdOffset).toISOString(), expires_at: new Date(now + 86400000).toISOString(),
    ...createBatchPseudonymState({ productChannel: 'standalone' }), items };
  batch._test.writeState(state); return state;
}
function boundedReads(action) {
  const originals = {}, counts = { opened: 0, journal_reads: 0, export_reads: 0, foreign_reads: 0, global_listings: 0 };
  const globalRoots = new Set(['batches', 'document-reviews', 'result-export-state', 'standalone-run-history']
    .map(name => path.join(data, name)));
  const unrelated = value => {
    if (typeof value !== 'string') return false;
    const pieces = path.resolve(value).split(path.sep), name = path.basename(value);
    return pieces.some(piece => foreign.has(piece) || foreign.has(piece.replace(/\.json$/u, ''))) ||
      foreignExports.has(name.replace(/\.json(?:\.waived)?$/u, ''));
  };
  for (const name of ['openSync', 'readFileSync', 'readdirSync']) originals[name] = fs[name];
  fs.openSync = function(file, ...args) {
    counts.opened++;
    if (unrelated(file)) { counts.foreign_reads++; throw Error('FOREIGN_BODY_OR_EXPORT_OPENED'); }
    if (typeof file === 'string' && path.dirname(file) === path.join(data, 'batches')) counts.journal_reads++;
    if (typeof file === 'string' && path.dirname(file) === path.join(data, 'result-export-state')) counts.export_reads++;
    return originals.openSync.call(this, file, ...args);
  };
  fs.readFileSync = function(file, ...args) {
    if (unrelated(file)) { counts.foreign_reads++; throw Error('FOREIGN_BODY_OR_EXPORT_READ'); }
    return originals.readFileSync.call(this, file, ...args);
  };
  fs.readdirSync = function(file, ...args) {
    if (globalRoots.has(path.resolve(file))) { counts.global_listings++; throw Error('GLOBAL_HISTORY_SCAN'); }
    if (unrelated(file)) { counts.foreign_reads++; throw Error('FOREIGN_DIRECTORY_READ'); }
    return originals.readdirSync.call(this, file, ...args);
  };
  try { counts.value = action(); }
  finally { Object.assign(fs, originals); }
  assert.equal(counts.foreign_reads, 0, 'no unrelated source/review/export file was opened');
  assert.equal(counts.global_listings, 0, 'exact actions do not enumerate private history roots');
  return counts;
}
function code(expected) { return error => error?.code === expected; }

try {
  fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT);
  const packageId = `ds_${'a'.repeat(32)}`, directory = path.join(roots().output, packageId);
  fs.mkdirSync(directory);
  const bytes = Buffer.from('Synthetic neutral local result.'), file = `${packageId}.md`;
  fs.writeFileSync(path.join(directory, file), bytes);
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/2',
    package_id: packageId, profile: 'general', document: file, document_sha256: sha(bytes), assets: [],
    created_at: new Date(now).toISOString() }));
  const target = writeState(targetId, [
    { id: 'a'.repeat(32), name: 'good.txt', status: 'released', package_id: packageId, source_label: 'good.txt' },
    { id: 'b'.repeat(32), name: 'stopped.txt', status: 'stopped', checkpoint: 'stopped', error_code: 'SOURCE_READ_FAILED' }
  ], -1000000);
  assert.equal(exporter.exportCompletedState(target).available, true);
  const exportPath = exporter.recordPath(targetId), exportRecord = JSON.parse(fs.readFileSync(exportPath));
  const originalRun = history.resolveResults(targetId).local_path;
  // A bound legacy anchor exercises the former O(N) owner-directory discovery.
  const reviewRoot = path.join(data, 'document-reviews'); fs.mkdirSync(reviewRoot, { recursive: true });
  const targetReview = path.join(reviewRoot, targetId); fs.mkdirSync(targetReview);
  fs.writeFileSync(path.join(targetReview, 'manifest.json'), JSON.stringify({ schema: 'datasecure-document-run/1',
    batch_id: targetId, product_channel: 'standalone', processing_mode: 'markdown-and-anonymize',
    documents: [{ document_id: 'a'.repeat(32), source_sha256: 'c'.repeat(64), name: 'good.txt' }] }));
  // More than the twenty displayed rows: the list window is not a retention or
  // result-access permission. Exact actions must still prove this older target.
  for (let index = 1; index <= 128; index++) {
    const token = index.toString(16).padStart(64, '0'), id = index.toString(16).padStart(32, '0');
    foreign.add(token);
    writeState(token, [{ id, name: 'unrelated.txt', status: 'stopped', checkpoint: 'stopped', error_code: 'SOURCE_READ_FAILED' }], index);
    const foreignReview = path.join(reviewRoot, token); fs.mkdirSync(foreignReview);
    fs.writeFileSync(path.join(foreignReview, 'manifest.json'), JSON.stringify({ schema: 'datasecure-document-run/1',
      batch_id: token, product_channel: 'standalone', processing_mode: 'markdown-and-anonymize', documents: [
        { document_id: id, source_sha256: 'd'.repeat(64), name: 'unrelated.txt' }] }));
    const exportId = `re_${sha(token).slice(0, 32)}`; foreignExports.add(exportId);
    fs.writeFileSync(path.join(data, 'result-export-state', `${exportId}.json`), JSON.stringify(exportRecord));
  }
  const before = boundedReads(() => {
    assert.equal(history.find(targetId).status, 'results_available');
    assert.equal(history.resolveResults(targetId).local_path, originalRun);
    assert.equal(history.resolveLedger(targetId).local_path, path.join(originalRun, 'DataSecure-Zuordnung.csv'));
    const failures = history.failures(targetId);
    assert.equal(failures.available, true); assert.equal(failures.total, 1);
    assert.equal(failures.files[0].name, 'stopped.txt');
    assert.equal(failures.content_notice_breakdown_complete, false, 'legacy provenance is unknown, not a proven notice-free result');
    assert.deepEqual(history.reviewTargets(targetId), []); assert.equal(history.feedback(targetId), null);
    assert.equal(history.documentFeedback(targetId), null);
    return history.find(targetId).result_count;
  });
  assert.equal(before.value, 1); assert.ok(before.export_reads >= 1);
  assert.equal(recoveryAttempts, 0);
  const retryId = 'c'.repeat(64);
  writeState(retryId, [{ id: 'c'.repeat(32), name: 'retry.txt', status: 'retryable',
    checkpoint: 'stopped', error_code: 'PROCESSING_INTERRUPTED' }], 1000000);
  boundedReads(() => {
    assert.equal(history.find(retryId).resumable, true, 'the exact reader preserves the real recovery policy');
    assert.equal(history.find(retryId).status, 'stopped');
  });
  const journalPath = path.join(batch._test.batchRoot(), `${targetId}.json`), journalBytes = fs.readFileSync(journalPath);
  fs.unlinkSync(journalPath); // A genuine retained summary and original binding survive journal retention.
  const retained = boundedReads(() => {
    assert.equal(history.find(targetId).status, 'results_available');
    assert.equal(history.resolveResults(targetId).local_path, originalRun);
    const failures = history.failures(targetId);
    assert.equal(failures.total, 1); assert.equal(failures.available, false, 'retired detailed evidence is not replaced by zero failures');
    assert.equal(failures.content_notice_breakdown_complete, false);
    assert.equal(batch.readStandaloneHistoryState(targetId), null);
  });
  assert.equal(retained.journal_reads, 0);
  const summaryPath = path.join(data, 'standalone-run-history', `${targetId}.json`), summaryBytes = fs.readFileSync(summaryPath);
  fs.writeFileSync(summaryPath, '{broken');
  boundedReads(() => assert.throws(() => history.find(targetId), code('STANDALONE_HISTORY_UNAVAILABLE')));
  fs.writeFileSync(summaryPath, summaryBytes);
  const missing = 'f'.repeat(64);
  boundedReads(() => {
    assert.equal(exporter.readStandaloneExportHistoryEntry(missing), null);
    assert.throws(() => history.find(missing), code('STANDALONE_HISTORY_MISSING'));
    assert.throws(() => history.find('../target'), code('STANDALONE_HISTORY_INVALID'));
  });
  fs.writeFileSync(journalPath, '{broken');
  boundedReads(() => assert.throws(() => history.failures(targetId), code('STANDALONE_HISTORY_UNAVAILABLE')));
  fs.writeFileSync(journalPath, journalBytes);
  const exportBytes = fs.readFileSync(exportPath);
  fs.writeFileSync(exportPath, '{broken');
  boundedReads(() => assert.throws(() => history.find(targetId), code('STANDALONE_HISTORY_UNAVAILABLE')));
  fs.writeFileSync(exportPath, exportBytes);
  const displacedReview = `${targetReview}-original`;
  fs.renameSync(targetReview, displacedReview);
  let danglingReview = false;
  try {
    fs.symlinkSync(path.join(root, 'absent-review-target'), targetReview, process.platform === 'win32' ? 'junction' : 'dir');
    danglingReview = true;
    assert.equal(fs.existsSync(targetReview), false, 'a dangling link is not absence of an anchor');
    boundedReads(() => assert.throws(() => history.find(targetId), code('STANDALONE_HISTORY_UNAVAILABLE')));
  } finally { if (danglingReview) fs.unlinkSync(targetReview); fs.renameSync(displacedReview, targetReview); }
  const actualLstat = fs.lstatSync;
  for (const refused of ['EACCES', 'EPERM', 'ENOTDIR']) {
    try {
      fs.lstatSync = function(file, ...args) {
        if (file === targetReview) throw Object.assign(Error('PRIVATE_OS_MESSAGE'), { code: refused });
        return actualLstat.call(this, file, ...args);
      };
      boundedReads(() => assert.throws(() => history.find(targetId), error =>
        error?.code === 'STANDALONE_HISTORY_UNAVAILABLE' && !error.message.includes('PRIVATE_OS_MESSAGE')));
    } finally { fs.lstatSync = actualLstat; }
  }
  const outbox = path.join(data, 'result-export-state'), movedOutbox = `${outbox}-original`;
  fs.renameSync(outbox, movedOutbox);
  let linked = false;
  try {
    fs.symlinkSync(movedOutbox, outbox, process.platform === 'win32' ? 'junction' : 'dir'); linked = true;
    boundedReads(() => assert.throws(() => history.find(targetId), code('STANDALONE_HISTORY_UNAVAILABLE')));
  } finally { if (linked) fs.unlinkSync(outbox); fs.renameSync(movedOutbox, outbox); }
  boundedReads(() => assert.equal(history.resolveResults(targetId).local_path, originalRun));
  const changed = JSON.parse(journalBytes); changed.product_channel = 'plugin';
  fs.writeFileSync(journalPath, JSON.stringify(changed));
  boundedReads(() => assert.throws(() => history.find(targetId), code('STANDALONE_HISTORY_MISSING')));
  fs.writeFileSync(journalPath, journalBytes);
  const movedRun = `${originalRun}-temporarily-offline`;
  fs.renameSync(originalRun, movedRun); fs.mkdirSync(originalRun);
  boundedReads(() => {
    assert.equal(history.find(targetId).results_available, false, 'same path with a replacement directory is not the original result');
    assert.throws(() => history.resolveResults(targetId), code('STANDALONE_RESULTS_MISSING'));
  });
  fs.rmdirSync(originalRun); fs.renameSync(movedRun, originalRun);
  boundedReads(() => assert.equal(history.resolveResults(targetId).local_path, originalRun, 'restoring the same original folder works without restart'));
  assert.equal(recoveryAttempts, 0, 'neither details nor folder access replay an export');
  const recoveryQueries = [], journalOpens = new Map(), originalOpen = fs.openSync;
  const listHistory = createRunHistory({ ...deps, recoverableStates(options) {
    assert.equal(typeof options?.batchId, 'string', 'production global history queries only selected incomplete candidates');
    recoveryQueries.push(options.batchId); return batch.standaloneRecoverableStates(options);
  } });
  fs.openSync = function(file, ...args) {
    if (typeof file === 'string' && path.dirname(file) === path.join(data, 'batches') && /^[a-f0-9]{64}\.json$/u.test(path.basename(file)))
      journalOpens.set(path.basename(file, '.json'), (journalOpens.get(path.basename(file, '.json')) || 0) + 1);
    return originalOpen.call(this, file, ...args);
  };
  let list;
  try { list = listHistory.history(); }
  finally { fs.openSync = originalOpen; }
  assert.equal(list.entries.length, 20); assert.equal(list.entries.find(row => row.batch_id === retryId).resumable, true);
  assert.deepEqual(recoveryQueries, [retryId], 'complete or invisible runs receive no second recovery scan');
  for (const token of [...foreign, targetId]) assert.equal(journalOpens.get(token), 1);
  assert.equal(journalOpens.get(retryId), 2, 'the one displayed incomplete candidate is freshly policy-validated');
  // The synthetic fallback remains supported after an explicit legacy list.
  fs.unlinkSync(journalPath);
  fs.unlinkSync(path.join(data, 'standalone-run-history', `${targetId}.json`));
  for (const token of [...foreign, retryId]) fs.unlinkSync(path.join(data, 'standalone-run-history', `${token}.json`));
  const legacyHistory = createRunHistory({ ...deps, readStates: () => [],
    readExports: () => [exporter.readStandaloneExportHistoryEntry(targetId)] });
  const alias = sha(`standalone-history:re_${sha(targetId).slice(0, 32)}`);
  assert.ok(legacyHistory.history().entries.some(row => row.batch_id === alias));
  // No immutable owner existed for this pre-content-options export. Its one
  // legacy name-only discovery is intentionally not asserted O(1).
  assert.equal(legacyHistory.resolveResults(alias).local_path, originalRun);
  assert.throws(() => exporter.readStandaloneExportHistoryEntry(alias, { legacyExportId: `re_${'0'.repeat(32)}` }),
    code('STANDALONE_HISTORY_INVALID'));
  const noticeData = path.join(root, 'notice-private'), savedData = process.env.EU_PRIVACY_DATA_ROOT;
  const noticeFacts = [];
  try {
    process.env.EU_PRIVACY_DATA_ROOT = noticeData;
    const states = Array.from({ length: 32 }, (_, index) => {
      const token = sha(`retained-notice-${index}`), id = token.slice(0, 32);
      const state = { schema: 'datasecure-batch/1', token, product_channel: 'standalone',
        processing_mode: 'markdown-and-anonymize', profile: 'general',
        created_at: new Date(now + index).toISOString(), items: [{ id, name: 'synthetic.txt', status: 'released', package_id: `ds_${id}` }] };
      store.recordStandaloneState(state, { reconstructContentNotices: false });
      assert.equal(store.recordStandaloneContentNoticeSummary(token, { content_notice_count: 1,
        content_notice_breakdown_complete: true }, 1), true);
      return state;
    });
    const measuredNotices = live => {
      const originalLstat = fs.lstatSync, accesses = new Map();
      fs.lstatSync = function(file, ...args) {
        if (typeof file === 'string' && path.dirname(file) === path.join(noticeData, 'standalone-run-history') &&
            /^notices-[a-f0-9]{64}\.json$/u.test(path.basename(file)))
          accesses.set(file, (accesses.get(file) || 0) + 1);
        return originalLstat.call(this, file, ...args);
      };
      let result;
      try { result = createRunHistory({ readStates: () => live, readExports: () => [],
        recoverableStates: () => [], liveExecutor: () => false }).history(); }
      finally { fs.lstatSync = originalLstat; }
      assert.equal(result.entries.length, 20);
      assert.equal([...accesses.values()].reduce((a, b) => a + b, 0), 20,
        'only the twenty selected rows read a notice cache, including retained/live overlays');
      assert.equal(accesses.size, 20); noticeFacts.push({ live_overlays: live.length, notice_accesses: accesses.size });
      return result;
    };
    assert.ok(measuredNotices([]).entries.every(row => row.content_notice_count === 1 && row.content_notice_breakdown_complete));
    const overlays = states.slice(-10);
    assert.ok(measuredNotices(overlays).entries.every(row => row.content_notice_count === 1 && row.content_notice_breakdown_complete));
    const lost = states.at(-1).token, corrupt = states.at(-2).token;
    fs.unlinkSync(path.join(noticeData, 'standalone-run-history', `notices-${lost}.json`));
    fs.writeFileSync(path.join(noticeData, 'standalone-run-history', `notices-${corrupt}.json`), '{');
    const unavailable = measuredNotices(overlays);
    for (const token of [lost, corrupt]) {
      const row = unavailable.entries.find(item => item.batch_id === token);
      assert.equal(row.content_notice_count, 0); assert.equal(row.content_notice_breakdown_complete, false,
        'a lost/corrupt notice remains unknown, never a proven count of zero');
    }
    assert.ok(store.readStandaloneSummaries().every(row => Object.hasOwn(row, 'content_notice_breakdown_complete')),
      'the default summary-reader contract remains enriched for existing callers');
    assert.ok(store.readStandaloneSummaries({ includeContentNotices: false }).every(row => !Object.hasOwn(row, 'content_notice_count')),
      'header-only selection neither reads nor invents a notice classification');
  } finally { process.env.EU_PRIVACY_DATA_ROOT = savedData; }
  const previousData = process.env.EU_PRIVACY_DATA_ROOT, freshData = path.join(root, 'fresh-private');
  try {
    process.env.EU_PRIVACY_DATA_ROOT = freshData;
    assert.throws(() => createRunHistory(deps).find('e'.repeat(64)), code('STANDALONE_HISTORY_MISSING'));
    assert.equal(fs.existsSync(freshData), false, 'a missing first-install history does not initialize journals, settings or result directories');
  } finally { process.env.EU_PRIVACY_DATA_ROOT = previousData; }
  console.log(JSON.stringify({ unrelated_runs: foreign.size, before_retention: before, after_retention: retained,
    notice_selection: noticeFacts,
    global_history: { journal_count: journalOpens.size, journal_reads: [...journalOpens.values()].reduce((a, b) => a + b, 0),
      fresh_recovery_candidates: recoveryQueries.length } }));
  console.log('STANDALONE TARGETED HISTORY PASS');
} finally { safeRemovePrivateTree(path.dirname(root), path.basename(root)); }
