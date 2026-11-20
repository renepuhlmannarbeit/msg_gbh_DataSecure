'use strict';

// Private means local, not encrypted. No key store, secret or fallback is used.
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { createPathGuard, ensureSafeTarget, sameIdentity } = require('./private-path-guard');
const { writeFully, syncParentDirectory } = require('./batch-journal-io');
const { readBoundFile, bindDirectory, assertDirectory, fileIdentity, sameFile } = require('../core/bound-file-io');

function failure(code) { return Object.assign(new Error(code), { code }); }

function createPrivateWorkStore(options = {}) {
  const io = options.fs || fs;
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw failure('PRIVATE_ARTIFACT_LIMIT_INVALID');
  const validate = createPathGuard(options.privateRoot, io, options.expectedRootIdentity);
  const platform = options.platform || process.platform;

  function ensureReady() {
    validate(path.join(options.privateRoot, '.readiness'));
    return { available: true, backend: 'local_plain_files', encrypted: false };
  }

  function writeFile(target, bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length > maxBytes) throw failure('PRIVATE_ARTIFACT_LIMIT_INVALID');
    target = ensureSafeTarget(target, io, validate, true);
    let directory;
    try { directory = bindDirectory(path.dirname(target), { io, platform }); }
    catch { throw failure('PRIVATE_ARTIFACT_PATH_INVALID'); }
    const parent = io.lstatSync(path.dirname(target), { bigint: true });
    const assertParent = () => {
      validate(target);
      try {
        assertDirectory(directory);
        if (!sameIdentity(parent, io.lstatSync(path.dirname(target), { bigint: true }))) throw failure('PRIVATE_ARTIFACT_PATH_INVALID');
      } catch { throw failure('PRIVATE_ARTIFACT_PATH_INVALID'); }
    };
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomBytes(12).toString('hex')}.tmp`);
    let fd;
    let identity;
    let published = false;
    const assertTemporary = expectedSize => {
      assertParent();
      const held = io.fstatSync(fd, { bigint: true });
      const named = io.lstatSync(temporary, { bigint: true });
      if (!held.isFile() || held.isSymbolicLink?.() || held.nlink !== 1n || held.size !== expectedSize ||
          !named.isFile() || named.isSymbolicLink() || named.nlink !== 1n || named.size !== expectedSize ||
          !sameIdentity(identity, held) || !sameFile(named, fileIdentity(held, true))) throw failure('PRIVATE_ARTIFACT_PATH_INVALID');
      assertParent();
    };
    try {
      assertParent();
      fd = io.openSync(temporary, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL, 0o600);
      identity = io.fstatSync(fd, { bigint: true });
      // Exclusive creation alone does not authenticate an intermediate parent.
      // Revalidate the actual held/named empty object before its first byte.
      assertTemporary(0n);
      writeFully(fd, bytes, io);
      io.fsyncSync(fd);
      assertTemporary(BigInt(bytes.length));
      const closing = fd;
      fd = undefined;
      io.closeSync(closing);
      ensureSafeTarget(target, io, validate, true);
      assertParent();
      const ready = io.lstatSync(temporary, { bigint: true });
      if (!ready.isFile() || ready.isSymbolicLink() || ready.nlink !== 1n || ready.size !== BigInt(bytes.length) ||
          !sameIdentity(identity, ready)) throw failure('PRIVATE_ARTIFACT_PATH_INVALID');
      // Atomic, exclusive publication: never replace an existing file.
      io.linkSync(temporary, target);
      published = true;
      assertParent();
      const linkedTemporary = io.lstatSync(temporary, { bigint: true });
      const linkedTarget = io.lstatSync(target, { bigint: true });
      if (!linkedTemporary.isFile() || linkedTemporary.isSymbolicLink() || !linkedTarget.isFile() || linkedTarget.isSymbolicLink() ||
          linkedTemporary.nlink !== 2n || linkedTarget.nlink !== 2n || linkedTemporary.size !== BigInt(bytes.length) ||
          linkedTarget.size !== BigInt(bytes.length) || !sameIdentity(identity, linkedTemporary) ||
          !sameIdentity(identity, linkedTarget) || !sameFile(linkedTarget, fileIdentity(linkedTemporary, true))) throw failure('PRIVATE_ARTIFACT_DURABILITY_UNCERTAIN');
      assertParent();
      io.unlinkSync(temporary);
      const publishedTarget = io.lstatSync(target, { bigint: true });
      if (!publishedTarget.isFile() || publishedTarget.isSymbolicLink() || publishedTarget.nlink !== 1n ||
          publishedTarget.size !== BigInt(bytes.length) || !sameIdentity(identity, publishedTarget)) {
        throw failure('PRIVATE_ARTIFACT_DURABILITY_UNCERTAIN');
      }
      assertParent();
      syncParentDirectory(target, io, platform);
      assertParent();
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
          assertParent();
          const named = io.lstatSync(temporary, { bigint: true });
          if (named.isFile() && !named.isSymbolicLink() && sameIdentity(identity, named)) {
            let ownedLinks = named.nlink === 1n;
            if (named.nlink === 2n && named.size === BigInt(bytes.length)) {
              // A link can have committed even when its acknowledgement was
              // lost. The flag is not proof either way: inspect the real pair.
              const visible = io.lstatSync(target, { bigint: true });
              ownedLinks = sameIdentity(identity, visible) && sameFile(visible, fileIdentity(named, true));
            }
            assertParent();
            if (ownedLinks) io.unlinkSync(temporary);
          }
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
