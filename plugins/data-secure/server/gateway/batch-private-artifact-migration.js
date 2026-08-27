'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { SCHEMA, V2_SCHEMA } = require('./batch-journal-store');
const { workPath } = require('./batch-private-store');
const { copySnapshotFile, exactPendingEntry } = require('./batch-snapshot');

const WORK_NAME_RE = /^[0-9]{3}_[a-f0-9]{24}(?:\.[a-z0-9]+)?$/iu;

function migrationError(code, message) {
  const error = new SafeError(message);
  error.code = code;
  return error;
}

function sameIdentity(left, right) {
  return left && right && left.dev === right.dev && left.ino === right.ino &&
    left.size === right.size && left.mtimeMs === right.mtimeMs;
}

function encryptedNameFor(item, index) {
  const ordinal = String(index + 1).padStart(3, '0');
  const suffix = crypto.createHash('sha256').update(String(item.id)).digest('hex').slice(0, 24);
  return `${ordinal}_${suffix}.dsart`;
}

function safeLegacyFile(root, name, io) {
  if (!WORK_NAME_RE.test(String(name || ''))) {
    throw migrationError('PRIVATE_ARTIFACT_LEGACY_INVALID', 'Eine alte private Arbeitskopie besitzt einen ungültigen Namen.');
  }
  const target = path.join(root, name);
  const stat = io.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw migrationError('PRIVATE_ARTIFACT_LEGACY_INVALID', 'Eine alte private Arbeitskopie ist nicht sicher verwendbar.');
  }
  return { target, stat };
}

function verifyEncryptedSidecar(state, item, targetName, artifactCrypto) {
  const probe = { ...item, work_name: targetName, private_artifact_encrypted: true };
  const bytes = exactPendingEntry(state, probe, { artifactCrypto });
  bytes.private_bytes.fill(0);
}

function cleanupLegacyCopies(state, deps) {
  const io = deps.fs || fs;
  const root = (deps.workPath || workPath)(state.token);
  let changed = false;
  for (const item of state.items) {
    if (!item.legacy_work_name) continue;
    const name = item.legacy_work_name;
    const target = path.join(root, name);
    try {
      const stat = io.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('unsafe');
      io.unlinkSync(target);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw migrationError('PRIVATE_ARTIFACT_LEGACY_CLEANUP_FAILED',
          'Eine alte private Klartextkopie konnte nicht sicher entfernt werden. Der Stapel bleibt gestoppt.');
      }
    }
    delete item.legacy_work_name;
    changed = true;
  }
  if (changed) deps.writeState(state);
  return state;
}

function migrateLegacyBatchState(state, deps = {}) {
  const io = deps.fs || fs;
  const artifactCrypto = deps.artifactCrypto;
  if (!artifactCrypto || typeof artifactCrypto.writeEncrypted !== 'function' ||
      typeof artifactCrypto.readEncrypted !== 'function' || typeof deps.writeState !== 'function') {
    throw migrationError('PRIVATE_ARTIFACT_MIGRATION_UNAVAILABLE',
      'Die sichere Migration alter privater Arbeitskopien ist nicht verfügbar.');
  }
  if (state.schema === SCHEMA) return cleanupLegacyCopies(state, { ...deps, fs: io });
  if (state.schema !== V2_SCHEMA) {
    throw migrationError('PRIVATE_ARTIFACT_LEGACY_MIGRATION_REQUIRED',
      'Diese alte Stapelversion bleibt unverändert erhalten und benötigt eine ausdrückliche lokale Migration.');
  }

  artifactCrypto.ensureReady?.();
  const root = (deps.workPath || workPath)(state.token);
  const next = JSON.parse(JSON.stringify(state));
  const created = [];
  const migrated = [];
  try {
    for (let index = 0; index < next.items.length; index++) {
      const item = next.items[index];
      if (!item.work_name) continue;
      const legacy = safeLegacyFile(root, item.work_name, io);
      if (String(item.work_name).endsWith('.dsart')) {
        try {
          const verified = artifactCrypto.readEncrypted(legacy.target, {
            purpose: 'batch-snapshot', objectId: `${state.token}:${item.id}`
          });
          const digest = crypto.createHash('sha256').update(verified).digest('hex');
          const valid = verified.length === item.size && digest === item.sha256;
          verified.fill(0);
          if (valid) {
            item.private_artifact_encrypted = true;
            continue;
          }
        } catch { /* a plaintext or damaged pseudo-envelope follows the normal migration path */ }
      }
      let encryptedName = encryptedNameFor(item, index);
      if (encryptedName === item.work_name) encryptedName = `${String(index + 1).padStart(3, '0')}_${crypto.randomBytes(12).toString('hex')}.dsart`;
      const encryptedTarget = path.join(root, encryptedName);
      if (io.existsSync(encryptedTarget)) {
        verifyEncryptedSidecar(next, item, encryptedName, artifactCrypto);
      } else {
        copySnapshotFile(legacy.target, encryptedTarget, legacy.stat, {
          fs: io,
          expectedSha256: item.sha256,
          artifactCrypto,
          binding: { purpose: 'batch-snapshot', objectId: `${state.token}:${item.id}` }
        });
        created.push(encryptedTarget);
      }
      migrated.push({ legacy, encryptedTarget });
      item.legacy_work_name = item.work_name;
      item.work_name = encryptedName;
      item.private_artifact_encrypted = true;
    }
    next.schema = SCHEMA;
    deps.writeState(next);
  } catch (error) {
    for (const target of created) {
      try { io.unlinkSync(target); } catch { /* old plaintext remains authoritative */ }
    }
    throw error;
  }

  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, next);
  for (const pair of migrated) {
    let current;
    try { current = io.lstatSync(pair.legacy.target); }
    catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw migrationError('PRIVATE_ARTIFACT_LEGACY_CLEANUP_FAILED',
        'Eine alte private Klartextkopie konnte nicht sicher geprüft werden. Der Stapel bleibt gestoppt.');
    }
    if (!current.isFile() || current.isSymbolicLink() || !sameIdentity(current, pair.legacy.stat)) {
      throw migrationError('PRIVATE_ARTIFACT_LEGACY_CLEANUP_FAILED',
        'Eine alte private Klartextkopie wurde während der Migration verändert. Der Stapel bleibt gestoppt.');
    }
    try { io.unlinkSync(pair.legacy.target); }
    catch {
      throw migrationError('PRIVATE_ARTIFACT_LEGACY_CLEANUP_FAILED',
        'Eine alte private Klartextkopie konnte nicht sicher entfernt werden. Der Stapel bleibt gestoppt.');
    }
  }
  for (const item of state.items) delete item.legacy_work_name;
  deps.writeState(state);
  return state;
}

module.exports = Object.freeze({ encryptedNameFor, migrateLegacyBatchState });
