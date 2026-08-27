'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');
const {
  SERVICE_NAME,
  ACCOUNT_NAME,
  loadNativeKeyring,
  createInstallationSecretStore
} = require('../plugins/data-secure/server/gateway/installation-secret-store');

const { test, done, assert } = createSuite('Installation secret store');

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-install-key-'));
  const values = options.values || new Map();
  class Entry {
    constructor(service, account) {
      assert.strictEqual(service, SERVICE_NAME);
      assert.strictEqual(account, ACCOUNT_NAME);
    }
    getPassword() {
      if (options.getError) throw new Error('locked');
      return values.get('key') ?? null;
    }
    setPassword(value) {
      if (options.setError) throw new Error('locked');
      values.set('key', options.replaceOnSet || value);
    }
  }
  return {
    root,
    values,
    store: createInstallationSecretStore({
      privateRoot: root,
      Entry,
      fs: options.fs || fs,
      randomBytes: options.randomBytes || (() => Buffer.alloc(32, 0x2a))
    }),
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); }
  };
}

test('missing native keyring fails closed without a fallback', () => {
  assert.deepStrictEqual(loadNativeKeyring({ load() { throw new Error('missing'); } }), {
    available: false,
    reason: 'native_keyring_unavailable'
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-install-key-missing-'));
  try {
    assert.throws(
      () => createInstallationSecretStore({ privateRoot: root, load() { throw new Error('missing'); } }),
      (error) => error.code === 'PRIVATE_ARTIFACT_SECRET_UNAVAILABLE'
    );
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('initializes exactly one 256-bit installation key and reuses it', () => {
  const h = fixture();
  try {
    const first = h.store.ensureReady();
    const second = h.store.ensureReady();
    assert.deepStrictEqual(second, first);
    assert.match(h.values.get('key'), /^[A-Za-z0-9_-]{43}$/u);
    assert.deepStrictEqual(fs.readdirSync(h.root), ['.private-artifact-key-state.json']);
  } finally { h.cleanup(); }
});

test('prepare and resolve return owned key buffers with an exact key binding', () => {
  const h = fixture();
  try {
    const binding = { purpose: 'batch-snapshot', objectId: 'batch:item' };
    const prepared = h.store.prepareWrite(binding);
    assert.strictEqual(prepared.key.length, 32);
    assert.throws(
      () => h.store.resolveRead(binding, { generation: 1, keyId: prepared.keyId }),
      (error) => error.code === 'PRIVATE_ARTIFACT_SECRET_UNCOMMITTED'
    );
    prepared.commit();
    const resolved = h.store.resolveRead(binding, { generation: 1, keyId: prepared.keyId });
    assert.deepStrictEqual(resolved, prepared.key);
    assert.notStrictEqual(resolved, prepared.key);
    resolved.fill(0);
    prepared.key.fill(0);
  } finally { h.cleanup(); }
});

test('a concurrent initialization marker never permits a replacement key', () => {
  const h = fixture();
  try {
    fs.writeFileSync(path.join(h.root, '.private-artifact-key-init.lock'), '999999\n', { flag: 'wx', mode: 0o600 });
    assert.throws(
      () => h.store.ensureReady(),
      (error) => error.code === 'PRIVATE_ARTIFACT_SECRET_INITIALIZATION_BUSY'
    );
    assert.strictEqual(h.values.has('key'), false);
  } finally { h.cleanup(); }
});

test('a keyring write that cannot be read back is durability-uncertain', () => {
  const wrong = crypto.randomBytes(32).toString('base64url');
  const h = fixture({ replaceOnSet: wrong });
  try {
    assert.throws(
      () => h.store.ensureReady(),
      (error) => error.code === 'PRIVATE_ARTIFACT_SECRET_DURABILITY_UNCERTAIN'
    );
  } finally { h.cleanup(); }
});

test('wrong generation or key id never resolves', () => {
  const h = fixture();
  try {
    const binding = { purpose: 'review-preview', objectId: 'package__asset-001' };
    const prepared = h.store.prepareWrite(binding);
    prepared.commit();
    assert.throws(
      () => h.store.resolveRead(binding, { generation: 2, keyId: prepared.keyId }),
      (error) => error.code === 'PRIVATE_ARTIFACT_SECRET_INVALID'
    );
    assert.throws(
      () => h.store.resolveRead(binding, { generation: 1, keyId: '0'.repeat(32) }),
      (error) => error.code === 'PRIVATE_ARTIFACT_SECRET_UNCOMMITTED'
    );
  } finally { h.cleanup(); }
});

test('a lost initialized key never creates a replacement', () => {
  const h = fixture();
  try {
    h.store.ensureReady();
    const original = h.values.get('key');
    h.values.delete('key');
    assert.throws(
      () => h.store.ensureReady(),
      (error) => error.code === 'PRIVATE_ARTIFACT_SECRET_LOST'
    );
    assert.strictEqual(h.values.has('key'), false);
    assert.ok(original);
  } finally { h.cleanup(); }
});

test('a failed commit publication remains unreadable instead of trusting uncertain ciphertext', () => {
  const io = new Proxy(fs, {
    get(target, property) {
      if (property === 'openSync') return (file, ...args) => {
        if (String(file).includes('.private-artifact-commits')) {
          const error = new Error('injected commit failure');
          error.code = 'EIO';
          throw error;
        }
        return target.openSync(file, ...args);
      };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  const h = fixture({ fs: io });
  try {
    const binding = { purpose: 'batch-snapshot', objectId: 'uncertain:item' };
    const prepared = h.store.prepareWrite(binding);
    assert.throws(
      () => prepared.commit(),
      (error) => error.code === 'PRIVATE_ARTIFACT_SECRET_DURABILITY_UNCERTAIN'
    );
    assert.throws(
      () => h.store.resolveRead(binding, { generation: 1, keyId: prepared.keyId }),
      (error) => error.code === 'PRIVATE_ARTIFACT_SECRET_DURABILITY_UNCERTAIN'
    );
  } finally { h.cleanup(); }
});

done();
