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
    'runtime.verify', 'runtime.ensure', 'audit.migrate', 'output.protect',
    'retention.cleanup', 'ui.cleanup', 'batch.recover', 'mapping.replay',
    'maintenance.start', 'legacy.migrate', 'working.cleanup', 'maintenance.stop'
  ]);
  assert.deepStrictEqual(item.calls[4].args[0], {
    trigger: 'startup', protectedIds: ['x'], outputProtectionComplete: true
  });
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
  assert.deepStrictEqual(item.calls.map((entry) => entry.name), ['startup.refuse']);
});

done();
