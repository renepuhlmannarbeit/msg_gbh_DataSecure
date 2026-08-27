'use strict';

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('RC63 UAT kit contract');
const repo = path.resolve(__dirname, '..');
const kit = path.join(repo, 'docs', 'acceptance', 'RC63_UAT_TEST_KIT');
const tools = path.join(repo, 'docs', 'acceptance', 'RC30_HUMAN_TEST_KIT', 'tools');
const read = (file) => fs.readFileSync(file, 'utf8');

function expandedLayout() {
  const layout = JSON.parse(read(path.join(tools, 'fixture-layout.json')));
  assert.strictEqual(layout.schema, 'datasecure-synthetic-acceptance-layout/1');
  const files = new Set();
  const groups = new Map();
  for (const [group, definition] of Object.entries(layout.groups)) {
    const members = [];
    for (const name of definition.files || []) members.push(name);
    if (definition.sequence) {
      const { pattern, count } = definition.sequence;
      assert.ok(Number.isSafeInteger(count) && count > 0 && count <= 100);
      for (let index = 1; index <= count; index++) {
        members.push(pattern.replace('{index:03}', String(index).padStart(3, '0')));
      }
    }
    for (const name of members) files.add(`${group}/${name}`);
    groups.set(group, new Set(members));
  }
  return { files, groups };
}

function parseCsv(file) {
  const result = Papa.parse(read(file), { header: true, skipEmptyLines: true });
  assert.deepStrictEqual(result.errors, []);
  return result.data;
}

test('the machine-readable generator layout expands to exactly 111 inputs', () => {
  const { files, groups } = expandedLayout();
  assert.strictEqual(files.size, 111);
  assert.deepStrictEqual([...groups].map(([name, members]) => [name, members.size]), [
    ['01-positive', 4], ['02-review', 2], ['03-blocked', 5], ['04-batch-100', 100]
  ]);
});

test('README and step-by-step paths resolve against the generator layout', () => {
  const { files, groups } = expandedLayout();
  const documentation = `${read(path.join(kit, 'README.md'))}\n${read(path.join(kit, 'STEP-BY-STEP.md'))}`;
  for (const group of groups.keys()) assert.match(documentation, new RegExp(`inputs/${group}`, 'u'));
  const mentions = [...documentation.matchAll(/inputs\/(0[1-4]-[a-z0-9-]+)(?:\/([a-z0-9.*-]+))?/giu)];
  assert.ok(mentions.length >= 10);
  for (const [, group, name] of mentions) {
    assert.ok(groups.has(group), `unknown input group ${group}`);
    if (name && name !== '*') assert.ok(files.has(`${group}/${name}`), `unknown generated input ${group}/${name}`);
  }
  assert.ok(files.has('04-batch-100/batch-010.txt'));
});

test('EXPECTED_RESULTS uses only generated groups and current fixed blocked codes', () => {
  const { files, groups } = expandedLayout();
  const rows = parseCsv(path.join(kit, 'EXPECTED_RESULTS.csv'));
  assert.strictEqual(rows.length, 6);
  for (const row of rows) {
    const input = row.input_group;
    const group = input.split('/')[0];
    assert.ok(groups.has(group), `unknown expected-results group ${group}`);
    if (input.endsWith('/*')) continue;
    if (input.includes(' bis ')) {
      const [first, last] = input.split(' bis ');
      assert.ok(files.has(first));
      assert.ok(files.has(`${group}/${last}`));
    } else {
      assert.ok(files.has(input));
    }
  }
  const blocked = rows.find((row) => row.test_id === 'UAT-04');
  assert.match(blocked.expected_error_code, /SOURCE_FORMAT_NOT_RELEASED/u);
  assert.match(blocked.expected_error_code, /SOURCE_TYPE_MISMATCH/u);
});

test('evidence rows force the tester to record the actual build and plugin version', () => {
  const rows = parseCsv(path.join(kit, 'EVIDENCE_LOG.csv'));
  assert.strictEqual(rows.length, 6);
  assert.ok(rows.every((row) => row.build_commit === '' && row.plugin_version === ''));
});

test('one documented generator command has pinned prerequisites and verifies its output', () => {
  const generator = read(path.join(tools, 'generate_synthetic_acceptance_data.py'));
  const requirements = read(path.join(tools, 'requirements.txt')).trim();
  const readme = read(path.join(kit, 'README.md'));
  const packageJson = JSON.parse(read(path.join(repo, 'package.json')));
  assert.match(generator, /parser\.add_argument\(\s*"--out"/u);
  assert.match(generator, /LAYOUT_FILE/u);
  assert.match(generator, /verify_output_layout\(\)/u);
  assert.match(requirements, /^python-docx==[0-9]+\.[0-9]+\.[0-9]+$/u);
  assert.ok(packageJson.scripts.fixtures);
  const fixtures = readme.indexOf('npm run fixtures');
  const install = readme.indexOf('python -m pip install -r');
  const generate = readme.indexOf('generate_synthetic_acceptance_data.py --out docs/acceptance/RC63_UAT_TEST_KIT/inputs');
  assert.ok(fixtures >= 0 && fixtures < install && install < generate);
  assert.match(readme, /exakt 111 Dateien/u);
});

done();
