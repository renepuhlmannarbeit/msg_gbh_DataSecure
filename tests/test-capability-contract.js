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
  'docs/PILOT-ABNAHME.md',
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
  assert.deepStrictEqual(current.formats, ['csv', 'docx', 'markdown', 'txt']);
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
    /supported_inputs:\s*\[\s*'Word \(\.docx\)',\s*'Markdown \(\.md\)',\s*'CSV',\s*'TXT'\s*\]/u,
    'privacy_status must expose exactly the released input allowlist'
  );
});

test('runtime, MCP schema, skills and active handbooks retain the 100-file/500-MiB text-format contract', () => {
  const common = read('plugins/data-secure/server/gateway/common.js');
  const batch = read('plugins/data-secure/server/gateway/batch.js');
  const picker = read('plugins/data-secure/server/companion/file-picker.js');
  assert.match(picker, /MAX_SELECTED_SOURCES = LIMITS\.MAX_BATCH_FILES/u);
  assert.match(picker, /LIMITS\.MAX_BATCH_TOTAL_BYTES/u);
  assert.match(common, /PILOT_SUPPORTED=new Set\(\['\.docx','\.txt','\.md','\.markdown','\.csv'\]\)/u);
  const resourceLimits = read('plugins/data-secure/server/resource-limits.js');
  assert.match(resourceLimits, /MAX_BATCH_FILES:\s*100/u);
  assert.match(resourceLimits, /MAX_BATCH_TOTAL_BYTES:\s*500\s*\*\s*MIB/u);
  assert.match(resourceLimits, /MAX_TEXT_CHARS:\s*8_000_000/u);
  assert.match(batch, /expected > LIMITS\.MAX_BATCH_FILES/u);
  for (const rel of currentPublicFiles) {
    const text = read(rel);
    assert.match(text, /100/u, `${rel} omits the current batch maximum`);
    assert.match(text, /500 MiB/u, `${rel} omits the current batch-size limit`);
    assert.match(text, /8\.000\.000/u, `${rel} omits the TXT/Markdown source limit`);
    assert.match(text, /1\.500\.000/u, `${rel} omits the CSV source limit`);
    assert.match(text, /64 MiB/u, `${rel} omits the DOCX source limit`);
    assert.match(text, /TXT/u, `${rel} omits TXT`);
    assert.match(text, /Markdown/u, `${rel} omits Markdown`);
    assert.match(text, /CSV/u, `${rel} omits CSV`);
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

test('the pilot acceptance guide distinguishes active and blocked RC30 formats', () => {
  const pilot = read('docs/PILOT-ABNAHME.md');
  assert.match(pilot, /TXT, Markdown, CSV und vollständig abgedeckte DOCX/u);
  assert.match(pilot, /XLSX, PPTX, eigenständige PNG\/JPEG\/BMP und PDF/u);
  assert.doesNotMatch(pilot, /XLSX,\s*PPTX,\s*MD,\s*CSV/u,
    'the acceptance guide must not list active Markdown/CSV as stop cases');
  assert.match(pilot, /Privacy-Ordner[\s\S]*Output[\s\S]*DataSecure-Export/u,
    'the acceptance guide must expose the permanent mapping-export area');
});

test('the Cowork human test kit preserves the one-picker local-only normal path', () => {
  const readme = read('docs/acceptance/RC30_HUMAN_TEST_KIT/README.md');
  const cases = read('docs/acceptance/RC30_HUMAN_TEST_KIT/TEST_CASES.md');
  assert.match(readme, /eine DataSecure-Entscheidung/u);
  assert.match(readme, /nativen lokalen Mehrfachdialog/u);
  assert.match(readme, /DataSecure-Mapping\.csv/u);
  assert.match(cases, /direkten\s+lokalen Mehrfachdialog/u);
  assert.match(cases, /`local_only`/u);
  assert.match(readme, /macOS Cowork Desktop[\s\S]*BLOCKED/u);
  for (const source of [readme, cases]) {
    assert.doesNotMatch(source, /begin_document_batch|start_document_batch_processing|document_batch_status|list_document_batch_results/u);
    assert.doesNotMatch(source, /in\s+`Input`\s+kopieren/u);
  }
});

test('the target contract is documentation, not a shipped plugin runtime input', () => {
  const pluginBuilder = read('scripts/build-plugin.mjs');
  assert.match(pluginBuilder, /collectFiles\(pluginDir\)/u);
  assert.doesNotMatch(pluginBuilder, /TARGET_CAPABILITIES/u);
  assert.strictEqual(fs.existsSync(path.join(root, 'plugins', 'data-secure', 'TARGET_CAPABILITIES.json')), false);
});

test('the portable OCR adapter is shipped but cannot self-enable coverage', () => {
  const adapter = read('plugins/data-secure/server/portable-ocr.js');
  assert.match(adapter, /manifest\.release_enabled !== true/u);
  assert.match(adapter, /data-secure-ocr-runtime-bundle\/v1/u);
  assert.match(adapter, /bundle_integrity_failed/u);
  const manifest = json('plugins/data-secure/server/ocr-runtime/bundle-manifest.json');
  const provenance = json('plugins/data-secure/server/ocr-runtime.provenance.json');
  assert.strictEqual(manifest.release_enabled, false);
  assert.strictEqual(manifest.schema, 'data-secure-ocr-runtime-bundle/v2');
  assert.strictEqual(provenance.release_enabled, false);
  assert.strictEqual(provenance.bundle_manifest_sha256,
    '1625551004fd0cf663246a2d30f4a4fc8b985ec9fcc733ccf66cd7f03ad443a1');
  assert.strictEqual(current.formats.includes('png'), false);
});

done();
