'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { roots } = require('./common');
const { assertWritableCapacity, normalizePostPreflightWriteError } = require('./storage-capacity');

const HEADER = 'Originaldatei;Anonymisiertes Ergebnis;Status;Hinweis\r\n';
const FIXED_NOTE = 'Lokale Zuordnung; nicht an Claude übertragen.';
const RELEASED = 'freigegeben';
const STOPPED = 'sicher gestoppt';
const OUTBOX_SCHEMA = 'datasecure-mapping-outbox/1';
const OUTBOX_FILE_RE = /^mo_[a-f0-9]{32}\.json$/;
const OUTBOX_TEMP_RE = /^\.mo_[a-f0-9]{32}\.tmp$/;

function csvField(value) {
  let text = String(value ?? '');
  // Spreadsheet programs must not interpret a filename or a package id as a
  // formula when the user opens the local mapping.
  // Excel and similar tools may ignore leading whitespace (including a BOM)
  // before evaluating a formula. Treat those prefixes as formula-significant too.
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function mappingPath(options = {}) { return path.join((options.roots || roots)().exports, 'DataSecure-Mapping.csv'); }

function mappingLockPath(options = {}) { return `${mappingPath(options)}.lock`; }

function mappingOutboxDir(options = {}) { return path.join((options.roots || roots)().exports, '.mapping-outbox'); }

function assertOutboxDirectory(options = {}) {
  const io = options.fs || fs;
  const dir = mappingOutboxDir(options);
  const parent = path.dirname(dir);
  try {
    const parentStat = io.lstatSync(parent);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error('unsafe export parent');
    io.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const dirStat = io.lstatSync(dir);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw new Error('unsafe outbox');
    return dir;
  } catch {
    throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher verwendet werden.');
  }
}

function validOutboxEntry(value) {
  return value && value.schema === OUTBOX_SCHEMA && typeof value.entry_id === 'string' &&
    /^[a-f0-9]{32}$/.test(value.entry_id) && typeof value.package_id === 'string' &&
    /^ds_[a-f0-9]{32}$/.test(value.package_id) && typeof value.original_basename === 'string' &&
    path.basename(value.original_basename) === value.original_basename && value.state === 'pending';
}

function readOutboxEntries(options = {}) {
  const io = options.fs || fs;
  const dir = assertOutboxDirectory(options);
  let entries;
  try { entries = io.readdirSync(dir, { withFileTypes: true }); }
  catch { throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher gelesen werden.'); }
  const result = [];
  for (const entry of entries) {
    // An interrupted atomic creation may leave a fully written temporary
    // intent. Promote it only after validating the complete tiny schema; it
    // is the only durable record in the post-publish/pre-CSV crash window.
    if (OUTBOX_TEMP_RE.test(entry.name) && entry.isFile() && !entry.isSymbolicLink()) {
      try {
        const temporary = path.join(dir, entry.name);
        const stat = io.lstatSync(temporary);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) throw new Error('unsafe temp');
        const value = JSON.parse(io.readFileSync(temporary, 'utf8'));
        if (!validOutboxEntry(value) || entry.name !== `.mo_${value.entry_id}.tmp`) throw new Error('invalid temp');
        const promoted = path.join(dir, `mo_${value.entry_id}.json`);
        if (io.existsSync(promoted)) throw new Error('conflicting intent');
        io.renameSync(temporary, promoted);
        result.push({ ...value, file: promoted });
        continue;
      } catch {
        throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher gelesen werden.');
      }
    }
    if (!OUTBOX_FILE_RE.test(entry.name) || !entry.isFile() || entry.isSymbolicLink()) {
      throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher gelesen werden.');
    }
    const file = path.join(dir, entry.name);
    try {
      const stat = io.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) throw new Error('unsafe entry');
      const value = JSON.parse(io.readFileSync(file, 'utf8'));
      if (!validOutboxEntry(value) || entry.name !== `mo_${value.entry_id}.json`) throw new Error('invalid entry');
      result.push({ ...value, file });
    } catch {
      throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher gelesen werden.');
    }
  }
  return result;
}

function ensureMappingOutbox(originalName, packageId, options = {}) {
  const io = options.fs || fs;
  const name = String(originalName || '');
  if (path.basename(name) !== name || !/^ds_[a-f0-9]{32}$/.test(String(packageId || ''))) {
    throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher aktualisiert werden.');
  }
  const existing = readOutboxEntries(options).find((entry) => entry.package_id === packageId);
  if (existing) return existing;
  const dir = assertOutboxDirectory(options);
  const entryId = crypto.randomBytes(16).toString('hex');
  const value = { schema: OUTBOX_SCHEMA, entry_id: entryId, package_id: packageId, original_basename: name, state: 'pending' };
  const target = path.join(dir, `mo_${entryId}.json`);
  const temporary = path.join(dir, `.mo_${entryId}.tmp`);
  try {
    (options.assertWritableCapacity || assertWritableCapacity)({
      directory: dir,
      bytes: Buffer.byteLength(JSON.stringify(value), 'utf8') + 1024
    });
    io.writeFileSync(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    io.renameSync(temporary, target);
    return { ...value, file: target };
  } catch (error) {
    try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch { /* only our exact temp */ }
    const normalized = normalizePostPreflightWriteError(error);
    if (['LOCAL_CAPACITY_UNAVAILABLE', 'LOCAL_CAPACITY_INSUFFICIENT', 'LOCAL_CAPACITY_RACE'].includes(normalized?.code)) throw normalized;
    throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher aktualisiert werden.');
  }
}

function removeMappingOutbox(entry, options = {}) {
  const io = options.fs || fs;
  if (!validOutboxEntry(entry) || typeof entry.file !== 'string') throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher bereinigt werden.');
  const dir = assertOutboxDirectory(options);
  if (path.dirname(entry.file) !== dir || path.basename(entry.file) !== `mo_${entry.entry_id}.json`) {
    throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher bereinigt werden.');
  }
  try {
    const stat = io.lstatSync(entry.file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('unsafe entry');
    const current = JSON.parse(io.readFileSync(entry.file, 'utf8'));
    if (!validOutboxEntry(current) || current.entry_id !== entry.entry_id ||
      current.package_id !== entry.package_id || current.original_basename !== entry.original_basename ||
      current.state !== entry.state || current.schema !== entry.schema) throw new Error('changed');
    io.unlinkSync(entry.file);
    return true;
  } catch {
    throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher bereinigt werden.');
  }
}

// Mapping contains original filenames and is intentionally local-only.  A
// future bounded worker pool must nevertheless never let two writers replace
// this CSV based on the same earlier snapshot.  The lock is deliberately
// strict: an abandoned or malformed lock is a fail-closed maintenance case,
// not an excuse to delete an unknown local file during a normal release path.
function acquireMappingLock(options = {}) {
  const io = options.fs || fs;
  const target = mappingLockPath(options);
  let descriptor;
  try {
    descriptor = io.openSync(target, 'wx', 0o600);
    io.writeFileSync(descriptor, `datasecure-mapping-lock/1 ${process.pid}\n`, 'utf8');
    return { target, descriptor, marker: `datasecure-mapping-lock/1 ${process.pid}\n` };
  } catch {
    if (descriptor !== undefined) {
      try { io.closeSync(descriptor); } catch { /* the fail-closed error wins */ }
    }
    throw new SafeError('Der lokale Zuordnungsexport wird bereits geschützt verarbeitet.');
  }
}

function releaseMappingLock(lock, options = {}) {
  if (!lock || typeof lock.target !== 'string' || typeof lock.marker !== 'string') return false;
  const io = options.fs || fs;
  try {
    if (lock.descriptor !== undefined) io.closeSync(lock.descriptor);
    const stat = io.lstatSync(lock.target);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    if (io.readFileSync(lock.target, 'utf8') !== lock.marker) return false;
    io.unlinkSync(lock.target);
    return true;
  } catch { return false; }
}

function appendMapping(originalName, packageId, status = RELEASED, options = {}) {
  const name = String(originalName);
  const result = String(packageId ?? '');
  const state = String(status);
  const validReleased = state === RELEASED && /^[A-Za-z0-9_-]+$/.test(result);
  // A terminally stopped source deliberately has no output package. Recording
  // that fact in the private user-facing ledger prevents an ambiguous missing
  // row without inventing a result identifier.
  const validStopped = state === STOPPED && result === '';
  const mappingReference = String(options.mappingReference || '');
  if (mappingReference && !/^[a-f0-9]{32}$/i.test(mappingReference)) {
    throw new SafeError('Der lokale Zuordnungsexport konnte nicht sicher aktualisiert werden.');
  }
  if (path.basename(name) !== name || !(validReleased || validStopped)) {
    throw new SafeError('Der lokale Zuordnungsexport konnte nicht sicher aktualisiert werden.');
  }
  const io = options.fs || fs;
  const target = mappingPath(options);
  let lock;
  let previous = '';
  try {
    const parent = io.lstatSync(path.dirname(target));
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error('unsafe mapping directory');
    lock = acquireMappingLock(options);
    if (io.existsSync(target)) {
      const existing = io.lstatSync(target);
      if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('unsafe mapping file');
      previous = io.readFileSync(target, 'utf8');
    }
  } catch (error) {
    if (lock) releaseMappingLock(lock, options);
    if (error instanceof SafeError) throw error;
    throw new SafeError('Der lokale Zuordnungsexport konnte nicht sicher gelesen werden.');
  }
  try {
    if (previous && !previous.startsWith(HEADER)) {
      throw new SafeError('Der lokale Zuordnungsexport hat ein ungültiges Format.');
    }
    const note = validStopped && mappingReference
      ? `Lokale Zuordnung ${mappingReference}; nicht an Claude übertragen.`
      : FIXED_NOTE;
    const row = [name, result, state, note].map(csvField).join(';') + '\r\n';
    // A process can disappear after atomically replacing the CSV but before it
    // records that fact in its private batch snapshot. Retrying that exact local
    // commit must be safe: duplicate rows would make the user-facing mapping
    // ambiguous and could cause a recovered package to look like a second run.
    const packageAlreadyMapped = validReleased && previous.split(/\r?\n/u).some((line) => {
      const match = /^"(?:[^"]|"")*";"([A-Za-z0-9_-]+)";/u.exec(line);
      return match?.[1] === result;
    });
    if (previous.includes(row) || packageAlreadyMapped) return false;
    const next = (previous || HEADER) + row;
    const temporary = `${target}.tmp_${crypto.randomBytes(6).toString('hex')}`;
    try {
      (options.assertWritableCapacity || assertWritableCapacity)({
        directory: path.dirname(target),
        bytes: Buffer.byteLength(next, 'utf8')
      });
      io.writeFileSync(temporary, next, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      io.renameSync(temporary, target);
      return true;
    } catch (error) {
      try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch { /* no broader cleanup */ }
      const normalized = normalizePostPreflightWriteError(error);
      if (['LOCAL_CAPACITY_UNAVAILABLE', 'LOCAL_CAPACITY_INSUFFICIENT', 'LOCAL_CAPACITY_RACE'].includes(normalized?.code)) {
        throw normalized;
      }
      throw new SafeError('Der lokale Zuordnungsexport konnte nicht sicher aktualisiert werden.');
    }
  } finally {
    if (lock) releaseMappingLock(lock, options);
  }
}

module.exports = { appendMapping, mappingPath, mappingLockPath, mappingOutboxDir, readOutboxEntries, ensureMappingOutbox, removeMappingOutbox, acquireMappingLock, releaseMappingLock, csvField, HEADER, FIXED_NOTE, RELEASED, STOPPED, OUTBOX_SCHEMA };
