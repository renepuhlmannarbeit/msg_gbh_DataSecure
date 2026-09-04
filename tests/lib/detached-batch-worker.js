'use strict';

// Test-only equivalent of the detached product worker.  The real child uses
// the operating-system keyring; this fixture installs the deterministic test
// key shared by the parent process so the process-boundary contract can be
// exercised without writing test secrets to the user's credential store.

const fs = require('fs');
const path = require('path');
const { beginBatch, claimLocalBatchExecutor, runLocalBatchExecutor, reserveTerminalNotice,
  markTerminalNoticePresented, releaseTerminalNoticeReservation, _test } = require('../../plugins/data-secure/server/gateway/batch');
const { releaseIntake, RESERVATION_ID_RE } = require('../../plugins/data-secure/server/gateway/batch-intake-reservation');
const { presentTerminalEnvelope } = require('../../plugins/data-secure/server/gateway/worker-terminal-presentation');
const { recordWorkflowEvent } = require('../../plugins/data-secure/server/gateway/workflow-diagnostics');


// The product worker opens a native window when its parent is gone. The test
// double records that decision as a content-free sentinel file instead, so the
// process-boundary protocol can be asserted without any dialog.
// The worker environment is an allowlist (WORKER_ENV_KEYS), so the sentinel
// lives at a fixed name below the forwarded LOCALAPPDATA test root.
const SENTINEL_NAME = 'test-terminal-notice-sentinel.json';
function presentSentinel(envelope) {
  const { type, stage } = envelope;
  fs.writeFileSync(path.join(process.env.LOCALAPPDATA, SENTINEL_NAME),
    JSON.stringify({ type, stage: stage || null, pid: process.pid }), { flag: 'wx' });
}
const parentGraceMs = 1500;

let started = false;
const startDeadline = setTimeout(() => process.exit(2), 30_000);

process.once('message', async (message) => {
  const validToken = /^[a-f0-9]{64}$/u.test(String(message?.batch_token || ''));
  const existing = message?.type === 'start-local-batch';
  const reservationId = String(message?.intake_reservation_id || '');
  const intake = message?.type === 'start-local-intake' && RESERVATION_ID_RE.test(reservationId) &&
    Array.isArray(message?.queue) && message.queue.length > 0;
  if (started || !validToken || (!existing && !intake)) return process.exit(2);
  started = true;
  clearTimeout(startDeadline);
  const notify = (payload) => new Promise((resolve) => {
    try {
      if (typeof process.send !== 'function') return resolve(false);
      process.send(payload, () => resolve(true));
    } catch { resolve(false); }
  });
  // Mirror the product worker: the parent's bounded handoff acknowledgement is
  // this explicit acceptance, not the parent's send() callback.
  await notify({ type: intake ? 'local-intake-accepted' : 'local-batch-accepted' });
  try {
    if (intake) {
      const begun = beginBatch({
        token: message.batch_token,
        expectedCount: message.queue.length,
        profile: message.profile || 'auto',
        queue: message.queue,
        confirmStart: () => true
      });
      if (begun.ok !== true) { releaseIntake(reservationId); return process.exit(1); }
      if (!releaseIntake(reservationId)) throw new Error('INTAKE_RESERVATION_RELEASE_FAILED');
      await notify({ type: 'local-intake-checkpoint-created' });
      if (claimLocalBatchExecutor(message.batch_token, process.pid).ok !== true) return process.exit(1);
      await notify({ type: 'local-intake-processing-started' });
    }
    const completed = await runLocalBatchExecutor(message.batch_token, { executorPid: process.pid });
    const envelope = {
      type: intake ? 'local-intake-state' : 'local-batch-state',
      complete: completed.complete === true,
      batch_phase: completed.batch_phase,
      batch_total: completed.batch_total,
      released: completed.released,
      stopped: completed.stopped,
      result_grade_counts: completed.result_grade_counts,
      result_omission_counts: completed.result_omission_counts,
      result_grades_verified: completed.result_grades_verified
    };
    await presentTerminalEnvelope({
      token: message.batch_token,
      envelope,
      reserve: reserveTerminalNotice,
      markPresented: markTerminalNoticePresented,
      release: releaseTerminalNoticeReservation,
      present: presentSentinel,
      record: recordWorkflowEvent,
      graceMs: parentGraceMs,
      evidence: {
        event: 'intake_terminal_state', outcome: envelope.complete ? 'ok' : 'progress',
        phase: envelope.batch_phase, item_count: envelope.batch_total,
        released_count: envelope.released, stopped_count: envelope.stopped
      }
    });
    process.exit(0);
  } catch {
    if (intake) releaseIntake(reservationId);
    process.exit(1);
  }
});

process.once('disconnect', () => { if (!started) process.exit(2); });
