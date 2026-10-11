'use strict';

const assert = require('node:assert');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { encodeFrame } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== '--source-only')) throw new Error('STANDALONE_SIDECAR_TEST_ARGUMENT_INVALID');
const sourceOnly = args.length === 1;

function protocolClient(child, onNative, onReady) {
  let buffer = Buffer.alloc(0);
  let stderr = '';
  const pending = new Map();
  const failAll = (error) => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
    pending.clear();
  };
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
  child.once('exit', (code) => failAll(new Error(`sidecar exited ${code}: ${stderr}`)));
  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32BE(0);
      if (length < 2 || length > 1024 * 1024) return failAll(new Error('sidecar frame invalid'));
      if (buffer.length < length + 4) return;
      let value;
      try { value = JSON.parse(buffer.subarray(4, length + 4).toString('utf8')); }
      catch (error) { return failAll(error); }
      buffer = buffer.subarray(length + 4);
      if (value.schema === 'datasecure-standalone-ready/1' && onReady) {
        try { onReady(value); } catch (error) { failAll(error); }
        continue;
      }
      if (['datasecure-native-export-request/1', 'datasecure-native-export-request/2'].includes(value.schema) && onNative) {
        try { onNative(value, child); } catch (error) { failAll(error); }
        continue;
      }
      const waiter = pending.get(value.request_id);
      if (!waiter) return failAll(new Error('unexpected sidecar response'));
      pending.delete(value.request_id);
      clearTimeout(waiter.timer);
      waiter.resolve(value);
    }
  });
  return {
    send(action, id, fields = {}, trailingFrame = Buffer.alloc(0)) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`sidecar response timeout: ${stderr}`));
        }, 60000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(Buffer.concat([encodeFrame({
          schema: 'datasecure-standalone-private-ipc/1', request_id: id, action, ...fields
        }), trailingFrame]));
      });
    }
};
}

const sidecarFile = path.join(__dirname, '../plugins/data-secure/server/standalone/desktop-sidecar.js');
const lifecycleFixture = path.join(__dirname, 'lib/standalone-sidecar-lifecycle.cjs');

function isolatedEnvironment(root) {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'COMSPEC', 'PATHEXT']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const directories = {
    HOME: 'home', USERPROFILE: 'home', LOCALAPPDATA: 'localapp', APPDATA: 'roaming',
    TEMP: 'temp', TMP: 'temp', TMPDIR: 'temp', XDG_DATA_HOME: 'data',
    XDG_CONFIG_HOME: 'config', XDG_CACHE_HOME: 'cache',
    DATASECURE_STANDALONE_DOCUMENTS_DIR: 'documents', EU_PRIVACY_RESULT_ROOT: 'output',
    DATASECURE_STANDALONE_DIAGNOSTIC_DIR: 'diagnostics'
  };
  for (const [key, folder] of Object.entries(directories)) {
    env[key] = path.join(root, folder);
    fs.mkdirSync(env[key], { recursive: true });
  }
  if (process.platform === 'win32') {
    env.HOMEDRIVE = path.parse(env.USERPROFILE).root.replace(/[\\/]$/u, '');
    env.HOMEPATH = env.USERPROFILE.slice(env.HOMEDRIVE.length);
  }
  env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
  env.DATASECURE_STANDALONE_DIAGNOSTIC_SESSION = 'a'.repeat(32);
  return env;
}

function trackChild(child, children) {
  child.closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  child.stdin.on('error', () => {}); // Expected when intentionally testing a closed private pipe.
  children.push(child);
  return child;
}

async function bounded(promise, message, timeout = 5000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

async function waitForFile(file, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!fs.existsSync(file)) {
    assert.ok(Date.now() < deadline, `missing test receipt: ${path.basename(file)}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

async function workerEnded(root) {
  const spawnedFile = path.join(root, 'worker-spawned.json');
  if (!fs.existsSync(spawnedFile)) return;
  const spawned = JSON.parse(fs.readFileSync(spawnedFile, 'utf8'));
  const exited = await waitForFile(path.join(root, 'worker-exit.json'), 22000);
  assert.strictEqual(exited.pid, spawned.pid);
  const deadline = Date.now() + 5000;
  while (processAlive(exited.pid)) {
    assert.ok(Date.now() < deadline, 'own fixture worker did not end; preserve its test directory');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return exited;
}

function removeOwnedRoot(root, initial) {
  const stat = fs.lstatSync(root);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  assert.strictEqual(stat.dev, initial.dev);
  assert.strictEqual(stat.ino, initial.ino);
  assert.match(path.basename(root), /^datasecure-standalone-ipc-/u);
  assert.strictEqual(path.dirname(root), fs.realpathSync.native(os.tmpdir()));
  const targets = [];
  const inspect = (candidate) => {
    const relative = path.relative(root, candidate);
    assert.ok(!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
    const entry = fs.lstatSync(candidate);
    assert.ok(!entry.isSymbolicLink(), 'never traverse links or junctions during test cleanup');
    assert.ok(entry.isDirectory() || entry.isFile());
    targets.push(candidate);
    if (entry.isDirectory()) for (const name of fs.readdirSync(candidate)) inspect(path.join(candidate, name));
  };
  inspect(root);
  assert.ok(targets.length > 0 && targets[0] === root);
  fs.rmSync(root, { recursive: true });
}

(async () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-standalone-ipc-'));
  const initial = fs.lstatSync(root);
  const children = [];
  const fixtureRoots = [];
  const environment = isolatedEnvironment(root);
  const diagnostics = environment.DATASECURE_STANDALONE_DIAGNOSTIC_DIR;
  const sourceDirectory = path.join(root, 'sources');
  const sourceFile = path.join(sourceDirectory, 'profil.txt');
  fs.mkdirSync(sourceDirectory);
  fs.writeFileSync(sourceFile, 'Erika Muster, erika@example.org');
  const child = trackChild(childProcess.spawn(process.execPath, [sidecarFile], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: environment
    }), children);
  let blockedChild;
  try {
    const client = protocolClient(child);
    const unsupportedNative = await client.send('configure_results', '00'.repeat(8), {
      source_paths: [environment.EU_PRIVACY_RESULT_ROOT], native_export_binding: true
    });
    assert.equal(unsupportedNative.ok, false);
    assert.equal(unsupportedNative.error_code, 'STANDALONE_IPC_FAILED', 'requested native capability never silently falls back');
    // Real process/pipe/configuration integration. This emulates the desktop
    // response only, not the native filesystem identity implementation (Rust
    // tests exercise that separately with actual directory handles).
    const nativeRoot = path.join(root, 'native-binding'); fs.mkdirSync(nativeRoot);
    const nativeEnv = isolatedEnvironment(nativeRoot);
    delete nativeEnv.EU_PRIVACY_RESULT_ROOT;
    nativeEnv.DATASECURE_NATIVE_EXPORT_CHANNEL = '1';
    nativeEnv.DATASECURE_DOCUMENT_CONTROL_OWNER_PID = String(process.pid);
    nativeEnv.DATASECURE_DOCUMENT_CONTROL_GENERATION = 'c'.repeat(32);
    const nativeHost = trackChild(childProcess.spawn(process.execPath, [sidecarFile], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: nativeEnv
    }), children);
    let callbacks = 0, readyCount = 0, deny = false;
    const nativeIdentity = { volume: '18446744073709551615', object: '340282366920938463463374607431768211455', created_ns: '9007199254740993' };
    const nativeBinding = { schema: 'datasecure-native-export-binding/1', root: path.join(nativeRoot, 'output'),
      root_identity: nativeIdentity, data_root_identity: nativeIdentity, private_name: `native-export-${'a'.repeat(32)}`,
      private_identity: nativeIdentity, anonymize_identity: nativeIdentity, markdown_identity: nativeIdentity };
    const nativeClient = protocolClient(nativeHost, (request, host) => {
      callbacks++; assert.equal(request.action, 'configure_export_root');
      assert.equal(request.schema, 'datasecure-native-export-request/2');
      assert.equal(request.sequence, 1);
      assert.equal(request.root, path.join(nativeRoot, 'output'));
      const payload = Buffer.from(JSON.stringify({ schema: 'datasecure-native-export-response/2',
        request_id: request.request_id, native_id: request.native_id, sequence: request.sequence,
        ok: !deny, ...(deny ? { error_code: 'AI_EXPORT_CONFLICT' } : { binding: nativeBinding }) }));
      const header = Buffer.alloc(4); header.writeUInt32BE(payload.length);
      host.stdin.write(Buffer.concat([header, payload]));
    }, ready => {
      assert.deepStrictEqual(ready, { schema: 'datasecure-standalone-ready/1', owner_generation: 'c'.repeat(32), ok: true });
      assert.equal(++readyCount, 1, 'bootstrap handshake precedes any ordinary private response');
    });
    const configured = await nativeClient.send('configure_results', '01'.repeat(8), {
      source_paths: [path.join(nativeRoot, 'output')], native_export_binding: true
    });
    assert.equal(configured.ok, true); assert.equal(callbacks, 1);
    assert.equal(readyCount, 1);
    // os.homedir() belongs to this parent process, not to the isolated child.
    // In particular macOS uses HOME directly rather than LOCALAPPDATA/XDG.
    const nativeData = require('../plugins/data-secure/server/standalone/application-service').standaloneDataRoot({ environment: nativeEnv, home: nativeEnv.HOME });
    const configFile = path.join(nativeData, 'settings', 'result-root.json');
    const persisted = fs.readFileSync(configFile, 'utf8');
    assert.deepEqual(JSON.parse(persisted).native_export, nativeBinding);
    assert.equal(JSON.parse(persisted).schema, 'datasecure-result-root/4');
    deny = true;
    const refused = await nativeClient.send('configure_results', '02'.repeat(8), {
      source_paths: [path.join(nativeRoot, 'output')], native_export_binding: true
    });
    assert.equal(refused.error_code, 'AI_EXPORT_CONFLICT');
    assert.equal(fs.readFileSync(configFile, 'utf8'), persisted, 'native refusal cannot mutate existing settings');
    const legacyConfiguration = await nativeClient.send('configure_results', '03'.repeat(8), { source_paths: [path.join(nativeRoot, 'output')] });
    assert.equal(legacyConfiguration.ok, true, JSON.stringify(legacyConfiguration));
    assert.equal(callbacks, 2, 'legacy request cannot silently acquire a native binding');
    assert.equal(JSON.parse(fs.readFileSync(configFile, 'utf8')).schema, 'datasecure-result-root/2');
    nativeHost.stdin.end(); assert.equal((await bounded(nativeHost.closed, 'native callback host did not close')).code, 0);
    const status = await client.send('get_public_state', 'a'.repeat(16));
    assert.strictEqual(status.schema, 'datasecure-standalone-private-response/1');
    assert.strictEqual(status.ok, true);
    assert.strictEqual(status.result.product_channel, 'standalone');
    assert.strictEqual(status.result.external_disclosure, false);
    // A diagnostic failure must never break the actual framed application.
    const diagnosticSentinel = path.join(root, 'diagnostic-sentinel');
    fs.writeFileSync(diagnosticSentinel, 'foreign diagnostic target');
    const unsafeDiagnosticFile = path.join(diagnostics, 'sidecar-interactions.jsonl');
    fs.renameSync(unsafeDiagnosticFile, `${unsafeDiagnosticFile}.owned`);
    fs.linkSync(diagnosticSentinel, unsafeDiagnosticFile);
    const diagnosticFailureState = await client.send('get_public_state', 'aa'.repeat(8));
    assert.strictEqual(diagnosticFailureState.ok, true);
    assert.strictEqual(fs.readFileSync(diagnosticSentinel, 'utf8'), 'foreign diagnostic target');
    fs.unlinkSync(unsafeDiagnosticFile);
    fs.renameSync(`${unsafeDiagnosticFile}.owned`, unsafeDiagnosticFile);
    assert.doesNotMatch(JSON.stringify(status), /source_path|raw_content|mapping/u);
    const emptyHistory = await client.send('get_run_history', 'ab'.repeat(8));
    assert.strictEqual(emptyHistory.ok, true);
    assert.strictEqual(emptyHistory.result.local_ui_only, true);
    assert.deepStrictEqual(emptyHistory.result.entries, []);
    // Real private persistence -> application service -> framed error, not a
    // mocked error response. The fixture belongs only to this isolated host.
    const dataRoot = require('../plugins/data-secure/server/standalone/application-service').standaloneDataRoot({ environment, home: environment.HOME });
    const reviewStore = require('../plugins/data-secure/server/gateway/standalone-document-review-store').createDocumentReviewStore({ dataRoot });
    const reviewBatch = 'e'.repeat(64), reviewItem = { id: 'f'.repeat(32), name: 'Pruefstand.txt', sha256: 'a'.repeat(64) };
    reviewStore.capture({ token: reviewBatch, product_channel: 'standalone' }, reviewItem,
      { package_id: `ds_${reviewItem.id}`, original_text: 'synthetic', markdown: 'synthetic' });
    const reviewPackageId = `ds_${reviewItem.id}`;
    const reviewPackageDirectory = path.join(dataRoot, 'workspace', 'Output', reviewPackageId);
    fs.mkdirSync(reviewPackageDirectory, { recursive: true });
    fs.writeFileSync(path.join(reviewPackageDirectory, `${reviewPackageId}.md`), 'synthetic');
    fs.writeFileSync(path.join(reviewPackageDirectory, 'manifest.json'), JSON.stringify({
      schema: 'eu-privacy-package/3', package_id: reviewPackageId, document: `${reviewPackageId}.md`,
      verification: { text_residual_pii: 'passed' },
      document_sha256: crypto.createHash('sha256').update('synthetic').digest('hex')
    }));
    const entityUnavailable = await client.send('get_document_entities', 'ad'.repeat(8),
      { batch_id: reviewBatch, document_id: reviewItem.id, revision: 0, page: 0 });
    assert.strictEqual(entityUnavailable.ok, false);
    assert.strictEqual(entityUnavailable.error_code, 'DOCUMENT_ENTITY_UNAVAILABLE');
    const legacyReviewSummary = await client.send('get_document_review_history_summary', 'af'.repeat(8), { batch_id: reviewBatch });
    assert.strictEqual(legacyReviewSummary.ok, true);
    assert.deepStrictEqual(legacyReviewSummary.result, { ok: true, available: false, local_ui_only: true, external_disclosure: false },
      'the real framed summary endpoint never infers v2 approvals from a legacy snapshot');
    const identityReference = await client.send('resolve_document_identity_overview', 'b0'.repeat(8), { batch_id: reviewBatch });
    assert.strictEqual(identityReference.ok, true);
    assert.strictEqual(identityReference.result.target_kind, 'file');
    assert.strictEqual(identityReference.result.external_disclosure, false);
    assert.match(identityReference.result.local_path, /DataSecure-Identitaeten-[a-f0-9]{64}\.txt$/u);
    assert.match(fs.readFileSync(identityReference.result.local_path, 'utf8'), /NICHT.*KI|nicht.*KI/u);
    const unavailableHistoricalReference = await client.send('resolve_document_identity_overview', 'b1'.repeat(8),
      { batch_id: reviewBatch, operation_id: 'c'.repeat(32) });
    assert.strictEqual(unavailableHistoricalReference.ok, false);
    assert.doesNotMatch(JSON.stringify(unavailableHistoricalReference), /Pruefstand|synthetic|local_path/u);
    fs.appendFileSync(identityReference.result.local_path, 'changed');
    const alteredReference = await client.send('resolve_document_identity_overview', 'b2'.repeat(8), { batch_id: reviewBatch });
    assert.strictEqual(alteredReference.ok, false);
    assert.strictEqual(alteredReference.error_code, 'DOCUMENT_REVIEW_CONFLICT');
    assert.doesNotMatch(JSON.stringify(alteredReference), /Pruefstand|synthetic|local_path/u);
    const reviewDirectory = path.join(dataRoot, 'document-reviews', reviewBatch);
    fs.renameSync(path.join(reviewDirectory, 'journal-format.json'), path.join(reviewDirectory, 'fixture-format.saved'));
    fs.writeFileSync(path.join(reviewDirectory, 'decision-000001.json'), '{}');
    const policyChanged = await client.send('get_document_entities', 'ae'.repeat(8),
      { batch_id: reviewBatch, document_id: reviewItem.id, revision: 0, page: 0 });
    assert.strictEqual(policyChanged.ok, false);
    assert.strictEqual(policyChanged.error_code, 'DOCUMENT_REVIEW_POLICY_CHANGED');
    assert.doesNotMatch(JSON.stringify([entityUnavailable, policyChanged]), /Pruefstand|synthetic/u);
    const unboundCurrent = await client.send('continue_current_batch', 'ac'.repeat(8));
    assert.strictEqual(unboundCurrent.ok, false);
    assert.strictEqual(unboundCurrent.error_code, 'STANDALONE_NOTHING_TO_CONTINUE');
    for (const action of ['resolve_history_results', 'resolve_history_ledger', 'continue_history_batch', 'get_run_failures']) {
      const unknown = await client.send(action, 'ac'.repeat(8), { batch_id: 'd'.repeat(64) });
      assert.strictEqual(unknown.ok, false, 'a missing history entry must not resolve or resume the latest run');
      assert.strictEqual(unknown.error_code, 'STANDALONE_HISTORY_MISSING');
    }
    const admitted = await client.send('admit_selected_sources', 'b'.repeat(16), {
      source_kind: 'files', source_paths: [sourceFile]
    });
    assert.strictEqual(admitted.ok, true);
    assert.deepStrictEqual(admitted.result.ui_context.selected_files, ['profil.txt']);
    const context = await client.send('get_ui_context', 'c'.repeat(16));
    assert.strictEqual(context.ok, true);
    assert.deepStrictEqual(context.result.selected_files, ['profil.txt']);
    assert.throws(() => encodeFrame({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: '9'.repeat(16), action: 'start_admitted_batch', processing_mode: 'unknown-purpose' }),
      { code: 'PROCESSING_MODE_INVALID' });
    const retained = await client.send('get_ui_context', '8'.repeat(16));
    assert.deepStrictEqual(retained.result.selected_files, ['profil.txt']);
    const unchanged = await client.send('get_public_state', '7'.repeat(16));
    assert.strictEqual(unchanged.result.preparing, false);
    assert.strictEqual(unchanged.result.processing, false);
    // Exercise the real picker validator, service and framed sidecar reply,
    // not a mocked error. An owner record is proven by its non-ZIP content
    // and the larger OPC-looking sibling that Office named it after.
    const ownerFile = path.join(sourceDirectory, '~$port.docx');
    const originalOfficeFile = path.join(sourceDirectory, 'Report.docx');
    fs.writeFileSync(ownerFile, 'synthetic Office owner record');
    const officePrefix = Buffer.alloc(1024);
    Buffer.from([0x50, 0x4b, 0x03, 0x04]).copy(officePrefix);
    fs.writeFileSync(originalOfficeFile, officePrefix);
    for (const [selected, expectedCode] of [
      [[ownerFile], 'SOURCE_ARTIFACT_IGNORED'],
      [[ownerFile, originalOfficeFile], 'SOURCE_SELECTION_REJECTED']
    ]) {
      const rejectedOwner = await client.send('admit_selected_sources', '6'.repeat(16), {
        source_kind: 'files', source_paths: selected
      });
      assert.strictEqual(rejectedOwner.ok, false);
      assert.strictEqual(rejectedOwner.error_code, expectedCode);
      assert.deepStrictEqual(rejectedOwner.error_details, {
        selection_files: [{ name: '~$port.docx', reason_code: 'SOURCE_ARTIFACT_IGNORED' }], selection_count: 1
      }, 'single and mixed owner selections retain their exact local name and artifact reason');
      assert.deepStrictEqual((await client.send('get_ui_context', '5'.repeat(16))).result.selected_files,
        ['profil.txt'], 'a rejected owner selection cannot replace or partially extend the admission');
    }
    const cancelled = await client.send('cancel_admission', 'd'.repeat(16));
    assert.strictEqual(cancelled.ok, true);
    const mixedRoot = path.join(root, 'mixed-folder');
    fs.mkdirSync(path.join(mixedRoot, 'EINGABEN'), { recursive: true });
    fs.writeFileSync(path.join(mixedRoot, 'EINGABEN', 'synthetic.txt'), 'synthetic');
    fs.writeFileSync(path.join(mixedRoot, 'DATEILISTE.json'), '{}');
    const mixed = await client.send('admit_selected_sources', 'f'.repeat(16), {
      source_kind: 'folder', source_paths: [mixedRoot]
    });
    assert.strictEqual(mixed.ok, false);
    assert.strictEqual(mixed.error_code, 'SOURCE_FOLDER_UNSUPPORTED_FILES');
    assert.deepStrictEqual(mixed.error_details, {
      unsupported_files: ['DATEILISTE.json'], unsupported_count: 1
    });
    assert.deepStrictEqual((await client.send('get_ui_context', '4'.repeat(16))).result.selected_files, [],
      'a named folder error still cannot create a partial admission');
    const oversizedRoot = path.join(root, 'nested-only-oversized');
    const oversizedNested = path.join(oversizedRoot, 'documents');
    fs.mkdirSync(oversizedNested, { recursive: true });
    const oversizedFile = path.join(oversizedNested, 'synthetic.txt');
    fs.writeFileSync(oversizedFile, 'x');
    fs.truncateSync(oversizedFile, 8_000_001);
    const rejectedFolder = await client.send('admit_selected_sources', '1'.repeat(16), {
      source_kind: 'folder', source_paths: [oversizedRoot]
    });
    assert.strictEqual(rejectedFolder.ok, false);
    assert.strictEqual(rejectedFolder.error_code, 'SOURCE_FORMAT_SIZE_LIMIT',
      'the real sidecar must retain the safe size-limit reason instead of returning a generic failure');
    assert.deepStrictEqual(rejectedFolder.error_details, {
      selection_files: [{ name: 'documents/synthetic.txt', reason_code: 'SOURCE_FORMAT_SIZE_LIMIT' }], selection_count: 1
    }, 'real framed IPC retains the complete local relative label and extension');
    const emptyFile = path.join(oversizedNested, 'empty.md');
    fs.writeFileSync(emptyFile, '');
    const rejectedFiles = await client.send('admit_selected_sources', '2'.repeat(16), {
      source_kind: 'files', source_paths: [oversizedFile, emptyFile]
    });
    assert.strictEqual(rejectedFiles.ok, false);
    assert.strictEqual(rejectedFiles.error_code, 'SOURCE_SELECTION_REJECTED');
    assert.deepStrictEqual(rejectedFiles.error_details, {
      selection_files: [{ name: 'synthetic.txt', reason_code: 'SOURCE_FORMAT_SIZE_LIMIT' },
        { name: 'empty.md', reason_code: 'SOURCE_FILE_EMPTY' }], selection_count: 2
    }, 'all rejected direct selections cross the real sidecar boundary with fixed reasons');
    assert.deepStrictEqual((await client.send('get_ui_context', '3'.repeat(16))).result.selected_files, [],
      'a rejected folder must not create a partial admission');
    // The v2 opt-in crosses the real framed endpoint. Legacy callers above
    // remain strict; the catalogue may show regular blocked files, never
    // silently discard them or turn an unsafe selection into a partial one.
    const catalogued = await client.send('admit_selected_sources', '3'.repeat(16), {
      source_kind: 'folder', source_paths: [mixedRoot], source_catalogue: true
    });
    assert.strictEqual(catalogued.ok, true);
    const catalogue = catalogued.result.ui_context.source_catalogue;
    assert.deepStrictEqual(catalogue.filter(item => !item.selectable), [
      { name: 'DATEILISTE.json', selectable: false, reason_code: 'SOURCE_FORMAT_UNSUPPORTED' }
    ]);
    assert.deepStrictEqual(catalogue.filter(item => item.selectable).map(item => item.name), ['EINGABEN/synthetic.txt']);
    assert.match(catalogue.find(item => item.selectable).source_id, /^[a-f0-9]{32}$/u);
    const beforeUnsafe = catalogued.result.ui_context;
    const unsafeCatalogue = await client.send('admit_selected_sources', '3'.repeat(16), {
      source_kind: 'files', source_paths: [ownerFile, emptyFile], source_catalogue: true
    });
    assert.strictEqual(unsafeCatalogue.ok, false);
    assert.strictEqual(unsafeCatalogue.error_code, 'SOURCE_SELECTION_REJECTED');
    const afterUnsafe = (await client.send('get_ui_context', '3'.repeat(16))).result;
    assert.deepStrictEqual(afterUnsafe.source_catalogue, beforeUnsafe.source_catalogue);
    assert.strictEqual(afterUnsafe.catalogue_revision, beforeUnsafe.catalogue_revision,
      'unsafe opt-in input must not partly commit the ordinary empty-file rejection');
    await client.send('cancel_admission', '3'.repeat(16));
    const blockedCatalogue = await client.send('admit_selected_sources', '3'.repeat(16), {
      source_kind: 'files', source_paths: [oversizedFile, emptyFile], source_catalogue: true
    });
    assert.strictEqual(blockedCatalogue.ok, true);
    assert.strictEqual(blockedCatalogue.result.selected_count, 0);
    assert.deepStrictEqual(blockedCatalogue.result.ui_context.source_catalogue.map(item => ({
      name: item.name, selectable: item.selectable, reason_code: item.reason_code
    })).sort((a, b) => a.name.localeCompare(b.name)), [
      { name: 'empty.md', selectable: false, reason_code: 'SOURCE_FILE_EMPTY' },
      { name: 'synthetic.txt', selectable: false, reason_code: 'SOURCE_FORMAT_SIZE_LIMIT' }
    ]);
    await client.send('cancel_admission', '3'.repeat(16));
    const largeCatalogueRoot = path.join(root, 'large-catalogue'); fs.mkdirSync(largeCatalogueRoot);
    for (let index = 0; index < 201; index++) fs.writeFileSync(path.join(largeCatalogueRoot, `${index}.txt`), 'synthetic');
    const largeCatalogue = await client.send('admit_selected_sources', '3'.repeat(16), {
      source_kind: 'folder', source_paths: [largeCatalogueRoot], source_catalogue: true
    });
    assert.strictEqual(largeCatalogue.ok, true); assert.strictEqual(largeCatalogue.result.ui_context.source_catalogue.length, 201);
    const overLimitStart = await client.send('start_admitted_batch', '3'.repeat(16), { processing_mode: 'markdown-only' });
    assert.strictEqual(overLimitStart.ok, false); assert.strictEqual(overLimitStart.error_code, 'STANDALONE_SELECTION_INVALID');
    assert.deepStrictEqual((await client.send('get_ui_context', '3'.repeat(16))).result.source_catalogue,
      largeCatalogue.result.ui_context.source_catalogue, 'real sidecar preserves oversized discovery after a rejected start');
    assert.throws(() => encodeFrame({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: '3'.repeat(16), action: 'admit_selected_sources', source_kind: 'files',
      source_paths: [emptyFile], source_catalogue: 'true' }), { code: 'DESKTOP_IPC_SOURCE_KIND_INVALID' });
    assert.throws(() => encodeFrame({ schema: 'datasecure-standalone-private-ipc/1',
      request_id: '3'.repeat(16), action: 'get_public_state', source_catalogue: true }),
    { code: 'DESKTOP_IPC_FIELD_INVALID' });
    const stopped = await client.send('shutdown', 'e'.repeat(16));
    assert.strictEqual(stopped.ok, true);
    assert.strictEqual((await bounded(child.closed, 'sidecar did not stop')).code, 0);
    assert.doesNotMatch(fs.readFileSync(path.join(diagnostics, 'sidecar-interactions.jsonl'), 'utf8'),
      /DATEILISTE|synthetic\.txt|empty\.md|documents|port\.docx|Report\.docx/u, 'private diagnostics retain codes but never source names');

    const blockedBase = path.join(root, 'blocked-root');
    fs.mkdirSync(blockedBase);
    const blockedEnvironment = isolatedEnvironment(blockedBase);
    const blockedDataRoot = process.platform === 'win32' ? blockedEnvironment.LOCALAPPDATA
      : process.platform === 'darwin' ? path.join(blockedEnvironment.HOME, 'Library/Application Support')
        : blockedEnvironment.XDG_DATA_HOME;
    fs.mkdirSync(blockedDataRoot, { recursive: true });
    fs.writeFileSync(path.join(blockedDataRoot, 'SecureDataMsg-Standalone'), 'not a directory');
    blockedChild = trackChild(childProcess.spawn(process.execPath, [sidecarFile], {
        stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
        env: { ...blockedEnvironment,
          DATASECURE_STANDALONE_DIAGNOSTIC_SESSION: 'invalid session',
          DATASECURE_STANDALONE_DIAGNOSTIC_DIR: diagnostics }
      }), children);
    const blockedClient = protocolClient(blockedChild);
    const blocked = await blockedClient.send('get_public_state', 'f'.repeat(16));
    assert.strictEqual(blocked.ok, false);
    assert.strictEqual(blocked.error_code, 'STANDALONE_DATA_ROOT_UNSAFE');
    const blockedStopped = await blockedClient.send('shutdown', '0'.repeat(16));
    assert.strictEqual(blockedStopped.ok, true);
    assert.strictEqual((await bounded(blockedChild.closed, 'blocked sidecar did not stop')).code, 0);
    const interactionLog = fs.readFileSync(path.join(diagnostics, 'sidecar-interactions.jsonl'), 'utf8');
    const events = interactionLog.trim().split(/\r?\n/u).map((line) => JSON.parse(line));
    assert.ok(events.some((event) => event.event === 'service_initialized'));
    assert.ok(events.some((event) => event.event === 'request_received' && event.action === 'get_public_state'));
    assert.ok(events.some((event) => event.session_id === 'a'.repeat(32)));
    assert.ok(!events.some((event) => event.session_id === 'invalid session'));
    assert.doesNotMatch(interactionLog, /source_paths|source_path|selected_files|raw_content|mapping|request_id/iu);
    process.stdout.write('✓ standalone sidecar exchanges bounded content-free frames\n');

    // Exercise the actual v2 start contract through the sidecar AND worker.
    // Store-only tests cannot detect the worker's former anonymize-only guard.
    if (!sourceOnly) {
    const { writeStandaloneRuntime } = await import('../scripts/lib/standalone-runtime-projection.mjs');
    const { writeConversionRuntime } = await import('../scripts/lib/standalone-conversion-runtime.mjs');
    const target = `${process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'}-${process.arch === 'arm64' ? 'arm64' : 'x64'}${process.platform === 'linux' ? '-glibc' : ''}`;
    const repo = path.resolve(__dirname, '..'), packagedServer = path.join(root, 'packaged-server');
    writeStandaloneRuntime(path.join(repo, 'plugins/data-secure/server'), packagedServer, target);
    writeConversionRuntime(repo, path.join(packagedServer, 'standalone/conversion-runtime'), target);
    for (const scenario of [
      { name: 'document-markdown', mode: 'markdown-only' },
      { name: 'document-markdown-ocr', mode: 'markdown-only', ocr: true },
      { name: 'document-anonymize', mode: 'markdown-and-anonymize' }
    ]) {
      const caseRoot = path.join(root, scenario.name); fs.mkdirSync(caseRoot);
      fixtureRoots.push(caseRoot);
      const env = isolatedEnvironment(caseRoot);
      const file = path.join(caseRoot, 'synthetic.txt'), original = 'E-Mail: erika@example.org\nTechnologie: Java\n';
      fs.writeFileSync(file, original);
      const observer = path.join(__dirname, 'lib/standalone-sidecar-document-start.cjs');
      const host = trackChild(childProcess.spawn(process.execPath, [`--require=${observer}`, path.join(packagedServer, 'standalone/desktop-sidecar.js')], {
        stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: { ...env, DATASECURE_TEST_DOCUMENT_START_ROOT: caseRoot }
      }), children);
      const hostClient = protocolClient(host);
      const selected = await hostClient.send('admit_selected_sources', '1'.repeat(16), {
        source_kind: 'files', source_paths: [file], source_catalogue: true
      });
      assert.equal(selected.ok, true);
      const started = await hostClient.send('start_admitted_batch', '2'.repeat(16), {
        processing_mode: scenario.mode, document_review: true,
        ...(scenario.ocr ? { ocr_contact_review: true } : {}),
        ...(scenario.mode !== 'markdown-only' ? { output_naming_mode: 'neutral' } : {}),
        source_ids: selected.result.ui_context.source_catalogue.map(item => item.source_id),
        catalogue_revision: selected.result.ui_context.catalogue_revision
      });
      assert.equal(started.ok, true, `${scenario.name}: ${JSON.stringify(started)}`);
      const batchId = started.result.batch_id;
      assert.match(batchId, /^[a-f0-9]{64}$/u);
      await waitForFile(path.join(caseRoot, 'worker-complete.json'), 25000);
      await workerEnded(caseRoot);
      const deadline = Date.now() + 25000;
      let entry;
      do {
        const history = await hostClient.send('get_run_history', '3'.repeat(16));
        assert.equal(history.ok, true);
        entry = history.result.entries.find(row => row.batch_id === batchId);
        if (entry?.failed_count) {
          const failures = await hostClient.send('get_run_failures', '7'.repeat(16), { batch_id: batchId });
          assert.fail(`${scenario.name}: ${JSON.stringify(failures)}`);
        }
        if (entry?.result_count === 1 && !['preparing', 'processing'].includes(entry.status)) break;
        assert.ok(Date.now() < deadline, `${scenario.name}: missing completed durable run ${JSON.stringify(entry)}`);
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (true);
      assert.equal(entry.processing_mode, scenario.mode); assert.equal(entry.failed_count, 0);
      const documents = await hostClient.send('get_document_reviews', '4'.repeat(16), { batch_id: batchId });
      assert.equal(documents.ok, true, JSON.stringify(documents));
      assert.equal(documents.result.processing_mode, scenario.mode);
      assert.equal(documents.result.documents.length, 1);
      const item = documents.result.documents[0];
      const chunk = await hostClient.send('get_document_review_chunk', '5'.repeat(16), {
        batch_id: batchId, document_id: item.document_id, revision: item.revision, chunk_index: 0
      });
      assert.equal(chunk.ok, true, JSON.stringify(chunk));
      const text = chunk.result.markdown;
      if (scenario.mode === 'markdown-only') assert.ok(text.includes('erika@example.org'), 'Markdown-only must retain original contact text');
      else assert.ok(!text.includes('erika@example.org'), 'Anonymized document must not retain the original contact');
      assert.equal(fs.readFileSync(file, 'utf8'), original);
      assert.equal((await hostClient.send('shutdown', '6'.repeat(16))).ok, true);
      assert.equal((await bounded(host.closed, 'document review sidecar did not stop', 10000)).code, 0);
      process.stdout.write(`✓ real v2 worker creates durable history and review contents: ${scenario.name}\n`);
    }
    } else {
      process.stdout.write('Projected document/converter workflow: NOT_RUN in source-only CI; required by headless/full and native package gates.\n');
    }

    // Exercise the actual private endpoint and actual product batch worker. Its
    // only fixture seam holds execution after a real durable intake/lease until
    // parent IPC disconnects; this makes the former referenced-channel leak
    // deterministic instead of hoping a tiny TXT is still processing at EOF.
    for (const scenario of ['eof', 'pending-request-eof', 'truncated-header', 'truncated-payload', 'invalid-frame', 'shutdown-queue', 'output-error']) {
      const caseRoot = path.join(root, scenario);
      fs.mkdirSync(caseRoot);
      fixtureRoots.push(caseRoot);
      const env = isolatedEnvironment(caseRoot);
      const fixtureSource = path.join(caseRoot, 'synthetic.txt');
      const sourceText = 'Kontakt: erika@example.org\nTechnologie: Java\n';
      fs.writeFileSync(fixtureSource, sourceText);
      const host = trackChild(childProcess.spawn(process.execPath,
        [`--require=${lifecycleFixture}`, sidecarFile], {
          stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
          env: { ...env, DATASECURE_TEST_SIDECAR_LIFECYCLE_ROOT: caseRoot }
        }), children);
      const hostClient = protocolClient(host);
      assert.strictEqual((await hostClient.send('get_public_state', '1'.repeat(16))).ok, true);
      const excludedSource = path.join(caseRoot, 'excluded.txt');
      fs.writeFileSync(excludedSource, 'Must not be processed: excluded@example.invalid');
      const selection = await hostClient.send('admit_selected_sources', '2'.repeat(16), {
        source_kind: 'files', source_paths: [fixtureSource, excludedSource], source_catalogue: true
      });
      assert.strictEqual(selection.ok, true);
      const selectedId = selection.result.ui_context.source_catalogue.find(item => item.name === 'synthetic.txt').source_id;
      assert.strictEqual((await hostClient.send('start_admitted_batch', '3'.repeat(16), {
        processing_mode: 'markdown-and-anonymize', output_naming_mode: 'neutral',
        source_ids: [selectedId], catalogue_revision: selection.result.ui_context.catalogue_revision
      })).ok, true);
      const ready = await waitForFile(path.join(caseRoot, 'worker-ready.json'));
      assert.strictEqual(ready.progress.batch_total, 1);
      assert.notStrictEqual(ready.progress.complete, true, 'worker must still own unfinished durable work');
      let expectedCode = 0;
      const frame = encodeFrame({ schema: 'datasecure-standalone-private-ipc/1',
        request_id: '4'.repeat(16), action: 'get_public_state' });
      if (scenario === 'eof') host.stdin.end();
      else if (scenario === 'pending-request-eof') {
        fs.writeFileSync(path.join(caseRoot, 'defer-status'), '');
        const queued = encodeFrame({ schema: 'datasecure-standalone-private-ipc/1',
          request_id: '5'.repeat(16), action: 'configure_results', source_paths: [path.join(caseRoot, 'must-not-create')] });
        host.stdin.write(Buffer.concat([frame, queued]));
        await waitForFile(path.join(caseRoot, 'status-waiting.json'));
        host.stdin.end();
      }
      else if (scenario.startsWith('truncated-')) {
        host.stdin.end(frame.subarray(0, scenario === 'truncated-header' ? 3 : 12));
        expectedCode = 65;
      } else if (scenario === 'invalid-frame') {
        host.stdin.write(Buffer.from([0xff, 0xff, 0xff, 0xff]));
        expectedCode = 65;
      } else if (scenario === 'shutdown-queue') {
        const queued = encodeFrame({ schema: 'datasecure-standalone-private-ipc/1',
          request_id: '5'.repeat(16), action: 'configure_results', source_paths: [path.join(caseRoot, 'must-not-create')] });
        assert.strictEqual((await hostClient.send('shutdown', '4'.repeat(16), {}, queued)).ok, true);
      } else {
        host.stdout.destroy();
        host.stdin.write(frame);
        expectedCode = 1;
      }
      const ended = await bounded(host.closed, `${scenario}: control host stayed alive after channel termination`);
      assert.strictEqual(ended.code, expectedCode, scenario);
      const completed = await waitForFile(path.join(caseRoot, 'worker-complete.json'));
      assert.strictEqual(completed.pid, ready.pid);
      assert.strictEqual(completed.complete, true,
        `${scenario}: independent worker must finish its journal: ${JSON.stringify(completed)}`);
      assert.strictEqual(completed.released, 1,
        `${scenario}: real parser/package processing was not completed: ${JSON.stringify(completed.items)}`);
      assert.strictEqual((await workerEnded(caseRoot)).code, 0);
      assert.strictEqual(fs.readFileSync(fixtureSource, 'utf8'), sourceText, 'original remains untouched');
      const log = fs.readFileSync(path.join(env.DATASECURE_STANDALONE_DIAGNOSTIC_DIR, 'sidecar-interactions.jsonl'), 'utf8');
      const records = log.trim().split(/\r?\n/u).map((line) => JSON.parse(line));
      const expectedEvent = ['eof', 'pending-request-eof'].includes(scenario) ? 'private_ipc_closed'
        : scenario.startsWith('truncated-') ? 'private_ipc_truncated'
          : scenario === 'invalid-frame' ? 'private_ipc_invalid'
            : scenario === 'shutdown-queue' ? 'sidecar_shutdown' : 'private_ipc_output_failed';
      assert.ok(records.some((event) => event.event === expectedEvent), scenario);
      assert.ok(!records.some((event) => event.action === 'configure_results'), 'queued requests are discarded during shutdown');
      assert.ok(!fs.existsSync(path.join(caseRoot, 'must-not-create')));
      assert.doesNotMatch(log, /synthetic\.txt|erika@example|source_paths|request_id/iu);
      assert.ok(!log.includes(caseRoot) && !log.includes(ready.token));
      process.stdout.write(`✓ standalone real sidecar/worker lifecycle: ${scenario}\n`);
    }
  } finally {
    for (const own of children) {
      if (own.exitCode === null && own.signalCode === null) own.kill();
      await bounded(own.closed, 'own sidecar process did not close; preserve its test directory');
    }
    // Never kill by a recorded PID: wait for the fixture's own bounded lifetime
    // and recorded exit, then validate all exact deletion targets before cleanup.
    for (const caseRoot of fixtureRoots) await workerEnded(caseRoot);
    removeOwnedRoot(root, initial);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
