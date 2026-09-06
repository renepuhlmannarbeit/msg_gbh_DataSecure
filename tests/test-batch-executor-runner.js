'use strict';

const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createBatchExecutorRunner } = require('../plugins/data-secure/server/gateway/batch-executor-runner');
const batchFacade = require('../plugins/data-secure/server/gateway/batch');
const { createSuite } = require('./helpers');

const { testAsync, done, assert } = createSuite('Batch executor runner boundary');
const token = 'e'.repeat(64);
const pid = 4242;

function progress(overrides = {}) {
  return {
    completed: 0,
    remaining: 0,
    delivery_pending: 0,
    mapping_pending: 0,
    deferred_review: 0,
    retryable: 0,
    complete: false,
    ...overrides
  };
}

function fixture(options = {}) {
  const events = [];
  const preparedRun = { opaque: true };
  let current = options.state || {
    token,
    local_executor_pid: pid,
    items: [{}],
    io_summary: {},
    progress: progress()
  };
  let reads = 0;
  let processCalls = 0;
  let finalizeCalls = 0;

  const { runLocalBatchExecutor } = createBatchExecutorRunner({
    SafeError,
    currentPid: () => pid,
    readState(value) {
      reads++;
      events.push(`read:${reads}:${value}`);
      if (options.failReadAt === reads) throw new Error(`READ_${reads}_FAILED`);
      return current;
    },
    writeState(value) {
      events.push('write');
      if (options.failWrite) throw new Error('WRITE_FAILED');
      current = value;
    },
    liveLocalExecutor(value) {
      events.push('live');
      return options.live !== false && value.local_executor_pid !== undefined;
    },
    publicProgress(value) {
      events.push('progress');
      return { ...value.progress };
    },
    prepareProcessingRun(deps) {
      events.push('prepare');
      assert.strictEqual(deps.marker, options.marker);
      if (options.failPrepare) throw new Error('PREPARE_FAILED');
      return preparedRun;
    },
    incrementPrivateIoSummary(summary, key) {
      events.push(`increment:${key}`);
      assert.strictEqual(summary, current.io_summary);
      return options.incrementChanged !== false;
    },
    async processBatchNext(value, deps) {
      processCalls++;
      events.push(`process:${processCalls}`);
      assert.strictEqual(value, token);
      assert.strictEqual(deps.preparedRun, preparedRun);
      assert.strictEqual(deps.executorPid, Number(options.executorPid ?? pid));
      if (options.failProcessAt === processCalls) throw new Error('PROCESS_FAILED');
      const result = options.process
        ? await options.process(processCalls, current, events)
        : progress();
      current.progress = { ...result };
      return result;
    },
    finalizePublishedPackageLocally(value, packageId, deps) {
      finalizeCalls++;
      events.push(`finalize:${packageId}:${finalizeCalls}`);
      assert.strictEqual(value, token);
      assert.strictEqual(deps.preparedRun, preparedRun);
      assert.strictEqual(deps.executorPid, Number(options.executorPid ?? pid));
      if (options.failFinalizeAt === finalizeCalls) throw new Error('FINALIZE_FAILED');
      const result = options.finalize
        ? options.finalize(finalizeCalls, packageId, current, events)
        : progress();
      current.progress = { ...result };
      return result;
    },
    releaseLocalBatchExecutor(value, executorPid) {
      events.push(`release:${value}:${executorPid}`);
      if (options.failRelease) throw new Error('RELEASE_FAILED');
      if (options.onRelease) options.onRelease(current);
      return options.releaseResult !== false;
    },
    deliveryPendingStatus: 'delivery_pending',
    maxBatchFiles: options.maxBatchFiles || 100
  });

  return {
    events,
    preparedRun,
    run: () => runLocalBatchExecutor(token, {
      marker: options.marker,
      preparedRun: { forged: true },
      ...(options.executorPid === undefined ? {} : { executorPid: options.executorPid })
    }),
    counts: () => ({ reads, processCalls, finalizeCalls }),
    setState(value) { current = value; }
  };
}

testAsync('lease ownership is proven before progress, preparation or release', async () => {
  for (const options of [
    { live: false },
    { state: { token, local_executor_pid: pid + 1, items: [], io_summary: {}, progress: progress() } }
  ]) {
    const value = fixture(options);
    await assert.rejects(value.run(), /keine gültige Ausführungsberechtigung/);
    assert.deepStrictEqual(value.events, [`read:1:${token}`, 'live']);
  }

  const normalized = fixture({
    executorPid: String(pid),
    state: { token, local_executor_pid: pid, items: [{}], io_summary: {}, progress: progress() }
  });
  await normalized.run();
  assert.ok(normalized.events.includes(`release:${token}:${pid}`));
});

testAsync('preparation and maintenance run once before all batch work', async () => {
  const value = fixture({
    marker: 'caller-marker',
    state: {
      token,
      local_executor_pid: pid,
      items: [{ status: 'pending' }, { status: 'pending' }],
      io_summary: {},
      progress: progress({ remaining: 1 })
    },
    process: () => progress({ remaining: 0, completed: 1 })
  });
  await value.run();
  assert.deepStrictEqual(value.events.slice(0, 6), [
    `read:1:${token}`,
    'live',
    'progress',
    'prepare',
    'increment:batch_maintenance_runs',
    'write'
  ]);
  assert.strictEqual(value.events.filter((event) => event === 'prepare').length, 1);
  assert.strictEqual(value.events.filter((event) => event.startsWith('increment:')).length, 1);

  const unchanged = fixture({
    incrementChanged: false,
    state: { token, local_executor_pid: pid, items: [{}], io_summary: {}, progress: progress() }
  });
  await unchanged.run();
  assert.strictEqual(unchanged.events.includes('write'), false);
});

testAsync('delivery, mapping and normal work keep their strict priority', async () => {
  const value = fixture({
    state: {
      token,
      local_executor_pid: pid,
      items: [{ status: 'delivery_pending', package_id: 'old-package' }],
      io_summary: {},
      progress: progress({ delivery_pending: 1, mapping_pending: 1, remaining: 1 })
    },
    finalize: (call) => call === 1
      ? progress({ mapping_pending: 1, remaining: 1 })
      : progress({ completed: 1 }),
    process: (call) => call === 1
      ? progress({ remaining: 1 })
      : { ...progress({ completed: 1, delivery_pending: 1 }), package_id: 'new-package' }
  });
  await value.run();
  assert.deepStrictEqual(
    value.events.filter((event) => event.startsWith('finalize:') || event.startsWith('process:')),
    ['finalize:old-package:1', 'process:1', 'process:2', 'finalize:new-package:2']
  );

  const stale = fixture({
    state: {
      token,
      local_executor_pid: pid,
      items: [{ status: 'pending' }],
      io_summary: {},
      progress: progress({ delivery_pending: 1, remaining: 1 })
    }
  });
  await stale.run();
  assert.deepStrictEqual(stale.counts(), { reads: 3, processCalls: 0, finalizeCalls: 0 });
});

testAsync('both no-progress gates stop without a busy loop', async () => {
  const mapping = fixture({
    state: { token, local_executor_pid: pid, items: [{}], io_summary: {}, progress: progress({ mapping_pending: 1, remaining: 1 }) },
    process: () => progress({ mapping_pending: 1, remaining: 99, completed: 50 })
  });
  await mapping.run();
  assert.strictEqual(mapping.counts().processCalls, 1);

  const normal = fixture({
    state: { token, local_executor_pid: pid, items: [{}], io_summary: {}, progress: progress({ remaining: 1 }) },
    process: () => progress({ remaining: 1, deferred_review: 7 })
  });
  await normal.run();
  assert.strictEqual(normal.counts().processCalls, 1);
});

testAsync('a new package is finalized immediately while zero remaining does no work', async () => {
  const published = fixture({
    state: { token, local_executor_pid: pid, items: [{}], io_summary: {}, progress: progress({ remaining: 1 }) },
    process: () => ({ ...progress({ completed: 1, delivery_pending: 1 }), package_id: 'published-package' }),
    finalize: () => progress({ completed: 1 })
  });
  await published.run();
  assert.deepStrictEqual(
    published.events.filter((event) => event.startsWith('process:') || event.startsWith('finalize:')),
    ['process:1', 'finalize:published-package:1']
  );

  const finished = fixture({
    state: { token, local_executor_pid: pid, items: [{}], io_summary: {}, progress: progress() }
  });
  await finished.run();
  assert.deepStrictEqual(finished.counts(), { reads: 2, processCalls: 0, finalizeCalls: 0 });
});

testAsync('the hard item-derived step budget bounds apparent progress', async () => {
  const value = fixture({
    state: { token, local_executor_pid: pid, items: [{}], io_summary: {}, progress: progress({ mapping_pending: 1 }) },
    process: (call) => progress({ mapping_pending: call + 1 })
  });
  await value.run();
  assert.strictEqual(value.counts().processCalls, 6);
  assert.strictEqual(value.events.filter((event) => event.startsWith('release:')).length, 1);

  const oversized = fixture({
    maxBatchFiles: 1,
    state: { token, local_executor_pid: pid, items: [{}, {}], io_summary: {}, progress: progress({ mapping_pending: 1 }) }
  });
  await assert.rejects(oversized.run(), /Stapelzustand ist ungültig/);
  assert.strictEqual(oversized.counts().processCalls, 0);
  assert.strictEqual(oversized.events.filter((event) => event.startsWith('release:')).length, 1);
});

testAsync('every post-claim failure releases once and success uses fresh final progress', async () => {
  for (const options of [
    { failPrepare: true, expected: 'PREPARE_FAILED' },
    { failWrite: true, expected: 'WRITE_FAILED' },
    {
      state: { token, local_executor_pid: pid, items: [{}], io_summary: {}, progress: progress({ remaining: 1 }) },
      failProcessAt: 1,
      expected: 'PROCESS_FAILED'
    },
    {
      state: {
        token,
        local_executor_pid: pid,
        items: [{ status: 'delivery_pending', package_id: 'package' }],
        io_summary: {},
        progress: progress({ delivery_pending: 1 })
      },
      failFinalizeAt: 1,
      expected: 'FINALIZE_FAILED'
    }
  ]) {
    const value = fixture(options);
    await assert.rejects(value.run(), new RegExp(options.expected));
    assert.strictEqual(value.events.filter((event) => event.startsWith('release:')).length, 1);
  }

  const unreleased = fixture({
    releaseResult: false,
    state: { token, local_executor_pid: pid, items: [{}], io_summary: {}, progress: progress() }
  });
  await assert.rejects(unreleased.run(), /nicht sicher freigeben/);
  assert.strictEqual(unreleased.events.filter((event) => event.startsWith('release:')).length, 1);

  const completed = fixture({
    state: { token, local_executor_pid: pid, items: [{}], io_summary: {}, progress: progress({ remaining: 1 }) },
    process: () => ({ ...progress({ remaining: 1 }), secret_name: 'René Beispiel', package_id: null }),
    onRelease: (current) => { current.progress = progress({ completed: 7, complete: true }); }
  });
  const result = await completed.run();
  assert.deepStrictEqual(result, {
    ok: true,
    ...progress({ completed: 7, complete: true }),
    raw_content_sent_to_claude: false
  });
  const releaseIndex = completed.events.findIndex((event) => event.startsWith('release:'));
  assert.ok(releaseIndex >= 0 && completed.events[releaseIndex + 1].startsWith('read:'));
  assert.strictEqual(JSON.stringify(result).includes('René Beispiel'), false);

  assert.strictEqual(typeof batchFacade.runLocalBatchExecutor, 'function');
});

done();
