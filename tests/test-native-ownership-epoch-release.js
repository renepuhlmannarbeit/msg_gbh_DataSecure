'use strict';
// Explicit native integration gate, NOT an ordinary source/model test.
// Apply the production retry helper first. Run only with packaged Node 22.23.2
// and an explicit locally built native-guard build-manifest.json.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
if (process.version !== 'v22.23.2' || !['win32', 'darwin'].includes(process.platform))
  throw Error('NATIVE_EPOCH_GATE_TARGET_REQUIRED');
if (process.argv.length !== 3) throw Error('NATIVE_EPOCH_GATE_MANIFEST_REQUIRED');
const { SafeError } = require('../plugins/data-secure/server/runtime');
const { releaseOwnedEpochWithBusyRetry } = require('../plugins/data-secure/server/gateway/batch-lock-release');
assert.equal(typeof releaseOwnedEpochWithBusyRetry, 'function',
  'Apply the production releaseOwnedEpochWithBusyRetry helper before this gate');
const { createBatchActiveLock } = require('../plugins/data-secure/server/gateway/batch-active-lock');
const { configureOwnershipControl } = require('../plugins/data-secure/server/core/ownership-control');
const { createPrivateFixture, participant } = require('./helpers/native-ownership-epoch-release-fixture.cjs');
const manifestPath = path.resolve(process.argv[2]), manifestStat = fs.lstatSync(manifestPath);
assert.ok(manifestStat.isFile() && !manifestStat.isSymbolicLink() && manifestStat.size > 0 && manifestStat.size < 65536);
const artifact = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).verified_artifact;
configureOwnershipControl(artifact); // Explicit test manifest; never a product trust override.
const saved = { root: process.env.EU_PRIVACY_DATA_ROOT, workspace: process.env.EU_PRIVACY_ROOT,
  native: process.env.DATASECURE_NATIVE_EXPORT_CHANNEL, pin: process.env.DATASECURE_OWNERSHIP_GUARD_SHA256 };
process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = '1';
delete process.env.DATASECURE_OWNERSHIP_GUARD_SHA256;
const TOKEN = 'e'.repeat(64), BACKOFFS = [10, 25, 50, 100];
const fixed = code => Object.assign(Error(code), { code });
let fixture, holder, childTermination = null, assertions = 0, lifecycleModelCases = 0;
let failure = null, completed = false, cleanup = false;
const check = (value, expected) => { assert.deepEqual(value, expected); assertions++; };
const identical = (value, expected) => { assert.strictEqual(value, expected); assertions++; };
const same = (stat, expected) => stat.dev === expected.dev && stat.ino === expected.ino &&
  stat.birthtimeNs === expected.birthtimeNs && stat.nlink === expected.nlink && stat.size === expected.size;
const tick = () => new Promise(resolve => setImmediate(resolve));
function lockSnapshot(file) { return { stat: fs.lstatSync(file, { bigint: true }), bytes: fs.readFileSync(file) }; }
function unchanged(file, before) {
  check(same(fs.lstatSync(file, { bigint: true }), before.stat), true);
  check(fs.readFileSync(file).equals(before.bytes), true);
}
function own(root) {
  process.env.EU_PRIVACY_DATA_ROOT = root;
  process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
  const target = path.join(root, 'batches', 'active-processing.json');
  let unlinks = 0;
  const io = { ...fs, constants: fs.constants, unlinkSync(file) {
    if (path.resolve(file) === target) unlinks++;
    return fs.unlinkSync(file);
  } };
  const owner = createBatchActiveLock({ fs: io }); // Real PID, real guard, no ownership injection.
  check(owner.acquireActiveLock(TOKEN), true);
  const epoch = owner.captureOwnedEpoch(TOKEN);
  check(owner.assertOwnedEpoch(epoch), true);
  const before = lockSnapshot(target);
  check(JSON.parse(before.bytes).pid, process.pid);
  return { owner, epoch, target, before, unlinks: () => unlinks };
}
async function bindHolder(root) {
  const initialized = await holder.request('initialize', { artifact, root });
  check(initialized.node, 'v22.23.2');
  check(await holder.request('acquire'), { acquired: true });
  check(await holder.request('assert'), true);
}
async function releaseHolder() {
  check(await holder.request('release'), true); // ACK after C unlock/close.
  check(await holder.request('close'), true);
}
function rejecting(code) {
  return error => error instanceof SafeError && (code === undefined || error.code === code);
}
async function positive(mapped) {
  const state = own(fixture.root()), anchor = path.join(path.dirname(path.dirname(state.target)), 'ownership-control.lock');
  const anchorBefore = fs.lstatSync(anchor, { bigint: true });
  await bindHolder(path.dirname(path.dirname(state.target)));
  let attempts = 0;
  const delays = [], failures = [];
  const released = await releaseOwnedEpochWithBusyRetry(proof => {
    identical(proof, state.epoch); attempts++;
    try { return state.owner.releaseOwnedEpoch(proof); }
    catch (error) {
      check(error.code, 'OWNERSHIP_GUARD_BUSY');
      if (mapped) throw fixed('STANDALONE_OWNERSHIP_CONTROL_BUSY');
      throw error;
    }
  }, state.epoch, SafeError, false, {
    async delay(ms) {
      delays.push(ms);
      check(state.unlinks(), 0); unchanged(state.target, state.before);
      check(await holder.request('assert'), true);
      // Deliberately foreign test holder spans this orchestration await.
      // Parent A holds NO native guard over the production helper's await:
      // its failed tryAcquire already returned before this seam is entered.
      await releaseHolder();
      await tick(); // Exercise an actual asynchronous continuation.
      unchanged(state.target, state.before);
    },
    onFailure(error) { failures.push(error); }
  });
  check(released, true); check(attempts, 2); check(delays, [10]); check(failures, []);
  check(state.unlinks(), 1); check(fs.existsSync(state.target), false);
  const anchorAfter = fs.lstatSync(anchor, { bigint: true });
  check(same(anchorAfter, anchorBefore), true); // Permanent C anchor is never unlinked.

  // Same token/PID is not authority. A later acquisition has a NEW proof.
  check(state.owner.acquireActiveLock(TOKEN), true);
  const current = state.owner.captureOwnedEpoch(TOKEN), latest = lockSnapshot(state.target), priorUnlinks = state.unlinks();
  assert.notStrictEqual(current, state.epoch); assertions++;
  let oldAttempts = 0, oldDelays = 0;
  await assert.rejects(releaseOwnedEpochWithBusyRetry(proof => {
    identical(proof, state.epoch); oldAttempts++;
    return state.owner.releaseOwnedEpoch(proof); // Real old WeakMap proof returns false.
  }, state.epoch, SafeError, false, { delay: async () => { oldDelays++; } }), rejecting('STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED'));
  assertions++;
  check(oldAttempts, 1); check(oldDelays, 0); check(state.unlinks(), priorUnlinks);
  unchanged(state.target, latest); check(state.owner.assertOwnedEpoch(current), true);
  check(state.owner.releaseOwnedEpoch(current), true);
}
async function persistentBusy() {
  const root = fixture.root(), state = own(root);
  await bindHolder(root);
  let attempts = 0;
  const delays = [], failures = [];
  try {
    await assert.rejects(releaseOwnedEpochWithBusyRetry(proof => {
      identical(proof, state.epoch); attempts++;
      return state.owner.releaseOwnedEpoch(proof);
    }, state.epoch, SafeError, false, {
      async delay(ms) {
        delays.push(ms); unchanged(state.target, state.before);
        check(state.unlinks(), 0); check(await holder.request('assert'), true);
        await tick(); // Keep B held throughout all four backoffs.
      },
      onFailure(error) { failures.push(error.code); }
    }), rejecting('STANDALONE_OWNERSHIP_CONTROL_BUSY'));
    assertions++;
    check(attempts, 5); check(delays, BACKOFFS); check(state.unlinks(), 0);
    unchanged(state.target, state.before);
    check(failures.length > 0 && failures.every(code => code === 'STANDALONE_OWNERSHIP_CONTROL_BUSY'), true);
  } finally { await releaseHolder(); }
  // Failure did not consume/re-mint this capability. Explicit later cleanup
  // uses the original proof only AFTER B positively acknowledged release.
  check(state.owner.assertOwnedEpoch(state.epoch), true);
  check(state.owner.releaseOwnedEpoch(state.epoch), true);
}
async function unsafeAnchor() {
  const root = fixture.root(), state = own(root), anchor = path.join(root, 'ownership-control.lock');
  // Owned synthetic fixture only, after every C handle was closed. An invalid
  // nonempty permanent anchor exercises the REAL C unsafe refusal, not an ACL
  // relaxation, fake native return, or a mutation of user/product state.
  fs.writeFileSync(anchor, Buffer.from([1]), { flag: 'r+' });
  let attempts = 0, delays = 0;
  await assert.rejects(releaseOwnedEpochWithBusyRetry(proof => {
    identical(proof, state.epoch); attempts++;
    return state.owner.releaseOwnedEpoch(proof);
  }, state.epoch, SafeError, false, { delay: async () => { delays++; } }),
  rejecting('STANDALONE_OWNERSHIP_STORAGE_UNSAFE'));
  assertions++;
  check(attempts, 1); check(delays, 0); check(state.unlinks(), 0);
  unchanged(state.target, state.before); check(fs.readFileSync(anchor), Buffer.from([1]));
  // Do not "repair" the poisoned anchor or claim epoch release succeeded.
  // Fixture-only cleanup waits for confirmed B process close at gate end.
}
async function injectedHardRefusal(code) {
  const state = own(fixture.root());
  let attempts = 0, delays = 0;
  await assert.rejects(releaseOwnedEpochWithBusyRetry(proof => {
    identical(proof, state.epoch); attempts++;
    // There is no safe portable way to force a real CloseHandle/close failure.
    // This explicit callback seam checks ONLY retry policy on a hard error.
    throw fixed(code);
  }, state.epoch, SafeError, false, { delay: async () => { delays++; } }),
  rejecting('STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED'));
  assertions++;
  check(attempts, 1); check(delays, 0); check(state.unlinks(), 0);
  unchanged(state.target, state.before); check(state.owner.assertOwnedEpoch(state.epoch), true);
  check(state.owner.releaseOwnedEpoch(state.epoch), true); // Uninjected, actual guarded cleanup.
}
async function lifecycleModels() {
  const { EventEmitter } = require('node:events');
  for (const kind of ['normal-close', 'kill-false', 'kill-throw', 'exit-without-close', 'send-error', 'send-throw']) {
    const child = new EventEmitter();
    let parentDisconnects = 0, kills = 0, detached = false;
    child.pid = 424242; child.connected = true; child.exitCode = null; child.signalCode = null;
    child.stderr = new EventEmitter(); child.stderr.destroy = () => {}; child.stderr.unref = () => {};
    child.channel = { unref() {} }; child.unref = () => { detached = true; };
    child.disconnect = () => { parentDisconnects++; };
    child.send = (message, done) => {
      check(message, { type: 'datasecure-native-epoch-release-stop/1' });
      if (kind === 'send-throw') throw fixed('MODEL_SEND_THROW');
      if (kind === 'send-error') { done(fixed('MODEL_EPIPE')); return; }
      done();
      if (kind === 'normal-close' || kind === 'exit-without-close') queueMicrotask(() => {
        child.connected = false; child.exitCode = 0;
        child.emit('disconnect'); child.emit('exit', 0, null);
        if (kind === 'normal-close') { child.stderr.emit('close'); child.emit('close', 0, null); }
      });
    };
    child.kill = signal => { check(signal, 'SIGKILL'); kills++; if (kind === 'kill-throw') throw fixed('MODEL_KILL_THROW'); return false; };
    const model = participant(path.join(__dirname, 'helpers', 'native-ownership-guard-child.cjs'),
      { fork: () => child, graceMs: 5, reapMs: 5 });
    const outcome = await model.stop();
    check(parentDisconnects, 0);
    check(outcome.closed, kind === 'normal-close'); check(outcome.normal, kind === 'normal-close');
    check(kills, ['normal-close', 'exit-without-close'].includes(kind) ? 0 : 1);
    check(detached, kind !== 'normal-close');
    if (kind === 'exit-without-close') { check(outcome.exited, true); check(outcome.kill_status, 'already_exited'); }
    if (kind === 'kill-false') check(outcome.kill_status, 'refused');
    if (kind === 'kill-throw') check(outcome.kill_status, 'error');
    if (kind === 'send-error' || kind === 'send-throw') check(outcome.process_error, true);
    lifecycleModelCases++;
  }
}
(async () => {
  try {
    await lifecycleModels(); // RAM only; never evidence of native competition.
    fixture = await createPrivateFixture();
    holder = participant(path.join(__dirname, 'helpers', 'native-ownership-guard-child.cjs'));
    check(Number.isSafeInteger(holder.pid) && holder.pid > 0 && holder.pid !== process.pid, true);
    await positive(false);
    await positive(true);
    await persistentBusy();
    await unsafeAnchor();
    await injectedHardRefusal('OWNERSHIP_GUARD_CLOSE_UNCONFIRMED');
    await injectedHardRefusal('STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED');
    completed = true;
  } catch (error) { failure = error; }
  finally {
    let closed = !holder;
    if (holder) {
      const stopped = await holder.stop();
      childTermination = stopped;
      closed = stopped.closed;
      if (!stopped.normal) failure ||= fixed('NATIVE_EPOCH_GATE_CHILD_NOT_NORMAL');
    }
    if (fixture && closed) {
      try { fixture.cleanup(); cleanup = true; }
      catch (error) { failure ||= error; } // No stronger/broader retry.
    }
    for (const [key, value] of [['EU_PRIVACY_DATA_ROOT', saved.root], ['EU_PRIVACY_ROOT', saved.workspace],
      ['DATASECURE_NATIVE_EXPORT_CHANNEL', saved.native], ['DATASECURE_OWNERSHIP_GUARD_SHA256', saved.pin]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    const ok = completed && !failure && cleanup;
    console.log(JSON.stringify({ schema: 'datasecure-native-epoch-release-gate/1',
      outcome: ok ? 'passed' : 'failed', node: process.version, platform: process.platform,
      assertions, lifecycle_model_cases: lifecycleModelCases,
      native_two_process: Boolean(holder && Number.isSafeInteger(holder.pid) && holder.pid !== process.pid),
      child_pid: holder?.pid || null, child_termination: childTermination, fixture_cleaned: cleanup,
      error_code: ok ? null : (/^[A-Z][A-Z0-9_]{2,79}$/u.test(failure?.code || '') ? failure.code : 'NATIVE_EPOCH_GATE_FAILED'),
      ...(!cleanup && (fixture?.path || failure?.fixturePath) ? { retained_fixture: fixture?.path || failure.fixturePath } : {}) }));
    if (!ok) process.exitCode = 1;
  }
})().catch(() => { console.error('NATIVE_EPOCH_GATE_INFRASTRUCTURE_FAILED'); process.exitCode = 1; });
