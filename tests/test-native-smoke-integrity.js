'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { createSuite } = require('./helpers');
const { reviewReady, mainReady, actionReady, sidecarReadiness } = require('./helpers/native-review-readiness');
const { MAX_LEAVES, MAX_LEAF_BYTES, MAX_TOTAL_BYTES } = require('./helpers/native-sidecar-readiness');
const { createPlatformCases } = require('./helpers/platform-case');
const { test, testAsync, done, assert } = createSuite('Native smoke evidence integrity');
const page = { event: 'review_page_loaded' };
const requestA = 'a'.repeat(35);
const requestB = 'b'.repeat(35);
const rpc = (event, action, request_id = requestA) => ({ event, action, request_id });
const request = rpc('ipc_request_started', 'get_review_session');
const failed = rpc('ipc_response_error', 'get_review_session');
const success = rpc('ipc_response_ok', 'get_review_session');

function diagnosticFixture(action) {
  const parent = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'datasecure-native-log-reader-'));
  const directory = path.join(root, 'diagnostics'); fs.mkdirSync(directory);
  const session = '1'.repeat(32), generation = 'a'.repeat(32);
  const event = (component, event, time_ms, fields = {}) => ({ schema: 'datasecure-standalone-interaction/1',
    component, session_id: session, event, time_ms, outcome: 'ready', ...fields });
  const desktop = path.join(directory, 'desktop-interactions.jsonl');
  const desktopEvents = [event('desktop', 'application_started', 10, { product_version: '3.2.0-rc164' }),
    ...['setup_started', 'setup_completed', 'page_loaded', 'workspace_page_loaded', 'frontend_ready',
      'review_page_loaded'].map((name, index) => event('desktop', name, 11 + index)),
    event('desktop', 'sidecar_starting', 20), event('desktop', 'sidecar_spawned', 21),
    event('desktop', 'sidecar_bootstrap_ready', 40)];
  for (const [index, action] of ['get_public_state', 'get_ui_context', 'get_review_session'].entries())
    desktopEvents.push(event('desktop', 'ipc_request_started', 41 + index * 2, { action, request_id: requestA }),
      event('desktop', 'ipc_response_ok', 42 + index * 2, { action, request_id: requestA }));
  const sidecarEvents = ['sidecar_entry', 'sidecar_imports_ready', 'sidecar_started',
    'runtime_integrity_checked', 'service_initialized'].map((name, index) => event('sidecar', name, 22 + index));
  const write = (name, values) => {
    const target = path.join(directory, name);
    fs.writeFileSync(target, values.map(value => JSON.stringify(value)).join('\n') + '\n');
    return target;
  };
  write(path.basename(desktop), desktopEvents);
  const leaf = write(`sidecar-interactions.${generation}.jsonl`, sidecarEvents);
  try { action({ root, directory, desktop, leaf, event, session, generation, desktopEvents, sidecarEvents, write }); }
  finally {
    assert.equal(path.dirname(root), parent); assert.equal(fs.realpathSync.native(root), root);
    assert.match(path.basename(root), /^datasecure-native-log-reader-[A-Za-z0-9]+$/u);
    const entries = [];
    function inspect(target) {
      const relative = path.relative(root, target);
      assert.ok(target === root || relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
      const stat = fs.lstatSync(target);
      if (stat.isDirectory() && !stat.isSymbolicLink()) for (const name of fs.readdirSync(target)) inspect(path.join(target, name));
      else assert.ok(stat.isFile() || stat.isSymbolicLink());
      entries.push({ target, directory: stat.isDirectory() && !stat.isSymbolicLink() });
    }
    inspect(root);
    for (const entry of entries) {
      if (entry.directory) fs.rmdirSync(entry.target);
      else fs.unlinkSync(entry.target); // Never traverse a fixture link.
    }
  }
}

function runReadinessCli(args) {
  const helper = path.join(__dirname, 'helpers/native-review-readiness.js');
  const source = fs.readFileSync(helper, 'utf8'), module = { exports: {} }, actualRequire = createRequire(helper);
  const localRequire = name => actualRequire(name); localRequire.main = module;
  let stdout = '';
  const processView = { argv: [process.execPath, helper, ...args], stdout: { write(value) { stdout += value; } }, exitCode: 0 };
  vm.runInNewContext(source, { module, require: localRequire, process: processView }, { filename: helper, timeout: 5000 });
  return { status: processView.exitCode, stdout };
}

function packagedOcrSkipProbe(resolutions, sleepAdvance = 100) {
  const file = path.join(__dirname, 'helpers/standalone-packaged-ocr-review.mjs');
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('export async function runPackagedOcrSkipScenario(');
  const end = source.indexOf('\nexport function assertPackagedOcrOutputs(', start);
  assert.ok(start >= 0 && end > start);
  const batchId = 'a'.repeat(64), sourceDirectory = path.join(__dirname, 'synthetic-ocr-sources');
  const outputDirectory = path.join(__dirname, 'synthetic-ocr-output');
  const fixtures = new Map([['one.png', Buffer.from('original one')], ['two.png', Buffer.from('original two')]]);
  const files = new Map(['one.md', 'two.md'].map(name => [path.join(outputDirectory, name), 'Ungepruefter Originalinhalt\n']));
  const calls = [], sleeps = [], outputReads = [], events = [];
  let now = 0, historyReads = 0, resolverCalls = 0, stdout = '';
  const io = {
    mkdirSync() {},
    writeFileSync(target, bytes) { assert.equal(files.has(target), false); files.set(target, Buffer.from(bytes)); },
    readdirSync(target) {
      assert.equal(target, outputDirectory); outputReads.push(target); events.push('open');
      return ['one.md', 'two.md'];
    },
    readFileSync(target, encoding) {
      assert.ok(files.has(target), 'the scenario must not read an inferred or substitute path');
      const bytes = files.get(target); return encoding ? String(bytes) : bytes;
    }
  };
  const scenario = vm.runInNewContext(`${source.slice(start, end).replace(/^export /u, '')}\nrunPackagedOcrSkipScenario`, {
    assert, fs: io, path, packagedOcrFixtures: () => fixtures, Date: { now: () => now },
    setTimeout(callback, delay) {
      assert.equal(delay, 100); sleeps.push(delay); events.push('wait'); now += sleepAdvance;
      queueMicrotask(callback); return 1;
    },
    process: { stdout: { write(value) { stdout += value; } } }
  }, { filename: file, timeout: 5000 });
  const request = async message => {
    calls.push(message);
    const result = value => ({ ok: true, result: value });
    switch (message.action) {
      case 'admit_selected_sources': return result({ selected_count: 2 });
      case 'start_admitted_batch': return result({ batch_id: batchId });
      case 'get_run_history': return result({ entries: [
        { batch_id: 'b'.repeat(64), status: 'review_required', result_count: 0, resumable: true },
        { batch_id: batchId, processing_mode: 'markdown-only',
        ...(historyReads++ === 0 ? { status: 'review_required', result_count: 0, resumable: true }
          : { status: 'processing', result_count: 2, resumable: false }) }] });
      case 'continue_history_batch':
      case 'skip_ocr_contact_review': assert.equal(message.batch_id, batchId); return result({ skip_requested: true });
      case 'get_review_session': return result({ ready: true });
      case 'resolve_history_results': {
        assert.equal(message.batch_id, batchId);
        const resolution = resolutions[Math.min(resolverCalls++, resolutions.length - 1)];
        if (resolution === 'late-ready') now += 120000;
        const ready = resolution === 'ready' || resolution === 'late-ready';
        events.push(ready ? 'ready' : 'missing-or-error');
        return ready ? result({ ok: true, target_kind: 'directory',
          local_path: outputDirectory, external_disclosure: false })
          : typeof resolution === 'string' ? { ok: false, error_code: resolution } : resolution;
      }
      default: throw new Error(`unexpected synthetic scenario action: ${message.action}`);
    }
  };
  return { run: () => scenario({ request, sourceDirectory }), batchId, calls, sleeps, outputReads, events,
    clock: () => now, output: () => stdout };
}

function runWindowsNativeReport(f, { expectedVersion = '3.2.0-rc164', startedAt = 10, timeoutSurface = false } = {}) {
  const source = fs.readFileSync(path.join(__dirname, 'manual/standalone-native-windows-launch.ps1'), 'utf8');
  const quote = value => `'${String(value).replace(/'/gu, "''")}'`;
  let reader = source.slice(source.indexOf('function Read-NativeSidecarReadiness('), source.indexOf('function Get-NativeWebViewProfile('));
  // Relocate only the script and pinned Node executable for this source-fragment
  // test. The actual reader, switches, bounded bytes and native gate stay intact.
  const readerPath = "Join-Path $PSScriptRoot '..\\helpers\\native-review-readiness.js'";
  assert.ok(reader.includes(readerPath)); assert.ok(reader.includes('& node @readerArguments'));
  reader = reader.replace(readerPath, quote(path.join(__dirname, 'helpers/native-review-readiness.js')))
    .replace('& node @readerArguments', `& ${quote(process.execPath)} @readerArguments`);
  const start = source.indexOf('        $sidecarStatus = Read-NativeSidecarReadiness $diagnosticRoot');
  const end = source.indexOf('        if ($application -and $sidecarStatus.ready) {', start);
  assert.ok(start > 0 && end > start);
  const native = source.slice(start, end);
  const failureStart = source.indexOf('    if (-not $passed) {', end);
  const failureEnd = source.indexOf("    if (-not (Test-Path -LiteralPath (Join-Path $testRoot 'profile\\Local", failureStart);
  assert.ok(failureStart > end && failureEnd > failureStart);
  const failure = source.slice(failureStart, failureEnd);
  const script = `$ErrorActionPreference = 'Stop'
${reader}
function Get-Content { throw 'UNBOUNDED_DIAGNOSTIC_READ' }
function Read-InteractionEvents { throw 'UNBOUNDED_DIAGNOSTIC_READ' }
function Test-NativeActionReadiness { throw 'NATIVE_MODEL_PREDICATE_USED' }
function Test-NativeReviewReadiness { throw 'NATIVE_MODEL_PREDICATE_USED' }
$diagnosticRoot = ${quote(f.directory)}
$desktopLog = ${quote(f.desktop)}
$expectedVersion = ${quote(expectedVersion)}
$startedAt = ${startedAt}
$AssertReviewWindow = $true
$AssertWorkspace = $true
${native}
$passed = [bool] ($application -and $sidecarStatus.ready)
${timeoutSurface ? `
$passed = $false
$desktopSession = @([pscustomobject]@{ event = 'PRIVATE_PATH_SECRET_SENTINEL'; action = 'PRIVATE_PATH_SECRET_SENTINEL'; outcome = 'PRIVATE_PATH_SECRET_SENTINEL'; error_code = 'PRIVATE_PATH_SECRET_SENTINEL' })
$sidecarSession = $desktopSession
function Get-StandaloneWebViewHostFacts { [pscustomobject]@{ os_build = 'synthetic'; process_architecture = 'x64'; webview2_version = $null; webview2_scope = $null } }
try { ${failure} } catch { Write-Output ('CLOSED_TIMEOUT ' + $_.Exception.Message) }
` : `Write-Output ('NATIVE_REPORT_RESULT ' + ([ordered]@{ accepted = $passed; ready = [bool] $sidecarStatus.ready } | ConvertTo-Json -Compress))`}
exit 0
`;
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { encoding: 'utf8', windowsHide: true, timeout: 10000 });
}

test('native sidecar readiness accepts real generation leaves without a base log on every platform', () => diagnosticFixture(f => {
  assert.equal(fs.existsSync(path.join(f.directory, 'sidecar-interactions.jsonl')), false);
  const status = sidecarReadiness(f.directory, f.desktop, { requireRuntime: true });
  assert.equal(status.ready, true); assert.equal(status.session_id, f.session);
  assert.equal(status.product_version, '3.2.0-rc164'); assert.equal(status.application_started_ms, 10);
  assert.equal(status.conditions.main_workspace_ipc, true); assert.equal(status.conditions.review_ipc, true);
  assert.equal(status.conditions.current_owner_main_ipc, true); assert.equal(status.conditions.current_owner_review_ipc, true);
  assert.equal(status.conditions.runtime_integrity_checked, true);
  const bound = require('../plugins/data-secure/server/core/bound-file-io'), real = bound.readBoundFileRecord;
  const capabilities = [];
  bound.readBoundFileRecord = function(target, options) {
    capabilities.push(options); return real(target, options);
  };
  try { assert.equal(sidecarReadiness(f.directory, f.desktop).ready, true); }
  finally { bound.readBoundFileRecord = real; }
  assert.equal(capabilities.length, 2);
  assert.ok(capabilities.every(value => value.directory === capabilities[0].directory && value.maxLinks === 1 &&
    value.maximum === MAX_LEAF_BYTES && value.minimum === 1 && value.checkCtime === true));
}));

test('rotation may complete one generation but gaps, duplicate starts and cross-generation markers never pass', () => diagnosticFixture(f => {
  f.write(path.basename(f.leaf), f.sidecarEvents.slice(0, 3));
  const rotated = `sidecar-interactions.${f.generation}.2.jsonl`;
  f.write(rotated, f.sidecarEvents.slice(3));
  assert.equal(sidecarReadiness(f.directory, f.desktop, { requireRuntime: true }).ready, true);
  fs.renameSync(path.join(f.directory, rotated), path.join(f.directory, rotated.replace('.2.', '.3.')));
  assert.equal(sidecarReadiness(f.directory, f.desktop, { requireRuntime: true }).ready, false);
  fs.unlinkSync(path.join(f.directory, rotated.replace('.2.', '.3.')));
  f.write(`sidecar-interactions.${'b'.repeat(32)}.jsonl`, f.sidecarEvents.slice(3));
  assert.equal(sidecarReadiness(f.directory, f.desktop, { requireRuntime: true }).ready, false);
  f.write(path.basename(f.leaf), [...f.sidecarEvents, f.sidecarEvents[0]]);
  assert.equal(sidecarReadiness(f.directory, f.desktop, { requireRuntime: true }).ready, false);
}));

test('a previous app session or an earlier successful owner cannot bless pending, failed or ambiguous current owners', () => diagnosticFixture(f => {
  const read = () => sidecarReadiness(f.directory, f.desktop, { requireRuntime: true });
  f.write(path.basename(f.leaf), f.sidecarEvents.map(row => ({ ...row, session_id: '2'.repeat(32) })));
  assert.equal(read().ready, false);
  f.write(path.basename(f.leaf), f.sidecarEvents);
  f.write(path.basename(f.desktop), [...f.desktopEvents, f.event('desktop', 'sidecar_starting', 50)]);
  assert.equal(read().ready, false);
  f.write(path.basename(f.desktop), [...f.desktopEvents, f.event('desktop', 'sidecar_starting', 50),
    f.event('desktop', 'sidecar_bootstrap_failed', 60, { outcome: 'failed', error_code: 'STANDALONE_IPC_FAILED' })]);
  assert.equal(read().ready, false); assert.equal(read().bootstrap_error, 'STANDALONE_IPC_FAILED');
  f.write(path.basename(f.desktop), f.desktopEvents);
  const another = `sidecar-interactions.${'b'.repeat(32)}.jsonl`;
  f.write(another, f.sidecarEvents);
  assert.equal(read().ready, false);
  f.write(another, [f.event('sidecar', 'sidecar_entry', 45)]);
  assert.equal(read().ready, false, 'an as-yet unreflected newer generation is not ignored');
}));

test('all success markers stay in one session, generation and real bootstrap interval', () => diagnosticFixture(f => {
  for (const mutate of [
    rows => rows.map(row => row.event === 'service_initialized' ? { ...row, session_id: '2'.repeat(32) } : row),
    rows => rows.map(row => row.event === 'service_initialized' ? { ...row, outcome: 'failed' } : row),
    rows => rows.map(row => row.event === 'service_initialized' ? { ...row, time_ms: 1000 } : row),
    rows => rows.map(row => row.event === 'sidecar_entry' ? { ...row, time_ms: 19 } : row)
  ]) {
    f.write(path.basename(f.leaf), mutate(f.sidecarEvents));
    assert.equal(sidecarReadiness(f.directory, f.desktop, { requireRuntime: true }).ready, false);
  }
  f.write(path.basename(f.leaf), f.sidecarEvents.filter(row => row.event !== 'runtime_integrity_checked'));
  assert.equal(sidecarReadiness(f.directory, f.desktop).ready, true, 'Windows/Linux keep their existing positive contract');
  assert.equal(sidecarReadiness(f.directory, f.desktop, { requireRuntime: true }).ready, false);
  f.write(path.basename(f.leaf), []);
  assert.equal(sidecarReadiness(f.directory, f.desktop).ready, false);
  for (const session_id of [1234567890123456, [f.session], null, 'x'.repeat(32)]) {
    f.write(path.basename(f.leaf), f.sidecarEvents.map(row => ({ ...row, session_id })));
    assert.equal(sidecarReadiness(f.directory, f.desktop).ready, false, 'session IDs must be literal opaque strings');
  }
}));

test('an approved untagged batch failure is ancillary only and can neither corrupt nor prove startup evidence', () => diagnosticFixture(f => {
  const failure = f.event('sidecar', 'batch_worker_failed', 90,
    { outcome: 'failed', phase: 'processing', error_code: 'EIO' });
  delete failure.session_id;
  f.write(path.basename(f.leaf), [f.sidecarEvents[0], failure, ...f.sidecarEvents.slice(1), failure]);
  assert.equal(sidecarReadiness(f.directory, f.desktop, { requireRuntime: true, requireReview: true }).ready, true);
  f.write(path.basename(f.leaf), [failure]);
  const absent = sidecarReadiness(f.directory, f.desktop);
  assert.equal(absent.ready, false); assert.equal(absent.conditions.sidecar_session, false);
  assert.equal(absent.conditions.sidecar_generation, false);
  for (const invalid of [
    { ...failure, session_id: f.session }, { ...failure, phase: 'PRIVATE_PHASE_SENTINEL' },
    { ...failure, error_code: 'PRIVATE_ERROR_SENTINEL' }, { ...failure, outcome: 'ready' },
    { ...failure, action: 'service_initialized' }, { ...failure, event: 'service_initialized' }
  ]) {
    f.write(path.basename(f.leaf), [...f.sidecarEvents, invalid]);
    const report = sidecarReadiness(f.directory, f.desktop);
    assert.equal(report.ready, false); assert.ok(report.error_codes.includes('NATIVE_SMOKE_LOG_INVALID'));
    assert.ok(!JSON.stringify(report).includes('PRIVATE_'));
  }
}));

test('current-owner IPC cannot borrow an older owner response and preserves requests issued before bootstrap', () => diagnosticFixture(f => {
  const another = `sidecar-interactions.${'b'.repeat(32)}.jsonl`;
  const latestOwner = [f.event('desktop', 'sidecar_starting', 50), f.event('desktop', 'sidecar_bootstrap_ready', 70)];
  f.write(another, f.sidecarEvents.map(row => ({ ...row, time_ms: row.time_ms + 30 })));
  f.write(path.basename(f.desktop), [...f.desktopEvents, ...latestOwner]);
  let report = sidecarReadiness(f.directory, f.desktop);
  assert.equal(report.conditions.main_ipc, true, 'the original session-only predicate is intentionally unchanged');
  assert.equal(report.conditions.sidecar_generation, true); assert.equal(report.conditions.service_initialized, true);
  assert.equal(report.conditions.current_owner_main_ipc, false); assert.equal(report.ready, false);
  assert.ok(report.error_codes.includes('NATIVE_SMOKE_CURRENT_OWNER_IPC_NOT_READY'));

  const actions = ['get_public_state', 'get_ui_context', 'get_review_session'];
  const requests = actions.map((action, index) => f.event('desktop', 'ipc_request_started', 47 + index,
    { action, request_id: requestB }));
  const responses = actions.map((action, index) => f.event('desktop', 'ipc_response_ok', 71 + index,
    { action, request_id: requestB }));
  const pending = [...f.desktopEvents, ...requests, ...latestOwner];
  f.write(path.basename(f.desktop), [...pending, ...responses.slice(0, 2)]);
  assert.equal(sidecarReadiness(f.directory, f.desktop).ready, true, 'regular startup does not require a review window');
  report = sidecarReadiness(f.directory, f.desktop, { requireReview: true });
  assert.equal(report.ready, false); assert.equal(report.conditions.current_owner_main_ipc, true);
  assert.equal(report.conditions.current_owner_review_ipc, false);
  f.write(path.basename(f.desktop), [...pending, ...responses,
    f.event('desktop', 'ipc_response_error', 74, { action: 'get_public_state', request_id: requestA })]);
  assert.equal(sidecarReadiness(f.directory, f.desktop, { requireReview: true }).ready, true,
    'a late response to old request A cannot invalidate the current correlated B response');
  f.write(path.basename(f.desktop), [...pending, ...responses,
    f.event('desktop', 'ipc_response_error', 74, { action: 'get_public_state', request_id: requestB })]);
  assert.equal(sidecarReadiness(f.directory, f.desktop).ready, false);
  f.write(path.basename(f.desktop), [...f.desktopEvents.map(row => row.event === 'ipc_response_ok'
    ? { ...row, time_ms: 70 } : row), ...latestOwner]);
  assert.equal(sidecarReadiness(f.directory, f.desktop).ready, false, 'equal-ms responses before the new bootstrap are still old');

  fs.unlinkSync(path.join(f.directory, another));
  const base = f.desktopEvents.filter(row => !row.event.startsWith('ipc_'));
  const beforeBootstrap = base.findIndex(row => row.event === 'sidecar_starting');
  f.write(path.basename(f.desktop), [...base.slice(0, beforeBootstrap),
    ...requests.map(row => ({ ...row, time_ms: 19 })), ...base.slice(beforeBootstrap),
    ...responses.map((row, index) => ({ ...row, time_ms: 42 + index }))]);
  assert.equal(sidecarReadiness(f.directory, f.desktop, { requireReview: true }).ready, true,
    'initial UI requests may precede sidecar_starting while their real responses follow bootstrap_ready');
}));

test('a legacy base log, malformed JSONL and arbitrary raw failure fields cannot grant native readiness or escape diagnostics', () => diagnosticFixture(f => {
  fs.renameSync(f.leaf, path.join(f.directory, 'sidecar-interactions.jsonl'));
  assert.equal(sidecarReadiness(f.directory, f.desktop).ready, false);
  fs.renameSync(path.join(f.directory, 'sidecar-interactions.jsonl'), f.leaf);
  for (const bytes of ['{damaged\n', JSON.stringify(f.sidecarEvents[0]), '\xff\n']) {
    fs.writeFileSync(f.leaf, bytes);
    assert.equal(sidecarReadiness(f.directory, f.desktop).ready, false);
  }
  f.write(path.basename(f.leaf), f.sidecarEvents);
  f.write(path.basename(f.desktop), [...f.desktopEvents, f.event('desktop', 'sidecar_starting', 50),
    f.event('desktop', 'sidecar_bootstrap_failed', 60, { outcome: 'failed',
      error_code: 'PRIVATE_PATH_SECRET_SENTINEL', raw_stderr: 'PRIVATE_PATH_SECRET_SENTINEL' })]);
  const report = sidecarReadiness(f.directory, f.desktop);
  assert.equal(report.ready, false); assert.equal(report.bootstrap_error, null);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_PATH_SECRET_SENTINEL'));
  assert.ok(!JSON.stringify(report).includes(f.root));
}));

test('native diagnostic inventory and bytes have finite leaf and total budgets', () => {
  diagnosticFixture(f => {
    for (let index = 1; index < MAX_LEAVES; index++) f.write(
      `sidecar-interactions.${index.toString(16).padStart(32, '0')}.jsonl`,
      f.sidecarEvents.map(row => ({ ...row, session_id: '2'.repeat(32) })));
    assert.equal(sidecarReadiness(f.directory, f.desktop).ready, true, 'exactly 64 bounded leaves remain admissible');
    f.write(`sidecar-interactions.${MAX_LEAVES.toString(16).padStart(32, '0')}.jsonl`, f.sidecarEvents);
    const report = sidecarReadiness(f.directory, f.desktop);
    assert.equal(report.ready, false); assert.ok(report.error_codes.includes('NATIVE_SMOKE_LOG_LIMIT'));
  });
  diagnosticFixture(f => {
    fs.writeFileSync(f.leaf, Buffer.alloc(MAX_LEAF_BYTES + 1, 32));
    assert.equal(sidecarReadiness(f.directory, f.desktop).ready, false);
  });
  diagnosticFixture(f => {
    const padding = 'x'.repeat(MAX_LEAF_BYTES - 1024);
    for (let segment = 1; segment <= Math.ceil(MAX_TOTAL_BYTES / padding.length); segment++) f.write(
      `sidecar-interactions.${f.generation}${segment === 1 ? '' : `.${segment}`}.jsonl`,
      [f.event('sidecar', 'diagnostic_progress', 22, { padding })]);
    const read = fs.readSync, bound = require('../plugins/data-secure/server/core/bound-file-io');
    const boundRead = bound.readBoundFileRecord, limits = [];
    let readBytes = 0, report;
    fs.readSync = function(...args) { const count = read.call(this, ...args); readBytes += count; return count; };
    bound.readBoundFileRecord = function(target, options) { limits.push(options.maximum); return boundRead(target, options); };
    try { report = sidecarReadiness(f.directory, f.desktop); }
    finally { fs.readSync = read; bound.readBoundFileRecord = boundRead; }
    assert.equal(report.ready, false); assert.ok(report.error_codes.includes('NATIVE_SMOKE_LOG_UNSAFE'));
    assert.ok(readBytes <= MAX_TOTAL_BYTES, `actual held reads consumed ${readBytes} bytes`);
    assert.ok(limits.at(-1) > 0 && limits.at(-1) < MAX_LEAF_BYTES,
      'the remaining total budget must constrain the next bound read before consuming it');
  });
  diagnosticFixture(f => {
    const exactRow = size => {
      const row = f.event('sidecar', 'diagnostic_progress', 22, { padding: '' });
      row.padding = 'x'.repeat(size - Buffer.byteLength(JSON.stringify(row) + '\n'));
      return row;
    };
    const desktopBytes = fs.statSync(f.desktop).size;
    for (let segment = 1; segment <= 4; segment++) f.write(
      `sidecar-interactions.${f.generation}${segment === 1 ? '' : `.${segment}`}.jsonl`,
      [exactRow(segment < 4 ? MAX_LEAF_BYTES : MAX_TOTAL_BYTES - desktopBytes - 3 * MAX_LEAF_BYTES)]);
    f.write(`sidecar-interactions.${f.generation}.5.jsonl`, [f.sidecarEvents[0]]);
    const read = fs.readSync, bound = require('../plugins/data-secure/server/core/bound-file-io');
    const boundRead = bound.readBoundFileRecord;
    let readBytes = 0, boundCalls = 0, report;
    fs.readSync = function(...args) { const count = read.call(this, ...args); readBytes += count; return count; };
    bound.readBoundFileRecord = function(target, options) {
      boundCalls++; assert.ok(options.maximum > 0); return boundRead(target, options);
    };
    try { report = sidecarReadiness(f.directory, f.desktop); }
    finally { fs.readSync = read; bound.readBoundFileRecord = boundRead; }
    assert.equal(readBytes, MAX_TOTAL_BYTES); assert.equal(boundCalls, 5, 'zero remaining budget fails before another bound read');
    assert.equal(report.ready, false); assert.ok(report.error_codes.includes('NATIVE_SMOKE_LOG_LIMIT'));
  });
});

test('linked leaves, redirected diagnostic directories and actual identity races fail closed', () => {
  diagnosticFixture(f => {
    fs.linkSync(f.leaf, path.join(f.root, 'second-link.jsonl'));
    const report = sidecarReadiness(f.directory, f.desktop);
    assert.equal(report.ready, false); assert.ok(report.error_codes.includes('NATIVE_SMOKE_LOG_UNSAFE'));
  });
  diagnosticFixture(f => {
    const alias = path.join(f.root, 'alias');
    fs.symlinkSync(f.directory, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(sidecarReadiness(alias, path.join(alias, path.basename(f.desktop))).ready, false);
  });
  diagnosticFixture(f => {
    fs.renameSync(f.leaf, path.join(f.root, 'preserved-leaf.jsonl'));
    const destination = path.join(f.root, 'linked-directory'); fs.mkdirSync(destination);
    fs.symlinkSync(destination, f.leaf, process.platform === 'win32' ? 'junction' : 'dir');
    const report = sidecarReadiness(f.directory, f.desktop);
    assert.equal(report.ready, false); assert.ok(report.error_codes.includes('NATIVE_SMOKE_LOG_UNSAFE'));
  });
  diagnosticFixture(f => {
    const original = fs.openSync;
    let changed = false;
    fs.openSync = function(target, ...args) {
      if (!changed && target === f.leaf) {
        changed = true;
        fs.renameSync(f.leaf, path.join(f.root, 'preserved-before-open.jsonl'));
        f.write(path.basename(f.leaf), f.sidecarEvents);
      }
      return original.call(this, target, ...args);
    };
    let report;
    try { report = sidecarReadiness(f.directory, f.desktop); }
    finally { fs.openSync = original; }
    assert.equal(changed, true); assert.equal(report.ready, false);
    assert.ok(report.error_codes.includes('NATIVE_SMOKE_LOG_CHANGED'));
  });
});

test('actual close failures and a replaced directory cannot be hidden by otherwise valid diagnostic bytes', () => {
  diagnosticFixture(f => {
    const open = fs.openSync, close = fs.closeSync;
    let leafFd, injected = false;
    fs.openSync = function(target, ...args) {
      const fd = open.call(this, target, ...args); if (target === f.leaf) leafFd = fd; return fd;
    };
    fs.closeSync = function(fd, ...args) {
      const value = close.call(this, fd, ...args);
      if (fd === leafFd && !injected) { injected = true; throw Object.assign(Error('synthetic close refusal'), { code: 'EIO' }); }
      return value;
    };
    let report;
    try { report = sidecarReadiness(f.directory, f.desktop); }
    finally { fs.openSync = open; fs.closeSync = close; }
    assert.equal(injected, true); assert.equal(report.ready, false);
    assert.ok(report.error_codes.includes('NATIVE_SMOKE_LOG_CLOSE_FAILED'));
  });
  diagnosticFixture(f => {
    const open = fs.opendirSync;
    let replaced = false;
    fs.opendirSync = function(target, ...args) {
      const handle = open.call(this, target, ...args), close = handle.closeSync.bind(handle);
      handle.closeSync = () => {
        close();
        if (target === f.directory && !replaced) {
          replaced = true;
          fs.renameSync(f.directory, path.join(f.root, 'preserved-directory'));
          fs.mkdirSync(f.directory);
          f.write(path.basename(f.desktop), f.desktopEvents);
          f.write(path.basename(f.leaf), f.sidecarEvents);
        }
      };
      return handle;
    };
    let report;
    try { report = sidecarReadiness(f.directory, f.desktop); }
    finally { fs.opendirSync = open; }
    assert.equal(replaced, true); assert.equal(report.ready, false);
    assert.ok(report.error_codes.includes('NATIVE_SMOKE_LOG_CHANGED'));
  });
});

test('the sidecar CLI keeps native positives, emits only a closed report and returns nonzero for missing evidence', () => diagnosticFixture(f => {
  const helper = path.join(__dirname, 'helpers/native-review-readiness.js');
  const run = flags => spawnSync(process.execPath, [helper, f.directory, '--sidecar', f.desktop, ...flags],
    { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  const positive = run(['--runtime', '--review', '--workspace', '--report']);
  assert.equal(positive.status, 0, positive.stderr);
  assert.equal(JSON.parse(positive.stdout).conditions.review_ipc, true);
  assert.equal(JSON.parse(positive.stdout).conditions.current_owner_main_ipc, true);
  fs.unlinkSync(f.leaf);
  const negative = run(['--runtime', '--report']);
  assert.equal(negative.status, 1); assert.equal(JSON.parse(negative.stdout).ready, false);
  assert.ok(!negative.stdout.includes(f.root)); assert.equal(negative.stderr, '');
}));

test('one bounded report retains every native readiness oracle and projects only closed launch metadata', () => diagnosticFixture(f => {
  const options = { requireRuntime: true, requireReview: true, requireWorkspace: true };
  const check = () => sidecarReadiness(f.directory, f.desktop, options);
  for (const name of ['page_loaded', 'frontend_ready', 'review_page_loaded', 'workspace_page_loaded']) {
    f.write(path.basename(f.desktop), f.desktopEvents.filter(row => row.event !== name));
    assert.equal(check().ready, false, `one coherent native gate still requires ${name}`);
  }
  for (const action of ['get_public_state', 'get_ui_context', 'get_review_session']) {
    f.write(path.basename(f.desktop), f.desktopEvents.map(row => row.event === 'ipc_response_ok' && row.action === action
      ? { ...row, event: 'ipc_response_error' } : row));
    assert.equal(check().ready, false, `one coherent native gate still requires successful ${action}`);
  }
  f.write(path.basename(f.desktop), f.desktopEvents.filter(row => row.event !== 'workspace_page_loaded'));
  assert.equal(sidecarReadiness(f.directory, f.desktop).ready, true, 'legacy Windows mode remains explicit');
  assert.equal(check().error_codes.includes('NATIVE_SMOKE_WORKSPACE_NOT_READY'), true);
  const missingWorkspace = runReadinessCli([f.directory, '--sidecar', f.desktop, '--workspace', '--report']);
  assert.equal(missingWorkspace.status, 1); assert.equal(JSON.parse(missingWorkspace.stdout).ready, false);
  for (const product_version of ['PRIVATE_PATH_SECRET_SENTINEL', ['3.2.0-rc164'], 123456, null,
    '03.2.0-rc164', '3.2.0-rc164+PRIVATE_PATH_SECRET_SENTINEL', '3.2.0']) {
    f.write(path.basename(f.desktop), f.desktopEvents.map(row => row.event === 'application_started' ? { ...row, product_version } : row));
    const report = check(); assert.equal(report.product_version, null); assert.equal(report.application_started_ms, 10);
    assert.ok(!JSON.stringify(report).includes('PRIVATE_PATH_SECRET_SENTINEL'));
  }
  f.write(path.basename(f.desktop), [...f.desktopEvents, f.event('desktop', 'application_started', 100,
    { session_id: '2'.repeat(32), product_version: 'PRIVATE_PATH_SECRET_SENTINEL' })]);
  const latest = check(); assert.equal(latest.ready, false); assert.equal(latest.product_version, null);
  assert.equal(latest.application_started_ms, 100, 'metadata is from the same latest session, never borrowed from an older start');
  f.write(path.basename(f.desktop), f.desktopEvents.map(row => row.event === 'application_started'
    ? { ...row, time_ms: 'PRIVATE_PATH_SECRET_SENTINEL' } : row));
  assert.equal(check().application_started_ms, null);
}));

test('actual CLI sidecar and file modes never pre-read diagnostic paths with readFileSync', () => diagnosticFixture(f => {
  const readFile = fs.readFileSync, read = fs.readSync;
  const bound = require('../plugins/data-secure/server/core/bound-file-io');
  const boundRecord = bound.readBoundFileRecord, boundFile = bound.readBoundFile;
  const capabilities = []; let unchecked = 0, readBytes = 0;
  fs.readFileSync = function(target, ...args) {
    if (typeof target === 'string' && target.endsWith('.jsonl')) { unchecked++; throw Error('UNBOUNDED_DIAGNOSTIC_READ'); }
    return readFile.call(this, target, ...args);
  };
  fs.readSync = function(...args) { const count = read.call(this, ...args); readBytes += count; return count; };
  bound.readBoundFileRecord = function(target, options) { capabilities.push(options); return boundRecord(target, options); };
  bound.readBoundFile = function(target, options) { capabilities.push(options); return boundFile(target, options); };
  try {
    const report = runReadinessCli([f.directory, '--sidecar', f.desktop, '--runtime', '--review', '--workspace', '--report']);
    assert.equal(report.status, 0); assert.equal(JSON.parse(report.stdout).ready, true);
    assert.equal(runReadinessCli([f.desktop, '--main', '--workspace']).status, 0);
    assert.equal(unchecked, 0); assert.equal(capabilities.length, 3);
    assert.ok(capabilities.every(value => value.maximum === MAX_LEAF_BYTES && value.maxLinks === 1 && value.checkCtime === true));
    fs.writeFileSync(f.desktop, Buffer.alloc(MAX_LEAF_BYTES + 1, 32));
    readBytes = 0;
    assert.equal(runReadinessCli([f.desktop, '--main', '--workspace']).status, 1); assert.equal(readBytes, 0);
    f.write(path.basename(f.desktop), f.desktopEvents);
    fs.linkSync(f.desktop, path.join(f.root, 'desktop-second-link.jsonl'));
    readBytes = 0;
    assert.equal(runReadinessCli([f.desktop, '--main', '--workspace']).status, 1); assert.equal(readBytes, 0);
    assert.equal(unchecked, 0);
  } finally {
    fs.readFileSync = readFile; fs.readSync = read; bound.readBoundFileRecord = boundRecord; bound.readBoundFile = boundFile;
  }
}));

test('all native launchers use bounded sidecar evidence and Mac failures report individual fixed predicates before cleanup', () => {
  for (const name of ['standalone-native-macos-launch.sh', 'standalone-native-linux-launch.sh', 'standalone-macos-regular-start.sh']) {
    const source = fs.readFileSync(path.join(__dirname, 'manual', name), 'utf8');
    assert.match(source, /--sidecar "\$desktop_log"/u);
    assert.match(source, /--sidecar "\$desktop_log"[^\n]*--report/u);
    assert.doesNotMatch(source, /sidecar-interactions\.jsonl/u);
    assert.doesNotMatch(source, /node -e .*fs\.readFileSync/u);
    assert.doesNotMatch(source, /grep[^\n]*"\$desktop_log"|native-review-readiness\.js" "\$desktop_log"/u);
    const gate = source.match(/  if node [\s\S]*?; then\n    ready=true/u)?.[0];
    assert.ok(gate); assert.equal(gate.match(/native-review-readiness\.js/gu)?.length, 1, 'one report supplies all diagnostic predicates');
    assert.match(gate, /--workspace/u);
    if (name !== 'standalone-macos-regular-start.sh') assert.match(source, /--sidecar "\$desktop_log"[^\n]*--review/u);
  }
  const windows = fs.readFileSync(path.join(__dirname, 'manual/standalone-native-windows-launch.ps1'), 'utf8');
  assert.match(windows, /Read-NativeSidecarReadiness \$diagnosticRoot \$desktopLog/u);
  assert.match(windows, /-RequireReview:\$AssertReviewWindow -RequireWorkspace:\$AssertWorkspace/u);
  assert.match(windows, /if \(\$application -and \$sidecarStatus\.ready\)/u);
  assert.match(windows, /\$sidecarStatus\.application_started_ms -ge \$startedAt/u);
  assert.match(windows, /\$sidecarStatus\.product_version -ceq \$expectedVersion/u);
  assert.doesNotMatch(windows, /Read-InteractionEvents|Get-Content[^\n]*(?:\$desktopLog|\$Path)|\$desktopSession|\$sidecarSession/u);
  const nativeTail = windows.slice(windows.indexOf('$deadline = [DateTimeOffset]::UtcNow.AddSeconds(30)'));
  assert.doesNotMatch(nativeTail, /STANDALONE NATIVE EVENT|foreach \(\$record|\$record\.\$field/u);
});

test('page load, request start, unrelated success and refused review IPC cannot pass macOS readiness', () => {
  for (const records of [[page], [page, request], [page, request, failed],
    [page, request, { event: 'ipc_response_ok', action: 'get_public_state' }],
    [page, request, success, failed]]) assert.equal(reviewReady(records), false);
  assert.equal(reviewReady([page, request, failed, success]), true);
  for (const event of ['ipc_response_invalid', 'ipc_request_failed', 'sidecar_exited_before_response',
    'ipc_request_started', 'ipc_request_sent']) {
    assert.equal(reviewReady([page, request, success, rpc(event, 'get_review_session')]), false);
  }
});

test('the macOS native launcher uses the tested successful-response predicate', () => {
  const source = fs.readFileSync(path.join(__dirname, 'manual/standalone-native-macos-launch.sh'), 'utf8');
  assert.match(source, /if node "\$script_directory\/\.\.\/helpers\/native-review-readiness\.js"/u);
  assert.doesNotMatch(source, /&& grep -q '"action":"get_review_session"' "\$sidecar_log"/u);
  assert.match(source, /no review decisions/u);
  assert.match(source, /--sidecar "\$desktop_log" --runtime --review --workspace/u);
  assert.doesNotMatch(source, /grep -q '"action":"get_(?:public_state|ui_context)"'/u);
});

test('both main-window actions require their newest successful response, never just a request or an old success', () => {
  const events = [{ event: 'page_loaded' }, { event: 'frontend_ready' }];
  for (const action of ['get_public_state', 'get_ui_context']) events.push(
    rpc('ipc_request_started', action), rpc('ipc_response_ok', action));
  assert.equal(mainReady(events), true);
  for (const action of ['get_public_state', 'get_ui_context']) {
    assert.equal(mainReady(events.filter(event => event.action !== action)), false);
    for (const event of ['ipc_response_error', 'ipc_response_invalid', 'ipc_request_started',
      'ipc_request_sent', 'ipc_request_failed', 'sidecar_exited_before_response']) {
      assert.equal(mainReady([...events, rpc(event, action)]), false, `${action}:${event}`);
    }
  }
  // Exact prior macOS false-PASS: review IPC worked; both main-window requests
  // were present, but both failed. It must fail despite a fully loaded page.
  assert.equal(mainReady(events.map(event => event.event === 'ipc_response_ok'
    ? { ...event, event: 'ipc_response_error' } : event).concat([page, request, success])), false);
});

test('new native candidates require the actual workspace page as well as successful main IPC', () => {
  const events = [{ event: 'page_loaded' }, { event: 'frontend_ready' }];
  for (const action of ['get_public_state', 'get_ui_context']) events.push(
    rpc('ipc_request_started', action), rpc('ipc_response_ok', action));
  assert.equal(mainReady(events, { workspace: true }), false, 'Legacy page cannot prove v2');
  assert.equal(mainReady([...events, { event: 'workspace_page_loaded' }], { workspace: true }), true);
  assert.equal(mainReady([{ event: 'workspace_page_loaded' }], { workspace: true }), false);
  const helper = path.join(__dirname, 'helpers/native-review-readiness.js');
  for (const [records, expected] of [[events, 1], [[...events, { event: 'workspace_page_loaded' }], 0]]) {
    const result = spawnSync(process.execPath, [helper, '-', '--main', '--workspace'], {
      input: records.map(event => JSON.stringify(event)).join('\n') + '\n',
      encoding: 'utf8', windowsHide: true, timeout: 5000
    });
    assert.equal(result.status, expected, result.stderr);
  }
  for (const platform of ['macos', 'linux']) {
    const launcher = fs.readFileSync(path.join(__dirname, `manual/standalone-native-${platform}-launch.sh`), 'utf8');
    assert.match(launcher, /--sidecar "\$desktop_log"[^\n]*--workspace/u);
  }
  const rust = fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/tauri-contract/src/main.rs'), 'utf8');
  assert.match(rust, /webview\.label\(\) == "main" && workspace_catalogue_path\(payload\.url\(\)\.path\(\)\)/u);
  assert.match(rust, /diagnostic_event\("workspace_page_loaded", None, "ready", None, None\)/u);
});

test('the macOS log-check CLI returns nonzero for unsuccessful IPC and zero only after success', () => {
  const helper = path.join(__dirname, 'helpers/native-review-readiness.js');
  for (const [events, expected] of [
    [[page, request], 1], [[page, request, failed], 1],
    [[page, request, success, failed], 1], [[page, request, failed, success], 0]
  ]) {
    const result = spawnSync(process.execPath, [helper, '-'], {
      input: events.map(event => JSON.stringify(event)).join('\n') + '\n',
      encoding: 'utf8', windowsHide: true, timeout: 5000
    });
    assert.equal(result.status, expected, result.stderr);
  }
});

test('the actual main-window log CLI rejects successful review plus failed main IPC and rejects stale success', () => {
  const helper = path.join(__dirname, 'helpers/native-review-readiness.js');
  const events = [{ event: 'page_loaded' }, { event: 'frontend_ready' }];
  for (const action of ['get_public_state', 'get_ui_context']) events.push(
    rpc('ipc_request_started', action), rpc('ipc_response_ok', action));
  for (const [records, expected] of [
    [events, 0],
    [events.map(event => event.event === 'ipc_response_ok' ? { ...event, event: 'ipc_response_error' } : event)
      .concat([page, request, success]), 1],
    [[...events, rpc('ipc_request_started', 'get_ui_context')], 1],
    [[...events, rpc('ipc_request_started', 'get_ui_context', requestB), rpc('ipc_response_ok', 'get_ui_context')], 1],
    [[...events, rpc('ipc_request_started', 'get_ui_context', requestB), rpc('ipc_response_ok', 'get_ui_context'),
      rpc('ipc_response_ok', 'get_ui_context', requestB)], 0]
  ]) {
    const result = spawnSync(process.execPath, [helper, '-', '--main'], {
      input: records.map(event => JSON.stringify(event)).join('\n') + '\n',
      encoding: 'utf8', windowsHide: true, timeout: 5000
    });
    assert.equal(result.status, expected, result.stderr);
  }
});

test('overlapping starts correlate only the latest opaque request ID, never a delayed old response', () => {
  for (const action of ['get_review_session', 'get_public_state', 'get_ui_context']) {
    const startA = rpc('ipc_request_started', action, requestA);
    const startB = rpc('ipc_request_started', action, requestB);
    const okA = rpc('ipc_response_ok', action, requestA);
    const okB = rpc('ipc_response_ok', action, requestB);
    const failedA = rpc('ipc_response_error', action, requestA);
    const failedB = rpc('ipc_response_error', action, requestB);
    for (const [records, expected] of [
      [[startA, startB, okA], false], [[startA, okA, startB, okA], false],
      [[startA, startB, failedB, okA], false], [[startA, startB, okA, failedB], false],
      [[startA, startB, okA, okB], true], [[startA, startB, okB, failedA], true],
      [[startA, okA, startB, okB], true], [[okB, startB], false]
    ]) assert.equal(actionReady(records, action), expected, `${action}:${JSON.stringify(records)}`);
    for (const id of [undefined, '', 'x'.repeat(35), 'a'.repeat(15), 'a'.repeat(65), 1234567890123456]) {
      assert.equal(actionReady([{ event: 'ipc_request_started', action, request_id: id },
        { event: 'ipc_response_ok', action, request_id: id }], action), false);
      assert.equal(actionReady([startA, { event: 'ipc_response_ok', action, request_id: id }], action), false);
    }
    assert.equal(actionReady([startA, { event: 'ipc_response_ok', action }], action), false);
    for (const size of [16, 35, 64]) {
      const id = 'c'.repeat(size);
      assert.equal(actionReady([rpc('ipc_request_started', action, id), rpc('ipc_response_ok', action, id)], action), true);
    }
  }
});

test('readiness is restricted to the newest application session even when another session reuses the same request ID', () => {
  const sessionA = '1'.repeat(32);
  const sessionB = '2'.repeat(32);
  const inSession = (records, session_id) => records.map(record => ({ ...record, session_id }));
  const first = inSession([{ event: 'application_started' }, page, request, success], sessionA);
  const second = inSession([{ event: 'application_started' }, page, request], sessionB);
  assert.equal(reviewReady([...first, ...second, { ...success, session_id: sessionA }]), false);
  assert.equal(reviewReady([...first, ...second, { ...success, session_id: sessionB }]), true);
  assert.equal(reviewReady([...first, ...second, { ...success, session_id: sessionB },
    { ...failed, session_id: sessionA }]), true);
  assert.equal(reviewReady([...first, ...inSession([{ event: 'application_started' }, request, success], sessionB)]), false);
  assert.equal(reviewReady([...first, { event: 'application_started' }, page, request, success]), false);
  assert.equal(reviewReady([...inSession([page, request], sessionB), { ...success, session_id: sessionA }]), false,
    'a mixed-session fragment without an explicit boundary cannot prove readiness');

  const mainEvents = [{ event: 'application_started' }, { event: 'page_loaded' }, { event: 'frontend_ready' }];
  for (const action of ['get_public_state', 'get_ui_context']) mainEvents.push(
    rpc('ipc_request_started', action), rpc('ipc_response_ok', action));
  const oldMain = inSession(mainEvents, sessionA);
  assert.equal(mainReady([...oldMain, ...inSession(mainEvents.filter(record => record.event !== 'ipc_response_ok'), sessionB),
    ...inSession(mainEvents.filter(record => record.event === 'ipc_response_ok'), sessionA)]), false);
  assert.equal(mainReady([...oldMain, ...inSession(mainEvents, sessionB)]), true);
});

test('the actual log CLI rejects overlapping stale responses and missing correlation IDs', () => {
  const helper = path.join(__dirname, 'helpers/native-review-readiness.js');
  const startB = rpc('ipc_request_started', 'get_review_session', requestB);
  const okB = rpc('ipc_response_ok', 'get_review_session', requestB);
  for (const [records, expected] of [
    [[page, request, startB, success], 1], [[page, request, startB, success, okB], 0],
    [[page, request, { event: 'ipc_response_ok', action: 'get_review_session' }], 1],
    [[page, { event: 'ipc_request_started', action: 'get_review_session' }, success], 1]
  ]) {
    const result = spawnSync(process.execPath, [helper, '-'], {
      input: records.map(record => JSON.stringify(record)).join('\n') + '\n',
      encoding: 'utf8', windowsHide: true, timeout: 5000
    });
    assert.equal(result.status, expected, result.stderr);
  }
});

test('the native campaign never substitutes Node decisions for Tauri/WebView interaction', () => {
  const script = path.join(__dirname, 'manual/standalone-native-review-campaign.mjs');
  const source = fs.readFileSync(script, 'utf8');
  assert.match(source, /writeReceipt\(scope, metadata, 'NOT_RUN'\)/u);
  assert.match(source, /CAMPAIGN_NATIVE_INTERACTION_NOT_ATTESTED/u);
  assert.match(source, /CAMPAIGN_RESTART_NOT_OBSERVED/u);
  assert.match(source, /CAMPAIGN_MAIN_IPC_NOT_SUCCESSFUL/u);
  assert.match(source, /CAMPAIGN_REVIEW_IPC_NOT_SUCCESSFUL/u);
  assert.match(source, /CAMPAIGN_DEFER_AND_BOTH_REVIEW_GROUPS_NOT_OBSERVED/u);
  assert.match(source, /--prepare-ocr/u);
  assert.match(source, /'CORRECTED'/u);
  assert.doesNotMatch(source, /runPackagedReviewScenario\(|desktop-sidecar\.js|request\(\{.*submit_review/u);
  if (!['win32', 'darwin'].includes(process.platform)) {
    const result = spawnSync(process.execPath, [script, '--check', 'not-a-native-scope'], {
      encoding: 'utf8', windowsHide: true, timeout: 5000
    });
    assert.equal(result.status, 77); assert.match(result.stderr, /NOT_RUN/u);
    return;
  }
  // Actual CLI counterexample: even an untouched archive binding cannot turn
  // preparation into a native PASS without human interaction attestation.
  const parent = fs.realpathSync.native(os.tmpdir());
  const scope = path.join(parent, `.tmp-standalone-native-${crypto.randomUUID().replaceAll('-', '')}`);
  fs.mkdirSync(scope);
  const archive = path.join(scope, 'synthetic.zip');
  const bytes = Buffer.from('synthetic binding, not a runnable package');
  const files = [archive, path.join(scope, 'NATIVE-REVIEW-CAMPAIGN.json'), path.join(scope, 'NATIVE-REVIEW-RECEIPT.json')];
  try {
    fs.writeFileSync(archive, bytes);
    fs.writeFileSync(files[1], JSON.stringify({ archive,
      archive_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      target: process.platform === 'win32' ? 'windows-x64' : `macos-${process.arch}`,
      version: 'synthetic', operator_attestation: false }));
    fs.writeFileSync(files[2], JSON.stringify({ status: 'NOT_RUN' }));
    const result = spawnSync(process.execPath, [script, '--check', scope], {
      encoding: 'utf8', windowsHide: true, timeout: 5000
    });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /CAMPAIGN_NATIVE_INTERACTION_NOT_ATTESTED/u);
    assert.equal(JSON.parse(fs.readFileSync(files[2], 'utf8')).status, 'NOT_RUN');
  } finally {
    assert.equal(path.dirname(scope), parent);
    assert.equal(fs.realpathSync.native(scope), scope);
    assert.deepEqual(fs.readdirSync(scope).sort(), files.map(file => path.basename(file)).sort());
    for (const file of files) {
      assert.equal(path.dirname(file), scope);
      const stat = fs.lstatSync(file); assert.ok(stat.isFile() && !stat.isSymbolicLink());
    }
    for (const file of files) fs.unlinkSync(file);
    fs.rmdirSync(scope);
  }
});

test('source-only OCR assertions load without canvas; actual pixel generation still requires it', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import Module from 'node:module';
    const load = Module._load;
    let rasterLoads = 0;
    Module._load = function (specifier, ...args) {
      if (specifier.includes('@napi-rs/canvas')) {
        rasterLoads++;
        throw Object.assign(new Error('NATIVE_RASTER_INTENTIONALLY_UNAVAILABLE'), { code: 'NATIVE_RASTER_INTENTIONALLY_UNAVAILABLE' });
      }
      return load.call(this, specifier, ...args);
    };
    const helper = await import('./tests/helpers/standalone-packaged-ocr-review.mjs');
    assert.equal(rasterLoads, 0);
    assert.equal(helper.contactReferences.length, 2);
    assert.throws(() => helper.assertPackagedOcrOutputs([]), /OCR_REVIEW_RESULTS_INCOMPLETE/);
    assert.throws(() => helper.packagedOcrFixtures(), { code: 'NATIVE_RASTER_INTENTIONALLY_UNAVAILABLE' });
    assert.equal(rasterLoads, 1);
  `], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
});

testAsync('packaged OCR assertions reject lost fields, leaked contacts and collapsed run identities', async () => {
  const { assertPackagedOcrOutputs, assertAppliedOcrCorrection, contactReferences, correctedPhone,
    correctionSentinel } = await import('./helpers/standalone-packaged-ocr-review.mjs');
  const text = '<!--\nEU Privacy Document Gateway test\nProfil: general\n-->' +
    '\n\n> **DataSecure-Hinweis:** Anonymisiert wurde ausschließlich der lokal in Markdown umgewandelte Inhalt. Die Vollständigkeit der Extraktion aus der Originaldatei ist nicht garantiert; nicht extrahierte Inhalte sind in diesem Ergebnis nicht enthalten.\n\n' +
    `Name: [PERSON_001]\nE-Mail: [EMAIL_REDACTED]\nTelefon: [PHONE_REDACTED]\nJava bleibt.\n${correctionSentinel}\n\n` +
    '> Hinweis: Grafiken und ihre visuelle Anordnung sind nicht enthalten. Text aus Bildern wurde übernommen; Lesefehler und Auslassungen sind möglich. Erkannte Kontaktwerte bitte mit dem Original vergleichen.\n';
  const texts = [text, text]; assertPackagedOcrOutputs(texts);
  for (const mutate of [
    values => values.pop(),
    values => values[0] = values[0].replace('Telefon: [PHONE_REDACTED]\n', ''),
    values => values[0] = values[0].replace('Java bleibt.', 'Java verändert.'),
    values => values[0] = values[0].replace('[PERSON_001]', '[PERSON_099]'),
    values => values[0] = values[0].replace('Java bleibt.', 'Java bleibt.\nZusatztext'),
    values => values[0] = values[0].replace('Name:', 'Zusatztext\nName:'),
    values => values[0] += 'alpha@native.example.invalid',
    values => values[0] += 'unexpected@other.invalid',
    values => values[0] += 'Telefon: +49 111222333',
    values => values[0] = values[0].replace('Name:', 'Author:')
  ]) { const values = [...texts]; mutate(values); assert.throws(() => assertPackagedOcrOutputs(values)); }
  const expected = contactReferences[0];
  const corrected = { original_text: `E-Mail: ${expected.corrected}\nTelefon: ${correctedPhone}` };
  assertAppliedOcrCorrection(corrected, expected);
  assert.throws(() => assertAppliedOcrCorrection({ original_text: corrected.original_text.replace(expected.corrected, expected.email) }, expected));
  assert.throws(() => assertAppliedOcrCorrection({ original_text: corrected.original_text.replace(correctedPhone, '+49 (040) 987654321') }, expected));
});

testAsync('complete shared review assertions reject lost rows, changed Sachzellen and inconsistent IDs', async () => {
  const { packagedReviewFixtures, assertPackagedReviewOutputs } = await import('./helpers/standalone-packaged-review.mjs');
  const texts = [...packagedReviewFixtures()].filter(([name]) => name.endsWith('.md')).map(([, bytes]) =>
    'Synthetic compliance prefix\n' + bytes.toString('utf8')
      .replaceAll('Max Mustermann', '[PERSON_001]').replaceAll('max@example.org', '[EMAIL_001]')
      .replaceAll('SYNTHETISCHER HÄRTETEST', '[UNTERNEHMEN_001]').replaceAll('TESTRUN VERIFIZIERER', '[PERSON_002]'));
  assertPackagedReviewOutputs(texts);
  const mutations = [
    values => values[0] = values[0].replace('| [UNTERNEHMEN_001] | firma |\n', ''),
    values => values[0] = values[0].replace('| [PERSON_002] | person |\n', ''),
    values => values[0] = values[0].replace('| firma |', '| verändert |'),
    values => values[0] = values[0].replace('[UNTERNEHMEN_001]', '[UNTERNEHMEN_009]'),
    values => values[0] = values[0].replace('[PERSON_002]', '[PERSON_009]'),
    values => values[0] = values[0].replaceAll('[PERSON_002]', '[PERSON_009]'),
    values => values[0] = values[0].replace('Begriff | Fall', 'Geänderter Begriff | Fall'),
    values => values[0] += '| zusätzliche Sachzelle | 12 |\n',
    values => values[3] = values[3].replace('| SYNTHETISCHER FOLGETEST | hinweis |\n', ''),
    values => values[3] = values[3].replace('| hinweis |', '| person |'),
    values => values[0] += '| SYNTHETISCHER FOLGETEST | hinweis |\n'
  ];
  for (const mutate of mutations) { const values = [...texts]; mutate(values); assert.throws(() => assertPackagedReviewOutputs(values)); }
  const minimal = 'Name: [PERSON_001]\nE-Mail: [EMAIL_001]\n| [UNTERNEHMEN_001] | firma |\n| [PERSON_002] | person |\n';
  assert.throws(() => assertPackagedReviewOutputs([minimal, minimal, minimal, minimal +
    '| SYNTHETISCHER FOLGETEST | hinweis |\n']), /REVIEW_COMPANY_ROWS_INCOMPLETE/u);
});

testAsync('the actual extracted execution tree rejects edited, missing, additional and redirected files', async () => {
  const { verifyExtractedCandidate } = await import('./helpers/standalone-candidate-integrity.mjs');
  const { removePackageSmokeScope } = await import('./helpers/standalone-package-scope.mjs');
  const parent = path.resolve(__dirname, '..');
  const scope = fs.mkdtempSync(path.join(parent, '.tmp-standalone-package-'));
  const candidate = path.join(scope, 'candidate');
  const entries = new Map([['bundle/app', Buffer.from('actual executable')],
    ['bundle/runtime/module.js', Buffer.from('actual runtime')]]);
  const modulePath = path.join(candidate, 'bundle/runtime/module.js');
  const extra = path.join(candidate, 'bundle/extra.js'), link = path.join(candidate, 'redirected');
  try {
    for (const [name, bytes] of entries) {
      const destination = path.join(candidate, ...name.split('/'));
      fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx' });
    }
    verifyExtractedCandidate(candidate, entries);
    fs.writeFileSync(modulePath, 'edited runtime');
    assert.throws(() => verifyExtractedCandidate(candidate, entries), /CANDIDATE_FILE_CHANGED/u);
    fs.writeFileSync(modulePath, entries.get('bundle/runtime/module.js'));
    fs.unlinkSync(modulePath);
    assert.throws(() => verifyExtractedCandidate(candidate, entries), /CANDIDATE_FILES_INCOMPLETE/u);
    fs.writeFileSync(modulePath, entries.get('bundle/runtime/module.js'), { flag: 'wx' });
    fs.writeFileSync(extra, 'unlisted module', { flag: 'wx' });
    assert.throws(() => verifyExtractedCandidate(candidate, entries), /CANDIDATE_FILE_UNEXPECTED/u);
    fs.unlinkSync(extra);
    fs.mkdirSync(path.join(candidate, 'extra-empty-directory'));
    assert.throws(() => verifyExtractedCandidate(candidate, entries), /CANDIDATE_DIRECTORY_UNEXPECTED/u);
    fs.rmdirSync(path.join(candidate, 'extra-empty-directory'));
    const outside = path.join(scope, 'outside'); fs.mkdirSync(outside);
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => verifyExtractedCandidate(candidate, entries), /CANDIDATE_LINK_FORBIDDEN/u);
    assert.ok(fs.lstatSync(link).isSymbolicLink()); fs.unlinkSync(link);
    const hardlink = path.join(scope, 'outside-hardlink');
    fs.linkSync(modulePath, hardlink);
    try { assert.throws(() => verifyExtractedCandidate(candidate, entries), /CANDIDATE_HARDLINK_FORBIDDEN/u); }
    finally { assert.ok(fs.lstatSync(hardlink).isFile() && !fs.lstatSync(hardlink).isSymbolicLink()); fs.unlinkSync(hardlink); }
    assert.throws(() => verifyExtractedCandidate(candidate, entries,
      new Map([['bundle/runtime/module.js', 0o120644]])), /CANDIDATE_ARCHIVE_FILE_TYPE_INVALID/u);
    if (process.platform !== 'win32') {
      fs.chmodSync(modulePath, 0o644);
      verifyExtractedCandidate(candidate, entries, new Map([['bundle/runtime/module.js', 0o100644]]));
      fs.chmodSync(modulePath, 0o755);
      assert.throws(() => verifyExtractedCandidate(candidate, entries,
        new Map([['bundle/runtime/module.js', 0o100644]])), /CANDIDATE_MODE_CHANGED/u);
    }
    verifyExtractedCandidate(candidate, entries);
  } finally {
    if (fs.existsSync(link)) { assert.ok(fs.lstatSync(link).isSymbolicLink()); fs.unlinkSync(link); }
    removePackageSmokeScope(parent, scope);
  }
});

testAsync('native campaign resolves supported package roots and rejects changed runtimes before launch or a PASS receipt', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'manual/standalone-native-review-campaign.mjs'), 'utf8');
  assert.match(source, /for \(const phase of ocr \? \[1, 2, 3\] : \[1, 2\]\) \{\s+const product = verifyCandidate\(scope, metadata\);/u);
  assert.match(source, /assertPackagedReviewOutputs\(outputs\)/u);
  if (!['win32', 'darwin'].includes(process.platform)) return;
  const { writeZip, readCentralModes } = await import('../scripts/lib/zip.mjs');
  const { verifyExtractedCandidate } = await import('./helpers/standalone-candidate-integrity.mjs');
  const { removePackageSmokeScope } = await import('./helpers/standalone-package-scope.mjs');
  const parent = fs.realpathSync.native(os.tmpdir());
  const target = process.platform === 'win32' ? 'windows-x64' : `macos-${process.arch}`, version = 'synthetic';
  const historical = `DataSecure-Standalone-${version}-${target}`;
  const layouts = process.platform === 'win32' ? [
    { roots: ['DataSecure'], accepted: true }, { roots: [historical], accepted: true },
    { roots: ['Other'], accepted: false }, { roots: ['datasecure'], accepted: false },
    { roots: ['DataSecure-extra'], accepted: false },
    { roots: [`DataSecure-Standalone-other-${target}`], accepted: false },
    { roots: ['DataSecure', historical], accepted: false }
  ] : [{ roots: [historical], accepted: true }];
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const entries = new Map([['server/module.js', Buffer.from('verified runtime')]]);
  const manifest = { files: [...entries].map(([name, bytes]) => ({ path: name, bytes: bytes.length,
    sha256: digest(bytes), executable: false })) };
  entries.set('STANDALONE-MANIFEST.json', Buffer.from(JSON.stringify(manifest)));
  entries.set('SHA256SUMS', Buffer.from([...entries].map(([name, bytes]) => `${digest(bytes)}  ${name}`).join('\n') + '\n'));
  for (const { roots, accepted } of layouts) {
    const scope = path.join(parent, `.tmp-standalone-native-${crypto.randomUUID().replaceAll('-', '')}`);
    // Keep the two owned fixture trees on the same volume: Windows runners put
    // TEMP on C: and the checkout on D:, so cleanup rename cannot cross them.
    const archiveScope = fs.mkdtempSync(path.join(parent, '.tmp-standalone-package-'));
    const packaged = new Map(roots.flatMap(root => [...entries].map(([name, value]) => [`${root}/${name}`, value])));
    const prefix = `${roots[0]}/`;
    const archive = path.join(archiveScope, 'synthetic.zip');
    fs.mkdirSync(scope);
    try {
      const info = path.join(scope, 'NATIVE-REVIEW-CAMPAIGN.json'), receipt = path.join(scope, 'NATIVE-REVIEW-RECEIPT.json');
      for (const [name, value] of packaged) {
        const destination = path.join(scope, 'candidate', ...name.split('/'));
        fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, value, { flag: 'wx' });
        if (process.platform !== 'win32') fs.chmodSync(destination, 0o644);
      }
      writeZip(archive, [...packaged].map(([name]) => ({
        fullPath: path.join(scope, 'candidate', ...name.split('/')),
        archivePath: name, mode: 0o100644
      })));
      const bytes = fs.readFileSync(archive);
      const metadata = { archive, archive_sha256: digest(bytes), target, version, operator_attestation: true };
      verifyExtractedCandidate(path.join(scope, 'candidate'), packaged, readCentralModes(bytes));
      fs.writeFileSync(info, JSON.stringify(metadata)); fs.writeFileSync(receipt, JSON.stringify({ status: 'NOT_RUN' }));
      // A clean supported archive reaches the next evidence gate, never PASS:
      // no native sessions or operator interaction are manufactured by this test.
      const checked = spawnSync(process.execPath, [path.join(__dirname, 'manual/standalone-native-review-campaign.mjs'), '--check', scope],
        { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      assert.notEqual(checked.status, 0);
      assert.match(checked.stderr, accepted ? /CAMPAIGN_RESTART_NOT_OBSERVED/u : /STANDALONE_ZIP_ROOT_INVALID/u, roots.join(','));
      assert.equal(JSON.parse(fs.readFileSync(receipt, 'utf8')).status, 'NOT_RUN');
      if (!accepted) continue;
      // Deliberately no native executable: observe the exact launch pathname
      // through ENOENT without opening a GUI or creating a native process.
      const executable = path.join(scope, 'candidate', roots[0], ...(target === 'windows-x64'
        ? ['DataSecure Standalone.exe'] : ['DataSecure Standalone.app', 'Contents', 'MacOS', 'datasecure-standalone']));
      assert.equal(fs.existsSync(executable), false);
      const launch = spawnSync(process.execPath, [path.join(__dirname, 'manual/standalone-native-review-campaign.mjs'), '--launch', scope],
        { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      assert.notEqual(launch.status, 0); assert.match(launch.stderr, /ENOENT/u);
      assert.ok(launch.stderr.includes(executable), `launch must use the verified root: ${roots[0]}`);
      assert.equal(JSON.parse(fs.readFileSync(receipt, 'utf8')).status, 'NOT_RUN');
      fs.writeFileSync(path.join(scope, 'candidate', ...`${prefix}server/module.js`.split('/')), 'edited after verified extraction');
      for (const mode of ['--check', '--launch']) {
        fs.writeFileSync(info, JSON.stringify(metadata));
        const result = spawnSync(process.execPath, [path.join(__dirname, 'manual/standalone-native-review-campaign.mjs'), mode, scope],
          { encoding: 'utf8', windowsHide: true, timeout: 5000 });
        assert.notEqual(result.status, 0); assert.match(result.stderr, /CANDIDATE_FILE_CHANGED/u);
        assert.equal(JSON.parse(fs.readFileSync(receipt, 'utf8')).status, 'NOT_RUN');
        assert.equal(digest(fs.readFileSync(archive)), metadata.archive_sha256);
      }
    } finally {
      // Reuse the checked per-entry cleanup implementation by moving only this
      // inspected, ordinary synthetic campaign tree into its owned smoke scope.
      assert.equal(path.dirname(scope), parent); assert.equal(fs.realpathSync.native(scope), scope);
      assert.ok(fs.lstatSync(scope).isDirectory() && !fs.lstatSync(scope).isSymbolicLink());
      const destination = path.join(archiveScope, 'campaign'); fs.renameSync(scope, destination);
      removePackageSmokeScope(parent, archiveScope);
    }
  }
});

test('the Windows launcher is bound to the successful-response predicate and has a bounded contract mode', () => {
  const script = path.join(__dirname, 'manual/standalone-native-windows-launch.ps1');
  const source = fs.readFileSync(script, 'utf8');
  assert.match(source, /\$reviewReady = \[bool\] \(\$sidecarStatus\.conditions\.review_ipc -and \$sidecarStatus\.conditions\.current_owner_review_ipc\)/u);
  assert.match(source, /-RequireReview:\$AssertReviewWindow -RequireWorkspace:\$AssertWorkspace/u);
  assert.match(source, /review_session_response_ok = \$reviewReady/u);
  assert.match(source, /if \(\$ValidateReadinessOnly\)/u);
});

if (process.platform === 'win32') test('actual PowerShell readiness rejects failed or merely started review IPC', () => {
  const script = path.join(__dirname, 'manual/standalone-native-windows-launch.ps1');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', script, '-ValidateReadinessOnly'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /READINESS CONTRACT PASS \([0-9]+ groups; no native app launch\)/u);
});
else process.stdout.write('SKIP actual PowerShell readiness contract (Windows host required; not counted passed)\n');

if (process.platform === 'win32') {
  test('the actual Windows native report gate binds version/start and never invokes unbounded or model pre-reads', () => diagnosticFixture(f => {
    const check = (options, accepted, ready) => {
      const result = runWindowsNativeReport(f, options);
      assert.ifError(result.error); assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      const json = result.stdout.match(/NATIVE_REPORT_RESULT (\{[^\r\n]*\})/u)?.[1]; assert.ok(json, result.stdout);
      assert.deepEqual(JSON.parse(json), { accepted, ready });
      assert.doesNotMatch(result.stdout + result.stderr, /UNBOUNDED_DIAGNOSTIC_READ|NATIVE_MODEL_PREDICATE_USED/u);
    };
    check({}, true, true);
    check({ expectedVersion: '3.2.0-rc165' }, false, true);
    check({ startedAt: 11 }, false, true);
    f.write(path.basename(f.desktop), f.desktopEvents.filter(row => row.event !== 'workspace_page_loaded'));
    check({}, false, false);
    f.write(path.basename(f.desktop), f.desktopEvents.map(row => row.event === 'ipc_response_ok' && row.action === 'get_review_session'
      ? { ...row, event: 'ipc_response_error' } : row));
    check({}, false, false);
  }));
  test('the actual Windows timeout surface emits only the closed report and fixed predicates, never raw record sentinels', () => diagnosticFixture(f => {
    f.write(path.basename(f.desktop), [...f.desktopEvents.map(row => row.event === 'application_started'
      ? { ...row, product_version: 'PRIVATE_PATH_SECRET_SENTINEL' } : row),
    f.event('desktop', 'PRIVATE_PATH_SECRET_SENTINEL', 90, { action: 'PRIVATE_PATH_SECRET_SENTINEL',
      error_code: 'PRIVATE_PATH_SECRET_SENTINEL', raw_stderr: 'PRIVATE_PATH_SECRET_SENTINEL' })]);
    f.write(path.basename(f.leaf), [...f.sidecarEvents, f.event('sidecar', 'PRIVATE_PATH_SECRET_SENTINEL', 90,
      { action: 'PRIVATE_PATH_SECRET_SENTINEL', error_code: 'PRIVATE_PATH_SECRET_SENTINEL' })]);
    const result = runWindowsNativeReport(f, { timeoutSurface: true });
    assert.ifError(result.error); assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /STANDALONE NATIVE CHECKPOINT /u);
    assert.match(result.stdout, /STANDALONE NATIVE SIDECAR CHECKPOINT /u);
    assert.match(result.stdout, /STANDALONE NATIVE HOST /u);
    assert.match(result.stdout, /CLOSED_TIMEOUT STANDALONE_NATIVE_IPC_TIMEOUT/u);
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_PATH_SECRET_SENTINEL|STANDALONE NATIVE EVENT/u);
    assert.ok(!(result.stdout + result.stderr).includes(f.root));
  }));
} else process.stdout.write('SKIP actual Windows native report/timeout fragments (Windows host required; not counted passed)\n');

testAsync('a nonmatching target is explicitly skipped and cannot increase passed count', async () => {
  let assertionsReached = false;
  let output = '';
  const cases = createPlatformCases({ platform: 'darwin', write: value => { output += value; } });
  await cases.test('Windows native stress', () => { assertionsReached = true; }, { platform: 'win32' });
  await cases.test('Mac actual assertion', () => { assert.equal(1 + 1, 2); }, { platform: 'darwin' });
  assert.equal(assertionsReached, false);
  assert.deepEqual(cases.snapshot(), { total: 2, passed: 1, skipped: 1, failed: 0 });
  assert.match(output, /skip 1 .*# SKIP requires win32; host darwin/u);
  assert.doesNotMatch(output, /ok 1/u);
  assert.match(output, /ok 2/u);
  await assert.rejects(cases.test('real failure', () => { throw new Error('sentinel'); }), /sentinel/u);
  assert.deepEqual(cases.snapshot(), { total: 3, passed: 1, skipped: 1, failed: 1 });
});

test('real converter suite declares platform applicability before callback execution', () => {
  const source = fs.readFileSync(path.join(__dirname, 'test-standalone-conversion-worker.mjs'), 'utf8');
  const windowsCase = source.slice(source.indexOf("await test('native Windows assignment"),
    source.indexOf("await test('truncated real stdin"));
  assert.match(windowsCase, /\{ platform: 'win32' \}/u);
  assert.doesNotMatch(windowsCase, /process\.platform[^\n]*return/u);
  assert.match(source, /counts\.passed.*counts\.skipped/u);
});

test('a native launcher on the wrong host cannot return a successful exit status', () => {
  for (const [file, marker] of [
    ['standalone-native-windows-launch.ps1', 'if ($env:OS'],
    ['standalone-native-macos-launch.sh', 'if [[ "$(uname -s)"'],
    ['standalone-native-linux-launch.sh', 'if [[ "$(uname -s)"']
  ]) {
    const source = fs.readFileSync(path.join(__dirname, 'manual', file), 'utf8');
    const guard = source.slice(source.indexOf(marker), source.indexOf(marker) + 300);
    assert.match(guard, /exit 77/u);
    assert.doesNotMatch(guard, /exit 0/u);
  }
  const linux = fs.readFileSync(path.join(__dirname, 'manual/standalone-native-linux-launch.sh'), 'utf8');
  const bash = process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe') : '/bin/bash';
  const guard = linux.slice(0, linux.indexOf('\nappdir='));
  const rejected = spawnSync(bash, ['--noprofile', '--norc', '-c', `uname() { printf '%s\\n' Darwin; }\n${guard}`],
    { encoding: 'utf8', windowsHide: true, timeout: 5000, env: { ...process.env, BASH_ENV: '' } });
  assert.ifError(rejected.error); assert.equal(rejected.status, 77, rejected.stderr);
  assert.match(rejected.stdout, /LINUX LAUNCH SKIP/u); assert.doesNotMatch(rejected.stdout, /PASS/u);
});

test('UI-only browser fixtures follow the current version without claiming native evidence', () => {
  const source = fs.readFileSync(path.join(__dirname, 'manual/standalone-ui-browser.mjs'), 'utf8');
  assert.match(source, /require\(path\.join\(root, 'package\.json'\)\)\.version/u);
  assert.equal(source.match(/product_version: productVersion/gu)?.length, 2);
  assert.doesNotMatch(source, /product_version: '3\.2\.0-rc\d+'/u);
  assert.match(source, /UI fixture only/u);
});

test('Standalone/platform gates contain the actual review and integrity regressions without duplicate entries', () => {
  const root = path.resolve(__dirname, '..');
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  assert.match(scripts['test:standalone:rust'], /^cd apps\/datasecure-standalone\/tauri-contract && cargo test --locked && cd \.\.\/\.\.\/\.\. && node tests\/test-standalone-native-export\.js$/u,
    'cold Rust compilation must finish before the bounded native IPC execution timer starts');
  const files = [...scripts['test:standalone'].matchAll(/node (tests\/[^ ]+)/gu)].map(match => match[1]);
  assert.equal(new Set(files).size, files.length);
  for (const file of ['test-standalone-review-choices.js', 'test-standalone-review-ipc.js', 'test-native-smoke-integrity.js',
    'test-standalone-pdf-text-layout.js', 'test-residual-person-review.js', 'test-standalone-package-integrity.mjs']) {
    assert.ok(files.includes(`tests/${file}`), file);
  }
  for (const platform of ['macos', 'linux']) {
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', `standalone-${platform}-sandbox.yml`), 'utf8');
    assert.match(workflow, /npm run test:standalone/u);
  }
  const gate = fs.readFileSync(path.join(root, 'scripts/run-pkg-04.ps1'), 'utf8');
  assert.match(gate, /packaged_review_ipc = 'passed'/u);
  assert.match(gate, /native_review_decisions = 'not_run'/u,
    'actual Node/private IPC decisions must not be relabelled as native UI acceptance');
});

test('Windows native cleanup proves profile quiescence before strict inventory and never skips failed deletion', () => {
  const root = path.resolve(__dirname, '..');
  const launcher = fs.readFileSync(path.join(root, 'tests/manual/standalone-native-windows-launch.ps1'), 'utf8');
  const cleanup = fs.readFileSync(path.join(root, 'tests/manual/standalone-native-cleanup.ps1'), 'utf8');
  assert.match(launcher, /Wait-NativeWebViewProfileExit \(Join-Path \$testRoot 'webview\\main'\) \$rootStartedUtc\s*\}\s*Remove-TestRoot/u);
  assert.match(launcher, /\$held\.StartTime\.ToUniversalTime\(\)/u);
  assert.match(launcher, /\$held\.WaitForExit\(\[Math\]::Min\(1000, \$remaining\)\)/u);
  assert.match(launcher, /STANDALONE_NATIVE_WEBVIEW_EXIT_TIMEOUT/u);
  assert.match(cleanup, /Get-Item -LiteralPath \$stamp\.Path -Force -ErrorAction Stop/u);
  assert.match(cleanup, /Remove-Item -LiteralPath \$stamp\.Path -Force -ErrorAction Stop/u);
});

testAsync('actual OCR-skip scenario waits for its exact batch publication after terminal counts', async () => {
  const probe = packagedOcrSkipProbe(['STANDALONE_RESULTS_MISSING', 'ready']);
  await probe.run();
  const resolutions = probe.calls.filter(value => value.action === 'resolve_history_results');
  assert.deepEqual(resolutions.map(value => value.batch_id), [probe.batchId, probe.batchId]);
  assert.notEqual(resolutions[0].request_id, resolutions[1].request_id);
  assert.deepEqual(probe.sleeps, [100]);
  assert.deepEqual(probe.events, ['missing-or-error', 'wait', 'ready', 'open']);
  assert.equal(probe.outputReads.length, 1);
  assert.match(probe.output(), /RAW OCR SKIP IPC PASS/u);
});

testAsync('actual OCR-skip scenario never retries terminal or malformed resolver failures', async () => {
  for (const failure of ['STANDALONE_HISTORY_UNAVAILABLE', 'STANDALONE_HISTORY_MISSING',
    { ok: false }, { ok: 'true' }, { error_code: 'STANDALONE_RESULTS_MISSING' }]) {
    const probe = packagedOcrSkipProbe([failure, 'ready']);
    await assert.rejects(probe.run(), error => error.code === 'ERR_ASSERTION');
    assert.equal(probe.calls.filter(value => value.action === 'resolve_history_results').length, 1);
    assert.deepEqual(probe.sleeps, []); assert.deepEqual(probe.outputReads, []);
    assert.doesNotMatch(probe.output(), /PASS/u);
  }
});

testAsync('actual OCR-skip scenario refuses unpublished paths at the original deadline without a real wait', async () => {
  const probe = packagedOcrSkipProbe(['STANDALONE_RESULTS_MISSING'], 120000);
  await assert.rejects(probe.run(), /PACKAGED_SKIP_VISIBLE_EXPORT_TIMEOUT/u);
  assert.equal(probe.clock(), 120000);
  assert.equal(probe.calls.filter(value => value.action === 'resolve_history_results').length, 1);
  assert.deepEqual(probe.sleeps, [100]); assert.deepEqual(probe.outputReads, []);
  assert.doesNotMatch(probe.output(), /PASS/u);
});

testAsync('actual OCR-skip scenario rejects even a successful resolver response arriving after its deadline', async () => {
  const probe = packagedOcrSkipProbe(['late-ready']);
  await assert.rejects(probe.run(), /PACKAGED_SKIP_VISIBLE_EXPORT_TIMEOUT/u);
  assert.equal(probe.clock(), 120000);
  assert.equal(probe.calls.filter(value => value.action === 'resolve_history_results').length, 1);
  assert.deepEqual(probe.events, ['ready']);
  assert.deepEqual(probe.sleeps, []); assert.deepEqual(probe.outputReads, []);
  assert.doesNotMatch(probe.output(), /PASS/u);
});

test('actual multi-generation observer rejects incomplete writers and preserves primary failures', () => {
  const model = path.join(__dirname, 'lib/standalone-sidecar-writer-model.cjs');
  const result = spawnSync(process.execPath, [model], { cwd: path.join(__dirname, '..'),
    encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ENGINEERING_MODEL PASS 31; real_workers=0; scopes retained/u);
});

function contentWorkflowLaunchSource() {
  const source = fs.readFileSync(path.join(__dirname, 'test-standalone-sidecar.js'), 'utf8');
  const start = source.indexOf("const caseRoot = path.join(root, 'content-format-workflow')");
  const end = source.indexOf("Projected document/converter workflow:", start);
  assert.ok(start > 0 && end > start);
  const flow = source.slice(start, end);
  const launchStart = flow.indexOf('const launch = () => {');
  const launchEnd = flow.indexOf('const restart = async () => {', launchStart);
  assert.ok(launchStart >= 0 && launchEnd > launchStart);
  return { source, flow, launch: flow.slice(launchStart, launchEnd) };
}

// Execute the real closure, not a shape regex. Only process creation and its
// observer/protocol dependencies are models; no native process or scope exists.
function assertContentWorkflowLaunchContract(launchSource) {
  const caseRoot = path.join(__dirname, 'synthetic-launch', 'content-format-workflow');
  const packagedServer = path.join(path.dirname(caseRoot), 'packaged-server');
  const writerObserverFile = path.join(__dirname, 'lib/standalone-sidecar-writer-observer.cjs');
  const historyReadObserverFile = path.join(__dirname, 'lib/standalone-history-read-observer.cjs');
  const historyEnv = 'DATASECURE_TEST_HISTORY_READ_SCOPE';
  const pinKey = 'DATASECURE_TEST_WRITER_PIN', hostKey = 'DATASECURE_TEST_WRITER_HOST';
  const env = Object.freeze({ DATASECURE_PRODUCT_CHANNEL: 'standalone',
    EU_PRIVACY_DATA_ROOT: path.join(caseRoot, 'private'), HOME: path.join(caseRoot, 'home') });
  const pin = Buffer.from('synthetic original directory binding').toString('base64');
  const writers = Object.freeze({ modelScope: true }), children = [];
  const plans = [], spawns = [], attachments = [], collectors = [], protocols = [], sent = [], order = [];
  const launch = vm.runInNewContext(`let host, client;\n${launchSource}\nlaunch`, {
    path, env, caseRoot, packagedServer, writerObserverFile, historyReadObserverFile, writers, children,
    process: { execPath: process.execPath, env: { AMBIENT_MUST_NOT_FORWARD: 'private ambient canary', NODE_OPTIONS: '--require=unapproved.cjs' } },
    writerObserver: {
      planHost(scope) {
        assert.equal(scope, writers); order.push('plan');
        const id = String(plans.length + 1).repeat(32);
        const generation = Object.freeze({ id, environment: Object.freeze({ [pinKey]: pin, [hostKey]: id }) });
        plans.push(generation); return generation;
      },
      attachHost(generation, host) {
        assert.equal(generation, plans[attachments.length]); assert.equal(host, spawns[attachments.length].child);
        order.push('attach'); attachments.push({ generation, host });
      }
    },
    childProcess: { spawn(executable, args, options) {
      order.push('spawn'); const child = Object.freeze({ modelChild: spawns.length + 1 });
      spawns.push({ executable, args, options, child }); return child;
    } },
    trackChild(child, list) { assert.equal(list, children); order.push('track'); list.push(child); return child; },
    historyReadObserver: { ENV: historyEnv, createCollector() {
      order.push('collector'); const collector = Object.freeze({ modelCollector: collectors.length + 1 });
      collectors.push(collector); return collector;
    } },
    protocolClient(...args) {
      order.push('protocol'); const index = protocols.length; protocols.push(args);
      return { send(...values) { order.push('send'); const reply = Object.freeze({ modelReply: index + 1 });
        sent.push({ index, values, reply }); return reply; } };
    }
  }, { filename: 'actual-content-workflow-launch.vm.js', timeout: 1000 });
  for (let index = 0; index < 2; index++) {
    const request = launch(); assert.equal(plans.length, index + 1, 'each launch plans a fresh generation');
    const spawn = spawns[index], expectedEnvironment = { ...env, [pinKey]: pin, [hostKey]: plans[index].id, [historyEnv]: caseRoot };
    assert.equal(spawn.executable, process.execPath);
    assert.deepStrictEqual(Array.from(spawn.args), [`--require=${historyReadObserverFile}`, `--require=${writerObserverFile}`,
      path.join(packagedServer, 'standalone/desktop-sidecar.js')]);
    assert.deepStrictEqual(Object.keys(spawn.options).sort(), ['env', 'stdio', 'windowsHide']);
    assert.deepStrictEqual(Array.from(spawn.options.stdio), ['pipe', 'pipe', 'pipe']); assert.equal(spawn.options.windowsHide, true);
    assert.deepStrictEqual(Object.keys(spawn.options.env).sort(), Object.keys(expectedEnvironment).sort());
    for (const [key, value] of Object.entries(expectedEnvironment)) {
      const descriptor = Object.getOwnPropertyDescriptor(spawn.options.env, key);
      assert.ok(descriptor && Object.hasOwn(descriptor, 'value')); assert.strictEqual(descriptor.value, value, key);
    }
    assert.deepStrictEqual(Array.from(protocols[index]), [spawn.child, undefined, undefined, collectors[index]]);
    const fields = { action: 'get_run_history', request_id: String(index + 1).repeat(16),
      schema: 'datasecure-standalone-private-ipc/1', include_hidden: false };
    const reply = request(fields); assert.equal(reply, sent[index].reply);
    assert.equal(sent[index].index, index);
    assert.deepStrictEqual(Array.from(sent[index].values).slice(0, 2), [fields.action, fields.request_id]);
    assert.deepStrictEqual(Object.keys(sent[index].values[2]), ['include_hidden']);
    assert.strictEqual(sent[index].values[2].include_hidden, false);
  }
  assert.notEqual(plans[0], plans[1]); assert.notEqual(plans[0].id, plans[1].id);
  assert.notEqual(spawns[0].child, spawns[1].child); assert.notEqual(collectors[0], collectors[1]);
  assert.deepStrictEqual(order, Array(2).fill(['plan', 'spawn', 'track', 'attach', 'collector', 'protocol', 'send']).flat());
}

test('source content workflow drains actual observed workers before each restart and final shutdown', () => {
  const { source, flow, launch } = contentWorkflowLaunchSource();
  assertContentWorkflowLaunchContract(launch);
  assert.equal((flow.match(/await writerObserver\.drain\(writers, host, \{ timeout: 22000 \}\)/gu) || []).length, 2);
  for (const [shutdown, marker] of [["'ee'.repeat(8)", 'return launch();'], ["'ef'.repeat(8)", '} else {']]) {
    const stop = flow.indexOf(shutdown);
    const drain = flow.lastIndexOf('await writerObserver.drain(', stop);
    const closed = flow.indexOf('await bounded(host.closed,', stop);
    const verified = flow.indexOf('writerObserver.assertClosedGeneration(writers, host);', closed);
    const next = flow.indexOf(marker, verified);
    assert.ok(drain >= 0 && drain < stop && closed > stop && verified > closed && next > verified);
  }
  const teardown = source.slice(source.indexOf('await writerObserver.collectTeardown('));
  assert.match(teardown, /\.\.\.writerScopes\.map\(scope => \(\) => \{/u);
  assert.match(teardown, /const proof = writerObserver\.assertAllClosed\(scope\)/u);
  assert.match(source, /hasPrimaryFailure \? \{ primary: primaryFailure \} : \{\}/u);
  assert.match(source, /remove: \(\) => removeOwnedRoot\(root, initial\)/u);
});

for (const [name, change] of [
  ['missing generation PIN', text => text.replace('...generation.environment', '...{ DATASECURE_TEST_WRITER_HOST: generation.environment.DATASECURE_TEST_WRITER_HOST }')],
  ['missing generation HOST', text => text.replace('...generation.environment', '...{ DATASECURE_TEST_WRITER_PIN: generation.environment.DATASECURE_TEST_WRITER_PIN }')],
  ['wrong history scope', text => text.replace('[historyReadObserver.ENV]: caseRoot', '[historyReadObserver.ENV]: caseRoot + "-wrong"')],
  ['ambient environment forwarding', text => text.replace('env: { ...env,', 'env: { ...process.env, ...env,')],
  ['missing history preload', text => text.replace('`--require=${historyReadObserverFile}`, ', '')],
  ['missing writer preload', text => text.replace('`--require=${writerObserverFile}`, ', '')],
  ['extra preload', text => text.replace('[`--require=${historyReadObserverFile}`', '["--require=unapproved.cjs", `--require=${historyReadObserverFile}`')],
  ['reused generation', text => text.replace('writerObserver.planHost(writers)', '(globalThis.oldGeneration ||= writerObserver.planHost(writers))')]
]) test(`actual content launcher contract rejects ${name} (RAM countercase)`, () => {
  const { launch } = contentWorkflowLaunchSource(), changed = change(launch);
  assert.notEqual(changed, launch, 'countercase changes the actual closure');
  assert.throws(() => assertContentWorkflowLaunchContract(changed), error => error.code === 'ERR_ASSERTION');
});

done();
