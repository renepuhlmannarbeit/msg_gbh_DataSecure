'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readBoundFile, readBoundFileRecord, assertDirectory } = require('../core/bound-file-io');
const { identity: privateIdentity, safeUnlinkBoundPrivateFile } = require('./bound-private-file');
const { dataRoot } = require('../runtime');
const { safeResolvePackage, readVerifiedFile } = require('./package-store');
const { inspectRoot, readConfiguredResultRoot, resultOutputDirectory } = require('./result-folder-config');
const { writeFully, syncParentDirectory, renameWithTransientRetry, linkWithTransientRetry } = require('./batch-journal-io');
const { processAlive } = require('./process-liveness');
const { csvField } = require('./mapping');
const { readMarkdownArtifact, verifyMarkdownItem } = require('../standalone/markdown-store');
const { readAnonymizedArtifact } = require('../standalone/anonymized-store');
const { confirmPublication } = require('./standalone-anonymized-batch');
const identityLedger = require('../standalone/identity-ledger');
const { validateCoverage, MAX_MARKDOWN_CHARS } = require('../standalone/markdown-contract');
const { RESOURCE_LIMITS } = require('../resource-limits');
const { MODES: RESULT_NAMING_MODES, resultNamingModeForBatch } = require('../core/result-naming-mode');
const { isMarkdownBatch } = require('../core/processing-mode');
const { contentOptionsForBatch, validateContentOptions, serializeContentOptions } = require('../core/content-options');
const { ensurePrivateDirectory } = require('./common');
const { createPrivateWorkStore } = require('./private-work-store');

const SCHEMA = 'datasecure-result-export/2';
const MARKDOWN_SCHEMA = 'datasecure-result-export/4';
const CONTENT_MARKDOWN_SCHEMA = 'datasecure-result-export/5';
const CONTENT_ANONYMIZED_SCHEMA = 'datasecure-result-export/6';
const LEGACY_MARKDOWN_SCHEMA = 'datasecure-result-export/3';
const isMarkdownRecord = value => [CONTENT_MARKDOWN_SCHEMA, MARKDOWN_SCHEMA, LEGACY_MARKDOWN_SCHEMA].includes(value?.schema);
const LEGACY_SCHEMA = 'datasecure-result-export/1';
const VISIBLE_MAPPING_FILE = 'DataSecure-Zuordnung.csv';
// A UTF-8 BOM makes the user-visible CSV open correctly in Windows Excel.
// The durable private mapping remains an internal protocol artifact and is
// intentionally unaffected.
const VISIBLE_MAPPING_HEADER = '\uFEFFOriginaldatei;Anonymisiertes Ergebnis\r\n';
const RECORD_RE = /^re_[a-f0-9]{32}\.json$/u;
// An interrupted atomic record write leaves exactly this temporary name behind.
// It carries no export state and must neither count as a damaged record nor be
// removed while a concurrent worker may still be writing it.
const TEMPORARY_RECORD_RE = /^re_[a-f0-9]{32}\.json\.\d+\.[a-f0-9]{8}\.tmp$/u;
const CLAIM_RE = /^re_[a-f0-9]{32}\.json\.claim$/u;
const WAIVER_RE = /^re_[a-f0-9]{32}\.json\.waived$/u;
const PACKAGE_RE = /^ds_[a-f0-9]{32}$/u;
const CLAIM_SCHEMA = 'datasecure-result-export-claim/1';
const WAIVER_SCHEMA = 'datasecure-result-export-waiver/1';
const CLAIM_ID_RE = /^[a-f0-9]{32}$/u;
const TRANSIENT_CLAIM_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

function claimRetryDelay(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function comparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
function bindPlainDirectory(directory, parent = null) {
  const named = fs.lstatSync(directory);
  const opened = fs.statSync(directory);
  const real = fs.realpathSync.native(directory);
  if (!named.isDirectory() || named.isSymbolicLink() || !opened.isDirectory() ||
      named.dev !== opened.dev || named.ino !== opened.ino ||
      comparablePath(real) !== comparablePath(directory) ||
      (parent && comparablePath(path.dirname(real)) !== comparablePath(parent.real))) {
    throw new Error('RESULT_EXPORT_PATH_UNSAFE');
  }
  return { path: directory, real: path.resolve(real), dev: String(opened.dev), ino: String(opened.ino), birthtime: String(Math.trunc(opened.birthtimeMs)) };
}
function assertDirectoryBinding(binding, parent = null) {
  const current = bindPlainDirectory(binding.path, parent);
  if (current.dev !== binding.dev || current.ino !== binding.ino || current.birthtime !== binding.birthtime ||
      comparablePath(current.real) !== comparablePath(binding.real)) throw new Error('RESULT_EXPORT_PATH_UNSAFE');
  return current;
}

function outboxDirectory() {
  const directory = path.join(dataRoot(), 'result-export-state');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  return directory;
}
function recordPath(token) {
  const id = crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 32);
  return path.join(outboxDirectory(), `re_${id}.json`);
}
function claimPath(target) { return `${target}.claim`; }
function waiverPath(target) { return `${target}.waived`; }
function validClaim(value) {
  return exactKeys(value, ['schema', 'claim_id', 'pid', 'created_at']) && value.schema === CLAIM_SCHEMA &&
    CLAIM_ID_RE.test(value.claim_id) && Number.isSafeInteger(value.pid) && value.pid > 0 &&
    typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at));
}
function readClaim(target) {
  try {
    const checked = readBoundFileRecord(target, { maximum: 1024, minimum: 1 });
    const { stat: opened } = checked;
    const value = JSON.parse(checked.bytes);
    return validClaim(value) ? { value, dev: opened.dev, ino: opened.ino, size: opened.size, checked } : null;
  } catch { return null; }
}
function removeClaimIfUnchanged(target, expected, attempts = 1) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = readClaim(target);
    if (!current || current.value.claim_id !== expected.value.claim_id || current.dev !== expected.dev ||
        current.ino !== expected.ino || current.size !== expected.size) return false;
    try {
      const { checked } = current;
      const parent = checked.directory.chain[0].identity;
      safeUnlinkBoundPrivateFile(target, { binding: {
        target: checked.path, parent: checked.directory.path, file: privateIdentity(checked.stat),
        parentIdentity: { dev: parent.dev, ino: parent.ino }
      }, validate: () => assertDirectory(checked.directory) });
      return true;
    }
    catch (error) {
      if (!TRANSIENT_CLAIM_CODES.has(error?.retry_code || error?.code) || attempt === attempts - 1) return false;
      claimRetryDelay(10 * (attempt + 1));
    }
  }
  return false;
}
function acquireExportClaim(recordTarget) {
  const target = claimPath(recordTarget);
  const existing = readClaim(target);
  if (existing) {
    if (processAlive(existing.value.pid) || !removeClaimIfUnchanged(target, existing)) return null;
  } else if (fs.existsSync(target)) {
    // A malformed, replaced or permission-hidden private claim is never stolen.
    return null;
  }
  const value = { schema: CLAIM_SCHEMA, claim_id: crypto.randomBytes(16).toString('hex'),
    pid: process.pid, created_at: new Date().toISOString() };
  let descriptor;
  try {
    descriptor = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL |
      (fs.constants.O_NOFOLLOW || 0), 0o600);
    writeFully(descriptor, Buffer.from(`${JSON.stringify(value)}\n`, 'utf8'), fs);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    syncParentDirectory(target, fs, process.platform);
    const claim = readClaim(target);
    return claim?.value.claim_id === value.claim_id ? claim : null;
  } catch (error) {
    if (error?.code === 'EEXIST') return null;
    throw error;
  } finally {
    try { if (descriptor !== undefined) fs.closeSync(descriptor); } catch {}
  }
}
function releaseExportClaim(recordTarget, claim) {
  return claim ? removeClaimIfUnchanged(claimPath(recordTarget), claim, 4) : false;
}
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
function validSourceLabel(value) {
  const label = String(value || '');
  if (!label || label.length > 1024 || label.includes('\\') || label.startsWith('/') ||
      /[\0-\x1f\x7f]/u.test(label) || /^[A-Za-z]:/u.test(label)) return false;
  return label.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}
function validResultFile(value) {
  const file = String(value || '');
  return file.endsWith('.md') && validSourceLabel(file);
}
function outputNameFromSource(sourceLabel, suffix = '') {
  const label = String(sourceLabel || '');
  if (!validSourceLabel(label)) throw new Error('RESULT_EXPORT_MAPPING_SOURCE_INVALID');
  const leaf = label.split('/').at(-1);
  const extension = path.posix.extname(leaf);
  const stem = leaf.slice(0, extension ? -extension.length : undefined) || 'Dokument';
  const parent = path.posix.dirname(label);
  const name = `${stem}${suffix}.md`;
  return parent === '.' ? name : `${parent}/${name}`;
}
function collisionFreeOutputNames(items, suffix = '') {
  const used = new Set();
  return items.map((item) => {
    const sourceLabel = String(item.source_label || '');
    let occurrence = 1;
    let name = outputNameFromSource(sourceLabel, suffix);
    while (used.has(name.normalize('NFC').toLowerCase())) {
      occurrence += 1;
      const leaf = sourceLabel.split('/').at(-1);
      const extension = path.posix.extname(leaf);
      const stem = leaf.slice(0, extension ? -extension.length : undefined) || 'Dokument';
      const parent = path.posix.dirname(sourceLabel);
      const resolvedLeaf = `${stem} (${occurrence})${suffix}.md`;
      name = parent === '.' ? resolvedLeaf : `${parent}/${resolvedLeaf}`;
    }
    used.add(name.normalize('NFC').toLowerCase());
    return name;
  });
}
const { flatMarkdownOutputNames } = require('../core/markdown-output-names');
function markdownOutputNames(items) {
  return collisionFreeOutputNames(items);
}
function neutralAnonymizedOutputNames(items) {
  return items.map((item, index) => {
    const sourceLabel = String(item.source_label || '');
    if (!validSourceLabel(sourceLabel)) throw new Error('RESULT_EXPORT_MAPPING_SOURCE_INVALID');
    const parent = path.posix.dirname(sourceLabel);
    const leaf = `Dokument-${String(index + 1).padStart(3, '0')}-anonymisiert.md`;
    return parent === '.' ? leaf : `${parent}/${leaf}`;
  });
}
function validRecord(value) {
  const legacy = value?.schema === LEGACY_SCHEMA;
  const converting = isMarkdownRecord(value), contentBound = [CONTENT_MARKDOWN_SCHEMA, CONTENT_ANONYMIZED_SCHEMA].includes(value?.schema);
  if (contentBound) {
    try { validateContentOptions(value.content_options); } catch { return false; }
    if (!/^[a-f0-9]{64}$/u.test(String(value.batch_id || ''))) return false;
  }
  const sourceLabels = !legacy && Array.isArray(value?.items)
    ? [
        ...value.items.map((item) => item?.source_label),
        ...(Array.isArray(value?.stopped_items) ? value.stopped_items.map((item) => item?.source_label) : [])
      ]
    : [];
  // A source can have exactly one final outcome in a run.  Rejecting an
  // ambiguous durable record here prevents a corrupt or stale stop entry from
  // appearing next to the successful mapping of the same input file.
  const sourceLabelsAreUnique = legacy || new Set(sourceLabels).size === sourceLabels.length;
  const expectedMarkdownNames = converting && [MARKDOWN_SCHEMA, CONTENT_MARKDOWN_SCHEMA].includes(value?.schema) && Array.isArray(value.items)
    ? markdownOutputNames(value.items) : null;
  const legacyFlatMarkdownNames = converting && value?.schema === MARKDOWN_SCHEMA && Array.isArray(value.items)
    ? flatMarkdownOutputNames(value.items) : null;
  const expectedSourceAnonymizedNames = !converting && !legacy && value?.product_channel === 'standalone' && Array.isArray(value.items)
    ? collisionFreeOutputNames(value.items, '-anonymisiert') : null;
  const expectedNeutralAnonymizedNames = !converting && !legacy && value?.product_channel === 'standalone' && Array.isArray(value.items)
    ? neutralAnonymizedOutputNames(value.items) : null;
  const topLevelKeys = legacy
    ? ['schema', 'run_directory', 'items', 'complete', 'destination_id']
    : ['schema', 'run_directory', 'items', 'complete', 'destination_id', 'product_channel'];
  if (!legacy && Object.hasOwn(value || {}, 'stopped_items')) topLevelKeys.push('stopped_items');
  if (converting || value?.schema === CONTENT_ANONYMIZED_SCHEMA) topLevelKeys.push('processing_mode');
  if (contentBound) topLevelKeys.push('content_options', 'batch_id');
  return exactKeys(value, topLevelKeys) &&
    [SCHEMA, LEGACY_SCHEMA, MARKDOWN_SCHEMA, LEGACY_MARKDOWN_SCHEMA, CONTENT_MARKDOWN_SCHEMA, CONTENT_ANONYMIZED_SCHEMA].includes(value.schema) &&
    (value.schema !== CONTENT_ANONYMIZED_SCHEMA || value.product_channel === 'standalone' &&
      value.processing_mode === 'markdown-and-anonymize') &&
    (!converting || (value.product_channel === 'standalone' && value.processing_mode === 'markdown-only')) &&
    (legacy || ['plugin', 'standalone'].includes(value.product_channel)) &&
    /^Lauf-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$/u.test(value.run_directory) &&
    typeof value.complete === 'boolean' && /^(?:|[a-f0-9]{64})$/u.test(value.destination_id) &&
    Array.isArray(value.items) && value.items.length <= RESOURCE_LIMITS.MAX_BATCH_FILES &&
    sourceLabelsAreUnique &&
    (!Object.hasOwn(value, 'stopped_items') || (value.product_channel === 'standalone' &&
      Array.isArray(value.stopped_items) && value.stopped_items.length > 0 &&
      value.stopped_items.length + value.items.length <= RESOURCE_LIMITS.MAX_BATCH_FILES &&
      value.stopped_items.every((item) => exactKeys(item, ['source_label', 'error_code']) &&
        validSourceLabel(item.source_label) && /^[A-Z][A-Z0-9_]{0,95}$/u.test(item.error_code)))) &&
    value.items.every((item, index) => converting ? validMarkdownExportItem(item, index, value.schema) : (legacy
      ? (exactKeys(item, ['package_id', 'file', 'sha256']) ||
        (exactKeys(item, ['package_id', 'file', 'sha256', 'exported']) && item.exported === true))
      : ((exactKeys(item, ['package_id', 'file', 'sha256', 'source_label']) ||
        (exactKeys(item, ['package_id', 'file', 'sha256', 'source_label', 'exported']) && item.exported === true)) &&
        validSourceLabel(item.source_label))) &&
      PACKAGE_RE.test(item.package_id) && /^[a-f0-9]{64}$/u.test(item.sha256) &&
      (item.file === `Dokument-${String(index + 1).padStart(3, '0')}-anonymisiert.md` ||
        (value.product_channel === 'standalone' && validResultFile(item.file) &&
          (item.file === expectedSourceAnonymizedNames?.[index] ||
            item.file === expectedNeutralAnonymizedNames?.[index])))) &&
    (!expectedMarkdownNames || value.items.every((item, index) =>
      item.file === expectedMarkdownNames[index] || item.file === legacyFlatMarkdownNames?.[index]));
}
function validMarkdownExportItem(item, index, schema) {
  const keys = ['artifact_id', 'artifact_bytes', 'file', 'sha256', 'source_label', 'extraction_grade', 'reason_codes'];
  if (!exactKeys(item, keys) && !exactKeys(item, [...keys, 'exported'])) return false;
  if (Object.hasOwn(item, 'exported') && item.exported !== true) return false;
  if (!/^dm_[a-f0-9]{32}$/u.test(String(item.artifact_id || '')) || !validSourceLabel(item.source_label) ||
      !Number.isSafeInteger(item.artifact_bytes) || item.artifact_bytes < 0 || item.artifact_bytes > MAX_MARKDOWN_CHARS * 4 ||
      !/^[a-f0-9]{64}$/u.test(String(item.sha256 || '')) ||
      (schema === LEGACY_MARKDOWN_SCHEMA
        ? item.file !== `Dokument-${String(index + 1).padStart(3, '0')}-konvertiert.md`
        : !validResultFile(item.file))) return false;
  try { validateCoverage({ status: item.extraction_grade, reason_codes: item.reason_codes }); }
  catch { return false; }
  return true;
}
// Every item that has been written once is final on its own (DS-023): it is
// never re-checked or re-created, even while a sibling item of the same run
// still fails and keeps the record as a whole incomplete.
function planItem(item) {
  const { exported, ...plain } = item;
  return plain;
}
function writeRecord(target, value) {
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
    writeFully(descriptor, Buffer.from(JSON.stringify(value), 'utf8'), fs);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    renameWithTransientRetry(temporary, target);
    syncParentDirectory(target, fs, process.platform);
  } finally {
    try { if (descriptor !== undefined) fs.closeSync(descriptor); } catch {}
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {}
  }
}
function readRecord(target) {
  // Up to 200 relative source labels (1024 characters each), JSON escaping,
  // fixed error codes and hashes must fit without relaxing item/string bounds.
  let value;
  try { value = JSON.parse(readBoundFile(target, { maximum: 1024 * 1024, minimum: 1 })); }
  catch { throw new Error('RESULT_EXPORT_STATE_UNSAFE'); }
  if (!validRecord(value)) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  assertRecordContentAnchor(target, value);
  return value;
}
// This content-free receipt is an irreversible instruction not to resume an
// incomplete visible export. Keep it separate from the mutable export record:
// its pending count must never be mistaken for a completed export receipt.
function exportPlanDigest(record) {
  const { complete, items, ...fixed } = record;
  return crypto.createHash('sha256').update(JSON.stringify({ ...fixed, items: items.map(planItem) })).digest('hex');
}
function waiverExists(target) {
  try { fs.lstatSync(waiverPath(target)); return true; }
  catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  }
}
function readExportWaiver(target, record) {
  if (!waiverExists(target)) return null;
  let value;
  try { value = JSON.parse(readBoundFile(waiverPath(target), { maximum: 1024, minimum: 1 })); }
  catch { throw new Error('RESULT_EXPORT_STATE_UNSAFE'); }
  if (record.schema !== CONTENT_ANONYMIZED_SCHEMA || record.complete === true ||
      !exactKeys(value, ['schema', 'decision', 'batch_id', 'plan_sha256', 'exported_count', 'pending_count', 'created_at']) ||
      value.schema !== WAIVER_SCHEMA || value.decision !== 'abandon-visible-export' || value.batch_id !== record.batch_id ||
      value.plan_sha256 !== exportPlanDigest(record) ||
      value.exported_count !== exportedCount(record) ||
      value.pending_count !== record.items.length - exportedCount(record) ||
      value.pending_count < 0 || typeof value.created_at !== 'string' ||
      !Number.isFinite(Date.parse(value.created_at))) {
    throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  }
  return value;
}
function writeExportWaiver(target, record) {
  const value = { schema: WAIVER_SCHEMA, decision: 'abandon-visible-export', batch_id: record.batch_id,
    plan_sha256: exportPlanDigest(record), exported_count: exportedCount(record),
    pending_count: record.items.length - exportedCount(record), created_at: new Date().toISOString() };
  let descriptor;
  try {
    descriptor = fs.openSync(waiverPath(target), fs.constants.O_WRONLY | fs.constants.O_CREAT |
      fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
    writeFully(descriptor, Buffer.from(JSON.stringify(value), 'utf8'), fs);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    syncParentDirectory(waiverPath(target), fs, process.platform);
    readExportWaiver(target, record);
    return value;
  } finally {
    try { if (descriptor !== undefined) fs.closeSync(descriptor); } catch {}
    // A partial receipt is deliberately retained. It blocks replay until a
    // human diagnoses it; deleting it here could silently restart copying.
  }
}
function exportOwnerBinding(state, recordName) {
  return { schema: 'datasecure-content-export-owner/1', record_name: recordName, batch_id: state.token,
    product_channel: state.product_channel, processing_mode: state.processing_mode, content_options: contentOptionsForBatch(state) };
}
function readExportOwner(recordName) {
  const directory = path.join(dataRoot(), 'result-export-owners'), file = path.join(directory, recordName);
  if (!fs.existsSync(file)) return null;
  const value = JSON.parse(readBoundFile(file, { maximum: 4096, minimum: 1 }));
  if (!exactKeys(value, ['schema', 'record_name', 'batch_id', 'product_channel', 'processing_mode', 'content_options']) ||
      value.schema !== 'datasecure-content-export-owner/1' || value.record_name !== recordName || value.product_channel !== 'standalone' ||
      !/^[a-f0-9]{64}$/u.test(String(value.batch_id || '')) ||
      !['markdown-only', 'markdown-and-anonymize'].includes(value.processing_mode) ||
      `re_${crypto.createHash('sha256').update(value.batch_id).digest('hex').slice(0, 32)}.json` !== recordName)
    throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  value.content_options = validateContentOptions(value.content_options);
  return value;
}
function ensureContentExportOwner(state, target) {
  const name = path.basename(target), binding = exportOwnerBinding(state, name);
  const owner = readExportOwner(name);
  if (owner) {
    if (owner.batch_id !== binding.batch_id || owner.processing_mode !== binding.processing_mode ||
        serializeContentOptions(owner.content_options) !== serializeContentOptions(binding.content_options)) throw new Error('RESULT_EXPORT_STATE_CONFLICT');
    return;
  }
  const directory = ensurePrivateDirectory(dataRoot(), 'result-export-owners');
  // Independent immutable owner survives deletion/damage of a document run.
  // Never replace it while writing/replaying the mutable export progress.
  createPrivateWorkStore({ privateRoot: directory, maxBytes: 4096 }).writeFile(path.join(directory, name), Buffer.from(JSON.stringify(binding)));
  if (JSON.stringify(readExportOwner(name)) !== JSON.stringify(binding)) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
}
function assertRecordContentAnchor(target, record) {
  const name = path.basename(target), reviews = path.join(dataRoot(), 'document-reviews');
  if (!RECORD_RE.test(name)) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  const owner = readExportOwner(name);
  const contentBound = [CONTENT_MARKDOWN_SCHEMA, CONTENT_ANONYMIZED_SCHEMA].includes(record.schema);
  if (owner && (!contentBound || record.batch_id !== owner.batch_id ||
      record.processing_mode !== owner.processing_mode ||
      serializeContentOptions(record.content_options) !== serializeContentOptions(owner.content_options))) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  // Discover ownership from the independent run directory, not from optional
  // fields/version in the mutable export record. A legacy disguise may delete
  // both batch_id and content_options; the record path still binds its owner.
  const matches = fs.existsSync(reviews) ? fs.readdirSync(reviews).filter(token => /^[a-f0-9]{64}$/u.test(token) &&
    `re_${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}.json` === name) : [];
  if (matches.length > 1) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  if (!matches.length) {
    if (owner || contentBound) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
    return; // a genuine old result with no document-review owner
  }
  const token = matches[0], directory = bindPlainDirectory(path.join(reviews, token), bindPlainDirectory(reviews));
  const anchor = JSON.parse(readBoundFile(path.join(directory.path, 'manifest.json'), { maximum: 1024 * 1024, minimum: 1,
    validateParents: () => assertDirectoryBinding(directory) }));
  const bound = anchor.schema === 'datasecure-document-run/3';
  if (bound !== contentBound || anchor.batch_id !== token ||
      anchor.processing_mode !== (record.processing_mode || 'markdown-and-anonymize') || bound &&
      (record.batch_id !== token || serializeContentOptions(anchor.content_options) !== serializeContentOptions(record.content_options)))
    throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  require('./standalone-document-review-store').createDocumentReviewStore().assertContentBinding({
    schema: bound ? 'datasecure-batch/7' : 'datasecure-batch/4', token, product_channel: record.product_channel,
    processing_mode: anchor.processing_mode, standalone_document_review: true, ...(bound ? { content_options: record.content_options } : {}) });
}
function runDirectoryName(createdAt) {
  const date = new Date(createdAt);
  const stamp = Number.isFinite(date.getTime())
    ? date.toISOString().replace(/[-:]/gu, '').replace('T', '-').slice(0, 15)
    : new Date().toISOString().replace(/[-:]/gu, '').replace('T', '-').slice(0, 15);
  return `Lauf-${stamp}-${crypto.randomBytes(4).toString('hex')}`;
}
function packageItem(packageId, index, sourceLabel, outputFile) {
  const { m } = safeResolvePackage(packageId);
  if (!m || !/^[a-f0-9]{64}$/u.test(String(m.document_sha256 || ''))) throw new Error('RESULT_EXPORT_SOURCE_INVALID');
  const item = {
    package_id: packageId,
    file: outputFile || `Dokument-${String(index + 1).padStart(3, '0')}-anonymisiert.md`,
    sha256: m.document_sha256,
    source_label: String(sourceLabel || '')
  };
  if (!validSourceLabel(item.source_label)) throw new Error('RESULT_EXPORT_MAPPING_SOURCE_INVALID');
  if (!validResultFile(item.file)) throw new Error('RESULT_EXPORT_PATH_UNSAFE');
  return item;
}
function contentAnonymizedItem(state, item, index, outputFile) {
  const published = confirmPublication(state, item);
  const artifact = readAnonymizedArtifact(item.package_id, published.publication_binding);
  if (artifact.manifest.document_sha256 !== published.publication_binding.document_sha256 ||
      JSON.stringify(artifact.manifest.document_result) !== JSON.stringify(item.document_result))
    throw new Error('RESULT_EXPORT_SOURCE_INVALID');
  const value = { package_id: item.package_id,
    file: outputFile || `Dokument-${String(index + 1).padStart(3, '0')}-anonymisiert.md`,
    sha256: artifact.manifest.document_sha256, source_label: String(item.source_label || item.name || '') };
  if (!validSourceLabel(value.source_label) || !validResultFile(value.file)) throw new Error('RESULT_EXPORT_MAPPING_SOURCE_INVALID');
  return value;
}
function migrateLegacyRecord(target, record, sourceLabels, productChannel) {
  if (record.schema !== LEGACY_SCHEMA) return record;
  const labels = sourceLabels;
  if (!Array.isArray(labels) || labels.length !== record.items.length || labels.some((label) => !validSourceLabel(label))) {
    throw new Error('RESULT_EXPORT_MAPPING_SOURCE_INVALID');
  }
  if (!['plugin', 'standalone'].includes(productChannel)) throw new Error('RESULT_EXPORT_PRODUCT_CHANNEL_INVALID');
  const migrated = {
    ...record,
    schema: SCHEMA,
    product_channel: productChannel,
    items: record.items.map((item, index) => ({ ...item, source_label: labels[index] })),
    // A v1 record could only prove document export. v2 becomes complete after
    // the run-scoped mapping has also been published and verified.
    complete: record.items.length === 0
  };
  writeRecord(target, migrated);
  return migrated;
}
function activeDestination(record, options = {}) {
  const root = readConfiguredResultRoot();
  if (!root) return null;
  const checked = inspectRoot(root);
  const rootBinding = bindPlainDirectory(checked.root);
  let outputPath;
  if (options.create === false) {
    outputPath = path.join(checked.root, isMarkdownRecord(record) ? 'DataSecure-Markdown' : 'DataSecure-Output');
  } else if (isMarkdownRecord(record)) {
    outputPath = path.join(checked.root, 'DataSecure-Markdown');
    if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { mode: 0o700 });
  } else outputPath = resultOutputDirectory({ root: checked.root });
  const outputBinding = bindPlainDirectory(outputPath, rootBinding);
  const legacyMaterial = `${checked.root}\0${checked.identity.dev}\0${checked.identity.ino}\0${checked.identity.birthtime_ms}`;
  const material = `${legacyMaterial}\0${outputBinding.real}\0${outputBinding.dev}\0${outputBinding.ino}\0${outputBinding.birthtime}`;
  return {
    id: crypto.createHash('sha256').update(material).digest('hex'),
    legacyId: crypto.createHash('sha256').update(legacyMaterial).digest('hex'),
    root: rootBinding,
    output: outputBinding
  };
}
function ensureRecord(state) {
  const contentOptions = contentOptionsForBatch(state);
  require('./standalone-document-review-store').createDocumentReviewStore().assertContentBinding(state);
  const converting = isMarkdownBatch(state);
  const target = recordPath(state.token);
  // Conversion is a single visible run: partial files stay internal until all
  // processing decisions are terminal. No early plan may freeze a subset.
  if (converting && state.items.some((item) => !['released', 'stopped'].includes(item.status))) throw new Error('RESULT_EXPORT_BATCH_INCOMPLETE');
  if (contentOptions) ensureContentExportOwner(state, target);
  const existingPlan = fs.existsSync(target) ? readRecord(target) : null;
  const completedMarkdownRecord = converting && fs.existsSync(target) && completedMarkdownExportMatches(state);
  const completedAnonymizedRecord = !converting && contentOptions && existingPlan?.schema === CONTENT_ANONYMIZED_SCHEMA &&
    completedContentAnonymizedExportMatches(state, existingPlan);
  const released = state.items.filter((item) => item.status === 'released');
  const anonymizedItems = released.map((item) => ({
    source_label: String(item.source_label || item.name || '')
  }));
  const outputNamingMode = converting ? null : resultNamingModeForBatch(state);
  const anonymizedNames = !converting && state.product_channel === 'standalone'
    ? outputNamingMode === RESULT_NAMING_MODES.NEUTRAL
      ? neutralAnonymizedOutputNames(anonymizedItems)
      : collisionFreeOutputNames(anonymizedItems, '-anonymisiert')
    : [];
  const markdownNames = converting
    ? existingPlan?.items?.length === released.length
      ? existingPlan.items.map((item) => item.file)
      : existingPlan?.schema === LEGACY_MARKDOWN_SCHEMA
      ? released.map((_item, index) => `Dokument-${String(index + 1).padStart(3, '0')}-konvertiert.md`)
      : markdownOutputNames(released.map((item) => ({ source_label: String(item.source_label || item.name || '') })))
    : [];
  const items = released.map((item, index) => {
    if (!converting) return contentOptions
      ? completedAnonymizedRecord ? planItem(existingPlan.items[index]) : contentAnonymizedItem(state, item, index,
        existingPlan?.items?.length === released.length ? existingPlan.items[index].file : anonymizedNames[index])
      : packageItem(item.package_id, index, item.source_label || item.name,
        existingPlan?.items?.length === released.length ? existingPlan.items[index].file : anonymizedNames[index]);
    if (!completedMarkdownRecord && !verifyMarkdownItem(item, contentOptions)) throw new Error('RESULT_EXPORT_SOURCE_INVALID');
    const sourceLabel = String(item.source_label || item.name || '');
    if (!validSourceLabel(sourceLabel)) throw new Error('RESULT_EXPORT_MAPPING_SOURCE_INVALID');
    return { artifact_id: item.artifact_id, artifact_bytes: item.artifact_bytes,
      file: markdownNames[index], sha256: item.artifact_sha256,
      source_label: sourceLabel, extraction_grade: item.extraction_grade, reason_codes: [...item.reason_codes] };
  });
  const stoppedItems = state.product_channel === 'standalone'
    ? state.items.filter((item) => item.status === 'stopped').map((item) => ({
      source_label: String(item.source_label || item.name || ''),
      error_code: /^[A-Z][A-Z0-9_]{0,95}$/u.test(String(item.error_code || ''))
        ? item.error_code : 'PROCESSING_STOPPED'
    })) : [];
  if (stoppedItems.some((item) => !validSourceLabel(item.source_label))) throw new Error('RESULT_EXPORT_MAPPING_SOURCE_INVALID');
  if (existingPlan) {
    let existing = existingPlan;
    if (converting !== isMarkdownRecord(existing)) throw new Error('RESULT_EXPORT_MODE_INVALID');
    if (Boolean(contentOptions) !== [CONTENT_MARKDOWN_SCHEMA, CONTENT_ANONYMIZED_SCHEMA].includes(existing.schema) ||
        contentOptions && (existing.schema !== (converting ? CONTENT_MARKDOWN_SCHEMA : CONTENT_ANONYMIZED_SCHEMA) ||
      (existing.batch_id !== state.token || serializeContentOptions(contentOptions) !== serializeContentOptions(existing.content_options)))) throw new Error('RESULT_EXPORT_STATE_CONFLICT');
    if (existing.schema === LEGACY_SCHEMA) {
      existing = migrateLegacyRecord(target, existing, items.map((item) => item.source_label), state.product_channel);
    }
    if (JSON.stringify(existing.items.map(planItem)) !== JSON.stringify(items)) throw new Error('RESULT_EXPORT_STATE_CONFLICT');
    if (existing.stopped_items && JSON.stringify(existing.stopped_items) !== JSON.stringify(stoppedItems)) {
      throw new Error('RESULT_EXPORT_STATE_CONFLICT');
    }
    // An already published mapping is user-owned and must never be rewritten.
    // Older empty records published nothing, so they can gain their missing summary.
    if (stoppedItems.length && !existing.stopped_items && existing.items.length === 0) {
      existing = { ...existing, stopped_items: stoppedItems, complete: false };
      writeRecord(target, existing);
    }
    return { target, value: existing };
  }
  if (!['plugin', 'standalone'].includes(state.product_channel)) throw new Error('RESULT_EXPORT_PRODUCT_CHANNEL_INVALID');
  const value = { schema: contentOptions ? converting ? CONTENT_MARKDOWN_SCHEMA : CONTENT_ANONYMIZED_SCHEMA : converting ? MARKDOWN_SCHEMA : SCHEMA,
    run_directory: runDirectoryName(state.created_at), items,
    complete: items.length === 0 && stoppedItems.length === 0, destination_id: '', product_channel: state.product_channel,
    ...(converting || contentOptions ? { processing_mode: state.processing_mode } : {}),
    ...(contentOptions ? { content_options: contentOptions, batch_id: state.token } : {}),
    ...(stoppedItems.length ? { stopped_items: stoppedItems } : {}) };
  writeRecord(target, value);
  return { target, value };
}
// Once a complete, identity-bound visible conversion was committed,
// the private dm copy may expire. This proves the historical export transaction,
// not that the user has retained or left their visible files unchanged.
function completedMarkdownExportMatches(state) {
  try {
    require('./standalone-document-review-store').createDocumentReviewStore().assertContentBinding(state);
    if (!isMarkdownBatch(state) || !Array.isArray(state.items) ||
        state.items.some((item) => !['released', 'stopped'].includes(item.status))) return false;
    const record = readRecord(recordPath(state.token));
    const contentOptions = contentOptionsForBatch(state);
    if (!isMarkdownRecord(record) || Boolean(contentOptions) !== (record.schema === CONTENT_MARKDOWN_SCHEMA) || contentOptions &&
        (record.batch_id !== state.token || serializeContentOptions(contentOptions) !== serializeContentOptions(record.content_options)) ||
        record.complete !== true || !/^[a-f0-9]{64}$/u.test(record.destination_id) ||
        record.items.some((item) => item.exported !== true)) return false;
    const released = state.items.filter((item) => item.status === 'released');
    if (released.length !== record.items.length) return false;
    for (let index = 0; index < released.length; index++) {
      const item = released[index], saved = record.items[index];
      if (item.artifact_id !== saved.artifact_id || item.artifact_sha256 !== saved.sha256 ||
          item.artifact_bytes !== saved.artifact_bytes || item.extraction_grade !== saved.extraction_grade ||
          String(item.source_label || item.name || '') !== saved.source_label ||
          JSON.stringify(item.reason_codes) !== JSON.stringify(saved.reason_codes) ||
          (Object.hasOwn(item, 'id') && item.artifact_id !== `dm_${item.id}`)) return false;
    }
    const stopped = state.items.filter((item) => item.status === 'stopped').map((item) => ({
      source_label: String(item.source_label || item.name || ''),
      error_code: /^[A-Z][A-Z0-9_]{0,95}$/u.test(String(item.error_code || '')) ? item.error_code : 'PROCESSING_STOPPED'
    }));
    return JSON.stringify(stopped) === JSON.stringify(record.stopped_items || []);
  } catch { return false; }
}
// The completed, owner-bound export record is the durable receipt. After all
// visible files were committed, retention may remove the private /4 artifact;
// a status reread must not turn that successful transaction into a failure.
// The independent document basis still proves the exact exported digest.
function completedContentAnonymizedExportMatches(state, record) {
  try {
    require('./standalone-document-review-store').createDocumentReviewStore().assertContentBinding(state);
    if (isMarkdownBatch(state) || !Array.isArray(state.items) ||
        state.items.some((item) => !['released', 'stopped'].includes(item.status))) return false;
    const options = contentOptionsForBatch(state);
    if (!options || record.schema !== CONTENT_ANONYMIZED_SCHEMA || record.batch_id !== state.token ||
        serializeContentOptions(options) !== serializeContentOptions(record.content_options) ||
        record.complete !== true || !/^[a-f0-9]{64}$/u.test(record.destination_id) ||
        record.items.some((item) => item.exported !== true)) return false;
    const released = state.items.filter((item) => item.status === 'released');
    if (released.length !== record.items.length) return false;
    const review = require('./standalone-document-review-store').createDocumentReviewStore();
    for (let index = 0; index < released.length; index++) {
      const item = released[index], saved = record.items[index];
      const expected = review.publicationExpectation(state.token, item.id);
      if (saved.package_id !== expected.package_id || saved.sha256 !== expected.document_sha256 ||
          serializeContentOptions(expected.content_options) !== serializeContentOptions(options) ||
          saved.source_label !== String(item.source_label || item.name || '') ||
          JSON.stringify(item.document_result) !== JSON.stringify({ schema: 'datasecure-document-result/1',
            grade: 'complete', omissions: [], reason_code: null })) return false;
    }
    const stopped = state.items.filter((item) => item.status === 'stopped').map((item) => ({
      source_label: String(item.source_label || item.name || ''),
      error_code: /^[A-Z][A-Z0-9_]{0,95}$/u.test(String(item.error_code || '')) ? item.error_code : 'PROCESSING_STOPPED'
    }));
    return JSON.stringify(stopped) === JSON.stringify(record.stopped_items || []);
  } catch { return false; }
}
function ensurePlainDirectory(destination, name) {
  assertDirectoryBinding(destination.root);
  assertDirectoryBinding(destination.output, destination.root);
  const parent = destination.output.path;
  const target = path.join(parent, name);
  if (path.dirname(target) !== parent || name === '.' || name === '..' || /[\\/\0]/u.test(name)) throw new Error('RESULT_EXPORT_PATH_UNSAFE');
  if (!fs.existsSync(target)) fs.mkdirSync(target, { mode: 0o700 });
  assertDirectoryBinding(destination.root);
  assertDirectoryBinding(destination.output, destination.root);
  return bindPlainDirectory(target, destination.output);
}
function ensureResultParent(destination, run, relativeFile) {
  if (!validResultFile(relativeFile)) throw new Error('RESULT_EXPORT_PATH_UNSAFE');
  assertDirectoryBinding(destination.root);
  assertDirectoryBinding(destination.output, destination.root);
  let parent = run;
  const segments = relativeFile.split('/');
  const leaf = segments.pop();
  for (const segment of segments) {
    assertDirectoryBinding(parent, parent.path === run.path ? destination.output : null);
    const target = path.join(parent.path, segment);
    if (path.dirname(target) !== parent.path) throw new Error('RESULT_EXPORT_PATH_UNSAFE');
    if (!fs.existsSync(target)) fs.mkdirSync(target, { mode: 0o700 });
    parent = bindPlainDirectory(target, parent);
  }
  assertDirectoryBinding(parent, parent.path === run.path ? destination.output : null);
  return { parent, leaf, target: path.join(parent.path, leaf) };
}
function exportOne(destination, run, item, contentOptions, contentRecord) {
  assertDirectoryBinding(destination.root);
  assertDirectoryBinding(destination.output, destination.root);
  assertDirectoryBinding(run, destination.output);
  const resolvedTarget = ensureResultParent(destination, run, item.file);
  const target = resolvedTarget.target;
  assertDirectoryBinding(resolvedTarget.parent);
  const validateParents = () => {
    assertDirectoryBinding(destination.root);
    assertDirectoryBinding(destination.output, destination.root);
    assertDirectoryBinding(run, destination.output);
    assertDirectoryBinding(resolvedTarget.parent);
  };
  if (fs.existsSync(target)) {
    try {
      const existing = readBoundFile(target, { maximum: 32 * 1024 * 1024, maxLinks: 2, validateParents });
      if (crypto.createHash('sha256').update(existing).digest('hex') !== item.sha256) throw new Error('conflict');
    } catch { throw new Error('RESULT_EXPORT_CONFLICT'); }
    return false;
  }
  let bytes, m;
  if (Object.hasOwn(item, 'artifact_id')) {
    const artifact = readMarkdownArtifact(item.artifact_id, contentOptions);
    m = artifact.manifest;
    if (m.document_bytes !== item.artifact_bytes || m.extraction_grade !== item.extraction_grade ||
        JSON.stringify(m.reason_codes) !== JSON.stringify(item.reason_codes)) throw new Error('RESULT_EXPORT_SOURCE_INVALID');
    bytes = Buffer.from(artifact.markdown, 'utf8');
  } else if (contentRecord?.schema === CONTENT_ANONYMIZED_SCHEMA) {
    const expectation = require('./standalone-document-review-store').createDocumentReviewStore()
      .publicationExpectation(contentRecord.batch_id, item.package_id.slice(3));
    if (expectation.package_id !== item.package_id ||
        serializeContentOptions(expectation.content_options) !== serializeContentOptions(contentRecord.content_options))
      throw new Error('RESULT_EXPORT_SOURCE_INVALID');
    const artifact = readAnonymizedArtifact(item.package_id, expectation);
    m = artifact.manifest;
    bytes = Buffer.from(artifact.markdown, 'utf8');
  } else {
    const resolved = safeResolvePackage(item.package_id);
    m = resolved.m;
    bytes = readVerifiedFile(resolved.p, m.document, 32 * 1024 * 1024);
  }
  const expected = crypto.createHash('sha256').update(bytes).digest('hex');
  if (expected !== m.document_sha256 || expected !== item.sha256) throw new Error('RESULT_EXPORT_SOURCE_INVALID');
  const temporary = path.join(resolvedTarget.parent.path, `.${resolvedTarget.leaf}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  let descriptor;
  try {
    assertDirectoryBinding(destination.root);
    assertDirectoryBinding(destination.output, destination.root);
    assertDirectoryBinding(run, destination.output);
    assertDirectoryBinding(resolvedTarget.parent);
    descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
    writeFully(descriptor, bytes, fs);
    fs.fsyncSync(descriptor);
    const opened = fs.fstatSync(descriptor);
    const named = fs.lstatSync(temporary);
    if (!opened.isFile() || !named.isFile() || named.isSymbolicLink() || opened.nlink !== 1 || named.nlink !== 1 ||
        opened.dev !== named.dev || opened.ino !== named.ino) throw new Error('RESULT_EXPORT_PATH_UNSAFE');
    fs.closeSync(descriptor);
    descriptor = undefined;
    assertDirectoryBinding(destination.root);
    assertDirectoryBinding(destination.output, destination.root);
    assertDirectoryBinding(run, destination.output);
    assertDirectoryBinding(resolvedTarget.parent);
    // Publish without replacement. A plain rename is atomic but may overwrite
    // a file created after the earlier existence check on POSIX. A same-volume
    // hard link is an atomic create-if-absent operation on all release targets.
    linkWithTransientRetry(temporary, target);
    const linkedTemporary = fs.lstatSync(temporary);
    const linkedTarget = fs.lstatSync(target);
    if (!linkedTemporary.isFile() || !linkedTarget.isFile() || linkedTemporary.isSymbolicLink() ||
        linkedTarget.isSymbolicLink() || linkedTemporary.nlink !== 2 || linkedTarget.nlink !== 2 ||
        linkedTemporary.dev !== linkedTarget.dev || linkedTemporary.ino !== linkedTarget.ino) {
      throw new Error('RESULT_EXPORT_VERIFY_FAILED');
    }
    fs.unlinkSync(temporary);
    syncParentDirectory(target, fs, process.platform);
    assertDirectoryBinding(destination.root);
    assertDirectoryBinding(destination.output, destination.root);
    assertDirectoryBinding(run, destination.output);
    assertDirectoryBinding(resolvedTarget.parent);
    try {
      const written = readBoundFile(target, { maximum: bytes.length, minimum: bytes.length, maxLinks: 2, validateParents });
      if (crypto.createHash('sha256').update(written).digest('hex') !== expected) throw new Error('verify');
    } catch { throw new Error('RESULT_EXPORT_VERIFY_FAILED'); }
    return true;
  } finally {
    try { if (descriptor !== undefined) fs.closeSync(descriptor); } catch {}
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {}
  }
}
function visibleMappingBytes(record) {
  if (![SCHEMA, CONTENT_ANONYMIZED_SCHEMA, LEGACY_MARKDOWN_SCHEMA].includes(record.schema) ||
      record.items.some((item) => !validSourceLabel(item.source_label))) {
    throw new Error('RESULT_EXPORT_MAPPING_SOURCE_INVALID');
  }
  const converting = record.schema === LEGACY_MARKDOWN_SCHEMA;
  const notices = {
    DOCX_HEADER_FOOTER_EXCLUDED_BY_POLICY: 'DOCX-Kopf- und Fußzeilen gemäß Ausgaberegel nicht enthalten',
    OCR_CONTACT_VALUES_UNVERIFIED: 'OCR-Kontaktwerte können Zeichenfehler enthalten; betroffene OCR-Zeilen und Seiten stehen im Markdown',
    OCR_NOT_VERIFIED: 'OCR-Texterkennung nicht fachlich geprüft',
    OCR_TEXT_EMPTY: 'Kein Text durch OCR erkannt',
    SOURCE_COVERAGE_UNVERIFIED: 'Vollständigkeit der Inhaltsextraktion nicht bestätigt',
    VISUAL_CONTENT_NOT_EXTRACTED: 'Bilder oder visuelle Inhalte nicht vollständig als Markdown enthalten'
  };
  const rows = record.items.map((item) => [item.source_label, item.file,
    ...(converting ? ['Nicht anonymisiert', item.extraction_grade === 'complete'
      ? 'Text vollständig extrahiert' : item.reason_codes.map((code) => notices[code]).join(' · ')] : [])].map(csvField).join(';'));
  // Current anonymization ledgers are mappings, not failure reports: every
  // row must point to an actually published result.  Legacy conversion plans
  // retain their previously promised stopped-row format for crash recovery.
  if (record.schema === LEGACY_MARKDOWN_SCHEMA) {
    for (const item of record.stopped_items || []) {
      rows.push([item.source_label, `Kein Ergebnis – gestoppt (${item.error_code})`, '', 'Nicht konvertiert'].map(csvField).join(';'));
    }
  }
  const header = converting ? '\uFEFFOriginaldatei;Konvertiertes Markdown;Datenschutz;Extraktionshinweis\r\n' : VISIBLE_MAPPING_HEADER;
  return Buffer.from(header + rows.join('\r\n') + (rows.length ? '\r\n' : ''), 'utf8');
}
function exportVisibleMapping(destination, run, record) {
  assertDirectoryBinding(destination.root);
  assertDirectoryBinding(destination.output, destination.root);
  assertDirectoryBinding(run, destination.output);
  const target = path.join(run.path, VISIBLE_MAPPING_FILE);
  const bytes = visibleMappingBytes(record);
  const expected = crypto.createHash('sha256').update(bytes).digest('hex');
  const validateParents = () => {
    assertDirectoryBinding(destination.root);
    assertDirectoryBinding(destination.output, destination.root);
    assertDirectoryBinding(run, destination.output);
  };
  if (fs.existsSync(target)) {
    try {
      const existing = readBoundFile(target, { maximum: bytes.length, minimum: bytes.length, maxLinks: 2, validateParents });
      if (crypto.createHash('sha256').update(existing).digest('hex') !== expected) throw new Error('conflict');
    } catch {
      throw new Error('RESULT_EXPORT_MAPPING_CONFLICT');
    }
    return false;
  }
  const temporary = path.join(run.path, `.${VISIBLE_MAPPING_FILE}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL |
      (fs.constants.O_NOFOLLOW || 0), 0o600);
    writeFully(descriptor, bytes, fs);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    assertDirectoryBinding(destination.root);
    assertDirectoryBinding(destination.output, destination.root);
    assertDirectoryBinding(run, destination.output);
    linkWithTransientRetry(temporary, target);
    const linkedTemporary = fs.lstatSync(temporary);
    const linkedTarget = fs.lstatSync(target);
    if (!linkedTemporary.isFile() || !linkedTarget.isFile() || linkedTemporary.isSymbolicLink() ||
        linkedTarget.isSymbolicLink() || linkedTemporary.nlink !== 2 || linkedTarget.nlink !== 2 ||
        linkedTemporary.dev !== linkedTarget.dev || linkedTemporary.ino !== linkedTarget.ino) {
      throw new Error('RESULT_EXPORT_VERIFY_FAILED');
    }
    fs.unlinkSync(temporary);
    syncParentDirectory(target, fs, process.platform);
    try {
      const written = readBoundFile(target, { maximum: bytes.length, minimum: bytes.length, maxLinks: 2, validateParents });
      if (crypto.createHash('sha256').update(written).digest('hex') !== expected) throw new Error('verify');
    } catch {
      throw new Error('RESULT_EXPORT_VERIFY_FAILED');
    }
    return true;
  } finally {
    try { if (descriptor !== undefined) fs.closeSync(descriptor); } catch {}
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {}
  }
}
function releasedCount(state) {
  return Array.isArray(state?.items) ? state.items.filter((item) => item?.status === 'released').length : 0;
}
function exportedCount(record) {
  return record.items.filter((item) => item.exported === true).length;
}
function resultExportFailure(code) {
  return Object.assign(new Error(code), { code });
}
function abandonPendingResultExport(state) {
  if (state?.product_channel !== 'standalone' || state.processing_mode !== 'markdown-and-anonymize' ||
      !/^[a-f0-9]{64}$/u.test(String(state.token || '')) || !Array.isArray(state.items) ||
      !state.items.every((item) => ['released', 'stopped'].includes(item.status)) ||
      require('./batch-active-lock').liveLocalExecutor(state)) throw resultExportFailure('RESULT_EXPORT_ABANDON_UNAVAILABLE');
  const target = recordPath(state.token);
  const claim = acquireExportClaim(target);
  if (!claim) throw resultExportFailure('RESULT_EXPORT_BUSY');
  let result;
  let released = false;
  try {
    if (!fs.existsSync(target) && waiverExists(target)) throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
    // A failed first publication may not have written its export plan yet.
    // Mint that plan under the same claim, then immediately waive it; never
    // require a user-visible copy merely to make the safe exit available.
    const record = fs.existsSync(target) ? readRecord(target) : ensureRecord(state).value;
    const releasedItems = state.items.filter(item => item.status === 'released');
    const stoppedItems = state.items.filter(item => item.status === 'stopped');
    if (record.schema !== CONTENT_ANONYMIZED_SCHEMA || record.batch_id !== state.token ||
        serializeContentOptions(record.content_options) !== serializeContentOptions(contentOptionsForBatch(state)) ||
        record.complete === true || record.items.length === 0 ||
        record.items.length !== releasedItems.length ||
        (record.stopped_items?.length || 0) !== stoppedItems.length ||
        record.items.some((item, index) => item.package_id !== releasedItems[index].package_id ||
          item.source_label !== String(releasedItems[index].source_label || releasedItems[index].name || '')) ||
        (record.stopped_items || []).some((item, index) =>
          item.source_label !== String(stoppedItems[index].source_label || stoppedItems[index].name || '') ||
          item.error_code !== stoppedItems[index].error_code) ||
        require('./batch-active-lock').liveLocalExecutor(state)) throw resultExportFailure('RESULT_EXPORT_ABANDON_UNAVAILABLE');
    const waiver = readExportWaiver(target, record) || writeExportWaiver(target, record);
    result = { abandoned: true, exported: waiver.exported_count, pending: waiver.pending_count, available: false };
  } finally { released = releaseExportClaim(target, claim); }
  if (!released) throw resultExportFailure('RESULT_EXPORT_BUSY');
  return result;
}
// Exports the still-open items of one record into the active destination and
// persists every single success immediately, so a later failure of a sibling
// item can never make an already written (and possibly user-deleted) result
// eligible again. Throws after persisting the progress when an item fails.
function exportOpenItems(target, record, destination) {
  let current = record;
  if (!current.destination_id) {
    // A partially written legacy record without a destination binding cannot
    // be continued safely: its already exported files may live elsewhere.
    if (exportedCount(current) > 0) throw new Error('RESULT_EXPORT_DESTINATION_UNBOUND');
    current = { ...current, destination_id: destination.id };
    writeRecord(target, current);
  } else if (current.destination_id !== destination.id) {
    if (current.destination_id === destination.legacyId && exportedCount(current) === 0) {
      current = { ...current, destination_id: destination.id };
      writeRecord(target, current);
    } else throw new Error('RESULT_EXPORT_DESTINATION_CHANGED');
  }
  const run = ensurePlainDirectory(destination, current.run_directory);
  for (let index = 0; index < current.items.length; index++) {
    const item = current.items[index];
    if (item.exported === true) continue;
    exportOne(destination, run, item, current.schema === CONTENT_MARKDOWN_SCHEMA ? current.content_options : undefined, current);
    const items = current.items.map((entry, position) => position === index ? { ...planItem(entry), exported: true } : entry);
    current = { ...current, items };
    writeRecord(target, current);
  }
  if (current.items.every((item) => item.exported === true)) {
    // Pure conversion keeps the original basename and therefore needs no
    // source-to-result ledger. Older v3 plans retain their already promised
    // mapping; anonymization plans continue to publish it unchanged.
    if (current.product_channel === 'standalone' && ![MARKDOWN_SCHEMA, CONTENT_MARKDOWN_SCHEMA].includes(current.schema) &&
        (current.schema === LEGACY_MARKDOWN_SCHEMA || current.items.length > 0)) {
      exportVisibleMapping(destination, run, current);
    }
    current = { ...current, complete: true };
    writeRecord(target, current);
    try {
      if (current.product_channel === 'standalone') require('./standalone-history-store').recordStandaloneExport(target, current, run.path);
    }
    catch { /* private history cannot change a committed user export */ }
  }
  return current;
}

function visibleExportStatus(token, expectedReleased = 0) {
  const expected = Number.isSafeInteger(expectedReleased) && expectedReleased >= 0 ? expectedReleased : 0;
  try {
    const target = recordPath(token);
    if (!fs.existsSync(target)) return { exported: 0, pending: expected, available: expected === 0 };
    const record = readRecord(target);
    const exported = exportedCount(record);
    const pending = Math.max(0, record.items.length - exported);
    if (readExportWaiver(target, record)) return { exported, pending, available: false, abandoned: true };
    // Status and the native Open action must agree. A completed record remains
    // final after a configured destination changes, but it is no longer an
    // openable result in the currently selected product destination.
    const available = record.complete === true && pending === 0 && visibleExportDirectory(token) !== '';
    const completionPending = record.complete !== true && pending === 0 &&
      (record.items.length > 0 || record.stopped_items?.length > 0);
    // All documents may already be final while the run mapping or final record
    // write still fails. Keep that debt separate: document counters must retain
    // exported + pending == released, including an all-stopped (zero-result) run.
    return { exported, pending, available, ...(completionPending ? { completion_pending: true } : {}) };
  } catch {
    return { exported: 0, pending: expected, available: false };
  }
}

// Resolve exactly one completed visible run for native local UI actions. The
// path may be displayed through the private Standalone UI contract, but is
// never projected to Claude, public MCP responses or diagnostics.
function visibleExportDirectory(token) {
  try {
    const target = recordPath(token);
    if (!fs.existsSync(target)) return '';
    const record = readRecord(target);
    if (record.complete !== true || record.items.length === 0 ||
        record.items.some((item) => item.exported !== true)) return '';
    const destination = activeDestination(record);
    if (!destination || destination.id !== record.destination_id) return '';
    assertDirectoryBinding(destination.root);
    assertDirectoryBinding(destination.output, destination.root);
    const runPath = path.join(destination.output.path, record.run_directory);
    if (!fs.existsSync(runPath)) return '';
    return bindPlainDirectory(runPath, destination.output).path;
  } catch {
    return '';
  }
}
function publishStandaloneIdentityIfPossible(state) {
  if (state?.product_channel !== 'standalone' || state.processing_mode === 'markdown-only') return;
  try {
    const runPath = visibleExportDirectory(state.token);
    if (!runPath) return;
    identityLedger.materialize(state);
    identityLedger.publishDocumentToRun(state.token, runPath);
  } catch { /* a private identity copy must never turn verified Markdown into a false processing failure */ }
}
// The visible export is a convenience projection of already verified internal
// packages. Every failure here – including a damaged or conflicting export
// record – is a fail-closed "pending" result and never an exception: the
// terminal batch outcome must not be presented as a processing stop, and no
// internal result is touched.
function exportCompletedState(state) {
  try {
    if (state.product_channel === 'standalone') require('./standalone-history-store').recordStandaloneState(state);
  }
  catch { /* the durable batch/export records remain authoritative */ }
  const target = recordPath(state.token);
  let claim;
  try { claim = acquireExportClaim(target); }
  catch { return { exported: 0, pending: releasedCount(state), available: false }; }
  if (!claim) return { exported: 0, pending: releasedCount(state), available: false };
  let plan;
  let outcome;
  let released = false;
  try {
    outcome = (() => {
      try {
        if (waiverExists(target)) {
          const record = readRecord(target);
          const waiver = readExportWaiver(target, record);
          return { exported: waiver.exported_count, pending: waiver.pending_count, available: false };
        }
      } catch { return { exported: 0, pending: releasedCount(state), available: false }; }
      try { plan = ensureRecord(state); }
      catch { return { exported: 0, pending: releasedCount(state), available: false }; }
      if (plan.value.items.length === 0 && !plan.value.stopped_items?.length) return { exported: 0, pending: 0, available: true };
      // A current all-stopped run has no user result to publish. Preserve its
      // private stopped-item evidence for status/history, but do not create an
      // empty run folder or a misleading source-to-error "mapping" file.
      if (plan.value.items.length === 0 && plan.value.stopped_items?.length &&
          [SCHEMA, MARKDOWN_SCHEMA, CONTENT_MARKDOWN_SCHEMA, CONTENT_ANONYMIZED_SCHEMA].includes(plan.value.schema)) {
        if (plan.value.complete !== true) {
          plan.value = { ...plan.value, complete: true };
          writeRecord(plan.target, plan.value);
        }
        return { exported: 0, pending: 0, available: false };
      }
      // DS-069 replays only a failed export; DS-023 leaves visible results to the
      // user until they delete them. A completed record is therefore final: it is
      // neither re-verified nor re-materialised after a user deletion, and a later
      // destination change does not mirror earlier runs into the new folder.
      // The separate confidential identity copy is offered once per run and is
      // not recreated after a user removes it.
      if (plan.value.complete === true) {
        publishStandaloneIdentityIfPossible(state);
        return { exported: plan.value.items.length, pending: 0, available: plan.value.items.length > 0 };
      }
      const total = plan.value.items.length;
      const pendingResult = () => {
        let done = exportedCount(plan.value);
        try { done = exportedCount(readRecord(plan.target)); } catch { /* keep the last known progress */ }
        return { exported: done, pending: total - done, available: false };
      };
      try {
        const destination = activeDestination(plan.value);
        if (!destination) return pendingResult();
        const finished = exportOpenItems(plan.target, readRecord(plan.target), destination);
        if (finished.complete === true) publishStandaloneIdentityIfPossible(state);
        return finished.complete === true ? { exported: total, pending: 0, available: true } : pendingResult();
      } catch {
        return pendingResult();
      }
    })();
  } finally { released = releaseExportClaim(target, claim); }
  return released ? outcome : { exported: 0, pending: releasedCount(state), available: false };
}
function replayPendingResultExports() {
  let exported = 0;
  let pending = 0;
  let failures = 0;
  let entries;
  try { entries = fs.readdirSync(outboxDirectory(), { withFileTypes: true }); }
  catch { return { exported, pending, failures: 1 }; }
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) { failures++; continue; }
    if (TEMPORARY_RECORD_RE.test(entry.name)) continue;
    if (CLAIM_RE.test(entry.name)) continue;
    if (WAIVER_RE.test(entry.name)) continue;
    if (!RECORD_RE.test(entry.name)) { failures++; continue; }
    const exportedBeforeEntry = exported;
    const pendingBeforeEntry = pending;
    const failuresBeforeEntry = failures;
    let claim;
    let target;
    try {
      target = path.join(outboxDirectory(), entry.name);
      claim = acquireExportClaim(target);
      if (!claim) {
        try { pending += Math.max(0, readRecord(target).items.filter((item) => item.exported !== true).length); }
        catch { failures++; }
        continue;
      }
      const record = readRecord(target);
      if (readExportWaiver(target, record)) continue;
      // A legacy record has no product channel. Generic replay may finish its
      // already planned neutral documents, but only ensureRecord() can upgrade
      // it with the owning journal and add a Standalone-only mapping.
      // Only a failed (incomplete) export is replayed; see exportCompletedState.
      if ((record.items.length === 0 && !record.stopped_items?.length) || record.complete === true) continue;
      if (record.items.length === 0 && record.stopped_items?.length &&
          [SCHEMA, MARKDOWN_SCHEMA, CONTENT_MARKDOWN_SCHEMA, CONTENT_ANONYMIZED_SCHEMA].includes(record.schema)) {
        writeRecord(target, { ...record, complete: true });
        continue;
      }
      const destination = activeDestination(record);
      if (!destination) { pending += record.items.length - exportedCount(record); continue; }
      const before = exportedCount(record);
      try {
        const finished = exportOpenItems(target, record, destination);
        exported += exportedCount(finished) - before;
      } catch (error) {
        let after = before;
        let remaining = record.items.length - before;
        try {
          const current = readRecord(target);
          after = exportedCount(current);
          remaining = current.items.length - after;
        } catch { /* keep the last known progress and item count */ }
        exported += after - before;
        pending += Math.max(0, remaining);
        throw error;
      }
    } catch { failures++; }
    finally {
      if (claim && !releaseExportClaim(target, claim)) {
        let itemCount = 0;
        try { itemCount = readRecord(target).items.length; } catch { /* retain fail-closed zero */ }
        exported = exportedBeforeEntry;
        pending = pendingBeforeEntry + itemCount;
        failures = Math.max(failures, failuresBeforeEntry + 1);
      }
    }
  }
  return { exported, pending, failures };
}

// Private Standalone history uses durable export plans even after journal
// retention. Only neutral counters leave this module; source labels do not.
function readStandaloneExportHistory() {
  let entries;
  try { entries = fs.readdirSync(outboxDirectory(), { withFileTypes: true }); } catch { return []; }
  const rows = [];
  for (const entry of entries) {
    if (!entry.isFile() || !RECORD_RE.test(entry.name)) continue;
    try {
      const target = path.join(outboxDirectory(), entry.name);
      const record = readRecord(target);
      if (record.product_channel !== 'standalone') continue;
      const waiver = readExportWaiver(target, record);
      const stamp = /^Lauf-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-[a-f0-9]{8}$/u.exec(record.run_directory);
      if (!stamp) continue;
      const created = `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}.000Z`;
      if (!Number.isFinite(Date.parse(created))) continue;
      let directory = '';
      if (record.complete === true) {
        try {
          const destination = activeDestination(record, { create: false });
          if (destination && destination.id === record.destination_id) {
            directory = bindPlainDirectory(path.join(destination.output.path, record.run_directory), destination.output).path;
          }
        } catch { /* old or missing destinations remain unavailable */ }
      }
      const failed = record.stopped_items?.length || 0;
      rows.push({ export_id: path.basename(entry.name, '.json'), target, directory, run_directory: record.run_directory, complete: record.complete,
        exported_count: exportedCount(record), pending_count: record.items.length - exportedCount(record),
        ...(waiver ? { abandoned: true } : {}),
        summary: { created_at: created, processing_mode: record.processing_mode === 'markdown-only' ? 'markdown-only' : 'markdown-and-anonymize',
          selected_count: record.items.length + failed, result_count: record.items.length, failed_count: failed,
          completed_count: record.items.length + failed, review_count: 0, complete: true } });
    } catch { /* damaged, legacy, or unsafe records never become local UI state */ }
  }
  return rows;
}
// Detached workers attach the visible export to their single terminal
// envelope. A non-terminal batch has no visible export; an exporter failure
// keeps the verified released count pending instead of turning the completed
// batch into a "stopped" notice.
function terminalVisibleExport(completed, exporter) {
  if (completed?.complete !== true) return { exported: 0, pending: 0, available: false };
  const released = Number.isSafeInteger(completed.released) && completed.released >= 0 ? completed.released : 0;
  try {
    const visible = exporter();
    if (!visible || ![visible.exported, visible.pending].every(Number.isSafeInteger) || typeof visible.available !== 'boolean' ||
        visible.exported < 0 || visible.pending < 0 || visible.exported + visible.pending !== released ||
        (visible.pending > 0 && visible.available)) {
      return { exported: 0, pending: released, available: false };
    }
    return { exported: visible.exported, pending: visible.pending, available: visible.available };
  } catch {
    return { exported: 0, pending: released, available: false };
  }
}

module.exports = {
  SCHEMA, MARKDOWN_SCHEMA, CONTENT_MARKDOWN_SCHEMA, CONTENT_ANONYMIZED_SCHEMA, LEGACY_MARKDOWN_SCHEMA, LEGACY_SCHEMA, VISIBLE_MAPPING_FILE, recordPath, validRecord, exportCompletedState, replayPendingResultExports, visibleExportStatus,
  visibleExportDirectory, terminalVisibleExport, readStandaloneExportHistory, abandonPendingResultExport,
  completedMarkdownExportMatches,
  _test: { activeDestination, ensurePlainDirectory, bindPlainDirectory, assertDirectoryBinding,
    acquireExportClaim, releaseExportClaim, claimPath, markdownOutputNames }
};
