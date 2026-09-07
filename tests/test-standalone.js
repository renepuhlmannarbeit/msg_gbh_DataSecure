'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { PassThrough } = require('node:stream');
const { createSuite } = require('./helpers');
const {
  StandaloneApplicationService, PRODUCT_CHANNEL, standaloneDataRoot, defaultResultRoot,
  activateStandaloneNamespace
} = require('../plugins/data-secure/server/standalone/application-service');
const { run, parse } = require('../plugins/data-secure/server/standalone/cli');
const {
  encodeFrame, FrameDecoder, MAX_FRAME_BYTES, MAX_ADMISSION_PATH_BYTES, PRIVATE_ACTIONS
} = require('../plugins/data-secure/server/standalone/desktop-ipc');
const {
  batchQueueFromSelection, validateSelectedPathAsync
} = require('../plugins/data-secure/server/companion/file-picker');
const { enumerateSourceFolderAsync } = require('../plugins/data-secure/server/companion/source-folder');

const { test, testAsync, done, assert } = createSuite('Standalone product');

function fakeDependencies(overrides = {}) {
  const traces = [];
  return {
    traces,
    lightweightStatus: () => ({ engine_ready: true, local_intake_pending: false, batch_processing_active: false }),
    latestProductResultDirectory: () => 'C:\\Results\\DataSecure-Output\\Lauf-20260904-120000-abcdef12',
    readConfiguredResultRoot: () => 'C:\\Results',
    saveConfiguredResultRoot: () => {},
    resultOutputDirectory: () => 'C:\\Results\\DataSecure-Output',
    openFolder: () => ({ ok: true }),
    revealFile: () => ({ ok: true }),
    mappingPath: () => 'C:\\Private\\DataSecure-Mapping.csv',
    pickSourcesAsync: async () => [{ sourcePath: 'C:\\Source\\a.txt', sourceType: 'txt', sourceBytes: 4 }],
    validateSelectedPathAsync: async (sourcePath) => ({ sourcePath, sourceType: 'txt', sourceBytes: 4 }),
    pickSourceFolderAsync: async () => 'C:\\Source',
    enumerateSourceFolderAsync: async () => [{ sourcePath: 'C:\\Source\\a.txt', sourceType: 'txt', sourceBytes: 4 }],
    batchQueueFromSelection,
    pickFolderAsync: async () => 'C:\\Results',
    reserveIntake: () => ({ reservation_id: 'r'.repeat(32) }),
    releaseIntake: () => {},
    startLocalIntakeExecutor: () => ({ ok: true, local_intake_pending: true,
      ipcAcknowledgement: Promise.resolve() }),
    acknowledgeStandaloneTerminalNotice: () => false,
    pendingStandaloneTerminalNoticeGeneration: () => null,
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

test('Standalone accepts Windows LOCALAPPDATA virtualization when directory identity is unchanged', () => {
  const root = 'C:\\Users\\test\\AppData\\Local\\SecureDataMsg-Standalone';
  const virtualRoot = 'C:\\Users\\test\\AppData\\Local\\Packages\\DataSecure\\LocalCache\\Local\\SecureDataMsg-Standalone';
  const directory = { dev: 7, ino: 42, isDirectory: () => true, isSymbolicLink: () => false };
  const environment = {};
  const realpathSync = Object.assign((candidate) => candidate === root ? virtualRoot : candidate,
    { native: (candidate) => candidate === root ? virtualRoot : candidate });
  const io = {
    mkdirSync() {},
    lstatSync: () => directory,
    statSync: () => directory,
    realpathSync
  };
  assert.strictEqual(activateStandaloneNamespace({ platform: 'win32', dataRoot: root, fs: io, environment }), root);
  assert.strictEqual(environment.EU_PRIVACY_DATA_ROOT, root);
  assert.strictEqual(environment.EU_PRIVACY_ROOT, path.join(root, 'workspace'));
});

test('Standalone still rejects a redirected POSIX data root', () => {
  const root = '/home/test/.local/share/SecureDataMsg-Standalone';
  const directory = { dev: 7, ino: 42, isDirectory: () => true, isSymbolicLink: () => false };
  const realpathSync = Object.assign(() => '/tmp/redirected', { native: () => '/tmp/redirected' });
  assert.throws(() => activateStandaloneNamespace({
    platform: 'linux', dataRoot: root, environment: {},
    fs: { mkdirSync() {}, lstatSync: () => directory, statSync: () => directory, realpathSync }
  }), (error) => error?.code === 'STANDALONE_DATA_ROOT_UNSAFE');
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
    latestProductBatchStatus: () => ({
      selected_count: 5, completed_count: 3, failed_count: 0, review_count: 2, review_ready: true,
      result_count: 3, export_pending_count: 0, processing: false, resumable: false, complete: false
    })
  }) });
  assert.deepStrictEqual(service.status(), {
    ok: true,
    product_channel: 'standalone',
    state: 'review_required',
    processing_mode: 'markdown-and-anonymize', warning_count: 0,
    preparing: false,
    processing: false,
    review_required: true,
    resumable: false,
    results_available: true,
    result_count: 3,
    selected_count: 5,
    completed_count: 3,
    failed_count: 0,
    export_pending_count: 0,
    review_count: 2,
    resumable_count: 0,
    recoverable_count: 0,
    awaiting_resume_count: 0,
    external_disclosure: false
  });
});

test('Standalone status uses the latest product batch instead of historical global totals', () => {
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    lightweightStatus: () => ({ engine_ready: true, local_intake_pending: false,
      batch_processing_active: false }),
    latestProductBatchStatus: () => ({
      selected_count: 4, completed_count: 3, failed_count: 1, review_count: 1, review_ready: true,
      result_count: 2, processing: false, resumable: false, complete: false
    })
  }) });
  const status = service.status();
  assert.strictEqual(status.state, 'review_required');
  assert.strictEqual(status.result_count, 2);
  assert.strictEqual(status.review_count, 1);
  assert.strictEqual(status.results_available, true);
});

test('Standalone consumes one combined journal snapshot per public status poll', () => {
  let snapshots = 0;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    publicStatusSnapshot: () => {
      snapshots++;
      return {
        current: { engine_ready: true, local_intake_pending: false, batch_processing_active: false,
          recoverable_batches: 0, batches_awaiting_resume: 0 },
        latest: { result_count: 1, review_count: 0, failed_count: 0, export_pending_count: 0,
          processing: false, resumable: false, complete: true }
      };
    },
    lightweightStatus: () => { throw new Error('SECOND_STATUS_SCAN'); },
    latestProductBatchStatus: () => { throw new Error('SECOND_PRODUCT_SCAN'); }
  }) });
  assert.strictEqual(service.status().state, 'results_available');
  assert.strictEqual(snapshots, 1);
});

test('Standalone reports an incomplete visible export instead of a false finished state', () => {
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    lightweightStatus: () => ({ engine_ready: true, local_intake_pending: false,
      batch_processing_active: false }),
    latestProductBatchStatus: () => ({
      selected_count: 2, completed_count: 2, failed_count: 0, review_count: 0,
      result_count: 0, export_pending_count: 2, processing: false, resumable: false, complete: true
    })
  }) });
  const status = service.status();
  assert.strictEqual(status.state, 'export_pending');
  assert.strictEqual(status.results_available, false);
  assert.strictEqual(status.result_count, 0);
  assert.strictEqual(status.export_pending_count, 2);
});

test('Standalone exposes a recoverable batch as a resumable stopped state', () => {
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    lightweightStatus: () => ({ engine_ready: true, local_intake_pending: false,
      batch_processing_active: false, recoverable_batches: 2, batches_awaiting_resume: 1 }),
    latestProductBatchStatus: () => ({ result_count: 1, review_count: 0, export_pending_count: 0,
      processing: false, resumable: true, complete: false })
  }) });
  assert.deepStrictEqual(service.status(), {
    ok: true,
    product_channel: 'standalone',
    state: 'stopped',
    processing_mode: 'markdown-and-anonymize', warning_count: 0,
    preparing: false,
    processing: false,
    review_required: false,
    resumable: true,
    results_available: true,
    result_count: 1,
    selected_count: 0,
    completed_count: 0,
    failed_count: 0,
    export_pending_count: 0,
    review_count: 0,
    resumable_count: 2,
    recoverable_count: 2,
    awaiting_resume_count: 1,
    external_disclosure: false
  });
});

test('Standalone separates pending completion metadata from document counts in mixed and all-stopped runs', () => {
  for (const released of [0, 2]) {
    let pending = true;
    const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
      latestProductBatchStatus: () => ({
        selected_count: released + 1, completed_count: released + 1, failed_count: 1, review_count: 0,
        result_count: pending ? 0 : released, export_pending_count: 0,
        processing: false, resumable: false, complete: true, completion_available: !pending,
        ...(pending ? { completion_pending: true } : {})
      })
    }) });
    const status = service.status();
    assert.strictEqual(status.state, 'export_pending');
    assert.strictEqual(status.completion_pending, true);
    assert.strictEqual(status.completed_count, released + 1);
    assert.strictEqual(status.export_pending_count, 0, 'no fabricated document debt');
    assert.strictEqual(status.ledger_available, false);
    assert.strictEqual(status.results_available, false);
    pending = false;
    const afterRetry = service.status();
    assert.strictEqual(afterRetry.state, released ? 'results_available' : 'completed_without_results');
    assert.strictEqual(afterRetry.ledger_available, released > 0);
    assert.strictEqual(afterRetry.completion_pending, undefined);
  }
});

test('Standalone exposes an awaiting-resume batch even before recovery counting converges', () => {
  const deps = fakeDependencies({ lightweightStatus: () => ({
    engine_ready: true,
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

test('Standalone reports a completed all-stopped batch instead of silently returning to ready', () => {
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    latestProductBatchStatus: () => ({
      selected_count: 2, completed_count: 2, failed_count: 2, review_count: 0,
      result_count: 0, export_pending_count: 0, processing: false, resumable: false, complete: true
    })
  }) });
  const status = service.status();
  assert.strictEqual(status.state, 'completed_without_results');
  assert.strictEqual(status.failed_count, 2);
  assert.strictEqual(status.results_available, false);
});

test('Standalone initializes the shared recovery transaction before serving UI state', () => {
  let initialized = 0;
  const deps = fakeDependencies({ initializeProduct: () => { initialized++; return { ready: true }; } });
  const service = new StandaloneApplicationService({ dependencies: deps });
  assert.strictEqual(initialized, 1);
  assert.deepStrictEqual(service.startup, { ready: true });
});

test('Standalone renderer acknowledgement is content-free, generation-bound and single-purpose', () => {
  let acknowledgements = 0;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    pendingStandaloneTerminalNoticeGeneration: () => 42,
    acknowledgeStandaloneTerminalNotice: (generation) => generation === 42 && ++acknowledgements === 1
  }) });
  assert.strictEqual(service.status().presentation_generation, 42);
  assert.deepStrictEqual(service.acknowledgeTerminalPresented(41), {
    ok: true, acknowledged: false, external_disclosure: false
  });
  assert.deepStrictEqual(service.acknowledgeTerminalPresented(42), {
    ok: true, acknowledged: true, external_disclosure: false
  });
  assert.deepStrictEqual(service.acknowledgeTerminalPresented(42), {
    ok: true, acknowledged: false, external_disclosure: false
  });
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
  assert.deepStrictEqual(manifest.current_formats, manifest.formats_by_processing_mode['markdown-only']);
  assert.deepStrictEqual(manifest.formats_by_processing_mode['markdown-and-anonymize'], manifest.current_formats);
  assert.deepStrictEqual(manifest.current_formats, ['txt', 'md', 'csv', 'docx', 'xlsx', 'pptx', 'pdf', 'scan_pdf', 'png', 'jpeg', 'bmp']);
  assert.strictEqual(manifest.default_processing_mode, null, 'the user explicitly chooses a core function');
  assert.strictEqual(manifest.default_anonymized_output_naming, 'neutral');
  assert.deepStrictEqual(manifest.anonymized_output_naming_modes, ['neutral', 'source-with-suffix']);
  assert.strictEqual(manifest.conversion_output_naming, 'source-basename');
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

test('Standalone UI contract limits source details to the local display', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(__dirname,
    '../plugins/data-secure/server/standalone/ui-contract.json'), 'utf8'));
  assert.strictEqual(contract.shell_candidate, 'tauri-2');
  assert.strictEqual(contract.network_listener, false);
  assert.strictEqual(contract.renderer_file_system_access, false);
  assert.strictEqual(contract.renderer_receives_source_paths, 'local-display-only');
  assert.strictEqual(contract.renderer_receives_raw_content, false);
  assert.strictEqual(contract.renderer_receives_open_target, false);
  assert.strictEqual(contract.desktop_host_target_resolution, 'sidecar-resolve-rust-open');
  assert.strictEqual(contract.state_source, 'polled_public_status_snapshot');
  assert.strictEqual(contract.default_anonymized_output_naming, 'neutral');
  assert.deepStrictEqual(contract.anonymized_output_naming_modes, ['neutral', 'source-with-suffix']);
  assert.strictEqual(contract.output_naming_confirmation, false);
  assert.strictEqual(contract.events, undefined, 'the product has no second, disconnected event-state model');
  assert.ok(contract.forbidden_payload_fields.includes('path'));
  assert.ok(contract.forbidden_payload_fields.includes('raw_content'));
  assert.deepStrictEqual(contract.commands, [
    'select_files', 'select_folder', 'remove_admitted_source', 'cancel_admission', 'start_admitted_batch',
    'get_public_state', 'get_ui_context', 'get_run_history', 'open_history_results', 'open_history_ledger', 'continue_history_batch',
    'ack_terminal_presented', 'continue_current_batch', 'configure_results',
    'open_current_results', 'open_local_ledger', 'open_diagnostic_folder', 'shutdown'
  ]);
  assert.deepStrictEqual([...PRIVATE_ACTIONS], [
    'admit_selected_sources', 'remove_admitted_source', 'cancel_admission', 'start_admitted_batch',
    'get_public_state', 'get_ui_context', 'ack_terminal_presented', 'continue_current_batch', 'configure_results',
    'resolve_current_results', 'resolve_local_ledger', 'get_run_history',
    'resolve_history_results', 'resolve_history_ledger', 'continue_history_batch', 'shutdown'
  ]);
});

test('Standalone exposes history ledgers only when the backend marks the anonymized run ledger available', () => {
  const source = fs.readFileSync(path.join(__dirname,
    '../apps/datasecure-standalone/frontend/app.js'), 'utf8');
  assert.match(source, /command: 'open_history_ledger'[^\n]*available: entry\.ledger_available === true/u);
  assert.doesNotMatch(source, /command: 'open_history_ledger'[^\n]*available:.*failed_count/u);
  assert.match(source, /Für reine Konvertierung wird keine Zuordnungsdatei erstellt/u);
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
  assert.throws(() => encodeFrame({ ...message, source_paths: ['ä'.repeat(20000)] }),
    (error) => error.code === 'DESKTOP_IPC_SOURCE_INVALID');
  const acknowledgement = { schema: message.schema, request_id: 'c'.repeat(16),
    action: 'ack_terminal_presented', presentation_generation: 42 };
  assert.ok(encodeFrame(acknowledgement).length > 4);
  assert.throws(() => encodeFrame({ ...acknowledgement, presentation_generation: 0 }),
    (error) => error.code === 'DESKTOP_IPC_PRESENTATION_GENERATION_INVALID');
  assert.throws(() => encodeFrame({ ...acknowledgement, presentation_generation: Number.MAX_SAFE_INTEGER + 1 }),
    (error) => error.code === 'DESKTOP_IPC_PRESENTATION_GENERATION_INVALID');
  assert.throws(() => encodeFrame({ ...message, presentation_generation: 42 }),
    (error) => error.code === 'DESKTOP_IPC_FIELD_INVALID');
  const removal = { schema: message.schema, request_id: 'd'.repeat(16),
    action: 'remove_admitted_source', selection_index: 1 };
  assert.deepStrictEqual(new FrameDecoder().push(encodeFrame(removal)), [removal]);
  assert.ok(encodeFrame({ ...removal, selection_index: 199 }).length > 4);
  for (const selection_index of [-1, 200, 1.5, '1', null]) {
    assert.throws(() => encodeFrame({ ...removal, selection_index }),
      (error) => error.code === 'DESKTOP_IPC_SELECTION_INDEX_INVALID');
  }
  const tooManySources = { ...message, source_paths: Array.from({ length: 201 }, (_, index) => `/tmp/${index}.txt`) };
  assert.throws(() => encodeFrame(tooManySources),
    (error) => error.code === 'DESKTOP_IPC_SOURCE_COUNT_INVALID');
});

test('Standalone runtime source contains no MCP or JSON-RPC transport', () => {
  const directory = path.join(__dirname, '../plugins/data-secure/server/standalone');
  const runtime = ['application-service.js', 'cli.js'].map((name) => fs.readFileSync(path.join(directory, name), 'utf8')).join('\n');
  assert.doesNotMatch(runtime, /tools\/call|protocolVersion|jsonrpc|rpc-client|mcp-server/iu);
  assert.doesNotMatch(runtime, /legacy-input-migration/u);
});

test('history IPC binds exact opaque run IDs and refuses paths, mode changes and extra arguments', () => {
  const base = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(16) };
  for (const action of ['resolve_history_results', 'resolve_history_ledger', 'continue_history_batch']) {
    const valid = { ...base, action, batch_id: 'b'.repeat(64) };
    assert.deepStrictEqual(new FrameDecoder().push(encodeFrame(valid)), [valid]);
    for (const batch_id of [undefined, null, '', 'b'.repeat(63), 'B'.repeat(64), '../latest', '/tmp/result', 1, []]) {
      assert.throws(() => encodeFrame({ ...valid, batch_id }), { code: 'STANDALONE_HISTORY_INVALID' });
    }
    assert.throws(() => encodeFrame({ ...valid, processing_mode: 'markdown-only' }), { code: 'DESKTOP_IPC_FIELD_INVALID' });
    assert.throws(() => encodeFrame({ ...valid, source_paths: ['/tmp/result'] }), { code: 'DESKTOP_IPC_SOURCE_UNEXPECTED' });
  }
  assert.throws(() => encodeFrame({ ...base, action: 'get_run_history', batch_id: 'b'.repeat(64) }),
    { code: 'DESKTOP_IPC_FIELD_INVALID' });
});

test('desktop start requires exactly one supported purpose; continue and other actions reject purpose fields', () => {
  const base = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(16), action: 'start_admitted_batch' };
  for (const naming of ['neutral', 'source-with-suffix']) {
    const message = { ...base, processing_mode: 'markdown-and-anonymize', output_naming_mode: naming };
    assert.deepStrictEqual(new FrameDecoder().push(encodeFrame(message)), [message]);
  }
  const conversion = { ...base, processing_mode: 'markdown-only' };
  assert.deepStrictEqual(new FrameDecoder().push(encodeFrame(conversion)), [conversion]);
  for (const message of [
    { ...base, processing_mode: 'markdown-and-anonymize' },
    { ...base, processing_mode: 'markdown-and-anonymize', output_naming_mode: 'unknown' },
    { ...base, processing_mode: 'markdown-only', output_naming_mode: 'neutral' }
  ]) assert.throws(() => encodeFrame(message), (error) => error.code === 'RESULT_NAMING_MODE_INVALID');
  for (const mode of [undefined, null, '', 'auto', 'local_only', false, 0, {}, ['markdown-only']]) {
    const message = { ...base, ...(mode === undefined ? {} : { processing_mode: mode }) };
    assert.throws(() => encodeFrame(message), (error) => error.code === 'PROCESSING_MODE_INVALID');
    // Also exercise bytes from an old or invalid client, bypassing our encoder.
    const payload = Buffer.from(JSON.stringify(message));
    const header = Buffer.alloc(4); header.writeUInt32BE(payload.length, 0);
    assert.throws(() => new FrameDecoder().push(Buffer.concat([header, payload])),
      (error) => error.code === 'PROCESSING_MODE_INVALID');
  }
  for (const action of ['continue_current_batch', 'cancel_admission', 'get_public_state', 'shutdown']) {
    assert.throws(() => encodeFrame({ ...base, action, processing_mode: 'markdown-only' }),
      (error) => error.code === 'DESKTOP_IPC_FIELD_INVALID');
    assert.deepStrictEqual(new FrameDecoder().push(encodeFrame({ ...base, action })), [{ ...base, action }]);
  }
  assert.throws(() => encodeFrame({ ...base, processingMode: 'markdown-and-anonymize' }),
    (error) => error.code === 'PROCESSING_MODE_INVALID', 'camelCase is only for the Tauri command, not private IPC');
});

async function processingModeServiceCase() {
  let reservations = 0;
  let mutations = 0;
  let launches = 0;
  let workerOptions;
  let workerProfile;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    readConfiguredResultRoot: () => '',
    fs: { mkdirSync() { mutations += 1; } },
    saveConfiguredResultRoot() { mutations += 1; },
    reserveIntake() { reservations += 1; return { reservation_id: 'r'.repeat(32) }; },
    startLocalIntakeExecutor(_queue, profile, options) {
      launches += 1; workerOptions = options; workerProfile = profile;
      return { ok: true, local_intake_pending: true, ipcAcknowledgement: Promise.resolve() };
    }
  }) });
  await service.admitSelectedSources(['C:\\Source\\a.txt']);
  const queue = service.admittedQueue;
  const selection = service.selectionContext;
  for (const options of [{}, null, [], { processingMode: null },
    { processingMode: 'local_only' }, { processingMode: 'markdown-and-anonymize', productChannel: 'plugin' },
    { processingMode: 'markdown-and-anonymize', outputNamingMode: 'unknown' },
    { processingMode: 'markdown-only', outputNamingMode: 'neutral' }]) {
    const expected = Object.hasOwn(options || {}, 'outputNamingMode') ? 'RESULT_NAMING_MODE_INVALID' : 'PROCESSING_MODE_INVALID';
    await assert.rejects(service.startAdmittedBatch(options), (error) => error.code === expected);
    assert.strictEqual(service.admittedQueue, queue, 'rejected purpose must not consume the admission');
    assert.strictEqual(service.selectionContext, selection);
    assert.strictEqual(reservations, 0);
    assert.strictEqual(mutations, 0, 'rejected conversion must not create or configure the default output');
    assert.strictEqual(launches, 0);
  }
  await service.startAdmittedBatch({ processingMode: 'markdown-and-anonymize', profile: 'general' });
  assert.strictEqual(reservations, 1);
  assert.strictEqual(launches, 1);
  assert.strictEqual(workerOptions.processingMode, 'markdown-and-anonymize');
  assert.strictEqual(workerOptions.outputNamingMode, 'neutral', 'new internal callers default to privacy-preserving names');
  assert.strictEqual(workerProfile, 'general');
  assert.strictEqual(service.admittedQueue, null);
  await service.admitSelectedSources(['C:\\Source\\a.txt']);
  await service.startAdmittedBatch({ processingMode: 'markdown-only' });
  assert.strictEqual(workerOptions.processingMode, 'markdown-only', 'pure conversion is handed off without an anonymization fallback');
  assert.strictEqual(Object.hasOwn(workerOptions, 'outputNamingMode'), false);
  assert.strictEqual(launches, 2);
  await service.admitSelectedSources(['C:\\Source\\a.txt']);
  await service.startAdmittedBatch({ processingMode: 'markdown-and-anonymize', outputNamingMode: 'source-with-suffix' });
  assert.strictEqual(workerOptions.outputNamingMode, 'source-with-suffix', 'the explicit readable-name choice crosses the service boundary');
  assert.strictEqual(launches, 3);
  const direct = new StandaloneApplicationService({ dependencies: fakeDependencies({
    startLocalIntakeExecutor(_queue, _profile, options) {
      assert.strictEqual(options.processingMode, 'markdown-and-anonymize', 'legacy direct calls stay explicitly anonymization-only');
      assert.strictEqual(options.outputNamingMode, 'neutral');
      return { ok: true, local_intake_pending: true, ipcAcknowledgement: Promise.resolve() };
    }
  }) });
  await direct.admitSelectedSources(['C:\\Source\\a.txt']);
  await direct.startAdmittedBatch();
}

async function directServiceCase() {
  const deps = fakeDependencies();
  const service = new StandaloneApplicationService({ dependencies: deps });
  const result = await service.anonymize({ sourceKind: 'files' });
  assert.deepStrictEqual(result, {
    ok: true, product_channel: PRODUCT_CHANNEL, operation_accepted: true,
    selected_count: 1, state: 'preparing_local', external_disclosure: false
  });
  assert.ok(deps.traces.some((event) => event.event === 'standalone_batch_accepted'));
  assert.ok(deps.traces.every((event) => !Object.hasOwn(event, 'path') && !Object.hasOwn(event, 'name')));
}

async function admittedServiceCase() {
  let startedQueue;
  const deps = fakeDependencies({
    startLocalIntakeExecutor: (queue) => {
      startedQueue = queue;
      return { ok: true, local_intake_pending: true, ipcAcknowledgement: Promise.resolve() };
    }
  });
  const service = new StandaloneApplicationService({ dependencies: deps });
  const admitted = await service.admitSelectedSources(['C:\\Source\\a.txt', 'C:\\Source\\b.txt']);
  assert.deepStrictEqual(admitted, {
    ok: true, event: 'selection_summarized', selected_count: 2, total_bytes: 8,
    direct_count: 2, convertible_count: 0, blocked_count: 0, encrypted_count: 0,
    ui_context: {
      ok: true,
      result_folder: 'C:\\Results',
      latest_result_folder: 'C:\\Results\\DataSecure-Output\\Lauf-20260904-120000-abcdef12',
      result_folder_is_default: false,
      source_kind: 'files',
      source_folders: ['C:\\Source'],
      selected_files: ['a.txt', 'b.txt'],
      local_ui_only: true,
      external_disclosure: false
    },
    external_disclosure: false
  });
  assert.deepStrictEqual(service.uiContext(), {
    ok: true,
    result_folder: 'C:\\Results',
    latest_result_folder: 'C:\\Results\\DataSecure-Output\\Lauf-20260904-120000-abcdef12',
    result_folder_is_default: false,
    source_kind: 'files',
    source_folders: ['C:\\Source'],
    selected_files: ['a.txt', 'b.txt'],
    local_ui_only: true,
    external_disclosure: false
  });
  assert.deepStrictEqual(service.removeAdmittedSource(0), {
    ok: true, event: 'selection_updated', selected_count: 1, total_bytes: 4,
    ui_context: {
      ok: true,
      result_folder: 'C:\\Results',
      latest_result_folder: 'C:\\Results\\DataSecure-Output\\Lauf-20260904-120000-abcdef12',
      result_folder_is_default: false,
      source_kind: 'files',
      source_folders: ['C:\\Source'],
      selected_files: ['b.txt'],
      local_ui_only: true,
      external_disclosure: false
    },
    external_disclosure: false
  });
  assert.throws(() => service.removeAdmittedSource(1), (error) => error.code === 'STANDALONE_SELECTION_INVALID');
  assert.deepStrictEqual(await service.startAdmittedBatch(), {
    ok: true, event: 'batch_accepted', selected_count: 1, external_disclosure: false
  });
  assert.strictEqual(startedQueue.length, 1);
  assert.deepStrictEqual(service.uiContext().selected_files, ['b.txt'],
    'the local window keeps the last selection visible while the batch runs');
  await assert.rejects(service.startAdmittedBatch(), (error) => error.code === 'STANDALONE_NO_ADMISSION');
}

async function clearLastAdmittedSourceCase() {
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies() });
  await service.admitSelectedSources(['C:\\Source\\a.txt']);
  const cleared = service.removeAdmittedSource(0);
  assert.strictEqual(cleared.selected_count, 0);
  assert.deepStrictEqual(cleared.ui_context.selected_files, []);
  assert.deepStrictEqual(cleared.ui_context.source_folders, []);
  await assert.rejects(service.startAdmittedBatch(), (error) => error.code === 'STANDALONE_NO_ADMISSION');
}

async function realAdmissionAdapterCase() {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'datasecure-real-admission-'));
  const nested = path.join(root, 'nested');
  fs.mkdirSync(nested);
  const first = path.join(root, 'first.txt');
  const second = path.join(nested, 'second.txt');
  fs.writeFileSync(first, 'first local test');
  fs.writeFileSync(second, 'second local test');
  try {
    const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
      validateSelectedPathAsync,
      enumerateSourceFolderAsync,
      batchQueueFromSelection
    }) });
    const admittedFiles = await service.admitSelectedSources([first, second], 'files');
    assert.deepStrictEqual(admittedFiles.ui_context.source_folders.sort(), [root, nested].sort());
    assert.deepStrictEqual(admittedFiles.ui_context.selected_files.sort(), ['first.txt', 'second.txt']);
    service.cancelAdmission();
    const admittedFolder = await service.admitSelectedSources([root], 'folder');
    assert.deepStrictEqual(admittedFolder.ui_context.source_folders, [root]);
    assert.deepStrictEqual(admittedFolder.ui_context.selected_files.sort(), ['first.txt', 'nested/second.txt']);
    assert.ok(service.admittedQueue.every((item) => path.isAbsolute(item.full) &&
      path.basename(item.full) === item.name && Number.isSafeInteger(item.sourceBytes)));
  } finally {
    fs.rmSync(root, { recursive: true });
  }
}

async function oversizedAdmissionCase() {
  const threeHundredMib = 300 * 1024 * 1024;
  let started = false;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    validateSelectedPathAsync: async (sourcePath) => ({
      sourcePath, sourceType: 'txt', sourceBytes: threeHundredMib
    }),
    startLocalIntakeExecutor: () => {
      started = true;
      return { ok: true, local_intake_pending: true, ipcAcknowledgement: Promise.resolve() };
    }
  }) });
  await assert.rejects(
    service.admitSelectedSources(['C:\\Source\\a.txt', 'C:\\Source\\b.txt']),
    (error) => error.code === 'STANDALONE_SELECTION_INVALID'
  );
  await assert.rejects(service.startAdmittedBatch(), (error) => error.code === 'STANDALONE_NO_ADMISSION');
  assert.strictEqual(started, false, 'an oversized aggregate selection never reaches the worker');
}

async function uncertainAdmissionStartCase() {
  let starts = 0;
  let releases = 0;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    releaseIntake: () => { releases += 1; },
    startLocalIntakeExecutor: () => {
      starts += 1;
      return { ok: true, local_intake_pending: true,
        ipcAcknowledgement: Promise.reject(new Error('ACK_LOST')) };
    }
  }) });
  await service.admitSelectedSources(['C:\\Source\\a.txt']);
  await assert.rejects(service.startAdmittedBatch(), (error) => error.code === 'STANDALONE_START_FAILED');
  await assert.rejects(service.startAdmittedBatch(), (error) => error.code === 'STANDALONE_NO_ADMISSION');
  assert.strictEqual(starts, 1, 'an uncertain delegated start cannot be submitted twice');
  assert.strictEqual(releases, 0, 'the delegated reservation remains owned by the worker');
}

async function invalidAdmissionStartContractCase() {
  const invalidStarts = [
    { local_intake_pending: true, ipcAcknowledgement: Promise.resolve() },
    { ok: true, ipcAcknowledgement: Promise.resolve() },
    { ok: true, local_intake_pending: true }
  ];
  for (const started of invalidStarts) {
    let releases = 0;
    const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
      releaseIntake: () => { releases += 1; },
      startLocalIntakeExecutor: () => started
    }) });
    await service.admitSelectedSources(['C:\\Source\\a.txt']);
    await assert.rejects(service.startAdmittedBatch(), (error) => error.code === 'STANDALONE_START_FAILED');
    await assert.rejects(service.startAdmittedBatch(), (error) => error.code === 'STANDALONE_NO_ADMISSION');
    assert.strictEqual(releases, 0, 'an uncertain delegated start keeps its reservation consumed');
  }
  const direct = new StandaloneApplicationService({ dependencies: fakeDependencies({
    startLocalIntakeExecutor: () => ({ ok: true, local_intake_pending: true })
  }) });
  await assert.rejects(direct.anonymize(), (error) => error.code === 'STANDALONE_START_FAILED');
}

async function resultFolderReplayFailureCase() {
  let saved = '';
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    saveConfiguredResultRoot: (selected) => { saved = selected; },
    replayPendingResultExports: () => { throw new Error('REPLAY_FAILED'); }
  }) });
  const result = await service.configureResults({ path: 'C:\\New Results' });
  assert.strictEqual(saved, 'C:\\New Results');
  assert.deepStrictEqual(result, {
    ok: true, configuration_changed: true, result_folder: 'C:\\New Results',
    export_replay_pending: true, local_ui_only: true, external_disclosure: false
  });
}

async function busyCase() {
  const deps = fakeDependencies({
    lightweightStatus: () => ({ engine_ready: true, local_intake_pending: false, batch_processing_active: true })
  });
  const service = new StandaloneApplicationService({ dependencies: deps });
  await assert.rejects(service.anonymize(), (error) => error.code === 'STANDALONE_BUSY');
}

async function rejectedContinuationCase() {
  for (const review of [false, true]) {
    let reviewStarts = 0;
    let batchStarts = 0;
    const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
      continueMostRecentBatch: () => ({
        ok: true, batch_token: 'c'.repeat(64), awaiting_local_review: review,
        batch_total: 1, completed: 0, deferred_review: review ? 1 : 0, remaining: review ? 0 : 1, retryable: 0,
        delivery_pending: 0, mapping_pending: 0, processing: 0
      }),
      startLocalBatchExecutor: () => {
        batchStarts += 1;
        return { ok: false, local_processing_started: false };
      },
      startLocalReviewExecutor: () => {
        reviewStarts += 1;
        return { ok: false, local_review_started: false };
      }
    }) });
    await assert.rejects(service.continueCurrentBatch(), (error) => error.code === 'STANDALONE_BUSY');
    assert.strictEqual(batchStarts, review ? 0 : 1);
    assert.strictEqual(reviewStarts, review ? 1 : 0);
  }
}

async function unconfirmedContinuationCase() {
  for (const acknowledgement of [undefined, Promise.reject(new Error('private'))]) {
    const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
      continueMostRecentBatch: () => ({
        ok: true, batch_token: 'c'.repeat(64), batch_total: 1, completed: 0,
        deferred_review: 0, remaining: 1, retryable: 0, delivery_pending: 0, mapping_pending: 0, processing: 0
      }),
      startLocalBatchExecutor: () => ({
        ok: true, local_processing_started: true, ipcAcknowledgement: acknowledgement
      })
    }) });
    await assert.rejects(service.continueCurrentBatch(), (error) => error.code === 'STANDALONE_START_FAILED');
  }
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

async function cliTerminalStatusCases() {
  const cases = [
    [{ ok: true, state: 'stopped' }, /fortgesetzt/u],
    [{ ok: true, state: 'export_pending' }, /bereitgestellt/u],
    [{ ok: true, state: 'export_pending', completion_pending: true }, /^Die lokale Abschlussübersicht wird bereitgestellt\.\n$/u],
    [{ ok: true, state: 'completed_without_results', failed_count: 1 }, /1 Datei wurde sicher gestoppt/u],
    [{ ok: true, state: 'completed_without_results', failed_count: 2 }, /2 Dateien wurden sicher gestoppt/u]
  ];
  for (const [status, expected] of cases) {
    const stdout = new PassThrough();
    let out = '';
    stdout.on('data', (chunk) => { out += chunk; });
    assert.strictEqual(await run(['status'], {
      output: stdout, errorOutput: new PassThrough(), service: { status: () => status }
    }), 0);
    assert.match(out, expected);
    assert.doesNotMatch(out, /nicht bereit/u);
  }
}

async function openResultsFailureCase() {
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    openFolder: () => ({ ok: false })
  }) });
  await assert.rejects(service.openResults(), (error) => error.code === 'STANDALONE_RESULT_OPEN_FAILED');
}

async function openExactResultsCase() {
  const opened = [];
  const run = 'C:\\Results\\DataSecure-Output\\Lauf-20260904-120000-abcdef12';
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    latestProductResultDirectory: (channel, options) => {
      assert.strictEqual(channel, PRODUCT_CHANNEL);
      assert.deepStrictEqual(options, { ensureExport: true, latestBatchOnly: true });
      return run;
    },
    openFolder: (target) => { opened.push(target); return { ok: true }; }
  }) });
  assert.deepStrictEqual(await service.openResults(), { ok: true, handoff_confirmed: true, external_disclosure: false });
  assert.deepStrictEqual(opened, [run], 'only the exact completed run is opened');
}

async function missingResultsCase() {
  let opened = false;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    latestProductResultDirectory: () => '',
    openFolder: () => { opened = true; return { ok: true }; }
  }) });
  await assert.rejects(service.openResults(), (error) => error.code === 'STANDALONE_RESULTS_MISSING');
  assert.strictEqual(opened, false);
}

async function openLedgerCase() {
  const opened = [];
  const run = 'C:\\Results\\DataSecure-Output\\Lauf-20260904-120000-abcdef12';
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    latestProductResultDirectory: () => run,
    fs: { mkdirSync() {}, existsSync: () => true },
    revealFile: (target) => { opened.push(target); return { ok: true }; }
  }) });
  assert.deepStrictEqual(await service.openLedger(), {
    ok: true, handoff_confirmed: true, external_disclosure: false
  });
  assert.deepStrictEqual(opened, [`${run}\\DataSecure-Zuordnung.csv`]);
}

function privateTargetResolutionCase() {
  const run = 'C:\\Results\\DataSecure-Output\\Lauf-20260904-120000-abcdef12';
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    latestProductResultDirectory: (_channel, options) => {
      assert.deepStrictEqual(options, { ensureExport: true, latestBatchOnly: true });
      return run;
    },
    fs: { mkdirSync() {}, existsSync: () => true }
  }) });
  assert.deepStrictEqual(service.resolveResults(), {
    ok: true, target_kind: 'directory', local_path: run, external_disclosure: false
  });
  assert.deepStrictEqual(service.resolveLedger(), {
    ok: true, target_kind: 'file', local_path: `${run}\\DataSecure-Zuordnung.csv`, external_disclosure: false
  });
}

async function missingLedgerCase() {
  let opened = false;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    fs: { mkdirSync() {}, existsSync: () => false },
    revealFile: () => { opened = true; return { ok: true }; }
  }) });
  await assert.rejects(service.openLedger(), (error) => error.code === 'STANDALONE_LEDGER_MISSING');
  assert.strictEqual(opened, false);
}

(async () => {
  await testAsync('Standalone calls the engine directly without MCP or JSON-RPC', directServiceCase);
  await testAsync('native desktop admission validates once and starts without a second picker', admittedServiceCase);
  await testAsync('processing purpose is rejected before mutations and never silently falls back', processingModeServiceCase);
  await testAsync('native desktop admission uses the real picker-to-queue adapter for files and folders', realAdmissionAdapterCase);
  await testAsync('prepared selections remove one item or clear the final item before Start', clearLastAdmittedSourceCase);
  await testAsync('native desktop admission enforces the aggregate 500 MB limit', oversizedAdmissionCase);
  await testAsync('a missing worker acknowledgement consumes the admission exactly once', uncertainAdmissionStartCase);
  await testAsync('an incomplete worker start contract consumes the admission and fails closed', invalidAdmissionStartContractCase);
  await testAsync('a saved result folder remains successful when export replay is deferred', resultFolderReplayFailureCase);
  await testAsync('a running batch stops a second start with a fixed domain code', busyCase);
  await testAsync('a rejected batch or review lease never becomes a false continuation success', rejectedContinuationCase);
  await testAsync('a continuation requires an explicit worker acknowledgement', unconfirmedContinuationCase);
  await testAsync('CLI exposes only fixed, content-free completion and error text', cliCase);
  await testAsync('CLI status uses a fixed local product message', cliStatusCase);
  await testAsync('CLI status distinguishes resumable, exporting and all-stopped batches', cliTerminalStatusCases);
  await testAsync('Standalone does not report a failed result-folder open as success', openResultsFailureCase);
  await testAsync('Standalone opens exactly the latest completed run', openExactResultsCase);
  await testAsync('Standalone refuses to open results before a complete visible run exists', missingResultsCase);
  await testAsync('Standalone reveals only the exact mapping of the latest visible run and never returns its path', openLedgerCase);
  await testAsync('Standalone refuses a missing local ledger without opening a folder', missingLedgerCase);
  test('the private desktop host resolves one exact completed run and its run-scoped mapping', privateTargetResolutionCase);
  done();
})();
