'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { TOKEN_RE, batchRoot, batchPath, safeRemoveWorkDirectory } = require('./batch-private-store');
const { createBatchIntakeIntent, SUFFIX: INTAKE_SUFFIX } = require('./batch-intake-intent');

function createBatchRecovery(options = {}) {
  const io = options.io || fs;
  const tokenPattern = options.tokenPattern || TOKEN_RE;
  const rootPath = options.batchRoot || batchRoot;
  const journalPath = options.batchPath || batchPath;
  const removeWorkDirectory = options.safeRemoveWorkDirectory || safeRemoveWorkDirectory;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const nowMs = options.nowMs || (() => Date.now());
  const readMaintenanceState = options.readStateForMaintenance;
  const writeState = options.writeState;
  const readActiveLock = options.readActiveLock;
  const processAlive = options.processAlive;
  const acquireActiveLock = options.acquireActiveLock;
  const releaseActiveLock = options.releaseActiveLock;
  const liveLocalExecutor = options.liveLocalExecutor;
  const publicProgress = options.publicProgress;
  const reconcilePublishedItems = options.reconcilePublishedItems;
  const reconcilePendingMappings = options.reconcilePendingMappings;
  const reconcilePreflightStoppedMappings = options.reconcilePreflightStoppedMappings || (() => false);
  const markInterruptedItemsRetryable = options.markInterruptedItemsRetryable;
  const retryReleasedWorkCopyCleanup = options.retryReleasedWorkCopyCleanup;
  const reconcileTerminalEvidence = options.reconcileTerminalEvidence;
  const repairPendingEvidenceOutbox = options.repairPendingEvidenceOutbox;
  const deliveryPendingStatus = options.deliveryPendingStatus || 'delivery_pending';
  const deferredReviewStatus = options.deferredReviewStatus || 'deferred_review';
  const mappingPendingStatus = options.mappingPendingStatus || 'mapping_pending';
  const preflightMappingPendingStatus = options.preflightMappingPendingStatus || 'preflight_mapping_pending';
  const intakeIntent = options.intakeIntent || createBatchIntakeIntent({ ...options, batchPath: journalPath });
  const finishZeroDayWork = options.finishZeroDayWork || (() => false);
  const removeState = options.removeState;

  function intakeToken(entry) {
    if (!entry.isFile() || !entry.name.endsWith(INTAKE_SUFFIX)) return null;
    const token = entry.name.slice(0, -INTAKE_SUFFIX.length);
    return tokenPattern.test(token) ? token : null;
  }

  function incompleteBatchState(state) {
    return !state.invalidated && (state.items || []).some((item) =>
      ['pending', 'processing', 'retryable', deferredReviewStatus, mappingPendingStatus,
        preflightMappingPendingStatus, deliveryPendingStatus]
        .includes(item.status)
    );
  }

  function recoverableBatchStates(callOptions = {}) {
    const states = [];
    // Status is strictly read-only. In particular, it must never use the
    // normal state reader whose expiry branch is allowed to remove snapshots.
    const owner = readActiveLock();
    if (!callOptions.ignoreActiveLock && owner && processAlive(owner.pid)) return states;
    let entries = [];
    try { entries = io.readdirSync(rootPath(), { withFileTypes: true }); } catch { return states; }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const token = entry.name.slice(0, -'.json'.length);
      if (!tokenPattern.test(token)) continue;
      try {
        const state = readMaintenanceState(token);
        if (state.zero_day_work === true && state.zero_day_work_cleaned !== true &&
            !liveLocalExecutor(state) && !processAlive(state.intake_owner_pid)) continue;
        if (nowMs() <= Date.parse(state.expires_at) && incompleteBatchState(state) &&
            (callOptions.includeActiveExecutors === true || !liveLocalExecutor(state))) states.push(state);
      } catch { /* malformed and expired snapshots remain unavailable */ }
    }
    return states;
  }

  function recoverableBatchStatus() {
    const owner = readActiveLock();
    let processingActive = Boolean(owner && processAlive(owner.pid));
    const allStates = processingActive ? [] : recoverableBatchStates({ includeActiveExecutors: true });
    if (allStates.some((state) => liveLocalExecutor(state))) processingActive = true;
    const states = allStates.filter((state) => !liveLocalExecutor(state));
    return {
      recoverable_batches: states.length,
      batches_awaiting_resume: states.filter((state) => publicProgress(state).awaiting_resume).length,
      batches_awaiting_delivery: states.filter((state) =>
        state.items.some((item) => item.status === deliveryPendingStatus)).length,
      batch_processing_active: processingActive
    };
  }

  function localCleanupStatus() {
    let pending = 0;
    let expiredPending = 0;
    const owner = readActiveLock();
    if (owner && processAlive(owner.pid)) {
      return { private_work_copy_cleanup_pending: pending, expired_batch_cleanup_pending: expiredPending };
    }
    let entries = [];
    try { entries = io.readdirSync(rootPath(), { withFileTypes: true }); } catch {
      return { private_work_copy_cleanup_pending: 0, expired_batch_cleanup_pending: 0 };
    }
    for (const entry of entries) {
      const orphanToken = intakeToken(entry);
      if (orphanToken) {
        try { if (intakeIntent.orphan(orphanToken, nowMs())) expiredPending++; } catch { pending++; }
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const token = entry.name.slice(0, -'.json'.length);
      if (!tokenPattern.test(token)) continue;
      try {
        const state = readMaintenanceState(token);
        if (nowMs() > Date.parse(state.expires_at) || (state.zero_day_work === true &&
            state.zero_day_work_cleaned !== true && !liveLocalExecutor(state) && !processAlive(state.intake_owner_pid))) {
          expiredPending++;
        } else {
          pending += (state.items || []).filter((item) => item.work_copy_cleanup_pending === true).length;
        }
      } catch { /* malformed private state stays unavailable */ }
    }
    return { private_work_copy_cleanup_pending: pending, expired_batch_cleanup_pending: expiredPending };
  }

  function maintenanceToken() {
    return randomBytes(32).toString('hex');
  }

  function recoverBatches(callOptions = {}) {
    const now = Number(callOptions.now || nowMs());
    let recovered = 0;
    let removed = 0;
    let failures = 0;
    const token = maintenanceToken();
    try {
      acquireActiveLock(token);
    } catch {
      return { recovered, removed, failures, skipped_active: true };
    }
    try {
      if (repairPendingEvidenceOutbox) {
        try { repairPendingEvidenceOutbox(); } catch { /* evidence repair never blocks batch recovery */ }
      }
      let entries = [];
      try { entries = io.readdirSync(rootPath(), { withFileTypes: true }); }
      catch { return { recovered, removed, failures: 1, skipped_active: false }; }
      for (const entry of entries) {
        const orphanToken = intakeToken(entry);
        if (orphanToken) {
          try { if (intakeIntent.cleanup(orphanToken, now)) removed++; } catch { failures++; }
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const tokenFromName = entry.name.slice(0, -'.json'.length);
        if (!tokenPattern.test(tokenFromName)) continue;
        try {
          const state = readMaintenanceState(tokenFromName);
          if (liveLocalExecutor(state)) continue;
          if (state.zero_day_work === true && !processAlive(state.intake_owner_pid)) finishZeroDayWork(state);
          if (now > Date.parse(state.expires_at)) {
            if (reconcileTerminalEvidence) reconcileTerminalEvidence(state);
            removeWorkDirectory(state.token);
            removeState(state);
            removed++;
            continue;
          }
          let changed = false;
          // Ordering is the crash contract: adopt a fully published package
          // before any lingering processing item can become retryable.
          if (reconcilePublishedItems(state)) {
            changed = true;
            recovered++;
          }
          if (reconcilePendingMappings(state)) {
            changed = true;
            recovered++;
          }
          if (reconcilePreflightStoppedMappings(state)) {
            changed = true;
            recovered++;
          }
          const interrupted = markInterruptedItemsRetryable(state);
          if (interrupted > 0) {
            changed = true;
            recovered += interrupted;
          }
          if (retryReleasedWorkCopyCleanup(state).changed) changed = true;
          if (changed) writeState(state);
          if (reconcileTerminalEvidence) reconcileTerminalEvidence(state);
        } catch { failures++; }
      }
      return { recovered, removed, failures, skipped_active: false };
    } finally {
      releaseActiveLock(token);
    }
  }

  function cleanupExpiredBatchSnapshots(callOptions = {}) {
    const token = maintenanceToken();
    try {
      acquireActiveLock(token);
    } catch {
      return { removed: 0, failures: 0, skipped_active: true };
    }
    let removed = 0;
    let failures = 0;
    const now = Number(callOptions.now || nowMs());
    try {
      if (repairPendingEvidenceOutbox) {
        try { repairPendingEvidenceOutbox(); } catch { /* retention remains authoritative */ }
      }
      let entries = [];
      try { entries = io.readdirSync(rootPath(), { withFileTypes: true }); }
      catch { return { removed, failures: 1, skipped_active: false }; }
      for (const entry of entries) {
        const orphanToken = intakeToken(entry);
        if (orphanToken) {
          try { if (intakeIntent.cleanup(orphanToken, now)) removed++; } catch { failures++; }
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const tokenFromName = entry.name.slice(0, -'.json'.length);
        if (!tokenPattern.test(tokenFromName)) continue;
        try {
          const state = readMaintenanceState(tokenFromName);
          if (liveLocalExecutor(state)) continue;
          if (state.zero_day_work === true && !processAlive(state.intake_owner_pid)) finishZeroDayWork(state);
          if (now <= Date.parse(state.expires_at)) continue;
          if (reconcileTerminalEvidence) reconcileTerminalEvidence(state);
          removeWorkDirectory(state.token);
          removeState(state);
          removed++;
        } catch { failures++; }
      }
      return { removed, failures, skipped_active: false };
    } finally {
      releaseActiveLock(token);
    }
  }

  return {
    incompleteBatchState,
    recoverableBatchStates,
    recoverableBatchStatus,
    localCleanupStatus,
    recoverBatches,
    cleanupExpiredBatchSnapshots
  };
}

module.exports = { createBatchRecovery };
