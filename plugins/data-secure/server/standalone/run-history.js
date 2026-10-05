'use strict';

// Standalone-only history projection and local result actions. Persistence and
// original-directory identity bindings are shared gateway responsibilities.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const identityLedger = require('./identity-ledger');
const { SCHEMA, failure, validateBatchId, historyProgress, validSummary, summarizeState,
  readStandaloneSummaries, recordStandaloneState, recordStandaloneExport, boundRun } = require('../gateway/standalone-history-store');

const MAPPING = 'DataSecure-Zuordnung.csv';
function safeLocalLabel(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 1024 &&
    !path.posix.isAbsolute(name) && !path.win32.isAbsolute(name) && !/[:\\\u0000-\u001f\u007f]/u.test(name) &&
    !name.split('/').some(part => !part || part === '.' || part === '..');
}
function problemItems(state) {
  return (state?.items || []).filter(item => item.status === 'stopped' ||
    item.status === 'preflight_mapping_pending' || item.status === 'retryable');
}
function regularFile(file) {
  try { const stat = fs.lstatSync(file); return stat.isFile() && !stat.isSymbolicLink(); }
  catch { return false; }
}

function createRunHistory(deps) {
  function collect() {
    const states = deps.readStates();
    const current = new Map();
    for (const state of states) {
      const summary = summarizeState(state);
      if (!summary || !validSummary(summary)) continue;
      current.set(summary.batch_id, state);
      try { recordStandaloneState(state); } catch { /* journal remains authoritative */ }
    }
    const summaries = new Map();
    for (const state of states) {
      const summary = summarizeState(state);
      if (summary && validSummary(summary)) summaries.set(summary.batch_id, summary);
    }
    for (const summary of readStandaloneSummaries()) {
      if (!summaries.has(summary.batch_id)) summaries.set(summary.batch_id, summary);
    }
    const byExport = new Map([...summaries.values()].map((row) => [row.export_id, row]));
    const exports = new Map();
    for (const record of deps.readExports()) {
      exports.set(record.export_id, record);
      // Old exports may survive the owning journal. Their stable synthetic ID
      // cannot ever be used as a batch token; resume requires a current journal.
      if (!byExport.has(record.export_id)) {
        const batchId = crypto.createHash('sha256').update(`standalone-history:${record.export_id}`).digest('hex');
        const summary = { schema: SCHEMA, batch_id: batchId, ...record.summary, export_id: record.export_id };
        if (validSummary(summary)) summaries.set(batchId, summary);
      }
      if (record.directory && !boundRun(record.export_id, record.run_directory)) {
        try { recordStandaloneExport(record.target, { product_channel: 'standalone', complete: record.complete }, record.directory); }
        catch { /* an unbound path cannot become an action */ }
      }
    }
    const resumable = new Set(deps.recoverableStates().filter((state) => state.product_channel === 'standalone').map((state) => state.token));
    return [...summaries.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.batch_id.localeCompare(a.batch_id))
      .slice(0, 20).map((summary) => {
        const state = current.get(summary.batch_id);
        const savedExport = exports.get(summary.export_id);
        const bound = savedExport?.complete === true ? boundRun(summary.export_id, savedExport.run_directory) : '';
        // A visible result action is meaningful only when at least one result
        // exists. Old all-stopped runs may still contain a historical report
        // file, but it must not be exposed as a result or mapping action.
        const run = summary.result_count > 0 ? bound : '';
        const ledger = summary.processing_mode !== 'markdown-only' &&
          Boolean(run && regularFile(path.join(run, MAPPING)));
        const processing = Boolean(state && deps.liveExecutor(state));
        const canResume = !processing && !summary.complete && resumable.has(summary.batch_id);
        const reviewReady = state && historyProgress(state).batch_phase === 'awaiting_local_review';
        const status = processing ? 'processing' : canResume ? (reviewReady ? 'review_required' : 'stopped') :
          summary.complete
            ? (summary.result_count === 0
                ? 'completed_without_results'
                : savedExport?.complete === true ? 'results_available' : 'export_pending')
            : 'failed';
        const { schema, export_id, complete, ...fields } = summary;
        const problems = state ? problemItems(state).length : summary.failed_count;
        const identityEligible = summary.result_count > 0 && status === 'results_available' &&
          summary.processing_mode !== 'markdown-only';
        const readableIdentity = identityEligible && identityLedger.documentAvailable(summary.batch_id);
        const capturedIdentity = identityEligible && state ? identityLedger.identityStatus(state) : null;
        const identityWarning = identityEligible && !readableIdentity ? 'STANDALONE_IDENTITY_MAPPING_MISSING' :
          capturedIdentity?.available && !capturedIdentity.complete ? 'STANDALONE_IDENTITY_MAPPING_INVALID' :
            readableIdentity && run && !identityLedger.publicationAvailable(summary.batch_id, run) ? 'STANDALONE_IDENTITY_PUBLICATION_FAILED' : null;
        return { ...fields, status, results_available: Boolean(run), ledger_available: ledger,
          ...(problems !== summary.failed_count ? { problem_count: problems } : {}),
          identity_mapping_available: Boolean(readableIdentity || capturedIdentity?.available),
          ...(identityWarning ? { identity_mapping_warning: identityWarning } : {}),
          resumable: canResume, _run: run };
      });
  }
  function history() {
    return { ok: true, local_ui_only: true, external_disclosure: false,
      entries: collect().map(({ _run, ...entry }) => entry) };
  }
  function find(batchId) {
    validateBatchId(batchId);
    const entry = collect().find((row) => row.batch_id === batchId);
    if (!entry) throw failure('STANDALONE_HISTORY_MISSING');
    return entry;
  }
  function resolveResults(batchId) {
    const entry = find(batchId);
    if (!entry._run) throw failure('STANDALONE_RESULTS_MISSING');
    return { ok: true, target_kind: 'directory', local_path: entry._run, external_disclosure: false };
  }
  function resolveLedger(batchId) {
    const entry = find(batchId);
    if (!entry.ledger_available) throw failure('STANDALONE_LEDGER_MISSING');
    return { ok: true, target_kind: 'file', local_path: path.join(entry._run, MAPPING), external_disclosure: false };
  }
  function resolveIdentityMapping(batchId) {
    const entry = find(batchId);
    if (!entry.identity_mapping_available) throw failure('STANDALONE_IDENTITY_MAPPING_MISSING');
    // The journal can expire while the human mapping intentionally remains.
    // While it still exists, re-materialize on access so a transient locked
    // document cannot leave a stale partial view after later releases.
    const current = deps.readStates().find(state => state.product_channel === 'standalone' && state.token === batchId);
    if (current) {
      try { identityLedger.materialize(current); }
      catch { throw failure('STANDALONE_IDENTITY_MAPPING_INVALID'); }
    }
    const privateFile = identityLedger.resolveDocument(batchId);
    let localPath = privateFile;
    let publicationAvailable = false;
    if (entry._run) {
      try { const published = identityLedger.publishDocumentToRun(batchId, entry._run); localPath = published.local_path; publicationAvailable = published.published; }
      catch { /* private mapping remains available when the user-owned run folder conflicts */ }
    }
    return { ok: true, target_kind: 'file', local_path: localPath, external_disclosure: false,
      publication_available: publicationAvailable,
      ...(!publicationAvailable ? { identity_mapping_warning: 'STANDALONE_IDENTITY_PUBLICATION_FAILED' } : {}) };
  }
  function failures(batchId) {
    const entry = find(batchId);
    // Names are read on demand from the private journal, never persisted in
    // the content-free history summary or diagnostic log. Older expired
    // journals may therefore have counts but no longer have names.
    const state = deps.readStates().find(candidate => candidate.token === batchId &&
      candidate.product_channel === 'standalone');
    if (!state) return { ok: true, available: entry.failed_count === 0, total: entry.failed_count, files: [],
      local_ui_only: true, external_disclosure: false };
    const stopped = problemItems(state);
    const files = stopped.slice(0, 200).map(item => ({
      name: item.source_label || item.name,
      ...(item.local_mapping_exported === false || item.status === 'preflight_mapping_pending'
        ? { stage: 'mapping_pending' } : item.status === 'retryable' ? { stage: 'retryable' } : {}),
      ...(typeof item.error_code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/u.test(item.error_code)
        ? { reason_code: item.error_code } : {})
    })).filter(item => safeLocalLabel(item.name));
    // A stopped worker can leave later sources untouched. Show these separately
    // instead of pretending that every selected document failed to convert.
    const pending = !deps.liveExecutor(state) && (stopped.length > 0 || entry.status === 'failed')
      ? state.items.filter(item => item.status === 'pending') : [];
    const pendingFiles = pending.slice(0, 200).map(item => ({ name: item.source_label || item.name }))
      .filter(item => safeLocalLabel(item.name));
    return { ok: true, available: true, total: stopped.length, files,
      ...(pending.length ? { pending_total: pending.length, pending_files: pendingFiles } : {}),
      local_ui_only: true, external_disclosure: false };
  }
  function reviewTargets(batchId) {
    validateBatchId(batchId);
    const state = deps.readStates().find(candidate => candidate.token === batchId &&
      candidate.product_channel === 'standalone');
    if (!state) return [];
    return (state.items || []).filter(item => item.status === 'deferred_review')
      .slice(0, 200).map(item => item.source_label || item.name).filter(safeLocalLabel);
  }
  return { history, find, resolveResults, resolveLedger, resolveIdentityMapping, failures, reviewTargets };
}

module.exports = { createRunHistory, validateBatchId };
