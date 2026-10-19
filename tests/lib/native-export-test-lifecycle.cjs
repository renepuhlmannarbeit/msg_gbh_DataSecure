'use strict';
const { performance } = require('node:perf_hooks');
// Test harness only. A close observation is not an exit event or a process-tree
// quiescence claim. Waiting never grants a fresh timeout after the original cut.
function observeClose(child, now = () => performance.now()) {
  return new Promise(resolve => child.once('close', () => resolve({ observed_at: now() })));
}
function waitForObservedClose(observation, deadlineAt, timing = {}) {
  const now = timing.now || (() => performance.now()), set = timing.setTimeout || setTimeout, clear = timing.clearTimeout || clearTimeout;
  if (!Number.isFinite(deadlineAt)) throw new TypeError('closed deadline required');
  return new Promise(resolve => {
    let settled = false, timer;
    const finish = confirmed => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clear(timer);
      resolve(confirmed);
    };
    timer = set(() => finish(false), Math.max(0, deadlineAt - now()));
    observation.then(value => finish(Number.isFinite(value?.observed_at) && value.observed_at <= deadlineAt), () => finish(false));
  });
}
function observeChild(child, now = () => performance.now()) {
  let exit = null, errorObserved = false;
  child.once('exit', (code, signal) => { exit = { code, signal, observed_at: now() }; });
  child.once('error', () => { errorObserved = true; });
  const close = observeClose(child, now);
  return Object.freeze({ close, snapshot: () => ({ exit, errorObserved }) });
}
async function waitForChildCompletion(observation, deadlineAt, timing = {}) {
  // There is deliberately no unbounded exit Promise before or after this
  // bounded wait. Even an ineffective kill cannot manufacture an exit/join.
  const closeConfirmed = await waitForObservedClose(observation.close, deadlineAt, timing);
  const { exit, errorObserved } = observation.snapshot();
  const exitConfirmed = Number.isFinite(exit?.observed_at) && exit.observed_at <= deadlineAt;
  return Object.freeze({ close_confirmed: closeConfirmed, exit_confirmed: exitConfirmed,
    exit_code: exitConfirmed ? exit.code : null, exit_signal: exitConfirmed ? exit.signal : null,
    error_observed: errorObserved });
}
module.exports = { observeClose, waitForObservedClose, observeChild, waitForChildCompletion };
