'use strict';

const MAX_FRAME_BYTES = 1024 * 1024;
const MAX_ADMISSION_PATH_BYTES = 768 * 1024;
const MAX_SINGLE_PATH_BYTES = 32767;
const MAX_PRESENTATION_GENERATION = Number.MAX_SAFE_INTEGER;
const PRIVATE_ACTIONS = new Set([
  'admit_selected_sources', 'cancel_admission', 'start_admitted_batch',
  'get_public_state', 'get_ui_context', 'ack_terminal_presented', 'continue_current_batch', 'configure_results',
  'open_current_results', 'open_local_ledger', 'shutdown'
]);

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function validatePrivateMessage(message) {
  if (!message || message.schema !== 'datasecure-standalone-private-ipc/1')
    fail('DESKTOP_IPC_SCHEMA_INVALID', 'Ungültige Desktop-Nachricht.');
  if (typeof message.request_id !== 'string' || !/^[a-f0-9]{16,64}$/u.test(message.request_id))
    fail('DESKTOP_IPC_REQUEST_INVALID', 'Ungültige Desktop-Anfragekennung.');
  if (!PRIVATE_ACTIONS.has(message.action))
    fail('DESKTOP_IPC_ACTION_INVALID', 'Unbekannte Desktop-Aktion.');
  const allowedFields = new Set(['schema', 'request_id', 'action']);
  if (message.action === 'ack_terminal_presented') {
    allowedFields.add('presentation_generation');
    if (!Number.isSafeInteger(message.presentation_generation) || message.presentation_generation < 1 ||
        message.presentation_generation > MAX_PRESENTATION_GENERATION)
      fail('DESKTOP_IPC_PRESENTATION_GENERATION_INVALID', 'Ungültige Darstellungskennung.');
  }
  if (message.action === 'admit_selected_sources' || message.action === 'configure_results') {
    allowedFields.add('source_paths');
    if (message.action === 'admit_selected_sources') {
      allowedFields.add('source_kind');
      if (!['files', 'folder'].includes(message.source_kind))
        fail('DESKTOP_IPC_SOURCE_KIND_INVALID', 'Ungültige Art der lokalen Auswahl.');
    }
    if (!Array.isArray(message.source_paths) || message.source_paths.length < 1 || message.source_paths.length > 100)
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
  constructor() { this.buffer = Buffer.alloc(0); }

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
      messages.push(validatePrivateMessage(message));
    }
    return messages;
  }
}

module.exports = {
  MAX_FRAME_BYTES, MAX_ADMISSION_PATH_BYTES, MAX_PRESENTATION_GENERATION, PRIVATE_ACTIONS,
  validatePrivateMessage, encodeFrame, FrameDecoder
};
