'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork, spawn } = require('child_process');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-batch-'));
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
process.env.LOCALAPPDATA = path.join(base, 'localapp');
const { roots, privacyRoot, storageStatus, ensurePrivateDirectory } = require('../plugins/data-secure/server/gateway/common');
const { beginBatch, processBatchNext, reviewDeferredBatch, resumeBatch, continueMostRecentBatch, discardIncompleteBatches, recoverableBatchStatus, localCleanupStatus, acknowledgeDeliveredPackage, listBatchResults, claimLocalBatchExecutor, releaseLocalBatchExecutor, readBatchProgress, runLocalBatchExecutor, recoverBatches, cleanupExpiredBatchSnapshots, _test } = require('../plugins/data-secure/server/gateway/batch');
const { startLocalBatchExecutor } = require('../plugins/data-secure/server/gateway/batch-executor');
const { csvField } = require('../plugins/data-secure/server/gateway/mapping');
const { evidencePath, SCHEMA, validateEvidenceRecord } = require('../plugins/data-secure/server/gateway/batch-evidence');
const { zipStore } = require('./lib/zip');

const { testAsync, done, assert } = createSuite('Server-bound batch session');

function resetInput() {
  const input = roots().input;
  for (const entry of fs.readdirSync(input)) fs.rmSync(path.join(input, entry), { recursive: true, force: true });
  return input;
}

function add(name, text) {
  const target = path.join(roots().input, name);
  fs.writeFileSync(target, text, 'utf8');
  return target;
}

function ordered(name, text, index) {
  const target = add(name, text);
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index));
  fs.utimesSync(target, timestamp, timestamp);
  return target;
}

const deps = {
  convertDocument: async (source) => ({
    markdown: fs.readFileSync(source, 'utf8'),
    attachments: [], warnings: [], unreviewedVisualCount: 0, requiresExplicitProfile: false
  })
};

async function processAndAcknowledge(token, options = deps) {
  const result = await processBatchNext(token, options);
  if (!result.ok || typeof result.package_id !== 'string') return result;
  const acknowledgement = acknowledgeDeliveredPackage(token, result.package_id);
  return { ...result, ...acknowledgement, package_id: result.package_id, read_capability: result.read_capability };
}

async function crashDetachedExecutor(token, crashAt) {
  const child = fork(path.join(__dirname, 'fixtures', 'crash-batch-worker.js'), [], {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, DATASECURE_TEST_CRASH_AT: String(crashAt) }
  });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  child.send({ type: 'run-crash-test', batch_token: token });
  return exited;
}

async function mcpBatchCalls(calls, { supportMode = false } = {}) {
  const child = spawn(process.execPath, [
    path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'index.js')
  ], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...(supportMode ? { EU_PRIVACY_SUPPORT_MODE: '1' } : {}) }
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) reject(new Error(`MCP restart probe failed (${code}): ${stderr}`));
      else resolve();
    });
  });
  for (const [index, call] of calls.entries()) {
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0', id: index + 1, method: 'tools/call',
      params: { name: call.name, arguments: call.arguments }
    })}\n`);
  }
  child.stdin.end();
  await closed;
  return stdout.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

async function main() {
  await testAsync('background executor receives its token only over private IPC and exposes content-free progress', async () => {
    resetInput(); add('worker.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    let workerFile;
    let workerArgs;
    let workerOptions;
    let message;
    const child = {
      pid: process.pid,
      send(value, callback) { message = value; setImmediate(() => callback()); },
      disconnect() {},
      unref() {},
      kill() {}
    };
    const started = startLocalBatchExecutor(begun.batch_token, {
      forkProcess(file, args, options) {
        workerFile = file;
        workerArgs = args;
        workerOptions = options;
        return child;
      }
    });
    assert.strictEqual(started.local_processing_started, true);
    assert.strictEqual(started.local_processing_active, true);
    assert.deepStrictEqual(workerArgs, []);
    assert.match(workerFile, /batch-worker\.js$/);
    assert.deepStrictEqual(workerOptions.stdio, ['ignore', 'ignore', 'ignore', 'ipc']);
    assert.deepStrictEqual(workerOptions.execArgv, [`--require=${path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'network-deny.cjs')}`]);
    assert.strictEqual(workerOptions.serialization, 'json');
    assert.strictEqual(workerOptions.env.NODE_OPTIONS, undefined);
    assert.strictEqual(workerOptions.env.HTTPS_PROXY, undefined);
    assert.deepStrictEqual(message, { type: 'start-local-batch', batch_token: begun.batch_token });
    assert.doesNotMatch(JSON.stringify(started), /worker|Mustermann|\.txt/u);
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(releaseLocalBatchExecutor(begun.batch_token, process.pid), true);
    assert.strictEqual(_test.publicProgress(_test.readState(begun.batch_token)).local_processing_active, false);
    discardIncompleteBatches();
  });

  await testAsync('local executor completes clear files before Claude reads a paginated nameless result list', async () => {
    resetInput();
    ordered('Alpha Vertrag.txt', 'Kontakt: Alice Beispiel, alice@example.test', 1);
    ordered('Beta Profil.txt', 'Kontakt: Bob Beispiel, +49 30 123456', 2);
    ordered('Gamma Vorgang.txt', 'IBAN: DE89370400440532013000', 3);
    const begun = beginBatch({ expectedCount: 3, profile: 'auto' });
    const claimed = claimLocalBatchExecutor(begun.batch_token, process.pid);
    assert.strictEqual(claimed.local_processing_active, true);
    const completed = await runLocalBatchExecutor(begun.batch_token, deps);
    assert.strictEqual(completed.complete, true);
    assert.strictEqual(completed.released, 3);
    assert.strictEqual(completed.local_processing_active, false);

    const first = listBatchResults(begun.batch_token, { limit: 2 });
    assert.strictEqual(first.results.length, 2);
    assert.strictEqual(first.available, 3);
    assert.match(first.next_cursor, /^[A-Za-z0-9_-]+$/);
    assert.doesNotMatch(JSON.stringify(first), /Alpha|Beta|Gamma|Alice|Bob|IBAN|\.txt/u);
    for (const result of first.results) {
      assert.match(result.package_id, /^ds_[a-f0-9]{32}$/);
      assert.match(result.read_capability, /^[A-Za-z0-9_-]{43}$/);
      acknowledgeDeliveredPackage(begun.batch_token, result.package_id);
    }

    const rest = listBatchResults(begun.batch_token, { cursor: first.next_cursor, limit: 2 });
    assert.strictEqual(rest.results.length, 1);
    assert.strictEqual(rest.used, 2);
    acknowledgeDeliveredPackage(begun.batch_token, rest.results[0].package_id);
    const empty = listBatchResults(begun.batch_token, { limit: 20 });
    assert.strictEqual(empty.results.length, 0);
    assert.strictEqual(empty.used, 3);
    assert.strictEqual(empty.available, 0);
  });

  await testAsync('batch-wide maintenance and audit preparation run once before a multi-document worker', async () => {
    resetInput();
    ordered('prep-one.txt', 'Kontakt: Alice Beispiel, alice@example.test', 1);
    ordered('prep-two.txt', 'Kontakt: Bob Beispiel, bob@example.test', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'customer' });
    claimLocalBatchExecutor(begun.batch_token, process.pid);
    let retention = 0;
    let working = 0;
    let audit = 0;
    const completed = await runLocalBatchExecutor(begun.batch_token, {
      ...deps,
      cleanupLocalData: () => { retention += 1; return { ok: true }; },
      cleanupAbandonedWorkingJobs: () => { working += 1; return { failures: 0 }; },
      migrateLegacyAuditReceipts: () => { audit += 1; return { legacy_pending: 0, migration_errors: 0, write_errors: 0 }; }
    });
    assert.strictEqual(completed.complete, true);
    assert.strictEqual(completed.released, 2);
    assert.strictEqual(retention, 1);
    assert.strictEqual(working, 1);
    assert.strictEqual(audit, 1);
  });

  await testAsync('one combined Cowork follow-up returns a bounded page of verified anonymized Markdown', async () => {
    resetInput();
    ordered('combined-one.txt', 'Kontakt: Alice Beispiel, alice@example.test', 1);
    ordered('combined-two.txt', `Kontakt: Bob Beispiel, bob@example.test\n${'Fachlicher Projektinhalt. '.repeat(300)}`, 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'customer' });
    claimLocalBatchExecutor(begun.batch_token, process.pid);
    const completed = await runLocalBatchExecutor(begun.batch_token, deps);
    assert.strictEqual(completed.complete, true);
    const responses = await mcpBatchCalls([{
      name: 'continue_anonymized_batch_in_chat', arguments: { batch_token: begun.batch_token }
    }], { supportMode: true });
    const delivered = responses[0].result.structuredContent;
    assert.strictEqual(delivered.documents.length, 2);
    assert.strictEqual(delivered.batch.complete, true);
    assert.strictEqual(delivered.documents.every((document) => document.content_is_verified_anonymized_markdown === true), true);
    assert.doesNotMatch(JSON.stringify(delivered), /Alice Beispiel|Bob Beispiel|combined-one|combined-two|\.txt/u);
    assert.ok(Array.isArray(delivered.document_continuations), `missing document continuations: ${Object.keys(delivered).join(',')}`);
    assert.strictEqual(delivered.document_continuations.length, 1);
    assert.strictEqual(delivered.document_continuations[0].package_id, delivered.documents[1].package_id);
    assert.match(delivered.document_continuations[0].read_capability, /^[A-Za-z0-9_-]{43}$/u);
    assert.strictEqual(delivered.document_continuations[0].offset, 4800);
    const invalid = await mcpBatchCalls([{
      name: 'continue_anonymized_batch_in_chat', arguments: {
        batch_token: begun.batch_token,
        cursor: 'invalid-mixed-mode',
        continuations: [{
          package_id: delivered.documents[0].package_id,
          read_capability: 'A'.repeat(43),
          offset: 0
        }]
      }
    }], { supportMode: true });
    assert.strictEqual(invalid[0].result.isError, true);
    assert.match(invalid[0].result.structuredContent.message, /entweder einen Seiten-Cursor oder Dokumentfortsetzungen/u);
  });

  await testAsync('a too-early Cowork follow-up does not mint a read capability while local processing is active', async () => {
    resetInput();
    ordered('still-processing.txt', 'Kontakt: Alice Beispiel, alice@example.test', 1);
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    claimLocalBatchExecutor(begun.batch_token, process.pid);
    try {
      const responses = await mcpBatchCalls([{
        name: 'continue_anonymized_batch_in_chat', arguments: { batch_token: begun.batch_token }
      }], { supportMode: true });
      const blocked = responses[0].result.structuredContent;
      assert.strictEqual(responses[0].result.isError, true);
      assert.strictEqual(blocked.error, 'local_batch_still_processing');
      assert.deepStrictEqual(blocked.documents, []);
      assert.deepStrictEqual(blocked.document_continuations, []);
      assert.strictEqual(blocked.next_cursor, null);
      assert.strictEqual(blocked.next_action, 'wait_for_local_release_before_continue_in_chat');
      assert.doesNotMatch(JSON.stringify(blocked), /still-processing|Alice|read_capability|package_id|\.txt/u);
    } finally {
      releaseLocalBatchExecutor(begun.batch_token, process.pid);
      discardIncompleteBatches();
    }
  });

  await testAsync('one mixed auto batch selects the profile independently for every document', async () => {
    resetInput();
    ordered('A.txt', [
      'Vertrag', 'Vertragspartei: Nordstern Beratung GmbH', 'Haftung und Kündigung',
      'Vertragslaufzeit: 24 Monate', 'Kontakt: Erika Beispiel'
    ].join('\n'), 1);
    ordered('B.md', [
      '# Mitarbeiterprofil', 'Berufserfahrung', 'Skillset: Java, Testing',
      'Projekterfahrung', 'Name: Max Mustermann'
    ].join('\n'), 2);
    ordered('C.txt', [
      'Bewerbung', 'Lebenslauf', 'Motivation für die ausgeschriebene Stelle',
      'Bewerber: Lea Musterfrau', 'E-Mail: lea@example.test'
    ].join('\n'), 3);
    ordered('D.md', [
      '# Kundenvorgang', 'Kundennummer: 4711', 'Kunde: Beispiel Klinik GmbH',
      'Rechnung und Bestellung', 'Kontakt: Samira Muster'
    ].join('\n'), 4);

    const begun = beginBatch({ expectedCount: 4, profile: 'auto' });
    claimLocalBatchExecutor(begun.batch_token, process.pid);
    const completed = await runLocalBatchExecutor(begun.batch_token, deps);
    assert.strictEqual(completed.complete, true);
    assert.strictEqual(completed.released, 4);

    const state = _test.readState(begun.batch_token);
    const profiles = [];
    let releasedText = '';
    for (const item of state.items) {
      const packageFolder = path.join(roots().output, item.package_id);
      const manifest = JSON.parse(fs.readFileSync(path.join(packageFolder, 'manifest.json'), 'utf8'));
      profiles.push(manifest.profile);
      releasedText += fs.readFileSync(path.join(packageFolder, manifest.document), 'utf8');
    }
    assert.deepStrictEqual(profiles, ['contract', 'personnel_profile', 'applicant', 'customer']);
    assert.doesNotMatch(releasedText, /Erika Beispiel|Max Mustermann|Lea Musterfrau|Samira Muster|lea@example\.test/u);
    assert.match(releasedText, /Haftung|Skillset|Motivation|Kundennummer/u);
  });

  await testAsync('detached local worker finishes a real text batch after the starting call returns', async () => {
    resetInput(); add('detached.txt', 'Kontakt: Max Mustermann, max.mustermann@example.test');
    const begun = beginBatch({ expectedCount: 1, profile: 'general' });
    // The product shows one native terminal notice. This integration test
    // observes the durable state directly and must not wait for a human GUI
    // action in CI.
    const started = startLocalBatchExecutor(begun.batch_token, {
      showBatchStateNotice: () => true,
      showLocalIntakeNotice: () => true
    });
    assert.strictEqual(started.local_processing_started, true);
    let progress = started;
    // The product worker is detached and intentionally independent of this
    // MCP call. Give slower Windows/CI filesystem scanners enough time before
    // declaring the integration test failed; this is not a product timeout.
    const deadline = Date.now() + 60_000;
    // `process.kill(pid, 0)` can briefly report a just-spawned detached worker
    // as unavailable on Windows even though its durable terminal commit follows
    // immediately. The journal's complete state, not one transient PID probe,
    // is the integration boundary under test.
    while ((!progress.complete || progress.local_processing_active) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      progress = readBatchProgress(begun.batch_token);
    }
    assert.strictEqual(progress.local_processing_active, false);
    assert.strictEqual(progress.complete, true);
    assert.strictEqual(progress.released, 1);
    const listed = listBatchResults(begun.batch_token, { limit: 1 });
    assert.strictEqual(listed.results.length, 1);
    assert.doesNotMatch(JSON.stringify(listed), /detached|Mustermann|example\.test/u);
    acknowledgeDeliveredPackage(begun.batch_token, listed.results[0].package_id);
  });

  await testAsync('result cursors are batch-bound and tampering fails closed', async () => {
    resetInput(); add('one.txt', 'Kunde: Max Mustermann');
    const firstBatch = beginBatch({ expectedCount: 1, profile: 'customer' });
    claimLocalBatchExecutor(firstBatch.batch_token, process.pid);
    await runLocalBatchExecutor(firstBatch.batch_token, deps);
    const page = listBatchResults(firstBatch.batch_token, { limit: 1 });
    const cursor = _test.resultCursor(firstBatch.batch_token, 0);
    const replacement = cursor.endsWith('A') ? 'B' : 'A';
    assert.throws(() => listBatchResults(firstBatch.batch_token, { cursor: `${cursor.slice(0, -1)}${replacement}` }), /Cursor ist ungültig/i);

    resetInput(); add('two.txt', 'Kunde: Erika Musterfrau');
    const secondBatch = beginBatch({ expectedCount: 1, profile: 'customer' });
    assert.throws(() => listBatchResults(secondBatch.batch_token, { cursor }), /Cursor ist ungültig/i);
    assert.strictEqual(page.results.length, 1);
  });

  await testAsync('a real MCP process restart revokes old grants but resumes the durable result cursor', async () => {
    resetInput();
    ordered('restart-alpha.txt', 'Kunde: Alice Beispiel', 1);
    ordered('restart-beta.txt', 'Kunde: Bob Beispiel', 2);
    ordered('restart-gamma.txt', 'Kunde: Carol Beispiel', 3);
    const begun = beginBatch({ expectedCount: 3, profile: 'customer' });
    claimLocalBatchExecutor(begun.batch_token, process.pid);
    const completed = await runLocalBatchExecutor(begun.batch_token, deps);
    assert.strictEqual(completed.released, 3);

    const firstProcess = await mcpBatchCalls([{
      name: 'list_document_batch_results',
      arguments: { batch_token: begun.batch_token, limit: 2 }
    }], { supportMode: true });
    const first = firstProcess[0].result.structuredContent;
    assert.strictEqual(first.results.length, 2);
    assert.match(first.next_cursor, /^[A-Za-z0-9_-]+$/u);
    const expiredByRestart = first.results[0];

    const secondProcess = await mcpBatchCalls([
      {
        name: 'read_anonymized_document',
        arguments: {
          package_id: expiredByRestart.package_id,
          read_capability: expiredByRestart.read_capability
        }
      },
      {
        name: 'list_document_batch_results',
        arguments: { batch_token: begun.batch_token, cursor: first.next_cursor, limit: 2 }
      }
    ], { supportMode: true });
    assert.strictEqual(secondProcess[0].result.isError, true);
    assert.match(secondProcess[0].result.structuredContent.message, /Leseberechtigung/u);
    const continued = secondProcess[1].result.structuredContent;
    assert.strictEqual(continued.results.length, 1);
    assert.strictEqual(continued.next_cursor, null);
    assert.strictEqual(continued.batch_complete, true);
    assert.doesNotMatch(JSON.stringify([...firstProcess, ...secondProcess]), /restart-(?:alpha|beta|gamma)|Alice|Bob|Carol|\.txt/u);
  });

  await testAsync('count mismatch cannot create a batch token', async () => {
    resetInput(); add('one.txt', 'Kunde: Max Mustermann');
    const result = beginBatch({ expectedCount: 2, profile: 'customer' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'input_count_changed');
    assert.ok(!result.batch_token);
  });

  await testAsync('server-side local start cancellation creates no sealed batch copy', async () => {
    resetInput(); add('only-local.txt', 'Kunde: Max Mustermann');
    const batchesBefore = fs.readdirSync(_test.batchRoot()).sort();
    let summary;
    const result = beginBatch({
      expectedCount: 1,
      profile: 'customer',
      confirmStart: (candidate) => { summary = candidate; return false; }
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'local_batch_start_cancelled');
    assert.match(result.user_status, /kein Stapel begonnen/);
    assert.strictEqual(result.next_action, 'restart_only_on_request');
    assert.deepStrictEqual(summary, { selected_count: 1, total_bytes: Buffer.byteLength('Kunde: Max Mustermann') });
    assert.deepStrictEqual(fs.readdirSync(_test.batchRoot()).sort(), batchesBefore);
  });

  await testAsync('batch boundaries accept 100 files but reject 101 files and more than 500 MB before hashing', async () => {
    resetInput();
    for (let index = 1; index <= 100; index++) add(`${index}.txt`, `Dokument ${index}`);
    const accepted = beginBatch({ expectedCount: 100, profile: 'general' });
    assert.strictEqual(accepted.ok, true);
    assert.throws(() => beginBatch({ expectedCount: 101, profile: 'general' }), /1 und 100/);

    resetInput();
    // The 500-MiB promise is a batch envelope. Individual parser inputs have
    // smaller honest format limits, so exceed the envelope with many valid
    // sparse TXT sources instead of two impossible 300-MiB parser inputs.
    for (let index = 1; index <= 66; index++) {
      const source = add(`large-${index}.txt`, 'x');
      fs.truncateSync(source, 8_000_000);
    }
    assert.throws(() => beginBatch({ expectedCount: 66, profile: 'general' }), /größer als 500 MB/);
  });

  await testAsync('insufficient free local storage refuses the whole batch before copying a source', async () => {
    resetInput();
    const source = add('capacity.txt', 'Kunde: Max Mustermann');
    assert.throws(() => beginBatch({
      expectedCount: 1,
      profile: 'customer',
      statfs: () => ({ bavail: 1, bsize: 1 })
    }), /nicht genug lokaler Speicher/i);
    assert.strictEqual(fs.readFileSync(source, 'utf8'), 'Kunde: Max Mustermann');
  });

  await testAsync('untrustworthy filesystem capacity metadata fails closed before a private snapshot', async () => {
    resetInput();
    const source = add('capacity-metadata.txt', 'Kunde: Max Mustermann');
    const before = fs.readdirSync(_test.batchRoot()).filter((name) => /\.(?:work|json)$/u.test(name)).sort();
    for (const statfs of [
      () => undefined,
      () => ({ bavail: Number.NaN, bsize: 4096 }),
      () => ({ bavail: -1, bsize: -(128 * 1024 * 1024) }),
      () => ({ bavail: 1000, bsize: 0 }),
      () => ({ bavail: Number.MAX_SAFE_INTEGER, bsize: 2 })
    ]) {
      assert.throws(() => beginBatch({ expectedCount: 1, profile: 'customer', statfs }), /freie lokale Speicher.*nicht sicher/i);
      assert.strictEqual(fs.readFileSync(source, 'utf8'), 'Kunde: Max Mustermann');
      assert.deepStrictEqual(fs.readdirSync(_test.batchRoot()).filter((name) => /\.(?:work|json)$/u.test(name)).sort(), before);
    }
  });

  await testAsync('unsafe OOXML directory metadata is refused for DOCX, XLSX and PPTX before a private batch copy is created', async () => {
    for (const extension of ['.docx', '.xlsx', '.pptx']) {
      resetInput();
      const existingWorkDirectories = fs.readdirSync(_test.batchRoot()).filter((name) => name.endsWith('.work')).sort();
      const source = path.join(roots().input, `unsafe-container${extension}`);
      const archive = Buffer.from(zipStore([['word/document.xml', '<w:document/>']]));
      const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      assert.ok(central >= 0);
      archive.writeUInt32LE(301 * 1024 * 1024, central + 24);
      fs.writeFileSync(source, archive);
      assert.throws(() => beginBatch({ expectedCount: 1, profile: 'general' }), /Office-Container/i);
      assert.strictEqual(fs.readFileSync(source).equals(archive), true);
      assert.deepStrictEqual(fs.readdirSync(_test.batchRoot()).filter((name) => name.endsWith('.work')).sort(), existingWorkDirectories);
    }
  });

  await testAsync('a password-protected Office container stops before a snapshot without offering an unimplemented decryption path', async () => {
    resetInput();
    const existingWorkDirectories = fs.readdirSync(_test.batchRoot()).filter((name) => name.endsWith('.work')).sort();
    const source = path.join(roots().input, 'protected.docx');
    const archive = Buffer.from(zipStore([['word/document.xml', '<w:document/>']]));
    const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    assert.ok(central >= 0);
    archive.writeUInt16LE(1, central + 8);
    fs.writeFileSync(source, archive);
    assert.throws(() => beginBatch({ expectedCount: 1, profile: 'general' }), (error) =>
      error.code === 'PASSWORD_PROTECTED_DOCUMENT_UNSUPPORTED' && !/protected|\.docx/i.test(error.message));
    assert.strictEqual(fs.readFileSync(source).equals(archive), true);
    assert.deepStrictEqual(fs.readdirSync(_test.batchRoot()).filter((name) => name.endsWith('.work')).sort(), existingWorkDirectories);
  });

  await testAsync('a standard encrypted Office CFB container stops before a snapshot without offering an unimplemented decryption path', async () => {
    resetInput();
    const existingWorkDirectories = fs.readdirSync(_test.batchRoot()).filter((name) => name.endsWith('.work')).sort();
    const source = path.join(roots().input, 'protected-standard.docx');
    const encryptedOffice = Buffer.alloc(512);
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(encryptedOffice);
    fs.writeFileSync(source, encryptedOffice);
    assert.throws(() => beginBatch({ expectedCount: 1, profile: 'general' }), (error) =>
      error.code === 'PASSWORD_PROTECTED_DOCUMENT_UNSUPPORTED' && !/protected|\.docx/i.test(error.message));
    assert.deepStrictEqual(fs.readdirSync(_test.batchRoot()).filter((name) => name.endsWith('.work')).sort(), existingWorkDirectories);
  });

  await testAsync('local mapping CSV neutralizes spreadsheet formulas', async () => {
    assert.strictEqual(csvField('=HYPERLINK("https://example.invalid")'), `"'=HYPERLINK(""https://example.invalid"")"`);
    assert.strictEqual(csvField('normal.txt'), '"normal.txt"');
  });

  await testAsync('terminal batch evidence is local, aggregate-only and free of document identifiers', async () => {
    resetInput();
    try { fs.unlinkSync(evidencePath()); } catch { /* test starts without a receipt */ }
    add('Alice-Example-Internal-Document.txt', 'Kunde: Alice Example');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const result = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(result.complete, true);
    const encoded = fs.readFileSync(evidencePath(), 'utf8');
    const receipt = JSON.parse(encoded);
    assert.strictEqual(receipt.schema, SCHEMA);
    assert.strictEqual(receipt.records.length, 1);
    assert.deepStrictEqual(receipt.records[0].counts, { total: 1, released: 1, stopped: 0, retryable: 0, pending: 0 });
    assert.strictEqual(receipt.records[0].raw_content_sent_to_claude, false);
    assert.doesNotMatch(encoded, /Alice|Example|Document|\.txt|package_id|batch_token|sha256|path/i);
    assert.throws(() => validateEvidenceRecord({ ...receipt.records[0], original_name: 'Alice Example' }), /ungültiges Format/);
    assert.throws(() => validateEvidenceRecord({ ...receipt.records[0], counts: { ...receipt.records[0].counts, total: 2 } }), /ungültiges Format/);
  });

  await testAsync('a damaged local evidence receipt does not retract an otherwise released package', async () => {
    resetInput();
    fs.writeFileSync(evidencePath(), '{not-json', 'utf8');
    add('receipt-repair.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const result = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.complete, true);
    assert.strictEqual(result.local_evidence_exported, false);
    assert.match(result.read_capability, /^[A-Za-z0-9_-]{43}$/);
    fs.unlinkSync(evidencePath());
  });

  await testAsync('a terminally stopped batch receives the same aggregate-only evidence receipt', async () => {
    resetInput();
    try { fs.unlinkSync(evidencePath()); } catch { /* test starts without a receipt */ }
    // The format gate, not the OOXML-container preflight, is the behavior
    // under test. Keep the extension/content combination structurally honest.
    fs.writeFileSync(path.join(roots().input, 'terminal-stop.xlsx'), zipStore([['xl/workbook.xml', '<workbook/>']]));
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const result = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.complete, true);
    assert.strictEqual(result.local_evidence_exported, true);
    const record = JSON.parse(fs.readFileSync(evidencePath(), 'utf8')).records[0];
    assert.strictEqual(record.outcome, 'complete_with_stopped_documents');
    assert.deepStrictEqual(record.counts, { total: 1, released: 0, stopped: 1, retryable: 0, pending: 0 });
    assert.deepStrictEqual(record.error_codes, ['FORMAT_COVERAGE_UNVERIFIED']);
    assert.doesNotMatch(JSON.stringify(record), /terminal-stop|Mustermann|\.xlsx/i);
  });

  await testAsync('a failed mapping write retains the published package for local repair without delivery', async () => {
    resetInput();
    add('mapping-failure.txt', 'Kunde: Max Mustermann');
    fs.writeFileSync(path.join(roots().exports, 'DataSecure-Mapping.csv'), 'corrupt local mapping', 'utf8');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const result = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'LOCAL_MAPPING_EXPORT_PENDING');
    assert.strictEqual(result.mapping_pending, 1);
    assert.strictEqual(result.package_id, undefined);
    const state = _test.readState(begun.batch_token);
    assert.strictEqual(state.items[0].status, 'mapping_pending');
    assert.ok(_test.regularPublishedPackage(state.items[0].package_id));
    assert.ok(!fs.existsSync(path.join(_test.workPath(begun.batch_token), state.items[0].work_name)));
    fs.unlinkSync(path.join(roots().exports, 'DataSecure-Mapping.csv'));
    const repaired = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(repaired.ok, true);
    assert.strictEqual(repaired.delivery_pending, 1);
    assert.strictEqual(repaired.package_id, state.items[0].package_id);
    const ledger = fs.readFileSync(path.join(roots().exports, 'DataSecure-Mapping.csv'), 'utf8');
    assert.strictEqual(ledger.split(`\"${repaired.package_id}\"`).length - 1, 1);
  });

  await testAsync('a private-copy cleanup failure never retracts an already published result', async () => {
    resetInput();
    add('cleanup-pending.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const result = await processBatchNext(begun.batch_token, {
      ...deps,
      unlinkWorkCopy: () => { throw new Error('synthetic locked work copy'); }
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.delivery_pending, 1);
    acknowledgeDeliveredPackage(begun.batch_token, result.package_id, {
      unlinkWorkCopy: () => { throw new Error('synthetic locked work copy'); }
    });
    const state = _test.readState(begun.batch_token);
    assert.strictEqual(state.items[0].status, 'released');
    assert.strictEqual(state.items[0].work_copy_cleanup_pending, true);
    assert.ok(fs.existsSync(path.join(_test.workPath(begun.batch_token), state.items[0].work_name)));
    const cleanup = localCleanupStatus();
    assert.strictEqual(cleanup.private_work_copy_cleanup_pending, 1);
    assert.doesNotMatch(JSON.stringify(cleanup), /cleanup-pending|Mustermann|\.txt|batch_token/i);
    const retried = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(retried.complete, true);
    const cleaned = _test.readState(begun.batch_token);
    assert.strictEqual(cleaned.items[0].work_copy_cleanup_pending, undefined);
    assert.strictEqual(localCleanupStatus().private_work_copy_cleanup_pending, 0);
    assert.ok(!fs.existsSync(path.join(_test.workPath(begun.batch_token), cleaned.items[0].work_name)));
  });

  await testAsync('an unacknowledged package is redelivered without processing its source twice', async () => {
    resetInput();
    add('handoff.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const first = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.delivery_pending, 1);
    const stateBefore = _test.readState(begun.batch_token);
    const second = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(second.package_id, first.package_id);
    assert.strictEqual(second.delivery_pending, 1);
    assert.strictEqual(fs.readdirSync(roots().output).filter((name) => name === first.package_id).length, 1);
    acknowledgeDeliveredPackage(begun.batch_token, second.package_id);
    const stateAfter = _test.readState(begun.batch_token);
    assert.strictEqual(stateBefore.items[0].id, stateAfter.items[0].id);
    assert.strictEqual(stateAfter.items[0].status, 'released');
    assert.strictEqual(stateAfter.items[0].package_id, first.package_id);
  });

  await testAsync('crash recovery adopts a verified published package and writes no duplicate mapping row', async () => {
    resetInput();
    const mapping = path.join(roots().exports, 'DataSecure-Mapping.csv');
    try { fs.unlinkSync(mapping); } catch { /* isolated mapping ledger */ }
    add('recover-published.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const published = await processBatchNext(begun.batch_token, deps);
    const stateFile = path.join(_test.batchRoot(), `${begun.batch_token}.json`);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    // Simulate termination just after the output rename: the output exists,
    // but the batch journal still says processing and has no package id.
    state.items[0].status = 'processing';
    delete state.items[0].package_id;
    fs.writeFileSync(stateFile, JSON.stringify(state));
    const recovered = recoverBatches();
    assert.ok(recovered.recovered >= 1, 'global recovery may also repair an earlier interrupted test batch');
    const redelivered = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(redelivered.package_id, published.package_id);
    assert.strictEqual(redelivered.delivery_pending, 1);
    const ledger = fs.readFileSync(mapping, 'utf8');
    assert.strictEqual(ledger.split(`\"${published.package_id}\"`).length - 1, 1);
    acknowledgeDeliveredPackage(begun.batch_token, redelivered.package_id);
  });

  await testAsync('default storage uses local application data and known sync roots are refused', async () => {
    const configured = process.env.EU_PRIVACY_ROOT;
    delete process.env.EU_PRIVACY_ROOT;
    assert.ok(privacyRoot().startsWith(path.resolve(process.env.LOCALAPPDATA)));
    assert.strictEqual(path.basename(path.dirname(privacyRoot())), 'SecureDataMsg');
    assert.strictEqual(storageStatus().mode, 'local_app_data');
    process.env.EU_PRIVACY_ROOT = path.join(base, 'OneDrive - Example', 'Privacy');
    assert.strictEqual(storageStatus().safe, false);
    assert.throws(() => beginBatch({ expectedCount: 1 }), /nicht freigegeben/i);
    process.env.EU_PRIVACY_ROOT = configured;
  });

  await testAsync('a configured privacy root behind a local link is refused before a batch starts', async () => {
    const configured = process.env.EU_PRIVACY_ROOT;
    const target = path.join(base, 'OneDrive - Example', 'actual');
    const link = path.join(base, 'apparently-local');
    fs.mkdirSync(target, { recursive: true });
    try { fs.rmSync(link, { recursive: true, force: true }); } catch { /* absent */ }
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    process.env.EU_PRIVACY_ROOT = path.join(link, 'Privacy');
    assert.strictEqual(storageStatus().safe, false);
    assert.throws(() => beginBatch({ expectedCount: 1 }), /nicht freigegeben/i);
    process.env.EU_PRIVACY_ROOT = configured;
  });

  await testAsync('the private batch root refuses a junction or symlink before listing or copying', async () => {
    const configuredLocalAppData = process.env.LOCALAPPDATA;
    const isolatedLocalAppData = path.join(base, 'isolated-localapp');
    const gatewayRoot = path.join(isolatedLocalAppData, 'SecureDataMsg');
    const outside = path.join(base, 'outside-batch-target');
    fs.mkdirSync(gatewayRoot, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    const linkedBatches = path.join(gatewayRoot, 'batches');
    fs.symlinkSync(outside, linkedBatches, process.platform === 'win32' ? 'junction' : 'dir');
    process.env.LOCALAPPDATA = isolatedLocalAppData;
    try {
      assert.throws(() => _test.batchRoot(), /PRIVACY_STORAGE_UNSAFE/);
      assert.deepStrictEqual(fs.readdirSync(outside), []);
    } finally {
      process.env.LOCALAPPDATA = configuredLocalAppData;
    }
  });

  await testAsync('an input inode swap immediately before snapshot copy fails closed', async () => {
    resetInput();
    const original = add('swap-before-copy.txt', 'Kunde: Max Mustermann');
    const saved = path.join(base, 'swap-before-copy.saved');
    let swapped = false;
    try {
      assert.throws(() => beginBatch({
        expectedCount: 1,
        profile: 'customer',
        statfs(target) {
          if (!swapped) {
            fs.renameSync(original, saved);
            fs.writeFileSync(original, 'ausgetauschtes Objekt', 'utf8');
            swapped = true;
          }
          return fs.statfsSync(target);
        }
      }), /während der lokalen Übernahme verändert/i);
      assert.strictEqual(fs.readFileSync(saved, 'utf8'), 'Kunde: Max Mustermann');
      assert.strictEqual(fs.readFileSync(original, 'utf8'), 'ausgetauschtes Objekt');
    } finally {
      if (fs.existsSync(original)) fs.unlinkSync(original);
      if (fs.existsSync(saved)) fs.renameSync(saved, original);
    }
  });

  await testAsync('discard refuses a nested junction or symlink and leaves its external target untouched', async () => {
    resetInput(); add('discard-link.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const outside = path.join(base, 'discard-external-target');
    const sentinel = path.join(outside, 'do-not-touch.txt');
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(sentinel, 'extern und unverändert', 'utf8');
    const link = path.join(_test.workPath(begun.batch_token), 'unexpected-link');
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => discardIncompleteBatches(), /Arbeitsbereich konnte nicht sicher bereinigt/i);
    assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'extern und unverändert');
    assert.strictEqual(fs.existsSync(path.join(_test.batchRoot(), `${begun.batch_token}.json`)), true);
    fs.unlinkSync(link);
    assert.strictEqual(discardIncompleteBatches().ok, true);
    assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'extern und unverändert');
  });

  await testAsync('discard uses inode-bound single-entry removal instead of recursive rm', async () => {
    resetInput(); add('discard-single-entry.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const nested = path.join(_test.workPath(begun.batch_token), 'nested');
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, 'regular.txt'), 'nur lokal', 'utf8');
    const originalRm = fs.rmSync;
    fs.rmSync = () => { throw new Error('recursive rm must not be called'); };
    try {
      assert.strictEqual(discardIncompleteBatches().ok, true);
      assert.strictEqual(fs.existsSync(_test.workPath(begun.batch_token)), false);
    } finally {
      fs.rmSync = originalRm;
    }
  });

  await testAsync('private directory creation accepts only one literal child below its parent', async () => {
    const parent = path.join(base, 'private-directory-parent');
    const created = ensurePrivateDirectory(parent, 'audit');
    assert.strictEqual(created, path.join(parent, 'audit'));
    assert.throws(() => ensurePrivateDirectory(parent, '../outside'), /PRIVACY_STORAGE_UNSAFE/);
    assert.throws(() => ensurePrivateDirectory(parent, 'nested/child'), /PRIVACY_STORAGE_UNSAFE/);
  });

  await testAsync('explicit discard removes incomplete snapshots but preserves already published output', async () => {
    resetInput(); add('discard-me.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    assert.ok(fs.existsSync(_test.workPath(begun.batch_token)));
    const result = discardIncompleteBatches();
    assert.strictEqual(result.ok, true);
    assert.ok(result.discarded_batches >= 1);
    assert.strictEqual(result.raw_content_sent_to_claude, false);
    assert.strictEqual(fs.existsSync(_test.workPath(begun.batch_token)), false);
    assert.strictEqual(fs.existsSync(path.join(_test.batchRoot(), `${begun.batch_token}.json`)), false);
  });

  await testAsync('only one local batch can process at a time and a dead owner lock is recoverable', async () => {
    resetInput(); add('confirmed.txt', 'Kunde: Max Mustermann');
    const first = beginBatch({ expectedCount: 1, profile: 'customer' });
    const second = beginBatch({ expectedCount: 1, profile: 'customer' });
    assert.strictEqual(_test.acquireActiveLock(first.batch_token), true);
    await assert.rejects(() => processBatchNext(second.batch_token, deps), /anderer lokaler DataSecure-Stapel/i);
    _test.releaseActiveLock(first.batch_token);

    fs.writeFileSync(_test.activeLockPath(), JSON.stringify({
      schema: 'datasecure-active-batch/1', token: first.batch_token, pid: 99999999, created_at: new Date().toISOString()
    }));
    assert.strictEqual(_test.acquireActiveLock(second.batch_token), true);
    _test.releaseActiveLock(second.batch_token);
  });

  await testAsync('a malformed active lock remains fail-closed instead of being recovered as dead', async () => {
    resetInput(); add('lock-check.txt', 'Kunde: Max Mustermann');
    const batch = beginBatch({ expectedCount: 1, profile: 'customer' });
    const lock = _test.activeLockPath();
    fs.writeFileSync(lock, JSON.stringify({
      schema: 'datasecure-active-batch/1', token: batch.batch_token, created_at: new Date().toISOString()
    }));
    assert.strictEqual(_test.validActiveLock(JSON.parse(fs.readFileSync(lock, 'utf8'))), false);
    assert.throws(() => _test.acquireActiveLock(batch.batch_token), /anderer lokaler DataSecure-Stapel/i);
    assert.strictEqual(fs.existsSync(lock), true, 'a malformed lock must not be deleted during recovery');
    fs.unlinkSync(lock);
  });

  await testAsync('only an explicit resume retries an interrupted item and preserves completed work', async () => {
    resetInput();
    add('first.txt', 'Kunde: Max Mustermann');
    add('second.txt', 'Kunde: Erika Musterfrau');
    const begun = beginBatch({ expectedCount: 2, profile: 'customer' });
    const interrupted = await processBatchNext(begun.batch_token, {
      convertDocument: async () => {
        const error = new Error('interrupted');
        error.code = 'REQUEST_CANCELLED';
        throw error;
      }
    });
    assert.strictEqual(_test.readState(begun.batch_token).items[0].checkpoint, 'retryable');
    assert.strictEqual(interrupted.retryable, 1);
    assert.strictEqual(interrupted.completed, 0);
    assert.strictEqual(interrupted.completion_percent, 0);
    assert.strictEqual(interrupted.remaining, 1);
    assert.strictEqual(interrupted.batch_phase, 'ready_for_next_document');
    assert.strictEqual(interrupted.next_position, 2);
    const released = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(released.released, 1);
    assert.strictEqual(released.completed, 1);
    assert.strictEqual(released.completion_percent, 50);
    assert.strictEqual(released.awaiting_resume, true);
    assert.strictEqual(released.batch_phase, 'awaiting_explicit_resume');
    assert.strictEqual(released.next_position, null);
    const resumed = resumeBatch(begun.batch_token);
    assert.strictEqual(resumed.ok, true);
    assert.strictEqual(resumed.resumed, 1);
    assert.strictEqual(_test.readState(begun.batch_token).items[0].checkpoint, 'resumed');
    const repeatedResume = resumeBatch(begun.batch_token);
    assert.strictEqual(repeatedResume.ok, false, 'a repeated confirmation must not queue the same item twice');
    assert.strictEqual(repeatedResume.error, 'no_retryable_documents');
    assert.strictEqual(_test.readState(begun.batch_token).items[0].status, 'pending');
    const completed = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(completed.released, 2);
    assert.strictEqual(completed.complete, true);
    assert.strictEqual(completed.completion_percent, 100);
    assert.strictEqual(completed.batch_phase, 'complete');
  });

  await testAsync('a new chat can explicitly continue the latest incomplete batch without a remembered token', async () => {
    resetInput();
    add('continue-later.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const interrupted = await processBatchNext(begun.batch_token, {
      convertDocument: async () => {
        const error = new Error('interrupted');
        error.code = 'REQUEST_CANCELLED';
        throw error;
      }
    });
    assert.strictEqual(interrupted.awaiting_resume, true);
    assert.ok(recoverableBatchStatus().recoverable_batches >= 1);
    const continued = continueMostRecentBatch();
    assert.strictEqual(continued.ok, true);
    assert.strictEqual(continued.batch_token, begun.batch_token);
    assert.strictEqual(continued.retryable, 0);
    assert.strictEqual(continued.remaining, 1);
    assert.doesNotMatch(JSON.stringify(continued), /continue-later|Mustermann|\.txt/i);
    assert.strictEqual((await processAndAcknowledge(continued.batch_token, deps)).complete, true);
  });

  await testAsync('the central batch requests a local decision for an ambiguous credential issuer and releases only the reviewed text', async () => {
    resetInput();
    add('profile.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer');
    const begun = beginBatch({ expectedCount: 1, profile: 'personnel_profile' });
    let draftSeen;
    const result = await processBatchNext(begun.batch_token, {
      ...deps,
      platform: 'linux',
      reviewTextLocally: (draft, options) => {
        draftSeen = { draft, options };
        return {
          action: 'reviewed', redactions: [],
          decisions: draft.ambiguities.map((item) => ({ ambiguity_id: item.ambiguity_id, decision: 'keep' }))
        };
      }
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(draftSeen.options.platform, 'linux');
    assert.ok(draftSeen.draft.ambiguities.length > 0);
    assert.doesNotMatch(JSON.stringify(_test.readState(begun.batch_token)), /Microsoft|Azure|Cloud Engineer/u);
    const released = fs.readFileSync(path.join(roots().output, result.package_id, `${result.package_id}.md`), 'utf8');
    assert.match(released, /Microsoft Azure Administrator Associate/u);
    assert.strictEqual(acknowledgeDeliveredPackage(begun.batch_token, result.package_id).complete, true);
  });

  await testAsync('cancelling the central credential decision is terminal and does not make the raw draft durable', async () => {
    resetInput();
    add('cancelled-profile.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer');
    const begun = beginBatch({ expectedCount: 1, profile: 'personnel_profile' });
    const result = await processBatchNext(begun.batch_token, {
      ...deps,
      platform: 'darwin',
      reviewTextLocally: () => ({ action: 'cancelled' })
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'LOCAL_REVIEW_CANCELLED');
    assert.strictEqual(result.stopped, 1);
    const state = _test.readState(begun.batch_token);
    assert.strictEqual(state.items[0].status, 'stopped');
    assert.doesNotMatch(JSON.stringify(state), /Microsoft|Azure|Cloud Engineer/u);
  });

  await testAsync('a deferred credential decision keeps its source local, lets the batch continue, and needs the shared local review', async () => {
    resetInput();
    ordered('deferred-profile.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer', 1);
    ordered('clear.txt', 'Kunde: Max Mustermann\nTicket: weiter', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'personnel_profile' });
    let firstPassReviewCalls = 0;
    const deferred = await processBatchNext(begun.batch_token, { ...deps, platform: 'linux', reviewTextLocally: () => { firstPassReviewCalls++; return { action: 'reviewed' }; } });
    assert.strictEqual(deferred.error, 'LOCAL_REVIEW_DEFERRED');
    assert.strictEqual(firstPassReviewCalls, 0);
    assert.strictEqual(deferred.deferred_review, 1);
    assert.strictEqual(deferred.remaining, 1);
    assert.strictEqual(deferred.next_position, 2);
    assert.doesNotMatch(JSON.stringify(_test.readState(begun.batch_token)), /Microsoft|Azure|Cloud Engineer/u);
    const clear = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(clear.ok, true);
    acknowledgeDeliveredPackage(begun.batch_token, clear.package_id);
    const waiting = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(waiting.awaiting_resume, false);
    assert.strictEqual(waiting.batch_phase, 'awaiting_local_review');
    assert.strictEqual(resumeBatch(begun.batch_token).error, 'batch_review_required');
    const deferredItem = _test.readState(begun.batch_token).items.find((item) => item.status === 'deferred_review');
    assert.doesNotMatch(JSON.stringify(deferredItem), /Microsoft|Azure|Cloud Engineer/u);
    const reviewed = await reviewDeferredBatch(begun.batch_token, { ...deps, platform: 'linux', reviewTextLocally: (draft) => ({ action: 'reviewed', redactions: [], decisions: draft.ambiguities.map((item) => ({ ambiguity_id: item.ambiguity_id, decision: 'keep' })) }) });
    assert.ok(reviewed.ok, JSON.stringify(reviewed));
  });

  await testAsync('one local batch review publishes all decided deferred positions without journaling drafts', async () => {
    resetInput();
    ordered('first-profile.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer', 1);
    ordered('second-profile.txt', 'Microsoft Azure Administrator Associate\nRolle: Scrum Master', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'personnel_profile' });
    const first = await processBatchNext(begun.batch_token, deps);
    const second = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(first.error, 'LOCAL_REVIEW_DEFERRED');
    assert.strictEqual(second.error, 'LOCAL_REVIEW_DEFERRED');
    const waiting = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(waiting.awaiting_resume, false);
    assert.strictEqual(waiting.batch_phase, 'awaiting_local_review');
    let calls = 0;
    const reviewed = await reviewDeferredBatch(begun.batch_token, {
      ...deps,
      platform: 'linux',
      reviewTextLocally: (draft) => {
        calls++;
        assert.strictEqual(draft.batch_review.document_count, 2);
        return { action: 'reviewed', redactions: [], decisions: draft.ambiguities.map((candidate) => ({ ambiguity_id: candidate.ambiguity_id, decision: 'keep' })) };
      }
    });
    assert.strictEqual(calls, 1);
    assert.ok(reviewed.ok, JSON.stringify(reviewed));
    assert.strictEqual(reviewed.packages.length, 2);
    assert.strictEqual(reviewed.delivery_pending, 2);
    assert.doesNotMatch(JSON.stringify(_test.readState(begun.batch_token)), /Microsoft|Azure|Cloud Engineer|Scrum Master/u);
    const released = reviewed.packages.map((entry) => fs.readFileSync(path.join(roots().output, entry.package_id, `${entry.package_id}.md`), 'utf8')).join('\n');
    assert.match(released, /Microsoft Azure Administrator Associate/u);
    assert.match(released, /Microsoft Azure Administrator Associate/u);
    for (const entry of reviewed.packages) acknowledgeDeliveredPackage(begun.batch_token, entry.package_id);
    const complete = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(complete.complete, true);
  });

  await testAsync('MCP batch review finalizes locally and exposes results only through the bounded result plan', async () => {
    resetInput();
    ordered('review-first.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer', 1);
    ordered('review-second.txt', 'Microsoft Azure Administrator Associate\nRolle: Testmanager', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'personnel_profile' });
    await processBatchNext(begun.batch_token, deps);
    await processBatchNext(begun.batch_token, deps);
    const lifecycle = [];
    const reviewed = await reviewDeferredBatch(begun.batch_token, {
      ...deps,
      localFinalize: true,
      platform: 'linux',
      onReviewLifecycle: (event) => lifecycle.push(event),
      reviewTextLocally: (draft) => ({
        action: 'reviewed',
        redactions: [],
        decisions: draft.ambiguities.map((candidate) => ({ ambiguity_id: candidate.ambiguity_id, decision: 'keep' }))
      })
    });
    assert.strictEqual(reviewed.ok, true);
    assert.strictEqual(reviewed.locally_released, 2);
    assert.strictEqual(reviewed.complete, true);
    assert.strictEqual(reviewed.packages, undefined);
    assert.doesNotMatch(JSON.stringify(reviewed), /package_id|read_capability|review-first|review-second/u);
    assert.deepStrictEqual(lifecycle.map((event) => event.event), [
      'review_reconstruction_started', 'review_reconstruction_finished',
      'review_ui_started', 'review_ui_finished'
    ]);
    assert.doesNotMatch(JSON.stringify(lifecycle), /Microsoft|Azure|review-first|review-second|batch_token/u);
    const listed = listBatchResults(begun.batch_token, { limit: 1 });
    assert.strictEqual(listed.results.length, 1);
    assert.strictEqual(listed.available, 2);
  });

  await testAsync('a shared local review explains why it cannot start before analysis completes', async () => {
    resetInput();
    ordered('not-ready-first.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer', 1);
    ordered('not-ready-second.txt', 'Kunde: Max Mustermann\nTicket: weiter', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'personnel_profile' });
    const result = await reviewDeferredBatch(begun.batch_token, deps);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'batch_review_not_ready');
    assert.match(result.message, /analysiert noch weitere Dateien/u);
    assert.doesNotMatch(JSON.stringify(result), /not-ready|Mustermann|Azure|Cloud Engineer/u);
  });

  await testAsync('deferring the shared local batch review publishes nothing and keeps every item deferred', async () => {
    resetInput();
    ordered('defer-first.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer', 1);
    ordered('defer-second.txt', 'Microsoft Azure Administrator Associate\nRolle: Testmanager', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'personnel_profile' });
    await processBatchNext(begun.batch_token, deps);
    await processBatchNext(begun.batch_token, deps);
    const outputsBefore = fs.readdirSync(roots().output).sort();
    const review = await reviewDeferredBatch(begun.batch_token, {
      ...deps,
      platform: 'linux',
      reviewTextLocally: () => ({ action: 'deferred' })
    });
    assert.strictEqual(review.ok, false);
    assert.strictEqual(review.error, 'LOCAL_REVIEW_DEFERRED');
    assert.strictEqual(review.deferred_review, 2);
    assert.strictEqual(review.delivery_pending, 0);
    assert.deepStrictEqual(fs.readdirSync(roots().output).sort(), outputsBefore);
    const state = _test.readState(begun.batch_token);
    assert.ok(state.items.every((item) => item.status === 'deferred_review'));
    assert.doesNotMatch(JSON.stringify(state), /Microsoft|Azure|Cloud Engineer|Testmanager/u);
  });

  await testAsync('cancelling the shared local batch review publishes nothing and keeps every item deferred', async () => {
    resetInput();
    ordered('cancel-first.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer', 1);
    ordered('cancel-second.txt', 'Microsoft Azure Administrator Associate\nRolle: Testmanager', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'personnel_profile' });
    await processBatchNext(begun.batch_token, deps);
    await processBatchNext(begun.batch_token, deps);
    const outputsBefore = fs.readdirSync(roots().output).sort();
    const review = await reviewDeferredBatch(begun.batch_token, {
      ...deps,
      platform: 'linux',
      reviewTextLocally: () => ({ action: 'cancelled' })
    });
    assert.strictEqual(review.ok, false);
    assert.strictEqual(review.error, 'LOCAL_REVIEW_CANCELLED');
    assert.strictEqual(review.deferred_review, 2);
    assert.strictEqual(review.stopped, 0);
    assert.deepStrictEqual(fs.readdirSync(roots().output).sort(), outputsBefore);
    assert.ok(_test.readState(begun.batch_token).items.every((item) => item.status === 'deferred_review'));
  });

  await testAsync('a partial batch-review publication still hands off its earlier atomic package', async () => {
    resetInput();
    ordered('partial-first.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer', 1);
    ordered('partial-second.txt', 'Microsoft Azure Administrator Associate\nRolle: Testmanager', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'personnel_profile' });
    await processBatchNext(begun.batch_token, deps);
    await processBatchNext(begun.batch_token, deps);
    let calls = 0;
    const partial = await reviewDeferredBatch(begun.batch_token, {
      ...deps,
      convertDocument: async (source) => {
        calls++;
        if (calls === 4) {
          const error = new Error('parser unavailable');
          error.code = 'PARSER_START_FAILED';
          throw error;
        }
        return { markdown: fs.readFileSync(source, 'utf8'), attachments: [], warnings: [], unreviewedVisualCount: 0, requiresExplicitProfile: false };
      },
      platform: 'linux',
      reviewTextLocally: (draft) => ({ action: 'reviewed', redactions: [], decisions: draft.ambiguities.map((item) => ({ ambiguity_id: item.ambiguity_id, decision: 'keep' })) })
    });
    assert.strictEqual(partial.ok, true);
    assert.strictEqual(partial.packages.length, 1);
    assert.strictEqual(partial.failed_documents, 1);
    assert.strictEqual(partial.delivery_pending, 1);
    assert.strictEqual(partial.retryable, 1);
    assert.match(partial.packages[0].read_capability, /^[A-Za-z0-9_-]{43}$/);
    const state = _test.readState(begun.batch_token);
    assert.strictEqual(state.items.filter((item) => item.status === 'delivery_pending').length, 1);
    assert.strictEqual(state.items.filter((item) => item.status === 'retryable').length, 1);
    assert.doesNotMatch(JSON.stringify(state), /Microsoft|Azure|Cloud Engineer|Testmanager/u);
  });

  await testAsync('a new-chat continuation preserves deferred review for the shared local review path', async () => {
    resetInput();
    ordered('continue-review.txt', 'Microsoft Azure Administrator Associate\nRolle: Cloud Engineer', 1);
    ordered('continue-clear.txt', 'Kunde: Max Mustermann\nTicket: Weiter', 2);
    const begun = beginBatch({ expectedCount: 2, profile: 'personnel_profile' });
    await processBatchNext(begun.batch_token, deps);
    const clear = await processBatchNext(begun.batch_token, deps);
    acknowledgeDeliveredPackage(begun.batch_token, clear.package_id);
    const continued = continueMostRecentBatch();
    assert.strictEqual(continued.ok, true);
    assert.strictEqual(continued.batch_token, begun.batch_token);
    assert.strictEqual(continued.batch_phase, 'awaiting_local_review');
    assert.strictEqual(continued.deferred_review, 1);
    const item = _test.readState(begun.batch_token).items.find((candidate) => candidate.status === 'deferred_review');
    assert.strictEqual(item.checkpoint, 'awaiting_local_review');
    assert.doesNotMatch(JSON.stringify(item), /Microsoft|Azure|Cloud Engineer/u);
  });

  await testAsync('the server owns progress and never retries a stopped item', async () => {
    resetInput();
    add('blocked.xlsx', 'Name,Mail\nMax Mustermann,max@example.de');
    add('first.txt', 'Kunde: Max Mustermann\nE-Mail: max@example.de\nTicket: Eins');
    add('second.txt', 'Kunde: Erika Musterfrau\nE-Mail: erika@example.de\nTicket: Zwei');
    const begun = beginBatch({ expectedCount: 3, profile: 'customer' });
    const stopped = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(stopped.ok, false);
    assert.strictEqual(stopped.stopped, 1);
    assert.strictEqual(stopped.completion_percent, 33);
    assert.strictEqual(stopped.local_mapping_exported, true);
    assert.strictEqual(stopped.remaining, 2);
    const stoppedItem = _test.readState(begun.batch_token).items.find((item) => item.status === 'stopped');
    assert.ok(Number.isSafeInteger(stoppedItem.processing_duration_ms));
    assert.ok(stoppedItem.processing_duration_ms >= 0);
    assert.strictEqual(fs.existsSync(path.join(_test.workPath(begun.batch_token), stoppedItem.work_name)), false);
    const first = await processAndAcknowledge(begun.batch_token, deps);
    const releasedItem = _test.readState(begun.batch_token).items.find((item) => item.status === 'released');
    assert.ok(Number.isSafeInteger(releasedItem.processing_duration_ms));
    assert.ok(releasedItem.processing_duration_ms >= 0);
    const second = await processAndAcknowledge(begun.batch_token, deps);
    assert.ok(first.ok && second.ok);
    assert.strictEqual(second.complete, true);
    assert.strictEqual(second.released, 2);
    assert.strictEqual(second.stopped, 1);
    assert.match(first.read_capability, /^[A-Za-z0-9_-]{43}$/);
    assert.deepStrictEqual(fs.readdirSync(roots().input).sort(), ['blocked.xlsx', 'first.txt', 'second.txt']);
    const mapping = fs.readFileSync(path.join(roots().exports, 'DataSecure-Mapping.csv'), 'utf8');
    assert.match(mapping, /Originaldatei;Anonymisiertes Ergebnis;Status;Hinweis/);
    assert.match(mapping, /"first\.txt"/);
    assert.match(mapping, /"second\.txt"/);
    assert.match(mapping, /"blocked\.xlsx";"";"sicher gestoppt"/);
    assert.doesNotMatch(JSON.stringify(first), /first\.txt/);
    const state = _test.readState(begun.batch_token);
    assert.strictEqual(fs.existsSync(path.join(_test.workPath(begun.batch_token), state.items.find((item) => item.name === 'first.txt').work_name)), false);
  });

  await testAsync('an in-flight item is never reported as a completed batch', async () => {
    const progress = _test.publicProgress({
      token: 'a'.repeat(64),
      items: [{ status: 'released' }, { status: 'processing' }, { status: 'pending' }]
    });
    assert.strictEqual(progress.processing, 1);
    assert.strictEqual(progress.complete, false);
    assert.strictEqual(progress.completion_percent, 33);
    assert.strictEqual(progress.batch_phase, 'processing_local_document');
    assert.strictEqual(progress.next_position, 2);
    assert.strictEqual(progress.attempted, 2);
  });

  await testAsync('a terminal stop remains recorded locally when no result package exists', async () => {
    resetInput();
    add('unreadable.xlsx', 'Name,Mail\nMax Mustermann,max@example.de');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const result = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.local_mapping_exported, true);
    const mapping = fs.readFileSync(path.join(roots().exports, 'DataSecure-Mapping.csv'), 'utf8');
    assert.match(mapping, /"unreadable\.xlsx";"";"sicher gestoppt"/);
    assert.doesNotMatch(JSON.stringify(result), /unreadable\.xlsx/);
  });

  await testAsync('a stopped source is deleted immediately and a failed deletion is retried locally', async () => {
    resetInput();
    const cleanupBefore = localCleanupStatus().private_work_copy_cleanup_pending;
    add('locked-stop.xlsx', 'Name,Mail\nMax Mustermann,max@example.de');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const stopped = await processBatchNext(begun.batch_token, {
      ...deps,
      unlinkWorkCopy: () => { throw new Error('synthetic locked stopped copy'); }
    });
    assert.strictEqual(stopped.ok, false);
    const pending = _test.readState(begun.batch_token).items[0];
    assert.strictEqual(pending.status, 'stopped');
    assert.strictEqual(pending.work_copy_cleanup_pending, true);
    assert.strictEqual(localCleanupStatus().private_work_copy_cleanup_pending, cleanupBefore + 1);
    const retried = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(retried.complete, true);
    const cleaned = _test.readState(begun.batch_token).items[0];
    assert.strictEqual(cleaned.work_copy_cleanup_pending, undefined);
    assert.strictEqual(localCleanupStatus().private_work_copy_cleanup_pending, cleanupBefore);
    assert.strictEqual(fs.existsSync(path.join(_test.workPath(begun.batch_token), cleaned.work_name)), false);
  });

  await testAsync('startup recovery retries a pending cleanup for a safely stopped source', async () => {
    resetInput();
    add('restart-cleanup.xlsx', 'Name,Mail\nMax Mustermann,max@example.de');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    await processBatchNext(begun.batch_token, {
      ...deps,
      unlinkWorkCopy: () => { throw new Error('synthetic cleanup interruption'); }
    });
    const pending = _test.readState(begun.batch_token).items[0];
    assert.strictEqual(pending.status, 'stopped');
    assert.strictEqual(pending.work_copy_cleanup_pending, true);
    assert.strictEqual(fs.existsSync(path.join(_test.workPath(begun.batch_token), pending.work_name)), true);
    const recovered = recoverBatches();
    assert.strictEqual(recovered.failures, 0);
    const cleaned = _test.readState(begun.batch_token).items[0];
    assert.strictEqual(cleaned.work_copy_cleanup_pending, undefined);
    assert.strictEqual(fs.existsSync(path.join(_test.workPath(begun.batch_token), cleaned.work_name)), false);
  });

  await testAsync('changes to originals after snapshot do not alter the sealed batch', async () => {
    resetInput();
    const original = add('confirmed.txt', 'Kunde: Max Mustermann');
    add('other.txt', 'Kunde: Erika Musterfrau');
    const begun = beginBatch({ expectedCount: 2, profile: 'customer' });
    fs.writeFileSync(original, 'ausgetauschter Inhalt', 'utf8');
    const result = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.released, 1);
    assert.strictEqual((await processAndAcknowledge(begun.batch_token, deps)).complete, true);
    assert.strictEqual(fs.readFileSync(original, 'utf8'), 'ausgetauschter Inhalt');
  });

  await testAsync('a changed sealed source stops its pending batch and removes every remaining private copy', async () => {
    resetInput();
    add('first.txt', 'Kunde: Max Mustermann');
    add('second.txt', 'Kunde: Erika Musterfrau');
    const begun = beginBatch({ expectedCount: 2, profile: 'customer' });
    const before = _test.readState(begun.batch_token);
    fs.writeFileSync(path.join(_test.workPath(begun.batch_token), before.items[0].work_name), 'tampered sealed source', 'utf8');
    const stopped = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(stopped.ok, false);
    assert.strictEqual(stopped.error, 'batch_snapshot_changed');
    const after = _test.readState(begun.batch_token);
    assert.strictEqual(after.invalidated, true);
    for (const item of after.items) {
      assert.strictEqual(item.status, 'stopped');
      assert.strictEqual(item.error_code, 'BATCH_SNAPSHOT_CHANGED');
      assert.strictEqual(fs.existsSync(path.join(_test.workPath(begun.batch_token), item.work_name)), false);
    }
  });

  await testAsync('a same-size sealed-copy content change is caught by the integrated copy-stream digest', async () => {
    resetInput();
    add('first.txt', 'Kunde: Max Mustermann');
    add('second.txt', 'Kunde: Erika Musterfrau');
    const begun = beginBatch({ expectedCount: 2, profile: 'customer' });
    const before = _test.readState(begun.batch_token);
    const sealed = path.join(_test.workPath(begun.batch_token), before.items[0].work_name);
    const original = fs.readFileSync(sealed, 'utf8');
    fs.writeFileSync(sealed, 'X'.repeat(Buffer.byteLength(original, 'utf8')), 'utf8');
    const stopped = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(stopped.ok, false);
    assert.strictEqual(stopped.error, 'BATCH_SNAPSHOT_CHANGED');
    assert.strictEqual(stopped.batch_token, begun.batch_token, 'the private gateway may retain its opaque checkpoint token');
    assert.doesNotMatch(JSON.stringify(stopped), /first\.txt|second\.txt|Mustermann|Musterfrau/iu);
    const after = _test.readState(begun.batch_token);
    assert.strictEqual(after.invalidated, true);
    for (const item of after.items) {
      assert.strictEqual(item.status, 'stopped');
      assert.strictEqual(item.error_code, 'BATCH_SNAPSHOT_CHANGED');
      assert.strictEqual(fs.existsSync(path.join(_test.workPath(begun.batch_token), item.work_name)), false);
    }
  });

  await testAsync('a snapshot integrity failure also cleans paused private copies in the same batch', async () => {
    resetInput();
    add('paused.txt', 'Kunde: Max Mustermann');
    add('tampered.txt', 'Kunde: Erika Musterfrau');
    const begun = beginBatch({ expectedCount: 2, profile: 'customer' });
    const stateFile = path.join(_test.batchRoot(), `${begun.batch_token}.json`);
    const prepared = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    prepared.items[0].status = 'retryable';
    prepared.items[0].checkpoint = 'retryable';
    fs.writeFileSync(stateFile, JSON.stringify(prepared), 'utf8');
    const sealed = path.join(_test.workPath(begun.batch_token), prepared.items[1].work_name);
    const original = fs.readFileSync(sealed, 'utf8');
    fs.writeFileSync(sealed, 'Y'.repeat(Buffer.byteLength(original, 'utf8')), 'utf8');
    const stopped = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(stopped.error, 'BATCH_SNAPSHOT_CHANGED');
    const after = _test.readState(begun.batch_token);
    assert.strictEqual(after.invalidated, true);
    for (const item of after.items) {
      assert.strictEqual(item.status, 'stopped');
      assert.strictEqual(item.error_code, 'BATCH_SNAPSHOT_CHANGED');
      assert.strictEqual(fs.existsSync(path.join(_test.workPath(begun.batch_token), item.work_name)), false);
    }
  });

  await testAsync('a sealed-copy inode substitution before recovery is rejected without touching the saved object', async () => {
    resetInput(); add('sealed-swap.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const before = _test.readState(begun.batch_token);
    const sealed = path.join(_test.workPath(begun.batch_token), before.items[0].work_name);
    const saved = path.join(base, 'sealed-swap.saved');
    fs.renameSync(sealed, saved);
    fs.writeFileSync(sealed, 'substituted private object', 'utf8');
    const stopped = await processBatchNext(begun.batch_token, deps);
    assert.strictEqual(stopped.error, 'batch_snapshot_changed');
    assert.strictEqual(fs.readFileSync(saved, 'utf8'), 'Kunde: Max Mustermann');
    assert.strictEqual(fs.existsSync(sealed), false);
    fs.unlinkSync(saved);
  });

  await testAsync('added originals after snapshot do not alter the sealed batch', async () => {
    resetInput();
    add('confirmed.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    add('added.txt', 'Kunde: Erika Musterfrau');
    const result = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.released, 1);
    assert.strictEqual(result.complete, true);
  });

  await testAsync('startup recovery retains an interrupted item as explicitly retryable', async () => {
    resetInput(); add('resume.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const file = path.join(_test.batchRoot(), `${begun.batch_token}.json`);
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    state.items[0].status = 'processing';
    state.items[0].checkpoint = 'package_verified';
    fs.writeFileSync(file, JSON.stringify(state));
    const recovered = recoverBatches();
    assert.strictEqual(recovered.recovered, 1);
    assert.strictEqual(_test.readState(begun.batch_token).items[0].checkpoint, 'retryable');
    const result = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(result.awaiting_resume, true);
    assert.strictEqual(result.retryable, 1);
    assert.strictEqual(fs.existsSync(path.join(roots().input, 'resume.txt')), true);
    assert.strictEqual(resumeBatch(begun.batch_token).resumed, 1);
    assert.strictEqual((await processAndAcknowledge(begun.batch_token, deps)).complete, true);
  });

  await testAsync('startup recovery never lets a substituted journal remove another batch work copy', async () => {
    resetInput();
    add('first.txt', 'Kunde: Max Mustermann');
    add('second.txt', 'Kunde: Erika Musterfrau');
    const first = beginBatch({ expectedCount: 2, profile: 'customer' });
    // Use a second sealed session so a forged state token could otherwise
    // target a real, different private directory during expiry cleanup.
    resetInput();
    add('third.txt', 'Kunde: Anna Muster');
    const second = beginBatch({ expectedCount: 1, profile: 'customer' });
    const firstStateFile = path.join(_test.batchRoot(), `${first.batch_token}.json`);
    const forged = JSON.parse(fs.readFileSync(firstStateFile, 'utf8'));
    forged.token = second.batch_token;
    forged.expires_at = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(firstStateFile, JSON.stringify(forged));

    const outcome = recoverBatches();
    assert.deepStrictEqual(outcome, { recovered: 0, removed: 0, failures: 1, skipped_active: false });
    assert.strictEqual(fs.existsSync(firstStateFile), true);
    assert.strictEqual(fs.existsSync(_test.workPath(first.batch_token)), true);
    assert.strictEqual(fs.existsSync(_test.workPath(second.batch_token)), true);
    // The forged state is intentionally not recoverable. Remove this test-only
    // malformed fixture so later maintenance tests observe their own state.
    fs.unlinkSync(firstStateFile);
    fs.rmSync(_test.workPath(first.batch_token), { recursive: true, force: false, maxRetries: 0 });
  });

  await testAsync('startup recovery and periodic expiry cleanup yield to a live batch owner', async () => {
    resetInput();
    add('live-owner.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const stateFile = path.join(_test.batchRoot(), `${begun.batch_token}.json`);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    state.items[0].status = 'processing';
    state.expires_at = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(stateFile, JSON.stringify(state));
    const maintenanceToken = 'a'.repeat(64);
    assert.strictEqual(_test.acquireActiveLock(maintenanceToken), true);
    try {
      assert.strictEqual(recoverableBatchStatus().batch_processing_active, true);
      assert.deepStrictEqual(recoverBatches(), { recovered: 0, removed: 0, failures: 0, skipped_active: true });
      assert.deepStrictEqual(cleanupExpiredBatchSnapshots(), { removed: 0, failures: 0, skipped_active: true });
      assert.strictEqual(fs.existsSync(stateFile), true);
      assert.strictEqual(_test.readStateForMaintenance(begun.batch_token).items[0].status, 'processing');
    } finally {
      _test.releaseActiveLock(maintenanceToken);
    }
    assert.strictEqual(recoverableBatchStatus().batch_processing_active, false);
    const cleaned = cleanupExpiredBatchSnapshots();
    assert.deepStrictEqual(cleaned, { removed: 1, failures: 0, skipped_active: false });
    assert.strictEqual(fs.existsSync(stateFile), false);
    assert.strictEqual(fs.existsSync(_test.workPath(begun.batch_token)), false);
  });

  await testAsync('an owner that dies after a skipped recovery is resumed only by explicit continuation', async () => {
    resetInput();
    add('late-crash.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const stateFile = path.join(_test.batchRoot(), `${begun.batch_token}.json`);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    state.items[0].status = 'processing';
    state.items[0].checkpoint = 'processing_started';
    fs.writeFileSync(stateFile, JSON.stringify(state));
    const liveToken = 'b'.repeat(64);
    assert.strictEqual(_test.acquireActiveLock(liveToken), true);
    try {
      assert.strictEqual(recoverBatches().skipped_active, true);
    } finally {
      _test.releaseActiveLock(liveToken);
    }
    const continued = continueMostRecentBatch();
    assert.strictEqual(continued.ok, true);
    assert.strictEqual(continued.batch_token, begun.batch_token);
    assert.strictEqual(continued.remaining, 1);
    assert.strictEqual(_test.readState(begun.batch_token).items[0].checkpoint, 'resumed');
    const released = await processAndAcknowledge(begun.batch_token, deps);
    assert.strictEqual(released.complete, true);
    assert.strictEqual(released.released, 1);
  });

  await testAsync('private processing checkpoints remain local and contain no source identifiers', async () => {
    resetInput(); add('checkpoint-name.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const result = await processBatchNext(begun.batch_token, {
      ...deps,
      beforePublish: async () => {
        const state = _test.readState(begun.batch_token);
        assert.strictEqual(state.items[0].checkpoint, 'package_verified');
      }
    });
    const state = _test.readState(begun.batch_token);
    assert.strictEqual(state.items[0].checkpoint, 'delivery_pending');
    assert.doesNotMatch(JSON.stringify(result), /checkpoint-name|Mustermann/i);
  });

  await testAsync('expired batch snapshots remove only their private working copies', async () => {
    resetInput();
    const cleanupBefore = localCleanupStatus();
    const original = add('retained-original.txt', 'Kunde: Max Mustermann');
    const begun = beginBatch({ expectedCount: 1, profile: 'customer' });
    const stateFile = path.join(_test.batchRoot(), `${begun.batch_token}.json`);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    state.expires_at = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(stateFile, JSON.stringify(state));
    assert.strictEqual(localCleanupStatus().private_work_copy_cleanup_pending, cleanupBefore.private_work_copy_cleanup_pending);
    assert.strictEqual(localCleanupStatus().expired_batch_cleanup_pending, cleanupBefore.expired_batch_cleanup_pending + 1);
    const outcome = recoverBatches();
    assert.strictEqual(outcome.removed, 1);
    assert.strictEqual(fs.existsSync(stateFile), false);
    assert.strictEqual(fs.existsSync(_test.workPath(begun.batch_token)), false);
    assert.strictEqual(fs.readFileSync(original, 'utf8'), 'Kunde: Max Mustermann');
    assert.strictEqual(localCleanupStatus().private_work_copy_cleanup_pending, cleanupBefore.private_work_copy_cleanup_pending);
    assert.strictEqual(localCleanupStatus().expired_batch_cleanup_pending, cleanupBefore.expired_batch_cleanup_pending);
  });

  await testAsync('a real 100-file local executor handles stops at positions 1, 50 and 100 with bounded result pages', async () => {
    resetInput();
    for (let index = 1; index <= 100; index++) {
      const blocked = [1, 50, 100].includes(index);
      ordered(
        `${String(index).padStart(2, '0')}-${blocked ? 'blocked.xlsx' : 'safe.txt'}`,
        blocked ? 'Name,Mail\nMax Mustermann,max@example.de' : `Kunde: Person ${index}\nTicket: Test ${index}`,
        index
      );
    }
    const begun = beginBatch({ expectedCount: 100, profile: 'customer' });
    claimLocalBatchExecutor(begun.batch_token, process.pid);
    const final = await runLocalBatchExecutor(begun.batch_token, deps);
    assert.strictEqual(final.complete, true);
    assert.strictEqual(final.released, 97);
    assert.strictEqual(final.stopped, 3);
    let cursor;
    let listed = 0;
    let pages = 0;
    do {
      const page = listBatchResults(begun.batch_token, { cursor, limit: 10 });
      assert.ok(page.results.length <= 10);
      for (const result of page.results) acknowledgeDeliveredPackage(begun.batch_token, result.package_id);
      listed += page.results.length;
      pages++;
      cursor = page.next_cursor;
    } while (cursor);
    assert.strictEqual(listed, 97);
    assert.strictEqual(pages, 10);
    const exhausted = listBatchResults(begun.batch_token, { limit: 10 });
    assert.strictEqual(exhausted.used, 97);
    assert.strictEqual(exhausted.available, 0);
    assert.strictEqual(exhausted.safely_stopped, 3);
    assert.strictEqual(fs.readdirSync(roots().input).length, 100);
  });

  await testAsync('real worker crashes at positions 1, 50 and 100 recover without duplicate release', async () => {
    resetInput();
    for (let index = 1; index <= 100; index++) {
      const crashPosition = [1, 50, 100].includes(index);
      ordered(
        `crash-${String(index).padStart(3, '0')}.${crashPosition ? 'txt' : 'xlsx'}`,
        `Kunde: Testperson ${index}\nVorgang: synthetisch`,
        index
      );
    }
    const begun = beginBatch({ expectedCount: 100, profile: 'customer' });
    const crashes = [
      { absolutePosition: 1, localAttempt: 1, releasedBefore: 0, stoppedBefore: 0 },
      { absolutePosition: 50, localAttempt: 2, releasedBefore: 1, stoppedBefore: 48 },
      { absolutePosition: 100, localAttempt: 2, releasedBefore: 2, stoppedBefore: 97 }
    ];
    for (const crash of crashes) {
      const exit = await crashDetachedExecutor(begun.batch_token, crash.localAttempt);
      assert.strictEqual(exit.code, 17, `worker must crash at global item ${crash.absolutePosition}`);

      const interrupted = readBatchProgress(begun.batch_token);
      assert.strictEqual(interrupted.local_processing_active, false);
      assert.strictEqual(interrupted.processing, 1);
      assert.strictEqual(interrupted.released, crash.releasedBefore);
      assert.strictEqual(interrupted.stopped, crash.stoppedBefore);

      const recovered = recoverBatches();
      assert.ok(recovered.recovered >= 1);
      const awaitingResume = readBatchProgress(begun.batch_token);
      assert.strictEqual(awaitingResume.processing, 0);
      assert.strictEqual(awaitingResume.retryable, 1);
      assert.strictEqual(awaitingResume.released, crash.releasedBefore);
      assert.strictEqual(awaitingResume.stopped, crash.stoppedBefore);

      const resumed = resumeBatch(begun.batch_token);
      assert.strictEqual(resumed.ok, true);
      assert.strictEqual(resumed.resumed, 1);
    }

    claimLocalBatchExecutor(begun.batch_token, process.pid);
    const completed = await runLocalBatchExecutor(begun.batch_token, deps);
    assert.strictEqual(completed.complete, true);
    assert.strictEqual(completed.released, 3);
    assert.strictEqual(completed.stopped, 97);
    assert.strictEqual(completed.retryable, 0);

    const state = _test.readState(begun.batch_token);
    const packageIds = state.items.filter((item) => item.status === 'released').map((item) => item.package_id);
    assert.strictEqual(new Set(packageIds).size, 3);
    assert.ok(state.items.every((item) => ['released', 'stopped'].includes(item.status)));

    let cursor;
    let listed = 0;
    do {
      const page = listBatchResults(begun.batch_token, { cursor, limit: 20 });
      listed += page.results.length;
      cursor = page.next_cursor;
    } while (cursor);
    assert.strictEqual(listed, 3);
  });

  done();
}

main().catch((error) => { console.error(error); process.exit(1); });
