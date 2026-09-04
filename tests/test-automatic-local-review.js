'use strict';

const { createSuite } = require('./helpers');
const { continueIntoLocalReview } = require('../plugins/data-secure/server/gateway/automatic-local-review');

const { testAsync, done, assert } = createSuite('Automatic local batch review flow');
const token = 'a'.repeat(64);
const waiting = Object.freeze({
  ok: true,
  batch_phase: 'awaiting_local_review',
  batch_total: 4,
  released: 2,
  stopped: 0,
  deferred_review: 2,
  raw_content_sent_to_claude: false
});

function harness(overrides = {}) {
  const calls = { claim: 0, release: 0, review: 0, read: 0, events: [] };
  const terminal = {
    ok: true, complete: true, batch_phase: 'complete', batch_total: 4,
    released: 4, stopped: 0, deferred_review: 0,
    raw_content_sent_to_claude: false
  };
  return {
    calls,
    terminal,
    options: {
      executorPid: 4242,
      claimLocalBatchExecutor(value, pid) {
        calls.claim++;
        assert.strictEqual(value, token);
        assert.strictEqual(pid, 4242);
        return { ok: true };
      },
      releaseLocalBatchExecutor(value, pid) {
        calls.release++;
        assert.strictEqual(value, token);
        assert.strictEqual(pid, 4242);
        return true;
      },
      async reviewDeferredBatch(value, options) {
        calls.review++;
        assert.strictEqual(value, token);
        assert.strictEqual(options.executorPid, 4242);
        assert.strictEqual(options.localFinalize, true);
        assert.deepStrictEqual(options.reviewOptions, { timeoutMs: null });
        return terminal;
      },
      readBatchProgress() { calls.read++; return waiting; },
      onReviewLifecycle(event) { calls.events.push(event); },
      ...overrides
    }
  };
}

testAsync('awaiting review continues automatically in the same detached local flow', async () => {
  const h = harness();
  const result = await continueIntoLocalReview(token, waiting, h.options);
  assert.deepStrictEqual(result, { attempted: true, started: true, progress: h.terminal });
  assert.deepStrictEqual({ claim: h.calls.claim, review: h.calls.review, release: h.calls.release, read: h.calls.read },
    { claim: 1, review: 1, release: 1, read: 0 });
  assert.deepStrictEqual(h.calls.events.map((event) => event.event),
    ['automatic_review_started', 'automatic_review_finished']);
  assert.doesNotMatch(JSON.stringify(h.calls.events), /aaaaaaaa|batch_token|source|filename|path|raw_content/u);
});

testAsync('Später or closing keeps the deferred checkpoint safely resumable', async () => {
  for (const error of ['LOCAL_REVIEW_DEFERRED', 'LOCAL_REVIEW_CANCELLED']) {
    const h = harness({
      async reviewDeferredBatch() {
        h.calls.review++;
        return { ...waiting, ok: false, error };
      }
    });
    const result = await continueIntoLocalReview(token, waiting, h.options);
    assert.strictEqual(result.progress.batch_phase, 'awaiting_local_review');
    assert.strictEqual(result.progress.deferred_review, 2);
    assert.strictEqual(result.progress.error, error);
    assert.strictEqual(h.calls.release, 1);
    assert.strictEqual(h.calls.read, 0);
    assert.strictEqual(h.calls.events.at(-1).error_code, error);
  }
});

testAsync('a local reviewer error fails closed and returns only durable resting progress', async () => {
  const h = harness({
    async reviewDeferredBatch() { h.calls.review++; throw new Error('private detail'); }
  });
  const result = await continueIntoLocalReview(token, waiting, h.options);
  assert.strictEqual(result.started, true);
  assert.strictEqual(result.progress, waiting);
  assert.deepStrictEqual({ claim: h.calls.claim, review: h.calls.review, release: h.calls.release, read: h.calls.read },
    { claim: 1, review: 1, release: 1, read: 1 });
  assert.strictEqual(h.calls.events.at(-1).error_code, 'LOCAL_REVIEW_FAILED');
  assert.doesNotMatch(JSON.stringify(result), /private detail|aaaaaaaa/u);
});

testAsync('a refused review lease opens nothing and remains explicitly resumable', async () => {
  const h = harness({
    claimLocalBatchExecutor() { h.calls.claim++; return { ok: false, error: 'busy-private' }; }
  });
  const result = await continueIntoLocalReview(token, waiting, h.options);
  assert.deepStrictEqual(result, { attempted: true, started: false, progress: waiting });
  assert.deepStrictEqual({ claim: h.calls.claim, review: h.calls.review, release: h.calls.release },
    { claim: 1, review: 0, release: 0 });
  assert.strictEqual(h.calls.events.at(-1).error_code, 'LOCAL_REVIEW_BUSY');
  assert.doesNotMatch(JSON.stringify(result), /busy-private|aaaaaaaa/u);
});

testAsync('clear or terminal batches never open review and keep one terminal presentation path', async () => {
  for (const progress of [
    { ...waiting, batch_phase: 'complete', complete: true, deferred_review: 0, released: 4 },
    { ...waiting, batch_phase: 'awaiting_explicit_resume', deferred_review: 0 }
  ]) {
    const h = harness();
    const result = await continueIntoLocalReview(token, progress, h.options);
    assert.deepStrictEqual(result, { attempted: false, progress });
    assert.deepStrictEqual({ claim: h.calls.claim, review: h.calls.review, release: h.calls.release },
      { claim: 0, review: 0, release: 0 });
  }
  // Product worker calls the terminal presenter only after this function
  // returns, so the automatic path itself can never create a second summary.
  assert.strictEqual(harness().calls.events.length, 0);
});

Promise.resolve().then(() => setImmediate(done));
