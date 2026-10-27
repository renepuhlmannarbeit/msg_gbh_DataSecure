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
  encodeFrame, FrameDecoder, MAX_FRAME_BYTES, MAX_ADMISSION_PATH_BYTES, PRIVATE_ACTIONS, validatePrivateMessage
} = require('../plugins/data-secure/server/standalone/desktop-ipc');
const {
  batchQueueFromSelection, validateSelectedPathAsync
} = require('../plugins/data-secure/server/companion/file-picker');
const { enumerateSourceFolderAsync } = require('../plugins/data-secure/server/companion/source-folder');
const { createReviewBroker } = require('../plugins/data-secure/server/standalone/review-broker');

const { test, testAsync, done, assert } = createSuite('Standalone product');
const FIXTURE_SOURCE_ROOT = path.resolve(os.tmpdir(), 'datasecure-unit-source');
const FIXTURE_SOURCE_A = path.join(FIXTURE_SOURCE_ROOT, 'a.txt');
const FIXTURE_SOURCE_B = path.join(FIXTURE_SOURCE_ROOT, 'b.txt');
const FIXTURE_RESULT_ROOT = path.resolve(os.tmpdir(), 'datasecure-unit-results');
const FIXTURE_RESULT_RUN = path.join(FIXTURE_RESULT_ROOT, 'DataSecure-Output', 'Lauf-20260904-120000-abcdef12');
const FIXTURE_MAPPING = path.resolve(os.tmpdir(), 'datasecure-unit-private', 'DataSecure-Mapping.csv');

function fakeDependencies(overrides = {}) {
  const traces = [];
  return {
    traces,
    lightweightStatus: () => ({ engine_ready: true, local_intake_pending: false, batch_processing_active: false }),
    latestProductResultDirectory: () => FIXTURE_RESULT_RUN,
    readConfiguredResultRoot: () => FIXTURE_RESULT_ROOT,
    saveConfiguredResultRoot: () => {},
    resultOutputDirectory: () => path.join(FIXTURE_RESULT_ROOT, 'DataSecure-Output'),
    openFolder: () => ({ ok: true }),
    revealFile: () => ({ ok: true }),
    mappingPath: () => FIXTURE_MAPPING,
    pickSourcesAsync: async () => [{ sourcePath: FIXTURE_SOURCE_A, sourceType: 'txt', sourceBytes: 4 }],
    validateSelectedPathAsync: async (sourcePath) => ({ sourcePath, sourceType: 'txt', sourceBytes: 4 }),
    pickSourceFolderAsync: async () => FIXTURE_SOURCE_ROOT,
    enumerateSourceFolderAsync: async () => [{ sourcePath: FIXTURE_SOURCE_A, sourceType: 'txt', sourceBytes: 4 }],
    batchQueueFromSelection,
    pickFolderAsync: async () => FIXTURE_RESULT_ROOT,
    reserveIntake: () => ({ reservation_id: 'r'.repeat(32) }),
    releaseIntake: () => {},
    startLocalIntakeExecutor: () => ({ ok: true, local_intake_pending: true,
      batch_token: 'b'.repeat(64),
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
  assert.strictEqual(root, path.posix.join('/data', 'SecureDataMsg-Standalone'));
  assert.strictEqual(path.posix.relative(path.posix.join('/data', 'SecureDataMsg'), root).startsWith('..'), true);
  assert.strictEqual(standaloneDataRoot({ platform: 'darwin', environment: {}, home: '/Users/u' }),
    '/Users/u/Library/Application Support/SecureDataMsg-Standalone');
  assert.strictEqual(standaloneDataRoot({ platform: 'win32', environment: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' } }),
    'C:\\Users\\u\\AppData\\Local\\SecureDataMsg-Standalone');
  assert.strictEqual(defaultResultRoot({ home: '/home/u' }), path.join('/home/u', 'Documents', 'SecureDataMsg'));
  assert.strictEqual(defaultResultRoot({ home: '/ignored', environment: {
    DATASECURE_STANDALONE_DOCUMENTS_DIR: '/mounted/Documents'
  } }), path.join('/mounted/Documents', 'SecureDataMsg'));
});

testAsync('Standalone file selection passes its product role into picker and source validation', async () => {
  let pickerOptions, validationOptions;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    pickSourcesAsync: async options => { pickerOptions = options; return [{ sourcePath: FIXTURE_SOURCE_A, sourceType: 'txt', sourceBytes: 4 }]; },
    validateSelectedPathAsync: async (sourcePath, options) => {
      validationOptions = options; return { sourcePath, sourceType: 'txt', sourceBytes: 4 };
    }
  }) });
  await service.selectSources('files');
  await service.validateSourceSelection([FIXTURE_SOURCE_A]);
  assert.equal(pickerOptions.productChannel, 'standalone');
  assert.equal(validationOptions.productChannel, 'standalone');
});

test('native Windows namespace uses only the host-bound canonical root without a fallback', () => {
  const root = 'C:\\Users\\synthetic\\AppData\\Local\\SecureDataMsg-Standalone';
  const environment = { LOCALAPPDATA: 'C:\\different-token', DATASECURE_NATIVE_EXPORT_CHANNEL: '1',
    DATASECURE_STANDALONE_NAMESPACE_ROOT: root };
  assert.equal(standaloneDataRoot({ platform: 'win32', environment }), root);
  const lowerLeaf = root.replace('SecureDataMsg-Standalone', 'securedatamsg-standalone');
  assert.equal(standaloneDataRoot({ platform: 'win32', environment: {
    ...environment, DATASECURE_STANDALONE_NAMESPACE_ROOT: lowerLeaf
  } }), lowerLeaf, 'keep the native canonical spelling; only the fixed Windows leaf comparison ignores case');
  for (const invalid of [undefined, '', 'relative', '\\\\server\\share\\SecureDataMsg-Standalone',
    root + '\\..', root + '\\', 'C:\\private\\other-product', root + '\0']) {
    assert.throws(() => standaloneDataRoot({ platform: 'win32', environment: {
      ...environment, DATASECURE_STANDALONE_NAMESPACE_ROOT: invalid
    } }), { code: 'STANDALONE_DATA_ROOT_UNSAFE' });
  }
  // A future Mac adapter must be implemented separately; Windows' native
  // handoff variable cannot redirect the current Mac/source namespace.
  assert.equal(standaloneDataRoot({ platform: 'darwin', environment, home: '/Users/synthetic' }),
    '/Users/synthetic/Library/Application Support/SecureDataMsg-Standalone');
});

test('fresh installation tolerates an absent result folder until a real start needs one', () => {
  const operations = [];
  const home = path.join(os.tmpdir(), 'datasecure-fresh-user');
  const expected = defaultResultRoot({ home });
  const service = new StandaloneApplicationService({ home, dependencies: fakeDependencies({
    readConfiguredResultRoot: () => '',
    latestProductResultDirectory: () => '',
    fs: { mkdirSync(root) { operations.push(['mkdir', root]); } },
    resultOutputDirectory({ root }) { operations.push(['output', root]); return path.join(root, 'DataSecure-Output'); },
    saveConfiguredResultRoot(root) { operations.push(['save', root]); }
  }) });
  assert.equal(service.uiContext().result_folder, expected);
  assert.equal(service.uiContext().result_folder_is_default, true);
  assert.equal(service.uiContext().result_folder_status, 'unconfigured');
  assert.deepEqual(operations, [], 'reading a fresh UI must not require or create a result folder');
  assert.equal(service.ensureResultRoot(), expected);
  assert.deepEqual(operations, [['mkdir', expected], ['output', expected], ['save', expected]]);
  const unavailable = new StandaloneApplicationService({ home, dependencies: fakeDependencies({
    readConfiguredResultRoot: () => '',
    fs: { mkdirSync() { throw Object.assign(Error('private path'), { code: 'EACCES' }); } }
  }) });
  assert.throws(() => unavailable.ensureResultRoot(), { code: 'STANDALONE_RESULT_ROOT_UNAVAILABLE' });
});

test('a lost configured destination never becomes a fresh default or an authorized display path', () => {
  const recorded = path.join(os.tmpdir(), 'datasecure-offline-results');
  const operations = [];
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    readConfiguredResultRoot: () => '',
    readConfiguredResultRootStatus: () => ({ status: 'unavailable', root: '', recorded_root: recorded }),
    fs: { mkdirSync(root) { operations.push(['mkdir', root]); } },
    resultOutputDirectory({ root }) { operations.push(['output', root]); },
    saveConfiguredResultRoot(root) { operations.push(['save', root]); }
  }) });
  const context = service.uiContext();
  assert.equal(context.result_folder_status, 'unavailable');
  assert.equal(context.result_folder, '');
  assert.equal(context.result_folder_is_default, false);
  assert.equal(context.result_folder_recorded, recorded);
  assert.throws(() => service.ensureResultRoot(), error => {
    assert.equal(error.code, 'STANDALONE_RESULT_ROOT_UNAVAILABLE');
    assert.ok(!error.message.includes(recorded), 'failure contracts remain path-free');
    return true;
  });
  assert.deepEqual(operations, [], 'a lost configured target never creates or saves another destination');
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
  assert.strictEqual(environment.EU_PRIVACY_ROOT, path.win32.join(root, 'workspace'));
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

// IO-order model around the actual namespace activator. The native primitive
// itself is covered by real target-specific gates, not by this injected guard.
function nativeNamespaceOrderProbe(nativeError, diagnosticsThrow = false, model = {}) {
  const Module = require('node:module'), originalLoad = Module._load;
  const originalChannel = process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
  const caller = require.resolve('../plugins/data-secure/server/standalone/application-service');
  const root = model.platform === 'darwin' ? '/synthetic/datasecure-namespace-order-model'
    : path.join(os.tmpdir(), 'datasecure-namespace-order-model');
  const events = [], ioCalls = [], environment = {};
  const directory = { dev: 7, ino: 42, isDirectory: () => true, isSymbolicLink: () => false };
  const realpath = value => { ioCalls.push(['realpath', value]); return value; };
  const io = { mkdirSync(candidate) {
      ioCalls.push(['mkdir', candidate]); events.push(candidate === root ? 'mkdir-root' : 'mkdir-workspace');
    },
    lstatSync(candidate) { ioCalls.push(['lstat', candidate]); return directory; },
    statSync(candidate) { ioCalls.push(['stat', candidate]); return directory; },
    realpathSync: Object.assign(realpath, { native: realpath }) };
  Module._load = function(request, parent, ...rest) {
    if (parent?.filename === caller && request === '../core/ownership-control') return {
      assertNativeOwnershipRuntime() {
        events.push('runtime-check');
        if (model.runtimeError) throw Object.assign(Error('private vendor detail must not escape'), { code: model.runtimeError });
      },
      withOwnershipControl(candidate, action) {
        assert.equal(candidate, root); events.push('native-check');
        if (nativeError) throw Object.assign(Error('private vendor detail must not escape'), { code: nativeError });
        return action({ assertHeld() { events.push('held'); return true; } });
      }
    };
    return originalLoad.call(this, request, parent, ...rest);
  };
  process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = '1';
  let result, error;
  try {
    let activate = activateStandaloneNamespace;
    if (model.platform) {
      // Execute the unchanged real module with an explicit platform model. This
      // catches Darwin-only IO ordering on Windows too; it is NOT native proof.
      const modeledModule = { exports: {} };
      require('node:vm').runInNewContext(fs.readFileSync(caller, 'utf8'), {
        module: modeledModule, require: Module.createRequire(caller),
        process: { platform: model.platform, env: process.env }
      }, { filename: caller, timeout: 1000 });
      activate = modeledModule.exports.activateStandaloneNamespace;
    }
    result = activate({ dataRoot: root, fs: io, environment,
      ...(model.platform ? { platform: model.platform } : {}),
      startupDiagnostic(event) { events.push(event); if (diagnosticsThrow) throw Error('unavailable diagnostic'); } });
  } catch (caught) { error = caught; }
  finally {
    Module._load = originalLoad;
    if (originalChannel === undefined) delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
    else process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = originalChannel;
  }
  return { events, ioCalls, environment, result, error, root };
}

const nativeRootOrder = process.platform === 'darwin' ? ['runtime-check', 'mkdir-root'] : [];

test('Darwin actual-source IO model checks the runtime before namespace IO on every host', () => {
  for (const [nativeError, expected] of [[null, undefined],
    ['OWNERSHIP_GUARD_UNSAFE', 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE'],
    ['OWNERSHIP_GUARD_BUSY', 'STANDALONE_OWNERSHIP_CONTROL_BUSY']]) {
    const outcome = nativeNamespaceOrderProbe(nativeError, false, { platform: 'darwin' });
    assert.equal(outcome.error?.code, expected);
    assert.deepEqual(outcome.events, ['runtime-check', 'mkdir-root', 'ownership_control_check_started', 'native-check',
      ...(nativeError ? ['ownership_control_check_failed'] : ['held', 'ownership_control_check_finished', 'mkdir-workspace'])]);
    if (nativeError) assert.deepEqual(outcome.environment, {});
    else assert.equal(outcome.result, outcome.root);
  }
});

test('Darwin actual-source IO model refuses unavailable or invalid runtime without filesystem calls', () => {
  for (const runtimeError of ['OWNERSHIP_GUARD_UNAVAILABLE', 'OWNERSHIP_GUARD_INTEGRITY_FAILED']) {
    for (const diagnosticsThrow of [false, true]) {
      const outcome = nativeNamespaceOrderProbe(null, diagnosticsThrow, { platform: 'darwin', runtimeError });
      assert.equal(outcome.error?.code, 'STANDALONE_OWNERSHIP_RUNTIME_INVALID');
      assert.equal(outcome.error.message.includes('private vendor detail'), false);
      assert.deepEqual(outcome.events, ['runtime-check']);
      assert.deepEqual(outcome.ioCalls, [], 'runtime refusal precedes both read and write IO');
      assert.deepEqual(outcome.environment, {});
    }
  }
});

test('native Windows never falls back to JavaScript mkdir when its host root is absent (IO-order model)', () => {
  if (process.platform !== 'win32') return;
  const before = process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
  const environment = {}, writes = [];
  process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = '1';
  try {
    assert.throws(() => activateStandaloneNamespace({
      dataRoot: path.join(os.tmpdir(), 'synthetic-missing-native-root'), environment,
      fs: { mkdirSync(value) { writes.push(value); }, lstatSync() { throw Object.assign(Error('absent'), { code: 'ENOENT' }); } }
    }), { code: 'STANDALONE_DATA_ROOT_UNSAFE' });
    assert.deepEqual(writes, []);
    assert.deepEqual(environment, {});
  } finally {
    if (before === undefined) delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
    else process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = before;
  }
});

test('native namespace refusal precedes every workspace child write (IO-order model)', () => {
  if (!['win32', 'darwin'].includes(process.platform)) return;
  const outcome = nativeNamespaceOrderProbe('OWNERSHIP_GUARD_UNSAFE');
  assert.equal(outcome.error?.code, 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE');
  assert.equal(outcome.error.message.includes('private vendor detail'), false);
  assert.deepEqual(outcome.events, [...nativeRootOrder, 'ownership_control_check_started', 'native-check', 'ownership_control_check_failed']);
  assert.deepEqual(outcome.environment, {}, 'refusal exposes no active workspace namespace');
});

test('native namespace readiness is required before workspace creation (IO-order model)', () => {
  if (!['win32', 'darwin'].includes(process.platform)) return;
  const outcome = nativeNamespaceOrderProbe(null);
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.result, outcome.root);
  assert.deepEqual(outcome.events, [...nativeRootOrder, 'ownership_control_check_started', 'native-check', 'held',
    'ownership_control_check_finished', 'mkdir-workspace']);
  assert.equal(outcome.environment.EU_PRIVACY_ROOT, path.join(outcome.root, 'workspace'));
});

test('native namespace contention keeps its fixed cause and writes no child (IO-order model)', () => {
  if (!['win32', 'darwin'].includes(process.platform)) return;
  const outcome = nativeNamespaceOrderProbe('OWNERSHIP_GUARD_BUSY');
  assert.equal(outcome.error?.code, 'STANDALONE_OWNERSHIP_CONTROL_BUSY');
  assert.equal(outcome.events.includes('mkdir-workspace'), false);
});

test('unavailable diagnostics cannot waive the native namespace gate (IO-order model)', () => {
  if (!['win32', 'darwin'].includes(process.platform)) return;
  const outcome = nativeNamespaceOrderProbe('OWNERSHIP_GUARD_UNSAFE', true);
  assert.equal(outcome.error?.code, 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE');
  assert.equal(outcome.events.includes('native-check'), true);
  assert.equal(outcome.events.includes('mkdir-workspace'), false);
});

testAsync('direct OCR-contact opt-out does not forge a confirmation or interrupt another run', async () => {
  const batchId = 'a'.repeat(64), otherId = 'b'.repeat(64), submitted = [];
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    runHistory: { find: id => ({ batch_id: id, processing_mode: 'markdown-only', resumable: false }) },
    reviewSession: () => ({ ready: true, batch_id: batchId, review_id: 'c'.repeat(32), worker_active: true }),
    submitReview: (_id, answer) => { submitted.push(answer); return { accepted: true }; }
  }) });
  service.interactionActive = true;
  assert.deepStrictEqual(await service.skipOcrContactReview(batchId), {
    ok: true, skip_requested: true, continuation_pending: false, external_disclosure: false
  });
  assert.deepStrictEqual(submitted, [{ action: 'skipped' }]);
  await assert.rejects(service.skipOcrContactReview(otherId), { code: 'STANDALONE_BUSY' });
  assert.deepStrictEqual(submitted, [{ action: 'skipped' }]);
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
    batch_complete: false,
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

test('current ledger resolution stays on failed batch B and never borrows the successful batch A mapping', () => {
  const batchA = 'a'.repeat(64), batchB = 'b'.repeat(64), reads = [], observations = [];
  const missing = Object.assign(new Error('synthetic current ledger missing'), { code: 'STANDALONE_LEDGER_MISSING' });
  const prior = { ok: true, target_kind: 'file',
    local_path: path.join(FIXTURE_RESULT_RUN, 'DataSecure-Zuordnung.csv'), external_disclosure: false };
  let fallbackCalls = 0;
  const noFallback = () => { fallbackCalls++; assert.fail('current ledger must not resolve or reopen another result'); };
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    publicStatusSnapshot(id) {
      observations.push(id); assert.strictEqual(id, batchB);
      return { observed_batch_id: batchB, observed_is_active: false };
    },
    runHistory: {
      resolveLedger(id) {
        reads.push(id);
        if (id === batchA) return prior;
        assert.strictEqual(id, batchB); throw missing;
      },
      resolveResults: noFallback
    },
    latestProductResultDirectory: noFallback, replayPendingResultExports: noFallback,
    fs: { mkdirSync: noFallback, existsSync: noFallback }
  }) });
  service.observedBatchId = batchB;
  assert.deepStrictEqual(service.resolveHistoryLedger(batchA), prior, 'A remains available only through its explicit target');
  assert.strictEqual(service.observedBatchId, batchB, 'an explicit historic read must not replace the current run');
  reads.length = 0;
  service.resolveResults = noFallback;
  assert.throws(() => service.resolveLedger(), error => error === missing, 'preserve the exact B-ledger refusal');
  assert.deepStrictEqual(reads, [batchB]); assert.deepStrictEqual(observations, [batchB]);
  assert.strictEqual(service.observedBatchId, batchB); assert.strictEqual(fallbackCalls, 0);
});

test('Standalone consumes one combined journal snapshot per public status poll', () => {
  let snapshots = 0;
  const batchId = 'a'.repeat(64);
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    publicStatusSnapshot: () => {
      snapshots++;
      return {
        current: { engine_ready: true, local_intake_pending: false, batch_processing_active: false,
          recoverable_batches: 0, batches_awaiting_resume: 0 },
        latest: { result_count: 1, review_count: 0, failed_count: 0, export_pending_count: 0,
          processing: false, resumable: false, complete: true },
        observed_batch_id: batchId, observed_is_active: false, observed_recoverable: false
      };
    },
    lightweightStatus: () => { throw new Error('SECOND_STATUS_SCAN'); },
    latestProductBatchStatus: () => { throw new Error('SECOND_PRODUCT_SCAN'); }
  }) });
  service.observedBatchId = batchId;
  const status = service.status();
  assert.strictEqual(status.state, 'results_available');
  assert.strictEqual(status.batch_id, undefined, 'public CLI status remains token-free');
  assert.strictEqual(snapshots, 1);
  assert.strictEqual(service.status({ localUi: true }).batch_id, batchId,
    'only the private desktop snapshot carries the exact observed run');
});

test('an incomplete non-resumable run with partial results never claims finished processing', () => {
  const batchId = 'a'.repeat(64);
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    publicStatusSnapshot: () => ({
      current: { engine_ready: true, local_intake_pending: false, batch_processing_active: false,
        recoverable_batches: 0, batches_awaiting_resume: 0 },
      latest: { selected_count: 3, completed_count: 1, result_count: 1, failed_count: 0,
        review_count: 0, review_ready: false, export_pending_count: 0,
        processing: false, resumable: false, complete: false },
      observed_batch_id: batchId, observed_is_active: false, observed_recoverable: false
    })
  }) });
  service.observedBatchId = batchId;
  const status = service.status({ localUi: true });
  assert.strictEqual(status.state, 'failed');
  assert.strictEqual(status.batch_complete, false);
  assert.strictEqual(status.result_count, 1, 'partial private work remains distinguishable from completion');
});

test('review window sees terminal completion only after the final review group', () => {
  const batchId = 'a'.repeat(64);
  const latest = { selected_count: 2, completed_count: 1, result_count: 1, failed_count: 0,
    review_count: 1, review_ready: true, export_pending_count: 0, processing: false,
    resumable: false, complete: false };
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    reviewSession: () => ({ ready: false }), latestProductBatchStatus: () => latest,
    reviewContinuationBatchId: () => batchId
  }) });
  service.observedBatchId = batchId;
  assert.deepStrictEqual(service.reviewSession(), { ready: false, run_complete: false,
    continuation_available: true });
  latest.review_ready = false;
  latest.complete = true;
  latest.completed_count = 2;
  latest.result_count = 2;
  assert.deepStrictEqual(service.reviewSession(), { ready: false, run_complete: true,
    continuation_available: false });
  latest.export_pending_count = 1;
  assert.deepStrictEqual(service.reviewSession(), { ready: false, run_complete: false,
    continuation_available: false });
  service.observedBatchId = 'b'.repeat(64);
  assert.deepStrictEqual(service.reviewSession(), { ready: false, run_complete: false,
    continuation_available: false }, 'a review window must not continue or close based on another run');
});

testAsync('review-window continuation is bound to the run that supplied its answered draft', async () => {
  const batchId = 'a'.repeat(64);
  const latest = { selected_count: 2, completed_count: 1, result_count: 1, failed_count: 0,
    review_count: 1, review_ready: true, export_pending_count: 0, processing: false,
    resumable: true, complete: false };
  let reviewedBatchId = batchId;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    latestProductBatchStatus: () => latest,
    reviewContinuationBatchId: () => reviewedBatchId
  }) });
  service.observedBatchId = batchId;
  const calls = [];
  service.continueHistoryBatch = async (id) => { calls.push(id); return { ok: true, event: 'batch_continued' }; };
  assert.deepStrictEqual(await service.continueReviewSession(), { ok: true, event: 'batch_continued' });
  assert.deepStrictEqual(calls, [batchId]);
  reviewedBatchId = 'b'.repeat(64);
  await assert.rejects(service.continueReviewSession(), { code: 'STANDALONE_NOTHING_TO_CONTINUE' });
  latest.review_ready = false;
  reviewedBatchId = batchId;
  await assert.rejects(service.continueReviewSession(), { code: 'STANDALONE_NOTHING_TO_CONTINUE' });
  assert.deepStrictEqual(calls, [batchId]);
});

testAsync('real broker lifecycle binds first-draft failure, safe retry and the single-document limit to one run', async () => {
  const batchId = 'c'.repeat(64);
  const broker = createReviewBroker();
  const latest = { selected_count: 1, completed_count: 0, result_count: 0, failed_count: 0,
    review_count: 1, review_ready: true, export_pending_count: 0, processing: false,
    resumable: true, complete: false };
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    latestProductBatchStatus: () => latest, reviewSession: broker.session,
    reviewContinuationBatchId: broker.boundBatchId,
    runHistory: { reviewTargets: (id) => {
      assert.strictEqual(id, batchId); return ['Folien.pdf', 'Tabelle.xlsx'];
    } }
  }) });
  service.observedBatchId = batchId;
  const calls = [];
  service.continueHistoryBatch = async (id) => { calls.push(id); return { ok: true }; };
  const owner = { send() {} };
  broker.begin(owner, batchId);
  assert.strictEqual(service.reviewSession().continuation_available, false,
    'journal review_ready alone must never restart a still-live preparing worker');
  await assert.rejects(service.continueReviewSession(), { code: 'STANDALONE_NOTHING_TO_CONTINUE' });
  broker.release(owner);
  assert.strictEqual(service.reviewSession().continuation_available, true);
  assert.deepStrictEqual(service.reviewSession().affected_files, ['Folien.pdf', 'Tabelle.xlsx'],
    'the bound retry targets are available before a possibly unconfirmed continuation');
  broker.begin(owner, batchId);
  broker.failed(owner, 'BATCH_REVIEW_RECONSTRUCTION_FAILED');
  assert.strictEqual(service.reviewSession().retry_available, false);
  broker.release(owner, { failed: true });
  assert.strictEqual(service.reviewSession().phase, 'failed');
  assert.strictEqual(service.reviewSession().retry_available, true);
  assert.deepStrictEqual(service.reviewSession().affected_files, ['Folien.pdf', 'Tabelle.xlsx']);
  assert.deepStrictEqual(await service.continueReviewSession(), { ok: true });
  assert.deepStrictEqual(calls, [batchId]);
  broker.begin(owner, batchId);
  broker.failed(owner, 'LOCAL_REVIEW_TOO_LARGE');
  broker.release(owner, { failed: true });
  assert.strictEqual(service.reviewSession().continuation_available, false);
  assert.strictEqual(service.reviewSession().error_code, 'LOCAL_REVIEW_TOO_LARGE');
  await assert.rejects(service.continueReviewSession(), { code: 'STANDALONE_NOTHING_TO_CONTINUE' });
  service.observedBatchId = 'd'.repeat(64);
  assert.strictEqual(service.reviewSession().phase, 'unbound');
  assert.strictEqual(service.reviewSession().error_code, undefined);
  assert.strictEqual(service.reviewSession().affected_files, undefined);
});

test('review completion separates idle export debt from a still-running worker', () => {
  const batchId = 'a'.repeat(64);
  let workerActive = true;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    reviewSession: () => ({ ready: false, batch_id: batchId, phase: 'idle', worker_active: workerActive }),
    reviewContinuationBatchId: () => batchId,
    latestProductBatchStatus: () => ({ selected_count: 1, completed_count: 1, result_count: 1,
      failed_count: 0, review_count: 0, review_ready: false, complete: true,
      export_pending_count: 1, processing: false, resumable: false })
  }) });
  service.observedBatchId = batchId;
  assert.strictEqual(service.reviewSession().phase, 'idle');
  workerActive = false;
  assert.strictEqual(service.reviewSession().phase, 'export_pending');
  assert.strictEqual(service.reviewSession().run_complete, false);
  assert.strictEqual(service.reviewSession().continuation_available, false);
});

test('idle review session reconciles a completed private export before reporting completion', () => {
  const batchId = 'e'.repeat(64);
  let repaired = false, calls = 0;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    reviewSession: () => ({ ready: false, batch_id: batchId, phase: 'idle', worker_active: false }),
    reviewContinuationBatchId: () => batchId,
    runHistory: { history() { calls++; repaired = true; return { entries: [] }; } },
    latestProductBatchStatus: () => ({ selected_count: 2, completed_count: 2,
      result_count: repaired ? 1 : 0, failed_count: 1, review_count: 0,
      review_ready: false, complete: true, export_pending_count: repaired ? 0 : 1,
      processing: false, resumable: false })
  }) });
  service.observedBatchId = batchId;
  assert.equal(service.reviewSession().run_complete, true);
  assert.equal(calls, 1);
  assert.equal(service.reviewSession().run_complete, true);
  assert.equal(calls, 1, 'a completed export does not get replayed on later polls');
});

testAsync('multi-file admission names every rejected file and keeps the previous selection atomic', async () => {
  const paths = ['ok.txt', 'empty.txt', 'large.txt'].map((name) => path.join(FIXTURE_SOURCE_ROOT, name));
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    async validateSelectedPathAsync(candidate) {
      if (candidate === FIXTURE_SOURCE_A || candidate === paths[0]) return { sourcePath: candidate, sourceBytes: 4 };
      await new Promise((resolve) => setImmediate(resolve));
      throw Object.assign(new Error('private path must not be shown'), {
        code: candidate === paths[1] ? 'SOURCE_FILE_EMPTY' : 'SOURCE_FORMAT_SIZE_LIMIT'
      });
    }
  }) });
  await service.admitSelectedSources([FIXTURE_SOURCE_A]);
  await assert.rejects(service.admitSelectedSources(paths), (error) => {
    assert.strictEqual(error.code, 'SOURCE_SELECTION_REJECTED');
    assert.strictEqual(error.localSelectionCount, 2);
    assert.deepStrictEqual(error.localSelectionFiles, [
      { name: 'empty.txt', reason_code: 'SOURCE_FILE_EMPTY' },
      { name: 'large.txt', reason_code: 'SOURCE_FORMAT_SIZE_LIMIT' }
    ]);
    assert.doesNotMatch(error.message, /private path|empty\.txt|large\.txt/u);
    return true;
  });
  assert.deepStrictEqual(service.uiContext().selected_files, ['a.txt']);
  assert.strictEqual(service.interactionActive, false);
});

testAsync('the desktop current-run continuation refuses a historical fallback after reconnect', async () => {
  const batchId = 'c'.repeat(64);
  let historicalFallbacks = 0;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    continueMostRecentBatch: () => { historicalFallbacks++; throw new Error('UNEXPECTED_HISTORY_FALLBACK'); }
  }) });
  await assert.rejects(service.continueCurrentBatch(undefined, { requireObserved: true }),
    { code: 'STANDALONE_NOTHING_TO_CONTINUE' });
  service.observedBatchId = batchId;
  let selected;
  service.continueHistoryBatch = async (id) => { selected = id; return { ok: true }; };
  assert.deepStrictEqual(await service.continueCurrentBatch(undefined, { requireObserved: true }), { ok: true });
  assert.strictEqual(selected, batchId);
  assert.strictEqual(historicalFallbacks, 0);
});

test('a restart leaves historical recoverable work in History and presents a fresh process card', () => {
  const historicalBatchId = 'b'.repeat(64);
  let presentationChecks = 0;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    publicStatusSnapshot: () => ({
      current: { engine_ready: true, local_intake_pending: false, batch_processing_active: false,
        recoverable_batches: 1, batches_awaiting_resume: 1 },
      latest: { result_count: 12, review_count: 1, failed_count: 4, export_pending_count: 0,
        processing: false, resumable: true, complete: false },
      observed_batch_id: historicalBatchId, observed_is_active: false, observed_recoverable: true
    }),
    pendingStandaloneTerminalNoticeGeneration: () => { presentationChecks++; return 7; }
  }) });
  const status = service.status();
  assert.strictEqual(status.state, 'ready');
  assert.strictEqual(status.resumable, false);
  assert.strictEqual(status.resumable_count, 0);
  assert.strictEqual(status.recoverable_count, 1, 'history can still list the safely recovered run');
  assert.strictEqual(status.results_available, false);
  assert.strictEqual(status.presentation_generation, undefined);
  assert.strictEqual(presentationChecks, 0, 'a historical terminal notice is not presented as current work');
  assert.strictEqual(service.uiContext().latest_result_folder, '');
  assert.throws(() => service.resolveResults(), (error) => error.code === 'STANDALONE_RESULTS_MISSING');
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

test('only the exact inactive pending anonymization run can be abandoned', () => {
  const batchId = 'd'.repeat(64), calls = [];
  const selected = { token: batchId, product_channel: 'standalone' };
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    runHistory: { find: id => ({ batch_id: id, processing_mode: 'markdown-and-anonymize', status: 'export_pending' }) },
    readStates: () => [selected],
    abandonPendingResultExport: state => { calls.push(state); return { abandoned: true, exported: 1, pending: 1, available: false }; },
    latestProductBatchStatus: () => ({ selected_count: 2, completed_count: 2, failed_count: 0,
      result_count: 0, exported_count: 1, export_pending_count: 1, export_abandoned: true,
      review_count: 0, processing: false, resumable: false, complete: true })
  }) });
  assert.deepEqual(service.abandonResultExport(batchId), { ok: true, batch_id: batchId,
    abandoned: true, exported: 1, pending: 1, available: false, external_disclosure: false });
  assert.equal(calls.length, 1); assert.equal(calls[0], selected);
  assert.equal(service.status().state, 'export_abandoned');
  assert.equal(service.status().results_available, false);
  const unsafe = new StandaloneApplicationService({ dependencies: fakeDependencies({
    runHistory: { find: id => ({ batch_id: id, processing_mode: 'markdown-and-anonymize', status: 'export_pending' }) },
    readStates: () => [selected],
    abandonPendingResultExport: () => { throw Error('RESULT_EXPORT_STATE_UNSAFE'); }
  }) });
  assert.throws(() => unsafe.abandonResultExport(batchId), error => error.code === 'RESULT_EXPORT_STATE_UNSAFE');
  const busy = new StandaloneApplicationService({ dependencies: fakeDependencies({
    lightweightStatus: () => ({ engine_ready: true, batch_processing_active: true }),
    runHistory: { find: () => { throw Error('must not read history while active'); } }
  }) });
  assert.throws(() => busy.abandonResultExport(batchId), error => error.code === 'STANDALONE_BUSY');
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
    batch_complete: false,
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
  assert.strictEqual(contract.renderer_receives_raw_content, 'active-review-surface-only');
  assert.strictEqual(contract.main_renderer_receives_raw_content, 'only-while-owned-embedded-or-document-review-active');
  assert.strictEqual(contract.embedded_review.native_owner_guard, true);
  assert.strictEqual(contract.embedded_review.mutually_exclusive_with_review_window, true);
  assert.strictEqual(contract.review_window.close_action, 'defer');
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
    'get_public_state', 'get_ui_context', 'get_run_history', 'set_run_history_visibility', 'get_run_failures', 'open_history_results', 'open_history_ledger',
    'open_history_identity_mapping', 'open_identity_mappings_directory', 'continue_history_batch', 'pause_batch', 'abandon_result_export', 'skip_ocr_contact_review',
    'get_document_reviews', 'get_document_review_history_summary', 'close_document_reviews', 'get_document_review_chunk', 'get_document_entities', 'decide_document_review', 'decide_document_review_batch', 'export_approved_documents', 'publish_result_documents', 'abandon_document_export', 'open_document_export', 'open_recorded_document_export', 'open_document_identity_overview',
    'open_review_window', 'open_embedded_review', 'close_review_window', 'get_review_session', 'get_review_chunk', 'submit_review',
    'continue_review_session',
    'ack_terminal_presented', 'continue_current_batch', 'configure_results',
    'open_current_results', 'open_local_ledger', 'open_diagnostic_folder', 'report_blocked_picker', 'shutdown'
  ]);
  assert.deepStrictEqual([...PRIVATE_ACTIONS], [
    'admit_selected_sources', 'remove_admitted_source', 'cancel_admission', 'start_admitted_batch',
    'get_public_state', 'get_ui_context', 'ack_terminal_presented', 'continue_current_batch', 'configure_results',
    'resolve_current_results', 'resolve_local_ledger', 'get_run_history', 'set_run_history_visibility', 'get_run_failures',
    'resolve_history_results', 'resolve_history_ledger', 'resolve_history_identity_mapping',
    'resolve_identity_mappings_directory',
    'continue_history_batch', 'pause_batch', 'skip_ocr_contact_review', 'abandon_result_export',
    'get_document_reviews', 'get_document_review_history_summary', 'get_document_review_chunk', 'get_document_entities', 'decide_document_review', 'decide_document_review_batch', 'preview_document_export', 'export_approved_documents', 'abandon_document_export', 'resolve_document_export', 'resolve_document_identity_overview',
    'publish_result_documents',
    'get_review_session', 'get_review_chunk', 'submit_review', 'continue_review_session', 'shutdown'
  ]);
});

test('Standalone exposes history ledgers only when the backend marks the anonymized run ledger available', () => {
  const source = fs.readFileSync(path.join(__dirname,
    '../apps/datasecure-standalone/frontend/app.js'), 'utf8');
  assert.match(source, /command: 'open_history_ledger'[^\n]*available: entry\.ledger_available === true/u);
  assert.doesNotMatch(source, /command: 'open_history_ledger'[^\n]*available:.*failed_count/u);
  assert.match(source, /Für reine Konvertierung wird keine Zuordnungsdatei erstellt/u);
});

test('private batch-decision transport accepts only exact bounded approve/revoke selections', () => {
  const decision = { action: 'approve', operation_id: '1'.repeat(32), selection: [
    { document_id: '2'.repeat(32), revision: 0, output_sha256: '3'.repeat(64) }] };
  const message = { schema: 'datasecure-standalone-private-ipc/1', request_id: 'a'.repeat(16),
    action: 'decide_document_review_batch', batch_id: 'b'.repeat(64), decision };
  assert.deepEqual(validatePrivateMessage(message), message);
  for (const change of [null, { ...decision, action: 'redact' }, { ...decision, selection: [] },
    { ...decision, selection: [null] }, { ...decision, selection: [decision.selection[0], decision.selection[0]] },
    { ...decision, selection: [{ ...decision.selection[0], revision: 1000 }] }, { ...decision, bypass: true }])
    assert.throws(() => validatePrivateMessage({ ...message, decision: change }), error => error.code === 'DOCUMENT_REVIEW_INVALID');
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
    (error) => error.code === 'DESKTOP_IPC_REVIEW_INVALID');
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

test('private desktop IPC assembles fragmented bounded frames without repeated full-buffer copies', () => {
  const payload = Buffer.from(JSON.stringify({ text: 'x'.repeat(8192) }), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  const frame = Buffer.concat([header, payload]);
  const decoder = new FrameDecoder({ validate: value => value });
  const originalConcat = Buffer.concat;
  let concatCalls = 0;
  let messages = [];
  try {
    Buffer.concat = (...args) => { concatCalls += 1; return originalConcat(...args); };
    for (let offset = 0; offset < frame.length; offset += 1) {
      messages = messages.concat(decoder.push(frame.subarray(offset, offset + 1)));
    }
  } finally {
    Buffer.concat = originalConcat;
  }
  assert.deepStrictEqual(messages, [{ text: 'x'.repeat(8192) }]);
  assert.strictEqual(decoder.hasPendingFrame(), false, 'a complete frame must leave no pending EOF bytes');
  const abandoned = new FrameDecoder({ validate: value => value });
  abandoned.push(frame.subarray(0, 5));
  assert.strictEqual(abandoned.hasPendingFrame(), true);
  abandoned.discard();
  assert.strictEqual(abandoned.hasPendingFrame(), false);
  assert.deepStrictEqual(abandoned.push(frame), [{ text: 'x'.repeat(8192) }]);
  assert.ok(concatCalls < 10, `fragmented frame copied repeatedly: ${concatCalls}`);
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
  const detail = { ...base, action: 'get_run_history', batch_id: 'b'.repeat(64) };
  assert.deepStrictEqual(new FrameDecoder().push(encodeFrame(detail)), [detail]);
  assert.throws(() => encodeFrame({ ...detail, include_hidden: true }), { code: 'STANDALONE_HISTORY_INVALID' });
  assert.throws(() => encodeFrame({ ...detail, recover_exports: true, recover_batch_id: detail.batch_id }),
    { code: 'STANDALONE_HISTORY_INVALID' });
  assert.throws(() => encodeFrame({ ...detail, source_paths: ['/tmp/result'] }), { code: 'DESKTOP_IPC_SOURCE_UNEXPECTED' });
  const explicitRecovery = { ...base, action: 'get_run_history', recover_exports: true,
    recover_batch_id: 'b'.repeat(64) };
  assert.deepStrictEqual(new FrameDecoder().push(encodeFrame(explicitRecovery)), [explicitRecovery]);
  for (const recover_exports of [false, null, 1, 'true'])
    assert.throws(() => encodeFrame({ ...explicitRecovery, recover_exports }), { code: 'DESKTOP_IPC_FIELD_INVALID' });
  for (const recover_batch_id of [null, '', 'b'.repeat(63), 'B'.repeat(64), '/tmp/result'])
    assert.throws(() => encodeFrame({ ...explicitRecovery, recover_batch_id }), { code: 'DESKTOP_IPC_FIELD_INVALID' });
  for (const message of [
    { ...base, action: 'get_run_failures' },
    { ...base, action: 'get_run_failures', batch_id: 'b'.repeat(64) }
  ]) assert.deepStrictEqual(new FrameDecoder().push(encodeFrame(message)), [message]);
  for (const batch_id of [null, '', '../latest', 'B'.repeat(64), 1, []]) {
    assert.throws(() => encodeFrame({ ...base, action: 'get_run_failures', batch_id }),
      { code: 'STANDALONE_HISTORY_INVALID' });
  }
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
      return { ok: true, batch_token: 'c'.repeat(64), local_intake_pending: true,
        ipcAcknowledgement: Promise.resolve() };
    }
  }) });
  await service.admitSelectedSources([FIXTURE_SOURCE_A]);
  const queue = service.admittedQueue;
  const selection = service.selectionContext;
  for (const options of [{}, null, [], { processingMode: null },
    { processingMode: 'local_only' }, { processingMode: 'markdown-and-anonymize', productChannel: 'plugin' },
    { processingMode: 'markdown-and-anonymize', outputNamingMode: 'unknown' },
    { processingMode: 'markdown-only', outputNamingMode: 'neutral' }]) {
    const expected = options === null || Array.isArray(options) ? 'CONTENT_OPTIONS_INVALID'
      : Object.hasOwn(options, 'outputNamingMode') ? 'RESULT_NAMING_MODE_INVALID' : 'PROCESSING_MODE_INVALID';
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
  await service.admitSelectedSources([FIXTURE_SOURCE_A]);
  await service.startAdmittedBatch({ processingMode: 'markdown-only' });
  assert.strictEqual(workerOptions.processingMode, 'markdown-only', 'pure conversion is handed off without an anonymization fallback');
  assert.strictEqual(Object.hasOwn(workerOptions, 'outputNamingMode'), false);
  assert.strictEqual(launches, 2);
  await service.admitSelectedSources([FIXTURE_SOURCE_A]);
  await service.startAdmittedBatch({ processingMode: 'markdown-and-anonymize', outputNamingMode: 'source-with-suffix' });
  assert.strictEqual(workerOptions.outputNamingMode, 'source-with-suffix', 'the explicit readable-name choice crosses the service boundary');
  assert.strictEqual(launches, 3);
  const direct = new StandaloneApplicationService({ dependencies: fakeDependencies({
    startLocalIntakeExecutor(_queue, _profile, options) {
      assert.strictEqual(options.processingMode, 'markdown-and-anonymize', 'legacy direct calls stay explicitly anonymization-only');
      assert.strictEqual(options.outputNamingMode, 'neutral');
      return { ok: true, batch_token: 'c'.repeat(64), local_intake_pending: true,
        ipcAcknowledgement: Promise.resolve() };
    }
  }) });
  await direct.admitSelectedSources([FIXTURE_SOURCE_A]);
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
      return { ok: true, batch_token: 'c'.repeat(64), local_intake_pending: true,
        ipcAcknowledgement: Promise.resolve() };
    }
  });
  const service = new StandaloneApplicationService({ dependencies: deps });
  const admitted = await service.admitSelectedSources([FIXTURE_SOURCE_A, FIXTURE_SOURCE_B]);
  const catalogue = admitted.ui_context.source_catalogue;
  assert.strictEqual(admitted.ui_context.catalogue_revision, 1);
  assert.deepStrictEqual(catalogue.map(({ source_id, ...item }) => item), [
    { name: 'a.txt', bytes: 4, selectable: true, source_type: 'txt', ocr_required: null },
    { name: 'b.txt', bytes: 4, selectable: true, source_type: 'txt', ocr_required: null }
  ]);
  assert.ok(catalogue.every(item => /^[a-f0-9]{32}$/u.test(item.source_id)));
  assert.strictEqual(new Set(catalogue.map(item => item.source_id)).size, 2);
  assert.deepStrictEqual(admitted, {
    ok: true, event: 'selection_summarized', selected_count: 2, total_bytes: 8,
    direct_count: 2, convertible_count: 0, blocked_count: 0, encrypted_count: 0,
    ui_context: {
      ok: true,
      result_folder: FIXTURE_RESULT_ROOT,
      result_folder_status: 'available',
      result_folder_recorded: FIXTURE_RESULT_ROOT,
      latest_result_folder: FIXTURE_RESULT_RUN,
      result_folder_is_default: false,
      source_kind: 'files',
      source_folders: [FIXTURE_SOURCE_ROOT],
      selected_files: ['a.txt', 'b.txt'],
      catalogue_revision: 1,
      source_catalogue: catalogue,
      local_ui_only: true,
      external_disclosure: false
    },
    external_disclosure: false
  });
  assert.deepStrictEqual(service.uiContext(), {
    ok: true,
    result_folder: FIXTURE_RESULT_ROOT,
    result_folder_status: 'available',
    result_folder_recorded: FIXTURE_RESULT_ROOT,
    latest_result_folder: FIXTURE_RESULT_RUN,
    result_folder_is_default: false,
    source_kind: 'files',
    source_folders: [FIXTURE_SOURCE_ROOT],
    selected_files: ['a.txt', 'b.txt'],
    catalogue_revision: 1,
    source_catalogue: catalogue,
    local_ui_only: true,
    external_disclosure: false
  });
  assert.deepStrictEqual(service.removeAdmittedSource(0), {
    ok: true, event: 'selection_updated', selected_count: 1, total_bytes: 4,
    ui_context: {
      ok: true,
      result_folder: FIXTURE_RESULT_ROOT,
      result_folder_status: 'available',
      result_folder_recorded: FIXTURE_RESULT_ROOT,
      latest_result_folder: FIXTURE_RESULT_RUN,
      result_folder_is_default: false,
      source_kind: 'files',
      source_folders: [FIXTURE_SOURCE_ROOT],
      selected_files: ['b.txt'],
      catalogue_revision: 2,
      source_catalogue: [catalogue[1]],
      local_ui_only: true,
      external_disclosure: false
    },
    external_disclosure: false
  });
  assert.throws(() => service.removeAdmittedSource(1), (error) => error.code === 'STANDALONE_SELECTION_INVALID');
  assert.deepStrictEqual(await service.startAdmittedBatch(), {
    ok: true, event: 'batch_accepted', batch_id: 'c'.repeat(64), selected_count: 1, external_disclosure: false
  });
  assert.strictEqual(startedQueue.length, 1);
  assert.deepStrictEqual(service.uiContext().selected_files, ['b.txt'],
    'the local window keeps the last selection visible while the batch runs');

  const mixed = new StandaloneApplicationService({ dependencies: fakeDependencies() });
  const mixedResult = await mixed.admitSelectedSources([
    path.join(FIXTURE_SOURCE_ROOT, 'direct.md'),
    path.join(FIXTURE_SOURCE_ROOT, 'converted.docx')
  ]);
  assert.deepStrictEqual(
    { direct_count: mixedResult.direct_count, convertible_count: mixedResult.convertible_count,
      blocked_count: mixedResult.blocked_count, encrypted_count: mixedResult.encrypted_count },
    { direct_count: 1, convertible_count: 1, blocked_count: 0, encrypted_count: 0 }
  );
  await assert.rejects(service.startAdmittedBatch(), (error) => error.code === 'STANDALONE_NO_ADMISSION');
}

async function catalogueSelectionCase() {
  let launched = null, reservations = 0;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    validateSelectedPathAsync: async sourcePath => {
      if (sourcePath.endsWith('.zip')) { const error = Error('fixed'); error.code = 'SOURCE_FORMAT_UNSUPPORTED'; throw error; }
      return { sourcePath, sourceType: 'txt', sourceBytes: 4 };
    },
    reserveIntake: () => { reservations++; return { reservation_id: 'r'.repeat(32) }; },
    startLocalIntakeExecutor: queue => { launched = queue; return { ok: true, batch_token: 'e'.repeat(64),
      local_intake_pending: true, ipcAcknowledgement: Promise.resolve() }; }
  }) });
  const admission = await service.admitSelectedSources([FIXTURE_SOURCE_A, path.join(FIXTURE_SOURCE_ROOT, 'archive.zip')], 'files', undefined, { catalogue: true });
  const original = admission.ui_context;
  assert.strictEqual(original.source_catalogue.length, 2);
  assert.deepStrictEqual(original.source_catalogue[1], { name: 'archive.zip', selectable: false, reason_code: 'SOURCE_FORMAT_UNSUPPORTED' });
  assert.doesNotMatch(JSON.stringify(original.source_catalogue), /full|sourcePath|source_path/u);
  const added = (await service.admitSelectedSources([FIXTURE_SOURCE_B], 'files', undefined, { catalogue: true })).ui_context;
  assert.strictEqual(added.source_catalogue[0].source_id, original.source_catalogue[0].source_id);
  assert.strictEqual(added.catalogue_revision, original.catalogue_revision + 1);
  const id = added.source_catalogue.find(item => item.name === 'b.txt').source_id;
  for (const options of [
    { sourceIds: [id], catalogueRevision: original.catalogue_revision },
    { sourceIds: [id, id], catalogueRevision: added.catalogue_revision },
    { sourceIds: ['f'.repeat(32)], catalogueRevision: added.catalogue_revision },
    { sourceIds: [id] }, { catalogueRevision: added.catalogue_revision }
  ]) {
    await assert.rejects(service.startAdmittedBatch({ processingMode: 'markdown-only', ...options }), error => error.code === 'STANDALONE_SELECTION_INVALID');
  }
  assert.strictEqual(reservations, 0);
  await service.startAdmittedBatch({ processingMode: 'markdown-only', sourceIds: [id], catalogueRevision: added.catalogue_revision });
  assert.deepStrictEqual(launched.map(item => item.full), [FIXTURE_SOURCE_B]);
  assert.strictEqual(reservations, 1);
  assert.ok(service.deps.traces.every(event => !JSON.stringify(event).includes('archive.zip')));
}

async function removedCatalogueRevisionCase() {
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies() });
  const before = (await service.admitSelectedSources([FIXTURE_SOURCE_A, FIXTURE_SOURCE_B])).ui_context;
  service.removeAdmittedSource(0);
  const after = service.uiContext();
  assert.strictEqual(after.catalogue_revision, before.catalogue_revision + 1);
  await assert.rejects(service.startAdmittedBatch({ processingMode: 'markdown-only',
    sourceIds: [before.source_catalogue[1].source_id], catalogueRevision: before.catalogue_revision }), error => error.code === 'STANDALONE_SELECTION_INVALID');
  assert.deepStrictEqual(after.source_catalogue.map(item => item.source_id), [before.source_catalogue[1].source_id]);
}

async function catalogueProcessingEnvelopeCase() {
  let reservations = 0, madeResultRoot = 0, launched;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    enumerateSourceFolderAsync: async (_root, options) => {
      assert.strictEqual(options.maxSources, 1000);
      assert.strictEqual(options.maxTotalBytes, Number.MAX_SAFE_INTEGER);
      return Array.from({ length: 201 }, (_, index) => ({ sourcePath: path.join(FIXTURE_SOURCE_ROOT, `${index}.txt`),
        sourceType: 'txt', sourceBytes: 4 }));
    },
    reserveIntake: () => { reservations++; return { reservation_id: 'r'.repeat(32) }; },
    fs: { mkdirSync() { madeResultRoot++; } },
    startLocalIntakeExecutor: queue => { launched = queue; return { ok: true, batch_token: 'e'.repeat(64),
      local_intake_pending: true, ipcAcknowledgement: Promise.resolve() }; }
  }) });
  const before = (await service.admitSelectedSources([FIXTURE_SOURCE_ROOT], 'folder', undefined, { catalogue: true })).ui_context;
  assert.strictEqual(before.source_catalogue.length, 201, 'discovery must not apply the processing file limit');
  await assert.rejects(service.startAdmittedBatch({ processingMode: 'markdown-only' }), error => error.code === 'STANDALONE_SELECTION_INVALID');
  assert.strictEqual(reservations, 0); assert.strictEqual(madeResultRoot, 0);
  assert.deepStrictEqual(service.uiContext(), before, 'a rejected start preserves the catalogue and its revision');
  const selected = before.source_catalogue.slice(0, 200).map(item => item.source_id);
  await service.startAdmittedBatch({ processingMode: 'markdown-only', sourceIds: selected, catalogueRevision: before.catalogue_revision });
  assert.strictEqual(reservations, 1); assert.strictEqual(launched.length, 200);
}

async function catalogueByteEnvelopeCase() {
  let reservations = 0, launched;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    validateSelectedPathAsync: async sourcePath => ({ sourcePath, sourceType: 'docx',
      sourceBytes: Number(path.basename(sourcePath, '.docx')) < 7 ? 64 * 1024 * 1024 : sourcePath.endsWith('7.docx') ? 52 * 1024 * 1024 : 1 }),
    reserveIntake: () => { reservations++; return { reservation_id: 'r'.repeat(32) }; },
    startLocalIntakeExecutor: queue => { launched = queue; return { ok: true, batch_token: 'e'.repeat(64),
      local_intake_pending: true, ipcAcknowledgement: Promise.resolve() }; }
  }) });
  const before = (await service.admitSelectedSources(Array.from({ length: 9 }, (_, index) =>
    path.join(FIXTURE_SOURCE_ROOT, `${index}.docx`)), 'files', undefined, { catalogue: true })).ui_context;
  const sourceIds = before.source_catalogue.map(item => item.source_id);
  await assert.rejects(service.startAdmittedBatch({ processingMode: 'markdown-only', sourceIds,
    catalogueRevision: before.catalogue_revision }), error => error.code === 'STANDALONE_SELECTION_INVALID');
  assert.strictEqual(reservations, 0);
  await service.startAdmittedBatch({ processingMode: 'markdown-only', sourceIds: sourceIds.slice(0, 8), catalogueRevision: before.catalogue_revision });
  assert.strictEqual(launched.length, 8); assert.strictEqual(reservations, 1);
  assert.strictEqual(launched.reduce((total, item) => total + item.sourceBytes, 0), 500 * 1024 * 1024);
}

async function catalogueLimitAtomicityCase() {
  let entries = [];
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    enumerateSourceFolderAsync: async () => entries
  }) });
  const before = (await service.admitSelectedSources([FIXTURE_SOURCE_A], 'files', undefined, { catalogue: true })).ui_context;
  for (const [amount, labelPrefix] of [[1000, ''], [300, 'x'.repeat(1000) + '/']]) {
    entries = Array.from({ length: amount }, (_, index) => ({ sourcePath: path.join(FIXTURE_SOURCE_ROOT, `${index}.txt`),
      sourceType: 'txt', sourceBytes: 4, sourceLabel: `${labelPrefix}${index}.txt` }));
    await assert.rejects(service.admitSelectedSources([FIXTURE_SOURCE_ROOT], 'folder', undefined, { catalogue: true }),
      error => error.code === 'SOURCE_FOLDER_FILE_LIMIT');
    assert.deepStrictEqual(service.uiContext(), before, 'count and transport-budget rejection are both atomic');
  }
}

async function catalogueCompleteResponseBudgetCase() {
  const { MAX_CATALOGUE_METADATA_BYTES } = require('../plugins/data-secure/server/standalone/catalogue-limits');
  const responseBytes = result => Buffer.byteLength(JSON.stringify({
    schema: 'datasecure-standalone-private-response/1', request_id: '0'.repeat(64), ok: true, result
  }), 'utf8');
  const longLabel = Array.from({ length: 4 }, () => '測'.repeat(240)).join('/') + '/meta';
  const ignored = Array.from({ length: 200 }, (_, index) => ({ name: `${longLabel}${index}`,
    reason_code: 'SOURCE_ARTIFACT_IGNORED' }));
  const makeService = labels => new StandaloneApplicationService({ dependencies: fakeDependencies({
    enumerateSourceFolderAsync: async (_root, options) => {
      for (const item of labels) options.onIgnoredArtifact(item.reason_code, item.name);
      return [{ sourcePath: FIXTURE_SOURCE_B, sourceType: 'txt', sourceBytes: 4 }];
    }
  }) });
  const calibration = makeService([]);
  await calibration.admitSelectedSources([FIXTURE_SOURCE_A], 'files', undefined, { catalogue: true });
  const core = await calibration.admitSelectedSources([FIXTURE_SOURCE_ROOT], 'folder', undefined, { catalogue: true });
  let below = 0;
  while (below < ignored.length && responseBytes({ ...core, ignored_artifact_count: below + 1,
    ignored_artifacts: ignored.slice(0, below + 1) }) <= MAX_CATALOGUE_METADATA_BYTES) below++;
  assert.ok(below > 0 && below < 200, 'the fixture straddles the complete-response budget');
  for (const count of [below, below + 1, 200]) {
    const service = makeService(ignored.slice(0, count));
    const before = (await service.admitSelectedSources([FIXTURE_SOURCE_A], 'files', undefined, { catalogue: true })).ui_context;
    if (count === below) {
      const result = await service.admitSelectedSources([FIXTURE_SOURCE_ROOT], 'folder', undefined, { catalogue: true });
      assert.ok(responseBytes(result) <= MAX_CATALOGUE_METADATA_BYTES);
      assert.ok(responseBytes(result) > MAX_CATALOGUE_METADATA_BYTES - 4000, 'exercise the near-boundary response');
      assert.strictEqual(result.ignored_artifacts.length, count, 'accepted metadata is not silently truncated');
      assert.ok(responseBytes(result) < MAX_FRAME_BYTES);
    } else {
      await assert.rejects(service.admitSelectedSources([FIXTURE_SOURCE_ROOT], 'folder', undefined, { catalogue: true }),
        error => error.code === 'SOURCE_FOLDER_FILE_LIMIT');
      assert.deepStrictEqual(service.uiContext(), before, 'ignored Unicode labels must be budgeted before any admission commit');
      assert.strictEqual(service.sourceIds.size, 1);
    }
  }
}

async function consumedCatalogueCase() {
  for (const lostAcknowledgement of [false, true]) {
    const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
      validateSelectedPathAsync: async sourcePath => {
        if (sourcePath.endsWith('.zip')) throw Object.assign(Error('fixed'), { code: 'SOURCE_FORMAT_UNSUPPORTED' });
        return { sourcePath, sourceType: 'txt', sourceBytes: 4 };
      },
      startLocalIntakeExecutor: () => ({ ok: true, batch_token: 'e'.repeat(64), local_intake_pending: true,
        ipcAcknowledgement: lostAcknowledgement ? Promise.reject(Error('ACK_LOST')) : Promise.resolve() })
    }) });
    const before = (await service.admitSelectedSources([FIXTURE_SOURCE_A,
      path.join(FIXTURE_SOURCE_ROOT, 'old.zip')], 'files', undefined, { catalogue: true })).ui_context;
    const start = service.startAdmittedBatch({ processingMode: 'markdown-only',
      sourceIds: [before.source_catalogue[0].source_id], catalogueRevision: before.catalogue_revision });
    if (lostAcknowledgement) await assert.rejects(start, error => error.code === 'STANDALONE_START_FAILED');
    else await start;
    assert.strictEqual(service.admittedQueue, null);
    assert.strictEqual(service.sourceIds.size, 0);
    assert.strictEqual(service.rejectedSources.size, 0);
    assert.strictEqual(service.uiContext().catalogue_revision, before.catalogue_revision + 1);
    assert.deepStrictEqual(service.uiContext().source_catalogue, []);
    assert.deepStrictEqual(service.uiContext().selected_files, ['a.txt'], 'the current run retains display-only context');
    const next = (await service.admitSelectedSources([FIXTURE_SOURCE_B], 'files', undefined, { catalogue: true })).ui_context;
    assert.deepStrictEqual(next.source_catalogue.map(item => item.name), ['b.txt']);
    assert.strictEqual(service.sourceIds.size, 1);
    await assert.rejects(service.startAdmittedBatch({ processingMode: 'markdown-only',
      sourceIds: [before.source_catalogue[0].source_id], catalogueRevision: before.catalogue_revision }),
    error => error.code === 'STANDALONE_SELECTION_INVALID');
  }
}

async function clearLastAdmittedSourceCase() {
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies() });
  await service.admitSelectedSources([FIXTURE_SOURCE_A]);
  const cleared = service.removeAdmittedSource(0);
  assert.strictEqual(cleared.selected_count, 0);
  assert.deepStrictEqual(cleared.ui_context.selected_files, []);
  assert.deepStrictEqual(cleared.ui_context.source_folders, []);
  await assert.rejects(service.startAdmittedBatch(), (error) => error.code === 'STANDALONE_NO_ADMISSION');
}

async function realAdmissionAdapterCase() {
  const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-real-admission-'));
  const nested = path.join(root, 'nested');
  fs.mkdirSync(nested);
  const first = path.join(root, 'first.txt');
  const second = path.join(nested, 'second.txt');
  const third = path.join(nested, 'first.txt');
  fs.writeFileSync(first, 'first local test');
  fs.writeFileSync(second, 'second local test');
  fs.writeFileSync(third, 'third local test');
  try {
    const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
      validateSelectedPathAsync,
      enumerateSourceFolderAsync,
      batchQueueFromSelection
    }) });
    const admittedFiles = await service.admitSelectedSources([first, second], 'files');
    assert.deepStrictEqual(admittedFiles.ui_context.source_folders.sort(), [root, nested].sort());
    assert.deepStrictEqual(admittedFiles.ui_context.selected_files.sort(), ['first.txt', 'second.txt']);
    const duplicate = await service.admitSelectedSources([first], 'files');
    assert.strictEqual(duplicate.selected_count, 2);
    assert.strictEqual(duplicate.already_selected_count, 1);
    const appended = await service.admitSelectedSources([third], 'files');
    assert.strictEqual(appended.selected_count, 3);
    assert.strictEqual(new Set(appended.ui_context.selected_files).size, 3,
      'same-basename additions must get distinct visible and export labels');
    assert.strictEqual(service.admittedQueue.length, 3);
    service.cancelAdmission();
    const admittedFolder = await service.admitSelectedSources([root], 'folder');
    assert.deepStrictEqual(admittedFolder.ui_context.source_folders, [root]);
    assert.strictEqual(admittedFolder.selected_count, 3);
    const late = path.join(root, 'late.txt');
    fs.writeFileSync(late, 'added after the folder picker');
    const mixed = await service.admitSelectedSources([second, late], 'files');
    assert.strictEqual(mixed.selected_count, 4);
    assert.strictEqual(mixed.already_selected_count, 1,
      'folder-to-file additions must skip paths already present in the folder');
    assert.strictEqual(mixed.ui_context.source_kind, 'folder');
    assert.deepStrictEqual(mixed.ui_context.source_folders, [root]);
    await assert.rejects(service.admitSelectedSources([path.join(root, 'missing.txt')], 'files'));
    assert.strictEqual(service.admittedQueue.length, 4,
      'an invalid addition must leave the previous prepared selection intact');
    assert.strictEqual(service.removeAdmittedSource(3).selected_count, 3);
    assert.ok(service.admittedQueue.every((item) => path.isAbsolute(item.full) &&
      path.basename(item.full) === item.name && Number.isSafeInteger(item.sourceBytes)));
    await service.startAdmittedBatch();
    const nextRun = await service.admitSelectedSources([second], 'files');
    assert.strictEqual(nextRun.selected_count, 1, 'a completed admission never becomes part of the next run');
    assert.strictEqual(nextRun.ui_context.source_kind, 'files');
    assert.deepStrictEqual(nextRun.ui_context.source_folders, [nested],
      'a fresh admission never inherits source folders from the preceding run');
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
      return { ok: true, batch_token: 'c'.repeat(64), local_intake_pending: true,
        ipcAcknowledgement: Promise.resolve() };
    }
  }) });
  await assert.rejects(
    service.admitSelectedSources([FIXTURE_SOURCE_A, FIXTURE_SOURCE_B]),
    (error) => error.code === 'STANDALONE_SELECTION_INVALID'
  );
  await assert.rejects(service.startAdmittedBatch(), (error) => error.code === 'STANDALONE_NO_ADMISSION');
  assert.strictEqual(started, false, 'an oversized aggregate selection never reaches the worker');
  const first = await service.admitSelectedSources([FIXTURE_SOURCE_A]);
  assert.strictEqual(first.selected_count, 1);
  await assert.rejects(service.admitSelectedSources([FIXTURE_SOURCE_B]),
    (error) => error.code === 'STANDALONE_SELECTION_INVALID');
  assert.deepStrictEqual(service.uiContext().selected_files, ['a.txt'],
    'a cumulative size violation must not erase the original admission');
  assert.strictEqual(service.admittedQueue.length, 1);
}

async function uncertainAdmissionStartCase() {
  let starts = 0;
  let releases = 0;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    releaseIntake: () => { releases += 1; },
    startLocalIntakeExecutor: () => {
      starts += 1;
      return { ok: true, batch_token: 'c'.repeat(64), local_intake_pending: true,
        ipcAcknowledgement: Promise.reject(new Error('ACK_LOST')) };
    }
  }) });
  await service.admitSelectedSources([FIXTURE_SOURCE_A]);
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
    await service.admitSelectedSources([FIXTURE_SOURCE_A]);
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

async function networkResultFolderNoticeCase() {
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    isNetworkResultFolder: (selected) => selected === '\\\\server\\share'
  }) });
  assert.deepStrictEqual(await service.configureResults({ path: '\\\\server\\share' }), {
    ok: true, configuration_changed: true, result_folder: '\\\\server\\share',
    network_folder_notice: true, export_replay_pending: false,
    local_ui_only: true, external_disclosure: false
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
  const run = FIXTURE_RESULT_RUN;
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
  const run = FIXTURE_RESULT_RUN;
  const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
    latestProductResultDirectory: () => run,
    fs: { mkdirSync() {}, existsSync: () => true },
    revealFile: (target) => { opened.push(target); return { ok: true }; }
  }) });
  assert.deepStrictEqual(await service.openLedger(), {
    ok: true, handoff_confirmed: true, external_disclosure: false
  });
  assert.deepStrictEqual(opened, [path.join(run, 'DataSecure-Zuordnung.csv')]);
}

function privateTargetResolutionCase() {
  const run = FIXTURE_RESULT_RUN;
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
    ok: true, target_kind: 'file', local_path: path.join(run, 'DataSecure-Zuordnung.csv'), external_disclosure: false
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
  await testAsync('v2 catalogue names regular rejected files, preserves IDs and starts only a fresh owned subset', catalogueSelectionCase);
  await testAsync('v2 discovery admits 201 files but enforces the processing envelope before any mutation', catalogueProcessingEnvelopeCase);
  await testAsync('v2 starts only an owned subset within the 500 MiB processing envelope', catalogueByteEnvelopeCase);
  await testAsync('v2 catalogue count and IPC projection budgets preserve the previous admission atomically', catalogueLimitAtomicityCase);
  await testAsync('the complete admission response budgets Unicode artifact labels and its IPC envelope atomically', catalogueCompleteResponseBudgetCase);
  await testAsync('confirmed and uncertain starts consume all catalogue IDs and rejected entries before the next admission', consumedCatalogueCase);
  await testAsync('legacy removal invalidates catalogue revisions without changing surviving source IDs', removedCatalogueRevisionCase);
  await testAsync('processing purpose is rejected before mutations and never silently falls back', processingModeServiceCase);
  await testAsync('prepared selections extend transactionally without duplicate files or ambiguous labels', realAdmissionAdapterCase);
  await testAsync('prepared selections remove one item or clear the final item before Start', clearLastAdmittedSourceCase);
  await testAsync('native desktop admission enforces the aggregate 500 MB limit', oversizedAdmissionCase);
  await testAsync('a missing worker acknowledgement consumes the admission exactly once', uncertainAdmissionStartCase);
  await testAsync('an incomplete worker start contract consumes the admission and fails closed', invalidAdmissionStartContractCase);
  await testAsync('a saved result folder remains successful when export replay is deferred', resultFolderReplayFailureCase);
  await testAsync('result configuration refuses live post-processing workers before native provisioning', async () => {
    const calls = [];
    const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
      localWorkerActive: () => true,
      saveConfiguredResultRoot() { calls.push('save'); },
      resultOutputDirectory() { calls.push('mkdir'); }
    }) });
    await assert.rejects(service.configureResults({ path: FIXTURE_RESULT_ROOT,
      prepareNativeExport: async () => { calls.push('native'); } }), { code: 'STANDALONE_BUSY' });
    assert.deepEqual(calls, []);
    assert.equal(service.interactionActive, false);
  });
  await testAsync('native destination provisioning is inside the service interaction and precedes the exact saved binding', async () => {
    let release;
    const calls = [], binding = { sentinel: 'exact native binding' };
    const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
      localWorkerActive: () => false,
      saveConfiguredResultRoot(selected, options) { assert.equal(selected, FIXTURE_RESULT_ROOT);
        assert.equal(options.nativeExport, binding); calls.push('save'); }
    }) });
    const configured = service.configureResults({ path: FIXTURE_RESULT_ROOT,
      prepareNativeExport: () => { calls.push('native'); return new Promise(resolve => { release = resolve; }); } });
    assert.equal(service.interactionActive, true);
    await assert.rejects(service.configureResults({ path: FIXTURE_RESULT_ROOT }), { code: 'STANDALONE_BUSY' });
    assert.deepEqual(calls, ['native']);
    release(binding);
    assert.equal((await configured).configuration_changed, true);
    assert.deepEqual(calls, ['native', 'save']);
    assert.equal(service.interactionActive, false);
  });
  await testAsync('work appearing during folder selection or native provisioning cannot commit a new destination', async () => {
    for (const phase of ['selection', 'provision']) {
      let release, busy = false;
      const calls = [];
      const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
        localWorkerActive: () => busy,
        pickFolderAsync: () => new Promise(resolve => { release = () => resolve(FIXTURE_RESULT_ROOT); }),
        saveConfiguredResultRoot() { calls.push('save'); },
        resultOutputDirectory() { calls.push('mkdir'); }
      }) });
      const configured = service.configureResults({ ...(phase === 'provision' ? { path: FIXTURE_RESULT_ROOT } : {}),
        prepareNativeExport: () => { calls.push('native'); return new Promise(resolve => { release = resolve; }); } });
      busy = true; release();
      await assert.rejects(configured, { code: 'STANDALONE_BUSY' });
      assert.deepEqual(calls, phase === 'provision' ? ['native'] : []);
      assert.equal(service.interactionActive, false);
    }
  });
  await testAsync('native destination refusal leaves interaction reusable and settings unchanged', async () => {
    let saved = 0;
    const service = new StandaloneApplicationService({ dependencies: fakeDependencies({ saveConfiguredResultRoot() { saved++; } }) });
    await assert.rejects(service.configureResults({ path: FIXTURE_RESULT_ROOT,
      prepareNativeExport: async () => { throw Object.assign(Error('refused'), { code: 'AI_EXPORT_CONFLICT' }); } }),
    { code: 'AI_EXPORT_CONFLICT' });
    assert.equal(saved, 0); assert.equal(service.interactionActive, false);
    assert.equal((await service.configureResults({ path: FIXTURE_RESULT_ROOT })).configuration_changed, true);
    assert.equal(saved, 1);
  });
  await testAsync('configured-root preparation holds the interaction through native acknowledgement without another picker', async () => {
    let release;
    const snapshot = { root: FIXTURE_RESULT_ROOT, setting_sha256: 'a'.repeat(64) };
    const binding = { sentinel: 'native saved-root binding' }, calls = [];
    const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
      prepareConfiguredNativeExportBinding: async prepare => {
        calls.push('snapshot'); const result = await prepare(snapshot); calls.push('commit'); return result;
      },
      pickFolderAsync: () => { throw Error('UNREQUESTED_PICKER'); }
    }) });
    const pending = service.prepareConfiguredExportRoot(value => {
      assert.equal(value, snapshot); calls.push('native'); return new Promise(resolve => { release = resolve; });
    });
    assert.equal(service.interactionActive, true);
    await assert.rejects(service.configureResults(), { code: 'STANDALONE_BUSY' });
    await assert.rejects(service.prepareConfiguredExportRoot(() => binding), { code: 'STANDALONE_BUSY' });
    assert.deepEqual(calls, ['snapshot', 'native']);
    release(binding); assert.equal(await pending, binding);
    assert.deepEqual(calls, ['snapshot', 'native', 'commit']);
    assert.equal(service.interactionActive, false);
  });
  for (const phase of ['before', 'after']) for (const busyKind of ['worker', 'intake', 'batch'])
    await testAsync(`configured-root preparation refuses ${busyKind} work ${phase} native acknowledgement`, async () => {
      let busy = phase === 'before', release, committed = false, prepared = 0;
      const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
        lightweightStatus: () => ({ local_intake_pending: busy && busyKind === 'intake',
          batch_processing_active: busy && busyKind === 'batch' }),
        localWorkerActive: () => busy && busyKind === 'worker',
        prepareConfiguredNativeExportBinding: async prepare => {
          const result = await prepare({ root: FIXTURE_RESULT_ROOT }); committed = true; return result;
        }
      }) });
      const pending = service.prepareConfiguredExportRoot(() => {
        prepared++; return new Promise(resolve => { release = resolve; });
      });
      if (phase === 'after') { busy = true; release({ sentinel: 'native binding' }); }
      await assert.rejects(pending, { code: 'STANDALONE_BUSY' });
      assert.equal(prepared, phase === 'after' ? 1 : 0); assert.equal(committed, false);
      assert.equal(service.interactionActive, false);
    });
  await testAsync('configured-root native refusal releases interaction without committing or masking its error', async () => {
    let committed = false;
    const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
      prepareConfiguredNativeExportBinding: async prepare => {
        const result = await prepare({ root: FIXTURE_RESULT_ROOT }); committed = true; return result;
      }
    }) });
    await assert.rejects(service.prepareConfiguredExportRoot(async () => {
      throw Object.assign(Error('native refusal'), { code: 'AI_EXPORT_VOLUME_UNSUPPORTED' });
    }), { code: 'AI_EXPORT_VOLUME_UNSUPPORTED' });
    assert.equal(committed, false); assert.equal(service.interactionActive, false);
    assert.deepEqual(await service.prepareConfiguredExportRoot(async () => ({ retry: true })), { retry: true });
  });
  await testAsync('a network result folder remains allowed and produces a visible notice', networkResultFolderNoticeCase);
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
  await testAsync('production root and selection display performs no historical observation or result resolution', async () => {
    let observations = 0, resolutions = 0;
    const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
      publicStatusSnapshot() { observations++; throw Error('UNREQUESTED_HISTORY_STATUS'); },
      runHistory: { resolveResults() { resolutions++; throw Error('UNREQUESTED_HISTORY_RESULT'); } }
    }) });
    service.observedBatchId = 'a'.repeat(64);
    const context = service.uiContext();
    assert.strictEqual(context.latest_result_folder, '');
    assert.strictEqual(observations, 0);
    assert.strictEqual(resolutions, 0);
    assert.ok(context.result_folder, 'the configured/default result root is still described');
  });
  await testAsync('production folder choice captures bindings without projecting every historical result', async () => {
    const calls = [];
    const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
      runHistory: { captureExistingExportBindings() { calls.push('capture'); },
        captureDurableHistory() { throw Error('INTERACTIVE_JOURNAL_CAPTURE'); },
        history() { throw Error('GLOBAL_HISTORY_PROJECTION'); } },
      saveConfiguredResultRoot() { calls.push('save'); },
      replayPendingResultExports() { calls.push('pending'); return { pending: 0 }; }
    }) });
    const result = await service.configureResults({ path: 'C:\\New Results' });
    assert.strictEqual(result.configuration_changed, true);
    assert.deepStrictEqual(calls, ['capture', 'save', 'pending']);
  });
  await testAsync('a failed historical result binding preserves the configured folder and releases the interaction', async () => {
    const calls = [];
    const service = new StandaloneApplicationService({ dependencies: fakeDependencies({
      runHistory: { captureExistingExportBindings(options) {
        assert.deepEqual(options, { requireCurrentBindings: true });
        calls.push('capture'); throw Object.assign(new Error('synthetic private storage refusal'), { code: 'EACCES' });
      } },
      saveConfiguredResultRoot() { calls.push('save'); },
      resultOutputDirectory() { calls.push('mkdir'); }
    }) });
    await assert.rejects(service.configureResults({ path: FIXTURE_RESULT_ROOT }),
      { code: 'STANDALONE_RESULT_BINDING_UNAVAILABLE' });
    assert.deepEqual(calls, ['capture']);
    assert.equal(service.interactionActive, false);
  });
  done();
})();
