'use strict';

// Standalone-only, human-readable re-identification aid. Private snapshots
// stay outside the result tree; the readable document is also copied into a
// clearly marked confidential subfolder of its result run. It is never
// projected into MCP or the content-free main renderer. No background
// retention job visits this store.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertPrivateDirectory, ensurePrivateDirectory } = require('../gateway/common');
const { linkWithTransientRetry, syncParentDirectory } = require('../gateway/batch-journal-io');
const { RESOURCE_LIMITS } = require('../resource-limits');

const SCHEMA = 'datasecure-standalone-identity/1';
const TOKEN_RE = /^[a-f0-9]{64}$/u;
const ITEM_RE = /^[a-f0-9]{32}$/u;
const LABEL_RE = /^\[(?:PERSON|UNTERNEHMEN|PROJEKT)_\d{3,5}\]$/u;
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
// Each valid private snapshot is bounded separately. The human document is a
// streamed aggregation, not another single-item snapshot (up to 200 items).
const MAX_DOCUMENT_BYTES = RESOURCE_LIMITS.MAX_BATCH_FILES * (MAX_SNAPSHOT_BYTES + 2048);
const CONFIDENTIAL_FOLDER = 'VERTRAULICH-NICHT-HOCHLADEN';
const DOCUMENT = 'DataSecure-Identitaeten-VERTRAULICH.txt';
const PUBLICATION = 'publication.json';

function invalid() { return Object.assign(new Error('STANDALONE_IDENTITY_MAPPING_INVALID'), { code: 'STANDALONE_IDENTITY_MAPPING_INVALID' }); }

function privateRoot(options = {}) {
  const base = options.dataRoot || process.env.EU_PRIVACY_DATA_ROOT;
  if (typeof base !== 'string' || !path.isAbsolute(base)) throw invalid();
  return path.join(path.resolve(base), 'identity-ledgers');
}

function directoryFor(token, options = {}) {
  if (!TOKEN_RE.test(String(token || ''))) throw invalid();
  return path.join(privateRoot(options), token);
}

function assertDirectory(directory, create = false) {
  if (create) return ensurePrivateDirectory(path.dirname(directory), path.basename(directory));
  assertPrivateDirectory(directory, path.dirname(directory));
  const link = fs.lstatSync(directory, { bigint: true });
  const opened = fs.statSync(directory, { bigint: true });
  if (!link.isDirectory() || link.isSymbolicLink() || !opened.isDirectory() ||
      link.dev !== opened.dev || link.ino !== opened.ino) throw invalid();
}

function resolveDirectory(options = {}) {
  const root = privateRoot(options);
  assertDirectory(root);
  return root;
}

function assertRegular(file, maxBytes = MAX_SNAPSHOT_BYTES) {
  const link = fs.lstatSync(file, { bigint: true });
  const opened = fs.statSync(file, { bigint: true });
  if (!link.isFile() || link.isSymbolicLink() || !opened.isFile() ||
      link.dev !== opened.dev || link.ino !== opened.ino || opened.size > BigInt(maxBytes) ||
      link.nlink !== 1n) throw invalid();
}

function normalizeEntry(entry) {
  if (!entry || Object.keys(entry).sort().join(',') !== 'original,pseudonym' ||
      !LABEL_RE.test(String(entry.pseudonym || '')) || typeof entry.original !== 'string') throw invalid();
  if (/[\u0000-\u001f\u007f]/u.test(entry.original)) throw invalid();
  const original = entry.original.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (!original || original.length > 160) throw invalid();
  return { pseudonym: entry.pseudonym, original };
}

function snapshotFor(token, itemId, packageId, entries, unmappedLabels = []) {
  if (!TOKEN_RE.test(String(token || '')) || !ITEM_RE.test(String(itemId || '')) ||
      packageId !== `ds_${itemId}` || !Array.isArray(entries) || entries.length > 10000 ||
      !Array.isArray(unmappedLabels) || unmappedLabels.length > 10000 ||
      unmappedLabels.some((label) => !LABEL_RE.test(String(label || '')))) throw invalid();
  const unique = new Set();
  const normalized = entries.map((entry) => {
    const value = normalizeEntry(entry);
    const key = `${value.pseudonym}\u0000${value.original}`;
    if (unique.has(key)) throw invalid();
    unique.add(key);
    return value;
  }).sort((a, b) => a.pseudonym.localeCompare(b.pseudonym) || a.original.localeCompare(b.original));
  return { schema: SCHEMA, batch_token: token, item_id: itemId, package_id: packageId, entries: normalized,
    unmapped_labels: [...new Set(unmappedLabels)].sort() };
}

function atomicWrite(file, data) {
  const bytes = Buffer.from(data, 'utf8');
  if (bytes.length > MAX_SNAPSHOT_BYTES) throw invalid();
  const temp = `${file}.${crypto.randomBytes(12).toString('hex')}.tmp`;
  try {
    const fd = fs.openSync(temp, 'wx', 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  } catch (error) {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch { /* preserve primary error */ }
    throw error;
  } finally { bytes.fill(0); }
}

function capture(token, itemId, packageId, entries, options = {}) {
  const record = snapshotFor(token, itemId, packageId, entries, options.unmappedLabels || []);
  const directory = directoryFor(token, options);
  assertDirectory(path.dirname(directory), true);
  assertDirectory(directory, true);
  const file = path.join(directory, `${itemId}.json`);
  const data = JSON.stringify(record);
  if (fs.existsSync(file)) {
    assertRegular(file);
    if (fs.readFileSync(file, 'utf8') === data) return { captured: true, existing: true };
    // A failed prepublication attempt may be retried with a different set of
    // detected aliases. The current verified attempt replaces only its exact
    // private item snapshot; a released item is never processed again.
  }
  atomicWrite(file, data);
  return { captured: true, existing: false };
}

function readSnapshot(token, itemId, options = {}) {
  const directory = directoryFor(token, options);
  assertDirectory(path.dirname(directory));
  assertDirectory(directory);
  const file = path.join(directory, `${itemId}.json`);
  assertRegular(file);
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  const expected = snapshotFor(token, itemId, `ds_${itemId}`, parsed.entries, parsed.unmapped_labels);
  if (JSON.stringify(parsed) !== JSON.stringify(expected)) throw invalid();
  return expected;
}

function identityStatus(state, options = {}) {
  if (state?.product_channel !== 'standalone' || !TOKEN_RE.test(String(state.token || '')) ||
      state.processing_mode === 'markdown-only' || !Array.isArray(state.items)) return { available: false, complete: false };
  const released = state.items.filter((item) => item.status === 'released');
  if (!released.length) return { available: false, complete: false };
  let captured = 0;
  let unmapped = 0;
  for (const item of released) {
    try { const snapshot = readSnapshot(state.token, item.id, options); captured++; unmapped += snapshot.unmapped_labels.length; }
    catch { /* a missing or invalid private record is never advertised as complete */ }
  }
  return { available: captured > 0, complete: captured === released.length && unmapped === 0,
    released_count: released.length, captured_count: captured, unmapped_count: unmapped };
}

function readableLine(value) {
  return String(value || '').normalize('NFC').replace(/[\r\n\u0000-\u001f\u007f]+/gu, ' ').trim();
}

function fileDigest(file) {
  assertRegular(file, MAX_DOCUMENT_BYTES);
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(64 * 1024);
  const hash = crypto.createHash('sha256');
  try {
    let length;
    while ((length = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, length));
    return hash.digest('hex');
  } finally { buffer.fill(0); fs.closeSync(fd); }
}

function atomicDocument(file, chunks) {
  const temporary = `${file}.${crypto.randomBytes(12).toString('hex')}.tmp`;
  let total = 0;
  const hash = crypto.createHash('sha256');
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
      for (const chunk of chunks) {
        const bytes = Buffer.from(chunk, 'utf8');
        try {
          total += bytes.length;
          if (total > MAX_DOCUMENT_BYTES) throw invalid();
          hash.update(bytes);
          fs.writeFileSync(fd, bytes);
        } finally { bytes.fill(0); }
      }
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    if (fs.existsSync(file) && fileDigest(file) === hash.digest('hex')) return;
    fs.renameSync(temporary, file);
    syncParentDirectory(file, fs, process.platform);
  } finally { try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}

function materialize(state, options = {}) {
  const status = identityStatus(state, options);
  if (!status.available) throw invalid();
  const directory = directoryFor(state.token, options);
  const header = [
    'DataSecure – vertrauliche Identitätszuordnung (nur lokal für Menschen)',
    'NICHT in KI-Systeme hochladen. Diese Datei enthält Originalwerte und ist selbst vertraulich.',
    `Vollständigkeit der erfassten Ergebnisdateien: ${status.captured_count}/${status.released_count}.`,
    `Nicht eindeutig zuordenbare Pseudonymstellen: ${status.unmapped_count}.`,
    'Generische Masken und nicht erkannte Identifikatoren sind nicht 1:1 zuordenbar.',
    'Originalwerte sind technisch für den Vergleich normalisiert; Groß-/Kleinschreibung kann abweichen.',
    ''
  ];
  function* chunks() {
  yield header.join('\r\n') + '\r\n';
  for (const item of state.items.filter((candidate) => candidate.status === 'released')) {
    let snapshot;
    try { snapshot = readSnapshot(state.token, item.id, options); }
    catch { yield `OHNE ZUORDNUNG: ${readableLine(item.source_label || item.name)}\r\n`; continue; }
    yield `Datei: ${readableLine(item.source_label || item.name)}\r\n`;
    if (!snapshot.entries.length) yield '  Keine eindeutig zuordenbaren Pseudonyme erfasst.\r\n';
    for (const entry of snapshot.entries) yield `  ${entry.pseudonym} = ${readableLine(entry.original)}\r\n`;
    for (const label of snapshot.unmapped_labels) yield `  OHNE EINDEUTIGE ZUORDNUNG: ${label}\r\n`;
    yield '\r\n';
  }
  }
  const file = path.join(directory, DOCUMENT);
  atomicDocument(file, chunks());
  return { local_path: file, complete: status.complete };
}

function resolveDocument(token, options = {}) {
  const directory = directoryFor(token, options);
  assertDirectory(path.dirname(directory));
  assertDirectory(directory);
  const file = path.join(directory, DOCUMENT);
  assertRegular(file, MAX_DOCUMENT_BYTES);
  return file;
}

function documentAvailable(token, options = {}) {
  try { resolveDocument(token, options); return true; }
  catch { return false; }
}

function assertPlainDirectory(directory) {
  const named = fs.lstatSync(directory, { bigint: true });
  const opened = fs.statSync(directory, { bigint: true });
  const real = fs.realpathSync.native(directory);
  const samePath = process.platform === 'win32'
    ? real.toLowerCase() === path.resolve(directory).toLowerCase()
    : real === path.resolve(directory);
  if (!named.isDirectory() || named.isSymbolicLink() || !opened.isDirectory() ||
      named.dev !== opened.dev || named.ino !== opened.ino || !samePath) throw invalid();
}

// Only the rendered human aid is copied. Per-file private snapshots stay in
// app data. The marked subfolder is still confidential if the whole run is
// uploaded; the UI and document explicitly warn against that.
function publishDocumentToRun(token, runPath, options = {}) {
  const privateFile = resolveDocument(token, options);
  if (typeof runPath !== 'string' || !path.isAbsolute(runPath) ||
      !/^Lauf-\d{8}-\d{6}-[a-f0-9]{8}$/u.test(path.basename(runPath)) ||
      path.basename(path.dirname(runPath)) !== 'DataSecure-Output') throw invalid();
  const run = path.resolve(runPath);
  assertPlainDirectory(path.dirname(path.dirname(run)));
  assertPlainDirectory(path.dirname(run));
  assertPlainDirectory(run);
  const directory = directoryFor(token, options);
  const markerFile = path.join(directory, PUBLICATION);
  const confidential = path.join(run, CONFIDENTIAL_FOLDER);
  const target = path.join(confidential, DOCUMENT);
  const digest = fileDigest(privateFile);
  const marker = { schema: 'datasecure-standalone-identity-publication/1', run, sha256: digest };
  if (fs.existsSync(markerFile)) {
    assertRegular(markerFile);
    if (JSON.stringify(JSON.parse(fs.readFileSync(markerFile, 'utf8'))) !== JSON.stringify(marker)) throw invalid();
    // Never recreate a user-removed or modified export. The private original
    // remains available through the local History action.
    try {
      assertPlainDirectory(confidential);
      assertRegular(target, MAX_DOCUMENT_BYTES);
      if (fileDigest(target) === digest) {
        return { local_path: target, published: true, existing: true };
      }
    } catch { /* private fallback below */ }
    return { local_path: privateFile, published: false, existing: true };
  }
  if (!fs.existsSync(confidential)) fs.mkdirSync(confidential, { mode: 0o700 });
  assertPlainDirectory(run);
  assertPlainDirectory(confidential);
  if (fs.existsSync(target)) {
    assertRegular(target, MAX_DOCUMENT_BYTES);
    if (fileDigest(target) !== digest) throw invalid();
  } else {
    const temporary = path.join(confidential, `.${DOCUMENT}.${crypto.randomBytes(12).toString('hex')}.tmp`);
    try {
      fs.copyFileSync(privateFile, temporary, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(temporary, 0o600);
      const fd = fs.openSync(temporary, 'r+');
      try { fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      if (fileDigest(temporary) !== digest) throw invalid();
      assertPlainDirectory(run);
      assertPlainDirectory(confidential);
      linkWithTransientRetry(temporary, target);
      fs.unlinkSync(temporary);
      syncParentDirectory(target, fs, process.platform);
      assertRegular(target, MAX_DOCUMENT_BYTES);
      if (fileDigest(target) !== digest) throw invalid();
    } finally { try { fs.unlinkSync(temporary); } catch { /* preserve the target/error */ } }
  }
  atomicWrite(markerFile, JSON.stringify(marker));
  return { local_path: target, published: true, existing: false };
}

function publicationAvailable(token, run, options = {}) {
  try {
    const file = resolveDocument(token, options);
    const markerFile = path.join(directoryFor(token, options), PUBLICATION);
    assertRegular(markerFile);
    const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
    const digest = fileDigest(file);
    if (JSON.stringify(marker) !== JSON.stringify({ schema: 'datasecure-standalone-identity-publication/1', run, sha256: digest })) return false;
    const directory = path.join(run, CONFIDENTIAL_FOLDER);
    assertPlainDirectory(run); assertPlainDirectory(directory);
    return fileDigest(path.join(directory, DOCUMENT)) === digest;
  } catch { return false; }
}

// Only uncommitted snapshots belonging to definitively stopped items are
// discarded. A completed human mapping is never touched by this cleanup.
function pruneStopped(state, options = {}) {
  if (state?.product_channel !== 'standalone' || !TOKEN_RE.test(String(state.token || '')) ||
      !Array.isArray(state.items)) return 0;
  const directory = directoryFor(state.token, options);
  if (!fs.existsSync(directory)) return 0;
  assertDirectory(path.dirname(directory));
  assertDirectory(directory);
  let removed = 0;
  for (const item of state.items) {
    if (item?.status !== 'stopped' || !ITEM_RE.test(String(item.id || ''))) continue;
    const file = path.join(directory, `${item.id}.json`);
    if (!fs.existsSync(file)) continue;
    assertRegular(file);
    fs.unlinkSync(file);
    removed++;
  }
  return removed;
}

module.exports = { capture, readSnapshot, identityStatus, materialize, resolveDocument, pruneStopped,
  documentAvailable, publishDocumentToRun, publicationAvailable, privateRoot, resolveDirectory };
