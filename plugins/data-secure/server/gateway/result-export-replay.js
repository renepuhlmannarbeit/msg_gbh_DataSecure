'use strict';

const path = require('path');
const { Worker } = require('worker_threads');

const REPLAY_TIMEOUT_MS = 60_000;
const EMPTY_FAILURE = Object.freeze({ exported: 0, pending: 0, failures: 1 });

function validSummary(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === 'exported,failures,pending' &&
    [value.exported, value.pending, value.failures]
      .every((count) => Number.isSafeInteger(count) && count >= 0);
}

// Scheduling itself is deliberately synchronous and tiny; all replay I/O,
// copying and hashing happens in a worker thread only after the MCP module has
// installed its protocol handlers. `settled` never rejects, so neither a bad
// record nor worker startup/exit can become an unhandled rejection.
function schedulePendingResultExportReplay(options = {}) {
  const defer = options.defer || setImmediate;
  const WorkerType = options.Worker || Worker;
  const workerFile = options.workerFile || path.join(__dirname, 'result-export-replay-worker.js');
  const timeoutMs = Math.max(10, Math.min(REPLAY_TIMEOUT_MS, Number(options.timeoutMs) || REPLAY_TIMEOUT_MS));
  let worker = null;
  let finished = false;
  let reported = null;
  let failed = false;
  let finish;
  const settled = new Promise((resolve) => { finish = resolve; });
  const complete = (summary = EMPTY_FAILURE) => {
    if (finished) return;
    finished = true;
    finish(validSummary(summary) ? summary : EMPTY_FAILURE);
  };
  defer(() => {
    if (finished) return;
    try {
      worker = new WorkerType(workerFile);
      worker.unref?.();
      const timer = setTimeout(() => {
        failed = true;
        try {
          const termination = worker?.terminate?.();
          if (termination && typeof termination.then === 'function') {
            Promise.resolve(termination).catch(() => {}).finally(() => complete());
          } else complete();
        } catch { complete(); }
      }, timeoutMs);
      timer.unref?.();
      worker.once('message', (summary) => { reported = validSummary(summary) ? summary : null; });
      worker.once('error', () => { failed = true; });
      // Wait for process termination, not merely its final message. This is the
      // concurrency boundary used by an immediate user-initiated folder change.
      worker.once('exit', (code) => { clearTimeout(timer); complete(!failed && code === 0 ? reported : EMPTY_FAILURE); });
    } catch {
      complete();
    }
  });
  return Object.freeze({
    settled,
    cancel() {
      failed = true;
      try {
        const termination = worker?.terminate?.();
        if (termination && typeof termination.catch === 'function') termination.catch(() => {});
      } catch {}
      complete();
    }
  });
}

module.exports = { schedulePendingResultExportReplay, REPLAY_TIMEOUT_MS };
