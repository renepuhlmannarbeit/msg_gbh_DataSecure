'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { VERSION, roots } = require('./common');
const { PRIVACY_RULESET_VERSION, CREDENTIAL_CONTEXT_POLICY_VERSION } = require('../privacy/policy');

const SCHEMA = 'datasecure-batch-evidence/1';
const FILE_NAME = 'DataSecure-Batch-Nachweis.json';
const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,95}$/;
const PROFILES = new Set(['auto', 'customer', 'applicant', 'personnel_profile', 'contract', 'general']);
const RECORD_KEYS = [
  'schema', 'recorded_at', 'batch_started_at', 'batch_finished_at', 'profile', 'image_handling',
  'counts', 'outcome', 'gateway_version', 'privacy_ruleset', 'credential_context_policy',
  'batch_snapshot_schema', 'raw_content_sent_to_claude', 'mapping_is_local_only', 'error_codes'
].sort();
const COUNT_KEYS = ['total', 'released', 'stopped', 'retryable', 'pending'].sort();

function evidencePath() { return path.join(roots().exports, FILE_NAME); }

function count(state, status) {
  return state.items.filter((item) => item.status === status).length;
}

function evidenceRecord(state, recordedAt = new Date().toISOString()) {
  const codes = [...new Set(state.items
    .map((item) => String(item.error_code || ''))
    .filter((code) => SAFE_CODE.test(code)))].sort();
  const released = count(state, 'released');
  const stopped = count(state, 'stopped');
  const retryable = count(state, 'retryable');
  const pending = count(state, 'pending') + count(state, 'processing');
  const record = {
    schema: SCHEMA,
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

function readEvidence(target) {
  if (!fs.existsSync(target)) return { schema: SCHEMA, records: [] };
  let value;
  try { value = JSON.parse(fs.readFileSync(target, 'utf8')); }
  catch { throw new SafeError('Der lokale Batch-Nachweis hat ein ungültiges Format.'); }
  if (!exactKeys(value, ['records', 'schema']) || value.schema !== SCHEMA || !Array.isArray(value.records) || value.records.length > 10000) {
    throw new SafeError('Der lokale Batch-Nachweis hat ein ungültiges Format.');
  }
  for (const record of value.records) validateEvidenceRecord(record);
  return value;
}

function appendBatchEvidence(state, recordedAt) {
  const target = evidencePath();
  const evidence = readEvidence(target);
  evidence.records.push(evidenceRecord(state, recordedAt));
  const temporary = `${target}.tmp_${crypto.randomBytes(6).toString('hex')}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, target);
  } catch {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* retain the previous atomic file */ }
    throw new SafeError('Der lokale Batch-Nachweis konnte nicht sicher aktualisiert werden.');
  }
}

module.exports = { appendBatchEvidence, evidenceRecord, evidencePath, validateEvidenceRecord, SCHEMA, FILE_NAME };
