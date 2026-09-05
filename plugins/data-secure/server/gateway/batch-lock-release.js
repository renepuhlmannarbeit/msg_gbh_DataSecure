'use strict';

const { SafeError } = require('../runtime');

const RELEASE_MESSAGE = 'Die lokale Stapelsperre konnte nicht sicher freigegeben werden.';

function releaseOwnedLock(releaseActiveLock, token, ErrorType = SafeError, primaryError = false) {
  try {
    if (releaseActiveLock(token) === true) return true;
  } catch {
    if (primaryError) return false;
    throw new ErrorType(RELEASE_MESSAGE);
  }
  if (primaryError) return false;
  throw new ErrorType(RELEASE_MESSAGE);
}

module.exports = { RELEASE_MESSAGE, releaseOwnedLock };
