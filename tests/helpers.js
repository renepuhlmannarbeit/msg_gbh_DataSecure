'use strict';

// Minimal test harness. The product runtime deliberately ships without npm
// dependencies. Tests may use explicitly pinned, dev-only differential oracles,
// but never a registry-provided test runner.
// A verdict is final only after every registered case and its cleanup settle.
// In particular a mocked microtask is not a substitute for awaiting real IO.

const assert = require('assert');

function createSuite(title) {
  const failures = [];
  const pending = new Set();
  let passed = 0;
  let closing = false;
  let finished = false;
  let completion;

  function fail(name, err) {
    failures.push({ name, err });
    process.exitCode = 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${String(err && err.message).split('\n').join('\n       ')}`);
  }

  function register() {
    if (closing) throw new Error('TEST_REGISTERED_AFTER_DONE');
    // Reserve the case before invoking user code: a callback may itself call
    // done(), whose snapshot must already include this entire case.
    let settle;
    const promise = new Promise(resolve => { settle = resolve; });
    pending.add(promise);
    promise.then(() => pending.delete(promise));
    return { promise, settle };
  }

  function test(name, fn) {
    const running = register();
    let asynchronous;
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        asynchronous = Promise.resolve(result).catch(err => fail(name, err));
        throw new Error('ASYNC_CASE_REQUIRES_TEST_ASYNC');
      }
      passed++;
      console.log(`  ok   ${name}`);
    } catch (err) {
      fail(name, err);
    } finally {
      if (asynchronous) asynchronous.then(running.settle);
      else running.settle();
    }
  }

  function testAsync(name, fn) {
    const running = register();
    (async () => {
      try {
        await fn();
        passed++;
        console.log(`  ok   ${name}`);
      } catch (err) { fail(name, err); }
      finally { running.settle(); }
    })();
    return running.promise;
  }

  function verdict() {
    if (finished) return;
    finished = true;
    process.removeListener('beforeExit', unfinished);
    console.log(`${title}: ${passed} passed, ${failures.length} failed`);
    if (failures.length) {
      console.error(`\nFirst failure in "${failures[0].name}":`);
      console.error(failures[0].err);
      process.exitCode = 1;
    }
  }

  // An unresolved promise alone does not keep Node alive. Never turn an
  // abandoned async assertion (or a missing done) into a silent green process.
  function unfinished() {
    if (finished) return;
    fail('suite lifecycle', new Error(closing ? 'TESTS_OR_CLEANUP_DID_NOT_SETTLE' : 'TEST_SUITE_NOT_FINALIZED'));
    verdict();
  }
  process.on('beforeExit', unfinished);

  // Single finalization shared by callers; cleanup must not race active cases.
  // A cleanup failure is reported, not silently retried or labelled green.
  function done(cleanup) {
    if (completion) return completion;
    closing = true;
    completion = (async () => {
      await Promise.all([...pending]);
      if (typeof cleanup === 'function') {
        try { await cleanup(); } catch (err) { fail('suite cleanup', err); }
      }
      verdict();
    })();
    return completion;
  }

  console.log(`\n${title}`);
  return { test, testAsync, done, assert };
}

// Asserts that `needle` does not survive anywhere in `text`, case-insensitively.
// Direct identifiers must be gone regardless of casing.
function assertAbsent(text, needle, label) {
  const haystack = String(text).toLocaleLowerCase('de-DE');
  const found = haystack.includes(String(needle).toLocaleLowerCase('de-DE'));
  assert.ok(!found, `${label || 'value'} must not survive: ${JSON.stringify(needle)}`);
}

// Positive control: guards against a test passing only because the parser
// returned nothing at all.
function assertPresent(text, needle, label) {
  assert.ok(
    String(text).includes(needle),
    `${label || 'value'} must be preserved: ${JSON.stringify(needle)}`
  );
}

module.exports = { createSuite, assertAbsent, assertPresent };
