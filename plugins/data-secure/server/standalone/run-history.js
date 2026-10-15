'use strict';

// Standalone-only history projection and local result actions. Persistence and
// original-directory identity bindings are shared gateway responsibilities.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const identityLedger = require('./identity-ledger');
const { conversionFeedback, isOcrOmission, isAnonymizationOcrOmission, isAnonymizationPrivacyStop,
  hasContentNotice } = require('./conversion-feedback');
const { contentOptionsForBatch } = require('../core/content-options');
const { isMarkdownBatch } = require('../core/processing-mode');
const { SCHEMA, failure, validateBatchId, historyProgress, validSummary, summarizeState,
  readStandaloneSummaries, recordStandaloneState, recordStandaloneExport, boundRun, inspectBoundRun } = require('../gateway/standalone-history-store');

const MAPPING = 'DataSecure-Zuordnung.csv';
function safeLocalLabel(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 1024 &&
    !path.posix.isAbsolute(name) && !path.win32.isAbsolute(name) && !/[:\\\u0000-\u001f\u007f]/u.test(name) &&
    !name.split('/').some(part => !part || part === '.' || part === '..');
}
function problemItems(state) {
  return (state?.items || []).filter(item => item.status === 'stopped' ||
    item.status === 'preflight_mapping_pending' || item.status === 'mapping_pending' || item.status === 'retryable');
}
function regularFile(file) {
  try { const stat = fs.lstatSync(file); return stat.isFile() && !stat.isSymbolicLink(); }
  catch { return false; }
}

function createRunHistory(deps) {
  const nextExportRecovery = new Map();
  function collect({ recoverExports = false } = {}) {
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
    // A review worker can finish before its optional visible-export attempt
    // succeeds. Reconcile the independently completed content-anonymization
    // journal when the local user returns to its history. This creates no new
    // processing run, never changes a completed export, and is bounded so a
    // persistently unavailable destination cannot block every UI poll.
    if (recoverExports && typeof deps.exportCompletedBatchResults === 'function') {
      const now = Date.now();
      const available = new Set(deps.readExports().filter(row => row.complete === true || row.abandoned === true).map(row => row.export_id));
      for (const [batchId, state] of current) {
        const summary = summaries.get(batchId);
        if (!summary?.complete || summary.result_count < 1 || available.has(summary.export_id) ||
            isMarkdownBatch(state) || Boolean(deps.liveExecutor?.(state)) ||
            now < (nextExportRecovery.get(batchId) || 0)) continue;
        try { if (!contentOptionsForBatch(state)) continue; }
        catch { continue; }
        nextExportRecovery.set(batchId, now + 2000);
        try { deps.exportCompletedBatchResults(batchId); }
        catch { /* no result is claimed available until its own export receipt verifies */ }
      }
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
        const location = summary.result_count === 0 || savedExport?.complete !== true ? { availability: 'not_created' }
          : inspectBoundRun(summary.export_id, savedExport.run_directory);
        const bound = location.path || '';
        // A visible result action is meaningful only when at least one result
        // exists. Old all-stopped runs may still contain a historical report
        // file, but it must not be exposed as a result or mapping action.
        const run = summary.result_count > 0 ? bound : '';
        const ledger = summary.processing_mode !== 'markdown-only' &&
          Boolean(run && regularFile(path.join(run, MAPPING)));
        const processing = Boolean(state && deps.liveExecutor(state));
        const canResume = !processing && !summary.complete && resumable.has(summary.batch_id);
        // History is a read-only projection of this exact journal snapshot.
        // Re-reading every old batch through the full public progress path is
        // expensive and can race a worker's next publication. The lightweight
        // progress already contains the pause facts needed by the list.
        const progress = state && historyProgress(state);
        const reviewReady = progress?.batch_phase === 'awaiting_local_review';
        const pauseRequested = state?.standalone_pause_requested === true && !summary.complete;
        const pause = progress && { pause_requested: pauseRequested,
          paused: pauseRequested && !processing && progress.processing === 0 &&
            progress.delivery_pending === 0 && progress.mapping_pending === 0 };
        const status = pause?.paused === true ? 'paused' : processing ? 'processing' : canResume ? (reviewReady ? 'review_required' : 'stopped') :
          summary.complete
            ? (summary.result_count === 0
                ? 'completed_without_results'
                : savedExport?.complete === true ? 'results_available' : savedExport?.abandoned === true
                  ? 'export_abandoned' : 'export_pending')
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
        const feedback = state && conversionFeedback(state);
        const expectedOcrOmissions = summary.complete && Array.isArray(state?.items)
          ? state.items.filter(item => isAnonymizationOcrOmission(state, item)).length : 0;
        const privacyStops = summary.complete && Array.isArray(state?.items)
          ? state.items.filter(item => isAnonymizationPrivacyStop(state, item)).length : 0;
        return { ...fields, status, result_location: location.availability, results_available: Boolean(run), ledger_available: ledger,
          ...(['export_pending', 'export_abandoned'].includes(status) && savedExport ? { exported_count: savedExport.exported_count,
            export_pending_count: savedExport.pending_count } : {}),
          ...(feedback ? { conversion_feedback: feedback } : {}),
          ...(expectedOcrOmissions > 0 && expectedOcrOmissions <= summary.failed_count
            ? { expected_ocr_omission_count: expectedOcrOmissions } : {}),
          ...(privacyStops > 0 && privacyStops <= summary.failed_count - expectedOcrOmissions
            ? { privacy_stop_count: privacyStops } : {}),
          ...(pause?.pause_requested === true ? { pause_requested: true } : {}),
          ...(problems !== summary.failed_count ? { problem_count: problems } : {}),
          identity_mapping_available: Boolean(readableIdentity || capturedIdentity?.available),
          ...(identityWarning ? { identity_mapping_warning: identityWarning } : {}),
          resumable: canResume, _run: run };
      });
  }
  function history({ recoverExports = true } = {}) {
    return { ok: true, local_ui_only: true, external_disclosure: false,
      entries: collect({ recoverExports }).map(({ _run, ...entry }) => entry) };
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
    // Names are read on demand, never from the content-free history summary
    // or diagnostic log. V2 intake rejections also have durable private metadata
    // and therefore survive expiry of the processing journal.
    const state = deps.readStates().find(candidate => candidate.token === batchId &&
      candidate.product_channel === 'standalone');
    if (!state) {
      let rejected = [];
      try {
        const rows = deps.readRejectedInputs ? deps.readRejectedInputs(batchId)
          : require('../gateway/standalone-document-review-store').createDocumentReviewStore().notProcessed(batchId);
        if (!Array.isArray(rows) || rows.length > entry.selected_count || rows.length > 200 ||
            new Set(rows.map(row => row.document_id)).size !== rows.length || rows.some(row =>
              !/^[a-f0-9]{32}$/u.test(row.document_id) || !safeLocalLabel(row.name) ||
              !/^[A-Z][A-Z0-9_]{2,63}$/u.test(row.reason_code))) throw failure('STANDALONE_HISTORY_INVALID');
        rejected = rows.map(({ name, reason_code }) => ({ name, reason_code }));
      } catch { /* unavailable evidence must not invent names or success */ }
      // A preflight rejection is already a proven input failure while its
      // technical mapping may not have become terminal before a crash/expiry.
      // Never let an older summary counter erase that durable evidence.
      const total = Math.max(entry.failed_count, rejected.length);
      return { ok: true, available: rejected.length === total, total, files: rejected,
        local_ui_only: true, external_disclosure: false };
    }
    const stopped = problemItems(state);
    const feedback = conversionFeedback(state);
    const files = stopped.slice(0, 200).map(item => ({
      name: item.source_label || item.name,
      ...(item.local_mapping_exported === false || ['preflight_mapping_pending', 'mapping_pending'].includes(item.status)
        ? { stage: 'mapping_pending' } : item.status === 'retryable' ? { stage: 'retryable' } : {}),
      ...(typeof item.error_code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/u.test(item.error_code)
        ? { reason_code: item.error_code } : ['preflight_mapping_pending', 'mapping_pending'].includes(item.status)
          ? { reason_code: 'LOCAL_MAPPING_PENDING' } : {}),
      ...(feedback ? { classification: isOcrOmission(state, item) ? 'ocr_omission' : 'error' } :
        state.processing_mode === 'markdown-and-anonymize' ? { classification:
          isAnonymizationOcrOmission(state, item) ? 'ocr_omission' :
            isAnonymizationPrivacyStop(state, item) ? 'privacy_stop' : 'error' } : {})
    })).filter(item => safeLocalLabel(item.name));
    // A stopped worker can leave later sources untouched. Show these separately
    // instead of pretending that every selected document failed to convert.
    const pending = !deps.liveExecutor(state) && (stopped.length > 0 || entry.status === 'failed')
      ? state.items.filter(item => item.status === 'pending') : [];
    const pendingFiles = pending.slice(0, 200).map(item => ({ name: item.source_label || item.name }))
      .filter(item => safeLocalLabel(item.name));
    return { ok: true, available: true, total: stopped.length, files,
      ...(feedback ? { conversion_feedback: feedback,
        content_notices: state.items.filter(hasContentNotice).map(item => ({ name: item.source_label || item.name,
          reason_codes: (item.reason_codes || []).filter(code => /^[A-Z][A-Z0-9_]{2,63}$/u.test(code)) }))
          .filter(item => safeLocalLabel(item.name)) } : {}),
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
  function feedback(batchId) {
    validateBatchId(batchId);
    return conversionFeedback(deps.readStates().find(state => state.token === batchId && state.product_channel === 'standalone'));
  }
  function documentFeedback(batchId) {
    validateBatchId(batchId);
    const state = deps.readStates().find(state => state.token === batchId && state.product_channel === 'standalone');
    const projected = conversionFeedback(state);
    if (!projected) return null;
    const notices = state.items.filter(hasContentNotice).map(item => ({ document_id: item.id,
      name: item.source_label || item.name,
      reason_codes: (item.reason_codes || []).filter(code => /^[A-Z][A-Z0-9_]{2,63}$/u.test(code)) }));
    if (notices.some(item => !/^[a-f0-9]{32}$/u.test(item.document_id) || !safeLocalLabel(item.name)) ||
        new Set(notices.map(item => item.document_id)).size !== notices.length) return null;
    return { conversion_feedback: projected, content_notices: notices,
      omissions: state.items.filter(item => isOcrOmission(state, item))
        .map(item => ({ document_id: item.id, name: item.source_label || item.name, reason_code: item.error_code })) };
  }
  return { history, find, resolveResults, resolveLedger, resolveIdentityMapping, failures, reviewTargets, feedback, documentFeedback };
}

module.exports = { createRunHistory, validateBatchId };
