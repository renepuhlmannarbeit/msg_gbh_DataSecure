'use strict';

const { createSuite } = require('./helpers');
const {
  DEFAULT_BATCH_CLEANUP_INTERVAL_MS,
  validInterval,
  startBatchMaintenance
} = require('../plugins/data-secure/server/gateway/batch-maintenance');

const { test, done, assert } = createSuite('Batch maintenance lifecycle');

test('uses a bounded six-hour unreferenced recurring cleanup timer', () => {
  let callback;
  let scheduled;
  let unrefCalls = 0;
  let cleanupCalls = 0;
  const timer = { unref() { unrefCalls++; } };
  const maintenance = startBatchMaintenance(() => { cleanupCalls++; }, {
    setInterval(run, interval) { callback = run; scheduled = interval; return timer; },
    clearInterval() { throw new Error('not stopped yet'); }
  });
  assert.strictEqual(DEFAULT_BATCH_CLEANUP_INTERVAL_MS, 6 * 60 * 60 * 1000);
  assert.strictEqual(maintenance.interval_ms, DEFAULT_BATCH_CLEANUP_INTERVAL_MS);
  assert.strictEqual(scheduled, DEFAULT_BATCH_CLEANUP_INTERVAL_MS);
  assert.strictEqual(unrefCalls, 1);
  callback();
  assert.strictEqual(cleanupCalls, 1);
});

test('suppresses a maintenance failure and remains available for the next interval', () => {
  let callback;
  let calls = 0;
  startBatchMaintenance(() => { calls++; if (calls === 1) throw new Error('private failure'); }, {
    setInterval(run) { callback = run; return { unref() {} }; },
    clearInterval() {}
  });
  assert.doesNotThrow(() => callback());
  assert.doesNotThrow(() => callback());
  assert.strictEqual(calls, 2);
});

test('stops exactly once during server shutdown', () => {
  let cleared;
  const timer = { unref() {} };
  const maintenance = startBatchMaintenance(() => {}, {
    setInterval() { return timer; },
    clearInterval(value) { cleared = value; }
  });
  assert.strictEqual(maintenance.stop(), true);
  assert.strictEqual(cleared, timer);
  assert.strictEqual(maintenance.stop(), false);
});

test('rejects unsafe custom timer intervals before scheduling', () => {
  for (const value of [0, 59_999, 24 * 60 * 60 * 1000 + 1, NaN, '3600000']) {
    assert.strictEqual(validInterval(value), false);
    assert.throws(() => startBatchMaintenance(() => {}, { intervalMs: value }), RangeError);
  }
  assert.strictEqual(validInterval(60_000), true);
  assert.strictEqual(validInterval(24 * 60 * 60 * 1000), true);
});

done();
