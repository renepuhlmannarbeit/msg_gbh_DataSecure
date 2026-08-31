// Pure protocol tests. No native helper, process, product job or keyring runs here.
import { createRequire } from 'node:module';
import { createObserverProtocol, createObserverOutputBudget } from '../scripts/lib/sea-process-observer.mjs';

const { createSuite } = createRequire(import.meta.url)('./helpers');
const { test, done, assert } = createSuite('SEA process observer: synthetic protocol only');
const schema = 'datasecure-sea-process-observer/v1';
const frame = (event, fields = {}) => JSON.stringify({ schema, event, ...fields });

function protocolAt(state, exitCode = 0) {
  const protocol = createObserverProtocol();
  if (state !== 'init') protocol.accept(frame('listening'));
  if (['armed', 'exited'].includes(state)) protocol.accept(frame('armed'));
  if (state === 'exited') protocol.accept(frame('exited', { exit_code: exitCode }));
  return protocol;
}

function rejectAndLatch(protocol, line) {
  assert.throws(() => protocol.accept(line));
  assert.strictEqual(protocol.state, 'invalid');
  // A later apparently good transcript cannot repair this attempt.
  assert.throws(() => protocol.accept(frame('listening')));
  assert.throws(() => protocol.finish(0, null, ''));
  assert.strictEqual(protocol.state, 'invalid');
}

test('independent instances start at init without any evidence', () => {
  const first = createObserverProtocol();
  const second = createObserverProtocol();
  assert.strictEqual(first.state, 'init');
  first.accept(frame('listening'));
  assert.strictEqual(first.state, 'listening');
  assert.strictEqual(second.state, 'init');
});

test('only listening -> armed -> exited -> successful finish returns exit evidence', () => {
  const protocol = createObserverProtocol();
  protocol.accept(frame('listening'));
  assert.strictEqual(protocol.state, 'listening');
  protocol.accept(frame('armed'));
  assert.strictEqual(protocol.state, 'armed');
  protocol.accept(frame('exited', { exit_code: 0 }));
  assert.strictEqual(protocol.state, 'exited');
  assert.deepStrictEqual(protocol.finish(0, null, ''), { worker_exit_observed: true, exit_code: 0 });
  assert.strictEqual(protocol.state, 'finished');
});

for (const exitCode of [1, 259, 2147483648, 4294967295]) {
  test(`signaled worker exit code ${exitCode} remains uint32 data, not liveness`, () => {
    const result = protocolAt('exited', exitCode).finish(0, null, '');
    assert.deepStrictEqual(result, { worker_exit_observed: true, exit_code: exitCode });
    assert.deepStrictEqual(Object.keys(result).sort(), ['exit_code', 'worker_exit_observed']);
  });
}

test('finished result is single use', () => {
  const protocol = protocolAt('exited');
  protocol.finish(0, null, '');
  assert.throws(() => protocol.finish(0, null, ''));
});

test('frames after successful finish cannot reopen an attempt', () => {
  const protocol = protocolAt('exited');
  protocol.finish(0, null, '');
  assert.throws(() => protocol.accept(frame('listening')));
  assert.throws(() => protocol.finish(0, null, ''));
});

for (const state of ['init', 'listening', 'armed']) {
  test(`clean helper termination at ${state} is not worker-exit evidence`, () => {
    const protocol = protocolAt(state);
    assert.throws(() => protocol.finish(0, null, ''));
    assert.strictEqual(protocol.state, 'invalid');
    assert.throws(() => protocol.accept(frame('exited', { exit_code: 0 })));
  });
}

for (const [state, event] of [
  ['init', 'armed'], ['init', 'exited'], ['listening', 'listening'],
  ['listening', 'exited'], ['armed', 'listening'], ['armed', 'armed'],
  ['exited', 'listening'], ['exited', 'armed'], ['exited', 'exited']
]) {
  test(`${event} at ${state} is rejected and permanently invalidates the attempt`, () => {
    rejectAndLatch(protocolAt(state), frame(event, event === 'exited' ? { exit_code: 0 } : {}));
  });
}

test('malformed JSON, multiple frames, nonobjects and nonstrings fail closed', () => {
  for (const line of ['', ' ', '{', 'null', '[]', 'true', '42', '"listening"',
    `${frame('listening')}\n${frame('armed')}`, undefined, null, 42, {}, Buffer.from(frame('listening'))]) {
    rejectAndLatch(createObserverProtocol(), line);
  }
});

test('oversized frames cannot be hidden in JSON whitespace', () => {
  rejectAndLatch(createObserverProtocol(), `${' '.repeat(1025)}${frame('listening')}`);
  rejectAndLatch(createObserverProtocol(), frame('listening', { padding: 'x'.repeat(2048) }));
});

test('schema and event fields are required, typed and exact', () => {
  for (const value of [{}, { schema }, { event: 'listening' },
    { schema: null, event: 'listening' }, { schema: 1, event: 'listening' },
    { schema: 'datasecure-sea-process-observer/v0', event: 'listening' },
    { schema, event: null }, { schema, event: ['listening'] },
    { schema, event: 'ready' }, { schema, event: 'Listening' }]) {
    rejectAndLatch(createObserverProtocol(), JSON.stringify(value));
  }
});

test('listening and armed do not accept additional fields or identity disclosures', () => {
  for (const event of ['listening', 'armed']) {
    for (const extra of [{ extra: true }, { pid: 123 }, { nonce: 'synthetic' },
      { image: 'synthetic-image' }, { exit_code: 0 }, { code: 'OBSERVER_READY' }]) {
      rejectAndLatch(protocolAt(event === 'listening' ? 'init' : 'listening'), frame(event, extra));
    }
  }
});

test('exited requires an integer uint32 exit_code', () => {
  for (const exitCode of [undefined, null, false, '0', -1, 0.5, 4294967296, [], {}]) {
    rejectAndLatch(protocolAt('armed'), frame('exited', { exit_code: exitCode }));
  }
});

test('exited never accepts inferred cleanup, parent or product success', () => {
  for (const extra of [{ cleanup_safe: true }, { parent_crash_verified: true },
    { privacy_release_verified: true }, { worker_exit_observed: true }, { extra: false }]) {
    rejectAndLatch(protocolAt('armed'), frame('exited', { exit_code: 0, ...extra }));
  }
});

for (const state of ['init', 'listening', 'armed']) {
  test(`explicit helper failure at ${state} latches NO-GO`, () => {
    for (const code of ['OBSERVER_OPEN_FAILED', 'OBSERVER_WAIT_FAILED', 'OBSERVER_DEADLINE']) {
      rejectAndLatch(protocolAt(state), frame('failed', { code }));
    }
  });
}

test('failed messages after exited cannot override terminal evidence', () => {
  rejectAndLatch(protocolAt('exited'), frame('failed', { code: 'OBSERVER_DEADLINE' }));
});

test('malformed failure codes and additional raw diagnostic fields are rejected', () => {
  for (const fields of [{}, { code: null }, { code: 1 }, { code: 'observer_failed' },
    { code: 'OBSERVER_' }, { code: `OBSERVER_${'X'.repeat(61)}` },
    { code: 'OBSERVER_FAILED\nraw diagnostic' }, { code: 'OBSERVER_FAILED', detail: 'private error' }]) {
    rejectAndLatch(protocolAt('armed'), frame('failed', fields));
  }
});

test('observer failure exit, signal, stderr or missing termination metadata reject valid transcript', () => {
  for (const [code, signal, stderr] of [
    [1, null, ''], [259, null, ''], [null, null, ''], [undefined, null, ''],
    ['0', null, ''], [0, 'SIGTERM', ''], [0, undefined, ''], [0, '', ''],
    [0, null, 'unexpected diagnostic'], [0, null, '\n'], [0, null, undefined],
    [0, null, null], [0, null, Buffer.alloc(0)]
  ]) {
    const protocol = protocolAt('exited');
    assert.throws(() => protocol.finish(code, signal, stderr));
    assert.strictEqual(protocol.state, 'invalid');
    assert.throws(() => protocol.finish(0, null, ''));
  }
});

test('invalid helper output cannot be repaired with an entirely fresh valid sequence', () => {
  const protocol = protocolAt('armed');
  rejectAndLatch(protocol, frame('unknown'));
  for (const line of [frame('listening'), frame('armed'), frame('exited', { exit_code: 0 })]) {
    assert.throws(() => protocol.accept(line));
    assert.strictEqual(protocol.state, 'invalid');
  }
});

test('shared stdout/stderr budget accepts the exact byte limit, not a byte more', () => {
  const budget = createObserverOutputBudget(8);
  assert.strictEqual(budget.accept(Buffer.alloc(3)), true);
  assert.strictEqual(budget.accept(Buffer.alloc(5)), true);
  assert.strictEqual(budget.accept(Buffer.alloc(1)), false);
});

test('overflow is latched and later small chunks never restart buffering', () => {
  const budget = createObserverOutputBudget(8);
  assert.strictEqual(budget.accept(Buffer.alloc(9)), false);
  for (let index = 0; index < 100; index++) assert.strictEqual(budget.accept('x'), false);
  assert.strictEqual(budget.accept(''), false);
});

test('output limits count UTF-8 bytes and separate attempts have separate budgets', () => {
  const first = createObserverOutputBudget(4), second = createObserverOutputBudget(4);
  assert.strictEqual(first.accept('äö'), true);
  assert.strictEqual(first.accept('a'), false);
  assert.strictEqual(second.accept('test'), true);
});

test('unsafe output budget limits are rejected', () => {
  for (const limit of [0, -1, 1.5, NaN, Infinity, '8', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createObserverOutputBudget(limit));
  }
});

test('parent mode requires native parent-exited before accepting worker exit', () => {
  const protocol = createObserverProtocol(true);
  for (const event of ['listening', 'armed', 'parent-exited']) protocol.accept(frame(event));
  protocol.accept(frame('exited', { exit_code: 7 }));
  assert.deepStrictEqual(protocol.finish(0, null, ''), { worker_exit_observed: true, exit_code: 7,
    parent_exit_observed: true, worker_alive_at_parent_exit: true });
});

test('parent observation mode is a strict boolean, not a truthy value', () => {
  for (const value of [null, 0, 1, 'true', 'false', {}, []]) assert.throws(() => createObserverProtocol(value));
});

test('worker-only observation never accepts a parent-exited claim', () => {
  rejectAndLatch(protocolAt('armed'), frame('parent-exited'));
});

test('missing native parent-exited cannot be replaced by JS parent metadata', () => {
  const protocol = createObserverProtocol(true);
  protocol.accept(frame('listening')); protocol.accept(frame('armed'));
  rejectAndLatch(protocol, frame('exited', { exit_code: 7 }));
});

for (const prefix of [[], ['listening'], ['listening', 'armed', 'parent-exited']]) {
  test(`parent-exited rejects premature/repeated state after ${prefix.join('/') || 'init'}`, () => {
    const protocol = createObserverProtocol(true);
    for (const event of prefix) protocol.accept(frame(event));
    rejectAndLatch(protocol, frame('parent-exited'));
  });
}

test('parent-exited forbids extra process identifiers, timestamps and release assertions', () => {
  for (const fields of [{ pid: 123 }, { parent_crash_verified: true }, { timestamp: 1 }, { exit_code: 0 }]) {
    const protocol = createObserverProtocol(true);
    protocol.accept(frame('listening')); protocol.accept(frame('armed'));
    rejectAndLatch(protocol, frame('parent-exited', fields));
  }
});

test('parent-exited alone never proves worker exit even after helper success', () => {
  const protocol = createObserverProtocol(true);
  for (const event of ['listening', 'armed', 'parent-exited']) protocol.accept(frame(event));
  assert.throws(() => protocol.finish(0, null, ''));
});

test('helper failure after native parent observation rejects all evidence', () => {
  const protocol = createObserverProtocol(true);
  for (const event of ['listening', 'armed', 'parent-exited']) protocol.accept(frame(event));
  rejectAndLatch(protocol, frame('failed', { code: 'OBSERVER_DEADLINE' }));
});

done();
