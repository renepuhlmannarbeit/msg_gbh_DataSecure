'use strict';

// Standalone resources only. Never execute process.execPath (which can be a
// SEA), search PATH, download models, or fall back to a development pilot.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const fail = () => { throw Object.assign(new Error('Die lokale Konvertierungslaufzeit fehlt oder ist beschädigt.'),
  { code: 'CONVERSION_RUNTIME_UNAVAILABLE' }); };
let cached;

function readChecked(file, maximum) {
  const before = fs.lstatSync(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > BigInt(maximum)) fail();
  const bytes = fs.readFileSync(file);
  const after = fs.lstatSync(file, { bigint: true });
  if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(key => before[key] !== after[key])) fail();
  return { bytes, identity: `${before.dev}:${before.ino}:${before.size}:${before.mtimeNs}:${before.ctimeNs}` };
}

function resolveConversionRuntime() {
  try {
    const root = path.join(__dirname, 'conversion-runtime');
    const directory = fs.lstatSync(root);
    if (!directory.isDirectory() || directory.isSymbolicLink()) fail();
    const manifestFile = path.join(root, 'RUNTIME.json');
    const manifestRead = readChecked(manifestFile, 2 * 1024 * 1024);
    const manifest = JSON.parse(manifestRead.bytes);
    const target = process.platform === 'win32' ? `windows-${process.arch}`
      : process.platform === 'darwin' ? `macos-${process.arch}`
        : process.platform === 'linux' && process.arch === 'x64' ? 'linux-x64-glibc' : null;
    if (manifest.schema !== 'datasecure-conversion-runtime/1' || manifest.target !== target ||
        manifest.node_file !== (process.platform === 'win32' ? 'node.exe' : 'node') ||
        !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 4096) fail();
    const seen = new Set();
    const identities = new Map();
    let total = 0;
    for (const entry of manifest.files) {
      if (!entry || typeof entry.path !== 'string' || !/^[A-Za-z0-9_@.+/-]+$/u.test(entry.path) ||
          entry.path.split('/').some(part => !part || part === '.' || part === '..') ||
          seen.has(entry.path) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 ||
          entry.bytes > 128 * 1024 * 1024 || !/^[a-f0-9]{64}$/u.test(entry.sha256)) fail();
      seen.add(entry.path);
      total += entry.bytes;
      if (total > 384 * 1024 * 1024) fail();
      const file = path.join(root, ...entry.path.split('/'));
      // Reject directory redirection too, before opening native libraries.
      let parent = path.dirname(file);
      while (parent !== root) {
        const stat = fs.lstatSync(parent);
        if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
        parent = path.dirname(parent);
      }
      const stat = fs.lstatSync(file, { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || stat.size !== BigInt(entry.bytes)) fail();
      const identity = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
      if (cached?.manifestIdentity !== manifestRead.identity || cached.identities.get(entry.path) !== identity) {
        const checked = readChecked(file, entry.bytes);
        if (crypto.createHash('sha256').update(checked.bytes).digest('hex') !== entry.sha256 || checked.identity !== identity) fail();
      }
      identities.set(entry.path, identity);
    }
    for (const required of [manifest.node_file, 'LICENSE.node.txt', 'models/deu.traineddata', 'models/eng.traineddata',
      'node_modules/pdfjs-dist/legacy/build/pdf.mjs', 'node_modules/tesseract.js/src/index.js', 'node_modules/@napi-rs/canvas/index.js']) {
      if (!seen.has(required)) fail();
    }
    cached = { manifestIdentity: manifestRead.identity, identities };
    return Object.freeze({ root, node: path.join(root, manifest.node_file) });
  } catch { fail(); }
}

module.exports = { resolveConversionRuntime };
