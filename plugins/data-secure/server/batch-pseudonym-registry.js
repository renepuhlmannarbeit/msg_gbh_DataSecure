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
// At most 160 normalized characters, including separators: this also covers
// short legal company names containing more than ten individual words.
const KNOWN_ALIAS_MAX_CHARS = 160;
const KNOWN_ALIAS_MAX_TOKENS = KNOWN_ALIAS_MAX_CHARS;
const KNOWN_ALIAS_CACHE_SIZE = 8192;
// Pre-rc123 journals do not contain the attested first-token index. Their
// bindings are keyed HMACs, so that index cannot be reconstructed without the
// original aliases. Preserve exact matching for small resumptions, but stop
// before an attacker-controlled document can trigger millions of HMAC probes.
const LEGACY_ALIAS_PROBE_LIMIT = 50_000;
const LEGACY_EMPLOYER_ROLE = '[ARBEITGEBER_001]';
const { RESOURCE_LIMITS } = require('./resource-limits');
const { SafeError } = require('./runtime');
const KNOWN_ALIAS_INDEX_SCHEMA = 'datasecure-known-alias-index/1';
const ALIAS_TOKEN_SOURCE = "[\\p{L}\\p{M}\\p{N}]+(?:[&.'’+\\/-][\\p{L}\\p{M}\\p{N}]+)*\\.?|[^\\s]";

function validKnownAliasIndex(index) {
  return Boolean(index && Object.keys(index).sort().join(',') === 'attestation,schema,starts' &&
    index.schema === KNOWN_ALIAS_INDEX_SCHEMA && typeof index.attestation === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(index.attestation) &&
    Array.isArray(index.starts) && index.starts.length <= 10000 && new Set(index.starts).size === index.starts.length &&
    index.starts.every((value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(value)));
}

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

function capacityError() {
  const error = new Error('Die laufweite Grenze für eindeutige Identitäten oder deren Schreibweisen ist erreicht. Bitte einen kleineren neuen Lauf mit den verbleibenden Originaldateien beginnen.');
  error.code = 'BATCH_PSEUDONYM_CAPACITY_EXCEEDED';
  return error;
}

function textLimitError() {
  const error = new SafeError('Der Text oder eine bekannte Stapelkennung überschreitet die lokale Prüfgrenze.');
  error.code = 'TEXT_TOO_LARGE';
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
  const rulesetVersion = String(options.rulesetVersion || 'de-business/3');
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
  const knownStarts = new Set(); // HMAC(first token), never raw prefixes
  let completeStartIndex = false;
  let disposed = false;

  function aliasId(kind, canonical) {
    return crypto.createHmac('sha256', key)
      .update(`${contractVersion}\u0000${rulesetVersion}\u0000alias\u0000${kind}\u0000${canonical}`, 'utf8')
      .digest('base64url');
  }

  function identityDigest(namespace, kind, canonical) {
    return crypto.createHmac('sha256', key)
      .update(`${contractVersion}\u0000${rulesetVersion}\u0000${namespace}\u0000${kind}\u0000${canonical}`, 'utf8')
      .digest();
  }

  function indexAttestation(starts) {
    return crypto.createHmac('sha256', key).update(`${contractVersion}\u0000${rulesetVersion}\u0000${KNOWN_ALIAS_INDEX_SCHEMA}\u0000`, 'utf8')
      .update(JSON.stringify({ bindings: [...bindings].sort(([a], [b]) => a.localeCompare(b)), starts: [...starts].sort() }), 'utf8')
      .digest('base64url');
  }

  function knownStartId(canonical) {
    const first = new RegExp(ALIAS_TOKEN_SOURCE, 'u').exec(canonical)?.[0];
    return first ? aliasId('known-alias-start', first) : null;
  }

  function assertKnownAliasShape(kind, canonical) {
    if (!['PERSON', 'ORG', 'CUSTOMER'].includes(kind)) return null;
    if (canonical.length > KNOWN_ALIAS_MAX_CHARS) throw textLimitError();
    const start = completeStartIndex ? knownStartId(canonical) : null;
    if (start && !knownStarts.has(start) && knownStarts.size >= 10000) {
      throw capacityError();
    }
    return start;
  }

  function visibleBinding(kind, canonical, placeholder) {
    if (!placeholder || readable || kind !== 'ORG') return placeholder;
    // Private V1 role/ambiguity reservations are not new public identities.
    // Their HMAC domains are separate from ordinary ORG/PROJECT aliases.
    const ambiguous = identityDigest('ambiguous-alias', kind, canonical);
    try {
      if (labels.get(placeholder) === ambiguous.toString('base64url')) return '[ORGANISATION_UNKLAR]';
    } finally { ambiguous.fill(0); }
    if (bindings.get(aliasId('legacy-employer-role', canonical)) === placeholder) return LEGACY_EMPLOYER_ROLE;
    return bindings.get(aliasId('organization-display', canonical)) || placeholder;
  }

  const restored = options.persistedState;
  try {
    if (restored !== undefined) {
      if (!restored || !['bindings,labels', 'bindings,known_alias_index,labels'].includes(Object.keys(restored).sort().join(',')) ||
          !Array.isArray(restored.bindings) || !Array.isArray(restored.labels) ||
          restored.bindings.length > 10000 || restored.labels.length > 10000 ||
          (Object.hasOwn(restored, 'known_alias_index') && !validKnownAliasIndex(restored.known_alias_index))) {
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
    completeStartIndex = bindings.size === 0;
    if (restored?.known_alias_index && restored.known_alias_index.attestation === indexAttestation(restored.known_alias_index.starts)) {
      completeStartIndex = true;
      for (const value of restored.known_alias_index.starts) knownStarts.add(value);
    }
  } catch (error) {
    key.fill(0);
    map.clear();
    bindings.clear();
    labels.clear();
    digestLabels.clear();
    sequences.clear();
    knownStarts.clear();
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
    if (!readable) {
      const derived = placeholderForDigest(kind, digest, labels);
      if (!labels.has(derived.placeholder) && labels.size >= 10000) {
        throw capacityError();
      }
      return derived;
    }
    const digestId = digest.toString('base64url');
    const existing = digestLabels.get(digestId);
    if (existing) return { placeholder: existing, digestId };
    if (labels.size >= 10000) throw capacityError();
    const prefix = READABLE_PREFIX[kind] + (ambiguous ? '_UNKLAR' : '');
    const next = (sequences.get(prefix) || 0) + 1;
    if (next > 10000) throw capacityError();
    const placeholder = `[${prefix}_${String(next).padStart(3, '0')}]`;
    sequences.set(prefix, next);
    digestLabels.set(digestId, placeholder);
    return { placeholder, digestId };
  }

  function assertAliasCapacity(alias) {
    if (!bindings.has(alias) && bindings.size >= 10000) {
      throw capacityError();
    }
  }

  function assign(kind, value) {
    requireLive();
    if (!Object.hasOwn(PREFIX, kind)) throw inputError('Der Entitätstyp ist im Pseudonymvertrag nicht zugelassen.');
    kind = entityKind(kind);
    const canonical = canonicalValue(value);
    const start = assertKnownAliasShape(kind, canonical);
    const mapKey = `${kind}:${canonical}`;
    const existing = map.get(mapKey);
    if (existing) return existing;
    const bound = bindings.get(aliasId(kind, canonical));
    if (bound) {
      const visible = visibleBinding(kind, canonical, bound);
      map.set(mapKey, visible);
      return visible;
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
    if (start) knownStarts.add(start);
    counts[kind] += 1;
    return derived.placeholder;
  }

  function lookup(kind, value) {
    requireLive();
    if (!Object.hasOwn(PREFIX, kind)) return null;
    kind = entityKind(kind);
    const canonical = canonicalValue(value);
    const placeholder = map.get(`${kind}:${canonical}`) ||
      visibleBinding(kind, canonical, bindings.get(aliasId(kind, canonical))) || null;
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
    const start = assertKnownAliasShape(kind, canonical);
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
      bindings.set(alias, ambiguous.placeholder);
      if (start) knownStarts.add(start);
      map.set(`${kind}:${canonical}`, visibleBinding(kind, canonical, ambiguous.placeholder));
      return;
    }
    bindings.set(alias, String(placeholder));
    if (start) knownStarts.add(start);
    map.set(`${kind}:${canonical}`, visibleBinding(kind, canonical, String(placeholder)));
  }
  function rememberEphemeral(kind, value, placeholder) {
    requireLive();
    if (!Object.hasOwn(PREFIX, kind) || typeof placeholder !== 'string' || !placeholder) {
      throw inputError('Der Pseudonym-Ableitungswert ist ungültig.');
    }
    kind = entityKind(kind);
    map.set(`${kind}:${canonicalValue(value)}`, placeholder);
  }

  function rememberOrganizationAlias(value, identityValue, placeholder) {
    requireLive();
    const identity = canonicalValue(identityValue);
    const canonical = canonicalValue(value);
    const start = assertKnownAliasShape('ORG', canonical);
    if (identity.length > KNOWN_ALIAS_MAX_CHARS || canonical.length > KNOWN_ALIAS_MAX_CHARS) throw textLimitError();
    if (readable) {
      remember('ORG', value, placeholder);
      return lookup('ORG', value);
    }
    // One proven full spelling identifies the company, independently of its
    // legacy public employer/customer role. Neither a role label nor UNKLAR is
    // ever passed back to remember() as though it were an entity identity.
    if (placeholder !== LEGACY_EMPLOYER_ROLE &&
        !(labels.has(placeholder) && /^\[(?:ORGANISATION|KUNDE)_/u.test(placeholder))) {
      throw inputError('Der Pseudonym-Ableitungswert ist ungültig.');
    }
    const digest = crypto.createHmac('sha256', key)
      .update(`${contractVersion}\u0000${rulesetVersion}\u0000ORG\u0000${identity}`, 'utf8').digest();
    let reserved;
    try { reserved = reserve('ORG', digest); }
    finally { digest.fill(0); }
    const alias = aliasId('ORG', canonical);
    const roleId = aliasId('legacy-employer-role', canonical);
    const displayId = aliasId('organization-display', canonical);
    const prior = bindings.get(alias);
    let sameIdentity = !prior || prior === reserved.placeholder;
    // Old V1 journals stored the CUSTOMER identity directly in the ORG alias.
    // Upgrade only when that digest proves this exact full spelling, not by
    // comparing public role labels or guessing that equal short names merge.
    if (!sameIdentity) {
      const oldCustomer = crypto.createHmac('sha256', key)
        .update(`${contractVersion}\u0000${rulesetVersion}\u0000CUSTOMER\u0000${identity}`, 'utf8').digest();
      try { sameIdentity = labels.get(prior) === oldCustomer.toString('base64url'); }
      finally { oldCustomer.fill(0); }
    }
    let target = reserved;
    if (!sameIdentity && identity === canonical && prior) {
      // The field repeats an already-proven exact alias, merely with a new
      // role. Retain its known identity (or its existing ambiguity) instead of
      // creating a second company from that same short spelling.
      target = { placeholder: prior, digestId: labels.get(prior) };
    } else if (!sameIdentity) {
      const ambiguous = identityDigest('ambiguous-alias', 'ORG', canonical);
      try { target = reserve('ORG', ambiguous, true); }
      finally { ambiguous.fill(0); }
    }
    const presentationId = placeholder === LEGACY_EMPLOYER_ROLE ? roleId : displayId;
    const requiredAliases = [alias, presentationId].filter((id) => !bindings.has(id));
    const unusedPresentationId = placeholder === LEGACY_EMPLOYER_ROLE ? displayId : roleId;
    if (bindings.size + requiredAliases.length - Number(bindings.has(unusedPresentationId)) > 10000) {
      throw capacityError();
    }
    // All reservations/capacities are checked before the first mutation, so a
    // failed action's finally-export always remains a valid resumable journal.
    labels.set(target.placeholder, target.digestId);
    bindings.set(alias, target.placeholder);
    bindings.delete(unusedPresentationId);
    bindings.set(presentationId, placeholder === LEGACY_EMPLOYER_ROLE ? target.placeholder : placeholder);
    if (start) knownStarts.add(start);
    const visible = visibleBinding('ORG', canonical, target.placeholder);
    map.set(`ORG:${canonical}`, visible);
    return visible;
  }

  function matchKnownAliases(text) {
    requireLive();
    const input = String(text || '');
    if (input.length > RESOURCE_LIMITS.MAX_TEXT_CHARS) throw textLimitError();
    if (bindings.size === 0) return [];
    // This membership scan returns values, not source offsets. Normalize once
    // here instead of repeating Unicode/whitespace work for every short window.
    const src = input.normalize('NFC').replace(/\s+/gu, ' ');
    // Bounded exact membership probes, not an entity detector. No spelling is
    // learned unless its typed HMAC is already present in this batch. Unknown
    // words never call assign(), and the journal remains raw-value-free.
    const tokens = new RegExp(ALIAS_TOKEN_SOURCE, 'gu');
    const wordBoundary = /[\p{L}\p{N}_]/u;
    const window = [];
    const cache = new Map();
    const cacheOrder = new Array(KNOWN_ALIAS_CACHE_SIZE);
    let cacheCursor = 0;
    const matches = new Map();
    const startCache = new Map();
    const startOrder = new Array(KNOWN_ALIAS_CACHE_SIZE);
    let startCursor = 0;
    let legacyWork = 0;
    const isKnownStart = (token) => {
      if (!completeStartIndex) return true; // pre-index journals never silently lose aliases
      const value = token.toLowerCase();
      if (startCache.has(value)) return startCache.get(value);
      const hit = knownStarts.has(aliasId('known-alias-start', value));
      if (startOrder[startCursor] !== undefined) startCache.delete(startOrder[startCursor]);
      startOrder[startCursor] = value;
      startCursor = (startCursor + 1) % KNOWN_ALIAS_CACHE_SIZE;
      startCache.set(value, hit);
      return hit;
    };
    const visit = (start, end) => {
      // Count candidate windows, not only cache misses. Repeated input can
      // otherwise reuse one cached spelling while still forcing millions of
      // overlapping window visits in a pre-index journal.
      if (!completeStartIndex && ++legacyWork > LEGACY_ALIAS_PROBE_LIMIT) {
        const error = new SafeError('Der ältere Stapel kann mit diesem Dokument nicht mehr sicher und zeitnah fortgesetzt werden. Bitte die Originaldateien neu auswählen.');
        error.code = 'BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE';
        throw error;
      }
      if ((start > 0 && wordBoundary.test(src[start - 1])) ||
          (end < src.length && wordBoundary.test(src[end]))) return;
      const value = src.slice(start, end).toLowerCase();
      let hits = cache.get(value);
      if (!hits) {
        hits = [];
        for (const kind of ['PERSON', 'ORG']) {
          // value is already canonical; avoid three repeated locale/Unicode
          // normalisations per probe. Hydrate only positively known identities.
          const placeholder = map.get(`${kind}:${value}`) ||
            visibleBinding(kind, value, bindings.get(aliasId(kind, value)));
          if (placeholder) {
            map.set(`${kind}:${value}`, placeholder);
            hits.push({ kind, value, placeholder });
          }
        }
        if (cacheOrder[cacheCursor] !== undefined) cache.delete(cacheOrder[cacheCursor]);
        cacheOrder[cacheCursor] = value;
        cacheCursor = (cacheCursor + 1) % KNOWN_ALIAS_CACHE_SIZE;
        cache.set(value, hits);
      }
      for (const hit of hits) matches.set(`${hit.kind}:${hit.value}`, hit);
    };
    for (const token of src.matchAll(tokens)) {
      const start = token.index;
      const end = start + token[0].length;
      const previous = window[window.length - 1];
      if (previous && !/^\s*$/u.test(src.slice(previous.end, start))) window.length = 0;
      window.push({ start, end, known: isKnownStart(token[0]) || (token[0].endsWith('.') && isKnownStart(token[0].slice(0, -1))) });
      while (window.length && (window.length > KNOWN_ALIAS_MAX_TOKENS ||
          end - window[0].start > KNOWN_ALIAS_MAX_CHARS)) window.shift();
      for (const first of window) {
        if (!first.known) continue;
        visit(first.start, end);
        if (src[end - 1] === '.') visit(first.start, end - 1);
      }
    }
    return [...matches.values()];
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
    knownStarts.clear();
    locations.length = 0;
  }

  function exportState() {
    requireLive();
    return Object.freeze({
      bindings: [...bindings].sort(([left], [right]) => left.localeCompare(right)).map((entry) => Object.freeze([...entry])),
      labels: [...labels].sort(([left], [right]) => left.localeCompare(right)).map((entry) => Object.freeze([...entry])),
      ...(completeStartIndex ? { known_alias_index: Object.freeze({ schema: KNOWN_ALIAS_INDEX_SCHEMA,
        starts: [...knownStarts].sort(), attestation: indexAttestation(knownStarts) }) } : {})
    });
  }

  return Object.freeze({
    assign, lookup, remember, rememberEphemeral, rememberOrganizationAlias, matchKnownAliases,
    entriesForKind, exportState, dispose, locations,
    isKnownPlaceholder(value) { requireLive(); return labels.has(String(value)); },
    readable,
    get counts() { return Object.freeze({ ...counts }); }
  });
}

module.exports = {
  SECRET_BYTES, CONTRACT_VERSION, READABLE_CONTRACT_VERSION, validPersistedLabel,
  KNOWN_ALIAS_MAX_TOKENS, KNOWN_ALIAS_MAX_CHARS, KNOWN_ALIAS_INDEX_SCHEMA, validKnownAliasIndex,
  LEGACY_ALIAS_PROBE_LIMIT,
  canonicalValue, base32, placeholderForDigest, createBatchPseudonymRegistry
};
