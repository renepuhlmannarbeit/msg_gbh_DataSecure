'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Current documentation links');
const root = path.resolve(__dirname, '..');

const files = [
  'README.md',
  'SECURITY.md',
  'THIRD_PARTY_NOTICES.md',
  'docs/ANLEITUNG.md',
  'docs/ANWENDERREVIEW.md',
  'docs/PILOT-ABNAHME.md',
  'docs/IT-BETRIEBSHANDBUCH.md',
  'docs/PLUGIN_SECURITY_MODEL.md',
  'docs/FORMAT_COVERAGE_MATRIX.md',
  'docs/RELEASE.md',
  'docs/TESTING.md',
  'docs/REVIEW_CLAUDE_COWORK_2026-09-01.md',
  'docs/canonical/README.md',
  'docs/canonical/DECISIONS.md',
  'docs/canonical/PRODUCT_VISION.md',
  'docs/canonical/PRODUCT.md',
  'docs/canonical/TARGET_ARCHITECTURE.md',
  'docs/canonical/REFACTORING_PLAN.md',
  'docs/canonical/DOCUMENT_REGISTER.md',
  'docs/canonical/CURRENT_STATE.md',
  'docs/canonical/BACKLOG.md',
  'docs/canonical/TRACEABILITY.md',
  'docs/canonical/BACKLOG_EVIDENCE_MATRIX.md',
  'docs/canonical/OPEN_SOURCE_COMPONENTS.md',
  'docs/acceptance/UAT_TEST_KIT/README.md',
  'docs/acceptance/UAT_TEST_KIT/CASE_CATALOG.md',
  'docs/acceptance/UAT_TEST_KIT/STEP-BY-STEP.md',
  'plugins/data-secure/README.md',
  'plugins/data-secure/BUILDING.md',
  'plugins/data-secure/server/README.md',
  'tasks/README.md',
  'tasks/CLAUDE-CODE-AUFTRAG-AKTUELLER-GESAMTREVIEW.md',
  'evals/plugin-eval/README.md'
];

function localTargets(file) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  return [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)]
    .map((match) => match[1].trim().replace(/^<|>$/gu, ''))
    .filter((target) => target && !/^(?:https?:|mailto:|#)/u.test(target))
    .map((target) => target.split('#')[0])
    .filter(Boolean)
    .map((target) => decodeURIComponent(target));
}

test('all current documentation files exist', () => {
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(root, file)), `missing current document: ${file}`);
  }
});

test('all local links in current documentation resolve', () => {
  for (const file of files) {
    const base = path.dirname(path.join(root, file));
    for (const target of localTargets(file)) {
      assert.ok(fs.existsSync(path.resolve(base, target)), `${file} -> ${target}`);
    }
  }
});

done();
