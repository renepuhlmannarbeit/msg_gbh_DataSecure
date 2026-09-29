'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const { createSuite } = require('./helpers');
const scope = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-residual-review-'));
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
  if (!scope.startsWith(path.join(os.tmpdir(), 'datasecure-residual-review-')) || fs.lstatSync(scope).isSymbolicLink()) throw new Error('UNSAFE_TEST_SCOPE');
  fs.rmSync(scope, { recursive: true, force: true });
});
