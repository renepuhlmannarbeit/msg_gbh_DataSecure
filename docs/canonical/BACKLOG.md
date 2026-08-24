# Aktives Entwicklungsbacklog

Stand: 24.08.2026 · Product-Owner-bereinigt · Ausgangsbasis RC30

Dies ist ausschließlich die priorisierte Liste noch offener Arbeit. Erledigte
Stories stehen im [Archiv](BACKLOG_ARCHIVE_2026-08.md); Implementierungsdetails und
Teilnachweise stehen im [Ist-Abgleich](CURRENT_STATE.md) und in der
[Traceability](TRACEABILITY.md). Ein Pilot, lokaler Test oder einzelnes OS ist keine
Produktfreigabe. **P0** blockiert einen universellen Release.

Die [Evidence-Matrix](BACKLOG_EVIDENCE_MATRIX.md) markiert für jede aktive Story,
ob und welche reale Zielsystem-, Nutzungs- oder Fachevidenz erforderlich ist.

Definition of Done: Code, Tests, `BACKLOG.md`, `CURRENT_STATE.md` und
`TRACEABILITY.md` werden gemeinsam aktualisiert. Erst danach kann eine Story in das
Archiv verschoben werden.

Entscheidungsabdeckung: DS-001, DS-002, DS-003, DS-004, DS-005, DS-006, DS-007,
DS-008, DS-009, DS-010, DS-011, DS-012, DS-013, DS-014, DS-015, DS-016, DS-017,
DS-018, DS-019, DS-020, DS-021, DS-022, DS-023, DS-024, DS-025, DS-026, DS-027,
DS-028, DS-029, DS-030, DS-031, DS-032, DS-033, DS-034, DS-035, DS-036, DS-037,
DS-038, DS-039.

## Jetzt: P0-Release- und Sicherheitsblocker

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-011.8 | Private Batchwurzel gegen Reparse, Swap und Cleanup-Rennen auf drei OS absichern. | **in Arbeit** |
| BL-011.9 | POSIX-Supervisor in allgemeinen Parser integrieren und CPU/RAM/Flood/Child/Timeout real auf macOS/Linux nachweisen. | **offen** |
| BL-012.8 | Darwin-Reviewvertrag mit echtem `osascript`- und Fresh-Install-Nachweis schließen. | **in Arbeit** |
| BL-010.7 | Beobachteten, versionsgebundenen Claude-/Cowork-Hostnachweis ergänzen. | **in Arbeit** |
| BL-010.8 | SEA auf vier Zielen, Fresh Install, Update und Rollback belegen; bis dahin kein Release. | **in Arbeit** |
| BL-041.4 | Gleichheit von Spracheingabe und Skillauswahl mit Modell-/Fresh-Install-Nachweis belegen. | **in Arbeit** |
| BL-041.5 | 500-MB-, Restart-, Drei-OS- und Cowork-Nachweis für getrennte lokale Stapelverarbeitung erbringen. | **in Arbeit** |
| BL-042.2 | Toolberechtigungen in Cowork Manual/Auto/Skip real abnehmen. | **in Arbeit** |
| BL-051.5 | ZIP-/Marketplace-Lebenszyklus in Cowork real abnehmen. | **offen** |
| BL-051.6 | Web, Mobil, Cloud und getrennten Desktop negativ auf Originalzugriff abnehmen. | **in Arbeit** |

## Als Nächstes: Kernworkflow und Nutzerreise

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-011.3 | Einen aktiven, mehrere pausierte Stapel mit produktivem Pseudonymkontext sichern. | **in Arbeit** |
| BL-011.6 | Vorprüfungen für Speicher, Entpacken und Ressourcen vollständig praktisch abnehmen. | **in Arbeit** |
| BL-011.7 | Fortschritt, sicheren Abbruch und Wiederaufnahme plattformgleich liefern. | **in Arbeit** |
| BL-030.2 | Stapelweite Pseudonyme nach positiver Drei-OS-Keyring-Evidenz aktivieren. | **in Arbeit** |
| BL-012.2 | Einen nativen, stapelweiten Abschlussdialog auf drei OS nachweisen. | **in Arbeit** |
| BL-012.3 | Vertagte Entscheidungen sicher und ohne neue Auswahl fortsetzen. | **in Arbeit** |
| BL-012.5 | Tastatur, Skalierung und Screenreader auf drei OS abnehmen. | **in Arbeit** |
| BL-012.6 | Anwenderstatus und nächste sichere Aktion vereinheitlichen. | **in Arbeit** |
| BL-012.7 | Start- und Ergebnisweg als kurze, verständliche Anwenderreise abnehmen. | **in Arbeit** |
| BL-031.1 | Fundstellen gruppiert und lokal im Stapel entscheiden. | **in Arbeit** |
| BL-032.1 | Mehrdeutigkeitsdialog plattformgleich liefern. | **in Arbeit** |
| BL-032.2 | Passwortweg ausschließlich lokal und nur im RAM implementieren; geprüften Entschlüsseler erst danach anbinden. | **in Arbeit** |
| BL-041.1 | Beide Skillstarts auf denselben Jobvertrag führen. | **in Arbeit** |
| BL-041.2 | Ursprüngliche Claude-Aufgabe begrenzt und fortsetzbar weiterführen. | **in Arbeit** |
| BL-041.3 | Bereits hochgeladene Originale sicher ablehnen und lokalen Weg erklären. | **in Arbeit** |

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
### BL-042 – Diagnose und Berechtigungen
### BL-050 – Korpus und Qualitätsmetriken
### BL-051 – Installations- und Hostabnahme
### BL-052 – Menschliche Abnahme
