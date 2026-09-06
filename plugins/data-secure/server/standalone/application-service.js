'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RESOURCE_LIMITS } = require('../resource-limits');
const { MODES, assertRunnableProcessingMode } = require('../core/processing-mode');
const { batchNextAction } = require('../core/batch-next-action');

const PRODUCT_CHANNEL = 'standalone';
const VISIBLE_MAPPING_FILE = 'DataSecure-Zuordnung.csv';
const SOURCE_KINDS = new Set(['files', 'folder']);
const PROFILES = new Set(['auto', 'customer', 'applicant', 'personnel_profile', 'contract', 'general']);
const CONVERSION_TYPES = ['txt', 'md', 'csv', 'docx', 'xlsx', 'pptx', 'pdf', 'png', 'jpeg', 'bmp'];
let standaloneStartup;

function validateChoice(value, allowed, fallback) {
  const selected = value || fallback;
  if (!allowed.has(selected)) throw Object.assign(new Error('Ungültige lokale Auswahl.'), { code: 'STANDALONE_ARGUMENT_INVALID' });
  return selected;
}

function standaloneDataRoot(options = {}) {
  const platform = options.platform || process.platform;
  const environment = options.environment || process.env;
  const home = options.home || os.homedir();
  const base = platform === 'win32'
    ? String(environment.LOCALAPPDATA || path.join(home, 'AppData', 'Local'))
    : platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support')
      : String(environment.XDG_DATA_HOME || path.join(home, '.local', 'share'));
  return path.join(base, 'SecureDataMsg-Standalone');
}

function defaultResultRoot(options = {}) {
  const environment = options.environment || process.env;
  const documents = options.documentsDir || environment.DATASECURE_STANDALONE_DOCUMENTS_DIR ||
    path.join(options.home || os.homedir(), 'Documents');
  return path.join(documents, 'SecureDataMsg');
}

function activateStandaloneNamespace(options = {}) {
  const environment = options.environment || process.env;
  const platform = options.platform || process.platform;
  const root = path.resolve(options.dataRoot || standaloneDataRoot(options));
  const io = options.fs || fs;
  const workspace = path.join(root, 'workspace');
  try {
    io.mkdirSync(root, { recursive: true, mode: 0o700 });
    const named = io.lstatSync(root);
    const opened = io.statSync(root);
    const real = io.realpathSync.native ? io.realpathSync.native(root) : io.realpathSync(root);
    const realOpened = io.statSync(real);
    const comparable = (value) => platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
    const sameIdentity = (left, right) => Boolean(left && right && left.dev === right.dev && left.ino === right.ino);
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

function defaultDependencies() {
  // Namespace selection must happen before any gateway module is loaded. This
  // makes Standalone journals, settings, review data and exports invisible to
  // the optional Claude/MCP product even when both are installed.
  activateStandaloneNamespace();
  const { createRunHistory } = require('./run-history');
  const filePicker = require('../companion/file-picker');
  const sourceFolder = require('../companion/source-folder');
  const resultFolder = require('../gateway/result-folder-config');
  const supportTrace = require('../gateway/support-trace');
  const { replayPendingResultExports, readStandaloneExportHistory } = require('../gateway/result-export');
  const {
    continueMostRecentBatch, openBatchPackageProtection, recoverBatches,
    replayMappingOutbox, cleanupExpiredBatchSnapshots, recoverableBatchStatus, productStatusSnapshot,
    latestProductBatchStatus, latestProductResultDirectory, readStandaloneHistoryStates,
    standaloneRecoverableStates, continueStandaloneBatch
  } = require('../gateway/batch');
  const { cleanupLocalData } = require('../gateway/retention');
  const { initializeProduct } = require('../core/product-bootstrap');
  const { verifyBundledRuntime, refuseStartup } = require('../gateway/startup-guard');
  const { migrateLegacyAuditReceipts } = require('../gateway/audit');
  const { cleanupCompanionJobs } = require('../companion/retention');
  const { cleanupAbandonedWorkingJobs } = require('../gateway/orchestrator');
  const { startBatchMaintenance } = require('../gateway/batch-maintenance');
  const batchExecutor = require('../gateway/batch-executor');
  const intakeReservation = require('../gateway/batch-intake-reservation');
  const runHistory = createRunHistory({
    readStates: readStandaloneHistoryStates,
    readExports: readStandaloneExportHistory,
    recoverableStates: standaloneRecoverableStates,
    liveExecutor: require('../gateway/batch-active-lock').liveLocalExecutor
  });
  return {
    runHistory,
    continueStandaloneBatch,
    initializeProduct() {
      if (!standaloneStartup) {
        // Capture existing summaries and original export destinations before
        // startup retention retires their source journals.
        try { runHistory.history(); } catch { /* optional history is repairable */ }
        const startup = initializeProduct({
          verifyBundledRuntime,
          // Unlike Cowork's temporary plugin projection, the Standalone package
          // is the durable runtime. Copying the 87 MiB interpreter on every new
          // installation delayed first paint and duplicated the product without
          // improving worker lifetime.
          ensureDurableRuntime: () => ({ active: false, reason: 'standalone_package_persistent' }),
          migrateLegacyAuditReceipts,
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
            throw fixedFailure(outcome.code, 'Der lokale DataSecure-Core konnte nicht sicher gestartet werden.');
          }
        });
        standaloneStartup = Object.freeze({ ...startup, result_exports: replayPendingResultExports() });
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
      const snapshot = productStatusSnapshot(PRODUCT_CHANNEL, { localUiSelection: true, selectedBatchId });
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
    replayPendingResultExports,
    startLocalIntakeExecutor: batchExecutor.startLocalIntakeExecutor,
    startLocalBatchExecutor: batchExecutor.startLocalBatchExecutor,
    startLocalReviewExecutor: batchExecutor.startLocalReviewExecutor,
    acknowledgeStandaloneTerminalNotice: batchExecutor.acknowledgeStandaloneTerminalNotice,
    pendingStandaloneTerminalNoticeGeneration: batchExecutor.pendingStandaloneTerminalNoticeGeneration,
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
    saveConfiguredResultRoot: resultFolder.saveConfiguredResultRoot,
    resultOutputDirectory: resultFolder.resultOutputDirectory,
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

function pathsOverlap(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  const inside = (base, candidate) => {
    const relative = path.relative(base, candidate);
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
  };
  return inside(a, b) || inside(b, a);
}

class StandaloneApplicationService {
  constructor(options = {}) {
    this.deps = options.dependencies || defaultDependencies();
    this.home = options.home || os.homedir();
    this.interactionActive = false;
    this.admittedQueue = null;
    this.selectionContext = null;
    this.observedBatchId = null;
    this.terminalPresentation = null;
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

  ensureResultRoot() {
    const configured = this.deps.readConfiguredResultRoot();
    if (configured) return configured;
    const selected = defaultResultRoot({ home: this.home });
    this.deps.fs.mkdirSync(selected, { recursive: true, mode: 0o700 });
    this.deps.resultOutputDirectory({ root: selected });
    this.deps.saveConfiguredResultRoot(selected);
    return selected;
  }

  observeCurrentRun() {
    const snapshot = this.deps.publicStatusSnapshot?.(this.observedBatchId);
    if (snapshot?.observed_is_active === true && /^[a-f0-9]{64}$/u.test(snapshot.observed_batch_id || '')) {
      this.observedBatchId = snapshot.observed_batch_id;
    }
    return snapshot;
  }

  status() {
    const snapshot = this.observeCurrentRun();
    const current = snapshot?.current || this.deps.lightweightStatus();
    const latest = snapshot ? snapshot.latest : (this.deps.latestProductBatchStatus?.(PRODUCT_CHANNEL) || null);
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
    const resumableCount = this.observedBatchId
      ? (latest?.resumable === true || snapshot?.observed_recoverable === true ? 1 : 0)
      : latest?.resumable === true ? Math.max(1, recoverable, awaitingResume) : Math.max(recoverable, awaitingResume);
    const resumable = resumableCount > 0;
    const intakePending = current.local_intake_pending === true;
    const processing = current.batch_processing_active === true || latest?.processing === true;
    const preparing = intakePending && !processing;
    const selected = Number.isSafeInteger(latest?.selected_count) ? latest.selected_count : 0;
    const completed = Number.isSafeInteger(latest?.completed_count) ? latest.completed_count : 0;
    const state = current.engine_ready !== true
      ? 'blocked'
      : preparing
        ? 'preparing'
      : processing
        ? 'processing'
        : reviewReady
          ? 'review_required'
        : resumable
          ? 'stopped'
          : exportPending > 0 || completionPending
            ? 'export_pending'
          : packages > 0
            ? 'results_available'
            : latest?.complete === true && failed > 0
              ? 'completed_without_results'
            : 'ready';
    const currentBatchId = snapshot && Object.hasOwn(snapshot, 'observed_batch_id')
      ? snapshot.observed_batch_id : (this.observedBatchId || undefined);
    const presentationGeneration = this.deps.pendingStandaloneTerminalNoticeGeneration?.(currentBatchId);
    this.terminalPresentation = Number.isSafeInteger(presentationGeneration) && presentationGeneration > 0
      ? { generation: presentationGeneration, batchId: currentBatchId } : null;
    return {
      ok: current.engine_ready === true,
      product_channel: PRODUCT_CHANNEL,
      state,
      processing_mode: latest?.processing_mode || MODES.ANONYMIZE,
      warning_count: Number.isSafeInteger(latest?.warning_count) ? latest.warning_count : 0,
      ...(latest?.termination_unconfirmed === true ? { termination_unconfirmed: true } : {}),
      preparing,
      processing,
      review_required: reviewReady,
      resumable,
      results_available: packages > 0,
      result_count: packages,
      selected_count: selected,
      completed_count: completed,
      failed_count: failed,
      ...(latest?.complete === true && failed > 0 ? { ledger_available: latest.completion_available === true } : {}),
      export_pending_count: exportPending,
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
    const acknowledged = presented?.generation === presentationGeneration &&
      (!this.observedBatchId || presented.batchId === this.observedBatchId) &&
      this.deps.acknowledgeStandaloneTerminalNotice?.(presentationGeneration, presented.batchId) === true;
    if (acknowledged) this.terminalPresentation = null;
    return { ok: true,
      acknowledged: acknowledged === true,
      external_disclosure: false };
  }

  history() {
    return this.deps.runHistory.history();
  }

  resolveHistoryResults(batchId) {
    validateBatchId(batchId);
    return this.deps.runHistory.resolveResults(batchId);
  }

  resolveHistoryLedger(batchId) {
    validateBatchId(batchId);
    return this.deps.runHistory.resolveLedger(batchId);
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
      catch { throw fixedFailure('STANDALONE_START_FAILED', 'Der lokale Start wurde nicht bestätigt. Bitte den Status prüfen.'); }
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
        allowedTypes: ['txt', 'md', 'csv', 'docx'], signal
      });
    }
    return this.deps.pickSourcesAsync({ allowedTypes: ['txt', 'md', 'csv', 'docx'], signal });
  }

  async admitSelectedSources(sourcePaths, sourceKind = 'files', signal) {
    validateChoice(sourceKind, SOURCE_KINDS, 'files');
    if (!Array.isArray(sourcePaths) || sourcePaths.length < 1 || sourcePaths.length > 100) {
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
      const selected = sourceKind === 'folder'
        ? await this.deps.enumerateSourceFolderAsync(sourcePaths[0], {
            allowedTypes: CONVERSION_TYPES, signal
          })
        : await Promise.all(sourcePaths.map((candidate) => this.deps.validateSelectedPathAsync(candidate, {
            allowedTypes: CONVERSION_TYPES, signal
          })));
      const queue = this.deps.batchQueueFromSelection(selected);
      if (!Array.isArray(queue) || queue.length < 1 || queue.some((item) =>
        !item || typeof item.full !== 'string' || !path.isAbsolute(item.full) ||
        typeof item.name !== 'string' || item.name.length < 1 || path.basename(item.full) !== item.name ||
        !Number.isSafeInteger(item.sourceBytes) || item.sourceBytes < 1)) {
        throw fixedFailure('STANDALONE_SELECTION_INVALID', 'Die lokale Dateiauswahl ist ungültig.');
      }
      const totalBytes = queue.reduce((sum, item) => sum + item.sourceBytes, 0);
      if (!Number.isSafeInteger(totalBytes) || totalBytes > RESOURCE_LIMITS.MAX_BATCH_TOTAL_BYTES) {
        throw fixedFailure('STANDALONE_SELECTION_INVALID', 'Der ausgewählte Stapel überschreitet die zulässige Gesamtgröße.');
      }
      this.admittedQueue = queue;
      const folders = [...new Set((sourceKind === 'folder' ? sourcePaths : queue.map((item) => path.dirname(item.full)))
        .map((candidate) => path.resolve(candidate)))];
      this.selectionContext = {
        sourceKind,
        sourceFolders: folders,
        selectedFiles: queue.map((item) => item.name)
      };
      const uiContext = this.uiContext();
      return {
        ok: true, event: 'selection_summarized', selected_count: queue.length,
        total_bytes: totalBytes,
        direct_count: queue.length, convertible_count: 0, blocked_count: 0,
        encrypted_count: 0, ui_context: uiContext, external_disclosure: false
      };
    } catch (error) {
      this.admittedQueue = null;
      if (signal?.aborted || error?.code === 'LOCAL_SELECTION_CANCELLED') {
        throw fixedFailure('STANDALONE_SELECTION_CANCELLED', 'Die Auswahl wurde abgebrochen.');
      }
      throw error;
    } finally {
      this.interactionActive = false;
    }
  }

  cancelAdmission() {
    this.admittedQueue = null;
    this.selectionContext = null;
    return { ok: true, event: 'admission_cancelled', external_disclosure: false };
  }

  uiContext() {
    this.observeCurrentRun();
    const selected = this.selectionContext;
    const configured = this.deps.readConfiguredResultRoot();
    let latestResultFolder = '';
    // Reading the visible context is also the upgrade/recovery boundary for an
    // already completed run.  Older export records did not contain the fields
    // required for the run-scoped mapping.  Resolve with ensureExport so the
    // UI never advertises a completed run whose visible projection is stale.
    try {
      latestResultFolder = this.observedBatchId
        ? this.deps.runHistory.resolveResults(this.observedBatchId).local_path
        : this.deps.latestProductResultDirectory?.(PRODUCT_CHANNEL, { ensureExport: true, latestBatchOnly: true }) || '';
    }
    catch { /* A local display hint must never affect processing. */ }
    return {
      ok: true,
      result_folder: configured || defaultResultRoot({ home: this.home }),
      latest_result_folder: latestResultFolder,
      result_folder_is_default: !configured,
      source_kind: selected?.sourceKind || null,
      source_folders: selected ? [...selected.sourceFolders] : [],
      selected_files: selected ? [...selected.selectedFiles] : [],
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
    if (!options || typeof options !== 'object' || Array.isArray(options) ||
        Object.keys(options).some((key) => !['profile', 'processingMode'].includes(key))) {
      throw fixedFailure('PROCESSING_MODE_INVALID', 'Ungültiger Verarbeitungsmodus.');
    }
    const processingMode = assertRunnableProcessingMode(options.processingMode, PRODUCT_CHANNEL);
    const profile = validateChoice(options.profile, PROFILES, 'auto');
    const queue = this.admittedQueue;
    if (!Array.isArray(queue) || queue.length < 1) {
      throw fixedFailure('STANDALONE_NO_ADMISSION', 'Bitte zuerst Dateien oder einen Ordner auswählen.');
    }
    this.ensureResultRoot();
    let reservation;
    let transferred = false;
    try {
      reservation = this.deps.reserveIntake();
      this.observedBatchId = null;
      this.terminalPresentation = null;
      const started = this.deps.startLocalIntakeExecutor(queue, profile, {
        intakeReservationId: reservation.reservation_id, signal, processingMode
      });
      transferred = true;
      try {
        await confirmedIntakeStart(started);
      } catch {
        // Once the reservation has been delegated, a missing acknowledgement
        // is an uncertain start. Never reuse the same admission: the worker may
        // still reach its durable checkpoint after the caller timed out.
        this.admittedQueue = null;
        this.trace('standalone_batch_stopped', { outcome: 'stopped', error_code: 'STANDALONE_START_FAILED' });
        throw fixedFailure('STANDALONE_START_FAILED', 'Der lokale Start wurde nicht bestätigt. Bitte den Status prüfen und die Dateien nicht erneut starten.');
      }
      this.admittedQueue = null;
      this.trace('standalone_batch_accepted', { outcome: 'ok', item_count: queue.length });
      return { ok: true, event: 'batch_accepted', selected_count: queue.length, external_disclosure: false };
    } finally {
      if (reservation && !transferred) this.deps.releaseIntake(reservation.reservation_id);
    }
  }

  async continueCurrentBatch(signal) {
    if (this.interactionActive || this.admittedQueue?.length > 0) throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Vorgang ist bereits aktiv.');
    if (this.observedBatchId) return this.continueHistoryBatch(this.observedBatchId, signal);
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
    } catch {
      throw fixedFailure('STANDALONE_START_FAILED', 'Der lokale Start wurde nicht bestätigt. Bitte den Status prüfen.');
    }
    return { ok: true, event: 'batch_continued', external_disclosure: false };
  }

  async anonymize(options = {}) {
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
      const started = this.deps.startLocalIntakeExecutor(selected, profile, {
        intakeReservationId: reservation.reservation_id, signal
      });
      transferred = true;
      await confirmedIntakeStart(started);
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
      const status = this.deps.lightweightStatus();
      if (status.local_intake_pending || status.batch_processing_active) {
        throw fixedFailure('STANDALONE_BUSY', 'Der Ergebnisordner kann während einer Verarbeitung nicht geändert werden.');
      }
      const selected = options.path || await this.deps.pickFolderAsync({ signal: options.signal, purpose: 'result' });
      const dataRoot = process.env.EU_PRIVACY_DATA_ROOT || standaloneDataRoot();
      if (pathsOverlap(dataRoot, selected)) {
        throw fixedFailure('STANDALONE_RESULT_ROOT_UNSAFE', 'Der Ergebnisordner muss außerhalb des privaten DataSecure-Bereichs liegen.');
      }
      try { this.deps.runHistory?.history(); } catch { /* retain every safely readable prior export binding */ }
      this.deps.resultOutputDirectory({ root: selected });
      this.deps.saveConfiguredResultRoot(selected);
      let replay = null;
      try { replay = this.deps.replayPendingResultExports?.() || null; }
      catch { replay = { pending: true }; }
      return { ok: true, configuration_changed: true, result_folder: selected,
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
  standaloneDataRoot, defaultResultRoot, activateStandaloneNamespace
};
