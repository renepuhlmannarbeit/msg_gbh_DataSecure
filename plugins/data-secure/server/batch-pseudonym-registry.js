'use strict';

// In-memory half of BATCH_PSEUDONYM_V1. This module deliberately has no storage
// responsibility: callers receive the batch secret only from the separately
// gated native secret store and must dispose this registry when the batch ends.

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

function createBatchPseudonymRegistry(secret) {
  if (!Buffer.isBuffer(secret) || secret.length !== SECRET_BYTES) {
    throw inputError('Der lokale Stapel-Secret hat nicht die erwartete Länge.');
  }
  const key = Buffer.from(secret);
  const map = new Map(); // ephemeral aliases only; never serialize this map
  const labels = new Map(); // placeholder -> full HMAC, never raw entity value
  const counts = { PERSON: 0, ORG: 0, CUSTOMER: 0, PROJECT: 0 };
  const locations = [];
  let disposed = false;

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

    const digest = crypto.createHmac('sha256', key)
      .update(`${CONTRACT_VERSION}\u0000${kind}\u0000${canonical}`, 'utf8')
      .digest();
    let derived;
    try { derived = placeholderForDigest(kind, digest, labels); }
    finally { digest.fill(0); }
    labels.set(derived.placeholder, derived.digestId);
    map.set(mapKey, derived.placeholder);
    counts[kind] += 1;
    return derived.placeholder;
  }

  function lookup(kind, value) {
    requireLive();
    if (!Object.hasOwn(PREFIX, kind)) return null;
    return map.get(`${kind}:${canonicalValue(value)}`) || null;
  }
  function remember(kind, value, placeholder) {
    requireLive();
    if (!Object.hasOwn(PREFIX, kind) || !/^\[[A-Z_]+_[A-Z2-7]+\]$/u.test(String(placeholder))) throw inputError('Der Pseudonym-Ableitungswert ist ungültig.');
    map.set(`${kind}:${canonicalValue(value)}`, String(placeholder));
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
    locations.length = 0;
  }

  return Object.freeze({ assign, lookup, remember, entriesForKind, dispose, get counts() { return Object.freeze({ ...counts }); } });
}

module.exports = {
  SECRET_BYTES, CONTRACT_VERSION, canonicalValue, base32, placeholderForDigest, createBatchPseudonymRegistry
};
