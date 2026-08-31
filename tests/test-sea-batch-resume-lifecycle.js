'use strict';

// In-memory integration of the actual private acceptance orchestration.
// Fake OS children/journals/clock deliberately provide NO native SEA, parser,
// keyring, GUI, crash durability or privacy-release evidence.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { createSuite } = require('./helpers');
const { testAsync, done, assert } = createSuite('SEA crash/resume orchestration (in-memory VM, not OS evidence)');
const file = path.join(__dirname, '../plugins/data-secure/server/sea-batch-probe.js');
const source = fs.readFileSync(file, 'utf8');
const fixturePath = path.win32;
const clone = (value) => JSON.parse(JSON.stringify(value));
const token = 'f'.repeat(64);
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function clockFixture() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    now: () => now,
    get pending() { return timers.size; },
    setTimeout(callback, ms) { const id = ++nextId; timers.set(id, { due: now + ms, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
    clear() { timers.clear(); },
    next() {
      const next = [...timers.entries()].sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
      assert.ok(next, 'orchestration stalled without a pending virtual event');
      timers.delete(next[0]); now = next[1].due; next[1].callback();
    },
    async drive(promise, limit = 120000) {
      let settled = false, result, error;
      promise.then((value) => { result = value; settled = true; }, (failure) => { error = failure; settled = true; });
      for (let step = 0; step < 2000; step++) {
        for (let tick = 0; tick < 64; tick++) await Promise.resolve();
        if (settled) { if (error) throw error; return result; }
        assert.ok(now < limit, 'virtual deadline did not bound the orchestration');
        if (timers.size) this.next();
      }
      throw new Error('VIRTUAL_ORCHESTRATION_BUSY_LOOP');
    }
  };
}

function fixture(options = {}) {
  const clock = clockFixture();
  const events = [], unexpected = [], observations = [], children = [], memory = new Map();
  const scope = { root: 'C:\\synthetic-sea-probe\\case-worker-resume' };
  const completeGrade = { schema: 'datasecure-document-result/1', grade: 'complete', omissions: [], reason_code: null };
  let state = { items: [
    { id: 'a'.repeat(32), status: 'released', package_id: `ds_${'a'.repeat(32)}`, document_result: clone(completeGrade) },
    { id: 'b'.repeat(32), status: 'released', package_id: `ds_${'b'.repeat(32)}`, document_result: clone(completeGrade) },
    { id: 'c'.repeat(32), status: 'processing', checkpoint: 'extracted' }
  ] };
  let reads = 0;
  const context = {
    events, observations, children, memory, scope, clock,
    get state() { return state; }, set state(value) { state = value; },
    get reads() { return reads; },
    documentPath(index = 0) {
      const id = `ds_${['a', 'b'][index].repeat(32)}`;
      return fixturePath.join(scope.root, 'privacy', 'Output', id, `${id}.md`);
    }
  };
  for (const [index, item] of state.items.slice(0, 2).entries()) {
    const document = Buffer.from(`Synthetic preserved result ${index}: fachliche Inhalte.`, 'utf8');
    const directory = fixturePath.join(scope.root, 'privacy', 'Output', item.package_id);
    const manifest = Buffer.from(JSON.stringify({ schema: 'eu-privacy-package/3',
      package_id: item.package_id, document: `${item.package_id}.md`, document_sha256: sha256(document),
      document_result: clone(completeGrade) }), 'utf8');
    memory.set(fixturePath.join(directory, 'manifest.json'), { bytes: manifest, identity: `manifest-${index}` });
    memory.set(fixturePath.join(directory, `${item.package_id}.md`), { bytes: document, identity: `document-${index}` });
  }
  const initialFiles = [...memory].map(([name, value]) => [name, { ...value, bytes: Buffer.from(value.bytes) }]);
  function readMemory(name) {
    events.push(`file:${name}`);
    assert.ok(memory.has(name), 'only the exact four synthetic preserved artifacts may be read');
    const value = memory.get(name);
    return { bytes: Buffer.from(value.bytes), identity: value.identity, sha256: sha256(value.bytes) };
  }
  function emitEnd(child, code = 17, signal = null) {
    child.exitCode = code; child.signalCode = signal;
    child.emit('exit', code, signal);
    if (!options.missingDisconnect) { child.connected = false; child.emit('disconnect'); }
  }
  function terminalFrame() {
    return { type: 'local-batch-state', complete: true, batch_phase: 'complete', batch_total: 3,
      released: 3, stopped: 0, result_grade_counts: { complete: 3 }, result_omission_counts: {},
      result_grades_verified: true };
  }
  function childFixture(resumed = false) {
    const child = Object.assign(new EventEmitter(), {
      pid: resumed ? 222 : 111, connected: true, exitCode: null, signalCode: null, kills: 0,
      kill() {
        this.kills++; events.push(`kill:${this.pid}`);
        if (options.killMode === 'throw') throw new Error('synthetic kill failure');
        options.onKill?.(context);
        if (options.killMode !== 'no-exit') queueMicrotask(() => {
          events.push(`exit:${this.pid}`);
          emitEnd(this, options.killMode === 'natural' ? 0 : 17);
        });
        return options.killMode !== 'false';
      },
      send(frame, callback) {
        events.push(`send:${this.pid}`);
        assert.deepStrictEqual(clone(frame), { type: 'start-local-batch', batch_token: token });
        assert.ok(events.indexOf(`claim:${this.pid}`) < events.indexOf(`send:${this.pid}`), 'lease before IPC');
        if (options.sendThrows) throw new Error('synthetic send failure');
        if (options.sendFails) { callback(new Error('synthetic IPC failure')); return; }
        callback(null);
        if (options.resumeNoExit) return;
        queueMicrotask(() => {
          state.items[2].status = 'released';
          state.items[2].package_id = `ds_${state.items[2].id}`;
          options.onResumeComplete?.(context);
          let frame = terminalFrame();
          if (options.terminalTransform) frame = options.terminalTransform(frame);
          if (frame !== null) child.emit('message', frame);
          if (options.duplicateTerminal) child.emit('message', terminalFrame());
          emitEnd(child, options.resumeExitCode ?? 0);
        });
      }
    });
    children.push(child);
    return child;
  }
  const reader = {
    readStateForMaintenance(value) {
      assert.strictEqual(value, token); reads++; events.push(`journal:${reads}`);
      const override = options.onRead?.(reads, context);
      return clone(override ?? state);
    }
  };
  const batch = {
    continueMostRecentBatch() {
      events.push('continue');
      assert.ok(originalObserved.cleanupSafe, 'continuation requires actual original exit plus disconnect');
      if (options.continueResult) return options.continueResult;
      state.items[2].status = 'pending'; delete state.items[2].checkpoint;
      options.onContinue?.(context);
      return { ok: true, batch_token: token };
    },
    claimLocalBatchExecutor(value, pid) {
      assert.strictEqual(value, token); assert.strictEqual(pid, 222); events.push(`claim:${pid}`);
      return { ok: options.claimFails !== true };
    }
  };
  const forbiddenFs = new Proxy({}, { get() { throw new Error('REAL_FS_FORBIDDEN_IN_VM'); } });
  const sandbox = {
    module: { exports: {} }, Buffer, Date: { now: clock.now },
    process: { env: { SYNTHETIC_SCOPE: 'no-real-process' } },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    __readMemory: readMemory,
    __recheckScope(value) { assert.strictEqual(value, scope); events.push('scope'); },
    require(name) {
      if (name === 'node:fs') return forbiddenFs;
      if (name === 'node:path') return fixturePath;
      if (name === 'node:crypto') return crypto;
      if (name === 'node:os') return forbiddenFs;
      if (name === 'node:sea') return { isSea: () => false };
      if (name === './gateway/batch-journal-store') return { createBatchJournalStore: () => reader };
      if (name === './gateway/batch') return batch;
      if (name === './gateway/document-result-grade') return {
        validateManifestDocumentResult(value) {
          assert.strictEqual(value.schema, 'eu-privacy-package/3');
          return value.document_result;
        },
        sameDocumentResult(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
      };
      unexpected.push(name); throw new Error('UNEXPECTED_PRODUCT_IMPORT');
    }
  };
  vm.runInNewContext(`${source}\nreadRegular = __readMemory; recheckScope = __recheckScope;\n` +
    'globalThis.__api = { observeWorker, crashAndResume, resumeWorker, waitForCrashCandidate, captureReleasedPackages, verifyPreservedPackages };',
  sandbox, { filename: file, timeout: 1000 });
  const api = sandbox.__api;
  const original = childFixture();
  const originalObserved = api.observeWorker(original);
  const frameState = () => options.frameState || { checkpoint: true, started: true, invalid: false, terminal: null };
  const launch = (role, settings) => {
    assert.strictEqual(role, 'batch');
    assert.deepStrictEqual(Object.keys(settings), ['env']);
    assert.strictEqual(settings.env, sandbox.process.env);
    events.push('launch'); return childFixture(true);
  };
  const setObserved = (observed) => { observations.push(observed); };
  return {
    ...context, api, original, originalObserved, frameState, initialFiles,
    get state() { return state; }, get reads() { return reads; },
    run() { return clock.drive(api.crashAndResume({ child: original, observed: originalObserved,
      token, deadline: options.deadline ?? 11000, scope, launchBackgroundRole: launch, setObserved, frameState })); },
    wait(deadline = 11000) { return clock.drive(api.waitForCrashCandidate(originalObserved, token, deadline, frameState)); },
    preservedUnchanged() {
      for (const [name, before] of initialFiles) {
        assert.strictEqual(memory.get(name).identity, before.identity);
        assert.deepStrictEqual(memory.get(name).bytes, before.bytes);
      }
    },
    dispose() { clock.clear(); for (const child of children) child.removeAllListeners(); assert.deepStrictEqual(unexpected, []); }
  };
}

async function check(options, operation) {
  const value = fixture(options);
  try { await operation(value); }
  finally { value.dispose(); }
}

async function main() {
  await testAsync('actual private orchestration preserves two byte/hash/identity-bound packages across observed crash and resume', () =>
    check({}, async (value) => {
      await value.run();
      assert.strictEqual(value.original.kills, 1);
      assert.strictEqual(value.originalObserved.stopRequested, true);
      assert.strictEqual(value.originalObserved.cleanupSafe, true);
      const ended = await value.originalObserved.completion;
      assert.strictEqual(ended.code, 17); assert.strictEqual(ended.neverStarted, false);
      assert.strictEqual(value.observations.length, 1);
      assert.strictEqual(value.observations[0].cleanupSafe, true);
      assert.ok(value.events.indexOf('exit:111') < value.events.indexOf('continue'));
      assert.ok(value.events.indexOf('continue') < value.events.indexOf('claim:222'));
      assert.strictEqual(value.events.filter((entry) => entry === 'send:222').length, 1);
      assert.strictEqual(value.reads, 5);
      assert.ok(value.state.items.every((item) => item.status === 'released'));
      value.preservedUnchanged();
      assert.strictEqual(value.events.filter((entry) => entry.startsWith('file:')).length, 16);
    }));
  await testAsync('missed or already published crash point is bounded and never kills the original worker', async () => {
    for (const phase of ['private_copy_claimed', 'package_published', 'publication_unconfirmed']) {
      await check({ onRead(read, context) { context.state.items[2].checkpoint = phase; } }, async (value) => {
        await assert.rejects(value.run(), /SEA_BATCH_CRASH_POINT_NOT_REACHED/u);
        assert.strictEqual(value.original.kills, 0);
        assert.ok(value.reads <= 50); assert.ok(!value.events.includes('continue'));
      });
    }
  });
  await testAsync('publication or changed identity between candidate capture and kill prevents the crash', async () => {
    for (const mutate of [
      (state) => { state.items[2].checkpoint = 'package_published'; state.items[2].package_id = `ds_${state.items[2].id}`; },
      (state) => { state.items[2].id = 'd'.repeat(32); }
    ]) {
      await check({ onRead(read, context) { if (read === 2) mutate(context.state); } }, async (value) => {
        await assert.rejects(value.run(), /SEA_BATCH_CRASH_POINT_NOT_REACHED/u);
        assert.strictEqual(value.original.kills, 0);
      });
    }
  });
  await testAsync('kill returning false or a natural zero exit is never counted as an observed injected crash', async () => {
    for (const killMode of ['false', 'natural']) await check({ killMode }, async (value) => {
      await assert.rejects(value.run(), /SEA_BATCH_CRASH_POINT_NOT_REACHED/u);
      assert.strictEqual(value.original.kills, 1);
      assert.ok(!value.events.includes('continue'));
    });
  });
  await testAsync('missing exit, missing IPC drain or throwing kill retain unsafe cleanup after virtual five seconds', async () => {
    for (const options of [{ killMode: 'no-exit' }, { missingDisconnect: true }, { killMode: 'throw' }]) {
      await check(options, async (value) => {
        await assert.rejects(value.run(), /SEA_BATCH_CLEANUP_PENDING/u);
        assert.strictEqual(value.originalObserved.cleanupSafe, false);
        assert.strictEqual(value.original.kills, 1);
        assert.ok(!value.events.includes('continue'));
        assert.strictEqual(value.clock.now(), 5000);
      });
    }
  });
  await testAsync('changed interrupted item or already published package prevents any continuation', async () => {
    for (const mutate of [
      (state) => { state.items[2].id = 'd'.repeat(32); },
      (state) => { state.items[2].checkpoint = 'package_published'; state.items[2].package_id = `ds_${state.items[2].id}`; }
    ]) await check({ onKill(context) { mutate(context.state); } }, async (value) => {
      await assert.rejects(value.run(), /SEA_BATCH_CRASH_POINT_NOT_REACHED/u);
      assert.ok(!value.events.includes('continue'));
    });
  });
  await testAsync('wrong continuation token, failed continuation and changed ready journal stop before worker spawn', async () => {
    for (const options of [
      { continueResult: { ok: true, batch_token: 'e'.repeat(64) } },
      { continueResult: { ok: false, batch_token: token } },
      { onContinue(context) { context.state.items[2].id = 'd'.repeat(32); } },
      { onContinue(context) { context.state.items[2].status = 'retryable'; } }
    ]) await check(options, async (value) => {
      await assert.rejects(value.run(), /SEA_BATCH_RESUME_FAILED/u);
      assert.ok(!value.events.includes('launch'));
    });
  });
  await testAsync('lease claim failure never sends a resume frame and retains the actual child observer', () =>
    check({ claimFails: true }, async (value) => {
      await assert.rejects(value.run(), /SEA_BATCH_RESUME_FAILED/u);
      assert.strictEqual(value.observations.length, 1);
      assert.strictEqual(value.observations[0].cleanupSafe, false);
      assert.ok(!value.events.includes('send:222'));
      await value.clock.drive(value.observations[0].stop());
      assert.strictEqual(value.observations[0].cleanupSafe, true);
    }));
  await testAsync('changed preserved bytes, hash or filesystem identity are detected before continuation', async () => {
    for (const mutate of [
      (entry) => { entry.bytes = Buffer.from('changed synthetic document'); },
      (entry) => { entry.identity = 'different-inode-same-bytes'; }
    ]) await check({ onKill(context) { mutate(context.memory.get(context.documentPath())); } }, async (value) => {
      await assert.rejects(value.run(), /SEA_BATCH_RESULT_INVALID/u);
      assert.ok(!value.events.includes('continue'));
    });
  });
  await testAsync('post-resume changes to a released manifest/document or item identity invalidate preservation', async () => {
    for (const mutate of [
      (context) => { context.memory.get(context.documentPath(1)).bytes = Buffer.from('changed after resume'); },
      (context) => { context.memory.get(context.documentPath(1)).identity = 'replacement-after-resume'; },
      (context) => {
        const manifest = fixturePath.join(fixturePath.dirname(context.documentPath()), 'manifest.json');
        context.memory.get(manifest).bytes = Buffer.from('{"synthetic":"changed manifest"}');
      },
      (context) => { context.state.items[0].id = 'd'.repeat(32); }
    ]) await check({ onResumeComplete: mutate }, async (value) => {
      await assert.rejects(value.run(), /SEA_BATCH_RESULT_INVALID/u);
      assert.strictEqual(value.observations[0].cleanupSafe, true);
    });
  });
  await testAsync('missing, duplicate or malformed resume terminal frames cannot yield success', async () => {
    for (const options of [
      { terminalTransform: () => null }, { duplicateTerminal: true },
      { terminalTransform: (frame) => ({ ...frame, complete: false }) },
      { terminalTransform: (frame) => ({ ...frame, released: 2 }) },
      { terminalTransform: (frame) => ({ ...frame, result_grades_verified: false }) },
      { terminalTransform: (frame) => ({ ...frame, unexpected: 'private canary' }) }
    ]) await check(options, async (value) => {
      await assert.rejects(value.run(), /SEA_BATCH_FRAME_INVALID/u);
      assert.strictEqual(value.observations[0].cleanupSafe, true);
    });
  });
  await testAsync('resume IPC failure and failed worker exit remain fixed failures, never successful results', async () => {
    for (const [options, code] of [[{ sendFails: true }, 'SEA_BATCH_IPC_FAILED'],
      [{ sendThrows: true }, 'SEA_BATCH_IPC_FAILED'], [{ resumeExitCode: 1 }, 'SEA_BATCH_WORKER_FAILED']]) {
      await check(options, async (value) => {
        await assert.rejects(value.run(), new RegExp(code, 'u'));
        if (!value.observations[0].cleanupSafe) await value.clock.drive(value.observations[0].stop());
        assert.strictEqual(value.observations[0].cleanupSafe, true);
      });
    }
  });
  await testAsync('a resumed child that never completes reaches the virtual deadline and still requires actual cleanup', () =>
    check({ resumeNoExit: true }, async (value) => {
      await assert.rejects(value.run(), /SEA_BATCH_DEADLINE/u);
      assert.strictEqual(value.clock.now(), 6000);
      assert.strictEqual(value.observations[0].cleanupSafe, false);
      await value.clock.drive(value.observations[0].stop());
      assert.strictEqual(value.children[1].kills, 1);
      assert.strictEqual(value.observations[0].cleanupSafe, true);
    }));
  await testAsync('journal unavailability stops after a bounded read budget with no kill or continuation', () =>
    check({ onRead() { throw new Error('synthetic private journal error'); } }, async (value) => {
      await assert.rejects(value.wait(), /SEA_BATCH_JOURNAL_UNAVAILABLE/u);
      assert.strictEqual(value.reads, 9);
      assert.strictEqual(value.clock.now(), 160);
      assert.strictEqual(value.original.kills, 0);
    }));
  await testAsync('transient journal failure recovers read-only and reaches the next valid checkpoint', () =>
    check({ onRead(read) { if (read <= 2) throw new Error('transient synthetic read'); } }, async (value) => {
      const candidate = await value.wait();
      assert.strictEqual(candidate.items[2].checkpoint, 'extracted');
      assert.strictEqual(value.reads, 3);
      assert.strictEqual(value.clock.now(), 40);
      assert.strictEqual(value.original.kills, 0);
    }));
  await testAsync('no start/checkpoint, malformed frame or already terminal run never crashes a worker', async () => {
    for (const [frameState, code] of [
      [{ checkpoint: false, started: false, invalid: false, terminal: null }, 'SEA_BATCH_CRASH_POINT_NOT_REACHED'],
      [{ checkpoint: true, started: true, invalid: true, terminal: null }, 'SEA_BATCH_FRAME_INVALID'],
      [{ checkpoint: true, started: true, invalid: false, terminal: {} }, 'SEA_BATCH_CRASH_POINT_NOT_REACHED']
    ]) await check({ frameState }, async (value) => {
      await assert.rejects(value.wait(), new RegExp(code, 'u'));
      assert.strictEqual(value.reads, 0);
      assert.strictEqual(value.original.kills, 0);
    });
  });
  await testAsync('a previously observed worker exit is a missed crash point even when journal still says extracted', () =>
    check({}, async (value) => {
      value.original.exitCode = 0;
      value.original.emit('exit', 0, null);
      await assert.rejects(value.wait(), /SEA_BATCH_CRASH_POINT_NOT_REACHED/u);
      assert.strictEqual(value.reads, 0);
      assert.strictEqual(value.original.kills, 0);
    }));
  done();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
