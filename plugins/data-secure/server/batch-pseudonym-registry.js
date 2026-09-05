'use strict';

// V1 retains HMAC-derived labels for existing batches and the plugin. New
// Standalone V2 batches reserve readable labels against the same private HMAC
// identity mechanism. Only digests and label reservations are persisted beside
// the batch seed. Raw aliases remain action-local and are disposed afterward.

const crypto = require('crypto');

const SECRET_BYTES = 32;
const CONTRACT_VERSION = 'batch-pseudonym/v1';
const READABLE_CONTRACT_VERSION = 'batch-pseudonym/v2';
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PREFIX = Object.freeze({
  PERSON: 'PERSON',
  ORG: 'ORGANISATION',
  CUSTOMER: 'KUNDE',
  PROJECT: 'PROJEKT'
});
const READABLE_PREFIX = Object.freeze({ PERSON: 'PERSON', ORG: 'UNTERNEHMEN', PROJECT: 'PROJEKT' });
const READABLE_LABEL_RE = /^\[(PERSON|UNTERNEHMEN|PROJEKT|PERSON_UNKLAR|UNTERNEHMEN_UNKLAR|PROJEKT_UNKLAR)_(\d{3,5})\]$/u;

function validPersistedLabel(placeholder, contractVersion) {
  if (contractVersion === READABLE_CONTRACT_VERSION) {
    const match = READABLE_LABEL_RE.exec(placeholder);
    return Boolean(match && Number(match[2]) >= 1 && Number(match[2]) <= 10000 &&
      match[2] === String(Number(match[2])).padStart(3, '0'));
  }
  return /^\[(?:PERSON|ORGANISATION|KUNDE|PROJEKT)_[A-Z2-7]{10,52}\]$/u.test(placeholder);
}

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
  const contractVersion = options.contractVersion || CONTRACT_VERSION;
  const readable = contractVersion === READABLE_CONTRACT_VERSION;
  if (![CONTRACT_VERSION, READABLE_CONTRACT_VERSION].includes(contractVersion)) {
    key.fill(0);
    throw inputError('Die Pseudonym-Vertragsversion ist ungültig.');
  }
  const rulesetVersion = String(options.rulesetVersion || 'de-business/2');
  if (!/^[a-z0-9][a-z0-9._/-]{0,63}$/u.test(rulesetVersion)) {
    key.fill(0);
    throw inputError('Die Pseudonym-Regelversion ist ungültig.');
  }
  const map = new Map(); // ephemeral raw aliases for the current document only
  const bindings = new Map(); // keyed HMAC(alias) -> placeholder; safe to persist privately
  const labels = new Map(); // placeholder -> full HMAC, never raw entity value
  const digestLabels = new Map(); // one reservation per identity, including ambiguous aliases
  const sequences = new Map(); // reconstructed from reservations, never reset on resume
  const counts = { PERSON: 0, ORG: 0, CUSTOMER: 0, PROJECT: 0 };
  const locations = [];
  let disposed = false;

  function aliasId(kind, canonical) {
    return crypto.createHmac('sha256', key)
      .update(`${contractVersion}\u0000${rulesetVersion}\u0000alias\u0000${kind}\u0000${canonical}`, 'utf8')
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
        if (!Array.isArray(pair) || pair.length !== 2 || !validPersistedLabel(placeholder, contractVersion) ||
            !/^[A-Za-z0-9_-]{43}$/u.test(digestId) || labels.has(placeholder) ||
            (readable && digestLabels.has(digestId))) {
          throw inputError('Der persistierte Pseudonymzustand ist ungültig.');
        }
        const digest = Buffer.from(digestId, 'base64url');
        try {
          if (digest.length !== 32 || digest.toString('base64url') !== digestId ||
              (!readable && !base32(digest).startsWith(placeholder.slice(placeholder.lastIndexOf('_') + 1, -1)))) {
            throw inputError('Der persistierte Pseudonymzustand ist ungültig.');
          }
        } finally { digest.fill(0); }
        labels.set(placeholder, digestId);
        if (readable) {
          digestLabels.set(digestId, placeholder);
          const match = READABLE_LABEL_RE.exec(placeholder);
          sequences.set(match[1], Math.max(sequences.get(match[1]) || 0, Number(match[2])));
        }
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
    digestLabels.clear();
    sequences.clear();
    throw error;
  }

  function requireLive() {
    if (disposed) throw inputError('Der lokale Stapel-Pseudonymkontext wurde bereits gelöscht.');
  }

  // A customer's or employer's role belongs to its field label. The same
  // organisation must keep its identity when that role changes in another
  // Standalone document. V1 keeps its original namespaces for old outputs.
  function entityKind(kind) { return readable && kind === 'CUSTOMER' ? 'ORG' : kind; }

  function reserve(kind, digest, ambiguous = false) {
    if (!readable) return placeholderForDigest(kind, digest, labels);
    const digestId = digest.toString('base64url');
    const existing = digestLabels.get(digestId);
    if (existing) return { placeholder: existing, digestId };
    if (labels.size >= 10000) throw inputError('Der lokale Stapel-Pseudonymzustand ist vollständig belegt.');
    const prefix = READABLE_PREFIX[kind] + (ambiguous ? '_UNKLAR' : '');
    const next = (sequences.get(prefix) || 0) + 1;
    if (next > 10000) throw inputError('Der lokale Stapel-Pseudonymzustand ist vollständig belegt.');
    const placeholder = `[${prefix}_${String(next).padStart(3, '0')}]`;
    sequences.set(prefix, next);
    digestLabels.set(digestId, placeholder);
    return { placeholder, digestId };
  }

  function assertAliasCapacity(alias) {
    if (readable && !bindings.has(alias) && bindings.size >= 10000) {
      throw inputError('Der lokale Stapel-Pseudonymzustand ist vollständig belegt.');
    }
  }

  function assign(kind, value) {
    requireLive();
    if (!Object.hasOwn(PREFIX, kind)) throw inputError('Der Entitätstyp ist im Pseudonymvertrag nicht zugelassen.');
    kind = entityKind(kind);
    const canonical = canonicalValue(value);
    const mapKey = `${kind}:${canonical}`;
    const existing = map.get(mapKey);
    if (existing) return existing;
    const bound = bindings.get(aliasId(kind, canonical));
    if (bound) {
      map.set(mapKey, bound);
      return bound;
    }
    assertAliasCapacity(aliasId(kind, canonical));

    const digest = crypto.createHmac('sha256', key)
      .update(`${contractVersion}\u0000${rulesetVersion}\u0000${kind}\u0000${canonical}`, 'utf8')
      .digest();
    let derived;
    try { derived = reserve(kind, digest); }
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
    kind = entityKind(kind);
    const canonical = canonicalValue(value);
    const placeholder = map.get(`${kind}:${canonical}`) || bindings.get(aliasId(kind, canonical)) || null;
    // The current document's literal dictionary is built from this ephemeral
    // map. A persisted hit must hydrate it too, otherwise a company known from
    // document N disappears from the replacement dictionary in document N+1.
    if (placeholder) map.set(`${kind}:${canonical}`, placeholder);
    return placeholder;
  }
  function remember(kind, value, placeholder) {
    requireLive();
    if (!Object.hasOwn(PREFIX, kind) || !labels.has(String(placeholder))) {
      throw inputError('Der Pseudonym-Ableitungswert ist ungültig.');
    }
    kind = entityKind(kind);
    if (readable && !String(placeholder).startsWith(`[${READABLE_PREFIX[kind]}_`)) {
      throw inputError('Der Pseudonym-Ableitungswert ist ungültig.');
    }
    const canonical = canonicalValue(value);
    const alias = aliasId(kind, canonical);
    assertAliasCapacity(alias);
    const existing = bindings.get(alias);
    if (existing && existing !== String(placeholder)) {
      const digest = crypto.createHmac('sha256', key)
        .update(`${contractVersion}\u0000${rulesetVersion}\u0000ambiguous-alias\u0000${kind}\u0000${canonical}`, 'utf8')
        .digest();
      let ambiguous;
      try { ambiguous = reserve(kind, digest, true); }
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
    kind = entityKind(kind);
    map.set(`${kind}:${canonicalValue(value)}`, placeholder);
  }
  function entriesForKind(kind) {
    requireLive();
    if (!Object.hasOwn(PREFIX, kind)) throw inputError('Der Entitätstyp ist im Pseudonymvertrag nicht zugelassen.');
    kind = entityKind(kind);
    const prefix = `${kind}:`;
    return [...map].filter(([mapKey]) => mapKey.startsWith(prefix)).map(([mapKey, placeholder]) => ({ value: mapKey.slice(prefix.length), placeholder }));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    key.fill(0);
    map.clear();
    labels.clear();
    digestLabels.clear();
    sequences.clear();
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
    isKnownPlaceholder(value) { requireLive(); return labels.has(String(value)); },
    readable,
    get counts() { return Object.freeze({ ...counts }); }
  });
}

module.exports = {
  SECRET_BYTES, CONTRACT_VERSION, READABLE_CONTRACT_VERSION, validPersistedLabel,
  canonicalValue, base32, placeholderForDigest, createBatchPseudonymRegistry
};
