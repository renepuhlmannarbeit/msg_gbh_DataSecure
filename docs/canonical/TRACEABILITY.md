# Entscheidungs-Traceability

Stand: 22.08.2026

Jede angenommene Entscheidung muss mindestens einer Backlogposition zugeordnet sein.
„Zielnachweis“ beschreibt die verlangte Evidenz, nicht den heutigen RC30-Status.
Konkrete Stories `BL-nnn.x` erben die Entscheidungszuordnung ihres Epics; erledigte
Stories erhalten zusätzlich unten einen überprüfbaren Umsetzungsnachweis.

| Entscheidung | Backlog | Zielnachweis |
|---|---|---|
| DS-001 | BL-042 | Aussagegrenzen in Skill, UI, Ergebnis und Tests |
| DS-002 | BL-010, BL-051 | ZIP- und Marketplace-Abnahme desselben Releases |
| DS-003 | BL-010, BL-041 | Capability-Test je Claude-Oberfläche |
| DS-004 | BL-010, BL-051 | Installation ohne manuelle Runtime auf drei OS |
| DS-005 | BL-041 | exakt zwei sichtbare validierte Skills |
| DS-006 | BL-041 | identischer Lauf per Sprache und Skillauswahl |
| DS-007 | BL-020 bis BL-024, BL-050 | positive Coverage je Zielformat |
| DS-008 | BL-020 bis BL-023, BL-040 | ein vollständiges Markdown je Quelle |
| DS-009 | BL-023, BL-024, BL-050 | kein Bildpixel für Claude, OCR-/Grafiktests |
| DS-010 | BL-011 | 100 Dateien, 500 MB, keine feste Seitenbegrenzung |
| DS-011 | BL-030 | gemischter Stapel ohne Nutzerprofilwahl |
| DS-012 | BL-030, BL-031, BL-050, BL-052 | Erkennungs- und Erhaltungsmetriken |
| DS-013 | BL-012, BL-031, BL-032, BL-052 | genau ein Abschlussdialog |
| DS-014 | BL-012, BL-032 | vertagte Datei bleibt gesperrt und fortsetzbar |
| DS-015 | BL-012, BL-020, BL-023 | unlesbare Datei ohne falsche Teilfreigabe |
| DS-016 | BL-012, BL-032 | Passwort nur lokal und im RAM |
| DS-017 | BL-020, BL-022, BL-050 | Rekursions-/Aktivinhalts-Adversarialtests |
| DS-018 | BL-023, BL-024 | Netzwerkblock und Offline-End-to-End-Test |
| DS-019 | BL-030 | konsistent im Stapel, inkonsistent zwischen Stapeln |
| DS-020 | BL-011 | Original unverändert, offene Kopien nach 14 Tagen weg |
| DS-021 | BL-011 | Crash-/Abbruchfortsetzung ohne Doppelverarbeitung |
| DS-022 | BL-011 | nur ein aktiver Job, pausierte Jobs getrennt |
| DS-023 | BL-040 | fester sicherer Standardordner, Export bleibt bestehen |
| DS-024 | BL-040 | UTF-8-CSV ohne Pfade und außerhalb MCP |
| DS-025 | BL-040 | JSON-Schema und Leckageprüfung |
| DS-026 | BL-042 | expliziter Diagnoseexport und Privacy-Schema |
| DS-027 | BL-032, BL-041, BL-052 | automatische Freigabe plus optionale Vorschau |
| DS-028 | BL-012, BL-024, BL-042, BL-052 | Tastatur-, Skalierungs- und Screenreader-Abnahme |
| DS-029 | BL-030, BL-031 | keine Regelkonfiguration im normalen UI |
| DS-030 | BL-010 | keine Signaturpflicht und keine Signaturbehauptung |
| DS-031 | BL-010, BL-051 | Versionsanstieg, Archiv und getestete Rückrolle |
| DS-032 | BL-041, BL-042 | konsistente Pseudonymisierungs-Klarstellung |
| DS-033 | BL-050, BL-052 | 1.000 Fälle, null Pflicht-Misses, ≥99 % Erhalt |
| DS-034 | BL-010, BL-051 | vollständige Drei-Plattform-Matrix |
| DS-035 | BL-002, BL-020 | migrationsfähige Verträge und grüne Regression |
| DS-036 | BL-011, BL-012 | Fortschritt, sicherer Abbruch und Fortsetzung |
| DS-037 | BL-024 | Deutsch-/Englisch-OCR und gemischtsprachige Tests |
| DS-038 | BL-001, BL-010 bis BL-052 | Komponentenregister, Prüfgate und begründete Restlücke vor Eigenentwicklung |

## Umsetzungsnachweise erledigter Stories

| Story | Nachweis |
|---|---|
| BL-002.1 | `BUILD_INFO.json`, `manifest.json`, `gateway/status.js`, `test-manifest.js` |
| BL-002.2 | `TARGET_CAPABILITIES.json` deckt DS-001 bis DS-037 sowie Formate, Plattformen und Grenzwerte maschinenlesbar ab |
| BL-002.3 | `test-capability-contract.js` vergleicht Ist-/Zielvertrag, Runtime, Skills, Marketplace und aktive Handbücher; Bestandteil von `npm test` |
| BL-011.1 | `contracts/BATCH_SNAPSHOT_V1.md` und `test-architecture-contracts.js` definieren und prüfen den unveränderlichen privaten Snapshot |
| BL-011.6 (Teilnachweis) | `zip-reader.js`, `gateway/batch.js`, `test-parsers.js` und `test-batch-session.js` belegen eine reine lokale DOCX-ZIP-Verzeichnisprüfung vor dem Snapshot sowie die Sperre ohne neue Arbeitskopie bei übergroßen oder unsicheren Containerdaten |
| BL-011.5 (Teilnachweis) | `gateway/batch.js`, `index.js` und `test-batch-session.js` belegen die globale Owner-Sperre für Startup-Recovery und periodische Ablaufbereinigung; ein lebender Batch wird weder umklassifiziert noch bereinigt |
| BL-011.7 (Teilnachweis) | `gateway/batch.js`, `gateway/status.js`, der Dokument-Skill sowie Batch-/MCP-Tests belegen einen inhaltsfreien Aktiv-Wahrheitswert, der konkurrierende Auswahl- und Fortsetzungsdialoge verhindert |
| BL-012.1 (Teilnachweis) | `gateway/batch.js`, `companion/text-review.js` und `test-batch-session.js` belegen, dass der zentrale Input-Ordner-Batch eine Zertifikats-/Organisations-Mehrdeutigkeit nur lokal entscheidet, Entwurfsdaten nicht journalisiert und einen Abbruch terminal festhält |
| BL-012.2 (Teilnachweis) | `contracts/BATCH_REVIEW_V1.md`, `gateway/batch.js`, `companion/text-review.js` und `test-batch-session.js` binden das in-memory Batch-Entwurfsmodell an versiegelte Arbeitskopien, anonyme Dokumentnummern, globale lokale Fundstellen-IDs und eine ohne Rohtext/Namen/Pfade rückführbare Entscheidung. `review_deferred_document_batch` ruft genau einen lokalen Reviewer auf und veröffentlicht erst danach atomare Einzelpakete; die Windows-Ansicht sperrt freie Bereichsredaktionen im Stapelmodus. Tatsächliche native Ein-Fenster-Parität und Drei-OS-Abnahme bleiben offen |
| BL-032.1 (Teilnachweis) | `companion/text-review.js` und `test-companion-processor.js` belegen Beibehalten, Anonymisieren, Abbrechen, batchgebundenes Vertagen sowie einen lokal erneut durchlaufenen „Zurück / ändern“-Schritt auf allen Adapterpfaden. Praktische native Drei-OS-/Barrierefreiheitsabnahme bleibt offen |
| BL-011.3/4 (Teilnachweis) | `gateway/batch.js`, `test-batch-session.js` und `test-mcp-protocol.js` belegen Ein-Stapel-Sperre, atomar gesperrte Startup-Recovery mit Dateiname-/Tokenbindung, Crash-zu-Retryable auch nach zuvor übersprungener Live-Recovery, explizite Fortsetzungsbestätigung sowie die verifizierte erneute Zustellung eines bereits veröffentlichten Pakets ohne Quellwiederholung |
| BL-040.1 | `gateway/common.js`, `gateway/mapping.js`, `gateway/batch-evidence.js` und `test-batch-session.js` belegen den festen sicheren Exportort, atomare Ledger und kollisionssichere Ergebnis-Pakete |
| BL-040.2 | `gateway/mapping.js`, `gateway/batch.js` und `test-batch-session.js` belegen atomare lokale Mapping-CSV, Formelschutz und das Ausbleiben von Dateinamen in MCP-Ergebnissen |
| BL-040.3 | `contracts/BATCH_EVIDENCE_V1.md`, `gateway/batch-evidence.js`, `gateway/batch.js` und `test-batch-session.js` belegen den atomaren JSON-Nachweis mit geschlossenem Feldsatz, aggregierten Zählern sowie eine explizite Leckageprobe gegen Namen, Pfade, Inhalte, Hashes und Batch-/Paket-IDs |
| BL-042.1 | `gateway/diagnostics.js`, `index.js` und `test-diagnostics.js` belegen den bestätigungspflichtigen lokalen Diagnoseexport, Programmprüfsummen und die Abwesenheit von Namen, Pfaden, Rohinhalten und Dokumentidentifikatoren |
| BL-030.1 | `contracts/BATCH_PSEUDONYM_V1.md` und `test-architecture-contracts.js` definieren restart-stabile stapelweite Pseudonyme ohne Rohwerttabelle |
| BL-030.2 (Pilot, kein Release) | `server/batch-secret-store.js` und `test-batch-secret-store.js` belegen einen dynamischen nativen Keyring-Adapter mit festem Servicenamen, opakem Batch-Account, 256-Bit-Secret und fail-closed Unverfügbarkeit ohne Datei-/Umgebungsvariablen-Fallback; Drei-OS-Bundle-Evidenz bleibt offen |
| BL-030.2 (Integrationsvertrag) | `contracts/BATCH_SECRET_STORE_V1.md` und `test-architecture-contracts.js` pinnen Kandidat/API/Zielartefakte und die erforderlichen Offline- sowie Negativnachweise vor einer produktiven Aktivierung |
| BL-030.2 (Ableitungspilot, kein Release) | `server/batch-pseudonym-registry.js`, `gateway/compliance.js`, `gateway/orchestrator.js` und `test-batch-pseudonym-registry.js` belegen Unicode-stabile HMAC-/Base32-Pseudonyme, Typ-/Batchtrennung, Kollisionsverlängerung, die interne Übergabe durch den normalen Rest-PII-Gate und das Löschen des rein flüchtigen Registry-Kontexts; der MCP- und aktive Batchpfad erzeugt ihn nicht |
| BL-030.2 (Store-Matrix vorbereitet) | `native/keyring/pilot`, `test-keyring-pilot.js` und `keyring-pilot.yml` pinnen alle Zielartefakte und definieren einen inhaltsfreien nativen Set/Get/Delete-Nachweis; nur der lokale Windows-Smoke-Test liegt vor, die Drei-OS-Evidenz bleibt offen |
| BL-001.1 | `OPEN_SOURCE_COMPONENTS.md`, DS-038 und `verify-canonical-docs.mjs` erzwingen Open-Source-Prüfung für jedes Epic |
| BL-024.1 | `contracts/OCR_RESULT_V1.md`, Schema, Normalisierer und Lauf `32596426359` belegen Wortpositionen, Konfidenz, Sprachen, Fehler und Ressourcengrenzen auf vier Zielarchitekturen |
| BL-021.1 (Teilnachweis) | `document-parser.js`, `runtime.js`, `gateway/common.js`, `gateway/orchestrator.js`, Companion-IPC sowie Gateway-/Companion-End-to-End-Tests belegen `.md` und `.markdown` über denselben isolierten UTF-8-, Content-Graph-, PII- und Residual-Gate-Pfad wie TXT. Externe Markdown-Referenzen werden nicht geladen, sondern als Text geprüft; praktische Drei-OS-Abnahme bleibt offen. |
| BL-021.2 (Teilnachweis) | `contracts/CSV_SOURCE_V1.md`, `document-parser.js`, `runtime.js`, `gateway/common.js`, `gateway/orchestrator.js`, Companion-IPC sowie Gateway-/Companion-End-to-End-Tests belegen `.csv` über denselben isolierten UTF-8-, Content-Graph-, PII- und Residual-Gate-Pfad wie TXT. Der Parser veröffentlicht nur eine Markdown-Tabelle und führt Zellen nie aus; praktische Drei-OS-Abnahme bleibt offen. |
| BL-022.1 (Teilnachweis) | `ooxml.js`, `contracts/DOCX_STORY_COVERAGE_V1.md` und `test-parsers.js` belegen die verpflichtende eindeutige interne Root-`officeDocument`-Beziehung mit renderbarem `w:document`-/`w:body`-Pfad, die bildtypsichere interne `image`-Reachability und für sekundäre DOCX-Stories die sperrende, inhaltsfreie Behandlung verwaister, fehlender, traversierender, externer, doppelter und typfalscher Beziehungen oder Story-Wurzeln. Die vollständige positive Relationship-Matrix bleibt offen. |
| BL-022.2 (Vorarbeit) | `ooxml.js`, `test-parsers.js` und `test-content-graph.js` belegen die eindeutige interne OPC-Wurzel auf `xl/workbook.xml`, dass XLSX-Blatttext nur über eine eindeutige interne `worksheet`-Relationship, Drawing-Text nur über ein erreichtes `drawing`, Chartdaten nur über dessen `chart` und `xl/media/` nur über interne `image`-Relationships gerendert wird; verwaiste, externe und typfalsche Ziele sowie Formelzellen mit oder ohne Cachewert bleiben inhaltsfrei gesperrt. XLSX ist weiterhin nicht freigegeben. |
| BL-022.3 (Vorarbeit) | `ooxml.js`, `test-parsers.js` und `test-content-graph.js` belegen die eindeutige interne OPC-Wurzel auf `ppt/presentation.xml`, dass PPTX-Folien nur über interne `slide`-Relationships aus `presentation.xml`, Notizen nur über interne `notesSlide`-Relationships der Folie, Chartdaten nur über deren `chart` und `ppt/media/` nur über interne `image`-Relationships verarbeitet werden. PPTX ist weiterhin nicht freigegeben. |

Offener Nachweis: `contracts/PDF_OCR_RISK_GATE_V1.md` ist das Prüfprotokoll für
BL-023.1. Es ist ausdrücklich kein Erledigungsnachweis, solange Pflichtzellen offen
sind. `pdf-ocr-risk.lock.json`, `pdf-ocr-risk.mjs` und der manuelle
`pdf-ocr-risk.yml`-Workflow liefern reproduzierbare Pins und Drei-Plattform-
Preflights, aber bewusst noch keine Produktfreigabe. GitHub-Actions-Lauf
`32593313169` auf Commit `fdd2a02` belegt die erfolgreiche Ausführung auf Windows
x64, macOS x64, macOS ARM64 und Linux x64 sowie das erwartete NO-GO der
Windows-Community-Probe. Die Artefakte weisen ausdrücklich `passed_gates: []`, alle
elf offenen Gates, `PDF_COVERAGE_UNVERIFIED` und `release_decision: no_go` aus.

Der alternative Open-Source-Pilot ist ebenfalls noch kein Erledigungsnachweis:
GitHub-Actions-Lauf `32594467568` auf Commit `b622278` belegt PDF.js 6.2.108 und
Canvas 1.0.7 auf Windows x64, macOS x64, macOS ARM64 und Linux x64. Lokale
Byte-Eingabe, Text, Rendering und Action-Erkennung bestanden ohne beobachteten
Netzwerkversuch; alle Artefakte melden weiterhin `passed_gates: []`,
`PDF_COVERAGE_UNVERIFIED` und `release_decision: no_go`.

Auch der OCR-Pilot ist noch kein Erledigungsnachweis: GitHub-Actions-Lauf
`32594838193` auf Commit `b6ce3ad` belegt Tesseract.js/tesseract.js-core 7.0.0,
Canvas 1.0.7 sowie hashgeprüfte lokale Deutsch-/Englischmodelle auf Windows x64,
macOS x64, macOS ARM64 und Linux x64. Die gemischtsprachige synthetische Probe
bestand unter Prozess-Netzwerksperre mit 95 Prozent mittlerer Konfidenz; alle
Artefakte melden weiterhin `passed_gates: []`, `OCR_COVERAGE_UNVERIFIED` und
`release_decision: no_go`.

GitHub-Actions-Lauf `32595199861` auf Commit `fcb55ed` ergänzt für den OCR-Piloten
auf allen vier Plattformen offizielle CycloneDX-1.5-SBOMs. Die Evidenz bestätigt je
Plattform 25 gelockte Paketkomponenten, vollständige Paketintegritäten, ausschließlich
Apache-2.0/MIT/BSD-2-Clause sowie Commit-/Größen-/Hashprüfung der Modelle und ihrer
Apache-2.0-Lizenz. Die Lizenz-/SBOM-Pflichtzelle bleibt wegen fehlender vollständiger
Notices, Schwachstellenrichtlinie und echtem Auslieferungspaket weiterhin offen.

GitHub-Actions-Lauf `32595454727` auf Commit `fa34c91` belegt die isolierte
OCR-Technikprobe auf Windows x64, macOS x64/ARM64 und Linux x64. Prozessgrenze,
Netzwerkverbot, Node-Heap, Wächter und Ausgabegrenze bestanden einschließlich
Timeout-/Flood-Gegenproben; Windows besitzt darüber hinaus Job-Object-RAM-/CPU-
Grenzen. Native harte macOS/Linux-Ressourcengrenzen, Runtime-Integration,
Angriffskorpus und frisches Pluginpaket bleiben offen, deshalb ist dies kein
Erledigungs- oder Freigabenachweis.

Der normalisierte OCR-Vertrag ist in `contracts/OCR_RESULT_V1.md`,
`contracts/ocr-result-v1.schema.json` und `native/ocr/pilot/ocr-contract.mjs`
nachvollziehbar. `test-ocr-result-contract.mjs` prüft acht Positiv- und Negativfälle;
`test-architecture-contracts.js` verhindert das Entfernen von Blockanforderung,
Schema, Konfidenz-/Reviewregeln und Workflowtest. Der echte lokale Windows-Pilot
lieferte 14 positionierte Wörter, 95 Prozent mittlere Konfidenz und weiterhin
`OCR_COVERAGE_UNVERIFIED`/`no_go`. GitHub-Actions-Lauf `32596087930` auf Commit
`f53f5df` bestätigt Vertrag, echte OCR und Negativtests auf Windows x64, macOS
x64/ARM64 und Linux x64. Native harte macOS/Linux-RAM-/CPU-Grenzen fehlen noch,
deshalb ist BL-024.1 nicht erledigt.

Die noch unbelegte POSIX-Grenze ist als Quelltext
`native/ocr/pilot/posix-sandbox.c` und als Adapteränderung in `isolated-run.mjs`
prüfbar. Der Workflow kompiliert mit `cc -std=c11 -O2 -Wall -Wextra -Werror` und
fordert auf macOS x64/ARM64 sowie Linux x64 positive OCR-, Speicher-, CPU-, Zeit- und
Ausgabeproben. Bis ein erfolgreicher Lauf vorliegt, ist das nur Implementierung und
kein Plattformnachweis.

Der erste Buildlauf `32596337378` ist ein bewahrter Negativnachweis: Windows und
Linux bestanden, macOS x64/ARM64 scheiterten sicher vor OCR, weil `_POSIX_C_SOURCE`
die für `libproc.h` erforderlichen Darwin-Typen ausblendete. Die Korrektur verwendet
auf Apple `_DARWIN_C_SOURCE`; danach wurde vollständig neu geprüft.

Die Korrektur ist durch Lauf `32596426359` auf Commit `4c9f0ec` belegt. Windows x64,
macOS x64/ARM64 und Linux x64 bestanden Build, echten gemischtsprachigen OCR-Lauf,
V1-Vertrag, Offline-Grenze sowie RAM-, CPU-, Zeit- und Ausgabeflut-Gegenproben.
Damit ist BL-024.1 erledigt. Die Artefakte melden weiterhin
`OCR_COVERAGE_UNVERIFIED` und `no_go`, weil Bündelung und Produktintegration zu
BL-024.2 gehören.

Die BL-024.2-Vorarbeit ist über `scripts/build-ocr-runtime.mjs`,
`native/ocr/pilot/runtime-worker.mjs`, `test-ocr-runtime-bundle.mjs` und
`test-ocr-runtime-smoke.mjs` nachvollziehbar. Das lokale Windows-x64-Artefakt besitzt
241 inventarisierte Dateien, 13 Runtime-Komponenten, rund 57,5 MB, beide Modelle und
einen geprüften nativen Launcher; echter Offline-OCR- und leerer inhaltsfreier
Fehlerlauf bestehen. GitHub-Actions-Lauf `32597030060` auf `7427b3c` belegt Bundle-Build,
Hash-/Lizenzinventarprüfung und echten Offline-OCR-Smoke-Test zusätzlich auf macOS
x64/ARM64 und Linux x64. Der vollständige MIT-Fallback für exakt `tr46@0.0.3` ist
lokal ergänzt; unbekannte fehlende Lizenztexte brechen den Build ab. Das Manifest
bleibt `release_enabled: false`; frische Installationen sind offen.

Der gesperrte Produktadapter ist über `plugins/data-secure/server/portable-ocr.js`
und `tests/test-portable-ocr-adapter.js` nachvollziehbar. Er akzeptiert nur ein
vollständig inventarisiertes und gehashtes Zielbundle mit expliziter Freigabe,
verwirft zusätzliche Dateien und Links und bestätigt die Worker-Beendigung vor einer
Timeout-/Ausgabegrenzen-Antwort. Der aktuelle Pluginbaum enthält das Bundle nur mit
deaktiviertem Freigabegate; die veröffentlichte Capability-Matrix bleibt deshalb
unverändert.

Der Download von Lauf `32597030060` deckte fehlende versteckte npm-Dateien in den
hochgeladenen Artefakten auf. `assemble-ocr-runtime.mjs` stoppte beim ersten fehlenden
Manifesteintrag. Der Workflow verlangt nun `include-hidden-files: true`; Lauf
`32597783210` auf `df1c85f` belegt die erneut heruntergeladenen Artefakte und den
Universal-Assembler.

`scripts/assemble-ocr-runtime.mjs`, `test-ocr-universal-assembler.mjs` und
`test-ocr-universal-bundle.mjs` definieren den universellen V2-Nachweis. Der
synthetische Test belegt exakte Zielmenge, einfache Modellkopie, vier Launcher,
Adapterkompatibilität und den Stopp bei plattformspezifisch abweichendem gemeinsamen
Kern. Der nachgelagerte Download-/Assembly-/Offline-OCR-Job in Lauf `32597783210`
ist grün. Ein erneuter lokaler Artefaktdownload bestand die Hashprüfung mit 244
Dateien und 57.592.942 Bytes; das Freigabeflag bleibt aus.

`build-portable-plugin.mjs`, `verify-portable-plugin-zip.mjs` und
`test-zip-permissions.mjs` bilden die nächste Paketgrenze. Lokal wurden 319 ZIP-
Einträge und 22.033.239 Bytes vollständig gegen Pluginquelle und V2-Manifest geprüft.
Die drei POSIX-Launcher tragen `0755`, alle anderen Einträge deterministisch `0644`.
Der kanonische Pluginbaum enthält nun dasselbe gesperrte V2-Bundle. Die Datei
`ocr-runtime.provenance.json` bindet es an Lauf `32597783210`, Commit
`df1c85fee38ce5f94488ee267c38f410614081a2` und Manifest-SHA
`4497c0db499493429d12b9af7aaa2bb2b437878c8877eb3cf325947d2d341098`.
`build-plugin.mjs`, `verify-plugin-zip.mjs`, der Capability-Vertrag und der neue
obligatorische Universal-Bundle-Test prüfen diese Bindung sowie alle 244 Dateien.
Der lokale Paketierungs-Checkpoint `75da6c5` ergab 320 Einträge, 22.033.607 Bytes und SHA-256
`6d3883745cfb01f444fecfcfffe77e7515eac0cf84c81e009420a4c07f2b5cf3`.
Der Cloud-Nachweis für Doppelbuild und echte Extraktion ist noch offen: Lauf
`32598196806` wurde vor dem ersten Schritt durch das GitHub-Abrechnungs-/Ausgabenlimit
verhindert und ist daher kein Code- oder Testfehler.

BL-020.1 beginnt mit `docs/canonical/contracts/CONTENT_GRAPH_V1.md`, dem strikten
JSON-Schema, `server/content-graph.js` und `test-content-graph.js`. Die produktive
Parsergrenze erzeugt und validiert den Graph zwingend; Legacy-Ergebnisse ohne Graph,
ungebundene Assets, doppelte IDs, zusätzliche Rohtextfelder, Traversal-Fragmente und
Positionen außerhalb des normalisierten Markdown werden abgelehnt. Neun Tests
belegen Text-, Tabellen- und Bildknoten, die fail-closed Isolationsgrenze und
containerinterne Abschnitts-Locators für DOCX-Hauptteil/Kopfzeile/Kommentare,
XLSX-Arbeitsblatt/Diagramm/Zeichnung sowie PPTX-Folie/Notizen/Diagramm. Sie belegen
außerdem, dass die internen Abschnittstexte nicht zusätzlich über die Parsergrenze
ausgegeben werden. Der Parser-Test `OOXML personal and custom metadata is extracted
for the privacy gate` belegt zusätzlich die Ausgabe von Autor, letztem Bearbeiter,
Manager, Unternehmen und benutzerdefinierten Eigenschaften ohne falsche DOCX-
Coverage-Warnung. `OOXML complex custom metadata fails closed instead of being
flattened silently` belegt, dass komplexe Eigenschaftstypen weder als vollständig
ausgegeben noch freigegeben werden. `DOCX secondary stories retain structured text
before the privacy gate` belegt Kopf-/Fußzeile, Kommentar, Fuß- und Endnoten mit
Tabs/Umbrüchen sowie die nachfolgende Anonymisierung; der Vertrag
`DOCX_STORY_COVERAGE_V1.md` hält die noch gesperrten Story-Typen fest. Grundlage für
die Paketorte und Kernfelder ist die offizielle
Microsoft-Dokumentation zum [Core-Properties-Part](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/opc/finding-the-core-properties-part);
eine zusätzliche XML- oder Office-Runtime wurde dafür nicht eingeführt. Als
externe Semantikreferenz dienen ausschließlich die offiziellen W3C-Definitionen für
halb offene [Text Position Selectors](https://www.w3.org/TR/annotation-model/#text-position-selector)
und [Fragment Selectors](https://www.w3.org/TR/annotation-model/#fragment-selector);
es wurde keine zusätzliche Runtime übernommen. Die Formatfreigabe bleibt
unverändert.

Der zehnte Content-Graph-Vertragstest `validation rejects hidden text gaps,
overlapping nodes, reordered ids and text after images` schließt die Validatorlücke:
fortlaufende IDs, geordnete nicht überlappende Textbereiche, vollständige Abdeckung
aller Nicht-Leerraumzeichen und die Reihenfolge Text vor Assets sind jetzt zwingend.
Damit ist ein syntaktisch valider, aber inhaltlich lückenhafter Parsergraph kein
akzeptierter Coverage-Nachweis.

Der elfte Test `embedded OOXML locators retain the complete container chain` belegt,
dass auch rekursive Einbettungen bis zum inneren OOXML-Part eindeutig lokalisierbar
bleiben.

BL-020.2 startet mit `contracts/EMBEDDED_CONTENT_V1.md` und den Parserfällen
`supported embedded OOXML packages are parsed recursively with prefixed locators`,
`embedded OOXML recursion stops at the shared depth limit`, `embedded OOXML count
and byte budgets are fixed and fail closed`, `corrupt supported embeddings and
active XLSX content remain blocked`, `XLSX and PPTX external or unsupported embedded
content fail closed without leaking targets` sowie `supported embedded extensions do
not override active OOXML relationships` und `orphaned or ambiguous OOXML embeddings
are never parsed by filename alone`. Sie belegen die gemeinsame Grenze von 3 Ebenen,
20 Dokumenten, 50 MiB Archiv- und 100 MiB entpackten Bytes, inhaltsfreie Fehler und
die Blockade aktiver Inhalte; das Entpackbudget greift vor der Dekompression und nur
eindeutige interne Paketbeziehungen machen eine Einbettung verarbeitbar.
`embedded OOXML locators retain the complete container chain` belegt die Quellenkette
im Content-Graph. Als Referenzen dienen der offizielle
Microsoft-[EmbeddedPackagePart](https://learn.microsoft.com/en-us/previous-versions/office/office-12/bb497741(v=office.12))-Vertrag
und die dokumentierten Sicherheitsgrenzen von
[Mammoth](https://github.com/mwilliamson/mammoth.js/). Mammoth bleibt
Differentialorakel: Seine eigene Dokumentation warnt vor externem Dateizugriff und
pathologischer Ressourcenlast, weshalb es die isolierte Produktgrenze nicht ersetzt.

BL-020.3 beginnt mit `contracts/NETWORK_BOUNDARY_V1.md`, dem vor Parser und Companion
geladenen `server/network-deny.cjs` und `test-network-boundary.js`. Der Test versucht
DNS, HTTP(S), TCP/TLS, UDP, HTTP/2, Fetch, WebSocket und Listener tatsächlich und
verlangt vor Socket-Erzeugung ausschließlich `DATASECURE_NETWORK_DENIED`. Ein zweiter
Fall kombiniert denselben Guard mit dem produktiven Node-Berechtigungsmodus; der
dritte pinnt die Startargumente beider Rohdatenprozesse. Ein
Sieben Verträge in `test-ui-process-policy.js` binden jeden nativen Dialog an eine
explizite Datenklasse und ein bereinigtes Environment. Sie belegen, dass Windows-
und macOS-Textreview Rohtext ausschließlich per `stdin` erhalten und Linux-Zenity
beziehungsweise KDialog Fundstellenkontext nur per `stdin` beziehungsweise
`/dev/stdin`; alle anderen UI-Helfer bleiben inhaltsfrei, sämtliche Starts erfolgen
ohne Shell und feste Skripte enthalten keine Netzwerkprimitive.
`text_review.os_network_sandbox_verified` bleibt
absichtlich `false`; Export erfolgt im bereits geschützten Companion und erzeugt
keine zweite Rohinhaltsgrenze. Die lokale Windows-x64-Zelle ist belegt. Da die
bestehende `ci.yml` das vollständige `npm test` auch auf macOS und Linux ausführt,
sind keine getrennten Testimplementierungen nötig; deren frische Läufe und das
native OS-Netzwerkgate für die rohen Textprüfungen bleiben aber ausdrücklich
offen.
Grundlage sind das offizielle [Node-Berechtigungsmodell](https://nodejs.org/download/release/v22.17.0/docs/api/permissions.html)
und die dokumentierte frühe CommonJS-Vorladung über
[`--require`](https://nodejs.org/api/cli.html).

BL-021.1 beginnt mit `contracts/TEXT_SOURCE_V1.md`, dem fatalen UTF-8-Decoder in
`server/document-parser.js` und acht Fällen in `test-text-source.js`. Sie belegen
BOM-/NFC-/LF-Normalisierung, die Ablehnung ungültiger Bytes und unsichtbarer
Steuerzeichen, quelltreue CommonMark-/GFM-Struktur, inertes Raw HTML, Frontmatter,
Links und Bildsyntax, PII-Prüfung innerhalb von Markup, vollständige Graphpositionen
sowie eine große deterministische Quelle. Die Prüfung von
[markdown-it](https://github.com/markdown-it/markdown-it) ist im OSS-Register
dokumentiert; der Renderer wird nicht zum Produktpfad. Da End-to-End-, Paket-,
Skill- und Drei-OS-Gates noch fehlen, bleibt Markdown im Ist-Manifest gesperrt.

BL-021.2 beginnt mit `contracts/CSV_SOURCE_V1.md`, dem strikten lokalen
RFC-4180-Parser in `server/document-parser.js` und neun Fällen in
`test-csv-source.js`. Diese prüfen Quote-/Zeilenumbruchtreue, drei Dialekte,
Mehrdeutigkeit, Breiten- und Syntaxstopps, Header-Normalisierung, inerte
Formelwerte, PII in Kopfzeilen-/Datentabellen, UTF-8/Graph und deterministische große
Tabellen. Die horizontale Tabellenstruktur ist außerdem als expliziter Person-/Org-
Kontext in `privacy/entities.js` erfasst. [Papa Parse](https://github.com/mholt/PapaParse)
bleibt der noch ausstehende gepinnte Differentialtest; CSV bleibt bis zu dessen sowie
End-to-End-, Paket-, Skill- und Drei-OS-Evidenz geschlossen.
