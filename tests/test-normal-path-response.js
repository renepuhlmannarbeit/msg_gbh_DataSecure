'use strict';

const { createSuite } = require('./helpers');
const {
  configuredResultFolderUserStatus,
  localOnlyStartResponse
} = require('../plugins/data-secure/server/normal-path-response');
const { isNetworkResultFolder } = require('../plugins/data-secure/server/gateway/result-folder-config');
const { VERSION } = require('../plugins/data-secure/server/version');
const { LOCAL_INTAKE_ACCEPTED_TEXT } = require('../plugins/data-secure/server/prompt-contract');

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
    next_action: 'local_intake_accepted_checkpoint_pending',
    gateway_version: VERSION,
    user_status: `${LOCAL_INTAKE_ACCEPTED_TEXT} (DataSecure-Version: ${VERSION})`,
    raw_content_sent_to_claude: false
  });
  assert.strictEqual(Object.isFrozen(result), true);
  assert.doesNotMatch(JSON.stringify(result), /batch_token|original\.docx|C:\\private/u);
  // The version lets the user notice a stale plugin copy in the host cache; it
  // is a fixed build string, never a path, name or content.
  assert.match(result.gateway_version, /^\d+\.\d+\.\d+(?:-rc\d+)?$/u);
  assert.doesNotMatch(result.user_status, /batch_token|original\.docx|C:\\private/u);
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
  assert.match(result.user_status, /Cloud-Sync-Ordner/u);
  assert.doesNotMatch(JSON.stringify(result), /OneDrive|Dropbox|[A-Z]:[\\/]/iu);
});

test('reports the one-time network-folder notice without exposing a path', () => {
  const result = localOnlyStartResponse({ ok: true, local_intake_pending: true }, {
    networkFolderNotice: isNetworkResultFolder('\\\\server\\share', 'win32')
  });
  assert.strictEqual(result.network_folder_notice, true);
  assert.match(result.user_status, /Netzlaufwerk/u);
  assert.doesNotMatch(JSON.stringify(result), /server|share|[A-Z]:[\\/]/iu);
});

test('result-folder configuration exposes one complete server-owned status instead of model-built fragments', () => {
  const status = configuredResultFolderUserStatus({ syncFolderNotice: true, networkFolderNotice: true });
  assert.match(status, /Ergebnisordner wurde lokal geändert/u);
  assert.match(status, new RegExp(`DataSecure-Version: ${VERSION.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'u'));
  assert.match(status, /Cloud-Sync-Ordner/u);
  assert.match(status, /Netzlaufwerk/u);
  assert.doesNotMatch(status, /OneDrive|Dropbox|server|share|[A-Z]:[\\/]/iu);
});

done();
