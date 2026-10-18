'use strict';

// Real private held files and the production early-skip readers. This never
// opens the user's data namespace, launches the app, or needs a desktop.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-history-visibility-'));
process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'private');
process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(root, 'results');
process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
const batch = require('../plugins/data-secure/server/gateway/batch');
const exporter = require('../plugins/data-secure/server/gateway/result-export');
const historyStore = require('../plugins/data-secure/server/gateway/standalone-history-store');
const visibility = require('../plugins/data-secure/server/gateway/standalone-history-visibility');
const { createRunHistory } = require('../plugins/data-secure/server/standalone/run-history');
const { createBatchPseudonymState } = require('../plugins/data-secure/server/batch-pseudonym-context');
const { validatePrivateMessage } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const data = process.env.EU_PRIVACY_DATA_ROOT, states = [], now = Date.now();
const checkCode = code => error => error?.code === code;
let pending = false, live = false;
const observed = [], exportObserved = [];
const deps = {
  recentHistory: historyStore.readRecentHistory,
  readStates(options) { observed.push(options); return batch.readStandaloneHistoryStates(options); },
  readState: batch.readStandaloneHistoryState,
  readExports(options) { exportObserved.push(options); return exporter.readStandaloneExportHistory(options); },
  readExport: exporter.readStandaloneExportHistoryEntry,
  recoverableStates: batch.standaloneRecoverableStates,
  liveExecutor: state => live && state.token === states.at(-1)?.token,
  pendingDocumentExports: () => pending
};
const history = createRunHistory(deps);
function save(index, status = 'stopped') {
  const token = index.toString(16).padStart(64, '0');
  const state = { schema: 'datasecure-batch/1', token, product_channel: 'standalone', profile: 'general',
    created_at: new Date(now + index * 1000).toISOString(), expires_at: new Date(now + 86400000).toISOString(),
    ...createBatchPseudonymState({ productChannel: 'standalone' }),
    items: [{ id: index.toString(16).padStart(32, '0'), name: 'synthetic.txt', status, checkpoint: 'stopped', error_code: 'SOURCE_READ_FAILED' }] };
  batch._test.writeState(state); states.push(state); return state;
}
const hashes = () => new Map(states.flatMap(state => [
  path.join(data, 'batches', `${state.token}.json`),
  path.join(data, 'standalone-run-history', `${state.token}.json`)
]).map(file => [file, fs.readFileSync(file)]));
try {
  for (let index = 1; index <= 30; index++) save(index);
  const initial = hashes();
  const newest = states.at(-1).token;
  assert.equal(history.history().entries.length, 5);
  assert.equal(history.history().open_count, 0);
  for (const state of states.slice(-8)) assert.equal(history.setVisibility(state.token, true).hidden, true);
  const rawHiddenReads = new Map(states.slice(-8).map(state => [path.join(data, 'batches', `${state.token}.json`), 0]));
  const originalOpen = fs.openSync;
  fs.openSync = function(file, ...args) {
    if (rawHiddenReads.has(file)) rawHiddenReads.set(file, rawHiddenReads.get(file) + 1);
    return originalOpen.call(this, file, ...args);
  };
  let hidden;
  try { hidden = history.history(); } finally { fs.openSync = originalOpen; }
  assert.equal(hidden.entries.length, 0, 'hiding the five current rows never backfills a sixth');
  assert.equal(hidden.hidden_count, 5);
  assert.equal(hidden.open_count, 0);
  assert.equal(hidden.entries.some(row => row.hidden), false);
  assert.equal(observed.at(-1).omitBatchIds.length, 5, 'filter reaches production readers before full journal replay');
  assert.equal(exportObserved.at(-1).omitBatchIds.length, 5, 'hidden export plans are omitted before full anchor/receipt verification');
  for (const [file, reads] of rawHiddenReads) assert.equal(reads,
    states.slice(-5).some(state => path.basename(file, '.json') === state.token) ? 1 : 0,
    'only the five current pins are checked; older hidden runs are not opened');
  const all = history.history({ includeHidden: true });
  assert.equal(all.entries[0].batch_id, newest);
  assert.equal(all.entries[0].hidden, true);
  assert.equal(all.hidden_count, 5);
  assert.equal(observed.at(-1).omitBatchIds.length, 0);
  assert.equal(history.find(newest).batch_id, newest, 'targeted access ignores display preference');
  for (const [file, before] of initial) assert.deepEqual(fs.readFileSync(file), before, 'hiding never changes run or summary bytes');
  const freshCount = execFileSync(process.execPath, ['-e', `const v=require('./plugins/data-secure/server/gateway/standalone-history-visibility');process.stdout.write(String([...v.readPreferences().values()].filter(row=>v.matches(row)).length))`],
    { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true });
  assert.equal(freshCount, '8', 'visibility persists across a fresh process');
  history.setVisibility(newest, false);
  assert.equal(history.history().entries[0].batch_id, newest);
  assert.equal(history.history().entries[0].hidden, false);
  assert.equal(visibility.readPreferences().get(newest).hidden, false, 'restore writes a flag instead of deleting metadata');
  pending = true;
  assert.throws(() => history.setVisibility(newest, true), checkCode('STANDALONE_HISTORY_ACTIVE'));
  pending = false; live = true;
  assert.throws(() => history.setVisibility(newest, true), checkCode('STANDALONE_HISTORY_ACTIVE'));
  live = false;
  const open = save(31, 'retryable');
  assert.throws(() => history.setVisibility(open.token, true), checkCode('STANDALONE_HISTORY_ACTIVE'));
  assert.ok(history.history().open_count >= 1);

  // A changed journal cannot inherit a prior terminal display pin.
  const changed = states[26];
  changed.items[0].status = 'retryable'; batch._test.writeState(changed);
  assert.equal(visibility.matches(visibility.readPreferences().get(changed.token)), false);
  assert.equal(history.history().entries.find(row => row.batch_id === changed.token).hidden, false);
  // A newly created durable document export invalidates the cheap pin before
  // any receipt parser or full document-revision replay could be skipped.
  const exported = states[27].token, review = path.join(data, 'document-reviews', exported);
  fs.mkdirSync(review, { recursive: true });
  fs.writeFileSync(path.join(review, `export-${'1'.repeat(32)}.json`), '{"synthetic":"pending"}', { flag: 'wx' });
  assert.equal(visibility.matches(visibility.readPreferences().get(exported)), false);
  assert.equal(history.history().entries.find(row => row.batch_id === exported).hidden, false);
  const unknownManifest = createRunHistory({ ...deps, pendingDocumentExports: () => null });
  assert.throws(() => unknownManifest.setVisibility(exported, true), checkCode('STANDALONE_HISTORY_ACTIVE'),
    'missing document metadata cannot turn a surviving export intent into permission to hide it');
  // Normal journal retention still leaves the user's preference intact.
  const retired = states[28].token;
  fs.renameSync(path.join(data, 'batches', `${retired}.json`), path.join(data, 'batches', `${retired}.retired-fixture`));
  assert.equal(visibility.matches(visibility.readPreferences().get(retired)), true);

  const base = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(32) };
  assert.equal(validatePrivateMessage({ ...base, action: 'get_run_history', include_hidden: true }).include_hidden, true);
  assert.equal(validatePrivateMessage({ ...base, action: 'set_run_history_visibility', batch_id: newest, hidden: false }).hidden, false);
  for (const extra of [{ include_hidden: false }, { include_hidden: 'true' }, { include_hidden: true, path: root }])
    assert.throws(() => validatePrivateMessage({ ...base, action: 'get_run_history', ...extra }));
  for (const hidden of [undefined, null, 0, 'true'])
    assert.throws(() => validatePrivateMessage({ ...base, action: 'set_run_history_visibility', batch_id: newest, hidden }));
  assert.throws(() => validatePrivateMessage({ ...base, action: 'set_run_history_visibility', batch_id: '../outside', hidden: true }));
  assert.equal(historyStore.readStandaloneSummaries().length, 31, 'visibility never removes durable history metadata');
  const { StandaloneApplicationService } = require('../plugins/data-secure/server/standalone/application-service');
  const service = new StandaloneApplicationService({ dependencies: { runHistory: history }, home: root });
  assert.equal(service.setRunHistoryVisibility(newest, false).hidden, false);
  assert.equal(service.history({ includeHidden: true }).hidden_count, history.history({ includeHidden: true }).hidden_count);
  console.log('PASS: durable history visibility, pre-limit/early filter, reappearance safety, retained metadata, IPC');
} finally {
  // Only this test-owned physical temporary root; never an application/user root.
  assert.equal(path.dirname(root), fs.realpathSync.native(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('datasecure-history-visibility-'));
  fs.rmSync(root, { recursive: true, force: true });
}
