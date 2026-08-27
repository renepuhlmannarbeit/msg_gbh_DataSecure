'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { PROFILES, LIMITS, validateBatchLimits, storageStatus, hasReparseComponent } = require('./common');
const { anonymizeNext, prepareProcessingRun } = require('./orchestrator');
const { retentionDays } = require('./retention');
const { appendMapping, ensureMappingOutbox, removeMappingOutbox, readOutboxEntries, STOPPED: MAPPING_STOPPED } = require('./mapping');
const { sameDocumentResult } = require('./document-result-grade');
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

const active = new Set();
const RETRYABLE_CODES = new Set(['REQUEST_CANCELLED', 'PARSER_TIMEOUT', 'PARSER_START_FAILED', 'PROCESSING_INTERRUPTED', 'LOCAL_CAPACITY_UNAVAILABLE', 'LOCAL_CAPACITY_INSUFFICIENT', 'LOCAL_CAPACITY_RACE']);
const DELIVERY_PENDING = 'delivery_pending';
const DEFERRED_REVIEW = 'deferred_review';
const MAPPING_PENDING = 'mapping_pending';
const PREFLIGHT_MAPPING_PENDING = 'preflight_mapping_pending';

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
  publishedPackageRecord,
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
  publishedPackageRecord
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
  batchTtlMs,
  createPrivateIoSummary,
  writeState,
  readStateForMaintenance,
  safeRemoveWorkDirectory,
  publicProgress,
  preflightMappingPendingStatus: PREFLIGHT_MAPPING_PENDING
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
  writeState,
  publishedPackageRecord
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
  reconcilePreflightStoppedMappings,
  markInterruptedItemsRetryable,
  retryReleasedWorkCopyCleanup,
  reconcileTerminalEvidence: writeTerminalEvidence,
  repairPendingEvidenceOutbox,
  deliveryPendingStatus: DELIVERY_PENDING,
  deferredReviewStatus: DEFERRED_REVIEW,
  mappingPendingStatus: MAPPING_PENDING,
  preflightMappingPendingStatus: PREFLIGHT_MAPPING_PENDING
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
  reconcilePreflightStoppedMappings,
  markInterruptedItemsRetryable,
  recoverableBatchStates,
  publicProgress,
  deferredReviewStatus: DEFERRED_REVIEW,
  mappingPendingStatus: MAPPING_PENDING,
  preflightMappingPendingStatus: PREFLIGHT_MAPPING_PENDING
});

const { invalidateUnpublishedBatchCopies } = createBatchSnapshotInvalidation({
  appendMapping,
  cleanupTerminalWorkCopy,
  writeState,
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
  publishedPackageRecord,
  sameDocumentResult,
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

const { processSingleBatchItem } = createBatchItemProcessor({
  SafeError,
  writeState,
  anonymizeNext,
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
  mappingStoppedStatus: MAPPING_STOPPED
});

const { maintainBeforeNext } = createBatchNextMaintenance({
  reconcilePublishedItems,
  reconcilePendingMappings,
  reconcilePreflightStoppedMappings,
  markInterruptedItemsRetryable,
  retryReleasedWorkCopyCleanup,
  writeState
});

const { processBatchNext } = createBatchProcessingOrchestrator({
  SafeError,
  active,
  acquireActiveLock,
  releaseActiveLock,
  readState,
  assertLocalExecutorAccess,
  maintainBeforeNext,
  deliveryResult,
  publicProgress,
  exactPendingEntry,
  invalidateUnpublishedBatchCopies,
  writeState,
  processSingleBatchItem,
  writeTerminalEvidence,
  deliveryPendingStatus: DELIVERY_PENDING
});

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

module.exports = { beginBatch, processBatchNext, reviewDeferredBatch, resumeBatch, continueMostRecentBatch, discardIncompleteBatches, recoverableBatchStatus, localCleanupStatus, acknowledgeDeliveredPackage, acknowledgeDeliveredPackages, finalizePublishedPackageLocally, listBatchResults, completedLocalOnlyCandidates, claimLocalBatchExecutor, releaseLocalBatchExecutor, readBatchProgress, runLocalBatchExecutor, recoverBatches, replayMappingOutbox, cleanupExpiredBatchSnapshots, openBatchPackageProtection, _test: { batchRoot, workPath, activeLockPath, writeState, readState, readStateForMaintenance, publicProgress, batchUserStatus, assertStagingCapacity, preflightOoxmlContainers, planBatchAdmission, acquireActiveLock, releaseActiveLock, validActiveLock, retryReleasedWorkCopyCleanup, packageIdForItem, publishedPackageRecord, publishedPackageState, regularPublishedPackage, reconcilePublishedItems, reconcilePendingMappings, reconcilePreflightStoppedMappings, commitPendingMapping, replayMappingOutbox, markInterruptedItemsRetryable, maintainBeforeNext, recoverableBatchStates, localCleanupStatus, reviewSingleBatchTextLocally, captureDeferredReviewInput, reviewedBatchText, resultCursor, parseResultCursor, liveLocalExecutor, completedLocalOnlyCandidates, writeFully, syncParentDirectory, openBatchPackageProtection, writeTerminalEvidence, repairPendingEvidenceOutbox } };
