'use strict';

const { createBatchMappingMaintenance } = require('../plugins/data-secure/server/gateway/batch-mapping-maintenance');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch mapping maintenance');
const ids = ['1', '2', '3', '4'].map((digit) => `ds_${digit.repeat(32)}`);

function entry(index) {
  return { package_id: ids[index], original_basename: `Dokument-${index + 1}.docx`, file: `intent-${index + 1}` };
}

function fixture(options = {}) {
  const events = [];
  const entries = options.entries || [entry(0)];
  const states = options.states || new Map(entries.map((value) => [value.package_id, 'verified']));
  const maintenance = createBatchMappingMaintenance({
    readOutboxEntries() {
      events.push('read');
      if (options.readError) throw options.readError;
      return entries;
    },
    publishedPackageState(packageId) {
      events.push(`state:${packageId}`);
      if (options.stateError === packageId) throw new Error('STATE_FAILED');
      return states.get(packageId);
    },
    appendMapping(name, packageId) {
      events.push(`append:${name}:${packageId}`);
      if (options.appendError === packageId) throw new Error('APPEND_FAILED');
    },
    removeMappingOutbox(value) {
      events.push(`remove:${value.file}`);
      if (options.removeError === value.package_id) throw new Error('REMOVE_FAILED');
    }
  });
  return { maintenance, events };
}

test('verified repair writes the mapping before removing its intent', () => {
  const { maintenance, events } = fixture();
  assert.deepStrictEqual(maintenance.replayMappingOutbox(), {
    repaired: 1, pending: 0, orphaned_removed: 0, failures: 0
  });
  assert.deepStrictEqual(events, [
    'read', `state:${ids[0]}`, `append:Dokument-1.docx:${ids[0]}`, 'remove:intent-1'
  ]);
});

test('mapping and post-mapping cleanup failures remain retryable', () => {
  const appendFailed = fixture({ appendError: ids[0] });
  assert.strictEqual(appendFailed.maintenance.replayMappingOutbox().pending, 1);
  assert.ok(!appendFailed.events.includes('remove:intent-1'));

  const cleanupFailed = fixture({ removeError: ids[0] });
  assert.strictEqual(cleanupFailed.maintenance.replayMappingOutbox().pending, 1);
  assert.ok(cleanupFailed.events.indexOf(`append:Document-1.docx:${ids[0]}`) < cleanupFailed.events.indexOf('remove:intent-1'));
});

test('only a conclusively missing package removes an orphaned intent', () => {
  const missing = fixture({ states: new Map([[ids[0], 'missing']]) });
  assert.deepStrictEqual(missing.maintenance.replayMappingOutbox(), {
    repaired: 0, pending: 0, orphaned_removed: 1, failures: 0
  });
  assert.ok(!missing.events.some((value) => value.startsWith('append:')));

  const removalFailed = fixture({ states: new Map([[ids[0], 'missing']]), removeError: ids[0] });
  assert.deepStrictEqual(removalFailed.maintenance.replayMappingOutbox(), {
    repaired: 0, pending: 0, orphaned_removed: 0, failures: 1
  });
});

test('unsafe and unknown package states keep their intents pending', () => {
  const values = [entry(0), entry(1)];
  const { maintenance, events } = fixture({
    entries: values,
    states: new Map([[ids[0], 'unsafe'], [ids[1], undefined]])
  });
  assert.deepStrictEqual(maintenance.replayMappingOutbox(), {
    repaired: 0, pending: 2, orphaned_removed: 0, failures: 0
  });
  assert.ok(!events.some((value) => value.startsWith('append:') || value.startsWith('remove:')));
});

test('an outbox read failure returns only the fixed aggregate counters', () => {
  const { maintenance, events } = fixture({ readError: new Error('PRIVATE_DETAIL') });
  assert.deepStrictEqual(maintenance.replayMappingOutbox(), {
    repaired: 0, pending: 0, orphaned_removed: 0, failures: 1
  });
  assert.deepStrictEqual(events, ['read']);
});

test('mixed entries are isolated while package-state errors stay fail closed', () => {
  const values = [entry(0), entry(1), entry(2), entry(3)];
  const mixed = fixture({
    entries: values,
    states: new Map([[ids[0], 'verified'], [ids[1], 'verified'], [ids[2], 'missing'], [ids[3], 'unsafe']]),
    appendError: ids[1]
  });
  assert.deepStrictEqual(mixed.maintenance.replayMappingOutbox(), {
    repaired: 1, pending: 2, orphaned_removed: 1, failures: 0
  });

  const stateFailed = fixture({ stateError: ids[0] });
  assert.throws(() => stateFailed.maintenance.replayMappingOutbox(), /STATE_FAILED/);
  assert.ok(!stateFailed.events.some((value) => value.startsWith('append:') || value.startsWith('remove:')));
});

test('the batch composition root preserves both replay facades', () => {
  const batch = require('../plugins/data-secure/server/gateway/batch');
  assert.strictEqual(typeof batch.replayMappingOutbox, 'function');
  assert.strictEqual(batch._test.replayMappingOutbox, batch.replayMappingOutbox);
});

done();
