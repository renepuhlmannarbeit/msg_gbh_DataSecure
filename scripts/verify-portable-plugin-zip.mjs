import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { collectFiles, readCentralModes } from './lib/zip.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const archive = path.resolve(process.argv[2] || path.join(root, 'dist',
  `DataSecure-Privacy-Preflight-Portable-Engineering-v${pkg.version}.zip`));
const archiveBytes = fs.readFileSync(archive);
const entries = readZip(archiveBytes);
const modes = readCentralModes(archiveBytes);
const sourceFiles = collectFiles(path.join(root, 'plugins', 'data-secure'));
for (const file of sourceFiles) {
  if (!entries.get(file.archivePath)?.equals(fs.readFileSync(file.fullPath))) {
    throw new Error(`PORTABLE_PLUGIN_SOURCE_MISMATCH_${file.archivePath}`);
  }
}
const prefix = 'server/ocr-runtime/';
const manifestBytes = entries.get(`${prefix}bundle-manifest.json`);
if (!manifestBytes) throw new Error('PORTABLE_PLUGIN_RUNTIME_MANIFEST_MISSING');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (manifest.schema !== 'data-secure-ocr-runtime-bundle/v2' || manifest.target !== 'universal' ||
  manifest.release_enabled !== false) throw new Error('PORTABLE_PLUGIN_RUNTIME_GATE_INVALID');
const targetOrder = ['windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64'];
if (JSON.stringify(manifest.targets?.map((item) => item.target)) !== JSON.stringify(targetOrder)) {
  throw new Error('PORTABLE_PLUGIN_RUNTIME_TARGETS_INVALID');
}
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
for (const item of manifest.targets) {
  const name = `${prefix}${item.launcher}`;
  const executable = item.target === 'windows-x64' ? 0 : 0o111;
  if (!entries.has(name) || (modes.get(name) & 0o111) !== executable) {
    throw new Error(`PORTABLE_PLUGIN_LAUNCHER_MODE_INVALID_${item.target}`);
  }
}
if ([...entries.keys()].some((name) => name === 'bin' || name.startsWith('bin/'))) {
  throw new Error('PORTABLE_PLUGIN_RESERVED_BIN');
}
process.stdout.write(`Portable engineering plugin ZIP: ${entries.size} entries verified, OCR gate disabled.\n`);
