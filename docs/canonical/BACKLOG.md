# Aktives Entwicklungsbacklog

Stand: 27.08.2026 · Product-Owner-bereinigt · Arbeitsstand RC63

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

Die Implementierungs- und Migrationsreihenfolge ist zusätzlich im
[verbindlichen Refactoring-Plan](REFACTORING_PLAN.md) festgelegt. Das Backlog
bestimmt **was** geliefert wird; der Refactoring-Plan bestimmt die sichere
Reihenfolge und die Gates. Abweichungen benötigen eine neue oder ersetzende
Entscheidung.

Definition of Done: Code, Tests, `BACKLOG.md`, `CURRENT_STATE.md` und
`TRACEABILITY.md` werden gemeinsam aktualisiert. Erst danach kann eine Story in das
Archiv verschoben werden.

Entscheidungsabdeckung: DS-001, DS-002, DS-003, DS-004, DS-005, DS-006, DS-007,
DS-008, DS-009, DS-010, DS-011, DS-012, DS-013, DS-014, DS-015, DS-016, DS-017,
DS-018, DS-019, DS-020, DS-021, DS-022, DS-023, DS-024, DS-025, DS-026, DS-027,
DS-028, DS-029, DS-030, DS-031, DS-032, DS-033, DS-034, DS-035, DS-036, DS-037,
DS-038, DS-039, DS-040.
DS-041, DS-042, DS-043, DS-044, DS-045, DS-046, DS-047, DS-048, DS-049,
DS-050, DS-051, DS-052, DS-053, DS-054, DS-055, DS-056, DS-057, DS-058,
DS-059, DS-060, DS-061.

## Product Vision und Dokumentenkanon

BL-003.1 bis BL-003.7 sind mit der RC44-Baseline abgeschlossen und im
[Backlog-Archiv](BACKLOG_ARCHIVE_2026-08.md) nachgewiesen. Die vor einem Release
erforderliche Architektur-/Security-Freigabe wird getrennt als BL-052.5 geführt;
Fresh-Install- und Cowork-Textabnahmen bleiben in BL-041 und BL-051.

## Priorisierter IST/SOLL-Schnitt

| Priorität | Arbeitspaket | Begründung / Reihenfolge |
|---|---|---|
| **P0.0** | BL-011.13: private Snapshots, Review und Pseudonymkontext OS-benutzergebunden verschlüsseln | schließt die lokale Rohdatenschutzlücke |
| **P0.1** | BL-010.8/BL-051.1: selbsttragende Windows-/macOS-Pakete und reale Cowork-Evidenz | ohne Laufzeit kein installierbares Produkt |
| **P1.1** | BL-011.3/BL-041.9: pausierte Stapel entkoppeln, Review ohne Timeout und nicht blockierender Abschluss | behebt den beobachteten Hänger |
| **P1.2** | BL-044.1: rekursive Ordnerquelle mit vollständigem Link-/Umfangsgate | gewünschter einfacher Stapelstart |
| **P1.3** | BL-049.1: Signatur-/Struktur-Sniffing und drei Ergebnisgrade | verhindert falsche Format- und Vollständigkeitsaussagen |
| **P1.4** | BL-047.1: adaptive Parallelität und messbare Cowork-Latenzbudgets | Performance erst nach Sicherheits- und Durability-Gates aktivieren |
| **P2** | BL-042.3: progressive inhaltsfreie MCP-App, Sprach-/A11y- und Adminvertrag | Komfortverbesserung mit vollständigem Fallback |

## Das kann ich noch eigenständig erledigen

Eigenständig lieferbar sind BL-011.13 (Verschlüsselung), BL-044.1
(Ordnerquelle), BL-049.1 (Formatgrenze und Ergebnisgrade), die synthetische Seite von
BL-047.1 (adaptive Ressourcensteuerung) sowie Build-, Vertrags- und Negativtests.
Aktivierung und Release bleiben jeweils an die in der Evidence-Matrix genannten
Zielsystem- beziehungsweise menschlichen Nachweise gebunden.

## Das musst du als Mensch machen

| Priorität | Stories | Erforderliche reale Evidenz |
|---|---|---|
| **P0** | BL-010.7, BL-041.4, BL-051.6 | In der aktuellen Claude-Version lokale Cowork-Desktop-Sitzung gegenüber Cloud/Web/Mobil/Scheduled erkennen; Spracheingabe und Skillauswahl mit synthetischen Daten vergleichen; nichtlokale Hosts müssen vor Originalzugriff stoppen. |
| **P0** | BL-010.8, BL-051.1, BL-051.2, BL-051.4, BL-051.5 | ZIP-/Marketplace-Fresh-Install, Update, Rückrolle und Entfernung ohne System-Node auf Windows x64 und macOS x64/ARM64. Linux ist eine spätere, getrennte Portabilitätsstufe in BL-010.4. |
| **P0** | BL-011.8, BL-011.9, BL-012.8 | Reparse-/Swap-/Cleanup-Gegenproben und native Supervisor-/Dialog-Evidenz auf Windows und macOS; Linux folgt mit BL-010.4. |
| **P1** | BL-042.2, BL-041.7 | Reale Anzahl der Cowork-Berechtigungsdialoge in Manual/Auto/Skip bei Start sowie 1/5/20 Handoff-Seiten beobachten; Organisationsrichtlinien getrennt dokumentieren. |
| **P1** | BL-041.5, BL-050.3, BL-051.3 | Installierte Realmessung für 1/10/100 Dateien und 500 MiB auf Windows-/macOS-Zielhardware: Zeit, CPU, Peak-RAM, Fortschritt, Stopp und Resume. Dabei die bewusste R3a-Sicherheitskostenstelle getrennt messen: noch nicht extern SHA-256-versiegelte Direktquellen werden vor der Privatkopie einmal vollständig lokal vorgehasht; versiegelte Stapelquellen nicht. Wahrgenommene Wartezeit separat bewerten. |
| **P1** | BL-011.7, BL-012.2, BL-012.3, BL-012.5, BL-012.6, BL-012.7, BL-052.1, BL-052.4 | Beobachtete Gebrauchstauglichkeit: Fortschritt, alle Endzustände, Fortsetzung, Tastatur, Fokus, Skalierung, Kontrast und Screenreader ohne technische Hilfestellung. |
| **P1** | BL-020.3, BL-021.1, BL-021.2, BL-022.1 | Installierte Windows-/macOS-Hosttests für Netzwerkfreiheit sowie reale TXT/Markdown/CSV/DOCX-Interoperabilität. Linux folgt als eigene Portabilitätsevidenz. |
| **P1** | BL-011.3, BL-030.2, BL-031.1, BL-032.1 | Keyring-/Pseudonym-, Mehrdeutigkeits- und Zertifikatskontextwege auf echten Zielsystemen fachlich und technisch abnehmen. Verschlüsselte Quellen werden gemäß DS-046 nicht entschlüsselt. |
| **P1** | BL-052.2, BL-052.3 | IT-/Health-IT- und Datenschutzfreigabe mit ausschließlich synthetischen Daten, einschließlich Inhaltserhalt, Restrisiko, Retention und zulässigem Verwendungszweck. |
| **P2** | BL-011.12, BL-024.2, BL-024.4 | Zwei-Worker- und OCR-Ressourcen-/Timeout-/Qualitätsnachweis auf Windows, macOS x64/ARM64 und Linux x64, bevor ein schnellerer Produktpfad aktiviert wird. |
| **P2** | BL-022.2, BL-022.3, BL-023.1, BL-023.2, BL-023.3, BL-023.4, BL-024.3 | Fach-/Security-Abnahme der noch gesperrten Formate; bis dahin bleiben XLSX, PPTX, PDF und Rasterbilder NO-GO. |

## Jetzt: P0-Release- und Sicherheitsblocker

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-011.8 | Private Batchwurzel gegen Reparse, Swap und Cleanup-Rennen auf Windows und macOS absichern; Linux-Nachweis folgt mit BL-010.4. | **in Arbeit** |
| BL-011.9 | **E0 umgesetzt; E1 offen:** POSIX-Supervisor im allgemeinen Parser über feste Zielauflösung, Binär-/Hash-/Format-/Vertragsprüfung anbinden. Plugin-ZIP und MCPB prüfen jeden künftig vorhandenen Ziel-Supervisor vor dem Archivieren auf reguläre Datei, Zielbinärformat und SHA-256 und setzen dessen Archivmodus auf `0755`; fehlende Zielartefakte lassen den bestehenden non-release Node-Permission-Pfad unverändert, vorhandene defekte Artefakte stoppen fail-closed. Reale CPU/RAM/Flood/Child/Timeout-Evidenz auf macOS x64/ARM64 bleibt Releaseblocker; Linux x64 folgt mit BL-010.4. | **in Arbeit** |
| BL-012.8 | Darwin-Reviewvertrag mit echtem `osascript`- und Fresh-Install-Nachweis schließen. | **in Arbeit** |
| BL-010.7 | Lokale Cowork-Desktop-Sitzung versionsgebunden positiv nachweisen; Cloud/Web/Mobil/Scheduled ohne lokalen MCP müssen vor Originalzugriff stoppen. | **in Arbeit** |
| BL-010.8 | **E0 vorbereitet; E1 offen:** SEA-/Dispatcher-Assembly, Dateimodi, Paketgates und Rollback-Verträge sind automatisiert; Windows-x64 sowie macOS-x64/-arm64, Fresh Install, Update und Rollback real belegen. Linux folgt getrennt in BL-010.4. Bis dahin kein Release. | **in Arbeit** |
| BL-041.4 | Gleichheit von Spracheingabe und Skillauswahl mit Modell-/Fresh-Install-Nachweis belegen. | **in Arbeit** |
| BL-041.5 | 500-MB-, Restart-, Windows-/macOS- und Cowork-Nachweis für getrennte lokale Stapelverarbeitung erbringen; Linux folgt später. | **in Arbeit** |
| BL-042.2 | **E0 abgeschlossen; E1 offen:** Alle 25 Tools besitzen vier explizite, getestete Risikohinweise; Berechtigungen in Cowork Manual/Auto/Skip real abnehmen. | **in Arbeit** |
| BL-051.5 | ZIP-/Marketplace-Lebenszyklus in Cowork real abnehmen. | **offen** |
| BL-051.6 | Web, Mobil, Cloud und getrennten Desktop negativ auf Originalzugriff abnehmen. | **in Arbeit** |

## Als Nächstes: Kernworkflow und Nutzerreise

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-011.3 | Einen aktiven, mehrere pausierte Stapel mit produktivem Pseudonymkontext sichern. | **in Arbeit** |
| BL-011.6 | **E0 abgeschlossen; E1 offen:** Zentrale Einzelgrenzen (TXT/Markdown 8.000.000 Bytes, CSV 1.500.000 Bytes, DOCX 64 MiB/128 MiB entpackt) und 500-MiB-Stapelgrenze werden vor dem Hintergrundlauf getestet; Grenzfälle auf Zielsystemen abnehmen. | **in Arbeit** |
| BL-011.7 | **E0 abgeschlossen; E1/E2 offen:** Inhaltsfreie lokale Phasen-/Zählermeldung, sicherer Abbruch und explizites Resume sind regressionsgetestet; plattformgleich beobachten. | **in Arbeit** |
| BL-030.2 | Stapelweite Pseudonyme nach positiver Windows-/macOS-Keyring-Evidenz aktivieren; Linux folgt mit BL-010.4. | **in Arbeit** |
| BL-012.2 | **E0 abgeschlossen; E1/E2 offen:** Abschluss, lokale Prüfung, explizite Fortsetzung, Mapping-Reparatur und sicherer Stopp erzeugen genau eine inhaltsfreie Meldung mit genau einer nächsten Aktion; auf Ziel-OS nachweisen. | **in Arbeit** |
| BL-012.3 | Vertagte Entscheidungen sicher und ohne neue Auswahl fortsetzen. | **in Arbeit** |
| BL-012.5 | Tastatur, Skalierung und Screenreader auf Windows und macOS abnehmen; Linux folgt später. | **in Arbeit** |
| BL-012.6 | **E0 abgeschlossen; E2 offen:** Anwenderstatus und genau eine nächste sichere Aktion sind vereinheitlicht; beschädigte Checkpoints bleiben fail-closed. | **in Arbeit** |
| BL-012.7 | **E0 abgeschlossen; E2 offen:** Kurzer Picker-/Ergebnisweg, gleichnamige Quellen über opake IDs und Fortsetzung ohne Neuauswahl sind technisch regressionsgetestet; verständlich abnehmen. | **in Arbeit** |
| BL-031.1 | **E0 P0-Kontextbefund einschließlich angrenzender Rollenpräfix-Lücke mit RC43 abgeschlossen:** Fundstellen gruppiert und lokal im Stapel entscheiden. | **in Arbeit** |
| BL-032.1 | Mehrdeutigkeitsdialog plattformgleich liefern. | **in Arbeit** |
| BL-041.1 | **E0 abgeschlossen; E1 offen:** Beide Skillstarts verwenden denselben Picker-/Jobvertrag; in echter Claude-UI beobachten. | **in Arbeit** |
| BL-041.2 | Ursprüngliche Claude-Aufgabe begrenzt und fortsetzbar weiterführen. | **in Arbeit** |
| BL-041.3 | **E0 abgeschlossen; E1 offen:** Skill-/Hostvertrag lehnt hochgeladene Originale ab und erklärt nur den lokalen Pickerweg; echte UI abnehmen. | **in Arbeit** |

## Cowork Fast Path – schlank, lokal und messbar

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-041.6 | **E0 abgeschlossen; E1 offen:** Reine Anonymisierung endet als `local_only` ohne Ergebnislesen, Bestätigen oder Polling durch Claude und zeigt lokal genau eine terminale Zählerübersicht ohne Dokumentdaten. | **in Arbeit** |
| BL-041.7 | **E0 abgeschlossen; E1 offen:** Normale Cowork-Fassade umfasst 8 von insgesamt 25 Werkzeugen; Skill/Handbuch/Manifest werden gegen Drift geprüft. Handoff dekodiert einmalig und begrenzt, hält Kennungen lokal und verwirft Fehler fail-closed. Reale Berechtigungszahl und Fresh-Install-Sichtbarkeit bleiben offen. | **in Arbeit** |
| BL-041.8 | **E0 abgeschlossen; E1 offen:** MCP-Tasks/-Benachrichtigungen versionsgebunden prüfen; ohne Hostnachweis kein Produktpfad und kein Polling. | **in Arbeit** |
| BL-050.3 | **E0-Metrik- und Durability-Grundlage abgeschlossen; E1 offen:** Inhaltsfreie Messung nutzt echte TXT-/CSV-/DOCX-Pfade, monotone Uhr, Kalt/Warm, 1/10/100, p50/p95, Gesamtzeit, CPU, Peak-RAM, nicht zugeordnete Laufzeit und relative Regressionstore. Der plattformneutrale Fsync-Vertrag zählt Datei- und POSIX-Verzeichnis-Fsync getrennt; eine gezielte Rename-Fehlerinjektion belegt, dass ein verlorener non-durable Zwischenmarker den letzten durable Zustand und die statusbasierte Recovery nicht gefährdet. Zielhardware und reale Power-Loss-/Dateisystemevidenz bleiben E1. | **in Arbeit** |
| BL-011.10 | **E0 abgeschlossen; E1 offen:** Intake läuft nach Auswahl lokal im Hintergrund; Cowork antwortet ohne Quellmetadaten. Ein belegter Exit-vor-IPC-Race wird durch ein kurzes lokales Drain-Fenster abgefangen, damit ein bereits erfolgreicher Stapel nicht fälschlich als gestoppt erscheint. Reale Antwortzeit und Drei-OS-Abnahme bleiben offen. | **in Arbeit** |
| BL-011.11 | **E0 abgeschlossen; E1 offen:** Gemischtes Resume, feste I/O-Phasen, einmalige begrenzte Handoff-Dekodierung, Indexfenster und Buffer-Wipe sind regressionsgetestet, ohne Snapshot-/Swap-/Container-Gates zu lockern. Weitere I/O-Optimierung wartet auf reale Dateisystemmessung. | **in Arbeit** |
| BL-011.12 | **E0 abgeschlossen; E1 offen:** Ein nicht importierter Zwei-Worker-Harness prüft zentrale Reihenfolge/Commit, Slots, geschlossene Nachrichten, Crash, ungewissen Commit und Ressourcenstopps; Produktstandard bleibt seriell bis zur Windows-/macOS-Abnahme. Linux folgt später. | **in Arbeit** |
| BL-011.13 | **R4a-E0 abgeschlossen; R4b/E1/E3 offen:** Eine noch nicht produktiv verdrahtete create-once-Fassade liefert AES-256-GCM, versioniertes Envelope, zwingenden transaktionalen synchronen Secret-Store, Zweck-/Objekt-/Generationsbindung, Replay-Sperre, linkfreie private Root-Ahnen-/Parent-/Inode-Bindung, atomare Create-if-absent-Hardlink-Publikation und feste Negativpfade. Rotation/Migration/Recovery, verschlüsselte Snapshot-/Review-/Parserintegration, reale DPAPI/Keychain- und Dateisystemevidenz sowie Security-Abnahme bleiben offen. | **in Arbeit** |
| BL-024.4 | **E0 abgeschlossen; E1/E3 offen:** Der nicht importierte OCR-Session-Harness prüft geschlossenes Framing, Requestbindung, Replay, Single-Flight, Pixel-/Byte-/Zeitbudgets und Abbruch. Der sichere Einbild-Worker bleibt aktiv, bis native Per-Frame-Grenzen und Windows-/macOS-Evidenz vorliegen. Linux folgt später. | **in Arbeit** |
| BL-041.9 | Review ohne menschlichen Timeout und Abschluss ohne blockierenden Cowork-Aufruf liefern; pausierte Stapel bleiben getrennt startbar. | **in Arbeit** |

## Neue Zielpakete aus dem Produktreview

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-044.1 | Rekursive lokale Ordnerauswahl mit vollständiger Vorabvalidierung, stabiler relativer Zuordnung und ohne Linkverfolgung liefern. | **offen** |
| BL-047.1 | Adaptive kleine Parallelität, 25%-/2-GiB-Speicherbudget und 2-s-/10-s-/10%-Performancegates implementieren und synthetisch messen. | **offen** |
| BL-049.1 | **E0 einschließlich RC63-Ergebnisprojektion abgeschlossen; E1/E3 offen:** Der descriptor- und identitätsgebundene Source-Preflight plant den vollständigen Mehrfachstapel mutationsfrei. TXT/Markdown/CSV/DOCX-Kandidaten werden erst danach kopiert; Mismatches, ungültiger Text, gesperrte Formate, beschädigte/polyglotte Container, aktive Inhalte, verschlüsselte ZIP-Einträge und CFB/OLE werden pro Datei vor jeder privaten Kopie journalisiert. Der Reststapel läuft weiter. OOXML durchläuft vorher eine begrenzte CRC-Prüfung aller Einträge sowie echte OPC-Steuerteil- und Relationship-Prüfung; ein SHA-256-Vergleich bindet die positive Prüfung an exakt die Snapshot-Bytes. V3-Pakete, V2-Journal/Mapping, Evidence v3 und Audit-Receipt v4 binden die drei DS-045-Grade crashsicher. RC63 projiziert paketverifizierte Grade und die zwei erlaubten Auslassungsarten in terminalen Progress, bestehende Abschlussanzeige, Results und den tokenfreien Cowork-Handoff. Laufende Zustände und Altbestände bleiben ausdrücklich `unavailable`; Acknowledgements erzeugen keinen zweiten Dialog. Verbleiben: reale Windows-/macOS-Cowork-, Accessibility- und Security-Abnahme E1/E3. | **in Arbeit** |
| BL-042.3 | Inhaltsfreie MCP-App als progressive Verbesserung sowie vollständigen Text-/OS-Fallback, Deutsch/Englisch und A11y-Gates liefern. | **offen** |

## Danach: Content-Gates und gesperrte Formate

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-020.1 | Gemeinsamen Content-Graph und Locatorvertrag vollständig nachweisen. | **in Arbeit** |
| BL-020.2 | Rekursive Einbettungen und aktive Inhalte vollständig absichern. | **in Arbeit** |
| BL-020.3 | Netzwerkfreiheit als eigenes Gate auf Zielplattformen beweisen. | **in Arbeit** |
| BL-021.1 | TXT/Markdown praktisch auf Windows und macOS freigeben; Linux-Evidenz folgt mit BL-010.4. | **in Arbeit** |
| BL-021.2 | CSV praktisch auf Windows und macOS freigeben; Linux-Evidenz folgt mit BL-010.4. | **in Arbeit** |
| BL-022.1 | DOCX-Interoperabilität und vollständige Story-Coverage schließen. | **in Arbeit** |
| BL-022.2 | XLSX erst nach vollständiger Coverage freigeben. | **offen** |
| BL-022.3 | PPTX erst nach vollständiger Coverage freigeben. | **offen** |
| BL-023.1 | PDF-/OCR-Risikogate als NO-GO weiterführen, bis alle Pflichtzellen erfüllt sind. | **in Arbeit** |
| BL-023.2 | Text-PDFs nur nach vollständiger Sicherheitscoverage freigeben. | **offen** |
| BL-023.3 | PDF-Formulare, Annotationen, Anhänge und Verschlüsselung absichern. | **offen** |
| BL-023.4 | Scan-PDFs und visuelle Coverage freigeben. | **offen** |
| BL-024.2 | Gebündelte OCR-Backends zunächst für Windows und macOS liefern; Linux folgt mit BL-010.4. | **in Arbeit** |
| BL-024.3 | PNG, JPEG und BMP nach OCR-Coverage freigeben. | **offen** |

## Distribution, Qualität und externe Abnahme

| Story | Ziel / nächster prüfbarer Abschluss | Status |
|---|---|---|
| BL-010.1 | Betriebssystemneutralen Plugin-Startvertrag komplett beweisen. | **in Arbeit** |
| BL-010.2 | Windows-Paket liefern. | **offen** |
| BL-010.3 | macOS-Paket liefern. | **offen** |
| BL-010.4 | Nach dem Windows-/macOS-Erstrelease ein Linux-Paket mit eigener Hostevidenz liefern. | **offen** |
| BL-010.6 | Versionsarchiv und Rückrolle testen. | **offen** |
| BL-051.1 | Frische ZIP-Installation auf Windows x64 und macOS Intel/ARM abnehmen. | **offen** |
| BL-051.2 | Marketplace-Installation auf Windows x64 und macOS Intel/ARM abnehmen. | **offen** |
| BL-051.3 | 100-Dateien-/500-MB-End-to-End-Abnahme durchführen. | **offen** |
| BL-051.4 | Rückrolle auf Windows x64 und macOS Intel/ARM abnehmen. | **offen** |
| BL-052.1 | Beobachtete Anwenderabnahme durchführen. | **offen** |
| BL-052.2 | IT-/Health-IT-Fachabnahme durchführen. | **offen** |
| BL-052.3 | Datenschutzabnahme mit synthetischen Daten durchführen. | **offen** |
| BL-052.4 | Gebrauchstauglichkeit mit beobachteten Nutzenden abnehmen. | **offen** |
| BL-052.5 | Zielarchitektur und lokale Sicherheitsgrenze vor dem breiten Rollout durch Architektur und Security freigeben. | **offen** |

## Epic-Index

Die folgenden stabilen Epics binden Entscheidungen, Ist-Abgleich und Open-Source-
Register. Geschlossene Epics BL-001, BL-002 und BL-040 stehen nur noch im Archiv.

### BL-010 – Plattform und Distribution
### BL-003 – Product Vision und Dokumentenkanon (archiviert)
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
### BL-032 – Mehrdeutigkeit
### BL-040 – Lokaler Export und Nachweis (archiviert)
### BL-041 – Claude-Übergabe
### BL-043 – Cowork-Fast-Path
### BL-044 – Sichere Datei- und Ordnerquellen
### BL-047 – Performance und Ressourcensteuerung
### BL-049 – Inhalts- und Formatgrenze
### BL-042 – Diagnose und Berechtigungen
### BL-050 – Korpus und Qualitätsmetriken
### BL-051 – Installations- und Hostabnahme
### BL-052 – Menschliche Abnahme
