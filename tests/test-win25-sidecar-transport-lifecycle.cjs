'use strict';
// QA-only actual-source cuts. No package extraction, native process or product execution.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const { EventEmitter } = require('events');
const assert = require('assert/strict');
const { firstFailure, ownChild, within } = require('./helpers/qa-parent-lifecycle.cjs');

function cut(source, begin, end) {
  const start = source.indexOf(begin), finish = source.indexOf(end, start);
  assert.ok(start >= 0 && start === source.lastIndexOf(begin) && finish > start, 'ACTUAL_SOURCE_CUT_MISSING_OR_AMBIGUOUS');
  return source.slice(start, finish);
}
function packet(value) {
  const body = Buffer.from(JSON.stringify(value)), head = Buffer.alloc(4);
  head.writeUInt32BE(body.length); return Buffer.concat([head, body]);
}
async function settle(promise) {
  try { return { failed: false, value: await promise }; }
  catch (error) { return { failed: true, error }; }
}
const tick = () => new Promise(resolve => setImmediate(resolve));

// source is supplied unchanged, so an exact historical parent can use the same model.
// Pure model timers are capped at 40ms; no statement about a real package's wall budget.
async function runModel({ kind, source, scenario = 'healthy' }) {
  assert.ok(kind === 'corpus' || kind === 'fast');
  const healthy = scenario === 'healthy' || scenario.startsWith('idle-');
  const cause = Object.assign(Error('MODEL_' + scenario), { code: scenario });
  const streamCause = Error('MODEL_PARTIAL_PIPE_STREAM_FIRST');
  const emitted = scenario === 'falsy-undefined' ? undefined : scenario === 'falsy-zero' ? 0 : cause;
  const child = new EventEmitter(), streams = {}, reads = [], unhandled = [], writes = [], timers = new Set();
  let lastReply, observedError = false, kills = 0;
  child.exitCode = null; child.signalCode = null;
  const safeEmit = (target, name, value) => {
    try { target.emit(name, value); } catch (error) { unhandled.push(error); }
  };
  child.kill = () => { kills++; child.emit('close', null, 'SIGTERM'); return true; };
  for (const name of ['stdin', 'stdout', 'stderr']) {
    streams[name] = new EventEmitter();
    Object.defineProperty(child, name, { get() {
      reads.push({ name, error: child.listenerCount('error'), close: child.listenerCount('close') });
      if (scenario === 'EMFILE' || scenario === 'ENFILE' || (scenario === 'partial' && name === 'stdin')) return null;
      return streams[name];
    } });
  }
  streams.stdin.write = (bytes, callback) => {
    assert.ok(Buffer.isBuffer(bytes)); assert.equal(bytes.readUInt32BE(0), bytes.length - 4);
    const request = JSON.parse(bytes.subarray(4));
    assert.equal(request.schema, 'datasecure-standalone-private-ipc/1');
    assert.match(request.request_id, /^[a-f0-9]{16}$/u); assert.equal(request.action, 'get_public_state');
    writes.push(request);
    if (healthy) queueMicrotask(() => {
      lastReply = { schema: 'datasecure-standalone-private-response/1', request_id: request.request_id,
        ok: true, result: { product_channel: 'standalone' } };
      streams.stdout.emit('data', packet(lastReply));
      if (callback) callback(null);
    });
    return true;
  };
  const processModel = { exitCode: 0, stderr: { write() {} } };
  const context = {
    assert, Buffer, path, Error, firstFailure, ownChild,
    within: (promise, ms, code) => within(promise, Math.min(ms, 40), code),
    process: processModel, install: 'MODEL-INSTALL', runtime: 'MODEL-RUNTIME', sidecarDirectory: 'MODEL-SIDECAR',
    environment: {}, desktopErrorCode: () => 'MODEL_PUBLIC_ERROR',
    setTimeout(fn, ms) { const timer = setTimeout(() => { timers.delete(timer); fn(); }, Math.min(ms, 40)); timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); clearTimeout(timer); },
    childProcess: { spawn() {
      if (!healthy) Promise.resolve().then(() => process.nextTick(() => {
        if (scenario === 'partial') safeEmit(streams.stderr, 'error', streamCause);
        observedError = true; safeEmit(child, 'error', emitted);
      }));
      return child;
    } }
  };
  const state = `({
    failed: typeof failure !== 'undefined' && failure.failed,
    error: typeof failure !== 'undefined' ? failure.value : undefined,
    closed: typeof owned !== 'undefined' && owned ? owned.closed : typeof closed !== 'undefined' && closed
  })`;
  let actual;
  if (kind === 'corpus') {
    actual = cut(source, 'let child', '\nfunction relativeFiles(') +
      '\nasync function start() {\n' +
      cut(source, '  child = childProcess.spawn(runtime,', "\n\n  assert.equal((await request('get_public_state')).ok, true);") +
      '\nreturn request;\n}\nlet caller;\n' +
      `({ start: async () => { caller = await start(); }, request: (...args) => caller(...args), state: () => ${state} })`;
  } else {
    actual = cut(source, '  let child', '  try {\n    fs.mkdirSync(install)') +
      `\n({ start: () => launch({}), request: (...args) => request(...args), state: () => ${state} })`;
  }
  const api = vm.runInNewContext("'use strict';\n" + actual, context, { filename: 'actual-' + kind + '-transport-cut.cjs', timeout: 1000 });
  try {
    let outcome = await settle(api.start());
    if (!outcome.failed && kind === 'corpus') outcome = await settle(api.request('get_public_state'));
    await tick(); // Includes nextTick scheduled after the spawn's Promise continuation.
    if (scenario.startsWith('falsy-')) safeEmit(child, 'error', cause); // Must not replace the first falsy cause.
    const beforeClose = api.state();
    if (scenario.startsWith('idle-')) {
      assert.equal(kind, 'corpus'); assert.equal(outcome.failed, false); assert.equal(writes.length, 1);
      assert.ok(lastReply, 'VALID_RESPONSE_CONTROL_REQUIRED');
      const before = writes.length;
      streams.stdout.emit('data', packet(scenario === 'idle-duplicate' ? lastReply : { ...lastReply, request_id: 'ffffffffffffffff' }));
      const refusal = await settle(api.request('get_public_state'));
      child.exitCode = 0; child.emit('close', 0, null);
      return { healthy: outcome, refusal, additionalWrites: writes.length - before, unhandled,
        sourceSha256: crypto.createHash('sha256').update(source).digest('hex') };
    }
    if (scenario === 'healthy') {
      child.emit('exit', 0, null);
      const exitOnly = api.state().closed;
      child.exitCode = 0; child.emit('close', 0, null);
      return { outcome, reads, unhandled, writes, exitOnly, afterClose: api.state(), kills,
        sourceSha256: crypto.createHash('sha256').update(source).digest('hex') };
    }
    child.emit('close', null, null); // Explicit owned close; error was never used as a close receipt.
    return { outcome, reads, unhandled, writes, beforeClose, afterClose: api.state(), observedError,
      cause, streamCause, emitted, kills, sourceSha256: crypto.createHash('sha256').update(source).digest('hex') };
  } finally {
    for (const timer of timers) clearTimeout(timer);
  }
}

async function main() {
  const { createSuite } = require('./helpers.js');
  const { testAsync, done } = createSuite('WIN25 actual sidecar transport source counters');
  const sources = {
    corpus: fs.readFileSync(path.join(__dirname, 'manual/standalone-package-corpus.mjs'), 'utf8'),
    fast: fs.readFileSync(path.join(__dirname, 'manual/standalone-packaged-fast-content-oracle.mjs'), 'utf8')
  };
  for (const kind of ['corpus', 'fast']) {
    await testAsync(kind + ': healthy actual caller responds; exit alone is not close', async () => {
      const m = await runModel({ kind, source: sources[kind] });
      assert.equal(m.outcome.failed, false); assert.equal(m.writes.length, 1);
      assert.equal(m.exitOnly, false); assert.equal(m.afterClose.closed, true); assert.equal(m.unhandled.length, 0); assert.equal(m.kills, 0);
    });
  }
  for (const duplicate of [false, true]) {
    await testAsync('corpus: valid idle ' + (duplicate ? 'duplicate' : 'foreign') + ' response permanently refuses the next write', async () => {
      const m = await runModel({ kind: 'corpus', source: sources.corpus, scenario: duplicate ? 'idle-duplicate' : 'idle-foreign' });
      assert.equal(m.healthy.failed, false); assert.equal(m.refusal.failed, true);
      assert.match(String(m.refusal.error?.message), /STANDALONE_CORPUS_RESPONSE_UNEXPECTED/u);
      assert.equal(m.additionalWrites, 0); assert.equal(m.unhandled.length, 0);
    });
  }
  for (const kind of ['corpus', 'fast']) for (const scenario of ['EMFILE', 'ENFILE', 'ENOENT', 'partial', 'falsy-zero', 'falsy-undefined']) {
    await testAsync(kind + ': actual setup preserves ' + scenario + ' and separately observes close', async () => {
      const m = await runModel({ kind, source: sources[kind], scenario });
      assert.equal(m.observedError, true); assert.equal(m.outcome.failed, true);
      assert.equal(m.unhandled.length, 0);
      assert.ok(m.reads.length > 0 && m.reads.every(read => read.error >= 1 && read.close >= 1), 'OWN_ERROR_AND_CLOSE_REQUIRED_BEFORE_EVERY_PIPE_GETTER');
      assert.equal(m.beforeClose.closed, false); assert.equal(m.afterClose.closed, true); assert.equal(m.kills, 0);
      assert.equal(m.beforeClose.failed, true);
      assert.strictEqual(m.beforeClose.error, scenario === 'partial' ? m.streamCause : m.emitted);
      if (scenario === 'partial') assert.ok(m.outcome.error === m.cause || m.outcome.error === m.streamCause, 'NO_SETUP_TYPEERROR_SUBSTITUTE');
      else assert.strictEqual(m.outcome.error, m.emitted);
      if (scenario === 'EMFILE' || scenario === 'ENFILE' || scenario === 'partial') assert.equal(m.writes.length, 0);
      else assert.equal(m.writes.length, 1);
    });
  }
  await done();
}
module.exports = { runModel };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
