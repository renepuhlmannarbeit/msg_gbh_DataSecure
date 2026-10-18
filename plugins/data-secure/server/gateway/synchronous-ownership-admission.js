'use strict';

// Only failure BEFORE the actual native-root callback entered admits a wait.
// The synchronous action, its logical acquisition, release and native close
// are never replayed, including when one of them throws the raw Busy code.
const { ownErrorCode } = require('./batch-execution-diagnostic');
const BACKOFF_MS = Object.freeze([10, 25, 50, 100, 200, 400, 800, 1000, 1000, 1000]);
const MAX_WAIT_MS = 5000;
async function admitSynchronousOwnership(controlled, action, options = {}) {
  if (typeof controlled !== 'function' || typeof action !== 'function' ||
      /^(?:Async|Generator)/u.test(action.constructor?.name || ''))
    throw Object.assign(new Error('OWNERSHIP_GUARD_ASYNC_FORBIDDEN'), { code: 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN' });
  const now = options.monotonicNow || (() => performance.now());
  const delay = options.delay || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const deadline = now() + MAX_WAIT_MS;
  for (let attempt = 0; ; attempt++) {
    let entered = false;
    try {
      const result = controlled(guard => {
        entered = true;
        guard.assertHeld();
        const value = action(guard);
        if (value && typeof value.then === 'function')
          throw Object.assign(new Error('OWNERSHIP_GUARD_ASYNC_FORBIDDEN'), { code: 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN' });
        guard.assertHeld();
        return value;
      });
      if (!entered) throw Object.assign(new Error('OWNERSHIP_GUARD_UNCONFIRMED'), { code: 'OWNERSHIP_GUARD_UNCONFIRMED' });
      if (result && typeof result.then === 'function')
        throw Object.assign(new Error('OWNERSHIP_GUARD_ASYNC_FORBIDDEN'), { code: 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN' });
      return result;
    } catch (error) {
      const remaining = deadline - now();
      if (entered || ownErrorCode(error) !== 'OWNERSHIP_GUARD_BUSY' ||
          attempt >= BACKOFF_MS.length || remaining <= 0) throw error;
      await delay(Math.min(BACKOFF_MS[attempt], remaining));
      if (now() >= deadline) throw error;
    }
  }
}
module.exports = { admitSynchronousOwnership };
