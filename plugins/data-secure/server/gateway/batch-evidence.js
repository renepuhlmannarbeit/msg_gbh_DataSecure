'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { VERSION, roots } = require('./common');
const { PRIVACY_RULESET_VERSION, CREDENTIAL_CONTEXT_POLICY_VERSION } = require('../privacy/policy');
const { writeFully, syncParentDirectory, renameWithTransientRetry } = require('./batch-journal-io');
const {
  GRADES,
  OMISSION_CODES,
  validateDocumentResult,
  positiveDocumentResult,
  sameDocumentResult,
  isDocumentResultReasonCode
} = require('./document-result-grade');

const SCHEMA = 'datasecure-batch-evidence/3';
const LEGACY_SCHEMA = 'datasecure-batch-evidence/2';
const OLDEST_LEGACY_SCHEMA = 'datasecure-batch-evidence/1';
const FILE_NAME = 'DataSecure-Batch-Nachweis.json';
const OUTBOX_PREFIX = 'batch_evidence_pending_';
const RECEIPT_ID_RE = /^[a-f0-9]{32}$/;
const BATCH_SNAPSHOT_SCHEMAS = new Set(['datasecure-batch/1', 'datasecure-batch/2', 'datasecure-batch/3', 'datasecure-batch/4']);
const PROFILES = new Set(['auto', 'customer', 'applicant', 'personnel_profile', 'contract', 'general']);
const LEGACY_V2_RECORD_KEYS = [
  'schema', 'receipt_id', 'recorded_at', 'batch_started_at', 'batch_finished_at', 'profile', 'image_handling',
  'counts', 'outcome', 'gateway_version', 'privacy_ruleset', 'credential_context_policy',
  'batch_snapshot_schema', 'raw_content_sent_to_claude', 'mapping_is_local_only', 'error_codes'
].sort();
const RECORD_KEYS = [...LEGACY_V2_RECORD_KEYS, 'grade_counts', 'omission_counts'].sort();
const LEGACY_RECORD_KEYS = LEGACY_V2_RECORD_KEYS.filter((key) => key !== 'receipt_id');
const COUNT_KEYS = ['total', 'released', 'stopped', 'retryable', 'pending'].sort();
const GRADE_COUNT_KEYS = ['complete', 'not_processed', 'unavailable', 'usable_with_omissions'].sort();
const OMISSION_COUNT_KEYS = ['images_removed_by_request', 'visual_assets_withheld_locally'].sort();

function evidencePath() { return path.join(roots().exports, FILE_NAME); }

function count(state, status) {
  return state.items.filter((item) => item.status === status).length;
}

function aggregateDocumentResults(state, options = {}) {
  const gradeCounts = { complete: 0, usable_with_omissions: 0, not_processed: 0, unavailable: 0 };
  const omissionCounts = { images_removed_by_request: 0, visual_assets_withheld_locally: 0 };
  const resolvePublishedPackage = options.publishedPackageRecord;
  for (const item of state.items) {
    if (state.schema === 'datasecure-batch/1') {
      gradeCounts.unavailable++;
      continue;
    }
    if (['pending', 'processing', 'retryable', 'deferred_review'].includes(item.status)) {
      if (Object.hasOwn(item, 'document_result')) {
        throw new SafeError('Der lokale Batch-Nachweis enthält einen widersprüchlichen Ergebnisgrad.');
      }
      gradeCounts.unavailable++;
      continue;
    }
    try { validateDocumentResult(item.document_result); }
    catch { throw new SafeError('Der lokale Batch-Nachweis enthält einen ungültigen Ergebnisgrad.'); }
    if (item.status === 'released') {
      try { positiveDocumentResult(item.document_result); }
      catch { throw new SafeError('Der lokale Batch-Nachweis enthält einen widersprüchlichen Ergebnisgrad.'); }
      if (typeof resolvePublishedPackage !== 'function') {
        throw new SafeError('Der lokale Batch-Nachweis konnte das veröffentlichte Paket nicht verifizieren.');
      }
      const published = resolvePublishedPackage(item.package_id);
      if (published?.state !== 'verified' || !sameDocumentResult(item.document_result, published.document_result)) {
        throw new SafeError('Der lokale Batch-Nachweis stimmt nicht mit dem veröffentlichten Paket überein.');
      }
      if (item.document_result.grade === GRADES.COMPLETE) gradeCounts.complete++;
      else gradeCounts.usable_with_omissions++;
      for (const omission of item.document_result.omissions) {
        if (omission.code === OMISSION_CODES.IMAGES_REMOVED_BY_REQUEST) {
          omissionCounts.images_removed_by_request += omission.count;
        } else if (omission.code === OMISSION_CODES.VISUAL_ASSETS_WITHHELD_LOCALLY) {
          omissionCounts.visual_assets_withheld_locally += omission.count;
        }
      }
      continue;
    }
    if (item.status !== 'stopped' || item.document_result.grade !== GRADES.NOT_PROCESSED ||
        item.document_result.reason_code !== item.error_code || !isDocumentResultReasonCode(item.error_code)) {
      throw new SafeError('Der lokale Batch-Nachweis enthält einen widersprüchlichen Ergebnisgrad.');
    }
    gradeCounts.not_processed++;
  }
  return { gradeCounts, omissionCounts };
}

function evidenceRecord(
  state,
  recordedAt = new Date().toISOString(),
  receiptId = crypto.randomBytes(16).toString('hex'),
  options = {}
) {
  const codes = [...new Set(state.items
    .map((item) => String(item.error_code || ''))
    .filter((code) => isDocumentResultReasonCode(code)))].sort();
  const released = count(state, 'released');
  const stopped = count(state, 'stopped');
  const retryable = count(state, 'retryable');
  const pending = count(state, 'pending') + count(state, 'processing');
  const { gradeCounts, omissionCounts } = aggregateDocumentResults(state, options);
  const record = {
    schema: SCHEMA,
    receipt_id: receiptId,
    recorded_at: recordedAt,
    batch_started_at: state.created_at,
    batch_finished_at: recordedAt,
    profile: state.profile,
    image_handling: state.remove_images === true ? 'remove_requested' : 'local_visual_review',
    counts: { total: state.items.length, released, stopped, retryable, pending },
    grade_counts: gradeCounts,
    omission_counts: omissionCounts,
    outcome: pending === 0 && retryable === 0 ? (stopped === 0 ? 'complete' : 'complete_with_stopped_documents') : 'incomplete',
    gateway_version: VERSION,
    privacy_ruleset: PRIVACY_RULESET_VERSION,
    credential_context_policy: CREDENTIAL_CONTEXT_POLICY_VERSION,
    batch_snapshot_schema: state.schema,
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

function validateOutcome(record) {
  if ((record.outcome === 'complete') !==
      (record.counts.pending === 0 && record.counts.retryable === 0 && record.counts.stopped === 0) ||
      (record.outcome === 'complete_with_stopped_documents') !==
      (record.counts.pending === 0 && record.counts.retryable === 0 && record.counts.stopped > 0) ||
      (record.outcome === 'incomplete') !==
      (record.counts.pending > 0 || record.counts.retryable > 0)) {
    throw new SafeError('Der lokale Batch-Nachweis hat ein ungültiges Format.');
  }
  return record;
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
    !exactKeys(record.grade_counts, GRADE_COUNT_KEYS) ||
    !Object.values(record.grade_counts).every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 100) ||
    Object.values(record.grade_counts).reduce((sum, value) => sum + value, 0) !== record.counts.total ||
    (['datasecure-batch/2', 'datasecure-batch/3'].includes(record.batch_snapshot_schema) &&
      (record.grade_counts.complete + record.grade_counts.usable_with_omissions !== record.counts.released ||
       record.grade_counts.not_processed !== record.counts.stopped ||
       record.grade_counts.unavailable !== record.counts.retryable + record.counts.pending)) ||
    (record.batch_snapshot_schema === 'datasecure-batch/1' &&
      (record.grade_counts.complete !== 0 || record.grade_counts.usable_with_omissions !== 0 ||
       record.grade_counts.not_processed !== 0 || record.grade_counts.unavailable !== record.counts.total)) ||
    !exactKeys(record.omission_counts, OMISSION_COUNT_KEYS) ||
    !Object.values(record.omission_counts).every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 2000) ||
    !['complete', 'complete_with_stopped_documents', 'incomplete'].includes(record.outcome) ||
    !safeVersion(record.gateway_version) || !safeVersion(record.privacy_ruleset) ||
    !safeVersion(record.credential_context_policy) || !BATCH_SNAPSHOT_SCHEMAS.has(record.batch_snapshot_schema) ||
    record.raw_content_sent_to_claude !== false || record.mapping_is_local_only !== true ||
    !Array.isArray(record.error_codes) || record.error_codes.length > 100 ||
    !record.error_codes.every((code) => isDocumentResultReasonCode(code))) {
    throw new SafeError('Der lokale Batch-Nachweis hat ein ungültiges Format.');
  }
  return validateOutcome(record);
}

function validateLegacyEvidenceRecord(record) {
  if (!exactKeys(record, LEGACY_RECORD_KEYS) || record.schema !== OLDEST_LEGACY_SCHEMA) {
    throw new SafeError('Der lokale Batch-Nachweis hat ein ungültiges Format.');
  }
  return validateLegacyV2EvidenceRecord({ ...record, schema: LEGACY_SCHEMA, receipt_id: '0'.repeat(32) });
}

function validateLegacyV2EvidenceRecord(record) {
  if (!exactKeys(record, LEGACY_V2_RECORD_KEYS) || record.schema !== LEGACY_SCHEMA ||
    !RECEIPT_ID_RE.test(String(record.receipt_id || '')) ||
    !validTimestamp(record.recorded_at) || !validTimestamp(record.batch_started_at) ||
    !validTimestamp(record.batch_finished_at) || !PROFILES.has(record.profile) ||
    !['remove_requested', 'local_visual_review'].includes(record.image_handling) ||
    !exactKeys(record.counts, COUNT_KEYS) ||
    !Object.values(record.counts).every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 100) ||
    record.counts.released + record.counts.stopped + record.counts.retryable + record.counts.pending !== record.counts.total ||
    !['complete', 'complete_with_stopped_documents', 'incomplete'].includes(record.outcome) ||
    !safeVersion(record.gateway_version) || !safeVersion(record.privacy_ruleset) ||
    !safeVersion(record.credential_context_policy) || !BATCH_SNAPSHOT_SCHEMAS.has(record.batch_snapshot_schema) ||
    record.raw_content_sent_to_claude !== false || record.mapping_is_local_only !== true ||
    !Array.isArray(record.error_codes) || record.error_codes.length > 100 ||
    !record.error_codes.every((code) => isDocumentResultReasonCode(code))) {
    throw new SafeError('Der lokale Batch-Nachweis hat ein ungültiges Format.');
  }
  return validateOutcome(record);
}

function validateAnyEvidenceRecord(record) {
  if (record?.schema === OLDEST_LEGACY_SCHEMA) return validateLegacyEvidenceRecord(record);
  if (record?.schema === LEGACY_SCHEMA) return validateLegacyV2EvidenceRecord(record);
  return validateEvidenceRecord(record);
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
  if (!exactKeys(value, ['records', 'schema']) || ![SCHEMA, LEGACY_SCHEMA, OLDEST_LEGACY_SCHEMA].includes(value.schema) ||
    !Array.isArray(value.records) || value.records.length > 10000) {
    throw new SafeError('Der lokale Batch-Nachweis hat ein ungültiges Format.');
  }
  if (value.schema === SCHEMA) {
    for (const record of value.records) validateAnyEvidenceRecord(record);
    return value;
  }
  for (const record of value.records) validateAnyEvidenceRecord(record);
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
    renameWithTransientRetry(temporary, target, io);
    syncParentDirectory(target, io, options.platform || process.platform);
  } catch (error) {
    try { if (descriptor !== undefined) io.closeSync(descriptor); } catch { /* preserve the primary failure */ }
    try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch { /* retain the previous atomic file */ }
    throw error;
  }
}

function appendEvidenceRecord(record, options = {}) {
  validateAnyEvidenceRecord(record);
  if (!RECEIPT_ID_RE.test(String(record.receipt_id || ''))) {
    throw new SafeError('Der lokale Batch-Nachweis hat eine ungültige Beleg-ID.');
  }
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
  validateAnyEvidenceRecord(record);
  const io = options.fs || fs;
  const target = pendingEvidencePath(record.receipt_id, options);
  if (io.existsSync(target)) {
    let existing;
    try { existing = readBoundJson(target, io).value; }
    catch { throw new SafeError('Der lokale ausstehende Batch-Nachweis ist beschädigt.'); }
    validateAnyEvidenceRecord(existing);
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
    validateAnyEvidenceRecord(record);
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
  validateAnyEvidenceRecord(record);
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
  validateAnyEvidenceRecord(existing);
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
  return appendEvidenceRecord(evidenceRecord(state, recordedAt, receiptId, options), options);
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
  validateAnyEvidenceRecord,
  SCHEMA,
  LEGACY_SCHEMA,
  OLDEST_LEGACY_SCHEMA,
  FILE_NAME,
  OUTBOX_PREFIX,
  RECEIPT_ID_RE
};
