'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { VERSION } = require('../version');
const { dataRoot } = require('../runtime');
const { roots } = require('./common');

const AUDIT_SCHEMA = 'data-secure-audit-receipt/2';
const SIZE_CLASSES = new Set(['tiny', 'small', 'medium', 'large']);
const PROFILES = new Set(['customer', 'applicant', 'personnel_profile', 'contract', 'general']);
let auditWriteErrors = 0;

function boundedInteger(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(n));
}

function sourceSizeClass(bytes) {
  const n = boundedInteger(bytes);
  if (n <= 1024 * 1024) return 'tiny';
  if (n <= 10 * 1024 * 1024) return 'small';
  if (n <= 50 * 1024 * 1024) return 'medium';
  return 'large';
}

function safeTimestamp(value) {
  const text = String(value || '');
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? new Date().toISOString() : date.toISOString();
}

function safeVersion(value) {
  const text = String(value || VERSION);
  return /^[0-9A-Za-z.+_-]{1,40}$/.test(text) ? text : VERSION;
}

function safeExtension(value) {
  const text = String(value || '').toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(text) ? text : '.unknown';
}

function safeOperationId(value) {
  const text = String(value || '');
  return isOperationId(text) ? text : crypto.randomUUID();
}

function isOperationId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '')
  );
}

function sanitizeReceipt(record = {}) {
  const sizeClass = SIZE_CLASSES.has(record.source_size_class)
    ? record.source_size_class
    : sourceSizeClass(record.source_bytes);
  const profile = PROFILES.has(record.profile) ? record.profile : 'general';
  return {
    schema: AUDIT_SCHEMA,
    operation_id: safeOperationId(record.operation_id),
    timestamp: safeTimestamp(record.timestamp),
    gateway_version: safeVersion(record.gateway_version),
    profile,
    source_extension: safeExtension(record.source_extension),
    source_size_class: sizeClass,
    result:
      record.result === 'released'
        ? 'released'
        : record.result === 'stopped'
          ? 'stopped'
          : 'verification_passed',
    text_entity_count: boundedInteger(record.text_entity_count),
    privacy_passes: boundedInteger(record.privacy_passes),
    residual_pii_verification: record.residual_pii_verification === 'passed' ? 'passed' : 'not_released',
    reidentification_risk:
      record.reidentification_risk === 'high' ? 'high' : 'context_dependent',
    visual_assets_total: boundedInteger(record.visual_assets_total),
    visual_assets_included: boundedInteger(record.visual_assets_included),
    visual_assets_review_required: boundedInteger(record.visual_assets_review_required),
    visual_redactions: boundedInteger(record.visual_redactions),
    raw_content_logged: false,
    mapping_retained: false
  };
}

function createAuditReceipt(profile, source, meta) {
  return sanitizeReceipt({
    timestamp: new Date().toISOString(),
    gateway_version: VERSION,
    profile,
    source_extension: path.extname(source),
    source_size_class: sourceSizeClass(fs.statSync(source).size),
    result: 'released',
    text_entity_count: meta.entityCount,
    privacy_passes: meta.passes,
    residual_pii_verification: 'passed',
    reidentification_risk: meta.reidentificationRisk,
    visual_assets_total: meta.results.length,
    visual_assets_included: meta.results.filter((x) => x.status === 'included').length,
    visual_assets_review_required: meta.results.filter((x) => x.status !== 'included').length,
    visual_redactions: meta.results.reduce((n, x) => n + (x.redactions || 0), 0)
  });
}

function atomicWriteJson(file, value) {
  const dir = path.dirname(file);
  const temp = path.join(dir, `.audit_${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, file);
  } catch (error) {
    try {
      fs.unlinkSync(temp);
    } catch {
      /* the original file remains authoritative */
    }
    throw error;
  }
}

function writeBlockMarkerPath() {
  return path.join(dataRoot(), 'audit-write-blocked.json');
}

function hasWriteBlockMarker() {
  try {
    return fs.existsSync(writeBlockMarkerPath());
  } catch {
    return true;
  }
}

function markAuditWriteFailure(receipt) {
  try {
    atomicWriteJson(writeBlockMarkerPath(), {
      schema: 'data-secure-audit-write-block/1',
      operation_id: receipt.operation_id,
      timestamp: new Date().toISOString()
    });
  } catch {
    /* the in-process error counter still blocks further work */
  }
}

function reconcileReleasedPackageReceipts() {
  const markerFile = writeBlockMarkerPath();
  try {
    let marker = null;
    if (fs.existsSync(markerFile)) {
      marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
      if (marker.schema !== 'data-secure-audit-write-block/1' || !isOperationId(marker.operation_id)) {
        return false;
      }
    }
    const r = roots();
    const retained = new Set();
    for (const entry of fs.readdirSync(r.audit, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const raw = JSON.parse(fs.readFileSync(path.join(r.audit, entry.name), 'utf8'));
      const clean = sanitizeReceipt(raw);
      if (JSON.stringify(raw) === JSON.stringify(clean)) retained.add(clean.operation_id);
    }
    for (const entry of fs.readdirSync(r.output, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const dir = path.join(r.output, entry.name);
      const manifestFile = path.join(dir, 'manifest.json');
      const receiptFile = path.join(dir, 'audit.json');
      if (!fs.existsSync(manifestFile) || !fs.existsSync(receiptFile)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      const raw = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
      const clean = sanitizeReceipt(raw);
      const isCanonicalReleased =
        isOperationId(manifest.operation_id) &&
        clean.operation_id === manifest.operation_id &&
        clean.result === 'released' &&
        JSON.stringify(raw) === JSON.stringify(clean);
      if (!isCanonicalReleased) continue;
      if (!retained.has(clean.operation_id)) {
        const name = `audit_${clean.timestamp.replace(/[:.]/g, '-')}_${clean.operation_id}.json`;
        atomicWriteJson(path.join(r.audit, name), clean);
        retained.add(clean.operation_id);
      }
    }
    if (marker && !retained.has(marker.operation_id)) return false;
    if (marker) fs.unlinkSync(markerFile);
    auditWriteErrors = 0;
    return true;
  } catch {
    auditWriteErrors++;
    return false;
  }
}

function recoverAuditWriteFailure() {
  return reconcileReleasedPackageReceipts();
}

function inspectAuditDirectory({ migrate = false } = {}) {
  const result = {
    schema: AUDIT_SCHEMA,
    receipts_retained: 0,
    legacy_pending: 0,
    migration_errors: 0,
    write_errors: auditWriteErrors + (hasWriteBlockMarker() ? 1 : 0)
  };
  let dir;
  let entries;
  try {
    dir = roots().audit;
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    result.legacy_pending = 1;
    result.migration_errors = 1;
    return result;
  }
  for (const entry of entries) {
    if (!entry.name.endsWith('.json')) continue;
    if (!entry.isFile()) {
      result.legacy_pending++;
      continue;
    }
    const file = path.join(dir, entry.name);
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      result.legacy_pending++;
      result.migration_errors++;
      continue;
    }
    let canonical;
    try {
      canonical = sanitizeReceipt(raw);
    } catch {
      result.legacy_pending++;
      result.migration_errors++;
      continue;
    }
    const alreadyCanonical = JSON.stringify(raw) === JSON.stringify(canonical);
    if (alreadyCanonical) {
      result.receipts_retained++;
      continue;
    }
    if (!migrate) {
      result.legacy_pending++;
      continue;
    }
    try {
      atomicWriteJson(file, canonical);
      result.receipts_retained++;
    } catch {
      result.legacy_pending++;
      result.migration_errors++;
    }
  }
  return result;
}

function migrateLegacyAuditReceipts() {
  let result = inspectAuditDirectory({ migrate: true });
  if (!result.legacy_pending && !result.migration_errors) {
    reconcileReleasedPackageReceipts();
    result = inspectAuditDirectory({ migrate: true });
  }
  return result;
}

function auditStatus() {
  return inspectAuditDirectory({ migrate: false });
}

function writePackageAudit(receipt, packageDir) {
  const clean = sanitizeReceipt(receipt);
  atomicWriteJson(path.join(packageDir, 'audit.json'), clean);
  return clean;
}

function retainAudit(receipt) {
  const migration = migrateLegacyAuditReceipts();
  if (migration.legacy_pending || migration.migration_errors) return false;
  const clean = sanitizeReceipt(receipt);
  try {
    const auditDir = roots().audit;
    const name = `audit_${clean.timestamp.replace(/[:.]/g, '-')}_${clean.operation_id}.json`;
    atomicWriteJson(path.join(auditDir, name), clean);
    return true;
  } catch {
    auditWriteErrors++;
    markAuditWriteFailure(clean);
    return false;
  }
}

module.exports = {
  AUDIT_SCHEMA,
  sourceSizeClass,
  sanitizeReceipt,
  createAuditReceipt,
  migrateLegacyAuditReceipts,
  auditStatus,
  recoverAuditWriteFailure,
  reconcileReleasedPackageReceipts,
  writePackageAudit,
  retainAudit
};
