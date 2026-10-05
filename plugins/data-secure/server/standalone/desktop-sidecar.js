#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { StandaloneApplicationService } = require('./application-service');
const { FrameDecoder, MAX_FRAME_BYTES } = require('./desktop-ipc');
const { desktopErrorCode } = require('../core/desktop-error-contract');

const diagnosticDirectory = path.resolve(process.env.DATASECURE_STANDALONE_DIAGNOSTIC_DIR ||
  path.join(os.tmpdir(), 'SecureDataMsg-Standalone'));
const diagnosticFile = path.join(diagnosticDirectory, 'sidecar-interactions.jsonl');
const diagnosticSession = /^[a-f0-9]{16,64}$/u.test(String(process.env.DATASECURE_STANDALONE_DIAGNOSTIC_SESSION || ''))
  ? process.env.DATASECURE_STANDALONE_DIAGNOSTIC_SESSION : null;

function diagnosticEvent(event, fields = {}) {
  try {
    fs.mkdirSync(diagnosticDirectory, { recursive: true, mode: 0o700 });
    if (fs.statSync(diagnosticFile, { throwIfNoEntry: false })?.size > 2 * 1024 * 1024) {
      const previous = path.join(diagnosticDirectory, 'sidecar-interactions.previous.jsonl');
      fs.rmSync(previous, { force: true });
      fs.renameSync(diagnosticFile, previous);
    }
    fs.appendFileSync(diagnosticFile, `${JSON.stringify({
      schema: 'datasecure-standalone-interaction/1', time_ms: Date.now(), component: 'sidecar',
      ...(diagnosticSession ? { session_id: diagnosticSession } : {}),
      event, outcome: fields.outcome || 'progress',
      ...(fields.action ? { action: fields.action } : {}),
      ...(fields.error_code ? { error_code: fields.error_code } : {})
    })}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch { /* Diagnostics must never change product behavior. */ }
}

let service;
let startupError;
diagnosticEvent('sidecar_started', { outcome: 'ready' });
try {
  service = new StandaloneApplicationService();
  diagnosticEvent('service_initialized', { outcome: 'ready' });
} catch (error) {
  startupError = error;
  diagnosticEvent('service_initialization_failed', {
    outcome: 'failed', error_code: error?.code || 'STANDALONE_OPERATION_FAILED'
  });
}
const decoder = new FrameDecoder();
let chain = Promise.resolve();
let stopping = false;

function stopInput() {
  stopping = true;
  process.stdin.pause();
  decoder.buffer = Buffer.alloc(0);
}

function endHost(code, event, errorCode) {
  stopInput();
  diagnosticEvent(event, { outcome: code === 0 ? 'stopped' : 'failed', error_code: errorCode });
  // EOF means the owning desktop process has gone away. Merely setting
  // exitCode leaves this control process alive while a detached batch/review
  // worker still holds its IPC channel. Exit only this host: autonomous workers
  // retain their durable checkpoints and their existing disconnect semantics.
  process.exit(code);
}

function writeFrame(value, callback) {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  if (payload.length > MAX_FRAME_BYTES) throw new Error('DESKTOP_IPC_RESPONSE_TOO_LARGE');
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]), callback);
}

function publicError(requestId, error) {
  const code = desktopErrorCode(error?.code);
  const safeLabel = label => typeof label === 'string' && label.length > 0 && label.length <= 1024 &&
    !path.posix.isAbsolute(label) && !path.win32.isAbsolute(label) && !/[:\\\u0000-\u001f\u007f]/u.test(label) &&
    !label.split('/').some(part => !part || part === '.' || part === '..');
  const selectionCodes = new Set(['SOURCE_FORMAT_SIZE_LIMIT', 'SOURCE_FILE_EMPTY', 'SOURCE_FORMAT_UNSUPPORTED',
    'SOURCE_READ_FAILED', 'SOURCE_ACCESS_DENIED', 'SOURCE_PATH_UNSAFE', 'SOURCE_IDENTITY_CHANGED', 'SOURCE_ARTIFACT_IGNORED']);
  let localDetails = code === 'SOURCE_FOLDER_UNSUPPORTED_FILES' &&
    Array.isArray(error?.localUnsupportedFiles) &&
    error.localUnsupportedFiles.length > 0 &&
    error.localUnsupportedFiles.length <= 200 &&
    error.localUnsupportedFiles.every(safeLabel) &&
    Number.isSafeInteger(error.localUnsupportedCount) &&
    error.localUnsupportedCount >= error.localUnsupportedFiles.length && error.localUnsupportedCount <= 4096
    ? { unsupported_files: error.localUnsupportedFiles, unsupported_count: error.localUnsupportedCount }
    : null;
  if ((selectionCodes.has(code) || code === 'SOURCE_SELECTION_REJECTED') &&
      Array.isArray(error?.localSelectionFiles) && error.localSelectionFiles.length > 0 &&
      error.localSelectionFiles.length <= 200 && error.localSelectionFiles.every(item => item &&
        Object.keys(item).length === 2 && safeLabel(item.name) && selectionCodes.has(item.reason_code)) &&
      Number.isSafeInteger(error.localSelectionCount) && error.localSelectionCount >= error.localSelectionFiles.length &&
      error.localSelectionCount <= 4096) {
    localDetails = { selection_files: error.localSelectionFiles, selection_count: error.localSelectionCount };
  }
  return {
    schema: 'datasecure-standalone-private-response/1', request_id: requestId, ok: false,
    error_code: code,
    ...(localDetails ? { error_details: localDetails } : {})
  };
}

async function dispatch(message) {
  if (message.action === 'shutdown') return { ok: true, shutting_down: true, external_disclosure: false };
  if (startupError) throw startupError;
  switch (message.action) {
    case 'admit_selected_sources':
      return service.admitSelectedSources(message.source_paths, message.source_kind);
    case 'remove_admitted_source': return service.removeAdmittedSource(message.selection_index);
    case 'cancel_admission': return service.cancelAdmission();
    case 'start_admitted_batch': return service.startAdmittedBatch({ processingMode: message.processing_mode,
      ...(message.output_naming_mode ? { outputNamingMode: message.output_naming_mode } : {}) });
    case 'get_public_state': return service.status();
    case 'get_ui_context': return service.uiContext();
    case 'get_run_history': return service.history();
    case 'get_run_failures': return service.runFailures(message.batch_id);
    case 'get_review_session': return service.reviewSession();
    case 'get_review_chunk': return service.reviewChunk(message.review_id, message.chunk_index);
    case 'submit_review': return service.submitReview(message.review_id, message.answer);
    case 'continue_review_session': return service.continueReviewSession();
    case 'continue_history_batch': return service.continueHistoryBatch(message.batch_id);
    case 'ack_terminal_presented': return service.acknowledgeTerminalPresented(message.presentation_generation);
    case 'continue_current_batch': return service.continueCurrentBatch(undefined, { requireObserved: true });
    case 'configure_results': return service.configureResults({ path: message.source_paths[0] });
    case 'resolve_current_results':
    case 'resolve_local_ledger':
    case 'resolve_history_results':
    case 'resolve_history_ledger':
    case 'resolve_history_identity_mapping':
    case 'resolve_identity_mappings_directory': {
      diagnosticEvent('local_target_requested', { action: message.action });
      try {
        const result = message.action === 'resolve_history_results'
          ? service.resolveHistoryResults(message.batch_id)
          : message.action === 'resolve_history_ledger'
            ? service.resolveHistoryLedger(message.batch_id)
            : message.action === 'resolve_history_identity_mapping'
              ? service.resolveHistoryIdentityMapping(message.batch_id)
            : message.action === 'resolve_identity_mappings_directory'
              ? service.resolveIdentityMappingsDirectory()
            : message.action === 'resolve_current_results'
              ? service.resolveResults() : service.resolveLedger();
        diagnosticEvent('local_target_resolved', { action: message.action, outcome: 'ready' });
        return result;
      } catch (error) {
        diagnosticEvent('local_target_resolution_failed', {
          action: message.action, outcome: 'failed',
          error_code: error?.code || 'STANDALONE_OPERATION_FAILED'
        });
        throw error;
      }
    }
    default: throw Object.assign(new Error('unknown action'), { code: 'DESKTOP_IPC_ACTION_INVALID' });
  }
}

process.stdin.on('data', (chunk) => {
  if (stopping) return;
  let messages;
  try { messages = decoder.push(chunk); }
  catch { endHost(65, 'private_ipc_invalid', 'DESKTOP_IPC_FRAME_INVALID'); return; }
  for (const message of messages) {
    chain = chain.then(async () => {
      if (stopping) return;
      diagnosticEvent('request_received', { action: message.action });
      try {
        const result = await dispatch(message);
        if (stopping) return;
        const response = { schema: 'datasecure-standalone-private-response/1', request_id: message.request_id,
          ok: true, result };
        if (message.action === 'shutdown') {
          stopInput();
          diagnosticEvent('response_ready', { action: message.action, outcome: 'ready' });
          // Permit the small acknowledgement to flush, but a dead/non-reading
          // desktop must not leave the host or queued requests alive forever.
          setTimeout(() => endHost(0, 'sidecar_shutdown'), 1000).unref();
          writeFrame(response, (error) => error
            ? endHost(1, 'private_ipc_output_failed', 'DESKTOP_IPC_WRITE_FAILED')
            : endHost(0, 'sidecar_shutdown'));
        } else {
          diagnosticEvent('response_ready', { action: message.action, outcome: 'ready' });
          writeFrame(response);
        }
      } catch (error) {
        if (stopping) { endHost(1, 'private_ipc_output_failed', 'DESKTOP_IPC_WRITE_FAILED'); return; }
        const response = publicError(message.request_id, error);
        diagnosticEvent('response_ready', {
          action: message.action, outcome: 'failed', error_code: response.error_code
        });
        writeFrame(response);
      }
    }).catch(() => {
      endHost(1, 'request_chain_failed', 'STANDALONE_OPERATION_FAILED');
    });
  }
});

process.stdin.on('end', () => {
  const truncated = decoder.buffer.length !== 0;
  endHost(truncated ? 65 : 0, truncated ? 'private_ipc_truncated' : 'private_ipc_closed',
    truncated ? 'DESKTOP_IPC_FRAME_TRUNCATED' : undefined);
});
process.stdin.on('error', () => endHost(1, 'private_ipc_input_failed', 'DESKTOP_IPC_READ_FAILED'));
process.stdout.on('error', () => endHost(1, 'private_ipc_output_failed', 'DESKTOP_IPC_WRITE_FAILED'));
