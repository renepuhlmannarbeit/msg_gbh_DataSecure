'use strict';

// Pure QA source composition. Real Session caller closures + the real existing
// QA lifecycle helper; controlled EventEmitters, timer faults and in-memory FS.
// No product imports, OS children, user roots, native dialogs or writer joins.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { inspect } = require('node:util');
const { createSuite } = require('./helpers');
const { testAsync, done, assert } = createSuite('Batch Session actual caller lifecycle QA models');
const sessionFile = path.join(__dirname, 'test-batch-session.js');
const source = fs.readFileSync(sessionFile, 'utf8');
const helperSource = fs.readFileSync(path.join(__dirname, 'helpers/qa-parent-lifecycle.cjs'), 'utf8');
const mainBoundary = source.indexOf('\nasync function main() {');
assert.ok(mainBoundary > 0 && mainBoundary === source.lastIndexOf('\nasync function main() {'));
const prefix = source.slice(0, mainBoundary);
const entryBoundary = source.lastIndexOf('\nmain().');
assert.ok(entryBoundary > mainBoundary);
const entry = source.slice(entryBoundary);
async function attempt(action) {
  try { return { threw: false, value: await action() }; }
  catch (error) { return { threw: true, error }; }
}
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(plans = [], settings = {}) {
  const children = [], errors = [], mutations = [], diagnostics = [], exits = [], timerValues = [], timers = new Set();
  let faulted = false, next = 0, acknowledgements = 0;
  const timer = (action, milliseconds) => {
    timerValues.push(milliseconds);
    let handle;
    handle = setTimeout(() => { timers.delete(handle); action(); },
      settings.forceCloseDeadline && milliseconds === 5_000 ? 0 : milliseconds);
    timers.add(handle); return handle;
  };
  const clear = handle => { timers.delete(handle); clearTimeout(handle); };
  const mutate = operation => { mutations.push({ operation, afterFault: faulted }); };
  const child = plan => {
    const value = new EventEmitter(), input = new EventEmitter(), output = new EventEmitter(), stderr = new EventEmitter();
    Object.assign(value, { pid: 1000 + children.length, exitCode: null, signalCode: null,
      signals: 0, closed: false, setup: [], messages: [], unhandled: [] });
    const setup = stage => value.setup.push({ stage, error: value.listenerCount('error') > 0, close: value.listenerCount('close') > 0 });
    value.close = (code, signal = null) => {
      value.closed = true; value.exitCode = code; value.signalCode = signal;
      value.emit('exit', code, signal); value.emit('close', code, signal);
    };
    value.error = error => {
      faulted = true;
      try { value.emit('error', error); } catch (unhandled) { value.unhandled.push(unhandled); }
    };
    value.kill = () => {
      value.signals++;
      if (Object.hasOwn(plan, 'killThrows')) throw plan.killThrows;
      if (plan.closeOnKill) queueMicrotask(() => value.close(null, 'SIGTERM'));
      return plan.killReturns !== false;
    };
    value.send = (message, callback) => {
      setup('send'); value.messages.push(message);
      if (Object.hasOwn(plan, 'sendThrows')) { faulted = true; throw plan.sendThrows; }
      setImmediate(() => callback?.(null));
    };
    input.write = () => {
      setup('stdin.write');
      if (Object.hasOwn(plan, 'writeThrows')) { faulted = true; throw plan.writeThrows; }
      return true;
    };
    input.end = () => {
      if (plan.streamError) setImmediate(() => {
        faulted = true;
        try { input.emit('error', plan.streamError); } catch (unhandled) { value.unhandled.push(unhandled); }
        setImmediate(() => value.close(0));
      });
      else if (plan.autoMcp) setImmediate(() => {
        output.emit('data', Buffer.from('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n')); value.close(0);
      });
    };
    for (const [name, stream] of [['stdin', input], ['stdout', output], ['stderr', stderr]]) {
      Object.defineProperty(value, name, { get() { setup(name); return plan.nullStdio ? null : stream; } });
    }
    value.unref = () => {};
    children.push(value);
    if (Object.hasOwn(plan, 'earlyError')) queueMicrotask(() => value.error(plan.earlyError));
    if (Object.hasOwn(plan, 'nextTickError')) process.nextTick(() => value.error(plan.nextTickError));
    return value;
  };
  const launch = () => child(plans[next++] || {});
  const productBatch = {
    beginBatch: () => ({ batch_token: 'a'.repeat(64) }), claimLocalBatchExecutor() { mutate('claim'); },
    releaseLocalBatchExecutor() { mutate('release'); }, discardIncompleteBatches() { mutate('discard'); },
    readBatchProgress: () => ({ complete: true, local_processing_active: false, released: 1 }),
    listBatchResults: () => ({ results: [{ package_id: 'ds_' + '1'.repeat(32) }] }),
    acknowledgeDeliveredPackage() { acknowledgements++; }, _test: {}
  };
  const suite = {
    async testAsync(_name, action) { try { await action(); } catch (error) { errors.push(error); fakeProcess.exitCode = 1; } },
    done: async () => {}, assert,
    failure: () => errors.length ? { failed: true, error: errors[0] } : { failed: false, error: undefined }
  };
  const virtual = path.resolve(__dirname, 'QA-VIRTUAL-ONLY-NO-FS');
  const io = { mkdtempSync: () => virtual, mkdirSync: () => mutate('mkdir'), readdirSync: () => [],
    writeFileSync: () => mutate('write'), utimesSync: () => mutate('utimes'), rmSync: () => mutate('rm') };
  const fakeProcess = { env: {}, execPath: 'QA-NODE-ONLY', pid: 4242, exit: code => exits.push(code) };
  const helper = { exports: {} };
  vm.runInNewContext(helperSource, { module: helper, process: fakeProcess, setTimeout: timer, clearTimeout: clear,
    require(name) {
      if (name === 'node:assert/strict') return require('node:assert/strict');
      if (name === 'node:fs') return { writeSync: (_fd, value) => diagnostics.push(value) };
      if (name === 'node:util') return { inspect };
      throw new Error('UNEXPECTED_QA_HELPER_IMPORT');
    } }, { filename: 'qa-parent-lifecycle.cjs:controlled-QA', timeout: 1000 });
  const sandbox = { process: fakeProcess, __dirname, Buffer, setTimeout: timer, clearTimeout: clear, setImmediate,
    console: { log() {}, error() {} },
    require(name) {
      if (name === 'fs') return io;
      if (name === 'os') return { tmpdir: () => virtual };
      if (name === 'path') return path;
      if (name === 'child_process') return { fork: launch, spawn: launch };
      if (name === 'events') return { EventEmitter };
      if (name === './helpers') return { createSuite: () => suite };
      if (name === './helpers/qa-parent-lifecycle.cjs') return helper.exports;
      if (name === '../plugins/data-secure/server/gateway/common') return { privacyRoot: () => virtual };
      if (name === '../plugins/data-secure/server/gateway/batch') return productBatch;
      if (name === '../plugins/data-secure/server/gateway/batch-executor') return { startLocalBatchExecutor(_token, options) {
        const launched = options.forkProcess('product-worker-is-not-launched', [], {});
        if (settings.productObserver) launched.on('error', () => { try { launched.kill(); } catch {} });
        if (Object.hasOwn(settings, 'startThrows')) { faulted = true; throw settings.startThrows; }
        if (Object.hasOwn(settings, 'workerError')) setImmediate(() => launched.error(settings.workerError));
        else setImmediate(() => launched.close(0));
        return { local_processing_started: true, complete: true, local_processing_active: false, released: 1 };
      } };
      if (name === '../plugins/data-secure/server/gateway/mapping') return {};
      if (name === '../plugins/data-secure/server/gateway/batch-evidence') return {};
      if (name === './lib/zip' || name === './lib/opc') return {};
      throw new Error('UNEXPECTED_SESSION_MODEL_IMPORT: ' + name);
    }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(prefix + '\nglobalThis.calls = { crashDetachedExecutor, mcpBatchCalls, testAsync };', context,
    { filename: 'test-batch-session.js:actual-prefix-QA', timeout: 1000 });
  return { api: context.calls, children, mutations, diagnostics, exits, timerValues,
    acknowledgements: () => acknowledgements,
    exitCode: () => fakeProcess.exitCode,
    async entry(outcome) {
      context.main = () => outcome.threw ? Promise.reject(outcome.error) : Promise.resolve();
      await vm.runInContext(entry, context, { filename: 'test-batch-session.js:actual-entry-QA', timeout: 1000 });
    },
    async case(title, nextTitle) {
      const begin = source.indexOf("  await testAsync('" + title + "'");
      const end = source.indexOf("  await testAsync('" + nextTitle + "'", begin + 1);
      assert.ok(begin > mainBoundary && end > begin);
      let action;
      context.captureCase = (_name, body) => { action = body; };
      const registration = source.slice(begin, end).replace('await testAsync(', 'await captureCase(');
      await vm.runInContext('(async () => {\n' + registration + '\n})()', context,
        { filename: 'test-batch-session.js:actual-case-QA', timeout: 1000 });
      assert.strictEqual(typeof action, 'function'); return action;
    },
    finish() { for (const handle of timers) clear(handle); }
  };
}
const detachedTitle = 'detached local worker finishes a real text batch after the starting call returns';
const detachedNext = 'result cursors are batch-bound and tampering fails closed';
const earlyTitle = 'a too-early Cowork follow-up does not mint a read capability while local processing is active';
const earlyNext = 'one mixed auto batch selects the profile independently for every document';
function assertFailureCli(model, expected, unknown) {
  assert.deepStrictEqual(model.exits, [1]);
  const line = model.diagnostics.find(value => value.startsWith('R6_TEST_CLI_FAILURE:'));
  assert.ok(line, 'the actual finalizer must reach the existing bounded CLI diagnosis');
  const record = JSON.parse(line.slice('R6_TEST_CLI_FAILURE:'.length));
  assert.strictEqual(record.verdict, 'FAILED'); assert.strictEqual(record.teardown, 'ALL_KNOWN_ATTEMPTED');
  assert.strictEqual(record.child_end, unknown ? 'UNCONFIRMED' : 'DIRECT_CLOSE_OBSERVED');
  assert.strictEqual(record.writer_join, 'NOT_CLAIMED');
  assert.ok(model.diagnostics.some(value => value.startsWith('R6_TEST_CLI_PRIMARY:')));
  assert.strictEqual(expected.threw, true);
}
async function main() {
  await testAsync('actual MCP installs child error/close witnesses before stdio and parses only after close', async () => {
    const model = harness([{ autoMcp: true }]);
    try {
      const result = await model.api.mcpBatchCalls([{ name: 'QA-only', arguments: {} }]);
      assert.strictEqual(result[0].result.ok, true);
      assert.ok(model.children[0].setup.every(point => point.error && point.close));
      assert.strictEqual(model.children[0].signals, 0); assert.strictEqual(model.children[0].closed, true);
      await model.entry({ threw: false }); assert.deepStrictEqual(model.exits, []);
    } finally { model.finish(); }
  });
  await testAsync('actual crash caller waits for close after exit17 and keeps its private IPC contract', async () => {
    const model = harness([{}]);
    try {
      let settled = false;
      const running = model.api.crashDetachedExecutor('a'.repeat(64), 2).then(value => { settled = true; return value; });
      await tick(); const child = model.children[0]; child.emit('exit', 17, null); await tick();
      const settledOnExit = settled; child.close(17); const result = await running;
      assert.strictEqual(settledOnExit, false); assert.strictEqual(result.code, 17); assert.strictEqual(result.signal, null);
      assert.deepStrictEqual(JSON.parse(JSON.stringify(child.messages)), [{ type: 'run-crash-test', batch_token: 'a'.repeat(64) }]);
      assert.ok(child.setup.every(point => point.error && point.close));
      await model.entry({ threw: false }); assert.deepStrictEqual(model.exits, []);
    } finally { model.finish(); }
  });
  await testAsync('actual permanent child error observation keeps a late error after close from becoming CLIzero', async () => {
    const model = harness([{ autoMcp: true }]);
    try {
      await model.api.mcpBatchCalls([]); await model.entry({ threw: false });
      model.children[0].error(undefined);
      let nextCases = 0;
      const outcome = await attempt(() => model.api.testAsync('late follow-up must not start', async () => { nextCases++; }));
      assert.strictEqual(outcome.threw, true); assert.strictEqual(outcome.error, undefined);
      assert.strictEqual(nextCases, 0); assert.strictEqual(model.exitCode(), 1);
      assert.strictEqual(model.children[0].signals, 0); assert.strictEqual(model.children[0].unhandled.length, 0);
    } finally { model.finish(); }
  });
  await testAsync('actual nullstdio/early error preserves its cause and attempts a finite owned stop before CLIexit', async () => {
    const primary = Object.freeze(new Error('synthetic spawn primary'));
    const model = harness([{ nullStdio: true, earlyError: primary, killThrows: false }], { forceCloseDeadline: true });
    try {
      const outcome = await attempt(() => model.api.mcpBatchCalls([])); await tick(); await model.entry(outcome);
      assert.strictEqual(outcome.threw, true); assert.strictEqual(outcome.error, primary);
      assert.strictEqual(model.children[0].unhandled.length, 0); assert.strictEqual(model.children[0].signals, 1);
      assertFailureCli(model, outcome, true);
    } finally { model.finish(); }
  });
  for (const code of ['EMFILE', 'ENFILE']) await testAsync('actual nullstdio ' + code + ' nextTick after a Promise continuation keeps the OS primary', async () => {
    const primary = Object.freeze(Object.assign(new Error('synthetic spawn ' + code), { code }));
    const model = harness([{ nullStdio: true, nextTickError: primary, killReturns: false }], { forceCloseDeadline: true });
    try {
      await Promise.resolve();
      const outcome = await attempt(() => model.api.mcpBatchCalls([])); await tick(); await model.entry(outcome);
      assert.strictEqual(outcome.threw, true); assert.strictEqual(outcome.error, primary);
      assert.strictEqual(model.children[0].unhandled.length, 0);
      assert.strictEqual(model.children[0].signals, 1);
      assertFailureCli(model, outcome, true);
    } finally { model.finish(); }
  });
  await testAsync('actual crash send throw false survives a secondary stop refusal', async () => {
    const model = harness([{ sendThrows: false, killThrows: 0 }], { forceCloseDeadline: true });
    try {
      const outcome = await attempt(() => model.api.crashDetachedExecutor('a'.repeat(64), 1)); await model.entry(outcome);
      assert.strictEqual(outcome.threw, true); assert.strictEqual(outcome.error, false);
      assert.strictEqual(model.children[0].signals, 1); assertFailureCli(model, outcome, true);
    } finally { model.finish(); }
  });
  for (const primary of [undefined, null, false, 0, '']) await testAsync('actual caller keeps falsy first failure ' + inspect(primary) + ' through secondary stop failure and skips the next case', async () => {
    const model = harness([{ writeThrows: primary, killThrows: new Error('synthetic secondary') }], { forceCloseDeadline: true });
    try {
      let nextCases = 0;
      const outcome = await attempt(async () => {
        await model.api.testAsync('first', () => model.api.mcpBatchCalls([{ name: 'QA-only', arguments: {} }]));
        await model.api.testAsync('must not start', async () => { nextCases++; });
      });
      await model.entry(outcome);
      assert.strictEqual(outcome.threw, true); assert.strictEqual(outcome.error, primary); assert.strictEqual(nextCases, 0);
      assert.strictEqual(model.children[0].signals, 1); assert.strictEqual(model.children[0].closed, false);
      assertFailureCli(model, outcome, true);
    } finally { model.finish(); }
  });
  await testAsync('actual stream error followed by close0 cannot become a successful MCP verdict', async () => {
    const primary = new Error('synthetic stream failure'), model = harness([{ streamError: primary }]);
    try {
      const outcome = await attempt(() => model.api.mcpBatchCalls([])); await tick(); await model.entry(outcome);
      assert.strictEqual(outcome.threw, true); assert.strictEqual(outcome.error, primary);
      assert.strictEqual(model.children[0].unhandled.length, 0); assertFailureCli(model, outcome, false);
    } finally { model.finish(); }
  });
  await testAsync('actual failed MCP-case finally cannot release/discard its root while close is unknown', async () => {
    const primary = new Error('synthetic write failure');
    const model = harness([{ writeThrows: primary, killReturns: false }], { forceCloseDeadline: true });
    try {
      const body = await model.case(earlyTitle, earlyNext);
      const outcome = await attempt(() => model.api.testAsync('actual early-follow-up case', body)); await model.entry(outcome);
      assert.strictEqual(model.children.length, 1);
      assert.ok(model.children[0].setup.some(point => point.stage === 'stdin.write'), 'actual write fault reached');
      assert.strictEqual(outcome.threw, true); assert.strictEqual(outcome.error, primary);
      assert.ok(!model.mutations.some(value => value.afterFault));
      assert.strictEqual(model.children[0].signals, 1); assertFailureCli(model, outcome, true);
    } finally { model.finish(); }
  });
  await testAsync('all returned own records get one attempt even when the first stop throws', async () => {
    const primary = new Error('first child failure'), secondary = new Error('second child failure');
    const model = harness([{ killThrows: 0 }, { closeOnKill: true }], { forceCloseDeadline: true });
    try {
      const first = attempt(() => model.api.mcpBatchCalls([])), second = attempt(() => model.api.mcpBatchCalls([]));
      await tick(); model.children[0].error(primary); model.children[1].error(secondary);
      const outcomes = await Promise.all([first, second]); await model.entry(outcomes[0]);
      assert.strictEqual(outcomes[0].error, primary); assert.strictEqual(outcomes[1].error, primary);
      assert.deepStrictEqual(model.children.map(value => value.signals), [1, 1]);
      assert.strictEqual(model.children[1].closed, true); assertFailureCli(model, outcomes[0], true);
    } finally { model.finish(); }
  });
  for (const startFailure of [true, false]) await testAsync('actual detached case retains ownership through ' + (startFailure ? 'throw after fork' : 'product observer failure without a duplicate signal'), async () => {
    const primary = undefined;
    const model = harness([{ killThrows: new Error('secondary stop refusal') }], { forceCloseDeadline: true,
      ...(startFailure ? { startThrows: primary } : { workerError: primary, productObserver: true }) });
    try {
      const body = await model.case(detachedTitle, detachedNext);
      const outcome = await attempt(() => model.api.testAsync('actual detached case', body));
      model.children[0].error(new Error('late secondary error'));
      model.children[0].emit('exit', 1, null); // Still no close witness.
      await model.entry(outcome);
      assert.strictEqual(outcome.threw, true); assert.strictEqual(outcome.error, primary);
      assert.strictEqual(model.children[0].signals, 1); assert.strictEqual(model.children[0].unhandled.length, 0);
      assert.ok(!model.mutations.some(value => value.afterFault));
      if (!startFailure) assert.ok(model.timerValues.includes(180_000), 'unchanged actual normal watchdog');
      assertFailureCli(model, outcome, true);
    } finally { model.finish(); }
  });
  await testAsync('actual detached normal case retains its content/progress/ack assertions without a stop', async () => {
    const model = harness([{}]);
    try {
      const body = await model.case(detachedTitle, detachedNext);
      const outcome = await attempt(() => model.api.testAsync('actual detached normal case', body)); await model.entry(outcome);
      assert.strictEqual(outcome.threw, false); assert.strictEqual(model.acknowledgements(), 1);
      assert.strictEqual(model.children[0].signals, 0); assert.strictEqual(model.children[0].closed, true);
      assert.ok(model.children[0].setup.every(point => point.error && point.close));
      assert.ok(model.timerValues.includes(180_000)); assert.deepStrictEqual(model.exits, []);
    } finally { model.finish(); }
  });
  await done();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
