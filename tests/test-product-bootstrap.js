'use strict';

const { createSuite } = require('./helpers');
const { initializeProduct } = require('../plugins/data-secure/server/core/product-bootstrap');

const { test, done, assert } = createSuite('Product-neutral startup transaction');

function fixture(overrides = {}) {
  const calls = [];
  const call = (name, result) => (...args) => { calls.push({ name, args }); return result; };
  const maintenance = { stop: call('maintenance.stop', true) };
  return {
    calls,
    deps: {
      assertRootSeparation: call('storage.preflight', true),
      verifyBundledRuntime: call('runtime.verify', {}),
      ensureDurableRuntime: call('runtime.ensure', {}),
      migrateLegacyAuditReceipts: call('audit.migrate', {}),
      openBatchPackageProtection: call('output.protect', { ids: ['x'], complete: true }),
      cleanupLocalData: call('retention.cleanup', {}),
      cleanupUiJobs: call('ui.cleanup', {}),
      recoverBatches: call('batch.recover', { failures: 0 }),
      replayMappingOutbox: call('mapping.replay', { failures: 0 }),
      startBatchMaintenance: call('maintenance.start', maintenance),
      cleanupExpiredBatchSnapshots: () => {},
      migrateLegacyInput: call('legacy.migrate', { failures: 0, active: false }),
      cleanupAbandonedWorkingJobs: call('working.cleanup', { failures: 0 }),
      refuseStartup: call('startup.refuse', {}),
      ...overrides
    }
  };
}

test('plugin and Standalone can share one ordered fail-closed startup transaction', () => {
  const item = fixture();
  const result = initializeProduct(item.deps);
  assert.strictEqual(result.batchMaintenance.stop(), true);
  assert.deepStrictEqual(item.calls.map((entry) => entry.name), [
    'storage.preflight', 'runtime.verify', 'runtime.ensure', 'audit.migrate', 'output.protect',
    'retention.cleanup', 'ui.cleanup', 'batch.recover', 'mapping.replay',
    'maintenance.start', 'legacy.migrate', 'working.cleanup', 'maintenance.stop'
  ]);
  assert.deepStrictEqual(item.calls[5].args[0], {
    trigger: 'startup', protectedIds: ['x'], outputProtectionComplete: true
  });
});

test('only an explicit Standalone opt-in defers protection acquisition inside startup retention', () => {
  const item = fixture({ standaloneLazyRetentionProtection: true });
  initializeProduct(item.deps);
  assert.deepStrictEqual(item.calls.map(entry => entry.name), [
    'storage.preflight', 'runtime.verify', 'runtime.ensure', 'audit.migrate',
    'retention.cleanup', 'ui.cleanup', 'batch.recover', 'mapping.replay',
    'maintenance.start', 'legacy.migrate', 'working.cleanup'
  ]);
  const cleanup = item.calls[4].args[0];
  assert.strictEqual(cleanup.trigger, 'startup');
  assert.strictEqual(cleanup.outputProtectionComplete, false, 'unrequested protection is unknown, not complete');
  assert.strictEqual(Object.hasOwn(cleanup, 'protectedIds'), false);
  assert.strictEqual(typeof cleanup.getBatchPackageProtection, 'function');
  for (const value of [undefined, false, 'true', 1]) {
    const eager = fixture({ standaloneLazyRetentionProtection: value });
    initializeProduct(eager.deps);
    assert.strictEqual(eager.calls[4].name, 'output.protect');
    assert.deepStrictEqual(eager.calls[5].args[0], {
      trigger: 'startup', protectedIds: ['x'], outputProtectionComplete: true
    });
  }
});

test('needed lazy protection still runs before UI cleanup, recovery and maintenance', () => {
  const item = fixture({ standaloneLazyRetentionProtection: true });
  item.deps.cleanupLocalData = options => {
    item.calls.push({ name: 'retention.enter' });
    assert.deepStrictEqual(options.getBatchPackageProtection(), { ids: ['x'], complete: true });
    item.calls.push({ name: 'retention.exit' });
  };
  initializeProduct(item.deps);
  assert.deepStrictEqual(item.calls.map(entry => entry.name), [
    'storage.preflight', 'runtime.verify', 'runtime.ensure', 'audit.migrate',
    'retention.enter', 'output.protect', 'retention.exit', 'ui.cleanup',
    'batch.recover', 'mapping.replay', 'maintenance.start', 'legacy.migrate', 'working.cleanup'
  ]);
});

test('a post-maintenance recovery failure stops maintenance and refuses startup once', () => {
  const item = fixture({ recoverBatches: () => {
    item.calls.push({ name: 'batch.recover', args: [] });
    return { failures: 1 };
  }});
  assert.throws(() => initializeProduct(item.deps), /Batch recovery failed closed/u);
  assert.deepStrictEqual(item.calls.slice(-2).map((entry) => entry.name), [
    'maintenance.stop', 'startup.refuse'
  ]);
});

test('a failure before maintenance still produces one fixed startup refusal', () => {
  const item = fixture({ verifyBundledRuntime: () => { throw new Error('private runtime details'); } });
  assert.throws(() => initializeProduct(item.deps), /private runtime details/u);
  assert.deepStrictEqual(item.calls.map((entry) => entry.name), ['storage.preflight', 'startup.refuse']);
});

test('storage preflight failure refuses startup before any cache, migration or cleanup', () => {
  const item = fixture({ assertRootSeparation() { throw Object.assign(new Error('PRIVACY_STORAGE_UNSAFE'), { code: 'PRIVACY_STORAGE_UNSAFE' }); } });
  assert.throws(() => initializeProduct(item.deps), /PRIVACY_STORAGE_UNSAFE/u);
  assert.deepStrictEqual(item.calls.map(entry => entry.name), ['startup.refuse']);
});

done();
