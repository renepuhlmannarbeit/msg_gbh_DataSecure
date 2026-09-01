'use strict';

// In-memory half of BATCH_PSEUDONYM_V1. Only HMAC alias bindings and collision
// digests are persisted beside the batch seed in the private journal. Raw
// aliases remain action-local and are disposed after every bounded operation.

const crypto = require('crypto');

const SECRET_BYTES = 32;
const CONTRACT_VERSION = 'batch-pseudonym/v1';
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PREFIX = Object.freeze({
  PERSON: 'PERSON',
  ORG: 'ORGANISATION',
  CUSTOMER: 'KUNDE',
  PROJECT: 'PROJEKT'
});

function inputError(message) {
  const error = new Error(message);
  error.code = 'BATCH_PSEUDONYM_INPUT_INVALID';
  return error;
}

function canonicalValue(value) {
  const normalized = String(value || '').normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (!normalized) throw inputError('Die zu pseudonymisierende Entität fehlt.');
  return normalized.toLocaleLowerCase('de-DE');
}

function base32(buffer) {
  let accumulator = 0;
  let bits = 0;
  let out = '';
  for (const byte of buffer) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32[(accumulator >>> bits) & 31];
    }
  }
  if (bits > 0) out += BASE32[(accumulator << (5 - bits)) & 31];
  return out;
}

function placeholderForDigest(kind, digest, labels) {
  if (!Object.hasOwn(PREFIX, kind) || !Buffer.isBuffer(digest) || digest.length !== 32 || !(labels instanceof Map)) {
    throw inputError('Der Pseudonym-Ableitungswert ist ungültig.');
  }
  const digestId = digest.toString('base64url');
  const encoded = base32(digest);
  let width = 10;
  let placeholder;
  do {
    placeholder = `[${PREFIX[kind]}_${encoded.slice(0, width)}]`;
    const prior = labels.get(placeholder);
    if (!prior || prior === digestId) return { placeholder, digestId };
    width += 2;
  } while (width <= encoded.length);
  throw inputError('Eine Stapel-Pseudonymkollision konnte nicht sicher aufgelöst werden.');
}

function createBatchPseudonymRegistry(secret, options = {}) {
  if (!Buffer.isBuffer(secret) || secret.length !== SECRET_BYTES) {
    throw inputError('Der lokale Stapel-Secret hat nicht die erwartete Länge.');
  }
  const key = Buffer.from(secret);
  const rulesetVersion = String(options.rulesetVersion || 'de-business/2');
  if (!/^[a-z0-9][a-z0-9._/-]{0,63}$/u.test(rulesetVersion)) {
    key.fill(0);
    throw inputError('Die Pseudonym-Regelversion ist ungültig.');
  }
  const map = new Map(); // ephemeral raw aliases for the current document only
  const bindings = new Map(); // keyed HMAC(alias) -> placeholder; safe to persist privately
  const labels = new Map(); // placeholder -> full HMAC, never raw entity value
  const counts = { PERSON: 0, ORG: 0, CUSTOMER: 0, PROJECT: 0 };
  const locations = [];
  let disposed = false;

  function aliasId(kind, canonical) {
    return crypto.createHmac('sha256', key)
      .update(`${CONTRACT_VERSION}\u0000${rulesetVersion}\u0000alias\u0000${kind}\u0000${canonical}`, 'utf8')
      .digest('base64url');
  }

  const restored = options.persistedState;
  try {
    if (restored !== undefined) {
      if (!restored || Object.keys(restored).sort().join(',') !== 'bindings,labels' ||
          !Array.isArray(restored.bindings) || !Array.isArray(restored.labels) ||
          restored.bindings.length > 10000 || restored.labels.length > 10000) {
        throw inputError('Der persistierte Pseudonymzustand ist ungültig.');
      }
      for (const pair of restored.labels) {
        const placeholder = String(pair?.[0] || '');
        const digestId = String(pair?.[1] || '');
        const match = /^\[(?:PERSON|ORGANISATION|KUNDE|PROJEKT)_([A-Z2-7]{10,52})\]$/u.exec(placeholder);
        if (!Array.isArray(pair) || pair.length !== 2 || !match ||
            !/^[A-Za-z0-9_-]{43}$/u.test(digestId) || labels.has(placeholder)) {
          throw inputError('Der persistierte Pseudonymzustand ist ungültig.');
        }
        const digest = Buffer.from(digestId, 'base64url');
        try {
          if (digest.length !== 32 || !base32(digest).startsWith(match[1])) {
            throw inputError('Der persistierte Pseudonymzustand ist ungültig.');
          }
        } finally { digest.fill(0); }
        labels.set(placeholder, digestId);
      }
      for (const pair of restored.bindings) {
        const alias = String(pair?.[0] || '');
        const placeholder = String(pair?.[1] || '');
        if (!Array.isArray(pair) || pair.length !== 2 || !/^[A-Za-z0-9_-]{43}$/u.test(alias) ||
            !labels.has(placeholder) || bindings.has(alias)) {
          throw inputError('Der persistierte Pseudonymzustand ist ungültig.');
        }
        bindings.set(alias, placeholder);
      }
    }
  } catch (error) {
    key.fill(0);
    map.clear();
    bindings.clear();
    labels.clear();
    throw error;
  }

  function requireLive() {
    if (disposed) throw inputError('Der lokale Stapel-Pseudonymkontext wurde bereits gelöscht.');
  }

  function assign(kind, value) {
    requireLive();
    if (!Object.hasOwn(PREFIX, kind)) throw inputError('Der Entitätstyp ist im Pseudonymvertrag nicht zugelassen.');
    const canonical = canonicalValue(value);
    const mapKey = `${kind}:${canonical}`;
    const existing = map.get(mapKey);
    if (existing) return existing;
    const bound = bindings.get(aliasId(kind, canonical));
    if (bound) {
      map.set(mapKey, bound);
      return bound;
    }

    const digest = crypto.createHmac('sha256', key)
      .update(`${CONTRACT_VERSION}\u0000${rulesetVersion}\u0000${kind}\u0000${canonical}`, 'utf8')
      .digest();
    let derived;
    try { derived = placeholderForDigest(kind, digest, labels); }
    finally { digest.fill(0); }
    labels.set(derived.placeholder, derived.digestId);
    map.set(mapKey, derived.placeholder);
    bindings.set(aliasId(kind, canonical), derived.placeholder);
    counts[kind] += 1;
    return derived.placeholder;
  }

  function lookup(kind, value) {
    requireLive();
    if (!Object.hasOwn(PREFIX, kind)) return null;
    const canonical = canonicalValue(value);
    return map.get(`${kind}:${canonical}`) || bindings.get(aliasId(kind, canonical)) || null;
  }
  function remember(kind, value, placeholder) {
    requireLive();
    if (!Object.hasOwn(PREFIX, kind) || !labels.has(String(placeholder))) {
      throw inputError('Der Pseudonym-Ableitungswert ist ungültig.');
    }
    const canonical = canonicalValue(value);
    const alias = aliasId(kind, canonical);
    const existing = bindings.get(alias);
    if (existing && existing !== String(placeholder)) {
      const digest = crypto.createHmac('sha256', key)
        .update(`${CONTRACT_VERSION}\u0000${rulesetVersion}\u0000ambiguous-alias\u0000${kind}\u0000${canonical}`, 'utf8')
        .digest();
      let ambiguous;
      try { ambiguous = placeholderForDigest(kind, digest, labels); }
      finally { digest.fill(0); }
      labels.set(ambiguous.placeholder, ambiguous.digestId);
      map.set(`${kind}:${canonical}`, ambiguous.placeholder);
      bindings.set(alias, ambiguous.placeholder);
      return;
    }
    map.set(`${kind}:${canonical}`, String(placeholder));
    bindings.set(alias, String(placeholder));
  }
  function rememberEphemeral(kind, value, placeholder) {
    requireLive();
    if (!Object.hasOwn(PREFIX, kind) || typeof placeholder !== 'string' || !placeholder) {
      throw inputError('Der Pseudonym-Ableitungswert ist ungültig.');
    }
    map.set(`${kind}:${canonicalValue(value)}`, placeholder);
  }
  function entriesForKind(kind) {
    requireLive();
    if (!Object.hasOwn(PREFIX, kind)) throw inputError('Der Entitätstyp ist im Pseudonymvertrag nicht zugelassen.');
    const prefix = `${kind}:`;
    return [...map].filter(([mapKey]) => mapKey.startsWith(prefix)).map(([mapKey, placeholder]) => ({ value: mapKey.slice(prefix.length), placeholder }));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    key.fill(0);
    map.clear();
    labels.clear();
    bindings.clear();
    locations.length = 0;
  }

  function exportState() {
    requireLive();
    return Object.freeze({
      bindings: [...bindings].sort(([left], [right]) => left.localeCompare(right)).map((entry) => Object.freeze([...entry])),
      labels: [...labels].sort(([left], [right]) => left.localeCompare(right)).map((entry) => Object.freeze([...entry]))
    });
  }

  return Object.freeze({
    assign, lookup, remember, rememberEphemeral, entriesForKind, exportState, dispose, locations,
    get counts() { return Object.freeze({ ...counts }); }
  });
}

module.exports = {
  SECRET_BYTES, CONTRACT_VERSION, canonicalValue, base32, placeholderForDigest, createBatchPseudonymRegistry
};
