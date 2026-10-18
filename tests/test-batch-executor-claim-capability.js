'use strict';

// Actual factory; explicit RAM journal/kernel/process models, not an OS race or
// native guard acceptance. No public DTO or serialized value grants authority.
const { createSuite } = require('./helpers');
const { createBatchExecutorLease } = require('../plugins/data-secure/server/gateway/batch-executor-lease');
const { test, assert, done } = createSuite('Exact executor claim capabilities / RAM models');
const TOKEN = 'a'.repeat(64), PID = 1234, BIRTH = 'b'.repeat(64), NOW = '2026-10-18T00:00:00.000Z';
const error = code => Object.assign(new Error('fixed'), { code });
function fixture() {
  let state = { token: TOKEN }, alive = true, birth = BIRTH, serial = 0, writes = 0, entered = 0;
  let before, after, writeError, complete = false, lastProgress, actionResult;
  const deps = { SafeError: Error, currentPid: () => 9999, processAlive: () => alive,
    processInstanceIdentity: () => alive ? birth : null,
    liveLocalExecutor: value => !!value.local_executor_pid && alive && value.local_executor_birth_id === birth,
    randomBytes: size => Buffer.alloc(size, ++serial), nowIso: () => NOW,
    withSynchronousActiveLock(token, action) { if (before) throw before; entered++; const result = action(); actionResult = result; if (after) throw after; return result; },
    readState: () => structuredClone(state), writeState: value => { if (writeError) throw writeError; state = structuredClone(value); writes++; },
    publicProgress() { lastProgress = { complete, remaining: complete ? 0 : 1, delivery_pending: 0, mapping_pending: 0, deferred_review: 0, retryable: 0 }; return lastProgress; } };
  const api = createBatchExecutorLease(deps);
  return { api, deps, state: () => structuredClone(state), replace: value => { state = structuredClone(value); },
    claim: () => api.claimLocalBatchExecutor(TOKEN, PID), writes: () => writes, entered: () => entered,
    dead: () => { alive = false; }, reborn: value => { alive = true; birth = value; },
    block: value => { before = value; }, closeError: value => { after = value; }, failWrite: value => { writeError = value; },
    terminal: () => { complete = true; }, progress: () => lastProgress, actionResult: () => actionResult };
}
test('public claim keys unchanged; hidden epoch and nonce do not serialize', () => {
  const h = fixture(), proof = h.claim();
  assert.deepStrictEqual(Object.keys(proof).sort(), ['ok', 'raw_content_sent_to_claude', ...Object.keys(h.progress())].sort());
  assert.deepStrictEqual(Reflect.ownKeys(proof), Object.keys(proof));
  assert.doesNotMatch(JSON.stringify(proof), /lease_id|started_at|birth|1234|aaaaaaaa/);
  assert.match(h.state().local_executor_lease_id, /^[a-f0-9]{32}$/);
});
test('copies, proxies, primitives and another issuer cannot mint authority', () => {
  const h = fixture(), proof = h.claim(), other = fixture(), before = h.state();
  for (const fake of [undefined, null, 1, 'proof', {}, { ...proof }, JSON.parse(JSON.stringify(proof)), new Proxy(proof, {})])
    assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(fake), false);
  assert.strictEqual(other.api.releaseClaimedLocalBatchExecutor(proof), false);
  assert.deepStrictEqual(h.state(), before); assert.strictEqual(h.writes(), 1);
});
test('only original proof releases a dead child and is consumed exactly once', () => {
  const h = fixture(), proof = h.claim(); h.dead();
  assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(proof), true);
  assert.deepStrictEqual(h.state(), { token: TOKEN });
  assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(proof), false); assert.strictEqual(h.writes(), 2);
});
test('public DTO mutation changes no captured authority', () => {
  const h = fixture(), proof = h.claim(); proof.ok = false; proof.token = 'f'.repeat(64); proof.pid = 9876;
  assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(proof), true);
});
for (const field of ['token', 'local_executor_pid', 'local_executor_birth_id', 'local_executor_started_at', 'local_executor_lease_id'])
  test('replacement preserves exact mismatching ' + field, () => {
    const h = fixture(), proof = h.claim(), replacement = h.state();
    replacement[field] = field === 'local_executor_pid' ? 4321 : 'replacement'; h.replace(replacement);
    assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(proof), false); assert.deepStrictEqual(h.state(), replacement);
  });
test('same PID/birth/frozen time reacquisition has a new nonce; old proof cannot release it', () => {
  const h = fixture(), first = h.claim(), old = h.state();
  // Worker release does not consume the parent's WeakMap capability. Therefore
  // this specifically exercises the nonce, not merely a consumed-proof check.
  const worker = createBatchExecutorLease({ ...h.deps, currentPid: () => PID });
  assert.strictEqual(worker.releaseLocalBatchExecutor(TOKEN, PID), true);
  const second = h.claim(), replacement = h.state();
  assert.strictEqual(old.local_executor_started_at, replacement.local_executor_started_at);
  assert.notStrictEqual(old.local_executor_lease_id, replacement.local_executor_lease_id);
  assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(first), false);
  assert.deepStrictEqual(h.state(), replacement); assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(second), true);
});
test('old proof after PID reuse preserves a newly claimed foreign process epoch', () => {
  const h = fixture(), first = h.claim(); h.reborn('c'.repeat(64)); const second = h.claim(), replacement = h.state();
  assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(first), false); assert.deepStrictEqual(h.state(), replacement);
  assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(second), true);
});
test('non-runnable result issues no proof and writes no nonce', () => {
  const h = fixture(); h.terminal(); const result = h.claim();
  assert.strictEqual(result.ok, false); assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(result), false);
  assert.strictEqual(h.writes(), 0); assert.deepStrictEqual(h.state(), { token: TOKEN });
});
for (const phase of ['write', 'close']) test('failed ' + phase + ' claim cannot register its unreturned result', () => {
  const h = fixture(), fault = error('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED');
  if (phase === 'write') h.failWrite(fault); else h.closeError(fault);
  assert.throws(() => h.claim(), value => value === fault);
  assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(h.actionResult()), false);
  assert.strictEqual(h.writes(), phase === 'close' ? 1 : 0);
});
for (const code of ['OWNERSHIP_GUARD_BUSY', 'STANDALONE_OWNERSHIP_CONTROL_BUSY'])
  test('pre-action ' + code + ' retains the SAME proof without mutation or implicit retry', () => {
    const h = fixture(), proof = h.claim(), before = h.state(), calls = h.entered(), fault = error(code); h.block(fault);
    assert.throws(() => h.api.releaseClaimedLocalBatchExecutor(proof), value => value === fault);
    assert.deepStrictEqual(h.state(), before); assert.strictEqual(h.entered(), calls);
    h.block(null); assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(proof), true);
  });
for (const code of ['OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'OWNERSHIP_GUARD_NAMESPACE_CHANGED', 'EACCES'])
  test('hard pre-action ' + code + ' invalidates proof rather than granting retry authority', () => {
    const h = fixture(), proof = h.claim(), before = h.state(), fault = error(code); h.block(fault);
    assert.throws(() => h.api.releaseClaimedLocalBatchExecutor(proof), value => value === fault);
    h.block(null); assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(proof), false); assert.deepStrictEqual(h.state(), before);
  });
test('post-write close failure preserves commit but never manufactures release success', () => {
  const h = fixture(), proof = h.claim(), fault = error('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED'); h.closeError(fault);
  assert.throws(() => h.api.releaseClaimedLocalBatchExecutor(proof), value => value === fault);
  assert.deepStrictEqual(h.state(), { token: TOKEN }); h.closeError(null);
  assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(proof), false); assert.strictEqual(h.writes(), 2);
});
for (const location of ['pre-action', 'write-stage']) test(location + ' getter/proxy classifier cannot create automatic retry authority', () => {
  for (const fault of [...(location === 'write-stage' ? [error('OWNERSHIP_GUARD_BUSY')] : []), Object.defineProperty({}, 'code', { get() { throw Error('getter invoked'); } }),
    new Proxy({}, { getOwnPropertyDescriptor() { throw Error('proxy invoked'); } })]) {
    const h = fixture(), proof = h.claim();
    if (location === 'pre-action') h.block(fault); else h.failWrite(fault);
    assert.throws(() => h.api.releaseClaimedLocalBatchExecutor(proof), value => value === fault);
    h.block(null); h.failWrite(null); assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(proof), false);
  }
});
test('legacy release rejects a reused foreign PID before any transaction', () => {
  const h = fixture(); h.claim(); const before = h.state(), calls = h.entered();
  h.reborn('c'.repeat(64));
  assert.strictEqual(h.api.releaseLocalBatchExecutor(TOKEN, PID), false);
  assert.strictEqual(h.entered(), calls); assert.deepStrictEqual(h.state(), before);
});
test('separate self-worker needs no parent WeakMap and can release an old nonce-less journal', () => {
  const h = fixture(); h.claim(); const old = h.state(); delete old.local_executor_lease_id; h.replace(old);
  const worker = createBatchExecutorLease({ ...h.deps, currentPid: () => PID });
  assert.strictEqual(worker.releaseLocalBatchExecutor(TOKEN, PID), true); assert.deepStrictEqual(h.state(), { token: TOKEN });
});
test('separate self-worker clears a new nonce without consuming its parent proof', () => {
  const h = fixture(), proof = h.claim(), worker = createBatchExecutorLease({ ...h.deps, currentPid: () => PID });
  assert.strictEqual(worker.releaseLocalBatchExecutor(TOKEN, PID), true); assert.deepStrictEqual(h.state(), { token: TOKEN });
  assert.strictEqual(h.api.releaseClaimedLocalBatchExecutor(proof), false, 'absence is not manufactured success');
});
test('invalid injected nonce cannot write a claim or mint release authority', () => {
  const h = fixture(), bad = createBatchExecutorLease({ ...h.deps, randomBytes: () => Buffer.alloc(0) });
  assert.throws(() => bad.claimLocalBatchExecutor(TOKEN, PID), /EXECUTOR_LEASE_ID_INVALID/);
  assert.strictEqual(h.writes(), 0); assert.deepStrictEqual(h.state(), { token: TOKEN });
});
test('self worker rejects unknown or changed birth identity without mutation', () => {
  const h = fixture(); h.claim(); const before = h.state();
  for (const actual of [null, 'c'.repeat(64)]) {
    const worker = createBatchExecutorLease({ ...h.deps, currentPid: () => PID, processInstanceIdentity: () => actual });
    assert.strictEqual(worker.releaseLocalBatchExecutor(TOKEN, PID), false); assert.deepStrictEqual(h.state(), before);
  }
});
done();
