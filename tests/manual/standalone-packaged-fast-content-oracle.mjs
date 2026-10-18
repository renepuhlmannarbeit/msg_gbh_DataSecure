// Usage: node tests/manual/standalone-packaged-fast-content-oracle.mjs EXACT.zip EXPECTED_SHA256
// Or --self-test (oracle counterexamples only; no packaged product coverage).
// Package-bound sidecar/worker integration, NOT Tauri, native Rust publication,
// native UI, OCR accuracy, macOS or an unassisted real-user acceptance test.
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isolatedSidecarEnvironment, removePackageSmokeScope } from '../helpers/standalone-package-scope.mjs';
import { fastContentFixtures, assertFastContentOracle, fastContentOracleSelfTest } from '../helpers/standalone-fast-content-oracle.mjs';
import { windowsPackagePrefix } from '../../scripts/lib/standalone-windows-layout.mjs';
const require = createRequire(import.meta.url);
const { readZip } = require('../../plugins/data-secure/server/zip-reader.js');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

if (process.argv.length === 3 && process.argv[2] === '--self-test') {
  process.stdout.write(`${JSON.stringify({ schema: 'datasecure-fast-content-oracle-self-test/1', ...fastContentOracleSelfTest(),
    packaged_product: 'NOT_RUN' })}\n`);
} else {
  assert.equal(process.platform, 'win32', 'FAST_CONTENT_WINDOWS_HOST_REQUIRED');
  assert.equal(process.arch, 'x64', 'FAST_CONTENT_WINDOWS_X64_REQUIRED');
  assert.equal(process.argv.length, 4, 'pass exact Windows ZIP and mandatory expected SHA256');
  const archive = path.resolve(process.argv[2]), expectedSha256 = process.argv[3].toLowerCase();
  assert.match(expectedSha256, /^[a-f0-9]{64}$/u, 'mandatory expected SHA256 must contain 64 hex digits');
  const archiveStat = fs.lstatSync(archive);
  assert.ok(archiveStat.isFile() && !archiveStat.isSymbolicLink(), 'FAST_CONTENT_ARCHIVE_UNSAFE');
  const archiveBytes = fs.readFileSync(archive);
  assert.equal(digest(archiveBytes), expectedSha256, 'FAST_CONTENT_ARCHIVE_SHA256_MISMATCH');
  const entries = readZip(archiveBytes, { maxEntries: 15000, maxUncompressed: 768 * 1024 * 1024 });
  const manifests = [...entries].filter(([name]) => /^[^/]+\/STANDALONE-MANIFEST\.json$/u.test(name));
  assert.equal(manifests.length, 1, 'FAST_CONTENT_PACKAGE_MANIFEST_MISSING');
  const [manifestName, manifestBytes] = manifests[0], manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.schema, 'datasecure-standalone-package/1');
  assert.equal(manifest.target, 'windows-x64');
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/u);
  assert.match(manifest.source_fingerprint, /^[a-f0-9]{64}$/u);
  const prefix = windowsPackagePrefix(entries, manifest.version);
  assert.equal(manifestName, prefix + 'STANDALONE-MANIFEST.json');
  const scope = fs.mkdtempSync(path.join(repo, '.tmp-standalone-package-'));
  const install = path.join(scope, 'Paket ü mit Leerzeichen'), sources = path.join(scope, 'Quellen'), results = path.join(scope, 'Ergebnisse');
  let child, closePromise, closed = true, sequence = 0, request, primaryFailure, pendingRequests = 0;
  const frames = value => { const bytes = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4);
    header.writeUInt32BE(bytes.length); return Buffer.concat([header, bytes]); };
  const waitForClose = milliseconds => new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), milliseconds);
    closePromise.then(() => { clearTimeout(timer); resolve(true); });
  });
  async function stop(expectGraceful = false) {
    if (!child || closed) { assert.equal(expectGraceful, false, 'FAST_CONTENT_CHILD_EXITED_BEFORE_SHUTDOWN'); return; }
    let acknowledged = false;
    // Do not queue shutdown behind an uncertain outstanding product mutation.
    // No test-side replay or unbounded wait is allowed during retirement.
    if (pendingRequests === 0) {
      try { await request('shutdown', {}, 5000); acknowledged = true; } catch { /* bounded retirement below */ }
    }
    await waitForClose(10000);
    if (!closed) { child.kill(); await waitForClose(5000); }
    assert.equal(closed, true, 'FAST_CONTENT_CHILD_RETIREMENT_FAILED');
    if (expectGraceful) {
      assert.equal(acknowledged, true, 'FAST_CONTENT_SHUTDOWN_NOT_ACKNOWLEDGED');
      assert.equal(child.exitCode, 0, 'FAST_CONTENT_SHUTDOWN_EXIT_INVALID');
    }
  }
  const launch = async environment => {
    assert.ok(closed, 'FAST_CONTENT_PREVIOUS_CHILD_ACTIVE');
    const sidecar = path.join(install, 'server', 'standalone');
    child = childProcess.spawn(path.join(install, 'datasecure-core-x86_64-pc-windows-msvc.exe'),
      ['--require=../network-deny.cjs', 'desktop-sidecar.js'],
      { cwd: sidecar, env: environment, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    closed = false;
    closePromise = new Promise(resolve => child.once('close', code => { closed = true; resolve(code); }));
    let buffer = Buffer.alloc(0), protocolError = null;
    const pending = new Map(); pendingRequests = 0;
    const fail = error => { protocolError = error;
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); } pending.clear(); pendingRequests = 0; };
    child.stderr.on('data', () => { /* drain; no path-bearing vendor stderr enters evidence */ });
    child.once('error', () => fail(Error('FAST_CONTENT_CORE_SPAWN_FAILED')));
    child.once('exit', code => { if (pending.size) fail(Error(`FAST_CONTENT_CORE_EXIT:${code}`)); });
    child.stdin.on('error', () => fail(Error('FAST_CONTENT_STDIN_FAILED')));
    child.stdout.on('data', bytes => {
      if (protocolError) return;
      try {
        buffer = Buffer.concat([buffer, bytes]);
        while (buffer.length >= 4) {
          const size = buffer.readUInt32BE(0);
          assert.ok(size >= 2 && size <= 1024 * 1024, 'FAST_CONTENT_FRAME_INVALID');
          if (buffer.length < size + 4) return;
          const response = JSON.parse(buffer.subarray(4, size + 4)); buffer = buffer.subarray(size + 4);
          assert.equal(response.schema, 'datasecure-standalone-private-response/1');
          const item = pending.get(response.request_id); assert.ok(item, 'FAST_CONTENT_RESPONSE_UNEXPECTED');
          pending.delete(response.request_id); pendingRequests = pending.size; clearTimeout(item.timer); item.resolve(response);
        }
      } catch { fail(Error('FAST_CONTENT_RESPONSE_INVALID')); }
    });
    request = async (action, fields = {}, timeout = 120000) => {
      if (protocolError) throw protocolError;
      assert.equal(pending.size, 0, 'FAST_CONTENT_TEST_REQUIRES_SERIAL_REQUESTS');
      const requestId = (++sequence).toString(16).padStart(16, '0');
      const response = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); pendingRequests = pending.size;
          protocolError = Error(`FAST_CONTENT_REQUEST_TIMEOUT:${action}`); reject(protocolError); }, timeout);
        pending.set(requestId, { resolve, reject, timer }); pendingRequests = pending.size;
        child.stdin.write(frames({ schema: 'datasecure-standalone-private-ipc/1', request_id: requestId, action, ...fields }));
      });
      assert.equal(response.ok, true, `${action}:${response.error_code || 'UNCONFIRMED'}`);
      return response.result;
    };
    assert.equal((await request('get_public_state')).product_channel, 'standalone');
  };
  try {
    fs.mkdirSync(install); fs.mkdirSync(sources); fs.mkdirSync(results);
    for (const [name, bytes] of entries) {
      assert.ok(name.startsWith(prefix));
      const relative = name.slice(prefix.length), parts = relative.split('/');
      assert.ok(relative && !/[\\:]/u.test(relative) && parts.every(part => part && part !== '.' && part !== '..'), 'FAST_CONTENT_ARCHIVE_PATH_INVALID');
      const destination = path.join(install, ...parts);
      fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes, { flag: 'wx' });
    }
    const inputs = fastContentFixtures();
    const sourcePaths = [...inputs].map(([name, bytes]) => { const file = path.join(sources, name); fs.writeFileSync(file, bytes, { flag: 'wx' }); return file; });
    const environment = isolatedSidecarEnvironment(repo, scope);
    // No source tree, parent NODE_OPTIONS/NODE_PATH, shared user profile or
    // fake native publication channel is injected into the extracted runtime.
    await launch(environment);
    const context = await request('get_ui_context');
    assert.equal(context.latest_result_folder, '', 'FAST_CONTENT_PROFILE_NOT_FRESH');
    await request('configure_results', { source_paths: [results] });
    const admission = await request('admit_selected_sources', { source_kind: 'files', source_paths: sourcePaths, source_catalogue: true });
    assert.equal(admission.selected_count, inputs.size);
    const started = await request('start_admitted_batch', { processing_mode: 'markdown-and-anonymize', output_naming_mode: 'neutral',
      document_review: true, review_policy: 'automatic-conservative', content_options: {
        schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false },
      source_ids: admission.ui_context.source_catalogue.map(row => row.source_id), catalogue_revision: admission.ui_context.catalogue_revision });
    const batchId = started.batch_id, deadline = Date.now() + 180000;
    let entry;
    for (;;) {
      entry = (await request('get_run_history')).entries.find(row => row.batch_id === batchId);
      assert.notEqual(entry?.status, 'review_required', 'FAST_CONTENT_UNEXPECTED_HUMAN_DECISION');
      if (entry && !entry.resumable && ['results_available', 'completed_without_results'].includes(entry.status)) {
        const state = await request('get_public_state');
        if (state.batch_id === batchId && ['results_available', 'completed_without_results'].includes(state.state)) break;
      }
      assert.ok(Date.now() < deadline, 'FAST_CONTENT_COMPLETION_TIMEOUT'); await pause(100);
    }
    assert.equal(entry.result_count, 3, 'FAST_CONTENT_DOCUMENT_NOT_PRODUCED'); assert.equal(entry.failed_count, 0);
    const listed = await request('get_document_reviews', { batch_id: batchId });
    assert.equal(listed.processing_complete, true); assert.equal(listed.review_policy, 'automatic-conservative');
    assert.equal(listed.documents.length, 3); assert.deepEqual(listed.export_receipts, []);
    assert.ok(listed.documents.every(row => row.approved && row.revision === 0 && row.approval_basis === 'automatic'),
      'FAST_CONTENT_AUTOMATIC_FIRST_APPROVAL_MISSING');
    const outputTexts = new Map(), outputBytes = new Map();
    for (const row of listed.documents) {
      assert.ok(inputs.has(row.name), 'FAST_CONTENT_UNEXPECTED_DOCUMENT_NAME');
      let markdown = '';
      for (let index = 0; index < row.chunks; index++) markdown += (await request('get_document_review_chunk', {
        batch_id: batchId, document_id: row.document_id, revision: 0, chunk_index: index })).markdown;
      assert.equal(digest(Buffer.from(markdown)), row.output_sha256, 'FAST_CONTENT_CHUNK_HASH_MISMATCH');
      outputTexts.set(row.name, markdown); outputBytes.set(row.output_sha256, Buffer.from(markdown));
    }
    const oracle = assertFastContentOracle(outputTexts);
    await stop(true); await launch(environment);
    const recovered = await request('get_document_reviews', { batch_id: batchId });
    assert.deepEqual(recovered.documents, listed.documents, 'FAST_CONTENT_PERSISTED_AUTOMATIC_BASIS_CHANGED');
    const operation = crypto.randomBytes(16).toString('hex');
    const selection = recovered.documents.map(row => ({ document_id: row.document_id, revision: row.revision, output_sha256: row.output_sha256 }));
    const preview = await request('preview_document_export', { batch_id: batchId, operation_id: operation, selection });
    assert.equal(preview.files.length, 3);
    const copied = await request('export_approved_documents', { batch_id: batchId, operation_id: operation, selection });
    assert.equal(copied.exported_count, 3);
    const ack = await request('export_approved_documents', { batch_id: batchId, operation_id: operation, selection, acknowledge: true });
    assert.equal(ack.exported_count, 3); assert.equal(ack.folder_name, copied.folder_name);
    const target = await request('resolve_document_export', { batch_id: batchId, operation_id: operation });
    assert.equal(path.dirname(target.local_path), path.join(results, 'DataSecure-KI-Export'));
    const names = fs.readdirSync(target.local_path).sort(); assert.equal(names.length, 3);
    assert.deepEqual(names, preview.files.map(file => file.name).sort(), 'FAST_CONTENT_EXPORT_EXTRA_OR_MISSING_FILES');
    for (const name of names) {
      assert.match(name, /^Dokument_\d+\.md$/u);
      const bytes = fs.readFileSync(path.join(target.local_path, name)), reference = outputBytes.get(digest(bytes));
      assert.ok(reference, 'FAST_CONTENT_EXPORTED_BYTES_NOT_REVIEWED'); assert.deepEqual(bytes, reference);
    }
    const summary = await request('get_document_review_history_summary', { batch_id: batchId });
    assert.equal(summary.current_exported_count, 3); assert.equal(summary.pending_export_count, 0);
    await stop(true); await launch(environment);
    const finalSummary = await request('get_document_review_history_summary', { batch_id: batchId });
    assert.equal(finalSummary.current_exported_count, 3); assert.equal(finalSummary.pending_export_count, 0);
    assert.equal(finalSummary.automatically_approved_count, 3);
    for (const [name, bytes] of inputs) assert.deepEqual(fs.readFileSync(path.join(sources, name)), bytes, 'FAST_CONTENT_ORIGINAL_CHANGED');
    await stop(true);
    process.stdout.write(`${JSON.stringify({ schema: 'datasecure-packaged-fast-content-oracle/1',
      package_version: manifest.version, package_sha256: expectedSha256, source_fingerprint: manifest.source_fingerprint,
      product_code: 'exact_extracted_package_only', profile: 'isolated_fresh', mode: 'automatic-conservative',
      automatic_first_approval_persisted: true, source_originals_unchanged: true, export_bytes_equal_reviewed_bytes: true,
      export_ack_and_history_survive_restart: true, semantic_oracle: oracle,
      native_rust_publication_channel: 'NOT_RUN: no safe headless native bridge; production sidecar local export adapter exercised',
      native_ui: 'NOT_RUN', macos_m2: 'NOT_RUN', ocr_accuracy: 'NOT_RUN' })}\n`);
  } catch (error) { primaryFailure = error; throw error; }
  finally {
    try { await stop(); } catch (error) { if (!primaryFailure) throw error; process.stderr.write('FAST_CONTENT_CLEANUP_FAILED\n'); }
    if (closed) removePackageSmokeScope(repo, scope);
    else process.stderr.write('FAST_CONTENT_SCOPE_RETAINED_CHILD_NOT_RETIRED\n');
  }
}
