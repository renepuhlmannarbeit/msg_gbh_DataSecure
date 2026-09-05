'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Current documentation contract');
const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const userDocs = [
  'README.md',
  'docs/ANLEITUNG.md',
  'docs/ANWENDERREVIEW.md',
  'docs/PILOT-ABNAHME.md',
  'plugins/data-secure/README.md'
];
const activeDocs = [
  ...userDocs,
  'docs/IT-BETRIEBSHANDBUCH.md',
  'docs/PLUGIN_SECURITY_MODEL.md',
  'docs/FORMAT_COVERAGE_MATRIX.md',
  'docs/REVIEW_CLAUDE_COWORK_2026-09-01.md',
  'docs/RELEASE.md',
  'docs/TESTING.md',
  'docs/canonical/PRODUCT.md',
  'docs/canonical/CURRENT_STATE.md',
  'docs/canonical/BACKLOG.md'
];

const versionedDocs = [
  'README.md',
  'docs/ANLEITUNG.md',
  'docs/FORMAT_COVERAGE_MATRIX.md',
  'docs/IT-BETRIEBSHANDBUCH.md',
  'docs/PLUGIN_SECURITY_MODEL.md',
  'docs/RELEASE.md',
  'docs/TESTING.md',
  'docs/canonical/CURRENT_STATE.md',
  'docs/canonical/BACKLOG.md',
  'docs/canonical/PRODUCT.md',
  'docs/canonical/TRACEABILITY.md',
  'plugins/data-secure/README.md'
];

test('active user documentation has no obsolete RC or internal product path', () => {
  const text = userDocs.map(read).join('\n');
  for (const file of userDocs) {
    const header = read(file).split(/\r?\n/u).slice(0, 8).join('\n');
    assert.doesNotMatch(header, /\bRC(?:30|34|37|44|57|63|66|68|80|81|82|83)\b/u,
      `${file} has an obsolete current-version header`);
  }
  assert.doesNotMatch(text, /\bMCPB\b|\.mcpb\b|remove_images|visual_mode/u);
  assert.match(text, /Plugin-ZIP/u);
  assert.match(text, /Marketplace/u);
});

test('every current release header matches the package version', () => {
  const version = JSON.parse(read('package.json')).version;
  const match = /^(\d+\.\d+\.\d+)-rc(\d+)$/iu.exec(version);
  const label = match ? `${match[1]} RC${match[2]}` : version;
  const stateLabel = match ? `Ist-Zustand RC${match[2]}` : `Ist-Zustand ${version}`;
  for (const file of versionedDocs) {
    const header = read(file).split(/\r?\n/u).slice(0, 8).join('\n');
    assert.ok(header.includes(version) || header.includes(label) ||
      (file === 'docs/canonical/PRODUCT.md' && header.includes(stateLabel)),
      `${file} does not carry current version ${version}`);
  }
});

test('DS-067 deletion and retention wording is present across active contracts', () => {
  const text = activeDocs.map(read).join('\n');
  assert.match(text, /0[–-]14 Tage/u);
  assert.match(text, /Quellen\/Originale[^\n]{0,120}niemals automatisch (?:verändert oder )?gelöscht/u);
  assert.match(text, /fertige (?:Outputs, )?Exporte[^\n]{0,120}niemals automatisch gelöscht/u);
  assert.match(text, /kein auswählbarer Bildmodus/u);
  assert.match(text, /Bildpixel bleiben lokal/u);
  assert.doesNotMatch(text, /automatisch(?:e|en|er)? Löschung (?:von )?(?:Output|Export|Original)|Ordner-Original.*gelöscht/u);
});

test('build metadata describes current product channels and complete blocked formats', () => {
  const info = JSON.parse(read('BUILD_INFO.json'));
  const pkg = JSON.parse(read('package.json'));
  assert.strictEqual(info.version, pkg.version);
  assert.strictEqual(info.build_date, '2026-09-03');
  assert.match(info.target, /Plugin ZIP \/ private Marketplace/u);
  assert.doesNotMatch(info.target + info.runtime, /MCPB|built-in Node/u);
  assert.deepStrictEqual(new Set(info.formats), new Set(['txt', 'markdown', 'csv', 'docx']));
  assert.deepStrictEqual(new Set(info.blocked_formats), new Set(['xlsx', 'pptx', 'pdf', 'scan-pdf', 'png', 'jpeg', 'bmp']));
});

test('product build and engineering artefacts are separate scripts', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.build, /build:plugin/u);
  assert.doesNotMatch(pkg.scripts.build, /build:mcpb|test:mcpb|engineering-keyring/u);
  assert.match(pkg.scripts['build:engineering'], /build:mcpb/u);
  assert.strictEqual(pkg.scripts['test:artifacts'], 'npm run test:plugin-zip');
});

test('MCP protocol stays host-negotiated without a fictional cutover', () => {
  const decisions = read('docs/canonical/DECISIONS.md');
  const current = read('docs/canonical/CURRENT_STATE.md');
  const backlog = read('docs/canonical/BACKLOG.md');
  const trace = read('docs/canonical/TRACEABILITY.md');
  const capabilities = JSON.parse(read('docs/canonical/TARGET_CAPABILITIES.json'));

  assert.match(decisions, /`MCP26-01` ist kein offizieller\s+MCP-Protokollbezeichner/u);
  assert.match(decisions, /hostgesteuerte\s+Versionsaushandlung/u);
  assert.match(current, /`2026-07-28` über `server\/discover`/u);
  assert.match(backlog, /offiziellen MCP-Conformance-Prüfung/u);
  assert.match(trace, /\| DS-081 \| aktiv und aktuell \|/u);
  assert.ok(capabilities.decision_ids.includes('DS-081'));
});

test('distribution docs require a self-contained relative marketplace source without signing promises', () => {
  const release = read('docs/RELEASE.md');
  const readme = read('README.md');
  const currentState = read('docs/canonical/CURRENT_STATE.md');
  const decisions = read('docs/canonical/DECISIONS.md');
  const vision = read('docs/canonical/PRODUCT_VISION.md');
  const productContract = `${readme}\n${release}\n${decisions}\n${vision}`;

  assert.match(productContract, /relativ[^\n]{0,100}self-contained Plugin-Ordner/iu);
  assert.match(release, /`archive`, `npm` und `command`[\s\S]{0,140}nicht unterstützt/iu);
  assert.match(release, /dist\/marketplace-repo/iu);
  assert.match(currentState, /streng validierbare,[\s\S]{0,120}Marketplace-Projektion/iu);
  assert.doesNotMatch(currentState, /Platzhalter-URL|Marketplace-Projektion mit Archivquelle/iu);
  assert.doesNotMatch(currentState, /selbsttragende\s+Marketplace-Projektion bleibt offene Arbeit/iu);
  assert.match(`${decisions}\n${vision}`, /Windows-x64[^\n]{0,160}macOS-x64[^\n]{0,80}macOS-arm64/iu);
  assert.doesNotMatch(`${decisions}\n${vision}`, /macOS-universal/iu);
  assert.doesNotMatch(`${decisions}\n${vision}`,
    /müssen vor breitem Unternehmenseinsatz signiert|Signierungspflicht|Signierungs- und Lifecycle-Evidenz/iu);
});

test('security and third-party notices match the current product boundary', () => {
  const security = read('SECURITY.md');
  const notices = read('THIRD_PARTY_NOTICES.md');
  const ocr = JSON.parse(read('plugins/data-secure/server/ocr-runtime/bundle-manifest.json'));
  const status = JSON.parse(read('plugins/data-secure/server/status-app/bundled-dependencies.json'));

  assert.match(security, /Image pixels remain local/u);
  assert.match(security, /no user- or model-controlled\s+visual-release path/u);
  assert.match(security, /MCPB\s+is an internal engineering artefact/u);
  assert.doesNotMatch(security, /Every CI build publishes the plugin ZIP and MCPB/u);

  assert.strictEqual(ocr.release_enabled, false);
  assert.match(notices, /release_enabled: false/u);
  assert.match(notices, /Der Produktbuild schließt den Baum aus/u);
  assert.match(notices, /PDF, Scan-PDF und eigenständige Bilder bleiben\s+gesperrt/u);
  for (const component of ocr.components) {
    assert.ok(notices.includes(`\`${component.name}\` ${component.version}`),
      `third-party notice missing ${component.name} ${component.version}`);
  }
  for (const component of status.dependencies) {
    assert.ok(notices.includes(`\`${component.name}\` ${component.version}`),
      `third-party notice missing ${component.name} ${component.version}`);
  }
});

test('legacy companion, legal and architecture notes live only in the archive', () => {
  const active = ['ARCHITECTURE_DECISION.md', 'docs/COMPANION_API_V1.md',
    'docs/COMPANION_IPC_V1.md', 'docs/AI_ACT_AND_GDPR.md',
    'docs/PRODUCT_ARCHITECTURE_DECISION.md', 'docs/PLUGIN_TARGET_ARCHITECTURE.md',
    'docs/PDF_ENGINE_DECISION.md', 'docs/PDFIUM_SPIKE_EVIDENCE.md',
    'docs/PII_SHIELD_BENCHMARK.md'];
  for (const file of active) assert.strictEqual(fs.existsSync(path.join(root, file)), false,
    `${file} must not remain in active documentation`);
  const archive = 'docs/archive/2026-09/retired-active-docs';
  for (const file of ['ARCHITECTURE_DECISION_LEGACY.md', 'COMPANION_API_V1_LEGACY.md',
    'COMPANION_IPC_V1_LEGACY.md', 'AI_ACT_AND_GDPR_LEGACY.md']) {
    assert.strictEqual(fs.existsSync(path.join(root, archive, file)), true, `${file} missing from archive`);
  }
});

test('canonical register distinguishes active, no-go, and superseded contracts', () => {
  const register = read('docs/canonical/DOCUMENT_REGISTER.md');
  assert.match(register, /nicht\s+pauschal ein Satz aktuell erfüllter Produktverträge/u);
  assert.match(register, /aktuelle Produkt- und Sicherheitsgrenzen/u);
  assert.match(register, /Ziel-\/NO-GO-Verträge ohne aktuelle Produktfreigabe/u);
  assert.match(register, /historisch oder superseded/u);
  for (const file of ['BATCH_SECRET_STORE_V1_LEGACY.md', 'PRIVATE_ARTIFACT_ENCRYPTION_V1_LEGACY.md']) {
    assert.match(register, new RegExp(file.replace('.', '\\.')));
    assert.strictEqual(fs.existsSync(path.join(root, 'docs/canonical/contracts', file.replace('_LEGACY', ''))), false);
    assert.strictEqual(fs.existsSync(path.join(root, 'docs/archive/2026-09/retired-active-docs', file)), true);
  }
});

done();
