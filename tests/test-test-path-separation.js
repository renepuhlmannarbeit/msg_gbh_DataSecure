'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Product, engineering and legacy test-path separation');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const runner = fs.readFileSync(path.join(__dirname, 'run-product-suite.js'), 'utf8');
const workflow = (name) => fs.readFileSync(path.join(root, '.github', 'workflows', name), 'utf8');

function relativeJsonModules(source) {
  // Literal module dependencies are required inputs, unlike JSON output paths
  // a test deliberately creates or asserts absent. This supplements the
  // existing path.join script check; it is not a general JavaScript parser.
  const pattern = /\b(?:require|import)\s*\(\s*(['"])(\.\.?\/[^'"\r\n]+\.json)\1(?=\s*[,\)])|\bfrom\s*(['"])(\.\.?\/[^'"\r\n]+\.json)\3/gu;
  return [...source.matchAll(pattern)].map(match => match[2] || match[4]);
}

test('literal JSON module scanning includes ignored regression data, not package names or runtime output paths', () => {
  const ignored = './fixtures/ignored-regression.json';
  const source = [
    'require' + '(' + JSON.stringify(ignored) + ')',
    'import' + '(' + JSON.stringify('../lib/second.json') + ')',
    'import data from ' + JSON.stringify('./lib/third.json'),
    'export { default } from ' + JSON.stringify('./lib/fourth.json'),
    'import' + ' (' + JSON.stringify('./lib/options.json') + ', { with: { type: "json" } })',
    'require' + '(' + JSON.stringify('third-party/package.json') + ')',
    'path.join' + '(__dirname, ' + JSON.stringify('runtime-output.json') + ')'
  ].join('\n');
  assert.deepStrictEqual(relativeJsonModules(source),
    [ignored, '../lib/second.json', './lib/third.json', './lib/fourth.json', './lib/options.json']);
});

test('resource-bound sidecar and Office cases use their explicitly separated source and native gates', () => {
  const suite = require('./run-product-suite');
  const sidecar = 'tests/test-standalone-sidecar.js';
  assert.deepStrictEqual(suite.argumentsForFile('ci', sidecar), ['--source-only']);
  for (const profile of ['headless', 'full', 'native-ui']) assert.deepStrictEqual(suite.argumentsForFile(profile, sidecar), []);
  const office = 'tests/test-office-image-ocr.mjs';
  for (const profile of ['ci', 'headless', 'full', 'native-ui']) assert.deepStrictEqual(suite.argumentsForFile(profile, office), ['--source-only']);
  for (const file of suite.baseFiles.filter(file => file !== sidecar && file !== office)) assert.deepStrictEqual(suite.argumentsForFile('ci', file), []);
  const source = fs.readFileSync(path.join(root, sidecar), 'utf8');
  assert.match(source, /NOT_RUN in source-only CI/u);
  assert.match(source, /if \(!sourceOnly\)/u);
  for (const file of ['test-standalone-terminal-failures.js', 'test-standalone-document-control.js',
    'test-standalone-document-review.js', 'test-standalone-pause.js', 'test-standalone-entities.js', 'test-standalone-run-entities.js']) {
    assert.match(fs.readFileSync(path.join(__dirname, file), 'utf8'), /fs\.realpathSync\.native\(os\.tmpdir\(\)\)/u,
      `${file} must use the native canonical spelling without weakening the product path guard`);
  }
});

test('default and CI aliases enter only the canonical product runner', () => {
  assert.strictEqual(pkg.scripts.test, 'npm run test:product');
  assert.strictEqual(pkg.scripts['test:ci'], 'npm run test:product:ci');
  assert.strictEqual(pkg.scripts['test:product'], 'node tests/run-product-suite.js full');
  assert.strictEqual(pkg.scripts['test:product:ci'], 'node tests/run-product-suite.js ci');
  for (const retired of ['private-artifact-crypto', 'installation-secret-store',
    'batch-pseudonym-context', 'batch-secret-store', 'keyring-pilot',
    'pdfium-spike', 'ocr-session-harness']) {
    assert.ok(!runner.includes(`test-${retired}.`), `retired test entered product runner: ${retired}`);
  }
  assert.match(runner, /test-batch-maintenance\.js/u);
});

test('PDF visibility uses the real native conversion gate on both Mac targets, not a source-only mock', () => {
  assert.ok(pkg.scripts['test:standalone:conversion'].includes('node tests/test-pdf-text-visibility.mjs &&'));
  assert.ok(!require('./run-product-suite').baseFiles.includes('tests/test-pdf-text-visibility.mjs'));
  assert.ok(workflow('standalone-macos-sandbox.yml').includes('npm run test:standalone:conversion'));
});

test('engineering and historical evidence have explicit opt-in scripts', () => {
  assert.match(pkg.scripts['test:engineering'], /test:sea-gates/u);
  assert.match(pkg.scripts['test:engineering'], /test-pdfium-spike/u);
  assert.match(pkg.scripts['test:engineering'], /test-ocr-session-harness/u);
  assert.match(pkg.scripts['test:legacy'], /tests\/legacy\/test-rc63-uat-kit-contract/u);
  assert.strictEqual(pkg.scripts['test:legacy-private'], undefined);
  assert.strictEqual(pkg.scripts['test:engineering-keyring'], undefined);
});

test('golden verification is read-only and regeneration stays explicitly opt-in', () => {
  assert.strictEqual(pkg.scripts['test:golden'],
    'node tests/make-fixtures.js && node tests/test-pii-regression.js');
  assert.strictEqual(pkg.scripts['update:golden'],
    'node tests/make-fixtures.js && node tests/test-pii-regression.js --update');
  assert.doesNotMatch(pkg.scripts['test:golden'], /--update/u);
  assert.ok(require('./run-product-suite').baseFiles.includes('tests/test-complex-docx-uat-corpus.mjs'));
});

test('native conversion resources are required by PKG-04, not silently added to cost-capped source CI', () => {
  const suite = require('./run-product-suite');
  const nativeTest = 'test-standalone-conversion-worker.mjs';
  assert.ok(![...suite.baseFiles.map(file => path.basename(file)), ...suite.ciFiles, ...suite.fullOnly].includes(nativeTest));
  assert.strictEqual(pkg.scripts['test:standalone:conversion'], `node tests/test-pdf-text-visibility.mjs && node tests/${nativeTest} && node tests/test-office-image-ocr.mjs && node tests/test-office-visual-decoder.mjs`);
  assert.ok(!suite.executionPlan('headless').headlessFiles.includes('tests/test-office-visual-decoder.mjs'));
  const pkg04 = fs.readFileSync(path.join(root, 'scripts/run-pkg-04.ps1'), 'utf8');
  assert.ok(pkg04.indexOf("@('run', 'test:standalone:conversion')") < pkg04.indexOf("foreach ($label"));
  assert.match(pkg04, /Invoke-Checked 'npm.cmd' @\('run', 'test:standalone:conversion'\)/u);
});

test('standalone package source contracts run in every product gate as well as the target gate', () => {
  const suite = require('./run-product-suite');
  assert.ok(suite.baseFiles.includes('tests/test-standalone-package.js'));
  assert.match(pkg.scripts['test:standalone'], /node tests\/test-standalone-package\.js(?: &&|$)/u);
});

test('targeted export snapshot and diagnostic countercases run in source and both native Mac consumer gates', () => {
  const suite = require('./run-product-suite');
  const files = ['tests/test-standalone-target-export-race.js', 'tests/test-standalone-target-export-snapshot.js',
    'tests/lib/standalone-history-read-observer-cases.cjs'];
  const mac = workflow('standalone-macos-sandbox.yml');
  for (const file of files) {
    assert.ok(suite.baseFiles.includes(file), `${file} must not become dead evidence`);
    assert.ok(mac.includes(`node ${file}\n`), `${file} must execute on each actual Mac consumer`);
  }
});

test('fast documentation validation cannot trigger SEA, apps or Claude CLI', () => {
  assert.strictEqual(pkg.scripts['test:docs'], 'npm run test:docs:fast');
  assert.doesNotMatch(pkg.scripts['test:docs:fast'], /sea|status-app|claude-local/iu);
  assert.match(pkg.scripts['test:docs:extended'], /test:sea-gates/u);
  assert.match(pkg.scripts['test:docs:extended'], /test:status-app/u);
});

test('automatic and release workflows use their bounded gates and publish no MCPB', () => {
  const automatic = workflow('ci.yml');
  assert.match(automatic, /npm run test:docs/u);
  assert.match(automatic, /npm run test:product:ci/u);
  assert.match(automatic, /steps\.scope\.outputs\.run_docs/u);
  assert.match(automatic, /steps\.scope\.outputs\.run_product/u);
  const release = workflow('release-evidence.yml');
  assert.match(release, /npm run test:product:ci/u);
  assert.doesNotMatch(release, /\.mcpb/u);
  assert.ok(!fs.existsSync(path.join(root, '.github', 'workflows', 'keyring-pilot.yml')));
  assert.ok(fs.existsSync(path.join(root, '.github', 'workflow-archive', 'keyring-pilot.yml')));
});

test('the single automatic job covers standalone-only changes through fail-safe classification', () => {
  const ci = workflow('ci.yml');
  const { classifyChangePaths } = require('../scripts/classify-ci-scope');
  assert.doesNotMatch(ci, /^    paths(?:-ignore)?:$/m);
  assert.deepStrictEqual(classifyChangePaths(['apps/datasecure-standalone/frontend/app.js']),
    { profile: 'product', run_docs: false, run_product: true });
  assert.match(ci, /timeout-minutes: 10/u);
  assert.match(runner, /tests\/test-test-harness\.js/u);
});

test('the product runner lists are disjoint, so no file runs twice in one profile', () => {
  // baseFiles run in every profile, ciFiles in ci and full, fullOnly in full
  // only. A file listed in two lists (as test-workflow-diagnostics.js,
  // test-completion-summary.js, test-retention.js, test-pii-regression.js,
  // test-mapping.js and test-mapping-outbox.js once were) runs twice per full
  // run and adds minutes without evidence.
  const suite = require('./run-product-suite');
  assert.deepStrictEqual(suite.duplicateEntries(), []);
  const all = [...suite.baseFiles.map((file) => file.replace(/^tests\//u, '')), ...suite.ciFiles, ...suite.fullOnly];
  assert.strictEqual(new Set(all).size, all.length, 'no test file may appear in more than one runner list');
  for (const list of [suite.ciFiles, suite.fullOnly]) {
    assert.ok(list.every((file) => !file.includes('/')), 'ciFiles and fullOnly hold bare names under tests/');
  }
});

test('every current product test is reachable through an npm script or the product runner', () => {
  // A test that no script and no runner ever executes is dead evidence. It
  // silently rots (the former tests/test-architecture-contracts.js asserted a
  // build-script symbol that no longer exists) while the canon still cites it.
  const referenced = new Set();
  for (const match of runner.matchAll(/'(?:tests\/)?(test-[A-Za-z0-9.-]+\.(?:js|mjs))'/gu)) referenced.add(match[1]);
  for (const script of Object.values(pkg.scripts)) {
    for (const match of script.matchAll(/tests\/(test-[A-Za-z0-9.-]+\.(?:js|mjs))/gu)) referenced.add(match[1]);
  }
  const present = fs.readdirSync(__dirname).filter((name) => /^test-.*\.(?:js|mjs)$/u.test(name));
  // Manual, host-bound or argument-driven probes are documented exceptions.
  const manual = new Set(['test-visual.js', 'test-windows-visual.js', 'test-bundled-runtime-smoke.mjs',
    'test-ocr-runtime-bundle.mjs', 'test-ocr-runtime-smoke.mjs']);
  const orphaned = present.filter((name) => !referenced.has(name) && !manual.has(name));
  assert.deepStrictEqual(orphaned, [], `tests referenced by no npm script or runner: ${orphaned.join(', ')}`);
});

test('the native lease-finish probe is reachable only with an explicit artifact and trusted runtime digest', () => {
  const suite = require('./run-product-suite');
  const args = ['explicit-build-manifest.json', 'a'.repeat(64)];
  for (const platform of ['win32', 'darwin']) {
    const plan = suite.artifactBoundPlan('native-lease-finish', args, platform);
    assert.deepStrictEqual(plan, { file: 'tests/test-native-executor-lease-finish.js', args });
    assert.notStrictEqual(plan.args, args, 'the plan must not retain mutable caller arguments');
  }
  for (const invalid of [[], ['manifest'], ['', args[1]], ['x\0y', args[1]], ['manifest', 'bad'], [...args, 'extra']]) {
    assert.throws(() => suite.artifactBoundPlan('native-lease-finish', invalid, 'win32'), /NATIVE_ARTIFACT_ARGUMENT_INVALID/);
  }
  assert.throws(() => suite.artifactBoundPlan('native-lease-finish', args, 'linux'), /NATIVE_ARTIFACT_ARGUMENT_INVALID/);
  for (const profile of ['ci', 'headless']) {
    assert.ok(!suite.executionPlan(profile).headlessFiles.includes(suite.artifactBoundFiles['native-lease-finish']));
  }
});


test('Windows processing admission is an explicit artifact-bound probe, never source CI or Darwin evidence', () => {
  const suite = require('./run-product-suite');
  const args = ['explicit-current-guard-build.json', 'b'.repeat(64)];
  const file = 'tests/test-native-processing-admission.js';
  assert.strictEqual(suite.artifactBoundFiles['native-processing-admission'], file);
  const plan = suite.artifactBoundPlan('native-processing-admission', args, 'win32');
  assert.deepStrictEqual(plan, { file, args });
  assert.notStrictEqual(plan.args, args);
  assert.notStrictEqual(file, suite.artifactBoundFiles['native-lease-finish']);
  for (const platform of ['darwin', 'linux', 'freebsd']) {
    assert.throws(() => suite.artifactBoundPlan('native-processing-admission', args, platform), /NATIVE_ARTIFACT_ARGUMENT_INVALID/);
  }
  for (const invalid of [[], ['manifest'], ['', args[1]], ['  ', args[1]], ['x\0y', args[1]],
    ['manifest', 'bad'], ['manifest', 'B'.repeat(64)], [...args, 'extra']]) {
    assert.throws(() => suite.artifactBoundPlan('native-processing-admission', invalid, 'win32'), /NATIVE_ARTIFACT_ARGUMENT_INVALID/);
  }
  for (const profile of ['ci', 'headless', 'full', 'native-ui']) {
    const flags = ['full', 'native-ui'].includes(profile) ? ['--allow-native-ui'] : [];
    const normal = suite.executionPlan(profile, flags, 'win32');
    assert.ok(!normal.headlessFiles.includes(file) && !normal.nativeFiles.includes(file),
      'native artifact probe must never be auto-scheduled in an ordinary profile');
  }
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.doesNotMatch(source, /[a-f0-9]{64}/u, 'no fixed release/source/Node digest inside the native test');
  assert.doesNotMatch(source, /dist[\\/]/u, 'no abandoned Dist artifact dependency');
  assert.match(source, /process\.argv\[3\]/u, 'trusted runtime digest stays explicit');
  assert.match(source, /manifest\.source_sha256, report\.native_source_sha256/u,
    'actual checkout C source must bind to the explicit build manifest');
  assert.match(source, /darwin_evidence: false/u);
});

test('every addressed project script and literal JSON module exists and is tracked by Git', () => {
  // tests/fixtures/ is ignored wholesale, so a helper forked from there never
  // reaches a clone and its test dies with a generic exit code instead of
  // proving anything. Test sources belong in tests/lib/ or tests/helpers/.
  const childProcess = require('child_process');
  const joinPattern = /path\.join\(\s*(__dirname|root)\s*((?:,\s*'[^'\n]+'\s*)+)\)/gu;
  const repoRootDeclaration = /^const root = path\.resolve\(__dirname, '\.\.'\);$/mu;
  const scripts = new Map();
  const collect = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'fixtures') collect(full); continue; }
      if (!/\.(?:js|mjs|cjs)$/u.test(entry.name)) continue;
      const source = fs.readFileSync(full, 'utf8');
      const rootIsRepository = repoRootDeclaration.test(source);
      for (const modulePath of relativeJsonModules(source)) {
        const target = path.resolve(path.dirname(full), modulePath);
        const relative = path.relative(root, target).split(path.sep).join('/');
        if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
        if (!scripts.has(relative)) scripts.set(relative, new Set());
        scripts.get(relative).add(path.relative(root, full).split(path.sep).join('/'));
      }
      joinPattern.lastIndex = 0;
      let match;
      while ((match = joinPattern.exec(source)) !== null) {
        if (match[1] === 'root' && !rootIsRepository) continue;
        const segments = [...match[2].matchAll(/'([^'\n]+)'/gu)].map((part) => part[1]);
        if (!/\.(?:js|mjs|cjs)$/u.test(segments.at(-1))) continue;
        const target = path.resolve(match[1] === 'root' ? root : path.dirname(full), ...segments);
        const relative = path.relative(root, target).split(path.sep).join('/');
        if (relative.startsWith('..')) continue;
        if (!scripts.has(relative)) scripts.set(relative, new Set());
        scripts.get(relative).add(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  collect(__dirname);
  assert.ok(scripts.size >= 20, `path-referenced script scan collected only ${scripts.size} entries`);
  assert.ok(scripts.has('tests/lib/crash-batch-worker.js'), 'the detached crash worker must stay a path-referenced, tracked test helper');
  assert.ok(scripts.has('tests/lib/standalone-unsafe-canonical-pre-fix.json'),
    'the frozen pre-fix regression must participate in source tracking, not only exist locally');
  let gitAvailable = true;
  try { childProcess.execFileSync('git', ['rev-parse', '--git-dir'], { cwd: root, stdio: 'ignore' }); }
  catch { gitAvailable = false; }
  function verifyResource(relative, by) {
    assert.ok(fs.existsSync(path.join(root, relative)), `${relative} is addressed by ${by} but missing`);
    if (!gitAvailable) return;
    let tracked = true;
    try { childProcess.execFileSync('git', ['ls-files', '--error-unmatch', '--', relative], { cwd: root, stdio: 'ignore' }); }
    catch { tracked = false; }
    assert.ok(tracked, `${relative} is addressed by ${by} but not tracked by Git`);
  }
  for (const [relative, referees] of scripts) verifyResource(relative, [...referees].sort().join(', '));
  if (gitAvailable) {
    // The old ignored copy may exist in a developer checkout, but never in a
    // clean clone. Both states must refuse it as a required source dependency.
    assert.throws(() => verifyResource('tests/fixtures/standalone-unsafe-canonical-pre-fix.json', 'synthetic ignored JSON countercase'),
      /but missing|but not tracked by Git/u);
  }
});

test('future PDF workflows remain manual and explicitly non-release', () => {
  for (const name of ['pdfium-spike.yml', 'pdf-ocr-risk.yml']) {
    const source = workflow(name);
    assert.match(source, /workflow_dispatch/u);
    assert.doesNotMatch(source, /^\s*(?:push|pull_request):/mu);
    assert.match(source, /non-release|Manual research only/iu);
  }
});

done();
