'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError, dataRoot } = require('../runtime');
const { PROFILES, LIMITS, roots, listInput, validateBatchLimits, sha256File, storageStatus, ensurePrivateDirectory, safeRemovePrivateTree, hasReparseComponent } = require('./common');
const { anonymizeNext, prepareProcessingRun } = require('./orchestrator');
const { retentionDays } = require('./retention');
const { appendMapping, ensureMappingOutbox, removeMappingOutbox, readOutboxEntries, STOPPED: MAPPING_STOPPED } = require('./mapping');
const { appendBatchEvidence } = require('./batch-evidence');
const { createBatchResultAccess } = require('./batch-results');
const { createBatchProgress } = require('./batch-progress');
const {
  createPhaseRecorder,
  createPrivateIoSummary,
  incrementPrivateIoSummary
} = require('./performance');
const { inspectZipDirectoryFromFd, ZipError } = require('../zip-reader');
const {
  buildReviewDraft,
  validateReviewResult,
  applyManualRedactions,
  reviewTextLocally,
  reviewBatchTextLocally: runBatchReviewLocally
} = require('../companion/text-review');

const TOKEN_RE = /^[a-f0-9]{64}$/;
const active = new Set();
const RETRYABLE_CODES = new Set(['REQUEST_CANCELLED', 'PARSER_TIMEOUT', 'PARSER_START_FAILED', 'PROCESSING_INTERRUPTED', 'LOCAL_CAPACITY_UNAVAILABLE', 'LOCAL_CAPACITY_INSUFFICIENT', 'LOCAL_CAPACITY_RACE']);
const STAGING_HEADROOM_BYTES = 64 * 1024 * 1024;
const DELIVERY_PENDING = 'delivery_pending';
const DEFERRED_REVIEW = 'deferred_review';
const MAPPING_PENDING = 'mapping_pending';

function localReviewError(code, message) {
  const error = new SafeError(message);
  error.code = code;
  return error;
}

async function reviewSingleBatchTextLocally(input, state, item, deps = {}) {
  // A confirmed Input-folder batch authorizes automatic release of clear
  // text. Only credential-issuer ambiguity requires an extra local decision.
  // The review draft stays in memory and reaches the native UI only over
  // stdin; it is never added to the batch journal or returned through MCP.
  if ((input.ambiguities || []).length === 0) return { text: input.anonymized_text };
  // The first pass of a real multi-file batch must finish its analysis before
  // asking a human a document-specific question. Keep only the fixed deferred
  // state; the private snapshot is sufficient to reconstruct this review
  // locally after an explicit continuation. A resumed deferred item is the
  // exception: it is now intentionally being decided.
  if (state.items.length > 1 && item.review_resumed !== true && deps.deferAmbiguousReview !== false) {
    throw localReviewError('LOCAL_REVIEW_DEFERRED', 'Die lokale Zertifikatsentscheidung wird nach der Stapelanalyse gemeinsam vorgelegt. Die Datei bleibt bis dahin lokal gesperrt.');
  }
  const platform = deps.platform || process.platform;
  if (!['win32', 'darwin', 'linux'].includes(platform)) {
    throw localReviewError('LOCAL_REVIEW_REQUIRED', 'Mehrdeutige Organisationen benötigen auf diesem Gerät eine lokale Entscheidung; es wurde nichts freigegeben.');
  }
  const draft = buildReviewDraft(input.original_text, input.anonymized_text, input.profile, input.ambiguities, {
    batchIndex: state.items.indexOf(item) + 1,
    batchTotal: state.items.length,
    allowDefer: true
  });
  const reviewer = deps.reviewTextLocally || reviewTextLocally;
  const rawDecision = await reviewer(draft, {
    platform,
    ...(deps.reviewOptions || {})
  });
  const decision = validateReviewResult(rawDecision, draft);
  if (decision.action === 'deferred') {
    throw localReviewError('LOCAL_REVIEW_DEFERRED', 'Die lokale Zertifikatsentscheidung wurde vertagt. Die Datei bleibt lokal gesperrt und kann später ausdrücklich fortgesetzt werden.');
  }
  if (decision.action !== 'reviewed') {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Entscheidung zu einer Zertifizierungsorganisation wurde abgebrochen. Es wurde nichts freigegeben.');
  }
  const ambiguityById = new Map(input.ambiguities.map((candidate) => [candidate.ambiguity_id, candidate]));
  const ambiguityRedactions = decision.decisions
    .filter((candidate) => candidate.decision === 'redact')
    .map((candidate) => {
      const ambiguity = ambiguityById.get(candidate.ambiguity_id);
      return { start: ambiguity.anonymized_start, end: ambiguity.anonymized_end };
    });
  return { text: applyManualRedactions(input.anonymized_text, [...decision.redactions, ...ambiguityRedactions]) };
}

function batchRoot() {
  const gatewayRoot = ensurePrivateDirectory(path.dirname(dataRoot()), path.basename(dataRoot()));
  return ensurePrivateDirectory(gatewayRoot, 'batches');
}

function batchTtlMs() {
  // A stopped batch is useful only while its private snapshot is retained.
  // A zero-day retention deliberately expires paused batches at the end of the
  // current operation rather than retaining their source bytes.
  return retentionDays() * 24 * 60 * 60 * 1000;
}

function assertStagingCapacity(queue, statfs = fs.statfsSync) {
  const inputBytes = queue.reduce((total, entry) => total + entry.stat.size, 0);
  // The snapshot is copied once, then the single active parser receives a
  // separate private job copy. Reserve both plus a fixed metadata/output margin
  // before touching the first source, rather than filling the disk halfway.
  const required = inputBytes * 2 + STAGING_HEADROOM_BYTES;
  let stats;
  try { stats = statfs(batchRoot()); } catch { throw new SafeError('Der freie lokale Speicher konnte vor der Stapelübernahme nicht sicher geprüft werden.'); }
  const availableBlocks = Number(stats?.bavail);
  const blockSize = Number(stats?.bsize);
  // Validate operands independently. Otherwise two corrupt negative values
  // could multiply to a plausible positive capacity and permit a snapshot
  // although the platform did not provide trustworthy filesystem metadata.
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

function preflightOoxmlContainers(queue) {
  // All OOXML families are ZIP containers, even where the product release gate
  // still blocks XLSX/PPTX. Inspecting their central directory before the
  // snapshot catches ZIP64, encrypted and expansion-bomb containers before any
  // private work copy exists. This does not replace the later full parser/CRC
  // validation and never returns archive names or bytes.
  for (const entry of queue) {
    if (!['.docx', '.xlsx', '.pptx'].includes(path.extname(entry.name).toLowerCase())) continue;
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
      // This gate is deliberately directory-only. A file merely named .docx,
      // .xlsx or .pptx but without an OPC/CFB signature remains a per-item
      // worker result; it must not turn intake into an all-or-nothing failure.
      inspectZipDirectoryFromFd(descriptor, opened.size, {
        maxEntries: 20000,
        maxUncompressed: LIMITS.MAX_OOXML_EXPANDED_BYTES
      });
    } catch (error) {
      // Do not offer a password prompt unless a reviewed local decrypter is
      // actually available. The fixed code allows a clear user explanation
      // without exposing archive names, paths, or container details.
      if (error instanceof ZipError && ['ZIP_ENCRYPTED_ENTRY', 'OOXML_ENCRYPTED_CONTAINER'].includes(error.code)) {
        throw localReviewError(
          'PASSWORD_PROTECTED_DOCUMENT_UNSUPPORTED',
          'Die passwortgeschützte Office-Datei wurde lokal nicht übernommen. Ein geprüfter lokaler Entschlüsselungsweg ist noch nicht freigegeben.'
        );
      }
      throw new SafeError('Der Office-Container konnte vor der lokalen Stapelübernahme nicht sicher geprüft werden.');
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }
}

function batchPath(token) {
  if (!TOKEN_RE.test(String(token || ''))) throw new SafeError('Ungültige oder abgelaufene Batch-Sitzung.');
  return path.join(batchRoot(), `${token}.json`);
}

function workPath(token) {
  if (!TOKEN_RE.test(String(token || ''))) throw new SafeError('Ungültige oder abgelaufene Batch-Sitzung.');
  return path.join(batchRoot(), `${token}.work`);
}

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

function copySnapshotFile(source, destination, expected) {
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  let input;
  let output;
  try {
    if (hasReparseComponent(source)) throw new SafeError('Eine ausgewählte Datei liegt hinter einem Link oder Reparse-Punkt.');
    input = fs.openSync(source, fs.constants.O_RDONLY | noFollow);
    const opened = fs.fstatSync(input);
    const named = fs.lstatSync(source);
    if (!opened.isFile() || !named.isFile() || named.isSymbolicLink() ||
      opened.dev !== expected.dev || opened.ino !== expected.ino ||
      named.dev !== expected.dev || named.ino !== expected.ino ||
      opened.size !== expected.size || named.size !== expected.size ||
      opened.mtimeMs !== expected.mtimeMs || named.mtimeMs !== expected.mtimeMs) {
      throw new SafeError('Eine ausgewählte Datei wurde während der lokalen Übernahme verändert.');
    }
    output = fs.openSync(destination, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < opened.size) {
      const read = fs.readSync(input, buffer, 0, Math.min(buffer.length, opened.size - position), position);
      if (read <= 0) throw new SafeError('Die private Arbeitskopie ist unvollständig.');
      hash.update(buffer.subarray(0, read));
      let written = 0;
      while (written < read) written += fs.writeSync(output, buffer, written, read - written);
      position += read;
    }
    fs.fsyncSync(output);
    const after = fs.lstatSync(source);
    const rechecked = fs.fstatSync(input);
    if (!after.isFile() || after.isSymbolicLink() || after.dev !== expected.dev || after.ino !== expected.ino ||
      after.size !== expected.size || after.mtimeMs !== expected.mtimeMs ||
      rechecked.size !== expected.size || rechecked.mtimeMs !== expected.mtimeMs) {
      throw new SafeError('Eine ausgewählte Datei wurde während der lokalen Übernahme verändert.');
    }
    return { size: position, sha256: hash.digest('hex') };
  } finally {
    if (output !== undefined) fs.closeSync(output);
    if (input !== undefined) fs.closeSync(input);
  }
}

function safeRemoveWorkDirectory(token) {
  try { safeRemovePrivateTree(batchRoot(), `${token}.work`); }
  catch { throw new SafeError('Der lokale Arbeitsbereich konnte nicht sicher bereinigt werden.'); }
}

function activeLockPath() { return path.join(batchRoot(), 'active-processing.json'); }

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function liveLocalExecutor(state) {
  return Number.isSafeInteger(state?.local_executor_pid) && state.local_executor_pid > 0 &&
    processAlive(state.local_executor_pid);
}

function assertLocalExecutorAccess(state, executorPid) {
  if (!liveLocalExecutor(state)) {
    if (state.local_executor_pid !== undefined) {
      delete state.local_executor_pid;
      delete state.local_executor_started_at;
      writeState(state);
    }
    return;
  }
  if (state.local_executor_pid !== executorPid) {
    throw new SafeError('Dieser Dokumentstapel wird bereits vollständig lokal verarbeitet.');
  }
}

function validActiveLock(value) {
  return Boolean(value && value.schema === 'datasecure-active-batch/1' &&
    TOKEN_RE.test(value.token) && Number.isSafeInteger(value.pid) && value.pid > 0 &&
    typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at)));
}

function readActiveLock() {
  const target = activeLockPath();
  let descriptor;
  try {
    descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(descriptor);
    const named = fs.lstatSync(target);
    if (!stat.isFile() || named.isSymbolicLink() || named.dev !== stat.dev || named.ino !== stat.ino) return null;
    const value = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
    return validActiveLock(value) ? value : null;
  } catch { return null; } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

function acquireActiveLock(token) {
  const target = activeLockPath();
  const value = { schema: 'datasecure-active-batch/1', token, pid: process.pid, created_at: new Date().toISOString() };
  try {
    fs.writeFileSync(target, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return true;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw new SafeError('Die lokale Stapelsperre konnte nicht sicher angelegt werden.');
  }
  const existing = readActiveLock();
  // Only a conclusively dead, well-formed owner may be recovered. An unknown,
  // malformed or live lock remains blocking; guessing would permit two writers.
  if (!existing || processAlive(existing.pid)) {
    throw new SafeError('Ein anderer lokaler DataSecure-Stapel wird bereits verarbeitet.');
  }
  try { fs.unlinkSync(target); } catch { throw new SafeError('Die verwaiste lokale Stapelsperre konnte nicht sicher bereinigt werden.'); }
  try {
    fs.writeFileSync(target, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return true;
  } catch { throw new SafeError('Ein anderer lokaler DataSecure-Stapel wird bereits verarbeitet.'); }
}

function releaseActiveLock(token) {
  const existing = readActiveLock();
  if (!existing || existing.token !== token || existing.pid !== process.pid) return;
  try { fs.unlinkSync(activeLockPath()); } catch { /* stale lock remains fail-closed */ }
}

// `durable: false` (only ever passed for the same-status diagnostic phase
// markers written while an item stays 'processing' - private_copy_claimed,
// extracted, text_privacy_checked, package_verified, package_published)
// skips both fsyncs. markInterruptedItemsRetryable() below keys only on
// item.status, never on item.checkpoint: whichever of these markers last
// made it to disk before a crash, the item is still read back as
// 'processing' and is still correctly recovered as retryable, exactly as
// if this call had never run. The temp-file-then-rename write stays
// unconditional even when non-durable, so a crash mid-write still can
// never leave a torn or half-written journal behind - only the flush
// timing relative to a *power loss* (not a process crash) is relaxed, and
// only where nothing observable depends on that timing. Every write that
// actually changes item.status keeps the full durable path.
function writeState(state, options = {}) {
  const durable = options.durable !== false;
  const target = batchPath(state.token);
  const temporary = `${target}.tmp_${crypto.randomBytes(6).toString('hex')}`;
  const payload = Buffer.from(`${JSON.stringify(state)}\n`, 'utf8');
  // The batch journal is the single source of truth for in-flight items; an
  // unsynced write can survive a process crash but not a power loss between
  // the write and the rename, letting the rename land the old journal back.
  try {
    const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
    try {
      writeFully(fd, payload);
      if (durable) fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, target);
    if (durable) syncParentDirectory(target);
  } catch (err) {
    // A failed short write or flush must never leave a journal-looking
    // temporary file behind. The old atomically published state remains the
    // source of truth; cleanup is bounded to the exact random temporary path.
    try { fs.unlinkSync(temporary); } catch { /* absent or already renamed */ }
    throw err;
  }
}

function writeFully(fd, payload, io = fs) {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  let offset = 0;
  while (offset < bytes.length) {
    const written = io.writeSync(fd, bytes, offset, bytes.length - offset, null);
    if (!Number.isSafeInteger(written) || written <= 0 || written > bytes.length - offset) {
      throw new Error('BATCH_JOURNAL_PARTIAL_WRITE');
    }
    offset += written;
  }
  return offset;
}

function syncParentDirectory(target, io = fs, platform = process.platform) {
  // Windows does not provide the same portable directory-fsync contract.
  // The journal file itself is flushed above; POSIX additionally persists the
  // rename metadata before the state transition is reported as durable.
  if (platform === 'win32') return false;
  let descriptor;
  try {
    descriptor = io.openSync(path.dirname(target), io.constants.O_RDONLY);
    io.fsyncSync(descriptor);
    return true;
  } finally {
    if (descriptor !== undefined) io.closeSync(descriptor);
  }
}

function readState(token) {
  const target = batchPath(token);
  let state;
  let descriptor;
  try {
    descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(descriptor);
    const named = fs.lstatSync(target);
    if (!stat.isFile() || named.isSymbolicLink() || named.dev !== stat.dev || named.ino !== stat.ino) {
      throw new Error('unsafe');
    }
    state = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
  } catch {
    throw new SafeError('Batch-Sitzung wurde nicht gefunden oder ist ungültig. Bitte den Eingang erneut bestätigen.');
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  if (state.token !== token || state.schema !== 'datasecure-batch/1' || !Array.isArray(state.items) || state.items.length === 0) {
    throw new SafeError('Batch-Sitzung ist ungültig. Bitte den Eingang erneut bestätigen.');
  }
  if (Date.now() > Date.parse(state.expires_at)) {
    try {
      safeRemoveWorkDirectory(token);
      fs.unlinkSync(target);
    } catch { /* fail closed below */ }
    throw new SafeError('Batch-Sitzung ist abgelaufen. Bitte den Eingang erneut bestätigen.');
  }
  return state;
}

// Cross-references every still-open batch item with the Output scope so
// retention never deletes a package a batch still needs to reach delivery or
// mapping. Deliberately read-only (unlike readState) and tolerant of anything
// malformed. Instead it marks the inspection incomplete so automatic Output
// retention skips the entire scope. A bad journal can therefore only delay a
// cleanup, never narrow the protection set and delete referenced packages.
// Bounded by the batch's own TTL: cleanupExpiredBatchSnapshots reaps valid
// expired journals on the normal schedule, after which their packages fall
// back under ordinary time-based retention.
function openBatchPackageProtection(fsApi = fs) {
  const ids = new Set();
  const dir = batchRoot();
  let entries;
  try {
    entries = fsApi.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { ids, complete: false };
  }
  for (const entry of entries) {
    if (!entry.isFile || !entry.isFile() || !entry.name.endsWith('.json')) continue;
    let state;
    try {
      state = JSON.parse(fsApi.readFileSync(path.join(dir, entry.name), 'utf8'));
    } catch {
      return { ids, complete: false };
    }
    if (state?.schema !== 'datasecure-batch/1' || !Array.isArray(state.items)) {
      return { ids, complete: false };
    }
    for (const item of state.items) {
      if ((item?.status === DELIVERY_PENDING || item?.status === MAPPING_PENDING) &&
        /^ds_[a-f0-9]{32}$/i.test(String(item?.package_id || ''))) {
        ids.add(item.package_id);
      }
    }
  }
  return { ids, complete: true };
}

const { batchUserStatus, publicProgress } = createBatchProgress({
  deliveryPendingStatus: DELIVERY_PENDING,
  deferredReviewStatus: DEFERRED_REVIEW,
  mappingPendingStatus: MAPPING_PENDING,
  liveLocalExecutor
});

function writeTerminalEvidence(state) {
  const progress = publicProgress(state);
  // A batch with retryable work is deliberately not final: a later explicit
  // resume must produce the only terminal receipt. A stopped document is final
  // only once the remaining queue is exhausted.
  if (progress.remaining !== 0 || progress.processing !== 0 || progress.retryable !== 0 || progress.deferred_review !== 0 || progress.mapping_pending !== 0) return undefined;
  // The receipt is a local transparency artifact, not an authorization gate.
  // A damaged old receipt must never cause a newly valid package to be marked
  // stopped after it has been safely released and mapped. The caller receives a
  // bounded status and can have the local export repaired without retrying data.
  try {
    appendBatchEvidence(state);
    return true;
  } catch {
    return false;
  }
}

function resumeBatch(token) {
  if (active.has(token)) throw new SafeError('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
  acquireActiveLock(token);
  active.add(token);
  try {
  const state = readState(token);
  assertLocalExecutorAccess(state);
  if (state.invalidated === true) throw new SafeError('Der bestätigte Dateistapel wurde verändert und ist nicht mehr verwendbar.');
  // The caller owns the live global lock at this point.  A leftover
  // `processing` state can therefore only be from a previous interrupted
  // owner, never from a concurrent worker.  First adopt a verified package,
  // then make any remaining interrupted item eligible for this *explicit*
  // resume request.
  let changed = reconcilePublishedItems(state);
  if (reconcilePendingMappings(state)) changed = true;
  if (markInterruptedItemsRetryable(state) > 0) changed = true;
  let resumed = 0;
  for (const item of state.items) {
    if (item.status === 'retryable') {
      item.status = 'pending';
      item.checkpoint = 'resumed';
      delete item.error_code;
      resumed++;
    }
  }
  if (!resumed) {
    if (changed) writeState(state);
    return {
      ok: false,
      error: state.items.some((item) => item.status === DEFERRED_REVIEW)
        ? 'batch_review_required'
        : (state.items.some((item) => item.status === MAPPING_PENDING) ? 'local_mapping_repair_pending' : 'no_retryable_documents'),
      ...publicProgress(state), raw_content_sent_to_claude: false
    };
  }
  writeState(state);
  return { ok: true, resumed, ...publicProgress(state), raw_content_sent_to_claude: false };
  } finally {
    active.delete(token);
    releaseActiveLock(token);
  }
}

function incompleteBatchState(state) {
  return !state.invalidated && (state.items || []).some((item) =>
    ['pending', 'processing', 'retryable', DEFERRED_REVIEW, MAPPING_PENDING, DELIVERY_PENDING].includes(item.status)
  );
}

function recoverableBatchStates(options = {}) {
  const states = [];
  // Status enumeration must not call readState() while another process owns a
  // live batch: readState() performs expiry cleanup for an unowned session.
  // A read-only MCP status call must never mutate a live owner's snapshot.
  const owner = readActiveLock();
  if (!options.ignoreActiveLock && owner && processAlive(owner.pid)) return states;
  let entries = [];
  try { entries = fs.readdirSync(batchRoot(), { withFileTypes: true }); } catch { return states; }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const token = entry.name.slice(0, -'.json'.length);
    if (!TOKEN_RE.test(token)) continue;
    try {
      const state = readStateForMaintenance(token);
      if (Date.now() <= Date.parse(state.expires_at) && incompleteBatchState(state) &&
          (options.includeActiveExecutors === true || !liveLocalExecutor(state))) states.push(state);
    } catch { /* malformed and expired snapshots remain unavailable */ }
  }
  return states;
}

function recoverableBatchStatus() {
  const owner = readActiveLock();
  let processingActive = Boolean(owner && processAlive(owner.pid));
  const allStates = processingActive ? [] : recoverableBatchStates({ includeActiveExecutors: true });
  if (allStates.some((state) => liveLocalExecutor(state))) processingActive = true;
  const states = allStates.filter((state) => !liveLocalExecutor(state));
  return {
    recoverable_batches: states.length,
    batches_awaiting_resume: states.filter((state) => publicProgress(state).awaiting_resume).length,
    batches_awaiting_delivery: states.filter((state) => state.items.some((item) => item.status === DELIVERY_PENDING)).length,
    batch_processing_active: processingActive
  };
}

function localCleanupStatus() {
  // The count is deliberately a support signal only. It is built from the
  // private snapshots locally and never exposes a batch token, item position,
  // name, path, hash or any document-derived state to MCP.
  let pending = 0;
  let expiredPending = 0;
  const owner = readActiveLock();
  if (owner && processAlive(owner.pid)) {
    return { private_work_copy_cleanup_pending: pending, expired_batch_cleanup_pending: expiredPending };
  }
  let entries = [];
  try { entries = fs.readdirSync(batchRoot(), { withFileTypes: true }); } catch {
    return { private_work_copy_cleanup_pending: 0, expired_batch_cleanup_pending: 0 };
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const token = entry.name.slice(0, -'.json'.length);
    if (!TOKEN_RE.test(token)) continue;
    try {
      const state = readStateForMaintenance(token);
      if (Date.now() > Date.parse(state.expires_at)) {
        // The journal itself still proves that private state awaits the next
        // safe maintenance pass. Expose only an aggregate, never its token or
        // document count, so a failed expiry cleanup is operationally visible.
        expiredPending++;
      } else pending += (state.items || []).filter((item) => item.work_copy_cleanup_pending === true).length;
    } catch { /* malformed or expired private state stays unavailable */ }
  }
  return { private_work_copy_cleanup_pending: pending, expired_batch_cleanup_pending: expiredPending };
}

function continueMostRecentBatch() {
  const states = recoverableBatchStates().sort((left, right) =>
    Date.parse(right.created_at) - Date.parse(left.created_at)
  );
  if (!states.length) return { ok: false, error: 'no_incomplete_batch', raw_content_sent_to_claude: false };
  const selected = states[0];
  // resumeBatch acquires the global owner lock before inspecting a lingering
  // `processing` marker. A live worker remains protected by that lock; a dead
  // one becomes retryable only because the user explicitly continued it. A
  // deferred human review is intentionally not resumed here: it must enter
  // the aggregate local-review path rather than falling back to one-file UI.
  const before = readState(selected.token);
  if (before.items.some((item) => item.status === 'retryable' || item.status === 'processing')) {
    const resumed = resumeBatch(selected.token);
    if (resumed.ok === false) return resumed;
  }
  return { ok: true, batch_token: selected.token, ...publicProgress(readState(selected.token)), raw_content_sent_to_claude: false };
}

function discardIncompleteBatches() {
  const maintenanceToken = crypto.randomBytes(32).toString('hex');
  acquireActiveLock(maintenanceToken);
  try {
    const allStates = recoverableBatchStates({ ignoreActiveLock: true, includeActiveExecutors: true });
    if (allStates.some((state) => liveLocalExecutor(state))) {
      throw new SafeError('Ein lokaler Dokumentstapel wird noch verarbeitet und kann nicht verworfen werden.');
    }
    const states = allStates;
    let discarded = 0;
    for (const state of states) {
      // A discard is a local, user-confirmed abandonment of the sealed source
      // snapshot. It never touches already published output packages or the
      // durable local mapping ledger.
      safeRemoveWorkDirectory(state.token);
      fs.unlinkSync(batchPath(state.token));
      discarded += 1;
    }
    return { ok: true, discarded_batches: discarded, raw_content_sent_to_claude: false };
  } finally {
    releaseActiveLock(maintenanceToken);
  }
}

function beginBatch(options = {}) {
  if (!storageStatus().safe) throw new SafeError('Der konfigurierte Datenschutzordner ist für die lokale Verarbeitung nicht freigegeben.');
  const expected = Number(options.expectedCount);
  if (!Number.isInteger(expected) || expected < 1 || expected > LIMITS.MAX_BATCH_FILES) {
    throw new SafeError(`Bestätigte Dateianzahl muss zwischen 1 und ${LIMITS.MAX_BATCH_FILES} liegen.`);
  }
  // The normal UX supplies an in-memory, locally selected queue. Its paths
  // never leave this process; the Input directory remains an advanced/manual
  // intake route for recovery and managed workflows.
  const queue = Array.isArray(options.queue) ? options.queue.map((entry) => {
    const full = path.resolve(String(entry?.full || ''));
    const name = String(entry?.name || '');
    if (!path.isAbsolute(full) || !name || path.basename(name) !== name) {
      throw new SafeError('Die lokale Dateiauswahl ist ungültig.');
    }
    if ((options.hasReparseComponent || hasReparseComponent)(full)) {
      throw new SafeError('Eine ausgewählte Datei liegt hinter einem Link oder Reparse-Punkt.');
    }
    let stat;
    try { stat = fs.lstatSync(full); } catch { throw new SafeError('Eine ausgewählte Datei ist nicht mehr verfügbar.'); }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new SafeError('Eine ausgewählte Datei ist nicht regulär lokal verfügbar.');
    if (Number(entry?.sourceBytes) !== stat.size) throw new SafeError('Eine ausgewählte Datei wurde vor der Übernahme verändert.');
    return { name, full, stat };
  }) : listInput();
  if (queue.length === 0) {
    return { ok: false, error: 'input_empty', input_documents_seen: 0, raw_content_sent_to_claude: false };
  }
  if (queue.length !== expected) {
    return {
      ok: false,
      error: 'input_count_changed',
      expected_documents: expected,
      input_documents_seen: queue.length,
      raw_content_sent_to_claude: false
    };
  }
  try { validateBatchLimits(queue); } catch (error) {
    if (error.message === 'BATCH_TOTAL_LIMIT') throw new SafeError('Der bestätigte Stapel ist größer als 500 MB.');
    if (error.message === 'INPUT_FORMAT_LIMIT') {
      throw new SafeError('Eine ausgewählte Datei überschreitet die sichere Einzeldateigrenze für ihr Format. Bitte teilen Sie diese Datei auf.');
    }
    throw new SafeError('Eine ausgewählte Datei liegt außerhalb der zulässigen Größe.');
  }
  // The server-bound Input folder has no native picker.  Give it the same
  // local, counter-only final confirmation before any private copy is made.
  // Tests and non-UI callers omit the optional dependency deliberately.
  if (typeof options.confirmStart === 'function') {
    const confirmed = options.confirmStart({
      selected_count: queue.length,
      total_bytes: queue.reduce((total, entry) => total + entry.stat.size, 0)
    });
    if (confirmed !== true) {
      return {
        ok: false,
        error: 'local_batch_start_cancelled',
        message: 'Die lokale Startbestätigung wurde abgebrochen. Es wurde kein Stapel begonnen.',
        user_status: 'Lokaler Start abgebrochen: Es wurde kein Stapel begonnen.',
        next_action: 'restart_only_on_request',
        input_documents_seen: queue.length,
        raw_content_sent_to_claude: false
      };
    }
  }
  preflightOoxmlContainers(queue);
  assertStagingCapacity(queue, options.statfs || fs.statfsSync);
  const profile = String(options.profile || 'auto').toLowerCase();
  if (!PROFILES.has(profile)) throw new SafeError('Unbekanntes Profil.');
  const requestedToken = options.token;
  if (requestedToken !== undefined && !TOKEN_RE.test(String(requestedToken))) {
    throw new SafeError('Die lokale Batch-Sitzung ist ungültig.');
  }
  const token = requestedToken || crypto.randomBytes(32).toString('hex');
  if (fs.existsSync(batchPath(token)) || fs.existsSync(workPath(token))) {
    throw new SafeError('Die lokale Batch-Sitzung ist bereits belegt.');
  }
  const now = Date.now();
  const work = workPath(token);
  try {
    fs.mkdirSync(work, { recursive: false, mode: 0o700 });
    const items = queue.map((entry, index) => {
      const extension = path.extname(entry.name).toLowerCase();
      const workName = `${String(index + 1).padStart(3, '0')}_${crypto.randomBytes(12).toString('hex')}${extension}`;
      const copied = copySnapshotFile(entry.full, path.join(work, workName), entry.stat);
      return {
        id: crypto.randomBytes(16).toString('hex'),
        name: entry.name,
        size: copied.size,
        sha256: copied.sha256,
        work_name: workName,
        status: 'pending',
        checkpoint: 'sealed'
      };
    });
    const state = {
      schema: 'datasecure-batch/1',
      token,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + batchTtlMs()).toISOString(),
      profile,
      remove_images: options.removeImages === true,
      io_summary: createPrivateIoSummary({
        snapshot_preflight_runs: 1,
        snapshot_copy_files: items.length,
        snapshot_copy_mib: Math.ceil(items.reduce((total, item) => total + item.size, 0) / (1024 * 1024))
      }),
      items
    };
    writeState(state);
    return { ok: true, ...publicProgress(state), raw_content_sent_to_claude: false };
  } catch (error) {
    try { safeRemoveWorkDirectory(token); } catch { /* the original error remains private and fail-closed */ }
    if (error instanceof SafeError) throw error;
    throw new SafeError('Der bestätigte Stapel konnte nicht sicher lokal übernommen werden.');
  }
}

function exactPendingEntry(state, item) {
  if (!/^[0-9]{3}_[a-f0-9]{24}(?:\.[a-z0-9]+)?$/i.test(String(item.work_name || ''))) {
    throw new SafeError('Die versiegelte Arbeitskopie ist ungültig.');
  }
  const full = path.join(workPath(state.token), item.work_name);
  const stat = regularFileStat(full);
  if (stat.size !== item.size) {
    throw new SafeError('Die versiegelte Arbeitskopie wurde verändert. Der Lauf wurde sicher gestoppt.');
  }
  // The next mandatory local copy verifies this digest while streaming the
  // exact sealed bytes into its isolated job. That preserves the tamper gate
  // without reading the work copy once just for hashing and again for copying.
  return { name: item.name, full, stat, expected_sha256: item.sha256 };
}

function invalidateUnpublishedBatchCopies(state, deps = {}, exceptItem = null) {
  state.invalidated = true;
  for (const item of state.items) {
    if (item === exceptItem) continue;
    if (!['pending', 'processing', 'retryable', DEFERRED_REVIEW].includes(item.status)) continue;
    item.status = 'stopped';
    item.checkpoint = 'stopped';
    item.error_code = 'BATCH_SNAPSHOT_CHANGED';
    // Published results retain their own lifecycle. Every not-yet-published
    // sealed copy is no longer trustworthy once one batch source fails its
    // immutable-snapshot boundary.
    try { appendMapping(item.name, '', MAPPING_STOPPED); item.local_mapping_exported = true; }
    catch { item.local_mapping_exported = false; }
    try { cleanupTerminalWorkCopy(state, item, deps); }
    catch { item.work_copy_cleanup_pending = true; }
  }
}

function packageIdForItem(item) {
  if (!/^[a-f0-9]{32}$/i.test(String(item?.id || ''))) {
    throw new SafeError('Die lokale Batch-Identität ist ungültig.');
  }
  return `ds_${item.id}`;
}

function publishedPackageState(packageId) {
  if (!/^ds_[a-f0-9]{32}$/i.test(String(packageId || ''))) return 'unsafe';
  let output;
  try { output = roots().output; } catch { return 'unsafe'; }
  const target = path.join(output, packageId);
  if (path.dirname(target) !== output) return 'unsafe';
  if (!fs.existsSync(target)) return 'missing';
  try {
    const folder = fs.lstatSync(target);
    if (!folder.isDirectory() || folder.isSymbolicLink()) return false;
    const manifestPath = path.join(target, 'manifest.json');
    const documentPath = path.join(target, `${packageId}.md`);
    const manifestStat = fs.lstatSync(manifestPath);
    const documentStat = fs.lstatSync(documentPath);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || !documentStat.isFile() || documentStat.isSymbolicLink()) return false;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest?.schema === 'eu-privacy-package/2' && manifest.package_id === packageId &&
      manifest.document === `${packageId}.md` && /^[a-f0-9]{64}$/i.test(String(manifest.document_sha256 || '')) &&
      sha256File(documentPath) === manifest.document_sha256 ? 'verified' : 'unsafe';
  } catch { return 'unsafe'; }
}

function regularPublishedPackage(packageId) {
  return publishedPackageState(packageId) === 'verified';
}

function markMappingPending(item, packageId) {
  if (!regularPublishedPackage(packageId)) {
    throw new SafeError('Das lokal veröffentlichte Paket konnte nicht sicher verifiziert werden.');
  }
  // Mapping is a durable local convenience ledger, not the publication commit
  // point. Persist this state before trying the atomic CSV replacement so a
  // full output package is never deleted solely because its local overview is
  // temporarily unavailable.
  item.status = MAPPING_PENDING;
  item.checkpoint = 'mapping_pending';
  item.package_id = packageId;
  item.error_code = 'LOCAL_MAPPING_EXPORT_PENDING';
  if (item.mapping_outbox_persisted !== true) item.mapping_outbox_persisted = false;
  item.work_copy_cleanup_pending = true;
}

function commitPendingMapping(item, packageId) {
  // Persist the tiny local-only recovery intent before replacing the human
  // mapping CSV. It holds only the source basename and opaque package id; no
  // source copy, path, hash, document text, or capability is retained.
  const outbox = ensureMappingOutbox(item.name, packageId);
  item.mapping_outbox_persisted = true;
  appendMapping(item.name, packageId);
  removeMappingOutbox(outbox);
  delete item.mapping_outbox_persisted;
}

function reconcilePendingMappings(state) {
  let changed = false;
  for (const item of state.items || []) {
    if (item.status !== MAPPING_PENDING) continue;
    const packageId = String(item.package_id || '');
    if (!regularPublishedPackage(packageId)) continue;
    try {
      commitPendingMapping(item, packageId);
      item.status = DELIVERY_PENDING;
      item.checkpoint = 'delivery_pending';
      delete item.error_code;
      changed = true;
    } catch {
      // The pending state stays durable and local.  Do not downgrade the
      // already verified package, generate a stopped row, or expose any
      // mapping identity through MCP.
    }
  }
  return changed;
}

function reconcilePublishedItems(state) {
  let changed = false;
  for (const item of state.items || []) {
    if (item.status !== 'processing') continue;
    let packageId;
    try { packageId = packageIdForItem(item); } catch { continue; }
    // The output package is verified by its own manifest and exact Markdown
    // hash before it is adopted.  A similarly named directory is never enough
    // to turn an interrupted source into a release.
    if (!regularPublishedPackage(packageId)) continue;
    markMappingPending(item, packageId);
    changed = true;
  }
  return changed;
}

function markInterruptedItemsRetryable(state) {
  let recovered = 0;
  for (const item of state.items || []) {
    if (item.status !== 'processing') continue;
    item.status = 'retryable';
    item.error_code = 'PROCESSING_INTERRUPTED';
    item.checkpoint = 'retryable';
    recovered++;
  }
  return recovered;
}

function deliveryResult(state, item) {
  const packageId = String(item?.package_id || '');
  if (!regularPublishedPackage(packageId)) {
    throw new SafeError('Das lokal veröffentlichte Paket konnte nicht sicher verifiziert werden.');
  }
  // A capability is intentionally issued only when the package is handed to
  // this live MCP turn. It is never persisted in the batch snapshot.
  const { issueReadCapability } = require('./package-store');
  const readGrant = issueReadCapability(packageId);
  return {
    ok: true,
    package_id: packageId,
    read_capability: readGrant.read_capability,
    read_capability_expires_at: readGrant.read_capability_expires_at,
    verification: 'passed',
    raw_content_sent_to_claude: false,
    ...publicProgress(state)
  };
}

function cleanupTerminalWorkCopy(state, item, deps = {}) {
  // A terminally released or stopped position has no legitimate reason to
  // retain its sealed source bytes.  Keep this single-file operation as strict
  // as release cleanup: no recursion, no symlink traversal and no derived
  // filename.  A failed deletion is recorded only as a local cleanup duty.
  if (!/^[0-9]{3}_[a-f0-9]{24}(?:\.[a-z0-9]+)?$/i.test(String(item?.work_name || ''))) {
    throw new SafeError('Private Arbeitskopie ist nicht sicher bereinigbar.');
  }
  const full = path.join(workPath(state.token), item.work_name);
  if (fs.existsSync(full)) {
    const stat = fs.lstatSync(full);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new SafeError('Private Arbeitskopie ist nicht sicher bereinigbar.');
    (deps.unlinkWorkCopy || fs.unlinkSync)(full);
  }
  delete item.work_copy_cleanup_pending;
}

function acknowledgeDeliveredPackage(token, packageId, deps = {}) {
  if (active.has(token)) throw new SafeError('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
  acquireActiveLock(token);
  active.add(token);
  try {
    const state = readState(token);
    assertLocalExecutorAccess(state, deps.executorPid);
    const item = state.items.find((candidate) =>
      [DELIVERY_PENDING, 'released'].includes(candidate.status) && candidate.package_id === packageId
    );
    if (!item) throw new SafeError('Für dieses Paket liegt keine bestätigbare Batch-Übergabe vor.');
    if (!regularPublishedPackage(packageId)) throw new SafeError('Das lokal veröffentlichte Paket konnte nicht sicher verifiziert werden.');
    if (item.status === DELIVERY_PENDING) {
      item.status = 'released';
      item.checkpoint = 'released';
      try {
        cleanupTerminalWorkCopy(state, item, deps);
      } catch {
        item.work_copy_cleanup_pending = true;
      }
    }
    item.analysis_acknowledged = true;
    writeState(state);
    return { ok: true, ...publicProgress(state), local_evidence_exported: writeTerminalEvidence(state), raw_content_sent_to_claude: false };
  } finally {
    active.delete(token);
    releaseActiveLock(token);
  }
}

function acknowledgeDeliveredPackages(token, packageIds, deps = {}) {
  if (!Array.isArray(packageIds) || packageIds.length < 1 || packageIds.length > 10 || new Set(packageIds).size !== packageIds.length) {
    throw new SafeError('Bitte zwischen 1 und 10 unterschiedliche Pakete bestätigen.');
  }
  if (active.has(token)) throw new SafeError('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
  acquireActiveLock(token);
  active.add(token);
  try {
    const state = readState(token);
    assertLocalExecutorAccess(state, deps.executorPid);
    // Validate the whole requested page before changing any acknowledgement.
    const items = packageIds.map((packageId) => {
      const item = state.items.find((candidate) =>
        [DELIVERY_PENDING, 'released'].includes(candidate.status) && candidate.package_id === packageId
      );
      if (!item || !regularPublishedPackage(packageId)) {
        throw new SafeError('Für mindestens ein Paket liegt keine bestätigbare Batch-Übergabe vor.');
      }
      return item;
    });
    for (const item of items) {
      if (item.status === DELIVERY_PENDING) {
        item.status = 'released';
        item.checkpoint = 'released';
        try {
          cleanupTerminalWorkCopy(state, item, deps);
        } catch {
          item.work_copy_cleanup_pending = true;
        }
      }
      item.analysis_acknowledged = true;
    }
    writeState(state);
    return { ok: true, acknowledged_count: items.length, ...publicProgress(state), local_evidence_exported: writeTerminalEvidence(state), raw_content_sent_to_claude: false };
  } finally {
    active.delete(token);
    releaseActiveLock(token);
  }
}

function finalizePublishedPackageLocally(token, packageId, deps = {}) {
  if (active.has(token)) throw new SafeError('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
  acquireActiveLock(token);
  active.add(token);
  try {
    const state = readState(token);
    assertLocalExecutorAccess(state, deps.executorPid);
    const item = state.items.find((candidate) => candidate.status === DELIVERY_PENDING && candidate.package_id === packageId);
    if (!item || !regularPublishedPackage(packageId)) {
      throw new SafeError('Das lokal veröffentlichte Paket konnte nicht sicher abgeschlossen werden.');
    }
    item.status = 'released';
    item.checkpoint = 'released_locally';
    item.analysis_acknowledged = false;
    try {
      cleanupTerminalWorkCopy(state, item, deps);
    } catch {
      item.work_copy_cleanup_pending = true;
    }
    writeState(state);
    return { ok: true, ...publicProgress(state), local_evidence_exported: writeTerminalEvidence(state), raw_content_sent_to_claude: false };
  } finally {
    active.delete(token);
    releaseActiveLock(token);
  }
}

const { resultCursor, parseResultCursor, listBatchResults, completedLocalOnlyCandidates } = createBatchResultAccess({
  SafeError,
  fs,
  tokenPattern: TOKEN_RE,
  batchRoot,
  readState,
  readStateForMaintenance,
  publicProgress,
  liveLocalExecutor,
  regularPublishedPackage,
  issueReadCapability: (packageId) => require('./package-store').issueReadCapability(packageId)
});

function retryReleasedWorkCopyCleanup(state, deps = {}) {
  let changed = false;
  let pending = 0;
  for (const item of state.items || []) {
    if (!['released', 'stopped', MAPPING_PENDING].includes(item.status) || item.work_copy_cleanup_pending !== true) continue;
    if (!/^[0-9]{3}_[a-f0-9]{24}(?:\.[a-z0-9]+)?$/i.test(String(item.work_name || ''))) {
      pending++;
      continue;
    }
    try {
      // Never follow or recursively remove an unexpected terminal copy. A
      // vanished regular copy is already clean.
      cleanupTerminalWorkCopy(state, item, deps);
      changed = true;
    } catch {
      pending++;
    }
  }
  return { changed, pending };
}

function reviewedBatchText(input, decisions) {
  if (!Array.isArray(decisions)) {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung ist für diese Datei nicht vollständig. Es wurde nichts freigegeben.');
  }
  const ambiguityById = new Map((input.ambiguities || []).map((candidate) => [candidate.ambiguity_id, candidate]));
  if (decisions.length !== ambiguityById.size) {
    throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung ist für diese Datei nicht vollständig. Es wurde nichts freigegeben.');
  }
  const redactions = decisions.map((candidate) => {
    const ambiguity = ambiguityById.get(candidate.ambiguity_id);
    if (!ambiguity || candidate.decision !== 'redact') {
      if (!ambiguity || candidate.decision !== 'keep') {
        throw localReviewError('LOCAL_REVIEW_CANCELLED', 'Die lokale Stapelentscheidung ist ungültig. Es wurde nichts freigegeben.');
      }
      return null;
    }
    return { start: ambiguity.anonymized_start, end: ambiguity.anonymized_end };
  }).filter(Boolean);
  return { text: applyManualRedactions(input.anonymized_text, redactions) };
}

async function captureDeferredReviewInput(state, item, deps = {}) {
  const entry = exactPendingEntry(state, item);
  let captured;
  try {
    await anonymizeNext(state.profile, {
      ...deps,
      inputQueue: [entry],
      copyClaim: true,
      removeImages: state.remove_images,
      packageId: packageIdForItem(item),
      suppressDiagnostic: true,
      reviewText: (input) => {
        captured = input;
        throw localReviewError('BATCH_REVIEW_CAPTURED', 'Lokaler Stapelreview-Entwurf erfasst.');
      }
    });
  } catch (error) {
    if (error?.code !== 'BATCH_REVIEW_CAPTURED') throw error;
  }
  if (!captured || !Array.isArray(captured.ambiguities) || captured.ambiguities.length === 0) {
    throw localReviewError('BATCH_REVIEW_RECONSTRUCTION_FAILED', 'Die lokale Stapelprüfung konnte die offene Fundstelle nicht unverändert rekonstruieren. Es wurde nichts freigegeben.');
  }
  return captured;
}

function markDeferredReview(state, items, code) {
  for (const item of items) {
    item.status = DEFERRED_REVIEW;
    item.checkpoint = 'awaiting_local_review';
    item.error_code = code;
  }
}

// This is the only path which joins multiple raw-derived review drafts. It
// recreates all of them from sealed local copies, holds them only for the life
// of this request, invokes one local reviewer, and then re-runs the normal
// per-document pipeline with the in-memory decisions. Nothing from `drafts`
// or `decision` is written to the batch journal, diagnostics or MCP response.
async function reviewDeferredBatch(token, deps = {}) {
  if (active.has(token)) throw new SafeError('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
  acquireActiveLock(token);
  active.add(token);
  try {
    const state = readState(token);
    assertLocalExecutorAccess(state, deps.executorPid);
    if (state.invalidated === true) throw new SafeError('Der bestätigte Dateistapel wurde verändert und ist nicht mehr verwendbar.');
    const publishedReconciled = reconcilePublishedItems(state);
    const mappingReconciled = reconcilePendingMappings(state);
    if (publishedReconciled || mappingReconciled) writeState(state);
    if (markInterruptedItemsRetryable(state) > 0) writeState(state);
    const progress = publicProgress(state);
    const items = state.items.filter((item) => item.status === DEFERRED_REVIEW);
    if (!items.length || progress.remaining !== 0 || progress.retryable !== 0 || progress.delivery_pending !== 0) {
      let message = 'Für diesen Stapel gibt es keine vertagten lokalen Entscheidungen.';
      if (progress.remaining !== 0) message = 'Der Stapel analysiert noch weitere Dateien. Die gemeinsame lokale Prüfung startet erst danach.';
      else if (progress.delivery_pending !== 0) message = 'Ein bereits freigegebenes Paket muss zuerst gelesen und bestätigt werden.';
      else if (progress.retryable !== 0) message = 'Eine technische Unterbrechung muss zuerst ausdrücklich fortgesetzt werden.';
      return { ok: false, error: 'batch_review_not_ready', message, ...progress, raw_content_sent_to_claude: false };
    }

    const lifecycle = (event) => {
      try { deps.onReviewLifecycle?.(event); } catch { /* diagnostics cannot change a privacy decision */ }
    };
    const drafts = [];
    try {
      lifecycle({ event: 'review_reconstruction_started', outcome: 'progress', item_count: items.length });
      for (const item of items) drafts.push(await captureDeferredReviewInput(state, item, deps));
      lifecycle({ event: 'review_reconstruction_finished', outcome: 'ok', item_count: items.length });
    } catch (error) {
      lifecycle({ event: 'review_reconstruction_failed', outcome: 'stopped', item_count: items.length,
        error_code: 'LOCAL_REVIEW_FAILED' });
      markDeferredReview(state, items, error?.code || 'BATCH_REVIEW_RECONSTRUCTION_FAILED');
      writeState(state);
      return {
        ok: false,
        error: error?.code || 'BATCH_REVIEW_RECONSTRUCTION_FAILED',
        message: error instanceof SafeError ? error.message : 'Die lokale Stapelprüfung wurde sicher gestoppt. Es wurde nichts freigegeben.',
        ...publicProgress(state), raw_content_sent_to_claude: false
      };
    }

    let outcome;
    try {
      lifecycle({ event: 'review_ui_started', outcome: 'progress', item_count: items.length });
      outcome = await runBatchReviewLocally(drafts, {
        platform: deps.platform || process.platform,
        allowDefer: true,
        reviewTextLocally: deps.reviewTextLocally || reviewTextLocally,
        ...(deps.reviewOptions || {})
      });
      lifecycle({ event: 'review_ui_finished', outcome: outcome.action === 'reviewed' ? 'ok' : 'stopped',
        item_count: items.length, error_code: outcome.action === 'reviewed' ? 'NONE' : 'LOCAL_REVIEW_CANCELLED' });
    } catch (error) {
      lifecycle({ event: 'review_ui_failed', outcome: 'stopped', item_count: items.length,
        error_code: error?.code === 'LOCAL_REVIEW_TIMEOUT' ? 'LOCAL_REVIEW_TIMEOUT' : 'LOCAL_REVIEW_FAILED' });
      markDeferredReview(state, items, 'LOCAL_REVIEW_CANCELLED');
      writeState(state);
      return { ok: false, error: 'LOCAL_REVIEW_CANCELLED', message: 'Die lokale Stapelentscheidung wurde abgebrochen. Es wurde nichts freigegeben.', ...publicProgress(state), raw_content_sent_to_claude: false };
    }
    if (outcome.action !== 'reviewed') {
      const code = outcome.action === 'deferred' ? 'LOCAL_REVIEW_DEFERRED' : 'LOCAL_REVIEW_CANCELLED';
      markDeferredReview(state, items, code);
      writeState(state);
      return { ok: false, error: code, message: 'Die lokale Stapelentscheidung wurde nicht abgeschlossen. Alle offenen Dateien bleiben lokal gesperrt.', ...publicProgress(state), raw_content_sent_to_claude: false };
    }

    const decisionsByIndex = new Map(outcome.documents.map((document) => [document.document_index, document.decisions]));
    const packages = [];
    let locallyReleased = 0;
    let failed = 0;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      item.status = 'processing';
      item.checkpoint = 'batch_review_publish_started';
      delete item.error_code;
      writeState(state);
      try {
        const entry = exactPendingEntry(state, item);
        const result = await anonymizeNext(state.profile, {
          ...deps,
          inputQueue: [entry],
          copyClaim: true,
          removeImages: state.remove_images,
          packageId: packageIdForItem(item),
          reviewText: (input) => reviewedBatchText(input, decisionsByIndex.get(index + 1)),
          beforePublish: async (details) => {
            item.checkpoint = 'package_verified';
            writeState(state, { durable: false });
            if (deps.beforePublish) await deps.beforePublish(details);
          },
          afterPublish: async () => {
            // The output rename already succeeded. Persist a content-free
            // mapping intent at the first possible post-publish point, but
            // never retract the verified package if local metadata storage is
            // temporarily unavailable.
            try {
              ensureMappingOutbox(item.name, packageIdForItem(item));
              item.mapping_outbox_persisted = true;
            } catch {
              item.mapping_outbox_persisted = false;
            }
            item.checkpoint = 'package_published';
            writeState(state, { durable: false });
          }
        });
        markMappingPending(item, result.package_id);
        writeState(state);
        try {
          ensureMappingOutbox(item.name, result.package_id);
          item.mapping_outbox_persisted = true;
        } catch {
          // Continue with independent reviewed documents, but retain this raw
          // private work copy until a durable mapping-repair intent exists.
          continue;
        }
        writeState(state);
        try { cleanupTerminalWorkCopy(state, item, deps); }
        catch { item.work_copy_cleanup_pending = true; }
        writeState(state);
        try {
          commitPendingMapping(item, result.package_id);
        } catch {
          // The batch can continue with later independent documents. This
          // package stays locally verified and is handed to Claude only after
          // the durable mapping row has been written on a later local pass.
          continue;
        }
        if (deps.localFinalize === true) {
          item.status = 'released';
          item.checkpoint = 'released_locally';
          item.analysis_acknowledged = false;
          try { cleanupTerminalWorkCopy(state, item, deps); }
          catch { item.work_copy_cleanup_pending = true; }
          locallyReleased++;
        } else {
          item.status = DELIVERY_PENDING;
          item.checkpoint = 'delivery_pending';
          delete item.error_code;
          item.work_copy_cleanup_pending = true;
        }
        writeState(state);
        if (deps.localFinalize !== true) packages.push(deliveryResult(state, item));
      } catch (error) {
        const code = error?.code || 'PROCESSING_INTERRUPTED';
        item.status = RETRYABLE_CODES.has(code) ? 'retryable' : 'stopped';
        item.checkpoint = item.status === 'retryable' ? 'retryable' : 'stopped';
        item.error_code = code;
        if (item.status === 'stopped') {
          try { appendMapping(item.name, '', MAPPING_STOPPED); item.local_mapping_exported = true; }
          catch { item.local_mapping_exported = false; }
          try { cleanupTerminalWorkCopy(state, item, deps); }
          catch { item.work_copy_cleanup_pending = true; }
        }
        failed++;
        writeState(state);
      }
    }
    return {
      // A per-document publication is atomic. If a later document fails, the
      // already verified packages remain usable and must be handed to Claude
      // with their live capabilities rather than being hidden behind an MCP
      // error response. The counters still make the partial failure explicit.
      ok: packages.length > 0 || locallyReleased > 0,
      ...(deps.localFinalize === true ? { locally_released: locallyReleased } : { packages }),
      reviewed_documents: items.length,
      failed_documents: failed,
      ...publicProgress(state),
      ...(deps.localFinalize === true ? { local_evidence_exported: writeTerminalEvidence(state) } : {}),
      raw_content_sent_to_claude: false
    };
  } finally {
    active.delete(token);
    releaseActiveLock(token);
  }
}

async function processBatchNext(token, deps = {}) {
  if (active.has(token)) throw new SafeError('Für diese Batch-Sitzung läuft bereits eine Verarbeitung.');
  acquireActiveLock(token);
  active.add(token);
  try {
    const state = readState(token);
    assertLocalExecutorAccess(state, deps.executorPid);
    if (state.invalidated === true) throw new SafeError('Der bestätigte Dateistapel wurde verändert und ist nicht mehr verwendbar.');
    // A crash may happen after the atomic output rename but before the MCP
    // response. Reconcile only a fully verified deterministic package; this
    // produces one pending delivery rather than processing the source again.
    if (reconcilePublishedItems(state) || reconcilePendingMappings(state)) writeState(state);
    // A stale processing marker is never automatically re-run.  Once this
    // caller owns the global lock it may safely become retryable, but the
    // subsequent attempt still requires resume_document_batch confirmation.
    if (markInterruptedItemsRetryable(state) > 0) writeState(state);
    // A previous publication is never revoked by a later cleanup problem, but
    // every safe subsequent batch operation retries its private byte cleanup.
    if (retryReleasedWorkCopyCleanup(state, deps).changed) writeState(state);
    const pendingDelivery = state.items.find((candidate) => candidate.status === DELIVERY_PENDING);
    if (pendingDelivery) return deliveryResult(state, pendingDelivery);
    const item = state.items.find((candidate) => candidate.status === 'pending');
    if (!item) return { ok: true, ...publicProgress(state), raw_content_sent_to_claude: false };
    let entry;
    try {
      entry = exactPendingEntry(state, item);
    } catch (error) {
      invalidateUnpublishedBatchCopies(state, deps);
      writeState(state);
      return {
        ok: false,
        error: 'batch_snapshot_changed',
        message: error instanceof SafeError ? error.message : 'Der bestätigte Dateistapel wurde verändert.',
        ...publicProgress(state),
        raw_content_sent_to_claude: false
      };
    }
    // Persist the attempt before touching the source. After a crash, startup
    // recovery converts this state to stopped rather than silently retrying it.
    item.status = 'processing';
    item.checkpoint = 'processing_started';
    item.processing_started_at_ms = Date.now();
    const phaseRecorder = createPhaseRecorder({ now: deps.performanceNow });
    writeState(state);
    try {
      // Persist only a fixed, content-free phase before every irreversible
      // processing boundary. It is intentionally not returned through MCP:
      // queue counters are enough for Claude, while local recovery retains a
      // useful trace without names, paths or document-derived state.
      // Non-durable: item.status stays 'processing' across every one of
      // these markers, and markInterruptedItemsRetryable() below recovers on
      // status alone, so losing the very latest marker to a crash still
      // yields the same safe outcome as if it were the durable one.
      const checkpoint = (phase, performancePhase) => {
        if (performancePhase) phaseRecorder.mark(performancePhase);
        item.checkpoint = phase;
        writeState(state, { durable: false });
      };
      const result = await anonymizeNext(state.profile, {
        ...deps,
        inputQueue: [entry],
        copyClaim: true,
        removeImages: state.remove_images,
        packageId: packageIdForItem(item),
        onClaimed: async () => {
          checkpoint('private_copy_claimed', 'intake_and_preparation');
          if (deps.onClaimed) await deps.onClaimed();
        },
        onExtracted: async (converted) => {
          checkpoint('extracted', 'conversion_and_visual_scan');
          if (deps.onExtracted) await deps.onExtracted(converted);
        },
        onDetected: async (details) => {
          checkpoint('text_privacy_checked', 'text_privacy_check');
          if (deps.onDetected) await deps.onDetected(details);
        },
        reviewText: (input) => reviewSingleBatchTextLocally(input, state, item, deps),
        beforePublish: async (details) => {
          incrementPrivateIoSummary(state.io_summary, 'final_gate_runs');
          checkpoint('package_verified', 'verification');
          if (deps.beforePublish) await deps.beforePublish(details);
        },
        afterPublish: async () => {
          try {
            ensureMappingOutbox(item.name, packageIdForItem(item));
            item.mapping_outbox_persisted = true;
          } catch {
            item.mapping_outbox_persisted = false;
          }
          checkpoint('package_published', 'publication');
        }
      });
      phaseRecorder.mark('publication');
      markMappingPending(item, result.package_id);
      writeState(state);
      try {
        // Persist the recovery intent before dropping the only raw private
        // work copy. If local storage is unavailable the verified package is
        // kept, but cleanup is deferred until a durable repair path exists.
        ensureMappingOutbox(item.name, result.package_id);
        item.mapping_outbox_persisted = true;
      } catch {
        return {
          ok: false,
          error: 'LOCAL_MAPPING_EXPORT_PENDING',
          message: 'Das Ergebnis wurde lokal sicher erstellt. Die lokale Zuordnungsübersicht wird automatisch nachgetragen, sobald der Export wieder verfügbar ist.',
          ...publicProgress(state),
          raw_content_sent_to_claude: false
        };
      }
      writeState(state);
      try { cleanupTerminalWorkCopy(state, item, deps); }
      catch { item.work_copy_cleanup_pending = true; }
      writeState(state);
      try {
        commitPendingMapping(item, result.package_id);
      } catch {
        return {
          ok: false,
          error: 'LOCAL_MAPPING_EXPORT_PENDING',
          message: 'Das Ergebnis wurde lokal sicher erstellt. Die lokale Zuordnungsübersicht wird automatisch nachgetragen, sobald der Export wieder verfügbar ist.',
          ...publicProgress(state),
          raw_content_sent_to_claude: false
        };
      }
      // The durable pending state is written before the raw private work copy
      // is removed. From here on, recovery only needs the local basename and
      // the verified package id; the source is never processed a second time.
      item.status = DELIVERY_PENDING;
      item.checkpoint = 'delivery_pending';
      delete item.error_code;
      item.processing_duration_ms = Math.max(0, Date.now() - Number(item.processing_started_at_ms || Date.now()));
      item.performance_phases_ms = phaseRecorder.snapshot();
      delete item.processing_started_at_ms;
      item.package_id = result.package_id;
      incrementPrivateIoSummary(state.io_summary, 'output_packages_committed');
      // `retainAudit` is deliberately best-effort after publication. Count an
      // audit receipt only when the orchestrator confirms the durable local
      // retention; a failed best-effort write must not turn into a false
      // performance fact.
      if (result.audit_receipt_retained === true) {
        incrementPrivateIoSummary(state.io_summary, 'audit_receipt_writes');
      }
      writeState(state);
      return { ...result, ...publicProgress(state), raw_content_sent_to_claude: false };
    } catch (error) {
      const code = error && error.code ? error.code : 'PROCESSING_INTERRUPTED';
      if (code === 'BATCH_SNAPSHOT_CHANGED') {
        invalidateUnpublishedBatchCopies(state, deps, item);
      }
      item.status = code === 'LOCAL_REVIEW_DEFERRED' ? DEFERRED_REVIEW : (RETRYABLE_CODES.has(code) ? 'retryable' : 'stopped');
      item.checkpoint = item.status === 'retryable' ? 'retryable' : (item.status === DEFERRED_REVIEW ? 'awaiting_local_review' : 'stopped');
      if (item.status === 'stopped') item.processing_duration_ms = Math.max(0, Date.now() - Number(item.processing_started_at_ms || Date.now()));
      item.performance_phases_ms = phaseRecorder.snapshot();
      delete item.processing_started_at_ms;
      item.error_code = code;
      // The permanent, local-only mapping is also the user's overview of a
      // partial batch. A terminal stop has no result package, but must not look
      // as if the original source simply disappeared. Mapping failure here is
      // diagnostic only: the stop itself remains durable and fail-closed.
      if (item.status === 'stopped') {
        try {
          appendMapping(item.name, '', MAPPING_STOPPED);
          item.local_mapping_exported = true;
        } catch { item.local_mapping_exported = false; }
        try { cleanupTerminalWorkCopy(state, item, deps); }
        catch { item.work_copy_cleanup_pending = true; }
      }
      writeState(state);
      const localEvidenceExported = writeTerminalEvidence(state);
      return {
        ok: false,
        error: code,
        message: error instanceof SafeError
          ? error.message
          : 'Die lokale Verarbeitung wurde sicher unterbrochen. Es wurde kein Paket freigegeben.',
        ...publicProgress(state),
        // This is only an operational truth value. It lets the skill point to
        // a local export problem without receiving a filename or mapping path.
        local_mapping_exported: item.status === 'stopped' ? item.local_mapping_exported : null,
        local_evidence_exported: localEvidenceExported,
        raw_content_sent_to_claude: false
      };
    }
  } finally {
    active.delete(token);
    releaseActiveLock(token);
  }
}

function claimLocalBatchExecutor(token, pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || !processAlive(pid)) {
    throw new SafeError('Der lokale Stapelprozessor konnte nicht sicher gestartet werden.');
  }
  acquireActiveLock(token);
  try {
    const state = readState(token);
    if (liveLocalExecutor(state)) throw new SafeError('Dieser Dokumentstapel wird bereits vollständig lokal verarbeitet.');
    delete state.local_executor_pid;
    delete state.local_executor_started_at;
    const progress = publicProgress(state);
    if (progress.complete || (
      progress.remaining === 0 && progress.delivery_pending === 0 && progress.mapping_pending === 0 &&
      progress.deferred_review === 0 && progress.retryable === 0
    )) {
      return { ok: false, error: 'batch_not_runnable', ...progress, raw_content_sent_to_claude: false };
    }
    state.local_executor_pid = pid;
    state.local_executor_started_at = new Date().toISOString();
    writeState(state);
    return { ok: true, ...publicProgress(state), raw_content_sent_to_claude: false };
  } finally {
    releaseActiveLock(token);
  }
}

function releaseLocalBatchExecutor(token, pid) {
  try { acquireActiveLock(token); } catch { return false; }
  try {
    const state = readState(token);
    if (state.local_executor_pid !== pid) return false;
    delete state.local_executor_pid;
    delete state.local_executor_started_at;
    writeState(state);
    return true;
  } catch {
    return false;
  } finally {
    releaseActiveLock(token);
  }
}

function readBatchProgress(token) {
  return { ok: true, ...publicProgress(readState(token)), raw_content_sent_to_claude: false };
}

async function runLocalBatchExecutor(token, deps = {}) {
  const executorPid = Number(deps.executorPid ?? process.pid);
  const claimed = readState(token);
  if (!liveLocalExecutor(claimed) || claimed.local_executor_pid !== executorPid) {
    throw new SafeError('Der lokale Stapelprozessor besitzt keine gültige Ausführungsberechtigung.');
  }
  let lastProgress = publicProgress(claimed);
  try {
    // Expensive but mandatory housekeeping is established exactly once for a
    // claimed local batch.  The opaque capability is process-local; passing a
    // plain object from any external caller cannot skip the checks.
    const preparedRun = prepareProcessingRun(deps);
    if (incrementPrivateIoSummary(claimed.io_summary, 'batch_maintenance_runs')) {
      writeState(claimed);
    }
    const batchDeps = { ...deps, preparedRun };
    const maximumSteps = claimed.items.length * 3 + 3;
    for (let step = 0; step < maximumSteps; step++) {
      if (lastProgress.delivery_pending > 0) {
        const state = readState(token);
        const pending = state.items.find((item) => item.status === DELIVERY_PENDING);
        if (!pending) break;
        lastProgress = finalizePublishedPackageLocally(token, pending.package_id, { ...batchDeps, executorPid });
        continue;
      }
      if (lastProgress.mapping_pending > 0) {
        const before = `${lastProgress.mapping_pending}:${lastProgress.delivery_pending}`;
        lastProgress = await processBatchNext(token, { ...batchDeps, executorPid });
        const after = `${lastProgress.mapping_pending}:${lastProgress.delivery_pending}`;
        if (before === after) break;
        continue;
      }
      if (lastProgress.remaining === 0) break;
      const before = `${lastProgress.completed}:${lastProgress.remaining}:${lastProgress.delivery_pending}`;
      const result = await processBatchNext(token, { ...batchDeps, executorPid });
      lastProgress = result;
      if (typeof result.package_id === 'string') {
        lastProgress = finalizePublishedPackageLocally(token, result.package_id, { ...batchDeps, executorPid });
        continue;
      }
      const after = `${lastProgress.completed}:${lastProgress.remaining}:${lastProgress.delivery_pending}`;
      if (before === after) break;
    }
  } finally {
    releaseLocalBatchExecutor(token, executorPid);
  }
  return { ok: true, ...publicProgress(readState(token)), raw_content_sent_to_claude: false };
}

function recoverBatches(options = {}) {
  const now = Number(options.now || Date.now());
  let recovered = 0;
  let removed = 0;
  let failures = 0;
  // Startup recovery and a normal worker can otherwise race between a
  // liveness probe and the first state read.  Take the same lock as every
  // processing and expiry-maintenance path; recovery is never important
  // enough to reinterpret a newly active privacy operation as a crash.
  const maintenanceToken = crypto.randomBytes(32).toString('hex');
  try {
    acquireActiveLock(maintenanceToken);
  } catch {
    return { recovered, removed, failures, skipped_active: true };
  }
  try {
    let entries = [];
    try { entries = fs.readdirSync(batchRoot(), { withFileTypes: true }); }
    catch { return { recovered, removed, failures: 1, skipped_active: false }; }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const token = entry.name.slice(0, -'.json'.length);
      if (!TOKEN_RE.test(token)) continue;
      try {
        // Bind the state to its own token before using any state-derived path.
        // A malformed or substituted journal must remain local and counted as
        // a failure; it must never select another batch's private work copy.
        const state = readStateForMaintenance(token);
        if (liveLocalExecutor(state)) continue;
        if (now > Date.parse(state.expires_at)) {
          safeRemoveWorkDirectory(state.token);
          fs.unlinkSync(batchPath(state.token));
          removed++;
          continue;
        }
        let changed = false;
        // Prefer a verified deterministic output package over retrying a source
        // after a process crash. Its local mapping write is idempotent.
        if (reconcilePublishedItems(state)) {
          changed = true;
          recovered++;
        }
        if (reconcilePendingMappings(state)) {
          changed = true;
          recovered++;
        }
        const interrupted = markInterruptedItemsRetryable(state);
        if (interrupted > 0) {
          changed = true;
          recovered += interrupted;
        }
        if (retryReleasedWorkCopyCleanup(state).changed) changed = true;
        if (changed) writeState(state);
      } catch { failures++; }
    }
    return { recovered, removed, failures, skipped_active: false };
  } finally {
    releaseActiveLock(maintenanceToken);
  }
}

function replayMappingOutbox() {
  let repaired = 0;
  let pending = 0;
  let orphanedRemoved = 0;
  let failures = 0;
  let entries;
  try { entries = readOutboxEntries(); }
  catch { return { repaired, pending, orphaned_removed: orphanedRemoved, failures: 1 }; }
  for (const entry of entries) {
    // A package can only be repaired once its independently verified output
    // still exists. Never manufacture a CSV association from an orphaned
    // intent record.
    const state = publishedPackageState(entry.package_id);
    if (state === 'missing') {
      // The output no longer exists (for example after its configured
      // retention or an explicit Output purge). An intent without a verified
      // result can never become a mapping row, so remove precisely this
      // local-only basename-bearing record rather than retaining PII forever.
      try {
        removeMappingOutbox(entry);
        orphanedRemoved++;
      } catch { failures++; }
      continue;
    }
    if (state !== 'verified') {
      pending++;
      continue;
    }
    try {
      appendMapping(entry.original_basename, entry.package_id);
      removeMappingOutbox(entry);
      repaired++;
    } catch {
      pending++;
    }
  }
  return { repaired, pending, orphaned_removed: orphanedRemoved, failures };
}

function cleanupExpiredBatchSnapshots(options = {}) {
  // Periodic maintenance takes the very same global lock as processing.  It
  // therefore cannot delete an expired snapshot in the small interval between
  // a worker reading its state and claiming its private source copy.  If a
  // user batch is active, maintenance simply yields; no cleanup is important
  // enough to delay or reinterpret an in-progress privacy decision.
  const token = crypto.randomBytes(32).toString('hex');
  try {
    acquireActiveLock(token);
  } catch {
    return { removed: 0, failures: 0, skipped_active: true };
  }
  let removed = 0;
  let failures = 0;
  const now = Number(options.now || Date.now());
  try {
    let entries = [];
    try { entries = fs.readdirSync(batchRoot(), { withFileTypes: true }); }
    catch { return { removed, failures: 1, skipped_active: false }; }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const tokenFromName = entry.name.slice(0, -'.json'.length);
      if (!TOKEN_RE.test(tokenFromName)) continue;
      try {
        const state = readStateForMaintenance(tokenFromName);
        if (liveLocalExecutor(state)) continue;
        if (now <= Date.parse(state.expires_at)) continue;
        safeRemoveWorkDirectory(state.token);
        fs.unlinkSync(batchPath(state.token));
        removed++;
      } catch { failures++; }
    }
    return { removed, failures, skipped_active: false };
  } finally {
    releaseActiveLock(token);
  }
}

function readStateForMaintenance(token) {
  // Unlike readState(), this does not perform cleanup itself.  The caller owns
  // the global maintenance lock and needs a parse failure to remain a counted,
  // fail-closed local condition rather than deleting an unknown entry.
  const target = batchPath(token);
  let descriptor;
  try {
    descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(descriptor);
    const named = fs.lstatSync(target);
    if (!stat.isFile() || named.isSymbolicLink() || named.dev !== stat.dev || named.ino !== stat.ino) throw new Error('unsafe');
    const state = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
    if (state?.schema !== 'datasecure-batch/1' || state.token !== token || !Number.isFinite(Date.parse(state.expires_at))) throw new Error('invalid');
    return state;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

module.exports = { beginBatch, processBatchNext, reviewDeferredBatch, resumeBatch, continueMostRecentBatch, discardIncompleteBatches, recoverableBatchStatus, localCleanupStatus, acknowledgeDeliveredPackage, acknowledgeDeliveredPackages, finalizePublishedPackageLocally, listBatchResults, completedLocalOnlyCandidates, claimLocalBatchExecutor, releaseLocalBatchExecutor, readBatchProgress, runLocalBatchExecutor, recoverBatches, replayMappingOutbox, cleanupExpiredBatchSnapshots, openBatchPackageProtection, _test: { batchRoot, workPath, activeLockPath, writeState, readState, readStateForMaintenance, publicProgress, batchUserStatus, assertStagingCapacity, preflightOoxmlContainers, acquireActiveLock, releaseActiveLock, validActiveLock, retryReleasedWorkCopyCleanup, packageIdForItem, publishedPackageState, regularPublishedPackage, reconcilePublishedItems, reconcilePendingMappings, commitPendingMapping, replayMappingOutbox, markInterruptedItemsRetryable, recoverableBatchStates, localCleanupStatus, reviewSingleBatchTextLocally, captureDeferredReviewInput, reviewedBatchText, resultCursor, parseResultCursor, liveLocalExecutor, completedLocalOnlyCandidates, writeFully, syncParentDirectory, openBatchPackageProtection } };
