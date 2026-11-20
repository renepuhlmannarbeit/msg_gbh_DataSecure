'use strict';
// Test parents only. A deadline is not close, process exit or a writer-tree join.
const assert = require('node:assert/strict');
const fs = require('node:fs'), { inspect } = require('node:util');
function firstFailure(secondary = () => {}) {
  let failed = false, value;
  return {
    get failed() { return failed; },
    get value() { return value; },
    record(error) {
      if (!failed) { failed = true; value = error; }
      else if (!Object.is(value, error)) { try { secondary(); } catch {} }
    },
    throwIfFailed() { if (failed) throw value; }
  };
}
async function within(promise, milliseconds, code) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(code), { code })), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
function ownChild(child, onError = () => {}) {
  const failure = firstFailure();
  const kill = child.kill.bind(child);
  let closed = false, exitCode, signal, terminationRequested = false, reportError;
  const error = new Promise(resolve => { reportError = resolve; });
  // Never reject this witness on error: an error is not a close event.
  const done = new Promise(resolve => child.once('close', (code, value) => {
    closed = true; exitCode = code; signal = value; resolve({ code, signal: value });
  }));
  child.on('error', error => {
    failure.record(error); reportError(error);
    try { onError(error); } catch (secondary) { failure.record(secondary); }
  });
  return {
    child, done, error, failure,
    get closed() { return closed; },
    get exitCode() { return exitCode; },
    get signal() { return signal; },
    terminate(value) {
      if (closed || terminationRequested) return false;
      terminationRequested = true; // Even a throwing/refused request is one attempt.
      return kill(value);
    }
  };
}
function reviewFrames(waiters, onError) {
  let buffer = Buffer.alloc(0), failed = false;
  return chunk => {
    if (failed) return;
    try {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const size = buffer.readUInt32BE(0);
        assert.ok(size > 1 && size <= 1024 * 1024);
        if (buffer.length < size + 4) return;
        const answer = JSON.parse(buffer.subarray(4, size + 4).toString('utf8'));
        buffer = buffer.subarray(size + 4);
        const waiter = waiters.get(answer.request_id);
        assert.ok(waiter, 'only requested production frames are accepted');
        waiters.delete(answer.request_id); clearTimeout(waiter.timer); waiter.resolve(answer);
      }
    } catch (error) {
      failed = true; buffer = Buffer.alloc(0);
      for (const waiter of waiters.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
      waiters.clear(); onError(error);
    }
  };
}
// Standalone TEST CLI only, after all known teardown stages were attempted.
// Exit ends this parent. It never confirms a child/descendant writer or permits deletion.
function endTestCliFailure({ failed, error, retainedRoots = [], unconfirmedChildren = true }) {
  if (!failed) return;
  let primary;
  try { primary = inspect(error, { customInspect: false, getters: false, depth: 2,
    maxArrayLength: 10, maxStringLength: 1024, breakLength: Infinity }); }
  catch { primary = '[primary representation unavailable]'; }
  try { fs.writeSync(2, 'R6_TEST_CLI_PRIMARY:' + primary + '\n'); } catch {}
  try { fs.writeSync(2, 'R6_TEST_CLI_FAILURE:' + JSON.stringify({
    verdict: 'FAILED', teardown: 'ALL_KNOWN_ATTEMPTED', fixture: 'STATUS_UNCONFIRMED',
    scope_roots: retainedRoots, child_end: unconfirmedChildren ? 'UNCONFIRMED' : 'DIRECT_CLOSE_OBSERVED',
    writer_join: 'NOT_CLAIMED'
  }) + '\n'); } catch {}
  process.exit(1);
}
module.exports = { firstFailure, within, ownChild, reviewFrames, endTestCliFailure };
