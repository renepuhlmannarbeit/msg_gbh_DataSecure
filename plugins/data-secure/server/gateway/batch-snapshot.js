'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const {
  LIMITS,
  hasReparseComponent
} = require('./common');
const { localReviewError } = require('./batch-review-policy');
const {
  SourceFormatError,
  inspectSourceFormatFromFd,
  extensionForName
} = require('./source-format-inspector');
const { batchRoot, workPath } = require('./batch-private-store');

const STAGING_HEADROOM_BYTES = 64 * 1024 * 1024;

function assertStagingCapacity(queue, statfs = fs.statfsSync) {
  const inputBytes = queue.reduce((total, entry) => total + entry.stat.size, 0);
  // A batch consisting only of preflight stops creates no private source
  // snapshot. The tiny atomic journal is guarded by its own write operation;
  // do not manufacture a 64-MiB staging requirement for zero copied bytes.
  if (inputBytes === 0) return { inputBytes: 0, required: 0, available: null };
  const required = inputBytes * 2 + STAGING_HEADROOM_BYTES;
  let stats;
  try {
    stats = statfs(batchRoot());
  } catch {
    throw new SafeError('Der freie lokale Speicher konnte vor der Stapelübernahme nicht sicher geprüft werden.');
  }
  const availableBlocks = Number(stats?.bavail);
  const blockSize = Number(stats?.bsize);
  if (!Number.isSafeInteger(availableBlocks) || availableBlocks < 0 ||
      !Number.isSafeInteger(blockSize) || blockSize <= 0) {
    throw new SafeError('Der freie lokale Speicher konnte vor der Stapelübernahme nicht sicher geprüft werden.');
  }
  const available = availableBlocks * blockSize;
  if (!Number.isSafeInteger(available) || available < 0) {
    throw new SafeError('Der freie lokale Speicher konnte vor der Stapelübernahme nicht sicher geprüft werden.');
  }
  if (available < required) {
    throw new SafeError('Für die private Arbeitskopie dieses Stapels ist nicht genug lokaler Speicher frei. Bitte Speicher freigeben oder den Stapel aufteilen.');
  }
  return { inputBytes, required, available };
}

function preflightSourceEnvelopes(queue, deps = {}) {
  const inspect = deps.inspectSourceFormatFromFd || inspectSourceFormatFromFd;
  for (const entry of queue) {
    // Compatibility path for isolated callers. Product intake now plans every
    // source before mutation and journals rejected items individually.
    if (!['.docx', '.xlsx', '.pptx'].includes(extensionForName(entry.name))) continue;
    let descriptor;
    try {
      if (hasReparseComponent(entry.full)) throw new SafeError('Eine ausgewählte Datei liegt hinter einem Link oder Reparse-Punkt.');
      descriptor = fs.openSync(entry.full, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const opened = fs.fstatSync(descriptor);
      const named = fs.lstatSync(entry.full);
      if (!opened.isFile() || !named.isFile() || named.isSymbolicLink() ||
        opened.dev !== entry.stat.dev || opened.ino !== entry.stat.ino ||
        named.dev !== entry.stat.dev || named.ino !== entry.stat.ino ||
        opened.size !== entry.stat.size || named.size !== entry.stat.size ||
        opened.mtimeMs !== entry.stat.mtimeMs || named.mtimeMs !== entry.stat.mtimeMs) {
        throw new SafeError('Eine ausgewählte Datei wurde vor der lokalen Übernahme verändert.');
      }
      const result = inspect(descriptor, opened, extensionForName(entry.name), {
        maxEntries: 20000,
        maxUncompressed: LIMITS.MAX_OOXML_EXPANDED_BYTES,
        fstatSync: fs.fstatSync.bind(fs),
        readSync: fs.readSync.bind(fs)
      });
      if (result.verdict === 'rejected') {
        if (result.code === 'SOURCE_ENCRYPTED_UNSUPPORTED') {
          throw localReviewError(
            'PASSWORD_PROTECTED_DOCUMENT_UNSUPPORTED',
            'Die verschlüsselte Datei wurde lokal nicht übernommen. Ein lokaler Entschlüsselungsweg ist nicht freigegeben.'
          );
        }
        if (result.code === 'SOURCE_COMPOUND_BINARY_UNSUPPORTED') {
          throw localReviewError(
            result.code,
            'Die Office-Datei im alten oder verschlüsselten Compound-Format wurde lokal nicht übernommen.'
          );
        }
        throw localReviewError(
          result.code,
          'Dateiendung, Signatur oder minimale Containerstruktur passen nicht sicher zusammen. Die Datei wurde lokal nicht übernommen.'
        );
      }
      // Formally recognised but locked formats stay outside this compatibility
      // boundary and are handled by the admission planner in product intake.
    } catch (error) {
      if (error instanceof SafeError) throw error;
      if (error instanceof SourceFormatError) {
        throw localReviewError(error.code, 'Die ausgewählte Datei konnte vor der lokalen Übernahme nicht sicher geprüft werden.');
      }
      throw new SafeError('Die ausgewählte Datei konnte vor der lokalen Stapelübernahme nicht sicher geprüft werden.');
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }
}

// Compatibility alias for isolated callers and tests. Production intake uses
// the per-item admission planner instead of this all-or-nothing boundary.
const preflightOoxmlContainers = preflightSourceEnvelopes;

function regularFileStat(target) {
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  let descriptor;
  try {
    descriptor = fs.openSync(target, fs.constants.O_RDONLY | noFollow);
    const opened = fs.fstatSync(descriptor);
    const named = fs.lstatSync(target);
    if (!opened.isFile() || !named.isFile() || named.isSymbolicLink() || opened.dev !== named.dev || opened.ino !== named.ino) {
      throw new SafeError('Die lokale Arbeitskopie ist nicht sicher verwendbar.');
    }
    return opened;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function copySnapshotFile(source, destination, expected, deps = {}) {
  const io = deps.fs || fs;
  const reparseCheck = deps.hasReparseComponent || hasReparseComponent;
  const noFollow = io.constants.O_NOFOLLOW || 0;
  let input;
  let output;
  let outputCreated = false;
  let succeeded = false;
  try {
    if (reparseCheck(source)) throw new SafeError('Eine ausgewählte Datei liegt hinter einem Link oder Reparse-Punkt.');
    input = io.openSync(source, io.constants.O_RDONLY | noFollow);
    const opened = io.fstatSync(input);
    const named = io.lstatSync(source);
    const expectedCtime = Number(expected.ctimeMs);
    if (!opened.isFile() || !named.isFile() || named.isSymbolicLink() ||
      opened.dev !== expected.dev || opened.ino !== expected.ino ||
      named.dev !== expected.dev || named.ino !== expected.ino ||
      opened.size !== expected.size || named.size !== expected.size ||
      opened.mtimeMs !== expected.mtimeMs || named.mtimeMs !== expected.mtimeMs ||
      (Number.isFinite(expectedCtime) && (opened.ctimeMs !== expectedCtime || named.ctimeMs !== expectedCtime))) {
      throw new SafeError('Eine ausgewählte Datei wurde während der lokalen Übernahme verändert.');
    }
    output = io.openSync(destination, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL, 0o600);
    outputCreated = true;
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < opened.size) {
      const read = io.readSync(input, buffer, 0, Math.min(buffer.length, opened.size - position), position);
      if (read <= 0) throw new SafeError('Die private Arbeitskopie ist unvollständig.');
      hash.update(buffer.subarray(0, read));
      let written = 0;
      while (written < read) {
        const count = io.writeSync(output, buffer, written, read - written);
        if (!Number.isSafeInteger(count) || count <= 0 || count > read - written) {
          throw new SafeError('Die private Arbeitskopie ist unvollständig.');
        }
        written += count;
      }
      position += read;
    }
    io.fsyncSync(output);
    const after = io.lstatSync(source);
    const rechecked = io.fstatSync(input);
    if (!after.isFile() || after.isSymbolicLink() || after.dev !== expected.dev || after.ino !== expected.ino ||
      after.size !== expected.size || after.mtimeMs !== expected.mtimeMs ||
      rechecked.size !== expected.size || rechecked.mtimeMs !== expected.mtimeMs ||
      (Number.isFinite(expectedCtime) && (after.ctimeMs !== expectedCtime || rechecked.ctimeMs !== expectedCtime))) {
      throw new SafeError('Eine ausgewählte Datei wurde während der lokalen Übernahme verändert.');
    }
    succeeded = true;
    return { size: position, sha256: hash.digest('hex') };
  } finally {
    let closeError;
    if (output !== undefined) {
      try { io.closeSync(output); } catch (error) { closeError = error; }
    }
    if (input !== undefined) {
      try { io.closeSync(input); } catch (error) { closeError ||= error; }
    }
    if ((!succeeded || closeError) && outputCreated) {
      try { io.unlinkSync(destination); } catch { /* outer work-tree cleanup remains the final fail-closed guard */ }
    }
    if (succeeded && closeError) throw closeError;
  }
}

function exactPendingEntry(state, item, deps = {}) {
  const pathApi = deps.path || path;
  const pathForWork = deps.workPath || workPath;
  const statRegularFile = deps.regularFileStat || regularFileStat;
  if (!/^[0-9]{3}_[a-f0-9]{24}(?:\.[a-z0-9]+)?$/i.test(String(item?.work_name || ''))) {
    throw new SafeError('Die versiegelte Arbeitskopie ist ungültig.');
  }
  const full = pathApi.join(pathForWork(state.token), item.work_name);
  const stat = statRegularFile(full);
  if (stat.size !== item.size) {
    throw new SafeError('Die versiegelte Arbeitskopie wurde verändert. Der Lauf wurde sicher gestoppt.');
  }
  // Hash verification remains fused with the next mandatory streaming copy;
  // this read-side binding performs no duplicate content read.
  return { name: item.name, full, stat, expected_sha256: item.sha256 };
}

module.exports = {
  assertStagingCapacity,
  preflightSourceEnvelopes,
  preflightOoxmlContainers,
  regularFileStat,
  copySnapshotFile,
  exactPendingEntry
};
