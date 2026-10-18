'use strict';

const { performance } = require('node:perf_hooks');
const { ownErrorCode } = require('./batch-execution-diagnostic');
const BACKOFF_MS = Object.freeze([10, 25, 50, 100, 200, 400, 800, 1000, 1000, 1000]);
const MAX_WAIT_MS = 5000;
const failure = code => Object.assign(Error(code), { code });
function synchronous(fn) {
  if (typeof fn !== 'function' || /^(?:Async|Generator)/u.test(fn.constructor?.name || ''))
    throw failure('OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
}

// Admit one logical processing owner. The document/maintenance action is NOT a
// callback here and can never be retried by this helper. Success stays sync;
// only exact pre-callback kernel contention returns an asynchronous wait.
function createBatchProcessingAdmission(deps) {
  const { dataRoot, withOwnershipControl, acquireActiveLock } = deps;
  const now = deps.monotonicNow || (() => performance.now());
  const delay = deps.delay || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  for (const fn of [dataRoot, withOwnershipControl, acquireActiveLock, now]) synchronous(fn);
  if (typeof delay !== 'function') throw new TypeError('PROCESSING_ADMISSION_DELAY_REQUIRED');
  return function acquireProcessingOwner(token) {
    const root = dataRoot(), deadline = now() + MAX_WAIT_MS;
    function attempt() {
      let entered = false, acquired = false;
      try {
        const result = withOwnershipControl(root, guard => {
          entered = true; guard.assertHeld();
          const outcome = acquireActiveLock(token);
          if (outcome && typeof outcome.then === 'function') throw failure('OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
          if (outcome !== true) throw failure('STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED');
          guard.assertHeld(); acquired = true; return true;
        });
        if (result && typeof result.then === 'function') throw failure('OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
        if (!acquired || result !== true) throw failure('STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED');
        return { ok: true };
      } catch (error) { return { error, retry: !entered && ownErrorCode(error) === 'OWNERSHIP_GUARD_BUSY' }; }
    }
    const first = attempt();
    if (first.ok) return true;
    if (!first.retry) throw first.error;
    return (async () => {
      let previous = first.error;
      for (const milliseconds of BACKOFF_MS) {
        const remaining = deadline - now();
        if (!(remaining > 0)) throw previous;
        await delay(Math.min(milliseconds, remaining)); // No held native guard.
        if (now() >= deadline) throw previous;
        const next = attempt();
        if (next.ok) return true;
        if (!next.retry) throw next.error;
        previous = next.error;
      }
      throw previous;
    })();
  };
}
module.exports = { createBatchProcessingAdmission, BACKOFF_MS, MAX_WAIT_MS };
