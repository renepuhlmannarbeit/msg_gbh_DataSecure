'use strict';

// Engineering/support trace for one deliberately activated debug build. Each
// event is an immutable JSON file so the MCP parent and detached workers cannot
// overwrite one another. The schema accepts only fixed protocol/tool labels,
// timing and random correlation ids; raw JSON-RPC, arguments, results, paths,
// names, tokens, hashes and document-derived values are structurally absent.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { dataRoot } = require('../runtime');
const { VERSION } = require('../version');
const { publishEvent, eventFiles: spoolEventFiles, pruneEvents } = require('./diagnostic-event-spool');

const SUPPORT_TRACE_SCHEMA = 'data-secure-support-trace/1';
const RETENTION_DAYS = 14;
const MAX_EVENTS = 2000;
const MAX_EVENT_BYTES = 4096;
const ID_RE = /^[a-f0-9]{8}$/u;
const EVENTS = new Set([
  'rpc_received', 'rpc_completed', 'rpc_failed', 'rpc_parse_failed',
  'tool_started', 'tool_completed', 'tool_failed', 'workflow_event',
  'converter_started', 'converter_completed', 'converter_stopped', 'coverage_checked',
  'standalone_picker_started', 'standalone_picker_completed',
  'standalone_batch_accepted', 'standalone_batch_stopped'
]);
const METHODS = new Set([
  'server/discover', 'initialize', 'notifications/initialized',
  'notifications/cancelled', 'ping', 'resources/list', 'resources/read',
  'tools/list', 'tools/call', 'prompts/list', 'prompts/get'
]);
const OPERATIONS = new Set([
  'privacy_status', 'diagnostic_status', 'export_diagnostic_package',
  'open_privacy_folder', 'configure_privacy_folder', 'configure_result_folder',
  'open_result_folder', 'start_document_batch_from_picker',
  'continue_anonymized_batch_in_chat', 'start_completed_local_results_handoff',
  'continue_local_results_handoff', 'cancel_local_results_handoff',
  'document_batch_status', 'list_document_batch_results',
  'review_deferred_document_batch', 'acknowledge_batch_document',
  'resume_document_batch', 'continue_most_recent_document_batch',
  'discard_incomplete_document_batches', 'read_anonymized_document',
  'read_anonymized_documents', 'acknowledge_batch_documents',
  'list_visual_review_items', 'open_visual_review_folder', 'purge_local_data',
  'open_output_folder', 'open_export_folder',
  'result_folder_picker_requested', 'result_folder_picker_accepted',
  'result_folder_picker_failed', 'picker_requested',
  'picker_selection_accepted', 'picker_cancelled', 'picker_failed',
  'intake_worker_spawned', 'intake_ipc_dispatched', 'intake_ipc_failed',
  'intake_checkpoint_created', 'intake_processing_started',
  'intake_terminal_state', 'intake_worker_exited',
  'completion_notice_started', 'completion_notice_finished',
  'completion_notice_dispatched', 'completion_notice_failed',
  'mcp_start_response', 'review_worker_spawned', 'review_ipc_dispatched',
  'review_ipc_failed', 'review_reconstruction_started',
  'review_reconstruction_finished', 'review_reconstruction_failed',
  'review_ui_started', 'review_ui_finished', 'review_ui_failed',
  'review_terminal_state', 'review_worker_exited', 'mcp_review_response',
  'automatic_review_started', 'automatic_review_finished',
  'automatic_review_claim_failed', 'automatic_review_failed',
  'automatic_review_release_failed', 'startup_refused',
  'markitdown_docx_differential', 'standalone_batch'
]);
const OUTCOMES = new Set(['progress', 'ok', 'stopped']);
const PRODUCT_CHANNELS = new Set(['plugin', 'standalone']);
const ERROR_CODES = new Set([
  'NONE', 'INTERNAL_FAILURE', 'INVALID_JSON', 'RPC_FRAME_TOO_LARGE', 'SUPPORT_MODE_REQUIRED',
  'TOOL_RETURNED_STOP', 'REQUEST_CANCELLED', 'LOCAL_SELECTION_CANCELLED',
  'LOCAL_SELECTION_REJECTED', 'LOCAL_PICKER_FAILED',
  'LOCAL_PICKER_UNAVAILABLE', 'LOCAL_PICKER_TIMEOUT',
  'LOCAL_IPC_ACK_TIMEOUT', 'LOCAL_IPC_ACK_CANCELLED',
  'LOCAL_WORKER_SPAWN_FAILED', 'LOCAL_IPC_FAILED', 'LOCAL_WORKER_EXITED',
  'LOCAL_NOTICE_FAILED', 'LOCAL_REVIEW_FAILED', 'LOCAL_REVIEW_TIMEOUT',
  'LOCAL_REVIEW_CANCELLED', 'LOCAL_REVIEW_DEFERRED',
  'LOCAL_REVIEW_TOO_LARGE', 'LOCAL_REVIEW_WORKER_EXITED',
  'LOCAL_REVIEW_BUSY', 'LOCAL_REVIEW_RELEASE_FAILED',
  'RESULT_FOLDER_REQUIRED', 'UNSAFE_STORAGE_LOCATION',
  'STARTUP_RECOVERY_FAILED', 'STARTUP_OUTBOX_RECOVERY_FAILED',
  'STARTUP_MIGRATION_FAILED', 'STARTUP_CLEANUP_FAILED',
  'RUNTIME_INTEGRITY_FAILED', 'STARTUP_FAILED',
  'CONVERTER_NOT_RELEASED', 'CONVERTER_INPUT_INVALID',
  'CONVERTER_RUNTIME_INVALID', 'CONVERTER_TIMEOUT', 'CONVERTER_OUTPUT_TOO_LARGE',
  'CONVERTER_RUNTIME_FAILED', 'CONVERTER_FAILED', 'CONVERTER_OUTPUT_INVALID',
  'STANDALONE_ARGUMENT_INVALID', 'STANDALONE_BUSY',
  'STANDALONE_ENGINE_NOT_READY', 'STANDALONE_SELECTION_CANCELLED',
  'STANDALONE_START_FAILED', 'STANDALONE_RESULT_ROOT_UNSAFE'
]);
let writeErrors = 0;
let inspectionErrors = 0;
let writesSincePrune = 0;

function enabled(environment = process.env) {
  return environment.EU_PRIVACY_SUPPORT_MODE === '1';
}
function newTraceId() { return crypto.randomBytes(4).toString('hex'); }
function boundedDuration(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? Math.min(number, 60 * 60 * 1000) : 0;
}
function safeTimestamp(value, now = Date.now()) {
  const parsed = Date.parse(String(value || ''));
  return new Date(Number.isFinite(parsed) ? parsed : now).toISOString();
}
function safeId(value) { return ID_RE.test(String(value || '')) ? String(value) : 'none'; }
function sanitizeSupportTrace(record = {}, options = {}) {
  const now = options.now instanceof Date ? options.now.valueOf() : Number(options.now ?? Date.now());
  const event = String(record.event || '');
  const method = String(record.method || '');
  const operation = String(record.operation || '');
  const outcome = String(record.outcome || 'progress');
  return {
    schema: SUPPORT_TRACE_SCHEMA,
    timestamp: safeTimestamp(record.timestamp, now),
    gateway_version: VERSION,
    product_channel: PRODUCT_CHANNELS.has(String(record.product_channel || (options.env || process.env).DATASECURE_PRODUCT_CHANNEL))
      ? String(record.product_channel || (options.env || process.env).DATASECURE_PRODUCT_CHANNEL) : 'plugin',
    trace_id: safeId(record.trace_id),
    run_id: safeId(record.run_id || (options.env || process.env).DATASECURE_RUN_ID),
    event: EVENTS.has(event) ? event : 'rpc_failed',
    method: METHODS.has(method) ? method : 'unknown',
    operation: OPERATIONS.has(operation) ? operation : 'none',
    outcome: OUTCOMES.has(outcome) ? outcome : 'stopped',
    duration_ms: boundedDuration(record.duration_ms),
    error_code: ERROR_CODES.has(String(record.error_code || 'NONE'))
      ? String(record.error_code || 'NONE') : 'INTERNAL_FAILURE'
  };
}
function traceDirectory(options = {}) {
  return path.join(options.dataRoot || dataRoot(), 'diagnostics', 'support-events');
}
function eventFiles(options = {}) {
  return spoolEventFiles({ ...options, directory: traceDirectory(options) });
}
function readSupportTrace(options = {}) {
  const io = options.fs || fs;
  const directory = traceDirectory(options);
  const now = options.now instanceof Date ? options.now.valueOf() : Number(options.now ?? Date.now());
  const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const events = [];
  for (const name of eventFiles(options).slice(-MAX_EVENTS * 2)) {
    const file = path.join(directory, name);
    let fd;
    try {
      fd = io.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const opened = io.fstatSync(fd);
      const named = io.lstatSync(file);
      if (!opened.isFile() || opened.size < 2 || opened.size > MAX_EVENT_BYTES || named.isSymbolicLink() ||
          opened.dev !== named.dev || opened.ino !== named.ino) continue;
      const raw = JSON.parse(io.readFileSync(fd, 'utf8'));
      const parsed = Date.parse(String(raw.timestamp || ''));
      if (raw.schema !== SUPPORT_TRACE_SCHEMA || !Number.isFinite(parsed) || parsed < cutoff || parsed > now + 300000) continue;
      events.push(sanitizeSupportTrace(raw, { now }));
    } catch { /* malformed or raced entries are never reflected */ }
    finally { if (fd !== undefined) try { io.closeSync(fd); } catch {} }
  }
  return events.sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.trace_id.localeCompare(right.trace_id)).slice(-MAX_EVENTS);
}
function pruneSupportTrace(options = {}) {
  pruneEvents({ ...options, directory: traceDirectory(options), retentionDays: RETENTION_DAYS,
    maximum: MAX_EVENTS });
}
function recordSupportTrace(record, options = {}) {
  if (!enabled(options.env || process.env)) return false;
  const io = options.fs || fs;
  const directory = traceDirectory(options);
  try {
    const event = sanitizeSupportTrace(record, options);
    const serialized = `${JSON.stringify(event)}\n`;
    publishEvent(serialized, { ...options, fs: io, directory, timestamp: Date.parse(event.timestamp) });
    // Directory enumeration is intentionally amortized. The trace is a support
    // aid and must not become the bottleneck it is meant to diagnose.
    writesSincePrune++;
    if (writesSincePrune >= 50) {
      pruneSupportTrace(options);
      writesSincePrune = 0;
    }
    return true;
  } catch {
    writeErrors++;
    return false;
  }
}
function supportTraceStatus(limit = 50, options = {}) {
  const bounded = Math.max(1, Math.min(200, Number.isSafeInteger(Number(limit)) ? Number(limit) : 50));
  let events = [];
  try { pruneSupportTrace(options); events = readSupportTrace(options); } catch { inspectionErrors++; }
  return {
    schema: SUPPORT_TRACE_SCHEMA,
    enabled: enabled(options.env || process.env),
    retention_days: RETENTION_DAYS,
    retained_events: events.length,
    returned_events: Math.min(bounded, events.length),
    events: events.slice(-bounded).reverse(),
    write_errors: writeErrors,
    inspection_errors: inspectionErrors,
    raw_json_rpc_logged: false,
    arguments_logged: false,
    results_logged: false,
    filenames_logged: false,
    paths_logged: false,
    hashes_logged: false,
    tokens_logged: false
  };
}

module.exports = {
  SUPPORT_TRACE_SCHEMA, RETENTION_DAYS, MAX_EVENTS, enabled, newTraceId,
  sanitizeSupportTrace, recordSupportTrace, supportTraceStatus,
  _test: { traceDirectory, readSupportTrace, eventFiles }
};
