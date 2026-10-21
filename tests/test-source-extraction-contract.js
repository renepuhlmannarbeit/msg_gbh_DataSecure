'use strict';

const { createSuite } = require('./helpers');
const { RESOURCE_LIMITS } = require('../plugins/data-secure/server/resource-limits');
const {
  SOURCE_EXTRACTION_SCHEMA,
  COVERAGE_REASON_CODES,
  createSourceExtraction,
  validateSourceExtraction,
  validateSourceExtractionForOptions
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
  assert.equal(COVERAGE_REASON_CODES.length, 26);
  assert.equal(new Set(COVERAGE_REASON_CODES).size, 26);
  assert.ok(COVERAGE_REASON_CODES.every((code, index, codes) => index === 0 || codes[index - 1] < code),
    'the shared closed coverage vocabulary must remain strictly ascending');
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

test('new neutral extraction binds all options and does not authorize an unbound legacy consumer', () => {
  const options = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false };
  const input = { source_type: 'csv', markdown: '| Name |\n| --- |\n| Anna Beispiel |',
    coverage: { status: 'complete', reason_codes: [] } };
  const current = createSourceExtraction({ ...input, content_options: options }, maximum);
  assert.equal(current.schema, 'datasecure-source-extraction/2');
  assert.equal(validateSourceExtractionForOptions(current, maximum, options), current);
  assert.equal(Object.isFrozen(current.content_options), true);
  assert.throws(() => validateSourceExtractionForOptions(current, maximum));
  assert.throws(() => validateSourceExtractionForOptions(createSourceExtraction(input, maximum), maximum, options));
  for (const change of [{ markdownOutput: 'notes-v1' }, { scanOcr: false }, { imageOcr: true }])
    assert.throws(() => validateSourceExtractionForOptions(current, maximum, { ...options, ...change }));
  assert.throws(() => validateSourceExtraction({ ...current, schema: SOURCE_EXTRACTION_SCHEMA }, maximum));
  assert.throws(() => createSourceExtraction({ ...input, content_options: null }, maximum));
});

test('pure record validators normalize reflection failures without inspecting foreign errors', () => {
  const options = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false };
  const input = { source_type: 'txt', markdown: 'Visible text', coverage: { status: 'complete', reason_codes: [] }, content_options: options };
  const value = createSourceExtraction(input, maximum); let errorReads = 0;
  const foreign = new Proxy({}, { get() { errorReads++; throw Error('PRIVATE_SENTINEL'); }, getPrototypeOf() { errorReads++; throw Error('PRIVATE_SENTINEL'); } });
  const bad = target => new Proxy(target, { getOwnPropertyDescriptor() { throw foreign; }, ownKeys() { throw foreign; }, getPrototypeOf() { throw foreign; } });
  for (const operation of [() => validateSourceExtraction(bad(value), maximum), () => createSourceExtraction(bad(input), maximum),
    () => validateSourceExtractionForOptions(value, maximum, bad(options)),
    () => validateSourceExtraction({ ...value, coverage: bad(value.coverage) }, maximum)])
    assert.throws(operation, error => error.code === 'SOURCE_EXTRACTION_INVALID' && !error.message.includes('PRIVATE_SENTINEL'));
  assert.equal(errorReads, 0);
  const { SourceExtractionError } = require('../plugins/data-secure/server/core/source-extraction-contract');
  for (const thrown of [null, 'PRIVATE_SENTINEL', Symbol('PRIVATE_SENTINEL'), new SourceExtractionError('TEXT_TOO_LARGE')]) {
    const proxy = new Proxy(value, { getOwnPropertyDescriptor() { throw thrown; } });
    assert.throws(() => validateSourceExtraction(proxy, maximum), error => error.code === 'SOURCE_EXTRACTION_INVALID');
  }
});

done();
