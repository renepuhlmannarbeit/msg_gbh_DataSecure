'use strict';

// Execute the actual parent closure; only OS launch and clock are modeled.
// This fixture supplies no kernel/process-end evidence of its own.
const fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const CONTENT_OPTIONS = Object.freeze({ schema: 'datasecure-content-options/1',
  markdownOutput: 'content-v1', scanOcr: true, imageOcr: true });

function createParentModel({ legacy = false, flush = true, platform = process.platform, arch = 'x64', spawned = true,
  streams = true, runtimeFailure, spawnFailure } = {}) {
  const filename = path.resolve(__dirname, '../../plugins/data-secure/server/standalone/conversion-worker.js');
  const originalRequire = createRequire(filename), child = new EventEmitter(), timers = new Map();
  let nextTimer = 0, killed = 0, inputCallback, inputCopy, spawnCalls = 0;
  const original = Buffer.from('bound original bytes');
  const observedBuffer = new Proxy(Buffer, { get(target, key) {
    if (key === 'from') return (value, ...args) => {
      const result = Buffer.from(value, ...args); if (value === original) inputCopy = result; return result;
    };
    return Reflect.get(target, key);
  } });
  if (streams) {
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.stdin.end = (_bytes, callback) => { inputCallback = callback; if (flush) callback(); };
  child.stdin.destroy = () => {};
  }
  child.kill = () => { killed++; return true; };
  const module = { exports: {} };
  const localRequire = name => {
    if (name === 'node:child_process') return { spawn: () => { spawnCalls++; if (spawnFailure) throw spawnFailure; return child; } };
    if (name === './conversion-runtime-resolver') return { resolveConversionRuntime: () => {
      if (runtimeFailure) throw runtimeFailure; return { node: 'bound-node', root: __dirname };
    } };
    if (name === '../native-launcher') return { verifyNativeLauncherArtifact() {} };
    if (name === '../posix-supervisor') return { verifyPosixSupervisor: () => ({ available: true, executable: 'bound-supervisor' }) };
    return originalRequire(name);
  };
  new Function('require', 'module', '__dirname', 'process', 'setTimeout', 'clearTimeout', 'Buffer', fs.readFileSync(filename, 'utf8'))(
    localRequire, module, path.dirname(filename), { platform, arch, env: {} },
    (callback, ms) => { const id = ++nextTimer; timers.set(id, { callback, ms }); return id; }, id => timers.delete(id), observedBuffer);
  const controller = new AbortController();
  let promise;
  try { promise = module.exports.convertBuffer(original, '.pdf',
    { timeoutMs: 1000, signal: controller.signal, ...(legacy ? {} : { contentOptions: CONTENT_OPTIONS }) }); }
  catch (error) { promise = Promise.reject(error); }
  if (spawned) child.emit('spawn');
  return { promise, child, controller, original, copy: () => inputCopy, spawnCalls: () => spawnCalls,
    completeInput: () => inputCallback(), closeInput: () => child.stdin.emit('close'),
    graceMs: module.exports.TERMINATION_GRACE_MS, killed: () => killed, timers,
    tick(ms) {
      const entry = [...timers].find(([, timer]) => timer.ms === ms);
      if (!entry) throw new Error('MODELED_TIMER_MISSING');
      timers.delete(entry[0]); entry[1].callback();
    },
    inputError(code, via) {
      const failure = code === undefined ? new Error('synthetic I/O failure') : Object.assign(new Error(code), { code });
      if (via === 'callback') inputCallback(failure); else child.stdin.emit('error', failure);
    },
    send(value) { child.stdout.emit('data', Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value) + '\n')); },
    close(code, signal = null) { child.emit('close', code, signal); }
  };
}

module.exports = { createParentModel, CONTENT_OPTIONS };
