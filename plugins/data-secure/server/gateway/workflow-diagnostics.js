'use strict';

// Content-free lifecycle evidence for the local Cowork handoff. Each new event
// is an immutable JSON file so detached processes cannot lose one another's
// writes. A former rolling JSONL file remains read-only upgrade input. This trace
// deliberately cannot accept free-form messages, identifiers, paths, names,
// hashes or document-derived values. It answers only where the fixed workflow
// stopped: picker, worker spawn, private IPC, checkpoint, processing or local
// completion notice.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataRoot } = require('../runtime');
const { VERSION } = require('../version');
const { recordSupportTrace, newTraceId } = require('./support-trace');
const {
  publishEvent, eventFiles, pruneEvents, pruneExpiredLegacyFile
} = require('./diagnostic-event-spool');

const WORKFLOW_DIAGNOSTIC_SCHEMA = 'data-secure-workflow-diagnostic/1';
const WORKFLOW_RETENTION_DAYS = 14;
const MAX_WORKFLOW_EVENTS = 300;
const MAX_WORKFLOW_FILE_BYTES = 512 * 1024;
const EVENTS = new Set([
  'result_folder_picker_requested', 'result_folder_picker_accepted', 'result_folder_picker_failed',
  'picker_requested', 'picker_selection_accepted', 'picker_cancelled', 'picker_failed',
  'intake_worker_spawned', 'intake_ipc_dispatched', 'intake_ipc_failed',
  'intake_checkpoint_created', 'intake_processing_started', 'intake_terminal_state',
  'intake_worker_exited', 'completion_notice_started', 'completion_notice_finished',
  'completion_notice_dispatched', 'completion_notice_failed', 'mcp_start_response',
  'review_worker_spawned', 'review_ipc_dispatched', 'review_ipc_failed',
  'review_reconstruction_started', 'review_reconstruction_finished', 'review_reconstruction_failed',
  'review_ui_started', 'review_ui_finished', 'review_ui_failed',
  'review_terminal_state', 'review_worker_exited', 'mcp_review_response',
  'automatic_review_started', 'automatic_review_finished',
  'automatic_review_claim_failed', 'automatic_review_failed',
  'automatic_review_release_failed',
  'startup_refused'
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
  'LOCAL_IPC_FAILED', 'LOCAL_QUEUE_SCHEMA_INVALID', 'LOCAL_WORKER_EXITED', 'LOCAL_NOTICE_FAILED', 'INTERNAL_FAILURE',
  'LOCAL_REVIEW_FAILED', 'LOCAL_REVIEW_TIMEOUT', 'LOCAL_REVIEW_CANCELLED', 'LOCAL_REVIEW_DEFERRED', 'LOCAL_REVIEW_TOO_LARGE',
  'LOCAL_REVIEW_WORKER_EXITED',
  'LOCAL_REVIEW_BUSY', 'LOCAL_REVIEW_RELEASE_FAILED',
  'RESULT_FOLDER_REQUIRED',
  'UNSAFE_STORAGE_LOCATION', 'STARTUP_RECOVERY_FAILED', 'STARTUP_OUTBOX_RECOVERY_FAILED',
  'STARTUP_MIGRATION_FAILED', 'STARTUP_CLEANUP_FAILED', 'RUNTIME_INTEGRITY_FAILED', 'STARTUP_FAILED'
]);

const RUN_ID_RE = /^[a-f0-9]{8}$/u;
function newRunId() {
  return crypto.randomBytes(4).toString('hex');
}

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
  // A run id is a random 8-hex nonce minted by the parent when a run starts and
  // handed to the detached worker through its environment. It is derived from
  // nothing (no token, path, hash or PID) and only lets support group the events
  // of one run (DS-071).
  const runId = String(record.run_id || (options.env || process.env).DATASECURE_RUN_ID || '');
  return {
    schema: WORKFLOW_DIAGNOSTIC_SCHEMA,
    timestamp: safeTimestamp(record.timestamp, now),
    gateway_version: VERSION,
    run_id: RUN_ID_RE.test(runId) ? runId : 'none',
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

function workflowDiagnosticDirectory(options = {}) {
  return path.join(options.dataRoot || dataRoot(), 'diagnostics', 'workflow-events');
}

function workflowEventFiles(options = {}) {
  return eventFiles({ ...options, directory: workflowDiagnosticDirectory(options) });
}

function readWorkflowFile(file, options = {}) {
  const io = options.fs || fs;
  let fd;
  try {
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
    fd = io.openSync(file, flags);
    const opened = io.fstatSync(fd);
    const named = io.lstatSync(file);
    if (!opened.isFile() || opened.size > MAX_WORKFLOW_FILE_BYTES || named.isSymbolicLink() ||
        opened.dev !== named.dev || opened.ino !== named.ino) return '';
    return io.readFileSync(fd, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  } finally {
    if (fd !== undefined) io.closeSync(fd);
  }
}

function readWorkflowEvents(options = {}) {
  const now = options.now instanceof Date ? options.now.valueOf() : Number(options.now ?? Date.now());
  const cutoff = now - WORKFLOW_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const events = [];
  // Keep reading the legacy rolling file so upgrades preserve existing support
  // evidence; all new writes use immutable files below.
  const payloads = [readWorkflowFile(workflowDiagnosticFile(options), options)];
  for (const name of workflowEventFiles(options).slice(-MAX_WORKFLOW_EVENTS * 2)) {
    payloads.push(readWorkflowFile(path.join(workflowDiagnosticDirectory(options), name), options));
  }
  for (const line of payloads.join('\n').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line);
      const parsed = Date.parse(String(raw.timestamp || ''));
      if (raw.schema !== WORKFLOW_DIAGNOSTIC_SCHEMA || !Number.isFinite(parsed) ||
          parsed < cutoff || parsed > now + 300000) continue;
      events.push(sanitizeWorkflowEvent(raw, { now }));
    } catch { /* malformed rows are never reflected */ }
  }
  return events.sort((left, right) => left.timestamp.localeCompare(right.timestamp) ||
    left.run_id.localeCompare(right.run_id) || left.event.localeCompare(right.event)).slice(-MAX_WORKFLOW_EVENTS);
}

function recordWorkflowEvent(record, options = {}) {
  const io = options.fs || fs;
  const directory = workflowDiagnosticDirectory(options);
  const sanitized = sanitizeWorkflowEvent(record, options);
  // The optional debug package mirrors the fixed lifecycle projection with
  // additional MCP/tool boundaries; the normal lifecycle trace below is itself
  // immutable and multi-process safe.
  recordSupportTrace({
    trace_id: newTraceId(), run_id: sanitized.run_id, event: 'workflow_event',
    method: 'unknown', operation: sanitized.event, outcome: sanitized.outcome,
    duration_ms: sanitized.duration_ms, error_code: sanitized.error_code
  }, options);
  try {
    const serialized = `${JSON.stringify(sanitized)}\n`;
    publishEvent(serialized, { ...options, fs: io, directory, timestamp: Date.parse(sanitized.timestamp) });
    pruneEvents({ ...options, fs: io, directory, retentionDays: WORKFLOW_RETENTION_DAYS,
      maximum: MAX_WORKFLOW_EVENTS });
    pruneExpiredLegacyFile(workflowDiagnosticFile(options), { ...options, fs: io,
      retentionDays: WORKFLOW_RETENTION_DAYS });
    return true;
  } catch (error) {
    workflowWriteErrors++;
    try { if (typeof options.onError === 'function') options.onError(error); } catch {}
    return false;
  }
}

function workflowDiagnosticStatus(limit = 20, options = {}) {
  const bounded = Math.max(1, Math.min(50, Number.isSafeInteger(Number(limit)) ? Number(limit) : 20));
  let retained = [];
  try {
    pruneEvents({ ...options, directory: workflowDiagnosticDirectory(options),
      retentionDays: WORKFLOW_RETENTION_DAYS, maximum: MAX_WORKFLOW_EVENTS });
    pruneExpiredLegacyFile(workflowDiagnosticFile(options), { ...options,
      retentionDays: WORKFLOW_RETENTION_DAYS });
    retained = readWorkflowEvents(options);
  } catch { workflowInspectionErrors++; }
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
  newRunId,
  RUN_ID_RE,
  _test: { workflowDiagnosticFile, workflowDiagnosticDirectory, workflowEventFiles, readWorkflowEvents }
};
