'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readBoundFile, readBoundFileRecord, readBoundFileSnapshot, bindDirectory, assertDirectory, objectIdentity, sameObject } = require('../core/bound-file-io');
const { ownerRecordIo } = require('./batch-active-lock');
const { dataRoot } = require('../runtime');
const { safeResolvePackage, readVerifiedFile } = require('./package-store');
const { inspectRoot, readConfiguredResultRoot, resultOutputDirectory } = require('./result-folder-config');
const { writeFully, syncParentDirectory, renameWithTransientRetry, linkWithTransientRetry } = require('./batch-journal-io');
const { processAlive } = require('./process-liveness');
const { csvField } = require('./mapping');
const { readMarkdownArtifact, verifyMarkdownItem } = require('../standalone/markdown-store');
const { readAnonymizedArtifact } = require('../standalone/anonymized-store');
const { confirmPublication, confirmPublicationAsync } = require('./standalone-anonymized-batch');
const { admitSynchronousOwnership } = require('./synchronous-ownership-admission');
const identityLedger = require('../standalone/identity-ledger');
const { validateCoverage, MAX_MARKDOWN_CHARS } = require('../standalone/markdown-contract');
const { RESOURCE_LIMITS } = require('../resource-limits');
const { MODES: RESULT_NAMING_MODES, resultNamingModeForBatch } = require('../core/result-naming-mode');
const { isMarkdownBatch } = require('../core/processing-mode');
const { contentOptionsForBatch, validateContentOptions, serializeContentOptions } = require('../core/content-options');
const { ensurePrivateDirectory } = require('./common');
const { createPrivateWorkStore } = require('./private-work-store');
const { createPublicResultMetadataInspector } = require('../core/public-result-metadata');
const { DIRECTORY: CONFIDENTIAL_DIRECTORY, PATHS: CONFIDENTIAL_PATHS, MAX_MAPPING_BYTES, MAX_IDENTITY_BYTES,
  validConfidentialDescriptor } = require('../standalone/result-companions');

const SCHEMA = 'datasecure-result-export/2';
const MARKDOWN_SCHEMA = 'datasecure-result-export/4';
const CONTENT_MARKDOWN_SCHEMA = 'datasecure-result-export/5';
const CONTENT_ANONYMIZED_SCHEMA = 'datasecure-result-export/6';
const RESULT_LAYOUT = 'datasecure-visible-markdown/1';
// /1 remains the immutable Markdown-only tree promised by RC166. New
// anonymization runs explicitly promise two confidential companion files.
const CONFIDENTIAL_RESULT_LAYOUT = 'datasecure-visible-markdown/2';
const hasBoundResultLayout = record => [RESULT_LAYOUT, CONFIDENTIAL_RESULT_LAYOUT].includes(record?.result_layout);
const CONFIDENTIAL_FILES = Object.freeze([
  Object.freeze({ key: 'filename_mapping', name: CONFIDENTIAL_PATHS.filename_mapping, maximum: MAX_MAPPING_BYTES }),
  Object.freeze({ key: 'identities', name: CONFIDENTIAL_PATHS.identities, maximum: MAX_IDENTITY_BYTES })
]);
const INITIAL_BINDING_BYTES = 1024 * 1024;
// Up to 200 quoted pairs of 1024-code-unit Unicode source/result paths.
// Mapping contents are private and do not share the smaller binding budget.
const PRIVATE_MAPPING_BYTES = 4 * 1024 * 1024;
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
const PREPARED_CLAIM_RE = /^re_[a-f0-9]{32}\.json\.claim\.prepared-[a-f0-9]{32}\.tmp$/u;
const WAIVER_RE = /^re_[a-f0-9]{32}\.json\.waived$/u;
const PACKAGE_RE = /^ds_[a-f0-9]{32}$/u;
const CLAIM_SCHEMA = 'datasecure-result-export-claim/1';
const NATIVE_CLAIM_SCHEMA = 'datasecure-result-export-claim/2';
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
function bindPlainDirectory(directory, parent = null, exact = false) {
  if (exact || parent?.exact === true) {
    if (parent) assertDirectoryBinding(parent);
    const bound = bindDirectory(directory);
    if (bound.chain[0].alias || parent && comparablePath(path.dirname(bound.real)) !== comparablePath(parent.real))
      throw new Error('RESULT_EXPORT_PATH_UNSAFE');
    assertDirectory(bound);
    if (parent) assertDirectoryBinding(parent);
    return exactDirectory(bound);
  }
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
function exactDirectory(bound) {
  const identity = bound.chain[0].identity;
  return { path: bound.path, real: bound.real, dev: identity.dev, ino: identity.ino,
    birthtime: identity.birth, exact: true, directory: bound };
}
function assertDirectoryBinding(binding, parent = null) {
  if (binding.exact === true) {
    assertDirectory(binding.directory);
    if (parent) {
      assertDirectoryBinding(parent);
      if (comparablePath(path.dirname(binding.real)) !== comparablePath(parent.real)) throw new Error('RESULT_EXPORT_PATH_UNSAFE');
    }
    return binding;
  }
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
  const keys = ['schema', 'claim_id', 'pid', 'created_at'];
  if (value?.prepared_nonce !== undefined) keys.push('prepared_nonce');
  return exactKeys(value, keys) && [CLAIM_SCHEMA, NATIVE_CLAIM_SCHEMA].includes(value.schema) &&
    (value.schema !== NATIVE_CLAIM_SCHEMA || typeof value.prepared_nonce === 'string') &&
    (value.prepared_nonce === undefined || CLAIM_ID_RE.test(value.prepared_nonce)) &&
    typeof value.claim_id === 'string' && CLAIM_ID_RE.test(value.claim_id) && Number.isSafeInteger(value.pid) && value.pid > 0 &&
    typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at));
}
function readClaim(target, io = fs) {
  const record = ownerRecordIo.readOwnerRecord(target, validClaim, io, 1024);
  return record.state === 'valid' ? record : null;
}
function removeClaimIfUnchanged(target, expected, guard, io, attempts = 1) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = readClaim(target, io);
    if (!current || JSON.stringify(current.value) !== JSON.stringify(expected.value) ||
        current.identity.dev !== expected.identity.dev || current.identity.ino !== expected.identity.ino ||
        current.identity.size !== expected.identity.size || current.identity.birth !== expected.identity.birth) return false;
    try {
      guard.assertHeld();
      io.unlinkSync(target);
      return true;
    }
    catch (error) {
      if (String(error?.code).startsWith('OWNERSHIP_GUARD_')) throw error;
      if (!TRANSIENT_CLAIM_CODES.has(error?.retry_code || error?.code) || attempt === attempts - 1) return false;
      claimRetryDelay(10 * (attempt + 1));
    }
  }
  return false;
}
const ownedExportClaims = new WeakMap();
const claimControl = (deps, action) => (deps.withOwnershipControl || require('../core/ownership-control').withOwnershipControl)(dataRoot(), action);
function acquireExportClaimInternal(recordTarget, deps, guard, singleAttempt = false) {
  const io = deps.fs || fs;
  const target = claimPath(recordTarget);
  const existing = readClaim(target, io);
  if (existing) {
    const expectedSchema = process.env.DATASECURE_NATIVE_EXPORT_CHANNEL === '1' ? NATIVE_CLAIM_SCHEMA : CLAIM_SCHEMA;
    if (existing.value.schema !== expectedSchema ||
        processAlive(existing.value.pid) || !removeClaimIfUnchanged(target, existing, guard, io)) return null;
  } else if (io.existsSync(target)) {
    // A malformed, replaced or permission-hidden private claim is never stolen.
    return null;
  }
  const value = { schema: process.env.DATASECURE_NATIVE_EXPORT_CHANNEL === '1' ? NATIVE_CLAIM_SCHEMA : CLAIM_SCHEMA,
    claim_id: crypto.randomBytes(16).toString('hex'),
    pid: process.pid, created_at: new Date().toISOString() };
  try {
    const record = ownerRecordIo.publishOwnerRecord(target, value, guard, io, undefined, singleAttempt);
    // Only this opaque object's identity is a release capability. Reflecting
    // claim_id/PID from a file (or cloning this object) does not acquire it.
    const claim = Object.freeze({ value: Object.freeze({ ...record.value }) });
    ownedExportClaims.set(claim, { target, record });
    return claim;
  } catch (error) {
    if (error?.code === 'EEXIST') return null;
    throw error;
  }
}
function acquireExportClaim(recordTarget, deps = {}) {
  return claimControl(deps, guard => acquireExportClaimInternal(recordTarget, deps, guard));
}
function releaseExportClaimInternal(recordTarget, claim, deps, guard, singleAttempt = false) {
  const owned = ownedExportClaims.get(claim);
  if (!owned || owned.target !== claimPath(recordTarget)) return false;
  const released = removeClaimIfUnchanged(owned.target, owned.record, guard, deps.fs || fs, singleAttempt ? 1 : 4);
  if (released) ownedExportClaims.delete(claim);
  return released;
}
function releaseExportClaim(recordTarget, claim, deps = {}) {
  return claimControl(deps, guard => releaseExportClaimInternal(recordTarget, claim, deps, guard));
}
function admittedClaim(action, deps) {
  const root = dataRoot();
  const control = deps.withOwnershipControl || require('../core/ownership-control').withOwnershipControl;
  return admitSynchronousOwnership(callback => control(root, callback), action,
    { delay: deps.admissionDelay, monotonicNow: deps.monotonicNow });
}
function acquireExportClaimAsync(recordTarget, deps = {}) {
  return admittedClaim(guard => acquireExportClaimInternal(recordTarget, deps, guard, true), deps);
}
function releaseExportClaimAsync(recordTarget, claim, deps = {}) {
  return admittedClaim(guard => releaseExportClaimInternal(recordTarget, claim, deps, guard, true), deps);
}
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
function guardDiagnostic(outcome, error) {
  // Preserve a bounded internal cause without widening serialized public
  // export/status envelopes or retaining arbitrary OS messages/private paths.
  if (/^OWNERSHIP_GUARD_[A-Z_]+$/u.test(error?.code || ''))
    Object.defineProperty(outcome, 'ownership_error_code', { value: error.code });
  return outcome;
}
// Observation only. The exact catalog is NOT processing, ACK, release or retry
// authority. Existing public pending/success envelopes remain unchanged.
const RESULT_EXPORT_DIAGNOSTIC_CODES = new Set([
  'RESULT_EXPORT_ABANDON_UNAVAILABLE', 'RESULT_EXPORT_BATCH_INCOMPLETE', 'RESULT_EXPORT_BUSY',
  'RESULT_EXPORT_CONFLICT', 'RESULT_EXPORT_DESTINATION_CHANGED', 'RESULT_EXPORT_DESTINATION_UNBOUND',
  'RESULT_EXPORT_MAPPING_CONFLICT', 'RESULT_EXPORT_MAPPING_SOURCE_INVALID', 'RESULT_EXPORT_MODE_INVALID',
  'RESULT_EXPORT_PATH_UNSAFE', 'RESULT_EXPORT_PRODUCT_CHANNEL_INVALID', 'RESULT_EXPORT_SOURCE_INVALID',
  'RESULT_EXPORT_STATE_CONFLICT', 'RESULT_EXPORT_STATE_UNSAFE', 'RESULT_EXPORT_VERIFY_FAILED',
  'RESULT_EXPORT_PLAN_FAILED', 'RESULT_EXPORT_COPY_FAILED', 'RESULT_EXPORT_RELEASE_UNCONFIRMED',
  'RESULT_EXPORT_IO_FAILED', 'RESULT_EXPORT_TERMINAL_INVALID', 'RESULT_EXPORT_CLAIM_FAILED',
  'RESULT_EXPORT_PREPARE_FAILED', 'RESULT_EXPORT_CLAIM_UNAVAILABLE'
]);
const RESULT_EXPORT_IO_CODES = new Set(['EIO', 'EACCES', 'EPERM', 'ENOSPC', 'EDQUOT', 'EROFS', 'EMFILE', 'ENFILE']);
function recordResultExportFailure(phase, error) {
  try {
    const { types } = require('node:util');
    const { ownErrorCode, diagnosticCode, recordBatchExecutionFailure } = require('./batch-execution-diagnostic');
    const raw = ownErrorCode(error);
    // Keep this export-specific IO projection stable when other observers add
    // raw IO names to the shared vocabulary. Exact local export messages retain
    // their existing precedence over the generic IO fallback below.
    let code = RESULT_EXPORT_IO_CODES.has(raw) ? 'INTERNAL_FAILURE' : diagnosticCode(error);
    if (code === 'INTERNAL_FAILURE' && raw !== 'INTERNAL_FAILURE') {
      // Existing local export errors historically use an exact fixed message,
      // not .code. Never accept a prefix, payload, inherited value or getter.
      const message = error && typeof error === 'object' && !types.isProxy(error)
        ? Object.getOwnPropertyDescriptor(error, 'message')?.value : undefined;
      code = typeof message === 'string' && RESULT_EXPORT_DIAGNOSTIC_CODES.has(message) ? message :
        RESULT_EXPORT_IO_CODES.has(raw) ? 'RESULT_EXPORT_IO_FAILED' :
        phase === 'result_export_claim_release' ? 'RESULT_EXPORT_RELEASE_UNCONFIRMED' :
        phase === 'result_export_copy' ? 'RESULT_EXPORT_COPY_FAILED' :
        phase === 'result_export_claim' ? 'RESULT_EXPORT_CLAIM_FAILED' :
        phase === 'result_export_prepare' ? 'RESULT_EXPORT_PREPARE_FAILED' : 'RESULT_EXPORT_PLAN_FAILED';
    }
    recordBatchExecutionFailure(phase, Object.assign(new Error(code), { code }));
  } catch { /* diagnosis never changes the pending result or release lifecycle */ }
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
function reserveConfidentialDirectory(names) {
  // Source folders must never merge with the confidential namespace, including
  // on a case-insensitive/NFC filesystem. Pick one deterministic unused root.
  const rootNames = new Set(names.map(name => name.split('/')[0].normalize('NFC').toLowerCase()));
  let replacement = 'Vertraulich (Quelle)', index = 1;
  while (rootNames.has(replacement.normalize('NFC').toLowerCase())) replacement = `Vertraulich (Quelle ${++index})`;
  return names.map(name => {
    const segments = name.split('/');
    if (segments.length > 1 && segments[0].normalize('NFC').toLowerCase() === 'vertraulich') segments[0] = replacement;
    return segments.join('/');
  });
}
function confidentialSelection(record) {
  return record.items.map(item => ({ document_id: item.package_id.slice(3), revision: 0, output_sha256: item.sha256 }));
}
function confidentialNames(record) { return record.items.map(item => ({ name: item.file, sha256: item.sha256 })); }
function confidentialItems(record) {
  return CONFIDENTIAL_FILES.map(file => ({ file: file.name,
    sha256: Buffer.from(record.confidential[file.key].sha256).toString('hex') }));
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
  let expectedSourceAnonymizedNames = !converting && !legacy && value?.product_channel === 'standalone' && Array.isArray(value.items)
    ? collisionFreeOutputNames(value.items, '-anonymisiert') : null;
  let expectedNeutralAnonymizedNames = !converting && !legacy && value?.product_channel === 'standalone' && Array.isArray(value.items)
    ? neutralAnonymizedOutputNames(value.items) : null;
  if (value?.result_layout === CONFIDENTIAL_RESULT_LAYOUT) {
    if (expectedSourceAnonymizedNames) expectedSourceAnonymizedNames = reserveConfidentialDirectory(expectedSourceAnonymizedNames);
    if (expectedNeutralAnonymizedNames) expectedNeutralAnonymizedNames = reserveConfidentialDirectory(expectedNeutralAnonymizedNames);
  }
  const topLevelKeys = legacy
    ? ['schema', 'run_directory', 'items', 'complete', 'destination_id']
    : ['schema', 'run_directory', 'items', 'complete', 'destination_id', 'product_channel'];
  if (!legacy && Object.hasOwn(value || {}, 'stopped_items')) topLevelKeys.push('stopped_items');
  if (converting || value?.schema === CONTENT_ANONYMIZED_SCHEMA) topLevelKeys.push('processing_mode');
  if (contentBound) topLevelKeys.push('content_options', 'batch_id');
  if (Object.hasOwn(value || {}, 'result_layout')) topLevelKeys.push('result_layout');
  if (value?.result_layout === CONFIDENTIAL_RESULT_LAYOUT) topLevelKeys.push('confidential_binding_sha256', 'confidential');
  return exactKeys(value, topLevelKeys) &&
    (!Object.hasOwn(value, 'result_layout') || contentBound && value.product_channel === 'standalone' && hasBoundResultLayout(value)) &&
    (value.result_layout !== CONFIDENTIAL_RESULT_LAYOUT || value.schema === CONTENT_ANONYMIZED_SCHEMA &&
      /^[a-f0-9]{64}$/u.test(value.confidential_binding_sha256 || '') && validConfidentialDescriptor(value.confidential)) &&
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
      (value.result_layout !== CONFIDENTIAL_RESULT_LAYOUT && item.file === `Dokument-${String(index + 1).padStart(3, '0')}-anonymisiert.md` ||
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
function readRecord(target, options) {
  // Up to 200 relative source labels (1024 characters each), JSON escaping,
  // fixed error codes and hashes must fit without relaxing item/string bounds.
  let value;
  try { value = JSON.parse(readBoundFile(target, { maximum: 1024 * 1024, minimum: 1 })); }
  catch { throw new Error('RESULT_EXPORT_STATE_UNSAFE'); }
  if (!validRecord(value)) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  assertRecordContentAnchor(target, value, options);
  return value;
}
// Initial-readiness and private-ledger inspection are read-only. The actual
// publisher atomically replaces this progress leaf while the original parent,
// owner and content anchor stay fixed. Only the existing snapshot primitive may
// retry its own positively classified leaf replacement (at most three reads).
// Mutation/recovery callers keep the strict readRecord boundary above.
function readPublicationRecordSnapshot(target, expectedBatchId) {
  if (!/^[a-f0-9]{64}$/u.test(expectedBatchId || '') || path.basename(target) !==
      `re_${crypto.createHash('sha256').update(expectedBatchId).digest('hex').slice(0, 32)}.json`)
    throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  const directory = bindDirectory(path.dirname(target));
  let value;
  try { value = JSON.parse(readBoundFileSnapshot(target, { directory, maximum: 1024 * 1024, minimum: 1 })); }
  catch { throw new Error('RESULT_EXPORT_STATE_UNSAFE'); }
  if (!validRecord(value)) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  assertRecordContentAnchor(target, value, { expectedBatchId });
  assertDirectory(directory);
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
function assertRecordContentAnchor(target, record, { expectedBatchId = null, reviewOwners = null } = {}) {
  const name = path.basename(target), reviews = path.join(dataRoot(), 'document-reviews');
  if (!RECORD_RE.test(name)) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  const owner = readExportOwner(name);
  if (expectedBatchId !== null && (!/^[a-f0-9]{64}$/u.test(expectedBatchId) ||
      `re_${crypto.createHash('sha256').update(expectedBatchId).digest('hex').slice(0, 32)}.json` !== name ||
      owner && owner.batch_id !== expectedBatchId)) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  const contentBound = [CONTENT_MARKDOWN_SCHEMA, CONTENT_ANONYMIZED_SCHEMA].includes(record.schema);
  if (owner && (!contentBound || record.batch_id !== owner.batch_id ||
      record.processing_mode !== owner.processing_mode ||
      serializeContentOptions(record.content_options) !== serializeContentOptions(owner.content_options))) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  // Discover ownership from the independent run directory, not from optional
  // fields/version in the mutable export record. A legacy disguise may delete
  // both batch_id and content_options; the record path still binds its owner.
  // An exact caller supplies the full batch token. A global history caller
  // supplies its guarded name inventory; other callers retain the name scan.
  // None trusts the mutable record's batch_id as its ownership authority.
  const knownToken = expectedBatchId;
  let matches;
  if (knownToken) {
    // existsSync follows links and hides access errors. A dangling anchor must
    // still cross bindPlainDirectory below, never fall back to an old record.
    try { fs.lstatSync(path.join(reviews, knownToken)); matches = [knownToken]; }
    catch (error) {
      if (error?.code !== 'ENOENT') throw new Error('RESULT_EXPORT_STATE_UNSAFE');
      matches = [];
    }
  } else if (reviewOwners) {
    matches = reviewOwners.matches(name);
  } else {
    matches = fs.existsSync(reviews) ? fs.readdirSync(reviews).filter(token => /^[a-f0-9]{64}$/u.test(token) &&
      `re_${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}.json` === name) : [];
  }
  if (matches.length > 1) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  if (!matches.length) {
    if (owner || contentBound) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
    return; // a genuine old result with no document-review owner
  }
  const token = matches[0], directory = bindPlainDirectory(path.join(reviews, token), bindPlainDirectory(reviews));
  const anchor = JSON.parse(readBoundFile(path.join(directory.path, 'manifest.json'), { maximum: 1024 * 1024, minimum: 1,
    validateParents: () => assertDirectoryBinding(directory) }));
  const bound = ['datasecure-document-run/3', 'datasecure-document-run/4'].includes(anchor.schema);
  if (bound !== contentBound || anchor.batch_id !== token ||
      anchor.processing_mode !== (record.processing_mode || 'markdown-and-anonymize') || bound &&
      (record.batch_id !== token || serializeContentOptions(anchor.content_options) !== serializeContentOptions(record.content_options)))
    throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  require('./standalone-document-review-store').createDocumentReviewStore().assertContentBinding({
    schema: bound ? 'datasecure-batch/7' : 'datasecure-batch/4', token, product_channel: record.product_channel,
    processing_mode: anchor.processing_mode, standalone_document_review: true, ...(bound ? { content_options: record.content_options } : {}),
    ...(anchor.schema === 'datasecure-document-run/4' ? { standalone_review_policy: anchor.review_policy } : {}) });
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
  return contentAnonymizedItemFromPublication(item, index, outputFile, published);
}
function contentAnonymizedItemFromPublication(item, index, outputFile, published) {
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
  const exact = hasBoundResultLayout(record);
  const rootBinding = bindPlainDirectory(checked.root, null, exact);
  assertDirectoryBinding(rootBinding);
  let outputPath;
  if (options.create === false) {
    outputPath = path.join(checked.root, isMarkdownRecord(record) ? 'DataSecure-Markdown' : 'DataSecure-Output');
  } else if (isMarkdownRecord(record)) {
    outputPath = path.join(checked.root, 'DataSecure-Markdown');
    if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { mode: 0o700 });
  } else outputPath = resultOutputDirectory({ root: checked.root });
  assertDirectoryBinding(rootBinding);
  const outputBinding = bindPlainDirectory(outputPath, rootBinding);
  const legacyMaterial = `${checked.root}\0${checked.identity.dev}\0${checked.identity.ino}\0${checked.identity.birthtime_ms}`;
  const material = exact ? JSON.stringify({ schema: 'datasecure-result-destination/exact-1',
    root: serialDirectory(rootBinding.directory), output: serialDirectory(outputBinding.directory) }) :
    `${legacyMaterial}\0${outputBinding.real}\0${outputBinding.dev}\0${outputBinding.ino}\0${outputBinding.birthtime}`;
  return {
    id: crypto.createHash('sha256').update(material).digest('hex'),
    legacyId: exact ? null : crypto.createHash('sha256').update(legacyMaterial).digest('hex'),
    root: rootBinding,
    output: outputBinding
  };
}
function* ensureRecordSteps(state) {
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
  const newConfidentialLayout = !existingPlan && Boolean(contentOptions) && !converting &&
    state.product_channel === 'standalone' && state.standalone_document_review === true;
  let anonymizedNames = !converting && state.product_channel === 'standalone'
    ? outputNamingMode === RESULT_NAMING_MODES.NEUTRAL
      ? neutralAnonymizedOutputNames(anonymizedItems)
      : collisionFreeOutputNames(anonymizedItems, '-anonymisiert')
    : [];
  if (newConfidentialLayout) anonymizedNames = reserveConfidentialDirectory(anonymizedNames);
  const markdownNames = converting
    ? existingPlan?.items?.length === released.length
      ? existingPlan.items.map((item) => item.file)
      : existingPlan?.schema === LEGACY_MARKDOWN_SCHEMA
      ? released.map((_item, index) => `Dokument-${String(index + 1).padStart(3, '0')}-konvertiert.md`)
      : markdownOutputNames(released.map((item) => ({ source_label: String(item.source_label || item.name || '') })))
    : [];
  const items = [];
  for (const [index, item] of released.entries()) {
    if (!converting) {
      const outputFile = existingPlan?.items?.length === released.length ? existingPlan.items[index].file : anonymizedNames[index];
      items.push(contentOptions
        ? completedAnonymizedRecord ? planItem(existingPlan.items[index])
          : contentAnonymizedItemFromPublication(item, index, outputFile, yield { kind: 'publication', state, item })
        : packageItem(item.package_id, index, item.source_label || item.name, outputFile));
      continue;
    }
    if (!completedMarkdownRecord && !verifyMarkdownItem(item, contentOptions)) throw new Error('RESULT_EXPORT_SOURCE_INVALID');
    const sourceLabel = String(item.source_label || item.name || '');
    if (!validSourceLabel(sourceLabel)) throw new Error('RESULT_EXPORT_MAPPING_SOURCE_INVALID');
    items.push({ artifact_id: item.artifact_id, artifact_bytes: item.artifact_bytes,
      file: markdownNames[index], sha256: item.artifact_sha256,
      source_label: sourceLabel, extraction_grade: item.extraction_grade, reason_codes: [...item.reason_codes] });
  }
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
  const companions = newConfidentialLayout && items.length ? yield { kind: 'companion-prepare', batchId: state.token,
    selection: items.map(item => ({ document_id: item.package_id.slice(3), revision: 0, output_sha256: item.sha256 })),
    files: items.map(item => ({ name: item.file, sha256: item.sha256 })) } : null;
  if (companions && (!/^[a-f0-9]{64}$/u.test(companions.binding_sha256 || '') || !validConfidentialDescriptor(companions.confidential)))
    throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
  const value = { schema: contentOptions ? converting ? CONTENT_MARKDOWN_SCHEMA : CONTENT_ANONYMIZED_SCHEMA : converting ? MARKDOWN_SCHEMA : SCHEMA,
    run_directory: runDirectoryName(state.created_at), items,
    complete: items.length === 0 && stoppedItems.length === 0, destination_id: '', product_channel: state.product_channel,
    ...(converting || contentOptions ? { processing_mode: state.processing_mode } : {}),
    ...(contentOptions ? { content_options: contentOptions, batch_id: state.token } : {}),
    ...(contentOptions && state.product_channel === 'standalone' ? { result_layout: companions ? CONFIDENTIAL_RESULT_LAYOUT : RESULT_LAYOUT } : {}),
    ...(companions ? { confidential_binding_sha256: companions.binding_sha256, confidential: companions.confidential } : {}),
    ...(stoppedItems.length ? { stopped_items: stoppedItems } : {}) };
  writeRecord(target, value);
  return { target, value };
}
// Both drivers run the same plan exactly once. Only a yielded small ownership
// transaction may await admission; parsing, validation and plan writes do not
// restart. Exceptions re-enter the generator so its original finally executes.
function runSynchronousSteps(iterator, resolve) {
  let step = iterator.next();
  while (!step.done) {
    let value, error, failed = false;
    try { value = resolve(step.value); } catch (caught) { error = caught; failed = true; }
    step = failed ? iterator.throw(error) : iterator.next(value);
  }
  return step.value;
}
async function runAsyncSteps(iterator, resolve) {
  let step = iterator.next();
  while (!step.done) {
    let value, error, failed = false;
    try { value = await resolve(step.value); } catch (caught) { error = caught; failed = true; }
    step = failed ? iterator.throw(error) : iterator.next(value);
  }
  return step.value;
}
function ensureRecord(state) {
  return runSynchronousSteps(ensureRecordSteps(state), operation => operation.kind === 'companion-prepare'
    ? require('./standalone-document-review-store').createDocumentReviewStore().prepareResultCompanions(operation.batchId, operation.selection, operation.files)
    : confirmPublication(operation.state, operation.item));
}
function ensureRecordAsync(state) {
  return runAsyncSteps(ensureRecordSteps(state), operation => operation.kind === 'companion-prepare'
    ? require('./standalone-document-review-store').createDocumentReviewStore().prepareResultCompanionsAsync(operation.batchId, operation.selection, operation.files)
    : confirmPublicationAsync(operation.state, operation.item));
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
function presentEntry(target) {
  try { fs.lstatSync(target); return true; }
  catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}
// New-layout progress is immutable, private and published while the existing
// result claim is held. A mkdir/link without its durable anchor is uncertain:
// recovery never upgrades a same-name or same-byte foreign object into ours.
function initialProgress(record, destination) {
  if (!hasBoundResultLayout(record)) return null;
  if (!destination.root.exact || !destination.output.exact || record.destination_id !== destination.id ||
      !/^[a-f0-9]{64}$/u.test(record.batch_id || ''))
    throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
  const parent = ensurePrivateDirectory(dataRoot(), 'result-publication-progress');
  const directory = ensurePrivateDirectory(parent, record.batch_id), privateBinding = bindDirectory(directory);
  const work = createPrivateWorkStore({ privateRoot: directory, maxBytes: INITIAL_BINDING_BYTES,
    expectedRootIdentity: privateBinding.chain[0].identity });
  const expected = { schema: 'datasecure-initial-progress/1', batch_id: record.batch_id,
    plan_sha256: exportPlanDigest(record), destination_id: record.destination_id,
    root: serialDirectory(destination.root.directory), output: serialDirectory(destination.output.directory) };
  const assert = () => { assertDirectory(privateBinding); assertDirectoryBinding(destination.root);
    assertDirectoryBinding(destination.output, destination.root); };
  const read = name => {
    assert(); const target = path.join(directory, name);
    if (!presentEntry(target)) return null;
    const bytes = work.readFile(target); assert();
    try { return JSON.parse(bytes); } catch { throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE'); }
  };
  const put = (name, value) => {
    const bytes = Buffer.from(JSON.stringify(value)); assert();
    const target = path.join(directory, name);
    if (!presentEntry(target)) work.writeFile(target, bytes);
    if (!work.readFile(target).equals(bytes)) throw resultExportFailure('RESULT_EXPORT_STATE_CONFLICT');
    assert();
  };
  const begin = (name, value) => {
    const target = path.join(directory, name), bytes = Buffer.from(JSON.stringify(value));
    assert();
    // Unlike an idempotent success record, an attempt may only be minted by
    // this call. A previous attempt without success is permanently uncertain,
    // including after somebody removes its public object outside the app.
    if (presentEntry(target)) throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
    work.writeFile(target, bytes);
    if (!work.readFile(target).equals(bytes)) throw resultExportFailure('RESULT_EXPORT_STATE_CONFLICT');
    assert();
  };
  const saved = read('intent.json');
  if (saved) {
    if (JSON.stringify(saved) !== JSON.stringify(expected)) throw resultExportFailure('RESULT_EXPORT_DESTINATION_CHANGED');
  } else {
    if (exportedCount(record) > 0 || presentEntry(path.join(destination.output.path, record.run_directory)))
      throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
    put('intent.json', expected);
  }
  return { record, destination, assert, read, put, begin, plan: expected.plan_sha256 };
}
function initialDirectory(progress, parent, target, create) {
  const relative = path.relative(progress.destination.output.path, target);
  if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`) ||
      relative.split(path.sep)[0] !== progress.record.run_directory) throw resultExportFailure('RESULT_EXPORT_PATH_UNSAFE');
  const key = `directory-${crypto.createHash('sha256').update(relative).digest('hex')}.json`;
  const saved = progress.read(key);
  if (saved) {
    if (!exactKeys(saved, ['schema', 'batch_id', 'plan_sha256', 'relative', 'directory']) ||
        saved.schema !== 'datasecure-initial-directory/1' || saved.batch_id !== progress.record.batch_id ||
        saved.plan_sha256 !== progress.plan || saved.relative !== relative || saved.directory?.path !== target ||
        JSON.stringify(serialDirectory(bindDirectory(target))) !== JSON.stringify(saved.directory))
      throw resultExportFailure('RESULT_EXPORT_STATE_CONFLICT');
    const bound = exactDirectory({ ...saved.directory, io: fs }); assertDirectoryBinding(bound, parent); return bound;
  }
  const attemptKey = key.replace('directory-', 'directory-attempt-');
  if (!create || progress.read(attemptKey) || presentEntry(target)) throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
  // ABI1 guards this synchronous section at the already selected OUTPUT
  // container, never the shareable run. Native owner/ACL/ancestry admission
  // excludes ordinary other accounts while mkdir->first-bind is in progress.
  // No fallback or rights repair: acquire/assert/release/close errors propagate.
  // Node still has no portable mkdirat/openat capability. Hostile same-UID/RAM
  // mutation is outside the documented boundary, not an atomic-handle claim.
  return require('../core/ownership-control').withOwnershipControl(progress.destination.output.path, guard => {
    guard.assertHeld(); progress.assert(); assertDirectoryBinding(parent);
    if (progress.read(attemptKey) || presentEntry(target)) throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
    progress.begin(attemptKey, { schema: 'datasecure-initial-directory-attempt/1', batch_id: progress.record.batch_id,
      plan_sha256: progress.plan, relative, parent: serialDirectory(parent.directory) });
    guard.assertHeld(); progress.assert(); assertDirectoryBinding(parent);
    fs.mkdirSync(target, { mode: 0o700 });
    guard.assertHeld(); progress.assert(); assertDirectoryBinding(parent);
    const bound = bindPlainDirectory(target, parent);
    syncParentDirectory(target, fs, process.platform);
    guard.assertHeld(); progress.assert(); assertDirectoryBinding(bound, parent);
    progress.put(key, { schema: 'datasecure-initial-directory/1', batch_id: progress.record.batch_id,
      plan_sha256: progress.plan, relative, directory: serialDirectory(bound.directory) });
    guard.assertHeld(); progress.assert(); assertDirectoryBinding(bound, parent);
    return bound;
  });
}
function initialLeafParent(progress, run, name) {
  let parent = run;
  for (const segment of name.split('/').slice(0, -1))
    parent = initialDirectory(progress, parent, path.join(parent.path, segment), false);
  return parent;
}
function initialLeafKey(name) { return `file-${crypto.createHash('sha256').update(name).digest('hex')}.json`; }
function initialLeafAttemptKey(name) { return initialLeafKey(name).replace('file-', 'file-attempt-'); }
function inspectInitialLeaf(progress, run, item, expected = progress.read(initialLeafKey(item.file))) {
  if (!expected || !exactKeys(expected, ['schema', 'batch_id', 'plan_sha256', 'name', 'sha256', 'identity']) ||
      expected.schema !== 'datasecure-initial-file/1' || expected.batch_id !== progress.record.batch_id ||
      expected.plan_sha256 !== progress.plan || expected.name !== item.file || expected.sha256 !== item.sha256)
    throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
  const parent = initialLeafParent(progress, run, item.file);
  const actual = readBoundFileRecord(path.join(run.path, item.file), { directory: parent.directory,
    maximum: 32 * 1024 * 1024, checkCtime: true,
    validateParents: () => { progress.assert(); assertDirectoryBinding(run); assertDirectoryBinding(parent); } });
  if (JSON.stringify(actual.identity) !== JSON.stringify(expected.identity) ||
      crypto.createHash('sha256').update(actual.bytes).digest('hex') !== item.sha256)
    throw resultExportFailure('RESULT_EXPORT_CONFLICT');
  return actual;
}
function recordInitialLeaf(progress, run, item, originalIdentity) {
  const parent = initialLeafParent(progress, run, item.file);
  const actual = readBoundFileRecord(path.join(run.path, item.file), { directory: parent.directory,
    maximum: 32 * 1024 * 1024, checkCtime: true,
    validateParents: () => { progress.assert(); assertDirectoryBinding(run); assertDirectoryBinding(parent); } });
  if (['dev', 'ino', 'birth'].some(key => actual.identity[key] !== originalIdentity[key]) ||
      crypto.createHash('sha256').update(actual.bytes).digest('hex') !== item.sha256)
    throw resultExportFailure('RESULT_EXPORT_VERIFY_FAILED');
  progress.put(initialLeafKey(item.file), { schema: 'datasecure-initial-file/1', batch_id: progress.record.batch_id,
    plan_sha256: progress.plan, name: item.file, sha256: item.sha256, identity: actual.identity });
  inspectInitialLeaf(progress, run, item);
}
function ensurePlainDirectory(destination, name, progress = null) {
  assertDirectoryBinding(destination.root);
  assertDirectoryBinding(destination.output, destination.root);
  const parent = destination.output.path;
  const target = path.join(parent, name);
  if (path.dirname(target) !== parent || name === '.' || name === '..' || /[\\/\0]/u.test(name)) throw new Error('RESULT_EXPORT_PATH_UNSAFE');
  if (progress) return initialDirectory(progress, destination.output, target, true);
  if (!fs.existsSync(target)) fs.mkdirSync(target, { mode: 0o700 });
  assertDirectoryBinding(destination.root);
  assertDirectoryBinding(destination.output, destination.root);
  return bindPlainDirectory(target, destination.output);
}
function ensureResultParent(destination, run, relativeFile, progress = null) {
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
    if (progress) parent = initialDirectory(progress, parent, target, true);
    else {
      if (!fs.existsSync(target)) fs.mkdirSync(target, { mode: 0o700 });
      parent = bindPlainDirectory(target, parent);
    }
  }
  assertDirectoryBinding(parent, parent.path === run.path ? destination.output : null);
  return { parent, leaf, target: path.join(parent.path, leaf) };
}
function* exportOneSteps(destination, run, item, contentOptions, contentRecord, progress = null) {
  assertDirectoryBinding(destination.root);
  assertDirectoryBinding(destination.output, destination.root);
  assertDirectoryBinding(run, destination.output);
  const resolvedTarget = ensureResultParent(destination, run, item.file, progress);
  const target = resolvedTarget.target;
  assertDirectoryBinding(resolvedTarget.parent);
  const validateParents = () => {
    assertDirectoryBinding(destination.root);
    assertDirectoryBinding(destination.output, destination.root);
    assertDirectoryBinding(run, destination.output);
    assertDirectoryBinding(resolvedTarget.parent);
  };
  if (progress) {
    const saved = progress.read(initialLeafKey(item.file));
    if (saved) { inspectInitialLeaf(progress, run, item, saved); return false; }
    if (progress.read(initialLeafAttemptKey(item.file)) || presentEntry(target)) throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
  } else if (fs.existsSync(target)) {
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
    const expectation = yield { batchId: contentRecord.batch_id, documentId: item.package_id.slice(3) };
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
  return publishInitialBytes(destination, run, item, bytes, resolvedTarget, validateParents, progress);
}
// Both Markdown and the two fixed confidential leaves use the same exclusive
// writer, durable attempt/identity receipt and no-adoption recovery rules.
function publishInitialBytes(destination, run, item, bytes, resolvedTarget, validateParents, progress) {
  const target = resolvedTarget.target, expected = crypto.createHash('sha256').update(bytes).digest('hex');
  if (expected !== item.sha256) throw resultExportFailure('RESULT_EXPORT_SOURCE_INVALID');
  if (progress) {
    validateParents();
    progress.begin(initialLeafAttemptKey(item.file), { schema: 'datasecure-initial-file-attempt/1',
      batch_id: progress.record.batch_id, plan_sha256: progress.plan, name: item.file, sha256: item.sha256,
      bytes: bytes.length, parent: serialDirectory(resolvedTarget.parent.directory) });
    validateParents();
  }
  const temporary = path.join(resolvedTarget.parent.path, `.${resolvedTarget.leaf}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  let descriptor, originalIdentity;
  try {
    assertDirectoryBinding(destination.root);
    assertDirectoryBinding(destination.output, destination.root);
    assertDirectoryBinding(run, destination.output);
    assertDirectoryBinding(resolvedTarget.parent);
    descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
    writeFully(descriptor, bytes, fs);
    fs.fsyncSync(descriptor);
    const opened = fs.fstatSync(descriptor, progress ? { bigint: true } : undefined);
    const named = fs.lstatSync(temporary, progress ? { bigint: true } : undefined);
    const one = progress ? 1n : 1;
    if (!opened.isFile() || !named.isFile() || named.isSymbolicLink() || opened.nlink !== one || named.nlink !== one ||
        opened.dev !== named.dev || opened.ino !== named.ino || progress &&
        (opened.birthtimeNs !== named.birthtimeNs || opened.mtimeNs !== named.mtimeNs || opened.ctimeNs !== named.ctimeNs || opened.size !== named.size))
      throw new Error('RESULT_EXPORT_PATH_UNSAFE');
    if (progress) originalIdentity = objectIdentity(opened);
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
    const linkedTemporary = fs.lstatSync(temporary, progress ? { bigint: true } : undefined);
    const linkedTarget = fs.lstatSync(target, progress ? { bigint: true } : undefined);
    const two = progress ? 2n : 2;
    if (!linkedTemporary.isFile() || !linkedTarget.isFile() || linkedTemporary.isSymbolicLink() ||
        linkedTarget.isSymbolicLink() || linkedTemporary.nlink !== two || linkedTarget.nlink !== two ||
        linkedTemporary.dev !== linkedTarget.dev || linkedTemporary.ino !== linkedTarget.ino || progress &&
        (!sameObject(linkedTemporary, originalIdentity) || !sameObject(linkedTarget, originalIdentity) ||
          linkedTemporary.mtimeNs !== opened.mtimeNs || linkedTarget.mtimeNs !== opened.mtimeNs ||
          linkedTemporary.size !== opened.size || linkedTarget.size !== opened.size)) {
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
    if (progress) recordInitialLeaf(progress, run, item, originalIdentity);
    return true;
  } finally {
    try { if (descriptor !== undefined) fs.closeSync(descriptor); } catch {}
    try {
      if (progress) {
        validateParents();
        if (originalIdentity && sameObject(fs.lstatSync(temporary, { bigint: true }), originalIdentity)) fs.unlinkSync(temporary);
      } else if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {}
  }
}
function publishInitialCompanions(record, destination, run, progress, prepared) {
  if (record.result_layout !== CONFIDENTIAL_RESULT_LAYOUT) return;
  if (!progress || !validConfidentialDescriptor(record.confidential)) throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
  if (prepared.binding_sha256 !== record.confidential_binding_sha256 ||
      JSON.stringify(prepared.confidential) !== JSON.stringify(record.confidential))
    throw resultExportFailure('RESULT_EXPORT_STATE_CONFLICT');
  const parent = initialDirectory(progress, run, path.join(run.path, CONFIDENTIAL_DIRECTORY), true);
  for (const [index, file] of CONFIDENTIAL_FILES.entries()) {
    const item = confidentialItems(record)[index], bytes = prepared[file.key];
    if (!Buffer.isBuffer(bytes) || bytes.length !== record.confidential[file.key].bytes ||
        crypto.createHash('sha256').update(bytes).digest('hex') !== item.sha256)
      throw resultExportFailure('RESULT_EXPORT_SOURCE_INVALID');
    const saved = progress.read(initialLeafKey(item.file));
    if (saved) { inspectInitialLeaf(progress, run, item, saved); continue; }
    const leaf = file.name.split('/').at(-1), target = path.join(parent.path, leaf);
    if (progress.read(initialLeafAttemptKey(item.file)) || presentEntry(target)) throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
    const validateParents = () => { progress.assert(); assertDirectoryBinding(run, destination.output); assertDirectoryBinding(parent, run); };
    validateParents();
    publishInitialBytes(destination, run, item, bytes, { parent, leaf, target }, validateParents, progress);
    validateParents();
  }
}
function exportOne(destination, run, item, contentOptions, contentRecord, progress) {
  return runSynchronousSteps(exportOneSteps(destination, run, item, contentOptions, contentRecord, progress), operation =>
    require('./standalone-document-review-store').createDocumentReviewStore().publicationExpectation(operation.batchId, operation.documentId));
}
function exportOneAsync(destination, run, item, contentOptions, contentRecord, progress) {
  return runAsyncSteps(exportOneSteps(destination, run, item, contentOptions, contentRecord, progress), operation =>
    require('./standalone-document-review-store').createDocumentReviewStore().publicationExpectationAsync(operation.batchId, operation.documentId));
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
function* exportOpenItemsSteps(target, record, destination) {
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
  const progress = initialProgress(current, destination);
  const run = ensurePlainDirectory(destination, current.run_directory, progress);
  for (let index = 0; index < current.items.length; index++) {
    const item = current.items[index];
    if (item.exported === true) continue;
    yield { destination, run, item, contentOptions: current.schema === CONTENT_MARKDOWN_SCHEMA ? current.content_options : undefined, record: current, progress };
    const items = current.items.map((entry, position) => position === index ? { ...planItem(entry), exported: true } : entry);
    current = { ...current, items };
    writeRecord(target, current);
  }
  if (current.items.every((item) => item.exported === true)) {
    // Pure conversion keeps the original basename and therefore needs no
    // source-to-result ledger. Older v3 plans retain their already promised
    // mapping; anonymization plans continue to publish it unchanged.
    if (!hasBoundResultLayout(current) && current.product_channel === 'standalone' && ![MARKDOWN_SCHEMA, CONTENT_MARKDOWN_SCHEMA].includes(current.schema) &&
        (current.schema === LEGACY_MARKDOWN_SCHEMA || current.items.length > 0)) {
      exportVisibleMapping(destination, run, current);
    }
    if (current.result_layout === CONFIDENTIAL_RESULT_LAYOUT) {
      const prepared = yield { kind: 'companion-read', record: current };
      publishInitialCompanions(current, destination, run, progress, prepared);
    }
    if (hasBoundResultLayout(current)) captureInitialResultBinding(current, run, progress);
    current = { ...current, complete: true };
    writeRecord(target, current);
    try {
      if (current.product_channel === 'standalone') require('./standalone-history-store').recordStandaloneExport(target, current, run.path);
    }
    catch { /* private history cannot change a committed user export */ }
  }
  return current;
}

function exportOpenItems(target, record, destination) {
  return runSynchronousSteps(exportOpenItemsSteps(target, record, destination), operation => operation.kind === 'companion-read'
    ? require('./standalone-document-review-store').createDocumentReviewStore().readResultCompanions(operation.record.batch_id,
      operation.record.confidential_binding_sha256, confidentialSelection(operation.record), confidentialNames(operation.record))
    : exportOne(operation.destination, operation.run, operation.item, operation.contentOptions, operation.record, operation.progress));
}
function exportOpenItemsAsync(target, record, destination) {
  return runAsyncSteps(exportOpenItemsSteps(target, record, destination), operation => operation.kind === 'companion-read'
    ? require('./standalone-document-review-store').createDocumentReviewStore().readResultCompanionsAsync(operation.record.batch_id,
      operation.record.confidential_binding_sha256, confidentialSelection(operation.record), confidentialNames(operation.record))
    : exportOneAsync(operation.destination, operation.run, operation.item, operation.contentOptions, operation.record, operation.progress));
}
function resultBindingPath(batchId) {
  if (!/^[a-f0-9]{64}$/u.test(batchId || '')) throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
  return path.join(dataRoot(), 'result-publication-bindings', `${batchId}.json`);
}
function serialDirectory(binding) {
  return { path: binding.path, real: binding.real, chain: binding.chain, platform: binding.platform };
}
function assertInitialInventory(directory, files) {
  // Called only by the new RESULT_LAYOUT capture/opener. Legacy paths never
  // acquire this exception, and the inspector is shared by the whole tree.
  const inspectMetadata = createPublicResultMetadataInspector();
  const expectedFiles = new Set(files.map(file => file.name)), expectedDirectories = new Set();
  for (const name of expectedFiles) {
    const segments = name.split('/');
    for (let index = 1; index < segments.length; index++) expectedDirectories.add(segments.slice(0, index).join('/'));
  }
  const pending = [{ folder: directory.path, prefix: '' }], actualFiles = [];
  while (pending.length) {
    const { folder, prefix } = pending.pop(), bound = bindDirectory(folder);
    assertDirectory(directory);
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      try { if (inspectMetadata(bound, entry.name)) continue; }
      catch { throw resultExportFailure('RESULT_EXPORT_CONFLICT'); }
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) throw resultExportFailure('RESULT_EXPORT_CONFLICT');
      if (entry.isDirectory() && expectedDirectories.has(name)) pending.push({ folder: path.join(folder, entry.name), prefix: name + '/' });
      else if (entry.isFile() && expectedFiles.has(name)) actualFiles.push(name);
      else throw resultExportFailure('RESULT_EXPORT_CONFLICT');
    }
    assertDirectory(bound); assertDirectory(directory);
  }
  if (JSON.stringify(actualFiles.sort()) !== JSON.stringify([...expectedFiles].sort())) throw resultExportFailure('RESULT_EXPORT_CONFLICT');
  assertDirectory(directory);
}
function writePrivateResultMapping(directory, batchId, mapping) {
  const mappingFile = path.join(directory, `${batchId}-Zuordnung.csv`);
  const mappingWork = createPrivateWorkStore({ privateRoot: directory, maxBytes: PRIVATE_MAPPING_BYTES });
  if (presentEntry(mappingFile)) {
    if (!mappingWork.readFile(mappingFile).equals(mapping)) throw resultExportFailure('RESULT_EXPORT_MAPPING_CONFLICT');
  } else mappingWork.writeFile(mappingFile, mapping);
  if (!mappingWork.readFile(mappingFile).equals(mapping)) throw resultExportFailure('RESULT_EXPORT_MAPPING_CONFLICT');
}
function captureInitialResultBinding(record, run, progress) {
  if (!progress || !run.exact) throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
  const runPath = run.path, directory = run.directory;
  progress.assert(); assertDirectoryBinding(run);
  const files = record.items.map(item => {
    const target = path.resolve(runPath, item.file), relative = path.relative(runPath, target);
    if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) throw resultExportFailure('RESULT_EXPORT_PATH_UNSAFE');
    const file = inspectInitialLeaf(progress, run, item);
    if (crypto.createHash('sha256').update(file.bytes).digest('hex') !== item.sha256) throw resultExportFailure('RESULT_EXPORT_VERIFY_FAILED');
    return { document_id: (item.artifact_id || item.package_id).slice(3), name: item.file,
      sha256: item.sha256, identity: file.identity };
  });
  const confidential = record.result_layout === CONFIDENTIAL_RESULT_LAYOUT ? {
    confidential_binding_sha256: record.confidential_binding_sha256,
    confidential: record.confidential,
    confidential_directory: serialDirectory(initialDirectory(progress, run, path.join(run.path, CONFIDENTIAL_DIRECTORY), false).directory),
    confidential_files: confidentialItems(record).map(item => {
      const actual = inspectInitialLeaf(progress, run, item);
      return { name: item.file, sha256: item.sha256, identity: actual.identity };
    })
  } : {};
  assertInitialInventory(directory, [...files, ...(confidential.confidential_files || [])]);
  const target = resultBindingPath(record.batch_id);
  ensurePrivateDirectory(dataRoot(), 'result-publication-bindings');
  const bytes = Buffer.from(JSON.stringify({ schema: record.result_layout === CONFIDENTIAL_RESULT_LAYOUT
    ? 'datasecure-initial-results/2' : 'datasecure-initial-results/1', batch_id: record.batch_id,
    processing_mode: record.processing_mode, result_layout: record.result_layout,
    root: path.dirname(path.dirname(runPath)), directory: serialDirectory(directory), files, ...confidential }));
  const work = createPrivateWorkStore({ privateRoot: path.dirname(target), maxBytes: INITIAL_BINDING_BYTES });
  let existing;
  let present = true;
  try { fs.lstatSync(target); } catch (error) { if (error?.code !== 'ENOENT') throw error; present = false; }
  progress.assert(); assertDirectoryBinding(run);
  if (present) existing = work.readFile(target);
  if (existing) { if (!existing.equals(bytes)) throw resultExportFailure('RESULT_EXPORT_STATE_CONFLICT'); }
  else work.writeFile(target, bytes);
  if (!work.readFile(target).equals(bytes)) throw resultExportFailure('RESULT_EXPORT_VERIFY_FAILED');
  progress.assert(); assertDirectoryBinding(run);
  if (record.processing_mode !== 'markdown-only') {
    writePrivateResultMapping(path.dirname(target), record.batch_id, visibleMappingBytes(record));
  }
  progress.assert(); assertDirectoryBinding(run);
}
// No publication, provisioning or adoption on this reader. Full BigInt object
// and leaf identities were captured by the original publishing transaction.
function initialResultPublication(batchId, verifyFiles = true) {
  if (!/^[a-f0-9]{64}$/u.test(batchId || '')) throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
  const target = path.join(dataRoot(), 'result-export-state', `re_${crypto.createHash('sha256').update(batchId).digest('hex').slice(0, 32)}.json`);
  try { fs.lstatSync(target); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  const record = readPublicationRecordSnapshot(target, batchId);
  if (!hasBoundResultLayout(record)) return null; // never reinterpret old user folders
  if (record.batch_id !== batchId || !record.items.length) throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
  // A validated, still-writing initial plan is not a completed generation and
  // must grant neither a folder nor correction authority. Do not describe this
  // ordinary worker interval as tampering. Missing completed proofs remain hard.
  if (record.complete === false) throw resultExportFailure('RESULT_EXPORT_PENDING');
  if (record.items.some(item => item.exported !== true))
    throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
  const bytes = readBoundFile(resultBindingPath(batchId), { maximum: INITIAL_BINDING_BYTES, minimum: 1 });
  const value = JSON.parse(bytes);
  const withConfidential = record.result_layout === CONFIDENTIAL_RESULT_LAYOUT;
  const proofKeys = ['schema', 'batch_id', 'processing_mode', 'result_layout', 'root', 'directory', 'files'];
  if (withConfidential) proofKeys.push('confidential_binding_sha256', 'confidential', 'confidential_directory', 'confidential_files');
  if (!exactKeys(value, proofKeys) ||
      value.schema !== (withConfidential ? 'datasecure-initial-results/2' : 'datasecure-initial-results/1') ||
      value.batch_id !== batchId || value.processing_mode !== record.processing_mode ||
      value.result_layout !== record.result_layout || typeof value.root !== 'string' || !path.isAbsolute(value.root) ||
      !exactKeys(value.directory, ['path', 'real', 'chain', 'platform']) || value.directory.platform !== process.platform ||
      typeof value.directory.real !== 'string' || !Array.isArray(value.directory.chain) || value.directory.chain.length === 0 ||
      !Array.isArray(value.files) || value.directory.path !== path.join(value.root,
        isMarkdownRecord(record) ? 'DataSecure-Markdown' : 'DataSecure-Output', record.run_directory) ||
      value.files.length !== record.items.length || value.files.some((file, index) =>
        !exactKeys(file, ['document_id', 'name', 'sha256', 'identity']) || file.name !== record.items[index].file ||
        file.sha256 !== record.items[index].sha256 || file.document_id !== (record.items[index].artifact_id || record.items[index].package_id).slice(3)))
    throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
  if (withConfidential && (value.confidential_binding_sha256 !== record.confidential_binding_sha256 ||
      JSON.stringify(value.confidential) !== JSON.stringify(record.confidential) ||
      !exactKeys(value.confidential_directory, ['path', 'real', 'chain', 'platform']) ||
      value.confidential_directory.platform !== process.platform ||
      value.confidential_directory.path !== path.join(value.directory.path, CONFIDENTIAL_DIRECTORY) ||
      typeof value.confidential_directory.real !== 'string' || !Array.isArray(value.confidential_directory.chain) ||
      value.confidential_directory.chain.length === 0 || !Array.isArray(value.confidential_files) || value.confidential_files.length !== 2 ||
      value.confidential_files.some((file, index) => !exactKeys(file, ['name', 'sha256', 'identity']) ||
        file.name !== CONFIDENTIAL_FILES[index].name || file.sha256 !== confidentialItems(record)[index].sha256)))
    throw resultExportFailure('RESULT_EXPORT_STATE_UNSAFE');
  if (verifyFiles) {
    const directory = { ...value.directory, io: fs };
    if (JSON.stringify(serialDirectory(bindDirectory(directory.path))) !== JSON.stringify(value.directory)) throw resultExportFailure('RESULT_EXPORT_CONFLICT');
    assertDirectory(directory);
    const confidentialDirectory = withConfidential ? { ...value.confidential_directory, io: fs } : null;
    if (confidentialDirectory && JSON.stringify(serialDirectory(bindDirectory(confidentialDirectory.path))) !== JSON.stringify(value.confidential_directory))
      throw resultExportFailure('RESULT_EXPORT_CONFLICT');
    const allFiles = [...value.files, ...(value.confidential_files || [])];
    for (const file of allFiles) {
      const privateFile = withConfidential && value.confidential_files.includes(file);
      const parent = privateFile ? confidentialDirectory : null;
      const actual = readBoundFileRecord(path.join(directory.path, file.name), { ...(parent ? { directory: parent } : {}), maximum: 32 * 1024 * 1024,
        checkCtime: true, validateParents: () => { assertDirectory(directory); if (parent) assertDirectory(parent); } });
      if (JSON.stringify(actual.identity) !== JSON.stringify(file.identity) ||
          crypto.createHash('sha256').update(actual.bytes).digest('hex') !== file.sha256)
        throw resultExportFailure('RESULT_EXPORT_CONFLICT');
    }
    // Initial results are reusable Markdown just like later generations. The
    // opener must not silently include user-added private files or follow a
    // replaced/symlinked subtree. Walk only the finite promised folder set;
    // opaque, bounded Finder metadata is not part of the Markdown inventory.
    assertInitialInventory(directory, allFiles);
    if (confidentialDirectory) assertDirectory(confidentialDirectory);
  }
  return { ...value, binding_sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
function privateResultLedger(batchId) {
  const initial = initialResultPublication(batchId, false);
  if (!initial || initial.processing_mode === 'markdown-only') return null;
  const target = path.join(path.dirname(resultBindingPath(batchId)), `${batchId}-Zuordnung.csv`);
  const record = readPublicationRecordSnapshot(path.join(dataRoot(), 'result-export-state', `re_${crypto.createHash('sha256').update(batchId).digest('hex').slice(0, 32)}.json`), batchId);
  if (!readBoundFile(target, { maximum: PRIVATE_MAPPING_BYTES }).equals(visibleMappingBytes(record))) throw resultExportFailure('RESULT_EXPORT_MAPPING_CONFLICT');
  return target;
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
  // Legacy /1 keeps its private aids internal. New /2 has already committed
  // its mandatory version-bound companions before the completion record.
  try { if (hasBoundResultLayout(readRecord(recordPath(state.token)))) {
    identityLedger.materialize(state); return;
  } } catch { return; }
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
function* exportCompletedStateSteps(state) {
  try {
    if (state.product_channel === 'standalone') require('./standalone-history-store').recordStandaloneState(state);
  }
  catch { /* the durable batch/export records remain authoritative */ }
  const target = recordPath(state.token);
  let claim;
  try { claim = yield { kind: 'claim', target }; }
  catch (error) { recordResultExportFailure('result_export_claim', error); return guardDiagnostic({ exported: 0, pending: releasedCount(state), available: false }, error); }
  if (!claim) {
    // No capability was minted: null also covers unsafe/unreadable claims and
    // failed stale-owner cleanup, not exclusively live-owner contention.
    recordResultExportFailure('result_export_claim', Object.assign(new Error('RESULT_EXPORT_CLAIM_UNAVAILABLE'), { code: 'RESULT_EXPORT_CLAIM_UNAVAILABLE' }));
    return { exported: 0, pending: releasedCount(state), available: false };
  }
  let plan;
  let outcome;
  let released = false;
  try {
    outcome = yield* (function* () {
      try {
        if (waiverExists(target)) {
          const record = readRecord(target);
          const waiver = readExportWaiver(target, record);
          return { exported: waiver.exported_count, pending: waiver.pending_count, available: false };
        }
      } catch (error) {
        recordResultExportFailure('result_export_plan', error);
        return { exported: 0, pending: releasedCount(state), available: false };
      }
      try { plan = yield { kind: 'plan', state }; }
      catch (error) {
        recordResultExportFailure('result_export_plan', error);
        return { exported: 0, pending: releasedCount(state), available: false };
      }
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
        const finished = yield { kind: 'copy', target: plan.target, record: readRecord(plan.target), destination };
        if (finished.complete === true) publishStandaloneIdentityIfPossible(state);
        return finished.complete === true ? { exported: total, pending: 0, available: true } : pendingResult();
      } catch (error) {
        recordResultExportFailure('result_export_copy', error);
        return pendingResult();
      }
    })();
  } finally {
    try {
      released = yield { kind: 'release', target, claim };
      if (released !== true) recordResultExportFailure('result_export_claim_release',
        Object.assign(new Error('RESULT_EXPORT_RELEASE_UNCONFIRMED'), { code: 'RESULT_EXPORT_RELEASE_UNCONFIRMED' }));
    }
    catch (error) {
      recordResultExportFailure('result_export_claim_release', error);
      outcome = guardDiagnostic({ exported: 0, pending: releasedCount(state), available: false }, error);
    }
  }
  return released || outcome?.ownership_error_code ? outcome : { exported: 0, pending: releasedCount(state), available: false };
}
function exportCompletedState(state) {
  return runSynchronousSteps(exportCompletedStateSteps(state), operation => {
    if (operation.kind === 'claim') return acquireExportClaim(operation.target);
    if (operation.kind === 'plan') return ensureRecord(operation.state);
    if (operation.kind === 'release') return releaseExportClaim(operation.target, operation.claim);
    if (operation.kind === 'copy') return exportOpenItems(operation.target, operation.record, operation.destination);
    throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  });
}
function exportCompletedStateAsync(state) {
  return runAsyncSteps(exportCompletedStateSteps(state), operation => {
    if (operation.kind === 'claim') return acquireExportClaimAsync(operation.target);
    if (operation.kind === 'plan') return ensureRecordAsync(operation.state);
    if (operation.kind === 'release') return releaseExportClaimAsync(operation.target, operation.claim);
    if (operation.kind === 'copy') return exportOpenItemsAsync(operation.target, operation.record, operation.destination);
    throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  });
}
function replayPendingResultExports() {
  let exported = 0;
  let pending = 0;
  let failures = 0;
  let ownershipError;
  let entries;
  try { entries = fs.readdirSync(outboxDirectory(), { withFileTypes: true }); }
  catch { return { exported, pending, failures: 1 }; }
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) { failures++; continue; }
    if (TEMPORARY_RECORD_RE.test(entry.name)) continue;
    if (CLAIM_RE.test(entry.name)) continue;
    if (PREPARED_CLAIM_RE.test(entry.name)) continue;
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
    } catch (error) { failures++; if (/^OWNERSHIP_GUARD_[A-Z_]+$/u.test(error?.code || '')) ownershipError = error; }
    finally {
      let released = !claim;
      try { if (claim) released = releaseExportClaim(target, claim); }
      catch (error) { if (/^OWNERSHIP_GUARD_[A-Z_]+$/u.test(error?.code || '')) ownershipError = error; }
      if (!released) {
        let itemCount = 0;
        try { itemCount = readRecord(target).items.length; } catch { /* retain fail-closed zero */ }
        exported = exportedBeforeEntry;
        pending = pendingBeforeEntry + itemCount;
        failures = Math.max(failures, failuresBeforeEntry + 1);
      }
    }
  }
  return guardDiagnostic({ exported, pending, failures }, ownershipError);
}

// Private Standalone history uses durable export plans even after journal
// retention. Only neutral counters leave this module; source labels do not.
function standaloneExportHistoryRow(target, record) {
  if (record.product_channel !== 'standalone') return null;
  const waiver = readExportWaiver(target, record);
  const stamp = /^Lauf-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-[a-f0-9]{8}$/u.exec(record.run_directory);
  if (!stamp) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  const created = `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}.000Z`;
  if (!Number.isFinite(Date.parse(created))) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
  let directory = '';
  if (record.complete === true) {
    try {
      const destination = activeDestination(record, { create: false });
      if (destination && destination.id === record.destination_id)
        directory = bindPlainDirectory(path.join(destination.output.path, record.run_directory), destination.output).path;
    } catch { /* original history binding, not this convenience path, authorizes opening */ }
  }
  const failed = record.stopped_items?.length || 0;
  return { export_id: path.basename(target, '.json'), target, directory, run_directory: record.run_directory, complete: record.complete,
    ...(record.result_layout ? { result_layout: record.result_layout } : {}),
    exported_count: exportedCount(record), pending_count: record.items.length - exportedCount(record),
    ...(waiver ? { abandoned: true } : {}),
    summary: { created_at: created, processing_mode: record.processing_mode === 'markdown-only' ? 'markdown-only' : 'markdown-and-anonymize',
      selected_count: record.items.length + failed, result_count: record.items.length, failed_count: failed,
      completed_count: record.items.length + failed, review_count: 0, complete: true } };
}

function readStandaloneExportHistoryEntry(batchId, { legacyExportId = null } = {}) {
  const failed = code => Object.assign(new Error('Der ausgewählte lokale Lauf ist nicht mehr verfügbar.'), { code });
  if (typeof batchId !== 'string' || !/^[a-f0-9]{64}$/u.test(batchId)) throw failed('STANDALONE_HISTORY_INVALID');
  let exportId = `re_${crypto.createHash('sha256').update(batchId).digest('hex').slice(0, 32)}`;
  let expectedBatchId = batchId;
  if (legacyExportId !== null) {
    if (!/^re_[a-f0-9]{32}$/u.test(legacyExportId) ||
        crypto.createHash('sha256').update(`standalone-history:${legacyExportId}`).digest('hex') !== batchId)
      throw failed('STANDALONE_HISTORY_INVALID');
    exportId = legacyExportId;
    // The synthetic list ID is not an actual batch token. Read the independent
    // owner afresh; ancient exports without one retain only the name scan.
    try { expectedBatchId = readExportOwner(`${exportId}.json`)?.batch_id || null; }
    catch { throw failed('STANDALONE_HISTORY_UNAVAILABLE'); }
  }
  const directory = path.join(dataRoot(), 'result-export-state'), target = path.join(directory, `${exportId}.json`);
  try { fs.lstatSync(target); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw failed('STANDALONE_HISTORY_UNAVAILABLE');
  }
  try {
    // No mkdir, replay, publication or binding backfill on this read path.
    const binding = bindDirectory(directory);
    if (comparablePath(binding.real) !== comparablePath(directory)) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
    // Only this read-only projection may tolerate a proven atomic leaf
    // replacement. Keep the original parent binding and validate the entire
    // newly adopted record/owner/purpose, not an old successful DTO.
    const record = JSON.parse(readBoundFileSnapshot(target, { directory: binding, maximum: 1024 * 1024, minimum: 1 }));
    if (!validRecord(record)) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
    assertRecordContentAnchor(target, record, { expectedBatchId });
    const row = standaloneExportHistoryRow(target, record);
    assertDirectory(binding);
    return row;
  } catch { throw failed('STANDALONE_HISTORY_UNAVAILABLE'); }
}

class HistoryMembershipChanged extends Error {}
function historyReviewOwners() {
  const root = bindDirectory(dataRoot()), directory = path.join(root.path, 'document-reviews');
  let binding = null;
  // Include every matching NAME, not just directories. A file or a dangling
  // symlink with an owner's token must still fail the real anchor reader.
  const names = () => fs.readdirSync(directory).filter(token => /^[a-f0-9]{64}$/u.test(token)).sort();
  let initial = [], byExport = new Map();
  function refresh() {
    // Preserve any already-bound namespace across the one permitted rebuild.
    // A replacement parent must not become a fresh starting point on retry.
    assertDirectory(root);
    if (binding) assertDirectory(binding);
    else {
      try { binding = bindDirectory(directory); }
      catch (error) { if (error?.code !== 'ENOENT') throw error; }
    }
    initial = binding ? names() : []; byExport = new Map();
    for (const token of initial) {
      const name = `re_${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}.json`;
      if (!byExport.has(name)) byExport.set(name, []);
      byExport.get(name).push(token);
    }
    if (binding) assertDirectory(binding);
    assertDirectory(root);
  }
  refresh();
  return {
    refresh,
    matches(name) { return byExport.get(name) || []; },
    assertUnchanged() {
      assertDirectory(root);
      if (!binding) {
        try { fs.lstatSync(directory); }
        catch (error) { if (error?.code === 'ENOENT') return; throw error; }
        // First creation by a live worker is normal. Bind this exact physical
        // object before permitting a rebuild; a file/link cannot qualify.
        binding = bindDirectory(directory);
        assertDirectory(root);
        throw new HistoryMembershipChanged();
      }
      assertDirectory(binding);
      const current = names();
      assertDirectory(binding);
      if (current.length !== initial.length || current.some((name, index) => name !== initial[index])) {
        // Only ordinary new directories qualify as a live-writer race. Lost
        // names, links, access errors or replacement identities fail closed.
        const previous = new Set(initial), present = new Set(current);
        if (initial.some(name => !present.has(name))) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
        for (const name of current) if (!previous.has(name)) bindDirectory(path.join(directory, name));
        assertDirectory(binding);
        throw new HistoryMembershipChanged();
      }
    }
  };
}

function readStandaloneExportHistory({ omitBatchIds = [], batchIds = null, legacyExportIds = {} } = {}) {
  if (batchIds !== null) {
    if (!Array.isArray(batchIds) || batchIds.length > 5 || batchIds.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/u.test(id)))
      throw Object.assign(new Error('STANDALONE_HISTORY_INVALID'), { code: 'STANDALONE_HISTORY_INVALID' });
    const rows = [], root = bindDirectory(dataRoot());
    try {
      let directory;
      try { directory = bindDirectory(path.join(root.path, 'result-export-state')); }
      catch (error) { if (error?.code !== 'ENOENT') throw error; assertDirectory(root); return []; }
      for (const batchId of new Set(batchIds)) {
        if (omitBatchIds.includes(batchId)) continue;
        assertDirectory(directory);
        const row = readStandaloneExportHistoryEntry(batchId, { legacyExportId: legacyExportIds[batchId] || null });
        if (row) rows.push(row);
        assertDirectory(directory);
      }
      assertDirectory(directory); assertDirectory(root); return rows;
    } catch { throw Object.assign(new Error('RESULT_EXPORT_STATE_UNSAFE'), { code: 'RESULT_EXPORT_STATE_UNSAFE' }); }
  }
  const omitted = new Set(omitBatchIds.filter(token => typeof token === 'string' && /^[a-f0-9]{64}$/u.test(token))
    .map(token => `re_${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}.json`));
  let entries, directory;
  try {
    directory = bindDirectory(outboxDirectory());
    entries = fs.readdirSync(directory.path, { withFileTypes: true });
  } catch { return []; }
  let reviewOwners;
  try { reviewOwners = historyReviewOwners(); }
  catch { throw Object.assign(new Error('RESULT_EXPORT_STATE_UNSAFE'), { code: 'RESULT_EXPORT_STATE_UNSAFE' }); }
  for (let attempt = 0; attempt < 2; attempt++) {
    const rows = [];
    for (const entry of entries) {
      if (!entry.isFile() || !RECORD_RE.test(entry.name)) continue;
      if (omitted.has(entry.name)) continue;
      try {
        const target = path.join(directory.path, entry.name);
        const row = standaloneExportHistoryRow(target, readRecord(target, { reviewOwners }));
        if (row) rows.push(row);
      } catch { /* damaged, legacy, or unsafe records never become local UI state */ }
    }
    // An ordinary new run may appear while a different worker is publishing.
    // Discard this projection and rebuild once. No stale row, mutation, sleep,
    // unbounded retry or new parent authority crosses this read-only boundary.
    try {
      reviewOwners.assertUnchanged(); assertDirectory(directory);
      return rows;
    } catch (error) {
      if (error instanceof HistoryMembershipChanged && attempt === 0) {
        try {
          assertDirectory(directory);
          reviewOwners.refresh();
          entries = fs.readdirSync(directory.path, { withFileTypes: true });
          assertDirectory(directory);
          continue;
        } catch { /* a replaced or unreadable namespace must not be adopted */ }
      }
      throw Object.assign(new Error('RESULT_EXPORT_STATE_UNSAFE'), { code: 'RESULT_EXPORT_STATE_UNSAFE' });
    }
  }
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
      recordResultExportFailure('result_export_prepare',
        Object.assign(new Error('RESULT_EXPORT_TERMINAL_INVALID'), { code: 'RESULT_EXPORT_TERMINAL_INVALID' }));
      return { exported: 0, pending: released, available: false };
    }
    return { exported: visible.exported, pending: visible.pending, available: visible.available };
  } catch (error) {
    recordResultExportFailure('result_export_prepare', error);
    return { exported: 0, pending: released, available: false };
  }
}

async function terminalVisibleExportAsync(completed, exporter) {
  if (completed?.complete !== true) return { exported: 0, pending: 0, available: false };
  // Retain the existing terminal DTO validator and diagnostics, not an ACK.
  let visible;
  try { visible = await exporter(); }
  catch (error) { return terminalVisibleExport(completed, () => { throw error; }); }
  return terminalVisibleExport(completed, () => visible);
}

module.exports = {
  RESULT_LAYOUT, CONFIDENTIAL_RESULT_LAYOUT, initialResultPublication, privateResultLedger,
  SCHEMA, MARKDOWN_SCHEMA, CONTENT_MARKDOWN_SCHEMA, CONTENT_ANONYMIZED_SCHEMA, LEGACY_MARKDOWN_SCHEMA, LEGACY_SCHEMA, VISIBLE_MAPPING_FILE, recordPath, validRecord, exportCompletedState, exportCompletedStateAsync, replayPendingResultExports, visibleExportStatus,
  visibleExportDirectory, terminalVisibleExport, terminalVisibleExportAsync, readStandaloneExportHistory, readStandaloneExportHistoryEntry, abandonPendingResultExport,
  completedMarkdownExportMatches,
  _test: { activeDestination, ensurePlainDirectory, bindPlainDirectory, assertDirectoryBinding,
    initialProgress, initialDirectory, ensureResultParent, inspectInitialLeaf, recordInitialLeaf, exportOne,
    writePrivateResultMapping, visibleMappingBytes,
    acquireExportClaim, releaseExportClaim, acquireExportClaimAsync, releaseExportClaimAsync, claimPath, markdownOutputNames }
};
