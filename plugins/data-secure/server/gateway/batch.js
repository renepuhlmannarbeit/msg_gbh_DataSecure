'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError, dataRoot } = require('../runtime');
const { PROFILES, LIMITS, roots, listInput, validateBatchLimits, sha256File, storageStatus, ensurePrivateDirectory } = require('./common');
const { anonymizeNext } = require('./orchestrator');
const { retentionDays } = require('./retention');
const { appendMapping, STOPPED: MAPPING_STOPPED } = require('./mapping');
const { appendBatchEvidence } = require('./batch-evidence');
const { inspectZipDirectory } = require('../zip-reader');
const {
  buildReviewDraft,
  validateReviewResult,
  applyManualRedactions,
  reviewTextLocally,
  reviewBatchTextLocally: runBatchReviewLocally
} = require('../companion/text-review');

const TOKEN_RE = /^[a-f0-9]{64}$/;
const active = new Set();
const RETRYABLE_CODES = new Set(['REQUEST_CANCELLED', 'PARSER_TIMEOUT', 'PARSER_START_FAILED', 'PROCESSING_INTERRUPTED']);
const STAGING_HEADROOM_BYTES = 64 * 1024 * 1024;
const DELIVERY_PENDING = 'delivery_pending';
const DEFERRED_REVIEW = 'deferred_review';

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

function preflightOoxmlContainers(queue, readFile = fs.readFileSync) {
  // DOCX is the only released OOXML format today.  Inspecting its central
  // directory before the snapshot catches ZIP64, encrypted and expansion-bomb
  // containers before any private work copy exists.  This does not replace the
  // later full parser/CRC validation and never returns archive names or bytes.
  for (const entry of queue) {
    if (path.extname(entry.name).toLowerCase() !== '.docx') continue;
    try {
      inspectZipDirectory(readFile(entry.full), { maxEntries: 20000, maxUncompressed: 300 * 1024 * 1024 });
    } catch {
      throw new SafeError('Der Office-Container konnte vor der lokalen Stapelübernahme nicht sicher geprüft werden.');
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
  const root = batchRoot();
  const target = workPath(token);
  const comparable = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
  if (comparable(path.dirname(path.resolve(target))) !== comparable(path.resolve(root))) {
    throw new SafeError('Der lokale Arbeitsbereich konnte nicht sicher bereinigt werden.');
  }
  if (!fs.existsSync(target)) return;
  const inspect = (current) => {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new SafeError('Der lokale Arbeitsbereich konnte nicht sicher bereinigt werden.');
    if (stat.isDirectory()) for (const child of fs.readdirSync(current)) inspect(path.join(current, child));
    else if (!stat.isFile()) throw new SafeError('Der lokale Arbeitsbereich konnte nicht sicher bereinigt werden.');
  };
  inspect(target);
  fs.rmSync(target, { recursive: true, force: false, maxRetries: 0 });
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

function writeState(state) {
  const target = batchPath(state.token);
  const temporary = `${target}.tmp_${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, target);
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
  if (state.token !== token || state.schema !== 'datasecure-batch/1') {
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

function batchUserStatus(progress) {
  const completed = progress.completed;
  const total = progress.batch_total;
  // An estimate is shown only after a small local sample exists.  It is based
  // on processing time only (not on a user's reading or review time) and is
  // deliberately omitted as soon as an explicit recovery/review decision is
  // needed.  That avoids presenting an invented completion promise.
  const eta = Number.isSafeInteger(progress.estimated_remaining_seconds) && progress.estimated_remaining_seconds >= 0
    ? ` Gemessene Restzeit für die verbleibende automatische Verarbeitung: ca. ${formatRemainingTime(progress.estimated_remaining_seconds)}.`
    : '';
  if (progress.complete) {
    return {
      user_status: `Stapel abgeschlossen: ${progress.released} erfolgreich vorbereitet, ${progress.stopped} sicher gestoppt.`,
      next_action: 'open_local_overview'
    };
  }
  if (progress.batch_phase === 'awaiting_local_review') {
    return {
      user_status: `Lokale Prüfung erforderlich: ${completed} von ${total} Dateien sind abgeschlossen.`,
      next_action: 'review_local_decisions'
    };
  }
  if (progress.batch_phase === 'awaiting_explicit_resume') {
    return {
      user_status: `Stapel angehalten: ${completed} von ${total} Dateien sind abgeschlossen.`,
      next_action: 'resume_batch'
    };
  }
  if (progress.batch_phase === 'awaiting_delivery_acknowledgement') {
    return {
      user_status: `Ergebnis wird sicher bereitgestellt: ${completed} von ${total} Dateien sind abgeschlossen.`,
      next_action: 'read_and_confirm_result'
    };
  }
  if (progress.batch_phase === 'processing_local_batch') {
    return {
      user_status: `Lokale Stapelverarbeitung läuft: ${completed} von ${total} Dateien sind abgeschlossen.${eta}`,
      next_action: 'wait_for_local_batch'
    };
  }
  if (progress.batch_phase === 'processing_local_document') {
    return {
      user_status: `Lokale Verarbeitung läuft: ${completed} von ${total} Dateien sind abgeschlossen.${eta}`,
      next_action: 'wait_for_current_document'
    };
  }
  return {
    user_status: `Stapel bereit: ${completed} von ${total} Dateien sind abgeschlossen.${eta}`,
    next_action: 'process_next_document'
  };
}

function formatRemainingTime(seconds) {
  if (seconds < 60) return 'unter 1 Minute';
  return `${Math.max(1, Math.round(seconds / 60))} Minuten`;
}

function measuredRemainingSeconds(state, remaining) {
  // The journal holds only monotonic durations, never source-derived data.
  // Three samples make a median resilient to one slow document/container.
  if (!Number.isSafeInteger(remaining) || remaining <= 0) return null;
  const samples = (state.items || [])
    .map((item) => Number(item.processing_duration_ms))
    .filter((duration) => Number.isSafeInteger(duration) && duration >= 0 && duration <= 60 * 60 * 1000)
    .sort((left, right) => left - right);
  if (samples.length < 3) return null;
  const median = samples[Math.floor(samples.length / 2)];
  const seconds = Math.ceil((median * remaining) / 1000);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

function publicProgress(state) {
  const released = state.items.filter((item) => item.status === 'released').length;
  const deliveryPending = state.items.filter((item) => item.status === DELIVERY_PENDING).length;
  const processing = state.items.filter((item) => item.status === 'processing').length;
  const stopped = state.items.filter((item) => item.status === 'stopped').length;
  const retryable = state.items.filter((item) => item.status === 'retryable').length;
  const deferredReview = state.items.filter((item) => item.status === DEFERRED_REVIEW).length;
  const remaining = state.items.filter((item) => item.status === 'pending').length;
  const completed = released + stopped;
  const complete = remaining === 0 && retryable === 0 && deferredReview === 0 && deliveryPending === 0 && processing === 0;
  const processingIndex = state.items.findIndex((item) => item.status === 'processing');
  const pendingIndex = state.items.findIndex((item) => item.status === 'pending');
  const localProcessing = liveLocalExecutor(state);
  const progress = {
    batch_token: state.token,
    batch_total: state.items.length,
    attempted: released + stopped + retryable + deferredReview + deliveryPending + processing,
    completed,
    // This deliberately excludes retryable items: a user-facing 100 percent
    // must mean that no document is still awaiting an explicit decision to
    // resume. It is queue metadata only, never a content-derived estimate.
    completion_percent: Math.floor((completed * 100) / state.items.length),
    released,
    delivery_pending: deliveryPending,
    processing,
    stopped,
    retryable,
    deferred_review: deferredReview,
    remaining,
    local_processing_active: localProcessing,
    // A rest-time estimate is meaningful only for the automatic queue. A
    // deferred human decision or an explicit recovery is intentionally not
    // assigned a duration.
    estimated_remaining_seconds: retryable === 0 && deferredReview === 0
      ? measuredRemainingSeconds(state, remaining)
      : null,
    awaiting_resume: (retryable > 0 || deferredReview > 0) && remaining === 0 && deliveryPending === 0 && processing === 0,
    complete,
    // These fields deliberately communicate only queue state. In particular,
    // no source name, path or document-derived phase crosses the MCP boundary.
    batch_phase: complete ? 'complete' : (localProcessing ? 'processing_local_batch' : (processing > 0 ? 'processing_local_document' : (deliveryPending > 0 ? 'awaiting_delivery_acknowledgement' : (deferredReview > 0 && remaining === 0 ? 'awaiting_local_review' : (retryable > 0 && remaining === 0 ? 'awaiting_explicit_resume' : 'ready_for_next_document'))))),
    next_position: processingIndex >= 0 ? processingIndex + 1 : (pendingIndex >= 0 ? pendingIndex + 1 : null)
  };
  return { ...progress, ...batchUserStatus(progress) };
}

function writeTerminalEvidence(state) {
  const progress = publicProgress(state);
  // A batch with retryable work is deliberately not final: a later explicit
  // resume must produce the only terminal receipt. A stopped document is final
  // only once the remaining queue is exhausted.
  if (progress.remaining !== 0 || progress.processing !== 0 || progress.retryable !== 0 || progress.deferred_review !== 0) return undefined;
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
      error: state.items.some((item) => item.status === DEFERRED_REVIEW) ? 'batch_review_required' : 'no_retryable_documents',
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
    ['pending', 'processing', 'retryable', DEFERRED_REVIEW, DELIVERY_PENDING].includes(item.status)
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
  const queue = listInput();
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
  preflightOoxmlContainers(queue, options.readFile || fs.readFileSync);
  assertStagingCapacity(queue, options.statfs || fs.statfsSync);
  const profile = String(options.profile || 'auto').toLowerCase();
  if (!PROFILES.has(profile)) throw new SafeError('Unbekanntes Profil.');
  const token = crypto.randomBytes(32).toString('hex');
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
  if (stat.size !== item.size || sha256File(full) !== item.sha256) {
    throw new SafeError('Die versiegelte Arbeitskopie wurde verändert. Der Lauf wurde sicher gestoppt.');
  }
  return { name: item.name, full, stat };
}

function packageIdForItem(item) {
  if (!/^[a-f0-9]{32}$/i.test(String(item?.id || ''))) {
    throw new SafeError('Die lokale Batch-Identität ist ungültig.');
  }
  return `ds_${item.id}`;
}

function regularPublishedPackage(packageId) {
  if (!/^ds_[a-f0-9]{32}$/i.test(String(packageId || ''))) return false;
  const target = path.join(roots().output, packageId);
  if (path.dirname(target) !== roots().output || !fs.existsSync(target)) return false;
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
      sha256File(documentPath) === manifest.document_sha256;
  } catch { return false; }
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
    appendMapping(item.name, packageId);
    item.status = DELIVERY_PENDING;
    item.checkpoint = 'delivery_pending';
    item.package_id = packageId;
    item.work_copy_cleanup_pending = true;
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

function resultCursor(token, index) {
  const position = String(index);
  const signature = crypto.createHmac('sha256', token).update(position).digest('base64url').slice(0, 16);
  return Buffer.from(`${position}.${signature}`, 'utf8').toString('base64url');
}

function parseResultCursor(token, cursor) {
  if (cursor === undefined || cursor === null || cursor === '') return 0;
  if (typeof cursor !== 'string' || cursor.length > 96 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new SafeError('Der Ergebnis-Cursor ist ungültig.');
  }
  let decoded;
  try { decoded = Buffer.from(cursor, 'base64url').toString('utf8'); } catch { throw new SafeError('Der Ergebnis-Cursor ist ungültig.'); }
  const match = /^(0|[1-9][0-9]{0,2})\.([A-Za-z0-9_-]{16})$/.exec(decoded);
  if (!match) throw new SafeError('Der Ergebnis-Cursor ist ungültig.');
  const index = Number(match[1]);
  const expected = resultCursor(token, index);
  const left = Buffer.from(expected);
  const right = Buffer.from(cursor);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw new SafeError('Der Ergebnis-Cursor ist ungültig.');
  return index;
}

function listBatchResults(token, options = {}) {
  const limit = Number(options.limit ?? 10);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new SafeError('Ergebnislimit muss zwischen 1 und 20 liegen.');
  const state = readState(token);
  const start = parseResultCursor(token, options.cursor);
  if (start > state.items.length) throw new SafeError('Der Ergebnis-Cursor ist ungültig.');
  const results = [];
  let nextIndex = start;
  for (; nextIndex < state.items.length && results.length < limit; nextIndex++) {
    const item = state.items[nextIndex];
    if (item.status !== 'released' || item.analysis_acknowledged === true) continue;
    if (!regularPublishedPackage(item.package_id)) throw new SafeError('Ein freigegebenes Ergebnis konnte nicht sicher verifiziert werden.');
    const { issueReadCapability } = require('./package-store');
    const grant = issueReadCapability(item.package_id);
    results.push({
      package_id: item.package_id,
      read_capability: grant.read_capability,
      read_capability_expires_at: grant.read_capability_expires_at
    });
  }
  const available = state.items.filter((item) => item.status === 'released' && item.analysis_acknowledged !== true).length;
  const used = state.items.filter((item) => item.status === 'released' && item.analysis_acknowledged === true).length;
  const progress = publicProgress(state);
  return {
    ok: true,
    results,
    next_cursor: nextIndex < state.items.length ? resultCursor(token, nextIndex) : null,
    used,
    available,
    still_open: progress.remaining + progress.processing + progress.retryable + progress.deferred_review + progress.delivery_pending,
    safely_stopped: progress.stopped,
    batch_complete: progress.complete,
    raw_content_sent_to_claude: false
  };
}

function retryReleasedWorkCopyCleanup(state, deps = {}) {
  let changed = false;
  let pending = 0;
  for (const item of state.items || []) {
    if (!['released', 'stopped'].includes(item.status) || item.work_copy_cleanup_pending !== true) continue;
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
    if (reconcilePublishedItems(state)) writeState(state);
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

    const drafts = [];
    try {
      for (const item of items) drafts.push(await captureDeferredReviewInput(state, item, deps));
    } catch (error) {
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
      outcome = await runBatchReviewLocally(drafts, {
        platform: deps.platform || process.platform,
        allowDefer: true,
        reviewTextLocally: deps.reviewTextLocally || reviewTextLocally,
        ...(deps.reviewOptions || {})
      });
    } catch (error) {
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
            writeState(state);
            if (deps.beforePublish) await deps.beforePublish(details);
          }
        });
        try {
          appendMapping(item.name, result.package_id);
        } catch {
          const packageId = String(result?.package_id || '');
          const target = path.join(roots().output, packageId);
          if (/^[A-Za-z0-9_-]+$/.test(packageId) && path.dirname(target) === roots().output) {
            try { fs.rmSync(target, { recursive: true, force: false, maxRetries: 0 }); } catch { /* fail closed below */ }
          }
          const mappingError = localReviewError('LOCAL_MAPPING_EXPORT_FAILED', 'Der lokale Zuordnungsexport konnte nicht sicher aktualisiert werden.');
          throw mappingError;
        }
        item.package_id = result.package_id;
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
    if (reconcilePublishedItems(state)) writeState(state);
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
      state.invalidated = true;
      for (const pending of state.items) {
        if (pending.status !== 'pending') continue;
        pending.status = 'stopped';
        pending.checkpoint = 'stopped';
        pending.error_code = 'BATCH_SNAPSHOT_CHANGED';
        // Once the sealed source itself no longer verifies, no later workflow
        // may consume it. Record the terminal local outcome and remove only
        // this exact private copy; originals remain untouched.
        try { appendMapping(pending.name, '', MAPPING_STOPPED); pending.local_mapping_exported = true; }
        catch { pending.local_mapping_exported = false; }
        try { cleanupTerminalWorkCopy(state, pending, deps); }
        catch { pending.work_copy_cleanup_pending = true; }
      }
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
    writeState(state);
    try {
      // Persist only a fixed, content-free phase before every irreversible
      // processing boundary. It is intentionally not returned through MCP:
      // queue counters are enough for Claude, while local recovery retains a
      // useful trace without names, paths or document-derived state.
      const checkpoint = (phase) => {
        item.checkpoint = phase;
        writeState(state);
      };
      const result = await anonymizeNext(state.profile, {
        ...deps,
        inputQueue: [entry],
        copyClaim: true,
        removeImages: state.remove_images,
        packageId: packageIdForItem(item),
        onClaimed: async () => {
          checkpoint('private_copy_claimed');
          if (deps.onClaimed) await deps.onClaimed();
        },
        onExtracted: async (converted) => {
          checkpoint('extracted');
          if (deps.onExtracted) await deps.onExtracted(converted);
        },
        onDetected: async (details) => {
          checkpoint('text_privacy_checked');
          if (deps.onDetected) await deps.onDetected(details);
        },
        reviewText: (input) => reviewSingleBatchTextLocally(input, state, item, deps),
        beforePublish: async (details) => {
          checkpoint('package_verified');
          if (deps.beforePublish) await deps.beforePublish(details);
        }
      });
      try {
        appendMapping(item.name, result.package_id);
      } catch (error) {
        const packageId = String(result?.package_id || '');
        const target = path.join(roots().output, packageId);
        if (!/^[A-Za-z0-9_-]+$/.test(packageId) || path.dirname(target) !== roots().output) {
          const failure = new SafeError('Der lokale Zuordnungsexport konnte nicht sicher aktualisiert werden.');
          failure.code = 'LOCAL_MAPPING_EXPORT_FAILED';
          throw failure;
        }
        try { fs.rmSync(target, { recursive: true, force: false, maxRetries: 0 }); }
        catch {
          const failure = new SafeError('Der lokale Zuordnungsexport fehlgeschlagen; das unvollständige Paket konnte nicht sicher zurückgenommen werden.');
          failure.code = 'LOCAL_MAPPING_EXPORT_FAILED';
          throw failure;
        }
        const failure = new SafeError('Der lokale Zuordnungsexport konnte nicht sicher aktualisiert werden.');
        failure.code = 'LOCAL_MAPPING_EXPORT_FAILED';
        throw failure;
      }
      // Keep the source work copy until Claude has received a capability for
      // this exact package and explicitly acknowledges the hand-off. This
      // closes the crash window between local publication and the MCP result:
      // the next call redelivers the same package instead of reprocessing the
      // document or silently moving on.
      item.status = DELIVERY_PENDING;
      item.checkpoint = 'delivery_pending';
      item.processing_duration_ms = Math.max(0, Date.now() - Number(item.processing_started_at_ms || Date.now()));
      delete item.processing_started_at_ms;
      item.package_id = result.package_id;
      item.work_copy_cleanup_pending = true;
      writeState(state);
      return { ...result, ...publicProgress(state), raw_content_sent_to_claude: false };
    } catch (error) {
      const code = error && error.code ? error.code : 'PROCESSING_INTERRUPTED';
      item.status = code === 'LOCAL_REVIEW_DEFERRED' ? DEFERRED_REVIEW : (RETRYABLE_CODES.has(code) ? 'retryable' : 'stopped');
      item.checkpoint = item.status === 'retryable' ? 'retryable' : (item.status === DEFERRED_REVIEW ? 'awaiting_local_review' : 'stopped');
      if (item.status === 'stopped') item.processing_duration_ms = Math.max(0, Date.now() - Number(item.processing_started_at_ms || Date.now()));
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
    if (progress.complete || (progress.remaining === 0 && progress.delivery_pending === 0)) {
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
    const maximumSteps = claimed.items.length * 3 + 3;
    for (let step = 0; step < maximumSteps; step++) {
      if (lastProgress.delivery_pending > 0) {
        const state = readState(token);
        const pending = state.items.find((item) => item.status === DELIVERY_PENDING);
        if (!pending) break;
        lastProgress = finalizePublishedPackageLocally(token, pending.package_id, { ...deps, executorPid });
        continue;
      }
      if (lastProgress.remaining === 0) break;
      const before = `${lastProgress.completed}:${lastProgress.remaining}:${lastProgress.delivery_pending}`;
      const result = await processBatchNext(token, { ...deps, executorPid });
      lastProgress = result;
      if (typeof result.package_id === 'string') {
        lastProgress = finalizePublishedPackageLocally(token, result.package_id, { ...deps, executorPid });
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

module.exports = { beginBatch, processBatchNext, reviewDeferredBatch, resumeBatch, continueMostRecentBatch, discardIncompleteBatches, recoverableBatchStatus, localCleanupStatus, acknowledgeDeliveredPackage, finalizePublishedPackageLocally, listBatchResults, claimLocalBatchExecutor, releaseLocalBatchExecutor, readBatchProgress, runLocalBatchExecutor, recoverBatches, cleanupExpiredBatchSnapshots, _test: { batchRoot, workPath, activeLockPath, readState, readStateForMaintenance, publicProgress, batchUserStatus, assertStagingCapacity, preflightOoxmlContainers, acquireActiveLock, releaseActiveLock, validActiveLock, retryReleasedWorkCopyCleanup, packageIdForItem, regularPublishedPackage, reconcilePublishedItems, markInterruptedItemsRetryable, recoverableBatchStates, localCleanupStatus, reviewSingleBatchTextLocally, captureDeferredReviewInput, reviewedBatchText, resultCursor, parseResultCursor, liveLocalExecutor } };
