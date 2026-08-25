'use strict';

const { createBatchDelivery } = require('../plugins/data-secure/server/gateway/batch-delivery');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Batch delivery boundary');
const token = 'a'.repeat(64);
const ids = ['1', '2', '3'].map((character) => `ds_${character.repeat(32)}`);

function item(index, status = 'delivery_pending', options = {}) {
  return {
    package_id: ids[index],
    status,
    checkpoint: status,
    work_name: `${String(index + 1).padStart(3, '0')}_${String(index + 1).repeat(24)}.txt`,
    analysis_acknowledged: options.acknowledged === true,
    work_copy_cleanup_pending: options.cleanupPending === true
  };
}

function fixture(options = {}) {
  const events = [];
  const active = options.active || new Set();
  const packages = new Set(options.packages || ids);
  const files = new Map(options.files || []);
  let durable = structuredClone(options.state || {
    token,
    items: [item(0)],
    complete: true
  });
  let failWrite = options.failWrite === true;
  const delivery = createBatchDelivery({
    active,
    path: { join: (left, right) => `${left}/${right}` },
    workPath: (batchToken) => `work:${batchToken}`,
    io: {
      existsSync(target) { events.push(`exists:${target}`); return files.has(target); },
      lstatSync(target) {
        events.push(`lstat:${target}`);
        const type = files.get(target);
        return {
          isFile: () => type === 'file',
          isSymbolicLink: () => type === 'symlink'
        };
      },
      unlinkSync(target) {
        events.push(`unlink:${target}`);
        if (options.unlinkFailure === target) throw new Error('UNLINK_FAILED');
        files.delete(target);
      }
    },
    acquireActiveLock(batchToken) {
      events.push(`acquire:${batchToken}`);
      if (options.acquireError) throw options.acquireError;
    },
    releaseActiveLock(batchToken) { events.push(`release:${batchToken}`); },
    readState(batchToken) {
      events.push(`read:${batchToken}`);
      if (options.readError) throw options.readError;
      return structuredClone(durable);
    },
    writeState(state) {
      events.push('write');
      if (failWrite) throw new Error('WRITE_FAILED');
      durable = structuredClone(state);
    },
    assertLocalExecutorAccess(_state, pid) {
      events.push(`access:${pid ?? 'default'}`);
      if (options.accessError) throw options.accessError;
    },
    regularPublishedPackage(packageId) {
      events.push(`verify:${packageId}`);
      return packages.has(packageId);
    },
    issueReadCapability(packageId) {
      events.push(`issue:${packageId}`);
      return { read_capability: 'c'.repeat(43), read_capability_expires_at: '2026-08-26T12:00:00.000Z' };
    },
    publicProgress: (state) => ({ complete: state.items.every((entry) => entry.status === 'released') }),
    writeTerminalEvidence() { events.push('evidence'); return true; },
    deliveryPendingStatus: 'delivery_pending',
    mappingPendingStatus: 'mapping_pending'
  });
  return {
    delivery,
    events,
    files,
    durable: () => structuredClone(durable),
    allowWrite() { failWrite = false; }
  };
}

function workName(entry) {
  return `work:${token}/${entry.work_name}`;
}

test('a capability is issued only after the exact published package verifies', () => {
  const value = item(0);
  const denied = fixture({ packages: [] });
  assert.throws(() => denied.delivery.deliveryResult({ items: [value] }, value), /sicher verifiziert/);
  assert.ok(!denied.events.some((event) => event.startsWith('issue:')));

  const allowed = fixture();
  const result = allowed.delivery.deliveryResult({ items: [value] }, value);
  assert.strictEqual(result.package_id, ids[0]);
  assert.strictEqual(result.read_capability, 'c'.repeat(43));
  assert.deepStrictEqual(allowed.events.slice(-2), [`verify:${ids[0]}`, `issue:${ids[0]}`]);
});

test('multi-ack validates the complete page before any state or byte mutation', () => {
  const first = item(0);
  const second = item(1);
  const firstPath = workName(first);
  const secondPath = workName(second);
  const denied = fixture({
    state: { token, items: [first, second] },
    packages: [ids[0]],
    files: [[firstPath, 'file'], [secondPath, 'file']]
  });
  assert.throws(() => denied.delivery.acknowledgeDeliveredPackages(token, ids.slice(0, 2)), /mindestens ein Paket/);
  assert.deepStrictEqual(denied.durable().items.map((entry) => entry.status), ['delivery_pending', 'delivery_pending']);
  assert.ok(!denied.events.includes('write'));
  assert.ok(!denied.events.some((event) => event.startsWith('unlink:')));
  assert.strictEqual(denied.events.filter((event) => event.startsWith('release:')).length, 1);

  const allowed = fixture({
    state: { token, items: [first, second] },
    files: [[firstPath, 'file'], [secondPath, 'file']]
  });
  const result = allowed.delivery.acknowledgeDeliveredPackages(token, ids.slice(0, 2));
  assert.strictEqual(result.acknowledged_count, 2);
  assert.deepStrictEqual(allowed.durable().items.map((entry) => entry.status), ['released', 'released']);
  assert.strictEqual(allowed.events.filter((event) => event === 'write').length, 1);
  assert.strictEqual(allowed.events.filter((event) => event === 'evidence').length, 1);
  assert.strictEqual(allowed.events.filter((event) => event.startsWith('unlink:')).length, 2);
});

test('repeated single and page acknowledgements are durable no-ops', () => {
  const released = item(0, 'released', { acknowledged: true });
  const value = fixture({ state: { token, items: [released] } });
  value.delivery.acknowledgeDeliveredPackage(token, ids[0]);
  value.delivery.acknowledgeDeliveredPackages(token, [ids[0]]);
  assert.strictEqual(value.events.filter((event) => event === 'write').length, 0);
  assert.strictEqual(value.events.filter((event) => event === 'evidence').length, 0);
  assert.strictEqual(value.events.filter((event) => event.startsWith('unlink:')).length, 0);
  assert.strictEqual(value.events.filter((event) => event.startsWith('release:')).length, 2);
});

test('a journal failure after byte cleanup remains retryable and releases the lock', () => {
  const pending = item(0);
  const target = workName(pending);
  const value = fixture({
    state: { token, items: [pending] },
    files: [[target, 'file']],
    failWrite: true
  });
  assert.throws(() => value.delivery.acknowledgeDeliveredPackage(token, ids[0]), /WRITE_FAILED/);
  assert.strictEqual(value.files.has(target), false);
  assert.strictEqual(value.durable().items[0].status, 'delivery_pending');
  assert.strictEqual(value.events.filter((event) => event === 'evidence').length, 0);
  assert.strictEqual(value.events.filter((event) => event.startsWith('release:')).length, 1);

  value.allowWrite();
  const retried = value.delivery.acknowledgeDeliveredPackage(token, ids[0]);
  assert.strictEqual(retried.ok, true);
  assert.strictEqual(value.durable().items[0].status, 'released');
  assert.strictEqual(value.events.filter((event) => event.startsWith('unlink:')).length, 1);
  assert.strictEqual(value.events.filter((event) => event === 'evidence').length, 1);
});

test('lock, read and executor-access failures cannot mutate state', () => {
  const blocked = fixture({ acquireError: new Error('BUSY') });
  assert.throws(() => blocked.delivery.acknowledgeDeliveredPackage(token, ids[0]), /BUSY/);
  assert.strictEqual(blocked.events.filter((event) => event.startsWith('release:')).length, 0);

  for (const options of [{ readError: new Error('READ_FAILED') }, { accessError: new Error('ACCESS_FAILED') }]) {
    const value = fixture(options);
    assert.throws(() => value.delivery.acknowledgeDeliveredPackage(token, ids[0]));
    assert.strictEqual(value.events.filter((event) => event === 'write').length, 0);
    assert.strictEqual(value.events.filter((event) => event.startsWith('unlink:')).length, 0);
    assert.strictEqual(value.events.filter((event) => event.startsWith('release:')).length, 1);
  }
});

test('terminal cleanup rejects names, links and directories and retries only a regular bound file', () => {
  const invalid = item(0, 'released', { cleanupPending: true });
  invalid.work_name = '../outside.txt';
  const value = fixture({ state: { token, items: [invalid] } });
  assert.deepStrictEqual(value.delivery.retryReleasedWorkCopyCleanup(value.durable()), { changed: false, pending: 1 });

  for (const type of ['symlink', 'directory']) {
    const candidate = item(0, 'released', { cleanupPending: true });
    const target = workName(candidate);
    const guarded = fixture({ state: { token, items: [candidate] }, files: [[target, type]] });
    const state = guarded.durable();
    assert.deepStrictEqual(guarded.delivery.retryReleasedWorkCopyCleanup(state), { changed: false, pending: 1 });
    assert.strictEqual(guarded.files.has(target), true);
  }

  const regular = item(0, 'released', { cleanupPending: true });
  const target = workName(regular);
  const retried = fixture({ state: { token, items: [regular] }, files: [[target, 'file']] });
  const state = retried.durable();
  assert.deepStrictEqual(retried.delivery.retryReleasedWorkCopyCleanup(state), { changed: true, pending: 0 });
  assert.strictEqual(retried.files.has(target), false);
  assert.strictEqual(Object.hasOwn(state.items[0], 'work_copy_cleanup_pending'), false);
});

test('local finalization verifies before mutation and writes one terminal state', () => {
  const pending = item(0);
  const denied = fixture({ state: { token, items: [pending] }, packages: [] });
  assert.throws(() => denied.delivery.finalizePublishedPackageLocally(token, ids[0]), /sicher abgeschlossen/);
  assert.strictEqual(denied.durable().items[0].status, 'delivery_pending');
  assert.ok(!denied.events.includes('write'));
  assert.strictEqual(denied.events.filter((event) => event.startsWith('release:')).length, 1);

  const target = workName(pending);
  const allowed = fixture({ state: { token, items: [pending] }, files: [[target, 'file']] });
  const result = allowed.delivery.finalizePublishedPackageLocally(token, ids[0]);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(allowed.durable().items[0].checkpoint, 'released_locally');
  assert.strictEqual(allowed.durable().items[0].analysis_acknowledged, false);
  assert.strictEqual(allowed.events.filter((event) => event === 'write').length, 1);
  assert.strictEqual(allowed.events.filter((event) => event === 'evidence').length, 1);
});

test('the batch composition root preserves every delivery facade', () => {
  const batch = require('../plugins/data-secure/server/gateway/batch');
  for (const name of ['acknowledgeDeliveredPackage', 'acknowledgeDeliveredPackages', 'finalizePublishedPackageLocally']) {
    assert.strictEqual(typeof batch[name], 'function', name);
  }
  assert.strictEqual(typeof batch._test.retryReleasedWorkCopyCleanup, 'function');
});

done();
