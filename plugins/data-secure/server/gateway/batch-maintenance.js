'use strict';

// Batch expiry maintenance is deliberately isolated from the MCP transport.
// This makes the recurring cleanup lifetime explicit, testable and easy to
// stop during a graceful server shutdown. The cleanup implementation itself
// owns the global batch lock and therefore safely yields to active work.
const DEFAULT_BATCH_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

function validInterval(value) {
  return Number.isSafeInteger(value) && value >= 60_000 && value <= 24 * 60 * 60 * 1000;
}

function startBatchMaintenance(cleanup, options = {}) {
  if (typeof cleanup !== 'function') throw new TypeError('batch cleanup must be a function');
  const intervalMs = options.intervalMs ?? DEFAULT_BATCH_CLEANUP_INTERVAL_MS;
  if (!validInterval(intervalMs)) throw new RangeError('batch cleanup interval is outside the safe range');
  const schedule = options.setInterval || setInterval;
  const cancel = options.clearInterval || clearInterval;
  const run = () => {
    // Maintenance is best effort only: cleanup records and preserves failures
    // locally, and a timer must never terminate the MCP process or interfere
    // with an active batch.
    try { cleanup(); } catch { /* fail closed inside the cleanup implementation */ }
  };
  const timer = schedule(run, intervalMs);
  timer?.unref?.();
  let stopped = false;
  return {
    interval_ms: intervalMs,
    stop() {
      if (stopped) return false;
      stopped = true;
      cancel(timer);
      return true;
    }
  };
}

module.exports = { DEFAULT_BATCH_CLEANUP_INTERVAL_MS, validInterval, startBatchMaintenance };
