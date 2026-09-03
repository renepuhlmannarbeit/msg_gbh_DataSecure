'use strict';

// Minimal test harness. The product runtime deliberately ships without npm
// dependencies. Tests may use explicitly pinned, dev-only differential oracles,
// but never a registry-provided test runner.
// Every test file collects cases, prints one line per case and exits non-zero
// on the first failure so CI stops at the offending assertion.

const assert = require('assert');

function createSuite(title) {
  const failures = [];
  let passed = 0;

  function test(name, fn) {
    try {
      fn();
      passed++;
      console.log(`  ok   ${name}`);
    } catch (err) {
      failures.push({ name, err });
      console.log(`  FAIL ${name}`);
      console.log(`       ${String(err && err.message).split('\n').join('\n       ')}`);
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ok   ${name}`);
    } catch (err) {
      failures.push({ name, err });
      console.log(`  FAIL ${name}`);
      console.log(`       ${String(err && err.message).split('\n').join('\n       ')}`);
    }
  }

  // Windows real-time scanners briefly hold freshly written files; a bounded
  // retry keeps the cleanup effective, and a final failure is only a warning
  // because it never changes what the suite verified.
  function runCleanup(cleanup) {
    for (let attempt = 1; ; attempt++) {
      try { cleanup(); return; } catch (err) {
        const transient = ["EPERM", "EBUSY", "ENOTEMPTY", "EACCES"].includes(err && err.code);
        if (!transient || attempt >= 5) {
          console.error(`${title}: cleanup did not finish (${(err && err.code) || "error"})`);
          return;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * attempt);
      }
    }
  }

  // Runs an optional cleanup (temporary fixture trees) before the verdict so
  // no suite leaves state behind for the next run, even after a failure.
  function done(cleanup) {
    if (typeof cleanup === "function") runCleanup(cleanup);
    console.log(`${title}: ${passed} passed, ${failures.length} failed`);
    if (failures.length) {
      console.error(`\nFirst failure in "${failures[0].name}":`);
      console.error(failures[0].err);
      process.exit(1);
    }
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
