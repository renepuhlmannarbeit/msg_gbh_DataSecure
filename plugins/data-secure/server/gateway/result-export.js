'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataRoot } = require('../runtime');
const { safeResolvePackage, readVerifiedFile } = require('./package-store');
const { inspectRoot, readConfiguredResultRoot, resultOutputDirectory } = require('./result-folder-config');
const { writeFully, syncParentDirectory, renameWithTransientRetry, linkWithTransientRetry } = require('./batch-journal-io');
const { processAlive } = require('./process-liveness');

const SCHEMA = 'datasecure-result-export/1';
const RECORD_RE = /^re_[a-f0-9]{32}\.json$/u;
// An interrupted atomic record write leaves exactly this temporary name behind.
// It carries no export state and must neither count as a damaged record nor be
// removed while a concurrent worker may still be writing it.
const TEMPORARY_RECORD_RE = /^re_[a-f0-9]{32}\.json\.\d+\.[a-f0-9]{8}\.tmp$/u;
const CLAIM_RE = /^re_[a-f0-9]{32}\.json\.claim$/u;
const PACKAGE_RE = /^ds_[a-f0-9]{32}$/u;
const CLAIM_SCHEMA = 'datasecure-result-export-claim/1';
const CLAIM_ID_RE = /^[a-f0-9]{32}$/u;

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
function removeClaimIfUnchanged(target, expected) {
  const current = readClaim(target);
  if (!current || current.value.claim_id !== expected.value.claim_id || current.dev !== expected.dev ||
      current.ino !== expected.ino || current.size !== expected.size) return false;
  try { fs.unlinkSync(target); return true; } catch { return false; }
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
  return claim ? removeClaimIfUnchanged(claimPath(recordTarget), claim) : false;
}
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
function validRecord(value) {
  return exactKeys(value, ['schema', 'run_directory', 'items', 'complete', 'destination_id']) && value.schema === SCHEMA &&
    /^Lauf-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$/u.test(value.run_directory) &&
    typeof value.complete === 'boolean' && /^(?:|[a-f0-9]{64})$/u.test(value.destination_id) &&
    Array.isArray(value.items) && value.items.length <= 100 &&
    value.items.every((item, index) => (exactKeys(item, ['package_id', 'file', 'sha256']) ||
        (exactKeys(item, ['package_id', 'file', 'sha256', 'exported']) && item.exported === true)) &&
      PACKAGE_RE.test(item.package_id) && /^[a-f0-9]{64}$/u.test(item.sha256) &&
      item.file === `Dokument-${String(index + 1).padStart(3, '0')}-anonymisiert.md`);
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
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 32768) throw new Error('RESULT_EXPORT_STATE_UNSAFE');
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
function packageItem(packageId, index) {
  const { m } = safeResolvePackage(packageId);
  if (!m || !/^[a-f0-9]{64}$/u.test(String(m.document_sha256 || ''))) throw new Error('RESULT_EXPORT_SOURCE_INVALID');
  return {
    package_id: packageId,
    file: `Dokument-${String(index + 1).padStart(3, '0')}-anonymisiert.md`,
    sha256: m.document_sha256
  };
}
function activeDestination() {
  const root = readConfiguredResultRoot();
  if (!root) return null;
  const checked = inspectRoot(root);
  const rootBinding = bindPlainDirectory(checked.root);
  const outputBinding = bindPlainDirectory(resultOutputDirectory({ root: checked.root }), rootBinding);
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
  const target = recordPath(state.token);
  const items = state.items.filter((item) => item.status === 'released').map((item, index) => packageItem(item.package_id, index));
  if (fs.existsSync(target)) {
    const existing = readRecord(target);
    if (JSON.stringify(existing.items.map(planItem)) !== JSON.stringify(items)) throw new Error('RESULT_EXPORT_STATE_CONFLICT');
    return { target, value: existing };
  }
  const value = { schema: SCHEMA, run_directory: runDirectoryName(state.created_at), items, complete: items.length === 0, destination_id: '' };
  writeRecord(target, value);
  return { target, value };
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
  const { p, m } = safeResolvePackage(item.package_id);
  const bytes = readVerifiedFile(p, m.document, 32 * 1024 * 1024);
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
    return { exported, pending, available };
  } catch {
    return { exported: 0, pending: expected, available: false };
  }
}

// Resolve exactly one completed visible run for native local UI actions. The
// path stays inside the trusted process and is never projected to Claude,
// renderer IPC or diagnostics.
function visibleExportDirectory(token) {
  try {
    const target = recordPath(token);
    if (!fs.existsSync(target)) return '';
    const record = readRecord(target);
    if (record.complete !== true || record.items.length === 0 ||
        record.items.some((item) => item.exported !== true)) return '';
    const destination = activeDestination();
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
  try {
    try { plan = ensureRecord(state); }
    catch { return { exported: 0, pending: releasedCount(state), available: false }; }
    if (plan.value.items.length === 0) return { exported: 0, pending: 0, available: true };
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
      const destination = activeDestination();
      if (!destination) return pendingResult();
      const finished = exportOpenItems(plan.target, readRecord(plan.target), destination);
      return finished.complete === true ? { exported: total, pending: 0, available: true } : pendingResult();
    } catch {
      return pendingResult();
    }
  } finally { releaseExportClaim(target, claim); }
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
    let claim;
    try {
      const target = path.join(outboxDirectory(), entry.name);
      claim = acquireExportClaim(target);
      if (!claim) {
        try { pending += Math.max(0, readRecord(target).items.filter((item) => item.exported !== true).length); }
        catch { failures++; }
        continue;
      }
      const record = readRecord(target);
      // Only a failed (incomplete) export is replayed; see exportCompletedState.
      if (record.items.length === 0 || record.complete === true) continue;
      const destination = activeDestination();
      if (!destination) { pending += record.items.length - exportedCount(record); continue; }
      const before = exportedCount(record);
      try {
        const finished = exportOpenItems(target, record, destination);
        exported += exportedCount(finished) - before;
      } catch (error) {
        let after = before;
        try { after = exportedCount(readRecord(target)); } catch { /* keep the last known progress */ }
        exported += after - before;
        throw error;
      }
    } catch { failures++; }
    finally {
      if (claim) releaseExportClaim(path.join(outboxDirectory(), entry.name), claim);
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
  SCHEMA, recordPath, validRecord, exportCompletedState, replayPendingResultExports, visibleExportStatus,
  visibleExportDirectory, terminalVisibleExport,
  _test: { activeDestination, ensurePlainDirectory, bindPlainDirectory, assertDirectoryBinding,
    acquireExportClaim, releaseExportClaim, claimPath }
};
