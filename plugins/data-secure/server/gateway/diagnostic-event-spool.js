'use strict';

// Shared best-effort spool for content-free diagnostic events. Every writer
// publishes a unique immutable file, so detached processes never need a
// read/modify/write cycle. Logging failure is deliberately returned to the
// caller and must never alter a privacy or publication decision.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { renameWithTransientRetry } = require('./batch-journal-io');
const { assertWritableCapacity } = require('./storage-capacity');

function comparable(value, platform = process.platform) {
  const resolved = path.resolve(value);
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function assertPlainDirectory(io, directory, options = {}) {
  const boundary = path.resolve(options.dataRoot || path.dirname(path.dirname(directory)));
  io.mkdirSync(boundary, { recursive: true, mode: 0o700 });
  verifyDirectoryChain(io, boundary, { ...options, boundary });
  // Check the longest existing prefix before mkdirSync. Otherwise a recursive
  // create could follow a hostile diagnostics junction and create data outside
  // the private application root before the postcondition notices it.
  let existing = path.resolve(directory);
  while (!io.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const relative = path.relative(boundary, existing);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('DIAGNOSTIC_SPOOL_PATH_UNSAFE');
  }
  verifyDirectoryChain(io, existing, { ...options, boundary });
  io.mkdirSync(directory, { recursive: true, mode: 0o700 });
  verifyDirectoryChain(io, directory, { ...options, boundary });
  return directory;
}

function verifyDirectoryChain(io, directory, options = {}) {
  let probe = path.resolve(directory);
  const boundary = path.resolve(options.boundary || probe);
  for (;;) {
    const named = io.lstatSync(probe);
    const opened = io.statSync(probe);
    const real = typeof io.realpathSync.native === 'function'
      ? io.realpathSync.native(probe) : io.realpathSync(probe);
    if (!named.isDirectory() || named.isSymbolicLink() || !opened.isDirectory() ||
        named.dev !== opened.dev || named.ino !== opened.ino ||
        comparable(real, options.platform) !== comparable(probe, options.platform)) {
      throw new Error('DIAGNOSTIC_SPOOL_PATH_UNSAFE');
    }
    if (comparable(probe, options.platform) === comparable(boundary, options.platform)) break;
    const parent = path.dirname(probe);
    if (parent === probe) throw new Error('DIAGNOSTIC_SPOOL_PATH_UNSAFE');
    probe = parent;
  }
}

function publishEvent(serialized, options = {}) {
  const io = options.fs || fs;
  const directory = assertPlainDirectory(io, options.directory, options);
  const timestamp = Number(options.timestamp);
  if (!Number.isFinite(timestamp)) throw new Error('DIAGNOSTIC_SPOOL_TIMESTAMP_INVALID');
  const nonce = crypto.randomBytes(8).toString('hex');
  const stem = `event_${String(Math.trunc(timestamp)).padStart(13, '0')}_${nonce}`;
  const temporary = path.join(directory, `.${stem}.tmp`);
  const target = path.join(directory, `${stem}.json`);
  let cleanup = true;
  try {
    (options.assertWritableCapacity || assertWritableCapacity)({
      directory,
      bytes: Buffer.byteLength(serialized, 'utf8')
    });
    io.writeFileSync(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    renameWithTransientRetry(temporary, target, io);
    cleanup = false;
    return target;
  } finally {
    if (cleanup) {
      try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch { /* best effort */ }
    }
  }
}

function eventFiles(options = {}) {
  const io = options.fs || fs;
  let names;
  try { names = io.readdirSync(options.directory); }
  catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
  return names.filter((name) => /^event_([0-9]{13})_[a-f0-9]{16}\.json$/u.test(name)).sort();
}

function pruneEvents(options = {}) {
  const io = options.fs || fs;
  const now = Number(options.now ?? Date.now());
  const cutoff = now - Number(options.retentionDays) * 24 * 60 * 60 * 1000;
  const maximum = Number(options.maximum);
  const retained = [];
  for (const name of eventFiles(options)) {
    const match = /^event_([0-9]{13})_[a-f0-9]{16}\.json$/u.exec(name);
    const timestamp = Number(match?.[1]);
    if (!Number.isFinite(timestamp) || timestamp < cutoff || timestamp > now + 300000) {
      try { io.unlinkSync(path.join(options.directory, name)); } catch { /* best effort */ }
    } else retained.push(name);
  }
  for (const name of retained.slice(0, Math.max(0, retained.length - maximum))) {
    try { io.unlinkSync(path.join(options.directory, name)); } catch { /* best effort */ }
  }
}

function pruneExpiredLegacyFile(file, options = {}) {
  const io = options.fs || fs;
  const cutoff = Number(options.now ?? Date.now()) - Number(options.retentionDays) * 24 * 60 * 60 * 1000;
  try {
    const stat = io.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    if (Number(stat.mtimeMs) >= cutoff) return false;
    io.unlinkSync(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

module.exports = { assertPlainDirectory, publishEvent, eventFiles, pruneEvents, pruneExpiredLegacyFile };
