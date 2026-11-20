import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import boundFileIo from '../../plugins/data-secure/server/core/bound-file-io.js';
import { assertStandaloneBuildFingerprint } from './standalone-build-fingerprint.mjs';

function assertAbsent(file) {
  try { fs.lstatSync(file); }
  catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  throw Object.assign(new Error('STANDALONE_PACKAGE_OUTPUT_EXISTS'), { code: 'EEXIST' });
}

// Build-only paths: a single optional directory name, never an arbitrary path.
export function createMacosPackageStage(repositoryRoot, packageFilename, folderName, engineeringDirectory = null) {
  const stem = /^DataSecure-Standalone-[A-Za-z0-9][A-Za-z0-9._-]*-macos-(?:x64|arm64)$/u;
  if (typeof packageFilename !== 'string' || !packageFilename.endsWith('.zip') ||
      !stem.test(packageFilename.slice(0, -4)) || typeof folderName !== 'string' || !stem.test(folderName) ||
      (engineeringDirectory !== null && (typeof engineeringDirectory !== 'string' ||
        !/^engineering-[a-z0-9-]{1,64}$/u.test(engineeringDirectory)))) throw Error('STANDALONE_MACOS_STAGE_UNSAFE');
  const root = path.resolve(repositoryRoot), dist = path.join(root, 'dist');
  const rootBinding = boundFileIo.bindDirectory(root);
  let distBinding;
  try { distBinding = boundFileIo.bindDirectory(dist); }
  catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    boundFileIo.assertDirectory(rootBinding);
    fs.mkdirSync(dist, { mode: 0o700 });
    distBinding = boundFileIo.bindDirectory(dist);
  }
  boundFileIo.assertDirectory(rootBinding); boundFileIo.assertDirectory(distBinding);
  const parent = engineeringDirectory === null ? dist : path.join(dist, engineeringDirectory);
  const output = path.join(parent, packageFilename);
  assertAbsent(output); assertAbsent(output + '.sha256');
  boundFileIo.assertDirectory(distBinding);
  let stageParent, parentBinding = distBinding;
  if (engineeringDirectory !== null) {
    fs.mkdirSync(parent, { mode: 0o700 }); // An existing candidate is never adopted.
    parentBinding = boundFileIo.bindDirectory(parent);
    stageParent = path.join(parent, 'stage');
    fs.mkdirSync(stageParent, { mode: 0o700 });
  } else stageParent = fs.mkdtempSync(path.join(dist, 'standalone-macos-package-stage-'));
  boundFileIo.assertDirectory(rootBinding); boundFileIo.assertDirectory(distBinding);
  boundFileIo.assertDirectory(parentBinding);
  const stageBinding = boundFileIo.bindDirectory(stageParent), stage = path.join(stageParent, folderName);
  fs.mkdirSync(stage, { mode: 0o700 });
  const payloadBinding = boundFileIo.bindDirectory(stage);
  const assertCurrent = () => {
    for (const binding of [rootBinding, distBinding, parentBinding, stageBinding, payloadBinding])
      boundFileIo.assertDirectory(binding);
  };
  assertCurrent();
  return Object.freeze({ stageParent, stage, output, assertCurrent });
}

export function writeMacosPackageChecksum(output, digest) {
  if (typeof output !== 'string' || !/^[a-f0-9]{64}$/u.test(digest || ''))
    throw Error('STANDALONE_PACKAGE_CHECKSUM_INVALID');
  fs.writeFileSync(output + '.sha256', digest + '  ' + path.basename(output) + '\n', { flag: 'wx' });
}

// Archived manifest-to-Desktop consistency; not current-checkout identity or signing approval.
export function verifyMacosPackageBindings(entries, manifest) {
  assert.equal(typeof manifest.source_fingerprint, 'string', 'STANDALONE_DESKTOP_SOURCE_MARKER_INVALID');
  assert.match(manifest.source_fingerprint, /^[a-f0-9]{64}$/u, 'STANDALONE_DESKTOP_SOURCE_MARKER_INVALID');
  assertStandaloneBuildFingerprint(entries.get('DataSecure Standalone.app/Contents/MacOS/datasecure-standalone'),
    manifest.source_fingerprint);
}
