'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataRoot } = require('../runtime');
const { safeResolvePackage, readVerifiedFile } = require('./package-store');
const { inspectRoot, readConfiguredResultRoot, resultOutputDirectory } = require('./result-folder-config');
const { writeFully, syncParentDirectory, renameWithTransientRetry, linkWithTransientRetry } = require('./batch-journal-io');
const { processAlive } = require('./process-liveness');
const { csvField } = require('./mapping');
const { readMarkdownArtifact, verifyMarkdownItem } = require('../standalone/markdown-store');
const { validateCoverage, MAX_MARKDOWN_CHARS } = require('../standalone/markdown-contract');

const SCHEMA = 'datasecure-result-export/2';
const MARKDOWN_SCHEMA = 'datasecure-result-export/3';
const LEGACY_SCHEMA = 'datasecure-result-export/1';
const VISIBLE_MAPPING_FILE = 'DataSecure-Zuordnung.csv';
const VISIBLE_MAPPING_HEADER = 'Originaldatei;Anonymisiertes Ergebnis\r\n';
const RECORD_RE = /^re_[a-f0-9]{32}\.json$/u;
// An interrupted atomic record write leaves exactly this temporary name behind.
// It carries no export state and must neither count as a damaged record nor be
// removed while a concurrent worker may still be writing it.
const TEMPORARY_RECORD_RE = /^re_[a-f0-9]{32}\.json\.\d+\.[a-f0-9]{8}\.tmp$/u;
const CLAIM_RE = /^re_[a-f0-9]{32}\.json\.claim$/u;
const PACKAGE_RE = /^ds_[a-f0-9]{32}$/u;
const CLAIM_SCHEMA = 'datasecure-result-export-claim/1';
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
function validClaim(value) {
  return exactKeys(value, ['schema', 'claim_id', 'pid', 'created_at']) && value.schema === CLAIM_SCHEMA &&
    CLAIM_ID_RE.test(value.claim_id) && Number.isSafeInteger(value.pid) && value.pid > 0 &&
    typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at));
}
function readClaim(target) {
  let descriptor;
  try {
    descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const opened = fs.fstatSync(descriptor);
    const named = fs.lstatSync(target);
    if (!opened.isFile() || !named.isFile() || named.isSymbolicLink() ||
        opened.dev !== named.dev || opened.ino !== named.ino || opened.size < 1 || opened.size > 1024) return null;
    const value = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
    return validClaim(value) ? { value, dev: opened.dev, ino: opened.ino, size: opened.size } : null;
  } catch { return null; }
  finally { if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch {} }
}
function removeClaimIfUnchanged(target, expected, attempts = 1) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = readClaim(target);
    if (!current || current.value.claim_id !== expected.value.claim_id || current.dev !== expected.dev ||
        current.ino !== expected.ino || current.size !== expected.size) return false;
    try { fs.unlinkSync(target); return true; }
    catch (error) {
      if (!TRANSIENT_CLAIM_CODES.has(error?.code) || attempt === attempts - 1) return false;
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
function validRecord(value) {
  const legacy = value?.schema === LEGACY_SCHEMA;
  const converting = value?.schema === MARKDOWN_SCHEMA;
  const topLevelKeys = legacy
    ? ['schema', 'run_directory', 'items', 'complete', 'destination_id']
    : ['schema', 'run_directory', 'items', 'complete', 'destination_id', 'product_channel'];
  if (!legacy && Object.hasOwn(value || {}, 'stopped_items')) topLevelKeys.push('stopped_items');
  if (converting) topLevelKeys.push('processing_mode');
  return exactKeys(value, topLevelKeys) &&
    [SCHEMA, LEGACY_SCHEMA, MARKDOWN_SCHEMA].includes(value.schema) &&
    (!converting || (value.product_channel === 'standalone' && value.processing_mode === 'markdown-only')) &&
    (legacy || ['plugin', 'standalone'].includes(value.product_channel)) &&
    /^Lauf-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$/u.test(value.run_directory) &&
    typeof value.complete === 'boolean' && /^(?:|[a-f0-9]{64})$/u.test(value.destination_id) &&
    Array.isArray(value.items) && value.items.length <= 100 &&
    (!Object.hasOwn(value, 'stopped_items') || (value.product_channel === 'standalone' &&
      Array.isArray(value.stopped_items) && value.stopped_items.length > 0 &&
      value.stopped_items.length + value.items.length <= 100 &&
      value.stopped_items.every((item) => exactKeys(item, ['source_label', 'error_code']) &&
        validSourceLabel(item.source_label) && /^[A-Z][A-Z0-9_]{0,95}$/u.test(item.error_code)))) &&
    value.items.every((item, index) => converting ? validMarkdownExportItem(item, index) : (legacy
      ? (exactKeys(item, ['package_id', 'file', 'sha256']) ||
        (exactKeys(item, ['package_id', 'file', 'sha256', 'exported']) && item.exported === true))
      : ((exactKeys(item, ['package_id', 'file', 'sha256', 'source_label']) ||
        (exactKeys(item, ['package_id', 'file', 'sha256', 'source_label', 'exported']) && item.exported === true)) &&
        validSourceLabel(item.source_label))) &&
      PACKAGE_RE.test(item.package_id) && /^[a-f0-9]{64}$/u.test(item.sha256) &&
      item.file === `Dokument-${String(index + 1).padStart(3, '0')}-anonymisiert.md`);
}
function validMarkdownExportItem(item, index) {
  const keys = ['artifact_id', 'artifact_bytes', 'file', 'sha256', 'source_label', 'extraction_grade', 'reason_codes'];
  if (!exactKeys(item, keys) && !exactKeys(item, [...keys, 'exported'])) return false;
  if (Object.hasOwn(item, 'exported') && item.exported !== true) return false;
  if (!/^dm_[a-f0-9]{32}$/u.test(String(item.artifact_id || '')) || !validSourceLabel(item.source_label) ||
      !Number.isSafeInteger(item.artifact_bytes) || item.artifact_bytes < 0 || item.artifact_bytes > MAX_MARKDOWN_CHARS * 4 ||
      !/^[a-f0-9]{64}$/u.test(String(item.sha256 || '')) ||
      item.file !== `Dokument-${String(index + 1).padStart(3, '0')}-konvertiert.md`) return false;
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
  const stat = fs.lstatSync(target);
  // Up to 100 relative source labels (1024 characters each), JSON escaping,
  // fixed error codes and hashes must fit without relaxing item/string bounds.
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 1024 * 1024) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  const value = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (!validRecord(value)) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  return value;
}
function runDirectoryName(createdAt) {
  const date = new Date(createdAt);
  const stamp = Number.isFinite(date.getTime())
    ? date.toISOString().replace(/[-:]/gu, '').replace('T', '-').slice(0, 15)
    : new Date().toISOString().replace(/[-:]/gu, '').replace('T', '-').slice(0, 15);
  return `Lauf-${stamp}-${crypto.randomBytes(4).toString('hex')}`;
}
function packageItem(packageId, index, sourceLabel) {
  const { m } = safeResolvePackage(packageId);
  if (!m || !/^[a-f0-9]{64}$/u.test(String(m.document_sha256 || ''))) throw new Error('RESULT_EXPORT_SOURCE_INVALID');
  const item = {
    package_id: packageId,
    file: `Dokument-${String(index + 1).padStart(3, '0')}-anonymisiert.md`,
    sha256: m.document_sha256,
    source_label: String(sourceLabel || '')
  };
  if (!validSourceLabel(item.source_label)) throw new Error('RESULT_EXPORT_MAPPING_SOURCE_INVALID');
  return item;
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
function activeDestination(record) {
  const root = readConfiguredResultRoot();
  if (!root) return null;
  const checked = inspectRoot(root);
  const rootBinding = bindPlainDirectory(checked.root);
  let outputPath;
  if (record?.schema === MARKDOWN_SCHEMA) {
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
  const converting = state.schema === 'datasecure-batch/5' && state.processing_mode === 'markdown-only' && state.product_channel === 'standalone';
  if (!converting && (state.schema === 'datasecure-batch/5' || state.processing_mode === 'markdown-only')) throw new Error('RESULT_EXPORT_MODE_INVALID');
  const target = recordPath(state.token);
  // Conversion is a single visible run: partial files stay internal until all
  // processing decisions are terminal. No early plan may freeze a subset.
  if (converting && state.items.some((item) => !['released', 'stopped'].includes(item.status))) throw new Error('RESULT_EXPORT_BATCH_INCOMPLETE');
  const completedMarkdownRecord = converting && fs.existsSync(target) && completedMarkdownExportMatches(state);
  const released = state.items.filter((item) => item.status === 'released');
  const items = released.map((item, index) => {
    if (!converting) return packageItem(item.package_id, index, item.source_label || item.name);
    if (!completedMarkdownRecord && !verifyMarkdownItem(item)) throw new Error('RESULT_EXPORT_SOURCE_INVALID');
    const sourceLabel = String(item.source_label || item.name || '');
    if (!validSourceLabel(sourceLabel)) throw new Error('RESULT_EXPORT_MAPPING_SOURCE_INVALID');
    return { artifact_id: item.artifact_id, artifact_bytes: item.artifact_bytes,
      file: `Dokument-${String(index + 1).padStart(3, '0')}-konvertiert.md`, sha256: item.artifact_sha256,
      source_label: sourceLabel, extraction_grade: item.extraction_grade, reason_codes: [...item.reason_codes] };
  });
  const stoppedItems = state.product_channel === 'standalone'
    ? state.items.filter((item) => item.status === 'stopped').map((item) => ({
      source_label: String(item.source_label || item.name || ''),
      error_code: /^[A-Z][A-Z0-9_]{0,95}$/u.test(String(item.error_code || ''))
        ? item.error_code : 'PROCESSING_STOPPED'
    })) : [];
  if (stoppedItems.some((item) => !validSourceLabel(item.source_label))) throw new Error('RESULT_EXPORT_MAPPING_SOURCE_INVALID');
  if (fs.existsSync(target)) {
    let existing = readRecord(target);
    if (converting !== (existing.schema === MARKDOWN_SCHEMA)) throw new Error('RESULT_EXPORT_MODE_INVALID');
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
  const value = { schema: converting ? MARKDOWN_SCHEMA : SCHEMA, run_directory: runDirectoryName(state.created_at), items,
    complete: items.length === 0 && stoppedItems.length === 0, destination_id: '', product_channel: state.product_channel,
    ...(converting ? { processing_mode: 'markdown-only' } : {}),
    ...(stoppedItems.length ? { stopped_items: stoppedItems } : {}) };
  writeRecord(target, value);
  return { target, value };
}
// Once a complete, identity-bound visible conversion and its CSV were committed,
// the private dm copy may expire. This proves the historical export transaction,
// not that the user has retained or left their visible files unchanged.
function completedMarkdownExportMatches(state) {
  try {
    if (state?.schema !== 'datasecure-batch/5' || state.product_channel !== 'standalone' ||
        state.processing_mode !== 'markdown-only' || !Array.isArray(state.items) ||
        state.items.some((item) => !['released', 'stopped'].includes(item.status))) return false;
    const record = readRecord(recordPath(state.token));
    if (record.schema !== MARKDOWN_SCHEMA || record.complete !== true || !/^[a-f0-9]{64}$/u.test(record.destination_id) ||
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
function exportOne(destination, run, item) {
  assertDirectoryBinding(destination.root);
  assertDirectoryBinding(destination.output, destination.root);
  assertDirectoryBinding(run, destination.output);
  const runDirectory = run.path;
  const target = path.join(runDirectory, item.file);
  if (path.dirname(target) !== runDirectory) throw new Error('RESULT_EXPORT_PATH_UNSAFE');
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() ||
        crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== item.sha256) throw new Error('RESULT_EXPORT_CONFLICT');
    return false;
  }
  let bytes, m;
  if (Object.hasOwn(item, 'artifact_id')) {
    const artifact = readMarkdownArtifact(item.artifact_id);
    m = artifact.manifest;
    if (m.document_bytes !== item.artifact_bytes || m.extraction_grade !== item.extraction_grade ||
        JSON.stringify(m.reason_codes) !== JSON.stringify(item.reason_codes)) throw new Error('RESULT_EXPORT_SOURCE_INVALID');
    bytes = Buffer.from(artifact.markdown, 'utf8');
  } else {
    const resolved = safeResolvePackage(item.package_id);
    m = resolved.m;
    bytes = readVerifiedFile(resolved.p, m.document, 32 * 1024 * 1024);
  }
  const expected = crypto.createHash('sha256').update(bytes).digest('hex');
  if (expected !== m.document_sha256 || expected !== item.sha256) throw new Error('RESULT_EXPORT_SOURCE_INVALID');
  const temporary = path.join(runDirectory, `.${item.file}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  let descriptor;
  try {
    assertDirectoryBinding(destination.root);
    assertDirectoryBinding(destination.output, destination.root);
    assertDirectoryBinding(run, destination.output);
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
    const written = fs.lstatSync(target);
    if (!written.isFile() || written.isSymbolicLink() || written.size !== bytes.length ||
        crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== expected) throw new Error('RESULT_EXPORT_VERIFY_FAILED');
    return true;
  } finally {
    try { if (descriptor !== undefined) fs.closeSync(descriptor); } catch {}
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {}
  }
}
function visibleMappingBytes(record) {
  if (![SCHEMA, MARKDOWN_SCHEMA].includes(record.schema) || record.items.some((item) => !validSourceLabel(item.source_label))) {
    throw new Error('RESULT_EXPORT_MAPPING_SOURCE_INVALID');
  }
  const converting = record.schema === MARKDOWN_SCHEMA;
  const notices = {
    OCR_NOT_VERIFIED: 'OCR-Texterkennung nicht fachlich geprüft',
    OCR_TEXT_EMPTY: 'Kein Text durch OCR erkannt',
    SOURCE_COVERAGE_UNVERIFIED: 'Vollständigkeit der Inhaltsextraktion nicht bestätigt',
    VISUAL_CONTENT_NOT_EXTRACTED: 'Bilder oder visuelle Inhalte nicht vollständig als Markdown enthalten'
  };
  const rows = record.items.map((item) => [item.source_label, item.file,
    ...(converting ? ['Nicht anonymisiert', item.extraction_grade === 'complete'
      ? 'Text vollständig extrahiert' : item.reason_codes.map((code) => notices[code]).join(' · ')] : [])].map(csvField).join(';'));
  for (const item of record.stopped_items || []) {
    rows.push([item.source_label, `Kein Ergebnis – gestoppt (${item.error_code})`, ...(converting ? ['', 'Nicht konvertiert'] : [])].map(csvField).join(';'));
  }
  const header = converting ? 'Originaldatei;Konvertiertes Markdown;Datenschutz;Extraktionshinweis\r\n' : VISIBLE_MAPPING_HEADER;
  return Buffer.from(header + rows.join('\r\n') + (rows.length ? '\r\n' : ''), 'utf8');
}
function exportVisibleMapping(destination, run, record) {
  assertDirectoryBinding(destination.root);
  assertDirectoryBinding(destination.output, destination.root);
  assertDirectoryBinding(run, destination.output);
  const target = path.join(run.path, VISIBLE_MAPPING_FILE);
  const bytes = visibleMappingBytes(record);
  const expected = crypto.createHash('sha256').update(bytes).digest('hex');
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== bytes.length ||
        crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== expected) {
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
    const written = fs.lstatSync(target);
    if (!written.isFile() || written.isSymbolicLink() || written.size !== bytes.length ||
        crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== expected) {
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
    exportOne(destination, run, item);
    const items = current.items.map((entry, position) => position === index ? { ...planItem(entry), exported: true } : entry);
    current = { ...current, items };
    writeRecord(target, current);
  }
  if (current.items.every((item) => item.exported === true)) {
    if (current.product_channel === 'standalone') exportVisibleMapping(destination, run, current);
    current = { ...current, complete: true };
    writeRecord(target, current);
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
    if (record.complete !== true || (record.items.length === 0 && !record.stopped_items?.length) ||
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
// The visible export is a convenience projection of already verified internal
// packages. Every failure here – including a damaged or conflicting export
// record – is a fail-closed "pending" result and never an exception: the
// terminal batch outcome must not be presented as a processing stop, and no
// internal result is touched.
function exportCompletedState(state) {
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
      try { plan = ensureRecord(state); }
      catch { return { exported: 0, pending: releasedCount(state), available: false }; }
      if (plan.value.items.length === 0 && !plan.value.stopped_items?.length) return { exported: 0, pending: 0, available: true };
      // DS-069 replays only a failed export; DS-023 leaves visible results to the
      // user until they delete them. A completed record is therefore final: it is
      // neither re-verified nor re-materialised after a user deletion, and a later
      // destination change does not mirror earlier runs into the new folder.
      if (plan.value.complete === true) return { exported: plan.value.items.length, pending: 0, available: true };
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
      // A legacy record has no product channel. Generic replay may finish its
      // already planned neutral documents, but only ensureRecord() can upgrade
      // it with the owning journal and add a Standalone-only mapping.
      // Only a failed (incomplete) export is replayed; see exportCompletedState.
      if ((record.items.length === 0 && !record.stopped_items?.length) || record.complete === true) continue;
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
  SCHEMA, MARKDOWN_SCHEMA, LEGACY_SCHEMA, VISIBLE_MAPPING_FILE, recordPath, validRecord, exportCompletedState, replayPendingResultExports, visibleExportStatus,
  visibleExportDirectory, terminalVisibleExport,
  completedMarkdownExportMatches,
  _test: { activeDestination, ensurePlainDirectory, bindPlainDirectory, assertDirectoryBinding,
    acquireExportClaim, releaseExportClaim, claimPath }
};
