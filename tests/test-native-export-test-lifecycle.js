'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { observeClose, waitForObservedClose, observeChild, waitForChildCompletion } = require('./lib/native-export-test-lifecycle.cjs');
async function run() {
  for (const fault of ['close', 'exit-only', 'late-close', 'no-event', 'already-closed']) {
    let time = 100, timer, delay, clears = 0;
    const child = new EventEmitter(), observed = observeClose(child, () => time);
    const timing = { now: () => time, setTimeout(fn, remaining) { timer = fn; delay = remaining; return 1; }, clearTimeout() { clears++; } };
    if (fault === 'already-closed') { child.emit('close'); time = 130; }
    const pending = waitForObservedClose(observed, 120, timing);
    assert.equal(delay, fault === 'already-closed' ? 0 : 20, 'remaining original budget, never a new 180s');
    if (fault === 'close') { time = 110; child.emit('close'); }
    if (fault === 'exit-only') child.emit('exit', 0, null);
    if (fault === 'late-close') { time = 121; child.emit('close'); }
    if (['exit-only', 'no-event'].includes(fault)) { time = 120; timer(); }
    assert.equal(await pending, ['close', 'already-closed'].includes(fault), fault);
    assert.equal(clears, 1, fault);
    if (fault === 'exit-only') { time = 121; child.emit('close'); assert.equal(await pending, false, 'late observation cannot rewrite timeout'); }
  }
  assert.throws(() => waitForObservedClose(Promise.resolve(), Infinity), /closed deadline/);
  for (const fault of ['complete', 'no-exit-no-close', 'exit-without-close', 'close-without-exit', 'late-exit-close', 'spawn-error']) {
    let time = 100, timer, delay;
    const child = new EventEmitter(), observed = observeChild(child, () => time);
    const timing = { now: () => time, setTimeout(fn, remaining) { timer = fn; delay = remaining; return 1; }, clearTimeout() {} };
    const pending = waitForChildCompletion(observed, 120, timing);
    assert.equal(delay, 20, 'integrated caller helper keeps original remaining deadline');
    if (fault === 'complete') { time = 110; child.emit('exit', 0, null); child.emit('close'); }
    if (fault === 'exit-without-close') child.emit('exit', 0, null);
    if (fault === 'close-without-exit') child.emit('close');
    if (fault === 'late-exit-close') { time = 121; child.emit('exit', 0, null); child.emit('close'); }
    if (fault === 'spawn-error') child.emit('error', Error('owned synthetic spawn failure'));
    if (['no-exit-no-close', 'exit-without-close', 'spawn-error'].includes(fault)) { time = 120; timer(); }
    const result = await pending;
    assert.equal(result.close_confirmed, ['complete', 'close-without-exit'].includes(fault), fault);
    assert.equal(result.exit_confirmed, ['complete', 'exit-without-close'].includes(fault), fault);
    assert.equal(result.exit_code, result.exit_confirmed ? 0 : null, 'unconfirmed exit is not manufactured');
    assert.equal(result.error_observed, fault === 'spawn-error');
  }
  console.log('ok native export test lifecycle: five close and six integrated completion cases plus invalid-deadline refusal');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
