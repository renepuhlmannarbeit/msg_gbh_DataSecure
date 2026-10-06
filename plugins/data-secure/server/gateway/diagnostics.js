'use strict';
const { readHeldBytes } = require('../core/bound-file-io');

const fs = require('fs');
const { renameWithTransientRetry } = require('./batch-journal-io');
const path = require('path');
const crypto = require('crypto');
const { dataRoot } = require('../runtime');
const { VERSION } = require('../version');
const { roots } = require('./common');
const { assertWritableCapacity } = require('./storage-capacity');
const { workflowDiagnosticStatus } = require('./workflow-diagnostics');
const { supportTraceStatus } = require('./support-trace');
const {
  publishEvent, eventFiles: spoolEventFiles, pruneEvents, pruneExpiredLegacyFile
} = require('./diagnostic-event-spool');

const DIAGNOSTIC_SCHEMA = 'data-secure-diagnostic/1';
const RETENTION_DAYS = 14;
const MAX_EVENTS = 200;
const MAX_FILE_BYTES = 512 * 1024;
const DIAGNOSTIC_EXPORT_SCHEMA = 'data-secure-diagnostic-export/1';
const ROUTES = new Set(['input', 'companion', 'batch', 'startup', 'mcp']);
const STAGES = new Set([
  'started', 'claimed', 'converted', 'profile_selected', 'visuals_processed',
  'text_reviewed', 'verified', 'published', 'recovery'
]);
const RESULTS = new Set(['progress', 'released', 'stopped']);
const SOURCE_TYPES = new Set([
  'pdf', 'docx', 'xlsx', 'pptx', 'txt', 'md', 'csv', 'png', 'jpg', 'jpeg', 'bmp',
  'mixed', 'unknown'
]);
const PROFILES = new Set(['auto', 'customer', 'applicant', 'personnel_profile', 'contract', 'general', 'unknown']);
const ERROR_CODES = new Set([
  ...require('../standalone/conversion-worker-contract').ERROR_CODES,
  ...require('../standalone/conversion-worker-contract').LIFECYCLE_ERROR_CODES,
  'PROCESSING_MODE_INVALID', 'PROCESSING_MODE_FORBIDDEN', 'PRODUCT_CHANNEL_INVALID',
  'BATCH_PROCESSING_MODE_CHANGED', 'BATCH_MARKDOWN_STATE_INVALID',
  'NONE', 'INPUT_EMPTY', 'INPUT_TOO_LARGE', 'WORKING_CLEANUP_BLOCKED',
  'STAGING_RECOVERY_BLOCKED', 'PACKAGE_STAGING_UNSAFE', 'PACKAGE_STAGING_RECORD_UNSAFE',
  'PACKAGE_STAGING_OWNER_INVALID', 'PACKAGE_STAGING_ARGUMENT_INVALID', 'PACKAGE_STAGING_CREATE_FAILED',
  'PACKAGE_STAGING_CROSS_DEVICE', 'PACKAGE_STAGING_CAPABILITY_INVALID',
  'PACKAGE_STAGING_PUBLISH_TARGET_INVALID', 'PACKAGE_STAGING_FINAL_EXISTS',
  'PACKAGE_STAGING_PUBLISH_FAILED', 'PACKAGE_STAGING_DISCARD_FAILED',
  'AUDIT_MIGRATION_BLOCKED', 'UNSUPPORTED_FORMAT', 'PARSE_FAILED',
  'PDF_COVERAGE_UNVERIFIED', 'FORMAT_COVERAGE_UNVERIFIED', 'PARSER_COVERAGE_UNVERIFIED',
  'PARSER_RESOURCE_LIMIT', 'PARSER_ISOLATION_FAILED',
  'PASSWORD_PROTECTED_DOCUMENT_UNSUPPORTED',
  'LEGACY_ENCRYPTED_ARTIFACT_UNAVAILABLE', 'PRIVATE_ARTIFACT_LEGACY_ENCRYPTED_UNSUPPORTED',
  'SOURCE_FORMAT_UNSUPPORTED', 'SOURCE_DESCRIPTOR_INVALID', 'SOURCE_IDENTITY_CHANGED',
  'SOURCE_FORMAT_NOT_RELEASED',
  'SOURCE_READ_FAILED', 'SOURCE_TYPE_MISMATCH', 'SOURCE_ENCRYPTED_UNSUPPORTED',
  'SOURCE_POLYGLOT_UNSUPPORTED', 'SOURCE_CONTAINER_CORRUPT',
  'SOURCE_ACTIVE_CONTENT_UNSUPPORTED', 'SOURCE_TEXT_INVALID',
  'SOURCE_COMPOUND_BINARY_UNSUPPORTED',
  'PROFILE_REQUIRED', 'TEXT_TOO_LARGE', 'TOO_MANY_VISUALS',
  'IMAGE_REMOVAL_UNSAFE', 'VISUAL_REVIEW_REQUIRED', 'LOCAL_REVIEW_CANCELLED', 'LOCAL_REVIEW_TOO_LARGE',
  'LOCAL_REVIEW_DEFERRED', 'AMBIGUITY_REVIEW_REQUIRED', 'OCR_CONTACT_REVIEW_INVALID',
  'RESIDUAL_PII', 'PUBLISH_FAILED', 'RECOVERY_FAILED', 'RETRY_LIMIT_EXCEEDED', 'LOCAL_MAPPING_EXPORT_FAILED', 'INTERNAL_FAILURE',
  'LOCAL_CAPACITY_UNAVAILABLE', 'LOCAL_CAPACITY_INSUFFICIENT', 'LOCAL_CAPACITY_RACE'
]);

let writeErrors = 0;
let inspectionErrors = 0;

function boundedCount(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? Math.min(number, 10000) : 0;
}

function allow(value, set, fallback) {
  const normalized = String(value || '').toLowerCase().replace(/^\./, '');
  return set.has(normalized) ? normalized : fallback;
}

function safeTimestamp(value, fallback = Date.now()) {
  const parsed = Date.parse(String(value || ''));
  return new Date(Number.isFinite(parsed) ? parsed : fallback).toISOString();
}

function sanitizeDiagnostic(record = {}, options = {}) {
  const now = options.now instanceof Date ? options.now.valueOf() : Number(options.now ?? Date.now());
  const errorCode = String(record.error_code || 'NONE').toUpperCase();
  return {
    schema: DIAGNOSTIC_SCHEMA,
    timestamp: safeTimestamp(record.timestamp, now),
    gateway_version: VERSION,
    route: allow(record.route, ROUTES, 'input'),
    stage: allow(record.stage, STAGES, 'started'),
    result: allow(record.result, RESULTS, 'progress'),
    source_type: allow(record.source_type, SOURCE_TYPES, 'unknown'),
    profile: allow(record.profile, PROFILES, 'unknown'),
    remove_images: record.remove_images === true,
    parser_warning_count: boundedCount(record.parser_warning_count),
    visual_assets_total: boundedCount(record.visual_assets_total),
    visual_assets_included: boundedCount(record.visual_assets_included),
    visual_assets_review_required: boundedCount(record.visual_assets_review_required),
    visual_assets_removed: boundedCount(record.visual_assets_removed),
    text_entity_count: boundedCount(record.text_entity_count),
    ambiguous_organization_count: boundedCount(record.ambiguous_organization_count),
    ambiguous_person_count: boundedCount(record.ambiguous_person_count),
    error_code: ERROR_CODES.has(errorCode) ? errorCode : 'INTERNAL_FAILURE'
  };
}

function classifyDiagnosticError(error, stage = 'started') {
  const code = String(error?.code || '').toUpperCase();
  if (ERROR_CODES.has(code)) return code;
  const message = String(error?.message || '');
  if (/Keine unterstützte Datei|input_empty/i.test(message)) return 'INPUT_EMPTY';
  if (/größer als 100 MB|Einzeldateigrenze|Größenbegrenzung/i.test(message)) return 'INPUT_TOO_LARGE';
  if (/Verwaiste private Arbeitskopien/i.test(message)) return 'WORKING_CLEANUP_BLOCKED';
  if (/Audit-Nachweise/i.test(message)) return 'AUDIT_MIGRATION_BLOCKED';
  if (/Zuordnungsexport|Mapping/i.test(message)) return 'LOCAL_MAPPING_EXPORT_FAILED';
  if (/PDF-Dateien bleiben sicher gestoppt|PDF-Prüfpfad/i.test(message)) return 'PDF_COVERAGE_UNVERIFIED';
  if (/nicht unterstützt|unsupported/i.test(message)) return 'UNSUPPORTED_FORMAT';
  if (/reine Bild|Scan-Eingaben|Profil ausdrücklich/i.test(message)) return 'PROFILE_REQUIRED';
  if (/Dokumenttext ist zu groß|bearbeitete Fassung ist zu groß/i.test(message)) return 'TEXT_TOO_LARGE';
  if (/Zu viele visuelle Assets/i.test(message)) return 'TOO_MANY_VISUALS';
  if (/Bilder können nicht sicher entfernt/i.test(message)) return 'IMAGE_REMOVAL_UNSAFE';
  if (/visuell|technical review|required/i.test(message)) return 'VISUAL_REVIEW_REQUIRED';
  if (/Textprüfung|abgebrochen|cancel/i.test(message)) return 'LOCAL_REVIEW_CANCELLED';
  if (/Residual-Gate/i.test(message)) return 'RESIDUAL_PII';
  if (/zurückgelegt|Arbeitskopie konnte nicht sicher entfernt/i.test(message)) return 'RECOVERY_FAILED';
  if (/ZIP|Endverzeichnis|lesbar|parse|Dokumentformat/i.test(message)) return 'PARSE_FAILED';
  if (stage === 'published') return 'PUBLISH_FAILED';
  return 'INTERNAL_FAILURE';
}

function diagnosticFile(options = {}) {
  return path.join(options.dataRoot || dataRoot(), 'diagnostics', 'events.jsonl');
}

function diagnosticDirectory(options = {}) {
  return path.join(options.dataRoot || dataRoot(), 'diagnostics', 'events');
}

function diagnosticEventFiles(options = {}) {
  return spoolEventFiles({ ...options, directory: diagnosticDirectory(options) });
}

function readDiagnosticFile(file, options = {}) {
  const io = options.fs || fs;
  let fd;
  try {
    fd = io.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
    const opened = io.fstatSync(fd);
    const named = io.lstatSync(file);
    if (!opened.isFile() || opened.size < 1 || opened.size > MAX_FILE_BYTES || named.isSymbolicLink() ||
        opened.dev !== named.dev || opened.ino !== named.ino) return '';
    return readHeldBytes(fd, opened.size, io).toString('utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  } finally { if (fd !== undefined) io.closeSync(fd); }
}

function readEvents(options = {}) {
  const now = options.now instanceof Date ? options.now.valueOf() : Number(options.now ?? Date.now());
  const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const events = [];
  // The former rolling JSONL file remains read-only upgrade input. New writers
  // use unique immutable files and therefore cannot overwrite one another.
  const payloads = [readDiagnosticFile(diagnosticFile(options), options)];
  for (const name of diagnosticEventFiles(options).slice(-MAX_EVENTS * 2)) {
    payloads.push(readDiagnosticFile(path.join(diagnosticDirectory(options), name), options));
  }
  for (const line of payloads.join('\n').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line);
      const parsedTime = Date.parse(String(raw.timestamp || ''));
      if (raw.schema !== DIAGNOSTIC_SCHEMA || !Number.isFinite(parsedTime) || parsedTime < cutoff || parsedTime > now + 300000) continue;
      events.push(sanitizeDiagnostic(raw, { now }));
    } catch {
      // Malformed or forged entries are ignored and never reflected to Claude.
    }
  }
  return events.slice(-MAX_EVENTS);
}

function recordDiagnostic(record, options = {}) {
  const io = options.fs || fs;
  const directory = diagnosticDirectory(options);
  try {
    const event = sanitizeDiagnostic(record, options);
    const serialized = `${JSON.stringify(event)}\n`;
    publishEvent(serialized, { ...options, fs: io, directory,
      timestamp: Date.parse(event.timestamp), assertWritableCapacity: options.assertWritableCapacity || assertWritableCapacity });
    pruneEvents({ ...options, fs: io, directory, retentionDays: RETENTION_DAYS, maximum: MAX_EVENTS });
    pruneExpiredLegacyFile(diagnosticFile(options), { ...options, fs: io, retentionDays: RETENTION_DAYS });
    return true;
  } catch {
    writeErrors++;
    return false;
  }
}

function diagnosticStatus(limit = 20, options = {}) {
  const boundedLimit = Math.max(1, Math.min(50, Number.isSafeInteger(Number(limit)) ? Number(limit) : 20));
  let retained = [];
  try {
    pruneEvents({ ...options, directory: diagnosticDirectory(options), retentionDays: RETENTION_DAYS,
      maximum: MAX_EVENTS });
    pruneExpiredLegacyFile(diagnosticFile(options), { ...options, retentionDays: RETENTION_DAYS });
    retained = readEvents(options);
  } catch { inspectionErrors++; }
  const events = retained.slice(-boundedLimit).reverse();
  return {
    ok: true,
    schema: DIAGNOSTIC_SCHEMA,
    retention_days: RETENTION_DAYS,
    retained_events: retained.length,
    returned_events: events.length,
    events,
    workflow: workflowDiagnosticStatus(boundedLimit, options),
    support_trace: supportTraceStatus(boundedLimit, options),
    write_errors: writeErrors,
    inspection_errors: inspectionErrors,
    raw_content_logged: false,
    filenames_logged: false,
    paths_logged: false,
    hashes_logged: false
  };
}

function digestArtifact(role, target, io = fs) {
  let descriptor;
  try {
    descriptor = io.openSync(target, io.constants?.O_RDONLY || fs.constants.O_RDONLY);
    const stat = io.fstatSync(descriptor);
    const named = io.lstatSync(target);
    if (!stat.isFile() || named.isSymbolicLink() || stat.dev !== named.dev || stat.ino !== named.ino || stat.size > 64 * 1024 * 1024) {
      throw new Error('unsafe artifact');
    }
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < stat.size) {
      const read = io.readSync(descriptor, buffer, 0, Math.min(buffer.length, stat.size - position), position);
      if (read <= 0) throw new Error('truncated artifact');
      hash.update(buffer.subarray(0, read));
      position += read;
    }
    return { role, sha256: hash.digest('hex'), bytes: stat.size };
  } finally { if (descriptor !== undefined) io.closeSync(descriptor); }
}

function diagnosticExportPath(options = {}) {
  return options.exportPath || path.join((options.roots || roots)().exports, 'DataSecure-Diagnose.json');
}

function exportDiagnosticPackage(options = {}) {
  if (options.confirmed !== true) throw new Error('Diagnostic export requires explicit confirmation.');
  const io = options.fs || fs;
  const target = diagnosticExportPath(options);
  const root = path.dirname(target);
  const artifacts = [
    digestArtifact('mcp_bootstrap', path.join(__dirname, '..', 'index.js'), io),
    digestArtifact('mcp_server', path.join(__dirname, '..', 'mcp-server.js'), io),
    digestArtifact('native_launcher', path.join(__dirname, '..', 'native-launcher.js'), io)
  ];
  const native = path.join(__dirname, '..', 'native', 'windows-x64', 'datasecure-sandbox.exe');
  if (io.existsSync(native)) artifacts.push(digestArtifact('windows_x64_sandbox', native, io));
  const receipt = {
    schema: DIAGNOSTIC_EXPORT_SCHEMA,
    exported_at: new Date().toISOString(),
    gateway_version: VERSION,
    platform: process.platform,
    architecture: process.arch,
    artifacts,
    diagnostics: diagnosticStatus(MAX_EVENTS, options),
    raw_content_logged: false,
    filenames_logged: false,
    paths_logged: false,
    document_hashes_logged: false,
    automatic_transmission: false
  };
  // The export is a local, replaceable support snapshot. Keep the same strict
  // no-follow/atomic write properties as the journals and never return its path.
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  const temporary = `${target}.tmp_${crypto.randomBytes(6).toString('hex')}`;
  try {
    io.mkdirSync(root, { recursive: true, mode: 0o700 });
    const rootStat = io.lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('unsafe export directory');
    (options.assertWritableCapacity || assertWritableCapacity)({
      directory: root,
      bytes: Buffer.byteLength(serialized, 'utf8')
    });
    io.writeFileSync(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    renameWithTransientRetry(temporary, target, io);
  } catch {
    try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch { /* preserve the prior export */ }
    throw new Error('The local diagnostic export could not be created safely.');
  }
  return { ok: true, exported: true, schema: DIAGNOSTIC_EXPORT_SCHEMA, raw_content_sent_to_claude: false };
}

module.exports = {
  DIAGNOSTIC_SCHEMA,
  RETENTION_DAYS,
  MAX_EVENTS,
  sanitizeDiagnostic,
  classifyDiagnosticError,
  recordDiagnostic,
  diagnosticStatus,
  exportDiagnosticPackage,
  _test: { diagnosticFile, diagnosticDirectory, diagnosticEventFiles, readEvents, diagnosticExportPath, digestArtifact }
};
