'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { PROFILES, LIMITS, listInput, validateBatchLimits, storageStatus, hasReparseComponent } = require('./common');
const { anonymizeNext, prepareProcessingRun } = require('./orchestrator');
const { retentionDays } = require('./retention');
const { appendMapping, ensureMappingOutbox, removeMappingOutbox, readOutboxEntries, STOPPED: MAPPING_STOPPED } = require('./mapping');
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

const active = new Set();
const RETRYABLE_CODES = new Set(['REQUEST_CANCELLED', 'PARSER_TIMEOUT', 'PARSER_START_FAILED', 'PROCESSING_INTERRUPTED', 'LOCAL_CAPACITY_UNAVAILABLE', 'LOCAL_CAPACITY_INSUFFICIENT', 'LOCAL_CAPACITY_RACE']);
const DELIVERY_PENDING = 'delivery_pending';
const DEFERRED_REVIEW = 'deferred_review';
const MAPPING_PENDING = 'mapping_pending';

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

const { writeState, readState, readStateForMaintenance } = createBatchJournalStore();

const {
  packageIdForItem,
  publishedPackageState,
  regularPublishedPackage,
  markMappingPending,
  commitPendingMapping,
  reconcilePendingMappings,
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
  deliveryPendingStatus: DELIVERY_PENDING
});

const { batchUserStatus, publicProgress } = createBatchProgress({
  deliveryPendingStatus: DELIVERY_PENDING,
  deferredReviewStatus: DEFERRED_REVIEW,
  mappingPendingStatus: MAPPING_PENDING,
  liveLocalExecutor
});

const { beginBatch } = createBatchIntake({
  SafeError,
  io: fs,
  path,
  crypto,
  profiles: PROFILES,
  limits: LIMITS,
  listInput,
  validateBatchLimits,
  storageStatus,
  hasReparseComponent,
  preflightOoxmlContainers,
  assertStagingCapacity,
  tokenPattern: TOKEN_RE,
  batchPath,
  workPath,
  copySnapshotFile,
  batchTtlMs,
  createPrivateIoSummary,
  writeState,
  readStateForMaintenance,
  safeRemoveWorkDirectory,
  publicProgress
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
  publicProgress
});

const {
  writeTerminalEvidence,
  repairPendingEvidenceOutbox
} = createBatchTerminalEvidence({
  randomBytes: crypto.randomBytes,
  publicProgress,
  writeState
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
  publishedPackageState,
  appendMapping,
  removeMappingOutbox
});

const {
  recoverableBatchStates,
  recoverableBatchStatus,
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
  reconcilePublishedItems,
  reconcilePendingMappings,
  markInterruptedItemsRetryable,
  retryReleasedWorkCopyCleanup,
  reconcileTerminalEvidence: writeTerminalEvidence,
  repairPendingEvidenceOutbox,
  deliveryPendingStatus: DELIVERY_PENDING,
  deferredReviewStatus: DEFERRED_REVIEW,
  mappingPendingStatus: MAPPING_PENDING
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
  liveLocalExecutor
});

const { resumeBatch, continueMostRecentBatch } = createBatchContinuation({
  SafeError,
  active,
  acquireActiveLock,
  releaseActiveLock,
  readState,
  writeState,
  assertLocalExecutorAccess,
  reconcilePublishedItems,
  reconcilePendingMappings,
  markInterruptedItemsRetryable,
  recoverableBatchStates,
  publicProgress,
  deferredReviewStatus: DEFERRED_REVIEW,
  mappingPendingStatus: MAPPING_PENDING
});

const { invalidateUnpublishedBatchCopies } = createBatchSnapshotInvalidation({
  appendMapping,
  cleanupTerminalWorkCopy,
  deferredReviewStatus: DEFERRED_REVIEW,
  mappingStoppedStatus: MAPPING_STOPPED
});

const { resultCursor, parseResultCursor, listBatchResults, completedLocalOnlyCandidates } = createBatchResultAccess({
  SafeError,
  fs,
  tokenPattern: TOKEN_RE,
  batchRoot,
  readState,
  readStateForMaintenance,
  publicProgress,
  liveLocalExecutor,
  regularPublishedPackage,
  issueReadCapability: (packageId) => require('./package-store').issueReadCapability(packageId)
});

const { captureDeferredReviewInput } = createBatchReviewCapture({
  anonymizeNext,
  exactPendingEntry,
  packageIdForItem,
  localReviewError
});

const { markDeferredReview, deferredReviewPlan } = createBatchReviewState({
  deferredReviewStatus: DEFERRED_REVIEW
});

const { publishReviewedBatch } = createBatchReviewPublication({
  anonymizeNext,
  exactPendingEntry,
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
  mappingStoppedStatus: MAPPING_STOPPED
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

async function processBatchNext(token, deps = {}) {
  if (active.has(token)) throw new SafeError('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
  acquireActiveLock(token);
  active.add(token);
  try {
    const state = readState(token);
    assertLocalExecutorAccess(state, deps.executorPid);
    if (state.invalidated === true) throw new SafeError('Der bestätigte Dateistapel wurde verändert und ist nicht mehr verwendbar.');
    // A crash may happen after the atomic output rename but before the MCP
    // response. Reconcile only a fully verified deterministic package; this
    // produces one pending delivery rather than processing the source again.
    if (reconcilePublishedItems(state) || reconcilePendingMappings(state)) writeState(state);
    // A stale processing marker is never automatically re-run.  Once this
    // caller owns the global lock it may safely become retryable, but the
    // subsequent attempt still requires resume_document_batch confirmation.
    if (markInterruptedItemsRetryable(state) > 0) writeState(state);
    // A previous publication is never revoked by a later cleanup problem, but
    // every safe subsequent batch operation retries its private byte cleanup.
    if (retryReleasedWorkCopyCleanup(state, deps).changed) writeState(state);
    const pendingDelivery = state.items.find((candidate) => candidate.status === DELIVERY_PENDING);
    if (pendingDelivery) return deliveryResult(state, pendingDelivery);
    const item = state.items.find((candidate) => candidate.status === 'pending');
    if (!item) return { ok: true, ...publicProgress(state), raw_content_sent_to_claude: false };
    let entry;
    try {
      entry = exactPendingEntry(state, item);
    } catch (error) {
      invalidateUnpublishedBatchCopies(state, deps);
      writeState(state);
      return {
        ok: false,
        error: 'batch_snapshot_changed',
        message: error instanceof SafeError ? error.message : 'Der bestätigte Dateistapel wurde verändert.',
        ...publicProgress(state),
        raw_content_sent_to_claude: false
      };
    }
    // Persist the attempt before touching the source. After a crash, startup
    // recovery converts this state to stopped rather than silently retrying it.
    item.status = 'processing';
    item.checkpoint = 'processing_started';
    item.processing_started_at_ms = Date.now();
    const phaseRecorder = createPhaseRecorder({ now: deps.performanceNow });
    writeState(state);
    try {
      // Persist only a fixed, content-free phase before every irreversible
      // processing boundary. It is intentionally not returned through MCP:
      // queue counters are enough for Claude, while local recovery retains a
      // useful trace without names, paths or document-derived state.
      // Non-durable: item.status stays 'processing' across every one of
      // these markers, and markInterruptedItemsRetryable() below recovers on
      // status alone, so losing the very latest marker to a crash still
      // yields the same safe outcome as if it were the durable one.
      const checkpoint = (phase, performancePhase) => {
        if (performancePhase) phaseRecorder.mark(performancePhase);
        item.checkpoint = phase;
        writeState(state, { durable: false });
      };
      const result = await anonymizeNext(state.profile, {
        ...deps,
        inputQueue: [entry],
        copyClaim: true,
        removeImages: state.remove_images,
        packageId: packageIdForItem(item),
        onClaimed: async () => {
          checkpoint('private_copy_claimed', 'intake_and_preparation');
          if (deps.onClaimed) await deps.onClaimed();
        },
        onExtracted: async (converted) => {
          checkpoint('extracted', 'conversion_and_visual_scan');
          if (deps.onExtracted) await deps.onExtracted(converted);
        },
        onDetected: async (details) => {
          checkpoint('text_privacy_checked', 'text_privacy_check');
          if (deps.onDetected) await deps.onDetected(details);
        },
        reviewText: (input) => reviewSingleBatchTextLocally(input, state, item, deps),
        beforePublish: async (details) => {
          incrementPrivateIoSummary(state.io_summary, 'final_gate_runs');
          checkpoint('package_verified', 'verification');
          if (deps.beforePublish) await deps.beforePublish(details);
        },
        afterPublish: async () => {
          try {
            ensureMappingOutbox(item.name, packageIdForItem(item));
            item.mapping_outbox_persisted = true;
          } catch {
            item.mapping_outbox_persisted = false;
          }
          checkpoint('package_published', 'publication');
        }
      });
      phaseRecorder.mark('publication');
      markMappingPending(item, result.package_id);
      writeState(state);
      try {
        // Persist the recovery intent before dropping the only raw private
        // work copy. If local storage is unavailable the verified package is
        // kept, but cleanup is deferred until a durable repair path exists.
        ensureMappingOutbox(item.name, result.package_id);
        item.mapping_outbox_persisted = true;
      } catch {
        return {
          ok: false,
          error: 'LOCAL_MAPPING_EXPORT_PENDING',
          message: 'Das Ergebnis wurde lokal sicher erstellt. Die lokale Zuordnungsübersicht wird automatisch nachgetragen, sobald der Export wieder verfügbar ist.',
          ...publicProgress(state),
          raw_content_sent_to_claude: false
        };
      }
      writeState(state);
      try { cleanupTerminalWorkCopy(state, item, deps); }
      catch { item.work_copy_cleanup_pending = true; }
      writeState(state);
      try {
        commitPendingMapping(item, result.package_id);
      } catch {
        return {
          ok: false,
          error: 'LOCAL_MAPPING_EXPORT_PENDING',
          message: 'Das Ergebnis wurde lokal sicher erstellt. Die lokale Zuordnungsübersicht wird automatisch nachgetragen, sobald der Export wieder verfügbar ist.',
          ...publicProgress(state),
          raw_content_sent_to_claude: false
        };
      }
      // The durable pending state is written before the raw private work copy
      // is removed. From here on, recovery only needs the local basename and
      // the verified package id; the source is never processed a second time.
      item.status = DELIVERY_PENDING;
      item.checkpoint = 'delivery_pending';
      delete item.error_code;
      item.processing_duration_ms = Math.max(0, Date.now() - Number(item.processing_started_at_ms || Date.now()));
      item.performance_phases_ms = phaseRecorder.snapshot();
      delete item.processing_started_at_ms;
      item.package_id = result.package_id;
      incrementPrivateIoSummary(state.io_summary, 'output_packages_committed');
      // `retainAudit` is deliberately best-effort after publication. Count an
      // audit receipt only when the orchestrator confirms the durable local
      // retention; a failed best-effort write must not turn into a false
      // performance fact.
      if (result.audit_receipt_retained === true) {
        incrementPrivateIoSummary(state.io_summary, 'audit_receipt_writes');
      }
      writeState(state);
      return { ...result, ...publicProgress(state), raw_content_sent_to_claude: false };
    } catch (error) {
      const code = error && error.code ? error.code : 'PROCESSING_INTERRUPTED';
      if (code === 'BATCH_SNAPSHOT_CHANGED') {
        invalidateUnpublishedBatchCopies(state, deps, item);
      }
      item.status = code === 'LOCAL_REVIEW_DEFERRED' ? DEFERRED_REVIEW : (RETRYABLE_CODES.has(code) ? 'retryable' : 'stopped');
      item.checkpoint = item.status === 'retryable' ? 'retryable' : (item.status === DEFERRED_REVIEW ? 'awaiting_local_review' : 'stopped');
      if (item.status === 'stopped') item.processing_duration_ms = Math.max(0, Date.now() - Number(item.processing_started_at_ms || Date.now()));
      item.performance_phases_ms = phaseRecorder.snapshot();
      delete item.processing_started_at_ms;
      item.error_code = code;
      // The permanent, local-only mapping is also the user's overview of a
      // partial batch. A terminal stop has no result package, but must not look
      // as if the original source simply disappeared. Mapping failure here is
      // diagnostic only: the stop itself remains durable and fail-closed.
      if (item.status === 'stopped') {
        try {
          appendMapping(item.name, '', MAPPING_STOPPED);
          item.local_mapping_exported = true;
        } catch { item.local_mapping_exported = false; }
        try { cleanupTerminalWorkCopy(state, item, deps); }
        catch { item.work_copy_cleanup_pending = true; }
      }
      writeState(state);
      const localEvidenceExported = writeTerminalEvidence(state);
      return {
        ok: false,
        error: code,
        message: error instanceof SafeError
          ? error.message
          : 'Die lokale Verarbeitung wurde sicher unterbrochen. Es wurde kein Paket freigegeben.',
        ...publicProgress(state),
        // This is only an operational truth value. It lets the skill point to
        // a local export problem without receiving a filename or mapping path.
        local_mapping_exported: item.status === 'stopped' ? item.local_mapping_exported : null,
        local_evidence_exported: localEvidenceExported,
        raw_content_sent_to_claude: false
      };
    }
  } finally {
    active.delete(token);
    releaseActiveLock(token);
  }
}

function readBatchProgress(token) {
  return { ok: true, ...publicProgress(readState(token)), raw_content_sent_to_claude: false };
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
  releaseLocalBatchExecutor,
  deliveryPendingStatus: DELIVERY_PENDING,
  maxBatchFiles: LIMITS.MAX_BATCH_FILES
});

module.exports = { beginBatch, processBatchNext, reviewDeferredBatch, resumeBatch, continueMostRecentBatch, discardIncompleteBatches, recoverableBatchStatus, localCleanupStatus, acknowledgeDeliveredPackage, acknowledgeDeliveredPackages, finalizePublishedPackageLocally, listBatchResults, completedLocalOnlyCandidates, claimLocalBatchExecutor, releaseLocalBatchExecutor, readBatchProgress, runLocalBatchExecutor, recoverBatches, replayMappingOutbox, cleanupExpiredBatchSnapshots, openBatchPackageProtection, _test: { batchRoot, workPath, activeLockPath, writeState, readState, readStateForMaintenance, publicProgress, batchUserStatus, assertStagingCapacity, preflightOoxmlContainers, acquireActiveLock, releaseActiveLock, validActiveLock, retryReleasedWorkCopyCleanup, packageIdForItem, publishedPackageState, regularPublishedPackage, reconcilePublishedItems, reconcilePendingMappings, commitPendingMapping, replayMappingOutbox, markInterruptedItemsRetryable, recoverableBatchStates, localCleanupStatus, reviewSingleBatchTextLocally, captureDeferredReviewInput, reviewedBatchText, resultCursor, parseResultCursor, liveLocalExecutor, completedLocalOnlyCandidates, writeFully, syncParentDirectory, openBatchPackageProtection, writeTerminalEvidence, repairPendingEvidenceOutbox } };
