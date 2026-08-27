'use strict';

const fs = require('fs');
const path = require('path');
const { roots } = require('./common');

const SCHEMA = 'datasecure-package-identity/1';
const PACKAGE_ID_RE = /^ds_[a-f0-9]{32}$/iu;
const IDENTITY_KEYS = ['document', 'manifest', 'schema'].sort();
const FILE_KEYS = ['dev', 'ino', 'mtime_ms', 'size'].sort();
const DECIMAL_RE = /^(?:0|[1-9][0-9]*)$/u;

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === keys.join(',');
}

function fileIdentity(stat) {
  if (!stat || typeof stat.isFile !== 'function' || !stat.isFile() ||
      typeof stat.isSymbolicLink !== 'function' || stat.isSymbolicLink()) {
    throw new Error('PACKAGE_IDENTITY_UNSAFE');
  }
  const identity = {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtime_ms: stat.mtimeMs
  };
  for (const [key, value] of Object.entries(identity)) {
    if (typeof value !== 'bigint' || value < 0n) throw new Error(`PACKAGE_IDENTITY_${key.toUpperCase()}_INVALID`);
    identity[key] = value.toString(10);
  }
  return identity;
}

function validFileIdentity(value) {
  return exactKeys(value, FILE_KEYS) && FILE_KEYS.every((key) => DECIMAL_RE.test(String(value[key] || '')));
}

function validatePackageIdentity(value) {
  if (!exactKeys(value, IDENTITY_KEYS) || value.schema !== SCHEMA ||
      !validFileIdentity(value.manifest) || !validFileIdentity(value.document)) {
    throw new Error('PACKAGE_IDENTITY_INVALID');
  }
  return value;
}

function samePackageIdentity(left, right) {
  try {
    validatePackageIdentity(left);
    validatePackageIdentity(right);
    return FILE_KEYS.every((key) => left.manifest[key] === right.manifest[key]) &&
      FILE_KEYS.every((key) => left.document[key] === right.document[key]);
  } catch {
    return false;
  }
}

function capturePackageIdentity(packageId, options = {}) {
  const io = options.io || fs;
  const pathApi = options.path || path;
  const storageRoots = options.roots || roots;
  const id = String(packageId || '');
  if (!PACKAGE_ID_RE.test(id)) throw new Error('PACKAGE_IDENTITY_ID_INVALID');
  const output = storageRoots().output;
  const packagePath = pathApi.join(output, id);
  if (pathApi.dirname(packagePath) !== output) throw new Error('PACKAGE_IDENTITY_PATH_INVALID');
  const packageStat = io.lstatSync(packagePath, { bigint: true });
  if (!packageStat.isDirectory() || packageStat.isSymbolicLink()) throw new Error('PACKAGE_IDENTITY_UNSAFE');
  return validatePackageIdentity({
    schema: SCHEMA,
    manifest: fileIdentity(io.lstatSync(pathApi.join(packagePath, 'manifest.json'), { bigint: true })),
    document: fileIdentity(io.lstatSync(pathApi.join(packagePath, `${id}.md`), { bigint: true }))
  });
}

function packageIdentityMatches(packageId, expected, options = {}) {
  try {
    return samePackageIdentity(capturePackageIdentity(packageId, options), expected);
  } catch {
    return false;
  }
}

module.exports = Object.freeze({
  SCHEMA,
  capturePackageIdentity,
  packageIdentityMatches,
  samePackageIdentity,
  validatePackageIdentity
});
