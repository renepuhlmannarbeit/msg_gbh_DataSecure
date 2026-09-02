'use strict';

const { createSuite } = require('./helpers');
const { localOnlyStartResponse } = require('../plugins/data-secure/server/normal-path-response');

const { test, done, assert } = createSuite('Local-only start response');

test('exposes only fixed local-only state and never a private batch capability', () => {
  const result = localOnlyStartResponse({
    ok: true,
    batch_token: 'a'.repeat(64),
    local_intake_pending: true,
    source_path: 'C:/private/original.docx',
    source_name: 'original.docx'
  });
  assert.deepStrictEqual(result, {
    ok: true,
    mode: 'local_only',
    local_intake_pending: true,
    local_processing_started: false,
    next_action: 'local_intake_handoff_confirmed',
    raw_content_sent_to_claude: false
  });
  assert.strictEqual(Object.isFrozen(result), true);
  assert.doesNotMatch(JSON.stringify(result), /batch_token|original\.docx|C:\\private/u);
});

test('fails closed to a fixed non-start acknowledgement for malformed worker output', () => {
  assert.deepStrictEqual(localOnlyStartResponse(null), {
    ok: false,
    error: 'local_start_failed',
    message: 'Die lokale Verarbeitung wurde nicht gestartet. Es wurde kein Paket freigegeben.',
    mode: 'local_only',
    local_intake_pending: false,
    local_processing_started: false,
    next_action: 'restart_only_on_explicit_request',
    raw_content_sent_to_claude: false
  });
});

test('reports the one-time sync-folder notice without exposing a path', () => {
  const result = localOnlyStartResponse({ ok: true, local_intake_pending: true }, { syncFolderNotice: true });
  assert.strictEqual(result.sync_folder_notice, true);
  assert.doesNotMatch(JSON.stringify(result), /OneDrive|Dropbox|[A-Z]:[\\/]/iu);
});

done();
