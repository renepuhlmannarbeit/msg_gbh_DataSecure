'use strict';
const { readHeldBytes } = require('../core/bound-file-io');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { batchRoot, TOKEN_RE } = require('./batch-private-store');
const { processAlive: probeProcessAlive } = require('./process-liveness');
const { processInstanceIdentity } = require('./process-identity');
const { writeFully } = require('./batch-journal-io');

const LOCK_SCHEMA = 'datasecure-active-batch/1';
const MAX_LOCK_BYTES = 4096;
const LOCK_ID_RE = /^[a-f0-9]{32}$/;
const TRANSIENT_UNLINK_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

function createBatchActiveLock(deps = {}) {
  const io = deps.fs || fs;
  const processApi = deps.process || process;
  const now = deps.now || (() => new Date());
  const randomLockId = deps.randomLockId || (() => crypto.randomBytes(16).toString('hex'));
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
    return Boolean(value && value.schema === LOCK_SCHEMA &&
      TOKEN_RE.test(value.token) && Number.isSafeInteger(value.pid) && value.pid > 0 &&
      typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at)) &&
      (value.lock_id === undefined || LOCK_ID_RE.test(value.lock_id)) &&
      (value.owner_generation === undefined || LOCK_ID_RE.test(value.owner_generation)));
  }

  function readActiveLockRecord() {
    const target = activeLockPath();
    let descriptor;
    try {
      descriptor = io.openSync(target, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0) | (io.constants.O_NONBLOCK || 0));
      const opened = io.fstatSync(descriptor);
      const named = io.lstatSync(target);
      if (!opened.isFile() || !named.isFile() || named.isSymbolicLink() ||
        opened.nlink !== 1 || named.nlink !== 1 || named.size !== opened.size ||
        named.dev !== opened.dev || named.ino !== opened.ino ||
        opened.size < 1 || opened.size > MAX_LOCK_BYTES) return null;
      const value = JSON.parse(readHeldBytes(descriptor, opened.size, io).toString('utf8'));
      if (!validActiveLock(value)) return null;
      const afterOpened = io.fstatSync(descriptor), afterNamed = io.lstatSync(target);
      if (!afterOpened.isFile() || !afterNamed.isFile() || afterNamed.isSymbolicLink() ||
          afterOpened.nlink !== 1 || afterNamed.nlink !== 1 || afterOpened.size !== opened.size || afterNamed.size !== opened.size ||
          afterOpened.dev !== opened.dev || afterOpened.ino !== opened.ino || afterNamed.dev !== opened.dev || afterNamed.ino !== opened.ino) return null;
      return {
        value,
        identity: {
          dev: opened.dev,
          ino: opened.ino,
          size: opened.size,
          nlink: opened.nlink
        }
      };
    } catch {
      return null;
    } finally {
      if (descriptor !== undefined) {
        try { io.closeSync(descriptor); } catch { /* unreadable remains fail-closed */ }
      }
    }
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
      a.dev === b.dev && a.ino === b.ino && a.size === b.size;
  }

  function unlinkIfUnchanged(expected) {
    // Re-open immediately before deletion. This closes the exploitable window
    // between the caller's ownership/dead-owner decision and unlinking a path
    // that may since have been replaced by a new owner.
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = readActiveLockRecord();
      if (!sameRecord(current, expected)) return false;
      try {
        io.unlinkSync(activeLockPath());
        return true;
      } catch (error) {
        if (!TRANSIENT_UNLINK_CODES.has(error?.code) || attempt === 3) return false;
        retryDelay(10 * (attempt + 1));
      }
    }
    return false;
  }

  function writeOwnLock(target, token) {
    if (!TOKEN_RE.test(token)) throw new SafeError('Ungültige oder abgelaufene Batch-Sitzung.');
    const value = {
      schema: LOCK_SCHEMA,
      token,
      pid: processApi.pid,
      created_at: now().toISOString(),
      lock_id: randomLockId()
    };
    if (ownerGeneration !== undefined) value.owner_generation = ownerGeneration;
    if (!LOCK_ID_RE.test(value.lock_id)) {
      throw new SafeError('Die lokale Stapelsperre konnte nicht sicher erzeugt werden.');
    }
    let descriptor, opened;
    try {
      descriptor = io.openSync(target, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL |
        (io.constants.O_NOFOLLOW || 0), 0o600);
      writeFully(descriptor, Buffer.from(`${JSON.stringify(value)}\n`, 'utf8'), io);
      io.fsyncSync(descriptor);
      opened = io.fstatSync(descriptor);
      if (!opened.isFile() || opened.nlink !== 1) throw ownershipChanged();
      const closing = descriptor; descriptor = undefined; io.closeSync(closing);
    } finally { if (descriptor !== undefined) io.closeSync(descriptor); }
    // This identity comes from the descriptor we created, not a pathname read
    // after acquisition (which could already designate another equal file).
    ownedAcquisitions.set(token, Object.freeze({ value: Object.freeze(value), identity: Object.freeze({
      dev: opened.dev, ino: opened.ino, size: opened.size, nlink: opened.nlink }) }));
  }

  function ownershipChanged() {
    return Object.assign(new SafeError('Die eigene lokale Verarbeitungssperre ist nicht mehr gültig.'), { code: 'BATCH_OWNERSHIP_CHANGED' });
  }

  function ownRecord(token) {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw ownershipChanged();
    const acquisition = ownedAcquisitions.get(token), current = readActiveLockRecord();
    if (!acquisition || !current || current.identity.nlink !== 1 ||
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

  function acquireActiveLock(token) {
    const target = activeLockPath();
    try {
      writeOwnLock(target, token);
      return true;
    } catch (error) {
      if (error instanceof SafeError) throw error;
      if (error?.code !== 'EEXIST') {
        throw new SafeError('Die lokale Stapelsperre konnte nicht sicher angelegt werden.');
      }
    }
    const existing = readActiveLockRecord();
    // Only a conclusively dead, well-formed owner may be recovered. An unknown,
    // malformed, permission-hidden or live lock remains blocking.
    if (!existing || processAlive(existing.value.pid)) {
      throw new SafeError('Ein anderer lokaler DataSecure-Stapel wird bereits verarbeitet.');
    }
    if (!unlinkIfUnchanged(existing)) {
      throw new SafeError('Die verwaiste lokale Stapelsperre konnte nicht sicher bereinigt werden.');
    }
    try {
      writeOwnLock(target, token);
      return true;
    } catch {
      throw new SafeError('Ein anderer lokaler DataSecure-Stapel wird bereits verarbeitet.');
    }
  }

  function releaseActiveLock(token) {
    const existing = readActiveLockRecord();
    if (!existing || existing.value.token !== token || existing.value.pid !== processApi.pid ||
        existing.value.owner_generation !== ownerGeneration) return false;
    const acquisition = ownedAcquisitions.get(token);
    if (acquisition && !sameRecord(existing, acquisition)) return false;
    const released = unlinkIfUnchanged(existing);
    if (released) ownedAcquisitions.delete(token);
    return released;
  }

  function releaseOwnedEpoch(proof) {
    const expected = ownedEpochs.get(proof);
    if (!expected) return false;
    try { assertOwnedEpoch(proof); } catch { return false; }
    const released = unlinkIfUnchanged(expected.current);
    if (released) { ownedAcquisitions.delete(expected.acquisition.value.token); ownedEpochs.delete(proof); }
    return released;
  }

  function retireDelegatedOwner(generations) {
    if (ownerGeneration === undefined || !Array.isArray(generations) || generations.length > 16 ||
        new Set(generations).size !== generations.length || generations.some(value =>
          !LOCK_ID_RE.test(value) || value === ownerGeneration)) throw new TypeError('DOCUMENT_CONTROL_GENERATION_INVALID');
    if (!io.existsSync(activeLockPath())) return true;
    const existing = readActiveLockRecord();
    // A foreign, legacy, malformed or live unretired generation stays locked.
    // Rust grants these exact epochs only after reaping the old sidecar and
    // draining its native publication work. Matching a PID alone is not proof.
    if (!existing || existing.value.pid !== processApi.pid ||
        !generations.includes(existing.value.owner_generation)) return false;
    return unlinkIfUnchanged(existing);
  }

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
    releaseActiveLock,
    retireDelegatedOwner
  };
}

const activeLock = createBatchActiveLock();

module.exports = { ...activeLock, createBatchActiveLock };
