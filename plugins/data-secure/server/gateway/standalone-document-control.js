'use strict';

// Standalone document decisions and export preparation share one control
// owner. Synchronous mutations keep the kernel guard through their exact own
// release. Native export awaits retain only logical ownership, never a kernel
// guard whose lifetime would otherwise cross the asynchronous boundary.
const { ACTIVE_LOCK_BUSY } = require('./batch-active-lock');
const { ownErrorCode } = require('./batch-execution-diagnostic');
// The caller waits through these pauses, about two seconds in total. The
// desktop sidecar serves its requests one after another and a status lookup
// waits at most five seconds for it, so the wait stays well below that.
const RELEASE_BACKOFF_MS = Object.freeze([10, 25, 50, 100, ...Array(18).fill(100)]);
// Afterwards the caller gets its refusal and the SAME capability keeps asking,
// for at most ten further minutes. An ordinary Busy must not leave the shared
// record blocking every run until the desktop restarts.
const RELEASE_RECOVERY_MS = 250, RELEASE_RECOVERY_ATTEMPTS = 2400;
const fail = code => Object.assign(new Error(code), { code });
const contention = error => ownErrorCode(error) === 'OWNERSHIP_GUARD_BUSY' ||
  typeof ACTIVE_LOCK_BUSY === 'string' && ownErrorCode(error) === ACTIVE_LOCK_BUSY;
const nativeRefusal = error => /^(?:OWNERSHIP_GUARD_|STANDALONE_OWNERSHIP_)/u.test(ownErrorCode(error));

function withSynchronousDocumentControl(gate, batchId, action) {
  // There is no separated native fallback. A missing composition must fail
  // before running the action, rather than reopening the release-Busy window.
  if (typeof gate?.withSynchronousActiveLock !== 'function') throw fail('OWNERSHIP_GUARD_UNAVAILABLE');
  if (typeof action !== 'function' || /^(?:Async|Generator)/u.test(action.constructor?.name || ''))
    throw fail('OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
  let entered = false;
  try {
    return gate.withSynchronousActiveLock(batchId, () => { entered = true; return action(); });
  } catch (error) {
    // Only failed admission can be contention. An action/close refusal must
    // retain its identity, even if its code happens to be a Busy code.
    if (!entered && contention(error)) throw fail('STANDALONE_BUSY');
    throw error;
  }
}

// Compatibility lifetime for asynchronous native publication and thenables.
// Existing synchronous support callers retain their non-Promise return type.
function withDocumentControl(gate, batchId, action, options = {}) {
  const epochWired = typeof gate?.captureOwnedEpoch === 'function' && typeof gate?.releaseOwnedEpoch === 'function';
  // Production always supplies the actual epoch API. A legacy test adapter
  // requires an explicit opt-in and can NEVER replace native desktop wiring.
  if (!epochWired && !(options.sourceAdapter === true && process.env.DATASECURE_NATIVE_EXPORT_CHANNEL !== '1'))
    throw fail('OWNERSHIP_GUARD_UNAVAILABLE');
  const delay = options.delay || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  // Recovery never keeps the process alive and never delays its exit.
  const recoveryDelay = options.delay || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds).unref?.()));
  try { gate.acquireActiveLock(batchId); }
  catch (error) { if (contention(error)) throw fail('STANDALONE_BUSY'); throw error; }
  // A capture failure cannot authorize a token/PID-based fallback cleanup or
  // run the action. Keep an unconfirmed acquisition blocking for recovery.
  const epoch = epochWired ? gate.captureOwnedEpoch(batchId) : undefined;
  if (epochWired && (!epoch || !['object', 'function'].includes(typeof epoch)))
    throw fail('BATCH_OWNERSHIP_CHANGED');
  const releaseEpoch = () => epochWired ? gate.releaseOwnedEpoch(epoch) : gate.releaseActiveLock(batchId);
  const releaseFailure = error => epochWired || nativeRefusal(error) ? error : fail('DOCUMENT_REVIEW_INVALID');
  let released = false;
  function recoverRelease() {
    // Only raw native Busy reaches this point: the guard was occupied, nothing
    // was decided about the record. It stays blocking and is never
    // force-deleted; the exact pre-action capability asks again outside any
    // kernel lifetime. True, false, a hard refusal, a lost epoch or a failed
    // timer end the attempts, exactly as they end the caller's own wait.
    (async () => {
      for (let attempt = 0; attempt < RELEASE_RECOVERY_ATTEMPTS; attempt++) {
        await recoveryDelay(RELEASE_RECOVERY_MS);
        try { releaseEpoch(); return; }
        catch (error) { if (ownErrorCode(error) !== 'OWNERSHIP_GUARD_BUSY') return; }
      }
    })().catch(() => {});
  }
  function release(hasPrimaryError) {
    if (released) return;
    released = true;
    try {
      if (releaseEpoch() !== true) throw fail('DOCUMENT_REVIEW_INVALID');
    } catch (error) {
      // A synchronous caller cannot wait. It still receives its refusal now.
      if (epochWired && ownErrorCode(error) === 'OWNERSHIP_GUARD_BUSY') queueMicrotask(recoverRelease);
      // A cleanup failure must not replace the actual processing failure.
      // Any other failed ownership release remains blocking; it is not
      // force-deleted.
      if (!hasPrimaryError) throw releaseFailure(error);
    }
  }
  async function releaseAsync(hasPrimaryError) {
    if (released) return;
    released = true;
    for (let attempt = 0; ; attempt++) {
      try {
        if (releaseEpoch() !== true) throw fail('DOCUMENT_REVIEW_INVALID');
        return;
      } catch (error) {
        // Each call has already left its kernel lifetime before any await.
        // Retry only raw native Busy, with the SAME pre-action capability.
        // False, mapped/logical Busy, close, unsafe and epoch loss are final.
        if (epochWired && ownErrorCode(error) === 'OWNERSHIP_GUARD_BUSY') {
          if (attempt < RELEASE_BACKOFF_MS.length) {
            try { await delay(RELEASE_BACKOFF_MS[attempt]); continue; }
            catch (delayError) { if (!hasPrimaryError) throw releaseFailure(delayError); return; }
          }
          recoverRelease();
        }
        if (!hasPrimaryError) throw releaseFailure(error);
        return;
      }
    }
  }
  let result, then;
  try {
    result = action();
    then = result?.then;
  } catch (error) { release(true); throw error; }
  if (typeof then === 'function') {
    return Promise.resolve(result).then(async value => { await releaseAsync(false); return value; },
      async error => { await releaseAsync(true); throw error; });
  }
  release(false);
  return result;
}
module.exports = { withDocumentControl, withSynchronousDocumentControl };
