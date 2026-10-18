'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-active-lock-'));
process.env.LOCALAPPDATA = path.join(base, 'localapp');
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');

const { batchRoot } = require('../plugins/data-secure/server/gateway/batch-private-store');
const { createBatchActiveLock, ACTIVE_LOCK_BUSY } = require('../plugins/data-secure/server/gateway/batch-active-lock');
const { createBatchExecutorLease } = require('../plugins/data-secure/server/gateway/batch-executor-lease');
const { createBatchContinuation } = require('../plugins/data-secure/server/gateway/batch-continuation');
const { createBatchRecovery } = require('../plugins/data-secure/server/gateway/batch-recovery');
const { SafeError } = require('../plugins/data-secure/server/runtime');
const { _test } = require('../plugins/data-secure/server/gateway/batch');
const { test, done, assert } = createSuite('Active batch lock');

const tokenA = 'a'.repeat(64);
const tokenB = 'b'.repeat(64);
const tokenC = 'c'.repeat(64);

function lockValue(token, pid, lockId = token.slice(0, 32)) {
  return { schema: 'datasecure-active-batch/1', token, pid, created_at: '2026-08-25T10:00:00.000Z', lock_id: lockId };
}

function writeLock(target, token, pid, lockId) {
  fs.writeFileSync(target, `${JSON.stringify(lockValue(token, pid, lockId))}\n`, 'utf8');
}

function ioWithSwap(target, replacement, swapOnOpen) {
  let opens = 0;
  return {
    ...fs,
    constants: fs.constants,
    openSync(name, flags, mode) {
      if (name === target && !(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR)) && ++opens === swapOnOpen) {
        fs.unlinkSync(target);
        writeLock(target, replacement.token, replacement.pid, replacement.lockId);
      }
      return fs.openSync(name, flags, mode);
    }
  };
}

function ioWithTimestampDrift(target) {
  let targetStats = 0;
  return {
    ...fs,
    constants: fs.constants,
    fstatSync(descriptor, options) {
      const stat = fs.fstatSync(descriptor, options);
      if (++targetStats < 2) return stat;
      return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, {
        mtimeMs: stat.mtimeMs + (typeof stat.mtimeMs === 'bigint' ? 10_000n : 10_000),
        ctimeMs: stat.ctimeMs + (typeof stat.ctimeMs === 'bigint' ? 20_000n : 20_000)
      });
    }
  };
}

function ioWithTransientUnlink(target, code, failures = 1, beforeRetry) {
  let attempts = 0;
  return {
    ...fs,
    constants: fs.constants,
    unlinkSync(name) {
      if (name === target && attempts++ < failures) {
        beforeRetry?.(attempts);
        const error = new Error(code);
        error.code = code;
        throw error;
      }
      return fs.unlinkSync(name);
    }
  };
}

test('module extraction preserves the batch test facade', () => {
  const direct = createBatchActiveLock();
  assert.strictEqual(_test.activeLockPath(), direct.activeLockPath());
  assert.strictEqual(_test.validActiveLock(lockValue(tokenA, 100)), true);
  assert.strictEqual(_test.liveLocalExecutor({ local_executor_pid: process.pid }), true);
});

test('release never deletes a replacement lock from a newer owner', () => {
  fs.mkdirSync(batchRoot(), { recursive: true });
  const target = path.join(batchRoot(), 'active-processing.json');
  const lock = createBatchActiveLock({
    fs: ioWithSwap(target, { token: tokenB, pid: 222 }, 2),
    process: { pid: 111, kill() {} }
  });
  lock.acquireActiveLock(tokenA);
  assert.strictEqual(lock.releaseActiveLock(tokenA), false);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), lockValue(tokenB, 222));
  fs.unlinkSync(target);
});

test('release accepts timestamp drift for the same immutable lock identity', () => {
  fs.mkdirSync(batchRoot(), { recursive: true });
  const target = path.join(batchRoot(), 'active-processing.json');
  const lock = createBatchActiveLock({
    fs: ioWithTimestampDrift(target),
    process: { pid: 111, kill() {} }
  });
  lock.acquireActiveLock(tokenA);
  assert.strictEqual(lock.releaseActiveLock(tokenA), true);
  assert.strictEqual(fs.existsSync(target), false);
});

test('release retries bounded transient Windows unlink failures for the same lock only', () => {
  const target = path.join(batchRoot(), 'active-processing.json');
  const delays = [];
  const lock = createBatchActiveLock({
    fs: ioWithTransientUnlink(target, 'EPERM', 2),
    process: { pid: 111, kill() {} },
    retryDelay: (milliseconds) => delays.push(milliseconds)
  });
  lock.acquireActiveLock(tokenA);
  assert.strictEqual(lock.releaseActiveLock(tokenA), true);
  assert.deepStrictEqual(delays, [10, 20]);
  assert.strictEqual(fs.existsSync(target), false);
});

test('release remains bounded and never removes a replacement during a transient retry', () => {
  const target = path.join(batchRoot(), 'active-processing.json');
  const replacementId = 'e'.repeat(32);
  const lock = createBatchActiveLock({
    fs: ioWithTransientUnlink(target, 'EBUSY', 1, () => {
      fs.unlinkSync(target);
      writeLock(target, tokenB, 222, replacementId);
    }),
    process: { pid: 111, kill() {} },
    retryDelay: () => {}
  });
  lock.acquireActiveLock(tokenA);
  assert.strictEqual(lock.releaseActiveLock(tokenA), false);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), lockValue(tokenB, 222, replacementId));
  fs.unlinkSync(target);
});

test('release gives up after four transient failures without hanging', () => {
  const target = path.join(batchRoot(), 'active-processing.json');
  let delays = 0;
  const lock = createBatchActiveLock({
    fs: ioWithTransientUnlink(target, 'EACCES', 10),
    process: { pid: 111, kill() {} },
    retryDelay: () => { delays += 1; }
  });
  lock.acquireActiveLock(tokenA);
  assert.strictEqual(lock.releaseActiveLock(tokenA), false);
  assert.strictEqual(delays, 3);
  assert.strictEqual(fs.existsSync(target), true);
  fs.unlinkSync(target);
});

test('release rejects a replacement with identical owner fields but another lock id', () => {
  const target = path.join(batchRoot(), 'active-processing.json');
  const replacementId = 'f'.repeat(32);
  const lock = createBatchActiveLock({
    fs: ioWithSwap(target, { token: tokenA, pid: 111, lockId: replacementId }, 2),
    process: { pid: 111, kill() {} }
  });
  lock.acquireActiveLock(tokenA);
  assert.strictEqual(lock.releaseActiveLock(tokenA), false);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), lockValue(tokenA, 111, replacementId));
  fs.unlinkSync(target);
});

test('stale recovery never removes a lock replaced by a live owner', () => {
  const target = path.join(batchRoot(), 'active-processing.json');
  writeLock(target, tokenA, 111);
  const lock = createBatchActiveLock({
    fs: ioWithSwap(target, { token: tokenB, pid: 222 }, 2),
    process: {
      pid: 333,
      kill(pid) {
        if (pid === 111) { const error = new Error('dead'); error.code = 'ESRCH'; throw error; }
      }
    }
  });
  assert.throws(() => lock.acquireActiveLock(tokenC), /nicht sicher bereinigt|bereits verarbeitet/i);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), lockValue(tokenB, 222));
  fs.unlinkSync(target);
});

test('EPERM and unknown liveness errors remain blocking while ESRCH proves death', () => {
  const target = path.join(batchRoot(), 'active-processing.json');
  writeLock(target, tokenA, 111);
  for (const code of ['EPERM', 'EACCES']) {
    const lock = createBatchActiveLock({
      process: {
        pid: 333,
        kill() { const error = new Error(code); error.code = code; throw error; }
      }
    });
    assert.throws(() => lock.acquireActiveLock(tokenC), /bereits verarbeitet/i, code);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), lockValue(tokenA, 111), code);
  }
  fs.unlinkSync(target);
});

test('only a validated final-name EEXIST collision has the explicit logical Busy classification', () => {
  const target = path.join(batchRoot(), 'collision-live.json');
  const owner = createBatchActiveLock({ lockPath: () => target });
  const contender = createBatchActiveLock({ lockPath: () => target });
  owner.acquireActiveLock(tokenA);
  const before = fs.readFileSync(target);
  try {
    assert.throws(() => contender.withSynchronousActiveLock(tokenB, () => assert.fail('foreign owner')),
      error => error.code === ACTIVE_LOCK_BUSY);
    assert.deepEqual(fs.readFileSync(target), before);
  } finally { assert.equal(owner.releaseActiveLock(tokenA), true); }
});

test('a real EEXIST whose owner disappears before the collision read remains Busy without adopting an epoch', () => {
  const target = path.join(batchRoot(), 'collision-disappeared.json');
  writeLock(target, tokenA, process.pid);
  let collisions = 0, actions = 0;
  const contender = createBatchActiveLock({ lockPath: () => target,
    fs: { ...fs, constants: fs.constants, linkSync(from, to) {
      try { return fs.linkSync(from, to); }
      catch (error) {
        if (to === target && error.code === 'EEXIST') {
          collisions++;
          fs.unlinkSync(target); // Exact synthetic owner finishes at this seam.
        }
        throw error;
      }
    } }, retryDelay() { assert.fail('no held retry'); }
  });
  assert.throws(() => contender.withSynchronousActiveLock(tokenB, () => { actions++; }), error => error.code === ACTIVE_LOCK_BUSY);
  assert.equal(collisions, 1); assert.equal(actions, 0); assert.equal(fs.existsSync(target), false);
  assert.throws(() => contender.captureOwnedEpoch(tokenB), error => error.code === 'BATCH_OWNERSHIP_CHANGED');
  assert.equal(contender.withSynchronousActiveLock(tokenB, () => { actions++; return 23; }), 23);
  assert.equal(actions, 1); assert.equal(fs.existsSync(target), false);
});

test('malformed, hidden, foreign-schema and prepared-name collisions never become logical Busy', () => {
  for (const kind of ['malformed', 'hidden', 'prepared', 'foreign-schema', 'missing-parent']) {
    const target = path.join(batchRoot(), `collision-${kind}.json`);
    if (kind === 'malformed') fs.writeFileSync(target, '{}');
    if (['hidden', 'foreign-schema', 'missing-parent'].includes(kind)) writeLock(target, tokenA, process.pid);
    let missingParent = false;
    const io = { ...fs, constants: fs.constants,
      linkSync(from, to) {
        try { return fs.linkSync(from, to); }
        catch (error) { if (kind === 'missing-parent' && to === target) missingParent = true; throw error; }
      },
      lstatSync(name, ...args) {
        if (missingParent && name === path.dirname(target)) throw Object.assign(Error('parent disappeared'), { code: 'ENOENT' });
        return fs.lstatSync(name, ...args);
      },
      openSync(name, ...args) {
        if (kind === 'prepared' && name.startsWith(target + '.prepared-')) throw Object.assign(Error('prepared collision'), { code: 'EEXIST' });
        if (kind === 'hidden' && name === target) throw Object.assign(Error('hidden owner'), { code: 'EACCES' });
        return fs.openSync(name, ...args);
      }
    };
    const before = fs.existsSync(target) ? fs.readFileSync(target) : null;
    const previous = process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
    if (kind === 'foreign-schema') process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = '1';
    try {
      const contender = createBatchActiveLock({ lockPath: () => target, fs: io,
        withOwnershipControl(_root, action) { return action({ assertHeld: () => true }); } });
      assert.throws(() => contender.withSynchronousActiveLock(tokenB, () => assert.fail('unsafe owner')),
        error => error.code !== ACTIVE_LOCK_BUSY);
      if (before) assert.deepEqual(fs.readFileSync(target), before);
      else assert.equal(fs.existsSync(target), false);
    } finally {
      if (previous === undefined) delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
      else process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = previous;
      if (before) fs.unlinkSync(target);
    }
  }
});

test('publication I/O and metadata EEXIST are not branded as final-name contention', () => {
  for (const kind of ['link-io', 'metadata']) {
    const target = path.join(batchRoot(), `collision-io-${kind}.json`);
    const contender = createBatchActiveLock({ lockPath: () => target,
      fs: { ...fs, constants: fs.constants,
        linkSync(from, to) {
          if (kind === 'link-io') throw Object.assign(Error('publication failed'), { code: 'EIO' });
          return fs.linkSync(from, to);
        },
        lstatSync(name, ...args) {
          if (kind === 'metadata' && name === target) throw Object.assign(Error('metadata failed'), { code: 'EEXIST' });
          return fs.lstatSync(name, ...args);
        }
      }, onFailure() {} });
    assert.throws(() => contender.withSynchronousActiveLock(tokenB, () => assert.fail('unconfirmed publication')),
      error => error.code !== ACTIVE_LOCK_BUSY);
    if (fs.existsSync(target)) fs.unlinkSync(target); // Exact fresh synthetic publication only.
  }
});

test('both publication attempts retain only fixed OS and owner-record diagnostic codes without retrying', () => {
  const { diagnosticCode, readBatchExecutionDiagnostic } = require('../plugins/data-secure/server/gateway/batch-execution-diagnostic');
  for (const recovering of [false, true]) {
    for (const code of ['EIO', 'EACCES', 'EPERM', 'ENOSPC', 'EDQUOT', 'EROFS', 'EMFILE', 'ENFILE',
      'ENOENT', 'EBUSY', 'EXDEV', 'EEXIST', 'OWNERSHIP_RECORD_UNSAFE', 'OWNERSHIP_RECORD_CHANGED', 'OWNERSHIP_RECORD_UNCONFIRMED']) {
      const target = path.join(batchRoot(), `publication-diagnostic-${recovering}-${code}.json`);
      if (recovering) writeLock(target, tokenA, 111);
      let attempts = 0, actions = 0;
      const original = Object.assign(new Error('/private/customer-source.txt'), { code, path: '/private/customer-source.txt' });
      const owner = createBatchActiveLock({ lockPath: () => target,
        process: { pid: 222, kill() { throw Object.assign(Error('dead fixture'), { code: 'ESRCH' }); } },
        retryDelay() { assert.fail('diagnostic preservation cannot add a held retry'); },
        fs: { ...fs, constants: fs.constants, openSync(name, ...args) {
          if (name.startsWith(target + '.prepared-') && ++attempts === (recovering ? 2 : 1)) throw original;
          return fs.openSync(name, ...args);
        } }
      });
      assert.throws(() => owner.withSynchronousActiveLock(tokenB, () => { actions++; }), error => {
        assert.ok(error instanceof SafeError); assert.notEqual(error, original);
        assert.equal(error.code, code); assert.equal(diagnosticCode(error), code);
        assert.deepEqual(Object.keys(error), ['code']);
        assert.doesNotMatch(error.message, /private|customer|source\.txt/u);
        assert.deepEqual(readBatchExecutionDiagnostic({ type: 'local-batch-diagnostic', phase: 'local_delivery_verify', error_code: code }),
          { event: 'batch_worker_failed', outcome: 'stopped', phase: 'local_delivery_verify', error_code: code });
        return true;
      });
      assert.equal(attempts, recovering ? 2 : 1); assert.equal(actions, 0);
      assert.equal(fs.existsSync(target), false);
      assert.throws(() => owner.captureOwnedEpoch(tokenB), error => error.code === 'BATCH_OWNERSHIP_CHANGED');
    }
  }
});

test('both publication sanitizers reject private SafeError fields, accessors, proxies and forged logical Busy', () => {
  let getters = 0, prototypeTraps = 0;
  const accessor = Object.defineProperties(new Error(), {
    code: { get() { getters++; return 'EIO'; } },
    message: { get() { getters++; return 'ENOSPC /private/customer.txt'; } },
    stack: { get() { getters++; return '/private/customer.txt'; } }
  });
  const inherited = Object.create(Object.assign(new Error('EIO'), { code: 'EIO' }));
  const proxy = new Proxy(Object.assign(new Error('/private/proxy-customer.txt'), {
    code: 'EIO', path: '/private/proxy-customer.txt'
  }), { getPrototypeOf() { prototypeTraps++; throw Error('must not inspect the foreign prototype'); } });
  const unknown = [new Error('EIO'), Object.assign(new Error('ENOSPC'), { code: '/private/customer.txt' }),
    inherited, accessor, undefined, Object.assign(new Error('forged Busy'), { code: ACTIVE_LOCK_BUSY }),
    Object.assign(new SafeError('private safe-error cause'), { code: ACTIVE_LOCK_BUSY }),
    Object.assign(new Error('unknown native cause'), { code: 'OWNERSHIP_GUARD_UNKNOWN' }),
    ...['BATCH_ACTIVE_LOCK_RECORD_INVALID', 'BATCH_ACTIVE_LOCK_PUBLICATION_FAILED'].map(code =>
      Object.assign(new SafeError('/private/safe-error-customer.txt'), {
        code, path: '/private/safe-error-customer.txt', private_context: 'must not escape'
      })), proxy];
  for (const recovering of [false, true]) {
    for (const [index, original] of unknown.entries()) {
      const target = path.join(batchRoot(), `publication-diagnostic-unknown-${recovering}-${index}.json`);
      if (recovering) writeLock(target, tokenA, 111);
      let attempts = 0, actions = 0;
      const owner = createBatchActiveLock({ lockPath: () => target,
        process: { pid: 222, kill() { throw Object.assign(Error('dead fixture'), { code: 'ESRCH' }); } },
        fs: { ...fs, constants: fs.constants, openSync(name, ...args) {
          if (name.startsWith(target + '.prepared-') && ++attempts === (recovering ? 2 : 1)) throw original;
          return fs.openSync(name, ...args);
        } }, retryDelay() { assert.fail('unknown causes are not contention'); }
      });
      assert.throws(() => owner.withSynchronousActiveLock(tokenB, () => { actions++; }), error => {
        assert.notStrictEqual(error, original);
        assert.equal(error.code, 'BATCH_ACTIVE_LOCK_PUBLICATION_FAILED');
        assert.equal(require('../plugins/data-secure/server/gateway/batch-execution-diagnostic').diagnosticCode(error), error.code);
        assert.equal(error.message, recovering ? 'Ein anderer lokaler DataSecure-Stapel wird bereits verarbeitet.'
          : 'Die lokale Stapelsperre konnte nicht sicher angelegt werden.');
        assert.deepEqual(Object.keys(error), ['code']);
        assert.equal(Object.hasOwn(error, 'path'), false); assert.equal(Object.hasOwn(error, 'private_context'), false);
        assert.equal(Object.hasOwn(error, 'cause'), false);
        return true;
      });
      assert.equal(attempts, recovering ? 2 : 1); assert.equal(actions, 0); assert.equal(fs.existsSync(target), false);
      assert.throws(() => owner.captureOwnedEpoch(tokenB), error => error.code === 'BATCH_OWNERSHIP_CHANGED');
    }
  }
  assert.equal(getters, 0); assert.equal(prototypeTraps, 0);
});

test('recognized native publication refusals retain their exact error and closed ownership diagnostic', () => {
  const { diagnosticCode } = require('../plugins/data-secure/server/gateway/batch-execution-diagnostic');
  for (const [code, expected] of [['OWNERSHIP_GUARD_BUSY', 'STANDALONE_OWNERSHIP_CONTROL_BUSY'],
    ['OWNERSHIP_GUARD_UNSAFE', 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE'],
    ['OWNERSHIP_GUARD_CLOSE_UNCONFIRMED', 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED']]) {
    const target = path.join(batchRoot(), `publication-diagnostic-native-${code}.json`);
    const original = Object.assign(new Error('/private/native-refusal'), { code });
    let attempts = 0;
    const owner = createBatchActiveLock({ lockPath: () => target,
      fs: { ...fs, constants: fs.constants, openSync(name, ...args) {
        if (name.startsWith(target + '.prepared-')) { attempts++; throw original; }
        return fs.openSync(name, ...args);
      } }, retryDelay() { assert.fail('native publication refusal is not replayed'); }
    });
    assert.throws(() => owner.withSynchronousActiveLock(tokenA, () => assert.fail('failed acquire')), error => error === original);
    assert.equal(diagnosticCode(original), expected); assert.equal(attempts, 1); assert.equal(fs.existsSync(target), false);
  }
});

test('a visible matching-PID lock is not an own acquisition or a transferable epoch', () => {
  const target = path.join(batchRoot(), 'active-processing.json');
  const owner = createBatchActiveLock(), foreign = createBatchActiveLock();
  writeLock(target, tokenA, process.pid);
  try { assert.throws(() => owner.captureOwnedEpoch(tokenA), error => error.code === 'BATCH_OWNERSHIP_CHANGED'); }
  finally { fs.unlinkSync(target); }
  owner.acquireActiveLock(tokenA);
  try {
    const proof = owner.captureOwnedEpoch(tokenA);
    assert.ok(Object.isFrozen(proof)); assert.deepEqual(Object.keys(proof), []);
    assert.equal(owner.assertOwnedEpoch(proof), true);
    for (const fake of [{}, { ...proof }, JSON.parse(JSON.stringify(proof)), new Proxy({}, {})])
      assert.throws(() => owner.assertOwnedEpoch(fake), error => error.code === 'BATCH_OWNERSHIP_CHANGED');
    assert.throws(() => foreign.assertOwnedEpoch(proof), error => error.code === 'BATCH_OWNERSHIP_CHANGED');
    assert.throws(() => foreign.captureOwnedEpoch(tokenA), error => error.code === 'BATCH_OWNERSHIP_CHANGED');
  } finally { owner.releaseActiveLock(tokenA); }
});

test('release/reacquire and byte-identical file replacement revoke an old own epoch', () => {
  const target = path.join(batchRoot(), 'active-processing.json'), preserved = path.join(batchRoot(), 'old-epoch.json');
  const owner = createBatchActiveLock(); owner.acquireActiveLock(tokenA);
  const old = owner.captureOwnedEpoch(tokenA);
  assert.equal(owner.releaseActiveLock(tokenA), true);
  owner.acquireActiveLock(tokenA);
  try {
    assert.throws(() => owner.assertOwnedEpoch(old), error => error.code === 'BATCH_OWNERSHIP_CHANGED');
    const current = owner.captureOwnedEpoch(tokenA), bytes = fs.readFileSync(target);
    fs.renameSync(target, preserved); fs.writeFileSync(target, bytes);
    assert.throws(() => owner.assertOwnedEpoch(current), error => error.code === 'BATCH_OWNERSHIP_CHANGED');
    assert.equal(owner.releaseActiveLock(tokenA), false, 'release must not adopt the replaced pathname');
    assert.deepEqual(fs.readFileSync(target), bytes);
  } finally { if (fs.existsSync(target)) fs.unlinkSync(target); fs.unlinkSync(preserved); }
});

test('the acquisition binds file identity before the first epoch capture, not from a later pathname', () => {
  const target = path.join(batchRoot(), 'active-processing.json'), preserved = path.join(batchRoot(), 'unseen-old-epoch.json');
  const owner = createBatchActiveLock(); owner.acquireActiveLock(tokenA);
  const bytes = fs.readFileSync(target); fs.renameSync(target, preserved); fs.writeFileSync(target, bytes);
  try { assert.throws(() => owner.captureOwnedEpoch(tokenA), error => error.code === 'BATCH_OWNERSHIP_CHANGED'); }
  finally { if (fs.existsSync(target)) fs.unlinkSync(target); fs.unlinkSync(preserved); }
});

test('capture rejects an observed named hardlink even when the earlier FD stat was single-linked', () => {
  const target = path.join(batchRoot(), 'active-processing.json'), alias = path.join(batchRoot(), 'epoch-link.json');
  let inject = false;
  const owner = createBatchActiveLock({ fs: { ...fs, constants: fs.constants,
    lstatSync(name, ...args) {
      if (inject && name === target) { inject = false; fs.linkSync(target, alias); }
      return fs.lstatSync(name, ...args);
    } } });
  owner.acquireActiveLock(tokenA); inject = true;
  try { assert.throws(() => owner.captureOwnedEpoch(tokenA), error => error.code === 'BATCH_OWNERSHIP_CHANGED'); }
  finally { fs.unlinkSync(alias); fs.unlinkSync(target); }
});

test('an old epoch-bound finally cannot release a later acquisition by the same PID and token', () => {
  const target = path.join(batchRoot(), 'active-processing.json'), owner = createBatchActiveLock();
  owner.acquireActiveLock(tokenA); const old = owner.captureOwnedEpoch(tokenA); owner.releaseActiveLock(tokenA);
  owner.acquireActiveLock(tokenA); const current = owner.captureOwnedEpoch(tokenA), bytes = fs.readFileSync(target);
  try {
    assert.equal(owner.releaseOwnedEpoch(old), false); assert.deepEqual(fs.readFileSync(target), bytes);
    assert.equal(owner.assertOwnedEpoch(current), true);
  } finally { owner.releaseActiveLock(tokenA); }
});

test('separated transitions reproduce release Busy; one synchronous transaction leaves no live owner', () => {
  const target = path.join(batchRoot(), 'sync-critical.json');
  const busy = Object.assign(new Error('fixed refusal'), { code: 'OWNERSHIP_GUARD_BUSY' });
  let entries = 0, callbacks = 0;
  const control = (_root, action) => {
    if (++entries > 1) throw busy;
    return action({ assertHeld: () => true });
  };
  const separated = createBatchActiveLock({ lockPath: () => target, withOwnershipControl: control });
  separated.acquireActiveLock(tokenA);
  assert.throws(() => separated.releaseActiveLock(tokenA), error => error === busy);
  assert.equal(fs.existsSync(target), true, 'old separated release never reached unlink');
  fs.unlinkSync(target); // This exact freshly-created synthetic fixture only.
  entries = 0;
  const atomic = createBatchActiveLock({ lockPath: () => target, withOwnershipControl: control });
  assert.equal(atomic.withSynchronousActiveLock(tokenA, () => {
    callbacks++;
    assert.equal(atomic.readActiveLock().pid, process.pid);
    assert.equal(atomic.readActiveLock().token, tokenA);
    return 17;
  }), 17);
  assert.equal(entries, 1); assert.equal(callbacks, 1);
  assert.equal(fs.existsSync(target), false);
});

test('synchronous transaction preserves action failures including throw undefined and clears its exact owner', () => {
  const target = path.join(batchRoot(), 'sync-primary.json');
  const owner = createBatchActiveLock({ lockPath: () => target });
  for (const primary of [Object.assign(new Error('primary'), { code: 'RESIDUAL_PII' }), undefined]) {
    let caught = false;
    try { owner.withSynchronousActiveLock(tokenA, () => { throw primary; }); }
    catch (error) { caught = true; assert.equal(error, primary); }
    assert.equal(caught, true); assert.equal(fs.existsSync(target), false);
  }
});

test('async functions and thenables cannot escape a synchronous active-lock lifetime', () => {
  const target = path.join(batchRoot(), 'sync-async.json');
  let entries = 0, invoked = 0;
  const owner = createBatchActiveLock({ lockPath: () => target,
    withOwnershipControl(_root, action) { entries++; return action({ assertHeld: () => true }); } });
  assert.throws(() => owner.withSynchronousActiveLock(tokenA, async () => { invoked++; }),
    error => error.code === 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
  assert.equal(entries, 0); assert.equal(invoked, 0);
  assert.throws(() => owner.withSynchronousActiveLock(tokenA, () => ({ then() {} })),
    error => error.code === 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN');
  assert.equal(fs.existsSync(target), false);
  const primary = new Error('then getter');
  assert.throws(() => owner.withSynchronousActiveLock(tokenA, () => ({ get then() { throw primary; } })),
    error => error === primary);
  assert.equal(fs.existsSync(target), false);
});

test('synchronous transaction cannot adopt a live matching PID or release a newer own epoch', () => {
  const target = path.join(batchRoot(), 'sync-epochs.json');
  const owner = createBatchActiveLock({ lockPath: () => target });
  writeLock(target, tokenA, process.pid);
  const foreign = fs.readFileSync(target);
  assert.throws(() => owner.withSynchronousActiveLock(tokenA, () => assert.fail('foreign owner')));
  assert.deepEqual(fs.readFileSync(target), foreign); fs.unlinkSync(target);
  let newer;
  assert.throws(() => owner.withSynchronousActiveLock(tokenA, () => {
    assert.equal(owner.releaseActiveLock(tokenA), true);
    owner.acquireActiveLock(tokenA); newer = owner.captureOwnedEpoch(tokenA);
  }), error => error.code === 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED');
  assert.equal(owner.assertOwnedEpoch(newer), true);
  assert.equal(owner.releaseOwnedEpoch(newer), true);
});

test('synchronous transaction has one unlink attempt, no backoff, and never erases a primary error', () => {
  const target = path.join(batchRoot(), 'sync-unlink.json');
  let attempts = 0, delays = 0;
  const owner = createBatchActiveLock({ lockPath: () => target, retryDelay() { delays++; },
    fs: { ...fs, constants: fs.constants, unlinkSync(name) {
      if (name === target) { attempts++; throw Object.assign(new Error('fixed unlink failure'), { code: 'EPERM' }); }
      return fs.unlinkSync(name);
    } } });
  assert.throws(() => owner.withSynchronousActiveLock(tokenA, () => true),
    error => error.code === 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED');
  assert.equal(attempts, 1); assert.equal(delays, 0); assert.equal(fs.existsSync(target), true);
  fs.unlinkSync(target);
  const primary = new Error('primary journal failure');
  assert.throws(() => owner.withSynchronousActiveLock(tokenA, () => { throw primary; }), error => error === primary);
  assert.equal(attempts, 2); assert.equal(delays, 0); fs.unlinkSync(target);
});

test('synchronous publication does not retry transient link failures inside the kernel guard', () => {
  const target = path.join(batchRoot(), 'sync-link.json');
  let attempts = 0;
  const owner = createBatchActiveLock({ lockPath: () => target,
    fs: { ...fs, constants: fs.constants, linkSync(from, to) {
      if (to === target) { attempts++; throw Object.assign(new Error('fixed link failure'), { code: 'EBUSY' }); }
      return fs.linkSync(from, to);
    } } });
  assert.throws(() => owner.withSynchronousActiveLock(tokenA, () => assert.fail('failed acquire')));
  assert.equal(attempts, 1); assert.equal(fs.existsSync(target), false);
});

test('secondary cleanup refusal has a closed frozen diagnostic and a throwing sink cannot replace the primary', () => {
  const target = path.join(batchRoot(), 'sync-secondary.json');
  const observed = [];
  for (const [primary, throws] of [[new Error('private primary content'), false],
    [new Error('private primary content'), true], [undefined, true]]) {
    const owner = createBatchActiveLock({ lockPath: () => target,
      fs: { ...fs, constants: fs.constants, unlinkSync(name) {
        if (name === target) throw Object.assign(new Error('/private/customer.txt'), { code: 'EPERM', pid: 9999 });
        return fs.unlinkSync(name);
      } },
      onFailure(record) {
        assert.equal(Object.isFrozen(record), true);
        observed.push(record);
        if (throws) throw new Error('private diagnostic sink failure');
      }
    });
    assert.equal(owner.withSynchronousActiveLock.length, 2, 'onFailure belongs to factory deps, not a third transaction argument');
    let caught = false;
    try { owner.withSynchronousActiveLock(tokenA, () => { throw primary; }); }
    catch (error) { caught = true; assert.equal(error, primary); }
    assert.equal(caught, true);
    assert.equal(fs.existsSync(target), true);
    fs.unlinkSync(target); // Only this exact freshly-created synthetic owner.
  }
  assert.deepEqual(observed, Array.from({ length: 3 }, () => ({ phase: 'processing',
    error_code: 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED' })));
  assert.doesNotMatch(JSON.stringify(observed), /private|customer|9999|primary|pid|path/u);
});

test('secondary guard errors use the real closed normalization and disclose no unknown or accessor cause', () => {
  const target = path.join(batchRoot(), 'sync-secondary-guard.json');
  const primary = new Error('primary');
  const observed = [];
  let getters = 0;
  const accessor = Object.defineProperty(new Error('private accessor'), 'code', {
    get() { getters++; return 'OWNERSHIP_GUARD_BUSY'; }
  });
  for (const [secondary, expected] of [
    [Object.assign(new Error('private native cause'), { code: 'OWNERSHIP_GUARD_UNSAFE' }), 'STANDALONE_OWNERSHIP_STORAGE_UNSAFE'],
    [Object.assign(new Error('private native cause'), { code: 'OWNERSHIP_GUARD_BUSY' }), 'STANDALONE_OWNERSHIP_CONTROL_BUSY'],
    // The existing unlink protocol first converts an unrecognized refusal
    // into its fixed unconfirmed-cleanup error; private causes never escape.
    [Object.assign(new Error('private unknown cause'), { code: '/private/customer.txt' }), 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED']
  ]) {
    let refuse = false;
    const owner = createBatchActiveLock({ lockPath: () => target,
      withOwnershipControl(_root, action) { return action({ assertHeld() { if (refuse) throw secondary; } }); },
      onFailure(record) { observed.push(record); }
    });
    assert.throws(() => owner.withSynchronousActiveLock(tokenA, () => { refuse = true; throw primary; }), error => error === primary);
    assert.deepEqual(observed.at(-1), { phase: 'processing', error_code: expected });
    assert.equal(fs.existsSync(target), true);
    fs.unlinkSync(target);
  }
  assert.equal(require('../plugins/data-secure/server/gateway/batch-execution-diagnostic').diagnosticCode(accessor), 'INTERNAL_FAILURE');
  assert.equal(getters, 0);
});

test('a close failure after the guarded callback cannot leave a logical owner or acknowledge success', () => {
  const target = path.join(batchRoot(), 'sync-close.json');
  const refused = Object.assign(new Error('fixed close failure'), { code: 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED' });
  const owner = createBatchActiveLock({ lockPath: () => target, withOwnershipControl(_root, action) {
    action({ assertHeld: () => true }); throw refused;
  } });
  assert.throws(() => owner.withSynchronousActiveLock(tokenA, () => true), error => error === refused);
  assert.equal(fs.existsSync(target), false);
});

// Real owner-record and journal-file I/O with an explicitly injected kernel
// lifetime model. This verifies the production callers, not OS competition.
function synchronousCallerFixture(name, options = {}) {
  const target = path.join(batchRoot(), `${name}-active.json`);
  const journal = path.join(batchRoot(), `${name}-journal.json`);
  let held = false, entries = 0, writes = 0;
  const guard = { assertHeld() { assert.equal(held, true); } };
  const owner = createBatchActiveLock({ lockPath: () => target,
    withOwnershipControl(_root, action) {
      assert.equal(held, false, 'only the outer acquisition is used');
      entries++;
      if (options.acquireError) throw options.acquireError;
      held = true;
      let result, primary, failed = false;
      try { result = action(guard); }
      catch (error) { primary = error; failed = true; }
      finally { held = false; }
      if (failed) throw primary;
      if (options.closeError) throw options.closeError;
      return result;
    }
  });
  const initial = { token: tokenA, product_channel: 'standalone', expires_at: '2099-01-01T00:00:00.000Z',
    remaining: 1, items: [{ status: 'retryable' }], ...options.state };
  fs.writeFileSync(journal, JSON.stringify(initial));
  const assertTransaction = () => {
    guard.assertHeld();
    assert.equal(owner.readActiveLock().pid, process.pid);
    assert.equal(fs.existsSync(target), true);
  };
  const readState = () => {
    assertTransaction();
    if (options.readError) throw options.readError;
    return JSON.parse(fs.readFileSync(journal, 'utf8'));
  };
  const deps = {
    SafeError, withSynchronousActiveLock: owner.withSynchronousActiveLock,
    acquireActiveLock() { assert.fail('separated acquire must not be used'); },
    releaseActiveLock() { assert.fail('separated release must not be used'); },
    readState, readStateForMaintenance: readState,
    writeState(value) {
      assertTransaction(); writes++;
      if (options.writeError) throw options.writeError;
      fs.writeFileSync(journal, JSON.stringify(value));
    },
    publicProgress(value) { assertTransaction(); return { complete: false, remaining: value.remaining }; },
    currentPid: () => 222, // explicit self-worker identity in this IO/kernel MODEL
    processAlive: pid => pid === 222,
    processInstanceIdentity: pid => pid === 222 ? '2'.repeat(64) : null,
    liveLocalExecutor: () => false
  };
  return { deps, owner, target, journal, assertTransaction,
    state: () => JSON.parse(fs.readFileSync(journal, 'utf8')),
    counts: () => ({ entries, writes, held }) };
}

test('real lease callers keep claim and exact-birth release inside one guarded file transaction each', () => {
  const value = synchronousCallerFixture('caller-lease');
  const lease = createBatchExecutorLease(value.deps);
  assert.equal(lease.claimLocalBatchExecutor(tokenA, 222).ok, true);
  assert.equal(value.state().local_executor_pid, 222);
  assert.equal(fs.existsSync(value.target), false);
  assert.deepEqual(value.counts(), { entries: 1, writes: 1, held: false });
  assert.equal(lease.releaseLocalBatchExecutor(tokenA, 333), false);
  assert.equal(value.state().local_executor_pid, 222, 'foreign birth/PID never clears the lease');
  assert.equal(lease.releaseLocalBatchExecutor(tokenA, 222), true);
  assert.equal(value.state().local_executor_pid, undefined);
  assert.equal(fs.existsSync(value.target), false);
  assert.deepEqual(value.counts(), { entries: 2, writes: 2, held: false });
});

test('real lease transaction keeps primary errors and nonthrowing exit cleanup after a close refusal', () => {
  const closeError = Object.assign(new Error('fixed close refusal'), { code: 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED' });
  const primary = new Error('primary journal refusal');
  const failed = synchronousCallerFixture('caller-lease-primary', { readError: primary, closeError });
  assert.throws(() => createBatchExecutorLease(failed.deps).claimLocalBatchExecutor(tokenA, 222), error => error === primary);
  assert.equal(fs.existsSync(failed.target), false);
  const releasing = synchronousCallerFixture('caller-lease-close', { closeError,
    state: { local_executor_pid: 222, local_executor_birth_id: '2'.repeat(64) } });
  assert.equal(createBatchExecutorLease(releasing.deps).releaseLocalBatchExecutor(tokenA, 222), false);
  assert.equal(releasing.state().local_executor_pid, undefined, 'durable change is not a success ACK');
  assert.equal(fs.existsSync(releasing.target), false);
});

function continuationFor(value, active = new Set()) {
  return createBatchContinuation({ ...value.deps, active,
    assertLocalExecutorAccess: value.assertTransaction,
    recoverableBatchStates: () => [value.deps.readState()],
    reconcilePublishedItems() { value.assertTransaction(); return false; },
    reconcilePendingMappings: () => false,
    markInterruptedItemsRetryable: () => 0
  });
}

test('real resume and explicit standalone continuation release their own file before leaving the same guard', () => {
  for (const method of ['resumeBatch', 'continueStandaloneBatch']) {
    const value = synchronousCallerFixture(`caller-${method}`);
    const continuation = continuationFor(value);
    assert.equal(continuation[method](tokenA).ok, true);
    assert.equal(value.state().items[0].status, 'pending');
    assert.equal(fs.existsSync(value.target), false);
    assert.deepEqual(value.counts(), { entries: 1, writes: 1, held: false });
  }
});

test('real continuation keeps native refusal identities and clears its active set on action failure', () => {
  const refused = Object.assign(new Error('fixed native refusal'), { code: 'OWNERSHIP_GUARD_UNSAFE' });
  for (const stage of ['acquireError', 'readError', 'closeError']) {
    const value = synchronousCallerFixture(`caller-continuation-${stage}`, { [stage]: refused });
    const active = new Set();
    const continuation = continuationFor(value, active);
    assert.throws(() => continuation.continueStandaloneBatch(tokenA), error => error === refused);
    assert.equal(active.size, 0);
    assert.equal(fs.existsSync(value.target), false);
  }
});

function recoveryFor(value) {
  return createBatchRecovery({ ...value.deps,
    io: { readdirSync() {
      value.assertTransaction();
      assert.equal(fs.readdirSync(path.dirname(value.journal)).includes(path.basename(value.journal)), true);
      return [{ name: `${tokenA}.json`, isFile: () => true }];
    } },
    batchRoot: () => path.dirname(value.journal),
    randomBytes: () => Buffer.alloc(32, 4), nowMs: () => Date.parse('2026-10-18T12:00:00Z'),
    reconcilePublishedItems() { value.assertTransaction(); return false; },
    reconcilePendingMappings: () => false,
    markInterruptedItemsRetryable: () => 0,
    retryReleasedWorkCopyCleanup: () => ({ changed: false }),
    safeRemoveWorkDirectory() { assert.fail('unexpired fixture must not be removed'); },
    removeState() { assert.fail('unexpired fixture must not be removed'); }
  });
}

test('real recovery and expiry scans retain one native lifetime through enumeration and exact own cleanup', () => {
  for (const method of ['recoverBatches', 'cleanupExpiredBatchSnapshots']) {
    const value = synchronousCallerFixture(`caller-${method}`);
    const result = recoveryFor(value)[method]();
    assert.equal(result.skipped_active, false); assert.equal(result.failures, 0);
    assert.equal(fs.existsSync(value.target), false);
    assert.deepEqual(value.counts(), { entries: 1, writes: 0, held: false });
  }
});

test('real maintenance skips only acquire contention and exposes hard acquisition or close refusals', () => {
  for (const method of ['recoverBatches', 'cleanupExpiredBatchSnapshots']) {
    for (const code of ['OWNERSHIP_GUARD_BUSY', 'OWNERSHIP_GUARD_UNSAFE', 'OWNERSHIP_GUARD_UNAVAILABLE']) {
      const acquireError = Object.assign(new Error('fixed native refusal'), { code });
      const value = synchronousCallerFixture(`caller-${method}-${code}`, { acquireError });
      if (code === 'OWNERSHIP_GUARD_BUSY') assert.equal(recoveryFor(value)[method]().skipped_active, true);
      else assert.throws(() => recoveryFor(value)[method](), error => error === acquireError);
      assert.equal(fs.existsSync(value.target), false);
    }
    const closeError = Object.assign(new Error('fixed close refusal'), { code: 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED' });
    const value = synchronousCallerFixture(`caller-${method}-close`, { closeError });
    assert.throws(() => recoveryFor(value)[method](), error => error === closeError);
    assert.equal(fs.existsSync(value.target), false);
  }
});

test('native caller wiring cannot silently select the separated legacy test adapter', () => {
  if (!['win32', 'darwin'].includes(process.platform)) return;
  const value = synchronousCallerFixture('caller-missing-wiring');
  const missing = { ...value.deps, withSynchronousActiveLock: undefined };
  const lease = createBatchExecutorLease(missing);
  const continuation = createBatchContinuation({ ...missing, active: new Set() });
  const recovery = createBatchRecovery(missing);
  const previous = process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
  try {
    process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = '1';
    const refusal = error => error.code === 'OWNERSHIP_GUARD_UNAVAILABLE';
    assert.throws(() => lease.claimLocalBatchExecutor(tokenA, 222), refusal);
    assert.equal(lease.releaseLocalBatchExecutor(tokenA, 222), false);
    assert.throws(() => continuation.resumeBatch(tokenA), refusal);
    assert.throws(() => continuation.continueStandaloneBatch(tokenA), refusal);
    assert.throws(() => recovery.recoverBatches(), refusal);
    assert.throws(() => recovery.cleanupExpiredBatchSnapshots(), refusal);
    assert.deepEqual(value.counts(), { entries: 0, writes: 0, held: false });
  } finally {
    if (previous === undefined) delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
    else process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = previous;
  }
});

try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* best effort */ }
done();
