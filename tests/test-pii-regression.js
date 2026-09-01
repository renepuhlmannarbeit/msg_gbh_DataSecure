'use strict';

// The privacy regression suite. Every case here corresponds to a defect that
// shipped in 3.2.0-rc2 and was only visible once the engine was actually run
// against its own fixture.

const fs = require('fs');
const path = require('path');
const { createSuite, assertAbsent, assertPresent } = require('./helpers');
const pii = require('../plugins/data-secure/server/pii-engine');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const { luhnValid, isAllowedOrg, looksName } = require('../plugins/data-secure/server/privacy/base');
const { resolveSpans } = require('../plugins/data-secure/server/privacy/spans');
const { trimReferenceValue } = require('../plugins/data-secure/server/privacy/structured');
const { collectHeaderNameCandidates } = require('../plugins/data-secure/server/privacy/entities');
const { credentialIssuerAmbiguities } = require('../plugins/data-secure/server/privacy/credentials');

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
  let strongPersonAnchor = first.strongPersonAnchor === true;
  let residual = pii.scanResidual(candidate, profile, first.dictionary, { strongPersonAnchor });
  let passes = 1;
  if (residual.length) {
    const second = anonymize(candidate, profile);
    candidate = second.text;
    passes = 2;
    strongPersonAnchor ||= second.strongPersonAnchor === true;
    residual = pii.scanResidual(candidate, profile, [...first.dictionary, ...second.dictionary], {
      strongPersonAnchor
    });
  }
  return { text: candidate, residual, passes, counts: first.counts, dictionary: first.dictionary };
}

// ---------------------------------------------------------------------------
// Golden file: the whole personnel profile, byte for byte.
// ---------------------------------------------------------------------------

test('personnel profile matches the golden expected output byte for byte', () => {
  const src = fs.readFileSync(goldenSource, 'utf8');
  const actual = anonymize(src, 'personnel_profile').text;

  if (process.argv.includes('--update')) {
    fs.writeFileSync(goldenExpected, actual, 'utf8');
    console.log('       (golden file rewritten because --update was passed)');
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

test('labelled Greek, Cyrillic and CJK names are removed and pass the residual gate', () => {
  for (const [label, name] of [
    ['Όνομα', 'Νίκος Παπαδόπουλος'],
    ['Имя', 'Александр Иванов'],
    ['姓名', '王小明'],
    ['氏名', '山田太郎'],
    ['이름', '김민준']
  ]) {
    const { text, residual } = anonymizeVerified(`${label}: ${name}\nRolle: Softwareentwickler`, 'personnel_profile');
    assertAbsent(text, name, `${label} name`);
    assertPresent(text, '[PERSON_001]', `${label} placeholder`);
    assert.deepStrictEqual(residual, [], `${label} residual gate`);
  }
});

test('a standalone CJK name in a personnel-profile header is removed', () => {
  const { text, residual } = anonymizeVerified('王小明\nQualifikationen\nJava und SQL', 'personnel_profile');
  assertAbsent(text, '王小明', 'CJK header name');
  assert.deepStrictEqual(residual, []);
});

test('standalone CJK professional content outside a profile header is preserved', () => {
  const { text } = anonymizeVerified('## Projekterfahrung\n人工知能\nRolle: Developer', 'personnel_profile');
  assertPresent(text, '人工知能', 'CJK professional content');
});

test('business project periods stay exact while labelled birth dates are removed', () => {
  const src = [
    'ERIKA BEISPIEL',
    'Zeitraum: 01/2024 – 08/2026',
    'Geburtsdatum: 14.03.1987'
  ].join('\n');
  const { text } = anonymizeVerified(src, 'personnel_profile');
  assertPresent(text, 'Zeitraum: 01/2024 – 08/2026', 'business period');
  assertAbsent(text, '14.03.1987', 'birth date');
  assertPresent(text, '[DATE_REDACTED]', 'birth-date placeholder');
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

test('unknown credentials are preserved by section while the same issuer as employer is anonymized', () => {
  const src = [
    'MAX MUSTERMANN',
    'Zertifizierungen',
    'Example Learning GmbH Quantum Validation Expert (QVE)',
    'Qualifikationen',
    'Arbeitgeber: Example Learning GmbH'
  ].join('\n');
  const { text, residual } = anonymizeVerified(src, 'personnel_profile');
  assertPresent(text, 'Example Learning GmbH Quantum Validation Expert (QVE)', 'unknown credential and issuer');
  assertPresent(text, 'Arbeitgeber: [ARBEITGEBER_001]', 'employer placeholder');
  assert.deepStrictEqual(residual, [], 'preserved issuer must not fail the residual gate');
});

test('credential context works in prose without a certification heading', () => {
  const src = [
    'MAX MUSTERMANN',
    'Certified Tester Foundation Level, ausgestellt durch Example Board e.V.',
    'Microsoft Azure Administrator Associate',
    'AWS Certified Developer – Associate',
    'IIBA Certificate in Product Ownership Analysis (CPOA)',
    'IREB Certified Professional for Requirements Engineering (CPRE)',
    'UXQB Certified Professional for Usability and User Experience (CPUX-F)',
    'PMI Professional in Business Analysis (PMI-PBA)',
    'Linux Foundation Certified System Administrator (LFCS)',
    'Cloud Native Computing Foundation Certified Kubernetes Administrator (CKA)',
    'Red Hat Certified Engineer (RHCE)',
    'HL7 FHIR Foundational Implementer',
    'HIMSS Certified Professional in Healthcare Information and Management Systems (CPHIMS)',
    'IHE Certified Professional – IHE Foundations (IHE-CPP)'
  ].join('\n');
  const { text, residual } = anonymizeVerified(src, 'personnel_profile');
  assertPresent(text, 'Example Board e.V.', 'issuer in credential prose');
  assertPresent(text, 'Certified Tester Foundation Level', 'credential title');
  assertPresent(text, 'Microsoft Azure Administrator Associate', 'Microsoft credential');
  assertPresent(text, 'AWS Certified Developer – Associate', 'AWS credential');
  assertPresent(text, 'IIBA Certificate in Product Ownership Analysis (CPOA)', 'IIBA credential');
  assertPresent(text, 'IREB Certified Professional for Requirements Engineering (CPRE)', 'IREB credential');
  assertPresent(text, 'UXQB Certified Professional for Usability', 'UXQB credential');
  assertPresent(text, 'PMI Professional in Business Analysis (PMI-PBA)', 'PMI credential');
  assertPresent(text, 'Linux Foundation Certified System Administrator (LFCS)', 'Linux Foundation credential');
  assertPresent(text, 'Certified Kubernetes Administrator (CKA)', 'CNCF credential');
  assertPresent(text, 'Red Hat Certified Engineer (RHCE)', 'Red Hat credential');
  assertPresent(text, 'HL7 FHIR Foundational Implementer', 'HL7 credential');
  assertPresent(text, 'HIMSS Certified Professional', 'HIMSS credential');
  assertPresent(text, 'IHE Certified Professional – IHE Foundations (IHE-CPP)', 'IHE credential');
  assert.deepStrictEqual(residual, [], 'credential prose must pass verification');
});

test('catalog-only issuer matches require a local decision while explicit certification context does not', () => {
  const ambiguous = 'Microsoft Azure Administrator Associate';
  const ambiguousOutput = anonymizeMarkdown(ambiguous, 'personnel_profile').text;
  assert.strictEqual(credentialIssuerAmbiguities(ambiguous, ambiguousOutput).length, 1);
  assert.strictEqual(
    credentialIssuerAmbiguities('Zertifizierungen\nMicrosoft Azure Administrator Associate', 'Zertifizierungen\nMicrosoft Azure Administrator Associate').length,
    0
  );
  assert.strictEqual(
    credentialIssuerAmbiguities('Microsoft Certified: Azure Administrator Associate', 'Microsoft Certified: Azure Administrator Associate').length,
    0
  );
  assert.strictEqual(
    credentialIssuerAmbiguities('Arbeitgeber: Microsoft\nRolle: Developer', 'Arbeitgeber: [ARBEITGEBER_001]\nRolle: Developer').length,
    0
  );
  assert.strictEqual(
    credentialIssuerAmbiguities(
      'Agile Frameworks: Kanban, Scaled Agile Framework (SAFe), Scrum',
      'Agile Frameworks: Kanban, Scaled Agile Framework (SAFe), Scrum'
    ).length,
    0,
    'ordinary framework names must not be mistaken for certification codes'
  );
  assert.strictEqual(
    credentialIssuerAmbiguities(
      'Weiterentwicklung der SAP-Commerce-Plattform',
      'Weiterentwicklung der SAP-Commerce-Plattform'
    ).length,
    0,
    'PL at the start of Plattform must not be treated as an uppercase certification code'
  );
});

test('domain-shaped credential issuers stay while verification URLs are redacted', () => {
  const src = [
    'MAX MUSTERMANN',
    'Zertifizierungen',
    'Scrum.org Professional Scrum Master II (PSM II)',
    'Verifikation: https://scrum.org/certificates/private-4711'
  ].join('\n');
  const { text, residual } = anonymizeVerified(src, 'personnel_profile');
  assertPresent(text, 'Scrum.org Professional Scrum Master II (PSM II)', 'domain-shaped issuer');
  assertAbsent(text, 'private-4711', 'verification URL');
  assertPresent(text, '[URL_REDACTED]', 'URL placeholder');
  assert.deepStrictEqual(residual, [], 'issuer and redacted verification URL must pass verification');
});

test('OCR span classification protects issuers but still detects certificate-holder names', () => {
  const src = 'Zertifikat für Max Mustermann, ausgestellt durch Example Board e.V.';
  const spans = pii.sensitiveSpans(src, 'personnel_profile');
  assert.ok(spans.some((s) => s.type === 'PERSON' && /Max Mustermann/i.test(s.text)), 'holder name must remain sensitive');
  assert.ok(!spans.some((s) => /Example Board|Board e\.V\./i.test(s.text)), 'issuer must remain professional content');
});

test('known technology brands with a legal form are still anonymized as customers', () => {
  const src = 'MAX MUSTERMANN\nKunde: SAP SE\nRolle: Business Analyst';
  const { text, residual } = anonymizeVerified(src, 'personnel_profile');
  assertAbsent(text, 'SAP SE', 'customer organisation');
  assert.deepStrictEqual(residual, [], 'customer organisation must be removed');
});

test('issuer and role words in project prose do not protect a customer', () => {
  const src = [
    'MAX MUSTERMANN',
    'Projektkunde: Example Health GmbH',
    'Weiterentwicklung des Portals der Example Health GmbH auf Basis von SAP Commerce. ' +
      'Die Rolle wechselte vom Product Owner zum Scrum Master; weitere technische Aufgaben ' +
      'umfassten Architektur, Tests und die Abstimmung mit mehreren Entwicklungsteams.'
  ].join('\n');
  const { text, residual } = anonymizeVerified(src, 'personnel_profile');
  assertAbsent(text, 'Example Health GmbH', 'customer in project prose');
  assert.deepStrictEqual(residual, [], 'project prose must pass verification');
});

test('IT, testing, product, business-analysis and health-IT vocabulary is professional content', () => {
  const src = [
    'MAX MUSTERMANN',
    'Software Architecture, Requirements Engineering, Test Management, Test Automation',
    'Product Discovery, Product Vision, Sprint Retrospective, Stakeholder Management',
    'Business Analysis, Requirements Elicitation, Process Modeling, Data Modeling',
    'Health Level Seven, HL7 FHIR, IHE Profiles, Electronic Health Record',
    'Elektronische Patientenakte, Telematik Infrastruktur, Patient Identity Management'
  ].join('\n');
  const { text } = anonymizeVerified(src, 'personnel_profile');
  for (const term of [
    'Software Architecture', 'Test Management', 'Product Discovery', 'Business Analysis',
    'HL7 FHIR', 'IHE Profiles', 'Elektronische Patientenakte', 'Telematik Infrastruktur'
  ]) assertPresent(text, term, 'professional vocabulary');
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

test('lower-case legal brands and organisation-shaped names are anonymized as contract parties', () => {
  const src = [
    'Vertragsparteien sind msg systems ag und Deutsche Telekom AG.',
    'Leistung: Testmanagement und Qualitätssicherung für Krankenhaussoftware.'
  ].join('\n');
  const { text, residual } = anonymizeVerified(src, 'contract');
  assertAbsent(text, 'msg systems ag', 'lower-case organisation');
  assertAbsent(text, 'Deutsche Telekom AG', 'capitalised organisation');
  assert.doesNotMatch(text, /\[PERSON_\d+\][ \\t]+AG/u, 'organisation alias must not win as a person');
  assertPresent(text, 'Testmanagement und Qualitätssicherung', 'professional contract content');
  assert.deepStrictEqual(residual, [], 'contract parties must not survive the residual gate');
});

test('lower-case organisations survive neither terminal punctuation nor labels', () => {
  const cases = [
    'Vertragsparteien sind Deutsche Telekom AG und msg systems ag.',
    'Vertragspartei: msg systems ag.',
    'msg systems ag.'
  ];
  for (const source of cases) {
    const { text, residual } = anonymizeVerified(source, 'contract');
    assertAbsent(text, 'msg systems ag', 'lower-case organisation at the segment end');
    assert.deepStrictEqual(residual, []);
  }
});

test('an internal und in a lower-case company name is not treated as a party separator', () => {
  const source = 'Vertragsparteien sind forschung und entwicklung gmbh und msg systems ag.';
  const { text, counts, residual } = anonymizeVerified(source, 'contract');
  assertAbsent(text, 'forschung und entwicklung gmbh', 'first organisation');
  assertAbsent(text, 'msg systems ag', 'second organisation');
  assert.strictEqual(counts.ORG, 2);
  assert.deepStrictEqual(residual, []);
});

test('a party clause stops before professional prose in the next sentence', () => {
  const cases = [
    [
      'Vertragsparteien sind alpha gmbh. Leistung: Entwicklung und Test der SAP SE.',
      'Vertragsparteien sind [ORGANISATION_001]. Leistung: Entwicklung und Test der [ORGANISATION_002].',
      2
    ],
    [
      'Vertrag zwischen alpha gmbh und beta ag. Betrieb und Test der SAP SE.',
      'Vertrag zwischen [ORGANISATION_001] und [ORGANISATION_002]. Betrieb und Test der [ORGANISATION_003].',
      3
    ]
  ];
  for (const [source, expected, count] of cases) {
    const { text, counts, residual } = anonymizeVerified(source, 'contract');
    assert.strictEqual(text, expected);
    assert.strictEqual(counts.ORG, count);
    assert.deepStrictEqual(residual, []);
  }
});

test('sowie separates parties without becoming part of either organisation', () => {
  const source = 'Vertragsparteien sind forschung und entwicklung gmbh sowie msg systems ag.';
  const { text, counts, residual } = anonymizeVerified(source, 'contract');
  assert.strictEqual(text, 'Vertragsparteien sind [ORGANISATION_001] sowie [ORGANISATION_002].');
  assert.strictEqual(counts.ORG, 2);
  assert.deepStrictEqual(residual, []);
});

test('contract abbreviations and addresses do not hide a later lower-case party', () => {
  const cases = [
    'Vertrag zwischen alpha gmbh, Musterstr. 1, und msg systems ag.',
    'Vertragsparteien sind alpha gmbh, z. Hd. Anna Muster, und msg systems ag.',
    'Vertrag zwischen alpha gmbh, vertreten durch Dr. Anna Muster, und msg systems ag.',
    'Vereinbarung zwischen alpha gmbh, Nr. 7, sowie msg systems ag.'
  ];
  for (const source of cases) {
    const { text, counts, residual } = anonymizeVerified(source, 'contract');
    assertAbsent(text, 'alpha gmbh', 'first lower-case party');
    assertAbsent(text, 'msg systems ag', 'later lower-case party');
    assert.strictEqual(counts.ORG, 2);
    assert.deepStrictEqual(residual, []);
  }
});

test('party metadata never turns following professional prose into an organisation', () => {
  const cases = [
    [
      'Vertragsparteien sind alpha gmbh, Nr. 1. Leistung und Test der SAP SE.',
      'Vertragsparteien sind [ORGANISATION_001], Nr. 1. Leistung und Test der [ORGANISATION_002].'
    ],
    [
      'Vertrag zwischen alpha gmbh, Sitz Haus 7. Betrieb und Test der SAP SE.',
      'Vertrag zwischen [ORGANISATION_001], Sitz Haus 7. Betrieb und Test der [ORGANISATION_002].'
    ],
    [
      'Vertragsparteien sind alpha gmbh, Stand 22.08.2026. Leistung und Test der SAP SE.',
      'Vertragsparteien sind [ORGANISATION_001], Stand 22.08.2026. Leistung und Test der [ORGANISATION_002].'
    ]
  ];
  for (const [source, expected] of cases) {
    const { text, counts, residual } = anonymizeVerified(source, 'contract');
    assert.strictEqual(text, expected);
    assert.strictEqual(counts.ORG, 2);
    assert.deepStrictEqual(residual, []);
  }
});

test('an ordinal metadata point before an explicit connector keeps the next party detectable', () => {
  const source = 'Vertrag zwischen alpha gmbh, Nr. 7. und msg systems ag.';
  const { text, counts, residual } = anonymizeVerified(source, 'contract');
  assertAbsent(text, 'alpha gmbh', 'first party');
  assertAbsent(text, 'msg systems ag', 'party following an ordinal point');
  assert.strictEqual(counts.ORG, 2);
  assert.deepStrictEqual(residual, []);
});

test('the same words can be an organisation alias and an explicit person without leaving a legal form', () => {
  const src = [
    'Deutsche Telekom AG ist Vertragspartei.',
    'Ansprechpartner: Deutsche Telekom.'
  ].join('\n');
  const { text, residual } = anonymizeVerified(src, 'contract');
  assert.match(text, /^\[ORGANISATION_\d+\] ist Vertragspartei\./u);
  assert.match(text, /Ansprechpartner: \[PERSON_\d+\]\./u);
  assert.doesNotMatch(text, /\[PERSON_\d+\][ \\t]+AG/u);
  assert.deepStrictEqual(residual, []);
});

test('an ambiguous customer label distinguishes a legal-form company from a natural person', () => {
  const company = anonymizeVerified('Kunde: Google Germany GmbH', 'customer');
  assert.match(company.text, /^Kunde: \[ORGANISATION_\d+\]$/u);
  assert.doesNotMatch(company.text, /\[PERSON_\d+\]/u);
  assert.deepStrictEqual(company.residual, []);

  const person = anonymizeVerified('Kunde: Max Mustermann', 'customer');
  assert.match(person.text, /^Kunde: \[PERSON_\d+\]$/u);
  assert.doesNotMatch(person.text, /\[ORGANISATION_\d+\]/u);
  assert.deepStrictEqual(person.residual, []);

  const spans = pii.sensitiveSpans('Kunde: Google Germany GmbH', 'customer');
  assert.deepStrictEqual(spans.map(({ type, text }) => ({ type, text })), [
    { type: 'ORGANIZATION', text: 'Google Germany GmbH' }
  ]);
});

test('ordinary prose connectors never pull professional text into an organisation span', () => {
  const cases = [
    ['Leistung: Entwicklung und Test der SAP SE Schnittstelle.', 'Leistung: Entwicklung und Test der [ORGANISATION_001] Schnittstelle.'],
    ['Leistung: Entwicklung und Betrieb durch die SAP SE.', 'Leistung: Entwicklung und Betrieb durch die [ORGANISATION_001].'],
    ['Wir entwickeln und testen die Anwendung für SAP SE Kunden.', 'Wir entwickeln und testen die Anwendung für [ORGANISATION_001] Kunden.'],
    ['Der Kunde nutzt SAP SE für die Abrechnung.', 'Der Kunde nutzt [ORGANISATION_001] für die Abrechnung.'],
    ['Der Unterschied zwischen Altverfahren und SAP SE bleibt dokumentiert.', 'Der Unterschied zwischen Altverfahren und [ORGANISATION_001] bleibt dokumentiert.']
  ];
  for (const [source, expected] of cases) {
    const { text, residual } = anonymizeVerified(source, 'contract');
    assert.strictEqual(text, expected);
    assert.deepStrictEqual(residual, []);
  }
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

test('a labelled German tax id grouped with spaces is redacted', () => {
  const src = 'Steuerliche Identifikationsnummer: 26 954 371 827\n';
  const { text, residual } = anonymizeVerified(src, 'customer');
  assertAbsent(text, '26 954 371 827', 'grouped tax id');
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
  for (const value of ['030 1234567', '+49 30 1234567', '040/123456', '0176 12345678', '030 12 34 56 78']) {
    const { text, residual } = anonymizeVerified(`Telefon: ${value}\n`, 'customer');
    assertAbsent(text, value, `phone number ${value}`);
    assert.deepStrictEqual(residual, [], `residual gate must be clean for ${value}`);
  }
});

test('an unlabelled phone number introduced by "erreichbar unter" is redacted', () => {
  const src = 'Bei Rückfragen erreichbar unter 0151 2345678 während der Geschäftszeiten.\n';
  const { text, residual } = anonymizeVerified(src, 'customer');
  assertAbsent(text, '0151 2345678', 'unlabelled phone number');
  assert.deepStrictEqual(residual, [], 'residual gate must be clean');
});

test('explicit French, Spanish and Dutch profile labels remove identifiers and preserve qualifications', () => {
  const cases = [
    ['Nom', 'Élodie Martin', 'Téléphone', '+33 1 42 68 53 00', 'Entreprise', 'Exemple Santé Numérique SAS', 'Product Owner', 'ITIL 4 Foundation'],
    ['Nombre', 'Lucía García', 'Teléfono', '+34 91 123 45 67', 'Empresa', 'Ejemplo Salud Digital S.L.', 'Scrum Master', 'PSM I'],
    ['Naam', 'Noor van Dijk', 'Telefoon', '+31 20 123 4567', 'Bedrijf', 'Voorbeeld Zorg IT B.V.', 'Business Analyst', 'ISTQB Foundation']
  ];
  for (const [personLabel, person, phoneLabel, phone, companyLabel, company, role, credential] of cases) {
    const email = `${person.toLocaleLowerCase('en-US').replace(/ /gu, '.')}@example.invalid`;
    const source = [
      `${personLabel}: ${person}`,
      `E-mail: ${email}`,
      `${phoneLabel}: ${phone}`,
      `${companyLabel}: ${company}`,
      `Role: ${role}`,
      `Certification: ${credential}`
    ].join('\n');
    const result = anonymizeMarkdown(source, 'personnel_profile');
    assertAbsent(result.text, person, `${personLabel} person`);
    assertAbsent(result.text, email, `${personLabel} email`);
    assertAbsent(result.text, phone, `${phoneLabel} phone`);
    assertAbsent(result.text, company, `${companyLabel} company`);
    assertPresent(result.text, role, `${personLabel} role`);
    assertPresent(result.text, credential, `${personLabel} credential`);
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

test('quantities and units are not mistaken for postal addresses', () => {
  const cases = [
    ['Rechnungsbetrag: 50000 Euro netto', '50000 Euro'],
    ['Menge 10000 Stueck geliefert', '10000 Stueck'],
    ['Wert 12345 Punkte', '12345 Punkte'],
    ...[
      'EUR', 'Stück', 'Stunden', 'Tage', 'Monate', 'Jahre', 'Prozent',
      'Einwohner', 'Exemplare', 'Teile', 'kg', 'km', 'qm', 'm²', 'Liter'
    ].map((unit) => [`Wert: 50000 ${unit} netto`, `50000 ${unit}`])
  ];
  for (const [src, literal] of cases) {
    const { text } = anonymizeVerified(`${src}\n`, 'general');
    assertPresent(text, literal, `quantity in ${src}`);
    assertAbsent(text, '[LOCATION_REDACTED]', 'location placeholder');
  }
});

test('real postal addresses remain detectable including lower-case cities', () => {
  for (const value of ['20457 Hamburg', '80331 München', '04103 Leipzig Mitte', '20457 hamburg']) {
    const { text } = anonymizeVerified(`${value}\n`, 'general');
    assertAbsent(text, value, `postal address ${value}`);
    assertPresent(text, '[LOCATION_REDACTED]', 'location placeholder');
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

test('comma-shaped domain and language lines are not people', () => {
  for (const [profile, value] of [
    ['personnel_profile', 'Logistik, Gesundheitswesen'],
    ['personnel_profile', 'Scrum, SAFe'],
    ['applicant', 'Versicherung, Krankenkassen'],
    ['applicant', 'Deutsch, Englisch']
  ]) {
    const { text, counts } = anonymizeVerified(`${value}\n`, profile);
    assertPresent(text, value, 'domain content');
    assert.strictEqual(counts.PERSON, 0, `expected no person for ${value}`);
  }
});

const unlistedCommaPairs = [
  'Beratung, Umsetzung',
  'Analyse, Konzeption',
  'Migration, Schulung',
  'Verzahnung, Nachlauf'
];

function assertCommaPairsPreserved(profile, belowSection, anchored = false) {
  for (const value of unlistedCommaPairs) {
    const src = belowSection
      ? `## Qualifikationen\n${value}\n`
      : `${anchored ? 'ERIKA BEISPIEL\n' : ''}${value}\n\nQualifikationen\nFachliche Inhalte\n`;
    const { text, counts } = anonymizeVerified(src, profile);
    assertPresent(text, value, 'unlisted domain content');
    assert.strictEqual(counts.PERSON, anchored ? 1 : 0, `unexpected person count for ${profile}: ${value}`);
    if (anchored) assertAbsent(text, 'ERIKA BEISPIEL', 'anchored person name');
  }
}

test('an anchored personnel profile preserves unlisted comma pairs in its header', () => {
  assertCommaPairsPreserved('personnel_profile', false, true);
});

test('unlisted comma pairs remain intact below personnel profile sections', () => {
  assertCommaPairsPreserved('personnel_profile', true);
});

test('an anchored applicant profile preserves unlisted comma pairs in its header', () => {
  assertCommaPairsPreserved('applicant', false, true);
});

test('unlisted comma pairs remain intact below applicant sections', () => {
  assertCommaPairsPreserved('applicant', true);
});

test('a comma-formatted surname and given name remain detectable', () => {
  for (const value of ['Mustermann, Max', 'Beispiel, Erika Maria']) {
    const { text, counts } = anonymizeVerified(`${value}\n`, 'personnel_profile');
    assert.strictEqual(text.trim(), '[PERSON_001]');
    assert.strictEqual(counts.PERSON, 1);
  }
});

const nounEndingNames = [
  'Jung, Dennis',
  'Hartung, Denis',
  'Jung, Denis',
  'Hartung, Clement'
];

function assertCommaNamesRedacted(profile, values) {
  for (const value of values) {
    const { text, counts } = anonymizeVerified(`${value}\n`, profile);
    assert.strictEqual(text.trim(), '[PERSON_001]', `expected person pseudonym for ${profile}: ${value}`);
    assert.strictEqual(counts.PERSON, 1, `expected one person for ${profile}: ${value}`);
  }
}

test('noun-ending names remain detectable in personnel profiles', () => {
  assertCommaNamesRedacted('personnel_profile', nounEndingNames);
});

test('noun-ending names remain detectable in applicant profiles', () => {
  assertCommaNamesRedacted('applicant', nounEndingNames);
});

test('comma names with one noun-shaped token remain detectable', () => {
  const values = ['Hartung, Peter', 'Meier, Dennis', 'Bergmann, Denis'];
  assertCommaNamesRedacted('personnel_profile', values);
  assertCommaNamesRedacted('applicant', values);
});

test('a person name with nobiliary particles remains detectable', () => {
  const { text, counts } = anonymizeVerified('Anna von der Heide\n', 'personnel_profile');
  assertAbsent(text, 'Anna von der Heide', 'particle name');
  assertPresent(text, '[PERSON_001]', 'person pseudonym');
  assert.strictEqual(counts.PERSON, 1);
});

test('comma-separated role names remain preserved', () => {
  const value = 'Product Owner, Scrum Master';
  const { text, counts } = anonymizeVerified(`${value}\n`, 'personnel_profile');
  assertPresent(text, value, 'role names');
  assert.strictEqual(counts.PERSON, 0);
});

test('a labelled contact name remains detectable below profile sections', () => {
  const src = [
    'Qualifikationen',
    'Fachliche Inhalte',
    'Projekterfahrung',
    'Mehrere Projekte',
    'Ansprechpartner: Thomas Berger'
  ].join('\n');
  const { text, counts } = anonymizeVerified(src, 'personnel_profile');
  assertAbsent(text, 'Thomas Berger', 'late contact name');
  assertPresent(text, '[PERSON_001]', 'person pseudonym');
  assert.strictEqual(counts.PERSON, 1);
});

test('a bare name with immediate contact evidence remains detectable below profile sections', () => {
  const src = [
    'Qualifikationen',
    'Fachliche Inhalte',
    'Max Mustermann',
    'Telefon: +49 40 555 0101'
  ].join('\n');
  const { text, counts } = anonymizeVerified(src, 'personnel_profile');
  assertAbsent(text, 'Max Mustermann', 'late contact-block name');
  assertPresent(text, '[PERSON_001]', 'person pseudonym');
  assert.strictEqual(counts.PERSON, 1);
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

test('gateway anonymisation converges in one pass for representative documents', () => {
  const cases = [
    [fs.readFileSync(goldenSource, 'utf8'), 'personnel_profile'],
    ['Max Mustermann\nMusterstraße 12\n10115 Berlin\nTelefon: 030 1234567\n', 'customer'],
    ['Mustermann, Max\nTelefon: +49 40 555 0101\n', 'customer'],
    ['Vertrag zwischen Alpha Beispiel GmbH und Anna Beispiel.\n', 'contract']
  ];
  for (const [src, profile] of cases) {
    const result = anonymizeMarkdown(src, profile);
    assert.strictEqual(result.passes, 1, `expected one pass for ${profile}`);
  }
});

test('an anchored noun-shaped profile keeps capability text through gateway verification', () => {
  const result = anonymizeMarkdown(
    'ERIKA BEISPIEL\nBeratung, Umsetzung\n\nQualifikationen\nFachliche Inhalte\n',
    'personnel_profile'
  );
  assert.strictEqual(result.passes, 1);
  assertAbsent(result.text, 'ERIKA BEISPIEL', 'anchored person name');
  assertPresent(result.text, 'Beratung, Umsetzung', 'capability text');
});

test('idempotence: a second pass over released text changes nothing', () => {
  const src = fs.readFileSync(goldenSource, 'utf8');
  const once = anonymize(src, 'personnel_profile').text;
  const twice = anonymize(once, 'personnel_profile').text;
  assert.strictEqual(twice, once, 'processing released text again must be a no-op');
});

// The golden fixture carries no noun-shaped capability line, so the case above
// never exercises the anchor rule. The anchor that suppresses such a line is
// destroyed by its own replacement, which is exactly how a later pass could
// reclassify preserved capability text as a person.
test('idempotence holds when the anchor is consumed by its own redaction', () => {
  const src = [
    'ERIKA BEISPIEL',
    'Beratung, Umsetzung',
    '',
    '## Qualifikationen',
    '',
    'Analyse, Konzeption'
  ].join('\n');

  const once = anonymize(src, 'personnel_profile').text;
  const twice = anonymize(once, 'personnel_profile').text;
  const thrice = anonymize(twice, 'personnel_profile').text;

  assertAbsent(once, 'ERIKA BEISPIEL', 'the anchor');
  assertPresent(once, 'Beratung, Umsetzung', 'capability line in the header');
  assertPresent(once, 'Analyse, Konzeption', 'capability line in the body');
  assert.strictEqual(twice, once, 'a second pass must not reclassify preserved text');
  assert.strictEqual(thrice, twice, 'and neither must a third');
});

test('the anchor parameter defaults to the safe direction', () => {
  // A caller that forgets the argument must not let noun morphology suppress
  // the only name in the document: a missed name is the heavier error.
  const found = collectHeaderNameCandidates('Jung, Dennis\n', 'personnel_profile');
  assert.deepStrictEqual(
    found.map((seed) => seed.value),
    ['Jung, Dennis'],
    'omitting the anchor argument must not enable the noun-shape exclusion'
  );
  const suppressed = collectHeaderNameCandidates('Jung, Dennis\n', 'personnel_profile', 40, true);
  assert.deepStrictEqual(suppressed, [], 'an explicit anchor still enables the exclusion');
});

test('rendered Markdown and HTML encodings cannot hide direct identifiers', () => {
  const variants = [
    'Name: Anna&#32;Beispiel',
    'Name: **Anna Beispiel**',
    'Name: `Anna Beispiel`',
    'Name: <span>Anna Beispiel</span>',
    'Name: [Anna Beispiel](mailto:anna@example.de)',
    'Name: [Anna Beispiel][profil]\n\n[profil]: https://example.invalid/profil',
    'Name: Anna<span></span> Beispiel',
    'E-Mail: anna@example&#46;de'
  ];
  for (const source of variants) {
    const result = anonymizeVerified(source, 'personnel_profile');
    assert.doesNotMatch(result.text, /Anna|Beispiel|anna@example/iu, source);
    assert.deepStrictEqual(result.residual, [], source);
  }
});

test('GFM tables with optional outer pipes use the same privacy labels', () => {
  for (const outer of [false, true]) {
    const open = outer ? '| ' : '';
    const close = outer ? ' |' : '';
    const source = [
      `${open}Full Name | Zertifizierungen${close}`,
      `${open}--- | ---${close}`,
      `${open}Anna Beispiel | Scrum.org PSM I${close}`
    ].join('\n');
    const result = anonymizeVerified(source, 'personnel_profile');
    assertAbsent(result.text, 'Anna Beispiel', 'table person');
    assertPresent(result.text, 'Scrum.org PSM I', 'credential');
    assert.deepStrictEqual(result.residual, []);
  }
});

test('common CSV and DOCX-style person and organisation headers are covered', () => {
  for (const header of ['Full Name', 'Employee Name', 'Candidate Name', 'Contact Name', 'Mitarbeitername']) {
    const result = anonymizeVerified(`| ${header} | E-Mail |\n| --- | --- |\n| Anna Beispiel | anna@example.de |`, 'personnel_profile');
    assertAbsent(result.text, 'Anna Beispiel', header);
    assert.deepStrictEqual(result.residual, []);
  }
  for (const header of ['Organization', 'Employer Name', 'Customer Organization', 'Vendor', 'Supplier']) {
    const result = anonymizeVerified(`| ${header} | Rolle |\n| --- | --- |\n| ACME | Product Owner |`, 'personnel_profile');
    assertAbsent(result.text, 'ACME', header);
    assertPresent(result.text, 'Product Owner', 'role');
    assert.deepStrictEqual(result.residual, []);
  }
});

test('explicit contract and customer labels redact suffixless organisations', () => {
  for (const [profile, source] of [
    ['contract', 'Vertragspartei: ACME'],
    ['contract', 'Vertragspartei: Universitätsklinikum Köln'],
    ['customer', 'Client: North Health Service'],
    ['customer', 'Company: ACME']
  ]) {
    const result = anonymizeVerified(source, profile);
    assert.match(result.text, /\[ORGANISATION_\d+\]/u, source);
    assert.deepStrictEqual(result.residual, []);
  }
});

test('German public-sector and partnership legal forms are organisations', () => {
  for (const organization of [
    'Beispiel Klinik gGmbH', 'Beispiel Genossenschaft eG', 'Beispiel Partner PartG',
    'Beispiel Klinik AöR', 'Beispiel Versorgung KdöR', 'Beispiel Stiftung'
  ]) {
    const result = anonymizeVerified(`Vertragspartei: ${organization}`, 'contract');
    assertAbsent(result.text, organization, 'legal-form organisation');
    assert.deepStrictEqual(result.residual, []);
  }
});

test('professional relationship prefixes remain while the same organisation stays consistent', () => {
  for (const prefix of ['Softwareentwicklung für', 'Training bei', 'Testmanagement bei', 'FHIR-Entwicklung für', 'Aufgaben bei']) {
    const result = anonymizeVerified(`${prefix} Contoso GmbH\nContoso GmbH`, 'personnel_profile');
    assert.match(result.text, new RegExp(`^${prefix} \\[KUNDE_001\\]`, 'u'));
    assert.strictEqual((result.text.match(/\[KUNDE_001\]/gu) || []).length, 2);
    assert.strictEqual((result.text.match(/\[KUNDE_002\]/gu) || []).length, 0);
  }
});

test('Unicode spaces and dashes do not bypass identifier detection', () => {
  for (const source of [
    'IBAN: DE89\u00a03704\u202f0044\u20070532\u00a00130\u00a000',
    'Telefon: +49\u00a0221\u202f555\u20071234',
    'Adresse: 50667\u00a0Köln',
    'Telefon: +49\u2011221\u2010555\u20131234',
    'Telefon: +49\u2212221\u2212555\u22121234'
  ]) {
    const result = anonymizeVerified(source, 'customer');
    assert.deepStrictEqual(result.residual, [], source);
    assert.match(result.text, /\[(?:BANK_DATA|PHONE|LOCATION)_REDACTED\]/u, source);
  }
});

test('profile names in headings, quotes and lists are direct identifiers', () => {
  for (const prefix of ['# ', '## ', '> ', '- ']) {
    const result = anonymizeVerified(`${prefix}Anna Beispiel`, 'personnel_profile');
    assertAbsent(result.text, 'Anna Beispiel', prefix);
    assert.deepStrictEqual(result.residual, []);
  }
});

test('credential review selects the precise organisation and unknown academies', () => {
  for (const source of [
    'Zertifizierungen\nProjekt für Contoso GmbH',
    'Zertifizierungen\nZertifikat erworben bei Nordlicht Akademie',
    'Zertifizierungen\nTraining bei Contoso Academy'
  ]) {
    const anonymized = anonymize(source, 'personnel_profile').text;
    const ambiguities = credentialIssuerAmbiguities(source, anonymized);
    assert.strictEqual(ambiguities.length, 1, source);
    const selected = anonymized.slice(ambiguities[0].anonymized_start, ambiguities[0].anonymized_end);
    assert.doesNotMatch(selected, /Projekt für|Training bei|erworben bei/iu, source);
    assert.match(selected, /Contoso GmbH|Nordlicht Akademie|Contoso Academy/u, source);
  }
});

test('rendered markup, named entities and metadata cannot hide identifiers', () => {
  for (const source of [
    'Name: Anna&Tab;Beispiel',
    'E-Mail: anna@example&period;de',
    'Name: An<!--synthetic-->na Beispiel',
    'Name: **Anna** Beispiel',
    'Name: [Anna](synthetic-profile) Beispiel',
    '[Profil](https://example.test "Anna Beispiel")',
    '![Anna Beispiel](photo.png)',
    '<img src="photo.png" alt="Anna Beispiel">',
    '<abbr title="Anna Beispiel">Profil</abbr>'
  ]) {
    const result = anonymizeVerified(source, 'personnel_profile');
    assertAbsent(result.text, 'Anna Beispiel', source);
    assert.deepStrictEqual(result.residual, [], source);
  }
});

test('entity projection is idempotent and cannot introduce forbidden controls', () => {
  for (const source of ['Fachtext: A&amp;nbsp;B', 'Fachtext: &amp;lt;tag&amp;gt;', 'Name: Anna&amp;#32;Beispiel']) {
    const once = anonymize(source, 'personnel_profile').text;
    const twice = anonymize(once, 'personnel_profile').text;
    assert.strictEqual(twice, once, source);
  }
  for (const source of ['Text: &#0; Ende', 'Text: &#1; Ende']) {
    const output = anonymize(source, 'general').text;
    assert.doesNotMatch(output, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u);
  }
});

test('multiple structural profile names and suffixless customer labels are all private', () => {
  const people = anonymizeVerified('# Anna Beispiel\nAnsprechpartner: Bob Muster', 'personnel_profile');
  assertAbsent(people.text, 'Anna Beispiel');
  assertAbsent(people.text, 'Bob Muster');
  for (const source of ['Kunde: medidata', 'Customer: ACME']) {
    const result = anonymizeVerified(source, 'personnel_profile');
    assert.match(result.text, /\[KUNDE_001\]/u, source);
  }
});

test('extended legal forms and relationship prose preserve only professional context', () => {
  for (const organization of [
    'Beispiel gUG (haftungsbeschränkt)', 'Beispiel e.K.', 'Beispiel VVaG', 'Beispiel PartG mbB',
    'Beispiel Anstalt des öffentlichen Rechts', 'Beispiel S.L.', 'Beispiel N.V.', 'Beispiel S.r.l.'
  ]) {
    const result = anonymizeVerified(`Projekt für ${organization}`, 'personnel_profile');
    assert.strictEqual(result.text, 'Projekt für [KUNDE_001]', organization);
  }
  for (const prefix of ['Entwicklung für', 'Beratung für', 'Konzeption für', 'Architektur bei', 'Software Engineer at', 'Tester im Projekt bei', 'Worked at']) {
    const result = anonymizeVerified(`${prefix} Contoso GmbH`, 'personnel_profile');
    assert.strictEqual(result.text, `${prefix} [KUNDE_001]`, prefix);
  }
});

test('credential links retain visible issuer wording and unknown qualified issuers require review', () => {
  const linked = anonymizeVerified('Zertifizierungen\n[Scrum.org](https://www.scrum.org) Professional Scrum Master I', 'personnel_profile');
  assertPresent(linked.text, '[Scrum.org]([URL_REDACTED]) Professional Scrum Master I');
  for (const source of [
    'Zertifizierungen\nZertifikat erworben bei Nordlicht Akademie für Weiterbildung',
    'Schulung bei Nordlicht Akademie in Berlin'
  ]) {
    const output = anonymize(source, 'personnel_profile').text;
    assert.strictEqual(credentialIssuerAmbiguities(source, output).length, 1, source);
  }
});

test('explicit person fields redact lower-case values in text and CSV tables', () => {
  for (const source of ['Name: anna beispiel', 'Ansprechpartner: anna beispiel']) {
    const result = anonymizeVerified(source, 'personnel_profile');
    assertAbsent(result.text, 'anna beispiel', source);
    assert.match(result.text, /\[PERSON_001\]/u, source);
    assert.deepStrictEqual(result.residual, [], source);
  }
  const csvMarkdown = '| Name | Firma |\n| --- | --- |\n| anna beispiel | Beispiel GmbH |';
  const result = anonymizeVerified(csvMarkdown, 'personnel_profile');
  assertAbsent(result.text, 'anna', 'lower-case CSV forename');
  assertAbsent(result.text, 'beispiel', 'lower-case CSV surname');
  assert.deepStrictEqual(result.residual, []);
});

test('explicit person fields cover comma names, initials, particles and spaced CJK names', () => {
  const cases = [
    ['Name: Mustermann, Max', 'Mustermann, Max'],
    ['Name: Max A. Mustermann', 'Max A. Mustermann'],
    ["Name: O'Connor, Liam", "O'Connor, Liam"],
    ['Name: van der Meer, Jan', 'van der Meer, Jan'],
    ['姓名: 李 小龙', '李 小龙'],
    ['姓名: 王 伟', '王 伟'],
    ['姓名: 김 민준', '김 민준']
  ];
  for (const [source, privateValue] of cases) {
    const { text, residual } = anonymizeVerified(source, 'personnel_profile');
    assertAbsent(text, privateValue, 'explicit person value');
    assert.match(text, /\[PERSON_\d+\]/u);
    assert.deepStrictEqual(residual, []);
  }
});

test('explicit person fields cover single values, long particles, suffixes and titled comma names', () => {
  const cases = [
    ['Vorname: Anna', 'Anna'],
    ['Nachname: Mustermann', 'Mustermann'],
    ['Name: Li', 'Li'],
    ['Name: 李', '李'],
    ['Name: María del Carmen de la Cruz', 'María del Carmen de la Cruz'],
    ['Name: Martin Luther King Jr.', 'Martin Luther King Jr.'],
    ['Name: Mustermann, Dr. Max', 'Mustermann, Dr. Max']
  ];
  for (const [source, privateValue] of cases) {
    const result = anonymizeVerified(source, 'personnel_profile');
    assertAbsent(result.text, privateValue, source);
    assert.match(result.text, /\[PERSON_\d+\]/u, source);
    assert.deepStrictEqual(result.residual, [], source);
  }
});

test('same-line professional roles stay outside explicit person spans', () => {
  const cases = [
    'Name: Martin Luther King Jr. – Product Owner',
    'Name: Mustermann, Dr. Max | Product Owner',
    'Name: María del Carmen de la Cruz, Product Owner',
    'Name: Martin Luther King Jr., Product Owner'
  ];
  for (const source of cases) {
    const result = anonymizeVerified(source, 'personnel_profile');
    assert.match(result.text, /^Name: \[PERSON_\d+\].*Product Owner$/u, source);
    assert.strictEqual((result.text.match(/Product Owner/gu) || []).length, 1, source);
    assert.deepStrictEqual(result.residual, [], source);
  }
});

test('rendered HTML boundaries cannot join or hide an explicit person name', () => {
  for (const source of ['Name: Anna<br>Beispiel', 'Name: <div>Anna</div><div>Beispiel</div>']) {
    const result = anonymizeVerified(source, 'personnel_profile');
    assertAbsent(result.text, 'Anna', source);
    assertAbsent(result.text, 'Beispiel', source);
    assert.deepStrictEqual(result.residual, [], source);
  }
});

test('generic Markdown structures are not person evidence outside profile documents', () => {
  const sources = [
    '1. Digital Health', '1. Data Governance', '[^1]: Clinical Research',
    '[Privacy Policy](https://example.org)', '![Company Logo](logo.png)'
  ];
  for (const profile of ['general', 'contract', 'customer']) {
    for (const source of sources) {
      const result = anonymizeVerified(source, profile);
      assert.doesNotMatch(result.text, /\[PERSON_\d+\]/u, `${profile}: ${source}`);
      assert.deepStrictEqual(result.residual, [], `${profile}: ${source}`);
    }
  }
});

test('professional Markdown phrases remain content rather than person candidates', () => {
  const cases = [
    'Kompetenzen\n1. Digitale Transformation',
    'Aufgaben\n- [ ] Cloud Migration',
    '[^1]: Medical Informatics',
    'Kompetenzen: [Digitale Transformation](https://example.org)',
    'Technologien: [Azure Functions](https://example.org)'
  ];
  for (const source of cases) {
    const result = anonymizeVerified(source, 'personnel_profile');
    assert.doesNotMatch(result.text, /\[PERSON_\d+\]/u);
    assert.deepStrictEqual(result.residual, []);
  }
});

test('ordered lists, task lists, footnotes and reference titles cannot carry a profile name', () => {
  for (const source of [
    '1. Anna Beispiel', '1) Anna Beispiel', '- [ ] Anna Beispiel', '- [x] Anna Beispiel',
    '[^1]: Anna Beispiel', '[Profil]: /intern "Anna Beispiel"\nSiehe [Profil].'
  ]) {
    const result = anonymizeVerified(source, 'personnel_profile');
    assertAbsent(result.text, 'Anna Beispiel', source);
    assert.deepStrictEqual(result.residual, [], source);
  }
});

test('bidi controls and every Unicode space separator cannot split a labelled name', () => {
  for (const separator of ['\u2066', '\u2067', '\u2068', '\u202A', '\u202B', '\u202C', '\u202D', '\u202E', '\u2003', '\u1680', '\u205F', '\u3000']) {
    const result = anonymizeVerified(`Name: Anna${separator}Beispiel`, 'personnel_profile');
    assertAbsent(result.text, 'Anna', `separator U+${separator.codePointAt(0).toString(16)}`);
    assert.deepStrictEqual(result.residual, [], separator);
  }
});

test('escaped comparisons and programming generics remain visible content', () => {
  const escaped = anonymizeVerified('Grenzwert &lt; 5 und Leistung &gt; 3', 'general');
  assert.strictEqual(escaped.text, 'Grenzwert < 5 und Leistung > 3');
  const generic = anonymizeVerified('List<Customer> und Map<String, Object>', 'general');
  assert.strictEqual(generic.text, 'List<Customer> und Map<String, Object>');
});

test('a one-word legal-form alias does not replace ordinary prose globally', () => {
  for (const alias of ['Beispiel', 'Muster', 'Partner', 'Projekt', 'System', 'Service', 'Consulting', 'Testfall']) {
    const result = anonymizeVerified(`Arbeitgeber: ${alias} GmbH\nDies ist ein ${alias.toLocaleLowerCase('de-DE')} für Testautomatisierung.`, 'personnel_profile');
    assert.match(result.text, /^Arbeitgeber: \[ARBEITGEBER_001\]/u, alias);
    assertPresent(result.text, `ein ${alias.toLocaleLowerCase('de-DE')} für`, alias);
  }
});

test('credential review keeps professional sentence prefixes outside the organisation span', () => {
  for (const source of [
    'Zertifizierungen\nWorkshop für Contoso GmbH',
    'Zertifizierungen\nFallstudie für Contoso GmbH',
    'Zertifizierungen\nPraxisprojekt bei Contoso GmbH',
    'Zertifizierungen\nProjektübung für Contoso GmbH'
  ]) {
    const output = anonymize(source, 'personnel_profile').text;
    const ambiguities = credentialIssuerAmbiguities(source, output);
    assert.strictEqual(ambiguities.length, 1, source);
    assert.strictEqual(output.slice(ambiguities[0].anonymized_start, ambiguities[0].anonymized_end), 'Contoso GmbH', source);
  }
});

done();
