'use strict';

const path = require('node:path');
const { RESOURCE_LIMITS } = require('../resource-limits');

const LOCAL_QUEUE_SCHEMA_INVALID = 'LOCAL_QUEUE_SCHEMA_INVALID';

function invalidQueue() {
  return Object.assign(new Error(LOCAL_QUEUE_SCHEMA_INVALID), { code: LOCAL_QUEUE_SCHEMA_INVALID });
}

// This is deliberately an envelope-only check. It neither opens nor stats a
// source; beginBatch remains the authoritative TOCTOU-safe filesystem gate.
// Running the same small check in the parent and detached worker prevents an
// IPC handoff from being acknowledged for a structurally unusable queue.
function validateBatchQueueEnvelope(queue, options = {}) {
  const platform = options.platform || process.platform;
  if (!Array.isArray(queue) || queue.length < 1 || queue.length > RESOURCE_LIMITS.MAX_BATCH_FILES) {
    throw invalidQueue();
  }
  const seen = new Set();
  let totalBytes = 0;
  for (const entry of queue) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw invalidQueue();
    const full = entry.full;
    const name = entry.name;
    const sourceBytes = entry.sourceBytes;
    if (typeof full !== 'string' || !path.isAbsolute(full) ||
        typeof name !== 'string' || !name || path.basename(name) !== name || path.basename(full) !== name ||
        !Number.isSafeInteger(sourceBytes) || sourceBytes < 1 || sourceBytes > RESOURCE_LIMITS.MAX_INPUT_BYTES) {
      throw invalidQueue();
    }
    const identity = platform === 'win32' ? path.resolve(full).toLowerCase() : path.resolve(full);
    if (seen.has(identity)) throw invalidQueue();
    seen.add(identity);
    const label = entry.sourceLabel === undefined ? name : entry.sourceLabel;
    if (typeof label !== 'string' || !label || label.length > 1024 || label.startsWith('/') ||
        label.split(/[\\/]/u).some((part) => !part || part === '.' || part === '..')) {
      throw invalidQueue();
    }
    totalBytes += sourceBytes;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > RESOURCE_LIMITS.MAX_BATCH_TOTAL_BYTES) throw invalidQueue();
  }
  return queue;
}

module.exports = { LOCAL_QUEUE_SCHEMA_INVALID, validateBatchQueueEnvelope };
