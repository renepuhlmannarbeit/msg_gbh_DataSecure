'use strict';

const fs = require('fs');
const path = require('path');
const { assertPrivateDirectory } = require('./common');

const METADATA_HEADROOM_BYTES = 4096;

function capacityError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizePostPreflightWriteError(error) {
  // statfs is a snapshot, never a reservation.  Only an actual out-of-space
  // result after a positive check is a capacity race; every other error keeps
  // its original security semantics.
  return error?.code === 'ENOSPC' ? capacityError('LOCAL_CAPACITY_RACE') : error;
}

function directoryIdentity(directory, io = fs) {
  const target = path.resolve(String(directory || ''));
  try {
    assertPrivateDirectory(target, path.dirname(target));
    const named = io.lstatSync(target);
    const opened = io.statSync(target);
    const real = io.realpathSync.native(target);
    if (!named.isDirectory() || named.isSymbolicLink() || !opened.isDirectory() ||
      named.dev !== opened.dev || named.ino !== opened.ino) throw new Error('unsafe');
    return { target, real, dev: opened.dev, ino: opened.ino };
  } catch {
    throw capacityError('LOCAL_CAPACITY_UNAVAILABLE');
  }
}

function assertSameDirectory(identity, io = fs) {
  try {
    const named = io.lstatSync(identity.target);
    const opened = io.statSync(identity.target);
    const real = io.realpathSync.native(identity.target);
    const comparable = (value) => process.platform === 'win32' ? String(value).toLowerCase() : String(value);
    if (!named.isDirectory() || named.isSymbolicLink() || !opened.isDirectory() ||
      named.dev !== opened.dev || named.ino !== opened.ino || opened.dev !== identity.dev ||
      opened.ino !== identity.ino || comparable(real) !== comparable(identity.real)) throw new Error('changed');
  } catch {
    throw capacityError('LOCAL_CAPACITY_RACE');
  }
}

function toSafeBigInt(value) {
  if (typeof value === 'bigint') return value >= 0n ? value : null;
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return BigInt(value);
}

// This is deliberately a just-before-write check, not a reservation.  It
// therefore reports only fixed technical codes and callers must still treat a
// later ENOSPC as a retryable fail-closed write race.
function assertWritableCapacity({ directory, bytes, metadataBytes = METADATA_HEADROOM_BYTES, statfs = fs.statfsSync, io = fs } = {}) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || !Number.isSafeInteger(metadataBytes) || metadataBytes < 0) {
    throw capacityError('LOCAL_CAPACITY_UNAVAILABLE');
  }
  const identity = directoryIdentity(directory, io);
  let stats;
  try { stats = statfs(identity.target, { bigint: true }); } catch { throw capacityError('LOCAL_CAPACITY_UNAVAILABLE'); }
  const blocks = toSafeBigInt(stats?.bavail);
  const blockSize = toSafeBigInt(stats?.bsize);
  if (blocks === null || blockSize === null || blockSize === 0n) throw capacityError('LOCAL_CAPACITY_UNAVAILABLE');
  const available = blocks * blockSize;
  const required = BigInt(bytes) + BigInt(metadataBytes);
  if (available < required) throw capacityError('LOCAL_CAPACITY_INSUFFICIENT');
  assertSameDirectory(identity, io);
  return { required_bytes: required, available_bytes: available };
}

module.exports = { METADATA_HEADROOM_BYTES, assertWritableCapacity, directoryIdentity, assertSameDirectory, normalizePostPreflightWriteError };
