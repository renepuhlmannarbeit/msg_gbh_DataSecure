'use strict';

const fs = require('fs');
const path = require('path');
const { SafeError } = require('../runtime');
const { SUPPORTED, roots } = require('./common');

const CLAIM_PATTERN = /^\.processing_([a-z0-9]+_[0-9a-f]{8})_(.+)$/i;

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function secureDirectory(directory, label) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new SafeError(`${label} ist kein sicherer lokaler Ordner.`);
  }
  return {
    resolved: path.resolve(directory),
    real: fs.realpathSync.native(directory)
  };
}

function readOwner(jobDir) {
  let descriptor;
  try {
    const stat = fs.lstatSync(jobDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return { state: 'invalid' };
    const ownerPath = path.join(jobDir, '.owner.json');
    descriptor = fs.openSync(ownerPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const ownerStat = fs.fstatSync(descriptor);
    const namedOwner = fs.lstatSync(ownerPath);
    if (!ownerStat.isFile() || namedOwner.isSymbolicLink() ||
        namedOwner.dev !== ownerStat.dev || namedOwner.ino !== ownerStat.ino) return { state: 'invalid' };
    const owner = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
    if (
      !owner || !Number.isSafeInteger(owner.pid) ||
      !/^[0-9a-f]{32}$/i.test(String(owner.nonce || '')) ||
      Number.isNaN(Date.parse(owner.created_at)) ||
      Object.keys(owner).sort().join(',') !== 'created_at,nonce,pid'
    ) return { state: 'invalid' };
    return { state: 'valid', owner };
  } catch (error) {
    return error.code === 'ENOENT' ? { state: 'absent' } : { state: 'invalid' };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
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
  throw new SafeError('Eine abgebrochene Eingabedatei konnte nicht kollisionsfrei wiederhergestellt werden.');
}

// Claims are hard-linked to a visible name before the hidden name is removed.
// Unlike rename on POSIX, link never overwrites a file that appeared between
// inspection and recovery. A crash between both operations is recognized by
// inode on the next startup and completed without creating another copy.
function recoverAbandonedInputClaims(options = {}) {
  const locations = options.locations || roots();
  const input = options.input || locations.input;
  const jobs = options.jobs || locations.jobs;
  secureDirectory(input, 'Der lokale Eingangsordner');
  secureDirectory(jobs, 'Der Bereich für private Arbeitskopien');
  const isProcessAlive = options.isProcessAlive || processAlive;
  const now = options.now instanceof Date ? options.now.valueOf() : Number(options.now || Date.now());
  const maxOwnedAgeMs = options.maxOwnedAgeMs ?? 12 * 60 * 60 * 1000;
  if (!Number.isFinite(now) || !Number.isFinite(maxOwnedAgeMs) || maxOwnedAgeMs < 0) {
    throw new SafeError('Ungültige Zeitgrenze für die Wiederherstellung abgebrochener Eingabedateien.');
  }
  let recovered = 0;
  let active = 0;
  let ignored = 0;
  let failures = 0;

  for (const entry of fs.readdirSync(input, { withFileTypes: true })) {
    if (!entry.name.startsWith('.processing_')) continue;
    const match = CLAIM_PATTERN.exec(entry.name);
    if (!match) { failures++; continue; }
    const [, jobId, originalName] = match;
    if (
      !originalName || originalName.startsWith('.') ||
      path.basename(originalName) !== originalName ||
      !SUPPORTED.has(path.extname(originalName).toLowerCase())
    ) { failures++; continue; }

    const claim = path.join(input, entry.name);
    try {
      const claimedStat = fs.lstatSync(claim);
      if (!entry.isFile() || !claimedStat.isFile() || claimedStat.isSymbolicLink()) {
        failures++;
        continue;
      }
      const ownership = readOwner(path.join(jobs, jobId));
      if (ownership.state === 'invalid') {
        failures++;
        continue;
      }
      if (ownership.state === 'valid') {
        const ownerAgeMs = now - Date.parse(ownership.owner.created_at);
        if (ownerAgeMs < 0) {
          failures++;
          continue;
        }
        if (ownerAgeMs <= maxOwnedAgeMs && isProcessAlive(ownership.owner.pid)) {
          active++;
          continue;
        }
      }
      const { destination, alreadyLinked } = recoveryDestination(input, originalName, claimedStat);
      let linkedByRecovery = false;
      if (!alreadyLinked) {
        fs.linkSync(claim, destination);
        linkedByRecovery = true;
      }
      const currentClaim = fs.lstatSync(claim);
      const currentDestination = fs.lstatSync(destination);
      if (
        !currentClaim.isFile() || currentClaim.isSymbolicLink() ||
        !currentDestination.isFile() || currentDestination.isSymbolicLink() ||
        !sameFile(currentClaim, claimedStat) || !sameFile(currentDestination, claimedStat)
      ) {
        if (linkedByRecovery) {
          try { fs.unlinkSync(destination); } catch { /* fail closed below */ }
        }
        throw new Error('claim changed during recovery');
      }
      fs.unlinkSync(claim);
      recovered++;
    } catch {
      failures++;
    }
  }
  return { recovered, active, ignored, failures };
}

module.exports = { recoverAbandonedInputClaims };
