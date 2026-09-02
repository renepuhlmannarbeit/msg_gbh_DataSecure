'use strict';

const { beginBatch, claimLocalBatchExecutor, runLocalBatchExecutor, exportCompletedBatchResults } = require('./batch');
const { releaseIntake, RESERVATION_ID_RE } = require('./batch-intake-reservation');
const { terminalVisibleExport } = require('./result-export');

let started = false;
const startDeadline = setTimeout(() => process.exit(2), 30_000);

process.once('message', async (message) => {
  const validToken = /^[a-f0-9]{64}$/.test(String(message?.batch_token || ''));
  const isExistingBatch = message?.type === 'start-local-batch';
  const reservationId = String(message?.intake_reservation_id || '');
  const isNewIntake = message?.type === 'start-local-intake' && RESERVATION_ID_RE.test(reservationId) &&
    Array.isArray(message?.queue) && message.queue.length > 0;
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
  // The parent reports a confirmed handoff to Cowork only after this explicit,
  // content-free acceptance. Node's send() callback in the parent proves merely
  // that the message left the parent; this envelope proves that a live worker
  // with loaded gateway modules holds the private intake message. It carries no
  // token, path, name or count and precedes every durable or expensive step.
  await notify({ type: 'local-intake-accepted' });
  try {
    if (isNewIntake) {
      const begun = beginBatch({
        token: message.batch_token,
        expectedCount: message.queue.length,
        profile: message.profile || 'auto',
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
      if (!releaseIntake(reservationId)) throw new Error('INTAKE_RESERVATION_RELEASE_FAILED');
      await notify({ type: 'local-intake-checkpoint-created' });
      const claimed = claimLocalBatchExecutor(message.batch_token, process.pid);
      if (claimed.ok !== true) {
        process.exit(1);
        return;
      }
      await notify({ type: 'local-intake-processing-started' });
    }
    const completed = await runLocalBatchExecutor(message.batch_token, { executorPid: process.pid });
    // The durable processing result is authoritative. A failing visible export
    // stays pending for the next start or folder change; it never converts the
    // completed batch into the "stopped" failure envelope below.
    const visibleExport = terminalVisibleExport(completed, () => exportCompletedBatchResults(message.batch_token));
    // Every automatic run ends with exactly one bounded local state envelope,
    // including non-terminal rest states such as review, mapping repair or an
    // explicit resume. No token, source identifier or document content crosses
    // this private presentation channel.
    await notify({
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
    });
    process.exit(0);
  } catch {
    if (isNewIntake) releaseIntake(reservationId);
    await notify({
      type: isNewIntake ? 'local-intake-stopped' : 'local-batch-stopped',
      stage: checkpointCreated || isExistingBatch ? 'after_checkpoint' : 'before_checkpoint'
    });
    // No document-derived error reaches stdout/stderr. The durable batch
    // checkpoint is the sole recovery source for the next explicit action.
    process.exit(1);
  }
});

process.once('disconnect', () => {
  if (!started) process.exit(2);
});
