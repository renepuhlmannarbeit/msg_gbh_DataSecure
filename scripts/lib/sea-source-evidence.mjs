// Local build provenance only: content binding is not host attestation or a
// signature. No source paths are included in the portable evidence record.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function assertSeaDirectory(directory) {
  const absolute = path.resolve(directory);
  let cursor = absolute;
  while (true) {
    const stat = fs.lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('SEA_DIRECTORY_UNSAFE');
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return absolute;
}

export function readSeaFile(file, maxBytes = 256 * 1024 * 1024) {
  assertSeaDirectory(path.dirname(file));
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maxBytes) {
    throw new Error('SEA_FILE_UNSAFE');
  }
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const opened = fs.fstatSync(fd);
    const same = (stat) => stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 &&
      stat.dev === before.dev && stat.ino === before.ino && stat.size === before.size &&
      stat.mtimeMs === before.mtimeMs && stat.ctimeMs === before.ctimeMs;
    if (!same(opened)) throw new Error('SEA_FILE_CHANGED');
    // Explicit length bounds also hold if the file grows while being read.
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!count) throw new Error('SEA_FILE_CHANGED');
      offset += count;
    }
    if (!same(fs.fstatSync(fd)) || !same(fs.lstatSync(file))) throw new Error('SEA_FILE_CHANGED');
    assertSeaDirectory(path.dirname(file));
    return bytes;
  } finally { fs.closeSync(fd); }
}

export const seaHash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export function seaTreeInventory(directory) {
  const base = assertSeaDirectory(directory);
  const files = [];
  let total = 0;
  let entries = 0;
  function walk(current, depth) {
    if (depth > 32) throw new Error('SEA_TREE_LIMIT');
    for (const name of fs.readdirSync(current).sort()) {
      if (++entries > 20000) throw new Error('SEA_TREE_LIMIT');
      const full = path.join(current, name);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) throw new Error('SEA_TREE_UNSAFE');
      if (stat.isDirectory()) { assertSeaDirectory(full); walk(full, depth + 1); continue; }
      if (!stat.isFile() || files.length >= 10000) throw new Error('SEA_TREE_UNSAFE');
      total += stat.size;
      if (total > 1024 * 1024 * 1024) throw new Error('SEA_TREE_LIMIT');
      const bytes = readSeaFile(full);
      files.push({ path: path.relative(base, full).split(path.sep).join('/'),
        bytes: bytes.length, sha256: seaHash(bytes) });
    }
  }
  walk(base, 0);
  return files;
}

export function createSeaSourceEvidence(pluginRoot, contractFile, dispatcherFile) {
  const files = seaTreeInventory(pluginRoot);
  const manifestBytes = readSeaFile(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 65536);
  if (files.find(file => file.path === '.claude-plugin/plugin.json')?.sha256 !== seaHash(manifestBytes)) {
    throw new Error('SEA_FILE_CHANGED');
  }
  const manifest = JSON.parse(manifestBytes);
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    throw new Error('SEA_PLUGIN_VERSION_INVALID');
  }
  return {
    schema: 'datasecure-sea-source-evidence/v1',
    plugin_version: manifest.version,
    plugin_tree_sha256: seaHash(Buffer.from(JSON.stringify(files))),
    launcher_contract_sha256: seaHash(readSeaFile(contractFile, 65536)),
    dispatcher_sha256: seaHash(readSeaFile(dispatcherFile, 65536))
  };
}

export function assertSeaSourceEvidence(actual, expected) {
  const keys = ['schema', 'plugin_version', 'plugin_tree_sha256', 'launcher_contract_sha256', 'dispatcher_sha256'];
  if (!actual || typeof actual !== 'object' || Array.isArray(actual) ||
    Object.keys(actual).sort().join(',') !== [...keys].sort().join(',') ||
    keys.some(key => actual[key] !== expected[key])) throw new Error('SEA_SOURCE_EVIDENCE_MISMATCH');
}
