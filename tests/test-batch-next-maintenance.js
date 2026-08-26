'use strict';

const { createSuite } = require('./helpers');
const { createBatchNextMaintenance } = require('../plugins/data-secure/server/gateway/batch-next-maintenance');

const { test, done, assert } = createSuite('Batch pre-processing maintenance boundary');

function harness(overrides = {}) {
  const calls = [];
  const state = { private_name: 'Max Mustermann', private_path: 'C:\\private\\source.txt' };
  const deps = { private_option: 'must-not-escape' };
  const implementations = {
    reconcilePublishedItems(value) { calls.push(['published', value]); return false; },
    reconcilePendingMappings(value) { calls.push(['mapping', value]); return false; },
    markInterruptedItemsRetryable(value) { calls.push(['interrupted', value]); return 0; },
    retryReleasedWorkCopyCleanup(value, passedDeps) {
      calls.push(['cleanup', value, passedDeps]);
      return { changed: false };
    },
    writeState(value) { calls.push(['write', value]); }
  };
  Object.assign(implementations, overrides);
  return {
    calls,
    state,
    deps,
    maintainBeforeNext: createBatchNextMaintenance(implementations).maintainBeforeNext
  };
}

test('no changes preserve exact order without a journal write or public result', () => {
  const h = harness();
  const result = h.maintainBeforeNext(h.state, h.deps);
  assert.strictEqual(result, undefined);
  assert.deepStrictEqual(h.calls.map(([name]) => name), [
    'published', 'mapping', 'interrupted', 'cleanup'
  ]);
  assert.strictEqual(h.calls[3][1], h.state);
  assert.strictEqual(h.calls[3][2], h.deps);
});

test('publication adoption short-circuits mapping and commits before later stages', () => {
  const calls = [];
  const h = harness({
    reconcilePublishedItems(state) { calls.push(['published', state]); return true; },
    reconcilePendingMappings() { calls.push(['mapping']); return true; },
    writeState(state) { calls.push(['write', state]); },
    markInterruptedItemsRetryable(state) { calls.push(['interrupted', state]); return 2; },
    retryReleasedWorkCopyCleanup(state, deps) { calls.push(['cleanup', state, deps]); return { changed: true }; }
  });
  h.maintainBeforeNext(h.state, h.deps);
  assert.deepStrictEqual(calls.map(([name]) => name), [
    'published', 'write', 'interrupted', 'write', 'cleanup', 'write'
  ]);
  assert.strictEqual(calls.some(([name]) => name === 'mapping'), false);
  assert.strictEqual(calls.filter(([name]) => name === 'write').length, 3);
});

test('a later invocation repairs mapping only after durable publication adoption', () => {
  let publicationCalls = 0;
  let mappingCalls = 0;
  let writes = 0;
  const h = harness({
    reconcilePublishedItems() {
      publicationCalls++;
      return publicationCalls === 1;
    },
    reconcilePendingMappings() {
      mappingCalls++;
      return true;
    },
    writeState() { writes++; }
  });
  h.maintainBeforeNext(h.state, h.deps);
  assert.strictEqual(publicationCalls, 1);
  assert.strictEqual(mappingCalls, 0);
  assert.strictEqual(writes, 1);
  h.maintainBeforeNext(h.state, h.deps);
  assert.strictEqual(publicationCalls, 2);
  assert.strictEqual(mappingCalls, 1);
  assert.strictEqual(writes, 2);
});

test('mapping repair commits before interrupted recovery and cleanup', () => {
  const calls = [];
  const h = harness({
    reconcilePublishedItems(state) { calls.push(['published', state]); return false; },
    reconcilePendingMappings(state) { calls.push(['mapping', state]); return true; },
    writeState(state) { calls.push(['write', state]); },
    markInterruptedItemsRetryable(state) { calls.push(['interrupted', state]); return 0; },
    retryReleasedWorkCopyCleanup(state, deps) { calls.push(['cleanup', state, deps]); return { changed: false }; }
  });
  h.maintainBeforeNext(h.state, h.deps);
  assert.deepStrictEqual(calls.map(([name]) => name), [
    'published', 'mapping', 'write', 'interrupted', 'cleanup'
  ]);
});

test('interrupted and cleanup mutations each receive their own durable boundary', () => {
  const calls = [];
  const h = harness({
    reconcilePublishedItems() { calls.push(['published']); return false; },
    reconcilePendingMappings() { calls.push(['mapping']); return false; },
    markInterruptedItemsRetryable() { calls.push(['interrupted']); return 1; },
    retryReleasedWorkCopyCleanup() { calls.push(['cleanup']); return { changed: true }; },
    writeState(state) { calls.push(['write', state]); }
  });
  h.maintainBeforeNext(h.state, h.deps);
  assert.deepStrictEqual(calls.map(([name]) => name), [
    'published', 'mapping', 'interrupted', 'write', 'cleanup', 'write'
  ]);
  assert.strictEqual(calls[3][1], h.state);
  assert.strictEqual(calls[5][1], h.state);
});

test('a phase error stops every subsequent maintenance action unchanged', () => {
  const phases = ['published', 'mapping', 'interrupted', 'cleanup'];
  for (const failedPhase of phases) {
    const calls = [];
    const failure = new Error(`private failure in ${failedPhase}`);
    const h = harness({
      reconcilePublishedItems() {
        calls.push('published');
        if (failedPhase === 'published') throw failure;
        return false;
      },
      reconcilePendingMappings() {
        calls.push('mapping');
        if (failedPhase === 'mapping') throw failure;
        return false;
      },
      markInterruptedItemsRetryable() {
        calls.push('interrupted');
        if (failedPhase === 'interrupted') throw failure;
        return 0;
      },
      retryReleasedWorkCopyCleanup() {
        calls.push('cleanup');
        if (failedPhase === 'cleanup') throw failure;
        return { changed: false };
      },
      writeState() { calls.push('write'); }
    });
    assert.throws(() => h.maintainBeforeNext(h.state, h.deps), (error) => error === failure);
    assert.deepStrictEqual(calls, phases.slice(0, phases.indexOf(failedPhase) + 1));
  }
});

test('a journal failure after each changed phase prevents every later phase', () => {
  const changedPhaseSetups = [
    {
      phase: 'published',
      overrides: { reconcilePublishedItems() { return true; } },
      forbidden: ['mapping', 'interrupted', 'cleanup']
    },
    {
      phase: 'mapping',
      overrides: { reconcilePendingMappings() { return true; } },
      forbidden: ['interrupted', 'cleanup']
    },
    {
      phase: 'interrupted',
      overrides: { markInterruptedItemsRetryable() { return 1; } },
      forbidden: ['cleanup']
    },
    {
      phase: 'cleanup',
      overrides: { retryReleasedWorkCopyCleanup() { return { changed: true }; } },
      forbidden: []
    }
  ];
  for (const scenario of changedPhaseSetups) {
    const calls = [];
    const failure = new Error(`journal failure after ${scenario.phase}`);
    const wrap = {
      reconcilePublishedItems() { calls.push('published'); return false; },
      reconcilePendingMappings() { calls.push('mapping'); return false; },
      markInterruptedItemsRetryable() { calls.push('interrupted'); return 0; },
      retryReleasedWorkCopyCleanup() { calls.push('cleanup'); return { changed: false }; },
      writeState() { calls.push('write'); throw failure; }
    };
    for (const [name, implementation] of Object.entries(scenario.overrides)) {
      wrap[name] = (...args) => {
        calls.push(scenario.phase);
        return implementation(...args);
      };
    }
    const h = harness(wrap);
    assert.throws(() => h.maintainBeforeNext(h.state, h.deps), (error) => error === failure);
    for (const forbidden of scenario.forbidden) {
      assert.strictEqual(calls.includes(forbidden), false, `${scenario.phase} called ${forbidden}`);
    }
  }
});

test('the batch composition root exposes the same extracted maintenance facade', () => {
  const batch = require('../plugins/data-secure/server/gateway/batch');
  assert.strictEqual(typeof batch._test.maintainBeforeNext, 'function');
});

done();
