'use strict';

// Test-host evidence only. No product operation, directory repair or native
// capability is acquired here. All names/bytes are bounded before predicates.
const fs = require('node:fs');
const path = require('node:path');
const bound = require('../../plugins/data-secure/server/core/bound-file-io');
const { DESKTOP_ERROR_CODES } = require('../../plugins/data-secure/server/core/desktop-error-contract');
const { mainReady, reviewReady, actionReady } = require('./native-review-readiness');
const MAX_LEAVES = 64;
const MAX_LEAF_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES = 512;
const LEAF = /^sidecar-interactions\.([a-f0-9]{32})(?:\.([2-8]))?\.jsonl$/u;
const DESKTOP_LEAF = /^desktop-interactions(?:\.[0-9]+\.[a-f0-9]{32}(?:\.[2-8])?)?\.jsonl$/u;
const ID = /^[a-f0-9]{16,64}$/u;
const PRODUCT_VERSION = /^(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})-rc(?:0|[1-9][0-9]{0,5})$/u;
const CODES = new Set(DESKTOP_ERROR_CODES);
const BATCH_CODES = new Set([...DESKTOP_ERROR_CODES,
  ...require('../../plugins/data-secure/server/gateway/diagnostic-causes').WORKFLOW_ERROR_CODES,
  ...require('../../plugins/data-secure/server/core/document-result-grade').REASON_CODES]);
const BATCH_PHASES = new Set(['item_epoch_release', 'registry_finalize', 'local_delivery_verify',
  'executor_lease_release', 'processing', 'result_export_prepare', 'result_export_claim',
  'result_export_plan', 'result_export_copy', 'result_export_claim_release']);
const BATCH_FIELDS = new Set(['schema', 'time_ms', 'component', 'event', 'outcome', 'error_code', 'phase']);
const error = code => Object.assign(Error(code), { code });
const validTime = value => Number.isSafeInteger(value) && value >= 0;
function records(bytes, component) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw error('NATIVE_SMOKE_LOG_INVALID'); }
  // An in-progress append is not evidence. A later bounded poll can read its
  // completed line; do not silently accept a truncated JSONL tail.
  if (!text.endsWith('\n')) throw error('NATIVE_SMOKE_LOG_INCOMPLETE');
  return text.split(/\r?\n/u).filter(line => line.length).flatMap(line => {
    let value;
    try { value = JSON.parse(line); } catch { throw error('NATIVE_SMOKE_LOG_INVALID'); }
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        value.schema !== 'datasecure-standalone-interaction/1' || value.component !== component ||
        !validTime(value.time_ms) || typeof value.event !== 'string')
      throw error('NATIVE_SMOKE_LOG_INVALID');
    // The production sidecar deliberately omits identity from this closed,
    // content-free ancillary failure. It proves no session or startup marker.
    if (component === 'sidecar' && value.event === 'batch_worker_failed') {
      if (Object.keys(value).some(key => !BATCH_FIELDS.has(key)) || value.outcome !== 'failed' ||
          !BATCH_PHASES.has(value.phase) || !BATCH_CODES.has(value.error_code))
        throw error('NATIVE_SMOKE_LOG_INVALID');
      return [];
    }
    if (typeof value.session_id !== 'string' || !ID.test(value.session_id))
      throw error('NATIVE_SMOKE_LOG_INVALID');
    return [value];
  });
}
function ownerActionReady(events, action, bootstrapIndex) {
  if (!actionReady(events, action)) return false;
  const request = events.findLastIndex(record => record.event === 'ipc_request_started' && record.action === action);
  const id = events[request].request_id;
  const response = events.findLastIndex((record, index) => index > request && record.action === action && record.request_id === id);
  // Keep requests made before bootstrap (initial UI context waits for it), but
  // never borrow an older owner's response, including an equal-ms predecessor.
  return response > bootstrapIndex && events[response].time_ms >= events[bootstrapIndex].time_ms;
}
function failureCode(cause) {
  if (cause?.code === 'ENOENT') return 'NATIVE_SMOKE_LOG_MISSING';
  if (cause?.code === 'BOUND_FILE_CHANGED') return 'NATIVE_SMOKE_LOG_CHANGED';
  if (cause?.code === 'BOUND_FILE_CLOSE_FAILED') return 'NATIVE_SMOKE_LOG_CLOSE_FAILED';
  if (cause?.code === 'BOUND_FILE_UNSAFE') return 'NATIVE_SMOKE_LOG_UNSAFE';
  return ['NATIVE_SMOKE_LOG_INVALID', 'NATIVE_SMOKE_LOG_INCOMPLETE', 'NATIVE_SMOKE_LOG_LIMIT',
    'NATIVE_SMOKE_LOG_LOCATION_INVALID'].includes(cause?.code) ? cause.code : 'NATIVE_SMOKE_LOG_UNAVAILABLE';
}
function emptyReport() {
  return { schema: 'datasecure-native-smoke-readiness/1', ready: false, session_id: null,
    product_version: null, application_started_ms: null,
    conditions: { desktop_log: false, application_session: false, setup_started: false,
      setup_completed: false, page_loaded: false, workspace_page_loaded: false, frontend_ready: false,
      review_page_loaded: false, review_script_started: false, public_state_ipc: false, ui_context_ipc: false,
      main_ipc: false, main_workspace_ipc: false, review_ipc: false,
      current_owner_main_ipc: false, current_owner_review_ipc: false,
      sidecar_leaves: false, sidecar_session: false, sidecar_generation: false,
      sidecar_bootstrap_ready: false, sidecar_imports_ready: false, sidecar_started: false,
      runtime_integrity_checked: false, service_initialized: false }, error_codes: [], bootstrap_error: null };
}
function readNativeSidecarReadiness(inputDirectory, desktopFile,
  { requireRuntime = false, requireReview = false, requireWorkspace = false } = {}) {
  const report = emptyReport();
  try {
    const directory = bound.bindDirectory(inputDirectory);
    const desktop = path.resolve(desktopFile);
    if (path.dirname(desktop) !== directory.path || !DESKTOP_LEAF.test(path.basename(desktop)))
      throw error('NATIVE_SMOKE_LOG_LOCATION_INVALID');
    let total = 0;
    const read = file => {
      const maximum = Math.min(MAX_LEAF_BYTES, MAX_TOTAL_BYTES - total);
      if (maximum === 0) throw error('NATIVE_SMOKE_LOG_LIMIT');
      const record = bound.readBoundFileRecord(file, { directory, maximum,
        minimum: 1, maxLinks: 1, checkCtime: true });
      total += record.bytes.length;
      return record.bytes;
    };
    const desktopRecords = records(read(desktop), 'desktop');
    report.conditions.desktop_log = true;
    const start = desktopRecords.findLastIndex(record => record.event === 'application_started');
    if (start < 0) { report.error_codes.push('NATIVE_SMOKE_SESSION_MISSING'); return report; }
    const session = desktopRecords[start].session_id;
    report.session_id = session;
    report.product_version = typeof desktopRecords[start].product_version === 'string' &&
      PRODUCT_VERSION.test(desktopRecords[start].product_version) ? desktopRecords[start].product_version : null;
    report.application_started_ms = desktopRecords[start].time_ms;
    const current = desktopRecords.slice(start).filter(record => record.session_id === session);
    report.conditions.application_session = true;
    for (const name of ['setup_started', 'setup_completed', 'page_loaded', 'workspace_page_loaded',
      'frontend_ready', 'review_page_loaded']) report.conditions[name] = current.some(record => record.event === name);
    report.conditions.main_ipc = mainReady(current);
    report.conditions.main_workspace_ipc = mainReady(current, { workspace: true });
    report.conditions.review_ipc = reviewReady(current);
    report.conditions.review_script_started = current.some(record => record.event === 'ipc_request_started' &&
      record.action === 'get_review_session');
    report.conditions.public_state_ipc = actionReady(current, 'get_public_state');
    report.conditions.ui_context_ipc = actionReady(current, 'get_ui_context');
    const bootStart = current.findLastIndex(record => record.event === 'sidecar_starting');
    const boot = bootStart < 0 ? [] : current.slice(bootStart);
    const end = boot.filter(record => ['sidecar_bootstrap_ready', 'sidecar_bootstrap_failed',
      'sidecar_spawn_failed', 'runtime_resolution_failed'].includes(record.event)).at(-1);
    report.conditions.sidecar_bootstrap_ready = end?.event === 'sidecar_bootstrap_ready' && end.outcome === 'ready';
    if (end?.error_code && CODES.has(end.error_code)) report.bootstrap_error = end.error_code;

    const leaves = [];
    let scanned = 0;
    const stream = fs.opendirSync(directory.path);
    try {
      for (let entry; (entry = stream.readSync()) !== null;) {
        if (++scanned > MAX_DIRECTORY_ENTRIES) throw error('NATIVE_SMOKE_LOG_LIMIT');
        const match = LEAF.exec(entry.name);
        if (!match) continue;
        if (leaves.length === MAX_LEAVES) throw error('NATIVE_SMOKE_LOG_LIMIT');
        leaves.push({ name: entry.name, generation: match[1], segment: Number(match[2] || 1) });
      }
    } finally { stream.closeSync(); }
    bound.assertDirectory(directory);
    report.conditions.sidecar_leaves = leaves.length > 0;
    const groups = new Map();
    for (const leaf of leaves.sort((a, b) => a.generation.localeCompare(b.generation) || a.segment - b.segment)) {
      const values = records(read(path.join(directory.path, leaf.name)), 'sidecar');
      const group = groups.get(leaf.generation) || { records: [], sessions: new Set(), segments: [] };
      group.records.push(...values);
      for (const value of values) group.sessions.add(value.session_id);
      group.segments.push(leaf.segment);
      groups.set(leaf.generation, group);
    }
    bound.assertDirectory(directory);
    const currentGroups = [...groups.values()].filter(group => group.sessions.has(session));
    report.conditions.sidecar_session = currentGroups.length > 0;
    if (currentGroups.some(group => group.sessions.size !== 1)) {
      report.error_codes.push('NATIVE_SMOKE_GENERATION_AMBIGUOUS'); return report;
    }
    // Keep a single actual startup window. Old success from an earlier owner
    // cannot bless a pending/failed latest bootstrap, even in the same session.
    if (!report.conditions.sidecar_bootstrap_ready || bootStart < 0) {
      report.error_codes.push('NATIVE_SMOKE_BOOTSTRAP_NOT_READY'); return report;
    }
    const lower = boot[0].time_ms, upper = end.time_ms;
    const bootstrapIndex = current.indexOf(end);
    report.conditions.current_owner_main_ipc = report.conditions.main_ipc &&
      ['get_public_state', 'get_ui_context'].every(action => ownerActionReady(current, action, bootstrapIndex));
    report.conditions.current_owner_review_ipc = report.conditions.review_ipc &&
      ownerActionReady(current, 'get_review_session', bootstrapIndex);
    const eligible = currentGroups.filter(group => group.segments.every((segment, index) => segment === index + 1) &&
      group.records.filter(record => record.event === 'sidecar_entry').length === 1 &&
      group.records.some(record => record.event === 'sidecar_entry' && record.outcome === 'ready' &&
        record.time_ms >= lower && record.time_ms <= upper));
    const laterEntry = currentGroups.some(group => group.records.some(record =>
      record.event === 'sidecar_entry' && record.time_ms > upper));
    if (eligible.length !== 1 || laterEntry) {
      report.error_codes.push(eligible.length > 1 || laterEntry ? 'NATIVE_SMOKE_GENERATION_AMBIGUOUS' :
        'NATIVE_SMOKE_GENERATION_MISSING'); return report;
    }
    const selected = eligible[0].records;
    report.conditions.sidecar_generation = true;
    let position = selected.findIndex(record => record.event === 'sidecar_entry');
    const entryTime = selected[position].time_ms;
    for (const name of ['sidecar_imports_ready', 'sidecar_started', 'runtime_integrity_checked', 'service_initialized']) {
      const next = selected.findIndex((record, index) => index > position && record.event === name && record.outcome === 'ready' &&
        record.time_ms >= entryTime && record.time_ms <= upper);
      report.conditions[name] = next >= 0;
      if (next >= 0) position = next;
      else if (name !== 'runtime_integrity_checked' || requireRuntime) position = selected.length;
    }
    const failed = selected.some(record => ['sidecar_import_failed', 'service_initialization_failed'].includes(record.event));
    const sidecarReady = !failed && report.conditions.sidecar_imports_ready && report.conditions.sidecar_started &&
      report.conditions.service_initialized && (!requireRuntime || report.conditions.runtime_integrity_checked);
    report.ready = sidecarReady && report.conditions.current_owner_main_ipc &&
      (!requireReview || report.conditions.current_owner_review_ipc) &&
      (!requireWorkspace || report.conditions.main_workspace_ipc);
    if (!sidecarReady) report.error_codes.push('NATIVE_SMOKE_SIDECAR_NOT_READY');
    else if (!report.conditions.current_owner_main_ipc || requireReview && !report.conditions.current_owner_review_ipc)
      report.error_codes.push('NATIVE_SMOKE_CURRENT_OWNER_IPC_NOT_READY');
    else if (!report.ready) report.error_codes.push('NATIVE_SMOKE_WORKSPACE_NOT_READY');
    return report;
  } catch (cause) {
    report.ready = false;
    report.error_codes.push(failureCode(cause));
    return report;
  }
}
module.exports = { readNativeSidecarReadiness, MAX_LEAVES, MAX_LEAF_BYTES, MAX_TOTAL_BYTES };
