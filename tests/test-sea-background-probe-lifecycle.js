'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createSuite } = require('./helpers');

const { testAsync, done, assert } = createSuite('SEA probe lifecycle (VM regression, not native IPC evidence)');
const source = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/sea-background-probe.js'), 'utf8');
const sandbox = {
  module: { exports: {} }, setTimeout, clearTimeout,
  require(name) {
    assert.equal(name, 'node:sea', 'the lifecycle test must not import product workers');
    return { isSea: () => false };
  }
};
// Expose the actual private function in this VM only. The production module's
// exports, SEA guard and launcher remain unchanged; no OS child is started.
vm.runInNewContext(`${source}\nmodule.exports.observeChildForTest = observeChild;`, sandbox, { timeout: 1000 });
const observeChild = sandbox.module.exports.observeChildForTest;

function childFixture() {
  const child = new EventEmitter();
  Object.assign(child, { connected: true, exitCode: null, signalCode: null, stdio: [], kills: 0 });
  child.kill = () => { child.kills++; return true; };
  child.disconnectNow = () => { child.connected = false; child.emit('disconnect'); };
  child.exitNow = (code = 2, signal = null) => {
    child.exitCode = code;
    child.signalCode = signal;
    child.emit('exit', code, signal);
  };
  child.closeNow = () => child.emit('close', child.exitCode, child.signalCode);
  return child;
}

async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Lifecycle promise did not settle')), 1000);
    })]);
  } finally { clearTimeout(timer); }
}

async function assertPending(promise) {
  let settled = false;
  promise.then(() => { settled = true; }, () => { settled = true; });
  await new Promise(setImmediate);
  assert.equal(settled, false, 'one lifecycle event must not imply full completion');
}

async function run() {
  for (const order of [['disconnect', 'exit'], ['exit', 'disconnect']]) {
    await testAsync(`IPC ${order.join(' then ')} completes without close`, async () => {
      const child = childFixture();
      const observed = observeChild(child, true);
      for (const event of order) child[`${event}Now`]();
      const result = await bounded(observed.completion);
      assert.equal(result.code, 2);
      assert.equal(result.signal, null);
      assert.equal(result.error, false);
      await bounded(observed.stop());
      assert.equal(child.kills, 0);
    });
  }

  await testAsync('IPC disconnect alone is pending; stop kills and still waits for actual exit', async () => {
    const child = childFixture();
    const observed = observeChild(child, true);
    child.disconnectNow();
    await assertPending(observed.completion);
    const stopping = observed.stop();
    assert.equal(child.kills, 1);
    await assertPending(stopping);
    child.exitNow(null, 'SIGTERM');
    const result = await bounded(observed.completion);
    assert.equal(result.signal, 'SIGTERM');
    await bounded(stopping);
  });

  await testAsync('IPC exit alone is pending and an exited child is never killed', async () => {
    const child = childFixture();
    const observed = observeChild(child, true);
    child.exitNow();
    await assertPending(observed.completion);
    const stopping = observed.stop();
    assert.equal(child.kills, 0);
    await assertPending(stopping);
    child.disconnectNow();
    await bounded(stopping);
    assert.equal(child.kills, 0);
  });

  await testAsync('Companion exit plus disconnect remains pending until pipes close', async () => {
    const child = childFixture();
    const observed = observeChild(child, false);
    child.exitNow(0);
    child.disconnectNow();
    await assertPending(observed.completion);
    const stopping = observed.stop();
    assert.equal(child.kills, 0);
    await assertPending(stopping);
    child.closeNow();
    const result = await bounded(observed.completion);
    assert.equal(result.code, 0);
    await bounded(stopping);
    assert.equal(child.kills, 0);
  });

  await testAsync('A signal-terminated child awaiting pipe close is not killed again', async () => {
    const child = childFixture();
    const observed = observeChild(child, false);
    child.exitNow(null, 'SIGTERM');
    const stopping = observed.stop();
    assert.equal(child.kills, 0);
    child.closeNow();
    await bounded(stopping);
    assert.equal(child.kills, 0);
  });
  done();
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
