'use strict';

// Whole actual parent source with lexical launch/fs/clock seams. Product worker
// modules are not imported. Modeled closes are never native writer-join proof.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const flush = () => new Promise(resolve => setImmediate(resolve));
const codes = ['DOCUMENT_REVIEW_INVALID', 'DOCUMENT_REVIEW_INVALID', 'DOCUMENT_REVIEW_INVALID',
  'CONTENT_OPTIONS_NOT_READY', 'CONTENT_OPTIONS_INVALID', 'CONTENT_OPTIONS_INVALID',
  'CONTENT_OPTIONS_FORBIDDEN', 'CONTENT_OPTIONS_FORBIDDEN', 'STANDALONE_REVIEW_POLICY_INVALID',
  'STANDALONE_REVIEW_POLICY_INVALID', 'STANDALONE_REVIEW_POLICY_INVALID', 'STANDALONE_REVIEW_POLICY_INVALID',
  'CONTENT_OPTIONS_FORBIDDEN', 'CONTENT_OPTIONS_INVALID', 'CONTENT_OPTIONS_INVALID', 'LOCAL_QUEUE_SCHEMA_INVALID'];

function subject(filename, mode = {}, terminate = false, realRoot) {
  const source = fs.readFileSync(filename, 'utf8'), events = [], children = [], roots = [], failures = [], timers = new Map();
  let launched = 0, timerId = 0, passed = 0, done = false;
  const active = id => id === (mode.at ?? 0);
  const modelFs = {
    mkdtempSync(prefix) {
      const root = realRoot ? fs.mkdtempSync(path.join(realRoot, 'worker-')) : path.resolve(prefix + roots.length);
      roots.push(root); return root;
    },
    existsSync(file) { return realRoot ? fs.existsSync(file) : false; },
    readdirSync(root) { return realRoot ? fs.readdirSync(root) : []; },
    rmdirSync(root) { events.push(['remove', root]); if (realRoot) {
      assert.equal(path.dirname(root), realRoot); fs.rmdirSync(root);
    } },
    rmSync(root) { events.push(['remove', root]); if (realRoot) {
      assert.equal(path.dirname(root), realRoot); fs.rmSync(root, { recursive: true, force: true });
    } },
    writeSync(fd, text) { events.push(['diagnostic', fd, text]); return Buffer.byteLength(text); }
  };
  const close = child => { events.push(['child-close', child.id]); child.emit('close', 2, null); };
  const fork = (_file, _args, options) => {
    const id = launched++;
    if (active(id) && mode.kind === 'fork-throw') throw mode.primary;
    const child = new EventEmitter();
    Object.assign(child, { id, connected: true,
      stdout: options.stdio[1] === 'pipe' ? new EventEmitter() : null,
      stderr: options.stdio[2] === 'pipe' ? new EventEmitter() : null });
    child.kill = signal => {
      events.push(['kill', id, signal]);
      if (active(id) && signal === 'SIGTERM') throw false;
      return false;
    };
    child.send = (request, callback) => {
      events.push(['send', id, typeof callback]);
      if (active(id) && mode.kind === 'send-throw') throw mode.primary;
      setImmediate(() => {
        if (active(id) && mode.kind === 'send-error') {
          if (callback) callback(mode.primary); else child.emit('error', mode.primary);
          return;
        }
        if (callback) callback(null);
        if (active(id) && mode.kind === 'stdout') child.stdout.emit('data', Buffer.from('unexpected'));
        child.emit('message', {
          type: id >= 12 && id <= 14 ? 'local-review-rejected' :
            [6, 11].includes(id) ? 'local-batch-rejected' : 'local-intake-rejected',
          error_code: codes[id]
        });
        events.push(['child-exit', id]); child.emit('exit', 2, null);
        if (!(active(id) && mode.kind === 'late-close')) close(child);
      });
      return true;
    };
    if (active(id) && mode.kind === 'setup-throw') {
      const on = child.stdout.on;
      child.stdout.on = function (event, callback) {
        if (event === 'data') throw mode.primary;
        return on.call(this, event, callback);
      };
    }
    if (active(id) && mode.kind === 'spawn-error') {
      child.stdout = null; child.stderr = null; child.send = undefined; child.connected = false;
    }
    children.push(child); events.push(['fork', id]);
    setImmediate(() => {
      if (active(id) && mode.kind === 'spawn-error') {
        // Record a missing observer without throwing outside the subject seam.
        // The real Node event would be unhandled; the oracle refuses it below.
        if (child.listenerCount('error')) child.emit('error', mode.primary);
        else events.push(['unobserved-error', id]);
      } else child.emit('spawn');
    });
    return child;
  };
  const suite = {
    assert: require('node:assert'),
    async testAsync(name, run) {
      try { await run(); passed++; } catch (value) { failures.push({ name, value }); }
    },
    async done() { done = true; events.push(['suite-done', passed, failures.length]); }
  };
  const localRequire = name => {
    if (name === 'node:fs') return modelFs;
    if (name === 'node:child_process') return { fork };
    if (name === './helpers') return { createSuite: () => suite };
    if (name === './lib/batch-worker-queue-lifecycle-cases.cjs') return async () => {};
    if (['node:os', 'node:path'].includes(name)) return require(name);
    throw Error('QRF_UNEXPECTED_SUBJECT_DEPENDENCY');
  };
  const modelProcess = { env: {}, exitCode: 0,
    exit(code) {
      events.push(['parent-exit', code]);
      if (terminate) {
        fs.writeSync(1, JSON.stringify({ events, failed: failures.length, roots }) + '\n');
        process.exit(code);
      }
    }
  };
  const modelConsole = { log() {}, error() { events.push(['primary-report']); } };
  const completed = new Function('require', 'process', '__dirname', '__filename', 'console', 'setTimeout', 'clearTimeout',
    source + '\nreturn typeof completed === "undefined" ? null : completed;')(
    localRequire, modelProcess, path.dirname(filename), filename, modelConsole,
    (callback, milliseconds) => { const id = ++timerId; timers.set(id, { callback, milliseconds }); return id; },
    id => timers.delete(id));
  const outcome = { settled: false, rejected: false, value: undefined };
  if (completed) completed.then(value => { outcome.settled = true; outcome.value = value; },
    value => { outcome.settled = true; outcome.rejected = true; outcome.value = value; });
  return { children, roots, events, failures, close, outcome, get done() { return done; },
    tick() {
      const next = [...timers].sort((a, b) => a[1].milliseconds - b[1].milliseconds || a[0] - b[0])[0];
      assert.ok(next, 'actual subject must register the next finite deadline');
      timers.delete(next[0]); events.push(['deadline', next[1].milliseconds]); next[1].callback();
    }
  };
}

async function until(model, predicate, label) {
  for (let step = 0; step < 80; step++) { if (predicate()) return; await flush(); }
  assert.fail(label);
}
const noEarlyFinish = model => {
  assert.ok(!model.events.some(event => ['remove', 'parent-exit'].includes(event[0])),
    'exit/error/send failure must not delete evidence or end CLI before actual close/finite teardown');
};
async function complete(model) {
  await until(model, () => model.done, 'whole subject suite did not finish');
  await flush();
}

async function sourceCases(filename) {
  // Compatible positive control: the unchanged before parent receives exit as
  // well as close and completes all original 16 callbacks/oracles.
  const valid = subject(filename); await complete(valid);
  assert.equal(valid.children.length, 16); assert.equal(valid.failures.length, 0);
  assert.equal(valid.events.filter(e => e[0] === 'child-close').length, 16);
  assert.equal(valid.events.filter(e => e[0] === 'remove').length, 16);
  assert.equal(valid.events.filter(e => e[0] === 'kill').length, 0);

  // Causal BEFORE failure does not depend on a new helper export/completed API.
  const late = subject(filename, { kind: 'late-close' });
  await until(late, () => late.events.some(e => e[0] === 'child-exit'), 'no valid refusal exit');
  await flush(); noEarlyFinish(late);
  assert.equal(late.children.length, 1, 'do not advance from exit2 without close');
  late.close(late.children[0]); await complete(late);
  assert.equal(late.failures.length, 0); assert.equal(late.children.length, 16);

  for (const primary of [undefined, null, false, 0, '', Object.freeze(Error('fixed send failure'))]) {
    const failed = subject(filename, { kind: 'send-throw', primary });
    await until(failed, () => failed.events.some(e => e[0] === 'kill'), 'send failure did not enter actual teardown');
    noEarlyFinish(failed); assert.equal(failed.children.length, 1);
    failed.children[0].emit('exit', 2, null); await flush(); noEarlyFinish(failed);
    failed.tick(); await flush(); noEarlyFinish(failed);
    assert.deepEqual(failed.events.filter(e => e[0] === 'kill').map(e => e[2]), ['SIGTERM', 'SIGKILL']);
    failed.close(failed.children[0]); await complete(failed);
    assert.equal(failed.outcome.rejected, true); assert.strictEqual(failed.outcome.value, primary);
    assert.strictEqual(failed.failures[0].value, primary);
    assert.ok(!failed.events.some(e => e[0] === 'remove'));
  }
  for (const mode of [
    { kind: 'send-error', primary: false },
    { kind: 'spawn-error', at: 15, primary: Object.freeze(Object.assign(Error('fixed spawn failure'), { code: 'EMFILE' })) },
    { kind: 'setup-throw', at: 15, primary: undefined }
  ]) {
    const model = subject(filename, mode), id = mode.at ?? 0;
    await until(model, () => model.events.some(e => e[0] === 'kill' && e[1] === id), 'failure did not own its returned handle');
    assert.ok(model.children[id].listenerCount('error') > 0);
    assert.ok(model.children[id].listenerCount('close') > 0);
    assert.ok(!model.events.some(e => e[0] === 'remove' && e[1] === model.roots[id]));
    model.close(model.children[id]); await complete(model);
    assert.equal(model.outcome.rejected, true); assert.strictEqual(model.outcome.value, mode.primary);
    assert.strictEqual(model.failures[0].value, mode.primary);
  }
  const refused = subject(filename, { kind: 'fork-throw', primary: undefined });
  await complete(refused); assert.equal(refused.outcome.rejected, true);
  assert.strictEqual(refused.outcome.value, undefined); assert.strictEqual(refused.failures[0].value, undefined);
  assert.ok(!refused.events.some(e => e[0] === 'remove'));

  const noisy = subject(filename, { kind: 'stdout', at: 15 });
  await complete(noisy); assert.equal(noisy.outcome.rejected, true);
  assert.ok(noisy.failures[0].value instanceof assert.AssertionError);
  assert.ok(!noisy.events.some(e => e[0] === 'remove' && e[1] === noisy.roots[15]));

  const unknown = subject(filename, { kind: 'late-close' });
  await until(unknown, () => unknown.events.some(e => e[0] === 'child-exit'), 'missing valid exit2');
  unknown.tick(); await flush(); unknown.tick(); await flush(); unknown.tick(); await complete(unknown);
  assert.equal(unknown.children.length, 1); assert.equal(unknown.outcome.rejected, true);
  assert.equal(unknown.events.filter(e => e[0] === 'child-close').length, 0);
  assert.deepEqual(unknown.events.filter(e => e[0] === 'kill').map(e => e[2]), ['SIGTERM', 'SIGKILL']);
  assert.ok(!unknown.events.some(e => e[0] === 'remove'));
  assert.deepEqual(unknown.events.at(-1), ['parent-exit', 1]);
}

async function probeMain(filename, realRoot) {
  // Referenced finite fixture guard: even a subject losing its explicit exit
  // cannot leave an intentional endless probe behind. 78 cannot satisfy code1.
  setTimeout(() => { try { fs.writeSync(2, 'QRF_PROBE_SELF_DEADLINE\n'); } catch {} process.exit(78); }, 8000);
  const model = subject(filename, { kind: 'late-close' }, true, realRoot);
  await until(model, () => model.events.some(e => e[0] === 'child-exit'), 'probe lacks valid exit2');
  model.tick(); await flush(); model.tick(); await flush(); model.tick(); await flush();
}

async function cliCase(filename) {
  const realRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-qrf-cli-'));
  fs.writeFileSync(path.join(realRoot, 'EVIDENCE.txt'), 'Synthetic QRF failure evidence; retain for diagnosis.\n', { flag: 'wx' });
  const child = spawn(process.execPath, [__filename, '--probe', filename, realRoot],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let closed = false, code, signal, failed = false, primary, wake, finish;
  const fault = new Promise(resolve => { wake = resolve; });
  const close = new Promise(resolve => { finish = resolve; });
  const fail = value => { if (!failed) { failed = true; primary = value; wake(); } };
  child.on('error', fail);
  child.once('close', (value, reason) => { closed = true; code = value; signal = reason; finish(); });
  let stdout = '', stderr = '';
  const append = kind => chunk => {
    if (kind === 'out') stdout += chunk; else stderr += chunk;
    if (stdout.length + stderr.length > 65536) fail(Error('QRF_PROBE_OUTPUT_LIMIT'));
  };
  if (child.stdout) { child.stdout.on('error', fail); child.stdout.on('data', append('out')); }
  if (child.stderr) { child.stderr.on('error', fail); child.stderr.on('data', append('err')); }
  child.once('spawn', () => { if (!child.stdout || !child.stderr) fail(Error('QRF_PROBE_PIPE_CONTRACT')); });
  let timer;
  try {
    timer = setTimeout(() => fail(Error('QRF_PROBE_TIMEOUT')), 5000);
    await Promise.race([close, fault]);
  } finally { clearTimeout(timer); }
  for (const stop of ['SIGTERM', 'SIGKILL']) {
    if (closed) break;
    try { if (!child.kill(stop)) fail(Error('QRF_PROBE_STOP_NOT_SENT')); } catch (value) { fail(value); }
    try { await Promise.race([close, new Promise(resolve => { timer = setTimeout(resolve, 1000); })]); }
    finally { clearTimeout(timer); }
  }
  if (failed) throw primary;
  assert.equal(closed, true); assert.equal(code, 1, stderr); assert.equal(signal, null);
  const trace = JSON.parse(stdout.trim());
  assert.equal(trace.roots.length, 1);
  assert.equal(path.dirname(trace.roots[0]), realRoot);
  assert.ok(fs.lstatSync(trace.roots[0]).isDirectory(), 'actual source failure keeps its own new real fixture root');
  assert.ok(fs.existsSync(path.join(realRoot, 'EVIDENCE.txt')));
  // Deliberately retain this tiny owned evidence scope, even on a passing oracle.
  assert.equal(trace.events.filter(e => e[0] === 'fork').length, 1);
  assert.equal(trace.events.filter(e => e[0] === 'child-close').length, 0);
  assert.equal(trace.events.filter(e => e[0] === 'remove').length, 0);
  assert.deepEqual(trace.events.filter(e => e[0] === 'kill').map(e => e[2]), ['SIGTERM', 'SIGKILL']);
  assert.deepEqual(trace.events.filter(e => e[0] === 'deadline').map(e => e[1]), [10000, 1000, 1000]);
  const done = trace.events.findIndex(e => e[0] === 'suite-done');
  const diagnosis = trace.events.findIndex(e => e[0] === 'diagnostic');
  assert.ok(done > trace.events.map(e => e[0]).lastIndexOf('deadline'));
  assert.ok(diagnosis > done);
  assert.match(trace.events[diagnosis][2], /direct_child_close=UNCONFIRMED; writer_join=NOT_CLAIMED/u);
  assert.deepEqual(trace.events.at(-1), ['parent-exit', 1]);
}

async function cases(filename) { await sourceCases(filename); await cliCase(filename); }
module.exports = cases;
if (require.main === module) {
  const filename = process.argv[3] || path.join(__dirname, '..', 'test-batch-worker-queue-rejection.js');
  const running = process.argv[2] === '--probe' ? probeMain(filename, process.argv[4]) : cases(filename);
  running.then(() => { if (process.argv[2] !== '--probe') console.log('QRF ACTUAL PARENT LIFECYCLE CASES PASS'); },
    value => { try { console.error(value); } catch {} process.exit(1); });
}
