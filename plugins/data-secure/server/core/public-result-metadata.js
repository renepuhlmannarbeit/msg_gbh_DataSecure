'use strict';

// Public Results inventory exception, NOT publication authority. Finder may
// create/replace this opaque file after an otherwise immutable MD generation
// was published. It is never a document, never read/parsed/hashed/copied, and
// never added to a manifest or receipt. A name does not prove Finder origin.
// Private staging, Legacy exports and all promised MD checks stay strict.
// Only a real Darwin process has this OS-specific exception. A caller's
// directory/platform descriptor cannot grant it on Windows or another host.
const fs = require('node:fs');
const path = require('node:path');
const { assertDirectory, objectIdentity, sameObject } = require('./bound-file-io');
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_METADATA_TOTAL_BYTES = 8 * MAX_METADATA_BYTES;
const unsafe = () => Object.assign(Error('PUBLIC_RESULT_METADATA_UNSAFE'), { code: 'PUBLIC_RESULT_METADATA_UNSAFE' });

// One instance per COMPLETE recursive inventory, shared by all its folders.
// Nothing is cached across inventories: metadata content/object may change
// between opens. During an admission its exact object must remain named,
// regular, single-linked and bounded; neither ENOENT nor close errors retry.
function createPublicResultMetadataInspector() {
  let total = 0;
  const visited = new Set();
  return function inspect(directory, name) {
    if (process.platform !== 'darwin' || name !== '.DS_Store') return false;
    const io = directory.io || fs;
    const filename = path.join(directory.path, name);
    if (visited.has(filename)) throw unsafe();
    let fd, failed = false, observed = 0;
    const check = (stat, expected) => {
      if (!stat.isFile() || stat.isSymbolicLink() ||
          !['dev', 'ino', 'birthtimeNs', 'size', 'nlink'].every(key => typeof stat[key] === 'bigint') ||
          stat.nlink !== 1n || stat.size < 0n || stat.size > BigInt(MAX_METADATA_BYTES) ||
          expected && !sameObject(stat, expected)) throw unsafe();
      observed = Math.max(observed, Number(stat.size));
    };
    try {
      assertDirectory(directory);
      const before = io.lstatSync(filename, { bigint: true }); check(before);
      const expected = objectIdentity(before);
      assertDirectory(directory);
      fd = io.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
      check(io.fstatSync(fd, { bigint: true }), expected);
      assertDirectory(directory);
      check(io.lstatSync(filename, { bigint: true }), expected);
      check(io.fstatSync(fd, { bigint: true }), expected);
      check(io.lstatSync(filename, { bigint: true }), expected);
      assertDirectory(directory);
    } catch { failed = true; }
    finally {
      if (fd !== undefined) {
        const closing = fd; fd = undefined;
        try { io.closeSync(closing); } catch { failed = true; }
      }
    }
    if (failed) throw unsafe();
    try { assertDirectory(directory); } catch { throw unsafe(); }
    if (total + observed > MAX_METADATA_TOTAL_BYTES) throw unsafe();
    // No file-content stability assertion is made for OS metadata.
    total += observed; visited.add(filename);
    return true;
  };
}
module.exports = Object.freeze({ createPublicResultMetadataInspector, MAX_METADATA_BYTES, MAX_METADATA_TOTAL_BYTES });
