'use strict';

// A display preference only. Neither retention nor result resolvers consume
// this namespace. Pins accelerate a hidden terminal row only while its actual
// held journal/summary and document-export inventory still match. Changed or
// unreadable evidence makes the row visible again, never silently inactive.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataRoot } = require('../runtime');
const { bindDirectory, assertDirectory, readBoundFile } = require('../core/bound-file-io');
const { withOwnershipControl } = require('../core/ownership-control');
const { ensurePrivateDirectory } = require('./common');
const { writeFully, syncParentDirectory, renameWithTransientRetry } = require('./batch-journal-io');
const { processAlive } = require('./process-liveness');

const SCHEMA = 'datasecure-standalone-history-visibility/1';
const ID = /^[a-f0-9]{64}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const fail = () => Object.assign(new Error('Die lokale Verlaufsansicht konnte nicht gespeichert werden.'),
  { code: 'STANDALONE_HISTORY_UNAVAILABLE' });
const exportId = id => `re_${crypto.createHash('sha256').update(id).digest('hex').slice(0, 32)}`;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function optionalDirectory(root, parts) {
  let current = root.path;
  for (const part of parts) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) { if (error?.code === 'ENOENT') { assertDirectory(root); return null; } throw error; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail();
  }
  const directory = bindDirectory(current); assertDirectory(root); return directory;
}
function optionalDigest(root, parts, maximum, inspect) {
  const file = path.join(root.path, ...parts);
  const directory = optionalDirectory(root, parts.slice(0, -1));
  if (!directory) return null;
  try {
    const bytes = readBoundFile(file, { directory, maximum, minimum: 1 });
    if (inspect) inspect(bytes);
    assertDirectory(directory); assertDirectory(root);
    return digest(bytes);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    // Absence is not permission to follow a replaced parent on another read.
    assertDirectory(directory); assertDirectory(root); return null;
  }
}
function snapshot(batchId) {
  if (!ID.test(batchId || '')) throw fail();
  const root = bindDirectory(dataRoot());
  const journal = optionalDigest(root, ['batches', `${batchId}.json`], 2 * 1024 * 1024, bytes => {
    const state = JSON.parse(bytes);
    if (state?.token !== batchId || state.product_channel !== 'standalone' ||
        !Array.isArray(state.items) || state.items.length < 1 || state.items.length > 200 ||
        state.items.some(item => !item || !['released', 'stopped'].includes(item.status)) ||
        Number.isSafeInteger(state.local_executor_pid) && state.local_executor_pid > 0 && processAlive(state.local_executor_pid)) throw fail();
  });
  const summary = optionalDigest(root, ['standalone-run-history', `${batchId}.json`], 32768, bytes => {
    const value = JSON.parse(bytes);
    if (value?.batch_id !== batchId || value.complete !== true) throw fail();
  });
  const exported = optionalDigest(root, ['result-export-state', `${exportId(batchId)}.json`], 1024 * 1024);
  const manifest = optionalDigest(root, ['document-reviews', batchId, 'manifest.json'], 1024 * 1024);
  const exports = [];
  let exportBytes = 0;
  const run = optionalDirectory(root, ['document-reviews', batchId]);
  if (run) {
    const names = fs.readdirSync(run.path).filter(name => /^export-[a-f0-9]{32}(?:-[a-z0-9-]+)?\.json$/u.test(name)).sort();
    if (names.length > 1024) throw fail();
    for (const name of names) {
      const bytes = readBoundFile(path.join(run.path, name), { directory: run, maximum: 1024 * 1024, minimum: 1 });
      exportBytes += bytes.length;
      if (exportBytes > 16 * 1024 * 1024) throw fail();
      exports.push([name, digest(bytes)]);
    }
    // Membership is rechecked: a new intent cannot slip behind an old pin.
    const after = fs.readdirSync(run.path).filter(name => /^export-[a-f0-9]{32}(?:-[a-z0-9-]+)?\.json$/u.test(name)).sort();
    if (JSON.stringify(names) !== JSON.stringify(after)) throw fail();
    assertDirectory(run);
  }
  assertDirectory(root);
  if (!summary && !journal) throw fail();
  return { journal, summary, exported, manifest, exports: digest(JSON.stringify(exports)) };
}
function validPin(pin) {
  return pin && typeof pin === 'object' && !Array.isArray(pin) &&
    Object.keys(pin).sort().join(',') === 'exported,exports,journal,manifest,summary' &&
    ['journal', 'summary', 'exported', 'manifest'].every(key => pin[key] === null || HASH.test(pin[key])) && HASH.test(pin.exports);
}
function readPreferences({ batchIds = null } = {}) {
  const result = new Map();
  try {
    const directory = bindDirectory(path.join(dataRoot(), 'standalone-history-visibility'));
    if (batchIds !== null && (!Array.isArray(batchIds) || batchIds.length > 5 || batchIds.some(id => !ID.test(id)))) return result;
    const names = batchIds === null ? fs.readdirSync(directory.path).filter(name => /^[a-f0-9]{64}\.json$/u.test(name))
      : [...new Set(batchIds)].map(id => `${id}.json`);
    if (names.length > 10000) return result;
    for (const name of names) {
      try {
        const row = JSON.parse(readBoundFile(path.join(directory.path, name), { directory, maximum: 4096, minimum: 1 }));
        if (row?.schema === SCHEMA && row.batch_id === name.slice(0, -5) && typeof row.hidden === 'boolean' &&
            Object.keys(row).sort().join(',') === 'batch_id,hidden,pin,schema' &&
            (row.hidden ? validPin(row.pin) : row.pin === null)) result.set(row.batch_id, row);
      } catch { /* damaged display preferences never hide work */ }
    }
    assertDirectory(directory);
  } catch { return new Map(); }
  return result;
}
function matches(row) {
  if (!row?.hidden || !validPin(row.pin)) return false;
  try {
    const now = snapshot(row.batch_id), previous = row.pin;
    // Normal journal retention must not undo a lasting display preference.
    // The independently retained, exact terminal summary must still match.
    if (now.journal === null && previous.journal !== null && previous.summary !== null && now.summary === previous.summary)
      now.journal = previous.journal;
    return JSON.stringify(now) === JSON.stringify(previous);
  } catch { return false; }
}
function hasExportIntents(batchId) {
  if (!ID.test(batchId || '')) throw fail();
  const root = bindDirectory(dataRoot()), run = optionalDirectory(root, ['document-reviews', batchId]);
  if (!run) return false;
  const present = fs.readdirSync(run.path).some(name => /^export-[a-f0-9]{32}\.json$/u.test(name));
  assertDirectory(run); assertDirectory(root); return present;
}
function writePreference(batchId, hidden, checkTerminal) {
  if (!ID.test(batchId || '') || typeof hidden !== 'boolean' || typeof checkTerminal !== 'function') throw fail();
  const rootPath = dataRoot();
  return withOwnershipControl(rootPath, () => {
    // Validate and pin under the same native ownership guard as document and
    // worker mutations. There is no await or out-of-process lockkeeper here.
    checkTerminal();
    const pin = hidden ? snapshot(batchId) : null;
    const root = bindDirectory(rootPath);
    const directoryPath = ensurePrivateDirectory(root.path, 'standalone-history-visibility');
    const directory = bindDirectory(directoryPath);
    const target = path.join(directory.path, `${batchId}.json`);
    const temporary = `${target}.${process.pid}.${crypto.randomBytes(12).toString('hex')}.tmp`;
    const payload = Buffer.from(JSON.stringify({ schema: SCHEMA, batch_id: batchId, hidden, pin }));
    const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
    try { writeFully(fd, payload, fs); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    assertDirectory(root); assertDirectory(directory);
    renameWithTransientRetry(temporary, target);
    syncParentDirectory(target, fs, process.platform);
    assertDirectory(root); assertDirectory(directory);
    return { ok: true, batch_id: batchId, hidden, local_ui_only: true, external_disclosure: false };
  });
}
module.exports = { readPreferences, matches, hasExportIntents, writePreference };
