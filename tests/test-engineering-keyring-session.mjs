// All backends here are in-memory spies. No native keyring load or OS credentials.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createEngineeringKeyringSession, ENGINEERING_SERVICE } from '../scripts/lib/engineering-keyring-session.mjs';
const require = createRequire(import.meta.url);
const { createSuite } = require('./helpers.js');
const { SERVICE_NAME, ACCOUNT_NAME } = require('../plugins/data-secure/server/gateway/installation-secret-store.js');
const { createProductPrivateArtifactCrypto } = require('../plugins/data-secure/server/gateway/private-artifact-runtime.js');
const { test, assert, done } = createSuite('Engineering credential isolation (memory backend, no OS evidence)');
const key = Buffer.alloc(32, 0x31).toString('base64url');
const differentKey = Buffer.alloc(32, 0x32).toString('base64url');
const productPair = `${SERVICE_NAME}\0${ACCOUNT_NAME}`;

function backend(options = {}) {
  const calls = [];
  const values = new Map([[productPair, 'DO_NOT_TOUCH_PRODUCT_SENTINEL']]);
  class Entry {
    constructor(service, account) {
      // Trap all operations that could ever approach the production namespace.
      assert.strictEqual(service, ENGINEERING_SERVICE);
      assert.notStrictEqual(service, SERVICE_NAME);
      assert.match(account, /^run-[a-f0-9]{64}$/u);
      this.pair = `${service}\0${account}`;
      calls.push(['open', this.pair]);
      if (options.constructorError) throw new Error('sensitive backend exception');
      if (options.occupied !== undefined) values.set(this.pair, options.occupied);
    }
    getPassword() {
      calls.push(['get', this.pair]);
      if (options.getError) throw new Error('sensitive backend exception');
      return values.has(this.pair) ? values.get(this.pair) : null;
    }
    setPassword(value) {
      calls.push(['set', this.pair]);
      if (options.setError) throw new Error('sensitive backend exception');
      if (!options.dropWrite) values.set(this.pair, options.replaceOnSet || value);
      return options.setResult;
    }
    deletePassword() { assert.fail('credential deletion is forbidden'); }
  }
  return { Entry, calls, values, options, assertProtected() {
    assert.strictEqual(values.get(productPair), 'DO_NOT_TOUCH_PRODUCT_SENTINEL');
    assert.ok(calls.every(([, pair]) => pair.startsWith(`${ENGINEERING_SERVICE}\0run-`)));
  } };
}
function make(b = backend(), extras = {}) {
  const session = createEngineeringKeyringSession({ Entry: b.Entry, ...extras });
  return { b, session, entry() { return new session.Entry(SERVICE_NAME, ACCOUNT_NAME); } };
}
function expect(code, action) { assert.throws(action, error => error.message === code); }
function ownPair(b) { return b.calls.find(([op]) => op === 'open')[1]; }
function fixture(session) {
  // Fresh synthetic directories are retained; never clean a user root/keyring.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-engineering-keyring-'));
  return { root, runtime: createProductPrivateArtifactCrypto({ privateRoot: root, Entry: session.Entry }) };
}

test('requires an explicit backend and rejects namespace, account, paths and accessor options', () => {
  let getterCalled = false;
  for (const invalid of [undefined, null, [], {}, { Entry: undefined }, { Entry: {} },
    { Entry: class {}, service: SERVICE_NAME }, { Entry: class {}, account: ACCOUNT_NAME },
    { Entry: class {}, sessionId: 'foreign' }, { Entry: class {}, privateRoot: 'foreign' },
    { Entry: class {}, randomBytes: null }, { Entry: class {}, [Symbol('extra')]: true },
    { get Entry() { getterCalled = true; return class {}; } }]) {
    expect('ENGINEERING_KEYRING_OPTIONS_INVALID', () => createEngineeringKeyringSession(invalid));
  }
  assert.strictEqual(getterCalled, false);
});

test('failed or malformed randomness stops before any backend is opened', () => {
  for (const randomBytes of [() => { throw new Error('private'); }, () => undefined,
    () => 'a'.repeat(64), () => new Uint8Array(32), () => Buffer.alloc(31, 1),
    () => Buffer.alloc(33, 1), () => Buffer.alloc(32), () => Promise.reject(new Error('synthetic private error'))]) {
    const b = backend();
    expect('ENGINEERING_KEYRING_RANDOM_INVALID', () => make(b, { randomBytes }));
    assert.strictEqual(b.calls.length, 0);
  }
});

test('factory is lazy and wrong product Entry arguments stop before backend access', () => {
  const h = make();
  for (const args of [[], [SERVICE_NAME], ['wrong', ACCOUNT_NAME], [SERVICE_NAME, 'wrong'],
    [ENGINEERING_SERVICE, ACCOUNT_NAME], [SERVICE_NAME, ACCOUNT_NAME, 'extra']]) {
    expect('ENGINEERING_KEYRING_ENTRY_INVALID', () => new h.session.Entry(...args));
  }
  assert.strictEqual(h.b.calls.length, 0);
  h.session.close();
});

test('two sessions use distinct random accounts in the fixed engineering service', () => {
  const b = backend(); const a = make(b); const c = make(b);
  a.entry().setPassword(key); c.entry().setPassword(differentKey);
  const opens = b.calls.filter(([op]) => op === 'open');
  assert.strictEqual(opens.length, 2); assert.notStrictEqual(opens[0][1], opens[1][1]);
  assert.strictEqual(a.entry().getPassword(), key);
  assert.strictEqual(c.entry().getPassword(), differentKey);
  b.assertProtected(); a.session.close(); c.session.close();
});

test('reopening the same live session reuses one backend without exposing its identity', () => {
  const h = make(); const first = h.entry(); first.setPassword(key);
  const second = h.entry(); assert.strictEqual(second.getPassword(), key);
  assert.strictEqual(h.b.calls.filter(([op]) => op === 'open').length, 1);
  assert.deepStrictEqual(Object.keys(h.session).sort(), ['Entry', 'close']);
  assert.deepStrictEqual(Object.keys(second), []);
  assert.ok(Object.isFrozen(h.session) && Object.isFrozen(second) && Object.isFrozen(h.session.Entry.prototype));
  h.b.assertProtected(); h.session.close();
});

test('occupied random namespace is neither adopted nor overwritten', () => {
  const h = make(backend({ occupied: key }));
  expect('ENGINEERING_KEYRING_NAMESPACE_OCCUPIED', h.entry);
  expect('ENGINEERING_KEYRING_NAMESPACE_OCCUPIED', h.entry);
  assert.strictEqual(h.b.calls.filter(([op]) => op === 'open').length, 1);
  assert.ok(!h.b.calls.some(([op]) => op === 'set'));
  assert.strictEqual(h.b.values.get(ownPair(h.b)), key); h.b.assertProtected();
});

test('a deterministic collision with another session cannot reuse that session key', () => {
  const b = backend(); const randomBytes = () => Buffer.alloc(32, 7);
  const a = make(b, { randomBytes }); a.entry().setPassword(key);
  const c = make(b, { randomBytes }); expect('ENGINEERING_KEYRING_NAMESPACE_OCCUPIED', c.entry);
  assert.strictEqual(a.entry().getPassword(), key); b.assertProtected();
});

test('foreign value appearing between open and first write fails without changing it', () => {
  const h = make(); const entry = h.entry(); h.b.values.set(ownPair(h.b), differentKey);
  expect('ENGINEERING_KEYRING_NAMESPACE_OCCUPIED', () => entry.setPassword(key));
  assert.strictEqual(h.b.values.get(ownPair(h.b)), differentKey);
  assert.ok(!h.b.calls.some(([op]) => op === 'set')); h.b.assertProtected();
});

test('foreign value appearing before a read is not silently adopted', () => {
  const h = make(); const entry = h.entry(); h.b.values.set(ownPair(h.b), key);
  expect('ENGINEERING_KEYRING_NAMESPACE_OCCUPIED', () => entry.getPassword());
  h.b.assertProtected();
});

test('backend constructor/read failures are sanitized and permanently latched', () => {
  for (const options of [{ constructorError: true }, { getError: true }]) {
    const h = make(backend(options));
    expect('ENGINEERING_KEYRING_BACKEND_UNAVAILABLE', h.entry);
    const count = h.b.calls.length;
    expect('ENGINEERING_KEYRING_BACKEND_UNAVAILABLE', h.entry);
    assert.strictEqual(h.b.calls.length, count); h.b.assertProtected();
  }
});

test('invalid backend API and nonconstructible backend cannot trigger a fallback', () => {
  for (const Entry of [class {}, class { getPassword() {} }, class { setPassword() {} }]) {
    const session = createEngineeringKeyringSession({ Entry });
    expect('ENGINEERING_KEYRING_BACKEND_INVALID', () => new session.Entry(SERVICE_NAME, ACCOUNT_NAME));
  }
  const session = createEngineeringKeyringSession({ Entry: () => ({}) });
  expect('ENGINEERING_KEYRING_BACKEND_UNAVAILABLE', () => new session.Entry(SERVICE_NAME, ACCOUNT_NAME));
});

test('malformed backend values fail without writing or exposing their content', () => {
  for (const occupied of ['', undefined, 'sensitive-value', 'a'.repeat(43), 1, Buffer.alloc(32),
    Promise.resolve(null), Promise.reject(new Error('synthetic private error'))]) {
    const b = backend(); const h = make(b); const entry = h.entry();
    b.values.set(ownPair(b), occupied);
    expect('ENGINEERING_KEYRING_SECRET_INVALID', () => entry.getPassword());
    assert.ok(!b.calls.some(([op]) => op === 'set')); b.assertProtected();
  }
});

test('invalid proposed keys and duplicate writes cannot mutate backend state', () => {
  const h = make(); const entry = h.entry();
  for (const value of [null, '', Buffer.alloc(32), 'a'.repeat(43), 'a'.repeat(44)]) {
    expect('ENGINEERING_KEYRING_SECRET_INVALID', () => entry.setPassword(value));
  }
  entry.setPassword(key);
  expect('ENGINEERING_KEYRING_REWRITE_FORBIDDEN', () => entry.setPassword(differentKey));
  assert.strictEqual(entry.getPassword(), key);
  assert.strictEqual(h.b.calls.filter(([op]) => op === 'set').length, 1); h.b.assertProtected();
});

test('uncertain writes cannot be retried or redirect to product credentials', () => {
  const h = make(backend({ setError: true })); const entry = h.entry();
  expect('ENGINEERING_KEYRING_BACKEND_UNAVAILABLE', () => entry.setPassword(key));
  h.b.options.setError = false;
  expect('ENGINEERING_KEYRING_BACKEND_UNAVAILABLE', () => entry.setPassword(key));
  expect('ENGINEERING_KEYRING_BACKEND_UNAVAILABLE', () => entry.getPassword());
  assert.strictEqual(h.b.calls.filter(([op]) => op === 'set').length, 1); h.b.assertProtected();
});

test('closing a session revokes old and new entries without deleting any credentials', () => {
  const h = make(); const entry = h.entry(); entry.setPassword(key);
  const before = [...h.b.values]; const count = h.b.calls.length;
  h.session.close(); h.session.close();
  expect('ENGINEERING_KEYRING_SESSION_CLOSED', () => entry.getPassword());
  expect('ENGINEERING_KEYRING_SESSION_CLOSED', () => entry.setPassword(key));
  expect('ENGINEERING_KEYRING_SESSION_CLOSED', h.entry);
  assert.strictEqual(h.b.calls.length, count); assert.deepStrictEqual([...h.b.values], before);
  h.b.assertProtected();
});

for (const purpose of ['batch-snapshot', 'review-preview']) {
  test(`real product AES/commit/reopen path works for ${purpose} with memory backend only`, () => {
    const h = make(); const f = fixture(h.session);
    const binding = { purpose, objectId: 'synthetic:item' };
    const source = Buffer.from('Synthetisch: Lea Beispiel; Scrum.org PSM I; lea@example.test');
    const target = path.join(f.root, 'synthetic.dsart');
    const ready = f.runtime.ensureReady();
    // This label is hardcoded in product code even for Entry injection. It must
    // NEVER be treated as evidence of OS persistence in this memory test.
    assert.strictEqual(ready.backend, 'native_os_keyring');
    f.runtime.writeEncrypted(target, source, binding);
    const ciphertext = fs.readFileSync(target);
    assert.strictEqual(ciphertext.includes(source), false);
    const reopened = createProductPrivateArtifactCrypto({ privateRoot: f.root, Entry: h.session.Entry });
    assert.deepStrictEqual(reopened.readEncrypted(target, binding), source);
    assert.strictEqual(h.b.calls.filter(([op]) => op === 'set').length, 1);
    h.b.assertProtected(); h.session.close();
  });
}

test('wrong session refuses existing artifact state without generating a replacement', () => {
  const b = backend(); const a = make(b); const f = fixture(a.session);
  const binding = { purpose: 'review-preview', objectId: 'synthetic:item' };
  const target = path.join(f.root, 'synthetic.dsart'); f.runtime.writeEncrypted(target, 'synthetic', binding);
  const c = make(b);
  const other = createProductPrivateArtifactCrypto({ privateRoot: f.root, Entry: c.session.Entry });
  assert.throws(() => other.readEncrypted(target, binding), error => error.code === 'PRIVATE_ARTIFACT_SECRET_LOST');
  assert.strictEqual(b.calls.filter(([op]) => op === 'set').length, 1);
  assert.strictEqual(f.runtime.readEncrypted(target, binding).toString(), 'synthetic'); b.assertProtected();
});

test('wrong binding and modified ciphertext are rejected by the real crypto facade', () => {
  const h = make(); const f = fixture(h.session);
  const binding = { purpose: 'batch-snapshot', objectId: 'synthetic:item' };
  const target = path.join(f.root, 'synthetic.dsart'); f.runtime.writeEncrypted(target, 'synthetic', binding);
  for (const wrong of [{ ...binding, purpose: 'review-preview' }, { ...binding, objectId: 'other' }]) {
    assert.throws(() => f.runtime.readEncrypted(target, wrong), error => error.code === 'PRIVATE_ARTIFACT_SECRET_UNCOMMITTED');
  }
  const bytes = fs.readFileSync(target); bytes[bytes.length - 1] ^= 1; fs.writeFileSync(target, bytes);
  assert.throws(() => f.runtime.readEncrypted(target, binding), error => error.code === 'PRIVATE_ARTIFACT_AUTH_FAILED');
  h.b.assertProtected();
});

test('loss of this session key never initializes a replacement in the product store', () => {
  const h = make(); const f = fixture(h.session); f.runtime.ensureReady();
  h.b.values.delete(ownPair(h.b)); // Memory map only, never an OS deletion.
  assert.throws(() => f.runtime.ensureReady(), error => error.code === 'PRIVATE_ARTIFACT_SECRET_LOST');
  assert.strictEqual(h.b.calls.filter(([op]) => op === 'set').length, 1); h.b.assertProtected();
});

test('review regression: a wrong stored key permanently blocks repeated product initialization', () => {
  const h = make(backend({ replaceOnSet: differentKey })); const f = fixture(h.session);
  assert.throws(() => f.runtime.ensureReady(), error => error.code === 'PRIVATE_ARTIFACT_SECRET_UNAVAILABLE');
  const count = h.b.calls.length;
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.throws(() => f.runtime.ensureReady(), error => error.code === 'PRIVATE_ARTIFACT_SECRET_UNAVAILABLE');
    expect('ENGINEERING_KEYRING_WRITE_UNCERTAIN', h.entry);
  }
  assert.strictEqual(h.b.calls.length, count);
  assert.strictEqual(fs.existsSync(path.join(f.root, '.private-artifact-key-state.json')), false);
  h.b.assertProtected();
});

test('missing write confirmation stays latched even when the backend later recovers', () => {
  const h = make(backend({ dropWrite: true })); const entry = h.entry();
  expect('ENGINEERING_KEYRING_WRITE_UNCERTAIN', () => entry.setPassword(key));
  h.b.values.set(ownPair(h.b), key); const count = h.b.calls.length;
  expect('ENGINEERING_KEYRING_WRITE_UNCERTAIN', () => entry.getPassword());
  expect('ENGINEERING_KEYRING_WRITE_UNCERTAIN', () => entry.setPassword(key));
  assert.strictEqual(h.b.calls.length, count); h.b.assertProtected();
});

test('a changed key after confirmation cannot be adopted on a later read', () => {
  const h = make(); const entry = h.entry(); entry.setPassword(key);
  h.b.values.set(ownPair(h.b), differentKey);
  expect('ENGINEERING_KEYRING_WRITE_UNCERTAIN', () => entry.getPassword());
  const count = h.b.calls.length; h.b.values.set(ownPair(h.b), key);
  expect('ENGINEERING_KEYRING_WRITE_UNCERTAIN', () => entry.getPassword());
  assert.strictEqual(h.b.calls.length, count); h.b.assertProtected();
});

test('non-void and asynchronous writes are not accepted as synchronous completion', () => {
  for (const setResult of [true, null, 1, 'done', Promise.resolve(), Promise.reject(new Error('synthetic'))]) {
    const h = make(backend({ setResult })); const entry = h.entry();
    expect('ENGINEERING_KEYRING_WRITE_UNCERTAIN', () => entry.setPassword(key));
    const count = h.b.calls.length;
    expect('ENGINEERING_KEYRING_WRITE_UNCERTAIN', () => entry.getPassword());
    assert.strictEqual(h.b.calls.length, count); h.b.assertProtected();
  }
});

done();
