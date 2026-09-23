// Read the actual deployment contract, including Node addons. Info.plist alone
// cannot establish whether every executable can load on the advertised macOS.
import path from 'node:path';

const MACHO = new Set([0xfeedfacf, 0xfeedface, 0xcefaedfe, 0xcffaedfe,
  0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca]);
const LOAD_LIBRARY = new Set([0xc, 0x80000018, 0x8000001f, 0x80000023, 0x20]);
const fail = (code) => { throw new Error(`MACOS_NATIVE_${code}`); };
const versionString = value => `${value >>> 16}.${(value >>> 8) & 255}.${value & 255}`;

export function inspectMachO(bytes) {
  if (bytes.length < 4 || !MACHO.has(bytes.readUInt32LE(0))) return null;
  if (bytes.length < 32 || bytes.readUInt32LE(0) !== 0xfeedfacf) fail('FORMAT_UNSUPPORTED');
  const cpu = bytes.readUInt32LE(4);
  const architecture = cpu === 0x01000007 ? 'x64' : cpu === 0x0100000c ? 'arm64' : 'unknown';
  const count = bytes.readUInt32LE(16), end = 32 + bytes.readUInt32LE(20);
  if (!count || count > 4096 || end > bytes.length) fail('COMMANDS_INVALID');
  const libraries = [], rpaths = [];
  let minimum = null, signed = false, offset = 32;
  function commandString(size) {
    if (size < 12) fail('COMMAND_INVALID');
    const relative = bytes.readUInt32LE(offset + 8);
    if (relative < 12 || relative >= size) fail('STRING_INVALID');
    const start = offset + relative, zero = bytes.indexOf(0, start);
    if (zero < start || zero >= offset + size) fail('STRING_INVALID');
    return bytes.toString('utf8', start, zero);
  }
  for (let index = 0; index < count; index += 1) {
    if (offset + 8 > end) fail('COMMAND_INVALID');
    const command = bytes.readUInt32LE(offset), size = bytes.readUInt32LE(offset + 4);
    if (size < 8 || size % 4 || offset + size > end) fail('COMMAND_INVALID');
    if (command === 0x32 || command === 0x24) {
      if (size < (command === 0x32 ? 24 : 16)) fail('VERSION_INVALID');
      if (command === 0x32 && bytes.readUInt32LE(offset + 8) !== 1) fail('PLATFORM_INVALID');
      const value = bytes.readUInt32LE(offset + (command === 0x32 ? 12 : 8));
      if (!value || (minimum !== null && minimum !== value)) fail('VERSION_INVALID');
      minimum = value;
    }
    if (LOAD_LIBRARY.has(command)) libraries.push(commandString(size));
    if (command === 0x8000001c) rpaths.push(commandString(size));
    if (command === 0x1d) {
      if (size < 16) fail('SIGNATURE_INVALID');
      const start = bytes.readUInt32LE(offset + 8), length = bytes.readUInt32LE(offset + 12);
      if (!length || start < end || start + length > bytes.length) fail('SIGNATURE_INVALID');
      signed = true;
    }
    offset += size;
  }
  if (offset !== end || minimum === null) fail('COMMANDS_INVALID');
  return { architecture, minimum, minimumVersion: versionString(minimum), libraries, rpaths, signed };
}

export function verifyMacNativeContract(entries, { target, minimumVersion }) {
  if (!['macos-x64', 'macos-arm64'].includes(target)) fail('TARGET_INVALID');
  if (!/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/u.test(minimumVersion)) fail('VERSION_INVALID');
  const [major, minor, patch = 0] = minimumVersion.split('.').map(Number);
  if (minor > 255 || patch > 255) fail('VERSION_INVALID');
  const maximum = major * 65536 + minor * 256 + patch;
  const report = [];
  for (const [name, bytes] of entries) {
    const native = inspectMachO(bytes);
    if (!native) {
      if (/\.(?:node|dylib)$/u.test(name)) fail(`BINARY_INVALID:${name}`);
      continue;
    }
    if (native.architecture !== target.slice(6)) fail(`ARCHITECTURE_MISMATCH:${name}`);
    if (native.minimum > maximum) fail(`MINIMUM_TOO_HIGH:${name}:${native.minimumVersion}`);
    // The current product needs only macOS system libraries. A future bundled
    // dylib requires an explicit dependency-resolution contract before release.
    for (const library of [...native.libraries, ...native.rpaths]) {
      if (path.posix.normalize(library) !== library ||
          !['/usr/lib/', '/System/Library/Frameworks/'].some(prefix => library.startsWith(prefix))) {
        fail(`EXTERNAL_LIBRARY:${name}:${library}`);
      }
    }
    if (!native.signed) fail(`SIGNATURE_MISSING:${name}`);
    // Presence is checked here; cryptographic validity is checked by codesign
    // on the native runner after bundle creation and again after extraction.
    report.push({ path: name, ...native });
  }
  if (!report.length) fail('BINARIES_MISSING');
  return report;
}
