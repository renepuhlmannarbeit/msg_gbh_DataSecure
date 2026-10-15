'use strict';

// Private, digest-only witness. It cannot mint a processing ticket, publish a
// package, restore raw aliases or replace a live registry with an older one.
const crypto = require('node:crypto');
const { types } = require('node:util');
const { createBatchPseudonymRegistry, READABLE_CONTRACT_VERSION } = require('../batch-pseudonym-registry');
const { PRIVACY_RULESET_VERSION } = require('../privacy/policy');
const { CORE_POLICY_FINGERPRINT } = require('../core-policy-fingerprint');
const SCHEMA = 'datasecure-prepared-registry-commit/1';
const DOMAIN = 'datasecure-private-prepared-registry/1\0';
const SHA = /^[a-f0-9]{64}$/u, ID = /^[a-f0-9]{32}$/u, ENCODED = /^[A-Za-z0-9_-]{43}$/u;
const invalid = () => Object.assign(Error('DOCUMENT_REVIEW_CONFLICT'), { code: 'DOCUMENT_REVIEW_CONFLICT' });
const KEYS = ['schema', 'batch_id', 'document_id', 'source_sha256', 'manifest_sha256',
  'pseudonym_contract_version', 'pseudonym_ruleset_version', 'core_policy_fingerprint', 'registry_state', 'authentication'];

function guard(value, depth = 0, seen = new Set()) {
  if (['function', 'symbol', 'bigint'].includes(typeof value)) throw invalid();
  if (!value || typeof value !== 'object') return;
  if (types.isProxy(value) || depth > 5 || seen.has(value)) throw invalid();
  const array = Array.isArray(value), proto = Object.getPrototypeOf(value), keys = Reflect.ownKeys(value);
  if (array ? proto !== Array.prototype : ![Object.prototype, null].includes(proto)) throw invalid();
  if (keys.length > (array ? 10001 : 16) || keys.some(key => typeof key !== 'string')) throw invalid();
  seen.add(value);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(d, 'value') || (!d.enumerable && !(array && key === 'length')) ||
        array && key !== 'length' && !/^(?:0|[1-9][0-9]*)$/u.test(key)) throw invalid();
    guard(d.value, depth + 1, seen);
  }
  if (array && (!Number.isSafeInteger(value.length) || keys.length !== value.length + 1)) throw invalid();
  seen.delete(value);
}
const exact = (value, keys) => value && !Array.isArray(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function decoded(text) {
  if (typeof text !== 'string' || !ENCODED.test(text)) throw invalid();
  const bytes = Buffer.from(text, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== text) { bytes.fill(0); throw invalid(); }
  return bytes;
}
function canonicalState(value) {
  guard(value);
  const index = value?.known_alias_index;
  if (!exact(value, ['bindings', 'labels', ...(index ? ['known_alias_index'] : [])]) ||
      !Array.isArray(value.bindings) || !Array.isArray(value.labels)) throw invalid();
  const pairs = rows => rows.map(row => {
    if (!Array.isArray(row) || row.length !== 2 || row.some(part => typeof part !== 'string' || part.length > 64)) throw invalid();
    return [...row];
  });
  const state = { bindings: pairs(value.bindings), labels: pairs(value.labels) };
  for (const [alias] of state.bindings) decoded(alias).fill(0);
  for (const [, identity] of state.labels) decoded(identity).fill(0);
  if (index) {
    if (!exact(index, ['schema', 'starts', 'attestation']) || !Array.isArray(index.starts)) throw invalid();
    decoded(index.attestation).fill(0);
    for (const start of index.starts) decoded(start).fill(0);
    state.known_alias_index = { schema: index.schema, starts: [...index.starts], attestation: index.attestation };
  }
  return state;
}
function checkedState(value, seed, { allowEmptyInitial = false } = {}) {
  const canonical = canonicalState(value);
  // Existing new journals initially have two empty arrays. That exact initial
  // form can be read before the first commit, never persisted as a witness.
  const emptyInitial = allowEmptyInitial && !canonical.known_alias_index && !canonical.bindings.length && !canonical.labels.length;
  if (!canonical.known_alias_index && !emptyInitial) throw invalid();
  let registry;
  try {
    registry = createBatchPseudonymRegistry(seed, { contractVersion: READABLE_CONTRACT_VERSION,
      rulesetVersion: PRIVACY_RULESET_VERSION, persistedState: canonical });
    const restored = canonicalState(registry.exportState());
    if (!emptyInitial && JSON.stringify(restored) !== JSON.stringify(canonical)) throw invalid();
    return restored;
  } finally { registry?.dispose(); }
}
function identity(context, manifestSha) {
  if (!context || typeof context.batch_id !== 'string' || !SHA.test(context.batch_id) ||
      typeof context.document_id !== 'string' || !ID.test(context.document_id) || typeof context.source_sha256 !== 'string' || !SHA.test(context.source_sha256) ||
      typeof manifestSha !== 'string' || !SHA.test(manifestSha) || context.pseudonym_contract_version !== READABLE_CONTRACT_VERSION ||
      context.core_policy_fingerprint !== CORE_POLICY_FINGERPRINT) throw invalid();
  return { schema: SCHEMA, batch_id: context.batch_id, document_id: context.document_id,
    source_sha256: context.source_sha256, manifest_sha256: manifestSha,
    pseudonym_contract_version: READABLE_CONTRACT_VERSION, pseudonym_ruleset_version: PRIVACY_RULESET_VERSION,
    core_policy_fingerprint: CORE_POLICY_FINGERPRINT };
}
function unsigned(context, manifestSha, state) { return { ...identity(context, manifestSha), registry_state: state }; }
const authenticate = (seed, value) => crypto.createHmac('sha256', seed).update(DOMAIN).update(JSON.stringify(value)).digest('base64url');
function mintRegistryCommit(context, manifestSha, seed, state) {
  const record = unsigned(context, manifestSha, checkedState(state, seed));
  return Object.freeze({ ...record, authentication: authenticate(seed, record) });
}
function assertRegistryCommit(context, manifestSha, seed, commit, current) {
  try {
    guard(commit);
    if (!exact(commit, KEYS)) throw invalid();
    const record = unsigned(context, manifestSha, checkedState(commit.registry_state, seed));
    if (KEYS.filter(key => !['registry_state', 'authentication'].includes(key)).some(key => commit[key] !== record[key])) throw invalid();
    const expected = decoded(authenticate(seed, record)); let actual;
    try { actual = decoded(commit.authentication); if (!crypto.timingSafeEqual(expected, actual)) throw invalid(); }
    finally { expected.fill(0); actual?.fill(0); }
    const now = checkedState(current, seed), aliases = new Map(now.bindings), labels = new Map(now.labels), starts = new Set(now.known_alias_index.starts);
    if (record.registry_state.bindings.some(([key, label]) => aliases.get(key) !== label) ||
        record.registry_state.labels.some(([label, key]) => labels.get(label) !== key) ||
        record.registry_state.known_alias_index.starts.some(start => !starts.has(start))) throw invalid();
    return true;
  } catch { throw invalid(); }
}
module.exports = Object.freeze({ SCHEMA, decoded, checkedState, mintRegistryCommit, assertRegistryCommit });
