'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { Worker } = require('worker_threads');
const { createSuite } = require('./helpers');
const { schedulePendingResultExportReplay, REPLAY_TIMEOUT_MS } = require('../plugins/data-secure/server/gateway/result-export-replay');

const { testAsync, done, assert } = createSuite('Result export startup replay');
const temporary = fs.realpathSync.native(os.tmpdir());
const root = fs.mkdtempSync(path.join(temporary, 'datasecure-export-replay-'));
const files = new Set();
const SUCCESS = Object.freeze({ exported: 2, pending: 1, failures: 0 });
const FAILURE = Object.freeze({ exported: 0, pending: 0, failures: 1 });
const ERROR_CODES = new Set(['REPLAY_TEST_CONSTRUCTOR', 'REPLAY_TEST_CRASH', 'ERR_WORKER_INIT_FAILED',
  'ERR_WORKER_OUT_OF_MEMORY', 'ERR_WORKER_PATH', 'ERR_WORKER_NOT_RUNNING', 'MODULE_NOT_FOUND']);
const errorCode = error => ERROR_CODES.has(error?.code) ? error.code : 'WORKER_ERROR';

function worker(name, source) {
  const file = path.join(root, name);
  files.add(name);
  try { fs.writeFileSync(file, source, { encoding: 'utf8', flag: 'wx' }); }
  catch { throw Error('REPLAY_TEST_FIXTURE_CREATE_FAILED'); }
  return file;
}

async function replayCase(name, body, watchdogMs = 5000) {
  await testAsync(name, async () => {
    const events = [], workers = [], schedules = [], intervals = [];
    let watchdogTimer;
    // Independent of the scheduler's defer/deadline/exit callbacks: a dropped
    // callback must fail the case and reach cleanup, not hang on a fake await.
    const watchdog = new Promise((resolve, reject) => {
      watchdogTimer = setTimeout(() => reject(Error('REPLAY_TEST_WATCHDOG')), watchdogMs);
    });
    // Mirror the MCP host's referenced stdin even for deliberately unref'ed
    // workers and synthetic deadlines. Every handle is cleared in finally.
    intervals.push(setInterval(() => {}, 1000));
    const record = (event, fields = {}) => events.push({ event, ...fields });
    function observedEvent(instance, event, args) {
      if (event === 'online' || event === 'message') record(event);
      if (event === 'error') record('errorcode', { code: errorCode(args[0]) });
      if (event === 'exit') {
        instance.exited = true;
        record('exit', { code: Number.isSafeInteger(args[0]) ? args[0] : 'INVALID_EXIT' });
      }
    }
    const fixture = {
      events, workers,
      schedule(options) {
        const handle = schedulePendingResultExportReplay(options);
        const tracked = { handle, settled: false };
        handle.settled.then(() => { tracked.settled = true; });
        schedules.push(tracked);
        return handle;
      },
      interval(callback) { intervals.push(setInterval(callback, 5)); },
      fakeWorker(terminate, releaseTermination) {
        return class extends EventEmitter {
          constructor() {
            super(); record('start'); this.exited = false;
            workers.push({ instance: this, close: () => {
              if (!this.exited) this.emit('exit', 1);
              releaseTermination?.();
            } });
          }
          emit(event, ...args) { observedEvent(this, event, args); return super.emit(event, ...args); }
          unref() { this.unreferenced = true; }
          terminate() {
            record('termination');
            if (terminate) return terminate(this);
            this.emit('exit', 1);
            return Promise.resolve(1);
          }
        };
      },
      realWorker(workerData) {
        return class extends Worker {
          constructor(file) {
            record('start');
            try { super(file, { workerData }); }
            catch (error) { record('errorcode', { code: errorCode(error) }); throw error; }
            this.exited = false;
            workers.push({ instance: this, close: async () => {
              if (!this.exited) await (this.termination || this.terminate());
              assert.equal(this.exited, true, 'native worker cleanup must observe exit');
            } });
          }
          // Observe the existing events without adding a message listener that
          // could change the MessagePort's reference state.
          emit(event, ...args) { observedEvent(this, event, args); return super.emit(event, ...args); }
          unref() { this.unreferenced = true; return super.unref(); }
          terminate() { record('termination'); this.termination = super.terminate(); return this.termination; }
        };
      }
    };
    try {
      try { await Promise.race([body(fixture), watchdog]); }
      finally {
        try {
          for (const tracked of schedules) if (!tracked.settled) tracked.handle.cancel();
          for (const owned of workers) await owned.close();
        } finally {
          clearTimeout(watchdogTimer);
          for (const interval of intervals) clearInterval(interval);
        }
      }
    } catch (error) {
      // Closed lifecycle only: never print worker messages, exceptions, paths
      // or source text. A retry cannot reconstruct a missing failure branch.
      console.error(`Replay worker lifecycle: ${JSON.stringify(events)}`);
      throw error;
    }
  });
}

async function main() {
  try {
    await replayCase('scheduling defers construction and settles only after the successful worker exits', async f => {
      let deferred, settled = false;
      const scheduled = f.schedule({ Worker: f.fakeWorker(), defer(callback) { deferred = callback; } });
      scheduled.settled.then(() => { settled = true; });
      assert.equal(typeof deferred, 'function');
      assert.equal(f.workers.length, 0, 'the scheduling call must not construct or run a worker inline');
      deferred();
      assert.equal(f.workers.length, 1);
      const active = f.workers[0].instance;
      assert.equal(active.unreferenced, true);
      active.emit('message', SUCCESS);
      await Promise.resolve();
      assert.equal(settled, false, 'a final message is not the worker-exit concurrency boundary');
      active.emit('exit', 0);
      assert.deepStrictEqual(await scheduled.settled, SUCCESS);
      assert.deepStrictEqual(f.events, [{ event: 'start' }, { event: 'message' }, { event: 'exit', code: 0 }]);
    });

    await replayCase('the main event loop progresses while a real replay worker is observed synchronously waiting', async f => {
      const gate = new Int32Array(new SharedArrayBuffer(8));
      const waiting = worker('waiting.js', `
        const { parentPort, workerData } = require('worker_threads');
        const gate = new Int32Array(workerData);
        while (Atomics.load(gate, 1) === 0) Atomics.wait(gate, 0, 0);
        parentPort.postMessage({ exported: 2, pending: 1, failures: 0 });
      `);
      let waitingTurns = 0;
      f.interval(() => {
        // A flag set immediately before wait would not prove entry into wait.
        // notify's return value proves a real waiter at each counted turn.
        if (waitingTurns < 10 && Atomics.notify(gate, 0, 1) === 1 && ++waitingTurns === 10) {
          Atomics.store(gate, 1, 1);
          // Also change the value actually compared by wait: a worker that
          // read the old end flag cannot fall asleep after the final notify.
          Atomics.store(gate, 0, 1);
          Atomics.notify(gate, 0, 1);
        }
      });
      // Keep the production lifetime bound; correctness comes from the
      // handshake, not a shorter wall-clock startup/performance assumption.
      const scheduled = f.schedule({ workerFile: waiting, Worker: f.realWorker(gate.buffer) });
      assert.deepStrictEqual(await scheduled.settled, SUCCESS);
      assert.equal(waitingTurns, 10);
      assert.equal(f.workers[0].instance.unreferenced, true);
      assert.deepStrictEqual(f.events, [{ event: 'start' }, { event: 'online' },
        { event: 'message' }, { event: 'exit', code: 0 }]);
    }, REPLAY_TIMEOUT_MS + 5000);

    await replayCase('a constructor failure resolves fail-closed without pretending a worker started', async f => {
      const scheduled = f.schedule({ Worker: class {
        constructor() {
          f.events.push({ event: 'start' }, { event: 'errorcode', code: 'REPLAY_TEST_CONSTRUCTOR' });
          throw Object.assign(new Error('private synthetic constructor detail'), { code: 'REPLAY_TEST_CONSTRUCTOR' });
        }
      } });
      assert.deepStrictEqual(await scheduled.settled, FAILURE);
      assert.equal(f.workers.length, 0);
      assert.deepStrictEqual(f.events, [{ event: 'start' }, { event: 'errorcode', code: 'REPLAY_TEST_CONSTRUCTOR' }]);
    });

    await replayCase('a real worker crash is observed online with its closed error code and nonzero exit', async f => {
      const crashing = worker('crash.js', `throw Object.assign(new Error('private synthetic path must not escape'), { code: 'REPLAY_TEST_CRASH' });`);
      const scheduled = f.schedule({ workerFile: crashing, Worker: f.realWorker() });
      assert.deepStrictEqual(await scheduled.settled, FAILURE);
      assert.deepStrictEqual(f.events, [{ event: 'start' }, { event: 'online' },
        { event: 'errorcode', code: 'REPLAY_TEST_CRASH' }, { event: 'exit', code: 1 }]);
    }, REPLAY_TIMEOUT_MS + 5000);

    await replayCase('the deadline invokes termination and cannot settle before the controlled worker exit', async f => {
      let startedTermination, releaseTermination, deferred, settled = false;
      const terminated = new Promise(resolve => { startedTermination = resolve; });
      const termination = new Promise(resolve => { releaseTermination = () => resolve(1); });
      const scheduled = f.schedule({ timeoutMs: 10, defer(callback) { deferred = callback; },
        Worker: f.fakeWorker(() => { startedTermination(); return termination; }, releaseTermination) });
      scheduled.settled.then(() => { settled = true; });
      deferred();
      await terminated;
      assert.equal(settled, false, 'timeout must await termination rather than release ownership immediately');
      assert.deepStrictEqual(f.events, [{ event: 'start' }, { event: 'termination' }]);
      f.workers[0].instance.emit('exit', 1);
      releaseTermination();
      assert.deepStrictEqual(await scheduled.settled, FAILURE);
      assert.deepStrictEqual(f.events, [{ event: 'start' }, { event: 'termination' }, { event: 'exit', code: 1 }]);
    });

    for (const scenario of [
      { name: 'a nonzero exit rejects even a valid summary', summary: SUCCESS, code: 1 },
      { name: 'a zero exit without a summary is a failure', code: 0 },
      { name: 'a zero exit with a malformed summary is a failure', summary: { exported: -1, pending: 0, failures: 0 }, code: 0 }
    ]) {
      await replayCase(scenario.name, async f => {
        let deferred;
        const scheduled = f.schedule({ Worker: f.fakeWorker(), defer(callback) { deferred = callback; } });
        deferred();
        const active = f.workers[0].instance;
        if (scenario.summary) active.emit('message', scenario.summary);
        active.emit('exit', scenario.code);
        assert.deepStrictEqual(await scheduled.settled, FAILURE);
        assert.deepStrictEqual(f.events, [{ event: 'start' }, ...(scenario.summary ? [{ event: 'message' }] : []),
          { event: 'exit', code: scenario.code }]);
      });
    }
  } finally {
    await done(() => {
      try {
        const resolved = path.resolve(root);
        assert.equal(path.dirname(resolved).toLowerCase(), temporary.toLowerCase());
        assert.match(path.basename(resolved), /^datasecure-export-replay-[A-Za-z0-9]+$/u);
        const stat = fs.lstatSync(resolved);
        assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
        assert.equal(fs.realpathSync.native(resolved).toLowerCase(), resolved.toLowerCase());
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        assert.ok(entries.length <= files.size && entries.every(entry => files.has(entry.name) &&
          entry.isFile() && !entry.isSymbolicLink()));
        for (const entry of entries) fs.unlinkSync(path.join(resolved, entry.name));
        fs.rmdirSync(resolved);
      } catch { throw Error('REPLAY_TEST_FIXTURE_CLEANUP_FAILED'); }
    });
  }
}

main().catch(() => { console.error('REPLAY_TEST_SETUP_OR_CLEANUP_FAILED'); process.exitCode = 1; });
