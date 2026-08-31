'use strict';

// Publication stays on the Output filesystem, but unpublished document data
// lives in a separately bound namespace. Names alone never authorize removal.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const common = require('./common');
const { writeFully, syncParentDirectory } = require('./batch-journal-io');
const { processAlive } = require('./process-liveness');

const ROOT_NAME = '.datasecure-staging';
const ROOT_SCHEMA = 'datasecure-package-staging-root/v1';
const OWNER_SCHEMA = 'datasecure-package-staging-owner/v1';
const ID_RE = /^[a-f0-9]{32}$/;
// Batch ids are ds_<32hex>; the existing one-file entrypoint also uses a
// generated, non-source-derived readable name. Both remain single literals.
const PACKAGE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const JOB_RE = /^[a-z0-9]+_[a-f0-9]{8}$/;
const MAX_RECORD_BYTES = 8192;
const MAX_ENTRIES = 10000;
const capabilities = new WeakMap();

function failure(code = 'PACKAGE_STAGING_UNSAFE') {
  const error = new Error(code);
  error.code = code;
  return error;
}

function identity(stat) {
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
}

function exactKeys(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(','));
}

function validIdentity(value) {
  return exactKeys(value, ['dev', 'ino', 'birthtimeNs']) && Object.values(value).every(
    (part) => typeof part === 'string' && /^(?:0|[1-9][0-9]*)$/.test(part));
}

function sameIdentity(left, right) {
  return validIdentity(left) && validIdentity(right) &&
    left.dev === right.dev && left.ino === right.ino && left.birthtimeNs === right.birthtimeNs;
}

function dependencies(options = {}, readOnly = false) {
  const io = options.io || fs;
  const supplied = typeof options.roots === 'function' ? options.roots() : options.roots;
  const r = supplied || (readOnly ? { root: common.privacyRoot() } : common.roots());
  if (!r || typeof r.root !== 'string' || !path.isAbsolute(r.root)) throw failure();
  const privacy = path.resolve(r.root);
  const output = path.join(privacy, 'Output');
  if (r.output !== undefined && path.resolve(r.output) !== output) throw failure();
  const root = path.join(privacy, ROOT_NAME);
  return { io, platform: options.platform || process.platform,
    isProcessAlive: options.isProcessAlive || processAlive, privacy, output, root,
    payloads: path.join(root, 'payloads'), ownership: path.join(root, 'ownership'),
    marker: path.join(root, 'marker.json') };
}

function lstatOrMissing(ctx, target) {
  try { return ctx.io.lstatSync(target, { bigint: true }); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw failure(); }
}

function directory(ctx, target, expected) {
  // Inspect all existing ancestors, including the configured root's parents.
  for (let probe = target; ; probe = path.dirname(probe)) {
    const stat = ctx.io.lstatSync(probe, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw failure();
    const real = ctx.io.realpathSync(probe);
    const comparable = (value) => ctx.platform === 'win32' ? value.toLowerCase() : value;
    if (comparable(path.resolve(real)) !== comparable(path.resolve(probe))) throw failure();
    if (path.dirname(probe) === probe) break;
  }
  const stat = ctx.io.lstatSync(target, { bigint: true });
  const result = identity(stat);
  if (!validIdentity(result) || (expected && !sameIdentity(result, expected))) throw failure();
  return result;
}

function readRecord(ctx, target) {
  let fd;
  try {
    const named = ctx.io.lstatSync(target, { bigint: true });
    if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1n ||
        named.size < 1n || named.size > BigInt(MAX_RECORD_BYTES)) throw failure();
    fd = ctx.io.openSync(target, ctx.io.constants.O_RDONLY | (ctx.io.constants.O_NOFOLLOW || 0));
    const opened = ctx.io.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n || !sameIdentity(identity(opened), identity(named)) ||
        opened.size !== named.size || opened.mtimeNs !== named.mtimeNs) throw failure();
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      const n = ctx.io.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!Number.isSafeInteger(n) || n < 1 || n > bytes.length - offset) throw failure();
      offset += n;
    }
    const after = ctx.io.fstatSync(fd, { bigint: true });
    const renamed = ctx.io.lstatSync(target, { bigint: true });
    if (!sameIdentity(identity(after), identity(opened)) || !sameIdentity(identity(renamed), identity(opened)) ||
        after.nlink !== 1n || renamed.nlink !== 1n || !renamed.isFile() || renamed.isSymbolicLink() ||
        after.size !== opened.size || after.mtimeNs !== opened.mtimeNs ||
        renamed.size !== opened.size || renamed.mtimeNs !== opened.mtimeNs) throw failure();
    return { value: JSON.parse(bytes.toString('utf8')), identity: identity(opened),
      hash: crypto.createHash('sha256').update(bytes).digest('hex') };
  } catch { throw failure('PACKAGE_STAGING_RECORD_UNSAFE'); }
  finally { if (fd !== undefined) ctx.io.closeSync(fd); }
}

function sameRecord(a, b) {
  return a && b && sameIdentity(a.identity, b.identity) && a.hash === b.hash;
}

function writeExclusive(ctx, target, value) {
  let fd;
  try {
    fd = ctx.io.openSync(target, ctx.io.constants.O_WRONLY | ctx.io.constants.O_CREAT |
      ctx.io.constants.O_EXCL | (ctx.io.constants.O_NOFOLLOW || 0), 0o600);
    writeFully(fd, JSON.stringify(value), ctx.io);
    ctx.io.fsyncSync(fd);
  } finally { if (fd !== undefined) ctx.io.closeSync(fd); }
  syncParentDirectory(target, ctx.io, ctx.platform);
  return readRecord(ctx, target);
}

function validMarker(value) {
  return exactKeys(value, ['schema', 'privacy', 'root', 'payloads', 'ownership']) &&
    value.schema === ROOT_SCHEMA && ['privacy', 'root', 'payloads', 'ownership'].every(
      (key) => validIdentity(value[key]));
}

function validateRoot(ctx, expected) {
  const marker = readRecord(ctx, ctx.marker);
  if (!validMarker(marker.value) || (expected && !sameRecord(marker, expected))) throw failure();
  for (const key of ['privacy', 'root', 'payloads', 'ownership']) directory(ctx, ctx[key], marker.value[key]);
  if (ctx.io.readdirSync(ctx.root).sort().join(',') !== 'marker.json,ownership,payloads') throw failure();
  return marker;
}

function ensureRoot(ctx) {
  directory(ctx, ctx.privacy);
  if (lstatOrMissing(ctx, ctx.root)) return validateRoot(ctx);
  // A crash before the durable marker leaves an unbound root. It is retained,
  // never retroactively claimed merely because its name looks familiar.
  ctx.io.mkdirSync(ctx.root, { mode: 0o700 });
  ctx.io.mkdirSync(ctx.payloads, { mode: 0o700 });
  ctx.io.mkdirSync(ctx.ownership, { mode: 0o700 });
  const value = { schema: ROOT_SCHEMA };
  for (const key of ['privacy', 'root', 'payloads', 'ownership']) value[key] = directory(ctx, ctx[key]);
  if (value.root.dev !== value.privacy.dev || value.payloads.dev !== value.root.dev ||
      value.ownership.dev !== value.root.dev) throw failure();
  writeExclusive(ctx, ctx.marker, value);
  syncParentDirectory(ctx.payloads, ctx.io, ctx.platform);
  syncParentDirectory(ctx.root, ctx.io, ctx.platform);
  return validateRoot(ctx);
}

function validOwner(value, stageId, marker) {
  return exactKeys(value, ['schema', 'stage_id', 'pid', 'owner_nonce', 'job_id', 'package_id',
    'root_identity', 'payload_identity', 'output_identity']) && value.schema === OWNER_SCHEMA &&
    value.stage_id === stageId && ID_RE.test(stageId) && Number.isSafeInteger(value.pid) && value.pid > 0 &&
    typeof value.owner_nonce === 'string' && ID_RE.test(value.owner_nonce) &&
    typeof value.job_id === 'string' && JOB_RE.test(value.job_id) &&
    typeof value.package_id === 'string' && PACKAGE_RE.test(value.package_id) &&
    sameIdentity(value.root_identity, marker.value.root) && validIdentity(value.payload_identity) &&
    validIdentity(value.output_identity) && value.payload_identity.dev === marker.value.payloads.dev &&
    value.output_identity.dev === value.payload_identity.dev;
}

function ownerRecord(ctx, stageId, marker) {
  const record = readRecord(ctx, path.join(ctx.ownership, `${stageId}.json`));
  if (!validOwner(record.value, stageId, marker)) throw failure('PACKAGE_STAGING_OWNER_INVALID');
  return record;
}

function unlinkOwner(ctx, stageId, expected, marker) {
  validateRoot(ctx, marker);
  const target = path.join(ctx.ownership, `${stageId}.json`);
  if (!sameRecord(ownerRecord(ctx, stageId, marker), expected)) throw failure();
  ctx.io.unlinkSync(target);
  syncParentDirectory(target, ctx.io, ctx.platform);
}

function preflightPayload(ctx, target, expected) {
  directory(ctx, target, expected);
  const pending = [{ target, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const item = pending.pop();
    if (++count > MAX_ENTRIES || item.depth > 32) throw failure();
    const stat = ctx.io.lstatSync(item.target, { bigint: true });
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) ||
        stat.dev.toString() !== expected.dev || (stat.isFile() && stat.nlink !== 1n)) throw failure();
    if (stat.isDirectory()) {
      const names = ctx.io.readdirSync(item.target);
      if (names.length + pending.length + count > MAX_ENTRIES) throw failure();
      for (const name of names) {
        if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) throw failure();
        pending.push({ target: path.join(item.target, name), depth: item.depth + 1 });
      }
    }
  }
  directory(ctx, target, expected);
}

function createStage(packageId, options = {}) {
  try {
    const jobId = options.jobId === undefined ? `${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}` : options.jobId;
    const ownerNonce = options.ownerNonce === undefined ? crypto.randomBytes(16).toString('hex') : options.ownerNonce;
    if (typeof packageId !== 'string' || !PACKAGE_RE.test(packageId) ||
        typeof jobId !== 'string' || !JOB_RE.test(jobId) ||
        typeof ownerNonce !== 'string' || !ID_RE.test(ownerNonce)) throw failure('PACKAGE_STAGING_ARGUMENT_INVALID');
    const ctx = dependencies(options);
    const marker = ensureRoot(ctx);
    const outputIdentity = directory(ctx, ctx.output);
    if (outputIdentity.dev !== marker.value.payloads.dev) throw failure('PACKAGE_STAGING_CROSS_DEVICE');
    const stageId = crypto.randomBytes(16).toString('hex');
    const target = path.join(ctx.payloads, stageId);
    validateRoot(ctx, marker);
    ctx.io.mkdirSync(target, { mode: 0o700 });
    const payloadIdentity = directory(ctx, target);
    const value = { schema: OWNER_SCHEMA, stage_id: stageId, pid: process.pid, owner_nonce: ownerNonce,
      job_id: jobId, package_id: packageId, root_identity: marker.value.root,
      payload_identity: payloadIdentity, output_identity: outputIdentity };
    // Before this write succeeds the only possible payload is an empty,
    // unbound directory. No capability/document writer has been admitted yet.
    const record = writeExclusive(ctx, path.join(ctx.ownership, `${stageId}.json`), value);
    syncParentDirectory(target, ctx.io, ctx.platform);
    const stage = Object.freeze({ path: target });
    capabilities.set(stage, { ctx, marker, record, stageId, target, status: 'bound' });
    assertStage(stage);
    return stage;
  } catch (error) { throw failure(error?.code?.startsWith('PACKAGE_STAGING_') ? error.code : 'PACKAGE_STAGING_CREATE_FAILED'); }
}

function assertStage(stage) {
  try {
    const state = capabilities.get(stage);
    if (!state || state.status !== 'bound') throw failure('PACKAGE_STAGING_CAPABILITY_INVALID');
    validateRoot(state.ctx, state.marker);
    if (!sameRecord(ownerRecord(state.ctx, state.stageId, state.marker), state.record)) throw failure();
    directory(state.ctx, state.target, state.record.value.payload_identity);
    return stage;
  } catch (error) { throw failure(error?.code?.startsWith('PACKAGE_STAGING_') ? error.code : 'PACKAGE_STAGING_UNSAFE'); }
}

function publishStage(stage, finalPackage, publishFn = fs.renameSync) {
  const state = capabilities.get(stage);
  try {
    assertStage(stage);
    const { ctx, record } = state;
    if (typeof finalPackage !== 'string' || finalPackage !== path.join(ctx.output, record.value.package_id) ||
        typeof publishFn !== 'function') throw failure('PACKAGE_STAGING_PUBLISH_TARGET_INVALID');
    const outputIdentity = directory(ctx, ctx.output, record.value.output_identity);
    if (outputIdentity.dev !== record.value.payload_identity.dev) throw failure('PACKAGE_STAGING_CROSS_DEVICE');
    preflightPayload(ctx, state.target, record.value.payload_identity);
    if (lstatOrMissing(ctx, finalPackage)) throw failure('PACKAGE_STAGING_FINAL_EXISTS');
    assertStage(stage);
    directory(ctx, ctx.output, outputIdentity);
    if (lstatOrMissing(ctx, finalPackage)) throw failure('PACKAGE_STAGING_FINAL_EXISTS');
    let publishError;
    try { publishFn(state.target, finalPackage); } catch (error) { publishError = error; }
    // A callback can throw *after* it has renamed. Detect that state before
    // deciding whether any remaining private stage can still be discarded.
    const old = lstatOrMissing(ctx, state.target);
    const final = lstatOrMissing(ctx, finalPackage);
    if (!old && final?.isDirectory() && !final.isSymbolicLink() &&
        sameIdentity(identity(final), record.value.payload_identity)) {
      state.status = 'published';
      let cleanupPending = Boolean(publishError);
      try {
        directory(ctx, ctx.output, outputIdentity);
        directory(ctx, finalPackage, record.value.payload_identity);
        syncParentDirectory(state.target, ctx.io, ctx.platform);
        syncParentDirectory(finalPackage, ctx.io, ctx.platform);
        unlinkOwner(ctx, state.stageId, record, state.marker);
      } catch { cleanupPending = true; }
      return Object.freeze({ published: true, cleanup_pending: cleanupPending });
    }
    throw failure(publishError?.code === 'EXDEV' ? 'PACKAGE_STAGING_CROSS_DEVICE' : 'PACKAGE_STAGING_PUBLISH_FAILED');
  } catch (error) { throw failure(error?.code?.startsWith('PACKAGE_STAGING_') ? error.code : 'PACKAGE_STAGING_PUBLISH_FAILED'); }
}

function removeBoundPayload(ctx, stageId, record, marker) {
  validateRoot(ctx, marker);
  const target = path.join(ctx.payloads, stageId);
  const stat = lstatOrMissing(ctx, target);
  if (stat) {
    preflightPayload(ctx, target, record.value.payload_identity);
    if (!sameRecord(ownerRecord(ctx, stageId, marker), record)) throw failure();
    validateRoot(ctx, marker);
    common.safeRemovePrivateTree(ctx.payloads, stageId, {
      expectedIdentity: record.value.payload_identity,
      expectedParentIdentity: marker.value.payloads
    });
    syncParentDirectory(target, ctx.io, ctx.platform);
  }
  // An absent payload may already have been atomically published. Recovery
  // completes only this ownership receipt, and never touches Output.
  unlinkOwner(ctx, stageId, record, marker);
}

function discardStage(stage) {
  try {
    const state = capabilities.get(stage);
    if (!state) throw failure('PACKAGE_STAGING_CAPABILITY_INVALID');
    if (state.status === 'published' || state.status === 'discarded') return false;
    assertStage(stage);
    removeBoundPayload(state.ctx, state.stageId, state.record, state.marker);
    state.status = 'discarded';
    return true;
  } catch (error) { throw failure(error?.code?.startsWith('PACKAGE_STAGING_') ? error.code : 'PACKAGE_STAGING_DISCARD_FAILED'); }
}

function inventory(ctx) {
  const result = { records: [], failures: 0, unbound: 0, pending: 0, marker: null };
  if (!lstatOrMissing(ctx, ctx.root)) return result;
  try { result.marker = validateRoot(ctx); }
  catch { result.failures++; result.unbound++; return result; }
  const owned = new Set();
  const owners = ctx.io.readdirSync(ctx.ownership);
  const payloads = ctx.io.readdirSync(ctx.payloads);
  if (owners.length > MAX_ENTRIES || payloads.length > MAX_ENTRIES) throw failure();
  for (const name of owners) {
    const match = /^([a-f0-9]{32})\.json$/.exec(name);
    if (!match) { result.unbound++; continue; }
    const stageId = match[1];
    try {
      const record = ownerRecord(ctx, stageId, result.marker);
      owned.add(stageId);
      const target = path.join(ctx.payloads, stageId);
      if (lstatOrMissing(ctx, target)) preflightPayload(ctx, target, record.value.payload_identity);
      result.records.push({ stageId, record });
      result.pending++;
    } catch { result.failures++; result.unbound++; }
  }
  for (const name of payloads) if (!owned.has(name)) result.unbound++;
  validateRoot(ctx, result.marker);
  return result;
}

function inspectStaging(options = {}) {
  try {
    const found = inventory(dependencies(options, true));
    return { pending: found.pending, failures: found.failures, unbound: found.unbound };
  } catch { return { pending: 0, failures: 1, unbound: 1 }; }
}

function recoverAbandonedStages(options = {}) {
  const result = { removed: 0, active: 0, failures: 0, unbound: 0 };
  try {
    const ctx = dependencies(options);
    const found = inventory(ctx);
    result.failures = found.failures;
    result.unbound = found.unbound;
    for (const { stageId, record } of found.records) {
      // Only an explicit false is proof of death. Errors and non-booleans
      // cannot turn an uncertain/live owner into cleanup authority.
      let alive = true;
      try { alive = ctx.isProcessAlive(record.value.pid) !== false; } catch { /* retain */ }
      if (alive) { result.active++; continue; }
      try {
        if (ctx.isProcessAlive(record.value.pid) !== false) { result.active++; continue; }
        removeBoundPayload(ctx, stageId, record, found.marker);
        result.removed++;
      } catch { result.failures++; }
    }
  } catch { result.failures++; }
  return result;
}

module.exports = { createStage, assertStage, publishStage, discardStage, recoverAbandonedStages, inspectStaging };
