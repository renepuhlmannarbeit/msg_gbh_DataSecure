// A shared source identity embedded by Cargo, then checked against fresh bytes
// by both package builders. Target binaries, installed dependencies and signing
// output deliberately do not contribute to this cross-platform identity.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import boundFileIo from '../../plugins/data-secure/server/core/bound-file-io.js';
import { collectStandaloneRuntime } from './standalone-runtime-projection.mjs';

export const SOURCE_FINGERPRINT_SCHEMA = 'datasecure-standalone-source-fingerprint/1';
export const SOURCE_MARKER_PREFIX = 'DATASECURE_STANDALONE_SOURCE_SHA256_V1:';
export const SOURCE_MARKER_SUFFIX = ':END_DATASECURE_SOURCE_SHA256';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export const SOURCE_INPUT_FILES = Object.freeze([
  '.gitattributes', 'package.json', 'package-lock.json',
  'apps/datasecure-standalone/desktop-targets.json',
  'apps/datasecure-standalone/START-WINDOWS.md', 'apps/datasecure-standalone/MACOS-START.md',
  'apps/datasecure-standalone/tauri-contract/build.rs',
  'apps/datasecure-standalone/tauri-contract/Cargo.toml',
  'apps/datasecure-standalone/tauri-contract/Cargo.lock',
  'apps/datasecure-standalone/tauri-contract/rust-toolchain.toml',
  'apps/datasecure-standalone/tauri-contract/.cargo/config.toml',
  'apps/datasecure-standalone/tauri-contract/tauri.conf.json',
  'apps/datasecure-standalone/tauri-contract/tauri.macos.conf.json',
  'apps/datasecure-standalone/tauri-contract/Info.plist',
  'apps/datasecure-standalone/tauri-contract/macos-core-jit.entitlements.plist',
  'native/runtime/runtime-contract.json', 'native/runtime/standalone-linux-runtime.json',
  'native/runtime/standalone-windows-runtime.json', 'scripts/lib/windows-native-contract.mjs',
  'native/ocr/pilot/package.json', 'native/ocr/pilot/package-lock.json', 'native/ocr/pilot/models.lock.json',
  'native/pdfjs/pilot/package.json', 'native/pdfjs/pilot/package-lock.json',
  'native/markdown/pilot/package.json', 'native/markdown/pilot/package-lock.json',
  'native/windows/datasecure-sandbox.cpp', 'native/ocr/pilot/posix-sandbox.c',
  'native/ownership-guard/ownership-guard.c', 'scripts/build-ownership-guard.mjs',
  'native/ownership-guard/macos-static-link.cc', 'native/ownership-guard/macos-static-link.h',
  'native/runtime/macos-core-source.mjs', 'native/runtime/standalone-macos-core.json',
  'scripts/lib/macos-core-artifact.mjs', 'scripts/lib/macos-core-process-lifecycle.mjs',
  'scripts/macos-static-core/build-contract.mjs', 'scripts/macos-static-core/build-driver.mjs',
  'scripts/macos-static-core/final-core-contract.mjs', 'scripts/macos-static-core/producer-io-lifecycle.mjs',
  'scripts/macos-static-core/system-tool-reader.mjs',
  'scripts/lib/ownership-guard-artifact.mjs',
  'scripts/prepare-standalone-runtime.mjs', 'scripts/build-runtime-target.mjs',
  'scripts/build-standalone-package.mjs', 'scripts/build-standalone-macos-package.mjs',
  'scripts/verify-standalone-macos-package.mjs', '.github/workflows/standalone-macos-sandbox.yml',
  '.github/workflows/standalone-macos-static-core.yml', 'scripts/import-macos-core-candidate.mjs',
  'scripts/relocate-standalone-macos-native.mjs', 'scripts/finalize-standalone-macos-runtime-evidence.mjs',
  'native/macos/relocate-bundle-native.c', 'scripts/build-standalone-macos-relocator.mjs',
  'scripts/lib/macos-build-relocator.mjs',
  'scripts/lib/macos-bundle-native.mjs', 'scripts/lib/macos-native-contract.mjs',
  'plugins/data-secure/server/standalone/macos-bundle-layout.js',
  'scripts/lib/standalone-build-fingerprint.mjs', 'scripts/lib/standalone-runtime-projection.mjs',
  'scripts/lib/standalone-conversion-runtime.mjs', 'scripts/lib/bundled-runtime.mjs',
  'scripts/lib/standalone-package-integrity.mjs', 'scripts/lib/standalone-windows-layout.mjs',
  'plugins/data-secure/server/core/bound-file-io.js'
]);
export const SOURCE_INPUT_TREES = Object.freeze([
  'apps/datasecure-standalone/frontend',
  'apps/datasecure-standalone/tauri-contract/src',
  'apps/datasecure-standalone/tauri-contract/capabilities',
  'apps/datasecure-standalone/tauri-contract/permissions',
  'apps/datasecure-standalone/tauri-contract/icons'
]);

export function standaloneBuildFingerprint(repositoryRoot) {
  const root = path.resolve(repositoryRoot), files = new Map();
  function add(relative, suppliedBytes) {
    if (!relative || /[\\\r\n]/u.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..'))
      throw new Error('STANDALONE_SOURCE_PATH_INVALID');
    const bytes = suppliedBytes ?? boundFileIo.readBoundFile(path.join(root, ...relative.split('/')),
      { maximum: 128 * 1024 * 1024, checkCtime: true });
    const entry = { path: relative, bytes: bytes.length, sha256: sha256(bytes) };
    if (files.has(relative) && JSON.stringify(files.get(relative)) !== JSON.stringify(entry))
      throw new Error('STANDALONE_SOURCE_CHANGED');
    files.set(relative, entry);
  }
  function tree(relative) {
    const directory = path.join(root, ...relative.split('/'));
    const binding = boundFileIo.bindDirectory(directory);
    for (const name of fs.readdirSync(directory).sort()) {
      if (['.DS_Store', 'Thumbs.db', 'desktop.ini'].includes(name)) continue;
      const child = `${relative}/${name}`, stat = fs.lstatSync(path.join(directory, name));
      if (stat.isSymbolicLink()) throw new Error('STANDALONE_SOURCE_UNSAFE');
      if (stat.isDirectory()) tree(child);
      else if (stat.isFile()) add(child);
      else throw new Error('STANDALONE_SOURCE_UNSAFE');
    }
    boundFileIo.assertDirectory(binding);
  }
  for (const relative of SOURCE_INPUT_FILES) add(relative);
  for (const relative of SOURCE_INPUT_TREES) tree(relative);
  // An absent product target selects the common require closure and no native
  // platform assets. The normal packaging projection still selects its target.
  for (const file of collectStandaloneRuntime(path.join(root, 'plugins/data-secure/server'), null))
    add(`plugins/data-secure/server/${file.relative}`, file.bytes);
  const inventory = [...files.values()].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const fingerprint = sha256(Buffer.from(JSON.stringify({ schema: SOURCE_FINGERPRINT_SCHEMA, files: inventory })));
  // Directory watches also invalidate Cargo on additions and removals. Native
  // assets may trigger a rerun, but never enter the common fingerprint.
  const watchPaths = [...new Set([...SOURCE_INPUT_TREES, 'plugins/data-secure/server', ...inventory.map(file => file.path)])].sort();
  return { schema: SOURCE_FINGERPRINT_SCHEMA, fingerprint, files: inventory, watchPaths };
}

export function assertStandaloneBuildFingerprint(binary, expected) {
  if (!Buffer.isBuffer(binary) || !/^[a-f0-9]{64}$/u.test(expected || ''))
    throw new Error('STANDALONE_DESKTOP_SOURCE_MARKER_INVALID');
  const prefix = Buffer.from(SOURCE_MARKER_PREFIX), suffix = Buffer.from(SOURCE_MARKER_SUFFIX);
  let offset = 0, found = false;
  while ((offset = binary.indexOf(prefix, offset)) !== -1) {
    found = true;
    const start = offset + prefix.length, end = start + 64;
    const actual = binary.subarray(start, end).toString('utf8');
    if (!/^[a-f0-9]{64}$/u.test(actual) || !binary.subarray(end, end + suffix.length).equals(suffix))
      throw new Error('STANDALONE_DESKTOP_SOURCE_MARKER_INVALID');
    if (actual !== expected) throw new Error('STANDALONE_DESKTOP_SOURCE_MISMATCH');
    offset = end + suffix.length;
  }
  if (!found) throw new Error('STANDALONE_DESKTOP_SOURCE_MARKER_MISSING');
}

export function assertStandaloneSourceUnchanged(repositoryRoot, expected) {
  if (standaloneBuildFingerprint(repositoryRoot).fingerprint !== expected)
    throw new Error('STANDALONE_SOURCE_CHANGED');
}

export function assertStandaloneRuntimeSource(runtimeDirectory, identity) {
  const prefix = 'plugins/data-secure/server/';
  for (const file of identity.files.filter(file => file.path.startsWith(prefix))) {
    let bytes;
    try {
      bytes = boundFileIo.readBoundFile(path.join(runtimeDirectory, ...file.path.slice(prefix.length).split('/')),
        { maximum: 128 * 1024 * 1024, checkCtime: true });
    } catch { throw new Error('STANDALONE_RUNTIME_SOURCE_MISMATCH'); }
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256)
      throw new Error('STANDALONE_RUNTIME_SOURCE_MISMATCH');
  }
}

export function cargoFingerprintDirectives(repositoryRoot, identity = standaloneBuildFingerprint(repositoryRoot)) {
  const root = path.resolve(repositoryRoot);
  if (/[\r\n]/u.test(root)) throw new Error('STANDALONE_SOURCE_PATH_INVALID');
  return [
    'cargo:rerun-if-env-changed=DATASECURE_BUILD_ID',
    ...identity.watchPaths.map(relative => `cargo:rerun-if-changed=${path.join(root, ...relative.split('/'))}`),
    `cargo:rustc-env=DATASECURE_SOURCE_FINGERPRINT=${identity.fingerprint}`
  ].join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== '--cargo') throw new Error('STANDALONE_SOURCE_ARGUMENT_INVALID');
  process.stdout.write(cargoFingerprintDirectives(process.argv[3]));
}
