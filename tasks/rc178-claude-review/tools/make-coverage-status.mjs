#!/usr/bin/env node
// Schreibt coverage-status.json aus den Leseständen der Reviews. Die Listen
// stammen aus den Berichten der sieben Read-only-Reviews und aus dem Lesen der
// Hauptsession; sie sind die einzige Quelle für die Statusspalte.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srv = 'plugins/data-secure/server/';
const app = 'apps/datasecure-standalone/';
const rs = `${app}tauri-contract/src/`;
const files = {};
const symbols = {};
const groups = {};

function full(review, list, findings = []) {
  for (const file of list) {
    files[file] = { symbolStatus: 'TEILGEPRÜFT', findings,
      remark: `Datei im ${review}-Review vollständig gelesen; kein Einzelurteil je Einheit festgehalten` };
  }
}
function part(review, entries) {
  for (const [file, range, findings = []] of entries) {
    files[file] = { symbolStatus: 'TEILGEPRÜFT', findings,
      remark: `im ${review}-Review nur teilweise gelesen (${range}); Einheiten außerhalb sind faktisch offen` };
  }
}
function open(entries) {
  for (const [file, remark] of entries) files[file] = { symbolStatus: 'OFFEN', remark };
}
function sym(file, name, data) {
  (symbols[file] ||= {})[name] = { status: 'GEPRÜFT', ...data };
}

full('Datenschutz', ['standalone/confidential-overview.js', 'standalone/confidential-workbook.js', 'standalone/result-companions.js',
  'standalone/identity-ledger.js', 'gateway/mapping.js', 'gateway/standalone-anonymized-mapping.js',
  'gateway/privacy-text-operation.js', 'batch-pseudonym-registry.js', 'batch-pseudonym-context.js',
  'core/markdown-first-privacy.js'].map((file) => srv + file));
full('Datenschutz', [`${app}runtime-adapters/gateway/product-automatic-review.js`]);
part('Datenschutz', [
  [`${srv}privacy/engine.js`, 'Z. 318-460, 534-810, 1270-1340; Hauptsession zusätzlich 340-400, 655-810, 1275-1345', ['R-001', 'R-017']],
  [`${srv}privacy/structured.js`, 'Z. 108-125, 195-250, 408-490', ['R-002']],
  [`${srv}privacy/base.js`, 'Z. 1-30, 82-135, 797-824'],
  [`${srv}gateway/batch-review-policy.js`, 'erste 120 Zeilen'],
  [`${srv}gateway/compliance.js`, 'Z. 15-74'],
  [`${srv}gateway/common.js`, 'nur detectProfileFromMarkdown']
]);

full('Laufzeit', ['standalone/conversion-worker.js', 'standalone/desktop-sidecar.js', 'standalone/native-export-channel.js',
  'standalone/markdown-store.js', 'standalone/markdown-retention.js', 'standalone/conversion-runtime-resolver.js',
  'gateway/standalone-conversion-window.js', 'gateway/batch-processing-orchestrator.js', 'gateway/batch-executor-runner.js',
  'gateway/batch-worker.js', 'gateway/batch-item-processor.js'].map((file) => srv + file));
files[`${srv}standalone/markdown-store.js`].findings = ['R-010'];
files[`${srv}standalone/markdown-retention.js`].findings = ['R-010'];
files[`${srv}gateway/standalone-conversion-window.js`].findings = ['R-007', 'R-022'];
part('Laufzeit', [
  [`${srv}standalone/application-service.js`, 'Z. 160-800, 930-1109, 1300-1589'],
  [`${srv}standalone/desktop-ipc.js`, 'Z. 1-120, 296-340'],
  [`${srv}gateway/batch-executor.js`, 'Z. 1-40, 239-370, 608-859', ['R-022']],
  [`${srv}gateway/batch.js`, 'Z. 850-909'],
  [`${srv}gateway/standalone-pause.js`, 'bis Z. 157'],
  [`${srv}standalone/convert-next.js`, 'Z. 30-130']
]);

full('Konvertierungs', ['document-parser.js', 'standalone/markdown-extractor.js', 'standalone/markdown-contract.js',
  'standalone/markdown-output-profile.js', 'standalone/readable-markdown.js', 'standalone/conversion-feedback.js',
  'xlsx-number-format.js', 'core/source-text-codec.js', 'core/markdown-literal-content.js',
  'core/csv-table-shape.js'].map((file) => srv + file));
files[`${srv}document-parser.js`].findings = ['R-018'];
files[`${srv}xlsx-number-format.js`].findings = ['R-004'];
part('Konvertierungs', [
  [`${srv}standalone/conversion-worker-child.js`, 'Z. 1-780, 880-1029'],
  [`${srv}ooxml.js`, 'Z. 1150-1280, 1440-1515, 3483-3501; Hauptsession zusätzlich 902-946, 1140-1182, 1880-1900', ['R-003', 'R-005', 'R-006']],
  [`${srv}gateway/source-format-inspector.js`, 'Z. 200-240'],
  [`${srv}word-content-context.js`, 'Hauptsession Z. 26-53, 118-170', ['R-005']]
]);
open(['content-graph.js', 'word-table-grid.js', 'drawing-table-grid.js', 'xlsx-structure.js', 'xlsx-content-context.js',
  'xlsx-context-projection.js', 'office-chart-model.js', 'office-chartex-model.js', 'office-diagrams.js', 'office-math.js',
  'office-math-projection.js', 'office-table-projection.js', 'presentation-comments.js', 'xml-reader.js',
  'zip-reader.js'].map((file) => [srv + file,
  'Quelltext nicht gelesen; nur über Ausgaben synthetischer DOCX/XLSX/PPTX-Fixtures beobachtet (Konvertierungs-Review)']));

full('Oberflächen', ['workspace.js', 'review.js', 'text-positions.js', 'workflow-presentation.js'].map((file) => `${app}frontend/${file}`),
  ['R-008', 'R-009', 'R-020']);
part('Oberflächen', [[`${app}frontend/document-review.js`, 'Z. 1-32, 184-691, 1278-1537', ['R-020']]]);
open([[`${app}frontend/app.js`,
  'alte Oberfläche; wird vom Hauptfenster nicht geladen, aber paketiert und von tests/test-standalone-frontend.js geprüft (R-019); nicht gelesen']]);

full('Rust', ['main.rs', 'ipc_transport.rs', 'export_directory.rs', 'export_directory/relative_results.rs', 'native_export_transaction.rs',
  'native_export_channel.rs', 'native_export_broker.rs', 'native_export_workspace.rs', 'private_namespace.rs', 'diagnostic_bundle.rs',
  'diagnostic_log.rs', 'diagnostic_probe.rs', 'ipc_activity.rs', 'native_smoke.rs', 'content_start.rs', 'macos_core.rs', 'native_open.rs',
  'startup_diagnostics.rs'].map((file) => rs + file));
for (const file of Object.keys(files)) {
  if (file.startsWith(rs)) files[file].remark += '; nur Quelltext, kein cargo-Lauf im Review; Testmodule nicht gelesen';
}
files[`${rs}main.rs`].findings = ['R-014', 'R-022'];
files[`${rs}export_directory.rs`].findings = ['R-011', 'R-013', 'R-022'];
files[`${rs}native_export_broker.rs`].findings = ['R-011', 'R-012'];
files[`${rs}native_export_channel.rs`].findings = ['R-012'];
files[`${rs}diagnostic_log.rs`].findings = ['R-013'];
files[`${rs}diagnostic_bundle.rs`].findings = ['R-013'];
full('Rust', [`${app}tauri-contract/build.rs`]);
part('Rust', [
  [`${rs}export_private_security.rs`, 'Z. 1-156, 289-512; Windows-Teil nur überflogen'],
  [`${rs}review_window.rs`, 'Z. 1-60'],
  [`${rs}source_fingerprint.rs`, 'Z. 1-60']
]);

full('Lieferketten', ['scripts/build-standalone-package.mjs', 'scripts/verify-standalone-package.mjs',
  'scripts/build-standalone-macos-package.mjs', 'scripts/verify-standalone-macos-package.mjs', 'scripts/prepare-standalone-runtime.mjs',
  'scripts/build-runtime-target.mjs', 'scripts/lib/standalone-runtime-projection.mjs', 'scripts/lib/standalone-build-fingerprint.mjs',
  'scripts/lib/standalone-package-integrity.mjs', 'scripts/lib/standalone-conversion-runtime.mjs',
  'scripts/lib/standalone-windows-package.mjs', 'scripts/lib/standalone-windows-layout.mjs', 'scripts/lib/zip.mjs',
  'scripts/lib/pdfjs-text-paint-hook.mjs', 'scripts/download-approved-macos-core.mjs']);
part('Lieferketten', [
  ['scripts/lib/macos-core-artifact.mjs', 'Z. 1-120'],
  ['scripts/build-ownership-guard.mjs', 'Z. 1-60; im Review ausgeführt'],
  ['scripts/lib/ownership-guard-artifact.mjs', 'Z. 25-60']
]);

const privacy = `${srv}privacy/`;
sym(`${privacy}engine.js`, 'findLiteralSpans', {
  purpose: 'Wörterbuch-Literal im Text finden; Aufrufer anonymize (Wörterbuchschleife, persistierte Aliase) und scanResidual',
  trust: 'Text aus Extraktion, Nadel aus Registry', invariant: 'Unicode-Wortgrenze; Genitivsuffix nur für Personen',
  evidence: 'tests/test-privacy-inflected-names.js; Scratch-Reproduktion vor und nach der Änderung',
  findings: ['R-001'], remark: 'geändert in 8cf00fa7' });
sym(`${privacy}engine.js`, 'personGenitiveSuffix', {
  purpose: 'Suffixmuster für den Personengenitiv; einziger Aufrufer findLiteralSpans',
  evidence: 'tests/test-privacy-inflected-names.js', findings: ['R-001'], remark: 'neu in 8cf00fa7' });
sym(`${privacy}structured.js`, 'findStructuredSpans', {
  purpose: 'Strukturierte Identifikatoren sammeln; Aufrufer anonymize, scanStructured (Restprüfung), replaceStructured',
  invariant: 'Redaktion und Restprüfung nutzen dieselbe Funktion',
  evidence: 'tests/test-privacy-repeated-phones.js', findings: ['R-002'], remark: 'geändert in af203451' });
for (const name of ['phoneIdentity', 'samePhone', 'acceptRepeatedPhones']) {
  sym(`${privacy}structured.js`, name, {
    purpose: 'Wiederholung einer akzeptierten Telefonnummer erkennen; Aufrufer findStructuredSpans',
    evidence: 'tests/test-privacy-repeated-phones.js (mit Gegenfällen)', findings: ['R-002'], remark: 'neu in af203451' });
}
sym(`${srv}ooxml.js`, 'parseWordStructure', { status: 'TEILGEPRÜFT',
  purpose: 'Word-Struktur zu Absätzen und Tabellen; Aufrufer Word-Story-Projektion (ooxml.js:879)',
  trust: 'nicht vertrauenswürdiges DOCX-XML, vorab namespacegeprüft',
  evidence: 'tests/test-docx-inline-run-content.js, tests/test-docx-heading-style-names.js',
  findings: ['R-003', 'R-005'],
  remark: 'geändert in 14c12ee1 und c79f3aa4; nur die Zweige Lauftext und w:pStyle beurteilt, übrige Zweige nicht einzeln' });
sym(`${srv}word-content-context.js`, 'readWordNumbering', { status: 'TEILGEPRÜFT',
  purpose: 'styles.xml und numbering.xml lesen; Aufrufer ooxml.js (Word-Kontext)',
  evidence: 'tests/test-docx-heading-style-names.js', findings: ['R-005'],
  remark: 'geändert in c79f3aa4; nur die Formatvorlagenschleife beurteilt' });
sym(`${srv}word-content-context.js`, 'wordHeadingLevel', {
  purpose: 'Überschriftenebene über Vorlagenname und begrenzte basedOn-Kette; Aufrufer parseWordStructure',
  invariant: 'Zyklen und fehlende Vorlagen ergeben keine Ebene',
  evidence: 'tests/test-docx-heading-style-names.js', findings: ['R-005'], remark: 'neu in c79f3aa4' });
sym(`${srv}xlsx-number-format.js`, 'formatXlsxNumber', {
  purpose: 'Anzeigeprojektion einer Zahl; Aufrufer xlsx-structure.js:457 und office-chart-model.js:252',
  evidence: 'tests/test-xlsx-content-projection.js', findings: ['R-004'], remark: 'Tabelle BUILTIN geändert in 7f7f4d6f' });
sym(`${srv}gateway/standalone-conversion-window.js`, 'eligibleForWindow', {
  purpose: 'Aktivierungsbedingungen des zweispurigen Fensters; Aufrufer createStandaloneConversionWindow',
  evidence: 'Quelltext Z. 28-36 von der Hauptsession gelesen; tests/test-standalone-conversion-worker.mjs:105-260',
  findings: ['R-007', 'R-022'] });
sym(`${app}frontend/review.js`, 'poll', { status: 'TEILGEPRÜFT',
  purpose: 'Sitzungsstatus lesen und Gruppe rendern; Aufrufer Timer und Statusknopf',
  evidence: 'tests/test-standalone-review-frontend.js (eingebettet und Fenster); schlägt am Stand vor c62bb1dd fehl',
  findings: ['R-008'], remark: 'geändert in c62bb1dd; Stub-DOM, keine WebView-Beobachtung' });
sym(`${rs}export_directory.rs`, 'write_record_bounded', { status: 'TEILGEPRÜFT',
  purpose: 'Datensatz in die private Exportwurzel schreiben; Aufrufer native_export_workspace.rs put',
  evidence: 'nur Quelltext; kein Test für die Grenze 2048', findings: ['R-011'] });
sym(`${rs}native_export_broker.rs`, 'public_code', { status: 'TEILGEPRÜFT',
  purpose: 'interne Exportfehler auf öffentliche Codes abbilden', evidence: 'nur Quelltext', findings: ['R-012'] });
sym(`${rs}main.rs`, 'document_review_rpc', { status: 'TEILGEPRÜFT',
  purpose: 'Nachbearbeitungs-Commands an den Sidecar reichen',
  trust: 'Argumente aus der WebView, nativ nicht vollständig vorgeprüft', evidence: 'nur Quelltext', findings: ['R-014'] });

Object.assign(groups, {
  'G-FRONTEND-STATIC': { status: 'TEILGEPRÜFT', findings: ['R-008', 'R-020'],
    remark: 'workspace.html, review.html, workspace.css, review.css, review-workspace.css und design-tokens.css vollständig gelesen (Oberflächen-Review); index.html und styles.css (alte Oberfläche) nicht' },
  'G-TAURI-CONFIG': { status: 'TEILGEPRÜFT',
    remark: 'Cargo.toml, tauri.conf.json, tauri.macos.conf.json, capabilities, Info.plist, Entitlements und .cargo/config.toml gelesen (Rust- und Lieferketten-Review); permissions/commands.toml nur Bezeichner; Cargo.lock per Skript ausgewertet; Icons nicht' },
  'G-PROJECTED-DATA': { status: 'OFFEN', remark: 'native Sandbox-Binärdatei und Prüfsumme nicht inspiziert' },
  'G-WORKFLOWS': { status: 'TEILGEPRÜFT', findings: ['R-015', 'R-023'],
    remark: 'ci.yml, security.yml, release-evidence.yml, standalone-macos-sandbox.yml und standalone-macos-static-core.yml vollständig; übrige sieben nur uses/runs-on/inputs' },
  'G-NATIVE-PILOTS': { status: 'TEILGEPRÜFT',
    remark: 'vier Pilot-Lockfiles, models.lock.json und Laufzeitverträge geprüft (Integrität; npm audit --package-lock-only ohne Befund); übrige Dateien nicht gelesen' },
  'G-SCRIPTS-OTHER': { status: 'OFFEN', remark: 'Build- und Hilfsskripte außerhalb des Standalone-Fingerprints nicht gelesen' },
  'G-TESTS': { status: 'TEILGEPRÜFT', findings: ['R-019'],
    remark: 'Stichprobe von 63 Standalone-Testdateien im Lieferketten-Review; Suite und fünf Frontend-Tests ausgeführt; übrige Testdateien nicht gelesen' },
  'G-DOCS': { status: 'TEILGEPRÜFT', findings: ['R-007', 'R-016', 'R-021'],
    remark: 'Kanon-Einstieg, Register, RELEASE, TESTING, Formatmatrix, Verträge TEXT_SOURCE, CSV_SOURCE und BATCH_PARALLELISM sowie Startanleitungen ganz oder in Ausschnitten gelesen; BACKLOG, CURRENT_STATE und TRACEABILITY nur über Suche; Archiv als Historie nicht geprüft' }
});

fs.writeFileSync(path.join(here, 'coverage-status.json'), `${JSON.stringify({ files, symbols, groups }, null, 2)}\n`);
console.log(`${Object.keys(files).length} Dateien mit Lesestand`);
