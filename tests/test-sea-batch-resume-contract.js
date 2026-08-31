'use strict';

// Pure predicates and source contracts, not real SEA/crash/privacy evidence.
// No product dependency, process, GUI, keyring or filesystem writer is loaded.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('SEA batch resume (pure crash-candidate contracts)');
const file = path.join(__dirname, '../plugins/data-secure/server/sea-batch-probe.js');
const source = fs.readFileSync(file, 'utf8');
const imports = [];
const forbidden = new Proxy({}, { get() { throw new Error('SIDE_EFFECT_FORBIDDEN_IN_PREDICATE_TEST'); } });
const sandbox = {
  module: { exports: {} }, Buffer,
  process: forbidden,
  setTimeout() { throw new Error('TIMER_FORBIDDEN_IN_PREDICATE_TEST'); },
  clearTimeout() { throw new Error('TIMER_FORBIDDEN_IN_PREDICATE_TEST'); },
  require(name) {
    if (name === 'node:sea') return { isSea: () => false };
    if (name === 'node:fs' || name === 'fs') return forbidden;
    if (['node:path', 'node:os', 'node:crypto', 'path', 'os', 'crypto'].includes(name)) return require(name);
    imports.push(name);
    throw new Error('PRODUCT_IMPORT_FORBIDDEN_IN_PREDICATE_TEST');
  }
};
// Expose the real private function only in this VM; never add product exports
// or modify the source/native bootstrap to obtain a test hook.
vm.runInNewContext(`${source}\nglobalThis.__crashCandidateForTest = crashCandidate;`, sandbox,
  { filename: file, timeout: 1000 });
const crashCandidate = sandbox.__crashCandidateForTest;

function sample() {
  return { items: [
    { id: 'a'.repeat(32), status: 'released', package_id: `ds_${'a'.repeat(32)}` },
    { id: 'b'.repeat(32), status: 'released', package_id: `ds_${'b'.repeat(32)}` },
    { id: 'c'.repeat(32), status: 'processing', checkpoint: 'extracted' }
  ] };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function accepted(value, expected) {
  const before = JSON.stringify(value);
  freeze(value);
  assert.strictEqual(crashCandidate(value), expected);
  assert.strictEqual(JSON.stringify(value), before, 'observing the crash point must never modify the journal');
  assert.deepStrictEqual(imports, [], 'predicate must not import the product or installation key store');
}

test('exactly two released packages and final extracted item form the only accepted crash point', () => {
  accepted(sample(), true);
});

test('predicate is read-only and deterministic across repeated observations of the same journal', () => {
  const value = sample();
  for (let attempt = 0; attempt < 10; attempt++) accepted(value, true);
});

for (const [name, value] of [
  ['null journal', null], ['missing journal', undefined], ['array journal', []],
  ['missing items', {}], ['null items', { items: null }], ['non-array items', { items: {} }],
  ['empty items', { items: [] }]
]) {
  test(`${name} cannot authorize a worker crash`, () => accepted(value, false));
}

test('fewer or more than the three fixed fixture items never qualify', () => {
  for (const count of [0, 1, 2, 4]) {
    const value = sample();
    value.items = count > 3 ? [...value.items, { id: 'f'.repeat(32), status: 'pending' }]
      : value.items.slice(0, count);
    accepted(value, false);
  }
});

for (const phase of ['processing_started', 'private_copy_claimed', 'text_privacy_checked',
  'package_verified', 'package_published', 'publication_unconfirmed', 'delivery_pending',
  'stopped', 'awaiting_local_review', '', undefined]) {
  test(`final checkpoint ${phase === undefined ? '(missing)' : phase || '(empty)'} is not the extracted crash point`, () => {
    const value = sample();
    if (phase === undefined) delete value.items[2].checkpoint;
    else value.items[2].checkpoint = phase;
    accepted(value, false);
  });
}

for (const status of ['pending', 'retryable', 'released', 'stopped', 'delivery_pending',
  'mapping_pending', 'deferred_review', 'complete', undefined]) {
  test(`final status ${status ?? '(missing)'} must not be confused with in-flight processing`, () => {
    const value = sample();
    if (status === undefined) delete value.items[2].status;
    else value.items[2].status = status;
    accepted(value, false);
  });
}

test('an extracted item in either earlier position is too early for the intended preservation proof', () => {
  for (const index of [0, 1]) {
    const value = sample();
    [value.items[index], value.items[2]] = [value.items[2], value.items[index]];
    accepted(value, false);
  }
});

test('both earlier items must already be released, not merely published or awaiting delivery', () => {
  for (const index of [0, 1]) {
    for (const status of ['processing', 'pending', 'delivery_pending', 'mapping_pending', 'stopped']) {
      const value = sample();
      value.items[index].status = status;
      value.items[index].checkpoint = 'package_published';
      accepted(value, false);
    }
  }
});

test('any existing package_id on the extracted final item disqualifies it, including empty sentinels', () => {
  for (const packageId of [`ds_${'f'.repeat(32)}`, '', null, undefined, false]) {
    const value = sample();
    value.items[2].package_id = packageId;
    accepted(value, false);
  }
});

test('all three item IDs must be valid fixed-length lowercase journal identifiers', () => {
  for (const index of [0, 1, 2]) {
    for (const id of [undefined, null, '', 'a'.repeat(31), 'a'.repeat(33), 'g'.repeat(32), 12345]) {
      const value = sample();
      if (id === undefined) delete value.items[index].id;
      else value.items[index].id = id;
      accepted(value, false);
    }
  }
});

test('duplicate item identities in every pair are rejected', () => {
  for (const [left, right] of [[0, 1], [0, 2], [1, 2]]) {
    const value = sample();
    value.items[right].id = value.items[left].id;
    accepted(value, false);
  }
});

test('both released items require a correctly shaped package identity', () => {
  for (const index of [0, 1]) {
    for (const packageId of [undefined, null, '', 'ds_', 'd'.repeat(32), `ds_${'g'.repeat(32)}`,
      `ds_${'d'.repeat(31)}`, `ds_${'d'.repeat(33)}`]) {
      const value = sample();
      if (packageId === undefined) delete value.items[index].package_id;
      else value.items[index].package_id = packageId;
      accepted(value, false);
    }
  }
});

test('duplicate released package identities cannot establish preservation of two distinct results', () => {
  const value = sample();
  value.items[1].package_id = value.items[0].package_id;
  accepted(value, false);
});

test('released package IDs must belong to their exact journal item, not merely have a valid shape', () => {
  for (const index of [0, 1]) {
    const value = sample();
    value.items[index].package_id = `ds_${'f'.repeat(32)}`;
    accepted(value, false);
  }
});

test('null items and array holes never satisfy the journal crash predicate', () => {
  for (const index of [0, 1, 2]) {
    const value = sample();
    value.items[index] = null;
    accepted(value, false);
    const sparse = sample();
    delete sparse.items[index];
    accepted(sparse, false);
  }
});

test('resume orchestration observes real journals without mutating checkpoints or injecting test crypto', () => {
  assert.match(source, /readStateForMaintenance\s*\(/u);
  assert.match(source, /continueMostRecentBatch\s*\(/u);
  assert.match(source, /claimLocalBatchExecutor\s*\(/u);
  assert.match(source, /['"]start-local-batch['"]/u);
  assert.doesNotMatch(source, /\bwriteState\s*\(|\b_test\b|installBatchPrivateArtifactCrypto|private-artifact-test-runtime/u);
  assert.doesNotMatch(source, /DATASECURE_TEST_CRASH_AT|convertDocument\s*:\s*(?:async\b|function\b|\([^)]*\)\s*=>)/u);
});

test('crash controls never address an arbitrary PID or invoke an external process-tree killer', () => {
  assert.doesNotMatch(source, /\bprocess\.kill\s*\(|\b(?:taskkill|pkill|killall)\b|\b(?:execSync|execFileSync|spawnSync)\s*\(/u);
  assert.match(source, /child\.kill\s*\(/u, 'only the captured ChildProcess may receive a termination request');
});

test('failure codes and report fields distinguish an observed crash from a missed crash point', () => {
  for (const code of ['SEA_BATCH_CRASH_POINT_NOT_REACHED', 'SEA_BATCH_JOURNAL_UNAVAILABLE', 'SEA_BATCH_RESUME_FAILED']) {
    assert.ok(source.includes(code), `required bounded code: ${code}`);
  }
  assert.match(source, /worker_crash_observed/u);
  assert.match(source, /released_packages_preserved/u);
  assert.doesNotMatch(source, /console\.(?:log|error)|process\.(?:stdout|stderr)\.write/u);
});

test('extracted is published only after isolated parser close and awaited conversion', () => {
  const runtime = fs.readFileSync(path.join(path.dirname(file), 'runtime.js'), 'utf8');
  const pipeline = fs.readFileSync(path.join(path.dirname(file), 'gateway/orchestrator.js'), 'utf8');
  const processor = fs.readFileSync(path.join(path.dirname(file), 'gateway/batch-item-processor.js'), 'utf8');
  const convertStart = runtime.indexOf('async function convertDocument(');
  assert.ok(convertStart >= 0);
  const conversion = runtime.slice(convertStart, runtime.indexOf('\nmodule.exports', convertStart));
  const close = conversion.indexOf("child.once('close', (code) => {");
  const success = conversion.indexOf('finish(null, validateParserResult(response.result, ext))');
  assert.ok(close >= 0 && success > close,
    'successful conversion must be inside the close handler, not data/exit/IPC');
  assert.strictEqual((conversion.match(/finish\(null,/gu) || []).length, 1,
    'a new successful return path requires crash-safety revalidation');
  assert.strictEqual((conversion.match(/resolve\(value\)/gu) || []).length, 1);
  const awaited = pipeline.indexOf('const converted = await (deps.convertDocument || convertDocument)(');
  const extracted = pipeline.indexOf('if (deps.onExtracted) await deps.onExtracted(converted);');
  assert.ok(awaited >= 0 && extracted > awaited);
  assert.match(processor, /onExtracted:\s*async\s*\(converted\)\s*=>\s*\{\s*checkpoint\('extracted', 'conversion_and_visual_scan'\);/u);
});

test('fixed resume fixture ends in image-free DOCX so no following parser is needed at the crash point', () => {
  const fixtures = fs.readFileSync(path.join(path.dirname(file), 'sea-batch-probe-fixtures.js'), 'utf8');
  const first = fixtures.indexOf("name: 'synthetic-one.txt'");
  const second = fixtures.indexOf("name: 'synthetic-two.csv'");
  const final = fixtures.indexOf("name: 'synthetic-three.docx'");
  assert.ok(first >= 0 && second > first && final > second);
  assert.strictEqual((fixtures.match(/\bname:\s*['"]synthetic-/gu) || []).length, 3,
    'adding a fourth fixture changes the no-following-parser safety argument');
  assert.doesNotMatch(fixtures, /<w:(?:drawing|pict|object)\b|<pic:|word\/media\/|<o:OLEObject\b/u);
  assert.match(fixtures, /word\/document\.xml/u);
});

done();
