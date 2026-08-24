import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const POSIX_SUPERVISOR_TARGETS = Object.freeze([
  { id: 'macos-x64', platform: 'darwin', arch: 'x64' },
  { id: 'macos-arm64', platform: 'darwin', arch: 'arm64' },
  { id: 'linux-x64', platform: 'linux', arch: 'x64' }
]);

function assertRegular(file, code) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(code);
}

function matchesTarget(bytes, target) {
  if (target.platform === 'linux') return bytes.length >= 20 &&
    bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) &&
    bytes[4] === 2 && bytes[5] === 1 && bytes.readUInt16LE(18) === 0x3e;
  const cpu = target.arch === 'arm64' ? 0x0100000c : 0x01000007;
  return bytes.length >= 12 && bytes.subarray(0, 4).equals(Buffer.from([0xcf, 0xfa, 0xed, 0xfe])) &&
    bytes.readUInt32LE(4) === cpu;
}

// Packaging is intentionally conditional: the normal product path does not
// claim POSIX delivery before target evidence exists. Once a target directory
// is present, however, a half-packaged or tampered supervisor is a hard error.
export function verifyPosixSupervisorArtifacts(nativeRoot) {
  const included = [];
  for (const target of POSIX_SUPERVISOR_TARGETS) {
    const directory = path.join(nativeRoot, target.id);
    if (!fs.existsSync(directory)) continue;
    const directoryStat = fs.lstatSync(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error(`POSIX_SUPERVISOR_TARGET_UNSAFE:${target.id}`);
    const executable = path.join(directory, 'datasecure-sandbox');
    const checksum = `${executable}.sha256`;
    if (!fs.existsSync(executable) || !fs.existsSync(checksum)) throw new Error(`POSIX_SUPERVISOR_TARGET_INCOMPLETE:${target.id}`);
    assertRegular(executable, `POSIX_SUPERVISOR_EXECUTABLE_UNSAFE:${target.id}`);
    assertRegular(checksum, `POSIX_SUPERVISOR_CHECKSUM_UNSAFE:${target.id}`);
    const bytes = fs.readFileSync(executable);
    const expected = fs.readFileSync(checksum, 'utf8').trim();
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    if (!matchesTarget(bytes, target)) throw new Error(`POSIX_SUPERVISOR_TARGET_MISMATCH:${target.id}`);
    if (!/^[a-f0-9]{64}$/u.test(expected) || expected !== actual) throw new Error(`POSIX_SUPERVISOR_INTEGRITY_FAILED:${target.id}`);
    included.push(target.id);
  }
  return included;
}
