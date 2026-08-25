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

module.exports = { writeFully, syncParentDirectory };
