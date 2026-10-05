'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readBoundFile, readBoundFileRecord, assertDirectory, sameFile } = require('../core/bound-file-io');
const { identity: privateIdentity, safeUnlinkBoundPrivateFile } = require('./bound-private-file');
const { SafeError } = require('../runtime');
const { roots } = require('./common');
const { assertWritableCapacity, normalizePostPreflightWriteError } = require('./storage-capacity');
const { writeFully, syncParentDirectory, renameWithTransientRetry } = require('./batch-journal-io');
const {
  GRADES,
  OMISSION_CODES,
  validateDocumentResult,
  positiveDocumentResult
} = require('./document-result-grade');

const LEGACY_HEADER = 'Originaldatei;Anonymisiertes Ergebnis;Status;Hinweis\r\n';
const HEADER = 'Originaldatei;Anonymisiertes Ergebnis;Ergebnisgrad;Auslassungen;Grundcode;Hinweis\r\n';
const FIXED_NOTE = 'Lokale Zuordnung; nicht an Claude übertragen.';
const RELEASED = 'freigegeben';
const STOPPED = 'sicher gestoppt';
const OUTBOX_SCHEMA = 'datasecure-mapping-outbox/2';
const LEGACY_OUTBOX_SCHEMA = 'datasecure-mapping-outbox/1';
const OUTBOX_FILE_RE = /^mo_[a-f0-9]{32}\.json$/;
const OUTBOX_TEMP_RE = /^\.mo_[a-f0-9]{32}\.tmp$/;
const GRADE_LABELS = Object.freeze({
  [GRADES.COMPLETE]: 'Vollständig verarbeitet',
  [GRADES.USABLE_WITH_OMISSIONS]: 'Verwendbar mit ausdrücklich benannten Auslassungen',
  [GRADES.NOT_PROCESSED]: 'Sicher nicht verarbeitet'
});
const LEGACY_GRADE_LABEL = 'Ergebnisgrad für älteres Paket nicht verfügbar';
const OUTBOX_V1_KEYS = ['entry_id', 'original_basename', 'package_id', 'schema', 'state'].sort();
const OUTBOX_V2_KEYS = [...OUTBOX_V1_KEYS, 'document_result'].sort();

function csvField(value) {
  let text = String(value ?? '');
  // Spreadsheet programs must not interpret a filename or a package id as a
  // formula when the user opens the local mapping.
  // Excel and similar tools may ignore leading whitespace (including a BOM)
  // before evaluating a formula. Treat those prefixes as formula-significant too.
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function parseQuotedRows(text) {
  const rows = [];
  let row = [];
  let index = 0;
  while (index < text.length) {
    if (text[index] !== '"') throw new SafeError('Der lokale Zuordnungsexport hat ein ungültiges Format.');
    index++;
    let field = '';
    let closed = false;
    while (index < text.length) {
      if (text[index] !== '"') { field += text[index++]; continue; }
      if (text[index + 1] === '"') { field += '"'; index += 2; continue; }
      index++;
      closed = true;
      break;
    }
    if (!closed) throw new SafeError('Der lokale Zuordnungsexport hat ein ungültiges Format.');
    row.push(field);
    if (text[index] === ';') { index++; continue; }
    if (text.slice(index, index + 2) === '\r\n') {
      rows.push(row);
      row = [];
      index += 2;
      continue;
    }
    if (index === text.length) { rows.push(row); break; }
    throw new SafeError('Der lokale Zuordnungsexport hat ein ungültiges Format.');
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

function resultPresentation(documentResult) {
  if (!documentResult) {
    return { grade: LEGACY_GRADE_LABEL, omissions: '', reason: '' };
  }
  validateDocumentResult(documentResult);
  const omissions = documentResult.omissions.map((entry) => {
    if (entry.code === OMISSION_CODES.IMAGES_REMOVED_BY_REQUEST) {
      return `Bilder auf Wunsch entfernt: ${entry.count}`;
    }
    return `Bilder lokal zurückgehalten: ${entry.count}`;
  }).join(' | ');
  return {
    grade: GRADE_LABELS[documentResult.grade],
    omissions,
    reason: documentResult.grade === GRADES.NOT_PROCESSED ? documentResult.reason_code : ''
  };
}

function normalizeExistingMapping(previous) {
  if (!previous) return { text: HEADER, rows: [] };
  if (previous.startsWith(HEADER)) {
    const rows = parseQuotedRows(previous.slice(HEADER.length));
    if (!rows.every((row) => row.length === 6)) {
      throw new SafeError('Der lokale Zuordnungsexport hat ein ungültiges Format.');
    }
    return { text: previous, rows };
  }
  if (!previous.startsWith(LEGACY_HEADER)) {
    throw new SafeError('Der lokale Zuordnungsexport hat ein ungültiges Format.');
  }
  const legacyRows = parseQuotedRows(previous.slice(LEGACY_HEADER.length));
  if (!legacyRows.every((row) => row.length === 4)) {
    throw new SafeError('Der lokale Zuordnungsexport hat ein ungültiges Format.');
  }
  const rows = legacyRows.map(([original, result, status, note]) => [
    original,
    result,
    LEGACY_GRADE_LABEL,
    '',
    '',
    `Bisheriger Status: ${status}. ${note}`
  ]);
  return {
    text: HEADER + rows.map((row) => row.map(csvField).join(';')).join('\r\n') + (rows.length ? '\r\n' : ''),
    rows
  };
}

function mappingPath(options = {}) { return path.join((options.roots || roots)().exports, 'DataSecure-Mapping.csv'); }

function mappingLockPath(options = {}) { return `${mappingPath(options)}.lock`; }

function mappingOutboxDir(options = {}) { return path.join((options.roots || roots)().exports, '.mapping-outbox'); }

function assertOutboxDirectory(options = {}) {
  const io = options.fs || fs;
  const dir = mappingOutboxDir(options);
  const parent = path.dirname(dir);
  try {
    const parentStat = io.lstatSync(parent);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error('unsafe export parent');
    io.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const dirStat = io.lstatSync(dir);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw new Error('unsafe outbox');
    return dir;
  } catch {
    throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher verwendet werden.');
  }
}

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === expected.join(',');
}

function validSourceLabel(value) {
  const label = String(value || '');
  if (!label || label.length > 1024 || label.includes('\\') || label.startsWith('/') ||
      /[\0-\x1f\x7f]/u.test(label) || /^[A-Za-z]:/u.test(label)) return false;
  const segments = label.split('/');
  return segments.every((segment) => segment && segment !== '.' && segment !== '..');
}

function validOutboxEntry(value, allowFile = false) {
  const candidate = allowFile && value && Object.hasOwn(value, 'file')
    ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'file'))
    : value;
  const expectedKeys = candidate?.schema === OUTBOX_SCHEMA ? OUTBOX_V2_KEYS : OUTBOX_V1_KEYS;
  if (!exactKeys(candidate, expectedKeys)) return false;
  const common = candidate && [OUTBOX_SCHEMA, LEGACY_OUTBOX_SCHEMA].includes(candidate.schema) &&
    typeof candidate.entry_id === 'string' &&
    /^[a-f0-9]{32}$/.test(candidate.entry_id) && typeof candidate.package_id === 'string' &&
    /^ds_[a-f0-9]{32}$/.test(candidate.package_id) && typeof candidate.original_basename === 'string' &&
    validSourceLabel(candidate.original_basename) && candidate.state === 'pending';
  if (!common) return false;
  if (candidate.schema === LEGACY_OUTBOX_SCHEMA) return true;
  try { positiveDocumentResult(candidate.document_result); return true; }
  catch { return false; }
}

function durableAtomicWrite(target, temporary, payload, options = {}) {
  const io = options.fs || fs;
  let descriptor;
  try {
    descriptor = io.openSync(temporary, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL, 0o600);
    writeFully(descriptor, Buffer.from(payload, 'utf8'), io);
    io.fsyncSync(descriptor);
    io.closeSync(descriptor);
    descriptor = undefined;
    renameWithTransientRetry(temporary, target, io);
    syncParentDirectory(target, io, options.platform || process.platform);
  } catch (error) {
    try { if (descriptor !== undefined) io.closeSync(descriptor); } catch { /* preserve primary failure */ }
    try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch { /* only our exact temp */ }
    throw error;
  }
}

function removeReadRecord(record, io) {
  const parent = record.directory.chain[0].identity;
  return safeUnlinkBoundPrivateFile(record.path, { io, binding: {
    target: record.path, parent: record.directory.path, file: privateIdentity(record.stat),
    parentIdentity: { dev: parent.dev, ino: parent.ino }
  }, validate() {
    assertDirectory(record.directory);
    if (!sameFile(io.lstatSync(record.path, { bigint: true }), record.identity)) throw new Error('changed');
  } });
}

function readOutboxEntries(options = {}) {
  const io = options.fs || fs;
  const dir = assertOutboxDirectory(options);
  let entries;
  try { entries = io.readdirSync(dir, { withFileTypes: true }); }
  catch { throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher gelesen werden.'); }
  const result = [];
  for (const entry of entries) {
    // An interrupted atomic creation may leave a fully written temporary
    // intent. Promote it only after validating the complete tiny schema; it
    // is the only durable record in the post-publish/pre-CSV crash window.
    if (OUTBOX_TEMP_RE.test(entry.name) && entry.isFile() && !entry.isSymbolicLink()) {
      try {
        const temporary = path.join(dir, entry.name);
        const checked = readBoundFileRecord(temporary, { io, maximum: 8192 });
        const value = JSON.parse(checked.bytes);
        if (!validOutboxEntry(value) || entry.name !== `.mo_${value.entry_id}.tmp`) throw new Error('invalid temp');
        const promoted = path.join(dir, `mo_${value.entry_id}.json`);
        if (io.existsSync(promoted)) throw new Error('conflicting intent');
        assertDirectory(checked.directory);
        if (!sameFile(io.lstatSync(temporary, { bigint: true }), checked.identity)) throw new Error('changed temp');
        renameWithTransientRetry(temporary, promoted, io);
        const after = readBoundFileRecord(promoted, { io, maximum: 8192, directory: checked.directory });
        if (!sameFile(after.stat, checked.identity) || !after.bytes.equals(checked.bytes)) throw new Error('changed promotion');
        syncParentDirectory(promoted, io, options.platform || process.platform);
        result.push({ ...value, file: promoted });
        continue;
      } catch {
        throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher gelesen werden.');
      }
    }
    if (!OUTBOX_FILE_RE.test(entry.name) || !entry.isFile() || entry.isSymbolicLink()) {
      throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher gelesen werden.');
    }
    const file = path.join(dir, entry.name);
    try {
      const value = JSON.parse(readBoundFile(file, { io, maximum: 8192 }));
      if (!validOutboxEntry(value) || entry.name !== `mo_${value.entry_id}.json`) throw new Error('invalid entry');
      result.push({ ...value, file });
    } catch {
      throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher gelesen werden.');
    }
  }
  return result;
}

function ensureMappingOutbox(originalName, packageId, documentResult, options = {}) {
  const io = options.fs || fs;
  const name = String(originalName || '');
  if (!validSourceLabel(name) || !/^ds_[a-f0-9]{32}$/.test(String(packageId || ''))) {
    throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher aktualisiert werden.');
  }
  if (documentResult !== undefined && documentResult !== null) positiveDocumentResult(documentResult);
  const existing = readOutboxEntries(options).find((entry) => entry.package_id === packageId);
  if (existing) {
    const expectedSchema = documentResult ? OUTBOX_SCHEMA : LEGACY_OUTBOX_SCHEMA;
    if (existing.schema !== expectedSchema || existing.original_basename !== name ||
      JSON.stringify(existing.document_result) !== JSON.stringify(documentResult)) {
      throw new SafeError('Die lokale Zuordnungswarteschlange enthält einen widersprüchlichen Ergebnisgrad.');
    }
    return existing;
  }
  const dir = assertOutboxDirectory(options);
  const entryId = crypto.randomBytes(16).toString('hex');
  const value = documentResult
    ? { schema: OUTBOX_SCHEMA, entry_id: entryId, package_id: packageId, original_basename: name,
        document_result: documentResult, state: 'pending' }
    : { schema: LEGACY_OUTBOX_SCHEMA, entry_id: entryId, package_id: packageId,
        original_basename: name, state: 'pending' };
  const target = path.join(dir, `mo_${entryId}.json`);
  const temporary = path.join(dir, `.mo_${entryId}.tmp`);
  try {
    (options.assertWritableCapacity || assertWritableCapacity)({
      directory: dir,
      bytes: Buffer.byteLength(JSON.stringify(value), 'utf8') + 1024
    });
    durableAtomicWrite(target, temporary, JSON.stringify(value), options);
    return { ...value, file: target };
  } catch (error) {
    try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch { /* only our exact temp */ }
    const normalized = normalizePostPreflightWriteError(error);
    if (['LOCAL_CAPACITY_UNAVAILABLE', 'LOCAL_CAPACITY_INSUFFICIENT', 'LOCAL_CAPACITY_RACE'].includes(normalized?.code)) throw normalized;
    throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher aktualisiert werden.');
  }
}

function removeMappingOutbox(entry, options = {}) {
  const io = options.fs || fs;
  if (!validOutboxEntry(entry, true) || typeof entry.file !== 'string') throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher bereinigt werden.');
  const dir = assertOutboxDirectory(options);
  if (path.dirname(entry.file) !== dir || path.basename(entry.file) !== `mo_${entry.entry_id}.json`) {
    throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher bereinigt werden.');
  }
  try {
    const checked = readBoundFileRecord(entry.file, { io, maximum: 8192 });
    const current = JSON.parse(checked.bytes);
    if (!validOutboxEntry(current) || current.entry_id !== entry.entry_id ||
      current.package_id !== entry.package_id || current.original_basename !== entry.original_basename ||
      current.state !== entry.state || current.schema !== entry.schema ||
      JSON.stringify(current.document_result) !== JSON.stringify(entry.document_result)) throw new Error('changed');
    removeReadRecord(checked, io);
    syncParentDirectory(entry.file, io, options.platform || process.platform);
    return true;
  } catch {
    throw new SafeError('Die lokale Zuordnungswarteschlange konnte nicht sicher bereinigt werden.');
  }
}

// Mapping contains original filenames and is intentionally local-only.  A
// future bounded worker pool must nevertheless never let two writers replace
// this CSV based on the same earlier snapshot.  The lock is deliberately
// strict: an abandoned or malformed lock is a fail-closed maintenance case,
// not an excuse to delete an unknown local file during a normal release path.
function acquireMappingLock(options = {}) {
  const io = options.fs || fs;
  const target = mappingLockPath(options);
  let descriptor;
  try {
    descriptor = io.openSync(target, 'wx', 0o600);
    io.writeFileSync(descriptor, `datasecure-mapping-lock/1 ${process.pid}\n`, 'utf8');
    return { target, descriptor, marker: `datasecure-mapping-lock/1 ${process.pid}\n` };
  } catch {
    if (descriptor !== undefined) {
      try { io.closeSync(descriptor); } catch { /* the fail-closed error wins */ }
    }
    throw new SafeError('Der lokale Zuordnungsexport wird bereits geschützt verarbeitet.');
  }
}

function releaseMappingLock(lock, options = {}) {
  if (!lock || typeof lock.target !== 'string' || typeof lock.marker !== 'string') return false;
  const io = options.fs || fs;
  try {
    if (lock.descriptor !== undefined) io.closeSync(lock.descriptor);
    const checked = readBoundFileRecord(lock.target, { io, maximum: 1024 });
    if (checked.bytes.toString('utf8') !== lock.marker) return false;
    removeReadRecord(checked, io);
    return true;
  } catch { return false; }
}

function appendMapping(originalName, packageId, status = RELEASED, options = {}) {
  const name = String(originalName);
  const result = String(packageId ?? '');
  const state = String(status);
  const validReleased = state === RELEASED && /^[A-Za-z0-9_-]+$/.test(result);
  // A terminally stopped source deliberately has no output package. Recording
  // that fact in the private user-facing ledger prevents an ambiguous missing
  // row without inventing a result identifier.
  const validStopped = state === STOPPED && result === '';
  const documentResult = options.documentResult;
  if (documentResult) {
    validateDocumentResult(documentResult);
    if ((validReleased && documentResult.grade === GRADES.NOT_PROCESSED) ||
      (validStopped && documentResult.grade !== GRADES.NOT_PROCESSED)) {
      throw new SafeError('Der lokale Zuordnungsexport enthält einen widersprüchlichen Ergebnisgrad.');
    }
    if (validReleased) positiveDocumentResult(documentResult);
  }
  const mappingReference = String(options.mappingReference || '');
  if (mappingReference && !/^[a-f0-9]{32}$/i.test(mappingReference)) {
    throw new SafeError('Der lokale Zuordnungsexport konnte nicht sicher aktualisiert werden.');
  }
  if (!validSourceLabel(name) || !(validReleased || validStopped)) {
    throw new SafeError('Der lokale Zuordnungsexport konnte nicht sicher aktualisiert werden.');
  }
  const io = options.fs || fs;
  const target = mappingPath(options);
  let lock;
  let previous = '';
  try {
    const parent = io.lstatSync(path.dirname(target));
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error('unsafe mapping directory');
    lock = acquireMappingLock(options);
    if (io.existsSync(target)) {
      previous = readBoundFile(target, { io, maximum: 64 * 1024 * 1024 }).toString('utf8');
    }
  } catch (error) {
    if (lock) releaseMappingLock(lock, options);
    if (error instanceof SafeError) throw error;
    throw new SafeError('Der lokale Zuordnungsexport konnte nicht sicher gelesen werden.');
  }
  try {
    const normalized = normalizeExistingMapping(previous);
    previous = normalized.text;
    const note = validStopped && mappingReference
      ? `Lokale Zuordnung ${mappingReference}; nicht an Claude übertragen.`
      : FIXED_NOTE;
    const presentation = resultPresentation(documentResult);
    const rowValues = [name, result, presentation.grade, presentation.omissions, presentation.reason, note];
    const row = rowValues.map(csvField).join(';') + '\r\n';
    // A process can disappear after atomically replacing the CSV but before it
    // records that fact in its private batch snapshot. Retrying that exact local
    // commit must be safe: duplicate rows would make the user-facing mapping
    // ambiguous and could cause a recovered package to look like a second run.
    const existingRows = normalizeExistingMapping(previous).rows;
    const exactMatch = existingRows.some((existing) => JSON.stringify(existing) === JSON.stringify(rowValues));
    if (exactMatch) return false;
    const packageAlreadyMapped = validReleased && existingRows.some((existing) => existing[1] === result);
    const stoppedAlreadyMapped = validStopped && mappingReference && existingRows.some((existing) =>
      existing[5] === `Lokale Zuordnung ${mappingReference}; nicht an Claude übertragen.`);
    if (packageAlreadyMapped || stoppedAlreadyMapped) {
      throw new SafeError('Der lokale Zuordnungsexport enthält einen widersprüchlichen Ergebnisgrad.');
    }
    const next = previous + row;
    const temporary = `${target}.tmp_${crypto.randomBytes(6).toString('hex')}`;
    try {
      (options.assertWritableCapacity || assertWritableCapacity)({
        directory: path.dirname(target),
        bytes: Buffer.byteLength(next, 'utf8')
      });
      durableAtomicWrite(target, temporary, next, options);
      return true;
    } catch (error) {
      try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch { /* no broader cleanup */ }
      const normalized = normalizePostPreflightWriteError(error);
      if (['LOCAL_CAPACITY_UNAVAILABLE', 'LOCAL_CAPACITY_INSUFFICIENT', 'LOCAL_CAPACITY_RACE'].includes(normalized?.code)) {
        throw normalized;
      }
      throw new SafeError('Der lokale Zuordnungsexport konnte nicht sicher aktualisiert werden.');
    }
  } finally {
    if (lock) releaseMappingLock(lock, options);
  }
}

module.exports = { appendMapping, mappingPath, mappingLockPath, mappingOutboxDir, readOutboxEntries, ensureMappingOutbox, removeMappingOutbox, acquireMappingLock, releaseMappingLock, csvField, resultPresentation, normalizeExistingMapping, HEADER, LEGACY_HEADER, FIXED_NOTE, RELEASED, STOPPED, OUTBOX_SCHEMA, LEGACY_OUTBOX_SCHEMA };
