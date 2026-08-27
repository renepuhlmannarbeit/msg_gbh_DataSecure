'use strict';
const { createSuite } = require('./helpers');
const { runParallelPreparationHarness } = require('../plugins/data-secure/server/parallel-preparation-harness');
const { adaptivePreparationPolicy, GIB, MIB } = require('../plugins/data-secure/server/gateway/adaptive-resource-policy');
const { testAsync, done, assert } = createSuite('Inactive two-worker preparation harness');
const ids = ['a', 'b', 'c'].map((value) => value.repeat(32));
const capability = (position) => Number(position).toString(16).padStart(64, '0');

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
  await testAsync('adaptive policy is serial by default, permits two workers only with evidence and keeps OCR single-flight', async () => {
    const host = { totalmem: () => 16 * GIB, freemem: () => 8 * GIB, cpus: () => [{}, {}, {}, {}, {}, {}, {}, {}] };
    const closed = adaptivePreparationPolicy({ os: host });
    assert.strictEqual(closed.maximum_workers, 1);
    assert.strictEqual(closed.maximum_staged_bytes, 2 * GIB);
    const enabled = adaptivePreparationPolicy({ os: host, productActivationProven: true });
    assert.strictEqual(enabled.maximum_workers, 2);
    assert.strictEqual(enabled.product_parallelism_enabled, true);
    const ocr = adaptivePreparationPolicy({ os: host, productActivationProven: true, ocrActive: true });
    assert.strictEqual(ocr.maximum_workers, 1);
    assert.strictEqual(ocr.ocr_single_flight, true);
    const constrained = adaptivePreparationPolicy({
      os: { totalmem: () => 2 * GIB, freemem: () => 200 * MIB, cpus: () => [{}, {}, {}, {}] },
      productActivationProven: true
    });
    assert.strictEqual(constrained.maximum_workers, 1);
    assert.ok(constrained.maximum_staged_bytes >= 64 * MIB);
  });
  await testAsync('sliding window never prepares the whole series and cancellation cleans prepared stages', async () => {
    const manyIds = Array.from({ length: 20 }, (_, index) => (index + 10).toString(16).padStart(32, '0'));
    let prepares = 0;
    let commits = 0;
    const result = await runParallelPreparationHarness({
      itemIds: manyIds,
      maximumWorkers: 2,
      maximumStagedBytes: 2,
      prepare: async ({ itemId, position }) => {
        prepares++;
        return { status: 'prepared', item_id: itemId, stage_capability: capability(position), staged_bytes: 1 };
      },
      commit: async () => { commits++; }
    });
    assert.strictEqual(prepares, 20);
    assert.strictEqual(commits, 20);
    assert.strictEqual(result.peakWorkers, 2);
    assert.ok(result.peakStagedBytes <= 2);

    const controller = new AbortController();
    let discarded = 0;
    const cancelled = await runParallelPreparationHarness({
      itemIds: manyIds.slice(0, 4), signal: controller.signal,
      prepare: async ({ itemId, position }) => {
        if (position === 1) controller.abort();
        return { status: 'prepared', item_id: itemId, stage_capability: capability(position), staged_bytes: 1 };
      },
      commit: async () => { throw new Error('cancelled preparation must not commit'); },
      discard: async () => { discarded++; }
    });
    assert.ok(cancelled.states.every((entry) => entry.status === 'retryable'));
    assert.ok(discarded >= 1);
  });
  done();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
