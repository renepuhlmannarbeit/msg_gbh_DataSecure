'use strict';
// Narrow deterministic fault seams complement (not replace) real native
// two-process tests. These are explicit source-adapter instances only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-owner-record-unit-'));
process.env.EU_PRIVACY_DATA_ROOT = base;
process.env.EU_PRIVACY_ROOT = path.join(base, 'workspace');
delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
const { createBatchActiveLock, ownerRecordIo } = require('../plugins/data-secure/server/gateway/batch-active-lock');
const { createBatchIntakeReservation } = require('../plugins/data-secure/server/gateway/batch-intake-reservation');
const exporter = require('../plugins/data-secure/server/gateway/result-export');
let checks = 0, sequence = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const token = 'c'.repeat(64);
let held = false, transactions = 0;
const control = (root, callback) => {
  check(root, base); check(held, false); held = true; transactions++;
  try { return callback({ assertHeld() { assert.equal(held, true); } }); } finally { held = false; }
};
const guardError = () => { throw Object.assign(Error('OWNERSHIP_GUARD_BUSY'), { code: 'OWNERSHIP_GUARD_BUSY' }); };
function instance(kind, io = fs, withOwnershipControl = control) {
  const deps = { fs: io, withOwnershipControl };
  if (kind === 'active') {
    const api = createBatchActiveLock(deps);
    return { target: api.activeLockPath(), acquire: () => api.acquireActiveLock(token), release: () => api.releaseActiveLock(token) };
  }
  if (kind === 'intake') {
    const api = createBatchIntakeReservation(deps); let cap;
    return { target: api.reservationPath(), acquire: () => { cap = api.reserveIntake(); return cap; }, release: () => api.releaseIntake(cap?.reservation_id) };
  }
  const target = exporter.recordPath(`unit-${++sequence}`); let cap;
  return { target: exporter._test.claimPath(target), acquire: () => { cap = exporter._test.acquireExportClaim(target, deps); return cap; },
    release: () => exporter._test.releaseExportClaim(target, cap, deps) };
}
function faultyIo(failure) {
  let once = true;
  return { ...fs, constants: fs.constants,
    writeSync(fd, bytes, offset, length, position) {
      assert.equal(held, true);
      if (once) {
        once = false;
        if (failure === 'short') return fs.writeSync(fd, bytes, offset, Math.min(3, length), position);
        fs.writeSync(fd, bytes, offset, Math.min(3, length), position);
        throw Object.assign(Error('SIMULATED_ENOSPC'), { code: 'ENOSPC' });
      }
      return fs.writeSync(fd, bytes, offset, length, position);
    },
    linkSync(from, to) { assert.equal(held, true); return fs.linkSync(from, to); },
    unlinkSync(target) { assert.equal(held, true); return fs.unlinkSync(target); }
  };
}
function publishedMetadataIo({ persistent = false, stage = 'link', guardLost, onFault } = {}) {
  let target, pending = false, enabled = true;
  const stats = { links: 0, renames: 0, faults: 0 };
  return { stats, disable() { enabled = false; }, ...fs, constants: fs.constants,
    linkSync(from, to) {
      fs.linkSync(from, to); stats.links++;
      if (stage === 'link') { target = to; pending = true; }
    },
    renameSync(from, to) {
      fs.renameSync(from, to); stats.renames++;
      if (stage === 'rename') { target = to; pending = true; }
    },
    lstatSync(name, options) {
      if (enabled && pending && name === target) {
        if (!persistent) pending = false;
        stats.faults++; guardLost?.(); onFault?.(target);
        throw Object.assign(Error('SIMULATED_POST_PUBLICATION_EIO'), { code: 'EIO' });
      }
      return fs.lstatSync(name, options);
    }
  };
}
function intakeReleaseIntentCases() {
  const workerPid = 2147483000;
  const fixture = (io = fs) => {
    const alive = new Set([process.pid, workerPid]), unknown = new Set();
    let failure;
    const deps = { fs: io, process: { pid: process.pid, kill(pid) {
      if (alive.has(pid)) return;
      if (unknown.has(pid)) throw Object.assign(Error('fixture process is inaccessible'), { code: 'EPERM' });
      throw Object.assign(Error('fixture process is dead'), { code: 'ESRCH' });
    } }, withOwnershipControl(root, callback) {
      if (failure) {
        const current = failure; failure = null;
        if (current.afterCallback) control(root, callback);
        throw Object.assign(Error(current.code), { code: current.code });
      }
      return control(root, callback);
    } };
    const api = createBatchIntakeReservation(deps);
    return { api, deps, alive, unknown, fail(code, afterCallback = false) { failure = { code, afterCallback }; } };
  };
  for (const nativeSchema of [false, true]) {
    if (nativeSchema) process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = '1';
    else delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
    // These real files use an explicit injected guard/liveness MODEL. The
    // native record schema does not turn this seam into an OS-process probe.
    {
      const f = fixture(), cap = f.api.reserveIntake();
      check(JSON.parse(fs.readFileSync(f.api.reservationPath())).schema,
        `datasecure-intake-reservation/${nativeSchema ? 3 : 2}`);
      check(f.api.delegateIntake(cap.reservation_id, workerPid), true);
      f.fail('OWNERSHIP_GUARD_BUSY');
      assert.throws(() => f.api.releaseIntake(cap.reservation_id), { code: 'OWNERSHIP_GUARD_BUSY' }); checks++;
      check(f.api.intakeReservationActive(), true); // no live delegate is released
      f.alive.delete(workerPid);
      f.unknown.add(workerPid); check(f.api.intakeReservationActive(), true); // EPERM is not death evidence
      f.unknown.delete(workerPid);
      check(f.api.intakeReservationActive(), false); // status retries the exact intent
      check(fs.existsSync(f.api.reservationPath()), false);
      check(f.api.releaseIntake(cap.reservation_id), false); // no manufactured ACK
      const next = f.api.reserveIntake(); check(f.api.releaseIntake(next.reservation_id), true);
    }
    {
      const f = fixture(), cap = f.api.reserveIntake();
      f.api.delegateIntake(cap.reservation_id, workerPid); f.alive.delete(workerPid);
      f.fail('OWNERSHIP_GUARD_BUSY');
      assert.throws(() => f.api.releaseIntake(cap.reservation_id), { code: 'OWNERSHIP_GUARD_BUSY' }); checks++;
      const next = f.api.reserveIntake(); // reserve retries without a status poll
      check(next.reservation_id !== cap.reservation_id, true);
      check(f.api.releaseIntake(cap.reservation_id), false);
      check(f.api.intakeReservationActive(), true);
      check(f.api.releaseIntake(next.reservation_id), true);
    }
    {
      const f = fixture(), cap = f.api.reserveIntake();
      check(f.api.intakeReservationActive(), true); // a live picker has no release intent
      assert.throws(() => f.api.reserveIntake()); checks++;
      f.api.delegateIntake(cap.reservation_id, workerPid); f.alive.delete(workerPid);
      check(f.api.releaseIntake('0'.repeat(64)), false);
      f.fail('OWNERSHIP_GUARD_BUSY');
      assert.throws(() => f.api.releaseIntake('0'.repeat(64)), { code: 'OWNERSHIP_GUARD_BUSY' }); checks++;
      check(f.api.intakeReservationActive(), true); // wrong ID cannot express intent
      assert.throws(() => f.api.reserveIntake()); checks++;
      check(f.api.releaseIntake(cap.reservation_id), true);
    }
    {
      const f = fixture(), cap = f.api.reserveIntake();
      f.api.delegateIntake(cap.reservation_id, workerPid); f.alive.delete(workerPid);
      const foreign = createBatchIntakeReservation(f.deps); // identical PID, different acquisition factory
      f.fail('OWNERSHIP_GUARD_BUSY');
      assert.throws(() => foreign.releaseIntake(cap.reservation_id), { code: 'OWNERSHIP_GUARD_BUSY' }); checks++;
      check(foreign.intakeReservationActive(), true); assert.throws(() => foreign.reserveIntake()); checks++;
      check(foreign.releaseIntake(cap.reservation_id), false);
      check(f.api.intakeReservationActive(), true); // foreign intent never reaches the owner
      check(f.api.releaseIntake(cap.reservation_id), true);
    }
    for (const observed of ['missing', 'byte-identical-replacement']) {
      const f = fixture(), cap = f.api.reserveIntake();
      f.api.delegateIntake(cap.reservation_id, workerPid); f.alive.delete(workerPid);
      f.fail('OWNERSHIP_GUARD_BUSY');
      assert.throws(() => f.api.releaseIntake(cap.reservation_id), { code: 'OWNERSHIP_GUARD_BUSY' }); checks++;
      const target = f.api.reservationPath(), displaced = `${target}.intent-fixture-displaced`;
      const bytes = fs.readFileSync(target), original = fs.lstatSync(target, { bigint: true });
      fs.renameSync(target, displaced);
      if (observed === 'byte-identical-replacement') {
        fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
        check(fs.lstatSync(target, { bigint: true }).ino !== original.ino, true);
      }
      check(f.api.intakeReservationActive(), observed !== 'missing');
      if (observed !== 'missing') {
        assert.throws(() => f.api.reserveIntake()); checks++;
        check(fs.readFileSync(target), bytes); fs.unlinkSync(target);
      }
      // Restoring the old file epoch must not resurrect forgotten authority.
      fs.renameSync(displaced, target);
      check(f.api.releaseIntake(cap.reservation_id), false);
      check(f.api.intakeReservationActive(), true); fs.unlinkSync(target);
    }
    for (const code of ['OWNERSHIP_GUARD_UNAVAILABLE', 'OWNERSHIP_GUARD_UNSAFE', 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED']) {
      const f = fixture(), cap = f.api.reserveIntake();
      f.api.delegateIntake(cap.reservation_id, workerPid);
      f.fail(code, code === 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED');
      assert.throws(() => f.api.releaseIntake(cap.reservation_id), { code }); checks++;
      f.alive.delete(workerPid);
      check(f.api.intakeReservationActive(), true); assert.throws(() => f.api.reserveIntake()); checks++;
      // Only a new, explicit release may retry after the hard failure. Real
      // ownership-control additionally poisons the process after close failure.
      check(f.api.releaseIntake(cap.reservation_id), true);
    }
    for (const operation of ['status', 'reserve']) {
      const f = fixture(), cap = f.api.reserveIntake();
      f.api.delegateIntake(cap.reservation_id, workerPid);
      f.fail('OWNERSHIP_GUARD_BUSY');
      assert.throws(() => f.api.releaseIntake(cap.reservation_id), { code: 'OWNERSHIP_GUARD_BUSY' }); checks++;
      f.fail('OWNERSHIP_GUARD_UNSAFE');
      assert.throws(() => operation === 'status' ? f.api.intakeReservationActive() : f.api.reserveIntake(),
        { code: 'OWNERSHIP_GUARD_UNSAFE' }); checks++;
      f.alive.delete(workerPid);
      check(f.api.intakeReservationActive(), true); // hard recovery failure cancels automatic intent
      check(f.api.releaseIntake(cap.reservation_id), true);
    }
    for (const operation of ['status', 'reserve']) {
      const f = fixture(), cap = f.api.reserveIntake();
      f.api.delegateIntake(cap.reservation_id, workerPid);
      f.fail('OWNERSHIP_GUARD_BUSY');
      assert.throws(() => f.api.releaseIntake(cap.reservation_id), { code: 'OWNERSHIP_GUARD_BUSY' }); checks++;
      const target = f.api.reservationPath(), directory = path.dirname(target);
      const displaced = path.join(base, `batches.intent-resolver-${nativeSchema ? 'native' : 'source'}-${operation}`);
      const bytes = fs.readFileSync(target), original = fs.lstatSync(directory, { bigint: true });
      assert.equal(directory, path.join(base, 'batches')); assert.equal(path.dirname(displaced), base);
      assert.ok(original.isDirectory() && !original.isSymbolicLink()); assert.equal(fs.existsSync(displaced), false);
      fs.renameSync(directory, displaced);
      fs.mkdirSync(directory, { mode: 0o700 });
      const replacement = fs.lstatSync(directory, { bigint: true });
      try {
        check(replacement.ino !== original.ino, true);
        // Real cached batchRoot() identity failure, before readOwnerRecord can
        // return invalid/missing. Its uncoded error must cancel the latent
        // automatic intent in BOTH source and native-schema models.
        assert.throws(() => operation === 'status' ? f.api.intakeReservationActive() : f.api.reserveIntake(),
          error => error?.message === 'PRIVACY_STORAGE_UNSAFE' && error.code === undefined); checks++;
      } finally {
        // Restore only the recorded original fixture tree. No recursive delete,
        // fallback target, symlink traversal or uncertain replacement cleanup.
        const current = fs.lstatSync(directory, { bigint: true });
        assert.ok(current.isDirectory() && !current.isSymbolicLink());
        assert.equal(current.dev, replacement.dev); assert.equal(current.ino, replacement.ino);
        assert.deepEqual(fs.readdirSync(directory), []); fs.rmdirSync(directory);
        const retained = fs.lstatSync(displaced, { bigint: true });
        assert.ok(retained.isDirectory() && !retained.isSymbolicLink());
        assert.equal(retained.dev, original.dev); assert.equal(retained.ino, original.ino);
        fs.renameSync(displaced, directory);
      }
      f.alive.delete(workerPid);
      check(f.api.intakeReservationActive(), true); // restoring a namespace cannot heal a hard error
      assert.throws(() => f.api.reserveIntake()); checks++;
      check(fs.readFileSync(target), bytes);
      check(f.api.releaseIntake(cap.reservation_id), true); // original acquisition survives; NEW explicit release works
      check(f.api.intakeReservationActive(), false);
      const next = f.api.reserveIntake(); check(next.reservation_id !== cap.reservation_id, true);
      check(f.api.releaseIntake(next.reservation_id), true);
    }
    {
      const f = fixture(), cap = f.api.reserveIntake();
      f.fail('OWNERSHIP_GUARD_BUSY');
      assert.throws(() => f.api.releaseIntake(cap.reservation_id), { code: 'OWNERSHIP_GUARD_BUSY' }); checks++;
      // A subsequent explicit handoff publishes a NEW acquired file epoch.
      // Intent for the earlier picker record must never transfer to it.
      f.api.delegateIntake(cap.reservation_id, workerPid); f.alive.delete(workerPid);
      check(f.api.intakeReservationActive(), true);
      check(f.api.releaseIntake(cap.reservation_id), true);
    }
    {
      let failUnlink = false;
      const io = { ...fs, unlinkSync(target) {
        if (failUnlink) { failUnlink = false; throw Object.assign(Error('fixture EIO'), { code: 'EIO' }); }
        return fs.unlinkSync(target);
      } };
      const f = fixture(io), cap = f.api.reserveIntake();
      f.api.delegateIntake(cap.reservation_id, workerPid); f.alive.delete(workerPid); failUnlink = true;
      check(f.api.releaseIntake(cap.reservation_id), false);
      check(f.api.intakeReservationActive(), true); assert.throws(() => f.api.reserveIntake()); checks++;
      check(f.api.releaseIntake(cap.reservation_id), true);
    }
    {
      const f = fixture(), cap = f.api.reserveIntake();
      f.api.delegateIntake(cap.reservation_id, workerPid);
      const worker = createBatchIntakeReservation({ ...f.deps, process: { ...f.deps.process, pid: workerPid } });
      check(worker.releaseIntake(cap.reservation_id), true);
      check(f.api.releaseIntake(cap.reservation_id), false); // normal worker-first cleanup forgets parent memory
      const next = f.api.reserveIntake(); check(f.api.releaseIntake(cap.reservation_id), false);
      check(f.api.releaseIntake(next.reservation_id), true);
    }
  }
  delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
}
try {
  // These errors originate in the shared owner publisher, before any active-
  // lock adapter can sanitize them. Their fixed code survives direct use by
  // intake/export too; existing publication/reconciliation behavior is intact.
  {
    const target = path.join(base, 'coded-unsafe-publication.json');
    const unsafeIo = { ...fs, constants: fs.constants, fstatSync(fd, options) {
      const stat = fs.fstatSync(fd, options); stat.nlink = 2n; return stat;
    } };
    assert.throws(() => control(base, guard => ownerRecordIo.publishOwnerRecord(target, { schema: 'synthetic' }, guard, unsafeIo)),
      { code: 'OWNERSHIP_RECORD_UNSAFE', message: 'OWNERSHIP_RECORD_UNSAFE' }); checks++;
    check(fs.existsSync(target), false);
    check(require('../plugins/data-secure/server/gateway/batch-execution-diagnostic').diagnosticCode(
      Object.assign(Error('fixed'), { code: 'OWNERSHIP_RECORD_UNSAFE' })), 'OWNERSHIP_RECORD_UNSAFE');
  }
  {
    const target = path.join(base, 'coded-changed-publication.json');
    const published = control(base, guard => ownerRecordIo.publishOwnerRecord(target, { schema: 'synthetic' }, guard));
    const before = fs.readFileSync(target);
    const changed = { ...published, value: { ...published.value, schema: 'foreign' } };
    assert.throws(() => control(base, guard => ownerRecordIo.publishOwnerRecord(target,
      { schema: 'replacement' }, guard, fs, changed)),
      { code: 'OWNERSHIP_RECORD_CHANGED', message: 'OWNERSHIP_RECORD_CHANGED' }); checks++;
    check(fs.readFileSync(target), before);
  }
  for (const kind of ['active', 'intake', 'export']) {
    const rejected = instance(kind, fs, guardError);
    assert.throws(rejected.acquire, { code: 'OWNERSHIP_GUARD_BUSY' }); checks++;
    check(fs.existsSync(rejected.target), false);
    assert.throws(rejected.release, { code: 'OWNERSHIP_GUARD_BUSY' }); checks++;
    for (const failure of ['short', 'enospc']) {
      const own = instance(kind, faultyIo(failure));
      if (failure === 'short') {
        check(Boolean(own.acquire()), true); check(JSON.parse(fs.readFileSync(own.target)).pid, process.pid); check(own.release(), true);
      } else {
        assert.throws(own.acquire); checks++; check(fs.existsSync(own.target), false);
        const retained = fs.readdirSync(path.dirname(own.target)).filter(name => name.startsWith(`${path.basename(own.target)}.prepared-`));
        check(retained.length > 0, true);
        check(Boolean(own.acquire()), true); check(own.release(), true);
        check(fs.existsSync(path.join(path.dirname(own.target), retained[0])), true);
      }
    }
  }
  for (const kind of ['active', 'intake', 'export']) {
    const io = publishedMetadataIo(), own = instance(kind, io);
    check(Boolean(own.acquire()), true);
    check(io.stats, { links: 1, renames: 0, faults: 1 });
    const value = JSON.parse(fs.readFileSync(own.target)); check(value.pid, process.pid);
    const retained = `${own.target}.prepared-${value.prepared_nonce}.tmp`;
    check(fs.existsSync(retained), true);
    check(own.release(), true); check(fs.existsSync(retained), true);
    check(Boolean(own.acquire()), true); check(own.release(), true);

    const persistentIo = publishedMetadataIo({ persistent: true }), uncertain = instance(kind, persistentIo);
    assert.throws(uncertain.acquire); checks++;
    check(persistentIo.stats.links, 1); check(persistentIo.stats.renames, 0);
    check(JSON.parse(fs.readFileSync(uncertain.target)).pid, process.pid);
    persistentIo.disable();
    // This negative fixture deliberately never acquired a returned capability.
    // Remove only its known final fixture so the next independent case runs.
    fs.unlinkSync(uncertain.target);
  }
  {
    const io = publishedMetadataIo({ stage: 'rename' });
    const parent = createBatchIntakeReservation({ fs: io, withOwnershipControl: control });
    const cap = parent.reserveIntake(); check(parent.delegateIntake(cap.reservation_id, process.pid), true);
    check(io.stats, { links: 1, renames: 1, faults: 1 });
    check(parent.releaseIntake(cap.reservation_id), true);
  }
  for (const kind of ['active', 'intake', 'export']) {
    let lost = false;
    const io = publishedMetadataIo({ guardLost() { lost = true; } });
    const guarded = (root, callback) => control(root, original => callback({ assertHeld() {
      original.assertHeld(); if (lost) { lost = false; throw Object.assign(Error('lost guard'), { code: 'OWNERSHIP_GUARD_UNSAFE' }); }
    } }));
    const own = instance(kind, io, guarded);
    assert.throws(own.acquire, { code: 'OWNERSHIP_GUARD_UNSAFE' }); checks++;
    check(io.stats.links, 1); check(JSON.parse(fs.readFileSync(own.target)).pid, process.pid);
    fs.unlinkSync(own.target);
  }
  for (const kind of ['active', 'intake', 'export']) {
    for (const changed of ['replacement', 'same-inode-content']) {
      const io = publishedMetadataIo({ onFault(target) {
        if (changed === 'replacement') {
          fs.renameSync(target, `${target}.displaced-test-owner`);
          fs.writeFileSync(target, '{"foreign":true}');
        } else {
          const value = JSON.parse(fs.readFileSync(target)); value.created_at = '2000-01-01T00:00:00.000Z';
          fs.writeFileSync(target, JSON.stringify(value) + '\n');
        }
      } });
      const own = instance(kind, io); assert.throws(own.acquire); checks++;
      check(io.stats.links, 1); check(io.stats.renames, 0);
      const value = JSON.parse(fs.readFileSync(own.target));
      check(changed === 'replacement' ? value.foreign : value.created_at, changed === 'replacement' ? true : '2000-01-01T00:00:00.000Z');
      fs.unlinkSync(own.target);
    }
    let lost = false;
    const io = { ...fs, linkSync(from, to) { fs.linkSync(from, to); lost = true; } };
    const guarded = (root, callback) => control(root, original => callback({ assertHeld() {
      original.assertHeld(); if (lost) { lost = false; throw Object.assign(Error('lost parent binding'), { code: 'BOUND_FILE_CHANGED' }); }
    } }));
    const own = instance(kind, io, guarded);
    assert.throws(own.acquire); checks++;
    check(JSON.parse(fs.readFileSync(own.target)).pid, process.pid);
    fs.unlinkSync(own.target);
  }
  // A same-PID observer cannot mint parent release/delegation authority.
  const parent = createBatchIntakeReservation({ withOwnershipControl: control });
  const reservation = parent.reserveIntake(), foreign = createBatchIntakeReservation({ withOwnershipControl: control });
  check(foreign.releaseIntake(reservation.reservation_id), false);
  assert.throws(() => foreign.delegateIntake(reservation.reservation_id, process.pid)); checks++;
  check(parent.releaseIntake(reservation.reservation_id), true);

  // Distinct inode IDs above 2^53 must never compare equal through rounding.
  const target = path.join(base, 'precision.json'); fs.writeFileSync(target, '{"schema":"test"}');
  const precise = { ...fs, fstatSync(fd, options) {
    check(options.bigint, true); const stat = fs.fstatSync(fd, options); stat.ino = 9007199254740992n; return stat;
  }, lstatSync(name, options) {
    const stat = fs.lstatSync(name, options); if (name === target) stat.ino = 9007199254740993n; return stat;
  } };
  check(ownerRecordIo.readOwnerRecord(target, () => true, precise).state, 'invalid');

  // Native and legacy source records are not mutually recoverable even when
  // the stored PID is conclusively dead. No mixed-protocol stale deletion.
  const active = createBatchActiveLock({ withOwnershipControl: control });
  fs.writeFileSync(active.activeLockPath(), JSON.stringify({ schema: 'datasecure-active-batch/2', token, pid: 2147483647,
    created_at: new Date().toISOString(), lock_id: 'a'.repeat(32), prepared_nonce: 'b'.repeat(32) }));
  assert.throws(() => active.acquireActiveLock(token)); checks++;
  check(JSON.parse(fs.readFileSync(active.activeLockPath())).schema, 'datasecure-active-batch/2'); fs.unlinkSync(active.activeLockPath());
  const intake = createBatchIntakeReservation({ withOwnershipControl: control });
  fs.writeFileSync(intake.reservationPath(), JSON.stringify({ schema: 'datasecure-intake-reservation/3', reservation_id: token,
    record_id: 'a'.repeat(32), prepared_nonce: 'b'.repeat(32), pid: 2147483647, created_at: new Date().toISOString() }));
  assert.throws(() => intake.reserveIntake()); checks++; check(intake.intakeReservationActive(), true); fs.unlinkSync(intake.reservationPath());
  const foreignExport = exporter.recordPath('native-schema-claim');
  fs.writeFileSync(exporter._test.claimPath(foreignExport), JSON.stringify({ schema: 'datasecure-result-export-claim/2', claim_id: 'a'.repeat(32),
    prepared_nonce: 'b'.repeat(32), pid: 2147483647, created_at: new Date().toISOString() }));
  check(exporter._test.acquireExportClaim(foreignExport, { withOwnershipControl: control }), null);
  check(JSON.parse(fs.readFileSync(exporter._test.claimPath(foreignExport))).schema, 'datasecure-result-export-claim/2');
  intakeReleaseIntentCases();
  if (['win32', 'darwin'].includes(process.platform)) {
    process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = '1'; delete process.env.DATASECURE_OWNERSHIP_GUARD_SHA256;
    const outcome = exporter.exportCompletedState({ token, items: [{ status: 'released' }] });
    check(outcome, { exported: 0, pending: 1, available: false });
    check(outcome.ownership_error_code, 'OWNERSHIP_GUARD_UNAVAILABLE');
    check(Object.keys(outcome).includes('ownership_error_code'), false);
    fs.writeFileSync(exporter.recordPath(token), '{}');
    check(exporter.replayPendingResultExports().ownership_error_code, 'OWNERSHIP_GUARD_UNAVAILABLE');
    delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
  }
  console.log(`OWNERSHIP RECORD TRANSITIONS PASS ${checks} assertions; ${transactions} explicit guard transactions`);
} finally {
  // Only this freshly created test namespace is removed. No recursive delete,
  // symlink traversal, glob-selected root or user data is accepted.
  const clean = directory => {
    if (directory !== base && !directory.startsWith(`${base}${path.sep}`)) throw Error('cleanup escaped test root');
    for (const name of fs.readdirSync(directory)) {
      const target = path.join(directory, name), stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) throw Error('unexpected fixture symlink');
      if (stat.isDirectory()) clean(target); else if (stat.isFile()) fs.unlinkSync(target); else throw Error('unexpected fixture object');
    }
    fs.rmdirSync(directory);
  }; clean(base);
}
