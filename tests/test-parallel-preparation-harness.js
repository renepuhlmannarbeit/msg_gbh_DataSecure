'use strict';
const { createSuite } = require('./helpers');
const { runParallelPreparationHarness } = require('../plugins/data-secure/server/parallel-preparation-harness');
const { testAsync, done, assert } = createSuite('Inactive two-worker preparation harness');
const ids = ['a', 'b', 'c'].map((value) => value.repeat(32));
const capability = (position) => String(position).repeat(64);

async function main() {
  await testAsync('out-of-order preparation stays bounded and commits centrally in source order', async () => {
    const order = []; let releaseFirst;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    const result = await runParallelPreparationHarness({ itemIds: ids,
      prepare: async ({ itemId, position }) => {
        if (position === 1) await firstGate;
        if (position === 2) releaseFirst();
        return { status: 'prepared', item_id: itemId, stage_capability: capability(position), staged_bytes: 1024 };
      }, commit: async ({ position }) => { order.push(position); }, maximumWorkers: 2, maximumStagedBytes: 4096 });
    assert.strictEqual(result.peakWorkers, 2);
    assert.deepStrictEqual(order, [1, 2, 3]);
    assert.deepStrictEqual(result.states.map((entry) => entry.status), ['committed', 'committed', 'committed']);
  });
  await testAsync('worker crash is retryable and never invents a commit', async () => {
    const committed = [];
    const result = await runParallelPreparationHarness({ itemIds: ids,
      prepare: async ({ itemId, position }) => {
        if (position === 2) throw new Error('synthetic worker crash');
        return { status: 'prepared', item_id: itemId, stage_capability: capability(position), staged_bytes: 1 };
      }, commit: async ({ position }) => { committed.push(position); } });
    assert.deepStrictEqual(committed, [1, 3]);
    assert.deepStrictEqual(result.states.map((entry) => entry.status), ['committed', 'retryable', 'committed']);
  });
  await testAsync('uncertain central commit blocks every later publication', async () => {
    const committed = [];
    const result = await runParallelPreparationHarness({ itemIds: ids,
      prepare: async ({ itemId, position }) => ({ status: 'prepared', item_id: itemId, stage_capability: capability(position), staged_bytes: 1 }),
      commit: async ({ position }) => { committed.push(position); if (position === 2) throw new Error('uncertain'); } });
    assert.deepStrictEqual(committed, [1, 2]);
    assert.deepStrictEqual(result.states.map((entry) => entry.status), ['committed', 'retryable', 'blocked']);
  });
  await testAsync('duplicates, third worker, invalid envelope and exhausted staging budget fail closed', async () => {
    await assert.rejects(() => runParallelPreparationHarness({ itemIds: [ids[0], ids[0]], prepare: async () => ({}), commit: async () => {} }),
      (error) => error.code === 'PARALLEL_HARNESS_INVALID');
    await assert.rejects(() => runParallelPreparationHarness({ itemIds: [ids[0]], prepare: async () => ({}), commit: async () => {}, maximumWorkers: 3 }),
      (error) => error.code === 'PARALLEL_HARNESS_INVALID');
    const invalid = await runParallelPreparationHarness({ itemIds: [ids[0]], prepare: async () => ({}), commit: async () => {} });
    assert.strictEqual(invalid.states[0].status, 'retryable');
    const limited = await runParallelPreparationHarness({ itemIds: ids.slice(0, 2),
      prepare: async ({ itemId, position }) => ({ status: 'prepared', item_id: itemId, stage_capability: capability(position), staged_bytes: 6 }),
      commit: async () => { throw new Error('must not commit'); }, maximumStagedBytes: 10 });
    assert.deepStrictEqual(limited.states.map((entry) => entry.status), ['retryable', 'retryable']);
  });
  done();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
