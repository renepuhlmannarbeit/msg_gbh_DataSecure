'use strict';

// Source-level production composition, real private files and fresh processes.
// No native host, GUI, user profile, packaged macOS build or mocked status rows.
// --profile=320 is deliberately opt-in; the ordinary suite uses eight runs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const gateway = name => require(`../plugins/data-secure/server/gateway/${name}`);
const token = index => index.toString(16).padStart(64, '0');
const ITEM_COUNT = 4, POLLS = 3;

function configureProfile(root) {
  assert.ok(path.isAbsolute(root));
  const home = path.join(root, 'home'), dataRoot = path.join(home, 'private');
  for (const directory of [home, dataRoot, path.join(home, 'Documents')])
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Child processes inherit no launcher/native authority or external roots.
  for (const name of Object.keys(process.env)) {
    if (/^(?:EU_PRIVACY_|DATASECURE_)/u.test(name)) delete process.env[name];
  }
  Object.assign(process.env, { HOME: home, USERPROFILE: home,
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'), APPDATA: path.join(home, 'AppData', 'Roaming'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'), EU_PRIVACY_DATA_ROOT: dataRoot,
    EU_PRIVACY_ROOT: path.join(dataRoot, 'workspace'), EU_PRIVACY_RESULT_ROOT: path.join(home, 'results'),
    DATASECURE_PRODUCT_CHANNEL: 'standalone', DATASECURE_STANDALONE_DOCUMENTS_DIR: path.join(home, 'Documents') });
  return { home, dataRoot };
}

function seedRun(index, { expired = false, open = false } = {}) {
  const { createBatchPseudonymState } = require('../plugins/data-secure/server/batch-pseudonym-context');
  const { notProcessedDocumentResult } = gateway('document-result-grade');
  const { createBatchJournalStore } = gateway('batch-journal-store');
  const { createBatchProgress } = gateway('batch-progress');
  const { createBatchTerminalEvidence } = gateway('batch-terminal-evidence');
  const { createDocumentReviewStore } = gateway('standalone-document-review-store');
  const now = Date.now(), id = token(index);
  const state = { schema: 'datasecure-batch/7', token: id, product_channel: 'standalone',
    processing_mode: 'markdown-and-anonymize', standalone_document_review: true, profile: 'general',
    output_naming_mode: 'neutral',
    content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false },
    ...createBatchPseudonymState({ productChannel: 'standalone' }),
    created_at: new Date(now - 86400000 + index * 1000).toISOString(),
    expires_at: new Date(now + (expired ? -3600000 : 7 * 86400000)).toISOString(),
    items: Array.from({ length: ITEM_COUNT }, (_, offset) => ({ id: (index * ITEM_COUNT + offset).toString(16).padStart(32, '0'),
      name: `synthetic-${offset}.txt`, sha256: 'a'.repeat(64),
      ...(open ? { status: 'retryable', checkpoint: 'retryable', error_code: 'PROCESSING_INTERRUPTED' }
        : { status: 'stopped', error_code: 'SOURCE_READ_FAILED', local_mapping_exported: true,
          document_result: notProcessedDocumentResult('SOURCE_READ_FAILED') }) })) };
  // A genuine publisher plus independent /3 content manifest. This store has
  // no optional summary callback, as in an existing pre-summary profile.
  const journal = createBatchJournalStore({ productChannel: 'standalone' });
  journal.writeState(state);
  createDocumentReviewStore().captureRun(state);
  const checked = journal.readStateForMaintenance(id);
  if (!open) {
    const { publicProgress } = createBatchProgress({});
    const evidence = createBatchTerminalEvidence({ writeState: journal.writeState, publicProgress });
    assert.equal(evidence.writeTerminalEvidence(checked), true);
  }
  assert.equal(gateway('standalone-history-store').readStandaloneSummary(id), null,
    'fixture has no compact summary before the production recovery/expiry transaction');
  return checked;
}

function measure(dataRoot, action) {
  const saved = {}, descriptors = new Map();
  const empty = () => ({ opens: 0, read_calls: 0, read_bytes: 0, read_file_calls: 0, read_file_bytes: 0 });
  const counts = { all: empty(), journals: empty(), content_manifests: empty(), summaries: empty() };
  const classify = file => {
    if (typeof file !== 'string' && !Buffer.isBuffer(file)) return [];
    const relative = path.relative(dataRoot, String(file)).split(path.sep).join('/');
    if (/^batches\/[a-f0-9]{64}\.json$/u.test(relative)) return ['journals'];
    if (/^document-reviews\/[a-f0-9]{64}\/manifest\.json$/u.test(relative)) return ['content_manifests'];
    if (/^standalone-run-history\/[a-f0-9]{64}\.json$/u.test(relative)) return ['summaries'];
    return [];
  };
  const add = (groups, field, value) => { counts.all[field] += value; for (const group of groups) counts[group][field] += value; };
  let readFileDepth = 0;
  for (const name of ['openSync', 'readSync', 'readFileSync', 'closeSync']) saved[name] = fs[name];
  fs.openSync = function(file, ...args) {
    const fd = saved.openSync.call(this, file, ...args), groups = classify(file);
    descriptors.set(fd, groups); add(groups, 'opens', 1); return fd;
  };
  fs.readSync = function(fd, ...args) {
    const bytes = saved.readSync.call(this, fd, ...args), groups = descriptors.get(fd) || [];
    add(groups, 'read_calls', 1); add(groups, 'read_bytes', bytes); return bytes;
  };
  fs.readFileSync = function(file, ...args) {
    const groups = typeof file === 'number' ? descriptors.get(file) || [] : classify(file);
    readFileDepth++;
    try {
      const bytes = saved.readFileSync.call(this, file, ...args);
      // readFileSync('utf8') can use an internal binding in Node 22, bypassing
      // public openSync/readSync. Report it separately, never double-add bytes.
      add(groups, 'read_file_calls', 1);
      add(groups, 'read_file_bytes', Buffer.isBuffer(bytes) ? bytes.length : Buffer.byteLength(bytes));
      return bytes;
    } finally { readFileDepth--; }
  };
  fs.closeSync = function(fd, ...args) {
    try { return saved.closeSync.call(this, fd, ...args); }
    finally { descriptors.delete(fd); }
  };
  const snapshot = () => JSON.parse(JSON.stringify(counts));
  const start = process.hrtime.bigint();
  try { return { value: action(snapshot), counts, elapsed_ms: Number(process.hrtime.bigint() - start) / 1e6 }; }
  finally {
    for (const [name, method] of Object.entries(saved)) fs[name] = method;
    assert.equal(readFileDepth, 0);
  }
}

function brief(result) { return { ...result.counts, elapsed_ms: result.elapsed_ms }; }
function assertIdle(status) {
  assert.equal(status.state, 'ready'); assert.equal(status.selected_count, 0);
  assert.equal(status.batch_complete, false); assert.equal(status.result_count, 0);
  assert.equal(Object.hasOwn(status, 'batch_id'), false, 'an old journal cannot take over the new UI process card');
}
function assertSummaries(count, dataRoot) {
  const store = gateway('standalone-history-store');
  for (let index = 1; index <= count; index++) {
    const summary = store.readStandaloneSummary(token(index));
    assert.ok(summary && store.validSummary(summary), `retained compact summary ${index}`);
    assert.equal(summary.complete, true); assert.equal(summary.selected_count, ITEM_COUNT);
    assert.equal(summary.failed_count, ITEM_COUNT);
  }
  assert.equal(fs.existsSync(path.join(dataRoot, 'batches', `${token(1)}.json`)), false,
    'the expired journal was actually retired after saving its summary');
}

function startupWorker(root, count, second) {
  const profile = configureProfile(root);
  const { StandaloneApplicationService } = require('../plugins/data-secure/server/standalone/application-service');
  let service, captureCounts, captureEvent, startup;
  try {
    startup = measure(profile.dataRoot, snapshot => {
      service = new StandaloneApplicationService({ ...profile, startupDiagnostic(event, fields) {
        if (event === 'history_capture_finished') { captureCounts = snapshot(); captureEvent = fields; }
      } });
      return service.startup;
    });
    assert.equal(startup.value.recovery.failures, 0);
    assert.equal(startup.value.recovery.removed, second ? 0 : 1);
    assert.ok(captureCounts);
    assert.equal(captureCounts.journals.opens + captureCounts.journals.read_file_calls, 0,
      'initial history capture binds exports without an extra journal scan');
    assert.equal(captureCounts.summaries.opens + captureCounts.summaries.read_file_calls, 0);
    assert.equal(captureEvent.journal_count, 0);
    assert.ok(startup.counts.content_manifests.opens >= count - (second ? 1 : 0),
      'each fresh process runs actual independently bound content validation during bootstrap');
    assertSummaries(count, profile.dataRoot);
    const firstPoll = measure(profile.dataRoot, () => service.status({ localUi: true }));
    assertIdle(firstPoll.value);
    const warm = measure(profile.dataRoot, () => {
      for (let poll = 0; poll < POLLS; poll++) assertIdle(service.status({ localUi: true }));
    });
    assert.equal(warm.counts.journals.opens, (count - 1) * POLLS,
      'every idle poll still opens every held terminal journal');
    assert.ok(warm.counts.journals.read_bytes > 0, 'held bytes are reread rather than trusting stat metadata');
    assert.equal(warm.counts.content_manifests.opens, 0, 'unchanged unobserved terminal rows skip semantic content validation');
    assert.equal(warm.counts.summaries.opens, 0, 'public status does not read historical compact summaries');
    const report = { startup: brief(startup), initial_history_capture: captureCounts,
      first_public_status: brief(firstPoll), repeated_public_status: brief(warm) };
    if (second) return report;

    const selected = measure(profile.dataRoot, () => service.deps.publicStatusSnapshot(token(2)));
    assert.equal(selected.value.observed_batch_id, token(2));
    assert.equal(selected.value.latest.selected_count, ITEM_COUNT);
    assert.ok(selected.counts.content_manifests.opens > 0, 'an explicitly selected terminal run takes the full production reader');
    report.selected_terminal_status = brief(selected);

    const file = path.join(profile.dataRoot, 'batches', `${token(2)}.json`);
    const original = fs.readFileSync(file), stamp = fs.statSync(file), state = JSON.parse(original);
    const changed = Buffer.from(original.toString('utf8').replace(state.created_at,
      new Date(Date.parse(state.created_at) + 1000).toISOString()));
    assert.equal(changed.length, original.length);
    fs.writeFileSync(file, changed); fs.utimesSync(file, stamp.atime, stamp.mtime);
    const changedPoll = measure(profile.dataRoot, () => service.status({ localUi: true }));
    assertIdle(changedPoll.value);
    assert.ok(changedPoll.counts.content_manifests.opens > 0, 'equal length plus restored mtime cannot conceal changed journal bytes');
    fs.writeFileSync(file, original); service.status();
    report.same_size_restored_mtime = brief(changedPoll);

    const saved = `${file}.saved`, replacement = `${file}.replacement`;
    fs.writeFileSync(replacement, original); fs.renameSync(file, saved); fs.renameSync(replacement, file);
    try {
      const replaced = measure(profile.dataRoot, () => service.status({ localUi: true }));
      assertIdle(replaced.value);
      assert.ok(replaced.counts.content_manifests.opens > 0, 'byte-identical file replacement invalidates the original object binding');
      report.identical_file_replacement = brief(replaced);
    } finally { fs.unlinkSync(file); fs.renameSync(saved, file); }
    service.status();

    // Fresh files have no negative terminal hint in this application process.
    seedRun(count + 1);
    const newTerminal = measure(profile.dataRoot, () => service.status({ localUi: true }));
    assertIdle(newTerminal.value);
    assert.ok(newTerminal.counts.content_manifests.opens > 0, 'a newly published terminal run is first fully validated');
    report.new_terminal_status = brief(newTerminal);
    seedRun(count + 2, { open: true });
    const openRun = measure(profile.dataRoot, () => {
      for (let poll = 0; poll < 2; poll++) {
        const status = service.status({ localUi: true }); assertIdle(status);
        assert.equal(status.recoverable_count, 1, 'an open unselected run still contributes to recovery');
      }
    });
    assert.ok(openRun.counts.content_manifests.opens >= 2, 'open runs keep taking the full semantic/content reader');
    report.open_run_status = brief(openRun);
    const historical = service.deps.runHistory.find(token(1));
    assert.equal(historical.batch_id, token(1)); assert.equal(historical.failed_count, ITEM_COUNT);
    assert.equal(historical.status, 'completed_without_results');
    assertSummaries(count, profile.dataRoot);
    // Leave the same original baseline for the next fresh-process startup.
    const batch = gateway('batch');
    for (const index of [count + 1, count + 2]) {
      const state = batch._test.readStateForMaintenance(token(index));
      const store = gateway('batch-journal-store').createBatchJournalStore({ productChannel: 'standalone' });
      assert.equal(store.removeState(store.readStateForMaintenance(state.token)), true);
      gateway('common').safeRemovePrivateTree(path.join(profile.dataRoot, 'document-reviews'), state.token);
    }
    return report;
  } finally { service?.startup?.batchMaintenance?.stop(); }
}

function freshStatusWorker(root, count) {
  const profile = configureProfile(root);
  const { defaultDependencies, StandaloneApplicationService } = require('../plugins/data-secure/server/standalone/application-service');
  const dependencies = defaultDependencies(profile);
  // Persisted summaries/export capture indices must not authorize status skips
  // in a new process, even before its mandatory bootstrap runs.
  const fresh = measure(profile.dataRoot, () => dependencies.publicStatusSnapshot());
  assert.ok(fresh.counts.content_manifests.opens >= count - 1);
  assert.ok(fresh.value.latest); assert.equal(fresh.value.latest.selected_count, ITEM_COUNT);
  const service = new StandaloneApplicationService({ ...profile, dependencies });
  try { assertIdle(service.status({ localUi: true })); }
  finally { service.startup.batchMaintenance.stop(); }
  return brief(fresh);
}

function expiryWorker(root) {
  const profile = configureProfile(root);
  const { defaultDependencies } = require('../plugins/data-secure/server/standalone/application-service');
  defaultDependencies(profile); // Intentionally do not run initializeProduct.
  seedRun(1, { expired: true });
  const batch = gateway('batch'), store = gateway('standalone-history-store');
  const periodic = measure(profile.dataRoot, () => batch.cleanupExpiredBatchSnapshots());
  assert.equal(periodic.value.removed, 1); assert.equal(periodic.value.failures, 0);
  assertSummaries(1, profile.dataRoot);
  seedRun(2, { expired: true });
  const direct = measure(profile.dataRoot, () => {
    assert.throws(() => batch._test.readState(token(2)), /abgelaufen/u);
  });
  assert.equal(store.readStandaloneSummary(token(2)).failed_count, ITEM_COUNT);
  assert.equal(fs.existsSync(path.join(profile.dataRoot, 'batches', `${token(2)}.json`)), false);
  return { periodic_without_bootstrap: brief(periodic), direct_expired_read_without_bootstrap: brief(direct) };
}

function child(mode, root, count) {
  const result = spawnSync(process.execPath, [__filename, '--worker', mode, root, String(count)], {
    encoding: 'utf8', timeout: 180000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${mode} child failed:\n${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout.trim());
}

if (process.argv[2] === '--worker') {
  const [, , , mode, root, countText] = process.argv, count = Number(countText);
  assert.ok(['seed', 'first', 'second', 'fresh-status', 'expiry'].includes(mode));
  assert.ok([8, 320].includes(count));
  let value;
  if (mode === 'seed') {
    const profile = configureProfile(root);
    const { activateStandaloneNamespace } = require('../plugins/data-secure/server/standalone/application-service');
    activateStandaloneNamespace(profile);
    for (let index = 1; index <= count; index++) seedRun(index, { expired: index === 1 });
    value = { seeded: count };
  } else if (mode === 'first' || mode === 'second') value = startupWorker(root, count, mode === 'second');
  else if (mode === 'fresh-status') value = freshStatusWorker(root, count);
  else value = expiryWorker(root);
  console.log(JSON.stringify(value));
} else {
  assert.ok(process.argv.slice(2).every(arg => arg === '--profile=320'), 'only --profile=320 is supported');
  const count = process.argv.includes('--profile=320') ? 320 : 8;
  const base = fs.realpathSync.native(os.tmpdir()), root = fs.mkdtempSync(path.join(base, 'datasecure-startup-io-'));
  try {
    const main = path.join(root, 'startup-profile'), expiry = path.join(root, 'expiry-profile');
    child('seed', main, count);
    const first = child('first', main, count), second = child('second', main, count);
    const freshStatus = child('fresh-status', main, count), expiryChecks = child('expiry', expiry, count);
    console.log(JSON.stringify({ terminal_runs: count, sources_per_run: ITEM_COUNT, repeated_idle_polls: POLLS,
      first_process: first, second_process: second, fresh_process_status_before_bootstrap: freshStatus, expiry: expiryChecks,
      measurement_scope: 'Real source-level defaultDependencies/StandaloneApplicationService bootstrap and public status in fresh processes; physical temporary profiles; JavaScript-visible synchronous fs calls and returned bytes. readFileSync bytes are separate and may overlap readSync bytes; timings include warm OS caches. No native ownership, desktop/GUI, macOS package or end-to-end processing claim.' }));
    console.log('STANDALONE PRODUCTION STARTUP IO PASS');
  } finally {
    assert.equal(path.dirname(root), base); assert.ok(path.basename(root).startsWith('datasecure-startup-io-'));
    const { safeRemovePrivateTree } = gateway('common');
    safeRemovePrivateTree(base, path.basename(root));
  }
}
