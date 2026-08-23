'use strict';

// Pilot adapter for BL-030.2.  It deliberately has no file, environment or
// self-encryption fallback: a resumable batch must not start unless the native
// OS credential store is usable.  The runtime does not call this adapter until
// a locked, bundled keyring has passed the target-platform evidence gates.

const SECRET_BYTES = 32;
const KEYRING_PACKAGE = '@napi-rs/keyring';
const SERVICE_NAME = 'de.msg.datasecure.batch-pseudonym.v1';
const BATCH_TOKEN_RE = /^[a-f0-9]{64}$/u;
const ENCODED_SECRET_RE = /^[A-Za-z0-9_-]{43}$/u;

function fail(message, code = 'BATCH_SECRET_STORE_UNAVAILABLE') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function accountForBatch(batchToken) {
  const value = String(batchToken || '');
  if (!BATCH_TOKEN_RE.test(value)) throw fail('Ungültige lokale Stapelkennung.', 'BATCH_SECRET_STORE_INPUT_INVALID');
  return `batch-v1-${value}`;
}

function loadNativeKeyring(options = {}) {
  const load = options.load || ((name) => require(name));
  try {
    const module = load(KEYRING_PACKAGE);
    if (!module || typeof module.Entry !== 'function') {
      return { available: false, reason: 'native_keyring_api_invalid' };
    }
    return { available: true, Entry: module.Entry };
  } catch {
    return { available: false, reason: 'native_keyring_unavailable' };
  }
}

function createBatchSecretStore(batchToken, options = {}) {
  const account = accountForBatch(batchToken);
  const native = loadNativeKeyring(options);
  if (!native.available) {
    throw fail('Der lokale Betriebssystem-Schlüsselspeicher ist nicht verfügbar. Der fortsetzbare Stapel wurde nicht begonnen.');
  }
  let entry;
  try {
    entry = new native.Entry(SERVICE_NAME, account);
  } catch {
    throw fail('Der lokale Betriebssystem-Schlüsselspeicher ist nicht verfügbar. Der fortsetzbare Stapel wurde nicht begonnen.');
  }
  if (!entry || typeof entry.setPassword !== 'function' || typeof entry.getPassword !== 'function' ||
    typeof entry.deletePassword !== 'function') {
    throw fail('Der lokale Betriebssystem-Schlüsselspeicher besitzt nicht die erforderliche Schnittstelle.');
  }

  return Object.freeze({
    availability: Object.freeze({ available: true, backend: 'native_os_keyring' }),
    set(secret) {
      if (!Buffer.isBuffer(secret) || secret.length !== SECRET_BYTES) {
        throw fail('Der lokale Stapel-Secret hat nicht die erwartete Länge.', 'BATCH_SECRET_STORE_INPUT_INVALID');
      }
      const copy = Buffer.from(secret);
      try {
        entry.setPassword(copy.toString('base64url'));
      } catch {
        throw fail('Der lokale Betriebssystem-Schlüsselspeicher konnte den Stapel-Secret nicht speichern.');
      } finally {
        copy.fill(0);
      }
    },
    get() {
      let encoded;
      try {
        encoded = entry.getPassword();
      } catch {
        throw fail('Der lokale Betriebssystem-Schlüsselspeicher konnte den Stapel-Secret nicht lesen.');
      }
      if (typeof encoded !== 'string' || !ENCODED_SECRET_RE.test(encoded)) {
        throw fail('Der lokale Stapel-Secret fehlt oder ist ungültig.', 'BATCH_SECRET_STORE_MISSING');
      }
      const secret = Buffer.from(encoded, 'base64url');
      if (secret.length !== SECRET_BYTES) {
        secret.fill(0);
        throw fail('Der lokale Stapel-Secret fehlt oder ist ungültig.', 'BATCH_SECRET_STORE_MISSING');
      }
      return secret;
    },
    remove() {
      try {
        entry.deletePassword();
      } catch {
        throw fail('Der lokale Betriebssystem-Schlüsselspeicher konnte den Stapel-Secret nicht löschen.');
      }
    }
  });
}

module.exports = {
  SECRET_BYTES,
  KEYRING_PACKAGE,
  SERVICE_NAME,
  accountForBatch,
  loadNativeKeyring,
  createBatchSecretStore
};
