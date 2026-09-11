'use strict';

const { VERSION } = require('./version');
const { RESOURCE_LIMITS } = require('./resource-limits');
const { schema: INTERACTION_SCHEMA, interactionForTool } = require('./cowork-interaction-contract');
const statusContract = require('./contracts/cowork-status.v1.json');

const STATUS_SCHEMA = 'datasecure-cowork-status/1';
const OUTCOMES = new Set(statusContract.outcomes);
const LOCAL_STATES = new Set(statusContract.local_work_states);
const RETRY_CLASSES = new Set(statusContract.retry_classes);
const CONTENT_BOUNDARIES = new Set(statusContract.content_boundaries);
const NEXT_ACTIONS = new Set(statusContract.next_actions);
const COUNT_KEYS = Object.freeze([
  'batch_total', 'released', 'stopped', 'remaining', 'processing',
  'deferred_review', 'mapping_pending', 'delivery_pending', 'available',
  'safely_stopped', 'still_open'
]);
const FORBIDDEN_NORMAL_KEYS = new Set([
  'batch_token', 'package_id', 'read_capability', 'cursor', 'next_cursor',
  'document_continuations'
]);
const CANCELLED_ERRORS = new Set([
  'local_selection_cancelled', 'request_cancelled', 'local_batch_start_cancelled'
]);
const CANCELLED_CAUSES = new Set([
  'LOCAL_SELECTION_CANCELLED', 'REQUEST_CANCELLED', 'LOCAL_IPC_ACK_CANCELLED',
  'LOCAL_COMPLETED_BATCH_SELECTION_CANCELLED'
]);

if (statusContract.schema !== STATUS_SCHEMA) throw new Error('Unsupported Cowork status contract.');

function diagnosticCause(result) {
  return typeof result?.diagnostic?.cause === 'string' ? result.diagnostic.cause : '';
}

function cancelled(result) {
  return CANCELLED_ERRORS.has(result?.error) || CANCELLED_CAUSES.has(diagnosticCause(result));
}

function hasContinuation(result) {
  return result?.more === true || result?.has_more === true ||
    (typeof result?.next_cursor === 'string' && result.next_cursor.length > 0) ||
    (Number.isSafeInteger(result?.still_open) && result.still_open > 0) ||
    (Array.isArray(result?.document_continuations) && result.document_continuations.length > 0) ||
    (Array.isArray(result?.documents) && result.documents.some((document) => document?.has_more === true));
}

function hasVerifiedContent(result) {
  if (result?.ok === false || result?.content_is_verified_anonymized_markdown !== true) return false;
  if (typeof result?.text === 'string') return true;
  return Array.isArray(result?.documents) && result.documents.some((document) =>
    document?.content_is_verified_anonymized_markdown === true && typeof document?.text === 'string');
}

function outcomeOf(result) {
  if (cancelled(result)) return 'cancelled';
  if (result?.ok === false || typeof result?.error === 'string') return 'stopped';
  if (result?.local_intake_pending === true || result?.local_processing_started === true ||
      result?.local_review_started === true || result?.accepted === true) return 'accepted';
  return 'completed';
}

function localWorkStateOf(result, outcome) {
  if (result?.review_required === true || result?.awaiting_review === true ||
      result?.batch_phase === 'awaiting_review') return 'awaiting_review';
  if (result?.local_review_started === true || result?.local_processing_started === true ||
      result?.processing === true || result?.batch_phase === 'processing_local_review') return 'active';
  if (result?.local_intake_pending === true || result?.accepted === true) return 'accepted';
  if (result?.complete === true || result?.completed === true || result?.done === true) return 'completed';
  if (cancelled(result)) return result?.error === 'local_selection_cancelled' ? 'not_started' : 'unknown';
  if (['no_completed_local_batch', 'no_active_local_handoff', 'local_handoff_expired']
    .includes(result?.error)) return 'not_applicable';
  if (['result_folder_required', 'local_selection_rejected', 'local_start_failed',
    'local_engine_unavailable'].includes(result?.error)) return 'not_started';
  if (outcome === 'stopped') return 'failed';
  return 'not_applicable';
}

function nextActionOf(result) {
  if (typeof result?.next_action === 'string') {
    if (!NEXT_ACTIONS.has(result.next_action)) {
      if (result?.ok === false || typeof result?.error === 'string') return 'no_action';
      throw new Error(`Unknown Cowork next action: ${result.next_action}`);
    }
    return result.next_action;
  }
  return hasContinuation(result) ? 'continue_local_results_handoff' : 'no_action';
}

function retryClassOf(outcome, nextAction) {
  if (outcome === 'completed' || outcome === 'accepted') return 'not_applicable';
  if (['choose_result_folder', 'choose_other_selection', 'complete_review_in_local_window',
    'review_local_decisions', 'local_mapping_repair', 'read_and_confirm_result']
    .includes(nextAction)) return 'user_action_required';
  if (['restart_only_on_explicit_request', 'resume_batch'].includes(nextAction)) return 'explicit_request';
  if (nextAction.startsWith('wait_') || nextAction.startsWith('check_')) return 'wait_or_inspect';
  return 'not_retryable';
}

function safeCounts(result) {
  const sources = [result, result?.batch].filter((value) => value && typeof value === 'object');
  const counts = {};
  for (const key of COUNT_KEYS) {
    const value = sources.find((source) => Object.hasOwn(source, key))?.[key];
    if (Number.isSafeInteger(value) && value >= 0 && value <= RESOURCE_LIMITS.MAX_BATCH_FILES) counts[key] = value;
  }
  const retryable = sources.find((source) => Object.hasOwn(source, 'retryable'))?.retryable;
  if (Number.isSafeInteger(retryable) && retryable >= 0 && retryable <= RESOURCE_LIMITS.MAX_BATCH_FILES) {
    counts.retryable_items = retryable;
  }
  return Object.keys(counts).length ? counts : undefined;
}

function assertNormalResponseBoundary(value, path = '$', seen = new Set()) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNormalResponseBoundary(entry, `${path}[${index}]`, seen));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_NORMAL_KEYS.has(key)) throw new Error(`Private Cowork field crossed normal boundary at ${path}.${key}`);
    assertNormalResponseBoundary(nested, `${path}.${key}`, seen);
  }
}

function validateStatus(status) {
  const allowed = new Set([
    'schema', 'interaction_schema', 'gateway_version', 'operation', 'surface', 'phase',
    'outcome', 'interaction_terminal', 'local_work_state', 'next_action', 'retry_class',
    'content_boundary', 'original_content_sent_to_claude', 'content_trust',
    'embedded_instructions_authorized', 'human_gate_assurance', 'user_status', 'safe_counts'
  ]);
  if (!status || Object.keys(status).some((key) => !allowed.has(key)) || status.schema !== STATUS_SCHEMA ||
      status.interaction_schema !== INTERACTION_SCHEMA || !OUTCOMES.has(status.outcome) ||
      !LOCAL_STATES.has(status.local_work_state) || !RETRY_CLASSES.has(status.retry_class) ||
      !CONTENT_BOUNDARIES.has(status.content_boundary) || !NEXT_ACTIONS.has(status.next_action) ||
      typeof status.interaction_terminal !== 'boolean' || status.original_content_sent_to_claude !== false ||
      status.embedded_instructions_authorized !== false) throw new Error('Invalid Cowork status envelope.');
  if (status.user_status !== undefined && (typeof status.user_status !== 'string' || status.user_status.length > 2000)) {
    throw new Error('Invalid Cowork user status.');
  }
  return status;
}

function withCoworkStatus(operation, result, options = {}) {
  const interaction = interactionForTool(operation);
  if (!interaction) throw new Error(`Unknown Cowork operation: ${operation}`);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid Cowork result.');
  if (result.raw_content_sent_to_claude === true || result.original_content_sent_to_claude === true) {
    throw new Error('Original content crossed the Cowork boundary.');
  }
  if (interaction.surface === 'normal' && options.supportMode !== true) assertNormalResponseBoundary(result);
  const outcome = outcomeOf(result);
  const nextAction = nextActionOf(result);
  const verifiedContent = hasVerifiedContent(result);
  const counts = safeCounts(result);
  const userStatus = interaction.surface === 'normal' && typeof result.user_status === 'string'
    ? result.user_status : undefined;
  const status = validateStatus({
    schema: STATUS_SCHEMA,
    interaction_schema: INTERACTION_SCHEMA,
    gateway_version: VERSION,
    operation,
    surface: interaction.surface,
    phase: interaction.phase,
    outcome,
    interaction_terminal: interaction.success_disposition !== 'continue_if_requested' || !hasContinuation(result),
    local_work_state: localWorkStateOf(result, outcome),
    next_action: nextAction,
    retry_class: retryClassOf(outcome, nextAction),
    content_boundary: verifiedContent ? 'verified_anonymized_markdown' : 'metadata_only',
    original_content_sent_to_claude: false,
    content_trust: verifiedContent ? 'untrusted_document_data' : 'none',
    embedded_instructions_authorized: false,
    human_gate_assurance: interaction.gate_assurance,
    ...(userStatus !== undefined ? { user_status: userStatus } : {}),
    ...(counts ? { safe_counts: counts } : {})
  });
  return { ...result, cowork_status: Object.freeze(status) };
}

module.exports = Object.freeze({
  STATUS_SCHEMA,
  withCoworkStatus,
  validateStatus,
  hasContinuation,
  hasVerifiedContent,
  assertNormalResponseBoundary
});
