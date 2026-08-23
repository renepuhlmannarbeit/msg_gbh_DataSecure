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

  function done() {
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
