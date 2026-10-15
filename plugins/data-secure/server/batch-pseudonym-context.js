'use strict';

// Restart-stable batch pseudonyms without a keyring or a raw-value mapping.
// The random seed is part of the already-private local batch journal. It is
// never projected into MCP responses, diagnostics, mappings or result packs.

const crypto = require('crypto');
const { PRIVACY_RULESET_VERSION } = require('./privacy/policy');
const { CORE_POLICY_FINGERPRINT } = require('./core-policy-fingerprint');
const {
  SECRET_BYTES,
  CONTRACT_VERSION,
  READABLE_CONTRACT_VERSION,
  createBatchPseudonymRegistry
} = require('./batch-pseudonym-registry');

const ENCODED_SEED_RE = /^[A-Za-z0-9_-]{43}$/u;
// Only registries opened by the actual action scope can be committed before
// that scope's finally block. A matching seed or a caller exportState method
// is not durable processing authority.
const registryOwners = new WeakMap();
function immutableRegistrySnapshot(value) {
  return Object.freeze({ bindings: Object.freeze(value.bindings.map(row => Object.freeze([...row]))),
    labels: Object.freeze(value.labels.map(row => Object.freeze([...row]))),
    ...(value.known_alias_index ? { known_alias_index: Object.freeze({ schema: value.known_alias_index.schema,
      starts: Object.freeze([...value.known_alias_index.starts]), attestation: value.known_alias_index.attestation }) } : {}) });
}

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
      core_policy_fingerprint: CORE_POLICY_FINGERPRINT,
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
      (Object.hasOwn(state, 'core_policy_fingerprint') && state.core_policy_fingerprint !== CORE_POLICY_FINGERPRINT) ||
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
    registryOwners.set(registry, { state, token: state.token, seed: state.pseudonym_seed,
      contract: state.pseudonym_contract_version, ruleset: state.pseudonym_ruleset_version,
      fingerprint: state.core_policy_fingerprint, initial: immutableRegistrySnapshot(registry.exportState()),
      exportState: registry.exportState });
    return await action(registry);
  } catch (error) {
    // Processing failures retain their domain-specific error. Only context
    // setup/validation is normalized to a fixed, content-free failure.
    if (registry || error?.code === 'BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE') throw error;
    throw unavailable();
  } finally {
    try {
      if (registry) {
        if (registryOwners.get(registry)?.commitRefused === true)
          throw Object.assign(new Error('DOCUMENT_REVIEW_CONFLICT'), { code: 'DOCUMENT_REVIEW_CONFLICT' });
        const snapshot = registry.exportState();
        state.pseudonym_registry_state = snapshot;
        if (typeof options.persist === 'function') await options.persist(state);
      }
    } finally {
      if (registry) registry.dispose();
      if (registry) registryOwners.delete(registry);
      if (Buffer.isBuffer(seed)) seed.fill(0);
    }
  }
}

function ownedRegistrySnapshot(registry, state) {
  const owner = registryOwners.get(registry);
  if (!owner || owner.token !== state.token || owner.seed !== state.pseudonym_seed ||
      owner.contract !== state.pseudonym_contract_version || owner.ruleset !== state.pseudonym_ruleset_version ||
      owner.fingerprint !== state.core_policy_fingerprint) throw unavailable();
  // Invoke the captured native closure, not a reflected caller property.
  return { initial: owner.initial, current: owner.exportState() };
}
function refuseOwnedRegistryPersist(registry) {
  const owner = registryOwners.get(registry);
  if (owner) owner.commitRefused = true;
}
function synchronizeOwnedRegistryCommit(registry, state, snapshot) {
  const owner = registryOwners.get(registry);
  ownedRegistrySnapshot(registry, state);
  // The actual action's in-memory journal must carry the durable reservation
  // before later checkpoint/mapping writes. Never expose the owner state.
  owner.state.pseudonym_registry_state = immutableRegistrySnapshot(snapshot);
}

module.exports = {
  ENCODED_SEED_RE,
  createBatchPseudonymState,
  validateBatchPseudonymState,
  withBatchPseudonymRegistry,
  ownedRegistrySnapshot,
  refuseOwnedRegistryPersist,
  synchronizeOwnedRegistryCommit
};
