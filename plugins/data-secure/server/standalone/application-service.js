'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PRODUCT_CHANNEL = 'standalone';
const SOURCE_KINDS = new Set(['files', 'folder']);
const PROFILES = new Set(['auto', 'customer', 'applicant', 'personnel_profile', 'contract', 'general']);
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
  const root = path.resolve(options.dataRoot || standaloneDataRoot(options));
  const io = options.fs || fs;
  io.mkdirSync(root, { recursive: true, mode: 0o700 });
  const named = io.lstatSync(root);
  const real = io.realpathSync.native ? io.realpathSync.native(root) : io.realpathSync(root);
  const comparable = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (!named.isDirectory() || named.isSymbolicLink() || comparable(real) !== comparable(root)) {
    throw fixedFailure('STANDALONE_DATA_ROOT_UNSAFE', 'Der lokale DataSecure-Bereich ist nicht sicher.');
  }
  const workspace = path.join(root, 'workspace');
  io.mkdirSync(workspace, { recursive: true, mode: 0o700 });
  const workspaceStat = io.lstatSync(workspace);
  if (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink()) {
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
  const filePicker = require('../companion/file-picker');
  const sourceFolder = require('../companion/source-folder');
  const resultFolder = require('../gateway/result-folder-config');
  const supportTrace = require('../gateway/support-trace');
  const { genericStatus } = require('../gateway/status');
  const {
    continueMostRecentBatch, openBatchPackageProtection, recoverBatches,
    replayMappingOutbox, cleanupExpiredBatchSnapshots
  } = require('../gateway/batch');
  const { cleanupLocalData } = require('../gateway/retention');
  const { initializeProduct } = require('../core/product-bootstrap');
  const { verifyBundledRuntime, refuseStartup } = require('../gateway/startup-guard');
  const { migrateLegacyAuditReceipts } = require('../gateway/audit');
  const { mappingPath } = require('../gateway/mapping');
  const { cleanupCompanionJobs } = require('../companion/retention');
  const { cleanupAbandonedWorkingJobs } = require('../gateway/orchestrator');
  const { startBatchMaintenance } = require('../gateway/batch-maintenance');
  return {
    initializeProduct() {
      if (!standaloneStartup) standaloneStartup = initializeProduct({
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
        refuseStartup
      });
      return standaloneStartup;
    },
    genericStatus,
    startLocalIntakeExecutor: require('../gateway/batch-executor').startLocalIntakeExecutor,
    startLocalBatchExecutor: require('../gateway/batch-executor').startLocalBatchExecutor,
    startLocalReviewExecutor: require('../gateway/batch-executor').startLocalReviewExecutor,
    continueMostRecentBatch,
    openFolder: require('../gateway/common').openFolder,
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
    mappingPath,
    recordSupportTrace: supportTrace.recordSupportTrace,
    newTraceId: supportTrace.newTraceId,
    fs
  };
}

function fixedFailure(code, message) {
  return Object.assign(new Error(message), { code });
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

  status() {
    const current = this.deps.genericStatus({ ignoreIntakeReservation: true });
    const packages = Number.isSafeInteger(current.anonymized_packages) ? current.anonymized_packages : 0;
    const reviews = Number.isSafeInteger(current.visual_review_items) ? current.visual_review_items : 0;
    const recoverable = Number.isSafeInteger(current.recoverable_batches) ? current.recoverable_batches : 0;
    const awaitingResume = Number.isSafeInteger(current.batches_awaiting_resume) ? current.batches_awaiting_resume : 0;
    const resumableCount = Math.max(recoverable, awaitingResume);
    const resumable = resumableCount > 0;
    const processing = current.local_intake_pending === true || current.batch_processing_active === true;
    const state = current.engine_ready !== true
      ? 'blocked'
      : processing
        ? 'processing'
        : reviews > 0
          ? 'review_required'
          : resumable
            ? 'stopped'
          : packages > 0
            ? 'results_available'
            : 'ready';
    return {
      ok: current.engine_ready === true,
      product_channel: PRODUCT_CHANNEL,
      state,
      processing,
      review_required: reviews > 0,
      resumable,
      results_available: packages > 0,
      result_count: packages,
      review_count: reviews,
      resumable_count: resumableCount,
      recoverable_count: recoverable,
      awaiting_resume_count: awaitingResume,
      external_disclosure: false
    };
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
    const status = this.deps.genericStatus({ ignoreIntakeReservation: true });
    if (!status.engine_ready) throw fixedFailure('STANDALONE_ENGINE_NOT_READY', 'Die lokale Verarbeitung ist nicht bereit.');
    if (status.local_intake_pending || status.batch_processing_active) {
      throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Stapel wird bereits verarbeitet.');
    }
    this.interactionActive = true;
    try {
      const selected = sourceKind === 'folder'
        ? await this.deps.enumerateSourceFolderAsync(sourcePaths[0], {
            allowedTypes: ['txt', 'md', 'csv', 'docx'], signal
          })
        : await Promise.all(sourcePaths.map((candidate) => this.deps.validateSelectedPathAsync(candidate, {
            allowedTypes: ['txt', 'md', 'csv', 'docx'], signal
          })));
      const queue = this.deps.batchQueueFromSelection(selected);
      this.admittedQueue = queue;
      return {
        ok: true, event: 'selection_summarized', selected_count: queue.length,
        total_bytes: queue.reduce((sum, item) => sum + item.sourceBytes, 0),
        direct_count: queue.length, convertible_count: 0, blocked_count: 0,
        encrypted_count: 0, external_disclosure: false
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
    return { ok: true, event: 'admission_cancelled', external_disclosure: false };
  }

  async startAdmittedBatch(profile = 'auto', signal) {
    validateChoice(profile, PROFILES, 'auto');
    const queue = this.admittedQueue;
    if (!Array.isArray(queue) || queue.length < 1) {
      throw fixedFailure('STANDALONE_NO_ADMISSION', 'Bitte zuerst Dateien oder einen Ordner auswählen.');
    }
    this.ensureResultRoot();
    let reservation;
    let transferred = false;
    try {
      reservation = this.deps.reserveIntake();
      const started = this.deps.startLocalIntakeExecutor(queue, profile, {
        intakeReservationId: reservation.reservation_id, signal
      });
      transferred = true;
      await started.ipcAcknowledgement;
      this.admittedQueue = null;
      this.trace('standalone_batch_accepted', { outcome: 'ok', item_count: queue.length });
      return { ok: true, event: 'batch_started', selected_count: queue.length, external_disclosure: false };
    } finally {
      if (reservation && !transferred) this.deps.releaseIntake(reservation.reservation_id);
    }
  }

  async continueCurrentBatch(signal) {
    const status = this.deps.genericStatus({ ignoreIntakeReservation: true });
    if (status.local_intake_pending || status.batch_processing_active) {
      throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Stapel wird bereits verarbeitet.');
    }
    const continued = this.deps.continueMostRecentBatch();
    if (continued.ok !== true) {
      throw fixedFailure('STANDALONE_NOTHING_TO_CONTINUE', 'Es gibt keinen fortsetzbaren lokalen Stapel.');
    }
    const started = continued.awaiting_local_review === true || continued.deferred_review > 0
      ? this.deps.startLocalReviewExecutor(continued.batch_token, { requireIpcAcknowledgement: true, signal })
      : this.deps.startLocalBatchExecutor(continued.batch_token, { requireIpcAcknowledgement: true, signal });
    await started.ipcAcknowledgement;
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
      const status = this.deps.genericStatus({ ignoreIntakeReservation: true });
      if (!status.engine_ready) throw fixedFailure('STANDALONE_ENGINE_NOT_READY', 'Die lokale Verarbeitung ist nicht bereit.');
      if (status.local_intake_pending || status.batch_processing_active) {
        throw fixedFailure('STANDALONE_BUSY', 'Ein lokaler Stapel wird bereits verarbeitet.');
      }
      this.ensureResultRoot();
      reservation = this.deps.reserveIntake();
      const picked = await this.selectSources(sourceKind, signal);
      const selected = this.deps.batchQueueFromSelection(picked);
      this.trace('standalone_picker_completed', { trace_id: traceId, outcome: 'ok', item_count: selected.length });
      const started = this.deps.startLocalIntakeExecutor(selected, profile, {
        intakeReservationId: reservation.reservation_id, signal
      });
      transferred = true;
      await started.ipcAcknowledgement;
      this.trace('standalone_batch_accepted', { trace_id: traceId, outcome: 'ok', item_count: selected.length });
      return {
        ok: true,
        product_channel: PRODUCT_CHANNEL,
        operation_accepted: true,
        selected_count: selected.length,
        state: 'processing_local',
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
      const status = this.deps.genericStatus({ ignoreIntakeReservation: true });
      if (status.local_intake_pending || status.batch_processing_active) {
        throw fixedFailure('STANDALONE_BUSY', 'Der Ergebnisordner kann während einer Verarbeitung nicht geändert werden.');
      }
      const selected = options.path || await this.deps.pickFolderAsync({ signal: options.signal, purpose: 'result' });
      const dataRoot = process.env.EU_PRIVACY_DATA_ROOT || standaloneDataRoot();
      if (pathsOverlap(dataRoot, selected)) {
        throw fixedFailure('STANDALONE_RESULT_ROOT_UNSAFE', 'Der Ergebnisordner muss außerhalb des privaten DataSecure-Bereichs liegen.');
      }
      this.deps.resultOutputDirectory({ root: selected });
      this.deps.saveConfiguredResultRoot(selected);
      return { ok: true, configuration_changed: true, external_disclosure: false };
    } finally { this.interactionActive = false; }
  }

  async openResults() {
    this.ensureResultRoot();
    const target = this.deps.resultOutputDirectory();
    const opened = this.deps.openFolder(target);
    if (!opened?.ok) {
      throw fixedFailure('STANDALONE_RESULT_OPEN_FAILED', 'Der Ergebnisordner konnte nicht geöffnet werden.');
    }
    return { ok: true, opened: true, external_disclosure: false };
  }

  async openLedger() {
    const target = this.deps.mappingPath();
    if (!this.deps.fs.existsSync(target)) {
      throw fixedFailure('STANDALONE_LEDGER_MISSING', 'Es ist noch keine lokale Zuordnung vorhanden.');
    }
    const opened = this.deps.openFolder(path.dirname(target));
    if (!opened?.ok) {
      throw fixedFailure('STANDALONE_LEDGER_OPEN_FAILED', 'Der Ordner mit der lokalen Zuordnung konnte nicht geöffnet werden.');
    }
    return { ok: true, opened: true, external_disclosure: false };
  }
}

module.exports = {
  StandaloneApplicationService, SOURCE_KINDS, PROFILES, PRODUCT_CHANNEL,
  standaloneDataRoot, defaultResultRoot, activateStandaloneNamespace
};
