'use strict';
// Actual QA teardown functions with closed in-memory children and filesystems.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { EventEmitter } = require('events');
const { createSuite } = require('./helpers');
const { firstFailure, ownChild, within } = require('./helpers/qa-parent-lifecycle.cjs');
const { testAsync, assert, done } = createSuite('Direct intake QA parent close-before-cleanup');
const source = fs.readFileSync(path.join(__dirname, 'test-direct-picker-intake-worker.js'), 'utf8');
function part(begin, end) {
  const start = source.indexOf(begin), finish = source.indexOf(end, start);
  assert.ok(start >= 0 && start === source.lastIndexOf(begin) && finish > start);
  return source.slice(start, finish);
}
const actual = part('function trackChild(', '\nasync function intakeCase(') +
  part('async function removeTestRoot(', '\nasync function main(');
function model() {
  let removes = 0;
  const primary = firstFailure(), children = [];
  const context = { primary, children, stopCompletion: undefined, rootRemoved: false, base: 'QA-VIRTUAL-ONLY',
    ownChild, firstFailure, within: (promise, milliseconds, code) => within(promise, Math.min(milliseconds, 25), code),
    assert, suite: { failure: () => ({ failed: false }) },
    fs: { rmSync: () => removes++, existsSync: () => false }, pause: async () => {} };
  const api = vm.runInNewContext("'use strict';\n" + actual + '\n({trackChild, stopTestChildren, removeTestRoot});', context);
  function child({ stop = 'close', disconnectError, exited = false } = {}) {
    const value = new EventEmitter();
    value.kills = 0; value.disconnects = 0; value.connected = true;
    value.exitCode = exited ? 0 : null; value.signalCode = null;
    value.disconnect = () => { value.disconnects++; if (disconnectError) throw false; value.connected = false; };
    value.kill = () => {
      value.kills++;
      if (stop === 'throw') throw 0;
      if (stop === 'false') return false;
      value.signalCode = 'SIGKILL'; value.emit('close', null, 'SIGKILL'); return true;
    };
    api.trackChild(value); return value;
  }
  return { api, primary, children, child, removes: () => removes, context };
}
async function main() {
  await testAsync('normal owned stop plus actual close permits exactly one root cleanup', async () => {
    const m = model(), child = m.child(); await m.api.removeTestRoot();
    assert.equal(child.kills, 1); assert.equal(m.removes(), 1); assert.equal(m.context.rootRemoved, true);
  });
  await testAsync('an already normally closed handle needs no kill and permits cleanup', async () => {
    const m = model(), child = m.child(); child.emit('close', 0, null); await m.api.removeTestRoot();
    assert.equal(child.kills, 0); assert.equal(m.removes(), 1);
  });
  for (const stop of ['false', 'throw']) {
    await testAsync(`first child ${stop} does not skip second stop or permit deletion`, async () => {
      const m = model(), first = m.child({ stop }), second = m.child();
      await assert.rejects(m.api.removeTestRoot(), () => true);
      assert.equal(first.kills, 1); assert.equal(second.kills, 1); assert.equal(m.removes(), 0);
      first.emit('close', 0, null);
      await assert.rejects(m.api.removeTestRoot(), () => true);
      assert.equal(first.kills, 1); assert.equal(second.kills, 1); assert.equal(m.removes(), 0);
    });
  }
  await testAsync('own stops retain IPC and preserve a falsy stop error while attempting every known child', async () => {
    const m = model(), first = m.child({ stop: 'throw', disconnectError: true }), second = m.child();
    let failed = false, error;
    try { await m.api.removeTestRoot(); } catch (value) { failed = true; error = value; }
    assert.equal(failed, true); assert.strictEqual(error, 0);
    assert.equal(first.kills, 1); assert.equal(second.kills, 1); assert.equal(m.removes(), 0);
    assert.equal(first.disconnects, 0); assert.equal(second.disconnects, 0);
  });
  await testAsync('exit0 without close remains unknown and does not signal an exited handle', async () => {
    const m = model(), child = m.child({ exited: true });
    await assert.rejects(m.api.removeTestRoot(), error => error.code === 'DIRECT_INTAKE_CLOSE_UNCONFIRMED');
    assert.equal(child.kills, 0); assert.equal(m.removes(), 0);
  });
  await testAsync('observed falsy process error remains primary and keeps the now closed root', async () => {
    const m = model(), child = m.child(); child.emit('error', undefined); child.emit('close', 0, null);
    let failed = false, error;
    try { await m.api.removeTestRoot(); } catch (value) { failed = true; error = value; }
    assert.equal(failed, true); assert.strictEqual(error, undefined);
    assert.equal(m.primary.failed, true); assert.strictEqual(m.primary.value, undefined);
    assert.equal(m.removes(), 0);
  });
  const worker = fs.readFileSync(path.join(__dirname, 'lib/detached-batch-worker.js'), 'utf8');
  const notifyStart = worker.indexOf('  const notify = '), notifyEnd = worker.indexOf('\n  // Mirror', notifyStart);
  const cutStart = worker.indexOf('      const startedSent = '), cutEnd = worker.indexOf('\n    }\n    const completed = ', cutStart);
  assert.ok(notifyStart >= 0 && notifyEnd > notifyStart && cutStart > notifyEnd && cutEnd > cutStart);
  for (const [flag, sendFails, disconnects] of [['1', false, 1], ['1', true, 0], [undefined, true, 0]]) {
    await testAsync(`actual fixture disconnect cut requires the exact flag and successful send (${flag}, ${sendFails})`, async () => {
      let sent = 0, closed = 0;
      const processModel = { env: { DATASECURE_QA_CHILD_DISCONNECT_AFTER_START: flag }, connected: true,
        send(value, callback) { sent++; assert.equal(value.type, 'local-intake-processing-started'); callback(sendFails ? Error('QA_SEND_REFUSED') : null); },
        disconnect() { closed++; processModel.connected = false; } };
      const run = vm.runInNewContext('(async () => {\n' + worker.slice(notifyStart, notifyEnd) + '\n' +
        worker.slice(cutStart, cutEnd) + '\n})', { process: processModel, Error });
      if (flag === '1' && sendFails) await assert.rejects(run(), /QA_DISCONNECT_START_NOT_SENT/u);
      else await run();
      assert.equal(sent, 1); assert.equal(closed, disconnects);
    });
  }
  await done();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
