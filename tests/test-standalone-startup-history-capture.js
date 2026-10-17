'use strict';

// Real on-disk legacy exports, review anchors, compact summaries and user result
// directories. This profiles the startup capture boundary, not the separate
// native bootstrap/recovery gates or platform-specific Finder/WebView behavior.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-history-capture-'));
const argumentsOk = process.argv.slice(2).every(value => value === '--profile=320');
assert.equal(argumentsOk, true, 'only the bounded opt-in --profile=320 is supported');
process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'private');
process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(root, 'results');
process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
const { safeRemovePrivateTree } = require('../plugins/data-secure/server/gateway/common');
const store = require('../plugins/data-secure/server/gateway/standalone-history-store');
const exporter = require('../plugins/data-secure/server/gateway/result-export');
const { createRunHistory } = require('../plugins/data-secure/server/standalone/run-history');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const data = process.env.EU_PRIVACY_DATA_ROOT, results = process.env.EU_PRIVACY_RESULT_ROOT;
const outbox = path.join(data, 'result-export-state'), reviews = path.join(data, 'document-reviews');
const journals = path.join(data, 'synthetic-history-journals'), historyDirectory = path.join(data, 'standalone-run-history');
let reads = 0;
const readStates = () => fs.readdirSync(journals).map(name => JSON.parse(fs.readFileSync(path.join(journals, name))));
const readExports = () => { reads++; return exporter.readStandaloneExportHistory(); };
const history = () => createRunHistory({ readStates, readExports, captureExportIndex: true,
  recoverableStates: () => [], liveExecutor: () => false });
function profile(action) {
  const original = {}, result = { opens: 0, read_bytes: 0, stats: 0, listings: 0, review_root_listings: 0, listed_entries: 0 };
  for (const name of ['openSync', 'readSync', 'lstatSync', 'statSync', 'readdirSync']) original[name] = fs[name];
  fs.openSync = function(...args) { result.opens++; return original.openSync.apply(this, args); };
  fs.readSync = function(...args) { const size = original.readSync.apply(this, args); result.read_bytes += size; return size; };
  fs.lstatSync = function(...args) { result.stats++; return original.lstatSync.apply(this, args); };
  fs.statSync = function(...args) { result.stats++; return original.statSync.apply(this, args); };
  fs.readdirSync = function(file, ...args) { const rows = original.readdirSync.call(this, file, ...args);
    result.listings++; result.listed_entries += rows.length;
    if (path.resolve(file) === reviews) result.review_root_listings++; return rows; };
  const start = process.hrtime.bigint();
  try { result.value = action(); }
  finally { for (const [name, method] of Object.entries(original)) fs[name] = method; }
  result.elapsed_ms = Number(process.hrtime.bigint() - start) / 1e6;
  return result;
}
function oldCapture() {
  const states = readStates();
  for (const state of states) store.recordStandaloneState(state, { reconstructContentNotices: false });
  const exports = readExports();
  for (const row of exports) if (row.directory && !store.boundRun(row.export_id, row.run_directory))
    store.recordStandaloneExport(row.target, { product_channel: 'standalone', complete: row.complete }, row.directory);
  return { journal_count: states.length, export_count: exports.length };
}
try {
  for (const directory of [data, results, path.join(results, 'DataSecure-Output'), journals, outbox, reviews])
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const count = process.argv.includes('--profile=320') ? 320 : 8;
  const destination = exporter._test.activeDestination({ schema: exporter.SCHEMA }, { create: false });
  for (let index = 1; index <= count; index++) {
    const token = index.toString(16).padStart(64, '0'), exportId = `re_${sha(token).slice(0, 32)}`;
    const runName = `Lauf-20261017-100000-${index.toString(16).padStart(8, '0')}`;
    const items = [0, 1, 2, 3].map(offset => ({ id: (index * 4 + offset).toString(16).padStart(32, '0'),
      name: `synthetic-${offset}.txt`, sha256: 'a'.repeat(64), status: 'released',
      package_id: `ds_${(index * 4 + offset).toString(16).padStart(32, '0')}` }));
    const state = { schema: 'datasecure-batch/1', token, product_channel: 'standalone', processing_mode: 'markdown-and-anonymize',
      profile: 'general', created_at: new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(), items };
    fs.writeFileSync(path.join(journals, `${token}.json`), JSON.stringify(state));
    const run = path.join(reviews, token); fs.mkdirSync(run);
    fs.writeFileSync(path.join(run, 'manifest.json'), JSON.stringify({ schema: 'datasecure-document-run/1', batch_id: token,
      product_channel: 'standalone', processing_mode: 'markdown-and-anonymize',
      documents: items.map(row => ({ document_id: row.id, source_sha256: row.sha256, name: row.name })) }));
    const record = { schema: exporter.SCHEMA, product_channel: 'standalone', run_directory: runName,
      destination_id: destination.id, complete: true,
      items: items.map((row, offset) => ({ package_id: row.package_id,
        file: `Dokument-${String(offset + 1).padStart(3, '0')}-anonymisiert.md`, sha256: 'b'.repeat(64), source_label: row.name, exported: true })) };
    assert.equal(exporter.validRecord(record), true);
    fs.writeFileSync(path.join(outbox, `${exportId}.json`), JSON.stringify(record));
    fs.mkdirSync(path.join(results, 'DataSecure-Output', runName));
  }
  oldCapture(); // Establish durable captures, without a new index.
  const before = profile(oldCapture);
  assert.equal(before.value.journal_count, count); assert.equal(before.value.export_count, count);
  const cold = history().captureDurableHistory(); assert.equal(cold.export_capture_reused, false);
  const readsBefore = reads, after = profile(() => history().captureDurableHistory());
  assert.equal(after.value.export_capture_reused, true); assert.equal(reads, readsBefore);
  assert.equal(after.value.journal_count, count); assert.equal(after.value.export_count, count);
  assert.equal(before.review_root_listings, 2, 'one owner inventory plus final membership validation, not one scan per export');
  assert.equal(after.review_root_listings, 1);
  assert.ok(before.listed_entries <= count * 5 + 8, 'the full reader is linear even when the aggregate capture index cannot be reused');
  assert.equal(store.readStandaloneSummaries().length, count, 'all source summaries remain durable before retention');
  const indexFile = path.join(historyDirectory, 'export-capture-index.json');
  const firstRow = exporter.readStandaloneExportHistory()[0];
  const runPath = store.boundRun(firstRow.export_id, firstRow.run_directory);
  assert.ok(runPath);
  const firstBytes = fs.readFileSync(firstRow.target), changedRecord = JSON.parse(firstBytes);
  changedRecord.items[0].sha256 = 'c'.repeat(64);
  fs.writeFileSync(firstRow.target, JSON.stringify(changedRecord));
  const changed = profile(() => history().captureDurableHistory());
  assert.equal(changed.value.export_capture_reused, false);
  assert.equal(changed.review_root_listings, 4, 'changed source: before inventory, two linear owner scans, after inventory');
  assert.ok(changed.listed_entries <= count * 12 + 24, 'one changed export does not reintroduce quadratic owner discovery');
  fs.writeFileSync(firstRow.target, firstBytes); history().captureDurableHistory();
  const globalHistory = profile(() => history().history());
  assert.equal(globalHistory.review_root_listings, 2);
  assert.ok(globalHistory.listed_entries <= count * 9 + 24);
  // The name index is private to one invocation. It must never hide malformed
  // owner candidates or claim an unchanged membership after a concurrent edit.
  const firstToken = fs.readdirSync(reviews).find(token => `re_${sha(token).slice(0, 32)}.json` === path.basename(firstRow.target));
  assert.ok(firstToken);
  const firstReview = path.join(reviews, firstToken), savedReview = `${firstReview}-saved`;
  fs.renameSync(firstReview, savedReview);
  try {
    fs.writeFileSync(firstReview, 'not a directory');
    assert.equal(exporter.readStandaloneExportHistory().some(row => row.export_id === firstRow.export_id), false,
      'a token-named file is an unsafe owner candidate, not proof of no owner');
    fs.unlinkSync(firstReview);
    let linked = false;
    try {
      fs.symlinkSync(path.join(root, 'missing-owner'), firstReview, process.platform === 'win32' ? 'junction' : 'dir'); linked = true;
      assert.equal(exporter.readStandaloneExportHistory().some(row => row.export_id === firstRow.export_id), false,
        'a dangling token-named link cannot fall back to a genuine old export');
    } finally { if (linked) fs.unlinkSync(firstReview); }
  } finally { fs.renameSync(savedReview, firstReview); }
  const owners = path.join(data, 'result-export-owners'); fs.mkdirSync(owners, { recursive: true });
  const ownerPath = path.join(owners, path.basename(firstRow.target));
  fs.writeFileSync(ownerPath, JSON.stringify({ schema: 'datasecure-content-export-owner/1', record_name: path.basename(firstRow.target),
    batch_id: firstToken, product_channel: 'standalone', processing_mode: 'markdown-and-anonymize',
    content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false } }));
  assert.equal(exporter.readStandaloneExportHistory().some(row => row.export_id === firstRow.export_id), false,
    'a fresh independent owner rejects a mutable record disguised as legacy');
  fs.unlinkSync(ownerPath);
  const manifestPath = path.join(firstReview, 'manifest.json'), manifestBytes = fs.readFileSync(manifestPath);
  const wrongManifest = JSON.parse(manifestBytes); wrongManifest.processing_mode = 'markdown-only';
  fs.writeFileSync(manifestPath, JSON.stringify(wrongManifest));
  assert.equal(exporter.readStandaloneExportHistory().some(row => row.export_id === firstRow.export_id), false,
    'the actual manifest is freshly read, never replaced by the name inventory');
  fs.writeFileSync(manifestPath, manifestBytes);
  const originalOpen = fs.openSync, addedOwner = path.join(reviews, 'f'.repeat(64));
  let mutated = false;
  fs.openSync = function(file, ...args) {
    if (!mutated && file === firstRow.target) { mutated = true; fs.writeFileSync(addedOwner, 'new unsafe candidate'); }
    return originalOpen.call(this, file, ...args);
  };
  try { assert.throws(() => exporter.readStandaloneExportHistory(), { code: 'RESULT_EXPORT_STATE_UNSAFE' }); }
  finally { fs.openSync = originalOpen; if (mutated) fs.unlinkSync(addedOwner); }
  assert.equal(mutated, true);
  // A real worker may create its review directory while another process reads
  // History. Discard the first projection and rebuild once, without replaying
  // any batch/export or adopting a replaced parent.
  const concurrentOwner = path.join(reviews, 'e'.repeat(64));
  let targetReads = 0;
  fs.openSync = function(file, ...args) {
    if (file === firstRow.target && ++targetReads === 1) fs.mkdirSync(concurrentOwner);
    return originalOpen.call(this, file, ...args);
  };
  try {
    assert.equal(exporter.readStandaloneExportHistory().some(row => row.export_id === firstRow.export_id), true);
    assert.equal(targetReads, 2, 'a legitimate new owner requires a complete fresh read, not acceptance of the old projection');
  } finally { fs.openSync = originalOpen; if (fs.existsSync(concurrentOwner)) fs.rmdirSync(concurrentOwner); }
  const secondConcurrentOwner = path.join(reviews, 'd'.repeat(64));
  targetReads = 0;
  fs.openSync = function(file, ...args) {
    if (file === firstRow.target) {
      targetReads++;
      if (targetReads <= 2) fs.mkdirSync(targetReads === 1 ? concurrentOwner : secondConcurrentOwner);
    }
    return originalOpen.call(this, file, ...args);
  };
  try {
    assert.throws(() => exporter.readStandaloneExportHistory(), { code: 'RESULT_EXPORT_STATE_UNSAFE' });
    assert.equal(targetReads, 2, 'a second namespace change fails closed, without an unbounded retry or stale first list');
  } finally {
    fs.openSync = originalOpen;
    for (const directory of [concurrentOwner, secondConcurrentOwner]) if (fs.existsSync(directory)) fs.rmdirSync(directory);
  }
  // A legacy-looking first projection cannot survive newly discovered owner
  // evidence: the second full read must examine the actual new manifest.
  fs.renameSync(firstReview, savedReview); targetReads = 0;
  fs.openSync = function(file, ...args) {
    if (file === firstRow.target && ++targetReads === 1) {
      fs.mkdirSync(firstReview); fs.writeFileSync(manifestPath, JSON.stringify(wrongManifest));
    }
    return originalOpen.call(this, file, ...args);
  };
  try {
    assert.equal(exporter.readStandaloneExportHistory().some(row => row.export_id === firstRow.export_id), false,
      'freshly discovered incompatible owner must invalidate the stale legacy projection');
    assert.equal(targetReads, 2);
  } finally {
    fs.openSync = originalOpen;
    if (fs.existsSync(firstReview)) { fs.unlinkSync(manifestPath); fs.rmdirSync(firstReview); }
    fs.renameSync(savedReview, firstReview);
  }
  // The outer namespace binding is retained across both attempts as well.
  const savedOutbox = `${outbox}-saved`; targetReads = 0;
  fs.openSync = function(file, ...args) {
    if (file === firstRow.target) {
      targetReads++;
      if (targetReads === 1) fs.mkdirSync(concurrentOwner);
      if (targetReads === 2) { fs.renameSync(outbox, savedOutbox); fs.mkdirSync(outbox); }
    }
    return originalOpen.call(this, file, ...args);
  };
  try { assert.throws(() => exporter.readStandaloneExportHistory(), { code: 'RESULT_EXPORT_STATE_UNSAFE' }); }
  finally {
    fs.openSync = originalOpen;
    if (fs.existsSync(savedOutbox)) { fs.rmdirSync(outbox); fs.renameSync(savedOutbox, outbox); }
    if (fs.existsSync(concurrentOwner)) fs.rmdirSync(concurrentOwner);
  }
  const movedReviews = `${reviews}-saved`; mutated = false;
  fs.openSync = function(file, ...args) {
    if (!mutated && file === firstRow.target) { mutated = true; fs.renameSync(reviews, movedReviews); fs.mkdirSync(reviews); }
    return originalOpen.call(this, file, ...args);
  };
  try { assert.throws(() => exporter.readStandaloneExportHistory(), { code: 'RESULT_EXPORT_STATE_UNSAFE' }); }
  finally { fs.openSync = originalOpen; if (mutated) { fs.rmdirSync(reviews); fs.renameSync(movedReviews, reviews); } }
  assert.equal(mutated, true);
  fs.renameSync(reviews, movedReviews); mutated = false; targetReads = 0;
  fs.openSync = function(file, ...args) {
    if (file === firstRow.target && ++targetReads === 1) { mutated = true; fs.mkdirSync(reviews); }
    return originalOpen.call(this, file, ...args);
  };
  try {
    assert.equal(exporter.readStandaloneExportHistory().some(row => row.export_id === firstRow.export_id), true);
    assert.equal(targetReads, 2, 'first ordinary owner-root creation also discards the absence snapshot');
  }
  finally { fs.openSync = originalOpen; if (mutated) fs.rmdirSync(reviews); fs.renameSync(movedReviews, reviews); }
  assert.equal(mutated, true, 'an initially absent owner root is rechecked instead of becoming an absence cache');
  assert.equal(exporter.readStandaloneExportHistory().some(row => row.export_id === firstRow.export_id), true,
    'a later call can revalidate the restored original source without an error latch');
  const expectFullCapture = action => { action(); const prior = reads; const value = history().captureDurableHistory();
    assert.equal(value.export_capture_reused, false); assert.equal(reads, prior + 1); };
  // The large profile above is the performance gate. Exercise each corruption
  // fallback on one retained source plan instead of repeating the full source
  // inventory seven more times in every CI run.
  expectFullCapture(() => {
    for (const name of fs.readdirSync(outbox)) if (name !== path.basename(firstRow.target)) fs.unlinkSync(path.join(outbox, name));
    const keep = fs.readdirSync(journals).find(name => `re_${sha(name.slice(0, -5)).slice(0, 32)}.json` === path.basename(firstRow.target));
    assert.ok(keep);
    for (const name of fs.readdirSync(journals)) if (name !== keep) fs.unlinkSync(path.join(journals, name));
  });
  expectFullCapture(() => fs.unlinkSync(indexFile));
  expectFullCapture(() => fs.writeFileSync(indexFile, '{'));
  expectFullCapture(() => fs.writeFileSync(path.join(historyDirectory, 'export-capture-index-pin.json'), '{}'));
  expectFullCapture(() => { const bytes = fs.readFileSync(indexFile); fs.renameSync(indexFile, `${indexFile}.old`);
    fs.writeFileSync(indexFile, bytes); });
  expectFullCapture(() => { const record = JSON.parse(fs.readFileSync(firstRow.target)); record.items[0].sha256 = 'c'.repeat(64);
    const stat = fs.statSync(firstRow.target); fs.writeFileSync(firstRow.target, JSON.stringify(record));
    fs.utimesSync(firstRow.target, stat.atime, stat.mtime); });
  expectFullCapture(() => { const token = fs.readdirSync(reviews)[0], file = path.join(reviews, token, 'manifest.json');
    const bytes = fs.readFileSync(file); fs.writeFileSync(file, Buffer.concat([bytes, Buffer.from(' ')])); });
  const bindingFile = path.join(historyDirectory, `${firstRow.export_id}.json`), bindingBytes = fs.readFileSync(bindingFile);
  expectFullCapture(() => fs.writeFileSync(bindingFile, '{}'));
  assert.equal(fs.readFileSync(bindingFile, 'utf8'), '{}', 'capture never replaces an existing damaged original destination binding');
  fs.writeFileSync(bindingFile, bindingBytes);
  assert.equal(history().captureDurableHistory().export_capture_reused, true,
    'restoring exact original evidence can reuse the last valid capture, without a permanent failure latch');
  // Cache reuse creates no export authority: moved/replaced destinations are
  // still refused by the live binding check, even when source metadata matches.
  fs.renameSync(runPath, `${runPath}-saved`); fs.mkdirSync(runPath);
  assert.equal(history().captureDurableHistory().export_capture_reused, true);
  assert.equal(store.inspectBoundRun(firstRow.export_id, firstRow.run_directory).availability, 'unsafe');
  fs.rmdirSync(runPath); fs.renameSync(`${runPath}-saved`, runPath);
  assert.equal(store.inspectBoundRun(firstRow.export_id, firstRow.run_directory).availability, 'available');
  // Actual journal retirement leaves every compact historical run behind.
  for (const name of fs.readdirSync(journals)) fs.unlinkSync(path.join(journals, name));
  assert.equal(history().captureDurableHistory().journal_count, 0);
  assert.equal(store.readStandaloneSummaries().length, count);
  const savedData = process.env.EU_PRIVACY_DATA_ROOT, savedResults = process.env.EU_PRIVACY_RESULT_ROOT;
  try {
    process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'fresh-private');
    delete process.env.EU_PRIVACY_RESULT_ROOT;
    fs.mkdirSync(process.env.EU_PRIVACY_DATA_ROOT);
    const fresh = createRunHistory({ readStates: () => [], readExports: exporter.readStandaloneExportHistory,
      captureExportIndex: true, recoverableStates: () => [], liveExecutor: () => false });
    assert.deepEqual(fresh.captureDurableHistory(), { journal_count: 0, export_count: 0, export_capture_reused: false },
      'a fresh profile without settings, history or a result destination remains valid');
    assert.equal(fs.existsSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'settings')), false);
    const emptyOutbox = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'result-export-state'); fs.rmdirSync(emptyOutbox);
    let linked = false;
    try {
      fs.symlinkSync(outbox, emptyOutbox, process.platform === 'win32' ? 'junction' : 'dir'); linked = true;
      assert.equal(fresh.captureDurableHistory().export_capture_reused, false, 'redirected source storage cannot reuse capture evidence');
      assert.equal(fs.existsSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'standalone-run-history', 'export-capture-index.json')), false);
    } finally { if (linked) fs.unlinkSync(emptyOutbox); }
  } finally { process.env.EU_PRIVACY_DATA_ROOT = savedData; process.env.EU_PRIVACY_RESULT_ROOT = savedResults; }
  const compact = ({ value, ...counts }) => counts;
  console.log(JSON.stringify({ case: `${count} real filesystem historical runs; four sources/run`,
    before: compact(before), after: compact(after), changed: compact(changed), global_history: compact(globalHistory) }));
  console.log('STANDALONE STARTUP HISTORY CAPTURE PASS');
} finally { safeRemovePrivateTree(path.dirname(root), path.basename(root)); }
