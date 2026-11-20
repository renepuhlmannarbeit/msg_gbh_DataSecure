'use strict';
// Actual artifact crash-parent lifecycle, isolated from its product fixtures.
const { firstFailure, within, ownChild } = require('./qa-parent-lifecycle.cjs');
async function finishArtifactCrash(child, phase, { waitMs = 15000, closeMs = 5000, onOwned = () => {}, owned: transferred } = {}) {
  const failure = firstFailure(() => { try { process.stderr.write('ARTIFACT_CRASH_SECONDARY_FAILURE\n'); } catch {} });
  let reportFault;
  const fault = new Promise(resolve => { reportFault = resolve; });
  const fail = error => { failure.record(error); reportFault(failure.value); };
  // Fixture startup may transfer its exact existing record, including its one-shot kill.
  const owned = transferred || ownChild(child, fail);
  if (owned.child !== child) throw Error('ARTIFACT_CRASH_OWNERSHIP_MISMATCH');
  if (transferred) {
    if (owned.failure.failed) fail(owned.failure.value);
    owned.error.then(fail);
  }
  let expectation, timedOut = false, stderr = '', exited, signal;
  try {
    onOwned(owned);
    child.stderr?.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(0, 1000); });
    child.stderr?.on('error', fail);
    child.on('message', value => {
      try {
        expectation = value.expectation;
        if (phase === 'before') owned.terminate('SIGKILL');
      } catch (error) { fail(error); }
    });
    const end = await within(Promise.race([owned.done, fault.then(error => { throw error; })]),
      waitMs, 'ARTIFACT_CRASH_WAIT_UNCONFIRMED');
    if (end.code === 78) throw Object.assign(Error('ARTIFACT_WORKER_SELF_DEADLINE_UNCONFIRMED'),
      { code: 'ARTIFACT_WORKER_SELF_DEADLINE_UNCONFIRMED' });
    exited = end.code; signal = end.signal;
  } catch (error) {
    if (error?.code === 'ARTIFACT_CRASH_WAIT_UNCONFIRMED') timedOut = true;
    fail(error);
  } finally {
    // A refused/throwing first request is not permission to signal repeatedly.
    try { owned.terminate('SIGKILL'); } catch (error) { failure.record(error); }
    try { await within(owned.done, closeMs, 'ARTIFACT_CRASH_CLOSE_UNCONFIRMED'); }
    catch (error) { failure.record(error); }
  }
  failure.throwIfFailed();
  return { expectation, timedOut, stderr, exited, signal };
}
module.exports = { finishArtifactCrash };
