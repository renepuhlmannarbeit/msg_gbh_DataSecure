'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { writeFully, syncParentDirectory } = require('./batch-journal-io');

const MAGIC = Buffer.from('DSARTF01', 'ascii');
const ENVELOPE_VERSION = 1;
const ALGORITHM_AES_256_GCM = 1;
const KEY_BYTES = 32;
const KEY_ID_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + 1 + 1 + 4 + KEY_ID_BYTES + NONCE_BYTES + TAG_BYTES;
const KEY_ID_RE = /^[a-f0-9]{32}$/u;
const PURPOSE_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateBinding(binding) {
  if (!binding || typeof binding !== 'object' || !PURPOSE_RE.test(String(binding.purpose || '')) ||
    typeof binding.objectId !== 'string' || binding.objectId.length === 0 ||
    Buffer.byteLength(binding.objectId, 'utf8') > 512) {
    throw failure('PRIVATE_ARTIFACT_BINDING_INVALID', 'Ungültige Bindung des privaten Artefakts.');
  }
  return Object.freeze({ purpose: binding.purpose, objectId: binding.objectId });
}

function validateKeyRecord(record) {
  if (!record || typeof record !== 'object' || !Buffer.isBuffer(record.key) || record.key.length !== KEY_BYTES ||
    !KEY_ID_RE.test(String(record.keyId || '')) || !Number.isSafeInteger(record.generation) ||
    record.generation < 1 || record.generation > 0xffffffff ||
    typeof record.commit !== 'function' || typeof record.abort !== 'function') {
    throw failure('PRIVATE_ARTIFACT_SECRET_INVALID', 'Der Secret-Store lieferte keinen gültigen Artefaktschlüssel.');
  }
}

function buildAad(binding, keyId, generation) {
  const purpose = Buffer.from(binding.purpose, 'utf8');
  const objectId = Buffer.from(binding.objectId, 'utf8');
  const aad = Buffer.allocUnsafe(MAGIC.length + 1 + 1 + 4 + 2 + purpose.length + 2 + objectId.length + KEY_ID_BYTES);
  let offset = 0;
  MAGIC.copy(aad, offset); offset += MAGIC.length;
  aad[offset++] = ENVELOPE_VERSION;
  aad[offset++] = ALGORITHM_AES_256_GCM;
  aad.writeUInt32BE(generation, offset); offset += 4;
  aad.writeUInt16BE(purpose.length, offset); offset += 2;
  purpose.copy(aad, offset); offset += purpose.length;
  aad.writeUInt16BE(objectId.length, offset); offset += 2;
  objectId.copy(aad, offset); offset += objectId.length;
  aad.write(keyId, offset, KEY_ID_BYTES, 'ascii');
  purpose.fill(0);
  objectId.fill(0);
  return aad;
}

function parseEnvelope(envelope, maxBytes) {
  if (!Buffer.isBuffer(envelope) || envelope.length < HEADER_BYTES || envelope.length > HEADER_BYTES + maxBytes) {
    throw failure('PRIVATE_ARTIFACT_ENVELOPE_INVALID', 'Das verschlüsselte Artefakt ist unvollständig oder zu groß.');
  }
  if (!envelope.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw failure('PRIVATE_ARTIFACT_ENVELOPE_INVALID', 'Das verschlüsselte Artefakt besitzt kein gültiges Format.');
  }
  let offset = MAGIC.length;
  const version = envelope[offset++];
  const algorithm = envelope[offset++];
  if (version !== ENVELOPE_VERSION) {
    throw failure('PRIVATE_ARTIFACT_VERSION_UNSUPPORTED', 'Die Artefakt-Version wird nicht unterstützt.');
  }
  if (algorithm !== ALGORITHM_AES_256_GCM) {
    throw failure('PRIVATE_ARTIFACT_ALGORITHM_UNSUPPORTED', 'Der Artefakt-Algorithmus wird nicht unterstützt.');
  }
  const generation = envelope.readUInt32BE(offset); offset += 4;
  const keyId = envelope.toString('ascii', offset, offset + KEY_ID_BYTES); offset += KEY_ID_BYTES;
  if (generation < 1 || !KEY_ID_RE.test(keyId)) {
    throw failure('PRIVATE_ARTIFACT_ENVELOPE_INVALID', 'Das verschlüsselte Artefakt besitzt ungültige Metadaten.');
  }
  const nonce = Buffer.from(envelope.subarray(offset, offset + NONCE_BYTES)); offset += NONCE_BYTES;
  const tag = Buffer.from(envelope.subarray(offset, offset + TAG_BYTES)); offset += TAG_BYTES;
  const ciphertext = Buffer.from(envelope.subarray(offset));
  return { generation, keyId, nonce, tag, ciphertext };
}

function sameIdentity(left, right) {
  return left && right && left.dev === right.dev && left.ino === right.ino;
}

function createPathGuard(privateRoot, io) {
  if (typeof privateRoot !== 'string' || !path.isAbsolute(privateRoot)) {
    throw failure('PRIVATE_ARTIFACT_ROOT_REQUIRED', 'Eine absolute private Artefaktwurzel ist erforderlich.');
  }
  const root = path.resolve(privateRoot);
  let rootIdentity;
  try {
    const volumeRoot = path.parse(root).root;
    let cursor = volumeRoot;
    const rootRelative = path.relative(volumeRoot, root);
    for (const component of rootRelative ? rootRelative.split(path.sep) : []) {
      cursor = path.join(cursor, component);
      const componentStat = io.lstatSync(cursor);
      if (componentStat.isSymbolicLink()) throw new Error('linked root ancestor');
    }
    const nativeRealpath = io.realpathSync.native || io.realpathSync;
    const realRoot = nativeRealpath(root);
    if (path.relative(root, realRoot) !== '' || path.relative(realRoot, root) !== '') {
      throw new Error('redirected root');
    }
    const named = io.lstatSync(root);
    const resolved = io.statSync(root);
    if (!named.isDirectory() || named.isSymbolicLink() || !resolved.isDirectory() || !sameIdentity(named, resolved)) {
      throw new Error('unsafe root');
    }
    rootIdentity = { dev: resolved.dev, ino: resolved.ino };
  } catch {
    throw failure('PRIVATE_ARTIFACT_ROOT_INVALID', 'Die private Artefaktwurzel ist nicht sicher.');
  }

  function validate(target) {
    if (typeof target !== 'string' || !path.isAbsolute(target)) {
      throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Der Artefaktpfad muss absolut sein.');
    }
    const resolvedTarget = path.resolve(target);
    const relative = path.relative(root, resolvedTarget);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Der Artefaktpfad liegt außerhalb der privaten Wurzel.');
    }
    try {
      const currentRoot = io.lstatSync(root);
      if (!currentRoot.isDirectory() || currentRoot.isSymbolicLink() || !sameIdentity(currentRoot, rootIdentity)) {
        throw new Error('root changed');
      }
      let cursor = root;
      const parentRelative = path.relative(root, path.dirname(resolvedTarget));
      for (const component of parentRelative ? parentRelative.split(path.sep) : []) {
        if (!component || component === '.' || component === '..') throw new Error('bad component');
        cursor = path.join(cursor, component);
        const named = io.lstatSync(cursor);
        const resolved = io.statSync(cursor);
        if (!named.isDirectory() || named.isSymbolicLink() || !resolved.isDirectory() || !sameIdentity(named, resolved)) {
          throw new Error('unsafe ancestor');
        }
      }
    } catch (error) {
      if (error && typeof error.code === 'string' && error.code.startsWith('PRIVATE_ARTIFACT_')) throw error;
      throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Das Artefaktverzeichnis ist nicht sicher.');
    }
    return resolvedTarget;
  }
  return validate;
}

function ensureSafeTarget(target, io, validatePath, requireAbsent = false) {
  target = validatePath(target);
  try {
    const existing = io.lstatSync(target);
    if (requireAbsent) {
      throw failure('PRIVATE_ARTIFACT_ALREADY_EXISTS', 'Ein privates Artefakt darf in diesem Schnitt nicht ersetzt werden.');
    }
    if (!existing.isFile() || existing.isSymbolicLink()) {
      throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Das Artefaktziel ist nicht sicher.');
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') return target;
    if (error && typeof error.code === 'string' && error.code.startsWith('PRIVATE_ARTIFACT_')) throw error;
    throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Das Artefaktziel ist nicht sicher.');
  }
  return target;
}

function createPrivateArtifactCrypto(options = {}) {
  const io = options.fs || fs;
  const secretStore = options.secretStore;
  const platform = options.platform || process.platform;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const wipeBuffer = options.wipeBuffer || ((buffer) => buffer.fill(0));
  const maxBytes = options.maxBytes === undefined ? DEFAULT_MAX_BYTES : options.maxBytes;
  if (!secretStore || typeof secretStore.prepareWrite !== 'function' || typeof secretStore.resolveRead !== 'function') {
    throw failure('PRIVATE_ARTIFACT_SECRET_STORE_REQUIRED', 'Ein sicherer Secret-Store ist erforderlich.');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw failure('PRIVATE_ARTIFACT_LIMIT_INVALID', 'Die Artefaktgrenze ist ungültig.');
  }
  const validatePath = createPathGuard(options.privateRoot, io);

  function wipe(...buffers) {
    for (const buffer of buffers) {
      if (!Buffer.isBuffer(buffer)) continue;
      try { wipeBuffer(buffer); } catch { /* best effort */ }
    }
  }

  function rejectAsyncResult(result) {
    if (!result || typeof result.then !== 'function') return;
    if (typeof result.catch === 'function') result.catch(() => {});
    throw failure('PRIVATE_ARTIFACT_SECRET_INVALID', 'Asynchrone Secret-Stores werden nicht unterstützt.');
  }

  function abortPrepared(record) {
    if (!record || typeof record.abort !== 'function') return;
    try {
      const result = record.abort();
      rejectAsyncResult(result);
      if (result !== undefined) throw failure('PRIVATE_ARTIFACT_SECRET_INVALID', 'Der Secret-Store-Vertrag ist ungültig.');
    } catch { /* pending reservations remain unusable */ }
  }

  function assertParentIdentity(target, expected) {
    validatePath(target);
    try {
      const current = io.lstatSync(path.dirname(target));
      if (!current.isDirectory() || current.isSymbolicLink() || !sameIdentity(current, expected)) throw new Error('parent changed');
    } catch {
      throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Das Artefaktverzeichnis wurde während der Operation ausgetauscht.');
    }
  }

  function writeEncrypted(target, plaintext, bindingInput) {
    const binding = validateBinding(bindingInput);
    target = ensureSafeTarget(target, io, validatePath, true);
    if (!Buffer.isBuffer(plaintext) && typeof plaintext !== 'string') {
      throw failure('PRIVATE_ARTIFACT_INPUT_INVALID', 'Das private Artefakt besitzt keinen gültigen Byteinhalt.');
    }
    const ownedPlaintext = Buffer.isBuffer(plaintext) ? Buffer.from(plaintext) : Buffer.from(plaintext, 'utf8');
    if (ownedPlaintext.length > maxBytes) {
      wipe(ownedPlaintext);
      throw failure('PRIVATE_ARTIFACT_TOO_LARGE', 'Das private Artefakt überschreitet die lokale Größenbegrenzung.');
    }
    let record;
    try { record = secretStore.prepareWrite(binding); }
    catch (error) {
      wipe(ownedPlaintext);
      if (error && typeof error.code === 'string' && error.code.startsWith('PRIVATE_ARTIFACT_')) throw error;
      throw failure('PRIVATE_ARTIFACT_SECRET_UNAVAILABLE', 'Der sichere Artefaktschlüssel ist nicht verfügbar.');
    }
    if (record && typeof record.then === 'function') {
      wipe(ownedPlaintext);
      throw failure('PRIVATE_ARTIFACT_SECRET_INVALID', 'Asynchrone Secret-Stores werden nicht unterstützt.');
    }
    try { validateKeyRecord(record); }
    catch (error) {
      wipe(record?.key);
      abortPrepared(record);
      throw error;
    }
    if (record.generation !== 1) {
      wipe(record.key);
      abortPrepared(record);
      throw failure('PRIVATE_ARTIFACT_ROTATION_REQUIRED', 'Weitere Artefaktgenerationen benötigen den Rotationsvertrag.');
    }
    const key = Buffer.from(record.key);
    wipe(record.key);
    let aad;
    let nonce;
    let ciphertext;
    let tag;
    let envelope;
    let temp;
    let fd;
    let published = false;
    let committed = false;
    let parentIdentity;
    try {
      parentIdentity = io.lstatSync(path.dirname(target));
      nonce = randomBytes(NONCE_BYTES);
      if (!Buffer.isBuffer(nonce) || nonce.length !== NONCE_BYTES) {
        throw failure('PRIVATE_ARTIFACT_RANDOM_INVALID', 'Keine sichere Nonce verfügbar.');
      }
      aad = buildAad(binding, record.keyId, record.generation);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
      cipher.setAAD(aad, { plaintextLength: ownedPlaintext.length });
      ciphertext = Buffer.concat([cipher.update(ownedPlaintext), cipher.final()]);
      tag = cipher.getAuthTag();
      envelope = Buffer.allocUnsafe(HEADER_BYTES + ciphertext.length);
      let offset = 0;
      MAGIC.copy(envelope, offset); offset += MAGIC.length;
      envelope[offset++] = ENVELOPE_VERSION;
      envelope[offset++] = ALGORITHM_AES_256_GCM;
      envelope.writeUInt32BE(record.generation, offset); offset += 4;
      envelope.write(record.keyId, offset, KEY_ID_BYTES, 'ascii'); offset += KEY_ID_BYTES;
      nonce.copy(envelope, offset); offset += NONCE_BYTES;
      tag.copy(envelope, offset); offset += TAG_BYTES;
      ciphertext.copy(envelope, offset);

      const suffixBytes = randomBytes(12);
      if (!Buffer.isBuffer(suffixBytes) || suffixBytes.length !== 12) {
        throw failure('PRIVATE_ARTIFACT_RANDOM_INVALID', 'Keine sichere Tempkennung verfügbar.');
      }
      const suffix = suffixBytes.toString('hex');
      wipe(suffixBytes);
      temp = path.join(path.dirname(target), `.${path.basename(target)}.${suffix}.tmp`);
      fd = io.openSync(temp, io.constants.O_WRONLY | io.constants.O_CREAT | io.constants.O_EXCL, 0o600);
      const openTemp = io.fstatSync(fd);
      const namedTemp = io.lstatSync(temp);
      if (!openTemp.isFile() || !namedTemp.isFile() || namedTemp.isSymbolicLink() || !sameIdentity(openTemp, namedTemp)) {
        throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Die private Tempdatei ist nicht sicher.');
      }
      writeFully(fd, envelope, io);
      io.fsyncSync(fd);
      io.closeSync(fd); fd = undefined;
      assertParentIdentity(target, parentIdentity);
      io.linkSync(temp, target);
      published = true;
      assertParentIdentity(target, parentIdentity);
      const publishedStat = io.lstatSync(target);
      const tempStat = io.lstatSync(temp);
      if (!publishedStat.isFile() || publishedStat.isSymbolicLink() || !sameIdentity(publishedStat, tempStat)) {
        throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Das veröffentlichte Artefakt ist nicht sicher gebunden.');
      }
      io.unlinkSync(temp); temp = undefined;
      syncParentDirectory(target, io, platform);
      const commitResult = record.commit();
      rejectAsyncResult(commitResult);
      if (commitResult !== undefined) {
        throw failure('PRIVATE_ARTIFACT_SECRET_INVALID', 'Der Secret-Store-Vertrag ist ungültig.');
      }
      committed = true;
      return Object.freeze({ version: ENVELOPE_VERSION, keyId: record.keyId, generation: record.generation });
    } catch (error) {
      if (published) {
        throw failure('PRIVATE_ARTIFACT_DURABILITY_UNCERTAIN',
          'Das Artefakt wurde veröffentlicht, seine Verzeichnis-Dauerhaftigkeit ist jedoch ungewiss.');
      }
      if (error && typeof error.code === 'string' && error.code.startsWith('PRIVATE_ARTIFACT_')) throw error;
      if (error && error.code === 'EEXIST') {
        throw failure('PRIVATE_ARTIFACT_ALREADY_EXISTS', 'Ein privates Artefakt darf in diesem Schnitt nicht ersetzt werden.');
      }
      throw failure('PRIVATE_ARTIFACT_WRITE_FAILED', 'Das private Artefakt konnte nicht sicher veröffentlicht werden.');
    } finally {
      if (!published && !committed) {
        abortPrepared(record);
      }
      if (fd !== undefined) {
        try { io.closeSync(fd); } catch { /* preserve original error */ }
      }
      if (temp) {
        try { io.unlinkSync(temp); } catch { /* best effort for an unpublished temp */ }
      }
      wipe(ownedPlaintext, key, aad, nonce, ciphertext, tag, envelope);
    }
  }

  function readEncrypted(target, bindingInput) {
    const binding = validateBinding(bindingInput);
    target = ensureSafeTarget(target, io, validatePath);
    let fd;
    let envelope;
    let parsed;
    let key;
    let aad;
    let first;
    let plaintext;
    let parentIdentity;
    try {
      parentIdentity = io.lstatSync(path.dirname(target));
      assertParentIdentity(target, parentIdentity);
      const noFollow = io.constants.O_NOFOLLOW || 0;
      fd = io.openSync(target, io.constants.O_RDONLY | noFollow);
      const stat = io.fstatSync(fd);
      const namedBefore = io.lstatSync(target);
      if (!namedBefore.isFile() || namedBefore.isSymbolicLink() || !sameIdentity(stat, namedBefore)) {
        throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Das private Artefakt wurde während des Öffnens ausgetauscht.');
      }
      if (!stat.isFile() || stat.size < HEADER_BYTES || stat.size > HEADER_BYTES + maxBytes) {
        throw failure('PRIVATE_ARTIFACT_ENVELOPE_INVALID', 'Das verschlüsselte Artefakt ist unvollständig oder zu groß.');
      }
      envelope = Buffer.allocUnsafe(stat.size);
      let offset = 0;
      while (offset < envelope.length) {
        const count = io.readSync(fd, envelope, offset, envelope.length - offset, null);
        if (!Number.isSafeInteger(count) || count <= 0) {
          throw failure('PRIVATE_ARTIFACT_ENVELOPE_INVALID', 'Das verschlüsselte Artefakt ist unvollständig.');
        }
        offset += count;
      }
      const afterRead = io.fstatSync(fd);
      assertParentIdentity(target, parentIdentity);
      const namedAfter = io.lstatSync(target);
      if (!sameIdentity(stat, afterRead) || !sameIdentity(afterRead, namedAfter) || afterRead.size !== stat.size) {
        throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Das private Artefakt wurde während des Lesens ausgetauscht.');
      }
      io.closeSync(fd); fd = undefined;
      parsed = parseEnvelope(envelope, maxBytes);
      const resolved = secretStore.resolveRead(binding, Object.freeze({
        version: ENVELOPE_VERSION, keyId: parsed.keyId, generation: parsed.generation
      }));
      if (resolved && typeof resolved.then === 'function') {
        throw failure('PRIVATE_ARTIFACT_SECRET_INVALID', 'Asynchrone Secret-Stores werden nicht unterstützt.');
      }
      if (!Buffer.isBuffer(resolved) || resolved.length !== KEY_BYTES) {
        wipe(resolved);
        throw failure('PRIVATE_ARTIFACT_SECRET_INVALID', 'Der Secret-Store lieferte keinen gültigen Artefaktschlüssel.');
      }
      key = Buffer.from(resolved);
      wipe(resolved);
      aad = buildAad(binding, parsed.keyId, parsed.generation);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, parsed.nonce, { authTagLength: TAG_BYTES });
      decipher.setAAD(aad, { plaintextLength: parsed.ciphertext.length });
      decipher.setAuthTag(parsed.tag);
      first = decipher.update(parsed.ciphertext);
      plaintext = Buffer.concat([first, decipher.final()]);
      return plaintext;
    } catch (error) {
      wipe(first, plaintext);
      if (error && typeof error.code === 'string' && error.code.startsWith('PRIVATE_ARTIFACT_')) throw error;
      throw failure('PRIVATE_ARTIFACT_AUTH_FAILED', 'Das private Artefakt konnte nicht authentifiziert werden.');
    } finally {
      if (fd !== undefined) {
        try { io.closeSync(fd); } catch { /* preserve original error */ }
      }
      if (parsed) wipe(parsed.nonce, parsed.tag, parsed.ciphertext);
      wipe(envelope, key, aad, first);
    }
  }

  return Object.freeze({ writeEncrypted, readEncrypted });
}

module.exports = Object.freeze({
  ENVELOPE_VERSION,
  HEADER_BYTES,
  createPrivateArtifactCrypto
});
