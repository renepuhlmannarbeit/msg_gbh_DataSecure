'use strict';
const { readHeldBytes, bindDirectory, assertDirectory } = require('../core/bound-file-io');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError, dataRoot } = require('../runtime');
const { batchRoot, TOKEN_RE } = require('./batch-private-store');
const { processAlive: probeProcessAlive } = require('./process-liveness');
const { processInstanceIdentity } = require('./process-identity');
const { writeFully, syncParentDirectory, linkWithTransientRetry, renameWithTransientRetry } = require('./batch-journal-io');
const { ownErrorCode } = require('./batch-execution-diagnostic');
const { ownershipErrorCode } = require('../core/ownership-diagnostics');

const LOCK_SCHEMA = 'datasecure-active-batch/1';
const NATIVE_LOCK_SCHEMA = 'datasecure-active-batch/2';
const MAX_LOCK_BYTES = 4096;
const LOCK_ID_RE = /^[a-f0-9]{32}$/;
const TRANSIENT_UNLINK_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const ACTIVE_LOCK_BUSY = 'BATCH_ACTIVE_LOCK_BUSY';
const PUBLICATION_ERROR_CODES = new Set(['EIO', 'EACCES', 'EPERM', 'ENOSPC', 'EDQUOT', 'EROFS',
  'EMFILE', 'ENFILE', 'ENOENT', 'EBUSY', 'EXDEV', 'EEXIST',
  'OWNERSHIP_RECORD_UNSAFE', 'OWNERSHIP_RECORD_CHANGED', 'OWNERSHIP_RECORD_UNCONFIRMED']);
const ownerRecordFailure = code => Object.assign(new Error(code), { code });
function publicationFailure(message, error) {
  const code = ownErrorCode(error);
  // Fixed observation only. In particular, an unvalidated publication error
  // cannot mint BATCH_ACTIVE_LOCK_BUSY and gain contention/retry authority.
  return Object.assign(new SafeError(message), {
    code: PUBLICATION_ERROR_CODES.has(code) ? code : 'BATCH_ACTIVE_LOCK_PUBLICATION_FAILED'
  });
}

// Shared only by the three internal ownership-record protocols. A prepared
// owner is complete before its final name exists. link is an atomic no-replace
// publication even for the explicitly nonnative legacy adapter, where rename
// could overwrite a concurrent winner. The native adapter additionally holds
// the common kernel guard across every inspect/retire/publish transition.
const preparedPath = (target, nonce) => `${target}.prepared-${nonce}.tmp`;
const uncertainPublications = new WeakMap();
// Only an actual final-name no-replace link EEXIST mints this classification.
// A colliding prepared name or a later metadata/I/O error is not contention.
const ownerPublicationCollisions = new WeakSet();
const publishedOwnerRecord = error => uncertainPublications.get(error);
function sameOwnerFile(a, b) {
  return a.isFile() && !a.isSymbolicLink() && typeof a.ino === 'bigint' && typeof b.ino === 'bigint' &&
    a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.birthtimeNs === b.birthtimeNs;
}
const ownerIdentity = stat => ({ dev: String(stat.dev), ino: String(stat.ino), size: Number(stat.size),
  birth: String(stat.birthtimeNs), nlink: Number(stat.nlink) });
function readOwnerRecord(target, validator, io = fs, maximum = 4096) {
  let fd;
  try {
    const directory = bindDirectory(path.dirname(target), { io }); assertDirectory(directory);
    fd = io.openSync(target, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0) | (io.constants.O_NONBLOCK || 0));
    const opened = io.fstatSync(fd, { bigint: true }), named = io.lstatSync(target, { bigint: true });
    if (!sameOwnerFile(named, opened) || ![1n, 2n].includes(opened.nlink) || named.nlink !== opened.nlink ||
        opened.size < 1n || opened.size > BigInt(maximum)) return { state: 'invalid' };
    const value = JSON.parse(readHeldBytes(fd, Number(opened.size), io).toString('utf8'));
    if (!validator(value)) return { state: 'invalid' };
    const checkLinks = stat => {
      if (stat.nlink === 1n) return true;
      if (stat.nlink !== 2n || !LOCK_ID_RE.test(value.prepared_nonce || '')) return false;
      const peer = io.lstatSync(preparedPath(target, value.prepared_nonce), { bigint: true });
      return peer.nlink === 2n && sameOwnerFile(peer, opened);
    };
    const after = io.fstatSync(fd, { bigint: true }), afterNamed = io.lstatSync(target, { bigint: true });
    if (!sameOwnerFile(after, opened) || !sameOwnerFile(afterNamed, opened) || after.nlink !== afterNamed.nlink ||
        !checkLinks(after)) return { state: 'invalid' };
    assertDirectory(directory);
    return { state: 'valid', value, identity: ownerIdentity(after) };
  } catch (error) { return { state: error?.code === 'ENOENT' && fd === undefined ? 'missing' : 'invalid' }; }
  finally { if (fd !== undefined) { try { io.closeSync(fd); } catch { return { state: 'invalid' }; } } }
}
function publishOwnerRecord(target, supplied, guard, io = fs, replaceExpected, singleAttempt = false) {
  const nonce = crypto.randomBytes(16).toString('hex'), temporary = preparedPath(target, nonce);
  const value = { ...supplied, prepared_nonce: nonce }, payload = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
  const directory = bindDirectory(path.dirname(target), { io });
  let fd, opened, publicationStarted = false, guardWasLost = false;
  function assertHeld() {
    try { guard.assertHeld(); }
    catch (error) { guardWasLost = true; throw error; }
  }
  function readOwnPublication() {
    const record = readOwnerRecord(target, candidate => JSON.stringify(candidate) === JSON.stringify(value), io);
    return record.state === 'valid' && record.identity.dev === String(opened.dev) &&
      record.identity.ino === String(opened.ino) && record.identity.size === payload.length ? record : null;
  }
  function reconcilePublication() {
    assertHeld(); assertDirectory(directory);
    const before = readOwnPublication();
    if (!before) throw ownerRecordFailure('OWNERSHIP_RECORD_UNCONFIRMED');
    // The namespace operation may have committed before a metadata ACK failed.
    // Re-establish every postcondition, not just a PID/nonce or an in-memory
    // acquisition entry. Never repeat link/rename or clean retained temps here.
    syncParentDirectory(target, io);
    assertHeld(); assertDirectory(directory);
    const after = readOwnPublication();
    if (!after || JSON.stringify(after.identity) !== JSON.stringify(before.identity)) throw ownerRecordFailure('OWNERSHIP_RECORD_UNCONFIRMED');
    assertHeld(); assertDirectory(directory);
    return after;
  }
  try {
    assertHeld(); assertDirectory(directory);
    fd = io.openSync(temporary, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL |
      (io.constants.O_NOFOLLOW || 0), 0o600);
    const created = io.fstatSync(fd, { bigint: true });
    writeFully(fd, payload, io); io.fsyncSync(fd); opened = io.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n || opened.dev !== created.dev || opened.ino !== created.ino ||
        opened.size !== BigInt(payload.length) || !sameOwnerFile(io.lstatSync(temporary, { bigint: true }), opened)) throw ownerRecordFailure('OWNERSHIP_RECORD_UNSAFE');
    const closing = fd; fd = undefined; io.closeSync(closing);
    assertHeld(); assertDirectory(directory);
    if (replaceExpected) {
      const current = readOwnerRecord(target, () => true, io);
      if (current.state !== 'valid' || JSON.stringify(current.value) !== JSON.stringify(replaceExpected.value) ||
          current.identity.dev !== replaceExpected.identity.dev || current.identity.ino !== replaceExpected.identity.ino ||
          current.identity.birth !== replaceExpected.identity.birth) throw ownerRecordFailure('OWNERSHIP_RECORD_CHANGED');
      assertHeld(); publicationStarted = true;
      if (singleAttempt) io.renameSync(temporary, target);
      else renameWithTransientRetry(temporary, target, io);
    } else {
      publicationStarted = true;
      try {
        if (singleAttempt) io.linkSync(temporary, target);
        else linkWithTransientRetry(temporary, target, io);
      } catch (error) {
        if (ownErrorCode(error) === 'EEXIST' && error && typeof error === 'object') ownerPublicationCollisions.add(error);
        throw error;
      }
    }
    const published = io.lstatSync(target, { bigint: true });
    // NTFS replacement rename can tunnel the destination creation time. The
    // new file ID/volume/size must remain ours; capture its post-rename birth
    // time as the durable epoch identity instead of demanding the temp's time.
    if (!published.isFile() || published.isSymbolicLink() || published.dev !== opened.dev ||
        published.ino !== opened.ino || published.size !== opened.size) throw ownerRecordFailure('OWNERSHIP_RECORD_UNSAFE');
    opened = published;
    syncParentDirectory(target, io);
    // Only the exact object this invocation created may be unlinked. A crash
    // or failed cleanup leaves a complete, recognizable two-link prepared pair;
    // readers never accept an arbitrary hardlink or remove that retained temp.
    try {
      assertHeld(); assertDirectory(directory);
      const current = io.lstatSync(temporary, { bigint: true });
      if (sameOwnerFile(current, opened) && current.nlink === 2n) io.unlinkSync(temporary);
    } catch (error) {
      if (guardWasLost || ownErrorCode(error).startsWith('OWNERSHIP_GUARD_')) throw error;
      // A complete prepared pair remains valid, unlike a torn final.
    }
    assertHeld(); assertDirectory(directory);
    const current = io.lstatSync(target, { bigint: true });
    if (!sameOwnerFile(current, opened)) throw ownerRecordFailure('OWNERSHIP_RECORD_UNSAFE');
    const confirmed = readOwnerRecord(target, candidate => JSON.stringify(candidate) === JSON.stringify(value), io);
    if (confirmed.state !== 'valid' || confirmed.identity.dev !== String(opened.dev) ||
        confirmed.identity.ino !== String(opened.ino)) throw ownerRecordFailure('OWNERSHIP_RECORD_UNSAFE');
    assertHeld();
    return confirmed;
  } catch (error) {
    if (publicationStarted && opened && !guardWasLost && !ownErrorCode(error).startsWith('OWNERSHIP_GUARD_')) {
      try { return reconcilePublication(); }
      catch (confirmationError) {
        // A failed guard assertion is terminal even if a later assertion could
        // happen to succeed, and may not be hidden by the earlier I/O error.
        if (guardWasLost || ownErrorCode(confirmationError).startsWith('OWNERSHIP_GUARD_')) throw confirmationError;
      }
    }
    if (ownErrorCode(error) === 'EEXIST' && opened && !guardWasLost) {
      // A normal losing no-replace contender may remove only its exact,
      // complete, uncommitted temp. Interrupted/unknown temps are retained.
      try {
        assertHeld(); assertDirectory(directory);
        const own = io.lstatSync(temporary, { bigint: true });
        if (own.nlink === 1n && sameOwnerFile(own, opened)) io.unlinkSync(temporary);
      } catch (cleanupError) {
        if (guardWasLost || ownErrorCode(cleanupError).startsWith('OWNERSHIP_GUARD_')) throw cleanupError;
      }
    }
    // Preserve actual acquisition authority after a lost post-publication ACK,
    // but never mint it by a later matching PID or caller-provided error field.
    if (opened && error && typeof error === 'object') {
      const current = readOwnerRecord(target, candidate => JSON.stringify(candidate) === JSON.stringify(value), io);
      if (current.state === 'valid' && current.identity.dev === String(opened.dev) && current.identity.ino === String(opened.ino))
        uncertainPublications.set(error, current);
    }
    throw error;
  } finally {
    payload.fill(0);
    if (fd !== undefined) { const closing = fd; fd = undefined; io.closeSync(closing); }
    // Never scan/delete failed or foreign temporaries. They have no authority.
  }
}

function createBatchActiveLock(deps = {}) {
  const io = deps.fs || fs;
  const processApi = deps.process || process;
  const now = deps.now || (() => new Date());
  const randomLockId = deps.randomLockId || (() => crypto.randomBytes(16).toString('hex'));
  const controlled = action => (deps.withOwnershipControl || require('../core/ownership-control').withOwnershipControl)(dataRoot(), action);
  // Only the native Standalone desktop delegates a document-control owner.
  // An epoch is not authority supplied by a renderer or a generic batch worker.
  const ownerGeneration = deps.ownerGeneration;
  // Only successful acquisitions by this factory mint ownership. Seeing a
  // matching PID/token on disk is not sufficient and cannot mint an epoch.
  const ownedAcquisitions = new Map();
  const ownedEpochs = new WeakMap();
  if (ownerGeneration !== undefined && !LOCK_ID_RE.test(ownerGeneration)) throw new TypeError('DOCUMENT_CONTROL_GENERATION_INVALID');
  const retryDelay = deps.retryDelay || ((milliseconds) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  });

  function activeLockPath() {
    return deps.lockPath ? deps.lockPath() : path.join(batchRoot(), 'active-processing.json');
  }

  function processAlive(pid) {
    return probeProcessAlive(pid, (candidate, signal) => processApi.kill(candidate, signal));
  }

  function liveLocalExecutor(state) {
    if (!Number.isSafeInteger(state?.local_executor_pid) || state.local_executor_pid <= 0 ||
        !processAlive(state.local_executor_pid)) return false;
    // Legacy/unknown identities remain conservatively live. A positively
    // observed different birth identity proves PID reuse and makes the old
    // journal lease stale without treating an observer failure as death.
    if (typeof state.local_executor_birth_id !== 'string') return true;
    const actual = processInstanceIdentity(state.local_executor_pid);
    return !actual || actual === state.local_executor_birth_id;
  }

  function validActiveLock(value) {
    const nativeKeys = ['schema', 'token', 'pid', 'created_at', 'lock_id', 'prepared_nonce'];
    if (value?.owner_generation !== undefined) nativeKeys.push('owner_generation');
    return Boolean(value && [LOCK_SCHEMA, NATIVE_LOCK_SCHEMA].includes(value.schema) &&
      (value.schema !== NATIVE_LOCK_SCHEMA || Object.keys(value).sort().join(',') === nativeKeys.sort().join(',') &&
        typeof value.token === 'string' && typeof value.lock_id === 'string' && typeof value.prepared_nonce === 'string' &&
        (value.owner_generation === undefined || typeof value.owner_generation === 'string')) &&
      TOKEN_RE.test(value.token) && Number.isSafeInteger(value.pid) && value.pid > 0 &&
      typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at)) &&
      (value.lock_id === undefined || LOCK_ID_RE.test(value.lock_id)) &&
      (value.owner_generation === undefined || LOCK_ID_RE.test(value.owner_generation)) &&
      (value.prepared_nonce === undefined || LOCK_ID_RE.test(value.prepared_nonce)));
  }

  function readActiveLockRecord() {
    const record = readOwnerRecord(activeLockPath(), validActiveLock, io, MAX_LOCK_BYTES);
    return record.state === 'valid' ? record : null;
  }

  function readActiveLock() {
    return readActiveLockRecord()?.value || null;
  }

  function sameRecord(left, right) {
    if (!left || !right) return false;
    const a = left.identity;
    const b = right.identity;
    const leftLockId = left.value.lock_id;
    const rightLockId = right.value.lock_id;
    const sameLockId = leftLockId === undefined && rightLockId === undefined
      ? true
      : leftLockId === rightLockId && LOCK_ID_RE.test(String(leftLockId || ''));
    return left.value.token === right.value.token && left.value.pid === right.value.pid &&
      left.value.created_at === right.value.created_at && sameLockId &&
      left.value.owner_generation === right.value.owner_generation &&
      left.value.prepared_nonce === right.value.prepared_nonce && left.value.schema === right.value.schema &&
      a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.birth === b.birth;
  }

  function unlinkIfUnchanged(expected, guard, attempts = 4) {
    // Revalidation alone is not compare-and-delete. Native callers additionally
    // hold the SAME kernel guard throughout this check and pathname unlink.
    for (let attempt = 0; attempt < attempts; attempt++) {
      const current = readActiveLockRecord();
      if (!sameRecord(current, expected)) return false;
      try {
        guard.assertHeld();
        io.unlinkSync(activeLockPath());
        return true;
      } catch (error) {
        if (String(error?.code).startsWith('OWNERSHIP_GUARD_')) throw error;
        if (!TRANSIENT_UNLINK_CODES.has(error?.code) || attempt === attempts - 1) return false;
        retryDelay(10 * (attempt + 1));
      }
    }
    return false;
  }

  function writeOwnLock(target, token, guard, singleAttempt = false) {
    if (!TOKEN_RE.test(token)) throw Object.assign(new SafeError('Ungültige oder abgelaufene Batch-Sitzung.'),
      { code: 'BATCH_ACTIVE_LOCK_RECORD_INVALID' });
    const value = {
      schema: process.env.DATASECURE_NATIVE_EXPORT_CHANNEL === '1' ? NATIVE_LOCK_SCHEMA : LOCK_SCHEMA,
      token,
      pid: processApi.pid,
      created_at: now().toISOString(),
      lock_id: randomLockId()
    };
    if (ownerGeneration !== undefined) value.owner_generation = ownerGeneration;
    if (!LOCK_ID_RE.test(value.lock_id)) {
      throw publicationFailure('Die lokale Stapelsperre konnte nicht sicher erzeugt werden.');
    }
    let published;
    try { published = publishOwnerRecord(target, value, guard, io, undefined, singleAttempt); }
    catch (error) {
      const committed = publishedOwnerRecord(error);
      if (committed) ownedAcquisitions.set(token, Object.freeze({ value: Object.freeze(committed.value), identity: Object.freeze(committed.identity) }));
      throw error;
    }
    ownedAcquisitions.set(token, Object.freeze({ value: Object.freeze(published.value), identity: Object.freeze(published.identity) }));
  }

  function ownershipChanged() {
    return Object.assign(new SafeError('Die eigene lokale Verarbeitungssperre ist nicht mehr gültig.'), { code: 'BATCH_OWNERSHIP_CHANGED' });
  }

  function ownRecord(token) {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw ownershipChanged();
    const acquisition = ownedAcquisitions.get(token), current = readActiveLockRecord();
    if (!acquisition || !current ||
        !sameRecord(current, acquisition)) throw ownershipChanged();
    return { acquisition, current };
  }

  function captureOwnedEpoch(token) {
    const { acquisition, current } = ownRecord(token), proof = Object.freeze({});
    ownedEpochs.set(proof, { acquisition, current });
    return proof;
  }

  function assertOwnedEpoch(proof) {
    // WeakMap lookup neither reflects on a foreign value nor evaluates it.
    const expected = ownedEpochs.get(proof);
    if (!expected) throw ownershipChanged();
    try {
      const { acquisition, current } = ownRecord(expected.acquisition.value.token);
      if (acquisition !== expected.acquisition || !sameRecord(current, expected.current)) throw ownershipChanged();
    } catch (error) { ownedEpochs.delete(proof); throw error; }
    return true;
  }

  function acquireActiveLockInternal(token, guard, singleAttempt = false) {
    const target = activeLockPath();
    const busy = () => Object.assign(new SafeError('Ein anderer lokaler DataSecure-Stapel wird bereits verarbeitet.'),
      { code: ACTIVE_LOCK_BUSY });
    const collisionRecord = () => {
      const parent = bindDirectory(path.dirname(target), { io });
      assertDirectory(parent);
      const record = readOwnerRecord(target, validActiveLock, io, MAX_LOCK_BYTES);
      // readOwnerRecord's missing state must not turn a disappeared/changed
      // ancestor into a retryable missing leaf in the legacy adapter.
      assertDirectory(parent);
      // The publisher proved EEXIST. A vanished name is still a collision,
      // never an unsafe record or permission to adopt/delete another epoch.
      if (record.state === 'missing') throw busy();
      const expectedSchema = process.env.DATASECURE_NATIVE_EXPORT_CHANNEL === '1' ? NATIVE_LOCK_SCHEMA : LOCK_SCHEMA;
      if (record.state !== 'valid' || record.value.schema !== expectedSchema)
        throw Object.assign(new SafeError('Ein anderer lokaler DataSecure-Stapel wird bereits verarbeitet.'),
          { code: 'BATCH_ACTIVE_LOCK_RECORD_INVALID' });
      return record;
    };
    try {
      writeOwnLock(target, token, guard, singleAttempt);
      return true;
    } catch (error) {
      if (ownershipErrorCode(ownErrorCode(error))) throw error;
      if (!ownerPublicationCollisions.has(error)) {
        throw publicationFailure('Die lokale Stapelsperre konnte nicht sicher angelegt werden.', error);
      }
    }
    const existing = collisionRecord();
    // Only a conclusively dead, well-formed owner may be recovered. An unknown,
    // malformed, permission-hidden or live lock remains blocking.
    if (processAlive(existing.value.pid)) throw busy();
    if (!unlinkIfUnchanged(existing, guard, singleAttempt ? 1 : 4)) {
      throw Object.assign(new SafeError('Die verwaiste lokale Stapelsperre konnte nicht sicher bereinigt werden.'),
        { code: 'BATCH_ACTIVE_LOCK_RECOVERY_FAILED' });
    }
    try {
      writeOwnLock(target, token, guard, singleAttempt);
      return true;
    } catch (error) {
      if (ownershipErrorCode(ownErrorCode(error))) throw error;
      if (ownerPublicationCollisions.has(error)) {
        collisionRecord(); // Reject malformed/foreign-schema/I/O-hidden names.
        throw busy(); // Any further attempt belongs outside this guarded call.
      }
      throw publicationFailure('Ein anderer lokaler DataSecure-Stapel wird bereits verarbeitet.', error);
    }
  }

  function releaseActiveLockInternal(token, guard) {
    const existing = readActiveLockRecord();
    if (!existing || existing.value.token !== token || existing.value.pid !== processApi.pid ||
        existing.value.owner_generation !== ownerGeneration) return false;
    const acquisition = ownedAcquisitions.get(token);
    if (!acquisition || !sameRecord(existing, acquisition)) return false;
    const released = unlinkIfUnchanged(existing, guard);
    if (released) ownedAcquisitions.delete(token);
    return released;
  }

  function releaseOwnedEpochInternal(proof, guard) {
    const expected = ownedEpochs.get(proof);
    if (!expected) return false;
    try { assertOwnedEpoch(proof); } catch { return false; }
    const released = unlinkIfUnchanged(expected.current, guard);
    if (released) { ownedAcquisitions.delete(expected.acquisition.value.token); ownedEpochs.delete(proof); }
    return released;
  }

  function retireDelegatedOwnerInternal(generations, guard) {
    if (ownerGeneration === undefined || !Array.isArray(generations) || generations.length > 16 ||
        new Set(generations).size !== generations.length || generations.some(value =>
          !LOCK_ID_RE.test(value) || value === ownerGeneration)) throw new TypeError('DOCUMENT_CONTROL_GENERATION_INVALID');
    if (!io.existsSync(activeLockPath())) return true;
    const existing = readActiveLockRecord();
    // A foreign, legacy, malformed or live unretired generation stays locked.
    // Rust grants these exact epochs only after reaping the old sidecar and
    // draining its native publication work. Matching a PID alone is not proof.
    if (!existing || existing.value.schema !== (process.env.DATASECURE_NATIVE_EXPORT_CHANNEL === '1' ? NATIVE_LOCK_SCHEMA : LOCK_SCHEMA) ||
        existing.value.pid !== processApi.pid ||
        !generations.includes(existing.value.owner_generation)) return false;
    return unlinkIfUnchanged(existing, guard);
  }
  function assertSynchronousActiveAction(action) {
    if (typeof action !== 'function' || /^(?:Async|Generator)/u.test(action.constructor?.name || ''))
      throw Object.assign(new SafeError('Die lokale Sperrtransaktion muss synchron bleiben.'), { code: 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN' });
  }
  function withSynchronousActiveLockInternal(token, action, guard) {
      // Keep one kernel capability across the complete synchronous transaction.
      // The separated APIs below deliberately retain their async-lifetime use.
      const previous = ownedAcquisitions.get(token);
      let acquisition, result, primary, failed = false;
      try {
        acquireActiveLockInternal(token, guard, true);
        acquisition = ownedAcquisitions.get(token);
        if (!acquisition || acquisition === previous) throw ownershipChanged();
        result = action();
        if (result && typeof result.then === 'function')
          throw Object.assign(new SafeError('Die lokale Sperrtransaktion muss synchron bleiben.'), { code: 'OWNERSHIP_GUARD_ASYNC_FORBIDDEN' });
      } catch (error) { primary = error; failed = true; }
      finally {
        // A publication may have committed before its ACK failed. Only an
        // acquisition actually minted by THIS invocation may authorize cleanup;
        // a matching PID/token or a pre-existing acquisition never does.
        const current = ownedAcquisitions.get(token);
        if (!acquisition && current && current !== previous) acquisition = current;
        if (acquisition) {
          try {
            if (current !== acquisition || !unlinkIfUnchanged(acquisition, guard, 1))
              throw Object.assign(new SafeError('Die lokale Stapelsperre konnte nicht sicher freigegeben werden.'),
                { code: 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED' });
            ownedAcquisitions.delete(token);
          } catch (error) {
            if (!failed) { primary = error; failed = true; }
            else {
              // Fixed, content-free observation only. Neither the primary
              // failure nor uncertain ownership becomes retry authority.
              try {
                const { diagnosticCode, recordBatchExecutionFailure } = require('./batch-execution-diagnostic');
                if (typeof deps.onFailure === 'function')
                  deps.onFailure(Object.freeze({ phase: 'processing', error_code: diagnosticCode(error) }));
                else recordBatchExecutionFailure('processing', error);
              } catch { /* diagnostics never replace the exact primary */ }
            }
          }
        }
      }
      if (failed) throw primary;
      return result;
  }
  function withSynchronousActiveLock(token, action) {
    assertSynchronousActiveAction(action);
    return controlled(guard => withSynchronousActiveLockInternal(token, action, guard));
  }
  function withSynchronousActiveLockAdmitted(token, action) {
    assertSynchronousActiveAction(action);
    const root = dataRoot();
    const control = deps.withOwnershipControl || require('../core/ownership-control').withOwnershipControl;
    return require('./synchronous-ownership-admission').admitSynchronousOwnership(
      callback => control(root, callback),
      guard => withSynchronousActiveLockInternal(token, action, guard),
      { delay: deps.admissionDelay, monotonicNow: deps.monotonicNow });
  }
  const acquireActiveLock = token => controlled(guard => acquireActiveLockInternal(token, guard));
  // Internal async-lifetime admission: no publication/unlink backoff while held.
  const acquireActiveLockOnce = token => controlled(guard => acquireActiveLockInternal(token, guard, true));
  const releaseActiveLock = token => controlled(guard => releaseActiveLockInternal(token, guard));
  const releaseOwnedEpoch = proof => controlled(guard => releaseOwnedEpochInternal(proof, guard));
  const retireDelegatedOwner = generations => controlled(guard => retireDelegatedOwnerInternal(generations, guard));

  return {
    activeLockPath,
    processAlive,
    liveLocalExecutor,
    validActiveLock,
    readActiveLock,
    captureOwnedEpoch,
    assertOwnedEpoch,
    releaseOwnedEpoch,
    acquireActiveLock,
    acquireActiveLockOnce,
    releaseActiveLock,
    withSynchronousActiveLock,
    withSynchronousActiveLockAdmitted,
    retireDelegatedOwner
  };
}

const activeLock = createBatchActiveLock();

module.exports = { ...activeLock, createBatchActiveLock, ACTIVE_LOCK_BUSY,
  ownerRecordIo: Object.freeze({ readOwnerRecord, publishOwnerRecord, publishedOwnerRecord }) };
