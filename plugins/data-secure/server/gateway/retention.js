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
  removed: { processed: 0, output: 0, review: 0 },
  errors: 0,
  errors_by_scope: { processed: 0, output: 0, review: 0 },
  error_codes: {}
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

// Maps the preview file name each evidence record claims to that record's path,
// so a single preview can be marked without rescanning the directory.
function reviewMetaIndex(reviewDir, fsApi = fs) {
  const index = new Map();
  let entries = [];
  try {
    entries = fsApi.readdirSync(reviewDir, { withFileTypes: true });
  } catch {
    return index;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.review.json')) continue;
    const metaPath = path.join(reviewDir, entry.name);
    try {
      const meta = JSON.parse(fsApi.readFileSync(metaPath, 'utf8'));
      if (meta.preview_file) index.set(String(meta.preview_file), metaPath);
    } catch {
      /* unreadable evidence is left untouched */
    }
  }
  return index;
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
function reconcileMissingPreviews(reviewDir, at, fsApi = fs) {
  let healed = 0;
  for (const [name, metaPath] of reviewMetaIndex(reviewDir, fsApi)) {
    const preview = path.join(reviewDir, name);
    let exists = true;
    try {
      fsApi.lstatSync(preview);
    } catch {
      exists = false;
    }
    if (exists) continue;
    try {
      markPreviewExpired(metaPath, at, fsApi);
      healed++;
    } catch {
      /* an unwritable record is reported by the caller as a failure */
    }
  }
  return healed;
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

  const index = reviewMetaIndex(reviewDir, fsApi);
  const failures = [];
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
      const metaPath = index.get(name);
      if (metaPath) markPreviewExpired(metaPath, at, fsApi);
    } catch (err) {
      failures.push(err);
    }
  }

  // Also repairs records left inconsistent by an earlier interrupted run.
  reconcileMissingPreviews(reviewDir, at, fsApi);
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
  const result = {
    ran_at: new Date(at).toISOString(),
    // Which trigger produced this record: a manual purge ignores expiry
    // entirely, so reporting it as an ordinary retention run would mislead.
    trigger: options.trigger || (force ? 'purge' : 'retention'),
    retention_days: days,
    forced: force,
    removed: { processed: 0, output: 0, review: 0 },
    errors: 0,
    errors_by_scope: { processed: 0, output: 0, review: 0 },
    // Error codes only. A path or filename here would put document names into
    // a status response that is explicitly free of raw data.
    error_codes: {}
  };

  function recordFailure(scope, err) {
    result.errors++;
    result.errors_by_scope[scope]++;
    const code = String(err?.code || err?.message || 'unknown').slice(0, 60);
    result.error_codes[code] = (result.error_codes[code] || 0) + 1;
  }

  for (const scope of scopes) {
    const root = r[scope];
    for (const entry of directEntries(root, fsApi)) {
      if (!force && !entryExpired(entry.full, cutoff, fsApi)) continue;
      try {
        if (scope === 'review') {
          // Counted even when a later preview in the same directory fails:
          // bytes that are gone must show up as removed.
          const outcome = removeReviewPreviews(entry.full, root, at, fsApi);
          if (outcome.removed > 0) result.removed.review += outcome.removed;
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
  const due = { processed: 0, output: 0, review: 0 };

  for (const scope of SCOPES) {
    const root = r[scope];
    for (const entry of directEntries(root, fsApi)) {
      if (!entryExpired(entry.full, cutoff, fsApi)) continue;
      if (scope !== 'review' || previewFiles(entry.full, fsApi).length > 0) due[scope]++;
    }
  }
  return { ...due, total: due.processed + due.output + due.review };
}

function retentionStatus(options = {}) {
  const days = options.retentionDays ?? retentionDays();
  return {
    retention_days: days,
    due_entries: dueCounts({ ...options, retentionDays: days }),
    last_cleanup: lastCleanup
  };
}

function purgeLocalData(scope = 'all', confirmed = false, options = {}) {
  if (confirmed !== true) {
    throw new SafeError('Lokale Datenschutzdaten werden nur nach ausdrücklicher Bestätigung gelöscht.');
  }
  const selected = String(scope || 'all').toLowerCase();
  const result = cleanupLocalData({ ...options, scope: selected, force: true, trigger: 'purge' });
  return {
    ok: true,
    scope: selected,
    removed: result.removed,
    errors: result.errors,
    audit_retained: true
  };
}

module.exports = {
  DEFAULT_RETENTION_DAYS,
  RETENTION_ENV,
  retentionDays,
  safeRemoveEntry,
  removeReviewPreviews,
  reconcileMissingPreviews,
  cleanupLocalData,
  dueCounts,
  retentionStatus,
  purgeLocalData
};
