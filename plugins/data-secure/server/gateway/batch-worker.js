'use strict';

const {
  beginBatch,
  claimLocalBatchExecutor,
  releaseLocalBatchExecutor,
  runLocalBatchExecutor,
  reviewDeferredBatch,
  readBatchProgress,
  readBatchProcessingMode,
  exportCompletedBatchResults,
  reserveTerminalNotice,
  markTerminalNoticePresented,
  releaseTerminalNoticeReservation
} = require('./batch');
const { releaseIntake, RESERVATION_ID_RE } = require('./batch-intake-reservation');
const { terminalVisibleExport } = require('./result-export');
const { presentTerminalEnvelope } = require('./worker-terminal-presentation');
const { showBatchStateNoticeConfirmed, showLocalIntakeNoticeConfirmed } = require('../companion/completion-summary');
const { recordWorkflowEvent } = require('./workflow-diagnostics');
const { continueIntoLocalReview } = require('./automatic-local-review');
const { validateBatchQueueEnvelope, validateBatchMessagePurpose, LOCAL_QUEUE_SCHEMA_INVALID, PURPOSE_ERROR_CODES } = require('./batch-queue-envelope');
const { MODES } = require('../core/processing-mode');

let started = false;
const standaloneChannel = process.env.DATASECURE_PRODUCT_CHANNEL === 'standalone';
const startDeadline = setTimeout(() => process.exit(2), 30_000);

process.once('message', async (message) => {
  const validToken = /^[a-f0-9]{64}$/.test(String(message?.batch_token || ''));
  const isExistingBatch = ['start-local-batch', 'start-local-markdown-batch'].includes(message?.type);
  const reservationId = String(message?.intake_reservation_id || '');
  const isNewIntake = ['start-local-intake', 'start-local-markdown-intake'].includes(message?.type) && RESERVATION_ID_RE.test(reservationId);
  if (started || !validToken || (!isExistingBatch && !isNewIntake)) {
    process.exit(2);
    return;
  }
  started = true;
  clearTimeout(startDeadline);
  let checkpointCreated = false;
  const notify = (payload) => new Promise((resolve) => {
    try {
      if (typeof process.send !== 'function') return resolve(false);
      process.send(payload, () => resolve(true));
    } catch {
      resolve(false); // local parent may already be gone
    }
  });
  if (isNewIntake) {
    try { validateBatchQueueEnvelope(message.queue); }
    catch {
      await notify({ type: 'local-intake-rejected', error_code: LOCAL_QUEUE_SCHEMA_INVALID });
      releaseIntake(reservationId);
      process.exit(2);
      return;
    }
  }
  let processingMode;
  try {
    const existingMode = isExistingBatch ? readBatchProcessingMode(message.batch_token) : undefined;
    processingMode = validateBatchMessagePurpose(message, standaloneChannel ? 'standalone' : 'plugin', existingMode);
  } catch (error) {
    await notify({ type: isNewIntake ? 'local-intake-rejected' : 'local-batch-rejected',
      error_code: PURPOSE_ERROR_CODES.includes(error?.code) ? error.code : 'PROCESSING_MODE_INVALID' });
    if (isNewIntake) releaseIntake(reservationId);
    process.exit(2);
    return;
  }
  // The parent reports a confirmed handoff to Cowork only after this explicit,
  // content-free acceptance. Node's send() callback in the parent proves merely
  // that the message left the parent; this envelope proves that a live worker
  // with loaded gateway modules holds the private intake message. It carries no
  // token, path, name or count and precedes every durable or expensive step.
  await notify({ type: isNewIntake ? 'local-intake-accepted' : 'local-batch-accepted' });
  try {
    if (isNewIntake) {
      const begun = beginBatch({
        token: message.batch_token,
        expectedCount: message.queue.length,
        profile: message.profile || 'auto',
        processingMode,
        queue: message.queue,
        // The operating-system picker was the only start confirmation.
        confirmStart: () => true
      });
      if (begun.ok !== true) {
        releaseIntake(reservationId);
        process.exit(1);
        return;
      }
      checkpointCreated = true;
      if (readBatchProcessingMode(message.batch_token) !== processingMode) throw new Error('BATCH_PROCESSING_MODE_CHANGED');
      if (!releaseIntake(reservationId)) throw new Error('INTAKE_RESERVATION_RELEASE_FAILED');
      await notify({ type: 'local-intake-checkpoint-created' });
      const claimed = claimLocalBatchExecutor(message.batch_token, process.pid);
      if (claimed.ok !== true) {
        process.exit(1);
        return;
      }
      await notify({ type: 'local-intake-processing-started' });
    }
    let completed = await runLocalBatchExecutor(message.batch_token, { executorPid: process.pid });
    // The picker already confirmed this local run. If analysis found genuine
    // ambiguities, open the existing local batch reviewer now instead of
    // returning to Cowork for another tool call. A defer/cancel/error remains
    // an `awaiting_local_review` checkpoint and is therefore safely resumable.
    const reviewed = processingMode === MODES.MARKDOWN ? { progress: completed, attempted: false } : await continueIntoLocalReview(message.batch_token, completed, {
      executorPid: process.pid,
      claimLocalBatchExecutor,
      releaseLocalBatchExecutor,
      reviewDeferredBatch,
      readBatchProgress,
      onReviewLifecycle: recordWorkflowEvent
    });
    completed = reviewed.progress;
    if (reviewed.attempted === true &&
        ['LOCAL_REVIEW_CANCELLED', 'LOCAL_REVIEW_DEFERRED'].includes(completed?.error)) {
      // The user already made the local "close/later" choice. Do not answer
      // that with another dialog. Tell a still-live MCP parent only to suppress
      // its exit fallback; a later explicit continuation remains possible.
      await notify({ type: 'local-review-paused' });
      process.exit(0);
      return;
    }
    // The durable processing result is authoritative. A failing visible export
    // stays pending for the next start or folder change; it never converts the
    // completed batch into the "stopped" failure envelope below.
    const visibleExport = terminalVisibleExport(completed, () => exportCompletedBatchResults(message.batch_token));
    // Every automatic run ends with exactly one bounded local state envelope,
    // including non-terminal rest states such as review, mapping repair or an
    // explicit resume. No token, source identifier or document content crosses
    // this private presentation channel. The parent presents the notice while
    // it still listens; a parent ended by the Cowork host leaves that to us.
    const envelope = {
      type: isNewIntake ? 'local-intake-state' : 'local-batch-state',
      complete: completed.complete === true,
      batch_phase: completed.batch_phase,
      batch_total: completed.batch_total,
      released: completed.released,
      stopped: completed.stopped,
      result_grade_counts: completed.result_grade_counts,
      result_omission_counts: completed.result_omission_counts,
      result_grades_verified: completed.result_grades_verified,
      result_exported_count: visibleExport.exported,
      result_export_pending_count: visibleExport.pending,
      result_output_available: visibleExport.available
    };
    const { type, ...progress } = envelope;
    const terminalOptions = {
      token: message.batch_token,
      envelope,
      reserve: reserveTerminalNotice,
      markPresented: markTerminalNoticePresented,
      release: releaseTerminalNoticeReservation,
      present: () => showBatchStateNoticeConfirmed(progress, { batchToken: message.batch_token }),
      record: recordWorkflowEvent,
      evidence: {
        event: 'intake_terminal_state', outcome: completed.ok === false ? 'stopped' : (envelope.complete ? 'ok' : 'progress'),
        ...(completed.error ? { error_code: completed.error } : {}),
        phase: envelope.batch_phase, item_count: envelope.batch_total,
        released_count: envelope.released, stopped_count: envelope.stopped
      }
    };
    if (standaloneChannel) {
      await notify(envelope);
      recordWorkflowEvent({ ...terminalOptions.evidence, event: 'terminal_state_delegated_to_product_ui' });
    } else {
      await presentTerminalEnvelope(terminalOptions);
    }
    process.exit(0);
  } catch {
    if (isNewIntake) releaseIntake(reservationId);
    const stage = checkpointCreated || isExistingBatch ? 'after_checkpoint' : 'before_checkpoint';
    try {
      const terminalOptions = {
        token: message.batch_token,
        envelope: { type: isNewIntake ? 'local-intake-stopped' : 'local-batch-stopped', stage },
        // Before the checkpoint no journal exists to arbitrate; a live parent
        // acknowledges instead, an absent parent leaves the notice to us.
        reserve: stage === 'after_checkpoint' ? reserveTerminalNotice : () => ({ ok: true, state: 'unavailable', reservation_id: null }),
        markPresented: markTerminalNoticePresented,
        release: releaseTerminalNoticeReservation,
        present: () => showLocalIntakeNoticeConfirmed(stage),
        record: recordWorkflowEvent,
        evidence: { event: 'intake_terminal_state', outcome: 'stopped', error_code: 'LOCAL_WORKER_EXITED' }
      };
      if (standaloneChannel) {
        await notify(terminalOptions.envelope);
        recordWorkflowEvent({ ...terminalOptions.evidence, event: 'terminal_state_delegated_to_product_ui' });
      } else {
        await presentTerminalEnvelope(terminalOptions);
      }
    } catch { /* presentation never changes the durable checkpoint */ }
    // No document-derived error reaches stdout/stderr. The durable batch
    // checkpoint is the sole recovery source for the next explicit action.
    process.exit(1);
  }
});

process.once('disconnect', () => {
  if (!started) process.exit(2);
});
