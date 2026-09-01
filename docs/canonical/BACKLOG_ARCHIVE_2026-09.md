# Backlog-Archiv – September 2026

Stand: 01.09.2026. Abgeschlossene E0-Teilschnitte; offene Cowork-, Runtime- und
Zielsystemevidenz bleibt im aktiven Backlog.

## RC84: Defect- und Claude-Vertragsschnitt

| Abgeschlossener E0-Schnitt | Storybezug | Nachweis |
|---|---|---|
| Personen-/Unicode-Erkennung und Fachinhaltserhalt | BL-031.1, BL-050 | PII-Regressionssuite einschließlich Komma, Initial, Partikel, CJK, Bidi und IT-/Health-IT-Fachbegriffen |
| Handoff-Race, Ablauf und große Snapshot-Serialisierung | BL-011.3, BL-041.7, BL-050.3 | parallele Seiten abgewiesen, abgelaufene Session geräumt, fünf große Ergebnisse innerhalb 64-MiB-Snapshotbudget ohne wiederholte Vollscans |
| Review-Junction, Manifest-Unsicherheit und Legacy-Autorisierung | BL-011.8, BL-011.13 | vorbestehender und während des Schreibens eingesetzter Junction abgewiesen; nach erfolgreichem Manifest-Rename bleibt Asset gebunden; Review-Metadaten bleiben unveränderlich und historisches `approved=true` kann eine fehlende Manifestfreigabe weder verstecken noch ersetzen |
| Claude-/Cowork-Dokumentationsvertrag | BL-010.7, BL-010.8, BL-041.7, BL-051.1, BL-051.5, BL-051.6 | DS-066, Zielarchitektur, Skills, README, Buildinfo und 45-MiB-ZIP-Budget aktualisiert; CLI-Validator 2.1.233 lokal PASS, aktueller Host-/Syncnachweis ausdrücklich offen |
| Kanon-, README-, UAT- und Testkonsolidierung | BL-001, BL-002, BL-003 | aktuelle Produktwahrheit in Kanon und abgeleiteten Dokumenten; ältere RC-Aufträge, Reviews, Backlogs und Testjournale als historisch klassifiziert; versionneutrales UAT-Kit mit Klartextnamen/Links; Dokument-, Link-, Capability- und Cowork-Verträge aktualisiert; `npm run test:docs`, `npm run test:ci` und Produktbuild PASS |

Keine echte Cowork-/Fresh-Install-/macOS-/Linux-Freigabe daraus abgeleitet.
