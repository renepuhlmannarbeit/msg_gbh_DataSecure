'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Current and target capability contracts');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

const current = json('BUILD_INFO.json');
const targetPath = 'docs/canonical/TARGET_CAPABILITIES.json';
const target = json(targetPath);
const decisions = read('docs/canonical/DECISIONS.md');
const runtimeFiles = [
  'plugins/data-secure/server/index.js',
  'plugins/data-secure/server/gateway/common.js',
  'plugins/data-secure/server/gateway/batch.js',
  'plugins/data-secure/server/gateway/orchestrator.js',
  'plugins/data-secure/server/runtime.js'
];
const currentPublicFiles = [
  'README.md',
  'docs/ANLEITUNG.md',
  'docs/IT-BETRIEBSHANDBUCH.md',
  'plugins/data-secure/skills/gbh-datasecure-dokument-anonymisieren/SKILL.md',
  'plugins/data-secure/skills/gbh-datasecure-datenschutz-erklaeren/SKILL.md'
];

test('the target contract is explicitly non-runtime and covers every accepted decision', () => {
  assert.strictEqual(target.schema_version, 1);
  assert.strictEqual(target.contract, 'target-only-not-runtime');
  const accepted = [...decisions.matchAll(/^## (DS-\d{3})\b/gm)].map((match) => match[1]);
  assert.deepStrictEqual(target.decision_ids, accepted);
});

test('the target contract records the agreed platforms, formats and limits exactly', () => {
  assert.deepStrictEqual(target.platforms, ['windows', 'macos', 'linux']);
  assert.deepStrictEqual(target.formats.map((format) => format.id), [
    'txt', 'markdown', 'docx', 'pdf', 'xlsx', 'pptx', 'csv', 'png', 'jpeg', 'bmp'
  ]);
  assert.strictEqual(target.batch.maximum_files, 100);
  assert.strictEqual(target.batch.maximum_total_bytes, 500 * 1024 * 1024);
  assert.strictEqual(target.batch.maximum_pages_slides_or_sheets, null);
  assert.strictEqual(target.batch.maximum_active_batches, 1);
  assert.deepStrictEqual(target.distribution.equivalent_primary_channels, ['zip', 'private-marketplace']);
  assert.deepStrictEqual(target.manual_runtime_installation, []);
});

test('the released capability manifest remains the narrow RC30 allowlist', () => {
  assert.deepStrictEqual(current.formats, ['docx', 'txt']);
  assert.deepStrictEqual(current.blocked_formats, ['pdf']);
  assert.match(current.status, /^release-candidate$/);
  assert.notDeepStrictEqual(current.formats, target.formats.map((format) => format.id));
});

test('runtime modules cannot import or expose the target contract as current state', () => {
  for (const rel of runtimeFiles) {
    const source = read(rel);
    assert.doesNotMatch(source, /TARGET_CAPABILITIES|target-only-not-runtime/u, `${rel} imports the target contract`);
  }
  const status = read('plugins/data-secure/server/gateway/status.js');
  assert.match(
    status,
    /supported_inputs:\s*\[\s*'Word \(\.docx\)',\s*'TXT'\s*\]/u,
    'privacy_status must expose exactly the released input allowlist'
  );
});

test('runtime, MCP schema, skills and active handbooks retain the 25-file TXT/DOCX contract', () => {
  const index = read('plugins/data-secure/server/index.js');
  const common = read('plugins/data-secure/server/gateway/common.js');
  const batch = read('plugins/data-secure/server/gateway/batch.js');
  assert.match(index, /maximum:25/u);
  assert.match(common, /PILOT_SUPPORTED=new Set\(\['\.docx','\.txt'\]\)/u);
  assert.match(batch, /expected > 25/u);
  for (const rel of currentPublicFiles) {
    const text = read(rel);
    assert.match(text, /25/u, `${rel} omits the current batch maximum`);
    assert.match(text, /TXT/u, `${rel} omits TXT`);
    assert.match(text, /DOCX/u, `${rel} omits DOCX`);
  }
});

test('marketplace and plugin manifests promise only the released formats', () => {
  const marketplace = json('.claude-plugin/marketplace.json');
  const plugin = json('plugins/data-secure/.claude-plugin/plugin.json');
  const entry = marketplace.plugins.find((candidate) => candidate.name === plugin.name);
  assert.ok(entry);
  for (const description of [entry.description, plugin.description]) {
    assert.match(description, /TXT/u);
    assert.match(description, /DOCX/u);
    assert.doesNotMatch(description, /PDF|XLSX|PPTX|PNG|JPEG|BMP/u);
  }
});

test('the target contract is documentation, not a shipped plugin runtime input', () => {
  const pluginBuilder = read('scripts/build-plugin.mjs');
  assert.match(pluginBuilder, /collectFiles\(pluginDir\)/u);
  assert.doesNotMatch(pluginBuilder, /TARGET_CAPABILITIES/u);
  assert.strictEqual(fs.existsSync(path.join(root, 'plugins', 'data-secure', 'TARGET_CAPABILITIES.json')), false);
});

done();
