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
    'keyring-pilot', 'pdfium-spike', 'ocr-session-harness']) {
    assert.ok(!runner.includes(`test-${retired}.`), `retired test entered product runner: ${retired}`);
  }
  assert.match(runner, /test-batch-maintenance\.js/u);
});

test('engineering and historical evidence have explicit opt-in scripts', () => {
  assert.match(pkg.scripts['test:engineering'], /test:sea-gates/u);
  assert.match(pkg.scripts['test:engineering'], /test-pdfium-spike/u);
  assert.match(pkg.scripts['test:engineering'], /test-ocr-session-harness/u);
  assert.match(pkg.scripts['test:legacy'], /test:legacy-private/u);
  assert.match(pkg.scripts['test:legacy'], /tests\/legacy\/test-rc63-uat-kit-contract/u);
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

test('future PDF workflows remain manual and explicitly non-release', () => {
  for (const name of ['pdfium-spike.yml', 'pdf-ocr-risk.yml']) {
    const source = workflow(name);
    assert.match(source, /workflow_dispatch/u);
    assert.doesNotMatch(source, /^\s*(?:push|pull_request):/mu);
    assert.match(source, /non-release|Manual research only/iu);
  }
});

done();
