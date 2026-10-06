'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { processingModeForBatch } = require('../core/processing-mode');
const { convertNext } = require('../standalone/convert-next');
const identityLedger = require('../standalone/identity-ledger');
const { PROFILES, LIMITS, validateBatchLimits, storageStatus, hasReparseComponent } = require('./common');
const { anonymizeNext, prepareProcessingRun } = require('./orchestrator');
const { retentionDays } = require('./retention');
const { appendMapping, ensureMappingOutbox, removeMappingOutbox, readOutboxEntries, STOPPED: MAPPING_STOPPED } = require('./mapping');
const { sameDocumentResult, notProcessedDocumentResult } = require('./document-result-grade');
const { capturePackageIdentity, samePackageIdentity } = require('./package-identity');
const { createBatchTerminalEvidence } = require('./batch-terminal-evidence');
const { createBatchResultAccess } = require('./batch-results');
const { createBatchProgress } = require('./batch-progress');
const { createBatchExecutorLease } = require('./batch-executor-lease');
const { createBatchJournalStore } = require('./batch-journal-store');
const { createBatchReconciliation } = require('./batch-reconciliation');
const { createBatchRecovery } = require('./batch-recovery');
const { createBatchRetentionProtection } = require('./batch-retention-protection');
const { createBatchDelivery } = require('./batch-delivery');
const { createBatchMappingMaintenance } = require('./batch-mapping-maintenance');
const { createBatchIntake } = require('./batch-intake');
const { createBatchDiscard } = require('./batch-discard');
const { createBatchContinuation } = require('./batch-continuation');
const { createBatchSnapshotInvalidation } = require('./batch-snapshot-invalidation');
const { createBatchExecutorRunner } = require('./batch-executor-runner');
const { createBatchReviewCapture } = require('./batch-review-capture');
const { createBatchReviewState } = require('./batch-review-state');
const { createBatchReviewPublication } = require('./batch-review-publication');
const { createBatchReviewOrchestrator } = require('./batch-review-orchestrator');
const { createBatchItemProcessor } = require('./batch-item-processor');
const { createBatchNextMaintenance } = require('./batch-next-maintenance');
const { createBatchProcessingOrchestrator } = require('./batch-processing-orchestrator');
const { releaseOwnedLock } = require('./batch-lock-release');
const { processInstanceIdentity } = require('./process-identity');
const { exportCompletedState, visibleExportStatus, visibleExportDirectory } = require('./result-export');
const { planBatchAdmission } = require('./batch-source-admission');
const { localReviewError, reviewSingleBatchTextLocally, reviewedBatchText } = require('./batch-review-policy');
const { writeFully, syncParentDirectory } = require('./batch-journal-io');
const {
  assertStagingCapacity,
  preflightOoxmlContainers,
  copySnapshotFile,
  exactPendingEntry
} = require('./batch-snapshot');
const { TOKEN_RE, batchRoot, batchPath, workPath, safeRemoveWorkDirectory } = require('./batch-private-store');
const {
  activeLockPath,
  processAlive,
  liveLocalExecutor,
  validActiveLock,
  readActiveLock,
  acquireActiveLock,
  releaseActiveLock
} = require('./batch-active-lock');
const {
  createPhaseRecorder,
  createPrivateIoSummary,
  incrementPrivateIoSummary
} = require('./performance');
const { reviewTextLocally, reviewBatchTextLocally: runBatchReviewLocally } = require('../companion/text-review');
const { createPrivateWorkStore } = require('./private-work-store');
const { migrateLegacyBatchState } = require('./batch-private-artifact-migration');
const {
  createBatchPseudonymState,
  validateBatchPseudonymState,
  withBatchPseudonymRegistry
} = require('../batch-pseudonym-context');

const active = new Set();
const RETRYABLE_CODES = new Set(['REQUEST_CANCELLED', 'PARSER_TIMEOUT', 'PARSER_START_FAILED',
  'CONVERSION_TIMEOUT', 'CONVERSION_START_FAILED',
  'CONVERSION_EXECUTABLE_MISSING', 'CONVERSION_EXECUTABLE_DENIED',
  'CONVERSION_ARCHITECTURE_INVALID', 'CONVERSION_DEPENDENCY_MISSING',
  'PROCESSING_INTERRUPTED', 'LOCAL_CAPACITY_UNAVAILABLE', 'LOCAL_CAPACITY_INSUFFICIENT', 'LOCAL_CAPACITY_RACE']);

function recoverableWithCurrentPolicy(state) {
  try {
    if (processingModeForBatch(state) === 'markdown-only') return true;
    // Published delivery and already committed mapping debt are independent
    // projections; they do not reopen privacy processing and remain safely
    // repairable after a detector/pseudonym ruleset upgrade.
    const needsPrivacyContext = state.items.some((item) =>
      ['pending', 'processing', 'retryable', 'deferred_review'].includes(item.status));
    if (!needsPrivacyContext) return true;
    const seed = validateBatchPseudonymState(state);
    seed.fill(0);
    return true;
  } catch {
    return false;
  }
}
const DELIVERY_PENDING = 'delivery_pending';
const DEFERRED_REVIEW = 'deferred_review';
const MAPPING_PENDING = 'mapping_pending';
const PREFLIGHT_MAPPING_PENDING = 'preflight_mapping_pending';

const privateWorkStore = Object.freeze({
  ensureReady: () => createPrivateWorkStore({ privateRoot: batchRoot() }).ensureReady(),
  writeFile: (...args) => createPrivateWorkStore({ privateRoot: batchRoot() }).writeFile(...args),
  readFile: (...args) => createPrivateWorkStore({ privateRoot: batchRoot() }).readFile(...args)
});
const contactStore = require('./ocr-contact-store').createContactStore({ privateWorkStore, workPath });

function plainExactPendingEntry(state, item) {
  migrateLegacyBatchState(state, { privateWorkStore, writeState });
  const current = state.items.find((candidate) => candidate.id === item.id);
  if (!current) throw new SafeError('Die migrierte private Arbeitskopie wurde nicht gefunden.');
  return exactPendingEntry(state, current, { privateWorkStore });
}

const { openBatchPackageProtection } = createBatchRetentionProtection({
  io: fs,
  path,
  batchRoot,
  deliveryPendingStatus: DELIVERY_PENDING,
  mappingPendingStatus: MAPPING_PENDING
});

function batchTtlMs() {
  // A stopped batch is useful only while its private snapshot is retained.
  // A zero-day retention deliberately expires paused batches at the end of the
  // current operation rather than retaining their source bytes.
  return retentionDays() * 24 * 60 * 60 * 1000;
}

const { writeState, readState, readStateForMaintenance, removeState } = createBatchJournalStore({
  productChannel: String(process.env.DATASECURE_PRODUCT_CHANNEL || 'plugin'),
  onStateWritten: (state) => {
    if (state.product_channel === 'standalone') {
      require('./standalone-history-store').recordStandaloneState(state);
      try { identityLedger.pruneStopped(state); }
      catch { /* an unsafe private path is left untouched; no anonymized result changes */ }
      if (state.processing_mode !== 'markdown-only' && state.items?.some((item) => item.status === 'released') &&
          state.items.every((item) => item.status === 'released' || item.status === 'stopped')) {
        try { identityLedger.materialize(state); }
        catch { /* private mapping is visibly absent/incomplete; the privacy result remains valid */ }
      }
    }
  },
  assertZeroDayWorkAvailable(state) {
    if (state.zero_day_work_ended !== true && !liveLocalExecutor(state) && !processAlive(state.intake_owner_pid)) {
      throw new SafeError('Die Aufbewahrung der privaten Arbeitskopien ist nach dem Laufende abgelaufen. Bitte die Originaldateien neu auswählen.');
    }
  }
});

const withDurableBatchPseudonymRegistry = (state, action) =>
  withBatchPseudonymRegistry(state, action, { persist: writeState });

// Zero days controls SOURCE COPIES, not the time allowed to run a batch or
// discover its completed exports. Journals keep the normal seven-day result
// discovery window. A paused zero-day run cannot resume without new originals.
function finishZeroDayWork(state) {
  if (state.zero_day_work !== true || state.zero_day_work_cleaned === true || liveLocalExecutor(state)) return false;
  reconcilePublishedItems(state);
  reconcilePendingMappings(state);
  for (const item of state.items) {
    if (!['pending', 'processing', 'retryable', DEFERRED_REVIEW].includes(item.status)) continue;
    item.status = 'stopped';
    item.checkpoint = 'work_retention_expired';
    item.error_code = 'RECOVERY_FAILED';
    item.document_result = notProcessedDocumentResult(item.error_code);
    item.local_mapping_exported = false;
    delete item.package_id;
  }
  delete state.intake_owner_pid;
  state.zero_day_work_ended = true;
  // The stop decisions are durable before removing the source copies. Mapping
  // and cleanup debts use the existing recovery paths, not another scheduler.
  for (const item of state.items) if (item.work_name) item.work_copy_cleanup_pending = true;
  writeState(state);
  reconcilePreflightStoppedMappings(state);
  try {
    safeRemoveWorkDirectory(state.token);
    state.zero_day_work_cleaned = true;
    for (const item of state.items) delete item.work_copy_cleanup_pending;
  } catch { /* retain the cleanup debt and every legacy envelope */ }
  writeState(state);
  writeTerminalEvidence(state);
  return true;
}

const {
  packageIdForItem,
  publishedPackageRecord,
  publishedPackageIdentityRecord,
  publishedPackageState,
  regularPublishedPackage,
  markMappingPending,
  commitPendingMapping,
  reconcilePendingMappings,
  reconcilePreflightStoppedMappings,
  reconcilePublishedItems,
  markInterruptedItemsRetryable
} = createBatchReconciliation({
  SafeError,
  fs,
  path,
  ensureMappingOutbox,
  appendMapping,
  removeMappingOutbox,
  mappingPendingStatus: MAPPING_PENDING,
  preflightMappingPendingStatus: PREFLIGHT_MAPPING_PENDING,
  deliveryPendingStatus: DELIVERY_PENDING
});

const { batchUserStatus, publicProgress } = createBatchProgress({
  deliveryPendingStatus: DELIVERY_PENDING,
  deferredReviewStatus: DEFERRED_REVIEW,
  mappingPendingStatus: MAPPING_PENDING,
  preflightMappingPendingStatus: PREFLIGHT_MAPPING_PENDING,
  liveLocalExecutor,
  publishedPackageRecord: publishedPackageIdentityRecord
});

const { beginBatch } = createBatchIntake({
  SafeError,
  io: fs,
  path,
  crypto,
  profiles: PROFILES,
  limits: LIMITS,
  validateBatchLimits,
  storageStatus,
  hasReparseComponent,
  planBatchAdmission,
  assertStagingCapacity,
  tokenPattern: TOKEN_RE,
  batchPath,
  workPath,
  copySnapshotFile,
  privateWorkStore,
  batchTtlMs,
  createPrivateIoSummary,
  writeState,
  readStateForMaintenance,
  safeRemoveWorkDirectory,
  publicProgress,
  preflightMappingPendingStatus: PREFLIGHT_MAPPING_PENDING,
  createBatchPseudonymState
});

const {
  assertLocalExecutorAccess,
  claimLocalBatchExecutor,
  releaseLocalBatchExecutor
} = createBatchExecutorLease({
  SafeError,
  processAlive,
  liveLocalExecutor,
  acquireActiveLock,
  releaseActiveLock,
  readState,
  writeState,
  publicProgress,
  processInstanceIdentity,
  // The claimant holds the global item lock at this point, so the scan must
  // ignore that lock and look at every other journal's durable lease instead.
  otherLiveExecutor: (token) => recoverableBatchStates({ ignoreActiveLock: true, includeActiveExecutors: true })
    .some((state) => state.token !== token && liveLocalExecutor(state))
});

const {
  writeTerminalEvidence,
  repairPendingEvidenceOutbox
} = createBatchTerminalEvidence({
  randomBytes: crypto.randomBytes,
  publicProgress,
  writeState,
  publishedPackageRecord,
  publishedPackageIdentityRecord,
  capturePackageIdentity,
  samePackageIdentity
});

const {
  deliveryResult,
  cleanupTerminalWorkCopy,
  acknowledgeDeliveredPackage,
  acknowledgeDeliveredPackages,
  finalizePublishedPackageLocally,
  retryReleasedWorkCopyCleanup
} = createBatchDelivery({
  SafeError,
  io: fs,
  path,
  workPath,
  active,
  acquireActiveLock,
  releaseActiveLock,
  readState,
  writeState,
  assertLocalExecutorAccess,
  regularPublishedPackage,
  issueReadCapability: (packageId) => require('./package-store').issueReadCapability(packageId),
  publicProgress,
  writeTerminalEvidence,
  deliveryPendingStatus: DELIVERY_PENDING,
  mappingPendingStatus: MAPPING_PENDING
});

const { replayMappingOutbox } = createBatchMappingMaintenance({
  readOutboxEntries,
  publishedPackageRecord,
  publishedPackageState,
  appendMapping,
  removeMappingOutbox
});

const {
  recoverableBatchStates,
  recoverableBatchStatus,
  productStatusSnapshot,
  latestProductBatchStatus,
  latestProductResultDirectory,
  localCleanupStatus,
  recoverBatches,
  cleanupExpiredBatchSnapshots
} = createBatchRecovery({
  io: fs,
  randomBytes: crypto.randomBytes,
  tokenPattern: TOKEN_RE,
  batchRoot,
  batchPath,
  safeRemoveWorkDirectory,
  readStateForMaintenance,
  writeState,
  readActiveLock,
  processAlive,
  acquireActiveLock,
  releaseActiveLock,
  liveLocalExecutor,
  publicProgress,
  exportCompletedState,
  visibleExportStatus,
  visibleExportDirectory,
  reconcilePublishedItems,
  reconcilePendingMappings,
  reconcilePreflightStoppedMappings,
  markInterruptedItemsRetryable,
  retryReleasedWorkCopyCleanup,
  reconcileTerminalEvidence: writeTerminalEvidence,
  repairPendingEvidenceOutbox,
  finishZeroDayWork,
  removeState,
  deliveryPendingStatus: DELIVERY_PENDING,
  deferredReviewStatus: DEFERRED_REVIEW,
  mappingPendingStatus: MAPPING_PENDING,
  preflightMappingPendingStatus: PREFLIGHT_MAPPING_PENDING,
  recoverableState: recoverableWithCurrentPolicy
});

const { discardIncompleteBatches } = createBatchDiscard({
  SafeError,
  io: fs,
  randomBytes: crypto.randomBytes,
  batchPath,
  safeRemoveWorkDirectory,
  acquireActiveLock,
  releaseActiveLock,
  recoverableBatchStates,
  liveLocalExecutor,
  removeState
});

const { resumeBatch, continueMostRecentBatch, continueStandaloneBatch } = createBatchContinuation({
  SafeError,
  liveLocalExecutor,
  active,
  acquireActiveLock,
  releaseActiveLock,
  readState,
  readStateForMaintenance,
  writeState,
  assertLocalExecutorAccess,
  reconcilePublishedItems,
  reconcilePendingMappings,
  reconcilePreflightStoppedMappings,
  markInterruptedItemsRetryable,
  recoverableBatchStates,
  publicProgress,
  deferredReviewStatus: DEFERRED_REVIEW,
  mappingPendingStatus: MAPPING_PENDING,
  preflightMappingPendingStatus: PREFLIGHT_MAPPING_PENDING
});

function readStandaloneHistoryStates() {
  const states = [];
  let entries;
  try { entries = fs.readdirSync(batchRoot(), { withFileTypes: true }); } catch { return states; }
  for (const entry of entries) {
    if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/u.test(entry.name)) continue;
    try {
      const state = readStateForMaintenance(entry.name.slice(0, -5));
      if (state.product_channel === 'standalone') states.push(state);
    } catch { /* read-only: damaged or unsupported journals remain untouched */ }
  }
  return states;
}

function standaloneRecoverableStates() {
  return recoverableBatchStates().filter((state) => state.product_channel === 'standalone');
}

const { invalidateUnpublishedBatchCopies } = createBatchSnapshotInvalidation({
  appendMapping,
  cleanupTerminalWorkCopy,
  writeState,
  deferredReviewStatus: DEFERRED_REVIEW,
  mappingStoppedStatus: MAPPING_STOPPED
});

const { resultCursor, parseResultCursor, listBatchResults, completedLocalOnlyCandidates, verifyCompletedLocalOnlyGeneration } = createBatchResultAccess({
  SafeError,
  fs,
  tokenPattern: TOKEN_RE,
  batchRoot,
  readState,
  readStateForMaintenance,
  publicProgress,
  liveLocalExecutor,
  publishedPackageRecord,
  publishedPackageIdentityRecord,
  sameDocumentResult,
  issueReadCapability: (packageId) => require('./package-store').issueReadCapability(packageId)
});

const { captureDeferredReviewInput } = createBatchReviewCapture({
  contactStore,
  anonymizeNext,
  exactPendingEntry: plainExactPendingEntry,
  packageIdForItem,
  localReviewError,
  withBatchPseudonymRegistry: withDurableBatchPseudonymRegistry
});

const { markDeferredReview, deferredReviewPlan } = createBatchReviewState({
  deferredReviewStatus: DEFERRED_REVIEW
});

const { publishReviewedBatch } = createBatchReviewPublication({
  contactStore,
  anonymizeNext,
  exactPendingEntry: plainExactPendingEntry,
  packageIdForItem,
  reviewedBatchText,
  writeState,
  ensureMappingOutbox,
  markMappingPending,
  cleanupTerminalWorkCopy,
  commitPendingMapping,
  deliveryResult,
  appendMapping,
  invalidDecisionError: localReviewError,
  deliveryPendingStatus: DELIVERY_PENDING,
  retryableCodes: RETRYABLE_CODES,
  mappingStoppedStatus: MAPPING_STOPPED,
  withBatchPseudonymRegistry: withDurableBatchPseudonymRegistry,
  captureStandaloneIdentitySnapshot: identityLedger.capture
});

const { reviewDeferredBatch } = createBatchReviewOrchestrator({
  SafeError,
  active,
  acquireActiveLock,
  releaseActiveLock,
  readState,
  assertLocalExecutorAccess,
  reconcilePublishedItems,
  reconcilePendingMappings,
  writeState,
  markInterruptedItemsRetryable,
  publicProgress,
  deferredReviewPlan,
  captureDeferredReviewInput,
  markDeferredReview,
  runBatchReviewLocally,
  reviewTextLocally,
  publishReviewedBatch,
  writeTerminalEvidence
});

const { processSingleBatchItem } = createBatchItemProcessor({
  SafeError,
  writeState,
  anonymizeNext,
  convertNext,
  packageIdForItem,
  createPhaseRecorder,
  reviewSingleBatchTextLocally,
  incrementPrivateIoSummary,
  ensureMappingOutbox,
  markMappingPending,
  cleanupTerminalWorkCopy,
  commitPendingMapping,
  appendMapping,
  invalidateUnpublishedBatchCopies,
  publicProgress,
  writeTerminalEvidence,
  deliveryPendingStatus: DELIVERY_PENDING,
  deferredReviewStatus: DEFERRED_REVIEW,
  retryableCodes: RETRYABLE_CODES,
  mappingStoppedStatus: MAPPING_STOPPED,
  captureStandaloneIdentitySnapshot: identityLedger.capture
});

const { maintainBeforeNext } = createBatchNextMaintenance({
  reconcilePublishedItems,
  reconcilePendingMappings,
  reconcilePreflightStoppedMappings,
  markInterruptedItemsRetryable,
  retryReleasedWorkCopyCleanup,
  writeState
});

const { processBatchNext: processBatchNextInternal } = createBatchProcessingOrchestrator({
  SafeError,
  active,
  acquireActiveLock,
  releaseActiveLock,
  readState,
  assertLocalExecutorAccess,
  maintainBeforeNext,
  deliveryResult,
  publicProgress,
  exactPendingEntry: plainExactPendingEntry,
  invalidateUnpublishedBatchCopies,
  writeState,
  processSingleBatchItem,
  writeTerminalEvidence,
  deliveryPendingStatus: DELIVERY_PENDING,
  withBatchPseudonymRegistry: withDurableBatchPseudonymRegistry
});

async function processBatchNext(token, deps = {}) {
  const result = await processBatchNextInternal(token, deps);
  // A claimed worker owns the whole multi-item operation. Direct/support
  // callers reach a lifecycle boundary only after the last pending item.
  if (!deps.executorPid && result?.remaining === 0) {
    const finished = finishZeroDayOperation(token);
    if (finished) return { ...result, ...publicProgress(finished) };
  }
  return result;
}

function finishZeroDayOperation(token) {
  // Lifecycle finalization is another state mutation and therefore uses the
  // same cross-process ownership lock as processing, delivery and maintenance.
  acquireActiveLock(token);
  let primaryError = false;
  try {
    const state = readStateForMaintenance(token);
    return finishZeroDayWork(state) ? state : null;
  } catch (error) {
    primaryError = true;
    throw error;
  } finally { releaseOwnedLock(releaseActiveLock, token, SafeError, primaryError); }
}

function readBatchProgress(token) {
  return { ok: true, ...publicProgress(readState(token)), raw_content_sent_to_claude: false };
}

function readBatchProcessingMode(token) {
  return processingModeForBatch(readState(token));
}

function exportCompletedBatchResults(token) {
  const state = readState(token);
  const progress = publicProgress(state);
  if (progress.complete !== true) return { exported: 0, pending: 0, available: false };
  return exportCompletedState(state);
}

// Exactly one local presenter may show the content-free terminal notice of a
// batch. Presentation is a two-phase operation: first reserve the journal slot,
// then mark it presented only after the native presenter has confirmed its
// spawn. A failed presenter releases its reservation so the detached worker can
// take over. Short-lived reservations also recover automatically after a parent
// process dies between reserve and presentation.
const TERMINAL_NOTICE_PRESENTERS = new Set(['worker', 'parent']);
const TERMINAL_NOTICE_RESERVATION_RE = /^[a-f0-9]{32}$/u;
const TERMINAL_NOTICE_RESERVATION_MS = 10_000;
function sleepBriefly(milliseconds) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds); } catch { /* best effort */ }
}
function reserveTerminalNotice(token, presenter, reservationId = crypto.randomBytes(16).toString('hex')) {
  if (!TOKEN_RE.test(String(token || '')) || !TERMINAL_NOTICE_PRESENTERS.has(presenter) ||
      !TERMINAL_NOTICE_RESERVATION_RE.test(String(reservationId || ''))) return { ok: false, state: 'invalid' };
  for (let attempt = 0; attempt < 8; attempt++) {
    try { acquireActiveLock(token); } catch { sleepBriefly(25); continue; }
    let result;
    try {
      const state = readState(token);
      const existing = state.terminal_notice;
      if (existing && typeof existing === 'object') {
        // Old one-phase journal entries are completed claims and remain final.
        if (existing.status !== 'reserved') result = { ok: false, state: 'presented' };
        else if (existing.presenter === presenter && existing.reservation_id === reservationId) {
          result = { ok: true, state: 'reserved', reservation_id: reservationId };
        }
        const reservedAt = Date.parse(String(existing.at || ''));
        if (!result && Number.isFinite(reservedAt) && Date.now() - reservedAt < TERMINAL_NOTICE_RESERVATION_MS) {
          result = { ok: false, state: 'reserved' };
        }
      }
      if (!result) {
        state.terminal_notice = { status: 'reserved', presenter, reservation_id: reservationId, at: new Date().toISOString() };
        writeState(state);
        result = { ok: true, state: 'reserved', reservation_id: reservationId };
      }
    } catch {
      result = { ok: false, state: 'unavailable' };
    }
    if (!releaseOwnedLock(releaseActiveLock, token, SafeError, true)) return { ok: false, state: 'unavailable' };
    return result;
  }
  return { ok: false, state: 'busy' };
}

function markTerminalNoticePresented(token, presenter, reservationId) {
  if (!TOKEN_RE.test(String(token || '')) || !TERMINAL_NOTICE_PRESENTERS.has(presenter) ||
      !TERMINAL_NOTICE_RESERVATION_RE.test(String(reservationId || ''))) return false;
  let locked = false;
  let changed = false;
  try {
    acquireActiveLock(token);
    locked = true;
    const state = readState(token);
    const existing = state.terminal_notice;
    if (!existing || existing.status !== 'reserved' || existing.presenter !== presenter ||
        existing.reservation_id !== reservationId) return false;
    state.terminal_notice = { status: 'presented', presenter, at: new Date().toISOString() };
    writeState(state);
    changed = true;
  } catch {
    return false;
  } finally {
    if (locked && !releaseOwnedLock(releaseActiveLock, token, SafeError, true)) changed = false;
  }
  return changed;
}

function releaseTerminalNoticeReservation(token, presenter, reservationId) {
  if (!TOKEN_RE.test(String(token || '')) || !TERMINAL_NOTICE_PRESENTERS.has(presenter) ||
      !TERMINAL_NOTICE_RESERVATION_RE.test(String(reservationId || ''))) return false;
  let locked = false;
  let changed = false;
  try {
    acquireActiveLock(token);
    locked = true;
    const state = readState(token);
    const existing = state.terminal_notice;
    if (!existing || existing.status !== 'reserved' || existing.presenter !== presenter ||
        existing.reservation_id !== reservationId) return false;
    delete state.terminal_notice;
    writeState(state);
    changed = true;
  } catch {
    return false;
  } finally {
    if (locked && !releaseOwnedLock(releaseActiveLock, token, SafeError, true)) changed = false;
  }
  return changed;
}

// Compatibility helper for older support callers. Product presentation uses
// the explicit reserve/mark/release transaction above.
function claimTerminalNotice(token, presenter) {
  const reserved = reserveTerminalNotice(token, presenter);
  return reserved.ok === true && markTerminalNoticePresented(token, presenter, reserved.reservation_id);
}

const { runLocalBatchExecutor } = createBatchExecutorRunner({
  SafeError,
  readState,
  writeState,
  liveLocalExecutor,
  publicProgress,
  prepareProcessingRun,
  incrementPrivateIoSummary,
  processBatchNext,
  finalizePublishedPackageLocally,
  cleanupTerminalWorkCopy,
  writeTerminalEvidence,
  releaseLocalBatchExecutor(token, pid) {
    const released = releaseLocalBatchExecutor(token, pid);
    if (released) finishZeroDayOperation(token);
    return released;
  },
  deliveryPendingStatus: DELIVERY_PENDING,
  retryableCodes: RETRYABLE_CODES,
  maxBatchFiles: LIMITS.MAX_BATCH_FILES
});

module.exports = { readStandaloneHistoryStates, standaloneRecoverableStates, continueStandaloneBatch, readBatchProcessingMode, beginBatch, processBatchNext, reviewDeferredBatch, resumeBatch, continueMostRecentBatch, discardIncompleteBatches, recoverableBatchStatus, productStatusSnapshot, latestProductBatchStatus, latestProductResultDirectory, localCleanupStatus, acknowledgeDeliveredPackage, acknowledgeDeliveredPackages, finalizePublishedPackageLocally, listBatchResults, completedLocalOnlyCandidates, verifyCompletedLocalOnlyGeneration, claimLocalBatchExecutor, releaseLocalBatchExecutor, reserveTerminalNotice, markTerminalNoticePresented, releaseTerminalNoticeReservation, claimTerminalNotice, readBatchProgress, exportCompletedBatchResults, runLocalBatchExecutor, recoverBatches, replayMappingOutbox, cleanupExpiredBatchSnapshots, openBatchPackageProtection, _test: { batchRoot, workPath, activeLockPath, writeState, readState, readStateForMaintenance, publicProgress, batchUserStatus, assertStagingCapacity, preflightOoxmlContainers, planBatchAdmission, acquireActiveLock, releaseActiveLock, validActiveLock, retryReleasedWorkCopyCleanup, packageIdForItem, publishedPackageRecord, publishedPackageState, regularPublishedPackage, reconcilePublishedItems, reconcilePendingMappings, reconcilePreflightStoppedMappings, commitPendingMapping, replayMappingOutbox, markInterruptedItemsRetryable, maintainBeforeNext, recoverableBatchStates, productStatusSnapshot, latestProductBatchStatus, latestProductResultDirectory, localCleanupStatus, reviewSingleBatchTextLocally, captureDeferredReviewInput, reviewedBatchText, resultCursor, parseResultCursor, liveLocalExecutor, completedLocalOnlyCandidates, retryableErrorCodes: Object.freeze([...RETRYABLE_CODES]), writeFully, syncParentDirectory, openBatchPackageProtection, writeTerminalEvidence, repairPendingEvidenceOutbox } };
