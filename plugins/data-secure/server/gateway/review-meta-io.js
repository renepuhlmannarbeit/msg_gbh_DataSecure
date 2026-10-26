'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { writeFully, syncParentDirectory, renameWithTransientRetry } = require('./batch-journal-io');

function writeFileAtomically(target, input, io = fs, platform = process.platform) {
  const temporary = `${target}.tmp_${crypto.randomBytes(8).toString('hex')}`;
  const payload = Buffer.isBuffer(input) ? Buffer.from(input) : Buffer.from(String(input), 'utf8');
  let fd;
  try {
    fd = io.openSync(temporary, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL, 0o600);
    writeFully(fd, payload, io);
    io.fsyncSync(fd);
    io.closeSync(fd); fd = undefined;
    renameWithTransientRetry(temporary, target, io);
    syncParentDirectory(target, io, platform);
  } finally {
    payload.fill(0);
    if (fd !== undefined) try { io.closeSync(fd); } catch { /* preserve caller failure */ }
    try { io.unlinkSync(temporary); } catch { /* absent after rename */ }
  }
}

function writeReviewMetaAtomically(target, value, io = fs, platform = process.platform) {
  writeFileAtomically(target, `${JSON.stringify(value, null, 2)}\n`, io, platform);
}

module.exports = { writeFileAtomically, writeReviewMetaAtomically };
