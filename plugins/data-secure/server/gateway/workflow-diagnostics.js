'use strict';

// Content-free lifecycle evidence for the local Cowork handoff. This journal
// deliberately cannot accept free-form messages, identifiers, paths, names,
// hashes or document-derived values. It answers only where the fixed workflow
// stopped: picker, worker spawn, private IPC, checkpoint, processing or local
// completion notice.
const fs = require('fs');
const { renameWithTransientRetry } = require('./batch-journal-io');
const path = require('path');
const crypto = require('crypto');
const { dataRoot } = require('../runtime');
const { VERSION } = require('../version');
const { assertWritableCapacity } = require('./storage-capacity');

const WORKFLOW_DIAGNOSTIC_SCHEMA = 'data-secure-workflow-diagnostic/1';
const WORKFLOW_RETENTION_DAYS = 14;
const MAX_WORKFLOW_EVENTS = 300;
const MAX_WORKFLOW_FILE_BYTES = 512 * 1024;
const EVENTS = new Set([
  'picker_requested', 'picker_selection_accepted', 'picker_cancelled', 'picker_failed',
  'intake_worker_spawned', 'intake_ipc_dispatched', 'intake_ipc_failed',
  'intake_checkpoint_created', 'intake_processing_started', 'intake_terminal_state',
  'intake_worker_exited', 'completion_notice_started', 'completion_notice_finished',
  'completion_notice_dispatched', 'completion_notice_failed', 'mcp_start_response',
  'review_worker_spawned', 'review_ipc_dispatched', 'review_ipc_failed',
  'review_reconstruction_started', 'review_reconstruction_finished', 'review_reconstruction_failed',
  'review_ui_started', 'review_ui_finished', 'review_ui_failed',
  'review_terminal_state', 'review_worker_exited', 'mcp_review_response'
]);
const OUTCOMES = new Set(['progress', 'ok', 'stopped']);
const PHASES = new Set([
  'none', 'complete', 'awaiting_local_review', 'awaiting_explicit_resume',
  'awaiting_local_mapping_repair', 'awaiting_delivery_acknowledgement',
  'ready_for_next_document', 'invalid_local_state'
]);
const ERROR_CODES = new Set([
  'NONE', 'LOCAL_SELECTION_CANCELLED', 'LOCAL_SELECTION_REJECTED', 'LOCAL_PICKER_FAILED', 'LOCAL_PICKER_UNAVAILABLE',
  'LOCAL_PICKER_TIMEOUT', 'LOCAL_IPC_ACK_TIMEOUT', 'LOCAL_IPC_ACK_CANCELLED', 'LOCAL_WORKER_SPAWN_FAILED',
  'LOCAL_IPC_FAILED', 'LOCAL_WORKER_EXITED', 'LOCAL_NOTICE_FAILED', 'INTERNAL_FAILURE',
  'LOCAL_REVIEW_FAILED', 'LOCAL_REVIEW_TIMEOUT', 'LOCAL_REVIEW_CANCELLED', 'LOCAL_REVIEW_TOO_LARGE',
  'LOCAL_REVIEW_WORKER_EXITED'
]);

let workflowWriteErrors = 0;
let workflowInspectionErrors = 0;

function boundedCount(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? Math.min(number, 100) : 0;
}

function boundedDuration(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? Math.min(number, 60 * 60 * 1000) : 0;
}

function safeTimestamp(value, fallback = Date.now()) {
  const parsed = Date.parse(String(value || ''));
  return new Date(Number.isFinite(parsed) ? parsed : fallback).toISOString();
}

function sanitizeWorkflowEvent(record = {}, options = {}) {
  const now = options.now instanceof Date ? options.now.valueOf() : Number(options.now ?? Date.now());
  const event = String(record.event || '');
  const outcome = String(record.outcome || 'progress');
  const phase = String(record.phase || 'none');
  const errorCode = String(record.error_code || 'NONE').toUpperCase();
  const exitCode = Number(record.exit_code);
  return {
    schema: WORKFLOW_DIAGNOSTIC_SCHEMA,
    timestamp: safeTimestamp(record.timestamp, now),
    gateway_version: VERSION,
    event: EVENTS.has(event) ? event : 'mcp_start_response',
    outcome: OUTCOMES.has(outcome) ? outcome : 'stopped',
    phase: PHASES.has(phase) ? phase : 'none',
    item_count: boundedCount(record.item_count),
    released_count: boundedCount(record.released_count),
    stopped_count: boundedCount(record.stopped_count),
    duration_ms: boundedDuration(record.duration_ms),
    exit_code: Number.isSafeInteger(exitCode) && exitCode >= 0 && exitCode <= 255 ? exitCode : 0,
    error_code: ERROR_CODES.has(errorCode) ? errorCode : 'INTERNAL_FAILURE'
  };
}

function workflowDiagnosticFile(options = {}) {
  return path.join(options.dataRoot || dataRoot(), 'diagnostics', 'workflow-events.jsonl');
}

function readWorkflowEvents(options = {}) {
  const io = options.fs || fs;
  const file = workflowDiagnosticFile(options);
  let fd;
  let contents;
  try {
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
    try { fd = io.openSync(file, flags); }
    catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
    const opened = io.fstatSync(fd);
    const named = io.lstatSync(file);
    if (!opened.isFile() || opened.size > MAX_WORKFLOW_FILE_BYTES || named.isSymbolicLink() ||
        opened.dev !== named.dev || opened.ino !== named.ino) return [];
    contents = io.readFileSync(fd, 'utf8');
  } finally {
    if (fd !== undefined) io.closeSync(fd);
  }
  const now = options.now instanceof Date ? options.now.valueOf() : Number(options.now ?? Date.now());
  const cutoff = now - WORKFLOW_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const events = [];
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line);
      const parsed = Date.parse(String(raw.timestamp || ''));
      if (raw.schema !== WORKFLOW_DIAGNOSTIC_SCHEMA || !Number.isFinite(parsed) ||
          parsed < cutoff || parsed > now + 300000) continue;
      events.push(sanitizeWorkflowEvent(raw, { now }));
    } catch { /* malformed rows are never reflected */ }
  }
  return events.slice(-MAX_WORKFLOW_EVENTS);
}

function recordWorkflowEvent(record, options = {}) {
  const io = options.fs || fs;
  const file = workflowDiagnosticFile(options);
  const directory = path.dirname(file);
  let temporary;
  try {
    io.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const dirStat = io.lstatSync(directory);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw new Error('unsafe workflow diagnostics directory');
    if (io.existsSync(file)) {
      const fileStat = io.lstatSync(file);
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error('unsafe workflow diagnostics file');
    }
    const events = [...readWorkflowEvents(options), sanitizeWorkflowEvent(record, options)].slice(-MAX_WORKFLOW_EVENTS);
    const serialized = `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
    temporary = path.join(directory, `.workflow_${crypto.randomBytes(6).toString('hex')}.tmp`);
    (options.assertWritableCapacity || assertWritableCapacity)({ directory, bytes: Buffer.byteLength(serialized, 'utf8') });
    io.writeFileSync(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    renameWithTransientRetry(temporary, file, io);
    return true;
  } catch {
    workflowWriteErrors++;
    try { if (temporary && io.existsSync(temporary)) io.unlinkSync(temporary); } catch {}
    return false;
  }
}

function workflowDiagnosticStatus(limit = 20, options = {}) {
  const bounded = Math.max(1, Math.min(50, Number.isSafeInteger(Number(limit)) ? Number(limit) : 20));
  let retained = [];
  try { retained = readWorkflowEvents(options); } catch { workflowInspectionErrors++; }
  return {
    schema: WORKFLOW_DIAGNOSTIC_SCHEMA,
    retention_days: WORKFLOW_RETENTION_DAYS,
    retained_events: retained.length,
    returned_events: Math.min(bounded, retained.length),
    events: retained.slice(-bounded).reverse(),
    write_errors: workflowWriteErrors,
    inspection_errors: workflowInspectionErrors,
    raw_content_logged: false,
    filenames_logged: false,
    paths_logged: false,
    hashes_logged: false,
    tokens_logged: false
  };
}

module.exports = {
  WORKFLOW_DIAGNOSTIC_SCHEMA,
  WORKFLOW_RETENTION_DAYS,
  MAX_WORKFLOW_EVENTS,
  sanitizeWorkflowEvent,
  recordWorkflowEvent,
  workflowDiagnosticStatus,
  _test: { workflowDiagnosticFile, readWorkflowEvents }
};
