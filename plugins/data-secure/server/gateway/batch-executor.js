'use strict';

const crypto = require('crypto');
const { launchBackgroundRole } = require('../background-role-launcher');
const { SafeError } = require('../runtime');
const {
  claimLocalBatchExecutor,
  releaseLocalBatchExecutor,
  readBatchProgress
} = require('./batch');
const { validateSummary, showLocalIntakeNotice, showBatchStateNotice } = require('../companion/completion-summary');
const { recordWorkflowEvent } = require('./workflow-diagnostics');
const {
  reserveIntake,
  delegateIntake,
  releaseIntake,
  RESERVATION_ID_RE
} = require('./batch-intake-reservation');

const TOKEN_RE = /^[a-f0-9]{64}$/;
const pendingIntakes = new Map();
const pendingReviews = new Map();
const DEFAULT_IPC_ACK_TIMEOUT_MS = 5000;
const WORKER_ENV_KEYS = Object.freeze([
  'SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA',
  'HOME', 'XDG_DATA_HOME', 'EU_PRIVACY_ROOT', 'EU_PRIVACY_LANGUAGE',
  'EU_PRIVACY_VISUAL_MODE', 'EU_PRIVACY_RETENTION_DAYS'
]);

function batchWorkerEnvironment(source = process.env) {
  const clean = Object.create(null);
  for (const key of WORKER_ENV_KEYS) {
    if (typeof source[key] === 'string' && source[key].length > 0) clean[key] = source[key];
  }
  return clean;
}

// The intake worker sends this fixed envelope only after a terminal batch. It
// deliberately has no token, source metadata, package identifier or error
// detail, so a local completion view cannot become a new data boundary.
function terminalIntakeProgress(message) {
  const progress = localBatchStateProgress(message, new Set(['local-intake-complete', 'local-intake-state']));
  return progress?.complete === true ? {
    complete: true,
    batch_total: progress.batch_total,
    released: progress.released,
    stopped: progress.stopped,
    result_grade_counts: progress.result_grade_counts,
    result_omission_counts: progress.result_omission_counts,
    result_grades_verified: progress.result_grades_verified,
    ...(Object.hasOwn(progress, 'result_exported_count') ? {
      result_exported_count: progress.result_exported_count,
      result_export_pending_count: progress.result_export_pending_count,
      result_output_available: progress.result_output_available
    } : {})
  } : null;
}

function afterIpcDrain(options, callback) {
  const schedule = options.scheduleExitFinalization || ((next) => setTimeout(next, 100));
  try { schedule(callback); }
  catch { callback(); }
}

// Attach before checking pid: a failed spawn returns a ChildProcess without a
// pid and emits `error` on the next turn. An outer synchronous catch cannot
// consume that event. IPC errors may also happen after successful startup.
function observeWorker(child, onFailure, onExit) {
  if (!child || typeof child.once !== 'function') throw new Error('invalid child');
  const pid = Number.isSafeInteger(child.pid) && child.pid > 0 ? child.pid : null;
  let ended = false;
  let failed = false;
  let terminationRequested = false;
  function end(code) {
    if (ended) return;
    ended = true;
    onExit(code, failed, pid);
  }
  function fail(code) {
    if (ended || failed) return;
    failed = true;
    onFailure(code);
    if (pid === null) { end(null); return; }
    // A failed send does not prove the worker stopped. Keep its pending slot
    // and lease until actual exit; kill only this owned, not-yet-exited child.
    if (!terminationRequested && child.exitCode == null && child.signalCode == null) {
      terminationRequested = true;
      try { child.kill?.(); } catch { /* retain ownership until confirmed exit */ }
    }
  }
  (child.on || child.once).call(child, 'error', () => fail(pid === null ? 'LOCAL_WORKER_SPAWN_FAILED' : 'LOCAL_IPC_FAILED'));
  child.once('exit', end);
  return { fail, get ended() { return ended; }, get failed() { return failed; } };
}

const PRESENTABLE_BATCH_PHASES = new Set([
  'complete',
  'awaiting_local_review',
  'awaiting_explicit_resume',
  'awaiting_local_mapping_repair',
  'awaiting_delivery_acknowledgement',
  'ready_for_next_document',
  'invalid_local_state'
]);

function localBatchStateProgress(message, acceptedTypes = new Set(['local-intake-state', 'local-batch-state'])) {
  if (!message || !acceptedTypes.has(message.type)) return null;
  const resultKeys = ['result_grade_counts', 'result_omission_counts', 'result_grades_verified'];
  const exportKeys = ['result_exported_count', 'result_export_pending_count', 'result_output_available'];
  const presentResultKeys = resultKeys.filter((key) => Object.hasOwn(message, key));
  const presentExportKeys = exportKeys.filter((key) => Object.hasOwn(message, key));
  const allowedKeys = new Set(['type', 'complete', 'batch_phase', 'batch_total', 'released', 'stopped', ...resultKeys, ...exportKeys]);
  if (Object.keys(message).some((key) => !allowedKeys.has(key)) ||
      (presentResultKeys.length !== 0 && presentResultKeys.length !== resultKeys.length) ||
      (presentExportKeys.length !== 0 && presentExportKeys.length !== exportKeys.length)) return null;
  const batchTotal = message.batch_total;
  const released = message.released;
  const stopped = message.stopped;
  if (![batchTotal, released, stopped].every(Number.isSafeInteger) ||
      batchTotal < 1 || batchTotal > 100 || released < 0 || stopped < 0 ||
      released + stopped > batchTotal) return null;
  const legacyComplete = message.type === 'local-intake-complete';
  const complete = legacyComplete || message.complete === true;
  const batchPhase = legacyComplete ? 'complete' : String(message.batch_phase || '');
  if (!PRESENTABLE_BATCH_PHASES.has(batchPhase)) return null;
  if ((complete || batchPhase === 'complete') && (batchPhase !== 'complete' || released + stopped !== batchTotal)) return null;
  if (!complete && batchPhase === 'complete') return null;
  if (!complete && released + stopped >= batchTotal) return null;
  const exported = presentExportKeys.length ? message.result_exported_count : 0;
  const exportPending = presentExportKeys.length ? message.result_export_pending_count : 0;
  const outputAvailable = presentExportKeys.length ? message.result_output_available : false;
  if (![exported, exportPending].every(Number.isSafeInteger) || exported < 0 || exportPending < 0 ||
      typeof outputAvailable !== 'boolean' || (!complete && (exported !== 0 || exportPending !== 0 || outputAvailable)) ||
      (complete && presentExportKeys.length && exported + exportPending !== released) ||
      (exportPending > 0 && outputAvailable)) return null;
  let validated;
  if (!complete) {
    const gradeCounts = presentResultKeys.length ? message.result_grade_counts :
      { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: batchTotal };
    const omissionCounts = presentResultKeys.length ? message.result_omission_counts :
      { images_removed_by_request: 0, visual_assets_withheld_locally: 0 };
    const validRestingProjection = gradeCounts && Object.keys(gradeCounts).sort().join(',') === 'complete,not_processed,unavailable,usable_with_omissions' &&
      omissionCounts && Object.keys(omissionCounts).sort().join(',') === 'images_removed_by_request,visual_assets_withheld_locally' &&
      gradeCounts.complete === 0 && gradeCounts.usable_with_omissions === 0 && gradeCounts.not_processed === 0 && gradeCounts.unavailable === batchTotal &&
      omissionCounts.images_removed_by_request === 0 && omissionCounts.visual_assets_withheld_locally === 0 &&
      (!presentResultKeys.length || message.result_grades_verified === false);
    if (!validRestingProjection) return null;
    validated = { gradeCounts: { ...gradeCounts }, omissionCounts: { ...omissionCounts }, gradesVerified: false };
  } else {
    try {
      validated = validateSummary({
        selected_count: batchTotal,
        released_count: released,
        failed_count: stopped,
        ...(presentResultKeys.length ? {
          result_grade_counts: message.result_grade_counts,
          result_omission_counts: message.result_omission_counts,
          result_grades_verified: message.result_grades_verified
        } : {})
      });
    } catch { return null; }
  }
  return {
    complete,
    batch_phase: batchPhase,
    batch_total: batchTotal,
    released,
    stopped,
    result_grade_counts: validated.gradeCounts,
    result_omission_counts: validated.omissionCounts,
    result_grades_verified: validated.gradesVerified,
    ...(presentExportKeys.length ? {
      result_exported_count: exported,
      result_export_pending_count: exportPending,
      result_output_available: outputAvailable
    } : {})
  };
}

// A detached worker can exit before its final bounded IPC envelope is observed
// by the parent (seen intermittently on Windows). The durable journal is the
// authority in that case. Reconstruct only the same content-free counters that
// the worker was allowed to send; never surface the token or journal details.
function durableBatchStateProgress(token, type, options = {}) {
  try {
    const progress = (options.readBatchProgress || readBatchProgress)(token);
    const projection = localBatchStateProgress({
      type,
      complete: progress.complete,
      batch_phase: progress.batch_phase,
      batch_total: progress.batch_total,
      released: progress.released,
      stopped: progress.stopped,
      result_grade_counts: progress.result_grade_counts,
      result_omission_counts: progress.result_omission_counts,
      result_grades_verified: progress.result_grades_verified
    });
    if (projection?.complete !== true) return projection;
    try {
      const exporter = options.exportCompletedBatchResults ||
        ((batchToken) => require('./batch').exportCompletedBatchResults(batchToken));
      const visible = exporter(token);
      return localBatchStateProgress({
        ...projection,
        type,
        result_exported_count: visible.exported,
        result_export_pending_count: visible.pending,
        result_output_available: visible.available
      });
    } catch {
      // The durable processing result remains authoritative even if the
      // convenience export cannot be repaired in this fallback pass.
      return projection;
    }
  } catch {
    return null;
  }
}

function startLocalBatchExecutor(token, options = {}) {
  if (!TOKEN_RE.test(String(token || ''))) throw new SafeError('Batch-Sitzung ist ungültig.');
  const forkProcess = options.forkProcess;
  const record = options.recordWorkflowEvent || recordWorkflowEvent;
  const lifecycle = (event) => { try { record(event); } catch { /* diagnostics never changes processing */ } };
  let child;
  let worker;
  let claimedLease = false;
  let noticeShown = false;
  const showNoticeOnce = (progress) => {
    if (noticeShown || !progress) return;
    noticeShown = true;
    try { (options.showBatchStateNotice || showBatchStateNotice)(progress); }
    catch { /* presentation never changes the privacy state */ }
  };
  const finalizeExit = () => afterIpcDrain(options, () => {
    if (noticeShown) return;
    showNoticeOnce(durableBatchStateProgress(token, 'local-batch-state', options));
    if (noticeShown) return;
    noticeShown = true;
    try { (options.showLocalIntakeNotice || showLocalIntakeNotice)('after_checkpoint'); }
    catch { /* presentation never changes the privacy state */ }
  });
  try {
    child = launchBackgroundRole('batch', { forkProcess, env: batchWorkerEnvironment(options.env || process.env) });
    worker = observeWorker(child, (errorCode) => {
      lifecycle({ event: 'intake_ipc_failed', outcome: 'stopped', error_code: errorCode });
    }, (code, failed, pid) => {
      if (pid === null) return; // a never-started process has no OS exit
      if (failed && claimedLease) releaseLocalBatchExecutor(token, pid);
      lifecycle({ event: 'intake_worker_exited', outcome: code === 0 && !failed ? 'ok' : 'stopped', exit_code: code,
        error_code: code === 0 && !failed ? 'NONE' : 'LOCAL_WORKER_EXITED' });
      if (claimedLease) finalizeExit();
    });
    if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0 || typeof child.send !== 'function') {
      throw new Error('invalid child');
    }
    lifecycle({ event: 'intake_worker_spawned', outcome: 'ok' });
    const claimed = claimLocalBatchExecutor(token, child.pid);
    if (claimed.ok === false) {
      worker.fail('LOCAL_WORKER_SPAWN_FAILED');
      return claimed;
    }
    claimedLease = true;
    const presentProgress = (progress) => {
      if (progress) lifecycle({
        event: 'intake_terminal_state', outcome: progress.complete ? 'ok' : 'progress',
        phase: progress.batch_phase, item_count: progress.batch_total,
        released_count: progress.released, stopped_count: progress.stopped
      });
      showNoticeOnce(progress);
    };
    child.on?.('message', (message) => {
      const progress = localBatchStateProgress(message);
      presentProgress(progress);
    });
    child.send({ type: 'start-local-batch', batch_token: token }, (error) => {
      if (worker.ended || worker.failed) return;
      if (error) { worker.fail('LOCAL_IPC_FAILED'); return; }
      lifecycle({ event: error ? 'intake_ipc_failed' : 'intake_ipc_dispatched', outcome: error ? 'stopped' : 'ok',
        error_code: error ? 'LOCAL_IPC_FAILED' : 'NONE' });
      child.unref?.();
    });
    if (worker.failed) throw new Error('worker start failed');
    return {
      ok: true,
      local_processing_started: true,
      ...readBatchProgress(token),
      raw_content_sent_to_claude: false
    };
  } catch {
    if (worker) worker.fail('LOCAL_WORKER_SPAWN_FAILED');
    else lifecycle({ event: 'intake_ipc_failed', outcome: 'stopped', error_code: 'LOCAL_WORKER_SPAWN_FAILED' });
    throw new SafeError('Der lokale Stapelprozessor konnte nicht sicher gestartet werden.');
  }
}

// The picker has already obtained the user's single local confirmation.  Do
// not make Cowork wait while potentially large sources are preflighted and
// copied into the sealed batch snapshot.  Paths exist only in this private
// IPC message and are never returned from this module or written through MCP.
function startLocalIntakeExecutor(queue, profile = 'auto', options = {}) {
  if (!Array.isArray(queue) || queue.length < 1) throw new SafeError('Keine Datei für die lokale Übernahme ausgewählt.');
  if (pendingIntakes.size > 0) throw new SafeError('Ein lokaler DataSecure-Stapel wird bereits vorbereitet.');
  const reserve = options.reserveIntake || reserveIntake;
  const delegate = options.delegateIntake || delegateIntake;
  const release = options.releaseIntake || releaseIntake;
  const suppliedReservation = String(options.intakeReservationId || '');
  const reservationId = RESERVATION_ID_RE.test(suppliedReservation)
    ? suppliedReservation
    : reserve().reservation_id;
  const token = crypto.randomBytes(32).toString('hex');
  const forkProcess = options.forkProcess;
  const showIntakeNotice = options.showLocalIntakeNotice || showLocalIntakeNotice;
  const showState = options.showBatchStateNotice || options.showTerminalBatchSummary || showBatchStateNotice;
  const workflowRecorder = options.recordWorkflowEvent || recordWorkflowEvent;
  const lifecycle = (event) => { try { workflowRecorder(event); } catch { /* diagnostics never changes processing */ } };
  const itemCount = queue.length;
  let child;
  let worker;
  let reservationDelegated = false;
  let onWorkerFailure = (errorCode) => lifecycle({ event: 'intake_ipc_failed', outcome: 'stopped', item_count: itemCount, error_code: errorCode });
  let onWorkerExit = (code, failed, pid) => {
    if (pid !== null) lifecycle({ event: 'intake_worker_exited', outcome: 'stopped', item_count: itemCount,
      exit_code: code, error_code: 'LOCAL_WORKER_EXITED' });
  };
  try {
    child = launchBackgroundRole('batch', { forkProcess, env: batchWorkerEnvironment(options.env || process.env) });
    worker = observeWorker(child, code => onWorkerFailure(code), (...args) => onWorkerExit(...args));
    if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0 || typeof child.send !== 'function') {
      throw new Error('invalid child');
    }
    delegate(reservationId, child.pid);
    reservationDelegated = true;
    lifecycle({ event: 'intake_worker_spawned', outcome: 'ok', item_count: itemCount });
    const intake = { checkpointCreated: false, processingStarted: false, noticeShown: false };
    const showFailureNotice = (stage) => {
      if (intake.noticeShown) return;
      intake.noticeShown = true;
      lifecycle({ event: 'completion_notice_started', outcome: 'progress', item_count: itemCount });
      try {
        showIntakeNotice(stage);
        lifecycle({ event: 'completion_notice_dispatched', outcome: 'ok', item_count: itemCount });
      } catch {
        lifecycle({ event: 'completion_notice_failed', outcome: 'stopped', item_count: itemCount,
          error_code: 'LOCAL_NOTICE_FAILED' });
      }
    };
    pendingIntakes.set(token, intake);
    // Bounded worker-side acknowledgement. The handoff counts as confirmed only
    // when the worker reports that it received and accepted the private intake
    // message; the send() callback below merely proves that the message left
    // this process. Tests and support callers may ignore the promise; the
    // normal picker awaits it. Keep a rejection from becoming process-global.
    let resolveIpc;
    let rejectIpc;
    const ipcAcknowledgement = new Promise((resolve, reject) => { resolveIpc = resolve; rejectIpc = reject; });
    ipcAcknowledgement.catch(() => {});
    const requestedAckTimeout = Number(options.ipcAckTimeoutMs);
    const ackTimeoutMs = Number.isSafeInteger(requestedAckTimeout) && requestedAckTimeout >= 10 && requestedAckTimeout <= 30000
      ? requestedAckTimeout : DEFAULT_IPC_ACK_TIMEOUT_MS;
    let ipcSettled = false;
    let abortListener;
    let ackTimer;
    const settleIpc = (error) => {
      if (ipcSettled) return false;
      ipcSettled = true;
      clearTimeout(ackTimer);
      if (abortListener) options.signal?.removeEventListener?.('abort', abortListener);
      if (error) rejectIpc(error);
      else resolveIpc();
      return true;
    };
    ackTimer = setTimeout(() => {
      if (!settleIpc(new Error('bounded IPC acknowledgement timeout'))) return;
      worker.fail('LOCAL_IPC_ACK_TIMEOUT');
    }, ackTimeoutMs);
    ackTimer.unref?.();
    if (options.signal?.aborted) {
      settleIpc(new Error('IPC acknowledgement cancelled'));
      worker.fail('LOCAL_IPC_ACK_CANCELLED');
    } else if (options.signal?.addEventListener) {
      abortListener = () => {
        if (!settleIpc(new Error('IPC acknowledgement cancelled'))) return;
        worker.fail('LOCAL_IPC_ACK_CANCELLED');
      };
      options.signal.addEventListener('abort', abortListener, { once: true });
    }
    const showStateOnce = (progress) => {
      if (!progress || intake.noticeShown) return false;
      intake.noticeShown = true;
      lifecycle({
        event: 'intake_terminal_state', outcome: progress.complete ? 'ok' : 'progress',
        phase: progress.batch_phase, item_count: progress.batch_total,
        released_count: progress.released, stopped_count: progress.stopped
      });
      lifecycle({ event: 'completion_notice_started', outcome: 'progress', item_count: itemCount });
      try {
        showState(progress);
        lifecycle({ event: 'completion_notice_dispatched', outcome: 'ok', item_count: itemCount });
      } catch {
        lifecycle({ event: 'completion_notice_failed', outcome: 'stopped', item_count: itemCount,
          error_code: 'LOCAL_NOTICE_FAILED' });
      }
      return true;
    };
    child.on?.('message', (message) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'local-intake-accepted') {
        // A duplicate or post-timeout acceptance is inert; a timed-out worker
        // has already been failed and is not revived by a late envelope.
        settleIpc();
        return;
      }
      if (message.type === 'local-intake-checkpoint-created') {
        intake.checkpointCreated = true;
        lifecycle({ event: 'intake_checkpoint_created', outcome: 'ok', item_count: itemCount });
      }
      if (message.type === 'local-intake-processing-started') {
        intake.processingStarted = true;
        lifecycle({ event: 'intake_processing_started', outcome: 'ok', item_count: itemCount });
      }
      const progress = localBatchStateProgress(message);
      showStateOnce(progress);
      if (message.type === 'local-intake-stopped') {
        lifecycle({ event: 'intake_terminal_state', outcome: 'stopped', item_count: itemCount,
          error_code: 'LOCAL_WORKER_EXITED' });
        showFailureNotice(message.stage === 'after_checkpoint' ? 'after_checkpoint' : 'before_checkpoint');
      }
    });
    onWorkerFailure = (errorCode) => {
      lifecycle({ event: 'intake_ipc_failed', outcome: 'stopped', item_count: itemCount, error_code: errorCode });
    };
    onWorkerExit = (code, failed, pid) => {
      // A worker that ends before acknowledging cannot confirm the handoff;
      // reject immediately instead of waiting for the bounded timer.
      settleIpc(new Error('worker ended before IPC acknowledgement'));
      lifecycle({ event: 'intake_worker_exited', outcome: code === 0 && !failed ? 'ok' : 'stopped', item_count: itemCount,
        exit_code: code, error_code: code === 0 && !failed ? 'NONE' : 'LOCAL_WORKER_EXITED' });
      if (pendingIntakes.get(token) === intake) pendingIntakes.delete(token);
      release(reservationId);
      if (failed && intake.checkpointCreated) releaseLocalBatchExecutor(token, pid);
      afterIpcDrain(options, () => {
        if (intake.noticeShown) return;
        showStateOnce(durableBatchStateProgress(token, 'local-intake-state', options));
        if (!intake.noticeShown) showFailureNotice(intake.checkpointCreated ? 'after_checkpoint' : 'before_checkpoint');
      });
    };
    child.send({
        type: 'start-local-intake',
        batch_token: token,
        intake_reservation_id: reservationId,
        profile,
        queue: queue.map((entry) => ({
          name: entry.name, full: entry.full, sourceBytes: entry.sourceBytes,
          sourceLabel: entry.sourceLabel || entry.name
        }))
      }, (error) => {
        if (ipcSettled) return;
        if (error || worker.ended || worker.failed) {
          worker.fail('LOCAL_IPC_FAILED');
          settleIpc(error || new Error('worker ended before IPC acknowledgement'));
          return;
        }
        // Dispatched, not acknowledged: the worker's acceptance envelope or
        // the bounded timer settles the handoff.
        lifecycle({ event: 'intake_ipc_dispatched', outcome: 'ok', item_count: itemCount, error_code: 'NONE' });
        child.unref?.();
      });
    if (worker.failed) throw new Error('worker start failed');
    const response = { ok: true, batch_token: token, local_intake_pending: true, raw_content_sent_to_claude: false };
    Object.defineProperty(response, 'ipcAcknowledgement', { value: ipcAcknowledgement, enumerable: false });
    return response;
  } catch {
    if (worker) worker.fail('LOCAL_WORKER_SPAWN_FAILED');
    else lifecycle({ event: 'intake_ipc_failed', outcome: 'stopped', item_count: itemCount,
      error_code: 'LOCAL_WORKER_SPAWN_FAILED' });
    if (!reservationDelegated) release(reservationId);
    throw new SafeError('Die lokale Stapelübernahme konnte nicht sicher gestartet werden.');
  }
}

function contentFreeReviewStart(progress, started) {
  return {
    ok: progress?.ok !== false,
    local_review_started: started === true,
    batch_total: Number(progress?.batch_total || 0),
    released: Number(progress?.released || 0),
    stopped: Number(progress?.stopped || 0),
    deferred_review: Number(progress?.deferred_review || 0),
    batch_phase: started === true ? 'processing_local_review' : String(progress?.batch_phase || 'invalid_local_state'),
    next_action: started === true ? 'complete_review_in_local_window' : 'check_local_status',
    raw_content_sent_to_claude: false
  };
}

// Human review can legitimately take longer than a Cowork tool deadline.  The
// token is sent only over inherited private IPC to a detached local worker;
// Cowork receives a bounded start acknowledgement immediately and never sees
// the token or waits for the review window to close.
function startLocalReviewExecutor(token, options = {}) {
  if (!TOKEN_RE.test(String(token || ''))) throw new SafeError('Batch-Sitzung ist ungültig.');
  if (pendingReviews.size > 0) throw new SafeError('Eine lokale DataSecure-Prüfung läuft bereits.');
  const forkProcess = options.forkProcess;
  const record = options.recordWorkflowEvent || recordWorkflowEvent;
  const claimExecutor = options.claimLocalBatchExecutor || claimLocalBatchExecutor;
  const releaseExecutor = options.releaseLocalBatchExecutor || releaseLocalBatchExecutor;
  const lifecycle = (event) => { try { record(event); } catch { /* diagnostics never changes review state */ } };
  let child;
  let worker;
  let onWorkerFailure = (errorCode) => lifecycle({ event: 'review_ipc_failed', outcome: 'stopped', error_code: errorCode });
  let onWorkerExit = (code, failed, pid) => {
    if (pid !== null) lifecycle({ event: 'review_worker_exited', outcome: 'stopped', exit_code: code,
      error_code: 'LOCAL_REVIEW_WORKER_EXITED' });
  };
  let claimedLease = false;
  try {
    child = launchBackgroundRole('review', { forkProcess, env: batchWorkerEnvironment(options.env || process.env) });
    worker = observeWorker(child, code => onWorkerFailure(code), (...args) => onWorkerExit(...args));
    if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0 || typeof child.send !== 'function') {
      throw new Error('invalid child');
    }
    lifecycle({ event: 'review_worker_spawned', outcome: 'ok' });
    const claimed = claimExecutor(token, child.pid);
    if (claimed.ok === false) {
      worker.fail('LOCAL_WORKER_SPAWN_FAILED');
      return contentFreeReviewStart(claimed, false);
    }
    claimedLease = true;
    pendingReviews.set(token, child);
    onWorkerFailure = (errorCode) => {
      lifecycle({ event: 'review_ipc_failed', outcome: 'stopped', error_code: errorCode });
    };
    onWorkerExit = (code, failed, pid) => {
      lifecycle({ event: 'review_worker_exited', outcome: code === 0 && !failed ? 'ok' : 'stopped', exit_code: code,
        error_code: code === 0 && !failed ? 'NONE' : 'LOCAL_REVIEW_WORKER_EXITED' });
      if (claimedLease) releaseExecutor(token, pid);
      if (pendingReviews.get(token) === child) pendingReviews.delete(token);
    };
    child.send({ type: 'start-local-review', batch_token: token }, (error) => {
      if (worker.ended || worker.failed) return;
      if (error) { worker.fail('LOCAL_IPC_FAILED'); return; }
      lifecycle({ event: error ? 'review_ipc_failed' : 'review_ipc_dispatched', outcome: error ? 'stopped' : 'ok',
        error_code: error ? 'LOCAL_IPC_FAILED' : 'NONE' });
      child.unref?.();
    });
    if (worker.failed) throw new Error('worker start failed');
    return contentFreeReviewStart(claimed, true);
  } catch {
    if (worker) worker.fail('LOCAL_WORKER_SPAWN_FAILED');
    else lifecycle({ event: 'review_ipc_failed', outcome: 'stopped', error_code: 'LOCAL_WORKER_SPAWN_FAILED' });
    throw new SafeError('Die lokale Stapelprüfung konnte nicht sicher gestartet werden.');
  }
}

function localIntakeActive() { return pendingIntakes.size > 0; }
function localReviewActive() { return pendingReviews.size > 0; }

module.exports = {
  WORKER_ENV_KEYS, batchWorkerEnvironment, localBatchStateProgress, terminalIntakeProgress,
  startLocalBatchExecutor, startLocalIntakeExecutor, startLocalReviewExecutor,
  localIntakeActive, localReviewActive, _test: { contentFreeReviewStart }
};
