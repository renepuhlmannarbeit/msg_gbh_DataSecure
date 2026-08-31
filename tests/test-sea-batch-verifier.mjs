import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseArguments, validateResult } from '../scripts/verify-sea-batch.mjs';
const { createSuite } = createRequire(import.meta.url)('./helpers.js');
const { test, assert, done } = createSuite('SEA batch verifier contract (no native jobs or credentials)');
const script = path.resolve(import.meta.dirname, '../scripts/verify-sea-batch.mjs');
const source = fs.readFileSync(script, 'utf8');
const base = ['--parent', 'synthetic-parent.exe', '--parser-directory', 'synthetic-parser', '--isolated-test-account'];
const valid = scenario => ({ schema: 'datasecure-sea-batch-probe/v1', scenario, target: 'windows-x64',
  checks: { actual_worker_exit: true, journal_complete: true, three_unique_verified_packages: true,
    grades_verified: true, pii_removed: true, qualification_preserved: true, originals_unchanged: true,
    mapping_exactly_once: true, ipc_disconnect_survived: scenario === 'disconnect',
    worker_crash_observed: scenario === 'worker-resume', released_packages_preserved: scenario === 'worker-resume' },
  cleanup_safe: true, privacy_release_verified: false });

test('operator acknowledgement is mandatory before argument paths can be used', () => {
  for (const args of [[], ['--parent', 'private'], ['--isolated-test-account=true']]) {
    assert.throws(() => parseArguments(args), /SEA_BATCH_ISOLATED_ACCOUNT_REQUIRED/);
  }
});
test('three cases are sequential defaults and optional selection is closed', () => {
  assert.deepStrictEqual(parseArguments(base).scenarios, ['positive', 'disconnect', 'worker-resume']);
  for (const scenario of ['positive', 'disconnect', 'worker-resume']) {
    assert.deepStrictEqual(parseArguments([...base, '--scenario', scenario]).scenarios, [scenario]);
  }
  for (const extra of [['--scenario', 'parent-crash'], ['--source', 'file.docx'], ['--isolated-test-account'],
    ['--parent', 'again.exe'], ['--scenario'], ['--scenario', 'positive', '--scenario', 'disconnect']]) {
    assert.throws(() => parseArguments([...base, ...extra]), /SEA_BATCH_ARGUMENTS_INVALID/);
  }
});
test('each selected case requires its own complete and correctly classified result envelope', () => {
  for (const scenario of ['positive', 'disconnect', 'worker-resume']) assert.deepStrictEqual(validateResult(valid(scenario), scenario), valid(scenario));
  assert.throws(() => validateResult(valid('parent-crash'), 'parent-crash'), /SEA_BATCH_RESULT_INVALID/);
});
test('every required outcome is mandatory, boolean and independently fail-closed', () => {
  for (const key of Object.keys(valid('positive').checks)) {
    for (const wrong of [undefined, null, 'true', 1, !valid('positive').checks[key]]) {
      const value = valid('positive');
      if (wrong === undefined) delete value.checks[key]; else value.checks[key] = wrong;
      assert.throws(() => validateResult(value, 'positive'), /SEA_BATCH_RESULT_INVALID/, key);
    }
  }
});
test('private fields, invented release flags and missing cleanup evidence cannot pass', () => {
  for (const [key, value] of [['source_path', 'private'], ['token', 'a'.repeat(64)],
    ['privacy_release_verified', true], ['cleanup_safe', false], ['target', 'linux-x64'], ['scenario', 'disconnect']]) {
    assert.throws(() => validateResult({ ...valid('positive'), [key]: value }, 'positive'), /SEA_BATCH_RESULT_INVALID/);
  }
  for (const key of Object.keys(valid('positive'))) {
    const value = valid('positive'); delete value[key];
    assert.throws(() => validateResult(value, 'positive'), /SEA_BATCH_RESULT_INVALID/);
  }
});
test('real ordinary-Node invocation without acknowledgement stops before nonexistent artifact reads', () => {
  const result = spawnSync(process.execPath, [script, '--parent', 'private-does-not-exist.exe'], {
    encoding: 'utf8', timeout: 10000, windowsHide: true, env: { ...process.env, NODE_OPTIONS: '' }
  });
  assert.ifError(result.error); assert.strictEqual(result.status, 2); assert.strictEqual(result.stderr, '');
  assert.deepStrictEqual(JSON.parse(result.stdout), { schema: 'datasecure-sea-batch-acceptance/v1', ok: false,
    error: 'SEA_BATCH_ISOLATED_ACCOUNT_REQUIRED', privacy_release_verified: false });
});
test('invalid scenario with acknowledgement stops before any nonexistent artifact reads', () => {
  const result = spawnSync(process.execPath, [script, ...base, '--scenario', 'parent-crash'], {
    encoding: 'utf8', timeout: 10000, windowsHide: true, env: { ...process.env, NODE_OPTIONS: '' }
  });
  assert.ifError(result.error); assert.strictEqual(result.status, 2); assert.strictEqual(result.stderr, '');
  assert.deepStrictEqual(JSON.parse(result.stdout), { schema: 'datasecure-sea-batch-acceptance/v1', ok: false,
    error: 'SEA_BATCH_ARGUMENTS_INVALID', privacy_release_verified: false });
});

test('DS-063 blocks even valid historical acknowledgement before artifact I/O or product spawns', () => {
  for (const scenario of ['positive', 'disconnect', 'worker-resume']) {
    const result = spawnSync(process.execPath, [script, ...base, '--scenario', scenario], {
      encoding: 'utf8', timeout: 10000, windowsHide: true, env: { ...process.env, NODE_OPTIONS: '' }
    });
    assert.ifError(result.error); assert.strictEqual(result.status, 2); assert.strictEqual(result.stderr, '');
    assert.deepStrictEqual(JSON.parse(result.stdout), { schema: 'datasecure-sea-batch-acceptance/v1', ok: false,
      error: 'SEA_BATCH_TEST_ISOLATION_PENDING', privacy_release_verified: false });
  }
  assert.ok(source.indexOf("fail('SEA_BATCH_TEST_ISOLATION_PENDING');") < source.indexOf('const assembly = await prepareAssembly(args)'));
});
test('resume cannot pass without both actual crash evidence and preservation of already released packages', () => {
  for (const key of ['worker_crash_observed', 'released_packages_preserved']) {
    for (const wrong of [undefined, false, 'true']) {
      const value = valid('worker-resume'); value.checks[key] = wrong;
      assert.throws(() => validateResult(value, 'worker-resume'), /SEA_BATCH_RESULT_INVALID/);
    }
  }
  assert.throws(() => validateResult(valid('positive'), 'worker-resume'), /SEA_BATCH_RESULT_INVALID/);
  const original = valid('positive'); original.checks.worker_crash_observed = true;
  assert.throws(() => validateResult(original, 'positive'), /SEA_BATCH_RESULT_INVALID/);
});
test('native runs are opt-in, piped completion is drained and no broad cleanup/secret substitutions exist', () => {
  assert.match(source, /for \(const scenario of args\.scenarios\) results\.push\(await runCase/);
  assert.match(source, /LOCALAPPDATA: path\.join\(caseRoot, 'localapp'\)/);
  assert.match(source, /EU_PRIVACY_ROOT: path\.join\(caseRoot, 'privacy'\)/);
  assert.match(source, /if \(finished \|\| !closed\) return/);
  assert.match(source, /os_isolation_attested: false/);
  assert.doesNotMatch(source, /rmSync|rmdirSync|unlinkSync|deletePassword|setPassword|setPrivateArtifactCryptoProviderForTests/);
  const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../package.json'), 'utf8'));
  for (const name of ['test', 'test:ci', 'pretest', 'pretest:ci', 'test:sea-gates']) {
    assert.doesNotMatch(pkg.scripts[name], /verify-sea-batch\.mjs|--isolated-test-account/);
  }
});
done();
