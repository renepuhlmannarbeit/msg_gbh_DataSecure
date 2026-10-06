'use strict';
const { createSuite } = require('./helpers');
const { createQualityReference } = require('../benchmarks/quality-reference');
const { evaluateQuality, summarizeQuality, bindReference, editDistance, qualityHasFindings } = require('../benchmarks/evaluate-quality');
const { test, done, assert } = createSuite('Independent anonymization quality evaluator');
function sample(reference = 'Name: Anna Linden. Java bleibt. Java bleibt.') {
  return { id: 'example', split: 'holdout', reference, location: 'Seite 1',
    entities: [{ type: 'PERSON', value: 'Anna Linden', start: 6, end: 17, severity: 3 }],
    preserve: [...reference.matchAll(/Java/gu)].map(match => ({ value: 'Java', start: match.index, end: match.index + 4, category: 'technical' })) };
}
const record = (extracted, output) => ({ file: 'beispiel.pdf', format: 'pdf', ocr_variant: 'scan', extracted,
  automatic: output, automatic_status: 'probe', final: output, final_status: 'published', spans: [] });

test('partial names are leaks even if the complete original string disappeared', () => {
  const source = sample();
  const result = evaluateQuality(source, record(source.reference, 'Name: Anna [PERSON_001]. Java bleibt. Java bleibt.'));
  assert.equal(result.final.leaking_occurrences, 1);
  assert.equal(result.final.leaks[0].remaining, 'Anna');
  assert.equal(result.findings.find(item => item.code === 'SENSITIVE_TEXT_REMAINS').file, 'beispiel.pdf');
});
test('deleting all content cannot earn an anonymity pass', () => {
  const source = sample();
  const result = evaluateQuality(source, record(source.reference, '[PERSON_001]'));
  assert.equal(result.final.leaking_occurrences, 0);
  assert.equal(result.final.lost_content.length, 2);
  assert.ok(result.final.lost_factual_words > 0);
});
test('repeated preservation controls are occurrence bound', () => {
  const source = sample();
  const result = evaluateQuality(source, record(source.reference, 'Name: [PERSON_001]. Java bleibt.'));
  assert.equal(result.final.lost_content.length, 1);
});
test('detector cannot claim whole-document spans or duplicate predictions as perfect', () => {
  const source = sample();
  const baseline = record(source.reference, 'Name: [PERSON_001]. Java bleibt. Java bleibt.');
  const exact = { type: 'PERSON', start: 6, end: 17 };
  const a = evaluateQuality(source, { ...baseline, spans: [exact] }).detector_probe;
  const b = evaluateQuality(source, { ...baseline, spans: [exact, exact, exact] }).detector_probe;
  assert.equal(a.exact_precision, 1); assert.equal(b.exact_precision, 1); assert.equal(b.duplicate_spans, 2);
  const broad = evaluateQuality(source, { ...baseline, spans: [{ type: 'PERSON', start: 0, end: source.reference.length }] }).detector_probe;
  assert.equal(broad.exact_precision, 0); assert.equal(broad.exact_recall, 0); assert.ok(broad.excess_redacted_characters > 0);
});
test('invalid spans and absent stages are visible, not silently successful', () => {
  const source = sample();
  const invalid = evaluateQuality(source, { ...record(source.reference, '[PERSON_001]'), spans: [{ type: 'PERSON', start: -1, end: 17 }] });
  assert.equal(invalid.detector_probe.invalid_spans, 1); assert.equal(invalid.detector_probe.exact_precision, 0);
  const missing = evaluateQuality(source, { file: 'gestoppt.docx', format: 'docx', final_status: 'RESIDUAL_PII' });
  assert.equal(missing.final.evaluated, false);
  assert.equal(summarizeQuality([missing]).stages.final.unevaluated_documents, 1);
});
test('an OCR-corrupted name is scored as an extraction change and still checked for leaks', () => {
  const source = sample();
  const ocr = source.reference.replace('Linden', 'L1nden');
  const result = evaluateQuality(source, record(ocr, ocr));
  assert.equal(result.extraction.changed_entities, 1); assert.equal(result.final.leaking_occurrences, 1);
  assert.ok(result.extraction.presentation_normalized_cer > 0);
});
test('contact punctuation loss is an extraction change even when word tokens agree', () => {
  const reference = 'E-Mail: qa00@quality.example.invalid. Java bleibt.';
  const source = { ...sample(), reference, entities: [{ type: 'EMAIL', start: 8, end: 8 + 'qa00@quality.example.invalid'.length,
    value: 'qa00@quality.example.invalid', severity: 3 }], preserve: [] };
  const ocr = reference.replace('@', '#');
  const result = evaluateQuality(source, record(ocr, ocr));
  assert.equal(result.extraction.changed_entities, 1); assert.equal(result.final.leaking_occurrences, 1);
});
test('a later correction does not erase the earlier automatic false negative', () => {
  const source = sample();
  const result = evaluateQuality(source, { ...record(source.reference, source.reference.replace('Anna Linden', '[PERSON_001]')),
    automatic: source.reference });
  assert.equal(result.automatic.leaking_occurrences, 1); assert.equal(result.final.leaking_occurrences, 0);
});
test('a harmless identical word in another role is not a name leak', () => {
  const reference = 'Name: König. Der König gehört zum Schachspiel.';
  const source = { ...sample(), reference, entities: [{ type: 'PERSON', value: 'König', start: 6, end: 11, severity: 3 }],
    preserve: [{ value: 'Der König gehört zum Schachspiel.', start: 13, end: reference.length, category: 'technical' }] };
  const result = evaluateQuality(source, record(reference, 'Name: [PERSON_001]. Der König gehört zum Schachspiel.'));
  assert.equal(result.final.leaking_occurrences, 0); assert.equal(result.final.lost_content.length, 0);
});
test('copied identities in an output prefix/suffix are not presentation exemptions', () => {
  const source = sample();
  for (const output of ['Anna Linden\nName: [PERSON_001]. Java bleibt. Java bleibt.',
    'Name: [PERSON_001]. Java bleibt. Java bleibt.\nAnna Linden']) {
    const result = evaluateQuality(source, record(source.reference, output));
    assert.equal(result.final.leaking_occurrences, 1);
    assert.equal(result.final.leaks[0].remaining, 'Anna Linden');
  }
});
test('a copied partial name outside the aligned body is visible', () => {
  const source = sample(), result = evaluateQuality(source, record(source.reference,
    'Name: [PERSON_001]. Java bleibt. Java bleibt.\nLinden'));
  assert.equal(result.final.leaking_occurrences, 1); assert.equal(result.final.leaks[0].remaining, 'Linden');
  assert.ok(qualityHasFindings({ summary: summarizeQuality([result]), full_corpus_executed: true }));
});
test('factual text lost in extraction cannot vanish from the quality grade', () => {
  const source = sample(), extracted = 'Name: Anna Linden. Java bleibt.';
  const result = evaluateQuality(source, record(extracted, 'Name: [PERSON_001]. Java bleibt.'));
  assert.equal(result.extraction.changed_preservation_controls, 1);
  assert.ok(qualityHasFindings({ summary: summarizeQuality([result]), full_corpus_executed: true }));
});
test('inserting a negation into an intact assertion is not perfect preservation', () => {
  const reference = 'Name: Anna Linden. Die Messung beträgt 42 Prozent.';
  const source = { ...sample(reference), preserve: [{ value: 'Die Messung beträgt 42 Prozent.', start: 19,
    end: reference.length, category: 'factual' }] };
  const result = evaluateQuality(source, record(reference,
    reference.replace('Anna Linden', '[PERSON_001]').replace('beträgt 42', 'beträgt nicht 42')));
  assert.equal(result.final.added_factual_words, 1); assert.equal(result.final.lost_content.length, 1);
  assert.ok(qualityHasFindings({ summary: summarizeQuality([result]), full_corpus_executed: true }));
});
test('a partly lost OCR name is still assessed and prevents a clean grade', () => {
  const source = sample(), ocr = source.reference.replace('Anna Linden', 'Anna');
  const result = evaluateQuality(source, record(ocr, ocr));
  assert.equal(result.extraction.missing_entities, 1); assert.equal(result.final.leaking_occurrences, 1);
  const summary = summarizeQuality([result]); assert.equal(summary.extraction_missing_entities, 1);
  assert.ok(qualityHasFindings({ summary, full_corpus_executed: true }));
});
test('inserted OCR word fragments remain inside the sensitive corridor', () => {
  const source = sample(), ocr = source.reference.replace('Linden', 'Lin den');
  const result = evaluateQuality(source, record(ocr, ocr.replace('Anna', '[PERSON_001]').replace(' den', '')));
  assert.equal(result.extraction.changed_entities, 1);
  assert.equal(result.final.leaking_occurrences, 1); assert.equal(result.final.leaks[0].remaining, 'Lin');
});
test('missing/changed source entities and incomplete smoke runs cannot pass', () => {
  const source = sample();
  const changed = evaluateQuality(source, record(source.reference.replace('Linden', 'L1nden'),
    'Name: [PERSON_001]. Java bleibt. Java bleibt.'));
  const report = { summary: summarizeQuality([changed]), full_corpus_executed: true };
  assert.equal(report.summary.stages.final.leaking_occurrences, 0); assert.ok(qualityHasFindings(report));
  const clean = evaluateQuality(source, record(source.reference, 'Name: [PERSON_001]. Java bleibt. Java bleibt.'));
  assert.equal(qualityHasFindings({ summary: summarizeQuality([clean]), full_corpus_executed: true }), false);
  assert.equal(qualityHasFindings({ summary: summarizeQuality([clean]), full_corpus_executed: false }), true);
});
test('empty publication, source loss, incorrect reference and explicit size limit are distinguished', () => {
  const source = sample();
  assert.equal(evaluateQuality(source, record(source.reference, '')).final.status, 'empty_output');
  const missing = evaluateQuality(source, record('Java bleibt. Java bleibt.', '[PERSON_001]'));
  assert.ok(missing.extraction.missing_entities > 0 || missing.extraction.status === 'manual_check_required');
  assert.throws(() => bindReference({ ...source, entities: [{ ...source.entities[0], start: 2 }] }, source.reference), /QUALITY_REFERENCE_RANGE_INVALID/u);
  assert.equal(editDistance('Müller', 'Mü11er'), 2);
});
test('reference corpus has 60 logical cases with separate reserved templates and identities', () => {
  const corpus = createQualityReference();
  assert.equal(corpus.length, 60); assert.equal(new Set(corpus.map(item => item.id)).size, 60);
  assert.equal(corpus.filter(item => item.split === 'holdout').length, 12);
  assert.ok(corpus.every(item => item.annotation_status === 'synthetic-reference-not-human-adjudicated'));
  const development = new Set(corpus.filter(item => item.split === 'development').flatMap(item => item.entities.filter(entity => entity.type === 'PERSON').map(entity => entity.value)));
  assert.ok(corpus.filter(item => item.split === 'holdout').every(item => item.entities.filter(entity => entity.type === 'PERSON').every(entity => !development.has(entity.value))));
  for (const item of corpus) assert.equal(bindReference(item, item.reference).entities.filter(entity => entity.exact).length, item.entities.length);
});

function salutationSample(reference = 'Frau Anna Linden. Eine Frau leitet die Fachgruppe. Dr. med. bleibt.') {
  const source = sample(reference);
  source.entities = [{ type: 'PERSON', value: 'Anna Linden', start: 5, end: 16, severity: 3 }];
  source.preserve = [];
  source.privacy_redactions = [{ start: 0, end: 4, value: 'Frau', category: 'gendered_salutation', policy: 'DS-012',
    person_start: 5, person_end: 16 }];
  return source;
}
test('DS-012 required salutation removal is measured separately, not as lost factual content', () => {
  const source = salutationSample();
  const result = evaluateQuality(source, record(source.reference,
    '[PERSON_001]. Eine Frau leitet die Fachgruppe. Dr. med. bleibt.'));
  assert.equal(result.final.lost_factual_words, 0);
  assert.equal(result.final.required_privacy_words_removed, 1);
  assert.equal(result.final.retained_privacy_context_occurrences, 0);
  assert.equal(qualityHasFindings({ summary: summarizeQuality([result]), full_corpus_executed: true }), false);
});
test('retaining a gendered salutation at a pseudonym is a privacy policy violation', () => {
  const source = salutationSample(), output = source.reference.replace('Anna Linden', '[PERSON_001]');
  const result = evaluateQuality(source, record(source.reference, output));
  assert.equal(result.final.required_privacy_words_removed, 0);
  assert.equal(result.final.retained_privacy_context_occurrences, 1);
  assert.ok(result.findings.some(item => item.stage === 'final' && item.code === 'REQUIRED_PRIVACY_CONTEXT_REMAINS'));
  assert.ok(qualityHasFindings({ summary: summarizeQuality([result]), full_corpus_executed: true }));
});
test('neutral Frau, qualifications and actual name remnants are not exempted by a salutation annotation', () => {
  const source = salutationSample();
  for (const output of ['[PERSON_001]. Eine leitet die Fachgruppe. Dr. med. bleibt.',
    '[PERSON_001]. Eine Frau leitet die Fachgruppe. bleibt.']) {
    const result = evaluateQuality(source, record(source.reference, output));
    assert.ok(result.final.lost_factual_words > 0);
    assert.ok(qualityHasFindings({ summary: summarizeQuality([result]), full_corpus_executed: true }));
  }
  assert.ok(evaluateQuality(source, record(source.reference,
    'Anna [PERSON_001]. Eine Frau leitet die Fachgruppe. Dr. med. bleibt.')).final.leaking_occurrences > 0);
});
test('source extraction must preserve a salutation even though later anonymization removes it', () => {
  const source = salutationSample();
  const result = evaluateQuality(source, record(source.reference.slice(5),
    '[PERSON_001]. Eine Frau leitet die Fachgruppe. Dr. med. bleibt.'));
  assert.equal(result.extraction.changed_privacy_contexts, 1);
  assert.ok(qualityHasFindings({ summary: summarizeQuality([result]), full_corpus_executed: true }));
});
test('privacy context references cannot exempt arbitrary words, unrelated occurrences or duplicates', () => {
  const source = salutationSample();
  for (const range of [{ ...source.privacy_redactions[0], policy: 'anything' },
    { ...source.privacy_redactions[0], person_start: 6 },
    { ...source.privacy_redactions[0], start: 22, end: 26 },
    { ...source.privacy_redactions[0], value: 'Anna', start: 5, end: 9 }]) {
    assert.throws(() => bindReference({ ...source, privacy_redactions: [range] }, source.reference), /QUALITY_(?:PRIVACY_REFERENCE|REFERENCE_RANGE)_INVALID/u);
  }
  assert.throws(() => bindReference({ ...source, privacy_redactions: [source.privacy_redactions[0], source.privacy_redactions[0]] },
    source.reference), /QUALITY_PRIVACY_REFERENCE_INVALID/u);
});
test('intervening preserved academic qualifications do not become privacy redactions', () => {
  const reference = 'Frau Dr. med. Anna Linden. Java bleibt.';
  const source = salutationSample(reference);
  source.entities[0] = { ...source.entities[0], start: 14, end: 25 };
  source.privacy_redactions[0] = { ...source.privacy_redactions[0], person_start: 14, person_end: 25 };
  source.preserve = [{ start: 5, end: 13, value: 'Dr. med.', category: 'qualification' }];
  assert.equal(evaluateQuality(source, record(reference, 'Dr. med. [PERSON_001]. Java bleibt.')).final.lost_factual_words, 0);
  const loss = evaluateQuality(source, record(reference, '[PERSON_001]. Java bleibt.'));
  assert.equal(loss.final.lost_content.length, 1); assert.equal(loss.final.lost_factual_words, 2);
});
test('a changed privacy extraction cannot convert a factual word into an allowed salutation removal', () => {
  const source = salutationSample(), privacy = source.reference.replace(/^Frau/u, 'FHIR');
  const result = evaluateQuality(source, { ...record(source.reference,
    '[PERSON_001]. Eine Frau leitet die Fachgruppe. Dr. med. bleibt.'), privacy_extracted: privacy });
  assert.equal(result.final.required_privacy_words_removed, 0);
  assert.equal(result.final.lost_factual_words, 1);
  assert.equal(result.privacy_extraction.changed_privacy_contexts, 1);
  assert.ok(qualityHasFindings({ summary: summarizeQuality([result]), full_corpus_executed: true }));
});
test('qualifications, entities and factual text lost only on the privacy path still fail the quality gate', () => {
  const reference = 'Frau Dr. med. Anna Linden. Java bleibt.';
  const source = salutationSample(reference);
  source.entities[0] = { ...source.entities[0], start: 14, end: 25 };
  source.privacy_redactions[0] = { ...source.privacy_redactions[0], person_start: 14, person_end: 25 };
  source.preserve = [{ start: 5, end: 13, value: 'Dr. med.', category: 'qualification' }];
  for (const privacy of [reference.replace('Dr. med. ', ''), reference.replace('Linden', 'L1nden'),
    reference.replace('Java bleibt.', '')]) {
    const result = evaluateQuality(source, { ...record(reference,
      '[PERSON_001]. Java bleibt.'), privacy_extracted: privacy });
    assert.equal(result.extraction.changed_preservation_controls, 0);
    assert.ok(result.privacy_extraction.changed_preservation_controls || result.privacy_extraction.changed_entities ||
      result.privacy_extraction.lost_factual_words);
    assert.ok(result.findings.some(item => item.stage === 'privacy_extraction') || result.privacy_extraction.lost_factual_words);
    assert.ok(qualityHasFindings({ summary: summarizeQuality([result]), full_corpus_executed: true }));
  }
});
done();
