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

done();
