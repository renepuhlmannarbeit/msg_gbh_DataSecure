'use strict';

// Opt-in engineering acceptance. A fresh private directory does not isolate
// the operating-system credential store. The private operator acknowledgement
// below is a prerequisite, never an attestation of an isolated test account.
// No product import is allowed before the complete scope has been validated.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { isSea } = require('node:sea');

const SCHEMA = 'datasecure-sea-batch-probe/v1';
const FLAG = '--datasecure-batch-acceptance-probe';
const SCOPE_SCHEMA = 'datasecure-sea-batch-scope/v1';
const START_MS = 30_000;
const TOTAL_MS = 120_000;
const EXIT_MS = 5_000;
const JOURNAL_POLL_MS = 20;
const MAX_JOURNAL_READ_ERRORS = 8;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ERRORS = new Set([
  'SEA_BATCH_CONTEXT_INVALID', 'SEA_BATCH_START_INVALID', 'SEA_BATCH_START_TIMEOUT',
  'SEA_BATCH_SCOPE_INVALID', 'SEA_BATCH_SCOPE_CHANGED',
  'SEA_BATCH_CRASH_POINT_NOT_REACHED', 'SEA_BATCH_JOURNAL_UNAVAILABLE', 'SEA_BATCH_RESUME_FAILED',
  'SEA_BATCH_WORKER_START_FAILED', 'SEA_BATCH_WORKER_FAILED', 'SEA_BATCH_IPC_FAILED',
  'SEA_BATCH_DEADLINE', 'SEA_BATCH_CLEANUP_PENDING', 'SEA_BATCH_FRAME_INVALID',
  'SEA_BATCH_RESULT_INVALID', 'SEA_BATCH_SOURCE_CHANGED', 'SEA_BATCH_MAPPING_INVALID',
  'SEA_BATCH_PROBE_FAILED'
]);
const PRIVATE_VALUES = Object.freeze([
  'Alice', 'Bob', 'Carla', 'Beispiel',
  'alice@example.test', 'bob@example.test', 'carla@example.test'
]);

function failure(code) { return new Error(code); }
function demand(condition, code = 'SEA_BATCH_RESULT_INVALID') { if (!condition) throw failure(code); }
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
function samePath(left, right) { return left.toLowerCase() === right.toLowerCase(); }
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function identity(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs, stat.birthtimeNs]
    .map(String).join(':');
}
function directoryIdentity(stat) { return [stat.dev, stat.ino, stat.birthtimeNs].map(String).join(':'); }

function verifyFixtureText(markdown) {
  // Fixture-only oracle: partial redaction is not a success. Fold whitespace,
  // invisible formatting and Markdown emphasis before checking every unique
  // name component and full contact value, including split character runs.
  const text = markdown.join('\n').normalize('NFKC').toLowerCase()
    .replace(/[\s\p{Cf}*_`~\\]/gu, '');
  demand(PRIVATE_VALUES.every(value => !text.includes(value.toLowerCase())), 'SEA_BATCH_RESULT_INVALID');
  demand(markdown.join('\n').includes('Scrum.org PSM I'), 'SEA_BATCH_RESULT_INVALID');
}

function captureDirectories(directory) {
  const captured = [];
  let current = directory;
  for (;;) {
    const stat = fs.lstatSync(current, { bigint: true });
    demand(stat.isDirectory() && !stat.isSymbolicLink() &&
      samePath(fs.realpathSync.native(current), current), 'SEA_BATCH_SCOPE_INVALID');
    captured.push({ directory: current, identity: directoryIdentity(stat) });
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return captured;
}

function recheckDirectories(captured) {
  for (const entry of captured) {
    const stat = fs.lstatSync(entry.directory, { bigint: true });
    demand(stat.isDirectory() && !stat.isSymbolicLink() &&
      directoryIdentity(stat) === entry.identity &&
      samePath(fs.realpathSync.native(entry.directory), entry.directory), 'SEA_BATCH_SCOPE_CHANGED');
  }
}

function readRegular(file, maximum = MAX_FILE_BYTES) {
  const directories = captureDirectories(path.dirname(file));
  let fd;
  try {
    const before = fs.lstatSync(file, { bigint: true });
    demand(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n &&
      before.size > 0n && before.size <= BigInt(maximum), 'SEA_BATCH_SCOPE_INVALID');
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
    demand(identity(fs.fstatSync(fd, { bigint: true })) === identity(before), 'SEA_BATCH_SCOPE_CHANGED');
    // Bounded descriptor read even if a concurrent writer grows the file
    // after the initial stat. One extra byte detects that change.
    const buffer = Buffer.alloc(Number(before.size) + 1);
    let used = 0;
    while (used < buffer.length) {
      const count = fs.readSync(fd, buffer, used, buffer.length - used, null);
      if (count === 0) break;
      used += count;
    }
    demand(used === Number(before.size), 'SEA_BATCH_SCOPE_CHANGED');
    const bytes = buffer.subarray(0, used);
    demand(identity(fs.fstatSync(fd, { bigint: true })) === identity(before) &&
      identity(fs.lstatSync(file, { bigint: true })) === identity(before), 'SEA_BATCH_SCOPE_CHANGED');
    recheckDirectories(directories);
    return { bytes, identity: identity(before), sha256: hash(bytes) };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function waitForStart() {
  return new Promise((resolve, reject) => {
    let timer;
    const finish = (error, message) => {
      clearTimeout(timer);
      process.removeListener('message', onMessage);
      process.removeListener('disconnect', onDisconnect);
      if (error) reject(error); else resolve(message);
    };
    const onMessage = (message) => finish(null, message);
    const onDisconnect = () => finish(failure('SEA_BATCH_START_INVALID'));
    timer = setTimeout(() => finish(failure('SEA_BATCH_START_TIMEOUT')), START_MS);
    process.once('message', onMessage);
    process.once('disconnect', onDisconnect);
  });
}

function validateScope(message) {
  demand(exactKeys(message, ['type', 'scenario', 'root', 'isolated_test_account_acknowledged']) &&
    message.type === 'start-sea-batch-acceptance' &&
    ['positive', 'disconnect', 'worker-resume'].includes(message.scenario) &&
    message.isolated_test_account_acknowledged === true && typeof message.root === 'string' &&
    path.isAbsolute(message.root) && path.resolve(message.root) === message.root,
  'SEA_BATCH_START_INVALID');
  const root = message.root;
  const parent = path.dirname(root);
  const temporary = fs.realpathSync.native(os.tmpdir());
  demand(path.basename(root) === `case-${message.scenario}` &&
    /^datasecure-sea-batch-[A-Za-z0-9]{6}$/.test(path.basename(parent)) &&
    samePath(path.dirname(parent), temporary) &&
    process.env.LOCALAPPDATA === path.join(root, 'localapp') &&
    process.env.EU_PRIVACY_ROOT === path.join(root, 'privacy'), 'SEA_BATCH_SCOPE_INVALID');
  const directories = captureDirectories(root);
  const names = fs.readdirSync(root);
  demand(names.length === 1 && names[0] === 'acceptance-scope.json', 'SEA_BATCH_SCOPE_INVALID');
  const markerPath = path.join(root, 'acceptance-scope.json');
  const marker = readRegular(markerPath, 1024);
  const value = JSON.parse(marker.bytes.toString('utf8'));
  demand(exactKeys(value, ['schema', 'scenario', 'isolated_test_account_acknowledged']) &&
    value.schema === SCOPE_SCHEMA && value.scenario === message.scenario &&
    value.isolated_test_account_acknowledged === true, 'SEA_BATCH_SCOPE_INVALID');
  recheckDirectories(directories);
  return { root, directories, markerPath, marker };
}

function recheckScope(scope) {
  recheckDirectories(scope.directories);
  const current = readRegular(scope.markerPath, 1024);
  demand(current.identity === scope.marker.identity && current.sha256 === scope.marker.sha256,
    'SEA_BATCH_SCOPE_CHANGED');
}

function createSources(scope, scenario) {
  const { createSyntheticFixtures } = require('./sea-batch-probe-fixtures');
  recheckScope(scope);
  const sourceRoot = path.join(scope.root, 'sources');
  fs.mkdirSync(sourceRoot, { recursive: false, mode: 0o700 });
  const sourceDirectories = captureDirectories(sourceRoot);
  return createSyntheticFixtures(scenario).map((fixture) => {
    recheckScope(scope);
    recheckDirectories(sourceDirectories);
    const full = path.join(sourceRoot, fixture.name);
    // Fixed fixture names, exclusive create: never replace an original.
    demand(path.dirname(full) === sourceRoot, 'SEA_BATCH_SCOPE_INVALID');
    fs.writeFileSync(full, fixture.bytes, { flag: 'wx', mode: 0o600 });
    const initial = readRegular(full);
    demand(initial.bytes.equals(fixture.bytes), 'SEA_BATCH_SOURCE_CHANGED');
    return { full, name: fixture.name, initial };
  });
}

function within(promise, milliseconds, code) {
  let timer;
  return Promise.race([promise, new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(failure(code)), Math.max(1, milliseconds));
  })]).finally(() => clearTimeout(timer));
}

function observeWorker(child) {
  demand(child && typeof child.on === 'function' && typeof child.kill === 'function',
    'SEA_BATCH_WORKER_START_FAILED');
  let exited = false;
  let disconnected = child.connected === false;
  let errored = false;
  let killed = false;
  let killAttempted = false;
  let result;
  let complete;
  const completion = new Promise((resolve) => { complete = resolve; });
  const settle = () => { if (exited && disconnected) complete({ ...result, errored }); };
  // Installed before PID validation: an asynchronous spawn failure is never
  // left as an uncaught native exception containing paths or arguments.
  child.on('error', () => {
    errored = true;
    if (!Number.isSafeInteger(child.pid) || child.pid < 1) {
      exited = true;
      disconnected = true;
      result = { code: null, signal: null, neverStarted: true };
    }
    settle();
  });
  child.once('exit', (code, signal) => {
    exited = true;
    result = { code, signal, neverStarted: false };
    settle();
  });
  child.once('disconnect', () => { disconnected = true; settle(); });
  return {
    completion,
    get exited() { return exited; },
    get stopRequested() { return killed; },
    get cleanupSafe() { return exited && disconnected; },
    async stop() {
      if (exited && disconnected) return;
      if (!exited && !killAttempted && child.exitCode == null && child.signalCode == null &&
          Number.isSafeInteger(child.pid) && child.pid > 0) {
        killAttempted = true;
        try { killed = child.kill() === true; } catch { /* only actual exit permits cleanup */ }
      }
      await within(completion, EXIT_MS, 'SEA_BATCH_CLEANUP_PENDING');
    }
  };
}

async function runWorker(launchBackgroundRole, token, sources, scenario, deadline, setObserved, scope) {
  const child = launchBackgroundRole('batch', { env: process.env });
  const observed = observeWorker(child);
  setObserved(observed);
  demand(Number.isSafeInteger(child.pid) && child.pid > 0 && child.connected === true &&
    typeof child.send === 'function' && typeof child.disconnect === 'function', 'SEA_BATCH_WORKER_START_FAILED');
  let checkpoint = false;
  let started = false;
  let disconnectRequested = false;
  let invalid = false;
  let terminal = null;
  child.on('message', (frame) => {
    try {
      if (exactKeys(frame, ['type']) && frame.type === 'local-intake-checkpoint-created' && !checkpoint && !started) {
        checkpoint = true;
      } else if (exactKeys(frame, ['type']) && frame.type === 'local-intake-processing-started' && checkpoint && !started) {
        started = true;
        if (scenario === 'disconnect') {
          disconnectRequested = true;
          child.disconnect();
        }
      } else if (exactKeys(frame, ['type', 'complete', 'batch_phase', 'batch_total', 'released', 'stopped',
        'result_grade_counts', 'result_omission_counts', 'result_grades_verified']) &&
        frame.type === 'local-intake-state' && started && terminal === null) {
        terminal = frame;
      } else invalid = true;
    } catch { invalid = true; }
  });
  await within(new Promise((resolve, reject) => {
    try {
      child.send({ type: 'start-local-intake', batch_token: token, profile: 'auto',
        queue: sources.map((source) => ({ name: source.name, full: source.full,
          sourceBytes: source.initial.bytes.length })) }, (error) => {
        if (error) reject(failure('SEA_BATCH_IPC_FAILED')); else resolve();
      });
    } catch { reject(failure('SEA_BATCH_IPC_FAILED')); }
  }), Math.min(START_MS, deadline - Date.now() - EXIT_MS), 'SEA_BATCH_DEADLINE');
  if (scenario === 'worker-resume') {
    await crashAndResume({ child, observed, token, deadline, scope, launchBackgroundRole, setObserved,
      frameState: () => ({ checkpoint, started, invalid, terminal }) });
    return;
  }
  const ended = await within(observed.completion, deadline - Date.now() - EXIT_MS, 'SEA_BATCH_DEADLINE');
  demand(ended.code === 0 && ended.signal === null && !ended.errored && ended.neverStarted === false,
    'SEA_BATCH_WORKER_FAILED');
  demand(!invalid && checkpoint && started, 'SEA_BATCH_FRAME_INVALID');
  if (scenario === 'positive') {
    demand(terminal !== null && terminal.complete === true && terminal.batch_phase === 'complete' &&
      terminal.batch_total === 3 && terminal.released === 3 && terminal.stopped === 0 &&
      terminal.result_grades_verified === true, 'SEA_BATCH_FRAME_INVALID');
  } else demand(disconnectRequested, 'SEA_BATCH_FRAME_INVALID');
}

// The last document only: after `extracted`, convertDocument has observed the
// native supervisor's close. Fixed DOCX has no images and there is no next
// document/parser that could become an unobserved orphan after this point.
// This predicate is private; VM tests may expose it only inside their sandbox.
function crashCandidate(state) {
  if (!state || !Array.isArray(state.items) || state.items.length !== 3) return false;
  const items = state.items;
  if (![0, 1, 2].every((index) => Object.hasOwn(items, index) && items[index] &&
      typeof items[index].id === 'string' && /^[a-f0-9]{32}$/.test(items[index].id)) ||
      new Set(items.map((item) => item.id)).size !== 3) return false;
  return items.slice(0, 2).every((item) => item.status === 'released' &&
    item.package_id === `ds_${item.id}`) &&
    items[2].status === 'processing' && items[2].checkpoint === 'extracted' &&
    !Object.hasOwn(items[2], 'package_id');
}

function sameItemIds(left, right) {
  return left.items.length === right.items.length &&
    left.items.every((item, index) => item.id === right.items[index].id);
}

function captureReleasedPackages(scope, state) {
  recheckScope(scope);
  demand(crashCandidate(state), 'SEA_BATCH_CRASH_POINT_NOT_REACHED');
  const { validateManifestDocumentResult, sameDocumentResult } = require('./gateway/document-result-grade');
  return state.items.slice(0, 2).map((item) => {
    const directory = path.join(scope.root, 'privacy', 'Output', item.package_id);
    const manifest = readRegular(path.join(directory, 'manifest.json'));
    const document = readRegular(path.join(directory, `${item.package_id}.md`));
    const record = JSON.parse(manifest.bytes.toString('utf8'));
    const result = validateManifestDocumentResult(record);
    demand(record.package_id === item.package_id && record.document === `${item.package_id}.md` &&
      record.document_sha256 === document.sha256 && result.grade === 'complete' &&
      result.omissions.length === 0 && sameDocumentResult(result, item.document_result), 'SEA_BATCH_RESULT_INVALID');
    return { id: item.id, packageId: item.package_id, manifest, document };
  });
}

function verifyPreservedPackages(scope, state, preserved) {
  recheckScope(scope);
  demand(preserved.length === 2, 'SEA_BATCH_RESULT_INVALID');
  for (const saved of preserved) {
    const items = state.items.filter((item) => item.id === saved.id);
    demand(items.length === 1 && items[0].status === 'released' && items[0].package_id === saved.packageId,
      'SEA_BATCH_RESULT_INVALID');
    const directory = path.join(scope.root, 'privacy', 'Output', saved.packageId);
    for (const [filename, previous] of [['manifest.json', saved.manifest], [`${saved.packageId}.md`, saved.document]]) {
      const current = readRegular(path.join(directory, filename));
      demand(current.identity === previous.identity && current.sha256 === previous.sha256 &&
        current.bytes.equals(previous.bytes), 'SEA_BATCH_RESULT_INVALID');
    }
  }
}

async function waitForCrashCandidate(observed, token, deadline, frameState) {
  const { createBatchJournalStore } = require('./gateway/batch-journal-store');
  const reader = createBatchJournalStore();
  let failures = 0;
  // Bounded real journal polling; never invoke progress/recovery/maintenance
  // writers while the original worker owns this batch.
  while (Date.now() < deadline - EXIT_MS * 2) {
    if (observed.exited) throw failure('SEA_BATCH_CRASH_POINT_NOT_REACHED');
    const frame = frameState();
    demand(!frame.invalid, 'SEA_BATCH_FRAME_INVALID');
    if (frame.terminal !== null) throw failure('SEA_BATCH_CRASH_POINT_NOT_REACHED');
    if (frame.checkpoint && frame.started) {
      let state;
      try { state = reader.readStateForMaintenance(token); }
      catch {
        failures++;
        if (failures > MAX_JOURNAL_READ_ERRORS) throw failure('SEA_BATCH_JOURNAL_UNAVAILABLE');
      }
      if (state && crashCandidate(state)) return state;
    }
    await new Promise((resolve) => setTimeout(resolve, JOURNAL_POLL_MS));
  }
  throw failure('SEA_BATCH_CRASH_POINT_NOT_REACHED');
}

async function resumeWorker(launchBackgroundRole, token, deadline, setObserved) {
  const { claimLocalBatchExecutor } = require('./gateway/batch');
  const child = launchBackgroundRole('batch', { env: process.env });
  const observed = observeWorker(child);
  setObserved(observed);
  demand(Number.isSafeInteger(child.pid) && child.pid > 0 && child.connected === true &&
    typeof child.send === 'function', 'SEA_BATCH_WORKER_START_FAILED');
  let invalid = false;
  let terminal = null;
  child.on('message', (frame) => {
    if (exactKeys(frame, ['type', 'complete', 'batch_phase', 'batch_total', 'released', 'stopped',
      'result_grade_counts', 'result_omission_counts', 'result_grades_verified']) &&
        frame.type === 'local-batch-state' && terminal === null) terminal = frame;
    else invalid = true;
  });
  const claimed = claimLocalBatchExecutor(token, child.pid);
  demand(claimed?.ok === true, 'SEA_BATCH_RESUME_FAILED');
  await within(new Promise((resolve, reject) => {
    try {
      child.send({ type: 'start-local-batch', batch_token: token }, (error) => {
        if (error) reject(failure('SEA_BATCH_IPC_FAILED')); else resolve();
      });
    } catch { reject(failure('SEA_BATCH_IPC_FAILED')); }
  }), Math.min(START_MS, deadline - Date.now() - EXIT_MS), 'SEA_BATCH_DEADLINE');
  const ended = await within(observed.completion, deadline - Date.now() - EXIT_MS, 'SEA_BATCH_DEADLINE');
  demand(ended.code === 0 && ended.signal === null && !ended.errored && ended.neverStarted === false,
    'SEA_BATCH_WORKER_FAILED');
  demand(!invalid && terminal !== null && terminal.complete === true && terminal.batch_phase === 'complete' &&
    terminal.batch_total === 3 && terminal.released === 3 && terminal.stopped === 0 &&
    terminal.result_grades_verified === true, 'SEA_BATCH_FRAME_INVALID');
}

async function crashAndResume({ child, observed, token, deadline, scope, launchBackgroundRole, setObserved, frameState }) {
  const { createBatchJournalStore } = require('./gateway/batch-journal-store');
  const reader = createBatchJournalStore();
  const candidate = await waitForCrashCandidate(observed, token, deadline, frameState);
  const preserved = captureReleasedPackages(scope, candidate);
  const before = reader.readStateForMaintenance(token);
  demand(crashCandidate(before) && sameItemIds(candidate, before) && !observed.exited &&
    child.exitCode == null && child.signalCode == null, 'SEA_BATCH_CRASH_POINT_NOT_REACHED');
  await observed.stop();
  const ended = await observed.completion;
  demand(observed.stopRequested && ended.neverStarted === false && !ended.errored &&
    (ended.code !== 0 || ended.signal !== null), 'SEA_BATCH_CRASH_POINT_NOT_REACHED');
  const interrupted = reader.readStateForMaintenance(token);
  demand(crashCandidate(interrupted) && sameItemIds(candidate, interrupted), 'SEA_BATCH_CRASH_POINT_NOT_REACHED');
  verifyPreservedPackages(scope, interrupted, preserved);
  // Same real continuation and worker/lease APIs as the gateway. Deliberately
  // not the UI starter: no presenter override and no hidden GUI is claimed as
  // a tested product path by this headless engineering probe.
  const { continueMostRecentBatch } = require('./gateway/batch');
  const continued = continueMostRecentBatch();
  demand(continued?.ok === true && continued.batch_token === token, 'SEA_BATCH_RESUME_FAILED');
  const ready = reader.readStateForMaintenance(token);
  demand(sameItemIds(candidate, ready) && ready.items[2].status === 'pending', 'SEA_BATCH_RESUME_FAILED');
  verifyPreservedPackages(scope, ready, preserved);
  await resumeWorker(launchBackgroundRole, token, deadline, setObserved);
  const final = reader.readStateForMaintenance(token);
  demand(sameItemIds(candidate, final), 'SEA_BATCH_RESULT_INVALID');
  verifyPreservedPackages(scope, final, preserved);
}

function verifyStagingInventory() {
  const staging = require('./gateway/package-staging').inspectStaging();
  demand(staging.pending === 0 && staging.failures === 0 && staging.unbound === 0,
    'SEA_BATCH_RESULT_INVALID');
}

function verifyResults(scope, token, sources) {
  recheckScope(scope);
  const { createBatchJournalStore } = require('./gateway/batch-journal-store');
  const { readBatchProgress } = require('./gateway/batch');
  const { roots } = require('./gateway/common');
  const { packageIdentityMatches } = require('./gateway/package-identity');
  const { validateManifestDocumentResult, sameDocumentResult } = require('./gateway/document-result-grade');
  const { normalizeExistingMapping, resultPresentation, FIXED_NOTE } = require('./gateway/mapping');
  const state = createBatchJournalStore().readStateForMaintenance(token);
  demand(state.items.length === 3 && state.items.every((item) => item.status === 'released' &&
    /^ds_[a-f0-9]{32}$/.test(item.package_id)), 'SEA_BATCH_RESULT_INVALID');
  const progress = readBatchProgress(token);
  demand(progress.ok === true && progress.complete === true && progress.batch_total === 3 &&
    progress.released === 3 && progress.stopped === 0 && progress.remaining === 0 &&
    progress.retryable === 0 && progress.processing === 0 && progress.delivery_pending === 0 &&
    progress.mapping_pending === 0 && progress.deferred_review === 0 &&
    progress.local_processing_active === false && progress.result_grades_verified === true &&
    progress.result_grade_counts.complete === 3 && progress.result_grade_counts.usable_with_omissions === 0 &&
    progress.result_grade_counts.not_processed === 0 && progress.result_grade_counts.unavailable === 0,
  'SEA_BATCH_RESULT_INVALID');
  const directories = roots();
  demand(samePath(directories.root, path.join(scope.root, 'privacy')), 'SEA_BATCH_SCOPE_CHANGED');
  const expectedIds = state.items.map((item) => item.package_id).sort();
  demand(new Set(expectedIds).size === 3, 'SEA_BATCH_RESULT_INVALID');
  const actualIds = fs.readdirSync(directories.output).sort();
  demand(JSON.stringify(actualIds) === JSON.stringify(expectedIds), 'SEA_BATCH_RESULT_INVALID');
  // Moving unpublished packages out of Output must not hide crash leftovers
  // from the acceptance oracle. Inspect both namespaces without cleaning them.
  verifyStagingInventory();
  const hashes = [];
  const markdown = [];
  for (const item of state.items) {
    const pkg = path.join(directories.output, item.package_id);
    captureDirectories(pkg);
    demand(packageIdentityMatches(item.package_id, item.package_identity), 'SEA_BATCH_RESULT_INVALID');
    const manifest = JSON.parse(readRegular(path.join(pkg, 'manifest.json')).bytes.toString('utf8'));
    const document = readRegular(path.join(pkg, `${item.package_id}.md`));
    const result = validateManifestDocumentResult(manifest);
    demand(manifest.package_id === item.package_id && manifest.document === `${item.package_id}.md` &&
      manifest.document_sha256 === document.sha256 && result.grade === 'complete' &&
      result.omissions.length === 0 && sameDocumentResult(result, item.document_result), 'SEA_BATCH_RESULT_INVALID');
    hashes.push(document.sha256);
    markdown.push(document.bytes.toString('utf8'));
  }
  demand(new Set(hashes).size === 3, 'SEA_BATCH_RESULT_INVALID');
  verifyFixtureText(markdown);
  const rows = normalizeExistingMapping(readRegular(path.join(directories.exports,
    'DataSecure-Mapping.csv')).bytes.toString('utf8')).rows;
  demand(rows.length === 3, 'SEA_BATCH_MAPPING_INVALID');
  for (const source of sources) {
    const items = state.items.filter((item) => item.name === source.name);
    demand(items.length === 1, 'SEA_BATCH_MAPPING_INVALID');
    demand(items[0].sha256 === source.initial.sha256 && items[0].size === source.initial.bytes.length &&
      items[0].source_label === source.name, 'SEA_BATCH_SOURCE_CHANGED');
    const presentation = resultPresentation(items[0].document_result);
    const expected = [source.name, items[0].package_id, presentation.grade,
      presentation.omissions, presentation.reason, FIXED_NOTE];
    demand(rows.filter((row) => JSON.stringify(row) === JSON.stringify(expected)).length === 1,
      'SEA_BATCH_MAPPING_INVALID');
    const after = readRegular(source.full);
    demand(after.identity === source.initial.identity && after.sha256 === source.initial.sha256 &&
      after.bytes.equals(source.initial.bytes), 'SEA_BATCH_SOURCE_CHANGED');
  }
  recheckScope(scope);
}

async function runSeaBatchProbe() {
  const deadline = Date.now() + TOTAL_MS;
  let observed;
  try {
    demand(isSea() && process.platform === 'win32' && process.arch === 'x64' &&
      process.argv.length === 3 && process.argv[0] === process.execPath &&
      process.argv[1] === process.execPath && process.argv[2] === FLAG &&
      typeof process.send === 'function' && process.channel && process.connected === true,
    'SEA_BATCH_CONTEXT_INVALID');
    const message = await waitForStart();
    const scope = validateScope(message);
    require('./network-deny.cjs');
    const guard = Object.getOwnPropertyDescriptor(globalThis, '__DATASECURE_NETWORK_DENY_ACTIVE__');
    demand(guard && guard.value === true && guard.writable === false && guard.configurable === false,
      'SEA_BATCH_CONTEXT_INVALID');
    const sources = createSources(scope, message.scenario);
    const { launchBackgroundRole } = require('./background-role-launcher');
    const token = crypto.randomBytes(32).toString('hex');
    await runWorker(launchBackgroundRole, token, sources, message.scenario, deadline,
      (value) => { observed = value; }, scope);
    verifyResults(scope, token, sources);
    return { schema: SCHEMA, scenario: message.scenario, target: 'windows-x64', checks: {
      actual_worker_exit: true, journal_complete: true, three_unique_verified_packages: true,
      grades_verified: true, pii_removed: true, qualification_preserved: true,
      originals_unchanged: true, mapping_exactly_once: true,
      ipc_disconnect_survived: message.scenario === 'disconnect',
      worker_crash_observed: message.scenario === 'worker-resume',
      released_packages_preserved: message.scenario === 'worker-resume'
    }, cleanup_safe: true, privacy_release_verified: false };
  } catch (error) {
    let code = ERRORS.has(error?.message) ? error.message : 'SEA_BATCH_PROBE_FAILED';
    if (observed) {
      try { await observed.stop(); }
      catch { code = 'SEA_BATCH_CLEANUP_PENDING'; }
    }
    const safe = failure(code);
    safe.cleanupSafe = !observed || observed.cleanupSafe;
    throw safe;
  }
}

module.exports = Object.freeze({ runSeaBatchProbe });
