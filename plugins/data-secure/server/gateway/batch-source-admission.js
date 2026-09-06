'use strict';

const fs = require('fs');
const crypto = require('crypto');
const {
  LIMITS,
  hasReparseComponent
} = require('./common');
const {
  SourceFormatError,
  inspectSourceFormatFromFd,
  extensionForName
} = require('./source-format-inspector');

const STOP_CODES = new Set([
  'SOURCE_FORMAT_UNSUPPORTED', 'SOURCE_TYPE_MISMATCH', 'SOURCE_ENCRYPTED_UNSUPPORTED',
  'SOURCE_POLYGLOT_UNSUPPORTED', 'SOURCE_CONTAINER_CORRUPT',
  'SOURCE_CONTAINER_LIMIT',
  'SOURCE_ACTIVE_CONTENT_UNSUPPORTED', 'SOURCE_TEXT_INVALID',
  'SOURCE_COMPOUND_BINARY_UNSUPPORTED', 'SOURCE_FORMAT_NOT_RELEASED'
]);

function boundDescriptor(entry, deps = {}) {
  const io = deps.fs || fs;
  const reparseCheck = deps.hasReparseComponent || hasReparseComponent;
  if (reparseCheck(entry.full)) throw new SourceFormatError('SOURCE_IDENTITY_CHANGED');
  let descriptor;
  try {
    descriptor = io.openSync(entry.full, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0));
    const opened = io.fstatSync(descriptor);
    const named = io.lstatSync(entry.full);
    if (!opened.isFile() || !named.isFile() || named.isSymbolicLink() ||
      opened.dev !== entry.stat.dev || opened.ino !== entry.stat.ino ||
      named.dev !== entry.stat.dev || named.ino !== entry.stat.ino ||
      opened.size !== entry.stat.size || named.size !== entry.stat.size ||
      opened.mtimeMs !== entry.stat.mtimeMs || named.mtimeMs !== entry.stat.mtimeMs) {
      throw new SourceFormatError('SOURCE_IDENTITY_CHANGED');
    }
    return { descriptor, stat: opened };
  } catch (error) {
    if (descriptor !== undefined) {
      try { io.closeSync(descriptor); } catch { /* primary trust failure wins */ }
    }
    if (error instanceof SourceFormatError) throw error;
    throw new SourceFormatError('SOURCE_READ_FAILED');
  }
}

function planBatchAdmission(queue, deps = {}) {
  const io = deps.fs || fs;
  const inspect = deps.inspectSourceFormatFromFd || inspectSourceFormatFromFd;
  const plan = [];
  // Planning is deliberately mutation-free. A descriptor/read/identity error
  // means the intake boundary itself is untrustworthy and aborts the complete
  // plan before a work directory, journal or mapping can exist.
  for (const entry of queue) {
    const opened = boundDescriptor(entry, deps);
    let result;
    let closeFailure;
    try {
      result = inspect(opened.descriptor, opened.stat, extensionForName(entry.name), {
        processingMode: deps.processingMode,
        productChannel: deps.productChannel,
        maxEntries: 20000,
        maxUncompressed: LIMITS.MAX_OOXML_EXPANDED_BYTES,
        fstatSync: io.fstatSync.bind(io),
        readSync: io.readSync.bind(io)
      });
      const candidate = result?.verdict === 'candidate';
      if ((candidate && result?.code !== 'SOURCE_FORMAT_CANDIDATE') ||
        (!candidate && !STOP_CODES.has(result?.code))) {
        throw new SourceFormatError('SOURCE_READ_FAILED');
      }
      if (candidate) {
        const hash = crypto.createHash('sha256');
        const buffer = Buffer.allocUnsafe(64 * 1024);
        try {
          let position = 0;
          while (position < opened.stat.size) {
            const length = Math.min(buffer.length, opened.stat.size - position);
            const read = io.readSync(opened.descriptor, buffer, 0, length, position);
            if (!Number.isSafeInteger(read) || read <= 0 || read > length) throw new SourceFormatError('SOURCE_READ_FAILED');
            hash.update(buffer.subarray(0, read));
            position += read;
          }
          const after = io.fstatSync(opened.descriptor);
          if (after.dev !== opened.stat.dev || after.ino !== opened.stat.ino || after.size !== opened.stat.size ||
            after.mtimeMs !== opened.stat.mtimeMs) {
            throw new SourceFormatError('SOURCE_IDENTITY_CHANGED');
          }
          result = { ...result, source_sha256: hash.digest('hex') };
        } finally {
          buffer.fill(0);
        }
      }
    } finally {
      try { io.closeSync(opened.descriptor); } catch (error) { closeFailure = error; }
    }
    if (closeFailure) throw new SourceFormatError('SOURCE_READ_FAILED');
    const candidate = result?.verdict === 'candidate';
    plan.push(Object.freeze({
      entry,
      admission: candidate ? 'candidate' : 'stopped',
      error_code: candidate ? null : result.code,
      source_sha256: candidate ? result.source_sha256 : null
    }));
  }
  return Object.freeze(plan);
}

module.exports = Object.freeze({ planBatchAdmission, boundDescriptor });
