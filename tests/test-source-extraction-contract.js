'use strict';

const { createSuite } = require('./helpers');
const { RESOURCE_LIMITS } = require('../plugins/data-secure/server/resource-limits');
const {
  SOURCE_EXTRACTION_SCHEMA,
  COVERAGE_REASON_CODES,
  createSourceExtraction,
  validateSourceExtraction
} = require('../plugins/data-secure/server/core/source-extraction-contract');

const { test, assert, done } = createSuite('Neutral source extraction contract');
const maximum = RESOURCE_LIMITS.MAX_TEXT_CHARS;

test('neutral extraction has no processing purpose or publication capability', () => {
  const value = createSourceExtraction({ source_type: 'xlsx', markdown: 'Name: Max Mustermann',
    coverage: { status: 'complete', reason_codes: [] } }, maximum);
  assert.equal(value.schema, SOURCE_EXTRACTION_SCHEMA);
  assert.deepEqual(Object.keys(value), ['schema', 'source_type', 'markdown', 'coverage']);
  for (const forbidden of ['processing_mode', 'anonymized', 'artifact_id', 'package_id', 'read_capability']) {
    assert.equal(Object.hasOwn(value, forbidden), false);
  }
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.coverage), true);
});

test('coverage is exact, sorted and internally consistent', () => {
  const incomplete = createSourceExtraction({ source_type: 'pdf', markdown: 'Text',
    coverage: { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED', 'SOURCE_COVERAGE_UNVERIFIED'] } }, maximum);
  assert.equal(validateSourceExtraction(incomplete, maximum), incomplete);
  for (const coverage of [
    { status: 'complete', reason_codes: ['OCR_NOT_VERIFIED'] },
    { status: 'incomplete', reason_codes: [] },
    { status: 'incomplete', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED', 'OCR_NOT_VERIFIED'] },
    { status: 'incomplete', reason_codes: ['UNKNOWN'] }
  ]) assert.throws(() => createSourceExtraction({ source_type: 'pdf', markdown: 'Text', coverage }, maximum));
});

test('OCR contact uncertainty crosses both closed contracts without claiming verified contents', () => {
  const standalone = require('../plugins/data-secure/server/standalone/markdown-contract');
  assert.deepEqual(COVERAGE_REASON_CODES, standalone.COVERAGE_REASON_CODES,
    'converter and privacy extraction vocabularies must stay synchronized');
  const coverage = { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED', 'OCR_NOT_VERIFIED'] };
  const value = createSourceExtraction({ source_type: 'png', markdown: 'Kontakt: unchanged@example.invalid', coverage }, maximum);
  assert.equal(validateSourceExtraction(value, maximum), value);
  assert.deepEqual(value.coverage.reason_codes, coverage.reason_codes);
  assert.throws(() => createSourceExtraction({ source_type: 'png', markdown: value.markdown,
    coverage: { ...coverage, status: 'complete' } }, maximum));
});

test('unknown types, extra fields, oversize text and lone surrogates fail closed', () => {
  assert.throws(() => createSourceExtraction({ source_type: 'exe', markdown: 'Text',
    coverage: { status: 'complete', reason_codes: [] } }, maximum));
  assert.throws(() => createSourceExtraction({ source_type: 'txt', markdown: 'Text', extra: true,
    coverage: { status: 'complete', reason_codes: [] } }, maximum));
  assert.throws(() => createSourceExtraction({ source_type: 'txt', markdown: 'x'.repeat(maximum + 1),
    coverage: { status: 'complete', reason_codes: [] } }, maximum), { code: 'TEXT_TOO_LARGE' });
  assert.throws(() => createSourceExtraction({ source_type: 'txt', markdown: '\ud800',
    coverage: { status: 'complete', reason_codes: [] } }, maximum));
});

done();
