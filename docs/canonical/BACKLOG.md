# Aktives Entwicklungsbacklog

Stand: 24.08.2026 · Product-Owner-bereinigt · Arbeitsstand RC35

Dies ist ausschließlich die priorisierte Liste noch offener Arbeit. Erledigte
Stories stehen im [Archiv](BACKLOG_ARCHIVE_2026-08.md); Implementierungsdetails und
Teilnachweise stehen im [Ist-Abgleich](CURRENT_STATE.md) und in der
[Traceability](TRACEABILITY.md). Ein Pilot, lokaler Test oder einzelnes OS ist keine
Produktfreigabe. **P0** blockiert einen universellen Release.

Die [Evidence-Matrix](BACKLOG_EVIDENCE_MATRIX.md) markiert für jede aktive Story,
ob und welche reale Zielsystem-, Nutzungs- oder Fachevidenz erforderlich ist.

Das aktuelle [Claude-Cowork-, UX-, Architektur- und Performance-Review](../REVIEW_CLAUDE_COWORK_UX_PERFORMANCE_2026-08-24.md)
ist verbindliche Priorisierungsgrundlage. Die folgenden beiden Arbeitslisten
trennen den noch eigenständig lieferbaren Entwicklungsanteil von echter
menschlicher Evidenz. Die thematischen Tabellen darunter bleiben das stabile
Storyregister.

Definition of Done: Code, Tests, `BACKLOG.md`, `CURRENT_STATE.md` und
`TRACEABILITY.md` werden gemeinsam aktualisiert. Erst danach kann eine Story in das
Archiv verschoben werden.

Entscheidungsabdeckung: DS-001, DS-002, DS-003, DS-004, DS-005, DS-006, DS-007,
DS-008, DS-009, DS-010, DS-011, DS-012, DS-013, DS-014, DS-015, DS-016, DS-017,
DS-018, DS-019, DS-020, DS-021, DS-022, DS-023, DS-024, DS-025, DS-026, DS-027,
DS-028, DS-029, DS-030, DS-031, DS-032, DS-033, DS-034, DS-035, DS-036, DS-037,
DS-038, DS-039, DS-040.

## Das kann ich noch eigenständig erledigen

**Kein weiterer klar abgegrenzter E0-Arbeitspunkt ist nach diesem Stand offen.**
Die Review-Arbeit an lokalen Meldungen, Picker/Support-Trennung, 9-/28-Toolvertrag,
Toolannotations, Hostgrenze, Handoff-Budget, formatspezifischen Ressourcenlimits,
TXT-/CSV-/DOCX-Benchmarks, inaktiver Zwei-Worker-Strecke, inaktivem OCR-Harness
sowie SEA-/Paketgates ist implementiert und regressionsgetestet. Weitere Aktivierung
oder Optimierung benötigt zuerst die unten genannte E1-/E2-/E3-Evidenz. Neue
Befunde dürfen wieder als eigener E0-Punkt aufgenommen werden; dieses Feld ist
keine Behauptung einer Produktfreigabe.

## Das musst du als Mensch machen

| Priorität | Stories | Erforderliche reale Evidenz |
|---|---|---|
| **P0** | BL-010.7, BL-041.4, BL-051.6 | In der aktuellen Claude-Version lokale Cowork-Desktop-Sitzung gegenüber Cloud/Web/Mobil/Scheduled erkennen; Spracheingabe und Skillauswahl mit synthetischen Daten vergleichen; nichtlokale Hosts müssen vor Originalzugriff stoppen. |
| **P0** | BL-010.8, BL-051.1, BL-051.2, BL-051.4, BL-051.5 | ZIP-/Marketplace-Fresh-Install, Update, Rückrolle und Entfernung ohne System-Node auf Windows x64 und macOS x64/ARM64; Linux nur im vorgesehenen Claude-Code-Host. |
| **P0** | BL-011.8, BL-011.9, BL-012.8 | Reparse-/Swap-/Cleanup-Gegenproben und native Supervisor-/Dialog-Evidenz auf den Zielplattformen. |
| **P1** | BL-042.2, BL-041.7 | Reale Anzahl der Cowork-Berechtigungsdialoge in Manual/Auto/Skip bei Start sowie 1/5/20 Handoff-Seiten beobachten; Organisationsrichtlinien getrennt dokumentieren. |
| **P1** | BL-041.5, BL-050.3, BL-051.3 | Installierte Realmessung für 1/10/100 Dateien und 500 MiB auf Zielhardware: Zeit, CPU, Peak-RAM, Fortschritt, Stopp und Resume. Wahrgenommene Wartezeit separat bewerten. |
| **P1** | BL-011.7, BL-012.2, BL-012.3, BL-012.5, BL-012.6, BL-012.7, BL-052.1, BL-052.4 | Beobachtete Gebrauchstauglichkeit: Fortschritt, alle Endzustände, Fortsetzung, Tastatur, Fokus, Skalierung, Kontrast und Screenreader ohne technische Hilfestellung. |
| **P1** | BL-020.3, BL-021.1, BL-021.2, BL-022.1 | Installierte Drei-OS-/Hosttests für Netzwerkfreiheit sowie reale TXT/Markdown/CSV/DOCX-Interoperabilität. |
| **P1** | BL-011.3, BL-030.2, BL-031.1, BL-032.1, BL-032.2 | Keyring-/Pseudonym-, Mehrdeutigkeits-, Zertifikatskontext- und Passwortwege auf echten Zielsystemen fachlich und technisch abnehmen. |
| **P1** | BL-052.2, BL-052.3 | IT-/Health-IT- und Datenschutzfreigabe mit ausschließlich synthetischen Daten, einschließlich Inhaltserhalt, Restrisiko, Retention und zulässigem Verwendungszweck. |
| **P2** | BL-011.12, BL-024.2, BL-024.4 | Zwei-Worker- und OCR-Ressourcen-/Timeout-/Qualitätsnachweis auf Windows, macOS x64/ARM64 und Linux x64, bevor ein schnellerer Produktpfad aktiviert wird. |
| **P2** | BL-022.2, BL-022.3, BL-023.1, BL-023.2, BL-023.3, BL-023.4, BL-024.3 | Fach-/Security-Abnahme der noch gesperrten Formate; bis dahin bleiben XLSX, PPTX, PDF und Rasterbilder NO-GO. |

## Jetzt: P0-Release- und Sicherheitsblocker

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-011.8 | Private Batchwurzel gegen Reparse, Swap und Cleanup-Rennen auf drei OS absichern. | **in Arbeit** |
| BL-011.9 | **E0 umgesetzt; E1 offen:** POSIX-Supervisor im allgemeinen Parser über feste Zielauflösung, Binär-/Hash-/Format-/Vertragsprüfung anbinden. Plugin-ZIP und MCPB prüfen jeden künftig vorhandenen Ziel-Supervisor vor dem Archivieren auf reguläre Datei, Zielbinärformat und SHA-256 und setzen dessen Archivmodus auf `0755`; fehlende Zielartefakte lassen den bestehenden non-release Node-Permission-Pfad unverändert, vorhandene defekte Artefakte stoppen fail-closed. Reale CPU/RAM/Flood/Child/Timeout-Evidenz auf macOS x64/ARM64 und Linux x64 bleibt offen. | **in Arbeit** |
| BL-012.8 | Darwin-Reviewvertrag mit echtem `osascript`- und Fresh-Install-Nachweis schließen. | **in Arbeit** |
| BL-010.7 | Lokale Cowork-Desktop-Sitzung versionsgebunden positiv nachweisen; Cloud/Web/Mobil/Scheduled ohne lokalen MCP müssen vor Originalzugriff stoppen. | **in Arbeit** |
| BL-010.8 | **E0 vorbereitet; E1 offen:** SEA-/Dispatcher-Assembly, Dateimodi, Paketgates und Rollback-Verträge sind automatisiert; vier Zielartefakte, Fresh Install, Update und Rollback real belegen. Bis dahin kein Release. | **in Arbeit** |
| BL-041.4 | Gleichheit von Spracheingabe und Skillauswahl mit Modell-/Fresh-Install-Nachweis belegen. | **in Arbeit** |
| BL-041.5 | 500-MB-, Restart-, Drei-OS- und Cowork-Nachweis für getrennte lokale Stapelverarbeitung erbringen. | **in Arbeit** |
| BL-042.2 | **E0 abgeschlossen; E1 offen:** Alle 28 Tools besitzen vier explizite, getestete Risikohinweise; Berechtigungen in Cowork Manual/Auto/Skip real abnehmen. | **in Arbeit** |
| BL-051.5 | ZIP-/Marketplace-Lebenszyklus in Cowork real abnehmen. | **offen** |
| BL-051.6 | Web, Mobil, Cloud und getrennten Desktop negativ auf Originalzugriff abnehmen. | **in Arbeit** |

## Als Nächstes: Kernworkflow und Nutzerreise

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-011.3 | Einen aktiven, mehrere pausierte Stapel mit produktivem Pseudonymkontext sichern. | **in Arbeit** |
| BL-011.6 | **E0 abgeschlossen; E1 offen:** Zentrale Einzelgrenzen (TXT/Markdown 8.000.000 Bytes, CSV 1.500.000 Bytes, DOCX 64 MiB/128 MiB entpackt) und 500-MiB-Stapelgrenze werden vor dem Hintergrundlauf getestet; Grenzfälle auf Zielsystemen abnehmen. | **in Arbeit** |
| BL-011.7 | **E0 abgeschlossen; E1/E2 offen:** Inhaltsfreie lokale Phasen-/Zählermeldung, sicherer Abbruch und explizites Resume sind regressionsgetestet; plattformgleich beobachten. | **in Arbeit** |
| BL-030.2 | Stapelweite Pseudonyme nach positiver Drei-OS-Keyring-Evidenz aktivieren. | **in Arbeit** |
| BL-012.2 | **E0 abgeschlossen; E1/E2 offen:** Abschluss, lokale Prüfung, explizite Fortsetzung, Mapping-Reparatur und sicherer Stopp erzeugen genau eine inhaltsfreie Meldung mit genau einer nächsten Aktion; auf Ziel-OS nachweisen. | **in Arbeit** |
| BL-012.3 | Vertagte Entscheidungen sicher und ohne neue Auswahl fortsetzen. | **in Arbeit** |
| BL-012.5 | Tastatur, Skalierung und Screenreader auf drei OS abnehmen. | **in Arbeit** |
| BL-012.6 | **E0 abgeschlossen; E2 offen:** Anwenderstatus und genau eine nächste sichere Aktion sind vereinheitlicht; beschädigte Checkpoints bleiben fail-closed. | **in Arbeit** |
| BL-012.7 | **E0 abgeschlossen; E2 offen:** Kurzer Picker-/Ergebnisweg, gleichnamige Quellen über opake IDs und Fortsetzung ohne Neuauswahl sind technisch regressionsgetestet; verständlich abnehmen. | **in Arbeit** |
| BL-031.1 | Fundstellen gruppiert und lokal im Stapel entscheiden. | **in Arbeit** |
| BL-032.1 | Mehrdeutigkeitsdialog plattformgleich liefern. | **in Arbeit** |
| BL-032.2 | Passwortweg ausschließlich lokal und nur im RAM implementieren; geprüften Entschlüsseler erst danach anbinden. | **in Arbeit** |
| BL-041.1 | **E0 abgeschlossen; E1 offen:** Beide Skillstarts verwenden denselben Picker-/Jobvertrag; in echter Claude-UI beobachten. | **in Arbeit** |
| BL-041.2 | Ursprüngliche Claude-Aufgabe begrenzt und fortsetzbar weiterführen. | **in Arbeit** |
| BL-041.3 | **E0 abgeschlossen; E1 offen:** Skill-/Hostvertrag lehnt hochgeladene Originale ab und erklärt nur den lokalen Pickerweg; echte UI abnehmen. | **in Arbeit** |

## Cowork Fast Path – schlank, lokal und messbar

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-041.6 | **E0 abgeschlossen; E1 offen:** Reine Anonymisierung endet als `local_only` ohne Ergebnislesen, Bestätigen oder Polling durch Claude und zeigt lokal genau eine terminale Zählerübersicht ohne Dokumentdaten. | **in Arbeit** |
| BL-041.7 | **E0 abgeschlossen; E1 offen:** Normale Cowork-Fassade umfasst 9 statt 28 Supporttools; Skill/Handbuch/Manifest werden gegen Drift geprüft. Handoff dekodiert einmalig und begrenzt, hält Kennungen lokal und verwirft Fehler fail-closed. Reale Berechtigungszahl und Fresh-Install-Sichtbarkeit bleiben offen. | **in Arbeit** |
| BL-041.8 | **E0 abgeschlossen; E1 offen:** MCP-Tasks/-Benachrichtigungen versionsgebunden prüfen; ohne Hostnachweis kein Produktpfad und kein Polling. | **in Arbeit** |
| BL-050.3 | **E0 abgeschlossen; E1 offen:** Inhaltsfreie Messung nutzt echte TXT-/CSV-/DOCX-Pfade, monotone Uhr, Kalt/Warm, 1/10/100, p50/p95, Gesamtzeit, CPU, Peak-RAM, nicht zugeordnete Laufzeit und relative Regressionstore; Zielhardware bleibt E1. | **in Arbeit** |
| BL-011.10 | **E0 abgeschlossen; E1 offen:** Intake nach Auswahl in den lokalen Hintergrund verlagern; Cowork antwortet innerhalb weniger Sekunden ohne Quellmetadaten. | **in Arbeit** |
| BL-011.11 | **E0 abgeschlossen; E1 offen:** Gemischtes Resume, feste I/O-Phasen, einmalige begrenzte Handoff-Dekodierung, Indexfenster und Buffer-Wipe sind regressionsgetestet, ohne Snapshot-/Swap-/Container-Gates zu lockern. Weitere I/O-Optimierung wartet auf reale Dateisystemmessung. | **in Arbeit** |
| BL-011.12 | **E0 abgeschlossen; E1 offen:** Ein nicht importierter Zwei-Worker-Harness prüft zentrale Reihenfolge/Commit, Slots, geschlossene Nachrichten, Crash, ungewissen Commit und Ressourcenstopps; Produktstandard bleibt seriell bis zur Drei-OS-Abnahme. | **in Arbeit** |
| BL-024.4 | **E0 abgeschlossen; E1/E3 offen:** Der nicht importierte OCR-Session-Harness prüft geschlossenes Framing, Requestbindung, Replay, Single-Flight, Pixel-/Byte-/Zeitbudgets und Abbruch. Der sichere Einbild-Worker bleibt aktiv, bis native Per-Frame-Grenzen und Drei-OS-Evidenz vorliegen. | **in Arbeit** |

## Danach: Content-Gates und gesperrte Formate

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-020.1 | Gemeinsamen Content-Graph und Locatorvertrag vollständig nachweisen. | **in Arbeit** |
| BL-020.2 | Rekursive Einbettungen und aktive Inhalte vollständig absichern. | **in Arbeit** |
| BL-020.3 | Netzwerkfreiheit als eigenes Gate auf Zielplattformen beweisen. | **in Arbeit** |
| BL-021.1 | TXT/Markdown praktisch auf drei OS freigeben. | **in Arbeit** |
| BL-021.2 | CSV praktisch auf drei OS freigeben. | **in Arbeit** |
| BL-022.1 | DOCX-Interoperabilität und vollständige Story-Coverage schließen. | **in Arbeit** |
| BL-022.2 | XLSX erst nach vollständiger Coverage freigeben. | **offen** |
| BL-022.3 | PPTX erst nach vollständiger Coverage freigeben. | **offen** |
| BL-023.1 | PDF-/OCR-Risikogate als NO-GO weiterführen, bis alle Pflichtzellen erfüllt sind. | **in Arbeit** |
| BL-023.2 | Text-PDFs nur nach vollständiger Sicherheitscoverage freigeben. | **offen** |
| BL-023.3 | PDF-Formulare, Annotationen, Anhänge und Verschlüsselung absichern. | **offen** |
| BL-023.4 | Scan-PDFs und visuelle Coverage freigeben. | **offen** |
| BL-024.2 | Gebündelte OCR-Backends für Windows, macOS und Linux liefern. | **in Arbeit** |
| BL-024.3 | PNG, JPEG und BMP nach OCR-Coverage freigeben. | **offen** |

## Distribution, Qualität und externe Abnahme

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-010.1 | Betriebssystemneutralen Plugin-Startvertrag komplett beweisen. | **in Arbeit** |
| BL-010.2 | Windows-Paket liefern. | **offen** |
| BL-010.3 | macOS-Paket liefern. | **offen** |
| BL-010.4 | Linux-Paket liefern. | **offen** |
| BL-010.6 | Versionsarchiv und Rückrolle testen. | **offen** |
| BL-051.1 | Frische ZIP-Installation auf drei OS abnehmen. | **offen** |
| BL-051.2 | Marketplace-Installation auf drei OS abnehmen. | **offen** |
| BL-051.3 | 100-Dateien-/500-MB-End-to-End-Abnahme durchführen. | **offen** |
| BL-051.4 | Rückrolle auf drei OS abnehmen. | **offen** |
| BL-052.1 | Beobachtete Anwenderabnahme durchführen. | **offen** |
| BL-052.2 | IT-/Health-IT-Fachabnahme durchführen. | **offen** |
| BL-052.3 | Datenschutzabnahme mit synthetischen Daten durchführen. | **offen** |
| BL-052.4 | Gebrauchstauglichkeit mit beobachteten Nutzenden abnehmen. | **offen** |

## Epic-Index

Die folgenden stabilen Epics binden Entscheidungen, Ist-Abgleich und Open-Source-
Register. Geschlossene Epics BL-001, BL-002 und BL-040 stehen nur noch im Archiv.

### BL-010 – Plattform und Distribution
### BL-001 – Dokumentensystem und Wiederverwendung (archiviert)
### BL-002 – Ist-/Zielvertrag und Drift (archiviert)
### BL-011 – Sicherer fortsetzbarer Stapelkern
### BL-012 – Nutzerreise und lokaler Review
### BL-020 – Gemeinsame Inhaltsgrenze
### BL-021 – Text und CSV
### BL-022 – OOXML-Formate
### BL-023 – PDF-Risikogate
### BL-024 – OCR und Rasterbilder
### BL-030 – Profil und Pseudonyme
### BL-031 – Zertifikats- und Fundstellenkontext
### BL-032 – Mehrdeutigkeit und Passwort
### BL-040 – Lokaler Export und Nachweis (archiviert)
### BL-041 – Claude-Übergabe
### BL-043 – Cowork-Fast-Path
### BL-042 – Diagnose und Berechtigungen
### BL-050 – Korpus und Qualitätsmetriken
### BL-051 – Installations- und Hostabnahme
### BL-052 – Menschliche Abnahme
