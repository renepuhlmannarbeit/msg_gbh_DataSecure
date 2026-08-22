'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataRoot } = require('../runtime');
const { VERSION } = require('../version');

const DIAGNOSTIC_SCHEMA = 'data-secure-diagnostic/1';
const RETENTION_DAYS = 14;
const MAX_EVENTS = 200;
const MAX_FILE_BYTES = 512 * 1024;
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
  'NONE', 'INPUT_EMPTY', 'INPUT_TOO_LARGE', 'WORKING_CLEANUP_BLOCKED',
  'AUDIT_MIGRATION_BLOCKED', 'UNSUPPORTED_FORMAT', 'PARSE_FAILED',
  'PDF_COVERAGE_UNVERIFIED', 'FORMAT_COVERAGE_UNVERIFIED', 'PARSER_COVERAGE_UNVERIFIED',
  'PARSER_RESOURCE_LIMIT', 'PARSER_ISOLATION_FAILED',
  'PROFILE_REQUIRED', 'TEXT_TOO_LARGE', 'TOO_MANY_VISUALS',
  'IMAGE_REMOVAL_UNSAFE', 'VISUAL_REVIEW_REQUIRED', 'LOCAL_REVIEW_CANCELLED',
  'AMBIGUITY_REVIEW_REQUIRED',
  'RESIDUAL_PII', 'PUBLISH_FAILED', 'RECOVERY_FAILED', 'INTERNAL_FAILURE'
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
    error_code: ERROR_CODES.has(errorCode) ? errorCode : 'INTERNAL_FAILURE'
  };
}

function classifyDiagnosticError(error, stage = 'started') {
  const code = String(error?.code || '').toUpperCase();
  if (ERROR_CODES.has(code)) return code;
  const message = String(error?.message || '');
  if (/Keine unterstützte Datei|input_empty/i.test(message)) return 'INPUT_EMPTY';
  if (/größer als 100 MB/i.test(message)) return 'INPUT_TOO_LARGE';
  if (/Verwaiste private Arbeitskopien/i.test(message)) return 'WORKING_CLEANUP_BLOCKED';
  if (/Audit-Nachweise/i.test(message)) return 'AUDIT_MIGRATION_BLOCKED';
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

function readEvents(options = {}) {
  const io = options.fs || fs;
  const file = diagnosticFile(options);
  let fd;
  let contents;
  try {
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
    try { fd = io.openSync(file, flags); }
    catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    const opened = io.fstatSync(fd);
    const named = io.lstatSync(file);
    if (!opened.isFile() || opened.size > MAX_FILE_BYTES || named.isSymbolicLink() ||
        opened.dev !== named.dev || opened.ino !== named.ino) return [];
    contents = io.readFileSync(fd, 'utf8');
  } finally {
    if (fd !== undefined) io.closeSync(fd);
  }
  const now = options.now instanceof Date ? options.now.valueOf() : Number(options.now ?? Date.now());
  const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const events = [];
  for (const line of contents.split(/\r?\n/)) {
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
  const file = diagnosticFile(options);
  const dir = path.dirname(file);
  let temp = null;
  try {
    io.mkdirSync(dir, { recursive: true });
    const dirStat = io.lstatSync(dir);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw new Error('unsafe diagnostics directory');
    if (io.existsSync(file)) {
      const fileStat = io.lstatSync(file);
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error('unsafe diagnostics file');
    }
    const events = [...readEvents(options), sanitizeDiagnostic(record, options)].slice(-MAX_EVENTS);
    temp = path.join(dir, `.events_${crypto.randomBytes(6).toString('hex')}.tmp`);
    io.writeFileSync(temp, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, {
      encoding: 'utf8', mode: 0o600, flag: 'wx'
    });
    io.renameSync(temp, file);
    return true;
  } catch {
    writeErrors++;
    if (temp) {
      try { if (io.existsSync(temp)) io.unlinkSync(temp); } catch { /* best effort */ }
    }
    return false;
  }
}

function diagnosticStatus(limit = 20, options = {}) {
  const boundedLimit = Math.max(1, Math.min(50, Number.isSafeInteger(Number(limit)) ? Number(limit) : 20));
  let retained = [];
  try { retained = readEvents(options); } catch { inspectionErrors++; }
  const events = retained.slice(-boundedLimit).reverse();
  return {
    ok: true,
    schema: DIAGNOSTIC_SCHEMA,
    retention_days: RETENTION_DAYS,
    retained_events: retained.length,
    returned_events: events.length,
    events,
    write_errors: writeErrors,
    inspection_errors: inspectionErrors,
    raw_content_logged: false,
    filenames_logged: false,
    paths_logged: false,
    hashes_logged: false
  };
}

module.exports = {
  DIAGNOSTIC_SCHEMA,
  RETENTION_DAYS,
  MAX_EVENTS,
  sanitizeDiagnostic,
  classifyDiagnosticError,
  recordDiagnostic,
  diagnosticStatus,
  _test: { diagnosticFile, readEvents }
};
