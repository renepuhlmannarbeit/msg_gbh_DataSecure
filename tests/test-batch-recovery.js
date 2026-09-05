'use strict';

const { createBatchRecovery } = require('../plugins/data-secure/server/gateway/batch-recovery');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch recovery orchestration');
const tokens = ['a', 'b', 'c', 'd', 'e'].map((character) => character.repeat(64));
const now = Date.parse('2026-08-25T12:00:00.000Z');
const future = '2026-08-26T12:00:00.000Z';
const past = '2026-08-24T12:00:00.000Z';

function entry(token, file = true) {
  return { name: `${token}.json`, isFile: () => file };
}

function state(token, options = {}) {
  return {
    token,
    expires_at: options.expires_at || future,
    invalidated: options.invalidated === true,
    live: options.live === true,
    doPublished: options.doPublished === true,
    doMapping: options.doMapping === true,
    interrupted: Number(options.interrupted || 0),
    cleanupChanged: options.cleanupChanged === true,
    items: options.items || [{ status: 'pending' }]
  };
}

function fixture(options = {}) {
  const events = [];
  const states = new Map((options.states || []).map((value) => [value.token, value]));
  const entries = options.entries || [...states.keys()].map((token) => entry(token));
  const alive = new Set(options.alive || []);
  const recovery = createBatchRecovery({
    io: {
      readdirSync() {
        events.push('readdir');
        if (options.readdirError) throw options.readdirError;
        return entries;
      },
      unlinkSync(target) {
        const token = String(target).replace(/^journal:/u, '');
        events.push(`unlink:${token}`);
        if (options.unlinkFailure === token) throw new Error('UNLINK_FAILED');
      }
    },
    randomBytes: () => Buffer.alloc(32, 1),
    nowMs: () => now,
    tokenPattern: /^[a-f0-9]{64}$/,
    batchRoot: () => 'batches',
    batchPath: (token) => `journal:${token}`,
    safeRemoveWorkDirectory(token) {
      events.push(`remove-work:${token}`);
      if (options.cleanupFailure === token) throw new Error('CLEANUP_FAILED');
    },
    readStateForMaintenance(token) {
      events.push(`read:${token}`);
      if (options.readFailure === token) throw new Error('READ_FAILED');
      const value = states.get(token);
      if (!value) throw new Error('missing');
      return value;
    },
    removeState(value) {
      events.push(`unlink:${value.token}`);
      if (options.unlinkFailure === value.token) throw new Error('UNLINK_FAILED');
    },
    writeState(value) {
      events.push(`write:${value.token}`);
      if (options.writeFailure === value.token) throw new Error('WRITE_FAILED');
    },
    readActiveLock() { events.push('read-lock'); return options.owner; },
    processAlive(pid) { events.push(`alive:${pid}`); return alive.has(pid); },
    acquireActiveLock(token) {
      events.push(`acquire:${token}`);
      if (options.acquireError) throw options.acquireError;
    },
    releaseActiveLock(token) {
      events.push(`release:${token}`);
      if (options.releaseError) throw options.releaseError;
      if (options.refuseRelease) return false;
      return true;
    },
    liveLocalExecutor: (value) => value.live === true,
    publicProgress: (value) => ({
      batch_total: value.items.length,
      released: value.items.filter((item) => item.status === 'released').length,
      stopped: value.items.filter((item) => item.status === 'stopped').length,
      deferred_review: value.items.filter((item) => item.status === 'deferred_review').length,
      processing: value.items.filter((item) => item.status === 'processing').length,
      remaining: value.items.filter((item) => item.status === 'pending').length,
      local_processing_active: value.live === true,
      complete: value.items.every((item) => ['released', 'stopped'].includes(item.status)),
      awaiting_resume: value.items.some((item) => item.status === 'retryable' || item.status === 'processing')
    }),
    visibleExportDirectory: (token) => options.visibleDirectories?.[token] || '',
    reconcilePublishedItems(value) {
      events.push(`published:${value.token}`);
      const changed = value.doPublished;
      value.doPublished = false;
      return changed;
    },
    reconcilePendingMappings(value) {
      events.push(`mapping:${value.token}`);
      const changed = value.doMapping;
      value.doMapping = false;
      return changed;
    },
    ...(options.enablePreflight ? {
      reconcilePreflightStoppedMappings(value) {
        events.push(`preflight-mapping:${value.token}`);
        const item = value.items.find((entry) => entry.status === 'preflight_mapping_pending');
        if (!item || options.preflightFailure === value.token) return false;
        item.status = 'stopped';
        return true;
      }
    } : {}),
    markInterruptedItemsRetryable(value) {
      events.push(`retry:${value.token}`);
      const count = value.interrupted;
      value.interrupted = 0;
      return count;
    },
    retryReleasedWorkCopyCleanup(value) {
      events.push(`cleanup-retry:${value.token}`);
      const changed = value.cleanupChanged;
      value.cleanupChanged = false;
      return { changed, pending: 0 };
    },
    ...(options.enableEvidence ? {
      repairPendingEvidenceOutbox() {
        events.push('evidence-outbox');
        return { repaired: Number(options.outboxRepaired || 0), failures: Number(options.outboxFailures || 0) };
      },
      reconcileTerminalEvidence(value) {
        events.push(`evidence:${value.token}`);
        return options.evidenceFailure === value.token ? false : true;
      }
    } : {}),
    deliveryPendingStatus: 'delivery_pending',
    deferredReviewStatus: 'deferred_review',
    mappingPendingStatus: 'mapping_pending',
    preflightMappingPendingStatus: 'preflight_mapping_pending'
  });
  return { recovery, events, states };
}

test('read-only enumeration yields to a live global owner and never mutates storage', () => {
  const item = fixture({
    owner: { pid: 42 },
    alive: [42],
    states: [state(tokens[0])]
  });
  assert.deepStrictEqual(item.recovery.recoverableBatchStates(), []);
  assert.deepStrictEqual(item.recovery.recoverableBatchStatus(), {
    recoverable_batches: 0,
    batches_awaiting_resume: 0,
    batches_awaiting_delivery: 0,
    batch_processing_active: true
  });
  assert.deepStrictEqual(item.recovery.localCleanupStatus(), {
    private_work_copy_cleanup_pending: 0,
    expired_batch_cleanup_pending: 0
  });
  assert.ok(!item.events.includes('readdir'));
  assert.ok(item.events.every((event) => !/^(write|unlink|remove-work|acquire):/u.test(event)));
});

test('status separates live executors, resumable batches, delivery and cleanup counters without identifiers', () => {
  const live = state(tokens[0], { live: true, items: [{ status: 'processing' }] });
  const retryable = state(tokens[1], { items: [{ status: 'retryable', work_copy_cleanup_pending: true }] });
  const delivery = state(tokens[2], { items: [{ status: 'delivery_pending', work_copy_cleanup_pending: true }] });
  const expired = state(tokens[3], { expires_at: past, items: [{ status: 'pending', work_copy_cleanup_pending: true }] });
  const complete = state(tokens[4], { items: [{ status: 'released' }] });
  const item = fixture({ states: [live, retryable, delivery, expired, complete] });

  assert.deepStrictEqual(item.recovery.recoverableBatchStates().map((value) => value.token), [tokens[1], tokens[2]]);
  assert.deepStrictEqual(item.recovery.recoverableBatchStates({ includeActiveExecutors: true }).map((value) => value.token),
    [tokens[0], tokens[1], tokens[2]]);
  const status = item.recovery.recoverableBatchStatus();
  assert.deepStrictEqual(status, {
    recoverable_batches: 2,
    batches_awaiting_resume: 1,
    batches_awaiting_delivery: 1,
    batch_processing_active: true
  });
  const cleanup = item.recovery.localCleanupStatus();
  assert.deepStrictEqual(cleanup, { private_work_copy_cleanup_pending: 2, expired_batch_cleanup_pending: 1 });
  assert.doesNotMatch(JSON.stringify({ status, cleanup }), /[a-e]{64}|name|path|hash/u);
  assert.ok(item.events.every((event) => !/^(write|unlink|remove-work|acquire):/u.test(event)));
});

test('latest product status selects one channel and exposes only current-run counters', () => {
  const olderStandalone = state(tokens[0], { items: [{ status: 'released' }] });
  olderStandalone.product_channel = 'standalone';
  olderStandalone.created_at = '2026-08-25T10:00:00.000Z';
  const plugin = state(tokens[1], { items: [{ status: 'released' }, { status: 'released' }] });
  plugin.product_channel = 'plugin';
  plugin.created_at = '2026-08-25T11:00:00.000Z';
  const latestStandalone = state(tokens[2], { items: [
    { status: 'released' }, { status: 'stopped' }, { status: 'deferred_review' }
  ] });
  latestStandalone.product_channel = 'standalone';
  latestStandalone.created_at = '2026-08-25T12:00:00.000Z';
  const item = fixture({ states: [olderStandalone, plugin, latestStandalone] });
  const status = item.recovery.latestProductBatchStatus('standalone');
  assert.deepStrictEqual(status, {
    selected_count: 3,
    completed_count: 1,
    failed_count: 1,
    review_count: 1,
    result_count: 1,
    export_pending_count: 0,
    processing: false,
    resumable: false,
    complete: false
  });
  assert.doesNotMatch(JSON.stringify(status), /[a-c]{64}|batch_token|path|name|hash/u);
  assert.ok(item.events.every((event) => !/^(write|unlink|remove-work|acquire):/u.test(event)));
  assert.strictEqual(fixture().recovery.latestProductBatchStatus('standalone'), null);
  assert.throws(() => item.recovery.latestProductBatchStatus('invalid'), /PRODUCT_CHANNEL_INVALID/u);
});

test('one product status snapshot scans and reads every retained journal at most once', () => {
  const retained = Array.from({ length: 1000 }, (_, index) => {
    const token = index.toString(16).padStart(64, '0');
    const value = state(token, { items: [{ status: index === 999 ? 'retryable' : 'released' }] });
    value.product_channel = 'standalone';
    value.created_at = new Date(now - (1000 - index) * 1000).toISOString();
    return value;
  });
  const item = fixture({ states: retained });
  const snapshot = item.recovery.productStatusSnapshot('standalone');
  assert.strictEqual(item.events.filter((event) => event === 'readdir').length, 1);
  assert.strictEqual(item.events.filter((event) => event.startsWith('read:')).length, retained.length);
  assert.strictEqual(snapshot.recovery.recoverable_batches, 1);
  assert.strictEqual(snapshot.recovery.batches_awaiting_resume, 1);
  assert.strictEqual(snapshot.latest.resumable, true);
  assert.doesNotMatch(JSON.stringify(snapshot), /[a-f0-9]{64}|batch_token|path|name|hash/u);
});

test('one product snapshot preserves latest counters while a global owner is active', () => {
  const latest = state(tokens[0], { live: true, items: [{ status: 'processing' }] });
  latest.product_channel = 'standalone';
  latest.created_at = '2026-08-25T11:00:00.000Z';
  const options = { owner: { pid: 42 }, alive: [42], states: [latest] };
  const combined = fixture(options);
  const snapshot = combined.recovery.productStatusSnapshot('standalone');
  const separate = fixture(options);
  assert.deepStrictEqual(snapshot.recovery, separate.recovery.recoverableBatchStatus());
  assert.deepStrictEqual(snapshot.latest, separate.recovery.latestProductBatchStatus('standalone'));
  assert.strictEqual(snapshot.recovery.batch_processing_active, true);
  assert.strictEqual(snapshot.latest.processing, true);
  assert.strictEqual(combined.events.filter((event) => event === 'readdir').length, 1);
  assert.strictEqual(combined.events.filter((event) => event.startsWith('read:')).length, 1);
});

test('latest product result directory resolves only the exact latest completed run', () => {
  const older = state(tokens[0], { items: [{ status: 'released' }] });
  older.product_channel = 'standalone';
  older.created_at = '2026-08-25T10:00:00.000Z';
  const latest = state(tokens[1], { items: [{ status: 'released' }] });
  latest.product_channel = 'standalone';
  latest.created_at = '2026-08-25T12:00:00.000Z';
  const item = fixture({
    states: [older, latest],
    visibleDirectories: { [tokens[0]]: 'run:older', [tokens[1]]: 'run:latest' }
  });
  assert.strictEqual(item.recovery.latestProductResultDirectory('standalone'), 'run:latest');
  assert.strictEqual(item.recovery.latestProductResultDirectory('plugin'), '');
});

test('a newer active run does not hide the latest completed visible result directory', () => {
  const completed = state(tokens[0], { items: [{ status: 'released' }] });
  completed.product_channel = 'standalone';
  completed.created_at = '2026-08-25T10:00:00.000Z';
  const active = state(tokens[1], { items: [{ status: 'processing' }] });
  active.product_channel = 'standalone';
  active.created_at = '2026-08-25T12:00:00.000Z';
  const item = fixture({
    states: [completed, active],
    visibleDirectories: { [tokens[0]]: 'run:completed' }
  });
  assert.strictEqual(item.recovery.latestProductResultDirectory('standalone'), 'run:completed');
  assert.strictEqual(item.recovery.latestProductBatchStatus('standalone').processing, true,
    'status still reports the newer active run');
});

test('lock acquisition failure skips recovery without touching journals and root-read failure still releases once', () => {
  const blocked = fixture({ acquireError: new Error('busy'), states: [state(tokens[0])] });
  assert.deepStrictEqual(blocked.recovery.recoverBatches(), {
    recovered: 0, removed: 0, failures: 0, skipped_active: true
  });
  assert.strictEqual(blocked.events.filter((event) => event === 'readdir').length, 0);
  assert.strictEqual(blocked.events.filter((event) => event.startsWith('release:')).length, 0);

  const unreadable = fixture({ readdirError: new Error('denied') });
  assert.deepStrictEqual(unreadable.recovery.recoverBatches(), {
    recovered: 0, removed: 0, failures: 1, skipped_active: false
  });
  assert.strictEqual(unreadable.events.filter((event) => event.startsWith('release:')).length, 1);
});

test('mixed recovery isolates malformed and live-executor journals and writes one ordered final state', () => {
  const malformed = state(tokens[0]);
  const live = state(tokens[1], { live: true, interrupted: 1 });
  const valid = state(tokens[2], { doPublished: true, doMapping: true, interrupted: 2, cleanupChanged: true });
  const item = fixture({ states: [malformed, live, valid], readFailure: tokens[0] });
  const result = item.recovery.recoverBatches();
  assert.deepStrictEqual(result, { recovered: 4, removed: 0, failures: 1, skipped_active: false });
  assert.deepStrictEqual(item.events.filter((event) => event.endsWith(`:${tokens[2]}`)), [
    `read:${tokens[2]}`,
    `published:${tokens[2]}`,
    `mapping:${tokens[2]}`,
    `retry:${tokens[2]}`,
    `cleanup-retry:${tokens[2]}`,
    `write:${tokens[2]}`
  ]);
  assert.deepStrictEqual(item.events.filter((event) => event.endsWith(`:${tokens[1]}`)), [`read:${tokens[1]}`]);
  assert.strictEqual(item.events.filter((event) => event.startsWith('release:')).length, 1);

  const second = item.recovery.recoverBatches();
  assert.deepStrictEqual(second, { recovered: 0, removed: 0, failures: 1, skipped_active: false });
  assert.strictEqual(item.events.filter((event) => event === `write:${tokens[2]}`).length, 1);
});

test('recovery expiry cleanup is ordered, isolated per journal and counts partial failures', () => {
  const first = state(tokens[0], { expires_at: past });
  const second = state(tokens[1], { expires_at: past });
  const item = fixture({ states: [first, second], cleanupFailure: tokens[0] });
  assert.deepStrictEqual(item.recovery.recoverBatches(), {
    recovered: 0, removed: 1, failures: 1, skipped_active: false
  });
  assert.deepStrictEqual(item.events.filter((event) => /^(remove-work|unlink):/u.test(event)), [
    `remove-work:${tokens[0]}`,
    `remove-work:${tokens[1]}`,
    `unlink:${tokens[1]}`
  ]);
});

test('periodic expiry cleanup uses the same lock, liveness and work-before-journal contract', () => {
  const blocked = fixture({ acquireError: new Error('busy') });
  assert.deepStrictEqual(blocked.recovery.cleanupExpiredBatchSnapshots(), {
    removed: 0, failures: 0, skipped_active: true
  });

  const live = state(tokens[0], { expires_at: past, live: true });
  const unlinkFailure = state(tokens[1], { expires_at: past });
  const removed = state(tokens[2], { expires_at: past });
  const current = state(tokens[3], { expires_at: future });
  const item = fixture({ states: [live, unlinkFailure, removed, current], unlinkFailure: tokens[1] });
  assert.deepStrictEqual(item.recovery.cleanupExpiredBatchSnapshots(), {
    removed: 1, failures: 1, skipped_active: false
  });
  assert.deepStrictEqual(item.events.filter((event) => /^(remove-work|unlink):/u.test(event)), [
    `remove-work:${tokens[1]}`,
    `unlink:${tokens[1]}`,
    `remove-work:${tokens[2]}`,
    `unlink:${tokens[2]}`
  ]);
  assert.strictEqual(item.events.filter((event) => event.startsWith('release:')).length, 1);
});

test('cleanup-only recovery writes once without inflating the recovered counter', () => {
  const value = state(tokens[0], { cleanupChanged: true, items: [{ status: 'released' }] });
  const item = fixture({ states: [value] });
  assert.deepStrictEqual(item.recovery.recoverBatches(), {
    recovered: 0, removed: 0, failures: 0, skipped_active: false
  });
  assert.strictEqual(item.events.filter((event) => event === `write:${tokens[0]}`).length, 1);
});

test('recovery makes a durable preflight stopped mapping terminal exactly once', () => {
  const value = state(tokens[0], { items: [{ status: 'preflight_mapping_pending' }] });
  const item = fixture({ states: [value], enablePreflight: true });
  assert.deepStrictEqual(item.recovery.recoverableBatchStates().map((entry) => entry.token), [tokens[0]]);
  assert.deepStrictEqual(item.recovery.recoverBatches(), {
    recovered: 1, removed: 0, failures: 0, skipped_active: false
  });
  assert.strictEqual(value.items[0].status, 'stopped');
  assert.strictEqual(item.events.filter((event) => event === `preflight-mapping:${tokens[0]}`).length, 1);
  assert.strictEqual(item.events.filter((event) => event === `write:${tokens[0]}`).length, 1);
  assert.deepStrictEqual(item.recovery.recoverBatches(), {
    recovered: 0, removed: 0, failures: 0, skipped_active: false
  });
  assert.strictEqual(item.events.filter((event) => event === `write:${tokens[0]}`).length, 1);
});

test('evidence outbox and terminal repair run under the same lock without changing batch recovery counters', () => {
  const complete = state(tokens[0], { items: [{ status: 'released' }] });
  const pending = state(tokens[1], { items: [{ status: 'pending' }] });
  const expired = state(tokens[2], { expires_at: past, items: [{ status: 'stopped' }] });
  const item = fixture({ states: [complete, pending, expired], enableEvidence: true, outboxRepaired: 1 });
  assert.deepStrictEqual(item.recovery.recoverBatches(), {
    recovered: 0, removed: 1, failures: 0, skipped_active: false
  });
  assert.strictEqual(item.events.indexOf('evidence-outbox') < item.events.indexOf('readdir'), true);
  assert.ok(item.events.includes(`evidence:${tokens[0]}`));
  assert.ok(item.events.includes(`evidence:${tokens[1]}`));
  assert.ok(item.events.indexOf(`evidence:${tokens[2]}`) < item.events.indexOf(`remove-work:${tokens[2]}`));
  assert.strictEqual(item.events.filter((event) => event.startsWith('release:')).length, 1);
});

test('lock release errors remain visible instead of reporting a false successful maintenance result', () => {
  for (const options of [{ releaseError: new Error('EPERM') }, { refuseRelease: true }]) {
    const item = fixture(options);
    assert.throws(() => item.recovery.recoverBatches(), /nicht sicher freigegeben/u);
    assert.throws(() => item.recovery.cleanupExpiredBatchSnapshots(), /nicht sicher freigegeben/u);
  }
});

test('the batch composition root preserves public and internal recovery facades', () => {
  const batch = require('../plugins/data-secure/server/gateway/batch');
  for (const name of ['recoverableBatchStatus', 'latestProductBatchStatus', 'localCleanupStatus', 'recoverBatches', 'cleanupExpiredBatchSnapshots']) {
    assert.strictEqual(typeof batch[name], 'function', name);
  }
  assert.strictEqual(typeof batch._test.recoverableBatchStates, 'function');
  assert.strictEqual(typeof batch._test.localCleanupStatus, 'function');
});

done();
