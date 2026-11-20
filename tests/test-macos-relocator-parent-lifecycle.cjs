'use strict';
// Actual Mac QA race caller with in-memory direct-child/FS seams.
// No Mac binary, real child, OS kill, IO cleanup or native acceptance is claimed.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
const assert = require('node:assert/strict');
const { createSuite } = require('./helpers');
const { firstFailure, ownChild, within } = require('./helpers/qa-parent-lifecycle.cjs');
const actualSource = fs.readFileSync(path.join(__dirname, 'manual/standalone-macos-relocator-native.mjs'), 'utf8');
function raceBody(source) {
  const start = source.indexOf('async function race(role) {'), end = source.indexOf('\nconst normal = fixture();', start);
  assert.ok(start >= 0 && start === source.lastIndexOf('async function race(role) {') && end > start);
  return source.slice(start, end);
}
async function runModel(source, plan = {}) {
  const primary = Object.freeze(Object.assign(Error('CONTROLLED_CHILD_ERROR'), { code: 'EMFILE' }));
  const value = { scope: 'QA-VIRTUAL-ROOT', app: 'QA-VIRTUAL-ROOT/Fixture.app', contents: 'QA-VIRTUAL-ROOT/Contents',
    server: 'QA-VIRTUAL-ROOT/server', outside: 'QA-VIRTUAL-ROOT/outside' };
  const child = new EventEmitter(), streams = {};
  let removes = 0, renames = 0;
  const cli = [], timers = new Set(), immediates = new Set(), budgets = [], setup = [], unhandled = [];
  child.exitCode = null; child.signalCode = null; child.kills = 0; child.closed = false;
  const later = action => {
    let handle; handle = setImmediate(() => { immediates.delete(handle);
      try { action(); } catch (error) { unhandled.push(error); } });
    immediates.add(handle);
  };
  const timer = (action, milliseconds) => {
    budgets.push(milliseconds); let handle;
    handle = setTimeout(() => { timers.delete(handle); action(); }, Math.min(milliseconds, 20));
    timers.add(handle); return handle;
  };
  const clear = handle => { timers.delete(handle); clearTimeout(handle); };
  const close = code => {
    child.closed = true; child.exitCode = code;
    child.emit('exit', code, null); child.emit('close', code, null);
  };
  for (const name of ['stdin', 'stdout', 'stderr']) {
    streams[name] = new EventEmitter();
    Object.defineProperty(child, name, { get() {
      setup.push({ error: child.listenerCount('error') > 0, close: child.listenerCount('close') > 0 });
      return plan.nullStdio ? null : streams[name];
    } });
  }
  child.kill = () => {
    child.kills++;
    if (plan.killThrows) throw 0;
    if (plan.noClose) return false;
    later(() => close(65)); return true;
  };
  streams.stdin.end = (_bytes, callback) => {
    assert.equal(_bytes, 'g', 'the real caller must send the fixed resume marker');
    if (plan.endThrows) throw false;
    if (plan.endCallbackError) {
      callback?.(primary);
      streams.stderr.emit('data', Buffer.from('MACOS_RELOCATOR_FAILED\n'));
      close(65); return;
    }
    callback?.(null);
    later(() => {
      if (plan.errorAfterReady) {
        child.emit('error', primary);
        if (plan.errorThenClose) close(65);
      } else if (plan.exitOnly) {
        child.exitCode = 65; child.emit('exit', 65, null);
      } else {
        streams.stderr.emit('data', Buffer.from('MACOS_RELOCATOR_FAILED\n'));
        close(plan.code ?? 65);
      }
    });
  };
  const context = { assert, Buffer, path, firstFailure, ownChild,
    within: (promise, milliseconds, code) => { budgets.push(milliseconds); return within(promise, Math.min(milliseconds, 20), code); },
    setTimeout: timer, clearTimeout: clear,
    fixture: () => value, outsideSnapshot: () => ['untouched outside bytes and modes'],
    planMacNativeRelocation: () => ({}), nativeRelocationArguments: () => [],
    testHelper: 'QA-NOT-EXECUTED', target: 'macos-arm64', fs: { renameSync() { renames++; }, symlinkSync() {} },
    remove() { removes++; }, process: { stdout: { write() {} } },
    endTestCliFailure: state => cli.push(state), childProcess: { spawn() {
      if (plan.nullStdio) process.nextTick(() => child.emit('error', primary));
      else later(() => streams.stdout.emit('data', Buffer.from(plan.overflow ? 'x'.repeat(65) : 'READY\n')));
      return child;
    } }
  };
  const call = vm.runInNewContext(raceBody(source) + '\nrace;', context, { timeout: 1000 });
  let outcome, guard;
  try {
    outcome = await Promise.race([
      Promise.resolve().then(() => call('destination_parent')).then(
        value => ({ threw: false, value }), error => ({ threw: true, error })),
      new Promise((_, reject) => { guard = setTimeout(() => reject(Error('QA_MODEL_SELF_GUARD')), 2000); })
    ]);
  } finally {
    clearTimeout(guard);
    for (const handle of timers) clearTimeout(handle);
    for (const handle of immediates) clearImmediate(handle);
  }
  assert.equal(unhandled.length, 0, 'an unhandled model event is not the expected refusal');
  return { outcome, primary, removes, renames, cli, child, budgets, setup };
}
async function main() {
  const { testAsync, done } = createSuite('Mac relocator actual QA parent lifecycle models');
  await testAsync('actual valid READY and close65 control permits one cleanup', async () => {
    const m = await runModel(actualSource);
    assert.equal(m.outcome.threw, false); assert.equal(m.removes, 1);
    assert.equal(m.child.closed, true); assert.equal(m.child.kills, 0); assert.equal(m.cli.length, 0);
    assert.ok(m.setup.every(value => value.error && value.close));
  });
  await testAsync('actual stdin callback error stays primary despite a real modeled close65', async () => {
    const m = await runModel(actualSource, { endCallbackError: true });
    assert.equal(m.outcome.threw, true); assert.equal(m.outcome.error, m.primary);
    assert.equal(m.removes, 0); assert.equal(m.child.kills, 0); assert.equal(m.child.closed, true);
    assert.equal(m.cli.length, 1); assert.equal(m.cli[0].error, m.primary);
    assert.equal(m.cli[0].unconfirmedChildren, false);
  });
  await testAsync('actual caller with a changed resume marker is rejected by the model', async () => {
    const needle = "child.stdin.end('g',";
    assert.equal(actualSource.split(needle).length, 2);
    const m = await runModel(actualSource.replace(needle, "child.stdin.end('x',"));
    assert.equal(m.outcome.threw, true); assert.equal(m.outcome.error.code, 'ERR_ASSERTION');
    assert.equal(m.removes, 0); assert.equal(m.cli.length, 1);
  });
  for (const errorThenClose of [false, true]) await testAsync('actual error after READY is not a native refusal or close: ' + errorThenClose, async () => {
    const m = await runModel(actualSource, { errorAfterReady: true, errorThenClose, noClose: true });
    assert.equal(m.outcome.threw, true); assert.equal(m.outcome.error, m.primary); assert.equal(m.removes, 0);
    assert.equal(m.cli.length, 1); assert.equal(m.cli[0].error, m.primary);
    assert.equal(m.cli[0].unconfirmedChildren, !errorThenClose);
    assert.equal(m.child.kills, errorThenClose ? 0 : 1);
  });
  await testAsync('actual nullstdio nextTick OS error stays first without a rename or cleanup', async () => {
    const m = await runModel(actualSource, { nullStdio: true, noClose: true });
    assert.equal(m.outcome.error, m.primary); assert.equal(m.renames, 0); assert.equal(m.removes, 0);
    assert.equal(m.cli[0].unconfirmedChildren, true); assert.equal(m.child.kills, 1);
  });
  await testAsync('actual native success0 cannot pass this refusal oracle', async () => {
    const m = await runModel(actualSource, { code: 0 });
    assert.equal(m.outcome.threw, true); assert.equal(m.outcome.error.code, 'ERR_ASSERTION');
    assert.equal(m.removes, 0); assert.equal(m.cli[0].unconfirmedChildren, false);
  });
  await testAsync('actual oversized hook output is refused and failed evidence retained', async () => {
    const m = await runModel(actualSource, { overflow: true });
    assert.equal(m.outcome.threw, true); assert.equal(m.outcome.error.code, 'ERR_ASSERTION');
    assert.equal(m.renames, 0); assert.equal(m.removes, 0); assert.equal(m.child.kills, 1);
  });
  await testAsync('actual falsy body cause survives secondary kill zero and no close', async () => {
    const m = await runModel(actualSource, { endThrows: true, killThrows: true });
    assert.equal(m.outcome.threw, true); assert.equal(m.outcome.error, false);
    assert.equal(m.cli[0].error, false); assert.equal(m.removes, 0); assert.equal(m.child.kills, 1);
  });
  await testAsync('actual exit65 without close stays unconfirmed without signaling an exited PID', async () => {
    const m = await runModel(actualSource, { exitOnly: true, noClose: true });
    assert.equal(m.outcome.threw, true); assert.equal(m.outcome.error.code, 'MACOS_RELOCATOR_NATIVE_CLOSE_TIMEOUT');
    assert.equal(m.child.kills, 0); assert.equal(m.removes, 0); assert.equal(m.cli[0].unconfirmedChildren, true);
    assert.ok(m.budgets.includes(10000) && m.budgets.includes(2000));
  });
  await done();
}
module.exports = { runModel };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
