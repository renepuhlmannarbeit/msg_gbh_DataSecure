import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readStandaloneRuntimeContract, readRegular, sha256, verifyTargetEvidence } from './lib/bundled-runtime.mjs';
import { writeStandaloneRuntime } from './lib/standalone-runtime-projection.mjs';
import { writeConversionRuntime } from './lib/standalone-conversion-runtime.mjs';
import { loadOwnershipGuardBuild, ownershipGuardBuildLocation, writeOwnershipGuardRuntime } from './lib/ownership-guard-artifact.mjs';
import { loadMacStaticCore } from './lib/macos-core-artifact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'apps', 'datasecure-standalone');
const targets = JSON.parse(fs.readFileSync(path.join(app, 'desktop-targets.json'), 'utf8'));
const productTarget = `${process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'}-${process.arch === 'arm64' ? 'arm64' : 'x64'}${process.platform === 'linux' ? '-glibc' : ''}`;
const target = targets.targets.find((candidate) => candidate.product_target === productTarget);
if (!target) throw new Error(`STANDALONE_BUILD_TARGET_UNSUPPORTED:${process.platform}/${process.arch}`);
const contract = readStandaloneRuntimeContract(root);
const runtimeDirectory = path.join(root, 'dist', target.product_target);
const source = path.join(runtimeDirectory, target.product_target === 'windows-x64' ? 'datasecure-node.exe' : 'node');
const evidenceFile = path.join(runtimeDirectory, 'runtime-evidence.json');
const licenseFile = path.join(runtimeDirectory, 'LICENSE.node.txt');
const runtimeBytes = readRegular(source, 128 * 1024 * 1024);
const licenseBytes = readRegular(licenseFile, 2 * 1024 * 1024);
const evidence = JSON.parse(readRegular(evidenceFile, 64 * 1024));
const runtimeTarget = contract.targets.find((candidate) => candidate.id === target.product_target);
if (!runtimeTarget) throw new Error('STANDALONE_RUNTIME_TARGET_MISSING');
verifyTargetEvidence(evidence, runtimeBytes, licenseBytes, runtimeTarget, contract);
// Build-time dependency only. Source/flags select a fresh content-addressed
// directory; a damaged existing build is refused, never repaired in place.
// There is no download or compilation in the installed application's startup.
const ownershipSupported = target.product_target === 'windows-x64';
const customCore = target.product_target.startsWith('macos-') ? loadMacStaticCore(root, target.product_target) : null;
const coreBytes = customCore ? customCore.bytes : runtimeBytes;
if (ownershipSupported && !process.env.DATASECURE_BUILD_OWNERSHIP_GUARD_MANIFEST) {
  const guardBuild = ownershipGuardBuildLocation(root, target.product_target);
  if (!fs.existsSync(guardBuild.output)) {
    const built = spawnSync(process.execPath, [path.join(root, 'scripts/build-ownership-guard.mjs'),
      '--output', guardBuild.output, '--fetch-official-inputs'],
    { cwd: root, stdio: 'inherit', windowsHide: true, shell: false, timeout: 300000 });
    if (built.error || built.status !== 0) throw new Error('STANDALONE_OWNERSHIP_GUARD_BUILD_FAILED');
  }
}
if (ownershipSupported) loadOwnershipGuardBuild(root, target.product_target);
const binaries = path.join(app, 'tauri-contract', 'binaries');
fs.mkdirSync(binaries, { recursive: true });
const destination = path.join(binaries, target.sidecar_filename);
fs.rmSync(destination, { force: true });
const sidecarMode = process.platform === 'darwin' ? 0o755 : (process.platform === 'win32' ? 0o600 : 0o700);
fs.writeFileSync(destination, coreBytes, { flag: 'wx', mode: sidecarMode });
if (process.platform === 'darwin') fs.chmodSync(destination, sidecarMode);
if (!fs.statSync(destination).isFile() || !readRegular(destination, 128 * 1024 * 1024).equals(coreBytes)) {
  throw new Error('STANDALONE_RUNTIME_COPY_FAILED');
}
const generatedRuntime = path.join(app, 'tauri-contract', 'generated-runtime');
fs.rmSync(generatedRuntime, { recursive: true, force: true });
const projection = writeStandaloneRuntime(
  path.join(root, 'plugins', 'data-secure', 'server'),
  path.join(generatedRuntime, 'server'),
  target.product_target
);
const conversion = writeConversionRuntime(root, path.join(generatedRuntime, 'server', 'standalone', 'conversion-runtime'), target.product_target);
if (ownershipSupported) writeOwnershipGuardRuntime(root, target.product_target, path.join(generatedRuntime, 'server'));
process.stdout.write(JSON.stringify({ ok: true, product_target: productTarget,
  rust_target: target.rust_target, node_version: contract.node_version,
  runtime_sha256: sha256(coreBytes), converter_sha256: sha256(runtimeBytes), sidecar: target.sidecar_filename,
  projected_files: projection.length, conversion_runtime_files: conversion.length }) + '\n');
