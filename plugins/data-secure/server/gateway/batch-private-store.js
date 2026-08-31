'use strict';

const path = require('path');
const fs = require('fs');
const { SafeError, dataRoot } = require('../runtime');
const { ensurePrivateDirectory, hasReparseComponent, safeRemovePrivateTree } = require('./common');

const TOKEN_RE = /^[a-f0-9]{64}$/;

function batchRoot() {
  // Resolve dynamically: tests and supported configuration can change the
  // private root between processes, so this path must never be module-cached.
  const gatewayRoot = ensurePrivateDirectory(path.dirname(dataRoot()), path.basename(dataRoot()));
  return ensurePrivateDirectory(gatewayRoot, 'batches');
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
  const named = io.lstatSync(target);
  if (!named.isFile() || named.isSymbolicLink()) throw new Error('BATCH_WORK_UNSAFE');
  let fd;
  try {
    fd = io.openSync(target, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0));
    const opened = io.fstatSync(fd);
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
    const again = io.lstatSync(target);
    if (!again.isFile() || again.isSymbolicLink() || again.dev !== opened.dev || again.ino !== opened.ino ||
        again.size !== named.size || again.mtimeMs !== named.mtimeMs) throw new Error('BATCH_WORK_UNSAFE');
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
      const pending = [{ full: target, depth: 0 }];
      let inspected = 0;
      while (pending.length) {
        const current = pending.pop();
        if (++inspected > 10000 || current.depth > 32) throw new Error('BATCH_WORK_UNSAFE');
        const child = fs.lstatSync(current.full);
        if (child.isSymbolicLink()) throw new Error('BATCH_WORK_UNSAFE');
        if (child.isFile()) assertPlainWorkFile(current.full);
        else if (child.isDirectory()) {
          for (const name of fs.readdirSync(current.full)) {
            pending.push({ full: path.join(current.full, name), depth: current.depth + 1 });
          }
        } else throw new Error('BATCH_WORK_UNSAFE');
      }
      safeRemovePrivateTree(root, `${value}.work`, {
        expectedIdentity: identity(stat), expectedParentIdentity: rootIdentity
      });
      return;
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
      links.set(key, (links.get(key) || 0) + 1);
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
          current.mtimeMs !== file.stat.mtimeMs || current.nlink !== links.get(file.key)) throw new Error('BATCH_WORK_UNSAFE');
      fs.unlinkSync(file.full);
      links.set(file.key, links.get(file.key) - 1);
    }
    verifyDirectories();
    fs.rmdirSync(target);
  } catch {
    throw new SafeError('Der lokale Arbeitsbereich konnte nicht sicher bereinigt werden.');
  }
}

module.exports = { TOKEN_RE, batchRoot, batchPath, workPath, safeRemoveWorkDirectory, assertPlainWorkFile };
