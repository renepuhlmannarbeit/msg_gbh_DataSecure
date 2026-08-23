'use strict';

const crypto = require('crypto');
const { createSuite } = require('./helpers');
const {
  SECRET_BYTES, KEYRING_PACKAGE, SERVICE_NAME,
  accountForBatch, loadNativeKeyring, createBatchSecretStore
} = require('../plugins/data-secure/server/batch-secret-store');

const { test, done, assert } = createSuite('Batch secret-store pilot');
const token = 'a'.repeat(64);

function fakeKeyring(options = {}) {
  const values = new Map();
  const calls = [];
  class Entry {
    constructor(service, account) {
      calls.push({ type: 'entry', service, account });
      if (options.constructorFails) throw new Error('unavailable');
      this.key = `${service}:${account}`;
    }
    setPassword(value) {
      calls.push({ type: 'set', value });
      if (options.setFails) throw new Error('unavailable');
      values.set(this.key, value);
    }
    getPassword() {
      calls.push({ type: 'get' });
      if (options.getFails) throw new Error('unavailable');
      return Object.hasOwn(options, 'stored') ? options.stored : values.get(this.key) || null;
    }
    deletePassword() {
      calls.push({ type: 'delete' });
      if (options.deleteFails) throw new Error('unavailable');
      values.delete(this.key);
    }
  }
  return { Entry, values, calls };
}

test('batch account names accept only opaque local tokens', () => {
  assert.strictEqual(accountForBatch(token), `batch-v1-${token}`);
  assert.throws(() => accountForBatch('employee-profile.docx'), (error) => error.code === 'BATCH_SECRET_STORE_INPUT_INVALID');
});

test('a missing native module is an explicit unavailable state, never a fallback', () => {
  const status = loadNativeKeyring({ load: () => { throw new Error('missing'); } });
  assert.deepStrictEqual(status, { available: false, reason: 'native_keyring_unavailable' });
  assert.throws(
    () => createBatchSecretStore(token, { load: () => { throw new Error('missing'); } }),
    (error) => error.code === 'BATCH_SECRET_STORE_UNAVAILABLE'
  );
});

test('the pilot uses only the fixed service and opaque batch account', () => {
  const fake = fakeKeyring();
  const store = createBatchSecretStore(token, { load: (name) => { assert.strictEqual(name, KEYRING_PACKAGE); return fake; } });
  assert.deepStrictEqual(store.availability, { available: true, backend: 'native_os_keyring' });
  assert.deepStrictEqual(fake.calls[0], { type: 'entry', service: SERVICE_NAME, account: `batch-v1-${token}` });
});

test('a 256-bit secret round-trips through the native store and can be removed', () => {
  const fake = fakeKeyring();
  const store = createBatchSecretStore(token, { load: () => fake });
  const secret = crypto.randomBytes(SECRET_BYTES);
  store.set(secret);
  const restored = store.get();
  assert.deepStrictEqual(restored, secret);
  assert.match(fake.calls.find((call) => call.type === 'set').value, /^[A-Za-z0-9_-]{43}$/u);
  store.remove();
  assert.strictEqual(fake.values.size, 0);
  restored.fill(0);
  secret.fill(0);
});

test('missing, malformed and backend-failure secrets stop without exposing a backend error', () => {
  for (const options of [{ stored: null }, { stored: 'not-a-secret' }, { getFails: true }]) {
    const store = createBatchSecretStore(token, { load: () => fakeKeyring(options) });
    assert.throws(() => store.get(), (error) => error.code === 'BATCH_SECRET_STORE_MISSING' ||
      error.code === 'BATCH_SECRET_STORE_UNAVAILABLE');
  }
  for (const options of [{ setFails: true }, { deleteFails: true }, { constructorFails: true }]) {
    const storeOrCreate = () => createBatchSecretStore(token, { load: () => fakeKeyring(options) });
    if (options.constructorFails) {
      assert.throws(storeOrCreate, (error) => error.code === 'BATCH_SECRET_STORE_UNAVAILABLE');
      continue;
    }
    const store = storeOrCreate();
    const action = options.setFails ? () => store.set(Buffer.alloc(SECRET_BYTES)) : () => store.remove();
    assert.throws(action, (error) => error.code === 'BATCH_SECRET_STORE_UNAVAILABLE');
  }
});

test('the pilot has no filesystem, environment, CLI or self-encryption fallback path', () => {
  const source = require('fs').readFileSync(require.resolve('../plugins/data-secure/server/batch-secret-store'), 'utf8');
  assert.doesNotMatch(source, /require\(['"]fs['"]\)|writeFile|readFile|process\.env|child_process|\b(?:spawn|exec|execFile)\s*\(|createCipher|createDecipher/iu);
});

done();
