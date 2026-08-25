'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { createSuite } = require('./helpers');
const {
  startLocalReviewExecutor,
  localReviewActive,
  _test
} = require('../plugins/data-secure/server/gateway/batch-executor');
const {
  DEFAULT_REVIEW_TIMEOUT_MS,
  DETACHED_REVIEW_TIMEOUT_MS
} = require('../plugins/data-secure/server/companion/review-timeouts');

const { test, done, assert } = createSuite('Non-blocking local review executor');
const token = 'a'.repeat(64);

function fakeChild() {
  const child = new EventEmitter();
  child.pid = 4242;
  child.sent = null;
  child.unrefCalled = false;
  child.killCalled = false;
  child.send = (message, callback) => {
    child.sent = message;
    callback?.(null);
  };
  child.unref = () => { child.unrefCalled = true; };
  child.kill = () => { child.killCalled = true; };
  return child;
}

test('review starts in a detached worker and returns immediately without the token', () => {
  const child = fakeChild();
  const events = [];
  let forked;
  let claimed;
  let released;
  const result = startLocalReviewExecutor(token, {
    forkProcess(worker, args, options) { forked = { worker, args, options }; return child; },
    claimLocalBatchExecutor(value, pid) {
      claimed = { value, pid };
      return {
        ok: true, batch_token: value, batch_total: 4, released: 2, stopped: 0,
        deferred_review: 2, batch_phase: 'awaiting_local_review'
      };
    },
    releaseLocalBatchExecutor(value, pid) { released = { value, pid }; return true; },
    recordWorkflowEvent(event) { events.push(event); return true; }
  });
  assert.ok(forked.worker.endsWith(path.join('gateway', 'review-worker.js')));
  assert.strictEqual(forked.options.detached, true);
  assert.deepStrictEqual(forked.options.stdio, ['ignore', 'ignore', 'ignore', 'ipc']);
  assert.deepStrictEqual(claimed, { value: token, pid: child.pid });
  assert.deepStrictEqual(child.sent, { type: 'start-local-review', batch_token: token });
  assert.strictEqual(child.unrefCalled, true);
  assert.strictEqual(result.local_review_started, true);
  assert.strictEqual(result.batch_phase, 'processing_local_review');
  assert.strictEqual(result.deferred_review, 2);
  assert.strictEqual(result.raw_content_sent_to_claude, false);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(token));
  assert.strictEqual(localReviewActive(), true);
  assert.deepStrictEqual(events.map((event) => event.event), ['review_worker_spawned', 'review_ipc_dispatched']);
  child.emit('exit', 0);
  assert.deepStrictEqual(released, { value: token, pid: child.pid });
  assert.strictEqual(localReviewActive(), false);
  assert.strictEqual(events.at(-1).event, 'review_worker_exited');
});

test('content-free start envelopes never echo private executor fields', () => {
  const result = _test.contentFreeReviewStart({
    ok: true, batch_token: token, local_executor_pid: 42, batch_total: 3,
    released: 1, stopped: 0, deferred_review: 2, batch_phase: 'awaiting_local_review'
  }, true);
  assert.deepStrictEqual(Object.keys(result).sort(), [
    'batch_phase', 'batch_total', 'deferred_review', 'local_review_started',
    'next_action', 'ok', 'raw_content_sent_to_claude', 'released', 'stopped'
  ]);
  assert.doesNotMatch(JSON.stringify(result), /batch_token|executor|4242|aaaaaaaa/u);
});

test('the detached local UI contract outlives a synchronous Cowork tool request', () => {
  assert.strictEqual(DEFAULT_REVIEW_TIMEOUT_MS, 5 * 60 * 1000);
  assert.strictEqual(DETACHED_REVIEW_TIMEOUT_MS, 30 * 60 * 1000);
  assert.ok(DETACHED_REVIEW_TIMEOUT_MS > DEFAULT_REVIEW_TIMEOUT_MS);
  const worker = fs.readFileSync(
    path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'gateway', 'review-worker.js'),
    'utf8'
  );
  assert.match(worker, /reviewOptions:\s*\{\s*timeoutMs:\s*DETACHED_REVIEW_TIMEOUT_MS\s*\}/u);
});

done();
