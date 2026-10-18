'use strict';

const { ownErrorCode } = require('./batch-execution-diagnostic');
const { performance } = require('node:perf_hooks');

const LEASE_FINISH_BACKOFF_MS = Object.freeze([10, 25, 50, 100, 200, 400, 800, 1000, 1000, 1000]);
const LEASE_FINISH_MAX_WAIT_MS = 5000;
const failure = code => Object.assign(new Error(code), { code });
function requireSynchronous(fn) {
  if (typeof fn !== 'function' || /^(?:Async|Generator)/u.test(fn.constructor?.name || ''))
    throw failure('OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
}
function rejectThenable(value) {
  if (value && typeof value.then === 'function') throw failure('OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
}

// Internal runner composition only. This is not another lease/epoch issuer.
// Both logical transactions complete synchronously, one after the other, under
// the same root kernel capability. Only failure to enter that outer callback
// can authorize a bounded retry; a committed action is never replayed.
function createBatchExecutorLeaseFinish(deps) {
  const { dataRoot, withOwnershipControl, releaseLocalBatchExecutor, finishZeroDayOperation } = deps;
  for (const fn of [dataRoot, withOwnershipControl, releaseLocalBatchExecutor, finishZeroDayOperation]) requireSynchronous(fn);
  const delay = deps.delay || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const monotonicNow = deps.monotonicNow || (() => performance.now());
  requireSynchronous(monotonicNow);
  if (typeof delay !== 'function') throw new TypeError('LEASE_FINISH_DELAY_REQUIRED');

  return async function releaseAndFinishLocalBatchExecutor(token, pid) {
    // Resolve once, outside the catch that recognizes a kernel-acquire Busy.
    const root = dataRoot();
    const deadline = monotonicNow() + LEASE_FINISH_MAX_WAIT_MS;
    let acquireBusy;
    for (let attempt = 0; ; attempt++) {
      // A late timer never authorizes another acquisition after the deadline.
      // This bounds new attempts/wait requests, not OS scheduling or action time.
      if (attempt > 0 && monotonicNow() >= deadline) throw acquireBusy;
      let entered = false, completed = false;
      try {
        const result = withOwnershipControl(root, guard => {
          entered = true;
          guard.assertHeld();
          const released = releaseLocalBatchExecutor(token, pid);
          rejectThenable(released);
          if (released !== true) return false;
          const finished = finishZeroDayOperation(token);
          rejectThenable(finished);
          guard.assertHeld();
          completed = true;
          return true;
        });
        rejectThenable(result);
        // Neither a missing lease nor a changed wrapper result is release proof.
        return completed && result === true;
      } catch (error) {
        if (!entered && ownErrorCode(error) === 'OWNERSHIP_GUARD_BUSY' && attempt < LEASE_FINISH_BACKOFF_MS.length) {
          const remaining = deadline - monotonicNow();
          if (!(remaining > 0)) throw error;
          acquireBusy = error;
          // withOwnershipControl has already unwound/closed. No guard or logical
          // acquisition is retained across this asynchronous wait.
          await delay(Math.min(LEASE_FINISH_BACKOFF_MS[attempt], remaining));
          continue;
        }
        throw error;
      }
    }
  };
}

module.exports = { LEASE_FINISH_BACKOFF_MS, LEASE_FINISH_MAX_WAIT_MS, createBatchExecutorLeaseFinish };
