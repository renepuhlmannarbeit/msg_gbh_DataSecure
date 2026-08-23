# Backlog-Archiv – August 2026

Stand: 23.08.2026 · archiviert nach Product-Owner-Abgleich mit
`CURRENT_STATE.md`, `TRACEABILITY.md` und der lokalen Testsuite.

Dieses Archiv enthält ausschließlich Stories, deren Definition of Done im
aktuellen Produktstand erfüllt ist. Es ist kein Freigabenachweis für noch gesperrte
Formate, Plattformen oder Cowork-Oberflächen. Laufende Teilnachweise bleiben im
[aktiven Backlog](BACKLOG.md), im [Ist-Abgleich](CURRENT_STATE.md) und in der
[Traceability](TRACEABILITY.md).

| Story | Abschluss | Nachweis |
|---|---|---|
| BL-001.1 | Open-Source-first-Regel und Komponentenregister verbindlich | DS-038, `OPEN_SOURCE_COMPONENTS.md`, kanonischer Prüftest |
| BL-002.1 | RC30-Istmanifest vollständig und gegen Runtime geprüft | `BUILD_INFO.json`, Manifest- und Runtime-Tests |
| BL-002.2 | Maschinenlesbarer, strikt vom Ist getrennter Zielvertrag | `TARGET_CAPABILITIES.json`, Contract-Test |
| BL-002.3 | Fähigkeitsdrift zwischen Runtime, Skills, Marketplace und Handbüchern blockiert | `test-capability-contract.js` |
| BL-011.1 | Unveränderlicher privater Stapel-Snapshot spezifiziert | `contracts/BATCH_SNAPSHOT_V1.md` |
| BL-011.2 | 100-Dateien-/500-MB-Grenze vor privater Kopie durchgesetzt | `test-batch-session.js` |
| BL-011.4 | Checkpoints und explizite Wiederaufnahme ohne Quellwiederholung | `gateway/batch.js`, Batch-Tests |
| BL-011.5 | Cleanup-Lebenszyklus offener Arbeitskopien umgesetzt | `batch-maintenance.js`, Wartungstests |
| BL-012.1 | Klare Mehrdatei-Stapel ohne Einzeldialog analysiert | `test-batch-session.js` |
| BL-012.4 | Freiwillige Gesamtvorschau bereitgestellt | Batch-Review-Vertrag und Tests |
| BL-024.1 | OCR-Ergebnisvertrag Deutsch/Englisch als Nicht-Release-Vorarbeit abgeschlossen | `contracts/OCR_RESULT_V1.md`, Contract-Test |
| BL-030.1 | Fortsetzbarer Pseudonymvertrag ohne Rohwert-Mappingtabelle | `contracts/BATCH_PSEUDONYM_V1.md` |
| BL-040.1 | Lokaler Exportort, neutrale Namen und Kollisionsschutz | Mapping-/Batch-Tests |
| BL-040.2 | MCP-unsichtbare, formelsichere UTF-8-Mapping-CSV | Mapping-/Batch-Tests |
| BL-040.3 | Stapelweiter, inhaltsfreier JSON-Nachweis | `contracts/BATCH_EVIDENCE_V1.md` |
| BL-042.1 | Bestätigungspflichtiger lokaler Diagnoseexport | `test-diagnostics.js` |
| BL-050.1 | Korpus-Schema und Qualitätsmetriken festgeschrieben | `benchmarks/CORPUS_CONTRACT_V1.json` |
| BL-051.7 | Kostenbegrenzte GitHub-Actions-Policy implementiert | `test-workflow-budget.js` |

Geschlossene Epics: **BL-001**, **BL-002** und **BL-040**. Ihre laufende
Regressionspflege ist Produktpflege und erzeugt keine neue Backlog-Story, solange
sie keine Capability oder Entscheidung verändert.

Die vollständige Zuordnung jeder abgeschlossenen Story zu Dateien, Tests und
Entscheidungen bleibt im Abschnitt „Umsetzungsnachweise erledigter Stories“ der
[Traceability](TRACEABILITY.md) erhalten.
