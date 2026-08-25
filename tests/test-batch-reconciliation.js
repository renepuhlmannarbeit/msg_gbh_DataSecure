'use strict';

const path = require('path');
const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchReconciliation } = require('../plugins/data-secure/server/gateway/batch-reconciliation');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch reconciliation');
const packageId = `ds_${'a'.repeat(32)}`;
const output = path.join('private-root', 'Output');

function fixture(options = {}) {
  const events = [];
  const mode = options.mode || 'verified';
  const packageFolder = path.join(output, packageId);
  const manifestPath = path.join(packageFolder, 'manifest.json');
  const documentPath = path.join(packageFolder, `${packageId}.md`);
  const digest = 'b'.repeat(64);
  const io = {
    existsSync(target) { return target === packageFolder && mode !== 'missing'; },
    lstatSync(target) {
      if (target === packageFolder) {
        return {
          isDirectory: () => mode !== 'not-directory',
          isSymbolicLink: () => mode === 'folder-symlink'
        };
      }
      if (target === manifestPath || target === documentPath) {
        return {
          isFile: () => mode !== 'not-file',
          isSymbolicLink: () => mode === 'document-symlink'
        };
      }
      throw new Error('unexpected path');
    },
    readFileSync(target) {
      if (target !== manifestPath) throw new Error('unexpected read');
      if (mode === 'malformed-manifest') return '{';
      return JSON.stringify({
        schema: mode === 'wrong-schema' ? 'other' : 'eu-privacy-package/2',
        package_id: mode === 'wrong-package' ? `ds_${'c'.repeat(32)}` : packageId,
        document: `${packageId}.md`,
        document_sha256: digest
      });
    }
  };
  let failure = options.mappingFailure;
  const reconciliation = createBatchReconciliation({
    SafeError,
    io,
    path,
    roots: options.roots || (() => ({ output })),
    sha256File: () => mode === 'hash-mismatch' ? 'd'.repeat(64) : digest,
    ensureMappingOutbox(name, id) {
      events.push(`ensure:${name}:${id}`);
      if (failure === 'ensure') throw new Error('ENSURE_FAILED');
      return { name: 'intent' };
    },
    appendMapping(name, id) {
      events.push(`append:${name}:${id}`);
      if (failure === 'append') throw new Error('APPEND_FAILED');
    },
    removeMappingOutbox() {
      events.push('remove');
      if (failure === 'remove') throw new Error('REMOVE_FAILED');
    },
    mappingPendingStatus: 'mapping_pending',
    deliveryPendingStatus: 'delivery_pending'
  });
  return { reconciliation, events, clearFailure() { failure = undefined; } };
}

test('package verification keeps the exact verified, missing, unsafe and structural-false contract', () => {
  assert.strictEqual(fixture().reconciliation.publishedPackageState(packageId), 'verified');
  assert.strictEqual(fixture({ mode: 'missing' }).reconciliation.publishedPackageState(packageId), 'missing');
  assert.strictEqual(fixture({ mode: 'not-directory' }).reconciliation.publishedPackageState(packageId), false);
  assert.strictEqual(fixture({ mode: 'folder-symlink' }).reconciliation.publishedPackageState(packageId), false);
  assert.strictEqual(fixture({ mode: 'not-file' }).reconciliation.publishedPackageState(packageId), false);
  assert.strictEqual(fixture({ mode: 'document-symlink' }).reconciliation.publishedPackageState(packageId), false);
  for (const mode of ['malformed-manifest', 'wrong-schema', 'wrong-package', 'hash-mismatch']) {
    assert.strictEqual(fixture({ mode }).reconciliation.publishedPackageState(packageId), 'unsafe', mode);
  }
  assert.strictEqual(fixture().reconciliation.publishedPackageState('../escape'), 'unsafe');
  assert.strictEqual(fixture({ roots: () => { throw new Error('unavailable'); } }).reconciliation.publishedPackageState(packageId), 'unsafe');
});

test('package ids are deterministic and invalid item identities fail closed', () => {
  const { reconciliation } = fixture();
  assert.strictEqual(reconciliation.packageIdForItem({ id: 'a'.repeat(32) }), packageId);
  for (const id of ['', 'a'.repeat(31), '../' + 'a'.repeat(32), 'g'.repeat(32)]) {
    assert.throws(() => reconciliation.packageIdForItem({ id }), /Batch-Identität ist ungültig/i);
  }
});

test('verified processing items are adopted before interrupted work becomes retryable', () => {
  const { reconciliation } = fixture();
  const adopted = { id: 'a'.repeat(32), name: 'one.txt', status: 'processing' };
  const invalid = { id: 'g'.repeat(32), name: 'two.txt', status: 'processing' };
  const pending = { id: 'a'.repeat(32), status: 'pending' };
  const released = { id: 'a'.repeat(32), status: 'released' };
  const state = { items: [adopted, invalid, pending, released] };

  assert.strictEqual(reconciliation.reconcilePublishedItems(state), true);
  assert.deepStrictEqual(adopted, {
    id: 'a'.repeat(32),
    name: 'one.txt',
    status: 'mapping_pending',
    checkpoint: 'mapping_pending',
    package_id: packageId,
    error_code: 'LOCAL_MAPPING_EXPORT_PENDING',
    mapping_outbox_persisted: false,
    work_copy_cleanup_pending: true
  });
  assert.strictEqual(reconciliation.reconcilePublishedItems(state), false);
  assert.strictEqual(reconciliation.markInterruptedItemsRetryable(state), 1);
  assert.strictEqual(adopted.status, 'mapping_pending');
  assert.deepStrictEqual(invalid, {
    id: 'g'.repeat(32),
    name: 'two.txt',
    status: 'retryable',
    checkpoint: 'retryable',
    error_code: 'PROCESSING_INTERRUPTED'
  });
  assert.strictEqual(reconciliation.markInterruptedItemsRetryable(state), 0);
  assert.strictEqual(pending.status, 'pending');
  assert.strictEqual(released.status, 'released');
});

test('missing or unsafe output is never adopted or mapped', () => {
  for (const mode of ['missing', 'hash-mismatch', 'folder-symlink']) {
    const { reconciliation, events } = fixture({ mode });
    const processing = { id: 'a'.repeat(32), name: 'one.txt', status: 'processing' };
    assert.strictEqual(reconciliation.reconcilePublishedItems({ items: [processing] }), false, mode);
    assert.strictEqual(processing.status, 'processing', mode);
    assert.strictEqual(reconciliation.markInterruptedItemsRetryable({ items: [processing] }), 1, mode);
    const mapping = { name: 'one.txt', status: 'mapping_pending', package_id: packageId };
    assert.strictEqual(reconciliation.reconcilePendingMappings({ items: [mapping] }), false, mode);
    assert.strictEqual(mapping.status, 'mapping_pending', mode);
    assert.deepStrictEqual(events, [], mode);
  }
});

test('mapping commit preserves the durable intent to CSV to intent-removal order', () => {
  const { reconciliation, events } = fixture();
  const item = {
    name: 'one.txt',
    status: 'mapping_pending',
    package_id: packageId,
    error_code: 'LOCAL_MAPPING_EXPORT_PENDING',
    mapping_outbox_persisted: false
  };
  assert.strictEqual(reconciliation.reconcilePendingMappings({ items: [item] }), true);
  assert.deepStrictEqual(events, [`ensure:one.txt:${packageId}`, `append:one.txt:${packageId}`, 'remove']);
  assert.strictEqual(item.status, 'delivery_pending');
  assert.strictEqual(item.checkpoint, 'delivery_pending');
  assert.strictEqual(item.error_code, undefined);
  assert.strictEqual(item.mapping_outbox_persisted, undefined);
  assert.strictEqual(reconciliation.reconcilePendingMappings({ items: [item] }), false);
});

test('every mapping crash boundary remains pending and can be retried without publication downgrade', () => {
  for (const phase of ['ensure', 'append', 'remove']) {
    const item = {
      name: 'one.txt',
      status: 'mapping_pending',
      package_id: packageId,
      error_code: 'LOCAL_MAPPING_EXPORT_PENDING',
      mapping_outbox_persisted: false
    };
    const { reconciliation, events, clearFailure } = fixture({ mappingFailure: phase });
    assert.strictEqual(reconciliation.reconcilePendingMappings({ items: [item] }), false, phase);
    assert.strictEqual(item.status, 'mapping_pending', phase);
    assert.strictEqual(item.error_code, 'LOCAL_MAPPING_EXPORT_PENDING', phase);
    assert.strictEqual(events[0], `ensure:one.txt:${packageId}`, phase);
    assert.strictEqual(item.mapping_outbox_persisted, phase === 'ensure' ? false : true, phase);

    clearFailure();
    assert.strictEqual(reconciliation.reconcilePendingMappings({ items: [item] }), true, phase);
    assert.strictEqual(item.status, 'delivery_pending', phase);
    assert.strictEqual(item.mapping_outbox_persisted, undefined, phase);
  }
});

test('interruption recovery mutates only processing items and is idempotent', () => {
  const { reconciliation } = fixture();
  const statuses = ['pending', 'processing', 'released', 'stopped', 'delivery_pending', 'mapping_pending', 'deferred_review', 'processing'];
  const items = statuses.map((status, index) => ({ status, marker: index }));
  const untouched = items.filter((item) => item.status !== 'processing').map((item) => ({ ...item }));
  assert.strictEqual(reconciliation.markInterruptedItemsRetryable({ items }), 2);
  assert.deepStrictEqual(items.filter((item) => item.status !== 'retryable'), untouched);
  for (const item of items.filter((entry) => entry.status === 'retryable')) {
    assert.strictEqual(item.checkpoint, 'retryable');
    assert.strictEqual(item.error_code, 'PROCESSING_INTERRUPTED');
  }
  assert.strictEqual(reconciliation.markInterruptedItemsRetryable({ items }), 0);
});

test('the batch composition root preserves every reconciliation test facade', () => {
  const { _test } = require('../plugins/data-secure/server/gateway/batch');
  for (const name of [
    'packageIdForItem',
    'publishedPackageState',
    'regularPublishedPackage',
    'commitPendingMapping',
    'reconcilePendingMappings',
    'reconcilePublishedItems',
    'markInterruptedItemsRetryable'
  ]) assert.strictEqual(typeof _test[name], 'function', name);
});

done();
