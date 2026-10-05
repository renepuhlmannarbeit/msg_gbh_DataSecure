'use strict';
const { readHeldBytes } = require('../core/bound-file-io');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { SUPPORTED, privacyRoot, roots } = require('./common');
const { processAlive } = require('./process-liveness');
const { writeFully, syncParentDirectory, renameWithTransientRetry } = require('./batch-journal-io');

const SCHEMA = 'datasecure-legacy-input-migration/1';
const MARKER_NAME = 'legacy-input-v1.json';
const LOCK_NAME = '.legacy-input-v1.lock';
const LOCK_QUARANTINE_PREFIX = `${LOCK_NAME}.quarantine.`;
const CLAIM_PATTERN = /^\.processing_([a-z0-9]+_[0-9a-f]{8})_(.+)$/i;

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function secureDirectory(directory, label) {
  const named = fs.lstatSync(directory);
  const opened = fs.statSync(directory);
  if (!named.isDirectory() || named.isSymbolicLink() || !opened.isDirectory() ||
      named.dev !== opened.dev || named.ino !== opened.ino) {
    throw new SafeError(`${label} ist kein sicherer lokaler Ordner.`);
  }
  fs.realpathSync.native(directory);
}

function readOwner(jobDir) {
  let descriptor;
  try {
    const jobStat = fs.lstatSync(jobDir);
    if (!jobStat.isDirectory() || jobStat.isSymbolicLink()) return { state: 'invalid' };
    const ownerPath = path.join(jobDir, '.owner.json');
    descriptor = fs.openSync(ownerPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
    const opened = fs.fstatSync(descriptor);
    const named = fs.lstatSync(ownerPath);
    if (!opened.isFile() || named.isSymbolicLink() || !sameFile(opened, named)) return { state: 'invalid' };
    const owner = JSON.parse(readHeldBytes(descriptor, opened.size, fs, 4096).toString('utf8'));
    if (!owner || !Number.isSafeInteger(owner.pid) ||
        !/^[0-9a-f]{32}$/i.test(String(owner.nonce || '')) ||
        Number.isNaN(Date.parse(owner.created_at)) ||
        Object.keys(owner).sort().join(',') !== 'created_at,nonce,pid') return { state: 'invalid' };
    return { state: 'valid', owner };
  } catch (error) {
    return error.code === 'ENOENT' ? { state: 'absent' } : { state: 'invalid' };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function recoveryDestination(inputDir, originalName, claimedStat) {
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);
  for (let index = 0; index < 1000; index++) {
    const name = index === 0 ? originalName : `${base}_wiederhergestellt_${index + 1}${ext}`;
    const destination = path.join(inputDir, name);
    try {
      const existing = fs.lstatSync(destination);
      if (existing.isFile() && !existing.isSymbolicLink() && sameFile(existing, claimedStat)) {
        return { destination, alreadyLinked: true };
      }
    } catch (error) {
      if (error.code === 'ENOENT') return { destination, alreadyLinked: false };
      throw error;
    }
  }
  throw new SafeError('Ein historischer lokaler Dateianspruch konnte nicht kollisionsfrei gesichert werden.');
}

function markerPath(locations = roots()) {
  return path.join(locations.migrations, MARKER_NAME);
}

function readMarker(target) {
  if (!fs.existsSync(target)) return null;
  let value;
  try { value = JSON.parse(fs.readFileSync(target, 'utf8')); } catch { throw new Error('LEGACY_INPUT_MARKER_INVALID'); }
  const keys = Object.keys(value || {}).sort().join(',');
  if (keys !== 'claims_preserved,completed_at,retained_visible_sources,schema,state' ||
      value.schema !== SCHEMA || !['complete', 'not_present'].includes(value.state) ||
      !Number.isSafeInteger(value.claims_preserved) || value.claims_preserved < 0 ||
      !Number.isSafeInteger(value.retained_visible_sources) || value.retained_visible_sources < 0 ||
      Number.isNaN(Date.parse(value.completed_at))) throw new Error('LEGACY_INPUT_MARKER_INVALID');
  return value;
}

function writeMarker(target, value, options = {}) {
  const io = options.io || fs;
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  let descriptor;
  try {
    descriptor = io.openSync(temporary, 'wx', 0o600);
    writeFully(descriptor, `${JSON.stringify(value)}\n`, io);
    io.fsyncSync(descriptor);
    io.closeSync(descriptor);
    descriptor = undefined;
    renameWithTransientRetry(temporary, target, io);
    syncParentDirectory(target, io, options.platform || process.platform);
  } finally {
    if (descriptor !== undefined) io.closeSync(descriptor);
    try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch { /* marker remains fail-closed */ }
  }
}

function readLock(target) {
  let descriptor;
  try {
    descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
    const opened = fs.fstatSync(descriptor);
    const named = fs.lstatSync(target);
    if (!opened.isFile() || named.isSymbolicLink() || !sameFile(opened, named)) throw new Error('invalid');
    const value = JSON.parse(readHeldBytes(descriptor, opened.size, fs, 4096).toString('utf8'));
    if (!value || value.schema !== SCHEMA || !Number.isSafeInteger(value.pid) ||
        !/^[0-9a-f]{32}$/i.test(String(value.nonce || '')) ||
        Number.isNaN(Date.parse(value.created_at)) ||
        Object.keys(value).sort().join(',') !== 'created_at,nonce,pid,schema') throw new Error('invalid');
    return { value, stat: opened };
  } catch { throw new Error('LEGACY_INPUT_MIGRATION_LOCK_INVALID'); }
  finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

function assertNoQuarantinedLocks(directory) {
  const blocked = fs.readdirSync(directory).some((name) => name.startsWith(LOCK_QUARANTINE_PREFIX));
  if (blocked) throw new Error('LEGACY_INPUT_MIGRATION_LOCK_CHANGED');
}

function restoreChangedLock(quarantine, target) {
  try {
    fs.linkSync(quarantine, target); // Atomic create-if-absent; never overwrites a successor.
    fs.unlinkSync(quarantine);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    // A successor already owns the canonical name. Keep the unexpected lock
    // quarantined so every later acquisition fails closed for manual review.
  }
}

function removeOwnedLock(lock, purpose, options = {}) {
  const quarantine = `${lock.target}.quarantine.${purpose}.${lock.value.nonce}`;
  if (fs.existsSync(quarantine)) throw new Error('LEGACY_INPUT_MIGRATION_LOCK_CHANGED');
  if (typeof options.beforeLockQuarantine === 'function') options.beforeLockQuarantine({ ...lock, purpose });
  fs.renameSync(lock.target, quarantine);
  const moved = fs.lstatSync(quarantine);
  if (!moved.isFile() || moved.isSymbolicLink() || !sameFile(moved, lock.stat)) {
    restoreChangedLock(quarantine, lock.target);
    throw new Error('LEGACY_INPUT_MIGRATION_LOCK_CHANGED');
  }
  fs.unlinkSync(quarantine);
}

function acquireLock(directory, options = {}) {
  const target = path.join(directory, LOCK_NAME);
  const now = Number(options.now instanceof Date ? options.now.valueOf() : options.now || Date.now());
  const isProcessAlive = options.isProcessAlive || processAlive;
  for (let attempt = 0; attempt < 2; attempt++) {
    assertNoQuarantinedLocks(directory);
    let descriptor;
    try {
      descriptor = fs.openSync(target, 'wx', 0o600);
      const value = { schema: SCHEMA, pid: process.pid, created_at: new Date(now).toISOString(), nonce: crypto.randomBytes(16).toString('hex') };
      writeFully(descriptor, JSON.stringify(value), fs);
      fs.fsyncSync(descriptor);
      const stat = fs.fstatSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      return { target, stat, value };
    } catch (error) {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (error.code !== 'EEXIST') throw error;
      const existing = readLock(target);
      const age = now - Date.parse(existing.value.created_at);
      if (age < 0 || (age <= 12 * 60 * 60 * 1000 && isProcessAlive(existing.value.pid))) return null;
      removeOwnedLock({ target, stat: existing.stat, value: existing.value }, 'reclaim', options);
    }
  }
  throw new Error('LEGACY_INPUT_MIGRATION_LOCK_BUSY');
}

function releaseLock(lock, options = {}) {
  if (!lock) return;
  removeOwnedLock(lock, 'release', options);
}

function migrateLegacyInputV1(options = {}) {
  const locations = options.locations || roots();
  const input = options.input || path.join(privacyRoot(), 'Input');
  const jobs = options.jobs || locations.jobs;
  const target = options.marker || markerPath(locations);
  const lock = acquireLock(path.dirname(target), options);
  if (!lock) return { schema: SCHEMA, state: 'deferred', claims_preserved: 0, retained_visible_sources: 0, failures: 0, active: 1 };
  try {
    // The marker is authoritative and must be read while holding the lock.
    // A completed one-time migration never inspects a later Input path again.
    const existingMarker = readMarker(target);
    if (existingMarker) return { ...existingMarker, failures: 0, active: 0 };
    if (!fs.existsSync(input)) {
      const result = { schema: SCHEMA, state: 'not_present', claims_preserved: 0, retained_visible_sources: 0 };
      writeMarker(target, { ...result, completed_at: new Date(options.now || Date.now()).toISOString() }, options);
      return { ...result, failures: 0, active: 0 };
    }

  secureDirectory(input, 'Der historische lokale Eingangsordner');
  secureDirectory(jobs, 'Der Bereich für private Arbeitskopien');
  const now = options.now instanceof Date ? options.now.valueOf() : Number(options.now || Date.now());
  const maxOwnedAgeMs = options.maxOwnedAgeMs ?? 12 * 60 * 60 * 1000;
  const isProcessAlive = options.isProcessAlive || processAlive;
  if (!Number.isFinite(now) || !Number.isFinite(maxOwnedAgeMs) || maxOwnedAgeMs < 0) {
    throw new SafeError('Ungültige Zeitgrenze für die historische lokale Migration.');
  }

  let retainedVisibleSources = 0;
  let claimsPreserved = 0;
  let active = 0;
  let failures = 0;
  const plans = [];
  for (const entry of fs.readdirSync(input, { withFileTypes: true })) {
    if (!entry.name.startsWith('.processing_')) {
      retainedVisibleSources++;
      continue;
    }
    const match = CLAIM_PATTERN.exec(entry.name);
    if (!match) { failures++; continue; }
    const [, jobId, originalName] = match;
    if (!originalName || originalName.startsWith('.') || path.basename(originalName) !== originalName ||
        !SUPPORTED.has(path.extname(originalName).toLowerCase())) { failures++; continue; }
    const claim = path.join(input, entry.name);
    try {
      const claimedStat = fs.lstatSync(claim);
      if (!entry.isFile() || !claimedStat.isFile() || claimedStat.isSymbolicLink()) { failures++; continue; }
      const ownership = readOwner(path.join(jobs, jobId));
      if (ownership.state === 'invalid') { failures++; continue; }
      if (ownership.state === 'valid') {
        const age = now - Date.parse(ownership.owner.created_at);
        if (age < 0) { failures++; continue; }
        if (age <= maxOwnedAgeMs && isProcessAlive(ownership.owner.pid)) { active++; continue; }
      }
      const destination = recoveryDestination(input, originalName, claimedStat);
      plans.push({ claim, claimedStat, destination });
    } catch { failures++; }
  }

  // Invalid or active legacy state blocks before creating any new visible link.
  if (failures > 0 || active > 0) {
    return { schema: SCHEMA, state: failures > 0 ? 'blocked' : 'deferred', claims_preserved: 0, retained_visible_sources: retainedVisibleSources, failures, active };
  }
  for (const plan of plans) {
    if (plan.destination.alreadyLinked) { claimsPreserved++; continue; }
    try {
      const currentBefore = fs.lstatSync(plan.claim);
      if (!currentBefore.isFile() || currentBefore.isSymbolicLink() || !sameFile(currentBefore, plan.claimedStat)) {
        throw new Error('LEGACY_INPUT_CLAIM_CHANGED');
      }
      fs.linkSync(plan.claim, plan.destination.destination);
      const currentClaim = fs.lstatSync(plan.claim);
      const currentDestination = fs.lstatSync(plan.destination.destination);
      if (!currentClaim.isFile() || currentClaim.isSymbolicLink() ||
          !currentDestination.isFile() || currentDestination.isSymbolicLink() ||
          !sameFile(currentClaim, plan.claimedStat) || !sameFile(currentDestination, plan.claimedStat)) {
        try { fs.unlinkSync(plan.destination.destination); } catch { /* fail closed below */ }
        throw new Error('LEGACY_INPUT_CLAIM_CHANGED');
      }
      // The historical hidden name is retained as an additional hard link.
      // This deliberately preserves the old source object across update and rollback.
      claimsPreserved++;
    } catch { failures++; }
  }

  const state = failures > 0 ? 'blocked' : active > 0 ? 'deferred' : 'complete';
  const result = { schema: SCHEMA, state, claims_preserved: claimsPreserved, retained_visible_sources: retainedVisibleSources, failures, active };
  if (state === 'complete') {
    writeMarker(target, {
      schema: SCHEMA,
      state,
      claims_preserved: claimsPreserved,
      retained_visible_sources: retainedVisibleSources,
      completed_at: new Date(now).toISOString()
    }, options);
  }
  return result;
  } finally {
    releaseLock(lock, options);
  }
}

module.exports = { SCHEMA, migrateLegacyInputV1, readMarker, _test: { recoveryDestination, readOwner, writeMarker, acquireLock, releaseLock } };
