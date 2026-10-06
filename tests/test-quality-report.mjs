import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { writeQualityReport, reviewChoice, boundReviewChoice, contactReviewChoice, selectQualityEntries } from '../scripts/benchmark-quality.mjs';
import { qualityGateFailures } from '../scripts/check-quality-gate.mjs';
const require = createRequire(import.meta.url);
const { createSuite } = require('./helpers');
const { evaluateQuality, summarizeQuality } = require('../benchmarks/evaluate-quality');
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
done();
