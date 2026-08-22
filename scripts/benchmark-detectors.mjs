import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const { createContractCorpus } = require(path.join(root, 'benchmarks', 'contract-corpus.js'));
const { evaluateDetector } = require(path.join(root, 'benchmarks', 'evaluate-detector.js'));
const engine = require(path.join(root, 'plugins', 'data-secure', 'server', 'privacy', 'engine.js'));

const corpus = createContractCorpus(150);
const result = evaluateDetector(corpus, (sample) => ({
  spans: engine.sensitiveSpans(sample.source, sample.profile),
  output: engine.anonymize(sample.source, sample.profile).text
}));

console.log(JSON.stringify({
  schema: 'datasecure-detector-benchmark/v1',
  detector: 'datasecure',
  corpus: 'synthetic-german-contracts/v1',
  result
}, null, 2));
