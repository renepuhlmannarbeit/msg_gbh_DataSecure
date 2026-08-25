'use strict';

const crypto = require('crypto');
const { SafeError } = require('../runtime');
const {
  appendEvidenceRecord,
  createPendingEvidence,
  listPendingEvidence,
  removePendingEvidence,
  evidenceRecord,
  validateEvidenceRecord,
  RECEIPT_ID_RE
} = require('./batch-evidence');

const MARKER_SCHEMA = 'datasecure-batch-terminal-evidence/1';
const MARKER_KEYS = ['record', 'receipt_id', 'schema', 'status'].sort();

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === keys.join(',');
}

function validateMarker(marker) {
  if (!exactKeys(marker, MARKER_KEYS) || marker.schema !== MARKER_SCHEMA ||
    !['pending', 'exported'].includes(marker.status) ||
    !RECEIPT_ID_RE.test(String(marker.receipt_id || '')) ||
    marker.record?.receipt_id !== marker.receipt_id) {
    throw new SafeError('Der lokale Status des Batch-Nachweises ist ungültig.');
  }
  validateEvidenceRecord(marker.record);
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

  function terminal(state) {
    return publicProgress(state).complete === true;
  }

  function reconcileTerminalEvidence(state) {
    if (!terminal(state)) return undefined;
    let marker = state.terminal_evidence;
    if (marker !== undefined) validateMarker(marker);
    if (!marker) {
      const receiptId = randomBytes(16).toString('hex');
      marker = {
        schema: MARKER_SCHEMA,
        status: 'pending',
        receipt_id: receiptId,
        record: makeRecord(state, nowIso(), receiptId)
      };
      state.terminal_evidence = marker;
      try {
        writeState(state);
      } catch {
        return false;
      }
    }
    if (marker.status === 'exported') {
      try { removePending(marker.record); } catch { /* exported remains authoritative */ }
      return true;
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

  return { terminal, reconcileTerminalEvidence, repairPendingEvidenceOutbox };
}

module.exports = { createBatchTerminalEvidence, validateMarker, MARKER_SCHEMA };
