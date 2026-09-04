'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { PassThrough } = require('node:stream');
const { createSuite } = require('./helpers');
const {
  StandaloneApplicationService, PRODUCT_CHANNEL, standaloneDataRoot, defaultResultRoot
} = require('../plugins/data-secure/server/standalone/application-service');
const { run, parse } = require('../plugins/data-secure/server/standalone/cli');
const { initialUiState, transitionUiState } = require('../plugins/data-secure/server/standalone/ui-state');
const {
  encodeFrame, FrameDecoder, MAX_FRAME_BYTES, MAX_ADMISSION_PATH_BYTES, PRIVATE_ACTIONS
} = require('../plugins/data-secure/server/standalone/desktop-ipc');
const { projectUiEvent } = require('../plugins/data-secure/server/standalone/ui-projection');

const { test, testAsync, done, assert } = createSuite('Standalone product');

function fakeDependencies(overrides = {}) {
  const traces = [];
  return {
    traces,
    genericStatus: () => ({ engine_ready: true, local_intake_pending: false, batch_processing_active: false }),
    readConfiguredResultRoot: () => 'C:\\Results',
    saveConfiguredResultRoot: () => {},
    resultOutputDirectory: () => 'C:\\Results\\DataSecure-Output',
    openFolder: () => ({ ok: true }),
    mappingPath: () => 'C:\\Private\\DataSecure-Mapping.csv',
    pickSourcesAsync: async () => [{ sourcePath: 'C:\\Source\\a.txt', sourceType: 'txt', sourceBytes: 4 }],
    validateSelectedPathAsync: async (sourcePath) => ({ sourcePath, sourceType: 'txt', sourceBytes: 4 }),
    pickSourceFolderAsync: async () => 'C:\\Source',
    enumerateSourceFolderAsync: async () => [{ sourcePath: 'C:\\Source\\a.txt', sourceType: 'txt', sourceBytes: 4 }],
    batchQueueFromSelection: (value) => value,
    pickFolderAsync: async () => 'C:\\Results',
    reserveIntake: () => ({ reservation_id: 'r'.repeat(32) }),
    releaseIntake: () => {},
    startLocalIntakeExecutor: () => ({ ipcAcknowledgement: Promise.resolve() }),
    recordSupportTrace: (event) => traces.push(event),
    newTraceId: () => 'a'.repeat(16),
    fs: { mkdirSync() {} },
    ...overrides
  };
}

test('Standalone has an isolated product namespace and a simple default output', () => {
  const root = standaloneDataRoot({ platform: 'linux', environment: { XDG_DATA_HOME: '/data' }, home: '/home/u' });
  assert.strictEqual(root, path.join('/data', 'SecureDataMsg-Standalone'));
  assert.strictEqual(path.relative(path.join('/data', 'SecureDataMsg'), root).startsWith('..'), true);
  assert.strictEqual(defaultResultRoot({ home: '/home/u' }), path.join('/home/u', 'Documents', 'SecureDataMsg'));
  assert.strictEqual(defaultResultRoot({ home: '/ignored', environment: {
    DATASECURE_STANDALONE_DOCUMENTS_DIR: '/mounted/Documents'
  } }), path.join('/mounted/Documents', 'SecureDataMsg'));
});

test('CLI accepts only automatic file or folder processing', () => {
  assert.deepStrictEqual(parse(['anonymisieren', '--ordner']), {
    command: 'anonymisieren', sourceKind: 'folder', profile: 'auto'
  });
  assert.throws(() => parse(['anonymisieren', '--profil', 'vertrag']), /Unbekannte Option/u);
  assert.throws(() => parse(['anonymisieren', '--pfad', 'C:\\private.docx']), /Unbekannte Option/u);
});

test('Standalone projects engine state into a small product-neutral status', () => {
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    genericStatus: () => ({ engine_ready: true, local_intake_pending: false,
      batch_processing_active: false, visual_review_items: 2, anonymized_packages: 3 })
  }) });
  assert.deepStrictEqual(service.status(), {
    ok: true,
    product_channel: 'standalone',
    state: 'review_required',
    processing: false,
    review_required: true,
    resumable: false,
    results_available: true,
    result_count: 3,
    review_count: 2,
    resumable_count: 0,
    recoverable_count: 0,
    awaiting_resume_count: 0,
    external_disclosure: false
  });
});

test('Standalone exposes a recoverable batch as a resumable stopped state', () => {
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    genericStatus: () => ({ engine_ready: true, local_intake_pending: false,
      batch_processing_active: false, visual_review_items: 0, anonymized_packages: 1,
      recoverable_batches: 2, batches_awaiting_resume: 1 })
  }) });
  assert.deepStrictEqual(service.status(), {
    ok: true,
    product_channel: 'standalone',
    state: 'stopped',
    processing: false,
    review_required: false,
    resumable: true,
    results_available: true,
    result_count: 1,
    review_count: 0,
    resumable_count: 2,
    recoverable_count: 2,
    awaiting_resume_count: 1,
    external_disclosure: false
  });
});

test('Standalone exposes an awaiting-resume batch even before recovery counting converges', () => {
  const deps = fakeDependencies({ genericStatus: () => ({
    engine_ready: true, anonymized_packages: 0, visual_review_items: 0,
    recoverable_batches: 0, batches_awaiting_resume: 1,
    local_intake_pending: false, batch_processing_active: false
  }) });
  const service = new StandaloneApplicationService({ dependencies: deps });
  const state = service.status();
  assert.strictEqual(state.state, 'stopped');
  assert.strictEqual(state.resumable, true);
  assert.strictEqual(state.resumable_count, 1);
  assert.strictEqual(state.awaiting_resume_count, 1);
});

test('Standalone initializes the shared recovery transaction before serving UI state', () => {
  let initialized = 0;
  const deps = fakeDependencies({ initializeProduct: () => { initialized++; return { ready: true }; } });
  const service = new StandaloneApplicationService({ dependencies: deps });
  assert.strictEqual(initialized, 1);
  assert.deepStrictEqual(service.startup, { ready: true });
});

test('Standalone source manifest is a separate offline product contract', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname,
    '../plugins/data-secure/server/standalone/product-manifest.json'), 'utf8'));
  assert.strictEqual(manifest.schema, 'datasecure-standalone-product/1');
  assert.strictEqual(manifest.product_channel, PRODUCT_CHANNEL);
  assert.strictEqual(manifest.release_status, 'engineering_only');
  assert.strictEqual(manifest.version, require('../package.json').version);
  for (const field of ['requires_claude', 'requires_cowork', 'requires_mcp', 'requires_agent', 'requires_network', 'end_user_runtime_install']) {
    assert.strictEqual(manifest[field], false, `${field} must remain false`);
  }
  assert.deepStrictEqual(manifest.current_formats, ['txt', 'md', 'csv', 'docx']);
  assert.deepStrictEqual(manifest.desktop_targets, [
    'windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64-glibc'
  ]);
  assert.strictEqual(manifest.desktop_shell_candidate, 'tauri-2');
  assert.strictEqual(manifest.desktop_shell_status, 'windows_engineering_build_verified');
  assert.strictEqual(manifest.rust_build_verified, true);
  assert.strictEqual(manifest.windows_engineering_build_verified, true);
  assert.strictEqual(manifest.engineering_package_built, true);
  assert.strictEqual(manifest.engineering_package_verified, true);
  assert.strictEqual(manifest.engineering_package_target, 'windows-x64');
  assert.strictEqual(manifest.isolated_sidecar_smoke_verified, true);
  assert.strictEqual(manifest.uat_status, 'pending');
  assert.strictEqual(manifest.end_user_package_verified, false);
  assert.strictEqual(manifest.native_macos_verified, false);
  assert.strictEqual(manifest.desktop_transport, 'inherited_framed_stdio');
  assert.strictEqual(manifest.desktop_network_listener, false);
});

test('Standalone UI contract keeps raw sources outside the renderer on every target', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(__dirname,
    '../plugins/data-secure/server/standalone/ui-contract.json'), 'utf8'));
  assert.strictEqual(contract.shell_candidate, 'tauri-2');
  assert.strictEqual(contract.network_listener, false);
  assert.strictEqual(contract.renderer_file_system_access, false);
  assert.strictEqual(contract.renderer_receives_source_paths, false);
  assert.strictEqual(contract.renderer_receives_raw_content, false);
  assert.ok(contract.forbidden_payload_fields.includes('path'));
  assert.ok(contract.forbidden_payload_fields.includes('raw_content'));
  assert.deepStrictEqual(contract.commands, [
    'select_files', 'select_folder', 'cancel_admission', 'start_admitted_batch',
    'get_public_state', 'continue_current_batch', 'configure_results',
    'open_current_results', 'open_local_ledger', 'shutdown'
  ]);
  assert.deepStrictEqual([...PRIVATE_ACTIONS], [
    'admit_selected_sources', 'cancel_admission', 'start_admitted_batch',
    'get_public_state', 'continue_current_batch', 'configure_results',
    'open_current_results', 'open_local_ledger', 'shutdown'
  ]);
});

test('Standalone UI follows one portable select-to-result state machine', () => {
  let state = initialUiState();
  state = transitionUiState(state, { type: 'selection_summarized', selected_count: 3 });
  assert.strictEqual(state.view, 'confirm');
  state = transitionUiState(state, { type: 'batch_started', selected_count: 3 });
  assert.strictEqual(state.view, 'processing');
  assert.strictEqual(state.can_pause, false);
  state = transitionUiState(state, { type: 'progress_changed', selected_count: 3,
    completed_count: 2, review_count: 0, failed_count: 0 });
  state = transitionUiState(state, { type: 'review_required', selected_count: 3,
    completed_count: 2, review_count: 1, failed_count: 0 });
  assert.strictEqual(state.view, 'review');
  state = transitionUiState(state, { type: 'batch_completed', selected_count: 3,
    completed_count: 3, failed_count: 0, results_available: true });
  assert.strictEqual(state.view, 'result');
  assert.strictEqual(state.results_available, true);
  assert.throws(() => transitionUiState(state, { type: 'batch_started', selected_count: 3 }),
    (error) => error.code === 'UI_TRANSITION_INVALID');
});

test('Standalone UI rejects missing, regressive and contradictory progress', () => {
  let state = transitionUiState(initialUiState(), { type: 'selection_summarized', selected_count: 3 });
  state = transitionUiState(state, { type: 'batch_started', selected_count: 3 });
  state = transitionUiState(state, { type: 'progress_changed', selected_count: 3,
    completed_count: 2, review_count: 0, failed_count: 0 });
  assert.throws(() => transitionUiState(state, { type: 'progress_changed', selected_count: 3,
    completed_count: 1, review_count: 0, failed_count: 0 }),
  (error) => error.code === 'UI_TRANSITION_INVALID');
  assert.throws(() => transitionUiState(state, { type: 'batch_completed', selected_count: 3,
    completed_count: 2, failed_count: 0, results_available: true }),
  (error) => error.code === 'UI_TRANSITION_INVALID');
  assert.throws(() => transitionUiState(state, { type: 'batch_stopped', selected_count: 3,
    completed_count: 2, review_count: 2, failed_count: 0, can_resume: true }),
  (error) => error.code === 'UI_TRANSITION_INVALID');
});

test('private desktop IPC is framed, bounded and independent of line endings', () => {
  const message = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(16),
    action: 'admit_selected_sources', source_kind: 'files',
    source_paths: ['/Users/demo/a.docx', '/Users/demo/b.csv'] };
  const frame = encodeFrame(message);
  const decoder = new FrameDecoder();
  assert.deepStrictEqual(decoder.push(frame.subarray(0, 3)), []);
  assert.deepStrictEqual(decoder.push(frame.subarray(3)), [message]);
  const oversizedHeader = Buffer.alloc(4);
  oversizedHeader.writeUInt32BE(MAX_FRAME_BYTES + 1, 0);
  assert.throws(() => new FrameDecoder().push(oversizedHeader),
    (error) => error.code === 'DESKTOP_IPC_FRAME_INVALID');
  const twoFrames = Buffer.concat([frame, frame]);
  assert.deepStrictEqual(new FrameDecoder().push(twoFrames), [message, message]);
  assert.throws(() => encodeFrame({ ...message, raw_content: 'private' }),
    (error) => error.code === 'DESKTOP_IPC_FIELD_INVALID');
  assert.throws(() => encodeFrame({ ...message, action: 'submit_review', source_paths: undefined }),
    (error) => error.code === 'DESKTOP_IPC_ACTION_INVALID');
  const configure = { schema: message.schema, request_id: 'b'.repeat(16),
    action: 'configure_results', source_paths: ['/Users/demo/Results'] };
  assert.ok(encodeFrame(configure).length > 4);
  assert.throws(() => encodeFrame({ ...configure, source_paths: ['/a', '/b'] }),
    (error) => error.code === 'DESKTOP_IPC_SOURCE_COUNT_INVALID');
  const tooManyPathBytes = { ...message, source_paths: Array.from({ length: 100 }, () => 'x'.repeat(8000)) };
  assert.throws(() => encodeFrame(tooManyPathBytes),
    (error) => error.code === 'DESKTOP_IPC_SOURCE_BYTES_INVALID');
});

test('renderer projection cannot expose paths, raw text, mapping or diagnostics', () => {
  const event = projectUiEvent('batch_completed', {
    selected_count: 2, completed_count: 2, failed_count: 0, results_available: true,
    source_path: '/Users/demo/private.docx', raw_content: 'Erika Muster', mapping: 'secret',
    error: new Error('private')
  });
  assert.deepStrictEqual(event, {
    schema: 'datasecure-standalone-ui-event/1', type: 'batch_completed',
    selected_count: 2, completed_count: 2, failed_count: 0, results_available: true
  });
  assert.doesNotMatch(JSON.stringify(event), /private|Erika|source_path|mapping/u);
  assert.throws(() => projectUiEvent('batch_completed', { completed_count: 'private' }),
    (error) => error.code === 'UI_VALUE_INVALID');
  assert.throws(() => projectUiEvent('batch_completed', {}),
    (error) => error.code === 'UI_VALUE_INVALID');
  assert.throws(() => projectUiEvent('progress_changed', {
    selected_count: 2, completed_count: 2, review_count: 1, failed_count: 0
  }), (error) => error.code === 'UI_VALUE_INVALID');
});

test('Standalone runtime source contains no MCP or JSON-RPC transport', () => {
  const directory = path.join(__dirname, '../plugins/data-secure/server/standalone');
  const runtime = ['application-service.js', 'cli.js'].map((name) => fs.readFileSync(path.join(directory, name), 'utf8')).join('\n');
  assert.doesNotMatch(runtime, /tools\/call|protocolVersion|jsonrpc|rpc-client|mcp-server/iu);
  assert.doesNotMatch(runtime, /legacy-input-migration/u);
});

async function directServiceCase() {
  const deps = fakeDependencies();
  const service = new StandaloneApplicationService({ dependencies: deps });
  const result = await service.anonymize({ sourceKind: 'files' });
  assert.deepStrictEqual(result, {
    ok: true, product_channel: PRODUCT_CHANNEL, operation_accepted: true,
    selected_count: 1, state: 'processing_local', external_disclosure: false
  });
  assert.ok(deps.traces.some((event) => event.event === 'standalone_batch_accepted'));
  assert.ok(deps.traces.every((event) => !Object.hasOwn(event, 'path') && !Object.hasOwn(event, 'name')));
}

async function admittedServiceCase() {
  let startedQueue;
  const deps = fakeDependencies({
    startLocalIntakeExecutor: (queue) => {
      startedQueue = queue;
      return { ipcAcknowledgement: Promise.resolve() };
    }
  });
  const service = new StandaloneApplicationService({ dependencies: deps });
  const admitted = await service.admitSelectedSources(['C:\\Source\\a.txt', 'C:\\Source\\b.txt']);
  assert.deepStrictEqual(admitted, {
    ok: true, event: 'selection_summarized', selected_count: 2, total_bytes: 8,
    direct_count: 2, convertible_count: 0, blocked_count: 0, encrypted_count: 0,
    external_disclosure: false
  });
  assert.deepStrictEqual(await service.startAdmittedBatch(), {
    ok: true, event: 'batch_started', selected_count: 2, external_disclosure: false
  });
  assert.strictEqual(startedQueue.length, 2);
  await assert.rejects(service.startAdmittedBatch(), (error) => error.code === 'STANDALONE_NO_ADMISSION');
}

async function busyCase() {
  const deps = fakeDependencies({
    genericStatus: () => ({ engine_ready: true, local_intake_pending: false, batch_processing_active: true })
  });
  const service = new StandaloneApplicationService({ dependencies: deps });
  await assert.rejects(service.anonymize(), (error) => error.code === 'STANDALONE_BUSY');
}

async function cliCase() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = ''; let err = '';
  stdout.on('data', (chunk) => { out += chunk; });
  stderr.on('data', (chunk) => { err += chunk; });
  const service = {
    anonymize: async () => ({ ok: true }), configureResults: async () => ({ ok: true }), openResults: async () => ({ ok: true })
  };
  assert.strictEqual(await run(['anonymisieren'], { output: stdout, errorOutput: stderr, service }), 0);
  assert.match(out, /vollständig lokal/u);
  assert.strictEqual(err, '');
  assert.strictEqual(await run(['unbekannt'], { output: stdout, errorOutput: stderr, service }), 64);
  assert.doesNotMatch(`${out}${err}`, /[A-Za-z]:\\|\.docx|private/u);
}

async function cliStatusCase() {
  const stdout = new PassThrough();
  let out = '';
  stdout.on('data', (chunk) => { out += chunk; });
  const service = { status: () => ({ ok: true, state: 'results_available', result_count: 4 }) };
  assert.strictEqual(await run(['status'], { output: stdout, errorOutput: new PassThrough(), service }), 0);
  assert.strictEqual(out, '4 anonymisierte Ergebnisse sind verfügbar.\n');
}

async function openResultsFailureCase() {
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    openFolder: () => ({ ok: false })
  }) });
  await assert.rejects(service.openResults(), (error) => error.code === 'STANDALONE_RESULT_OPEN_FAILED');
}

async function openLedgerCase() {
  const opened = [];
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    mappingPath: () => 'C:\\Private\\DataSecure-Export\\DataSecure-Mapping.csv',
    fs: { mkdirSync() {}, existsSync: () => true },
    openFolder: (target) => { opened.push(target); return { ok: true }; }
  }) });
  assert.deepStrictEqual(await service.openLedger(), {
    ok: true, opened: true, external_disclosure: false
  });
  assert.deepStrictEqual(opened, ['C:\\Private\\DataSecure-Export']);
}

async function missingLedgerCase() {
  let opened = false;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    fs: { mkdirSync() {}, existsSync: () => false },
    openFolder: () => { opened = true; return { ok: true }; }
  }) });
  await assert.rejects(service.openLedger(), (error) => error.code === 'STANDALONE_LEDGER_MISSING');
  assert.strictEqual(opened, false);
}

(async () => {
  await testAsync('Standalone calls the engine directly without MCP or JSON-RPC', directServiceCase);
  await testAsync('native desktop admission validates once and starts without a second picker', admittedServiceCase);
  await testAsync('a running batch stops a second start with a fixed domain code', busyCase);
  await testAsync('CLI exposes only fixed, content-free completion and error text', cliCase);
  await testAsync('CLI status uses a fixed local product message', cliStatusCase);
  await testAsync('Standalone does not report a failed result-folder open as success', openResultsFailureCase);
  await testAsync('Standalone opens only the private ledger folder and never returns its path', openLedgerCase);
  await testAsync('Standalone refuses a missing local ledger without opening a folder', missingLedgerCase);
  done();
})();
