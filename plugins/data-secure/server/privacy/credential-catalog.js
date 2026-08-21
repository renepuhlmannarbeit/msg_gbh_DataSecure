'use strict';

const catalog = require('./credential-catalog.json');

const CATALOG_SCHEMA_VERSION = 'credential-catalog/1';
const TOP_LEVEL_FIELDS = new Set(['schema_version', 'entries']);
const ENTRY_FIELDS = new Set([
  'id', 'display_name', 'aliases', 'category', 'codes', 'reference_url', 'reference_verified'
]);
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CATEGORY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CODE_RE = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

function normalizeCatalogKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('de-DE');
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function rejectUnknownFields(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new TypeError(`${label} has unknown field(s): ${unknown.join(', ')}`);
}

function validateCredentialCatalog(value) {
  assertPlainObject(value, 'credential catalog');
  rejectUnknownFields(value, TOP_LEVEL_FIELDS, 'credential catalog');
  if (value.schema_version !== CATALOG_SCHEMA_VERSION) {
    throw new TypeError(`unsupported credential catalog schema: ${String(value.schema_version)}`);
  }
  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    throw new TypeError('credential catalog entries must be a non-empty array');
  }

  const ids = new Set();
  const aliases = new Map();
  const codes = new Map();
  value.entries.forEach((entry, index) => {
    const label = `credential catalog entry ${index + 1}`;
    assertPlainObject(entry, label);
    rejectUnknownFields(entry, ENTRY_FIELDS, label);
    if (!ID_RE.test(String(entry.id || ''))) throw new TypeError(`${label} has an invalid id`);
    if (ids.has(entry.id)) throw new TypeError(`duplicate credential catalog id: ${entry.id}`);
    ids.add(entry.id);
    if (typeof entry.display_name !== 'string' || !entry.display_name.trim()) {
      throw new TypeError(`${label} has no display_name`);
    }
    if (!CATEGORY_RE.test(String(entry.category || ''))) throw new TypeError(`${label} has an invalid category`);
    if (!Array.isArray(entry.aliases) || entry.aliases.length === 0) {
      throw new TypeError(`${label} aliases must be a non-empty array`);
    }
    if (!Array.isArray(entry.codes)) throw new TypeError(`${label} codes must be an array`);

    for (const alias of entry.aliases) {
      if (typeof alias !== 'string' || !alias.trim()) throw new TypeError(`${label} has an empty alias`);
      const key = normalizeCatalogKey(alias);
      if (aliases.has(key) && aliases.get(key) !== entry.id) {
        throw new TypeError(`credential alias collision: ${JSON.stringify(alias)} (${aliases.get(key)}, ${entry.id})`);
      }
      aliases.set(key, entry.id);
    }
    for (const code of entry.codes) {
      if (typeof code !== 'string' || !CODE_RE.test(code)) {
        throw new TypeError(`${label} has an unsafe code literal: ${JSON.stringify(code)}`);
      }
      const key = normalizeCatalogKey(code);
      if (codes.has(key)) {
        throw new TypeError(`credential code collision: ${JSON.stringify(code)} (${codes.get(key)}, ${entry.id})`);
      }
      codes.set(key, entry.id);
    }

    const hasUrl = Object.prototype.hasOwnProperty.call(entry, 'reference_url');
    const hasVerified = Object.prototype.hasOwnProperty.call(entry, 'reference_verified');
    if (hasUrl) {
      let parsed;
      try { parsed = new URL(entry.reference_url); } catch { throw new TypeError(`${label} has an invalid reference_url`); }
      if (parsed.protocol !== 'https:') throw new TypeError(`${label} reference_url must use https`);
      if (entry.reference_verified !== true) {
        throw new TypeError(`${label} reference_url requires reference_verified: true`);
      }
    } else if (hasVerified) {
      throw new TypeError(`${label} reference_verified is only valid with reference_url`);
    }
  });
  return value;
}

function escapeRegexLiteral(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function literalAlternation(values) {
  return [...values]
    .sort((a, b) => b.length - a.length || a.localeCompare(b, 'de'))
    .map(escapeRegexLiteral)
    .join('|');
}

function compileCatalogMatchers(value) {
  validateCredentialCatalog(value);
  const issuerAliases = value.entries.flatMap((entry) => entry.aliases);
  const codeLiterals = value.entries.flatMap((entry) => entry.codes);
  const before = '(?<![\\p{L}\\p{N}_])';
  const after = '(?![\\p{L}\\p{N}_])';
  return {
    issuer: new RegExp(`${before}(?:${literalAlternation(issuerAliases)})${after}`, 'iu'),
    code: new RegExp(`${before}(?:${literalAlternation(codeLiterals)})(?:[- ][A-Z0-9]+)*${after}`, 'u')
  };
}

validateCredentialCatalog(catalog);
const matchers = compileCatalogMatchers(catalog);

module.exports = {
  catalog,
  matchers,
  CATALOG_SCHEMA_VERSION,
  normalizeCatalogKey,
  validateCredentialCatalog,
  compileCatalogMatchers
};
