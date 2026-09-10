import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isolatedSidecarEnvironment, removePackageSmokeScope } from '../helpers/standalone-package-scope.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../../plugins/data-secure/server/zip-reader.js');
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
if (expectedArchiveSha256) assert.equal(hash(archive), expectedArchiveSha256, 'archive SHA-256 mismatch');
let child;
let closed = false;
let closePromise;

function frame(value) {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}

function protocolClient(processHandle, stderr) {
  let buffer = Buffer.alloc(0);
  const pending = new Map();
  const fail = (error) => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
    pending.clear();
  };
  processHandle.stdout.on('data', (chunk) => {
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
  processHandle.once('error', () => fail(new Error('STANDALONE_CORPUS_SPAWN_FAILED')));
  processHandle.once('exit', (code) => fail(new Error(`STANDALONE_CORPUS_EXIT:${code}`)));
  processHandle.stdin.once('error', () => fail(new Error('STANDALONE_CORPUS_STDIN_FAILED')));
  return (value) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(value.request_id);
      reject(new Error(`STANDALONE_CORPUS_TIMEOUT:${stderr.value.slice(0, 500)}`));
    }, 120000);
    pending.set(value.request_id, { resolve, reject, timer });
    processHandle.stdin.write(frame(value), (error) => {
      if (!error) return;
      clearTimeout(timer);
      pending.delete(value.request_id);
      reject(new Error('STANDALONE_CORPUS_STDIN_FAILED'));
    });
  });
}

async function boundedChildClose(processHandle, promise) {
  if (!processHandle || closed || processHandle.exitCode !== null) return;
  processHandle.kill();
  await Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('STANDALONE_CORPUS_CLEANUP_TIMEOUT')), 5000))
  ]);
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
  fs.mkdirSync(install);
  fs.mkdirSync(results);
  const entries = readZip(fs.readFileSync(archive), { maxEntries: 2000, maxUncompressed: 512 * 1024 * 1024 });
  const prefix = `DataSecure-Standalone-${version}-windows-x64/`;
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
  closePromise = new Promise((resolve) => child.once('close', (code) => { closed = true; resolve(code); }));
  const stderr = { value: '' };
  child.stderr.on('data', (chunk) => { stderr.value = (stderr.value + chunk.toString('utf8')).slice(-4096); });
  const send = protocolClient(child, stderr);
  let sequence = 1;
  const request = (action, body = {}) => send({ schema: 'datasecure-standalone-private-ipc/1',
    request_id: (sequence++).toString(16).padStart(16, '0'), action, ...body });

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
  const context = await request('get_ui_context');
  assert.equal(context.ok, true);
  const run = context.result.latest_result_folder;
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
  const exitCode = await Promise.race([
    closePromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('STANDALONE_CORPUS_SHUTDOWN_TIMEOUT')), 10000))
  ]);
  assert.equal(exitCode, 0);
  process.stdout.write(`${JSON.stringify({ schema: 'datasecure-standalone-package-corpus/1', version,
    archive_sha256: hash(archive), mode: 'markdown-only', selected: 100, results: 100,
    failures: 0, mapping: false, relative_tree_preserved: true, source_hashes_unchanged: true,
    processing_ms: processingMilliseconds, harness_duration_ms: Date.now() - startedAt })}\n`);
} finally {
  await boundedChildClose(child, closePromise);
  if (process.env.DATASECURE_SMOKE_KEEP === '1') process.stderr.write(`STANDALONE_CORPUS_KEPT:${scope}\n`);
  else removePackageSmokeScope(repo, scope);
}
