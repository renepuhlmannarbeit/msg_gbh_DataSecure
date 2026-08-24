'use strict';

// Normal Cowork handoff: all identifiers, read capabilities and cursors stay
// in this process.  This module intentionally stores no document text.
const { SafeError } = require('../runtime');
const { pickCompletedBatch } = require('../companion/completed-batch-picker');

// Cap the handoff strictly below the package-store capability lifetime. This
// prevents a half-open RAM session from retaining a stale read capability.
const IDLE_TTL_MS = 10 * 60 * 1000;
const MAX_TTL_MS = 14 * 60 * 1000;
const PAGE_SIZE = 5;
const CHUNK_SIZE = 4800;
const MAX_SNAPSHOT_SESSION_BYTES = 16 * 1024 * 1024;

function safeError(code, message) { const error = new SafeError(message); error.code = code; return error; }
function publicDocument(document) {
  return { text: document.text, has_more: document.has_more === true, content_is_verified_anonymized_markdown: true };
}

function createLocalOnlyHandoff(deps) {
  const candidatesForChat = deps.completedLocalOnlyCandidates;
  const listBatchResults = deps.listBatchResults;
  const readOutputs = deps.readOutputs;
  const openSnapshot = deps.openVerifiedMarkdownSnapshot;
  const acknowledgeDeliveredPackages = deps.acknowledgeDeliveredPackages;
  const choose = deps.pickCompletedBatch || pickCompletedBatch;
  const now = deps.now || (() => Date.now());
  let session = null;

  function dispose(entry) { try { entry?.snapshot?.dispose?.(); } catch {} }
  function clear() {
    for (const entry of session?.entries || []) dispose(entry);
    for (const entry of session?.acknowledged || []) dispose(entry);
    session = null;
  }
  function expired() { return session && (now() - session.lastUsedAt > IDLE_TTL_MS || now() > session.expiresAt); }
  function start() {
    if (session && !expired()) {
      return { ok: false, error: 'local_handoff_active', message: 'Eine lokale Ergebnisübergabe ist bereits aktiv. Bitte diese fortsetzen oder beenden.', raw_content_sent_to_claude: false };
    }
    if (session) clear();
    const candidates = candidatesForChat();
    if (candidates.length === 0) return { ok: false, error: 'no_completed_local_batch', message: 'Es liegen keine vollständig abgeschlossenen lokalen Ergebnisse für die Claude-Auswertung vor.', raw_content_sent_to_claude: false };
    let selected;
    if (candidates.length === 1) selected = candidates[0];
    else {
      const ordinal = choose(candidates.map((candidate, index) => ({ ordinal: index + 1, released: candidate.released, stopped: candidate.stopped })));
      selected = candidates[ordinal - 1];
      if (!selected) throw safeError('LOCAL_SELECTION_CANCELLED', 'Die lokale Auswahl anonymisierter Ergebnisse wurde abgebrochen.');
    }
    session = { token: selected.token, entries: [], nextCursor: null, loaded: false, acknowledged: [], snapshotBytes: 0, createdAt: now(), lastUsedAt: now(), expiresAt: now() + MAX_TTL_MS, initial: true };
    return next();
  }
  function loadEntries() {
    if (session.entries.length || (session.loaded && session.nextCursor === null)) return;
    const listed = listBatchResults(session.token, { cursor: session.nextCursor, limit: PAGE_SIZE });
    session.entries = listed.results.map((entry) => ({ packageId: entry.package_id, capability: entry.read_capability, offset: 0, snapshot: null }));
    session.nextCursor = listed.next_cursor;
    session.loaded = true;
  }
  function acknowledgePreviousPage() {
    if (!session.acknowledged.length) return;
    const page = [...session.acknowledged];
    acknowledgeDeliveredPackages(session.token, page.map((entry) => entry.packageId));
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
  function readEntries(entries) {
    if (!openSnapshot) return readOutputs(entries.map((entry) => ({ package_id: entry.packageId, read_capability: entry.capability, offset: entry.offset, max_chars: CHUNK_SIZE })));
    const documents = entries.map((entry) => {
      const remainingSnapshotBytes = MAX_SNAPSHOT_SESSION_BYTES - session.snapshotBytes;
      if (!entry.snapshot && remainingSnapshotBytes >= 1024) {
        const snapshot = openSnapshot(entry.packageId, entry.capability, remainingSnapshotBytes);
        if (snapshot) { entry.snapshot = snapshot; session.snapshotBytes += snapshot.bytes; }
      }
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
      if (session.entries.length === 0) { clear(); return { ok: true, documents: [], more: false, raw_content_sent_to_claude: false, content_is_verified_anonymized_markdown: true }; }
      // Validate every selected package before returning any part of this page.
      const entries = session.entries;
      const read = readEntries(entries);
      validateReadResult(read, entries);
      const nextEntries = [];
      for (let index = 0; index < read.documents.length; index++) {
        const document = read.documents[index];
        const entry = session.entries[index];
        if (document.has_more === true) nextEntries.push({ ...entry, offset: document.next_offset });
        else session.acknowledged.push(entry);
      }
      session.entries = nextEntries;
      session.lastUsedAt = now();
      return { ok: true, documents: read.documents.map(publicDocument), more: session.entries.length > 0 || session.nextCursor !== null, raw_content_sent_to_claude: false, content_is_verified_anonymized_markdown: true };
    } catch (error) {
      clear();
      throw error;
    }
  }
  return { start, next, cancel: () => { clear(); return { ok: true, raw_content_sent_to_claude: false }; }, _test: { session: () => session } };
}

module.exports = { createLocalOnlyHandoff, IDLE_TTL_MS, MAX_TTL_MS, PAGE_SIZE, CHUNK_SIZE, MAX_SNAPSHOT_SESSION_BYTES };
