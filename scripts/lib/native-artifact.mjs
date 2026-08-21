import crypto from 'node:crypto';
import fs from 'node:fs';

const AMD64_MACHINE = 0x8664;

export function inspectWindowsX64Pe(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 0x40 || bytes.readUInt16LE(0) !== 0x5a4d) {
    throw new Error('native Windows launcher is not a PE executable');
  }
  const peOffset = bytes.readUInt32LE(0x3c);
  if (peOffset > bytes.length - 24 || bytes.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    throw new Error('native Windows launcher has an invalid PE header');
  }
  if (bytes.readUInt16LE(peOffset + 4) !== AMD64_MACHINE) {
    throw new Error('native Windows launcher is not an x64 executable');
  }
  return { machine: 'AMD64' };
}

export function verifyNativeArtifact(executable, checksumFile) {
  if (!fs.existsSync(executable) || !fs.existsSync(checksumFile)) {
    throw new Error('native Windows launcher or checksum is missing');
  }
  const bytes = fs.readFileSync(executable);
  inspectWindowsX64Pe(bytes);
  const expected = fs.readFileSync(checksumFile, 'utf8').trim();
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(expected) || expected !== actual) {
    throw new Error('native Windows launcher checksum mismatch');
  }
  return { bytes, sha256: actual, machine: 'AMD64' };
}
