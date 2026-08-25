'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite, assertAbsent, assertPresent } = require('./helpers');
const pii = require('../plugins/data-secure/server/pii-engine');
const {
  catalog,
  validateCredentialCatalog,
  compileCatalogMatchers,
  normalizeCatalogKey
} = require('../plugins/data-secure/server/privacy/credential-catalog');
const {
  credentialContextDetails,
  inCredentialContext
} = require('../plugins/data-secure/server/privacy/credentials');

const { test, done, assert } = createSuite('Credential catalog contracts');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function compactCatalog(entries) {
  return { schema_version: 'credential-catalog/1', entries };
}

function entry(overrides = {}) {
  return {
    id: 'example-board',
    display_name: 'Example Board',
    aliases: ['Example Board'],
    category: 'testing',
    codes: ['EXB'],
    ...overrides
  };
}

test('the shipped catalog validates and contains only deterministic local fields', () => {
  assert.strictEqual(validateCredentialCatalog(catalog), catalog);
  const forbidden = new Set(['checked_at', 'expires_at', 'valid_until', 'retrieved_at']);
  for (const item of catalog.entries) {
    for (const field of Object.keys(item)) assert.ok(!forbidden.has(field), `forbidden freshness field: ${field}`);
  }
  const moduleSource = fs.readFileSync(
    path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'privacy', 'credential-catalog.js'),
    'utf8'
  );
  assert.ok(!/\b(?:fetch|https?\.request)\s*\(/u.test(moduleSource), 'catalog loader must not perform network I/O');
});

test('ids and normalized aliases cannot collide across entries', () => {
  const duplicateId = compactCatalog([entry(), entry({ aliases: ['Second Board'] })]);
  assert.throws(() => validateCredentialCatalog(duplicateId), /duplicate credential catalog id/);

  const aliasCollision = compactCatalog([
    entry(),
    entry({ id: 'other-board', display_name: 'Other Board', aliases: ['  EXAMPLE   BOARD  '], codes: ['OTH'] })
  ]);
  assert.throws(() => validateCredentialCatalog(aliasCollision), /credential alias collision/);
  assert.strictEqual(normalizeCatalogKey('  İSQI  '), normalizeCatalogKey(' İSQI '));
});

test('unknown fields and active code patterns are rejected', () => {
  assert.throws(
    () => validateCredentialCatalog(compactCatalog([entry({ owner: 'nobody' })])),
    /unknown field/
  );
  assert.throws(
    () => validateCredentialCatalog(compactCatalog([entry({ codes: ['EX.*'] })])),
    /unsafe code literal/
  );
});

test('reference URLs are optional and accepted only as explicitly verified HTTPS references', () => {
  assert.doesNotThrow(() => validateCredentialCatalog(compactCatalog([entry()])));
  assert.doesNotThrow(() => validateCredentialCatalog(compactCatalog([
    entry({ reference_url: 'https://example.invalid/certifications', reference_verified: true })
  ])));
  assert.throws(
    () => validateCredentialCatalog(compactCatalog([entry({ reference_url: 'http://example.invalid' })])),
    /must use https/
  );
  assert.throws(
    () => validateCredentialCatalog(compactCatalog([entry({ reference_url: 'https://example.invalid' })])),
    /requires reference_verified/
  );
});

test('verified sources are local catalog metadata, never a runtime lookup', () => {
  const sources = {
    istqb: 'https://www.istqb.org/certifications/',
    ireb: 'https://cpre.ireb.org/en',
    uxqb: 'https://www.uxqb.org/',
    'scrum-alliance': 'https://www.scrumalliance.org/get-certified',
    'scrum-org': 'https://www.scrum.org/professional-scrum-certifications',
    'scaled-agile': 'https://scaledagile.com/certification/',
    'kanban-university': 'https://kanban.university/about-kanban-university/',
    iiba: 'https://www.iiba.org/business-analysis-certifications/iiba-certifications/',
    himss: 'https://www.himss.org/certifications/',
    'open-group': 'https://www.opengroup.org/certifications/accredited-certification-program-home-page',
    microsoft: 'https://learn.microsoft.com/en-us/credentials/',
    aws: 'https://docs.aws.amazon.com/aws-certification/latest/examguides/aws-certification-exam-guides.html',
    'google-cloud': 'https://cloud.google.com/learn/certification?hl=en',
    cisco: 'https://www.cisco.com/site/us/en/learn/training-certifications/certifications/index.html',
    isaca: 'https://www.isaca.org/credentialing',
    isc2: 'https://www.isc2.org/certifications',
    'linux-foundation': 'https://training.linuxfoundation.org/certification-catalog/',
    cncf: 'https://training.linuxfoundation.org/certification-catalog/',
    pmi: 'https://www.pmi.org/certifications',
    peoplecert: 'https://www.peoplecert.org/Organizations/Certifications',
    'red-hat': 'https://www.redhat.com/en/services/certifications',
    sap: 'https://learning.sap.com/get-certified',
    hl7: 'https://info.hl7.org/hubfs/Education/Path%20to%20HL7%20Certification.pdf'
  };
  for (const [id, referenceUrl] of Object.entries(sources)) {
    const item = catalog.entries.find((entry) => entry.id === id);
    assert.strictEqual(item.reference_url, referenceUrl);
    assert.strictEqual(item.reference_verified, true);
  }
  const openGroup = catalog.entries.find((item) => item.id === 'open-group');
  assert.ok(compileCatalogMatchers(catalog).code.test('TOGAF Enterprise Architecture Practitioner'));
  assert.ok(compileCatalogMatchers(catalog).code.test('SAFe Scrum Master (SSM)'));
  assert.ok(compileCatalogMatchers(catalog).code.test('SAFe Product Owner/Product Manager (POPM)'));
  assert.ok(compileCatalogMatchers(catalog).code.test('Certified ScrumMaster (CSM)'));
  assert.ok(compileCatalogMatchers(catalog).code.test('PRINCE2 Foundation'));
});

test('aliases are compiled as literals rather than executable regular expressions', () => {
  const matchers = compileCatalogMatchers(compactCatalog([
    entry({ aliases: ['Example (Board)+'], codes: ['EXB'] })
  ]));
  assert.ok(matchers.issuer.test('Example (Board)+ Certified Professional'));
  assert.ok(!matchers.issuer.test('Example Boarddddd Certified Professional'));
});

test('every issuer alias stays in a certification section but is anonymized as employer and customer', () => {
  for (const item of catalog.entries) {
    for (const alias of item.aliases) {
      const certification = pii.anonymize(`Zertifizierungen\n${alias} Certified Professional`, 'personnel_profile').text;
      assertPresent(certification, alias, `${item.id} certification issuer`);

      const employer = pii.anonymize(`Arbeitgeber: ${alias}`, 'personnel_profile').text;
      assertAbsent(employer, alias, `${item.id} employer`);

      const customer = pii.anonymize(`Kunde: ${alias}`, 'personnel_profile').text;
      assertAbsent(customer, alias, `${item.id} customer`);
    }
  }
});

test('every catalogued credential code stays in a certification section without protecting an employer', () => {
  for (const item of catalog.entries) {
    for (const code of item.codes) {
      const certification = pii.anonymize(`Zertifizierungen\n${code} Certified Professional`, 'personnel_profile').text;
      assertPresent(certification, code, `${item.id} credential code`);

      const employer = pii.anonymize(`Arbeitgeber: ${code} Consulting GmbH`, 'personnel_profile').text;
      assertAbsent(employer, `${code} Consulting GmbH`, `${item.id} employer-shaped credential code`);
    }
  }
});

test('the same alias is not protected merely because it occurs in a technology field', () => {
  for (const item of catalog.entries) {
    for (const alias of item.aliases) {
      const text = `Technologien: ${alias}`;
      const start = text.indexOf(alias);
      const details = credentialContextDetails(text);
      assert.strictEqual(
        inCredentialContext(text, start, start + alias.length, details),
        false,
        `${item.id} must not become a credential issuer in a technology field`
      );
      assertPresent(pii.anonymize(text, 'personnel_profile').text, alias, `${item.id} technology term`);
    }
  }
});

test('unknown credentials remain professional content inside an explicit certification section', () => {
  const value = 'Example Learning GmbH Quantum Validation Expert (QVE)';
  const output = pii.anonymize(`Zertifizierungen\n${value}`, 'personnel_profile').text;
  assertPresent(output, value, 'unknown credential');
});

test('long project prose is never classified from an issuer and role word alone', () => {
  const prose = `Projektbeschreibung: ${'Langbeschreibung ohne personenbezogene Daten. '.repeat(6)}` +
    'Microsoft war Kunde; Aufgaben als Product Owner und Solutions Architect.';
  assert.ok(prose.length > 180);
  assert.deepStrictEqual(credentialContextDetails(prose), []);
});

// A customer or employer named in prose inside a certification section never
// carries the "Label:" shape the section-wide protection was built around
// ("Zertifikat ausgestellt für Kunde ABC GmbH"). The organisation regex also
// folds the role noun into the match itself ("Kunde ABC GmbH"), so the cue
// word is no longer text preceding the span either. Both gaps together used
// to leave the customer fully unredacted while still protecting the genuine
// issuer on the same line - an under-redaction, the more severe failure
// direction for this product.
test('a customer or employer named in prose inside a certification section is still anonymized', () => {
  const cases = [
    ['Zertifizierungen\nZertifikat ausgestellt für Kunde ABC Beispiel GmbH im Projekt XY, Scrum.org Professional Scrum Master I.', 'ABC Beispiel GmbH'],
    ['Zertifizierungen\nPMI-ACP erworben während der Anstellung beim Arbeitgeber Contoso Beispiel AG.', 'Contoso Beispiel AG'],
    ['Certifications\nAWS Certified Cloud Practitioner, delivered for customer Example Nordics Ltd.', 'Example Nordics Ltd'],
    // The feminine German noun form ("Kundin"/"Kunde" only differ by
    // grammatical gender, not by role) and a verb-phrased employer mention
    // without any role noun at all ("Anstellung bei"/"employed at") are
    // separate gaps in the same cue-recognition mechanism.
    ['Zertifizierungen\nAnstellung bei Nordpol Beispiel AG, während der Zeit ISTQB Certified Tester erworben.', 'Nordpol Beispiel AG'],
    ['Certifications\nEmployed at Baltic Beispiel Ltd, obtained AWS Certified Cloud Practitioner.', 'Baltic Beispiel Ltd']
  ];
  for (const [text, customer] of cases) {
    const output = pii.anonymize(text, 'personnel_profile').text;
    assertAbsent(output, customer, `customer named in prose (${customer})`);
  }
});

test('a customer named via the feminine "Kundin" form in a certification section is still anonymized', () => {
  const output = pii.anonymize(
    'Zertifizierungen\nZertifikat ausgestellt für Kundin Erika Beispielfrau im Projekt XY, PMI-ACP erworben.',
    'personnel_profile'
  ).text;
  assertAbsent(output, 'Erika Beispielfrau', 'customer named via Kundin');
});

test('the genuine issuer on the same line survives the prose-customer fix', () => {
  const output = pii.anonymize(
    'Zertifizierungen\nZertifikat ausgestellt für Kunde ABC Beispiel GmbH im Projekt XY, Scrum.org Professional Scrum Master I.',
    'personnel_profile'
  ).text;
  assertPresent(output, 'Scrum.org', 'certification issuer');
  assertPresent(output, 'Professional Scrum Master', 'certification title');
});

// isCredentialIssuerDomain() only checked the credential title *after* the
// domain ("Scrum.org Professional Scrum Master I"), so an equally common
// shape naming the credential *before* the domain ("Zertifikat ausgestellt
// von Scrum.org") fell through to URL_RE and was over-redacted to
// [URL_REDACTED] even though inCredentialContext already knew the line was
// protected. Over-redaction rather than a leak, but still turns a genuine,
// professionally relevant issuer name into a placeholder.
test('a domain-shaped issuer named before the credential title is preserved, not treated as a URL', () => {
  const output = pii.anonymize('Zertifizierungen\nZertifikat ausgestellt von Scrum.org.', 'personnel_profile').text;
  assertPresent(output, 'Scrum.org', 'issuer named before the credential title');
});

test('an unrelated domain outside credential context is still redacted as a URL', () => {
  const output = pii.anonymize(
    'Kontakt: max.mustermann@example-synthetic.test, siehe auch example-portfolio.com für Details.',
    'personnel_profile'
  ).text;
  assertAbsent(output, 'example-portfolio.com', 'unrelated domain');
});

// RC41 counter-review (tasks/FOLGEAUFTRAG-P0-CREDENTIAL-CONTEXT-RC41.md): the
// previous fix protected a domain whenever *any* credential cue shared its
// line, regardless of whether the cue actually named that domain as issuer.
// A domain merely referenced for "further information" inside a certificate
// line is not the issuer and must still be redacted - an under-redaction,
// the more severe failure direction.
test('a domain merely referenced inside a certificate line is not treated as its issuer', () => {
  const output = pii.anonymize(
    'Zertifizierungen\nZertifikat: AWS Certified Cloud Practitioner – weitere Informationen bei alpha-health.de',
    'personnel_profile'
  ).text;
  assertAbsent(output, 'alpha-health.de', 'unrelated reference domain in a certificate line');
});

test('the same unrelated-reference-domain gap reproduces inside a CSV cell', () => {
  const csv = 'Kategorie,Eintrag\n' +
    'Zertifizierungen,"Zertifikat: AWS Certified Cloud Practitioner, weitere Informationen bei alpha-health.de"\n';
  const output = pii.anonymize(csv, 'personnel_profile').text;
  assertAbsent(output, 'alpha-health.de', 'unrelated reference domain in a CSV cell');
});

test('a genuine issuer named via "ausgestellt von" directly before the domain still survives', () => {
  const output = pii.anonymize(
    'Zertifizierungen\nZertifikat ausgestellt von alpha-health.de.',
    'personnel_profile'
  ).text;
  assertPresent(output, 'alpha-health.de', 'issuer bound by an explicit attribution phrase');
});

// The attribution phrase and the domain can land on adjacent lines once text
// is extracted from a DOCX paragraph break or a short two-line CV block. The
// binding stays local to this one line pair, not a whole-section allowlist.
test('a genuine issuer split across two lines by "ausgestellt von" still survives', () => {
  const output = pii.anonymize(
    'Zertifizierungen\nZertifikat ausgestellt von\nScrum.org.',
    'personnel_profile'
  ).text;
  assertPresent(output, 'Scrum.org', 'issuer named on the line after the attribution phrase');
});

test('a customer named via the nominal "Tätigkeit für" form in a certification section is still anonymized', () => {
  const output = pii.anonymize(
    'Zertifizierungen\nWährend meiner Tätigkeit für Nordlicht Beispiel AG erwarb ich ISTQB Certified Tester.',
    'personnel_profile'
  ).text;
  assertAbsent(output, 'Nordlicht Beispiel AG', 'customer named via Tätigkeit für');
  assertPresent(output, 'ISTQB', 'certification title');
});

test('a customer named via "im Auftrag von" in a certification section is still anonymized', () => {
  const output = pii.anonymize(
    'Zertifizierungen\nZertifikat erworben im Auftrag von Alpha Beispiel GmbH, ausgestellt durch Scrum.org.',
    'personnel_profile'
  ).text;
  assertAbsent(output, 'Alpha Beispiel GmbH', 'customer named via im Auftrag von');
  assertPresent(output, 'Scrum.org', 'genuine issuer on the same line');
});

// The organisation-name-fused-with-a-role-word gap ("Kunde ABC GmbH") cuts
// both ways: a real certification body whose own name happens to start with
// a signal word ("Customer Institute GmbH") must not be treated as a
// customer merely because of that leading word. It is only safe to trust the
// name over the signal word when a credential title immediately follows on
// the same line, mirroring the "IssuerName Title" shape already used for
// every catalogued issuer alias in this file - a comma or clause break still
// suppresses the override, so an actual customer followed by unrelated
// certificate prose is not accidentally protected.
test('a real issuer name starting with a customer/employer signal word is not over-redacted', () => {
  const output = pii.anonymize(
    'Zertifizierungen\nCustomer Institute GmbH Certified Testing Professional.',
    'personnel_profile'
  ).text;
  assertPresent(output, 'Customer Institute GmbH', 'issuer name starting with a signal word');
});

test('a real customer immediately followed by unrelated certificate prose is still anonymized', () => {
  const cases = [
    ['Zertifizierungen\nKunde TechCorp Beispiel GmbH, Certified Scrum Master Schulung durchgeführt.', 'TechCorp Beispiel GmbH'],
    ['Zertifizierungen\nKunde TechCorp Beispiel GmbH Certified Scrum Master Schulung durchgeführt.', 'TechCorp Beispiel GmbH'],
    ['Zertifizierungen\nKunde: TechCorp Beispiel GmbH Certified Scrum Master Schulung durchgeführt.', 'TechCorp Beispiel GmbH'],
    ['Certifications\nCustomer Example Nordics Ltd Certified Scrum Master training delivered.', 'Example Nordics Ltd'],
    ['Certifications\nClient Example Health Ltd Certified Testing Professional training delivered.', 'Example Health Ltd']
  ];
  for (const [text, customer] of cases) {
    const output = pii.anonymize(text, 'personnel_profile').text;
    assertAbsent(output, customer, `customer followed by certificate prose (${customer})`);
  }
});

done();
