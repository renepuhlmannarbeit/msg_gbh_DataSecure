'use strict';

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Formal N3/N4 UAT contract');
const root = path.resolve(__dirname, '..');
const kit = path.join(root, 'docs', 'acceptance', 'FORMAL_UAT');
const read = (name) => fs.readFileSync(path.join(kit, name), 'utf8');
const productVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const campaignLabel = productVersion.match(/-rc(\d+)$/u)?.[1];
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const release = fs.readFileSync(path.join(root, 'docs', 'RELEASE.md'), 'utf8');

test('formal kit contains the complete two-person campaign contract', () => {
  for (const file of ['README.md', 'N3-N4-CHECKLIST.md', 'GIT-WORKFLOW.md',
    'CAMPAIGN.template.json', 'WINDOWS-EVIDENCE.csv', 'MACOS-EVIDENCE.csv',
    'FREIGABEENTSCHEIDUNG.md']) {
    assert.ok(fs.existsSync(path.join(kit, file)), `${file} missing`);
  }
  const overview = read('README.md');
  assert.match(overview, /eine auf\s+Windows x64 und eine auf einem Mac/u);
  assert.match(overview, /jeweils geprüfte Produkt denselben festgeschriebenen Commit/u);
  assert.match(overview, /Ein einzelner Mac schließt nur seine reale Architektur/u);
  assert.match(overview, /Standalone muss offline funktionieren/u);
  assert.match(overview, /Cowork benötigt Claude Desktop und\s+Internet/u);
  assert.ok(campaignLabel, `release-candidate label missing in ${productVersion}`);
  const boundCandidate = /RC(\d+) ist als gemeinsamer, aber produktgetrennter Vorabkandidat[\s\S]{0,140}?Quellcommit `([0-9a-f]{40})` veröffentlicht/u.exec(release);
  assert.ok(boundCandidate, 'release truth must identify the currently published product candidate');
  assert.match(overview, new RegExp(
    `RC${boundCandidate[1]} ist als technischer Kandidat beider getrennten Produkte[\\s\\S]{0,120}` +
    `\`${boundCandidate[2]}\` gebunden und veröffentlicht`, 'u'));
  if (boundCandidate[1] !== campaignLabel) {
    const macCandidate = /RC(\d+) ist als Standalone-macOS-Vorabkandidat aus Quellcommit\s+`([0-9a-f]{40})` veröffentlicht/u.exec(release);
    if (macCandidate?.[1] === campaignLabel) {
      assert.ok(overview.includes(macCandidate[2]), 'separate Mac candidate must bind its exact source commit');
      assert.ok(overview.includes(`/releases/tag/v${productVersion}`));
      assert.match(overview, /keine gemeinsame Windows-\/Mac-Kampagne/u);
      assert.match(overview, /keine RC\d+-Windows- und RC\d+-Mac-\s+Pakete als denselben Produktcommit zusammenfassen/u);
    } else {
      assert.match(release, new RegExp(`aktuelle Quellstand ist RC${campaignLabel}-Entwicklungsstand`, 'u'));
    }
    assert.match(overview, /historische Kandidaten/u);
  }
  assert.match(overview, /12×3- und 41×3-Modellgates bleiben\s+`NOT_RUN`/u);
  assert.match(overview, /npm run test:version-truth/u);
  assert.match(overview, /S01.S23 einschließlich S14a/u);
  assert.match(overview, /npm run build:cowork-uat-evidence/u);
  assert.match(overview, /Seine 36\s+Zeilen bleiben zunächst\s+`NOT_RUN`/u);
  assert.match(overview, /--candidate-commit <Commit>[\s\S]*--normal-zip[\s\S]*--debug-zip/u);
  assert.match(overview, /expliziten[\s\S]*Cowork-ZIP-Verifizierer/u);
  assert.match(overview, /precondition_result=OBSERVED/u);
  assert.match(overview, /PKG-04 bleibt der separate Standalone-Nachweis/u);
  assert.match(overview, /eingebetteten Runtime-Evidence identischen\s+Quellcommit/u);
  assert.strictEqual(packageJson.scripts['build:cowork-uat-evidence'],
    'node scripts/build-cowork-uat-evidence.mjs');
  assert.ok(fs.existsSync(path.join(root, 'scripts', 'build-cowork-uat-evidence.mjs')));
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
  assert.match(checklist, /DS-098-Kandidaten[\s\S]*Kopf-\/Fußzeilen/u);
  assert.match(checklist, /keine Aussage über PDF-\/PPTX-Randbereiche/u);
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
  assert.strictEqual(campaign.product_version, productVersion);
  assert.strictEqual(campaign.state, 'planned');
  assert.strictEqual(campaign.candidate_commit, '');
  assert.strictEqual(campaign.release_scope.windows_x64, true);
  assert.strictEqual(campaign.release_scope.cowork_plugin, true);
  assert.strictEqual(campaign.release_scope.standalone, false);
  assert.strictEqual(campaign.release_scope.macos_architecture, '');
  assert.strictEqual(campaign.packages.windows.standalone_sha256, '');
  assert.strictEqual(campaign.packages.macos.cowork_plugin_sha256, '');
  assert.deepStrictEqual(new Set(Object.values(campaign.e0_gates)), new Set(['NOT_RUN']));
  assert.deepStrictEqual(campaign.cowork_model_gates, {
    full_matrix_41x3: 'NOT_RUN', candidate_smoke_12x3: 'NOT_RUN'
  });
  assert.strictEqual(campaign.cowork_model_evidence.case_corpus_sha256, '');
  assert.strictEqual(campaign.cowork_model_evidence.candidate_matrix_sha256, '');
  assert.deepStrictEqual(campaign.cowork_model_evidence.models, []);
  assert.strictEqual(campaign.cowork_model_evidence.candidate_smoke_command,
    'npm run uat:cowork-candidate');
});

test('shared repository workflow isolates platform evidence from product code', () => {
  const workflow = read('GIT-WORKFLOW.md');
  assert.ok(campaignLabel, 'the formal campaign workflow requires an RC product version');
  assert.match(workflow, new RegExp(`uat/campaign-rc${campaignLabel}-uat1`, 'u'));
  assert.match(workflow, new RegExp(`uat/windows-rc${campaignLabel}-uat1`, 'u'));
  assert.match(workflow, new RegExp(`uat/macos-rc${campaignLabel}-uat1`, 'u'));
  assert.match(workflow, /git merge-base --is-ancestor <candidate-commit> HEAD/u);
  assert.match(workflow, /ändert nur `WINDOWS-EVIDENCE\.csv`/u);
  assert.match(workflow, /ändert nur `MACOS-EVIDENCE\.csv`/u);
  assert.match(workflow, /Manifest-Commit[\s\S]*nicht der Produktkandidat/u);
  assert.match(workflow, /Product-Fix[\s\S]*neuen\s+Kandidaten/u);
  const decision = read('FREIGABEENTSCHEIDUNG.md');
  assert.match(decision, /keine offenen P0\/P1-Defects/u);
  assert.match(decision, /Modellabnahme 41×3:[\s\S]*NOT_RUN/u);
  assert.match(decision, /Kandidatensmoke 12×3:[\s\S]*NOT_RUN/u);
  assert.match(decision, /beide\s+Modellgates `PASS`/u);
});

done();
