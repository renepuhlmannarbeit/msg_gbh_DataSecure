'use strict';
// Real pause/owner records, with an explicit reentrant kernel-boundary model.
// The separate native gate exercises actual C exclusion in another process.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSuite } = require('./helpers');
const { createStandalonePause } = require('../plugins/data-secure/server/gateway/standalone-pause');
const { createBatchActiveLock } = require('../plugins/data-secure/server/gateway/batch-active-lock');
const { createBatchProgress } = require('../plugins/data-secure/server/gateway/batch-progress');
const { test, done, assert } = createSuite('Standalone pause control transaction');
const base = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'ds-pause-control-'));
const token = 'a'.repeat(64), state = () => ({ product_channel: 'standalone', token });
const fixed = code => Object.assign(Error(code), { code });
let sequence = 0;
function fixture(options = {}) {
  const root = path.join(base, 'root-' + (++sequence)), batches = path.join(root, 'batches');
  fs.mkdirSync(batches, { recursive: true });
  const file = path.join(batches, 'standalone-control.lock');
  let depth = 0, top = 0, nested = 0, clock = 0, waits = 0;
  const schemas = [], diagnostics = [];
  const guard = { assertHeld() { assert.ok(depth > 0); return true; } };
  function controlled(actual, callback) {
    assert.equal(actual, root);
    const outer = depth === 0;
    if (outer) { top++; options.beforeOuter?.(top); } else nested++;
    depth++;
    try { return callback(guard); } finally { depth--; if (outer) options.afterOuter?.(); }
  }
  const io = { ...fs, constants: fs.constants,
    openSync(name, ...args) { options.beforeOpen?.(name, file, ...args); return fs.openSync(name, ...args); },
    lstatSync(name, ...args) { options.beforeStat?.(name, file); return fs.lstatSync(name, ...args); },
    linkSync(from, to) { assert.ok(depth > 0); options.beforeLink?.(from, to, file);
      try { fs.linkSync(from, to); }
      catch (error) { options.afterLinkError?.(error, to, file); throw error; }
      if (to === file) schemas.push(JSON.parse(fs.readFileSync(to)).schema); },
    unlinkSync(target) { assert.ok(depth > 0); options.beforeUnlink?.(target, file); return fs.unlinkSync(target); }
  };
  const pause = createStandalonePause({ root: () => batches, fs: io, withOwnershipControl: controlled,
    ...(options.defaultDiagnostics ? {} : { onFailure: options.onFailure || (record => diagnostics.push(record)) }),
    now: () => clock, retryDelay(ms) { assert.equal(depth, 0); assert.equal(ms, 10); waits++; clock += 1000; options.wait?.(); } });
  function run(action, native = false) {
    const keys = ['EU_PRIVACY_DATA_ROOT', 'EU_PRIVACY_ROOT', 'DATASECURE_NATIVE_EXPORT_CHANNEL'];
    const prior = keys.map(key => process.env[key]);
    process.env.EU_PRIVACY_DATA_ROOT = root; process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
    process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = native ? '1' : '0';
    try { return action(); }
    finally { keys.forEach((key, i) => { if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i]; }); }
  }
  return { pause, run, root, batches, file, schemas, diagnostics, controlled,
    depth: () => depth, top: () => top, nested: () => nested, waits: () => waits };
}
for (const native of [false, true]) test('one reentrant transaction covers status/claim/request/resume, schema ' + (native ? '/2' : '/1'), () => {
  const f = fixture({ beforeOuter(attempt) { if (attempt > 1) throw fixed('OWNERSHIP_GUARD_BUSY'); } });
  f.run(() => {
    assert.equal(f.pause.claim(state(), () => { assert.equal(f.depth(), 1); assert.ok(fs.existsSync(f.file)); }), true);
    assert.equal(f.top(), 1); assert.equal(f.nested(), 0); assert.equal(f.waits(), 0);
    assert.equal(fs.existsSync(f.file), false);
    assert.deepEqual(f.schemas, ['datasecure-active-batch/' + (native ? '2' : '1')]);
  }, native);
  const status = fixture();
  status.run(() => {
    assert.equal(status.pause.requested(state()), false); assert.equal(fs.existsSync(status.file), false);
    assert.equal(status.top(), 1); assert.equal(status.nested(), 0);
    status.pause.request(state()); assert.equal(status.pause.requested(state()), true);
    let persisted = 0;
    const resumed = state(); assert.equal(status.pause.resume(resumed, () => { assert.equal(status.depth(), 1); persisted++; }), true);
    assert.equal(persisted, 1); assert.equal(status.pause.requested(resumed), false);
    assert.equal(fs.existsSync(status.file), false);
  }, native);
});
test('a first kernel Busy waits only outside the guard, then executes the action once', () => {
  const f = fixture({ beforeOuter(attempt) { if (attempt === 1) throw fixed('OWNERSHIP_GUARD_BUSY'); } });
  f.run(() => { let actions = 0; assert.equal(f.pause.claim(state(), () => { actions++; }), true);
    assert.equal(actions, 1); assert.equal(f.top(), 2); assert.equal(f.waits(), 1); assert.equal(fs.existsSync(f.file), false); }, true);
});
test('persistent kernel Busy is bounded and never creates the logical lock', () => {
  const f = fixture({ beforeOuter() { throw fixed('OWNERSHIP_GUARD_BUSY'); } });
  f.run(() => {
    assert.throws(() => f.pause.claim(state(), () => assert.fail('not acquired')), e => e.code === 'STANDALONE_PAUSE_CONTROL_BUSY');
    assert.equal(f.top(), 6); assert.equal(f.waits(), 5); assert.equal(fs.existsSync(f.file), false);
  }, true);
});
for (const code of ['OWNERSHIP_GUARD_UNSAFE', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'OWNERSHIP_GUARD_UNAVAILABLE',
  'OWNERSHIP_GUARD_ACCESS_DENIED', 'OWNERSHIP_GUARD_CLOSED']) test('hard native refusal is immediate: ' + code, () => {
  const original = fixed(code), f = fixture({ beforeOuter() { throw original; } });
  f.run(() => { assert.throws(() => f.pause.requested(state()), e => e === original);
    assert.equal(f.top(), 1); assert.equal(f.waits(), 0); assert.equal(fs.existsSync(f.file), false); }, true);
});
test('an action Busy/exception is never replayed and its own logical lock is released', () => {
  for (const code of ['OWNERSHIP_GUARD_BUSY', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED', 'PRIMARY_DOCUMENT_FAILURE']) {
    const original = fixed(code), f = fixture();
    f.run(() => { let actions = 0; assert.throws(() => f.pause.claim(state(), () => { actions++; throw original; }), e => e === original);
      assert.equal(actions, 1); assert.equal(f.top(), 1); assert.equal(f.waits(), 0); assert.equal(fs.existsSync(f.file), false); }, true);
  }
});
test('a reported post-transaction native close failure never replays the action', () => {
  const original = fixed('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED');
  const f = fixture({ afterOuter() { throw original; } });
  f.run(() => { let actions = 0;
    assert.throws(() => f.pause.claim(state(), () => { actions++; }), e => e === original);
    assert.equal(actions, 1); assert.equal(f.top(), 1); assert.equal(f.waits(), 0); assert.equal(fs.existsSync(f.file), false);
  }, true);
});
test('a live foreign factory cannot be released or adopted by pause control', () => {
  const f = fixture();
  f.run(() => {
    const owner = createBatchActiveLock({ withOwnershipControl: f.controlled, lockPath: () => f.file });
    assert.equal(owner.acquireActiveLock(token), true);
    const before = fs.readFileSync(f.file), identity = fs.lstatSync(f.file, { bigint: true });
    assert.throws(() => f.pause.claim(state(), () => assert.fail('foreign owner')), e => e.code === 'STANDALONE_PAUSE_CONTROL_BUSY');
    assert.ok(fs.readFileSync(f.file).equals(before)); assert.equal(fs.lstatSync(f.file, { bigint: true }).ino, identity.ino);
    assert.equal(f.waits(), 0); assert.equal(owner.releaseActiveLock(token), true);
  }, true);
});
test('the legacy live logical-lock contract still waits outside its unheld kernel adapter', () => {
  const f = fixture();
  f.run(() => {
    const owner = createBatchActiveLock({ withOwnershipControl: f.controlled, lockPath: () => f.file });
    assert.equal(owner.acquireActiveLock(token), true);
    assert.throws(() => f.pause.requested(state()), e => e.code === 'STANDALONE_PAUSE_CONTROL_BUSY');
    assert.equal(f.waits(), 5); assert.equal(owner.releaseActiveLock(token), true);
  });
});

for (const native of [false, true]) test('progress observes under the same root without logical publication, native=' + native, () => {
  let observing = false, writes = 0;
  const f = fixture({ beforeOpen(_name, _lock, flags) {
    if (observing) assert.equal(flags & (fs.constants.O_CREAT | fs.constants.O_WRONLY | fs.constants.O_RDWR), 0);
  },
    beforeLink() { if (observing) writes++; }, beforeUnlink() { if (observing) writes++; } });
  f.run(() => {
    const value = { ...state(), items: [{ status: 'released' }, { status: 'pending' }] };
    const progress = createBatchProgress({ deliveryPendingStatus: 'delivery_pending', deferredReviewStatus: 'deferred_review',
      mappingPendingStatus: 'mapping_pending', observePauseRequested: f.pause.observeRequested });
    // A foreign/malformed logical control record is irrelevant to observation;
    // it remains blocking for actual mutation and must not be adopted/removed.
    fs.writeFileSync(f.file, 'foreign malformed record');
    const before = fs.readFileSync(f.file), entries = fs.readdirSync(f.batches);
    observing = true;
    assert.equal(progress.publicProgress(value).pause_requested, false);
    f.controlled(f.root, () => assert.equal(f.pause.observeRequested(value), false));
    observing = false;
    assert.deepEqual(fs.readFileSync(f.file), before); assert.deepEqual(fs.readdirSync(f.batches), entries);
    assert.equal(writes, 0); assert.equal(f.waits(), 0); assert.ok(f.nested() > 0);
    assert.throws(() => f.pause.claim(value, () => assert.fail('foreign control still blocks mutation')));
    // Retain the evidence; only remove the exact own synthetic record here.
    assert.deepEqual(fs.readFileSync(f.file), before); fs.unlinkSync(f.file);
    assert.equal(f.pause.observeRequested(value), false);
    f.pause.request(value);
    observing = true;
    assert.equal(progress.publicProgress(value).pause_requested, true);
    observing = false;
    assert.equal(writes, 0);
    let claims = 0;
    assert.equal(f.pause.claim(value, () => { claims++; }), false);
    assert.equal(claims, 0, 'a pause accepted after an earlier observation still wins at the authoritative claim');
  }, native);
});

test('observer retains marker validation, root refusals and never converts uncertainty to false', () => {
  for (const code of ['OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'OWNERSHIP_GUARD_INTEGRITY_FAILED']) {
    const original = fixed(code), f = fixture({ beforeOuter() { throw original; } });
    f.run(() => { assert.throws(() => f.pause.observeRequested(state()), error => error === original);
      assert.equal(f.top(), 1); assert.equal(f.waits(), 0); }, true);
  }
  for (const record of ['{}', '{invalid', ' '.repeat(1025), JSON.stringify({ schema: 'datasecure-standalone-pause/1', token: 'b'.repeat(64), generation: 0 }),
    JSON.stringify({ schema: 'datasecure-standalone-pause/1', token, generation: 1 })]) {
    const f = fixture();
    f.run(() => {
      const marker = path.join(f.batches, token + '.pause-0'); fs.writeFileSync(marker, record);
      assert.throws(() => f.pause.observeRequested(state()), error => error.code === 'STANDALONE_PAUSE_CONTROL_INVALID');
      assert.equal(fs.existsSync(f.file), false); assert.equal(fs.readFileSync(marker, 'utf8'), record);
    }, true);
  }
  const f = fixture();
  f.run(() => {
    f.pause.request(state());
    const marker = path.join(f.batches, token + '.pause-0'), peer = path.join(f.batches, 'synthetic-peer');
    fs.linkSync(marker, peer);
    assert.throws(() => f.pause.observeRequested(state()), error => error.code === 'STANDALONE_PAUSE_CONTROL_INVALID');
    assert.equal(fs.existsSync(f.file), false); fs.unlinkSync(peer);
    assert.equal(f.pause.observeRequested(state()), true);
  }, true);
});

test('observer retries only pre-callback kernel Busy, outside the guard and without logical writes', () => {
  const original = fixed('OWNERSHIP_GUARD_BUSY');
  const transient = fixture({ beforeOuter(attempt) { if (attempt === 1) throw original; },
    beforeOpen() { assert.fail('missing-marker observer opens no writer'); } });
  transient.run(() => {
    assert.equal(transient.pause.observeRequested(state()), false);
    assert.equal(transient.top(), 2); assert.equal(transient.waits(), 1);
    assert.deepEqual(fs.readdirSync(transient.batches), []);
  }, true);
  const exhausted = fixture({ beforeOuter() { throw original; } });
  exhausted.run(() => {
    assert.throws(() => exhausted.pause.observeRequested(state()), error => error === original);
    assert.equal(exhausted.top(), 5); assert.equal(exhausted.waits(), 5);
    assert.deepEqual(fs.readdirSync(exhausted.batches), []);
  }, true);
  const after = fixture({ afterOuter() { throw original; } });
  after.run(() => {
    assert.throws(() => after.pause.observeRequested(state()), error => error === original);
    assert.equal(after.top(), 1); assert.equal(after.waits(), 0);
    assert.deepEqual(fs.readdirSync(after.batches), []);
  }, true);
});

test('observer rejects an exchanged marker at actual bound read open', () => {
  let exchange = false, marker;
  const f = fixture({ beforeOpen(name, _lock, flags) {
    if (exchange && name === marker && !(flags & fs.constants.O_CREAT)) {
      exchange = false; const bytes = fs.readFileSync(marker);
      fs.renameSync(marker, marker + '.original'); fs.writeFileSync(marker, bytes);
    }
  } });
  f.run(() => {
    f.pause.request(state()); marker = path.join(f.batches, token + '.pause-0'); exchange = true;
    assert.throws(() => f.pause.observeRequested(state()), error => error.code === 'STANDALONE_PAUSE_CONTROL_INVALID');
    assert.equal(exchange, false); assert.equal(fs.existsSync(f.file), false);
    assert.ok(fs.existsSync(marker + '.original'));
  }, true);
});

test('source EEXIST retries outside the guard when the owner vanishes before the collision read', () => {
  let f, finishOwner = false;
  f = fixture({ afterLinkError(error, to, file) {
    if (finishOwner && to === file && error.code === 'EEXIST') {
      finishOwner = false; fs.unlinkSync(file); // Own fixture: model the competing owner finishing.
    }
  } });
  f.run(() => {
    const owner = createBatchActiveLock({ withOwnershipControl: f.controlled, lockPath: () => f.file });
    owner.acquireActiveLock(token); finishOwner = true;
    let actions = 0;
    assert.equal(f.pause.claim(state(), () => { actions++; assert.equal(f.depth(), 1); }), true);
    assert.equal(actions, 1); assert.equal(f.waits(), 1); assert.equal(f.top(), 3);
    assert.equal(fs.existsSync(f.file), false);
  });
});

test('source EEXIST keeps its classification when the live owner vanishes before the pause catch', () => {
  let f, finishOwner = false;
  f = fixture({ afterOuter() {
    if (finishOwner) { finishOwner = false; fs.unlinkSync(f.file); }
  } });
  f.run(() => {
    const owner = createBatchActiveLock({ withOwnershipControl: f.controlled, lockPath: () => f.file });
    owner.acquireActiveLock(token); finishOwner = true;
    let actions = 0;
    assert.equal(f.pause.claim(state(), () => { actions++; }), true);
    assert.equal(actions, 1); assert.equal(f.waits(), 1); assert.equal(f.top(), 3);
    assert.equal(fs.existsSync(f.file), false);
  });
});

test('source malformed records and prepared-name EEXIST never receive a contention retry', () => {
  const malformed = fixture();
  malformed.run(() => {
    fs.writeFileSync(malformed.file, '{}');
    assert.throws(() => malformed.pause.claim(state(), () => assert.fail('unsafe owner')));
    assert.equal(malformed.waits(), 0); assert.equal(malformed.top(), 1);
    assert.equal(fs.readFileSync(malformed.file, 'utf8'), '{}');
  });
  const prepared = fixture({ beforeOpen(name, file) {
    if (name.startsWith(file + '.prepared-')) throw fixed('EEXIST');
  } });
  prepared.run(() => {
    assert.throws(() => prepared.pause.claim(state(), () => assert.fail('prepared collision')));
    assert.equal(prepared.waits(), 0); assert.equal(prepared.top(), 1);
    assert.equal(fs.existsSync(prepared.file), false);
  });
});

test('source action logical Busy is never replayed as an acquisition collision', () => {
  const f = fixture(), original = fixed('BATCH_ACTIVE_LOCK_BUSY');
  f.run(() => {
    let actions = 0;
    assert.throws(() => f.pause.claim(state(), () => { actions++; throw original; }), error => error === original);
    assert.equal(actions, 1); assert.equal(f.waits(), 0); assert.equal(f.top(), 1);
    assert.equal(fs.existsSync(f.file), false);
  });
});
test('malformed foreign records and non-busy publication I/O faults fail without waiting or stealing', () => {
  const f = fixture();
  f.run(() => {
    fs.writeFileSync(f.file, '{}'); const before = fs.readFileSync(f.file);
    assert.throws(() => f.pause.requested(state())); assert.equal(f.waits(), 0);
    assert.ok(fs.readFileSync(f.file).equals(before));
  }, true);
  const broken = fixture({ beforeUnlink(target, lock) { if (target === lock) throw fixed('EIO'); } });
  broken.run(() => { assert.throws(() => broken.pause.requested(state())); assert.equal(broken.waits(), 0); }, true);
});
test('unconfirmed release preserves the exact primary and reports only a fixed secondary diagnostic', () => {
  const f = fixture({ beforeUnlink(target, lock) { if (target === lock) throw fixed('OWNERSHIP_GUARD_UNSAFE'); } });
  const original = fixed('PRIMARY_DOCUMENT_FAILURE');
  f.run(() => {
    assert.throws(() => f.pause.claim(state(), () => { throw original; }), e => e === original);
    assert.deepEqual(f.diagnostics, [{ phase: 'processing', error_code: 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE' }]);
    assert.ok(Object.isFrozen(f.diagnostics[0]));
    assert.equal(f.top(), 1); assert.equal(f.waits(), 0); assert.ok(fs.existsSync(f.file));
  }, true);
});
test('a broken secondary diagnostic sink cannot replace the primary', () => {
  const f = fixture({ onFailure() { throw fixed('PRIVATE_DIAGNOSTIC_FAILURE'); },
    beforeUnlink(target, lock) { if (target === lock) throw fixed('OWNERSHIP_GUARD_UNSAFE'); } });
  const original = fixed('PRIMARY_DOCUMENT_FAILURE');
  f.run(() => { assert.throws(() => f.pause.claim(state(), () => { throw original; }), e => e === original);
    assert.equal(f.waits(), 0); assert.ok(fs.existsSync(f.file)); }, true);
});
test('the actual default secondary diagnostic uses the closed workflow channel without primary payload', () => {
  const f = fixture({ defaultDiagnostics: true,
    beforeUnlink(target, lock) { if (target === lock) throw fixed('OWNERSHIP_GUARD_UNSAFE'); } });
  const original = Object.assign(Error('PRIVATE_SENTINEL'), { code: 'PRIMARY_DOCUMENT_FAILURE' });
  f.run(() => {
    assert.throws(() => f.pause.claim(state(), () => { throw original; }), e => e === original);
    const records = require('../plugins/data-secure/server/gateway/workflow-diagnostics')._test.readWorkflowEvents({ dataRoot: f.root });
    assert.equal(records.length, 1); assert.equal(records[0].event, 'batch_worker_failed');
    assert.equal(records[0].phase, 'processing'); assert.equal(records[0].error_code, 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE');
    assert.doesNotMatch(JSON.stringify(records), /PRIVATE_SENTINEL|PRIMARY_DOCUMENT_FAILURE/u);
  }, true);
});
test('the real pause publisher makes one transient Link-Busy attempt without held sleep or action replay', () => {
  for (const native of [false, true]) {
    let links = 0, actions = 0, heldSleeps = 0;
    const f = fixture({ beforeLink(_from, to, lock) {
      if (to === lock && ++links === 1) throw fixed('EBUSY');
    } });
    f.run(() => {
      const previousWait = Atomics.wait;
      Atomics.wait = function (...args) {
        if (f.depth()) { heldSleeps++; return 'timed-out'; }
        return previousWait(...args);
      };
      try {
        // Real production publisher and real fixture I/O; only the first link
        // result is fault-injected. In particular no publisher/helper is mocked.
        assert.throws(() => f.pause.claim(state(), () => { actions++; }));
        assert.equal(links, 1); assert.equal(actions, 0); assert.equal(heldSleeps, 0);
        assert.equal(f.top(), 1); assert.equal(f.waits(), 0); assert.equal(fs.existsSync(f.file), false);
        // Only a separate explicit call retries, using a new acquisition.
        assert.equal(f.pause.claim(state(), () => { actions++; }), true);
        assert.equal(links, 2); assert.equal(actions, 1); assert.equal(heldSleeps, 0);
        assert.equal(f.top(), 2); assert.equal(f.waits(), 0); assert.equal(fs.existsSync(f.file), false);
      } finally { Atomics.wait = previousWait; }
    }, native);
  }
});
test('transient Unlink-Busy is one attempt, not a held backoff or an action replay', () => {
  let unlinks = 0, actions = 0, heldSleeps = 0;
  const f = fixture({ beforeUnlink(target, lock) {
    if (target === lock) { unlinks++; throw fixed('EBUSY'); }
  } });
  f.run(() => {
    const previousWait = Atomics.wait;
    Atomics.wait = function (...args) {
      if (f.depth()) { heldSleeps++; return 'timed-out'; }
      return previousWait(...args);
    };
    try {
      assert.throws(() => f.pause.claim(state(), () => { actions++; }), e => e.code === 'STANDALONE_PAUSE_CONTROL_INVALID');
      assert.equal(unlinks, 1); assert.equal(actions, 1); assert.equal(heldSleeps, 0); assert.equal(f.waits(), 0);
      const before = fs.readFileSync(f.file);
      assert.throws(() => f.pause.claim(state(), () => { actions++; }), e => e.code === 'STANDALONE_PAUSE_CONTROL_BUSY');
      assert.equal(actions, 1); assert.equal(unlinks, 1); assert.equal(f.waits(), 0);
      assert.ok(fs.readFileSync(f.file).equals(before), 'no later adoption or blind cleanup');
    } finally { Atomics.wait = previousWait; }
  }, true);
});
test('a byte-identical replacement is not a release capability', () => {
  const f = fixture();
  f.run(() => {
    assert.throws(() => f.pause.claim(state(), () => {
      const bytes = fs.readFileSync(f.file); fs.renameSync(f.file, f.file + '.own-original'); fs.writeFileSync(f.file, bytes);
    }), e => e.code === 'STANDALONE_PAUSE_CONTROL_INVALID');
    assert.ok(fs.existsSync(f.file)); assert.equal(f.waits(), 0);
  }, true);
});
test('async/Promise getters and claim actions are refused, with no logical lock left after action rejection', () => {
  const f = fixture();
  f.run(() => {
    let entered = 0;
    assert.throws(() => f.pause.request(async () => { entered++; return state(); }), e => e.code === 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
    assert.equal(entered, 0);
    assert.throws(() => f.pause.request(() => Promise.resolve(state())), e => e.code === 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
    assert.throws(() => f.pause.claim(state(), async () => { entered++; }), e => e.code === 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
    assert.equal(entered, 0); assert.equal(fs.existsSync(f.file), false);
    assert.throws(() => f.pause.claim(state(), () => Promise.resolve(true)), e => e.code === 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
    assert.equal(fs.existsSync(f.file), false); assert.equal(f.waits(), 0);
  }, true);
});
done(() => {
  // Fresh synthetic fixtures only; refuse links/special files before removal.
  function inspect(directory) { for (const entry of fs.readdirSync(directory)) {
    const target = path.join(directory, entry), stat = fs.lstatSync(target);
    assert.equal(stat.isSymbolicLink(), false);
    if (stat.isDirectory()) inspect(target); else assert.ok(stat.isFile() && stat.nlink === 1);
  } }
  inspect(base); fs.rmSync(base, { recursive: true });
});
