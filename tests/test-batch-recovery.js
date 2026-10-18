'use strict';

const { createBatchRecovery } = require('../plugins/data-secure/server/gateway/batch-recovery');
const { createBatchProgress } = require('../plugins/data-secure/server/gateway/batch-progress');
const { createBatchTerminalEvidence } = require('../plugins/data-secure/server/gateway/batch-terminal-evidence');
const { notProcessedDocumentResult } = require('../plugins/data-secure/server/gateway/document-result-grade');
const { initializeProduct } = require('../plugins/data-secure/server/core/product-bootstrap');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch recovery orchestration');
const tokens = ['a', 'b', 'c', 'd', 'e'].map((character) => character.repeat(64));
const now = Date.parse('2026-08-25T12:00:00.000Z');
const future = '2026-08-26T12:00:00.000Z';
const past = '2026-08-24T12:00:00.000Z';
const { publicProgress } = createBatchProgress({
  deliveryPendingStatus: 'delivery_pending', deferredReviewStatus: 'deferred_review',
  mappingPendingStatus: 'mapping_pending', liveLocalExecutor: (value) => value.live === true,
  publishedPackageRecord: () => null
});

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
    ...(options.beforeStateRemoval ? { beforeStateRemoval: options.beforeStateRemoval } : {}),
    ...(options.captureStandaloneHistory ? { captureStandaloneHistory: options.captureStandaloneHistory } : {}),
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
    publicProgress,
    visibleExportDirectory: (token) => options.visibleDirectories?.[token] || '',
    ...(options.visibleExportStatus ? { visibleExportStatus: options.visibleExportStatus } : {}),
    exportCompletedState(value) {
      events.push(`export:${value.token}`);
      if (options.exportOnEnsure && options.visibleDirectories) {
        options.visibleDirectories[value.token] = `run:${value.token.slice(0, 4)}`;
      }
      return { exported: value.items.length, pending: 0, available: true };
    },
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
    ...(options.enableDocumentCapture ? { captureDocumentRun(value) {
      events.push(`document-run:${value.token}`);
      if (options.documentCaptureFailure === value.token) throw new Error('DOCUMENT_REVIEW_CONFLICT');
    } } : {}),
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
    ...(options.terminalEvidenceWriter ? {
      reconcileTerminalEvidence(value) {
        events.push(`evidence:${value.token}`);
        return options.terminalEvidenceWriter(value);
      }
    } : {}),
    deliveryPendingStatus: 'delivery_pending',
    deferredReviewStatus: 'deferred_review',
    mappingPendingStatus: 'mapping_pending',
    preflightMappingPendingStatus: 'preflight_mapping_pending',
    ...(options.recoverableState ? { recoverableState: options.recoverableState } : {})
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

test('policy-incompatible journals are never advertised as executable continuations', () => {
  const compatible = state(tokens[0], { items: [{ status: 'retryable' }] });
  compatible.product_channel = 'standalone';
  compatible.created_at = '2026-08-25T10:00:00.000Z';
  compatible.compatible = true;
  const obsolete = state(tokens[1], { items: [{ status: 'pending' }] });
  obsolete.product_channel = 'standalone';
  obsolete.created_at = '2026-08-25T11:00:00.000Z';
  obsolete.compatible = false;
  const item = fixture({ states: [compatible, obsolete], recoverableState: (candidate) => candidate.compatible === true });
  assert.deepStrictEqual(item.recovery.recoverableBatchStates().map((candidate) => candidate.token), [compatible.token]);
  assert.strictEqual(item.recovery.latestProductBatchStatus('standalone').resumable, false,
    'the newest incompatible journal cannot override the executable recovery catalogue');
  const snapshot = item.recovery.productStatusSnapshot('standalone', { localUiSelection: true, selectedBatchId: obsolete.token });
  assert.strictEqual(snapshot.observed_recoverable, false);
  assert.strictEqual(snapshot.latest.resumable, false);
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
    completed_count: 2,
    failed_count: 1,
    review_count: 1,
    review_ready: true,
    result_count: 1,
    export_pending_count: 0,
    processing: false,
    pause_requested: false,
    paused: false,
    resumable: false,
    complete: false
  });
  assert.doesNotMatch(JSON.stringify(status), /[a-c]{64}|batch_token|path|name|hash/u);
  const pluginStatus = item.recovery.latestProductBatchStatus('plugin');
  assert.equal(Object.hasOwn(pluginStatus, 'pause_requested'), false);
  assert.equal(Object.hasOwn(pluginStatus, 'paused'), false);
  assert.ok(item.events.every((event) => !/^(write|unlink|remove-work|acquire):/u.test(event)));
  assert.strictEqual(fixture().recovery.latestProductBatchStatus('standalone'), null);
  assert.throws(() => item.recovery.latestProductBatchStatus('invalid'), /PRODUCT_CHANNEL_INVALID/u);
});

test('wide privacy status projects an unconfirmed converter termination', () => {
  const stopped = state(tokens[0], {
    items: [{ status: 'stopped', error_code: 'CONVERSION_TERMINATION_UNCONFIRMED' }]
  });
  Object.assign(stopped, {
    product_channel: 'standalone',
    schema: 'datasecure-batch/6',
    processing_mode: 'markdown-and-anonymize',
    created_at: '2026-08-25T12:00:00.000Z'
  });

  const status = fixture({ states: [stopped] }).recovery.latestProductBatchStatus('standalone');
  assert.strictEqual(status.termination_unconfirmed, true);
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

test('private Standalone observation follows an older active run and remains bound after its completion', () => {
  const older = state(tokens[0], { live: true, items: [{ status: 'processing' }, { status: 'pending' }, { status: 'pending' }] });
  Object.assign(older, { product_channel: 'standalone', schema: 'datasecure-batch/5',
    processing_mode: 'markdown-only', created_at: '2026-08-25T10:00:00.000Z' });
  const newer = state(tokens[1], { items: [{ status: 'released' }] });
  Object.assign(newer, { product_channel: 'standalone', created_at: '2026-08-25T11:00:00.000Z' });
  const item = fixture({ states: [older, newer] });
  const normal = item.recovery.productStatusSnapshot('standalone');
  assert.strictEqual(normal.latest.selected_count, 1);
  assert.ok(!Object.hasOwn(normal, 'observed_batch_id'), 'the ordinary public snapshot never carries a token');
  const observing = item.recovery.productStatusSnapshot('standalone', { localUiSelection: true });
  assert.strictEqual(observing.observed_batch_id, older.token);
  assert.strictEqual(observing.observed_is_active, true);
  assert.strictEqual(observing.latest.selected_count, 3);
  assert.strictEqual(observing.latest.processing_mode, 'markdown-only');
  older.live = false;
  older.items = [{ status: 'released' }, { status: 'released' }, { status: 'released' }];
  const terminal = item.recovery.productStatusSnapshot('standalone', { localUiSelection: true, selectedBatchId: older.token });
  assert.strictEqual(terminal.observed_batch_id, older.token);
  assert.strictEqual(terminal.latest.complete, true);
  assert.strictEqual(terminal.latest.result_count, 3);
  assert.strictEqual(item.recovery.productStatusSnapshot('standalone', {
    localUiSelection: true, selectedBatchId: tokens[4]
  }).latest, null, 'a missing observed run never falls back to the newer completion');
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

test('an explicit local open refreshes a legacy terminal export from its owning journal', () => {
  const completed = state(tokens[0], { items: [{ status: 'released' }] });
  completed.product_channel = 'standalone';
  completed.created_at = '2026-08-25T10:00:00.000Z';
  const visibleDirectories = {};
  const item = fixture({ states: [completed], visibleDirectories, exportOnEnsure: true });
  assert.strictEqual(item.recovery.latestProductResultDirectory('standalone'), '');
  assert.strictEqual(item.recovery.latestProductResultDirectory('standalone', { ensureExport: true }), 'run:aaaa');
  assert.strictEqual(item.events.filter((event) => event === `export:${tokens[0]}`).length, 1);
});

test('a newer active run does not hide the latest completed visible result directory', () => {
  const completed = state(tokens[0], { items: [{ status: 'released' }] });
  completed.product_channel = 'standalone';
  completed.created_at = '2026-08-25T10:00:00.000Z';
  const active = state(tokens[1], { live: true, items: [{ status: 'processing' }] });
  active.product_channel = 'standalone';
  active.created_at = '2026-08-25T12:00:00.000Z';
  const item = fixture({
    states: [completed, active],
    visibleDirectories: { [tokens[0]]: 'run:completed' }
  });
  assert.strictEqual(item.recovery.latestProductResultDirectory('standalone'), 'run:completed');
  assert.strictEqual(item.recovery.latestProductResultDirectory('standalone', { latestBatchOnly: true }), '',
    'the current-batch UI cannot silently resolve an earlier completed run');
  assert.strictEqual(item.recovery.latestProductBatchStatus('standalone').processing, true,
    'status still reports the newer active run');
});

test('current-batch resolution never falls back after an all-stopped batch', () => {
  const older = state(tokens[0], { items: [{ status: 'released' }] });
  older.product_channel = 'standalone';
  older.created_at = '2026-08-25T10:00:00.000Z';
  const failed = state(tokens[1], { items: [{ status: 'stopped' }] });
  failed.product_channel = 'standalone';
  failed.created_at = '2026-08-25T12:00:00.000Z';
  const directories = { [tokens[0]]: 'run:older' };
  const item = fixture({ states: [older, failed], visibleDirectories: directories });
  assert.strictEqual(item.recovery.latestProductResultDirectory('standalone', { latestBatchOnly: true }), '');
  assert.strictEqual(item.recovery.latestProductBatchStatus('standalone').completion_available, false);
  directories[tokens[1]] = 'run:failed-summary';
  assert.strictEqual(item.recovery.latestProductResultDirectory('standalone', { latestBatchOnly: true }), 'run:failed-summary');
});

test('both product status paths carry completion debt separately from released documents', () => {
  let pending = true;
  const stopped = state(tokens[0], { items: [{ status: 'released' }, { status: 'stopped' }] });
  stopped.product_channel = 'standalone';
  stopped.created_at = '2026-08-25T12:00:00.000Z';
  const item = fixture({
    states: [stopped], visibleDirectories: { [tokens[0]]: 'run:summary' },
    visibleExportStatus: () => ({ exported: 1, pending: 0, available: !pending,
      ...(pending ? { completion_pending: true } : {}) })
  });
  for (const status of [item.recovery.latestProductBatchStatus('standalone'), item.recovery.productStatusSnapshot('standalone').latest]) {
    assert.strictEqual(status.completion_pending, true);
    assert.strictEqual(status.export_pending_count, 0);
    assert.strictEqual(status.completed_count, 2);
    assert.strictEqual(status.result_count, 0);
    assert.strictEqual(status.completion_available, false);
  }
  pending = false;
  assert.strictEqual(item.recovery.productStatusSnapshot('standalone').latest.completion_pending, undefined);
  assert.strictEqual(item.recovery.latestProductBatchStatus('standalone').completion_available, true);
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

test('native boundary refusals are not misreported as an ordinary active maintenance skip', () => {
  for (const method of ['recoverBatches', 'cleanupExpiredBatchSnapshots']) {
    for (const code of ['OWNERSHIP_GUARD_ACCESS_DENIED', 'OWNERSHIP_GUARD_UNSAFE',
      'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'OWNERSHIP_GUARD_UNAVAILABLE']) {
      const failure = Object.assign(new Error(code), { code });
      const item = fixture({ acquireError: failure, states: [state(tokens[0])] });
      assert.throws(() => item.recovery[method](), error => error === failure);
      assert.ok(!item.events.includes('readdir'));
    }
    const busy = fixture({ acquireError: Object.assign(new Error('busy'), { code: 'OWNERSHIP_GUARD_BUSY' }) });
    assert.strictEqual(busy.recovery[method]().skipped_active, true);
  }
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

test('v2 membership repair precedes mapping and both expiry cleanup paths, without touching legacy or live runs', () => {
  const pending = { ...state(tokens[0], { items: [{ status: 'preflight_mapping_pending' }] }),
    product_channel: 'standalone', standalone_document_review: true };
  const expired = { ...pending, token: tokens[1], expires_at: past };
  const legacy = { ...state(tokens[2]), product_channel: 'standalone' };
  const live = { ...pending, token: tokens[3], live: true };
  const item = fixture({ states: [pending, expired, legacy, live], enableDocumentCapture: true, enablePreflight: true });
  assert.deepEqual(item.recovery.recoverBatches(), { recovered: 1, removed: 1, failures: 0, skipped_active: false });
  assert.equal(item.events.filter(event => event.startsWith('document-run:')).length, 2);
  assert.ok(item.events.indexOf(`document-run:${tokens[0]}`) < item.events.indexOf(`preflight-mapping:${tokens[0]}`));
  assert.ok(item.events.indexOf(`document-run:${tokens[1]}`) < item.events.indexOf(`remove-work:${tokens[1]}`));
  assert.equal(item.events.includes(`document-run:${tokens[2]}`), false);
  assert.equal(item.events.includes(`document-run:${tokens[3]}`), false);
  const periodic = fixture({ states: [expired], enableDocumentCapture: true });
  assert.equal(periodic.recovery.cleanupExpiredBatchSnapshots().removed, 1);
  assert.equal(periodic.events.includes(`document-run:${tokens[1]}`), true);
  assert.ok(periodic.events.indexOf(`document-run:${tokens[1]}`) < periodic.events.indexOf(`remove-work:${tokens[1]}`));
});

test('failed or unavailable v2 membership repair never removes the owning journal', () => {
  const value = { ...state(tokens[0], { expires_at: past }), product_channel: 'standalone', standalone_document_review: true };
  for (const operation of ['recoverBatches', 'cleanupExpiredBatchSnapshots']) {
    for (const options of [{ enableDocumentCapture: true, documentCaptureFailure: tokens[0] }, {}]) {
      const item = fixture({ states: [value], ...options });
      const result = item.recovery[operation]();
      assert.equal(result.failures, 1); assert.equal(result.removed, 0);
      assert.equal(item.events.some(event => /^(remove-work|unlink|mapping|preflight-mapping|write):/u.test(event)), false);
    }
  }
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

test('failed evidence repair preserves its last owning journal in both expiry paths', () => {
  for (const operation of ['recoverBatches', 'cleanupExpiredBatchSnapshots']) {
    const expired = state(tokens[0], { expires_at: past, items: [{ status: 'stopped' }] });
    const item = fixture({ states: [expired], enableEvidence: true, evidenceFailure: tokens[0] });
    const result = item.recovery[operation]();
    assert.equal(result.removed, 0); assert.equal(result.failures, 1);
    assert.equal(item.events.some(event => /^(remove-work|unlink):/u.test(event)), false);
  }
});

function markdownState(schema, status = 'pending') {
  return { ...state(tokens[0], { expires_at: past, items: [{ id: '1'.repeat(32), name: 'input.txt', status }] }),
    schema, product_channel: 'standalone', processing_mode: 'markdown-only', remove_images: false,
    ...(schema === 'datasecure-batch/7' ? { standalone_document_review: true,
      content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false } } : {}) };
}

function bootstrap(recovery, events) {
  return initializeProduct({
    assertRootSeparation() {}, verifyBundledRuntime() {}, ensureDurableRuntime() {}, migrateLegacyAuditReceipts() {},
    openBatchPackageProtection: () => ({ ids: new Set(), complete: true }),
    cleanupLocalData() {}, cleanupUiJobs() {},
    recoverBatches: () => recovery.recoverBatches(),
    replayMappingOutbox: () => ({ failures: 0 }),
    startBatchMaintenance: () => ({ stop() { events.push('maintenance-stop'); } }),
    cleanupExpiredBatchSnapshots: () => recovery.cleanupExpiredBatchSnapshots(),
    migrateLegacyInput: () => ({ failures: 0, active: false }),
    cleanupAbandonedWorkingJobs: () => ({ failures: 0 }),
    refuseStartup() { events.push('startup-refused'); }
  });
}

test('expired non-terminal Markdown runs do not owe evidence, using the real progress and evidence wrappers', () => {
  const coordinator = createBatchTerminalEvidence({ publicProgress });
  for (const schema of ['datasecure-batch/5', 'datasecure-batch/7']) {
    for (const status of ['pending', 'processing', 'retryable', 'deferred_review', 'delivery_pending']) {
      for (const operation of ['recoverBatches', 'cleanupExpiredBatchSnapshots']) {
        const value = markdownState(schema, status);
        assert.equal(publicProgress(value, { skipResultProjection: true }).complete, false);
        // This is the actual production return contract, not a false-returning
        // test stub: a non-terminal Markdown run has no completion evidence.
        assert.equal(coordinator.writeTerminalEvidence(value), false);
        const item = fixture({ states: [value], enableDocumentCapture: true,
          terminalEvidenceWriter: coordinator.writeTerminalEvidence });
        const result = item.recovery[operation]();
        assert.equal(result.removed, 1, `${schema} ${status} ${operation}`);
        assert.equal(result.failures, 0);
        assert.equal(item.events.includes(`evidence:${value.token}`), false);
        assert.equal(item.events.filter(event => event === `unlink:${value.token}`).length, 1);
        assert.equal(item.events.filter(event => event.startsWith('release:')).length, 1);
        if (schema === 'datasecure-batch/7') assert.ok(item.events.indexOf(`document-run:${value.token}`) <
          item.events.indexOf(`remove-work:${value.token}`), 'preserve the modern document run before expiry cleanup');
      }
    }
  }
});

test('the actual bootstrap starts after expiry cleanup of incomplete legacy and current Markdown runs', () => {
  const coordinator = createBatchTerminalEvidence({ publicProgress });
  for (const schema of ['datasecure-batch/5', 'datasecure-batch/7']) {
    const value = markdownState(schema);
    const item = fixture({ states: [value], enableDocumentCapture: true,
      terminalEvidenceWriter: coordinator.writeTerminalEvidence });
    const started = bootstrap(item.recovery, item.events);
    assert.equal(started.recovery.removed, 1); assert.equal(started.recovery.failures, 0);
    assert.equal(item.events.includes('startup-refused'), false);
    started.batchMaintenance.stop();
  }
});

function realTerminalFixture() {
  const value = { ...state(tokens[0], { expires_at: past, items: [{ id: '1'.repeat(32), status: 'stopped',
    error_code: 'INTERNAL_FAILURE', document_result: notProcessedDocumentResult('INTERNAL_FAILURE') }] }),
  schema: 'datasecure-batch/4', product_channel: 'standalone', profile: 'general', remove_images: false,
  created_at: '2026-08-23T12:00:00.000Z' };
  let blocked = true, writes = 0, appends = 0;
  const pending = new Map();
  // The real coordinator constructs and validates the actual evidence record.
  // Only its durable I/O dependencies are replaced by this private RAM store.
  const coordinator = createBatchTerminalEvidence({ publicProgress, nowIso: () => future,
    randomBytes: () => Buffer.alloc(16, 3), writeState() { writes++; },
    createPendingEvidence(record) {
      if (blocked) throw new Error('simulated pending-store failure');
      pending.set(record.receipt_id, record);
    },
    appendEvidenceRecord(record) { assert.equal(pending.get(record.receipt_id), record); appends++; },
    removePendingEvidence(record) { pending.delete(record.receipt_id); }
  });
  return { value, writer: coordinator.writeTerminalEvidence, repair() { blocked = false; },
    counts: () => ({ writes, appends, pending: pending.size }) };
}

test('real failed terminal evidence retains its journal in both expiry paths and permits cleanup after repair', () => {
  for (const operation of ['recoverBatches', 'cleanupExpiredBatchSnapshots']) {
    const terminal = realTerminalFixture();
    assert.equal(publicProgress(terminal.value, { skipResultProjection: true }).complete, true);
    const item = fixture({ states: [terminal.value], terminalEvidenceWriter: terminal.writer });
    const failed = item.recovery[operation]();
    assert.equal(failed.failures, 1); assert.equal(failed.removed, 0);
    assert.equal(terminal.value.terminal_evidence.status, 'pending');
    assert.equal(item.events.some(event => /^(remove-work|unlink):/u.test(event)), false);
    terminal.repair();
    const repaired = item.recovery[operation]();
    assert.equal(repaired.failures, 0); assert.equal(repaired.removed, 1);
    assert.equal(terminal.value.terminal_evidence.status, 'exported');
    assert.deepEqual(terminal.counts(), { writes: 2, appends: 1, pending: 0 });
    assert.equal(item.events.filter(event => event === `unlink:${terminal.value.token}`).length, 1);
    assert.equal(item.events.filter(event => event.startsWith('release:')).length, 2);
  }
});

test('the actual bootstrap refuses failed terminal evidence and starts after the same owning receipt is repaired', () => {
  const terminal = realTerminalFixture();
  const item = fixture({ states: [terminal.value], terminalEvidenceWriter: terminal.writer });
  assert.throws(() => bootstrap(item.recovery, item.events), /Batch recovery failed closed/u);
  assert.equal(item.events.includes('startup-refused'), true);
  assert.equal(item.events.some(event => /^(remove-work|unlink):/u.test(event)), false);
  assert.equal(item.events.filter(event => event === 'maintenance-stop').length, 1);
  const receiptId = terminal.value.terminal_evidence.receipt_id;
  terminal.repair();
  const started = bootstrap(item.recovery, item.events);
  assert.equal(started.recovery.removed, 1); assert.equal(started.recovery.failures, 0);
  assert.equal(terminal.value.terminal_evidence.receipt_id, receiptId);
  assert.equal(terminal.value.terminal_evidence.status, 'exported');
  assert.deepEqual(terminal.counts(), { writes: 2, appends: 1, pending: 0 });
  started.batchMaintenance.stop();
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

test('every expiry removal preserves summaries even after startup recovery was skipped', () => {
  for (const operation of ['recoverBatches', 'cleanupExpiredBatchSnapshots']) {
    let preserved = false;
    const value = { ...state(tokens[0], { expires_at: past, items: [{ status: 'stopped' }] }), product_channel: 'standalone' };
    const item = fixture({ states: [value], beforeStateRemoval(current) {
      assert.equal(current, value); preserved = true; item.events.push('preserve-summary');
    } });
    assert.equal(item.recovery[operation]().removed, 1);
    assert.equal(preserved, true);
    assert.ok(item.events.indexOf('preserve-summary') < item.events.indexOf(`remove-work:${tokens[0]}`));
    const blocked = fixture({ states: [value], beforeStateRemoval() { throw Error('SUMMARY_WRITE_UNCONFIRMED'); } });
    assert.equal(blocked.recovery[operation]().removed, 0);
    assert.equal(blocked.events.some(event => /^(unlink|remove-work):/u.test(event)), false,
      'a failed durable summary readback never authorizes removing the last journal');
  }
});

done();
