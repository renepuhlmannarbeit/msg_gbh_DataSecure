'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { batchPath, safeRemoveWorkDirectory } = require('./batch-private-store');
const { writeFully, syncParentDirectory } = require('./batch-journal-io');
const { RESOURCE_LIMITS } = require('../resource-limits');

const SCHEMA = 'datasecure-batch/1';
const NOT_FOUND = 'Batch-Sitzung wurde nicht gefunden oder ist ungültig. Bitte den Eingang erneut bestätigen.';
const INVALID = 'Batch-Sitzung ist ungültig. Bitte den Eingang erneut bestätigen.';
const EXPIRED = 'Batch-Sitzung ist abgelaufen. Bitte den Eingang erneut bestätigen.';
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

function createBatchJournalStore(options = {}) {
  const io = options.io || fs;
  const pathForToken = options.batchPath || batchPath;
  const removeWorkDirectory = options.safeRemoveWorkDirectory || safeRemoveWorkDirectory;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const nowMs = options.nowMs || (() => Date.now());
  const writeAll = options.writeFully || writeFully;
  const syncParent = options.syncParentDirectory || syncParentDirectory;
  const platform = options.platform || process.platform;
  const retryDelay = options.retryDelay || ((milliseconds) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  });
  const ErrorType = options.SafeError || SafeError;
  const maxBatchFiles = options.maxBatchFiles || RESOURCE_LIMITS.MAX_BATCH_FILES;

  function temporaryJournalPath(target) {
    return `${target}.tmp_${randomBytes(6).toString('hex')}`;
  }

  function targetBinding(target) {
    try {
      const stat = io.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink()) return null;
      return { exists: true, dev: stat.dev, ino: stat.ino, size: stat.size };
    } catch (error) {
      return error?.code === 'ENOENT' ? { exists: false } : null;
    }
  }

  function sameTargetBinding(left, right) {
    return Boolean(left && right && left.exists === right.exists && (
      left.exists === false || (left.dev === right.dev && left.ino === right.ino && left.size === right.size)
    ));
  }

  function publishJournal(temporary, target) {
    const expected = targetBinding(target);
    if (!expected) throw new Error('BATCH_JOURNAL_TARGET_UNSAFE');
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0 && !sameTargetBinding(targetBinding(target), expected)) {
        throw new Error('BATCH_JOURNAL_TARGET_CHANGED');
      }
      try {
        io.renameSync(temporary, target);
        return;
      } catch (error) {
        if (!TRANSIENT_RENAME_CODES.has(error?.code) || attempt === 3) throw error;
        retryDelay(10 * (attempt + 1));
      }
    }
  }

  // `durable: false` is selected only by the batch state machine for
  // same-status diagnostic checkpoints. Atomic temp-file publication remains
  // unconditional; only the two power-loss flushes are skipped.
  function writeState(state, writeOptions = {}) {
    const durable = writeOptions.durable !== false;
    const target = pathForToken(state.token);
    const temporary = temporaryJournalPath(target);
    const payload = Buffer.from(`${JSON.stringify(state)}\n`, 'utf8');
    try {
      const fd = io.openSync(
        temporary,
        io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL,
        0o600
      );
      try {
        writeAll(fd, payload, io);
        if (durable) io.fsyncSync(fd);
      } finally {
        io.closeSync(fd);
      }
      publishJournal(temporary, target);
      if (durable) syncParent(target, io, platform);
    } catch (error) {
      // Cleanup is deliberately bounded to the exact random temp path. After
      // rename the new complete journal may already be authoritative even if
      // the parent-directory fsync fails; the original error remains visible.
      try { io.unlinkSync(temporary); } catch { /* absent or already renamed */ }
      throw error;
    }
  }

  function readJournalRecord(token) {
    const target = pathForToken(token);
    let descriptor;
    try {
      descriptor = io.openSync(target, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0));
      const stat = io.fstatSync(descriptor);
      const named = io.lstatSync(target);
      if (!stat.isFile() || named.isSymbolicLink() || named.dev !== stat.dev || named.ino !== stat.ino) {
        throw new Error('unsafe');
      }
      return JSON.parse(io.readFileSync(descriptor, 'utf8'));
    } finally {
      if (descriptor !== undefined) io.closeSync(descriptor);
    }
  }

  function validExpiry(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function readState(token) {
    let state;
    try {
      state = readJournalRecord(token);
    } catch {
      throw new ErrorType(NOT_FOUND);
    }
    const expiry = validExpiry(state?.expires_at);
    if (state?.token !== token || state?.schema !== SCHEMA ||
        !Array.isArray(state?.items) || state.items.length === 0 ||
        state.items.length > maxBatchFiles || expiry === undefined) {
      throw new ErrorType(INVALID);
    }
    if (nowMs() > expiry) {
      try {
        removeWorkDirectory(token);
        io.unlinkSync(pathForToken(token));
      } catch { /* fail closed below */ }
      throw new ErrorType(EXPIRED);
    }
    return state;
  }

  function readStateForMaintenance(token) {
    // Maintenance owns the surrounding lifecycle decision. This path is
    // intentionally read-only and preserves raw parse/validation errors so
    // callers can count them without deleting an unknown local record.
    const state = readJournalRecord(token);
    if (state?.schema !== SCHEMA || state.token !== token ||
        !Array.isArray(state.items) || state.items.length === 0 ||
        state.items.length > maxBatchFiles || validExpiry(state.expires_at) === undefined) {
      throw new Error('invalid');
    }
    return state;
  }

  return { writeState, readState, readStateForMaintenance };
}

module.exports = { createBatchJournalStore };
