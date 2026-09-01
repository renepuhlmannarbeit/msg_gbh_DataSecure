import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readCentralModes } from './lib/zip.mjs';
import { collectProductFiles, verifyKeyringFreeProductEntries } from './lib/product-files.mjs';
import { validateUniversalManifest } from './lib/ocr-universal.mjs';
import { verifyDataSecureArchiveModes } from './lib/archive-modes.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const archive = path.resolve(process.argv[2] || path.join(root, 'dist',
  `DataSecure-Privacy-Preflight-Portable-Engineering-v${pkg.version}.zip`));
const archiveBytes = fs.readFileSync(archive);
const entries = readZip(archiveBytes);
const modes = readCentralModes(archiveBytes);
const sourceFiles = collectProductFiles(path.join(root, 'plugins', 'data-secure'));
const prefix = 'server/ocr-runtime/';
verifyKeyringFreeProductEntries(new Map([...entries].filter(([name]) => !name.startsWith(prefix))));
for (const file of sourceFiles) {
  if (!entries.get(file.archivePath)?.equals(fs.readFileSync(file.fullPath))) {
    throw new Error(`PORTABLE_PLUGIN_SOURCE_MISMATCH_${file.archivePath}`);
  }
}
const manifestBytes = entries.get(`${prefix}bundle-manifest.json`);
if (!manifestBytes) throw new Error('PORTABLE_PLUGIN_RUNTIME_MANIFEST_MISSING');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
try { validateUniversalManifest(manifest, { releaseEnabled: false }); }
catch { throw new Error('PORTABLE_PLUGIN_RUNTIME_GATE_INVALID'); }
const expectedRuntime = new Set(['bundle-manifest.json', ...manifest.files.map((item) => item.path)]);
const actualRuntime = [...entries.keys()].filter((name) => name.startsWith(prefix))
  .map((name) => name.slice(prefix.length));
if (actualRuntime.length !== expectedRuntime.size || actualRuntime.some((name) => !expectedRuntime.has(name))) {
  throw new Error('PORTABLE_PLUGIN_RUNTIME_INVENTORY_MISMATCH');
}
for (const item of manifest.files) {
  const bytes = entries.get(`${prefix}${item.path}`);
  if (!bytes || bytes.length !== item.bytes ||
    crypto.createHash('sha256').update(bytes).digest('hex') !== item.sha256) {
    throw new Error(`PORTABLE_PLUGIN_RUNTIME_HASH_FAILED_${item.path}`);
  }
}
if ([...entries.keys()].some((name) => name === 'bin' || name.startsWith('bin/'))) {
  throw new Error('PORTABLE_PLUGIN_RESERVED_BIN');
}
const expectedEntries = new Set([
  ...sourceFiles.map((file) => file.archivePath),
  ...[...expectedRuntime].map((name) => `${prefix}${name}`)
]);
if (entries.size !== expectedEntries.size || [...entries.keys()].some((name) => !expectedEntries.has(name))) {
  throw new Error('PORTABLE_PLUGIN_ARCHIVE_INVENTORY_MISMATCH');
}
verifyDataSecureArchiveModes(modes, expectedEntries);
process.stdout.write(`Portable engineering plugin ZIP: ${entries.size} entries verified, OCR gate disabled.\n`);
