'use strict';

// Standalone-only history projection and local result actions. Persistence and
// original-directory identity bindings are shared gateway responsibilities.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { SCHEMA, failure, validateBatchId, historyProgress, validSummary, summarizeState,
  readStandaloneSummaries, recordStandaloneState, recordStandaloneExport, boundRun } = require('../gateway/standalone-history-store');

const MAPPING = 'DataSecure-Zuordnung.csv';
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
        return { ...fields, status, results_available: Boolean(run), ledger_available: ledger, resumable: canResume, _run: run };
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
  return { history, find, resolveResults, resolveLedger };
}

module.exports = { createRunHistory, validateBatchId };
