'use strict';

// Leaf I/O boundary shared by runtime and release tooling. Never reopen the
// pathname to read bytes after checking it; path checks bind the held object.
const fs = require('node:fs');
const path = require('node:path');

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
function readBoundFileRecord(target, options = {}) {
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
    if (!sameFile(opened, identity)) throw failure('BOUND_FILE_CHANGED');
    assertDirectory(directory);
    options.validateParents?.();
    const bytes = readHeldBytes(fd, size, io, maximum);
    if (!sameFile(io.fstatSync(fd, { bigint: true }), identity) ||
        !sameFile(io.lstatSync(absolute, { bigint: true }), identity)) throw failure('BOUND_FILE_CHANGED');
    assertDirectory(directory);
    options.validateParents?.();
    // A capability, not serializable user metadata. Callers may use it to
    // revalidate a later namespace operation without accepting another object.
    return { bytes, stat: opened, identity, directory, path: absolute };
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
function readBoundFile(target, options = {}) { return readBoundFileRecord(target, options).bytes; }

module.exports = { readBoundFile, readBoundFileRecord, readHeldBytes, bindDirectory, assertDirectory,
  fileIdentity, sameFile, objectIdentity, sameObject, failure };
