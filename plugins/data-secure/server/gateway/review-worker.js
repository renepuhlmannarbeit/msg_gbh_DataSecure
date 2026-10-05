'use strict';

const crypto = require('node:crypto');

// The local human review must outlive the short Cowork tool call.  This worker
// owns reconstruction, the native review window and local publication; its
// parent receives no document content, file identity, capability or token in a
// response to Claude.
const {
  reviewDeferredBatch,
  releaseLocalBatchExecutor,
  readBatchProgress,
  exportCompletedBatchResults,
  reserveTerminalNotice,
  markTerminalNoticePresented,
  releaseTerminalNoticeReservation
} = require('./batch');
const { showBatchStateNoticeConfirmed } = require('../companion/completion-summary');
const { presentTerminalEnvelope } = require('./worker-terminal-presentation');
const standaloneChannel = process.env.DATASECURE_PRODUCT_CHANNEL === 'standalone';
const { recordWorkflowEvent } = require('./workflow-diagnostics');
const { DETACHED_REVIEW_TIMEOUT_MS } = require('../companion/review-timeouts');
const { terminalVisibleExport } = require('./result-export');

let started = false;
let activeBatchToken = null;
const startDeadline = setTimeout(() => process.exit(2), 30_000);
// The whole point of running detached is that a human decision can outlive a
// Cowork tool call. companion/text-review.js still defaults its native-dialog
// spawnSync to 5 minutes for direct internal callers; this worker is not
// bound by that per-request deadline, so it has no human-decision timeout.

function lifecycle(event) {
  try { recordWorkflowEvent(event); } catch { /* diagnostics never changes review state */ }
}

function reviewInsideStandalone(draft) {
  return new Promise((resolve, reject) => {
    const reviewId = crypto.randomBytes(16).toString('hex');
    const onAnswer = (message) => {
      if (message?.type !== 'standalone-review-answer' || message.review_id !== reviewId) return;
      process.off('message', onAnswer);
      resolve(message.answer);
    };
    process.on('message', onAnswer);
    try {
      process.send({ type: 'standalone-review-draft', review_id: reviewId, batch_token: activeBatchToken, draft }, (error) => {
        if (!error) return;
        process.off('message', onAnswer);
        reject(error);
      });
    } catch (error) {
      process.off('message', onAnswer);
      reject(error);
    }
  });
}

process.once('message', async (message) => {
  const token = String(message?.batch_token || '');
  if (started || message?.type !== 'start-local-review' || !/^[a-f0-9]{64}$/.test(token)) {
    process.exit(2);
    return;
  }
  started = true;
  activeBatchToken = token;
  clearTimeout(startDeadline);
  const notify = (payload) => new Promise((resolve) => {
    try {
      if (typeof process.send !== 'function') return resolve(false);
      process.send(payload, (error) => resolve(!error));
    } catch { resolve(false); }
  });
  // A send callback in the parent is only dispatch evidence. This fixed,
  // content-free envelope confirms that the loaded review worker accepted the
  // command before the tool reports a successful start.
  await notify({ type: 'local-review-accepted' });
  let exitCode = 1;
  try {
    readBatchProgress(token);
    const result = await reviewDeferredBatch(token, {
      executorPid: process.pid,
      localFinalize: true,
      onReviewLifecycle: lifecycle,
      reviewOptions: { timeoutMs: DETACHED_REVIEW_TIMEOUT_MS },
      ...(message.ui === 'standalone-app' && standaloneChannel
        ? { reviewTextLocally: reviewInsideStandalone } : {})
    });
    if (standaloneChannel && result.ok === false &&
        !['LOCAL_REVIEW_CANCELLED', 'LOCAL_REVIEW_DEFERRED'].includes(result.error)) {
      await notify({ type: 'standalone-review-failed', batch_token: token,
        error_code: typeof result.error === 'string' ? result.error : 'LOCAL_REVIEW_FAILED' });
    }
    // A failing visible export must not discard the completed local review
    // result; the released packages stay pending for the next export replay.
    const visibleExport = terminalVisibleExport(result, () => exportCompletedBatchResults(token));
    const presentedResult = {
      ...result,
      result_exported_count: visibleExport.exported,
      result_export_pending_count: visibleExport.pending,
      result_output_available: visibleExport.available
    };
    const envelope = {
      type: 'local-review-state',
      complete: result.complete === true,
      batch_phase: result.batch_phase,
      batch_total: result.batch_total,
      released: result.released,
      stopped: result.stopped,
      result_grade_counts: result.result_grade_counts,
      result_omission_counts: result.result_omission_counts,
      result_grades_verified: result.result_grades_verified,
      result_exported_count: visibleExport.exported,
      result_export_pending_count: visibleExport.pending,
      result_output_available: visibleExport.available
    };
    const deliberatelyPaused = ['LOCAL_REVIEW_CANCELLED', 'LOCAL_REVIEW_DEFERRED'].includes(result.error);
    if (!deliberatelyPaused && standaloneChannel) {
      await notify(envelope);
      recordWorkflowEvent({ event: 'terminal_state_delegated_to_product_ui', outcome: 'ok',
        phase: presentedResult.batch_phase, item_count: presentedResult.batch_total,
        released_count: presentedResult.released, stopped_count: presentedResult.stopped });
    } else if (!deliberatelyPaused) await presentTerminalEnvelope({
      token,
      envelope,
      reserve: reserveTerminalNotice,
      markPresented: markTerminalNoticePresented,
      release: releaseTerminalNoticeReservation,
      present: () => showBatchStateNoticeConfirmed(presentedResult, { batchToken: token }),
      record: recordWorkflowEvent,
      evidence: {
        event: 'review_terminal_state',
        outcome: result.ok === true && result.complete === true ? 'ok' : 'stopped',
        phase: result.batch_phase,
        item_count: result.batch_total,
        released_count: result.released,
        stopped_count: result.stopped,
        error_code: result.ok === true ? 'NONE' :
          (result.error === 'LOCAL_REVIEW_CANCELLED' || result.error === 'LOCAL_REVIEW_DEFERRED'
            ? 'LOCAL_REVIEW_CANCELLED' : 'LOCAL_REVIEW_FAILED')
      }
    });
    // A deliberate cancel/defer is a handled, safely persisted local outcome,
    // not a crashed worker.  The next explicit continuation can open it again.
    exitCode = result.ok === true || ['LOCAL_REVIEW_CANCELLED', 'LOCAL_REVIEW_DEFERRED'].includes(result.error) ? 0 : 1;
  } catch {
    if (standaloneChannel) await notify({ type: 'standalone-review-failed', batch_token: token,
      error_code: 'LOCAL_REVIEW_FAILED' });
    lifecycle({ event: 'review_terminal_state', outcome: 'stopped', error_code: 'LOCAL_REVIEW_FAILED' });
  } finally {
    releaseLocalBatchExecutor(token, process.pid);
  }
  process.exit(exitCode);
});

process.once('disconnect', () => {
  if (!started) process.exit(2);
});
