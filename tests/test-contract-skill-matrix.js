'use strict';

// End-to-end acceptance over the same neutral synthetic corpus used for
// detector comparison. This verifies the exact engine shipped under the
// selected plugin root, including preservation controls.

const path = require('path');
const { createSuite, assertAbsent, assertPresent } = require('./helpers');
const { createContractCorpus } = require('../benchmarks/contract-corpus');

const pluginRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'plugins', 'data-secure');
const { anonymizeMarkdown } = require(path.join(pluginRoot, 'server', 'gateway', 'compliance.js'));
const { test, done, assert } = createSuite('150-case contract anonymization matrix');

for (const sample of createContractCorpus(150)) {
  test(`${sample.id}: layout ${sample.layout}`, () => {
    const result = anonymizeMarkdown(sample.source, sample.profile);
    const checked = new Set();
    for (const entity of sample.entities) {
      const id = `${entity.type}:${entity.value}`;
      if (checked.has(id)) continue;
      checked.add(id);
      assertAbsent(result.text, entity.value, `${entity.type} in ${sample.id}`);
    }
    for (const control of sample.preserved) {
      assertPresent(result.text, control.value, `${control.category} in ${sample.id}`);
    }
    assert.ok((result.text.match(/\[ORGANISATION_\d{3,}\]/gu) || []).length >= 2);
  });
}

done();
