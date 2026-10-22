'use strict';

// A /4 publication is private and context-bound. Its mapping intent must not
// be replayed by the legacy /2 package scanner, which cannot verify that
// binding. The batch journal is the replay index; this intent closes the
// crash window between verified publication and the local mapping CSV.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataRoot, SafeError } = require('../runtime');
const { ensurePrivateDirectory } = require('./common');
const { readBoundFileRecord, bindDirectory, assertDirectory, sameFile } = require('../core/bound-file-io');
const { identity, safeUnlinkBoundPrivateFile } = require('./bound-private-file');
const { writeFully, syncParentDirectory, linkWithTransientRetry } = require('./batch-journal-io');
const { assertWritableCapacity, normalizePostPreflightWriteError } = require('./storage-capacity');
const { appendMapping } = require('./mapping');
const { confirmPublication } = require('./standalone-anonymized-batch');
const { recordBatchExecutionFailure } = require('./batch-execution-diagnostic');

function observeFailure(phase, error) {
  try { recordBatchExecutionFailure(phase, error); } catch { /* observation never changes the primary failure */ }
}

const SCHEMA = 'datasecure-anonymized-mapping-intent/1';
const fail = () => Object.assign(new SafeError('Die private Ergebniszuordnung konnte nicht sicher bestätigt werden.'),
  { code: 'LOCAL_MAPPING_EXPORT_PENDING' });

function intentDirectory() { return ensurePrivateDirectory(dataRoot(), 'standalone-anonymized-mapping-intents'); }
function intentPath(state, item) {
  if (!/^[a-f0-9]{64}$/u.test(String(state?.token || '')) || !/^[a-f0-9]{32}$/u.test(String(item?.id || ''))) throw fail();
  const id = crypto.createHash('sha256').update(`${state.token}:${item.id}`).digest('hex');
  return path.join(intentDirectory(), `am_${id}.json`);
}
function expectedIntent(state, item, publication) {
  if (publication?.state !== 'verified' || !publication.publication_binding ||
      publication.publication_binding.package_id !== `ds_${item.id}` ||
      item.package_id !== `ds_${item.id}` || !['mapping_pending', 'delivery_pending', 'released'].includes(item.status)) throw fail();
  return { schema: SCHEMA, batch_id: state.token, item_id: item.id,
    source_label: item.source_label || item.name, package_id: item.package_id,
    publication_binding: publication.publication_binding, document_result: publication.document_result, state: 'pending' };
}
function readExact(target, payload, directory) {
  const record = readBoundFileRecord(target, { directory, minimum: 1, maximum: 32768 });
  if (!record.bytes.equals(payload)) throw fail();
  assertDirectory(directory);
  if (!sameFile(fs.lstatSync(target, { bigint: true }), record.identity)) throw fail();
  return record;
}
function ensurePrivateMappingIntent(state, item, publication) {
  let target, directory, payload, phase = 'mapping_publication';
  // These operations previously preceded the normalizing try. Observation must
  // retain their exact raw throw, including default-argument acquisition faults.
  try {
    if (publication === undefined) publication = confirmPublication(state, item);
    phase = 'mapping_intent';
    target = intentPath(state, item); directory = bindDirectory(path.dirname(target));
    payload = Buffer.from(JSON.stringify(expectedIntent(state, item, publication)), 'utf8');
  } catch (error) { observeFailure(phase, error); throw error; }
  try {
    try { return { target, record: readExact(target, payload, directory) }; }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    const temporary = path.join(path.dirname(target), `.am_${crypto.randomBytes(16).toString('hex')}.tmp`);
    let descriptor;
    try {
      assertWritableCapacity({ directory: path.dirname(target), bytes: payload.length + 1024 });
      descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL |
        (fs.constants.O_NOFOLLOW || 0), 0o600);
      writeFully(descriptor, payload, fs); fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
      assertDirectory(directory);
      // Atomic create-if-absent: a check followed by rename could replace a
      // conflicting intent between those operations, including on Windows.
      linkWithTransientRetry(temporary, target, fs);
      syncParentDirectory(target, fs);
      fs.unlinkSync(temporary);
      syncParentDirectory(target, fs);
      return { target, record: readExact(target, payload, directory) };
    } catch (error) {
      if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch { /* original failure wins */ }
      try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* only our exact temporary file */ }
      throw error;
    }
  } catch (error) {
    observeFailure('mapping_intent', error);
    const normalized = normalizePostPreflightWriteError(error);
    if (['LOCAL_CAPACITY_UNAVAILABLE', 'LOCAL_CAPACITY_INSUFFICIENT', 'LOCAL_CAPACITY_RACE'].includes(normalized?.code)) throw normalized;
    throw fail();
  }
}
function removePrivateMappingIntent(intent) {
  try {
    const { target, record } = intent;
    const directory = bindDirectory(path.dirname(target));
    if (path.dirname(record.path) !== directory.path || path.basename(target) !== path.basename(record.path)) throw fail();
    const checked = readBoundFileRecord(target, { directory, minimum: 1, maximum: 32768 });
    if (!checked.bytes.equals(record.bytes) || JSON.stringify(checked.identity) !== JSON.stringify(record.identity)) throw fail();
    const parent = directory.chain[0].identity;
    safeUnlinkBoundPrivateFile(target, { binding: { target, parent: directory.path, file: identity(record.stat),
      parentIdentity: { dev: parent.dev, ino: parent.ino } }, validate() {
      assertDirectory(directory);
      if (!sameFile(fs.lstatSync(target, { bigint: true }), record.identity)) throw fail();
    } });
    syncParentDirectory(target, fs);
  } catch (error) { observeFailure('mapping_intent_finish', error); throw fail(); }
}
function commitPrivateMapping(state, item) {
  let phase = 'mapping_publication';
  try {
    const published = confirmPublication(state, item);
    phase = 'mapping_intent';
    const intent = ensurePrivateMappingIntent(state, item, published);
    // Revalidate private bytes immediately before exposing the local mapping.
    phase = 'mapping_recheck';
    const current = confirmPublication(state, item);
    if (JSON.stringify(current.publication_binding) !== JSON.stringify(published.publication_binding) ||
        JSON.stringify(current.document_result) !== JSON.stringify(published.document_result)) throw fail();
    phase = 'mapping_csv';
    appendMapping(item.source_label || item.name, item.package_id, undefined, { documentResult: published.document_result });
    phase = 'mapping_intent_finish';
    removePrivateMappingIntent(intent);
    return true;
  } catch (error) { observeFailure(phase, error); throw error; }
}
module.exports = Object.freeze({ commitPrivateMapping, ensurePrivateMappingIntent, intentPath });
