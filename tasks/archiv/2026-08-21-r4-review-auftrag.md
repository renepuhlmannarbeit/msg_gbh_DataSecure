# Aktueller Arbeitsauftrag für Claude — R4-Review

## Ausgangspunkt

Reviewe Commit `908600c` (`feat(privacy): enforce local retention and purge`)
auf `main`. Der zugehörige Auftrag liegt unverändert unter
`tasks/archiv/2026-08-21-r4-retention.md`.

Der Stand vor dem Review:

- Version `3.2.0-rc4`
- `npm test`: 212 Prüffälle plus Plugin-Strukturcheck, grün
- `npm run build`: Plugin-ZIP und MCPB werden erzeugt
- Golden-File `tests/expected/synthetic-personnel-profile.expected.md`
  gegenüber dem Vorgänger unverändert

## Auftrag

Führe ein unabhängiges, adversariales Code-Review der R4-Änderung durch. Suche
nach echten Sicherheits-, Datenschutz-, Datenverlust- und Korrektheitsfehlern.
Prüfe nicht nur, ob die neuen Tests grün sind, sondern ob sie die Zusagen des
archivierten Auftrags tatsächlich beweisen.

### 1. Löschgrenzen und Windows-Sicherheit

Prüfe insbesondere `plugins/data-secure/server/gateway/retention.js`:

- Kann `Processed`, `Output` oder `Needs Visual Review` über Symlinks,
  Junctions, Reparse Points, Pfadnormalisierung oder manipulierte Dateinamen
  verlassen werden?
- Werden alle Ziele vollständig geprüft, bevor der erste Löschschritt erfolgt?
- Bleiben versteckte Staging-Verzeichnisse und laufende Jobs garantiert
  unangetastet?
- Ist partielles Löschen bei einer gesperrten Datei sicher und im Status
  nachvollziehbar?
- Funktionieren Datei- und Verzeichnisfälle auf Windows sowie in Linux-CI ohne
  gefährliche Plattformannahmen?

Fehlerrichtung: Lieber einen Eintrag stehen lassen und einen Fehler melden, als
einen nicht eindeutig erlaubten Pfad zu löschen.

### 2. Ablaufsemantik und Lebenszyklus

Prüfe den Aufruf in `gateway/orchestrator.js` und beim Serverstart in
`server/index.js`:

- Läuft Cleanup wirklich bei jedem Serverstart und vor jedem
  `anonymizeNext()`?
- Ist `retention_days=0` korrekt: Original und Review-Preview nach erfolgreichem
  Commit weg, das neu erzeugte Paket für die aktuelle Antwort noch lesbar?
- Kann ein laufendes oder gerade veröffentlichtes Paket versehentlich gelöscht
  werden?
- Sind mtime, Grenzwert (`<=`), ungültige Konfigurationswerte und Uhrzeitbezug
  sinnvoll und deterministisch behandelt?
- Bleibt eine Löschstörung stets Nebenfehler, ohne die Verarbeitung
  abzubrechen oder einen falschen Erfolg zu behaupten?

### 3. Review-Previews und Nachweise

Prüfe `gateway/review.js` und die Review-Bereinigung:

- Verschwindet die Preview nach Freigabe wirklich, während `.review.json` und
  das freigegebene Paket-Asset konsistent und lesbar bleiben?
- Was passiert bei Fehlern zwischen Kopieren, Manifest-Änderung,
  Markdown-Änderung, Preview-Löschung und Schreiben des Review-Nachweises?
- Werden abgelaufene, noch offene Review-Previews fail-closed entfernt, ohne
  Paketmanifest oder Nachweis unbrauchbar zu machen?
- Gibt es einen behaupteten „Verwerfen“-Pfad, den der Code gar nicht anbietet?

### 4. MCP-Oberfläche, Status und Konfiguration

Prüfe `purge_local_data`, `privacy_status`, `manifest.json` und `.mcp.json`:

- exakt 12 Tools und Manifest-/Runtime-Parität
- `confirmed` muss ausschließlich das Boolean `true` akzeptieren
- Scope muss strikt `processed|output|review|all` bleiben
- Audit darf durch keinen Scope gelöscht werden
- Status muss Fenster, fällige Einträge und Löschfehler korrekt und ohne
  Rohdaten offenlegen
- `retention_days` muss als MCPB-`user_config` korrekt verdrahtet sein

### 5. Tests und Regressionen

Führe mindestens aus:

```bash
npm test
npm run build
git diff 31379c0..908600c -- tests/expected/synthetic-personnel-profile.expected.md
```

Ergänze für die Untersuchung gern temporäre oder neue Reproduktionstests, aber
ändere im Review-Schritt keine Produktivlogik. Kein Test darf auf reale Zeit
warten. Prüfe besonders Lücken bei Serverstart-Cleanup, manipulierten
Review-Verzeichnissen, Löschfehlern nach Teilerfolg und Null-Tage-Verhalten.

## Ergebnisformat

1. Findings zuerst, nach `P0` bis `P3` sortiert.
2. Jedes Finding nennt Datei und enge Zeilenstelle, konkrete Reproduktion,
   Ist-Verhalten, Soll-Verhalten und die fehlende Absicherung.
3. Keine allgemeinen Stilhinweise ohne messbare Auswirkung.
4. Wenn es keine Findings gibt, ausdrücklich „keine Findings“ schreiben und
   verbleibende manuelle Risiken getrennt nennen.
5. Bei Findings: Ersetze diese Datei anschließend durch einen präzisen
   Folgeauftrag für Codex und archiviere diesen Review-Auftrag datiert unter
   `tasks/archiv/`. Implementiere die Fixes nicht selbst.
6. Ohne Findings: Setze `tasks/AUFTRAG.md` wieder auf „Derzeit kein offener
   Auftrag“ und archiviere diesen Review-Auftrag ebenfalls.

## Nicht Teil dieses Reviews

- Windows-OCR- oder EMF/WMF-Abnahme ohne passende Zielmaschine
- Entscheidung über den `LICENSE`-Platzhalter
- Verschlüsselung der lokalen Ordner
- neue PII-Detektoren oder Änderungen am Golden-Output
- Versionsanhebung über `3.2.0-rc4` hinaus
