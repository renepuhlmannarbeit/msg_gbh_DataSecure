'use strict';

// Content-free diagnostic envelope for tool responses. When a local start or
// continuation fails, Cowork used to see only a generic sentence; the actual
// cause existed solely in the local workflow journal. Every error response now
// carries `diagnostic`: the running gateway version, the phase that stopped, a
// fixed cause code from this closed list, a fixed German hint for that code, a
// timestamp and whether the local journal recorded the event. Nothing here may
// ever be derived from paths, file names, hashes, tokens or native error text;
// unknown causes collapse to INTERNAL_FAILURE.

const { VERSION } = require('../version');

const PHASES = Object.freeze([
  'result_folder', 'source_picker', 'folder_enumeration', 'engine', 'reservation',
  'intake_spawn', 'intake_ack', 'handoff', 'continuation', 'folder_open', 'review',
  'dispatch'
]);

const CAUSES = Object.freeze({
  NONE: 'Kein Fehler.',
  LOCAL_SELECTION_CANCELLED: 'Die lokale Auswahl wurde im Dialog abgebrochen. Kein Stapel wurde gestartet.',
  LOCAL_SELECTION_REJECTED: 'DataSecure hat die gewählte Datei oder den Ordner bewusst abgelehnt (etwa nicht freigegebene Formate, Ergebnisordner oder Link). Andere Auswahl treffen; kein Fehler des lokalen Dienstes.',
  LOCAL_PICKER_UNAVAILABLE: 'Auf diesem Gerät steht kein unterstützter lokaler Auswahldialog zur Verfügung. IT prüfen lassen (PowerShell/Windows Forms).',
  LOCAL_PICKER_TIMEOUT: 'Der lokale Auswahldialog blieb zu lange ohne Entscheidung offen und wurde beendet. Auswahl erneut starten.',
  LOCAL_PICKER_FAILED: 'Der lokale Auswahldialog konnte nicht gestartet oder nicht sicher gelesen werden. Claude Desktop vollständig neu starten; bleibt es, IT einbeziehen.',
  RESULT_FOLDER_REQUIRED: 'Der Ergebnisordner wurde nicht sicher übernommen. Die einmalige Ordnerwahl erscheint beim nächsten Start erneut.',
  ENGINE_NOT_READY: 'Die lokale Verarbeitung ist nicht bereit (Audit-Migration, Speicherort oder native Parsergrenze). Nur im Supportmodus näher diagnostizierbar.',
  BATCH_ACTIVE: 'Eine lokale Auswahl, Übernahme oder Verarbeitung ist bereits aktiv. Warten oder den offenen Stapel ausdrücklich fortsetzen beziehungsweise verwerfen.',
  LOCAL_WORKER_SPAWN_FAILED: 'Der lokale Verarbeitungsprozess konnte nicht gestartet werden (gebündeltes Runtime oder Prozessstart). Neu starten; bleibt es, IT einbeziehen.',
  LOCAL_IPC_ACK_TIMEOUT: 'Der lokale Verarbeitungsprozess hat die Übernahme nicht rechtzeitig bestätigt. Der tatsächliche Verarbeitungsstand ist unbestätigt; bitte den Status prüfen und nur auf ausdrücklichen Wunsch fortsetzen.',
  LOCAL_IPC_ACK_CANCELLED: 'Das Warten auf die lokale Übernahmebestätigung wurde vom Host abgebrochen. Der tatsächliche Verarbeitungsstand ist unbestätigt; bitte den Status prüfen und nur auf ausdrücklichen Wunsch fortsetzen.',
  LOCAL_QUEUE_SCHEMA_INVALID: 'Die interne lokale Dateiliste war unvollständig oder widersprüchlich. Es wurde kein Stapel bestätigt; DataSecure aktualisieren oder den Supportbericht öffnen.',
  LOCAL_BATCH_STILL_PROCESSING: 'Die lokale Verarbeitung läuft noch. Ergebnisse stehen erst nach dem lokalen Abschluss bereit.',
  LOCAL_HANDOFF_ACTIVE: 'Eine andere lokale DataSecure-Auswahl oder Übergabe ist bereits geöffnet.',
  NO_INCOMPLETE_BATCH: 'Es liegt kein unvollständiger Stapel zum Fortsetzen oder Verwerfen vor.',
  NO_COMPLETED_LOCAL_BATCH: 'Es liegt kein lokal abgeschlossener Stapel zur Auswertung vor. Erst eine Verarbeitung lokal abschließen lassen.',
  NO_ACTIVE_LOCAL_HANDOFF: 'Es ist keine lokale Ergebnisübergabe aktiv. Zuerst die Auswertung abgeschlossener Ergebnisse starten.',
  LOCAL_HANDOFF_EXPIRED: 'Die lokale Ergebnisübergabe ist abgelaufen. Die Auswertung erneut starten; Ergebnisse bleiben lokal erhalten.',
  FOLDER_OPEN_FAILED: 'Der lokale Ordner konnte nicht im Dateimanager geöffnet werden. Ordner manuell öffnen; Ergebnisse sind davon unberührt.',
  BATCH_REVIEW_NOT_READY: 'Die lokale Prüfung ist für diesen Stapel noch nicht bereit oder nicht rekonstruierbar. Nur im Supportmodus näher diagnostizierbar.',
  BATCH_NOT_RUNNABLE: 'Der Stapel kann in seinem aktuellen Zustand nicht fortgesetzt werden. Verwerfen oder im Supportmodus prüfen.',
  REQUEST_CANCELLED: 'Die Anfrage wurde vom Host abgebrochen.',
  MCP_ARGUMENT_INVALID: 'Die Werkzeugargumente entsprechen nicht dem veröffentlichten Schema. Es wurde keine Aktion ausgeführt; der Host muss die Anfrage korrigieren.',
  INTERNAL_FAILURE: 'Ein interner Fehler wurde sicher abgefangen; es wurde nichts freigegeben. Details stehen nur in der lokalen Diagnose (Supportmodus).'
});

const CAUSE_CODES = Object.freeze(Object.keys(CAUSES));

// One fixed vocabulary for lifecycle diagnostics and their support mirror.
// Worker/converter-only codes do not become public causes or public hints.
const conversionContract = require('../standalone/conversion-worker-contract');
const WORKFLOW_ERROR_CODES = Object.freeze([...new Set([
  ...CAUSE_CODES, ...conversionContract.ERROR_CODES, ...conversionContract.LIFECYCLE_ERROR_CODES,
  'PROCESSING_MODE_INVALID', 'PROCESSING_MODE_FORBIDDEN', 'PRODUCT_CHANNEL_INVALID',
  'BATCH_PROCESSING_MODE_CHANGED', 'BATCH_MARKDOWN_STATE_INVALID', 'RECOVERY_FAILED',
  'LOCAL_IPC_FAILED', 'LOCAL_WORKER_EXITED', 'LOCAL_NOTICE_FAILED',
  'LOCAL_REVIEW_FAILED', 'LOCAL_REVIEW_TIMEOUT', 'LOCAL_REVIEW_CANCELLED', 'LOCAL_REVIEW_DEFERRED', 'LOCAL_REVIEW_TOO_LARGE',
  'LOCAL_REVIEW_WORKER_EXITED', 'LOCAL_REVIEW_BUSY', 'LOCAL_REVIEW_RELEASE_FAILED',
  'UNSAFE_STORAGE_LOCATION', 'STARTUP_RECOVERY_FAILED', 'STARTUP_OUTBOX_RECOVERY_FAILED',
  'STARTUP_MIGRATION_FAILED', 'STARTUP_CLEANUP_FAILED', 'RUNTIME_INTEGRITY_FAILED', 'STARTUP_FAILED'
])]);
const SUPPORT_ERROR_CODES = Object.freeze([...new Set([
  ...WORKFLOW_ERROR_CODES,
  'INVALID_JSON', 'RPC_FRAME_TOO_LARGE', 'SUPPORT_MODE_REQUIRED', 'TOOL_RETURNED_STOP',
  'CONVERTER_NOT_RELEASED', 'CONVERTER_INPUT_INVALID', 'CONVERTER_RUNTIME_INVALID',
  'CONVERTER_TIMEOUT', 'CONVERTER_OUTPUT_TOO_LARGE', 'CONVERTER_RUNTIME_FAILED',
  'CONVERTER_FAILED', 'CONVERTER_OUTPUT_INVALID', 'STANDALONE_ARGUMENT_INVALID',
  'STANDALONE_BUSY', 'STANDALONE_ENGINE_NOT_READY', 'STANDALONE_SELECTION_CANCELLED',
  'STANDALONE_START_FAILED', 'STANDALONE_RESULT_ROOT_UNSAFE'
])]);

// Only an explicitly code-free legacy adapter may use these exact historical
// messages. Native/free-form text and unknown codes never select an ACK cause.
const LEGACY_IPC_ACK_CAUSES = Object.freeze({
  'bounded IPC acknowledgement timeout': 'LOCAL_IPC_ACK_TIMEOUT',
  'IPC acknowledgement cancelled': 'LOCAL_IPC_ACK_CANCELLED'
});
function ipcAcknowledgementCause(error, options = {}) {
  const code = error?.code;
  if (code === 'LOCAL_IPC_ACK_TIMEOUT' || code === 'LOCAL_IPC_ACK_CANCELLED') return code;
  if (options.allowQueueSchemaInvalid === true && code === 'LOCAL_QUEUE_SCHEMA_INVALID') return code;
  if (code === undefined && options.allowLegacyMessages === true &&
      typeof error?.message === 'string' && Object.hasOwn(LEGACY_IPC_ACK_CAUSES, error.message)) {
    return LEGACY_IPC_ACK_CAUSES[error.message];
  }
  return 'LOCAL_WORKER_SPAWN_FAILED';
}

function normalizeCause(code) {
  const value = String(code || '').toUpperCase();
  return Object.hasOwn(CAUSES, value) ? value : 'INTERNAL_FAILURE';
}

function normalizePhase(phase) {
  return PHASES.includes(phase) ? phase : 'dispatch';
}

function boundedCount(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? Math.min(number, 100) : undefined;
}

// `recorded` should be the boolean result of recordWorkflowEvent(); it tells
// the reader whether the local content-free journal holds the same event.
function buildDiagnostic({ phase, cause, recorded, counts, now } = {}) {
  const code = normalizeCause(cause);
  const diagnostic = {
    gateway_version: VERSION,
    phase: normalizePhase(phase),
    cause: code,
    hint: CAUSES[code],
    at: (now instanceof Date ? now : new Date()).toISOString(),
    recorded: recorded === true
  };
  if (counts && typeof counts === 'object') {
    const total = boundedCount(counts.total);
    const rejected = boundedCount(counts.rejected);
    if (total !== undefined) diagnostic.files_total = total;
    if (rejected !== undefined) diagnostic.files_rejected = rejected;
  }
  return diagnostic;
}

// Maps an error thrown by a picker or executor to a cause code without ever
// exposing its text: only known fixed codes pass, everything else is internal.
function causeFromError(error, fallback = 'INTERNAL_FAILURE') {
  const code = String(error?.code || '').toUpperCase();
  if (Object.hasOwn(CAUSES, code)) return code;
  return normalizeCause(fallback);
}

// Maps the fixed `error` key of an ok:false tool result to its phase and cause.
// Used as the last line of defence in the tools/call handler so that every
// error answer of every tool carries a diagnostic, even when the producing
// gateway module knows nothing about the envelope. Unknown keys stay generic.
const ERROR_KEY_DIAGNOSTICS = Object.freeze({
  invalid_tool_arguments: ['dispatch', 'MCP_ARGUMENT_INVALID'],
  local_selection_cancelled: ['source_picker', 'LOCAL_SELECTION_CANCELLED'],
  local_selection_rejected: ['folder_enumeration', 'LOCAL_SELECTION_REJECTED'],
  local_start_failed: ['source_picker', 'LOCAL_PICKER_FAILED'],
  result_folder_required: ['result_folder', 'RESULT_FOLDER_REQUIRED'],
  local_engine_unavailable: ['engine', 'ENGINE_NOT_READY'],
  batch_active: ['reservation', 'BATCH_ACTIVE'],
  local_batch_still_processing: ['handoff', 'LOCAL_BATCH_STILL_PROCESSING'],
  local_handoff_active: ['handoff', 'LOCAL_HANDOFF_ACTIVE'],
  no_completed_local_batch: ['handoff', 'NO_COMPLETED_LOCAL_BATCH'],
  no_active_local_handoff: ['handoff', 'NO_ACTIVE_LOCAL_HANDOFF'],
  local_handoff_expired: ['handoff', 'LOCAL_HANDOFF_EXPIRED'],
  no_incomplete_batch: ['continuation', 'NO_INCOMPLETE_BATCH'],
  batch_review_not_ready: ['review', 'BATCH_REVIEW_NOT_READY'],
  batch_not_runnable: ['continuation', 'BATCH_NOT_RUNNABLE'],
  request_cancelled: ['dispatch', 'REQUEST_CANCELLED'],
  processing_stopped: ['dispatch', 'INTERNAL_FAILURE']
});

function diagnosticForErrorKey(errorKey) {
  const key = String(errorKey || '');
  const entry = Object.hasOwn(ERROR_KEY_DIAGNOSTICS, key) ? ERROR_KEY_DIAGNOSTICS[key] : null;
  return entry ? { phase: entry[0], cause: entry[1] } : { phase: 'dispatch', cause: 'INTERNAL_FAILURE' };
}

// A folder-open failure has no `error` key; the response is completed here.
function completeDiagnostic(response) {
  if (!response || typeof response !== 'object' || response.ok !== false) return response;
  if (response.diagnostic || response.error === 'input_empty' || response.error === 'input_position_empty') return response;
  const mapped = response.error === undefined ? { phase: 'folder_open', cause: 'FOLDER_OPEN_FAILED' } : diagnosticForErrorKey(response.error);
  return { ...response, diagnostic: buildDiagnostic({ phase: mapped.phase, cause: mapped.cause, recorded: false }) };
}

module.exports = { PHASES, CAUSES, CAUSE_CODES, WORKFLOW_ERROR_CODES, SUPPORT_ERROR_CODES, ERROR_KEY_DIAGNOSTICS,
  buildDiagnostic, causeFromError, ipcAcknowledgementCause, normalizeCause, diagnosticForErrorKey, completeDiagnostic };
