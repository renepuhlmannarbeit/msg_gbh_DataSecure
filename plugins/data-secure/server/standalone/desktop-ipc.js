'use strict';

const { validateProcessingMode } = require('../core/processing-mode');
const { assertLegacyContentOperation } = require('../core/content-options');
const { assertContentStartOwner, contentStartOptions } = require('../gateway/content-start-boundary');
const { validateResultNamingMode } = require('../core/result-naming-mode');
const { RESOURCE_LIMITS } = require('../resource-limits');
const { MAX_STANDALONE_REVIEW_FINDINGS, REVIEW_DECISIONS } = require('../gateway/standalone-review-budget');
const { MAX_CONTACTS, MAX_VALUE_CHARS } = require('../core/ocr-contact-review');

const MAX_FRAME_BYTES = 1024 * 1024;
const MAX_ADMISSION_PATH_BYTES = 768 * 1024;
const MAX_SINGLE_PATH_BYTES = 32767;
const MAX_PRESENTATION_GENERATION = Number.MAX_SAFE_INTEGER;
const PRIVATE_ACTIONS = new Set([
  'admit_selected_sources', 'remove_admitted_source', 'cancel_admission', 'start_admitted_batch',
  'get_public_state', 'get_ui_context', 'ack_terminal_presented', 'continue_current_batch', 'configure_results',
  'resolve_current_results', 'resolve_local_ledger', 'get_run_history',
  'get_run_failures',
  'resolve_history_results', 'resolve_history_ledger', 'resolve_history_identity_mapping',
  'resolve_identity_mappings_directory',
  'continue_history_batch', 'pause_batch', 'skip_ocr_contact_review', 'abandon_result_export',
  'get_document_reviews', 'get_document_review_history_summary', 'get_document_review_chunk', 'get_document_entities', 'decide_document_review', 'decide_document_review_batch', 'preview_document_export', 'export_approved_documents', 'abandon_document_export', 'resolve_document_export', 'resolve_document_identity_overview',
  'get_review_session', 'get_review_chunk', 'submit_review', 'continue_review_session', 'shutdown'
]);

function validDecisionShape(item) {
  if (!item || typeof item.ambiguity_id !== 'string' || item.ambiguity_id.length > 80) return false;
  const keys = Object.keys(item).sort().join(',');
  // This is the transport shape only. The broker MUST still check the owned,
  // active draft: contact actions are never accepted for an entity review.
  if (item.decision === 'confirm_contact' || item.decision === 'correct_contact') {
    if (!/^ocr-contact:v1:[0-9]{6}$/u.test(item.ambiguity_id)) return false;
    return item.decision === 'confirm_contact' ? keys === 'ambiguity_id,decision' :
      keys === 'ambiguity_id,decision,replacement' && typeof item.replacement === 'string' &&
      item.replacement.length > 0 && item.replacement.length <= MAX_VALUE_CHARS &&
      !/[\p{Cc}\p{Cf}\p{Cs}\[\]`<>|]/u.test(item.replacement);
  }
  return keys === 'ambiguity_id,decision' && REVIEW_DECISIONS.includes(item.decision);
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function validatePrivateMessage(message) {
  assertContentStartOwner(message);
  if (!message || message.schema !== 'datasecure-standalone-private-ipc/1')
    fail('DESKTOP_IPC_SCHEMA_INVALID', 'Ungültige Desktop-Nachricht.');
  if (typeof message.request_id !== 'string' || !/^[a-f0-9]{16,64}$/u.test(message.request_id))
    fail('DESKTOP_IPC_REQUEST_INVALID', 'Ungültige Desktop-Anfragekennung.');
  if (!PRIVATE_ACTIONS.has(message.action))
    fail('DESKTOP_IPC_ACTION_INVALID', 'Unbekannte Desktop-Aktion.');
  const allowedFields = new Set(['schema', 'request_id', 'action']);
  if (message.action === 'get_run_history' && Object.hasOwn(message, 'recover_exports')) {
    allowedFields.add('recover_exports');
    allowedFields.add('recover_batch_id');
    if (message.recover_exports !== true || !/^[a-f0-9]{64}$/u.test(message.recover_batch_id || ''))
      fail('DESKTOP_IPC_FIELD_INVALID', 'Ungültige Ergebnisabgleich-Anfrage.');
  }
  if (message.action === 'start_admitted_batch') {
    if (contentStartOptions(message, 'content_options', 'standalone')) allowedFields.add('content_options');
  } else assertLegacyContentOperation(message, 'content_options', 'standalone', 'resume');
  if (['resolve_history_results', 'resolve_history_ledger', 'resolve_history_identity_mapping',
    'continue_history_batch', 'pause_batch', 'skip_ocr_contact_review', 'abandon_result_export', 'get_document_reviews', 'get_document_review_history_summary', 'get_document_review_chunk', 'get_document_entities',
    'decide_document_review', 'decide_document_review_batch', 'preview_document_export', 'export_approved_documents', 'abandon_document_export', 'resolve_document_export', 'resolve_document_identity_overview'].includes(message.action)) {
    allowedFields.add('batch_id');
    if (typeof message.batch_id !== 'string' || !/^[a-f0-9]{64}$/u.test(message.batch_id))
      fail('STANDALONE_HISTORY_INVALID', 'Ungültige lokale Laufkennung.');
  }
  if (message.action === 'get_run_failures' && Object.hasOwn(message, 'batch_id')) {
    allowedFields.add('batch_id');
    if (typeof message.batch_id !== 'string' || !/^[a-f0-9]{64}$/u.test(message.batch_id))
      fail('STANDALONE_HISTORY_INVALID', 'Ungültige lokale Laufkennung.');
  }
  if (message.action === 'start_admitted_batch') {
    if (Object.hasOwn(message, 'document_review')) {
      allowedFields.add('document_review');
      if (message.document_review !== true)
        fail('DOCUMENT_REVIEW_INVALID', 'Ungültiger Dokumentprüfauftrag.');
    }
    if (Object.hasOwn(message, 'source_ids') || Object.hasOwn(message, 'catalogue_revision')) {
      allowedFields.add('source_ids'); allowedFields.add('catalogue_revision');
      if (!Number.isSafeInteger(message.catalogue_revision) || message.catalogue_revision < 0 ||
          !Array.isArray(message.source_ids) || message.source_ids.length < 1 || message.source_ids.length > 200 ||
          new Set(message.source_ids).size !== message.source_ids.length ||
          !message.source_ids.every(id => typeof id === 'string' && /^[a-f0-9]{32}$/u.test(id)))
        fail('STANDALONE_SELECTION_INVALID', 'Ungültige Quellenkatalog-Auswahl.');
    }
    allowedFields.add('processing_mode');
    validateProcessingMode(message.processing_mode, 'standalone');
    if (Object.hasOwn(message, 'review_policy')) {
      allowedFields.add('review_policy');
      require('../core/standalone-review-policy').validateReviewPolicy(message.review_policy, {
        productChannel: 'standalone', processingMode: message.processing_mode,
        documentReview: message.document_review, contentOptions: message.content_options });
    }
    if (Object.hasOwn(message, 'ocr_contact_review')) {
      allowedFields.add('ocr_contact_review');
      if (message.processing_mode !== 'markdown-only' || message.ocr_contact_review !== true)
        fail('OCR_CONTACT_REVIEW_INVALID', 'OCR-Kontaktkorrektur ist eine ausdrückliche Option der reinen Konvertierung.');
    }
    if (message.processing_mode === 'markdown-and-anonymize') {
      allowedFields.add('output_naming_mode');
      validateResultNamingMode(message.output_naming_mode, 'standalone');
    } else if (Object.hasOwn(message, 'output_naming_mode')) {
      fail('RESULT_NAMING_MODE_INVALID', 'Für reine Konvertierung ist keine Ergebnisbenennung zulässig.');
    }
  }
  if (['get_document_review_chunk', 'get_document_entities', 'decide_document_review'].includes(message.action)) {
    allowedFields.add('document_id');
    if (typeof message.document_id !== 'string' || !/^[a-f0-9]{32}$/u.test(message.document_id))
      fail('DOCUMENT_REVIEW_INVALID', 'Ungültige Dokumentkennung.');
  }
  if (message.action === 'get_document_entities') {
    allowedFields.add('revision'); allowedFields.add('page');
    if (!Number.isSafeInteger(message.revision) || message.revision < 0 || message.revision > 10000 ||
        !Number.isSafeInteger(message.page) || message.page < 0 || message.page > 10000)
      fail('DOCUMENT_ENTITY_INVALID', 'Ungültiger Entitätenabschnitt.');
  }
  if (message.action === 'get_document_review_chunk') {
    allowedFields.add('revision'); allowedFields.add('chunk_index');
    if (!Number.isSafeInteger(message.revision) || message.revision < 0 || message.revision > 10000 ||
        !Number.isSafeInteger(message.chunk_index) || message.chunk_index < 0 || message.chunk_index > 1024)
      fail('DOCUMENT_REVIEW_INVALID', 'Ungültiger Dokumentabschnitt.');
  }
  if (message.action === 'decide_document_review_batch') {
    allowedFields.add('decision');
    const value = message.decision;
    if (!value || Object.keys(value).sort().join(',') !== 'action,operation_id,selection' ||
        !['approve', 'revoke'].includes(value.action) || !/^[a-f0-9]{32}$/u.test(value.operation_id || '') ||
        !Array.isArray(value.selection) || value.selection.length < 1 || value.selection.length > 200 ||
        value.selection.some(row => !row || Object.keys(row).sort().join(',') !== 'document_id,output_sha256,revision' ||
          !/^[a-f0-9]{32}$/u.test(row.document_id || '') || !/^[a-f0-9]{64}$/u.test(row.output_sha256 || '') ||
          !Number.isSafeInteger(row.revision) || row.revision < 0 || row.revision >= 1000) ||
        new Set(value.selection.map(row => row.document_id)).size !== value.selection.length)
      fail('DOCUMENT_REVIEW_INVALID', 'Ungültige gemeinsame Dokumententscheidung.');
  }
  if (message.action === 'decide_document_review') {
    allowedFields.add('decision');
    const value = message.decision;
    if (!value || Object.keys(value).sort().join(',') !== (value.action === 'entities' ?
        `action,entity_decisions,operation_id,output_sha256,ranges,revision${Object.hasOwn(value, 'scope') ? ',scope' : ''}` : 'action,operation_id,output_sha256,ranges,revision') ||
        Object.hasOwn(value, 'scope') && !['document', 'run'].includes(value.scope) ||
        !['approve', 'revoke', 'redact', 'restore_base', 'correct', 'entities'].includes(value.action) ||
        !/^[a-f0-9]{32}$/u.test(value.operation_id || '') || !/^[a-f0-9]{64}$/u.test(value.output_sha256 || '') ||
        !Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision > 10000 ||
        !Array.isArray(value.ranges) || value.ranges.length > 500 || value.ranges.some(range => !range ||
          Object.keys(range).sort().join(',') !== (value.action === 'correct' ? 'end,replacement,start' : 'end,start') || !Number.isSafeInteger(range.start) ||
          !Number.isSafeInteger(range.end) || range.start < 0 || range.end < range.start ||
          (value.action !== 'correct' && range.end === range.start) || range.end > 8 * 1024 * 1024 ||
          (value.action === 'correct' && (value.ranges.length !== 1 || typeof range.replacement !== 'string' ||
            range.replacement.length > 32768 || !range.replacement.isWellFormed() || range.replacement.includes('\u0000')))))
      fail('DOCUMENT_REVIEW_INVALID', 'Ungültige Dokumententscheidung.');
    if (value.action === 'entities' && (value.ranges.length !== 0 || !Array.isArray(value.entity_decisions) ||
        !value.entity_decisions.length || value.entity_decisions.length > 500 ||
        new Set(value.entity_decisions.map(row => row?.entity_id)).size !== value.entity_decisions.length ||
        value.entity_decisions.some(row => !row || Object.keys(row).sort().join(',') !== 'decision,entity_id' ||
          !/^entity_[0-9]{6}$/u.test(row.entity_id || '') || !['default', 'keep', 'person', 'organization'].includes(row.decision))))
      fail('DOCUMENT_ENTITY_INVALID', 'Ungültige Entitätenentscheidung.');
  }
  if (['preview_document_export', 'export_approved_documents'].includes(message.action)) {
    if (Object.hasOwn(message, 'acknowledge')) {
      allowedFields.add('acknowledge');
      if (message.acknowledge !== true || message.action === 'preview_document_export') fail('AI_EXPORT_INVALID', 'Ungültige Exportbestätigung.');
    }
    allowedFields.add('operation_id'); allowedFields.add('selection');
    if (!/^[a-f0-9]{32}$/u.test(message.operation_id || '') || !Array.isArray(message.selection) ||
        !message.selection.length || message.selection.length > 200 || new Set(message.selection.map(row => row.document_id)).size !== message.selection.length ||
        message.selection.some(row => !row || Object.keys(row).sort().join(',') !== 'document_id,output_sha256,revision' ||
          !/^[a-f0-9]{32}$/u.test(row.document_id || '') || !/^[a-f0-9]{64}$/u.test(row.output_sha256 || '') ||
          !Number.isSafeInteger(row.revision) || row.revision < 0 || row.revision > 10000))
      fail('AI_EXPORT_INVALID', 'Ungültige Exportauswahl.');
  }
  if (message.action === 'abandon_document_export') {
    allowedFields.add('operation_id'); allowedFields.add('digest');
    if (!/^[a-f0-9]{32}$/u.test(message.operation_id || '') || !/^[a-f0-9]{64}$/u.test(message.digest || ''))
      fail('AI_EXPORT_INVALID', 'Ungültiger Exportverzicht.');
  }
  if (message.action === 'resolve_document_export') {
    allowedFields.add('operation_id');
    if (!/^[a-f0-9]{32}$/u.test(message.operation_id || '')) fail('AI_EXPORT_INVALID', 'Ungültiger Exportbeleg.');
  }
  if (message.action === 'resolve_document_identity_overview' && Object.hasOwn(message, 'operation_id')) {
    allowedFields.add('operation_id');
    if (!/^[a-f0-9]{32}$/u.test(message.operation_id || '')) fail('AI_EXPORT_INVALID', 'Ungültiger Zuordnungsbeleg.');
  }
  if (message.action === 'remove_admitted_source') {
    allowedFields.add('selection_index');
    if (!Number.isSafeInteger(message.selection_index) || message.selection_index < 0 ||
        message.selection_index >= RESOURCE_LIMITS.MAX_BATCH_FILES)
      fail('DESKTOP_IPC_SELECTION_INDEX_INVALID', 'Ungültige Auswahlposition.');
  }
  if (message.action === 'ack_terminal_presented') {
    allowedFields.add('presentation_generation');
    if (!Number.isSafeInteger(message.presentation_generation) || message.presentation_generation < 1 ||
        message.presentation_generation > MAX_PRESENTATION_GENERATION)
      fail('DESKTOP_IPC_PRESENTATION_GENERATION_INVALID', 'Ungültige Darstellungskennung.');
  }
  if (message.action === 'get_review_chunk' || message.action === 'submit_review') {
    allowedFields.add('review_id');
    if (typeof message.review_id !== 'string' || !/^[a-f0-9]{32}$/u.test(message.review_id))
      fail('DESKTOP_IPC_REVIEW_INVALID', 'Ungültige lokale Prüfkennung.');
    if (message.action === 'get_review_chunk') {
      allowedFields.add('chunk_index');
      if (!Number.isSafeInteger(message.chunk_index) || message.chunk_index < 0 || message.chunk_index > 319)
        fail('DESKTOP_IPC_REVIEW_INVALID', 'Ungültiger lokaler Prüfabschnitt.');
    } else {
      allowedFields.add('answer');
      const answer = message.answer;
      if (!answer || typeof answer !== 'object' || Array.isArray(answer) ||
          !['deferred', 'reviewed', 'skipped'].includes(answer.action) ||
          (['deferred', 'skipped'].includes(answer.action) && Object.keys(answer).sort().join(',') !== 'action') ||
          (answer.action === 'reviewed' && (Object.keys(answer).sort().join(',') !== 'action,decisions,redactions' ||
            !Array.isArray(answer.decisions) || answer.decisions.length > MAX_STANDALONE_REVIEW_FINDINGS ||
            !answer.decisions.every(validDecisionShape) ||
            (answer.decisions.some(item => ['confirm_contact', 'correct_contact'].includes(item.decision)) &&
              (answer.decisions.length > MAX_CONTACTS || !answer.decisions.every(item =>
                ['confirm_contact', 'correct_contact'].includes(item.decision)))) ||
            !Array.isArray(answer.redactions) || answer.redactions.length !== 0)))
        fail('DESKTOP_IPC_REVIEW_INVALID', 'Ungültige lokale Prüfentscheidung.');
    }
  }
  if (message.action === 'admit_selected_sources' || message.action === 'configure_results') {
    allowedFields.add('source_paths');
    if (message.action === 'configure_results' && Object.hasOwn(message, 'native_export_binding')) {
      allowedFields.add('native_export_binding');
      if (message.native_export_binding !== true) fail('DESKTOP_IPC_FIELD_INVALID', 'Ungültige native Ergebnisbindung.');
    }
    if (message.action === 'admit_selected_sources') {
      allowedFields.add('source_kind');
      allowedFields.add('source_catalogue');
      if (!['files', 'folder'].includes(message.source_kind))
        fail('DESKTOP_IPC_SOURCE_KIND_INVALID', 'Ungültige Art der lokalen Auswahl.');
      if (Object.hasOwn(message, 'source_catalogue') && typeof message.source_catalogue !== 'boolean')
        fail('DESKTOP_IPC_SOURCE_KIND_INVALID', 'Ungültiger lokaler Quellenkatalog.');
    }
    if (!Array.isArray(message.source_paths) || message.source_paths.length < 1 ||
        message.source_paths.length > RESOURCE_LIMITS.MAX_BATCH_FILES)
      fail('DESKTOP_IPC_SOURCE_COUNT_INVALID', 'Ungültige Anzahl ausgewählter Quellen.');
    if ((message.source_kind === 'folder' || message.action === 'configure_results') && message.source_paths.length !== 1)
      fail('DESKTOP_IPC_SOURCE_COUNT_INVALID', 'Eine Ordnerauswahl muss genau einen Ordner enthalten.');
    if (message.source_paths.some((value) => typeof value !== 'string' || value.length < 1 ||
        Buffer.byteLength(value, 'utf8') > MAX_SINGLE_PATH_BYTES))
      fail('DESKTOP_IPC_SOURCE_INVALID', 'Ungültige lokale Quelle.');
    const pathBytes = message.source_paths.reduce((total, value) => total + Buffer.byteLength(value, 'utf8'), 0);
    if (pathBytes > MAX_ADMISSION_PATH_BYTES)
      fail('DESKTOP_IPC_SOURCE_BYTES_INVALID', 'Die lokale Quellauswahl ist zu groß.');
  } else if (Object.hasOwn(message, 'source_paths') || Object.hasOwn(message, 'source_kind')) {
    fail('DESKTOP_IPC_SOURCE_UNEXPECTED', 'Quellen sind für diese Aktion nicht zulässig.');
  }
  if (Object.keys(message).some((field) => !allowedFields.has(field)))
    fail('DESKTOP_IPC_FIELD_INVALID', 'Unerlaubtes Feld in Desktop-Nachricht.');
  return message;
}

function encodeFrame(message) {
  const payload = Buffer.from(JSON.stringify(validatePrivateMessage(message)), 'utf8');
  if (payload.length > MAX_FRAME_BYTES) fail('DESKTOP_IPC_FRAME_TOO_LARGE', 'Desktop-Nachricht ist zu groß.');
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

class FrameDecoder {
  constructor({ validate = validatePrivateMessage } = {}) { this.buffer = Buffer.alloc(0); this.validate = validate; }

  push(chunk) {
    if (!Buffer.isBuffer(chunk)) fail('DESKTOP_IPC_BYTES_REQUIRED', 'Desktop-Kanal erwartet Bytes.');
    const messages = [];
    let offset = 0;
    while (offset < chunk.length) {
      if (this.buffer.length < 4) {
        const take = Math.min(4 - this.buffer.length, chunk.length - offset);
        this.buffer = Buffer.concat([this.buffer, chunk.subarray(offset, offset + take)]);
        offset += take;
        if (this.buffer.length < 4) continue;
      }
      const size = this.buffer.readUInt32BE(0);
      if (size < 2 || size > MAX_FRAME_BYTES)
        fail('DESKTOP_IPC_FRAME_INVALID', 'Ungültiger Desktop-Nachrichtenrahmen.');
      const missing = size + 4 - this.buffer.length;
      if (missing > 0) {
        const take = Math.min(missing, chunk.length - offset);
        this.buffer = Buffer.concat([this.buffer, chunk.subarray(offset, offset + take)]);
        offset += take;
        if (this.buffer.length < size + 4) continue;
      }
      const payload = this.buffer.subarray(4, size + 4);
      this.buffer = Buffer.alloc(0);
      let message;
      try { message = JSON.parse(payload.toString('utf8')); }
      catch { fail('DESKTOP_IPC_JSON_INVALID', 'Ungültige Desktop-Nachricht.'); }
      messages.push(this.validate(message));
    }
    return messages;
  }
}

module.exports = {
  MAX_FRAME_BYTES, MAX_ADMISSION_PATH_BYTES, MAX_PRESENTATION_GENERATION, PRIVATE_ACTIONS,
  validatePrivateMessage, encodeFrame, FrameDecoder
};
