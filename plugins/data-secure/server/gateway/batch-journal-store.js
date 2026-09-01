'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { batchPath, safeRemoveWorkDirectory, assertPlainWorkFile } = require('./batch-private-store');
const { writeFully, syncParentDirectory } = require('./batch-journal-io');
const { RESOURCE_LIMITS } = require('../resource-limits');
const {
  GRADES,
  validateDocumentResult,
  positiveDocumentResult
} = require('./document-result-grade');
const { validatePackageIdentity } = require('./package-identity');
const { identity, bindPrivateFile, safeUnlinkBoundPrivateFile } = require('./bound-private-file');

const SCHEMA = 'datasecure-batch/4';
const ENCRYPTED_SCHEMA = 'datasecure-batch/3';
const V2_SCHEMA = 'datasecure-batch/2';
const LEGACY_SCHEMA = 'datasecure-batch/1';
const NOT_FOUND = 'Batch-Sitzung wurde nicht gefunden oder ist ungültig. Bitte den Eingang erneut bestätigen.';
const INVALID = 'Batch-Sitzung ist ungültig. Bitte den Eingang erneut bestätigen.';
const EXPIRED = 'Batch-Sitzung ist abgelaufen. Bitte den Eingang erneut bestätigen.';
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const PSEUDONYM_VERSION_RE = /^[a-z0-9][a-z0-9._/-]{0,63}$/u;
const PSEUDONYM_SEED_RE = /^[A-Za-z0-9_-]{43}$/u;
const MAX_JOURNAL_BYTES = 2 * 1024 * 1024;

function createBatchJournalStore(options = {}) {
  const io = options.io || fs;
  const pathForToken = options.batchPath || batchPath;
  const workDirectoryForToken = options.workPath || ((token) => path.join(path.dirname(pathForToken(token)), `${token}.work`));
  const removeWorkDirectory = options.safeRemoveWorkDirectory || safeRemoveWorkDirectory;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const nowMs = options.nowMs || (() => Date.now());
  const writeAll = options.writeFully || writeFully;
  const syncParent = options.syncParentDirectory || syncParentDirectory;
  const platform = options.platform || process.platform;
  const retryDelay = options.retryDelay || ((milliseconds) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  });
  const ErrorType = options.SafeError || SafeError;
  const maxBatchFiles = options.maxBatchFiles || RESOURCE_LIMITS.MAX_BATCH_FILES;
  const assertZeroDayWorkAvailable = options.assertZeroDayWorkAvailable;
  const journalBindings = new WeakMap();

  function temporaryJournalPath(target) {
    return `${target}.tmp_${randomBytes(6).toString('hex')}`;
  }

  function targetBinding(target) {
    try {
      const stat = io.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink()) return null;
      return { exists: true, dev: stat.dev, ino: stat.ino, size: stat.size };
    } catch (error) {
      return error?.code === 'ENOENT' ? { exists: false } : null;
    }
  }

  function sameTargetBinding(left, right) {
    return Boolean(left && right && left.exists === right.exists && (
      left.exists === false || (left.dev === right.dev && left.ino === right.ino && left.size === right.size)
    ));
  }

  function publishJournal(temporary, target) {
    const parent = path.dirname(target);
    const parentBefore = io.lstatSync(parent, { bigint: true });
    const temporaryBefore = io.lstatSync(temporary, { bigint: true });
    if (!parentBefore.isDirectory() || parentBefore.isSymbolicLink() || !temporaryBefore.isFile() ||
        temporaryBefore.isSymbolicLink() || temporaryBefore.nlink !== 1n) throw new Error('BATCH_JOURNAL_TEMP_UNSAFE');
    const expected = targetBinding(target);
    if (!expected) throw new Error('BATCH_JOURNAL_TARGET_UNSAFE');
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0 && !sameTargetBinding(targetBinding(target), expected)) {
        throw new Error('BATCH_JOURNAL_TARGET_CHANGED');
      }
      try {
        io.renameSync(temporary, target);
        const parentAfter = io.lstatSync(parent, { bigint: true });
        const published = io.lstatSync(target, { bigint: true });
        if (!parentAfter.isDirectory() || parentAfter.isSymbolicLink() ||
            parentAfter.dev !== parentBefore.dev || parentAfter.ino !== parentBefore.ino ||
            !published.isFile() || published.isSymbolicLink() || published.nlink !== 1n ||
            published.dev !== temporaryBefore.dev || published.ino !== temporaryBefore.ino) {
          throw new Error('BATCH_JOURNAL_PUBLICATION_UNCERTAIN');
        }
        return Object.freeze({
          target: path.resolve(target),
          parent: path.resolve(parent),
          file: identity(published),
          parentIdentity: Object.freeze({ dev: String(parentAfter.dev), ino: String(parentAfter.ino) })
        });
      } catch (error) {
        if (!TRANSIENT_RENAME_CODES.has(error?.code) || attempt === 3) throw error;
        retryDelay(10 * (attempt + 1));
      }
    }
  }

  // `durable: false` is selected only by the batch state machine for
  // same-status diagnostic checkpoints. Atomic temp-file publication remains
  // unconditional; only the two power-loss flushes are skipped.
  function writeState(state, writeOptions = {}) {
    rejectEncryptedState(state);
    if (!validPseudonymState(state)) throw new Error('BATCH_PSEUDONYM_STATE_INVALID');
    const durable = writeOptions.durable !== false;
    const target = pathForToken(state.token);
    const temporary = temporaryJournalPath(target);
    const payload = Buffer.from(`${JSON.stringify(state)}\n`, 'utf8');
    if (payload.length < 1 || payload.length > MAX_JOURNAL_BYTES) {
      throw new Error('BATCH_JOURNAL_SIZE_LIMIT');
    }
    let temporaryBinding;
    let temporaryObject;
    try {
      const fd = io.openSync(
        temporary,
        io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL,
        0o600
      );
      try {
        const opened = io.fstatSync(fd, { bigint: true });
        if (!opened.isFile() || opened.isSymbolicLink?.() || opened.nlink !== 1n) {
          throw new Error('BATCH_JOURNAL_TEMP_UNSAFE');
        }
        temporaryObject = { dev: String(opened.dev), ino: String(opened.ino) };
        writeAll(fd, payload, io);
        if (durable) io.fsyncSync(fd);
      } finally {
        io.closeSync(fd);
      }
      temporaryBinding = bindPrivateFile(temporary, { io });
      const binding = publishJournal(temporary, target);
      journalBindings.set(state, binding);
      if (durable) syncParent(target, io, platform);
    } catch (error) {
      // Cleanup is deliberately bounded to the exact random temp path. After
      // rename the new complete journal may already be authoritative even if
      // the parent-directory fsync fails; the original error remains visible.
      try {
        const current = io.lstatSync(temporary, { bigint: true });
        if (!temporaryBinding && temporaryObject && current.isFile() && !current.isSymbolicLink() &&
            current.nlink === 1n && String(current.dev) === temporaryObject.dev && String(current.ino) === temporaryObject.ino) {
          const parent = path.dirname(path.resolve(temporary));
          const parentStat = io.lstatSync(parent, { bigint: true });
          if (parentStat.isDirectory() && !parentStat.isSymbolicLink()) {
            temporaryBinding = Object.freeze({
              target: path.resolve(temporary),
              parent,
              file: identity(current),
              parentIdentity: Object.freeze({ dev: String(parentStat.dev), ino: String(parentStat.ino) })
            });
          }
        }
        if (temporaryBinding) safeUnlinkBoundPrivateFile(temporary, { io, binding: temporaryBinding, randomBytes });
      } catch { /* absent, already renamed or identity uncertain: never delete a replacement */ }
      throw error;
    }
  }

  function readJournalRecord(token) {
    const target = pathForToken(token);
    let descriptor;
    try {
      const parent = path.dirname(target);
      const parentBefore = io.lstatSync(parent, { bigint: true });
      const named = io.lstatSync(target, { bigint: true });
      descriptor = io.openSync(target, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0));
      const stat = io.fstatSync(descriptor, { bigint: true });
      if (typeof parentBefore.isDirectory !== 'function' || !parentBefore.isDirectory() ||
          typeof parentBefore.isSymbolicLink !== 'function' || parentBefore.isSymbolicLink() ||
          typeof stat.isFile !== 'function' || !stat.isFile() || stat.nlink !== 1n ||
          typeof named.isSymbolicLink !== 'function' || named.isSymbolicLink() || named.nlink !== 1n || named.dev !== stat.dev || named.ino !== stat.ino ||
          stat.size < 1n || stat.size > BigInt(MAX_JOURNAL_BYTES)) {
        throw new Error('unsafe');
      }
      const bytes = io.readFileSync(descriptor);
      const after = io.fstatSync(descriptor, { bigint: true });
      const namedAfter = io.lstatSync(target, { bigint: true });
      const parentAfter = io.lstatSync(parent, { bigint: true });
      if (BigInt(bytes.length) !== stat.size || after.dev !== stat.dev || after.ino !== stat.ino ||
          after.size !== stat.size || after.mtimeNs !== stat.mtimeNs || after.ctimeNs !== stat.ctimeNs ||
          namedAfter.dev !== stat.dev || namedAfter.ino !== stat.ino || namedAfter.nlink !== 1n ||
          namedAfter.size !== stat.size || namedAfter.mtimeNs !== stat.mtimeNs || namedAfter.ctimeNs !== stat.ctimeNs ||
          parentAfter.dev !== parentBefore.dev || parentAfter.ino !== parentBefore.ino) throw new Error('unsafe');
      const record = JSON.parse(bytes.toString('utf8'));
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('unsafe');
      journalBindings.set(record, Object.freeze({
        target: path.resolve(target),
        parent: path.resolve(parent),
        file: identity(stat),
        parentIdentity: Object.freeze({ dev: String(parentBefore.dev), ino: String(parentBefore.ino) })
      }));
      return record;
    } finally {
      if (descriptor !== undefined) io.closeSync(descriptor);
    }
  }

  function removeState(state) {
    const binding = journalBindings.get(state);
    if (!binding) throw new Error('BATCH_JOURNAL_BINDING_MISSING');
    const removed = safeUnlinkBoundPrivateFile(pathForToken(state.token), { io, binding, randomBytes });
    if (removed) journalBindings.delete(state);
    return removed;
  }

  function validExpiry(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function validPseudonymState(state) {
    const fields = ['pseudonym_contract_version', 'pseudonym_ruleset_version', 'pseudonym_seed'];
    const present = fields.filter((field) => Object.hasOwn(state || {}, field));
    // Pre-RC batches remain listable/retirable, but processing refuses them in
    // batch-pseudonym-context. Partial or malformed state is never accepted.
    if (present.length === 0) return !Object.hasOwn(state || {}, 'pseudonym_registry_state');
    if (!(present.length === fields.length &&
      PSEUDONYM_VERSION_RE.test(String(state.pseudonym_contract_version || '')) &&
      PSEUDONYM_VERSION_RE.test(String(state.pseudonym_ruleset_version || '')) &&
      typeof state.pseudonym_seed === 'string' && PSEUDONYM_SEED_RE.test(state.pseudonym_seed) &&
      Buffer.from(state.pseudonym_seed, 'base64url').length === 32)) return false;
    if (!Object.hasOwn(state, 'pseudonym_registry_state')) return true;
    const snapshot = state.pseudonym_registry_state;
    if (!snapshot || Object.keys(snapshot).sort().join(',') !== 'bindings,labels' ||
        !Array.isArray(snapshot.bindings) || !Array.isArray(snapshot.labels) ||
        snapshot.bindings.length > 10000 || snapshot.labels.length > 10000) return false;
    const placeholders = new Set();
    for (const pair of snapshot.labels) {
      if (!Array.isArray(pair) || pair.length !== 2 ||
          !/^\[(?:PERSON|ORGANISATION|KUNDE|PROJEKT)_[A-Z2-7]{10,52}\]$/u.test(String(pair[0])) ||
          !/^[A-Za-z0-9_-]{43}$/u.test(String(pair[1])) || placeholders.has(String(pair[0]))) return false;
      placeholders.add(String(pair[0]));
    }
    const aliases = new Set();
    return snapshot.bindings.every((pair) => Array.isArray(pair) && pair.length === 2 &&
      /^[A-Za-z0-9_-]{43}$/u.test(String(pair[0])) && placeholders.has(String(pair[1])) &&
      !aliases.has(String(pair[0])) && Boolean(aliases.add(String(pair[0]))));
  }

  function validPreflightItem(item, schema) {
    const isPending = item?.status === 'preflight_mapping_pending';
    const isStopped = item?.checkpoint === 'source_preflight_stopped';
    const isPreflight = isPending || isStopped || item?.checkpoint === 'source_preflight_rejected';
    if (!isPreflight) return true;
    const validPair = (isPending && item.checkpoint === 'source_preflight_rejected' && item.local_mapping_exported === false) ||
      (item.status === 'stopped' && isStopped && item.local_mapping_exported === true);
    const common = validPair && /^[a-f0-9]{32}$/iu.test(String(item.id || '')) &&
      typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 255 &&
      /^[A-Z][A-Z0-9_]{0,95}$/u.test(String(item.error_code || '')) &&
      !Object.hasOwn(item, 'work_name') && !Object.hasOwn(item, 'sha256') &&
      !Object.hasOwn(item, 'package_id');
    if (!common || schema === LEGACY_SCHEMA) return common;
    try {
      validateDocumentResult(item.document_result);
      return item.document_result.grade === GRADES.NOT_PROCESSED &&
        item.document_result.reason_code === item.error_code;
    } catch { return false; }
  }

  function validSourceLabel(item) {
    if (!Object.hasOwn(item, 'source_label')) return true;
    const value = item.source_label;
    return typeof value === 'string' && value.length > 0 && value.length <= 1024 &&
      !value.startsWith('/') && !value.includes('\\') &&
      value.split('/').every((part) => part && part !== '.' && part !== '..');
  }

  function validV2ItemResult(item, schema) {
    if (!validSourceLabel(item) || Object.hasOwn(item, 'read_capability')) return false;
    // Storage validation must precede all status-specific early returns.
    if (Object.hasOwn(item, 'private_artifact_encrypted') || Object.hasOwn(item, 'legacy_work_name') ||
        /\.dsart$/iu.test(String(item.work_name || ''))) return false;
    if (Object.hasOwn(item, 'work_name') && schema === SCHEMA && item.private_artifact_plain !== true) return false;
    if (schema !== SCHEMA && Object.hasOwn(item, 'private_artifact_plain')) return false;
    if (Object.hasOwn(item, 'package_identity')) {
      if (item.status !== 'released') return false;
      try { validatePackageIdentity(item.package_identity); }
      catch { return false; }
    }
    if (['preflight_mapping_pending', 'stopped'].includes(item.status)) {
      if (Object.hasOwn(item, 'package_id')) return false;
      try {
        validateDocumentResult(item.document_result);
        return item.document_result.grade === GRADES.NOT_PROCESSED &&
          item.document_result.reason_code === item.error_code;
      } catch { return false; }
    }
    if (['mapping_pending', 'delivery_pending', 'released'].includes(item.status)) {
      if (!/^ds_[a-f0-9]{32}$/iu.test(String(item.package_id || ''))) return false;
      try { positiveDocumentResult(item.document_result); return true; }
      catch { return false; }
    }
    if (Object.hasOwn(item, 'document_result')) return false;
    if (Object.hasOwn(item, 'package_id')) {
      return item.status === 'processing' &&
        ['package_published', 'publication_unconfirmed'].includes(item.checkpoint);
    }
    return true;
  }

  function rejectEncryptedState(state) {
    if (state?.schema === ENCRYPTED_SCHEMA || (Array.isArray(state?.items) && state.items.some((item) =>
      item && (Object.hasOwn(item, 'private_artifact_encrypted') || Object.hasOwn(item, 'legacy_work_name') ||
      /\.dsart$/iu.test(String(item.work_name || '')))))) {
      const error = new ErrorType('Ein alter verschlüsselter Stapel bleibt unverändert erhalten. Bitte die Originaldateien neu auswählen.');
      error.code = 'PRIVATE_ARTIFACT_LEGACY_ENCRYPTED_UNSUPPORTED';
      throw error;
    }
  }

  function rejectRenamedEncryptedCopies(state) {
    // Retirement/maintenance must not destroy an old envelope just because its
    // filename and journal marker were changed. Read at most eight bytes per
    // existing snapshot, never the document body or any credential. Ordinary
    // active readState/process checkpoints do not pay for this sweep.
    const items = state.items.filter((item) => item?.work_name);
    if (!items.length) return;
    const work = workDirectoryForToken(state.token);
    let root;
    try { root = io.lstatSync(work); }
    catch (error) { if (error?.code === 'ENOENT') return; throw error; }
    if (!root.isDirectory() || root.isSymbolicLink()) throw new ErrorType(INVALID);
    for (const item of items) {
      if (!/^[0-9]{3}_[a-f0-9]{24}(?:\.[a-z0-9]+)?$/iu.test(item.work_name)) throw new ErrorType(INVALID);
      const target = path.join(work, item.work_name);
      try {
        assertPlainWorkFile(target, io);
      } catch (error) {
        // Already-cleaned terminal snapshots are normal. Any uncertain read
        // must block maintenance instead of authorising recursive removal.
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }

  function validStateShape(state, token) {
    const supportedSchema = [SCHEMA, V2_SCHEMA, LEGACY_SCHEMA].includes(state?.schema);
    return state?.token === token && supportedSchema && validPseudonymState(state) &&
      Array.isArray(state?.items) && state.items.length > 0 &&
      state.items.length <= maxBatchFiles &&
      state.items.every((item) => validPreflightItem(item, state.schema)) &&
      (state.schema === LEGACY_SCHEMA || state.items.every((item) => validV2ItemResult(item, state.schema))) &&
      validExpiry(state.expires_at) !== undefined;
  }

  function readState(token) {
    let state;
    try {
      state = readJournalRecord(token);
    } catch {
      throw new ErrorType(NOT_FOUND);
    }
    rejectEncryptedState(state);
    const expiry = validExpiry(state?.expires_at);
    if (!validStateShape(state, token)) {
      throw new ErrorType(INVALID);
    }
    if (state.zero_day_work === true && typeof assertZeroDayWorkAvailable === 'function') {
      assertZeroDayWorkAvailable(state);
    }
    if (nowMs() > expiry) {
      rejectRenamedEncryptedCopies(state);
      try {
        removeWorkDirectory(token);
        removeState(state);
      } catch { /* fail closed below */ }
      throw new ErrorType(EXPIRED);
    }
    return state;
  }

  function readStateForMaintenance(token) {
    // Maintenance owns the surrounding lifecycle decision. This path is
    // intentionally read-only and preserves raw parse/validation errors so
    // callers can count them without deleting an unknown local record.
    const state = readJournalRecord(token);
    rejectEncryptedState(state);
    if (!validStateShape(state, token)) {
      throw new Error('invalid');
    }
    rejectRenamedEncryptedCopies(state);
    return state;
  }

  return { writeState, readState, readStateForMaintenance, removeState };
}

module.exports = { SCHEMA, ENCRYPTED_SCHEMA, V2_SCHEMA, LEGACY_SCHEMA, MAX_JOURNAL_BYTES, createBatchJournalStore };
