'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');

const RESERVATION_SCHEMA = 'datasecure-storage-reservation/1';
const TOKEN_RE = /^[a-f0-9]{64}$/;
const RESERVATION_RE = /^[a-f0-9]{64}$/;
const MAX_RESERVATION_BYTES = 2 * 500 * 1024 * 1024 + 64 * 1024 * 1024;
const CHUNK_BYTES = 1024 * 1024;

function reservationError() {
  return new SafeError('Die lokale Speicherreservierung ist nicht sicher verfügbar.');
}

function validateRequest(value = {}) {
  const batchToken = String(value.batchToken || '');
  const reservedBytes = Number(value.reservedBytes);
  if (!TOKEN_RE.test(batchToken) || !Number.isSafeInteger(reservedBytes) ||
    reservedBytes < 1 || reservedBytes > MAX_RESERVATION_BYTES) throw reservationError();
  return { batchToken, reservedBytes };
}

function paths(directory) {
  const target = path.resolve(String(directory || ''));
  return {
    directory: target,
    data: path.join(target, 'reservation.bin'),
    record: path.join(target, 'reservation.json')
  };
}

function ensureDirectory(directory, io = fs) {
  if (typeof directory !== 'string' || directory.trim() === '') throw reservationError();
  const target = paths(directory).directory;
  try {
    try { io.mkdirSync(target, { recursive: false, mode: 0o700 }); }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
    const stat = io.lstatSync(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe directory');
    const allowed = new Set(['reservation.bin', 'reservation.json']);
    if (io.readdirSync(target).some((name) => !allowed.has(name))) throw new Error('unexpected entry');
    return target;
  } catch { throw reservationError(); }
}

function validRecord(value) {
  const keys = ['schema', 'batch_token', 'reservation_id', 'reserved_bytes', 'state'];
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)) &&
    value.schema === RESERVATION_SCHEMA && TOKEN_RE.test(String(value.batch_token || '')) &&
    RESERVATION_RE.test(String(value.reservation_id || '')) &&
    Number.isSafeInteger(value.reserved_bytes) && value.reserved_bytes >= 1 &&
    value.reserved_bytes <= MAX_RESERVATION_BYTES && value.state === 'committed');
}

function readRegular(file, io = fs) {
  let descriptor;
  try {
    descriptor = io.openSync(file, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0));
    const opened = io.fstatSync(descriptor);
    const named = io.lstatSync(file);
    if (!opened.isFile() || named.isSymbolicLink() || opened.dev !== named.dev || opened.ino !== named.ino) throw new Error('unsafe file');
    return { descriptor, stat: opened, text: io.readFileSync(descriptor, 'utf8') };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw reservationError();
  } finally {
    if (descriptor !== undefined) {
      try { io.closeSync(descriptor); } catch { /* read result is authoritative */ }
    }
  }
}

function readReservation(directory, options = {}) {
  const io = options.fs || fs;
  const target = paths(ensureDirectory(directory, io));
  const recordFile = readRegular(target.record, io);
  const dataFile = readRegular(target.data, io);
  if (!recordFile && !dataFile) return null;
  if (!recordFile || !dataFile) throw reservationError();
  let record;
  try { record = JSON.parse(recordFile.text); } catch { throw reservationError(); }
  if (!validRecord(record) || dataFile.stat.size !== record.reserved_bytes) throw reservationError();
  return Object.freeze({ batchToken: record.batch_token, reservationId: record.reservation_id, reservedBytes: record.reserved_bytes });
}

function materialize(file, bytes, io = fs) {
  let descriptor;
  try {
    descriptor = io.openSync(file, 'wx', 0o600);
    const chunk = Buffer.alloc(Math.min(CHUNK_BYTES, bytes));
    let written = 0;
    while (written < bytes) {
      const length = Math.min(chunk.length, bytes - written);
      const count = io.writeSync(descriptor, chunk, 0, length, null);
      if (!Number.isInteger(count) || count <= 0 || count > length) throw new Error('short write');
      written += count;
    }
    io.fsyncSync(descriptor);
    io.closeSync(descriptor);
    descriptor = undefined;
  } catch (error) {
    if (descriptor !== undefined) {
      try { io.closeSync(descriptor); } catch { /* narrow cleanup below */ }
    }
    throw error;
  }
}

function newReservationId(randomBytes = crypto.randomBytes) {
  try {
    const value = randomBytes(32).toString('hex');
    if (!RESERVATION_RE.test(value)) throw new Error('random failed');
    return value;
  } catch { throw reservationError(); }
}

// This is an intentionally unconnected foundation for bounded worker
// parallelism. It writes actual bytes, never sparse/truncated placeholders.
// The future coordinator must hold the global batch lock and persist a matching
// batch checkpoint before it may use the returned private capability.
function claimStorageReservation(directory, value, options = {}) {
  if (options.coordinator !== true) throw reservationError();
  const io = options.fs || fs;
  const request = validateRequest(value);
  const root = ensureDirectory(directory, io);
  if (readReservation(root, { fs: io }) !== null) throw reservationError();
  const target = paths(root);
  const reservationId = newReservationId(options.randomBytes);
  const temporaryData = path.join(root, `.${reservationId}.materializing`);
  try {
    // A unique temporary name prevents a losing claimant from ever confusing
    // another coordinator's not-yet-recorded reservation with its own work.
    // Any crash before the rename leaves an unexpected entry and therefore
    // blocks the future parallel path rather than triggering broad cleanup.
    materialize(temporaryData, request.reservedBytes, io);
    io.renameSync(temporaryData, target.data);
    const record = {
      schema: RESERVATION_SCHEMA,
      batch_token: request.batchToken,
      reservation_id: reservationId,
      reserved_bytes: request.reservedBytes,
      state: 'committed'
    };
    const temporary = `${target.record}.${reservationId}.tmp`;
    try {
      io.writeFileSync(temporary, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      io.renameSync(temporary, target.record);
    } catch (error) {
      try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch { /* exact temporary only */ }
      throw error;
    }
    return Object.freeze({ batchToken: request.batchToken, reservationId, reservedBytes: request.reservedBytes });
  } catch {
    // Never remove `reservation.bin`: without its record it can belong to a
    // coordinator that won the race just before publishing its journal. Only
    // the unique temporary path derived from this call may be cleaned up.
    try {
      if (io.existsSync(temporaryData)) {
        const stat = io.lstatSync(temporaryData);
        if (stat.isFile() && !stat.isSymbolicLink()) io.unlinkSync(temporaryData);
      }
    } catch { /* uncertainty remains fail-closed via the unexpected entry */ }
    throw reservationError();
  }
}

module.exports = {
  RESERVATION_SCHEMA,
  MAX_RESERVATION_BYTES,
  ensureDirectory,
  readReservation,
  claimStorageReservation,
  _test: { validRecord, materialize, paths }
};
