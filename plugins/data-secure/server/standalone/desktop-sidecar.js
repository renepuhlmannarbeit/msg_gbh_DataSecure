#!/usr/bin/env node
'use strict';

const os = require('node:os');
const path = require('node:path');
const { createBestEffortDiagnosticLog } = require('../core/safe-diagnostic-log');

const diagnosticDirectory = path.resolve(process.env.DATASECURE_STANDALONE_DIAGNOSTIC_DIR ||
  path.join(os.tmpdir(), 'SecureDataMsg-Standalone'));
const diagnosticSegment = /^[a-f0-9]{32}$/u.test(String(process.env.DATASECURE_STANDALONE_DIAGNOSTIC_SEGMENT || ''))
  ? process.env.DATASECURE_STANDALONE_DIAGNOSTIC_SEGMENT : undefined;
const diagnosticLog = createBestEffortDiagnosticLog({ directory: diagnosticDirectory, name: 'sidecar-interactions.jsonl',
  ...(diagnosticSegment ? { segmentKey: diagnosticSegment } : {}) });
const diagnosticSession = /^[a-f0-9]{16,64}$/u.test(String(process.env.DATASECURE_STANDALONE_DIAGNOSTIC_SESSION || ''))
  ? process.env.DATASECURE_STANDALONE_DIAGNOSTIC_SESSION : null;
let diagnosticLogAvailable = true;
const BATCH_WORKER_PHASES = ['item_epoch_release', 'registry_finalize', 'local_delivery_verify', 'executor_lease_release', 'processing', 'result_export_prepare', 'result_export_claim', 'result_export_plan', 'result_export_copy', 'result_export_claim_release'];

function diagnosticEvent(event, fields = {}) {
  try {
    // Batch failures are code/stage evidence, never worker/run/session IDs or
    // an arbitrary workflow record. Re-project even the trusted service hook.
    if (event === 'batch_worker_failed') {
      const code = fields.error_code, mapped = desktopErrorCode(code);
      fields = { outcome: 'failed',
        phase: BATCH_WORKER_PHASES.includes(fields.phase) ? fields.phase : 'processing',
        error_code: mapped !== 'STANDALONE_OPERATION_FAILED' ? mapped : batchDiagnosticCodes.has(code) ? code : mapped };
    }
    if (!diagnosticLog.append(`${JSON.stringify({
      schema: 'datasecure-standalone-interaction/1', time_ms: Date.now(), component: 'sidecar',
      ...(diagnosticSession && event !== 'batch_worker_failed' ? { session_id: diagnosticSession } : {}),
      event, outcome: fields.outcome || 'progress',
      ...(fields.action ? { action: fields.action } : {}),
      ...(fields.error_code ? { error_code: fields.error_code } : {}),
      ...((event === 'batch_worker_failed' ? BATCH_WORKER_PHASES : ['reconcile', 'staging', 'publish', 'acknowledge', 'abandon'])
        .includes(fields.phase) ? { phase: fields.phase } : {}),
      ...(Number.isSafeInteger(fields.completed_count) && fields.completed_count >= 0 && fields.completed_count <= 200
        ? { completed_count: fields.completed_count } : {}),
      ...(Number.isSafeInteger(fields.total_count) && fields.total_count >= 0 && fields.total_count <= 200
        ? { total_count: fields.total_count } : {}),
      ...(Number.isSafeInteger(fields.journal_count) && fields.journal_count >= 0 && fields.journal_count <= 1000000
        ? { journal_count: fields.journal_count } : {}),
      ...(Number.isSafeInteger(fields.export_count) && fields.export_count >= 0 && fields.export_count <= 1000000
        ? { export_count: fields.export_count } : {}),
      ...(fields.recovery_requested === true ? { recovery_requested: true } : {}),
      ...(Number.isSafeInteger(fields.elapsed_ms) && fields.elapsed_ms >= 0 && fields.elapsed_ms <= 3600000
        ? { elapsed_ms: fields.elapsed_ms } : {})
    })}\n`)) diagnosticLogAvailable = false;
  } catch { diagnosticLogAvailable = false; /* Diagnostics must never change product behavior. */ }
}

// Record a content-free phase before importing the product service. On a
// packaged Mac an import or native loader failure previously left no sidecar
// evidence because all imports preceded the first diagnostic event.
diagnosticEvent('sidecar_entry', { outcome: 'ready' });
let StandaloneApplicationService, FrameDecoder, MAX_FRAME_BYTES, validatePrivateMessage;
let NativeExportChannel, NATIVE_RESPONSE_SCHEMA, PUBLICATION_RESPONSE, desktopErrorCode, batchDiagnosticCodes, rootSeparationFailure;
try {
  ({ StandaloneApplicationService } = require('./application-service'));
  ({ FrameDecoder, MAX_FRAME_BYTES, validatePrivateMessage } = require('./desktop-ipc'));
  ({ NativeExportChannel, RESPONSE_SCHEMA: NATIVE_RESPONSE_SCHEMA, PUBLICATION_RESPONSE } = require('./native-export-channel'));
  const { DESKTOP_ERROR_CODES } = require('../core/desktop-error-contract');
  ({ desktopErrorCode } = require('../core/desktop-error-contract'));
  ({ rootSeparationFailure } = require('../gateway/root-boundary'));
  batchDiagnosticCodes = new Set([...DESKTOP_ERROR_CODES,
    ...require('../gateway/diagnostic-causes').WORKFLOW_ERROR_CODES,
    ...require('../core/document-result-grade').REASON_CODES]);
  diagnosticEvent('sidecar_imports_ready', { outcome: 'ready' });
} catch (error) {
  const code = error?.code === 'MODULE_NOT_FOUND' ? 'STANDALONE_SIDECAR_MODULE_MISSING'
    : error?.code === 'ERR_DLOPEN_FAILED' ? 'STANDALONE_SIDECAR_NATIVE_LOAD_FAILED'
      : 'STANDALONE_SIDECAR_IMPORT_FAILED';
  diagnosticEvent('sidecar_import_failed', { outcome: 'failed', error_code: code });
  process.exit(70);
}

let service;
let startupError;
const nativeChannel = new NativeExportChannel({ write: value => writeFrame(value) });
const nativeEnabled = process.env.DATASECURE_NATIVE_EXPORT_CHANNEL === '1';
let nativeSession;
let nativeExportStageStartedAt = 0;
const ownerGeneration = process.env.DATASECURE_DOCUMENT_CONTROL_GENERATION;
diagnosticEvent('sidecar_started', { outcome: 'ready' });
const serviceStartedAt = Date.now();
try {
  const owner = Number(process.env.DATASECURE_DOCUMENT_CONTROL_OWNER_PID);
  if (nativeEnabled && (!Number.isSafeInteger(owner) || owner <= 0 || owner !== process.ppid))
    throw Object.assign(Error('STANDALONE_IPC_FAILED'), { code: 'STANDALONE_IPC_FAILED' });
  const retiredControlGenerations = nativeEnabled ? JSON.parse(process.env.DATASECURE_RETIRED_CONTROL_GENERATIONS || '[]') : [];
  if (nativeEnabled && (!/^[a-f0-9]{32}$/u.test(ownerGeneration || '') || !Array.isArray(retiredControlGenerations) ||
      retiredControlGenerations.length > 16 || new Set(retiredControlGenerations).size !== retiredControlGenerations.length ||
      retiredControlGenerations.some(value => !/^[a-f0-9]{32}$/u.test(value) || value === ownerGeneration)))
    throw Object.assign(Error('STANDALONE_IPC_FAILED'), { code: 'STANDALONE_IPC_FAILED' });
  service = new StandaloneApplicationService({ ...(nativeEnabled ? {
    controlOwnerPid: owner, controlOwnerGeneration: ownerGeneration, retiredControlGenerations,
    startupDiagnostic: diagnosticEvent,
    prepareNativeBinding: (batchId, operationId) => service.prepareConfiguredExportRoot(snapshot => {
      if (!nativeSession) throw Object.assign(Error('STANDALONE_IPC_FAILED'), { code: 'STANDALONE_IPC_FAILED' });
      return nativeSession.send('prepare_configured_export_root', { ...snapshot, batch_id: batchId, operation_id: operationId });
    }),
    nativeExport: (operation, command, body) => {
      if (!nativeSession) return Promise.reject(Object.assign(Error('STANDALONE_IPC_FAILED'), { code: 'STANDALONE_IPC_FAILED' }));
      // Sparse, content-free checkpoints distinguish slow staging from a
      // slow native publish. Never log operation IDs, names, paths or bodies.
      const phase = command === 'write_body' ? 'staging' :
        ['reconcile', 'publish', 'acknowledge', 'abandon'].includes(command) ? command : null;
      const total = Array.isArray(operation?.files) ? operation.files.length : 0;
      const completed = body?.final_chunk === true && Number.isSafeInteger(body.index) ? body.index + 1 : 0;
      if (command === 'write_body' && body?.index === 0 && body?.offset === 0) {
        nativeExportStageStartedAt = Date.now();
        diagnosticEvent('native_export_phase', { phase: 'staging', outcome: 'started', total_count: total });
      }
      const checkpoint = phase && (command !== 'write_body' || completed > 0 &&
        (completed === 1 || completed === total || completed % 25 === 0));
      const started = Date.now();
      if (checkpoint && command !== 'write_body') diagnosticEvent('native_export_phase', { phase, outcome: 'started', total_count: total });
      return nativeSession.send('export_documents', { operation, command, ...(body ? { body } : {}) })
        .then(result => {
          if (checkpoint) diagnosticEvent('native_export_phase', { phase, outcome: 'ready',
            completed_count: command === 'write_body' ? completed : undefined, total_count: total,
            elapsed_ms: Date.now() - (command === 'write_body' && nativeExportStageStartedAt ? nativeExportStageStartedAt : started) });
          return result;
        }, error => {
          // A failed body chunk may not be a 1/25/last-file checkpoint. Record
          // that failure once with only the number of earlier complete files.
          if (phase) diagnosticEvent('native_export_phase', { phase, outcome: 'failed',
            completed_count: command === 'write_body' && Number.isSafeInteger(body?.index) ? body.index : undefined, total_count: total,
            elapsed_ms: Date.now() - (command === 'write_body' && nativeExportStageStartedAt ? nativeExportStageStartedAt : started),
            error_code: desktopErrorCode(error?.code) });
          throw error;
        });
    }
  } : { startupDiagnostic: diagnosticEvent }) });
  if (nativeEnabled && process.env.DATASECURE_BUNDLED_RUNTIME_REQUIRED === '1') {
    // initializeProduct has completed the mandatory signed-runtime check.
    diagnosticEvent('runtime_integrity_checked', { outcome: 'ready' });
  }
  diagnosticEvent('service_initialized', { outcome: 'ready', elapsed_ms: Date.now() - serviceStartedAt });
} catch (error) {
  // A real public-root permission refusal is not a missing/trapped Core or a
  // proven TCC decision. Keep strict refusal, but expose its fixed actual class.
  // Do not accept a caller-set property as proof and never make a partial Ready.
  startupError = rootSeparationFailure(error) === 'active_public_access_denied'
    ? Object.assign(Error('STANDALONE_RESULT_ROOT_ACCESS_DENIED'), { code: 'STANDALONE_RESULT_ROOT_ACCESS_DENIED' }) : error;
  diagnosticEvent('service_initialization_failed', {
    outcome: 'failed', error_code: desktopErrorCode(startupError?.code), elapsed_ms: Date.now() - serviceStartedAt
  });
}
// The owning native desktop waits for this exact private bootstrap proof before
// dispatching an ordinary request. CLI/non-native adapters keep their protocol.
if (nativeEnabled) writeFrame({ schema: 'datasecure-standalone-ready/1', owner_generation: ownerGeneration,
  ok: !startupError, diagnostic_log: diagnosticLogAvailable ? 'ready' : 'unavailable',
  ...(startupError ? { error_code: desktopErrorCode(startupError.code) } : {}) });
const decoder = new FrameDecoder({ validate: message => {
  if (nativeEnabled && [NATIVE_RESPONSE_SCHEMA, PUBLICATION_RESPONSE].includes(message?.schema)) return nativeChannel.accept(message);
  return validatePrivateMessage(message);
} });
let chain = Promise.resolve();
let stopping = false;

function stopInput() {
  stopping = true;
  nativeChannel.abort();
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
  if (code === 'DOCUMENT_EXPORT_NAME_INVALID' && Array.isArray(error.failed_files) && error.failed_files.length > 0 &&
      error.failed_files.length <= 200 && error.failed_files.every(item => item && Object.keys(item).length === 2 &&
        safeLabel(item.name) && item.reason_code === code)) {
    localDetails = { selection_files: error.failed_files, selection_count: error.failed_files.length };
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
  nativeSession = nativeEnabled ? nativeChannel.publication(message) : null;
  switch (message.action) {
    case 'admit_selected_sources':
      return service.admitSelectedSources(message.source_paths, message.source_kind, undefined,
        { catalogue: message.source_catalogue === true });
    case 'remove_admitted_source': return service.removeAdmittedSource(message.selection_index);
    case 'cancel_admission': return service.cancelAdmission();
    case 'start_admitted_batch': return service.startAdmittedBatch({ processingMode: message.processing_mode,
      ...(Object.hasOwn(message, 'review_policy') ? { reviewPolicy: message.review_policy } : {}),
      ...(Object.hasOwn(message, 'content_options') ? { contentOptions: message.content_options } : {}),
      ...(message.source_ids ? { sourceIds: message.source_ids, catalogueRevision: message.catalogue_revision } : {}),
      ...(message.ocr_contact_review === true ? { ocrContactReview: true } : {}),
      ...(message.document_review === true ? { documentReview: true } : {}),
      ...(message.output_naming_mode ? { outputNamingMode: message.output_naming_mode } : {}) });
    case 'get_public_state': return service.status({ localUi: true });
    case 'get_ui_context': return service.uiContext();
    case 'get_run_history': return service.history({ recoverExports: message.recover_exports === true,
      recoverBatchId: message.recover_batch_id || null, includeHidden: message.include_hidden === true, batchId: message.batch_id || null });
    case 'set_run_history_visibility': return service.setRunHistoryVisibility(message.batch_id, message.hidden);
    case 'get_run_failures': return service.runFailures(message.batch_id);
    case 'get_review_session': return service.reviewSession();
    case 'get_review_chunk': return service.reviewChunk(message.review_id, message.chunk_index);
    case 'submit_review': return service.submitReview(message.review_id, message.answer);
    case 'continue_review_session': return service.continueReviewSession();
    case 'continue_history_batch': return service.continueHistoryBatch(message.batch_id);
    case 'skip_ocr_contact_review': return service.skipOcrContactReview(message.batch_id);
    case 'pause_batch': return service.pauseBatch(message.batch_id);
    case 'abandon_result_export': return service.abandonResultExport(message.batch_id);
    case 'get_document_reviews': return service.documentReviews(message.batch_id);
    case 'get_document_review_history_summary': return service.documentReviewHistorySummary(message.batch_id);
    case 'get_document_review_chunk': return service.documentReviewChunk(message.batch_id, message.document_id, message.revision, message.chunk_index);
    case 'get_document_entities': return service.documentEntities(message.batch_id, message.document_id, message.revision, message.page);
    case 'decide_document_review': return service.decideDocumentReview(message.batch_id, message.document_id, message.decision);
    case 'decide_document_review_batch': return service.decideDocumentReviewBatch(message.batch_id, message.decision);
    case 'export_approved_documents': return service.exportApprovedDocuments(message.batch_id, message.operation_id, message.selection, message.acknowledge === true);
    case 'publish_result_documents': return service.publishResultDocuments(message.batch_id);
    case 'preview_document_export': return service.previewDocumentExport(message.batch_id, message.operation_id, message.selection);
    case 'abandon_document_export': return service.abandonDocumentExport(message.batch_id, message.operation_id, message.digest);
    case 'resolve_document_export': return service.resolveDocumentExport(message.batch_id, message.operation_id);
    case 'resolve_document_identity_overview': return service.resolveDocumentIdentityOverview(message.batch_id, message.operation_id);
    case 'ack_terminal_presented': return service.acknowledgeTerminalPresented(message.presentation_generation);
    case 'continue_current_batch': return service.continueCurrentBatch(undefined, { requireObserved: true });
    case 'configure_results': {
      if (message.native_export_binding === true && !nativeEnabled)
        throw Object.assign(Error('STANDALONE_IPC_FAILED'), { code: 'STANDALONE_IPC_FAILED' });
      if (nativeEnabled && message.native_export_binding === true) {
        return service.configureResults({ path: message.source_paths[0], prepareNativeExport: () => {
          // The service first excludes live work and holds interactionActive.
          // Reject private/public overlap before native provisioning as well.
          require('../gateway/root-boundary').assertRootSeparation({ resultRoot: message.source_paths[0] });
          return nativeChannel.configureExportRoot(message);
        } });
      }
      return service.configureResults({ path: message.source_paths[0] });
    }
    case 'resolve_current_results':
    case 'resolve_local_ledger':
    case 'resolve_history_results':
    case 'resolve_history_ledger':
    case 'resolve_history_identity_mapping':
    case 'resolve_identity_mappings_directory': {
      diagnosticEvent('local_target_requested', { action: message.action });
      try {
        const result = message.action === 'resolve_history_results'
          ? await service.resolveHistoryResults(message.batch_id)
          : message.action === 'resolve_history_ledger'
            ? service.resolveHistoryLedger(message.batch_id)
            : message.action === 'resolve_history_identity_mapping'
              ? service.resolveHistoryIdentityMapping(message.batch_id)
            : message.action === 'resolve_identity_mappings_directory'
              ? service.resolveIdentityMappingsDirectory()
            : message.action === 'resolve_current_results'
              ? await service.resolveCurrentResults() : service.resolveLedger();
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
    // Native replies must resolve the in-flight dispatch immediately, not wait
    // behind that same dispatch in the serial request chain.
    if ([NATIVE_RESPONSE_SCHEMA, PUBLICATION_RESPONSE].includes(message.schema)) continue;
    chain = chain.then(async () => {
      if (stopping) return;
      const startedAt = Date.now();
      const recoveryRequested = message.action === 'get_run_history' && message.recover_exports === true;
      diagnosticEvent('request_received', { action: message.action, recovery_requested: recoveryRequested });
      try {
        const result = await dispatch(message);
        if (stopping) return;
        const response = { schema: 'datasecure-standalone-private-response/1', request_id: message.request_id,
          ok: true, result };
        if (message.action === 'shutdown') {
          stopInput();
          diagnosticEvent('response_ready', { action: message.action, outcome: 'ready', elapsed_ms: Date.now() - startedAt,
            recovery_requested: recoveryRequested });
          // Permit the small acknowledgement to flush, but a dead/non-reading
          // desktop must not leave the host or queued requests alive forever.
          setTimeout(() => endHost(0, 'sidecar_shutdown'), 1000).unref();
          writeFrame(response, (error) => error
            ? endHost(1, 'private_ipc_output_failed', 'DESKTOP_IPC_WRITE_FAILED')
            : endHost(0, 'sidecar_shutdown'));
        } else {
          diagnosticEvent('response_ready', { action: message.action, outcome: 'ready', elapsed_ms: Date.now() - startedAt,
            recovery_requested: recoveryRequested });
          writeFrame(response);
        }
      } catch (error) {
        if (stopping) { endHost(1, 'private_ipc_output_failed', 'DESKTOP_IPC_WRITE_FAILED'); return; }
        const response = publicError(message.request_id, error);
        diagnosticEvent('response_ready', {
          action: message.action, outcome: 'failed', error_code: response.error_code,
          elapsed_ms: Date.now() - startedAt, recovery_requested: recoveryRequested
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
