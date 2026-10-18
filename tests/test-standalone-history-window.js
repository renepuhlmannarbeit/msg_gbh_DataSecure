'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-history-window-'));
process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'private');
process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(root, 'results');
process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
const batch = require('../plugins/data-secure/server/gateway/batch');
const exporter = require('../plugins/data-secure/server/gateway/result-export');
const store = require('../plugins/data-secure/server/gateway/standalone-history-store');
const { createRunHistory } = require('../plugins/data-secure/server/standalone/run-history');
const { createBatchPseudonymState } = require('../plugins/data-secure/server/batch-pseudonym-context');
const { validatePrivateMessage } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const data = process.env.EU_PRIVACY_DATA_ROOT, states = [], now = Date.now();
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const history = createRunHistory({ readStates: batch.readStandaloneHistoryStates, readState: batch.readStandaloneHistoryState,
  readExports: exporter.readStandaloneExportHistory, readExport: exporter.readStandaloneExportHistoryEntry,
  recentHistory: store.readRecentHistory, liveExecutor: () => false, recoverableStates: batch.standaloneRecoverableStates,
  pendingDocumentExports: () => false });
function save(index) {
  const token = sha(`window-${index}`);
  const state = { schema: 'datasecure-batch/1', token, product_channel: 'standalone', profile: 'general',
    created_at: new Date(now + index * 1000).toISOString(), expires_at: new Date(now + 86400000).toISOString(),
    ...createBatchPseudonymState({ productChannel: 'standalone' }),
    items: [{ id: token.slice(0, 32), name: 'synthetic.txt', status: 'stopped', checkpoint: 'stopped', error_code: 'SOURCE_READ_FAILED' }] };
  batch._test.writeState(state); states.push(state); return state;
}
function bounded(action) {
  const methods = Object.fromEntries(['openSync', 'readFileSync', 'readdirSync'].map(key => [key, fs[key]]));
  const registered = new Set(store.readRecentHistory().map(row => row.batch_id));
  const old = states.filter(state => !registered.has(state.token));
  const forbidden = new Set(old.flatMap(state => [state.token, `${state.token}.json`, `re_${sha(state.token).slice(0, 32)}.json`]));
  const global = new Set(['batches', 'document-reviews', 'result-export-state', 'standalone-run-history', 'standalone-history-visibility']
    .map(name => path.join(data, name)));
  let foreignReads = 0, globalScans = 0;
  function inspect(file) {
    if (typeof file === 'string' && path.resolve(file).split(path.sep).some(part => forbidden.has(part))) {
      foreignReads++; throw Error('OLDER_RUN_TOUCHED');
    }
  }
  for (const name of ['openSync', 'readFileSync']) fs[name] = function(file, ...args) { inspect(file); return methods[name].call(this, file, ...args); };
  fs.readdirSync = function(file, ...args) {
    inspect(file);
    if (global.has(path.resolve(file))) { globalScans++; throw Error('GLOBAL_HISTORY_SCAN'); }
    return methods.readdirSync.call(this, file, ...args);
  };
  let value;
  try { value = action(); } finally { Object.assign(fs, methods); }
  assert.equal(foreignReads, 0); assert.equal(globalScans, 0); return value;
}
try {
  for (let index = 1; index <= 16; index++) save(index);
  const expected = states.slice(-5).reverse().map(state => state.token);
  const fingerprints = new Map(states.flatMap(state => ['batches', 'standalone-run-history'].map(directory => {
    const file = path.join(data, directory, `${state.token}.json`); return [file, sha(fs.readFileSync(file))];
  })));
  assert.deepEqual(store.readRecentHistory().map(row => row.batch_id), expected);
  assert.deepEqual(bounded(() => history.history()).entries.map(row => row.batch_id), expected);
  assert.equal(bounded(() => history.captureExistingExportBindings()).export_count, 0,
    'startup/folder capture uses exact IDs, never the old all-export capture index');
  // An old worker/recovery can refresh its summary without entering the UI window.
  batch._test.writeState(states[0]);
  assert.deepEqual(store.readRecentHistory().map(row => row.batch_id), expected);
  history.setVisibility(expected[0], true);
  assert.deepEqual(bounded(() => history.history()).entries.map(row => row.batch_id), expected.slice(1));
  assert.equal(bounded(() => history.history()).hidden_count, 1);
  assert.equal(bounded(() => history.history({ includeHidden: true })).entries.length, 5, 'no sixth row backfills a hidden slot');
  assert.equal(history.history({ batchId: states[0].token }).entries[0].batch_id, states[0].token,
    'an explicit old detail is still read exactly, not rediscovered from a global list');
  const fresh = execFileSync(process.execPath, ['-e', `const s=require('./plugins/data-secure/server/gateway/standalone-history-store');process.stdout.write(JSON.stringify(s.readRecentHistory()))`],
    { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true });
  assert.deepEqual(JSON.parse(fresh).map(row => row.batch_id), expected, 'five identities survive restart');
  for (const [file, hash] of fingerprints) assert.equal(sha(fs.readFileSync(file)), hash, 'no run/result/summary is deleted by eviction or hide');
  // First-install migration scans compact headers only; once published, no poll repeats it.
  const index = path.join(data, 'standalone-history-window', 'recent.json'), before = fs.readFileSync(index);
  fs.renameSync(index, `${index}.fixture-backup`);
  assert.deepEqual(store.readRecentHistory().map(row => row.batch_id), expected);
  assert.deepEqual(bounded(() => history.history({ includeHidden: true })).entries.map(row => row.batch_id), expected);
  // Damaged and linked indices fail closed without all-history fallback or silent repair.
  fs.writeFileSync(index, '{damaged');
  assert.throws(() => bounded(() => history.history()), error => error.code === 'STANDALONE_HISTORY_UNAVAILABLE');
  assert.doesNotThrow(() => store.recordStandaloneState(states[0], { reconstructContentNotices: false }),
    'a damaged UI index cannot block mandatory summary preservation/recovery or following worker hooks');
  assert.equal(store.readStandaloneSummary(states[0].token).complete, true);
  assert.equal(fs.readFileSync(index, 'utf8'), '{damaged');
  fs.writeFileSync(index, before);
  // Missing historical journals/summaries do not make an older sixth run reappear.
  const missing = expected[1];
  for (const directory of ['batches', 'standalone-run-history']) {
    const file = path.join(data, directory, `${missing}.json`); fs.renameSync(file, `${file}.fixture-backup`);
  }
  assert.equal(bounded(() => history.history({ includeHidden: true })).entries.length, 4);
  const next = save(17);
  const final = store.readRecentHistory().map(row => row.batch_id);
  assert.equal(final.length, 5); assert.equal(final[0], next.token); assert.equal(final.includes(expected.at(-1)), false);
  const base = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(32), action: 'get_run_history' };
  assert.equal(validatePrivateMessage({ ...base, batch_id: states[0].token }).batch_id, states[0].token);
  for (const extra of [{ batch_id: '../bad' }, { batch_id: states[0].token, include_hidden: true },
    { batch_id: states[0].token, recover_exports: true, recover_batch_id: states[0].token }])
    assert.throws(() => validatePrivateMessage({ ...base, ...extra }));
  // Export-only pre-summary compatibility uses raw discovery metadata once.
  // A plausible locator MUST NOT grant an action without an actual valid receipt.
  const savedData = process.env.EU_PRIVACY_DATA_ROOT;
  try {
    process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'legacy-private');
    const outbox = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'result-export-state');
    fs.mkdirSync(outbox, { recursive: true });
    const legacyId = `re_${'a'.repeat(32)}`, alias = sha(`standalone-history:${legacyId}`);
    fs.writeFileSync(path.join(outbox, `${legacyId}.json`), JSON.stringify({ schema: 'datasecure-result-export/2',
      product_channel: 'standalone', run_directory: 'Lauf-20261018-120000-1234abcd', items: [] }));
    const modernId = sha('modern-no-summary'), modernExport = `re_${sha(modernId).slice(0, 32)}`;
    const originalDate = new Date(now - 1001).toISOString();
    fs.mkdirSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'batches'));
    fs.writeFileSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'batches', `${modernId}.json`),
      JSON.stringify({ token: modernId, product_channel: 'standalone', created_at: originalDate }));
    fs.writeFileSync(path.join(outbox, `${modernExport}.json`), JSON.stringify({ schema: 'datasecure-result-export/6',
      batch_id: modernId, product_channel: 'standalone', run_directory: 'Lauf-20261018-120000-1234abcd', items: [] }));
    const entries = store.readRecentHistory();
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.find(row => row.batch_id === alias), { batch_id: alias, created_at: '2026-10-18T12:00:00.000Z', legacy_export_id: legacyId });
    assert.deepEqual(entries.find(row => row.batch_id === modernId), { batch_id: modernId, created_at: originalDate },
      'a known real batch retains its exact original date instead of a second synthetic export identity');
    assert.equal(store.readHistoryLocator(alias), legacyId);
    assert.throws(() => history.resolveResults(alias), 'discovery metadata alone is never a result-opening permission');
    for (let index = 20; index < 26; index++) save(index);
    assert.equal(store.readRecentHistory().some(row => row.batch_id === alias), false);
    assert.equal(store.readHistoryLocator(alias), legacyId, 'exact legacy locator survives eviction and restart');
    const window = require('../plugins/data-secure/server/gateway/standalone-history-window');
    const lateId = sha('late-real-registration'), lateExport = `re_${sha(lateId).slice(0, 32)}`;
    const lateAlias = sha(`standalone-history:${lateExport}`), latestDate = new Date(now + 100000).toISOString();
    const testIndex = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'standalone-history-window', 'recent.json');
    fs.renameSync(testIndex, `${testIndex}.alias-fixture-backup`);
    window.readRecentHistory(() => [{ batch_id: lateAlias, legacy_export_id: lateExport, created_at: latestDate }]);
    window.registerHistory({ batch_id: lateId, created_at: latestDate }, () => []);
    assert.deepEqual(window.readRecentHistory(() => { throw Error('MUST_NOT_MIGRATE_AGAIN'); }),
      [{ batch_id: lateId, created_at: latestDate }], 'a late real identity removes its old alias instead of occupying two slots');
  } finally { process.env.EU_PRIVACY_DATA_ROOT = savedData; }
  try {
    process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'migration-limit-private');
    const migrationOutbox = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'result-export-state');
    const migrationHistory = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'standalone-run-history');
    fs.mkdirSync(migrationOutbox, { recursive: true }); fs.mkdirSync(migrationHistory);
    fs.writeFileSync(path.join(migrationHistory, `${sha('broken-old-summary')}.json`), '');
    for (let index = 0; index < 36; index++) {
      const id = `re_${index.toString(16).padStart(32, '0')}`;
      fs.writeFileSync(path.join(migrationOutbox, `${id}.json`), JSON.stringify({ schema: 'datasecure-result-export/2',
        product_channel: 'standalone', run_directory: `Lauf-20261018-1300${String(index).padStart(2, '0')}-1234abcd`, items: [] }));
    }
    assert.equal(store.readRecentHistory().length, 5);
    assert.equal(fs.readdirSync(migrationHistory).filter(name => /^legacy-[a-f0-9]{64}\.json$/u.test(name)).length, 5,
      'one-time migration publishes only five chosen locators, not one per historical export');
    assert.equal(fs.readdirSync(migrationOutbox).length, 36, 'all old export records remain untouched');
  } finally { process.env.EU_PRIVACY_DATA_ROOT = savedData; }
  console.log('PASS: persistent five-run window, real bounded production reads/capture, restart, hide, old worker, migration, missing/corrupt records, exact details');
} finally {
  assert.equal(path.dirname(root), fs.realpathSync.native(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('datasecure-history-window-'));
  fs.rmSync(root, { recursive: true, force: true });
}
