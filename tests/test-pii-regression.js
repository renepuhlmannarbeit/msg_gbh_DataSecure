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
const { collectHeaderNameCandidates, collectPersonAnchors } = require('../plugins/data-secure/server/privacy/entities');
const { credentialIssuerAmbiguities } = require('../plugins/data-secure/server/privacy/credentials');
const { personProseAmbiguities } = require('../plugins/data-secure/server/privacy/person-ambiguities');
const { fullwidth, profiles, professionalText, identifierCases } = require('./lib/identifier-compatibility');

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

test('grouped international IBANs are fully redacted without consuming following content', () => {
  const compactValues = [
    'DE89370400440532013000',
    'GB82WEST12345698765432',
    'NL91ABNA0417164300',
    'AT611904300234573201',
    'BE68539007547034'
  ];
  for (const compact of compactValues) for (const separator of [' ', '-', '.', '/', '\u2011']) {
    const value = compact.match(/.{1,4}/gu).join(separator);
    const source = `IBAN: ${value} Vielen Dank`;
    for (const profile of profiles) {
      const result = anonymizeVerified(source, profile);
      assert.strictEqual(result.text, 'IBAN: [BANK_DATA_REDACTED] Vielen Dank', `${profile}: ${source}`);
      assert.deepStrictEqual(result.residual, []);
    }
  }
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

test('common letter phrases introduce a phone number without making unter a label', () => {
  assert.strictEqual(looksName('Karl von und zu Beispiel'), true);
  for (const nonName of ['Karl und zu Beispiel', 'Karl von und Beispiel', 'Max Muster und Anna Beispiel']) {
    assert.strictEqual(looksName(nonName), false, nonName);
  }
  assert.deepStrictEqual(
    collectPersonAnchors('Herrn Karl von und zu Beispiel', 'general'),
    [{ value: 'Karl von und zu Beispiel', confidence: 'honorific' }]
  );
  for (const profile of profiles) {
    const compound = anonymizeVerified(
      'Rufen Sie Herrn Karl von und zu Beispiel an unter 0151 23456789.',
      profile
    );
    assert.strictEqual(compound.text, 'Rufen Sie [PERSON_001] an unter [PHONE_REDACTED].');
    assert.deepStrictEqual(compound.residual, []);
  }
  const positives = [
    'Rufen Sie mich an unter 0151 23456789.',
    'Rufen Sie bitte unter 0151 23456789 an.',
    'Rufen Sie Frau Beispiel an unter 0151 23456789.',
    'Rufen Sie Herrn Max Beispiel unter (030) 1234567 an.',
    'Rufen Sie Frau Prof. Dr. Anna Beispiel an unter 0151 23456789.',
    'Rufen Sie Dr.-Ing. Max Mustermann an unter 0151 23456789.',
    'Rufen Sie Mx Jordan Beispiel an unter 0151 23456789.',
    'Rufen Sie Mx. Alex von der Heide gerne an unter 0151 23456789.',
    'Rufen Sie Herrn von der Heide an unter 0151 23456789.',
    'Rufen Sie Herrn Jean Claude van den Berg an unter 0151 23456789.',
    'Rufen Sie Frau Dr. Anna Maria von der Heide an unter 0151 23456789.',
    'Rufen Sie Herrn Karl von und zu Beispiel an unter 0151 23456789.',
    'Rufen Sie mich gerne an unter 0151 23456789.',
    'Rufen Sie uns bitte an unter: 030/1234567.',
    'Melden Sie sich unter 0151 23456789.',
    'Melden Sie sich bitte unter 0151 23456789.',
    'Melden Sie sich gerne unter 0151 23456789.',
    'Rückfragen unter 0151 23456789.',
    'Telefonisch unter 0151 23456789 erreichbar.',
    '- Rückfragen unter\u00a00151\u202f23456789.'
  ];
  for (const source of positives) for (const profile of profiles) {
    assert.ok(pii.scanResidual(source, profile, []).some((finding) => finding.type === 'PHONE'),
      `independent gate must see the phone in ${profile}: ${source}`);
    const result = pii.anonymize(source, profile);
    assert.ok(!result.text.includes('0151 23456789'), `${profile}: ${source}`);
    assert.ok(result.text.includes('[PHONE_REDACTED]'), `${profile}: ${source}`);
    if (source.includes('von und zu')) {
      assert.ok(!result.text.includes('von und zu Beispiel'), `${profile}: ${result.text}`);
    }
    assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), [], source);
  }
  for (const source of [
    'unter 0151 23456789',
    'Die Schwelle liegt unter 0151 23456789 Einheiten.',
    'Rufen Sie unter 123456 den Vorgang auf.',
    'Rufen Sie unter 030 1234567 den Datensatz auf.',
    'Rufen Sie den Bericht unter 123456 auf.',
    'Rufen Sie den Datensatz bitte unter 030 1234567 auf.',
    'Rufen Sie die Funktion unter Version 123456 auf.',
    'Rückfragen unter Vorgang 123456.',
    'Telefonisch unter 9 Uhr.',
    'Rückfragen unter 01.02.2026.',
    'Rückfragen unter 01/02/2026.',
    'Rückfragen unter 2026-02-01.'
  ]) {
    const result = pii.anonymize(source, 'general');
    assert.strictEqual(result.text, source);
    assert.deepStrictEqual(pii.scanResidual(result.text, 'general', result.dictionary), []);
  }
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

test('mailto and other contact URIs redact the complete address in every profile', () => {
  // The CONTACT_URI span outranks the EMAIL span and an overlapping loser is
  // dropped entirely. A URI class without `@` therefore left the personal or
  // organisational domain behind, and the residual gate no longer saw an
  // e-mail once the local part had become a placeholder.
  const variants = [
    'Schreiben Sie an [Erika](mailto:erika@erika-synthetisch.de).',
    'Kontakt: <mailto:erika.synthetisch@kanzlei-synthetisch.de>',
    'mailto:max.synthetisch@example.org',
    '[Mail](mailto:erika@erika-synthetisch.de?subject=Bewerbung)',
    'Rückfragen an mailto:erika@ärzte-synthetisch.de bitte.',
    'sip:erika.synthetisch@voip-synthetisch.de'
  ];
  for (const profile of ['general', 'contract', 'customer', 'applicant', 'personnel_profile']) {
    for (const source of variants) {
      const result = anonymizeVerified(source, profile);
      assert.doesNotMatch(result.text, /synthetisch\.de|example\.org|kanzlei|ärzte|@/u, `${profile}: ${source}`);
      assert.match(result.text, /\[CONTACT_REDACTED\]/u, `${profile}: ${source}`);
      assert.deepStrictEqual(result.residual, [], `${profile}: ${source}`);
    }
  }
  assert.strictEqual(anonymizeVerified('Schreiben Sie an [Erika](mailto:erika@erika-synthetisch.de).', 'general').text,
    'Schreiben Sie an [Erika]([CONTACT_REDACTED]).');
});

test('Markdown-escaped e-mail punctuation from Office conversion is redacted as one identifier', () => {
  const cases = [
    'E-Mail: lina\\.testfeld@privacy-example\\.test',
    'E-Mail: max\\-muster+projekt@example\\.org',
    '[Kontakt](mailto:erika\\.beispiel@example\\.invalid)'
  ];
  for (const profile of ['general', 'personnel_profile', 'customer']) {
    for (const source of cases) {
      const result = anonymizeVerified(source, profile);
      assert.doesNotMatch(result.text, /lina|testfeld|max|muster|erika|beispiel|@/iu, `${profile}: ${source}`);
      assert.match(result.text, /\[(?:EMAIL|CONTACT)_REDACTED\]/u, `${profile}: ${source}`);
      assert.deepStrictEqual(result.residual, [], `${profile}: ${source}`);
    }
  }
});

test('identifier compatibility detection preserves source spelling, hashes and UTF-16 spans in every profile', () => {
  const { identifierDetectionText, hashShort } = require('../plugins/data-secure/server/privacy/base');
  const { findStructuredSpans } = require('../plugins/data-secure/server/privacy/structured');
  assert.strictEqual(identifierDetectionText(professionalText).length, professionalText.length);
  assert.strictEqual(identifierDetectionText('😀 ﬁ m² ① ㍍ ｜ ［］'), '😀 ﬁ m² ① ㍍ ｜ ［］');
  for (const { type, label, value, replacement } of identifierCases) {
    const source = `${professionalText}\n${label}${value}\nfachlicher nachsatz`;
    const expected = `${professionalText}\n${label}${replacement}\nfachlicher nachsatz`;
    const span = findStructuredSpans(source).find((hit) => hit.type === type);
    assert.ok(span, source);
    assert.strictEqual(span.start, source.indexOf(value));
    assert.strictEqual(span.end, span.start + value.length);
    assert.strictEqual(span.text, source.slice(span.start, span.end));
    assert.strictEqual(span.text, value, 'findings must retain the actual source spelling');
    for (const profile of profiles) {
      const result = anonymize(source, profile);
      assert.strictEqual(result.text, expected, `${profile}: ${source}`);
      assert.ok(result.findings.some((finding) => finding.type === type && finding.value_hash === hashShort(value)));
      assert.ok(pii.scanResidual(source, profile).some((hit) => hit.type === type && hit.text === value));
      assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), []);
      assert.strictEqual(anonymize(result.text, profile).text, result.text, 'redaction is idempotent');
    }
  }
});

test('compatibility labels stay column-bound and the independent telephone gate stays broader', () => {
  const phone = fullwidth('030 12345678');
  const header = fullwidth('Telefon');
  const table = `| ${header} | Menge |\n| --- | --- |\n| ${phone} | ${fullwidth('12345678901')} |`;
  assert.strictEqual(anonymize(table, 'general').text,
    `| ${header} | Menge |\n| --- | --- |\n| [PHONE_REDACTED] | ${fullwidth('12345678901')} |`);
  assert.ok(pii.scanResidual(table).some((hit) => hit.type === 'PHONE' && hit.text === phone));
  const shifted = table + ' extra |';
  assert.ok(pii.scanResidual(shifted).some((hit) => hit.type === 'TABLE_STRUCTURE_AMBIGUOUS'));
  assert.throws(() => anonymizeMarkdown(shifted, 'general'), /fail-closed/u);
  const broad = `Telefon: ${fullwidth('030 -- 123456')}`;
  assert.strictEqual(anonymize(broad, 'general').text, broad);
  assert.ok(pii.scanResidual(broad).some((hit) => hit.type === 'PHONE'));
  assert.throws(() => anonymizeMarkdown(broad, 'general'), /fail-closed/u);
  const bank = `${fullwidth('DE89370400440532013000')} / COBADEFFXXX`;
  assert.ok(pii.scanResidual(bank).some((hit) => hit.type === 'BIC'), 'same-line IBAN evidence uses the same view');
  assert.strictEqual(anonymize(bank, 'general').text, '[BANK_DATA_REDACTED] / [BANK_DATA_REDACTED]');
  for (const source of [professionalText, `Version: ${fullwidth('1.2.3')}`,
    `Menge: ${fullwidth('12345678901')} Stück`, `Auftrag: ${fullwidth('030 / 123456')}`,
    '[EMAIL_REDACTED] [PHONE_REDACTED] [BANK_DATA_REDACTED]']) {
    assert.strictEqual(anonymize(source, 'general').text, source);
    assert.deepStrictEqual(pii.scanResidual(source), []);
  }
});

test('telephone URIs end at their number while encoded contact addresses stay fully protected', () => {
  for (const profile of profiles) {
    for (const value of ['tel:03012345678', 'sms:+493012345678',
      'tel:+49(0)3012345678', 'tel:%2B49%2030%2012345678', 'tel:%30%33%30%31%32%33%34%35%36%37%38']) {
      for (const suffix of ['.UnveraenderterFachtext', '不可改写', '. fachlicher nachsatz', '\nfachlicher nachsatz']) {
        assert.strictEqual(anonymizeVerified(value + suffix, profile).text, '[CONTACT_REDACTED]' + suffix);
      }
    }
    for (const value of ['mailto:max%2Emuster%40example%2Ede', 'mailto:erika@ärzte-synthetisch.de',
      'sip:erika.synthetisch@voip-synthetisch.de', 'xmpp:anna@example.de', 'callto:skype.name',
      'callto:030123@example.de', 'callto:123alice', 'callto:123.alice', 'tel:+493012345678;ext=99', 'sms:+493012345678,+494012345678?body=Hallo',
      'tel:%2B4930%2531%2532%2533', 'mailto:𠮷@example.de']) {
      const source = `[Kontakt](${value}).`;
      assert.strictEqual(anonymizeVerified(source, profile).text, '[Kontakt]([CONTACT_REDACTED]).', source);
    }
  }
  assert.strictEqual(anonymize('tel:03012345678. tel:04012345678.').text, '[CONTACT_REDACTED]. [CONTACT_REDACTED].');
  assert.strictEqual(anonymize('tel:').text, 'tel:', 'an empty scheme is not a contact identifier');
});

test('a telephone URI cannot leave a partial overlapping email in any privacy profile', () => {
  for (const raw of ['tel:03012345678.anna@example.de', 'sms:+493012345678.anna@example.de',
    'tel:030 12345678.anna@example.de', 'tel:(030)12345678.anna@example.de']) {
    for (const value of [raw, fullwidth(raw)]) for (const profile of profiles) {
      const result = anonymize(value, profile);
      assert.strictEqual(result.text, '[CONTACT_REDACTED]', `${profile}: ${value}`);
      assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), []);
      const verified = anonymizeMarkdown(value, profile);
      assert.strictEqual(verified.text, '[CONTACT_REDACTED]');
      assert.strictEqual(verified.passes, 1, 'complete coverage must precede URL redaction and the residual gate');
    }
  }
});

test('the completed contact coverage keeps original UTF-16 offsets, hashes and detector priorities', () => {
  const { findStructuredSpans, DETECTORS } = require('../plugins/data-secure/server/privacy/structured');
  const { hashShort } = require('../plugins/data-secure/server/privacy/base');
  for (const value of ['tel:03012345678.anna@example.de', fullwidth('tel:03012345678.anna@example.de')]) {
    const source = `${professionalText}\n${value}\nfachlicher nachsatz`;
    const spans = findStructuredSpans(source);
    const contact = spans.find(span => span.type === 'CONTACT_URI');
    assert.deepStrictEqual([contact.start, contact.end, contact.text],
      [source.indexOf(value), source.indexOf(value) + value.length, value]);
    assert.strictEqual(contact.priority, 91);
    assert.strictEqual(spans.find(span => span.type === 'EMAIL').priority, 90);
    assert.strictEqual(DETECTORS.find(detector => detector.type === 'IBAN').priority, 88);
    assert.strictEqual(typeof DETECTORS.find(detector => detector.type === 'IBAN').boundaryEnd, 'function');
    for (const profile of profiles) {
      const result = anonymize(source, profile);
      assert.strictEqual(result.text, `${professionalText}\n[CONTACT_REDACTED]\nfachlicher nachsatz`);
      assert.ok(result.findings.some(finding => finding.type === 'CONTACT_URI' && finding.value_hash === hashShort(value)));
      assert.strictEqual(anonymize(result.text, profile).text, result.text);
    }
  }
});

test('non-overlapping following contacts and professional prose keep their own boundaries', () => {
  for (const [source, expected] of [
    ['tel:03012345678. anna@example.de', '[CONTACT_REDACTED]. [EMAIL_REDACTED]'],
    ['tel:03012345678.+493012345679', '[CONTACT_REDACTED].[PHONE_REDACTED]'],
    ['tel:03012345678.UnveraenderterFachtext', '[CONTACT_REDACTED].UnveraenderterFachtext'],
    ['tel:03012345678.\nanna@example.de', '[CONTACT_REDACTED].\n[EMAIL_REDACTED]']
  ]) for (const profile of profiles) {
    assert.strictEqual(anonymize(source, profile).text, expected);
    assert.deepStrictEqual(pii.scanResidual(expected, profile), []);
  }
});

test('multiple contact/email collisions retain complete coverage after earlier standalone or enclosed emails', () => {
  const source = 'first@example.de mailto:other@example.de tel:03012345678.anna@example.de sms:04012345678.berta@example.de';
  for (const profile of profiles) {
    assert.strictEqual(anonymize(source, profile).text,
      '[EMAIL_REDACTED] [CONTACT_REDACTED] [CONTACT_REDACTED] [CONTACT_REDACTED]');
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

test('labelled credentials and login identifiers are redacted without retaining a reversible hash', () => {
  const cases = [
    ['Passwort: Sommer2026!', 'Passwort: [CREDENTIAL_REDACTED]'],
    ['Kennwort = Winter2026#', 'Kennwort = [CREDENTIAL_REDACTED]'],
    ['- API-Key: sk-live-example-123', '- API-Key: [CREDENTIAL_REDACTED]'],
    ['> Token = eyJhbGciOiJIUzI1NiJ9.payload.signature', '> Token = [CREDENTIAL_REDACTED]'],
    ['Passphrase = four synthetic words', 'Passphrase = [CREDENTIAL_REDACTED]'],
    ['PIN: 1234', 'PIN: [CREDENTIAL_REDACTED]'],
    ['Benutzername: f.quastenflosser', 'Benutzername: [CREDENTIAL_REDACTED]'],
    ['Username = anna@example.test', 'Username = [CREDENTIAL_REDACTED]'],
    ['Login: https://example.test/private', 'Login: [CREDENTIAL_REDACTED]'],
    ['\tPASSWORD\t=\tSecret Value\r\nFachtext', '\tPASSWORD\t=\t[CREDENTIAL_REDACTED]\r\nFachtext'],
    ['Passwort: abc|def', 'Passwort: [CREDENTIAL_REDACTED]'],
    ['Token: a\\|b', 'Token: [CREDENTIAL_REDACTED]']
  ];
  for (const [source, expected] of cases) for (const profile of profiles) {
    const result = anonymize(source, profile);
    assert.strictEqual(result.text, expected, `${profile}: ${source}`);
    const credentialFindings = result.findings.filter((finding) => finding.type === 'CREDENTIAL');
    assert.deepStrictEqual(credentialFindings, [{ type: 'CREDENTIAL' }]);
    const residual = pii.scanResidual(source, profile);
    assert.ok(residual.some((finding) => finding.type === 'CREDENTIAL'));
    assert.ok(residual.every((finding) => !finding.text), 'credential residuals never expose a value');
    for (const sensitiveValue of ['Sommer2026!', 'Winter2026#', 'sk-live-example-123', '1234',
      'f.quastenflosser', 'anna@example.test', 'https://example.test/private']) {
      assert.doesNotMatch(JSON.stringify({ findings: result.findings, residual }), new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
    }
    assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), []);
    assert.strictEqual(anonymize(result.text, profile).text, result.text, 'credential redaction is idempotent');
  }
});

test('the full credential label catalogue and the reported multiline case are covered', () => {
  for (const label of [
    'Passwort', 'Kennwort', 'Password', 'Passphrase', 'Secret', 'Token', 'API-Key', 'API Key',
    'Zugangsdaten', 'Zugangscode', 'PIN', 'Benutzername', 'Nutzername', 'Username', 'User name',
    'Login', 'Loginname', 'Anmeldename', 'Kontokennung'
  ]) {
    const source = `${label}: synthetic-value`;
    assert.strictEqual(anonymizeVerified(source, 'customer_document').text,
      `${label}: [CREDENTIAL_REDACTED]`, label);
  }
  const reported = 'Zugangsdaten\n- Benutzername: f.quastenflosser\n- Passwort: Sommer2026!\n- API-Key: sk-live-4f9a2b7c1d8e6350\n';
  const result = anonymizeVerified(reported, 'customer_document');
  assert.strictEqual(result.text,
    'Zugangsdaten\n- Benutzername: [CREDENTIAL_REDACTED]\n- Passwort: [CREDENTIAL_REDACTED]\n- API-Key: [CREDENTIAL_REDACTED]\n');
  assert.deepStrictEqual(result.residual, []);
});

test('fullwidth credential separators and independent residual detection are covered', () => {
  for (const source of ['Passwort：Sommer2026!', 'Token＝abc123']) {
    const result = anonymize(source, 'general');
    assert.match(result.text, /\[CREDENTIAL_REDACTED\]/u, source);
    assert.deepStrictEqual(result.findings, [{ type: 'CREDENTIAL' }], source);
  }
  const { DETECTORS } = require('../plugins/data-secure/server/privacy/structured');
  const detector = DETECTORS.find((candidate) => candidate.type === 'CREDENTIAL');
  const original = detector.re;
  detector.re = /$a/gu;
  try {
    assert.deepStrictEqual(pii.scanResidual('Passwort: Sommer2026!'), [{ type: 'CREDENTIAL', text: '' }]);
  } finally {
    detector.re = original;
  }
});

test('credential columns are redacted structurally and credential-looking prose is preserved', () => {
  const source = [
    '| Benutzername | Passwort | Rolle |',
    '| --- | --- | --- |',
    '| f.quastenflosser | Sommer2026! | Administrator |'
  ].join('\n');
  for (const profile of profiles) {
    const result = anonymize(source, profile);
    assert.strictEqual(result.text, [
      '| Benutzername | Passwort | Rolle |',
      '| --- | --- | --- |',
      '| [CREDENTIAL_REDACTED] | [CREDENTIAL_REDACTED] | Administrator |'
    ].join('\n'));
    assert.deepStrictEqual(result.findings.filter((finding) => finding.type === 'CREDENTIAL'), [
      { type: 'CREDENTIAL' }, { type: 'CREDENTIAL' }
    ]);
    assert.ok(pii.scanResidual(source, profile).some((finding) => finding.type === 'CREDENTIAL' && !finding.text));
    assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), []);
  }
  for (const source of [
    'Benutzername | Passwort\n--- | ---\nf.quasten | secret',
    '| Benutzername | Passwort\n| --- | ---\n| f.quasten | secret',
    'Benutzername | Passwort |\n--- | --- |\nf.quasten | secret |',
    '| Benutzername | Passwort |\n| --- | --- |\n| f.quasten | abc\\|def |'
  ]) {
    const result = anonymizeVerified(source, 'general');
    assert.strictEqual((result.text.match(/\[CREDENTIAL_REDACTED\]/gu) || []).length, 2, source);
    assert.deepStrictEqual(result.residual, [], source);
  }
  for (const source of [
    '| API | Rolle |\n| Key | Typ |\n| --- | --- |\n| sk-live-secret | Admin |',
    '| User | Rolle |\n| name | Typ |\n| --- | --- |\n| f.quasten | Admin |',
    '| API | Rolle |\n|  | Typ |\n| Key | Wert |\n| --- | --- |\n| sk-live-secret | Admin |'
  ]) {
    const result = anonymizeVerified(source, 'general');
    assert.match(result.text, /\[CREDENTIAL_REDACTED\]/u, source);
    assert.deepStrictEqual(result.residual, [], source);
  }
  for (const source of [
    '| Pass | Rolle |\n| wort | Typ |\n| --- | --- |\n| secret | Admin |',
    '| Benutzer | Rolle |\n| name | Typ |\n| --- | --- |\n| f.quasten | Admin |',
    '| Zugangs | Rolle |\n|  | Typ |\n| daten | Wert |\n| --- | --- |\n| secret | Admin |',
    '| Konto | Rolle |\n| kennung | Typ |\n| --- | --- |\n| f.quasten | Admin |',
    '| Anmelde | Rolle |\n| name | Typ |\n| --- | --- |\n| f.quasten | Admin |'
  ]) {
    const result = anonymizeVerified(source, 'general');
    assert.match(result.text, /\[CREDENTIAL_REDACTED\]/u, source);
    assert.deepStrictEqual(result.residual, [], source);
  }
  const differentDepths = '|  | Benutzer |\n| API |  |\n| Key | name |\n| --- | --- |\n| sk-secret | f.quasten |';
  const differentDepthResult = anonymizeVerified(differentDepths, 'general');
  assert.strictEqual((differentDepthResult.text.match(/\[CREDENTIAL_REDACTED\]/gu) || []).length, 2);
  assert.deepStrictEqual(differentDepthResult.residual, []);
  const overlong = '| API | Rolle |\n| access | Typ |\n| credential | Wert |\n| Key | Status |\n| --- | --- |\n| sk-live-secret | Admin |';
  assert.ok(pii.scanResidual(overlong).some((finding) => finding.type === 'CREDENTIAL' && !finding.text));
  const unbound = '| API | Rolle |\n| access | Typ |\n| Key | Wert |\n| --- | --- |\n| sk-live-secret | Admin |';
  assert.ok(pii.scanResidual(unbound).some((finding) => finding.type === 'CREDENTIAL' && !finding.text));
  for (const source of [
    '| Pass | Rolle |\n| access | Typ |\n| internal | Wert |\n| wort | Status |\n| --- | --- |\n| secret | Admin |',
    '| Zugangs | Rolle |\n| internal | Typ |\n| access | Wert |\n| daten | Status |\n| --- | --- |\n| secret | Admin |',
    '| Pass | Rolle |\n| x1 | Typ |\n| x2 | Wert |\n| x3 | Status |\n| wort | Feld |\n| --- | --- |\n| geheim-123 | Admin |',
    '| Benutzer | Rolle |\n| x1 | Typ |\n| x2 | Wert |\n| x3 | Status |\n| name | Feld |\n| --- | --- |\n| f.quasten | Admin |',
    '| Zugangs | Rolle |\n| x1 | Typ |\n| x2 | Wert |\n| x3 | Status |\n| daten | Feld |\n| --- | --- |\n| geheim-123 | Admin |'
  ]) assert.ok(pii.scanResidual(source).some((finding) => finding.type === 'CREDENTIAL' && !finding.text), source);
  const technicalTable = '| API | Version |\n| --- | --- |\n| REST | v2 |';
  assert.strictEqual(anonymize(technicalTable, 'general').text, technicalTable);
  assert.deepStrictEqual(pii.scanResidual(technicalTable), []);
  for (const prose of [
    'Das Passwort muss regelmäßig geändert werden.',
    'Password Policy und Secret Management sind dokumentiert.',
    'Die Tokenisierung wird fachlich geprüft.',
    'Das PIN-Verfahren bleibt unverändert.',
    '# Zugangsdaten',
    '# Token: Aufbau und Validierung',
    '## Secret: Management in Entwicklungsumgebungen',
    'Token: Aufbau und Validierung\n============================',
    'Secret: Management in Entwicklungsumgebungen\n-------------------------------------------',
    'Passwort:',
    'URL: https://example.test/?token=abc'
  ]) {
    assert.strictEqual(anonymize(prose, 'general').text, prose);
    assert.deepStrictEqual(pii.scanResidual(prose), []);
  }
});

test('entity-shaped credential values never enter findings, dictionaries or public scanner text', () => {
  const { hashShort } = require('../plugins/data-secure/server/privacy/base');
  const { scanStructured } = require('../plugins/data-secure/server/privacy/structured');
  for (const source of [
    'Secret: Nordlicht Beispiel GmbH',
    '| Secret | Rolle |\n| --- | --- |\n| Nordlicht Beispiel GmbH | intern |',
    'Passwort: Anna Beispiel'
  ]) {
    const secret = source.includes('Anna') ? 'Anna Beispiel' : 'Nordlicht Beispiel GmbH';
    const result = anonymize(source, 'personnel_profile');
    assert.deepStrictEqual(result.findings, [{ type: 'CREDENTIAL' }], source);
    assert.deepStrictEqual(result.dictionary, [], source);
    assert.strictEqual(result.counts.ORG || 0, 0, source);
    const encoded = JSON.stringify({ findings: result.findings, dictionary: result.dictionary });
    assert.doesNotMatch(encoded, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
    assert.doesNotMatch(encoded, new RegExp(hashShort(secret), 'u'));
    for (const scannerResult of [
      scanStructured(source),
      pii.scanResidual(source, 'personnel_profile'),
      pii.verifyRedactedText(source),
      pii.sensitiveSpans(source, 'personnel_profile')
    ]) {
      assert.doesNotMatch(JSON.stringify(scannerResult), new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
      assert.ok(scannerResult.filter((finding) => finding.type === 'CREDENTIAL').every((finding) => !finding.text));
    }
  }
  for (const source of [
    'Passwort: anna@example.test',
    'Login: https://example.test/private',
    'PIN: +49 30 12345678'
  ]) {
    const secret = source.slice(source.indexOf(':') + 1).trim();
    for (const scannerResult of [
      scanStructured(source), pii.scanResidual(source, 'personnel_profile'),
      pii.verifyRedactedText(source), pii.sensitiveSpans(source, 'personnel_profile')
    ]) assert.doesNotMatch(JSON.stringify(scannerResult), new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
  const mixed = 'Kunde: Nordlicht Beispiel GmbH\nSecret: Nordlicht Beispiel GmbH';
  const result = anonymizeVerified(mixed, 'customer_document');
  assert.match(result.text, /\[ORGANISATION_\d+\]/u);
  assert.match(result.text, /Secret: \[CREDENTIAL_REDACTED\]/u);
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

// Review rc90 (F1): CSV and DOCX tables carry the label in the header row and
// the value two lines below. Same-line label adjacency let tax ids, dates of
// birth, phone numbers, plates and reference numbers through in that shape,
// and the residual gate shared the blind spot.
test('label-gated identifiers in Markdown table columns are redacted and caught by the residual gate', () => {
  const { csvToMarkdown } = require('../plugins/data-secure/server/document-parser');
  const csv = 'Name;Steuer-ID;Geburtsdatum;Telefon;Kennzeichen;Personalnummer;Menge\n' +
    'Max Mustermann;26954371827;01.01.1980;030 12345678;M-AB 1234;P-4711;12345678901\n' +
    'Erika Beispiel;65 929 970 489;05.05.1975;040 87654321;B-CD 5678;P-4712;100\n';
  const md = csvToMarkdown(csv);
  const result = anonymize(md, 'general');
  for (const value of ['26954371827', '65 929 970 489', '01.01.1980', '05.05.1975', '030 12345678', '040 87654321', 'M-AB 1234', 'B-CD 5678', 'P-4711', 'P-4712']) {
    assertAbsent(result.text, value, 'table cell under a label header');
  }
  assertPresent(result.text, '| Name | Steuer-ID | Geburtsdatum | Telefon | Kennzeichen | Personalnummer | Menge |', 'header row stays readable');
  assertPresent(result.text, '12345678901', 'a quantity column without a PII label is not redacted');
  assertPresent(result.text, '| 100 |', 'plain quantities survive');
  const residual = require('../plugins/data-secure/server/privacy/engine').scanResidual(result.text, 'general', result.dictionary, { strongPersonAnchor: result.strongPersonAnchor });
  assert.deepStrictEqual(residual, [], 'the release bytes carry no residual identifier');
  const gate = require('../plugins/data-secure/server/privacy/engine').scanResidual(md, 'general', new Map(), {});
  assert.ok(gate.some((hit) => hit.type === 'DE_TAX_ID') && gate.some((hit) => hit.type === 'DATE_OF_BIRTH') && gate.some((hit) => hit.type === 'PHONE'),
    'the independent gate itself sees the table-shaped identifiers');
  // Hand-written table with escaped pipes and a trailing "(1)" header suffix.
  const hand = ['| Mitarbeiter (1) | Steuer-ID (1) | Notiz |', '|:---|---:|---|', '| Max Mustermann | 26 954 371 827 | a \\| b |'].join('\n');
  const handResult = anonymize(hand, 'general');
  assertAbsent(handResult.text, '26 954 371 827', 'aligned table with escaped pipe');
  assertPresent(handResult.text, 'a \\| b', 'escaped pipe content stays');
});

// Review rc91 fuzzing (F1-F4): label on the line above, title qualifiers,
// phone label variants and multilingual or spelled-out birth dates.
test('form layouts, title qualifiers, phone label variants and multilingual birth dates are redacted', () => {
  const { scanResidual } = require('../plugins/data-secure/server/privacy/engine');
  const clean = (text, profile = 'personnel_profile') => {
    const result = anonymize(text, profile);
    const residual = scanResidual(result.text, profile, result.dictionary, { strongPersonAnchor: result.strongPersonAnchor });
    return { text: result.text, residual };
  };
  // F1: label alone on the line above, definition list, list marker
  for (const [input, value] of [
    ['Geburtsdatum\n01.01.1980', '01.01.1980'],
    ['Steuer-ID\n26954371827', '26954371827'],
    ['Telefon\n030 123456-78', '030 123456-78'],
    ['Steuer-ID\n: 26954371827', '26954371827'],
    ['- Kennzeichen\n  M-AB 1234', 'M-AB 1234'],
    ['Geburtsdatum:\n\n05.05.1975', '05.05.1975']
  ]) {
    const out = clean(input);
    assertAbsent(out.text, value, `label above value: ${input.split('\n')[0]}`);
    assert.deepStrictEqual(out.residual, [], 'gate agrees');
  }
  // F2: chained titles and lower-case degree qualifiers
  for (const name of ['Dr. med. Anna Beispiel', 'Prof. Dr. med. Anna Beispiel', 'Dr. rer. nat. Erik Muster', 'Dr. h. c. Erika Beispiel', 'Dr. med. Anna von der Heide']) {
    const out = clean(`Ansprechpartner: ${name}\nRolle: Ärztliche Leitung`);
    assertAbsent(out.text, name.replace(/^.*?(?=[A-Z][a-z]+ [A-Z]|Anna|Erik|Erika)/u, '').split(' ').slice(-1)[0], `surname of ${name}`);
    assertPresent(out.text, '[PERSON_001]', `title-qualified ${name}`);
    assertPresent(out.text, 'Ärztliche Leitung', 'role survives');
  }
  // F3: phone label variants, inline and as table header
  for (const [input, value] of [
    ['Telefonnummer: 030 123456', '030 123456'],
    ['Telefonnummer 030 123456', '030 123456'],
    ['| Name | Telefonnummer |\n|---|---|\n| Max Mustermann | 030 123456 |', '030 123456'],
    ['| Name | Telefoonnummer |\n|---|---|\n| Max Mustermann | 030 123456 |', '030 123456'],
    ['| Name | Telefon (privat) | Mobil (dienstlich) |\n|---|---|---|\n| Max Mustermann | 030 123456-78 | 0170 1234567 |', '030 123456-78'],
    ['| Name | Mobil (dienstlich) |\n|---|---|\n| Max Mustermann | 0170 1234567 |', '0170 1234567']
  ]) {
    const out = clean(input, 'general');
    assertAbsent(out.text, value, `phone under ${input.split('\n')[0]}`);
    assert.deepStrictEqual(out.residual, [], 'gate agrees');
  }
  // F4: multilingual birth-date headers and spelled-out dates
  for (const [input, value] of [
    ['| Name | Date de naissance |\n|---|---|\n| Max Mustermann | 01.01.1980 |', '01.01.1980'],
    ['| Name | Fecha de nacimiento |\n|---|---|\n| Max Mustermann | 01.01.1980 |', '01.01.1980'],
    ['| Name | Geboortedatum |\n|---|---|\n| Max Mustermann | 01.01.1980 |', '01.01.1980'],
    ['| Name | Data di nascita |\n|---|---|\n| Max Mustermann | 01/01/1980 |', '01/01/1980'],
    ['Geburtsdatum: 1. Januar 1980', '1. Januar 1980'],
    ['Geburtsdatum\n1. Januar 1980', '1. Januar 1980'],
    ['Date of birth: January 1, 1980', 'January 1, 1980'],
    ['Geboren am: 12 März 1979', '12 März 1979']
  ]) {
    const out = clean(input, 'general');
    assertAbsent(out.text, value, `birth date under ${input.split('\n')[0]}`);
    assert.deepStrictEqual(out.residual, [], 'gate agrees');
  }
  // Controls: no label, no redaction of plain numbers or month prose
  const control = anonymize('Projektstart war Januar 1980 mit 12 Teilprojekten. Menge: 26954371827 Stück. Kapitel 1. Januar 1980 ist ein Datum ohne Label.', 'general');
  assertPresent(control.text, 'Projektstart war Januar 1980 mit 12 Teilprojekten', 'month prose without a label stays');
  assertPresent(control.text, '26954371827', 'a bare 11-digit quantity stays');
  assertPresent(control.text, '1. Januar 1980', 'a date without a birth label stays');
  const header = anonymize('| Name | Telefonnummer |\n|---|---|\n| Max Mustermann | 030 123456 |', 'general');
  assertPresent(header.text, '| Name | Telefonnummer |', 'the header row stays readable');
});

test('fragmented PII table headers of up to three rows redact every labelled identifier', () => {
  const tables = [
    '| Steuer<br>ID | Geburts<br>datum | Telefon<br>(privat) | Personal<br>nummer | Menge |\n' +
      '| --- | --- | --- | --- | --- |\n' +
      '| 26954371827 | 01.01.1980 | 030 12345678 | P-4711 | 1980 |',
    '| Steuer | Geburts | Telefon | Personal | Menge |\n' +
    '| ID | datum | privat | nummer | Stück |\n' +
      '| --- | --- | --- | --- | --- |\n' +
      '| 26954371827 | 01.01.1980 | 030 12345678 | P-4711 | 1980 |',
    '| Steuer | Geburts | Telefon | Personal | Menge |\n' +
      '| - | - |  | - | Stück |\n' +
      '| ID | datum | privat | nummer | Anzahl |\n' +
      '| --- | --- | --- | --- | --- |\n' +
      '| 26954371827 | 01.01.1980 | 030 12345678 | P-4711 | 1980 |',
    '| Steuer<br>-<br>ID | Geburts<br>-<br>datum | Telefon<br>-<br>privat | Personal<br>-<br>nummer | Menge |\n' +
      '| --- | --- | --- | --- | --- |\n' +
      '| 26954371827 | 01.01.1980 | 030 12345678 | P-4711 | 1980 |'
  ];
  for (const source of tables) {
    const result = anonymize(source, 'general');
    for (const value of ['26954371827', '01.01.1980', '030 12345678', 'P-4711']) {
      assertAbsent(result.text, value, 'identifier below a fragmented header');
    }
    assertPresent(result.text, '1980', 'unlabelled quantity remains professional content');
    assert.deepStrictEqual(pii.scanResidual(result.text, 'general', result.dictionary, {
      strongPersonAnchor: result.strongPersonAnchor
    }), []);
    const rawGate = pii.scanResidual(source, 'general');
    assert.ok(rawGate.some((hit) => hit.type === 'DATE_OF_BIRTH'), 'independent gate sees the table birth date');
    assert.ok(rawGate.some((hit) => hit.type === 'PHONE'), 'independent gate sees the table phone');
  }
});

test('ISO birth dates and common German phone layouts are redacted only behind strong labels', () => {
  for (const [source, value, type] of [
    ['Geboren: 01.01.1980', '01.01.1980', 'DATE_OF_BIRTH'],
    ['Geburtsdatum: 1980-01-01', '1980-01-01', 'DATE_OF_BIRTH'],
    ['Date of birth: 1980/01/01', '1980/01/01', 'DATE_OF_BIRTH'],
    ['Telefon: 0049 30 12345678', '0049 30 12345678', 'PHONE'],
    ['Telefon: 030 / 123456', '030 / 123456', 'PHONE'],
    ['Telefon: +49 (0) 30 12345678', '+49 (0) 30 12345678', 'PHONE']
  ]) {
    const result = anonymize(source, 'general');
    assertAbsent(result.text, value, source);
    assert.ok(pii.scanResidual(source, 'general').some((hit) => hit.type === type), `raw gate sees ${source}`);
    assert.deepStrictEqual(pii.scanResidual(result.text, 'general', result.dictionary, {
      strongPersonAnchor: result.strongPersonAnchor
    }), []);
  }
  for (const source of ['Projektstart: 1980-01-01', 'Version 0049.30', 'Auftrag 030 / 123456']) {
    const result = anonymize(source, 'general');
    assert.strictEqual(result.text, source, `unlabelled business value remains: ${source}`);
    assert.deepStrictEqual(pii.scanResidual(result.text, 'general', result.dictionary), []);
  }
});

test('the conservative labelled gate remains broader than the redactor', () => {
  const spacedDate = 'Geburtsdatum: 1980 - 01 - 01';
  const repeatedSeparatorPhone = 'Telefon: 030 -- 123456';
  assert.strictEqual(anonymize(spacedDate, 'general').text, spacedDate, 'redactor stays precise');
  assert.strictEqual(anonymize(repeatedSeparatorPhone, 'general').text, repeatedSeparatorPhone, 'redactor stays precise');
  assert.ok(pii.scanResidual(spacedDate, 'general').some((hit) => hit.type === 'DATE_OF_BIRTH'));
  assert.ok(pii.scanResidual(repeatedSeparatorPhone, 'general').some((hit) => hit.type === 'PHONE'));
});

test('a plain person table label anchors the name and the independent gate detects a clear residual', () => {
  const source = [
    '1. Projektprofil von Anna Berger bei Elbwiese Beratung GmbH.',
    '2. Anna Berger koordiniert die Einführung.',
    '',
    '| Feld | Wert |',
    '| --- | --- |',
    '| person | Anna Berger |',
    '| company | Elbwiese Beratung GmbH |'
  ].join('\n');
  const rawResidual = pii.scanResidual(source, 'general');
  assert.ok(rawResidual.some((hit) => hit.type === 'PERSON_CANDIDATE' && hit.text === 'Anna Berger'),
    'the release gate must not reuse PERSON_LABEL for this converted table shape');
  const result = anonymizeVerified(source, 'general');
  assertAbsent(result.text, 'Anna Berger', 'person in numbered prose and the explicit table row');
  assert.match(result.text, /\[PERSON_\d+\]/u);
  assert.deepStrictEqual(result.residual, []);
});

test('operational person-column labels redact names while neutral columns stop fail-closed', () => {
  for (const label of ['Zuständig', 'Zuständige', 'Verantwortlich', 'Verantwortliche', 'Bearbeiter',
    'Sachbearbeiter', 'Betreuer', 'Autor', 'Verfasser', 'Empfänger', 'Absender', 'Unterzeichner',
    'Gesprächspartner', 'Kontakt']) {
    const source = `| ${label} | Rolle | Geburtsdatum |\n| --- | --- | --- |\n| Anna Berger | Product Owner | 03.07.1981 |`;
    const result = anonymizeVerified(source, 'customer_document');
    assertAbsent(result.text, 'Anna Berger', label);
    assert.match(result.text, /\[PERSON_\d+\]/u, label);
    assert.deepStrictEqual(result.residual, [], label);
  }
  for (const header of ['Abteilung', 'Bezeichnung', 'Eintrag', 'Spalte 1']) {
    const source = `| ${header} | Rolle | Geburtsdatum |\n| --- | --- | --- |\n| Anna Berger | Product Owner | 03.07.1981 |`;
    const residual = pii.scanResidual(source, 'customer_document');
    assert.ok(residual.some((hit) => hit.type === 'PERSON_CANDIDATE' && hit.text === 'Anna Berger'), header);
    assert.throws(() => anonymizeMarkdown(source, 'customer_document'), /PERSON_CANDIDATE/u, header);
  }
  const linked = '| Bezeichnung | Rolle |\n| --- | --- |\n| [Anna Berger](profil) | Product Owner |';
  assert.ok(pii.scanResidual(linked, 'general').some((hit) => hit.type === 'PERSON_CANDIDATE' && hit.text === 'Anna Berger'));
  assert.throws(() => anonymizeMarkdown(linked, 'general'), /PERSON_CANDIDATE/u);
  const credential = '| Certificering | Rol |\n| --- | --- |\n| ISTQB Foundation | Business Analyst |';
  assert.deepStrictEqual(pii.scanResidual(credential, 'personnel_profile'), []);
  const professionalMethod = '| Pruefschritt | Status |\n| --- | --- |\n| Separation of Concerns | fachlich geprueft |';
  assert.deepStrictEqual(pii.scanResidual(professionalMethod, 'general'), []);
});

test('generic DOCX table columns preserve professional terms without weakening the person gate', () => {
  const professionalValues = [
    'Soft Skills',
    'Servant Leadership',
    'Change Management',
    'Öffentliche Verwaltung',
    'Strategic Planning',
    'Public Administration',
    'Team Collaboration',
    'Conflict Resolution',
    'Digital Strategy',
    'Process Optimization',
    'Talent Development',
    'Service Management',
    'Knowledge Management',
    'Customer Success',
    'Operational Excellence',
    'Lean Management'
  ];
  const source = [
    '| Spalte 1 | Spalte 2 |',
    '| --- | --- |',
    ...professionalValues.map((value) => `| ${value} | ●●●○ |`)
  ].join('\n');
  const result = anonymizeMarkdown(source, 'personnel_profile');
  for (const value of professionalValues) assertPresent(result.text, value, value);
  assert.deepStrictEqual(pii.scanResidual(result.text, 'personnel_profile', result.dictionary, {
    strongPersonAnchor: result.strongPersonAnchor
  }), []);

  const unresolvedPerson = `${source}\n| Anna Berger | ●●●○ |`;
  assert.throws(() => anonymizeMarkdown(unresolvedPerson, 'personnel_profile'), (error) => {
    assert.strictEqual(error.code, 'RESIDUAL_PII');
    assert.match(error.message, /PERSON_CANDIDATE/u);
    return true;
  });
});

test('plain equal-width table headers never masquerade as fragmented sensitive structures', () => {
  const directPersonHeaders = new Set(['Name', 'Mitarbeiter']);
  for (const header of ['Name', 'Mitarbeiter', 'Kunden', 'Personal', 'Patienten',
    'Rechnungs', 'Fall', 'Akten', 'Lieferanten', 'Abteilung']) {
    for (const width of [2, 3]) {
      const thirdHeader = width === 3 ? ' | Notiz' : '';
      const thirdSeparator = width === 3 ? ' | ---' : '';
      const thirdValue = width === 3 ? ' | intern' : '';
      const source = `| ${header} | Rolle${thirdHeader} |\n` +
        `| --- | ---${thirdSeparator} |\n` +
        `| Anna Beispiel | Testerin${thirdValue} |`;
      const rawResidual = pii.scanResidual(source, 'customer_document');
      assert.ok(!rawResidual.some((hit) => hit.type === 'TABLE_STRUCTURE_AMBIGUOUS'),
        `${header}/${width}: a single equal-width header is not structurally ambiguous`);
      if (directPersonHeaders.has(header)) {
        const result = anonymizeMarkdown(source, 'customer_document');
        assertAbsent(result.text, 'Anna Beispiel', `${header}/${width}`);
        assert.match(result.text, /\[PERSON_\d+\]/u, `${header}/${width}`);
        assertPresent(result.text, header, `${header}/${width}`);
        assertPresent(result.text, 'Testerin', `${header}/${width}`);
        if (width === 3) assertPresent(result.text, 'intern', `${header}/${width}`);
        assert.deepStrictEqual(pii.scanResidual(result.text, 'customer_document', result.dictionary, {
          strongPersonAnchor: result.strongPersonAnchor
        }), [], `${header}/${width}`);
      } else {
        assert.ok(rawResidual.some((hit) => hit.type === 'PERSON_CANDIDATE' && hit.text === 'Anna Beispiel'),
          `${header}/${width}: an unclear column must still stop independently`);
        assert.throws(() => anonymizeMarkdown(source, 'customer_document'), /PERSON_CANDIDATE/u,
          `${header}/${width}: no silent pass is allowed`);
      }
    }
  }

  for (const source of [
    '| Abteilung | Rolle |\n| --- | --- |\n| Qualitätssicherung | Testteam |',
    '| Fall | Status |\n| --- | --- |\n| abgeschlossen | grün |'
  ]) {
    const result = anonymizeMarkdown(source, 'customer_document');
    assert.strictEqual(result.text, source);
    assert.deepStrictEqual(pii.scanResidual(result.text, 'customer_document', result.dictionary, {
      strongPersonAnchor: result.strongPersonAnchor
    }), []);
  }

  const resolvedPersonBelowNeutralSuperheader =
    '| Personal | Kategorie |\n| Mitarbeiter | Rolle |\n| --- | --- |\n| Anna Beispiel | Testerin |';
  const resolved = anonymizeMarkdown(resolvedPersonBelowNeutralSuperheader, 'customer_document');
  assertAbsent(resolved.text, 'Anna Beispiel', 'a direct person header resolves its own column');
  assert.match(resolved.text, /\[PERSON_\d+\]/u);
  assert.deepStrictEqual(pii.scanResidual(resolved.text, 'customer_document', resolved.dictionary, {
    strongPersonAnchor: resolved.strongPersonAnchor
  }), []);

  for (const source of [
    '| Geburts | Steuer | Rolle |\n| datum | Kennung | Typ |\n| --- | --- | --- |\n| 01.01.1980 | 26954371827 | Testerin |',
    '| Geburts | Passwort | Rolle |\n| datum | Kennung | Typ |\n| --- | --- | --- |\n| 01.01.1980 | sk-live-secret | Testerin |'
  ]) {
    const rawResidual = pii.scanResidual(source, 'customer_document');
    assert.ok(rawResidual.some((hit) => hit.type === 'TABLE_STRUCTURE_AMBIGUOUS'), source);
    const first = anonymize(source, 'customer_document');
    assert.ok(pii.scanResidual(first.text, 'customer_document', first.dictionary, {
      strongPersonAnchor: first.strongPersonAnchor
    }).some((hit) => hit.type === 'TABLE_STRUCTURE_AMBIGUOUS'), source);
    assert.throws(() => anonymizeMarkdown(source, 'customer_document'), /TABLE_STRUCTURE_AMBIGUOUS/u, source);
  }
});

test('gendered salutations are removed while professional academic titles remain', () => {
  for (const [source, expectedPrefix] of [
    ['Ansprechpartner: Frau Dr. med. Anna Beispiel', 'Ansprechpartner: Dr. med. [PERSON_001]'],
    ['Ansprechpartner: Herr Prof. Dr. rer. nat. Erik Muster', 'Ansprechpartner: Prof. Dr. rer. nat. [PERSON_001]'],
    ['Ansprechpartner: Dr. h. c. Erika Beispiel', 'Ansprechpartner: Dr. h. c. [PERSON_001]']
  ]) {
    const result = anonymize(source, 'general');
    assert.strictEqual(result.text, expectedPrefix);
    assert.deepStrictEqual(pii.scanResidual(result.text, 'general', result.dictionary, {
      strongPersonAnchor: result.strongPersonAnchor
    }), []);
  }
});

test('month-year prose remains while real prepositional street addresses are redacted', () => {
  for (const source of ['Im Januar 1980 wurde das Projekt gestartet.', 'Im Dezember 2025 endete das Projekt.']) {
    assert.strictEqual(anonymize(source, 'general').text, source);
  }
  for (const source of ['Am Markt 12', 'Im Grund 5', 'Zur Alten Post 7']) {
    assertPresent(anonymize(source, 'general').text, '[LOCATION_REDACTED]', source);
  }
});

// Counter-review rc94: shifted, merged or spilled rows cannot be bound to a
// sensitive header safely by position. They must stop at the independent gate.
test('ambiguous sensitive table structures fail closed instead of guessing columns', () => {
  for (const source of [
    '| Name | Steuer-ID | Ort |\n|---|---|---|\n| Max Mustermann | 26954371827 | Berlin | extra |',
    '| Name | Steuer-ID | Ort |\n|---|---|---|\n| Zusatz | Max Mustermann | 26954371827 | Berlin |',
    '| Name | Steuer-ID | Ort | Menge |\n|---|---|---|---|\n| Max Mustermann | 26954371827 | Berlin |',
    '| Name | Geburtsdatum | Telefon |\n|---|---|---|\n| Max Mustermann | 01.01.1980 | 030 12345678 | Notiz |\n| Erika Beispiel | 05.05.1975 |'
  ]) {
    const result = anonymize(source, 'general');
    for (const candidate of [
      pii.scanResidual(source, 'general'),
      pii.scanResidual(result.text, 'general', result.dictionary, { strongPersonAnchor: result.strongPersonAnchor })
    ]) assert.ok(candidate.some((hit) => hit.type === 'TABLE_STRUCTURE_AMBIGUOUS'), source);
  }
});

test('overlong and mismatched sensitive table headers fail closed', () => {
  for (const source of [
    '| Steuer | Menge |\n| vertrauliche | Anzahl |\n| Identifikations | Nummer |\n| nummer | Stück |\n| --- | --- |\n| 26954371827 | 42 |',
    '| Steuer | Geburts |\n| ID | datum |\n| --- | --- | --- |\n| 26954371827 | 01.01.1980 |'
  ]) {
    const result = anonymize(source, 'general');
    assert.ok(pii.scanResidual(source, 'general').some((hit) => hit.type === 'TABLE_STRUCTURE_AMBIGUOUS'), source);
    assert.ok(pii.scanResidual(result.text, 'general', result.dictionary, {
      strongPersonAnchor: result.strongPersonAnchor
    }).some((hit) => hit.type === 'TABLE_STRUCTURE_AMBIGUOUS'), source);
  }
  assert.throws(
    () => anonymizeMarkdown('| Name | Steuer-ID | Ort |\n| --- | --- | --- |\n| Zusatz | Max Mustermann | 26954371827 | Berlin |', 'general'),
    /TABLE_STRUCTURE_AMBIGUOUS/u,
    'the publishing compliance path must stop an ambiguous sensitive table'
  );
});

test('professional three-row headers and title-like technology names stay unchanged', () => {
  const controls = [
    '| Projekt | Version | Menge |\n| - | - | - |\n| ID | Nummer | Stück |\n| --- | --- | --- |\n| PRJ-4711 | 3.2.0 | 42 |',
    'Technologie: Mx Graph API',
    'Produkt: Ms Project Server',
    'Framework: Mr Robot Framework',
    'Stack: MS Project Server und Microsoft Graph API',
    'Radiologie: Imaging Protocol, Image Reconstruction und Scanner Calibration',
    'Klinik: Treatment Protocol und Spectroscopy Report'
  ];
  for (const source of controls) {
    const result = anonymize(source, 'personnel_profile');
    assert.strictEqual(result.text, source, source);
    assert.deepStrictEqual(pii.scanResidual(result.text, 'personnel_profile', result.dictionary, {
      strongPersonAnchor: result.strongPersonAnchor
    }), [], source);
  }
});

// Counter-review rc93: "Dr.-Ing." is one title token. "Dr." followed by "-Ing."
// broke the honorific anchor and left the full name in clear with a blind gate.
test('Dr.-Ing. titles anchor the name and stay in front of the pseudonym', () => {
  for (const [source, expected] of [
    ['Projektleiter: Dr.-Ing. Max Mustermann, Bauingenieur', 'Projektleiter: Dr.-Ing. [PERSON_001], Bauingenieur'],
    ['Leitung: Prof. Dr.-Ing. Erika Beispiel', 'Leitung: Prof. Dr.-Ing. [PERSON_001]'],
    ['Dr.-Ing. Max Mustermann leitet die Statik.', 'Dr.-Ing. [PERSON_001] leitet die Statik.']
  ]) {
    const result = anonymize(source, 'personnel_profile');
    assert.strictEqual(result.text, expected, source);
    assert.deepStrictEqual(require('../plugins/data-secure/server/privacy/engine').scanResidual(result.text, 'personnel_profile', result.dictionary, { strongPersonAnchor: result.strongPersonAnchor }), []);
  }
});

// Counter-review rc93: English salutations are gendered salutations too. They
// neither anchored the name nor were removed, leaving the full name in clear.
test('English salutations anchor the name and are removed like German ones', () => {
  for (const [source, expected] of [
    ['Contact: Mrs. Erika Beispiel', 'Contact: [PERSON_001]'],
    ['Contact: Mr. Max Mustermann', 'Contact: [PERSON_001]'],
    ['Contact: Ms Anna Beispiel', 'Contact: [PERSON_001]'],
    ['Contact: Mx Alex Taylor', 'Contact: [PERSON_001]'],
    ['Contact: Mr. Dr. Max Mustermann', 'Contact: Dr. [PERSON_001]'],
    ['Dear Mrs. Beispiel,', 'Dear [PERSON_001],']
  ]) {
    const result = anonymize(source, 'personnel_profile');
    assert.strictEqual(result.text, expected, source);
    assert.deepStrictEqual(require('../plugins/data-secure/server/privacy/engine').scanResidual(result.text, 'personnel_profile', result.dictionary, { strongPersonAnchor: result.strongPersonAnchor }), []);
  }
  const control = anonymize('Summr Report und Timr Werte bleiben, MRS steht für Multi Resolution Scan.', 'personnel_profile');
  assertPresent(control.text, 'Summr Report', 'a word ending in "mr" is not a salutation');
  assertPresent(control.text, 'Multi Resolution Scan', 'an acronym sentence stays');
});

// A nested title/qualifier repetition backtracked exponentially on long runs of
// title-like tokens and stalled the batch-session suite; the flat chain must
// stay linear.
test('long runs of title-like tokens are anonymized in linear time', () => {
  const run = `${'Dipl.-Ing. Ing. Dr. med. '.repeat(60)}Anna Beispiel und ${'Prof. Dr. h. c. '.repeat(40)}Erik Muster`;
  const started = Date.now();
  const result = anonymize(`Ansprechpartner: ${run}\nKontakt: Dr. med. Erika Beispiel\nRolle: Leitung`, 'personnel_profile');
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2000, `title runs must not backtrack (took ${elapsed} ms)`);
  assertAbsent(result.text, 'Erika Beispiel', 'an ordinary titled name in the same document');
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

test('F7 sends narrow prose person candidates to local review without flagging professional phrases', () => {
  for (const source of [
    'Anna Berger koordinierte die Einführung.',
    'Max Mustermann verantwortete die Prüfung.',
    'María-José Núñez bestätigte den Termin.',
    'Jean-Luc de la Croix berichtete über den Stand.',
    'Die Prüfung endete. Anna Berger antwortete sofort.',
    '**Ferdinand Quastenflosser** berichtete über den Stand.',
    '[Anna Berger](profil) koordinierte die Einführung.',
    'Ansprechpartner: Cornelia Zwirbelbach\nAm Montag hat Ferdinand Quastenflosser die Rechnung geschickt.',
    'Ansprechpartner: Cornelia Zwirbelbach\n- Ferdinand Quastenflosser berichtet morgen.'
  ]) {
    const ambiguities = personProseAmbiguities(source, source);
    assert.strictEqual(ambiguities.length, 1, source);
    assert.strictEqual(ambiguities[0].type, 'person_prose_ambiguous');
    assert.strictEqual(ambiguities[0].replacement_kind, 'PERSON');
  }
  for (const source of [
    'Digitale Transformation verbessert Abläufe.',
    'Strategic Planning verbessert Prozesse.',
    'Public Administration berichtet über Methoden.',
    'Cloud Native unterstützt Plattformen.',
    'Zero Trust verbessert die Sicherheit.',
    'Spring Boot unterstützt Anwendungen.',
    'Lean Management verbessert Abläufe.',
    'Service Management berichtet über den Stand.',
    'Customer Success koordinierte die Einführung.',
    'Am Montag hat das Team begonnen.'
  ]) assert.deepStrictEqual(personProseAmbiguities(source, source), [], source);
});

test('F7 alignment returns only a candidate that survived ordinary anonymization', () => {
  const source = 'Name: Erika Beispiel\nAnna Berger koordinierte die Einführung.';
  const output = anonymize(source, 'personnel_profile').text;
  const ambiguities = personProseAmbiguities(source, output);
  assert.strictEqual(ambiguities.length, 1);
  assert.strictEqual(output.slice(ambiguities[0].anonymized_start, ambiguities[0].anonymized_end), 'Anna Berger');
  assert.ok(!JSON.stringify(ambiguities).includes('Anna Berger'));
});

done();
