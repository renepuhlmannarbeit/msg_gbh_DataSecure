'use strict';

// Leaf I/O boundary shared by runtime and release tooling. Never reopen the
// pathname to read bytes after checking it; path checks bind the held object.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function failure(code = 'BOUND_FILE_UNSAFE') {
  return Object.assign(new Error(code), { code });
}
const field = (stat, name) => String(stat[name]);
function objectIdentity(stat) {
  return { dev: field(stat, 'dev'), ino: field(stat, 'ino'),
    birth: String(stat.birthtimeNs ?? stat.birthtimeMs) };
}
function sameObject(stat, identity) {
  const actual = objectIdentity(stat);
  return Object.keys(actual).every(key => actual[key] === identity[key]);
}
function fileIdentity(stat, checkCtime = false) {
  return { ...objectIdentity(stat), size: field(stat, 'size'), nlink: field(stat, 'nlink'),
    mtime: String(stat.mtimeNs ?? stat.mtimeMs),
    ...(checkCtime ? { ctime: String(stat.ctimeNs ?? stat.ctimeMs) } : {}) };
}
function sameFile(stat, identity) {
  const actual = fileIdentity(stat, Object.hasOwn(identity, 'ctime'));
  return stat.isFile() && !stat.isSymbolicLink() &&
    Object.keys(actual).every(key => actual[key] === identity[key]);
}
// A code is not retry authority: BOUND_FILE_CHANGED also represents access,
// parent, in-place mutation and other IO failures. Only these internally
// classified leaf replacements, for this one snapshot call, may be retried.
const snapshotReplacementOwners = new WeakMap();
function snapshotReplacement(owner) {
  const error = failure('BOUND_FILE_CHANGED');
  snapshotReplacementOwners.set(error, owner);
  return error;
}
function plainSnapshotLeaf(stat, minimum, maximum) {
  const size = Number(stat.size);
  return stat.isFile() && !stat.isSymbolicLink() && Number(stat.nlink) === 1 &&
    Number.isSafeInteger(size) && size >= minimum && size <= maximum;
}
function retiredSnapshotLeaf(stat, minimum, maximum) {
  const size = Number(stat.size);
  return stat.isFile() && !stat.isSymbolicLink() && [0, 1].includes(Number(stat.nlink)) &&
    Number.isSafeInteger(size) && size >= minimum && size <= maximum;
}
function replacementAfterOpen(absolute, directory, fd, before, opened, io, options) {
  if (sameObject(opened, objectIdentity(before))) return false;
  const minimum = options.minimum ?? 0, maximum = options.maximum ?? 256 * 1024 * 1024;
  if (!plainSnapshotLeaf(opened, minimum, maximum)) {
    // An already retired but otherwise sound B may be classified separately.
    // Any actually observed unsafe B is sticky, not a boolean fallback hint.
    if (retiredSnapshotLeaf(opened, minimum, maximum)) return false;
    throw failure('BOUND_FILE_CHANGED');
  }
  assertDirectory(directory); options.validateParents?.();
  const held = fileIdentity(opened, true);
  const named = io.lstatSync(absolute, { bigint: true });
  if (!plainSnapshotLeaf(named, minimum, maximum)) throw failure('BOUND_FILE_CHANGED');
  // A genuinely different regular C is only a retirement candidate. A bad
  // fact on the same named B may not disappear through that second classifier.
  if (!sameObject(named, objectIdentity(opened))) return false;
  if (!sameFile(named, held)) throw failure('BOUND_FILE_CHANGED');
  const after = io.fstatSync(fd, { bigint: true });
  if (!sameFile(after, held)) {
    const current = fileIdentity(after, true);
    if (retiredSnapshotLeaf(after, minimum, maximum) && sameObject(after, objectIdentity(opened)) &&
        current.size === held.size && current.mtime === held.mtime) return false;
    throw failure('BOUND_FILE_CHANGED');
  }
  assertDirectory(directory); options.validateParents?.();
  return true;
}
// A reload never returns bytes from a retired descriptor, whether publication
// happened before its first fstat or after its read. The next attempt must
// perform a complete fresh read under the original directory binding.
function retiredSnapshotReplacement(absolute, directory, fd, opened, after, io, options) {
  const minimum = options.minimum ?? 0, maximum = options.maximum ?? 256 * 1024 * 1024;
  const original = fileIdentity(opened, true);
  const retiredLeaf = stat => retiredSnapshotLeaf(stat, minimum, maximum);
  const unchangedContent = stat => {
    const current = fileIdentity(stat, true);
    return retiredLeaf(stat) && sameObject(stat, objectIdentity(opened)) &&
      current.size === original.size && current.mtime === original.mtime;
  };
  // Never wash away an already observed unsafe/content-changing state with a
  // later good sample. Only ctime/nlink may establish a fresh stability point.
  if (!retiredLeaf(opened) || !unchangedContent(after)) return false;
  assertDirectory(directory); options.validateParents?.();
  const fresh = io.fstatSync(fd, { bigint: true });
  if (!unchangedContent(fresh)) return false;
  const held = fileIdentity(fresh, true);
  const named = io.lstatSync(absolute, { bigint: true });
  if (sameObject(named, objectIdentity(opened)) || !plainSnapshotLeaf(named, minimum, maximum)) return false;
  const replacement = fileIdentity(named, true);
  if (!sameFile(io.fstatSync(fd, { bigint: true }), held) ||
      !sameFile(io.lstatSync(absolute, { bigint: true }), replacement)) return false;
  assertDirectory(directory); options.validateParents?.();
  return true;
}
function realpath(io, target) { return io.realpathSync(target); }
function systemAlias(probe, io, platform) {
  // macOS's OS-owned aliases are not user-created directory redirects.
  return platform === 'darwin' && ['/var', '/tmp', '/etc'].includes(probe) &&
    realpath(io, probe) === `/private${probe}`;
}
function bindDirectory(directory, options = {}) {
  const io = options.io || fs;
  const platform = options.platform || process.platform;
  const absolute = path.resolve(directory);
  const chain = [];
  for (let probe = absolute; ; probe = path.dirname(probe)) {
    const stat = io.lstatSync(probe, { bigint: true });
    const alias = stat.isSymbolicLink() && systemAlias(probe, io, platform);
    if ((!stat.isDirectory() || stat.isSymbolicLink()) && !alias) throw failure();
    chain.push({ path: probe, identity: objectIdentity(stat), alias });
    if (path.dirname(probe) === probe) break;
  }
  return { path: absolute, real: realpath(io, absolute), chain, io, platform };
}
function assertDirectory(binding) {
  const { io, platform } = binding;
  if (realpath(io, binding.path) !== binding.real) throw failure('BOUND_FILE_CHANGED');
  for (const entry of binding.chain) {
    const stat = io.lstatSync(entry.path, { bigint: true });
    if (!sameObject(stat, entry.identity) || (entry.alias
      ? !stat.isSymbolicLink() || !systemAlias(entry.path, io, platform)
      : !stat.isDirectory() || stat.isSymbolicLink())) throw failure('BOUND_FILE_CHANGED');
  }
  return true;
}
// For existing descriptor-owning boundaries: bounded positional reads only.
// Identity/parent checks and descriptor lifetime remain the caller's contract.
function readHeldBytes(fd, length, io = fs, maximum = 64 * 1024 * 1024) {
  const size = Number(length);
  if (!Number.isSafeInteger(size) || size < 0 || size > maximum ||
      !Number.isSafeInteger(maximum) || maximum < 0 || maximum > 512 * 1024 * 1024) throw failure();
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const remaining = Math.min(size - offset, 64 * 1024);
    const count = io.readSync(fd, bytes, offset, remaining, offset);
    if (!Number.isSafeInteger(count) || count < 1 || count > remaining) throw failure('BOUND_FILE_CHANGED');
    offset += count;
  }
  return bytes;
}
// Distribution archives need only a digest, not an archive-sized buffer.
// Their total budget is separate from the 512 MiB allocation ceiling.
function hashHeldBytes(fd, length, io, maximum) {
  const size = Number(length);
  if (!Number.isSafeInteger(size) || size < 0 || size > maximum ||
      !Number.isSafeInteger(maximum) || maximum < 0 || maximum > 768 * 1024 * 1024) throw failure();
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.alloc(Math.min(size, 64 * 1024));
  let offset = 0;
  while (offset < size) {
    const remaining = Math.min(size - offset, buffer.length);
    const count = io.readSync(fd, buffer, 0, remaining, offset);
    if (!Number.isSafeInteger(count) || count < 1 || count > remaining) throw failure('BOUND_FILE_CHANGED');
    hash.update(buffer.subarray(0, count));
    offset += count;
  }
  return hash.digest('hex');
}
function consumeBoundFileRecord(target, options, consume, snapshotOwner = null) {
  const io = options.io || fs;
  const maximum = options.maximum ?? 256 * 1024 * 1024;
  const minimum = options.minimum ?? 0;
  const maxLinks = options.maxLinks ?? 1;
  if (!Number.isSafeInteger(maximum) || maximum < 0 || !Number.isSafeInteger(minimum) ||
      minimum < 0 || minimum > maximum || ![1, 2].includes(maxLinks)) throw failure();
  const absolute = path.resolve(target);
  let fd, started = false;
  try {
    options.validateParents?.();
    const directory = options.directory || bindDirectory(path.dirname(absolute), { ...options, io });
    if (directory.path !== path.dirname(absolute) || directory.io !== io) throw failure();
    assertDirectory(directory);
    const before = io.lstatSync(absolute, { bigint: true });
    started = true;
    const size = Number(before.size), links = Number(before.nlink);
    if (!before.isFile() || before.isSymbolicLink() || !Number.isSafeInteger(size) ||
        size < minimum || size > maximum || links < 1 || links > maxLinks) throw failure();
    const identity = fileIdentity(before, options.checkCtime === true);
    // A raced FIFO must not block before fstat can reject it (POSIX).
    fd = io.openSync(absolute, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0) |
      (io.constants.O_NONBLOCK || 0));
    const opened = io.fstatSync(fd, { bigint: true });
    if (!sameFile(opened, identity)) {
      if (snapshotOwner && (replacementAfterOpen(absolute, directory, fd, before, opened, io, options) ||
          retiredSnapshotReplacement(absolute, directory, fd,
            sameObject(opened, objectIdentity(before)) ? before : opened, opened, io, options)))
        throw snapshotReplacement(snapshotOwner);
      throw failure('BOUND_FILE_CHANGED');
    }
    assertDirectory(directory);
    options.validateParents?.();
    const value = consume(fd, size, io, maximum);
    const after = io.fstatSync(fd, { bigint: true });
    if (!sameFile(after, identity) || !sameFile(io.lstatSync(absolute, { bigint: true }), identity)) {
      if (snapshotOwner && retiredSnapshotReplacement(absolute, directory, fd, opened, after, io, options))
        throw snapshotReplacement(snapshotOwner);
      throw failure('BOUND_FILE_CHANGED');
    }
    assertDirectory(directory);
    options.validateParents?.();
    // A capability, not serializable user metadata. Callers may use it to
    // revalidate a later namespace operation without accepting another object.
    return { value, stat: opened, identity, directory, path: absolute };
  } catch (error) {
    if (error?.code?.startsWith('BOUND_FILE_')) throw error;
    if (!started && error?.code === 'ENOENT') throw error;
    throw failure('BOUND_FILE_CHANGED');
  } finally {
    if (fd !== undefined) {
      const closing = fd;
      fd = undefined;
      try { io.closeSync(closing); } catch { throw failure('BOUND_FILE_CLOSE_FAILED'); }
    }
  }
}
function readBoundFileRecord(target, options = {}) {
  const { value: bytes, ...binding } = consumeBoundFileRecord(target, options, readHeldBytes);
  return { bytes, ...binding };
}
function readBoundFile(target, options = {}) { return readBoundFileRecord(target, options).bytes; }
function readBoundFileSnapshotRecord(target, options = {}) {
  if (options.maxLinks !== undefined && options.maxLinks !== 1) throw failure();
  const io = options.io || fs, absolute = path.resolve(target);
  const directory = options.directory || bindDirectory(path.dirname(absolute), { ...options, io });
  const owner = Symbol('bound file snapshot');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { value: bytes, ...binding } = consumeBoundFileRecord(absolute,
        { ...options, io, directory, maxLinks: 1, checkCtime: true }, readHeldBytes, owner);
      return { bytes, ...binding };
    } catch (error) {
      if (snapshotReplacementOwners.get(error) !== owner || attempt === 2) throw error;
    }
  }
}
function readBoundFileSnapshot(target, options = {}) { return readBoundFileSnapshotRecord(target, options).bytes; }
function hashBoundFile(target, options = {}) {
  return consumeBoundFileRecord(target, options, hashHeldBytes).value;
}

module.exports = { readBoundFile, readBoundFileRecord, readBoundFileSnapshot, readBoundFileSnapshotRecord,
  readHeldBytes, hashBoundFile, bindDirectory, assertDirectory,
  fileIdentity, sameFile, objectIdentity, sameObject, failure };
