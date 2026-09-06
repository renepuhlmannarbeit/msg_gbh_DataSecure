# Open-Source-Wiederverwendungsregister

Stand: 06.09.2026 · DS-038, DS-075, DS-082, DS-085, DS-086

Dieses Register trennt **ausgelieferte Laufzeit**, **Build-/Testwerkzeug** und
**nicht aktivierten Piloten**. Die Integration im Quellcode ist keine
Zielhost- oder Endnutzerfreigabe. Versionen und Integritäten stehen in
`package-lock.json`, den Runtime-Locks und der jeweiligen Paket-SBOM.

## Aktuell verwendete Komponenten und Produktgrenzen

| Komponente | Verwendung | Grenze |
|---|---|---|
| Node.js / eigene DataSecure-Parser | Gemeinsamer lokaler Kern; zielgebunden mitgelieferte Runtime | Keine Anwenderinstallation; Anonymisierung nur TXT/Markdown/CSV/DOCX. |
| Tauri 2 / Rust | Eigenständige Desktop-Hülle, native Dialoge, Lifecycle, private IPC | Nur Standalone. Rust ist ausschließlich Buildvoraussetzung. Windows-Engineering vorhanden; native Mac-Nachweise und Bedienabnahme offen. |
| PDF.js, Canvas, Tesseract.js/-core, lokale DE/EN-Modelle | Gebündelter isolierter Standalone-Konvertierungsworker für Text-/Scan-PDF und Bilder | Aktiv nur für `markdown-only`, kein Online-OCR, keine entsprechende Formatfreigabe im Cowork-Plugin oder Anonymisierungsmodus. |
| Ajv 8.20.0 (MIT) + esbuild 0.28.2 (MIT) | Build-time-Erzeugung des MCP-Validators aus dem einzigen Toolkatalog | Plugin lädt selbsttragendes JS samt lizenziertem Unicode-Längenhelper. Kein Ajv-npm-Paket, kein Codegenerator zur Laufzeit; nicht in Standalone. |
| Microsoft MarkItDown 0.1.7 (MIT) | Optionales deaktiviertes DOCX-Differentialorakel | Weder Python noch MarkItDown ist eine produktive Konvertervoraussetzung. Keine zusätzliche Formatfreigabe durch das Orakel. |
| Mammoth, Papa Parse, markdown-it, fflate | Unabhängige Parser-/Format-Testorakel | Keine alleinige Sicherheits- oder Releaseentscheidung. |
| Playwright Core 1.63.0 / axe-core 4.11.1 | Engineering-UI-/Zugänglichkeitsprüfung im bereits installierten Microsoft Edge | Exakt gepinnte Dev-Abhängigkeiten; kein Browserdownload, kein Anwenderpaket und kein Ersatz für native Bedienabnahme. |
| MCP-App-SDK / ext-apps | Separater deaktivierter Statuskartenpilot | Keine aktive Hostfreigabe; kein Zugang zu Rohinhalten. Vollständige Lizenztexte im Pilotbundle. |

Der Standalone-Paketbau erzeugt zusätzlich `RUST-LICENSE-INVENTORY.json` aus
`cargo metadata --offline --locked --filter-platform`. Er traversiert nur die
für das konkrete Ziel erreichbaren Normal-/Build-Abhängigkeiten, schließt reine
Dev-Kanten aus und bricht bei fehlender Lizenz- oder `license_file`-Angabe ab.
Das aktuelle Windows-x64-Paket bindet 259 Komponenten ohne `NOASSERTION`
komponentengenau an `SBOM.spdx.json`; die Paketprüfung vergleicht beide Dateien.

Standalone-Konvertierung unterstützt TXT, Markdown, CSV, DOCX, XLSX, PPTX,
Text-/Scan-PDF sowie PNG/JPEG/BMP im eigenen Zweckvertrag. Zwischenprodukte
und Ausgabehinweise sind von geprüften anonymisierten Ergebnissen getrennt.
XLSX-Strukturprüfung nutzt den begrenzten lokalen XML-Reader, keine Office-
Automation. DOCX-/OPC-Sicherheitsparser bleiben unabhängig, bis eine eigene
Migration nachgewiesen ist.

## Aufnahme- und Änderungsgate

Die Wiederverwendungsprüfung bleibt für alle aktiven Epics verbindlich:

| Backlogbereiche | Aktueller Wiederverwendungsentscheid |
|---|---|
| BL-001, BL-002, BL-003 | Markdown-/JSON-Kanon, vorhandene Driftprüfungen und generierte Ajv-Schemavalidierung; kein externer Planungsdienst nötig. |
| BL-010, BL-051 | Offizielle Node-/Tauri-/OS-Werkzeuge und bestehender Paketbuilder; neue Runtime erst nach eigenem Paketnachweis. |
| BL-011, BL-040, BL-044 | Bestehende Journal-, Export-, Lock- und Admissionbausteine wiederverwenden; allgemeine Dateibibliotheken ersetzen keine produktgebundenen Wiederaufnahmeverträge. |
| BL-012, BL-032, BL-052 | Native lokale Auswahl/Review und Playwright-/Zugänglichkeitsprüfungen; kein Agent entscheidet anstelle des Anwenders. |
| BL-020, BL-021, BL-022, BL-049 | Vorhandene strukturierte Parser und unabhängige Format-Testorakel; kein bloßer Dateiendungs- oder Konvertererfolg als Sicherheitsfreigabe. |
| BL-023, BL-024 | PDF.js/Canvas/Tesseract nur im genannten Konvertierungszweck; Anonymisierungsausbau bleibt eigenes Gate. |
| BL-030, BL-031, BL-050 | Vorhandene Pseudonymregistry, Kontextkataloge und synthetischer Korpus; Presidio/Property-Frameworks bleiben mögliche Orakel, keine aktive Erkennungsruntime. |
| BL-041, BL-042, BL-043 | Schmaler MCP-/Skill-Vertrag und inhaltsfreie lokale Diagnose; keine weitere Agenten-/Cloudschicht. |
| BL-047 | Bestehende Ressourcenbudgets und gemessene Worker-Lifecycle-Verträge; Parallelisierung nur nach Mess- und Determinismusnachweis. |

1. Gepinnte Herkunft, Lizenztexte, Integrität und transitive/native SBOM.
2. Lokale Snapshot-Bytes, keine URL-Konvertierung, Telemetrie oder Downloads.
3. Grenzen für Speicher, Laufzeit, Rekursion und Ausgabe; isolierter Worker.
4. Echte Inhaltspfad- und Negativtests zusätzlich zu Mocks und Schema-Tests.
5. Zielbezogene Pakete und Offline-Nachweise; kein stiller Runtime-Fallback.
6. Diagnose ohne Rohtext, Pfade, Namen, Mappingwerte oder freie Exceptions.
7. Produkt-/Zweckgrenze explizit prüfen; Konverteraktivierung erweitert kein
   Anonymisierungsgate.

Ajv folgt dem offiziellen [zweistufigen Generatorverfahren](https://ajv.js.org/standalone.html).
Nach einer Tool-Schemaänderung:
`node scripts/generate-mcp-validators.mjs --write`.
Ohne `--write` prüft derselbe Befehl Bytegleichheit. Startup bindet den
generierten Validator an den Kataloghash; `test-mcp-input-validation.mjs`
prüft Reproduzierbarkeit und Schemaausführung. Diagnose speichert nur
`MCP_ARGUMENT_INVALID`, nie Ajv-Fehlerdetails aus Eingaben.

## Nicht aktivierte Alternativen und Historie

Die früheren Kandidatenbewertungen samt Primärquellen und datierten
Engineering-Läufen stehen vollständig im
[archivierten Auswahlregister](../archive/2026-09/OPEN_SOURCE_COMPONENTS_BEFORE_RC109.md).
Sie sind keine aktuelle Implementierungs- oder Lieferzusage. Dies betrifft
insbesondere den früher geplanten produktiven Python-/MarkItDown-Worker,
SEA-/Universal-OCR-Piloten und Keyring. Die aktiven Entscheidungen bleiben in
[DECISIONS.md](DECISIONS.md), Entwicklung und Evidenz in
[BACKLOG.md](BACKLOG.md) und [BACKLOG_EVIDENCE_MATRIX.md](BACKLOG_EVIDENCE_MATRIX.md).

Cloud-OCR, CDN-Nachladen, Office-/LibreOffice-Automation und zusätzliche
Agent-Frameworks bleiben außerhalb des Normalwegs. Copyleft-/kommerziell
lizenzierte PDF-Engines werden nicht still in ein Paket übernommen.
