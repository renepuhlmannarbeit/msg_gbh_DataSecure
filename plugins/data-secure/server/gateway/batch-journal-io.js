'use strict';

const fs = require('fs');
const path = require('path');

function writeFully(fd, payload, io = fs) {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  let offset = 0;
  while (offset < bytes.length) {
    const written = io.writeSync(fd, bytes, offset, bytes.length - offset, null);
    if (!Number.isSafeInteger(written) || written <= 0 || written > bytes.length - offset) {
      throw new Error('BATCH_JOURNAL_PARTIAL_WRITE');
    }
    offset += written;
  }
  return offset;
}

function syncParentDirectory(target, io = fs, platform = process.platform) {
  // Windows has no equivalent portable directory-fsync contract. The journal
  // file itself is flushed by the caller; POSIX additionally persists rename
  // metadata before a state transition is reported as durable.
  if (platform === 'win32') return false;
  let descriptor;
  try {
    descriptor = io.openSync(path.dirname(target), io.constants.O_RDONLY);
    io.fsyncSync(descriptor);
    return true;
  } finally {
    if (descriptor !== undefined) io.closeSync(descriptor);
  }
}

// Windows real-time scanners briefly hold freshly written temporary files; the
// publication rename then fails with EPERM although nothing is wrong (measured
// 03.09.2026: 1.8 % of journal writes under an active Defender scan). Every
// temp-file publication retries such transient codes a bounded number of times
// and otherwise fails closed exactly as before.
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_ATTEMPTS = 4;

function retryDelay(milliseconds) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds); } catch { /* best effort */ }
}

function renameWithTransientRetry(from, to, io = fs, options = {}) {
  const delay = typeof options.retryDelay === 'function' ? options.retryDelay : retryDelay;
  for (let attempt = 0; attempt < RENAME_ATTEMPTS; attempt++) {
    try {
      return io.renameSync(from, to);
    } catch (error) {
      if (!TRANSIENT_RENAME_CODES.has(error?.code) || attempt === RENAME_ATTEMPTS - 1) throw error;
      delay(10 * (attempt + 1));
    }
  }
  return undefined;
}

module.exports = { writeFully, syncParentDirectory, renameWithTransientRetry, TRANSIENT_RENAME_CODES, RENAME_ATTEMPTS };
