'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { VERSION, roots } = require('./common');
const { PRIVACY_RULESET_VERSION, CREDENTIAL_CONTEXT_POLICY_VERSION } = require('../privacy/policy');
const { writeFully, syncParentDirectory } = require('./batch-journal-io');

const SCHEMA = 'datasecure-batch-evidence/2';
const LEGACY_SCHEMA = 'datasecure-batch-evidence/1';
const FILE_NAME = 'DataSecure-Batch-Nachweis.json';
const OUTBOX_PREFIX = 'batch_evidence_pending_';
const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,95}$/;
const RECEIPT_ID_RE = /^[a-f0-9]{32}$/;
const PROFILES = new Set(['auto', 'customer', 'applicant', 'personnel_profile', 'contract', 'general']);
const RECORD_KEYS = [
  'schema', 'receipt_id', 'recorded_at', 'batch_started_at', 'batch_finished_at', 'profile', 'image_handling',
  'counts', 'outcome', 'gateway_version', 'privacy_ruleset', 'credential_context_policy',
  'batch_snapshot_schema', 'raw_content_sent_to_claude', 'mapping_is_local_only', 'error_codes'
].sort();
const LEGACY_RECORD_KEYS = RECORD_KEYS.filter((key) => key !== 'receipt_id');
const COUNT_KEYS = ['total', 'released', 'stopped', 'retryable', 'pending'].sort();

function evidencePath() { return path.join(roots().exports, FILE_NAME); }

function count(state, status) {
  return state.items.filter((item) => item.status === status).length;
}

function evidenceRecord(state, recordedAt = new Date().toISOString(), receiptId = crypto.randomBytes(16).toString('hex')) {
  const codes = [...new Set(state.items
    .map((item) => String(item.error_code || ''))
    .filter((code) => SAFE_CODE.test(code)))].sort();
  const released = count(state, 'released');
  const stopped = count(state, 'stopped');
  const retryable = count(state, 'retryable');
  const pending = count(state, 'pending') + count(state, 'processing');
  const record = {
    schema: SCHEMA,
    receipt_id: receiptId,
    recorded_at: recordedAt,
    batch_started_at: state.created_at,
    batch_finished_at: recordedAt,
    profile: state.profile,
    image_handling: state.remove_images === true ? 'remove_requested' : 'local_visual_review',
    counts: { total: state.items.length, released, stopped, retryable, pending },
    outcome: pending === 0 && retryable === 0 ? (stopped === 0 ? 'complete' : 'complete_with_stopped_documents') : 'incomplete',
    gateway_version: VERSION,
    privacy_ruleset: PRIVACY_RULESET_VERSION,
    credential_context_policy: CREDENTIAL_CONTEXT_POLICY_VERSION,
    batch_snapshot_schema: 'datasecure-batch/1',
    raw_content_sent_to_claude: false,
    mapping_is_local_only: true,
    error_codes: codes
  };
  validateEvidenceRecord(record);
  return record;
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === keys.join(',');
}

function validTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value));
}

function safeVersion(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._/-]{1,96}$/u.test(value);
}

function validateEvidenceRecord(record) {
  if (!exactKeys(record, RECORD_KEYS) || record.schema !== SCHEMA ||
    !RECEIPT_ID_RE.test(String(record.receipt_id || '')) ||
    !validTimestamp(record.recorded_at) || !validTimestamp(record.batch_started_at) ||
    !validTimestamp(record.batch_finished_at) || !PROFILES.has(record.profile) ||
    !['remove_requested', 'local_visual_review'].includes(record.image_handling) ||
    !exactKeys(record.counts, COUNT_KEYS) ||
    !Object.values(record.counts).every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 100) ||
    record.counts.released + record.counts.stopped + record.counts.retryable + record.counts.pending !== record.counts.total ||
    !['complete', 'complete_with_stopped_documents', 'incomplete'].includes(record.outcome) ||
    !safeVersion(record.gateway_version) || !safeVersion(record.privacy_ruleset) ||
    !safeVersion(record.credential_context_policy) || record.batch_snapshot_schema !== 'datasecure-batch/1' ||
    record.raw_content_sent_to_claude !== false || record.mapping_is_local_only !== true ||
    !Array.isArray(record.error_codes) || record.error_codes.length > 100 ||
    !record.error_codes.every((code) => SAFE_CODE.test(code))) {
    throw new SafeError('Der lokale Batch-Nachweis hat ein ungültiges Format.');
  }
  if ((record.outcome === 'complete') !== (record.counts.pending === 0 && record.counts.retryable === 0 && record.counts.stopped === 0)) {
    throw new SafeError('Der lokale Batch-Nachweis hat ein ungültiges Format.');
  }
  if ((record.outcome === 'complete_with_stopped_documents') !== (record.counts.pending === 0 && record.counts.retryable === 0 && record.counts.stopped > 0)) {
    throw new SafeError('Der lokale Batch-Nachweis hat ein ungültiges Format.');
  }
  if ((record.outcome === 'incomplete') !== (record.counts.pending > 0 || record.counts.retryable > 0)) {
    throw new SafeError('Der lokale Batch-Nachweis hat ein ungültiges Format.');
  }
  return record;
}

function validateLegacyEvidenceRecord(record) {
  if (!exactKeys(record, LEGACY_RECORD_KEYS) || record.schema !== LEGACY_SCHEMA) {
    throw new SafeError('Der lokale Batch-Nachweis hat ein ungültiges Format.');
  }
  return validateEvidenceRecord({ ...record, schema: SCHEMA, receipt_id: '0'.repeat(32) });
}

function validateAnyEvidenceRecord(record) {
  return record?.schema === LEGACY_SCHEMA
    ? validateLegacyEvidenceRecord(record)
    : validateEvidenceRecord(record);
}

function readBoundJson(target, io = fs) {
  let descriptor;
  try {
    descriptor = io.openSync(target, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0));
    const opened = io.fstatSync(descriptor);
    const named = io.lstatSync(target);
    if (!opened.isFile() || !named.isFile() || named.isSymbolicLink() ||
      opened.dev !== named.dev || opened.ino !== named.ino) throw new Error('unsafe');
    return { value: JSON.parse(io.readFileSync(descriptor, 'utf8')), stat: opened };
  } finally {
    if (descriptor !== undefined) io.closeSync(descriptor);
  }
}

function readEvidence(target, options = {}) {
  const io = options.fs || fs;
  if (!io.existsSync(target)) return { schema: SCHEMA, records: [] };
  let value;
  try { value = readBoundJson(target, io).value; }
  catch { throw new SafeError('Der lokale Batch-Nachweis hat ein ungültiges Format.'); }
  if (!exactKeys(value, ['records', 'schema']) || ![SCHEMA, LEGACY_SCHEMA].includes(value.schema) ||
    !Array.isArray(value.records) || value.records.length > 10000) {
    throw new SafeError('Der lokale Batch-Nachweis hat ein ungültiges Format.');
  }
  if (value.schema === SCHEMA) {
    for (const record of value.records) validateAnyEvidenceRecord(record);
    return value;
  }
  for (const record of value.records) validateLegacyEvidenceRecord(record);
  return {
    schema: SCHEMA,
    records: value.records
  };
}

function atomicWriteJson(target, value, options = {}) {
  const io = options.fs || fs;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const temporary = `${target}.tmp_${randomBytes(6).toString('hex')}`;
  let descriptor;
  try {
    descriptor = io.openSync(temporary, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL, 0o600);
    writeFully(descriptor, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'), io);
    io.fsyncSync(descriptor);
    io.closeSync(descriptor);
    descriptor = undefined;
    io.renameSync(temporary, target);
    syncParentDirectory(target, io, options.platform || process.platform);
  } catch (error) {
    try { if (descriptor !== undefined) io.closeSync(descriptor); } catch { /* preserve the primary failure */ }
    try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch { /* retain the previous atomic file */ }
    throw error;
  }
}

function appendEvidenceRecord(record, options = {}) {
  validateEvidenceRecord(record);
  const io = options.fs || fs;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const target = options.target || evidencePath();
  const evidence = readEvidence(target, { fs: io });
  const existing = evidence.records.find((candidate) => candidate.receipt_id === record.receipt_id);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(record)) {
      throw new SafeError('Der lokale Batch-Nachweis enthält einen widersprüchlichen Beleg.');
    }
    return false;
  }
  if (evidence.records.length >= 10000) {
    throw new SafeError('Der lokale Batch-Nachweis hat seine sichere Größenbegrenzung erreicht.');
  }
  evidence.records.push(record);
  try {
    atomicWriteJson(target, evidence, { ...options, fs: io, randomBytes });
  } catch {
    throw new SafeError('Der lokale Batch-Nachweis konnte nicht sicher aktualisiert werden.');
  }
  return true;
}

function pendingEvidencePath(receiptId, options = {}) {
  if (!RECEIPT_ID_RE.test(String(receiptId || ''))) {
    throw new SafeError('Der lokale Batch-Nachweis hat eine ungültige Beleg-ID.');
  }
  return path.join((options.auditDir || roots().audit), `${OUTBOX_PREFIX}${receiptId}.json`);
}

function createPendingEvidence(record, options = {}) {
  validateEvidenceRecord(record);
  const io = options.fs || fs;
  const target = pendingEvidencePath(record.receipt_id, options);
  if (io.existsSync(target)) {
    let existing;
    try { existing = readBoundJson(target, io).value; }
    catch { throw new SafeError('Der lokale ausstehende Batch-Nachweis ist beschädigt.'); }
    validateEvidenceRecord(existing);
    if (JSON.stringify(existing) !== JSON.stringify(record)) {
      throw new SafeError('Der lokale ausstehende Batch-Nachweis ist widersprüchlich.');
    }
    return false;
  }
  try {
    atomicWriteJson(target, record, options);
  } catch {
    throw new SafeError('Der lokale ausstehende Batch-Nachweis konnte nicht sicher gespeichert werden.');
  }
  return true;
}

function listPendingEvidence(options = {}) {
  const io = options.fs || fs;
  const auditDir = options.auditDir || roots().audit;
  let entries;
  try { entries = io.readdirSync(auditDir, { withFileTypes: true }); }
  catch { throw new SafeError('Ausstehende lokale Batch-Nachweise konnten nicht gelesen werden.'); }
  const records = [];
  for (const entry of entries) {
    if (!entry.name.startsWith(OUTBOX_PREFIX) || !entry.name.endsWith('.json')) continue;
    if (!entry.isFile()) throw new SafeError('Ein ausstehender lokaler Batch-Nachweis ist unsicher.');
    const receiptId = entry.name.slice(OUTBOX_PREFIX.length, -'.json'.length);
    if (!RECEIPT_ID_RE.test(receiptId)) {
      throw new SafeError('Ein ausstehender lokaler Batch-Nachweis ist ungültig.');
    }
    const target = path.join(auditDir, entry.name);
    let record;
    try { record = readBoundJson(target, io).value; }
    catch { throw new SafeError('Ein ausstehender lokaler Batch-Nachweis ist beschädigt.'); }
    validateEvidenceRecord(record);
    if (record.receipt_id !== receiptId) {
      throw new SafeError('Ein ausstehender lokaler Batch-Nachweis ist widersprüchlich.');
    }
    records.push(record);
    if (records.length > 10000) {
      throw new SafeError('Zu viele ausstehende lokale Batch-Nachweise wurden gefunden.');
    }
  }
  return records.sort((left, right) => left.receipt_id.localeCompare(right.receipt_id));
}

function removePendingEvidence(record, options = {}) {
  validateEvidenceRecord(record);
  const io = options.fs || fs;
  const target = pendingEvidencePath(record.receipt_id, options);
  if (!io.existsSync(target)) return false;
  let existing;
  let opened;
  try {
    const bound = readBoundJson(target, io);
    existing = bound.value;
    opened = bound.stat;
  }
  catch { throw new SafeError('Der lokale ausstehende Batch-Nachweis ist beschädigt.'); }
  validateEvidenceRecord(existing);
  if (JSON.stringify(existing) !== JSON.stringify(record)) {
    throw new SafeError('Der lokale ausstehende Batch-Nachweis ist widersprüchlich.');
  }
  try {
    const named = io.lstatSync(target);
    if (!named.isFile() || named.isSymbolicLink() || named.dev !== opened.dev || named.ino !== opened.ino) {
      throw new Error('unsafe');
    }
    io.unlinkSync(target);
    syncParentDirectory(target, io, options.platform || process.platform);
  } catch {
    throw new SafeError('Der lokale ausstehende Batch-Nachweis konnte nicht bereinigt werden.');
  }
  return true;
}

function appendBatchEvidence(state, recordedAt, receiptId, options = {}) {
  return appendEvidenceRecord(evidenceRecord(state, recordedAt, receiptId), options);
}

module.exports = {
  appendBatchEvidence,
  appendEvidenceRecord,
  createPendingEvidence,
  listPendingEvidence,
  removePendingEvidence,
  evidenceRecord,
  evidencePath,
  readEvidence,
  validateEvidenceRecord,
  SCHEMA,
  LEGACY_SCHEMA,
  FILE_NAME,
  OUTBOX_PREFIX,
  RECEIPT_ID_RE
};
