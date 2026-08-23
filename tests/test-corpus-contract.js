'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');
const { createContractCorpus, createAcceptanceCorpus } = require('../benchmarks/contract-corpus');
const { evaluateDetector } = require('../benchmarks/evaluate-detector');
const engine = require('../plugins/data-secure/server/privacy/engine');

const { test, done, assert } = createSuite('Machine-readable corpus contract');
const contract = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'benchmarks', 'CORPUS_CONTRACT_V1.json'), 'utf8'
));

function counts(values) {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [
    value, values.filter((candidate) => candidate === value).length
  ]));
}

function distribution(corpus) {
  return {
    samples: corpus.length,
    formats: counts(corpus.map((sample) => sample.source_format)),
    languages: counts(corpus.map((sample) => sample.language)),
    document_types: counts(corpus.map((sample) => sample.document_type)),
    profiles: counts(corpus.map((sample) => sample.profile))
  };
}

function validateSample(sample) {
  for (const key of contract.sample_schema.required) assert.ok(Object.hasOwn(sample, key), `${sample.id || 'sample'} missing ${key}`);
  assert.ok(contract.sample_schema.profiles.includes(sample.profile));
  assert.ok(contract.sample_schema.active_source_formats.includes(sample.source_format));
  assert.strictEqual(typeof sample.source, 'string');
  assert.ok(Number.isSafeInteger(sample.layout) && sample.layout > 0);
  for (const entity of sample.entities) {
    for (const key of contract.sample_schema.entity_required) assert.ok(Object.hasOwn(entity, key), `${sample.id} entity missing ${key}`);
    assert.strictEqual(sample.source.slice(entity.start, entity.end), entity.value);
  }
  for (const preserved of sample.preserved) {
    for (const key of contract.sample_schema.preserved_required) assert.ok(Object.hasOwn(preserved, key), `${sample.id} preservation missing ${key}`);
    assert.strictEqual(sample.source.slice(preserved.start, preserved.end), preserved.value);
  }
}

test('the versioned contract fixes sample shape, coordinate space and release thresholds', () => {
  assert.strictEqual(contract.schema, 'datasecure-corpus-contract/v1');
  assert.strictEqual(contract.sample_schema.position_space, 'utf16-code-units');
  assert.strictEqual(contract.sample_schema.synthetic_only, true);
  assert.deepStrictEqual(contract.quality_gates, {
    direct_identifier_false_negatives_max: 0,
    unexpected_redactions_max: 0,
    marked_content_preservation_rate_min: 0.99
  });
});

test('all two thousand generated samples satisfy the canonical ground-truth shape', () => {
  for (const sample of [...createContractCorpus(), ...createAcceptanceCorpus()]) validateSample(sample);
});

test('declared format, language, document and profile distributions cannot drift', () => {
  assert.deepStrictEqual(distribution(createContractCorpus()), contract.corpora.contract_1000);
  assert.deepStrictEqual(distribution(createAcceptanceCorpus()), contract.corpora.acceptance_1000);
});

test('the detector result is evaluated directly against the canonical release gates', () => {
  const result = evaluateDetector(createAcceptanceCorpus(), (sample) => ({
    spans: engine.sensitiveSpans(sample.source, sample.profile),
    output: engine.anonymize(sample.source, sample.profile).text
  }));
  assert.ok(result.fn <= contract.quality_gates.direct_identifier_false_negatives_max);
  assert.ok(result.fp <= contract.quality_gates.unexpected_redactions_max);
  assert.ok(result.preservation.rate >= contract.quality_gates.marked_content_preservation_rate_min);
});

done();
