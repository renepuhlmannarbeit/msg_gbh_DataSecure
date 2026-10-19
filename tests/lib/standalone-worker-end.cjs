'use strict';

// Test-only join for a worker whose real parent can end before the worker.
// Bind its birth while it is executing, never adopt a late PID during cleanup.
const assert = require('node:assert/strict');
const { processInstanceState } = require('../../plugins/data-secure/server/gateway/process-identity');
const identity = /^[a-f0-9]{64}$/u;
function validateWorkerReceipts(spawned, entered, exited) {
  assert.ok(spawned && Number.isSafeInteger(spawned.pid) && spawned.pid > 0);
  assert.ok(entered && identity.test(entered.identity));
  assert.equal(entered.pid, spawned.pid);
  assert.ok(exited && identity.test(exited.identity));
  assert.equal(exited.pid, spawned.pid);
  assert.equal(exited.identity, entered.identity);
  assert.ok(Number.isInteger(exited.code) && exited.code >= 0 && exited.code <= 255);
}
async function awaitWorkerEnd(spawned, entered, exited, options = {}) {
  validateWorkerReceipts(spawned, entered, exited);
  const state = options.state || processInstanceState;
  const now = options.now || Date.now;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const deadline = now() + 5000;
  for (;;) {
    assert.ok(now() < deadline, 'own fixture worker did not end; preserve its test directory');
    const current = state(entered.pid, entered.identity);
    assert.ok(now() < deadline, 'worker identity probe exceeded join deadline');
    if (current === 'dead' || current === 'different') return exited;
    assert.ok(current === 'same' || current === 'unknown', 'invalid process instance state');
    // Unknown is not proof of exit. Retain evidence on deadline or probe error.
    await sleep(Math.min(25, deadline - now()));
  }
}
module.exports = { awaitWorkerEnd, validateWorkerReceipts };
