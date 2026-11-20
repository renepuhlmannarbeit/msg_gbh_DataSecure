import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createSuite } from './helpers.js';

// Read the actual parent callback and bounded helper without importing it.
// Only fake handles/filesystem are available inside the isolated test context.
const source = fs.readFileSync(new URL('./test-product-isolation-offline.mjs', import.meta.url), 'utf8')
  .replace(/\r\n/gu, '\n');
function unique(marker) {
  const index = source.indexOf(marker);
  assert.ok(index >= 0 && source.indexOf(marker, index + marker.length) < 0, marker);
  return index;
}
const cliBoundary = unique('\n// R6 failure-only CLI policy:');
const tail = source.slice(unique('await done(async () => {'), cliBoundary).trimEnd();
assert.ok(tail.endsWith('\n});'));
const cleanupSource = tail.slice('await done('.length, -2);
const start = unique('async function bounded('), end = unique('\nfunction within(');
assert.ok(end > start);
const boundedSource = source.slice(start, end);
const { testAsync, done } = createSuite('Actual isolation-parent cleanup callback');

async function deadline(operation) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('ISOLATION_CLEANUP_TEST_DEADLINE')), 2000);
    })]);
  } finally { clearTimeout(timer); }
}

function ownClient(name, events, options = {}) {
  let settled = false, resolve;
  const closed = new Promise(ready => { resolve = ready; });
  const child = {
    exitCode: null,
    kill() {
      events.push(name + ':kill');
      if (Object.hasOwn(options, 'killError')) throw options.killError;
      if (options.closeOnKill !== false) close();
      return true;
    },
    get pid() { throw new Error('NO_PID_LOOKUP'); }
  };
  function close(code = 0) {
    if (settled) return;
    settled = true; child.exitCode = code;
    events.push(name + ':closed');
    resolve({ code, signal: null });
  }
  if (options.initiallyClosed) close();
  return {
    child,
    closed: { then(accept, reject) { events.push(name + ':join'); return closed.then(accept, reject); } },
    stop() {
      events.push(name + ':stop');
      if (Object.hasOwn(options, 'stopError')) throw options.stopError;
      if (options.closeOnStop !== false) close(options.closeCode ?? 0);
      return Promise.resolve();
    }
  };
}

function model(children, events, reportError) {
  const filesystemCalls = [], stderr = [], waits = [];
  // These inert stubs let the Before baseline finish without ever touching a
  // real path. Separate assertions below reject every attempted FS operation.
  const fakeFs = {
    lstatSync() {
      filesystemCalls.push('lstat');
      return { isDirectory: () => true, isSymbolicLink: () => false, dev: 7, ino: 11 };
    },
    readdirSync() { filesystemCalls.push('readdir'); return []; },
    rmSync() { filesystemCalls.push('rm'); }
  };
  const context = {
    children, assert, AggregateError, fs: fakeFs, temporary: 'synthetic-unused-owned-root',
    initial: { dev: 7, ino: 11 }, within: () => true,
    process: { stderr: { write(value) {
      if (reportError) throw reportError;
      stderr.push(value); return true;
    } } },
    setTimeout(callback, milliseconds) {
      waits.push(milliseconds);
      return setTimeout(callback, Math.min(milliseconds, 20));
    },
    clearTimeout
  };
  const cleanup = vm.runInNewContext(boundedSource + '\n(' + cleanupSource + ')', context,
    { filename: 'actual-isolation-parent-cleanup', timeout: 1000 });
  return { cleanup, children, events, filesystemCalls, stderr, waits };
}
async function outcome(current) {
  try { await deadline(current.cleanup()); return { failed: false }; }
  catch (error) { return { failed: true, error }; }
}
function assertLaterClients(current, names) {
  for (const name of names) {
    assert.ok(current.events.includes(name + ':stop'), name + ' was not stopped after the first failure');
    assert.ok(current.events.includes(name + ':join'), name + ' was not joined after the first failure');
  }
}
function assertRetention(current, status) {
  assert.deepEqual(current.filesystemCalls, [], 'host close never authorizes a runtime filesystem operation');
  assert.deepEqual(current.stderr, ['PRODUCT_ISOLATION_SCOPE_RETAINED:cleanup=' + status +
    '; writer_quiescence=UNCONFIRMED; deletion=NOT_ATTEMPTED\n']);
}

await testAsync('valid actual-source host-close baseline precedes injected faults', async () => {
  const events = [], current = model([
    ownClient('live', events), ownClient('closed', events, { initiallyClosed: true })
  ], events);
  assert.equal((await outcome(current)).failed, false);
  assert.ok(events.includes('live:stop') && events.includes('live:join') && events.includes('closed:join'));
  assert.ok(!events.includes('closed:stop') && !events.some(value => value.endsWith(':kill')));
});

await testAsync('unconfirmed first post-kill close still attempts every later owned client', async () => {
  const primary = new Error('FIRST_STOP_FAILED'), events = [];
  const current = model([
    ownClient('first', events, { stopError: primary, closeOnKill: false }),
    ...['second', 'third', 'fourth'].map(name => ownClient(name, events))
  ], events);
  const result = await outcome(current);
  assertLaterClients(current, ['second', 'third', 'fourth']);
  assert.equal(result.failed, true); assert.ok(result.error instanceof AggregateError);
  assert.equal(result.error.errors.length, 2);
  assert.strictEqual(result.error.errors[0], primary);
  assert.equal(result.error.errors[1].message, 'ISOLATION_KILL_TIMEOUT');
  assert.strictEqual(result.error.cause, primary);
  assert.equal(events.filter(value => value === 'first:kill').length, 1);
  assert.ok(current.waits.includes(10000), 'actual parent post-kill deadline remains present');
  assertRetention(current, 'FAILED');
});

await testAsync('kill throwing cannot skip its close bound or later owned clients', async () => {
  const primary = new Error('STOP_FAILED'), secondary = new Error('KILL_REFUSED'), events = [];
  const current = model([
    ownClient('first', events, { stopError: primary, killError: secondary }),
    ownClient('later', events)
  ], events);
  const result = await outcome(current);
  assertLaterClients(current, ['later']);
  assert.equal(result.failed, true); assert.ok(result.error instanceof AggregateError);
  assert.equal(result.error.errors.length, 3);
  assert.strictEqual(result.error.errors[0], primary);
  assert.strictEqual(result.error.errors[1], secondary);
  assert.equal(result.error.errors[2].message, 'ISOLATION_KILL_TIMEOUT');
  assert.ok(events.includes('first:join'), 'a refused kill still has a bounded close attempt');
  assertRetention(current, 'FAILED');
});

await testAsync('all clients preserve first, secondary, falsy and nonzero-close errors in order', async () => {
  const primary = new Error('FIRST_PRIMARY'), events = [];
  const current = model([
    ownClient('first', events, { stopError: primary, killError: false }),
    ownClient('second', events, { closeCode: 9 }),
    ownClient('third', events, { stopError: undefined, killError: null }),
    ownClient('fourth', events)
  ], events);
  const result = await outcome(current);
  assertLaterClients(current, ['second', 'third', 'fourth']);
  assert.equal(result.failed, true); assert.ok(result.error instanceof AggregateError);
  const errors = result.error.errors;
  assert.equal(errors.length, 7);
  assert.strictEqual(errors[0], primary); assert.strictEqual(errors[1], false);
  assert.equal(errors[2].message, 'ISOLATION_KILL_TIMEOUT');
  assert.equal(errors[3].code, 'ERR_ASSERTION'); assert.equal(errors[3].actual, 9);
  assert.strictEqual(errors[4], undefined); assert.strictEqual(errors[5], null);
  assert.equal(errors[6].message, 'ISOLATION_KILL_TIMEOUT');
  assert.strictEqual(result.error.cause, primary);
  assertRetention(current, 'FAILED');
});

await testAsync('falsy first errors remain the exact aggregate cause after confirmed fallback close', async () => {
  for (const primary of [null, undefined, false, 0, '']) {
    const events = [], current = model([ownClient('first', events, { stopError: primary })], events);
    const result = await outcome(current);
    assert.equal(result.failed, true); assert.ok(result.error instanceof AggregateError);
    assert.equal(result.error.errors.length, 1); assert.strictEqual(result.error.errors[0], primary);
    assert.ok(Object.hasOwn(result.error, 'cause')); assert.strictEqual(result.error.cause, primary);
    assertRetention(current, 'FAILED');
  }
});

await testAsync('confirmed host-close and empty baselines retain the runtime without deletion authority', async () => {
  for (const empty of [false, true]) {
    const events = [], current = model(empty ? [] : [ownClient('closed', events, { initiallyClosed: true })], events);
    assert.equal((await outcome(current)).failed, false);
    assertRetention(current, 'COMPLETE');
  }
});

await testAsync('retention-report failure joins the existing cleanup aggregate after all clients', async () => {
  const primary = new Error('STOP_FAILED'), reporting = new Error('REPORT_FAILED'), events = [];
  const current = model([ownClient('first', events, { stopError: primary }),
    ownClient('later', events)], events, reporting);
  const result = await outcome(current);
  assertLaterClients(current, ['later']);
  assert.equal(result.failed, true); assert.ok(result.error instanceof AggregateError);
  assert.deepEqual(result.error.errors, [primary, reporting]);
  assert.strictEqual(result.error.cause, primary);
  assert.deepEqual(current.filesystemCalls, []);
});

await testAsync('actual post-done CLI hook forwards the exact suite snapshot after the cleanup callback', async () => {
  const hook = source.slice(cliBoundary);
  for (const error of [undefined, null, false, 0, '', Object.freeze(new Error('FIRST_SUITE_FAILURE'))]) {
    for (const failed of [false, true]) {
      const calls = [], snapshot = { failed, error };
      vm.runInNewContext(hook, { suiteFailure: () => snapshot,
        endTestCliFailure: value => calls.push(value), temporary: 'synthetic-retained-root' },
      { filename: 'actual-isolation-parent-post-done-hook', timeout: 1000 });
      assert.equal(calls.length, 1); assert.equal(calls[0].failed, failed);
      assert.strictEqual(calls[0].error, error);
      assert.deepEqual(Array.from(calls[0].retainedRoots), ['synthetic-retained-root']);
      assert.equal(calls[0].unconfirmedChildren, true, 'hook never upgrades host exitCode into writer/close proof');
    }
  }
});

await done();
console.log('MODELED own-handle cleanup only; no native process, writer-tree join or Node-exit deadline claim');
