'use strict';

// Private, content-free run summaries outlive the source-copy/journal retention
// window. Export bindings are separate files because workers and UI readers may
// update a run summary while the export transaction publishes its destination.
// The shared gateway can load this store in both products; writes are no-ops
// outside Standalone, before any private directory is created.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataRoot } = require('../runtime');
const { ensurePrivateDirectory } = require('./common');
const { writeFully, syncParentDirectory, renameWithTransientRetry } = require('./batch-journal-io');
const { createBatchProgress } = require('./batch-progress');

const ID_RE = /^[a-f0-9]{64}$/u;
const EXPORT_RE = /^re_[a-f0-9]{32}$/u;
const SCHEMA = 'datasecure-standalone-history/1';
const BINDING_SCHEMA = 'datasecure-standalone-history-export/1';
const COUNT_FIELDS = ['selected_count', 'result_count', 'failed_count', 'completed_count', 'review_count'];
const MODES = ['markdown-only', 'markdown-and-anonymize'];
const { publicProgress: projectHistoryProgress } = createBatchProgress({
  deliveryPendingStatus: 'delivery_pending', deferredReviewStatus: 'deferred_review',
  mappingPendingStatus: 'mapping_pending', preflightMappingPendingStatus: 'preflight_mapping_pending',
  liveLocalExecutor: () => false
});

function historyProgress(state) {
  // Only item counters are needed here. Do not pass terminal evidence, which
  // would cause the live projection to verify artifact identities while saving
  // this lightweight history. The Standalone adapter checks executor liveness.
  return projectHistoryProgress({ items: state.items }, { skipResultProjection: true });
}

function failure(code) {
  return Object.assign(new Error('Der ausgewählte lokale Lauf ist nicht mehr verfügbar.'), { code });
}
function validateBatchId(value) {
  if (typeof value !== 'string' || !ID_RE.test(value)) throw failure('STANDALONE_HISTORY_INVALID');
  return value;
}
function exportId(token) {
  return `re_${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
}
function historyRoot() {
  const root = ensurePrivateDirectory(path.dirname(dataRoot()), path.basename(dataRoot()));
  return ensurePrivateDirectory(root, 'standalone-run-history');
}
function readJson(file) {
  const stat = fs.lstatSync(file, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1n || stat.size > 32768n) throw failure('STANDALONE_HISTORY_UNAVAILABLE');
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== stat.size) {
      throw failure('STANDALONE_HISTORY_UNAVAILABLE');
    }
    return JSON.parse(fs.readFileSync(descriptor, 'utf8'));
  } finally { fs.closeSync(descriptor); }
}
function writeJson(name, value) {
  const target = path.join(historyRoot(), `${name}.json`);
  const payload = JSON.stringify(value);
  try { if (JSON.stringify(readJson(target)) === payload) return; } catch { /* create/repair private projection */ }
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
  try { writeFully(descriptor, Buffer.from(payload), fs); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  renameWithTransientRetry(temporary, target);
  syncParentDirectory(target, fs, process.platform);
}
function validSummary(value) {
  const keys = ['schema', 'batch_id', 'export_id', 'created_at', 'processing_mode', 'complete', ...COUNT_FIELDS];
  return value?.schema === SCHEMA && Object.keys(value).sort().join(',') === keys.sort().join(',') &&
    ID_RE.test(value.batch_id) && EXPORT_RE.test(value.export_id) &&
    typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at)) &&
    MODES.includes(value.processing_mode) && typeof value.complete === 'boolean' &&
    COUNT_FIELDS.every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 100) &&
    value.completed_count === value.result_count + value.failed_count && value.completed_count <= value.selected_count;
}
function summarizeState(state) {
  if (state?.product_channel !== 'standalone' || !ID_RE.test(state.token) ||
      !Array.isArray(state.items) || !Number.isFinite(Date.parse(state.created_at))) return null;
  const progress = historyProgress(state);
  return {
    schema: SCHEMA, batch_id: state.token, export_id: exportId(state.token),
    created_at: new Date(state.created_at).toISOString(),
    processing_mode: state.processing_mode === 'markdown-only' ? 'markdown-only' : 'markdown-and-anonymize',
    selected_count: progress.batch_total, result_count: progress.released, failed_count: progress.stopped,
    completed_count: progress.completed, review_count: progress.deferred_review, complete: progress.complete
  };
}
function recordStandaloneState(state) {
  const summary = summarizeState(state);
  if (summary && validSummary(summary)) writeJson(summary.batch_id, summary);
}
function readStandaloneSummaries() {
  let files = [];
  try { files = fs.readdirSync(historyRoot(), { withFileTypes: true }); } catch { /* live journals still available */ }
  const summaries = [];
  for (const entry of files) {
    if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/u.test(entry.name)) continue;
    try {
      const value = readJson(path.join(historyRoot(), entry.name));
      if (validSummary(value) && exportId(value.batch_id) === value.export_id && entry.name === `${value.batch_id}.json`) {
        summaries.push(value);
      }
    } catch { /* damaged metadata never becomes a row or action */ }
  }
  return summaries;
}
function directoryBinding(target) {
  if (typeof target !== 'string' || !path.isAbsolute(target)) throw failure('STANDALONE_RESULTS_MISSING');
  const named = fs.lstatSync(target, { bigint: true });
  const real = fs.realpathSync.native(target);
  const comparable = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (!named.isDirectory() || named.isSymbolicLink() || comparable(real) !== comparable(target)) {
    throw failure('STANDALONE_RESULTS_MISSING');
  }
  return { path: path.resolve(target), dev: String(named.dev), ino: String(named.ino), birthtime: String(named.birthtimeNs) };
}
function recordStandaloneExport(recordTarget, record, runPath) {
  if (record?.product_channel !== 'standalone' || record.complete !== true) return;
  const id = path.basename(recordTarget, '.json');
  if (!EXPORT_RE.test(id)) return;
  // Never adopt a replacement folder after the original binding was recorded.
  if (fs.existsSync(path.join(historyRoot(), `${id}.json`))) return;
  const run = directoryBinding(runPath);
  const output = directoryBinding(path.dirname(run.path));
  const root = directoryBinding(path.dirname(output.path));
  writeJson(id, { schema: BINDING_SCHEMA, export_id: id, run, output, root });
}
function boundRun(id, expectedRunName) {
  try {
    const binding = readJson(path.join(historyRoot(), `${id}.json`));
    if (binding.schema !== BINDING_SCHEMA || binding.export_id !== id ||
        (expectedRunName && path.basename(binding.run.path) !== expectedRunName) ||
        path.dirname(binding.run.path) !== binding.output.path ||
        path.dirname(binding.output.path) !== binding.root.path ||
        !['DataSecure-Output', 'DataSecure-Markdown'].includes(path.basename(binding.output.path)) ||
        !/^Lauf-\d{8}-\d{6}-[a-f0-9]{8}$/u.test(path.basename(binding.run.path))) return '';
    for (const key of ['root', 'output', 'run']) {
      if (JSON.stringify(directoryBinding(binding[key].path)) !== JSON.stringify(binding[key])) return '';
    }
    return binding.run.path;
  } catch { return ''; }
}

module.exports = { SCHEMA, failure, validateBatchId, historyProgress, validSummary, summarizeState,
  readStandaloneSummaries, recordStandaloneState, recordStandaloneExport, boundRun };
