'use strict';

// UI helpers are intentionally classified by the most sensitive data they may
// receive. This contract prevents a convenience dialog from silently becoming
// another raw-content processing boundary.
const UI_PROCESS_POLICIES = Object.freeze({
  path_picker: Object.freeze({
    input_class: 'none',
    output_class: 'absolute_source_path',
    raw_content: false,
    os_network_sandbox_required: false,
    os_network_sandbox_verified: false
  }),
  count_confirmation: Object.freeze({
    input_class: 'bounded_counter',
    output_class: 'boolean_decision',
    raw_content: false,
    os_network_sandbox_required: false,
    os_network_sandbox_verified: false
  }),
  completion_summary: Object.freeze({
    input_class: 'bounded_counters',
    output_class: 'shown_evidence',
    raw_content: false,
    os_network_sandbox_required: false,
    os_network_sandbox_verified: false
  }),
  folder_opener: Object.freeze({
    input_class: 'absolute_local_folder_path',
    output_class: 'shown_evidence',
    raw_content: false,
    os_network_sandbox_required: false,
    os_network_sandbox_verified: false
  }),
  text_review: Object.freeze({
    input_class: 'raw_and_anonymized_document_text',
    output_class: 'bounded_review_decisions',
    raw_content: true,
    os_network_sandbox_required: true,
    os_network_sandbox_verified: false
  })
});

// Keep only variables needed to launch native desktop dialogs. In particular,
// proxy configuration, API/cloud credentials, NODE_OPTIONS and Electron flags
// are not inherited by UI helpers.
const UI_ENV_ALLOWLIST = new Set([
  'SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT',
  'HOME', 'USERPROFILE', 'TMP', 'TEMP', 'TMPDIR',
  'LANG', 'LC_ALL', 'LC_CTYPE',
  'DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY',
  'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR'
]);

function uiProcessEnvironment(source = process.env) {
  const clean = Object.create(null);
  for (const [key, value] of Object.entries(source || {})) {
    if (UI_ENV_ALLOWLIST.has(key.toUpperCase()) && typeof value === 'string' && value.length <= 32_768) {
      clean[key] = value;
    }
  }
  return clean;
}

function uiProcessPolicy(purpose) {
  const policy = UI_PROCESS_POLICIES[purpose];
  if (!policy) throw new TypeError('Unknown DataSecure UI process purpose.');
  return { ...policy };
}

module.exports = {
  UI_PROCESS_POLICIES,
  UI_ENV_ALLOWLIST,
  uiProcessEnvironment,
  uiProcessPolicy
};
