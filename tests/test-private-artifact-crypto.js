'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const {
  ENVELOPE_VERSION, HEADER_BYTES, createPrivateArtifactCrypto
} = require('../plugins/data-secure/server/gateway/private-artifact-crypto');

const { test, done, assert } = createSuite('Private artifact crypto facade');

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-artifact-'));
}

function memorySecretStore(options = {}) {
  const key = options.key || crypto.randomBytes(32);
  const keyId = options.keyId || 'a'.repeat(32);
  const generations = new Map();
  const pending = new Map();
  const id = (binding) => `${binding.purpose}\0${binding.objectId}`;
  return {
    prepareWrite(binding) {
      const generation = (generations.get(id(binding)) || 0) + 1;
      const token = Symbol('pending generation');
      pending.set(id(binding), token);
      return {
        key: Buffer.from(key), keyId, generation,
        commit() {
          if (pending.get(id(binding)) !== token) throw new Error('invalid transaction');
          generations.set(id(binding), generation); pending.delete(id(binding));
        },
        abort() { if (pending.get(id(binding)) === token) pending.delete(id(binding)); }
      };
    },
    resolveRead(binding, metadata) {
      if (metadata.keyId !== keyId || metadata.generation !== generations.get(id(binding))) {
        const error = new Error('stale or unknown artifact');
        error.code = 'PRIVATE_ARTIFACT_REPLAY_REJECTED';
        throw error;
      }
      const resolved = Buffer.from(options.readKey || key);
      if (options.onResolveKey) options.onResolveKey(resolved);
      return resolved;
    },
    generations, pending
  };
}

function createFacade(directory, options = {}) {
  return createPrivateArtifactCrypto({ privateRoot: directory, ...options });
}

function withFixture(action) {
  const directory = temporaryDirectory();
  try { return action(directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('AES-256-GCM envelope round-trips without persisting plaintext', () => withFixture((directory) => {
  const store = memorySecretStore();
  const facade = createFacade(directory, { secretStore: store });
  const target = path.join(directory, 'private.bin');
  const source = Buffer.from('Patientin Erika Mustermann, IBAN DE02120300000000202051');
  const receipt = facade.writeEncrypted(target, source, { purpose: 'review', objectId: 'object-17' });
  assert.deepStrictEqual(receipt, { version: ENVELOPE_VERSION, keyId: 'a'.repeat(32), generation: 1 });
  assert.strictEqual(fs.readFileSync(target).includes(source), false);
  assert.deepStrictEqual(facade.readEncrypted(target, { purpose: 'review', objectId: 'object-17' }), source);
}));

test('purpose and object AAD bindings reject cross-object replay', () => withFixture((directory) => {
  const store = memorySecretStore();
  const facade = createFacade(directory, { secretStore: store });
  const target = path.join(directory, 'private.bin');
  facade.writeEncrypted(target, 'secret', { purpose: 'review', objectId: 'object-a' });
  store.generations.set('review\0object-b', 1);
  store.generations.set('output\0object-a', 1);
  assert.throws(() => facade.readEncrypted(target, { purpose: 'review', objectId: 'object-b' }),
    (error) => error.code === 'PRIVATE_ARTIFACT_AUTH_FAILED');
  assert.throws(() => facade.readEncrypted(target, { purpose: 'output', objectId: 'object-a' }),
    (error) => error.code === 'PRIVATE_ARTIFACT_AUTH_FAILED');
}));

test('E0 refuses a second generation and keeps the first envelope readable', () => withFixture((directory) => {
  const store = memorySecretStore();
  const facade = createFacade(directory, { secretStore: store });
  const target = path.join(directory, 'private.bin');
  const binding = { purpose: 'output', objectId: 'object-a' };
  facade.writeEncrypted(target, 'first', binding);
  assert.throws(() => facade.writeEncrypted(path.join(directory, 'new-private.bin'), 'second', binding),
    (error) => error.code === 'PRIVATE_ARTIFACT_ROTATION_REQUIRED');
  assert.strictEqual(facade.readEncrypted(target, binding).toString(), 'first');
}));

test('E0 is create-only so a failed or accidental rotation cannot replace a durable artifact', () => withFixture((directory) => {
  const store = memorySecretStore();
  const facade = createFacade(directory, { secretStore: store });
  const target = path.join(directory, 'private.bin');
  const binding = { purpose: 'review', objectId: 'object-a' };
  facade.writeEncrypted(target, 'durable', binding);
  const original = fs.readFileSync(target);
  assert.throws(() => facade.writeEncrypted(target, 'replacement', binding),
    (error) => error.code === 'PRIVATE_ARTIFACT_ALREADY_EXISTS');
  assert.deepStrictEqual(fs.readFileSync(target), original);
  assert.strictEqual(store.generations.get('review\0object-a'), 1);
}));

test('tampering, truncation and a wrong key all fail closed', () => withFixture((directory) => {
  const key = crypto.randomBytes(32);
  const store = memorySecretStore({ key });
  const facade = createFacade(directory, { secretStore: store });
  const target = path.join(directory, 'private.bin');
  const binding = { purpose: 'review', objectId: 'object-a' };
  facade.writeEncrypted(target, 'sensitive payload', binding);
  const original = fs.readFileSync(target);
  const tampered = Buffer.from(original);
  tampered[tampered.length - 1] ^= 1;
  fs.writeFileSync(target, tampered);
  assert.throws(() => facade.readEncrypted(target, binding), (error) => error.code === 'PRIVATE_ARTIFACT_AUTH_FAILED');
  fs.writeFileSync(target, original.subarray(0, HEADER_BYTES - 1));
  assert.throws(() => facade.readEncrypted(target, binding), (error) => error.code === 'PRIVATE_ARTIFACT_ENVELOPE_INVALID');
  fs.writeFileSync(target, original);
  const wrong = createFacade(directory, { secretStore: memorySecretStore({ key, readKey: crypto.randomBytes(32) }) });
  const wrongTarget = path.join(directory, 'wrong-key.bin');
  wrong.writeEncrypted(wrongTarget, 'sensitive payload', binding);
  assert.throws(() => wrong.readEncrypted(wrongTarget, binding), (error) => error.code === 'PRIVATE_ARTIFACT_AUTH_FAILED');
}));

test('unsupported version and algorithm never reach decryption', () => withFixture((directory) => {
  const store = memorySecretStore();
  const facade = createFacade(directory, { secretStore: store });
  const target = path.join(directory, 'private.bin');
  const binding = { purpose: 'review', objectId: 'object-a' };
  facade.writeEncrypted(target, 'secret', binding);
  const envelope = fs.readFileSync(target);
  envelope[8] = 2;
  fs.writeFileSync(target, envelope);
  assert.throws(() => facade.readEncrypted(target, binding),
    (error) => error.code === 'PRIVATE_ARTIFACT_VERSION_UNSUPPORTED');
  envelope[8] = 1;
  envelope[9] = 2;
  fs.writeFileSync(target, envelope);
  assert.throws(() => facade.readEncrypted(target, binding),
    (error) => error.code === 'PRIVATE_ARTIFACT_ALGORITHM_UNSUPPORTED');
}));

test('secret store is mandatory and malformed keys never fall back', () => {
  assert.throws(() => createPrivateArtifactCrypto({ privateRoot: path.resolve('.') }),
    (error) => error.code === 'PRIVATE_ARTIFACT_SECRET_STORE_REQUIRED');
  let malformedAborted = false;
  const malformedKey = Buffer.alloc(31, 7);
  const malformedStore = {
    prepareWrite: () => ({ key: malformedKey, keyId: 'a'.repeat(32), generation: 1,
      commit() {}, abort() { malformedAborted = true; } }),
    resolveRead() {}
  };
  withFixture((directory) => assert.throws(
    () => createFacade(directory, { secretStore: malformedStore })
      .writeEncrypted(path.join(directory, 'private.bin'), 'secret', { purpose: 'review', objectId: 'a' }),
    (error) => error.code === 'PRIVATE_ARTIFACT_SECRET_INVALID'
  ));
  assert.strictEqual(malformedAborted, true);
  assert.ok(malformedKey.every((byte) => byte === 0));
  const unavailableStore = {
      prepareWrite() { throw new Error('backend path and native detail'); },
      resolveRead() { throw new Error('backend path and native detail'); }
  };
  withFixture((directory) => assert.throws(
    () => createFacade(directory, { secretStore: unavailableStore }).writeEncrypted(path.join(directory, 'private.bin'), 'secret', { purpose: 'review', objectId: 'a' }),
    (error) => error.code === 'PRIVATE_ARTIFACT_SECRET_UNAVAILABLE' && !error.message.includes('backend')
  ));
});

test('write uses exclusive temp, file fsync, create-only hardlink and parent fsync in order', () => withFixture((directory) => {
  const calls = [];
  const io = { ...fs, constants: fs.constants };
  const parentDescriptor = 987654;
  io.openSync = (...args) => {
    calls.push(['open', args[0], args[1]]);
    if (args[0] === directory && args[1] === fs.constants.O_RDONLY) return parentDescriptor;
    return fs.openSync(...args);
  };
  io.fsyncSync = (fd) => { calls.push(['fsync', fd]); return fd === parentDescriptor ? undefined : fs.fsyncSync(fd); };
  io.closeSync = (fd) => fd === parentDescriptor ? undefined : fs.closeSync(fd);
  io.linkSync = (...args) => { calls.push(['link', ...args]); return fs.linkSync(...args); };
  const facade = createFacade(directory, { secretStore: memorySecretStore(), fs: io, platform: 'linux' });
  const target = path.join(directory, 'private.bin');
  facade.writeEncrypted(target, 'secret', { purpose: 'review', objectId: 'a' });
  const linkIndex = calls.findIndex((call) => call[0] === 'link');
  assert.ok(calls[0][2] & fs.constants.O_EXCL);
  assert.ok(calls.findIndex((call) => call[0] === 'fsync') < linkIndex);
  assert.ok(calls.findIndex((call, index) => index > linkIndex && call[0] === 'fsync') > linkIndex);
}));

test('failed publication removes the exclusive temp and leaves no plaintext file', () => withFixture((directory) => {
  const io = { ...fs, constants: fs.constants };
  io.linkSync = () => { throw new Error('injected link failure'); };
  const facade = createFacade(directory, { secretStore: memorySecretStore(), fs: io });
  const target = path.join(directory, 'private.bin');
  assert.throws(() => facade.writeEncrypted(target, 'secret', { purpose: 'review', objectId: 'a' }));
  assert.deepStrictEqual(fs.readdirSync(directory), []);
}));

test('a target created during publication is never replaced', () => withFixture((directory) => {
  const io = { ...fs, constants: fs.constants };
  const target = path.join(directory, 'private.bin');
  const sentinel = Buffer.from('concurrent-writer');
  io.linkSync = (temporary, destination) => {
    fs.writeFileSync(destination, sentinel, { flag: 'wx' });
    return fs.linkSync(temporary, destination);
  };
  const store = memorySecretStore();
  const facade = createFacade(directory, { secretStore: store, fs: io });
  assert.throws(() => facade.writeEncrypted(target, 'must-not-replace', { purpose: 'review', objectId: 'race' }),
    (error) => error.code === 'PRIVATE_ARTIFACT_ALREADY_EXISTS');
  assert.deepStrictEqual(fs.readFileSync(target), sentinel);
  assert.strictEqual(store.generations.has('review\0race'), false);
}));

test('a failed first publication aborts and can be retried as generation one', () => withFixture((directory) => {
  const store = memorySecretStore();
  const binding = { purpose: 'review', objectId: 'transactional' };
  const io = { ...fs, constants: fs.constants, linkSync() { throw new Error('injected link failure'); } };
  assert.throws(() => createFacade(directory, { secretStore: store, fs: io })
    .writeEncrypted(path.join(directory, 'failed.bin'), 'failed-first', binding),
  (error) => error.code === 'PRIVATE_ARTIFACT_WRITE_FAILED');
  assert.strictEqual(store.pending.size, 0);
  assert.strictEqual(store.generations.has('review\0transactional'), false);
  const retried = path.join(directory, 'retried.bin');
  const facade = createFacade(directory, { secretStore: store });
  facade.writeEncrypted(retried, 'durable-retry', binding);
  assert.strictEqual(store.generations.get('review\0transactional'), 1);
  assert.strictEqual(facade.readEncrypted(retried, binding).toString(), 'durable-retry');
}));

test('private root containment and opened-versus-named identity are enforced', () => withFixture((directory) => {
  const facade = createFacade(directory, { secretStore: memorySecretStore() });
  assert.throws(() => facade.writeEncrypted(path.join(path.dirname(directory), 'outside.bin'), 'secret',
    { purpose: 'review', objectId: 'outside' }), (error) => error.code === 'PRIVATE_ARTIFACT_PATH_INVALID');

  const target = path.join(directory, 'private.bin');
  const store = memorySecretStore();
  createFacade(directory, { secretStore: store }).writeEncrypted(target, 'secret', { purpose: 'review', objectId: 'identity' });
  const io = { ...fs, constants: fs.constants };
  let targetLstats = 0;
  io.lstatSync = (candidate) => {
    const stat = fs.lstatSync(candidate);
    if (candidate === target && ++targetLstats >= 2) return { ...stat, ino: stat.ino === 0 ? 1 : 0,
      isFile: () => true, isSymbolicLink: () => false };
    return stat;
  };
  assert.throws(() => createFacade(directory, { secretStore: store, fs: io })
    .readEncrypted(target, { purpose: 'review', objectId: 'identity' }),
  (error) => error.code === 'PRIVATE_ARTIFACT_PATH_INVALID');
}));

test('a private root beneath a symlink or junction ancestor is rejected', () => withFixture((directory) => {
  const outside = temporaryDirectory();
  const redirectedRoot = path.join(outside, 'root');
  fs.mkdirSync(redirectedRoot);
  const link = path.join(directory, 'redirect');
  try {
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => createPrivateArtifactCrypto({
      privateRoot: path.join(link, 'root'), secretStore: memorySecretStore()
    }), (error) => error.code === 'PRIVATE_ARTIFACT_ROOT_INVALID');
    assert.deepStrictEqual(fs.readdirSync(redirectedRoot), []);
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
}));

test('short writes, fsync failures and close failures stop before publication', () => {
  for (const fault of ['write', 'fsync', 'close']) withFixture((directory) => {
    const io = { ...fs, constants: fs.constants };
    let closeFailed = false;
    if (fault === 'write') io.writeSync = () => 0;
    if (fault === 'fsync') io.fsyncSync = () => { throw new Error('injected fsync failure'); };
    if (fault === 'close') io.closeSync = (fd) => {
      if (!closeFailed) { closeFailed = true; throw new Error('injected close failure'); }
      return fs.closeSync(fd);
    };
    const facade = createFacade(directory, { secretStore: memorySecretStore(), fs: io });
    const target = path.join(directory, 'private.bin');
    assert.throws(() => facade.writeEncrypted(target, 'secret', { purpose: 'review', objectId: 'a' }),
      (error) => error.code === 'PRIVATE_ARTIFACT_WRITE_FAILED' && !error.message.includes('injected'));
    assert.strictEqual(fs.existsSync(target), false);
  });
});

test('parent fsync failure reports durability uncertainty and preserves the published ciphertext', () => withFixture((directory) => {
  const io = { ...fs, constants: fs.constants };
  const parentDescriptor = 987655;
  io.openSync = (...args) => {
    if (args[0] === directory && args[1] === fs.constants.O_RDONLY) return parentDescriptor;
    return fs.openSync(...args);
  };
  io.closeSync = (fd) => fd === parentDescriptor ? undefined : fs.closeSync(fd);
  io.fsyncSync = (fd) => {
    if (fd === parentDescriptor) throw new Error('injected parent fsync failure');
    return fs.fsyncSync(fd);
  };
  const store = memorySecretStore();
  const facade = createFacade(directory, { secretStore: store, fs: io, platform: 'linux' });
  const target = path.join(directory, 'private.bin');
  const binding = { purpose: 'review', objectId: 'a' };
  assert.throws(() => facade.writeEncrypted(target, 'secret', binding),
    (error) => error.code === 'PRIVATE_ARTIFACT_DURABILITY_UNCERTAIN' && !error.message.includes('injected'));
  assert.strictEqual(fs.existsSync(target), true);
  assert.strictEqual(store.generations.has('review\0a'), false);
  assert.strictEqual(store.pending.size, 1);
  assert.throws(() => facade.readEncrypted(target, binding),
    (error) => error.code === 'PRIVATE_ARTIFACT_REPLAY_REJECTED');
}));

test('an asynchronous secret commit never reports success', () => withFixture((directory) => {
  const store = memorySecretStore();
  const originalPrepare = store.prepareWrite.bind(store);
  store.prepareWrite = (binding) => {
    const record = originalPrepare(binding);
    record.commit = () => Promise.reject(new Error('asynchronous backend failure'));
    return record;
  };
  const target = path.join(directory, 'private.bin');
  assert.throws(() => createFacade(directory, { secretStore: store }).writeEncrypted(target, 'secret',
    { purpose: 'review', objectId: 'async' }),
  (error) => error.code === 'PRIVATE_ARTIFACT_DURABILITY_UNCERTAIN' && !error.message.includes('backend'));
  assert.strictEqual(fs.existsSync(target), true);
  assert.strictEqual(store.generations.has('review\0async'), false);
}));

test('invalid randomness and plaintext above the configured limit fail before publication', () => withFixture((directory) => {
  const target = path.join(directory, 'private.bin');
  const binding = { purpose: 'review', objectId: 'a' };
  const badRandom = createFacade(directory, { secretStore: memorySecretStore(), randomBytes: () => Buffer.alloc(11) });
  assert.throws(() => badRandom.writeEncrypted(target, 'secret', binding),
    (error) => error.code === 'PRIVATE_ARTIFACT_RANDOM_INVALID');
  const limited = createFacade(directory, { secretStore: memorySecretStore(), maxBytes: 3 });
  assert.throws(() => limited.writeEncrypted(target, Buffer.from('four'), binding),
    (error) => error.code === 'PRIVATE_ARTIFACT_TOO_LARGE');
  assert.throws(() => limited.writeEncrypted(target, { raw: 'secret' }, binding),
    (error) => error.code === 'PRIVATE_ARTIFACT_INPUT_INVALID');
  assert.strictEqual(fs.existsSync(target), false);
}));

test('owned sensitive buffers are wiped best-effort without modifying caller buffers', () => withFixture((directory) => {
  const wiped = [];
  const source = Buffer.from('caller-owned');
  const facade = createFacade(directory, {
    secretStore: memorySecretStore(),
    wipeBuffer(buffer) { buffer.fill(0); wiped.push(buffer); }
  });
  const target = path.join(directory, 'private.bin');
  facade.writeEncrypted(target, source, { purpose: 'review', objectId: 'a' });
  assert.strictEqual(source.toString(), 'caller-owned');
  assert.ok(wiped.length >= 6);
  assert.ok(wiped.every((buffer) => buffer.every((byte) => byte === 0)));
}));

test('resolved read keys are wiped on both successful and failed authentication', () => withFixture((directory) => {
  const key = crypto.randomBytes(32);
  const observed = [];
  const store = memorySecretStore({ key, onResolveKey(buffer) { observed.push(buffer); } });
  const binding = { purpose: 'review', objectId: 'wipe-read' };
  const target = path.join(directory, 'private.bin');
  const facade = createFacade(directory, { secretStore: store });
  facade.writeEncrypted(target, 'secret', binding);
  assert.strictEqual(facade.readEncrypted(target, binding).toString(), 'secret');
  const envelope = fs.readFileSync(target);
  envelope[envelope.length - 1] ^= 1;
  fs.writeFileSync(target, envelope);
  assert.throws(() => facade.readEncrypted(target, binding), (error) => error.code === 'PRIVATE_ARTIFACT_AUTH_FAILED');
  assert.strictEqual(observed.length, 2);
  assert.ok(observed.every((buffer) => buffer.every((byte) => byte === 0)));
}));

done();
