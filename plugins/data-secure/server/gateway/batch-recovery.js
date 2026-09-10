'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { TOKEN_RE, batchRoot, batchPath, safeRemoveWorkDirectory } = require('./batch-private-store');
const { createBatchIntakeIntent, SUFFIX: INTAKE_SUFFIX } = require('./batch-intake-intent');
const { releaseOwnedLock } = require('./batch-lock-release');
const { batchReviewReady } = require('./batch-next-action');

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
  const visibleExportStatus = options.visibleExportStatus || ((_token, released) => ({
    exported: released, pending: 0, available: released > 0
  }));
  const visibleExportDirectory = options.visibleExportDirectory || (() => '');
  const exportCompletedState = options.exportCompletedState || (() => ({ exported: 0, pending: 0, available: false }));
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
  const ErrorType = options.SafeError || SafeError;
  const recoverableState = options.recoverableState || (() => true);

  function intakeToken(entry) {
    if (!entry.isFile() || !entry.name.endsWith(INTAKE_SUFFIX)) return null;
    const token = entry.name.slice(0, -INTAKE_SUFFIX.length);
    return tokenPattern.test(token) ? token : null;
  }

  function incompleteBatchState(state) {
    return !state.invalidated && (state.items || []).some((item) =>
      (item.status === 'stopped' && item.local_mapping_exported === false) ||
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
        if (nowMs() <= Date.parse(state.expires_at) && incompleteBatchState(state) && recoverableState(state) &&
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

  function latestProductBatchState(productChannel) {
    if (!['plugin', 'standalone'].includes(productChannel)) throw new Error('PRODUCT_CHANNEL_INVALID');
    let entries = [];
    try { entries = io.readdirSync(rootPath(), { withFileTypes: true }); } catch { return null; }
    let latest = null;
    let latestCreatedAt = -1;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const token = entry.name.slice(0, -'.json'.length);
      if (!tokenPattern.test(token)) continue;
      try {
        const state = readMaintenanceState(token);
        if (state.product_channel !== productChannel || nowMs() > Date.parse(state.expires_at)) continue;
        const createdAt = Date.parse(state.created_at);
        if (!Number.isFinite(createdAt) || createdAt < latestCreatedAt) continue;
        if (createdAt === latestCreatedAt && latest && state.token.localeCompare(latest.token) <= 0) continue;
        latest = state;
        latestCreatedAt = createdAt;
      } catch { /* malformed, legacy and expired journals are not product UI state */ }
    }
    return latest;
  }

  function latestProductBatchStatus(productChannel) {
    const latest = latestProductBatchState(productChannel);
    return projectProductBatchStatus(latest);
  }

  function projectProductBatchStatus(latest) {
    if (!latest) return null;
    const progress = publicProgress(latest, { skipResultProjection: true });
    const visible = visibleExportStatus(latest.token, progress.released);
    return Object.freeze({
      ...(latest.schema === 'datasecure-batch/5' ? { processing_mode: 'markdown-only', warning_count: progress.warning_count || 0 } : {}),
      ...(['datasecure-batch/5', 'datasecure-batch/6'].includes(latest.schema)
        && latest.items.some(item => item.error_code === 'CONVERSION_TERMINATION_UNCONFIRMED')
        ? { termination_unconfirmed: true } : {}),
      selected_count: progress.batch_total,
      completed_count: progress.completed,
      failed_count: progress.stopped,
      review_count: progress.deferred_review,
      review_ready: batchReviewReady(progress),
      result_count: visible.available === true ? visible.exported : 0,
      export_pending_count: visible.pending,
      ...(visible.completion_pending === true ? { completion_pending: true } : {}),
      // A processing checkpoint survives a dead worker. Only a live executor
      // proves current work; otherwise the recovery counters expose Resume.
      // A live global processing lock is independently projected in `recovery`.
      processing: progress.local_processing_active === true,
      resumable: progress.awaiting_resume === true && recoverableState(latest),
      complete: progress.complete === true,
      ...(progress.complete === true && progress.stopped > 0
        ? { completion_available: visible.available === true && visibleExportDirectory(latest.token) !== '' } : {})
    });
  }

  // Standalone polls frequently. Recovery counters and the newest product
  // state therefore share one immutable journal enumeration instead of two
  // synchronous full scans per poll. Malformed and expired rows remain
  // fail-closed and never escape into the renderer projection.
  function productStatusSnapshot(productChannel, selection = {}) {
    if (!['plugin', 'standalone'].includes(productChannel)) throw new Error('PRODUCT_CHANNEL_INVALID');
    // Identity is returned only to the private Standalone application adapter.
    // Existing public/plugin projections remain content-free and newest-first.
    const observeRun = productChannel === 'standalone' && selection.localUiSelection === true;
    const selectedToken = observeRun && tokenPattern.test(String(selection.selectedBatchId || ''))
      ? selection.selectedBatchId : null;
    const owner = readActiveLock();
    const ownerActive = Boolean(owner && processAlive(owner.pid));
    let processingActive = ownerActive;
    let entries = [];
    try { entries = io.readdirSync(rootPath(), { withFileTypes: true }); }
    catch {
      return Object.freeze({
        recovery: Object.freeze({ recoverable_batches: 0, batches_awaiting_resume: 0,
          batches_awaiting_delivery: 0, batch_processing_active: processingActive }),
        latest: null,
        ...(observeRun ? { observed_batch_id: null, observed_is_active: false, observed_recoverable: false } : {})
      });
    }
    const recoverable = [];
    let latest = null;
    let latestCreatedAt = -1;
    let selected = null;
    let activeProduct = null;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const token = entry.name.slice(0, -'.json'.length);
      if (!tokenPattern.test(token)) continue;
      try {
        const candidate = readMaintenanceState(token);
        const expiresAt = Date.parse(candidate.expires_at);
        const live = liveLocalExecutor(candidate);
        if (live) processingActive = true;
        if (!ownerActive && nowMs() <= expiresAt && incompleteBatchState(candidate) && recoverableState(candidate) &&
            !(candidate.zero_day_work === true && candidate.zero_day_work_cleaned !== true &&
              !live && !processAlive(candidate.intake_owner_pid))) {
          if (!live) recoverable.push(candidate);
        }
        if (candidate.product_channel !== productChannel || nowMs() > expiresAt) continue;
        const createdAt = Date.parse(candidate.created_at);
        if (!Number.isFinite(createdAt)) continue;
        if (observeRun && candidate.token === selectedToken) selected = candidate;
        if (observeRun && live && (!activeProduct || createdAt > Date.parse(activeProduct.created_at))) activeProduct = candidate;
        if (createdAt < latestCreatedAt) continue;
        if (createdAt === latestCreatedAt && latest && candidate.token.localeCompare(latest.token) <= 0) continue;
        latest = candidate;
        latestCreatedAt = createdAt;
      } catch { /* one unsafe journal cannot become public UI state */ }
    }
    const observed = observeRun ? (activeProduct || (selectedToken ? selected : latest)) : latest;
    return Object.freeze({
      recovery: Object.freeze({
        recoverable_batches: recoverable.length,
        batches_awaiting_resume: recoverable.filter((candidate) => publicProgress(candidate).awaiting_resume).length,
        batches_awaiting_delivery: recoverable.filter((candidate) =>
          candidate.items.some((item) => item.status === deliveryPendingStatus)).length,
        batch_processing_active: processingActive
      }),
      latest: projectProductBatchStatus(observed),
      ...(observeRun ? { observed_batch_id: observed?.token || null,
        observed_is_active: Boolean(activeProduct),
        observed_recoverable: Boolean(observed && recoverable.some((candidate) => candidate.token === observed.token)) } : {})
    });
  }

  function latestProductResultDirectory(productChannel, options = {}) {
    if (!['plugin', 'standalone'].includes(productChannel)) throw new Error('PRODUCT_CHANNEL_INVALID');
    if (options.latestBatchOnly === true) {
      const latest = latestProductBatchState(productChannel);
      if (!latest || publicProgress(latest, { skipResultProjection: true }).complete !== true) return '';
      if (options.ensureExport === true) {
        try { exportCompletedState(latest); } catch { return ''; }
      }
      return visibleExportDirectory(latest.token);
    }
    let entries = [];
    try { entries = io.readdirSync(rootPath(), { withFileTypes: true }); } catch { return ''; }
    let latestDirectory = '';
    let latestCreatedAt = -1;
    let latestToken = '';
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const token = entry.name.slice(0, -'.json'.length);
      if (!tokenPattern.test(token)) continue;
      try {
        const state = readMaintenanceState(token);
        if (state.product_channel !== productChannel || nowMs() > Date.parse(state.expires_at)) continue;
        if (options.ensureExport === true && publicProgress(state, { skipResultProjection: true }).complete === true) {
          try { exportCompletedState(state); } catch { /* visible result remains unavailable below */ }
        }
        const directory = visibleExportDirectory(state.token);
        if (!directory) continue;
        const createdAt = Date.parse(state.created_at);
        if (!Number.isFinite(createdAt) || createdAt < latestCreatedAt) continue;
        if (createdAt === latestCreatedAt && latestToken && state.token.localeCompare(latestToken) <= 0) continue;
        latestDirectory = directory;
        latestCreatedAt = createdAt;
        latestToken = state.token;
      } catch { /* malformed, expired or unavailable visible runs are skipped */ }
    }
    return latestDirectory;
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
    let primaryError = false;
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
    } catch (error) {
      primaryError = true;
      throw error;
    } finally {
      releaseOwnedLock(releaseActiveLock, token, ErrorType, primaryError);
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
    let primaryError = false;
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
    } catch (error) {
      primaryError = true;
      throw error;
    } finally {
      releaseOwnedLock(releaseActiveLock, token, ErrorType, primaryError);
    }
  }

  return {
    incompleteBatchState,
    recoverableBatchStates,
    recoverableBatchStatus,
    productStatusSnapshot,
    latestProductBatchStatus,
    latestProductResultDirectory,
    localCleanupStatus,
    recoverBatches,
    cleanupExpiredBatchSnapshots
  };
}

module.exports = { createBatchRecovery };
