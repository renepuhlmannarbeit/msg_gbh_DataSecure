'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Product, engineering and legacy test-path separation');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const runner = fs.readFileSync(path.join(__dirname, 'run-product-suite.js'), 'utf8');
const workflow = (name) => fs.readFileSync(path.join(root, '.github', 'workflows', name), 'utf8');

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

test('engineering and historical evidence have explicit opt-in scripts', () => {
  assert.match(pkg.scripts['test:engineering'], /test:sea-gates/u);
  assert.match(pkg.scripts['test:engineering'], /test-pdfium-spike/u);
  assert.match(pkg.scripts['test:engineering'], /test-ocr-session-harness/u);
  assert.match(pkg.scripts['test:legacy'], /tests\/legacy\/test-rc63-uat-kit-contract/u);
  assert.strictEqual(pkg.scripts['test:legacy-private'], undefined);
  assert.strictEqual(pkg.scripts['test:engineering-keyring'], undefined);
});

test('native conversion resources are required by PKG-04, not silently added to cost-capped source CI', () => {
  const suite = require('./run-product-suite');
  const nativeTest = 'test-standalone-conversion-worker.mjs';
  assert.ok(![...suite.baseFiles.map(file => path.basename(file)), ...suite.ciFiles, ...suite.fullOnly].includes(nativeTest));
  assert.strictEqual(pkg.scripts['test:standalone:conversion'], `node tests/${nativeTest}`);
  const pkg04 = fs.readFileSync(path.join(root, 'scripts/run-pkg-04.ps1'), 'utf8');
  assert.ok(pkg04.indexOf("@('run', 'test:standalone:conversion')") < pkg04.indexOf("foreach ($label"));
  assert.match(pkg04, /Invoke-Checked 'npm.cmd' @\('run', 'test:standalone:conversion'\)/u);
});

test('fast documentation validation cannot trigger SEA, apps or Claude CLI', () => {
  assert.strictEqual(pkg.scripts['test:docs'], 'npm run test:docs:fast');
  assert.doesNotMatch(pkg.scripts['test:docs:fast'], /sea|status-app|claude-local/iu);
  assert.match(pkg.scripts['test:docs:extended'], /test:sea-gates/u);
  assert.match(pkg.scripts['test:docs:extended'], /test:status-app/u);
});

test('automatic and release workflows use product gates and publish no MCPB', () => {
  assert.match(workflow('ci.yml'), /npm run test:product:ci/u);
  const release = workflow('release-evidence.yml');
  assert.match(release, /npm run test:product:ci/u);
  assert.doesNotMatch(release, /\.mcpb/u);
  assert.ok(!fs.existsSync(path.join(root, '.github', 'workflows', 'keyring-pilot.yml')));
  assert.ok(fs.existsSync(path.join(root, '.github', 'workflow-archive', 'keyring-pilot.yml')));
});

test('both automatic event filters include standalone-only changes without extra jobs', () => {
  const ci = workflow('ci.yml');
  assert.equal((ci.match(/- 'apps\/datasecure-standalone\/\*\*'/gu) || []).length, 2);
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

test('every project script a test addresses by path exists and is tracked by Git', () => {
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
  let gitAvailable = true;
  try { childProcess.execFileSync('git', ['rev-parse', '--git-dir'], { cwd: root, stdio: 'ignore' }); }
  catch { gitAvailable = false; }
  for (const [relative, referees] of scripts) {
    const by = [...referees].sort().join(', ');
    assert.ok(fs.existsSync(path.join(root, relative)), `${relative} is addressed by ${by} but missing`);
    if (!gitAvailable) continue;
    let tracked = true;
    try { childProcess.execFileSync('git', ['ls-files', '--error-unmatch', '--', relative], { cwd: root, stdio: 'ignore' }); }
    catch { tracked = false; }
    assert.ok(tracked, `${relative} is addressed by ${by} but not tracked by Git`);
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
