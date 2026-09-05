'use strict';

const { createSuite } = require('./helpers');
const { PRIVACY_RULESET_VERSION } = require('../plugins/data-secure/server/privacy/policy');
const { CONTRACT_VERSION, READABLE_CONTRACT_VERSION } = require('../plugins/data-secure/server/batch-pseudonym-registry');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const {
  createBatchPseudonymState,
  validateBatchPseudonymState,
  withBatchPseudonymRegistry
} = require('../plugins/data-secure/server/batch-pseudonym-context');

const { testAsync: test, done, assert } = createSuite('Restart-stable batch pseudonym state');

async function main() {

await test('a private journal state contains only versioned random seed material', () => {
  const source = Buffer.alloc(32, 7);
  const state = createBatchPseudonymState({ randomBytes: () => source });
  assert.strictEqual(state.pseudonym_contract_version, CONTRACT_VERSION);
  assert.strictEqual(state.pseudonym_ruleset_version, PRIVACY_RULESET_VERSION);
  assert.match(state.pseudonym_seed, /^[A-Za-z0-9_-]{43}$/u);
  assert.ok(source.equals(Buffer.alloc(32)), 'caller-provided seed buffer is zeroed');
  assert.doesNotMatch(JSON.stringify(state), /Erika|Beispiel|mapping|keyring|password/iu);
});

await test('separate registries reconstructed after a restart derive the same label', async () => {
  const state = createBatchPseudonymState({ randomBytes: () => Buffer.alloc(32, 9) });
  const first = await withBatchPseudonymRegistry(state, async (registry) => registry.assign('PERSON', 'Erika Beispiel'));
  const second = await withBatchPseudonymRegistry(JSON.parse(JSON.stringify(state)), async (registry) =>
    registry.assign('PERSON', 'Erika Beispiel'));
  assert.strictEqual(first, second);
});

await test('surname aliases and collision reservations survive a journal round trip without raw values', async () => {
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

await test('two people sharing a surname produce a stable ambiguous alias instead of rebinding either person', async () => {
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

await test('tampered persisted alias bindings fail closed and never reach the action', async () => {
  const state = createBatchPseudonymState({ randomBytes: () => Buffer.alloc(32, 6) });
  await withBatchPseudonymRegistry(state, async (registry) => registry.assign('PERSON', 'Erika Beispiel'));
  const invalid = structuredClone(state);
  invalid.pseudonym_registry_state.bindings[0][1] = '[PERSON_AAAAAAAAAA]';
  let called = false;
  await assert.rejects(() => withBatchPseudonymRegistry(invalid, async () => { called = true; }),
    (error) => error.code === 'BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE');
  assert.strictEqual(called, false);
});

await test('different batches unlink labels and malformed or incompatible state fails closed', async () => {
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

await test('processing errors survive and an already disposed registry cannot escape the action', async () => {
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

await test('a journal persistence failure still destroys an escaped registry and seed context', async () => {
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

await test('only a new Standalone batch selects readable labels; v1 resumes retain their old labels', async () => {
  const plugin = createBatchPseudonymState({ productChannel: 'plugin' });
  const standalone = createBatchPseudonymState({ productChannel: 'standalone' });
  assert.strictEqual(plugin.pseudonym_contract_version, CONTRACT_VERSION);
  assert.strictEqual(standalone.pseudonym_contract_version, READABLE_CONTRACT_VERSION);
  const legacyLabel = await withBatchPseudonymRegistry(plugin, (registry) => registry.assign('PERSON', 'Max Mustermann'));
  assert.match(legacyLabel, /^\[PERSON_[A-Z2-7]{10}\]$/u);
  const resumedOldStandalone = { ...structuredClone(plugin), product_channel: 'standalone' };
  assert.strictEqual(await withBatchPseudonymRegistry(resumedOldStandalone,
    (registry) => registry.assign('PERSON', 'Max Mustermann')), legacyLabel);
  assert.strictEqual(await withBatchPseudonymRegistry(standalone,
    (registry) => registry.assign('PERSON', 'Max Mustermann')), '[PERSON_001]');
});

await test('Standalone numbered reservations survive restart and new people receive the next free number', async () => {
  const state = createBatchPseudonymState({ productChannel: 'standalone' });
  await withBatchPseudonymRegistry(state, (registry) => {
    assert.strictEqual(registry.assign('PERSON', 'Max Mustermann'), '[PERSON_001]');
    assert.strictEqual(registry.assign('PERSON', 'Anna Beispiel'), '[PERSON_002]');
    assert.strictEqual(registry.assign('PROJECT', 'Projekt Morgenstern'), '[PROJEKT_001]');
  });
  const restored = JSON.parse(JSON.stringify(state));
  await withBatchPseudonymRegistry(restored, (registry) => {
    assert.strictEqual(registry.assign('PERSON', 'Anna Beispiel'), '[PERSON_002]');
    assert.strictEqual(registry.assign('PERSON', 'Max Mustermann'), '[PERSON_001]');
    assert.strictEqual(registry.assign('PERSON', 'Erika Nachfolger'), '[PERSON_003]');
    assert.strictEqual(registry.assign('PROJECT', 'Projekt Morgenstern'), '[PROJEKT_001]');
  });
  assert.doesNotMatch(JSON.stringify(restored), /Max|Mustermann|Anna|Beispiel|Morgenstern|Erika|Nachfolger/u);
});

await test('separate batches have independent numbering and private lookup identities', async () => {
  const one = createBatchPseudonymState({ productChannel: 'standalone' });
  const two = createBatchPseudonymState({ productChannel: 'standalone' });
  await withBatchPseudonymRegistry(one, (registry) => registry.assign('ORG', 'Muster GmbH'));
  await withBatchPseudonymRegistry(two, (registry) => registry.assign('ORG', 'Andere GmbH'));
  assert.strictEqual(one.pseudonym_registry_state.labels[0][0], '[UNTERNEHMEN_001]');
  assert.strictEqual(two.pseudonym_registry_state.labels[0][0], '[UNTERNEHMEN_001]');
  assert.notStrictEqual(one.pseudonym_registry_state.labels[0][1], two.pseudonym_registry_state.labels[0][1]);
  await withBatchPseudonymRegistry(two, (registry) => assert.strictEqual(registry.assign('ORG', 'Muster GmbH'), '[UNTERNEHMEN_002]'));
});

await test('same employer/customer/company identity is profile-independent in either document order', async () => {
  for (const documents of [
    [['Arbeitgeber: Muster GmbH', 'personnel_profile'], ['Kunde: Muster GmbH', 'applicant'], ['Unternehmen: MUSTER GMBH', 'general']],
    [['Unternehmen: Muster GmbH', 'general'], ['Kunde: Muster GmbH', 'personnel_profile'], ['Arbeitgeber: Muster GmbH', 'applicant']]
  ]) {
    let state = createBatchPseudonymState({ productChannel: 'standalone' });
    for (const [source, profile] of documents) {
      const result = await withBatchPseudonymRegistry(state, (registry) => anonymizeMarkdown(source, profile, { registry }));
      assert.ok(result.text.includes('[UNTERNEHMEN_001]'), result.text);
      assert.doesNotMatch(result.text, /Muster|ARBEITGEBER_001|KUNDE_/iu);
      state = JSON.parse(JSON.stringify(state));
    }
    const second = await withBatchPseudonymRegistry(state,
      (registry) => anonymizeMarkdown('Arbeitgeber: Andere GmbH', 'personnel_profile', { registry }));
    assert.ok(second.text.includes('[UNTERNEHMEN_002]'), second.text);
  }
});

await test('ambiguous surnames never silently select one of two known full names in Standalone', async () => {
  let state = createBatchPseudonymState({ productChannel: 'standalone' });
  const first = await withBatchPseudonymRegistry(state, (registry) => anonymizeMarkdown(
    'Name: Anna Müller\nAnsprechpartner: Bernd Müller\nHerr Müller sendet die Unterlagen.', 'customer', { registry }));
  assert.match(first.text, /Name: \[PERSON_001\]/u);
  assert.match(first.text, /Ansprechpartner: \[PERSON_002\]/u);
  assert.match(first.text, /\[PERSON_UNKLAR_001\] sendet/u);
  assert.doesNotMatch(first.text, /Anna|Bernd|Müller/u);
  state = JSON.parse(JSON.stringify(state));
  const second = await withBatchPseudonymRegistry(state, (registry) => anonymizeMarkdown(
    'Name: Bernd Müller\nHerr Müller sendet die Unterlagen.', 'customer', { registry }));
  assert.match(second.text, /Name: \[PERSON_002\]/u);
  assert.match(second.text, /\[PERSON_UNKLAR_001\] sendet/u);
});

await test('async journal errors are awaited before returning and destroy the registry', async () => {
  const state = createBatchPseudonymState({ productChannel: 'standalone' });
  let escaped;
  await assert.rejects(() => withBatchPseudonymRegistry(state, (registry) => {
    escaped = registry;
    return registry.assign('PERSON', 'Max Mustermann');
  }, { async persist() { throw Object.assign(new Error('disk'), { code: 'JOURNAL_WRITE_FAILED' }); } }),
  (error) => error.code === 'JOURNAL_WRITE_FAILED');
  assert.throws(() => escaped.assign('PERSON', 'Max Mustermann'));
});

await test('missing numbered reservations cannot silently restart numbering after recovery', async () => {
  const state = createBatchPseudonymState({ productChannel: 'standalone' });
  assert.deepStrictEqual(state.pseudonym_registry_state, { bindings: [], labels: [] });
  await withBatchPseudonymRegistry(state, (registry) => registry.assign('PERSON', 'Max Mustermann'));
  delete state.pseudonym_registry_state;
  let called = false;
  await assert.rejects(() => withBatchPseudonymRegistry(state, () => { called = true; }),
    (error) => error.code === 'BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE');
  assert.strictEqual(called, false);
});

done();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
