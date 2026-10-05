'use strict';

// Private means local, not encrypted. No key store, secret or fallback is used.
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { createPathGuard, ensureSafeTarget, sameIdentity } = require('./private-path-guard');
const { writeFully, syncParentDirectory } = require('./batch-journal-io');
const { readBoundFile } = require('../core/bound-file-io');

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
    const parent = io.lstatSync(path.dirname(target), { bigint: true });
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomBytes(12).toString('hex')}.tmp`);
    let fd;
    let identity;
    let published = false;
    try {
      fd = io.openSync(temporary, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL, 0o600);
      identity = io.fstatSync(fd, { bigint: true });
      if (!identity.isFile() || identity.nlink !== 1n || !sameIdentity(identity, io.lstatSync(temporary, { bigint: true }))) throw failure('PRIVATE_ARTIFACT_PATH_INVALID');
      writeFully(fd, bytes, io);
      io.fsyncSync(fd);
      const closing = fd;
      fd = undefined;
      io.closeSync(closing);
      ensureSafeTarget(target, io, validate, true);
      if (!sameIdentity(parent, io.lstatSync(path.dirname(target), { bigint: true })) ||
          !sameIdentity(identity, io.lstatSync(temporary, { bigint: true }))) throw failure('PRIVATE_ARTIFACT_PATH_INVALID');
      // Atomic, exclusive publication: never replace an existing file.
      io.linkSync(temporary, target);
      published = true;
      validate(target);
      const linkedTemporary = io.lstatSync(temporary, { bigint: true });
      const linkedTarget = io.lstatSync(target, { bigint: true });
      if (!sameIdentity(parent, io.lstatSync(path.dirname(target), { bigint: true })) || linkedTemporary.nlink !== 2n ||
          linkedTarget.nlink !== 2n || !sameIdentity(identity, linkedTemporary) ||
          !sameIdentity(identity, linkedTarget)) throw failure('PRIVATE_ARTIFACT_DURABILITY_UNCERTAIN');
      io.unlinkSync(temporary);
      const publishedTarget = io.lstatSync(target, { bigint: true });
      if (publishedTarget.nlink !== 1n || !sameIdentity(identity, publishedTarget)) {
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
          const named = io.lstatSync(temporary, { bigint: true });
          if (!named.isSymbolicLink() && sameIdentity(identity, named)) io.unlinkSync(temporary);
        } catch { /* only this operation's temporary file may be removed */ }
      }
    }
  }

  function readFile(target) {
    target = ensureSafeTarget(target, io, validate);
    if (target.toLowerCase().endsWith('.dsart')) throw failure('LEGACY_ENCRYPTED_ARTIFACT_UNAVAILABLE');
    let bytes;
    try {
      bytes = readBoundFile(target, { io, maximum: maxBytes, validateParents: () => validate(target) });
      if (bytes.subarray(0, 8).equals(Buffer.from('DSARTF01'))) throw failure('LEGACY_ENCRYPTED_ARTIFACT_UNAVAILABLE');
      return bytes;
    } catch (error) {
      if (bytes) bytes.fill(0);
      if (error?.code === 'LEGACY_ENCRYPTED_ARTIFACT_UNAVAILABLE') throw error;
      throw failure(error?.code === 'BOUND_FILE_UNSAFE' ? 'PRIVATE_ARTIFACT_PATH_INVALID' : 'PRIVATE_ARTIFACT_READ_FAILED');
    }
  }

  return Object.freeze({ ensureReady, writeFile, readFile });
}

module.exports = { createPrivateWorkStore };
