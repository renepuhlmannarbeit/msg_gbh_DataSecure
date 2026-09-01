'use strict';

const { createSuite } = require('./helpers');
const { PRIVACY_RULESET_VERSION } = require('../plugins/data-secure/server/privacy/policy');
const { CONTRACT_VERSION } = require('../plugins/data-secure/server/batch-pseudonym-registry');
const {
  createBatchPseudonymState,
  validateBatchPseudonymState,
  withBatchPseudonymRegistry
} = require('../plugins/data-secure/server/batch-pseudonym-context');

const { test, done, assert } = createSuite('Restart-stable batch pseudonym state');

test('a private journal state contains only versioned random seed material', () => {
  const source = Buffer.alloc(32, 7);
  const state = createBatchPseudonymState({ randomBytes: () => source });
  assert.strictEqual(state.pseudonym_contract_version, CONTRACT_VERSION);
  assert.strictEqual(state.pseudonym_ruleset_version, PRIVACY_RULESET_VERSION);
  assert.match(state.pseudonym_seed, /^[A-Za-z0-9_-]{43}$/u);
  assert.ok(source.equals(Buffer.alloc(32)), 'caller-provided seed buffer is zeroed');
  assert.doesNotMatch(JSON.stringify(state), /Erika|Beispiel|mapping|keyring|password/iu);
});

test('separate registries reconstructed after a restart derive the same label', async () => {
  const state = createBatchPseudonymState({ randomBytes: () => Buffer.alloc(32, 9) });
  const first = await withBatchPseudonymRegistry(state, async (registry) => registry.assign('PERSON', 'Erika Beispiel'));
  const second = await withBatchPseudonymRegistry(JSON.parse(JSON.stringify(state)), async (registry) =>
    registry.assign('PERSON', 'Erika Beispiel'));
  assert.strictEqual(first, second);
});

test('surname aliases and collision reservations survive a journal round trip without raw values', async () => {
  const state = createBatchPseudonymState({ randomBytes: () => Buffer.alloc(32, 8) });
  const full = await withBatchPseudonymRegistry(state, async (registry) => {
    const marker = registry.assign('PERSON', 'Erika Beispiel');
    registry.remember('PERSON', 'Beispiel', marker);
    return marker;
  });
  const serialized = JSON.stringify(state);
  assert.doesNotMatch(serialized, /Erika|Beispiel/u);
  const restored = JSON.parse(serialized);
  const surname = await withBatchPseudonymRegistry(restored, async (registry) => registry.assign('PERSON', 'Beispiel'));
  assert.strictEqual(surname, full);
  assert.ok(restored.pseudonym_registry_state.bindings.length >= 2);
  assert.ok(restored.pseudonym_registry_state.labels.length >= 1);
});

test('two people sharing a surname produce a stable ambiguous alias instead of rebinding either person', async () => {
  const state = createBatchPseudonymState({ randomBytes: () => Buffer.alloc(32, 10) });
  const markers = await withBatchPseudonymRegistry(state, async (registry) => {
    const anna = registry.assign('PERSON', 'Anna Müller');
    registry.remember('PERSON', 'Müller', anna);
    const bernd = registry.assign('PERSON', 'Bernd Müller');
    registry.remember('PERSON', 'Müller', bernd);
    return { anna, bernd, surname: registry.lookup('PERSON', 'Müller') };
  });
  assert.notStrictEqual(markers.anna, markers.bernd);
  assert.notStrictEqual(markers.surname, markers.anna);
  assert.notStrictEqual(markers.surname, markers.bernd);
  const restored = structuredClone(state);
  const surname = await withBatchPseudonymRegistry(restored, async (registry) => registry.assign('PERSON', 'Müller'));
  assert.strictEqual(surname, markers.surname);
});

test('tampered persisted alias bindings fail closed and never reach the action', async () => {
  const state = createBatchPseudonymState({ randomBytes: () => Buffer.alloc(32, 6) });
  await withBatchPseudonymRegistry(state, async (registry) => registry.assign('PERSON', 'Erika Beispiel'));
  const invalid = structuredClone(state);
  invalid.pseudonym_registry_state.bindings[0][1] = '[PERSON_AAAAAAAAAA]';
  let called = false;
  await assert.rejects(() => withBatchPseudonymRegistry(invalid, async () => { called = true; }),
    (error) => error.code === 'BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE');
  assert.strictEqual(called, false);
});

test('different batches unlink labels and malformed or incompatible state fails closed', async () => {
  const one = createBatchPseudonymState({ randomBytes: () => Buffer.alloc(32, 1) });
  const two = createBatchPseudonymState({ randomBytes: () => Buffer.alloc(32, 2) });
  const labelOne = await withBatchPseudonymRegistry(one, async (registry) => registry.assign('ORG', 'Klinik Nord GmbH'));
  const labelTwo = await withBatchPseudonymRegistry(two, async (registry) => registry.assign('ORG', 'Klinik Nord GmbH'));
  assert.notStrictEqual(labelOne, labelTwo);
  for (const invalid of [
    {},
    { ...one, pseudonym_seed: 'x' },
    { ...one, pseudonym_contract_version: 'batch-pseudonym/v0' },
    { ...one, pseudonym_ruleset_version: 'other/1' }
  ]) {
    assert.throws(() => validateBatchPseudonymState(invalid),
      (error) => error.code === 'BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE');
    await assert.rejects(() => withBatchPseudonymRegistry(invalid, async () => undefined),
      (error) => error.code === 'BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE');
  }
});

test('processing errors survive and an already disposed registry cannot escape the action', async () => {
  const state = createBatchPseudonymState({ randomBytes: () => Buffer.alloc(32, 4) });
  let escaped;
  const expected = Object.assign(new Error('fixed'), { code: 'PROCESSING_INTERRUPTED' });
  await assert.rejects(() => withBatchPseudonymRegistry(state, async (registry) => {
    escaped = registry;
    throw expected;
  }), (error) => error === expected);
  assert.throws(() => escaped.assign('PERSON', 'Erika Beispiel'),
    (error) => error.code === 'BATCH_PSEUDONYM_INPUT_INVALID');
});

test('a journal persistence failure still destroys an escaped registry and seed context', async () => {
  const state = createBatchPseudonymState({ randomBytes: () => Buffer.alloc(32, 5) });
  let escaped;
  await assert.rejects(() => withBatchPseudonymRegistry(state, async (registry) => {
    escaped = registry;
    registry.assign('PERSON', 'Erika Beispiel');
  }, { persist() { throw Object.assign(new Error('disk'), { code: 'JOURNAL_WRITE_FAILED' }); } }),
  (error) => error.code === 'JOURNAL_WRITE_FAILED');
  assert.throws(() => escaped.lookup('PERSON', 'Erika Beispiel'),
    (error) => error.code === 'BATCH_PSEUDONYM_INPUT_INVALID');
});

done();
