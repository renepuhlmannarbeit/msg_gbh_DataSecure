'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { types } = require('node:util');

const ROLE_KEY = '__DATASECURE_PARSER_ROLE__';
const NODE_VERSION = '22.23.2';
const MAX_BYTES = 128 * 1024 * 1024;
const MAX_SOURCES = 4096;
const HEX = /^[a-f0-9]{64}$/;
let verified = null;

function invalid() {
  const error = new Error('SEA_PARSER_ROLE_INVALID');
  error.code = 'SEA_PARSER_ROLE_INVALID';
  throw error;
}

function record(value, keys) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) ||
      !Object.isFrozen(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) invalid();
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.writable || descriptor.configurable) invalid();
  }
}

function sourcePath(relative) {
  if (typeof relative !== 'string' || relative.length > 1024 ||
      !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.(?:js|cjs|json)$/.test(relative)) invalid();
  const components = relative.split('/');
  if (components.length > 32 || components.some(part => part === '.' || part === '..' ||
      part.endsWith('.') || /^(?:runtime|ocr-runtime|vendor|node_modules)$/i.test(part) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) invalid();
  return path.join(__dirname, ...components);
}

function metadata(target) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, ROLE_KEY);
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.writable || descriptor.configurable) invalid();
  const role = descriptor.value;
  record(role, ['schema', 'target', 'node_version', 'bytes', 'sha256', 'server_files']);
  if (role.schema !== 'datasecure-sea-parser-role/v1' || role.target !== target ||
      role.node_version !== NODE_VERSION || process.versions.node !== NODE_VERSION ||
      !Number.isSafeInteger(role.bytes) || role.bytes <= 0 || role.bytes > MAX_BYTES ||
      typeof role.sha256 !== 'string' || !HEX.test(role.sha256)) invalid();
  const sources = role.server_files;
  if (!Array.isArray(sources) || types.isProxy(sources) || !Object.isFrozen(sources) ||
      Object.getPrototypeOf(sources) !== Array.prototype || sources.length < 1 || sources.length > MAX_SOURCES ||
      Reflect.ownKeys(sources).length !== sources.length + 1) invalid();
  const seen = new Set();
  const files = [];
  for (let index = 0; index < sources.length; index++) {
    const item = Object.getOwnPropertyDescriptor(sources, String(index));
    if (!item || !Object.hasOwn(item, 'value') || item.writable || item.configurable) invalid();
    const source = item.value;
    record(source, ['path', 'sha256']);
    const filename = sourcePath(source.path);
    // Case-fold even on Linux so the record has one portable interpretation.
    const key = source.path.toLowerCase();
    if (seen.has(key) || typeof source.sha256 !== 'string' || !HEX.test(source.sha256)) invalid();
    seen.add(key);
    files.push({ filename, sha256: source.sha256 });
  }
  return { role, files };
}

function parentSnapshot(filename) {
  const parents = [];
  let directory = path.dirname(filename);
  for (let depth = 0; ; depth++) {
    if (depth > 64) invalid();
    const stat = fs.lstatSync(directory, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) invalid();
    parents.push({ directory, dev: stat.dev, ino: stat.ino });
    const parent = path.dirname(directory);
    if (parent === directory) return parents;
    directory = parent;
  }
}

function sameParents(before, after) {
  return before.length === after.length && before.every((parent, index) =>
    parent.directory === after[index].directory && parent.dev === after[index].dev && parent.ino === after[index].ino);
}

function safeFile(stat) {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || stat.size < 0n ||
      stat.size > BigInt(MAX_BYTES)) invalid();
  return stat;
}

function sameFile(before, after) {
  safeFile(after);
  return ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink', 'mode'].every(key => before[key] === after[key]);
}

function snapshot(file) {
  const parents = parentSnapshot(file.filename);
  const stat = safeFile(fs.lstatSync(file.filename, { bigint: true }));
  return { ...file, stat, parents };
}

function unchanged(file) {
  if (!sameParents(file.parents, parentSnapshot(file.filename)) ||
      !sameFile(file.stat, fs.lstatSync(file.filename, { bigint: true }))) invalid();
}

function verifyBinaryHeader(header, fd, size, target) {
  if (header.length < 64) invalid();
  if (target === 'windows-x64') {
    if (header.readUInt16LE(0) !== 0x5a4d) invalid();
    const peOffset = header.readUInt32LE(0x3c);
    if (peOffset < 64 || peOffset > size - 24) invalid();
    const pe = Buffer.alloc(24);
    let offset = 0;
    while (offset < pe.length) {
      const count = fs.readSync(fd, pe, offset, pe.length - offset, peOffset + offset);
      if (!Number.isInteger(count) || count <= 0 || count > pe.length - offset) invalid();
      offset += count;
    }
    if (pe.toString('binary', 0, 4) !== 'PE\0\0' || pe.readUInt16LE(4) !== 0x8664) invalid();
  } else if (target === 'linux-x64') {
    if (header.toString('binary', 0, 4) !== '\x7fELF' || header[4] !== 2 || header[5] !== 1 ||
        header.readUInt16LE(18) !== 62) invalid();
  } else if (target === 'macos-x64' || target === 'macos-arm64') {
    if (header.readUInt32LE(0) !== 0xfeedfacf ||
        header.readUInt32LE(4) !== (target === 'macos-x64' ? 0x01000007 : 0x0100000c)) invalid();
  } else invalid();
}

function verifyHash(file) {
  const fd = fs.openSync(file.filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    if (!sameFile(file.stat, fs.fstatSync(fd, { bigint: true }))) invalid();
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.alloc(64 * 1024);
    const size = Number(file.stat.size);
    const header = file.binaryTarget ? Buffer.alloc(Math.min(size, 64)) : null;
    let offset = 0;
    // Explicit lengths bound I/O even if another process grows the file.
    while (offset < size) {
      const count = fs.readSync(fd, buffer, 0, Math.min(buffer.length, size - offset), offset);
      if (!Number.isInteger(count) || count <= 0 || count > Math.min(buffer.length, size - offset)) invalid();
      if (header && offset < header.length) buffer.copy(header, offset, 0, Math.min(count, header.length - offset));
      hash.update(buffer.subarray(0, count));
      offset += count;
    }
    if (header) verifyBinaryHeader(header, fd, size, file.binaryTarget);
    if (!sameFile(file.stat, fs.fstatSync(fd, { bigint: true }))) invalid();
    unchanged(file);
    if (hash.digest('hex') !== file.sha256) invalid();
  } finally {
    fs.closeSync(fd);
  }
}

function resolveSeaParserRole() {
  try {
    const isSea = require('node:sea').isSea();
    if (isSea === false) return null;
    if (isSea !== true) invalid();
    const target = ({ 'win32/x64': 'windows-x64', 'darwin/x64': 'macos-x64',
      'darwin/arm64': 'macos-arm64', 'linux/x64': 'linux-x64' })[`${process.platform}/${process.arch}`];
    if (!target) invalid();
    const { role, files } = metadata(target);
    const executable = path.join(__dirname, 'runtime', target,
      process.platform === 'win32' ? 'datasecure-parser.exe' : 'datasecure-parser');
    const all = [{ filename: executable, sha256: role.sha256, binaryTarget: target }, ...files].map(snapshot);
    if (all[0].stat.size !== BigInt(role.bytes) ||
        all.slice(1).reduce((total, file) => total + file.stat.size, 0n) > BigInt(MAX_BYTES)) invalid();
    const cacheHit = verified && verified.role === role && verified.files.length === all.length &&
      all.every((file, index) => file.filename === verified.files[index].filename &&
        sameFile(verified.files[index].stat, file.stat) && sameParents(verified.files[index].parents, file.parents));
    // A cache hit requires unchanged safe identities for EVERY bound file, not
    // merely the executable. Parent chains are checked even on cache hits.
    if (!cacheHit) for (const file of all) verifyHash(file);
    for (const file of all) unchanged(file);
    const result = Object.freeze({ executable, target });
    verified = { role, files: all };
    return result;
  } catch {
    verified = null;
    invalid();
  }
}

// This verifies held read descriptors and their named paths. It is NOT native
// exec-by-handle: replacement after verification but before process spawn is a
// remaining race, and an attacker able to forge filesystem identities is outside
// the hash cache's guarantees. Package installation paths must remain protected.
module.exports = { resolveSeaParserRole };
