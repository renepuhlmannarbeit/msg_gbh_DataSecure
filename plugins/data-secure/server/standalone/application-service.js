'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { RESOURCE_LIMITS } = require('../resource-limits');
const { ownershipErrorCode, observeOwnershipOutcome } = require('../core/ownership-diagnostics');
const { MODES, assertRunnableProcessingMode } = require('../core/processing-mode');
const { assertLegacyContentOperation } = require('../core/content-options');
const { isAnonymizationOcrOmission, isAnonymizationPrivacyStop } = require('./conversion-feedback');
const { MODES: RESULT_NAMING_MODES, validateResultNamingMode } = require('../core/result-naming-mode');
const { batchNextAction } = require('../core/batch-next-action');
const { MAX_CATALOGUE_SOURCES, MAX_CATALOGUE_METADATA_BYTES } = require('./catalogue-limits');

const PRODUCT_CHANNEL = 'standalone';
const VISIBLE_MAPPING_FILE = 'DataSecure-Zuordnung.csv';
const SOURCE_KINDS = new Set(['files', 'folder']);
const PROFILES = new Set(['auto', 'customer', 'applicant', 'personnel_profile', 'contract', 'general']);
const CONVERSION_TYPES = ['txt', 'md', 'csv', 'docx', 'xlsx', 'pptx', 'pdf', 'png', 'jpeg', 'bmp'];
const DIRECT_MARKDOWN_TYPES = new Set(['.txt', '.md', '.markdown', '.csv']);
function catalogueProjection(queue, sourceIds, rejectedSources) {
  return (queue || []).map(item => ({
    source_id: sourceIds.get(selectedPathIdentity(item.full)),
    name: item.sourceLabel || item.name, bytes: item.sourceBytes,
    selectable: true, source_type: path.extname(item.name).slice(1).toLowerCase(),
    ocr_required: ['.png', '.jpeg', '.jpg', '.bmp'].includes(path.extname(item.name).toLowerCase()) ? true : null
  })).concat([...rejectedSources.values()].map(item => ({
    name: item.name, selectable: false, reason_code: item.reason_code
  })));
}
const SELECTION_REASON_CODES = new Set(['SOURCE_FORMAT_SIZE_LIMIT', 'SOURCE_FILE_EMPTY',
  'SOURCE_FORMAT_UNSUPPORTED', 'SOURCE_READ_FAILED', 'SOURCE_ACCESS_DENIED',
  'SOURCE_PATH_UNSAFE', 'SOURCE_IDENTITY_CHANGED', 'SOURCE_ARTIFACT_IGNORED']);
const REVIEW_START_FAILURE_CODES = new Set(['LOCAL_REVIEW_START_MISSING',
  'LOCAL_REVIEW_START_DENIED', 'LOCAL_REVIEW_START_ARCHITECTURE', 'LOCAL_REVIEW_START_FAILED']);
let standaloneStartup;

function validateChoice(value, allowed, fallback) {
  const selected = value || fallback;
  if (!allowed.has(selected)) throw Object.assign(new Error('Ungültige lokale Auswahl.'), { code: 'STANDALONE_ARGUMENT_INVALID' });
  return selected;
}

function admissionCounts(queue) {
  const direct = queue.filter((item) => DIRECT_MARKDOWN_TYPES.has(path.extname(item.name).toLowerCase())).length;
  return { direct_count: direct, convertible_count: queue.length - direct, blocked_count: 0, encrypted_count: 0 };
}

function standaloneDataRoot(options = {}) {
  const platform = options.platform || process.platform;
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const environment = options.environment || process.env;
  if (platform === 'win32' && environment.DATASECURE_NATIVE_EXPORT_CHANNEL === '1') {
    const bound = environment.DATASECURE_STANDALONE_NAMESPACE_ROOT;
    // Native bootstrap provisions and pins this exact drive-absolute root.
    // No fallback to a differently virtualized LOCALAPPDATA or JS mkdir.
    if (typeof bound !== 'string' || !/^[a-z]:[\\/]/iu.test(bound) ||
        bound.includes('\0') || pathApi.basename(bound).toLowerCase() !== 'securedatamsg-standalone' ||
        pathApi.resolve(bound) !== bound) {
      throw fixedFailure('STANDALONE_DATA_ROOT_UNSAFE', 'Der lokale DataSecure-Bereich ist nicht sicher.');
    }
    return bound;
  }
  const home = options.home || os.homedir();
  const base = platform === 'win32'
    ? String(environment.LOCALAPPDATA || pathApi.join(home, 'AppData', 'Local'))
    : platform === 'darwin'
      ? pathApi.join(home, 'Library', 'Application Support')
      : String(environment.XDG_DATA_HOME || pathApi.join(home, '.local', 'share'));
  return pathApi.join(base, 'SecureDataMsg-Standalone');
}

function defaultResultRoot(options = {}) {
  const environment = options.environment || process.env;
  const documents = options.documentsDir || environment.DATASECURE_STANDALONE_DOCUMENTS_DIR ||
    path.join(options.home || os.homedir(), 'Documents');
  return path.join(documents, 'SecureDataMsg');
}

function assertNativeStandaloneNamespace(privateRoot, options) {
  if (process.env.DATASECURE_NATIVE_EXPORT_CHANNEL !== '1' || !['win32', 'darwin'].includes(process.platform)) return;
  const { withOwnershipControl } = require('../core/ownership-control');
  const { desktopErrorCode } = require('../core/desktop-error-contract');
  try { options.startupDiagnostic?.('ownership_control_check_started', { outcome: 'started' }); }
  catch { /* optional diagnostic only */ }
  try { withOwnershipControl(privateRoot, guard => guard.assertHeld()); }
  catch (error) {
    const code = desktopErrorCode(error?.code);
    try { options.startupDiagnostic?.('ownership_control_check_failed', { outcome: 'failed', error_code: code }); }
    catch { /* refusal remains authoritative */ }
    throw fixedFailure(code, 'Die lokale Prozessabsicherung konnte nicht bestätigt werden. Bitte die Diagnose und das vollständige App-Paket prüfen.');
  }
  try { options.startupDiagnostic?.('ownership_control_check_finished', { outcome: 'ready' }); }
  catch { /* optional diagnostic only */ }
}

function activateStandaloneNamespace(options = {}) {
  const environment = options.environment || process.env;
  const platform = options.platform || process.platform;
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const root = pathApi.resolve(options.dataRoot || standaloneDataRoot(options));
  const io = options.fs || fs;
  const workspace = pathApi.join(root, 'workspace');
  const sameIdentity = (left, right) => Boolean(left && right && left.dev === right.dev && left.ino === right.ino);
  if (process.platform === 'darwin' && process.env.DATASECURE_NATIVE_EXPORT_CHANNEL === '1') {
    try { require('../core/ownership-control').assertNativeOwnershipRuntime(); }
    catch (error) {
      throw fixedFailure(require('../core/desktop-error-contract').desktopErrorCode(error?.code),
        'Die lokale Prozessabsicherung konnte nicht bestätigt werden. Bitte das vollständige App-Paket prüfen.');
    }
  }
  try {
    if (!(platform === 'win32' && process.env.DATASECURE_NATIVE_EXPORT_CHANNEL === '1')) {
      io.mkdirSync(root, { recursive: true, mode: 0o700 });
    }
    const named = io.lstatSync(root);
    const opened = io.statSync(root);
    const real = io.realpathSync.native ? io.realpathSync.native(root) : io.realpathSync(root);
    const realOpened = io.statSync(real);
    const comparable = (value) => platform === 'win32' ? pathApi.resolve(value).toLowerCase() : pathApi.resolve(value);
    // Windows may transparently virtualize LOCALAPPDATA for a packaged desktop
    // process. In that case the visible path and native realpath differ although
    // both handles identify the same directory. Reject links and identity
    // changes, but do not reject this legitimate path spelling difference.
    const redirectedOutsideWindows = platform !== 'win32' && comparable(real) !== comparable(root);
    if (!named.isDirectory() || named.isSymbolicLink() || !opened.isDirectory() ||
        !realOpened.isDirectory() || !sameIdentity(named, opened) ||
        !sameIdentity(opened, realOpened) || redirectedOutsideWindows) {
      throw fixedFailure('STANDALONE_DATA_ROOT_UNSAFE', 'Der lokale DataSecure-Bereich ist nicht sicher.');
    }
  } catch (error) {
    if (error?.code === 'STANDALONE_DATA_ROOT_UNSAFE') throw error;
    throw fixedFailure('STANDALONE_DATA_ROOT_UNSAFE', 'Der lokale DataSecure-Bereich ist nicht sicher.');
  }
  // A native desktop must establish ownership before creating any workspace
  // child or loading history/recovery. Windows mkdir(mode:0700) does not set a
  // private DACL; the native host provisions missing roots separately. Never
  // repair an unsafe existing namespace or downgrade to the source adapter.
  assertNativeStandaloneNamespace(root, options);
  try {
    io.mkdirSync(workspace, { recursive: true, mode: 0o700 });
    const workspaceStat = io.lstatSync(workspace);
    const workspaceOpened = io.statSync(workspace);
    if (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink() ||
        !workspaceOpened.isDirectory() || !sameIdentity(workspaceStat, workspaceOpened)) {
      throw fixedFailure('STANDALONE_DATA_ROOT_UNSAFE', 'Der lokale DataSecure-Bereich ist nicht sicher.');
    }
  } catch (error) {
    if (error?.code === 'STANDALONE_DATA_ROOT_UNSAFE') throw error;
    throw fixedFailure('STANDALONE_DATA_ROOT_UNSAFE', 'Der lokale DataSecure-Bereich ist nicht sicher.');
  }
  environment.EU_PRIVACY_DATA_ROOT = root;
  environment.EU_PRIVACY_ROOT = workspace;
  environment.DATASECURE_PRODUCT_CHANNEL = PRODUCT_CHANNEL;
  return root;
}

function defaultDependencies(options = {}) {
  // Namespace selection must happen before any gateway module is loaded. This
  // makes Standalone journals, settings, review data and exports invisible to
  // the optional Claude/MCP product even when both are installed.
  const privateRoot = activateStandaloneNamespace(options);
  const { createRunHistory } = require('./run-history');
  const filePicker = require('../companion/file-picker');
  const sourceFolder = require('../companion/source-folder');
  const resultFolder = require('../gateway/result-folder-config');
  const supportTrace = require('../gateway/support-trace');
  const { replayPendingResultExports, readStandaloneExportHistory, readStandaloneExportHistoryEntry, abandonPendingResultExport } = require('../gateway/result-export');
  const {
    continueMostRecentBatch, openBatchPackageProtection, recoverBatches,
    replayMappingOutbox, cleanupExpiredBatchSnapshots, recoverableBatchStatus, productStatusSnapshot,
    latestProductBatchStatus, latestProductResultDirectory, readStandaloneHistoryStates, readStandaloneHistoryState,
    standaloneRecoverableStates, continueStandaloneBatch, requestStandalonePause, skipStandaloneOcrContactReview,
    exportCompletedBatchResults
  } = require('../gateway/batch');
  const { cleanupLocalData } = require('../gateway/retention');
  const { initializeProduct } = require('../core/product-bootstrap');
  const { assertRootSeparation, rootSeparationFailure } = require('../gateway/root-boundary');
  const { verifyBundledRuntime, refuseStartup } = require('../gateway/startup-guard');
  const { migrateLegacyAuditReceipts } = require('../gateway/audit');
  const { cleanupCompanionJobs } = require('../companion/retention');
  const { cleanupAbandonedWorkingJobs } = require('../gateway/orchestrator');
  const { startBatchMaintenance } = require('../gateway/batch-maintenance');
  const batchExecutor = require('../gateway/batch-executor');
  // Diagnostics are optional and must never affect the product transaction.
  const startupEvent = (event, fields) => { try { options.startupDiagnostic?.(event, fields); } catch {} };
  const { recordWorkflowEvent } = require('../gateway/workflow-diagnostics');
  const { desktopErrorCode, DESKTOP_ERROR_CODES } = require('../core/desktop-error-contract');
  const { WORKFLOW_ERROR_CODES } = require('../gateway/diagnostic-causes');
  const { REASON_CODES } = require('../core/document-result-grade');
  const workerCodes = new Set([...DESKTOP_ERROR_CODES, ...WORKFLOW_ERROR_CODES, ...REASON_CODES]);
  const { types } = require('node:util');
  const workerPhases = new Set(['item_epoch_release', 'registry_finalize', 'local_delivery_verify', 'executor_lease_release', 'processing', 'result_export_prepare', 'result_export_claim', 'result_export_plan', 'result_export_copy', 'result_export_claim_release']);
  const workerDiagnostics = (executorOptions = {}) => {
    const recorder = typeof executorOptions.recordWorkflowEvent === 'function'
      ? executorOptions.recordWorkflowEvent : recordWorkflowEvent;
    return { ...executorOptions, recordWorkflowEvent(record) {
      let recorded = false;
      try { recorded = recorder(record); } catch { /* keep both sinks best-effort */ }
      try {
        if (!record || typeof record !== 'object' || types.isProxy(record)) return recorded;
        const field = key => Object.getOwnPropertyDescriptor(record, key)?.value;
        if (field('event') === 'batch_worker_failed' && field('outcome') === 'stopped') {
          const phase = field('phase'), code = field('error_code'), mapped = desktopErrorCode(code);
          startupEvent('batch_worker_failed', { outcome: 'failed',
            phase: workerPhases.has(phase) ? phase : 'processing',
            error_code: mapped !== 'STANDALONE_OPERATION_FAILED' ? mapped : workerCodes.has(code) ? code : mapped });
        }
      } catch { /* no record property or diagnostic sink may affect a batch */ }
      return recorded;
    } };
  };
  const reviewBroker = require('./review-broker').createReviewBroker();
  const intakeReservation = require('../gateway/batch-intake-reservation');
  const documentReviews = require('../gateway/standalone-document-review-store').createDocumentReviewStore({
    nativeExport: options.nativeExport, controlOwnerPid: options.controlOwnerPid,
    controlOwnerGeneration: options.controlOwnerGeneration, retiredControlGenerations: options.retiredControlGenerations });
  const runHistory = createRunHistory({
    readStates: readStandaloneHistoryStates,
    readState: readStandaloneHistoryState,
    readExports: readStandaloneExportHistory,
    readExport: readStandaloneExportHistoryEntry,
    recentHistory: require('../gateway/standalone-history-store').readRecentHistory,
    exportCompletedBatchResults: (...args) => observeOwnershipOutcome(exportCompletedBatchResults(...args), startupEvent),
    recoverableStates: standaloneRecoverableStates,
    liveExecutor: require('../gateway/batch-active-lock').liveLocalExecutor,
    pendingDocumentExports(batchId) {
      const summary = documentReviews.historySummary(batchId);
      return summary.available === true ? summary.pending_export_count !== 0 : null;
    }
  });
  return {
    runHistory,
    readStates: readStandaloneHistoryStates,
    readState: readStandaloneHistoryState,
    abandonPendingResultExport,
    documentReviews,
    continueStandaloneBatch,
    requestStandalonePause,
    skipStandaloneOcrContactReview,
    initializeProduct() {
      if (!standaloneStartup) {
        // Even optional history can touch internal files; reject conflicting
        // roots before that first access, then recheck in the shared bootstrap.
        assertRootSeparation();
        // Preserve original export destinations. Journal summaries are now
        // captured from the validated recovery snapshot before journal expiry,
        // not by a redundant historical UI scan before the same bootstrap.
        const captureStarted = Date.now();
        startupEvent('history_capture_started', { outcome: 'started' });
        let captureOutcome = 'ready', captureCounts = {};
        try { captureCounts = { journal_count: 0, ...runHistory.captureExistingExportBindings() }; }
        catch { captureOutcome = 'failed'; /* optional history is repairable */ }
        if (captureOutcome === 'ready') startupEvent(captureCounts.export_capture_reused === true
          ? 'history_capture_reused' : 'history_capture_full', { outcome: 'ready',
          journal_count: captureCounts.journal_count, export_count: captureCounts.export_count });
        startupEvent('history_capture_finished', { outcome: captureOutcome,
          elapsed_ms: Date.now() - captureStarted, ...captureCounts });
        const bootstrapStarted = Date.now();
        startupEvent('product_bootstrap_started', { outcome: 'started' });
        const startup = initializeProduct({
          assertRootSeparation,
          verifyBundledRuntime,
          // Unlike Cowork's temporary plugin projection, the Standalone package
          // is the durable runtime. Copying the 87 MiB interpreter on every new
          // installation delayed first paint and duplicated the product without
          // improving worker lifetime.
          ensureDurableRuntime: () => ({ active: false, reason: 'standalone_package_persistent' }),
          migrateLegacyAuditReceipts,
          standaloneLazyRetentionProtection: true,
          openBatchPackageProtection,
          cleanupLocalData,
          cleanupUiJobs: cleanupCompanionJobs,
          recoverBatches,
          replayMappingOutbox,
          startBatchMaintenance,
          cleanupExpiredBatchSnapshots,
          // Standalone owns a separate data namespace and must never import the
          // optional Claude plugin's legacy inbox or its source references.
          migrateLegacyInput: () => ({ ok: true, skipped: true, reason: 'standalone_namespace' }),
          cleanupAbandonedWorkingJobs,
          // The shared plugin adapter terminates its MCP host on a refused
          // bootstrap. Standalone must keep the desktop sidecar alive long
          // enough to return the fixed refusal code to its local UI.
          refuseStartup: (error) => {
            const outcome = refuseStartup(error, { exit: () => {} });
            // Preserve the exact leaf-issued exception through a later shared
            // bootstrap refusal; the sidecar's WeakSet cause is not forgeable
            // and cannot survive replacing this error with a generic wrapper.
            if (rootSeparationFailure(error) === 'active_public_access_denied') throw error;
            throw fixedFailure(ownershipErrorCode(error) || outcome.code, 'Der lokale DataSecure-Core konnte nicht sicher gestartet werden.');
          }
        });
        startupEvent('product_bootstrap_finished', { outcome: 'ready', elapsed_ms: Date.now() - bootstrapStarted });
        // A visible export may contain hundreds of files. Replaying it while
        // bootstrapping a 30-second desktop connection can kill the sidecar
        // mid-transaction and leave an unowned control lock. History explicitly
        // reconciles the export after the connection has become ready.
        standaloneStartup = Object.freeze({ ...startup, result_exports: { deferred: true } });
      }
      return standaloneStartup;
    },
    // UI polling must not enumerate every historical package, review item,
    // retention entry and companion job. Startup has already completed the
    // full fail-closed readiness transaction; this probe reads only live
    // intake activity and durable batch journals.
    lightweightStatus() {
      return {
        engine_ready: true,
        local_intake_pending: batchExecutor.localIntakeActive() || intakeReservation.intakeReservationActive(),
        ...recoverableBatchStatus()
      };
    },
    publicStatusSnapshot(selectedBatchId) {
      const snapshot = productStatusSnapshot(PRODUCT_CHANNEL, { localUiSelection: true, selectedBatchId,
        skipUnobservedTerminal: true });
      return Object.freeze({
        current: Object.freeze({
          engine_ready: true,
          local_intake_pending: batchExecutor.localIntakeActive() || intakeReservation.intakeReservationActive(),
          ...snapshot.recovery
        }),
        latest: snapshot.latest,
        observed_batch_id: snapshot.observed_batch_id,
        observed_is_active: snapshot.observed_is_active,
        observed_recoverable: snapshot.observed_recoverable
      });
    },
    latestProductBatchStatus,
    latestProductResultDirectory,
    replayPendingResultExports: () => observeOwnershipOutcome(replayPendingResultExports(), startupEvent),
    startLocalIntakeExecutor: (queue, profile, executorOptions) =>
      batchExecutor.startLocalIntakeExecutor(queue, profile, workerDiagnostics(executorOptions)),
    startLocalBatchExecutor: (token, executorOptions) =>
      batchExecutor.startLocalBatchExecutor(token, workerDiagnostics(executorOptions)),
    startLocalReviewExecutor: (token, executorOptions) => batchExecutor.startLocalReviewExecutor(token, {
      ...workerDiagnostics({ ...executorOptions }), appReview: reviewBroker
    }),
    localWorkerActive: batchExecutor.localWorkerActive,
    reviewSession: reviewBroker.session,
    reviewContinuationBatchId: reviewBroker.boundBatchId,
    reviewChunk: reviewBroker.chunk,
    submitReview: reviewBroker.submit,
    acknowledgeStandaloneTerminalNotice: batchExecutor.acknowledgeStandaloneTerminalNotice,
    pendingStandaloneTerminalNoticeGeneration: batchExecutor.pendingStandaloneTerminalNoticeGeneration,
    clearStandaloneIntakeFailureNotice: batchExecutor.clearStandaloneIntakeFailureNotice,
    continueMostRecentBatch,
    openFolder: require('../gateway/common').openFolder,
    revealFile: require('../gateway/common').revealFile,
    pickSourcesAsync: filePicker.pickSourcesAsync,
    batchQueueFromSelection: filePicker.batchQueueFromSelection,
    validateSelectedPathAsync: filePicker.validateSelectedPathAsync,
    pickSourceFolderAsync: sourceFolder.pickSourceFolderAsync,
    enumerateSourceFolderAsync: sourceFolder.enumerateSourceFolderAsync,
    pickFolderAsync: require('../companion/folder-picker').pickFolderAsync,
    reserveIntake: require('../gateway/batch-intake-reservation').reserveIntake,
    releaseIntake: require('../gateway/batch-intake-reservation').releaseIntake,
    readConfiguredResultRoot: resultFolder.readConfiguredResultRoot,
    readConfiguredResultRootStatus: resultFolder.readConfiguredResultRootStatus,
    saveConfiguredResultRoot: resultFolder.saveConfiguredResultRoot,
    resultOutputDirectory: resultFolder.resultOutputDirectory,
    isNetworkResultFolder: resultFolder.isNetworkResultFolder,
    recordSupportTrace: supportTrace.recordSupportTrace,
    newTraceId: supportTrace.newTraceId,
    fs
  };
}

function fixedFailure(code, message) {
  return Object.assign(new Error(message), { code });
}

function validateBatchId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) {
    throw fixedFailure('STANDALONE_HISTORY_INVALID', 'Die lokale Laufauswahl ist ungültig.');
  }
}

function confirmedIntakeStart(started) {
  if (started?.ok !== true || started.local_intake_pending !== true ||
      !started.ipcAcknowledgement || typeof started.ipcAcknowledgement.then !== 'function') {
    throw fixedFailure('STANDALONE_START_FAILED',
      'Der lokale Start wurde nicht bestätigt. Bitte den Status prüfen und die Dateien nicht erneut starten.');
  }
  return started.ipcAcknowledgement;
}

function confirmedIntakeBatchToken(started) {
  const token = String(started?.batch_token || '');
  if (!/^[a-f0-9]{64}$/u.test(token)) {
    throw fixedFailure('STANDALONE_START_FAILED',
      'Der lokale Start hat keine gültige Laufkennung bestätigt. Bitte den Status prüfen und die Dateien nicht erneut starten.');
  }
  return token;
}

function pathsOverlap(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  const inside = (base, candidate) => {
    const relative = path.relative(base, candidate);
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
  };
  return inside(a, b) || inside(b, a);
}

function selectedPathIdentity(candidate) {
  const resolved = path.resolve(candidate);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

class StandaloneApplicationService {
  constructor(options = {}) {
    this.deps = options.dependencies || defaultDependencies(options);
    this.home = options.home || os.homedir();
    this.interactionActive = false;
    this.admittedQueue = null;
    this.admissionRevision = 0;
    this.sourceIds = new Map();
    this.rejectedSources = new Map();
    this.selectionContext = null;
    this.observedBatchId = null;
    this.terminalPresentation = null;
    this.intakeAttempt = null;
    this.startup = this.deps.initializeProduct?.();
  }

  trace(event, fields = {}) {
    this.deps.recordSupportTrace?.({
      trace_id: fields.trace_id || this.deps.newTraceId?.(), event,
      operation: 'standalone_batch', outcome: fields.outcome || 'progress',
      ...(Number.isSafeInteger(fields.item_count) ? { item_count: fields.item_count } : {}),
      ...(fields.error_code ? { error_code: fields.error_code } : {})
    });
  }

  reviewSession() {
    const session = this.deps.reviewSession?.() || { ready: false };
    const boundBatchId = session.batch_id || this.deps.reviewContinuationBatchId?.();
    const sameRun = Boolean(this.observedBatchId && boundBatchId === this.observedBatchId);
    if (session.ready && (!session.batch_id || sameRun)) return session;
    let status = this.status();
    if (sameRun && status.state === 'export_pending' && session.worker_active !== true) {
      try { this.deps.runHistory?.history(); }
      catch { /* the pending status remains visible and safely retryable */ }
      status = this.status();
    }
    const complete = Boolean(sameRun && status.batch_complete === true &&
      ['results_available', 'completed_without_results'].includes(status.state));
    const failed = sameRun && session.phase === 'failed';
    const exportPending = sameRun && status.state === 'export_pending' && session.worker_active !== true;
    const actionableLimit = failed && ['LOCAL_REVIEW_TOO_LARGE', 'OCR_CONTACT_REVIEW_INVALID'].includes(session.error_code);
    const canContinue = Boolean(sameRun && status.state === 'review_required' &&
      session.worker_active !== true && !actionableLimit);
    let affectedFiles = [];
    if (failed || canContinue) {
      try { affectedFiles = this.deps.runHistory.reviewTargets?.(boundBatchId) || []; }
      catch { /* missing labels must not change the run's fail-closed state */ }
    }
    return { ready: false, run_complete: complete,
      continuation_available: canContinue,
      ...(session.phase ? {
        phase: !sameRun ? 'unbound' : complete ? 'complete' : failed ? 'failed' : exportPending ? 'export_pending'
          : canContinue ? 'retry_available' : session.phase,
        worker_active: sameRun && session.worker_active === true,
        retry_available: failed && canContinue,
        ...(failed ? { error_code: session.error_code || 'LOCAL_REVIEW_FAILED' } : {}),
        // Capture targets before continuing too: an unconfirmed transport/start
        // cannot ask the departed worker for the names afterwards.
        ...(failed || canContinue ? { affected_files: affectedFiles } : {})
      } : {}) };
  }
  reviewChunk(reviewId, index) { return this.deps.reviewChunk(reviewId, index); }
  submitReview(reviewId, answer) { return this.deps.submitReview(reviewId, answer); }

  async skipOcrContactReview(batchId) {
    validateBatchId(batchId);
    const selected = this.deps.runHistory.find(batchId);
    if (selected?.processing_mode !== 'markdown-only')
      throw fixedFailure('OCR_CONTACT_SKIP_UNAVAILABLE', 'Nur eine offene OCR-Kontaktprüfung der reinen Markdown-Umwandlung kann übersprungen werden.');
    const session = this.deps.reviewSession?.() || {};
    if (session.ready === true && session.batch_id === batchId) {
      this.deps.submitReview(session.review_id, { action: 'skipped' });
      return { ok: true, skip_requested: true, continuation_pending: false, external_disclosure: false };
    }
    if (this.interactionActive || this.admittedQueue?.length > 0) throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Vorgang ist bereits aktiv.');
    if (!selected.resumable)
      throw fixedFailure('OCR_CONTACT_SKIP_UNAVAILABLE', 'Nur eine offene OCR-Kontaktprüfung der reinen Markdown-Umwandlung kann übersprungen werden.');
    if (session.worker_active === true || this.deps.lightweightStatus().batch_processing_active === true)
      throw fixedFailure('OCR_CONTACT_SKIP_NOT_READY', 'DataSecure bereitet die Prüfgruppe noch vor. Bitte kurz warten und den Status erneut prüfen.');
    this.deps.skipStandaloneOcrContactReview(batchId);
    try {
      const continued = await this.continueHistoryBatch(batchId);
      return { ...continued, skip_recorded: true, external_disclosure: false };
    } catch {
      // The opt-out is already durable. A failed worker start must not be
      // presented as an unrecorded choice or repeated automatically.
      return { ok: true, skip_recorded: true, continuation_pending: true, external_disclosure: false };
    }
  }

  async continueReviewSession(signal) {
    const batchId = this.deps.reviewContinuationBatchId?.();
    if (!batchId || batchId !== this.observedBatchId ||
        this.reviewSession().continuation_available !== true) {
      throw fixedFailure('STANDALONE_NOTHING_TO_CONTINUE', 'Für dieses Prüffenster ist keine weitere Prüfung bereit.');
    }
    return this.continueHistoryBatch(batchId, signal);
  }

  resultRootStatus() {
    if (typeof this.deps.readConfiguredResultRootStatus === 'function')
      return this.deps.readConfiguredResultRootStatus();
    // Older dependency adapters expose only a usable target or no setting.
    // Production always supplies the richer status above.
    const root = this.deps.readConfiguredResultRoot();
    return { status: root ? 'available' : 'unconfigured', root, recorded_root: root };
  }

  ensureResultRoot() {
    const configured = this.resultRootStatus();
    if (configured.status === 'available' && configured.root) return configured.root;
    if (configured.status !== 'unconfigured')
      throw fixedFailure('STANDALONE_RESULT_ROOT_UNAVAILABLE',
        'Der gespeicherte Ergebnisordner ist nicht mehr sicher verfügbar. Bitte den bisherigen Ordner wieder verfügbar machen oder einen anderen lokalen Ordner auswählen.');
    const selected = defaultResultRoot({ home: this.home });
    try {
      this.deps.fs.mkdirSync(selected, { recursive: true, mode: 0o700 });
      this.deps.resultOutputDirectory({ root: selected });
      this.deps.saveConfiguredResultRoot(selected);
    } catch {
      // A fresh installation has no result folder. Failure to create it
      // (for example managed macOS Documents access) is a start refusal,
      // never a Core bootstrap crash or a reason to return a false folder.
      // The user may select a different local destination explicitly.
      throw fixedFailure('STANDALONE_RESULT_ROOT_UNAVAILABLE',
        'Der vorgeschlagene Ergebnisordner konnte nicht sicher angelegt werden. Bitte in den Einstellungen einen verfügbaren lokalen Ordner auswählen.');
    }
    return selected;
  }

  observeCurrentRun() {
    const snapshot = this.deps.publicStatusSnapshot?.(this.observedBatchId);
    if (snapshot?.observed_is_active === true && /^[a-f0-9]{64}$/u.test(snapshot.observed_batch_id || '')) {
      this.observedBatchId = snapshot.observed_batch_id;
    }
    return snapshot;
  }

  clearIntakeFailure(attempt) {
    const receipt = attempt?.failure;
    if (receipt) {
      try { this.deps.clearStandaloneIntakeFailureNotice?.(receipt.token, receipt.generation); }
      catch { /* display invalidation grants no cleanup or worker authority */ }
    }
    if (attempt) attempt.failure = null;
    if (this.terminalPresentation?.intakeAttempt === attempt) this.terminalPresentation = null;
  }

  invalidateIntakeAttempt() {
    this.clearIntakeFailure(this.intakeAttempt);
    this.intakeAttempt = null;
  }

  beginIntakeAttempt() {
    this.invalidateIntakeAttempt();
    const attempt = { token: null, checkpointToken: null, failure: null };
    this.intakeAttempt = attempt;
    return { attempt,
      onIntakeFailure: (token, generation) => {
        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/u.test(token) ||
            !Number.isSafeInteger(generation) || generation < 1) return false;
        if (this.intakeAttempt !== attempt || attempt.checkpointToken ||
            attempt.token && attempt.token !== token) {
          try { this.deps.clearStandaloneIntakeFailureNotice?.(token, generation); } catch {}
          return false;
        }
        // First receipt wins. Duplicate/late callbacks cannot refresh a notice
        // generation or re-arm an already rendered failure.
        if (attempt.failure) return attempt.failure.token === token && attempt.failure.generation === generation;
        attempt.failure = { token, generation, rendered: false };
        return true;
      },
      onIntakeCheckpoint: token => {
        if (this.intakeAttempt !== attempt || typeof token !== 'string' || !/^[a-f0-9]{64}$/u.test(token) ||
            attempt.token && attempt.token !== token) return;
        attempt.checkpointToken = token;
        this.clearIntakeFailure(attempt);
      }
    };
  }

  bindIntakeAttempt(attempt, token) {
    if (this.intakeAttempt !== attempt) return;
    attempt.token = token;
    if (attempt.checkpointToken && attempt.checkpointToken !== token) attempt.checkpointToken = null;
    if (attempt.failure?.token !== token || attempt.checkpointToken) this.clearIntakeFailure(attempt);
  }

  status({ localUi = false } = {}) {
    const snapshot = this.observeCurrentRun();
    const current = snapshot?.current || this.deps.lightweightStatus();
    // A product snapshot also contains the newest historical journal so the
    // history adapter can render it efficiently. It is not the current UI run.
    // After an app restart, only a still-live worker or a run explicitly chosen
    // through History may take over the process card.
    const currentRunObserved = Boolean(snapshot && this.observedBatchId &&
      snapshot.observed_batch_id === this.observedBatchId);
    const latest = snapshot
      ? (currentRunObserved ? snapshot.latest : null)
      : (this.deps.latestProductBatchStatus?.(PRODUCT_CHANNEL) || null);
    const packages = Number.isSafeInteger(latest?.result_count)
      ? latest.result_count
      : 0;
    const reviews = Number.isSafeInteger(latest?.review_count)
      ? latest.review_count
      : 0;
    const reviewReady = latest?.review_ready === true;
    const failed = Number.isSafeInteger(latest?.failed_count)
      ? latest.failed_count
      : 0;
    const exportPending = Number.isSafeInteger(latest?.export_pending_count) ? latest.export_pending_count : 0;
    const completionPending = latest?.completion_pending === true;
    const recoverable = Number.isSafeInteger(current.recoverable_batches) ? current.recoverable_batches : 0;
    const awaitingResume = Number.isSafeInteger(current.batches_awaiting_resume) ? current.batches_awaiting_resume : 0;
    const resumableCount = snapshot && !currentRunObserved
      ? 0
      : this.observedBatchId
      ? (latest?.resumable === true || snapshot?.observed_recoverable === true ? 1 : 0)
      : latest?.resumable === true ? Math.max(1, recoverable, awaitingResume) : Math.max(recoverable, awaitingResume);
    const resumable = resumableCount > 0;
    const intakePending = current.local_intake_pending === true;
    const processing = current.batch_processing_active === true || latest?.processing === true;
    const preparing = intakePending && !processing;
    const selected = Number.isSafeInteger(latest?.selected_count) ? latest.selected_count : 0;
    const completed = Number.isSafeInteger(latest?.completed_count) ? latest.completed_count : 0;
    const currentBatchId = currentRunObserved ? this.observedBatchId
      : (!snapshot ? (this.observedBatchId || undefined) : undefined);
    const attempt = this.intakeAttempt;
    if (attempt && latest && currentBatchId === attempt.token) {
      attempt.checkpointToken = attempt.token;
      this.clearIntakeFailure(attempt);
    }
    const intakeFailure = attempt?.failure && !attempt.checkpointToken && attempt.token === attempt.failure.token &&
      (!this.observedBatchId || this.observedBatchId === attempt.token) ? attempt.failure : null;
    const state = current.engine_ready !== true
      ? 'blocked'
      : intakeFailure
        ? 'start_failed'
      : preparing
        ? 'preparing'
      : latest?.paused === true
        ? 'paused'
      : processing
        ? 'processing'
        : reviewReady
          ? 'review_required'
        : resumable
          ? 'stopped'
          : latest?.export_abandoned === true
            ? 'export_abandoned'
          : exportPending > 0 || completionPending
            ? 'export_pending'
          : latest?.complete === true && packages > 0
            ? 'results_available'
            : latest?.complete === true && failed > 0
              ? 'completed_without_results'
            : latest?.complete === false
              ? 'failed'
            : 'ready';
    const presentationGeneration = intakeFailure
      ? (intakeFailure.rendered ? null : intakeFailure.generation)
      : currentBatchId || !snapshot
      ? this.deps.pendingStandaloneTerminalNoticeGeneration?.(currentBatchId)
      : null;
    this.terminalPresentation = Number.isSafeInteger(presentationGeneration) && presentationGeneration > 0
      ? { generation: presentationGeneration, batchId: intakeFailure?.token || currentBatchId,
        ...(intakeFailure ? { intakeAttempt: attempt } : {}) } : null;
    let conversionFeedback;
    if (localUi === true && currentBatchId && latest?.processing_mode === MODES.MARKDOWN && !processing && !preparing) {
      try {
        const feedback = this.deps.runHistory.feedback?.(currentBatchId);
        // Do not combine a late journal with counters from an older snapshot.
        if (feedback?.selected_count === selected && feedback.result_count === packages &&
            feedback.not_converted_count === failed) conversionFeedback = feedback;
      } catch { /* missing or changed evidence retains the conservative status */ }
    }
    let contentNotices;
    if (localUi === true && currentBatchId && (latest?.processing_mode || MODES.ANONYMIZE) === MODES.ANONYMIZE) {
      contentNotices = { content_notice_count: 0, content_notice_breakdown_complete: false };
      try {
        const value = this.deps.runHistory?.contentNoticeSummary?.(currentBatchId, packages);
        if (value && Number.isSafeInteger(value.content_notice_count) && value.content_notice_count >= 0 &&
            value.content_notice_count <= packages && typeof value.content_notice_breakdown_complete === 'boolean') contentNotices = {
          content_notice_count: value.content_notice_count, content_notice_breakdown_complete: value.content_notice_breakdown_complete };
      } catch { /* a missing projection is unknown, never confirmed notice freedom */ }
    }
    return {
      ok: current.engine_ready === true,
      product_channel: PRODUCT_CHANNEL,
      state,
      ...(localUi === true && !intakeFailure && /^[a-f0-9]{64}$/u.test(currentBatchId || '') ? { batch_id: currentBatchId } : {}),
      ...(intakeFailure ? { intake_failure: { ...(localUi === true ? { intake_id: intakeFailure.token } : {}), error_code: 'STANDALONE_START_FAILED',
        worker_active: intakePending || processing } } : {}),
      processing_mode: latest?.processing_mode || MODES.ANONYMIZE,
      ...(localUi === true && currentBatchId && latest?.review_policy === 'automatic-conservative'
        ? { review_policy: latest.review_policy } : {}),
      warning_count: Math.max(Number.isSafeInteger(latest?.warning_count) ? latest.warning_count : 0,
        contentNotices?.content_notice_count || 0),
      ...(contentNotices || {}),
      ...(latest?.termination_unconfirmed === true ? { termination_unconfirmed: true } : {}),
      preparing,
      processing,
      ...(latest?.pause_requested === true ? { pause_requested: true } : {}),
      batch_complete: latest?.complete === true,
      review_required: reviewReady,
      resumable,
      results_available: packages > 0,
      result_count: packages,
      ...(Number.isSafeInteger(latest?.exported_count) ? { exported_count: latest.exported_count } : {}),
      selected_count: selected,
      completed_count: completed,
      failed_count: failed,
      ...(conversionFeedback ? { conversion_feedback: conversionFeedback } : {}),
      ...(latest?.complete === true && failed > 0 ? {
        ledger_available: packages > 0 && latest?.processing_mode !== MODES.MARKDOWN &&
          latest?.completion_available === true
      } : {}),
      export_pending_count: exportPending,
      ...(latest?.export_abandoned === true ? { export_abandoned: true } : {}),
      ...(completionPending ? { completion_pending: true } : {}),
      review_count: reviews,
      resumable_count: resumableCount,
      recoverable_count: recoverable,
      awaiting_resume_count: awaitingResume,
      ...(Number.isSafeInteger(presentationGeneration) && presentationGeneration > 0
        ? { presentation_generation: presentationGeneration }
        : {}),
      external_disclosure: false
    };
  }

  acknowledgeTerminalPresented(presentationGeneration) {
    const presented = this.terminalPresentation;
    const attempt = this.intakeAttempt, receipt = attempt?.failure;
    if (presented?.intakeAttempt) {
      const acknowledged = presented.intakeAttempt === attempt && presented.generation === presentationGeneration &&
        receipt?.generation === presentationGeneration && !receipt.rendered && !attempt.checkpointToken &&
        attempt.token === receipt.token && (!this.observedBatchId || this.observedBatchId === receipt.token);
      if (acknowledged) {
        receipt.rendered = true;
        this.terminalPresentation = null;
        // The retained receipt is still renderable after the bounded worker ACK
        // slot expired. Its local render ACK never marks a journal presented.
        try { this.deps.acknowledgeStandaloneTerminalNotice?.(presentationGeneration, receipt.token); } catch {}
      }
      return { ok: true, acknowledged: acknowledged === true, external_disclosure: false };
    }
    const acknowledged = presented?.generation === presentationGeneration &&
      (!this.observedBatchId || presented.batchId === this.observedBatchId) &&
      this.deps.acknowledgeStandaloneTerminalNotice?.(presentationGeneration, presented.batchId) === true;
    if (acknowledged) this.terminalPresentation = null;
    return { ok: true,
      acknowledged: acknowledged === true,
      external_disclosure: false };
  }

  history({ recoverExports = false, recoverBatchId = null, includeHidden = false, batchId = null } = {}) {
    return this.deps.runHistory.history({ recoverExports, recoverBatchId, includeHidden, batchId });
  }

  setRunHistoryVisibility(batchId, hidden) {
    return this.deps.runHistory.setVisibility(batchId, hidden);
  }

  abandonResultExport(batchId) {
    validateBatchId(batchId);
    if (this.interactionActive || this.admittedQueue?.length > 0 ||
        this.deps.lightweightStatus().batch_processing_active === true)
      throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Vorgang ist noch aktiv.');
    const entry = this.deps.runHistory.find(batchId);
    if (entry.processing_mode !== MODES.ANONYMIZE ||
        !['export_pending', 'export_abandoned'].includes(entry.status))
      throw fixedFailure('RESULT_EXPORT_ABANDON_UNAVAILABLE', 'Nur die offene Bereitstellung eines abgeschlossenen Anonymisierungslaufs kann aufgegeben werden.');
    const state = typeof this.deps.readState === 'function' ? this.deps.readState(batchId)
      : this.deps.readStates().find(row => row.token === batchId && row.product_channel === PRODUCT_CHANNEL);
    if (!state) throw fixedFailure('RESULT_EXPORT_ABANDON_UNAVAILABLE', 'Der Lauf ist lokal nicht mehr vollständig belegbar.');
    let receipt;
    try { receipt = this.deps.abandonPendingResultExport(state); }
    catch (error) {
      const known = ['RESULT_EXPORT_ABANDON_UNAVAILABLE', 'RESULT_EXPORT_BUSY', 'RESULT_EXPORT_STATE_UNSAFE'];
      const code = known.includes(error?.code) ? error.code : known.includes(error?.message) ? error.message : 'RESULT_EXPORT_STATE_UNSAFE';
      throw fixedFailure(code, 'Der unvollständige Ergebnisexport konnte nicht sicher aufgegeben werden. Bitte den aktuellen Laufstand prüfen.');
    }
    this.observedBatchId = batchId;
    return { ok: true, batch_id: batchId, ...receipt, external_disclosure: false };
  }

  documentReviews(batchId) {
    const data = this.deps.documentReviews.list(batchId);
    let processingComplete = false;
    try {
      const entry = this.deps.runHistory.find(batchId);
      const unavailable = data.unavailable || [], stopped = data.not_processed_documents || [];
      processingComplete = entry.status === 'results_available' && entry.processing_mode === data.processing_mode &&
        Array.isArray(data.documents) && Array.isArray(unavailable) && Array.isArray(stopped) &&
        Array.isArray(data.unclassified_documents) && data.unclassified_documents.length === 0 &&
        entry.selected_count === data.documents.length + unavailable.length + stopped.length &&
        entry.result_count === data.documents.length + unavailable.length && entry.failed_count === stopped.length;
    } catch { /* missing or contradictory evidence is never a confirmed run completion */ }
    const verified = { ...data, processing_complete: processingComplete };
    if (data.processing_mode !== MODES.MARKDOWN) {
      Object.assign(verified, { content_notice_count: 0, content_notice_breakdown_complete: false });
      try {
        const count = data.documents.length + (data.unavailable?.length || 0);
        const notices = this.deps.runHistory.contentNoticeSummary?.(batchId, count);
        if (notices && Number.isSafeInteger(notices.content_notice_count) && notices.content_notice_count >= 0 &&
            notices.content_notice_count <= count && typeof notices.content_notice_breakdown_complete === 'boolean')
          Object.assign(verified, { content_notice_count: notices.content_notice_count,
            content_notice_breakdown_complete: notices.content_notice_breakdown_complete });
      } catch { /* unavailable provenance must not be shown as proof of notice-free source coverage */ }
      // A deliberate OCR-off omission is not a converter defect. Classify it
      // only when the same private run binds both disabled OCR switches and
      // the exact stopped source, reason and name. Older runs stay neutral.
      try {
        const state = typeof this.deps.readState === 'function' ? this.deps.readState(batchId)
          : this.deps.readStates().find(row => row.token === batchId && row.product_channel === PRODUCT_CHANNEL);
        if (state.processing_mode === MODES.ANONYMIZE && Array.isArray(data.not_processed_documents)) {
          const omissions = new Map(state.items.filter(item => isAnonymizationOcrOmission(state, item))
            .map(item => [item.id, item]));
          const privacyStops = new Map(state.items.filter(item => isAnonymizationPrivacyStop(state, item))
            .map(item => [item.id, item]));
          return { ...verified, not_processed_documents: data.not_processed_documents.map(row => {
            const omitted = omissions.get(row.document_id), privacy = privacyStops.get(row.document_id);
            const same = item => item && item.error_code === row.reason_code &&
              (item.source_label || item.name) === row.name;
            return { ...row, classification: same(omitted) ? 'ocr_omission' :
              same(privacy) ? 'privacy_stop' : 'error' };
          }) };
        }
      } catch { /* absent OCR settings cannot be inferred from an error code alone */ }
      return verified;
    }
    try {
      const bound = this.deps.runHistory.documentFeedback?.(batchId), value = bound?.conversion_feedback;
      if (!value || data.unclassified_documents?.length ||
          value.result_count !== data.documents.length + (data.unavailable?.length || 0) ||
          value.not_converted_count !== (data.not_processed_documents?.length || 0)) return verified;
      const rejected = data.not_processed_documents || [];
      if (bound.omissions.some(row => !rejected.some(saved => saved.document_id === row.document_id &&
          saved.name === row.name && saved.reason_code === row.reason_code))) return verified;
      const released = [...data.documents, ...(data.unavailable || [])];
      if (!Array.isArray(bound.content_notices) || bound.content_notices.length !== value.content_notice_count ||
          bound.content_notices.some(row => !released.some(saved => saved.document_id === row.document_id &&
            (saved.name === undefined || saved.name === row.name)))) return verified;
      return { ...verified, conversion_feedback: value, content_notices: bound.content_notices,
        not_processed_documents: rejected.map(row => ({ ...row,
        classification: bound.omissions.some(item => item.document_id === row.document_id && item.name === row.name &&
          item.reason_code === row.reason_code) ? 'ocr_omission' : 'error' })) };
    } catch { return verified; } // unavailable evidence is not a success or OCR choice
  }
  documentReviewHistorySummary(batchId) { return this.deps.documentReviews.historySummary(batchId); }
  documentReviewChunk(batchId, documentId, revision, index) { return this.deps.documentReviews.chunk(batchId, documentId, revision, index); }
  documentEntities(batchId, documentId, revision, page) { return this.deps.documentReviews.entities(batchId, documentId, revision, page); }
  decideDocumentReview(batchId, documentId, request) { return this.deps.documentReviews.decide(batchId, documentId, request); }
  decideDocumentReviewBatch(batchId, request) { return this.deps.documentReviews.decideBatch(batchId, request); }
  exportApprovedDocuments(batchId, operationId, selection, acknowledge = false) { return this.deps.documentReviews.exportApproved(batchId, operationId, selection, acknowledge); }
  previewDocumentExport(batchId, operationId, selection) { return this.deps.documentReviews.previewExport(batchId, operationId, selection); }
  abandonDocumentExport(batchId, operationId, digest) { return this.deps.documentReviews.abandonExport(batchId, operationId, digest); }
  resolveDocumentExport(batchId, operationId) { return this.deps.documentReviews.resolveExport(batchId, operationId); }
  resolveDocumentIdentityOverview(batchId, operationId) { return this.deps.documentReviews.resolveIdentityOverview(batchId, operationId); }

  pauseBatch(batchId) {
    validateBatchId(batchId);
    if (this.interactionActive) throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Vorgang ist bereits aktiv.');
    this.deps.requestStandalonePause(batchId);
    this.observedBatchId = batchId;
    return { ok: true, ...this.status({ localUi: true }), external_disclosure: false };
  }

  runFailures(batchId) {
    const target = batchId || this.observedBatchId;
    if (!target) throw fixedFailure('STANDALONE_HISTORY_MISSING', 'Für diesen Lauf sind keine Dateidetails verfügbar.');
    return this.deps.runHistory.failures(target);
  }

  resolveHistoryResults(batchId) {
    validateBatchId(batchId);
    return this.deps.runHistory.resolveResults(batchId);
  }

  resolveHistoryLedger(batchId) {
    validateBatchId(batchId);
    return this.deps.runHistory.resolveLedger(batchId);
  }

  resolveHistoryIdentityMapping(batchId) {
    validateBatchId(batchId);
    return this.deps.runHistory.resolveIdentityMapping(batchId);
  }

  resolveIdentityMappingsDirectory() {
    const localPath = require('./identity-ledger').resolveDirectory();
    return { ok: true, target_kind: 'directory', local_path: localPath, external_disclosure: false };
  }

  async continueHistoryBatch(batchId, signal) {
    validateBatchId(batchId);
    if (this.interactionActive || this.admittedQueue?.length > 0) throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Vorgang ist bereits aktiv.');
    const current = this.deps.lightweightStatus();
    if (!current.engine_ready) throw fixedFailure('STANDALONE_ENGINE_NOT_READY', 'Die lokale Verarbeitung ist nicht bereit.');
    if (current.local_intake_pending || current.batch_processing_active) {
      throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Stapel wird bereits verarbeitet.');
    }
    const selected = this.deps.runHistory.find(batchId);
    if (!selected.resumable) throw fixedFailure('STANDALONE_NOTHING_TO_CONTINUE', 'Dieser lokale Lauf kann nicht fortgesetzt werden.');
    this.interactionActive = true;
    let reservation;
    try {
      try { reservation = this.deps.reserveIntake(); }
      catch { throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Vorgang ist bereits aktiv.'); }
      const continued = this.deps.continueStandaloneBatch(batchId);
      if (continued?.ok !== true || continued.batch_token !== batchId) {
        throw fixedFailure('STANDALONE_NOTHING_TO_CONTINUE', 'Dieser lokale Lauf kann nicht fortgesetzt werden.');
      }
      // Keep observing this exact run through its terminal state, even when a
      // newer historical run exists or worker acknowledgement is uncertain.
      this.observedBatchId = batchId;
      this.invalidateIntakeAttempt();
      this.terminalPresentation = null;
      this.selectionContext = null;
      const action = batchNextAction(continued);
      if (action === 'none') return { ok: true, event: 'batch_already_completed', complete: true,
        selected_count: continued.batch_total, completed_count: continued.completed,
        failed_count: continued.stopped, external_disclosure: false };
      const review = action === 'review';
      const started = review
        ? this.deps.startLocalReviewExecutor(batchId, { requireIpcAcknowledgement: true, signal })
        : this.deps.startLocalBatchExecutor(batchId, { requireIpcAcknowledgement: true, signal });
      if (started?.ok !== true || (review ? started.local_review_started : started.local_processing_started) !== true) {
        throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Stapel wird bereits verarbeitet.');
      }
      if (!started.ipcAcknowledgement || typeof started.ipcAcknowledgement.then !== 'function') {
        throw fixedFailure('STANDALONE_START_FAILED', 'Der lokale Start wurde nicht bestätigt. Bitte den Status prüfen.');
      }
      try { await started.ipcAcknowledgement; }
      catch (error) {
        if (review && REVIEW_START_FAILURE_CODES.has(error?.code)) {
          throw fixedFailure(error.code, 'Die lokale Prüfkomponente konnte nicht gestartet werden.');
        }
        throw fixedFailure('STANDALONE_START_FAILED', 'Der lokale Start wurde nicht bestätigt. Bitte den Status prüfen.');
      }
      return { ok: true, event: 'batch_continued', external_disclosure: false };
    } finally {
      if (reservation) this.deps.releaseIntake(reservation.reservation_id);
      this.interactionActive = false;
    }
  }

  async selectSources(sourceKind, signal) {
    if (sourceKind === 'folder') {
      const folder = await this.deps.pickSourceFolderAsync({ signal });
      return this.deps.enumerateSourceFolderAsync(folder, {
        allowedTypes: CONVERSION_TYPES, signal, productChannel: 'standalone'
      });
    }
    return this.deps.pickSourcesAsync({ allowedTypes: CONVERSION_TYPES, signal });
  }

  async validateSourceSelection(sourcePaths, signal, options = {}) {
    const catalogue = options.catalogue === true && typeof options.onRejectedSource === 'function';
    const outcomes = await Promise.allSettled(sourcePaths.map(async (candidate) => {
      try { return await this.deps.validateSelectedPathAsync(candidate, { allowedTypes: CONVERSION_TYPES, signal }); }
      catch (error) {
        if (!catalogue || !['SOURCE_FORMAT_UNSUPPORTED', 'SOURCE_FORMAT_SIZE_LIMIT', 'SOURCE_FILE_EMPTY',
          'SOURCE_ACCESS_DENIED', 'SOURCE_READ_FAILED'].includes(error?.code)) throw error;
        options.onRejectedSource({ full: candidate, name: path.basename(candidate), reason_code: error.code });
        return null;
      }
    }));
    const rejected = outcomes.filter((entry) => entry.status === 'rejected');
    if (!rejected.length) return outcomes.map((entry) => entry.value).filter(Boolean);
    // Cancellation remains cancellation, never a file failure. Multi-selection
    // admission is atomic and waits for every validation so no failing filename
    // is lost simply because a different file failed first.
    const cancelled = rejected.find((entry) => entry.reason?.code === 'LOCAL_SELECTION_CANCELLED');
    if (cancelled) throw cancelled.reason;
    if (sourcePaths.length === 1) throw rejected[0].reason;
    const error = fixedFailure('SOURCE_SELECTION_REJECTED',
      'Diese Dateiauswahl konnte nicht übernommen werden. Die betroffenen Dateien stehen in den Details; die bisherige Auswahl bleibt unverändert.');
    error.localSelectionFiles = outcomes.flatMap((entry, index) => {
      if (entry.status !== 'rejected') return [];
      const name = path.basename(String(sourcePaths[index] || ''));
      if (!name || name.length > 1024 || /[\\/\u0000-\u001f\u007f]/u.test(name) ||
          ['.', '..'].includes(name) || path.win32.isAbsolute(name) || path.posix.isAbsolute(name)) return [];
      return [{ name, reason_code: SELECTION_REASON_CODES.has(entry.reason?.code)
        ? entry.reason.code : 'SOURCE_READ_FAILED' }];
    });
    error.localSelectionCount = rejected.length;
    throw error;
  }

  async admitSelectedSources(sourcePaths, sourceKind = 'files', signal, options = {}) {
    validateChoice(sourceKind, SOURCE_KINDS, 'files');
    if (!Array.isArray(sourcePaths) || sourcePaths.length < 1 || sourcePaths.length > RESOURCE_LIMITS.MAX_BATCH_FILES) {
      throw fixedFailure('STANDALONE_SELECTION_INVALID', 'Die lokale Auswahl ist ungültig.');
    }
    if (this.interactionActive) throw fixedFailure('STANDALONE_BUSY', 'Eine lokale Auswahl ist bereits geöffnet.');
    const status = this.deps.lightweightStatus();
    if (!status.engine_ready) throw fixedFailure('STANDALONE_ENGINE_NOT_READY', 'Die lokale Verarbeitung ist nicht bereit.');
    if (status.local_intake_pending || status.batch_processing_active) {
      throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Stapel wird bereits verarbeitet.');
    }
    this.interactionActive = true;
    try {
      const previousQueue = this.admittedQueue || [];
      let ignoredArtifactCount = 0;
      const ignoredArtifacts = [];
      const rejectedSources = new Map(this.rejectedSources);
      const rejectSource = (item) => {
        if (!item || typeof item.full !== 'string' || !path.isAbsolute(item.full) ||
            typeof item.name !== 'string' || item.name.length > 1024 ||
            /[\u0000-\u001f\u007f]/u.test(item.name)) {
          throw fixedFailure('STANDALONE_SELECTION_INVALID', 'Ungültiger Quellenkatalog.');
        }
        rejectedSources.set(selectedPathIdentity(item.full), item);
        if (rejectedSources.size > MAX_CATALOGUE_SOURCES) throw fixedFailure('SOURCE_FOLDER_FILE_LIMIT', 'Der Quellenkatalog ist zu groß.');
      };
      const catalogue = options.catalogue === true;
      const selected = sourceKind === 'folder'
        ? await this.deps.enumerateSourceFolderAsync(sourcePaths[0], {
            allowedTypes: CONVERSION_TYPES, signal, productChannel: 'standalone',
            ...(catalogue ? { catalogue: true, onRejectedSource: rejectSource,
              maxSources: MAX_CATALOGUE_SOURCES, maxTotalBytes: Number.MAX_SAFE_INTEGER } : {}),
            onIgnoredArtifact: (reason, name) => {
              ignoredArtifactCount++;
              if (ignoredArtifacts.length < RESOURCE_LIMITS.MAX_BATCH_FILES && typeof name === 'string' &&
                  name.length <= 1024 && !/[\u0000-\u001f\u007f]/u.test(name)) ignoredArtifacts.push({ name, reason_code: reason });
            }
          })
        : await this.validateSourceSelection(sourcePaths, signal,
          catalogue ? { catalogue: true, onRejectedSource: rejectSource } : {});
      const seen = new Set(previousQueue.map((item) => selectedPathIdentity(item.full)));
      const additions = [];
      let alreadySelectedCount = 0;
      for (const item of selected) {
        const identity = selectedPathIdentity(item.sourcePath);
        if (seen.has(identity)) { alreadySelectedCount++; continue; }
        seen.add(identity);
        additions.push(item);
      }
      // Recompute display labels for the complete queue. A later selection can
      // introduce a duplicate basename; the same labels bind the mapping and
      // the visible export tree. Publish the new admission only after every
      // combined limit and label has passed validation.
      const combined = [
        ...previousQueue.map((item) => ({ sourcePath: item.full, sourceBytes: item.sourceBytes,
          sourceLabel: item.sourceLabel })), ...additions
      ];
      const queue = combined.length ? this.deps.batchQueueFromSelection(combined) : [];
      if (!Array.isArray(queue) || (!catalogue && queue.length < 1) || queue.some((item) =>
        !item || typeof item.full !== 'string' || !path.isAbsolute(item.full) ||
        typeof item.name !== 'string' || item.name.length < 1 || path.basename(item.full) !== item.name ||
        !Number.isSafeInteger(item.sourceBytes) || item.sourceBytes < 1)) {
        throw fixedFailure('STANDALONE_SELECTION_INVALID', 'Die lokale Dateiauswahl ist ungültig.');
      }
      const totalBytes = queue.reduce((sum, item) => sum + item.sourceBytes, 0);
      if (!Number.isSafeInteger(totalBytes) || (!catalogue && (queue.length > RESOURCE_LIMITS.MAX_BATCH_FILES ||
          totalBytes > RESOURCE_LIMITS.MAX_BATCH_TOTAL_BYTES))) {
        throw fixedFailure('STANDALONE_SELECTION_INVALID', 'Der ausgewählte Stapel überschreitet die zulässige Gesamtgröße.');
      }
      const folders = [...new Set([...(previousQueue.length > 0 ? this.selectionContext?.sourceFolders || [] : []),
        ...(sourceKind === 'folder' ? sourcePaths : additions.map((item) => path.dirname(item.sourcePath)))]
        .map((candidate) => path.resolve(candidate)))];
      const nextSourceIds = new Map(this.sourceIds);
      for (const item of queue) {
        const identity = selectedPathIdentity(item.full);
        if (!nextSourceIds.has(identity)) nextSourceIds.set(identity, crypto.randomBytes(16).toString('hex'));
        rejectedSources.delete(identity);
      }
      const nextSelection = {
        sourceKind: sourceKind === 'folder' || (previousQueue.length > 0 && this.selectionContext?.sourceKind === 'folder')
          ? 'folder' : 'files',
        sourceFolders: folders,
        // The queue already disambiguates duplicate basenames with the shortest
        // safe relative source label. Keep that label in the local-only UI so
        // the user removes the intended file.
        selectedFiles: queue.map((item) => item.sourceLabel || item.name)
      };
      const nextRevision = this.admissionRevision + 1;
      const result = {
        ok: true, event: 'selection_summarized', selected_count: queue.length,
        total_bytes: totalBytes,
        ...(alreadySelectedCount > 0 ? { already_selected_count: alreadySelectedCount } : {}),
        ...(ignoredArtifactCount > 0 ? { ignored_artifact_count: ignoredArtifactCount, ignored_artifacts: ignoredArtifacts } : {}),
        ...admissionCounts(queue), ui_context: this.projectUiContext({ selected: nextSelection,
          queue, sourceIds: nextSourceIds, rejectedSources, revision: nextRevision }), external_disclosure: false
      };
      // Budget the complete future response, not just the catalogue. Ignored
      // metadata labels and repeated display labels also consume IPC bytes.
      // Use the largest permitted request ID and leave headroom below 1 MiB.
      const framed = { schema: 'datasecure-standalone-private-response/1', request_id: '0'.repeat(64), ok: true, result };
      if ((catalogue && queue.length + rejectedSources.size > MAX_CATALOGUE_SOURCES) ||
          Buffer.byteLength(JSON.stringify(framed), 'utf8') > MAX_CATALOGUE_METADATA_BYTES) {
        throw fixedFailure('SOURCE_FOLDER_FILE_LIMIT', 'Der sichere Quellenkatalog ist zu groß. Bitte einen kleineren Unterordner auswählen.');
      }
      // No admission mutation before the complete bounded response has passed.
      this.admittedQueue = queue;
      this.sourceIds = nextSourceIds;
      this.rejectedSources = rejectedSources;
      this.admissionRevision = nextRevision;
      this.selectionContext = nextSelection;
      this.invalidateIntakeAttempt();
      return result;
    } catch (error) {
      if (signal?.aborted || error?.code === 'LOCAL_SELECTION_CANCELLED') {
        throw fixedFailure('STANDALONE_SELECTION_CANCELLED', 'Die Auswahl wurde abgebrochen.');
      }
      throw error;
    } finally {
      this.interactionActive = false;
    }
  }

  cancelAdmission() {
    this.invalidateIntakeAttempt();
    this.admittedQueue = null;
    this.selectionContext = null;
    this.sourceIds.clear();
    this.rejectedSources.clear();
    this.admissionRevision++;
    return { ok: true, event: 'admission_cancelled', external_disclosure: false };
  }

  removeAdmittedSource(selectionIndex) {
    if (this.interactionActive) throw fixedFailure('STANDALONE_BUSY', 'Eine lokale Auswahl wird bereits geändert.');
    if (!Number.isSafeInteger(selectionIndex) || selectionIndex < 0 || selectionIndex >= (this.admittedQueue?.length || 0)) {
      throw fixedFailure('STANDALONE_SELECTION_INVALID', 'Die ausgewählte Datei ist nicht mehr in der vorbereiteten Auswahl.');
    }
    const [removed] = this.admittedQueue.splice(selectionIndex, 1);
    this.invalidateIntakeAttempt();
    this.sourceIds.delete(selectedPathIdentity(removed.full));
    this.admissionRevision++;
    if (this.admittedQueue.length === 0) {
      this.selectionContext = null;
      return { ok: true, event: 'admission_cleared', selected_count: 0,
        total_bytes: 0, ui_context: this.uiContext(), external_disclosure: false };
    }
    this.selectionContext = {
      sourceKind: this.selectionContext?.sourceKind || 'files',
      sourceFolders: [...new Set(this.admittedQueue.map((item) => path.resolve(path.dirname(item.full))))],
      selectedFiles: this.admittedQueue.map((item) => item.sourceLabel || item.name)
    };
    return {
      ok: true, event: 'selection_updated', selected_count: this.admittedQueue.length,
      total_bytes: this.admittedQueue.reduce((sum, item) => sum + item.sourceBytes, 0),
      ui_context: this.uiContext(), external_disclosure: false
    };
  }

  uiContext() {
    return this.projectUiContext({ selected: this.selectionContext, queue: this.admittedQueue,
      sourceIds: this.sourceIds, rejectedSources: this.rejectedSources, revision: this.admissionRevision });
  }

  projectUiContext({ selected, queue, sourceIds, rejectedSources, revision }) {
    const configured = this.resultRootStatus();
    let latestResultFolder = '';
    // Root/selection display is not a request to inspect an old run, scan its
    // journal or repair an export. Production uses exact explicit result
    // actions for that work. Preserve only the legacy adapter's old hint.
    if (!this.deps.publicStatusSnapshot) {
      try {
        latestResultFolder = this.observedBatchId
          ? this.deps.runHistory.resolveResults(this.observedBatchId).local_path
          : this.deps.latestProductResultDirectory?.(PRODUCT_CHANNEL, { ensureExport: true, latestBatchOnly: true }) || '';
      } catch { /* A legacy display hint never authorizes a file action. */ }
    }
    return {
      ok: true,
      result_folder: configured.status === 'available' ? configured.root
        : configured.status === 'unconfigured' ? defaultResultRoot({ home: this.home }) : '',
      result_folder_status: configured.status,
      // Local display hint only; never pass an unavailable recorded path to
      // start, export or native folder operations as an authorized destination.
      result_folder_recorded: configured.recorded_root || '',
      latest_result_folder: latestResultFolder,
      result_folder_is_default: configured.status === 'unconfigured',
      source_kind: selected?.sourceKind || null,
      source_folders: selected ? [...selected.sourceFolders] : [],
      selected_files: selected ? [...selected.selectedFiles] : [],
      catalogue_revision: revision,
      source_catalogue: catalogueProjection(queue, sourceIds, rejectedSources),
      local_ui_only: true,
      external_disclosure: false
    };
  }

  async startAdmittedBatch(options = 'auto', signal) {
    if (this.interactionActive) throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Vorgang ist bereits aktiv.');
    // Existing direct callers remain explicitly anonymization-only. The desktop
    // passes an options object and must name its purpose; absence is not consent
    // to silently replace a requested conversion with anonymization.
    if (typeof options === 'string') options = { profile: options, processingMode: MODES.ANONYMIZE };
    require('../gateway/content-start-boundary').assertContentStartOwner(options);
    if (options && typeof options === 'object' && Object.hasOwn(options, 'content_options'))
      throw fixedFailure('CONTENT_OPTIONS_INVALID', 'Ungültiger Inhaltsvertrag.');
    if (!options || typeof options !== 'object' || Array.isArray(options) ||
        Object.keys(options).some((key) => !['profile', 'processingMode', 'outputNamingMode', 'ocrContactReview', 'documentReview', 'sourceIds', 'catalogueRevision', 'contentOptions', 'reviewPolicy'].includes(key))) {
      throw fixedFailure('PROCESSING_MODE_INVALID', 'Ungültiger Verarbeitungsmodus.');
    }
    const contentOptions = require('../gateway/content-start-boundary').contentStartOptions(options, 'contentOptions', PRODUCT_CHANNEL);
    const processingMode = assertRunnableProcessingMode(options.processingMode, PRODUCT_CHANNEL);
    const reviewPolicy = Object.hasOwn(options, 'reviewPolicy')
      ? require('../core/standalone-review-policy').validateReviewPolicy(options.reviewPolicy, {
        productChannel: PRODUCT_CHANNEL, processingMode, documentReview: options.documentReview, contentOptions }) : undefined;
    if (Object.hasOwn(options, 'documentReview') && options.documentReview !== true)
      throw fixedFailure('DOCUMENT_REVIEW_INVALID', 'Ungültiger lokaler Dokumentprüfauftrag.');
    if (Object.hasOwn(options, 'ocrContactReview') && (processingMode !== MODES.MARKDOWN || options.ocrContactReview !== true)) {
      throw fixedFailure('OCR_CONTACT_REVIEW_INVALID', 'OCR-Kontaktkorrektur ist eine ausdrückliche Option der reinen Konvertierung.');
    }
    let outputNamingMode = null;
    if (processingMode === MODES.MARKDOWN && Object.hasOwn(options, 'outputNamingMode')) {
      throw fixedFailure('RESULT_NAMING_MODE_INVALID', 'Für reine Konvertierung ist keine Ergebnisbenennung erforderlich.');
    }
    if (processingMode !== MODES.MARKDOWN) {
      outputNamingMode = validateResultNamingMode(Object.hasOwn(options, 'outputNamingMode')
        ? options.outputNamingMode : RESULT_NAMING_MODES.NEUTRAL, PRODUCT_CHANNEL);
    }
    const profile = validateChoice(options.profile, PROFILES, 'auto');
    let queue = this.admittedQueue;
    if (Object.hasOwn(options, 'sourceIds') || Object.hasOwn(options, 'catalogueRevision')) {
      if (!Number.isSafeInteger(options.catalogueRevision) || options.catalogueRevision !== this.admissionRevision ||
          !Array.isArray(options.sourceIds) || options.sourceIds.length < 1 || options.sourceIds.length > 200 ||
          new Set(options.sourceIds).size !== options.sourceIds.length ||
          !options.sourceIds.every(id => typeof id === 'string' && /^[a-f0-9]{32}$/u.test(id))) {
        throw fixedFailure('STANDALONE_SELECTION_INVALID', 'Die Auswahl ist nicht mehr aktuell.');
      }
      const ids = new Set(options.sourceIds);
      queue = (queue || []).filter(item => ids.has(this.sourceIds.get(selectedPathIdentity(item.full))));
      if (queue.length !== ids.size) throw fixedFailure('STANDALONE_SELECTION_INVALID', 'Die Auswahl gehört nicht zum Quellenkatalog.');
    }
    if (!Array.isArray(queue) || queue.length < 1) {
      throw fixedFailure('STANDALONE_NO_ADMISSION', 'Bitte zuerst Dateien oder einen Ordner auswählen.');
    }
    const selectedBytes = queue.reduce((total, item) => total + item.sourceBytes, 0);
    if (queue.length > RESOURCE_LIMITS.MAX_BATCH_FILES || !Number.isSafeInteger(selectedBytes) ||
        selectedBytes > RESOURCE_LIMITS.MAX_BATCH_TOTAL_BYTES) {
      throw fixedFailure('STANDALONE_SELECTION_INVALID', 'Höchstens 200 Dateien und 500 MB pro Verarbeitung. Bitte die Auswahl verkleinern.');
    }
    this.ensureResultRoot();
    let reservation;
    let transferred = false;
    try {
      reservation = this.deps.reserveIntake();
      this.observedBatchId = null;
      this.terminalPresentation = null;
      const { attempt, ...intakeCallbacks } = this.beginIntakeAttempt();
      const started = this.deps.startLocalIntakeExecutor(queue, profile, {
        ...intakeCallbacks,
        intakeReservationId: reservation.reservation_id, signal, processingMode,
        ...(contentOptions ? { contentOptions } : {}),
        ...(reviewPolicy ? { reviewPolicy } : {}),
        ...(options.ocrContactReview === true ? { ocrContactReview: true } : {}),
        ...(options.documentReview === true ? { documentReview: true } : {}),
        ...(outputNamingMode ? { outputNamingMode } : {})
      });
      transferred = true;
      // A delegated start consumes every private catalogue identity, including
      // excluded and rejected entries, even if its acknowledgement is lost.
      // Keep only the launched selection's display context for the current run.
      this.admittedQueue = null;
      this.sourceIds.clear();
      this.rejectedSources.clear();
      this.admissionRevision++;
      if (this.selectionContext) this.selectionContext = { ...this.selectionContext,
        selectedFiles: queue.map(item => item.sourceLabel || item.name) };
      let batchToken;
      try {
        batchToken = confirmedIntakeBatchToken(started);
        this.bindIntakeAttempt(attempt, batchToken);
        await confirmedIntakeStart(started);
        // Bind the run returned by the actual intake contract immediately.
        // A small batch may already be terminal before the first status poll;
        // observing only live workers would then lose its result card.
        if (this.intakeAttempt === attempt) this.observedBatchId = batchToken;
      } catch {
        // Once the reservation has been delegated, a missing acknowledgement
        // is an uncertain start. Never reuse the same admission: the worker may
        // still reach its durable checkpoint after the caller timed out.
        this.trace('standalone_batch_stopped', { outcome: 'stopped', error_code: 'STANDALONE_START_FAILED' });
        throw fixedFailure('STANDALONE_START_FAILED', 'Der lokale Start wurde nicht bestätigt. Bitte den Status prüfen und die Dateien nicht erneut starten.');
      }
      this.trace('standalone_batch_accepted', { outcome: 'ok', item_count: queue.length });
      return { ok: true, event: 'batch_accepted', batch_id: batchToken,
        selected_count: queue.length, external_disclosure: false };
    } finally {
      if (reservation && !transferred) this.deps.releaseIntake(reservation.reservation_id);
    }
  }

  async continueCurrentBatch(signal, options = {}) {
    assertLegacyContentOperation(options, 'contentOptions', PRODUCT_CHANNEL, 'resume');
    if (this.interactionActive || this.admittedQueue?.length > 0) throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Vorgang ist bereits aktiv.');
    if (this.observedBatchId) return this.continueHistoryBatch(this.observedBatchId, signal);
    if (options.requireObserved === true) {
      throw fixedFailure('STANDALONE_NOTHING_TO_CONTINUE', 'Der aktuelle Lauf ist nicht mehr verbunden. Bitte ihn im Verlauf auswählen.');
    }
    const status = this.deps.lightweightStatus();
    if (status.local_intake_pending || status.batch_processing_active) {
      throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Stapel wird bereits verarbeitet.');
    }
    const continued = this.deps.continueMostRecentBatch();
    if (continued.ok !== true) {
      throw fixedFailure('STANDALONE_NOTHING_TO_CONTINUE', 'Es gibt keinen fortsetzbaren lokalen Stapel.');
    }
    const action = batchNextAction(continued);
    this.observedBatchId = continued.batch_token;
    this.terminalPresentation = null;
    this.selectionContext = null;
    if (action === 'none') return { ok: true, event: 'batch_already_completed', complete: true,
      selected_count: continued.batch_total, completed_count: continued.completed,
      failed_count: continued.stopped, external_disclosure: false };
    const review = action === 'review';
    const started = review
      ? this.deps.startLocalReviewExecutor(continued.batch_token, { requireIpcAcknowledgement: true, signal })
      : this.deps.startLocalBatchExecutor(continued.batch_token, { requireIpcAcknowledgement: true, signal });
    const startedMarker = review ? started?.local_review_started : started?.local_processing_started;
    if (started?.ok !== true || startedMarker !== true) {
      throw fixedFailure('STANDALONE_BUSY', 'Der Stapel wird bereits von einem anderen lokalen Prozess bearbeitet.');
    }
    if (!started.ipcAcknowledgement || typeof started.ipcAcknowledgement.then !== 'function') {
      throw fixedFailure('STANDALONE_START_FAILED', 'Der lokale Start wurde nicht bestätigt. Bitte den Status prüfen.');
    }
    try {
      await started.ipcAcknowledgement;
    } catch (error) {
      if (review && REVIEW_START_FAILURE_CODES.has(error?.code)) {
        throw fixedFailure(error.code, 'Die lokale Prüfkomponente konnte nicht gestartet werden.');
      }
      throw fixedFailure('STANDALONE_START_FAILED', 'Der lokale Start wurde nicht bestätigt. Bitte den Status prüfen.');
    }
    return { ok: true, event: 'batch_continued', external_disclosure: false };
  }

  async anonymize(options = {}) {
    assertLegacyContentOperation(options, 'contentOptions', PRODUCT_CHANNEL, 'start');
    const sourceKind = validateChoice(options.sourceKind, SOURCE_KINDS, 'files');
    const profile = validateChoice(options.profile, PROFILES, 'auto');
    const signal = options.signal;
    if (this.interactionActive) throw fixedFailure('STANDALONE_BUSY', 'Eine lokale Auswahl ist bereits geöffnet.');
    this.interactionActive = true;
    const traceId = this.deps.newTraceId?.();
    let reservation;
    let transferred = false;
    this.trace('standalone_picker_started', { trace_id: traceId });
    try {
      const status = this.deps.lightweightStatus();
      if (!status.engine_ready) throw fixedFailure('STANDALONE_ENGINE_NOT_READY', 'Die lokale Verarbeitung ist nicht bereit.');
      if (status.local_intake_pending || status.batch_processing_active) {
        throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Stapel wird bereits verarbeitet.');
      }
      this.ensureResultRoot();
      reservation = this.deps.reserveIntake();
      const picked = await this.selectSources(sourceKind, signal);
      const selected = this.deps.batchQueueFromSelection(picked);
      this.trace('standalone_picker_completed', { trace_id: traceId, outcome: 'ok', item_count: selected.length });
      this.observedBatchId = null;
      this.terminalPresentation = null;
      const { attempt, ...intakeCallbacks } = this.beginIntakeAttempt();
      const started = this.deps.startLocalIntakeExecutor(selected, profile, {
        ...intakeCallbacks,
        intakeReservationId: reservation.reservation_id, signal
      });
      transferred = true;
      const batchToken = confirmedIntakeBatchToken(started);
      this.bindIntakeAttempt(attempt, batchToken);
      await confirmedIntakeStart(started);
      if (this.intakeAttempt === attempt) this.observedBatchId = batchToken;
      this.trace('standalone_batch_accepted', { trace_id: traceId, outcome: 'ok', item_count: selected.length });
      return {
        ok: true,
        product_channel: PRODUCT_CHANNEL,
        operation_accepted: true,
        selected_count: selected.length,
        state: 'preparing_local',
        external_disclosure: false
      };
    } catch (error) {
      const originalCode = String(error?.code || '');
      const code = signal?.aborted || originalCode === 'LOCAL_SELECTION_CANCELLED'
        ? 'STANDALONE_SELECTION_CANCELLED'
        : ['STANDALONE_BUSY', 'STANDALONE_ENGINE_NOT_READY'].includes(originalCode)
          ? originalCode : 'STANDALONE_START_FAILED';
      this.trace('standalone_batch_stopped', { trace_id: traceId, outcome: 'stopped', error_code: code });
      throw fixedFailure(code, code === 'STANDALONE_SELECTION_CANCELLED'
        ? 'Die Auswahl wurde abgebrochen.'
        : code === 'STANDALONE_BUSY'
          ? 'Ein lokaler Vorgang ist bereits aktiv.'
          : code === 'STANDALONE_ENGINE_NOT_READY'
            ? 'Die lokale Verarbeitung ist nicht bereit.'
            : 'Der lokale Vorgang wurde sicher gestoppt.');
    } finally {
      if (reservation && !transferred) this.deps.releaseIntake(reservation.reservation_id);
      this.interactionActive = false;
    }
  }

  async configureResults(options = {}) {
    if (this.interactionActive) throw fixedFailure('STANDALONE_BUSY', 'Eine lokale Auswahl ist bereits geöffnet.');
    this.interactionActive = true;
    try {
      const assertIdle = () => {
        const status = this.deps.lightweightStatus();
        if (status.local_intake_pending || status.batch_processing_active || this.deps.localWorkerActive?.()) {
          throw fixedFailure('STANDALONE_BUSY', 'Der Ergebnisordner kann während einer Verarbeitung nicht geändert werden.');
        }
      };
      assertIdle();
      const selected = options.path || await this.deps.pickFolderAsync({ signal: options.signal, purpose: 'result' });
      const dataRoot = process.env.EU_PRIVACY_DATA_ROOT || standaloneDataRoot();
      if (pathsOverlap(dataRoot, selected)) {
        throw fixedFailure('STANDALONE_RESULT_ROOT_UNSAFE', 'Der Ergebnisordner muss außerhalb des privaten DataSecure-Bereichs liegen.');
      }
      // The native broker provisions directories. Never invoke it before the
      // busy check or outside this service's interaction exclusion. Recheck
      // after every async selection/provisioning boundary before saving.
      assertIdle();
      const nativeExport = typeof options.prepareNativeExport === 'function'
        ? await options.prepareNativeExport() : options.nativeExport;
      assertIdle();
      try {
        if (typeof this.deps.runHistory?.captureExistingExportBindings === 'function') this.deps.runHistory.captureExistingExportBindings();
        else this.deps.runHistory?.history(); // Legacy adapter, not production.
      } catch { /* retain every safely readable prior export binding */ }
      this.deps.resultOutputDirectory({ root: selected });
      this.deps.saveConfiguredResultRoot(selected, { nativeIdentity: options.nativeIdentity, nativeExport });
      let replay = null;
      try { replay = this.deps.replayPendingResultExports?.() || null; }
      catch { replay = { pending: true }; }
      return { ok: true, configuration_changed: true, result_folder: selected,
        ...(this.deps.isNetworkResultFolder?.(selected) === true ? { network_folder_notice: true } : {}),
        export_replay_pending: replay?.pending === true || Number(replay?.pending || 0) > 0 ||
          Number(replay?.failures || 0) > 0,
        local_ui_only: true, external_disclosure: false };
    } finally { this.interactionActive = false; }
  }

  async openResults() {
    const resolved = this.resolveResults();
    const target = resolved.local_path;
    const opened = await this.deps.openFolder(target);
    if (!opened?.ok) {
      throw fixedFailure('STANDALONE_RESULT_OPEN_FAILED', 'Der Ergebnisordner konnte nicht geöffnet werden.');
    }
    return { ok: true, handoff_confirmed: true, external_disclosure: false };
  }

  async openLedger() {
    const resolved = this.resolveLedger();
    const target = resolved.local_path;
    const opened = await (this.deps.revealFile
      ? this.deps.revealFile(target)
      : this.deps.openFolder(path.dirname(target)));
    if (!opened?.ok) {
      throw fixedFailure('STANDALONE_LEDGER_OPEN_FAILED', 'Die lokale Zuordnungsdatei konnte nicht angezeigt werden.');
    }
    return { ok: true, handoff_confirmed: true, external_disclosure: false };
  }

  resolveResults() {
    this.observeCurrentRun();
    this.ensureResultRoot();
    try { this.deps.replayPendingResultExports?.(); } catch { /* resolved below without a false success */ }
    if (this.observedBatchId) return this.deps.runHistory.resolveResults(this.observedBatchId);
    if (this.deps.publicStatusSnapshot) {
      throw fixedFailure('STANDALONE_RESULTS_MISSING',
        'In dieser Sitzung ist noch kein Ergebnislauf verfügbar. Ältere Ergebnisse stehen im Verlauf.');
    }
    const target = this.deps.latestProductResultDirectory?.(PRODUCT_CHANNEL, { ensureExport: true, latestBatchOnly: true });
    if (!target || !path.isAbsolute(target)) {
      throw fixedFailure('STANDALONE_RESULTS_MISSING', 'Es ist noch kein vollständiger sichtbarer Ergebnislauf vorhanden.');
    }
    return {
      ok: true, target_kind: 'directory', local_path: path.resolve(target), external_disclosure: false
    };
  }

  resolveLedger() {
    const run = this.resolveResults().local_path;
    if (path.basename(path.dirname(run)) === 'DataSecure-Markdown') {
      throw fixedFailure('STANDALONE_LEDGER_MISSING', 'Für eine reine Markdown-Konvertierung wird keine Zuordnungsdatei erstellt.');
    }
    const target = path.join(run, VISIBLE_MAPPING_FILE);
    if (!this.deps.fs.existsSync(target)) {
      throw fixedFailure('STANDALONE_LEDGER_MISSING', 'Für den letzten sichtbaren Ergebnislauf ist noch keine Zuordnungsdatei vorhanden.');
    }
    return {
      ok: true, target_kind: 'file', local_path: path.resolve(target), external_disclosure: false
    };
  }
}

module.exports = {
  StandaloneApplicationService, SOURCE_KINDS, PROFILES, PRODUCT_CHANNEL,
  standaloneDataRoot, defaultResultRoot, activateStandaloneNamespace, defaultDependencies
};
