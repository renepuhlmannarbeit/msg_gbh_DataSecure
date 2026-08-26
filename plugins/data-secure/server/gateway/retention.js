'use strict';

const fs = require('fs');
const path = require('path');
const { SafeError } = require('../runtime');
const { roots } = require('./common');

const DEFAULT_RETENTION_DAYS = 7;
const RETENTION_ENV = 'EU_PRIVACY_RETENTION_DAYS';
const SCOPES = new Set(['processed', 'output', 'review']);

let lastCleanup = {
  ran_at: null,
  trigger: null,
  retention_days: DEFAULT_RETENTION_DAYS,
  forced: false,
  removed: { processed: 0, output: 0, review: 0 },
  removed_review_previews: 0,
  errors: 0,
  errors_by_scope: { processed: 0, output: 0, review: 0 },
  error_codes: {},
  output_protection_complete: true,
  output_cleanup_skipped: false,
  processed_cleanup_skipped: true,
  processed_protection_complete: false,
  protected_processed_entries: null
};

function retentionDays(env = process.env) {
  const raw = String(env[RETENTION_ENV] ?? '').trim();
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_RETENTION_DAYS;
}

function nowMs(value) {
  const resolved = typeof value === 'function' ? value() : value;
  const numeric = resolved === undefined ? Date.now() : Number(resolved);
  return Number.isFinite(numeric) ? numeric : Date.now();
}

function directEntries(root, fsApi = fs) {
  try {
    return fsApi
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => ({ name: entry.name, full: path.join(root, entry.name) }));
  } catch {
    return [];
  }
}

// Historical builds moved user sources into Processed. There is no durable
// provenance marker that can distinguish such originals from disposable
// artifacts, so every entry is protected. Inspection is intentionally strict:
// an unreadable, replaced or linked root is unknown rather than empty.
function inspectProcessedProtection(processedRoot, fsApi = fs) {
  try {
    const before = fsApi.lstatSync(processedRoot);
    if (!before.isDirectory() || before.isSymbolicLink()) throw new Error('unsafe processed root');
    const entries = fsApi.readdirSync(processedRoot, { withFileTypes: true });
    for (const entry of entries) fsApi.lstatSync(path.join(processedRoot, entry.name));
    const after = fsApi.lstatSync(processedRoot);
    if (!after.isDirectory() || after.isSymbolicLink() ||
        before.dev !== after.dev || before.ino !== after.ino ||
        before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs) {
      throw new Error('processed root changed');
    }
    return { complete: true, entries: entries.length };
  } catch {
    return { complete: false, entries: null };
  }
}

function protectedProcessedError() {
  const error = new SafeError(
    'Historische Quelldateien im geschützten Processed-Bereich müssen manuell geprüft werden.'
  );
  error.code = 'LEGACY_PROCESSED_SOURCE_PROTECTED';
  return error;
}

function assertInside(target, root) {
  const base = path.resolve(root);
  const resolved = path.resolve(target);
  if (resolved === base || !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error('Retention-Ziel liegt außerhalb des erlaubten Bereichs.');
  }
}

// Inspect the whole tree before removing the first byte. Junctions and symbolic
// links are refused rather than traversed, and every child must stay below the
// explicitly selected retention root.
function removalPlan(target, root, fsApi = fs) {
  assertInside(target, root);
  const files = [];
  const dirs = [];

  function inspect(current) {
    assertInside(current, root);
    const stat = fsApi.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('Retention-Ziel ist ein Link oder Junction.');
    if (stat.isFile()) {
      files.push(current);
      return;
    }
    if (!stat.isDirectory()) throw new Error('Retention-Ziel hat einen nicht unterstützten Typ.');
    for (const entry of fsApi.readdirSync(current, { withFileTypes: true })) {
      inspect(path.join(current, entry.name));
    }
    dirs.push(current);
  }

  inspect(target);
  return { files, dirs };
}

function safeRemoveEntry(target, root, fsApi = fs) {
  const plan = removalPlan(target, root, fsApi);
  for (const file of plan.files) fsApi.unlinkSync(file);
  for (const dir of plan.dirs) fsApi.rmdirSync(dir);
}

function entryExpired(target, cutoff, fsApi = fs) {
  try {
    const stat = fsApi.lstatSync(target);
    if (stat.isSymbolicLink()) return false;
    return stat.mtimeMs <= cutoff;
  } catch {
    return false;
  }
}

function previewFiles(reviewDir, fsApi = fs) {
  const files = [];
  try {
    for (const entry of fsApi.readdirSync(reviewDir, { withFileTypes: true })) {
      if (!entry.name.endsWith('.review.json')) files.push(path.join(reviewDir, entry.name));
    }
  } catch {
    /* caller records the directory-level failure if removal is attempted */
  }
  return files;
}

// Maps each claimed preview name to every evidence record that names it. More
// than one record may be corruptly or historically associated with the same
// preview; overwriting one in a Map would leave stale evidence behind.
function reviewMetaIndex(reviewDir, fsApi = fs) {
  const index = new Map();
  const failures = [];
  let entries = [];
  try {
    entries = fsApi.readdirSync(reviewDir, { withFileTypes: true });
  } catch {
    return { index, failures };
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.review.json')) continue;
    const metaPath = path.join(reviewDir, entry.name);
    try {
      const meta = JSON.parse(fsApi.readFileSync(metaPath, 'utf8'));
      if (meta.preview_file) {
        const name = String(meta.preview_file);
        const paths = index.get(name) || [];
        paths.push(metaPath);
        index.set(name, paths);
      }
    } catch (err) {
      failures.push(err);
    }
  }
  return { index, failures };
}

function markPreviewExpired(metaPath, at, fsApi = fs) {
  const meta = JSON.parse(fsApi.readFileSync(metaPath, 'utf8'));
  meta.preview_file = null;
  meta.preview_sha256 = null;
  meta.preview_expired = true;
  meta.preview_expired_at = new Date(at).toISOString();
  fsApi.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}

// Heals records whose claimed preview no longer exists on disk. Without this the
// invariant would depend on a single flawless pass: once the bytes are gone, the
// preview no longer appears in previewFiles(), so a marking step missed earlier
// could never run again and the record would claim a preview forever.
function reconcileMissingPreviews(reviewDir, root, at, fsApi = fs) {
  assertInside(reviewDir, root);
  const stat = fsApi.lstatSync(reviewDir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('Review-Ziel ist kein freigegebenes Verzeichnis.');
  }

  let healed = 0;
  const evidence = reviewMetaIndex(reviewDir, fsApi);
  const failures = [...evidence.failures];
  for (const [name, metaPaths] of evidence.index) {
    // Invalid claims are never resolved or inspected outside the review entry.
    // They are closed fail-safe while any outside file remains untouched.
    const validName = path.basename(name) === name;
    const preview = path.join(reviewDir, name);
    let exists = false;
    if (validName) {
      try {
        assertInside(preview, reviewDir);
        const previewStat = fsApi.lstatSync(preview);
        if (previewStat.isSymbolicLink() || !previewStat.isFile()) {
          const err = new Error('Review-Preview hat einen nicht unterstützten Typ.');
          err.code = 'UNSAFE_PREVIEW_TYPE';
          failures.push(err);
          continue;
        }
        exists = true;
      } catch (err) {
        if (err?.code !== 'ENOENT') {
          failures.push(err);
          continue;
        }
      }
    }
    if (exists) continue;
    for (const metaPath of metaPaths) {
      try {
        markPreviewExpired(metaPath, at, fsApi);
        healed++;
      } catch (err) {
        failures.push(err);
      }
    }
  }
  return { healed, failures };
}

// Each preview is completed on its own: bytes gone, record updated immediately.
// Marking after the whole loop meant one non-file entry left deleted bytes
// behind a record that still claimed preview_file and preview_sha256, so
// listReviewItems() reported preview_available and approval failed with a
// misleading "Paketdatei fehlt".
function removeReviewPreviews(reviewDir, root, at, fsApi = fs) {
  assertInside(reviewDir, root);
  const stat = fsApi.lstatSync(reviewDir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('Review-Ziel ist kein freigegebenes Verzeichnis.');
  }

  const evidence = reviewMetaIndex(reviewDir, fsApi);
  const failures = [...evidence.failures];
  let removed = 0;

  for (const file of previewFiles(reviewDir, fsApi)) {
    const name = path.basename(file);
    try {
      assertInside(file, root);
      const fileStat = fsApi.lstatSync(file);
      if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
        throw new Error('Review-Preview ist kein freigegebener Dateipfad.');
      }
      fsApi.unlinkSync(file);
      removed++;
      for (const metaPath of evidence.index.get(name) || []) {
        try {
          markPreviewExpired(metaPath, at, fsApi);
        } catch (err) {
          failures.push(err);
        }
      }
    } catch (err) {
      failures.push(err);
    }
  }

  // Also repairs records left inconsistent by an earlier interrupted run.
  const reconciliation = reconcileMissingPreviews(reviewDir, root, at, fsApi);
  failures.push(...reconciliation.failures);
  return { removed, failures };
}

function selectedScopes(scope) {
  if (Array.isArray(scope)) {
    const selected = [...new Set(scope)];
    if (!selected.length || selected.some((item) => !SCOPES.has(item))) {
      throw new SafeError('Unbekannter Aufräumbereich.');
    }
    return selected;
  }
  if (scope === undefined || scope === 'all') return [...SCOPES];
  if (!SCOPES.has(scope)) throw new SafeError('Unbekannter Aufräumbereich.');
  return [scope];
}

function cleanupLocalData(options = {}) {
  const r = options.roots || roots();
  const at = nowMs(options.now);
  const days = options.retentionDays ?? retentionDays();
  const cutoff = at - days * 24 * 60 * 60 * 1000;
  const scopes = selectedScopes(options.scope);
  const force = options.force === true;
  const fsApi = options.fs || fs;
  const removeEntry = options.removeEntry || ((target, root) => safeRemoveEntry(target, root, fsApi));
  const processedProtection = options.processedProtection || inspectProcessedProtection(r.processed, fsApi);
  // A package still needed by an open (delivery/mapping pending) batch item
  // must survive an automatic sweep even past its own mtime cutoff, or the
  // batch is left permanently referencing a package that no longer exists.
  // An explicit, confirmed purge (force) still removes it unconditionally.
  const protectedIds = !force && options.protectedIds instanceof Set ? options.protectedIds : new Set();
  const outputProtectionComplete = force || options.outputProtectionComplete !== false;
  const result = {
    ran_at: new Date(at).toISOString(),
    // Which trigger produced this record: a manual purge ignores expiry
    // entirely, so reporting it as an ordinary retention run would mislead.
    trigger: options.trigger || (force ? 'purge' : 'retention'),
    retention_days: days,
    forced: force,
    removed: { processed: 0, output: 0, review: 0 },
    // `removed` remains an entry count across every scope. Preview-file bytes
    // are reported separately so existing status consumers keep their units.
    removed_review_previews: 0,
    errors: 0,
    errors_by_scope: { processed: 0, output: 0, review: 0 },
    // Error codes only. A path or filename here would put document names into
    // a status response that is explicitly free of raw data.
    error_codes: {},
    output_protection_complete: outputProtectionComplete,
    // Released exports are user results, not temporary privacy data. Automatic
    // retention therefore never deletes Output; only an explicit confirmed
    // purge may do so.
    output_cleanup_skipped: !force && scopes.includes('output'),
    processed_cleanup_skipped: true,
    processed_protection_complete: processedProtection.complete,
    protected_processed_entries: processedProtection.entries
  };

  function recordFailure(scope, err) {
    result.errors++;
    result.errors_by_scope[scope]++;
    const candidate = String(err?.code || '').toUpperCase();
    const code = /^[A-Z][A-Z0-9_]{0,31}$/.test(candidate) ? candidate : 'UNKNOWN';
    result.error_codes[code] = (result.error_codes[code] || 0) + 1;
  }

  if (!processedProtection.complete) {
    const error = new Error('Processed protection inspection failed.');
    error.code = 'PROCESSED_INSPECTION_FAILED';
    recordFailure('processed', error);
  }

  for (const scope of scopes) {
    // Processed may contain originals moved by historical builds and is never
    // an automatic or explicit deletion target. Output deletion is explicit;
    // review previews follow their independent retention rules.
    if (scope === 'processed') continue;
    if (scope === 'output' && !force) continue;
    const root = r[scope];
    for (const entry of directEntries(root, fsApi)) {
      if (scope === 'review') {
        // Reconcile inconsistent evidence on every trigger. Deleting a preview
        // refreshes the directory mtime, so waiting for expiry again could
        // otherwise leave a stale claim for a full retention window.
        try {
          const reconciliation = reconcileMissingPreviews(entry.full, root, at, fsApi);
          for (const err of reconciliation.failures) recordFailure(scope, err);
        } catch (err) {
          recordFailure(scope, err);
          continue;
        }
      }
      if (scope === 'output' && protectedIds.has(entry.name)) continue;
      if (!force && !entryExpired(entry.full, cutoff, fsApi)) continue;
      try {
        if (scope === 'review') {
          // Counted even when a later preview in the same directory fails:
          // bytes that are gone must show up as removed.
          const outcome = removeReviewPreviews(entry.full, root, at, fsApi);
          if (outcome.removed > 0) result.removed.review++;
          result.removed_review_previews += outcome.removed;
          for (const err of outcome.failures) recordFailure(scope, err);
        } else {
          removeEntry(entry.full, root);
          result.removed[scope]++;
        }
      } catch (err) {
        recordFailure(scope, err);
      }
    }
  }

  lastCleanup = result;
  return result;
}

function dueCounts(options = {}) {
  const r = options.roots || roots();
  const at = nowMs(options.now);
  const days = options.retentionDays ?? retentionDays();
  const cutoff = at - days * 24 * 60 * 60 * 1000;
  const fsApi = options.fs || fs;
  const protectedIds = options.protectedIds instanceof Set ? options.protectedIds : new Set();
  const outputProtectionComplete = options.outputProtectionComplete !== false;
  const due = { processed: 0, output: 0, review: 0 };

  for (const scope of SCOPES) {
    if (scope === 'output' || scope === 'processed') continue;
    const root = r[scope];
    for (const entry of directEntries(root, fsApi)) {
      if (scope === 'output' && protectedIds.has(entry.name)) continue;
      if (!entryExpired(entry.full, cutoff, fsApi)) continue;
      if (scope !== 'review' || previewFiles(entry.full, fsApi).length > 0) due[scope]++;
    }
  }
  return { ...due, total: due.processed + due.output + due.review };
}

function retentionStatus(options = {}) {
  const days = options.retentionDays ?? retentionDays();
  const r = options.roots || roots();
  const protection = inspectProcessedProtection(r.processed, options.fs || fs);
  return {
    retention_days: days,
    due_entries: dueCounts({ ...options, retentionDays: days }),
    output_protection_complete: options.outputProtectionComplete !== false,
    processed_cleanup_skipped: true,
    processed_protection_complete: protection.complete,
    protected_processed_entries: protection.entries,
    last_cleanup: lastCleanup
  };
}

function purgeLocalData(scope = 'all', confirmed = false, options = {}) {
  if (confirmed !== true) {
    throw new SafeError('Lokale Datenschutzdaten werden nur nach ausdrücklicher Bestätigung gelöscht.');
  }
  const selected = String(scope || 'all').toLowerCase();
  const scopes = selectedScopes(selected);
  const r = options.roots || roots();
  const protection = inspectProcessedProtection(r.processed, options.fs || fs);
  if (scopes.includes('processed') && (!protection.complete || protection.entries > 0)) {
    throw protectedProcessedError();
  }
  const result = cleanupLocalData({
    ...options,
    roots: r,
    scope: selected,
    force: true,
    trigger: 'purge',
    processedProtection: protection
  });
  return {
    ok: true,
    scope: selected,
    removed: result.removed,
    removed_review_previews: result.removed_review_previews,
    errors: result.errors,
    audit_retained: true
  };
}

module.exports = {
  DEFAULT_RETENTION_DAYS,
  RETENTION_ENV,
  retentionDays,
  inspectProcessedProtection,
  safeRemoveEntry,
  removeReviewPreviews,
  reconcileMissingPreviews,
  cleanupLocalData,
  dueCounts,
  retentionStatus,
  purgeLocalData
};
