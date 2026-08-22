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
| DS-023 | BL-040 | Standardordner wählbar, Export bleibt bestehen |
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
| BL-030.1 | `contracts/BATCH_PSEUDONYM_V1.md` und `test-architecture-contracts.js` definieren restart-stabile stapelweite Pseudonyme ohne Rohwerttabelle |
| BL-001.1 | `OPEN_SOURCE_COMPONENTS.md`, DS-038 und `verify-canonical-docs.mjs` erzwingen Open-Source-Prüfung für jedes Epic |

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
