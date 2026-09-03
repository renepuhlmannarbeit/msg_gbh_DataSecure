'use strict';

// Private means local, not encrypted. No key store, secret or fallback is used.
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { createPathGuard, ensureSafeTarget, sameIdentity } = require('./private-artifact-crypto');
const { writeFully, syncParentDirectory } = require('./batch-journal-io');

function failure(code) { return Object.assign(new Error(code), { code }); }

function createPrivateWorkStore(options = {}) {
  const io = options.fs || fs;
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw failure('PRIVATE_ARTIFACT_LIMIT_INVALID');
  const validate = createPathGuard(options.privateRoot, io);
  const platform = options.platform || process.platform;

  function ensureReady() {
    validate(path.join(options.privateRoot, '.readiness'));
    return { available: true, backend: 'local_plain_files', encrypted: false };
  }

  function writeFile(target, bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length > maxBytes) throw failure('PRIVATE_ARTIFACT_LIMIT_INVALID');
    target = ensureSafeTarget(target, io, validate, true);
    const parent = io.lstatSync(path.dirname(target));
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomBytes(12).toString('hex')}.tmp`);
    let fd;
    let identity;
    let published = false;
    try {
      fd = io.openSync(temporary, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL, 0o600);
      identity = io.fstatSync(fd);
      if (!identity.isFile() || identity.nlink !== 1 || !sameIdentity(identity, io.lstatSync(temporary))) throw failure('PRIVATE_ARTIFACT_PATH_INVALID');
      writeFully(fd, bytes, io);
      io.fsyncSync(fd);
      const closing = fd;
      fd = undefined;
      io.closeSync(closing);
      ensureSafeTarget(target, io, validate, true);
      if (!sameIdentity(parent, io.lstatSync(path.dirname(target))) ||
          !sameIdentity(identity, io.lstatSync(temporary))) throw failure('PRIVATE_ARTIFACT_PATH_INVALID');
      // Atomic, exclusive publication: never replace an existing file.
      io.linkSync(temporary, target);
      published = true;
      validate(target);
      const linkedTemporary = io.lstatSync(temporary);
      const linkedTarget = io.lstatSync(target);
      if (!sameIdentity(parent, io.lstatSync(path.dirname(target))) || linkedTemporary.nlink !== 2 ||
          linkedTarget.nlink !== 2 || !sameIdentity(identity, linkedTemporary) ||
          !sameIdentity(identity, linkedTarget)) throw failure('PRIVATE_ARTIFACT_DURABILITY_UNCERTAIN');
      io.unlinkSync(temporary);
      const publishedTarget = io.lstatSync(target);
      if (publishedTarget.nlink !== 1 || !sameIdentity(identity, publishedTarget)) {
        throw failure('PRIVATE_ARTIFACT_DURABILITY_UNCERTAIN');
      }
      syncParentDirectory(target, io, platform);
      return { bytes: bytes.length, encrypted: false };
    } catch (error) {
      if (published) throw failure('PRIVATE_ARTIFACT_DURABILITY_UNCERTAIN');
      if (error.code === 'EEXIST') throw failure('PRIVATE_ARTIFACT_ALREADY_EXISTS');
      throw error;
    } finally {
      if (fd !== undefined) { try { io.closeSync(fd); } catch { /* preserve original error */ } }
      if (identity) {
        try {
          validate(temporary);
          const named = io.lstatSync(temporary);
          if (!named.isSymbolicLink() && sameIdentity(identity, named)) io.unlinkSync(temporary);
        } catch { /* only this operation's temporary file may be removed */ }
      }
    }
  }

  function readFile(target) {
    target = ensureSafeTarget(target, io, validate);
    if (target.toLowerCase().endsWith('.dsart')) throw failure('LEGACY_ENCRYPTED_ARTIFACT_UNAVAILABLE');
    const named = io.lstatSync(target);
    const parent = io.lstatSync(path.dirname(target));
    let fd;
    let bytes;
    try {
      fd = io.openSync(target, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0));
      const before = io.fstatSync(fd);
      if (!before.isFile() || before.nlink !== 1 || !sameIdentity(named, before)) throw failure('PRIVATE_ARTIFACT_PATH_INVALID');
      if (!Number.isSafeInteger(before.size) || before.size < 0 || before.size > maxBytes) throw failure('PRIVATE_ARTIFACT_LIMIT_INVALID');
      bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) {
        const count = io.readSync(fd, bytes, offset, bytes.length - offset, offset);
        if (!Number.isSafeInteger(count) || count <= 0 || count > bytes.length - offset) throw failure('PRIVATE_ARTIFACT_READ_FAILED');
        offset += count;
      }
      const after = io.fstatSync(fd);
      validate(target);
      if (!sameIdentity(before, after) || !sameIdentity(after, io.lstatSync(target)) ||
          !sameIdentity(parent, io.lstatSync(path.dirname(target))) || before.size !== after.size ||
          before.mtimeMs !== after.mtimeMs) throw failure('PRIVATE_ARTIFACT_READ_FAILED');
      if (bytes.subarray(0, 8).equals(Buffer.from('DSARTF01'))) throw failure('LEGACY_ENCRYPTED_ARTIFACT_UNAVAILABLE');
      const closing = fd;
      fd = undefined;
      io.closeSync(closing);
      return bytes;
    } catch (error) {
      if (bytes) bytes.fill(0);
      throw error;
    } finally {
      if (fd !== undefined) io.closeSync(fd);
    }
  }

  return Object.freeze({ ensureReady, writeFile, readFile });
}

module.exports = { createPrivateWorkStore };
