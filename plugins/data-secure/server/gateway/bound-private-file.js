'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function failure() {
  const error = new Error('PRIVATE_FILE_IDENTITY_UNCERTAIN');
  error.code = 'PRIVATE_FILE_IDENTITY_UNCERTAIN';
  return error;
}

function identity(stat) {
  return {
    dev: String(stat.dev), ino: String(stat.ino), size: String(stat.size),
    mtimeNs: String(stat.mtimeNs ?? BigInt(Math.trunc(Number(stat.mtimeMs) * 1e6))),
    ctimeNs: String(stat.ctimeNs ?? BigInt(Math.trunc(Number(stat.ctimeMs) * 1e6)))
  };
}

function sameIdentity(stat, expected) {
  if (!stat || !expected) return false;
  const actual = identity(stat);
  return Object.keys(actual).every((key) => actual[key] === expected[key]);
}

function sameFileObject(stat, expected) {
  return Boolean(stat && expected && String(stat.dev) === expected.dev &&
    String(stat.ino) === expected.ino && String(stat.size) === expected.size);
}

function parentIdentity(stat) {
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

function sameParent(stat, expected) {
  const actual = parentIdentity(stat);
  return actual.dev === expected?.dev && actual.ino === expected?.ino;
}

function bindPrivateFile(target, options = {}) {
  const io = options.io || fs;
  const resolved = path.resolve(String(target));
  const parent = path.dirname(resolved);
  let fd;
  try {
    const parentStat = io.lstatSync(parent, { bigint: true });
    const named = io.lstatSync(resolved, { bigint: true });
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || !named.isFile() ||
        named.isSymbolicLink() || named.nlink !== 1n) throw failure();
    fd = io.openSync(resolved, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0));
    const opened = io.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n || !sameIdentity(opened, identity(named))) throw failure();
    const after = io.lstatSync(resolved, { bigint: true });
    if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1n ||
        !sameIdentity(after, identity(opened)) || !sameParent(io.lstatSync(parent, { bigint: true }), parentIdentity(parentStat))) {
      throw failure();
    }
    return Object.freeze({ target: resolved, parent, file: identity(opened), parentIdentity: parentIdentity(parentStat) });
  } catch (error) {
    if (error?.code === 'ENOENT' && options.allowMissing === true) return null;
    if (error?.code === 'PRIVATE_FILE_IDENTITY_UNCERTAIN') throw error;
    throw failure();
  } finally {
    if (fd !== undefined) io.closeSync(fd);
  }
}

function safeUnlinkBoundPrivateFile(target, options = {}) {
  const io = options.io || fs;
  const binding = options.binding || bindPrivateFile(target, options);
  if (!binding) return false;
  const resolved = path.resolve(String(target));
  if (resolved !== binding.target || path.dirname(resolved) !== binding.parent) throw failure();
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const quarantine = path.join(binding.parent, `.delete_${randomBytes(12).toString('hex')}`);
  try {
    if (typeof options.validate === 'function') options.validate(resolved);
    const current = io.lstatSync(resolved, { bigint: true });
    if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1n ||
        !sameIdentity(current, binding.file) ||
        !sameParent(io.lstatSync(binding.parent, { bigint: true }), binding.parentIdentity)) throw failure();
    io.renameSync(resolved, quarantine);
    const moved = io.lstatSync(quarantine, { bigint: true });
    if (!moved.isFile() || moved.isSymbolicLink() || moved.nlink !== 1n ||
        !sameFileObject(moved, binding.file) ||
        !sameParent(io.lstatSync(binding.parent, { bigint: true }), binding.parentIdentity)) throw failure();
    io.unlinkSync(quarantine);
    if (!sameParent(io.lstatSync(binding.parent, { bigint: true }), binding.parentIdentity)) throw failure();
    return true;
  } catch (error) {
    // If a replacement won the rename race it is preserved under the random
    // quarantine name. Never delete an object whose identity is uncertain.
    if (error?.code === 'PRIVATE_FILE_IDENTITY_UNCERTAIN') throw error;
    throw failure();
  }
}

module.exports = { identity, bindPrivateFile, safeUnlinkBoundPrivateFile };
