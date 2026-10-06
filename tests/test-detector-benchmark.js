'use strict';

const path = require('path');
const { createSuite } = require('./helpers');
const { createContractCorpus, createAcceptanceCorpus } = require('../benchmarks/contract-corpus');
const { evaluateDetector } = require('../benchmarks/evaluate-detector');
const engine = require(path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'privacy', 'engine.js'));

const { test, done, assert } = createSuite('Detector benchmark contract');

test('DataSecure meets the synthetic contract ground truth without content loss', () => {
  const result = evaluateDetector(createContractCorpus(1000), (sample) => ({
    spans: engine.sensitiveSpans(sample.source, sample.profile),
    output: engine.anonymize(sample.source, sample.profile).text
  }));
  assert.strictEqual(result.samples, 1000);
  assert.strictEqual(result.fn, 0, `false negatives: ${result.fn}`);
  assert.strictEqual(result.fp, 0, `false positives: ${result.fp}`);
  assert.strictEqual(result.precision, 1);
  assert.strictEqual(result.recall, 1);
  assert.strictEqual(result.f1, 1);
  assert.strictEqual(result.preservation.rate, 1);
  assert.deepStrictEqual(result.preservation.lostByCategory, {});
});

test('DataSecure preserves certifications while removing direct identifiers across every active profile', () => {
  const result = evaluateDetector(createAcceptanceCorpus(1000), (sample) => ({
    spans: engine.sensitiveSpans(sample.source, sample.profile),
    output: engine.anonymize(sample.source, sample.profile).text
  }));
  assert.strictEqual(result.samples, 1000);
  assert.strictEqual(result.fn, 0, `false negatives: ${result.fn}`);
  assert.strictEqual(result.fp, 0, `false positives: ${result.fp}`);
  assert.strictEqual(result.precision, 1);
  assert.strictEqual(result.recall, 1);
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

test('whole-document claims, duplicate inflation and partial names cannot improve the score', () => {
  const source = 'Anna Muster entwickelt Software und erstellt Berichte.';
  const sample = { source, entities: [{ type: 'PERSON', value: 'Anna Muster', start: 0, end: 11, severity: 3 }],
    preserved: [{ value: 'entwickelt Software', category: 'professional_content' }] };
  const exact = { type: 'PERSON', start: 0, end: 11 }, wrong = { type: 'PERSON', start: 12, end: 22 };
  const output = '[PERSON_001] entwickelt Software und erstellt Berichte.';
  const a = evaluateDetector([sample], () => ({ spans: [exact, wrong], output }));
  const b = evaluateDetector([sample], () => ({ spans: [...Array(20).fill(exact), wrong], output }));
  assert.strictEqual(a.precision, b.precision);
  assert.strictEqual(evaluateDetector([sample], () => ({ spans: [{ type: 'PERSON', start: 0, end: source.length }], output })).recall, 0);
  assert.strictEqual(evaluateDetector([sample], () => ({ spans: [exact], output: 'Anna entwickelt Software.' })).fn, 1);
  assert.strictEqual(evaluateDetector([sample], () => ({ spans: [exact], output: `${output}\nMuster` })).fn, 1);
  assert.throws(() => evaluateDetector([sample], () => ({ spans: [{ type: 'PERSON', start: -1, end: 11 }], output })), /DETECTOR_ADAPTER_SPAN_INVALID/u);
});

done();
