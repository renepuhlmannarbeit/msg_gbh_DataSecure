import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { generate, toolSchemas, output } from '../scripts/generate-mcp-validators.mjs';
const require = createRequire(import.meta.url);
const { createSuite } = require('./helpers');
const { validToolArguments, assertSchemaBinding } = require('../plugins/data-secure/server/mcp-input-validation');
const { test, testAsync, done, assert } = createSuite('Executable MCP schema boundary');
const schemas = toolSchemas();

await testAsync('checked-in validator is reproducible, pinned and needs no external runtime', async () => {
  const bytes = fs.readFileSync(output, 'utf8');
  assert.strictEqual(bytes, await generate());
  assert.match(bytes, /Permission is hereby granted/u);
  const context = { exports: {} };
  vm.runInNewContext(bytes, context, { timeout: 1000 });
  assert.strictEqual(context.exports.privacy_status({}), true);
  assert.strictEqual(context.exports.privacy_status([]), false);
  assertSchemaBinding(schemas);
  assert.throws(() => assertSchemaBinding(schemas.slice(1)), /STALE/u);
});

test('all tools enforce object shape, reject unknown properties and never coerce input', () => {
  const Ajv = require('ajv/dist/2020');
  const ajv = new Ajv({ strict: true, ownProperties: true, messages: false });
  for (const { name, inputSchema } of schemas) {
    const reference = ajv.compile(inputSchema);
    for (const value of [null, [], true, 1, '', 'secret', {}, { unknown_private_value: 'never log me' },
      { limit: 0 }, { limit: 50 }, { limit: 51 }, { limit: '20' }, { confirmed: true }, { confirmed: false }]) {
      const before = JSON.stringify(value);
      assert.strictEqual(validToolArguments(name, value), reference(value), name);
      assert.strictEqual(JSON.stringify(value), before);
    }
    for (const value of [null, [], { unknown_private_value: 'never log me' }]) {
      assert.strictEqual(validToolArguments(name, value), false, name);
    }
  }
  assert.strictEqual(validToolArguments('constructor', {}), false);
});

test('nested pages, confirmations, string lengths and numeric bounds are enforced', () => {
  const item = { package_id: 'ds_' + 'a'.repeat(32), read_capability: 'a'.repeat(43), offset: 0 };
  const args = { batch_token: 'a'.repeat(64), continuations: [item] };
  assert.strictEqual(validToolArguments('continue_anonymized_batch_in_chat', args), true);
  for (const patch of [{ read_capability: 'x'.repeat(42) }, { offset: -1 }, { offset: '0' }, { unknown: true }]) {
    assert.strictEqual(validToolArguments('continue_anonymized_batch_in_chat', { ...args, continuations: [{ ...item, ...patch }] }), false);
  }
  assert.strictEqual(validToolArguments('continue_anonymized_batch_in_chat', { ...args, continuations: Array(6).fill(item) }), false);
  assert.strictEqual(validToolArguments('continue_most_recent_document_batch', {}), false);
  assert.strictEqual(validToolArguments('continue_most_recent_document_batch', { confirmed: true }), true);
  assert.strictEqual(validToolArguments('diagnostic_status', { limit: 1.5 }), false);
  assert.strictEqual(validToolArguments('start_document_batch_from_picker', { source_kind: 'web' }), false);
  for (const scope of ['unread', 'reuse_completed']) {
    assert.strictEqual(validToolArguments('start_completed_local_results_handoff', { scope }), true);
  }
  for (const scope of ['all', 'latest', '', true, null]) {
    assert.strictEqual(validToolArguments('start_completed_local_results_handoff', { scope }), false);
  }
  assert.strictEqual(validToolArguments('start_completed_local_results_handoff', {}), true);
  const validators = require('../plugins/data-secure/server/mcp-validators.generated');
  assert.strictEqual(validators.start_document_batch_from_picker.errors, null);
});
await done();
