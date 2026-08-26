'use strict';

const path = require('path');
const crypto = require('crypto');
const { fork } = require('child_process');
const { SafeError } = require('../runtime');
const {
  claimLocalBatchExecutor,
  releaseLocalBatchExecutor,
  readBatchProgress
} = require('./batch');
const { showLocalIntakeNotice, showBatchStateNotice } = require('../companion/completion-summary');
const { recordWorkflowEvent } = require('./workflow-diagnostics');

const TOKEN_RE = /^[a-f0-9]{64}$/;
const pendingIntakes = new Map();
const pendingReviews = new Map();
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
    stopped: progress.stopped
  } : null;
}

function afterIpcDrain(options, callback) {
  const schedule = options.scheduleExitFinalization || ((next) => setTimeout(next, 100));
  try { schedule(callback); }
  catch { callback(); }
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
  const batchTotal = Number(message.batch_total);
  const released = Number(message.released);
  const stopped = Number(message.stopped);
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
  return { complete, batch_phase: batchPhase, batch_total: batchTotal, released, stopped };
}

// A detached worker can exit before its final bounded IPC envelope is observed
// by the parent (seen intermittently on Windows). The durable journal is the
// authority in that case. Reconstruct only the same content-free counters that
// the worker was allowed to send; never surface the token or journal details.
function durableBatchStateProgress(token, type, options = {}) {
  try {
    const progress = (options.readBatchProgress || readBatchProgress)(token);
    return localBatchStateProgress({ type, ...progress });
  } catch {
    return null;
  }
}

function startLocalBatchExecutor(token, options = {}) {
  if (!TOKEN_RE.test(String(token || ''))) throw new SafeError('Batch-Sitzung ist ungültig.');
  const forkProcess = options.forkProcess || fork;
  const record = options.recordWorkflowEvent || recordWorkflowEvent;
  const lifecycle = (event) => { try { record(event); } catch { /* diagnostics never changes processing */ } };
  let child;
  try {
    child = forkProcess(path.join(__dirname, 'batch-worker.js'), [], {
      detached: true,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [`--require=${path.join(__dirname, '..', 'network-deny.cjs')}`],
      env: batchWorkerEnvironment(options.env || process.env),
      serialization: 'json'
    });
    if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0 || typeof child.send !== 'function') {
      throw new Error('invalid child');
    }
    lifecycle({ event: 'intake_worker_spawned', outcome: 'ok' });
    const claimed = claimLocalBatchExecutor(token, child.pid);
    if (claimed.ok === false) {
      try { child.kill(); } catch { /* only the just-created helper is targeted */ }
      return claimed;
    }
    let noticeShown = false;
    const showNoticeOnce = (progress) => {
      if (noticeShown || !progress) return;
      noticeShown = true;
      try { (options.showBatchStateNotice || showBatchStateNotice)(progress); }
      catch { /* presentation never changes the privacy state */ }
    };
    child.on?.('message', (message) => {
      const progress = localBatchStateProgress(message);
      if (progress) lifecycle({
        event: 'intake_terminal_state', outcome: progress.complete ? 'ok' : 'progress',
        phase: progress.batch_phase, item_count: progress.batch_total,
        released_count: progress.released, stopped_count: progress.stopped
      });
      showNoticeOnce(progress);
    });
    child.once?.('exit', (code) => {
      lifecycle({ event: 'intake_worker_exited', outcome: code === 0 ? 'ok' : 'stopped', exit_code: code,
        error_code: code === 0 ? 'NONE' : 'LOCAL_WORKER_EXITED' });
      // On Windows the child exit event can overtake the final IPC message.
      // Give that already-sent bounded state envelope one event-loop grace
      // window before presenting a false failure notice.
      afterIpcDrain(options, () => {
        if (noticeShown) return;
        showNoticeOnce(durableBatchStateProgress(token, 'local-batch-state', options));
        if (noticeShown) return;
        noticeShown = true;
        try { (options.showLocalIntakeNotice || showLocalIntakeNotice)('after_checkpoint'); }
        catch { /* presentation never changes the privacy state */ }
      });
    });
    child.send({ type: 'start-local-batch', batch_token: token }, (error) => {
      lifecycle({ event: error ? 'intake_ipc_failed' : 'intake_ipc_dispatched', outcome: error ? 'stopped' : 'ok',
        error_code: error ? 'LOCAL_IPC_FAILED' : 'NONE' });
      if (error) releaseLocalBatchExecutor(token, child.pid);
      child.unref?.();
    });
    return {
      ok: true,
      local_processing_started: true,
      ...readBatchProgress(token),
      raw_content_sent_to_claude: false
    };
  } catch {
    lifecycle({ event: 'intake_worker_exited', outcome: 'stopped', error_code: 'LOCAL_WORKER_SPAWN_FAILED' });
    if (child && Number.isSafeInteger(child.pid)) {
      releaseLocalBatchExecutor(token, child.pid);
      try { child.kill(); } catch { /* only the just-created helper is targeted */ }
    }
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
  const token = crypto.randomBytes(32).toString('hex');
  const forkProcess = options.forkProcess || fork;
  const showIntakeNotice = options.showLocalIntakeNotice || showLocalIntakeNotice;
  const showState = options.showBatchStateNotice || options.showTerminalBatchSummary || showBatchStateNotice;
  const workflowRecorder = options.recordWorkflowEvent || recordWorkflowEvent;
  const lifecycle = (event) => { try { workflowRecorder(event); } catch { /* diagnostics never changes processing */ } };
  const itemCount = queue.length;
  let child;
  try {
    child = forkProcess(path.join(__dirname, 'batch-worker.js'), [], {
      detached: true,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [`--require=${path.join(__dirname, '..', 'network-deny.cjs')}`],
      env: batchWorkerEnvironment(options.env || process.env),
      serialization: 'json'
    });
    if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0 || typeof child.send !== 'function') {
      throw new Error('invalid child');
    }
    lifecycle({ event: 'intake_worker_spawned', outcome: 'ok', item_count: itemCount });
    const intake = { checkpointCreated: false, processingStarted: false, noticeShown: false };
    const showFailureNotice = (stage) => {
      if (intake.noticeShown) return;
      intake.noticeShown = true;
      lifecycle({ event: 'completion_notice_started', outcome: 'progress', item_count: itemCount });
      try {
        showIntakeNotice(stage);
        lifecycle({ event: 'completion_notice_finished', outcome: 'ok', item_count: itemCount });
      } catch {
        lifecycle({ event: 'completion_notice_failed', outcome: 'stopped', item_count: itemCount,
          error_code: 'LOCAL_NOTICE_FAILED' });
      }
    };
    pendingIntakes.set(token, intake);
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
        lifecycle({ event: 'completion_notice_finished', outcome: 'ok', item_count: itemCount });
      } catch {
        lifecycle({ event: 'completion_notice_failed', outcome: 'stopped', item_count: itemCount,
          error_code: 'LOCAL_NOTICE_FAILED' });
      }
      return true;
    };
    child.on?.('message', (message) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'local-intake-checkpoint-created') {
        intake.checkpointCreated = true;
        lifecycle({ event: 'intake_checkpoint_created', outcome: 'ok', item_count: itemCount });
      }
      if (message.type === 'local-intake-processing-started') {
        intake.processingStarted = true;
        lifecycle({ event: 'intake_processing_started', outcome: 'ok', item_count: itemCount });
      }
      showStateOnce(localBatchStateProgress(message));
      if (message.type === 'local-intake-stopped') {
        lifecycle({ event: 'intake_terminal_state', outcome: 'stopped', item_count: itemCount,
          error_code: 'LOCAL_WORKER_EXITED' });
        showFailureNotice(message.stage === 'after_checkpoint' ? 'after_checkpoint' : 'before_checkpoint');
      }
    });
    child.once?.('exit', (code) => {
      lifecycle({ event: 'intake_worker_exited', outcome: code === 0 ? 'ok' : 'stopped', item_count: itemCount,
        exit_code: code, error_code: code === 0 ? 'NONE' : 'LOCAL_WORKER_EXITED' });
      pendingIntakes.delete(token);
      afterIpcDrain(options, () => {
        if (intake.noticeShown) return;
        showStateOnce(durableBatchStateProgress(token, 'local-intake-state', options));
        if (!intake.noticeShown) showFailureNotice(intake.checkpointCreated ? 'after_checkpoint' : 'before_checkpoint');
      });
    });
    child.send({
      type: 'start-local-intake',
      batch_token: token,
      profile,
      queue: queue.map((entry) => ({ name: entry.name, full: entry.full, sourceBytes: entry.sourceBytes }))
    }, (error) => {
      lifecycle({ event: error ? 'intake_ipc_failed' : 'intake_ipc_dispatched', outcome: error ? 'stopped' : 'ok',
        item_count: itemCount, error_code: error ? 'LOCAL_IPC_FAILED' : 'NONE' });
      if (error) {
        showFailureNotice('before_checkpoint');
        pendingIntakes.delete(token);
        try { child.kill?.(); } catch { /* only the just-created helper is targeted */ }
      }
      child.unref?.();
    });
    return { ok: true, batch_token: token, local_intake_pending: true, raw_content_sent_to_claude: false };
  } catch {
    lifecycle({ event: 'intake_worker_exited', outcome: 'stopped', item_count: itemCount,
      error_code: 'LOCAL_WORKER_SPAWN_FAILED' });
    pendingIntakes.delete(token);
    try { child?.kill?.(); } catch { /* only the just-created helper is targeted */ }
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
  const forkProcess = options.forkProcess || fork;
  const record = options.recordWorkflowEvent || recordWorkflowEvent;
  const claimExecutor = options.claimLocalBatchExecutor || claimLocalBatchExecutor;
  const releaseExecutor = options.releaseLocalBatchExecutor || releaseLocalBatchExecutor;
  const lifecycle = (event) => { try { record(event); } catch { /* diagnostics never changes review state */ } };
  let child;
  try {
    child = forkProcess(path.join(__dirname, 'review-worker.js'), [], {
      detached: true,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [`--require=${path.join(__dirname, '..', 'network-deny.cjs')}`],
      env: batchWorkerEnvironment(options.env || process.env),
      serialization: 'json'
    });
    if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0 || typeof child.send !== 'function') {
      throw new Error('invalid child');
    }
    lifecycle({ event: 'review_worker_spawned', outcome: 'ok' });
    const claimed = claimExecutor(token, child.pid);
    if (claimed.ok === false) {
      try { child.kill(); } catch { /* only the just-created helper is targeted */ }
      return contentFreeReviewStart(claimed, false);
    }
    pendingReviews.set(token, child.pid);
    child.once?.('exit', (code) => {
      lifecycle({ event: 'review_worker_exited', outcome: code === 0 ? 'ok' : 'stopped', exit_code: code,
        error_code: code === 0 ? 'NONE' : 'LOCAL_REVIEW_WORKER_EXITED' });
      releaseExecutor(token, child.pid);
      pendingReviews.delete(token);
    });
    child.send({ type: 'start-local-review', batch_token: token }, (error) => {
      lifecycle({ event: error ? 'review_ipc_failed' : 'review_ipc_dispatched', outcome: error ? 'stopped' : 'ok',
        error_code: error ? 'LOCAL_IPC_FAILED' : 'NONE' });
      if (error) {
        releaseExecutor(token, child.pid);
        pendingReviews.delete(token);
        try { child.kill?.(); } catch { /* only the just-created helper is targeted */ }
      }
      child.unref?.();
    });
    return contentFreeReviewStart(claimed, true);
  } catch {
    lifecycle({ event: 'review_worker_exited', outcome: 'stopped', error_code: 'LOCAL_WORKER_SPAWN_FAILED' });
    pendingReviews.delete(token);
    if (child && Number.isSafeInteger(child.pid)) {
      releaseExecutor(token, child.pid);
      try { child.kill?.(); } catch { /* only the just-created helper is targeted */ }
    }
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
