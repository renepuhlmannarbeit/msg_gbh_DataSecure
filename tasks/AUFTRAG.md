# Aktueller Arbeitsauftrag

**Derzeit kein offener Auftrag.** Abgeschlossene Aufträge und Berichte liegen
datiert in `tasks/archiv/`, die Konvention steht in `tasks/README.md`.

Stand: `3.2.0-rc6`, 221 Prüffälle plus Plugin-Strukturcheck, CI grün auf
`ubuntu-latest` und `windows-latest`, Golden-File seit rc2 unverändert.

Die Runde R4 ist abgeschlossen. Der Ablauf war: Auftrag → Umsetzung →
Gegenreview → Nacharbeit → Gegenreview. Jede Stufe hat Fehler der vorigen
gefunden, die letzte keine mehr. Nachgeprüft habe ich `242a57a` unabhängig mit
13 eigenen Fällen, alle grün — insbesondere die Fehlercode-Whitelist, die
Unterscheidung von `ENOENT` und Prüfzugriffsfehler, die Mehrfachnachweise und
die getrennten Zähleinheiten.

## Offener Rückstand

Kein Codefehler, aber vor dem Pilot fällig:

- **Windows-Abnahme.** OCR gegen ein echtes Scan-Dokument und
  EMF/WMF-Rasterisierung über die PowerShell-Bridge lassen sich in CI nicht
  prüfen. Checkliste in `docs/RELEASE.md`. Erster Punkt dort: Installation auf
  einem Rechner **ohne** Node, dann `privacy_status` — davon hängt ab, welcher
  Rollout-Weg möglich ist.
- **`LICENSE`.** Platzhalter, im Text als ungeprüft markiert, wartet auf die
  juristische Prüfung.
