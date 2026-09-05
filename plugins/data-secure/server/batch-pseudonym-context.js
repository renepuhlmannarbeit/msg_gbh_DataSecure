'use strict';

// Restart-stable batch pseudonyms without a keyring or a raw-value mapping.
// The random seed is part of the already-private local batch journal. It is
// never projected into MCP responses, diagnostics, mappings or result packs.

const crypto = require('crypto');
const { PRIVACY_RULESET_VERSION } = require('./privacy/policy');
const {
  SECRET_BYTES,
  CONTRACT_VERSION,
  READABLE_CONTRACT_VERSION,
  createBatchPseudonymRegistry
} = require('./batch-pseudonym-registry');

const ENCODED_SEED_RE = /^[A-Za-z0-9_-]{43}$/u;

function unavailable(message = 'Der lokale Stapel-Pseudonymkontext ist nicht verfügbar.') {
  const error = new Error(message);
  error.code = 'BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE';
  return error;
}

function createBatchPseudonymState(options = {}) {
  const randomBytes = options.randomBytes || crypto.randomBytes;
  let seed;
  try {
    seed = randomBytes(SECRET_BYTES);
    if (!Buffer.isBuffer(seed) || seed.length !== SECRET_BYTES) throw unavailable();
    return {
      pseudonym_contract_version: options.productChannel === 'standalone' ? READABLE_CONTRACT_VERSION : CONTRACT_VERSION,
      pseudonym_ruleset_version: PRIVACY_RULESET_VERSION,
      pseudonym_seed: seed.toString('base64url'),
      ...(options.productChannel === 'standalone'
        ? { pseudonym_registry_state: { bindings: [], labels: [] } }
        : {})
    };
  } finally {
    if (Buffer.isBuffer(seed)) seed.fill(0);
  }
}

function validateBatchPseudonymState(state) {
  if (!state || ![CONTRACT_VERSION, READABLE_CONTRACT_VERSION].includes(state.pseudonym_contract_version) ||
      state.pseudonym_ruleset_version !== PRIVACY_RULESET_VERSION ||
      (state.pseudonym_contract_version === READABLE_CONTRACT_VERSION && !state.pseudonym_registry_state) ||
      typeof state.pseudonym_seed !== 'string' || !ENCODED_SEED_RE.test(state.pseudonym_seed)) {
    throw unavailable('Der Stapel besitzt keinen kompatiblen Pseudonymkontext. Bitte die Originaldateien neu auswählen.');
  }
  const seed = Buffer.from(state.pseudonym_seed, 'base64url');
  if (seed.length !== SECRET_BYTES) {
    seed.fill(0);
    throw unavailable('Der Stapel besitzt keinen kompatiblen Pseudonymkontext. Bitte die Originaldateien neu auswählen.');
  }
  return seed;
}

async function withBatchPseudonymRegistry(state, action, options = {}) {
  if (typeof action !== 'function') throw unavailable();
  let seed;
  let registry;
  try {
    seed = validateBatchPseudonymState(state);
    registry = createBatchPseudonymRegistry(seed, {
      contractVersion: state.pseudonym_contract_version,
      rulesetVersion: state.pseudonym_ruleset_version,
      persistedState: state.pseudonym_registry_state
    });
    return await action(registry);
  } catch (error) {
    // Processing failures retain their domain-specific error. Only context
    // setup/validation is normalized to a fixed, content-free failure.
    if (registry || error?.code === 'BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE') throw error;
    throw unavailable();
  } finally {
    try {
      if (registry) {
        const snapshot = registry.exportState();
        state.pseudonym_registry_state = snapshot;
        if (typeof options.persist === 'function') await options.persist(state);
      }
    } finally {
      if (registry) registry.dispose();
      if (Buffer.isBuffer(seed)) seed.fill(0);
    }
  }
}

module.exports = {
  ENCODED_SEED_RE,
  createBatchPseudonymState,
  validateBatchPseudonymState,
  withBatchPseudonymRegistry
};
