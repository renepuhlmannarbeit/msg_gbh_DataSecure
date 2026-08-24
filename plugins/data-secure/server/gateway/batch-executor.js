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

const TOKEN_RE = /^[a-f0-9]{64}$/;
const pendingIntakes = new Map();
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

function startLocalBatchExecutor(token, options = {}) {
  if (!TOKEN_RE.test(String(token || ''))) throw new SafeError('Batch-Sitzung ist ungültig.');
  const forkProcess = options.forkProcess || fork;
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
    child.on?.('message', (message) => showNoticeOnce(localBatchStateProgress(message)));
    child.once?.('exit', () => {
      if (noticeShown) return;
      noticeShown = true;
      try { (options.showLocalIntakeNotice || showLocalIntakeNotice)('after_checkpoint'); }
      catch { /* presentation never changes the privacy state */ }
    });
    child.send({ type: 'start-local-batch', batch_token: token }, (error) => {
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
    const intake = { checkpointCreated: false, processingStarted: false, noticeShown: false };
    const showFailureNotice = (stage) => {
      if (intake.noticeShown) return;
      intake.noticeShown = true;
      try { showIntakeNotice(stage); } catch { /* local notice never changes the privacy state */ }
    };
    pendingIntakes.set(token, intake);
    child.on?.('message', (message) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'local-intake-checkpoint-created') intake.checkpointCreated = true;
      if (message.type === 'local-intake-processing-started') intake.processingStarted = true;
      const progress = localBatchStateProgress(message);
      if (progress && !intake.noticeShown) {
        intake.noticeShown = true;
        try { showState(progress); } catch { /* presentation never changes published local results */ }
      }
      if (message.type === 'local-intake-stopped') showFailureNotice(message.stage === 'after_checkpoint' ? 'after_checkpoint' : 'before_checkpoint');
    });
    child.once?.('exit', (code) => {
      if (!intake.noticeShown) showFailureNotice(intake.checkpointCreated ? 'after_checkpoint' : 'before_checkpoint');
      pendingIntakes.delete(token);
    });
    child.send({
      type: 'start-local-intake',
      batch_token: token,
      profile,
      queue: queue.map((entry) => ({ name: entry.name, full: entry.full, sourceBytes: entry.sourceBytes }))
    }, (error) => {
      if (error) {
        showFailureNotice('before_checkpoint');
        pendingIntakes.delete(token);
        try { child.kill?.(); } catch { /* only the just-created helper is targeted */ }
      }
      child.unref?.();
    });
    return { ok: true, batch_token: token, local_intake_pending: true, raw_content_sent_to_claude: false };
  } catch {
    pendingIntakes.delete(token);
    try { child?.kill?.(); } catch { /* only the just-created helper is targeted */ }
    throw new SafeError('Die lokale Stapelübernahme konnte nicht sicher gestartet werden.');
  }
}

function localIntakeActive() { return pendingIntakes.size > 0; }

module.exports = { WORKER_ENV_KEYS, batchWorkerEnvironment, localBatchStateProgress, terminalIntakeProgress, startLocalBatchExecutor, startLocalIntakeExecutor, localIntakeActive };
