// Build-time input only. Runtime never trusts this adjacent manifest: Cargo
// embeds the verified target digest, and the native launcher supplies that pin.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bound from '../../plugins/data-secure/server/core/bound-file-io.js';
import { inspectPe } from './windows-native-contract.mjs';
import { inspectMachO } from './macos-native-contract.mjs';

export const OWNERSHIP_MARKER_PREFIX = 'DATASECURE_OWNERSHIP_GUARD_SHA256_V1:';
export const OWNERSHIP_MARKER_SUFFIX = ':END_DATASECURE_OWNERSHIP_GUARD';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = () => { throw new Error('STANDALONE_OWNERSHIP_GUARD_BUILD_INVALID'); };
const targets = new Set(['windows-x64', 'macos-x64', 'macos-arm64']);

export function ownershipGuardBuildLocation(repository, target) {
  if (!targets.has(target)) fail();
  const root = path.resolve(repository);
  const inputs = ['native/ownership-guard/ownership-guard.c', 'scripts/build-ownership-guard.mjs'].map(name =>
    bound.readBoundFile(path.join(root, name), { minimum: 1, maximum: 128 * 1024, checkCtime: true }));
  const identity = hash(Buffer.concat(inputs.flatMap(bytes => [Buffer.from(`${bytes.length}:`), bytes])));
  const output = path.join(root, 'dist', 'native-ownership-guard', `${target}-${identity}`);
  return { output, manifest: path.join(output, 'build-manifest.json') };
}

export function loadOwnershipGuardBuild(repository, target, options = {}) {
  if (!targets.has(target)) fail();
  const root = path.resolve(repository), dist = path.join(root, 'dist');
  const supplied = options.manifest || process.env.DATASECURE_BUILD_OWNERSHIP_GUARD_MANIFEST || ownershipGuardBuildLocation(root, target).manifest;
  if (typeof supplied !== 'string' || !path.isAbsolute(supplied)) fail();
  const manifestFile = path.resolve(supplied);
  const belowDist = name => {
    const relative = path.relative(dist, name);
    return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  if (!belowDist(manifestFile)) fail();
  const manifest = JSON.parse(bound.readBoundFile(manifestFile, { minimum: 1, maximum: 16384, checkCtime: true }));
  const artifact = manifest.verified_artifact;
  const source = bound.readBoundFile(path.join(root, 'native/ownership-guard/ownership-guard.c'),
    { minimum: 1, maximum: 128 * 1024, checkCtime: true });
  if (manifest.schema !== 'datasecure-native-ownership-guard-build/1' || manifest.node_headers_version !== '22.23.2' ||
      manifest.headers_sha256 !== 'daaf13ec5d45a38bbcfcff06d0723f72a6813b89ab27bb5af2ac8e1f6259dde0' ||
      manifest.source_sha256 !== hash(source) || artifact?.schema !== 'datasecure-native-ownership-guard/1' ||
      artifact.abi !== 1 || artifact.napi !== 8 || artifact.target !== target ||
      typeof artifact.path !== 'string' || !path.isAbsolute(artifact.path) ||
      path.resolve(artifact.path) !== artifact.path || !belowDist(artifact.path) ||
      path.basename(artifact.path) !== 'ownership-guard.node' || !/^[a-f0-9]{64}$/u.test(artifact.sha256 || '')) fail();
  const bytes = bound.readBoundFile(artifact.path, { minimum: 64, maximum: 4 * 1024 * 1024, checkCtime: true });
  if (hash(bytes) !== artifact.sha256) fail();
  if (target === 'windows-x64') {
    const pe = inspectPe(bytes), header = bytes.readUInt32LE(0x3c);
    if (manifest.node_lib_sha256 !== 'ac15f1e9d7c8279353723a77f6319967f1a41c06026521094a8234c2e6fbe052' ||
        !pe || !(bytes.readUInt16LE(header + 22) & 0x2000) ||
        pe.imports.some(name => !['advapi32.dll', 'kernel32.dll'].includes(name)) ||
        pe.delay_imports.length !== 1 || pe.delay_imports[0] !== 'node.exe') fail();
  } else {
    const native = inspectMachO(bytes);
    if (!native || native.architecture !== target.slice(6) || native.fileType !== 8 || !native.signed ||
        native.minimum > (13 * 65536 + 5 * 256) || native.rpaths.length ||
        native.libraries.length !== 1 || native.libraries[0] !== '/usr/lib/libSystem.B.dylib') fail();
  }
  return Object.freeze({ bytes, manifestFile, artifact: Object.freeze({ ...artifact }) });
}

export function assertOwnershipGuardMarker(binary, expected) {
  if (!Buffer.isBuffer(binary) || !/^[a-f0-9]{64}$/u.test(expected || '')) fail();
  const prefix = Buffer.from(OWNERSHIP_MARKER_PREFIX), suffix = Buffer.from(OWNERSHIP_MARKER_SUFFIX);
  let offset = 0, found = false;
  while ((offset = binary.indexOf(prefix, offset)) !== -1) {
    found = true;
    const start = offset + prefix.length, end = start + 64;
    if (binary.toString('utf8', start, end) !== expected || !binary.subarray(end, end + suffix.length).equals(suffix)) fail();
    offset = end + suffix.length;
  }
  if (!found) fail();
}

export function verifyOwnershipGuardPackage(entries, target, bundleRoot = null) {
  if (!targets.has(target) || !(entries instanceof Map)) fail();
  const native = bundleRoot ? `${bundleRoot}/Contents/Frameworks/datasecure-ownership-guard.node` :
    `server/native/${target}/ownership-guard.node`;
  const checksum = bundleRoot ? `${bundleRoot}/Contents/Resources/server/native/${target}/ownership-guard.sha256` :
    `server/native/${target}/ownership-guard.sha256`;
  const desktop = bundleRoot ? `${bundleRoot}/Contents/MacOS/datasecure-standalone` : 'DataSecure Standalone.exe';
  const bytes = entries.get(native), sum = entries.get(checksum);
  if (!Buffer.isBuffer(bytes) || bytes.length < 64 || bytes.length > 4 * 1024 * 1024 ||
      !Buffer.isBuffer(sum) || sum.toString('utf8') !== `${hash(bytes)}\n`) fail();
  if (bundleRoot && entries.has(`${bundleRoot}/Contents/Resources/server/native/${target}/ownership-guard.node`)) fail();
  assertOwnershipGuardMarker(entries.get(desktop), hash(bytes));
  return { path: native, sha256: hash(bytes) };
}

export function writeOwnershipGuardRuntime(repository, target, server, options) {
  const build = loadOwnershipGuardBuild(repository, target, options);
  // Build output is staged through the standard runtime projection. Its fixed
  // macOS native role is relocated into Frameworks before sealing the bundle.
  const relative = `native/${target}/ownership-guard.node`, checksumRelative = `native/${target}/ownership-guard.sha256`;
  const destination = path.join(path.resolve(server), ...relative.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: target.startsWith('macos-') ? 0o755 : 0o700 });
  fs.writeFileSync(destination, build.bytes, { flag: 'wx', mode: target.startsWith('macos-') ? 0o644 : 0o600 });
  fs.writeFileSync(path.join(path.resolve(server), ...checksumRelative.split('/')),
    `${build.artifact.sha256}\n`, { flag: 'wx', mode: target.startsWith('macos-') ? 0o644 : 0o600 });
  return { ...build, relative, checksumRelative };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 5 || process.argv[2] !== '--cargo') fail();
  const product = { 'x86_64-pc-windows-msvc': 'windows-x64',
    'aarch64-apple-darwin': 'macos-arm64', 'x86_64-apple-darwin': 'macos-x64' }[process.argv[4]];
  if (!product) {
    // Other targets retain their explicitly separate existing ownership
    // protocol. No Win/Mac artifact or validation claim is fabricated for them.
    if (process.argv[4] !== 'x86_64-unknown-linux-gnu') fail();
    process.stdout.write('cargo:rustc-env=DATASECURE_OWNERSHIP_GUARD_SHA256=not_applicable\n');
  } else {
    const build = loadOwnershipGuardBuild(process.argv[3], product);
    if (/[\r\n]/u.test(build.manifestFile + build.artifact.path)) fail();
    process.stdout.write(`cargo:rerun-if-env-changed=DATASECURE_BUILD_OWNERSHIP_GUARD_MANIFEST\n` +
    `cargo:rerun-if-changed=${build.manifestFile}\ncargo:rerun-if-changed=${build.artifact.path}\n` +
    `cargo:rustc-env=DATASECURE_OWNERSHIP_GUARD_SHA256=${build.artifact.sha256}\n`);
  }
}
