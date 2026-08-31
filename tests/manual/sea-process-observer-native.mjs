// Explicit native ENGINEERING acceptance; never part of automatic CI.
// Only this file's own synthetic processes are started/stopped. No product job.
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, fork } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { readSeaFile, seaHash } from '../../scripts/lib/sea-source-evidence.mjs';
import { createObserverProtocol, createObserverOutputBudget } from '../../scripts/lib/sea-process-observer.mjs';
const root = path.resolve(import.meta.dirname, '../..');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('OBSERVER_WINDOWS_X64_REQUIRED');
if (process.argv.length !== 3) throw new Error('OBSERVER_TEST_ARGUMENTS_INVALID');
const directory = path.resolve(process.argv[2]);
const executable = path.join(directory, 'process-observer.exe');
const build = JSON.parse(readSeaFile(path.join(directory, 'observer-build.json')));
assert.equal(build.schema, 'datasecure-sea-process-observer-build/v1');
assert.equal(build.release_enabled, false);
assert.equal(build.target, 'windows-x64');
const bytes = readSeaFile(executable);
assert.equal(build.sha256, seaHash(bytes)); assert.equal(build.bytes, bytes.length);
assert.equal(build.source_sha256, seaHash(readSeaFile(path.join(root, 'native/sea/process-observer.cpp'))));
assert.equal(build.builder_sha256, seaHash(readSeaFile(path.join(root, 'scripts/build-sea-process-observer.mjs'))));
const fixture = path.join(root, 'tests/helpers/sea-observer-fixture.cjs');
const report = [];
async function bounded(promise, ms = 12000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('OBSERVER_TEST_DEADLINE')), ms);
  })]); } finally { clearTimeout(timer); }
}
async function scenario(name, { parentExit = false, parentCrash = false, wrongPid = false, wrongImage = false,
  wrongNonce = false, noConnect = false, timeout = false, observerCrash = false, code = 7,
  parentObserve = false, workerFirst = false, sameParentPid = false } = {}) {
  const owner = fork(fixture, [parentExit || parentCrash || parentObserve ? 'parent' : 'worker'], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const ownerClosed = once(owner, 'close');
  let observer;
  let observerClosed;
  try {
    const [ready] = await bounded(once(owner, 'message'));
    assert.equal(ready.type, 'worker-ready'); assert.ok(Number.isInteger(ready.pid));
    const pipeId = crypto.randomBytes(16).toString('hex');
    const nonce = crypto.randomBytes(32).toString('hex');
    const pid = wrongPid ? process.pid : ready.pid;
    observer = spawn(executable, [String(pid), pipeId, nonce,
      wrongImage ? path.join(directory, 'wrong.exe') : process.execPath,
      String(timeout || noConnect ? 500 : 5000),
      ...(parentObserve ? ['--parent-pid', String(sameParentPid ? ready.pid : owner.pid)] : [])],
    { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    observerClosed = once(observer, 'close');
    const protocol = createObserverProtocol(parentObserve);
    let pending = '', stderr = '', invalid = false, armed = false, parentEnded = false;
    let outputExceeded = false, observerKilled = false, failure;
    const events = [], budget = createObserverOutputBudget();
    function acceptOutput(chunk) {
      if (outputExceeded) return false;
      if (budget.accept(chunk)) return true;
      outputExceeded = true;
      pending = ''; stderr = '';
      observer.kill(); // only our own child, once; no further buffering
      return false;
    }
    owner.on('exit', () => { parentEnded = true; });
    observer.stderr.on('data', chunk => { if (acceptOutput(chunk)) stderr += chunk; });
    observer.stdout.on('data', chunk => {
      if (!acceptOutput(chunk)) return;
      try {
        pending += chunk.toString('utf8');
        let newline;
        while ((newline = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, newline).replace(/\r$/, ''); pending = pending.slice(newline + 1);
          const frame = JSON.parse(line);
          events.push(frame.event);
          if (frame.event === 'failed') {
            assert.deepEqual(Object.keys(frame).sort(), ['code', 'event', 'schema']);
            assert.equal(frame.schema, 'datasecure-sea-process-observer/v1');
            assert.equal(failure, undefined);
            failure = frame.code;
            // An expected failure invalidates evidence, but is not malformed
            // output. Every other exception still rejects negative cases too.
            assert.throws(() => protocol.accept(line));
            continue;
          }
          protocol.accept(line);
          if (protocol.state === 'listening' && !noConnect) owner.send({ type: 'connect',
            pipe: `\\\\.\\pipe\\datasecure-sea-observer-${pipeId}`, nonce, badNonce: wrongNonce });
          if (protocol.state === 'armed') {
            armed = true;
            assert.equal(parentEnded, false, 'target/parent must still be alive when armed');
            if (observerCrash) { observerKilled = observer.kill(); assert.equal(observerKilled, true); }
            else if (parentCrash) assert.equal(owner.kill(), true);
            else if (parentExit) owner.send({ type: 'exit-parent' });
            else if (!timeout) owner.send({ type: 'stop', code });
          }
        }
      } catch { invalid = true; }
    });
    const [exitCode, signal] = await bounded(observerClosed);
    assert.equal(invalid, false); assert.equal(outputExceeded, false);
    assert.equal(pending, ''); assert.equal(stderr, '');
    const positive = !(wrongPid || wrongImage || wrongNonce || noConnect || timeout || observerCrash || workerFirst || sameParentPid);
    if (positive) {
      assert.equal(invalid, false); assert.equal(pending, ''); assert.equal(armed, true);
      assert.deepEqual(protocol.finish(exitCode, signal, stderr), { worker_exit_observed: true, exit_code: code,
        ...(parentObserve ? { parent_exit_observed: true, worker_alive_at_parent_exit: true } : {}) });
      assert.deepEqual(events, parentObserve ? ['listening', 'armed', 'parent-exited', 'exited'] : ['listening', 'armed', 'exited']);
      if (parentExit) { assert.equal(parentEnded, true); assert.equal(owner.exitCode, 23); }
      if (parentCrash) { assert.equal(parentEnded, true); assert.equal(owner.signalCode, 'SIGTERM'); }
    } else {
      assert.throws(() => protocol.finish(exitCode, signal, stderr));
      assert.equal(armed, timeout || observerCrash || workerFirst);
      if (observerCrash) {
        assert.equal(observerKilled, true); assert.equal(signal, 'SIGTERM');
        assert.equal(failure, undefined); assert.equal(invalid, false);
        assert.deepEqual(events, ['listening', 'armed']);
      } else {
        const expected = wrongPid ? 'OBSERVER_CLIENT_MISMATCH' : wrongImage ?
          'OBSERVER_PROCESS_IDENTITY_INVALID' : wrongNonce ? 'OBSERVER_PROTOCOL_INVALID' : workerFirst ?
            'OBSERVER_WORKER_ENDED_BEFORE_PARENT' : sameParentPid ? 'OBSERVER_ARGUMENTS_INVALID' : 'OBSERVER_DEADLINE';
        assert.equal(failure, expected); assert.equal(exitCode, 2); assert.equal(signal, null);
        assert.deepEqual(events, sameParentPid ? ['failed'] : timeout || workerFirst ? ['listening', 'armed', 'failed'] : ['listening', 'failed']);
      }
    }
    report.push({ name, passed: true });
    console.log(`${name}: PASS`);
  } finally {
    if (observer && observer.exitCode === null && observer.signalCode === null) observer.kill();
    if (observerClosed) await bounded(observerClosed);
    // Before a controlled parent exit the owner remains our ChildProcess.
    // The orphan fixture has its own short exit deadline; inherited pipes drain.
    if (owner.connected) owner.send({ type: 'stop', code: 0 }, () => {});
    await bounded(ownerClosed);
  }
}
for (const [name, options] of [
  ['held-handle-normal-exit', {}], ['signaled-exit-259-is-valid', { code: 259 }],
  ['controlled-parent-exit-own-grandchild', { parentExit: true }],
  ['killed-parent-own-detached-grandchild', { parentCrash: true }],
  ['foreign-same-image-pid', { wrongPid: true }], ['wrong-image', { wrongImage: true }],
  ['wrong-attempt-nonce', { wrongNonce: true }], ['no-connection-deadline', { noConnect: true }],
  ['live-worker-deadline', { timeout: true }], ['observer-crash-not-exit-evidence', { observerCrash: true }],
  ['native-order-controlled-parent-exit', { parentObserve: true, parentExit: true }],
  ['native-order-killed-parent', { parentObserve: true, parentCrash: true }],
  ['native-order-worker-first-rejected', { parentObserve: true, workerFirst: true }],
  ['native-order-parent-stays-alive-deadline', { parentObserve: true, timeout: true }],
  ['native-order-observer-crash-rejected', { parentObserve: true, observerCrash: true }],
  ['native-order-wrong-nonce', { parentObserve: true, wrongNonce: true }],
  ['native-order-parent-worker-same-pid', { parentObserve: true, sameParentPid: true }]
]) await scenario(name, options);
console.log(JSON.stringify({ schema: 'datasecure-sea-process-observer-acceptance/v1', target: 'windows-x64',
  cases: report, synthetic_only: true, product_parent_crash_verified: false, privacy_release_verified: false }));
