'use strict';

const { createSuite } = require('./helpers');
const { createContractCorpus, createAcceptanceCorpus } = require('../benchmarks/contract-corpus');

const { test, done, assert } = createSuite('Synthetic contract corpus');

test('one thousand deterministic document-like cases carry explicit ground truth', () => {
  const corpus = createContractCorpus();
  assert.strictEqual(corpus.length, 1000);
  assert.strictEqual(new Set(corpus.map((sample) => sample.id)).size, 1000);
  for (const sample of corpus) {
    assert.strictEqual(sample.source_format, 'txt');
    assert.ok(['de', 'en'].includes(sample.language));
    assert.strictEqual(sample.document_type, 'contract');
    assert.strictEqual(sample.profile, 'contract');
    assert.ok(sample.entities.length >= 10);
    assert.ok(sample.preserved.length >= 5);
    for (const entity of sample.entities) assert.strictEqual(sample.source.slice(entity.start, entity.end), entity.value);
    for (const control of sample.preserved) assert.strictEqual(sample.source.slice(control.start, control.end), control.value);
  }
  assert.strictEqual(corpus.filter((sample) => sample.language === 'en').length, 250);
});

test('the acceptance corpus distributes one thousand cases across the user-facing profiles', () => {
  const corpus = createAcceptanceCorpus();
  assert.strictEqual(corpus.length, 1000);
  assert.strictEqual(new Set(corpus.map((sample) => sample.id)).size, 1000);
  const counts = Object.fromEntries(['contract', 'personnel_profile', 'applicant', 'customer'].map((profile) => [
    profile, corpus.filter((sample) => sample.profile === profile).length
  ]));
  assert.deepStrictEqual(counts, { contract: 500, personnel_profile: 167, applicant: 167, customer: 166 });
  for (const sample of corpus) {
    assert.ok(sample.entities.length >= 5, `${sample.id} has direct-identifier ground truth`);
    assert.ok(sample.preserved.length >= 2, `${sample.id} has professional-content ground truth`);
    for (const entity of sample.entities) assert.strictEqual(sample.source.slice(entity.start, entity.end), entity.value);
    for (const control of sample.preserved) assert.strictEqual(sample.source.slice(control.start, control.end), control.value);
  }
  const personnel = corpus.find((sample) => sample.profile === 'personnel_profile');
  assert.ok(personnel.preserved.some((item) => item.category === 'certificate'));
  assert.ok(personnel.entities.some((item) => item.type === 'ORGANIZATION'));
});

done();
