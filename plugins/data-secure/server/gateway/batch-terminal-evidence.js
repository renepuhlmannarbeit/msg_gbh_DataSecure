'use strict';

const crypto = require('crypto');
const { SafeError } = require('../runtime');
const {
  appendEvidenceRecord,
  createPendingEvidence,
  listPendingEvidence,
  removePendingEvidence,
  evidenceRecord,
  validateAnyEvidenceRecord,
  SCHEMA: EVIDENCE_SCHEMA,
  LEGACY_SCHEMA: LEGACY_EVIDENCE_SCHEMA,
  RECEIPT_ID_RE
} = require('./batch-evidence');
const { projectBatchResults } = require('./batch-result-projection');

const MARKER_SCHEMA = 'datasecure-batch-terminal-evidence/2';
const LEGACY_MARKER_SCHEMA = 'datasecure-batch-terminal-evidence/1';
const MARKER_KEYS = ['record', 'receipt_id', 'schema', 'status'].sort();

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === keys.join(',');
}

function validateMarker(marker) {
  if (!exactKeys(marker, MARKER_KEYS) || ![MARKER_SCHEMA, LEGACY_MARKER_SCHEMA].includes(marker.schema) ||
    !['pending', 'exported'].includes(marker.status) ||
    !RECEIPT_ID_RE.test(String(marker.receipt_id || '')) ||
    marker.record?.receipt_id !== marker.receipt_id ||
    (marker.schema === MARKER_SCHEMA && marker.record?.schema !== EVIDENCE_SCHEMA) ||
    (marker.schema === LEGACY_MARKER_SCHEMA && marker.record?.schema !== LEGACY_EVIDENCE_SCHEMA)) {
    throw new SafeError('Der lokale Status des Batch-Nachweises ist ungültig.');
  }
  validateAnyEvidenceRecord(marker.record);
  return marker;
}

function createBatchTerminalEvidence(options = {}) {
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const nowIso = options.nowIso || (() => new Date().toISOString());
  const writeState = options.writeState;
  const publicProgress = options.publicProgress;
  const makeRecord = options.evidenceRecord || evidenceRecord;
  const appendRecord = options.appendEvidenceRecord || appendEvidenceRecord;
  const createPending = options.createPendingEvidence || createPendingEvidence;
  const listPending = options.listPendingEvidence || listPendingEvidence;
  const removePending = options.removePendingEvidence || removePendingEvidence;
  const publishedPackageRecord = options.publishedPackageRecord;
  const publishedPackageIdentityRecord = options.publishedPackageIdentityRecord;
  const capturePackageIdentity = options.capturePackageIdentity;
  const samePackageIdentity = options.samePackageIdentity;

  function releasedItems(state) {
    return (state.items || []).filter((item) => item.status === 'released');
  }

  function identityProjection(state) {
    return projectBatchResults(state, {
      verifyPositive: (item) => publishedPackageIdentityRecord(item)
    });
  }

  function captureIdentities(state) {
    const captured = new Map();
    for (const item of releasedItems(state)) {
      captured.set(item.package_id, capturePackageIdentity(item.package_id));
    }
    return captured;
  }

  function identitiesMatch(left, right) {
    if (left.size !== right.size) return false;
    for (const [packageId, identity] of left) {
      if (!samePackageIdentity(identity, right.get(packageId))) return false;
    }
    return true;
  }

  function createBoundRecord(state, recordedAt, receiptId) {
    const before = captureIdentities(state);
    const record = makeRecord(state, recordedAt, receiptId, { publishedPackageRecord });
    const after = captureIdentities(state);
    if (!identitiesMatch(before, after)) throw new Error('PACKAGE_IDENTITY_CHANGED');
    for (const item of releasedItems(state)) item.package_identity = after.get(item.package_id);
    return record;
  }

  function existingIdentitiesRemainStable(state, operation) {
    const before = captureIdentities(state);
    for (const item of releasedItems(state)) {
      if (!samePackageIdentity(before.get(item.package_id), item.package_identity)) return null;
    }
    const result = operation();
    const after = captureIdentities(state);
    return identitiesMatch(before, after) ? result : null;
  }

  function terminal(state) {
    // Terminal detection must remain O(n). Package-bound result verification
    // happens exactly once while the durable evidence record is created.
    return publicProgress(state, { skipResultProjection: true }).complete === true;
  }

  function exportedMarkerMatchesState(marker, state) {
    const record = marker.record;
    // Historical receipts never exposed document grades and remain
    // authoritative under their original append-only contract.
    if (record.schema !== EVIDENCE_SCHEMA || state.schema === 'datasecure-batch/1') return true;
    const projection = identityProjection(state);
    const released = state.items.filter((item) => item.status === 'released').length;
    const stopped = state.items.filter((item) => item.status === 'stopped').length;
    return projection.grades_verified === true &&
      record.batch_snapshot_schema === state.schema &&
      record.profile === state.profile &&
      record.image_handling === (state.remove_images === true ? 'remove_requested' : 'local_visual_review') &&
      record.counts.total === state.items.length &&
      record.counts.released === released &&
      record.counts.stopped === stopped &&
      record.counts.retryable === 0 && record.counts.pending === 0 &&
      JSON.stringify(record.grade_counts) === JSON.stringify(projection.grade_counts) &&
      JSON.stringify(record.omission_counts) === JSON.stringify(projection.omission_counts);
  }

  function reconcileTerminalEvidence(state) {
    if (!terminal(state)) return undefined;
    let marker = state.terminal_evidence;
    const markerWasPresent = marker !== undefined;
    if (marker !== undefined) validateMarker(marker);
    if (marker?.status === 'exported') {
      if (!exportedMarkerMatchesState(marker, state)) return false;
      try { removePending(marker.record); } catch { /* exported remains authoritative */ }
      return true;
    }
    if (!marker) {
      const receiptId = randomBytes(16).toString('hex');
      marker = {
        schema: MARKER_SCHEMA,
        status: 'pending',
        receipt_id: receiptId,
        record: createBoundRecord(state, nowIso(), receiptId)
      };
      state.terminal_evidence = marker;
      try {
        writeState(state);
      } catch {
        return false;
      }
    }
    if (markerWasPresent && marker.schema === MARKER_SCHEMA) {
      let expected;
      try {
        expected = existingIdentitiesRemainStable(state, () =>
          makeRecord(state, marker.record.recorded_at, marker.receipt_id, { publishedPackageRecord }));
      } catch {
        return false;
      }
      if (!expected || JSON.stringify(expected) !== JSON.stringify(marker.record)) return false;
    }
    try {
      createPending(marker.record);
      appendRecord(marker.record);
    } catch {
      return false;
    }
    marker.status = 'exported';
    try {
      writeState(state);
    } catch {
      return false;
    }
    try { removePending(marker.record); } catch { /* cleanup is independently recoverable */ }
    return true;
  }

  function writeTerminalEvidence(state) {
    // Conversion is not a privacy processing receipt. Its durable journal and
    // atomic visible run/CSV are the completion record; never forge PII grades.
    if (state.schema === 'datasecure-batch/5') {
      return state.processing_mode === 'markdown-only' && state.product_channel === 'standalone' &&
        terminal(state) && projectBatchResults(state).grades_verified === true;
    }
    // The receipt is a local transparency artifact, never an authorization
    // gate. Its coordinator persists an opaque pending intent before export and
    // deduplicates recovery without changing any released or stopped item.
    try {
      return reconcileTerminalEvidence(state);
    } catch {
      return false;
    }
  }

  function repairPendingEvidenceOutbox() {
    let repaired = 0;
    let failures = 0;
    let records;
    try { records = listPending(); }
    catch { return { repaired, failures: 1 }; }
    for (const record of records) {
      try {
        appendRecord(record);
        removePending(record);
        repaired++;
      } catch {
        failures++;
      }
    }
    return { repaired, failures };
  }

  return { terminal, reconcileTerminalEvidence, writeTerminalEvidence, repairPendingEvidenceOutbox };
}

module.exports = { createBatchTerminalEvidence, validateMarker, MARKER_SCHEMA, LEGACY_MARKER_SCHEMA };
