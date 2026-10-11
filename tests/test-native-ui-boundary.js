'use strict';

// These tests NEVER invoke the authorized native path. Guard refusals use the
// real CLI, while authorized planning is pure/in-memory evidence only.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { createSuite } = require('./helpers');
const suite = require('./run-product-suite');
const { test, done, assert } = createSuite('Headless/native desktop test boundary');
const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.resolve(root, file), 'utf8');

test('headless includes every non-GUI full test exactly once on all hosts', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const plan = suite.executionPlan('headless', [], platform);
    assert.deepStrictEqual(plan.headlessFiles, [
      ...suite.baseFiles, ...suite.ciFiles.map(file => `tests/${file}`), ...suite.fullOnly.map(file => `tests/${file}`)
    ]);
    assert.strictEqual(new Set(plan.headlessFiles).size, plan.headlessFiles.length);
    assert.deepStrictEqual(plan.nativeFiles, []);
    assert.ok(!plan.headlessFiles.includes('tests/test-native-windows-forms.js'));
    assert.match(suite.nativeCoverageStatus(platform), /Standalone native GUI\/package acceptance: NOT_RUN/u);
  }
});

test('CI never includes native forms; it still runs the mixed-file policy/engine tests', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const plan = suite.executionPlan('ci', [], platform);
    assert.deepStrictEqual(plan.nativeFiles, []);
    assert.ok(plan.headlessFiles.includes('tests/test-residual-person-review.js'));
    assert.ok(plan.headlessFiles.includes('tests/test-completion-summary.js'));
  }
});

test('full Windows suite refuses before launch unless explicitly authorized', () => {
  assert.throws(() => suite.executionPlan('full', [], 'win32'), { code: 'NATIVE_UI_NOT_AUTHORIZED', exitCode: 77 });
  const plan = suite.executionPlan('full', ['--allow-native-ui'], 'win32');
  assert.deepStrictEqual(plan.nativeFiles, ['tests/test-native-windows-forms.js']);
  assert.strictEqual(plan.headlessFiles.length, suite.executionPlan('headless', [], 'win32').headlessFiles.length);
  assert.strictEqual(plan.nativeStatus, 'PENDING', 'planning cannot turn unexecuted GUI tests green');
});

test('native-only plan requires exact opt-in and reports unsupported platforms rather than fake PASS', () => {
  for (const args of [[], ['--allow-native-ui=false'], ['--allow-native-ui', '--allow-native-ui'], ['--status', '--allow-native-ui']]) {
    assert.throws(() => suite.executionPlan('native-ui', args, 'win32'), { code: 'NATIVE_UI_NOT_AUTHORIZED' });
  }
  for (const platform of ['darwin', 'linux']) {
    assert.throws(() => suite.executionPlan('native-ui', ['--allow-native-ui'], platform), { code: 'NATIVE_UI_NOT_APPLICABLE', exitCode: 78 });
    assert.strictEqual(suite.executionPlan('full', [], platform).nativeStatus, 'NOT_APPLICABLE');
  }
  assert.deepStrictEqual(suite.executionPlan('native-ui', ['--allow-native-ui'], 'win32').headlessFiles, []);
});

test('headless and CI reject flags instead of silently allowing native UI', () => {
  for (const profile of ['headless', 'ci']) {
    assert.throws(() => suite.executionPlan(profile, ['--allow-native-ui'], 'win32'), { code: 'TEST_ARGUMENT_INVALID' });
  }
  assert.throws(() => suite.executionPlan('unknown'), { code: 'TEST_PROFILE_INVALID' });
});

test('direct native entry denies before any product import or child-process access', () => {
  const module = { exports: {} };
  const imported = [];
  vm.runInNewContext(source('tests/test-native-windows-forms.js'), {
    module, process: { argv: [], platform: 'win32' }, console,
    require(id) {
      imported.push(id);
      if (id === './run-product-suite') return suite;
      throw new Error(`UNEXPECTED_IMPORT_BEFORE_CONSENT: ${id}`);
    }
  });
  assert.throws(() => module.exports.main([]), { code: 'NATIVE_UI_NOT_AUTHORIZED' });
  assert.deepStrictEqual(imported, ['./run-product-suite']);
});

test('real CLI denies unapproved native forms without running any test body', () => {
  const result = spawnSync(process.execPath, ['tests/test-native-windows-forms.js'], {
    cwd: root, encoding: 'utf8', shell: false, windowsHide: true, timeout: 10000
  });
  assert.ifError(result.error);
  assert.strictEqual(result.status, 77);
  assert.match(result.stderr, /NATIVE_UI_NOT_AUTHORIZED/u);
  assert.strictEqual(result.stdout, '');
});

test('status-only CLI explicitly reports unexecuted native coverage', () => {
  const result = spawnSync(process.execPath, ['tests/test-native-windows-forms.js', '--status'], {
    cwd: root, encoding: 'utf8', shell: false, windowsHide: true, timeout: 10000
  });
  assert.ifError(result.error);
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /Native Windows forms: (?:NOT_RUN|NOT_APPLICABLE) \(6 cases\)/u);
  assert.doesNotMatch(result.stdout, /passed/u);
});

test('real full runner fails fast on Windows with no partial suite or form launch', () => {
  if (process.platform !== 'win32') return;
  const result = spawnSync(process.execPath, ['tests/run-product-suite.js', 'full'], {
    cwd: root, encoding: 'utf8', shell: false, windowsHide: true, timeout: 10000
  });
  assert.ifError(result.error);
  assert.strictEqual(result.status, 77);
  assert.match(result.stderr, /NATIVE_UI_NOT_AUTHORIZED/u);
  assert.strictEqual(result.stdout, '');
});

test('all six native cases are retained, bounded and isolated from former mixed files', () => {
  const native = source('tests/test-native-windows-forms.js');
  assert.strictEqual(suite.nativeUiCaseCount, 6);
  const names = [...native.matchAll(/^    \['([^']+)', \(\) => \{/gmu)].map(match => match[1]);
  assert.strictEqual(names.length, 6);
  assert.strictEqual(names.filter(name => name.includes('completion form')).length, 1);
  assert.strictEqual(names.filter(name => name.includes('residual decision')).length, 1);
  assert.strictEqual(names.filter(name => name.includes('review form')).length, 4);
  assert.match(native, /timeout: 20000, killSignal: 'SIGKILL'/u);
  assert.strictEqual((native.match(/childProcess\.spawnSync\(/gu) || []).length, 1, 'every native spawn must use the same bounded owner');
  for (const file of ['test-residual-person-review.js', 'test-companion-processor.js', 'test-completion-summary.js']) {
    assert.doesNotMatch(source(`tests/${file}`), /Add_Shown\(|testAutoClose: true/u);
  }
});

test('npm exposes separate gates and never embeds automatic desktop permission', () => {
  const scripts = JSON.parse(source('package.json')).scripts;
  assert.strictEqual(scripts['test:product:headless'], 'node tests/run-product-suite.js headless');
  assert.strictEqual(scripts['test:product:native-ui'], 'node tests/run-product-suite.js native-ui');
  assert.strictEqual(scripts['test:standalone:native-ui'], 'node tests/test-native-windows-forms.js');
  assert.strictEqual(scripts['posttest:standalone'], 'node tests/test-native-windows-forms.js --status');
  assert.ok(Object.values(scripts).every(script => !script.includes('--allow-native-ui')));
});

done();
