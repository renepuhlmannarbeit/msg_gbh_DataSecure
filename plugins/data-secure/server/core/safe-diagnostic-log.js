'use strict';

// Optional, content-free diagnostics. Never truncate, rename or remove any
// existing file. Rotation creates an exclusive segment; exhausting the bounded
// segment budget drops diagnostics, not product work.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { bindDirectory, assertDirectory, objectIdentity, sameObject, failure } = require('./bound-file-io');

function ensureDirectory(directory, io, platform) {
  const missing = [];
  let probe = path.resolve(directory);
  for (;;) {
    try { io.lstatSync(probe); break; }
    catch (error) {
      if (error?.code !== 'ENOENT' || path.dirname(probe) === probe) throw error;
      missing.unshift(probe);
      probe = path.dirname(probe);
    }
  }
  let binding = bindDirectory(probe, { io, platform });
  for (const child of missing) {
    assertDirectory(binding);
    try { io.mkdirSync(child, { mode: 0o700 }); }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
    assertDirectory(binding);
    binding = bindDirectory(child, { io, platform });
  }
  return binding;
}

function createBestEffortDiagnosticLog(options) {
  const io = options.io || fs, platform = options.platform || process.platform;
  const directory = path.resolve(options.directory);
  const name = options.name;
  if (!/^[a-z-]+\.jsonl$/u.test(name)) throw failure();
  const maximum = options.maximum ?? 2 * 1024 * 1024;
  const maxSegments = options.maxSegments ?? 8;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || !Number.isSafeInteger(maxSegments) ||
      maxSegments < 1 || maxSegments > 32) throw failure();
  const randomBytes = options.randomBytes || crypto.randomBytes;
  let target = path.join(directory, name), segments = 1, disabled = false;
  function append(serialized) {
    let fd;
    try {
      if (disabled) return false;
      if (typeof serialized !== 'string') return false;
      const bytes = Buffer.from(serialized, 'utf8');
      if (!bytes.length || bytes.length > maximum) return false;
      const parent = ensureDirectory(directory, io, platform);
      let candidate = target, rotating = false;
      let named;
      try { named = io.lstatSync(target, { bigint: true }); }
      catch (error) { if (error?.code !== 'ENOENT') throw error; }
      if (named && (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1n)) throw failure();
      if (named && named.size + BigInt(bytes.length) > BigInt(maximum)) {
        if (segments >= maxSegments) return false;
        const nonce = randomBytes(16).toString('hex');
        if (!/^[a-f0-9]{32}$/u.test(nonce)) throw failure();
        candidate = path.join(directory, `${name.slice(0, -6)}.${nonce}.jsonl`);
        rotating = true;
        named = undefined;
      }
      assertDirectory(parent);
      fd = io.openSync(candidate, io.constants.O_WRONLY | io.constants.O_APPEND |
        (io.constants.O_NOFOLLOW || 0) | (io.constants.O_NONBLOCK || 0) |
        (named ? 0 : io.constants.O_CREAT | io.constants.O_EXCL), 0o600);
      const opened = io.fstatSync(fd, { bigint: true });
      const identity = objectIdentity(opened);
      const validate = () => {
        assertDirectory(parent);
        const held = io.fstatSync(fd, { bigint: true }), current = io.lstatSync(candidate, { bigint: true });
        for (const stat of [held, current]) {
          if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n ||
              !sameObject(stat, identity) || stat.size > BigInt(maximum)) throw failure();
        }
      };
      if (named && (!sameObject(opened, objectIdentity(named)) || opened.size !== named.size)) throw failure();
      if (!opened.isFile() || opened.nlink !== 1n || opened.size + BigInt(bytes.length) > BigInt(maximum)) throw failure();
      validate();
      if (rotating) { target = candidate; segments++; }
      let offset = 0;
      while (offset < bytes.length) {
        validate();
        const count = io.writeSync(fd, bytes, offset, bytes.length - offset);
        if (!Number.isSafeInteger(count) || count < 1 || count > bytes.length - offset) throw failure();
        offset += count;
      }
      validate();
      const closing = fd;
      fd = undefined;
      io.closeSync(closing);
      return true;
    } catch {
      // A partial write or uncertain close cannot be rolled back safely. Do
      // not reopen a collided candidate or append to a damaged JSONL fragment.
      disabled = true;
      return false;
    }
    finally {
      if (fd !== undefined) {
        const closing = fd;
        fd = undefined;
        try { io.closeSync(closing); } catch { /* best effort; no second close */ }
      }
    }
  }
  return Object.freeze({ append });
}

module.exports = { createBestEffortDiagnosticLog };
