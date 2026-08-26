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

async function captureDeferredReviewInput(state, item, deps = {}) {
  const entry = exactPendingEntry(state, item);
  let captured;
  try {
    await anonymizeNext(state.profile, {
      ...deps,
      inputQueue: [entry],
      copyClaim: true,
      removeImages: state.remove_images,
      packageId: packageIdForItem(item),
      suppressDiagnostic: true,
      reviewText: (input) => {
        captured = input;
        throw localReviewError('BATCH_REVIEW_CAPTURED', 'Lokaler Stapelreview-Entwurf erfasst.');
      }
    });
  } catch (error) {
    if (error?.code !== 'BATCH_REVIEW_CAPTURED') throw error;
  }
  if (!captured || !Array.isArray(captured.ambiguities) || captured.ambiguities.length === 0) {
    throw localReviewError('BATCH_REVIEW_RECONSTRUCTION_FAILED', 'Die lokale Stapelprüfung konnte die offene Fundstelle nicht unverändert rekonstruieren. Es wurde nichts freigegeben.');
  }
  return captured;
}

function markDeferredReview(state, items, code) {
  for (const item of items) {
    item.status = DEFERRED_REVIEW;
    item.checkpoint = 'awaiting_local_review';
    item.error_code = code;
  }
}

// This is the only path which joins multiple raw-derived review drafts. It
// recreates all of them from sealed local copies, holds them only for the life
// of this request, invokes one local reviewer, and then re-runs the normal
// per-document pipeline with the in-memory decisions. Nothing from `drafts`
// or `decision` is written to the batch journal, diagnostics or MCP response.
async function reviewDeferredBatch(token, deps = {}) {
  if (active.has(token)) throw new SafeError('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
  acquireActiveLock(token);
  active.add(token);
  try {
    const state = readState(token);
    assertLocalExecutorAccess(state, deps.executorPid);
    if (state.invalidated === true) throw new SafeError('Der bestätigte Dateistapel wurde verändert und ist nicht mehr verwendbar.');
    const publishedReconciled = reconcilePublishedItems(state);
    const mappingReconciled = reconcilePendingMappings(state);
    if (publishedReconciled || mappingReconciled) writeState(state);
    if (markInterruptedItemsRetryable(state) > 0) writeState(state);
    const progress = publicProgress(state);
    const items = state.items.filter((item) => item.status === DEFERRED_REVIEW);
    if (!items.length || progress.remaining !== 0 || progress.retryable !== 0 || progress.delivery_pending !== 0) {
      let message = 'Für diesen Stapel gibt es keine vertagten lokalen Entscheidungen.';
      if (progress.remaining !== 0) message = 'Der Stapel analysiert noch weitere Dateien. Die gemeinsame lokale Prüfung startet erst danach.';
      else if (progress.delivery_pending !== 0) message = 'Ein bereits freigegebenes Paket muss zuerst gelesen und bestätigt werden.';
      else if (progress.retryable !== 0) message = 'Eine technische Unterbrechung muss zuerst ausdrücklich fortgesetzt werden.';
      return { ok: false, error: 'batch_review_not_ready', message, ...progress, raw_content_sent_to_claude: false };
    }

    const lifecycle = (event) => {
      try { deps.onReviewLifecycle?.(event); } catch { /* diagnostics cannot change a privacy decision */ }
    };
    const drafts = [];
    try {
      lifecycle({ event: 'review_reconstruction_started', outcome: 'progress', item_count: items.length });
      for (const item of items) drafts.push(await captureDeferredReviewInput(state, item, deps));
      lifecycle({ event: 'review_reconstruction_finished', outcome: 'ok', item_count: items.length });
    } catch (error) {
      lifecycle({ event: 'review_reconstruction_failed', outcome: 'stopped', item_count: items.length,
        error_code: 'LOCAL_REVIEW_FAILED' });
      markDeferredReview(state, items, error?.code || 'BATCH_REVIEW_RECONSTRUCTION_FAILED');
      writeState(state);
      return {
        ok: false,
        error: error?.code || 'BATCH_REVIEW_RECONSTRUCTION_FAILED',
        message: error instanceof SafeError ? error.message : 'Die lokale Stapelprüfung wurde sicher gestoppt. Es wurde nichts freigegeben.',
        ...publicProgress(state), raw_content_sent_to_claude: false
      };
    }

    let outcome;
    try {
      lifecycle({ event: 'review_ui_started', outcome: 'progress', item_count: items.length });
      outcome = await runBatchReviewLocally(drafts, {
        platform: deps.platform || process.platform,
        allowDefer: true,
        reviewTextLocally: deps.reviewTextLocally || reviewTextLocally,
        ...(deps.reviewOptions || {})
      });
      lifecycle({ event: 'review_ui_finished', outcome: outcome.action === 'reviewed' ? 'ok' : 'stopped',
        item_count: items.length, error_code: outcome.action === 'reviewed' ? 'NONE' : 'LOCAL_REVIEW_CANCELLED' });
    } catch (error) {
      lifecycle({ event: 'review_ui_failed', outcome: 'stopped', item_count: items.length,
        error_code: error?.code === 'LOCAL_REVIEW_TIMEOUT' ? 'LOCAL_REVIEW_TIMEOUT' : 'LOCAL_REVIEW_FAILED' });
      markDeferredReview(state, items, 'LOCAL_REVIEW_CANCELLED');
      writeState(state);
      return { ok: false, error: 'LOCAL_REVIEW_CANCELLED', message: 'Die lokale Stapelentscheidung wurde abgebrochen. Es wurde nichts freigegeben.', ...publicProgress(state), raw_content_sent_to_claude: false };
    }
    if (outcome.action !== 'reviewed') {
      const code = outcome.action === 'deferred' ? 'LOCAL_REVIEW_DEFERRED' : 'LOCAL_REVIEW_CANCELLED';
      markDeferredReview(state, items, code);
      writeState(state);
      return { ok: false, error: code, message: 'Die lokale Stapelentscheidung wurde nicht abgeschlossen. Alle offenen Dateien bleiben lokal gesperrt.', ...publicProgress(state), raw_content_sent_to_claude: false };
    }

    const decisionsByIndex = new Map(outcome.documents.map((document) => [document.document_index, document.decisions]));
    const packages = [];
    let locallyReleased = 0;
    let failed = 0;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      item.status = 'processing';
      item.checkpoint = 'batch_review_publish_started';
      delete item.error_code;
      writeState(state);
      try {
        const entry = exactPendingEntry(state, item);
        const result = await anonymizeNext(state.profile, {
          ...deps,
          inputQueue: [entry],
          copyClaim: true,
          removeImages: state.remove_images,
          packageId: packageIdForItem(item),
          reviewText: (input) => reviewedBatchText(input, decisionsByIndex.get(index + 1)),
          beforePublish: async (details) => {
            item.checkpoint = 'package_verified';
            writeState(state, { durable: false });
            if (deps.beforePublish) await deps.beforePublish(details);
          },
          afterPublish: async () => {
            // The output rename already succeeded. Persist a content-free
            // mapping intent at the first possible post-publish point, but
            // never retract the verified package if local metadata storage is
            // temporarily unavailable.
            try {
              ensureMappingOutbox(item.name, packageIdForItem(item));
              item.mapping_outbox_persisted = true;
            } catch {
              item.mapping_outbox_persisted = false;
            }
            item.checkpoint = 'package_published';
            writeState(state, { durable: false });
          }
        });
        markMappingPending(item, result.package_id);
        writeState(state);
        try {
          ensureMappingOutbox(item.name, result.package_id);
          item.mapping_outbox_persisted = true;
        } catch {
          // Continue with independent reviewed documents, but retain this raw
          // private work copy until a durable mapping-repair intent exists.
          continue;
        }
        writeState(state);
        try { cleanupTerminalWorkCopy(state, item, deps); }
        catch { item.work_copy_cleanup_pending = true; }
        writeState(state);
        try {
          commitPendingMapping(item, result.package_id);
        } catch {
          // The batch can continue with later independent documents. This
          // package stays locally verified and is handed to Claude only after
          // the durable mapping row has been written on a later local pass.
          continue;
        }
        if (deps.localFinalize === true) {
          item.status = 'released';
          item.checkpoint = 'released_locally';
          item.analysis_acknowledged = false;
          try { cleanupTerminalWorkCopy(state, item, deps); }
          catch { item.work_copy_cleanup_pending = true; }
          locallyReleased++;
        } else {
          item.status = DELIVERY_PENDING;
          item.checkpoint = 'delivery_pending';
          delete item.error_code;
          item.work_copy_cleanup_pending = true;
        }
        writeState(state);
        if (deps.localFinalize !== true) packages.push(deliveryResult(state, item));
      } catch (error) {
        const code = error?.code || 'PROCESSING_INTERRUPTED';
        item.status = RETRYABLE_CODES.has(code) ? 'retryable' : 'stopped';
        item.checkpoint = item.status === 'retryable' ? 'retryable' : 'stopped';
        item.error_code = code;
        if (item.status === 'stopped') {
          try { appendMapping(item.name, '', MAPPING_STOPPED); item.local_mapping_exported = true; }
          catch { item.local_mapping_exported = false; }
          try { cleanupTerminalWorkCopy(state, item, deps); }
          catch { item.work_copy_cleanup_pending = true; }
        }
        failed++;
        writeState(state);
      }
    }
    return {
      // A per-document publication is atomic. If a later document fails, the
      // already verified packages remain usable and must be handed to Claude
      // with their live capabilities rather than being hidden behind an MCP
      // error response. The counters still make the partial failure explicit.
      ok: packages.length > 0 || locallyReleased > 0,
      ...(deps.localFinalize === true ? { locally_released: locallyReleased } : { packages }),
      reviewed_documents: items.length,
      failed_documents: failed,
      ...publicProgress(state),
      ...(deps.localFinalize === true ? { local_evidence_exported: writeTerminalEvidence(state) } : {}),
      raw_content_sent_to_claude: false
    };
  } finally {
    active.delete(token);
    releaseActiveLock(token);
  }
}

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

async function runLocalBatchExecutor(token, deps = {}) {
  const executorPid = Number(deps.executorPid ?? process.pid);
  const claimed = readState(token);
  if (!liveLocalExecutor(claimed) || claimed.local_executor_pid !== executorPid) {
    throw new SafeError('Der lokale Stapelprozessor besitzt keine gültige Ausführungsberechtigung.');
  }
  let lastProgress = publicProgress(claimed);
  try {
    // Expensive but mandatory housekeeping is established exactly once for a
    // claimed local batch.  The opaque capability is process-local; passing a
    // plain object from any external caller cannot skip the checks.
    const preparedRun = prepareProcessingRun(deps);
    if (incrementPrivateIoSummary(claimed.io_summary, 'batch_maintenance_runs')) {
      writeState(claimed);
    }
    const batchDeps = { ...deps, preparedRun };
    const maximumSteps = claimed.items.length * 3 + 3;
    for (let step = 0; step < maximumSteps; step++) {
      if (lastProgress.delivery_pending > 0) {
        const state = readState(token);
        const pending = state.items.find((item) => item.status === DELIVERY_PENDING);
        if (!pending) break;
        lastProgress = finalizePublishedPackageLocally(token, pending.package_id, { ...batchDeps, executorPid });
        continue;
      }
      if (lastProgress.mapping_pending > 0) {
        const before = `${lastProgress.mapping_pending}:${lastProgress.delivery_pending}`;
        lastProgress = await processBatchNext(token, { ...batchDeps, executorPid });
        const after = `${lastProgress.mapping_pending}:${lastProgress.delivery_pending}`;
        if (before === after) break;
        continue;
      }
      if (lastProgress.remaining === 0) break;
      const before = `${lastProgress.completed}:${lastProgress.remaining}:${lastProgress.delivery_pending}`;
      const result = await processBatchNext(token, { ...batchDeps, executorPid });
      lastProgress = result;
      if (typeof result.package_id === 'string') {
        lastProgress = finalizePublishedPackageLocally(token, result.package_id, { ...batchDeps, executorPid });
        continue;
      }
      const after = `${lastProgress.completed}:${lastProgress.remaining}:${lastProgress.delivery_pending}`;
      if (before === after) break;
    }
  } finally {
    releaseLocalBatchExecutor(token, executorPid);
  }
  return { ok: true, ...publicProgress(readState(token)), raw_content_sent_to_claude: false };
}

module.exports = { beginBatch, processBatchNext, reviewDeferredBatch, resumeBatch, continueMostRecentBatch, discardIncompleteBatches, recoverableBatchStatus, localCleanupStatus, acknowledgeDeliveredPackage, acknowledgeDeliveredPackages, finalizePublishedPackageLocally, listBatchResults, completedLocalOnlyCandidates, claimLocalBatchExecutor, releaseLocalBatchExecutor, readBatchProgress, runLocalBatchExecutor, recoverBatches, replayMappingOutbox, cleanupExpiredBatchSnapshots, openBatchPackageProtection, _test: { batchRoot, workPath, activeLockPath, writeState, readState, readStateForMaintenance, publicProgress, batchUserStatus, assertStagingCapacity, preflightOoxmlContainers, acquireActiveLock, releaseActiveLock, validActiveLock, retryReleasedWorkCopyCleanup, packageIdForItem, publishedPackageState, regularPublishedPackage, reconcilePublishedItems, reconcilePendingMappings, commitPendingMapping, replayMappingOutbox, markInterruptedItemsRetryable, recoverableBatchStates, localCleanupStatus, reviewSingleBatchTextLocally, captureDeferredReviewInput, reviewedBatchText, resultCursor, parseResultCursor, liveLocalExecutor, completedLocalOnlyCandidates, writeFully, syncParentDirectory, openBatchPackageProtection, writeTerminalEvidence, repairPendingEvidenceOutbox } };
