'use strict';

const fs = require('fs');
const path = require('path');
const { writeFully, syncParentDirectory } = require('./batch-journal-io');
const { TOKEN_RE, batchPath, workPath, safeRemoveWorkDirectory } = require('./batch-private-store');
const { processAlive } = require('./process-liveness');

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
  const alive = options.processAlive || processAlive;
  const intentPath = (token) => {
    if (!TOKEN_RE.test(token)) throw new Error('BATCH_INTAKE_INTENT_INVALID');
    return path.join(path.dirname(journalPath(token)), `${token}${SUFFIX}`);
  };

  function create(token, expiresAt, expectedIdentity) {
    const stat = io.lstatSync(workDirectory(token), { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink() ||
        (expectedIdentity && !sameIdentity(identity(stat), expectedIdentity))) throw new Error('BATCH_INTAKE_INTENT_INVALID');
    const record = { schema: 'datasecure-intake/1', token, pid: process.pid,
      expires_at: expiresAt, work_identity: identity(stat) };
    if (!validIdentity(record.work_identity)) throw new Error('BATCH_INTAKE_INTENT_INVALID');
    const target = intentPath(token);
    const fd = io.openSync(target, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL, 0o600);
    try {
      writeFully(fd, Buffer.from(`${JSON.stringify(record)}\n`), io);
      io.fsyncSync(fd);
    } finally { io.closeSync(fd); }
    syncParentDirectory(target, io, options.platform || process.platform);
    return record;
  }

  function read(token) {
    const target = intentPath(token);
    let fd;
    try {
      const named = io.lstatSync(target);
      fd = io.openSync(target, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0));
      const opened = io.fstatSync(fd);
      if (!named.isFile() || named.isSymbolicLink() || !opened.isFile() || opened.nlink !== 1 ||
          opened.dev !== named.dev || opened.ino !== named.ino || opened.size > 2048 || opened.size < 1) throw new Error('BATCH_INTAKE_INTENT_INVALID');
      const record = JSON.parse(io.readFileSync(fd, 'utf8'));
      if (record.schema !== 'datasecure-intake/1' || record.token !== token ||
          !Number.isSafeInteger(record.pid) || record.pid <= 0 ||
          !Number.isFinite(Date.parse(record.expires_at)) || !validIdentity(record.work_identity)) throw new Error('BATCH_INTAKE_INTENT_INVALID');
      return record;
    } finally { if (fd !== undefined) io.closeSync(fd); }
  }

  function remove(token) { io.unlinkSync(intentPath(token)); }

  function orphan(token, now) {
    try { io.lstatSync(journalPath(token)); return null; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const record = read(token);
    if (alive(record.pid) || now <= Date.parse(record.expires_at)) return null;
    let stat;
    try { stat = io.lstatSync(workDirectory(token), { bigint: true }); }
    catch (error) { if (error.code === 'ENOENT') return record; throw error; }
    if (!stat.isDirectory() || stat.isSymbolicLink() || !sameIdentity(identity(stat), record.work_identity)) throw new Error('BATCH_INTAKE_OWNERSHIP_CHANGED');
    return record;
  }

  function cleanup(token, now) {
    const record = orphan(token, now);
    if (!record) return false;
    removeWork(token, { expectedIdentity: record.work_identity });
    remove(token);
    return true;
  }

  return { create, read, remove, orphan, cleanup, intentPath };
}

module.exports = { createBatchIntakeIntent, SUFFIX };
