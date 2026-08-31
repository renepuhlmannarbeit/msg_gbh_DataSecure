# Backlog-Archiv – August 2026

Stand: 24.08.2026 · archiviert nach Product-Owner-Abgleich mit
`CURRENT_STATE.md`, `TRACEABILITY.md` und der lokalen Testsuite.

Dieses Archiv enthält abgeschlossene Stories sowie ausdrücklich verworfene Stories,
deren Nachfolgeentscheidung genannt ist. Es ist kein Freigabenachweis für noch gesperrte
Formate, Plattformen oder Cowork-Oberflächen. Laufende Teilnachweise bleiben im
[aktiven Backlog](BACKLOG.md), im [Ist-Abgleich](CURRENT_STATE.md) und in der
[Traceability](TRACEABILITY.md).

## RC81: abgeschlossener Defectschnitt, nicht Abschluss der Mutterstories

31.08.2026: R80-01–17 aus dem unabhängigen RC80-Review sind korrigiert und lokal
regressionsgeprüft. Vollständige `test:ci` mit Pre-/Posttests, ZIP-/MCPB-Build und
offizieller Claude-Strukturvalidator PASS. [Detailnachweise und Grenzen](../RC81_DEFECT_ABSCHLUSS_2026-08-31.md).

| Befunde | Storybezug | Abgeschlossener E0-Anteil |
|---|---|---|
| R80-01–05 | BL-031.1, BL-050 | positionsbezogene Zertifikats-/Organisationsrollen, Gesundheits-IT, Produktnamen und Gateway-Regression |
| R80-06, -10, -11 | BL-041.7 | präzise Dateizuordnung, lokale Fertigmeldung, tatsächliche Werkzeug-/Bildwege |
| R80-07–09 | BL-041.1, BL-041.7, BL-011.3 | Stapelauswahl, Unicode, terminaler Handoff, signalgebundener asynchroner Picker |
| R80-12–14, -17 | BL-011.13, BL-011.3 | Intake-Orphan-Nachweis, Legacy-Erhalt, Zero-Day-Laufende, Journal-v4-Schutzscan |
| R80-15–16 | BL-041.9, BL-047.1, BL-050.3 | begrenzte Reviewgruppen samt Abbruch/Teilergebnissen, 4 statt 10 Journalwrites pro Normaldatei |

Echte Cowork-/Windows-/macOS-/Linux-Nachweise bleiben im aktiven Backlog; keine
Format-, universelle Runtime- oder vollständige Privacyfreigabe aus E0 ableiten.

## Früher abgeschlossene Stories

| Story | Abschluss | Nachweis |
|---|---|---|
| BL-001.1 | Open-Source-first-Regel und Komponentenregister verbindlich | DS-038, `OPEN_SOURCE_COMPONENTS.md`, kanonischer Prüftest |
| BL-002.1 | RC30-Istmanifest vollständig und gegen Runtime geprüft | `BUILD_INFO.json`, Manifest- und Runtime-Tests |
| BL-002.2 | Maschinenlesbarer, strikt vom Ist getrennter Zielvertrag | `TARGET_CAPABILITIES.json`, Contract-Test |
| BL-002.3 | Fähigkeitsdrift zwischen Runtime, Skills, Marketplace und Handbüchern blockiert | `test-capability-contract.js` |
| BL-003.1 | Kanonische Product Vision erstellt | `PRODUCT_VISION.md`, RC44-Baseline `0098ae0` |
| BL-003.2 | Dokumentenregister und eindeutige Rangfolge festgelegt | `DOCUMENT_REGISTER.md`, kanonischer Dokumententest |
| BL-003.3 | Entscheidungen DS-041 bis DS-060 einschließlich Ersetzungen erfasst | `DECISIONS.md`, `TRACEABILITY.md` |
| BL-003.4 | Zielarchitektur aus den Produktentscheidungen abgeleitet | `TARGET_ARCHITECTURE.md`; Release-Freigabe bleibt BL-052.5 |
| BL-003.5 | RC44-IST/SOLL und Dokumentationsdrift erfasst | `CURRENT_STATE.md`, priorisierter IST/SOLL-Schnitt |
| BL-003.6 | Maschinenvertrag, Traceability, Evidenz- und OSS-Register synchronisiert | `TARGET_CAPABILITIES.json`, Dokumententest |
| BL-003.7 | README, Handbücher, Skills und Pakettexte auf belegten RC44-Iststand synchronisiert | RC44-Baseline `0098ae0`, vollständiger CI-Nachweis |
| BL-003.8 | Verbindlichen Refactoring- und Migrationsplan mit Phasen, Gates, Rollback und Schlüsselverlust-Checkpoint kanonisiert | DS-061, `REFACTORING_PLAN.md`, Dokumentenregister und Driftgate |
| BL-010.5 | ZIP-/Marketplace-Quellgleichheit belegt | `build-plugin.mjs`, `verify-plugin-zip.mjs`, `test-plugin-structure.js`; frische Marketplace-Installation bleibt separat BL-051.2 |
| BL-011.1 | Unveränderlicher privater Stapel-Snapshot spezifiziert | `contracts/BATCH_SNAPSHOT_V1.md` |
| BL-011.2 | 100-Dateien-/500-MB-Grenze vor privater Kopie durchgesetzt | `test-batch-session.js` |
| BL-011.4 | Checkpoints und explizite Wiederaufnahme ohne Quellwiederholung | `gateway/batch.js`, Batch-Tests |
| BL-011.5 | Cleanup-Lebenszyklus offener Arbeitskopien umgesetzt | `batch-maintenance.js`, Wartungstests |
| BL-011.14 | Originale und dauerhafte Exporte vollständig geschützt; technischer `Input` aus dem Normalweg entfernt | RC53–RC55; read-only Quellsnapshot, geschützter `Processed`-Altbestand, versionierte fail-closed Legacy-Migration, 15 direkte Migrations- und 20 Architekturverträge |
| BL-011.15 | R2-Stapelkern hinter unveränderter Exportfassade vollständig in klar verantwortete Module zerlegt | RC45–RC52; `gateway/batch-processing-orchestrator.js`, 66 reale Batch-Szenarien, Fast Path und vollständige lokale Testsuite; Detailnachweise in `TRACEABILITY.md` |
| BL-011.15/R2-Discard | Gesperrtes tokengebundenes Verwerfen mit enger Löschgrenze isoliert | `gateway/batch-discard.js`, 8 Grenztests |
| BL-011.15/R2-Continuation | Resume und tokenlose Auswahl des jüngsten offenen Stapels isoliert | `gateway/batch-continuation.js`, 10 Grenztests |
| BL-011.15/R2-Snapshot-Invalidation | Fail-closed-Invalidierung ausschließlich unveröffentlichter Kopien isoliert | `gateway/batch-snapshot-invalidation.js`, 7 Grenztests |
| BL-011.15/R2-Executor-Runner | Seriellen lokalen Executor mit festen Prioritäts- und Schrittgrenzen isoliert | `gateway/batch-executor-runner.js`, 7 Grenztests |
| BL-011.15/R2-Executor-Hardening | Journal-/Runner-Obergrenze und fail-closed Lease-Freigabe gehärtet | Journal-, Runner- und Batch-Session-Tests |
| BL-011.15/R2-Review-Capture | Flüchtige Rekonstruktion vertagter Review-Fundstellen isoliert | `gateway/batch-review-capture.js`, 6 Grenztests |
| BL-011.15/R2-Review-State | Deferred-Zustand, Auswahl und Readiness rein isoliert | `gateway/batch-review-state.js`, 5 Grenztests |
| BL-011.15/R2-Active-Lock-Hardening | Active-Lock an unveränderliche zufällige Identität gebunden | `gateway/batch-active-lock.js`, Lock- und Worker-Serientests |
| BL-011.15/R2-Review-Publication | Bijektive Review-Bindung und recoverbare Post-Commit-Publikation isoliert | `gateway/batch-review-publication.js`, 8 Grenztests |
| BL-011.15/R2-Review-Orchestrator | Gemeinsame Review-Folge mit geteilter Single-Flight-Sperre isoliert | `gateway/batch-review-orchestrator.js`, 8 Grenztests |
| BL-011.15/R2-Single-Item | Single-Item-Processing-/Commit-Automat mit positivem Publish-Nachweis isoliert | `gateway/batch-item-processor.js`, 11 Grenztests |
| BL-011.15/R2-Processing-Lock | Prozess- und Dateisystem-Sperren bis zum Promise-Settlement gehalten | `test-batch-processing-lock.js`, 2 reale verzögerte Pipeline-Tests |
| BL-011.15/R2-Next-Maintenance | Vorlaufwartung in bestehender Durability-Reihenfolge isoliert | `gateway/batch-next-maintenance.js`, 8 Grenztests |
| BL-011.15/R2-Processing-Orchestrator | Äußere Lock-/Lease-/Read-/Maintenance-/Delivery-/Snapshot-/Delegationsfolge isoliert; `batch.js` reine Composition Root | `gateway/batch-processing-orchestrator.js`, 11 Async-Grenztests plus Integrationsgates |
| BL-012.1 | Klare Mehrdatei-Stapel ohne Einzeldialog analysiert | `test-batch-session.js` |
| BL-012.4 | Freiwillige Gesamtvorschau bereitgestellt | Batch-Review-Vertrag und Tests |
| BL-024.1 | OCR-Ergebnisvertrag Deutsch/Englisch als Nicht-Release-Vorarbeit abgeschlossen | `contracts/OCR_RESULT_V1.md`, Contract-Test |
| BL-030.1 | Fortsetzbarer Pseudonymvertrag ohne Rohwert-Mappingtabelle | `contracts/BATCH_PSEUDONYM_V1.md` |
| BL-032.2 | **Verworfen, nicht implementiert:** Passwort-/Entschlüsselungsweg | DS-046 ersetzt DS-016; verschlüsselte Quellen werden weder kopiert noch entschlüsselt und durch BL-049.1 fail-closed klassifiziert |
| BL-040.1 | Lokaler Exportort, neutrale Namen und Kollisionsschutz | Mapping-/Batch-Tests |
| BL-040.2 | MCP-unsichtbare, formelsichere UTF-8-Mapping-CSV | Mapping-/Batch-Tests |
| BL-040.3 | Stapelweiter, inhaltsfreier JSON-Nachweis | `contracts/BATCH_EVIDENCE_V1.md` |
| BL-040.4 | Manipulationsfeste, neutrale Paket- und Assetbindung im MCP-Lesepfad | `package-store.js`, `test-package-read-capabilities.js` |
| BL-042.1 | Bestätigungspflichtiger lokaler Diagnoseexport | `test-diagnostics.js` |
| BL-050.1 | Korpus-Schema und Qualitätsmetriken festgeschrieben | `benchmarks/CORPUS_CONTRACT_V1.json` |
| BL-050.2 | Mindestens 1.000 dokumentartige synthetische Fixtures mit Qualitätsgates geliefert | Zwei deterministische 1.000er-Korpora, `test-corpus-contract.js`, `test-detector-benchmark.js`, `test-format-acceptance-matrix.js`, `exploratory-anonymization-2000.js`; gesperrte Formate bleiben ausdrücklich eigene Stories |
| BL-051.7 | Kostenbegrenzte GitHub-Actions-Policy implementiert | `test-workflow-budget.js` |

Geschlossene Epics: **BL-001**, **BL-002**, **BL-003** und **BL-040**. Ihre laufende
Regressionspflege ist Produktpflege und erzeugt keine neue Backlog-Story, solange
sie keine Capability oder Entscheidung verändert.

Die vollständige Zuordnung jeder abgeschlossenen Story zu Dateien, Tests und
Entscheidungen bleibt im Abschnitt „Umsetzungsnachweise erledigter Stories“ der
[Traceability](TRACEABILITY.md) erhalten.
