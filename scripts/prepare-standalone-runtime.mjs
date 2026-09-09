import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readStandaloneRuntimeContract, readRegular, sha256, verifyTargetEvidence } from './lib/bundled-runtime.mjs';
import { writeStandaloneRuntime } from './lib/standalone-runtime-projection.mjs';
import { writeConversionRuntime } from './lib/standalone-conversion-runtime.mjs';

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
const binaries = path.join(app, 'tauri-contract', 'binaries');
fs.mkdirSync(binaries, { recursive: true });
const destination = path.join(binaries, target.sidecar_filename);
fs.rmSync(destination, { force: true });
fs.writeFileSync(destination, runtimeBytes, { flag: 'wx', mode: process.platform === 'win32' ? 0o600 : 0o700 });
if (!fs.statSync(destination).isFile() || fs.statSync(destination).size !== fs.statSync(source).size) {
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
process.stdout.write(JSON.stringify({ ok: true, product_target: productTarget,
  rust_target: target.rust_target, node_version: contract.node_version,
  runtime_sha256: sha256(runtimeBytes), sidecar: target.sidecar_filename,
  projected_files: projection.length, conversion_runtime_files: conversion.length }) + '\n');
