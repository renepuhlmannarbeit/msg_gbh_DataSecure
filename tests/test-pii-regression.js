'use strict';

// The privacy regression suite. Every case here corresponds to a defect that
// shipped in 3.2.0-rc2 and was only visible once the engine was actually run
// against its own fixture.

const fs = require('fs');
const path = require('path');
const { createSuite, assertAbsent, assertPresent } = require('./helpers');
const pii = require('../plugins/data-secure/server/pii-engine');
const { luhnValid, isAllowedOrg, looksName } = require('../plugins/data-secure/server/privacy/base');
const { resolveSpans } = require('../plugins/data-secure/server/privacy/spans');
const { trimReferenceValue } = require('../plugins/data-secure/server/privacy/structured');

const { test, done, assert } = createSuite('PII regression');

const fixtureDir = path.join(__dirname, 'fixtures');
const expectedDir = path.join(__dirname, 'expected');
const goldenSource = path.join(fixtureDir, 'synthetic-personnel-profile.md');
const goldenExpected = path.join(expectedDir, 'synthetic-personnel-profile.expected.md');

function anonymize(text, profile) {
  return pii.anonymize(text, profile);
}

// Runs the same convergence loop the gateway uses, including the residual gate.
function anonymizeVerified(text, profile) {
  const first = anonymize(text, profile);
  let candidate = first.text;
  let residual = pii.scanResidual(candidate, profile, first.dictionary);
  let passes = 1;
  if (residual.length) {
    const second = anonymize(candidate, profile);
    candidate = second.text;
    passes = 2;
    residual = pii.scanResidual(candidate, profile, [...first.dictionary, ...second.dictionary]);
  }
  return { text: candidate, residual, passes, counts: first.counts, dictionary: first.dictionary };
}

// ---------------------------------------------------------------------------
// Golden file: the whole personnel profile, byte for byte.
// ---------------------------------------------------------------------------

test('personnel profile matches the golden expected output byte for byte', () => {
  const src = fs.readFileSync(goldenSource, 'utf8');
  const actual = anonymize(src, 'personnel_profile').text;

  if (process.env.UPDATE_EXPECTED === '1') {
    fs.writeFileSync(goldenExpected, actual, 'utf8');
    console.log('       (golden file rewritten because UPDATE_EXPECTED=1)');
  }

  const expected = fs.readFileSync(goldenExpected, 'utf8');
  if (actual !== expected) {
    const a = actual.split('\n');
    const b = expected.split('\n');
    const diff = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) diff.push(`  line ${i + 1}\n    expected: ${JSON.stringify(b[i])}\n    actual:   ${JSON.stringify(a[i])}`);
    }
    assert.fail(`golden output differs:\n${diff.slice(0, 12).join('\n')}`);
  }
});

test('golden run removes every synthetic direct identifier', () => {
  const src = fs.readFileSync(goldenSource, 'utf8');
  const { text, residual } = anonymizeVerified(src, 'personnel_profile');

  for (const value of [
    'ERIKA BEISPIEL',
    'Erika Beispiel',
    'Nordlicht Digital',
    'Speicherstraße',
    'Hamburg',
    'HanseCargo',
    'Stadtwerke Beispielstadt',
    'Kundenportal NOVA',
    'Projekt Orion',
    'erika.beispiel@example.invalid',
    '+49 40 555 0101',
    'MA-47110815'
  ]) {
    assertAbsent(text, value, 'identifier');
  }
  assert.deepStrictEqual(residual, [], 'residual gate must be clean');
});

test('golden run preserves the professional content', () => {
  const src = fs.readFileSync(goldenSource, 'utf8');
  const { text } = anonymizeVerified(src, 'personnel_profile');

  for (const value of [
    'Product Owner',
    'Business Analyst',
    'Scrum',
    'SAFe',
    'Jira',
    'Confluence',
    'Miro',
    'User Stories',
    'Öffentlicher Sektor',
    'Fachinformatikerin für Anwendungsentwicklung (IHK)',
    'Product Backlog Refinement',
    '## Qualifikationen',
    '## Zweites Projekt',
    '# SYNTHETISCHER TESTFALL – Mitarbeiterprofil'
  ]) {
    assertPresent(text, value, 'domain content');
  }
});

test('golden run assigns exactly one person pseudonym', () => {
  const src = fs.readFileSync(goldenSource, 'utf8');
  const { counts } = anonymizeVerified(src, 'personnel_profile');
  assert.strictEqual(counts.PERSON, 1, `expected 1 person, got ${counts.PERSON}`);
  assert.strictEqual(counts.CUSTOMER, 2, `expected 2 customers, got ${counts.CUSTOMER}`);
  assert.strictEqual(counts.PROJECT, 2, `expected 2 projects, got ${counts.PROJECT}`);
});

test('markdown structure survives de-identification', () => {
  const src = fs.readFileSync(goldenSource, 'utf8');
  const { text } = anonymizeVerified(src, 'personnel_profile');
  assert.match(text, /^### \[KUNDE_001\] – \[PROJEKT_001\]$/m, 'heading prefix must be kept');
  assert.match(text, /^### \[KUNDE_002\] – \[PROJEKT_002\]$/m, 'heading prefix must be kept');
  assert.ok(!/^\[KUNDE_/m.test(text), 'no project heading may lose its ### prefix');
});

// ---------------------------------------------------------------------------
// BIC: an upper-case German word is not a bank identifier.
// ---------------------------------------------------------------------------

test('upper-case German words are not treated as BIC', () => {
  const src = [
    'TECHNOLOGIEN',
    'SOFTWARE',
    'PROJEKTE',
    'UNTERNEHMEN',
    'VERTRAULICH',
    'ENTWICKLUNG',
    'BERATUNG',
    'TESTFALL',
    'HOFFMANN',
    'KAUFMANN'
  ].join('\n');
  const { text } = anonymizeVerified(src, 'general');
  assertAbsent(text, '[BANK_DATA_REDACTED]', 'bank placeholder');
});

test('an all-caps surname is not eaten before the person rule runs', () => {
  const src = 'Ansprechpartner: PETER HOFFMANN\nTelefon: +49 89 1234567\n';
  const { text } = anonymizeVerified(src, 'customer');
  assertAbsent(text, 'HOFFMANN', 'surname');
  assertAbsent(text, 'PETER', 'given name');
  assertAbsent(text, '[BANK_DATA_REDACTED]', 'bank placeholder');
  assertPresent(text, '[PERSON_001]', 'person pseudonym');
});

test('a labelled BIC is redacted', () => {
  const src = 'IBAN: DE02120300000000202051\nBIC: BYLADEM1001\n';
  const { text } = anonymizeVerified(src, 'general');
  assertAbsent(text, 'BYLADEM1001', 'BIC');
  assertAbsent(text, 'DE02120300000000202051', 'IBAN');
});

test('a bare BIC on the same line as an IBAN is redacted', () => {
  const src = 'Bankverbindung DE02120300000000202051 BYLADEM1001\n';
  const { text } = anonymizeVerified(src, 'general');
  assertAbsent(text, 'BYLADEM1001', 'BIC');
});

// ---------------------------------------------------------------------------
// Unicode boundaries: JavaScript \b does not know umlauts.
// ---------------------------------------------------------------------------

test('names starting with an umlaut are detected', () => {
  const src = 'Ansprechpartner: Özlem Ünal\nProf. Ährens hat zugestimmt.\n';
  const { text } = anonymizeVerified(src, 'customer');
  assertAbsent(text, 'Özlem', 'given name');
  assertAbsent(text, 'Ünal', 'surname');
  assertAbsent(text, 'Ährens', 'surname');
});

test('names ending in sharp s are detected', () => {
  const src = 'Herr Weiß hat den Termin bestätigt.\n';
  const { text } = anonymizeVerified(src, 'contract');
  assertAbsent(text, 'Weiß', 'surname');
  assert.ok(!text.includes('Herr [PERSON'), 'honorific must not be left dangling with a pseudonym');
});

test('organisations starting with an umlaut are detected', () => {
  const src = 'Österreichische Beispiel AG ist Vertragspartei.\n';
  const { text } = anonymizeVerified(src, 'contract');
  assertAbsent(text, 'Österreichische', 'organisation');
});

// ---------------------------------------------------------------------------
// Identity consistency: one human, one pseudonym.
// ---------------------------------------------------------------------------

test('a bare surname later in the document resolves to the same pseudonym', () => {
  const src = [
    'Ansprechpartner: Thomas Müller',
    '',
    'Müller bestätigte den Termin.',
    'Herr Müller sendet die Unterlagen.',
    'Frau Müller ist nicht zuständig.'
  ].join('\n');
  const result = anonymizeVerified(src, 'customer');
  assertAbsent(result.text, 'Müller', 'surname');
  assert.strictEqual(result.counts.PERSON, 1, `expected 1 person, got ${result.counts.PERSON}`);
  const used = [...new Set(result.text.match(/\[PERSON_\d{3}\]/g) || [])];
  assert.deepStrictEqual(used, ['[PERSON_001]'], `expected a single pseudonym, got ${used.join(', ')}`);
});

test('honorifics never become part of a person pseudonym', () => {
  const src = 'Herr Müller und Frau Schneider nehmen teil.\n';
  const result = anonymizeVerified(src, 'contract');
  assert.strictEqual(result.counts.PERSON, 2, `expected 2 persons, got ${result.counts.PERSON}`);
  assertAbsent(result.text, 'Müller', 'surname');
  assertAbsent(result.text, 'Schneider', 'surname');
});

test('a surname alias never corrupts an e-mail address', () => {
  const src = 'Kontakt: Erika Beispiel\nE-Mail: erika.beispiel@example.invalid\n';
  const { text } = anonymizeVerified(src, 'customer');
  assertAbsent(text, 'beispiel@example.invalid', 'mail address');
  assertPresent(text, '[EMAIL_REDACTED]', 'mail placeholder');
  assert.ok(
    !/\[PERSON_\d{3}\][.@]/.test(text),
    'a person pseudonym must never appear inside a mail address'
  );
});

// ---------------------------------------------------------------------------
// The residual gate must never block a document it cannot fix.
// ---------------------------------------------------------------------------

test('an eleven digit order number does not block the residual gate', () => {
  const src = 'Auftrag 12345678901 wurde ausgeliefert.\n';
  const { text, residual } = anonymizeVerified(src, 'customer');
  assert.deepStrictEqual(residual, [], 'residual gate must not block on a plain number');
  assertPresent(text, '12345678901', 'order number');
});

test('a labelled German tax id is redacted', () => {
  const src = 'Steuer-ID: 12345678901\n';
  const { text, residual } = anonymizeVerified(src, 'customer');
  assertAbsent(text, '12345678901', 'tax id');
  assert.deepStrictEqual(residual, [], 'residual gate must be clean');
});

test('a German formatted amount does not block the residual gate', () => {
  const src = 'Gesamtsumme: 1.234.567 EUR netto.\n';
  const { text, residual } = anonymizeVerified(src, 'contract');
  assert.deepStrictEqual(residual, [], 'residual gate must not block on an amount');
  assertPresent(text, '1.234.567', 'amount');
});

test('every identifier class reported by the gate is also removable', () => {
  const { DETECTORS } = require('../plugins/data-secure/server/privacy/structured');
  for (const det of DETECTORS) {
    assert.ok(det.placeholder, `detector ${det.type} reports findings but has no placeholder`);
  }
});

// ---------------------------------------------------------------------------
// Reference numbers and payment data.
// ---------------------------------------------------------------------------

test('labelled reference numbers are redacted', () => {
  const cases = [
    ['Mitarbeiternummer: MA-47110815', 'MA-47110815'],
    ['Personalnummer 0815-4711', '0815-4711'],
    ['Kundennummer: K-99881', 'K-99881'],
    ['Aktenzeichen: 12 O 345/24', '12 O 345/24'],
    ['Rechnungsnummer: RE2026-0042', 'RE2026-0042']
  ];
  for (const [src, value] of cases) {
    const { text } = anonymizeVerified(`${src}\n`, 'customer');
    assertAbsent(text, value, `reference number in ${JSON.stringify(src)}`);
  }
});

test('a reference number does not swallow the following words', () => {
  assert.strictEqual(trimReferenceValue('4711 und weitere'), '4711');
  assert.strictEqual(trimReferenceValue('MA-47110815'), 'MA-47110815');
  assert.strictEqual(trimReferenceValue('ohne Ziffern'), null);
});

test('a Luhn valid card number is redacted and an invalid one is not', () => {
  assert.strictEqual(luhnValid('4111111111111111'), true);
  assert.strictEqual(luhnValid('4111111111111112'), false);
  const { text } = anonymizeVerified('Karte 4111 1111 1111 1111 hinterlegt.\n', 'customer');
  assertAbsent(text, '4111 1111 1111 1111', 'card number');
  const kept = anonymizeVerified('Zählerstand 1234 5678 9012 3456 abgelesen.\n', 'customer');
  assertPresent(kept.text, '1234 5678 9012 3456', 'non-card digit run');
});

test('phone detection uses the same rule for gate and redactor', () => {
  const labelled = anonymizeVerified('Telefon: 040 555 0101\n', 'customer');
  assertAbsent(labelled.text, '040 555 0101', 'labelled phone');
  const intl = anonymizeVerified('Erreichbar unter +49 40 555 0101.\n', 'customer');
  assertAbsent(intl.text, '+49 40 555 0101', 'international phone');
  const notAPhone = anonymizeVerified('Norm DIN 1234-56 gilt weiterhin.\n', 'contract');
  assert.deepStrictEqual(notAPhone.residual, [], 'a norm reference must not block the gate');
});

test('common German two-group phone numbers are redacted', () => {
  for (const value of ['030 1234567', '+49 30 1234567', '040/123456', '0176 12345678']) {
    const { text, residual } = anonymizeVerified(`Telefon: ${value}\n`, 'customer');
    assertAbsent(text, value, `phone number ${value}`);
    assert.deepStrictEqual(residual, [], `residual gate must be clean for ${value}`);
  }
});

test('customer address blocks lose the person, street, city and phone number', () => {
  const src = [
    '# Rechnung',
    '',
    'Max Mustermann',
    'Musterstraße 12a',
    '10115 Berlin',
    'Telefon: 030 1234567',
    'Rechnungsnummer: RE-2026-42'
  ].join('\n');
  const { text, residual } = anonymizeVerified(src, 'customer');
  for (const value of ['Max Mustermann', 'Musterstraße 12a', '10115 Berlin', '030 1234567']) {
    assertAbsent(text, value, 'address-block identifier');
  }
  assert.deepStrictEqual(residual, [], 'the complete released address block must pass verification');
});

test('common German street variants are redacted', () => {
  for (const value of ['Musterstr. 12a', 'Am Markt 7', 'An der Allee 4–6', 'Auf der Höhe 3']) {
    const { text, residual } = anonymizeVerified(value, 'general');
    assertAbsent(text, value, `street address ${value}`);
    assert.deepStrictEqual(residual, [], `residual gate must be clean for ${value}`);
  }
});

// ---------------------------------------------------------------------------
// Allow lists and over-redaction.
// ---------------------------------------------------------------------------

test('the organisation allow list is reachable', () => {
  assert.strictEqual(isAllowedOrg('SAP SE'), true, 'legal form must be stripped before lookup');
  assert.strictEqual(isAllowedOrg('SAFe'), true, 'case-insensitive lookup');
  assert.strictEqual(isAllowedOrg('Nordlicht Digital GmbH'), false);
});

test('technology names are not mistaken for people', () => {
  const src = [
    'Technologien und Methoden:',
    'Spring Boot, Visual Studio, Azure DevOps, Power BI, Red Hat',
    '',
    'Cloud Architect und Data Scientist im Team.',
    'Erstellung von User Stories und Akzeptanzkriterien.'
  ].join('\n');
  const { text, counts } = anonymizeVerified(src, 'personnel_profile');
  for (const value of ['Spring Boot', 'Visual Studio', 'Azure DevOps', 'Power BI', 'Red Hat', 'User Stories']) {
    assertPresent(text, value, 'technology name');
  }
  assert.strictEqual(counts.PERSON, 0, `expected no person, got ${counts.PERSON}`);
});

test('looksName rejects roles, technologies and honorifics', () => {
  assert.strictEqual(looksName('Erika Beispiel'), true);
  assert.strictEqual(looksName('Product Owner'), false);
  assert.strictEqual(looksName('Spring Boot'), false);
  assert.strictEqual(looksName('Herr Müller'), false, 'honorific is not a given name');
  assert.strictEqual(looksName('Zweites Projekt'), false);
  assert.strictEqual(looksName('User Stories'), false);
});

// ---------------------------------------------------------------------------
// Span resolution: the mechanism that replaced the ordered replace passes.
// ---------------------------------------------------------------------------

test('higher priority spans win over overlapping lower priority spans', () => {
  const kept = resolveSpans([
    { start: 0, end: 10, priority: 50, type: 'LOW' },
    { start: 5, end: 20, priority: 90, type: 'HIGH' }
  ]);
  assert.deepStrictEqual(kept.map((s) => s.type), ['HIGH']);
});

test('on equal priority the longer span wins', () => {
  const kept = resolveSpans([
    { start: 0, end: 5, priority: 50, type: 'SHORT' },
    { start: 0, end: 12, priority: 50, type: 'LONG' }
  ]);
  assert.deepStrictEqual(kept.map((s) => s.type), ['LONG']);
});

test('non overlapping spans are all kept in document order', () => {
  const kept = resolveSpans([
    { start: 20, end: 25, priority: 10, type: 'B' },
    { start: 0, end: 5, priority: 10, type: 'A' }
  ]);
  assert.deepStrictEqual(kept.map((s) => s.type), ['A', 'B']);
});

// ---------------------------------------------------------------------------
// Verifier independence.
// ---------------------------------------------------------------------------

test('the residual gate detects a literal the redactor claimed to have removed', () => {
  const findings = pii.scanResidual('Rest: Erika Beispiel bleibt.', 'general', ['Erika Beispiel']);
  assert.ok(
    findings.some((f) => f.type === 'RESIDUAL_ENTITY'),
    'a surviving dictionary literal must be reported'
  );
});

test('the residual gate ignores inserted placeholders', () => {
  const findings = pii.scanResidual('Kontakt: [PERSON_001] / [EMAIL_REDACTED]', 'general', ['Erika Beispiel']);
  assert.deepStrictEqual(findings, []);
});

test('idempotence: a second pass over released text changes nothing', () => {
  const src = fs.readFileSync(goldenSource, 'utf8');
  const once = anonymize(src, 'personnel_profile').text;
  const twice = anonymize(once, 'personnel_profile').text;
  assert.strictEqual(twice, once, 'processing released text again must be a no-op');
});

done();
