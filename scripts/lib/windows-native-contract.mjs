// Validate actual PE imports, never the build flags alone. No binary is run.
import crypto from 'node:crypto';

const fail = code => { throw new Error(`WINDOWS_NATIVE_${code}`); };
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const VENDOR_CRT = /^(?:(?:vcruntime|msvcp|msvcr|concrt|vcomp)\d[a-z0-9_]*|ucrtbased)\.dll$/u;

export function inspectPe(bytes) {
  if (!Buffer.isBuffer(bytes)) fail('BINARY_INVALID');
  if (bytes.length < 2 || bytes.readUInt16LE(0) !== 0x5a4d) return null;
  function range(offset, size) {
    if (!Number.isSafeInteger(offset) || offset < 0 || size < 0 || offset + size > bytes.length)
      fail('BOUNDS_INVALID');
  }
  range(0, 64);
  const pe = bytes.readUInt32LE(60);
  range(pe, 24);
  if (bytes.readUInt32LE(pe) !== 0x4550) fail('SIGNATURE_INVALID');
  const machine = bytes.readUInt16LE(pe + 4), count = bytes.readUInt16LE(pe + 6);
  const optionalSize = bytes.readUInt16LE(pe + 20), optional = pe + 24;
  range(optional, optionalSize);
  if (!count || count > 96 || optionalSize < 112) fail('HEADERS_INVALID');
  // Only the actual supported Windows x64 ABI is admitted by this contract.
  if (machine !== 0x8664 || bytes.readUInt16LE(optional) !== 0x20b) fail('ARCHITECTURE_INVALID');
  const directories = bytes.readUInt32LE(optional + 108);
  if (directories > 16 || optionalSize < 112 + directories * 8) fail('DIRECTORIES_INVALID');
  const headers = bytes.readUInt32LE(optional + 60), sectionStart = optional + optionalSize;
  range(sectionStart, count * 40);
  if (headers < sectionStart + count * 40 || headers > bytes.length) fail('HEADERS_INVALID');
  const sections = [];
  for (let index = 0; index < count; index += 1) {
    const at = sectionStart + index * 40;
    const virtualSize = bytes.readUInt32LE(at + 8), virtual = bytes.readUInt32LE(at + 12);
    const size = bytes.readUInt32LE(at + 16), offset = bytes.readUInt32LE(at + 20);
    if (size) range(offset, size);
    sections.push({ virtual, virtualSize: Math.max(virtualSize, size), offset, size });
  }
  function map(rva, size = 1) {
    if (!rva || rva + size > 0x100000000) fail('RVA_INVALID');
    if (rva < headers && rva + size <= headers) return rva;
    const matches = sections.filter(section => rva >= section.virtual &&
      rva + size <= section.virtual + section.virtualSize);
    if (matches.length !== 1) fail('RVA_INVALID');
    const section = matches[0], relative = rva - section.virtual;
    if (relative + size > section.size) fail('RVA_UNBACKED');
    return section.offset + relative;
  }
  function dllName(rva, delayed) {
    const offset = map(rva), zero = bytes.indexOf(0, offset);
    if (zero <= offset || zero - offset > 255) fail('IMPORT_NAME_INVALID');
    map(rva, zero - offset + 1);
    const name = bytes.toString('ascii', offset, zero).toLowerCase();
    // A Node addon can delay-bind its host executable. This is syntax only;
    // the package verifier below grants that exception to one exact artifact.
    if ((!/^[a-z0-9][a-z0-9_.-]{0,250}\.dll$/u.test(name) && !(delayed && name === 'node.exe')) ||
        [...bytes.subarray(offset, zero)].some(value => value > 127)) fail('IMPORT_NAME_INVALID');
    return name;
  }
  function imports(directory, stride, nameOffset, delayed = false) {
    if (directories <= directory) return [];
    const at = optional + 112 + directory * 8;
    const rva = bytes.readUInt32LE(at), size = bytes.readUInt32LE(at + 4);
    if (!rva && !size) return [];
    if (!rva || size < stride || size > 1024 * 1024) fail('IMPORT_DIRECTORY_INVALID');
    map(rva, size);
    const names = [];
    for (let relative = 0; relative + stride <= size; relative += stride) {
      const offset = map(rva + relative, stride);
      if (bytes.subarray(offset, offset + stride).every(value => value === 0)) return names;
      // Delay-load descriptors on the supported x64 target must use RVAs.
      if (delayed && bytes.readUInt32LE(offset) !== 1) fail('DELAY_ATTRIBUTES_INVALID');
      names.push(dllName(bytes.readUInt32LE(offset + nameOffset), delayed));
      if (names.length > 4096) fail('IMPORT_COUNT_INVALID');
    }
    fail('IMPORT_TERMINATOR_MISSING');
  }
  return { architecture: 'x64', imports: [...new Set(imports(1, 20, 12))].sort(),
    delay_imports: [...new Set(imports(13, 32, 4, true))].sort() };
}

export function verifyWindowsCrtPolicy(policy) {
  if (!policy || policy.schema !== 'datasecure-windows-native-policy/1' || policy.target !== 'windows-x64' ||
      policy.minimum_os !== 'Windows 10' || policy.desktop_crt !== 'static' ||
      policy.requires_visual_cpp_redistributable !== false ||
      policy.security_servicing !== 'rebuild_and_redistribute_on_toolset_crt_security_update' ||
      !Array.isArray(policy.system_dlls) || !policy.system_dlls.length ||
      policy.system_dlls.some(name => typeof name !== 'string' || !/^[a-z0-9][a-z0-9_.-]*\.dll$/u.test(name) ||
        VENDOR_CRT.test(name)) || new Set(policy.system_dlls).size !== policy.system_dlls.length)
    fail('CRT_POLICY_INVALID');
  return policy;
}

export function verifyWindowsNativeContract(entries, policy) {
  verifyWindowsCrtPolicy(policy);
  const allowed = new Set(policy.system_dlls), report = [];
  for (const [name, bytes] of entries) {
    const native = inspectPe(bytes);
    if (!native) {
      if (/\.(?:exe|dll|node)$/iu.test(name)) fail(`BINARY_INVALID:${name}`);
      continue;
    }
    for (const [delayed, libraries] of [[false, native.imports], [true, native.delay_imports]]) {
      for (const library of libraries) {
        if (VENDOR_CRT.test(library)) fail(`DYNAMIC_CRT_FORBIDDEN:${name}:${library}`);
        const ownershipHost = delayed && library === 'node.exe' &&
          name === 'server/native/windows-x64/ownership-guard.node';
        // API-set DLLs resolve to Windows system components, not vendor CRTs.
        if (!ownershipHost && !allowed.has(library) && !/^api-ms-win-[a-z0-9-]+-l\d+-\d+-\d+\.dll$/u.test(library))
          fail(`UNDECLARED_IMPORT:${name}:${library}`);
      }
    }
    report.push({ path: name, bytes: bytes.length, sha256: sha256(bytes), ...native });
  }
  if (!report.some(file => file.path === 'DataSecure Standalone.exe')) fail('DESKTOP_MISSING');
  return report.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}
