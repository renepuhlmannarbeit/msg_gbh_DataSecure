import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readZip } = require('../../plugins/data-secure/server/zip-reader.js');
const HEX = /^[a-f0-9]{64}$/u;
const MAX_ARCHIVE = 256 * 1024 * 1024;
const MAX_RUNTIME = 128 * 1024 * 1024;

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function readRegular(file, limit = MAX_ARCHIVE) {
  const before = fs.lstatSync(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size <= 0n || before.size > BigInt(limit)) {
    throw new Error('BUNDLED_RUNTIME_FILE_UNSAFE');
  }
  const bytes = fs.readFileSync(file);
  const after = fs.lstatSync(file, { bigint: true });
  for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink']) {
    if (before[key] !== after[key]) throw new Error('BUNDLED_RUNTIME_FILE_CHANGED');
  }
  return bytes;
}

function tarString(bytes, start, length) {
  const end = bytes.indexOf(0, start);
  return bytes.subarray(start, end < 0 || end > start + length ? start + length : end).toString('utf8');
}

function tarNumber(bytes, start, length) {
  const value = tarString(bytes, start, length).trim().replace(/^0+/u, '') || '0';
  if (!/^[0-7]+$/u.test(value)) throw new Error('BUNDLED_RUNTIME_ARCHIVE_INVALID');
  const result = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(result) || result < 0 || result > MAX_RUNTIME) throw new Error('BUNDLED_RUNTIME_ARCHIVE_LIMIT');
  return result;
}

function extractTarFile(tar, wanted, minimum = 1) {
  if (!Buffer.isBuffer(tar) || tar.length > 512 * 1024 * 1024 || !/^[A-Za-z0-9._/-]+$/u.test(wanted) || wanted.includes('..')) {
    throw new Error('BUNDLED_RUNTIME_ARCHIVE_INVALID');
  }
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = tarString(header, 0, 100);
    const prefix = tarString(header, 345, 155);
    const full = prefix ? `${prefix}/${name}` : name;
    const size = tarNumber(header, 124, 12);
    const type = header[156];
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) throw new Error('BUNDLED_RUNTIME_ARCHIVE_INVALID');
    if (full === wanted) {
      if (![0, 48].includes(type) || size < minimum) throw new Error('BUNDLED_RUNTIME_ARCHIVE_INVALID');
      return Buffer.from(tar.subarray(dataStart, dataEnd));
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new Error('BUNDLED_RUNTIME_NODE_MISSING');
}

export function extractArchiveEntry(archive, target, entry, { minimum = 1, maximum = MAX_RUNTIME } = {}) {
  if (!Buffer.isBuffer(archive) || archive.length > MAX_ARCHIVE || !target || typeof target !== 'object') {
    throw new Error('BUNDLED_RUNTIME_ARCHIVE_INVALID');
  }
  if (target.archive.endsWith('.zip')) {
    const entries = readZip(archive, { maxEntries: 20000, maxUncompressed: 512 * 1024 * 1024 });
    const value = entries.get(entry);
    if (!value || value.length < minimum || value.length > maximum) throw new Error('BUNDLED_RUNTIME_NODE_MISSING');
    return Buffer.from(value);
  }
  if (target.archive.endsWith('.tar.gz')) {
    let tar;
    try { tar = zlib.gunzipSync(archive, { maxOutputLength: 512 * 1024 * 1024 }); }
    catch { throw new Error('BUNDLED_RUNTIME_ARCHIVE_INVALID'); }
    return extractTarFile(tar, entry, minimum);
  }
  throw new Error('BUNDLED_RUNTIME_ARCHIVE_INVALID');
}

export function extractRuntime(archive, target) {
  return extractArchiveEntry(archive, target, target.node_path, { minimum: 1024, maximum: MAX_RUNTIME });
}

export function assertBinaryTarget(bytes, target) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 64 || bytes.length > MAX_RUNTIME) throw new Error('BUNDLED_RUNTIME_BINARY_INVALID');
  if (target.os === 'win32') {
    if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) throw new Error('BUNDLED_RUNTIME_BINARY_TARGET');
    const pe = bytes.readUInt32LE(0x3c);
    if (pe + 6 > bytes.length || !bytes.subarray(pe, pe + 4).equals(Buffer.from('PE\0\0')) || bytes.readUInt16LE(pe + 4) !== 0x8664) {
      throw new Error('BUNDLED_RUNTIME_BINARY_TARGET');
    }
    return;
  }
  if (target.os === 'darwin') {
    const cpu = target.arch === 'arm64' ? 0x0100000c : 0x01000007;
    if (bytes.readUInt32LE(0) !== 0xfeedfacf || bytes.readUInt32LE(4) !== cpu) throw new Error('BUNDLED_RUNTIME_BINARY_TARGET');
    return;
  }
  throw new Error('BUNDLED_RUNTIME_BINARY_TARGET');
}

export function readContract(root) {
  const file = path.join(root, 'native', 'runtime', 'runtime-contract.json');
  const contract = JSON.parse(readRegular(file, 64 * 1024));
  if (contract.schema !== 'datasecure-bundled-runtime/v1' || !/^\d+\.\d+\.\d+$/u.test(contract.node_version) ||
      contract.plugin_command !== '${CLAUDE_PLUGIN_ROOT}/runtime/datasecure-node' ||
      contract.runtime_entry !== '${CLAUDE_PLUGIN_ROOT}/server/index.js' ||
      contract.archive_limit_bytes !== 50 * 1024 * 1024 || contract.direct_upload_limit_bytes !== 45 * 1024 * 1024 ||
      !Array.isArray(contract.targets) || contract.targets.length !== 3) throw new Error('BUNDLED_RUNTIME_CONTRACT_INVALID');
  const expected = [['windows-x64', 'win32', 'x64'], ['macos-x64', 'darwin', 'x64'], ['macos-arm64', 'darwin', 'arm64']];
  for (let index = 0; index < expected.length; index++) {
    const target = contract.targets[index], [id, os, arch] = expected[index];
    if (target?.id !== id || target.os !== os || target.arch !== arch || !HEX.test(target.archive_sha256) ||
        !target.archive.startsWith(`node-v${contract.node_version}-`) || !/^[A-Za-z0-9._/-]+$/u.test(target.node_path) ||
        !/^[A-Za-z0-9._/-]+$/u.test(target.license_path) || !target.license_path.endsWith('/LICENSE') ||
        !/^[A-Za-z0-9._-]+$/u.test(target.launcher)) throw new Error('BUNDLED_RUNTIME_CONTRACT_INVALID');
  }
  return Object.freeze({ ...contract, targets: Object.freeze(contract.targets.map((target) => Object.freeze({ ...target }))) });
}

export function verifyTargetEvidence(evidence, bytes, licenseBytes, target, contract) {
  const expected = {
    schema: 'datasecure-bundled-runtime-target/v1', target: target.id,
    node_version: contract.node_version, archive: target.archive,
    archive_sha256: target.archive_sha256, bytes: bytes.length, sha256: sha256(bytes),
    license_bytes: licenseBytes.length, license_sha256: sha256(licenseBytes),
    runtime_probe: { version: contract.node_version, platform: target.os, arch: target.arch }
  };
  if (JSON.stringify(evidence) !== JSON.stringify(expected)) throw new Error('BUNDLED_RUNTIME_EVIDENCE_INVALID');
  assertBinaryTarget(bytes, target);
  return expected;
}
