'use strict';

const path = require('path');
const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchReconciliation } = require('../plugins/data-secure/server/gateway/batch-reconciliation');
const { notProcessedDocumentResult } = require('../plugins/data-secure/server/gateway/document-result-grade');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch reconciliation');
const packageId = `ds_${'a'.repeat(32)}`;
const output = path.join('private-root', 'Output');
const completeResult = Object.freeze({
  schema: 'datasecure-document-result/1', grade: 'complete', omissions: [], reason_code: null
});

function fixture(options = {}) {
  const events = [];
  const mappingCalls = [];
  const mode = options.mode || 'v3';
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
      const value = {
        schema: mode === 'wrong-schema' ? 'other' : (mode === 'v3' ? 'eu-privacy-package/3' : 'eu-privacy-package/2'),
        package_id: mode === 'wrong-package' ? `ds_${'c'.repeat(32)}` : packageId,
        document: `${packageId}.md`,
        document_sha256: digest
      };
      if (mode === 'v3') Object.assign(value, {
        parser_warnings: [], assets: [], pdf_unextractable_visual_objects: 0,
        images_removed_by_explicit_request: 0,
        visual_assets_withheld_at_release: 0,
        document_result: completeResult
      });
      return JSON.stringify(value);
    }
  };
  let failure = options.mappingFailure;
  const reconciliation = createBatchReconciliation({
    SafeError,
    io,
    path,
    roots: options.roots || (() => ({ output })),
    sha256File: () => mode === 'hash-mismatch' ? 'd'.repeat(64) : digest,
    ensureMappingOutbox(name, id, documentResult) {
      events.push(`ensure:${name}:${id}`);
      mappingCalls.push({ phase: 'intent', name, id, documentResult });
      if (failure === 'ensure') throw new Error('ENSURE_FAILED');
      return { name: 'intent' };
    },
    appendMapping(name, id, status, settings) {
      events.push(`append:${name}:${id}`);
      mappingCalls.push({ phase: 'append', name, id, status, settings });
      if (failure === 'append') throw new Error('APPEND_FAILED');
    },
    removeMappingOutbox() {
      events.push('remove');
      if (failure === 'remove') throw new Error('REMOVE_FAILED');
    },
    mappingPendingStatus: 'mapping_pending',
    deliveryPendingStatus: 'delivery_pending'
  });
  return { reconciliation, events, mappingCalls, clearFailure() { failure = undefined; } };
}

test('package verification keeps the exact verified, missing, unsafe and structural-false contract', () => {
  assert.strictEqual(fixture({ mode: 'verified' }).reconciliation.publishedPackageState(packageId), 'verified');
  assert.strictEqual(fixture({ mode: 'v3' }).reconciliation.publishedPackageState(packageId), 'verified');
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
    document_result: completeResult,
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

test('a v1 journal adopts an already published v2 package without inventing a grade', () => {
  const { reconciliation, mappingCalls } = fixture({ mode: 'v2' });
  const item = { id: 'a'.repeat(32), name: 'legacy.docx', status: 'processing', checkpoint: 'package_published' };
  const state = { schema: 'datasecure-batch/1', items: [item] };
  assert.strictEqual(reconciliation.reconcilePublishedItems(state), true);
  assert.strictEqual(Object.hasOwn(item, 'document_result'), false);
  assert.strictEqual(item.status, 'mapping_pending');
  assert.strictEqual(reconciliation.reconcilePendingMappings(state), true);
  assert.strictEqual(item.status, 'delivery_pending');
  assert.strictEqual(mappingCalls[0].documentResult, undefined);
  assert.strictEqual(mappingCalls[1].settings.documentResult, undefined);

  const v2State = { schema: 'datasecure-batch/2', items: [
    { id: 'a'.repeat(32), name: 'forged.docx', status: 'processing', checkpoint: 'package_published' }
  ] };
  assert.strictEqual(reconciliation.reconcilePublishedItems(v2State), false);
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
    mapping_outbox_persisted: false,
    document_result: completeResult
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
      mapping_outbox_persisted: false,
      document_result: completeResult
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

test('preflight stops become terminal only after an idempotent local stopped mapping', () => {
  const { reconciliation, mappingCalls } = fixture();
  const item = {
    id: 'e'.repeat(32),
    name: '=duplicate.docx',
    status: 'preflight_mapping_pending',
    checkpoint: 'source_preflight_rejected',
    error_code: 'SOURCE_TYPE_MISMATCH',
    document_result: notProcessedDocumentResult('SOURCE_TYPE_MISMATCH'),
    local_mapping_exported: false
  };
  const state = { items: [item] };
  assert.strictEqual(reconciliation.reconcilePreflightStoppedMappings(state), true);
  assert.strictEqual(item.status, 'stopped');
  assert.strictEqual(item.checkpoint, 'source_preflight_stopped');
  assert.strictEqual(item.local_mapping_exported, true);
  assert.deepStrictEqual(mappingCalls[0], {
    phase: 'append',
    name: '=duplicate.docx', id: '', status: 'sicher gestoppt',
    settings: {
      mappingReference: 'e'.repeat(32),
      documentResult: notProcessedDocumentResult('SOURCE_TYPE_MISMATCH')
    }
  });
  assert.strictEqual(reconciliation.reconcilePreflightStoppedMappings(state), false);
  assert.strictEqual(mappingCalls.length, 1);
});

test('failed stopped mapping remains recoverable and snapshot-bearing impostors are ignored', () => {
  const pending = {
    id: 'f'.repeat(32), name: 'blocked.pdf', status: 'preflight_mapping_pending',
    checkpoint: 'source_preflight_rejected', error_code: 'SOURCE_FORMAT_NOT_RELEASED',
    document_result: notProcessedDocumentResult('SOURCE_FORMAT_NOT_RELEASED'),
    local_mapping_exported: false
  };
  const failed = fixture({ mappingFailure: 'append' });
  assert.strictEqual(failed.reconciliation.reconcilePreflightStoppedMappings({ items: [pending] }), false);
  assert.strictEqual(pending.status, 'preflight_mapping_pending');
  failed.clearFailure();
  assert.strictEqual(failed.reconciliation.reconcilePreflightStoppedMappings({ items: [pending] }), true);
  const forged = { ...pending, status: 'preflight_mapping_pending', checkpoint: 'source_preflight_rejected', work_name: '001_fake.txt' };
  assert.strictEqual(failed.reconciliation.reconcilePreflightStoppedMappings({ items: [forged] }), false);
  assert.strictEqual(forged.status, 'preflight_mapping_pending');
});

test('the batch composition root preserves every reconciliation test facade', () => {
  const { _test } = require('../plugins/data-secure/server/gateway/batch');
  for (const name of [
    'packageIdForItem',
    'publishedPackageState',
    'regularPublishedPackage',
    'commitPendingMapping',
    'reconcilePendingMappings',
    'reconcilePreflightStoppedMappings',
    'reconcilePublishedItems',
    'markInterruptedItemsRetryable'
  ]) assert.strictEqual(typeof _test[name], 'function', name);
});

done();
