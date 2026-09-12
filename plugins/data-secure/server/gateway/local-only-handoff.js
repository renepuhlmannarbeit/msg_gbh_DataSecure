'use strict';

// Normal Cowork handoff: all identifiers, read capabilities and cursors stay
// in this process.  This module intentionally stores no document text.
const { SafeError } = require('../runtime');
const { pickCompletedBatch, cancelledError } = require('../companion/completed-batch-picker');
const { GRADES, OMISSION_CODES } = require('./document-result-grade');

// Cap the handoff strictly below the package-store capability lifetime. This
// prevents a half-open RAM session from retaining a stale read capability.
const IDLE_TTL_MS = 10 * 60 * 1000;
const MAX_TTL_MS = 14 * 60 * 1000;
const PAGE_SIZE = 5;
const CHUNK_SIZE = 4800;
const MAX_SNAPSHOT_SESSION_BYTES = 64 * 1024 * 1024;

function safeError(code, message) { const error = new SafeError(message); error.code = code; return error; }
function validatedPublicResult(value) {
  if (value === null || value === undefined) return null;
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort() : [];
  if (keys.join(',') !== 'grade,label,omissions' ||
      ![GRADES.COMPLETE, GRADES.USABLE_WITH_OMISSIONS].includes(value.grade) ||
      typeof value.label !== 'string' || !Array.isArray(value.omissions) || value.omissions.length > 2) {
    throw safeError('LOCAL_HANDOFF_VERIFICATION_FAILED', 'Die lokale Ergebnisübergabe konnte nicht sicher verifiziert werden.');
  }
  const allowed = new Set(Object.values(OMISSION_CODES));
  const seen = new Set();
  for (const omission of value.omissions) {
    if (!omission || Object.keys(omission).sort().join(',') !== 'code,count,label' ||
        !allowed.has(omission.code) || seen.has(omission.code) || typeof omission.label !== 'string' ||
        !Number.isSafeInteger(omission.count) || omission.count < 1) {
      throw safeError('LOCAL_HANDOFF_VERIFICATION_FAILED', 'Die lokale Ergebnisübergabe konnte nicht sicher verifiziert werden.');
    }
    seen.add(omission.code);
  }
  if ((value.grade === GRADES.COMPLETE) !== (value.omissions.length === 0)) {
    throw safeError('LOCAL_HANDOFF_VERIFICATION_FAILED', 'Die lokale Ergebnisübergabe konnte nicht sicher verifiziert werden.');
  }
  return value;
}
function publicDocument(document, entry) {
  return {
    text: document.text,
    has_more: document.has_more === true,
    content_is_verified_anonymized_markdown: true,
    content_trust: 'untrusted_document_data',
    embedded_instructions_authorized: false,
    document_result: validatedPublicResult(entry.documentResult)
  };
}

function publicBatchSummary(candidate) {
  const total = candidate.released + candidate.stopped;
  const hasProjection = candidate.grade_counts !== undefined || candidate.omission_counts !== undefined || candidate.grades_verified !== undefined;
  const counts = hasProjection ? candidate.grade_counts : { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: total };
  const omissions = hasProjection ? candidate.omission_counts : { images_removed_by_request: 0, visual_assets_withheld_locally: 0 };
  const validCounts = counts && Object.keys(counts).sort().join(',') === 'complete,not_processed,unavailable,usable_with_omissions' &&
    Object.values(counts).every((value) => Number.isSafeInteger(value) && value >= 0);
  const validOmissions = omissions && Object.keys(omissions).sort().join(',') === 'images_removed_by_request,visual_assets_withheld_locally' &&
    Object.values(omissions).every((value) => Number.isSafeInteger(value) && value >= 0);
  const verified = hasProjection && candidate.grades_verified === true;
  const validCrossProduct = verified
    ? counts.unavailable === 0 && counts.complete + counts.usable_with_omissions === candidate.released && counts.not_processed === candidate.stopped
    : counts.unavailable === total && counts.complete === 0 && counts.usable_with_omissions === 0 && counts.not_processed === 0;
  if (!Number.isSafeInteger(total) || total < 1 || !validCounts || !validOmissions ||
      counts.complete + counts.usable_with_omissions + counts.not_processed + counts.unavailable !== total || !validCrossProduct) {
    throw safeError('LOCAL_HANDOFF_VERIFICATION_FAILED', 'Die lokale Ergebnisübergabe konnte nicht sicher verifiziert werden.');
  }
  return {
    grade_counts: { ...counts },
    omission_counts: { ...omissions },
    grades_verified: verified,
    message: `Zur Übergabe verfügbar: ${candidate.released} anonymisierte Ergebnisse. Nicht übergeben: ${candidate.stopped} sicher nicht verarbeitete ${candidate.stopped === 1 ? 'Datei' : 'Dateien'}.`
  };
}

function createLocalOnlyHandoff(deps) {
  const candidatesForChat = deps.completedLocalOnlyCandidates;
  const listBatchResults = deps.listBatchResults;
  const readOutputs = deps.readOutputs;
  const openSnapshot = deps.openVerifiedMarkdownSnapshot;
  const openSnapshotAsync = deps.openVerifiedMarkdownSnapshotAsync;
  const acknowledgeDeliveredPackages = deps.acknowledgeDeliveredPackages;
  const choose = deps.pickCompletedBatch || pickCompletedBatch;
  const now = deps.now || (() => Date.now());
  let session = null;
  let selection = null;
  let pageInFlight = false;

  function dispose(entry) { try { entry?.snapshot?.dispose?.(); } catch {} }
  function clear() {
    for (const entry of session?.entries || []) dispose(entry);
    for (const entry of session?.acknowledged || []) dispose(entry);
    session = null;
  }
  function expired() { return session && (now() - session.lastUsedAt > IDLE_TTL_MS || now() > session.expiresAt); }
  async function start(options = {}) {
    if (options.signal?.aborted) throw cancelledError();
    // Hold ownership until the owned picker has settled, including cancellation.
    // A second request cannot open another dialog or replace a pending choice.
    if (selection) return { ok: false, error: 'local_handoff_active', message: 'Die lokale Stapelauswahl ist bereits geöffnet.', raw_content_sent_to_claude: false };
    if (session && !expired()) {
      // A terminal page was already returned with more:false. A new explicit
      // start is also its acknowledgement boundary; no extra next() or user
      // confirmation is needed. Incomplete pages remain protected.
      if (!session.loaded || session.entries.length || session.nextCursor !== null) {
        return { ok: false, error: 'local_handoff_active', message: 'Eine lokale Ergebnisübergabe ist bereits aktiv. Bitte diese fortsetzen oder beenden.', raw_content_sent_to_claude: false };
      }
      try { acknowledgePreviousPage(); } finally { clear(); }
    }
    if (session) clear();
    const candidates = candidatesForChat();
    if (candidates.length === 0) return { ok: false, error: 'no_completed_local_batch', message: 'Es liegen keine vollständig abgeschlossenen lokalen Ergebnisse für die Claude-Auswertung vor.', raw_content_sent_to_claude: false };
    let selected;
    if (candidates.length === 1) selected = candidates[0];
    else {
      const controller = new AbortController();
      const abort = () => controller.abort();
      selection = controller;
      options.signal?.addEventListener('abort', abort, { once: true });
      try {
        const ordinal = await choose(candidates.map((candidate, index) => ({ ordinal: index + 1, released: candidate.released, stopped: candidate.stopped,
          ...(candidate.completedAt ? { completedAt: candidate.completedAt } : {}) })), { signal: controller.signal });
        if (controller.signal.aborted) throw cancelledError();
        selected = candidates[ordinal - 1];
        if (!Number.isSafeInteger(ordinal) || !selected) throw cancelledError();
      } finally {
        options.signal?.removeEventListener('abort', abort);
        selection = null;
      }
    }
    if (options.signal?.aborted) throw cancelledError();
    const batchSummary = publicBatchSummary(selected);
    session = {
      token: selected.token,
      expectedReleased: selected.released,
      expectedAvailable: selected.released,
      expectedStopped: selected.stopped,
      entries: [], nextCursor: null, loaded: false, acknowledged: [], snapshotBytes: 0,
      createdAt: now(), lastUsedAt: now(), expiresAt: now() + MAX_TTL_MS,
      initial: true, batchSummary
    };
    try {
      return await nextAsync({ signal: options.signal });
    } catch (error) {
      clear();
      throw error;
    }
  }
  function verifyListing(listed) {
    if (!listed || typeof listed !== 'object' || Array.isArray(listed) || !Array.isArray(listed.results) ||
        listed.results.length > PAGE_SIZE || listed.results.some((entry) =>
          !entry || typeof entry !== 'object' || Array.isArray(entry) ||
          typeof entry.package_id !== 'string' || typeof entry.read_capability !== 'string') ||
        !(listed.next_cursor === null || (typeof listed.next_cursor === 'string' && listed.next_cursor.length <= 256))) {
      throw safeError('LOCAL_HANDOFF_VERIFICATION_FAILED', 'Die lokale Ergebnisübergabe konnte nicht sicher verifiziert werden.');
    }
    const countKeys = ['available', 'safely_stopped', 'still_open', 'batch_complete'];
    const exposedCountKeys = countKeys.filter((key) => Object.prototype.hasOwnProperty.call(listed, key));
    // Production listBatchResults exposes the complete terminal projection.
    // Some narrow unit-test adapters intentionally expose no projection at all;
    // a partial projection, however, is never safe to bind to the earlier summary.
    if (exposedCountKeys.length === 0) return;
    const valid = exposedCountKeys.length === countKeys.length &&
      Number.isSafeInteger(listed.available) && listed.available >= 0 &&
      Number.isSafeInteger(listed.safely_stopped) && listed.safely_stopped >= 0 &&
      Number.isSafeInteger(listed.still_open) && listed.still_open >= 0 &&
      typeof listed.batch_complete === 'boolean';
    const expectedPageSize = Math.min(PAGE_SIZE, session.expectedAvailable);
    const validPageBoundary = listed.results.length === expectedPageSize &&
      (listed.next_cursor !== null) === (session.expectedAvailable > PAGE_SIZE);
    if (!valid || !validPageBoundary || listed.available !== session.expectedAvailable ||
        listed.safely_stopped !== session.expectedStopped || listed.still_open !== 0 || listed.batch_complete !== true) {
      throw safeError('LOCAL_HANDOFF_CHANGED', 'Die lokalen Ergebnisse haben sich seit der Auswahl geändert. Bitte die Auswertung erneut starten.');
    }
  }
  function loadEntries() {
    if (session.entries.length || (session.loaded && session.nextCursor === null)) return;
    const listed = listBatchResults(session.token, { cursor: session.nextCursor, limit: PAGE_SIZE });
    verifyListing(listed);
    session.entries = listed.results.map((entry) => ({
      packageId: entry.package_id,
      capability: entry.read_capability,
      offset: 0,
      snapshot: null,
      documentResult: entry.document_result
    }));
    session.nextCursor = listed.next_cursor;
    session.loaded = true;
  }
  function acknowledgePreviousPage() {
    if (!session.acknowledged.length) return;
    const page = [...session.acknowledged];
    acknowledgeDeliveredPackages(session.token, page.map((entry) => entry.packageId));
    session.expectedAvailable -= page.length;
    if (!Number.isSafeInteger(session.expectedAvailable) || session.expectedAvailable < 0) {
      throw safeError('LOCAL_HANDOFF_VERIFICATION_FAILED', 'Die lokale Ergebnisübergabe konnte nicht sicher verifiziert werden.');
    }
    for (const entry of page) {
      session.snapshotBytes = Math.max(0, session.snapshotBytes - (entry.snapshot?.bytes || 0));
      dispose(entry);
    }
    session.acknowledged.splice(0, page.length);
  }
  function validateReadResult(read, entries) {
    if (!read || !Array.isArray(read.documents) || read.documents.length !== entries.length) {
      throw safeError('LOCAL_HANDOFF_VERIFICATION_FAILED', 'Die lokale Ergebnisübergabe konnte nicht sicher verifiziert werden.');
    }
    for (let index = 0; index < entries.length; index++) {
      const document = read.documents[index];
      if (!document || document.package_id !== entries[index].packageId || typeof document.text !== 'string' ||
          typeof document.has_more !== 'boolean' || !Number.isSafeInteger(document.next_offset) || document.next_offset < entries[index].offset ||
          (document.has_more === true && document.next_offset <= entries[index].offset)) {
        throw safeError('LOCAL_HANDOFF_VERIFICATION_FAILED', 'Die lokale Ergebnisübergabe konnte nicht sicher verifiziert werden.');
      }
    }
  }
  function prepareSnapshotEntries(entries) {
    if (!openSnapshot) return { ready: entries, deferred: [] };
    const ready = [];
    const deferred = [];
    for (const entry of entries) {
      if (!entry.snapshot) {
        const remainingSnapshotBytes = MAX_SNAPSHOT_SESSION_BYTES - session.snapshotBytes;
        if (remainingSnapshotBytes >= 1024) {
          const snapshot = openSnapshot(entry.packageId, entry.capability, remainingSnapshotBytes);
          if (snapshot) { entry.snapshot = snapshot; session.snapshotBytes += snapshot.bytes; }
        }
      }
      (entry.snapshot ? ready : deferred).push(entry);
    }
    // A production result is capped below the session budget, so at least one
    // entry must be snapshottable in an otherwise empty session. Preserve the
    // verified legacy path as a bounded fallback for adapters or transient
    // stat failures, but never repeatedly scan every deferred large document.
    if (ready.length === 0 && deferred.length) ready.push(deferred.shift());
    return { ready, deferred };
  }
  async function prepareSnapshotEntriesAsync(entries) {
    if (!openSnapshotAsync) return prepareSnapshotEntries(entries);
    const ready = [];
    const deferred = [];
    for (const entry of entries) {
      if (!entry.snapshot) {
        const remainingSnapshotBytes = MAX_SNAPSHOT_SESSION_BYTES - session.snapshotBytes;
        if (remainingSnapshotBytes >= 1024) {
          const snapshot = await openSnapshotAsync(entry.packageId, entry.capability, remainingSnapshotBytes);
          if (snapshot) { entry.snapshot = snapshot; session.snapshotBytes += snapshot.bytes; }
        }
      }
      (entry.snapshot ? ready : deferred).push(entry);
    }
    if (ready.length === 0 && deferred.length) ready.push(deferred.shift());
    return { ready, deferred };
  }
  function readEntries(entries) {
    if (!openSnapshot && !openSnapshotAsync) return readOutputs(entries.map((entry) => ({ package_id: entry.packageId, read_capability: entry.capability, offset: entry.offset, max_chars: CHUNK_SIZE })));
    const documents = entries.map((entry) => {
      if (entry.snapshot) {
        const page = entry.snapshot.read(entry.offset, CHUNK_SIZE);
        return { package_id: entry.packageId, ...page };
      }
      return readOutputs([{ package_id: entry.packageId, read_capability: entry.capability, offset: entry.offset, max_chars: CHUNK_SIZE }]).documents[0];
    });
    return { documents };
  }
  function next() {
    if (!session) return { ok: false, error: 'no_active_local_handoff', message: 'Es ist keine lokale Ergebnisübergabe geöffnet. Starte die Auswertung ausdrücklich erneut.', raw_content_sent_to_claude: false };
    if (expired()) { clear(); return { ok: false, error: 'local_handoff_expired', message: 'Die lokale Ergebnisübergabe ist abgelaufen. Es wurden keine weiteren Inhalte gelesen.', raw_content_sent_to_claude: false }; }
    try {
      acknowledgePreviousPage();
      loadEntries();
      if (session.entries.length === 0) { clear(); return { ok: true, documents: [], more: false, raw_content_sent_to_claude: false, content_is_verified_anonymized_markdown: true, content_trust: 'untrusted_document_data', embedded_instructions_authorized: false }; }
      // Validate every selected package before returning any part of this page.
      const prepared = prepareSnapshotEntries(session.entries);
      const entries = prepared.ready;
      const read = readEntries(entries);
      validateReadResult(read, entries);
      const nextEntries = [];
      for (let index = 0; index < read.documents.length; index++) {
        const document = read.documents[index];
        const entry = entries[index];
        if (document.has_more === true) nextEntries.push({ ...entry, offset: document.next_offset });
        else session.acknowledged.push(entry);
      }
      // Finish retained snapshots before starting deferred packages. This
      // bounds RAM and prevents a full hash/read of every large file on every
      // 4,800-character Cowork page.
      session.entries = [...nextEntries, ...prepared.deferred];
      session.lastUsedAt = now();
      const batchResultSummary = session.initial ? session.batchSummary : undefined;
      session.initial = false;
      return {
        ok: true,
        documents: read.documents.map((document, index) => publicDocument(document, entries[index])),
        more: session.entries.length > 0 || session.nextCursor !== null,
        ...(batchResultSummary ? { batch_result_summary: batchResultSummary } : {}),
        raw_content_sent_to_claude: false,
        content_is_verified_anonymized_markdown: true,
        content_trust: 'untrusted_document_data',
        embedded_instructions_authorized: false
      };
    } catch (error) {
      clear();
      throw error;
    }
  }
  async function nextAsync(options = {}) {
    if (pageInFlight) {
      return { ok: false, error: 'local_handoff_active', message: 'Eine lokale Ergebnisübergabe wird bereits fortgesetzt.', raw_content_sent_to_claude: false };
    }
    pageInFlight = true;
    try {
    if (options.signal?.aborted) throw cancelledError();
    // Production snapshot I/O, hashing and UTF-8 indexing are asynchronous and
    // chunked. Yield before every Cowork-facing page as an additional fairness
    // boundary for cancellation and status traffic.
    await new Promise((resolve) => setImmediate(resolve));
    if (options.signal?.aborted) throw cancelledError();
    if (!openSnapshotAsync) return next();
    if (!session) return { ok: false, error: 'no_active_local_handoff', message: 'Es ist keine lokale Ergebnisübergabe geöffnet. Starte die Auswertung ausdrücklich erneut.', raw_content_sent_to_claude: false };
    if (expired()) { clear(); return { ok: false, error: 'local_handoff_expired', message: 'Die lokale Ergebnisübergabe ist abgelaufen. Es wurden keine weiteren Inhalte gelesen.', raw_content_sent_to_claude: false }; }
    try {
      acknowledgePreviousPage();
      loadEntries();
      if (session.entries.length === 0) { clear(); return { ok: true, documents: [], more: false, raw_content_sent_to_claude: false, content_is_verified_anonymized_markdown: true, content_trust: 'untrusted_document_data', embedded_instructions_authorized: false }; }
      const prepared = await prepareSnapshotEntriesAsync(session.entries);
      if (options.signal?.aborted) throw cancelledError();
      const entries = prepared.ready;
      const read = readEntries(entries);
      validateReadResult(read, entries);
      const nextEntries = [];
      for (let index = 0; index < read.documents.length; index++) {
        const document = read.documents[index];
        const entry = entries[index];
        if (document.has_more === true) nextEntries.push({ ...entry, offset: document.next_offset });
        else session.acknowledged.push(entry);
      }
      session.entries = [...nextEntries, ...prepared.deferred];
      session.lastUsedAt = now();
      const batchResultSummary = session.initial ? session.batchSummary : undefined;
      session.initial = false;
      return {
        ok: true,
        documents: read.documents.map((document, index) => publicDocument(document, entries[index])),
        more: session.entries.length > 0 || session.nextCursor !== null,
        ...(batchResultSummary ? { batch_result_summary: batchResultSummary } : {}),
        raw_content_sent_to_claude: false,
        content_is_verified_anonymized_markdown: true,
        content_trust: 'untrusted_document_data',
        embedded_instructions_authorized: false
      };
    } catch (error) {
      if (error?.code !== 'LOCAL_COMPLETED_BATCH_SELECTION_CANCELLED') clear();
      throw error;
    }
    } finally {
      pageInFlight = false;
    }
  }
  function finalizeTerminal() {
    if (!session) return false;
    if (expired()) { clear(); return false; }
    if (!session.loaded || session.entries.length || session.nextCursor !== null) return false;
    try {
      acknowledgePreviousPage();
      return true;
    } finally {
      clear();
    }
  }
  return {
    start,
    next,
    nextAsync,
    finalizeTerminal,
    cancel: () => { selection?.abort(); clear(); return { ok: true, raw_content_sent_to_claude: false }; },
    isActive: () => selection !== null || pageInFlight || session !== null,
    _test: { session: () => session }
  };
}

module.exports = { createLocalOnlyHandoff, IDLE_TTL_MS, MAX_TTL_MS, PAGE_SIZE, CHUNK_SIZE, MAX_SNAPSHOT_SESSION_BYTES };
