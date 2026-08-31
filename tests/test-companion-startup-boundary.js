'use strict';

// Deterministic clocks/streams; never opens a dialog or waits ten real seconds.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createSuite } = require('./helpers');
const { test, testAsync, assert, done } = createSuite('Companion startup boundary');
const server = path.join(__dirname, '../plugins/data-secure/server');
class SafeError extends Error {}

function supervisorFixture(options = {}) {
  const timers = new Set();
  const child = new EventEmitter();
  child.pid = 123;
  child.stdout = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stdin = { end() { child.emit('exit', 0); } };
  const pipe = new EventEmitter();
  let secret;
  pipe.end = bytes => { secret = bytes; };
  child.stdio = [null, null, null, pipe];
  let kills = 0;
  child.kill = () => { kills++; if (!options.killDoesNotExit) child.emit('exit', 2); };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(server, 'companion/supervisor.js'), 'utf8'), {
    module, exports: module.exports, Buffer,
    process: { env: {}, platform: 'linux' },
    setTimeout(callback, ms) { const timer = { callback, ms, unref() {} }; timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); },
    require(name) {
      if (name === '../runtime') return { SafeError };
      if (name === './ipc-session') return { signFrame: () => { throw new Error('not a request test'); } };
      if (name === '../background-role-launcher') return { launchBackgroundRole: () => child };
      return require(name);
    }
  });
  const companion = module.exports.launchCompanion();
  return { companion, child, pipe, timers, secret: () => secret, kills: () => kills };
}

function bootstrapFixture(bytes, options = {}) {
  let consumed = 0, maxRequest = 0, captured;
  let received;
  const module = { exports: {} };
  const run = () => vm.runInNewContext(fs.readFileSync(path.join(server, 'companion/stdio-server.js'), 'utf8'), {
    module, exports: module.exports, Buffer,
    process: { stdout: { write() {} }, stdin: {} },
    require(name) {
      if (name === 'fs') return { readSync(fd, target, offset, length) {
        assert.equal(fd, 3); captured = target; maxRequest = Math.max(maxRequest, length);
        if (options.readThrows) throw new Error('synthetic read failure');
        if (options.invalidCount) return length + 1;
        const count = Math.min(length, options.chunk || 7, bytes.length - consumed);
        bytes.copy(target, offset, consumed, consumed + count); consumed += count;
        return count;
      } };
      if (name === 'readline') return { createInterface: () => new EventEmitter() };
      if (name === '../runtime') return { SafeError };
      if (name === './ipc-session') return { createCompanionSession({ secret }) {
        received = Buffer.from(secret); return { descriptor: () => ({}) };
      } };
      throw new Error('unexpected import');
    }
  });
  return { run, consumed: () => consumed, maxRequest: () => maxRequest,
    captured: () => captured, received: () => received };
}

async function main() {
  await testAsync('ready timeout rejects once, kills only its child, wipes the key and observes exit', async () => {
    const f = supervisorFixture();
    const rejected = assert.rejects(f.companion.ready, /Start.*Zeitlimit/);
    assert.equal(f.timers.size, 1);
    const timer = [...f.timers][0]; assert.equal(timer.ms, 10000);
    timer.callback(); await rejected;
    assert.equal(await f.companion.exited, 2); assert.equal(f.kills(), 1);
    assert.ok(f.secret().every(byte => byte === 0)); assert.equal(f.timers.size, 0);
  });
  await testAsync('ready clears the startup clock and graceful close observes exit', async () => {
    const f = supervisorFixture();
    f.child.stdout.emit('data', JSON.stringify({ type: 'ready', transport: 'inherited_stdio', network_listener: false }) + '\n');
    await f.companion.ready; assert.equal(f.timers.size, 0);
    f.companion.close(); assert.equal(await f.companion.exited, 0);
    assert.equal(f.kills(), 0); assert.ok(f.secret().every(byte => byte === 0));
  });
  await testAsync('private bootstrap pipe error is handled, not an uncaught stream error', async () => {
    const f = supervisorFixture(); const rejected = assert.rejects(f.companion.ready, /Bootstrap/);
    f.pipe.emit('error', new Error('private path must not escape')); await rejected;
    assert.equal(await f.companion.exited, 2); assert.equal(f.timers.size, 0);
  });
  await testAsync('spawn failure without a PID settles both readiness and exit', async () => {
    const f = supervisorFixture(); f.child.pid = undefined;
    const rejected = assert.rejects(f.companion.ready, /nicht gestartet/);
    f.child.emit('error', new Error('synthetic')); await rejected;
    assert.equal(await f.companion.exited, null); assert.equal(f.timers.size, 0);
  });
  await testAsync('abort wipes and rejects even when OS termination does not complete', async () => {
    const f = supervisorFixture({ killDoesNotExit: true });
    const rejected = assert.rejects(f.companion.ready, /lokal beendet/);
    let exited = false; f.companion.exited.then(() => { exited = true; });
    f.companion.terminate(); await rejected;
    assert.ok(f.secret().every(byte => byte === 0)); assert.equal(f.timers.size, 0);
    assert.equal(exited, false); assert.equal(f.kills(), 1);
    f.companion.terminate(); assert.equal(f.kills(), 1);
    f.child.emit('exit', 2); assert.equal(await f.companion.exited, 2);
  });
  await testAsync('timeout wipes immediately and an observed exit prevents killing a reused PID', async () => {
    const f = supervisorFixture({ killDoesNotExit: true });
    const rejected = assert.rejects(f.companion.ready, /Zeitlimit/);
    [...f.timers][0].callback(); await rejected;
    assert.ok(f.secret().every(byte => byte === 0)); assert.equal(f.kills(), 1);
    f.child.emit('exit', 2); await f.companion.exited;
    f.companion.terminate(); assert.equal(f.kills(), 1);
    const natural = supervisorFixture(); const stopped = assert.rejects(natural.companion.ready, /beendet/);
    natural.child.emit('exit', 0); await stopped; await natural.companion.exited;
    natural.companion.terminate(); assert.equal(natural.kills(), 0);
  });
  test('32 secret bytes survive partial reads; scratch buffer is wiped', () => {
    const bytes = Buffer.alloc(32, 61), f = bootstrapFixture(bytes); f.run();
    assert.deepEqual(f.received(), bytes); assert.equal(f.consumed(), 32);
    assert.ok(f.captured().every(byte => byte === 0));
  });
  test('short and oversized secrets reject before session creation with bounded reads', () => {
    for (const size of [0, 31, 33, 100000]) {
      const f = bootstrapFixture(Buffer.alloc(size, 77));
      assert.throws(f.run, /Ungültiger/); assert.equal(f.received(), undefined);
      assert.ok(f.consumed() <= 33); assert.ok(f.maxRequest() <= 33);
      assert.ok(f.captured().every(byte => byte === 0));
    }
  });
  test('read exceptions and impossible read counts never create a session', () => {
    for (const options of [{ readThrows: true }, { invalidCount: true }]) {
      const f = bootstrapFixture(Buffer.alloc(32), options); assert.throws(f.run);
      assert.equal(f.received(), undefined); assert.ok(f.captured().every(byte => byte === 0));
    }
  });
  done();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
