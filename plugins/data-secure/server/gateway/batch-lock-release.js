'use strict';

const { SafeError } = require('../runtime');
const { ownershipErrorCode } = require('../core/ownership-diagnostics');

const RELEASE_MESSAGE = 'Die lokale Stapelsperre konnte nicht sicher freigegeben werden.';

function releaseOwnedLock(releaseActiveLock, token, ErrorType = SafeError, primaryError = false) {
  try {
    if (releaseActiveLock(token) === true) return true;
  } catch (error) {
    if (primaryError) return false;
    const refusal = new ErrorType(RELEASE_MESSAGE);
    const code = ownershipErrorCode(error);
    if (code) refusal.code = code;
    throw refusal;
  }
  if (primaryError) return false;
  throw new ErrorType(RELEASE_MESSAGE);
}

// Four bounded asynchronous backoffs, only after an ordinary fixed Busy.
// The synchronous callback always receives the SAME acquired epoch; no native
// guard is retained across a timer. False/close/loss never qualify for retry.
const EPOCH_RELEASE_BACKOFF_MS = Object.freeze([10, 25, 50, 100]);
async function releaseOwnedEpochWithBusyRetry(releaseEpoch, epoch, ErrorType = SafeError, primaryError = false, options = {}) {
  const delay = options.delay || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const observe = options.onFailure || (() => {});
  const refusal = error => {
    const failure = new ErrorType(RELEASE_MESSAGE);
    failure.code = ownershipErrorCode(error) || 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED';
    return failure;
  };
  for (let attempt = 0; ; attempt++) {
    let failure;
    try {
      if (releaseEpoch(epoch) === true) return true;
      failure = refusal();
    } catch (error) {
      failure = refusal(error);
      if (failure.code === 'STANDALONE_OWNERSHIP_CONTROL_BUSY' && attempt < EPOCH_RELEASE_BACKOFF_MS.length) {
        try { await delay(EPOCH_RELEASE_BACKOFF_MS[attempt]); continue; }
        catch { failure = refusal(); }
      }
    }
    try { observe(failure); } catch { /* diagnostics cannot alter ownership */ }
    if (primaryError) return false;
    throw failure;
  }
}

module.exports = { RELEASE_MESSAGE, releaseOwnedLock, releaseOwnedEpochWithBusyRetry };
