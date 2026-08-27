'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { SafeError } = require('../runtime');

function snapshotChanged(sealed) {
  const error = new SafeError('Die ausgewählte Datei wurde während der Übergabe verändert.');
  error.code = sealed ? 'BATCH_SNAPSHOT_CHANGED' : 'SOURCE_SNAPSHOT_CHANGED';
  return error;
}

function assertExpectedStat(expectedStat) {
  if (
    !expectedStat || !Number.isFinite(expectedStat.size) || !Number.isFinite(expectedStat.mtimeMs) ||
    expectedStat.dev === undefined || expectedStat.ino === undefined
  ) {
    throw new SafeError('Die ausgewählte Quelldatei besitzt keine gültige lokale Identitätsbindung.');
  }
}

function assertBoundIdentity(source, sourceFd, expectedStat, sealed) {
  const opened = fs.fstatSync(sourceFd);
  const current = fs.lstatSync(source);
  if (
    !opened.isFile() || !current.isFile() || current.isSymbolicLink() ||
    opened.dev !== expectedStat.dev || opened.ino !== expectedStat.ino ||
    current.dev !== expectedStat.dev || current.ino !== expectedStat.ino ||
    opened.size !== expectedStat.size || current.size !== expectedStat.size ||
    opened.mtimeMs !== expectedStat.mtimeMs || current.mtimeMs !== expectedStat.mtimeMs
  ) {
    throw snapshotChanged(sealed);
  }
  return opened;
}

function closeDescriptor(fd, failure) {
  if (fd === undefined) return failure;
  try {
    fs.closeSync(fd);
    return failure;
  } catch {
    if (failure) return failure;
    const error = new SafeError('Die private Arbeitskopie konnte nicht sicher abgeschlossen werden.');
    error.code = 'PRIVATE_COPY_CLOSE_FAILED';
    return error;
  }
}

function hashBoundSource(source, expectedStat) {
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  let sourceFd;
  let failure = null;
  let digest;
  try {
    sourceFd = fs.openSync(source, fs.constants.O_RDONLY | noFollow);
    const opened = assertBoundIdentity(source, sourceFd, expectedStat, false);
    const hash = crypto.createHash('sha256');
    const chunk = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < opened.size) {
      const read = fs.readSync(sourceFd, chunk, 0, Math.min(chunk.length, opened.size - position), position);
      if (read <= 0) throw new SafeError('Die lokale Quellversiegelung ist unvollständig.');
      hash.update(chunk.subarray(0, read));
      position += read;
    }
    assertBoundIdentity(source, sourceFd, expectedStat, false);
    digest = hash.digest('hex');
  } catch (error) {
    failure = error;
  }
  failure = closeDescriptor(sourceFd, failure);
  if (failure) throw failure;
  return digest;
}

function copySourceToPrivateWork({ source, destination, expectedStat, expectedSha256 }) {
  assertExpectedStat(expectedStat);
  const externallySealed = expectedSha256 !== undefined;
  if (externallySealed && !/^[a-f0-9]{64}$/i.test(String(expectedSha256))) {
    throw new SafeError('Die versiegelte Arbeitskopie ist ungültig.');
  }

  const boundSha256 = externallySealed
    ? String(expectedSha256).toLowerCase()
    : hashBoundSource(source, expectedStat);

  const noFollow = fs.constants.O_NOFOLLOW || 0;
  let sourceFd;
  let destinationFd;
  let destinationCreated = false;
  let failure = null;
  let result;
  try {
    sourceFd = fs.openSync(source, fs.constants.O_RDONLY | noFollow);
    const opened = assertBoundIdentity(source, sourceFd, expectedStat, externallySealed);

    destinationFd = fs.openSync(destination, 'wx', 0o600);
    destinationCreated = true;
    const chunk = Buffer.allocUnsafe(64 * 1024);
    const hash = crypto.createHash('sha256');
    let position = 0;
    while (position < opened.size) {
      const read = fs.readSync(sourceFd, chunk, 0, Math.min(chunk.length, opened.size - position), position);
      if (read <= 0) throw new SafeError('Die private Arbeitskopie ist unvollständig.');
      hash.update(chunk.subarray(0, read));
      let written = 0;
      while (written < read) {
        const count = fs.writeSync(destinationFd, chunk, written, read - written);
        if (count <= 0) throw new SafeError('Die private Arbeitskopie konnte nicht vollständig geschrieben werden.');
        written += count;
      }
      position += read;
    }
    fs.fsyncSync(destinationFd);

    assertBoundIdentity(source, sourceFd, expectedStat, externallySealed);
    const actual = hash.digest();
    const expected = Buffer.from(boundSha256, 'hex');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(actual, expected)) {
      const error = new SafeError('Die versiegelte Arbeitskopie wurde verändert. Der Lauf wurde sicher gestoppt.');
      if (externallySealed) error.code = 'BATCH_SNAPSHOT_CHANGED';
      else error.code = 'SOURCE_SNAPSHOT_CHANGED';
      throw error;
    }
    result = Object.freeze({ privatePath: destination, sourceMutated: false });
  } catch (error) {
    failure = error;
  }
  failure = closeDescriptor(destinationFd, failure);
  failure = closeDescriptor(sourceFd, failure);
  if (failure && destinationCreated) {
    try {
      fs.unlinkSync(destination);
    } catch {
      const cleanupError = new SafeError('Die private Arbeitskopie konnte nach einem Fehler nicht sicher entfernt werden.');
      cleanupError.code = 'PRIVATE_COPY_CLEANUP_FAILED';
      throw cleanupError;
    }
  }
  if (failure) throw failure;
  return result;
}

function readSourceToPrivateMemory({ source, expectedStat, expectedSha256 }) {
  assertExpectedStat(expectedStat);
  const externallySealed = expectedSha256 !== undefined;
  if (externallySealed && !/^[a-f0-9]{64}$/i.test(String(expectedSha256))) {
    throw new SafeError('Die versiegelte Arbeitskopie ist ungültig.');
  }
  const boundSha256 = externallySealed
    ? String(expectedSha256).toLowerCase()
    : hashBoundSource(source, expectedStat);

  const noFollow = fs.constants.O_NOFOLLOW || 0;
  let sourceFd;
  let failure = null;
  let privateBytes;
  try {
    sourceFd = fs.openSync(source, fs.constants.O_RDONLY | noFollow);
    const opened = assertBoundIdentity(source, sourceFd, expectedStat, externallySealed);
    privateBytes = Buffer.allocUnsafe(opened.size);
    const hash = crypto.createHash('sha256');
    let position = 0;
    while (position < opened.size) {
      const read = fs.readSync(sourceFd, privateBytes, position, opened.size - position, position);
      if (read <= 0) throw new SafeError('Die private Arbeitskopie ist unvollständig.');
      hash.update(privateBytes.subarray(position, position + read));
      position += read;
    }
    assertBoundIdentity(source, sourceFd, expectedStat, externallySealed);
    const actual = hash.digest();
    const expected = Buffer.from(boundSha256, 'hex');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(actual, expected)) {
      throw snapshotChanged(externallySealed);
    }
  } catch (error) {
    failure = error;
  }
  failure = closeDescriptor(sourceFd, failure);
  if (failure) {
    privateBytes?.fill(0);
    throw failure;
  }
  return Object.freeze({ privateBytes, sourceMutated: false });
}

module.exports = { copySourceToPrivateWork, readSourceToPrivateMemory };
