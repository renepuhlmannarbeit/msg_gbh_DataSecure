'use strict';

const fs = require('fs');
const path = require('path');
const { SafeError } = require('../runtime');
const { batchRoot, TOKEN_RE } = require('./batch-private-store');
const { processAlive: probeProcessAlive } = require('./process-liveness');

const LOCK_SCHEMA = 'datasecure-active-batch/1';
const MAX_LOCK_BYTES = 4096;

function createBatchActiveLock(deps = {}) {
  const io = deps.fs || fs;
  const processApi = deps.process || process;
  const now = deps.now || (() => new Date());

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
      typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at)));
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
          size: opened.size,
          mtimeMs: opened.mtimeMs,
          ctimeMs: opened.ctimeMs
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
    return left.value.token === right.value.token && left.value.pid === right.value.pid &&
      left.value.created_at === right.value.created_at && a.dev === b.dev && a.ino === b.ino &&
      a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
  }

  function unlinkIfUnchanged(expected) {
    // Re-open immediately before deletion. This closes the exploitable window
    // between the caller's ownership/dead-owner decision and unlinking a path
    // that may since have been replaced by a new owner.
    const current = readActiveLockRecord();
    if (!sameRecord(current, expected)) return false;
    try {
      io.unlinkSync(activeLockPath());
      return true;
    } catch {
      return false;
    }
  }

  function writeOwnLock(target, token) {
    if (!TOKEN_RE.test(token)) throw new SafeError('Ungültige oder abgelaufene Batch-Sitzung.');
    const value = {
      schema: LOCK_SCHEMA,
      token,
      pid: processApi.pid,
      created_at: now().toISOString()
    };
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
