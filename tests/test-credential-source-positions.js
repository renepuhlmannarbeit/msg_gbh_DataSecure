'use strict';
const { createSuite } = require('./helpers');
const { test, testAsync, assert, done } = createSuite('Actual credential source positions');
const credentials = require('../plugins/data-secure/server/privacy/credentials');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } = require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { normalizeText } = require('../plugins/data-secure/server/privacy/base');
const { detectProfileFromMarkdown } = require('../plugins/data-secure/server/gateway/common');
const options = { productChannel: 'standalone', contentOptions:
  { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false } };
const org = 'Nordlicht Beispiel GmbH';
const prefixes = ['', 'I Hinweis ', 'İ Hinweis ', '😀 İ Hinweis ', 'ÄÖÜß Hinweis ', 'İ'.repeat(32) + ' '];
const text = (prefix, organization = org) => 'Zertifizierungen\n' + prefix + 'Quantum Validation Expert bei ' + organization;
test('ambiguous source occurrences retain exact UTF16 bounds after expanding lowercase characters', () => {
  for (const prefix of prefixes) {
    const source = text(prefix), start = source.indexOf(org);
    assert.equal(credentials.credentialOrganizationRole(source, start, start + org.length), 'ambiguous');
    const values = credentials.credentialIssuerAmbiguities(source, source);
    assert.equal(values.length, 1);
    assert.deepEqual([values[0].original_start, values[0].original_end], [start, start + org.length]);
    assert.deepEqual([values[0].anonymized_start, values[0].anonymized_end], [start, start + org.length]);
    assert.equal(source.slice(values[0].original_start, values[0].original_end), org);
  }
});
test('actual anonymization and fallback alignment keep every output occurrence in its original coordinates', () => {
  for (const prefix of prefixes) {
    const source = text(prefix), output = anonymizeMarkdown(source, 'personnel_profile', options).text;
    const values = credentials.credentialIssuerAmbiguities(source, output);
    assert.equal(values.length, 1);
    assert.equal(source.slice(values[0].original_start, values[0].original_end), org);
    assert.equal(output.slice(values[0].anonymized_start, values[0].anonymized_end), org);
  }
  const source = text('İ Hinweis '), changed = '😀 İ Zusatz ' + org + '; ' + org;
  const values = credentials.credentialIssuerAmbiguities(source, changed);
  assert.equal(values.length, 2);
  assert.deepEqual(values.map(value => value.anonymized_start), [changed.indexOf(org), changed.lastIndexOf(org)]);
  assert.ok(values.every(value => changed.slice(value.anonymized_start, value.anonymized_end) === org));
});
testAsync('bound Standalone text preparation cannot skip the actual organisation choice', async () => {
  for (const prefix of prefixes) for (const profile of ['personnel_profile', 'applicant']) {
    const prepared = prepareTextPrivacyReview({ text: text(prefix), profile, productChannel: 'standalone', consumerOptions: options });
    assert.equal(prepared.organizationAmbiguities.length, 1);
    assert.ok(prepared.ambiguities.includes(prepared.organizationAmbiguities[0]));
    await assert.rejects(resolveTextPrivacyReview(prepared, null), { code: 'AMBIGUITY_REVIEW_REQUIRED' });
  }
});
test('literal company punctuation and original case remain source text, never regex syntax', () => {
  for (const organization of ['Nordlicht Beispiel GmbH', 'Alpha+Beta GmbH', 'Punkt.Firma GmbH', 'NORDLICHT BEISPIEL GMBH']) {
    const source = text('😀 İ Hinweis ', organization);
    const values = credentials.credentialIssuerAmbiguities(source, source);
    assert.ok(values.length > 0, organization);
    assert.ok(values.every(value => source.slice(value.original_start, value.original_end) ===
      source.slice(value.anonymized_start, value.anonymized_end)));
    assert.ok(values.some(value => source.slice(value.original_start, value.original_end) === organization), organization);
  }
});
test('line endings and earlier actual redactions keep source and output coordinate bases separate', () => {
  for (const ending of ['\n', '\r\n']) {
    const input = ['Kontakt: test.person@example.invalid', 'Zertifizierungen',
      '😀 İ Hinweis Quantum Validation Expert bei ' + org + ', abgeschlossen.'].join(ending);
    const output = anonymizeMarkdown(input, 'personnel_profile', options).text;
    assert.ok(!output.includes('test.person@example.invalid'));
    const source = normalizeText(input), values = credentials.credentialIssuerAmbiguities(source, output);
    assert.equal(values.length, 1);
    assert.equal(source.slice(values[0].original_start, values[0].original_end), org);
    assert.equal(output.slice(values[0].anonymized_start, values[0].anonymized_end), org);
    assert.notEqual(values[0].original_start, values[0].anonymized_start);
  }
});
test('Unicode simple casefold fallback uses actual matches and does not invent full-fold identities', () => {
  for (const [sourceName, outputName, count] of [
    ['Maßstab GmbH', 'MAẞSTAB GMBH', 1], ['Ähre GmbH', 'ähre GmbH', 1],
    ['Sonne GmbH', 'ſonne GmbH', 1], ['Σigma GmbH', 'ςigma GmbH', 1],
    ['İnsel GmbH', 'İnsel GmbH', 1], ['İnsel GmbH', 'i\u0307nsel GmbH', 0],
    ['Insel GmbH', 'ınsel GmbH', 0], ['Maßstab GmbH', 'Massstab GmbH', 0]
  ]) {
    const source = text('İ Hinweis ', sourceName), output = 'Nicht alignbarer Zusatz 😀: ' + outputName;
    const values = credentials.credentialIssuerAmbiguities(source, output);
    assert.equal(values.length, count, sourceName + ' -> ' + outputName);
    for (const value of values) {
      assert.equal(source.slice(value.original_start, value.original_end), sourceName);
      assert.equal(output.slice(value.anonymized_start, value.anonymized_end), outputName);
    }
  }
});
testAsync('actual auto-profile resolution and conservative review mask the ambiguous organisation', async () => {
  for (const prefix of ['İ Hinweis ', '😀 İ Hinweis ']) {
    const source = 'Mitarbeiterprofil\nProjekterfahrung\n' + text(prefix);
    const profile = detectProfileFromMarkdown(source);
    assert.equal(profile, 'personnel_profile');
    const prepared = prepareTextPrivacyReview({ text: source, profile, productChannel: 'standalone',
      consumerOptions: options, captureTrace: true });
    assert.equal(prepared.organizationAmbiguities.length, 1);
    const reviewed = await resolveTextPrivacyReview(prepared, null, { reviewPolicy: 'automatic-conservative' });
    assert.ok(!reviewed.includes(org));
    const final = finalizeTextPrivacyReview(prepared, reviewed, { prefix: '', suffix: '' });
    assert.ok(!final.markdown.includes(org));
    assert.equal(final.transform_trace.complete, true);
  }
  assert.equal(detectProfileFromMarkdown('Allgemeiner Fachtext ohne Profilsignale.'), 'general');
});
test('explicit issuers and private employer roles retain their separate established decisions', () => {
  for (const source of ['Microsoft Certified: Azure Administrator Associate',
    'Zertifizierungen\nMicrosoft Azure Administrator Associate', 'Arbeitgeber: Microsoft\nRolle: Developer']) {
    const result = anonymizeMarkdown(source, 'personnel_profile', options);
    assert.deepEqual(credentials.credentialIssuerAmbiguities(source, result.text), []);
  }
  const source = 'Zertifizierungen\nArbeitgeber: Nordlicht Beispiel GmbH';
  const result = anonymizeMarkdown(source, 'personnel_profile', options);
  assert.ok(!result.text.includes(org)); assert.deepEqual(credentials.credentialIssuerAmbiguities(source, result.text), []);
});
done();
