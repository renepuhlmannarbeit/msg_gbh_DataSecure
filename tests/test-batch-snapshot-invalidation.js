'use strict';

const { createBatchSnapshotInvalidation } = require('../plugins/data-secure/server/gateway/batch-snapshot-invalidation');
const batchFacade = require('../plugins/data-secure/server/gateway/batch');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch snapshot invalidation boundary');

function item(status, id) {
  return {
    id,
    name: `${id}.txt`,
    work_name: `${id}.snapshot`,
    status,
    checkpoint: status,
    package_id: status === 'released' || status === 'delivery_pending' || status === 'mapping_pending'
      ? `package-${id}`
      : undefined,
    local_mapping_exported: status === 'released' ? true : undefined,
    work_copy_cleanup_pending: status === 'released' ? false : undefined
  };
}

function fixture(options = {}) {
  const events = [];
  const invalidation = createBatchSnapshotInvalidation({
    deferredReviewStatus: 'deferred_review',
    mappingStoppedStatus: 'mapping-stopped',
    appendMapping(name, packageId, status) {
      events.push(`mapping:${name}:${packageId}:${status}`);
      if (options.mappingFailures?.has(name)) throw new Error(`MAPPING:${name}`);
    },
    cleanupTerminalWorkCopy(state, value, deps) {
      events.push(`cleanup:${value.name}:${deps.marker || 'none'}`);
      if (options.cleanupFailures?.has(value.name)) throw new Error(`CLEANUP:${value.name}`);
      delete value.work_copy_cleanup_pending;
    }
  }).invalidateUnpublishedBatchCopies;
  return { invalidation, events };
}

test('only unpublished statuses stop while committed states remain byte-equal', () => {
  const eligible = ['pending', 'processing', 'retryable', 'deferred_review'].map((status, index) => item(status, `open-${index}`));
  const protectedItems = ['mapping_pending', 'delivery_pending', 'released', 'stopped'].map((status, index) => item(status, `safe-${index}`));
  const protectedBefore = structuredClone(protectedItems);
  const state = { invalidated: false, items: [...eligible, ...protectedItems] };
  const value = fixture();
  assert.strictEqual(value.invalidation(state, { marker: 'deps' }), undefined);
  assert.strictEqual(state.invalidated, true);
  for (const candidate of eligible) {
    assert.strictEqual(candidate.status, 'stopped');
    assert.strictEqual(candidate.checkpoint, 'stopped');
    assert.strictEqual(candidate.error_code, 'BATCH_SNAPSHOT_CHANGED');
    assert.strictEqual(candidate.local_mapping_exported, true);
  }
  assert.deepStrictEqual(protectedItems, protectedBefore);
  assert.strictEqual(value.events.filter((event) => event.startsWith('mapping:')).length, 4);
  assert.strictEqual(value.events.filter((event) => event.startsWith('cleanup:')).length, 4);
});

test('exceptItem uses strict object identity and leaves only that instance unchanged', () => {
  const except = item('pending', 'same');
  const equalLooking = structuredClone(except);
  const before = structuredClone(except);
  const state = { items: [except, equalLooking] };
  const value = fixture();
  value.invalidation(state, {}, except);
  assert.deepStrictEqual(except, before);
  assert.strictEqual(equalLooking.status, 'stopped');
  assert.strictEqual(value.events.length, 2);
});

test('mapping and cleanup failures are isolated per item and preserve event order', () => {
  const state = { items: [item('pending', 'a'), item('pending', 'b'), item('pending', 'c'), item('pending', 'd')] };
  const value = fixture({
    mappingFailures: new Set(['a.txt', 'c.txt']),
    cleanupFailures: new Set(['b.txt', 'c.txt'])
  });
  value.invalidation(state, { marker: 'x' });
  assert.ok(state.items.every((candidate) => candidate.status === 'stopped'));
  assert.deepStrictEqual(state.items.map((candidate) => candidate.local_mapping_exported), [false, true, false, true]);
  assert.deepStrictEqual(state.items.map((candidate) => candidate.work_copy_cleanup_pending === true), [false, true, true, false]);
  for (const candidate of state.items) {
    assert.ok(value.events.indexOf(`mapping:${candidate.name}::mapping-stopped`) <
      value.events.indexOf(`cleanup:${candidate.name}:x`));
  }
});

test('an empty or fully committed batch changes only the invalidated marker', () => {
  for (const items of [[], [item('released', 'released')]]) {
    const state = { invalidated: false, items };
    const before = structuredClone(items);
    const value = fixture();
    value.invalidation(state);
    assert.strictEqual(state.invalidated, true);
    assert.deepStrictEqual(items, before);
    assert.deepStrictEqual(value.events, []);
  }
});

test('repeated invalidation does not remap or reclean already stopped items', () => {
  const state = { items: [item('pending', 'once')] };
  const value = fixture();
  value.invalidation(state);
  const afterFirst = structuredClone(state);
  const eventCount = value.events.length;
  value.invalidation(state);
  assert.deepStrictEqual(state, afterFirst);
  assert.strictEqual(value.events.length, eventCount);
});

test('dependency failures never escape with document-bearing details', () => {
  const state = { items: [item('pending', 'Secret-Customer-Path')] };
  const value = fixture({
    mappingFailures: new Set(['Secret-Customer-Path.txt']),
    cleanupFailures: new Set(['Secret-Customer-Path.txt'])
  });
  assert.doesNotThrow(() => value.invalidation(state));
  assert.strictEqual(state.items[0].local_mapping_exported, false);
  assert.strictEqual(state.items[0].work_copy_cleanup_pending, true);
});

test('the public processing facade remains unchanged', () => {
  assert.strictEqual(typeof batchFacade.processBatchNext, 'function');
});

done();
