'use strict';

// Detached local batch executor that crashes abruptly in the middle of one
// document, so the recovery contract of BL-011.7 can be proven against a real
// operating-system process instead of an in-process simulation.
//
// This is tracked test source, not a generated artefact: it therefore lives in
// tests/lib/ and never in tests/fixtures/, which is excluded by .gitignore.
// The product never imports it; the only entry point is fork() from
// tests/test-batch-session.js.
//
// Contract with the caller:
//   - started only by fork() with stdio ['ignore', 'ignore', 'ignore', 'ipc'];
//   - the batch token arrives exclusively over the private IPC message
//     { type: 'run-crash-test', batch_token } - never over argv or the
//     environment;
//   - DATASECURE_TEST_CRASH_AT names the document of this run, counted from 1,
//     during which the process dies;
//   - the death is process.exit(17), the caller's crash sentinel. Nothing is
//     cleaned up, so exactly one item stays 'processing' and the lease keeps
//     pointing at a dead pid.

const fs = require('fs');
const { claimLocalBatchExecutor, runLocalBatchExecutor } = require('../../plugins/data-secure/server/gateway/batch');

const TOKEN_RE = /^[a-f0-9]{64}$/u;

let started = false;
// Mirror the production worker: never linger when the private start message
// does not arrive.
const startDeadline = setTimeout(() => process.exit(2), 30_000);

// Deliberately the same conversion stub the suite passes to its in-process
// runs. A crash run and a normal run must differ only in the crash, never in
// the parser.
function convertDocumentStub(source) {
  return Promise.resolve({
    markdown: fs.readFileSync(source, 'utf8'),
    attachments: [],
    warnings: [],
    unreviewedVisualCount: 0,
    requiresExplicitProfile: false
  });
}

process.once('message', async (message) => {
  const crashAt = Number(process.env.DATASECURE_TEST_CRASH_AT);
  if (started || message?.type !== 'run-crash-test' || !TOKEN_RE.test(String(message?.batch_token || '')) ||
      !Number.isSafeInteger(crashAt) || crashAt < 1) {
    process.exit(2);
    return;
  }
  started = true;
  clearTimeout(startDeadline);
  try {
    // The caller only forks; this worker takes the lease itself, exactly as the
    // production intake worker does for a freshly created checkpoint.
    if (claimLocalBatchExecutor(message.batch_token, process.pid).ok !== true) {
      process.exit(1);
      return;
    }
    let document = 0;
    await runLocalBatchExecutor(message.batch_token, {
      executorPid: process.pid,
      convertDocument: (source) => {
        document++;
        // The item is already durably marked 'processing' before conversion
        // starts, so dying here publishes nothing and leaves precisely one
        // interrupted item behind.
        if (document === crashAt) process.exit(17);
        return convertDocumentStub(source);
      }
    });
    // Reaching this point means the requested crash never happened; the caller
    // asserts on exit code 17 and fails.
    process.exit(0);
  } catch {
    process.exit(1);
  }
});

process.once('disconnect', () => {
  if (!started) process.exit(2);
});
