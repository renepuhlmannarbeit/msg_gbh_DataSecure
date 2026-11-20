'use strict';
// Actual B3 QA caller countermodels, adopted by Main 2026-10-29.
// Runtime results are separate receipts; these are controlled source models.
// Authoring baselines (not runtime hash assertions, so future actual bodies are tested):
// tests/test-native-launcher.js f7806a609d5ca0d77a3d5ea29e884f053c5172b84bb65c7b44c55cef320214db
// tests/test-batch-processing-purpose.js 99064965fcc1ec626920c3a2dad92642180d4201df9480fd170964b898113f72
// tests/test-standalone-native-export.js 7ba1d609cb9833deaab4b9289e711f8ddcf79d6db87731590d5aabc570b89f67
// tests/test-standalone-pause.js acd1d155859237c4efe1b648ac1f448350615776f0d253c6d5bb0e383f91462a
// tests/helpers/qa-parent-lifecycle.cjs eeac0bd4ee767dfda7ecbaad1a4818c09cdb7b4535cd6c4d5c46a224eaa52266
// tests/lib/native-export-test-lifecycle.cjs f72691b1abc0b0724cec61194f8d66fc4b8c08d37a42948b50c60d960f020db5
// References: actual-body models in test-batch-session-lifecycle.js (fa521b56...)
// and test-qa-reservation-stage-lifecycle.js (ad217f24...). No copied parent predicate.
//
// Scope: controlled EventEmitters and in-memory IO; no child processes or product
// imports, real roots, Cargo, native launcher, Rust reply fabrication or OS kills.
// Actual QA helper functions, caller bodies, callbacks and finalizers run in VM.
// NativeExport composes the unchanged actual main prefix and finalizer around one
// explicit scenario-body seam: ONLY its inner run() declaration is omitted.
// At the authoring pin: consume 1..277 + 707..764; exclude scenario run 278..706.
// The new exact test-only harness-Err arming stays verbatim in the prefix; the
// original four protocol-negative callsites stay in the omitted real scenario.
// The unchanged "body = run()" calls a controlled Promise, never a fake Rust or
// product-success scenario. Native models deliberately fail; no synthetic
// NativeExport positive is built. The separately real full Rust positive and its
// four correctly armed protocol negatives remain their own evidence (Main's
// current FinalFixes6 result); this file neither replaces nor re-labels them.
// No full CLI/descendant/writer join, native success or compatible old-Before run
// is claimed. A missing source marker/API is a harness failure, never causal proof.
// The timer model retains original requested budgets but fires deadlines explicitly;
// a separate real 2000ms guard fails an unresolved async model. It is not a
// CPU-bound-code watchdog; VM setup has its own 1000ms evaluation timeout.
// No product or parent budget is widened.
// This file is intentionally NOT a new shared lifecycle/supervisor abstraction.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { inspect } = require('node:util');
const repository = path.resolve(process.cwd()), testRoot = path.join(repository, 'tests');
const { createSuite } = require(path.join(testRoot, 'helpers.js'));
const { testAsync, done, assert } = createSuite('B3 actual QA parent lifecycle countermodels');
const read = name => fs.readFileSync(path.join(testRoot, name), 'utf8');
const sources = {
  launcher: read('test-native-launcher.js'), purpose: read('test-batch-processing-purpose.js'),
  native: read('test-standalone-native-export.js'), pause: read('test-standalone-pause.js')
};
const qaHelper = read('helpers/qa-parent-lifecycle.cjs');
const nativeHelper = read('lib/native-export-test-lifecycle.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function turns() { await tick(); await tick(); await tick(); }
async function attempt(action) {
  try { return { threw: false, value: await action() }; }
  catch (error) { return { threw: true, error }; }
}
function boundary(source, marker) {
  const at = source.indexOf(marker);
  assert.ok(at >= 0 && at === source.lastIndexOf(marker), 'unique actual source boundary: ' + marker);
  return at;
}
function slice(source, begin, end) {
  const start = boundary(source, begin), finish = source.indexOf(end, start + begin.length);
  assert.ok(finish > start, 'actual source end boundary: ' + end);
  return source.slice(start, finish);
}
async function guarded(model, action) {
  let guard;
  try {
    return await Promise.race([Promise.resolve().then(() => action(model)), new Promise((_, reject) => {
      guard = setTimeout(() => reject(new Error('B3_MODEL_SELF_DEADLINE')), 2000);
    })]);
  } finally { clearTimeout(guard); model.dispose(); }
}

// Closed local model plumbing; every error/close witness comes from the REAL QA helpers.
function model(plan = {}) {
  const timers = new Map(), immediates = new Set(), events = [], unhandled = [], setup = [];
  const diagnostics = [], exits = [], cli = [], children = [], writes = [], removals = [];
  const lineReaders = [];
  let serial = 0, now = 0, disposed = false, bodyCalls = 0, nativeAccepts = 0, spawnCalls = 0, bodyReject;
  const body = new Promise((_resolve, reject) => { bodyReject = reject; });
  void body.catch(() => {}); // Observe the controlled seam even if setup fails first.
  const virtualTemp = path.join(testRoot, 'QA-B3-VIRTUAL-NO-IO');
  const virtualRoot = path.join(virtualTemp, 'datasecure-purpose-owned-model');
  const set = (callback, milliseconds, ...args) => {
    const id = ++serial; timers.set(id, { callback: () => callback(...args), milliseconds, due: now + milliseconds }); return id;
  };
  const clear = id => { timers.delete(id); };
  const deliver = action => { if (!disposed) { try { action(); } catch (error) { unhandled.push(error); } } };
  const schedule = action => {
    let handle; handle = setImmediate(() => { immediates.delete(handle); deliver(action); });
    immediates.add(handle);
  };
  const fakeProcess = {
    env: {}, platform: 'win32', execPath: 'QA-NODE-NO-EXECUTION', pid: 4242,
    argv: ['QA-NODE', 'QA-PARENT'], exit: code => exits.push(code),
    kill(pid, signal) {
      assert.strictEqual(pid, 1011); assert.strictEqual(signal, 0);
      events.push('worker-probe');
      throw plan.probeError || Object.assign(new Error('modeled worker absent'), { code: 'ESRCH' });
    }
  };
  const io = {
    realpathSync: Object.assign(file => file, { native: file => file }),
    mkdtempSync: () => { events.push('root-acquire'); return virtualRoot; },
    mkdirSync: () => events.push('mkdir'), readdirSync: () => [],
    rmdirSync: file => removals.push(file), unlinkSync: file => removals.push(file),
    rmSync: file => removals.push(file),
    writeFileSync(file, bytes, options) {
      assert.ok(file.endsWith('NATIVE-ADMISSION-DIAGNOSTIC.json'));
      assert.strictEqual(options.flag, 'wx');
      writes.push({ file, value: JSON.parse(String(bytes)) }); events.push('diagnostic');
    }
  };
  const moduleObject = { exports: {} };
  vm.runInNewContext(qaHelper, {
    module: moduleObject, process: fakeProcess, setTimeout: set, clearTimeout: clear,
    require(name) {
      if (name === 'node:assert/strict') return assert;
      if (name === 'node:util') return { inspect };
      if (name === 'node:fs') return { writeSync: (_fd, value) => diagnostics.push(String(value)) };
      throw new Error('UNEXPECTED_QA_HELPER_IMPORT:' + name);
    }
  }, { filename: 'qa-parent-lifecycle.cjs:actual-B3-model', timeout: 1000 });
  const life = { ...moduleObject.exports, endTestCliFailure(result) {
    events.push('CLI-policy'); cli.push(result); return moduleObject.exports.endTestCliFailure(result);
  } };
  const child = () => {
    spawnCalls++;
    assert.strictEqual(children.length, 0, 'one owned direct handle per local model');
    const value = new EventEmitter(), streams = {};
    Object.assign(value, { exitCode: null, signalCode: null, kills: 0, closed: false });
    for (const role of ['stdin', 'stdout', 'stderr']) {
      const stream = new EventEmitter(); stream.role = role;
      stream.setEncoding = () => stream;
      stream.destroy = () => {
        events.push(role + '.destroy');
        if (plan.destroyThrows && Object.hasOwn(plan.destroyThrows, role)) throw plan.destroyThrows[role];
      };
      streams[role] = stream;
      Object.defineProperty(value, role, { get() {
        setup.push({ role, error: value.listenerCount('error') > 0, close: value.listenerCount('close') > 0 });
        return plan.nullStdio ? null : stream;
      } });
    }
    value.close = (code, signal = null) => {
      assert.ok(code === null || signal === null, 'valid code/signal baseline, never contradictory close');
      value.closed = true; value.exitCode = code; value.signalCode = signal;
      deliver(() => { value.emit('exit', code, signal); value.emit('close', code, signal); });
    };
    value.error = error => deliver(() => value.emit('error', error));
    value.kill = () => {
      value.kills++; events.push('kill');
      if (Object.hasOwn(plan, 'killThrows')) throw plan.killThrows;
      if (plan.closeOnKill) schedule(() => value.close(null, 'SIGTERM'));
      return plan.killReturns !== false;
    };
    value.unref = () => events.push('child.unref');
    value.send = (message, callback) => {
      events.push('send');
      assert.strictEqual(message.batch_token, 'a'.repeat(64));
      if (Object.hasOwn(plan, 'sendThrows')) throw plan.sendThrows;
      callback?.(null);
      if (plan.rejectFrame) schedule(() => {
        value.emit('message', { type: 'local-intake-rejected', error_code: 'PROCESSING_MODE_INVALID' });
        value.close(2);
      });
    };
    streams.stdin.write = () => { throw new Error('NO_NATIVE_OR_PRODUCT_SUCCESS_FRAME_IS_MODELED'); };
    streams.stdin.end = () => {
      events.push('stdin.end');
      if (Object.hasOwn(plan, 'endThrows')) throw plan.endThrows;
    };
    value.streams = streams; children.push(value);
    if (Object.hasOwn(plan, 'osError')) process.nextTick(() => value.error(plan.osError));
    if (plan.pid) schedule(() => streams.stdout.emit('data', '1011\n'));
    if (Object.hasOwn(plan, 'json')) schedule(() => {
      streams.stdout.emit('data', Buffer.from(plan.json));
      value.close(plan.code === undefined ? 0 : plan.code, plan.signal || null);
    });
    return value;
  };
  const nativeModule = { exports: {} };
  vm.runInNewContext(nativeHelper, {
    module: nativeModule, setTimeout: set, clearTimeout: clear,
    require(name) {
      assert.strictEqual(name, 'node:perf_hooks'); return { performance: { now: () => now } };
    }
  }, { filename: 'native-export-test-lifecycle.cjs:actual-B3-model', timeout: 1000 });
  class NativeChannelBoundary {
    constructor(options) { assert.strictEqual(typeof options.write, 'function'); events.push('channel-construct'); }
    abort() { events.push('channel.abort'); bodyReject(new Error('QA_BODY_ABORTED')); }
    accept() { nativeAccepts++; throw new Error('NO_INVENTED_NATIVE_REPLY_ALLOWED'); }
  }
  const base = {
    __dirname: testRoot, Buffer, process: fakeProcess, assert,
    performance: { now: () => now }, setTimeout: set, clearTimeout: clear,
    ...life, fs: io, path, os: { tmpdir: () => virtualTemp },
    console: { log() {}, error() {} },
    suiteFailure: () => ({ failed: false }), done: async () => {},
    fork: child, spawn: child, childProcess: { spawn: child },
    launcher: 'QA-OWNED-LAUNCHER-NO-EXECUTION', root: virtualRoot,
    run: () => { bodyCalls++; return body; },
    require(name) {
      if (name === 'node:fs') return io;
      if (name === 'node:os') return { tmpdir: () => virtualTemp };
      if (name === 'node:path') return path;
      if (name === 'node:crypto') return require('node:crypto');
      if (name === 'node:assert/strict') return assert;
      if (name === 'node:perf_hooks') return { performance: { now: () => now } };
      if (name === 'node:child_process') return { spawn: child };
      if (name === './helpers/qa-parent-lifecycle.cjs') return life;
      if (name === './lib/native-export-test-lifecycle.cjs') return nativeModule.exports;
      if (name.endsWith('/native-export-channel')) return { NativeExportChannel: NativeChannelBoundary };
      if (name.endsWith('/standalone-document-review-store')) return {
        createDocumentReviewStore() { throw new Error('PRODUCT_SCENARIO_NOT_MODELED'); }
      };
      if (name.endsWith('/result-folder-config')) return Object.freeze({});
      if (name === 'node:readline') return { createInterface({ input }) {
        assert.ok(input && ['stdout', 'stderr'].includes(input.role));
        const lines = new EventEmitter(); lines.role = input.role;
        lines.close = () => {
          events.push('lines.' + lines.role + '.close');
          if (plan.lineCloseThrows && Object.hasOwn(plan.lineCloseThrows, lines.role)) throw plan.lineCloseThrows[lines.role];
        };
        lineReaders.push(lines); return lines;
      } };
      throw new Error('UNEXPECTED_B3_PARENT_IMPORT:' + name);
    }
  };
  const context = vm.createContext(base);
  const evaluate = code => vm.runInContext(code, context, { filename: 'actual-B3-parent-QA-seam', timeout: 1000 });
  return {
    context, evaluate, events, unhandled, setup, timers, children, diagnostics, exits, cli, writes, removals,
    schedule, deliver, body: { reject: bodyReject, calls: () => bodyCalls },
    nativeAccepts: () => nativeAccepts, spawnCount: () => spawnCalls,
    line(role, value) {
      const lines = lineReaders.find(item => item.role === role);
      assert.ok(lines, 'actual parent installed the line callback');
      deliver(() => lines.emit('line', value));
    },
    fireLast(milliseconds) {
      const found = [...timers.entries()].filter(([, value]) => value.milliseconds === milliseconds).at(-1);
      assert.ok(found, 'actual caller is awaiting the expected deadline ' + milliseconds);
      timers.delete(found[0]); now = Math.max(now, found[1].due); deliver(found[1].callback);
    },
    dispose() {
      disposed = true; timers.clear();
      for (const handle of immediates) clearImmediate(handle); immediates.clear();
    }
  };
}

function launcherModel(plan) {
  const m = model(plan), source = sources.launcher;
  m.evaluate(slice(source, 'const launcherChildren = ', '\nconst launcher = '));
  let call;
  m.context.testAsync = (_name, callback) => { assert.strictEqual(call, undefined); call = callback; };
  const registration = slice(source,
    "await testAsync('closing the launcher job handle removes the worker', async () => {", '\nawait done();');
  const loaded = m.evaluate('(async () => {\n' + registration + '\n})()');
  const finish = slice(source, 'await done();\nconst result = suiteFailure();', '\n}\n\nmain().catch(');
  m.run = async () => { await loaded; assert.strictEqual(typeof call, 'function'); return call(); };
  m.finish = () => m.evaluate('(async () => {\n' + finish + '\n})()');
  m.flags = () => m.evaluate('({ failed: launcherFailures.failed, error: launcherFailures.value, unknown: launcherEndUnconfirmed })');
  return m;
}
function purposeModel(plan) {
  const m = model(plan), source = sources.purpose;
  m.evaluate(slice(source, 'const purposeChildren = ', '\nconst digest = ') + '\n' +
    slice(source, 'function removeFixture(root) {', '\nfunction fixture(') + '\n' +
    slice(source, 'async function realWorkerReject(', '\nasync function main() {'));
  const api = m.evaluate('({ realWorkerReject, finishPurposeCli })');
  m.run = () => api.realWorkerReject({ type: 'invalid-purpose-model' }, 'standalone');
  m.finish = () => api.finishPurposeCli();
  m.flags = () => m.evaluate('({ failed: purposeFailures.failed, error: purposeFailures.value, unknown: purposeEndUnconfirmed, retained: [...retainedPurposeRoots] })');
  return m;
}
function pauseModel(plan) {
  const m = model(plan), source = sources.pause;
  m.evaluate(slice(source, 'const restartChildren = ', '\nconst root = ') + '\n' +
    slice(source, 'async function restartJson(', "\ntest('pause intent is durable,"));
  const api = m.evaluate('({ restartJson, finishPauseCli })');
  m.run = () => api.restartJson('QA-PROGRAM-NEVER-EXECUTED', { cwd: repository });
  m.finish = () => api.finishPauseCli();
  m.flags = () => m.evaluate('({ failed: restartFailures.failed, error: restartFailures.value, unknown: restartEndUnconfirmed })');
  return m;
}
function nativeModel(plan) {
  const m = model(plan), source = sources.native;
  const start = boundary(source, '\nasync function run() {');
  const finish = boundary(source, '\n  writeDiagnostic = () => {');
  const entry = boundary(source, '\nmain();');
  assert.ok(start < finish && finish < entry);
  // Omit only the scenario declaration. Every actual setup/line/finally byte remains.
  const composed = source.slice(0, start) + source.slice(finish, entry);
  const api = m.evaluate(composed + '\n({ main });');
  m.run = () => api.main();
  return m;
}
function observedBeforePipes(m) {
  assert.ok(m.setup.length > 0);
  assert.strictEqual(m.spawnCount(), 1, 'external spawn count, including refused extra model spawns');
  assert.ok(m.setup.every(point => point.error && point.close), 'own error/close before pipe getters');
  assert.strictEqual(m.unhandled.length, 0, 'an event throw must not become the expected caller failure');
  assert.strictEqual(m.timers.size, 0, 'actual completed parent stages must clear their remaining model timers');
}
function failureCli(m, primary, unknown) {
  assert.strictEqual(m.cli.length, 1);
  assert.strictEqual(m.cli[0].failed, true); assert.strictEqual(m.cli[0].error, primary);
  assert.strictEqual(m.cli[0].unconfirmedChildren, unknown);
  assert.deepStrictEqual(m.exits, [1]);
  const line = m.diagnostics.find(value => value.startsWith('R6_TEST_CLI_FAILURE:'));
  assert.ok(line);
  const record = JSON.parse(line.slice('R6_TEST_CLI_FAILURE:'.length));
  assert.strictEqual(record.verdict, 'FAILED'); assert.strictEqual(record.writer_join, 'NOT_CLAIMED');
  assert.strictEqual(record.child_end, unknown ? 'UNCONFIRMED' : 'DIRECT_CLOSE_OBSERVED');
}
async function main() {
  await testAsync('launcher actual caller accepts only an ESRCH worker-end observation plus true direct close', () =>
    guarded(launcherModel({ pid: true, closeOnKill: true }), async m => {
      const outcome = await attempt(m.run); assert.strictEqual(outcome.threw, false);
      assert.strictEqual(m.children[0].kills, 1); assert.strictEqual(m.children[0].closed, true);
      assert.strictEqual(m.flags().unknown, false); assert.ok(m.events.includes('worker-probe'));
      await m.finish(); assert.deepStrictEqual(m.exits, []); observedBeforePipes(m);
    }));
  await testAsync('launcher EPERM is the original failure, never evidence of worker disappearance', () => {
    const primary = Object.freeze(Object.assign(new Error('synthetic denied probe'), { code: 'EPERM' }));
    return guarded(launcherModel({ pid: true, probeError: primary, closeOnKill: true }), async m => {
      const outcome = await attempt(m.run);
      assert.strictEqual(outcome.threw, true); assert.strictEqual(outcome.error, primary);
      assert.strictEqual(m.children[0].closed, true); assert.strictEqual(m.flags().unknown, true);
      await m.finish(); failureCli(m, primary, true); observedBeforePipes(m);
    });
  });
  await testAsync('launcher nullstdio nextTick EMFILE survives secondary stop zero and unknown close', () => {
    const primary = Object.freeze(Object.assign(new Error('synthetic spawn'), { code: 'EMFILE' }));
    return guarded(launcherModel({ nullStdio: true, osError: primary, killThrows: 0 }), async m => {
      await Promise.resolve(); const pending = attempt(m.run);
      await turns(); assert.strictEqual(m.children[0].kills, 1);
      m.fireLast(5000); const outcome = await pending;
      assert.strictEqual(outcome.threw, true); assert.strictEqual(outcome.error, primary);
      await m.finish(); failureCli(m, primary, true); observedBeforePipes(m);
    });
  });
  await testAsync('purpose actual valid rejection consumes close2 and permits its real guarded cleanup caller', () =>
    guarded(purposeModel({ rejectFrame: true }), async m => {
      const outcome = await attempt(m.run); assert.strictEqual(outcome.threw, false);
      assert.strictEqual(m.children[0].kills, 0); assert.strictEqual(m.removals.length, 1);
      assert.strictEqual(m.flags().retained.length, 0);
      m.finish(); assert.deepStrictEqual(m.exits, []); observedBeforePipes(m);
    }));
  await testAsync('purpose process error undefined cannot settle actual finally until direct close arrives', () =>
    guarded(purposeModel({ killReturns: false }), async m => {
      let settled = false;
      const pending = attempt(m.run).then(result => { settled = true; return result; });
      await turns(); m.children[0].error(undefined); await turns();
      assert.strictEqual(settled, false, 'error does not fulfill owned.done or finish teardown');
      assert.strictEqual(m.children[0].closed, false); assert.strictEqual(m.children[0].kills, 1);
      assert.strictEqual(m.removals.length, 0);
      m.children[0].close(2); const outcome = await pending;
      assert.strictEqual(outcome.threw, true); assert.strictEqual(outcome.error, undefined);
      assert.strictEqual(m.flags().failed, true); assert.strictEqual(m.removals.length, 0);
      m.finish(); failureCli(m, undefined, false); observedBeforePipes(m);
    }));
  await testAsync('purpose synchronous send false survives stop zero, retains root, blocks future worker', () =>
    guarded(purposeModel({ sendThrows: false, killThrows: 0 }), async m => {
      const pending = attempt(m.run); await turns(); m.fireLast(2000);
      const outcome = await pending;
      assert.strictEqual(outcome.threw, true); assert.strictEqual(outcome.error, false);
      assert.strictEqual(m.flags().unknown, true); assert.strictEqual(m.removals.length, 0);
      const next = await attempt(m.run); assert.strictEqual(next.threw, true);
      assert.strictEqual(m.children.length, 1); assert.strictEqual(m.spawnCount(), 1);
      assert.strictEqual(m.events.filter(value => value === 'root-acquire').length, 1);
      assert.strictEqual(m.children[0].kills, 1);
      m.finish(); failureCli(m, false, true); observedBeforePipes(m);
    }));
  await testAsync('pause actual caller parses valid JSON only after clean direct close', () =>
    guarded(pauseModel({ json: '{"paused":true}' }), async m => {
      const outcome = await attempt(m.run); assert.strictEqual(outcome.threw, false);
      assert.strictEqual(outcome.value.paused, true); assert.strictEqual(m.children[0].closed, true);
      assert.strictEqual(m.children[0].kills, 0);
      m.finish(); assert.deepStrictEqual(m.exits, []); observedBeforePipes(m);
    }));
  for (const item of [
    { title: 'malformed JSON after clean close', json: '{', kind: 'SyntaxError' },
    { title: 'nonzero exit with otherwise valid JSON', json: '{"paused":true}', code: 17, kind: 'AssertionError' },
    // A legal signal close has null code; this does not isolate the second assert.
    { title: 'real signal-shaped close with null code', json: '{"paused":true}', code: null, signal: 'SIGTERM', kind: 'AssertionError' }
  ]) await testAsync('pause actual refusal: ' + item.title, () =>
    guarded(pauseModel(item), async m => {
      const outcome = await attempt(m.run);
      assert.strictEqual(outcome.threw, true); assert.strictEqual(outcome.error.name, item.kind);
      assert.strictEqual(m.children[0].closed, true); assert.strictEqual(m.children[0].kills, 0);
      m.finish(); failureCli(m, outcome.error, false); observedBeforePipes(m);
    }));
  await testAsync('native actual setup/body-failure control reaches finalizer without invented replies', () => {
    const primary = Object.freeze(new Error('explicit QA scenario-boundary refusal'));
    return guarded(nativeModel({ closeOnKill: true }), async m => {
      const pending = attempt(m.run); await turns(); assert.strictEqual(m.body.calls(), 1);
      m.line('stdout', 'ordinary cargo output without a native frame'); m.body.reject(primary);
      const outcome = await pending; assert.strictEqual(outcome.threw, false, 'actual final CLI policy records the failure');
      failureCli(m, primary, false); assert.strictEqual(m.nativeAccepts(), 0);
      assert.strictEqual(m.writes.length, 1); assert.strictEqual(m.writes[0].value.child_close_confirmed, true);
      assert.strictEqual(m.writes[0].value.child_exit_confirmed, true); assert.strictEqual(m.writes[0].value.test_exit_code, 1);
      assert.strictEqual(m.children[0].kills, 1); observedBeforePipes(m);
    });
  });
  await testAsync('native malformed actual line preserves primary and attempts each actual finally stage', () =>
    guarded(nativeModel({ endThrows: 0, killThrows: false, lineCloseThrows: { stderr: null },
      destroyThrows: { stdin: undefined } }), async m => {
      const pending = attempt(m.run); await turns(); assert.strictEqual(m.body.calls(), 1);
      m.line('stdout', 'NATIVE:{'); await turns();
      assert.strictEqual(m.children[0].kills, 1); m.fireLast(180000);
      const outcome = await pending; assert.strictEqual(outcome.threw, false, 'actual test CLI reports failure through its final policy');
      assert.strictEqual(m.cli[0].error.name, 'SyntaxError');
      failureCli(m, m.cli[0].error, true); assert.strictEqual(m.nativeAccepts(), 0);
      for (const stage of ['stdin.end', 'kill', 'lines.stderr.close', 'lines.stdout.close',
        'stdin.destroy', 'stdout.destroy', 'stderr.destroy', 'child.unref', 'diagnostic'])
        assert.ok(m.events.includes(stage) && m.events.indexOf(stage) < m.events.indexOf('CLI-policy'),
          'later teardown attempted before final policy despite earlier fault: ' + stage);
      assert.strictEqual(m.writes.length, 1); assert.strictEqual(m.writes[0].value.child_close_confirmed, false);
      assert.strictEqual(m.writes[0].value.test_exit_code, 1); assert.strictEqual(m.removals.length, 0);
      observedBeforePipes(m);
    }));
  await testAsync('native actual nullstdio setup keeps OS-first and reaches actual unknown-close finalizer', () => {
    const primary = Object.freeze(Object.assign(new Error('synthetic native spawn'), { code: 'EMFILE' }));
    return guarded(nativeModel({ nullStdio: true, osError: primary, killThrows: 0 }), async m => {
      await Promise.resolve(); const pending = attempt(m.run); await turns();
      assert.strictEqual(m.body.calls(), 0, 'no scenario seam entered after missing stdio');
      assert.strictEqual(m.children[0].kills, 1); m.fireLast(180000);
      const outcome = await pending; assert.strictEqual(outcome.threw, false);
      failureCli(m, primary, true); assert.ok(m.events.includes('child.unref'));
      assert.strictEqual(m.writes.length, 0, 'diagnostic writer was not installed before this real setup boundary');
      assert.strictEqual(m.removals.length, 0); observedBeforePipes(m);
    });
  });
  await done();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
