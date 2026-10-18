// Build-only trust boundary. Editable adjacent runtime evidence is not approval.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import bound from '../../plugins/data-secure/server/core/bound-file-io.js';
import { inspectMachO } from './macos-native-contract.mjs';
import { readMacCoreBuildProcessLifecycle } from './macos-core-process-lifecycle.mjs';
import { expectedPreparedPins } from '../../native/runtime/macos-core-source.mjs';
import { readStandaloneRuntimeContract, verifyTargetEvidence } from './bundled-runtime.mjs';

export const MAX_CORE_BYTES = 128 * 1024 * 1024;
export const CORE_SCHEMA = 'datasecure-macos-static-core-artifact/1';
export const EVIDENCE_SCHEMA = 'datasecure-standalone-macos-runtime-evidence/2';
export const CORE_MARKER_PREFIX = 'DATASECURE_MACOS_STATIC_CORE_SHA256_V1:';
export const CORE_MARKER_SUFFIX = ':END_DATASECURE_MACOS_STATIC_CORE_SHA256';
export const PROVENANCE_MARKER_PREFIX = 'DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256_V1:';
export const PROVENANCE_MARKER_SUFFIX = ':END_DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const targets = { 'macos-arm64': 'aarch64-apple-darwin', 'macos-x64': 'x86_64-apple-darwin' };
const fail = () => { throw Error('STANDALONE_MACOS_STATIC_CORE_INVALID'); };
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
export const canonicalBytes = value => Buffer.from(JSON.stringify(stable(value)));
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail();
}
const sha = value => { if (!/^[a-f0-9]{64}$/u.test(value || '')) fail(); return value; };
const equal = (left, right) => { if (!canonicalBytes(left).equals(canonicalBytes(right))) fail(); };
const read = (file, maximum) => bound.readBoundFile(file, { maximum, minimum: 1, checkCtime: true });
const json = (file, maximum = 128 * 1024) => JSON.parse(read(file, maximum));
export function staticCoreLocation(root, target) {
  if (!Object.hasOwn(targets, target)) fail();
  return path.join(path.resolve(root), 'dist', 'macos-static-core', target);
}
export function validateMacCoreArtifact(artifact, policy, target) {
  exact(policy, ['schema', 'node_version', 'maximum_core_bytes', 'upstream', 'guard_source_sha256', 'static_binding', 'approved_artifacts']);
  if (policy.schema !== 'datasecure-macos-static-core-policy/1' || policy.node_version !== '22.23.2' ||
      policy.maximum_core_bytes !== MAX_CORE_BYTES || !Object.hasOwn(targets, target)) fail();
  equal(policy.upstream, { archive: 'node-v22.23.2.tar.xz', sha256: 'bbe768df8d5815d7fa76124052985332452e0a4742d39f32027550d1aab8f6fb' });
  equal(policy.static_binding, { name: 'datasecure_ownership_guard', abi: 1, napi: 8 });
  sha(policy.guard_source_sha256);
  exact(artifact, ['schema', 'role', 'target', 'rust_target', 'node_version', 'upstream', 'static_binding', 'inputs', 'build', 'core', 'converter', 'license', 'signing']);
  if (artifact.schema !== CORE_SCHEMA || artifact.role !== 'mutating-core' || artifact.target !== target ||
      artifact.rust_target !== targets[target] || artifact.node_version !== policy.node_version) fail();
  equal(artifact.upstream, policy.upstream); equal(artifact.static_binding, policy.static_binding);
  exact(artifact.inputs, ['guard_c_sha256', 'adapter_cc_sha256', 'adapter_h_sha256', 'transform_sha256']);
  for (const value of Object.values(artifact.inputs)) sha(value);
  if (artifact.inputs.guard_c_sha256 !== policy.guard_source_sha256) fail();
  exact(artifact.build, ['provenance_file', 'provenance_sha256']);
  if (artifact.build.provenance_file !== 'BUILD-PROVENANCE.json') fail();
  sha(artifact.build.provenance_sha256);
  exact(artifact.core, ['file', 'bytes', 'sha256', 'unsigned_sha256']);
  if (artifact.core.file !== 'datasecure-core' || !Number.isSafeInteger(artifact.core.bytes) ||
      artifact.core.bytes < 64 || artifact.core.bytes > MAX_CORE_BYTES) fail();
  sha(artifact.core.sha256); sha(artifact.core.unsigned_sha256);
  exact(artifact.license, ['file', 'bytes', 'sha256']);
  if (artifact.license.file !== 'LICENSE.node.txt' || !Number.isSafeInteger(artifact.license.bytes) ||
      artifact.license.bytes < 1 || artifact.license.bytes > 2 * 1024 * 1024) fail();
  sha(artifact.license.sha256);
  exact(artifact.converter, ['archive_sha256', 'bytes', 'sha256', 'license_sha256']);
  for (const key of ['archive_sha256', 'sha256', 'license_sha256']) sha(artifact.converter[key]);
  if (!Number.isSafeInteger(artifact.converter.bytes) || artifact.converter.bytes < 1 ||
      artifact.converter.bytes > MAX_CORE_BYTES || artifact.converter.sha256 === artifact.core.sha256) fail();
  equal(artifact.signing, { identity: '-', hardened_runtime: true, entitlements: { 'com.apple.security.cs.allow-jit': true } });
  const artifactSha256 = digest(canonicalBytes(artifact));
  if (!Array.isArray(policy.approved_artifacts)) fail();
  const records = policy.approved_artifacts.map(record => {
    exact(record, ['target', 'artifact_sha256']);
    if (!Object.hasOwn(targets, record.target)) fail();
    sha(record.artifact_sha256); return record;
  });
  if (new Set(records.map(record => record.target + ':' + record.artifact_sha256)).size !== records.length ||
      records.filter(record => record.target === target && record.artifact_sha256 === artifactSha256).length !== 1) fail();
  return artifactSha256;
}
function validateProvenance(value, artifact, preparedPins) {
  exact(value, ['schema', 'target', 'node_version', 'inputs', 'configure_args', 'make_args', 'toolchain', 'logs', 'process_lifecycle', 'prepared_source_sha256']);
  if (value.schema !== 'datasecure-macos-static-core-build-provenance/2' ||
      value.target !== artifact.target || value.node_version !== artifact.node_version) fail();
  equal(value.inputs, artifact.inputs); equal(value.prepared_source_sha256, preparedPins);
  // Paths and arbitrary shell strings do not enter public package provenance.
  const arch = artifact.target.slice(6);
  equal(value.configure_args, ['--dest-cpu=' + arch, '--dest-os=mac', '--no-cross-compiling',
    '--use_clang', '--with-intl=full-icu', '--download=none', '-C']);
  if (!Array.isArray(value.make_args) || value.make_args.length !== 3 ||
      !/^-j[1-4]$/u.test(value.make_args[0]) || value.make_args[1] !== 'V=1' || value.make_args[2] !== 'node') fail();
  exact(value.toolchain, ['xcode', 'sdk', 'python', 'clang', 'python_sha256', 'clang_sha256']);
  for (const key of ['xcode', 'sdk', 'python', 'clang'])
    if (typeof value.toolchain[key] !== 'string' || !/^[A-Za-z0-9 .()+_-]{1,160}$/u.test(value.toolchain[key])) fail();
  sha(value.toolchain.python_sha256); sha(value.toolchain.clang_sha256);
  exact(value.logs, ['configure_sha256', 'make_sha256', 'compile_commands_sha256']);
  for (const logHash of Object.values(value.logs)) sha(logHash);
  try { readMacCoreBuildProcessLifecycle(value.process_lifecycle); } catch { fail(); }
}
export function loadMacStaticCore(root, target, { staged = false } = {}) {
  root = path.resolve(root);
  const directory = staticCoreLocation(root, target), manifestFile = path.join(directory, 'FINAL-CORE.json');
  const policyFile = path.join(root, 'native/runtime/standalone-macos-core.json');
  const policy = json(policyFile), artifact = json(manifestFile);
  const artifactSha256 = validateMacCoreArtifact(artifact, policy, target);
  const sourceInputs = {};
  for (const [field, relative] of Object.entries({
    guard_c_sha256: 'native/ownership-guard/ownership-guard.c',
    adapter_cc_sha256: 'native/ownership-guard/macos-static-link.cc',
    adapter_h_sha256: 'native/ownership-guard/macos-static-link.h',
    transform_sha256: 'native/runtime/macos-core-source.mjs'
  })) {
    sourceInputs[field] = read(path.join(root, relative), 128 * 1024);
    if (digest(sourceInputs[field]) !== artifact.inputs[field]) fail();
  }
  const provenanceBytes = read(path.join(directory, artifact.build.provenance_file), 128 * 1024);
  const provenance = JSON.parse(provenanceBytes);
  validateProvenance(provenance, artifact, expectedPreparedPins(sourceInputs.guard_c_sha256,
    { cc: sourceInputs.adapter_cc_sha256, h: sourceInputs.adapter_h_sha256 }));
  if (digest(canonicalBytes(provenance)) !== artifact.build.provenance_sha256) fail();
  const coreFile = path.join(directory, artifact.core.file), bytes = read(coreFile, MAX_CORE_BYTES);
  if (bytes.length !== artifact.core.bytes || digest(bytes) !== artifact.core.sha256) fail();
  const native = inspectMachO(bytes);
  if (!native || native.fileType !== 2 || native.architecture !== target.slice(6) || !native.signed ||
      native.minimum > 0x0d0500 || [...native.libraries, ...native.rpaths].some(value =>
        path.posix.normalize(value) !== value || !['/usr/lib/', '/System/Library/Frameworks/'].some(prefix => value.startsWith(prefix)))) fail();
  const licenseFile = path.join(directory, artifact.license.file), licenseBytes = read(licenseFile, 2 * 1024 * 1024);
  if (licenseBytes.length !== artifact.license.bytes || digest(licenseBytes) !== artifact.license.sha256) fail();
  const contract = readStandaloneRuntimeContract(root), runtimeTarget = contract.targets.find(value => value.id === target);
  const official = path.join(root, 'dist', target), converterFile = path.join(official, 'node');
  const converterBytes = read(converterFile, MAX_CORE_BYTES), converterLicense = read(path.join(official, 'LICENSE.node.txt'), 2 * 1024 * 1024);
  const converterEvidence = json(path.join(official, 'runtime-evidence.json'));
  verifyTargetEvidence(converterEvidence, converterBytes, converterLicense, runtimeTarget, contract);
  equal(artifact.converter, { archive_sha256: converterEvidence.archive_sha256, bytes: converterBytes.length,
    sha256: digest(converterBytes), license_sha256: digest(converterLicense) });
  const coreStat = fs.lstatSync(coreFile, { bigint: true }), converterStat = fs.lstatSync(converterFile, { bigint: true });
  if (coreStat.dev === converterStat.dev && coreStat.ino === converterStat.ino || bytes.equals(converterBytes)) fail();
  const stageFile = path.join(root, 'apps/datasecure-standalone/tauri-contract/binaries', 'datasecure-core-' + targets[target]);
  if (staged && !read(stageFile, MAX_CORE_BYTES).equals(bytes)) fail();
  return { artifact, artifactSha256, manifestFile, policyFile, coreFile, stageFile, bytes,
    licenseFile, licenseBytes, provenance, provenanceBytes: canonicalBytes(provenance), converterEvidence };
}
function marker(bytes, prefix, suffix, expected) {
  if (!Buffer.isBuffer(bytes) || !/^[a-f0-9]{64}$/u.test(expected)) fail();
  let at = 0, seen = false;
  while ((at = bytes.indexOf(prefix, at)) !== -1) {
    seen = true; at += prefix.length;
    if (bytes.toString('ascii', at, at + 64) !== expected || bytes.toString('ascii', at + 64, at + 64 + suffix.length) !== suffix) fail();
    at += 64 + suffix.length;
  }
  if (!seen) fail();
}
export function assertMacCoreMarkers(bytes, build) {
  marker(bytes, CORE_MARKER_PREFIX, CORE_MARKER_SUFFIX, build.artifact.core.sha256);
  marker(bytes, PROVENANCE_MARKER_PREFIX, PROVENANCE_MARKER_SUFFIX, build.artifactSha256);
}
export function macRuntimeEvidence(build) {
  return { schema: EVIDENCE_SCHEMA, target: build.artifact.target, node_version: build.artifact.node_version,
    core: { role: 'mutating-core', bytes: build.bytes.length, sha256: build.artifact.core.sha256,
      artifact_sha256: build.artifactSha256, static_binding: build.artifact.static_binding },
    converter: { role: 'official-converter', ...build.artifact.converter } };
}
export function assertMacCoreBundle(app, build) {
  if (path.basename(path.resolve(app)) !== 'DataSecure Standalone.app') fail();
  const contents = path.join(path.resolve(app), 'Contents');
  const bytes = read(path.join(contents, 'MacOS/datasecure-core'), MAX_CORE_BYTES);
  if (!bytes.equals(build.bytes)) fail();
  assertMacCoreMarkers(read(path.join(contents, 'MacOS/datasecure-standalone'), 64 * 1024 * 1024), build);
}
// Publication is native-only: --no-sign must never become a shipped app.
// These fixed tools only inspect the seal; neither command can re-sign Core.
export function verifyMacBundleSeal(app, build) {
  if (process.platform !== 'darwin') fail();
  assertMacCoreBundle(app, build);
  const command = (program, args, input) => {
    const result = spawnSync(program, args, { shell: false, env: { LANG: 'C', LC_ALL: 'C' },
      input, timeout: 15000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0 || result.signal ||
        !Buffer.isBuffer(result.stdout) || !Buffer.isBuffer(result.stderr)) fail();
    return result;
  };
  command('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  const core = path.join(path.resolve(app), 'Contents/MacOS/datasecure-core');
  for (const [file, expected] of [[path.resolve(app), {}], [core, build.artifact.signing.entitlements]]) {
    const details = command('/usr/bin/codesign', ['-dv', '--verbose=4', file]).stderr.toString('utf8');
    const flags = [...details.matchAll(/^CodeDirectory .*? flags=0x([a-f0-9]+)\([^\r\n)]*\)/gmu)];
    if (flags.length !== 1 || !(Number.parseInt(flags[0][1], 16) & 0x10000) ||
        details.split(/\r?\n/u).filter(line => line === 'Signature=adhoc').length !== 1) fail();
    const raw = command('/usr/bin/codesign', ['-d', '--entitlements', ':-', file]).stdout;
    const value = raw.length ? JSON.parse(command('/usr/bin/plutil',
      ['-convert', 'json', '-o', '-', '-'], raw).stdout) : {};
    equal(value, expected);
  }
  assertMacCoreBundle(app, build);
}
export function verifyMacCorePackage(entries, build, app = 'DataSecure Standalone.app') {
  const core = entries.get(app + '/Contents/MacOS/datasecure-core');
  if (!Buffer.isBuffer(core) || !core.equals(build.bytes)) fail();
  assertMacCoreMarkers(entries.get(app + '/Contents/MacOS/datasecure-standalone'), build);
  for (const file of ['RUNTIME-EVIDENCE.json', app + '/Contents/Resources/RUNTIME-EVIDENCE.json'])
    equal(JSON.parse(entries.get(file)), macRuntimeEvidence(build));
  for (const file of ['MACOS-CORE-ARTIFACT.json', app + '/Contents/Resources/MACOS-CORE-ARTIFACT.json'])
    equal(JSON.parse(entries.get(file)), build.artifact);
  if (!entries.get('LICENSE.custom-node.txt')?.equals(build.licenseBytes) ||
      !entries.get('MACOS-CORE-PROVENANCE.json')?.equals(build.provenanceBytes)) fail();
  if ([...entries.keys()].some(name => /(?:^|\/)(?:ownership-guard\.node|datasecure-ownership-guard\.node|ownership-guard\.sha256)$/u.test(name))) fail();
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, repository, target] = process.argv.slice(2);
  if (!['--cargo', '--verify', '--app'].includes(mode) || process.argv.length !== (mode === '--app' ? 6 : 5)) fail();
  const product = Object.entries(targets).find(([product, rust]) => mode === '--cargo' ? rust === target : product === target)?.[0];
  if (!product) fail();
  const build = loadMacStaticCore(repository, product, { staged: mode === '--cargo' });
  if (mode === '--app') assertMacCoreBundle(process.argv[5], build);
  if (mode === '--cargo') {
    for (const file of [build.manifestFile, build.policyFile, build.coreFile, build.stageFile, build.licenseFile,
      path.join(path.dirname(build.manifestFile), 'BUILD-PROVENANCE.json')]) {
      if (/[\r\n]/u.test(file)) fail();
      process.stdout.write('cargo:rerun-if-changed=' + file + '\n');
    }
    process.stdout.write('cargo:rustc-env=DATASECURE_MACOS_STATIC_CORE_SHA256=' + build.artifact.core.sha256 + '\n' +
      'cargo:rustc-env=DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256=' + build.artifactSha256 + '\n');
  } else process.stdout.write(JSON.stringify({ ok: true, target: product, core_sha256: build.artifact.core.sha256, artifact_sha256: build.artifactSha256 }) + '\n');
}
