'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const { firstFailure, within, ownChild } = require('./helpers/qa-parent-lifecycle.cjs');
const { fastModel, intakeModel } = require('./lib/small-process-parent-source.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const message = id => ({ schema: 'datasecure-standalone-private-ipc/1', request_id: id.repeat(16), action: 'get_public_state' });
async function outcome(action, limit = 2000) {
  try { return { failed: false, value: await within(Promise.resolve().then(action), limit, 'SMALL_MODEL_GUARD') }; }
  catch (error) { return { failed: true, error }; }
}
function packet(value) {
  const bytes = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length); return Buffer.concat([header, bytes]);
}
function child(name, events, options = {}) {
  const value = new EventEmitter();
  value.exitCode = null; value.signalCode = null; value.connected = true;
  value.on('error', () => {}); // Fixture sink keeps the old missing observer from killing this test driver.
  value.stdin = new EventEmitter(); value.stdout = new EventEmitter(); value.stderr = new EventEmitter();
  value.end = (code = 0) => {
    if (value.exitCode !== null) return;
    value.exitCode = code; value.connected = false;
    events.push(name + ':closed'); value.emit('exit', code, null); value.emit('close', code, null);
  };
  value.stdin.write = (bytes, callback) => {
    const request = JSON.parse(bytes.subarray(4).toString('utf8'));
    events.push(name + ':' + request.action); callback?.();
    if (request.action === 'shutdown' && !options.silent) {
      queueMicrotask(() => value.stdout.emit('data', packet({ request_id: request.request_id, ok: true })));
      setImmediate(() => value.end());
    }
    return true;
  };
  value.send = (message, callback) => {
    events.push(name + ':' + message.type);
    if (message.type === 'release') {
      if (Object.hasOwn(options, 'releaseError')) throw options.releaseError;
      callback?.(); setImmediate(() => value.end()); return true;
    }
    callback?.();
    if (!options.startError) {
      const type = options.blocked ? 'blocked' : 'acquired';
      queueMicrotask(() => value.emit('message', { type }));
      if (options.blocked || message.hold !== true) setImmediate(() => value.end());
    }
    return true;
  };
  value.kill = () => {
    events.push(name + ':kill');
    if (Object.hasOwn(options, 'killError')) throw options.killError;
    if (options.closeOnKill !== false) setImmediate(() => value.end());
    return options.closeOnKill !== false;
  };
  if (options.noStdio) value.stdin = value.stdout = value.stderr = null;
  queueMicrotask(() => options.startError ? value.emit('error', options.startError) : value.emit('spawn'));
  return value;
}
test('valid actual fast methods accept fragmented replies, then confirm real modeled close before faults', async () => {
  const events = []; let current;
  const model = fastModel(() => (current = child('valid', events)));
  const request = model.launch(), reply = request(message('a'));
  await tick();
  const bytes = packet({ request_id: 'a'.repeat(16), ok: true });
  current.stdout.emit('data', bytes.subarray(0, 3)); current.stdout.emit('data', bytes.subarray(3));
  assert.equal((await reply).ok, true); await model.stop(); await model.cleanup();
  assert.ok(events.includes('valid:shutdown') && events.includes('valid:closed'));
});
test('actual frame callback rejects pending and future work with its first fault instead of EventEmitter throw', async () => {
  const invalid = [Buffer.from([0, 16, 0, 1]), packet(null), packet({ request_id: 'foreign' }),
    Buffer.from([0, 0, 0, 2, 123, 123])];
  for (const bytes of invalid) {
    const events = []; let current;
    const model = fastModel(() => (current = child('frame', events)));
    const request = model.launch(), waiting = request(message('b'));
    waiting.catch(() => {});
    try {
      await tick();
      assert.doesNotThrow(() => current.stdout.emit('data', bytes));
      const rejected = await outcome(() => waiting);
      assert.equal(rejected.failed, true);
      const later = await outcome(() => request(message('c')));
      assert.equal(later.failed, true); assert.strictEqual(later.error, rejected.error);
      assert.strictEqual(model.context.primary.value, rejected.error);
    } finally { current.end(9); await waiting.catch(() => {}); await model.cleanup(); }
  }
});
test('actual stream fault between requests latches the same failure for future requests', async () => {
  const events = [], primary = Error('TRANSPORT_BETWEEN_REQUESTS'); let current;
  const model = fastModel(() => (current = child('between', events)));
  const request = model.launch(); await tick();
  current.stdin.emit('error', primary);
  const result = await outcome(() => request(message('c')));
  assert.equal(result.failed, true); assert.strictEqual(result.error, primary);
  current.end(9); await model.cleanup();
});
test('actual fast startup owns EMFILE/ENFILE handles with absent stdio and keeps error separate from close', async () => {
  for (const code of ['EMFILE', 'ENFILE']) {
    const primary = Object.assign(Error(code), { code }), events = []; let current;
    const model = fastModel(() => (current = child('startup', events, { noStdio: true, startError: primary })));
    let request; assert.doesNotThrow(() => { request = model.launch(); });
    const result = await outcome(() => request(message('d')));
    assert.equal(result.failed, true); assert.strictEqual(result.error, primary);
    assert.equal(model.context.children.length, 1);
    assert.equal(model.context.children[0].owned.closed, false);
    current.end(1); await model.cleanup();
    assert.equal(model.context.children[0].owned.closed, true);
  }
});
test('actual fast body/finally preserves every falsy or frozen primary and attempts a later owned record', async () => {
  for (const primary of [undefined, null, false, 0, '', Object.freeze(Error('BODY_PRIMARY'))]) {
    const events = [], secondary = Error('KILL_SECONDARY'), handles = []; let model;
    model = fastModel(() => {
      const current = child('child' + handles.length, events, handles.length ? {} : { silent: true, killError: secondary });
      handles.push(current); return current;
    }, { scenario: async () => { model.launch(); throw primary; } });
    const result = await outcome(() => model.run());
    assert.equal(result.failed, true); assert.strictEqual(result.error, primary);
    assert.equal(events.filter(value => value === 'child0:kill').length, 1);
    assert.ok(events.includes('child1:shutdown') && events.includes('child1:closed'));
    assert.deepEqual(model.operations, [], 'no root removal after a failed or uncertain finish');
  }
});
test('valid actual intake main runs both real callback bodies before injected faults', async () => {
  let count = 0; const events = [];
  const model = intakeModel(() => child('intake' + count, events, { blocked: count++ === 1 }));
  const result = await outcome(() => model.main());
  await model.suite.done();
  assert.equal(result.failed, false); assert.equal(model.suite.failure().failed, false); assert.equal(count, 4);
});
test('actual intake failure after first ownership stops all records, retains root and cannot be swallowed by done', async () => {
  const primary = Error('SECOND_STARTUP_FAILED'), events = [], handles = [];
  const model = intakeModel(() => {
    const current = child('intake' + handles.length, events, handles.length === 1 ? { startError: primary } : {});
    handles.push(current); return current;
  });
  const result = await outcome(() => model.main());
  assert.equal(result.failed, true); assert.strictEqual(result.error, primary);
  assert.strictEqual(model.suite.failure().error, primary);
  assert.equal(handles.length, 2, 'no new recovery fixture after failed or uncertain ownership');
  assert.ok(handles.every(value => value.exitCode !== null));
  assert.ok(!model.operations.includes('remove') && !model.operations.includes('reset'));
});
test('actual intake caller preserves falsy suite primaries across failed release/kill and still finishes the other record', async () => {
  for (const primary of [undefined, null, false, 0, '', Object.freeze(Error('INTAKE_BODY_PRIMARY'))]) {
    let count = 0, checks = 0; const events = [], secondary = Error('CLEANUP_SECONDARY');
    const injected = Object.assign({}, assert, { strictEqual(...args) {
      if (++checks === 1) throw primary;
      return assert.strictEqual(...args);
    } });
    const model = intakeModel(() => {
      const index = count++;
      return child('intake' + index, events, index === 0 ? { releaseError: secondary, killError: secondary } : { blocked: index === 1 });
    }, { assert: injected });
    const result = await outcome(() => model.main());
    assert.equal(result.failed, true); assert.strictEqual(result.error, primary);
    assert.strictEqual(model.suite.failure().error, primary); assert.equal(count, 2);
    assert.ok(events.includes('intake1:closed')); assert.equal(events.filter(value => value === 'intake0:kill').length, 1);
    assert.ok(!model.operations.includes('remove') && !model.operations.includes('reset'));
  }
});
test('actual intake result observes close before any message rather than waiting forever', async () => {
  let count = 0; const events = [];
  const model = intakeModel(() => {
    const current = child('early' + count++, events);
    current.send = (value, callback) => { callback?.(); setImmediate(() => current.end()); return true; };
    return current;
  });
  const result = await outcome(() => model.main(), 300);
  assert.equal(result.failed, true); assert.equal(result.error.message, 'INTAKE_CLOSED_BEFORE_MESSAGE');
  assert.ok(!model.operations.includes('remove'));
});
// Real Node TEST parents. Their referenced own guards never count as normal code0/1.
// Child selfdeadlines are finite backstops, not required after-parent receipts.
async function cli(mode, failed) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), mode === 'fast' ? 'datasecure-fast-ipc-' : 'datasecure-intake-reservation-'));
  const fixture = path.join(__dirname, 'helpers/small-process-cli-fixture.cjs'), failure = firstFailure();
  const parent = cp.fork(fixture, [root, mode, failed ? 'failure' : 'positive'], {
    execArgv: [], windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  const owned = ownChild(parent, error => failure.record(error));
  let stderr = '', stageResolve;
  const admitted = new Promise(resolve => { stageResolve = resolve; });
  parent.stdout?.on('data', () => {});
  parent.stderr?.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(-16384); });
  parent.on('message', value => { if (value?.type === 'stage-admitted') stageResolve(value); });
  let result, primary, stage;
  try {
    stage = await within(Promise.race([admitted, owned.error.then(error => { throw error; }),
      owned.done.then(() => { throw Error('CLI_CLOSED_BEFORE_STAGE'); })]), 20000, 'CLI_STAGE_TIMEOUT');
    assert.equal(stage.mode, mode); assert.equal(stage.failed, failed);
    assert.equal(stage.stage, failed ? 'fault' : 'positive'); assert.equal(stage.parent_guard_code, 75);
    assert.equal(stage.primary, failed ? mode === 'fast' ? 'undefined' : 'INTAKE_CLOSED_BEFORE_MESSAGE' : null);
    assert.equal(stage.exit_code_binding, 'REAL_SYMMETRIC_VERIFIED');
    result = await within(owned.done, failed ? 12000 : 20000, 'CLI_DID_NOT_RETURN');
  } catch (error) { primary = error; failure.record(error); }
  finally {
    try { if (!owned.closed) owned.terminate(); } catch (error) { failure.record(error); }
    try { await within(owned.done, 1000, 'CLI_PARENT_CLOSE_UNCONFIRMED'); } catch (error) { failure.record(error); }
  }
  if (failure.failed) throw failure.value;
  assert.equal(primary, undefined); assert.equal(owned.closed, true);
  assert.equal(result.signal, null); assert.equal(result.code, failed ? 1 : 0);
  assert.equal(fs.existsSync(path.join(root, 'parent-guard.json')), false, 'reserved parent cut is not normal CLI completion');
  assert.ok(fs.lstatSync(root).isDirectory(), 'retain this own evidence scope');
  const admission = JSON.parse(fs.readFileSync(path.join(root, 'admitted.json'), 'utf8'));
  const { type, ...details } = stage; assert.equal(type, 'stage-admitted'); assert.deepEqual(details, admission);
  const summary = JSON.parse(fs.readFileSync(path.join(root, 'finished.json'), 'utf8'));
  assert.equal(summary.failed, failed); assert.deepEqual(summary.admitted, admission);
  assert.equal(summary.exit_code_binding, 'REAL_SYMMETRIC_VERIFIED');
  if (!failed) assert.ok(summary.fixture_children.every(value => value.closed && value.code === 0 && value.signal === null));
  if (failed) {
    assert.equal(summary.removed, false);
    assert.ok(summary.kills.includes(0), 'the actual parent attempted its saved own termination');
    const admittedAt = summary.events.indexOf('stage-admitted');
    const firstStop = summary.events.findIndex(value => value.startsWith('source-terminate:'));
    assert.ok(admittedAt >= 0 && firstStop > admittedAt, 'admit the intended fault before the first source termination');
    assert.match(stderr, /R6_TEST_CLI_FAILURE:.*ALL_KNOWN_ATTEMPTED/u);
    assert.match(stderr, /STATUS_UNCONFIRMED/u); assert.match(stderr, /scope_roots/u);
    assert.match(stderr, /writer_join.*NOT_CLAIMED/u);
    if (mode === 'fast') {
      assert.equal(summary.primary_kind, 'undefined'); assert.equal(summary.primary_message, 'undefined');
      assert.match(stderr, /R6_TEST_CLI_PRIMARY:undefined/u);
    } else {
      assert.equal(summary.primary_message, 'INTAKE_CLOSED_BEFORE_MESSAGE');
      assert.match(stderr, /INTAKE_CLOSED_BEFORE_MESSAGE/u);
    }
  }
}
test('valid own Node CLI controls precede held-handle failure cases', async () => {
  await cli('fast', false); await cli('intake', false);
});
test('actual failed Fast/intake CLI hooks end with1 before the reserved parent guard after admitted faults', async () => {
  await cli('fast', true); await cli('intake', true);
});
