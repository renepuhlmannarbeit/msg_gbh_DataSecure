'use strict';

// Immutable, local-only metadata. One atomically published file per root/role
// avoids lost reservations when independent processes configure roots at once.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeFully, renameWithTransientRetry, syncParentDirectory } = require('./batch-journal-io');
const SCHEMA = 'datasecure-root-reservation/1';
const DIRECTORY = 'root-reservations';
const MAX_RECORDS = 256;
const MAX_BYTES = 4096;
const FILE = /^(?:private|public)-[a-f0-9]{64}\.json$/u;
const TEMP = /^(?:private|public)-[a-f0-9]{64}\.json\.\d+\.[a-f0-9]{16}\.tmp$/u;
function unsafe() { return Object.assign(new Error('PRIVACY_STORAGE_UNSAFE'), { code: 'PRIVACY_STORAGE_UNSAFE' }); }
// Enclose acquisition, use AND disposal. A native close error from a finally
// block must not escape the content-free storage boundary or mask it with paths.
function contentFreeIo(action) { try { return action(); } catch { throw unsafe(); } }
function directory(internal) { return path.join(internal, 'settings', DIRECTORY); }
function filename(record) { return `${record.kind}-${crypto.createHash('sha256').update(record.root).digest('hex')}.json`; }
function plainDirectory(target) {
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw unsafe();
  return stat;
}
function readRecord(target, name) {
  return contentFreeIo(() => {
    let fd;
    try {
      let named = fs.lstatSync(target);
      if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1 || named.size < 1 || named.size > MAX_BYTES) throw unsafe();
      fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const opened = fs.fstatSync(fd);
      // A concurrent publisher can atomically replace this immutable record
      // between lstat and open. Bind once to the object actually opened, not a
      // stale pre-open inode. The fresh path must still be that same ordinary,
      // singly linked file, and its role/root must match the hashed filename
      // below. This is metadata revalidation, not an I/O or content retry.
      if (opened.dev !== named.dev || opened.ino !== named.ino) named = fs.lstatSync(target);
      if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1 || !opened.isFile() || opened.nlink !== 1 ||
          opened.size < 1 || opened.size > MAX_BYTES || opened.dev !== named.dev || opened.ino !== named.ino || opened.size !== named.size) throw unsafe();
      const bytes = Buffer.alloc(MAX_BYTES + 1);
      let count = 0;
      for (;;) {
        const read = fs.readSync(fd, bytes, count, bytes.length - count, null);
        if (!read) break;
        count += read;
        if (count > MAX_BYTES) throw unsafe();
      }
      const value = JSON.parse(bytes.subarray(0, count).toString('utf8'));
      if (!value || Object.keys(value).sort().join(',') !== 'kind,root,schema' || value.schema !== SCHEMA ||
        !['private', 'public'].includes(value.kind) || typeof value.root !== 'string' || !path.isAbsolute(value.root) ||
        filename(value) !== name) throw unsafe();
      return value;
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  });
}
function readReservations(internal) {
  return contentFreeIo(() => {
    const target = directory(internal);
    try { plainDirectory(target); }
    catch (error) { if (error.code === 'ENOENT') return []; throw unsafe(); }
    const records = [];
    let scanned = 0;
    const handle = fs.opendirSync(target);
    try {
      let entry;
      while ((entry = handle.readSync())) {
        if (++scanned > MAX_RECORDS * 2) throw unsafe();
        if (TEMP.test(entry.name)) continue; // Uncommitted metadata never authorizes anything.
        if (!FILE.test(entry.name) || records.length >= MAX_RECORDS) throw unsafe();
        records.push(readRecord(path.join(target, entry.name), entry.name));
      }
    } finally { handle.closeSync(); }
    return records;
  });
}
function publishReservations(internal, records) {
  return contentFreeIo(() => {
    const existing = readReservations(internal);
    const known = new Set(existing.map(filename));
    const additions = [...new Map(records.map(record => [filename(record), record])).entries()].filter(([name]) => !known.has(name));
    if (known.size + additions.length > MAX_RECORDS) throw unsafe();
    if (!additions.length) return;
    for (const target of [internal, path.join(internal, 'settings'), directory(internal)]) {
      fs.mkdirSync(target, { recursive: true, mode: 0o700 });
      plainDirectory(target);
    }
    const targetDirectory = directory(internal);
    const parent = plainDirectory(targetDirectory);
    const parentReal = fs.realpathSync.native(targetDirectory);
    for (const [name, record] of additions) {
      const temporary = path.join(targetDirectory, `${name}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`);
      const target = path.join(targetDirectory, name);
      let fd;
      try {
        const payload = Buffer.from(`${JSON.stringify({ schema: SCHEMA, kind: record.kind, root: record.root })}\n`);
        if (payload.length > MAX_BYTES) throw unsafe();
        fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
        writeFully(fd, payload); fs.fsyncSync(fd);
        // Once close has been attempted its outcome may be indeterminate. Never
        // close the same numeric descriptor again after a failed close attempt.
        const closing = fd; fd = undefined; fs.closeSync(closing);
        const current = plainDirectory(targetDirectory);
        if (current.dev !== parent.dev || current.ino !== parent.ino || fs.realpathSync.native(targetDirectory) !== parentReal) throw unsafe();
        // Concurrent publishers of the same role/path produce identical bytes.
        // Distinct paths never overwrite each other's records.
        renameWithTransientRetry(temporary, target);
        syncParentDirectory(target);
      } finally { if (fd !== undefined) fs.closeSync(fd); }
    }
  });
}

module.exports = { SCHEMA, DIRECTORY, MAX_RECORDS, directory, readReservations, publishReservations };
