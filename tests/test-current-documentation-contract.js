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

test('the Cowork release candidate does not imply a same-version Standalone package', () => {
  const release = read('docs/RELEASE.md');
  assert.match(release, /Ein Standalone-Paket desselben\s+RC-Stands ist damit nicht behauptet/u);
  assert.doesNotMatch(release, /Ein RC\d+-Standalone-Paket ist\s+damit nicht behauptet/u);
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
  assert.strictEqual(info.build_date, '2026-09-07');
  assert.match(info.target, /Plugin ZIP \/ private Marketplace/u);
  assert.doesNotMatch(info.target + info.runtime, /MCPB|built-in Node/u);
  assert.deepStrictEqual(new Set(info.formats), new Set(['txt', 'markdown', 'csv', 'docx', 'xlsx', 'pptx']));
  assert.deepStrictEqual(new Set(info.blocked_formats), new Set(['pdf', 'scan-pdf', 'png', 'jpeg', 'bmp']));
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
  assert.match(release, /alle drei getrennten Ziel-ZIPs/u);
  assert.doesNotMatch(release, /universelle Marketplace-Projektion/iu);
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
  assert.match(notices, /Der Plugin-Produktbuild schließt den Baum\s+aus/u);
  assert.match(notices, /PDF, Scan-PDF und eigenständige Bilder bleiben im Anonymisierungs-\/Cowork-\s+Pfad gesperrt/u);
  assert.match(notices, /server\/standalone\/conversion-runtime/u);
  for (const [name, version] of [['pdfjs-dist', '6.2.108'], ['@napi-rs/canvas', '1.0.7'],
    ['tesseract.js', '7.0.0'], ['tesseract.js-core', '7.0.0']]) {
    assert.ok(notices.includes(`\`${name}\` ${version}`), `conversion notice missing ${name} ${version}`);
  }
  assert.match(notices, /weder MarkItDown noch Python ist eine\s+Voraussetzung/u);
  assert.match(notices, /RUNTIME\.json/u);
  assert.match(notices, /models\/LICENSE/u);
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

test('machine document index covers the active document register and current Cowork decision', () => {
  const index = JSON.parse(read('docs/canonical/DOCUMENT_INDEX.json'));
  assert.strictEqual(index.schema, 'datasecure-document-index/1');
  assert.strictEqual(index.validated_at, '2026-09-09');
  const byPath = new Map(index.documents.map((entry) => [entry.path, entry]));
  const activePaths = [
    'docs/canonical/DOCUMENT_REGISTER.md',
    'docs/canonical/HOST_MATRIX_V1.md',
    'docs/canonical/RUNTIME_START_MATRIX_V1.json',
    'docs/canonical/STATUS_APP_PILOT_V1.md',
    'README.md',
    'SECURITY.md',
    'docs/RELEASE.md',
    'docs/TESTING.md',
    'docs/PILOT-ABNAHME.md',
    'docs/IT-BETRIEBSHANDBUCH.md',
    'docs/FORMAT_COVERAGE_MATRIX.md',
    'docs/DETECTOR_BENCHMARK.md',
    'docs/acceptance/UAT_TEST_KIT/README.md',
    'docs/acceptance/STANDALONE_UAT_TEST_KIT/README.md',
    'docs/acceptance/FORMAL_UAT/README.md',
    'docs/canonical/ACCEPTANCE_LEVELS.md',
    'plugins/data-secure/README.md',
    'plugins/data-secure/server/README.md',
    'apps/datasecure-standalone/README.md'
  ];
  for (const documentPath of activePaths) {
    const entry = byPath.get(documentPath);
    assert.ok(entry, `${documentPath} is missing from DOCUMENT_INDEX.json`);
    assert.strictEqual(entry.status, 'active', `${documentPath} must be active`);
    assert.ok(fs.existsSync(path.join(root, documentPath)), `${documentPath} does not exist`);
  }
  for (const documentPath of ['docs/canonical/DECISIONS.md', 'docs/canonical/TARGET_ARCHITECTURE.md',
    'docs/canonical/CURRENT_STATE.md', 'docs/canonical/BACKLOG.md',
    'docs/canonical/TRACEABILITY.md', 'docs/canonical/TARGET_CAPABILITIES.json']) {
    assert.ok(byPath.get(documentPath)?.decisions.includes('DS-093'),
      `${documentPath} must be indexed against DS-093`);
  }
});

test('Standalone retains both implemented purposes while target-host UAT stays explicit', () => {
  const target = JSON.parse(read('docs/canonical/TARGET_CAPABILITIES.json'));
  assert.deepStrictEqual(target.standalone_desktop.core_functions,
    ['markdown-and-anonymize', 'markdown-only']);
  assert.strictEqual(target.standalone_desktop.markdown_only_release_status, 'implemented-target-uat-open');
  assert.strictEqual(target.standalone_desktop.markdown_only_output_subdirectory, 'DataSecure-Markdown');
  assert.strictEqual(target.standalone_desktop.markdown_only_preserves_identifiers, true);
  assert.strictEqual(target.standalone_desktop.markdown_only_automatic_ai_upload, false);
  for (const file of ['PRODUCT_VISION.md', 'PRODUCT.md', 'STANDALONE_ARCHITECTURE.md', 'BACKLOG.md', 'UML_ARCHITECTURE.md']) {
    const text = read(`docs/canonical/${file}`);
    assert.ok(text.includes('DS-085'), `${file} must bind the accepted second core function`);
    assert.match(text, /DataSecure-Markdown/u, `${file} must separate raw conversion outputs`);
  }
  assert.ok(target.decision_ids.includes('DS-084'));
  assert.strictEqual(target.processing.cowork_and_existing_v1_pseudonyms, 'hmac-v1-unchanged');
  for (const file of ['apps/datasecure-standalone/START-WINDOWS.md',
    'docs/acceptance/STANDALONE_UAT_TEST_KIT/README.md']) {
    const instructions = read(file);
    assert.match(instructions, /Nur in Markdown umwandeln/u, file);
    assert.match(instructions, /\*\*Starten\*\*/u, file);
    assert.match(instructions, /DataSecure-Markdown/u, file);
    assert.match(instructions, /Scan-PDF/u, file);
    assert.doesNotMatch(instructions, /Nur in Markdown umwandeln[^\n]*(?:deaktiviert|noch in Entwicklung)/u, file);
  }
});

test('main README gives direct Windows and macOS Standalone installation paths', () => {
  const readme = read('README.md');
  const version = JSON.parse(read('package.json')).version;
  for (const value of [
    `DataSecure-Standalone-${version}-windows-x64.zip`,
    `DataSecure-Standalone-${version}-macos-x64.zip`,
    `DataSecure-Standalone-${version}-macos-arm64.zip`,
    'DataSecure Standalone.exe',
    'DataSecure Standalone.app'
  ]) assert.ok(readme.includes(value), value);
  assert.match(readme, /weder Claude noch Cowork, Node\.js, Python oder\s+Rust/u);
  assert.match(readme, /Systemeinstellungen →\s+Datenschutz & Sicherheit/u);
});

test('Cowork opens only its latest completed run and preserves the Standalone product boundary', () => {
  const target = JSON.parse(read('docs/canonical/TARGET_CAPABILITIES.json'));
  assert.ok(target.decision_ids.includes('DS-092'));
  assert.strictEqual(target.output.cowork_open_results,
    'latest-cowork-batch-only-no-stale-fallback');
  for (const file of ['CURRENT_STATE.md', 'BACKLOG.md', 'DECISIONS.md',
    'TARGET_ARCHITECTURE.md', 'TRACEABILITY.md']) {
    const text = read(`docs/canonical/${file}`);
    assert.match(text, /DS-092/u, `${file} must bind the Cowork parity decision`);
    assert.match(text, /(?:kein|nie|niemals)/iu, `${file} must reject fallback`);
    assert.match(text, /(?:ältere[nr]?|Alt-)/iu, `${file} must name stale results`);
  }
  const skill = read('plugins/data-secure/skills/gbh-datasecure-dokument-anonymisieren/SKILL.md');
  assert.match(skill, /exakten Ergebnisordner des aktuellsten Cowork-Laufs/u);
  assert.match(skill, /Meldung mit .*Ergebnisse öffnen/u);
  const architecture = read('docs/canonical/TARGET_ARCHITECTURE.md');
  assert.match(architecture, /50 MB/u);
  assert.match(architecture, /Standalone-Konverter-\/OCR-Runtime/u);
});

test('Cowork start wording is identical in runtime, skill, examples and UAT', () => {
  const runtime = path.join(root, 'plugins', 'data-secure', 'server');
  const { LOCAL_INTAKE_ACCEPTED_TEXT } = require(path.join(runtime, 'prompt-contract.js'));
  const { INSTRUCTIONS } = require(path.join(runtime, 'mcp-instructions.js'));
  const normalize = (value) => value.replace(/\s+/gu, ' ').trim();
  const contracts = [
    INSTRUCTIONS,
    read('plugins/data-secure/skills/gbh-datasecure-dokument-anonymisieren/SKILL.md'),
    read('plugins/data-secure/skills/gbh-datasecure-dokument-anonymisieren/references/beispiele.md'),
    read('docs/acceptance/UAT_TEST_KIT/STEP-BY-STEP.md')
  ];
  for (const contract of contracts) {
    assert.ok(normalize(contract).includes(LOCAL_INTAKE_ACCEPTED_TEXT),
      'Cowork contract must contain the exact canonical local-intake response');
  }
  assert.doesNotMatch(contracts.join('\n'), /zeigt nach Abschluss den Ergebnisordner an/u);
});

test('conversion documentation separates eleven input types, Markdown-first wide privacy and old package evidence', () => {
  const coverage = read('docs/FORMAT_COVERAGE_MATRIX.md');
  const current = read('docs/canonical/CURRENT_STATE.md');
  assert.doesNotMatch(current, /XLSX und PPTX bleiben für die Anonymisierung\s+gesperrt/iu);
  assert.doesNotMatch(current, /Cowork sperrt XLSX\/PPTX/iu);
  assert.match(current, /Cowork nimmt XLSX\/PPTX nach DS-093 an/iu);
  assert.match(coverage, /RC111-Builds aus `b543589f3250a6ab57ddd5bc3a144f03a24ee026`/u,
    'current format evidence must name the exact RC111 source commit');
  assert.match(coverage, /6086d1eb0701c50b77be630bdbcce3d562fab391e92aa5d0bdfeea1eba869f8f/u,
    'current format evidence must name the bound RC111 package hash');
  assert.match(coverage, /RC109-Builds aus\s+`6bf7d05747e151ba8f846849229495e9fca4c041`/u,
    'the replaced RC109 evidence must remain explicitly historical');
  assert.match(coverage, /RC108-Builds aus\s+`a742333e8ef80b445729d4bede6a91a2b8f13207`/u,
    'a version bump must not relabel historical commit-bound package evidence');
  const parts = coverage.split('## Reine Markdown-Konvertierung: nur Standalone');
  assert.strictEqual(parts.length, 2);
  assert.match(parts[0], /markdown-and-anonymize/u);
  assert.match(parts[0], /sechs\s+Formate/u);
  for (const label of ['XLSX', 'PPTX']) {
    const row = parts[0].split(/\r?\n/u).find(line => line.startsWith(`| ${label} |`));
    assert.ok(row && /Markdown-Extraktion wird anonymisiert/u.test(row) && /wird anonymisiert/u.test(row),
      `${label}: Cowork and Standalone anonymize only extracted Markdown`);
  }
  for (const label of ['PDF / Scan-PDF', 'PNG, JPEG, BMP']) {
    const row = parts[0].split(/\r?\n/u).find(line => line.startsWith(`| ${label} |`));
    assert.ok(row && row.includes('| gesperrt |') && /wird anonymisiert/u.test(row),
      `${label}: Cowork stays blocked while Standalone anonymizes extracted Markdown`);
  }
  const conversion = parts[1].split('## Plattform- und Nachweisstatus')[0];
  const rows = conversion.split(/\r?\n/u).filter(line => /^\| (?:TXT|Markdown|CSV|DOCX|XLSX|PPTX|PDF mit Text|Scan-PDF|PNG|JPEG|BMP)(?: | \()/u.test(line));
  assert.strictEqual(rows.length, 11, 'eleven product input types, not eleven file extensions');
  for (const term of ['nicht anonymisiert', 'incomplete', 'OCR_NOT_VERIFIED', 'OCR_TEXT_EMPTY',
    'SOURCE_COVERAGE_UNVERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED', 'DataSecure-Markdown',
    'DataSecure-Output', 'Quellbasisname', 'Zuordnungsdatei wird nicht erzeugt',
    'keine Privacy-Lesecapability']) {
    assert.ok(conversion.includes(term), `conversion coverage must explain ${term}`);
  }
  assert.match(conversion, /MarkItDown\/Python ist nur ein optionales\s+Differentialorakel/u);
  for (const file of ['docs/canonical/TRACEABILITY.md', 'docs/canonical/BACKLOG_EVIDENCE_MATRIX.md',
    'tasks/archiv/2026-09-06-standalone-formatausbau-implementierungsplan.md']) {
    const text = read(file);
    assert.match(text, /DS-085/u, file);
    assert.match(text, /DataSecure-Markdown/u, file);
    assert.match(text, /(?:v5|datasecure-batch\/5)/u, file);
    assert.match(text, /(?:historisch\w*|alte\w*) (?:RC107-|INT-13-|Kandidat)/iu, `${file}: distinguish old package evidence`);
    assert.doesNotMatch(text, /Keine produktive Konvertierungsevidenz|noch fehlenden reinen Konvertierungsworkflow/u, file);
  }
});

test('home and exact-run history stay aligned with the accepted navigation decision', () => {
  const ui = JSON.parse(read('plugins/data-secure/server/standalone/ui-contract.json'));
  const product = JSON.parse(read('plugins/data-secure/server/standalone/product-manifest.json'));
  assert.strictEqual(ui.initial_view, 'home');
  assert.strictEqual(ui.initial_processing_mode, null);
  assert.strictEqual(product.default_processing_mode, null);
  assert.strictEqual(ui.automatic_result_navigation, false);
  assert.strictEqual(ui.history.limit, 20);
  assert.strictEqual(ui.history.actions_bound_to, 'batch_id');
  for (const file of ['PRODUCT_VISION.md', 'PRODUCT.md', 'STANDALONE_ARCHITECTURE.md',
    'BACKLOG.md', 'UML_ARCHITECTURE.md', 'TRACEABILITY.md', 'CURRENT_STATE.md']) {
    assert.ok(read(`docs/canonical/${file}`).includes('DS-086'), file);
  }
  const uat = read('docs/acceptance/STANDALONE_UAT_TEST_KIT/README.md');
  for (const step of ['S20', 'S21', 'S22', 'S23']) assert.ok(uat.includes(`| ${step} |`));
  assert.match(uat, /20 neuesten Verarbeitungen/u);
  const readme = read('apps/datasecure-standalone/README.md');
  assert.match(readme, /Keine Verarbeitung ist vorausgewählt/u);
  assert.match(readme, /drei Hauptansichten/u);
  assert.match(readme, /20 neuesten\s+Verarbeitungen/u);
  assert.doesNotMatch(readme, /aktivierte[rn]? Standard|zwei Hauptansichten/u);
});

test('architecture and test documentation reject the superseded single-purpose narrative', () => {
  const architecture = read('docs/canonical/STANDALONE_ARCHITECTURE.md');
  assert.doesNotMatch(architecture, /produktive MarkItDown-Worker bleiben offen|MarkItDown erweitert ihn erst|isolierter MarkItDown-Worker geplant|hashgebundene Python-Runtime und isolierter Konverter-Supervisor/u);
  assert.match(architecture, /Differentialorakel/u);
  assert.match(architecture, /DataSecure-Markdown/u);
  const target = read('docs/canonical/TARGET_ARCHITECTURE.md');
  for (const row of ['Cowork-Plugin / anonymisieren', 'Standalone / Markdown und anonymisieren', 'Standalone / nur Markdown']) {
    assert.ok(target.includes(`| ${row} |`), row);
  }
  const security = read('docs/canonical/STANDALONE_SECURITY_MODEL.md');
  assert.match(security, /gewählte Quellenordner, Dateinamen und\s+Ergebnisordner als lokale Textprojektion/u);
  assert.match(security, /keine Rohbytes/u);
  const testing = read('docs/TESTING.md');
  assert.doesNotMatch(testing, /\*\*Verarbeiten \/ Ergebnisse\*\*/u);
  assert.match(testing, /Start \/ Verarbeiten \/ Verlauf/u);
  assert.match(testing, /interner\s+Gateway-Integritätstest einschließlich historischer Fassaden/u);
  const gatewayTest = read('tests/test-gateway-e2e.js');
  assert.match(gatewayTest, /Gateway internal integrity \(including legacy facades\)/u);
  const oss = read('docs/canonical/OPEN_SOURCE_COMPONENTS.md');
  assert.match(oss, /Ajv 8\.20\.0/u);
  assert.match(oss, /Build-time/u);
  assert.match(oss, /OPEN_SOURCE_COMPONENTS_BEFORE_RC109\.md/u);
  assert.match(architecture, /gateway\/standalone-history-store\.js/u);
  const current = read('docs/canonical/CURRENT_STATE.md');
  assert.doesNotMatch(current, /zwei (?:Haupt)?ansichten|automatisch in die Ergebnisansicht|Zähler nur aus dem jüngsten Standalone-Stapel/iu);
  assert.match(current, /drei Hauptansichten/u);
  assert.match(current, /DS-087/u);
  assert.match(current, /Quellenextraktionsabdeckung/u);
  assert.match(current, /Anonymisierungsstatus/u);
  const register = read('docs/canonical/DOCUMENT_REGISTER.md');
  const historical = register.split('## Historisch, nicht entscheidungsführend');
  assert.strictEqual(historical.length, 2);
  assert.ok(!historical[0].includes('REVIEW_BEIDE_PRODUKTE_2026-09-04.md'));
  assert.ok(historical[1].includes('REVIEW_BEIDE_PRODUKTE_2026-09-04.md'));
  const archiveIndex = read('docs/archive/INDEX.md');
  assert.match(archiveIndex, /ARCH-DOC-REVIEW-BOTH-RC99/u);
  assert.match(archiveIndex, /ARCH-TASK-RC111-WIDE/u);
  assert.strictEqual(fs.existsSync(path.join(root,
    'docs/archive/2026-09/reviews/REVIEW_BEIDE_PRODUKTE_2026-09-04.md')), true);
  const runtimeReadme = read('plugins/data-secure/server/README.md');
  assert.match(runtimeReadme, /server\/ocr-runtime` tree is excluded/u);
  assert.match(runtimeReadme, /separate Standalone\s+extraction runtime/u);
  assert.match(runtimeReadme, /pure Markdown conversion and Markdown-first anonymization/u);
  assert.doesNotMatch(runtimeReadme, /uses[\s\S]{0,160}checked-in offline\s+OCR dependency tree/u);
  const ux = read('docs/ANWENDERREVIEW.md');
  assert.match(ux, /Windows-Sammelreview/u);
  assert.match(ux, /AppKit-Sammelreview[\s\S]{0,120}E0 implementiert/u);
  assert.doesNotMatch(ux, /macOS-Abnahme fehlt noch \*\*Implementierungsarbeit\*\*/u);
});

test('wide privacy chaining widens Cowork only to local Office Markdown without overstating coverage', () => {
  const product = JSON.parse(read('plugins/data-secure/server/standalone/product-manifest.json'));
  assert.deepStrictEqual(product.formats_by_processing_mode['markdown-and-anonymize'], product.current_formats);
  for (const file of ['DECISIONS.md', 'PRODUCT_VISION.md', 'PRODUCT.md', 'TARGET_ARCHITECTURE.md',
    'STANDALONE_ARCHITECTURE.md', 'BACKLOG.md', 'TRACEABILITY.md', 'CURRENT_STATE.md']) {
    assert.ok(read(`docs/canonical/${file}`).includes('DS-087'), file);
  }
  const matrix = read('docs/FORMAT_COVERAGE_MATRIX.md');
  assert.match(matrix, /Extraktionsstatus bleibt separat `incomplete`/u);
  assert.match(matrix, /(?:Das )?Cowork-Plugin verarbeitet (?:damit )?sechs\s+Formate/u);
  assert.match(matrix, /kein rohes Markdown-Zwischenergebnis/u);
  assert.match(matrix, /Anwenderweg ist einstufig/u);
  assert.match(matrix, /keine vollständige[\s\S]{0,100}ursprünglichen/u);
  const capabilities = JSON.parse(read('docs/canonical/TARGET_CAPABILITIES.json'));
  assert.deepStrictEqual(capabilities.processing.cowork_markdown_first_formats, ['xlsx', 'pptx']);
  assert.deepStrictEqual(capabilities.processing.cowork_blocked_ocr_formats,
    ['pdf', 'scan-pdf', 'png', 'jpeg', 'bmp']);
  assert.strictEqual(capabilities.processing.cowork_wide_privacy_scope, 'extracted-markdown-only');
  assert.strictEqual(capabilities.standalone_desktop.wide_format_original_container_output, false);
  assert.match(capabilities.standalone_desktop.wide_format_anonymization,
    /convert-once-then-anonymize-valid-nonempty-markdown/u);
  assert.match(capabilities.standalone_desktop.wide_format_status_model,
    /source-extraction-coverage-separate-from-markdown-anonymization-status/u);
  const architecture = read('docs/canonical/STANDALONE_ARCHITECTURE.md');
  assert.match(architecture, /neutralen Extraktionsvertrag/u);
  assert.match(architecture, /`complete` und `incomplete` bleiben Zustände der Quellenextraktion/u);
});

test('Standalone purpose, naming and mapping contracts remain machine-readable', () => {
  const target = JSON.parse(read('docs/canonical/TARGET_CAPABILITIES.json'));
  assert.deepStrictEqual(target.standalone_desktop.standalone_anonymized_filename_modes,
    ['neutral', 'source-with-suffix']);
  assert.strictEqual(target.standalone_desktop.standalone_anonymized_filename_default, 'neutral');
  assert.strictEqual(target.standalone_desktop.standalone_source_filename_suffix, '-anonymisiert.md');
  assert.strictEqual(target.standalone_desktop.cowork_anonymized_filename_mode, 'neutral');
  for (const file of ['STANDALONE_SECURITY_MODEL.md', 'OPEN_SOURCE_COMPONENTS.md']) {
    const contract = read(`docs/canonical/${file}`);
    assert.match(contract, /`complete`[^\n]{0,80}`incomplete`|`complete`- und `incomplete`/u, file);
    assert.match(contract, /gültig(?:em|e)[\s\S]{0,80}nichtleer(?:em|e)[^\n]{0,40}Markdown/u, file);
  }
  const architecture = read('docs/canonical/STANDALONE_ARCHITECTURE.md');
  assert.match(architecture, /Reine Konvertierung\s+erzeugt keine Zuordnung/u);
  assert.match(architecture, /ausschließlich\s+tatsächlich veröffentlichte Ergebnisse/u);
  const uml = read('docs/canonical/UML_ARCHITECTURE.md');
  assert.match(uml, /nur Markdown\| Converted\[Markdown-Ergebnisse ohne Zuordnung/u);
});

test('formal N3 and N4 acceptance stays bound to one candidate and separate target-host evidence', () => {
  const target = JSON.parse(read('docs/canonical/TARGET_CAPABILITIES.json'));
  assert.ok(target.decision_ids.includes('DS-095'));
  assert.deepStrictEqual(target.formal_acceptance, {
    n3: 'target-host-technical-e1',
    n4: 'formal-human-e2-e3',
    shared_candidate_commit: true,
    platform_evidence_separate: true,
    windows_testers: 1,
    macos_testers: 1,
    single_mac_covers_only_native_architecture: true,
    n4_requires_n3_pass: true,
  });
});

done();
