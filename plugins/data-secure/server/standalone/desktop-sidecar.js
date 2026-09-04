#!/usr/bin/env node
'use strict';

const { StandaloneApplicationService } = require('./application-service');
const { FrameDecoder, MAX_FRAME_BYTES } = require('./desktop-ipc');

const service = new StandaloneApplicationService();
const decoder = new FrameDecoder();
let chain = Promise.resolve();

function writeFrame(value, callback) {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  if (payload.length > MAX_FRAME_BYTES) throw new Error('DESKTOP_IPC_RESPONSE_TOO_LARGE');
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]), callback);
}

function publicError(requestId, error) {
  const allowed = new Set([
    'STANDALONE_BUSY', 'STANDALONE_ENGINE_NOT_READY', 'STANDALONE_SELECTION_CANCELLED',
    'STANDALONE_SELECTION_INVALID', 'STANDALONE_NO_ADMISSION', 'STANDALONE_NOTHING_TO_CONTINUE',
    'STANDALONE_START_FAILED',
    'STANDALONE_RESULT_ROOT_UNSAFE', 'STANDALONE_RESULT_OPEN_FAILED',
    'STANDALONE_RESULTS_MISSING',
    'STANDALONE_LEDGER_MISSING', 'STANDALONE_LEDGER_OPEN_FAILED'
  ]);
  return {
    schema: 'datasecure-standalone-private-response/1', request_id: requestId, ok: false,
    error_code: allowed.has(error?.code) ? error.code : 'STANDALONE_OPERATION_FAILED'
  };
}

async function dispatch(message) {
  switch (message.action) {
    case 'admit_selected_sources':
      return service.admitSelectedSources(message.source_paths, message.source_kind);
    case 'cancel_admission': return service.cancelAdmission();
    case 'start_admitted_batch': return service.startAdmittedBatch();
    case 'get_public_state': return service.status();
    case 'continue_current_batch': return service.continueCurrentBatch();
    case 'configure_results': return service.configureResults({ path: message.source_paths[0] });
    case 'open_current_results': return service.openResults();
    case 'open_local_ledger': return service.openLedger();
    case 'shutdown': return { ok: true, shutting_down: true, external_disclosure: false };
    default: throw Object.assign(new Error('unknown action'), { code: 'DESKTOP_IPC_ACTION_INVALID' });
  }
}

process.stdin.on('data', (chunk) => {
  let messages;
  try { messages = decoder.push(chunk); }
  catch { process.exitCode = 65; process.stdin.pause(); return; }
  for (const message of messages) {
    chain = chain.then(async () => {
      try {
        const result = await dispatch(message);
        const response = { schema: 'datasecure-standalone-private-response/1', request_id: message.request_id,
          ok: true, result };
        if (message.action === 'shutdown') {
          writeFrame(response, () => process.exit(0));
          process.stdin.pause();
        } else writeFrame(response);
      } catch (error) { writeFrame(publicError(message.request_id, error)); }
    }).catch(() => { process.exitCode = 1; process.stdin.pause(); });
  }
});

process.stdin.on('end', () => { process.exitCode = process.exitCode || 0; });
