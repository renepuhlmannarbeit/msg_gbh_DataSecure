'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const { createSuite } = require('./helpers');
// Real gateway publication must use a plain private directory. macOS's
// OS-owned temp alias is canonicalized by the fixture, not waived by storage.
const temporaryRoot = fs.realpathSync.native(os.tmpdir());
const scope = fs.mkdtempSync(path.join(temporaryRoot, 'datasecure-residual-review-'));
process.env.EU_PRIVACY_ROOT = path.join(scope, 'private');
process.env.EU_PRIVACY_DATA_ROOT = path.join(scope, 'data');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(scope, 'results');
fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT);
const pii = require('../plugins/data-secure/server/pii-engine');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const { residualPersonAmbiguities, createPersonReviewBinding } = require('../plugins/data-secure/server/privacy/residual-person-review');
const { reviewedBatchText, reviewSingleBatchTextLocally } = require('../plugins/data-secure/server/gateway/batch-review-policy');
const review = require('../plugins/data-secure/server/companion/text-review');
const { anonymizeSelectedSource } = require('../plugins/data-secure/server/gateway/orchestrator');
const gateway = require('../plugins/data-secure/server/gateway');
const { test, testAsync, done, assert } = createSuite('Occurrence-bound residual person review');
const profile = 'personnel_profile';
const original = 'Name: Max Mustermann\nMax Mustermann – KEINE REALDATEN';
const options = { strongPersonAnchor: true, includePersonCandidateSpans: true };

test('closed marker syntax is Engine-compatible but does not prove imported source-token origin', () => {
  const { placeholderSpans, maskPlaceholders } = require('../plugins/data-secure/server/privacy/spans');
  for (const source of ['[BEISPIEL]', '[NAME]', '[ABC_123]', '[PERSON_01]', '[EMAIL_OTHER]']) {
    assert.deepEqual(placeholderSpans(source), []);
    assert.equal(maskPlaceholders(source), source);
  }
  for (const marker of ['[PERSON_001]', '[UNTERNEHMEN_003]', '[ORGANISATION_UNKLAR]',
    '[PERSON_UNKLAR_013]', '[PERSON_ABCDEFGHIJ234567]', '[ARBEITGEBER_001]',
    '[EMAIL_REDACTED]', '[CREDENTIAL_REDACTED]', '[MANUAL_REDACTION]', '[PERSON_REVIEW_000001]']) {
    assert.equal(placeholderSpans(marker).length, 1, marker);
    assert.equal(maskPlaceholders(marker), ' '.repeat(marker.length));
    assert.equal(pii.anonymize(marker).text, marker,
      'raw Engine compatibility is byte-idempotent; actual publication separately checks imported token origin');
  }
});

test('raw Engine/gate treat foreign brackets as source and still detect neighbouring identifiers', () => {
  const source = 'Name: Anna Beispiel\nAnmerkung: [BEISPIEL]\n[PERSON_001] anna@example.org\n[ABC_123]';
  const result = anonymizeMarkdown(source, 'general');
  assert.doesNotMatch(result.text, /beispiel|anna@example/iu);
  assert.ok(result.text.includes('[PERSON_001]'), 'existing markers do not absorb adjacent new identifiers');
  assert.ok(result.text.includes('[ABC_123]'), 'ordinary inert bracketed text is not erased wholesale');
  assert.deepEqual(pii.scanResidual(result.text, 'general', result.dictionary), []);
  assert.ok(pii.scanResidual('Name: [PERSON_001]\nAnmerkung: [BEISPIEL]', 'general', result.dictionary)
    .some(finding => finding.type === 'RESIDUAL_ENTITY'), 'a forged raw bracket cannot hide a known original');
  assert.equal(anonymizeMarkdown(result.text, 'general').text, result.text);
});

test('credential cells redact mixed/foreign marker values as a whole without learning their secrets', () => {
  for (const value of ['[BEISPIEL]', '[NAME]', '[ABC_123]', '[PERSON_001]',
    '[EMAIL_REDACTED] raw-secret', '[CREDENTIAL_REDACTED] raw-secret', 'raw-secret [MANUAL_REDACTION]']) {
    const source = `| Dienst | Passwort |\n| --- | --- |\n| Portal | ${value} |`;
    const result = anonymizeMarkdown(source, 'general');
    assert.equal(result.text, '| Dienst | Passwort |\n| --- | --- |\n| Portal | [CREDENTIAL_REDACTED] |', value);
    assert.deepEqual(result.dictionary, [], 'credential values are not retained as entity aliases');
    assert.deepEqual(pii.scanResidual(result.text), []);
    assert.equal(anonymizeMarkdown(result.text, 'general').text, result.text);
    const field = anonymizeMarkdown(`Passwort: ${value}`, 'general');
    assert.equal(field.text, 'Passwort: [CREDENTIAL_REDACTED]', 'the same marker cannot shield part of a labelled field');
    assert.deepEqual(field.dictionary, []);
    assert.equal(anonymizeMarkdown(field.text, 'general').text, field.text);
  }
});

test('one-column GFM credential tables remove plain/mixed secrets but generic one-column content remains intact', () => {
  for (const value of ['raw-secret', '[BEISPIEL]', '[NAME]', '[ABC_123]', '[EMAIL_REDACTED] raw-secret']) {
    const source = `| Passwort |\n| --- |\n| ${value} |`;
    const result = anonymizeMarkdown(source, 'general');
    assert.equal(result.text, '| Passwort |\n| --- |\n| [CREDENTIAL_REDACTED] |');
    assert.deepEqual(result.dictionary, []);
    assert.equal(anonymizeMarkdown(result.text, 'general').text, result.text);
    assert.ok(pii.scanResidual(source).some(finding => finding.type === 'CREDENTIAL'));
  }
  for (const source of ['| Technik |\n| --- |\n| Kubernetes |', '| Thema |\n| --- |\n| Service Level |',
    'Passwort\n---\nDies ist eine allgemeine Erklärung.']) {
    assert.equal(anonymizeMarkdown(source, 'general').text, source);
  }
});

test('raw Engine registry compatibility never attests imported variable-token origin or hides neighbouring identifiers', () => {
  const { createBatchPseudonymRegistry, CONTRACT_VERSION, READABLE_CONTRACT_VERSION } =
    require('../plugins/data-secure/server/batch-pseudonym-registry');
  for (const contractVersion of [CONTRACT_VERSION, READABLE_CONTRACT_VERSION]) {
    const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 31), { contractVersion });
    try {
      const marker = registry.assign('PERSON', 'Erika Beispiel');
      const source = `${marker}\nName: Anna Linden\nAnmerkung: [LINDEN]\n${marker} anna@example.org`;
      const result = anonymizeMarkdown(source, 'general', { registry });
      assert.doesNotMatch(result.text, /linden|anna@example/iu);
      assert.ok(result.text.startsWith(marker + '\n'));
      assert.equal(anonymizeMarkdown(result.text, 'general', { registry }).text, result.text);
      const imported = pii.scanResidual(result.text, 'general', result.dictionary, {
        originalSourceText: source, includePersonCandidateSpans: true
      });
      assert.equal(imported.length, 2,
        'raw syntax idempotence does not silently authorize variable-payload imported labels for publication');
      const candidates = residualPersonAmbiguities(source, result.text, imported);
      const binding = createPersonReviewBinding(result.text, candidates);
      const input = { original_text: source, anonymized_text: result.text, profile: 'general', ambiguities: candidates,
        confirmPersonReview: binding.confirm };
      const kept = reviewedBatchText(input, decisions(input));
      assert.equal(kept.text, result.text, 'HMAC and readable registry IDs both require explicit byte-preserving Keep');
      assert.deepEqual(pii.scanResidual(kept.text, 'general', result.dictionary, {
        originalSourceText: source, reviewedPersonCandidates: binding.forPublication('', kept.text, '')
      }), []);
      const credential = `| Dienst | Passwort |\n| --- | --- |\n| Portal | ${marker} raw-secret |`;
      const redacted = anonymizeMarkdown(credential, 'general', { registry });
      assert.doesNotMatch(redacted.text, /raw-secret/u);
      assert.ok(redacted.text.includes('[CREDENTIAL_REDACTED]'));
    } finally { registry.dispose(); }
  }
});

test('imported variable-token lookalikes require exact source/output Keep provenance, not a marker regex attestation', () => {
  const source = 'Name: Denise Koch\nImportiert: [PERSON_DENISEKOCH]\nAuch: [PERSON_DENISEKOCH]';
  const anon = anonymizeMarkdown(source, 'general', { deferPersonReview: true });
  const sourceOptions = { originalSourceText: source, includePersonCandidateSpans: true };
  const findings = pii.scanResidual(anon.text, 'general', anon.dictionary, sourceOptions);
  assert.equal(findings.length, 2);
  assert.ok(findings.every(finding => finding.text === '[PERSON_DENISEKOCH]'));
  const candidates = residualPersonAmbiguities(source, anon.text, findings);
  assert.deepEqual(candidates.map(candidate => source.slice(candidate.original_start, candidate.original_end)),
    ['[PERSON_DENISEKOCH]', '[PERSON_DENISEKOCH]']);
  const binding = createPersonReviewBinding(anon.text, candidates);
  const input = { original_text: source, anonymized_text: anon.text, profile: 'general', ambiguities: candidates,
    confirmPersonReview: binding.confirm, replacementForAmbiguity: () => '[PERSON_009]' };
  const kept = reviewedBatchText(input, decisions(input));
  assert.equal(kept.text, anon.text);
  const prefix = '<!-- Generated header -->\n\n';
  const proof = binding.forPublication(prefix, kept.text, '');
  assert.deepEqual(pii.scanResidual(prefix + kept.text, 'general', anon.dictionary,
    { originalSourceText: source, reviewedPersonCandidates: proof }), []);
  assert.equal(pii.scanResidual(prefix + 'x' + kept.text, 'general', anon.dictionary,
    { originalSourceText: source, reviewedPersonCandidates: proof }).length, 2,
    'even identical imported tokens lose their approval when canonical published bytes change');
  const noSourceCollision = 'Name: Denise Koch';
  const generated = anonymizeMarkdown(noSourceCollision, 'general');
  assert.deepEqual(pii.scanResidual(generated.text, 'general', generated.dictionary,
    { originalSourceText: noSourceCollision }), [], 'a newly created token is not an imported source value');
  for (const marker of ['[EMAIL_REDACTED]', '[MANUAL_REDACTION]', '[ARBEITGEBER_001]', '[ORGANISATION_UNKLAR]']) {
    assert.deepEqual(pii.scanResidual(marker, 'general', [], { originalSourceText: marker }), [],
      'fixed redaction vocabulary has no variable original-value payload');
  }
  for (const marker of ['[PERSON_011]', '[UNTERNEHMEN_4711]', '[ORGANISATION_99999]', '[PERSON_REVIEW_471123]']) {
    const findings = pii.scanResidual(marker, 'general', [], { originalSourceText: marker, includePersonCandidateSpans: true });
    assert.equal(findings.length, 1, 'a numeric suffix can be a real original identifier, not proof of a generated ordinal');
    assert.equal(findings[0].text, marker);
    const candidates = residualPersonAmbiguities(marker, marker, findings);
    const binding = createPersonReviewBinding(marker, candidates);
    const input = { original_text: marker, anonymized_text: marker, profile: 'general', ambiguities: candidates,
      confirmPersonReview: binding.confirm };
    const kept = reviewedBatchText(input, decisions(input));
    assert.equal(kept.text, marker);
    assert.deepEqual(pii.scanResidual(marker, 'general', [], { originalSourceText: marker,
      reviewedPersonCandidates: binding.forPublication('', marker, '') }), []);
  }
  // A source/output token collision cannot waive any generated occurrence by
  // lookup alone: ambiguous/missing source fragments fail exact binding.
  const collisionSource = '[PERSON_DENISEKOCH] then real name';
  const collisionOutput = 'then [PERSON_DENISEKOCH]';
  assert.throws(() => residualPersonAmbiguities(collisionSource, collisionOutput,
    pii.scanResidual(collisionOutput, 'general', [], {
      originalSourceText: collisionSource, includePersonCandidateSpans: true
    })), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
});

test('numeric imported tokens bind every original occurrence and cannot borrow another publication approval', () => {
  const source = 'Personalnummer: [PERSON_4711]\nName: Anna Linden\nReferenz: [PERSON_REVIEW_471123] anna@example.org';
  const anon = anonymizeMarkdown(source, 'general', { deferPersonReview: true });
  assert.doesNotMatch(anon.text, /Anna Linden|anna@example/iu);
  const scanOptions = { originalSourceText: source, includePersonCandidateSpans: true };
  const findings = pii.scanResidual(anon.text, 'general', anon.dictionary, scanOptions);
  assert.deepEqual(findings.map(item => item.text), ['[PERSON_4711]', '[PERSON_REVIEW_471123]']);
  const candidates = residualPersonAmbiguities(source, anon.text, findings);
  for (const item of candidates) assert.equal(source.slice(item.original_start, item.original_end),
    anon.text.slice(item.anonymized_start, item.anonymized_end), 'each choice has exact original/output coordinates');
  for (const choice of ['keep', 'redact', 'redact_organization']) {
    const binding = createPersonReviewBinding(anon.text, candidates, { allowOrganizationReview: true });
    const input = { original_text: source, anonymized_text: anon.text, profile: 'general', ambiguities: candidates,
      allowOrganizationReview: true, confirmPersonReview: binding.confirm,
      replacementForAmbiguity: () => choice === 'redact_organization' ? '[UNTERNEHMEN_009]' : '[PERSON_009]' };
    const reviewed = reviewedBatchText(input, decisions(input, choice));
    if (choice === 'keep') assert.equal(reviewed.text, anon.text);
    else assert.doesNotMatch(reviewed.text, /4711|471123/u);
    const prefix = '<!-- Header -->\n';
    const proof = binding.forPublication(prefix, reviewed.text, '');
    assert.deepEqual(pii.scanResidual(prefix + reviewed.text, 'general', anon.dictionary,
      { originalSourceText: source, reviewedPersonCandidates: proof }), []);
    if (choice === 'keep') {
      assert.equal(pii.scanResidual(prefix + reviewed.text, 'general', anon.dictionary,
        { originalSourceText: source, reviewedPersonCandidates: {} }).length, 2,
      'a public-shaped proof object grants no original-token approval');
      assert.equal(pii.scanResidual(prefix + reviewed.text + '\n[PERSON_4711]', 'general', anon.dictionary,
        { originalSourceText: source, reviewedPersonCandidates: proof }).length, 3,
      'duplicated original numeric tokens invalidate the old exact-body proof');
      const addedPrefix = '[PERSON_4711]\n';
      assert.equal(pii.scanResidual(addedPrefix + reviewed.text, 'general', anon.dictionary,
        { originalSourceText: source, reviewedPersonCandidates: binding.forPublication(addedPrefix, reviewed.text, '') }).length, 1,
      'a Keep for body occurrences cannot approve a new prefix occurrence');
    }
  }
  const deletedCopy = '[PERSON_4711]\n[PERSON_4711]';
  assert.throws(() => residualPersonAmbiguities(deletedCopy, '[PERSON_4711]',
    pii.scanResidual('[PERSON_4711]', 'general', [], { originalSourceText: deletedCopy, includePersonCandidateSpans: true })),
  error => error.code === 'AMBIGUITY_REVIEW_REQUIRED', 'a missing copy cannot borrow the first original occurrence');
});

test('Standalone residual count is call-scoped at 5,000, while default/Cowork stays at 1,000', () => {
  const value = 'SYNTHETISCHER HÄRTETEST';
  for (const count of [1000, 1001, 5000, 5001]) {
    const text = Array(count).fill(value).join('\n');
    const findings = Array.from({ length: count }, (_, index) => ({ type: 'PERSON_CANDIDATE', text: value,
      start: index * (value.length + 1), end: index * (value.length + 1) + value.length }));
    if (count <= 5000) {
      const candidates = residualPersonAmbiguities(text, text, findings, { productChannel: 'standalone' });
      assert.equal(candidates.length, count);
      createPersonReviewBinding(text, candidates, { productChannel: 'standalone' });
      if (count > 1000) assert.throws(() => createPersonReviewBinding(text, candidates),
        error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
    } else {
      assert.throws(() => residualPersonAmbiguities(text, text, findings, { productChannel: 'standalone' }),
        error => error.code === 'LOCAL_REVIEW_TOO_LARGE');
      const candidates = findings.map((finding, index) => ({ ambiguity_id: `person-residual:v1:${String(index + 1).padStart(6, '0')}`,
        type: 'person_residual_ambiguous', replacement_kind: 'PERSON', anonymized_start: finding.start,
        anonymized_end: finding.end }));
      assert.throws(() => createPersonReviewBinding(text, candidates, { productChannel: 'standalone' }),
        error => error.code === 'LOCAL_REVIEW_TOO_LARGE');
    }
    if (count <= 1000) assert.equal(residualPersonAmbiguities(text, text, findings).length, count);
    else assert.throws(() => residualPersonAmbiguities(text, text, findings),
      error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
  }
});

function prepared(source = original) {
  const anon = anonymizeMarkdown(source, profile, { deferPersonReview: true });
  const ambiguities = residualPersonAmbiguities(source, anon.text, anon.residualPersonCandidates);
  const binding = createPersonReviewBinding(anon.text, ambiguities);
  return { anon, binding, input: {
    original_text: source, anonymized_text: anon.text, profile, ambiguities,
    confirmPersonReview: binding.confirm,
    replacementForAmbiguity: () => '[PERSON_007]'
  } };
}
function decisions(input, value = 'keep') {
  return input.ambiguities.map(item => ({ ambiguity_id: item.ambiguity_id, decision: value }));
}
function verifiedScan(text, binding, dictionary = [], prefix = '', suffix = '') {
  return pii.scanResidual(prefix + text + suffix, profile, dictionary, {
    strongPersonAnchor: true, reviewedPersonCandidates: binding.forPublication(prefix, text, suffix)
  });
}

test('masked pseudonyms cannot create unbindable cross-placeholder candidates or hide adjacent real names', () => {
  for (const marker of ['[PERSON_001]', '[UNTERNEHMEN_003]', '[EMAIL_REDACTED]']) {
    const output = `Alpha ${marker} Beta\nMarta Linden`;
    const findings = pii.scanResidual(output, 'customer', [], options);
    const start = output.indexOf('Marta Linden');
    assert.deepEqual(findings, [{ type: 'PERSON_CANDIDATE', text: 'Marta Linden', start, end: start + 12 }]);
    assert.ok(findings.every(item => output.slice(item.start, item.end) === item.text));
    const source = output.replace(marker, 'Max Mustermann');
    const candidates = residualPersonAmbiguities(source, output, findings);
    assert.equal(candidates.length, 1);
    assert.equal(source.slice(candidates[0].original_start, candidates[0].original_end), 'Marta Linden');
    assert.deepEqual(pii.scanResidual(`Alpha ${marker} Beta`, 'customer', [], options), []);
  }
});

test('competing uppercase titles use the existing local review before any identity is assigned', () => {
  for (const activeProfile of ['general', 'personnel_profile']) {
    const technology = 'FHIR – Kubernetes · ISO 27001\nName: Max Mustermann';
    assert.equal(anonymizeMarkdown(technology, activeProfile).text, 'FHIR – Kubernetes · ISO 27001\nName: [PERSON_001]',
      'a technical single-word acronym is not a new person hypothesis');
    for (const title of ['SYNTHETISCHER HÄRTETEST', 'DYNAMISCHER PRÜFLAUF', 'FIKTIVER LANGBERICHT']) {
      const source = `${title}\nName: Max Mustermann`;
      assert.throws(() => anonymizeMarkdown(source, activeProfile), error => error.code === 'RESIDUAL_PII');
      const anon = anonymizeMarkdown(source, activeProfile, { deferPersonReview: true });
      assert.equal(anon.text, `${title}\nName: [PERSON_001]`);
      assert.ok(!anon.dictionary.some(item => title.toLocaleLowerCase('de-DE').includes(item.value.toLocaleLowerCase('de-DE'))),
        'neither title nor its last word is learned as a person alias');
      const ambiguities = residualPersonAmbiguities(source, anon.text, anon.residualPersonCandidates);
      assert.equal(ambiguities.length, 1);
      assert.equal(ambiguities[0].type, 'person_residual_ambiguous');
      const binding = createPersonReviewBinding(anon.text, ambiguities);
      const input = { original_text: source, anonymized_text: anon.text, profile: activeProfile,
        ambiguities, confirmPersonReview: binding.confirm };
      const result = reviewedBatchText(input, decisions(input));
      assert.equal(result.text, anon.text);
      assert.deepEqual(pii.scanResidual(result.text, activeProfile, anon.dictionary, {
        strongPersonAnchor: true, reviewedPersonCandidates: binding.forPublication('', result.text, '')
      }), []);
    }
  }
});

test('Standalone company classification binds exact residual edits, while default Cowork rejects that choice', () => {
  const source = 'CAPGEMINI INVENT\nName: Max Mustermann';
  const anon = anonymizeMarkdown(source, 'general', { deferPersonReview: true });
  const ambiguities = residualPersonAmbiguities(source, anon.text, anon.residualPersonCandidates);
  const binding = createPersonReviewBinding(anon.text, ambiguities, { allowOrganizationReview: true });
  const input = { original_text: source, anonymized_text: anon.text, profile: 'general', ambiguities,
    allowOrganizationReview: true, confirmPersonReview: binding.confirm, replacementForAmbiguity: () => '[UNTERNEHMEN_003]' };
  const result = reviewedBatchText(input, decisions(input, 'redact_organization'));
  assert.equal(result.text, '[UNTERNEHMEN_003]\nName: [PERSON_001]');
  assert.deepEqual(pii.scanResidual(result.text, 'general', anon.dictionary, {
    strongPersonAnchor: true, reviewedPersonCandidates: binding.forPublication('', result.text, '')
  }), []);
  const candidate = ambiguities[0];
  const edits = [{ start: candidate.anonymized_start, end: candidate.anonymized_end, replacement: '[UNTERNEHMEN_003]' }];
  assert.throws(() => createPersonReviewBinding(anon.text, ambiguities).confirm(
    decisions(input, 'redact_organization'), edits, result.text), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
  assert.throws(() => createPersonReviewBinding(anon.text, ambiguities, { allowOrganizationReview: true }).confirm(
    decisions(input, 'redact'), edits, result.text), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
});

test('uppercase people remain protected and explicit fields never become optional review decisions', () => {
  for (const activeProfile of ['general', 'personnel_profile']) {
    for (const source of ['ERIKA BEISPIEL\nName: ERIKA BEISPIEL', 'Name: ERIKA BEISPIEL',
      'Herr ERIKA BEISPIEL', 'ERIKA BEISPIEL\nTelefon: +49 89 1234567']) {
      assert.ok(!anonymizeMarkdown(source, activeProfile).text.includes('ERIKA BEISPIEL'));
    }
    const source = 'ERIKA BEISPIEL\nName: Max Mustermann';
    assert.throws(() => anonymizeMarkdown(source, activeProfile), error => error.code === 'RESIDUAL_PII');
    const anon = anonymizeMarkdown(source, activeProfile, { deferPersonReview: true });
    const ambiguities = residualPersonAmbiguities(source, anon.text, anon.residualPersonCandidates);
    const binding = createPersonReviewBinding(anon.text, ambiguities);
    const input = { original_text: source, anonymized_text: anon.text, profile: activeProfile,
      ambiguities, confirmPersonReview: binding.confirm, replacementForAmbiguity: () => '[PERSON_002]' };
    const result = reviewedBatchText(input, decisions(input, 'redact'));
    assert.equal(result.text, '[PERSON_002]\nName: [PERSON_001]');
    assert.deepEqual(pii.scanResidual(result.text, activeProfile, anon.dictionary, {
      strongPersonAnchor: true, reviewedPersonCandidates: binding.forPublication('', result.text, '')
    }), []);
    for (const candidate of ['# MARIA NOVAK', '[MARIA NOVAK](https://example.org)', 'MARIA NOVAK – Sachstand']) {
      const markedSource = `${candidate}\nName: Thomas Winter`;
      assert.throws(() => anonymizeMarkdown(markedSource, activeProfile), error => error.code === 'RESIDUAL_PII');
      const marked = anonymizeMarkdown(markedSource, activeProfile, { deferPersonReview: true });
      assert.ok(marked.residualPersonCandidates.some(item => item.text === 'MARIA NOVAK'),
        'formatting must not drop a competing person hypothesis after the known name is replaced');
      assert.ok(residualPersonAmbiguities(markedSource, marked.text, marked.residualPersonCandidates).length > 0);
    }
  }
});

test('a retained title neither poisons subsequent batch aliases nor grants a later document approval', () => {
  const { createBatchPseudonymRegistry, SECRET_BYTES, CONTRACT_VERSION, READABLE_CONTRACT_VERSION } =
    require('../plugins/data-secure/server/batch-pseudonym-registry');
  for (const activeProfile of ['general', 'personnel_profile']) {
    for (const contractVersion of [CONTRACT_VERSION, READABLE_CONTRACT_VERSION]) {
      const registry = createBatchPseudonymRegistry(Buffer.alloc(SECRET_BYTES, 41), { contractVersion });
      try {
        const source = 'SYNTHETISCHER HÄRTETEST\nName: Max Mustermann';
        const anon = anonymizeMarkdown(source, activeProfile, { registry, deferPersonReview: true });
        const ambiguities = residualPersonAmbiguities(source, anon.text, anon.residualPersonCandidates);
        const binding = createPersonReviewBinding(anon.text, ambiguities);
        binding.confirm(ambiguities.map(item => ({ ambiguity_id: item.ambiguity_id, decision: 'keep' })), [], anon.text);
        assert.equal(registry.lookup('PERSON', 'SYNTHETISCHER HÄRTETEST'), null);
        assert.equal(registry.lookup('PERSON', 'Härtetest'), null);
        const followUp = 'Hinweis: Der Härtetest bleibt reproduzierbar.';
        assert.equal(anonymizeMarkdown(followUp, activeProfile, { registry }).text, followUp);
        // A later presentation may omit the person label. Its already known
        // full identity must still prevent the unrelated title becoming an
        // alias that silently consumes the first document's deferred review.
        for (const title of ['SYNTHETISCHER HÄRTETEST', '# SYNTHETISCHER HÄRTETEST',
          '[SYNTHETISCHER HÄRTETEST](https://example.org)']) {
          const later = anonymizeMarkdown(`${title}\nMax Mustermann`, activeProfile, { registry, deferPersonReview: true });
          assert.ok(later.residualPersonCandidates.some(item => item.text === 'SYNTHETISCHER HÄRTETEST'));
        }
        const dash = 'SYNTHETISCHER HÄRTETEST – KEINE REALDATEN\nName: Max Mustermann';
        const dashDraft = anonymizeMarkdown(dash, activeProfile, { registry, deferPersonReview: true });
        assert.ok(dashDraft.residualPersonCandidates.some(item => item.text === 'SYNTHETISCHER HÄRTETEST'));
        for (const kind of ['PERSON', 'ORG', 'CUSTOMER']) {
          assert.equal(registry.lookup(kind, 'SYNTHETISCHER HÄRTETEST'), null,
            'a pending title review cannot escape through the customer/project heuristic');
        }
        assert.equal(registry.lookup('PROJECT', 'KEINE REALDATEN'), null);
        assert.equal(registry.lookup('PERSON', 'SYNTHETISCHER HÄRTETEST'), null);
        assert.equal(registry.lookup('PERSON', 'Härtetest'), null);
        const reconstructed = anonymizeMarkdown(source, activeProfile, { registry, deferPersonReview: true });
        assert.deepEqual(reconstructed.residualPersonCandidates, anon.residualPersonCandidates,
          'deferred title remains bound to the same source occurrence after the later document');
        assert.throws(() => anonymizeMarkdown(source, activeProfile, { registry }), error => error.code === 'RESIDUAL_PII');
        const knownPerson = registry.lookup('PERSON', 'Max Mustermann');
        assert.ok(knownPerson);
        assert.equal(anonymizeMarkdown('MAX MUSTERMANN', activeProfile, { registry }).text, knownPerson);
      } finally { registry.dispose(); }
    }
  }
});

test('plain generated table cells are reviewed per occurrence, not as a global word exception', () => {
  const source = 'Name: Max Mustermann\n| Spalte 1 | Spalte 2 |\n| --- | --- |\n' +
    '| SYNTHETISCHER HÄRTETEST | Bericht 1 |\n| SYNTHETISCHER HÄRTETEST | Bericht 2 |';
  assert.throws(() => anonymizeMarkdown(source, profile), error => error.code === 'RESIDUAL_PII');
  const state = prepared(source);
  assert.equal(state.input.ambiguities.length, 2);
  const partial = createPersonReviewBinding(state.anon.text, state.input.ambiguities.slice(0, 1));
  partial.confirm(decisions({ ambiguities: state.input.ambiguities.slice(0, 1) }), [], state.anon.text);
  assert.ok(verifiedScan(state.anon.text, partial).some(item => item.type === 'PERSON_CANDIDATE'));
  state.binding.confirm(decisions(state.input), [], state.anon.text);
  assert.deepEqual(verifiedScan(state.anon.text, state.binding, state.anon.dictionary), []);
  const labelled = '| Name | Rolle |\n| --- | --- |\n| MARIA NOVAK | Product Owner |';
  const located = pii.scanResidual(labelled, profile, [], options);
  assert.ok(located.some(item => item.type === 'PERSON_CANDIDATE' && !Number.isSafeInteger(item.start)),
    'an explicit person column is not made optional by the generated-column rule');
  const escaped = '| Spalte 1 | Spalte 2 |\n| --- | --- |\n| MARIA NOVAK | x\\|y |';
  assert.ok(pii.scanResidual(escaped, profile, [], options).some(item =>
    item.type === 'PERSON_CANDIDATE' && !Number.isSafeInteger(item.start)),
  'an escaped cell keeps the strict gate until exact cell provenance exists');
  const generatedHeader = '| Spalte 1 | Spalte 2 |\n| --- | --- |\n';
  for (const row of ['| Formel: ROW\\(\\)\\+1 | Maria Novak |',
    '| Maria Novak | Formel: ROW\\(\\)\\+1 |']) {
    const text = generatedHeader + row;
    const start = text.indexOf('Maria Novak');
    const findings = pii.scanResidual(text, 'general', [], options);
    assert.deepEqual(findings, [{ type: 'PERSON_CANDIDATE', text: 'Maria Novak',
      start, end: start + 'Maria Novak'.length }],
    'escapes in another cell must not change the plain candidate cell or its exact offsets');
    const ambiguities = residualPersonAmbiguities(text, text, findings);
    const binding = createPersonReviewBinding(text, ambiguities);
    binding.confirm(decisions({ ambiguities }), [], text);
    assert.deepEqual(pii.scanResidual(text, 'general', [], { strongPersonAnchor: true,
      reviewedPersonCandidates: binding.forPublication('', text, '')
    }), []);
  }
  for (const row of ['| Maria Novak\\ | x |', '| Maria \\Novak | x |']) {
    assert.ok(pii.scanResidual(generatedHeader + row, 'general', [], options).some(item =>
      item.type === 'PERSON_CANDIDATE' && !Number.isSafeInteger(item.start)),
    'the candidate cell itself must remain unescaped before it can be reviewed');
  }
  for (const prefix of ['technischer text\r\n'.repeat(52),
    'technischer text\ntechnischer text\r\n'.repeat(52)]) {
    const text = prefix + 'Maria Novak\r\n| Spalte 1 | Spalte 2 |\r\n| --- | --- |\r\n| Maria Novak | x |';
    const earlier = text.indexOf('Maria Novak');
    const cellStart = text.lastIndexOf('Maria Novak');
    const findings = pii.scanResidual(text, 'general', [], options);
    assert.deepEqual(findings, [{ type: 'PERSON_CANDIDATE', text: 'Maria Novak',
      start: cellStart, end: cellStart + 'Maria Novak'.length }],
    'CRLF and mixed line endings must locate the cell, not an earlier identical phrase');
    const earlierCandidates = residualPersonAmbiguities(text, text, [{ type: 'PERSON_CANDIDATE',
      text: 'Maria Novak', start: earlier, end: earlier + 'Maria Novak'.length }]);
    const earlierBinding = createPersonReviewBinding(text, earlierCandidates);
    earlierBinding.confirm(decisions({ ambiguities: earlierCandidates }), [], text);
    assert.ok(pii.scanResidual(text, 'general', [], { strongPersonAnchor: true,
      reviewedPersonCandidates: earlierBinding.forPublication('', text, '')
    }).some(item => item.type === 'PERSON_CANDIDATE'),
    'approval for an earlier namesake cannot release the unreviewed table cell');
  }
});

test('plain technical cells in non-identity tables remain reviewable while person columns stay strict', () => {
  const source = 'Name: Murat Kaya\n| Pruefschritt | Soll | Status |\n| --- | --- | --- |\n' +
    '| T-03 | Service Level | fachlich geprueft |\n| T-04 | Fail Closed | fachlich geprueft |';
  const anon = anonymizeMarkdown(source, 'general', { deferPersonReview: true });
  assert.deepEqual(anon.residualPersonCandidates.map((item) => item.text), ['Service Level', 'Fail Closed']);
  assert.ok(anon.residualPersonCandidates.every((item) => Number.isSafeInteger(item.start) && Number.isSafeInteger(item.end)));
  assert.ok(!anon.text.includes('Murat Kaya'));
  const table = '| Name | Rolle |\n| --- | --- |\n| Maria Novak | Beratung |';
  assert.ok(pii.scanResidual(table, 'general', [], options).some((item) =>
    item.type === 'PERSON_CANDIDATE' && !Number.isSafeInteger(item.start)));
});

test('default privacy still stops; the internal draft reserves only a locatable residual hypothesis', () => {
  assert.throws(() => anonymizeMarkdown(original, profile), error => error.code === 'RESIDUAL_PII');
  const { anon, input } = prepared();
  assert.equal(input.ambiguities.length, 1);
  assert.equal(input.ambiguities[0].type, 'person_residual_ambiguous');
  assert.equal(input.original_text.slice(input.ambiguities[0].original_start, input.ambiguities[0].original_end), 'KEINE REALDATEN');
  assert.ok(anon.text.includes('KEINE REALDATEN'), 'no automatic rewriting of ambiguous technical wording');
  assert.ok(!JSON.stringify(input.ambiguities).includes('KEINE REALDATEN'), 'only local offsets, not candidate literals');
});

test('only an explicit, exactly bound keep decision passes the weak candidate gate', () => {
  const { input, anon, binding } = prepared();
  assert.throws(() => binding.forPublication('', anon.text, ''), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
  const result = reviewedBatchText(input, decisions(input));
  assert.equal(result.text, anon.text);
  assert.deepEqual(verifiedScan(result.text, binding, anon.dictionary), []);
  assert.ok(pii.scanResidual(result.text, profile, anon.dictionary).length, 'no global/persisted allowlist');
  assert.ok(pii.scanResidual(result.text, profile, anon.dictionary, {
    reviewedPersonCandidates: { text: result.text, ranges: [{ start: 0, end: result.text.length }] }
  }).length, 'fabricated approval objects are not capabilities');
});

test('explicit redact uses a typed stable PERSON replacement rather than a generic deletion', () => {
  const { input, binding, anon } = prepared();
  const result = reviewedBatchText(input, decisions(input, 'redact'));
  assert.ok(!result.text.includes('KEINE REALDATEN'));
  assert.ok(result.text.endsWith('[PERSON_007]'));
  assert.deepEqual(verifiedScan(result.text, binding, anon.dictionary), []);
});

test('same-spelling occurrences remain independent and cannot inherit an unreviewed keep', () => {
  const source = '[PERSON_001] – KEINE REALDATEN\n[PERSON_002] – KEINE REALDATEN';
  const findings = pii.scanResidual(source, profile, [], options);
  assert.equal(findings.length, 2);
  const candidates = residualPersonAmbiguities(source, source, findings);
  const binding = createPersonReviewBinding(source, candidates.slice(0, 1));
  binding.confirm([{ ambiguity_id: candidates[0].ambiguity_id, decision: 'keep' }], [], source);
  assert.ok(verifiedScan(source, binding).some(item => item.text === 'KEINE REALDATEN'));
  const all = createPersonReviewBinding(source, candidates);
  const input = { original_text: source, anonymized_text: source, profile, ambiguities: candidates,
    confirmPersonReview: all.confirm, replacementForAmbiguity: () => '[PERSON_009]' };
  const draft = review.buildReviewDraft(source, source, profile, candidates);
  assert.equal(draft.decision_groups.length, 1);
  const chosen = candidates.map((item, index) => ({ ambiguity_id: item.ambiguity_id, decision: index ? 'redact' : 'keep' }));
  assert.throws(() => review.validateReviewResult({ action: 'reviewed', redactions: [], decisions: chosen }, draft),
    /einheitlich entschieden/u);
  const result = reviewedBatchText(input, chosen);
  assert.ok(result.text.endsWith('[PERSON_009]'));
  assert.deepEqual(verifiedScan(result.text, all), []);
});

test('ambiguous source-fragment provenance never guesses the first repeated occurrence', () => {
  const source = 'Max Mustermann – KEINE REALDATEN\nMax Mustermann – KEINE REALDATEN';
  const output = '[PERSON_001] – KEINE REALDATEN';
  assert.throws(() => residualPersonAmbiguities(source, output, pii.scanResidual(output, profile, [], options)),
    error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
});

test('repeated surviving fragments require a complete ordered source/output bijection', () => {
  const sourceLine = 'Max Mustermann – KEINE REALDATEN\n';
  const outputLine = '[PERSON_001] – KEINE REALDATEN\n';
  const source = sourceLine.repeat(2), output = outputLine.repeat(2);
  const findings = pii.scanResidual(output, profile, [], options);
  const candidates = residualPersonAmbiguities(source, output, findings);
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map(item => item.original_start), [sourceLine.indexOf('KEINE'),
    sourceLine.length + sourceLine.indexOf('KEINE')]);
  const binding = createPersonReviewBinding(output, candidates);
  const input = { original_text: source, anonymized_text: output, profile, ambiguities: candidates,
    confirmPersonReview: binding.confirm, replacementForAmbiguity: () => '[PERSON_009]' };
  const choices = candidates.map((item, index) => ({ ambiguity_id: item.ambiguity_id, decision: index ? 'redact' : 'keep' }));
  const result = reviewedBatchText(input, choices);
  assert.ok(result.text.includes('KEINE REALDATEN'));
  assert.ok(result.text.includes('[PERSON_009]'));
  assert.deepEqual(verifiedScan(result.text, binding), []);
  for (const [originalText, anonymizedText] of [[sourceLine.repeat(3), output], [source, outputLine.repeat(3)]]) {
    assert.throws(() => residualPersonAmbiguities(originalText, anonymizedText,
      pii.scanResidual(anonymizedText, profile, [], options)), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
  }
});

test('header offsets and approved preceding redactions are projected exactly', () => {
  const { input, binding, anon } = prepared();
  const prefix = '<!-- Generated header, not document data -->\n\n> Freigegebener Inhalt\n\n';
  const range = { start: 0, end: 'Name: '.length };
  const text = review.applyManualRedactions(anon.text, [range]);
  binding.confirm(decisions(input), [range], text);
  assert.deepEqual(verifiedScan(text, binding, anon.dictionary, prefix, '\n\n'), []);
  const proof = binding.forPublication(prefix, text, '\n\n');
  assert.ok(pii.scanResidual(prefix + 'x' + text + '\n\n', profile, anon.dictionary,
    { reviewedPersonCandidates: proof }).length, 'changed canonical generation loses approval');
});

test('stale content, swapped words, invalid boundaries and repeated confirmations are rejected', () => {
  for (const mutate of [
    state => state.binding.confirm(decisions(state.input), [], state.anon.text + '\nKEINE REALDATEN'),
    state => state.binding.confirm(decisions(state.input), [], state.anon.text.replace('KEINE REALDATEN', 'ERIKA BEISPIEL')),
    state => state.binding.confirm(decisions(state.input), [{ start: -1, end: 2 }], state.anon.text),
    state => state.binding.confirm(decisions(state.input), [{ start: state.input.ambiguities[0].anonymized_start,
      end: state.input.ambiguities[0].anonymized_end }], review.applyManualRedactions(state.anon.text,
      [{ start: state.input.ambiguities[0].anonymized_start, end: state.input.ambiguities[0].anonymized_end }]))
  ]) assert.throws(() => mutate(prepared()), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
  const state = prepared();
  state.binding.confirm(decisions(state.input), [], state.anon.text);
  assert.throws(() => state.binding.confirm(decisions(state.input), [], state.anon.text), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
  assert.throws(() => state.binding.forPublication('', state.anon.text + 'x', ''), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
});

test('known originals, direct identifiers and explicit name evidence are never waived', () => {
  const state = prepared();
  state.binding.confirm(decisions(state.input), [], state.anon.text);
  assert.ok(verifiedScan(state.anon.text, state.binding, ['KEINE REALDATEN']).some(item => item.type === 'RESIDUAL_ENTITY'));
  assert.ok(verifiedScan(state.anon.text, state.binding, [], '', '\nKontakt: erika@example.test').some(item => item.type === 'EMAIL'));
  const explicit = 'Name: ERIKA BEISPIEL';
  const candidate = { ambiguity_id: 'person-residual:v1:000001', type: 'person_residual_ambiguous', replacement_kind: 'PERSON',
    original_start: 6, original_end: explicit.length, anonymized_start: 6, anonymized_end: explicit.length };
  const binding = createPersonReviewBinding(explicit, [candidate]);
  binding.confirm([{ ambiguity_id: candidate.ambiguity_id, decision: 'keep' }], [], explicit);
  assert.ok(verifiedScan(explicit, binding).length, 'even a fabricated internal range cannot waive labelled person evidence');
});

test('reconstructed batch decisions reject a changed source or occurrence even if the ID matches', () => {
  const state = prepared();
  const changed = { ...state.input, original_text: state.input.original_text + ' different' };
  assert.throws(() => reviewedBatchText(changed, decisions(state.input), { reviewedDraft: state.input }),
    error => error.code === 'LOCAL_REVIEW_CANCELLED');
  const wrongSpan = { ...state.input, ambiguities: state.input.ambiguities.map(item => ({ ...item, original_start: item.original_start + 1 })) };
  assert.throws(() => reviewedBatchText(wrongSpan, decisions(state.input), { reviewedDraft: state.input }),
    error => error.code === 'LOCAL_REVIEW_CANCELLED');
});

test('all native presenters bind identical residual wording to one batch decision', () => {
  const text = '[PERSON_001] – KEINE REALDATEN\n[PERSON_002] – KEINE REALDATEN';
  const candidates = residualPersonAmbiguities(text, text, pii.scanResidual(text, profile, [], options));
  const draft = review.buildReviewDraft(text, text, profile, candidates);
  for (const candidate of candidates) assert.equal(review.groupForCandidate(draft, candidate.ambiguity_id).candidate_ids.length, 2);
  assert.match(review.powershellReviewScript(), /person_residual_ambiguous/u);
  assert.match(review.darwinReviewScript(), /person_residual_ambiguous/u);
  for (const candidate of candidates) assert.match(review.linuxReviewContext(draft, candidate), /Ist dies ein Personenname\?/u);
  const bundle = review.buildBatchReviewDraft([{ original_text: text, anonymized_text: text, profile, ambiguities: candidates }]);
  const selected = bundle.draft.ambiguities.map((item) => ({ ambiguity_id: item.ambiguity_id, decision: 'keep' }));
  assert.ok(selected.every(item => item.ambiguity_id.startsWith('person-residual:v1:')));
  const resolved = review.resolveBatchReviewResult(bundle, { action: 'reviewed', decisions: selected, redactions: [] });
  assert.deepEqual(resolved.documents[0].decisions.map(item => item.decision), ['keep', 'keep']);
});

test('Linux local dialog logic asks once for identical residual occurrences', () => {
  const text = '[PERSON_001] – KEINE REALDATEN\n[PERSON_002] – KEINE REALDATEN';
  const candidates = residualPersonAmbiguities(text, text, pii.scanResidual(text, profile, [], options));
  const draft = review.buildReviewDraft(text, text, profile, candidates);
  let viewed = 0, chosen = 0;
  // Only human window answers are synthetic here; the real Linux adapter and
  // decision validator execute. This is not claimed as native Linux evidence.
  const answer = review.linuxReviewTextLocally(draft, { env: {}, runner(_command, args, input) {
    const command = args.join(' ');
    if (command.includes('--text-info')) {
      viewed++;
      assert.match(input, /Ist dies ein Personenname\?/u);
      assert.match(input, /automatisch für 2 gleichnamige Stellen/u);
      return { status: 0, stdout: '' };
    }
    if (command.includes('Alle Fundstellen sind entschieden')) return { status: 0, stdout: 'release' };
    assert.doesNotMatch(command, /keep_group|redact_group/u);
    chosen++;
    return { status: 0, stdout: 'keep' };
  } });
  assert.equal(viewed, 1); assert.equal(chosen, 1);
  assert.deepEqual(review.validateReviewResult(answer, draft).decisions.map(item => item.decision), ['keep', 'keep']);
});

test('real Windows form applies one residual decision to each same-spelling occurrence', () => {
  if (process.platform !== 'win32') return;
  const text = '[PERSON_001] – KEINE REALDATEN\n[PERSON_002] – KEINE REALDATEN';
  const candidates = residualPersonAmbiguities(text, text, pii.scanResidual(text, profile, [], options));
  const draft = review.buildReviewDraft(text, text, profile, candidates);
  const script = review.powershellReviewScript().replace('[void]$form.ShowDialog()',
    '$form.Add_Shown({ $keep.PerformClick(); $approve.PerformClick() }); [void]$form.ShowDialog()');
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = childProcess.spawnSync(executable, ['-NoProfile', '-NonInteractive', '-Sta', '-Command', script], {
    input: JSON.stringify(draft), encoding: 'utf8', shell: false, windowsHide: true, timeout: 20000
  });
  assert.equal(result.status, 0, String(result.stderr || result.error || ''));
  assert.deepEqual(review.validateReviewResult(JSON.parse(result.stdout), draft).decisions.map(item => item.decision), ['keep', 'keep']);
});

async function main() {
  await testAsync('ordinary Standalone conversational names require a bound choice and preserve technical language', async () => {
    const cases = [
      ['In der Besprechung sagte Anna Linden, dass die Lieferung morgen erfolgt.', 'Anna Linden'],
      ['Gestern rief Denise Koch an.', 'Denise Koch'],
      ['Ich habe mit Renate Winter gesprochen.', 'Renate Winter'],
      ['Gestern traf Jean-Luc Moreau die Delegation.', 'Jean-Luc Moreau'],
      ['Wir haben mit María García gesprochen.', 'María García'],
      ['Am Montag hat Anna Linden gesprochen.', 'Anna Linden'],
      ['Gestern bestätigte Anna Linden den Termin.', 'Anna Linden'],
      ['In der Besprechung berichtete Anna Linden über das Ergebnis.', 'Anna Linden'],
      ['Notiz: Gestern rief Denise Koch an.', 'Denise Koch'],
      ['Mit Anna Linden gesprochen.', 'Anna Linden'],
      ['Die Kollegin Anna Linden sagte das.', 'Anna Linden'],
      ['Die Anwältin Anna Linden rief an.', 'Anna Linden'],
      ['Ich habe mit der Kollegin Anna Linden gesprochen.', 'Anna Linden'],
      ['Die Kollegin Anna Linden von der Planung sagte das.', 'Anna Linden'],
      ['Ich habe mit der Kollegin Anna Linden von der Planung gesprochen.', 'Anna Linden'],
      ['Gestern traf Anna van den Berg die Delegation.', 'Anna van den Berg'],
      ['Gestern traf Jean-Luc de la Croix die Delegation.', 'Jean-Luc de la Croix']
    ];
    for (const [index, [source, name]] of cases.entries()) {
      const file = path.join(scope, `conversation-${index}.md`);
      fs.writeFileSync(file, source, 'utf8');
      await assert.rejects(() => anonymizeSelectedSource(file, 'general', { productChannel: 'standalone' }),
        error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
      await assert.rejects(() => anonymizeSelectedSource(file, 'general', { productChannel: 'standalone',
        reviewText: input => ({ text: input.anonymized_text }) }), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
      for (const choice of ['keep', 'redact', 'redact_organization']) {
        const result = await anonymizeSelectedSource(file, 'general', { productChannel: 'standalone', reviewText(input) {
          assert.ok(input.ambiguities.some(candidate => input.original_text.slice(candidate.original_start, candidate.original_end) === name), source);
          return reviewedBatchText(input, decisions(input, choice));
        } });
        const output = gateway.readOutput(result.package_id, result.read_capability, 0, 50000).text;
        if (choice === 'keep') assert.ok(output.includes(name)); else assert.ok(!output.includes(name));
        if (source.includes('den Termin')) assert.ok(output.includes('den Termin'), 'ordinary information after the exact name survives');
        if (source.includes('von der Planung')) assert.ok(output.includes('von der Planung'), 'department suffix is not part of the person name');
      }
      assert.equal(fs.readFileSync(file, 'utf8'), source);
    }
    const { personProseCandidateSpans } = require('../plugins/data-secure/server/privacy/person-ambiguities');
    assert.deepEqual(personProseCandidateSpans('Gestern rief Denise Koch an.'), [], 'Cowork retains its existing candidate scope');
    for (const source of ['Service Level sagte das Team.', 'Fail Closed bezeichnet den Betriebsmodus.',
      'Digitale Transformation ist das Thema.', 'Am Montag hat das Team begonnen.']) {
      assert.deepEqual(personProseCandidateSpans(source, { productChannel: 'standalone' }), [], source);
    }
    assert.equal(personProseCandidateSpans('Die Kollegin sagt, dass Anna Linden rief.', { productChannel: 'standalone' }).length, 1);
  });
  await testAsync('both actual publication routes block imported HMAC and numeric source lookalikes without explicit bound Keep or Redact', async () => {
    const { createBatchPseudonymRegistry, CONTRACT_VERSION, READABLE_CONTRACT_VERSION } =
      require('../plugins/data-secure/server/batch-pseudonym-registry');
    for (const channel of ['plugin', 'standalone']) {
      for (const source of ['Name: [PERSON_DENISEKOCH]',
        'Personalnummer: [PERSON_4711]',
        'Referenz: [PERSON_REVIEW_471123]',
        'Firma: [UNTERNEHMEN_4711]',
        'Kundennummer: [KUNDE_4711]',
        'Referenz: [PROJEKT_UNKLAR_4711]',
        'Personalnummer: [PERSON_47&#49;1]',
        'Name: Denise Koch\nImportiert: [PERSON_DENISEKOCH]\n[ORGANISATION_CAPGEMINIINVENT]',
        'Name: &#68;enise Koch\nImportiert: [PERSON_DENI&#83;EKOCH]',
        'Name: Denise Koch\nMarta Linden schreibt den Bericht.\nImportiert: [PERSON_DENISEKOCH]']) {
        const file = path.join(scope, `imported-hmac-${channel}-${source.length}.md`);
        fs.writeFileSync(file, source, 'utf8');
        await assert.rejects(() => anonymizeSelectedSource(file, 'general', { productChannel: channel }),
          error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
        await assert.rejects(() => anonymizeSelectedSource(file, 'general', {
          productChannel: channel, reviewText: input => ({ text: input.anonymized_text })
        }), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED', 'returning a draft is not an explicit Keep proof');
        if (channel === 'plugin') {
          await assert.rejects(() => anonymizeSelectedSource(file, 'general', {
            productChannel: channel, reviewText(input) {
              assert.equal(input.allowOrganizationReview, undefined, 'no Standalone field appears in the Cowork draft');
              return reviewedBatchText(input, decisions(input, 'redact_organization'));
            }
          }), error => error.code === 'LOCAL_REVIEW_CANCELLED',
          'Cowork does not inherit the Standalone-only company choice');
        }
        for (const choice of ['keep', 'redact', ...(channel === 'standalone' ? ['redact_organization'] : [])]) {
          const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 17), {
            contractVersion: READABLE_CONTRACT_VERSION
          });
          try {
            let expectedBody;
            const result = await anonymizeSelectedSource(file, 'general', {
              productChannel: channel, pseudonymRegistry: registry, reviewText(input) {
                assert.ok(input.ambiguities.length >= 1);
                assert.ok(input.ambiguities.every(candidate =>
                  ['person_residual_ambiguous', 'person_prose_ambiguous'].includes(candidate.type)));
                assert.ok(input.ambiguities.some(candidate => candidate.type === 'person_residual_ambiguous' &&
                  /\[(?:PERSON|ORGANISATION|UNTERNEHMEN|KUNDE|PROJEKT_UNKLAR)_/u.test(input.original_text.slice(candidate.original_start, candidate.original_end))));
                const result = reviewedBatchText(input, decisions(input, choice));
                if (choice === 'keep') assert.equal(result.text, input.anonymized_text, 'Keep must be byte-preserving');
                else {
                  assert.doesNotMatch(result.text, /DENISEKOCH|CAPGEMINIINVENT|4711|471123/u);
                  for (const candidate of input.ambiguities.filter(item => item.type === 'person_residual_ambiguous')) {
                    assert.ok(!result.text.includes(input.original_text.slice(candidate.original_start, candidate.original_end)),
                      'the actual reviewed imported source token is replaced, not merely declared reviewed');
                  }
                }
                expectedBody = result.text;
                return result;
              }
            });
            const text = gateway.readOutput(result.package_id, result.read_capability, 0, 50000).text;
            assert.ok(text.endsWith(expectedBody), 'the exact kept/redacted body is actually published');
            assert.doesNotMatch(text, /Denise Koch/u, 'a raw name outside the token is still replaced');
            if (choice === 'redact_organization') assert.match(text, /\[UNTERNEHMEN_[0-9]{3,5}\]/u);
          } finally { registry.dispose(); }
        }
        assert.equal(fs.readFileSync(file, 'utf8'), source);
      }
      for (const contractVersion of [CONTRACT_VERSION, READABLE_CONTRACT_VERSION]) {
      const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 31), { contractVersion });
      try {
        const marker = registry.assign('PERSON', 'Erika Beispiel');
        const contractSuffix = contractVersion === CONTRACT_VERSION ? 'hmac' : 'readable';
        const file = path.join(scope, `real-registry-reanonymization-${channel}-${contractSuffix}.md`);
        fs.writeFileSync(file, marker + '\n' + marker, 'utf8');
        await assert.rejects(() => anonymizeSelectedSource(file, 'general', {
          productChannel: channel, pseudonymRegistry: registry
        }), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED',
        'a real legacy registry ID also needs Keep when source bytes alone have no provenance');
        const result = await anonymizeSelectedSource(file, 'general', {
          productChannel: channel, pseudonymRegistry: registry, reviewText(input) {
            assert.equal(input.ambiguities.length, 2);
            const kept = reviewedBatchText(input, decisions(input));
            assert.equal(kept.text, marker + '\n' + marker);
            return kept;
          }
        });
        assert.ok(gateway.readOutput(result.package_id, result.read_capability, 0, 30000).text.endsWith(marker + '\n' + marker));
      } finally { registry.dispose(); }
      }
    }
  });
  await testAsync('new numeric tokens without an original collision publish, but source/generated collisions never guess provenance', async () => {
    const { createBatchPseudonymRegistry, READABLE_CONTRACT_VERSION } =
      require('../plugins/data-secure/server/batch-pseudonym-registry');
    for (const channel of ['plugin', 'standalone']) {
      const fresh = path.join(scope, `fresh-generated-numeric-${channel}.md`);
      fs.writeFileSync(fresh, 'Name: Anna Beispiel\nE-Mail: anna@example.org', 'utf8');
      const freshResult = await anonymizeSelectedSource(fresh, 'general', { productChannel: channel });
      const freshText = gateway.readOutput(freshResult.package_id, freshResult.read_capability, 0, 30000).text;
      assert.match(freshText, /\[PERSON_[0-9]{3,5}\]/u);
      assert.doesNotMatch(freshText, /Anna Beispiel|anna@example/iu);
      const collisionSource = 'Name: Anna Beispiel\nAnmerkung: [BEISPIEL]\n[PERSON_001] anna@example.org';
      const collision = path.join(scope, `source-generated-numeric-collision-${channel}.md`);
      fs.writeFileSync(collision, collisionSource, 'utf8');
      const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 33), { contractVersion: READABLE_CONTRACT_VERSION });
      try {
        let reachedReview = false;
        await assert.rejects(() => anonymizeSelectedSource(collision, 'general', { productChannel: channel,
          pseudonymRegistry: registry, reviewText(input) {
            reachedReview = true;
            return reviewedBatchText(input, decisions(input));
          } }), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
        assert.equal(reachedReview, false,
          'missing exact source/output provenance cannot be guessed by choosing the first identical numeric marker');
        assert.equal(fs.readFileSync(collision, 'utf8'), collisionSource);
      } finally { registry.dispose(); }
    }
  });
  await testAsync('actual imported-marker provenance consumes the same Standalone 5,000 budget, not a second bypass allowance', async () => {
    for (const count of [5000, 5001]) {
      const source = Array(count).fill('[PERSON_DENISEKOCH]').join('\n');
      const file = path.join(scope, `imported-marker-boundary-${count}.md`);
      fs.writeFileSync(file, source, 'utf8');
      let reachedReview = false;
      const run = () => anonymizeSelectedSource(file, 'general', { productChannel: 'standalone', reviewText(input) {
        reachedReview = true;
        assert.equal(input.ambiguities.length, count);
        return reviewedBatchText(input, decisions(input));
      } });
      if (count === 5001) {
        await assert.rejects(run, error => error.code === 'LOCAL_REVIEW_TOO_LARGE');
        assert.equal(reachedReview, false);
      } else {
        const result = await run();
        assert.equal(reachedReview, true);
        let text = '', offset = 0;
        for (;;) {
          const chunk = gateway.readOutput(result.package_id, result.read_capability, offset, 30000);
          text += chunk.text;
          offset = chunk.next_offset;
          if (!chunk.has_more) break;
        }
        assert.ok(text.endsWith(source));
        assert.equal((text.match(/\[PERSON_DENISEKOCH\]/gu) || []).length, count);
      }
    }
  });
  await testAsync('actual Standalone publication cannot use forged source brackets or mixed credential cells to bypass privacy', async () => {
    const sources = [
      'Name: Anna Beispiel\nAnmerkung: [BEISPIEL]\n[PERSON_4711] anna@example.org',
      ...['[BEISPIEL]', '[NAME]', '[ABC_123]', '[EMAIL_REDACTED] raw-secret'].map(value =>
        `| Dienst | Passwort |\n| --- | --- |\n| Portal | ${value} |\nPasswort: ${value}`),
      ...['raw-secret', '[BEISPIEL]', '[NAME]', '[ABC_123]', '[EMAIL_REDACTED] raw-secret'].map(value =>
        `| Passwort |\n| --- |\n| ${value} |`)
    ];
    for (const [index, source] of sources.entries()) {
      const file = path.join(scope, `forged-marker-${index}.md`);
      fs.writeFileSync(file, source, 'utf8');
      if (index === 0) await assert.rejects(() => anonymizeSelectedSource(file, 'general', { productChannel: 'standalone' }),
        error => error.code === 'AMBIGUITY_REVIEW_REQUIRED', 'an intentional imported numeric token first needs a local decision');
      let reviewed = false;
      const result = await anonymizeSelectedSource(file, 'general', { productChannel: 'standalone',
        ...(index === 0 ? { reviewText(input) {
          reviewed = true;
          assert.equal(input.ambiguities.length, 1);
          assert.equal(input.original_text.slice(input.ambiguities[0].original_start, input.ambiguities[0].original_end), '[PERSON_4711]');
          const kept = reviewedBatchText(input, decisions(input));
          assert.equal(kept.text, input.anonymized_text);
          return kept;
        } } : {}) });
      const text = gateway.readOutput(result.package_id, result.read_capability, 0, 50000).text;
      assert.doesNotMatch(text, /BEISPIEL|anna@example|raw-secret|\[NAME\]|\[ABC_123\]/iu);
      assert.ok(text.includes(index === 0 ? '[PERSON_001]' : '[CREDENTIAL_REDACTED]'));
      if (index === 0) { assert.equal(reviewed, true); assert.ok(text.includes('[PERSON_4711]')); }
      assert.equal(fs.readFileSync(file, 'utf8'), source);
    }
    const generic = '| Technik |\n| --- |\n| Kubernetes |\n\n| Thema |\n| --- |\n| Service Level |';
    const file = path.join(scope, 'one-column-generic.md');
    fs.writeFileSync(file, generic, 'utf8');
    const result = await anonymizeSelectedSource(file, 'general', { productChannel: 'standalone', reviewText(input) {
      assert.deepEqual(input.ambiguities.map(candidate => input.original_text.slice(candidate.original_start, candidate.original_end)),
        ['Service Level'], 'a name-shaped neutral cell needs one bound semantic choice, not an automatic person alias');
      return reviewedBatchText(input, decisions(input));
    } });
    assert.ok(gateway.readOutput(result.package_id, result.read_capability, 0, 30000).text.includes(generic),
      'the actual publication path must also preserve nonsensitive one-column table content');
  });
  await testAsync('real Engine and Standalone orchestrator reach review at 1,000/1,001/5,000 and give a size cause at 5,001', async () => {
    for (const count of [1000, 1001, 5000, 5001]) {
      const source = 'Name: Max Mustermann\n| Spalte 1 | Spalte 2 |\n| --- | --- |\n' +
        Array.from({ length: count }, (_, index) => `| SYNTHETISCHER HÄRTETEST | ${index + 1} |`).join('\n');
      const file = path.join(scope, `review-boundary-${count}.md`);
      fs.writeFileSync(file, source, 'utf8');
      let reachedReview = false;
      const run = () => anonymizeSelectedSource(file, 'general', { productChannel: 'standalone', reviewText(input) {
        reachedReview = true;
        assert.equal(input.ambiguities.length, count, 'no prepared draft bypasses the actual detectors');
        const result = reviewedBatchText(input, decisions(input));
        assert.ok(result.text.includes('SYNTHETISCHER HÄRTETEST'));
        return result;
      } });
      if (count <= 5000) {
        const result = await run();
        assert.equal(reachedReview, true);
        assert.equal(result.ok, true);
        let text = '', offset = 0;
        for (;;) {
          const chunk = gateway.readOutput(result.package_id, result.read_capability, offset, 30000);
          assert.ok(chunk.next_offset > offset);
          text += chunk.text;
          offset = chunk.next_offset;
          if (!chunk.has_more) { assert.equal(text.length, chunk.total_chars); break; }
        }
        assert.doesNotMatch(text, /Max Mustermann/u);
        assert.equal(text.match(/SYNTHETISCHER HÄRTETEST/gu).length, count,
          'every reviewed occurrence remains in the complete persisted result, not only its first preview chunk');
      } else {
        await assert.rejects(run, error => error.code === 'LOCAL_REVIEW_TOO_LARGE');
        assert.equal(reachedReview, false);
      }
      assert.equal(fs.readFileSync(file, 'utf8'), source);
    }
    const file = path.join(scope, 'review-boundary-1001.md');
    let reachedReview = false;
    await assert.rejects(() => anonymizeSelectedSource(file, 'general', { productChannel: 'plugin', reviewText() {
      reachedReview = true;
      throw new Error('COWORK_LIMIT_WAS_BYPASSED');
    } }), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
    assert.equal(reachedReview, false, 'Standalone opt-in is not sticky for a later Cowork call');
  });
  await testAsync('both product orchestrators bind review to the same canonical parser representation', async () => {
    const { canonicalizeRenderedText } = require('../plugins/data-secure/server/privacy/base');
    const literalMarkup = 'Code: &lt;br&gt; und &lt;span&gt;literal&lt;/span&gt; und &lt;!-- Hinweis --&gt;';
    const source = 'Name: <span>Max&#32;Mustermann</span>\nE-Mail: max@example&#46;org\n' + literalMarkup +
      '\n| Spalte 1 | Spalte 2 |\n| --- | --- |\n' +
      '| SYNTHETISCHER HÄRTETEST | Formel: ROW\\(\\)\\+1<br>Gespeicherter Wert: 2 |';
    const canonical = canonicalizeRenderedText(source);
    assert.equal(canonicalizeRenderedText(canonical), canonical,
      'escaped visible markup cannot become executable/source markup on a later pass');
    assert.ok(canonical.includes(literalMarkup));
    assert.ok(canonical.includes('Name: Max Mustermann'));
    assert.ok(canonical.includes('E-Mail: max@example.org'));
    const nestedLiteral = canonicalizeRenderedText('Code: &lt;span title="&lt;br&gt;"&gt;literal&lt;/span&gt;');
    assert.equal(canonicalizeRenderedText(nestedLiteral), nestedLiteral,
      'literal markup inside a quoted attribute cannot make the outer example disappear later');
    for (const channel of ['plugin', 'standalone']) {
      const file = path.join(scope, `canonical-review-${channel}.md`);
      fs.writeFileSync(file, source, 'utf8');
      let reviewed = false;
      const result = await anonymizeSelectedSource(file, profile, { productChannel: channel, reviewText(input) {
        reviewed = true;
        assert.doesNotMatch(input.original_text, /<br>/u);
        assert.equal(input.original_text, canonical);
        assert.equal(input.ambiguities.length, 1);
        const candidate = input.ambiguities[0];
        assert.equal(input.original_text.slice(candidate.original_start, candidate.original_end), 'SYNTHETISCHER HÄRTETEST');
        assert.equal(input.anonymized_text.slice(candidate.anonymized_start, candidate.anonymized_end), 'SYNTHETISCHER HÄRTETEST');
        return reviewedBatchText(input, decisions(input));
      } });
      assert.ok(reviewed);
      const text = gateway.readOutput(result.package_id, result.read_capability, 0, 50000).text;
      assert.ok(text.includes('SYNTHETISCHER HÄRTETEST'));
      assert.ok(text.includes(literalMarkup), 'literal HTML examples stay visible and inert after publication');
      assert.ok(!text.includes('Max Mustermann'));
      assert.ok(!text.includes('max@example.org'), 'entity-split identifiers still pass through the privacy gate');
      assert.equal(fs.readFileSync(file, 'utf8'), source);
    }
  });
  await testAsync('single-file review adapter confirms only the validated human decision', async () => {
    const state = prepared();
    const item = {};
    const result = await reviewSingleBatchTextLocally(state.input, { items: [item] }, item, {
      reviewTextLocally: () => ({ action: 'reviewed', redactions: [], decisions: decisions(state.input) })
    });
    assert.deepEqual(verifiedScan(result.text, state.binding, state.anon.dictionary), []);
  });
  await testAsync('actual companion processing binds residual keep and release approval without a public exception flag', async () => {
    const { createJob } = require('../plugins/data-secure/server/companion/job-store');
    const { processCompanionJob } = require('../plugins/data-secure/server/companion/processor');
    const file = path.join(scope, 'companion-original.txt');
    fs.writeFileSync(file, original, 'utf8');
    const job = createJob({ profile, source_type: 'txt' });
    const result = await processCompanionJob(job.job_id, file, profile, {
      reviewTextLocally: input => ({ action: 'reviewed', redactions: [], decisions: decisions(input) })
    });
    assert.equal(result.job.state, 'Released');
    assert.ok(gateway.readOutput(result.package_id, result.read_capability, 0, 50000).text.includes('KEINE REALDATEN'));
  });
  let sequence = 0;
  await testAsync('real Standalone publication replaces a manually confirmed company with a company pseudonym', async () => {
    const file = path.join(scope, 'company-original.txt');
    const source = 'CAPGEMINI INVENT\nName: Max Mustermann';
    fs.writeFileSync(file, source, 'utf8');
    const { createBatchPseudonymRegistry, READABLE_CONTRACT_VERSION } = require('../plugins/data-secure/server/batch-pseudonym-registry');
    const registry = createBatchPseudonymRegistry(Buffer.alloc(32, 26), { contractVersion: READABLE_CONTRACT_VERSION });
    try {
    const snapshots = [];
    const result = await anonymizeSelectedSource(file, 'general', {
      productChannel: 'standalone', pseudonymRegistry: registry,
      persistStandaloneIdentitySnapshot: snapshot => snapshots.push(snapshot), reviewText(input) {
        assert.equal(input.allowOrganizationReview, true);
        return reviewedBatchText(input, decisions(input, 'redact_organization'));
      }
    });
    const text = gateway.readOutput(result.package_id, result.read_capability, 0, 50000).text;
    assert.match(text, /\[UNTERNEHMEN_001\]/u);
    assert.ok(!text.includes('CAPGEMINI INVENT'));
    assert.equal(fs.readFileSync(file, 'utf8'), source);
    assert.ok(snapshots[0].entries.some(entry => entry.pseudonym === '[UNTERNEHMEN_001]' &&
      entry.original.toLocaleUpperCase('de-DE') === 'CAPGEMINI INVENT'));
    const later = path.join(scope, 'company-later.txt');
    fs.writeFileSync(later, source + '\nWeiterer technischer Sachstand.', 'utf8');
    const continued = await anonymizeSelectedSource(later, 'general', {
      productChannel: 'standalone', pseudonymRegistry: registry, reviewText(input) {
        assert.equal(input.ambiguities.length, 0, 'the exact known company is not reserved again as a person');
        return reviewedBatchText(input, []);
      }
    });
    const laterText = gateway.readOutput(continued.package_id, continued.read_capability, 0, 50000).text;
    assert.match(laterText, /\[UNTERNEHMEN_001\]/u);
    assert.ok(!laterText.includes('CAPGEMINI INVENT'));
    } finally { registry.dispose(); }
  });
  const selectedFile = () => {
    const file = path.join(scope, `original-${++sequence}.txt`);
    fs.writeFileSync(file, original, 'utf8');
    return file;
  };
  for (const channel of ['plugin', 'standalone']) {
    await testAsync(`${channel}: real publication requires an explicit review and preserves approved wording`, async () => {
      const file = selectedFile();
      const result = await anonymizeSelectedSource(file, profile, { productChannel: channel, reviewText(input) {
        assert.equal(input.ambiguities.length, 1);
        assert.equal(input.ambiguities[0].type, 'person_residual_ambiguous');
        return reviewedBatchText(input, decisions(input));
      } });
      const text = gateway.readOutput(result.package_id, result.read_capability, 0, 50000).text;
      assert.ok(text.includes('KEINE REALDATEN'));
      assert.ok(!text.includes('Max Mustermann'));
      assert.equal(fs.readFileSync(file, 'utf8'), original);
    });
  }
  await testAsync('returning unchanged review text alone never grants a residual exception', async () => {
    await assert.rejects(() => anonymizeSelectedSource(selectedFile(), profile, {
      reviewText: input => ({ text: input.anonymized_text })
    }), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
  });
  await testAsync('appending PII after a real keep decision cannot publish', async () => {
    await assert.rejects(() => anonymizeSelectedSource(selectedFile(), profile, {
      reviewText(input) {
        const result = reviewedBatchText(input, decisions(input));
        return { text: result.text + '\nErika Beispiel' };
      }
    }), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
  });
  await testAsync('no local decision route means no publication', async () => {
    await assert.rejects(() => anonymizeSelectedSource(selectedFile(), profile), error => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
  });
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await done();
  // The scope was freshly created by this test and has never contained user data.
  if (path.dirname(scope) !== temporaryRoot || !path.basename(scope).startsWith('datasecure-residual-review-') || fs.lstatSync(scope).isSymbolicLink()) throw new Error('UNSAFE_TEST_SCOPE');
  fs.rmSync(scope, { recursive: true, force: true });
});
