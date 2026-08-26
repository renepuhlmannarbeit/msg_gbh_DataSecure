'use strict';

const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchContinuation } = require('../plugins/data-secure/server/gateway/batch-continuation');
const batchFacade = require('../plugins/data-secure/server/gateway/batch');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch continuation boundary');
const token = 'a'.repeat(64);

function state(items, createdAt = '2026-08-26T10:00:00.000Z') {
  return { token, created_at: createdAt, invalidated: false, items: structuredClone(items) };
}

function fixture(options = {}) {
  const active = options.active || new Set();
  const events = [];
  let current = structuredClone(options.state || state([{ status: 'retryable', checkpoint: 'retryable', error_code: 'REQUEST_CANCELLED' }]));
  const recoverable = structuredClone(options.recoverable || []);
  const continuation = createBatchContinuation({
    SafeError,
    active,
    acquireActiveLock(value) {
      events.push(`acquire:${value}`);
      if (options.failAcquire) throw new Error('ACQUIRE_FAILED');
    },
    releaseActiveLock(value) {
      events.push(`release:${value}`);
      if (options.failRelease) throw new Error('RELEASE_FAILED');
    },
    readState(value) {
      events.push(`read:${value}`);
      if (options.failRead) throw new Error('READ_FAILED');
      return structuredClone(current);
    },
    writeState(value) {
      events.push('write');
      if (options.failWrite) throw new Error('WRITE_FAILED');
      current = structuredClone(value);
    },
    assertLocalExecutorAccess(value) {
      events.push('access');
      if (options.failAccess) throw new Error('ACCESS_FAILED');
      assert.ok(value);
    },
    reconcilePublishedItems(value) {
      events.push('published');
      if (options.failPublished) throw new Error('PUBLISHED_FAILED');
      return options.publishedChanged === true;
    },
    reconcilePendingMappings(value) {
      events.push('mapping');
      if (options.failMapping) throw new Error('MAPPING_FAILED');
      return options.mappingChanged === true;
    },
    markInterruptedItemsRetryable(value) {
      events.push('interrupted');
      if (options.failInterrupted) throw new Error('INTERRUPTED_FAILED');
      let changed = 0;
      if (options.leaveProcessing !== true) {
        for (const item of value.items) {
          if (item.status !== 'processing') continue;
          item.status = 'retryable';
          item.checkpoint = 'retryable';
          changed++;
        }
      }
      return changed;
    },
    recoverableBatchStates() {
      events.push('recoverable');
      return structuredClone(recoverable);
    },
    publicProgress(value) {
      events.push('progress');
      return {
        remaining: value.items.filter((item) => item.status === 'pending').length,
        retryable: value.items.filter((item) => item.status === 'retryable').length,
        deferred_review: value.items.filter((item) => item.status === 'deferred_review').length
      };
    },
    deferredReviewStatus: 'deferred_review',
    mappingPendingStatus: 'mapping_pending'
  });
  return { ...continuation, active, events, current: () => structuredClone(current) };
}

test('resume preserves reconciliation order and explicitly queues every retryable item once', () => {
  const value = fixture({
    state: state([
      { status: 'processing', checkpoint: 'processing_started', error_code: 'PROCESSING_INTERRUPTED' },
      { status: 'retryable', checkpoint: 'retryable', error_code: 'REQUEST_CANCELLED' },
      { status: 'released', checkpoint: 'released' }
    ]),
    publishedChanged: true,
    mappingChanged: true
  });
  const result = value.resumeBatch(token);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.resumed, 2);
  assert.deepStrictEqual(value.current().items.map((item) => item.status), ['pending', 'pending', 'released']);
  assert.ok(value.current().items.slice(0, 2).every((item) => item.checkpoint === 'resumed' && item.error_code === undefined));
  assert.ok(value.events.indexOf('published') < value.events.indexOf('mapping'));
  assert.ok(value.events.indexOf('mapping') < value.events.indexOf('interrupted'));
  assert.ok(value.events.indexOf('interrupted') < value.events.indexOf('write'));
  assert.deepStrictEqual([...value.active], []);
  assert.strictEqual(value.events.at(-1), `release:${token}`);
});

test('single-flight and lock-acquire failures inspect or mutate no journal state', () => {
  const busy = fixture({ active: new Set([token]) });
  assert.throws(() => busy.resumeBatch(token), /bereits eine Verarbeitung/);
  assert.deepStrictEqual(busy.events, []);

  const locked = fixture({ failAcquire: true });
  assert.throws(() => locked.resumeBatch(token), /ACQUIRE_FAILED/);
  assert.deepStrictEqual(locked.events, [`acquire:${token}`]);
  assert.deepStrictEqual([...locked.active], []);
});

test('access, invalidation and write failures always clear ownership', () => {
  const access = fixture({ failAccess: true });
  assert.throws(() => access.resumeBatch(token), /ACCESS_FAILED/);
  assert.deepStrictEqual([...access.active], []);
  assert.strictEqual(access.events.at(-1), `release:${token}`);

  const invalid = fixture({ state: { ...state([{ status: 'retryable' }]), invalidated: true } });
  assert.throws(() => invalid.resumeBatch(token), /nicht mehr verwendbar/);
  assert.strictEqual(invalid.events.includes('published'), false);
  assert.strictEqual(invalid.events.at(-1), `release:${token}`);

  const write = fixture({ failWrite: true });
  assert.throws(() => write.resumeBatch(token), /WRITE_FAILED/);
  assert.deepStrictEqual([...write.active], []);
  assert.strictEqual(write.events.at(-1), `release:${token}`);
});

test('read and every reconciliation failure release the exact owner once', () => {
  for (const [flag, message] of [
    ['failRead', 'READ_FAILED'],
    ['failPublished', 'PUBLISHED_FAILED'],
    ['failMapping', 'MAPPING_FAILED'],
    ['failInterrupted', 'INTERRUPTED_FAILED']
  ]) {
    const value = fixture({ [flag]: true });
    assert.throws(() => value.resumeBatch(token), new RegExp(message));
    assert.deepStrictEqual([...value.active], []);
    assert.strictEqual(value.events.filter((event) => event === `release:${token}`).length, 1);
    assert.strictEqual(value.events.at(-1), `release:${token}`);
    assert.strictEqual(value.events.includes('write'), false);
  }
});

test('no-op resume keeps exact error priority and persists only reconciliation changes', () => {
  const review = fixture({ state: state([{ status: 'deferred_review' }]), publishedChanged: true });
  const reviewResult = review.resumeBatch(token);
  assert.strictEqual(reviewResult.error, 'batch_review_required');
  assert.strictEqual(review.events.filter((event) => event === 'write').length, 1);

  const mapping = fixture({ state: state([{ status: 'mapping_pending' }]) });
  assert.strictEqual(mapping.resumeBatch(token).error, 'local_mapping_repair_pending');
  assert.strictEqual(mapping.events.includes('write'), false);

  const none = fixture({ state: state([{ status: 'pending' }]) });
  assert.strictEqual(none.resumeBatch(token).error, 'no_retryable_documents');
  assert.strictEqual(none.events.includes('write'), false);
});

test('release failures stay visible instead of reporting false resume success', () => {
  const value = fixture({ failRelease: true });
  assert.throws(() => value.resumeBatch(token), /RELEASE_FAILED/);
  assert.deepStrictEqual([...value.active], []);
});

test('continue returns a fixed content-free no-batch response without taking a lock', () => {
  const value = fixture();
  assert.deepStrictEqual(value.continueMostRecentBatch(), {
    ok: false,
    error: 'no_incomplete_batch',
    raw_content_sent_to_claude: false
  });
  assert.strictEqual(value.events.some((event) => event.startsWith('acquire:')), false);
});

test('continue selects the newest state and delegates interrupted work through resume', () => {
  const older = { ...state([{ status: 'pending' }], '2026-08-26T09:00:00.000Z'), token: 'b'.repeat(64) };
  const newest = state([{ status: 'processing', checkpoint: 'processing_started' }], '2026-08-26T11:00:00.000Z');
  const value = fixture({ state: newest, recoverable: [older, newest] });
  const result = value.continueMostRecentBatch();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.batch_token, token);
  assert.strictEqual(result.remaining, 1);
  assert.strictEqual(result.raw_content_sent_to_claude, false);
  assert.strictEqual(value.events.filter((event) => event === `acquire:${token}`).length, 1);
  assert.strictEqual(value.events.filter((event) => event === `read:${token}`).length, 3);
});

test('continue preserves deferred review and propagates a failed explicit resume', () => {
  const deferred = state([{ status: 'deferred_review' }]);
  const waiting = fixture({ state: deferred, recoverable: [deferred] });
  const waitingResult = waiting.continueMostRecentBatch();
  assert.strictEqual(waitingResult.ok, true);
  assert.strictEqual(waitingResult.deferred_review, 1);
  assert.strictEqual(waiting.events.some((event) => event.startsWith('acquire:')), false);

  const processing = state([{ status: 'processing' }]);
  const failed = fixture({ state: processing, recoverable: [processing], leaveProcessing: true });
  const failedResult = failed.continueMostRecentBatch();
  assert.strictEqual(failedResult.ok, false);
  assert.strictEqual(failedResult.error, 'no_retryable_documents');
  assert.strictEqual(Object.hasOwn(failedResult, 'batch_token'), false);
});

test('public batch facade keeps both continuation functions', () => {
  assert.strictEqual(typeof batchFacade.resumeBatch, 'function');
  assert.strictEqual(typeof batchFacade.continueMostRecentBatch, 'function');
});

done();
