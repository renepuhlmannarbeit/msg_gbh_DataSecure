import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import boundFileIo from '../../plugins/data-secure/server/core/bound-file-io.js';
import { sha256, verifyTargetEvidence } from './bundled-runtime.mjs';
import { assertStandaloneBuildFingerprint } from './standalone-build-fingerprint.mjs';
import { WINDOWS_PACKAGE_ROOT } from './standalone-windows-layout.mjs';

const TARGET_FIELDS = ['target', 'node_version', 'archive', 'archive_sha256', 'bytes', 'sha256',
  'license_bytes', 'license_sha256', 'runtime_probe'];
function exactKeys(value, fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...fields].sort());
}

// Consistency of the supplied archived bytes and the pinned contract, not a
// manufacturer signature or proof that these binaries were executed here.
export function verifyWindowsPackageBindings(entries, manifest, contract) {
  assert.equal(typeof manifest.source_fingerprint, 'string', 'STANDALONE_DESKTOP_SOURCE_MARKER_INVALID');
  assert.match(manifest.source_fingerprint, /^[a-f0-9]{64}$/u, 'STANDALONE_DESKTOP_SOURCE_MARKER_INVALID');
  assertStandaloneBuildFingerprint(entries.get('DataSecure Standalone.exe'), manifest.source_fingerprint);
  const aggregate = JSON.parse(entries.get('RUNTIME-EVIDENCE.json'));
  assert.ok(exactKeys(aggregate, ['schema', 'targets']) &&
    aggregate.schema === 'datasecure-standalone-runtime-evidence/1' &&
    Array.isArray(aggregate.targets) && aggregate.targets.length === 1, 'STANDALONE_RUNTIME_EVIDENCE_INVALID');
  const row = aggregate.targets[0];
  assert.ok(exactKeys(row, TARGET_FIELDS) && exactKeys(row.runtime_probe, ['version', 'platform', 'arch']),
    'STANDALONE_RUNTIME_EVIDENCE_INVALID');
  const target = contract.targets.find(item => item.id === 'windows-x64');
  assert.ok(target && target.os === 'win32' && target.arch === 'x64', 'STANDALONE_RUNTIME_EVIDENCE_INVALID');
  const bytes = entries.get('datasecure-core-x86_64-pc-windows-msvc.exe'), license = entries.get('LICENSE.node.txt');
  assert.ok(Buffer.isBuffer(bytes) && Buffer.isBuffer(license), 'STANDALONE_RUNTIME_EVIDENCE_INVALID');
  verifyTargetEvidence({
    schema: 'datasecure-bundled-runtime-target/v1',
    target: row.target, node_version: row.node_version, archive: row.archive,
    archive_sha256: row.archive_sha256, bytes: row.bytes, sha256: row.sha256,
    license_bytes: row.license_bytes, license_sha256: row.license_sha256,
    runtime_probe: { version: row.runtime_probe.version, platform: row.runtime_probe.platform, arch: row.runtime_probe.arch }
  }, bytes, license, target, contract);
}

function assertAbsent(file) {
  try { fs.lstatSync(file); }
  catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  throw Object.assign(new Error('STANDALONE_PACKAGE_OUTPUT_EXISTS'), { code: 'EEXIST' });
}

export function createWindowsPackageStage(repositoryRoot, packageName, folderName, engineeringName = null) {
  if (typeof packageName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(packageName) ||
      folderName !== WINDOWS_PACKAGE_ROOT ||
      (engineeringName !== null && (typeof engineeringName !== 'string' ||
        !/^engineering-[a-z0-9-]{1,64}$/u.test(engineeringName)))) throw new Error('STANDALONE_STAGE_UNSAFE');
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
  const parent = engineeringName === null ? dist : path.join(dist, engineeringName);
  const output = path.join(parent, packageName + '.zip');
  // Advisory early refusal saves work. Final ZIP/SHA opens remain exclusive.
  assertAbsent(output); assertAbsent(output + '.sha256');
  boundFileIo.assertDirectory(distBinding);
  let stageParent;
  if (engineeringName !== null) {
    fs.mkdirSync(parent, { mode: 0o700 }); // EEXIST never adopts an old candidate.
    stageParent = path.join(parent, 'stage');
    fs.mkdirSync(stageParent, { mode: 0o700 });
  } else stageParent = fs.mkdtempSync(path.join(dist, 'standalone-package-stage-'));
  boundFileIo.assertDirectory(rootBinding); boundFileIo.assertDirectory(distBinding);
  const stageBinding = boundFileIo.bindDirectory(stageParent), stage = path.join(stageParent, folderName);
  boundFileIo.assertDirectory(stageBinding);
  fs.mkdirSync(stage, { mode: 0o700 });
  boundFileIo.assertDirectory(stageBinding);
  return { stageParent, stage, output };
}

export function writeWindowsStageBytes(stage, relative, bytes, mode = 0o600) {
  if (!Buffer.isBuffer(bytes) || typeof relative !== 'string' || /[\\:\u0000-\u001f\u007f]/u.test(relative) ||
      !relative.split('/').every(part => part && part !== '.' && part !== '..') ||
      ![0o600, 0o700].includes(mode)) throw new Error('STANDALONE_STAGE_UNSAFE');
  const destination = path.join(stage, ...relative.split('/'));
  const binding = boundFileIo.bindDirectory(stage);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  boundFileIo.assertDirectory(binding);
  fs.writeFileSync(destination, bytes, { flag: 'wx', mode });
  if (!bytes.equals(boundFileIo.readBoundFile(destination, {
    minimum: bytes.length, maximum: bytes.length, checkCtime: true
  }))) throw new Error('STANDALONE_STAGE_BYTES_CHANGED');
  boundFileIo.assertDirectory(binding);
}

export function writeWindowsPackageChecksum(output, bytes) {
  if (typeof output !== 'string' || !Buffer.isBuffer(bytes) || bytes.length < 1)
    throw new Error('STANDALONE_PACKAGE_CHECKSUM_INVALID');
  fs.writeFileSync(output + '.sha256', sha256(bytes) + '  ' + path.basename(output) + '\n', { flag: 'wx' });
}
