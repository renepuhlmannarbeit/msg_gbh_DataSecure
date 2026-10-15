'use strict';

const { createSuite } = require('./helpers');
const { MODES, validateProcessingMode, assertRunnableProcessingMode, processingModeForBatch, isMarkdownBatch } =
  require('../plugins/data-secure/server/core/processing-mode');
const { test, assert, done } = createSuite('Explicit processing purpose');
const { CONTENT_OPTIONS_SCHEMA, validateContentOptions, optionalContentOptions, contentOptionsForBatch } =
  require('../plugins/data-secure/server/core/content-options');
const { contentOptionsDigest } = require('../plugins/data-secure/server/gateway/content-options-binding');

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
test('complete content options preserve every explicit profile and OCR combination', () => {
  for (const markdownOutput of ['content-v1', 'notes-v1']) for (const scanOcr of [false, true]) for (const imageOcr of [false, true]) {
    const source = { imageOcr, scanOcr, markdownOutput, schema: CONTENT_OPTIONS_SCHEMA };
    const value = validateContentOptions(source);
    assert.deepEqual(value, source);
    assert.notEqual(value, source);
    assert.equal(Object.isFrozen(value), true);
    assert.deepEqual(Object.keys(value), ['schema', 'markdownOutput', 'scanOcr', 'imageOcr']);
    assert.equal(contentOptionsDigest(source), contentOptionsDigest(value));
    assert.throws(() => { value.imageOcr = !value.imageOcr; }, TypeError);
    source.imageOcr = !source.imageOcr;
    assert.notEqual(contentOptionsDigest(source), contentOptionsDigest(value), 'even a same-text option change needs a new binding');
  }
});
test('explicit absent/invalid contracts never become legacy defaults', () => {
  const valid = { schema: CONTENT_OPTIONS_SCHEMA, markdownOutput: 'content-v1', scanOcr: true, imageOcr: false };
  assert.equal(optionalContentOptions({}, 'contentOptions', 'standalone'), undefined);
  for (const value of [null, undefined, false, [], 'content-v1', {}, { ...valid, schema: 'datasecure-content-options/2' },
    { ...valid, markdownOutput: 'content-v2' }, { ...valid, scanOcr: 'true' }, { ...valid, imageOcr: 0 },
    { ...valid, extra: false }, Object.create(valid)]) {
    assert.throws(() => optionalContentOptions({ contentOptions: value }, 'contentOptions', 'standalone'), { code: 'CONTENT_OPTIONS_INVALID' });
  }
  for (const key of Object.keys(valid)) {
    const partial = { ...valid }; delete partial[key];
    assert.throws(() => validateContentOptions(partial), { code: 'CONTENT_OPTIONS_INVALID' });
  }
  assert.throws(() => optionalContentOptions({ contentOptions: valid }, 'contentOptions', 'plugin'), { code: 'CONTENT_OPTIONS_FORBIDDEN' });
  assert.equal(optionalContentOptions({}, 'contentOptions', 'plugin'), undefined, 'old Cowork has no new options');
});
test('option getters, hidden and symbol fields are rejected without invocation', () => {
  const valid = { schema: CONTENT_OPTIONS_SCHEMA, markdownOutput: 'content-v1', scanOcr: true, imageOcr: false };
  let reads = 0;
  const getter = { ...valid }; Object.defineProperty(getter, 'scanOcr', { enumerable: true, get() { reads++; return true; } });
  const owner = {}; Object.defineProperty(owner, 'contentOptions', { enumerable: true, get() { reads++; return valid; } });
  assert.throws(() => validateContentOptions(getter), { code: 'CONTENT_OPTIONS_INVALID' });
  assert.throws(() => optionalContentOptions(owner, 'contentOptions', 'standalone'), { code: 'CONTENT_OPTIONS_INVALID' });
  assert.equal(reads, 0);
  const hidden = { ...valid }; Object.defineProperty(hidden, 'imageOcr', { enumerable: false, value: false });
  assert.throws(() => validateContentOptions(hidden), { code: 'CONTENT_OPTIONS_INVALID' });
  assert.throws(() => validateContentOptions({ ...valid, [Symbol('extra')]: true }), { code: 'CONTENT_OPTIONS_INVALID' });
  const proxy = new Proxy(valid, { get() { reads++; throw new Error('not a JSON data value'); } });
  assert.deepEqual(validateContentOptions(proxy), valid, 'one descriptor snapshot, not repeated caller-controlled property reads');
  assert.equal(reads, 0);
  assert.throws(() => optionalContentOptions(Object.create({ contentOptions: valid }), 'contentOptions', 'standalone'),
    { code: 'CONTENT_OPTIONS_INVALID' }, 'inherited values cannot silently become an absent contract');
});

test('new content journals require an explicit immutable Standalone purpose and complete contract', () => {
  const content_options = { schema: CONTENT_OPTIONS_SCHEMA, markdownOutput: 'content-v1', scanOcr: true, imageOcr: false };
  for (const processing_mode of [MODES.MARKDOWN, MODES.ANONYMIZE]) {
    const state = { schema: 'datasecure-batch/7', product_channel: 'standalone', processing_mode,
      standalone_document_review: true, content_options };
    assert.deepEqual(contentOptionsForBatch(state), content_options);
    assert.equal(processingModeForBatch(state), processing_mode);
    assert.equal(isMarkdownBatch(state), processing_mode === MODES.MARKDOWN);
    for (const field of ['schema', 'product_channel', 'processing_mode', 'standalone_document_review', 'content_options']) {
      const changed = { ...state }; delete changed[field];
      assert.throws(() => processingModeForBatch(changed));
    }
    assert.throws(() => processingModeForBatch({ ...state, content_options: null }), { code: 'CONTENT_OPTIONS_INVALID' });
    assert.throws(() => processingModeForBatch({ ...state, product_channel: 'plugin' }), { code: 'CONTENT_OPTIONS_FORBIDDEN' });
    assert.throws(() => processingModeForBatch({ ...state, standalone_document_review: false }), { code: 'PROCESSING_MODE_INVALID' });
    assert.throws(() => processingModeForBatch({ ...state, processing_mode: 'analysis' }), { code: 'PROCESSING_MODE_INVALID' });
    if (processing_mode === MODES.MARKDOWN) for (const field of ['pseudonym_seed', 'core_policy_fingerprint', 'read_capability', 'package_id', 'package_identity'])
      assert.throws(() => processingModeForBatch({ ...state, [field]: null }), { code: 'PROCESSING_MODE_INVALID' });
  }
});

test('legacy schemas cannot acquire new options or silently downgrade the contract', () => {
  const content_options = { schema: CONTENT_OPTIONS_SCHEMA, markdownOutput: 'content-v1', scanOcr: true, imageOcr: false };
  for (let version = 1; version <= 6; version++) {
    const state = { schema: `datasecure-batch/${version}`, product_channel: 'standalone',
      ...(version === 5 ? { processing_mode: MODES.MARKDOWN } : {}) };
    assert.equal(contentOptionsForBatch(state), undefined);
    for (const value of [content_options, null, undefined])
      assert.throws(() => processingModeForBatch({ ...state, content_options: value }), { code: 'CONTENT_OPTIONS_INVALID' });
    assert.throws(() => processingModeForBatch({ ...state, contentOptions: content_options }), { code: 'CONTENT_OPTIONS_INVALID' });
  }
  assert.throws(() => isMarkdownBatch({ schema: 'datasecure-batch/8', processing_mode: MODES.MARKDOWN }),
    { code: 'PROCESSING_MODE_INVALID' }, 'invalid state never routes through a false fallback');
});

done();
