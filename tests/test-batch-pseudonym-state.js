'use strict';

const { createSuite } = require('./helpers');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createBatchJournalStore } = require('../plugins/data-secure/server/gateway/batch-journal-store');
const { PRIVACY_RULESET_VERSION } = require('../plugins/data-secure/server/privacy/policy');
const { CORE_POLICY_FILES, CORE_POLICY_FINGERPRINT, calculateCorePolicyFingerprint } =
  require('../plugins/data-secure/server/core-policy-fingerprint');
const { CONTRACT_VERSION, READABLE_CONTRACT_VERSION } = require('../plugins/data-secure/server/batch-pseudonym-registry');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const {
  createBatchPseudonymState,
  validateBatchPseudonymState,
  withBatchPseudonymRegistry
} = require('../plugins/data-secure/server/batch-pseudonym-context');

const { testAsync: test, done, assert } = createSuite('Restart-stable batch pseudonym state');
// A random base64url HMAC can contain a short name as an incidental substring.
// Raw source words must remain forbidden, but bytes inside an opaque digest
// are not a disclosure of that word. Delimiters also catch JSON keys/values.
const RAW_SOURCE_WORDS = /(?<![A-Za-z0-9_-])(?:Max|Mustermann|Anna|Beispiel|Morgenstern|Erika|Nachfolger)(?![A-Za-z0-9_-])/u;

async function main() {

await test('raw-name oracle distinguishes opaque HMAC substrings from actual source words', () => {
  const opaque = 'p1X9A38gv14_m5mP8IxMLTMaxC7JbkDx_v_HmUUXkCA';
  assert.doesNotMatch(JSON.stringify({ binding: opaque }), RAW_SOURCE_WORDS);
  for (const text of ['Max', 'Max Mustermann', 'Anna Beispiel', 'Projekt Morgenstern', 'Erika Nachfolger', 'Name: Anna']) {
    assert.match(JSON.stringify({ illicit_value: text }), RAW_SOURCE_WORDS, text);
  }
  assert.match(JSON.stringify({ Max: opaque }), RAW_SOURCE_WORDS, 'raw identity keys are also forbidden');
});

await test('a private journal state contains only versioned random seed material', () => {
  const source = Buffer.alloc(32, 7);
  const state = createBatchPseudonymState({ randomBytes: () => source });
  assert.strictEqual(state.pseudonym_contract_version, CONTRACT_VERSION);
  assert.strictEqual(state.pseudonym_ruleset_version, PRIVACY_RULESET_VERSION);
  assert.strictEqual(state.core_policy_fingerprint, CORE_POLICY_FINGERPRINT);
  assert.match(state.core_policy_fingerprint, /^[a-f0-9]{64}$/u);
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
    { ...one, pseudonym_ruleset_version: 'other/1' },
    { ...one, core_policy_fingerprint: '0'.repeat(64) }
  ]) {
    assert.throws(() => validateBatchPseudonymState(invalid),
      (error) => error.code === 'BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE');
    await assert.rejects(() => withBatchPseudonymRegistry(invalid, async () => undefined),
      (error) => error.code === 'BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE');
  }
  const legacy = { ...one };
  delete legacy.core_policy_fingerprint;
  assert.doesNotThrow(() => validateBatchPseudonymState(legacy),
    'a legacy journal with the exact ruleset version remains resumable');
  const incompatibleLegacy = { ...legacy, pseudonym_ruleset_version: 'de-business/2' };
  assert.throws(() => validateBatchPseudonymState(incompatibleLegacy),
    (error) => error.code === 'BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE',
    'a fingerprint-less journal from an older ruleset cannot resume under changed policy');
});

await test('the core-policy fingerprint covers every explicit shared policy file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-policy-fingerprint-'));
  const sourceRoot = path.join(__dirname, '..', 'plugins', 'data-secure', 'server');
  const privacyFiles = fs.readdirSync(path.join(sourceRoot, 'privacy'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:js|json)$/u.test(entry.name))
    .map((entry) => `privacy/${entry.name}`)
    .sort();
  assert.deepStrictEqual(
    CORE_POLICY_FILES.filter((relative) => relative.startsWith('privacy/')).sort(),
    privacyFiles,
    'every privacy implementation or catalogue byte must invalidate a resumed policy context'
  );
  for (const relative of CORE_POLICY_FILES) {
    const target = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, ...relative.split('/')), target);
  }
  assert.strictEqual(calculateCorePolicyFingerprint({ root }), CORE_POLICY_FINGERPRINT);
  for (const relative of CORE_POLICY_FILES) {
    const target = path.join(root, ...relative.split('/'));
    const original = fs.readFileSync(target);
    fs.appendFileSync(target, '\n// changed policy\n');
    assert.notStrictEqual(calculateCorePolicyFingerprint({ root }), CORE_POLICY_FINGERPRINT,
      `${relative} must invalidate the resumable policy context`);
    fs.writeFileSync(target, original);
    assert.strictEqual(calculateCorePolicyFingerprint({ root }), CORE_POLICY_FINGERPRINT,
      `${relative} restoration must restore the exact fingerprint`);
  }
  fs.rmSync(root, { recursive: true, force: true });
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
  assert.doesNotMatch(JSON.stringify(restored), RAW_SOURCE_WORDS);
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

for (const productChannel of ['plugin', 'standalone']) {
await test(`${productChannel}: unlabelled company/person follow-up documents survive actual journal writes and fresh registries`, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-alias-followup-'));
  const token = crypto.randomBytes(32).toString('hex');
  const target = path.join(root, `${token}.json`);
  const store = createBatchJournalStore({ batchPath: () => target, syncParentDirectory: () => true });
  let state = { schema: 'datasecure-batch/2', token, expires_at: '2099-01-01T00:00:00.000Z',
    revision: 1, items: [{ status: 'pending' }], ...createBatchPseudonymState({ productChannel }) };
  const run = async (text) => {
    const result = await withBatchPseudonymRegistry(state,
      (registry) => anonymizeMarkdown(text, 'personnel_profile', { registry }),
      { persist(value) { store.writeState(value); } });
    state = store.readState(token);
    assert.doesNotMatch(fs.readFileSync(target, 'utf8'), /Erika|Müller|Nordstern|Medizin/u);
    return result.text;
  };
  try {
    const first = await run('Kunde: Nordstern Medizin GmbH\nName: Erika Müller\nNordstern Medizin liefert Software.');
    const company = first.match(/^Kunde: (\[[A-Z_0-9]+\])/u)?.[1];
    const person = first.match(/Name: (\[[A-Z_0-9]+\])/u)?.[1];
    assert.ok(company && person, first);
    const following = await run('Nordstern\u00a0Medizin liefert weitere Software. Erika\u2003Mu\u0308ller prüft das. Unbekannte Begriffe bleiben bestehen.');
    assert.ok(following.includes(company) && following.includes(person), following);
    assert.doesNotMatch(following, /Nordstern|Medizin|Erika|Müller/iu);
    assert.ok(following.includes('Unbekannte Begriffe bleiben bestehen.'), following);
    const ambiguity = await run('Kunde: Nordstern Medizin AG\nNordstern Medizin liefert Software.');
    const other = ambiguity.match(/^Kunde: (\[[A-Z_0-9]+\])/u)?.[1];
    assert.ok(other && other !== company, ambiguity);
    const ambiguous = ambiguity.match(/\[(?:ORGANISATION_UNKLAR|UNTERNEHMEN_UNKLAR_001)\]/u)?.[0];
    assert.ok(ambiguous, ambiguity);
    const resumed = await run('Nordstern Medizin liefert Software.');
    assert.strictEqual(resumed, `${ambiguous} liefert Software.`);
  } finally {
    for (const entry of fs.readdirSync(root)) fs.unlinkSync(path.join(root, entry));
    fs.rmdirSync(root);
  }
});

await test(`${productChannel}: company punctuation and both role orders retain exact identity after every document`, async () => {
  for (const name of ['Nordstern & Partner', 'Nordstern + Partner', 'Nordstern - Partner', "Nordstern O'Partner", 'Nordstern O’Partner', 'Nordstern / Partner', 'Nordstern (Europa)']) {
    for (const roles of [['Arbeitgeber', 'Kunde'], ['Kunde', 'Arbeitgeber']]) {
      let state = createBatchPseudonymState({ productChannel });
      const run = async (text) => {
        const result = await withBatchPseudonymRegistry(state,
          (registry) => anonymizeMarkdown(text, 'personnel_profile', { registry }));
        state = JSON.parse(JSON.stringify(state));
        return result.text;
      };
      let firstMarker;
      for (const role of roles) {
        const labelled = await run(`${role}: ${name} GmbH`);
        const marker = labelled.match(/(\[[A-Z_0-9]+\])/u)?.[1];
        assert.ok(marker, labelled);
        if (productChannel === 'standalone' && firstMarker) assert.strictEqual(marker, firstMarker);
        firstMarker ||= marker;
        const bare = await run(`${name} liefert Software.`);
        assert.strictEqual(bare, `${marker} liefert Software.`, `${productChannel} ${role} ${name}`);
        assert.doesNotMatch(bare, /UNKLAR|PROJEKT_/u, 'changing the role alone must not merge or split identities');
      }
    }
  }
});

await test(`${productChannel}: parenthesized exact company alias also survives an unindexed legacy journal`, async () => {
  let state = createBatchPseudonymState({ productChannel });
  const first = await withBatchPseudonymRegistry(state, (registry) => anonymizeMarkdown(
    'Arbeitgeber: Nordstern (Europa) GmbH\nNordstern (Europa) liefert Software.', 'personnel_profile', { registry }));
  const marker = first.text.match(/Arbeitgeber: (\[[A-Z_0-9]+\])/u)?.[1];
  assert.ok(marker, first.text);
  state = JSON.parse(JSON.stringify(state));
  delete state.pseudonym_registry_state.known_alias_index;
  const next = await withBatchPseudonymRegistry(state, (registry) => anonymizeMarkdown(
    'Nordstern (Europa) liefert Software.', 'personnel_profile', { registry }));
  assert.strictEqual(next.text, `${marker} liefert Software.`);
});

await test(`${productChannel}: a known short spelling can change role without becoming a new or ambiguous company`, async () => {
  for (const roles of [['Arbeitgeber', 'Kunde'], ['Kunde', 'Arbeitgeber']]) {
    let state = createBatchPseudonymState({ productChannel });
    await withBatchPseudonymRegistry(state, (registry) => anonymizeMarkdown(
      `${roles[0]}: Nordstern Medizin GmbH`, 'personnel_profile', { registry }));
    state = JSON.parse(JSON.stringify(state));
    const next = await withBatchPseudonymRegistry(state, (registry) => anonymizeMarkdown(
      `${roles[1]}: Nordstern Medizin\nNordstern Medizin liefert Software.`, 'personnel_profile', { registry }));
    const marker = next.text.match(/(\[[A-Z_0-9]+\])/u)?.[1];
    assert.ok(marker && !marker.includes('UNKLAR'), next.text);
    assert.ok(next.text.includes(`${marker} liefert Software.`), next.text);
  }
});
}

done();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
