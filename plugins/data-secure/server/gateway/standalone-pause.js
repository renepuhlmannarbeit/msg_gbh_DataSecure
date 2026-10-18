'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { createPrivateWorkStore } = require('./private-work-store');
const { batchRoot } = require('./batch-private-store');
const { dataRoot } = require('../runtime');
const { createBatchActiveLock, ACTIVE_LOCK_BUSY } = require('./batch-active-lock');
const { ownErrorCode } = require('./batch-execution-diagnostic');

const MAX_GENERATION = 1000000;
const fail = code => Object.assign(new Error(code), { code });
function synchronous(callback, ...args) {
  if (callback.constructor?.name === 'AsyncFunction') throw fail('OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
  const result = callback(...args);
  if (result && typeof result.then === 'function') throw fail('OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
  return result;
}
function generation(state) {
  const value = state.standalone_control_generation ?? 0;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_GENERATION) throw fail('STANDALONE_PAUSE_INVALID');
  return value;
}
function createStandalonePause(options = {}) {
  const root = options.root || batchRoot;
  const io = options.fs || fs;
  const withOwnershipControl = options.withOwnershipControl || require('../core/ownership-control').withOwnershipControl;
  const now = options.now || (() => performance.now());
  const retryDelay = options.retryDelay || (milliseconds => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  });
  const store = () => createPrivateWorkStore({ privateRoot: root(), fs: io, maxBytes: 1024 });
  const gate = createBatchActiveLock({ fs: io, withOwnershipControl, onFailure: options.onFailure,
    lockPath: () => path.join(root(), 'standalone-control.lock') });
  function control(token, action) {
    const deadline = now() + 5000;
    for (;;) {
      let entered = false, actionFailed = false, primary;
      try {
        // The shared helper owns acquire/action/release under one reentrant
        // guard, with single-attempt publication and cleanup (no held sleeps).
        return gate.withSynchronousActiveLock(token, () => {
          entered = true;
          try { return synchronous(action); }
          catch (error) { actionFailed = true; primary = error; throw error; }
        });
      } catch (error) {
        // Never replay an action, including one that itself threw Busy or a
        // thenable-refusal. Preserve its original exception identity.
        if (actionFailed) throw primary;
        if (entered) {
          if (error?.code === 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED') throw fail('STANDALONE_PAUSE_CONTROL_INVALID');
          throw error;
        }
        const logicalCollision = typeof ACTIVE_LOCK_BUSY === 'string' && error?.code === ACTIVE_LOCK_BUSY;
        if (logicalCollision) {
          // A native live logical owner cannot be in a different valid sync
          // transaction while this root is held by a reentrant outer caller.
          if (process.env.DATASECURE_NATIVE_EXPORT_CHANNEL === '1')
            throw fail('STANDALONE_PAUSE_CONTROL_BUSY');
        }
        const acquisitionBusy = logicalCollision || error?.code === 'OWNERSHIP_GUARD_BUSY';
        if (!acquisitionBusy) throw error;
        if (now() >= deadline) throw fail('STANDALONE_PAUSE_CONTROL_BUSY');
        // The helper has already left its guarded lifetime before this wait.
        retryDelay(10);
      }
    }
  }
  function target(state) {
    if (state.product_channel !== 'standalone' || !/^[a-f0-9]{64}$/u.test(state.token || '')) throw fail('STANDALONE_PAUSE_INVALID');
    return path.join(root(), `${state.token}.pause-${generation(state)}`);
  }
  function readRequested(state) {
    if (state.product_channel !== 'standalone') return false;
    const file = target(state);
    try { io.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    // Malformed or replaced control files never silently permit another file.
    const record = JSON.parse(store().readFile(file).toString('utf8'));
    if (Object.keys(record).sort().join(',') !== 'generation,schema,token' ||
        record.schema !== 'datasecure-standalone-pause/1' || record.token !== state.token ||
        record.generation !== generation(state)) throw fail('STANDALONE_PAUSE_INVALID');
    return true;
  }
  function requested(state) {
    if (state.product_channel !== 'standalone') return false;
    return control(state.token, () => checkedRequested(state));
  }
  function observeRequested(state) {
    if (state.product_channel !== 'standalone') return false;
    // Progress is an observation, not admission to process another document.
    // Use the SAME root guard as every control writer (not the batches root),
    // without publishing a second logical owner merely to display counters.
    // Native callers are serialized/reentrant; the explicit legacy adapter
    // still performs the full bound marker read. All errors remain failures.
    const ownershipRoot = dataRoot(), deadline = now() + 5000;
    for (;;) {
      let entered = false;
      try {
        return withOwnershipControl(ownershipRoot, () => {
          entered = true;
          return checkedRequested(state);
        });
      } catch (error) {
        // Preserve the previous bounded pre-admission tolerance for another
        // writer. Never retry a marker read, an entered callback or close.
        const remaining = deadline - now();
        if (entered || ownErrorCode(error) !== 'OWNERSHIP_GUARD_BUSY' || remaining <= 0) throw error;
        retryDelay(Math.min(10, remaining)); // no guard is held here
        if (now() >= deadline) throw error;
      }
    }
  }
  function checkedRequested(state) {
    try { return readRequested(state); }
    catch { throw fail('STANDALONE_PAUSE_CONTROL_INVALID'); }
  }
  function writeRequest(state) {
    if (state.zero_day_work === true) throw fail('STANDALONE_PAUSE_RETENTION_UNAVAILABLE');
    const file = target(state);
    const bytes = Buffer.from(JSON.stringify({ schema: 'datasecure-standalone-pause/1',
      token: state.token, generation: generation(state) }));
    try { store().writeFile(file, bytes); }
    catch (error) { if (error.code !== 'PRIVATE_ARTIFACT_ALREADY_EXISTS') throw fail('STANDALONE_PAUSE_CONTROL_INVALID'); }
    if (!checkedRequested(state)) throw fail('STANDALONE_PAUSE_INVALID');
    return true;
  }
  function request(stateOrRead) {
    const initial = typeof stateOrRead === 'function' ? synchronous(stateOrRead) : stateOrRead;
    return control(initial.token, () => writeRequest(typeof stateOrRead === 'function' ? synchronous(stateOrRead) : initial));
  }
  function resume(state, persist) {
    if (state.product_channel !== 'standalone') return false;
    return control(state.token, () => {
      if (checkedRequested(state)) {
        if (generation(state) === MAX_GENERATION) throw fail('STANDALONE_PAUSE_INVALID');
        state.standalone_control_generation = generation(state) + 1;
        if (persist) synchronous(persist, state);
        return true;
      }
      return false;
    });
  }
  // The claim is the synchronous durable processing_started journal write,
  // not the asynchronous converter lifetime. Pause acceptance and that exact
  // boundary are serialized; reading/hash-checking the copy may precede it.
  function claim(state, action) {
    if (state.product_channel !== 'standalone') { synchronous(action); return true; }
    return control(state.token, () => {
      if (checkedRequested(state)) return false;
      synchronous(action);
      return true;
    });
  }
  return Object.freeze({ requested, observeRequested, request, resume, claim });
}
module.exports = { createStandalonePause, generation, MAX_GENERATION };
