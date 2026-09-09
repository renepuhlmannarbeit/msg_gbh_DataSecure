'use strict';

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Formal N3/N4 UAT contract');
const root = path.resolve(__dirname, '..');
const kit = path.join(root, 'docs', 'acceptance', 'FORMAL_UAT');
const read = (name) => fs.readFileSync(path.join(kit, name), 'utf8');

test('formal kit contains the complete two-person campaign contract', () => {
  for (const file of ['README.md', 'N3-N4-CHECKLIST.md', 'GIT-WORKFLOW.md',
    'CAMPAIGN.template.json', 'WINDOWS-EVIDENCE.csv', 'MACOS-EVIDENCE.csv',
    'FREIGABEENTSCHEIDUNG.md']) {
    assert.ok(fs.existsSync(path.join(kit, file)), `${file} missing`);
  }
  const overview = read('README.md');
  assert.match(overview, /eine auf\s+Windows x64 und eine auf einem Mac/u);
  assert.match(overview, /denselben festgeschriebenen Commit/u);
  assert.match(overview, /Ein einzelner Mac schließt nur seine reale Architektur/u);
  assert.match(overview, /Standalone muss offline funktionieren/u);
  assert.match(overview, /Cowork benötigt Claude Desktop und\s+Internet/u);
});

test('N3 and N4 have ten and eight named executable checks', () => {
  const checklist = read('N3-N4-CHECKLIST.md');
  for (let index = 1; index <= 10; index++) {
    assert.match(checklist, new RegExp(`\\| N3-${String(index).padStart(2, '0')} \\|`));
  }
  for (let index = 1; index <= 8; index++) {
    assert.match(checklist, new RegExp(`\\| N4-${String(index).padStart(2, '0')} \\|`));
  }
  assert.match(checklist, /200-Dateien-Lauf/u);
  assert.match(checklist, /500-MiB/u);
  assert.match(checklist, /Narrator beziehungsweise VoiceOver/u);
});

test('platform evidence files are disjoint and start as NOT_RUN', () => {
  for (const [file, platform] of [['WINDOWS-EVIDENCE.csv', 'Windows'],
    ['MACOS-EVIDENCE.csv', 'macOS']]) {
    const parsed = Papa.parse(read(file), { header: true, skipEmptyLines: true });
    assert.deepStrictEqual(parsed.errors, []);
    assert.strictEqual(parsed.data.length, 34);
    assert.deepStrictEqual(new Set(parsed.data.map((row) => row.platform)), new Set([platform]));
    assert.deepStrictEqual(new Set(parsed.data.map((row) => row.result)), new Set(['NOT_RUN']));
    assert.strictEqual(parsed.data.filter((row) => row.stage === 'N3').length, 18);
    assert.strictEqual(parsed.data.filter((row) => row.stage === 'N4').length, 16);
    assert.deepStrictEqual(new Set(parsed.data.map((row) => row.product)),
      new Set(['standalone', 'cowork-plugin']));
    for (const product of ['standalone', 'cowork-plugin']) {
      const rows = parsed.data.filter((row) => row.product === product);
      for (let index = 1; index <= 8; index++) {
        const id = `N4-${String(index).padStart(2, '0')}`;
        assert.ok(rows.some((row) => row.test_id === id), `${file}: ${product} misses ${id}`);
      }
    }
    assert.ok(!parsed.data.some((row) => row.product === 'cowork-plugin' && row.test_id === 'N3-03'));
    assert.ok(!parsed.data.some((row) => row.product === 'standalone' && row.test_id === 'N3-04'));
    for (const row of parsed.data) {
      for (const column of ['candidate_commit', 'artifact_name', 'artifact_sha256',
        'defect_id', 'content_free_observation', 'tester_role', 'date_utc']) {
        assert.ok(Object.hasOwn(row, column), `${file}: ${column} missing`);
      }
    }
  }
});

test('campaign template cannot be mistaken for completed evidence', () => {
  const campaign = JSON.parse(read('CAMPAIGN.template.json'));
  assert.strictEqual(campaign.schema, 'datasecure-formal-uat-campaign/1');
  assert.strictEqual(campaign.state, 'planned');
  assert.strictEqual(campaign.candidate_commit, '');
  assert.strictEqual(campaign.release_scope.windows_x64, true);
  assert.strictEqual(campaign.release_scope.macos_architecture, '');
  assert.strictEqual(campaign.packages.windows.standalone_sha256, '');
  assert.strictEqual(campaign.packages.macos.cowork_plugin_sha256, '');
  assert.deepStrictEqual(new Set(Object.values(campaign.e0_gates)), new Set(['NOT_RUN']));
});

test('shared repository workflow isolates platform evidence from product code', () => {
  const workflow = read('GIT-WORKFLOW.md');
  assert.match(workflow, /uat\/windows-rc125-uat1/u);
  assert.match(workflow, /uat\/macos-rc125-uat1/u);
  assert.match(workflow, /Keine Produktdateien ändern/u);
  assert.match(workflow, /Product-Fix[\s\S]*neuen\s+Kandidaten/u);
  assert.match(read('FREIGABEENTSCHEIDUNG.md'), /keine offenen P0\/P1-Defects/u);
});

done();
