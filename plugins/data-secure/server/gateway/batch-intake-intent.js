'use strict';

const fs = require('fs');
const path = require('path');
const { writeFully, syncParentDirectory } = require('./batch-journal-io');
const { TOKEN_RE, batchPath, workPath, safeRemoveWorkDirectory } = require('./batch-private-store');
const {
  identity: boundIdentity,
  bindPrivateFile,
  safeUnlinkBoundPrivateFile
} = require('./bound-private-file');
const { processAlive } = require('./process-liveness');
const { MODES, validateProcessingMode } = require('../core/processing-mode');

const SUFFIX = '.intake';
const identity = (stat) => ({ dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) });
const validIdentity = (value) => value && Object.keys(value).sort().join(',') === 'birthtimeNs,dev,ino' &&
  Object.values(value).every((part) => typeof part === 'string' && /^(?:0|[1-9][0-9]*)$/u.test(part));
const sameIdentity = (left, right) => ['dev', 'ino', 'birthtimeNs'].every((key) => left[key] === right[key]);

function createBatchIntakeIntent(options = {}) {
  const io = options.io || fs;
  const journalPath = options.batchPath || batchPath;
  const workDirectory = options.workPath || workPath;
  const removeWork = options.safeRemoveWorkDirectory || safeRemoveWorkDirectory;
  const bindFile = options.bindPrivateFile || bindPrivateFile;
  const unlinkBoundFile = options.safeUnlinkBoundPrivateFile || safeUnlinkBoundPrivateFile;
  const alive = options.processAlive || processAlive;
  const bindings = new WeakMap();
  const intentPath = (token) => {
    if (!TOKEN_RE.test(token)) throw new Error('BATCH_INTAKE_INTENT_INVALID');
    return path.join(path.dirname(journalPath(token)), `${token}${SUFFIX}`);
  };

  function create(token, expiresAt, expectedIdentity, purpose = {}) {
    const productChannel = purpose.productChannel === undefined ? 'plugin' : purpose.productChannel;
    const processingMode = validateProcessingMode(purpose.processingMode === undefined
      ? MODES.ANONYMIZE : purpose.processingMode, productChannel);
    const stat = io.lstatSync(workDirectory(token), { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink() ||
        (expectedIdentity && !sameIdentity(identity(stat), expectedIdentity))) throw new Error('BATCH_INTAKE_INTENT_INVALID');
    const record = { schema: processingMode === MODES.MARKDOWN ? 'datasecure-intake/2' : 'datasecure-intake/1',
      ...(processingMode === MODES.MARKDOWN ? { product_channel: productChannel, processing_mode: processingMode } : {}),
      token, pid: process.pid,
      expires_at: expiresAt, work_identity: identity(stat) };
    if (!validIdentity(record.work_identity)) throw new Error('BATCH_INTAKE_INTENT_INVALID');
    const target = intentPath(token);
    const fd = io.openSync(target, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL, 0o600);
    try {
      writeFully(fd, Buffer.from(`${JSON.stringify(record)}\n`), io);
      io.fsyncSync(fd);
    } finally { io.closeSync(fd); }
    syncParentDirectory(target, io, options.platform || process.platform);
    bindings.set(record, bindFile(target, { io }));
    return record;
  }

  function read(token) {
    const target = intentPath(token);
    const binding = bindFile(target, { io });
    let fd;
    try {
      fd = io.openSync(target, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0));
      const opened = io.fstatSync(fd, { bigint: true });
      if (!opened.isFile() || opened.nlink !== 1n ||
          Object.entries(boundIdentity(opened)).some(([key, value]) => binding.file[key] !== value) ||
          opened.size > 2048n || opened.size < 1n) throw new Error('BATCH_INTAKE_INTENT_INVALID');
      const record = JSON.parse(io.readFileSync(fd, 'utf8'));
      const after = io.fstatSync(fd, { bigint: true });
      if (Object.entries(boundIdentity(after)).some(([key, value]) => binding.file[key] !== value)) {
        throw new Error('BATCH_INTAKE_INTENT_INVALID');
      }
      const purposeBound = record.schema === 'datasecure-intake/2';
      if ((purposeBound && (record.product_channel !== 'standalone' || record.processing_mode !== MODES.MARKDOWN)) ||
          (!purposeBound && (record.schema !== 'datasecure-intake/1' ||
            (Object.hasOwn(record, 'processing_mode') && record.processing_mode !== MODES.ANONYMIZE)))) {
        throw new Error('BATCH_INTAKE_INTENT_INVALID');
      }
      if (record.token !== token ||
          !Number.isSafeInteger(record.pid) || record.pid <= 0 ||
          !Number.isFinite(Date.parse(record.expires_at)) || !validIdentity(record.work_identity)) throw new Error('BATCH_INTAKE_INTENT_INVALID');
      bindings.set(record, binding);
      return record;
    } finally { if (fd !== undefined) io.closeSync(fd); }
  }

  function remove(token, record) {
    const target = intentPath(token);
    const binding = record ? bindings.get(record) : bindFile(target, { io });
    if (!binding) throw new Error('BATCH_INTAKE_INTENT_INVALID');
    try { unlinkBoundFile(target, { io, binding }); }
    catch { throw new Error('BATCH_INTAKE_INTENT_INVALID'); }
  }

  function journalAbsent(token) {
    try { io.lstatSync(journalPath(token)); return false; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return true;
  }

  function orphan(token) {
    if (!journalAbsent(token)) return null;
    const record = read(token);
    // The copying process writes this intent before the first private byte and
    // itself publishes the journal. There is no journal-free worker handoff.
    // ESRCH is the production liveness probe's only false result; unknown or
    // reused PIDs stay protected. Once that owner is dead, TTL adds no safety.
    if (alive(record.pid) !== false) return null;
    let stat;
    try { stat = io.lstatSync(workDirectory(token), { bigint: true }); }
    catch (error) { if (error.code === 'ENOENT') return record; throw error; }
    if (!stat.isDirectory() || stat.isSymbolicLink() || !sameIdentity(identity(stat), record.work_identity)) throw new Error('BATCH_INTAKE_OWNERSHIP_CHANGED');
    return record;
  }

  function cleanup(token, now) {
    const record = orphan(token, now);
    if (!record) return false;
    // Revalidate immediately before touching the bound work tree. A new live
    // owner, a published journal, or an intent/parent swap cancels cleanup.
    if (alive(record.pid) !== false) return false;
    const expected = bindings.get(record);
    const current = bindFile(intentPath(token), { io });
    if (!expected || current.target !== expected.target || current.parent !== expected.parent ||
        Object.keys(expected.file).some((key) => current.file[key] !== expected.file[key]) ||
        Object.keys(expected.parentIdentity).some((key) => current.parentIdentity[key] !== expected.parentIdentity[key])) {
      throw new Error('BATCH_INTAKE_OWNERSHIP_CHANGED');
    }
    if (!journalAbsent(token)) return false;
    removeWork(token, { expectedIdentity: record.work_identity });
    remove(token, record);
    return true;
  }

  return { create, read, remove, orphan, cleanup, intentPath };
}

module.exports = { createBatchIntakeIntent, SUFFIX };
