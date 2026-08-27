'use strict';

const { createBatchTerminalEvidence, validateMarker } = require('../plugins/data-secure/server/gateway/batch-terminal-evidence');
const { evidenceRecord } = require('../plugins/data-secure/server/gateway/batch-evidence');
const { releasedDocumentResult } = require('../plugins/data-secure/server/gateway/document-result-grade');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch terminal evidence coordinator');
const token = 'a'.repeat(64);

function state(status = 'released') {
  return {
    schema: 'datasecure-batch/1',
    token,
    created_at: '2026-08-26T10:00:00.000Z',
    profile: 'general',
    remove_images: false,
    items: [{ status }]
  };
}

function stateV2() {
  const documentResult = releasedDocumentResult({
    parserWarnings: [], visualResults: [], unreviewedVisualCount: 0, imagesRemovedByExplicitRequest: 0
  });
  return {
    ...state(),
    schema: 'datasecure-batch/2',
    items: [{ status: 'released', package_id: `ds_${'b'.repeat(32)}`, document_result: documentResult }]
  };
}

function fixture(options = {}) {
  const events = [];
  const records = new Map();
  const outbox = new Map();
  let durable = structuredClone(options.state || state());
  let writeNumber = 0;
  const coordinator = createBatchTerminalEvidence({
    randomBytes: () => Buffer.from('00112233445566778899aabbccddeeff', 'hex'),
    nowIso: () => '2026-08-26T11:00:00.000Z',
    publicProgress(value) { return { complete: value.items.every((item) => ['released', 'stopped'].includes(item.status)) }; },
    publishedPackageRecord(packageId) {
      if (options.publishedPackageRecord) return options.publishedPackageRecord(packageId);
      const item = durable.items.find((candidate) => candidate.package_id === packageId);
      return item ? { state: 'verified', document_result: item.document_result } : { state: 'missing', document_result: null };
    },
    writeState(value) {
      writeNumber++;
      events.push(`write:${value.terminal_evidence?.status || 'none'}`);
      if (options.failWriteBefore === writeNumber) throw new Error('WRITE_FAILED');
      durable = structuredClone(value);
      if (options.failWriteAfter === writeNumber) throw new Error('WRITE_UNCERTAIN');
    },
    evidenceRecord,
    createPendingEvidence(record) {
      events.push(`outbox:${record.receipt_id}`);
      const existing = outbox.get(record.receipt_id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(record)) throw new Error('OUTBOX_CONFLICT');
      outbox.set(record.receipt_id, structuredClone(record));
    },
    listPendingEvidence() { return [...outbox.values()].map((record) => structuredClone(record)); },
    removePendingEvidence(record) {
      events.push(`remove:${record.receipt_id}`);
      if (options.failRemove) throw new Error('REMOVE_FAILED');
      outbox.delete(record.receipt_id);
    },
    appendEvidenceRecord(record) {
      events.push(`append:${record.receipt_id}`);
      if (options.failAppend && records.size === 0) throw new Error('APPEND_FAILED');
      const existing = records.get(record.receipt_id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(record)) throw new Error('RECEIPT_CONFLICT');
      records.set(record.receipt_id, structuredClone(record));
      return existing === undefined;
    }
  });
  return {
    coordinator,
    events,
    records,
    outbox,
    durable: () => structuredClone(durable),
    reload() { return structuredClone(durable); }
  };
}

test('non-terminal batches create no marker, outbox or receipt', () => {
  for (const status of ['pending', 'processing', 'retryable', 'deferred_review', 'mapping_pending',
    'preflight_mapping_pending', 'delivery_pending']) {
    const value = fixture({ state: state(status) });
    const working = value.reload();
    assert.strictEqual(value.coordinator.reconcileTerminalEvidence(working), undefined);
    assert.strictEqual(working.terminal_evidence, undefined);
    assert.deepStrictEqual(value.events, []);
  }
});

test('best-effort writer preserves undefined for a non-terminal batch', () => {
  const value = fixture({ state: state('pending') });
  assert.strictEqual(typeof value.coordinator.writeTerminalEvidence, 'function');
  assert.strictEqual(value.coordinator.writeTerminalEvidence(value.reload()), undefined);
  assert.deepStrictEqual(value.events, []);
});

test('best-effort writer preserves successful and failed export results', () => {
  const successful = fixture();
  assert.strictEqual(successful.coordinator.writeTerminalEvidence(successful.reload()), true);

  const failed = fixture({ failAppend: true });
  assert.strictEqual(failed.coordinator.writeTerminalEvidence(failed.reload()), false);
  assert.strictEqual(failed.durable().items[0].status, 'released');
});

test('best-effort writer contains invalid markers and unexpected coordinator errors', () => {
  const invalid = state();
  invalid.terminal_evidence = { schema: 'bad', status: 'pending', receipt_id: 'f'.repeat(32), record: {} };
  const invalidValue = fixture({ state: invalid });
  const working = invalidValue.reload();
  assert.throws(() => invalidValue.coordinator.reconcileTerminalEvidence(structuredClone(working)), /Status des Batch-Nachweises/);
  assert.strictEqual(invalidValue.coordinator.writeTerminalEvidence(working), false);
  assert.deepStrictEqual(working, invalid);
  assert.deepStrictEqual(invalidValue.durable(), invalid);

  const unexpected = createBatchTerminalEvidence({
    publicProgress() { throw new Error('UNEXPECTED'); }
  });
  assert.strictEqual(unexpected.writeTerminalEvidence(state()), false);
});

test('best-effort writer treats exported evidence as authoritative despite cleanup failure', () => {
  const first = fixture();
  assert.strictEqual(first.coordinator.writeTerminalEvidence(first.reload()), true);
  const restarted = fixture({ state: first.durable(), failRemove: true });
  const eventOffset = restarted.events.length;
  assert.strictEqual(restarted.coordinator.writeTerminalEvidence(restarted.reload()), true);
  assert.ok(restarted.events.slice(eventOffset).every((event) => event.startsWith('remove:')));
  assert.strictEqual(restarted.events.some((event) => event.startsWith('append:')), false);
  assert.strictEqual(restarted.events.some((event) => event.startsWith('write:')), false);
});

test('an exported v2 receipt reuses its verified aggregate without reopening every package', () => {
  let packageReads = 0;
  const initial = stateV2();
  const value = fixture({
    state: initial,
    publishedPackageRecord(packageId) {
      packageReads++;
      const item = initial.items.find((candidate) => candidate.package_id === packageId);
      return item ? { state: 'verified', document_result: item.document_result } : { state: 'missing', document_result: null };
    }
  });
  assert.strictEqual(value.coordinator.writeTerminalEvidence(value.reload()), true);
  assert.strictEqual(packageReads, 1);
  assert.strictEqual(value.coordinator.writeTerminalEvidence(value.reload()), true);
  assert.strictEqual(packageReads, 1);
});

test('append failure leaves one durable pending intent and retry reuses its opaque id', () => {
  const first = fixture({ failAppend: true });
  const working = first.reload();
  assert.strictEqual(first.coordinator.reconcileTerminalEvidence(working), false);
  const pending = first.durable().terminal_evidence;
  assert.strictEqual(pending.status, 'pending');
  assert.strictEqual(pending.receipt_id, '00112233445566778899aabbccddeeff');
  assert.strictEqual(first.records.size, 0);
  assert.strictEqual(first.outbox.size, 1);

  const repaired = fixture({ state: first.durable() });
  repaired.outbox.set(pending.receipt_id, structuredClone(pending.record));
  assert.strictEqual(repaired.coordinator.reconcileTerminalEvidence(repaired.reload()), true);
  assert.strictEqual(repaired.records.size, 1);
  assert.strictEqual(repaired.durable().terminal_evidence.status, 'exported');
  assert.strictEqual(repaired.durable().terminal_evidence.receipt_id, pending.receipt_id);
  assert.strictEqual(repaired.outbox.size, 0);
});

test('crash after append but before exported commit deduplicates the same receipt on recovery', () => {
  const first = fixture({ failWriteBefore: 2 });
  assert.strictEqual(first.coordinator.reconcileTerminalEvidence(first.reload()), false);
  assert.strictEqual(first.durable().terminal_evidence.status, 'pending');
  assert.strictEqual(first.records.size, 1);
  const record = [...first.records.values()][0];

  const repaired = fixture({ state: first.durable() });
  repaired.records.set(record.receipt_id, structuredClone(record));
  repaired.outbox.set(record.receipt_id, structuredClone(record));
  assert.strictEqual(repaired.coordinator.reconcileTerminalEvidence(repaired.reload()), true);
  assert.strictEqual(repaired.records.size, 1);
  assert.strictEqual(repaired.durable().terminal_evidence.status, 'exported');
  const noOpEvents = repaired.events.length;
  assert.strictEqual(repaired.coordinator.reconcileTerminalEvidence(repaired.reload()), true);
  assert.ok(repaired.events.slice(noOpEvents).every((event) => event.startsWith('remove:')));
});

test('uncertain exported commit is authoritative after restart and never appends twice', () => {
  const first = fixture({ failWriteAfter: 2 });
  assert.strictEqual(first.coordinator.reconcileTerminalEvidence(first.reload()), false);
  assert.strictEqual(first.durable().terminal_evidence.status, 'exported');
  assert.strictEqual(first.records.size, 1);
  const restarted = fixture({ state: first.durable() });
  const record = [...first.records.values()][0];
  restarted.records.set(record.receipt_id, structuredClone(record));
  assert.strictEqual(restarted.coordinator.reconcileTerminalEvidence(restarted.reload()), true);
  assert.strictEqual(restarted.events.filter((event) => event.startsWith('append:')).length, 0);
  assert.strictEqual(restarted.records.size, 1);
});

test('outbox replay survives a removed journal and remains idempotent', () => {
  const value = fixture();
  const record = evidenceRecord(state(), '2026-08-26T11:00:00.000Z', 'f'.repeat(32));
  value.outbox.set(record.receipt_id, record);
  assert.deepStrictEqual(value.coordinator.repairPendingEvidenceOutbox(), { repaired: 1, failures: 0 });
  assert.strictEqual(value.records.size, 1);
  assert.strictEqual(value.outbox.size, 0);
  assert.deepStrictEqual(value.coordinator.repairPendingEvidenceOutbox(), { repaired: 0, failures: 0 });
  assert.strictEqual(value.records.size, 1);
});

test('invalid or content-bearing markers fail closed without changing terminal state', () => {
  const working = state();
  working.terminal_evidence = { schema: 'bad', status: 'pending', receipt_id: 'f'.repeat(32), record: {} };
  const value = fixture({ state: working });
  assert.throws(() => value.coordinator.reconcileTerminalEvidence(value.reload()), /Status des Batch-Nachweises/);
  assert.strictEqual(value.durable().items[0].status, 'released');
  assert.deepStrictEqual(value.events, []);
  assert.throws(() => validateMarker({ ...working.terminal_evidence, original_name: 'Alice Example' }));
});

test('marker and receipt expose no document, package, token, path or hash identifiers', () => {
  const value = fixture();
  assert.strictEqual(value.coordinator.reconcileTerminalEvidence(value.reload()), true);
  const encoded = JSON.stringify(value.durable().terminal_evidence);
  assert.doesNotMatch(encoded, /Alice|Example|package_id|batch_token|sha256|path|a{64}/iu);
});

test('a v2 retry re-derives the sealed record and refuses a stale package grade', () => {
  const first = fixture({ state: stateV2(), failAppend: true });
  assert.strictEqual(first.coordinator.reconcileTerminalEvidence(first.reload()), false);
  const pending = first.durable();
  const mismatched = releasedDocumentResult({
    parserWarnings: [], visualResults: [{ status: 'review_required' }], unreviewedVisualCount: 0,
    imagesRemovedByExplicitRequest: 0
  });
  const restarted = fixture({
    state: pending,
    publishedPackageRecord: () => ({ state: 'verified', document_result: mismatched })
  });
  assert.strictEqual(restarted.coordinator.reconcileTerminalEvidence(restarted.reload()), false);
  assert.strictEqual(restarted.records.size, 0);
  assert.strictEqual(restarted.durable().terminal_evidence.status, 'pending');
});

done();
