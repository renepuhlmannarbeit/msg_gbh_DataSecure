'use strict';

const { runLocalBatchExecutor } = require('./batch');

let started = false;
const startDeadline = setTimeout(() => process.exit(2), 30_000);

process.once('message', async (message) => {
  if (started || message?.type !== 'start-local-batch' || !/^[a-f0-9]{64}$/.test(String(message.batch_token || ''))) {
    process.exit(2);
    return;
  }
  started = true;
  clearTimeout(startDeadline);
  try {
    await runLocalBatchExecutor(message.batch_token, { executorPid: process.pid });
    process.exit(0);
  } catch {
    // No document-derived error reaches stdout/stderr. The durable batch
    // checkpoint is the sole recovery source for the next explicit action.
    process.exit(1);
  }
});

process.once('disconnect', () => {
  if (!started) process.exit(2);
});
