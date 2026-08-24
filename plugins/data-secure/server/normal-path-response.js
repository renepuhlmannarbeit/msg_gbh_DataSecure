'use strict';

// The local-only start acknowledgement crosses the MCP boundary. Keep it
// intentionally smaller than the private worker result: the background batch
// token is not useful to Claude until the user explicitly asks to continue.
function localOnlyStartResponse(started) {
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
    local_processing_started: started?.local_intake_pending === true,
    next_action: 'local_processing_running_without_claude',
    raw_content_sent_to_claude: false
  });
}

module.exports = { localOnlyStartResponse };
