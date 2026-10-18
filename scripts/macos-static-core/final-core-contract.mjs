// Versioned final-core contract. Measurements are not artifact approval.
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readMacCoreBuildProcessLifecycle } from '../lib/macos-core-process-lifecycle.mjs';
import { PINS, PATCHED, CONVERTER_PINS, fail, cleanPosix } from './build-contract.mjs';
export const MAX_CORE_BYTES = 128 * 1024 * 1024;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
export const canonicalBytes = value => Buffer.from(JSON.stringify(stable(value)));
const same = (a, b) => canonicalBytes(a).equals(canonicalBytes(b));
const sha = value => { if (!/^[a-f0-9]{64}$/u.test(value || '')) fail('FINAL_CORE_HASH_INVALID'); return value; };
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !same(Object.keys(value).sort(), [...keys].sort())) fail('FINAL_CORE_SCHEMA_INVALID');
}
export const ENTITLEMENTS = Object.freeze({ 'com.apple.security.cs.allow-jit': true });
export const ENTITLEMENTS_XML = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>\n';
export function finalSealPlan(core, job) {
  cleanPosix(core, 'final-core'); cleanPosix(job, 'job');
  if (core !== job + '/datasecure-core') fail('FINAL_CORE_PATH_INVALID');
  return Object.freeze({
    entitlements: job + '/macos-core-jit.entitlements.plist',
    sign: { executable: '/usr/bin/codesign', args: ['--force', '--sign', '-', '--timestamp=none',
      '--options', 'runtime', '--entitlements', job + '/macos-core-jit.entitlements.plist', core] },
    verify: { executable: '/usr/bin/codesign', args: ['--verify', '--strict', '--verbose=2', core] },
    details: { executable: '/usr/bin/codesign', args: ['-dv', '--verbose=4', core] },
    entitlementsRead: { executable: '/usr/bin/codesign', args: ['-d', '--entitlements', ':-', core] },
    plist: { executable: '/usr/bin/plutil', args: ['-convert', 'json', '-o', '-', '-'] },
  });
}
export function assertSealDetails(details, entitlements) {
  const flags = [...String(details).matchAll(/^CodeDirectory .*? flags=0x([a-f0-9]+)\([^\r\n)]*\)/gmu)];
  if (flags.length !== 1 || !(Number.parseInt(flags[0][1], 16) & 0x10000) ||
      String(details).split(/\r?\n/u).filter(line => line === 'Signature=adhoc').length !== 1 ||
      !same(entitlements, ENTITLEMENTS)) fail('FINAL_CORE_SEAL_INVALID');
}
// Same thin 64-bit Mach-O/load-command contract as the consumer. This is NOT
// cryptographic verification; assertSealDetails + native codesign --verify is.
export function assertFinalMachO(bytes, arch) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 64 || bytes.length > MAX_CORE_BYTES ||
      bytes.readUInt32LE(0) !== 0xfeedfacf || !['arm64', 'x64'].includes(arch) ||
      bytes.readUInt32LE(4) !== (arch === 'arm64' ? 0x0100000c : 0x01000007) ||
      bytes.readUInt32LE(12) !== 2) fail('FINAL_CORE_MACHO_INVALID');
  const count = bytes.readUInt32LE(16), end = 32 + bytes.readUInt32LE(20);
  if (!count || count > 4096 || end > bytes.length) fail('FINAL_CORE_MACHO_INVALID');
  let offset = 32, minimum = null, signed = false;
  const loads = new Set([0xc, 0x80000018, 0x8000001f, 0x80000023, 0x20, 0x8000001c]);
  for (let index = 0; index < count; index++) {
    if (offset + 8 > end) fail('FINAL_CORE_MACHO_INVALID');
    const command = bytes.readUInt32LE(offset), size = bytes.readUInt32LE(offset + 4);
    if (size < 8 || size % 4 || offset + size > end) fail('FINAL_CORE_MACHO_INVALID');
    if (command === 0x32 || command === 0x24) {
      if (size < (command === 0x32 ? 24 : 16) ||
          command === 0x32 && bytes.readUInt32LE(offset + 8) !== 1) fail('FINAL_CORE_MACHO_INVALID');
      const version = bytes.readUInt32LE(offset + (command === 0x32 ? 12 : 8));
      if (!version || version > 0x0d0500 || minimum !== null && minimum !== version)
        fail('FINAL_CORE_DEPLOYMENT_INVALID');
      minimum = version;
    }
    if (loads.has(command)) {
      if (size < 12) fail('FINAL_CORE_MACHO_INVALID');
      const relative = bytes.readUInt32LE(offset + 8), start = offset + relative;
      const zero = bytes.indexOf(0, start);
      if (relative < 12 || relative >= size || zero < start || zero >= offset + size)
        fail('FINAL_CORE_MACHO_INVALID');
      const value = bytes.toString('utf8', start, zero);
      if (path.posix.normalize(value) !== value ||
          !['/usr/lib/', '/System/Library/Frameworks/'].some(prefix => value.startsWith(prefix)))
        fail('FINAL_CORE_LIBRARY_INVALID');
    }
    if (command === 0x1d) {
      if (size < 16) fail('FINAL_CORE_MACHO_INVALID');
      const start = bytes.readUInt32LE(offset + 8), length = bytes.readUInt32LE(offset + 12);
      if (!length || start < end || start + length > bytes.length) fail('FINAL_CORE_MACHO_INVALID');
      signed = true;
    }
    offset += size;
  }
  if (offset !== end || minimum === null || !signed) fail('FINAL_CORE_MACHO_INVALID');
}
export function finalInputHashes(inputs) {
  return {
    guard_c_sha256: digest(inputs['inputs/ownership-guard.c']),
    adapter_cc_sha256: digest(inputs['inputs/ownership-guard-link.cc']),
    adapter_h_sha256: digest(inputs['inputs/ownership-guard-link.h']),
    transform_sha256: digest(inputs['macos-core-source.mjs']),
  };
}
export function buildFinalRecords(value) {
  const { arch, jobs, inputs, prepared, toolchain, logs, processLifecycle, unsigned, core, converter, license } = value;
  if (!['arm64', 'x64'].includes(arch) || !/^[1-4]$/u.test(String(jobs))) fail('FINAL_CORE_TARGET_INVALID');
  exact(inputs, ['guard_c_sha256', 'adapter_cc_sha256', 'adapter_h_sha256', 'transform_sha256']);
  const expectedInputs = {
    guard_c_sha256: PINS['inputs/ownership-guard.c'],
    adapter_cc_sha256: PINS['inputs/ownership-guard-link.cc'],
    adapter_h_sha256: PINS['inputs/ownership-guard-link.h'],
    transform_sha256: PINS['macos-core-source.mjs'],
  };
  if (!same(inputs, expectedInputs) || !same(prepared, PATCHED)) fail('FINAL_CORE_INPUT_INVALID');
  exact(toolchain, ['xcode', 'sdk', 'python', 'clang', 'python_sha256', 'clang_sha256']);
  for (const key of ['xcode', 'sdk', 'python', 'clang'])
    if (typeof toolchain[key] !== 'string' || !/^[A-Za-z0-9 .()+_-]{1,160}$/u.test(toolchain[key]))
      fail('FINAL_CORE_TOOLCHAIN_INVALID');
  sha(toolchain.python_sha256); sha(toolchain.clang_sha256);
  exact(logs, ['configure_sha256', 'make_sha256', 'compile_commands_sha256']);
  for (const value of Object.values(logs)) sha(value);
  const bounded = (record, maximum) => {
    if (!Number.isSafeInteger(record.bytes) || record.bytes < 1 || record.bytes > maximum)
      fail('FINAL_CORE_SIZE_INVALID');
    sha(record.sha256);
  };
  bounded(unsigned, MAX_CORE_BYTES); bounded(core, MAX_CORE_BYTES);
  bounded(converter, MAX_CORE_BYTES); bounded(license, 2 * 1024 * 1024);
  if (core.bytes < 64 || converter.sha256 === core.sha256 ||
      converter.archive_sha256 !== CONVERTER_PINS[arch]) fail('FINAL_CORE_ROLE_INVALID');
  sha(converter.license_sha256);
  let process_lifecycle;
  try { process_lifecycle = readMacCoreBuildProcessLifecycle(processLifecycle); }
  catch { fail('FINAL_CORE_PROCESS_LIFECYCLE_INVALID'); }
  const target = 'macos-' + arch;
  const provenance = {
    schema: 'datasecure-macos-static-core-build-provenance/2', target, node_version: '22.23.2', inputs,
    configure_args: ['--dest-cpu=' + arch, '--dest-os=mac', '--no-cross-compiling',
      '--use_clang', '--with-intl=full-icu', '--download=none', '-C'],
    make_args: ['-j' + jobs, 'V=1', 'node'], toolchain, logs, process_lifecycle, prepared_source_sha256: prepared,
  };
  const artifact = {
    schema: 'datasecure-macos-static-core-artifact/1', role: 'mutating-core', target,
    rust_target: arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin',
    node_version: '22.23.2',
    upstream: { archive: 'node-v22.23.2.tar.xz', sha256: PINS['node-v22.23.2.tar.xz'] },
    static_binding: { name: 'datasecure_ownership_guard', abi: 1, napi: 8 }, inputs,
    build: { provenance_file: 'BUILD-PROVENANCE.json', provenance_sha256: digest(canonicalBytes(provenance)) },
    core: { file: 'datasecure-core', bytes: core.bytes, sha256: core.sha256, unsigned_sha256: unsigned.sha256 },
    converter: { archive_sha256: converter.archive_sha256, bytes: converter.bytes,
      sha256: converter.sha256, license_sha256: converter.license_sha256 },
    license: { file: 'LICENSE.node.txt', bytes: license.bytes, sha256: license.sha256 },
    signing: { identity: '-', hardened_runtime: true, entitlements: ENTITLEMENTS },
  };
  return { artifact, provenance, artifact_sha256: digest(canonicalBytes(artifact)) };
}
