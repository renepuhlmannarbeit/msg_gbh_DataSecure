'use strict';

const { VERSION } = require('./version');

// The local-only start acknowledgement crosses the MCP boundary. Keep it
// intentionally smaller than the private worker result: the background batch
// token is not useful to Claude until the user explicitly asks to continue.
// The running gateway version is the one content-free datum every run names,
// so a stale plugin copy in the host cache becomes visible in the chat.
function localOnlyStartResponse(started, options = {}) {
  if (started?.ok !== true || started?.local_intake_pending !== true) {
    return Object.freeze({
      ok: false,
      error: 'local_start_failed',
      message: 'Die lokale Verarbeitung wurde nicht gestartet. Es wurde kein Paket freigegeben.',
      mode: 'local_only',
      local_intake_pending: false,
      local_processing_started: false,
      next_action: 'restart_only_on_explicit_request',
      raw_content_sent_to_claude: false
    });
  }
  return Object.freeze({
    ok: true,
    mode: 'local_only',
    local_intake_pending: started?.local_intake_pending === true,
    // The detached worker has acknowledged the private IPC handoff. The
    // potentially large durable source snapshot is created asynchronously.
    local_processing_started: false,
    // This confirms worker receipt only. Until the worker creates the durable
    // source snapshot and journal, the batch is not yet resumable.
    next_action: 'local_intake_accepted_checkpoint_pending',
    gateway_version: VERSION,
    ...(options.syncFolderNotice === true ? { sync_folder_notice: true } : {}),
    ...(options.networkFolderNotice === true ? { network_folder_notice: true } : {}),
    raw_content_sent_to_claude: false
  });
}

module.exports = { localOnlyStartResponse };
