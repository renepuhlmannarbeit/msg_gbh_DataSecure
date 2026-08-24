'use strict';

const fs = require('fs');
const crypto = require('crypto');

class NativeLauncherVerificationError extends Error {
  constructor(reason) {
    super('Native launcher verification failed.');
    this.reason = reason;
  }
}

function fail(reason) {
  throw new NativeLauncherVerificationError(reason);
}

function verifyNativeLauncherArtifact(launcher, options = {}) {
  const exists = options.existsSync || fs.existsSync;
  if (!exists(launcher)) fail('missing');
  const checksumFile = launcher.replace(/\.exe$/i, '.sha256');
  let expected;
  let bytes;
  if (typeof options.launcherExpectedSha256 === 'string' && Buffer.isBuffer(options.launcherBytes)) {
    expected = options.launcherExpectedSha256;
    bytes = options.launcherBytes;
  } else {
    if (!exists(checksumFile)) fail('checksum_missing');
    // Opens once and stats the held descriptors rather than the paths, so a
    // symlink or content swap between the existence check above and the read
    // below cannot slip through the gap a plain readFileSync(path) would leave.
    const noFollow = fs.constants.O_NOFOLLOW || 0;
    let launcherFd;
    let checksumFd;
    try {
      launcherFd = fs.openSync(launcher, fs.constants.O_RDONLY | noFollow);
      checksumFd = fs.openSync(checksumFile, fs.constants.O_RDONLY | noFollow);
      const openedLauncher = fs.fstatSync(launcherFd);
      const namedLauncher = fs.lstatSync(launcher);
      const openedChecksum = fs.fstatSync(checksumFd);
      const namedChecksum = fs.lstatSync(checksumFile);
      if (!openedLauncher.isFile() || !namedLauncher.isFile() || namedLauncher.isSymbolicLink() ||
        openedLauncher.dev !== namedLauncher.dev || openedLauncher.ino !== namedLauncher.ino ||
        !openedChecksum.isFile() || !namedChecksum.isFile() || namedChecksum.isSymbolicLink() ||
        openedChecksum.dev !== namedChecksum.dev || openedChecksum.ino !== namedChecksum.ino) {
        fail('unreadable');
      }
      expected = fs.readFileSync(checksumFd, 'utf8').trim();
      bytes = fs.readFileSync(launcherFd);
    } catch (error) {
      if (error instanceof NativeLauncherVerificationError) throw error;
      fail('unreadable');
    } finally {
      if (launcherFd !== undefined) fs.closeSync(launcherFd);
      if (checksumFd !== undefined) fs.closeSync(checksumFd);
    }
  }
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(expected) || actual !== expected) fail('integrity_failed');
  try {
    if (bytes.length < 0x40 || bytes.readUInt16LE(0) !== 0x5a4d) fail('not_pe');
    const peOffset = bytes.readUInt32LE(0x3c);
    if (peOffset > bytes.length - 24 || bytes.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0' ||
      bytes.readUInt16LE(peOffset + 4) !== 0x8664) fail('not_amd64_pe');
  } catch (error) {
    if (error instanceof NativeLauncherVerificationError) throw error;
    fail('not_amd64_pe');
  }
  return launcher;
}

module.exports = { NativeLauncherVerificationError, verifyNativeLauncherArtifact };
