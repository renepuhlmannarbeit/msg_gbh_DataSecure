'use strict';

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Current UAT kit contract');
const root = path.resolve(__dirname, '..');
const kit = path.join(root, 'docs', 'acceptance', 'UAT_TEST_KIT');
const layoutFile = path.join(kit, 'tools', 'fixture-layout.json');
const read = (file) => fs.readFileSync(file, 'utf8');
const parseCsv = (name) => {
  const result = Papa.parse(read(path.join(kit, name)), { header: true, skipEmptyLines: true });
  assert.deepStrictEqual(result.errors, []);
  return result.data;
};

function expandedLayout() {
  const layout = JSON.parse(read(layoutFile));
  const files = new Set();
  for (const [group, definition] of Object.entries(layout.groups)) {
    for (const name of definition.files || []) files.add(`${group}/${name}`);
    if (definition.sequence) {
      for (let index = 1; index <= definition.sequence.count; index++) {
        files.add(`${group}/${definition.sequence.pattern.replace('{index:03}', String(index).padStart(3, '0'))}`);
      }
    }
  }
  return files;
}

test('version-neutral UAT kit has one named catalog entry per case', () => {
  const catalog = read(path.join(kit, 'CASE_CATALOG.md'));
  const steps = read(path.join(kit, 'STEP-BY-STEP.md'));
  for (let index = 1; index <= 6; index++) {
    const id = `UAT-${String(index).padStart(2, '0')}`;
    assert.match(catalog, new RegExp(`^## ${id}$`, 'mu'));
    assert.match(steps, new RegExp(`^## ${id} – .+`, 'mu'));
  }
  assert.doesNotMatch(steps, /^## UAT-\d{2}\s*$/gmu);
  assert.doesNotMatch(`${catalog}\n${steps}`, /\bD03\b|\bM-0[1-6]\b/u);
});

test('CSV rows carry human names and valid instruction anchors', () => {
  const steps = read(path.join(kit, 'STEP-BY-STEP.md')).toLowerCase();
  for (const file of ['EXPECTED_RESULTS.csv', 'EVIDENCE_LOG.csv']) {
    const rows = parseCsv(file);
    assert.strictEqual(rows.length, 6);
    for (const row of rows) {
      assert.match(row.test_id, /^UAT-0[1-6]$/u);
      assert.ok(row.test_name.length >= 20);
      assert.match(row.instructions_anchor, /^STEP-BY-STEP\.md#uat-0[1-6]--/u);
      const anchor = row.instructions_anchor.split('#')[1];
      assert.ok(steps.includes(anchor.replaceAll('-', ' ')) ||
        steps.includes(row.test_id.toLowerCase()), `missing instructions for ${row.test_id}`);
    }
  }
});

test('fixture layout remains exactly 111 synthetic files', () => {
  const files = expandedLayout();
  assert.strictEqual(files.size, 111);
  assert.ok(files.has('01-positive/personnel-profile.docx'));
  assert.ok(files.has('02-review/personnel-profile-with-image.docx'));
  assert.ok(files.has('03-blocked/blocked-text.pdf'));
  assert.ok(files.has('04-batch-100/batch-100.txt'));
});

test('current fixture command targets the current kit', () => {
  const pkg = JSON.parse(read(path.join(root, 'package.json')));
  assert.match(pkg.scripts['uat:fixtures'], /UAT_TEST_KIT[\\/]tools[\\/]generate-synthetic-uat-fixtures\.js/u);
  assert.doesNotMatch(pkg.scripts['uat:fixtures'], /python|RC30|RC63/iu);
  assert.match(pkg.scripts['test:uat-fixtures'], /test-uat-fixture-generation\.js/u);
});

test('review and blocked cases have exact user-facing rules', () => {
  const steps = read(path.join(kit, 'STEP-BY-STEP.md'));
  assert.match(steps, /PASS nur, wenn das Bild-DOCX \*\*entweder\*\*/u);
  assert.match(steps, /mehrdeutige Datei bis zur lokalen Entscheidung kein Ergebnis/u);
  assert.match(steps, /Details für IT:/u);
  assert.match(steps, /Ein anderer[\s\S]*fail-closed\s+Code ist kein automatisches FAIL/u);
});

test('release GO is strict and UAT-04/05 are executable through the product UI', () => {
  const readme = read(path.join(kit, 'README.md'));
  const steps = read(path.join(kit, 'STEP-BY-STEP.md'));
  assert.match(readme, /alle sechs Fälle als `PASS` auf jedem freizugebenden/u);
  assert.match(readme, /Marketplace[\s\S]*Installieren, Aktualisieren und Zurückrollen/u);
  assert.match(readme, /test:batch-500mb-local/u);
  // The Windows file dialog accepts a typed name with another extension; the
  // executable PASS rule is "not offered in the filter, and a forced hand-over
  // stops safely without a result" (reviewer A-09).
  assert.match(steps, /vier gesperrte Formate werden im Produktpicker nicht angeboten/u);
  assert.match(steps, /erzwungene Auswahl, die\s+sicher stoppt, ist kein FAIL/u);
  assert.match(steps, /nur `malformed\.docx` auswählen/u);
  assert.match(steps, /Sobald \*\*„Der Auftrag wurde lokal übergeben\.“\*\*/u);
  assert.doesNotMatch(steps, /mindestens UAT-01 und UAT-02/u);
  const evidence = parseCsv('EVIDENCE_LOG.csv');
  for (const row of evidence) {
    for (const column of ['distribution_channel', 'install_lifecycle', 'keyboard_operable',
      'labels_understandable', 'retention_preserves_sources']) {
      assert.ok(Object.hasOwn(row, column), `${column} missing for ${row.test_id}`);
    }
  }
});

done();
