# RC30-Ist-Abgleich zum kanonischen Backlog

Stand: 22.08.2026 · geprüfter Produktstand: `b622278` auf `main`

Dieser Nachweis verhindert Doppelarbeit. `erledigt` bedeutet vollständig gegen das
Ziel abgenommen, `teilweise` bedeutet wiederverwendbare Implementierung mit klarer
Restdifferenz, `offen` bedeutet ohne belastbare Produktimplementierung. Testdateien
sind Evidenz für Codeverhalten, nicht automatisch für installierte Claude-Oberflächen.

## BL-001 – Kanonisches Dokumentensystem

Status: **erledigt**

Vorhanden: `docs/canonical/*`, Entscheidungs-/Backlog-/Traceability-IDs und
`scripts/verify-canonical-docs.mjs`. Das Wiederverwendungsregister
`OPEN_SOURCE_COMPONENTS.md` ordnet jedem Epic Open-Source-Kandidaten oder eine
begründete Eigenimplementierungs-Restlücke zu; der Dokumententest blockiert fehlende
Epic-Zuordnungen. Rest: Kandidaten je Story praktisch evaluieren und das Register bei
jeder Auswahl oder Ablehnung pflegen.

## BL-002 – Ist- und Ziel-Fähigkeiten

Status: **erledigt**

Vorhanden: `BUILD_INFO.json`, `manifest.json`, `gateway/status.js` und Manifesttests
beschreiben RC30 fail-closed mit TXT/DOCX. Das getrennte
`TARGET_CAPABILITIES.json` erfasst alle DS-IDs, Zielformate, Plattformen und Grenzen
ausdrücklich als Nicht-Runtime-Vertrag. `test-capability-contract.js` blockiert Drift
zwischen Ist-Metadaten, Runtime, Skills, Marketplace und aktiven Handbüchern und
verhindert, dass der Zielvertrag als aktuelle Plugin-Fähigkeit ausgegeben wird.
Rest: nur laufende Vertragspflege bei jeder Capability-Änderung.

## BL-010 – Plattformpakete

Status: **teilweise**

Vorhanden: Plugin-ZIP und MCPB, bytegenaue Paketparität, Windows-x64-Launcher sowie
Dateiauswahladapter für Windows, macOS und Linux. Rest: automatische OS-Paketwahl,
installationsfreie Plugin-Runtime, produktionsfähige macOS-/Linux-Komponenten sowie
frische ZIP-/Marketplace-Installation und Rückrolle auf allen drei Plattformen.

## BL-011 – Fortsetzbarer Job Store

Status: **teilweise**

Vorhanden: persistente Batch-Snapshots, monotone Companion-Journale, atomare Claims,
Crash-Recovery, Retention und Einzelläufe ohne automatische Doppelverarbeitung;
abgedeckt durch `test-batch-session`, `test-companion-job-store`,
`test-companion-retention` und `test-gateway-e2e`. Rest: 100 statt 25 Dateien,
500-MB-Gesamtgrenze, genau ein aktiver Stapel systemweit sowie echte Fortsetzung
gestoppter/pausierter Dateien statt terminalem `stopped`.

Zielvertrag ergänzt: `contracts/BATCH_SNAPSHOT_V1.md` legt private atomare Kopien,
Originalunabhängigkeit, Journalzustände, Crashfenster und Löschregeln für BL-011.1
fest; `test-architecture-contracts.js` schützt die Mindestanforderungen.

## BL-012 – Fortschritts- und Abschlussfenster

Status: **teilweise**

Vorhanden: Windows-Textreview, lokale Bestätigung und Abschlusszähler; Abbruch und
Timeout stoppen sicher. Rest: ein stapelweiter Abschlussdialog nach vollständiger
Verarbeitung, „Später entscheiden“, Fortschrittsanzeige, Barrierefreiheit und
gleichwertige macOS-/Linux-UI.

## BL-020 – Content-Graph und Coverage

Status: **teilweise**

Vorhanden: gehärteter ZIP-Leser, OOXML-Partprüfung, Warnungen für externe oder
unbekannte inhaltstragende Parts, Attachment-Quellen und fail-closed Parserfehler.
Rest: ein formatübergreifender versionierter Content-Graph mit stabilen Locators für
Text, Tabellen, Bilder, Kommentare, Notizen, PDF-Objekte und rekursive Anhänge.

## BL-021 – TXT, Markdown und CSV

Status: **teilweise**

Vorhanden: Parser für UTF-8-TXT/MD sowie CSV-Fence-Härtung; TXT ist im Pilot aktiv.
Rest: MD/CSV aus dem Release-Gate nehmen, Encoding-/Dialekt-/Tabellen-Coverage
vollständig nachweisen und sicheren Markdown-Export abnehmen.

## BL-022 – DOCX, XLSX und PPTX

Status: **teilweise**

Vorhanden: OOXML-Parser und Tests für DOCX, XLSX, PPTX, Tabellen, Shared Strings,
Textfelder, Folientext, Notizen, Bilder, Beziehungen und Coverage-Warnungen; DOCX ist
im Pilot aktiv. Rest: XLSX/PPTX produktiv freigeben und Kommentare, Kopf-/Fußbereiche,
Formeln, Charts, alle relevanten Beziehungen und eingebettete Dokumente positiv
abdecken.

## BL-023 – PDF und Scan-PDF

Status: **in Arbeit**

Vorhanden: PDF-Signaturerkennung, adversariale Legacy-Tests, gesperrter PDF-Pfad und
ein reproduzierbar gelockter PDFium-Engineering-Spike. Unter DS-038 wurde zusätzlich
ein gelockter PDF.js-6.2.108-/Canvas-1.0.7-Pilot begonnen. GitHub-Actions-Lauf
`32594467568` belegt auf Windows x64, macOS x64/ARM64 und Linux x64 Byte-Eingabe,
Textextraktion, Seitenrendering, JavaScript-Action-Erkennung und null beobachtete
Netzwerkversuche. Alle vier Artefakte bleiben ausdrücklich `no_go`. Rest:
produktiver isolierter PDF-Worker, vollständige
Text-/Font-/Formular-/Annotation-/Anhang-/Visual-Coverage,
Verschlüsselung und Scan-OCR; bis dahin bleibt `PDF_COVERAGE_UNVERIFIED` aktiv.

Das neue `contracts/PDF_OCR_RISK_GATE_V1.md` definiert dafür eine einheitliche
Pflichtmatrix für Windows, macOS und Linux. Alle Zellen stehen weiterhin auf `offen`;
deshalb bleibt BL-023.1 in Arbeit und PDF produktseitig gesperrt.
`pdf-ocr-risk.lock.json` pinnt den offiziellen PDFium-Stand sowie Tesseract 5.5.2
und die deutschen/englischen `tessdata_fast`-Modelle als Prüfkandidaten. Der manuelle
Workflow `pdf-ocr-risk.yml` erzeugt getrennte NO-GO-Preflights für Windows x64,
macOS x64/ARM64 und Linux x64. GitHub-Actions-Lauf `32593313169` auf `fdd2a02`
bestand am 22.08.2026 alle vier Preflights (`windows-latest`, `macos-15-intel`,
`macos-14`, `ubuntu-latest`). Alle meldeten gültige Pins, den geschlossenen
Produktpfad `PDF_COVERAGE_UNVERIFIED`, keine bestandene Pflichtzelle und
`release_decision: no_go`. Auch das Windows-Community-Negativ-Gate bestand, weil
die Probe erwartungsgemäß weiterhin `no_go` meldete. Ein offizieller Eigenbuild und
die übrigen Pflichtzellen bleiben offen.

## BL-024 – Offline-OCR und Bilder

Status: **teilweise**

Vorhanden: PNG/BMP-Decoder, JPEG-Metadatenentfernung, OCR-Offset-Mapping,
Pixelredaktion, Visual-Gates und ein real getesteter Windows-OCR-Pfad. Rest:
gebündelte Deutsch-/Englisch-OCR auf macOS/Linux, gemischtsprachige Abnahme,
eigenständige Bildfreigabe als Markdown sowie sichere fachliche Grafikprüfung.

## BL-030 – Stapelweite Entitätsauflösung

Status: **teilweise**

Vorhanden: Profil `auto`, mehrere Fachprofile, kontextbezogene PII-Engine und
deterministische Pseudonyme innerhalb eines einzelnen Dokuments. Rest: automatische
Profilentscheidung pro Datei im gemischten Stapel und ein flüchtiger gemeinsamer
Pseudonymkontext über alle Stapeldokumente.

Zielvertrag ergänzt: `contracts/BATCH_PSEUDONYM_V1.md` definiert eine über den
OS-Benutzerschutz gesicherte HMAC-Ableitung ohne persistente Rohwert-Mappingtabelle,
Versionierung, Ablauf und Neustartverhalten für BL-030.1.

## BL-031 – Organisationen und Zertifizierungen

Status: **teilweise**

Vorhanden: versionierter lokaler Zertifikatskatalog, fundstellenbezogene
Kontextregeln, Ambiguitäten und umfangreiche Regressionen für IT-/Health-IT-Begriffe,
Aussteller, Arbeitgeber, Kunden und Vertragsparteien. Rest: Abschlussdialog über den
gesamten Stapel, Gruppenentscheidungen und Ausbau anhand des 1.000-Dokument-Korpus.

## BL-032 – Passwörter und lokale Entscheidungen

Status: **teilweise**

Vorhanden: Windows-Review mit lokalen Redaktionen, fundstellenbezogenen
Ambiguitätsentscheidungen, Zurück/Ändern und technisch gebundenem Skip; Claude kann
weder reviewen noch freigeben. Rest: lokaler Passwortdialog, RAM-only-Secretvertrag,
„Später entscheiden“ und gleichwertige macOS-/Linux-Review-UI.

## BL-040 – Dauerhafter Export

Status: **offen**

Vorhanden: pro Quelle ein geprüftes Markdown-Paket, Manifest, datensparsames Audit,
atomare Veröffentlichung und paketgebundene Leseberechtigung. Rest: wählbarer
dauerhafter Exportordner, neutrale Dateinamen, UTF-8-Mapping-CSV, stapelweites JSON,
Kollisionsschutz und technische Trennung des Mappings von allen MCP-Lesetools.

## BL-041 – Claude-Aufgabe fortsetzen

Status: **teilweise**

Vorhanden: zwei validierte Skills, natürliche Aktivierung, Capability-Stopp,
Upload-Stopp, fortsetzbare Einzelschritte und capability-gebundenes Markdown-Lesen.
Rest: neuer lokale-Auswahl-/Jobweg, Ziel-Formatumfang und installierte Modell-/UI-
Abnahme für natürliche Sprache sowie direkte Skillauswahl auf allen Zieloberflächen.

## BL-042 – Kommunikation und Diagnose

Status: **teilweise**

Vorhanden: datensparsames Diagnosejournal mit fester Whitelist, Statuswerkzeug,
Retention, Rechts-/Zertifizierungsgrenzen und technische Fehlercodes hinter Details.
Rest: explizit exportierbares plattformübergreifendes Diagnosepaket und abschließende
Alltagssprach-/Barrierefreiheitsprüfung.

## BL-050 – 1.000-Dokument-Korpus

Status: **teilweise**

Vorhanden: 150-Fall-Vertragsmatrix, 76 PII-Regressionen, 24 Skill-Szenarien,
20 Explorationsfälle, Parser-/Visual-/Security-Tests und ein messender
Detektorbenchmark. Rest: mindestens 1.000 dokumentartige Fixtures über alle
Zielformate, Layouts, Sprachen und Angriffe sowie die verbindliche Null-Miss-/99-%-
Erhaltungsmetrik.

## BL-051 – Plattform- und Distributionsmatrix

Status: **teilweise**

Vorhanden: Windows-, macOS- und Linux-CI, Windows-Native-Tests, ZIP-/MCPB-Build,
SBOM, Prüfsummen und Quellparität. Rest: echte frische ZIP- und Marketplace-
Installationen, kompletter End-to-End-Weg und Rückrolle auf Windows/macOS/Linux;
CI nutzt derzeit auf macOS/Linux noch eine ausdrücklich eingerichtete Node-Runtime.

## BL-052 – Menschliche Abnahme

Status: **offen**

Vorhanden: dokumentierte UX-, Datenschutz-, Security-, Architektur- und
Claude-Dokumentationsreviews sowie automatisierte native Windows-Formtests. Rest:
beobachtete Abnahme mit normalen Anwendern und Fach-/Datenschutzvertretung auf allen
drei Plattformen. Echtdaten bleiben bis zu einer separaten Pilotentscheidung NO-GO.
