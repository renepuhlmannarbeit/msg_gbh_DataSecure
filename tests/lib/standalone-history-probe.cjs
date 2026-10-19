'use strict';

// Test-process-only observation of real history I/O. No product response,
// return value, error or migration result is replaced. Emit fixed phases,
// closed codes and bounded hashes/counts, never source bytes or local paths.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const PREFIX = 'STANDALONE_HISTORY_PROBE:';
const CODES = new Set(['ENOENT', 'EACCES', 'EPERM', 'EIO', 'BOUND_FILE_CHANGED',
  'BOUND_FILE_UNSAFE', 'BOUND_FILE_CLOSE_FAILED', 'STANDALONE_HISTORY_UNAVAILABLE', 'OTHER']);
const PHASES = new Set(['bindDirectory', 'assertDirectory', 'readBoundFileRecord', 'migration']);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function safeEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort().join(',');
  if (keys === 'code,kind,phase' && value.kind === 'error' && PHASES.has(value.phase) && CODES.has(value.code))
    return { kind: 'error', phase: value.phase, code: value.code };
  if (keys === 'count,kind,namespace,sha256' && value.kind === 'membership' &&
      ['summaries', 'exports'].includes(value.namespace) && Number.isSafeInteger(value.count) &&
      value.count >= 0 && value.count <= 10001 && /^[a-f0-9]{64}$/u.test(value.sha256))
    return { kind: 'membership', namespace: value.namespace, count: value.count, sha256: value.sha256 };
  if (keys === 'bytes,kind,sha256' && value.kind === 'record' && Number.isSafeInteger(value.bytes) &&
      value.bytes >= 0 && value.bytes <= 4096 && /^[a-f0-9]{64}$/u.test(value.sha256))
    return { kind: 'record', bytes: value.bytes, sha256: value.sha256 };
  return null;
}
function safeProbeLines(stderr) {
  const result = [];
  for (const line of String(stderr).split(/\r?\n/u)) {
    if (!line.startsWith(PREFIX) || line.length > 512) continue;
    try {
      const value = safeEvent(JSON.parse(line.slice(PREFIX.length)));
      if (value) result.push(PREFIX + JSON.stringify(value));
    } catch { /* untrusted child output is not forwarded */ }
    if (result.length === 128) break;
  }
  return result;
}
function install(root) {
  const load = Module._load, readdir = fs.readdirSync;
  const gateway = path.resolve(__dirname, '../../plugins/data-secure/server/gateway');
  const windowFile = path.join(gateway, 'standalone-history-window.js');
  const storeFile = path.join(gateway, 'standalone-history-store.js');
  let active = true, emitted = 0, metadataEvents = 0;
  function emit(value) {
    if (!active || emitted >= 128) return;
    try {
      const event = safeEvent(value);
      // Routine metadata must not consume the whole budget before a later
      // causal error. Still bounded at 128 total events for this installation.
      if (event && (event.kind === 'error' || metadataEvents < 64)) {
        emitted++; if (event.kind !== 'error') metadataEvents++;
        process.stderr.write(PREFIX + JSON.stringify(event) + '\n');
      }
    } catch { /* diagnosis never replaces the primary product result */ }
  }
  function observed(phase, action) {
    try { return action(); }
    catch (error) {
      emit({ kind: 'error', phase, code: CODES.has(error?.code) ? error.code : 'OTHER' });
      throw error;
    }
  }
  Module._load = function historyProbeLoad(request, parent, ...rest) {
    const original = Reflect.apply(load, this, [request, parent, ...rest]);
    if ([windowFile, storeFile].includes(parent?.filename) && request === '../core/bound-file-io') {
      const observedBoundary = { ...original };
      for (const phase of ['bindDirectory', 'assertDirectory', 'readBoundFileRecord']) {
        observedBoundary[phase] = function (...args) {
          if (!active) return Reflect.apply(original[phase], this, args);
          return observed(phase, () => {
            const result = Reflect.apply(original[phase], this, args);
            try {
              if (emitted < 128 && metadataEvents < 64 && phase === 'readBoundFileRecord' &&
                  Buffer.isBuffer(result.bytes) && result.bytes.length <= 4096)
                emit({ kind: 'record', bytes: result.bytes.length, sha256: sha(result.bytes) });
            } catch { /* a diagnostic failure never changes successful I/O */ }
            return result;
          });
        };
      }
      return observedBoundary;
    }
    if (parent?.filename === storeFile && request === './standalone-history-window') {
      const wrapped = { ...original };
      for (const [method, callbackIndex] of [['readRecentHistory', 0], ['registerHistory', 1]]) {
        wrapped[method] = function (...args) {
          if (!active) return Reflect.apply(original[method], this, args);
          const migrate = args[callbackIndex];
          if (typeof migrate === 'function') args[callbackIndex] = function (...values) {
            return observed('migration', () => Reflect.apply(migrate, this, values));
          };
          return Reflect.apply(original[method], this, args);
        };
      }
      return wrapped;
    }
    return original;
  };
  fs.readdirSync = function historyProbeMembership(file, ...args) {
    const result = Reflect.apply(readdir, this, [file, ...args]);
    if (!active || emitted >= 128 || metadataEvents >= 64) return result;
    try {
      if (typeof file !== 'string') return result;
      const relative = path.relative(root, path.resolve(file)), leaf = path.basename(file);
      if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep) ||
          !['standalone-run-history', 'result-export-state'].includes(leaf) ||
          !Array.isArray(result) || !result.every(name => typeof name === 'string')) return result;
      const names = result.filter(name => (leaf === 'standalone-run-history'
        ? /^[a-f0-9]{64}\.json$/u : /^re_[a-f0-9]{32}\.json$/u).test(name)).slice(0, 10001).sort();
      emit({ kind: 'membership', namespace: leaf === 'standalone-run-history' ? 'summaries' : 'exports',
        count: names.length, sha256: sha(JSON.stringify(names)) });
    } catch { /* diagnosis never replaces the actual directory result */ }
    return result;
  };
  return () => { active = false; Module._load = load; fs.readdirSync = readdir; };
}
module.exports = { install, safeProbeLines };
