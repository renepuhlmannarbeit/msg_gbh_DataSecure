'use strict';
const { readHeldBytes, readBoundFile, readBoundFileRecord, bindDirectory, assertDirectory, fileIdentity, sameFile } = require('../core/bound-file-io');

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
const { RESOURCE_LIMITS } = require('../resource-limits');
const { createBatchActiveLock } = require('./batch-active-lock');
const { withDocumentControl } = require('./standalone-document-control');
const historyWindow = require('./standalone-history-window');

const ID_RE = /^[a-f0-9]{64}$/u;
const EXPORT_RE = /^re_[a-f0-9]{32}$/u;
const SCHEMA = 'datasecure-standalone-history/1';
const BINDING_SCHEMA = 'datasecure-standalone-history-export/1';
const CAPTURE_SCHEMA = 'datasecure-standalone-export-capture/1';
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
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const opened = fs.fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== stat.size) {
      throw failure('STANDALONE_HISTORY_UNAVAILABLE');
    }
    return JSON.parse(readHeldBytes(descriptor, opened.size, fs, 32768).toString('utf8'));
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
  if (value && (Object.hasOwn(value, 'content_notice_count') || Object.hasOwn(value, 'content_notice_breakdown_complete'))) {
    if (value.processing_mode !== 'markdown-and-anonymize' || !Number.isSafeInteger(value.content_notice_count) ||
        value.content_notice_count < 0 || value.content_notice_count > value.result_count ||
        typeof value.content_notice_breakdown_complete !== 'boolean') return false;
    keys.push('content_notice_count', 'content_notice_breakdown_complete');
  }
  if (value && Object.hasOwn(value, 'review_policy')) {
    if (value.review_policy !== 'automatic-conservative' || value.processing_mode !== 'markdown-and-anonymize') return false;
    keys.push('review_policy');
  }
  return value?.schema === SCHEMA && Object.keys(value).sort().join(',') === keys.sort().join(',') &&
    ID_RE.test(value.batch_id) && EXPORT_RE.test(value.export_id) &&
    typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at)) &&
    MODES.includes(value.processing_mode) && typeof value.complete === 'boolean' &&
    COUNT_FIELDS.every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0 &&
      value[key] <= RESOURCE_LIMITS.MAX_BATCH_FILES) &&
    value.completed_count === value.result_count + value.failed_count && value.completed_count <= value.selected_count;
}
function summarizeState(state) {
  if (state?.product_channel !== 'standalone' || !ID_RE.test(state.token) ||
      !Array.isArray(state.items) || !Number.isFinite(Date.parse(state.created_at))) return null;
  const progress = historyProgress(state);
  let policy;
  try { policy = require('../core/standalone-review-policy').reviewPolicyForBatch(state); }
  catch { return null; }
  return {
    schema: SCHEMA, batch_id: state.token, export_id: exportId(state.token),
    created_at: new Date(state.created_at).toISOString(),
    processing_mode: state.processing_mode === 'markdown-only' ? 'markdown-only' : 'markdown-and-anonymize',
    selected_count: progress.batch_total, result_count: progress.released, failed_count: progress.stopped,
    completed_count: progress.completed, review_count: progress.deferred_review, complete: progress.complete,
    ...(policy ? { review_policy: policy } : {})
  };
}
function readStandaloneSummary(batchId) {
  if (!ID_RE.test(batchId || '')) return null;
  try {
    const value = readJson(path.join(dataRoot(), 'standalone-run-history', `${batchId}.json`));
    return validSummary(value) && value.batch_id === batchId ? value : null;
  } catch { return null; }
}
function noticeSummary(value, expectedCount) {
  return value && value.result_count === expectedCount && Number.isSafeInteger(value.content_notice_count) &&
    value.content_notice_count >= 0 && value.content_notice_count <= expectedCount &&
    typeof value.content_notice_breakdown_complete === 'boolean'
    ? { content_notice_count: value.content_notice_count, content_notice_breakdown_complete: value.content_notice_breakdown_complete }
    : { content_notice_count: 0, content_notice_breakdown_complete: false };
}
function readStandaloneContentNoticeSummary(batchId, expectedCount) {
  if (!ID_RE.test(batchId || '')) return noticeSummary(null, expectedCount);
  try {
    const value = readJson(path.join(dataRoot(), 'standalone-run-history', `notices-${batchId}.json`));
    if (value.schema !== 'datasecure-standalone-content-notices/1' || value.batch_id !== batchId ||
        Object.keys(value).sort().join(',') !== 'batch_id,content_notice_breakdown_complete,content_notice_count,result_count,schema')
      return noticeSummary(null, expectedCount);
    return noticeSummary(value, expectedCount);
  } catch (error) {
    // Compatibility with the first local inline snapshot; a corrupt separate
    // cache must not be concealed by an older success claim.
    return noticeSummary(error?.code === 'ENOENT' ? readStandaloneSummary(batchId) : null, expectedCount);
  }
}
function recordStandaloneContentNoticeSummary(batchId, projection, expectedCount) {
  if (!ID_RE.test(batchId || '') || !Number.isSafeInteger(expectedCount) || expectedCount < 0 || expectedCount > 200 ||
      !Number.isSafeInteger(projection?.content_notice_count) || projection.content_notice_count < 0 ||
      projection.content_notice_count > expectedCount || typeof projection.content_notice_breakdown_complete !== 'boolean') return false;
  // Detail reads never rewrite the run summary: otherwise an old reader can
  // overwrite a newer worker completion. Serialize only the separate small
  // notice cache, so concurrent observations cannot erase a known minimum.
  const gate = createBatchActiveLock({ lockPath: () => path.join(historyRoot(), 'notice-summary.lock') });
  return withDocumentControl(gate, batchId, () => {
    const summary = readStandaloneSummary(batchId);
    if (!summary?.complete || summary.processing_mode !== 'markdown-and-anonymize' || summary.result_count !== expectedCount) return false;
    const previous = readStandaloneContentNoticeSummary(batchId, expectedCount);
    const retained = Math.max(previous.content_notice_count, projection.content_notice_count);
    const value = { schema: 'datasecure-standalone-content-notices/1', batch_id: batchId, result_count: expectedCount,
      content_notice_count: retained,
      content_notice_breakdown_complete: projection.content_notice_breakdown_complete && projection.content_notice_count >= retained };
    writeJson(`notices-${batchId}`, value); return true;
  });
}
function recordStandaloneState(state, options = {}) {
  const summary = summarizeState(state);
  if (!summary || !validSummary(summary)) return null;
  const previous = summary.processing_mode === 'markdown-and-anonymize' && summary.complete
    ? readStandaloneSummary(summary.batch_id) : null;
  if (previous?.complete && previous.processing_mode === summary.processing_mode && previous.result_count === summary.result_count &&
      Object.hasOwn(previous, 'content_notice_count')) {
    // Preserve the earlier local inline format before replacing run facts.
    // This migration reads only the compact projection, never artifacts.
    try { recordStandaloneContentNoticeSummary(summary.batch_id, noticeSummary(previous, summary.result_count), summary.result_count); }
    catch { return { ...summary, ...noticeSummary(previous, summary.result_count) }; /* preserve disk evidence; project current facts */ }
  }
  writeJson(summary.batch_id, summary);
  // Display membership is not a prerequisite for preserving a journal before
  // expiry, nor may its failure skip document/identity worker hooks.
  try { historyWindow.registerHistory(summary, historyWindowMigration); }
  catch { /* the independently read UI index fails closed; durable run facts remain valid */ }
  if (summary.processing_mode === 'markdown-and-anonymize' && summary.complete) {
    if (options.reconstructContentNotices !== false && state.schema === 'datasecure-batch/7') {
      // This is the actual terminal state-write path, not a status/list poll.
      // Reconstruct from bounded, independently bound publication manifests.
      const notices = require('../standalone/anonymization-notices').anonymizationContentNotices(summary.batch_id,
        { state, expectedCount: summary.result_count });
      try { recordStandaloneContentNoticeSummary(summary.batch_id, notices, summary.result_count); }
      catch { /* another observation owns the projection; no run facts are changed */ }
    }
    Object.assign(summary, readStandaloneContentNoticeSummary(summary.batch_id, summary.result_count));
  }
  return summary;
}
function readStandaloneSummaries({ includeContentNotices = true, omitBatchIds = [], batchIds = null } = {}) {
  // Only a caller's already validated, current journal projection can make its
  // duplicate compact summary unnecessary. This set lives for one call; it is
  // neither a persisted inventory nor an authority for a later result action.
  const omitted = new Set(Array.isArray(omitBatchIds)
    ? omitBatchIds.filter(value => typeof value === 'string' && ID_RE.test(value)) : []);
  let files, directory;
  try {
    // Creating/validating this private namespace once avoids repeating the full
    // parent walk for every retained row. Pin the original namespace for the
    // whole read, so a replaced parent cannot contribute a mixed projection.
    directory = bindDirectory(historyRoot());
    files = batchIds === null ? fs.readdirSync(directory.path, { withFileTypes: true })
      : batchIds.map(id => ({ name: `${validateBatchId(id)}.json`, isFile: () => true }));
    assertDirectory(directory);
  } catch { return []; } // live journals still available
  const summaries = [];
  for (const entry of files) {
    if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/u.test(entry.name)) continue;
    if (omitted.has(entry.name.slice(0, -5))) continue;
    try {
      const value = readJson(path.join(directory.path, entry.name));
      if (validSummary(value) && exportId(value.batch_id) === value.export_id && entry.name === `${value.batch_id}.json`) {
        summaries.push(includeContentNotices && value.processing_mode === 'markdown-and-anonymize' && value.complete
          ? { ...value, ...readStandaloneContentNoticeSummary(value.batch_id, value.result_count) } : value);
      }
    } catch { /* damaged metadata never becomes a row or action */ }
  }
  try { assertDirectory(directory); return summaries; }
  catch { return []; } // never publish rows borrowed from a replacement namespace
}
function historyWindowMigration() {
  // Old installations have random journal IDs. Discover dates ONCE from small
  // retained summaries, not from full journals or document/export manifests.
  // Recovery separately preserves a summary before it can retire a journal.
  const retrySnapshot = Symbol('history migration snapshot changed');
  const unavailable = () => failure('STANDALONE_HISTORY_UNAVAILABLE');
  let bytes = 0, entries = 0, budgetExceeded = false;
  // Count actual read work, including bytes read before a later failed check.
  // Reserve a throwing read's requested bytes conservatively as well.
  const io = { ...fs, readSync(fd, buffer, offset, length, position) {
    if (length > 64 * 1024 * 1024 - bytes) { budgetExceeded = true; throw unavailable(); }
    bytes += length;
    const count = fs.readSync(fd, buffer, offset, length, position);
    if (Number.isSafeInteger(count) && count >= 0 && count <= length) bytes -= length - count;
    return count;
  } };
  const directory = bindDirectory(historyRoot(), { io });
  const root = bindDirectory(dataRoot(), { io });
  const optional = name => {
    const target = path.join(root.path, name);
    let binding = null;
    try { binding = bindDirectory(target, { io }); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    return { path: target, binding };
  };
  // Bind once, even the optional owner/journal parents. A later attempt may
  // never adopt a replacement namespace or an initially absent directory.
  const exports = optional('result-export-state'), owners = optional('result-export-owners'), journals = optional('batches');
  const assertParents = () => {
    assertDirectory(root); assertDirectory(directory);
    for (const item of [exports, owners, journals]) {
      if (item.binding) { assertDirectory(item.binding); continue; }
      try { io.lstatSync(item.path); }
      catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
      throw unavailable();
    }
  };
  const names = () => io.readdirSync(directory.path).filter(name => /^[a-f0-9]{64}\.json$/u.test(name)).sort();
  const exportNames = () => exports.binding
    ? io.readdirSync(exports.path).filter(name => /^re_[a-f0-9]{32}\.json$/u.test(name)).sort() : [];
  for (let attempt = 0; attempt < 3; attempt++) {
    // Parent checks deliberately live outside the retry catch: their CHANGED
    // code is not evidence of a harmless leaf publication.
    assertParents();
    const initial = names(), initialExports = exportNames(), rows = [], observed = new Map(), skipped = new Map();
    entries += initial.length + initialExports.length;
    if (entries > 10000) throw unavailable();
    const read = (parent, name, maximum, listed = false) => {
      if (!parent) return null;
      const target = path.join(parent.path, name);
      let stat;
      try { stat = io.lstatSync(target, { bigint: true }); }
      catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        observed.set(target, null);
        if (listed) throw retrySnapshot;
        return null;
      }
      // Retain compatibility: damaged old projections are not candidates.
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1n || stat.size > BigInt(maximum)) {
        // Skipping old damage is not permission to miss a legitimate same-name
        // replacement during this snapshot. Observe metadata without opening
        // unsafe/oversized bytes and compare it again before publication.
        skipped.set(target, { identity: fileIdentity(stat), file: stat.isFile(), link: stat.isSymbolicLink() });
        return null;
      }
      if (stat.size > BigInt(64 * 1024 * 1024 - bytes)) throw unavailable();
      let record;
      try { record = readBoundFileRecord(target, { directory: parent, io, maximum, minimum: 1 }); }
      catch (error) {
        assertParents();
        if (budgetExceeded) throw unavailable();
        if (error?.code === 'BOUND_FILE_CHANGED' || error?.code === 'ENOENT') throw retrySnapshot;
        throw error; // in particular UNSAFE and unconfirmed close are final
      }
      observed.set(target, record.identity);
      try { return JSON.parse(record.bytes); } catch { return null; }
    };
    let selected;
    try {
      for (const name of initial) {
        const value = read(directory, name, 32768, true);
        if (validSummary(value) && value.batch_id === name.slice(0, -5) && exportId(value.batch_id) === value.export_id)
          rows.push({ batch_id: value.batch_id, created_at: new Date(value.created_at).toISOString() });
      }
      const knownExports = new Set(rows.map(row => exportId(row.batch_id)));
      for (const name of initialExports) {
        if (knownExports.has(name.slice(0, -5))) continue;
        const record = read(exports.binding, name, 1024 * 1024, true);
        // Search metadata, not a validated export receipt. Only the selected
        // five are later resolved with the full existing owner/anchor reader.
        const stamp = /^Lauf-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-[a-f0-9]{8}$/u.exec(record?.run_directory);
        if (record?.product_channel !== 'standalone' || !stamp || !Array.isArray(record.items) ||
            !/^datasecure-result-export\/[1-6]$/u.test(record.schema)) continue;
        let created_at = `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}.000Z`;
        if (!Number.isFinite(Date.parse(created_at)) || new Date(created_at).toISOString() !== created_at) continue;
        const id = name.slice(0, -5);
        let actualBatch = ID_RE.test(record.batch_id || '') && exportId(record.batch_id) === id ? record.batch_id : null;
        if (!actualBatch) {
          const owner = read(owners.binding, name, 4096);
          if (owner?.schema === 'datasecure-content-export-owner/1' && owner.product_channel === 'standalone' &&
              owner.record_name === name && ID_RE.test(owner.batch_id || '') && exportId(owner.batch_id) === id)
            actualBatch = owner.batch_id;
        }
        if (actualBatch) {
          const journal = read(journals.binding, `${actualBatch}.json`, 2 * 1024 * 1024);
          if (journal?.token === actualBatch && journal.product_channel === 'standalone' && typeof journal.created_at === 'string' && Number.isFinite(Date.parse(journal.created_at)))
            created_at = new Date(journal.created_at).toISOString();
          rows.push({ batch_id: actualBatch, created_at }); continue;
        }
        const batch_id = crypto.createHash('sha256').update(`standalone-history:${id}`).digest('hex');
        rows.push({ batch_id, created_at, legacy_export_id: id });
      }
      assertParents();
      if (JSON.stringify(names()) !== JSON.stringify(initial) || JSON.stringify(exportNames()) !== JSON.stringify(initialExports))
        throw retrySnapshot;
      for (const [target, identity] of observed) {
        let current;
        try { current = io.lstatSync(target, { bigint: true }); }
        catch (error) { if (error?.code !== 'ENOENT') throw error; if (identity) throw retrySnapshot; continue; }
        if (!identity || !sameFile(current, identity)) throw retrySnapshot;
      }
      for (const [target, before] of skipped) {
        let current;
        try { current = io.lstatSync(target, { bigint: true }); }
        catch (error) { if (error?.code === 'ENOENT') throw retrySnapshot; throw error; }
        if (current.isFile() !== before.file || current.isSymbolicLink() !== before.link ||
            JSON.stringify(fileIdentity(current)) !== JSON.stringify(before.identity)) throw retrySnapshot;
      }
      assertParents();
      selected = historyWindow.selectHistoryEntries(rows);
    } catch (error) {
      assertParents();
      if (error !== retrySnapshot) throw error;
      if (attempt === 2) throw unavailable();
      continue;
    }
    // Persist only selected legacy locators, not thousands of old lookup files.
    // These selected locators outlive later eviction, without becoming approval,
    // directory-binding, ownership or replay authority.
    for (const row of selected) if (row.legacy_export_id) {
      assertParents();
      const target = path.join(directory.path, `legacy-${row.batch_id}.json`);
      const temporary = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
      const payload = Buffer.from(JSON.stringify({ schema: 'datasecure-standalone-history-locator/1',
        batch_id: row.batch_id, legacy_export_id: row.legacy_export_id }));
      const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL |
        (fs.constants.O_NOFOLLOW || 0), 0o600);
      let identity;
      try {
        assertParents(); writeFully(fd, payload, fs); fs.fsyncSync(fd);
        identity = fileIdentity(fs.fstatSync(fd, { bigint: true }));
      } finally { fs.closeSync(fd); }
      assertParents();
      if (!sameFile(fs.lstatSync(temporary, { bigint: true }), identity)) throw unavailable();
      renameWithTransientRetry(temporary, target);
      syncParentDirectory(target, fs, process.platform);
      assertParents();
    }
    return selected;
  }
}
function readRecentHistory() { return historyWindow.readRecentHistory(historyWindowMigration); }
function readHistoryLocator(batchId) {
  validateBatchId(batchId);
  try {
    const directory = bindDirectory(path.join(dataRoot(), 'standalone-run-history'));
    const row = JSON.parse(readBoundFile(path.join(directory.path, `legacy-${batchId}.json`), { directory, maximum: 4096, minimum: 1 }));
    if (row?.schema !== 'datasecure-standalone-history-locator/1' || row.batch_id !== batchId ||
        Object.keys(row).sort().join(',') !== 'batch_id,legacy_export_id,schema' || !EXPORT_RE.test(row.legacy_export_id) ||
        crypto.createHash('sha256').update(`standalone-history:${row.legacy_export_id}`).digest('hex') !== batchId)
      throw failure('STANDALONE_HISTORY_UNAVAILABLE');
    return row.legacy_export_id;
  } catch (error) { if (error?.code === 'ENOENT') return null; throw failure('STANDALONE_HISTORY_UNAVAILABLE'); }
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
function validExportBinding(binding, id, expectedRunName) {
  const closed = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === keys.split(',').sort().join(',');
  return closed(binding, 'schema,export_id,run,output,root') && binding.schema === BINDING_SCHEMA && binding.export_id === id &&
    ['root', 'output', 'run'].every(key => closed(binding[key], 'path,dev,ino,birthtime') &&
      typeof binding[key].path === 'string' && path.isAbsolute(binding[key].path) &&
      ['dev', 'ino', 'birthtime'].every(field => typeof binding[key][field] === 'string' && /^\d+$/u.test(binding[key][field]))) &&
    (!expectedRunName || path.basename(binding.run.path) === expectedRunName) &&
    path.dirname(binding.run.path) === binding.output.path && path.dirname(binding.output.path) === binding.root.path &&
    ['DataSecure-Output', 'DataSecure-Markdown'].includes(path.basename(binding.output.path)) &&
    /^Lauf-\d{8}-\d{6}-[a-f0-9]{8}$/u.test(path.basename(binding.run.path));
}

// Startup capture is a backup boundary, NOT an export/approval authority.
// Hash actual held bytes and membership on every start. Unchanged captured
// inputs may skip the full export/anchor reader. That reader is now linear,
// but still has to validate each record and its independent owner afresh.
// Never use size/mtime as evidence of unchanged content. UI actions still go
// through the original export reader and live destination identity checks.
function exportCaptureSnapshot() {
  try {
    const root = bindDirectory(dataRoot()), history = bindDirectory(path.join(root.path, 'standalone-run-history'));
    const source = crypto.createHash('sha256'), bindings = crypto.createHash('sha256');
    let bytes = 0, records = 0;
    const requiredBindings = [], knownBindings = new Map();
    const add = (digest, name, value) => { digest.update(JSON.stringify([name, value])); digest.update('\n'); };
    const directory = (name, digest) => {
      const target = path.join(root.path, name);
      try {
        const bound = bindDirectory(target);
        add(digest, name, bound.chain[0].identity);
        return bound;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        add(digest, name, null); return null;
      }
    };
    const read = (bound, name, maximum, digest, label = name) => {
      const data = readBoundFile(path.join(bound.path, name), { directory: bound, maximum, minimum: 1 });
      bytes += data.length;
      if (bytes > 64 * 1024 * 1024) throw failure('STANDALONE_HISTORY_UNAVAILABLE');
      add(digest, label, crypto.createHash('sha256').update(data).digest('hex'));
      return data;
    };
    const names = (bound, pattern) => {
      const entries = fs.readdirSync(bound.path, { withFileTypes: true });
      if (entries.length > 10000) throw failure('STANDALONE_HISTORY_UNAVAILABLE');
      return entries.filter(row => pattern.test(row.name)).map(row => row.name).sort();
    };
    add(source, 'schema', CAPTURE_SCHEMA); add(source, 'private-root', root.chain[0].identity);
    add(source, 'result-root-override', String(process.env.EU_PRIVACY_RESULT_ROOT || ''));
    const outbox = directory('result-export-state', source);
    if (outbox) for (const name of names(outbox, /^re_[a-f0-9]{32}\.json(?:\.waived)?$/u)) {
      const data = read(outbox, name, 1024 * 1024, source, `export:${name}`);
      if (name.endsWith('.json')) {
        records++;
        const value = JSON.parse(data);
        if (!value || value.product_channel !== 'standalone' || typeof value.complete !== 'boolean' ||
            !Array.isArray(value.items) || value.items.length > 200 ||
            !/^Lauf-\d{8}-\d{6}-[a-f0-9]{8}$/u.test(value.run_directory)) throw failure('STANDALONE_HISTORY_UNAVAILABLE');
        if (value.complete && value.items.length) requiredBindings.push([name.slice(0, -5), value.run_directory]);
      }
    }
    const owners = directory('result-export-owners', source);
    if (owners) for (const name of names(owners, /^re_[a-f0-9]{32}\.json$/u)) read(owners, name, 4096, source, `owner:${name}`);
    const reviews = directory('document-reviews', source);
    if (reviews) for (const name of names(reviews, /^[a-f0-9]{64}$/u)) {
      const run = bindDirectory(path.join(reviews.path, name));
      add(source, `review:${name}`, run.chain[0].identity);
      read(run, 'manifest.json', 1024 * 1024, source, `review-manifest:${name}`); assertDirectory(run);
    }
    const settings = directory('settings', source);
    if (settings) {
      try { read(settings, 'result-root.json', 128 * 1024, source, 'result-root-config'); }
      catch (error) { if (error?.code !== 'ENOENT') throw error; add(source, 'result-root-config', null); }
    }
    add(bindings, 'history-root', history.chain[0].identity);
    for (const name of names(history, /^re_[a-f0-9]{32}\.json$/u))
      knownBindings.set(name.slice(0, -5), JSON.parse(read(history, name, 32768, bindings, name)));
    for (const bound of [root, history, outbox, owners, reviews, settings].filter(Boolean)) assertDirectory(bound);
    return { source_digest: source.digest('hex'), binding_digest: bindings.digest('hex'), record_count: records,
      captured: requiredBindings.every(([id, name]) => validExportBinding(knownBindings.get(id), id, name)),
      assertDirectories() { for (const bound of [root, history, outbox, owners, reviews, settings].filter(Boolean)) assertDirectory(bound); } };
  } catch { return null; } // absent/linked/changed/oversized inputs require the original full capture
}
function captureIndexRecord() {
  const directory = bindDirectory(path.join(dataRoot(), 'standalone-run-history'));
  return readBoundFileRecord(path.join(directory.path, 'export-capture-index.json'),
    { directory, maximum: 4096, minimum: 1 });
}
function captureIndexPin(record) {
  return { schema: 'datasecure-standalone-export-capture-pin/1',
    sha256: crypto.createHash('sha256').update(record.bytes).digest('hex'),
    dev: String(record.stat.dev), ino: String(record.stat.ino), birthtime: String(record.stat.birthtimeNs) };
}
function captureStandaloneExports(readExports, { useIndex = false, requireCurrentBindings = false } = {}) {
  const before = useIndex && !requireCurrentBindings ? exportCaptureSnapshot() : null;
  let index;
  try {
    if (before) {
      const record = captureIndexRecord();
      const pin = readJson(path.join(dataRoot(), 'standalone-run-history', 'export-capture-index-pin.json'));
      if (JSON.stringify(pin) === JSON.stringify(captureIndexPin(record))) index = JSON.parse(record.bytes);
    }
  } catch { /* missing/corrupt/replaced acceleration requires the full reader */ }
  let reusable = before?.captured && index?.schema === CAPTURE_SCHEMA && Object.keys(index).sort().join(',') ===
      'binding_digest,export_count,record_count,schema,source_digest' &&
      Number.isSafeInteger(index.export_count) && index.export_count >= 0 && index.export_count === before.record_count &&
      index.record_count === before.record_count && index.source_digest === before.source_digest && index.binding_digest === before.binding_digest;
  if (reusable) {
    try { before.assertDirectories(); } catch { reusable = false; }
    if (reusable) return { export_count: index.export_count, export_capture_reused: true };
  }
  const exports = readExports();
  let cacheable = Boolean(before && exports.length === before.record_count);
  for (const record of exports) {
    if (record.directory) {
      try { recordStandaloneExport(record.target, { product_channel: 'standalone', complete: record.complete }, record.directory); }
      catch { cacheable = false; }
    }
    // Changing the configured root can remove the only way to rediscover an
    // older result directory. For an interactive change, verify the durable
    // binding while the old root still resolves that completed export.
    if (requireCurrentBindings && record.directory && record.complete === true && record.summary?.result_count > 0) {
      if (!EXPORT_RE.test(record.export_id) || typeof record.run_directory !== 'string' ||
          typeof record.directory !== 'string' || !path.isAbsolute(record.directory))
        throw failure('STANDALONE_HISTORY_UNAVAILABLE');
      const bound = inspectBoundRun(record.export_id, record.run_directory);
      const comparable = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
      if (bound.availability !== 'available' || comparable(bound.path) !== comparable(record.directory))
        throw failure('STANDALONE_HISTORY_UNAVAILABLE');
    }
    if (cacheable && record.complete === true && record.summary?.result_count > 0) {
      try {
        if (!validExportBinding(readJson(path.join(dataRoot(), 'standalone-run-history', `${record.export_id}.json`)),
          record.export_id, record.run_directory)) cacheable = false;
      } catch { cacheable = false; }
    }
  }
  if (cacheable) {
    const after = exportCaptureSnapshot();
    if (after?.captured && before.source_digest === after.source_digest && before.record_count === after.record_count) {
      try {
        after.assertDirectories();
        writeJson('export-capture-index', { schema: CAPTURE_SCHEMA, source_digest: after.source_digest,
          binding_digest: after.binding_digest, record_count: after.record_count, export_count: exports.length });
        writeJson('export-capture-index-pin', captureIndexPin(captureIndexRecord()));
      }
      catch { /* optional acceleration never changes capture or startup readiness */ }
    }
  }
  return { export_count: exports.length, export_capture_reused: false };
}
function inspectBoundRun(id, expectedRunName) {
  let binding;
  try { binding = readJson(path.join(historyRoot(), `${id}.json`)); }
  catch { return { availability: 'unknown' }; }
  try {
    if (!validExportBinding(binding, id, expectedRunName)) return { availability: 'unsafe' };
    for (const key of ['root', 'output', 'run']) {
      if (JSON.stringify(directoryBinding(binding[key].path)) !== JSON.stringify(binding[key])) return { availability: 'unsafe' };
    }
    return { availability: 'available', path: binding.run.path };
  } catch (error) { return { availability: error.code === 'ENOENT' ? 'missing' : 'unsafe' }; }
}
function boundRun(id, expectedRunName) { return inspectBoundRun(id, expectedRunName).path || ''; }

module.exports = { SCHEMA, failure, validateBatchId, historyProgress, validSummary, summarizeState,
  readRecentHistory, readHistoryLocator,
  readStandaloneSummaries, readStandaloneSummary, readStandaloneContentNoticeSummary, recordStandaloneContentNoticeSummary,
  recordStandaloneState, recordStandaloneExport, captureStandaloneExports, boundRun, inspectBoundRun };
