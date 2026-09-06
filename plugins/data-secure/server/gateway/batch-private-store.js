'use strict';

const path = require('path');
const fs = require('fs');
const { SafeError, dataRoot } = require('../runtime');
const { ensurePrivateDirectory, hasReparseComponent, safeRemovePrivateTree } = require('./common');

const TOKEN_RE = /^[a-f0-9]{64}$/;
const TRANSIENT_DELETE_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
let verifiedBatchRootSession;

function retryDelay(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function retryTransientDelete(operation, revalidate) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      operation();
      return;
    } catch (error) {
      if (!TRANSIENT_DELETE_CODES.has(error?.code) || attempt === 3) throw error;
      retryDelay(10 * (attempt + 1));
      revalidate();
    }
  }
}

function batchRoot() {
  // Resolve the configuration dynamically. The verified directory identity is
  // cached only for the current absolute product root and is rechecked on every
  // use; changing the supported test/product root establishes a new session.
  const configured = path.resolve(dataRoot());
  if (verifiedBatchRootSession?.key === configured) {
    try {
      const currentGateway = fs.lstatSync(verifiedBatchRootSession.gateway, { bigint: true });
      const currentBatch = fs.lstatSync(verifiedBatchRootSession.target, { bigint: true });
      const same = (current, expected) => current.isDirectory() && !current.isSymbolicLink() &&
        String(current.dev) === expected.dev && String(current.ino) === expected.ino;
      if (same(currentGateway, verifiedBatchRootSession.gatewayIdentity) &&
          same(currentBatch, verifiedBatchRootSession.targetIdentity)) return verifiedBatchRootSession.target;
    } catch { /* fail closed below */ }
    throw new Error('PRIVACY_STORAGE_UNSAFE');
  }
  const gatewayRoot = ensurePrivateDirectory(path.dirname(configured), path.basename(configured));
  const target = ensurePrivateDirectory(gatewayRoot, 'batches');
  const identity = (entry) => Object.freeze({ dev: String(entry.dev), ino: String(entry.ino) });
  verifiedBatchRootSession = Object.freeze({
    key: configured,
    gateway: gatewayRoot,
    target,
    gatewayIdentity: identity(fs.lstatSync(gatewayRoot, { bigint: true })),
    targetIdentity: identity(fs.lstatSync(target, { bigint: true }))
  });
  return target;
}

function validatedToken(token) {
  const value = String(token || '');
  if (!TOKEN_RE.test(value)) throw new SafeError('Ungültige oder abgelaufene Batch-Sitzung.');
  return value;
}

function batchPath(token) {
  return path.join(batchRoot(), `${validatedToken(token)}.json`);
}

function workPath(token) {
  return path.join(batchRoot(), `${validatedToken(token)}.work`);
}

// Shared deletion guard: only inspect the fixed legacy magic, never decrypt
// or resolve a key. Uncertain reads and renamed envelopes remain untouched.
function assertPlainWorkFile(target, io = fs) {
  if (/\.dsart$/iu.test(target)) throw legacyCopyError();
  // NTFS inode values can exceed Number.MAX_SAFE_INTEGER. Rounded identifiers
  // must never merge distinct work copies or conceal an object substitution.
  const named = io.lstatSync(target, { bigint: true });
  if (!named.isFile() || named.isSymbolicLink()) throw new Error('BATCH_WORK_UNSAFE');
  let fd;
  try {
    fd = io.openSync(target, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0));
    const opened = io.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.dev !== named.dev || opened.ino !== named.ino) throw new Error('BATCH_WORK_UNSAFE');
    const header = Buffer.alloc(8);
    let offset = 0;
    while (offset < header.length) {
      const count = io.readSync(fd, header, offset, header.length - offset, offset);
      if (count === 0) break;
      if (!Number.isSafeInteger(count) || count < 0 || count > header.length - offset) throw new Error('BATCH_WORK_UNSAFE');
      offset += count;
    }
    if (offset === 8 && header.equals(Buffer.from('DSARTF01'))) throw legacyCopyError();
    const again = io.lstatSync(target, { bigint: true });
    if (!again.isFile() || again.isSymbolicLink() || again.dev !== opened.dev || again.ino !== opened.ino ||
        again.size !== named.size || again.mtimeNs !== named.mtimeNs) throw new Error('BATCH_WORK_UNSAFE');
    return again;
  } finally {
    if (fd !== undefined) io.closeSync(fd);
  }
}

function legacyCopyError() {
  const error = new SafeError('Eine alte verschlüsselte Arbeitskopie bleibt unverändert erhalten. Bitte die Originaldateien neu auswählen.');
  error.code = 'PRIVATE_ARTIFACT_LEGACY_ENCRYPTED_UNSUPPORTED';
  return error;
}

function safeRemoveWorkDirectory(token, options = {}) {
  const value = validatedToken(token);
  try {
    const root = batchRoot();
    const target = path.join(root, `${value}.work`);
    if (!fs.existsSync(target)) return;
    const stat = fs.lstatSync(target, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('BATCH_WORK_UNSAFE');
    const identity = (entry) => ({ dev: String(entry.dev), ino: String(entry.ino), birthtimeNs: String(entry.birthtimeNs) });
    const rootIdentity = identity(fs.lstatSync(root, { bigint: true }));
    const same = (left, right) => ['dev', 'ino', 'birthtimeNs'].every((key) => left[key] === right[key]);
    if (options.expectedIdentity && JSON.stringify(identity(stat)) !== JSON.stringify(options.expectedIdentity)) throw new Error('BATCH_WORK_UNSAFE');
    const entries = fs.readdirSync(target, { withFileTypes: true });
    if (entries.length > 400) throw new Error('BATCH_WORK_UNSAFE');
    // Journal-owned historical work trees may contain regular nested helper
    // files. Retain that existing explicit-discard contract, but preflight ALL
    // headers before removal. Intake-orphan intents authorize only flat copies.
    if (!options.expectedIdentity && entries.some((entry) => entry.isDirectory())) {
      // Current work areas are flat. A nested historical tree cannot be
      // classified and deleted atomically with portable Node path APIs, so it
      // remains untouched for explicit local support review.
      throw new Error('BATCH_WORK_UNSAFE');
    }
    // Batch work areas are flat. Preflight every sibling before the first
    // deletion, including interrupted atomic-write temporary files.
    const plan = [];
    const links = new Map();
    for (const entry of entries) {
      if (!entry.isFile() || !/^(?:[0-9]{3}_[a-f0-9]{24}(?:\.[a-z0-9]+)?|\.[0-9]{3}_[a-f0-9]{24}\.workcopy\.[a-f0-9]{24}\.tmp)$/iu.test(entry.name)) throw new Error('BATCH_WORK_UNSAFE');
      const full = path.join(target, entry.name);
      const fileStat = assertPlainWorkFile(full);
      const key = `${fileStat.dev}:${fileStat.ino}`;
      links.set(key, (links.get(key) || 0n) + 1n);
      plan.push({ full, stat: fileStat, key });
    }
    // A crash between hard-link publication and temporary-name removal leaves
    // two links INSIDE this owned directory. Permit exactly those counted
    // links, never a link to an original or another directory.
    if (plan.some((file) => file.stat.nlink !== links.get(file.key))) throw new Error('BATCH_WORK_UNSAFE');
    const verifyDirectories = () => {
      if (hasReparseComponent(target) || !same(rootIdentity, identity(fs.lstatSync(root, { bigint: true }))) ||
          !same(identity(stat), identity(fs.lstatSync(target, { bigint: true })))) throw new Error('BATCH_WORK_UNSAFE');
    };
    for (const file of plan) {
      verifyDirectories();
      const current = assertPlainWorkFile(file.full);
      if (current.dev !== file.stat.dev || current.ino !== file.stat.ino || current.size !== file.stat.size ||
          current.mtimeNs !== file.stat.mtimeNs || current.nlink !== links.get(file.key)) throw new Error('BATCH_WORK_UNSAFE');
      retryTransientDelete(
        () => fs.unlinkSync(file.full),
        () => {
          verifyDirectories();
          const retryStat = assertPlainWorkFile(file.full);
          if (retryStat.dev !== file.stat.dev || retryStat.ino !== file.stat.ino ||
              retryStat.size !== file.stat.size || retryStat.mtimeNs !== file.stat.mtimeNs ||
              retryStat.nlink !== links.get(file.key)) throw new Error('BATCH_WORK_UNSAFE');
        }
      );
      links.set(file.key, links.get(file.key) - 1n);
    }
    verifyDirectories();
    retryTransientDelete(
      () => fs.rmdirSync(target),
      () => {
        verifyDirectories();
        if (fs.readdirSync(target).length !== 0) throw new Error('BATCH_WORK_UNSAFE');
      }
    );
  } catch {
    throw new SafeError('Der lokale Arbeitsbereich konnte nicht sicher bereinigt werden.');
  }
}

module.exports = { TOKEN_RE, batchRoot, batchPath, workPath, safeRemoveWorkDirectory, assertPlainWorkFile };
