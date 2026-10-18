'use strict';

// Discovery only, never permission to resume, publish, expire or open a file.
// Eviction removes an identifier from the UI window, not the underlying run.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataRoot } = require('../runtime');
const { ensurePrivateDirectory } = require('./common');
const { bindDirectory, assertDirectory, readBoundFileRecord, sameFile } = require('../core/bound-file-io');
const { writeFully, syncParentDirectory, renameWithTransientRetry } = require('./batch-journal-io');
const { createBatchActiveLock } = require('./batch-active-lock');
const { withSynchronousDocumentControl } = require('./standalone-document-control');

const LIMIT = 5;
const SCHEMA = 'datasecure-standalone-history-window/1';
const ID = /^[a-f0-9]{64}$/u;
const LOCK_TOKEN = crypto.createHash('sha256').update(SCHEMA).digest('hex');
const fail = () => Object.assign(new Error('Die lokale Verlaufsansicht ist momentan nicht verfügbar.'),
  { code: 'STANDALONE_HISTORY_UNAVAILABLE' });
const order = (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.batch_id.localeCompare(a.batch_id);
function validEntry(row) {
  const legacy = row && Object.hasOwn(row, 'legacy_export_id');
  return row && Object.keys(row).sort().join(',') === (legacy ? 'batch_id,created_at,legacy_export_id' : 'batch_id,created_at') && ID.test(row.batch_id) &&
    (!legacy || /^re_[a-f0-9]{32}$/u.test(row.legacy_export_id) &&
      crypto.createHash('sha256').update(`standalone-history:${row.legacy_export_id}`).digest('hex') === row.batch_id) &&
    typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at)) &&
    new Date(row.created_at).toISOString() === row.created_at;
}
function select(rows) {
  const unique = new Map();
  const realExports = new Set(rows.filter(row => !row.legacy_export_id).map(row =>
    `re_${crypto.createHash('sha256').update(row.batch_id).digest('hex').slice(0, 32)}`));
  for (const row of rows) {
    if (!validEntry(row)) throw fail();
    if (row.legacy_export_id && realExports.has(row.legacy_export_id)) continue;
    const previous = unique.get(row.batch_id);
    // A batch's original creation date is immutable, not its last worker update.
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) throw fail();
    unique.set(row.batch_id, row);
  }
  return [...unique.values()].sort(order).slice(0, LIMIT);
}
function read(directory) {
  const target = path.join(directory.path, 'recent.json');
  try {
    const record = readBoundFileRecord(target, { directory, maximum: 4096, minimum: 1 });
    const value = JSON.parse(record.bytes);
    if (value?.schema !== SCHEMA || Object.keys(value).sort().join(',') !== 'entries,schema' ||
        !Array.isArray(value.entries) || value.entries.length > LIMIT ||
        JSON.stringify(select(value.entries)) !== JSON.stringify(value.entries)) throw fail();
    return { entries: value.entries, record };
  } catch (error) {
    if (error?.code === 'ENOENT') { assertDirectory(directory); return null; }
    // A damaged index never triggers an automatic global scan on each poll.
    throw fail();
  }
}
function transaction(action) {
  let directory;
  const gate = createBatchActiveLock({ lockPath() {
    if (!directory) {
      // First creation is inside native admission, not during module loading.
      const root = ensurePrivateDirectory(path.dirname(dataRoot()), path.basename(dataRoot()));
      directory = bindDirectory(ensurePrivateDirectory(root, 'standalone-history-window'));
    }
    assertDirectory(directory); return path.join(directory.path, 'window.lock');
  } });
  return withSynchronousDocumentControl(gate, LOCK_TOKEN, () => action(directory));
}
function publish(directory, previous, entries) {
  const target = path.join(directory.path, 'recent.json');
  const bytes = Buffer.from(JSON.stringify({ schema: SCHEMA, entries }));
  if (previous?.record.bytes.equals(bytes)) { assertDirectory(directory); return entries; }
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(12).toString('hex')}.tmp`;
  const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL |
    (fs.constants.O_NOFOLLOW || 0), 0o600);
  try { writeFully(fd, bytes, fs); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  assertDirectory(directory);
  if (previous) {
    const current = read(directory);
    if (!current || !sameFile(fs.lstatSync(target, { bigint: true }), previous.record.identity) ||
        !current.record.bytes.equals(previous.record.bytes)) throw fail();
  } else {
    try { fs.lstatSync(target); throw fail(); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  renameWithTransientRetry(temporary, target);
  syncParentDirectory(target, fs, process.platform);
  assertDirectory(directory);
  const actual = read(directory);
  if (!actual?.record.bytes.equals(bytes)) throw fail();
  return entries;
}
function readRecentHistory(migrate) {
  // A normal read neither enumerates nor opens older run namespaces.
  try {
    const directory = bindDirectory(path.join(dataRoot(), 'standalone-history-window'));
    const previous = read(directory);
    if (previous) return previous.entries;
  } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  return transaction(directory => {
    const previous = read(directory);
    if (previous) return previous.entries;
    // Once, for old installations: compact metadata only. No result, review,
    // source body, export replay or journal validation is performed here.
    return publish(directory, null, select(migrate()));
  });
}
function registerHistory(summary, migrate) {
  const row = { batch_id: summary.batch_id, created_at: summary.created_at };
  if (!validEntry(row)) throw fail();
  try {
    const previous = read(bindDirectory(path.join(dataRoot(), 'standalone-history-window')));
    if (previous) {
      const existing = previous.entries.find(entry => entry.batch_id === row.batch_id);
      const alias = crypto.createHash('sha256').update(`standalone-history:re_${crypto.createHash('sha256').update(row.batch_id).digest('hex').slice(0, 32)}`).digest('hex');
      const hasAlias = previous.entries.some(entry => entry.batch_id === alias);
      // Membership only moves forwards. Neither an unchanged worker update
      // nor an older-than-the-window recovery needs a new lock/fsync.
      if (!hasAlias && (existing && existing.created_at === row.created_at || !existing && previous.entries.length === LIMIT && order(row, previous.entries.at(-1)) > 0))
        return previous.entries;
    }
  } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  return transaction(directory => {
    const previous = read(directory);
    // Correct a discovery-only timestamp with the actual original journal
    // date. An update never substitutes its current wall-clock completion time.
    const entries = select([...(previous ? previous.entries : migrate()).filter(entry => entry.batch_id !== row.batch_id), row]);
    return publish(directory, previous, entries);
  });
}
module.exports = { LIMIT, selectHistoryEntries: select, readRecentHistory, registerHistory };
