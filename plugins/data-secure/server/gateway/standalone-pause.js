'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createPrivateWorkStore } = require('./private-work-store');
const { batchRoot } = require('./batch-private-store');
const { createBatchActiveLock } = require('./batch-active-lock');

const MAX_GENERATION = 1000000;
const fail = code => Object.assign(new Error(code), { code });
function generation(state) {
  const value = state.standalone_control_generation ?? 0;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_GENERATION) throw fail('STANDALONE_PAUSE_INVALID');
  return value;
}
function createStandalonePause(options = {}) {
  const root = options.root || batchRoot;
  const io = options.fs || fs;
  const store = () => createPrivateWorkStore({ privateRoot: root(), fs: io, maxBytes: 1024 });
  const gate = createBatchActiveLock({ fs: io, lockPath: () => path.join(root(), 'standalone-control.lock') });
  function control(token, action) {
    const deadline = Date.now() + 5000;
    for (;;) {
      try { gate.acquireActiveLock(token); break; }
      catch { if (Date.now() >= deadline) throw fail('STANDALONE_PAUSE_CONTROL_BUSY');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); }
    }
    let primary;
    try { return action(); }
    catch (error) { primary = error; throw error; }
    finally { if (!gate.releaseActiveLock(token) && !primary) throw fail('STANDALONE_PAUSE_CONTROL_INVALID'); }
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
    const initial = typeof stateOrRead === 'function' ? stateOrRead() : stateOrRead;
    return control(initial.token, () => writeRequest(typeof stateOrRead === 'function' ? stateOrRead() : initial));
  }
  function resume(state, persist) {
    if (state.product_channel !== 'standalone') return false;
    return control(state.token, () => {
      if (checkedRequested(state)) {
        if (generation(state) === MAX_GENERATION) throw fail('STANDALONE_PAUSE_INVALID');
        state.standalone_control_generation = generation(state) + 1;
        persist?.(state);
        return true;
      }
      return false;
    });
  }
  // The claim is the synchronous durable processing_started journal write,
  // not the asynchronous converter lifetime. Pause acceptance and that exact
  // boundary are serialized; reading/hash-checking the copy may precede it.
  function claim(state, action) {
    if (state.product_channel !== 'standalone') { action(); return true; }
    return control(state.token, () => {
      if (checkedRequested(state)) return false;
      action();
      return true;
    });
  }
  return Object.freeze({ requested, request, resume, claim });
}
module.exports = { createStandalonePause, generation, MAX_GENERATION };
