'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { batchRoot, TOKEN_RE } = require('./batch-private-store');
const { processAlive: probeProcessAlive } = require('./process-liveness');

const LOCK_SCHEMA = 'datasecure-active-batch/1';
const MAX_LOCK_BYTES = 4096;
const LOCK_ID_RE = /^[a-f0-9]{32}$/;
const TRANSIENT_UNLINK_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

function createBatchActiveLock(deps = {}) {
  const io = deps.fs || fs;
  const processApi = deps.process || process;
  const now = deps.now || (() => new Date());
  const randomLockId = deps.randomLockId || (() => crypto.randomBytes(16).toString('hex'));
  const retryDelay = deps.retryDelay || ((milliseconds) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  });

  function activeLockPath() {
    return path.join(batchRoot(), 'active-processing.json');
  }

  function processAlive(pid) {
    return probeProcessAlive(pid, (candidate, signal) => processApi.kill(candidate, signal));
  }

  function liveLocalExecutor(state) {
    return Number.isSafeInteger(state?.local_executor_pid) && state.local_executor_pid > 0 &&
      processAlive(state.local_executor_pid);
  }

  function validActiveLock(value) {
    return Boolean(value && value.schema === LOCK_SCHEMA &&
      TOKEN_RE.test(value.token) && Number.isSafeInteger(value.pid) && value.pid > 0 &&
      typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at)) &&
      (value.lock_id === undefined || LOCK_ID_RE.test(value.lock_id)));
  }

  function readActiveLockRecord() {
    const target = activeLockPath();
    let descriptor;
    try {
      descriptor = io.openSync(target, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0));
      const opened = io.fstatSync(descriptor);
      const named = io.lstatSync(target);
      if (!opened.isFile() || !named.isFile() || named.isSymbolicLink() ||
        named.dev !== opened.dev || named.ino !== opened.ino ||
        opened.size < 1 || opened.size > MAX_LOCK_BYTES) return null;
      const value = JSON.parse(io.readFileSync(descriptor, 'utf8'));
      if (!validActiveLock(value)) return null;
      return {
        value,
        identity: {
          dev: opened.dev,
          ino: opened.ino,
          size: opened.size
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
    if (!LOCK_ID_RE.test(value.lock_id)) {
      throw new SafeError('Die lokale Stapelsperre konnte nicht sicher erzeugt werden.');
    }
    io.writeFileSync(target, `${JSON.stringify(value)}\n`, {
      encoding: 'utf8', mode: 0o600, flag: 'wx'
    });
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
    if (!existing || existing.value.token !== token || existing.value.pid !== processApi.pid) return false;
    return unlinkIfUnchanged(existing);
  }

  return {
    activeLockPath,
    processAlive,
    liveLocalExecutor,
    validActiveLock,
    readActiveLock,
    acquireActiveLock,
    releaseActiveLock
  };
}

const activeLock = createBatchActiveLock();

module.exports = { ...activeLock, createBatchActiveLock };
