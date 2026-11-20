'use strict';
// Direct unit countercases for helpers actually called by the R6 test parents.
// EventEmitter capabilities below are explicit models, never native-process proof.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { firstFailure, within, ownChild, reviewFrames } = require('./helpers/qa-parent-lifecycle.cjs');
async function capture(action) {
  try { return { threw: false, value: await action() }; }
  catch (value) { return { threw: true, value }; }
}
function child(result = true) {
  const value = new EventEmitter(), signals = [];
  value.kill = signal => { signals.push(signal); if (result instanceof Error) throw result; return result; };
  return { value, signals };
}
function frame(value) {
  const body = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4);
  header.writeUInt32BE(body.length); return Buffer.concat([header, body]);
}
(async () => {
  // Valid baselines first: actual close-only witness and actual frame receiver.
  {
    const model = child(), owned = ownChild(model.value);
    queueMicrotask(() => model.value.emit('close', 0, null));
    assert.deepEqual(await within(owned.done, 100, 'UNIT_CLOSE_UNCONFIRMED'), { code: 0, signal: null });
    assert.equal(owned.closed, true); assert.equal(owned.exitCode, 0); assert.equal(owned.signal, null);
    assert.equal(owned.terminate('SIGTERM'), false); assert.deepEqual(model.signals, []);
  }
  {
    const response = { request_id: '0000000000000001', ok: true }, waiters = new Map();
    let received, failed = false;
    waiters.set(response.request_id, { resolve: value => { received = value; }, timer: setTimeout(() => {
      throw Error('valid receiver left its waiter timer active');
    }, 100) });
    const receive = reviewFrames(waiters, () => { failed = true; }), bytes = frame(response);
    receive(bytes.subarray(0, 3)); assert.equal(received, undefined);
    receive(bytes.subarray(3)); assert.deepEqual(received, response);
    assert.equal(failed, false); assert.equal(waiters.size, 0);
  }
  // Error is observed immediately and does not settle the later close witness.
  {
    const primary = firstFailure(), model = child(false), error = Error('SPAWN_FAILED');
    const owned = ownChild(model.value, value => primary.record(value));
    model.value.emit('error', error);
    assert.equal(primary.failed, true); assert.equal(primary.value, error);
    assert.equal(owned.failure.value, error); assert.equal(owned.closed, false);
    assert.equal(await Promise.race([owned.done.then(() => true), Promise.resolve(false)]), false);
    model.value.emit('close', -2, null); await owned.done; assert.equal(owned.closed, true);
  }
  // The timeout is a failed wait, not a faked close or a second kill request.
  {
    const model = child(false), owned = ownChild(model.value);
    assert.equal(owned.terminate('SIGTERM'), false);
    const result = await capture(() => within(owned.done, 5, 'UNIT_CLOSE_UNCONFIRMED'));
    assert.equal(result.threw, true); assert.equal(result.value.code, 'UNIT_CLOSE_UNCONFIRMED');
    assert.equal(owned.closed, false); assert.equal(owned.terminate('SIGKILL'), false);
    assert.deepEqual(model.signals, ['SIGTERM']);
    model.value.emit('close', null, 'SIGTERM'); await owned.done;
    assert.equal(owned.closed, true); assert.equal(owned.signal, 'SIGTERM');
  }
  {
    const error = Error('KILL_THROW'), model = child(error), owned = ownChild(model.value);
    assert.throws(() => owned.terminate('SIGTERM'), value => value === error);
    assert.equal(owned.terminate('SIGKILL'), false); assert.deepEqual(model.signals, ['SIGTERM']);
    model.value.emit('close', null, 'SIGTERM'); await owned.done;
  }
  {
    const primary = firstFailure(), model = child(), owned = ownChild(model.value, value => primary.record(value));
    model.value.emit('close', 0, null); await owned.done;
    const error = Error('LATE_CHILD_ERROR'); model.value.emit('error', error);
    assert.equal(owned.closed, true); assert.equal(primary.value, error);
  }
  // Both witnesses must settle even when either handle already emitted error.
  for (const reverse of [false, true]) {
    const models = [child(), child()], primary = firstFailure();
    const records = models.map(model => ownChild(model.value, value => primary.record(value)));
    const bad = reverse ? 1 : 0, other = 1 - bad;
    let joined = false; const both = Promise.all(records.map(value => value.done)).then(() => { joined = true; });
    models[bad].value.emit('error', Error('ONE_SIDE_SPAWN_FAILED')); models[bad].value.emit('close', -2, null);
    await Promise.resolve(); assert.equal(joined, false); assert.equal(records[other].closed, false);
    models[other].value.emit('close', null, 'SIGKILL'); await both; assert.equal(joined, true);
    assert.equal(primary.failed, true);
  }
  // All primary values, including falsy/frozen values, survive secondary failures.
  for (const value of [undefined, null, false, 0, '', Object.freeze(Error('PRIMARY'))]) {
    let secondary = 0;
    const primary = firstFailure(() => { secondary++; throw Error('DIAGNOSTIC_FAILURE'); });
    primary.record(value); primary.record(Error('CLOSE_SECONDARY')); primary.record(false);
    const result = await capture(() => primary.throwIfFailed());
    assert.equal(result.threw, true); assert.equal(result.value, value);
    assert.equal(primary.failed, true); assert.ok(secondary > 0);
  }
  {
    const failure = firstFailure(), cleanup = Error('CLEANUP_ONLY');
    failure.record(cleanup);
    assert.equal((await capture(() => failure.throwIfFailed())).value, cleanup);
  }
  // Actual receiver parser failures do not throw into EventEmitter dispatch.
  const invalid = [];
  for (const size of [0, 1, 1024 * 1024 + 1]) {
    const bytes = Buffer.alloc(4); bytes.writeUInt32BE(size); invalid.push(bytes);
  }
  const broken = Buffer.from('{broken json'), header = Buffer.alloc(4);
  header.writeUInt32BE(broken.length); invalid.push(Buffer.concat([header, broken]));
  invalid.push(frame({ request_id: 'unrequested', ok: true }), frame(null));
  for (const bytes of invalid) {
    const failure = firstFailure(), waiters = new Map(), response = { request_id: 'late', ok: true };
    let successes = 0, faults = 0, rejected;
    waiters.set('pending', { resolve: () => { successes++; }, reject: value => { rejected = value; },
      timer: setTimeout(() => { throw Error('failed receiver left its waiter timer active'); }, 100) });
    const receive = reviewFrames(waiters, value => { faults++; failure.record(value); });
    assert.doesNotThrow(() => receive(bytes)); assert.equal(failure.failed, true); assert.equal(faults, 1);
    assert.equal(rejected, failure.value); assert.equal(waiters.size, 0);
    waiters.set('late', { resolve: () => { successes++; } });
    receive(frame(response)); assert.equal(successes, 0); assert.equal(faults, 1);
  }
  {
    const failure = firstFailure(), waiters = new Map(); let successes = 0;
    waiters.set('first', { resolve: () => { successes++; } });
    const receive = reviewFrames(waiters, value => failure.record(value));
    receive(frame({ request_id: 'first', ok: true })); assert.equal(successes, 1);
    // No waiter is active: a late unsolicited frame must still latch a failure.
    receive(frame({ request_id: 'late', ok: true })); assert.equal(failure.failed, true);
  }
  console.log('PASS R6 helper unit countercases; modeled handles, no native/process-tree or parent-exit claim');
})().catch(error => { console.error(error); process.exitCode = 1; });
