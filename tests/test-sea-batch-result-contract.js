'use strict';

// Fixture oracle and in-memory OOXML parser only: no worker, GUI or keyring.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSuite } = require('./helpers');
const { test, done, assert } = createSuite('SEA synthetic batch result oracle');
const { createSyntheticFixtures } = require('../plugins/data-secure/server/sea-batch-probe-fixtures');
const { parseOoxml } = require('../plugins/data-secure/server/ooxml');
const filename = path.join(__dirname, '../plugins/data-secure/server/sea-batch-probe.js');
const sandbox = { module: { exports: {} }, require(name) {
  if (name === 'node:sea') return { isSea: () => false };
  if (['node:fs', 'node:path', 'node:os', 'node:crypto'].includes(name)) return require(name);
  throw new Error('PRODUCT_IMPORT_FORBIDDEN');
} };
vm.runInNewContext(fs.readFileSync(filename, 'utf8') + '\nmodule.exports = verifyFixtureText;',
  sandbox, { filename, timeout: 1000 });
const verify = sandbox.module.exports;
const base = ['Kontakt: [PERSON_1]', 'Kontakt: [PERSON_2]', 'Zertifizierung: Scrum.org PSM I'];
test('fully replaced synthetic names with preserved qualification pass', () => verify(base));
for (const leak of ['Alice [PERSON_1]', '[PERSON_1] Beispiel', 'BOB', 'Carla',
  'Ali**ce**', 'Bei\nspiel', 'C\u200barla', 'Ａｌｉｃｅ', 'alice@example.test']) {
  test(`fixture leak ${JSON.stringify(leak)} fails even if the full name no longer occurs`, () => {
    assert.throws(() => verify([leak, ...base]), /^Error: SEA_BATCH_RESULT_INVALID$/);
  });
}
test('missing qualification cannot pass the name-removal check alone', () => {
  assert.throws(() => verify(base.slice(0, 2)), /^Error: SEA_BATCH_RESULT_INVALID$/);
});
for (const scenario of ['positive', 'disconnect', 'worker-resume']) {
  test(`${scenario} uses three bounded fixed fixtures and a fully readable image-free final DOCX`, () => {
    const fixtures = createSyntheticFixtures(scenario);
    assert.deepStrictEqual(fixtures.map(item => item.name),
      ['synthetic-one.txt', 'synthetic-two.csv', 'synthetic-three.docx']);
    assert.ok(fixtures.every(item => Buffer.isBuffer(item.bytes) && item.bytes.length > 0 && item.bytes.length < 2 * 1024 * 1024));
    const parsed = parseOoxml(fixtures[2].bytes, '.docx');
    assert.deepStrictEqual(parsed.warnings, []);
    assert.strictEqual(parsed.attachments.length, 0);
    assert.ok(parsed.markdown.includes('Scrum.org PSM I'));
    assert.ok(parsed.markdown.includes('Carla Beispiel'));
    assert.ok(parsed.markdown.includes('carla@example.test'));
    if (scenario === 'worker-resume') assert.ok(parsed.markdown.length > 100_000);
  });
}
test('only resume enlarges the final document, leaving the earlier original fixtures unchanged', () => {
  const normal = createSyntheticFixtures();
  const disconnect = createSyntheticFixtures('disconnect');
  const resume = createSyntheticFixtures('worker-resume');
  for (let index = 0; index < 3; index++) assert.ok(normal[index].bytes.equals(disconnect[index].bytes));
  for (let index = 0; index < 2; index++) assert.ok(normal[index].bytes.equals(resume[index].bytes));
  assert.ok(resume[2].bytes.length > normal[2].bytes.length);
  assert.ok(resume[2].bytes.equals(createSyntheticFixtures('worker-resume')[2].bytes));
});
test('unknown fixture selectors are rejected rather than becoming arbitrary file input', () => {
  for (const scenario of ['', 'parent-crash', '../private.docx', null, {}]) {
    assert.throws(() => createSyntheticFixtures(scenario), /^Error: SEA_BATCH_FIXTURE_INVALID$/);
  }
});

test('acceptance reads staging strictly without invoking cleanup or hiding relocated crash remnants', () => {
  let inventory = { pending: 0, failures: 0, unbound: 0 }, calls = 0;
  const context = { module: { exports: {} }, require(name) {
    if (name === './gateway/package-staging') return { inspectStaging() { calls++; return inventory; } };
    return sandbox.require(name);
  } };
  const source = fs.readFileSync(filename, 'utf8');
  vm.runInNewContext(source + '\nmodule.exports = verifyStagingInventory;', context, { filename, timeout: 1000 });
  context.module.exports();
  for (const field of ['pending', 'failures', 'unbound']) {
    for (const value of [1, undefined, '0']) {
      inventory = { pending: 0, failures: 0, unbound: 0, [field]: value };
      assert.throws(() => context.module.exports(), /^Error: SEA_BATCH_RESULT_INVALID$/u);
    }
  }
  assert.strictEqual(calls, 10);
  assert.match(source.slice(source.indexOf('function verifyResults(')), /verifyStagingInventory\(\);/u);
});

done();
