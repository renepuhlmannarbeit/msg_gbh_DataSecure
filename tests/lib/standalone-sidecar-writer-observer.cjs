'use strict';

// Test-only lifecycle evidence. Never imported by production modules; this
// observer neither replaces product decisions nor authorizes product writes.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const { performance } = require('node:perf_hooks');
const bound = require('../../plugins/data-secure/server/core/bound-file-io');
const ID = /^[a-f0-9]{32}$/u;
const PREFIX = 'DATASECURE_TEST_WRITER_';
const CAPS = Object.freeze({ hosts: 32, workers: 128, leaves: 1024, leafBytes: 8192, readBytes: 32 * 1024 * 1024 });
const fail = name => Object.assign(new Error(`WRITER_PROBE_${name}`), { code: `WRITER_PROBE_${name}` });
const check = (value, name) => { if (!value) throw fail(name); };
const pid = value => Number.isSafeInteger(value) && value > 0;
const closed = (value, keys) => value && Object.keys(value).sort().join() === keys.split(',').sort().join();
const common = 'v,type,host';
const worker = `${common},id,role`;
const shapes = { plan: common, host: `${common},pid`, seal: `${common},pid,workers,observer_failed`, intent: worker,
  spawn: `${worker},pid`, entry: `${worker},pid`, exit: `${worker},pid,code`, close: `${worker},pid,code,signal`, error: worker };
const roleOK = role => role === 'batch' || role === 'review';
const nameFor = row => `${row.type}-${row.host}${row.id ? `-${row.id}` : ''}.json`;
function validate(row, name) {
  check(row && row.v === 1 && ID.test(row.host) && shapes[row.type] && closed(row, shapes[row.type]) && nameFor(row) === name, 'SCHEMA');
  if (Object.hasOwn(row, 'id')) check(ID.test(row.id) && roleOK(row.role), 'SCHEMA');
  if (Object.hasOwn(row, 'pid')) check(pid(row.pid), 'SCHEMA');
  if (Object.hasOwn(row, 'code')) check(Number.isInteger(row.code) && row.code >= 0 && row.code <= 255 || row.code === null, 'SCHEMA');
  if (row.type === 'close') check(row.signal === null || /^SIG[A-Z0-9]{1,12}$/u.test(row.signal), 'SCHEMA');
  if (row.type === 'seal') check(typeof row.observer_failed === 'boolean' && Array.isArray(row.workers) && row.workers.length <= CAPS.workers &&
    row.workers.every((item, i, all) => closed(item, 'id,role') && ID.test(item.id) && roleOK(item.role) && (!i || all[i - 1].id < item.id)), 'SCHEMA');
  return row;
}
function pinOf(binding) { return { path: binding.path, real: binding.real, chain: binding.chain, platform: binding.platform }; }
function fromPin(pin, io) {
  check(closed(pin, 'path,real,chain,platform') && path.isAbsolute(pin.path) && pin.real === pin.path &&
    pin.platform === process.platform && Array.isArray(pin.chain) && pin.chain.length > 0 && pin.chain.length < 64 &&
    pin.chain.every((item, i, all) => closed(item, 'path,identity,alias') && item.alias === false &&
      closed(item.identity, 'dev,ino,birth') && Object.values(item.identity).every(value => /^\d+(?:\.\d+)?$/u.test(value)) &&
      item.path === (i ? path.dirname(all[i - 1].path) : pin.path)) &&
    path.dirname(pin.chain.at(-1).path) === pin.chain.at(-1).path, 'PIN');
  const binding = { ...pin, io };
  bound.assertDirectory(binding);
  return binding;
}
function publish(binding, row) {
  const io = binding.io, name = nameFor(validate(row, nameFor(row))), target = path.join(binding.path, name);
  bound.assertDirectory(binding);
  const absent = () => { try { io.lstatSync(target); } catch (error) { if (error.code === 'ENOENT') return; throw error; } throw fail('DUPLICATE'); };
  absent();
  const bytes = Buffer.from(JSON.stringify(row)); check(bytes.length <= CAPS.leafBytes, 'LEAF_BUDGET');
  const temporary = `${target}.${crypto.randomBytes(12).toString('hex')}.tmp`;
  const fd = io.openSync(temporary, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL | (io.constants.O_NOFOLLOW || 0), 0o600);
  try {
    for (let offset = 0; offset < bytes.length;) {
      const count = io.writeSync(fd, bytes, offset, bytes.length - offset);
      check(Number.isInteger(count) && count > 0, 'WRITE'); offset += count;
    }
    io.fsyncSync(fd);
  } finally { io.closeSync(fd); }
  bound.assertDirectory(binding); absent();
  // Atomic visibility, NOT a no-replace syscall. Every (type,host,id) has one
  // sole producer, phase and random nonce owner. No rival writes this name.
  // Duplicate calls fail above; failed publication is preserved, never retried.
  io.renameSync(temporary, target);
  bound.assertDirectory(binding);
}
function installObserver(environment = process.env, view = process, cp = childProcess, io = fs) {
  const encoded = environment[`${PREFIX}PIN`];
  check(typeof encoded === 'string' && encoded.length < 16384, 'PIN');
  const binding = fromPin(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')), io);
  const host = environment[`${PREFIX}HOST`], id = environment[`${PREFIX}WORKER`], role = environment[`${PREFIX}ROLE`];
  check(ID.test(host) && path.basename(binding.path) === 'writer-observations' &&
    path.basename(path.dirname(binding.path)) === 'content-format-workflow' &&
    /^datasecure-standalone-ipc-[A-Za-z0-9-]+$/u.test(path.basename(path.dirname(path.dirname(binding.path)))), 'SCOPE');
  const server = path.join(path.dirname(path.dirname(binding.path)), 'packaged-server');
  const workerFile = roleName => path.join(server, 'gateway', `${roleName}-worker.js`);
  if (id !== undefined || role !== undefined) {
    check(ID.test(id) && roleOK(role) && path.resolve(view.argv[1]) === workerFile(role), 'ROLE');
    const fields = { v: 1, host, id, role, pid: view.pid };
    publish(binding, { ...fields, type: 'entry' });
    // Missing/failed observation is rejected by the reader; an observer's own
    // receipt I/O must not interrupt later production exit listeners.
    view.once('exit', code => { try { publish(binding, { ...fields, type: 'exit', code }); } catch {} });
    return { kind: 'worker' };
  }
  check(path.resolve(view.argv[1]) === path.join(server, 'standalone', 'desktop-sidecar.js'), 'ROLE');
  publish(binding, { v: 1, type: 'host', host, pid: view.pid });
  const fork = cp.fork, workers = []; let observerFailed = false;
  const observeEvent = callback => (...args) => { try { callback(...args); } catch { observerFailed = true; } };
  cp.fork = function observedFork(file, args, options) {
    const roleName = ['batch', 'review'].find(value => path.resolve(file) === workerFile(value));
    if (!roleName) return fork.call(this, file, args, options);
    check(workers.length < CAPS.workers && options && Array.isArray(options.execArgv), 'WORKER_BUDGET');
    const workerId = crypto.randomBytes(16).toString('hex');
    check(!workers.some(item => item.id === workerId), 'DUPLICATE');
    workers.push({ id: workerId, role: roleName });
    const fields = { v: 1, host, id: workerId, role: roleName };
    publish(binding, { ...fields, type: 'intent' });
    const child = fork.call(this, file, args, { ...options,
      execArgv: [...options.execArgv, `--require=${__filename}`],
      env: { ...options.env, [`${PREFIX}PIN`]: encoded, [`${PREFIX}HOST`]: host,
        [`${PREFIX}WORKER`]: workerId, [`${PREFIX}ROLE`]: roleName } });
    let spawnedPid;
    child.once('spawn', observeEvent(() => { check(pid(child.pid), 'SPAWN'); spawnedPid = child.pid;
      publish(binding, { ...fields, type: 'spawn', pid: spawnedPid }); }));
    child.once('error', observeEvent(() => publish(binding, { ...fields, type: 'error' })));
    child.once('close', observeEvent((code, signal) => {
      // A real fork spawn-error emits close without spawn/a usable pid. Keep
      // its error receipt, do not invent close proof or interrupt later product
      // close/error listeners with an observer exception.
      if (!pid(spawnedPid)) return;
      publish(binding, { ...fields, type: 'close', pid: spawnedPid, code, signal }); }));
    return child;
  };
  view.once('exit', () => { try { publish(binding, { v: 1, type: 'seal', host, pid: view.pid,
    observer_failed: observerFailed, workers: [...workers].sort((a, b) => a.id.localeCompare(b.id)) }); } catch {} });
  return { kind: 'host', restoreFork() { check(cp.fork !== fork, 'RESTORE'); cp.fork = fork; } };
}
function makeObserver(options = {}) {
  const io = options.io || fs, clock = options.clock || { now: () => performance.now(), sleep: ms => new Promise(resolve => setTimeout(resolve, ms)) };
  const fixtureBase = io.realpathSync(options.fixtureBase || os.tmpdir()), scopes = new WeakMap();
  const limits = { ...CAPS, ...options.limits };
  for (const key of Object.keys(CAPS)) check(Number.isInteger(limits[key]) && limits[key] > 0 && limits[key] <= CAPS[key], 'LIMITS');
  function state(scope) { const value = scopes.get(scope); check(value, 'CAPABILITY'); return value; }
  function createScope(caseRoot) {
    const original = bound.bindDirectory(caseRoot, { io });
    check(original.path === original.real && path.basename(caseRoot) === 'content-format-workflow' &&
      /^datasecure-standalone-ipc-[A-Za-z0-9-]+$/u.test(path.basename(path.dirname(caseRoot))) &&
      path.dirname(path.dirname(original.path)) === fixtureBase, 'SCOPE');
    const directory = path.join(original.path, 'writer-observations');
    io.mkdirSync(directory, { mode: 0o700 });
    const binding = bound.bindDirectory(directory, { io }); bound.assertDirectory(original);
    const scope = Object.freeze({ directory });
    scopes.set(scope, { original, binding, hosts: [], records: new Map() }); return scope;
  }
  function planHost(scope) {
    const data = state(scope); bound.assertDirectory(data.original); check(data.hosts.length < limits.hosts, 'HOST_BUDGET');
    const id = crypto.randomBytes(16).toString('hex'); check(!data.hosts.some(item => item.id === id), 'DUPLICATE');
    publish(data.binding, { v: 1, type: 'plan', host: id });
    const generation = { id, environment: Object.freeze({ [`${PREFIX}PIN`]: Buffer.from(JSON.stringify(pinOf(data.binding))).toString('base64'), [`${PREFIX}HOST`]: id }) };
    data.hosts.push(generation); return generation;
  }
  function attachHost(generation, child) {
    check(!generation.child && child && typeof child.once === 'function', 'HOST_ATTACH'); generation.child = child;
    child.once('spawn', () => { check(pid(child.pid), 'HOST_SPAWN'); generation.pid = child.pid; });
    child.once('error', error => { generation.error = error; });
    child.once('close', (code, signal) => { generation.closed = { code, signal }; });
  }
  function context(timeout = 22000) {
    check(Number.isInteger(timeout) && timeout > 0 && timeout <= 22000, 'DEADLINE');
    const result = { deadline: clock.now() + timeout, readBytes: 0 };
    result.io = { ...io, readSync(fd, buffer, offset, length, position) {
      result.readBytes += length; check(result.readBytes <= limits.readBytes, 'READ_BUDGET');
      return io.readSync(fd, buffer, offset, length, position);
    } }; return result;
  }
  function within(ctx) { check(clock.now() < ctx.deadline, 'DEADLINE'); }
  function snapshot(data, ctx) {
    within(ctx); bound.assertDirectory(data.original); bound.assertDirectory(data.binding);
    const names = [], directory = io.opendirSync(data.binding.path);
    try { for (let entry; (entry = directory.readSync());) { names.push(entry.name); check(names.length <= limits.leaves, 'LEAF_BUDGET'); } }
    finally { directory.closeSync(); }
    const rows = new Map(), hosts = new Set(data.hosts.map(item => item.id)); let pending = false;
    for (const name of names.sort()) {
      if (/\.json\.[a-f0-9]{24}\.tmp$/u.test(name)) { pending = true; continue; }
      check(/^(?:plan|host|seal|intent|spawn|entry|exit|close|error)-[a-f0-9]{32}(?:-[a-f0-9]{32})?\.json$/u.test(name), 'NAME');
      const record = bound.readBoundFileRecord(path.join(data.binding.path, name), {
        io: ctx.io, directory: { ...data.binding, io: ctx.io }, minimum: 1, maximum: limits.leafBytes, checkCtime: true });
      const previous = data.records.get(name);
      check(!previous || JSON.stringify(previous) === JSON.stringify(record.identity), 'RECORD_CHANGED');
      data.records.set(name, record.identity);
      const row = validate(JSON.parse(record.bytes.toString('utf8')), name); check(hosts.has(row.host), 'UNREGISTERED_HOST');
      check(row.type !== 'error', 'WORKER_ERROR'); rows.set(name, row);
    }
    for (const name of data.records.keys()) check(rows.has(name), 'RECORD_DISAPPEARED');
    for (const generation of data.hosts) check(rows.has(`plan-${generation.id}.json`), 'PLAN_MISSING');
    bound.assertDirectory(data.binding); bound.assertDirectory(data.original); within(ctx);
    const intents = [...rows.values()].filter(row => row.type === 'intent');
    check(intents.length <= limits.workers && new Set(intents.map(row => row.id)).size === intents.length, 'WORKER_BUDGET');
    for (const row of rows.values()) if (row.id) check(intents.some(item => item.host === row.host && item.id === row.id && item.role === row.role), 'ORPHAN_RECORD');
    return { rows, intents, pending, signature: names.join('\n') };
  }
  const get = (snapshot, type, host, id) => snapshot.rows.get(`${type}-${host}${id ? `-${id}` : ''}.json`);
  function generationFor(data, host) { const generation = data.hosts.find(item => item.child === host); check(generation && pid(generation.pid) && !generation.error, 'HOST_ATTACH'); return generation; }
  function completeWorkers(snap, generation, ctx) {
    const entry = get(snap, 'host', generation.id); if (!entry) return false;
    check(entry.pid === generation.pid, 'HOST_PID');
    let ready = !snap.pending;
    for (const intent of snap.intents.filter(row => row.host === generation.id)) {
      const rows = ['spawn', 'entry', 'exit', 'close'].map(type => get(snap, type, generation.id, intent.id));
      if (rows.some(row => !row)) { ready = false; continue; }
      const [spawn, , exit, close] = rows;
      check(rows.every(row => row.role === intent.role && row.pid === spawn.pid), 'WORKER_PID');
      check(exit.code === 0 && close.code === 0 && close.signal === null, 'WORKER_FAILED');
      // The receipt is emitted only by the original ChildProcess.close event,
      // after that child ended and its stdio closed. A late numeric PID probe
      // can inspect an unrelated reused process; it adds no lifecycle proof.
      within(ctx);
    }
    return ready;
  }
  async function drain(scope, host, { timeout = 22000 } = {}) {
    const data = state(scope), generation = generationFor(data, host), ctx = context(timeout); let previous;
    for (;;) {
      within(ctx); check(!generation.closed, 'HOST_CLOSED_BEFORE_DRAIN');
      const snap = snapshot(data, ctx); check(!get(snap, 'seal', generation.id), 'HOST_SEALED_BEFORE_DRAIN');
      const ready = completeWorkers(snap, generation, ctx);
      if (ready && snap.signature === previous) {
        within(ctx); generation.drained = snap.intents.filter(row => row.host === generation.id).map(row => row.id).sort();
        return { workers: generation.drained.length, readBytes: ctx.readBytes };
      }
      previous = ready ? snap.signature : undefined;
      within(ctx); await clock.sleep(Math.min(25, ctx.deadline - clock.now())); within(ctx);
    }
  }
  function prove(data, generations, requireWorker) {
    const ctx = context(), snap = snapshot(data, ctx); check(!snap.pending && generations.length > 0, 'INCOMPLETE');
    for (const generation of generations) {
      check(generation.child && pid(generation.pid) && !generation.error && generation.closed?.code === 0 && generation.closed.signal === null, 'HOST_NOT_CLOSED');
      const seal = get(snap, 'seal', generation.id);
      check(seal?.pid === generation.pid && Array.isArray(generation.drained), 'SEAL');
      check(seal.observer_failed === false, 'OBSERVER_ERROR');
      const intents = snap.intents.filter(row => row.host === generation.id).map(({ id, role }) => ({ id, role })).sort((a, b) => a.id.localeCompare(b.id));
      check(JSON.stringify(seal.workers) === JSON.stringify(intents) && JSON.stringify(intents.map(row => row.id)) === JSON.stringify(generation.drained), 'CENSUS');
      check(completeWorkers(snap, generation, ctx), 'INCOMPLETE');
    }
    check(!requireWorker || snap.intents.length > 0, 'EMPTY'); within(ctx);
    return { hosts: generations.length, workers: snap.intents.length, readBytes: ctx.readBytes };
  }
  function assertClosedGeneration(scope, host) { const data = state(scope); return prove(data, [generationFor(data, host)], false); }
  function assertAllClosed(scope) { const data = state(scope); return prove(data, data.hosts, true); }
  return { createScope, planHost, attachHost, drain, assertClosedGeneration, assertAllClosed };
}

async function collectTeardown(options) {
  const { checks, remove, preserve } = options;
  // catch can receive undefined, null or false. Presence, not truthiness/value,
  // decides whether the scenario failed. Integration supplies primary ONLY in
  // a real catch, even if that caught value itself is undefined.
  const hasPrimary = Object.hasOwn(options, 'primary'), primary = options.primary;
  const errors = hasPrimary ? [primary] : [];
  for (const checkEnd of checks) { try { await checkEnd(); } catch (error) { errors.push(error); } }
  if (!errors.length) { try { await remove(); } catch (error) { errors.push(error); } }
  if (errors.length) {
    try { await preserve(); } catch (error) { errors.push(error); }
    if (errors.length === 1) throw errors[0];
    throw new AggregateError(errors, 'SIDECAR_SCENARIO_AND_TEARDOWN_FAILED', hasPrimary ? { cause: primary } : undefined);
  }
}
module.exports = { ...makeObserver(), makeObserver, installObserver, collectTeardown, CAPS };
if (process.env[`${PREFIX}PIN`] !== undefined) installObserver();
