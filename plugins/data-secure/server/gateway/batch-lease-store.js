'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');

const LEASE_SCHEMA = 'datasecure-worker-lease/1';
const SLOT_COUNT = 2;
const TOKEN_RE = /^[a-f0-9]{64}$/;
const ITEM_RE = /^[a-f0-9]{32}$/;
const LEASE_RE = /^[a-f0-9]{64}$/;

function privateLeaseError() {
  return new SafeError('Die lokale Worker-Sperre ist nicht sicher verfügbar.');
}

function validateIdentity(value = {}) {
  if (!TOKEN_RE.test(String(value.batchToken || '')) || !ITEM_RE.test(String(value.itemId || '')) ||
    !Number.isSafeInteger(value.pid) || value.pid <= 0) throw privateLeaseError();
  return { batchToken: value.batchToken, itemId: value.itemId, pid: value.pid };
}

function slotPath(directory, slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot > SLOT_COUNT) throw privateLeaseError();
  return path.join(directory, `slot-${slot}.lease`);
}

function ensureLeaseDirectory(directory, io = fs) {
  if (typeof directory !== 'string' || directory.trim() === '') throw privateLeaseError();
  const target = path.resolve(String(directory || ''));
  if (!path.isAbsolute(target)) throw privateLeaseError();
  try {
    try { io.mkdirSync(target, { recursive: false, mode: 0o700 }); }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
    const stat = io.lstatSync(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe lease directory');
    const names = io.readdirSync(target);
    const allowed = new Set(Array.from({ length: SLOT_COUNT }, (_, index) => `slot-${index + 1}.lease`));
    if (names.some((name) => !allowed.has(name))) throw new Error('unexpected lease entry');
    return target;
  } catch { throw privateLeaseError(); }
}

function validLease(value, slot) {
  const expectedKeys = ['schema', 'batch_token', 'item_id', 'lease_id', 'pid'];
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(value, key)) &&
    value.schema === LEASE_SCHEMA && TOKEN_RE.test(String(value.batch_token || '')) &&
    ITEM_RE.test(String(value.item_id || '')) && LEASE_RE.test(String(value.lease_id || '')) &&
    Number.isSafeInteger(value.pid) && value.pid > 0 && Number.isInteger(slot) && slot >= 1 && slot <= SLOT_COUNT);
}

function readLease(directory, slot, io = fs) {
  const target = slotPath(directory, slot);
  let descriptor;
  try {
    descriptor = io.openSync(target, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0));
    const opened = io.fstatSync(descriptor);
    const named = io.lstatSync(target);
    if (!opened.isFile() || named.isSymbolicLink() || opened.dev !== named.dev || opened.ino !== named.ino) {
      throw new Error('unsafe lease');
    }
    const value = JSON.parse(io.readFileSync(descriptor, 'utf8'));
    if (!validLease(value, slot)) throw new Error('invalid lease');
    return { slot, batchToken: value.batch_token, itemId: value.item_id, leaseId: value.lease_id, pid: value.pid };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw privateLeaseError();
  } finally {
    if (descriptor !== undefined) {
      try { io.closeSync(descriptor); } catch { /* read outcome is authoritative */ }
    }
  }
}

function scanLeases(directory, io = fs) {
  ensureLeaseDirectory(directory, io);
  const leases = [];
  for (let slot = 1; slot <= SLOT_COUNT; slot++) {
    const lease = readLease(directory, slot, io);
    if (lease) leases.push(lease);
  }
  return leases;
}

function randomLeaseId(randomBytes = crypto.randomBytes) {
  try {
    const id = randomBytes(32).toString('hex');
    if (!LEASE_RE.test(id)) throw new Error('invalid random id');
    return id;
  } catch { throw privateLeaseError(); }
}

function createLease(directory, slot, identity, options = {}) {
  const io = options.fs || fs;
  const leaseId = randomLeaseId(options.randomBytes);
  const record = {
    schema: LEASE_SCHEMA,
    batch_token: identity.batchToken,
    item_id: identity.itemId,
    lease_id: leaseId,
    pid: identity.pid
  };
  const target = slotPath(directory, slot);
  let descriptor;
  try {
    descriptor = io.openSync(target, 'wx', 0o600);
    io.writeFileSync(descriptor, `${JSON.stringify(record)}\n`, 'utf8');
    io.fsyncSync(descriptor);
    io.closeSync(descriptor);
    descriptor = undefined;
    return { slot, batchToken: identity.batchToken, itemId: identity.itemId, leaseId, pid: identity.pid };
  } catch (error) {
    if (descriptor !== undefined) {
      try { io.closeSync(descriptor); } catch { /* cleanup below stays narrowly scoped */ }
    }
    // A partially written record must remain blocking unless this process can
    // prove it created the exact slot and remove it.  `wx` means EEXIST is
    // another claimant, never a file to alter.
    if (error?.code !== 'EEXIST') {
      try {
        const existing = readLease(directory, slot, io);
        if (existing?.leaseId === leaseId) io.unlinkSync(target);
      } catch { /* unknown record remains fail-closed */ }
    }
    if (error?.code === 'EEXIST') return null;
    throw privateLeaseError();
  }
}

function claimPreparationLease(directory, value, options = {}) {
  const io = options.fs || fs;
  const identity = validateIdentity(value);
  const target = ensureLeaseDirectory(directory, io);
  const existing = scanLeases(target, io);
  if (existing.some((lease) => lease.batchToken === identity.batchToken && lease.itemId === identity.itemId)) {
    throw privateLeaseError();
  }
  for (let slot = 1; slot <= SLOT_COUNT; slot++) {
    if (existing.some((lease) => lease.slot === slot)) continue;
    const lease = createLease(target, slot, identity, { ...options, fs: io });
    if (lease) return Object.freeze(lease);
  }
  throw privateLeaseError();
}

function assertPreparationLease(directory, lease, value = {}, options = {}) {
  const identity = validateIdentity({ batchToken: value.batchToken, itemId: value.itemId, pid: value.pid });
  if (!lease || !Number.isInteger(lease.slot) || !LEASE_RE.test(String(lease.leaseId || ''))) throw privateLeaseError();
  const stored = readLease(ensureLeaseDirectory(directory, options.fs || fs), lease.slot, options.fs || fs);
  if (!stored || stored.leaseId !== lease.leaseId || stored.batchToken !== identity.batchToken ||
    stored.itemId !== identity.itemId || stored.pid !== identity.pid) throw privateLeaseError();
  return true;
}

function releasePreparationLease(directory, lease, value = {}, options = {}) {
  const io = options.fs || fs;
  assertPreparationLease(directory, lease, value, { ...options, fs: io });
  const target = slotPath(ensureLeaseDirectory(directory, io), lease.slot);
  try {
    // Verify once more immediately before deletion; a replacement lease never
    // becomes deletable merely because it happens to use the same slot.
    assertPreparationLease(directory, lease, value, { ...options, fs: io });
    io.unlinkSync(target);
    return true;
  } catch (error) {
    if (error instanceof SafeError) throw error;
    throw privateLeaseError();
  }
}

function processDefinitelyDead(pid, kill = process.kill) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return false;
  } catch (error) {
    // EPERM and platform-specific failures are deliberately not interpreted as
    // death. Availability may suffer, but an unknown owner must never be
    // replaced by a second local worker.
    return error?.code === 'ESRCH';
  }
}

// This operation is intentionally not called by the normal path yet. A future
// central coordinator must first persist a retryable or terminal item state
// under its existing active lock, then pass exactly that approved item set.
// The store itself never guesses state, starts a worker, or turns an unknown
// liveness result into permission to delete a lease.
function recoverStalePreparationLeases(directory, batchToken, reclaimableItemIds, options = {}) {
  if (options.coordinator !== true || !TOKEN_RE.test(String(batchToken || '')) ||
    !(reclaimableItemIds instanceof Set) || ![...reclaimableItemIds].every((itemId) => ITEM_RE.test(String(itemId)))) {
    throw privateLeaseError();
  }
  const io = options.fs || fs;
  const target = ensureLeaseDirectory(directory, io);
  const definitelyDead = options.processDefinitelyDead || processDefinitelyDead;
  const leases = scanLeases(target, io);
  let recovered = 0;
  for (const lease of leases) {
    if (lease.batchToken !== batchToken || !reclaimableItemIds.has(lease.itemId)) throw privateLeaseError();
    let dead = false;
    try { dead = definitelyDead(lease.pid) === true; } catch { dead = false; }
    if (!dead) continue;
    // A second exact read keeps a changed slot blocking. This method is called
    // only while the central active lock is held; it never races a legitimate
    // worker or performs broad directory cleanup.
    const current = readLease(target, lease.slot, io);
    if (!current || current.leaseId !== lease.leaseId || current.pid !== lease.pid ||
      current.batchToken !== batchToken || current.itemId !== lease.itemId) throw privateLeaseError();
    try { io.unlinkSync(slotPath(target, lease.slot)); }
    catch { throw privateLeaseError(); }
    recovered++;
  }
  return Object.freeze({ recovered });
}

module.exports = {
  LEASE_SCHEMA,
  SLOT_COUNT,
  ensureLeaseDirectory,
  scanLeases,
  claimPreparationLease,
  assertPreparationLease,
  releasePreparationLease,
  recoverStalePreparationLeases,
  _test: { validLease, readLease, slotPath, processDefinitelyDead }
};
