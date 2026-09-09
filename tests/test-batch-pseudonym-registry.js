'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');
const pii = require('../plugins/data-secure/server/pii-engine');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const {
  SECRET_BYTES, READABLE_CONTRACT_VERSION, canonicalValue, base32, placeholderForDigest, createBatchPseudonymRegistry
} = require('../plugins/data-secure/server/batch-pseudonym-registry');
const { parseDocumentBuffer } = require('../plugins/data-secure/server/document-parser');
const { collectPersonAnchors } = require('../plugins/data-secure/server/privacy/entities');
const { generate: generateUatFixtures } = require('../docs/acceptance/UAT_TEST_KIT/tools/generate-synthetic-uat-fixtures');

const { test, done, assert } = createSuite('Batch pseudonym registry');

test('canonical form is Unicode-stable and HMAC output is safe Base32', () => {
  assert.strictEqual(canonicalValue('  M\u00fcller\n Beispiel '), canonicalValue('Mu\u0308ller Beispiel'));
  assert.match(base32(Buffer.from([0, 255, 16])), /^[A-Z2-7]+$/u);
});

test('the same entity keeps its deterministic pseudonym across separate documents', () => {
  const secret = crypto.randomBytes(SECRET_BYTES);
  const registry = createBatchPseudonymRegistry(secret);
  const one = pii.anonymize('Ansprechpartner: Erika Beispiel', 'customer', { registry }).text;
  const two = pii.anonymize('Kontaktperson: Erika Beispiel', 'customer', { registry }).text;
  const marker = one.match(/\[PERSON_[A-Z2-7]+\]/u)?.[0];
  assert.ok(marker, 'first document must contain a batch pseudonym');
  assert.ok(two.includes(marker), 'same entity must keep its batch pseudonym');
  assert.doesNotMatch(marker, /\d{3}\]/u, 'legacy per-document counter must not be used');
  registry.dispose();
  secret.fill(0);
});

test('the existing release gate accepts only an injected in-memory batch registry', () => {
  const secret = crypto.randomBytes(SECRET_BYTES);
  const registry = createBatchPseudonymRegistry(secret);
  const first = anonymizeMarkdown('Kundin: Erika Beispiel', 'customer', { registry });
  const second = anonymizeMarkdown('Kontakt: Erika Beispiel', 'customer', { registry });
  const marker = first.text.match(/\[PERSON_[A-Z2-7]+\]/u)?.[0];
  assert.ok(marker, 'the batch registry marker must reach the regular release gate');
  assert.ok(second.text.includes(marker), 'the release gate must retain the same batch mapping');
  assert.strictEqual(Object.hasOwn(first, 'registry'), false, 'a release result must never expose its registry');
  registry.dispose();
  secret.fill(0);
});

test('personnel organizations, employers and locations work through the batch registry', () => {
  const secret = Buffer.alloc(SECRET_BYTES, 3);
  const registry = createBatchPseudonymRegistry(secret);
  const result = pii.anonymize([
    'Arbeitgeber: Interne Arbeitgeber AG',
    'Kunde: Externe Klinik GmbH',
    'Standort: Berlin, Privatstraße 12'
  ].join('\n'), 'personnel_profile', { registry });
  assert.match(result.text, /\[ARBEITGEBER_001\]/u);
  assert.match(result.text, /\[KUNDE_[A-Z2-7]+\]/u);
  assert.doesNotMatch(result.text, /Interne Arbeitgeber|Externe Klinik|Privatstraße/u);
  registry.dispose();
  secret.fill(0);
});

test('different secrets unlink batches while entity kinds remain separated', () => {
  const firstSecret = Buffer.alloc(SECRET_BYTES, 1);
  const secondSecret = Buffer.alloc(SECRET_BYTES, 2);
  const one = createBatchPseudonymRegistry(firstSecret);
  const two = createBatchPseudonymRegistry(secondSecret);
  assert.notStrictEqual(one.assign('PERSON', 'Erika Beispiel'), two.assign('PERSON', 'Erika Beispiel'));
  assert.notStrictEqual(one.assign('PERSON', 'Erika Beispiel'), one.assign('ORG', 'Erika Beispiel'));
  one.dispose();
  two.dispose();
  firstSecret.fill(0);
  secondSecret.fill(0);
});

test('a truncated-label collision deterministically extends rather than merges entities', () => {
  const labels = new Map();
  const first = Buffer.alloc(32, 0);
  const second = Buffer.alloc(32, 0);
  second[7] = 1; // same first ten Base32 characters, different full HMAC value
  const firstLabel = placeholderForDigest('PERSON', first, labels);
  labels.set(firstLabel.placeholder, firstLabel.digestId);
  const secondLabel = placeholderForDigest('PERSON', second, labels);
  assert.notStrictEqual(firstLabel.placeholder, secondLabel.placeholder);
  assert.ok(secondLabel.placeholder.length > firstLabel.placeholder.length);
  first.fill(0);
  second.fill(0);
});

test('registry is memory-only and cannot be used after disposal', () => {
  const secret = crypto.randomBytes(SECRET_BYTES);
  const registry = createBatchPseudonymRegistry(secret);
  registry.assign('CUSTOMER', 'Beispiel Klinik GmbH');
  assert.strictEqual(Object.hasOwn(registry, 'map'), false);
  assert.strictEqual(registry.entriesForKind('CUSTOMER').length, 1);
  const publicCounts = registry.counts;
  assert.ok(Object.isFrozen(publicCounts));
  assert.throws(() => { publicCounts.CUSTOMER = 99; }, TypeError);
  assert.strictEqual(registry.counts.CUSTOMER, 1, 'public counters must not mutate registry state');
  registry.dispose();
  assert.throws(() => registry.entriesForKind('CUSTOMER'), (error) => error.code === 'BATCH_PSEUDONYM_INPUT_INVALID');
  assert.throws(() => registry.assign('CUSTOMER', 'Beispiel Klinik GmbH'),
    (error) => error.code === 'BATCH_PSEUDONYM_INPUT_INVALID');
  secret.fill(0);
});

test('real TXT/Markdown/CSV/DOCX parsers feed one readable identity per full person and company', () => {
  const secret = crypto.randomBytes(SECRET_BYTES);
  const options = { contractVersion: READABLE_CONTRACT_VERSION };
  const fixtureRoot = path.resolve(__dirname, '../docs/acceptance/UAT_TEST_KIT',
    `.tmp-uat-pseudonym-${process.pid}`);
  generateUatFixtures(fixtureRoot);
  let registry = createBatchPseudonymRegistry(secret, options);
  try {
    let expectedMarkers;
    for (const ext of ['.txt', '.md', '.csv', '.docx']) {
      const source = fs.readFileSync(path.join(fixtureRoot, '01-positive', `personnel-profile${ext}`));
      const converted = parseDocumentBuffer(source, ext);
      assert.ok(converted.markdown.length > 100, 'real parser must produce source content');
      const result = anonymizeMarkdown(converted.markdown, ext === '.csv' ? 'general' : 'personnel_profile', { registry });
      const markers = [...new Set(result.text.match(/\[(?:PERSON|UNTERNEHMEN)_\d+\]/gu))].sort();
      assert.ok(markers.includes('[PERSON_001]'), result.text);
      assert.ok(markers.includes('[UNTERNEHMEN_001]'), result.text);
      if (expectedMarkers) assert.deepStrictEqual(markers, expectedMarkers, ext);
      expectedMarkers = markers;
      const snapshot = registry.exportState();
      registry.dispose();
      registry = createBatchPseudonymRegistry(secret, { ...options, persistedState: JSON.parse(JSON.stringify(snapshot)) });
    }
  } finally {
    registry.dispose();
    secret.fill(0);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('readable restores reject mixed versions, malformed counters, duplicate identities and unresolved aliases', () => {
  const secret = Buffer.alloc(SECRET_BYTES, 11);
  const options = { contractVersion: READABLE_CONTRACT_VERSION };
  const registry = createBatchPseudonymRegistry(secret, options);
  try {
    registry.assign('PERSON', 'Max Mustermann');
    const snapshot = registry.exportState();
    for (const label of ['[PERSON_000]', '[PERSON_01]', '[PERSON_0001]', '[PERSON_10001]', '[PERSON_AAAAAAAAAA]']) {
      const invalid = structuredClone(snapshot);
      invalid.labels[0][0] = label;
      invalid.bindings[0][1] = label;
      assert.throws(() => createBatchPseudonymRegistry(secret, { ...options, persistedState: invalid }),
        (error) => error.code === 'BATCH_PSEUDONYM_INPUT_INVALID');
    }
    const duplicate = structuredClone(snapshot);
    duplicate.labels.push(['[PERSON_002]', duplicate.labels[0][1]]);
    assert.throws(() => createBatchPseudonymRegistry(secret, { ...options, persistedState: duplicate }));
    assert.throws(() => createBatchPseudonymRegistry(secret, { persistedState: snapshot }));
    const invalidBinding = structuredClone(snapshot);
    invalidBinding.bindings[0][1] = '[PERSON_002]';
    assert.throws(() => createBatchPseudonymRegistry(secret, { ...options, persistedState: invalidBinding }));
  } finally { registry.dispose(); secret.fill(0); }
});

test('readable organisation namespaces remain unified across direct assignment and aliases', () => {
  const secret = Buffer.alloc(SECRET_BYTES, 12);
  const registry = createBatchPseudonymRegistry(secret, { contractVersion: READABLE_CONTRACT_VERSION });
  try {
    assert.strictEqual(registry.assign('CUSTOMER', 'Muster GmbH'), '[UNTERNEHMEN_001]');
    assert.strictEqual(registry.assign('ORG', '  MUSTER  GMBH '), '[UNTERNEHMEN_001]');
    assert.strictEqual(registry.assign('PERSON', 'Muster GmbH'), '[PERSON_001]');
    assert.strictEqual(registry.assign('ORG', 'Andere GmbH'), '[UNTERNEHMEN_002]');
    assert.strictEqual(registry.lookup('CUSTOMER', 'Andere GmbH'), '[UNTERNEHMEN_002]');
  } finally { registry.dispose(); secret.fill(0); }
});

test('v1 company lookup repopulates the next document dictionary after a restart', () => {
  const secret = Buffer.alloc(SECRET_BYTES, 13);
  let registry = createBatchPseudonymRegistry(secret);
  try {
    const first = anonymizeMarkdown('Unternehmen: Nordstern Medizin IT GmbH', 'general', { registry });
    const marker = first.text.match(/\[ORGANISATION_[A-Z2-7]+\]/u)?.[0];
    assert.ok(marker);
    const snapshot = registry.exportState();
    registry.dispose();
    registry = createBatchPseudonymRegistry(secret, { persistedState: JSON.parse(JSON.stringify(snapshot)) });
    const second = anonymizeMarkdown('| Unternehmen | Nordstern Medizin IT GmbH |', 'general', { registry });
    assert.ok(second.text.includes(marker), second.text);
    assert.doesNotMatch(second.text, /Nordstern|Medizin/u);
    assert.match(marker, /^\[ORGANISATION_[A-Z2-7]+\]$/u, 'plugin labels stay v1');
  } finally { registry.dispose(); secret.fill(0); }
});

test('repeated privacy passes retain readable employer/customer labels and generic profile headings', () => {
  const secret = Buffer.alloc(SECRET_BYTES, 14);
  const registry = createBatchPseudonymRegistry(secret, { contractVersion: READABLE_CONTRACT_VERSION });
  try {
    const first = pii.anonymize('# Mitarbeiterprofil – vollständig synthetisch\nArbeitgeber: Muster GmbH\nKunde: Andere GmbH',
      'personnel_profile', { registry });
    assert.match(first.text, /^# Mitarbeiterprofil – vollständig synthetisch/u);
    assert.match(first.text, /Arbeitgeber: \[UNTERNEHMEN_001\]/u);
    assert.match(first.text, /Kunde: \[UNTERNEHMEN_002\]/u);
    const before = registry.exportState();
    const second = pii.anonymize(first.text, 'personnel_profile', { registry });
    assert.strictEqual(second.text, first.text);
    assert.deepStrictEqual(registry.exportState(), before);
    assert.match(pii.anonymize('# Mitarbeiterprofil – vollständig synthetisch', 'personnel_profile').text,
      /^# Mitarbeiterprofil – vollständig synthetisch/u, 'plain legacy engine also preserves structural headings');
  } finally { registry.dispose(); secret.fill(0); }
});

test('alias types cannot cross entity kinds and readable sequence exhaustion is explicit', () => {
  const secret = Buffer.alloc(SECRET_BYTES, 15);
  const options = { contractVersion: READABLE_CONTRACT_VERSION };
  let registry = createBatchPseudonymRegistry(secret, options);
  try {
    const company = registry.assign('ORG', 'Muster GmbH');
    assert.throws(() => registry.remember('PERSON', 'Max Mustermann', company));
    const snapshot = structuredClone(registry.exportState());
    snapshot.labels[0][0] = '[UNTERNEHMEN_10000]';
    snapshot.bindings[0][1] = '[UNTERNEHMEN_10000]';
    delete snapshot.known_alias_index; // intentionally construct a pre-index sequence-exhaustion state
    registry.dispose();
    registry = createBatchPseudonymRegistry(secret, { ...options, persistedState: snapshot });
    assert.throws(() => registry.assign('ORG', 'Andere GmbH'),
      (error) => error.code === 'BATCH_PSEUDONYM_INPUT_INVALID');
    assert.deepStrictEqual(registry.exportState(), snapshot, 'failed allocation does not publish an invalid reservation');
  } finally { registry.dispose(); secret.fill(0); }
});

for (const contractVersion of ['batch-pseudonym/v1', READABLE_CONTRACT_VERSION]) {
  test(`${contractVersion}: company customer and its short name share one company, never a person`, () => {
    const registry = createBatchPseudonymRegistry(Buffer.alloc(SECRET_BYTES, 21), { contractVersion });
    try {
      const result = anonymizeMarkdown('Kunde: Nordstern Medizin GmbH\nNordstern Medizin liefert Software.\nMedizin ist die Branche.',
        'personnel_profile', { registry });
      const marker = result.text.match(/^Kunde: (\[[A-Z_0-9]+\])/u)?.[1];
      assert.ok(marker, result.text);
      assert.ok(result.text.includes(`${marker} liefert Software.`), result.text);
      assert.ok(result.text.includes('Medizin ist die Branche.'), 'company word must not become a surname alias');
      assert.doesNotMatch(result.text, /\[PERSON_/u);
      assert.doesNotMatch(result.text, /Nordstern/u);
    } finally { registry.dispose(); }
  });

  test(`${contractVersion}: shared company alias is unresolved, not assigned to the first legal entity`, () => {
    for (const companies of [['GmbH', 'AG'], ['AG', 'GmbH']]) {
      const registry = createBatchPseudonymRegistry(Buffer.alloc(SECRET_BYTES, 22), { contractVersion });
      try {
        const result = anonymizeMarkdown(`Arbeitgeber: Nordstern Medizin ${companies[0]}\nKunde: Nordstern Medizin ${companies[1]}\nNordstern Medizin liefert Software.`,
          'personnel_profile', { registry });
        const employer = result.text.match(/^Arbeitgeber: (\[[A-Z_0-9]+\])/u)?.[1];
        const customer = result.text.match(/\nKunde: (\[[A-Z_0-9]+\])/u)?.[1];
        const alias = result.text.match(/\n(\[[A-Z_0-9]+\]) liefert/u)?.[1];
        assert.ok(employer && customer && alias, result.text);
        assert.notStrictEqual(employer, customer, 'full legal identities remain distinct');
        assert.notStrictEqual(alias, employer);
        assert.notStrictEqual(alias, customer);
        assert.match(alias, contractVersion === READABLE_CONTRACT_VERSION
          ? /^\[UNTERNEHMEN_UNKLAR_\d{3,}\]$/u : /^\[ORGANISATION_UNKLAR\]$/u);
        assert.doesNotMatch(result.text, /Nordstern|\[PERSON_/u);
      } finally { registry.dispose(); }
    }
  });

  test(`${contractVersion}: real person customer keeps one person identity in label, table and prose`, () => {
    for (const text of [
      'Kunde: Max Mustermann\nMax Mustermann liefert Software.',
      '| Kunde | Max Mustermann |\nMax Mustermann liefert Software.',
      '| Kunde | Rolle |\n| --- | --- |\n| Max Mustermann | Product Owner |\nMax Mustermann liefert Software.'
    ]) {
      const registry = createBatchPseudonymRegistry(Buffer.alloc(SECRET_BYTES, 23), { contractVersion });
      try {
        const result = anonymizeMarkdown(text, 'personnel_profile', { registry });
        const markers = [...result.text.matchAll(/\[PERSON_[A-Z_0-9]+\]/gu)].map((match) => match[0]);
        assert.strictEqual(markers.length, 2, result.text);
        assert.strictEqual(new Set(markers).size, 1, 'field/table and prose refer to the same person');
        assert.doesNotMatch(result.text, /Max|Mustermann|\[(?:KUNDE|ORGANISATION|UNTERNEHMEN)_/u);
      } finally { registry.dispose(); }
    }
  });

  test(`${contractVersion}: suffixless one-word company customer remains an organisation`, () => {
    const registry = createBatchPseudonymRegistry(Buffer.alloc(SECRET_BYTES, 26), { contractVersion });
    try {
      const result = anonymizeMarkdown('Kunde: medidata', 'personnel_profile', { registry });
      assert.match(result.text, /^Kunde: \[(?:KUNDE|UNTERNEHMEN)_[A-Z_0-9]+\]$/u);
    } finally { registry.dispose(); }
  });

  test(`${contractVersion}: persisted surname aliases require person context at each occurrence after resume`, () => {
    const secret = Buffer.alloc(SECRET_BYTES, 35);
    let registry = createBatchPseudonymRegistry(secret, { contractVersion });
    try {
      const purchaseSeed = anonymizeMarkdown('Ansprechpartner: Mueller Einkauf', 'personnel_profile', { registry });
      const purchaseMarker = purchaseSeed.text.match(/\[PERSON_[A-Z0-9_]+\]/u)?.[0];
      assert.ok(purchaseMarker, purchaseSeed.text);
      const seasonSeed = anonymizeMarkdown('Name: Anna Sommer', 'personnel_profile', { registry });
      const seasonMarker = seasonSeed.text.match(/\[PERSON_[A-Z0-9_]+\]/u)?.[0];
      assert.ok(seasonMarker, seasonSeed.text);
      assert.notStrictEqual(purchaseMarker, seasonMarker);

      const persisted = JSON.parse(JSON.stringify(registry.exportState()));
      assert.doesNotMatch(JSON.stringify(persisted), /Mueller|Einkauf|Anna|Sommer/u);
      registry.dispose();
      registry = createBatchPseudonymRegistry(secret, { contractVersion, persistedState: persisted });
      const beforeProse = JSON.parse(JSON.stringify(registry.exportState()));

      const purchaseProse = 'Der Einkauf hat den Vertrag geprueft. Einkauf und Vertrieb arbeiten zusammen.';
      const seasonProse = 'Im Sommer war das Wetter gut.';
      assert.strictEqual(anonymizeMarkdown(purchaseProse, 'personnel_profile', { registry }).text, purchaseProse);
      assert.strictEqual(anonymizeMarkdown(seasonProse, 'personnel_profile', { registry }).text, seasonProse);
      assert.deepStrictEqual(registry.exportState(), beforeProse,
        'reading ordinary prose must not allocate or mutate a batch identity');

      const mixed = anonymizeMarkdown([
        'Herr Einkauf hat den Vertrag geprueft.',
        'Der Einkauf bleibt fuer Einkauf und Vertrieb zustaendig.',
        'Ansprechpartner: Sommer',
        'Im Sommer war das Wetter gut.'
      ].join('\n'), 'personnel_profile', { registry });
      assert.strictEqual((mixed.text.match(new RegExp(purchaseMarker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'gu')) || []).length, 1,
        mixed.text);
      assert.strictEqual((mixed.text.match(new RegExp(seasonMarker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'gu')) || []).length, 1,
        mixed.text);
      assert.ok(mixed.text.includes('Der Einkauf bleibt fuer Einkauf und Vertrieb zustaendig.'), mixed.text);
      assert.ok(mixed.text.includes('Im Sommer war das Wetter gut.'), mixed.text);

      const table = anonymizeMarkdown([
        '| Ansprechpartner | Rolle |',
        '| --- | --- |',
        '| Sommer | Einkauf |'
      ].join('\n'), 'personnel_profile', { registry });
      assert.ok(table.text.includes(`| ${seasonMarker} | Einkauf |`), table.text);
      const link = anonymizeMarkdown('Ansprechpartner: [Sommer](https://example.com/team)',
        'personnel_profile', { registry });
      assert.ok(link.text.includes(`Ansprechpartner: ${seasonMarker}`), link.text);
      assert.doesNotMatch(link.text, /Sommer/u);

      const company = anonymizeMarkdown('Sommer GmbH liefert Software.', 'personnel_profile', { registry });
      assert.match(company.text, /^\[(?:ORGANISATION|UNTERNEHMEN|KUNDE)_[A-Z0-9_]+\] liefert Software\.$/u);
      assert.doesNotMatch(company.text, /PERSON_/u);
    } finally { registry.dispose(); secret.fill(0); }
  });

  test(`${contractVersion}: a lower-case prose verb after a person label is not part of the identity`, () => {
    const secret = Buffer.alloc(SECRET_BYTES, 36);
    const registry = createBatchPseudonymRegistry(secret, { contractVersion });
    try {
      const sentence = anonymizeMarkdown('Autor: Schmidt schrieb dies.', 'personnel_profile', { registry });
      const marker = sentence.text.match(/\[PERSON_[A-Z0-9_]+\]/u)?.[0];
      assert.ok(marker, sentence.text);
      assert.strictEqual(sentence.text, `Autor: ${marker} schrieb dies.`);

      const nameOnly = anonymizeMarkdown('Autor: Schmidt', 'personnel_profile', { registry });
      assert.strictEqual(nameOnly.text, `Autor: ${marker}`,
        'the same labelled surname must reuse the identity instead of allocating a prose-bound one');

      const noPunctuationAnchors = collectPersonAnchors('Autor: Schmidt schrieb dies', 'personnel_profile');
      assert.deepStrictEqual([...new Set(noPunctuationAnchors.map(({ value }) => value))], ['Schmidt'],
        'the value boundary must not depend on final punctuation');

      const inlineAnchors = collectPersonAnchors('Im Bericht steht Autor: Schmidt schrieb dies.', 'general');
      assert.deepStrictEqual([...new Set(inlineAnchors.map(({ value }) => value))], ['Schmidt'],
        'an inline label must use the same case-bound value parser as a line label');
      const upperLabelAnchors = collectPersonAnchors('AUTOR: Schmidt schrieb dies', 'personnel_profile');
      assert.deepStrictEqual([...new Set(upperLabelAnchors.map(({ value }) => value))], ['Schmidt'],
        'label casing must not weaken the case-bound value parser');

      assert.strictEqual(registry.lookup('PERSON', 'Schmidt schrieb'), null,
        'lower-case prose must never become a persisted person alias');

      const fullNameSentence = anonymizeMarkdown('Autor: Anna Beispiel schrieb dies.', 'personnel_profile', { registry });
      const fullNameMarker = fullNameSentence.text.match(/\[PERSON_[A-Z0-9_]+\]/u)?.[0];
      assert.ok(fullNameMarker, fullNameSentence.text);
      assert.strictEqual(fullNameSentence.text, `Autor: ${fullNameMarker} schrieb dies.`);
      const fullNameOnly = anonymizeMarkdown('Autor: Anna Beispiel', 'personnel_profile', { registry });
      assert.strictEqual(fullNameOnly.text, `Autor: ${fullNameMarker}`,
        'a complete proper name before prose must remain one stable identity');

      const sentenceTerminated = collectPersonAnchors('Ansprechpartner: Deutsche Telekom.', 'contract');
      assert.deepStrictEqual([...new Set(sentenceTerminated.map(({ value }) => value))], ['Deutsche Telekom'],
        'terminal punctuation must not suppress an explicitly labelled person occurrence');

      const contactLine = anonymizeMarkdown('Kontakt: Alice Beispiel, alice@example.test', 'general', { registry });
      assert.match(contactLine.text, /^Kontakt: \[PERSON_[A-Z0-9_]+\], \[EMAIL_REDACTED\]$/u,
        'a following contact value must remain separate from the labelled person identity');

      const tableCellAnchors = collectPersonAnchors(
        '| Erfahrung<br>Name: Erika Beispiel | Kontakt: erika.beispiel@example.org |',
        'personnel_profile'
      );
      assert.ok(tableCellAnchors.some(({ value }) => value === 'Erika Beispiel'),
        'a rendered structural cell boundary must terminate the labelled person value');

      const lowerCaseLabel = anonymizeMarkdown('autor: anna beispiel', 'personnel_profile', { registry });
      assert.match(lowerCaseLabel.text, /^autor: \[PERSON_[A-Z0-9_]+\]$/u,
        'case-insensitive labels and explicitly labelled lower-case names remain supported');
    } finally { registry.dispose(); secret.fill(0); }
  });

  test(`${contractVersion}: explicit person occurrence remains a person beside a matching company short name`, () => {
    const registry = createBatchPseudonymRegistry(Buffer.alloc(SECRET_BYTES, 24), { contractVersion });
    try {
      const result = anonymizeMarkdown('Kunde: Nordstern Medizin GmbH\nName: Nordstern Medizin\nNordstern Medizin liefert Software.',
        'personnel_profile', { registry });
      assert.match(result.text, /\nName: \[PERSON_[A-Z_0-9]+\]/u);
      const customer = result.text.match(/^Kunde: (\[[A-Z_0-9]+\])/u)?.[1];
      assert.ok(customer && result.text.includes(`${customer} liefert Software.`), result.text);
      assert.doesNotMatch(result.text, /Nordstern/u);
    } finally { registry.dispose(); }
  });

  test(`${contractVersion}: quoted and listed person fields keep their type beside company aliases after resume`, () => {
    for (const prefix of ['- ', '* ', '+ ', '> ', '> - ', '  > + ']) {
      const secret = Buffer.alloc(SECRET_BYTES, 27);
      let registry = createBatchPseudonymRegistry(secret, { contractVersion });
      try {
        const source = `${prefix}Kunde: Nordstern Medizin GmbH\n${prefix}Name: Nordstern Medizin\nNordstern Medizin liefert Software.`;
        const first = anonymizeMarkdown(source, 'personnel_profile', { registry });
        const company = first.text.match(/Kunde: (\[[A-Z_0-9]+\])/u)?.[1];
        const person = first.text.match(/Name: (\[PERSON_[A-Z_0-9]+\])/u)?.[1];
        assert.ok(company && !company.startsWith('[PERSON_'), first.text);
        assert.ok(person && person !== company, first.text);
        assert.ok(first.text.includes(`${company} liefert Software.`), 'an explicit person field must not retag unlabelled company occurrences');
        assert.doesNotMatch(first.text, /Nordstern|Medizin/u);
        const state = JSON.parse(JSON.stringify(registry.exportState()));
        registry.dispose();
        registry = createBatchPseudonymRegistry(secret, { contractVersion, persistedState: state });
        const resumed = anonymizeMarkdown(source, 'personnel_profile', { registry });
        assert.strictEqual(resumed.text, first.text, 'typed identities and structural prefixes must survive resume unchanged');
      } finally { registry.dispose(); secret.fill(0); }
    }
  });
}

test('readable company alias ambiguity survives serialization without merging full names', () => {
  const secret = Buffer.alloc(SECRET_BYTES, 25);
  const options = { contractVersion: READABLE_CONTRACT_VERSION };
  let registry = createBatchPseudonymRegistry(secret, options);
  try {
    anonymizeMarkdown('Kunde: Nordstern Medizin GmbH\nNordstern Medizin liefert Software.', 'personnel_profile', { registry });
    const snapshot = registry.exportState();
    registry.dispose();
    registry = createBatchPseudonymRegistry(secret, { ...options, persistedState: JSON.parse(JSON.stringify(snapshot)) });
    const second = anonymizeMarkdown('Kunde: Nordstern Medizin AG\nNordstern Medizin liefert Software.', 'personnel_profile', { registry });
    assert.match(second.text, /^Kunde: \[UNTERNEHMEN_002\]/u);
    assert.match(second.text, /\[UNTERNEHMEN_UNKLAR_001\] liefert Software\./u);
    assert.strictEqual(registry.lookup('ORG', 'Nordstern Medizin GmbH'), '[UNTERNEHMEN_001]');
    assert.strictEqual(registry.lookup('ORG', 'Nordstern Medizin AG'), '[UNTERNEHMEN_002]');
    const repeated = anonymizeMarkdown('Kunde: Nordstern Medizin GmbH\nNordstern Medizin liefert Software.', 'personnel_profile', { registry });
    assert.match(repeated.text, /^Kunde: \[UNTERNEHMEN_001\]/u);
    assert.match(repeated.text, /\[UNTERNEHMEN_UNKLAR_001\] liefert Software\./u);
    const finalSnapshot = registry.exportState();
    registry.dispose();
    registry = createBatchPseudonymRegistry(secret, { ...options, persistedState: JSON.parse(JSON.stringify(finalSnapshot)) });
    const aliasOnly = anonymizeMarkdown('Kunde: Nordstern Medizin\nNordstern Medizin liefert Software.', 'personnel_profile', { registry });
    assert.strictEqual(aliasOnly.text, 'Kunde: [UNTERNEHMEN_UNKLAR_001]\n[UNTERNEHMEN_UNKLAR_001] liefert Software.');
  } finally { registry.dispose(); secret.fill(0); }
});

for (const contractVersion of ['batch-pseudonym/v1', READABLE_CONTRACT_VERSION]) {
  test(`${contractVersion}: exact membership index survives restore without guessing unknown words`, () => {
    const secret = Buffer.alloc(32, 31);
    let registry = createBatchPseudonymRegistry(secret, { contractVersion });
    try {
      const person = registry.assign('PERSON', 'Erika Müller');
      const company = registry.assign('ORG', 'Nordstern & Partner');
      const state = JSON.parse(JSON.stringify(registry.exportState()));
      assert.doesNotMatch(JSON.stringify(state), /Erika|Müller|Nordstern|Partner/u);
      assert.strictEqual(state.known_alias_index.schema, 'datasecure-known-alias-index/1');
      registry.dispose();
      registry = createBatchPseudonymRegistry(secret, { contractVersion, persistedState: state });
      const before = registry.exportState().labels.length;
      const hits = registry.matchKnownAliases('ERIKA\u00a0MU\u0308LLER arbeitet mit Nordstern\u2003&\tPartner. Eine unbekannte Wolke bleibt erhalten.');
      assert.ok(hits.some((hit) => hit.kind === 'PERSON' && hit.placeholder === person));
      assert.ok(hits.some((hit) => hit.kind === 'ORG' && hit.placeholder === company));
      assert.strictEqual(registry.exportState().labels.length, before, 'membership checks do not create identities');
      assert.ok(!hits.some((hit) => /unbekannte|wolke/u.test(hit.value)));
    } finally { registry.dispose(); secret.fill(0); }
  });

  test(`${contractVersion}: removed, stale and changed indexes use a complete fallback; malformed indexes fail closed`, () => {
    const secret = Buffer.alloc(32, 32);
    let registry = createBatchPseudonymRegistry(secret, { contractVersion });
    try {
      registry.assign('ORG', 'Nordstern Medizin');
      const state = JSON.parse(JSON.stringify(registry.exportState()));
      for (const modify of [
        (value) => { delete value.known_alias_index; },
        (value) => { value.known_alias_index.starts = []; },
        (value) => { value.known_alias_index.attestation = 'A'.repeat(43); }
      ]) {
        const changed = structuredClone(state);
        modify(changed);
        const restored = createBatchPseudonymRegistry(secret, { contractVersion, persistedState: changed });
        try {
          assert.ok(restored.matchKnownAliases('Nordstern Medizin liefert.').some((hit) => hit.kind === 'ORG'));
          assert.strictEqual(Object.hasOwn(restored.exportState(), 'known_alias_index'), false);
        } finally { restored.dispose(); }
      }
      const legacyState = structuredClone(state);
      delete legacyState.known_alias_index;
      const legacy = createBatchPseudonymRegistry(secret, { contractVersion, persistedState: legacyState });
      let changed;
      try {
        legacy.assign('ORG', 'Südstern Systeme');
        changed = legacy.exportState();
      } finally { legacy.dispose(); }
      // Simulate an older writer retaining an opaque index while adding aliases.
      const stale = { ...changed, known_alias_index: state.known_alias_index };
      const restored = createBatchPseudonymRegistry(secret, { contractVersion, persistedState: stale });
      try { assert.ok(restored.matchKnownAliases('Südstern Systeme liefert.').some((hit) => hit.kind === 'ORG')); }
      finally { restored.dispose(); }
      for (const mutate of [
        (value) => { value.known_alias_index.starts = ['Nordstern']; },
        (value) => { value.known_alias_index.schema = 'future/99'; },
        (value) => { value.known_alias_index.starts.push(value.known_alias_index.starts[0]); },
        (value) => { value.known_alias_index.raw = 'Nordstern Medizin'; }
      ]) {
        const invalid = structuredClone(state); mutate(invalid);
        assert.throws(() => createBatchPseudonymRegistry(secret, { contractVersion, persistedState: invalid }));
      }
      assert.notStrictEqual(Object.keys(state).sort().join(','), 'bindings,labels', 'old exact-shape readers reject indexed snapshots');
    } finally { registry.dispose(); secret.fill(0); }
  });
}

test('legacy role metadata cannot collide with ordinary entity namespaces or contain public role labels', () => {
  const secret = Buffer.alloc(32, 33);
  const registry = createBatchPseudonymRegistry(secret);
  try {
    registry.rememberOrganizationAlias('Nordstern Medizin', 'Nordstern Medizin GmbH', '[ARBEITGEBER_001]');
    const project = registry.assign('PROJECT', 'Nordstern Medizin');
    assert.notStrictEqual(project, registry.lookup('ORG', 'Nordstern Medizin'));
    const state = JSON.parse(JSON.stringify(registry.exportState()));
    assert.doesNotMatch(JSON.stringify(state), /ARBEITGEBER_001|Nordstern|Medizin/u);
    const restored = createBatchPseudonymRegistry(secret, { persistedState: state });
    try {
      assert.strictEqual(restored.lookup('ORG', 'Nordstern Medizin'), '[ARBEITGEBER_001]');
      assert.strictEqual(restored.assign('PROJECT', 'Nordstern Medizin'), project);
    } finally { restored.dispose(); }
    state.bindings[0][1] = '[ARBEITGEBER_001]';
    assert.throws(() => createBatchPseudonymRegistry(secret, { persistedState: state }));
  } finally { registry.dispose(); secret.fill(0); }
});

test('legacy binding, label and multi-binding role allocations fail before making the journal unloadable', () => {
  const secret = Buffer.alloc(32, 34);
  const initial = createBatchPseudonymRegistry(secret);
  let base;
  try { initial.assign('PERSON', 'Erika Beispiel'); base = structuredClone(initial.exportState()); }
  finally { initial.dispose(); }
  delete base.known_alias_index;
  const binding = (i) => [crypto.createHash('sha256').update(`synthetic-${i}`).digest('base64url'), base.labels[0][0]];
  for (const count of [9999, 10000]) {
    const state = { labels: base.labels, bindings: Array.from({ length: count }, (_, i) => binding(i)) };
    const restored = createBatchPseudonymRegistry(secret, { persistedState: state });
    try {
      const before = restored.exportState();
      assert.throws(() => restored.rememberOrganizationAlias('Nordstern Medizin', 'Nordstern Medizin GmbH', '[ARBEITGEBER_001]'));
      if (count === 10000) assert.throws(() => restored.assign('PERSON', 'Neue Person'));
      assert.deepStrictEqual(restored.exportState(), before);
      const again = createBatchPseudonymRegistry(secret, { persistedState: restored.exportState() }); again.dispose();
    } finally { restored.dispose(); }
  }
  const full = createBatchPseudonymRegistry(secret);
  let fullState;
  try {
    for (let i = 0; i < 10000; i++) full.assign('PROJECT', `Projekt ${i}`);
    fullState = { labels: full.exportState().labels, bindings: [] };
  } finally { full.dispose(); }
  const labelFull = createBatchPseudonymRegistry(secret, { persistedState: fullState });
  try {
    const before = labelFull.exportState();
    assert.throws(() => labelFull.assign('PERSON', 'Neue Person'));
    assert.throws(() => labelFull.rememberOrganizationAlias('Nordstern Medizin', 'Nordstern Medizin GmbH', '[ARBEITGEBER_001]'));
    assert.deepStrictEqual(labelFull.exportState(), before);
  } finally { labelFull.dispose(); secret.fill(0); }
});

test('long supported company spellings are not silently cut to ten words, while over-bound aliases stop explicitly', () => {
  const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 35), { contractVersion: READABLE_CONTRACT_VERSION });
  try {
    const value = 'A B C D E F G H I J K L M N O P Q R S T GmbH';
    const marker = registry.assign('ORG', value);
    assert.ok(registry.matchKnownAliases(`${value} liefert Software.`).some((hit) => hit.placeholder === marker));
    const before = registry.exportState();
    assert.throws(() => registry.assign('ORG', 'A'.repeat(161)), (error) => error.code === 'TEXT_TOO_LARGE');
    assert.deepStrictEqual(registry.exportState(), before);
  } finally { registry.dispose(); }
});

test('the normal restored index probes unique text tokens rather than every possible alias window', () => {
  const secret = Buffer.alloc(32, 36);
  const initial = createBatchPseudonymRegistry(secret, { contractVersion: READABLE_CONTRACT_VERSION });
  let state;
  try { initial.assign('ORG', 'Nordstern Medizin'); state = JSON.parse(JSON.stringify(initial.exportState())); }
  finally { initial.dispose(); }
  const registry = createBatchPseudonymRegistry(secret, { contractVersion: READABLE_CONTRACT_VERSION, persistedState: state });
  const createHmac = crypto.createHmac;
  let probes = 0;
  crypto.createHmac = function(...args) { probes++; return createHmac.apply(this, args); };
  try {
    const text = Array.from({ length: 25000 }, (_, i) => `wort${i.toString(36)}`).join(' ') + ' Nordstern Medizin';
    const hits = registry.matchKnownAliases(text);
    assert.ok(hits.some((hit) => hit.kind === 'ORG'));
    assert.ok(probes < 26000, `bounded start filter used ${probes} probes for 25,000 unknown words`);
  } finally { crypto.createHmac = createHmac; registry.dispose(); secret.fill(0); }
});

test('a pre-index journal keeps exact short matching but stops a hostile alias search at a fixed probe budget', () => {
  const secret = Buffer.alloc(32, 37);
  const initial = createBatchPseudonymRegistry(secret);
  let state;
  let marker;
  try {
    marker = initial.assign('PERSON', 'Erika Beispiel');
    state = structuredClone(initial.exportState());
    delete state.known_alias_index;
  } finally { initial.dispose(); }
  const short = createBatchPseudonymRegistry(secret, { persistedState: state });
  try {
    assert.ok(short.matchKnownAliases('Erika Beispiel dokumentiert den Stand.')
      .some((hit) => hit.placeholder === marker));
  } finally { short.dispose(); }

  const bounded = createBatchPseudonymRegistry(secret, { persistedState: state });
  const createHmac = crypto.createHmac;
  let probes = 0;
  crypto.createHmac = function(...args) { probes++; return createHmac.apply(this, args); };
  try {
    const text = Array.from({ length: 3000 }, (_, i) => `wort${i.toString(36)}`).join(' ');
    assert.throws(() => bounded.matchKnownAliases(text),
      (error) => error.code === 'BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE' && /Originaldateien neu auswählen/u.test(error.message));
    assert.ok(probes <= 100_010, `legacy scan used ${probes} HMAC probes`);
  } finally {
    crypto.createHmac = createHmac;
    bounded.dispose();
    secret.fill(0);
  }
});

test('a pre-index journal also bounds highly repetitive alias windows despite cache hits', () => {
  const secret = Buffer.alloc(32, 38);
  const initial = createBatchPseudonymRegistry(secret);
  let state;
  try {
    initial.assign('PERSON', 'Erika Beispiel');
    state = structuredClone(initial.exportState());
    delete state.known_alias_index;
  } finally { initial.dispose(); }
  const registry = createBatchPseudonymRegistry(secret, { persistedState: state });
  try {
    assert.throws(() => registry.matchKnownAliases('a '.repeat(60_000)),
      (error) => error.code === 'BATCH_PSEUDONYM_CONTEXT_UNAVAILABLE');
  } finally { registry.dispose(); secret.fill(0); }
});

done();
