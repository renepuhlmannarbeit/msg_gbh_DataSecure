'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');
const {
  RESOURCE_LIMITS,
  sourceLimitForExtension,
  assertSourceSize
} = require('../plugins/data-secure/server/resource-limits');
const { validateBatchLimits } = require('../plugins/data-secure/server/gateway/common');

const { test, done, assert } = createSuite('Parser and batch resource limits');
const root = path.resolve(__dirname, '..');

function entry(name, size) { return { name, full: path.join(root, name), stat: { size } }; }

test('500 MiB remains a batch envelope while each parser format has an honest source limit', () => {
  assert.strictEqual(RESOURCE_LIMITS.MAX_BATCH_TOTAL_BYTES, 500 * 1024 * 1024);
  assert.strictEqual(RESOURCE_LIMITS.MAX_TEXT_CHARS, 8_000_000);
  assert.ok(sourceLimitForExtension('.txt') < RESOURCE_LIMITS.MAX_BATCH_TOTAL_BYTES);
  assert.ok(sourceLimitForExtension('.csv') < sourceLimitForExtension('.txt'));
  assert.ok(sourceLimitForExtension('.docx') < RESOURCE_LIMITS.MAX_BATCH_TOTAL_BYTES);
  assert.ok(RESOURCE_LIMITS.MAX_OOXML_EXPANDED_BYTES < 384 * 1024 * 1024);
});

test('format limits fail before a batch snapshot can start', () => {
  for (const extension of ['.txt', '.md', '.markdown', '.csv', '.docx']) {
    const limit = sourceLimitForExtension(extension);
    assert.strictEqual(assertSourceSize(extension, limit), limit);
    assert.throws(() => assertSourceSize(extension, limit + 1), /INPUT_FORMAT_LIMIT/);
    assert.throws(() => validateBatchLimits([entry(`source${extension}`, limit + 1)]), /INPUT_FORMAT_LIMIT/);
  }
});

test('the total envelope is independent from the per-file text limit', () => {
  const accepted = Array.from({ length: 65 }, (_, index) => entry(`source-${index}.txt`, 8_000_000));
  assert.strictEqual(validateBatchLimits(accepted), 520_000_000);
  const rejected = [...accepted, entry('source-65.txt', 8_000_000)];
  assert.throws(() => validateBatchLimits(rejected), /BATCH_TOTAL_LIMIT/);
});

test('runtime and batch preflight share the central expanded-container limit', () => {
  const runtime = fs.readFileSync(path.join(root, 'plugins/data-secure/server/runtime.js'), 'utf8');
  const snapshot = fs.readFileSync(path.join(root, 'plugins/data-secure/server/gateway/batch-snapshot.js'), 'utf8');
  for (const source of [runtime, snapshot]) {
    assert.match(source, /MAX_OOXML_EXPANDED_BYTES/u);
    assert.doesNotMatch(source, /maxUncompressed:\s*300\s*\*\s*1024\s*\*\s*1024/u);
  }
});

done();
