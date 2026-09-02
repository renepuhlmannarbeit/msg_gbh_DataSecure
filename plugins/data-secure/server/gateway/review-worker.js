'use strict';

// The local human review must outlive the short Cowork tool call.  This worker
// owns reconstruction, the native review window and local publication; its
// parent receives no document content, file identity, capability or token in a
// response to Claude.
const {
  reviewDeferredBatch,
  releaseLocalBatchExecutor,
  readBatchProgress,
  exportCompletedBatchResults
} = require('./batch');
const { showBatchStateNotice } = require('../companion/completion-summary');
const { recordWorkflowEvent } = require('./workflow-diagnostics');
const { DETACHED_REVIEW_TIMEOUT_MS } = require('../companion/review-timeouts');

let started = false;
const startDeadline = setTimeout(() => process.exit(2), 30_000);
// The whole point of running detached is that a human decision can outlive a
// Cowork tool call. companion/text-review.js still defaults its native-dialog
// spawnSync to 5 minutes for the synchronous MCP path; this worker is not
// bound by that per-request deadline, so it has no human-decision timeout.

function lifecycle(event) {
  try { recordWorkflowEvent(event); } catch { /* diagnostics never changes review state */ }
}

process.once('message', async (message) => {
  const token = String(message?.batch_token || '');
  if (started || message?.type !== 'start-local-review' || !/^[a-f0-9]{64}$/.test(token)) {
    process.exit(2);
    return;
  }
  started = true;
  clearTimeout(startDeadline);
  let exitCode = 1;
  try {
    const before = readBatchProgress(token);
    const result = await reviewDeferredBatch(token, {
      executorPid: process.pid,
      localFinalize: true,
      onReviewLifecycle: lifecycle,
      reviewOptions: { timeoutMs: DETACHED_REVIEW_TIMEOUT_MS }
    });
    const visibleExport = result.complete === true
      ? exportCompletedBatchResults(token)
      : { exported: 0, pending: 0, available: false };
    const presentedResult = {
      ...result,
      result_exported_count: visibleExport.exported,
      result_export_pending_count: visibleExport.pending,
      result_output_available: visibleExport.available
    };
    lifecycle({
      event: 'review_terminal_state',
      outcome: result.ok === true && result.complete === true ? 'ok' : 'stopped',
      phase: result.batch_phase,
      item_count: result.batch_total,
      released_count: result.released,
      stopped_count: result.stopped,
      error_code: result.ok === true ? 'NONE' :
        (result.error === 'LOCAL_REVIEW_CANCELLED' || result.error === 'LOCAL_REVIEW_DEFERRED'
          ? 'LOCAL_REVIEW_CANCELLED' : 'LOCAL_REVIEW_FAILED')
    });
    try {
      lifecycle({ event: 'completion_notice_started', outcome: 'progress', item_count: before.batch_total });
      showBatchStateNotice(presentedResult);
      lifecycle({ event: 'completion_notice_finished', outcome: 'ok', item_count: before.batch_total });
    } catch {
      lifecycle({ event: 'completion_notice_failed', outcome: 'stopped', item_count: before.batch_total,
        error_code: 'LOCAL_NOTICE_FAILED' });
    }
    // A deliberate cancel/defer is a handled, safely persisted local outcome,
    // not a crashed worker.  The next explicit continuation can open it again.
    exitCode = result.ok === true || ['LOCAL_REVIEW_CANCELLED', 'LOCAL_REVIEW_DEFERRED'].includes(result.error) ? 0 : 1;
  } catch {
    lifecycle({ event: 'review_terminal_state', outcome: 'stopped', error_code: 'LOCAL_REVIEW_FAILED' });
  } finally {
    releaseLocalBatchExecutor(token, process.pid);
  }
  process.exit(exitCode);
});

process.once('disconnect', () => {
  if (!started) process.exit(2);
});
