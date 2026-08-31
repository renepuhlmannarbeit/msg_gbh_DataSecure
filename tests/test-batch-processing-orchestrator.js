'use strict';

const { createSuite } = require('./helpers');
const { createBatchProcessingOrchestrator } = require('../plugins/data-secure/server/gateway/batch-processing-orchestrator');

const { testAsync, done, assert } = createSuite('Batch processing orchestrator boundary');

class TestSafeError extends Error {}

function harness(overrides = {}) {
  const token = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const active = new Set();
  const pending = { status: 'pending' };
  const state = { invalidated: false, items: [pending], private_name: 'Max Mustermann' };
  const entry = { private_path: 'C:\\private\\source.txt' };
  const deps = { executorPid: 1234, private_option: 'never-public' };
  const calls = [];
  const response = { ok: true, result: 'identical' };
  const impl = {
    SafeError: TestSafeError,
    active,
    acquireActiveLock(value) { calls.push(['acquire', value]); },
    releaseActiveLock(value) { calls.push(['release', value, active.has(value)]); return true; },
    readState(value) { calls.push(['read', value]); return state; },
    assertLocalExecutorAccess(value, pid) { calls.push(['lease', value, pid]); },
    maintainBeforeNext(value, passedDeps) { calls.push(['maintain', value, passedDeps]); },
    deliveryResult(value, item) { calls.push(['delivery', value, item]); return response; },
    publicProgress(value) { calls.push(['progress', value]); return { remaining: 0 }; },
    exactPendingEntry(value, item) { calls.push(['entry', value, item]); return entry; },
    invalidateUnpublishedBatchCopies(value, passedDeps) {
      calls.push(['invalidate', value, passedDeps]);
      passedDeps.writeState(value);
    },
    writeState(value) { calls.push(['write', value]); },
    async processSingleBatchItem(value, item, selectedEntry, passedDeps) {
      calls.push(['process', value, item, selectedEntry, passedDeps]);
      return response;
    },
    deliveryPendingStatus: 'delivery_pending'
  };
  Object.assign(impl, overrides);
  return {
    token, active, pending, state, entry, deps, calls, response,
    processBatchNext: createBatchProcessingOrchestrator(impl).processBatchNext
  };
}

async function main() {
await testAsync('legacy encryption stop never invalidates, rewrites or processes private copies', async () => {
  for (const code of ['PRIVATE_ARTIFACT_LEGACY_ENCRYPTED_UNSUPPORTED', 'LEGACY_ENCRYPTED_ARTIFACT_UNAVAILABLE']) {
    const h = harness({ exactPendingEntry() { const error = new TestSafeError('old envelope'); error.code = code; throw error; } });
    const before = JSON.stringify(h.state);
    const result = await h.processBatchNext(h.token, h.deps);
    assert.strictEqual(result.error, 'LEGACY_ENCRYPTED_ARTIFACT_UNAVAILABLE');
    assert.strictEqual(result.raw_content_sent_to_claude, false);
    assert.strictEqual(JSON.stringify(h.state), before);
    assert.ok(!h.calls.some(([name]) => ['invalidate', 'write', 'process'].includes(name)));
    assert.strictEqual(h.calls.filter(([name]) => name === 'release').length, 1);
  }
});

await testAsync('an active token is rejected before every dependency and lock action', async () => {
  const h = harness();
  h.active.add(h.token);
  await assert.rejects(() => h.processBatchNext(h.token, h.deps), /bereits eine Verarbeitung/u);
  assert.deepStrictEqual(h.calls, []);
});

await testAsync('an acquire failure never adds ownership or releases a foreign lock', async () => {
  const failure = new Error('acquire failed');
  const h = harness({ acquireActiveLock() { throw failure; } });
  await assert.rejects(() => h.processBatchNext(h.token, h.deps), (error) => error === failure);
  assert.strictEqual(h.active.has(h.token), false);
  assert.deepStrictEqual(h.calls, []);
});

await testAsync('read, lease, invalidation and maintenance failures release exactly once', async () => {
  for (const phase of ['read', 'lease', 'invalidated', 'maintain']) {
    const failure = new Error(`failure at ${phase}`);
    const h = harness();
    if (phase === 'read') h.processBatchNext = createBatchProcessingOrchestrator({
      SafeError: TestSafeError,
      active: h.active,
      acquireActiveLock(value) { h.calls.push(['acquire', value]); },
      releaseActiveLock(value) { h.calls.push(['release', value, h.active.has(value)]); },
      readState() { h.calls.push(['read']); throw failure; }
    }).processBatchNext;
    if (phase === 'lease') {
      const original = harness({ assertLocalExecutorAccess() { throw failure; } });
      Object.assign(h, original);
    }
    if (phase === 'invalidated') h.state.invalidated = true;
    if (phase === 'maintain') {
      const original = harness({ maintainBeforeNext() { throw failure; } });
      Object.assign(h, original);
    }
    const predicate = phase === 'invalidated'
      ? (error) => error instanceof TestSafeError
      : (error) => error === failure;
    await assert.rejects(() => h.processBatchNext(h.token, h.deps), predicate);
    assert.strictEqual(h.active.has(h.token), false, phase);
    assert.strictEqual(h.calls.filter(([name]) => name === 'release').length, 1, phase);
    const release = h.calls.find(([name]) => name === 'release');
    assert.strictEqual(release[2], false, phase);
    assert.strictEqual(h.calls.some(([name]) => ['delivery', 'entry', 'process'].includes(name)), false, phase);
  }
});

await testAsync('maintenance runs once before first-delivery routing and preserves response identity', async () => {
  const firstDelivery = { status: 'delivery_pending' };
  const laterDelivery = { status: 'delivery_pending' };
  const h = harness();
  h.state.items = [h.pending, firstDelivery, laterDelivery];
  const result = await h.processBatchNext(h.token, h.deps);
  assert.strictEqual(result, h.response);
  assert.deepStrictEqual(h.calls.map(([name]) => name), [
    'acquire', 'read', 'lease', 'maintain', 'delivery', 'release'
  ]);
  assert.strictEqual(h.calls[3][1], h.state);
  assert.strictEqual(h.calls[3][2], h.deps);
  assert.strictEqual(h.calls[4][2], firstDelivery);
});

await testAsync('no routable item returns only fresh content-free progress', async () => {
  const h = harness();
  h.state.items = [{ status: 'stopped' }];
  const result = await h.processBatchNext(h.token, h.deps);
  assert.deepStrictEqual(result, {
    ok: true, remaining: 0, raw_content_sent_to_claude: false
  });
  assert.deepStrictEqual(h.calls.map(([name]) => name), [
    'acquire', 'read', 'lease', 'maintain', 'progress', 'release'
  ]);
  assert.doesNotMatch(JSON.stringify(result), /Max Mustermann|private/u);
});

await testAsync('an all-stopped batch exports terminal evidence after mapping maintenance', async () => {
  const h = harness({
    publicProgress(value) {
      h.calls.push(['progress', value]);
      return { remaining: 0, stopped: 2, complete: true };
    },
    writeTerminalEvidence(value) {
      h.calls.push(['evidence', value]);
      return true;
    }
  });
  h.state.items = [{ status: 'stopped' }, { status: 'stopped' }];
  const result = await h.processBatchNext(h.token, h.deps);
  assert.deepStrictEqual(result, {
    ok: true, remaining: 0, stopped: 2, complete: true,
    local_evidence_exported: true, raw_content_sent_to_claude: false
  });
  assert.deepStrictEqual(h.calls.map(([name]) => name), [
    'acquire', 'read', 'lease', 'maintain', 'progress', 'evidence', 'release'
  ]);
});

await testAsync('pending routing preserves state, item, entry, deps and response identity', async () => {
  const h = harness();
  const result = await h.processBatchNext(h.token, h.deps);
  assert.strictEqual(result, h.response);
  const process = h.calls.find(([name]) => name === 'process');
  assert.strictEqual(process[1], h.state);
  assert.strictEqual(process[2], h.pending);
  assert.strictEqual(process[3], h.entry);
  assert.strictEqual(process[4], h.deps);
  assert.deepStrictEqual(h.calls.map(([name]) => name), [
    'acquire', 'read', 'lease', 'maintain', 'entry', 'process', 'release'
  ]);
});

await testAsync('snapshot errors invalidate and write once without processing or generic leakage', async () => {
  for (const safe of [true, false]) {
    const privateSentinel = 'Erika Musterfrau C:\\private\\source.txt';
    const failure = safe ? new TestSafeError('Sicherer fester Snapshotfehler.') : new Error(privateSentinel);
    const h = harness({ exactPendingEntry() { throw failure; } });
    const result = await h.processBatchNext(h.token, h.deps);
    assert.strictEqual(result.error, 'batch_snapshot_changed');
    assert.strictEqual(
      result.message,
      safe ? failure.message : 'Der bestätigte Dateistapel wurde verändert.'
    );
    assert.doesNotMatch(JSON.stringify(result), /Erika Musterfrau|private\\source/u);
    assert.deepStrictEqual(h.calls.map(([name]) => name), [
      'acquire', 'read', 'lease', 'maintain', 'invalidate', 'write', 'progress', 'release'
    ]);
  }
});

await testAsync('invalidation and snapshot-write failures propagate and still release', async () => {
  for (const phase of ['invalidate', 'write']) {
    const snapshotFailure = new Error('snapshot changed');
    const phaseFailure = new Error(`${phase} failed`);
    const overrides = {
      exactPendingEntry() { throw snapshotFailure; }
    };
    if (phase === 'invalidate') overrides.invalidateUnpublishedBatchCopies = () => { throw phaseFailure; };
    if (phase === 'write') overrides.writeState = () => { throw phaseFailure; };
    const h = harness(overrides);
    await assert.rejects(() => h.processBatchNext(h.token, h.deps), (error) => error === phaseFailure);
    assert.strictEqual(h.active.has(h.token), false);
    assert.strictEqual(h.calls.some(([name]) => name === 'process'), false);
    assert.strictEqual(h.calls.filter(([name]) => name === 'release').length, 1);
  }
});

await testAsync('processor resolve and reject keep ownership until promise settlement', async () => {
  for (const outcome of ['resolve', 'reject']) {
    let settle;
    let signalEntered;
    const entered = new Promise((resolve) => { signalEntered = resolve; });
    const pipeline = new Promise((resolve, reject) => {
      settle = outcome === 'resolve' ? resolve : reject;
    });
    const expected = outcome === 'resolve' ? { ok: true } : new Error('private processor failure');
    const h = harness({
      processSingleBatchItem() {
        h.calls.push(['process']);
        signalEntered();
        return pipeline;
      }
    });
    const running = h.processBatchNext(h.token, h.deps);
    await entered;
    assert.strictEqual(h.active.has(h.token), true);
    assert.strictEqual(h.calls.some(([name]) => name === 'release'), false);
    await assert.rejects(() => h.processBatchNext(h.token, h.deps), /bereits eine Verarbeitung/u);
    settle(expected);
    if (outcome === 'resolve') assert.strictEqual(await running, expected);
    else await assert.rejects(running, (error) => error === expected);
    assert.strictEqual(h.active.has(h.token), false);
    assert.strictEqual(h.calls.filter(([name]) => name === 'release').length, 1);
  }
});

await testAsync('delivery promise also retains ownership and release failures remain visible', async () => {
  let resolveDelivery;
  const deliveryPromise = new Promise((resolve) => { resolveDelivery = resolve; });
  const releaseFailure = new Error('release failed');
  const h = harness({
    deliveryResult() { h.calls.push(['delivery']); return deliveryPromise; },
    releaseActiveLock(value) {
      h.calls.push(['release', value, h.active.has(value)]);
      throw releaseFailure;
    }
  });
  h.state.items = [{ status: 'delivery_pending' }];
  const running = h.processBatchNext(h.token, h.deps);
  await Promise.resolve();
  assert.strictEqual(h.active.has(h.token), true);
  assert.strictEqual(h.calls.some(([name]) => name === 'release'), false);
  resolveDelivery({ ok: true });
  await assert.rejects(running, (error) => error === releaseFailure);
  assert.strictEqual(h.active.has(h.token), false);
  const release = h.calls.find(([name]) => name === 'release');
  assert.strictEqual(release[2], false);
});

await testAsync('the batch composition root retains its public processing facade', async () => {
  const batch = require('../plugins/data-secure/server/gateway/batch');
  assert.strictEqual(typeof batch.processBatchNext, 'function');
  assert.strictEqual(typeof batch._test.maintainBeforeNext, 'function');
});

done();
}

main();
