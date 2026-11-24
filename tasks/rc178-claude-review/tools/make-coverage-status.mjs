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
// Zeile einer eindeutigen Quelltextstelle, für gleichnamige Einheiten in einer Datei.
function lineOf(file, needle) {
  const lines = fs.readFileSync(path.join(here, '..', '..', '..', file), 'utf8').split('\n');
  const hits = lines.map((line, index) => (line.includes(needle) ? index + 1 : 0)).filter(Boolean);
  if (hits.length !== 1) throw new Error(`${file}: "${needle}" kommt ${hits.length}-mal vor`);
  return hits[0];
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
  [`${srv}privacy/engine.js`, 'Z. 318-460, 534-810, 1270-1340; Hauptsession zusätzlich 340-400, 655-810, 1275-1345 und in der zweiten Runde die Personen-, Alias- und Linkzweige', ['R-001', 'R-017']],
  [`${srv}privacy/structured.js`, 'Z. 108-125, 195-250, 408-490; zweite Runde zusätzlich die Annahmeregel der Straßenadresse; für R-027 die Zugangsdaten-Detektoren und die Sammelfunktion', ['R-002', 'R-024', 'R-027']],
  [`${srv}privacy/base.js`, 'Z. 1-30, 82-135, 797-824; für R-027 die Zugangsdaten-Muster', ['R-027']],
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
  ['R-008', 'R-009', 'R-020', 'R-025']);
part('Oberflächen', [[`${app}frontend/document-review.js`, 'Z. 1-32, 184-691, 1278-1537', ['R-012', 'R-020']]]);
open([[`${app}frontend/app.js`,
  'alte Oberfläche; wird vom Hauptfenster nicht geladen, aber paketiert und von tests/test-standalone-frontend.js geprüft (R-019); nicht gelesen']]);

full('Rust', ['main.rs', 'ipc_transport.rs', 'export_directory.rs', 'export_directory/relative_results.rs', 'native_export_transaction.rs',
  'native_export_channel.rs', 'native_export_broker.rs', 'native_export_workspace.rs', 'private_namespace.rs', 'diagnostic_bundle.rs',
  'diagnostic_log.rs', 'diagnostic_probe.rs', 'ipc_activity.rs', 'native_smoke.rs', 'content_start.rs', 'macos_core.rs', 'native_open.rs',
  'startup_diagnostics.rs'].map((file) => rs + file));
for (const file of Object.keys(files)) {
  if (file.startsWith(rs)) {
    files[file].remark += '; im Review nur Quelltext; cargo test und clippy der zweiten Runde nur für das Windows-Ziel; Testmodule nur an den geänderten Stellen gelesen';
  }
}
files[`${rs}main.rs`].findings = ['R-012', 'R-013', 'R-014', 'R-022'];
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
  findings: ['R-001', 'R-017'], remark: 'geändert in 8cf00fa7, e07ca2e6 (Verbinder für Kennungen) und ffab4fa7 (eingetragene Identität)' });
sym(`${privacy}engine.js`, 'personGenitiveSuffix', {
  purpose: 'Suffixmuster für den Personengenitiv; einziger Aufrufer findLiteralSpans',
  evidence: 'tests/test-privacy-inflected-names.js', findings: ['R-001'], remark: 'neu in 8cf00fa7' });
sym(`${privacy}structured.js`, 'findStructuredSpans', {
  purpose: 'Strukturierte Identifikatoren sammeln; Aufrufer anonymize, scanStructured (Restprüfung), replaceStructured',
  invariant: 'Redaktion und Restprüfung nutzen dieselbe Funktion',
  evidence: 'tests/test-privacy-repeated-phones.js; tests/test-privacy-inline-credentials.js (die gewöhnliche Suche kennt das Label mitten in der Zeile nicht)',
  findings: ['R-002', 'R-027'], remark: 'geändert in af203451; seit 283e6ed9 Hülle um collectStructuredSpans' });
sym(`${privacy}structured.js`, 'collectStructuredSpans', { status: 'TEILGEPRÜFT',
  purpose: 'Schleife über alle Detektoren; Aufrufer findStructuredSpans und findInlineCredentialSpans',
  invariant: 'der Detektor für das Label mitten in der Zeile läuft nur im eigenen Aufruf',
  evidence: 'tests/test-privacy-inline-credentials.js; Differenzlauf', findings: ['R-027'],
  remark: 'in 283e6ed9 aus findStructuredSpans herausgelöst; nur der neue Schalter beurteilt, die Detektoren nicht einzeln' });
sym(`${privacy}structured.js`, 'findInlineCredentialSpans', {
  purpose: 'Wort hinter einem Zugangsdaten-Label mitten in der Zeile; einziger Aufrufer prepareTextPrivacyReview',
  trust: 'Text nach der Redaktion des Kerns', invariant: 'ein Wort je Label; keine Tabellenzeile, Überschrift oder Zeile mit Feld am Anfang; lineare Laufzeit',
  evidence: 'tests/test-privacy-inline-credentials.js (7 Fälle); Differenzlauf 18 600 Fälle; Zufallstests der Gegenprüfer',
  findings: ['R-027'], remark: 'neu in 283e6ed9; vier frühere Fassungen in Gegenprüfungen widerlegt, die umgesetzte nicht mehr gegengeprüft' });
sym(`${privacy}structured.js`, 'credentialLineAt', {
  purpose: 'Zeile eines Treffers einordnen (Tabelle, Überschrift, Feld am Anfang); Aufrufer der Detektor für das Label mitten in der Zeile',
  evidence: 'tests/test-privacy-inline-credentials.js', findings: ['R-027'], remark: 'neu in 283e6ed9; Zwischenspeicher je Aufruf, in findInlineCredentialSpans zurückgesetzt' });
sym(`${srv}gateway/privacy-text-operation.js`, 'prepareTextPrivacyReview', { status: 'TEILGEPRÜFT',
  purpose: 'Redaktion, Restprüfung und offene Entscheidungen eines Textes vorbereiten; Aufrufer beider Produktadapter',
  trust: 'extrahiertes Markdown', invariant: 'die Ersetzung von Zugangsdaten bleibt nur, wenn die Prüfung dieselben offenen Entscheidungen ergibt',
  evidence: 'tests/test-privacy-inline-credentials.js; Differenzlauf; nativer Lauf', findings: ['R-027'],
  remark: 'geändert in 283e6ed9; beurteilt sind der neue Schritt und seine Rückfallregel, die übrigen Zweige über das Lesen der Datei' });
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
  remark: 'geändert in 14c12ee1, c79f3aa4, 0d9e115c und a0d3e340; nur die Zweige Lauftext, w:sym und w:pStyle beurteilt, übrige Zweige nicht einzeln' });
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
// Zweite Runde: geänderte und neue Einheiten.
const win = 'cargo test --locked (Windows x64); macOS-Zweig nicht übersetzt';
sym(`${rs}export_directory.rs`, 'write_record_bounded', {
  purpose: 'Datensatz in die private Exportwurzel schreiben; Aufrufer native_export_workspace.rs put',
  invariant: 'nur verwaiste pending-Namen zählen gegen die Grenze; die Gesamtzahl kontrollierter Namen bleibt begrenzt (65 536)',
  evidence: 'Rust-Test completed_records_do_not_exhaust_the_abandoned_preparation_bound; ' + win,
  findings: ['R-011'], remark: 'geändert in 5f8bf47b' });
sym(`${rs}export_directory.rs`, 'parse_names_seen', {
  purpose: 'Namen eines Windows-Verzeichnislistings sammeln und Duplikate über alle Seiten erkennen; Aufrufer list_controlled_names',
  invariant: 'eine Menge je Listing, linearer Aufwand', evidence: 'bestehende Listing-Tests über den Test-Wrapper parse_names; ' + win,
  findings: ['R-011'], remark: 'neu in 3b8fbba9 (Einwand der Gegenprüfung)' });
sym(`${rs}native_export_broker.rs`, `capture@${lineOf(`${rs}native_export_broker.rs`, 'pub(crate) fn capture(error: &io::Error) -> Option<Self>')}`, {
  purpose: 'Betriebssystemursache eines Exportfehlers auf ein geschlossenes Vokabular abbilden; Aufrufer native_export_channel.rs',
  trust: 'io::Error; es wird nur die Fehlerklasse übernommen, kein Pfad und kein Text',
  evidence: 'Rust-Test im selben Modul; ' + win, findings: ['R-012'], remark: 'neu in 8c0dd30b' });
sym(`${rs}native_export_broker.rs`, 'public_code', { status: 'TEILGEPRÜFT',
  purpose: 'interne Exportfehler auf öffentliche Codes abbilden', evidence: 'Quelltext; unverändert',
  findings: ['R-012'], remark: 'öffentlicher Code bewusst nicht geändert' });
sym(`${rs}main.rs`, 'diagnostic_native_export_failure', {
  purpose: 'inhaltsfreies Diagnoseereignis native_export_failed schreiben; Aufrufer native_export_channel.rs',
  evidence: 'diagnostic_bundle.rs: Test der Bereinigung für das neue Ereignis; ' + win, findings: ['R-012'], remark: 'neu in 8c0dd30b' });
sym(`${rs}main.rs`, 'display_poll_record', {
  purpose: 'je Anfrage entscheiden, ob eine erfolgreiche Anzeigeabfrage protokolliert wird; Aufrufer diagnostic_ipc_event',
  invariant: 'Fehler werden immer geschrieben, bei unterdrückter Startzeile mit nachgeholtem Start',
  evidence: 'Rust-Test successful_display_polls_stop_filling_the_session_log_after_their_budget; ' + win,
  findings: ['R-013'], remark: 'neu in b30a6dbc, je Anfrage seit 1fb7eaee (Einwand der Gegenprüfung)' });
sym(`${rs}main.rs`, 'validate_document_review_request', {
  purpose: 'Argumente der Nachbearbeitungs-Commands nativ prüfen, bevor ein privater Frame entsteht; Aufrufer document_review_rpc',
  trust: 'Argumente aus der WebView', invariant: 'spiegelt validatePrivateMessage in standalone/desktop-ipc.js; nicht strenger als der Core',
  evidence: 'Rust-Test document_review_arguments_are_refused_natively_before_they_become_a_private_frame; Abgleich aller Aufrufe der geladenen Oberfläche durch die Gegenprüfung; ' + win,
  findings: ['R-014'], remark: 'neu in aef66f19, angeglichen in 22688d75' });
for (const name of ['valid_document_decision', 'valid_export_selection', 'exact_keys', 'bounded_integer', 'lower_hex']) {
  sym(`${rs}main.rs`, name, {
    purpose: 'Teilprüfung der nativen Argumentprüfung; Aufrufer validate_document_review_request',
    evidence: 'Rust-Test document_review_arguments_are_refused_natively_before_they_become_a_private_frame; ' + win,
    findings: ['R-014'], remark: 'neu in aef66f19' });
}
sym(`${rs}main.rs`, 'document_review_rpc', { status: 'TEILGEPRÜFT',
  purpose: 'Nachbearbeitungs-Commands an den Sidecar reichen',
  trust: 'Argumente aus der WebView, jetzt nativ vorgeprüft', evidence: 'Rust-Test wie validate_document_review_request; ' + win,
  findings: ['R-014'], remark: 'geändert in aef66f19; nur der Prüfaufruf beurteilt' });
const held = 'nativer Lauf mit einem Halterprozess (Löschzugriff) am Paket cec20d6e; ' + win;
sym(`${rs}private_namespace.rs`, 'is_contention', {
  purpose: 'Freigabekonflikt (Betriebssystemfehler 32) als Belegung erkennen; Aufrufer open_waiting und main.rs namespace_bootstrap_code',
  trust: 'io::Error; nur der Fehlercode', invariant: 'kein anderer Fehler gilt als Belegung',
  evidence: 'Rust-Test only_a_sharing_violation_is_contention; Mutationsprobe; ' + held, findings: ['R-028'], remark: 'neu in b71439b2' });
sym(`${rs}private_namespace.rs`, 'open_waiting', {
  purpose: 'erstes Öffnen der Elternkette und eines vorhandenen Datenordners bei Belegung begrenzt wiederholen; Aufrufer prepare_impl',
  invariant: 'ein gemeinsames Budget von 19 Wiederholungen; legt nichts an; nach einem Anlegen nicht mehr aufgerufen',
  evidence: 'vier Rust-Tests zu anhaltender und kurzer Belegung; Mutationsprobe; ' + held, findings: ['R-028'],
  remark: 'neu in b71439b2; Gegenprüfung (read-only) hat die erste Fassung auf die Elternkette beschränkt gefunden' });
sym(`${rs}private_namespace.rs`, 'prepare_impl', { status: 'TEILGEPRÜFT',
  purpose: 'Datenordner unter gehaltener Elternkette öffnen oder exklusiv anlegen; Aufrufer prepare',
  trust: 'fester Pfad des Datenordners', invariant: 'Freigabe ohne Löschen unverändert; Wiederholung nur vor dem Anlegen',
  evidence: 'Rust-Tests des Moduls; ' + held, findings: ['R-028'],
  remark: 'geändert in b71439b2; beurteilt sind die beiden wartenden Öffnungen, die übrigen Schritte über das Lesen der Datei' });
sym(`${rs}main.rs`, 'namespace_bootstrap_code', {
  purpose: 'Fehler der Namespace-Vorbereitung auf STANDALONE_DATA_ROOT_BUSY oder _UNSAFE abbilden; Aufrufer spawn_sidecar (vier Stellen)',
  trust: 'io::Error; nur die Fehlerklasse', evidence: 'Rust-Test a_held_namespace_chain_is_reported_as_busy_and_everything_else_stays_unsafe; Quelltextvertrag in tests/test-standalone-desktop-contract.js; ' + held,
  findings: ['R-028'], remark: 'neu in b71439b2' });
sym(`${rs}main.rs`, 'release_unspawned_generation', {
  purpose: 'Startgeneration eines Versuchs zurückgeben, der an einer Belegung endete; Aufrufer rpc im Fehlerzweig des Starts',
  invariant: 'nur bei STANDALONE_DATA_ROOT_BUSY; dieser Code entsteht nur vor dem Start eines Core-Prozesses',
  evidence: 'Rust-Test only_a_busy_namespace_attempt_gives_its_recovery_generation_back; nativ 20 erneute Prüfungen ohne Erschöpfung; ' + win,
  findings: ['R-028'], remark: 'neu in b71439b2 (Einwand der Gegenprüfung)' });
sym(`${rs}main.rs`, 'spawn_sidecar', { status: 'TEILGEPRÜFT',
  purpose: 'Core-Prozess mit gehaltenem Datenordner starten', evidence: 'Quelltextvertrag der vier Stellen; ' + held,
  findings: ['R-028'], remark: 'geändert in b71439b2; nur die Zuordnung der Namespace-Fehler beurteilt' });
sym(`${rs}main.rs`, 'open_review_window', { status: 'TEILGEPRÜFT',
  purpose: 'Prüffenster als zweites WebView2-Fenster öffnen', invariant: 'dieselben WebView2-Schalter wie das Hauptfenster (WEBVIEW2_BROWSER_ARGS)',
  evidence: 'tests/test-standalone-desktop-contract.js (genaue Zeichenkette für beide Fenster); Startprobe mit -AssertReviewWindow -AssertNoOutbound am Paket 1c672ef4',
  findings: ['R-031'], remark: 'geändert in 56d7c744; nur der neue Schalteraufruf beurteilt' });
sym(`${app}frontend/workspace.js`, 'renderBootstrapFailure', { status: 'TEILGEPRÜFT',
  purpose: 'gehaltene Startverweigerung mit Ursache und Statustext anzeigen',
  evidence: 'tests/test-standalone-workspace.js (drei Fälle für STANDALONE_DATA_ROOT_BUSY); nativer Lauf',
  findings: ['R-028'], remark: 'geändert in b71439b2; nur der neue Zweig beurteilt' });

for (const name of ['linkNamePattern', 'linkIdentityHits']) {
  sym(`${privacy}engine.js`, name, {
    purpose: 'Namensteil einer bekannten Person und prozentkodierte E-Mail-Adresse im Ziel eines Links finden; Aufrufer anonymize (Profile, die Links behalten) und scanResidual',
    trust: 'Linkziel aus dem Dokument; reiner Mustervergleich ohne Dekodierung',
    invariant: 'Redaktion und Restprüfung nutzen dieselbe Funktion; ersetzt wird nur der Treffer mit dem Rang eines Namenstreffers, nie der ganze Link',
    evidence: 'tests/test-privacy-name-variants.js; Differenzlauf gegen den RC178-Kern (15 400 Fälle); dritte Gegenprüfung',
    findings: ['R-017'], remark: 'neu in e07ca2e6; ersetzt die Ganzersetzung aus cfee417a und ac74cf71, die ein Leck und Stopps verursachte' });
}
sym(`${privacy}engine.js`, 'asciiNameSpellings', {
  purpose: 'Schreibweisen eines Namens ohne Umlaute; Aufrufer buildPersonDictionary und linkNamePattern',
  invariant: 'nur lateinische Schrift; nur der volle Name wird damit gesucht, und nicht, wenn die Schreibweise eine eigene Person ist',
  evidence: 'tests/test-privacy-name-variants.js; Differenzlauf; zweite Gegenprüfung',
  findings: ['R-017'], remark: 'neu in e07ca2e6' });
sym(`${privacy}engine.js`, 'buildPersonDictionary', { status: 'TEILGEPRÜFT',
  purpose: 'Wörterbuch der Personenliterale; Aufrufer anonymize',
  evidence: 'tests/test-privacy-name-variants.js; Differenzlauf', findings: ['R-017'],
  remark: 'geändert in cfee417a und e07ca2e6 (Dateinamenformen, Schreibweise ohne Umlaute, Kennzeichen matchOnly); übrige Zweige nicht einzeln beurteilt' });
sym(`${privacy}engine.js`, 'anonymize', { status: 'TEILGEPRÜFT',
  purpose: 'Redaktion eines Textes; Aufrufer gateway/privacy-text-operation.js',
  evidence: 'tests/test-privacy-name-variants.js; tests/test-pii-regression.js; Differenzlauf', findings: ['R-001', 'R-017', 'R-026'],
  remark: 'geändert in 3e4a1be1 (Aufzählung), d91462b9 (Link in strengen Profilen), e07ca2e6 (Namensteil im Link, Wörterbuch für die Restprüfung); nur diese Zweige beurteilt' });
sym(`${privacy}engine.js`, 'scanResidual', { status: 'TEILGEPRÜFT',
  purpose: 'Restprüfung des freigegebenen Textes; Aufrufer gateway/privacy-text-operation.js und Prüfspeicher',
  evidence: 'tests/test-privacy-name-variants.js; tests/test-pii-regression.js (Map als Eingabe)', findings: ['R-001', 'R-017'],
  remark: 'geändert in 8cf00fa7, cfee417a und e07ca2e6; nur die Zweige bekannte Werte und Linkziel beurteilt' });
sym(`${privacy}engine.js`, 'isExplicitPersonOccurrence', { status: 'TEILGEPRÜFT',
  purpose: 'Personenkontext einer Fundstelle; Aufrufer Wörterbuchschleife',
  evidence: 'tests/test-privacy-name-variants.js', findings: ['R-017'],
  remark: 'geändert in cfee417a (abgekürzte Anrede); übrige Zweige nicht einzeln beurteilt' });
sym(`${privacy}engine.js`, 'growOverHonorific', { status: 'TEILGEPRÜFT',
  purpose: 'Fundstelle über eine vorangestellte Anrede ausdehnen', evidence: 'tests/test-privacy-name-variants.js',
  findings: ['R-017'], remark: 'geändert in cfee417a' });
sym(`${privacy}engine.js`, 'isPersistedPersonAliasOccurrence', { status: 'TEILGEPRÜFT',
  purpose: 'Alias einer Person aus einem früheren Dokument an der Fundstelle bestätigen',
  evidence: 'tests/test-privacy-name-variants.js (Genitiv im Folgedokument, Gegenfall mit gebeugtem Adjektiv)',
  findings: ['R-017'], remark: 'geändert in cfee417a; Überredaktion bei Nachnamen, die gewöhnliche Wörter sind, hingenommen und dokumentiert' });
sym(`${srv}standalone/markdown-retention.js`, 'stalePendingPublication', {
  purpose: 'verwaiste Veröffentlichungsvorbereitung erkennen; Aufrufer Bereinigungslauf',
  invariant: 'nur das eigene Namensmuster; nie jünger als die Schonfrist, auch bei Aufbewahrung 0 Tage; ein verschwindender Eintrag bricht den Lauf nicht ab',
  evidence: 'tests/test-standalone-markdown-retention.js (15 Fälle)', findings: ['R-010'],
  remark: 'neu in 97a70cd0, Schonfrist und Fehlertoleranz in f8c69fe3 (Einwand der Gegenprüfung)' });
sym(`${srv}document-parser.js`, 'parseCsvDialect', { status: 'TEILGEPRÜFT',
  purpose: 'Trennzeichen und Tabellenform einer CSV bestimmen; Aufrufer markdown-extractor.js und der CSV-Quellpfad',
  evidence: 'tests/test-markdown-extractor.js, tests/test-csv-source.js', findings: ['R-018'],
  remark: 'geändert in 803acbb9: Leerzeile aus Leerzeichen, Kennzeichen unstructured; übrige Zweige nicht einzeln beurteilt' });
sym(`${srv}standalone/markdown-extractor.js`, 'extractCsv', {
  purpose: 'CSV als Tabelle oder wörtlichen Block ausgeben; Aufrufer extractMarkdownBuffer',
  invariant: 'eine nicht sicher erkannte Tabellenform meldet SOURCE_COVERAGE_UNVERIFIED statt „vollständig“',
  evidence: 'tests/test-markdown-extractor.js', findings: ['R-018'], remark: 'geändert in 803acbb9' });
sym(`${srv}ooxml.js`, 'wordSymbolText', {
  purpose: 'eingefügtes Symbol (w:sym) als sicheres Zeichen oder neutralen Marker ausgeben; Aufrufer parseWordStructure',
  trust: 'Schriftname und Zeichencode aus dem Dokument', invariant: 'nur die Symbol-Schrift wird übersetzt; alles andere ergibt den Marker',
  evidence: 'tests/test-docx-inline-run-content.js; Zuordnung aller 52 Buchstaben von der Gegenprüfung gegen die Adobe-Symbol-Kodierung verglichen',
  findings: ['R-003'], remark: 'neu in 0d9e115c' });
sym(`${app}frontend/workflow-presentation.js`, 'failureAdvice', { status: 'TEILGEPRÜFT',
  purpose: 'Handlungshinweis zu einem Stoppgrund; Aufrufer Ergebnisdarstellung',
  evidence: 'tests/test-workflow-presentation.js', findings: ['R-018', 'R-025'], remark: 'geändert in 2726675a' });

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
    remark: 'Stichprobe von 63 Standalone-Testdateien im Lieferketten-Review; Suite ausgeführt; in der zweiten Runde neun neue oder erweiterte Testdateien geschrieben; übrige Testdateien nicht gelesen' },
  'G-DOCS': { status: 'TEILGEPRÜFT', findings: ['R-007', 'R-015', 'R-016', 'R-021'],
    remark: 'Kanon-Einstieg, Register, RELEASE, TESTING, Formatmatrix, Verträge TEXT_SOURCE, CSV_SOURCE und BATCH_PARALLELISM sowie Startanleitungen ganz oder in Ausschnitten gelesen; BACKLOG, CURRENT_STATE und TRACEABILITY nur über Suche; Archiv als Historie nicht geprüft' }
});

fs.writeFileSync(path.join(here, 'coverage-status.json'), `${JSON.stringify({ files, symbols, groups }, null, 2)}\n`);
console.log(`${Object.keys(files).length} Dateien mit Lesestand`);
