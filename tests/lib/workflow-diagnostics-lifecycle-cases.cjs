'use strict';

// Engineering source cases: run the whole actual CLI text with lexical launch,
// fs and clock seams. No copied writerOwner implementation, product imports,
// user directories or global fs/process replacement. The final case also
// observes a real probe-process close; its diagnostic writers remain modeled.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const flush = () => new Promise(resolve => setImmediate(resolve));

function startSource(filename, { synchronousFailure, terminate = false } = {}) {
  const source = fs.readFileSync(filename, 'utf8');
  const events = [], children = [], timers = new Map(), errors = [];
  let nextTimer = 0, launches = 0;
  const fakeFs = {
    mkdtempSync: () => path.resolve('synthetic-workflow-diagnostics-root'),
    realpathSync: { native: value => value }, mkdirSync() {},
    rmSync() { events.push(['remove-root']); },
    writeSync(fd, text) { events.push(['diagnostic', fd, text]); return Buffer.byteLength(text); }
  };
  const close = (child, code = 0) => {
    child.emit('exit', code, null);
    events.push(['close', child.id]); child.emit('close', code, null);
  };
  const fakeSpawn = () => {
    const id = launches++;
    if (synchronousFailure && id === 1) throw synchronousFailure.value;
    const child = new EventEmitter();
    Object.assign(child, { id, stdin: null, stdout: null, stderr: null });
    child.kill = signal => { events.push(['kill', id, signal]);
      if (id === 1 && signal === 'SIGTERM') throw false;
      return false;
    };
    children.push(child); events.push(['spawn', id]);
    return child;
  };
  const diagnostic = { _test: {
    workflowDiagnosticDirectory: ({ dataRoot }) => path.join(dataRoot, 'workflow'),
    readWorkflowEvents: () => ['00000001', '00000002', '00000003', '00000004']
      .flatMap(run_id => Array.from({ length: 50 }, () => ({ run_id }))),
    readEvents: () => Array(200).fill({}), diagnosticEventFiles: () => Array(200).fill('event')
  } };
  const localRequire = name => {
    if (name === 'node:fs') return fakeFs;
    if (name === 'node:child_process') return { spawn: fakeSpawn };
    if (name === './lib/workflow-diagnostics-lifecycle-cases.cjs') return async () => {};
    if (name.endsWith('/gateway/workflow-diagnostics') || name.endsWith('/gateway/diagnostics')) return diagnostic;
    if (['node:assert', 'node:os', 'node:path'].includes(name)) return require(name);
    throw new Error('UNEXPECTED_DIAGNOSTIC_PARENT_DEPENDENCY');
  };
  const fakeProcess = {
    execPath: process.execPath,
    exit(code) {
      events.push(['exit', code]);
      if (terminate) {
        // Synchronous bounded fixture output survives the deliberate exit.
        fs.writeSync(1, JSON.stringify({ events, errors }) + '\n');
        process.exit(code);
      }
    }
  };
  const fakeConsole = {
    log(value) { events.push(['log', value]); },
    error(value) { errors.push(value); events.push(['error']); }
  };
  // The suffix observes the optional completion promise without changing any
  // subject body. The unchanged before source has no such local and still
  // runs fully; its causal early-remove/exit oracle fails before this is used.
  const completion = new Function('require', 'process', '__dirname', '__filename', 'console', 'setTimeout', 'clearTimeout',
    source + '\nreturn typeof completed === "undefined" ? null : completed;')(
    localRequire, fakeProcess, path.dirname(filename), filename, fakeConsole,
    (callback, milliseconds) => { const id = ++nextTimer; timers.set(id, { callback, milliseconds }); return id; },
    id => timers.delete(id));
  const outcome = { settled: false, rejected: false, value: undefined };
  if (completion) completion.then(value => { outcome.settled = true; outcome.value = value; },
    value => { outcome.settled = true; outcome.rejected = true; outcome.value = value; });
  return { events, children, errors, close, outcome,
    tick() {
      const next = [...timers].sort((left, right) => left[1].milliseconds - right[1].milliseconds || left[0] - right[0])[0];
      assert.ok(next, 'the actual CLI must register a finite pending deadline');
      timers.delete(next[0]); events.push(['deadline', next[1].milliseconds]); next[1].callback();
    }
  };
}

function noRemovalOrExit(model) {
  assert.ok(!model.events.some(event => event[0] === 'remove-root' || event[0] === 'exit'),
    'the actual CLI must not remove the root or exit before owned close/finite teardown');
}

async function sourceCases(filename) {
  // Positive control works against both the unchanged before file and proposal.
  const success = startSource(filename); await flush();
  assert.equal(success.children.length, 4);
  for (const child of success.children.slice()) success.close(child);
  await flush(); assert.equal(success.children.length, 8);
  for (const child of success.children.slice(4)) success.close(child);
  await flush();
  assert.equal(success.events.filter(event => event[0] === 'remove-root').length, 1);
  assert.ok(success.events.some(event => event[0] === 'log' && event[1].includes('CONCURRENCY PASS')));
  assert.equal(success.events.filter(event => event[0] === 'kill').length, 0);
  assert.equal(success.errors.length, 0);

  for (const primary of [null, false, 0, '', undefined, Object.freeze(Object.assign(new Error('fixed spawn failure'), { code: 'EMFILE' }))]) {
    const model = startSource(filename); await flush();
    assert.equal(model.children.length, 4);
    for (const child of model.children) {
      assert.ok(child.listenerCount('error') > 0, 'observe errors immediately');
    }
    model.events.push(['source-error', 0]); model.children[0].emit('error', primary);
    await flush(); noRemovalOrExit(model);
    for (const child of model.children) assert.ok(child.listenerCount('close') > 0, 'own every handle through actual close');
    assert.deepEqual(model.events.filter(event => event[0] === 'kill').map(event => event.slice(1)),
      [0, 1, 2, 3].map(id => [id, 'SIGTERM']), 'a throwing/refused earlier stop must not skip siblings');
    // Exit is deliberately earlier than close. It grants no root cleanup.
    for (const child of model.children) child.emit('exit', child.id === 0 ? 65 : 0, null);
    await flush(); noRemovalOrExit(model);
    model.tick(); await flush(); noRemovalOrExit(model);
    assert.deepEqual(model.events.filter(event => event[0] === 'kill' && event[2] === 'SIGKILL').map(event => event[1]), [0, 1, 2, 3]);
    for (const child of model.children) model.close(child, child.id === 0 ? 65 : 0);
    await flush();
    assert.equal(model.outcome.rejected, true); assert.strictEqual(model.outcome.value, primary);
    assert.equal(model.events.filter(event => event[0] === 'remove-root').length, 0,
      'confirmed direct closes do not discard a failed invocation evidence root');
    const exited = model.events.findIndex(event => event[0] === 'exit');
    assert.ok(exited > model.events.map(event => event[0]).lastIndexOf('close'));
    assert.equal(model.events[exited][1], 1);
    assert.deepEqual(model.events.find(event => event[0] === 'diagnostic'),
      ['diagnostic', 2, 'WORKFLOW AND GENERAL DIAGNOSTICS CONCURRENCY FAILED\n']);
    assert.equal(model.errors.length, 0, 'no raw primary diagnostic is sent');
  }

  // A synchronous second spawn refusal still leaves the first returned handle
  // owned. Falsy throws are not converted into an empty successful group.
  const refused = startSource(filename, { synchronousFailure: { value: undefined } }); await flush();
  assert.equal(refused.children.length, 1); noRemovalOrExit(refused);
  assert.equal(refused.children[0].listenerCount('close'), 1);
  refused.close(refused.children[0]); await flush();
  assert.equal(refused.outcome.rejected, true); assert.strictEqual(refused.outcome.value, undefined);
  assert.equal(refused.events.filter(event => event[0] === 'remove-root').length, 0);
  assert.ok(refused.events.some(event => event[0] === 'exit' && event[1] === 1));
}

async function probeMain(filename) {
  // A real referenced handle makes exitCode/unref-only fixes insufficient.
  // Only the actual source's post-teardown process.exit can end this probe.
  // Real, referenced and independent of the subject's modeled clock. Even a
  // broken subject plus refused outer termination cannot create an endless probe.
  setTimeout(() => {
    try { fs.writeSync(2, 'DIAGNOSTIC_LIFECYCLE_PROBE_SELF_DEADLINE\n'); } catch {}
    process.exit(78);
  }, 8000);
  const model = startSource(filename, { terminate: true }); await flush();
  model.events.push(['source-error', 0]); model.children[0].emit('error', null);
  await flush();
  for (const child of model.children.slice(0, 3)) model.close(child, child.id === 0 ? 65 : 0);
  await flush(); model.tick(); await flush(); model.tick(); await flush();
}

async function cliCase(filename) {
  // This observer owns only its directly returned probe handle. It does not
  // search processes or infer close from a kill, error, exit or timeout.
  const child = spawn(process.execPath, [__filename, '--probe', filename],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let isClosed = false, code, signal, failed = false, primary, wakeFailure, resolveClose;
  const failure = new Promise(resolve => { wakeFailure = resolve; });
  const close = new Promise(resolve => { resolveClose = resolve; });
  const fail = value => { if (!failed) { failed = true; primary = value; wakeFailure(); } };
  child.on('error', fail);
  child.once('close', (value, reason) => { isClosed = true; code = value; signal = reason; resolveClose(); });
  let stdout = '', stderr = '';
  const collect = kind => chunk => {
    if (kind === 'stdout') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8');
    if (stdout.length + stderr.length > 65536) fail(new Error('LIFECYCLE_PROBE_OUTPUT_LIMIT'));
  };
  // EMFILE/ENFILE may return a child with null stdio. Keep the actual error and
  // close observers; do not manufacture a TypeError by assuming pipe objects.
  if (child.stdout) { child.stdout.on('error', fail); child.stdout.on('data', collect('stdout')); }
  if (child.stderr) { child.stderr.on('error', fail); child.stderr.on('data', collect('stderr')); }
  child.once('spawn', () => { if (!child.stdout || !child.stderr) fail(new Error('LIFECYCLE_PROBE_PIPE_CONTRACT')); });
  let timer;
  try {
    timer = setTimeout(() => fail(new Error('LIFECYCLE_PROBE_TIMEOUT')), 5000);
    await Promise.race([close, failure]);
  } finally { clearTimeout(timer); }
  for (const stop of ['SIGTERM', 'SIGKILL']) {
    if (isClosed) break;
    try { if (!child.kill(stop)) fail(new Error('LIFECYCLE_PROBE_STOP_NOT_SENT')); } catch (value) { fail(value); }
    try {
      await Promise.race([close, new Promise(resolve => { timer = setTimeout(resolve, 1000); })]);
    } finally { clearTimeout(timer); }
  }
  if (failed) throw primary;
  assert.ok(isClosed, 'probe close remains unconfirmed after finite own cleanup');
  assert.equal(signal, null); assert.equal(code, 1, stderr);
  const result = JSON.parse(stdout.trim());
  assert.deepEqual(result.errors, [], 'the source does not send raw primary contents through diagnostics');
  assert.deepEqual(result.events.find(event => event[0] === 'diagnostic'),
    ['diagnostic', 2, 'WORKFLOW AND GENERAL DIAGNOSTICS CONCURRENCY FAILED\n']);
  assert.equal(result.events.filter(event => event[0] === 'close').length, 3);
  assert.equal(result.events.filter(event => event[0] === 'remove-root').length, 0,
    'a writer without close retains the synthetic root');
  assert.deepEqual(result.events.filter(event => event[0] === 'kill' && event[2] === 'SIGTERM').map(event => event[1]), [0, 1, 2, 3]);
  assert.deepEqual(result.events.filter(event => event[0] === 'kill' && event[2] === 'SIGKILL').map(event => event[1]), [3]);
  assert.equal(result.events.filter(event => event[0] === 'deadline').length, 2);
  assert.deepEqual(result.events.at(-1), ['exit', 1]);
}

async function cases(filename) { await sourceCases(filename); await cliCase(filename); }
module.exports = cases;
if (require.main === module) {
  const filename = process.argv[3] || path.join(__dirname, '..', 'test-workflow-diagnostics-concurrency.js');
  const running = process.argv[2] === '--probe' ? probeMain(filename) : cases(filename);
  running.then(() => {
    if (process.argv[2] !== '--probe') console.log('WORKFLOW DIAGNOSTIC PARENT LIFECYCLE CASES PASS');
  }, value => { console.error(value); process.exit(1); });
}
