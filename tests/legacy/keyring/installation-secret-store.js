'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
// Historical test fixture only; never part of the Marketplace product tree.
const { hasReparseComponent } = require('../../../plugins/data-secure/server/gateway/common');
const { writeFully, syncParentDirectory } = require('../../../plugins/data-secure/server/gateway/batch-journal-io');

const SERVICE_NAME = 'de.msg.datasecure.private-artifacts.v1';
const ACCOUNT_NAME = 'installation-key-v1';
const KEY_BYTES = 32;
const ENCODED_KEY_RE = /^[A-Za-z0-9_-]{43}$/u;
const KEY_ID_RE = /^[a-f0-9]{32}$/u;
const STATE_SCHEMA = 'datasecure-private-key/1';
const COMMIT_SCHEMA = 'datasecure-private-artifact-commit/1';

function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function vendorRequire(baseDir = path.join(__dirname, 'vendor', 'keyring')) {
  return createRequire(path.join(baseDir, 'package.json'));
}

function loadNativeKeyring(options = {}) {
  const load = options.load || vendorRequire(options.vendorDir);
  try {
    const native = load('@napi-rs/keyring');
    if (!native || typeof native.Entry !== 'function') {
      return Object.freeze({ available: false, reason: 'native_keyring_api_invalid' });
    }
    return Object.freeze({ available: true, Entry: native.Entry });
  } catch {
    return Object.freeze({ available: false, reason: 'native_keyring_unavailable' });
  }
}

function decodeKey(value) {
  if (typeof value !== 'string' || !ENCODED_KEY_RE.test(value)) return null;
  const key = Buffer.from(value, 'base64url');
  if (key.length !== KEY_BYTES) {
    key.fill(0);
    return null;
  }
  return key;
}

function keyIdFor(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
}

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function createInstallationSecretStore(options = {}) {
  const io = options.fs || fs;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const platform = options.platform || process.platform;
  const reparseCheck = options.hasReparseComponent || hasReparseComponent;
  const privateRoot = path.resolve(String(options.privateRoot || ''));
  if (!path.isAbsolute(privateRoot)) {
    throw failure('PRIVATE_ARTIFACT_ROOT_REQUIRED', 'Eine absolute private Artefaktwurzel ist erforderlich.');
  }
  const native = options.Entry
    ? { available: true, Entry: options.Entry }
    : loadNativeKeyring(options);
  if (!native.available) {
    throw failure('PRIVATE_ARTIFACT_SECRET_UNAVAILABLE',
      'Der lokale Betriebssystem-Schlüsselspeicher ist nicht verfügbar. Es wurden keine Quelldaten übernommen.');
  }

  let entry;
  try { entry = new native.Entry(SERVICE_NAME, ACCOUNT_NAME); }
  catch {
    throw failure('PRIVATE_ARTIFACT_SECRET_UNAVAILABLE',
      'Der lokale Betriebssystem-Schlüsselspeicher ist nicht verfügbar. Es wurden keine Quelldaten übernommen.');
  }
  if (!entry || typeof entry.getPassword !== 'function' || typeof entry.setPassword !== 'function') {
    throw failure('PRIVATE_ARTIFACT_SECRET_INVALID', 'Der Betriebssystem-Schlüsselspeicher besitzt keine gültige Schnittstelle.');
  }

  const lockPath = path.join(privateRoot, '.private-artifact-key-init.lock');
  const statePath = path.join(privateRoot, '.private-artifact-key-state.json');
  const commitsDir = path.join(privateRoot, '.private-artifact-commits');
  const uncertainCommits = new Set();

  function assertSafeRoot() {
    try {
      const stat = io.lstatSync(privateRoot);
      if (!stat.isDirectory() || stat.isSymbolicLink() || reparseCheck(privateRoot)) throw new Error('unsafe');
    } catch {
      throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Die private Artefaktwurzel ist nicht sicher verwendbar.');
    }
  }

  function writeCreateOnly(target, value, mode = 0o600) {
    const payload = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
    let fd;
    let created = false;
    try {
      fd = io.openSync(target, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL, mode);
      created = true;
      writeFully(fd, payload, io);
      io.fsyncSync(fd);
      io.closeSync(fd); fd = undefined;
      syncParentDirectory(target, io, platform);
    } catch (error) {
      if (fd !== undefined) try { io.closeSync(fd); } catch { /* preserve primary error */ }
      if (created) {
        try { io.unlinkSync(target); } catch { /* uncertain publication remains fail-closed */ }
      }
      throw error;
    } finally {
      payload.fill(0);
    }
  }

  function readJsonFile(target, keys, code) {
    let fd;
    try {
      fd = io.openSync(target, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0));
      const opened = io.fstatSync(fd);
      const named = io.lstatSync(target);
      if (!opened.isFile() || !named.isFile() || named.isSymbolicLink() ||
          opened.dev !== named.dev || opened.ino !== named.ino || opened.size !== named.size ||
          opened.size <= 0 || opened.size > 4096) throw new Error('unsafe');
      const parsed = JSON.parse(io.readFileSync(fd, 'utf8'));
      if (!exactKeys(parsed, keys)) throw new Error('shape');
      return parsed;
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw failure(code, 'Private Schlüssel- oder Commitmetadaten sind ungültig.');
    } finally {
      if (fd !== undefined) try { io.closeSync(fd); } catch { /* read already fails closed */ }
    }
  }

  function readState() {
    const state = readJsonFile(statePath, ['schema', 'generation', 'key_id'], 'PRIVATE_ARTIFACT_SECRET_INVALID');
    if (!state) return null;
    if (state.schema !== STATE_SCHEMA || state.generation !== 1 || !KEY_ID_RE.test(String(state.key_id || ''))) {
      throw failure('PRIVATE_ARTIFACT_SECRET_INVALID', 'Die lokale Schlüsselbindung ist ungültig.');
    }
    return state;
  }

  function readKey() {
    let encoded;
    try { encoded = entry.getPassword(); }
    catch {
      throw failure('PRIVATE_ARTIFACT_SECRET_UNAVAILABLE', 'Der private Installationsschlüssel konnte nicht gelesen werden.');
    }
    return decodeKey(encoded);
  }

  function validateKeyAgainstState(key, state) {
    if (!key) {
      throw failure('PRIVATE_ARTIFACT_SECRET_LOST',
        'Der Betriebssystem-Schlüsselspeicher enthält den gebundenen Installationsschlüssel nicht mehr. Es wird kein Ersatzschlüssel erzeugt.');
    }
    const actual = keyIdFor(key);
    const expected = Buffer.from(state.key_id, 'ascii');
    const observed = Buffer.from(actual, 'ascii');
    if (!crypto.timingSafeEqual(expected, observed)) {
      key.fill(0);
      throw failure('PRIVATE_ARTIFACT_SECRET_MISMATCH', 'Der private Installationsschlüssel passt nicht zur lokalen Installation.');
    }
    return key;
  }

  function persistStateForKey(key) {
    const state = Object.freeze({ schema: STATE_SCHEMA, generation: 1, key_id: keyIdFor(key) });
    try { writeCreateOnly(statePath, state); }
    catch (error) {
      if (error?.code === 'EEXIST') return validateKeyAgainstState(key, readState());
      throw failure('PRIVATE_ARTIFACT_SECRET_DURABILITY_UNCERTAIN',
        'Die lokale Bindung des Installationsschlüssels konnte nicht dauerhaft bestätigt werden.');
    }
    return key;
  }

  function initializeKey() {
    let fd;
    let key;
    try {
      fd = io.openSync(lockPath, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL, 0o600);
      io.writeSync(fd, Buffer.from(`${process.pid}\n`, 'ascii'));
      io.fsyncSync(fd);
    } catch (error) {
      if (fd !== undefined) try { io.closeSync(fd); } catch { /* preserve primary error */ }
      if (error?.code === 'EEXIST') {
        throw failure('PRIVATE_ARTIFACT_SECRET_INITIALIZATION_BUSY',
          'Der private Installationsschlüssel wird bereits initialisiert. Bitte den Lauf erneut starten.');
      }
      throw failure('PRIVATE_ARTIFACT_SECRET_UNAVAILABLE', 'Der private Installationsschlüssel konnte nicht sicher initialisiert werden.');
    }
    try {
      const state = readState();
      if (state) return validateKeyAgainstState(readKey(), state);
      const existing = readKey();
      if (existing) return persistStateForKey(existing);
      key = randomBytes(KEY_BYTES);
      if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
        throw failure('PRIVATE_ARTIFACT_RANDOM_INVALID', 'Kein sicherer Installationsschlüssel verfügbar.');
      }
      try { entry.setPassword(key.toString('base64url')); }
      catch {
        throw failure('PRIVATE_ARTIFACT_SECRET_UNAVAILABLE', 'Der private Installationsschlüssel konnte nicht gespeichert werden.');
      }
      const confirmed = readKey();
      if (!confirmed || !crypto.timingSafeEqual(key, confirmed)) {
        confirmed?.fill(0);
        throw failure('PRIVATE_ARTIFACT_SECRET_DURABILITY_UNCERTAIN',
          'Die dauerhafte Speicherung des privaten Installationsschlüssels konnte nicht bestätigt werden.');
      }
      key.fill(0);
      key = confirmed;
      return persistStateForKey(key);
    } finally {
      if (fd !== undefined) try { io.closeSync(fd); } catch { /* next read remains fail closed */ }
      try { io.unlinkSync(lockPath); } catch { /* a stale marker blocks a new initialization */ }
    }
  }

  function obtainKeyForWrite() {
    assertSafeRoot();
    const state = readState();
    if (state) return validateKeyAgainstState(readKey(), state);
    return initializeKey();
  }

  function obtainKeyForRead() {
    assertSafeRoot();
    const state = readState();
    if (!state) {
      throw failure('PRIVATE_ARTIFACT_SECRET_NOT_INITIALIZED',
        'Für dieses private Artefakt existiert keine gebundene Installationsschlüssel-Metadatei.');
    }
    return validateKeyAgainstState(readKey(), state);
  }

  function bindingDigest(binding, keyId, generation) {
    if (!binding || typeof binding.purpose !== 'string' || typeof binding.objectId !== 'string') {
      throw failure('PRIVATE_ARTIFACT_SECRET_INVALID', 'Die private Artefaktbindung ist ungültig.');
    }
    return crypto.createHash('sha256')
      .update(COMMIT_SCHEMA).update('\0').update(binding.purpose).update('\0').update(binding.objectId)
      .update('\0').update(keyId).update('\0').update(String(generation)).digest('hex');
  }

  function ensureCommitDirectory() {
    assertSafeRoot();
    if (!io.existsSync(commitsDir)) io.mkdirSync(commitsDir, { recursive: false, mode: 0o700 });
    const stat = io.lstatSync(commitsDir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || reparseCheck(commitsDir)) {
      throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Die privaten Commitmetadaten sind nicht sicher verwendbar.');
    }
  }

  function commitRecord(binding, keyId, generation) {
    ensureCommitDirectory();
    const digest = bindingDigest(binding, keyId, generation);
    const target = path.join(commitsDir, `${digest}.json`);
    const value = Object.freeze({ schema: COMMIT_SCHEMA, generation, key_id: keyId, binding_sha256: digest });
    try { writeCreateOnly(target, value); }
    catch (error) {
      if (error?.code === 'EEXIST') {
        const existing = readJsonFile(target, ['schema', 'generation', 'key_id', 'binding_sha256'], 'PRIVATE_ARTIFACT_SECRET_INVALID');
        if (existing?.schema === COMMIT_SCHEMA && existing.generation === generation &&
            existing.key_id === keyId && existing.binding_sha256 === digest) return;
      }
      uncertainCommits.add(digest);
      throw failure('PRIVATE_ARTIFACT_SECRET_DURABILITY_UNCERTAIN',
        'Die Commitbindung des privaten Artefakts konnte nicht dauerhaft bestätigt werden.');
    }
    uncertainCommits.delete(digest);
  }

  function requireCommit(binding, keyId, generation) {
    const digest = bindingDigest(binding, keyId, generation);
    if (uncertainCommits.has(digest)) {
      throw failure('PRIVATE_ARTIFACT_SECRET_DURABILITY_UNCERTAIN',
        'Die Commitbindung des privaten Artefakts ist in diesem Prozess ungewiss.');
    }
    ensureCommitDirectory();
    const target = path.join(commitsDir, `${digest}.json`);
    const record = readJsonFile(target, ['schema', 'generation', 'key_id', 'binding_sha256'], 'PRIVATE_ARTIFACT_SECRET_INVALID');
    if (!record || record.schema !== COMMIT_SCHEMA || record.generation !== generation ||
        record.key_id !== keyId || record.binding_sha256 !== digest) {
      throw failure('PRIVATE_ARTIFACT_SECRET_UNCOMMITTED', 'Das private Artefakt besitzt keine bestätigte Commitbindung.');
    }
  }

  function ensureReady() {
    const key = obtainKeyForWrite();
    const result = Object.freeze({ available: true, backend: 'native_os_keyring', keyId: keyIdFor(key), generation: 1 });
    key.fill(0);
    return result;
  }

  function prepareWrite(binding) {
    const key = obtainKeyForWrite();
    const keyId = keyIdFor(key);
    if (!KEY_ID_RE.test(keyId)) {
      key.fill(0);
      throw failure('PRIVATE_ARTIFACT_SECRET_INVALID', 'Der private Installationsschlüssel ist ungültig.');
    }
    let closed = false;
    return Object.freeze({
      key,
      keyId,
      generation: 1,
      commit() {
        if (closed) throw failure('PRIVATE_ARTIFACT_SECRET_INVALID', 'Die private Schreibtransaktion ist bereits abgeschlossen.');
        commitRecord(binding, keyId, 1);
        closed = true;
      },
      abort() { closed = true; }
    });
  }

  function resolveRead(binding, metadata) {
    if (metadata?.generation !== 1 || !KEY_ID_RE.test(String(metadata?.keyId || ''))) {
      throw failure('PRIVATE_ARTIFACT_SECRET_INVALID', 'Die Schlüsselbindung des privaten Artefakts ist ungültig.');
    }
    requireCommit(binding, metadata.keyId, metadata.generation);
    const key = obtainKeyForRead();
    const actual = keyIdFor(key);
    const expected = Buffer.from(metadata.keyId, 'ascii');
    const observed = Buffer.from(actual, 'ascii');
    if (!crypto.timingSafeEqual(expected, observed)) {
      key.fill(0);
      throw failure('PRIVATE_ARTIFACT_SECRET_MISMATCH', 'Der private Installationsschlüssel passt nicht zum Artefakt.');
    }
    return key;
  }

  return Object.freeze({ ensureReady, prepareWrite, resolveRead });
}

module.exports = Object.freeze({
  SERVICE_NAME,
  ACCOUNT_NAME,
  KEY_BYTES,
  STATE_SCHEMA,
  COMMIT_SCHEMA,
  loadNativeKeyring,
  createInstallationSecretStore
});
