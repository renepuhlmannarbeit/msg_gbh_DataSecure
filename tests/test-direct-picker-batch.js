'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-direct-picker-'));
process.env.LOCALAPPDATA = path.join(base, 'localapp');
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
const { roots } = require('../plugins/data-secure/server/gateway/common');
const { beginBatch, discardIncompleteBatches, releaseLocalBatchExecutor, _test } = require('../plugins/data-secure/server/gateway/batch');
const { startLocalBatchExecutor, startLocalIntakeExecutor, localIntakeActive } = require('../plugins/data-secure/server/gateway/batch-executor');
const { batchQueueFromSelection, validateSelectedPath } = require('../plugins/data-secure/server/companion/file-picker');
const { sourceLimitForExtension } = require('../plugins/data-secure/server/resource-limits');
const { test, done, assert } = createSuite('Direct picker batch intake');

test('a locally picked queue creates a sealed batch without manual Input staging or another confirmation', () => {
  const source = path.join(base, 'picked-contract.txt');
  const original = 'Vertrag zwischen Siemens AG und Erika Beispiel';
  fs.writeFileSync(source, original, 'utf8');
  const batch = beginBatch({
    expectedCount: 1,
    profile: 'contract',
    queue: batchQueueFromSelection([{ sourcePath: source, sourceType: 'txt', sourceBytes: fs.statSync(source).size }]),
    // The native picker Open action is the sole user confirmation.
    confirmStart: () => true
  });
  assert.strictEqual(batch.ok, true);
  assert.strictEqual(fs.readFileSync(source, 'utf8'), original, 'the picker source is read-only and remains byte-identical');
  assert.strictEqual(fs.existsSync(path.join(roots().root, 'Input')), false);
  assert.strictEqual(discardIncompleteBatches({ confirmed: true }).ok, true);
  assert.strictEqual(fs.readFileSync(source, 'utf8'), original, 'discarding DataSecure work never deletes or changes the source');
});

test('equal basenames receive independent identities and minimally disambiguated local mapping labels', () => {
  const leftDir = path.join(base, 'left');
  const rightDir = path.join(base, 'right');
  fs.mkdirSync(leftDir, { recursive: true });
  fs.mkdirSync(rightDir, { recursive: true });
  const left = path.join(leftDir, 'profil.txt');
  const right = path.join(rightDir, 'profil.txt');
  fs.writeFileSync(left, 'Kontakt: Erika Beispiel', 'utf8');
  fs.writeFileSync(right, 'Kontakt: Max Beispiel', 'utf8');
  const queue = batchQueueFromSelection([left, right].map((sourcePath) => ({
    sourcePath,
    sourceType: 'txt',
    sourceBytes: fs.statSync(sourcePath).size
  })));
  const batch = beginBatch({ expectedCount: 2, profile: 'personnel_profile', queue, confirmStart: () => true });
  assert.strictEqual(batch.ok, true);
  const state = _test.readState(batch.batch_token);
  assert.deepStrictEqual(state.items.map((item) => item.name), ['profil.txt', 'profil.txt']);
  assert.deepStrictEqual(state.items.map((item) => item.source_label), ['left/profil.txt', 'right/profil.txt']);
  assert.strictEqual(new Set(state.items.map((item) => item.id)).size, 2);
  assert.strictEqual(new Set(state.items.map((item) => item.work_name)).size, 2);
  assert.doesNotMatch(JSON.stringify(state), new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  assert.strictEqual(fs.readFileSync(left, 'utf8'), 'Kontakt: Erika Beispiel');
  assert.strictEqual(fs.readFileSync(right, 'utf8'), 'Kontakt: Max Beispiel');
  assert.strictEqual(discardIncompleteBatches({ confirmed: true }).ok, true);
});

test('the picker and batch reject a source beneath a link or reparse component before any source read', () => {
  const source = path.join(base, 'linked-parent-source.txt');
  fs.writeFileSync(source, 'Vertrag zwischen Beispiel GmbH und Max Beispiel', 'utf8');
  assert.throws(
    () => validateSelectedPath(source, { hasReparseComponent: () => true }),
    /Link oder Reparse-Punkt/u
  );
  assert.throws(
    () => beginBatch({
      expectedCount: 1,
      profile: 'contract',
      queue: [{ name: path.basename(source), full: source, sourceBytes: fs.statSync(source).size }],
      hasReparseComponent: () => true
    }),
    /Link oder Reparse-Punkt/u
  );
  assert.strictEqual(fs.readFileSync(source, 'utf8'), 'Vertrag zwischen Beispiel GmbH und Max Beispiel');
});

test('the picker and batch reject a real linked parent directory without changing its source', () => {
  const target = path.join(base, 'real-link-target');
  const link = path.join(base, 'real-link-parent');
  const source = path.join(target, 'source.txt');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(source, 'Vertrag zwischen Beispiel GmbH und Max Beispiel', 'utf8');
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  const linkedSource = path.join(link, 'source.txt');
  try {
    assert.strictEqual(fs.lstatSync(link).isSymbolicLink(), true);
    assert.strictEqual(fs.realpathSync.native(linkedSource), fs.realpathSync.native(source));
    assert.throws(() => validateSelectedPath(linkedSource), /Link oder Reparse-Punkt/u);
    assert.throws(() => beginBatch({
      expectedCount: 1,
      profile: 'contract',
      queue: [{ name: 'source.txt', full: linkedSource, sourceBytes: fs.statSync(source).size }]
    }), /Link oder Reparse-Punkt/u);
    assert.strictEqual(fs.readFileSync(source, 'utf8'), 'Vertrag zwischen Beispiel GmbH und Max Beispiel');
  } finally {
    const linkStat = fs.lstatSync(link);
    assert.strictEqual(linkStat.isSymbolicLink(), true);
    fs.unlinkSync(link);
  }
  assert.strictEqual(fs.readFileSync(source, 'utf8'), 'Vertrag zwischen Beispiel GmbH und Max Beispiel');
});

test('the picker applies parser-safe per-format limits before background intake', () => {
  const source = path.join(base, 'oversized.csv');
  const limit = sourceLimitForExtension('.csv');
  const fakeFs = {
    lstatSync(candidate) {
      assert.strictEqual(candidate, source);
      return {
        size: limit + 1,
        isFile: () => true,
        isSymbolicLink: () => false
      };
    }
  };
  assert.throws(
    () => validateSelectedPath(source, { fs: fakeFs, hasReparseComponent: () => false }),
    /sichere Einzeldateigrenze/u
  );
  assert.doesNotThrow(() => validateSelectedPath(source, {
    fs: fakeFs,
    hasReparseComponent: () => false,
    maxBytes: limit + 1
  }));
});

test('background intake returns immediately and sends source descriptors only through private IPC', () => {
  const source = path.join(base, 'background-contract.txt');
  fs.writeFileSync(source, 'Vertrag zwischen Beispiel GmbH und Max Beispiel', 'utf8');
  let message;
  let disconnectCalls = 0;
  const listeners = {};
  const child = {
    pid: process.pid,
    once(event, handler) { listeners[event] = handler; },
    send(value, callback) { message = value; callback(); },
    disconnect() { disconnectCalls += 1; }, unref() {}, kill() {}
  };
  const result = startLocalIntakeExecutor([
    { name: path.basename(source), full: source, sourceBytes: fs.statSync(source).size }
  ], 'contract', { forkProcess: () => child, showLocalIntakeNotice: () => {} });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.local_intake_pending, true);
  assert.strictEqual(localIntakeActive(), true, 'a second picker must be rejected while this local intake is pending');
  assert.strictEqual(result.local_intake_started, undefined);
  assert.match(result.batch_token, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(result), /background-contract|Beispiel GmbH|sourceBytes|path/i);
  assert.strictEqual(message.type, 'start-local-intake');
  assert.strictEqual(message.queue[0].full, source);
  assert.strictEqual(disconnectCalls, 0, 'the parent must keep IPC alive until the worker has started');
  listeners.exit?.(0);
  assert.strictEqual(localIntakeActive(), false, 'the next picker becomes available only after the intake worker exits');
});

test('explicit resume starts only the existing checkpoint and never opens or rebuilds a picker queue', () => {
  const source = path.join(base, 'resume-existing.txt');
  fs.writeFileSync(source, 'Kontakt: Resume Beispiel', 'utf8');
  const batch = beginBatch({
    expectedCount: 1,
    profile: 'general',
    queue: batchQueueFromSelection([{ sourcePath: source, sourceBytes: fs.statSync(source).size }]),
    confirmStart: () => true
  });
  let message;
  const listeners = {};
  const states = [];
  const failures = [];
  const child = {
    pid: process.pid,
    on(event, handler) { listeners[`on:${event}`] = handler; },
    once(event, handler) { listeners[`once:${event}`] = handler; },
    send(value, callback) {
      // The parent acknowledges a claimed terminal notice over the same channel;
      // only the first message is the private start envelope.
      (child.messages ||= []).push(value);
      if (value?.type === 'local-terminal-notice-claimed') { callback(); return; }
      message = value;
      listeners['on:message']?.({
        type: 'local-batch-state', complete: false, batch_phase: 'awaiting_explicit_resume',
        batch_total: 1, released: 0, stopped: 0
      });
      callback();
    },
    unref() {}, kill() {}
  };
  const result = startLocalBatchExecutor(batch.batch_token, {
    forkProcess: () => child,
    showBatchStateNotice: (state) => states.push(state),
    showLocalIntakeNotice: (stage) => failures.push(stage)
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(message, { type: 'start-local-batch', batch_token: batch.batch_token });
  assert.strictEqual(message.queue, undefined);
  assert.deepStrictEqual(child.messages.slice(1), [{ type: 'local-terminal-notice-claimed' }],
    'the only further message is the content-free notice acknowledgement');
  listeners['once:exit']?.(0);
  assert.deepStrictEqual(states.map((state) => state.batch_phase), ['awaiting_explicit_resume']);
  assert.deepStrictEqual(failures, []);
  assert.doesNotMatch(JSON.stringify(message), /resume-existing|sourceBytes|path/i);
  assert.strictEqual(releaseLocalBatchExecutor(batch.batch_token, process.pid), false,
    'the confirmed worker exit already releases the exact executor lease');
  assert.strictEqual(discardIncompleteBatches({ confirmed: true }).ok, true);
});

test('an intake failure before a checkpoint produces only a fixed local notice', () => {
  const source = path.join(base, 'unreadable-private-source.txt');
  fs.writeFileSync(source, 'Kontakt: Hidden Example', 'utf8');
  const listeners = {};
  const notices = [];
  const child = {
    pid: process.pid,
    once(event, handler) { listeners[`once:${event}`] = handler; },
    on(event, handler) { listeners[`on:${event}`] = handler; },
    send(_value, callback) {
      listeners['on:message']?.({ type: 'local-intake-stopped', stage: 'before_checkpoint' });
      callback();
    },
    unref() {}, kill() {}
  };
  const result = startLocalIntakeExecutor([
    { name: path.basename(source), full: source, sourceBytes: fs.statSync(source).size }
  ], 'general', {
    forkProcess: () => child,
    showLocalIntakeNotice: (stage) => notices.push(stage)
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(notices, ['before_checkpoint']);
  assert.doesNotMatch(JSON.stringify({ result, notices }), /unreadable-private-source|Hidden Example|\.txt/u);
  listeners['once:exit']?.(1);
});

test('a resting intake state shows exactly one local next-action notice and exit adds no duplicate', () => {
  const source = path.join(base, 'resting-private-source.txt');
  fs.writeFileSync(source, 'Kontakt: Hidden Example', 'utf8');
  const listeners = {};
  const states = [];
  const failures = [];
  const child = {
    pid: process.pid,
    once(event, handler) { listeners[`once:${event}`] = handler; },
    on(event, handler) { listeners[`on:${event}`] = handler; },
    send(_value, callback) {
      listeners['on:message']?.({ type: 'local-intake-checkpoint-created' });
      listeners['on:message']?.({ type: 'local-intake-processing-started' });
      listeners['on:message']?.({
        type: 'local-intake-state', complete: false, batch_phase: 'awaiting_explicit_resume',
        batch_total: 1, released: 0, stopped: 0
      });
      callback();
    },
    unref() {}, kill() {}
  };
  const result = startLocalIntakeExecutor([
    { name: path.basename(source), full: source, sourceBytes: fs.statSync(source).size }
  ], 'general', {
    forkProcess: () => child,
    claimTerminalNotice: () => true,
    showBatchStateNotice: (state) => states.push(state),
    showLocalIntakeNotice: (stage) => failures.push(stage)
  });
  assert.strictEqual(result.ok, true);
  listeners['once:exit']?.(0);
  assert.deepStrictEqual(states.map((state) => state.batch_phase), ['awaiting_explicit_resume']);
  assert.deepStrictEqual(failures, []);
  assert.doesNotMatch(JSON.stringify(states), /resting-private-source|Hidden Example|token|path/u);
});

test('a final IPC state that arrives just after worker exit suppresses a false failure notice', () => {
  const source = path.join(base, 'exit-before-message.txt');
  fs.writeFileSync(source, 'Kontakt: Hidden Example', 'utf8');
  const listeners = {};
  const states = [];
  const failures = [];
  let finalizeExit;
  const child = {
    pid: process.pid,
    once(event, handler) { listeners[`once:${event}`] = handler; },
    on(event, handler) { listeners[`on:${event}`] = handler; },
    send(_value, callback) { callback(); },
    unref() {}, kill() {}
  };
  startLocalIntakeExecutor([
    { name: path.basename(source), full: source, sourceBytes: fs.statSync(source).size }
  ], 'general', {
    forkProcess: () => child,
    claimTerminalNotice: () => true,
    showBatchStateNotice: (state) => states.push(state),
    showLocalIntakeNotice: (stage) => failures.push(stage),
    scheduleExitFinalization: (callback) => { finalizeExit = callback; }
  });
  listeners['on:message']?.({ type: 'local-intake-checkpoint-created' });
  listeners['once:exit']?.(0);
  assert.strictEqual(typeof finalizeExit, 'function');
  listeners['on:message']?.({
    type: 'local-intake-state', complete: true, batch_phase: 'complete',
    batch_total: 1, released: 1, stopped: 0
  });
  finalizeExit();
  assert.deepStrictEqual(states.map((state) => state.batch_phase), ['complete']);
  assert.deepStrictEqual(failures, []);
});

test('a durable terminal checkpoint suppresses a false failure when final IPC is lost', () => {
  const source = path.join(base, 'durable-exit-state.txt');
  fs.writeFileSync(source, 'Kontakt: Hidden Example', 'utf8');
  const listeners = {};
  const states = [];
  const failures = [];
  let finalizeExit;
  const child = {
    pid: process.pid,
    once(event, handler) { listeners[`once:${event}`] = handler; },
    on(event, handler) { listeners[`on:${event}`] = handler; },
    send(_value, callback) { callback(); },
    unref() {}, kill() {}
  };
  startLocalIntakeExecutor([
    { name: path.basename(source), full: source, sourceBytes: fs.statSync(source).size }
  ], 'general', {
    forkProcess: () => child,
    claimTerminalNotice: () => true,
    readBatchProgress: () => ({
      complete: true, batch_phase: 'complete', batch_total: 1, released: 1, stopped: 0
    }),
    showBatchStateNotice: (state) => states.push(state),
    showLocalIntakeNotice: (stage) => failures.push(stage),
    scheduleExitFinalization: (callback) => { finalizeExit = callback; }
  });
  listeners['on:message']?.({ type: 'local-intake-checkpoint-created' });
  listeners['once:exit']?.(0);
  finalizeExit();
  assert.deepStrictEqual(states.map((state) => state.batch_phase), ['complete']);
  assert.deepStrictEqual(failures, []);
  assert.doesNotMatch(JSON.stringify(states), /durable-exit-state|Hidden Example|token|path/u);
});

done();
