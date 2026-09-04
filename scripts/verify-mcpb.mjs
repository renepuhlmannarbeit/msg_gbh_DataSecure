// Verifies that the locally built MCPB is an exact projection of the current
// canonical plugin runtime plus the documented release files. This rejects a
// stale local archive even when its own checksum file is internally consistent.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { collectFiles, readCentralModes } from './lib/zip.mjs';
import { includeInProduct, verifyKeyringFreeProductEntries } from './lib/product-files.mjs';
import { verifyDataSecureArchiveModes } from './lib/archive-modes.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const archive = path.join(root, 'dist', `DataSecure-Privacy-Gateway-v${pkg.version}.mcpb`);
if (!fs.existsSync(archive)) throw new Error(`MCPB fehlt: ${path.basename(archive)}`);

const expected = new Map();
function addFile(archivePath, fullPath) {
  if (!includeInProduct(archivePath)) return;
  if (expected.has(archivePath)) throw new Error(`Doppelter erwarteter MCPB-Pfad: ${archivePath}`);
  expected.set(archivePath, fs.readFileSync(fullPath));
}
function addTree(prefix, directory) {
  for (const file of collectFiles(directory)) {
    addFile(`${prefix}${file.archivePath}`, file.fullPath);
  }
}

for (const rel of ['manifest.json', 'README.md', 'SECURITY.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  const full = path.join(root, rel);
  if (fs.existsSync(full)) addFile(rel, full);
}
for (const rel of ['assets', 'docs']) {
  const full = path.join(root, rel);
  if (fs.existsSync(full)) addTree(`${rel}/`, full);
}
addTree('server/', path.join(root, 'plugins', 'data-secure', 'server'));
for (const helper of ['windows-ocr.ps1', 'rasterize-image.ps1']) {
  addFile(`scripts/${helper}`, path.join(root, 'plugins', 'data-secure', 'scripts', helper));
}

const actual = readZip(fs.readFileSync(archive));
const expectedNames = [...expected.keys()].sort();
const actualNames = [...actual.keys()].sort();
if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
  throw new Error('MCPB stimmt in seiner Dateiliste nicht mit dem aktuellen Quellstand überein. Neu bauen.');
}
verifyDataSecureArchiveModes(readCentralModes(fs.readFileSync(archive)), new Set(actualNames));
for (const [name, bytes] of expected) {
  if (!actual.get(name)?.equals(bytes)) throw new Error(`MCPB ist gegenüber dem aktuellen Quellstand veraltet: ${name}`);
}

verifyKeyringFreeProductEntries(actual);

console.log(`MCPB source parity: PASS (${actual.size} entries)`);
