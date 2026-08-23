'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('GitHub Actions cost budget');
const root = path.join(__dirname, '..');
const workflowDir = path.join(root, '.github', 'workflows');
const workflows = new Map(
  fs.readdirSync(workflowDir)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort()
    .map((name) => [name, fs.readFileSync(path.join(workflowDir, name), 'utf8')])
);

function automaticTriggers(source) {
  return [...source.matchAll(/^  (push|pull_request|schedule):/gm)].map((match) => match[1]);
}

test('exactly one workflow can start automatically', () => {
  const automatic = [...workflows]
    .filter(([, source]) => automaticTriggers(source).length > 0)
    .map(([name]) => name);
  assert.deepStrictEqual(automatic, ['ci.yml']);
});

test('automatic CI is one bounded Ubuntu job without a matrix or artifacts', () => {
  const ci = workflows.get('ci.yml');
  assert.ok(ci);
  assert.strictEqual((ci.match(/^    runs-on:/gm) || []).length, 1);
  assert.match(ci, /^    runs-on: ubuntu-latest$/m);
  assert.match(ci, /^    timeout-minutes: 10$/m);
  assert.doesNotMatch(ci, /^\s+matrix:/m);
  assert.doesNotMatch(ci, /actions\/upload-artifact/);
});

test('automatic CI ignores documentation outside canonical product contracts', () => {
  const ci = workflows.get('ci.yml');
  assert.match(ci, /^    paths:$/m);
  assert.match(ci, /'docs\/canonical\/\*\*'/);
  assert.doesNotMatch(ci, /'docs\/\*\*'/);
});

test('duplicate runs are cancelled and permissions stay read-only', () => {
  const ci = workflows.get('ci.yml');
  assert.match(ci, /^  cancel-in-progress: true$/m);
  assert.match(ci, /^  contents: read$/m);
});

test('native, platform, OCR, packaging and security workflows stay manual', () => {
  for (const [name, source] of workflows) {
    if (name === 'ci.yml') continue;
    assert.match(source, /^  workflow_dispatch:/m, `${name} must be manually dispatched`);
    assert.deepStrictEqual(automaticTriggers(source), [], `${name} must have no automatic trigger`);
  }
});

test('costly platform workflows default to one Linux target and assemble only on explicit all', () => {
  for (const name of ['sea-launcher-pilot.yml', 'tesseractjs-ocr-pilot.yml']) {
    const source = workflows.get(name);
    assert.ok(source, `${name} is missing`);
    assert.match(source, /^        default: linux-x64$/m, `${name} must default to one low-cost target`);
    assert.match(source, /^          - all$/m, `${name} must retain an explicit full-evidence option`);
    assert.match(source, /matrix: \$\{\{ fromJSON\(needs\.select-target\.outputs\.matrix\) \}\}/u,
      `${name} must create runners only for the selected platform target`);
    assert.match(source, /case "\$\{\{ inputs\.target \}\}" in/u,
      `${name} must select its matrix from the explicit manual input`);
    assert.match(source, /if: \$\{\{ inputs\.target == 'all' \}\}/u,
      `${name} must not assemble a universal artifact from incomplete evidence`);
  }
});

test('manual security evidence can be selected instead of always running three jobs', () => {
  const security = workflows.get('security.yml');
  for (const scope of ['javascript', 'native', 'secrets', 'all']) {
    assert.match(security, new RegExp(`^          - ${scope}$`, 'm'));
  }
  assert.strictEqual((security.match(/^    if: \$\{\{ inputs\.scope/gm) || []).length, 3);
});

test('locked development tools do not become product runtime dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.ok(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0);
  assert.ok(Object.keys(pkg.devDependencies || {}).length > 0);
  assert.deepStrictEqual(lock.packages[''].devDependencies, pkg.devDependencies);
  assert.ok(!lock.packages[''].dependencies);
});

done();
