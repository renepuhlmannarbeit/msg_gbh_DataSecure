'use strict';

const { createSuite } = require('./helpers');
const { MODES, validateProcessingMode, assertRunnableProcessingMode, processingModeForBatch } =
  require('../plugins/data-secure/server/core/processing-mode');
const { test, assert, done } = createSuite('Explicit processing purpose');

test('exact product mode is distinct from local_only delivery', () => {
  for (const channel of ['standalone', 'plugin']) assert.equal(validateProcessingMode(MODES.ANONYMIZE, channel), MODES.ANONYMIZE);
  assert.equal(validateProcessingMode(MODES.MARKDOWN, 'standalone'), MODES.MARKDOWN);
  for (const invalid of [undefined, null, '', 'local_only', 'analysis', 'Markdown-only', {}, true]) {
    assert.throws(() => validateProcessingMode(invalid, 'standalone'), { code: 'PROCESSING_MODE_INVALID' });
  }
});
test('raw conversion cannot enter the plugin or be enabled by a caller flag', () => {
  assert.throws(() => validateProcessingMode(MODES.MARKDOWN, 'plugin'), { code: 'PROCESSING_MODE_FORBIDDEN' });
  assert.throws(() => validateProcessingMode(MODES.MARKDOWN, 'Standalone'), { code: 'PRODUCT_CHANNEL_INVALID' });
  assert.equal(assertRunnableProcessingMode(MODES.MARKDOWN, 'standalone'), MODES.MARKDOWN);
  assert.equal(assertRunnableProcessingMode(MODES.ANONYMIZE, 'standalone'), MODES.ANONYMIZE);
});
test('historical journals stay anonymization, including legacy plugin state', () => {
  for (const schema of ['datasecure-batch/1', 'datasecure-batch/2', 'datasecure-batch/3', 'datasecure-batch/4']) {
    assert.equal(processingModeForBatch({ schema }), MODES.ANONYMIZE);
    assert.equal(processingModeForBatch({ schema, product_channel: 'standalone' }), MODES.ANONYMIZE);
    assert.throws(() => processingModeForBatch({ schema, processing_mode: MODES.MARKDOWN, product_channel: 'standalone' }), { code: 'PROCESSING_MODE_INVALID' });
  }
});
test('conversion purpose uses a new journal identity without privacy state', () => {
  const state = { schema: 'datasecure-batch/5', product_channel: 'standalone', processing_mode: MODES.MARKDOWN };
  assert.equal(processingModeForBatch(state), MODES.MARKDOWN);
  for (const key of ['pseudonym_contract_version', 'pseudonym_ruleset_version', 'pseudonym_seed', 'pseudonym_registry_state', 'core_policy_fingerprint', 'read_capability']) {
    assert.throws(() => processingModeForBatch({ ...state, [key]: null }), { code: 'PROCESSING_MODE_INVALID' });
  }
  assert.throws(() => processingModeForBatch({ ...state, product_channel: 'plugin' }), { code: 'PROCESSING_MODE_FORBIDDEN' });
  assert.throws(() => processingModeForBatch({ ...state, schema: 'datasecure-batch/6' }), { code: 'PROCESSING_MODE_INVALID' });
  assert.throws(() => processingModeForBatch({ ...state, processing_mode: MODES.ANONYMIZE }), { code: 'PROCESSING_MODE_INVALID' });
  assert.throws(() => processingModeForBatch(Object.create(state)), { code: 'PROCESSING_MODE_INVALID' });
});
done();
