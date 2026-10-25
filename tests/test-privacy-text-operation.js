'use strict';

// The shared operation uses the actual privacy engine and review policy; no
// detector fixture or saved `passed` flag can stand in for its final gate.
const { createSuite } = require('./helpers');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } =
  require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { makeRegistry } = require('../plugins/data-secure/server/privacy/entities');
const { replayTransformTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const { reviewedBatchText } = require('../plugins/data-secure/server/gateway/batch-review-policy');
const { createBatchPseudonymRegistry, READABLE_CONTRACT_VERSION, canonicalValue } =
  require('../plugins/data-secure/server/batch-pseudonym-registry');
const { verifyAnonymizedPublication } = require('../plugins/data-secure/server/standalone/anonymized-artifact');
const { createSourceExtraction } = require('../plugins/data-secure/server/core/source-extraction-contract');
const pii = require('../plugins/data-secure/server/pii-engine');
const { testAsync, assert, done } = createSuite('Shared text privacy operation');
const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false };
const prepare = (text, extra = {}) => prepareTextPrivacyReview({ text, profile: 'general', productChannel: 'standalone',
  consumerOptions: { productChannel: 'standalone', contentOptions }, registry: makeRegistry(), captureTrace: true, ...extra });
const review = decision => input => reviewedBatchText(input,
  input.ambiguities.map(candidate => ({ ambiguity_id: candidate.ambiguity_id, decision })));
const headings = ['FIRST VALID PAGE', 'NATIVE TEXT ON DAMAGED', 'IMAGE PAGE', 'LAST VALID PAGE RETAINED'];
const pdfText = '## Seite 1\n\nFIRST VALID PAGE - Anna Berger - Elbwiese Beratung GmbH\n\n' +
  'Synthetisches Dokument  \nAnna Berger  \n\nElbwiese Beratung GmbH  \n' +
  '`[EMAIL_REDACTED]`  \n`[PHONE_REDACTED]`  \nDE10370400440532013001  \nBeispielweg 3, 10115 Berlin  \n\n\n' +
  '## Seite 2\n\nNATIVE TEXT ON DAMAGED IMAGE PAGE - Kontakt anna@example.invalid\n\n' +
  '## Seite 3\n\nLAST VALID PAGE RETAINED';
function proof(final, source, profile, selectedOptions) {
  return verifyAnonymizedPublication({ markdown: final.markdown, profile, content_options: selectedOptions,
    // This test starts at the text/privacy boundary. It makes no new PDF
    // rendering or source-completeness claim.
    source_extraction: createSourceExtraction({ source_type: 'pdf', markdown: source,
      coverage: { status: 'incomplete', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] },
      content_options: selectedOptions }, 8_000_000),
    dictionary: final.dictionary, strong_person_anchor: final.strong_person_anchor,
    reviewed_person_candidates: final.reviewed_person_candidates });
}

async function main() {
  await testAsync('actual engine, review and frame produce one exact replayable trace for both policies', async () => {
    for (const consumerOptions of [{}, { productChannel: 'standalone', contentOptions }]) {
      const value = prepare('Name: Anna Beispiel\nE-Mail: anna@example.invalid\nBetrag: 42 EUR', { consumerOptions });
      const text = await resolveTextPrivacyReview(value, review('keep'));
      const final = finalizeTextPrivacyReview(value, text, { prefix: '> Lokaler Hinweis\n\n', suffix: '' });
      assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
      assert.doesNotMatch(final.markdown, /Anna Beispiel|anna@example\.invalid/u);
      assert.match(final.markdown, /42 EUR/u);
      assert.equal(final.verification_context.publication_frame.prefix, '> Lokaler Hinweis\n\n');
      assert.equal(Object.hasOwn(final.verification_context, 'person_field_policy'), Object.hasOwn(consumerOptions, 'contentOptions'));
    }
  });
  await testAsync('one occurrence can be typed as person or company using the same actual draft and registry', async () => {
    for (const [decision, marker] of [['redact', /\[PERSON_\d+\]/u], ['redact_organization', /\[(?:UNTERNEHMEN|ORGANISATION)_\d+\]/u]]) {
      const value = prepare('CAPGEMINI INVENT\nTechnischer Sachinhalt.');
      assert.ok(value.draft.ambiguities.some(candidate => candidate.replacement_kind === 'PERSON'));
      const text = await resolveTextPrivacyReview(value, review(decision));
      const final = finalizeTextPrivacyReview(value, text, { prefix: '', suffix: '' });
      assert.match(final.markdown, marker); assert.doesNotMatch(final.markdown, /CAPGEMINI INVENT/u);
      assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
    }
  });
  await testAsync('keep confirmation cannot exempt newly inserted contact data or a different draft', async () => {
    const value = prepare('Service Level bleibt ein technischer Begriff.');
    const text = await resolveTextPrivacyReview(value, review('keep'));
    assert.throws(() => finalizeTextPrivacyReview(value, text + '\nE-Mail: unsafe@example.invalid', { prefix: '', suffix: '' }));
    assert.throws(() => finalizeTextPrivacyReview({ ...value }, text, { prefix: '', suffix: '' }));
  });
  await testAsync('a kept PDF presentation fragment does not become an automatic global surname alias', async () => {
    const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 47), { contractVersion: READABLE_CONTRACT_VERSION });
    const source = '## Seite 1\n\nFIRST VALID PAGE - Anna Berger - Elbwiese Beratung GmbH\n\n' +
      '## Seite 2\n\nNATIVE TEXT ON DAMAGED IMAGE PAGE - Kontakt anna@example.invalid\n\n' +
      '## Seite 3\n\nLAST VALID PAGE RETAINED';
    try {
      registry.assign('PERSON', 'Anna Berger'); registry.assign('ORG', 'Elbwiese Beratung GmbH');
      const value = prepare(source, { registry, ocrLineReview: true });
      const text = await resolveTextPrivacyReview(value, review('keep'));
      const final = finalizeTextPrivacyReview(value, text, { prefix: '', suffix: '' });
      assert.match(final.markdown, /FIRST VALID PAGE/u);
      assert.match(final.markdown, /NATIVE TEXT ON DAMAGED IMAGE PAGE/u);
      assert.match(final.markdown, /LAST VALID PAGE RETAINED/u);
      assert.doesNotMatch(final.markdown, /Anna Berger|Elbwiese|anna@example/iu);
      assert.equal(registry.lookup('PERSON', 'Image Page'), null);
      assert.equal(registry.lookup('PERSON', 'Page'), null);
      assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
    } finally { registry.dispose(); }
  });
  await testAsync('exact partial-PDF text keeps the complete uncertain source runs through both profiles and output modes', async () => {
    for (const profile of ['general', 'personnel_profile']) for (const markdownOutput of ['content-v1', 'notes-v1']) {
      const selectedOptions = { ...contentOptions, markdownOutput, imageOcr: true };
      const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 47), { contractVersion: READABLE_CONTRACT_VERSION });
      try {
        registry.assign('PERSON', 'Anna Berger'); registry.assign('ORG', 'Elbwiese Beratung GmbH');
        const value = prepare(pdfText, { registry, profile, ocrLineReview: true,
          consumerOptions: { productChannel: 'standalone', contentOptions: selectedOptions } });
        assert.deepEqual(value.ambiguities.map(row => value.draft.original_text.slice(row.original_start, row.original_end)).sort(),
          ['FIRST VALID PAGE', 'NATIVE TEXT ON DAMAGED IMAGE PAGE', 'LAST VALID PAGE RETAINED'].sort(),
          'the contact window owns its complete contiguous source run, not a newly exposed residual prefix');
        const text = await resolveTextPrivacyReview(value, review('keep'));
        const final = finalizeTextPrivacyReview(value, text, { prefix: '> Hinweis\n\n', suffix: '' });
        for (const heading of headings) assert.ok(final.markdown.includes(heading));
        assert.doesNotMatch(final.markdown, /Anna Berger|Elbwiese|anna@example|DE10370400440532013001|10115 Berlin/iu);
        assert.equal(registry.lookup('PERSON', 'Image Page'), null);
        assert.equal(registry.lookup('PERSON', 'Page'), null);
        assert.ok(!final.dictionary.some(row => /^(?:page|image page)$/iu.test(row.value)));
        assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
        assert.ok(proof(final, pdfText, profile, selectedOptions));
        assert.ok(pii.scanResidual(final.markdown, profile, final.dictionary, {
          productChannel: 'standalone', contentOptions: selectedOptions, strongPersonAnchor: final.strong_person_anchor,
          originalSourceText: pdfText }).length > 0, 'same text without actual Keep capability stays unapproved');
      } finally { registry.dispose(); }
    }
  });
  await testAsync('automatic conservative review still masks each uncertain fragment without learning a derived surname', async () => {
    for (const profile of ['general', 'personnel_profile']) {
      const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 48), { contractVersion: READABLE_CONTRACT_VERSION });
      try {
        const value = prepare(pdfText, { registry, profile, ocrLineReview: true });
        const text = await resolveTextPrivacyReview(value, null, { reviewPolicy: 'automatic-conservative' });
        const final = finalizeTextPrivacyReview(value, text, { prefix: '', suffix: '' });
        for (const heading of headings) assert.ok(!final.markdown.includes(heading));
        assert.equal(registry.lookup('PERSON', 'Page'), null);
        assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
        assert.ok(proof(final, pdfText, profile, contentOptions));
      } finally { registry.dispose(); }
    }
  });
  await testAsync('a German ordinary-word caption does not poison another document, while an actual surname still binds', async () => {
    const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 49), { contractVersion: READABLE_CONTRACT_VERSION });
    const source = 'STABILER SOMMER - Kontakt status@example.invalid\nName: Anna Berger';
    try {
      const value = prepare(source, { registry });
      const text = await resolveTextPrivacyReview(value, review('keep'));
      const final = finalizeTextPrivacyReview(value, text, { prefix: '', suffix: '' });
      assert.ok(final.markdown.includes('STABILER SOMMER')); assert.ok(proof(final, source, 'general', contentOptions));
      assert.equal(registry.lookup('PERSON', 'Sommer'), null);
      const restored = createBatchPseudonymRegistry(Buffer.alloc(32, 49), {
        contractVersion: READABLE_CONTRACT_VERSION, persistedState: JSON.parse(JSON.stringify(registry.exportState())) });
      try {
        const technical = 'Im Sommer bleibt die FHIR-Schnittstelle stabil.';
        const next = prepare(technical, { registry: restored });
        const nextText = await resolveTextPrivacyReview(next, review('keep'));
        assert.equal(finalizeTextPrivacyReview(next, nextText, { prefix: '', suffix: '' }).markdown, technical);
        const personSource = 'Name: Anna Sommer\nFrau Sommer antwortet.\nFHIR bleibt erhalten.';
        const person = prepare(personSource, { registry: restored });
        const personText = await resolveTextPrivacyReview(person, review('keep'));
        const published = finalizeTextPrivacyReview(person, personText, { prefix: '', suffix: '' });
        assert.doesNotMatch(published.markdown, /Anna|Sommer/u); assert.match(published.markdown, /FHIR/u);
        assert.ok(restored.lookup('PERSON', 'Sommer')); assert.ok(proof(published, personSource, 'general', contentOptions));
      } finally { restored.dispose(); }
    } finally { registry.dispose(); }
  });
  await testAsync('restart-stable spelling choices still require a newly bound occurrence and publication capability', async () => {
    const { createBatchPseudonymState } = require('../plugins/data-secure/server/batch-pseudonym-context');
    const { prepareStandaloneReviewChoices, mergeStandaloneReviewChoices, rememberStandaloneReviewChoices } =
      require('../plugins/data-secure/server/gateway/standalone-review-choices');
    const batch = { token: 'c'.repeat(64), product_channel: 'standalone',
      ...createBatchPseudonymState({ productChannel: 'standalone', randomBytes: () => Buffer.alloc(32, 50) }) };
    const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 50), { contractVersion: READABLE_CONTRACT_VERSION });
    try {
      const value = prepare(pdfText, { registry, ocrLineReview: true });
      const decisions = value.ambiguities.map(row => ({ ambiguity_id: row.ambiguity_id, decision: 'keep' }));
      rememberStandaloneReviewChoices(batch, [value.draft], [{ document_index: 1, decisions }]);
      const body = await resolveTextPrivacyReview(value, input => reviewedBatchText(input, decisions));
      finalizeTextPrivacyReview(value, body, { prefix: '', suffix: '' });
      batch.pseudonym_registry_state = registry.exportState();
      const restarted = JSON.parse(JSON.stringify(batch));
      const restored = createBatchPseudonymRegistry(Buffer.alloc(32, 50), { contractVersion: READABLE_CONTRACT_VERSION,
        persistedState: restarted.pseudonym_registry_state });
      try {
        const nextSource = '## Neuer Abschnitt\n\n' + pdfText;
        const next = prepare(nextSource, { registry: restored, ocrLineReview: true });
        const plan = prepareStandaloneReviewChoices(restarted, [next.draft]);
        assert.equal(plan.openDrafts.length, 0, 'only authenticated exact spellings replay');
        const replay = mergeStandaloneReviewChoices(plan, { action: 'reviewed', documents: [] });
        const nextBody = await resolveTextPrivacyReview(next, input => reviewedBatchText(input, replay.documents[0].decisions));
        const final = finalizeTextPrivacyReview(next, nextBody, { prefix: '', suffix: '' });
        assert.ok(proof(final, nextSource, 'general', contentOptions));
        assert.equal(restored.lookup('PERSON', 'Page'), null);
        const changed = prepare('FIRST VALID PAGES - Kontakt status@example.invalid\nName: Anna Berger', { registry: restored });
        assert.ok(prepareStandaloneReviewChoices(restarted, [changed.draft]).openDrafts.length > 0,
          'neither substring, surname nor changed spelling inherits a saved Keep');
      } finally { restored.dispose(); }
    } finally { registry.dispose(); }
  });
  await testAsync('strong fields, direct identifiers and previously learned real aliases cannot be waived by a caption Keep', async () => {
    for (const profile of ['general', 'personnel_profile']) {
      const source = 'IMAGE SKETCH - Kontakt status@example.invalid\nName: ERIKA PAGE\nFrau Page\n' +
        '| Name | Fachtext |\n| --- | --- |\n| Qvx / Qvy | FHIR |\n\n' +
        'Passwort: raw-private-secret\nE-Mail: secret@example.invalid\nTelefon: +49 30 5551000';
      const value = prepare(source, { profile });
      const text = await resolveTextPrivacyReview(value, review('keep'));
      const final = finalizeTextPrivacyReview(value, text, { prefix: '', suffix: '' });
      assert.doesNotMatch(final.markdown, /ERIKA|Frau Page|Qvx|Qvy|raw-private-secret|secret@example|5551000/u);
      assert.ok(proof(final, source, profile, contentOptions));
      assert.ok(pii.scanResidual('FIRST VALID PAGE', profile, [{ type: 'PERSON_ALIAS', value: 'page' }], {
        productChannel: 'standalone', contentOptions }).some(row => row.type === 'RESIDUAL_ENTITY'));
    }
    for (const actualPerson of ['Name: Erika Page', 'Herr Erik Page', 'Zertifikat für Erika Page']) {
      const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 52), { contractVersion: READABLE_CONTRACT_VERSION });
      try {
        const value = prepare(`FIRST VALID PAGE\n${actualPerson}`, { registry });
        const text = await resolveTextPrivacyReview(value, review('keep'));
        assert.ok(registry.lookup('PERSON', 'Page'), 'genuine label/honorific/holder retains its surname binding');
        assert.throws(() => finalizeTextPrivacyReview(value, text, { prefix: '', suffix: '' }), { code: 'RESIDUAL_PII' },
          'an unrelated caption choice is not authority to retain a known real surname');
      } finally { registry.dispose(); }
    }
    // Old batches may already contain the false identity. A narrow discovery
    // fix is not permission to delete or reinterpret their existing bindings.
    const old = createBatchPseudonymRegistry(Buffer.alloc(32, 51), { contractVersion: READABLE_CONTRACT_VERSION });
    try {
      const marker = old.assign('PERSON', 'Image Page'); old.remember('PERSON', 'Page', marker);
      const value = prepare(pdfText, { registry: old });
      const text = await resolveTextPrivacyReview(value, review('keep'));
      assert.throws(() => finalizeTextPrivacyReview(value, text, { prefix: '', suffix: '' }), { code: 'RESIDUAL_PII' });
    } finally { old.dispose(); }
  });
  await testAsync('expanded captions cannot reserve an already bound internal identity across Office Unicode whitespace', async () => {
    for (const profile of ['general', 'personnel_profile']) for (const separator of [' ', '\t', '\u00a0', '\u202f', '\u2007'])
      for (const identity of ['Erika Müller', 'İpek Müller', 'J\u030can Müller']) {
      const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 53), { contractVersion: READABLE_CONTRACT_VERSION });
      try {
        const known = registry.assign('PERSON', identity);
        if (identity.startsWith('J\u030c')) assert.notEqual(canonicalValue(identity), canonicalValue(canonicalValue(identity)),
          'the regression exercises the actual non-idempotent NFC-before-lowercase sequence');
        const spelling = identity.toLocaleUpperCase('de-DE').replace(' ', separator);
        const source = `NATIVE TEXT ${spelling} - Kontakt status@example.invalid\nName: Anna Berger`;
        const value = prepare(source, { registry, profile });
        assert.ok(!value.ambiguities.some(row => /ERIKA|İPEK|J\u030cAN/u.test(value.draft.original_text.slice(row.original_start, row.original_end))),
          'the independently bound multi-word identity is never offered inside a larger weak Keep');
        const text = await resolveTextPrivacyReview(value, review('keep'));
        const final = finalizeTextPrivacyReview(value, text, { prefix: '', suffix: '' });
        assert.doesNotMatch(final.markdown, /Erika|İpek|J\u030can|ǰan|Müller|status@example/iu);
        assert.ok(final.markdown.includes(known)); assert.ok(proof(final, source, profile, contentOptions));
        assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
      } finally { registry.dispose(); }
    }
  });
  await testAsync('a new unreviewed publication heading stays blocked and Cowork does not invoke the new containment scan', async () => {
    const source = 'FIRST VALID PAGE - Kontakt status@example.invalid\nName: Anna Berger';
    const value = prepare(source, { profile: 'personnel_profile' });
    const text = await resolveTextPrivacyReview(value, review('keep'));
    assert.throws(() => finalizeTextPrivacyReview(value, text, { prefix: '> Lokaler Hinweis\n\n', suffix: '' }),
      { code: 'RESIDUAL_PII' }, 'a new two-word frame is not covered by a source-text Keep');
    const registry = makeRegistry();
    registry.matchKnownAliases = () => { throw new Error('NEW_STANDALONE_SCAN_MUST_NOT_RUN_FOR_COWORK'); };
    const reserved = require('../plugins/data-secure/server/gateway/privacy-text-operation').reservePersonReviewCandidates(
      'Anna Berger berichtet heute.', registry, false);
    assert.equal(reserved.mask_edits.length, 1);
    assert.equal(reserved.mask_edits[0].original, 'Anna Berger');
  });
  await done();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
