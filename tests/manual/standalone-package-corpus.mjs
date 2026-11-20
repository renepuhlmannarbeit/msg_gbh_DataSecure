import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isolatedSidecarEnvironment, removePackageSmokeScope } from '../helpers/standalone-package-scope.mjs';
import { windowsPackagePrefix } from '../../scripts/lib/standalone-windows-layout.mjs';

const require = createRequire(import.meta.url);
const { firstFailure, within, ownChild, endTestCliFailure } = require('../helpers/qa-parent-lifecycle.cjs');
const { readZip } = require('../../plugins/data-secure/server/zip-reader.js');
const { desktopErrorCode } = require('../../plugins/data-secure/server/core/desktop-error-contract.js');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const archive = path.resolve(process.argv[2] || '');
assert.ok(fs.statSync(archive).isFile(), 'pass the exact standalone ZIP as first argument');
const expectedArchiveSha256 = String(process.argv[3] || '').toLowerCase();
assert.ok(!expectedArchiveSha256 || /^[a-f0-9]{64}$/u.test(expectedArchiveSha256),
  'optional second argument must be the expected lowercase SHA-256');
const archiveName = path.basename(archive);
const match = /^DataSecure-Standalone-(?<version>[0-9A-Za-z.-]+)-windows-x64\.zip$/u.exec(archiveName);
assert.ok(match, 'archive name must identify the Windows standalone version');
const version = match.groups.version;
const scope = fs.mkdtempSync(path.join(repo, '.tmp-standalone-package-'));
const install = path.join(scope, 'Paket mit Leerzeichen');
const source = path.join(scope, 'Korpus');
const results = path.join(scope, 'Ergebnisse');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let child, owned, closePromise;
let succeeded = false, rootRemoved = false;
let workersQuiescent = false;
let report;
const failure = firstFailure();
let abortRequests = () => {};
function recordFailure(error) {
  failure.record(error);
  process.exitCode = 1;
  abortRequests();
}
function note(value) { try { process.stderr.write(value); } catch { /* never replace the exact primary failure */ } }

function frame(value) {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}

function protocolClient(processHandle, stderr) {
  let buffer = Buffer.alloc(0);
  const pending = new Map();
  abortRequests = () => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(failure.value); }
    pending.clear();
  };
  const fail = error => recordFailure(error);
  processHandle.stdout.on('data', (chunk) => {
    if (failure.failed) return;
    try {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE(0);
        if (length < 2 || length > 1024 * 1024) return fail(new Error('STANDALONE_CORPUS_FRAME_INVALID'));
        if (buffer.length < length + 4) return;
        const value = JSON.parse(buffer.subarray(4, length + 4));
        buffer = buffer.subarray(length + 4);
        const waiter = pending.get(value.request_id);
        if (!waiter) return fail(new Error('STANDALONE_CORPUS_RESPONSE_UNEXPECTED'));
        pending.delete(value.request_id);
        clearTimeout(waiter.timer);
        waiter.resolve(value);
      }
    } catch {
      fail(new Error('STANDALONE_CORPUS_RESPONSE_INVALID'));
    }
  });
  processHandle.once('exit', (code, signal) => {
    if (pending.size || code !== 0 || signal !== null) fail(new Error(`STANDALONE_CORPUS_EXIT:${code}`));
  });
  return (value) => {
    failure.throwIfFailed();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        fail(new Error(`STANDALONE_CORPUS_TIMEOUT:${stderr.value.slice(0, 500)}`));
      }, 120000);
      pending.set(value.request_id, { resolve, reject, timer });
      try {
        processHandle.stdin.write(frame(value), (error) => { if (error !== null && error !== undefined) fail(error); });
      } catch (error) { fail(error); }
    });
  };
}

async function boundedChildClose() {
  if (!owned) return;
  const cleanup = firstFailure();
  if (!owned.closed && child.exitCode === null && child.signalCode === null) {
    try {
      if (!owned.terminate()) throw new Error('STANDALONE_CORPUS_STOP_REFUSED');
    } catch (error) { cleanup.record(error); }
  }
  // A stop error never skips this separate true-close attempt.
  try { await within(owned.done, 5000, 'STANDALONE_CORPUS_CLEANUP_TIMEOUT'); }
  catch (error) { cleanup.record(error); }
  if (owned.failure.failed) cleanup.record(owned.failure.value);
  cleanup.throwIfFailed();
}

function relativeFiles(directory) {
  const found = [];
  const visit = (current, prefix = '') => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(path.join(current, entry.name), relative);
      else found.push(relative);
    }
  };
  visit(directory);
  return found.sort();
}

try {
  if (expectedArchiveSha256) assert.equal(hash(archive), expectedArchiveSha256, 'archive SHA-256 mismatch');
  fs.mkdirSync(install);
  fs.mkdirSync(results);
  const entries = readZip(fs.readFileSync(archive), { maxEntries: 2000, maxUncompressed: 512 * 1024 * 1024 });
  const prefix = windowsPackagePrefix(entries, version);
  for (const [name, bytes] of entries) {
    assert.ok(name.startsWith(prefix));
    const relative = name.slice(prefix.length);
    assert.ok(relative && !relative.split('/').includes('..') && !path.isAbsolute(relative));
    const destination = path.join(install, ...relative.split('/'));
    assert.equal(path.relative(install, destination).startsWith('..'), false);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { flag: 'wx' });
  }
  const generated = childProcess.spawnSync(process.execPath,
    [path.join(repo, 'scripts', 'generate-standalone-format-corpus.mjs'), source],
    { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 300000 });
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);
  const sourceFiles = relativeFiles(source);
  assert.equal(sourceFiles.length, 100);
  const sourceHashes = new Map(sourceFiles.map((name) => [name, hash(path.join(source, ...name.split('/')))]));

  const environment = isolatedSidecarEnvironment(repo, scope);
  const runtime = path.join(install, `datasecure-core-x86_64-pc-windows-msvc.exe`);
  const sidecarDirectory = path.join(install, 'server', 'standalone');
  child = childProcess.spawn(runtime, ['--require=../network-deny.cjs', 'desktop-sidecar.js'], {
    cwd: sidecarDirectory, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: environment
  });
  owned = ownChild(child, recordFailure);
  closePromise = owned.done;
  for (const stream of [child.stdin, child.stdout, child.stderr]) stream?.on('error', recordFailure);
  if (!child.stdin || !child.stdout || !child.stderr) {
    // Borrow the existing first-request budget; null pipes are not the OS cause.
    await within(Promise.race([
      owned.error.then(error => { throw error; }),
      owned.done.then(() => { failure.throwIfFailed(); throw new Error('STANDALONE_CORPUS_STDIO_UNAVAILABLE'); })
    ]), 120000, 'STANDALONE_CORPUS_SETUP_TIMEOUT');
  }
  const stderr = { value: '' };
  child.stderr.on('data', (chunk) => {
    try { stderr.value = (stderr.value + chunk.toString('utf8')).slice(-4096); }
    catch (error) { recordFailure(error); }
  });
  const send = protocolClient(child, stderr);
  let sequence = 1;
  const request = async (action, body = {}) => {
    failure.throwIfFailed();
    try {
      const answer = await send({ schema: 'datasecure-standalone-private-ipc/1',
        request_id: (sequence++).toString(16).padStart(16, '0'), action, ...body });
      failure.throwIfFailed();
      // Keep the original closed public response cause before any teardown error.
      assert.equal(answer?.ok, true, `STANDALONE_CORPUS_RESPONSE_FAILED:${action}:${desktopErrorCode(answer?.error_code)}`);
      return answer;
    } catch (error) { recordFailure(error); throw failure.value; }
  };

  assert.equal((await request('get_public_state')).ok, true);
  const admission = await request('admit_selected_sources', { source_kind: 'folder', source_paths: [source] });
  assert.equal(admission.ok, true);
  assert.equal(admission.result.selected_count, 100);
  assert.equal((await request('configure_results', { source_paths: [results] })).ok, true);
  const startedAt = Date.now();
  const started = await request('start_admitted_batch', { processing_mode: 'markdown-only' });
  assert.equal(started.ok, true);
  let terminal;
  for (let attempt = 0; attempt < 1800; attempt += 1) {
    const state = await request('get_public_state');
    assert.equal(state.ok, true);
    if (['results_available', 'completed_without_results', 'review_required', 'stopped'].includes(state.result.state)) {
      terminal = state.result;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.ok(terminal, 'packaged 100-file conversion must reach a terminal state within 30 minutes');
  const processingMilliseconds = Date.now() - startedAt;
  assert.equal(terminal.state, 'results_available');
  assert.equal(terminal.result_count, 100);
  assert.equal(terminal.failed_count, 0);
  assert.equal(terminal.batch_complete, true, 'STANDALONE_CORPUS_WORKER_QUIESCENCE_UNCONFIRMED');
  assert.equal(terminal.preparing, false, 'STANDALONE_CORPUS_WORKER_QUIESCENCE_UNCONFIRMED');
  assert.equal(terminal.processing, false, 'STANDALONE_CORPUS_WORKER_QUIESCENCE_UNCONFIRMED');
  // This isolated harness started exactly one intake and no review. The
  // production pending-intake map is removed only on the worker's actual exit;
  // with processing=false, preparing=false proves that map is also empty.
  // A terminal journal alone, a shutdown ACK or a departed sidecar cannot.
  workersQuiescent = true;
  const context = await request('get_ui_context');
  assert.equal(context.ok, true);
  assert.equal(context.result.latest_result_folder, '', 'UI context must not implicitly resolve historical results');
  const resolved = await request('resolve_history_results', { batch_id: started.result.batch_id });
  const run = resolved.result.local_path;
  assert.equal(path.dirname(run), path.join(results, 'DataSecure-Markdown'));
  assert.equal(fs.existsSync(path.join(run, 'DataSecure-Zuordnung.csv')), false);
  const outputs = relativeFiles(run);
  assert.equal(outputs.length, 100);
  const expected = sourceFiles.map((name) => name.replace(/\.[^.]+$/u, '.md')).sort();
  assert.deepEqual(outputs, expected, 'the packaged conversion must preserve the complete relative source tree');
  for (const [name, digest] of sourceHashes) {
    assert.equal(hash(path.join(source, ...name.split('/'))), digest, `source changed: ${name}`);
  }
  const history = await request('get_run_history');
  assert.equal(history.ok, true);
  assert.equal(history.result.entries[0].processing_mode, 'markdown-only');
  assert.equal(history.result.entries[0].result_count, 100);
  await request('shutdown');
  const exit = await within(closePromise, 10000, 'STANDALONE_CORPUS_SHUTDOWN_TIMEOUT');
  assert.equal(exit.code, 0);
  assert.equal(exit.signal, null);
  failure.throwIfFailed(); // Includes unsolicited frames received before true close.
  report = { schema: 'datasecure-standalone-package-corpus/1', version,
    archive_sha256: hash(archive), mode: 'markdown-only', selected: 100, results: 100,
    failures: 0, mapping: false, relative_tree_preserved: true, source_hashes_unchanged: true,
    processing_ms: processingMilliseconds, harness_duration_ms: Date.now() - startedAt };
  succeeded = true;
} catch (error) {
  recordFailure(error);
} finally {
  try { abortRequests(); } catch (error) { recordFailure(error); }
  try { await boundedChildClose(); }
  catch (error) {
    recordFailure(error);
    note('STANDALONE_CORPUS_SECONDARY:STANDALONE_CORPUS_CLEANUP_UNCONFIRMED\n');
  }
  // Failure or unknown autonomous writers never permit scope deletion.
  if (!failure.failed && succeeded && workersQuiescent && owned?.closed && process.env.DATASECURE_SMOKE_KEEP !== '1') {
    try { removePackageSmokeScope(repo, scope); rootRemoved = true; }
    catch (error) { recordFailure(error); }
  }
  if (!rootRemoved) note(`STANDALONE_CORPUS_SCOPE_STATUS_UNCONFIRMED:${scope}\n`);
}
if (!failure.failed) {
  try { process.stdout.write(`${JSON.stringify(report)}\n`); } catch (error) { recordFailure(error); }
}
endTestCliFailure({ failed: failure.failed, error: failure.value, retainedRoots: rootRemoved ? [] : [scope],
  unconfirmedChildren: !owned?.closed || !workersQuiescent });
