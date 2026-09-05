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
  let registry = createBatchPseudonymRegistry(secret, options);
  try {
    let expectedMarkers;
    for (const ext of ['.txt', '.md', '.csv', '.docx']) {
      const source = fs.readFileSync(path.join(__dirname,
        '../docs/acceptance/UAT_TEST_KIT/inputs/01-positive', `personnel-profile${ext}`));
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
  } finally { registry.dispose(); secret.fill(0); }
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
    registry.dispose();
    registry = createBatchPseudonymRegistry(secret, { ...options, persistedState: snapshot });
    assert.throws(() => registry.assign('ORG', 'Andere GmbH'),
      (error) => error.code === 'BATCH_PSEUDONYM_INPUT_INVALID');
    assert.deepStrictEqual(registry.exportState(), snapshot, 'failed allocation does not publish an invalid reservation');
  } finally { registry.dispose(); secret.fill(0); }
});

done();
