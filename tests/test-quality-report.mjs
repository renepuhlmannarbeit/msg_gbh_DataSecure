import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { writeQualityReport, reviewChoice, boundReviewChoice, contactReviewChoice, boundContactReviewChoice, selectQualityEntries } from '../scripts/benchmark-quality.mjs';
import { qualityGateFailures } from '../scripts/check-quality-gate.mjs';
const require = createRequire(import.meta.url);
const { createSuite } = require('./helpers');
const { evaluateQuality, summarizeQuality, assessQuality, qualityHasFindings } = require('../benchmarks/evaluate-quality');
const { test, done, assert } = createSuite('Quality reports and reference-bound synthetic review');
const reference = 'Name: Anna Linden. Anna ist ein Produktname. Java bleibt.';
const sample = { id: 'one', reference, entities: [{ start: 6, end: 17, value: 'Anna Linden', type: 'PERSON', severity: 3 }],
  preserve: [{ start: 19, end: 23, value: 'Anna', category: 'factual' }], location: 'Seite 1', split: 'holdout' };
test('review classifies the actual occurrence, not a name elsewhere', () => {
  assert.equal(reviewChoice(sample, { original_text: reference }, { original_start: 6, original_end: 17 }), 'redact');
  assert.equal(reviewChoice(sample, { original_text: reference }, { original_start: 19, original_end: 23 }), 'keep');
  assert.equal(reviewChoice({ ...sample, preserve: [] }, { original_text: reference }, { original_start: 19, original_end: 23 }), null);
  assert.equal(reviewChoice(sample, { original_text: reference }, { original_start: -1, original_end: 17 }), null);
});
test('OCR contact correction is exact and reference-bound; unknown occurrences never receive guessed values', () => {
  const reference = 'Name: Zora Eibenhang\nE-Mail: zora@new.invalid\nJava bleibt.';
  const start = reference.indexOf('zora@');
  const sample = { reference, entities: [{ start, end: start + 16, value: 'zora@new.invalid', type: 'EMAIL', severity: 3 }], preserve: [] };
  const original_text = reference.replace('zora@new.invalid', 'z0ra@new.invalid');
  const item = { ambiguity_id: 'ocr-contact:v1:000001', original_start: start, original_end: start + 16, contact_kind: 'email' };
  assert.deepEqual(contactReviewChoice(sample, { original_text }, item),
    { ambiguity_id: item.ambiguity_id, decision: 'correct_contact', replacement: 'zora@new.invalid' });
  assert.equal(contactReviewChoice(sample, { original_text }, { ...item, original_start: 0 }), null);
  assert.equal(contactReviewChoice({ ...sample, entities: [] }, { original_text }, item), null);
});
test('another document cannot supply a classification for an unannotated occurrence', () => {
  const other = { ...sample, id: 'two', entities: [], preserve: [] };
  const labels = ['\n\n===== Dokument 1 von 2 =====\n\n', '\n\n===== Dokument 2 von 2 =====\n\n'];
  const first = reference + ' Erstes Dokument.', second = reference + ' Zweites Dokument.';
  const entries = [{ ...sample, reference: first }, { ...other, reference: second }];
  const draft = { original_text: labels[0] + first + labels[1] + second,
    batch_review: { documents: [{ document_index: 1, candidate_ids: ['a'] }, { document_index: 2, candidate_ids: ['b'] }] } };
  const offset = labels[0].length + first.length + labels[1].length;
  assert.equal(boundReviewChoice(entries, [{ extracted: first }, { extracted: second }], draft,
    { ambiguity_id: 'b', original_start: offset + 6, original_end: offset + 17 }), null);
  assert.equal(boundReviewChoice(entries, [{ extracted: first }, { extracted: second }], draft,
    { ambiguity_id: 'a', original_start: labels[0].length + 6, original_end: labels[0].length + 17 }), 'redact');
});
test('contact matrices bind identical OCR readings to separate references and reject swapped or changed source metadata', () => {
  const { buildContactBatch } = require('../plugins/data-secure/server/gateway/ocr-contact-batch');
  const reading = 'E-Mail: same@wrong.invalid\n\n===== Dokument 2 =====\n\nJava bleibt.';
  const files = ['one.png', 'two.png'], values = ['first@new.invalid', 'second@new.invalid'];
  const entries = files.map((file, index) => {
    const reference = reading.replace('same@wrong.invalid', values[index]);
    return { file, reference, preserve: [], entities: [{ start: 8, end: 8 + values[index].length,
      value: values[index], type: 'EMAIL', severity: 3 }] };
  });
  const records = files.map(() => ({ privacy_raw_extracted: reading }));
  const { draft } = buildContactBatch(files.map(source_label => ({ source_label, input: {
    original_text: reading, source_type: 'png', contacts: [{ start: 8, end: 26, page: 1, line: 1, kind: 'email' }] } })));
  assert.deepEqual(draft.ambiguities.map(item => boundContactReviewChoice(entries, records, draft, item).replacement), values);
  const wrongSpan = { ...draft.ambiguities[1], original_start: draft.ambiguities[0].original_start,
    original_end: draft.ambiguities[0].original_end };
  assert.equal(boundContactReviewChoice(entries, records, draft, wrongSpan), null);
  for (const change of [value => value.original_text += ' changed',
    value => value.contact_batch.documents[0].source_label = 'missing.png',
    value => value.contact_batch.documents[1].candidate_ids = value.contact_batch.documents[0].candidate_ids]) {
    const changed = structuredClone(draft); change(changed);
    assert.equal(boundContactReviewChoice(entries, records, changed, changed.ambiguities[1]), null);
  }
  assert.equal(boundContactReviewChoice(entries, [{}, records[1]], draft, draft.ambiguities[0]), null);
  assert.equal(boundContactReviewChoice(entries.map(entry => ({ ...entry, entities: [] })), records, draft, draft.ambiguities[0]), null);
});
test('identical transcripts with conflicting references are deferred, including null votes', () => {
  const records = [{ extracted: reference }, { extracted: reference }];
  assert.equal(boundReviewChoice([sample, { ...sample, entities: [], preserve: [] }], records,
    { original_text: reference }, { original_start: 6, original_end: 17 }), null);
});
test('source-bound privacy extraction is not confused with a different Markdown-only table layout', () => {
  const privacy = `| Thema |\n| --- |\n| ${reference} |`;
  const conversion = `| Zeile | Spalte 1 |\n| --- | --- |\n| 1 | ${reference} |`;
  const start = privacy.indexOf('Anna Linden');
  assert.equal(boundReviewChoice([sample], [{ extracted: conversion, privacy_extracted: privacy }],
    { original_text: privacy }, { original_start: start, original_end: start + 11 }), 'redact');
  assert.equal(boundReviewChoice([sample], [{ extracted: conversion }],
    { original_text: privacy }, { original_start: start, original_end: start + 11 }), null);
});
test('native-only quality selection explicitly excludes OCR and never pretends to execute the full corpus', () => {
  const entries = [{ format: 'txt' }, { format: 'pdf', ocr_variant: 'text' },
    { format: 'pdf', ocr_variant: 'scan' }, { format: 'png' }, { format: 'jpg' }];
  assert.equal(selectQualityEntries({ entries }).length, 5);
  assert.deepEqual(selectQualityEntries({ entries }, { nativeOnly: true }), entries.slice(0, 2));
  assert.throws(() => selectQualityEntries({ entries }, { nativeOnly: true, maxFiles: 3 }), /QUALITY_FILE_LIMIT_INVALID/u);
});

test('quality regression gate rejects partial, stale, stopped and content-damaging reports', () => {
  const result = evaluateQuality(sample, { file: 'source.txt', extracted: reference,
    final: reference.replace('Anna Linden', '[PERSON_001]'), final_status: 'published', format: 'txt' });
  const expected = { version: 'test', target: 'windows-x64', variants: 1, files: ['source.txt'], core_policy_fingerprint: 'core',
    runtime_sha256: 'runtime', conversion_runtime_sha256: 'conversion-runtime',
    evaluation_sha256: { evaluator: 'hash' }, reference_sha256: 'reference' };
  const report = { schema: 'datasecure-quality-report/1', ...expected, synthetic_only: true,
    review_decisions: 'synthetic-reference-bound', runtime_cleanup: 'confirmed', full_corpus_executed: true,
    corpus_selection: 'all-formats', summary: summarizeQuality([result]), results: [result] };
  assert.deepEqual(qualityGateFailures(report, expected), []);
  assert.ok(qualityGateFailures({ ...report, full_corpus_executed: false }, expected).includes('QUALITY_CORPUS_INCOMPLETE'));
  assert.ok(qualityGateFailures({ ...report, corpus_selection: 'native-text-only' }, expected).includes('QUALITY_CORPUS_INCOMPLETE'));
  const foreignResult = { ...result, file: 'different-source.txt' };
  assert.ok(qualityGateFailures({ ...report, results: [foreignResult] }, expected).includes('QUALITY_CORPUS_INCOMPLETE'));
  assert.ok(qualityGateFailures({ ...report, runtime_sha256: 'other' }, expected).includes('QUALITY_REPORT_STALE'));
  assert.ok(qualityGateFailures({ ...report, conversion_runtime_sha256: 'other-model' }, expected).includes('QUALITY_REPORT_STALE'));
  assert.ok(qualityGateFailures({ ...report, conversion_runtime_sha256: undefined }, expected).includes('QUALITY_REPORT_STALE'));
  assert.ok(qualityGateFailures({ ...report, fatal_error: 'QUALITY_EVALUATION_SOURCE_CHANGED' }, expected).includes('QUALITY_FINDINGS_OPEN'));
  assert.ok(qualityGateFailures({ ...report, summary: { ...report.summary, documents: 0 } }, expected).includes('QUALITY_SUMMARY_MISMATCH'));
  const stopped = evaluateQuality(sample, { file: 'source.txt', extracted: reference, format: 'txt', final_status: 'STOPPED' });
  assert.ok(qualityGateFailures({ ...report, results: [stopped], summary: summarizeQuality([stopped]) }, expected).includes('QUALITY_FINDINGS_OPEN'));
  const damaged = evaluateQuality(sample, { file: 'source.txt', extracted: reference, format: 'txt', final_status: 'published',
    final: reference.replace('Anna Linden', '[PERSON_001]').replace('Java', '[PERSON_002]') });
  assert.ok(qualityGateFailures({ ...report, results: [damaged], summary: summarizeQuality([damaged]) }, expected).includes('QUALITY_FINDINGS_OPEN'));
});
test('company decisions are typed, while an unchanged title is kept', () => {
  const reference = 'WIESENLABOR CONSULT\nSYNTHETISCHER HÄRTETEST\nName: Anna Linden';
  const titleStart = reference.indexOf('SYNTHETISCHER HÄRTETEST');
  const titleEnd = titleStart + 'SYNTHETISCHER HÄRTETEST'.length;
  const company = { ...sample, reference,
    entities: [{ value: 'WIESENLABOR CONSULT', start: 0, end: 'WIESENLABOR CONSULT'.length, type: 'ORGANIZATION', severity: 2 }],
    preserve: [{ value: 'SYNTHETISCHER HÄRTETEST', start: titleStart, end: titleEnd, category: 'technical_title' }] };
  assert.equal(reviewChoice(company, { original_text: reference }, { original_start: 0, original_end: 'WIESENLABOR CONSULT'.length }), 'redact_organization');
  assert.equal(reviewChoice(company, { original_text: reference }, { original_start: titleStart, original_end: titleEnd }), 'keep');
});

test('bounded raw OCR contact errors warn, but final safety, preservation and evidence still block', () => {
  const reference = 'E-Mail: qa00@quality.example.invalid. Java bleibt.';
  const source = { ...sample, reference, entities: [{ start: 8, end: 36,
    value: 'qa00@quality.example.invalid', type: 'EMAIL', severity: 3 }], preserve: [] };
  source.entities[0].end = source.entities[0].start + source.entities[0].value.length;
  const raw = reference.replace('qa00', 'qa0O');
  const record = { file: 'scan.png', format: 'png', ocr_variant: 'clean', extracted: raw,
    privacy_raw_extracted: raw, privacy_extracted: reference,
    final: reference.replace(source.entities[0].value, '[EMAIL_001]'), final_status: 'published' };
  const result = evaluateQuality(source, record);
  const expected = { version: 'test', target: 'windows-x64', variants: 1, files: ['scan.png'],
    core_policy_fingerprint: 'core', runtime_sha256: 'runtime', conversion_runtime_sha256: 'conversion',
    evaluation_sha256: { evaluator: 'hash' }, reference_sha256: 'reference' };
  const reportFor = item => ({ schema: 'datasecure-quality-report/1', ...expected, results: [item],
    synthetic_only: true, review_decisions: 'synthetic-reference-bound', runtime_cleanup: 'confirmed',
    full_corpus_executed: true, corpus_selection: 'all-formats', summary: summarizeQuality([item]) });
  const report = reportFor(result), assessment = assessQuality(report);
  assert.equal(qualityHasFindings(report), true); // Raw findings are not erased.
  assert.equal(assessment.status, 'pass_with_warnings');
  assert.deepEqual(assessment.raw_ocr_contact_changes, { documents: 1, markdown_occurrences: 1, privacy_raw_occurrences: 1 });
  assert.deepEqual(qualityGateFailures(report, expected), []);
  assert.ok(qualityGateFailures(report, expected, { strictExtraction: true }).includes('QUALITY_EXTRACTION_WARNINGS_OPEN'));
  assert.ok(qualityGateFailures({ ...report, runtime_sha256: 'old' }, expected).includes('QUALITY_REPORT_STALE'));
  assert.ok(qualityGateFailures({ ...report, full_corpus_executed: false }, expected).includes('QUALITY_CORPUS_INCOMPLETE'));
  assert.ok(qualityGateFailures({ ...report, runtime_cleanup: 'unconfirmed' }, expected).includes('QUALITY_WORKER_CLEANUP_UNCONFIRMED'));
  for (const changes of [
    { final: raw }, // A surviving OCR spelling is still a leak.
    { final: '' }, { final_status: 'STOPPED' },
    { extracted: raw.replace('Java bleibt.', '') },
    { privacy_extracted: raw }, // No silently approved correction/input.
    { privacy_raw_extracted: raw.replace('Java bleibt.', '') },
    { final: record.final.replace('Java', '[PERSON_002]') },
    { final: record.final.replace('bleibt', 'bleibt nicht') },
    { extracted: raw.replace(source.entities[0].value.replace('qa00', 'qa0O'), '') },
    { format: 'txt' }, { privacy_raw_extracted: undefined }, { privacy_extracted: undefined }
  ]) {
    const changed = reportFor(evaluateQuality(source, { ...record, ...changes }));
    assert.equal(assessQuality(changed).status, 'blocked', JSON.stringify(changes));
    assert.ok(qualityGateFailures(changed, expected).includes('QUALITY_FINDINGS_OPEN'));
  }
  // Metrics and findings must agree; cached "pass" labels confer no authority.
  const absentFinding = { ...result, findings: result.findings.filter(item => item.stage !== 'extraction') };
  assert.equal(assessQuality(reportFor(absentFinding)).status, 'blocked');
  const unassessed = { ...result, final: { ...result.final, unassessed_sensitive_occurrences: 1 } };
  assert.equal(assessQuality({ ...reportFor(unassessed), assessment }).status, 'blocked');
  const unaligned = { ...result, extraction: { ...result.extraction, status: 'manual_check_required' } };
  assert.equal(assessQuality(reportFor(unaligned)).status, 'blocked');
  const unknown = { ...result, findings: [...result.findings, { stage: 'extraction', code: 'UNKNOWN_SOURCE_ERROR' }] };
  assert.equal(assessQuality(reportFor(unknown)).status, 'blocked');
  assert.equal(assessQuality({ ...report, fatal_error: 'QUALITY_EVALUATION_SOURCE_CHANGED' }).status, 'blocked');
  assert.equal(assessQuality({ results: [] }).status, 'blocked');
});
test('report preserves filenames/extensions and neutralizes spreadsheet formulas without overwrite', () => {
  const result = evaluateQuality(sample, { file: '=source.pdf', extracted: reference, format: 'pdf', final_status: 'STOPPED' });
  const report = { results: [result], summary: summarizeQuality([result]), version: 'test', target: 'windows-x64', reference_sha256: 'test' };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-quality-report-'));
  try {
    const directory = path.join(root, 'report'); writeQualityReport(directory, report);
    assert.ok(fs.readFileSync(path.join(directory, 'BEFUNDE.csv'), 'utf8').includes('"\'=source.pdf"'));
    assert.ok(fs.readFileSync(path.join(directory, 'QUALITAET.md'), 'utf8').includes('=source.pdf'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'QUALITAET.json'), 'utf8')).results[0].file, '=source.pdf');
    assert.throws(() => writeQualityReport(directory, report), /QUALITY_REPORT_DESTINATION_EXISTS/u);
  } finally {
    // Only the three exact files generated by this test, no recursive deletion.
    for (const file of ['QUALITAET.json', 'BEFUNDE.csv', 'QUALITAET.md']) fs.unlinkSync(path.join(root, 'report', file));
    fs.rmdirSync(path.join(root, 'report')); fs.rmdirSync(root);
  }
});

test('raw and corrected contact spellings are independently checked in final output; phone defects do not use the email exception', () => {
  for (const [type, value, observed] of [['EMAIL', 'qa00@quality.example.invalid', 'qaOO@quaIity.exampIe.invaIid'],
    ['PHONE', '+49 30 555 1010', '+49 30 555 1018']]) {
    const reference = `Kontakt: ${value}. Die Dokumentation beschreibt eine technische Messung mit mehreren sachlichen Informationen und unveränderten Aussagen für diesen synthetischen Referenztest.`;
    const source = { ...sample, reference, entities: [{ start: 9, end: 9 + value.length, value, type, severity: 3 }], preserve: [] };
    const raw = reference.replace(value, observed), clean = reference.replace(value, `[${type}_001]`);
    const record = { file: 'scan.png', format: 'png', extracted: raw,
      privacy_raw_extracted: raw, privacy_extracted: reference, final_status: 'published' };
    const makeReport = output => ({ results: [evaluateQuality(source, { ...record, final: output })],
      full_corpus_executed: true, runtime_cleanup: 'confirmed' });
    for (const output of [raw, `${clean}\n${observed}`, `${observed}\n${clean}`, reference]) {
      const report = makeReport(output);
      assert.equal(assessQuality(report).status, 'blocked', `${type}: ${output}`);
      assert.ok(report.results[0].final.leaking_occurrences || report.results[0].raw_final.leaking_occurrences);
    }
    assert.equal(assessQuality(makeReport(clean)).status, type === 'EMAIL' ? 'pass_with_warnings' : 'blocked');
    if (type === 'EMAIL') {
      const report = makeReport(clean);
      const missing = { ...report.results[0], raw_final: undefined };
      assert.equal(assessQuality({ ...report, results: [missing] }).status, 'blocked');
    }
  }
});
done();
