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

test('automatic CI cannot skip a new path before the fail-safe classifier runs', () => {
  const ci = workflows.get('ci.yml');
  assert.doesNotMatch(ci, /^    paths(?:-ignore)?:$/m);
  assert.match(ci, /^  push:\n    branches: \[main\]$/m);
  assert.match(ci, /^  pull_request:\n    branches: \[main\]$/m);
});

test('automatic CI selects documentation, product or mixed gates fail-safely', () => {
  const ci = workflows.get('ci.yml');
  const classifier = require('../scripts/classify-ci-scope');
  assert.deepStrictEqual(classifier.parseNulSeparated(Buffer.from('docs/a.md\0plugins/line\nname.js\0')),
    ['docs/a.md', 'plugins/line\nname.js']);
  assert.deepStrictEqual(classifier.classifyChangePaths(['README.md', 'docs/TESTING.md']),
    { profile: 'docs', run_docs: true, run_product: false });
  assert.deepStrictEqual(classifier.classifyChangePaths(['plugins/data-secure/server/index.js']),
    { profile: 'product', run_docs: false, run_product: true });
  assert.deepStrictEqual(classifier.classifyChangePaths(['docs/TESTING.md', 'plugins/data-secure/server/index.js']),
    { profile: 'mixed', run_docs: true, run_product: true });
  assert.deepStrictEqual(classifier.classifyChangePaths([]),
    { profile: 'mixed', run_docs: true, run_product: true });
  assert.deepStrictEqual(classifier.classifyChangePaths(['docs\\RELEASE.md']),
    { profile: 'docs', run_docs: true, run_product: false });
  assert.deepStrictEqual(classifier.classifyChangePaths(['CLAUDE.md', 'tasks/review.md', '.claude/agents/reviewer.md']),
    { profile: 'docs', run_docs: true, run_product: false });
  assert.match(ci, /fetch-depth: 0/u);
  assert.match(ci, /git diff --no-renames --name-only -z/u);
  assert.match(ci, /node scripts\/classify-ci-scope\.js --fallback/u);
  assert.match(ci, /if: \$\{\{ steps\.scope\.outputs\.run_docs == 'true' \}\}/u);
  assert.match(ci, /if: \$\{\{ steps\.scope\.outputs\.run_product == 'true' \}\}/u);
  assert.match(ci, /npm run test:docs/u);
  assert.match(ci, /npm run test:product:ci/u);
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

test('Cowork all-target release emits three uploadable platform ZIPs and no oversized universal ZIP', () => {
  const source = workflows.get('bundled-runtime-release.yml');
  assert.ok(source);
  assert.match(source, /for id in windows-x64 macos-x64 macos-arm64/u);
  assert.doesNotMatch(source, /build-runtime-plugin\.mjs --runtimes dist\/runtime-all --target universal/u);
  assert.doesNotMatch(source, /universal Marketplace archive/u);
});

test('manual Cowork packaging defaults to one lower-cost target and keeps intermediates briefly', () => {
  const source = workflows.get('bundled-runtime-release.yml');
  assert.match(source, /^        default: windows-x64$/m);
  assert.match(source, /name: datasecure-runtime-\$\{\{ matrix\.id \}\}-\$\{\{ github\.sha \}\}[\s\S]*?retention-days: 1/u);
  assert.match(source, /^          - all$/m);
});

test('line-ending guard excludes only the byte-inventoried vendored OCR runtime', () => {
  const ci = workflows.get('ci.yml');
  assert.match(ci, /':\(exclude\)plugins\/data-secure\/server\/ocr-runtime\/node_modules\/\*\*'/u);
  assert.doesNotMatch(ci, /':\(exclude\)plugins\/data-secure\/server\/ocr-runtime\/\*\*'/u);
  assert.match(ci, /git grep --cached -Il \$'\\r'/u);
});

test('manual security evidence can be selected instead of always running three jobs', () => {
  const security = workflows.get('security.yml');
  for (const scope of ['javascript', 'native', 'secrets', 'all']) {
    assert.match(security, new RegExp(`^          - ${scope}$`, 'm'));
  }
  assert.strictEqual((security.match(/^    if: \$\{\{ inputs\.scope/gm) || []).length, 3);
});

test('secret history exceptions bind only three reviewed synthetic historical findings', () => {
  const source = fs.readFileSync(path.join(root, '.gitleaksignore'), 'utf8');
  const fingerprints = source.split(/\r?\n/u).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  assert.deepStrictEqual(fingerprints, [
    '22f5b781d676691f09e906d2ac76c045624179db:tests/test-pii-regression.js:generic-api-key:1279',
    '5dcc2dd10bd75262aefaa572461368dc4de54874:tasks/AUFTRAG-CODEX-RC123-REDAKTIONSKERN.md:generic-api-key:371',
    'af3f0c7dcd0d1c63626422f2d2324383ec74b374:tests/test-batch-processing-orchestrator.js:generic-api-key:11'
  ]);
  const security = workflows.get('security.yml');
  assert.match(security, /fetch-depth: 0/u);
  assert.match(security, /--log-opts="--all"/u);
  assert.match(security, /--redact=100/u);
  assert.doesNotMatch(security, /--exit-code=0|continue-on-error: true/u);
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
