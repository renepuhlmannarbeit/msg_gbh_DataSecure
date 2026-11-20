'use strict';
// Source-contract MODELS for Node's EMFILE/ENFILE early return, not resource exhaustion.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), { EventEmitter } = require('node:events');
const { firstFailure, within, ownChild, reviewFrames } = require('./helpers/qa-parent-lifecycle.cjs');
const { finishArtifactCrash } = require('./helpers/artifact-crash-process.cjs');
async function capture(action) { try { return { threw: false, value: await action() }; } catch (value) { return { threw: true, value }; } }
function failedChild(error, absent) {
  const child = new EventEmitter();
  Object.assign(child, { connected: false, stdin: absent ? undefined : null,
    stdout: absent ? undefined : null, stderr: absent ? undefined : null, kill: () => false });
  queueMicrotask(() => { child.emit('error', error); setTimeout(() => child.emit('close', -24, null), 2); });
  return child;
}
function liveChild() {
  const child = new EventEmitter(), signals = [];
  Object.assign(child, { connected: true, stdout: new EventEmitter(), stderr: new EventEmitter(),
    stdin: Object.assign(new EventEmitter(), { write() {}, end() { queueMicrotask(() => child.emit('close', 0, null)); } }),
    send(message, callback) { callback?.(null); if (message.type === 'stop') queueMicrotask(() => child.emit('close', 0, null)); },
    kill(signal) { signals.push(signal); queueMicrotask(() => child.emit('close', null, signal)); return true; } });
  return { child, signals };
}
function slice(file, first, last) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const a = source.indexOf(first), b = source.indexOf(last, a);
  assert.ok(a >= 0 && b > a); return source.slice(a, b);
}
function recovery(spawn) {
  const ownedProcesses = [], campaignFailure = firstFailure();
  const context = vm.createContext({ assert, path, spawn, ownChild, firstFailure, within,
    ownedProcesses, campaignFailure, secondary() {}, __dirname, crate: '/own/crate', repo: '/own/repo',
    helper: 'test-only-pipe-helper', process: { execPath: process.execPath },
    readline: { createInterface({ input }) {
      assert.ok(input, 'actual source must not construct readline with missing stdout');
      return { on(event, callback) { input.on(event, callback); return this; } };
    } }, setTimeout, clearTimeout });
  vm.runInContext(slice('test-standalone-native-export-recovery.js', 'function ownProcess(', 'function copyInventory('),
    context, { timeout: 500 });
  return { methods: vm.runInContext('({ testExecutable, launch })', context), ownedProcesses };
}
(async () => {
  // Valid actual method controls precede the missing-stdio countercases.
  {
    const model = liveChild(), f = recovery(() => model.child);
    const built = f.methods.testExecutable();
    queueMicrotask(() => {
      model.child.stdout.emit('line', JSON.stringify({ reason: 'compiler-artifact', profile: { test: true },
        executable: '/own/fresh-test-binary', target: { name: 'datasecure-standalone' } }));
      model.child.emit('close', 0, null);
    });
    assert.equal(await within(built, 100, 'MODEL_BUILD_UNCONFIRMED'), '/own/fresh-test-binary');
  }
  {
    const models = [liveChild(), liveChild()]; let count = 0;
    const f = recovery(() => models[count++].child);
    const active = f.methods.launch('/own/native', '/own/fixture', 'markdown-only', 'node_intent', 'create');
    const ready = active.wait('fixture'); const expected = { type: 'fixture', descriptor: { own: true } };
    models[1].child.emit('message', expected); assert.equal(await ready, expected);
    const ended = await within(active.stop(false), 100, 'MODEL_STOP_UNCONFIRMED');
    assert.equal(ended.length, 2); assert.ok(ended.every(value => value.code === 0 && value.signal === null));
  }
  {
    const model = liveChild();
    const result = capture(() => finishArtifactCrash(model.child, 'before', { waitMs: 100, closeMs: 100 }));
    queueMicrotask(() => model.child.emit('close', 78, null));
    const refused = await result;
    assert.equal(refused.threw, true); assert.equal(refused.value.code, 'ARTIFACT_WORKER_SELF_DEADLINE_UNCONFIRMED');
  }
  for (const [code, absent] of [['EMFILE', false], ['ENFILE', true]]) {
    const cargoError = Object.assign(Error('actual startup cause'), { code });
    const cargo = recovery(() => failedChild(cargoError, absent));
    const built = await capture(() => cargo.methods.testExecutable());
    assert.equal(built.threw, true); assert.equal(built.value, cargoError);
    await within(Promise.all(cargo.ownedProcesses.map(owned => owned.done)), 100, 'MODEL_CLOSE_UNCONFIRMED');
    for (const badSide of [0, 1]) {
      const error = Object.assign(Error('pair startup cause'), { code }), live = liveChild(); let calls = 0;
      const f = recovery(() => calls++ === badSide ? failedChild(error, absent) : live.child);
      const active = f.methods.launch('/own/native', '/own/fixture', 'markdown-only', 'node_intent', 'create');
      const waiting = await capture(() => active.wait('fixture'));
      assert.equal(waiting.threw, true); assert.equal(waiting.value, error);
      const stopped = await capture(() => active.stop(true));
      assert.equal(stopped.threw, true); assert.equal(stopped.value, error);
      assert.equal(f.ownedProcesses.length, 2); assert.ok(f.ownedProcesses.every(owned => owned.closed));
      assert.deepEqual(live.signals, ['SIGKILL']);
    }
    const ipcError = Object.assign(Error('IPC startup cause'), { code });
    const ipcChild = failedChild(ipcError, absent);
    const ipc = vm.createContext({ assert, Buffer, path, firstFailure, within, ownChild, reviewFrames,
      childProcess: { spawn: () => ipcChild }, __dirname, environment: {}, setTimeout, clearTimeout,
      process: { execPath: process.execPath, stderr: { write() {} } },
      encodeFrame() { throw Error('codec must not run while stdin is absent'); }, desktopErrorCode: value => value });
    vm.runInContext(slice('test-standalone-review-ipc.js', 'let child, owned, closed;', 'async function until('),
      ipc, { timeout: 500 });
    const answer = await capture(() => vm.runInContext("startChild(); send('probe')", ipc, { timeout: 500 }));
    assert.equal(answer.threw, true); assert.equal(answer.value, ipcError);
    await within(vm.runInContext('owned.done', ipc), 100, 'MODEL_CLOSE_UNCONFIRMED');

    const ownerError = Object.assign(Error('ownership startup cause'), { code });
    const participantChildren = [], owner = vm.createContext({ assert, ownChild, firstFailure, within,
      primary: firstFailure(), secondary() {}, cp: { fork: () => failedChild(ownerError, absent) },
      helper: '/own/helper', children: participantChildren, sequence: 0, setTimeout, clearTimeout,
      global: { process: { execPath: process.execPath, env: {} } } });
    vm.runInContext(slice('test-native-ownership-integration.js', 'function child() {', 'async function initialize('),
      owner, { timeout: 500 });
    const participant = vm.runInContext('child()', owner);
    const requested = await capture(() => participant.request('initialize'));
    assert.equal(requested.threw, true); assert.equal(requested.value, ownerError);
    const stopped = await capture(() => participant.stop());
    assert.equal(stopped.threw, true); assert.equal(stopped.value, ownerError);
    assert.equal(participantChildren.length, 1); assert.equal(participant.closed, true);

    const artifactError = Object.assign(Error('artifact startup cause'), { code }), records = [];
    const artifact = await capture(() => finishArtifactCrash(failedChild(artifactError, absent), 'before',
      { waitMs: 100, closeMs: 100, onOwned: owned => records.push(owned) }));
    assert.equal(artifact.threw, true); assert.equal(artifact.value, artifactError);
    assert.equal(records[0].closed, true);
  }
  console.log('PASS actual startup-method source models; no EMFILE/ENFILE exhaustion or native process proof');
})().catch(error => { console.error(error); process.exitCode = 1; });
