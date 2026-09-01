'use strict';

const crypto = require('crypto');
const { createSuite } = require('./helpers');
const {
  provisionBatchPseudonymContext,
  withBatchPseudonymRegistry,
  removeBatchPseudonymContext
} = require('./legacy/keyring/batch-pseudonym-context');
const { CONTRACT_VERSION } = require('../plugins/data-secure/server/batch-pseudonym-registry');

const { test, done, assert } = createSuite('Batch pseudonym context lifecycle');
const token = 'b'.repeat(64);

function durableFakeStore(options = {}) {
  const values = options.values || new Map();
  const calls = options.calls || [];
  const createStore = (account) => ({
    set(secret) {
      calls.push('set');
      if (options.setFails) throw new Error('backend');
      values.set(account, Buffer.from(secret));
    },
    get() {
      calls.push('get');
      if (options.getFails) throw new Error('backend');
      const value = values.get(account);
      return value ? Buffer.from(value) : null;
    },
    remove() {
      calls.push('remove');
      if (options.removeFails) throw new Error('backend');
      const value = values.get(account);
      if (value) value.fill(0);
      values.delete(account);
    }
  });
  return { values, calls, createStore };
}

test('provision persists only an opaque contract reference and zeroes the temporary secret', () => {
  const fake = durableFakeStore();
  const generated = Buffer.alloc(32, 7);
  const reference = provisionBatchPseudonymContext(token, {
    createStore: fake.createStore,
    randomBytes: () => generated
  });
  assert.deepStrictEqual(reference, { contract: CONTRACT_VERSION, account: token });
  assert.ok(generated.every((byte) => byte === 0), 'temporary generated secret must be zeroed');
  assert.deepStrictEqual(fake.calls, ['set']);
  assert.strictEqual(JSON.stringify(reference).includes('BwcHBw'), false, 'reference must not serialize secret material');
});

test('separate process-like invocations derive the same pseudonym from the native store', async () => {
  const fake = durableFakeStore();
  provisionBatchPseudonymContext(token, { createStore: fake.createStore, randomBytes: () => Buffer.alloc(32, 3) });
  const first = await withBatchPseudonymRegistry(token,
    async (registry) => registry.assign('PERSON', 'Erika Beispiel'), { createStore: fake.createStore });
  // A second registry represents a fresh MCP/worker process: no in-memory map
  // survives, only the OS-store secret is loaded again.
  const second = await withBatchPseudonymRegistry(token,
    async (registry) => registry.assign('PERSON', 'Erika Beispiel'), { createStore: fake.createStore });
  assert.strictEqual(first, second);
  assert.match(first, /^\[PERSON_[A-Z2-7]+\]$/u);
});

test('missing or unreadable secret stops instead of silently creating new pseudonyms', async () => {
  const missing = durableFakeStore();
  await assert.rejects(
    withBatchPseudonymRegistry(token, async () => 'must-not-run', { createStore: missing.createStore }),
    (error) => error.code === 'PSEUDONYM_SECRET_UNAVAILABLE'
  );
  const broken = durableFakeStore({ getFails: true });
  await assert.rejects(
    withBatchPseudonymRegistry(token, async () => 'must-not-run', { createStore: broken.createStore }),
    (error) => error.code === 'PSEUDONYM_SECRET_UNAVAILABLE'
  );
});

test('a partial provision failure rolls the keyring entry back', () => {
  const fake = durableFakeStore({ setFails: true });
  assert.throws(
    () => provisionBatchPseudonymContext(token, { createStore: fake.createStore }),
    (error) => error.code === 'PSEUDONYM_SECRET_UNAVAILABLE'
  );
  assert.deepStrictEqual(fake.calls, ['set', 'remove']);
  assert.strictEqual(fake.values.size, 0);
});

test('terminal cleanup deletes the secret and makes every later resume fail closed', async () => {
  const fake = durableFakeStore();
  provisionBatchPseudonymContext(token, { createStore: fake.createStore });
  assert.strictEqual(removeBatchPseudonymContext(token, { createStore: fake.createStore }), true);
  assert.strictEqual(fake.values.size, 0);
  await assert.rejects(
    withBatchPseudonymRegistry(token, async () => 'must-not-run', { createStore: fake.createStore }),
    (error) => error.code === 'PSEUDONYM_SECRET_UNAVAILABLE'
  );
});

test('processing callback errors retain their fixed code while the registry is disposed', async () => {
  const fake = durableFakeStore();
  provisionBatchPseudonymContext(token, { createStore: fake.createStore });
  let captured;
  const expected = new Error('processing stopped');
  expected.code = 'PARSER_TIMEOUT';
  await assert.rejects(
    withBatchPseudonymRegistry(token, async (registry) => {
      captured = registry;
      registry.assign('ORG', 'Beispiel GmbH');
      throw expected;
    }, { createStore: fake.createStore }),
    (error) => error === expected
  );
  assert.throws(() => captured.assign('ORG', 'Beispiel GmbH'),
    (error) => error.code === 'BATCH_PSEUDONYM_INPUT_INVALID');
});

test('the lifecycle module contains no persistence, environment, CLI or cryptographic fallback', () => {
  const source = require('fs').readFileSync(require.resolve('./legacy/keyring/batch-pseudonym-context'), 'utf8');
  assert.doesNotMatch(source, /writeFile|readFile|process\.env|child_process|createCipher|createDecipher/iu);
});

done();
