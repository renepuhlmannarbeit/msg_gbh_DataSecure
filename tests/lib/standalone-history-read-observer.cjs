'use strict';
// Test-only bounded observation; no production retry or additional filesystem I/O.
// Test-only observation of the unchanged projected modules, before import.
// No product result, response, error, decision, retry or filesystem value is
// substituted. The only additional output is this closed bounded trace.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Module = require('node:module'), { types } = require('node:util');
const bound = require('../../plugins/data-secure/server/core/bound-file-io');
const PREFIX = 'STANDALONE_HISTORY_READ:';
const ENV = 'DATASECURE_TEST_HISTORY_READ_SCOPE';
const PHASES = new Set(['observer', 'resolver', 'locator', 'journal', 'journal_anchor', 'saved_summary',
  'export', 'export_owner', 'export_anchor', 'initial_results', 'initial_binding', 'initial_leaf', 'inventory']);
const OPERATIONS = new Set(['install', 'resolveResults', 'readHistoryLocator', 'readStandaloneHistoryState',
  'readStandaloneSummary', 'readStandaloneExportHistoryEntry', 'initialResultPublication', 'assertContentBinding',
  'bindDirectory', 'assertDirectory', 'readBoundFile', 'readBoundFileRecord', 'readBoundFileSnapshot',
  'readBoundFileSnapshotRecord', 'readHeldBytes',
  'lstatSync', 'openSync', 'fstatSync', 'readSync', 'closeSync', 'realpathSync', 'readdirSync']);
const CODES = new Set(['OTHER', 'ENOENT', 'EACCES', 'EPERM', 'EIO', 'EBUSY', 'EMFILE', 'ENFILE',
  'BOUND_FILE_CHANGED', 'BOUND_FILE_UNSAFE', 'BOUND_FILE_CLOSE_FAILED', 'RESULT_EXPORT_STATE_UNSAFE',
  'RESULT_EXPORT_PENDING', 'RESULT_EXPORT_CONFLICT', 'RESULT_PUBLICATION_PENDING', 'RESULT_PUBLICATION_CONFLICT',
  'RESULT_PUBLICATION_LEGACY', 'RESULT_PUBLICATION_INVALID',
  'STANDALONE_HISTORY_UNAVAILABLE', 'STANDALONE_HISTORY_MISSING', 'STANDALONE_RESULTS_MISSING',
  'CONTENT_OPTIONS_BINDING_INVALID', 'CONTENT_OPTIONS_BINDING_MISSING', 'DOCUMENT_REVIEW_INVALID',
  'DOCUMENT_REVIEW_MISSING', 'BATCH_PRODUCT_CHANNEL_MISMATCH', 'OBSERVER_UNAVAILABLE']);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function safeCode(error) {
  try {
    if (!error || typeof error !== 'object' || types.isProxy(error)) return 'OTHER';
    const code = Object.getOwnPropertyDescriptor(error, 'code');
    if (code) return Object.hasOwn(code, 'value') && CODES.has(code.value) ? code.value : 'OTHER';
    // The actual strict/snapshot record reader throws this exact bare Error.
    // Never classify arbitrary message text, inherited data, accessors or Proxy.
    const message = Object.getOwnPropertyDescriptor(error, 'message');
    return message && Object.hasOwn(message, 'value') && message.value === 'RESULT_EXPORT_STATE_UNSAFE'
      ? message.value : 'OTHER';
  } catch { return 'OTHER'; }
}
function safeEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)) return null;
  const data = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
    data[key] = descriptor.value;
  }
  value = data;
  const keys = Object.keys(value).sort().join(',');
  if (!Number.isInteger(value.seq) || value.seq < 1 || value.seq > 128 ||
      !Number.isInteger(value.call) || value.call < 0 || value.call > 1000000 ||
      !PHASES.has(value.phase) || !OPERATIONS.has(value.operation)) return null;
  const base = { seq: value.seq, call: value.call, phase: value.phase, operation: value.operation, kind: value.kind };
  if (keys === 'call,code,kind,operation,phase,seq' && value.kind === 'error' && CODES.has(value.code))
    return { ...base, code: value.code };
  if (keys === 'call,kind,operation,outcome,phase,seq' && value.kind === 'call' &&
      ['begin', 'return', 'null'].includes(value.outcome)) return { ...base, outcome: value.outcome };
  if (keys === 'call,kind,operation,phase,seq,sha256' && value.kind === 'identity' &&
      typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/u.test(value.sha256))
    return { ...base, sha256: value.sha256 };
  if (value.kind === 'io' && ['leaf', 'parent'].includes(value.role) &&
      Number.isInteger(value.step) && value.step >= 1 && value.step <= 1000000) {
    const ioBase = { ...base, role: value.role, step: value.step, outcome: value.outcome };
    if (keys === 'call,code,kind,operation,outcome,phase,role,seq,step' &&
        value.outcome === 'error' && CODES.has(value.code)) return { ...ioBase, code: value.code };
    if (keys === 'call,kind,operation,outcome,phase,role,seq,step' && value.outcome === 'return') return ioBase;
    if (keys === 'call,content_sha256,fact_sha256,kind,links,object_sha256,operation,outcome,phase,role,seq,step,type' &&
        value.outcome === 'return' && ['zero', 'one', 'other'].includes(value.links) &&
        ['regular', 'symlink', 'other'].includes(value.type) &&
        ['object_sha256', 'content_sha256', 'fact_sha256'].every(key => typeof value[key] === 'string' && /^[a-f0-9]{64}$/u.test(value[key])))
      return { ...ioBase, object_sha256: value.object_sha256, content_sha256: value.content_sha256,
        fact_sha256: value.fact_sha256, links: value.links, type: value.type };
  }
  return null;
}
function install({ caseRoot, server, write = line => process.stderr.write(line), identityHash = sha }) {
  const expectedServer = path.join(path.dirname(caseRoot), 'packaged-server');
  if (path.resolve(caseRoot) !== caseRoot || path.basename(caseRoot) !== 'content-format-workflow' ||
      !/^datasecure-standalone-ipc-[A-Za-z0-9-]+$/u.test(path.basename(path.dirname(caseRoot))) ||
      server !== expectedServer) throw Error('HISTORY_READ_OBSERVER_SCOPE');
  const scopeBinding = bound.bindDirectory(caseRoot), serverBinding = bound.bindDirectory(server);
  if (scopeBinding.real !== caseRoot || serverBinding.real !== server) throw Error('HISTORY_READ_OBSERVER_SCOPE');
  const names = ['standalone/application-service.js', 'standalone/run-history.js', 'gateway/batch.js',
    'gateway/standalone-history-store.js', 'gateway/batch-journal-store.js', 'gateway/result-export.js',
    'gateway/standalone-document-review-store.js', 'core/bound-file-io.js'];
  const source = path.resolve(__dirname, '../../plugins/data-secure/server');
  for (const name of names) {
    const file = path.join(server, name);
    if (require.cache[file] || !bound.readBoundFile(file, { maximum: 512 * 1024, minimum: 1, checkCtime: true })
      .equals(bound.readBoundFile(path.join(source, name), { maximum: 512 * 1024, minimum: 1, checkCtime: true })))
      throw Error('HISTORY_READ_OBSERVER_SOURCE');
  }
  bound.assertDirectory(scopeBinding); bound.assertDirectory(serverBinding);
  const load = Module._load, stack = [], fds = new Map(), snapshotRings = [];
  let active = true, emitted = 0, routine = 0, calls = 0;
  function emit(event, causal = false) {
    // An absent optional locator/summary is routine, not permission to consume
    // the reserved causal-failure capacity during normal history polling.
    const important = causal || event.kind === 'error' && !['ENOENT', 'STANDALONE_RESULTS_MISSING'].includes(event.code);
    if (!active || emitted >= 128 || !important && routine >= 64) return;
    try {
      const value = safeEvent({ seq: emitted + 1, ...event });
      if (!value) return;
      const line = PREFIX + JSON.stringify(value) + '\n';
      if (Buffer.byteLength(line, 'utf8') > 512) return;
      emitted++; if (!important) routine++;
      write(line);
    } catch { /* observer failure cannot replace an error or successful I/O */ }
  }
  const context = () => stack.at(-1);
  function observed(phase, operation, action, snapshotTarget = null) {
    if (!active) return action();
    const entry = { phase, operation, call: Math.min(++calls, 1000000) };
    const ring = snapshotTarget === null ? null : { ...entry, target: snapshotTarget, step: 0, points: [] };
    if (ring) snapshotRings.push(ring);
    stack.push(entry); emit({ ...entry, kind: 'call', outcome: 'begin' });
    try {
      const result = action();
      emit({ ...entry, kind: 'call', outcome: result === null ? 'null' : 'return' });
      return result;
    } catch (error) {
      if (ring) for (const point of ring.points) emit(point, true);
      emit({ ...entry, kind: 'error', code: safeCode(error) }); throw error;
    } finally { stack.pop(); if (ring) snapshotRings.pop(); }
  }
  function wrap(original, phase, operation) {
    return function (...args) {
      if (!active) return Reflect.apply(original, this, args);
      return observed(typeof phase === 'function' ? phase() : phase, operation,
        () => Reflect.apply(original, this, args));
    };
  }
  const initialActive = () => stack.some(row => row.phase === 'initial_results');
  function anchorPhase() { return initialActive() ? 'initial_results' : stack.some(row => row.phase === 'export') ? 'export_anchor' : 'journal_anchor'; }
  function leafPhase(file) {
    if (typeof file !== 'string') return null;
    const relative = path.relative(caseRoot, file);
    if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) return null;
    const parts = relative.split(path.sep), parent = parts.at(-2), leaf = parts.at(-1);
    if (parent === 'batches' && /^[a-f0-9]{64}\.json$/u.test(leaf)) return 'journal';
    if (parent === 'standalone-run-history' && /^legacy-[a-f0-9]{64}\.json$/u.test(leaf)) return 'locator';
    if (parent === 'standalone-run-history' && /^[a-f0-9]{64}\.json$/u.test(leaf)) return 'saved_summary';
    if (parent === 'result-export-state' && /^re_[a-f0-9]{32}\.json$/u.test(leaf)) return initialActive() ? 'initial_results' : 'export';
    if (initialActive() && parent === 'result-publication-bindings' && /^[a-f0-9]{64}\.json$/u.test(leaf)) return 'initial_binding';
    if (initialActive() && leaf.endsWith('.md')) return 'initial_leaf';
    if (parent === 'result-export-owners' && /^re_[a-f0-9]{32}\.json$/u.test(leaf)) return 'export_owner';
    if (parts.at(-3) === 'document-reviews' && /^[a-f0-9]{64}$/u.test(parent) && leaf === 'manifest.json') return anchorPhase();
    return null;
  }
  // No raw paths, PIDs, stat values or bytes enter this per-call ring. Facts
  // are captured only from the delegated result, without extra filesystem I/O.
  function snapshotFacts(stat) {
    if (!stat || typeof stat !== 'object' || types.isProxy(stat)) return {};
    const number = key => {
      const value = Object.getOwnPropertyDescriptor(stat, key)?.value;
      if (typeof value !== 'bigint' && !(typeof value === 'number' && Number.isFinite(value))) throw Error('FACT_UNAVAILABLE');
      return value;
    };
    const clock = (ns, ms) => Object.hasOwn(stat, ns) ? number(ns) : number(ms);
    const mode = BigInt(number('mode')) & 0o170000n, links = number('nlink');
    return { object_sha256: identityHash(JSON.stringify([number('dev'), number('ino'),
      clock('birthtimeNs', 'birthtimeMs')].map(String))),
      content_sha256: identityHash(JSON.stringify([number('size'), clock('mtimeNs', 'mtimeMs')].map(String))),
      fact_sha256: identityHash(JSON.stringify([clock('ctimeNs', 'ctimeMs'), links].map(String))),
      links: links === 0n || links === 0 ? 'zero' : links === 1n || links === 1 ? 'one' : 'other',
      type: mode === 0o100000n ? 'regular' : mode === 0o120000n ? 'symlink' : 'other' };
  }
  function rememberIo(ring, operation, role, result, error, failed) {
    if (!ring) return;
    try {
      const point = { call: ring.call, phase: ring.phase, operation, kind: 'io',
        role, step: Math.min(++ring.step, 1000000), outcome: failed ? 'error' : 'return' };
      if (failed) point.code = safeCode(error);
      else if (['lstatSync', 'fstatSync'].includes(operation)) {
        try { Object.assign(point, snapshotFacts(result)); } catch { /* facts are optional, never product authority */ }
      }
      ring.points.push(point);
      if (ring.points.length > 8) {
        // Deep, successfully rechecked parent chains must not evict every
        // causal leaf stat. Keep the same eight slots; failures stay eligible
        // regardless of role, and no extra stat/read is performed.
        const routineParent = ring.points.findIndex(row => row.role === 'parent' && row.outcome === 'return');
        ring.points.splice(routineParent < 0 ? 0 : routineParent, 1);
      }
    } catch { /* diagnostics cannot change actual I/O */ }
  }
  function ioView(original, core = false, initialOnly = false) {
    const copy = { ...original };
    for (const operation of ['lstatSync', 'openSync', 'fstatSync', 'readSync', 'closeSync', 'realpathSync', 'readdirSync']) {
      copy[operation] = function (...args) {
        const current = active && context();
        if (!current || initialOnly && !initialActive()) return Reflect.apply(original[operation], this, args);
        if (operation === 'readdirSync') return initialActive()
          ? observed('inventory', operation, () => Reflect.apply(original[operation], this, args))
          : Reflect.apply(original[operation], this, args);
        const ring = core ? snapshotRings.at(-1) : null;
        const named = ['lstatSync', 'openSync', 'realpathSync'].includes(operation);
        const held = named ? null : fds.get(args[0]);
        const phase = named ? leafPhase(args[0]) || ring?.phase : held?.phase;
        if (!phase) return Reflect.apply(original[operation], this, args);
        const role = named ? args[0] === ring?.target ? 'leaf' : 'parent' : held?.role || 'leaf';
        const entry = { call: current.call, phase, operation };
        try {
          const result = Reflect.apply(original[operation], this, args);
          if (operation === 'openSync') fds.set(result, { phase, role });
          rememberIo(ring, operation, role, result, null, false);
          if (!core && ['lstatSync', 'fstatSync'].includes(operation) && emitted < 128 && routine < 64) {
            try { emit({ ...entry, kind: 'identity', sha256: identityHash(JSON.stringify(['dev', 'ino', 'birthtimeNs', 'size', 'nlink', 'mtimeNs']
              .map(key => String(result[key])))) }); } catch { /* optional identity witness only */ }
          }
          return result;
        } catch (error) {
          rememberIo(ring, operation, role, null, error, true);
          if (!core) emit({ ...entry, kind: 'error', code: safeCode(error) }); throw error;
        } finally { if (operation === 'closeSync') fds.delete(args[0]); }
      };
      if (operation === 'realpathSync' && typeof original.realpathSync.native === 'function')
        copy.realpathSync.native = original.realpathSync.native;
    }
    return copy;
  }
  const historyReadLoad = function (request, parent, ...rest) {
    const original = Reflect.apply(load, this, [request, parent, ...rest]);
    if (!active) return original;
    const relative = typeof parent?.filename === 'string' ? path.relative(server, parent.filename).split(path.sep).join('/') : '';
    if (!names.includes(relative)) return original;
    try {
      if (relative === 'standalone/application-service.js' && request === '../gateway/batch')
        return { ...original, readStandaloneHistoryState: wrap(original.readStandaloneHistoryState, 'journal', 'readStandaloneHistoryState') };
      if (relative === 'standalone/application-service.js' && request === '../gateway/result-export')
        return { ...original, readStandaloneExportHistoryEntry: wrap(original.readStandaloneExportHistoryEntry, 'export', 'readStandaloneExportHistoryEntry') };
      if (relative === 'gateway/standalone-document-review-store.js' && request === './result-export')
        return { ...original, initialResultPublication: wrap(original.initialResultPublication, 'initial_results', 'initialResultPublication') };
      if (relative === 'standalone/run-history.js' && request === '../gateway/standalone-history-store')
        return { ...original, readHistoryLocator: wrap(original.readHistoryLocator, 'locator', 'readHistoryLocator'),
          readStandaloneSummary: wrap(original.readStandaloneSummary, 'saved_summary', 'readStandaloneSummary') };
      if (relative === 'standalone/application-service.js' && request === './run-history')
        return { ...original, createRunHistory(...args) {
          if (!active) return Reflect.apply(original.createRunHistory, this, args);
          const result = Reflect.apply(original.createRunHistory, this, args);
          try { return { ...result, resolveResults: wrap(result.resolveResults, 'resolver', 'resolveResults') }; }
          catch { return result; }
        } };
      if (relative === 'gateway/batch-journal-store.js' && request === './standalone-document-review-store' ||
          relative === 'gateway/result-export.js' && request === './standalone-document-review-store')
        return { ...original, createDocumentReviewStore(...args) {
          if (!active) return Reflect.apply(original.createDocumentReviewStore, this, args);
          const result = Reflect.apply(original.createDocumentReviewStore, this, args);
          try { return { ...result, assertContentBinding: function (...values) {
            if (!active || !context()) return Reflect.apply(result.assertContentBinding, this, values);
            return observed(anchorPhase(), 'assertContentBinding', () => Reflect.apply(result.assertContentBinding, this, values));
          } }; } catch { return result; }
        } };
      if (relative === 'core/bound-file-io.js' && ['fs', 'node:fs'].includes(request)) return ioView(original, true);
      if (relative === 'gateway/result-export.js' && ['fs', 'node:fs'].includes(request)) return ioView(original, false, true);
      if (['gateway/batch-journal-store.js', 'gateway/standalone-history-store.js'].includes(relative) && ['fs', 'node:fs'].includes(request))
        return ioView(original);
      if (request === '../core/bound-file-io') {
        const copy = { ...original };
        for (const operation of ['bindDirectory', 'assertDirectory', 'readBoundFile', 'readBoundFileRecord',
          'readBoundFileSnapshot', 'readBoundFileSnapshotRecord', 'readHeldBytes']) {
          if (typeof original[operation] !== 'function') continue;
          copy[operation] = function (...args) {
            if (!active || !context()) return Reflect.apply(original[operation], this, args);
            const phase = leafPhase(args[0]) || context().phase;
            return observed(phase, operation, () => Reflect.apply(original[operation], this, args),
              ['readBoundFileSnapshot', 'readBoundFileSnapshotRecord'].includes(operation) ? args[0] : null);
          };
        }
        return copy;
      }
    } catch { /* a failed observer adapter leaves the actual module unchanged */ }
    return original;
  };
  Module._load = historyReadLoad;
  emit({ call: 0, phase: 'observer', operation: 'install', kind: 'call', outcome: 'return' });
  return () => { active = false; if (Module._load === historyReadLoad) Module._load = load; fds.clear(); snapshotRings.length = 0; };
}

// Consume at most 128 sanitized records; unrelated/partial/oversized stderr is
// never forwarded. Promotion is called before resolving a normal error frame.
function createCollector({ write = line => process.stderr.write(line) } = {}) {
  let tail = '', promoted = false, sent = 0, wake, waitingFor;
  const rows = new Map();
  function flush() {
    for (const [seq, row] of rows) if (seq > sent) {
      sent = seq; try { write(PREFIX + JSON.stringify(row) + '\n'); } catch { /* diagnostics only */ }
    }
  }
  function append(chunk) {
    try {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const lines = (tail + bytes.subarray(-65536).toString('utf8')).split('\n');
      tail = lines.pop(); if (tail.length > 512) tail = '';
      for (const line of lines) {
        if (!line.startsWith(PREFIX) || line.length > 512) continue;
        let row; try { row = safeEvent(JSON.parse(line.slice(PREFIX.length))); } catch { continue; }
        if (row && rows.size < 128 && !rows.has(row.seq)) rows.set(row.seq, row);
      }
      if (promoted) flush();
      if (waitingFor && [...rows.values()].some(waitingFor)) wake?.();
    } catch { /* malformed diagnostics never alter an IPC response */ }
  }
  async function promote(remainingMs = 0, checkpoint = 0, code = null) {
    promoted = true; flush();
    // Cross-pipe delivery can present stdout before the earlier stderr write.
    // This observation drain is inside, never beyond, the existing IPC budget;
    // it neither retries the request nor changes any product deadline.
    const delay = Math.min(75, Math.max(0, remainingMs));
    const causal = row => row.seq > checkpoint && row.kind === 'error' && row.code !== 'ENOENT' &&
      (code === null || row.code === code);
    if (!delay || [...rows.values()].some(causal)) return;
    let timer;
    try { await new Promise(resolve => { wake = resolve; waitingFor = causal; timer = setTimeout(resolve, delay); }); }
    finally { clearTimeout(timer); wake = undefined; waitingFor = undefined; flush(); }
  }
  return { append, promote, checkpoint: () => Math.max(0, ...rows.keys()) };
}
module.exports = { install, createCollector, safeEvent, safeCode, PREFIX, ENV };
if (process.env[ENV] !== undefined) {
  try {
    const caseRoot = process.env[ENV], server = path.join(path.dirname(caseRoot), 'packaged-server');
    if (path.resolve(process.argv[1]) !== path.join(server, 'standalone/desktop-sidecar.js')) throw Error('HISTORY_READ_OBSERVER_ENTRY');
    const restore = install({ caseRoot, server }); process.once('exit', restore);
  } catch {
    try { process.stderr.write(PREFIX + JSON.stringify({ seq: 1, call: 0, phase: 'observer', operation: 'install',
      kind: 'error', code: 'OBSERVER_UNAVAILABLE' }) + '\n'); } catch { /* diagnosis only */ }
  }
}
