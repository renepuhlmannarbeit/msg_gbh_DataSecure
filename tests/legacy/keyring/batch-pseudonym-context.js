'use strict';

// Historical test-only lifecycle half of BATCH_PSEUDONYM_V1.
// The caller persists only the opaque
// batch token plus CONTRACT_VERSION; the secret itself lives exclusively in
// the native OS credential store. This module is intentionally not wired to
// MCP until the native keyring matrix has passed on every released target.

const crypto = require('crypto');
const { createBatchSecretStore } = require('./batch-secret-store');
const {
  SECRET_BYTES,
  CONTRACT_VERSION,
  createBatchPseudonymRegistry
} = require('../../../plugins/data-secure/server/batch-pseudonym-registry');

function unavailable(message = 'Der lokale Stapel-Pseudonymkontext ist nicht verfügbar.') {
  const error = new Error(message);
  error.code = 'PSEUDONYM_SECRET_UNAVAILABLE';
  return error;
}

function storeFor(batchToken, options = {}) {
  const factory = options.createStore || createBatchSecretStore;
  try {
    return factory(batchToken, options.storeOptions || {});
  } catch {
    throw unavailable();
  }
}

function provisionBatchPseudonymContext(batchToken, options = {}) {
  const store = storeFor(batchToken, options);
  const randomBytes = options.randomBytes || crypto.randomBytes;
  let secret;
  try {
    secret = randomBytes(SECRET_BYTES);
    if (!Buffer.isBuffer(secret) || secret.length !== SECRET_BYTES) throw unavailable();
    store.set(secret);
    return Object.freeze({
      contract: CONTRACT_VERSION,
      account: String(batchToken)
    });
  } catch {
    // A backend may fail after partially writing. Best-effort removal is the
    // only safe rollback; no file or locally encrypted fallback is permitted.
    try { store.remove(); } catch { /* original fixed failure remains */ }
    throw unavailable();
  } finally {
    if (Buffer.isBuffer(secret)) secret.fill(0);
  }
}

async function withBatchPseudonymRegistry(batchToken, action, options = {}) {
  if (typeof action !== 'function') throw unavailable();
  const store = storeFor(batchToken, options);
  let secret;
  let registry;
  try {
    secret = store.get();
    if (!Buffer.isBuffer(secret) || secret.length !== SECRET_BYTES) throw unavailable();
    registry = createBatchPseudonymRegistry(secret);
    return await action(registry);
  } catch (error) {
    if (error?.code === 'PSEUDONYM_SECRET_UNAVAILABLE') throw error;
    // Errors raised by the processing callback must retain their existing
    // fixed code. Only keyring/read/registry setup failures are normalized.
    if (registry) throw error;
    throw unavailable();
  } finally {
    if (registry) registry.dispose();
    if (Buffer.isBuffer(secret)) secret.fill(0);
  }
}

function removeBatchPseudonymContext(batchToken, options = {}) {
  const store = storeFor(batchToken, options);
  try {
    store.remove();
    return true;
  } catch {
    throw unavailable('Der lokale Stapel-Pseudonymkontext konnte nicht sicher gelöscht werden.');
  }
}

module.exports = {
  provisionBatchPseudonymContext,
  withBatchPseudonymRegistry,
  removeBatchPseudonymContext
};
