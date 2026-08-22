'use strict';

const path = require('path');
const { createSuite } = require('./helpers');
const { createContractCorpus } = require('../benchmarks/contract-corpus');
const { evaluateDetector } = require('../benchmarks/evaluate-detector');
const engine = require(path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'privacy', 'engine.js'));

const { test, done, assert } = createSuite('Detector benchmark contract');

test('DataSecure meets the synthetic contract ground truth without content loss', () => {
  const result = evaluateDetector(createContractCorpus(150), (sample) => ({
    spans: engine.sensitiveSpans(sample.source, sample.profile),
    output: engine.anonymize(sample.source, sample.profile).text
  }));
  assert.strictEqual(result.samples, 150);
  assert.strictEqual(result.fn, 0, `false negatives: ${result.fn}`);
  assert.strictEqual(result.fp, 0, `false positives: ${result.fp}`);
  assert.strictEqual(result.precision, 1);
  assert.strictEqual(result.recall, 1);
  assert.strictEqual(result.f1, 1);
  assert.strictEqual(result.preservation.rate, 1);
  assert.deepStrictEqual(result.preservation.lostByCategory, {});
});

test('the evaluator penalizes extra redaction and lost professional content', () => {
  const source = 'Anna Muster entwickelt Software.';
  const result = evaluateDetector([{
    id: 'evaluator-control',
    profile: 'contract',
    source,
    entities: [{ type: 'PERSON', value: 'Anna Muster', start: 0, end: 11, severity: 3 }],
    preserved: [{ category: 'professional_content', value: 'entwickelt Software' }]
  }], () => ({
    spans: [
      { type: 'PERSON', start: 0, end: 11 },
      { type: 'PERSON', start: 22, end: 30 }
    ],
    output: '[PERSON] entwickelt [PERSON].'
  }));
  assert.strictEqual(result.tp, 1);
  assert.strictEqual(result.fn, 0);
  assert.strictEqual(result.fp, 1);
  assert.strictEqual(result.precision, 0.5);
  assert.strictEqual(result.recall, 1);
  assert.strictEqual(result.preservation.rate, 0);
  assert.deepStrictEqual(result.preservation.lostByCategory, { professional_content: 1 });
});

done();
