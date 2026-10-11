'use strict';

// Standalone document decisions and export preparation share one control
// owner. Keep synchronous callers synchronous, but never release ownership
// merely because an asynchronous native operation returned a Promise.
const fail = code => Object.assign(new Error(code), { code });
function withDocumentControl(gate, batchId, action) {
  try { gate.acquireActiveLock(batchId); } catch { throw fail('STANDALONE_BUSY'); }
  let released = false;
  function release(hasPrimaryError) {
    if (released) return;
    released = true;
    try {
      if (!gate.releaseActiveLock(batchId) && !hasPrimaryError) throw fail('DOCUMENT_REVIEW_INVALID');
    } catch (error) {
      // A cleanup failure must not replace the actual processing failure.
      // Failed ownership release remains blocking; it is not force-deleted.
      if (!hasPrimaryError) throw fail('DOCUMENT_REVIEW_INVALID');
    }
  }
  let result, then;
  try {
    result = action();
    then = result?.then;
  } catch (error) { release(true); throw error; }
  if (typeof then === 'function') {
    return Promise.resolve(result).then(value => { release(false); return value; },
      error => { release(true); throw error; });
  }
  release(false);
  return result;
}
module.exports = { withDocumentControl };
