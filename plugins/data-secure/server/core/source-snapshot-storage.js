'use strict';

// New private source snapshots have an unambiguous storage representation.
// This is plaintext framing, not encryption or authentication against the owner.
const crypto = require('node:crypto');
const { RESOURCE_LIMITS } = require('../resource-limits');
const { processingModeForBatch } = require('./processing-mode');
const { serializeContentOptions, SOURCE_SNAPSHOT_BATCH_SCHEMA: BATCH_SCHEMA } = require('./content-options');
const SCHEMA = 'datasecure-plain-source-snapshot/1';
const MAGIC = Buffer.from('DSSRC01\n', 'ascii');
const MAX_HEADER_BYTES = 768;
const PREFIX_BYTES = MAGIC.length + 4;
const MAX_STORED_BYTES = RESOURCE_LIMITS.MAX_DOCX_SOURCE_BYTES + PREFIX_BYTES + MAX_HEADER_BYTES;
const FIELD = 'source_snapshot_storage';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const invalid = () => { throw Object.assign(new Error('BATCH_SNAPSHOT_CHANGED'), { code: 'BATCH_SNAPSHOT_CHANGED' }); };

function exact(value, fields) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  return keys.length === fields.length && keys.every(key => typeof key === 'string' && fields.includes(key) &&
    descriptors[key].enumerable && Object.hasOwn(descriptors[key], 'value'));
}

function headerFor(state, item) {
  if (state?.schema !== BATCH_SCHEMA || state.product_channel !== 'standalone' ||
      typeof state.token !== 'string' || !/^[a-f0-9]{64}$/u.test(state.token) ||
      typeof item?.id !== 'string' || !/^[a-f0-9]{32}$/u.test(item.id) ||
      typeof item.work_name !== 'string' || !/^[0-9]{3}_[a-f0-9]{24}\.workcopy$/u.test(item.work_name) ||
      item.private_artifact_plain !== true || Object.hasOwn(item, 'private_artifact_encrypted') ||
      Object.hasOwn(item, 'legacy_work_name') || !Number.isSafeInteger(item.size) || item.size < 0 ||
      item.size > RESOURCE_LIMITS.MAX_DOCX_SOURCE_BYTES || typeof item.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(item.sha256)) invalid();
  const header = Buffer.from(JSON.stringify({ schema: SCHEMA, product_channel: 'standalone',
    processing_mode: processingModeForBatch(state), batch_id: state.token, document_id: item.id,
    work_name: item.work_name, source_bytes: item.size, source_sha256: item.sha256,
    content_options_sha256: sha(serializeContentOptions(state.content_options)) }), 'utf8');
  if (header.length > MAX_HEADER_BYTES) invalid();
  return header;
}

function validateStorageItem(state, item) {
  if (state?.schema !== BATCH_SCHEMA) {
    if (Object.hasOwn(item || {}, FIELD)) invalid();
    return;
  }
  if (!Object.hasOwn(item || {}, 'work_name')) {
    if (Object.hasOwn(item || {}, FIELD)) invalid();
    return;
  }
  const header = headerFor(state, item), storage = item[FIELD];
  if (!exact(storage, ['schema', 'stored_bytes', 'stored_sha256']) || storage.schema !== SCHEMA ||
      storage.stored_bytes !== item.size + PREFIX_BYTES + header.length || storage.stored_bytes > MAX_STORED_BYTES ||
      typeof storage.stored_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(storage.stored_sha256)) invalid();
  return header;
}

function encodeSourceSnapshot(state, item, payload) {
  const header = headerFor(state, item);
  if (!Buffer.isBuffer(payload) || payload.length !== item.size || sha(payload) !== item.sha256) invalid();
  const bytes = Buffer.allocUnsafe(PREFIX_BYTES + header.length + payload.length);
  try {
    MAGIC.copy(bytes); bytes.writeUInt32BE(header.length, MAGIC.length);
    header.copy(bytes, PREFIX_BYTES); payload.copy(bytes, PREFIX_BYTES + header.length);
    return { bytes, descriptor: Object.freeze({ schema: SCHEMA, stored_bytes: bytes.length, stored_sha256: sha(bytes) }) };
  } catch (error) { bytes.fill(0); throw error; }
}

function sourceSnapshotHeaderLength(state, item) {
  const header = validateStorageItem(state, item);
  if (!header) invalid();
  return PREFIX_BYTES + header.length;
}

// Classification only. Never use this result as payload-integrity authority.
function verifySourceSnapshotHeader(state, item, prefix, storedBytes) {
  const header = validateStorageItem(state, item);
  if (!header || !Buffer.isBuffer(prefix) || prefix.length !== PREFIX_BYTES + header.length ||
      storedBytes !== item[FIELD].stored_bytes || !prefix.subarray(0, MAGIC.length).equals(MAGIC) ||
      prefix.readUInt32BE(MAGIC.length) !== header.length || !prefix.subarray(PREFIX_BYTES).equals(header)) invalid();
  return prefix.length;
}

function verifySourceSnapshot(state, item, stored) {
  if (!Buffer.isBuffer(stored)) invalid();
  const offset = sourceSnapshotHeaderLength(state, item);
  verifySourceSnapshotHeader(state, item, stored.subarray(0, offset), stored.length);
  if (sha(stored) !== item[FIELD].stored_sha256) invalid();
  const payload = stored.subarray(offset);
  if (payload.length !== item.size || sha(payload) !== item.sha256) invalid();
  return offset;
}

function decodeSourceSnapshot(state, item, stored) {
  const offset = verifySourceSnapshot(state, item, stored);
  // Caller owns and clears the physical wrapper; consumer owns this exact copy.
  return Buffer.from(stored.subarray(offset));
}

module.exports = Object.freeze({ SCHEMA, BATCH_SCHEMA, FIELD, MAX_HEADER_BYTES, PREFIX_BYTES,
  MAX_STORED_BYTES, validateStorageItem, encodeSourceSnapshot, sourceSnapshotHeaderLength,
  verifySourceSnapshotHeader, verifySourceSnapshot, decodeSourceSnapshot });
